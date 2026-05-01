// src/features/forum/components/ForumSearch.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { getCurrentSession } from '@/features/identity';

interface SearchResult {
  id: string;
  title: string;
  author_address: string;
  category_id: string;
  created_at: string;
  reply_count: number;
  rank: number;
  author_profile?: {
    display_name: string;
    profile_picture: string;
  } | null;
}

interface ForumSearchProps {
  categoryId?: string;
  placeholder?: string;
}

export function ForumSearch({ categoryId, placeholder = 'Search forum threads...' }: ForumSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (categoryId) params.set('category_id', categoryId);

      const res = await fetch(`/api/forum/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.threads || []);
        setIsOpen(true);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#F5EDD7',
        borderRadius: '12px',
        border: '1px solid #D1C4A9',
        padding: '0 12px',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}>
        <Search style={{ color: '#8B5E3C', width: 18, height: 18, flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder={placeholder}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            padding: '10px 8px',
            fontSize: '0.9rem',
            outline: 'none',
            color: '#3C3C3C',
          }}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
        />
        {query && (
          <button onClick={handleClear} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X style={{ color: '#8B5E3C', width: 16, height: 16 }} />
          </button>
        )}
        {loading && (
          <div style={{
            width: 16, height: 16, border: '2px solid #D1C4A9',
            borderTopColor: '#2F5D50', borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }} />
        )}
      </div>

      {/* Results dropdown */}
      {isOpen && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          backgroundColor: '#fff',
          borderRadius: '12px',
          border: '1px solid #D1C4A9',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxHeight: 400,
          overflowY: 'auto',
          zIndex: 50,
        }}>
          {results.map((thread) => (
            <Link
              key={thread.id}
              href={`/forum/thread/${thread.id}`}
              onClick={() => setIsOpen(false)}
              style={{
                display: 'block',
                padding: '12px 16px',
                textDecoration: 'none',
                color: 'inherit',
                borderBottom: '1px solid #f0ece3',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F5EDD7'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#212121', marginBottom: 4 }}>
                {thread.title}
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: '0.75rem', color: '#757575' }}>
                <span>{thread.author_profile?.display_name || thread.author_address.slice(0, 10) + '...'}</span>
                <span>{thread.reply_count} {thread.reply_count === 1 ? 'reply' : 'replies'}</span>
                <span>{formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {isOpen && results.length === 0 && query.length >= 2 && !loading && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          backgroundColor: '#fff',
          borderRadius: '12px',
          border: '1px solid #D1C4A9',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          padding: '16px',
          textAlign: 'center',
          color: '#757575',
          fontSize: '0.85rem',
          zIndex: 50,
        }}>
          No threads found for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
