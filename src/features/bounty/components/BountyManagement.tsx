'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Search,
  Filter,
  Eye,
  Edit,
  DollarSign,
  Users,
  Target,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Scale
} from 'lucide-react';

// Import existing components
import { BountyList } from './BountyList';
import { BidReviewManager } from './BidReviewManagerRefactored';
import { BountyCompletion } from './BountyCompletion';
import { MilestoneBountyCard } from './MilestoneBountyCard';
import { BidForm } from './BidForm';
import { WorkSubmissionForm } from './WorkSubmissionForm';
import { WorkSubmissionReview } from './WorkSubmissionReview';
import { BountyCancellationDialog } from './BountyCancellationDialog';
import { DisputeFilingDialog } from './DisputeFilingDialog';
import { DisputeManagementDashboard } from './DisputeManagementDashboard';
import { useBountyV2 } from '../hooks/useBountyV2';
import { useBountySupabase } from '../hooks/useBountySupabase';
import type { BountyV2 } from '../hooks/useBountyV2';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';
import { usePods } from '@/features/pods/hooks/usePods';
import { useTokenBalances } from '@/context/TokenBalancesContext';

interface BountyManagementProps {
  podId: string;
  canManageBounties: boolean;
}

// Utility function to format crypto values
const formatCryptoValue = (value: string | number, decimals: number = 3): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '0.000';
  
  // For very small values, show more decimals
  if (numValue < 0.001 && numValue > 0) {
    return numValue.toFixed(6);
  }
  
  return numValue.toFixed(decimals);
};

// Helper function to get pod name by ID
const getPodName = (podId: string, pods: any[]): string => {
  if (!podId) return 'Not specified';
  const pod = pods.find(p => p.id === podId);
  return pod?.name || 'Unknown Pod';
};

// Helper function to check if user can bid on a bounty
const canUserBid = (bounty: any, userAddress: string | undefined, tokenBalances: any, pods: any[]): boolean => {
  if (!userAddress) {
    return false;
  }

  // Can't bid on your own bounty (except in dev mode for testing)
  const isCreator = bounty.creator === userAddress.toLowerCase() ||
                   bounty.creator_address === userAddress.toLowerCase();

  if (isCreator) {
    // Allow creators to bid on their own bounties in development for testing
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (!isDevelopment) {
      return false;
    }
  }

  // If bounty is not open, can't bid
  if (bounty.status !== 0 && bounty.status !== 'open' && bounty.status !== 'draft') {
    return false;
  }

  // Check if bounty requires pod membership
  if (bounty.podId) {
    const pod = pods.find(p => p.id === bounty.podId);

    if (pod) {
      // Check if user is a member or leader of the pod
      const isMember = pod.pod_members?.some((m: string) => m.toLowerCase() === userAddress.toLowerCase());
      const isLeader = pod.pod_leads?.some((l: string) => l.toLowerCase() === userAddress.toLowerCase());
      const isPodCreator = pod.created_by_address?.toLowerCase() === userAddress.toLowerCase();

      // If pod-restricted and user is not a member, check for Advocate token
      if (!isMember && !isLeader && !isPodCreator) {
        const hasAdvocate = tokenBalances?.hasAdvocate || false;
        return hasAdvocate;
      }

      return true;
    }
  }

  // If no restrictions, allow bidding
  return true;
};

