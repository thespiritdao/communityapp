//src/app/identity/page.tsx

'use client';
import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { OnchainProviders } from 'src/wallet/components/OnchainProviders';
import { Footer } from 'src/components/Footer';
import { Badge } from 'src/features/identity/components/Badge';
import { IdentityCard } from 'src/features/identity/components/IdentityCard';
import { Socials } from 'src/features/identity/components/Socials';
import { ProfileHeader } from 'src/features/identity/components/ProfileHeader';
import { useUserProfile } from 'src/features/identity/hooks/useUserProfile';
import { updateProfile } from 'src/features/identity/utils/updateProfile';
import { ProfileEditForm } from 'src/features/identity/components/ProfileEditForm';
import { supabase } from 'src/utils/supabaseClient';
import { Balances } from 'src/features/identity/components/Balances'; 
import { TokenGallery } from 'src/features/identity/components/TokenGallery';
import { UnlockMembership } from 'src/features/identity/components/UnlockMembership';
import 'src/features/identity/styles/identityStyles.css';
import 'src/features/identity/styles/TokenGallery.css';

export default function IdentityPage() {
  return (
    <OnchainProviders>
      <IdentityPageContent />
    </OnchainProviders>
  );
}

function IdentityPageContent() {
  const [isClient, setIsClient] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [authSession, setAuthSession] = useState(null);
  const { address } = useAccount();
  const { profile, loading, refetch } = useUserProfile(address);

  // Initialize client-side rendering state
  useEffect(() => {
    console.log("IdentityPageContent mounted. Setting client state.");
    setIsClient(true);
  }, []);

  // Fetch and manage Supabase session
  useEffect(() => {
    const fetchSession = async () => {
      const { data: session, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Error fetching session:", error.message);
        return;
      }

      setAuthSession(session);
      if (session) {
        console.log("Supabase Auth Session initialized:", session);
      } else {
        console.warn("No active session found. Attempting refresh...");
        const { data: refreshedSession, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error("Error refreshing session:", refreshError.message);
        } else {
          setAuthSession(refreshedSession);
          console.log("Refreshed Supabase Auth Session:", refreshedSession);
        }
      }
    };

    fetchSession();
  }, []);

  // Debugging state changes
  useEffect(() => {
    console.log("isEditing state changed:", isEditing);
  }, [isEditing]);

  useEffect(() => {
    console.log("Profile fetched:", profile);
    console.log("Loading state:", loading);
  }, [profile, loading]);

  // Check if client-side is ready and wallet is connected
  if (!isClient || loading) {
    console.log("Loading or client not ready. isClient:", isClient, "Loading:", loading);
    return <p>Loading...</p>;
  }

  if (!address) {
    console.log("No wallet address found. Prompting user to connect wallet.");
    return (
      <div className="wrapper">
        <p className="text-center text-white">
          Please connect your wallet to view your profile.
        </p>
      </div>
    );
  }

  const handleEditClick = () => {
    console.log("Edit Profile button clicked. Toggling isEditing state.");
    setIsEditing(!isEditing);
  };

  const handleCancel = () => {
    console.log("Cancel button clicked. Exiting edit mode.");
    setIsEditing(false);
  };

  const handleSave = async (data) => {
    if (!address) {
      console.log("No wallet address available. Aborting save.");
      return;
    }
    console.log("Saving profile with data:", data);
    await updateProfile(address, data);
    console.log("Profile saved successfully. Refetching profile data.");
    setIsEditing(false);
    await refetch();
  };

  const handleLogout = async () => {
    console.log("Logout button clicked. Signing out user.");
    await supabase.auth.signOut();
    setAuthSession(null); // Clear local session state
    console.log("User signed out successfully.");
  };

  return (
    <div className="identity-container">
      <div className="profile-section">
        <h2>Balances</h2>
        <Balances walletAddress={address} />
      </div>
	
      <div className="profile-section">
        <h2>Profile</h2>
        {isEditing ? (
          <ProfileEditForm
            initialData={profile || {}}
            authSession={authSession}
            walletAddress={address}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        ) : (
          <>
            <ProfileHeader address={address} profile={profile} showCopy={false} />
            
            {profile?.bio && <p>{profile.bio}</p>}

            <button 
              className="button button-enter" 
              style={{ marginTop: '10px' }}
              onClick={handleEditClick}
            >
              Edit Profile
            </button>
          </>
        )}
      </div>

      <div className="badges-section">
        <h2>Membership</h2>
        <TokenGallery walletAddress={address} category="membership" />
        <div className="legacy-badges" style={{ marginTop: '20px' }}>
          <Badge address={address} />
        </div>
      </div>
	  
      <div className="badges-section">
        <h2>Credentials</h2>
        <TokenGallery walletAddress={address} category="credential" />
        <div className="legacy-badges" style={{ marginTop: '20px' }}>
          <Badge address={address} />
        </div>
      </div>

      <div className="form-buttons" style={{ display: 'flex', justifyContent: 'center' }}>
        <button type="button" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <Footer />
    </div>
  );
}