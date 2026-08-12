// src/app/home/page.tsx
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useUserWallet } from '@/hooks/useUserWallet';
import { useUserProfile } from '@/features/identity/hooks/useUserProfile';
import { TosModal } from '@/components/TosModal';
import { PodInviteRedeemer } from '@/components/PodInviteRedeemer';
import { supabase } from '@/utils/supabaseClient';
import { HOME_USER_MODULES, HOME_COMMUNITY_MODULES } from '@/config/moduleRegistry';
import { HomeModuleIcon, LogoSlot } from '@/components/SlotIcon';
import '../../features/home/styles/HomePage.css';

export default function HomePage() {
  const address = useUserWallet();
  const { currentUser } = useCurrentUser();
  const { profile, loading } = useUserProfile(address || undefined);
  const [showTos, setShowTos] = useState(false);

  useEffect(() => {
    if (!address || loading) return;
    const checkTos = async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('tos_signed_at')
        .eq('wallet_address', address.toLowerCase())
        .maybeSingle();
      if (!data?.tos_signed_at) setShowTos(true);
    };
    checkTos();
  }, [address, loading]);

  if (!address) {
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
      {/* Redeems a pending pod invite link (?invite=POD-…) after auth */}
      <PodInviteRedeemer />

      {showTos && address && (
        <TosModal
          walletAddress={address}
          onAccepted={() => setShowTos(false)}
        />
      )}

      {/* HEADER */}
      <div className="home-header" data-tour="welcome">
        {/* Left-bound logo — face-remappable (logo slot) */}
        <LogoSlot size={80} />

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
          background: 'hsl(var(--card))',
          borderRadius: '12px',
          border: '1px solid hsl(var(--primary) / 0.3)',
          boxShadow: '0 2px 8px hsl(var(--primary) / 0.08)',
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
                color: 'hsl(var(--foreground))',
                marginBottom: '4px',
              }}>
                Complete your profile
              </p>
              <p style={{
                fontSize: '13px',
                color: 'var(--face-text-subtle)',
                marginBottom: '12px',
              }}>
                Help the community get to know you better by adding your name and details.
              </p>
              <Link
                href="/identity"
                style={{
                  display: 'inline-block',
                  padding: '8px 16px',
                  background: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  textDecoration: 'none',
                  transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    'color-mix(in srgb, hsl(var(--primary)) 85%, black)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'hsl(var(--primary))';
                }}
              >
                Complete Profile →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* USER MODULES — registry-driven so Pod Faces can remap icons */}
      <section className="home-section">
        <div className="home-module-list">
          {HOME_USER_MODULES.map((m) => (
            <Link
              key={m.slot}
              href={m.href}
              className="home-module-card"
              prefetch={true}
              data-tour={m.tourId}
            >
              <HomeModuleIcon
                slot={m.slot}
                defaultIcon={m.defaultIcon}
                label={m.label}
                eager={m.eager}
              />
              <div className="home-module-title">{m.label}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* COMMUNITY MODULES */}
      <section className="home-section-2">
        <div className="home-module-list">
          {HOME_COMMUNITY_MODULES.map((m) => (
            <Link
              key={m.slot}
              href={m.href}
              className="home-module-card"
              prefetch={true}
              data-tour={m.tourId}
            >
              <HomeModuleIcon
                slot={m.slot}
                defaultIcon={m.defaultIcon}
                label={m.label}
                eager={m.eager}
              />
              <div className="home-module-title">{m.label}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <div className="home-footer">
        <p>Becoming more, together.</p>
      </div>
    </div>
  );
}
