/**
 * Google Drive Service - Load documents from Google Drive for context
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

export class GoogleDriveService {
  private static oauth2Client: OAuth2Client | null = null;

  /**
   * Initialize OAuth2 client
   */
  private static getOAuth2Client(): OAuth2Client {
    if (this.oauth2Client) {
      return this.oauth2Client;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/api/auth/callback/google`
      : 'http://localhost:3000/api/auth/callback/google';

    if (!clientId || !clientSecret) {
      throw new Error('Missing Google OAuth credentials in environment variables');
    }

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    return this.oauth2Client;
  }

  /**
   * Set access token for authenticated requests
   */
  static setAccessToken(accessToken: string, refreshToken?: string) {
    const client = this.getOAuth2Client();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  /**
   * Get authorization URL for OAuth flow
   */
  static getAuthUrl(): string {
    const client = this.getOAuth2Client();
    return client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  static async getTokensFromCode(code: string) {
    const client = this.getOAuth2Client();
    const { tokens } = await client.getToken(code);
    return tokens;
  }

  /**
   * List files in a specific folder
   */
  static async listFilesInFolder(folderId: string, accessToken: string) {
    this.setAccessToken(accessToken);
    const drive = google.drive({ version: 'v3', auth: this.getOAuth2Client() });

    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
    });

    return response.data.files || [];
  }

  /**
   * Get document content as plain text
   */
  static async getDocumentContent(fileId: string, accessToken: string): Promise<string> {
    this.setAccessToken(accessToken);
    const drive = google.drive({ version: 'v3', auth: this.getOAuth2Client() });

    // Get file metadata to check mime type
    const file = await drive.files.get({
      fileId,
      fields: 'name, mimeType',
    });

    const mimeType = file.data.mimeType;

    // Handle Google Docs
    if (mimeType === 'application/vnd.google-apps.document') {
      const response = await drive.files.export({
        fileId,
        mimeType: 'text/plain',
      }, { responseType: 'text' });
      return response.data as string;
    }

    // Handle Google Sheets
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      const response = await drive.files.export({
        fileId,
        mimeType: 'text/csv',
      }, { responseType: 'text' });
      return response.data as string;
    }

    // Handle plain text files
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      const response = await drive.files.get({
        fileId,
        alt: 'media',
      }, { responseType: 'text' });
      return response.data as string;
    }

    // For other types, return metadata
    return `[Document: ${file.data.name} (${mimeType}) - Content not directly readable]`;
  }

  /**
   * Load grant-related documents from Google Drive
   */
  static async loadGrantDocuments(accessToken: string, folderId?: string): Promise<any[]> {
    if (!folderId) {
      // Search for documents with "grant" in the name
      this.setAccessToken(accessToken);
      const drive = google.drive({ version: 'v3', auth: this.getOAuth2Client() });

      const response = await drive.files.list({
        q: "name contains 'grant' and trashed=false and (mimeType='application/vnd.google-apps.document' or mimeType='text/plain')",
        fields: 'files(id, name, mimeType, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 10,
      });

      const files = response.data.files || [];
      const documents = [];

      for (const file of files) {
        try {
          const content = await this.getDocumentContent(file.id!, accessToken);
          documents.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            modifiedTime: file.modifiedTime,
            content: content.substring(0, 5000), // Limit to 5000 chars per doc
          });
        } catch (error) {
          console.error(`Error loading document ${file.name}:`, error);
        }
      }

      return documents;
    }

    // Load from specific folder
    const files = await this.listFilesInFolder(folderId, accessToken);
    const documents = [];

    for (const file of files) {
      if (file.mimeType?.includes('document') || file.mimeType?.includes('text')) {
        try {
          const content = await this.getDocumentContent(file.id!, accessToken);
          documents.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            modifiedTime: file.modifiedTime,
            content: content.substring(0, 5000),
          });
        } catch (error) {
          console.error(`Error loading document ${file.name}:`, error);
        }
      }
    }

    return documents;
  }

  /**
   * Search for documents by keyword
   */
  static async searchDocuments(keyword: string, accessToken: string, limit = 5): Promise<any[]> {
    this.setAccessToken(accessToken);
    const drive = google.drive({ version: 'v3', auth: this.getOAuth2Client() });

    const response = await drive.files.list({
      q: `name contains '${keyword}' and trashed=false and (mimeType='application/vnd.google-apps.document' or mimeType='text/plain')`,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: limit,
    });

    const files = response.data.files || [];
    const documents = [];

    for (const file of files) {
      try {
        const content = await this.getDocumentContent(file.id!, accessToken);
        documents.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
          content: content.substring(0, 3000), // Shorter for search results
        });
      } catch (error) {
        console.error(`Error loading document ${file.name}:`, error);
      }
    }

    return documents;
  }
}
