'use client';

import type React from 'react';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { 
  Transaction, 
  TransactionButton, 
  TransactionSponsor, 
  TransactionStatus, 
  TransactionStatusLabel, 
  TransactionStatusAction 
} from "@coinbase/onchainkit/transaction";
import { base } from 'viem/chains';

// Your deployed contract address
const POD_CREATION_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_POD_CREATION_MANAGER || '0x43C124Df0dFb324CCC742808D9FdF62C764f2644') as `0x${string}`;

// ABI for createPodProposal function
const POD_CREATION_MANAGER_ABI = [
  {
    name: "createPodProposal",
    type: "function", 
    inputs: [
      { name: "podId", type: "string" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "imageURI", type: "string" },
      { name: "podLeads", type: "address[]" },
      { name: "parentHatId", type: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable",
  }
];

interface PodForRegistration {
  id: string;
  name: string;
  description: string;
  imageURI: string;
  podLeads: string[];
  parentHatId: string;
  pod_leader_hat_id: string;
}

export const PodRegistrationManager: React.FC = () => {
  const { address } = useAccount();
  const { toast } = useToast();
  const [selectedPodId, setSelectedPodId] = useState<string>('');

  // Executive Pod data from the database - needs to be registered in smart contract
  const podsToRegister: PodForRegistration[] = [
    {
      id: 'executive-pod',
      name: 'Executive Pod',
      description: 'Core leadership and governance pod responsible for strategic decision-making and DAO operations oversight.',
      imageURI: 'https://ui-avatars.com/api/?name=Executive+Pod&size=400&background=bfe7c6&color=000&bold=true',
      podLeads: [
        // These should be the actual Executive Pod lead addresses
        address || '0x0000000000000000000000000000000000000000' // For now, use connected user
      ],
      parentHatId: '0x0000008800000000000000000000000000000000000000000000000000000000', // Root DAO HAT
      pod_leader_hat_id: '0x0000008800010000000000000000000000000000000000000000000000000000'
    }
  ];

  const prepareRegistrationCalls = (podId: string) => {
    const pod = podsToRegister.find(p => p.id === podId);
    if (!pod) {
      throw new Error(`Pod ${podId} not found`);
    }

    if (!POD_CREATION_MANAGER_ADDRESS) {
      throw new Error('POD_CREATION_MANAGER_ADDRESS not configured');
    }

    return [{
      to: POD_CREATION_MANAGER_ADDRESS,
      abi: POD_CREATION_MANAGER_ABI,
      functionName: 'createPodProposal',
      args: [
        pod.id,
        pod.name,
        pod.description,
        pod.imageURI,
        pod.podLeads,
        BigInt(pod.parentHatId)
      ]
    }];
  };

  const handleRegistrationSuccess = async (podId: string, response: any) => {
    console.log('✅ Pod registration successful:', { podId, response });
    
    toast({
      title: "Pod Registered!",
      description: `${podsToRegister.find(p => p.id === podId)?.name} has been registered in the smart contract`,
    });

    const receipt = response?.transactionReceipts?.[0];
    if (receipt) {
      console.log('📋 Transaction Receipt:', receipt);
      console.log('🎩 Pod is now registered and ready for activation via activatePod()');
      
      // Log the next step
      console.log('📝 Next steps:', {
        step1: `Pod ${podId} is now registered in contract storage`,
        step2: `You can now call activatePod("${podId}") to deploy treasury`,
        step3: 'Visit /pods/treasury to complete treasury deployment'
      });
      
      // Show next step notification after a delay
      setTimeout(() => {
        toast({
          title: "Ready for Treasury Deployment",
          description: "Visit the Treasury page to complete pod activation and deploy treasury contracts."
        });
      }, 3000);
    }
  };

  const handleRegistrationError = (error: any) => {
    console.error('❌ Pod registration failed:', error);
    toast({
      title: "Registration Failed",
      description: error.message || "Failed to register pod in smart contract",
      variant: "destructive"
    });
  };

  if (!address) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>🎩 Pod Registration Manager</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">Please connect your wallet to register pods in the smart contract.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>🎩 Register Existing Pods in Smart Contract</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="border p-4 rounded-lg" style={{ backgroundColor: '#FAF4EC', borderColor: '#E8D7B8' }}>
          <h4 className="font-medium mb-2" style={{ color: '#8F6B2F' }}>📋 Current Situation</h4>
          <div className="text-sm space-y-2" style={{ color: '#A67E35' }}>
            <p>Your Executive Pod exists as:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>✅ HATS Protocol token (Pod Leader HAT)</li>
              <li>✅ Database record (pod metadata)</li>
              <li>❌ Smart contract registration (missing!)</li>
            </ul>
            <p className="mt-2 text-xs" style={{ color: '#C6933F' }}>
              Note: You have the Pod Leader HAT (0x0000008800010000000000000000000000000000000000000000000000000000). Pod Member HATs will be created automatically when the pod is activated.
            </p>
          </div>
        </div>

        <div className="border p-4 rounded-lg" style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}>
          <h4 className="font-medium mb-2" style={{ color: '#1F453A' }}>🔄 Registration Process</h4>
          <div className="text-sm space-y-2" style={{ color: '#2F5D50' }}>
            <p>This will call <code>createPodProposal()</code> to register your pod in the smart contract:</p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Register pod in contract storage</li>
              <li>Set pod status to "Proposed"</li>
              <li>Enable future treasury deployment via <code>activatePod()</code></li>
            </ol>
          </div>
        </div>

        {podsToRegister.map((pod) => (
          <Card key={pod.id} className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <img 
                  src={pod.imageURI} 
                  alt={pod.name}
                  className="w-12 h-12 rounded-full"
                />
                <div>
                  <h3 className="text-lg font-semibold">{pod.name}</h3>
                  <p className="text-sm text-gray-600">{pod.id}</p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Pod Leader HAT:</span>
                  <p className="font-mono text-xs text-gray-600">{pod.pod_leader_hat_id}</p>
                </div>
                <div>
                  <span className="font-medium">Parent HAT:</span>
                  <p className="font-mono text-xs text-gray-600">{pod.parentHatId}</p>
                </div>
                <div>
                  <span className="font-medium">Pod Leaders:</span>
                  <p className="text-xs text-gray-600">{pod.podLeads.length} leader(s)</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <Transaction
                  account={address}
                  chainId={base.id}
                  calls={prepareRegistrationCalls(pod.id)}
                  isSponsored={true}
                  onSuccess={(response) => handleRegistrationSuccess(pod.id, response)}
                  onError={handleRegistrationError}
                >
                  <TransactionButton
                    text={`Register ${pod.name} in Smart Contract`}
                    className="w-full"
                    style={{ backgroundColor: '#2F5D50' }}
                    onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.currentTarget.style.backgroundColor = '#1F453A';
                    }}
                    onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.currentTarget.style.backgroundColor = '#2F5D50';
                    }}
                  />
                  <TransactionSponsor />
                  <TransactionStatus>
                    <TransactionStatusLabel />
                    <TransactionStatusAction />
                  </TransactionStatus>
                </Transaction>
              </div>
            </CardContent>
          </Card>
        ))}

        <div className="border p-4 rounded-lg" style={{ backgroundColor: '#D1E6DC', borderColor: '#B8D9CA' }}>
          <h4 className="font-medium mb-2" style={{ color: '#1F453A' }}>✅ After Registration</h4>
          <div className="text-sm space-y-2" style={{ color: '#2F5D50' }}>
            <p>Once registered, you can:</p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Use the <strong>Treasury Deployer</strong> to call <code>activatePod()</code></li>
              <li>Deploy treasury contracts for fund management</li>
              <li>Enable event payments to flow to pod treasuries</li>
              <li>Full pod functionality will be available</li>
            </ol>
            <div className="mt-3">
              <a
                href="/pods/treasury"
                className="inline-flex items-center px-3 py-2 text-sm font-medium bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{ color: '#3F7A5A', borderColor: '#B8D9CA' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#E8F1EE';
                  e.currentTarget.style.color = '#2F5D50';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ffffff';
                  e.currentTarget.style.color = '#3F7A5A';
                }}
              >
                Go to Treasury Deployer →
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};