import { Agent, run } from '@openai/agents';
import { NextRequest, NextResponse } from 'next/server';
import {
  checkDMVTicketTool,
  storeUserIntentTool,
  storeUserIntentExecute,
  loadAllDMVServices,
} from './tools';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set.');
}

const agent = new Agent({
  name: 'DMV Agent',
  instructions: `You are a helpful DMV agent. Gather the user's state, the DMV service they want (including REAL ID or REAL ID-compliant license), and the documents they have. When you have all three, call the checkDMVTicket tool. Reply with the ticket result, including missing documents if any. Use the storeUserIntent tool to save or update the user's intent per chat session in Supabase. If the user expresses an intent to get a REAL ID or REAL ID-compliant license, treat it as a DMV service and call storeUserIntent immediately with their intent and session ID, even if other details are missing.`,
  tools: [checkDMVTicketTool, storeUserIntentTool],
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const { messages, sessionId } = JSON.parse(rawBody);
    if (!messages || !Array.isArray(messages) || !sessionId) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const userPrompt = messages.map((m: any) => m.content).join('\n');
    const result = await run(agent, userPrompt);
    // General fallback: if user message matches any DMV service, store intent
    const userMessage = messages.find((m: any) => m.role === 'user')?.content || '';
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