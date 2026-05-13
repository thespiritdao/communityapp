import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import JSZip from 'jszip';

export const runtime = 'nodejs';

function getWalletFromToken(token: string): string | null {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

async function isPodLeader(podId: string, wallet: string): Promise<boolean> {
  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('pod_leads')
    .eq('id', podId)
    .single();

  if (pod?.pod_leads?.includes(wallet.toLowerCase())) return true;

  const { data: member } = await supabaseAdmin
    .from('pod_members')
    .select('id')
    .eq('pod_id', podId)
    .eq('wallet', wallet.toLowerCase())
    .eq('role', 'leader')
    .eq('is_active', true)
    .single();

  return !!member;
}

function podIdFromRequest(req: NextRequest): string {
  const match = req.nextUrl.pathname.match(/\/api\/pods\/([^/]+)\/knowledge/);
  return match?.[1] ?? '';
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const wallet = getWalletFromToken(token);
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
        catFolder.file(
          `${safeTitle}.url`,
          `[InternetShortcut]\nURL=${item.content_url}\n`,
        );
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
