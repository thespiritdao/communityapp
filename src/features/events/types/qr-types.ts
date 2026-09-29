// Enhanced QR Code Types for Event Check-In System

import type { EventRegistration, EventWithStats } from './event';

export interface QRCodeData {
  eventId: string;
  walletAddress: string;
  userId: string | null; // Allow null for cases where user profile isn't found
  registrationId: string;
  timestamp: number;
  expiresAt: number;
  signature?: string; // Legacy (v2, forgeable) — no longer accepted
  token?: string; // v3: server-signed, verified by /api/events/[id]/qr/verify
  version: string; // For backward compatibility
}

export interface QRValidationResult {
  isValid: boolean;
  registration?: EventRegistration;
  userProfile?: UserProfile;
  error?: string;
  canCheckIn: boolean;
  hasTokenAccess: boolean;
}

export interface AttendeeExportData {
  registrationId: string;
  walletAddress: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  registrationStatus: string;
  registeredAt: string;
  checkedInAt?: string;
  completedAt?: string;
  hasRequiredTokens: boolean;
  tokenBalances?: Record<string, string>;
}

export interface QRScanResult {
  success: boolean;
  data?: QRCodeData;
  error?: string;
}

export interface CheckInProcessingResult {
  success: boolean;
  registration?: EventRegistration;
  userProfile?: UserProfile;
  message: string;
  error?: string;
}

// User profile type based on existing structure
export interface UserProfile {
  user_id: string; // Add user_id field that exists in the database
  wallet_address: string;
  first_name?: string;
  last_name?: string;
  profile_picture?: string;
  email?: string;
  phone?: string;
  bio?: string;
  occupation?: string;
  linkedin?: string;
  twitter?: string;
  instagram?: string;
  discord?: string;
  github?: string;
}

// Re-export imported types
export type { EventRegistration, EventWithStats };
