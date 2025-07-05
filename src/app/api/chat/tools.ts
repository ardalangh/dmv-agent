import { tool } from '@openai/agents';
import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to load JSON data
export async function loadJson(filePath: string) {
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

// DMV logic: extract info and check docs
export async function checkDMVTicket(state: string, service: string, providedDocs: string[]) {
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

export const checkDMVTicketTool = tool({
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

export async function storeUserIntentExecute(input: { sessionId: string; intent: string }) {
  const { sessionId, intent } = input;
  const { error, data } = await supabase
    .from('chat_sessions')
    .update({ user_intent: intent })
    .eq('id', sessionId)
    .select('id');
  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error('No chat session found with the provided sessionId.');
  }
  return { success: true };
}

export const storeUserIntentTool = tool({
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
});

export async function loadAllDMVServices() {
  const jobsPath = path.join(process.cwd(), 'data', 'dmv_jobs.json');
  const jobsData = await loadJson(jobsPath);
  return Object.values(jobsData).flatMap((info: any) => info.services);
} 