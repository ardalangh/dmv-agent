import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { Agent, run, tool } from '@openai/agents';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
console.log(OPENAI_API_KEY);
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

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
    const { state, service, providedDocs } = input;
    return await checkDMVTicket(state, service, providedDocs);
  },
});

const agent = new Agent({
  name: 'DMV Agent',
  instructions: `You are a helpful DMV agent. Gather the user's state, the DMV service they want, and the documents they have. When you have all three, call the checkDMVTicket tool. Reply with the ticket result, including missing documents if any.`,
  tools: [checkDMVTicketTool],
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
        // match a known service
        const services = [
          'Apply for a new standard driver license',
          'Renew driver license or CDL',
        ];
        for (const s of services) {
          if (msg.content.toLowerCase().includes(s.toLowerCase())) {
            service = s;
            break;
          }
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

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    console.log('Raw request body:', rawBody);
    const { messages } = JSON.parse(rawBody);
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Convert messages to a single prompt string (or adapt as needed)
    const userPrompt = messages.map(m => m.content).join('\n');

    const result = await run(agent, userPrompt);

    return NextResponse.json({ reply: result.finalOutput });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Server error' }, { status: 500 });
  }
} 