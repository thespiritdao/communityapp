/**
 * MilestoneBountyCard Component
 *
 * Displays milestone bounties with individual milestone payment controls.
 * Shows all milestones for a bounty and allows individual payment release.
 *
 * FEATURES:
 * - Lists all milestones for a milestone bounty
 * - Individual payment buttons per milestone
 * - Milestone status tracking
 * - Progress indicators
 *
 * @module MilestoneBountyCard
 */

"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, DollarSign, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';
import MilestonePaymentTransaction from './MilestonePaymentTransaction';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Milestone {
  id: string;
  bid_id: string;
  deliverable_description: string;
  due_date: string;
  payment_amount: string;
  status: 'pending' | 'completed' | 'overdue';
  completed_at?: string;
  completed_by?: string;
  review_comments?: string;
  created_at: string;
}

interface MilestoneBountyCardProps {
  bounty: any; // V2 bounty format
  supabaseBounty: any; // Supabase bounty format
  onRefreshData: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const MilestoneBountyCard: React.FC<MilestoneBountyCardProps> = ({
  bounty,
  supabaseBounty,
  onRefreshData
}) => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvedBid, setApprovedBid] = useState<any>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  useEffect(() => {
    loadMilestones();
  }, [bounty.id]);

  const loadMilestones = async () => {
    try {
      setLoading(true);
      setError(null);

      // First, get the approved bid for this bounty
      const { data: bids, error: bidsError } = await supabase
        .from('bids')
        .select('*')
        .eq('bounty_id', bounty.id)
        .eq('status', 'work_approved');

      if (bidsError) {
        throw bidsError;
      }

      if (!bids || bids.length === 0) {
        setError('No approved bid found for this milestone bounty');
        return;
      }

      const bid = bids[0];
      setApprovedBid(bid);

      // Load milestones for this bid
      const { data: milestonesData, error: milestonesError } = await supabase
        .from('milestones')
        .select('*')
        .eq('bid_id', bid.id)
        .order('due_date', { ascending: true });

      if (milestonesError) {
        throw milestonesError;
      }

      setMilestones(milestonesData || []);
      console.log('🎯 Loaded milestones for bounty:', {
        bountyId: bounty.id,
        bidId: bid.id,
        milestonesCount: milestonesData?.length || 0
      });

    } catch (err) {
      console.error('❌ Error loading milestones:', err);
      setError(err instanceof Error ? err.message : 'Failed to load milestones');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // MILESTONE STATUS HELPERS
  // ============================================================================

  const getMilestoneStatus = (milestone: Milestone) => {
    if (milestone.status === 'completed') {
      return {
        style: { backgroundColor: '#D1E6DC', color: '#1F453A' },
        icon: CheckCircle,
        label: 'Completed'
      };
    }

    const dueDate = new Date(milestone.due_date);
    const now = new Date();

    if (dueDate < now && milestone.status === 'pending') {
      return {
        style: { backgroundColor: '#F5E6E6', color: '#5C1F1F' },
        icon: Clock,
        label: 'Overdue'
      };
    }

    return {
      style: { backgroundColor: '#FAF4EC', color: '#8F6B2F' },
      icon: Clock,
      label: 'Pending'
    };
  };

  const getProgressStats = () => {
    const completed = milestones.filter(m => m.status === 'completed').length;
    const total = milestones.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { completed, total, percentage };
  };

  // ============================================================================
  // PAYMENT HANDLERS
  // ============================================================================

  const handleMilestonePaymentSuccess = (receipt: any) => {
    console.log('✅ Milestone payment successful:', receipt.transactionHash);
    setSelectedMilestone(null);
    loadMilestones(); // Reload to update status
    onRefreshData(); // Refresh parent data
  };

  const handleMilestonePaymentError = (error: Error) => {
    console.error('❌ Milestone payment failed:', error);
    alert(`Failed to release milestone payment: ${error.message}`);
    setSelectedMilestone(null);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 mx-auto mb-2" style={{ borderBottomWidth: '2px', borderBottomStyle: 'solid', borderBottomColor: '#2F5D50' }}></div>
            <p className="text-sm text-gray-600">Loading milestones...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-4">
            <p className="text-sm" style={{ color: '#8B3A3A' }}>{error}</p>
            <Button
              onClick={loadMilestones}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { completed, total, percentage } = getProgressStats();

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <CardTitle className="text-lg">{bounty.title || `Bounty #${bounty.id}`}</CardTitle>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                <span>{bounty.value || '0'} {bounty.token}</span>
              </div>
              {approvedBid && (
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  <UserProfileDisplay 
                    walletAddress={approvedBid.bidder_address} 
                    size="sm" 
                    showModal={true} 
                  />
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <Badge variant="secondary" className="mb-2">
              Milestone Bounty
            </Badge>
            <div className="text-sm text-gray-600">
              Progress: {completed}/{total} ({percentage}%)
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{ width: `${percentage}%`, backgroundColor: '#3F7A5A' }}
            />
          </div>

          {/* Milestones List */}
          <div className="space-y-3">
            {milestones.map((milestone) => {
              const status = getMilestoneStatus(milestone);
              const StatusIcon = status.icon;
              const isPaymentSelected = selectedMilestone === milestone.id;

              return (
                <div 
                  key={milestone.id}
                  className="border rounded-lg p-4 space-y-3"
                >
                  {/* Milestone Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <StatusIcon className="h-4 w-4" />
                        <h4 className="font-medium">{milestone.deliverable_description}</h4>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>Due: {format(new Date(milestone.due_date), 'MMM dd, yyyy')}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          <span>{milestone.payment_amount} {bounty.token}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge style={status.style}>
                        {status.label}
                      </Badge>
                      {milestone.status === 'pending' && (
                        <Button
                          onClick={() => setSelectedMilestone(milestone.id)}
                          size="sm"
                          variant="outline"
                          style={{ color: '#3F7A5A', borderColor: '#3F7A5A' }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#D1E6DC'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          Release Payment
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Completion Info */}
                  {milestone.status === 'completed' && milestone.completed_at && (
                    <div className="text-xs text-gray-500 p-2 rounded" style={{ backgroundColor: '#D1E6DC' }}>
                      Completed on {format(new Date(milestone.completed_at), 'MMM dd, yyyy HH:mm')}
                      {milestone.review_comments && (
                        <div className="mt-1">Comments: {milestone.review_comments}</div>
                      )}
                    </div>
                  )}

                  {/* Payment Transaction */}
                  {isPaymentSelected && milestone.status === 'pending' && approvedBid && (
                    <div className="border-t pt-3 mt-3">
                      <MilestonePaymentTransaction
                        onchainBountyId={supabaseBounty.onchain_id?.toString() || '0'}
                        bountyId={bounty.id}
                        milestoneId={milestone.id}
                        onchainMilestoneId="0" // This would need to be tracked properly in production
                        paymentAmount={milestone.payment_amount}
                        paymentToken={bounty.token as 'SYSTEM' | 'SELF'}
                        workerAddress={approvedBid.bidder_address}
                        creatorAddress={supabaseBounty.creator_address}
                        bountyTitle={bounty.title || `Bounty #${bounty.id}`}
                        milestoneDescription={milestone.deliverable_description}
                        onSuccess={handleMilestonePaymentSuccess}
                        onError={handleMilestonePaymentError}
                        onComplete={() => setSelectedMilestone(null)}
                        onRefreshData={onRefreshData}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* No Milestones Message */}
          {milestones.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-600">No milestones found for this bounty.</p>
              <p className="text-sm text-gray-500 mt-1">Milestones should be created when the bid is approved.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MilestoneBountyCard;