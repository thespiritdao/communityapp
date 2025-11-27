import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  PenTool,
  Shield,
  FileText,
  ExternalLink,
  Users,
} from 'lucide-react';
import FundButton from '@/components/FundButton';
import { useProfiles } from '@/features/identity/hooks/useProfiles';
import { useProfileModal } from '@/features/identity/hooks/useProfileModal';
import { ProfileModal } from '@/features/identity';
import { useAccountability } from '@/features/pods/hooks/useAccountability';
import type { Pod } from '@/features/pods/types';

interface PodDetailsContainerProps {
  pod: Pod;
  canUserManagePod: boolean;
  treasuryAddress: string | null;
  treasuryLoading: boolean;
  showAgreementModal: boolean;
  showMembershipModal: boolean;
  canApply: boolean;
  onOpenAgreementModal: () => void;
  onOpenMembershipModal: () => void;
  onOpenPodFunding: (podId: string, treasuryAddress?: string) => void;
}

/**
 * Reusable Pod Details Container
 * Handles the display of pod information, members, and accountability signatures
 */
export function PodDetailsContainer({
  pod,
  canUserManagePod,
  treasuryAddress,
  treasuryLoading,
  showAgreementModal,
  showMembershipModal,
  canApply,
  onOpenAgreementModal,
  onOpenMembershipModal,
  onOpenPodFunding,
}: PodDetailsContainerProps) {
  // Use accountability hook for signature management
  const {
    signatures,
    signing,
    agreementText,
    setAgreementText,
    handleSign,
    canSign,
    hasSigned,
    error: accountabilityError,
  } = useAccountability({
    podId: pod.id,
    podName: pod.name,
  });

  // Profile management
  const allLeadAddresses = pod?.pod_leads || [];
  const { getProfile } = useProfiles(allLeadAddresses);
  const {
    selectedUser,
    users,
    isOpen: isProfileModalOpen,
    openProfileModal,
    closeProfileModal,
  } = useProfileModal();

  // Utility functions
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active':
        return 'bg-[#E8F1EE] text-[#1F453A]';
      case 'inactive':
        return 'bg-[#F5E6E6] text-[#5C1F1F]';
      case 'proposed':
        return 'bg-[#E8F1EE] text-[#1F453A]';
      case 'draft':
        return 'bg-[#FAF4EC] text-[#7A5F3F]';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getUserDisplayName = (walletAddress: string) => {
    const profile = getProfile(walletAddress);
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    if (profile?.first_name) {
      return profile.first_name;
    }
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  };

  return (
    <div className="home-container">
      <div className="space-y-8">
        {/* Pod Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-4">
                {pod.pod_image_url && (
                  <img
                    src={pod.pod_image_url}
                    alt={pod.name}
                    className="w-20 h-20 rounded-full object-cover"
                  />
                )}
                <div>
                  <CardTitle className="text-2xl mb-2">{pod.name}</CardTitle>
                  <Badge className={`mb-2 ${getStatusColor(pod.status)}`}>
                    {pod.status || 'inactive'}
                  </Badge>
                  <p className="text-gray-600">{pod.description}</p>
                </div>
              </div>

              {/* Treasury Actions */}
              {treasuryAddress && (
                <div className="flex items-center space-x-2">
                  <FundButton
                    fundingType="pod"
                    fundingTarget={{ podId: pod.id, treasuryAddress }}
                    buttonProps={{
                      variant: 'outline',
                      size: 'sm',
                      disabled: treasuryLoading,
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      window.open(
                        `https://basescan.org/address/${treasuryAddress}`,
                        '_blank',
                      )
                    }
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Treasury
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
        </Card>

        {/* Pod Leaders */}
        {pod.pod_leads && pod.pod_leads.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Pod Leaders ({pod.pod_leads.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pod.pod_leads.map((lead, index) => {
                  const profile = getProfile(lead);
                  const displayName = getUserDisplayName(lead);

                  return (
                    <div
                      key={index}
                      className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => openProfileModal(lead, allLeadAddresses)}
                    >
                      {profile?.profile_image_url ? (
                        <img
                          src={profile.profile_image_url}
                          alt={displayName}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: '#2F5D50' }}
                        >
                          <span className="text-white font-medium">
                            {profile?.first_name?.charAt(0)?.toUpperCase() ||
                              '?'}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">
                          {displayName}
                        </p>
                        <p className="text-sm text-gray-500">{lead}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Accountability Agreement Section */}
        {canSign && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="h-5 w-5 mr-2" />
                Accountability Agreement
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasSigned ? (
                <div className="text-center py-6">
                  <Check
                    className="h-12 w-12 mx-auto mb-4"
                    style={{ color: '#3F7A5A' }}
                  />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Agreement Signed
                  </h3>
                  <p className="text-gray-600">
                    You have successfully signed the accountability agreement.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-600">
                    As a pod leader, please review and sign the accountability
                    agreement to proceed with pod activation.
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Accountability Statement
                    </label>
                    <Textarea
                      value={agreementText}
                      onChange={(e) => setAgreementText(e.target.value)}
                      rows={4}
                      className="w-full"
                      placeholder="Enter your acknowledgment statement..."
                    />
                  </div>

                  <div>
                    <Button onClick={handleSign} disabled={signing}>
                      {signing ? 'Signing...' : 'Sign and Submit'}
                    </Button>
                  </div>

                  {accountabilityError && (
                    <div className="text-sm" style={{ color: '#8B3A3A' }}>
                      {accountabilityError}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Existing Signatures */}
        {signatures.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Accountability Signatures ({signatures.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {signatures.map((sig, index) => (
                  <div
                    key={index}
                    className="border-l-4 pl-4 py-2"
                    style={{ borderLeftColor: '#3F7A5A' }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {getUserDisplayName(sig.address)}
                        </p>
                        <p className="text-sm text-gray-500">{sig.address}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          {sig.statement}
                        </p>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(sig.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Membership Application */}
        {canApply && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <PenTool className="h-5 w-5 mr-2" />
                Join This Pod
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-6">
                <p className="text-gray-600 mb-4">
                  This pod is accepting new members. Apply to join and
                  contribute to the community.
                </p>
                <Button onClick={onOpenMembershipModal}>
                  Apply to Join Pod
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Management Actions */}
        {canUserManagePod && (
          <Card>
            <CardHeader>
              <CardTitle>Pod Management</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-4">
                <Button
                  onClick={() =>
                    (window.location.href = `/pods/${pod.id}/manage`)
                  }
                  variant="default"
                >
                  Manage Pod
                </Button>
                <Button onClick={onOpenAgreementModal} variant="outline">
                  View Agreement
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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
