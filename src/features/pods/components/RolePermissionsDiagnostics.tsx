'use client';

import type React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PodRolePermissionsService } from '../services/PodRolePermissionsService';
import { PodService } from '../services/PodService';
import { useAccount } from 'wagmi';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/utils/supabaseClient';
import { getClientHatId } from '@/lib/hatRegistryClient';

interface RolePermissionsDiagnosticsProps {
  podId: string;
}

export const RolePermissionsDiagnostics: React.FC<
  RolePermissionsDiagnosticsProps
> = ({ podId }) => {
  const { address } = useAccount();
  const { toast } = useToast();
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    if (!address) {
      toast({
        title: 'Authentication Required',
        description: 'Please connect your wallet to run diagnostics',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      console.log('🔬 Running pod role permissions diagnostics...');

      // 1. Get pod information
      const pod = await PodService.getPodById(podId);

      // 2. Get role permissions from database
      const rolePermissions =
        await PodRolePermissionsService.getPodRolePermissions(podId);

      // 3. Environment variables
      const envVars = {
        NEXT_PUBLIC_EXECUTIVE_POD_LEADER:
          getClientHatId('EXECUTIVE_POD_LEADER'),
      };

      // 4. Check for the specific problematic ID and clean up if needed
      const problematicId = '3683c466-60f3-4149-9fcc-696ff2b2cc1a';
      let problematicRole = null;
      let shouldCleanup = false;

      try {
        // Check if this problematic ID exists by direct lookup
        const { data: directCheck, error: directError } = await supabase
          .from('pod_role_permissions')
          .select('*')
          .eq('id', problematicId)
          .single();

        if (directCheck) {
          problematicRole = directCheck;
          console.log('❗ Found problematic role in database:', directCheck);
        } else {
          console.log('✅ Problematic role not found (this is good)');
        }
      } catch (error) {
        console.log('✅ Problematic role lookup failed (expected)');
      }

      // If we find orphaned/invalid role data, mark for cleanup
      if (
        problematicRole &&
        (!problematicRole.pod_id || problematicRole.pod_id !== podId)
      ) {
        shouldCleanup = true;
        console.log('⚠️ Found orphaned role data that should be cleaned up');
      }

      const diagnosticData = {
        podId,
        timestamp: new Date().toISOString(),
        pod: {
          id: pod?.id,
          name: pod?.name,
          management_hat_id: pod?.management_hat_id,
          membership_hat_id: pod?.membership_hat_id,
          is_active: pod?.is_active,
          status: pod?.status,
        },
        rolePermissions: {
          count: rolePermissions.length,
          roles: rolePermissions.map((role) => ({
            id: role.id,
            role_name: role.role_name,
            token_address: role.token_address,
            is_active: role.is_active,
            sync_status: role.sync_status,
            created_at: role.created_at,
          })),
        },
        envVars,
        problematicId: {
          id: problematicId,
          found: !!problematicRole,
          shouldCleanup,
          details: problematicRole,
        },
        userWallet: address,
      };

      setDiagnostics(diagnosticData);

      console.log('🔬 Diagnostics complete:', diagnosticData);

      toast({
        title: 'Diagnostics Complete',
        description: `Found ${rolePermissions.length} role permissions for this pod`,
      });
    } catch (error) {
      console.error('Diagnostics failed:', error);
      toast({
        title: 'Diagnostics Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const cleanupOrphanedData = async () => {
    if (!address) return;

    setLoading(true);

    try {
      console.log('🧹 Cleaning up orphaned role data...');

      // Delete the specific problematic role if it exists and is orphaned
      const problematicId = '3683c466-60f3-4149-9fcc-696ff2b2cc1a';

      const { error: deleteError } = await supabase
        .from('pod_role_permissions')
        .delete()
        .eq('id', problematicId);

      if (deleteError && deleteError.code !== 'PGRST116') {
        throw deleteError;
      }

      toast({
        title: 'Cleanup Complete',
        description: 'Removed orphaned role data from database',
      });

      // Re-run diagnostics
      await runDiagnostics();
    } catch (error) {
      console.error('Cleanup failed:', error);
      toast({
        title: 'Cleanup Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fixRolePermissions = async () => {
    if (!address) return;

    setLoading(true);

    try {
      console.log('🔧 Attempting to fix role permissions...');

      // First cleanup any orphaned data
      await cleanupOrphanedData();

      // Delete any existing roles for this pod
      const { error: cleanupError } = await supabase
        .from('pod_role_permissions')
        .delete()
        .eq('pod_id', podId);

      if (cleanupError && cleanupError.code !== 'PGRST116') {
        console.warn('Cleanup warning:', cleanupError);
      }

      // Initialize fresh roles
      const leaderHatId = getClientHatId('EXECUTIVE_POD_LEADER');

      if (leaderHatId) {
        await PodRolePermissionsService.initializeDefaultRoles(
          podId,
          leaderHatId,
          undefined,
          address,
        );

        toast({
          title: 'Roles Fixed',
          description:
            'Pod role permissions have been completely reinitialized',
        });

        // Re-run diagnostics
        await runDiagnostics();
      } else {
        throw new Error('Missing environment variables');
      }
    } catch (error) {
      console.error('Fix failed:', error);
      toast({
        title: 'Fix Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-lg">Role Permissions Diagnostics</CardTitle>
        <p className="text-sm text-gray-600">
          Debug tool to identify and fix role permission issues
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Button onClick={runDiagnostics} disabled={loading} size="sm">
            {loading ? 'Running...' : 'Run Diagnostics'}
          </Button>

          {diagnostics?.problematicId?.found && (
            <Button
              onClick={cleanupOrphanedData}
              disabled={loading || !address}
              size="sm"
              variant="destructive"
            >
              Clean Up Orphaned Data
            </Button>
          )}

          <Button
            onClick={fixRolePermissions}
            disabled={loading || !address}
            size="sm"
            variant="outline"
          >
            Reset All Roles
          </Button>
        </div>

        {diagnostics && (
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Pod Information</h4>
              <div className="bg-gray-50 p-3 rounded text-sm">
                <p>
                  <strong>ID:</strong> {diagnostics.pod.id}
                </p>
                <p>
                  <strong>Name:</strong> {diagnostics.pod.name}
                </p>
                <p>
                  <strong>Management HAT:</strong>{' '}
                  {diagnostics.pod.management_hat_id || 'None'}
                </p>
                <p>
                  <strong>Membership HAT:</strong>{' '}
                  {diagnostics.pod.membership_hat_id || 'None'}
                </p>
                <p>
                  <strong>Status:</strong>{' '}
                  <Badge variant="outline">{diagnostics.pod.status}</Badge>
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">
                Role Permissions ({diagnostics.rolePermissions.count})
              </h4>
              <div className="bg-gray-50 p-3 rounded text-sm space-y-2">
                {diagnostics.rolePermissions.roles.map(
                  (role: any, index: number) => (
                    <div
                      key={index}
                      className="border-l-2 pl-3"
                      style={{ borderColor: '#8FAAA1' }}
                    >
                      <p>
                        <strong>{role.role_name}</strong>
                      </p>
                      <p className="text-xs text-gray-600">ID: {role.id}</p>
                      <p className="text-xs text-gray-600">
                        HAT: {role.token_address}
                      </p>
                      <p className="text-xs text-gray-600">
                        Status:{' '}
                        <Badge variant={role.is_active ? 'default' : 'outline'}>
                          {role.is_active ? 'Active' : 'Inactive'}
                        </Badge>{' '}
                        Sync:{' '}
                        <Badge variant="outline">{role.sync_status}</Badge>
                      </p>
                    </div>
                  ),
                )}

                {diagnostics.rolePermissions.count === 0 && (
                  <p style={{ color: '#8B3A3A' }}>
                    ❌ No role permissions found
                  </p>
                )}
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Environment Variables</h4>
              <div className="bg-gray-50 p-3 rounded text-sm">
                <p>
                  <strong>Leader HAT:</strong>{' '}
                  {diagnostics.envVars.NEXT_PUBLIC_EXECUTIVE_POD_LEADER ||
                    '❌ Missing'}
                </p>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Problematic Role Check</h4>
              <div className="bg-gray-50 p-3 rounded text-sm">
                <p>
                  <strong>ID:</strong> {diagnostics.problematicId.id}
                </p>
                <p>
                  <strong>Found:</strong>{' '}
                  {diagnostics.problematicId.found
                    ? '❌ Yes (Problem!)'
                    : '✅ No (Good)'}
                </p>
                {diagnostics.problematicId.shouldCleanup && (
                  <p className="mt-2" style={{ color: '#8B3A3A' }}>
                    <strong>⚠️ Action Required:</strong> This orphaned data
                    should be cleaned up using the button above.
                  </p>
                )}
                {diagnostics.problematicId.details && (
                  <div
                    className="mt-2 p-2 border rounded"
                    style={{
                      backgroundColor: '#F5E6E6',
                      borderColor: '#D9B3B3',
                    }}
                  >
                    <p className="font-medium" style={{ color: '#5C1F1F' }}>
                      Found Problematic Role:
                    </p>
                    <p className="text-xs" style={{ color: '#8B3A3A' }}>
                      Pod ID: {diagnostics.problematicId.details.pod_id}
                    </p>
                    <p className="text-xs" style={{ color: '#8B3A3A' }}>
                      Role: {diagnostics.problematicId.details.role_name}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
