import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

// Types
interface TicketRequest {
  state: string;
  service: string;
  providedDocs: string[];
}

interface TicketResponse {
  category: string;
  status: 'complete' | 'incomplete';
  missingDocs: string[];
  ticketType: string;
}

// Helper to load JSON data
async function loadJson(filePath: string) {
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as TicketRequest;
    const { state, service, providedDocs } = body;

    // Load required docs
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

    const response: TicketResponse = {
      category,
      status,
      missingDocs,
      ticketType,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request or server error.' }, { status: 400 });
  }
} 