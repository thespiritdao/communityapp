// src/features/marketplace/components/ImageUpload/ImageUpload.tsx
"use client";

import React, { useState, useRef } from "react";
import { uploadProductImage, validateImageFile } from "../../services/imageUploadService";
import * as S from "./ImageUpload.style";

interface ImageUploadProps {
  onUploadComplete: (imageUrl: string) => void;
  onUploadError: (error: string) => void;
  productTitle?: string;
  currentImageUrl?: string;
  disabled?: boolean;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  onUploadComplete,
  onUploadError,
  productTitle,
  currentImageUrl,
  disabled = false
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string>(currentImageUrl || "");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (disabled) return;

    // Validate file
    const validation = await validateImageFile(file);
    if (!validation.isValid) {
      onUploadError(validation.error || "Invalid file");
      return;
    }
    
    // Show warning if present
    if (validation.warning) {
      console.warn('Image validation warning:', validation.warning);
    }

    // Create preview - use a data URL instead of blob URL to avoid CSP issues
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setPreviewUrl(result);
    };
    reader.readAsDataURL(file);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate progress updates (Supabase doesn't provide real progress)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const result = await uploadProductImage(file, productTitle);

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (result.success && result.url) {
        onUploadComplete(result.url);
        setPreviewUrl(result.url);
      } else {
        onUploadError(result.error || "Upload failed");
        setPreviewUrl(currentImageUrl || "");
      }
    } catch (error) {
      onUploadError(error instanceof Error ? error.message : "Upload failed");
      setPreviewUrl(currentImageUrl || "");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
      setPreviewUrl("");
      onUploadComplete("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <S.Container>
      <S.Label>Product Image</S.Label>
      
      <S.UploadArea
        onClick={handleUploadClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        $dragActive={dragActive}
        $disabled={disabled}
        $hasImage={Boolean(previewUrl)}
      >
        <S.HiddenInput
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          onChange={handleFileInputChange}
          disabled={disabled}
        />

        {previewUrl ? (
          <S.ImagePreviewContainer>
            <S.ImagePreview src={previewUrl} alt="Product preview" />
            {!isUploading && (
              <S.ImageOverlay>
                <S.ChangeImageText>Click to change image</S.ChangeImageText>
                <S.RemoveButton
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveImage();
                  }}
                  type="button"
                >
                  Remove
                </S.RemoveButton>
              </S.ImageOverlay>
            )}
          </S.ImagePreviewContainer>
        ) : (
          <S.UploadContent>
            <S.UploadIcon>📷</S.UploadIcon>
            <S.UploadText>
              {dragActive ? "Drop image here" : "Click to upload or drag & drop"}
            </S.UploadText>
            <S.UploadSubtext>
              JPG, JPEG, PNG (max 5MB)
            </S.UploadSubtext>
          </S.UploadContent>
        )}

        {isUploading && (
          <S.ProgressOverlay>
            <S.ProgressBar>
              <S.ProgressFill $progress={uploadProgress} />
            </S.ProgressBar>
            <S.ProgressText>{uploadProgress}% uploaded</S.ProgressText>
          </S.ProgressOverlay>
        )}
      </S.UploadArea>

      <S.HelpText>
        Requirements: Minimum 400x400px, JPG/PNG only, max 5MB. Images will be automatically resized to 600x600px square format for uniform display.
      </S.HelpText>
    </S.Container>
  );
};

export default ImageUpload;