export const BountyManagement: React.FC<BountyManagementProps> = ({
  podId,
  canManageBounties
}) => {
  const { address } = useAccount() || {}; // Add fallback for undefined during remount
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [selectedBounty, setSelectedBounty] = useState<BountyV2 | null>(null);
  const [showBidForm, setShowBidForm] = useState(false);
  const [selectedBountyForBid, setSelectedBountyForBid] = useState<BountyV2 | null>(null);
  const [openBountyDetailId, setOpenBountyDetailId] = useState<string | null>(null);
  const [editingBid, setEditingBid] = useState<any | null>(null); // Stores the bid being edited
  const [showWorkSubmissionForm, setShowWorkSubmissionForm] = useState(false);
  const [convertedBounties, setConvertedBounties] = useState<any[]>([]); // Store converted Supabase bounties
  const [selectedBountyForWorkSubmission, setSelectedBountyForWorkSubmission] = useState<any | null>(null);
  const [selectedBidForWorkSubmission, setSelectedBidForWorkSubmission] = useState<any | null>(null);
  const [showCancellationDialog, setShowCancellationDialog] = useState(false);
  const [selectedBountyForCancellation, setSelectedBountyForCancellation] = useState<any | null>(null);
  const [showDisputeFilingDialog, setShowDisputeFilingDialog] = useState(false);
  const [selectedBountyForDispute, setSelectedBountyForDispute] = useState<any | null>(null);
  const [selectedBidForDispute, setSelectedBidForDispute] = useState<any | null>(null);
  const [showDisputeDashboard, setShowDisputeDashboard] = useState(false);
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);

  // Use bounty V2 hooks
  const { 
    getBounties, 
    getBountyDetails, 
    getBids,
    assignBountyCall,
    releasePaymentCall 
  } = useBountyV2();

  // Use Supabase hooks for additional data
  const {
    bounties: supabaseBounties,
    bids: userBids,
    loading: supabaseLoading,
    loadBounties: refreshBounties,
    loadAllBids,
    submitBid,
    updateBid
  } = useBountySupabase();
  
  // Get pods data for mapping pod IDs to names
  const { pods } = usePods();
  
  // Get user's token balances to check if they can bid
  const { balances: tokenBalances } = useTokenBalances();

  // State for bounty data
  const [bounties, setBounties] = useState<BountyV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load of bounties and when pod changes
  useEffect(() => {
    console.log('🚀 BountyManagement: Initial load triggered', { podId });
    const loadData = async () => {
      await refreshBounties();
      await loadAllBids(); // Load all bids to check if user has already applied
    };
    loadData();
  }, [refreshBounties, loadAllBids, podId]);

  // Log bids count when userBids changes
  useEffect(() => {
    console.log('✅ BountyManagement: Bids data updated, count:', userBids?.length || 0);
    if (userBids && userBids.length > 0) {
      console.log('📋 Available bid statuses:', [...new Set(userBids.map(bid => bid.status))]);
    }
  }, [userBids]);

  // Reload bids when switching to Pay tab to ensure fresh data
  useEffect(() => {
    if (activeTab === 'payments' && canManageBounties) {
      console.log('💰 Pay tab activated, reloading bids...');
      loadAllBids();
    }
  }, [activeTab, canManageBounties, loadAllBids]);

  // Helper function to check if user has already bid on a bounty
  const getUserBidForBounty = (bountyId: string) => {
    if (!address || !userBids) return null;
    return userBids.find(
      bid => bid.bountyId === bountyId &&
             bid.bidderAddress?.toLowerCase() === address.toLowerCase()
    );
  };

  // Convert Supabase bounties to BountyV2 format and set them
  useEffect(() => {
    console.log('📋 BountyManagement: Processing Supabase bounties:', {
      supabaseBounties: supabaseBounties?.length || 0,
      loading: supabaseLoading
    });
    
    if (supabaseBounties && supabaseBounties.length > 0) {
      console.log('📋 Converting Supabase bounties to V2 format:', supabaseBounties);
      
      const convertedBounties = supabaseBounties.map(supabaseBounty => {
        // Handle the structure from convertBountyFromDb which returns {value: {amount, token}}
        const rawBounty = supabaseBounty as any; // Type assertion since we know the actual structure
        
        // The value is already an object with amount and token from convertBountyFromDb
        const rawValueAmount = rawBounty.value?.amount || rawBounty.value_amount;
        const rawToken = rawBounty.value?.token || rawBounty.value_token;
        const parsedValue = rawValueAmount ? parseFloat(rawValueAmount) : 0;
        
        // Debug logging for bounty conversion (disabled in production)
        if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_VERBOSE_LOGS === 'true') {
          console.debug(`🔍 Converting bounty ${rawBounty.id}:`, {
            raw_bounty_value: rawBounty.value,
            raw_value_amount: rawValueAmount,
            raw_token: rawToken,
            parsed_value: parsedValue,
            status: rawBounty.status
          });
        }
        
        const convertedStatus = rawBounty.status === 'open' ? 0 : 
                               rawBounty.status === 'assigned' ? 1 : 
                               rawBounty.status === 'completed' ? 2 : 
                               rawBounty.status === 'draft' ? 0 : 3; // Treat draft as open for now

        if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_VERBOSE_LOGS === 'true') {
          console.debug(`🔍 Status conversion for bounty ${rawBounty.id}:`, {
            originalStatus: rawBounty.status,
            convertedStatus,
            title: rawBounty.title
          });
        }

        return {
          id: rawBounty.id || '',
          title: rawBounty.title || '',
          creator: rawBounty.creator_address || '',
          value: parsedValue.toString(),
          token: rawToken || 'SYSTEM',
          status: convertedStatus,
          podId: rawBounty.podId || rawBounty.required_pod_id || '',
          category: rawBounty.category || '',
          ipfsHash: rawBounty.ipfs_hash || rawBounty.ipfsHash || 'temp',
          createdAt: rawBounty.createdAt instanceof Date 
            ? Math.floor(rawBounty.createdAt.getTime() / 1000) 
            : rawBounty.created_at 
              ? Math.floor(new Date(rawBounty.created_at).getTime() / 1000) 
              : Math.floor(Date.now() / 1000),
          deadline: Math.floor(Date.now() / 1000) + 604800, // 7 days from now
          fundingSource: 'wallet'
        };
      });
      
      console.log('✅ Converted bounties:', convertedBounties);
      setBounties(convertedBounties);
      setConvertedBounties(convertedBounties);
      setLoading(false);
    } else if (!supabaseLoading) {
      // If not loading and no bounties, show empty state
      console.log('📋 No bounties found, setting empty state');
      setBounties([]);
      setLoading(false);
    } else {
      // Still loading
      setLoading(supabaseLoading);
    }
  }, [supabaseBounties, supabaseLoading]);

  // Filter and search bounties
  const filteredBounties = useMemo(() => {
    // For Pay tab, we need to show 'assigned' bounties regardless of the status filter
    const effectiveStatusFilter = activeTab === 'payments' ? 'assigned' : statusFilter;
    
    console.log('🔍 FILTERING BOUNTIES:', {
      totalBounties: bounties.length,
      searchTerm,
      statusFilter,
      effectiveStatusFilter,
      activeTab,
      podId,
      targetBountyId: '735611ef-9809-4681-8aaf-db3d22c62ae8'
    });

    const filtered = bounties.filter(bounty => {
      const searchableText = `${bounty.title || ''} ${bounty.category || ''} ${bounty.id || ''}`;
      const matchesSearch = !searchTerm || searchableText.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = (effectiveStatusFilter === 'open' && bounty.status === 0) ||
                           (effectiveStatusFilter === 'assigned' && bounty.status === 1) ||
                           (effectiveStatusFilter === 'completed' && bounty.status === 2) ||
                           (effectiveStatusFilter === 'cancelled' && bounty.status === 3);

      // Filter by pod if specified (and not 'all')
      const matchesPod = podId === 'all' || !podId || bounty.podId === podId;

      // Log Test Bounty 18 specifically
      if (bounty.id === '735611ef-9809-4681-8aaf-db3d22c62ae8') {
        console.log('🎯 TEST BOUNTY 18 FILTERING:', {
          bountyId: bounty.id,
          title: bounty.title,
          status: bounty.status,
          statusLabel: bounty.status === 0 ? 'open' : bounty.status === 1 ? 'assigned' : bounty.status === 2 ? 'completed' : 'cancelled',
          podId: bounty.podId,
          searchTerm,
          effectiveStatusFilter,
          matchesSearch,
          matchesStatus,
          matchesPod,
          willBeIncluded: matchesSearch && matchesStatus && matchesPod
        });
      }

      return matchesSearch && matchesStatus && matchesPod;
    });

    console.log('🔍 FILTERING RESULT:', {
      filteredCount: filtered.length,
      filteredTitles: filtered.map(b => b.title)
    });

    return filtered;
  }, [bounties, searchTerm, statusFilter, activeTab, podId]);

  // Get status display
  const getStatusDisplay = (status: number) => {
    switch (status) {
      case 0: return { label: 'Open', color: 'bg-green-100 text-green-800' };
      case 1: return { label: 'Assigned', color: 'bg-blue-100 text-blue-800' };
      case 2: return { label: 'Completed', color: 'bg-gray-100 text-gray-800' };
      case 3: return { label: 'Cancelled', color: 'bg-red-100 text-red-800' };
      default: return { label: 'Unknown', color: 'bg-gray-100 text-gray-800' };
    }
  };

  // Get bounty statistics
  const stats = useMemo(() => {
    const total = filteredBounties.length;
    const open = filteredBounties.filter(b => b.status === 0).length;
    const assigned = filteredBounties.filter(b => b.status === 1).length;
    const completed = filteredBounties.filter(b => b.status === 2).length;

    // Calculate totals by token type (case-insensitive to handle any data inconsistencies)
    const systemBounties = filteredBounties.filter(b =>
      b.token && b.token.toUpperCase() === 'SYSTEM'
    );
    const selfBounties = filteredBounties.filter(b =>
      b.token && b.token.toUpperCase() === 'SELF'
    );

    const systemTotal = systemBounties.reduce((sum, b) => {
      const value = parseFloat(b.value || '0');
      return sum + value;
    }, 0);

    const selfTotal = selfBounties.reduce((sum, b) => {
      const value = parseFloat(b.value || '0');
      return sum + value;
    }, 0);

    return { total, open, assigned, completed, systemTotal, selfTotal };
  }, [filteredBounties]);

  // Remove this check as it's handled by the calling component
  // The public view should still work with canManageBounties=false

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading bounties...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertDescription>
          Error loading bounties: {error}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats - 2x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
        {/* Total Bounties */}
        <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{stats.total}</p>
                <p className="text-sm opacity-90">Total Bounties</p>
              </div>
              <Target className="h-10 w-10 opacity-80" />
            </div>
            <div className="mt-4 flex gap-4 text-sm">
              <span>Open: {stats.open}</span>
              <span>In Progress: {stats.assigned}</span>
              <span>Completed: {stats.completed}</span>
            </div>
          </CardContent>
        </Card>
        
        {/* Token Values */}
        <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm opacity-90">Total Value</p>
              </div>
              <DollarSign className="h-10 w-10 opacity-80" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold">$SYSTEM:</span>
                <span className="text-2xl font-bold">{formatCryptoValue(stats.systemTotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold">$SELF:</span>
                <span className="text-2xl font-bold">{formatCryptoValue(stats.selfTotal)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search bounties..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Management Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="overview">
            {canManageBounties ? 'Overview' : 'All Bounties'}
          </TabsTrigger>
          {canManageBounties && (
            <>
              <TabsTrigger value="bids">Bids</TabsTrigger>
              <TabsTrigger value="work">Work</TabsTrigger>
              <TabsTrigger value="milestones">Goals</TabsTrigger>
              <TabsTrigger value="payments">Pay</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {filteredBounties.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No bounties found</h3>
                  <p className="text-gray-600">
                    {searchTerm || statusFilter !== 'open' 
                      ? 'Try adjusting your search or filter criteria.'
                      : 'Create your first bounty to get started.'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredBounties.map((bounty) => {
                const status = getStatusDisplay(bounty.status);
                return (
                  <Card key={bounty.id} className="cursor-pointer transition-colors hover:bg-gray-50">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Header with title and badges */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <h3 className="font-medium text-lg flex-1 min-w-0 truncate">
                            {bounty.title || `Bounty #${bounty.id}`}
                          </h3>
                          <div className="flex gap-2 flex-wrap">
                            <Badge className={status.color}>{status.label}</Badge>
                            {bounty.category && <Badge variant="outline">{bounty.category}</Badge>}
                          </div>
                        </div>
                        
                        {/* Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                          <p>Value: {formatCryptoValue(bounty.value || '0')} ${bounty.token}</p>
                          <div className="flex items-center gap-2">
                            <span>Creator:</span>
                            {bounty.creator ? (
                              <UserProfileDisplay 
                                walletAddress={bounty.creator} 
                                size="sm"
                                showModal={true}
                              />
                            ) : (
                              <span>Unknown</span>
                            )}
                          </div>
                          <p>Created: {bounty.createdAt ? new Date(bounty.createdAt * 1000).toLocaleDateString() : 'Unknown'}</p>
                        </div>
                        
                        {/* Action button */}
                        <div className="flex justify-end pt-2">
                          <Dialog open={openBountyDetailId === bounty.id} onOpenChange={(open) => {
                            if (!open) {
                              setOpenBountyDetailId(null);
                              setShowBidForm(false); // Also close bid form if open
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full sm:w-auto"
                                onClick={() => setOpenBountyDetailId(bounty.id)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View Details
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>{bounty.title || `Bounty #${bounty.id}`}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <div>
                                      <span className="font-medium">Status:</span> 
                                      <Badge className={`ml-2 ${getStatusDisplay(bounty.status).color}`}>
                                        {getStatusDisplay(bounty.status).label}
                                      </Badge>
                                    </div>
                                    <div>
                                      <span className="font-medium">Category:</span> {bounty.category || 'Not specified'}
                                    </div>
                                    <div>
                                      <span className="font-medium">Value:</span> {formatCryptoValue(bounty.value || '0')} ${bounty.token}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">Creator:</span> 
                                      {bounty.creator ? (
                                        <UserProfileDisplay 
                                          walletAddress={bounty.creator} 
                                          size="sm"
                                          showModal={true}
                                        />
                                      ) : (
                                        <span>Unknown</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <div>
                                      <span className="font-medium">Pod:</span> {getPodName(bounty.podId, pods)}
                                    </div>
                                    <div>
                                      <span className="font-medium">Funding Source:</span> {bounty.fundingSource || 'Wallet'}
                                    </div>
                                    <div>
                                      <span className="font-medium">Created:</span> {bounty.createdAt ? new Date(bounty.createdAt * 1000).toLocaleDateString() : 'Unknown'}
                                    </div>
                                    <div>
                                      <span className="font-medium">Deadline:</span> {bounty.deadline ? new Date(bounty.deadline * 1000).toLocaleDateString() : 'Not set'}
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Bid Action for eligible users */}
                                {(() => {
                                  const canBid = canUserBid(bounty, address, tokenBalances, pods);
                                  const existingBid = getUserBidForBounty(bounty.id);
                                  const showBidButton = !canManageBounties && canBid;
                                  const isOwnBounty = bounty.creator === address?.toLowerCase() ||
                                                     bounty.creator_address === address?.toLowerCase();
                                  const isApprovedBidder = existingBid?.status === 'approved';
                                  const matchingSupabaseBounty = supabaseBounties.find(b => b.id === bounty.id);

                                  // Show work submission button for approved bidders
                                  if (isApprovedBidder && matchingSupabaseBounty) {
                                    return (
                                      <div className="border-t pt-4 space-y-2">
                                        <div className="rounded-lg p-3 mb-2" style={{ backgroundColor: '#D1E6DC', border: '1px solid #B8D9CA' }}>
                                          <p className="text-sm text-center font-medium" style={{ color: '#1F453A' }}>
                                            ✅ Your Bid Was Approved!
                                          </p>
                                          <p className="text-xs text-center mt-1" style={{ color: '#2F5D50' }}>
                                            You can now submit your completed work
                                          </p>
                                        </div>
                                        <Button
                                          className="w-full text-white hover:bg-[#254A40]"
                                          onClick={() => {
                                            console.log('📤 Submit Work clicked');
                                            setSelectedBountyForWorkSubmission(matchingSupabaseBounty);
                                            setSelectedBidForWorkSubmission(existingBid);
                                            setShowWorkSubmissionForm(true);
                                            setOpenBountyDetailId(null);
                                          }}
                                          style={{ backgroundColor: '#2F5D50' }}
                                        >
                                          📤 Submit Completed Work
                                        </Button>
                                      </div>
                                    );
                                  }

                                  if (showBidButton) {
                                    // User has already submitted a bid
                                    if (existingBid) {
                                      // Only allow editing if bid is still pending
                                      const canEdit = existingBid.status === 'pending';

                                      return (
                                        <div className="border-t pt-4 space-y-2">
                                          <div className="rounded-lg p-3" style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA' }}>
                                            <p className="text-sm text-center font-medium" style={{ color: '#1F453A' }}>
                                              ✅ Application Submitted
                                            </p>
                                            <p className="text-xs text-center mt-1" style={{ color: '#2F5D50' }}>
                                              Status: {existingBid.status}
                                            </p>
                                            <p className="text-xs text-gray-600 text-center mt-1">
                                              Submitted: {new Date(existingBid.submittedAt).toLocaleDateString()}
                                            </p>
                                          </div>
                                          {canEdit && (
                                            <Button
                                              variant="outline"
                                              className="w-full text-white hover:bg-[#6F8F86]"
                                              onClick={() => {
                                                console.log('✏️ Edit Application clicked');
                                                setEditingBid(existingBid);
                                                setSelectedBountyForBid(bounty);
                                                setShowBidForm(true);
                                                // Close the details dialog to avoid nested dialogs
                                                setOpenBountyDetailId(null);
                                              }}
                                              style={{ backgroundColor: '#8FAAA1', border: '1px solid #6F8F86' }}
                                            >
                                              <Edit className="h-4 w-4 mr-1" />
                                              Edit Application
                                            </Button>
                                          )}
                                        </div>
                                      );
                                    }

                                    // User can submit a new bid
                                    return (
                                      <div className="border-t pt-4 space-y-2">
                                        <Button
                                          className="w-full text-white hover:bg-[#254A40]"
                                          onClick={() => {
                                            console.log('🎯 Apply for Bounty clicked:', {
                                              bountyId: bounty.id,
                                              bountyTitle: bounty.title
                                            });
                                            setSelectedBountyForBid(bounty);
                                            setShowBidForm(true);
                                            // Close the details dialog to avoid nested dialogs
                                            setOpenBountyDetailId(null);
                                          }}
                                          style={{ backgroundColor: '#2F5D50' }}
                                        >
                                          🎯 Apply for Bounty
                                        </Button>
                                        <p className="text-xs text-gray-500 text-center">
                                          {isOwnBounty ?
                                            "⚠️ Testing mode: Normally you can't apply to your own bounty" :
                                            "Click to submit your application"
                                          }
                                        </p>
                                      </div>
                                    );
                                  } else if (isOwnBounty && !canManageBounties) {
                                    return (
                                      <div className="border-t pt-4 space-y-2">
                                        <div className="rounded-lg p-3" style={{ backgroundColor: '#E8F1EE', border: '1px solid #B8D9CA' }}>
                                          <p className="text-sm text-center" style={{ color: '#1F453A' }}>
                                            👤 This is your bounty. Others can apply to work on it.
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  }

                                  return null;
                                })()}
                                
                                {/* Additional actions for managers */}
                                {canManageBounties && (
                                  <div className="border-t pt-4 space-y-2">
                                    <h4 className="font-medium">Management Actions</h4>
                                    <div className="flex gap-2 flex-wrap">
                                      {bounty.status === 0 && (
                                        <>
                                          <Button variant="outline" size="sm">
                                            <Edit className="h-4 w-4 mr-1" />
                                            Edit Bounty
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-red-600 text-red-600 hover:bg-red-50"
                                            onClick={() => {
                                              console.log('🚫 Cancel Bounty clicked');
                                              const matchingSupabaseBounty = supabaseBounties.find(b => b.id === bounty.id);
                                              if (matchingSupabaseBounty) {
                                                setSelectedBountyForCancellation(matchingSupabaseBounty);
                                                setShowCancellationDialog(true);
                                                setOpenBountyDetailId(null);
                                              }
                                            }}
                                          >
                                            <XCircle className="h-4 w-4 mr-1" />
                                            Cancel Bounty
                                          </Button>
                                          {/* Manager can also place a bid */}
                                          {canUserBid(bounty, address, tokenBalances, pods) && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="text-white hover:bg-[#6F8F86]"
                                              style={{ backgroundColor: '#8FAAA1', border: '1px solid #6F8F86' }}
                                              onClick={() => {
                                                console.log('🎯 Manager Apply for Bounty clicked');
                                                setSelectedBountyForBid(bounty);
                                                setShowBidForm(true);
                                                // Close the details dialog to avoid nested dialogs
                                                setOpenBountyDetailId(null);
                                              }}
                                            >
                                              🎯 Apply for Bounty
                                            </Button>
                                          )}
                                        </>
                                      )}
                                      {bounty.status === 1 && (
                                        <>
                                          <Button variant="outline" size="sm">
                                            <DollarSign className="h-4 w-4 mr-1" />
                                            Process Payment
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="border-orange-600 text-orange-600 hover:bg-orange-50"
                                            onClick={() => {
                                              console.log('⚖️ File Dispute clicked');
                                              const matchingSupabaseBounty = supabaseBounties.find(b => b.id === bounty.id);
                                              const approvedBid = userBids?.find(
                                                bid => bid.bountyId === bounty.id && bid.status === 'approved'
                                              );
                                              if (matchingSupabaseBounty) {
                                                setSelectedBountyForDispute(matchingSupabaseBounty);
                                                setSelectedBidForDispute(approvedBid || null);
                                                setShowDisputeFilingDialog(true);
                                                setOpenBountyDetailId(null);
                                              }
                                            }}
                                          >
                                            <Scale className="h-4 w-4 mr-1" />
                                            File Dispute
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {canManageBounties && (
          <>
            {console.log('🔧 Management tabs rendering:', { 
              canManageBounties, 
              activeTab, 
              podId,
              address 
            })}
            <TabsContent value="bids">
              <BidReviewManager
                onBidStatusChange={refreshBounties}
              />
            </TabsContent>

            <TabsContent value="work">
              {podId === 'all' ? (
                <Card>
                  <CardContent className="p-6">
                    <p className="text-gray-600 text-center">
                      Please select a specific pod to view work submissions
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <WorkSubmissionReview
                  podId={podId}
                  onReviewComplete={() => {
                    refreshBounties();
                    loadAllBids();
                  }}
                />
              )}
            </TabsContent>

            <TabsContent value="milestones">
              <div className="space-y-4">
                {/* Milestone bounties with individual payment controls */}
                {loading ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading milestone bounties...</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (() => {
                  // Filter for milestone bounties (payment_type = 'milestones')
                  const milestoneBounties = filteredBounties.filter(bounty => {
                    const supabaseBounty = convertedBounties.find(sb => sb.id === bounty.id);
                    return supabaseBounty?.payment_type === 'milestones' && bounty.status === 1; // assigned
                  });

                  console.log('🎯 MILESTONE BOUNTIES:', {
                    totalFiltered: filteredBounties.length,
                    milestoneBounties: milestoneBounties.length,
                    milestoneBountyIds: milestoneBounties.map(b => b.id)
                  });

                  if (milestoneBounties.length === 0) {
                    return (
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center py-8">
                            <p className="text-gray-600">No milestone bounties found.</p>
                            <p className="text-sm text-gray-500 mt-2">Milestone bounties will appear here when work is approved and ready for payment.</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }

                  return milestoneBounties.map((bounty) => {
                    const supabaseBounty = convertedBounties.find(sb => sb.id === bounty.id);
                    
                    return (
                      <MilestoneBountyCard
                        key={bounty.id}
                        bounty={bounty}
                        supabaseBounty={supabaseBounty!}
                        onRefreshData={() => {
                          refreshBounties();
                          loadAllBids();
                        }}
                      />
                    );
                  });
                })()}
              </div>
            </TabsContent>

            <TabsContent value="payments">
              <div className="space-y-4">
                {console.log('🎯 PAYMENTS TAB RENDERING:', {
                  activeTab,
                  canManageBounties,
                  loading,
                  filteredBountiesCount: filteredBounties.length,
                  totalBounties: bounties.length
                })}
                {/* Assigned bounties ready for payment (work approved, awaiting payment) */}
                {loading ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading payment-ready bounties...</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (() => {
                  // Debug: Check pay tab filtering
                  const assignedBounties = filteredBounties.filter(bounty => bounty.status === 1);
                  const bountyDetails = filteredBounties.map(b => ({ 
                    id: b.id, 
                    title: b.title, 
                    status: b.status,
                    statusLabel: b.status === 0 ? 'open' : b.status === 1 ? 'assigned' : b.status === 2 ? 'completed' : 'cancelled'
                  }));
                  
                  console.log('💰 Pay tab filtering:', {
                    totalFilteredBounties: filteredBounties.length,
                    assignedBounties: assignedBounties.length,
                    assignedBountyIds: assignedBounties.map(b => ({ id: b.id, title: b.title, status: b.status })),
                    userBidsCount: userBids?.length || 0
                  });
                  
                  console.log('📋 INDIVIDUAL BOUNTY STATUSES:', bountyDetails);
                  
                  return assignedBounties.length === 0;
                })() ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center py-8">
                        <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">No bounties ready for payment.</p>
                        <p className="text-sm text-gray-500 mt-2">
                          Assigned bounties will appear here when work is completed and ready for payment.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  filteredBounties
                    .filter(bounty => bounty.status === 1) // Assigned bounties with approved work
                    .map(bounty => {
                      console.log('💰 Processing bounty for payment:', {
                        bountyId: bounty.id,
                        bountyTitle: bounty.title,
                        bountyStatus: bounty.status
                      });
                      // Find the bid with approved work for this bounty
                      // Note: userBids contains ALL bids (not just current user's bids)
                      const approvedBid = userBids?.find(
                        bid => bid.bountyId === bounty.id && bid.status === 'work_approved'
                      );

                      console.log('💰 Finding approved bid for bounty', bounty.id, {
                        bountyId: bounty.id,
                        bountyStatus: bounty.status,
                        totalBids: userBids?.length || 0,
                        bidsForThisBounty: userBids?.filter(b => b.bountyId === bounty.id).length || 0,
                        bidsForThisBountyStatuses: userBids?.filter(b => b.bountyId === bounty.id).map(b => b.status) || [],
                        foundWorkApprovedBid: !!approvedBid,
                        workApprovedBidStatus: approvedBid?.status
                      });

                      // Find the matching Supabase bounty to get onchain_id and creator_address
                      const supabaseBounty = supabaseBounties.find(b => b.id === bounty.id);

                      // Validate required data
                      const hasRequiredData = !!(
                        supabaseBounty?.onchain_id &&
                        approvedBid?.id &&
                        approvedBid?.bidderAddress &&
                        (supabaseBounty?.creator_address || bounty.creator)
                      );

                      console.log('💰 Payment data check for bounty', bounty.id, {
                        onchain_id: supabaseBounty?.onchain_id,
                        approvedBid: approvedBid?.id,
                        bidderAddress: approvedBid?.bidderAddress,
                        creator_address: supabaseBounty?.creator_address || bounty.creator,
                        hasRequiredData
                      });

                      return (
                        <Card key={bounty.id}>
                          <CardHeader>
                            <CardTitle className="text-lg">{bounty.title || `Bounty #${bounty.id}`}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            {hasRequiredData ? (
                              <BountyCompletion
                                onchainBountyId={supabaseBounty!.onchain_id!.toString()}
                                bountyId={bounty.id}
                                bidId={approvedBid!.id}
                                bountyTitle={bounty.title || `Bounty #${bounty.id}`}
                                bountyValue={{
                                  amount: bounty.value || '0',
                                  token: bounty.token as 'SYSTEM' | 'SELF'
                                }}
                                bidderAddress={approvedBid!.bidderAddress}
                                creatorAddress={supabaseBounty!.creator_address || bounty.creator}
                                onComplete={() => {
                                  console.log('✅ Payment completed, refreshing bounties');
                                  refreshBounties();
                                  loadAllBids();
                                }}
                                onError={(error) => {
                                  console.error('❌ Payment failed:', error);
                                  alert(`Failed to release payment: ${error.message}`);
                                }}
                                onRefreshData={() => {
                                  console.log('🔄 Refreshing data after successful payment...');
                                  refreshBounties();
                                  loadAllBids();
                                }}
                              />
                            ) : (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                <p className="text-sm text-yellow-800">
                                  <strong>⚠️ Incomplete Data</strong>
                                </p>
                                <p className="text-xs text-yellow-700 mt-2">
                                  Missing required information for payment release:
                                </p>
                                <ul className="text-xs text-yellow-700 mt-1 ml-4 list-disc">
                                  {!supabaseBounty?.onchain_id && <li>On-chain bounty ID</li>}
                                  {!approvedBid && <li>Approved bid record</li>}
                                  {approvedBid && !approvedBid.bidderAddress && <li>Bidder address</li>}
                                  {!supabaseBounty?.creator_address && !bounty.creator && <li>Creator address</li>}
                                </ul>
                                <p className="text-xs text-yellow-700 mt-2">
                                  Please ensure the bounty was properly created on-chain and a bid was approved.
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })
                )}
              </div>
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Work Submission Form Dialog */}
      {showWorkSubmissionForm && selectedBountyForWorkSubmission && selectedBidForWorkSubmission && (
        <Dialog open={showWorkSubmissionForm} onOpenChange={setShowWorkSubmissionForm}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Submit Completed Work: {selectedBountyForWorkSubmission.title}</DialogTitle>
            </DialogHeader>
            <WorkSubmissionForm
              bounty={selectedBountyForWorkSubmission}
              bid={selectedBidForWorkSubmission}
              onSuccess={() => {
                console.log('✅ Work submitted successfully');
                setShowWorkSubmissionForm(false);
                setSelectedBountyForWorkSubmission(null);
                setSelectedBidForWorkSubmission(null);
                refreshBounties();
                loadAllBids();
              }}
              onCancel={() => {
                setShowWorkSubmissionForm(false);
                setSelectedBountyForWorkSubmission(null);
                setSelectedBidForWorkSubmission(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Bid Form Dialog */}
      {showBidForm && selectedBountyForBid && (
        <Dialog open={showBidForm} onOpenChange={setShowBidForm}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingBid ? 'Edit Application' : 'Apply for Bounty'}: {selectedBountyForBid.title || `Bounty #${selectedBountyForBid.id}`}
              </DialogTitle>
            </DialogHeader>
            <BidForm
              bounty={(() => {
                const matchingBounty = supabaseBounties.find(b => b.id === selectedBountyForBid.id);
                const onchainId = matchingBounty?.onchain_id;

                console.log('🎯 Preparing BidForm bounty prop:', {
                  selectedBountyId: selectedBountyForBid.id,
                  matchingBountyFound: !!matchingBounty,
                  onchain_id: onchainId,
                  walletConnected: !!address,
                  supabaseBountiesCount: supabaseBounties.length
                });

                return {
                  id: selectedBountyForBid.id,
                  onchain_id: onchainId,
                  title: selectedBountyForBid.title,
                  description: '',  // These would need to be fetched from full bounty details
                  category: selectedBountyForBid.category,
                  value: {
                    amount: selectedBountyForBid.value,
                    token: selectedBountyForBid.token as 'SYSTEM' | 'SELF'
                  },
                  requirements: [],
                  questions: []
                };
              })()}
              isEditing={!!editingBid}
              initialData={editingBid ? {
                experience: editingBid.experience,
                planOfAction: editingBid.planOfAction,
                deliverables: editingBid.deliverables.map((d: any) => ({
                  id: Math.random().toString(36).substr(2, 9),
                  description: d.description,
                  dueDate: new Date(d.due_date || d.dueDate),
                  paymentAmount: d.payment_amount || d.paymentAmount
                })),
                timeline: editingBid.timeline,
                proposedAmount: editingBid.proposedAmount,
                paymentOption: editingBid.paymentOption,
                paymentDetails: editingBid.paymentDetails,
                additionalNotes: editingBid.additionalNotes,
                answers: editingBid.answers
              } : undefined}
              onBidPlaced={async (bidData, ipfsHash, txHash, bidIndex) => {
                try {
                  const isEditing = !!editingBid;
                  console.log(isEditing ? '✅ Updating bid:' : '✅ Bid placed on-chain:', {
                    bidData,
                    ipfsHash,
                    txHash,
                    bidIndex
                  });

                  if (isEditing) {
                    // Update existing bid
                    await updateBid(editingBid.id, {
                      bountyId: selectedBountyForBid.id,
                      experience: bidData.experience,
                      planOfAction: bidData.planOfAction,
                      deliverables: bidData.deliverables,
                      timeline: bidData.timeline,
                      proposedAmount: bidData.proposedAmount,
                      paymentOption: bidData.paymentOption,
                      paymentDetails: bidData.paymentDetails,
                      answers: bidData.answers,
                      additionalNotes: bidData.additionalNotes
                    });

                    console.log('✅ Bid updated successfully');
                    alert('✅ Your application has been updated successfully!');
                  } else {
                    // Submit new bid with on-chain details
                    await submitBid({
                      bountyId: selectedBountyForBid.id,
                      experience: bidData.experience,
                      planOfAction: bidData.planOfAction,
                      deliverables: bidData.deliverables,
                      timeline: bidData.timeline,
                      proposedAmount: bidData.proposedAmount,
                      paymentOption: bidData.paymentOption,
                      paymentDetails: bidData.paymentDetails,
                      answers: bidData.answers,
                      additionalNotes: bidData.additionalNotes,
                      // On-chain tracking fields
                      onchainBidIndex: bidIndex,
                      placementTxHash: txHash,
                      bidIpfsHash: ipfsHash
                    });

                    console.log('✅ Bid submitted to Supabase successfully');
                    alert('✅ Your bid has been submitted successfully! You can view it in the Bid Reviews section.');
                  }

                  // Close both dialogs and reset editing state
                  setShowBidForm(false);
                  setOpenBountyDetailId(null);
                  setEditingBid(null);

                  // Reload data
                  await Promise.all([
                    refreshBounties(),
                    loadAllBids()
                  ]);
                } catch (error) {
                  console.error('❌ Error saving bid to database:', error);
                  alert(`Bid was placed on-chain but failed to save to database: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }}
              onCancel={() => {
                setShowBidForm(false);
                setEditingBid(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Bounty Cancellation Dialog */}
      {showCancellationDialog && selectedBountyForCancellation && (
        <BountyCancellationDialog
          bounty={selectedBountyForCancellation}
          open={showCancellationDialog}
          onOpenChange={setShowCancellationDialog}
          onSuccess={() => {
            console.log('✅ Bounty cancelled successfully');
            setShowCancellationDialog(false);
            setSelectedBountyForCancellation(null);
            refreshBounties();
          }}
        />
      )}

      {/* Dispute Filing Dialog */}
      {showDisputeFilingDialog && selectedBountyForDispute && (
        <DisputeFilingDialog
          bounty={selectedBountyForDispute}
          bid={selectedBidForDispute || undefined}
          open={showDisputeFilingDialog}
          onOpenChange={setShowDisputeFilingDialog}
          onSuccess={(disputeId) => {
            console.log('✅ Dispute filed successfully:', disputeId);
            setShowDisputeFilingDialog(false);
            setSelectedBountyForDispute(null);
            setSelectedBidForDispute(null);
            // Show the dispute dashboard
            setSelectedDisputeId(disputeId);
            setShowDisputeDashboard(true);
          }}
        />
      )}

      {/* Dispute Management Dashboard */}
      {showDisputeDashboard && selectedDisputeId && (
        <Dialog open={showDisputeDashboard} onOpenChange={setShowDisputeDashboard}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Dispute Management</DialogTitle>
            </DialogHeader>
            <DisputeManagementDashboard
              disputeId={selectedDisputeId}
              onClose={() => {
                setShowDisputeDashboard(false);
                setSelectedDisputeId(null);
                refreshBounties();
              }}
            />
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
};