'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { useHatsModules } from '@/hooks/useHatsModules';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import { HatGatedChatContainer } from '@/features/chat/components/HatGatedChatContainer';
import {
  Users,
  Shield,
  MessageCircle,
  Vote,
  Crown,
  CheckCircle,
  XCircle,
  Zap,
  Clock,
} from 'lucide-react';

export default function DemoHatsModulesPage() {
  const [activeTab, setActiveTab] = useState<
    'permissions' | 'modules' | 'chat' | 'governance'
  >('permissions');

  // Existing token balances (this works!)
  const {
    balances,
    refreshBalances,
    isLoading: tokenLoading,
    error: tokenError,
  } = useTokenBalances();

  // HAT permissions (new integration)
  const {
    permissions,
    userRoles,
    userHats,
    isLoading: permissionsLoading,
    error: permissionsError,
    canAccessChat,
    canParticipateInGovernance,
    canCreateEvents,
    canViewTreasury,
    canManageMembers,
    isPodLeader,
    refreshPermissions,
  } = useHatPermissions();

  // HATS modules
  const {
    service: modulesService,
    isInitialized: modulesInitialized,
    isInitializing: modulesInitializing,
    availableModules,
    error: modulesError,
  } = useHatsModules();

  const StatusIndicator = ({
    condition,
    label,
  }: { condition: boolean; label: string }) => (
    <div className="flex items-center gap-2">
      {condition ? (
        <CheckCircle className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500" />
      )}
      <span className={condition ? 'text-green-700' : 'text-red-700'}>
        {label}
      </span>
    </div>
  );

  return (
    <div className="container mx-auto py-8 px-4 pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Zap className="h-8 w-8 text-blue-600" />
          HATS Modules Integration Demo
        </h1>
        <p className="text-gray-600">
          Test and demonstrate the HATS Protocol modules integration with your
          DAO
        </p>
      </div>

      {/* Navigation Tabs */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'permissions', label: 'HAT Permissions', icon: Shield },
              { id: 'modules', label: 'HATS Modules', icon: Zap },
              { id: 'chat', label: 'Gated Chat', icon: MessageCircle },
              { id: 'governance', label: 'Governance Access', icon: Vote },
            ].map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                variant={activeTab === id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab(id as typeof activeTab)}
                className="flex items-center gap-2"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Permissions Tab */}
      {activeTab === 'permissions' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6" />
                Your HAT Permissions
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await Promise.all([
                      refreshBalances(),
                      refreshPermissions(),
                    ]);
                  }}
                  disabled={tokenLoading || permissionsLoading}
                >
                  {permissionsLoading ? (
                    <Clock className="h-4 w-4 animate-spin" />
                  ) : (
                    'Refresh'
                  )}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tokenLoading || permissionsLoading ? (
                <div className="text-center py-8">
                  <Clock className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p>Loading HAT permissions...</p>
                </div>
              ) : tokenError || permissionsError ? (
                <div className="text-red-600 p-4 bg-red-50 rounded-lg">
                  Error: {tokenError?.message || permissionsError}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Working Token Balances (Your Current System) */}
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      Current Working HAT System
                    </h3>
                    <div className="p-4 bg-[#D4E5DF] border border-[#3F7A5A] rounded-lg">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                        <StatusIndicator
                          condition={balances?.hasExecutivePod || false}
                          label="Executive Pod"
                        />
                        <StatusIndicator
                          condition={balances?.hasDevPod || false}
                          label="Dev Pod"
                        />
                        <StatusIndicator
                          condition={balances?.hasBountyHat || false}
                          label="Bounty Manager"
                        />
                        <StatusIndicator
                          condition={balances?.hasMarketManagement || false}
                          label="Market Manager"
                        />
                        <StatusIndicator
                          condition={balances?.hasEventManagement || false}
                          label="Event Manager"
                        />
                        <StatusIndicator
                          condition={balances?.hasProofOfCuriosity || false}
                          label="Proof of Curiosity"
                        />
                      </div>
                      <div className="mt-3 text-xs text-gray-600">
                        System Balance: {balances?.systemBalance || '0'} • Self
                        Balance: {balances?.selfBalance || '0'}
                      </div>
                    </div>
                  </div>

                  {/* User Roles */}
                  <div>
                    <h3 className="font-semibold mb-3">
                      Your Roles ({userRoles.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {userRoles.length > 0 ? (
                        userRoles.map((role, index) => (
                          <div
                            key={index}
                            className="p-3 border rounded-lg bg-[#E8F1EE]"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {role.isLeaderRole ? (
                                <Crown className="h-4 w-4 text-yellow-500" />
                              ) : (
                                <Users className="h-4 w-4 text-blue-500" />
                              )}
                              <span className="font-medium">{role.name}</span>
                              {role.isLeaderRole && (
                                <Badge variant="outline" className="text-xs">
                                  Leader
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 font-mono">
                              HAT: {role.hatId.slice(0, 10)}...
                            </p>
                            {role.podId && (
                              <p className="text-xs text-blue-600">
                                Pod: {role.podId}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="col-span-2 text-center py-4 text-gray-500">
                          No HAT roles found. You may need to claim or be
                          assigned HAT tokens.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Permissions Matrix */}
                  <div>
                    <h3 className="font-semibold mb-3">Permission Matrix</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <StatusIndicator
                        condition={canAccessChat}
                        label="Chat Access"
                      />
                      <StatusIndicator
                        condition={canParticipateInGovernance}
                        label="Governance Participation"
                      />
                      <StatusIndicator
                        condition={canCreateEvents}
                        label="Event Creation"
                      />
                      <StatusIndicator
                        condition={canViewTreasury}
                        label="Treasury Viewing"
                      />
                      <StatusIndicator
                        condition={canManageMembers}
                        label="Member Management"
                      />
                      <StatusIndicator
                        condition={isPodLeader}
                        label="Pod Leadership"
                      />
                    </div>
                  </div>

                  {/* Raw HAT IDs */}
                  <div>
                    <h3 className="font-semibold mb-3">
                      Your HAT Tokens ({userHats.length})
                    </h3>
                    <div className="space-y-2">
                      {userHats.length > 0 ? (
                        userHats.map((hatId, index) => (
                          <div
                            key={index}
                            className="p-2 bg-gray-50 rounded font-mono text-sm"
                          >
                            {hatId}
                          </div>
                        ))
                      ) : (
                        <p className="text-gray-500 text-sm">
                          No HAT tokens found
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modules Tab */}
      {activeTab === 'modules' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-6 w-6" />
                HATS Modules Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Initialization Status */}
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">Module Service Status</h3>
                  <div className="space-y-2">
                    <StatusIndicator
                      condition={modulesInitialized && !modulesError}
                      label={
                        modulesInitializing
                          ? 'Initializing...'
                          : 'Service Ready'
                      }
                    />
                    {modulesError && (
                      <div className="text-red-600 text-sm">
                        Error: {modulesError}
                      </div>
                    )}
                  </div>
                </div>

                {/* Available Modules */}
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">
                    Available Modules ({availableModules.length})
                  </h3>
                  {availableModules.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {availableModules.slice(0, 8).map((module, index) => (
                        <div
                          key={index}
                          className="p-2 bg-[#E8F1EE] rounded text-sm"
                        >
                          <div className="font-medium">
                            {module.name || `Module ${index + 1}`}
                          </div>
                          <div className="text-xs text-gray-600 font-mono">
                            {module.id?.slice(0, 10)}...
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">
                      {modulesInitialized
                        ? 'No modules found'
                        : 'Loading modules...'}
                    </p>
                  )}
                </div>

                {/* Integration Status */}
                <div className="p-4 border rounded-lg">
                  <h3 className="font-semibold mb-2">Integration Features</h3>
                  <div className="space-y-2">
                    <StatusIndicator
                      condition={modulesInitialized}
                      label="Pod Creation with Modules"
                    />
                    <StatusIndicator
                      condition={modulesInitialized}
                      label="Automated Role Assignment"
                    />
                    <StatusIndicator
                      condition={modulesInitialized}
                      label="Treasury Integration"
                    />
                    <StatusIndicator
                      condition={modulesInitialized}
                      label="Eligibility Rules"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-6 w-6" />
                HAT-Gated Chat System
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                This chat system uses your HAT tokens to determine access.
                Different chat rooms require different HAT permissions.
              </p>
            </CardContent>
          </Card>

          {/* HAT-gated chat component */}
          <HatGatedChatContainer />
        </div>
      )}

      {/* Governance Tab */}
      {activeTab === 'governance' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Vote className="h-6 w-6" />
                Governance Access Control
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <StatusIndicator
                  condition={canParticipateInGovernance}
                  label="Can Participate in Governance"
                />

                {canParticipateInGovernance ? (
                  <div className="p-4 bg-[#D4E5DF] border border-[#3F7A5A] rounded-lg">
                    <h4 className="font-medium text-[#2F5D50] mb-2">
                      ✅ Governance Access Granted
                    </h4>
                    <p className="text-[#3A3A3A] text-sm">
                      You have the required HAT tokens to participate in
                      governance. You can:
                    </p>
                    <ul className="text-[#3A3A3A] text-sm mt-2 space-y-1">
                      <li>• Vote on proposals</li>
                      <li>• View governance discussions</li>
                      <li>• Create proposals (if you're a pod leader)</li>
                    </ul>
                  </div>
                ) : (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <h4 className="font-medium text-red-800 mb-2">
                      ❌ Governance Access Denied
                    </h4>
                    <p className="text-red-700 text-sm">
                      You need a valid HAT token to participate in governance.
                      Contact a pod leader to get assigned the appropriate role.
                    </p>
                  </div>
                )}

                <div className="mt-4">
                  <Button
                    onClick={() => window.open('/governance', '_blank')}
                    disabled={!canParticipateInGovernance}
                    className="flex items-center gap-2"
                  >
                    <Vote className="h-4 w-4" />
                    {canParticipateInGovernance
                      ? 'Go to Governance'
                      : 'Access Denied'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
