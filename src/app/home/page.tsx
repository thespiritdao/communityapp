// src/app/home/page.tsx
'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useAccount } from 'wagmi';
import { useUserProfile } from '@/features/identity/hooks/useUserProfile';
import '../../features/home/styles/HomePage.css';

export default function HomePage() {
  const { address } = useAccount();
  const { profile, loading } = useUserProfile(address);

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
        <h2>SpiritDAO</h2>
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
        </div>
      </section>

      {/* FOOTER */}
      <div className="home-footer">
        <p>Becoming more, together.</p>
      </div>
    </div>
  );
}
