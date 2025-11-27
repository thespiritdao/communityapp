// src/features/forum/services/DraftService.ts

import { supabase } from '@/utils/supabaseClient';

/**
 * Forum Draft Service
 *
 * Handles autosaving of thread and post drafts
 */

export interface Draft {
  id: string;
  author_address: string;
  category_id?: string;
  parent_thread_id?: string;
  title?: string;
  content: string;
  draft_type?: 'thread' | 'post';
  created_at: string;
  updated_at: string;
}

// ============================================================================
// DRAFT MANAGEMENT
// ============================================================================

/**
 * Save a draft (create or update)
 */
export async function saveDraft(
  userAddress: string,
  content: string,
  categoryId?: string,
  threadId?: string,
  title?: string,
  metadata?: Record<string, any>,
): Promise<{ success: boolean; draftId?: string; error?: string }> {
  try {
    // Check if draft already exists
    const query = supabase
      .from('forum_thread_drafts')
      .select('id')
      .eq('author_address', userAddress.toLowerCase());

    if (categoryId) {
      query.eq('category_id', categoryId);
    } else {
      query.is('category_id', null);
    }

    if (threadId) {
      query.eq('parent_thread_id', threadId);
    } else {
      query.is('parent_thread_id', null);
    }

    const { data: existing, error: queryError } = await query.maybeSingle();

    // Ignore "no rows" error, but throw other errors
    if (queryError) throw queryError;

    if (existing) {
      // Update existing draft
      const { data, error } = await supabase
        .from('forum_thread_drafts')
        .update({
          content: content,
          title: title,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      return { success: true, draftId: data.id };
    } else {
      // Create new draft
      const { data, error } = await supabase
        .from('forum_thread_drafts')
        .insert({
          author_address: userAddress.toLowerCase(),
          category_id: categoryId,
          parent_thread_id: threadId,
          title: title,
          content: content,
          draft_type: threadId ? 'post' : 'thread',
        })
        .select()
        .single();

      if (error) throw error;

      return { success: true, draftId: data.id };
    }
  } catch (error: any) {
    console.error('Error saving draft:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get draft for a specific context
 */
export async function getDraft(
  userAddress: string,
  categoryId?: string,
  threadId?: string,
): Promise<{ success: boolean; draft?: Draft; error?: string }> {
  try {
    const query = supabase
      .from('forum_thread_drafts')
      .select('*')
      .eq('author_address', userAddress.toLowerCase());

    if (categoryId) {
      query.eq('category_id', categoryId);
    } else {
      query.is('category_id', null);
    }

    if (threadId) {
      query.eq('parent_thread_id', threadId);
    } else {
      query.is('parent_thread_id', null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;

    return { success: true, draft: data as Draft };
  } catch (error: any) {
    console.error('Error getting draft:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all drafts for a user
 */
export async function getAllDrafts(
  userAddress: string,
): Promise<{ success: boolean; drafts?: Draft[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('forum_thread_drafts')
      .select('*')
      .eq('author_address', userAddress.toLowerCase())
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return { success: true, drafts: data as Draft[] };
  } catch (error: any) {
    console.error('Error getting all drafts:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a draft
 */
export async function deleteDraft(
  draftId: string,
  userAddress: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('forum_thread_drafts')
      .delete()
      .eq('id', draftId)
      .eq('author_address', userAddress.toLowerCase());

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting draft:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete draft by context
 */
export async function deleteDraftByContext(
  userAddress: string,
  categoryId?: string,
  threadId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const query = supabase
      .from('forum_thread_drafts')
      .delete()
      .eq('author_address', userAddress.toLowerCase());

    if (categoryId) {
      query.eq('category_id', categoryId);
    } else {
      query.is('category_id', null);
    }

    if (threadId) {
      query.eq('parent_thread_id', threadId);
    } else {
      query.is('parent_thread_id', null);
    }

    const { error } = await query;

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting draft:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// AUTO-SAVE HOOK UTILITIES
// ============================================================================

/**
 * Debounce function for autosave
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Auto-save manager class
 */
export class AutoSaveManager {
  private saveCallback: () => Promise<void>;
  private debouncedSave: () => void;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    saveCallback: () => Promise<void>,
    debounceMs = 2000,
    intervalMs = 30000, // Auto-save every 30 seconds
  ) {
    this.saveCallback = saveCallback;
    this.debouncedSave = debounce(saveCallback, debounceMs);

    // Set up periodic auto-save
    if (intervalMs > 0) {
      this.interval = setInterval(() => {
        this.saveCallback();
      }, intervalMs);
    }
  }

  /**
   * Trigger a debounced save
   */
  save() {
    this.debouncedSave();
  }

  /**
   * Clean up timers
   */
  destroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
