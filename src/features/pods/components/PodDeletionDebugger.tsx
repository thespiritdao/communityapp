'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/utils/supabaseClient';
import { Bug, CheckCircle, XCircle } from 'lucide-react';

interface PodDeletionDebuggerProps {
  pod: any;
}

export const PodDeletionDebugger: React.FC<PodDeletionDebuggerProps> = ({
  pod,
}) => {
  const { address } = useAccount();
  const [authInfo, setAuthInfo] = useState<any>(null);
  const [testResults, setTestResults] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);

  // Get auth info
  useEffect(() => {
    const getAuthInfo = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setAuthInfo({ session, user });
    };
    getAuthInfo();
  }, []);

  const runTests = async () => {
    setIsLoading(true);
    const results: any = {};

    try {
      // Test 1: Check if we can read from pods table
      const { data: podData, error: podError } = await supabase
        .from('pods')
        .select('*')
        .eq('id', pod.id)
        .single();

      results.podRead = {
        success: !podError,
        error: podError?.message,
        data: podData,
      };

      // Test 2: Check if we can read from pod_deletion_proposals table
      const { data: proposalData, error: proposalError } = await supabase
        .from('pod_deletion_proposals')
        .select('*')
        .eq('pod_id', pod.id);

      results.proposalRead = {
        success: !proposalError,
        error: proposalError?.message,
        data: proposalData,
      };

      // Test 3: Try to insert a test proposal (with immediate rollback)
      const testProposal = {
        pod_id: pod.id,
        pod_name: pod.name + ' [TEST]',
        proposed_by: address?.toLowerCase() || 'test',
        required_approvals: 1,
        current_approvals: [address?.toLowerCase() || 'test'],
        status: 'pending',
      };

      const { data: insertData, error: insertError } = await supabase
        .from('pod_deletion_proposals')
        .insert(testProposal)
        .select()
        .single();

      results.proposalInsert = {
        success: !insertError,
        error: insertError?.message,
        data: insertData,
      };

      // If insert succeeded, delete the test proposal
      if (insertData?.id) {
        await supabase
          .from('pod_deletion_proposals')
          .delete()
          .eq('id', insertData.id);
      }
    } catch (error) {
      results.general = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    setTestResults(results);
    setIsLoading(false);
  };

  const renderTestResult = (key: string, result: any) => {
    if (!result) return null;

    return (
      <div className="flex items-center justify-between p-2 border rounded">
        <span className="text-sm font-medium">{key}</span>
        <div className="flex items-center gap-2">
          {result.success ? (
            <CheckCircle className="h-4 w-4" style={{ color: '#3F7A5A' }} />
          ) : (
            <XCircle className="h-4 w-4" style={{ color: '#8B3A3A' }} />
          )}
          <Badge variant={result.success ? 'default' : 'destructive'}>
            {result.success ? 'Pass' : 'Fail'}
          </Badge>
        </div>
      </div>
    );
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5" />
          Pod Deletion Debugger
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Authentication Info */}
        <div>
          <h4 className="font-medium mb-2">Authentication Status</h4>
          <div className="space-y-2 text-sm">
            <div>
              Wallet Address: <code>{address || 'Not connected'}</code>
            </div>
            <div>
              Supabase User:{' '}
              <code>{authInfo?.user?.id || 'Not authenticated'}</code>
            </div>
            <div>
              Session:{' '}
              <Badge variant={authInfo?.session ? 'default' : 'destructive'}>
                {authInfo?.session ? 'Active' : 'None'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Pod Info */}
        <div>
          <h4 className="font-medium mb-2">Pod Information</h4>
          <div className="space-y-2 text-sm">
            <div>
              Pod ID: <code>{pod.id}</code>
            </div>
            <div>
              Pod Name: <code>{pod.name}</code>
            </div>
            <div>
              Pod Leaders: <code>{JSON.stringify(pod.pod_leads)}</code>
            </div>
            <div>
              Is User Leader:{' '}
              <Badge
                variant={
                  pod.pod_leads?.some(
                    (lead: string) =>
                      lead.toLowerCase() === address?.toLowerCase(),
                  )
                    ? 'default'
                    : 'destructive'
                }
              >
                {pod.pod_leads?.some(
                  (lead: string) =>
                    lead.toLowerCase() === address?.toLowerCase(),
                )
                  ? 'Yes'
                  : 'No'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Test Results */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">Database Tests</h4>
            <Button onClick={runTests} disabled={isLoading} size="sm">
              {isLoading ? 'Testing...' : 'Run Tests'}
            </Button>
          </div>

          {Object.keys(testResults).length > 0 && (
            <div className="space-y-2">
              {renderTestResult('Pod Read Access', testResults.podRead)}
              {renderTestResult(
                'Proposal Read Access',
                testResults.proposalRead,
              )}
              {renderTestResult(
                'Proposal Insert Access',
                testResults.proposalInsert,
              )}
              {renderTestResult('General Error', testResults.general)}
            </div>
          )}
        </div>

        {/* Error Details */}
        {Object.values(testResults).some((result: any) => result?.error) && (
          <div>
            <h4 className="font-medium mb-2" style={{ color: '#8B3A3A' }}>
              Error Details
            </h4>
            <div className="space-y-2 text-sm">
              {Object.entries(testResults).map(
                ([key, result]: [string, any]) =>
                  result?.error ? (
                    <div
                      key={key}
                      className="p-2 border rounded"
                      style={{
                        backgroundColor: '#F5E6E6',
                        borderColor: '#D9B3B3',
                      }}
                    >
                      <div className="font-medium" style={{ color: '#5C1F1F' }}>
                        {key}:
                      </div>
                      <div style={{ color: '#8B3A3A' }}>{result.error}</div>
                    </div>
                  ) : null,
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PodDeletionDebugger;
