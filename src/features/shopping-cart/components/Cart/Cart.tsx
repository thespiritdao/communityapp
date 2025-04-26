// src/features/shopping-cart/components/Cart/Cart.tsx
"use client";

import React, { useEffect, useState, useCallback } from "react";
import styled from "styled-components";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useRouter } from "next/navigation";
import { parseUnits } from "ethers";
import { Interface } from "ethers/lib/utils";
import { purchaseBurnABI } from "src/utils/purchaseBurnABI";
import { erc20ABI } from "src/utils/erc20ABI";
import useCart from "src/features/shopping-cart/contexts/cart-context/useCart";
import CartProducts from "src/features/shopping-cart/components/cart/cartproducts";
import formatPrice from "src/features/shopping-cart/utils/formatPrice";
import debounce from "lodash.debounce";

// Import the full set of transaction components
import { 
  Transaction, 
  TransactionButton, 
  TransactionSponsor, 
  TransactionStatus, 
  TransactionStatusLabel, 
  TransactionStatusAction 
} from "@coinbase/onchainkit/transaction";
import * as S from "./style";

const TransactionButtonStyled = styled(TransactionButton)`
  background-color: #0070f3 !important;
  color: #fff !important;
  border-radius: 6px !important;
  border: none !important;
  padding: 0.75rem 1.5rem !important;
  font-size: 1rem !important;
  cursor: pointer !important;
  transition: background-color 0.2s ease !important;

  &:hover {
    background-color: #005bb5 !important;
  }
`;

const parsedErc20ABI = [
  {
    name: "allowance",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
];

const approveAbi = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
];

export type Token = {
  address: string;
  chainId: number;
  decimals: number;
  image: string;
  name: string;
  symbol: string;
};

const BASE_CHAIN_ID = 8453;

function formatTokenAmount(amount: number): bigint {
  return parseUnits(amount.toString(), 18);
}

const tokenOptions: Token[] = [
  {
    name: "$SYSTEM",
    address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN as string,
    symbol: "$SYSTEM",
    decimals: 18,
    image: "/images/erc20tokens/SystemToken.png",
    chainId: BASE_CHAIN_ID,
  },
  {
    name: "$SELF",
    address: process.env.NEXT_PUBLIC_SELF_TOKEN as string,
    symbol: "$SELF",
    decimals: 18,
    image: "/images/erc20tokens/SelfToken.png",
    chainId: BASE_CHAIN_ID,
  },
];

