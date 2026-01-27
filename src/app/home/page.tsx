// src/app/home/page.tsx
'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useUserProfile } from '@/features/identity/hooks/useUserProfile';
import '../../features/home/styles/HomePage.css';

export default function HomePage() {
  // Use CDP hooks directly instead of wagmi for better embedded wallet support
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { profile, loading } = useUserProfile(address || undefined);

  // Debug logging
  console.log('🏠 Home Page - CDP Session Status:', {
    currentUser: currentUser ? 'Logged in' : 'Not logged in',
    address,
    hasAddress: !!address,
    profile,
    loading,
  });

  if (!address) {
    console.warn('⚠️ Home Page: No wallet address detected');
    console.warn('   Current user:', currentUser ? 'Yes' : 'No');
    console.warn('   This suggests CDP session is not persisting across navigation');
    return (
      <div className="home-container">
        <div className="flex justify-center items-center min-h-[200px]">
          <p>Please connect your wallet.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="home-container">
        <div className="flex justify-center items-center min-h-[200px]">
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      {/* HEADER */}
      <div className="home-header">
        {/* Left-bound logo */}
        <Image
          src="/images/spiritdaosymbol.png"
          alt="SpiritDAO Logo"
          className="home-logo"
          width={80}
          height={80}
          priority
        />

        {/* Welcome text with user's first name */}
        <h1 className="home-title">
          Welcome, {profile?.first_name || 'Guest'}.
        </h1>
      </div>

      {/* Profile Completion Reminder for First-Time Users */}
      {!profile?.first_name && (
        <div style={{
          margin: '16px',
          padding: '16px',
          background: 'linear-gradient(135deg, #FFFBF5 0%, #F9F5F0 100%)',
          borderRadius: '12px',
          border: '1px solid rgba(143, 170, 161, 0.3)',
          boxShadow: '0 2px 8px rgba(47, 93, 80, 0.08)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{
              fontSize: '24px',
              flexShrink: 0,
            }}>
              ✨
            </div>
            <div style={{ flex: 1 }}>
              <p style={{
                fontSize: '15px',
                fontWeight: '600',
                color: '#3A3A3A',
                marginBottom: '4px',
              }}>
                Complete your profile
              </p>
              <p style={{
                fontSize: '13px',
                color: '#5F5A54',
                marginBottom: '12px',
              }}>
                Help the community get to know you better by adding your name and details.
              </p>
              <Link
                href="/identity"
                style={{
                  display: 'inline-block',
                  padding: '8px 16px',
                  background: '#2F5D50',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  textDecoration: 'none',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#254A40';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#2F5D50';
                }}
              >
                Complete Profile →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* USER MODULES */}
      <section className="home-section">
        <div className="home-module-list">
          <Link href="/identity" className="home-module-card" prefetch={true}>
            <Image
              src="/images/icons/identityicon.png"
              alt="Identity"
              className="home-module-icon"
              width={64}
              height={64}
              loading="eager"
            />
            <div className="home-module-title">Identity</div>
          </Link>

          <Link href="/market" className="home-module-card" prefetch={true}>
            <Image
              src="/images/icons/artifactsicon.png"
              alt="Artifacts"
              className="home-module-icon"
              width={64}
              height={64}
              loading="eager"
            />
            <div className="home-module-title">Artifacts</div>
          </Link>

          <Link
            href="/sensemaker-ai"
            className="home-module-card"
            prefetch={true}
          >
            <Image
              src="/images/sensemakeraikey.png"
              alt="SensemakerAI"
              className="home-module-icon"
              width={64}
              height={64}
              loading="eager"
            />
            <div className="home-module-title">Sensemaker</div>
          </Link>
        </div>
      </section>

      {/* SPIRITDAO MODULES */}
      <section className="home-section-2">
        <div className="home-module-list">
          <Link href="/chat" className="home-module-card" prefetch={true}>
            <Image
              src="/images/icons/chaticon.png"
              alt="Chat"
              className="home-module-icon"
              width={64}
              height={64}
              loading="lazy"
            />
            <div className="home-module-title">Chat</div>
          </Link>

          <Link href="/forum" className="home-module-card" prefetch={true}>
            <Image
              src="/images/icons/forumicon.png"
              alt="Forum"
              className="home-module-icon"
              width={64}
              height={64}
              loading="lazy"
            />
            <div className="home-module-title">Forum</div>
          </Link>

          <Link href="/events" className="home-module-card" prefetch={true}>
            <Image
              src="/images/icons/eventsicon.png"
              alt="Events"
              className="home-module-icon"
              width={64}
              height={64}
              loading="lazy"
            />
            <div className="home-module-title">Events</div>
          </Link>

          <Link href="/pods" className="home-module-card" prefetch={true}>
            <Image
              src="/images/icons/podsicon.png"
              alt="Pods"
              className="home-module-icon"
              width={64}
              height={64}
              loading="lazy"
            />
            <div className="home-module-title">Pods</div>
          </Link>

          <Link href="/governance" className="home-module-card" prefetch={true}>
            <Image
              src="/images/icons/governanceicon.png"
              alt="Governance"
              className="home-module-icon"
              width={64}
              height={64}
              loading="lazy"
            />
            <div className="home-module-title">Governance</div>
          </Link>

          <Link href="/bounty" className="home-module-card" prefetch={true}>
            <Image
              src="/images/icons/bountiesicon.png"
              alt="Bounties"
              className="home-module-icon"
              width={64}
              height={64}
              loading="lazy"
            />
            <div className="home-module-title">Bounties</div>
          </Link>

          <Link href="/knowledge" className="home-module-card" prefetch={true}>
            <Image
              src="/images/icons/knowledgebaseicon.png"
              alt="Knowledge Base"
              className="home-module-icon"
              width={64}
              height={64}
              loading="lazy"
            />
            <div className="home-module-title">Knowledge</div>
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <div className="home-footer">
        <p>Becoming more, together.</p>
      </div>
    </div>
  );
}
