// src/features/forum/services/MediaUploadService.ts

import { supabase } from '@/utils/supabaseClient';

/**
 * Forum Media Upload Service
 *
 * Handles image and file uploads to Supabase storage
 * with attachment tracking in the database
 */

export interface MediaAttachment {
  id: string;
  post_id?: string;
  thread_id?: string;
  file_name: string;
  public_url: string;
  file_type: string;
  file_size_bytes: number;
  storage_path: string;
  uploader_address: string;
  is_embedded?: boolean;
  created_at: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];
const ALLOWED_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
  'text/plain',
  'application/json',
];

// ============================================================================
// FILE VALIDATION
// ============================================================================

/**
 * Validate file before upload
 */
function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds 5MB limit (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
    };
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File type not allowed: ${file.type}`,
    };
  }

  return { valid: true };
}

/**
 * Check if file is an image
 */
export function isImageFile(fileType: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(fileType);
}

// ============================================================================
// FILE UPLOAD
// ============================================================================

/**
 * Upload file to Supabase storage
 */
export async function uploadFile(
  file: File,
  uploaderAddress: string,
  threadId?: string,
  postId?: string,
): Promise<{
  success: boolean;
  attachment?: MediaAttachment;
  error?: string;
}> {
  try {
    console.log('=== UPLOAD FILE START ===');
    console.log('Uploader address:', uploaderAddress);
    console.log('Thread ID:', threadId);
    console.log('Post ID:', postId);

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      console.error('File validation failed:', validation.error);
      return { success: false, error: validation.error };
    }
    console.log('File validation passed');

    // Generate unique file name
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const fileExtension = file.name.split('.').pop();
    const fileName = `${timestamp}-${randomString}.${fileExtension}`;

    // Determine folder based on whether it's for a thread or post
    // RLS policy expects: threads/{id}/ or posts/{id}/
    let folder: string;
    if (threadId && !postId) {
      folder = `threads/${threadId}`;
    } else if (postId) {
      folder = `posts/${postId}`;
    } else {
      folder = `drafts/${uploaderAddress.toLowerCase()}`;
    }

    const filePath = `${folder}/${fileName}`;

    // Upload to Supabase storage
    console.log('Attempting storage upload with params:', {
      bucket: 'forum-media',
      filePath,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      uploaderAddress: uploaderAddress.toLowerCase(),
    });

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('forum-media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ STORAGE UPLOAD ERROR:', {
        error: uploadError,
        message: uploadError.message,
        statusCode: uploadError.statusCode,
        name: uploadError.name,
      });
      throw uploadError;
    }

    console.log('✅ File uploaded successfully to storage:', uploadData);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('forum-media')
      .getPublicUrl(filePath);

    // Save attachment record to database
    const attachmentRecord = {
      post_id: postId,
      thread_id: threadId,
      file_name: file.name,
      public_url: urlData.publicUrl,
      storage_path: filePath,
      file_type: file.type,
      file_size_bytes: file.size,
      uploader_address: uploaderAddress.toLowerCase(),
      is_embedded: false,
    };

    console.log('Saving attachment record to database:', attachmentRecord);

    const { data: attachmentData, error: dbError } = await supabase
      .from('forum_media_attachments')
      .insert(attachmentRecord)
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      throw dbError;
    }

    console.log('Attachment record saved:', attachmentData);

    return {
      success: true,
      attachment: attachmentData as MediaAttachment,
    };
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Upload multiple files
 */
export async function uploadMultipleFiles(
  files: File[],
  uploaderAddress: string,
  threadId?: string,
  postId?: string,
): Promise<{
  success: boolean;
  attachments?: MediaAttachment[];
  errors?: string[];
}> {
  const results = await Promise.all(
    files.map((file) => uploadFile(file, uploaderAddress, threadId, postId)),
  );

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  return {
    success: successful.length > 0,
    attachments: successful.map((r) => r.attachment!),
    errors: failed.map((r) => r.error!),
  };
}

// ============================================================================
// FILE RETRIEVAL
// ============================================================================

/**
 * Get attachments for a post
 */
export async function getPostAttachments(postId: string): Promise<{
  success: boolean;
  attachments?: MediaAttachment[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('forum_media_attachments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return {
      success: true,
      attachments: (data || []) as MediaAttachment[],
    };
  } catch (error: any) {
    console.error('Error fetching attachments:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get attachments for a thread
 */
export async function getThreadAttachments(threadId: string): Promise<{
  success: boolean;
  attachments?: MediaAttachment[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('forum_media_attachments')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return {
      success: true,
      attachments: (data || []) as MediaAttachment[],
    };
  } catch (error: any) {
    console.error('Error fetching attachments:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// FILE DELETION
// ============================================================================

/**
 * Delete an attachment
 */
export async function deleteAttachment(
  attachmentId: string,
  userAddress: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get attachment info
    const { data: attachment, error: fetchError } = await supabase
      .from('forum_media_attachments')
      .select('*')
      .eq('id', attachmentId)
      .single();

    if (fetchError) throw fetchError;

    // Check if user owns the attachment
    if (attachment.uploaded_by !== userAddress.toLowerCase()) {
      return {
        success: false,
        error: 'You can only delete your own attachments',
      };
    }

    // Extract file path from URL
    const url = new URL(attachment.file_url);
    const pathParts = url.pathname.split('/');
    const filePath = pathParts.slice(-2).join('/'); // address/filename

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('forum-media')
      .remove([filePath]);

    if (storageError) throw storageError;

    // Delete from database
    const { error: dbError } = await supabase
      .from('forum_media_attachments')
      .delete()
      .eq('id', attachmentId);

    if (dbError) throw dbError;

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting attachment:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// IMAGE UTILITIES
// ============================================================================

/**
 * Generate thumbnail URL for images (if Supabase Transform is enabled)
 */
export function getThumbnailUrl(
  imageUrl: string,
  width = 200,
  height = 200,
): string {
  // If using Supabase image transformations (Pro plan)
  // return `${imageUrl}?width=${width}&height=${height}&resize=contain`;

  // Otherwise, return original URL
  return imageUrl;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get file icon based on type
 */
export function getFileIcon(fileType: string): string {
  if (isImageFile(fileType)) return '🖼️';
  if (fileType === 'application/pdf') return '📄';
  if (fileType === 'text/plain') return '📝';
  if (fileType === 'application/json') return '📋';
  return '📎';
}
