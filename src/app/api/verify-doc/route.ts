import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import pdfParse from 'pdf-parse';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set.');
}

// Helper to extract text from PDF using pdf-parse
async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const data = await pdfParse(buffer);
  return data.text;
}

// Helper to convert image file to base64
async function imageFileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString('base64');
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const expectedType = formData.get('expectedType') as string | null;
    if (!file || !expectedType) {
      return NextResponse.json({ error: 'Missing file or expectedType' }, { status: 400 });
    }

    let prompt = '';
    let fileType = file.type;
    let fileName = file.name || '';
    let pdfText = '';
    let base64Image = '';

    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      // PDF: extract text
      pdfText = await extractTextFromPDF(file);
      prompt = `You are a DMV document verification agent. The user has uploaded a PDF. The expected document type is: "${expectedType}". Here is the extracted text from the PDF:\n\n${pdfText}\n\nDoes this document match the expected type? Reply with YES or NO and a short reasoning.`;
    } else if (
      fileType === 'image/png' || fileType === 'image/jpeg' || fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')
    ) {
      // Image: convert to base64
      base64Image = await imageFileToBase64(file);
      prompt = `You are a DMV document verification agent. The user has uploaded an image file (base64-encoded below). The expected document type is: "${expectedType}". Here is the base64 string of the image:\n\n${base64Image}\n\nWhat type of document is this? Does it match the expected type? Reply with YES or NO and a short reasoning.`;
    } else {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

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
    console.error('Verify-doc error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 