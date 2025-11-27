'use client';

import type React from 'react';
import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Camera } from 'lucide-react';
import { supabase } from '../../../utils/supabaseClient';
import { Label } from '@/components/ui/label';
import { convertIPFStoHTTPS } from '../../../utils/imageService';

interface HatImageUploadProps {
  currentImageUrl?: string;
  onImageUpload: (url: string) => void;
  uploadingImage: boolean;
  setUploadingImage: (uploading: boolean) => void;
  disabled?: boolean;
  hatId?: string;
}

export const HatImageUpload: React.FC<HatImageUploadProps> = ({
  currentImageUrl,
  onImageUpload,
  uploadingImage,
  setUploadingImage,
  disabled = false,
  hatId,
}) => {
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return 'Please select a JPG, PNG, or GIF image file.';
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return 'File size must be less than 5MB.';
    }

    return null;
  };

  const uploadImage = async (file: File) => {
    if (disabled) return;

    try {
      setUploadingImage(true);
      setError(null);

      const validation = validateFile(file);
      if (validation) {
        setError(validation);
        return;
      }

      // Create file path with hatId if available
      const timestamp = Date.now();
      const fileExt = file.name.split('.').pop();
      const fileName = hatId
        ? `hat-${hatId}-${timestamp}.${fileExt}`
        : `hat-image-${timestamp}.${fileExt}`;

      // Upload to Supabase storage (using dedicated hat-images bucket)
      const { data, error: uploadError } = await supabase.storage
        .from('hat-images')
        .upload(`images/${fileName}`, file);

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('hat-images').getPublicUrl(data.path);

      console.log('🎩 HAT image uploaded successfully:', publicUrl);
      onImageUpload(publicUrl);
    } catch (error) {
      console.error('Failed to upload HAT image:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to upload image',
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      uploadImage(file);
    }
  };

  const isIPFSUrl = (url: string) => {
    return url?.startsWith('ipfs://') || url?.includes('ipfs');
  };

  return (
    <div className="space-y-4">
      {/* Current Image Display */}
      {currentImageUrl && (
        <div className="space-y-2">
          <Label className="text-sm text-gray-600">Current Image:</Label>
          <div className="flex items-center space-x-3 p-3 border rounded-lg bg-gray-50">
            <img
              src={
                isIPFSUrl(currentImageUrl)
                  ? convertIPFStoHTTPS(currentImageUrl)
                  : currentImageUrl
              }
              alt="Current HAT"
              className="w-12 h-12 rounded object-cover"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.src = `https://ui-avatars.com/api/?name=HAT&size=48&background=bfe7c6&color=000`;
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 truncate">
                {isIPFSUrl(currentImageUrl) ? (
                  <span style={{ color: '#3F7A5A' }}>
                    IPFS: {currentImageUrl.slice(0, 40)}...
                  </span>
                ) : (
                  currentImageUrl.slice(0, 40) + '...'
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center transition-colors"
            style={
              disabled
                ? {
                    borderColor: '#e5e7eb',
                    backgroundColor: '#f9fafb',
                  }
                : {
                    borderColor: '#d1d5db',
                    cursor: 'pointer',
                  }
            }
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.borderColor = '#2F5D50';
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled) {
                e.currentTarget.style.borderColor = '#d1d5db';
              }
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => !disabled && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              disabled={disabled}
            />

            {uploadingImage ? (
              <div className="space-y-2">
                <div
                  className="animate-spin w-6 h-6 border-2 border-t-transparent rounded-full mx-auto"
                  style={{
                    borderColor: '#2F5D50',
                    borderTopColor: 'transparent',
                  }}
                ></div>
                <p className="text-sm text-gray-600">Uploading image...</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Camera className="w-8 h-8 text-gray-400 mx-auto" />
                <p className="text-sm text-gray-600">
                  {disabled
                    ? 'Image upload disabled'
                    : 'Click to upload or drag & drop'}
                </p>
                <p className="text-xs text-gray-500">JPG, PNG, GIF up to 5MB</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div
          className="p-3 border rounded-lg"
          style={{ backgroundColor: '#F5E6E6', borderColor: '#D9B3B3' }}
        >
          <p className="text-sm" style={{ color: '#8B3A3A' }}>
            {error}
          </p>
        </div>
      )}
    </div>
  );
};
