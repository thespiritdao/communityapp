// src/wallet/components/SignInWithEthereumButton.tsx
import React from 'react';
import { supabase } from 'src/features/identity/utils/supabaseClient';
import { signMessage, useAccount } from 'wagmi'; 

export const SignInWithEthereumButton: React.FC = () => {
  const { address } = useAccount();

  const handleSignInWithEthereum = async () => {
    try {
      // 1) Get a random nonce
      const nonceRes = await fetch('/api/auth/nonce');
      if (!nonceRes.ok) {
        throw new Error(`Failed to get nonce: ${nonceRes.statusText}`);
      }
      const { nonce } = await nonceRes.json();

      // 2) Have the user sign
      const signature = await signMessage({ message: nonce });

      // 3) Send {address, signature} to /api/auth/verify
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature }),
      });
      if (!verifyRes.ok) {
        throw new Error(`Verify failed: ${verifyRes.statusText}`);
      }
      const { supabaseToken } = await verifyRes.json();

      if (!supabaseToken) {
        console.error('No supabaseToken returned!');
        return;
      }

      // 4) Set the Supabase session (requires supabase-js v2)
      const { data, error } = await supabase.auth.setSession({
        access_token: supabaseToken,
        refresh_token: '',
      });
      if (error) {
        console.error('Error setting Supabase session:', error.message);
      } else {
        console.log('Supabase session set successfully:', data);
      }
    } catch (err) {
      console.error('Sign in with Ethereum flow failed:', err);
    }
  };

  return (
    <button onClick={handleSignInWithEthereum}>
      Sign In With Ethereum
    </button>
  );
};
