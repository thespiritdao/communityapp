/**
 * Type definitions for usePodCredentials hook
 * Separated from hook implementation to avoid SWC parsing conflicts with 'use client'
 */

export interface PodCredential {
  address: string;
  type: 'hat';
  label: string;
  category: 'credential';
  image?: string;
  podId: string;
  isLeader: boolean;
}

export interface UsePodCredentialsReturn {
  credentials: PodCredential[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}
