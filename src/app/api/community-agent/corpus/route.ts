// src/app/api/community-agent/corpus/route.ts
//
// GET: Get corpus stats (vector count) for a pod
// POST: Upload documents (PDF, TXT, MD) to a pod's agent corpus
// DELETE: Remove documents from a pod's corpus
//
// Files are chunked, embedded, and upserted to Pinecone.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { createClient } from '@supabase/supabase-js';
import { getCorpusStats, uploadToAgentCorpus, deleteFromCorpus } from '@/services/communityAgent/corpusService';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const CHUNK_SIZE = 1200; // characters per chunk
const CHUNK_OVERLAP = 200;

/**
 * GET: Return corpus stats for a pod
 */
export async function GET(req: NextRequest) {
  const podId = req.nextUrl.searchParams.get('podId');
  if (!podId) {
    return NextResponse.json({ error: 'podId required' }, { status: 400 });
  }

  const stats = await getCorpusStats(podId);
  return NextResponse.json(stats);
}

/**
 * POST: Upload documents to the pod's corpus
 * Accepts multipart/form-data with 'files' and 'podId'
 */
export async function POST(req: NextRequest) {
  // Authenticate the caller
  const authHeader = req.headers.get('Authorization');
  const accessToken = authHeader?.replace('Bearer ', '');
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse form data
  const formData = await req.formData();
  const podId = formData.get('podId') as string;
  const files = formData.getAll('files') as File[];

  if (!podId) {
    return NextResponse.json({ error: 'podId required' }, { status: 400 });
  }

  if (!files || files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  // Verify caller is a pod leader
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('wallet_address')
    .eq('user_id', user.id)
    .single();

  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('pod_leads')
    .eq('id', podId)
    .single();

  const isLeader = pod?.pod_leads?.some(
    (lead: string) => lead.toLowerCase() === profile?.wallet_address?.toLowerCase(),
  );

  if (!isLeader) {
    return NextResponse.json({ error: 'Only pod leaders can upload corpus documents' }, { status: 403 });
  }

  // Verify agent module is enabled
  const { data: modules } = await supabaseAdmin
    .from('pod_modules')
    .select('community_agent_enabled')
    .eq('pod_id', podId)
    .single();

  if (!modules?.community_agent_enabled) {
    return NextResponse.json({ error: 'Community agent module is not enabled' }, { status: 400 });
  }

  const results: Array<{ fileName: string; chunks: number; status: string }> = [];

  for (const file of files) {
    try {
      if (file.size > MAX_FILE_SIZE) {
        results.push({ fileName: file.name, chunks: 0, status: 'too_large' });
        continue;
      }

      let text: string;

      if (file.name.endsWith('.pdf')) {
        // For PDFs, extract text using a simple approach
        text = await extractPdfText(file);
      } else {
        // TXT, MD — read as text
        text = await file.text();
      }

      if (!text || text.trim().length < 50) {
        results.push({ fileName: file.name, chunks: 0, status: 'too_short' });
        continue;
      }

      // Chunk the text
      const chunks = chunkText(text, file.name);

      // Upload to Pinecone
      const { upserted } = await uploadToAgentCorpus(podId, chunks);

      results.push({ fileName: file.name, chunks: upserted, status: 'ok' });
    } catch (err: any) {
      console.error(`[Corpus] Error processing ${file.name}:`, err.message);
      results.push({ fileName: file.name, chunks: 0, status: 'error' });
    }
  }

  const totalChunks = results.reduce((sum, r) => sum + r.chunks, 0);
  console.log(`[Corpus] Uploaded ${totalChunks} chunks across ${files.length} files for pod ${podId}`);

  return NextResponse.json({ success: true, totalChunks, results });
}

/**
 * DELETE: Remove documents from the corpus
 * Body: { podId, documentName? } — if no documentName, clears entire namespace
 */
export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const accessToken = authHeader?.replace('Bearer ', '');
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { podId, documentName } = body;

  if (!podId) {
    return NextResponse.json({ error: 'podId required' }, { status: 400 });
  }

  // Verify pod leader
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('wallet_address')
    .eq('user_id', user.id)
    .single();

  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('pod_leads')
    .eq('id', podId)
    .single();

  const isLeader = pod?.pod_leads?.some(
    (lead: string) => lead.toLowerCase() === profile?.wallet_address?.toLowerCase(),
  );

  if (!isLeader) {
    return NextResponse.json({ error: 'Only pod leaders can manage corpus' }, { status: 403 });
  }

  await deleteFromCorpus(podId, documentName ? { documentName } : undefined);

  return NextResponse.json({ success: true });
}

/**
 * Extract text from a PDF file.
 * Uses a lightweight approach — reads raw buffer and extracts text streams.
 */
async function extractPdfText(file: File): Promise<string> {
  try {
    // Try dynamic import of pdf-parse (if available)
    // @ts-ignore — pdf-parse may not have type declarations
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdfParse(buffer);
    return data.text;
  } catch {
    // Fallback: basic text extraction from PDF buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = buffer.toString('utf-8');
    // Extract readable text segments
    const segments = text.match(/[\x20-\x7E\n\r\t]{20,}/g) || [];
    return segments.join(' ');
  }
}

/**
 * Split text into overlapping chunks for embedding.
 */
function chunkText(
  text: string,
  documentName: string,
): Array<{ text: string; metadata: Record<string, any> }> {
  const chunks: Array<{ text: string; metadata: Record<string, any> }> = [];

  // Normalize whitespace
  const normalized = text.replace(/\s+/g, ' ').trim();

  for (let i = 0; i < normalized.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    const chunk = normalized.slice(i, i + CHUNK_SIZE).trim();
    if (chunk.length < 50) continue; // Skip tiny remnants

    chunks.push({
      text: chunk,
      metadata: {
        document_name: documentName,
        chunk_index: chunks.length,
        char_offset: i,
      },
    });
  }

  return chunks;
}
