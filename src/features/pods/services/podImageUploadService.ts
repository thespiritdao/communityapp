// src/features/pods/services/podImageUploadService.ts
import { supabase } from '@/lib/supabase';

export interface PodImageUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

const BUCKET_NAME = 'pod-images';
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

/**
 * Upload pod image to Supabase storage
 */
export const uploadPodImage = async (
  file: File,
  podId: string,
): Promise<PodImageUploadResult> => {
  try {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        success: false,
        error: 'Invalid file type. Only JPG, JPEG, and PNG files are allowed.',
      };
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        success: false,
        error: 'File size too large. Maximum size is 2MB.',
      };
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${podId}_${timestamp}.${extension}`;
    const filePath = `${fileName}`;

    console.log('📸 Uploading pod image:', {
      fileName,
      size: file.size,
      type: file.type,
    });

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        duplex: 'half',
      });

    if (error) {
      console.error('❌ Pod image upload error:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload image',
      };
    }

    // Get the public URL
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    if (!publicUrlData?.publicUrl) {
      return {
        success: false,
        error: 'Failed to get public URL for uploaded image',
      };
    }

    console.log('✅ Pod image uploaded successfully:', publicUrlData.publicUrl);

    return {
      success: true,
      url: publicUrlData.publicUrl,
    };
  } catch (error) {
    console.error('❌ Unexpected pod image upload error:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Unexpected error occurred',
    };
  }
};

/**
 * Delete pod image from Supabase storage
 */
export const deletePodImage = async (imageUrl: string): Promise<boolean> => {
  try {
    // Extract file path from URL
    const url = new URL(imageUrl);
    const pathParts = url.pathname.split('/');
    const bucketIndex = pathParts.findIndex((part) => part === BUCKET_NAME);

    if (bucketIndex === -1 || bucketIndex >= pathParts.length - 1) {
      console.error('Invalid pod image URL format');
      return false;
    }

    const filePath = pathParts.slice(bucketIndex + 1).join('/');

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      console.error('Delete error:', error);
      return false;
    }

    console.log('Pod image deleted successfully:', filePath);
    return true;
  } catch (error) {
    console.error('Unexpected delete error:', error);
    return false;
  }
};
