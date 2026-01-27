// src/features/knowledge/types.ts

export interface KnowledgeCategory {
  id: string;
  pod_id: string | null;
  name: string;
  description: string | null;
  icon: string | null; // emoji or icon name
  sort_order: number;
  is_public: boolean;
  created_at: string;
  created_by: string;
}

export interface KnowledgeItem {
  id: string;
  category_id: string;
  pod_id: string | null;
  title: string;
  description: string | null;
  content_type: 'video' | 'document' | 'markdown';
  content_url: string | null;
  content_text: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  is_public: boolean;
  view_count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface KnowledgeItemView {
  id: string;
  item_id: string;
  user_address: string;
  progress_seconds: number;
  completed: boolean;
  last_viewed_at: string;
}
