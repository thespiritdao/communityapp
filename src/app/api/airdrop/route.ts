// /src/app/api/airdrop/route.ts

import { NextResponse } from "next/server";
import { supabase } from "src/utils/supabaseClient";
import { airdropMembership, checkAirdropStatus } from "src/utils/airdrop";


export async function POST(req: Request) {
  try {
    const { walletAddress } = await req.json();
    console.log(`🔹 Airdrop initiated for ${walletAddress}`);

    if (!walletAddress) {
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    // Check existing membership
    const { data: existingUser, error } = await supabase
      .from("user_profiles")
      .select("membership_status")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (error) {
      console.error("❌ Supabase query error:", error);
      return NextResponse.json({ error: "Database query failed" }, { status: 500 });
    }

    if (existingUser?.membership_status) {
      console.log("✅ User already has membership. Skipping airdrop.");
      return NextResponse.json({ message: "User already has membership" }, { status: 200 });
    }

    // Submit via Gelato Relay
    const { success, taskId, error: airdropError } = await airdropMembership(walletAddress);

    if (!success || !taskId) {
      console.error("❌ Airdrop submission failed:", airdropError);
      return NextResponse.json({ error: "Airdrop submission failed" }, { status: 500 });
    }

    // Store the task information
    const { error: insertError } = await supabase
      .from("relay_tasks")
      .insert({
        wallet_address: walletAddress,
        task_id: taskId,
        status: 'pending'
      });

    if (insertError) {
      console.error("❌ Failed to record task:", insertError);
    }

    return NextResponse.json({ 
      message: "Airdrop submitted", 
      taskId 
    }, { status: 200 });

  } catch (error) {
    console.error("❌ Airdrop API error:", error);
    return NextResponse.json({ error: "Airdrop failed" }, { status: 500 });
  }
}

// Add status check endpoint
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json({ error: "Task ID required" }, { status: 400 });
  }

  try {
    const status = await checkAirdropStatus(taskId);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
  }
}