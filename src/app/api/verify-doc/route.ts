import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set.');
}

// Helper to extract text from PDF (using pdf-parse or similar, but here we just read as buffer for now)
async function extractTextFromPDF(file: File): Promise<string> {
  // In a real implementation, use a PDF parsing library (e.g., pdf-parse)
  // For now, just return a placeholder
  return '[PDF content extraction not implemented in this demo]';
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const expectedType = formData.get('expectedType') as string | null;
    if (!file || !expectedType) {
      return NextResponse.json({ error: 'Missing file or expectedType' }, { status: 400 });
    }

    // Extract text from PDF (placeholder)
    const pdfText = await extractTextFromPDF(file);

    // Compose prompt for OpenAI
    const prompt = `You are a DMV document verification agent. The user has uploaded a PDF. The expected document type is: "${expectedType}". Here is the extracted text from the PDF:\n\n${pdfText}\n\nDoes this document match the expected type? Reply with YES or NO and a short reasoning.`;

    const openaiRes = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a DMV document verification agent.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 256,
      }),
    });
    if (!openaiRes.ok) {
      return NextResponse.json({ error: 'OpenAI API error' }, { status: 500 });
    }
    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content || '';
    return NextResponse.json({ result: reply });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 