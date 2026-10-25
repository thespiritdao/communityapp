// src/app/knowledge/[id]/page.tsx
'use client';

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye } from 'lucide-react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import toast from 'react-hot-toast';
import { ContentDisplay } from '@/features/knowledge/components/ContentDisplay';
import { claimCourseAccreditation, courseDisplayName } from '@/features/knowledge/lib/courseProgress';
import { supabase } from '@/utils/supabaseClient';
import type { KnowledgeItem, KnowledgeCategory } from '@/features/knowledge/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function KnowledgeItemPage({ params }: PageProps) {
  const router = useRouter();
  const { evmAddress: userAddress } = useEvmAddress();
  const [item, setItem] = useState<KnowledgeItem | null>(null);
  const [category, setCategory] = useState<KnowledgeCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const viewRecordedRef = useRef(false);
  const accreditationAnnouncedRef = useRef(false);

  // Unwrap async params
  const { id } = use(params);

  useEffect(() => {
    loadItem();
  }, [id]);

  const loadItem = async () => {
    try {
      setLoading(true);

      // Load item
      const { data: itemData, error: itemError } = await supabase
        .from('knowledge_items')
        .select('*')
        .eq('id', id)
        .single();

      if (itemError) throw itemError;
      if (!itemData) {
        setError('Content not found');
        return;
      }

      // Access is decided by RLS: a private pod item is only returned to that
      // pod's members ("Members can view pod items"), so reaching this point
      // means the member may view it. The old client-side is_public check
      // blocked every private pod item, which made pod courses unusable.
      setItem(itemData);

      // Load category
      if (itemData.category_id) {
        const { data: categoryData } = await supabase
          .from('knowledge_categories')
          .select('*')
          .eq('id', itemData.category_id)
          .single();

        if (categoryData) {
          setCategory(categoryData);
        }
      }

      // Record view (only once per session)
      if (!viewRecordedRef.current) {
        await recordView(id);
        viewRecordedRef.current = true;
      }
    } catch (err) {
      console.error('Error loading knowledge item:', err);
      setError('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  const recordView = async (itemId: string) => {
    try {
      // Increment view count
      await supabase.rpc('increment_knowledge_view', {
        item_id: itemId,
      });

      // If user is logged in, save their view record
      if (userAddress) {
        // Check if user has already viewed this
        const { data: existingView } = await supabase
          .from('knowledge_item_views')
          .select('id')
          .eq('item_id', itemId)
          .eq('user_address', userAddress.toLowerCase())
          .single();

        if (!existingView) {
          await supabase.from('knowledge_item_views').insert({
            item_id: itemId,
            user_address: userAddress.toLowerCase(),
            progress_seconds: 0,
            completed: false,
          });
        } else {
          // Update last viewed timestamp
          await supabase
            .from('knowledge_item_views')
            .update({ last_viewed_at: new Date().toISOString() })
            .eq('id', existingView.id);
        }
      }
    } catch (err) {
      console.error('Error recording view:', err);
      // Don't block playback if view recording fails
    }
  };

  const handleProgressUpdate = async (progressSeconds: number, completed: boolean) => {
    if (!userAddress || !item) return;

    try {
      // Update or insert view progress
      const { data: existingView } = await supabase
        .from('knowledge_item_views')
        .select('id')
        .eq('item_id', item.id)
        .eq('user_address', userAddress.toLowerCase())
        .single();

      if (existingView) {
        await supabase
          .from('knowledge_item_views')
          .update({
            progress_seconds: progressSeconds,
            completed,
            last_viewed_at: new Date().toISOString(),
          })
          .eq('id', existingView.id);
      } else {
        await supabase.from('knowledge_item_views').insert({
          item_id: item.id,
          user_address: userAddress.toLowerCase(),
          progress_seconds: progressSeconds,
          completed,
        });
      }

      // Course: the DB trigger issues the accreditation on completion; ask for
      // it explicitly too so the member sees it the moment they finish.
      if (completed && category?.is_course && !accreditationAnnouncedRef.current) {
        const id = await claimCourseAccreditation(category.id);
        if (id) {
          accreditationAnnouncedRef.current = true;
          toast.success(`Accreditation earned: ${courseDisplayName(category)}`, { duration: 6000 });
        }
      }
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  };

  const loadSavedProgress = async (): Promise<number> => {
    if (!userAddress || !item) return 0;

    try {
      const { data } = await supabase
        .from('knowledge_item_views')
        .select('progress_seconds')
        .eq('item_id', item.id)
        .eq('user_address', userAddress.toLowerCase())
        .single();

      return data?.progress_seconds || 0;
    } catch {
      return 0;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAFAF8' }}>
        <p style={{ color: '#5F5A54' }}>Loading content...</p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAFAF8' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#8B3A3A', marginBottom: '16px' }}>{error || 'Content not found'}</p>
          <button
            onClick={() => router.push('/knowledge')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              backgroundColor: '#2F5D50',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Back to Knowledge Base
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8' }}>
      {/* Back button */}
      <div style={{ padding: '16px 16px 0', maxWidth: '1200px', margin: '0 auto' }}>
        <button
          onClick={() => router.push('/knowledge')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E8E4DC',
            color: '#2F5D50',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#F5F2ED';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#FFFFFF';
          }}
        >
          <ArrowLeft size={16} />
          Back to Knowledge Base
        </button>
      </div>

      {/* Content display */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px 24px' }}>
        <ContentDisplay
          item={item}
          onProgressUpdate={handleProgressUpdate}
          loadSavedProgress={loadSavedProgress}
        />

        {/* Content info */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E8E4DC',
            borderRadius: '12px',
            padding: '24px',
            marginTop: '16px',
          }}
        >
          {/* Category badge */}
          {category && (
            <div
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '6px',
                backgroundColor: '#E8F1EE',
                color: '#2F5D50',
                fontSize: '13px',
                fontWeight: '500',
                marginBottom: '12px',
              }}
            >
              {category.icon && `${category.icon} `}
              {category.name}
            </div>
          )}

          {/* Title */}
          <h1
            style={{
              fontSize: '28px',
              fontWeight: '600',
              color: '#2F2F2F',
              marginBottom: '12px',
              lineHeight: '1.3',
            }}
          >
            {item.title}
          </h1>

          {/* Description */}
          {item.description && (
            <p
              style={{
                fontSize: '15px',
                color: '#5F5A54',
                lineHeight: '1.6',
                marginBottom: '16px',
              }}
            >
              {item.description}
            </p>
          )}

          {/* View count */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#8F8A84',
              fontSize: '14px',
            }}
          >
            <Eye size={16} />
            {item.view_count} {item.view_count === 1 ? 'view' : 'views'}
          </div>
        </div>
      </div>
    </div>
  );
}
