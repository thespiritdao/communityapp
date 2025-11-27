// src/features/pods/services/hatImageUploadService.ts
import { supabase } from "../../../utils/supabaseClient";

export interface HatImageUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

// File validation constants for HAT images
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
const BUCKET_NAME = 'hat-images'; // Use dedicated hat-images bucket for HAT images
const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;
const TARGET_SIZE = 400; // Target size for HAT images (400x400px)

export const validateHatImageFile = async (file: File): Promise<{ isValid: boolean; error?: string; warning?: string }> => {
  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: 'Invalid file type. Only JPG, JPEG, and PNG files are allowed.'
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: 'File size too large. Maximum size is 5MB.'
    };
  }

  // Check image dimensions
  try {
    const dimensions = await getImageDimensions(file);
    
    if (dimensions.width < MIN_WIDTH || dimensions.height < MIN_HEIGHT) {
      return {
        isValid: false,
        error: `Image too small. Minimum dimensions: ${MIN_WIDTH}x${MIN_HEIGHT}px. Current: ${dimensions.width}x${dimensions.height}px.`
      };
    }

    // Check aspect ratio and provide warning if not square
    const aspectRatio = dimensions.width / dimensions.height;
    const isSquare = Math.abs(aspectRatio - 1) < 0.1;
    
    if (!isSquare) {
      return {
        isValid: true,
        warning: `For best display, use square images (1:1 ratio). Current ratio: ${aspectRatio.toFixed(2)}:1. Image will be cropped to square.`
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      error: 'Could not validate image dimensions. Please try a different image.'
    };
  }
};

export const generateHatImageFileName = (originalName: string, hatId: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop()?.toLowerCase() || 'jpg';
  
  // Create a clean filename from HAT ID
  const hatIdShort = hatId.slice(0, 16); // First 16 chars of HAT ID
  const baseName = `hat_${hatIdShort}`;
    
  return `hats/${baseName}_${timestamp}_${random}.${extension}`;
};

export const uploadHatImage = async (
  file: File, 
  hatId: string,
  onProgress?: (progress: number) => void
): Promise<HatImageUploadResult> => {
  try {
    // Validate file
    const validation = await validateHatImageFile(file);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error
      };
    }
    
    // Log warning if present
    if (validation.warning) {
      console.warn('HAT image validation warning:', validation.warning);
    }

    // Process image to uniform format (400x400 square)
    console.log('Processing HAT image to uniform format...');
    const processedFile = await processHatImageToUniformFormat(file);
    console.log(`HAT image processed: ${file.size} bytes → ${processedFile.size} bytes`);

    // Generate unique filename
    const fileName = generateHatImageFileName(processedFile.name, hatId);

    // Upload processed file to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, processedFile, {
        cacheControl: '3600',
        upsert: false,
        duplex: 'half'
      });

    if (error) {
      console.error('HAT image upload error:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload HAT image'
      };
    }

    // Get the public URL for the uploaded file
    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    if (!publicUrlData?.publicUrl) {
      return {
        success: false,
        error: 'Failed to get public URL for uploaded HAT image'
      };
    }

    console.log('HAT image uploaded successfully:', {
      path: fileName,
      url: publicUrlData.publicUrl
    });

    return {
      success: true,
      url: publicUrlData.publicUrl
    };

  } catch (error) {
    console.error('Unexpected HAT image upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error occurred'
    };
  }
};

export const deleteHatImage = async (imageUrl: string): Promise<boolean> => {
  try {
    // Extract file path from URL
    const url = new URL(imageUrl);
    const pathParts = url.pathname.split('/');
    const bucketIndex = pathParts.findIndex(part => part === BUCKET_NAME);
    
    if (bucketIndex === -1 || bucketIndex >= pathParts.length - 1) {
      console.error('Invalid HAT image URL format');
      return false;
    }

    const filePath = pathParts.slice(bucketIndex + 1).join('/');

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      console.error('HAT image delete error:', error);
      return false;
    }

    console.log('HAT image deleted successfully:', filePath);
    return true;

  } catch (error) {
    console.error('Unexpected HAT image delete error:', error);
    return false;
  }
};

// Utility function to get image dimensions using FileReader (CSP-compliant)
export const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image for dimension validation'));
      };
      
      // Use data URL instead of blob URL
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };
    
    reader.readAsDataURL(file);
  });
};

// Function to resize and crop image to uniform square format for HATs
export const processHatImageToUniformFormat = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Create canvas for image processing
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        // Set canvas to target square size
        canvas.width = TARGET_SIZE;
        canvas.height = TARGET_SIZE;
        
        // Calculate dimensions for center cropping to square
        const { width: imgWidth, height: imgHeight } = img;
        const minDimension = Math.min(imgWidth, imgHeight);
        
        // Calculate crop coordinates for center crop
        const cropX = (imgWidth - minDimension) / 2;
        const cropY = (imgHeight - minDimension) / 2;
        
        // Draw the cropped and resized image
        ctx.drawImage(
          img,
          cropX, cropY, minDimension, minDimension, // Source crop area
          0, 0, TARGET_SIZE, TARGET_SIZE // Destination area
        );
        
        // Convert canvas back to file
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to process HAT image'));
              return;
            }
            
            // Create new file with processed image
            const processedFile = new File([blob], file.name, {
              type: 'image/jpeg', // Always output as JPEG for consistency
              lastModified: Date.now()
            });
            
            resolve(processedFile);
          },
          'image/jpeg',
          0.9 // Quality setting
        );
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image for processing'));
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };
    
    reader.readAsDataURL(file);
  });
};