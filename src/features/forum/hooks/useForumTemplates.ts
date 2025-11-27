// src/features/forum/hooks/useForumTemplates.ts
import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';

export interface ThreadTemplate {
  id: string;
  name: string;
  titleTemplate: string;
  contentTemplate: string;
  placeholders: string[];
}

export function useForumTemplates() {
  const [templates, setTemplates] = useState<ThreadTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('forum_templates')
          .select('*')
          .order('name');

        if (error) throw error;
        setTemplates(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchTemplates();
  }, []);

  const createTemplate = async (template: Omit<ThreadTemplate, 'id'>) => {
    try {
      const { data, error } = await supabase
        .from('forum_templates')
        .insert(template)
        .select()
        .single();

      if (error) throw error;
      setTemplates(prev => [...prev, data]);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  };

  const updateTemplate = async (id: string, updates: Partial<ThreadTemplate>) => {
    try {
      const { data, error } = await supabase
        .from('forum_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      setTemplates(prev => prev.map(t => t.id === id ? data : t));
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const { error } = await supabase
        .from('forum_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  };

  return {
    templates,
    loading,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}