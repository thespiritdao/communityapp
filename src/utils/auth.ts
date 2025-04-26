// src/utils/auth.ts

import { supabase } from "src/utils/supabaseClient";
import { airdropMembershipToken } from "src/utils/airdrop";
import { ethers } from "ethers";

// Function to handle user login
export async function handleUserLogin(walletAddress: string) {
  console.log(`🔍 Checking if user ${walletAddress} exists in Supabase...`);

  const { data: user, error } = await supabase
    .from("user_profiles")
    .select("wallet_address, has_membership")
    .eq("wallet_address", walletAddress)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("❌ Supabase error:", error);
    throw error;
  }

  if (!user) {
    console.log(`🆕 New user detected: ${walletAddress}. Creating profile...`);

    // Create user profile in Supabase
    const { error: insertError } = await supabase.from("user_profiles").insert([
      {
        wallet_address: walletAddress,
        has_membership: false, // Default: No token yet
      },
    ]);

    if (insertError) {
      console.error("❌ Error creating user profile:", insertError);
      throw insertError;
    }

    console.log(`✅ Profile created for ${walletAddress}.`);

    // 🎉 Airdrop token to new user
    await airdropMembershipToken(walletAddress);
  } else {
    console.log(`✅ User ${walletAddress} already exists.`);
  }
}
