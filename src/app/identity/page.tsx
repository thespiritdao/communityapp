'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import Link from 'next/link';
import { useIdentityPage } from '@/features/identity/hooks/useIdentityPage';
import { DatabaseTokenGallery } from '@/features/identity/components/DatabaseTokenGallery';
import { TenureBand } from '@/features/identity/components/TenureBand';
import { LinkedWalletsSection } from '@/features/identity/components/LinkedWalletsSection';
import { LinkDeviceSection } from '@/features/identity/components/LinkDeviceSection';
import { AppearanceSection } from '@/features/identity/components/AppearanceSection';
import { LocationSection } from '@/features/identity/components/LocationSection';
import { InviteFriendsSection } from '@/features/identity/components/InviteFriendsSection';
import { DeleteAccountSection } from '@/features/identity/components/DeleteAccountSection';
import { useOnboardingProgress } from '@/features/onboarding/useOnboardingProgress';
import { ProgressCard } from '@/features/onboarding/components/ProgressCard';
import '@/features/identity/styles/identityStyles.css';
import '@/features/identity/styles/TokenGallery.css';
import '@/features/identity/styles/ProfileModal.css';

// Lazy load heavy components with loading skeletons
const BalancesSection = dynamic(
  () =>
    import('@/features/identity/components/BalancesSection').then((mod) => ({
      default: mod.BalancesSection,
    })),
  {
    loading: () => (
      <div className="flex justify-center items-center min-h-[100px]">
        <div
          style={{
            background: '#C6933F',
            color: '#FFFFFF',
            padding: '12px 24px',
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '14px',
            letterSpacing: '0.02em',
          }}
        >
          Loading balances...
        </div>
      </div>
    ),
    ssr: false,
  },
);

const ProfileSection = dynamic(
  () =>
    import('@/features/identity/components/ProfileSection').then((mod) => ({
      default: mod.ProfileSection,
    })),
  {
    loading: () => (
      <div className="flex justify-center items-center min-h-[200px]">
        <div
          style={{
            background: '#C6933F',
            color: '#FFFFFF',
            padding: '12px 24px',
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '14px',
            letterSpacing: '0.02em',
          }}
        >
          Loading profile...
        </div>
      </div>
    ),
    ssr: false,
  },
);

export default function IdentityPage() {
  return <IdentityPageContent />;
}

function IdentityPageContent() {
  const [isClient, setIsClient] = useState(false);
  const { address, isInitializing } = useCDPStatus();
  const { currentUser } = useCurrentUser();

  const {
    isEditing,
    profile,
    loading,
    session,
    saveError,
    handleEditClick,
    handleCancel,
    handleSave,
    handleLogout,
  } = useIdentityPage(address ?? undefined);

  // Onboarding checklist, compact: the profile items flip here as they save.
  const progress = useOnboardingProgress(address);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient || loading || isInitializing) {
    return (
      <div className="identity-container bottom-nav-spacing">
        <div className="flex justify-center items-center min-h-[200px]">
          <div
            style={{
              background: '#C6933F',
              color: '#FFFFFF',
              padding: '12px 24px',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '14px',
              letterSpacing: '0.02em',
            }}
          >
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="identity-container bottom-nav-spacing">
        <div className="flex justify-center items-center min-h-[200px]">
          <p className="text-center">
            Please connect your wallet to view your profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="identity-container bottom-nav-spacing">
      <BalancesSection walletAddress={address} />

      <ProfileSection
        profile={profile}
        address={address}
        isEditing={isEditing}
        authSession={session}
        onEditClick={handleEditClick}
        onSave={handleSave}
        onCancel={handleCancel}
        saveError={saveError}
      />

      {progress.intent && !progress.dismissed && !progress.complete && (
        <ProgressCard progress={progress} compact />
      )}

      {/* Tenure / Credentials / Accreditations */}
      <div style={{ marginTop: '20px', marginBottom: '8px' }}>
        <h3 style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          color: '#8FA09A',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.5rem',
        }}>Tenure</h3>
        <div className="token-gallery-modal">
          <TenureBand walletAddress={address} />
        </div>

        <h3 style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          color: '#8FA09A',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginTop: '1rem',
          marginBottom: '0.5rem',
        }}>Credentials</h3>
        <div className="token-gallery-modal">
          <DatabaseTokenGallery walletAddress={address} category="credential" />
        </div>

        <h3 style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          color: '#8FA09A',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginTop: '1rem',
          marginBottom: '0.5rem',
        }}>Accreditations</h3>
        <div className="token-gallery-modal">
          <DatabaseTokenGallery walletAddress={address} category="accreditation" />
        </div>
      </div>

      {/* Linked Wallets - external wallet identity */}
      <LinkedWalletsSection walletAddress={address} />

      {/* Linked Devices — issue a one-time code for a second device */}
      <LinkDeviceSection />

      {/* Pod Faces — wear a community's published look */}
      <AppearanceSection />

      {/* Location — opt-in sharing with your pods (Places module) */}
      <LocationSection />

      {/* Invite Friends — unified: personal link + pod-enroll link + email */}
      <InviteFriendsSection walletAddress={address} />

      <div
        className="form-buttons"
        style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}
      >
        <button type="button" className="btn" onClick={handleLogout}>
          Logout
        </button>
      </div>

      {/* Privacy and Terms Links */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          marginTop: '30px',
          marginBottom: '30px',
          fontSize: '14px',
        }}
      >
        <Link
          href="/privacy"
          style={{
            color: '#2F5D50',
            textDecoration: 'none',
            fontWeight: '500',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.textDecoration = 'underline')
          }
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
        >
          Privacy Policy
        </Link>
        <span style={{ color: '#ccc' }}>|</span>
        <Link
          href="/terms"
          style={{
            color: '#2F5D50',
            textDecoration: 'none',
            fontWeight: '500',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.textDecoration = 'underline')
          }
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
        >
          Terms of Service
        </Link>
      </div>

      {/* Danger zone — in-app account deletion (Google Play data policy) */}
      <DeleteAccountSection />
    </div>
  );
}
