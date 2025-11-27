import { Address } from 'viem';

// Match the Solidity enum: enum PaymentStructure { Completion, Milestones, Split }
export enum PaymentStructure {
  Completion = 0,
  Milestones = 1,
  Split = 2,
}

// Match the Solidity struct exactly
export interface CreateBountyParams {
  title: string;
  category: string;
  value: bigint; // Use bigint for onchain amounts
  token: Address; // "0x..." string for token address
  paymentStructure: PaymentStructure;
  upfrontAmount: bigint;
  completionAmount: bigint;
}

// Constants for common addresses
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

// Helper type for form data (before conversion to contract params)
export interface BountyFormData {
  title: string;
  category: string;
  value: {
    amount: string; // String input from form
    token: 'SYSTEM' | 'SELF';
  };
  paymentStructure: PaymentStructure;
  upfrontAmount: string; // String input from form
  completionAmount: string; // String input from form
  deadline?: string;
  description?: string;
  requirements?: string[];
  questions?: string[];
  work_requirements?: string[];
  funding_source: {
    type: 'wallet' | 'pod_treasury';
    podId?: string;
  };
  token_gating?: {
    required_tokens: Array<{
      token_id: string;
      token_name: string;
      token_type: 'pod_role';
      minimum_balance: string;
    }>;
    restriction_level: 'public' | 'token_holders';
  };
}

// Helper to convert form data to contract params
export function formDataToContractParams(
  formData: BountyFormData,
  systemTokenAddress: string,
  selfTokenAddress: string
): CreateBountyParams {
  const tokenAddress = formData.value.token === 'SYSTEM' 
    ? systemTokenAddress 
    : selfTokenAddress;

  return {
    title: formData.title,
    category: formData.category,
    value: BigInt(formData.value.amount),
    token: tokenAddress as Address,
    paymentStructure: formData.paymentStructure,
    upfrontAmount: BigInt(formData.upfrontAmount || '0'),
    completionAmount: BigInt(formData.completionAmount || '0'),
  };
}