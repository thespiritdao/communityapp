// src/utils/marketManagement.ts
"use client";

import { useAccount, usePublicClient } from "wagmi";
import { useState, useEffect } from "react";

const parsedHatsABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [
      { name: "_wearer", type: "address" },
      { name: "_hatId", type: "uint256" }
    ],
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "isWearerOfHat",
    type: "function",
    inputs: [
      { name: "_user", type: "address" },
      { name: "_hatId", type: "uint256" }
    ],
    outputs: [{ name: "isWearer", type: "bool" }],
    stateMutability: "view",
  },
];

export const useMarketManagementAccess = () => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [hasAccess, setHasAccess] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      if (!address || !publicClient) {
        setHasAccess(false);
        return;
      }

      setIsChecking(true);
      try {
        const hatsContract = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
        const marketManagementHatId = process.env.NEXT_PUBLIC_MARKET_MANAGEMENT;
        
        if (!hatsContract) {
          console.error('NEXT_PUBLIC_HATS_CONTRACT not configured');
          setHasAccess(false);
          setIsChecking(false);
          return;
        }

        if (!marketManagementHatId) {
          console.error('NEXT_PUBLIC_MARKET_MANAGEMENT hat ID not configured');
          setHasAccess(false);
          setIsChecking(false);
          return;
        }

        const isWearer = await publicClient.readContract({
          address: hatsContract,
          abi: parsedHatsABI,
          functionName: "isWearerOfHat",
          args: [address as `0x${string}`, marketManagementHatId],
        });

        setHasAccess(Boolean(isWearer));
        
        console.log('Market Management Access Check:', {
          address,
          hatsContract,
          hatId: marketManagementHatId,
          isWearer: Boolean(isWearer),
          hasAccess: Boolean(isWearer)
        });
        
      } catch (error) {
        console.error("Error checking market management access:", error);
        setHasAccess(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkAccess();
  }, [address, publicClient]);

  return { hasAccess, isChecking };
};

export const checkMarketManagementAccess = async (
  address: string,
  publicClient: any
): Promise<boolean> => {
  try {
    const hatsContract = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
    const marketManagementHatId = process.env.NEXT_PUBLIC_MARKET_MANAGEMENT;
    
    if (!hatsContract || !marketManagementHatId || !address || !publicClient) {
      return false;
    }

    const isWearer = await publicClient.readContract({
      address: hatsContract,
      abi: parsedHatsABI,
      functionName: "isWearerOfHat",
      args: [address as `0x${string}`, marketManagementHatId],
    });

    return Boolean(isWearer);
  } catch (error) {
    console.error("Error checking market management access:", error);
    return false;
  }
};