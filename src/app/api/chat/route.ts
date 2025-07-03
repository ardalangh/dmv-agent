import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
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
    const { messages } = await req.json(); // messages: [{role: 'user'|'assistant', content: string}]
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Add system prompt
    const systemPrompt = {
      role: 'system',
      content: `You are a helpful DMV agent. Gather the user's state, the DMV service they want, and the documents they have. When you have all three, ask the user to type their documents as a comma-separated list after 'Documents:'. Then, reply with 'Checking your documents...' and stop.`,
    };
    const chatWithSystem = [systemPrompt, ...messages];

    // Try to extract info
    const { state, service, providedDocs } = extractInfo(messages);
    let dmvResult = null;
    if (state && service && providedDocs.length > 0) {
      dmvResult = await checkDMVTicket(state, service, providedDocs);
    }

    // If we have all info, reply with ticket result
    if (dmvResult) {
      let ticketMsg = `Here is your DMV ticket:\n\nCategory: ${dmvResult.category}\nTicket Type: ${dmvResult.ticketType}\nStatus: ${dmvResult.status}`;
      if (dmvResult.missingDocs.length > 0) {
        ticketMsg += `\nMissing Documents: ${dmvResult.missingDocs.join(', ')}`;
      }
      return NextResponse.json({ reply: ticketMsg });
    }

    // Otherwise, continue the chat with OpenAI
    const openaiRes = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: chatWithSystem,
        temperature: 0.2,
        max_tokens: 512,
      }),
    });

    if (!openaiRes.ok) {
      return NextResponse.json({ error: 'OpenAI API error' }, { status: 500 });
    }
    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content || '';
    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 