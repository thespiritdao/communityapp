/**
 * Milestone Service
 *
 * Handles creation and management of milestones from bid deliverables.
 * Integrates with the bid approval workflow to automatically populate
 * the milestones table when a bid with deliverables is approved.
 *
 * @module milestoneService
 */

import { supabase } from '@/lib/supabase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Deliverable {
  description: string;
  payment_amount: string;
  due_date?: string;
}

export interface Milestone {
  id?: string;
  bid_id: string;
  bounty_id: string;
  deliverable_description: string;
  payment_amount: string;
  due_date: string;
  status: 'pending' | 'completed' | 'overdue';
  completed_at?: string;
  completed_by?: string;
  review_comments?: string;
  created_at?: string;
}

export interface CreateMilestonesResult {
  data: Milestone[] | null;
  error: Error | null;
  count: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate default due date for a milestone
 * Each milestone gets 30 days * (index + 1)
 */
function calculateDefaultDueDate(index: number): string {
  const daysOffset = 30 * (index + 1);
  const dueDate = new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000);
  return dueDate.toISOString();
}

/**
 * Parse deliverables from string or object format
 */
function parseDeliverables(deliverables: any): Deliverable[] {
  if (typeof deliverables === 'string') {
    try {
      return JSON.parse(deliverables);
    } catch (error) {
      console.error('❌ Failed to parse deliverables string:', error);
      return [];
    }
  }

  if (Array.isArray(deliverables)) {
    return deliverables;
  }

  console.error('❌ Invalid deliverables format:', typeof deliverables);
  return [];
}

/**
 * Validate deliverable has required fields
 */
function isValidDeliverable(d: any): d is Deliverable {
  return (
    d &&
    typeof d.description === 'string' &&
    d.description.length > 0 &&
    typeof d.payment_amount === 'string'
  );
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Create milestones from bid deliverables
 *
 * This is called after a bid is approved to populate the milestones table.
 * Each deliverable becomes a milestone with a payment amount and due date.
 *
 * @param bidId - The approved bid ID
 * @param bountyId - The bounty ID
 * @param deliverables - Array of deliverables (or JSON string)
 * @returns Result with created milestones or error
 */
export async function createMilestonesFromBid(
  bidId: string,
  bountyId: string,
  deliverables: Deliverable[] | string,
): Promise<CreateMilestonesResult> {
  console.log('📝 Creating milestones from bid deliverables:', {
    bidId,
    bountyId,
    deliverablesType: typeof deliverables,
  });

  // Parse deliverables
  const parsedDeliverables = parseDeliverables(deliverables);

  if (parsedDeliverables.length === 0) {
    console.log('⚠️ No deliverables to create milestones from');
    return { data: null, error: null, count: 0 };
  }

  // Validate deliverables
  const validDeliverables = parsedDeliverables.filter(isValidDeliverable);

  if (validDeliverables.length === 0) {
    const error = new Error('No valid deliverables found (missing description or payment_amount)');
    console.error('❌', error.message);
    return { data: null, error, count: 0 };
  }

  if (validDeliverables.length < parsedDeliverables.length) {
    console.warn('⚠️ Some deliverables were invalid and skipped:', {
      total: parsedDeliverables.length,
      valid: validDeliverables.length,
      skipped: parsedDeliverables.length - validDeliverables.length,
    });
  }

  // Create milestone records
  const milestones: Omit<Milestone, 'id'>[] = validDeliverables.map((d, index) => ({
    bid_id: bidId,
    bounty_id: bountyId,
    deliverable_description: d.description,
    payment_amount: d.payment_amount || '0',
    due_date: d.due_date || calculateDefaultDueDate(index),
    status: 'pending' as const,
    completed_at: undefined,
    completed_by: undefined,
    review_comments: undefined,
    created_at: new Date().toISOString(),
  }));

  console.log('💾 Inserting milestones into database:', {
    count: milestones.length,
    milestones: milestones.map((m) => ({
      description: m.deliverable_description,
      amount: m.payment_amount,
      dueDate: m.due_date,
    })),
  });

  // Insert into database
  try {
    const { data, error } = await supabase
      .from('milestones')
      .insert(milestones)
      .select();

    if (error) {
      console.error('❌ Failed to insert milestones:', error);
      return { data: null, error: new Error(error.message), count: 0 };
    }

    console.log('✅ Successfully created milestones:', {
      count: data?.length || 0,
      milestoneIds: data?.map((m) => m.id) || [],
    });

    return {
      data: data as Milestone[],
      error: null,
      count: data?.length || 0,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error creating milestones');
    console.error('❌ Exception creating milestones:', error);
    return { data: null, error, count: 0 };
  }
}

/**
 * Update milestone status
 *
 * @param milestoneId - The milestone ID to update
 * @param status - New status
 * @param completedBy - Address of who completed it (optional)
 * @param reviewComments - Review comments (optional)
 */
export async function updateMilestoneStatus(
  milestoneId: string,
  status: 'pending' | 'completed' | 'overdue',
  completedBy?: string,
  reviewComments?: string,
): Promise<{ data: Milestone | null; error: Error | null }> {
  const updates: Partial<Milestone> = {
    status,
  };

  if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
    if (completedBy) {
      updates.completed_by = completedBy;
    }
  }

  if (reviewComments) {
    updates.review_comments = reviewComments;
  }

  try {
    const { data, error } = await supabase
      .from('milestones')
      .update(updates)
      .eq('id', milestoneId)
      .select()
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as Milestone, error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error updating milestone');
    return { data: null, error };
  }
}

/**
 * Get milestones for a bid
 *
 * @param bidId - The bid ID
 * @returns Array of milestones
 */
export async function getMilestonesForBid(
  bidId: string,
): Promise<{ data: Milestone[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('bid_id', bidId)
      .order('due_date', { ascending: true });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as Milestone[], error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error fetching milestones');
    return { data: null, error };
  }
}

/**
 * Get milestones for a bounty
 *
 * @param bountyId - The bounty ID
 * @returns Array of milestones
 */
export async function getMilestonesForBounty(
  bountyId: string,
): Promise<{ data: Milestone[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('milestones')
      .select('*')
      .eq('bounty_id', bountyId)
      .order('due_date', { ascending: true });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as Milestone[], error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error fetching milestones');
    return { data: null, error };
  }
}

/**
 * Delete milestones for a bid (cleanup on bid rejection)
 *
 * @param bidId - The bid ID
 */
export async function deleteMilestonesForBid(
  bidId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('milestones')
      .delete()
      .eq('bid_id', bidId);

    if (error) {
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error deleting milestones');
    return { error };
  }
}
