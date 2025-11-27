'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { useAccount } from 'wagmi';
import { useToast } from '@/components/ui/use-toast';
import { useProfiles } from '@/features/identity/hooks/useProfiles';
import { useProfileModal } from '@/features/identity/hooks/useProfileModal';
import { ProfileModal } from '@/features/identity';
import dynamic from 'next/dynamic';

// Lazy load the agreement signing modal
const AgreementSigningModal = dynamic(() => import('./AgreementSigningModal'), {
  ssr: false,
});

interface EligibilityCriterion {
  type: string;
  name: string;
  description?: string;
  required_for_role?: string;
}

interface RolePermission {
  id: string;
  role_name: string;
  eligibility_criteria: any[];
}

interface AgreementSignature {
  id: string;
  pod_id: string;
  signer_address: string;
  signature_data: string;
  signed_at: string;
  accountability_statement: string;
  is_valid: boolean;
}

interface AgreementsPanelProps {
  podId: string;
  canManageMembers: boolean;
}

export function AgreementsPanel({
  podId,
  canManageMembers,
}: AgreementsPanelProps) {
  const { address } = useAccount();
  const { toast } = useToast();

  const [agreementCriteria, setAgreementCriteria] = useState<
    Array<EligibilityCriterion & { roleId: string }>
  >([]);
  const [signatures, setSignatures] = useState<AgreementSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingAgreement, setSigningAgreement] = useState<
    (EligibilityCriterion & { roleId: string }) | null
  >(null);

  // Profile management for signature display
  const allSignerAddresses = signatures.map((sig) => sig.signer_address);
  const { getProfile } = useProfiles(allSignerAddresses);
  const {
    selectedUser,
    users,
    isOpen: isProfileModalOpen,
    openProfileModal,
    closeProfileModal,
  } = useProfileModal();

  useEffect(() => {
    loadAgreements();
  }, [podId]);

  async function loadAgreements() {
    try {
      setLoading(true);
      console.log('📋 Loading agreements for pod:', podId);

      // Load eligibility criteria from role permissions
      const { data: roles, error: rolesError } = await supabase
        .from('pod_role_permissions')
        .select('id, eligibility_criteria, role_name')
        .eq('pod_id', podId)
        .eq('is_active', true);

      if (rolesError) {
        console.error('❌ Error loading role permissions:', rolesError);
        throw rolesError;
      }

      // Extract agreement-type criteria
      const criteria: Array<EligibilityCriterion & { roleId: string }> = [];

      if (roles) {
        roles.forEach((role) => {
          if (
            role.eligibility_criteria &&
            Array.isArray(role.eligibility_criteria)
          ) {
            role.eligibility_criteria.forEach((criterion: any) => {
              if (criterion.type === 'agreement_signed') {
                criteria.push({
                  ...criterion,
                  required_for_role: role.role_name,
                  roleId: role.id,
                });
              }
            });
          }
        });
      }

      console.log('✅ Found', criteria.length, 'agreement criteria');
      setAgreementCriteria(criteria);

      // Load existing signatures
      const { data: sigs, error: sigsError } = await supabase
        .from('pod_accountability_signatures')
        .select('*')
        .eq('pod_id', podId)
        .eq('is_valid', true);

      if (sigsError) {
        console.error('❌ Error loading signatures:', sigsError);
      } else {
        console.log('✅ Loaded', sigs?.length || 0, 'signatures');
        setSignatures(sigs || []);
      }
    } catch (error) {
      console.error('❌ Error loading agreements:', error);
      toast({
        title: 'Error Loading Agreements',
        description: 'Could not load agreement information',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  function hasUserSigned(agreementName: string): boolean {
    if (!address) return false;

    return signatures.some(
      (sig) =>
        sig.signer_address.toLowerCase() === address.toLowerCase() &&
        sig.accountability_statement.includes(agreementName),
    );
  }

  function getSignersForAgreement(agreementName: string): AgreementSignature[] {
    return signatures.filter((sig) =>
      sig.accountability_statement.includes(agreementName),
    );
  }

  function getUserDisplayName(walletAddress: string): string {
    const profile = getProfile(walletAddress);
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    if (profile?.first_name) {
      return profile.first_name;
    }
    // Fallback to shortened address
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  }

  async function handleAgreementSigned() {
    // Reload signatures after signing
    await loadAgreements();
    setSigningAgreement(null);

    // Force hard refresh to update toolbar/nav
    window.location.reload();
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (agreementCriteria.length === 0) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium mb-2">
              No Agreement Requirements
            </h3>
            <p className="text-sm text-gray-600">
              This pod does not have any agreement requirements configured.
            </p>
            {canManageMembers && (
              <p className="text-sm text-gray-500 mt-4">
                You can add agreement requirements when configuring pod roles
                and eligibility criteria.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pod Agreements</h2>
          <p className="text-sm text-gray-600 mt-1">
            Review and sign required agreements for this pod
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {agreementCriteria.map((criterion, index) => {
          const signers = getSignersForAgreement(criterion.name);
          const userHasSigned = hasUserSigned(criterion.name);

          return (
            <Card key={index}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <FileText
                      className="h-5 w-5 mt-0.5"
                      style={{ color: '#2F5D50' }}
                    />
                    <div className="flex-1">
                      <CardTitle className="text-lg">
                        {criterion.name}
                      </CardTitle>
                      {criterion.description && (
                        <p className="text-sm text-gray-600 mt-1">
                          {criterion.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge
                          variant="outline"
                          className="text-xs whitespace-nowrap"
                        >
                          Required for: {criterion.required_for_role}
                        </Badge>
                        {userHasSigned ? (
                          <Badge
                            variant="default"
                            className="text-xs whitespace-nowrap"
                            style={{
                              backgroundColor: '#3F7A5A',
                              color: '#FFFFFF',
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            You signed
                          </Badge>
                        ) : (
                          <Badge
                            variant="destructive"
                            className="text-xs whitespace-nowrap"
                          >
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Not signed
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {!userHasSigned && address && (
                    <Button
                      onClick={() => setSigningAgreement(criterion)}
                      size="sm"
                      className="ml-4"
                    >
                      Sign
                    </Button>
                  )}
                </div>
              </CardHeader>

              {signers.length > 0 && (
                <CardContent>
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-medium">
                        Signatures ({signers.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {signers.map((sig) => {
                        const profile = getProfile(sig.signer_address);
                        const displayName = getUserDisplayName(
                          sig.signer_address,
                        );

                        return (
                          <div
                            key={sig.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                            onClick={() => openProfileModal(sig.signer_address)}
                          >
                            <div className="flex items-center gap-3">
                              <CheckCircle2
                                className="h-4 w-4 flex-shrink-0"
                                style={{ color: '#3F7A5A' }}
                              />
                              {profile?.profile_picture ? (
                                <img
                                  src={profile.profile_picture}
                                  alt={displayName}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                              ) : (
                                <div
                                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                  style={{ backgroundColor: '#2F5D50' }}
                                >
                                  <span className="text-white font-medium text-sm">
                                    {profile?.first_name
                                      ?.charAt(0)
                                      ?.toUpperCase() || displayName.charAt(0)}
                                  </span>
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-gray-900">
                                  {displayName}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Signed{' '}
                                  {new Date(sig.signed_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Agreement Signing Modal */}
      {signingAgreement && (
        <AgreementSigningModal
          isOpen={true}
          onClose={() => setSigningAgreement(null)}
          podId={podId}
          roleId={signingAgreement.roleId}
          agreementText={signingAgreement.description || signingAgreement.name}
          agreementId={signingAgreement.name}
          onSigningComplete={handleAgreementSigned}
        />
      )}

      {/* Profile Modal */}
      {isProfileModalOpen && selectedUser && (
        <ProfileModal
          user={selectedUser}
          users={users}
          onClose={closeProfileModal}
        />
      )}
    </div>
  );
}
