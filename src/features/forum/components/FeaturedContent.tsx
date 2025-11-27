// src/features/forum/components/FeaturedContent.tsx

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface FeaturedItem {
  id: string;
  post_id?: string;
  thread_id?: string;
  featured_type: 'announcement' | 'spotlight' | 'important';
  reason?: string;
  featured_by: string;
  created_at: string;
  expires_at?: string;
  // Joined data
  thread?: {
    id: string;
    title: string;
    category_id: string;
  };
  post?: {
    id: string;
    content: string;
    thread_id: string;
  };
}

interface FeaturedContentProps {
  categoryId?: string;
  limit?: number;
}

export function FeaturedContent({
  categoryId,
  limit = 3
}: FeaturedContentProps) {
  const [featured, setFeatured] = useState<FeaturedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadFeatured();
  }, [categoryId]);

  const loadFeatured = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('forum_featured_content')
        .select(`
          *,
          forum_threads!forum_featured_content_thread_id_fkey (id, title, category_id),
          forum_posts!forum_featured_content_post_id_fkey (id, content, thread_id)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      // Filter by category if specified
      if (categoryId) {
        query = query.eq('forum_threads.category_id', categoryId);
      }

      // Only show non-expired items
      const now = new Date().toISOString();
      query = query.or(`expires_at.is.null,expires_at.gt.${now}`);

      const { data, error } = await query;

      if (error) throw error;

      setFeatured((data || []) as any);
    } catch (error) {
      console.error('Error loading featured content:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || featured.length === 0) {
    return null;
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'announcement':
        return { backgroundColor: '#E8F1EE', color: '#1F453A', borderColor: '#B8D9CA' };
      case 'spotlight':
        return { backgroundColor: '#FAF4EC', color: '#8F6B2F', borderColor: '#E8D7B8' };
      case 'important':
        return { backgroundColor: '#F5E6E6', color: '#5C1F1F', borderColor: '#D9B3B3' };
      default:
        return { backgroundColor: '#f3f4f6', color: '#1f2937', borderColor: '#d1d5db' };
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'announcement':
        return '📢';
      case 'spotlight':
        return '⭐';
      case 'important':
        return '⚠️';
      default:
        return '📌';
    }
  };

  return (
    <div className="space-y-3 mb-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <span>✨</span>
        Featured Content
      </h3>

      {featured.map((item) => {
        const isThread = !!item.thread_id;
        const url = isThread
          ? `/forum/thread/${item.thread_id}`
          : `/forum/thread/${item.post?.thread_id}#post-${item.post_id}`;

        const title = isThread
          ? item.thread?.title
          : `Post: ${item.post?.content?.substring(0, 60)}...`;

        return (
          <Card
            key={item.id}
            className="border-2"
            style={getTypeColor(item.featured_type)}
          >
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{getTypeIcon(item.featured_type)}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="capitalize">
                      {item.featured_type}
                    </Badge>
                    {item.expires_at && (
                      <span className="text-xs text-gray-500">
                        Expires {new Date(item.expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <Link
                    href={url}
                    className="font-semibold hover:underline block mb-1"
                  >
                    {title}
                  </Link>
                  {item.reason && (
                    <p className="text-sm text-gray-600">{item.reason}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Feature content management (moderator only)
 */
interface FeatureContentButtonProps {
  threadId?: string;
  postId?: string;
  onFeatureToggle?: () => void;
}

export function FeatureContentButton({
  threadId,
  postId,
  onFeatureToggle
}: FeatureContentButtonProps) {
  const [isFeatured, setIsFeatured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkIfFeatured();
  }, [threadId, postId]);

  const checkIfFeatured = async () => {
    try {
      const query = supabase
        .from('forum_featured_content')
        .select('id');

      if (threadId) {
        query.eq('thread_id', threadId);
      } else if (postId) {
        query.eq('post_id', postId);
      }

      const { data } = await query.single();
      setIsFeatured(!!data);
    } catch (error) {
      // Not featured
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFeature = async () => {
    // This would require moderation permissions
    // Implementation left for integration with moderation system
    onFeatureToggle?.();
  };

  if (isLoading) return null;

  return (
    <button
      onClick={toggleFeature}
      className="text-sm text-gray-600 hover:text-gray-800"
    >
      {isFeatured ? '⭐ Featured' : '☆ Feature'}
    </button>
  );
}
