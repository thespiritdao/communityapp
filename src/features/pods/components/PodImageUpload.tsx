'use client';

import type React from 'react';
import { useState, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

interface PodImageUploadProps {
  onImageSelect: (file: File | null) => void;
  onImageUrlChange: (url: string) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

export const PodImageUpload: React.FC<PodImageUploadProps> = ({
  onImageSelect,
  onImageUrlChange,
  disabled = false,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): { isValid: boolean; error?: string } => {
    // Check file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        isValid: false,
        error: 'Invalid file type. Only JPG, JPEG, and PNG files are allowed.',
      };
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: 'File size too large. Maximum size is 2MB.',
      };
    }

    return { isValid: true };
  };

  const handleFileSelect = (file: File) => {
    if (disabled) return;

    setError('');

    // Validate file
    const validation = validateFile(file);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPreviewUrl(result);
      onImageUrlChange(result);
    };
    reader.readAsDataURL(file);

    // Pass file to parent
    onImageSelect(file);
  };

  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    if (!disabled) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragActive(false);

    if (disabled) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleUploadClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const handleRemoveImage = () => {
    if (!disabled) {
      setPreviewUrl('');
      setError('');
      onImageSelect(null);
      onImageUrlChange('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="pod-image">Pod Image</Label>

      <div
        onClick={handleUploadClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
          transition-all duration-200
          ${dragActive ? '' : 'border-gray-300 hover:border-gray-400'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${previewUrl ? 'p-0 border-solid' : ''}
        `}
        style={
          dragActive
            ? { borderColor: '#2F5D50', backgroundColor: '#E8F1EE' }
            : {}
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          onChange={handleFileInputChange}
          disabled={disabled}
          className="hidden"
        />

        {previewUrl ? (
          <div className="relative group">
            <img
              src={previewUrl}
              alt="Pod preview"
              className="w-full h-48 object-cover rounded-lg"
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 rounded-lg flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUploadClick();
                  }}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Change
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage();
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-center">
              <ImageIcon className="h-12 w-12 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">
                {dragActive
                  ? 'Drop image here'
                  : 'Click to upload or drag & drop'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                JPG, JPEG, PNG (max 2MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm" style={{ color: '#8B3A3A' }}>
          {error}
        </p>
      )}

      <p className="text-xs text-gray-500">
        This image will represent your pod. Recommended: Square images
        (400x400px or larger) for best display.
      </p>
    </div>
  );
};
