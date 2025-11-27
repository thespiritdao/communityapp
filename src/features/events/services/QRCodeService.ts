import QRCode from 'qrcode';
import { supabase } from '@/utils/supabaseClient';
import { EventService } from '../lib/supabase';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import type { 
  QRCodeData, 
  QRValidationResult, 
  AttendeeExportData,
  EventRegistration,
  EventWithStats,
  UserProfile 
} from '../types/qr-types';

export class QRCodeService {
  private static readonly QR_VERSION = '2.0';
  private static readonly QR_EXPIRY_HOURS = 24; // QR codes expire after 24 hours

  /**
   * Generate enhanced QR code with user profile integration
   */
  static async generateUserQRCode(
    eventId: string,
    registration: EventRegistration,
    userProfile?: UserProfile
  ): Promise<string> {
    try {
      const now = Date.now();
      const expiresAt = now + (this.QR_EXPIRY_HOURS * 60 * 60 * 1000);

      // If no user profile provided, try to fetch it
      let resolvedUserProfile = userProfile;
      if (!resolvedUserProfile) {
        try {
          resolvedUserProfile = await this.getUserProfile(registration.user_address);
        } catch (error) {
          console.warn('Could not fetch user profile for QR generation:', error);
        }
      }

      const qrData: QRCodeData = {
        eventId,
        walletAddress: registration.user_address,
        userId: resolvedUserProfile?.user_id || null, // Use proper user_id from profile
        registrationId: registration.id,
        timestamp: now,
        expiresAt,
        version: this.QR_VERSION
      };

      console.log('🎫 Generating QR code with data:', {
        eventId: qrData.eventId,
        walletAddress: qrData.walletAddress,
        userId: qrData.userId,
        registrationId: qrData.registrationId
      });

      // Add signature for validation (basic implementation)
      qrData.signature = await this.generateSignature(qrData);

      const qrCodeURL = await QRCode.toDataURL(JSON.stringify(qrData), {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });

      return qrCodeURL;
    } catch (error) {
      console.log('Error generating enhanced QR code:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate event check-in QR code for organizers
   */
  static async generateEventQRCode(event: EventWithStats): Promise<string> {
    try {
      const qrData = {
        eventId: event.id,
        eventTitle: event.title,
        checkInUrl: `${window.location.origin}/events/${event.id}/checkin`,
        organizerMode: true,
        timestamp: Date.now(),
        version: this.QR_VERSION
      };
      
      const qrCodeURL = await QRCode.toDataURL(JSON.stringify(qrData), {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'H'
      });
      
      return qrCodeURL;
    } catch (error) {
      console.log('Error generating event QR code:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error('Failed to generate event QR code');
    }
  }

  /**
   * Validate QR code data and check permissions
   */
  static async validateQRCode(
    qrDataString: string,
    eventId: string
  ): Promise<QRValidationResult> {
    try {
      // Safely truncate QR data for logging
      const safeQRString = qrDataString ? qrDataString.substring(0, 100) + '...' : 'undefined';
      console.log('🔄 Validating QR code:', { qrDataString: safeQRString, eventId });
      
      let qrData: QRCodeData;
      try {
        if (!qrDataString || typeof qrDataString !== 'string') {
          throw new Error('QR data is empty or invalid');
        }
        qrData = JSON.parse(qrDataString);
        console.log('📝 Parsed QR data:', {
          eventId: qrData.eventId,
          walletAddress: qrData.walletAddress,
          userId: qrData.userId,
          registrationId: qrData.registrationId,
          hasSignature: !!qrData.signature
        });
      } catch (parseError) {
        console.log('❌ Failed to parse QR data as JSON:', parseError instanceof Error ? parseError.message : 'Parse error');
        return {
          isValid: false,
          error: 'Invalid QR code format - not valid JSON',
          canCheckIn: false,
          hasTokenAccess: false
        };
      }
      
      // Basic validation
      if (!qrData.eventId || !qrData.walletAddress || !qrData.registrationId) {
        console.log('❌ Basic validation failed - missing required fields');
        return {
          isValid: false,
          error: 'Invalid QR code format - missing required fields',
          canCheckIn: false,
          hasTokenAccess: false
        };
      }

      // Check if QR code is for the correct event
      if (qrData.eventId !== eventId) {
        console.log('❌ Event ID mismatch - QR:', qrData.eventId, 'Expected:', eventId);
        return {
          isValid: false,
          error: `QR code is for a different event. Expected: ${eventId}, Got: ${qrData.eventId}`,
          canCheckIn: false,
          hasTokenAccess: false
        };
      }

      // Check expiration
      if (qrData.expiresAt && Date.now() > qrData.expiresAt) {
        return {
          isValid: false,
          error: 'QR code has expired',
          canCheckIn: false,
          hasTokenAccess: false
        };
      }

      // Validate signature
      console.log('🔐 Validating signature...');
      const isSignatureValid = await this.validateSignature(qrData);
      console.log('🔐 Signature validation result:', isSignatureValid);
      
      if (!isSignatureValid) {
        console.log('❌ Signature validation failed for QR code');
        return {
          isValid: false,
          error: 'Invalid QR code signature',
          canCheckIn: false,
          hasTokenAccess: false
        };
      }

      // Get registration details
      const registration = await this.getRegistrationById(qrData.registrationId);
      if (!registration) {
        return {
          isValid: false,
          error: 'Registration not found',
          canCheckIn: false,
          hasTokenAccess: false
        };
      }

      // Get user profile
      const userProfile = await this.getUserProfile(qrData.walletAddress);

      // Check token gating
      const hasTokenAccess = await this.validateTokenAccess(
        qrData.walletAddress,
        eventId
      );

      // Determine if user can check in
      const canCheckIn = registration.registration_status === 'registered' && hasTokenAccess;

      return {
        isValid: true,
        registration,
        userProfile,
        canCheckIn,
        hasTokenAccess
      };

    } catch (error) {
      console.log('Error validating QR code:', error instanceof Error ? error.message : 'Unknown error');
      return {
        isValid: false,
        error: 'Failed to validate QR code',
        canCheckIn: false,
        hasTokenAccess: false
      };
    }
  }

  /**
   * Process check-in from QR code scan
   */
  static async processCheckIn(
    qrDataString: string,
    eventId: string
  ): Promise<CheckInProcessingResult> {
    try {
      // Safe logging to prevent console errors
      console.log('🚀 Starting processCheckIn');
      console.log('📋 Event ID:', eventId || 'undefined');
      console.log('📋 QR Data length:', qrDataString?.length || 0);
      
      if (!qrDataString || !eventId) {
        return {
          success: false,
          message: 'Missing QR data or event ID',
          error: 'Invalid parameters'
        };
      }
      
      const validation = await this.validateQRCode(qrDataString, eventId);
      console.log('🔍 Validation result:', {
        isValid: validation?.isValid || false,
        hasRegistration: !!validation?.registration,
        canCheckIn: validation?.canCheckIn || false
      });
      
      if (!validation.isValid) {
        const errorMsg = validation.error || 'Invalid QR code';
        console.log('❌ QR code validation failed:', errorMsg);
        return {
          success: false,
          message: errorMsg,
          error: errorMsg
        };
      }

      if (!validation.canCheckIn) {
        console.log('❌ User cannot check in - validation failed');
        return {
          success: false,
          message: 'User cannot check in. Please verify registration and token requirements.',
          error: 'Check-in not allowed'
        };
      }

      console.log('✅ Validation passed, attempting check-in for registration:', validation.registration?.id);

      // Perform check-in with safety check
      if (!validation.registration) {
        throw new Error('Registration not found in validation result');
      }
      
      const updatedRegistration = await EventService.checkInUser(validation.registration.id);
      console.log('✅ Check-in successful');

      return {
        success: true,
        registration: updatedRegistration,
        userProfile: validation.userProfile,
        message: `Successfully checked in ${validation.userProfile?.first_name || 'user'}`
      };

    } catch (error) {
      console.log('❌ Error processing check-in:', error instanceof Error ? error.message : 'Unknown error');
      return {
        success: false,
        message: 'Failed to process check-in',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Export attendee list with detailed information
   */
  static async exportAttendeeList(
    eventId: string,
    includeTokenData = true
  ): Promise<AttendeeExportData[]> {
    try {
      const registrations = await EventService.getEventRegistrations(eventId);
      const exportData: AttendeeExportData[] = [];

      for (const registration of registrations) {
        const userProfile = await this.getUserProfile(registration.user_address);
        
        let hasRequiredTokens = true;
        let tokenBalances: Record<string, string> | undefined;

        if (includeTokenData) {
          try {
            const balances = await fetchTokenBalances(registration.user_address);
            hasRequiredTokens = balances.hasEventManagement || balances.hasExecutivePod;
            tokenBalances = {
              hasEventManagement: balances.hasEventManagement.toString(),
              hasExecutivePod: balances.hasExecutivePod.toString()
            };
          } catch (error) {
            console.warn('Failed to fetch token balances for', registration.user_address);
            hasRequiredTokens = false;
          }
        }

        exportData.push({
          registrationId: registration.id,
          walletAddress: registration.user_address,
          firstName: userProfile?.first_name,
          lastName: userProfile?.last_name,
          email: userProfile?.email,
          registrationStatus: registration.registration_status,
          registeredAt: registration.registered_at,
          checkedInAt: registration.checked_in_at,
          completedAt: registration.completed_at,
          hasRequiredTokens,
          tokenBalances
        });
      }

      return exportData;
    } catch (error) {
      console.log('Error exporting attendee list:', error instanceof Error ? error.message : 'Unknown error');
      throw new Error('Failed to export attendee list');
    }
  }

  /**
   * Generate CSV export of attendees
   */
  static generateCSVExport(attendeeData: AttendeeExportData[]): string {
    const headers = [
      'Registration ID',
      'Wallet Address',
      'First Name',
      'Last Name',
      'Email',
      'Registration Status',
      'Registered At',
      'Checked In At',
      'Completed At',
      'Has Required Tokens',
      'Token Balances'
    ];

    const csvRows = [
      headers.join(','),
      ...attendeeData.map(attendee => [
        attendee.registrationId,
        attendee.walletAddress,
        attendee.firstName || '',
        attendee.lastName || '',
        attendee.email || '',
        attendee.registrationStatus,
        attendee.registeredAt,
        attendee.checkedInAt || '',
        attendee.completedAt || '',
        attendee.hasRequiredTokens.toString(),
        JSON.stringify(attendee.tokenBalances || {}).replace(/,/g, ';')
      ].map(field => `"${field}"`).join(','))
    ];

    return csvRows.join('\n');
  }

  // Private helper methods

  private static async generateSignature(qrData: QRCodeData): Promise<string> {
    // Simple signature generation - in production, use proper cryptographic signing
    const payload = `${qrData.eventId}-${qrData.walletAddress}-${qrData.timestamp}`;
    return btoa(payload).substring(0, 16);
  }

  private static async validateSignature(qrData: QRCodeData): Promise<boolean> {
    if (!qrData.signature) {
      console.log('🔐 No signature provided');
      return false;
    }
    
    const expectedSignature = await this.generateSignature(qrData);
    const isValid = qrData.signature === expectedSignature;
    
    console.log('🔐 Signature comparison:', {
      provided: qrData.signature,
      expected: expectedSignature,
      isValid
    });
    
    return isValid;
  }

  private static async getRegistrationById(registrationId: string): Promise<EventRegistration | null> {
    try {
      console.log('🔍 Looking for registration with ID:', registrationId);
      
      // First, let's see what registrations exist in the database
      const { data: allRegistrations } = await supabase
        .from('event_registrations')
        .select('id, user_address, registration_status')
        .limit(10);
      
      console.log('📊 Sample registrations in database:', allRegistrations);
      
      const { data, error } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('id', registrationId)
        .single();

      console.log('📋 Database query result:', { data, error, registrationId });

      if (error) {
        console.log('❌ Error fetching registration:', error?.message || 'Unknown error');
        
        // Try to find by partial ID match as a fallback
        console.log('🔄 Trying partial ID search...');
        const { data: partialMatch } = await supabase
          .from('event_registrations')
          .select('*')
          .ilike('id', `%${registrationId}%`)
          .limit(5);
        
        console.log('🔍 Partial matches found:', partialMatch);
        return null;
      }

      if (data) {
        console.log('✅ Registration found:', data);
      } else {
        console.log('❌ No registration found for ID:', registrationId);
      }

      return data;
    } catch (error) {
      console.log('❌ Error getting registration by ID:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  private static async getUserProfile(walletAddress: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('wallet_address', walletAddress.toLowerCase())
        .single();

      if (error) {
        console.log('Error fetching user profile:', error?.message || 'Unknown error');
        return null;
      }

      return data;
    } catch (error) {
      console.log('Error getting user profile:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  private static async validateTokenAccess(
    walletAddress: string,
    eventId: string
  ): Promise<boolean> {
    try {
      // Get event to check token requirements
      const event = await EventService.getEvent(eventId);
      if (!event) return false;

      // If no token requirements, allow access
      if (!event.required_tokens || event.required_tokens.length === 0) {
        return true;
      }

      // Check user's token balances
      const balances = await fetchTokenBalances(walletAddress);
      
      // Basic implementation - check if user has any required tokens
      // This should be enhanced based on specific token requirements
      return balances.hasEventManagement || balances.hasExecutivePod;

    } catch (error) {
      console.log('Error validating token access:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }
}