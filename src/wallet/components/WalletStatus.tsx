// src/components/WalletStatus.tsx
"use client";

import React, { useEffect } from "react";
import { useAccount } from "wagmi";

export function WalletStatus() {
  const { address, isConnected, isConnecting, isDisconnected } = useAccount();

  useEffect(() => {
    console.log("Wallet status updated:", {
      address,
      isConnected,
      isConnecting,
      isDisconnected,
    });
  }, [address, isConnected, isConnecting, isDisconnected]);

  return (
    <div>
      {address ? (
        <p>Connected: {address}</p>
      ) : (
        <p>No wallet connected.</p>
      )}
    </div>
  );
}
