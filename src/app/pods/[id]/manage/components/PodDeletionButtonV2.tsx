'use client';

import type React from 'react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { PodDeletionApprovalFlow } from '@/features/pods/components/PodDeletionApprovalFlow';
import { PodDeletionManager } from '@/features/pods/components/PodDeletionManager';
import type { Pod } from '@/features/pods/types';

interface PodDeletionButtonV2Props {
  pod: Pod;
  canManage: boolean;
  onDeleteComplete?: () => void;
}

export const PodDeletionButtonV2: React.FC<PodDeletionButtonV2Props> = ({ 
  pod, 
  canManage,
  onDeleteComplete 
}) => {
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [deletionMode, setDeletionMode] = useState<'approval' | 'legacy'>('approval');

  // Determine if pod needs multi-sig approval
  const needsApproval = () => {
    // FOR TESTING: Always show approval flow if FORCE_APPROVAL_FLOW is set
    if (process.env.NEXT_PUBLIC_FORCE_APPROVAL_FLOW === 'true') {
      return true;
    }
    const minLeaders = Number.parseInt(process.env.NEXT_PUBLIC_MIN_POD_LEADERS || '3');
    return (pod.pod_leads?.length || 0) >= minLeaders;
  };

  const handleDeletionComplete = () => {
    setShowDeletionModal(false);
    onDeleteComplete?.();
  };

  if (!canManage) {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => setShowDeletionModal(true)}
        variant="destructive"
        className="w-full"
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Delete Pod
      </Button>

      <Dialog open={showDeletionModal} onOpenChange={setShowDeletionModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Delete Pod: {pod.name}</DialogTitle>
          </DialogHeader>

          {needsApproval() ? (
            <PodDeletionApprovalFlow
              pod={pod}
              onProposalCreated={(proposalId) => {
                console.log('Deletion proposal created:', proposalId);
              }}
              onDeletionComplete={handleDeletionComplete}
            />
          ) : (
            <PodDeletionManager
              pod={pod}
              onPodDeleted={handleDeletionComplete}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PodDeletionButtonV2;