export default function Cart({
  tokenBalances,
}: {
  tokenBalances: { systemBalance: string; selfBalance: string };
}) {
  const { products = [], total, isOpen, closeCart } = useCart();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const router = useRouter();

  const [selectedToken, setSelectedToken] = useState<Token>(tokenOptions[0]);
  const [txStep, setTxStep] = useState<"approve" | "purchase">("approve");

  const totalSystemPrice = total?.totalSystemPrice ?? 0;
  const totalSelfPrice = total?.totalSelfPrice ?? 0;

  const systemApprovalAmount = formatTokenAmount(totalSystemPrice);
  const selfApprovalAmount = formatTokenAmount(totalSelfPrice);

  useEffect(() => {
    console.log("Approval Amounts:", {
      system: systemApprovalAmount.toString(),
      self: selfApprovalAmount.toString(),
    });
  }, [systemApprovalAmount, selfApprovalAmount]);

  useEffect(() => {
    const debouncedCheckBalances = debounce(async () => {
      if (!address || !publicClient) return;

      try {
        const systemToken = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
        const selfToken = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;

        const systemBalance = await publicClient.readContract({
          address: systemToken,
          abi: parsedErc20ABI,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        });

        const selfBalance = await publicClient.readContract({
          address: selfToken,
          abi: parsedErc20ABI,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        });

        console.log("Token balances:", {
          system: systemBalance.toString(),
          self: selfBalance.toString(),
          requiredSystem: systemApprovalAmount.toString(),
          requiredSelf: selfApprovalAmount.toString(),
        });
      } catch (error) {
        console.error("Error checking balances:", error);
      }
    }, 5000);

    debouncedCheckBalances();

    return () => {
      debouncedCheckBalances.cancel();
    };
  }, [address, publicClient, systemApprovalAmount, selfApprovalAmount]);

  useEffect(() => {
    async function debugContractState() {
      if (!address || !publicClient) return;
      try {
        const blockNumber = await publicClient.getBlockNumber();
        console.log("Debug:", {
          systemToken: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
          chainId: walletClient?.chain?.id,
          blockNumber,
        });
      } catch (error) {
        console.error("Debug check failed:", error);
      }
    }
    debugContractState();
  }, [address, publicClient, walletClient]);

  // Debug sponsorship config
  useEffect(() => {
    console.log("Transaction sponsorship config:", {
      isPaymasterConfigured: Boolean(process.env.NEXT_PUBLIC_PAYMASTER_AND_BUNDLER_ENDPOINT),
      paymasterEndpoint: process.env.NEXT_PUBLIC_PAYMASTER_AND_BUNDLER_ENDPOINT?.substring(0, 20) + "...",
      isSponsored: true,
      chainId: BASE_CHAIN_ID,
      contracts: {
        system: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
        self: process.env.NEXT_PUBLIC_SELF_TOKEN,
        purchaseBurn: process.env.NEXT_PUBLIC_PURCHASE_BURN,
      },
    });
  }, []);

  const productId = products.map((p) => p.id).join(",");

  // Modified getApproveCall returning an array of call objects
  const getApproveCall = useCallback(() => {
    // pick token and its approval amount
    const isSystem = selectedToken.symbol === '$SYSTEM';
    const tokenAddress = isSystem
      ? (process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`)
      : (process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`);
    const approvalAmount = isSystem ? systemApprovalAmount : selfApprovalAmount;
  
    return [
      {
        address: tokenAddress,
        abi: approveAbi,
        functionName: 'approve',
        args: [
          // spender
          process.env.NEXT_PUBLIC_PURCHASE_BURN as `0x${string}`,
          // amount (bigint)
          approvalAmount,
        ],
      },
    ];
  }, [selectedToken, systemApprovalAmount, selfApprovalAmount]);

  // Modified getPurchaseCall returning an array of call objects
  const getPurchaseCall = useCallback(() => {
    if (selectedToken.symbol === "$SYSTEM") {
      return [
        {
          address: process.env.NEXT_PUBLIC_PURCHASE_BURN as string,
          abi: purchaseBurnABI,
          functionName: "purchaseArtifact",
          args: [systemApprovalAmount, 0n, productId],
        },
      ];
    } else {
      return [
        {
          address: process.env.NEXT_PUBLIC_PURCHASE_BURN as string,
          abi: purchaseBurnABI,
          functionName: "purchaseArtifact",
          args: [0n, selfApprovalAmount, productId],
        },
      ];
    }
  }, [selectedToken, systemApprovalAmount, selfApprovalAmount, productId]);

  return (
    <S.CartOverlay onClick={closeCart}>
      <S.CartContent onClick={(e) => e.stopPropagation()}>
        <S.CartContentHeader>
          <S.HeaderTitle>Artifacts</S.HeaderTitle>
        </S.CartContentHeader>

        <CartProducts products={products} />

        <S.CartFooter>
          <S.Sub>SUBTOTAL</S.Sub>
          <S.SubPrice>
            {selectedToken.symbol === "$SYSTEM"
              ? `$SYSTEM ${formatPrice(totalSystemPrice, "$SYSTEM")}`
              : `$SELF ${formatPrice(totalSelfPrice, "$SELF")}`}
          </S.SubPrice>

          <div style={{ margin: "1rem 0" }}>
            <S.TokenRadioLabel style={{ marginRight: "1rem" }}>
              <input
                type="radio"
                name="tokenSelection"
                value="$SYSTEM"
                checked={selectedToken.symbol === "$SYSTEM"}
                onChange={() => setSelectedToken(tokenOptions[0])}
              />
              <img
                src="/images/erc20tokens/SystemToken.png"
                alt="$SYSTEM"
                style={{
                  width: "24px",
                  height: "24px",
                  verticalAlign: "middle",
                  marginRight: "4px",
                  border: "none",
                }}
              />
              $SYSTEM
            </S.TokenRadioLabel>
            <S.TokenRadioLabel>
              <input
                type="radio"
                name="tokenSelection"
                value="$SELF"
                checked={selectedToken.symbol === "$SELF"}
                onChange={() => setSelectedToken(tokenOptions[1])}
              />
              <img
                src="/images/erc20tokens/SelfToken.png"
                alt="$SELF"
                style={{
                  width: "24px",
                  height: "24px",
                  verticalAlign: "middle",
                  marginRight: "4px",
                  border: "none",
                }}
              />
              $SELF
            </S.TokenRadioLabel>
          </div>

          {/* Conditional rendering of the Transaction component based on txStep */}
          {txStep === "approve" ? (
            <Transaction
              isSponsored
              address={address}
              chainId={BASE_CHAIN_ID}
              contracts={getApproveCall()}
              onSuccess={() => setTxStep("purchase")}
              onError={(error) => console.error("Approval error:", error)}
            >
              <TransactionButton
                text="Approve"
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              />
              <TransactionSponsor />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>
          ) : (
            <Transaction
              isSponsored
              address={address}
              chainId={BASE_CHAIN_ID}
              contracts={getPurchaseCall()}
              onSuccess={() => {
                alert("✅ Purchase completed!");
                router.push("/home");
                closeCart();
              }}
              onError={(error) => console.error("Purchase error:", error)}
            >
              <TransactionButton
                text="Purchase"
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              />
              <TransactionSponsor />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>
          )}
        </S.CartFooter>
      </S.CartContent>
    </S.CartOverlay>
  );
}
