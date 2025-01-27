//src/app/identity/page.tsx

'use client';
import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { OnchainProviders } from 'src/wallet/components/OnchainProviders';
import { Footer } from 'src/components/Footer';
import { Badge } from 'src/identity/components/Badge';
import { IdentityCard } from 'src/identity/components/IdentityCard';
import { Socials } from 'src/identity/components/Socials';
import { ProfileHeader } from 'src/identity/components/ProfileHeader';
import { useUserProfile } from 'src/identity/hooks/useUserProfile';
import { updateProfile } from 'src/identity/utils/updateProfile';
import { ProfileEditForm } from 'src/identity/components/ProfileEditForm';
import { supabase } from 'src/utils/supabaseClient';
import 'src/identity/styles/identityStyles.css';

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
        <div className="flex items-center justify-between">
          <h2>Profile</h2>
          {!isEditing && (
            <>
              <button className="button button-enter" onClick={handleEditClick}>
                Edit Profile
              </button>
              <button onClick={handleLogout} className="button">
                Logout
              </button>
            </>
          )}
        </div>
        {isEditing ? (
          <ProfileEditForm
            initialData={profile || {}}
            authSession={authSession} // Pass session to ProfileEditForm
            walletAddress={address} // Pass wallet address explicitly
            onSave={handleSave}
            onCancel={handleCancel}
          />
        ) : (
          <ProfileHeader address={address} profile={profile} />
        )}
      </div>

      <div className="badges-section">
        <h2>Memberships</h2>
        <Badge address={address} />
      </div>
	  
	  <div className="badges-section">
        <h2>Credentials</h2>
        <Badge address={address} />
      </div>


      <Footer />
    </div>
  );
}
