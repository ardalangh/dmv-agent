import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { DOMMatrix } from 'canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createClient } from '@supabase/supabase-js';
import { log } from 'console';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is not set.');
}

if (typeof global.DOMMatrix === 'undefined') {
  // @ts-ignore
  global.DOMMatrix = DOMMatrix;
}

// Helper to extract text from PDF using pdfjs-dist
async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const loadingTask = getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return text;
  } catch (err) {
    console.error('Error extracting text from PDF:', err);
    throw err;
  }
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
    const sessionIdRaw = formData.get('session_id');
    const sessionId = sessionIdRaw ? Number(sessionIdRaw) : null;
    if (!file || !expectedType) {
      console.error('Missing file or expectedType', { file, expectedType });
      return NextResponse.json({ error: 'Missing file or expectedType' }, { status: 400 });
    }

    let prompt = '';
    let fileType = file.type;
    let fileName = file.name || '';
    let pdfText = '';
    let base64Image = '';
    let openaiRequestBody;
    let openaiModel = 'gpt-3.5-turbo';

    console.log('Received file:', { fileType, fileName });

    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      // PDF: extract text
      try {
        pdfText = await extractTextFromPDF(file);
        prompt = `You are a DMV document verification agent. The user has uploaded a PDF. The expected document type is: "${expectedType}". Here is the extracted text from the PDF:\n\n${pdfText}\n\nDoes this document match the expected type? Reply with YES or NO and a short reasoning.`;
        openaiRequestBody = {
          model: openaiModel,
          messages: [
            { role: 'system', content: 'You are a DMV document verification agent.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 256,
        };
      } catch (err) {
        console.error('Failed to extract text from PDF:', err);
        return NextResponse.json({ error: 'Failed to extract text from PDF' }, { status: 500 });
      }
    } else if (
      fileType === 'image/png' || fileType === 'image/jpeg' || fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')
    ) {
      // Image: convert to base64 and use vision model
      try {
        base64Image = await imageFileToBase64(file);
        openaiModel = 'gpt-4o';
        openaiRequestBody = {
          model: openaiModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: `The expected document type is: "${expectedType}". What type of document is this? Does it match the expected type? Reply with YES or NO and a short reasoning.` },
                { type: 'image_url', image_url: { url: `data:${fileType};base64,${base64Image}` } },
              ],
            },
          ],
          max_tokens: 256,
        };
      } catch (err) {
        console.error('Failed to convert image to base64:', err);
        return NextResponse.json({ error: 'Failed to process image file' }, { status: 500 });
      }
    } else {
      console.error('Unsupported file type', { fileType, fileName });
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }



  

    const openaiRes = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(openaiRequestBody),
    });
    if (!openaiRes.ok) {
      console.error('OpenAI API error', { status: openaiRes.status, statusText: openaiRes.statusText });
      return NextResponse.json({ error: 'OpenAI API error' }, { status: 500 });
    }

    
    const data = await openaiRes.json();
    const reply = data.choices?.[0]?.message?.content || '';

    console.log('reply',sessionId);

    // If verified, update user_verrified_docs in chat_sessions
    if (/\bYES\b/i.test(reply) && sessionId) {
      const docInfo = {
        type: expectedType,
        fileName,
        verifiedAt: new Date().toISOString(),
      };
      // Fetch current verified docs
      console.log('fetching verified docs');
      console.log('sessionId', sessionId);  
      const { data: current, error: fetchError } = await supabase
        .from('chat_sessions')
        .select('user_verrified_docs')
        .eq('id', sessionId)
        .single();
      let updatedDocs = [];
      console.log('current', current);
      if (current?.user_verrified_docs) {
        updatedDocs = Array.isArray(current.user_verrified_docs)
          ? current.user_verrified_docs
          : [];
      }
      console.log('updatedDocs', updatedDocs);
      updatedDocs.push(docInfo);
      // Update the row
      console.log('updating verified docs');
      const { error } = await supabase
        .from('chat_sessions')
        .update({ user_verrified_docs: updatedDocs })
        .eq('id', sessionId);
      console.log('error', error);
      if (error) {
        console.error('Failed to update verified docs:', error);
      }
    } else {
      console.log('no verified docs');
    }

    return NextResponse.json({ result: reply });
  } catch (error) {
    console.error('Verify-doc error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
} 