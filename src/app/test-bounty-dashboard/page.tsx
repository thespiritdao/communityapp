'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import Link from 'next/link';

const SYSTEM_TOKEN_ADDRESS = '0x1317Ae277266D38C4E492558f8693F14143a6A65';
const BOUNTY_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

interface TestScenario {
  id: string;
  title: string;
  description: string;
  url: string;
  status: 'ready' | 'warning' | 'blocked';
  requirements: string[];
  icon: string;
}

export default function TestBountyDashboardPage() {
  const { address, isConnected } = useAccount();
  const { isPodLeader, hasPermission } = useHatPermissions();
  const [systemHealth, setSystemHealth] = useState<{
    walletBalance: string;
    contractBalance: string;
    contractAddress: string | null;
    hasBountyPermission: boolean;
    isPodManager: boolean;
  }>({
    walletBalance: '0',
    contractBalance: '0',
    contractAddress: null,
    hasBountyPermission: false,
    isPodManager: false
  });

  // Read user's SYSTEM token balance
  const { data: walletBalance } = useReadContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    watch: true
  });

  // Read bounty contract's escrow balance
  const { data: contractBalance } = useReadContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: BOUNTY_MANAGER_ADDRESS ? [BOUNTY_MANAGER_ADDRESS] : undefined,
    watch: true
  });

  useEffect(() => {
    const bountyPermission = hasPermission('bountyManagement');
    setSystemHealth({
      walletBalance: walletBalance ? formatEther(walletBalance) : '0',
      contractBalance: contractBalance ? formatEther(contractBalance) : '0',
      contractAddress: BOUNTY_MANAGER_ADDRESS,
      hasBountyPermission: bountyPermission,
      isPodManager: isPodLeader
    });
  }, [walletBalance, contractBalance, isPodLeader]); // Removed hasPermission from deps

  const testScenarios: TestScenario[] = [
    {
      id: 'wallet-escrow',
      title: 'Wallet Escrow Testing',
      description: 'Test bounty creation from wallet with token escrow and cancellation',
      url: '/test-bounty-escrow',
      status: parseFloat(systemHealth.walletBalance) > 0 ? 'ready' : 'warning',
      requirements: ['SYSTEM tokens in wallet', 'Connected wallet'],
      icon: '💰'
    },
    {
      id: 'bounty-lifecycle',
      title: 'Complete Bounty Lifecycle',
      description: 'Test bid placement, assignment, and payment release',
      url: '/test-bounty-complete',
      status: 'ready',
      requirements: ['Existing bounty ID', 'Multiple test addresses'],
      icon: '🔄'
    },
    {
      id: 'pod-treasury',
      title: 'Pod Treasury Funding',
      description: 'Create bounties funded from pod treasuries',
      url: '/test-bounty-pod-treasury',
      status: systemHealth.isPodManager ? 'ready' : 'blocked',
      requirements: ['Pod leader permissions', 'Treasury with SYSTEM tokens'],
      icon: '🏛️'
    },
    {
      id: 'multi-wallet',
      title: 'Multi-Wallet Setup',
      description: 'Generate test wallets for full lifecycle testing',
      url: '#multi-wallet',
      status: 'ready',
      requirements: ['None - generates new wallets'],
      icon: '👥'
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'bg-green-100 text-green-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'blocked': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready': return 'Ready';
      case 'warning': return 'Check Requirements';
      case 'blocked': return 'Missing Permissions';
      default: return 'Unknown';
    }
  };

  const generateTestWallets = () => {
    const wallets = [];
    for (let i = 0; i < 3; i++) {
      // This would be better done server-side or with a proper crypto library
      const randomBytes = crypto.getRandomValues(new Uint8Array(32));
      const privateKey = '0x' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Note: This is a simplified example. In practice, you'd use ethers.js
      wallets.push({
        role: ['Bidder', 'Reviewer', 'Approver'][i],
        privateKey,
        address: 'Generated address would be here'
      });
    }
    
    console.log('Generated test wallets:', wallets);
    alert('Test wallets generated! Check console for details.');
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">🧪 Bounty Escrow Testing Dashboard</h1>
        <Link href="/bounty">
          <Button variant="outline">Back to Bounties</Button>
        </Link>
      </div>

      {/* System Health Check */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>📊 System Health Check</CardTitle>
        </CardHeader>
        <CardContent>
          {!isConnected ? (
            <Alert className="bg-red-50">
              <AlertDescription>
                ❌ Wallet not connected. Please connect your wallet to continue.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 border rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{systemHealth.walletBalance}</div>
                <div className="text-sm text-gray-600">SYSTEM in Wallet</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">{systemHealth.contractBalance}</div>
                <div className="text-sm text-gray-600">Contract Escrow</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className={`text-lg font-bold ${systemHealth.hasBountyPermission ? 'text-green-600' : 'text-red-600'}`}>
                  {systemHealth.hasBountyPermission ? '✅' : '❌'}
                </div>
                <div className="text-sm text-gray-600">Bounty Permissions</div>
              </div>
              <div className="text-center p-3 border rounded-lg">
                <div className={`text-lg font-bold ${systemHealth.isPodManager ? 'text-green-600' : 'text-red-600'}`}>
                  {systemHealth.isPodManager ? '✅' : '❌'}
                </div>
                <div className="text-sm text-gray-600">Pod Manager</div>
              </div>
            </div>
          )}

          {systemHealth.contractAddress && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Bounty Manager Contract:</p>
              <code className="text-xs font-mono">{systemHealth.contractAddress}</code>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Scenarios */}
      <div className="grid gap-6 md:grid-cols-2">
        {testScenarios.map((scenario) => (
          <Card key={scenario.id} className="relative">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <span>{scenario.icon}</span>
                    {scenario.title}
                  </CardTitle>
                </div>
                <Badge className={getStatusColor(scenario.status)}>
                  {getStatusText(scenario.status)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">{scenario.description}</p>
              
              <div className="mb-4">
                <p className="text-sm font-medium mb-2">Requirements:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  {scenario.requirements.map((req, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                      {req}
                    </li>
                  ))}
                </ul>
              </div>

              {scenario.id === 'multi-wallet' ? (
                <Button 
                  onClick={generateTestWallets}
                  className="w-full"
                  variant="outline"
                >
                  Generate Test Wallets
                </Button>
              ) : (
                <Link href={scenario.url}>
                  <Button 
                    className="w-full" 
                    disabled={scenario.status === 'blocked'}
                    variant={scenario.status === 'ready' ? 'default' : 'outline'}
                  >
                    {scenario.status === 'blocked' ? 'Missing Permissions' : 'Start Test'}
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>⚡ Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" asChild>
              <Link href="/bounty">View All Bounties</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="https://basescan.org/address/{BOUNTY_MANAGER_ADDRESS}" target="_blank">
                View Contract on BaseScan
              </Link>
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Testing Guide */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>📚 Testing Guide</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              <strong>Recommended Testing Flow:</strong>
              <br />
              1. Start with "Wallet Escrow Testing" to create a test bounty
              <br />
              2. Note the bounty ID from the success message
              <br />
              3. Use "Complete Bounty Lifecycle" to test the full flow
              <br />
              4. Try "Pod Treasury Funding" if you have pod permissions
              <br />
              5. Generate test wallets for multi-party testing
              <br />
              <br />
              💡 <strong>Tip:</strong> Keep the browser console open to see detailed transaction logs
            </AlertDescription>
          </Alert>

          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">What Each Test Verifies</h4>
            <div className="space-y-2 text-sm text-blue-700">
              <div><strong>Wallet Escrow:</strong> Token approval, escrow mechanics, cancellation refunds</div>
              <div><strong>Lifecycle:</strong> Bid placement, assignment, payment release from escrow</div>
              <div><strong>Pod Treasury:</strong> Treasury funding, permission checks, pod-managed escrow</div>
              <div><strong>Multi-Wallet:</strong> Realistic multi-party bounty workflows</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}