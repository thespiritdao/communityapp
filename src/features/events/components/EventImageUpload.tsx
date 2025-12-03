'use client';
import type React from 'react';
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, X, Camera } from 'lucide-react';
import { supabase } from '../../../utils/supabaseClient';

interface EventImageUploadProps {
  currentImageUrl?: string;
  onImageUpload: (url: string) => void;
  eventId: string;
}

export const EventImageUpload: React.FC<EventImageUploadProps> = ({
  currentImageUrl,
  onImageUpload,
  eventId,
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      return 'Please select a JPG or PNG image file.';
    }

    // Check file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      return 'File size must be less than 5MB.';
    }

    return null;
  };

  const uploadImage = async (file: File) => {
    try {
      setUploading(true);
      setError(null);

      // Ensure user session is valid for authenticated operations
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (!sessionData?.session?.user?.id) {
        setError('Authentication required');
        return;
      }

      // Validate file
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${eventId}-${Date.now()}.${fileExt}`;
      const filePath = `event-images/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('event-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data } = supabase.storage
        .from('event-images')
        .getPublicUrl(filePath);

      if (data.publicUrl) {
        onImageUpload(data.publicUrl);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to upload image',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
  };

  const handleRemoveImage = () => {
    onImageUpload('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Image Preview */}
      <div className="flex items-center space-x-4">
        <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-300 flex items-center justify-center">
          {currentImageUrl ? (
            <img
              src={currentImageUrl}
              alt="Event"
              className="w-full h-full object-cover"
            />
          ) : (
            <Camera className="w-8 h-8 text-gray-400" />
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading
                ? 'Uploading...'
                : currentImageUrl
                  ? 'Change Image'
                  : 'Upload Image'}
            </Button>

            {currentImageUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemoveImage}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          <p className="text-sm text-gray-500 mt-1">JPG or PNG, max 5MB.</p>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Error Display */}
      {error && (
        <Card
          style={{ border: '1px solid #E8CBCB', backgroundColor: '#F5E6E6' }}
        >
          <CardContent className="p-3">
            <p className="text-sm" style={{ color: '#8B3A3A' }}>
              {error}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
