// src/app/home/page.tsx 
'use client';

import React from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi'; 
import { useUserProfile } from 'src/features/identity/hooks/useUserProfile';
import 'src/features/home/styles/HomePage.css'; 


export default function HomePage() {

  const { address } = useAccount();
  const { profile, loading } = useUserProfile(address);

  if (!address) {
    return <p>Please connect your wallet.</p>;
  }

  if (loading) {
    return <p>Loading profile...</p>;
  }


  return (
    <div className="home-container">
      {/* HEADER */}
      <div className="home-header">
        {/* Left-bound logo */}
        <img
          src="/images/spiritdaosymbol.png"
          alt="SpiritDAO Logo"
          className="home-logo"
        />

        {/* Welcome text with user's first name */}
        <h1 className="home-title">
          Welcome, {profile?.first_name || "Guest"}.
        </h1>
      </div>

      {/* USER MODULES */}
      <section className="home-section">
        <div className="home-module-list">
          <Link href="/identity" className="home-module-card">
            <img
              src="/images/profile.png"
              alt="Profile"
              className="home-module-icon"
            />
            <div className="home-module-title">Profile</div>
          </Link>

          <Link href="/market" className="home-module-card">
            <img
              src="/images/artifact.png"
              alt="Artifacts"
              className="home-module-icon"
            />
            <div className="home-module-title">Artifacts</div>
          </Link>
		  
		    <Link href="/sensemaker-ai" className="home-module-card">
            <img
              src="/images/sensemakeraikey.png"
              alt="SensemakerAI"
              className="home-module-icon"
            />
            <div className="home-module-title">Sensemaker</div>
          </Link>
        </div>
      </section>

      {/* SPIRITDAO MODULES */}
      <section className="home-section-2">
        <h2>SpiritDAO</h2>
        <div className="home-module-list">
          <Link href="/chat" className="home-module-card">
            <img
              src="/images/icons/chat.png"
              alt="Chat"
              className="home-module-icon"
            />
            <div className="home-module-title">Chat</div>
          </Link>
		  
          <Link href="/forum" className="home-module-card">
            <img
              src="/images/icons/forum.png"
              alt="Forum"
              className="home-module-icon"
            />
            <div className="home-module-title">Forum</div>
          </Link>
		  
        </div>
      </section>
	  




      {/* FOOTER */}
      <div className="home-footer">
        <p>Imagining more, together.</p>
      </div>
    </div>
  );
}