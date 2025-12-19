'use client';

import type React from 'react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  CalendarIcon,
  CheckCircle,
  Clock,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import type { Abi } from 'viem';
import { encodeFunctionData } from 'viem';
import { Loader2 } from 'lucide-react';
import BountyManagerABIJson from '@/abis/BountyManagerV2.json';
import {
  useBountyContractEnhanced,
  type PaymentStructure,
} from '../hooks/useBountyContractEnhanced';

const BountyManagerABI = BountyManagerABIJson as Abi;

interface Milestone {
  id: string;
  description: string;
  dueDate: Date;
  paymentAmount: string;
  status: 'pending' | 'completed' | 'overdue';
  completedAt?: Date;
  completedBy?: string;
}

interface BountyDetails {
  id: string;
  title: string;
  paymentStructure: PaymentStructure;
  totalValue: string;
  token: 'SYSTEM' | 'SELF';
}

interface MilestoneManagerProps {
  bounty: BountyDetails;
  milestones: Milestone[];
  onMilestonesCreated?: (milestones: Milestone[]) => void;
  onMilestoneApproved?: (milestoneId: string) => void;
}

export const MilestoneManager: React.FC<MilestoneManagerProps> = ({
  bounty,
  milestones,
  onMilestonesCreated,
  onMilestoneApproved,
}) => {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newMilestones, setNewMilestones] = useState<
    Omit<Milestone, 'id' | 'status'>[]
  >([]);
  const [showCalendar, setShowCalendar] = useState<string | null>(null);
  const [isTransactionPending, setIsTransactionPending] = useState<{
    [key: string]: boolean;
  }>({});

  const { createMilestonesOnChain, approveMilestoneOnChain, PaymentStructure } =
    useBountyContractEnhanced();

  const addMilestone = () => {
    const newMilestone: Omit<Milestone, 'id' | 'status'> = {
      description: '',
      dueDate: new Date(),
      paymentAmount: '0',
    };
    setNewMilestones((prev) => [...prev, newMilestone]);
  };

  const updateMilestone = (
    index: number,
    field: keyof Omit<Milestone, 'id' | 'status'>,
    value: any,
  ) => {
    setNewMilestones((prev) =>
      prev.map((milestone, i) =>
        i === index ? { ...milestone, [field]: value } : milestone,
      ),
    );
  };

  const removeMilestone = (index: number) => {
    setNewMilestones((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateMilestones = async () => {
    if (newMilestones.length === 0) return;

    try {
      const descriptions = newMilestones.map((m) => m.description);
      const dueDates = newMilestones.map((m) =>
        Math.floor(m.dueDate.getTime() / 1000),
      );
      const paymentAmounts = newMilestones.map((m) => m.paymentAmount);

      await createMilestonesOnChain(
        Number.parseInt(bounty.id),
        descriptions,
        dueDates,
        paymentAmounts,
      );

      // Create frontend milestone objects
      const createdMilestones: Milestone[] = newMilestones.map((m, index) => ({
        id: `temp-${index}`,
        description: m.description,
        dueDate: m.dueDate,
        paymentAmount: m.paymentAmount,
        status: 'pending',
      }));

      onMilestonesCreated?.(createdMilestones);
      setNewMilestones([]);
      setShowCreateForm(false);
    } catch (error) {
      console.error('Error creating milestones:', error);
    }
  };

  const handleApproveMilestone = async (milestoneId: string) => {
    try {
      await approveMilestoneOnChain(
        Number.parseInt(bounty.id),
        Number.parseInt(milestoneId),
      );
      onMilestoneApproved?.(milestoneId);
    } catch (error) {
      console.error('Error approving milestone:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> Pending
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="default" className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Completed
          </Badge>
        );
      case 'overdue':
        return (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Overdue
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const calculateTotalMilestoneAmount = () => {
    return newMilestones.reduce(
      (total, milestone) =>
        total + Number.parseFloat(milestone.paymentAmount || '0'),
      0,
    );
  };

  const isMilestoneAmountValid = () => {
    const total = calculateTotalMilestoneAmount();
    return Math.abs(total - Number.parseFloat(bounty.totalValue)) < 0.01; // Allow small rounding differences
  };

  // CDP Smart Account transaction handler - EXACT FAUCET PATTERN
  const handleApproveMilestoneTransaction = async (milestoneId: string) => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for milestone approval:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending({ ...isTransactionPending, [milestoneId]: true }); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 Building Smart Account User Operation for milestone approval...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: BountyManager - approveMilestone');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      const contractAddress = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

      // EXACT FAUCET PATTERN: Encode call data
      const callData = encodeFunctionData({
        abi: BountyManagerABI,
        functionName: 'approveMilestone',
        args: [Number.parseInt(bounty.id), Number.parseInt(milestoneId)],
      });

      console.log('📝 Encoded call data for approveMilestone');

      // EXACT FAUCET PATTERN: Send user operation
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: [{
          to: contractAddress,
          value: 0n,                     // ← Zero ETH (bigint)
          data: callData,
        }],
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation sent successfully!', result);
      console.log('✅ Milestone approved successfully:', milestoneId);

      // Call success handler
      onMilestoneApproved?.(milestoneId);
    } catch (err: any) {
      console.error('❌ Milestone approval failed:', err);
    } finally {
      setIsTransactionPending({ ...isTransactionPending, [milestoneId]: false }); // EXACT FAUCET PATTERN
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Milestones</h2>
        {bounty.paymentStructure === PaymentStructure.Milestones &&
          !showCreateForm && (
            <Button
              onClick={() => setShowCreateForm(true)}
              className="bounty-btn primary"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Milestones
            </Button>
          )}
      </div>

      {/* Create Milestones Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create Milestones</CardTitle>
            <p className="text-sm text-gray-600">
              Total bounty value: {bounty.totalValue} {bounty.token}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {newMilestones.map((milestone, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <h4 className="font-medium">Milestone {index + 1}</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeMilestone(index)}
                    style={{ color: '#8B3A3A' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#5C1F1F';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#8B3A3A';
                    }}
                  >
                    Remove
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Description</Label>
                  <Textarea
                    value={milestone.description}
                    onChange={(e) =>
                      updateMilestone(index, 'description', e.target.value)
                    }
                    placeholder="Describe this milestone..."
                    className="form-textarea"
                    required={true}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Due Date</Label>
                    <Popover
                      open={showCalendar === `new-${index}`}
                      onOpenChange={(open) =>
                        setShowCalendar(open ? `new-${index}` : null)
                      }
                    >
                      <PopoverTrigger asChild={true}>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !milestone.dueDate && 'text-muted-foreground',
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {milestone.dueDate
                            ? format(milestone.dueDate, 'PPP')
                            : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={milestone.dueDate}
                          onSelect={(date) => {
                            updateMilestone(index, 'dueDate', date);
                            setShowCalendar(null);
                          }}
                          initialFocus={true}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">
                      Payment Amount ({bounty.token})
                    </Label>
                    <Input
                      type="number"
                      value={milestone.paymentAmount}
                      onChange={(e) =>
                        updateMilestone(index, 'paymentAmount', e.target.value)
                      }
                      placeholder="0"
                      className="form-input"
                      required={true}
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex justify-between items-center">
              <Button
                onClick={addMilestone}
                variant="outline"
                className="bounty-btn secondary"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Milestone
              </Button>

              <div className="text-right">
                <p className="text-sm text-gray-600">
                  Total: {calculateTotalMilestoneAmount().toFixed(2)}{' '}
                  {bounty.token}
                </p>
                {!isMilestoneAmountValid() && (
                  <p className="text-sm" style={{ color: '#8B3A3A' }}>
                    Total must equal {bounty.totalValue} {bounty.token}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleCreateMilestones}
                disabled={
                  newMilestones.length === 0 || !isMilestoneAmountValid()
                }
                className="bounty-btn primary"
              >
                Create Milestones
              </Button>
              <Button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewMilestones([]);
                }}
                variant="outline"
                className="bounty-btn secondary"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Milestones */}
      {milestones.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Current Milestones</h3>
          {milestones.map((milestone) => (
            <Card
              key={milestone.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">{milestone.description}</h4>
                      {getStatusBadge(milestone.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="w-4 h-4" />
                        Due: {format(milestone.dueDate, 'MMM dd, yyyy')}
                      </span>
                      <span className="font-medium">
                        {milestone.paymentAmount} {bounty.token}
                      </span>
                    </div>
                  </div>

                  {milestone.status === 'pending' && (
                    evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
                      <Button
                        onClick={() => handleApproveMilestoneTransaction(milestone.id)}
                        disabled={isTransactionPending[milestone.id]}
                        className="bounty-btn primary disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {isTransactionPending[milestone.id] ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                            Approving...
                          </>
                        ) : (
                          'Approve Milestone (Gasless)'
                        )}
                      </Button>
                    ) : (
                      <div
                        className="px-4 py-2 rounded text-sm"
                        style={{
                          backgroundColor: '#F5E6E6',
                          borderWidth: '1px',
                          borderStyle: 'solid',
                          borderColor: '#D9B3B3',
                          color: '#5C1F1F',
                        }}
                      >
                        Wallet not connected
                      </div>
                    )
                  )}
                </div>

                {milestone.status === 'completed' && (
                  <div
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: '#D1E6DC' }}
                  >
                    <p className="text-sm" style={{ color: '#1F453A' }}>
                      Completed on{' '}
                      {milestone.completedAt
                        ? format(milestone.completedAt, 'MMM dd, yyyy')
                        : 'Unknown date'}
                      {milestone.completedBy && ` by ${milestone.completedBy}`}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {milestones.length === 0 && !showCreateForm && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-gray-600">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No milestones created yet.</p>
              {bounty.paymentStructure === PaymentStructure.Milestones && (
                <p className="text-sm mt-2">
                  Create milestones to enable milestone-based payments.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
