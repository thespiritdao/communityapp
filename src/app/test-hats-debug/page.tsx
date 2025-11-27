'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePublicClient, useWalletClient } from 'wagmi';
import { HatsModulesClient } from '@hatsprotocol/modules-sdk';

export default function TestHatsDebugPage() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const addLog = (message: string) => {
    console.log(message);
    setLogs((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  const testHatsModulesConnection = async () => {
    if (!publicClient || !walletClient) {
      addLog('❌ No wallet clients available');
      return;
    }

    setIsLoading(true);
    setLogs([]);

    try {
      addLog('🎩 Starting HATS Modules SDK test...');
      addLog(`🔗 Chain: ${publicClient.chain?.name || 'Unknown'}`);
      addLog(`📍 Transport: ${publicClient.transport?.type || 'Unknown'}`);

      // Test 1: Initialize client
      addLog('1️⃣ Creating HatsModulesClient...');
      const client = new HatsModulesClient({
        publicClient,
        walletClient,
      });
      addLog('✅ HatsModulesClient created successfully');

      // Test 2: Prepare (fetch registry)
      addLog('2️⃣ Calling client.prepare() to fetch modules registry...');
      try {
        await client.prepare();
        addLog('✅ client.prepare() completed successfully');
      } catch (prepError) {
        addLog('❌ client.prepare() failed:');
        addLog(
          prepError instanceof Error ? prepError.message : String(prepError),
        );
        addLog('⚠️ This indicates the registry connection failed');
        return;
      }

      // Test 3: Get modules
      addLog('3️⃣ Calling client.getModules() to fetch available modules...');
      try {
        const modules = await client.getModules();
        addLog(`✅ Found ${modules.length} modules in registry`);

        if (modules.length === 0) {
          addLog('⚠️ No modules found - possible registry connection issue');
        } else {
          addLog('📋 Available modules:');
          modules.slice(0, 5).forEach((module, index) => {
            addLog(
              `   ${index + 1}. ${module.name || 'Unnamed'} (${module.id?.slice(0, 10)}...)`,
            );
          });
          if (modules.length > 5) {
            addLog(`   ... and ${modules.length - 5} more modules`);
          }
        }
      } catch (modulesError) {
        addLog('❌ client.getModules() failed:');
        addLog(
          modulesError instanceof Error
            ? modulesError.message
            : String(modulesError),
        );
      }

      addLog('🎉 HATS Modules SDK test completed');
    } catch (error) {
      addLog('❌ Test failed with error:');
      addLog(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle>HATS Modules SDK Debug Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            This page directly tests the HATS Modules SDK connection to help
            debug registry issues.
          </p>

          <Button
            onClick={testHatsModulesConnection}
            disabled={isLoading || !publicClient || !walletClient}
          >
            {isLoading ? 'Testing...' : 'Test HATS Modules Connection'}
          </Button>

          {logs.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold mb-2">Test Log:</h3>
              <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
                {logs.map((log, index) => (
                  <div key={index} className="mb-1">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-sm text-gray-500 mt-4">
            <p>
              <strong>What this test does:</strong>
            </p>
            <ol className="list-decimal list-inside space-y-1 mt-2">
              <li>Creates a HatsModulesClient instance</li>
              <li>Calls client.prepare() to connect to the modules registry</li>
              <li>Calls client.getModules() to fetch available modules</li>
              <li>Reports the results with detailed logging</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
