// src/features/governance/components/GovernanceDiagnostics.tsx
'use client';
import React, { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import DAOGovernorABI from 'src/abis/DAO_GovernorABI.json';

interface DiagnosticsProps {
  proposalId: number;
}

const GovernanceDiagnostics: React.FC<DiagnosticsProps> = ({ proposalId }) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [diagnosticResults, setDiagnosticResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
  
  const runDiagnostics = async () => {
    if (!address || !publicClient || !GOVERNOR_ADDRESS) {
      setError("Missing required connection data");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const results: Record<string, any> = {
      wallet: address,
      governorContract: GOVERNOR_ADDRESS,
      proposalId: proposalId,
      timestamp: new Date().toISOString(),
    };
    
    try {
      // 1. Check if proposal exists
      try {
        const proposalState = await publicClient.readContract({
          address: GOVERNOR_ADDRESS,
          abi: DAOGovernorABI,
          functionName: 'state',
          args: [BigInt(proposalId)],
        });
        
        // Map state number to state name (adjust according to your contract's enum)
        const stateNames = [
          'Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 
          'Queued', 'Expired', 'Executed'
        ];
        
        results.proposalState = {
          stateNumber: Number(proposalState),
          stateName: stateNames[Number(proposalState)] || 'Unknown',
        };
        
        // Check if the proposal is actually active for voting
        results.canVote = Number(proposalState) === 1; // 1 typically means Active
      } catch (err: any) {
        results.proposalState = { error: err.message };
        results.proposalExists = false;
      }
      
      // 2. Check if account has already voted
      try {
        const hasVoted = await publicClient.readContract({
          address: GOVERNOR_ADDRESS,
          abi: DAOGovernorABI,
          functionName: 'hasVoted',
          args: [BigInt(proposalId), address],
        });
        
        results.hasVoted = Boolean(hasVoted);
      } catch (err: any) {
        results.hasVoted = { error: err.message };
      }
      
      // 3. Get voting power
      try {
        // Get the proposal snapshot block
        const proposal = await publicClient.readContract({
          address: GOVERNOR_ADDRESS,
          abi: DAOGovernorABI,
          functionName: 'proposals',
          args: [BigInt(proposalId)],
        });
        
        // This depends on your contract's proposal struct
        // Adjust the index based on where snapshot is stored
        const snapshotBlock = proposal[0]; // May need adjustment based on contract
        
        results.proposal = {
          snapshotBlock: Number(snapshotBlock),
        };
        
        // Get voting power at snapshot
        const votingPower = await publicClient.readContract({
          address: GOVERNOR_ADDRESS,
          abi: DAOGovernorABI,
          functionName: 'getVotes',
          args: [address, BigInt(snapshotBlock)],
        });
        
        results.votingPower = String(votingPower);
        results.hasVotingPower = Number(votingPower) > 0;
      } catch (err: any) {
        results.votingPower = { error: err.message };
      }
      
      // 4. Check if account can cast vote
      try {
        const { request } = await publicClient.simulateContract({
          account: address,
          address: GOVERNOR_ADDRESS,
          abi: DAOGovernorABI,
          functionName: 'castVote',
          args: [BigInt(proposalId), BigInt(1)], // Simulate voting "yes"
        });
        
        results.canCastVote = true;
        results.simulationSuccess = true;
      } catch (err: any) {
        results.canCastVote = false;
        results.simulationError = {
          message: err.message,
          shortMessage: err.shortMessage,
        };
      }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDiagnosticResults(results);
      setLoading(false);
    }
  };
  
  return (
    <div className="mt-6 p-4 bg-gray-50 rounded-lg">
      <h2 className="text-lg font-medium mb-4">Governance Diagnostics</h2>
      
      <button 
        onClick={runDiagnostics}
        className="px-4 py-2 bg-blue-600 text-white rounded mb-4"
        disabled={loading}
      >
        {loading ? 'Running Diagnostics...' : 'Run Diagnostics'}
      </button>
      
      {error && (
        <div className="text-red-500 mb-4">Error: {error}</div>
      )}
      
      {Object.keys(diagnosticResults).length > 0 && (
        <div className="mt-4">
          <h3 className="font-medium mb-2">Results:</h3>
          <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-sm">
            {JSON.stringify(diagnosticResults, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default GovernanceDiagnostics;