import { NextRequest, NextResponse } from 'next/server';
import { GoogleDriveService } from '@/services/googleDriveService';

/**
 * Initiate Google OAuth flow
 */
export async function GET(request: NextRequest) {
  try {
    const authUrl = GoogleDriveService.getAuthUrl();
    return NextResponse.json({ authUrl });
  } catch (error: any) {
    console.error('Google auth error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
