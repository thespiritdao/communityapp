'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import Link from 'next/link';
import { useIdentityPage } from '@/features/identity/hooks/useIdentityPage';
import { DatabaseTokenGallery } from '@/features/identity/components/DatabaseTokenGallery';
import { TenureBand } from '@/features/identity/components/TenureBand';
import { InviteCodeDisplay } from '@/features/identity/components/InviteCodeDisplay';
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

      {/* Invite Code Display - Only visible to account owner */}
      <InviteCodeDisplay walletAddress={address} />

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
    </div>
  );
}
