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
  /**
   * Course (migration 20261025000003): completing every item in the category
   * issues an accreditation named `accreditation_name` (falls back to the
   * category name).
   */
  is_course?: boolean;
  accreditation_name?: string | null;
  accreditation_description?: string | null;
  accreditation_image_url?: string | null;
}

/** A credential a pod has issued to a member; see `accreditations` table. */
export interface Accreditation {
  id: string;
  pod_id: string;
  course_category_id: string | null;
  wallet_address: string;
  name: string;
  description: string | null;
  image_url: string | null;
  source: 'course' | 'manual';
  issued_at: string;
  revoked_at: string | null;
}

/** Progress through a course for one member. */
export interface CourseProgress {
  categoryId: string;
  total: number;
  completed: number;
  /** All items complete (or the accreditation already exists). */
  done: boolean;
  accreditationId: string | null;
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
