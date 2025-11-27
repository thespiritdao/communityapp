'use client';

import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface RemixDeploymentData {
  podName: string;
  hatIdDecimal: string;
  hatIdHex: string;
  podId: string;
  constructorCode: string;
  remixUrl: string;
}

interface RemixDeploymentHelperProps {
  deploymentData: RemixDeploymentData;
  onTreasuryDeployed: (address: string) => void;
}

export const RemixDeploymentHelper: React.FC<RemixDeploymentHelperProps> = ({
  deploymentData,
  onTreasuryDeployed
}) => {
  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const handleAddDeployedAddress = () => {
    const address = window.prompt(
      `Enter the deployed treasury contract address for "${deploymentData.podName}":\n\n` +
      "After deploying in Remix, copy the contract address and paste it here."
    );
    
    if (address && address.startsWith('0x') && address.length === 42) {
      onTreasuryDeployed(address);
    } else if (address) {
      alert("Please enter a valid Ethereum address starting with 0x");
    }
  };

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🏗️ Deploy Treasury for {deploymentData.podName}
        </CardTitle>
        <p className="text-sm text-gray-600">
          Step-by-step treasury deployment using Remix IDE
        </p>
      </CardHeader>

      <CardContent>
        {/* Step-by-step instructions */}
        <div className="space-y-6">
          {/* Step 1 */}
          <div className="border rounded-lg p-4" style={{ backgroundColor: '#E8F1EE', borderColor: '#B8D9CA' }}>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" style={{ backgroundColor: '#D1E6DC', color: '#2F5D50' }}>Step 1</Badge>
              <h3 className="font-semibold">Open Remix IDE</h3>
            </div>
            <p className="text-sm text-gray-700 mb-3">
              Open Remix in a new tab and create the PodTreasury contract
            </p>
            <Button
              onClick={() => window.open('https://remix.ethereum.org', '_blank')}
              className="text-white"
              style={{ backgroundColor: '#2F5D50' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1F453A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2F5D50';
              }}
            >
              🚀 Open Remix IDE
            </Button>
          </div>

          {/* Step 2 */}
          <div className="border rounded-lg p-4" style={{ backgroundColor: '#D1E6DC', borderColor: '#B8D9CA' }}>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" style={{ backgroundColor: '#E8F1EE', color: '#3F7A5A' }}>Step 2</Badge>
              <h3 className="font-semibold">Create Contract File</h3>
            </div>
            <p className="text-sm text-gray-700 mb-3">
              In Remix, create a new file called <code className="bg-gray-100 px-1 rounded">PodTreasury.sol</code>
            </p>
            <p className="text-xs text-gray-600 mb-3">
              You can copy the contract code from: <code className="bg-gray-100 px-1 rounded">src/contracts/PodTreasury.sol</code>
            </p>
          </div>

          {/* Step 3 */}
          <div className="border rounded-lg p-4" style={{ backgroundColor: '#EDEAF0', borderColor: '#D1CAD9' }}>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" style={{ backgroundColor: '#E3DFE8', color: '#6A5F7A' }}>Step 3</Badge>
              <h3 className="font-semibold">Configure Constructor Parameters</h3>
            </div>
            <p className="text-sm text-gray-700 mb-3">
              Use these exact parameters when deploying:
            </p>

            <div className="bg-gray-900 p-4 rounded font-mono text-xs overflow-x-auto" style={{ color: '#3F7A5A' }}>
              <pre>{deploymentData.constructorCode}</pre>
            </div>
            
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(deploymentData.constructorCode)}
              >
                📋 Copy Constructor
              </Button>
            </div>
          </div>

          {/* Step 4 */}
          <div className="border rounded-lg p-4" style={{ backgroundColor: '#FAF4EC', borderColor: '#E8D7B8' }}>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" style={{ backgroundColor: '#F5EDD9', color: '#C6933F' }}>Step 4</Badge>
              <h3 className="font-semibold">Deploy on Base Network</h3>
            </div>
            <div className="text-sm text-gray-700 space-y-2">
              <p>1. Compile the contract (Ctrl+S)</p>
              <p>2. Go to "Deploy & Run Transactions" tab</p>
              <p>3. Set Environment to "Injected Provider - MetaMask"</p>
              <p>4. Make sure you're connected to <strong>Base Mainnet</strong></p>
              <p>5. Enter the constructor parameters</p>
              <p>6. Click <strong>Deploy</strong></p>
            </div>
          </div>

          {/* Step 5 */}
          <div className="border rounded-lg p-4" style={{ backgroundColor: '#FAF4EC', borderColor: '#E8D7B8' }}>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" style={{ backgroundColor: '#F5EDD9', color: '#C6933F' }}>Step 5</Badge>
              <h3 className="font-semibold">Get Deployed Address</h3>
            </div>
            <p className="text-sm text-gray-700 mb-3">
              After successful deployment, copy the contract address from Remix
            </p>
            <Button
              onClick={handleAddDeployedAddress}
              className="text-white"
              style={{ backgroundColor: '#3F7A5A' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#2F5D50';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#3F7A5A';
              }}
            >
              📍 I've Deployed - Add Address
            </Button>
          </div>
        </div>

        {/* Technical Details */}
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-800 mb-3">🔧 Technical Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <p><strong>Pod Name:</strong> {deploymentData.podName}</p>
              <p><strong>Pod ID:</strong> {deploymentData.podId}</p>
            </div>
            <div>
              <p><strong>HAT ID (Decimal):</strong> {deploymentData.hatIdDecimal}</p>
              <p><strong>HAT ID (Hex):</strong> {deploymentData.hatIdHex}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};