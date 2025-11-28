'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  FileText,
  XCircle,
  Users,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Search,
} from 'lucide-react';
import FundingModal from '@/components/FundingModal';
import FundButton from '@/components/FundButton';
import { useFundingModal } from '@/hooks/useFundingModal';
import { useAccount } from 'wagmi';
import { PodCoreService } from '@/features/pods/services/PodCoreService';
import { useToast } from '@/components/ui/use-toast';
import { useProfiles } from '@/features/identity/hooks/useProfiles';
import { useProfileModal } from '@/features/identity/hooks/useProfileModal';
import { ProfileModal } from '@/features/identity';
import {
  getTreasuryAddress,
  getTreasuryAddressSync,
} from '@/features/pods/utils/treasuryAddressUtils';
import { supabase } from '@/utils/supabaseClient';
import dynamic from 'next/dynamic';
import '../../../features/home/styles/HomePage.css';

// Lazy load the agreement signing modal (fixes SSR issues)
const AgreementSigningModal = dynamic(
  () => import('@/features/pods/components/AgreementSigningModal'),
  { ssr: false },
);

interface EligibilityCriterion {
  type: string;
  name: string;
  description?: string;
  required_for_role?: string;
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

export default function PodDetailPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const { address } = useAccount();
  const { toast } = useToast();

  // Pod loading state
  const [pod, setPod] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Agreement state
  const [agreementCriteria, setAgreementCriteria] = useState<
    Array<EligibilityCriterion & { roleId: string }>
  >([]);
  const [signatures, setSignatures] = useState<AgreementSignature[]>([]);
  const [signingAgreement, setSigningAgreement] = useState<
    (EligibilityCriterion & { roleId: string }) | null
  >(null);

