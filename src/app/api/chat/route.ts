import { Agent, run, tool } from '@openai/agents';
import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set.');
}

// Helper to load JSON data
async function loadJson(filePath: string) {
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

// DMV logic: extract info and check docs
async function checkDMVTicket(state: string, service: string, providedDocs: string[]) {
  const requiredDocsPath = path.join(process.cwd(), 'data', 'required_docs.json');
  const jobsPath = path.join(process.cwd(), 'data', 'dmv_jobs.json');
  const requiredDocsData = await loadJson(requiredDocsPath);
  const jobsData = await loadJson(jobsPath);

  const requiredDocs: string[] = requiredDocsData[state]?.[service] || [];
  const missingDocs = requiredDocs.filter(doc => !providedDocs.includes(doc));

  // Find ticket type and category
  let ticketType = '';
  let category = '';
  for (const [type, info] of Object.entries(jobsData)) {
    if ((info as any).services.includes(service)) {
      ticketType = type;
      category = (info as any).category;
      break;
    }
  }

  const status: 'complete' | 'incomplete' = missingDocs.length === 0 ? 'complete' : 'incomplete';

  return {
    category,
    status,
    missingDocs,
    ticketType,
  };
}

// Register DMV checker as a tool
const checkDMVTicketTool = tool({
  name: 'checkDMVTicket',
  description: 'Checks DMV ticket requirements and status based on state, service, and provided documents.',
  parameters: {
    type: 'object',
    properties: {
      state: { type: 'string', description: 'The state abbreviation (e.g., CA, NY, TX)' },
      service: { type: 'string', description: 'The DMV service requested' },
      providedDocs: { type: 'array', items: { type: 'string' }, description: 'List of provided documents' },
    },
    required: ['state', 'service', 'providedDocs'],
    additionalProperties: false,
  },
  execute: async (input: any) => {
    console.log('Calling tool: checkDMVTicket');
    console.log('[Tool Call] checkDMVTicket', input);
    const { state, service, providedDocs } = input;
    return await checkDMVTicket(state, service, providedDocs);
  },
});

// Tool to store or update user intent in Supabase
async function storeUserIntentExecute(input: { sessionId: string; intent: string }) {
  console.log('Calling tool: storeUserIntent');
  console.log('[Tool Call] storeUserIntent', input);
  const { sessionId, intent } = input;
  // Update the user_intent for the given sessionId
  const { error, data } = await supabase
    .from('chat_sessions')
    .update({ user_intent: intent })
    .eq('id', sessionId)
    .select('id');
  if (error) {
    console.error('Supabase update error:', error);
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error('No chat session found with the provided sessionId.');
  }
  return { success: true };
}

// Only register the tool for the agent, not for direct use
const storeUserIntentTool = tool({
  name: 'storeUserIntent',
  description: 'Stores or updates the user\'s DMV intent (what they want to do) per chat session in Supabase.',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Unique session identifier for the chat session.' },
      intent: { type: 'string', description: 'The user\'s intent or what they want to do at the DMV.' },
    },
    required: ['sessionId', 'intent'],
    additionalProperties: false,
  },
  execute: storeUserIntentExecute,
  strict: false,
});

const agent = new Agent({
  name: 'DMV Agent',
  instructions: `You are a helpful DMV agent. Gather the user's state, the DMV service they want (including REAL ID or REAL ID-compliant license), and the documents they have. When you have all three, call the checkDMVTicket tool. Reply with the ticket result, including missing documents if any. Use the storeUserIntent tool to save or update the user's intent per chat session in Supabase. If the user expresses an intent to get a REAL ID or REAL ID-compliant license, treat it as a DMV service and call storeUserIntent immediately with their intent and session ID, even if other details are missing.`,
  tools: [checkDMVTicketTool, storeUserIntentTool],
});

// Simple info extraction from chat (for demo; can be improved with LLM function calling)
function extractInfo(messages: { role: string; content: string }[]) {
  let state = '';
  let service = '';
  let providedDocs: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      // crude extraction
      if (!state) {
        const match = msg.content.match(/\b(CA|NY|TX|California|New York|Texas)\b/i);
        if (match) {
          if (/CA|California/i.test(match[0])) state = 'CA';
          if (/NY|New York/i.test(match[0])) state = 'NY';
          if (/TX|Texas/i.test(match[0])) state = 'TX';
        }
      }
      if (!service) {
        // match a known service, including REAL ID
        const services = [
          'Apply for a new standard driver license',
          'Renew driver license or CDL',
          'Obtain a REAL ID-compliant license',
        ];
        for (const s of services) {
          if (msg.content.toLowerCase().includes(s.toLowerCase())) {
            service = s;
            break;
          }
        }
        // map common user phrasing for real id
        if (!service && /real id/.test(msg.content.toLowerCase())) {
          service = 'Obtain a REAL ID-compliant license';
        }
      }
      // crude doc extraction
      if (msg.content.toLowerCase().includes('documents:')) {
        const docsLine = msg.content.split('documents:')[1];
        if (docsLine) {
          providedDocs = docsLine.split(',').map(d => d.trim()).filter(Boolean);
        }
      }
    }
  }
  return { state, service, providedDocs };
}

// Helper to load all DMV services
let allDMVServices: string[] = [];
async function loadAllDMVServices() {
  if (allDMVServices.length > 0) return allDMVServices;
  const jobsPath = path.join(process.cwd(), 'data', 'dmv_jobs.json');
  const jobsData = await loadJson(jobsPath);
  allDMVServices = Object.values(jobsData).flatMap((info: any) => info.services);
  return allDMVServices;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    
    const { messages } = JSON.parse(rawBody);
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Convert messages to a single prompt string (or adapt as needed)
    const userPrompt = messages.map(m => m.content).join('\n');

    const result = await run(agent, userPrompt);

    // General fallback: if user message matches any DMV service, store intent
    const userMessage = messages.find(m => m.role === 'user')?.content || '';
    const dmvServices = await loadAllDMVServices();
    const matchedService = dmvServices.find(service =>
      userMessage.toLowerCase().includes(service.toLowerCase())
    );
    if (matchedService) {
      
      
      const intent = userMessage;
      await storeUserIntentExecute({ sessionId, intent });
    }

    return NextResponse.json({ reply: result.finalOutput });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Server error' }, { status: 500 });
  }
}

// New endpoint: /api/chat/start
export async function startChatSession(req: NextRequest) {
  try {
    const { intent } = await req.json();
    // Create a new session with the provided intent (or empty string if not provided)
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert([{ user_intent: intent || '' }])
      .select('id')
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ sessionId: data.id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Server error' }, { status: 500 });
  }
} 