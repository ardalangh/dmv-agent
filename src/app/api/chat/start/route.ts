import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../tools';

export async function POST(req: NextRequest) {
  try {
    const { intent } = await req.json();
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