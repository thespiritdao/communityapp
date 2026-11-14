/**
 * Shared helpers for email digest cron jobs (weekly + daily).
 */

import { APP_NAME, CONTACT_EMAIL } from '@/config/deployment';
import { emailFrom } from '@/config/deployment.server';
import { appUrl as deploymentUrl } from '@/config/deployment';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const resend = new Resend(process.env.RESEND_API_KEY);
import { appUrl } from '@/lib/safeAppPath';

const APP_URL = deploymentUrl();

// ── Types ──────────────────────────────────────────────────────────────────

export interface DigestNotification {
  notification_type: string;
  title: string;
  created_at: string;
  context_url?: string;
}

export interface GroupedDigest {
  governance: DigestNotification[];
  pods: DigestNotification[];
  bounties: DigestNotification[];
  events: DigestNotification[];
  marketplace: DigestNotification[];
  other: DigestNotification[];
}

export type DigestPeriod = 'daily' | 'weekly';

// ── Core ───────────────────────────────────────────────────────────────────

/**
 * Run a full digest cycle for the given period.
 * Returns { sent, skipped } counts.
 */
export async function runDigest(period: DigestPeriod): Promise<{
  sent: number;
  skipped: number;
  reason?: string;
}> {
  const prefColumn = period === 'daily' ? 'digest_daily_enabled' : 'digest_weekly_enabled';
  const lookbackMs = period === 'daily'
    ? 24 * 60 * 60 * 1000
    : 7 * 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - lookbackMs).toISOString();

  const { data: eligibleUsers, error: prefError } = await supabase
    .from('notification_preferences')
    .select('user_address')
    .eq(prefColumn, true)
    .eq('enabled', true);

  if (prefError) throw new Error(prefError.message);

  if (!eligibleUsers?.length) {
    return { sent: 0, skipped: 0, reason: 'No opted-in users' };
  }

  const addresses = eligibleUsers.map((u) => u.user_address);

  // Batch-fetch emails
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('wallet_address, first_name, last_name, email')
    .in('wallet_address', addresses);

  const emailMap = new Map<string, { email: string; name: string }>();
  (profiles ?? []).forEach((p: any) => {
    if (p.email) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Community Member';
      emailMap.set(p.wallet_address.toLowerCase(), { email: p.email, name });
    }
  });

  let sent = 0;
  let skipped = 0;

  for (const addr of addresses) {
    const profile = emailMap.get(addr.toLowerCase());
    if (!profile) { skipped++; continue; }

    const [generalRes, governanceRes, eventRes] = await Promise.all([
      supabase
        .from('general_notifications')
        .select('notification_type, title, created_at, context_url')
        .eq('recipient_address', addr.toLowerCase())
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('governance_notifications')
        .select('notification_type, title, created_at, context_url')
        .eq('recipient_address', addr.toLowerCase())
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('event_notifications')
        .select('notification_type, title, created_at, context_url')
        .eq('recipient_address', addr.toLowerCase())
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const allNotifications = [
      ...(generalRes.data ?? []),
      ...(governanceRes.data ?? []),
      ...(eventRes.data ?? []),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (allNotifications.length === 0) { skipped++; continue; }

    const grouped = groupNotifications(allNotifications);
    const periodLabel = period === 'daily' ? 'Daily' : 'Weekly';
    const timeLabel = period === 'daily' ? 'today' : 'this week';
    const html = renderDigestHtml(profile.name, grouped, allNotifications.length, periodLabel, timeLabel);

    // Up to 3 attempts with backoff — Resend hiccups shouldn't silently drop
    // a member's digest until the next period.
    let sendError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { error } = await resend.emails.send({
          from: emailFrom(),
          to: profile.email,
          subject: `Your SpiritDAO ${periodLabel} Digest — ${allNotifications.length} update${allNotifications.length !== 1 ? 's' : ''}`,
          html,
        });
        sendError = error ?? null;
        if (!sendError) break;
      } catch (err) {
        sendError = err;
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
    }

    if (sendError) {
      console.error(`[email-digest-${period}] Failed to send to ${addr} after 3 attempts:`, sendError);
      skipped++;
    } else {
      sent++;
    }
  }

  return { sent, skipped };
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function groupNotifications(notifications: DigestNotification[]): GroupedDigest {
  const groups: GroupedDigest = {
    governance: [],
    pods: [],
    bounties: [],
    events: [],
    marketplace: [],
    other: [],
  };

  for (const n of notifications) {
    const t = n.notification_type;
    if (t.startsWith('proposal_') || t.startsWith('governance_') || t === 'voting_reminder' || t === 'token_holder_notification') {
      groups.governance.push(n);
    } else if (t.startsWith('pod_') || t === 'claim_approval_request' || t === 'claim_approved' || t === 'claim_rejected') {
      groups.pods.push(n);
    } else if (t.startsWith('bounty_')) {
      groups.bounties.push(n);
    } else if (t.startsWith('event_') || t === 'completion_certificate') {
      groups.events.push(n);
    } else if (t === 'purchase_completed' || t === 'order_status_updated') {
      groups.marketplace.push(n);
    } else {
      groups.other.push(n);
    }
  }

  return groups;
}

function renderDigestHtml(
  name: string,
  groups: GroupedDigest,
  totalCount: number,
  periodLabel: string,
  timeLabel: string,
): string {
  const sectionOrder: { key: keyof GroupedDigest; label: string; emoji: string }[] = [
    { key: 'governance', label: 'Governance', emoji: '&#x1F5F3;' },
    { key: 'pods', label: 'Pods & Membership', emoji: '&#x1F465;' },
    { key: 'bounties', label: 'Bounties', emoji: '&#x1F3AF;' },
    { key: 'events', label: 'Events', emoji: '&#x1F4C5;' },
    { key: 'marketplace', label: 'Marketplace', emoji: '&#x1F6D2;' },
    { key: 'other', label: 'Other', emoji: '&#x1F514;' },
  ];

  const sections = sectionOrder
    .filter(({ key }) => groups[key].length > 0)
    .map(({ key, label, emoji }) => {
      const items = groups[key].slice(0, 10);
      const rows = items
        .map((n) => {
          const date = new Date(n.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          const href = appUrl(APP_URL, n.context_url);
          const link = href
            ? `<a href="${escapeHtml(href)}" style="color:#2F5D50;text-decoration:underline;">${escapeHtml(n.title)}</a>`
            : escapeHtml(n.title);
          return `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;font-size:13px;">${date}</td><td style="padding:6px 0;font-size:14px;">${link}</td></tr>`;
        })
        .join('');

      const moreNote =
        groups[key].length > 10
          ? `<p style="font-size:12px;color:#999;margin:4px 0 0 0;">+${groups[key].length - 10} more</p>`
          : '';

      return `
        <div style="margin-bottom:24px;">
          <h3 style="margin:0 0 8px 0;font-size:16px;color:#1a1a1a;">${emoji} ${label} (${groups[key].length})</h3>
          <table style="width:100%;border-collapse:collapse;">${rows}</table>
          ${moreNote}
        </div>`;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4ed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 20px;">

    <div style="text-align:center;margin-bottom:24px;">
      <img src="${APP_URL}/observableinfinities.png" alt="SpiritDAO" width="48" height="48" style="border-radius:8px;" />
    </div>

    <div style="background:#fff;border-radius:12px;padding:32px 28px;border:1px solid #e5e7eb;">
      <h1 style="margin:0 0 4px 0;font-size:22px;color:#1a1a1a;">Your ${periodLabel} DAO Digest</h1>
      <p style="margin:0 0 24px 0;color:#666;font-size:14px;">Hi ${escapeHtml(name)}, here's what happened ${timeLabel}.</p>

      <div style="background:#f0f4f0;border-radius:8px;padding:12px 16px;margin-bottom:24px;text-align:center;">
        <span style="font-size:28px;font-weight:700;color:#2F5D50;">${totalCount}</span>
        <span style="font-size:14px;color:#2F5D50;margin-left:6px;">update${totalCount !== 1 ? 's' : ''} ${timeLabel}</span>
      </div>

      ${sections}

      <div style="text-align:center;margin-top:28px;">
        <a href="${APP_URL}/notifications" style="display:inline-block;background:#2F5D50;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View All Notifications</a>
      </div>
    </div>

    <div style="text-align:center;margin-top:20px;font-size:12px;color:#999;">
      <p>You're receiving this because you have ${periodLabel.toLowerCase()} digests enabled.</p>
      <p><a href="${APP_URL}/notifications/preferences" style="color:#2F5D50;">Manage email preferences</a></p>
      <p style="margin-top:8px;">${APP_NAME}${CONTACT_EMAIL ? ` &mdash; ${CONTACT_EMAIL}` : ''}</p>
    </div>

  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
