import { type NextRequest, NextResponse } from 'next/server';
import { isPodLeader } from '@/lib/serverPodAuth';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import JSZip from 'jszip';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';

async function getWalletFromToken(token: string): Promise<string | null> {
  try {
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}


function podIdFromRequest(req: NextRequest): string {
  const match = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/knowledge/);
  return match?.[1] ?? '';
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_');
}

/** Attempt to fetch file bytes from a public URL. Returns null on failure. */
async function tryDownloadFile(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

/** Guess a file extension from the URL path or content type. */
function guessExtension(url: string, contentType?: string): string {
  // Try to extract from URL path
  const urlPath = new URL(url).pathname;
  const match = urlPath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (match) return `.${match[1].toLowerCase()}`;

  // Fall back to content type
  if (contentType === 'document') return '.pdf';
  if (contentType === 'video') return '.mp4';
  return '';
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = await getWalletFromToken(token);
  if (!wallet) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const podId = podIdFromRequest(req);
  if (!podId) return NextResponse.json({ error: 'Missing pod ID' }, { status: 400 });

  const isLeader = await isPodLeader(podId, wallet);
  if (!isLeader) return NextResponse.json({ error: 'Forbidden: not a pod leader' }, { status: 403 });

  // Fetch pod name
  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('name')
    .eq('id', podId)
    .single();

  // Fetch categories
  const { data: categories } = await supabaseAdmin
    .from('knowledge_categories')
    .select('*')
    .eq('pod_id', podId)
    .order('sort_order', { ascending: true });

  // Fetch items
  const { data: items } = await supabaseAdmin
    .from('knowledge_items')
    .select('*')
    .eq('pod_id', podId)
    .order('sort_order', { ascending: true });

  // Build ZIP
  const zip = new JSZip();

  zip.file('categories.json', JSON.stringify(categories || [], null, 2));
  zip.file('items.json', JSON.stringify(items || [], null, 2));

  // Create a folder per category with inline content
  for (const cat of categories || []) {
    const catFolder = zip.folder(sanitizeFilename(cat.name));
    if (!catFolder) continue;

    const catItems = (items || []).filter((i: any) => i.category_id === cat.id);

    for (const item of catItems) {
      const safeTitle = sanitizeFilename(item.title);

      if (item.content_type === 'markdown' && item.content_text) {
        catFolder.file(`${safeTitle}.md`, item.content_text);
      } else if (item.content_url) {
        // Try to download the actual file from Supabase storage
        const fileData = await tryDownloadFile(item.content_url);
        if (fileData) {
          const ext = guessExtension(item.content_url, item.content_type);
          catFolder.file(`${safeTitle}${ext}`, fileData);
        } else {
          // Fallback to URL shortcut if download fails
          catFolder.file(
            `${safeTitle}.url`,
            `[InternetShortcut]\nURL=${item.content_url}\n`,
          );
        }
      }
    }
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  const safeName = sanitizeFilename(pod?.name || 'knowledge');
  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="knowledge-export-${safeName}.zip"`,
      'Cache-Control': 'no-cache, no-store',
    },
  });
}
