import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, Settings } from 'lucide-react';
import { PodImageService } from '@/utils/podImageService';
import { PodDeletionButtonV2 } from '@/app/pods/[id]/manage/components/PodDeletionButtonV2';
import { ProfileModal } from '@/features/identity/components/ProfileModal';
import type { Pod } from '@/features/pods/types';
import type { UserProfile } from '@/features/identity/types';

interface PodCardProps {
  pod: Pod;
  canManage: boolean;
  getProfile: (address: string) => UserProfile | null;
}

/**
 * Reusable Pod Card Component
 * Extracted from main pods page for better modularity
 */
export function PodCard({ 
  pod, 
  canManage, 
  getProfile
}: PodCardProps) {
  const router = useRouter();
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Get all profiles for the modal
  const allLeadAddresses = pod.pod_leads || [];
  const allProfiles = allLeadAddresses.map(address => getProfile(address)).filter((p): p is UserProfile => p !== null);

  // Status color utility
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'bg-[#E8F1EE] text-[#1F453A]';
      case 'inactive': return 'bg-[#F5E6E6] text-[#5C1F1F]';
      case 'proposed': return 'bg-[#E8F1EE] text-[#1F453A]';
      case 'draft': return 'bg-[#FAF4EC] text-[#7A5F3F]';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // User display utilities
  const getUserProfileImage = (walletAddress: string) => {
    const profile = getProfile(walletAddress);
    return profile?.profile_picture || null;
  };

  const getUserDisplayName = (walletAddress: string) => {
    const profile = getProfile(walletAddress);
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    if (profile?.first_name) {
      return profile.first_name;
    }
    return null;
  };

  // Profile modal handlers
  const handleProfileClick = (profile: UserProfile) => {
    setSelectedProfile(profile);
    setIsProfileModalOpen(true);
  };

  const closeProfileModal = () => {
    setIsProfileModalOpen(false);
    setSelectedProfile(null);
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <img
              src={(() => {
                try {
                  return PodImageService.getPodImageUrl(pod);
                } catch (error) {
                  console.error('Error getting pod image URL:', error, pod);
                  return `https://ui-avatars.com/api/?name=${encodeURIComponent(pod?.name || 'Pod')}&size=48&background=8FAAA1&color=fff&bold=true`;
                }
              })()}
              alt={pod?.name || 'Pod'}
              className="w-12 h-12 rounded-full object-cover"
              onError={(e) => {
                // Fallback to default avatar if image fails to load
                const target = e.target as HTMLImageElement;
                target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(pod?.name || 'Pod')}&size=48&background=8FAAA1&color=fff&bold=true`;
              }}
            />
            <div>
              <CardTitle className="text-lg">{pod.name}</CardTitle>
              <Badge className={`text-xs ${getStatusColor(pod.status)}`}>
                {pod.status || 'inactive'}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <p className="text-gray-600 text-sm mb-4 line-clamp-3">
          {pod.description}
        </p>
        
        {/* Pod Leaders Display */}
        {pod.pod_leads && pod.pod_leads.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">Pod Leads</p>
            <div className="flex flex-wrap gap-2">
              {pod.pod_leads.slice(0, 3).map((lead, index) => {
                const profile = getProfile(lead);
                const profileImage = getUserProfileImage(lead);
                const displayName = getUserDisplayName(lead);
                
                // Don't render if no profile found - clean display without wallet addresses
                if (!profile) {
                  return null;
                }
                
                return (
                  <div 
                    key={index} 
                    className="flex items-center space-x-1.5 bg-gray-50 rounded-full px-2 py-1 cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleProfileClick(profile)}
                  >
                    {/* Profile Image */}
                    {profileImage ? (
                      <img 
                        src={profileImage} 
                        alt={displayName || profile.first_name || 'Lead'}
                        className="w-6 h-6 rounded-full object-cover border border-gray-200"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#2F5D50' }}>
                        <span className="text-white text-xs font-medium">
                          {profile.first_name?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                    )}
                    
                    {/* Name Display - First Name + Full Last Name */}
                    <div className="flex items-center space-x-1 text-xs">
                      {profile.first_name && (
                        <span className="font-medium text-gray-700">{profile.first_name}</span>
                      )}
                      {profile.last_name && (
                        <span className="text-gray-700">{profile.last_name}</span>
                      )}
                      {!profile.first_name && !profile.last_name && (
                        <span className="text-gray-500 italic">No Name</span>
                      )}
                    </div>
                  </div>
                );
              }).filter(Boolean)}
              {pod.pod_leads.length > 3 && (
                <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full">
                  <span className="text-xs text-gray-500 font-medium">
                    +{pod.pod_leads.length - 3}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/pods/${pod.id}`)}
            className="flex-1"
          >
            <Eye className="h-3 w-3 mr-1" />
            View
          </Button>
          
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/pods/${pod.id}/manage`)}
            >
              <Settings className="h-3 w-3" />
            </Button>
          )}
          
          
          {/* Pod Delete Button - Show for pods that can be managed */}
          {canManage && (
            <PodDeletionButtonV2
              pod={pod}
              canManage={true}
            />
          )}
        </div>
      </CardContent>

      {/* Profile Modal */}
      {selectedProfile && isProfileModalOpen && (
        <ProfileModal
          user={selectedProfile}
          users={allProfiles}
          onClose={closeProfileModal}
        />
      )}
    </Card>
  );
}

/**
 * Grid layout for multiple pod cards
 */
interface PodCardGridProps {
  pods: Pod[];
  canUserManagePod: (pod: Pod) => boolean;
  getProfile: (address: string) => UserProfile | null;
}

export function PodCardGrid({ 
  pods, 
  canUserManagePod, 
  getProfile
}: PodCardGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {pods.map((pod) => (
        <PodCard
          key={pod.id}
          pod={pod}
          canManage={canUserManagePod(pod)}
          getProfile={getProfile}
        />
      ))}
    </div>
  );
}