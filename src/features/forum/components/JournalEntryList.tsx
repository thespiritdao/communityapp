// src/features/forum/components/JournalEntryList.tsx
//
// "Journal" presentation of a forum category (docs/spec-pod-places-and-journal.md
// Phase 1). Storage is unchanged — these are forum_threads — but they render
// as dated entries: newest first, grouped by month, cover image (first image
// attachment on the thread), author, date, excerpt, reply count.
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { MessageSquare } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import styles from '../styles/Forum.module.css';

export interface JournalEntry {
  id: string;
  title: string;
  content?: string | null;
  author_address: string;
  author_first_name?: string | null;
  author_last_name?: string | null;
  author_profile_picture?: string | null;
  created_at: string;
  reply_count?: number;
  is_pinned?: boolean;
}

interface JournalEntryListProps {
  entries: JournalEntry[];
}

const EXCERPT_LENGTH = 220;

/** Plain-text excerpt: strip HTML tags and common markdown symbols. */
export function toExcerpt(raw: string | null | undefined, max = EXCERPT_LENGTH): string {
  if (!raw) return '';
  const text = raw
    .replace(/<[^>]+>/g, ' ') // html tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → label
    .replace(/@\[([^\]]+)\]\([^)]*\)/g, '@$1') // @[Name](wallet) → @Name
    .replace(/[`*_>#~]+/g, '') // emphasis / headings / quotes
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;/g, (m) =>
      ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"' })[m] ?? ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 40))}…`;
}

function authorName(e: JournalEntry): string {
  if (e.author_first_name && e.author_last_name) return `${e.author_first_name} ${e.author_last_name}`;
  if (e.author_first_name) return e.author_first_name;
  if (e.author_last_name) return e.author_last_name;
  return e.author_address ? `${e.author_address.slice(0, 6)}…${e.author_address.slice(-4)}` : 'Anon.';
}

function monthKey(iso: string): string {
  try {
    return format(new Date(iso), 'MMMM yyyy');
  } catch {
    return 'Undated';
  }
}

export default function JournalEntryList({ entries }: JournalEntryListProps) {
  const [covers, setCovers] = useState<Record<string, string>>({});

  // One batched query for cover images: first image attachment per thread.
  const ids = useMemo(() => entries.map((e) => e.id), [entries]);
  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('forum_media_attachments')
          .select('thread_id, file_type, public_url, created_at')
          .in('thread_id', ids)
          .like('file_type', 'image/%')
          .order('created_at', { ascending: true });
        if (error || cancelled) return;
        const next: Record<string, string> = {};
        for (const row of data ?? []) {
          if (row.thread_id && row.public_url && !next[row.thread_id]) {
            next[row.thread_id] = row.public_url;
          }
        }
        setCovers(next);
      } catch {
        /* cover images are optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ids]);

  // Pinned first (already sorted by the page), then group by month in order.
  const groups = useMemo(() => {
    const out: Array<{ key: string; items: JournalEntry[] }> = [];
    for (const e of entries) {
      const key = e.is_pinned ? 'Pinned' : monthKey(e.created_at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(e);
      else out.push({ key, items: [e] });
    }
    return out;
  }, [entries]);

  return (
    <div className={styles.journalList}>
      {groups.map((group) => (
        <section key={group.key} className={styles.journalMonth}>
          <h3 className={styles.journalMonthHeader}>{group.key}</h3>
          <div className={styles.journalEntries}>
            {group.items.map((entry) => {
              const cover = covers[entry.id];
              const excerpt = toExcerpt(entry.content);
              let dateLabel = '';
              try {
                dateLabel = format(new Date(entry.created_at), 'EEEE, d MMMM yyyy');
              } catch {
                dateLabel = '';
              }
              return (
                <Link
                  key={entry.id}
                  href={`/forum/thread/${entry.id}`}
                  className={styles.journalEntry}
                >
                  {cover && (
                    <div className={styles.journalCover}>
                      <img src={cover} alt="" loading="lazy" />
                    </div>
                  )}
                  <div className={styles.journalBody}>
                    <div className={styles.journalDate}>
                      {entry.is_pinned && <span title="Pinned">📌 </span>}
                      {dateLabel}
                    </div>
                    <h4 className={styles.journalTitle}>{entry.title}</h4>
                    {excerpt && <p className={styles.journalExcerpt}>{excerpt}</p>}
                    <div className={styles.journalMeta}>
                      <span className={styles.journalAuthor}>
                        {entry.author_profile_picture ? (
                          <img src={entry.author_profile_picture} alt="" />
                        ) : (
                          <span className={styles.journalAvatarFallback}>
                            {authorName(entry).charAt(0).toUpperCase()}
                          </span>
                        )}
                        {authorName(entry)}
                      </span>
                      {typeof entry.reply_count === 'number' && (
                        <span className={styles.journalReplies}>
                          <MessageSquare size={13} />
                          {entry.reply_count}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
