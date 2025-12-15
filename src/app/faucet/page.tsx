'use client';

import { useState, useEffect } from 'react';
import { useEvmAddress, useCurrentUser, useSendEvmTransaction } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import { Droplets, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const FAUCET_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_FAUCET as `0x${string}`;
const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
const SELF_TOKEN = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;

const FAUCET_ABI = [
  {
    inputs: [],
    name: 'claimTokens',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'canClaim',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getTimeUntilNextClaim',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getFaucetBalances',
    outputs: [
      { name: 'systemBalance', type: 'uint256' },
      { name: 'selfBalance', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'systemClaimAmount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'selfClaimAmount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

function formatTimeRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

export default function FaucetPage() {
  const { evmAddress } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const publicClient = usePublicClient();
  const { toast } = useToast();
  const { sendEvmTransaction } = useSendEvmTransaction();

  //Debug: Log wallet connection status
  console.log('🔧 Faucet - Wallet Status:', {
    cdpAddress: evmAddress,
    connected: !!evmAddress && !!currentUser,
  });

  const [canClaim, setCanClaim] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [faucetBalances, setFaucetBalances] = useState({ system: '0', self: '0' });
  const [claimAmounts, setClaimAmounts] = useState({ system: '10', self: '10' });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Fetch faucet data
  const fetchFaucetData = async () => {
    if (!evmAddress || !FAUCET_ADDRESS || !publicClient) return;

    try {
      // Check if user can claim
      const canClaimResult = await publicClient.readContract({
        address: FAUCET_ADDRESS,
        abi: FAUCET_ABI,
        functionName: 'canClaim',
        args: [evmAddress],
      });
      setCanClaim(canClaimResult);

      // Get time until next claim
      if (!canClaimResult) {
        const timeResult = await publicClient.readContract({
          address: FAUCET_ADDRESS,
          abi: FAUCET_ABI,
          functionName: 'getTimeUntilNextClaim',
          args: [evmAddress],
        });
        setTimeRemaining(Number(timeResult));
      }

      // Get faucet balances
      const balances = await publicClient.readContract({
        address: FAUCET_ADDRESS,
        abi: FAUCET_ABI,
        functionName: 'getFaucetBalances',
      });
      setFaucetBalances({
        system: formatEther(balances[0]),
        self: formatEther(balances[1]),
      });

      // Get claim amounts
      const systemAmount = await publicClient.readContract({
        address: FAUCET_ADDRESS,
        abi: FAUCET_ABI,
        functionName: 'systemClaimAmount',
      });
      const selfAmount = await publicClient.readContract({
        address: FAUCET_ADDRESS,
        abi: FAUCET_ABI,
        functionName: 'selfClaimAmount',
      });
      setClaimAmounts({
        system: formatEther(systemAmount),
        self: formatEther(selfAmount),
      });
    } catch (err) {
      console.error('Error fetching faucet data:', err);
    }
  };

  useEffect(() => {
    fetchFaucetData();
    // Refresh data every 10 seconds
    const interval = setInterval(fetchFaucetData, 10000);
    return () => clearInterval(interval);
  }, [evmAddress]);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          setCanClaim(true);
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  const handleClaim = async () => {
    if (!canClaim || !evmAddress) {
      toast({
        title: 'Error',
        description: 'Wallet not connected or cooldown active',
        variant: 'destructive',
      });
      return;
    }

    setIsClaiming(true);
    setError(null);

    try {
      console.log('🔄 Calling claimTokens...');

      const result = await sendEvmTransaction({
        to: FAUCET_ADDRESS,
        abi: FAUCET_ABI,
        functionName: 'claimTokens',
        args: [],
      });

      console.log('✅ Transaction successful:', result);

      toast({
        title: 'Tokens claimed!',
        description: `Transaction hash: ${result.hash?.substring(0, 10) || 'Success'}...`,
      });

      setSuccess(true);
      setCanClaim(false);
      setTimeRemaining(86400); // 24 hours

      // Refresh data after claim
      setTimeout(fetchFaucetData, 2000);
    } catch (err: any) {
      console.error('❌ Transaction error:', err);
      const errorMessage = err.message || 'Failed to claim tokens';
      setError(errorMessage);
      toast({
        title: 'Claim failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsClaiming(false);
    }
  };

  const isConnected = !!evmAddress && !!currentUser;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F5F4ED',
        paddingBottom: 'var(--bottom-nav-height, 80px)',
      }}
    >
      <div
        style={{
          maxWidth: '600px',
          margin: '0 auto',
          padding: '24px',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <Droplets size={48} color="#2F5D50" />
          <div>
            <h1
              style={{
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#2F5D50',
                margin: 0,
              }}
            >
              Token Faucet
            </h1>
            <p
              style={{
                fontSize: '14px',
                color: '#6B7280',
                margin: 0,
              }}
            >
              Claim free tokens once per day
            </p>
          </div>
        </div>

        {/* Connection Required */}
        {!isConnected && (
          <div
            style={{
              background: '#FAF4EC',
              border: '1px solid #E8D7B8',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <XCircle size={24} color="#C6933F" />
              <div>
                <p
                  style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#92400E',
                    margin: 0,
                  }}
                >
                  Wallet Not Connected
                </p>
                <p
                  style={{
                    fontSize: '14px',
                    color: '#92400E',
                    margin: '4px 0 0 0',
                  }}
                >
                  Please connect your wallet to claim tokens
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Faucet Info */}
        {isConnected && (
          <>
            {/* Claim Amounts */}
            <div
              style={{
                background: '#E8F1EE',
                border: '1px solid #B8D9CA',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '16px',
              }}
            >
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#2F5D50',
                  marginBottom: '16px',
                }}
              >
                Claim Amount
              </h2>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      color: '#6B7280',
                      marginBottom: '4px',
                    }}
                  >
                    SYSTEM Tokens
                  </div>
                  <div
                    style={{
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: '#2F5D50',
                    }}
                  >
                    {claimAmounts.system}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      color: '#6B7280',
                      marginBottom: '4px',
                    }}
                  >
                    SELF Tokens
                  </div>
                  <div
                    style={{
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: '#2F5D50',
                    }}
                  >
                    {claimAmounts.self}
                  </div>
                </div>
              </div>
            </div>

            {/* Faucet Balances */}
            <div
              style={{
                background: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  fontSize: '14px',
                  color: '#6B7280',
                  marginBottom: '8px',
                }}
              >
                Faucet Reserves
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
                <div>
                  <span style={{ color: '#6B7280' }}>SYSTEM: </span>
                  <span style={{ fontWeight: '600', color: '#374151' }}>
                    {parseFloat(faucetBalances.system).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#6B7280' }}>SELF: </span>
                  <span style={{ fontWeight: '600', color: '#374151' }}>
                    {parseFloat(faucetBalances.self).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Cooldown Timer */}
            {!canClaim && timeRemaining > 0 && (
              <div
                style={{
                  background: '#FAF4EC',
                  border: '1px solid #E8D7B8',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '24px',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
                >
                  <Clock size={24} color="#C6933F" />
                  <div>
                    <p
                      style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#92400E',
                        margin: 0,
                      }}
                    >
                      Cooldown Active
                    </p>
                    <p
                      style={{
                        fontSize: '14px',
                        color: '#92400E',
                        margin: '4px 0 0 0',
                      }}
                    >
                      Next claim available in{' '}
                      <strong>{formatTimeRemaining(timeRemaining)}</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div
                style={{
                  background: '#D1E6DC',
                  border: '1px solid #B8D9CA',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '24px',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
                >
                  <CheckCircle size={24} color="#3F7A5A" />
                  <div>
                    <p
                      style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#2F5D50',
                        margin: 0,
                      }}
                    >
                      Tokens Claimed Successfully!
                    </p>
                    <p
                      style={{
                        fontSize: '14px',
                        color: '#2F5D50',
                        margin: '4px 0 0 0',
                      }}
                    >
                      {claimAmounts.system} SYSTEM and {claimAmounts.self} SELF
                      tokens have been sent to your wallet
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div
                style={{
                  background: '#F5E6E6',
                  border: '1px solid #D9B3B3',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '24px',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
                >
                  <XCircle size={24} color="#8B3A3A" />
                  <div>
                    <p
                      style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#8B3A3A',
                        margin: 0,
                      }}
                    >
                      Claim Failed
                    </p>
                    <p
                      style={{
                        fontSize: '14px',
                        color: '#8B3A3A',
                        margin: '4px 0 0 0',
                      }}
                    >
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Claim Button */}
            <button
              onClick={handleClaim}
              disabled={!canClaim || isClaiming}
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '18px',
                fontWeight: '600',
                color: 'white',
                background: canClaim && !isClaiming ? '#2F5D50' : '#D8D2C8',
                border: 'none',
                borderRadius: '12px',
                cursor: canClaim && !isClaiming ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
              onMouseEnter={(e) => {
                if (canClaim && !isClaiming) {
                  e.currentTarget.style.background = '#254A40';
                }
              }}
              onMouseLeave={(e) => {
                if (canClaim && !isClaiming) {
                  e.currentTarget.style.background = '#2F5D50';
                }
              }}
            >
              {isClaiming ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Claiming...
                </>
              ) : canClaim ? (
                <>
                  <Droplets size={20} />
                  Claim Tokens
                </>
              ) : (
                <>
                  <Clock size={20} />
                  Cooldown Active
                </>
              )}
            </button>

            {/* Instructions */}
            <div
              style={{
                marginTop: '24px',
                padding: '16px',
                background: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
              }}
            >
              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#374151',
                  marginBottom: '12px',
                }}
              >
                How it works
              </h3>
              <ul
                style={{
                  fontSize: '14px',
                  color: '#6B7280',
                  margin: 0,
                  paddingLeft: '20px',
                  lineHeight: '1.6',
                }}
              >
                <li>Claim {claimAmounts.system} SYSTEM and {claimAmounts.self} SELF tokens</li>
                <li>One claim per wallet every 24 hours</li>
                <li>Completely free - no gas fees required</li>
                <li>Use tokens to participate in governance and marketplace</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