  // Member state
  const [allMembers, setAllMembers] = useState<string[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [isLeader, setIsLeader] = useState(false);

  // Treasury address state (factory-first lookup)
  const [treasuryAddress, setTreasuryAddress] = useState<string | null>(null);
  const [treasuryLoading, setTreasuryLoading] = useState(false);

  // Funding modal state
  const { modalProps, openPodFunding } = useFundingModal();

  // Profile modal state
  const {
    selectedUser,
    users,
    isOpen: isProfileModalOpen,
    openProfileModal,
    closeProfileModal,
  } = useProfileModal();

  // Get all unique member addresses (leaders + members)
  const allMemberAddresses = allMembers;
  const { getProfile } = useProfiles(allMemberAddresses);

  // Get signer addresses for profiles
  const allSignerAddresses = signatures.map((sig) => sig.signer_address);
  const { getProfile: getSignerProfile } = useProfiles(allSignerAddresses);

  useEffect(() => {
    const load = async () => {
      if (!id) return;

      // Validate that ID looks like a UUID before making database calls
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const idString = String(id);

      if (!uuidRegex.test(idString)) {
        console.warn('❌ Invalid pod ID format:', idString);
        setPod(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const podData = await PodCoreService.getPodById(idString);
        setPod(podData);

        // Load treasury address from factory (with database fallback)
        if (podData?.id) {
          setTreasuryLoading(true);
          try {
            const factoryTreasuryAddress = await getTreasuryAddress(
              podData.id,
              podData.treasury_contract_address,
            );
            setTreasuryAddress(factoryTreasuryAddress);
            console.log(
              '✅ Treasury address resolved:',
              factoryTreasuryAddress,
            );
          } catch (error) {
            console.error('❌ Treasury address lookup failed:', error);
            // Fallback to sync method with database value
            const syncTreasuryAddress = getTreasuryAddressSync(
              podData.treasury_contract_address,
            );
            setTreasuryAddress(syncTreasuryAddress);
          } finally {
            setTreasuryLoading(false);
          }
        }

        // Load agreements and signatures
        await loadAgreements(idString);

        // Load members
        await loadMembers(idString, podData);
      } catch (e) {
        console.error('❌ Failed to load pod:', e);
        setPod(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  async function loadAgreements(podId: string) {
    try {
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
    }
  }

  async function loadMembers(podId: string, podData: any) {
    try {
      setMembersLoading(true);

      // Get leaders from pod_leads array
      const leaders = podData?.pod_leads || [];

      // Check if current user is a leader
      if (
        address &&
        leaders.some((l: string) => l.toLowerCase() === address.toLowerCase())
      ) {
        setIsLeader(true);
      } else {
        setIsLeader(false);
      }

      // Get members from pod_members table
      const { data: memberRecords, error: membersError } = await supabase
        .from('pod_members')
        .select('wallet, membership_type, is_active')
        .eq('pod_id', podId)
        .eq('is_active', true);

      if (membersError) {
        console.error('❌ Error loading members:', membersError);
      }

      const members = memberRecords?.map((m) => m.wallet) || [];

      // Combine and deduplicate
      const allUnique = Array.from(new Set([...leaders, ...members]));
      console.log('✅ Loaded members:', {
        leaders: leaders.length,
        members: members.length,
        total: allUnique.length,
      });
      setAllMembers(allUnique);
    } catch (error) {
      console.error('❌ Error loading members:', error);
    } finally {
      setMembersLoading(false);
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

  function hasMemberSignedAnyAgreement(memberAddress: string): boolean {
    return signatures.some(
      (sig) => sig.signer_address.toLowerCase() === memberAddress.toLowerCase(),
    );
  }

  async function handleAgreementSigned() {
    // Reload agreements and signatures
    if (id) {
      await loadAgreements(String(id));
    }
    setSigningAgreement(null);

    toast({
      title: 'Agreement Signed',
      description: 'Your signature has been recorded.',
      variant: 'default',
    });
  }

  if (loading) {
    return (
      <div className="home-container">
        <div className="flex justify-center items-center h-64">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!pod) {
    return (
      <div className="home-container">
        <div className="text-center py-12">
          <div className="flex justify-center mb-4">
            <Search className="text-gray-400 w-24 h-24" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">
            Pod Not Found
          </h2>
          <p className="text-gray-600 mb-6">
            The pod you're looking for doesn't exist or has been removed.
          </p>
          <a
            href="/pods"
            className="inline-flex items-center px-4 py-2 rounded-lg transition-colors"
            style={{ backgroundColor: '#8FAAA1', color: '#1F2D2A' }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = '#6F8F86')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = '#8FAAA1')
            }
          >
            ← Back to Pods
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              {pod.name}
              <Badge
                variant="outline"
                className={`ml-2 mr-4 ${
                  pod.status === 'active'
                    ? 'bg-green-100 text-green-800 border-green-300'
                    : pod.status === 'draft'
                      ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                      : pod.status === 'pending'
                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                        : 'bg-gray-100 text-gray-800 border-gray-300'
                }`}
              >
                {pod.status}
              </Badge>
            </CardTitle>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Fund Pod Button */}
              <FundButton
                recipientType="pod"
                variant="default"
                onClick={() =>
                  openPodFunding({
                    address:
                      treasuryAddress ||
                      '0x85e4e4C68C72Cb7ae3203C72E6bbb14C55866a11',
                    name: pod.name,
                    description: `Support ${pod.name} with funding to help achieve their mission`,
                    isTreasury: !!treasuryAddress,
                    podId: pod.id,
                  })
                }
                disabled={!address || treasuryLoading}
              />
              {treasuryLoading && (
                <div className="text-xs text-gray-500">Loading treasury...</div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pod Image Banner */}
          {pod.pod_image_url && (
            <div className="w-full">
              <img
                src={pod.pod_image_url}
                alt={pod.name}
                className="w-full h-64 object-cover rounded-lg"
                onError={(e) => {
                  // Hide image if it fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Description */}
          <div>
            <p className="text-gray-700">{pod.description}</p>
          </div>

          {/* Agreements Section */}
          {agreementCriteria.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Pod Agreements
              </h3>

              {agreementCriteria.map((criterion, index) => {
                const userHasSigned = hasUserSigned(criterion.name);

                return (
                  <Card key={index}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
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
                            {address &&
                              (userHasSigned ? (
                                <Badge
                                  variant="default"
                                  className="text-xs bg-green-600 whitespace-nowrap"
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
                              ))}
                          </div>
                        </div>

                        {address && !userHasSigned && (
                          <Button
                            onClick={() => setSigningAgreement(criterion)}
                            size="sm"
                            className="ml-4 whitespace-nowrap"
                          >
                            Sign
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Members Section */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" />
              Members ({allMembers.length})
            </h3>

            {membersLoading ? (
              <div className="flex justify-center p-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : allMembers.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-gray-500">
                  No members yet
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    {allMembers.map((memberAddress, index) => {
                      const profile = getProfile(memberAddress);
                      const displayName = getUserDisplayName(memberAddress);
                      const hasSigned =
                        hasMemberSignedAnyAgreement(memberAddress);

                      return (
                        <div
                          key={memberAddress + index}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          {/* Member Info */}
                          <div
                            className="flex items-center gap-3 cursor-pointer flex-1"
                            onClick={() => openProfileModal(memberAddress)}
                          >
                            {/* Profile Picture */}
                            {profile?.profile_picture ? (
                              <img
                                src={profile.profile_picture}
                                alt={displayName}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                                <span className="text-white font-medium text-sm">
                                  {profile?.first_name
                                    ?.charAt(0)
                                    ?.toUpperCase() || displayName.charAt(0)}
                                </span>
                              </div>
                            )}

                            {/* Name and Agreement Status */}
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">
                                {displayName}
                              </p>
                              {hasSigned ? (
                                <div className="flex items-center gap-1 text-green-600 mt-0.5">
                                  <Check className="h-3.5 w-3.5" />
                                  <span className="text-xs font-medium">
                                    Signed
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-gray-400 mt-0.5">
                                  <XCircle className="h-3.5 w-3.5" />
                                  <span className="text-xs font-medium">
                                    Not Signed
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Apply to Join Button - TESTING MODE: Shown to all connected users */}
          {/* TODO: Change back to: {id && address && !isLeader && ( */}
          {id && address && (
            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={() => router.push(`/pods/${id}/applications/apply`)}
                className="px-8"
              >
                <UserPlus className="w-5 h-5 mr-2" />
                Apply to Join
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agreement Signing Modal */}
      {signingAgreement && (
        <AgreementSigningModal
          isOpen={true}
          onClose={() => setSigningAgreement(null)}
          podId={String(id)}
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

      {/* Funding Modal */}
      {modalProps.recipient && (
        <FundingModal
          {...modalProps}
          onSuccess={(amount, token) => {
            toast({
              title: 'Funding Successful!',
              description: `Successfully sent ${amount} ${token} to ${modalProps.recipient?.name}`,
            });
          }}
        />
      )}
    </div>
  );
}
