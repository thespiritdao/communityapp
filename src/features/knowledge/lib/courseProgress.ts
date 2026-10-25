/**
 * Course progress for the signed-in member: how many items of each course
 * category they have completed, and whether the accreditation is already
 * issued. Reads only the member's own rows (knowledge_item_views own-row
 * policy; accreditations are readable by any member).
 *
 * Issuance itself happens in the database (trigger on knowledge_item_views,
 * migration 20261025000003); `claimCourseAccreditation` is the client-side
 * safety net for completions recorded before a category became a course.
 */

import { supabase } from '@/utils/supabaseClient';
import type {
  CourseProgress,
  KnowledgeCategory,
  KnowledgeItem,
} from '../types';

export async function loadCourseProgress(
  categories: KnowledgeCategory[],
  items: KnowledgeItem[],
  wallet: string | null | undefined,
): Promise<Map<string, CourseProgress>> {
  const out = new Map<string, CourseProgress>();
  const courses = categories.filter((c) => c.is_course);
  if (courses.length === 0) return out;

  const courseIds = new Set(courses.map((c) => c.id));
  const courseItems = items.filter((i) => courseIds.has(i.category_id));
  const w = wallet?.toLowerCase() ?? null;

  let completedItemIds = new Set<string>();
  let accreditedBy = new Map<string, string>();
  if (w && courseItems.length > 0) {
    const [viewsRes, accRes] = await Promise.all([
      supabase
        .from('knowledge_item_views')
        .select('item_id, completed')
        .eq('user_address', w)
        .in(
          'item_id',
          courseItems.map((i) => i.id),
        ),
      supabase
        .from('accreditations')
        .select('id, course_category_id')
        .eq('wallet_address', w)
        .is('revoked_at', null)
        .in('course_category_id', Array.from(courseIds)),
    ]);
    completedItemIds = new Set(
      (viewsRes.data ?? [])
        .filter((v) => v.completed)
        .map((v) => String(v.item_id)),
    );
    accreditedBy = new Map(
      (accRes.data ?? [])
        .filter((a) => a.course_category_id)
        .map((a) => [String(a.course_category_id), String(a.id)]),
    );
  }

  for (const c of courses) {
    const mine = courseItems.filter((i) => i.category_id === c.id);
    const completed = mine.filter((i) => completedItemIds.has(i.id)).length;
    const accreditationId = accreditedBy.get(c.id) ?? null;
    out.set(c.id, {
      categoryId: c.id,
      total: mine.length,
      completed,
      done:
        Boolean(accreditationId) ||
        (mine.length > 0 && completed >= mine.length),
      accreditationId,
    });
  }
  return out;
}

/** Ask the database to issue the signed-in member's accreditation if earned. */
export async function claimCourseAccreditation(
  categoryId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('claim_course_accreditation', {
    p_category_id: categoryId,
  });
  if (error) {
    console.warn('claim_course_accreditation failed', error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

export function courseDisplayName(
  c: Pick<KnowledgeCategory, 'name' | 'accreditation_name'>,
): string {
  return (c.accreditation_name ?? '').trim() || c.name;
}
