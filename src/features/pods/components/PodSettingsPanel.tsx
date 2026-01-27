'use client';

import type React from 'react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { PodImageUpload } from './PodImageUpload';
import { podImageUploadService } from '../services/podImageUploadService';
import { supabase } from '@/utils/supabaseClient';

interface PodSettingsPanelProps {
  podId: string;
  podName: string;
  currentImageUrl?: string;
  canManage: boolean;
}

export const PodSettingsPanel: React.FC<PodSettingsPanelProps> = ({
  podId,
  podName,
  currentImageUrl,
  canManage,
}) => {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>(currentImageUrl || '');
  const [isUploading, setIsUploading] = useState(false);

  const handleImageSelect = (file: File | null) => {
    setSelectedFile(file);
  };

  const handleImageUrlChange = (url: string) => {
    setPreviewUrl(url);
  };

  const handleSaveImage = async () => {
    if (!selectedFile) {
      toast({
        title: 'No Image Selected',
        description: 'Please select an image to upload.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      console.log('🖼️ Uploading pod image...');

      // Upload image using the service
      const imageUrl = await podImageUploadService.uploadPodImage(
        podId,
        selectedFile,
      );

      console.log('✅ Image uploaded:', imageUrl);

      // Update pod in database
      const { error: updateError } = await supabase
        .from('pods')
        .update({
          pod_image_url: imageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', podId);

      if (updateError) {
        throw updateError;
      }

      toast({
        title: 'Image Updated',
        description: 'Pod image has been successfully updated.',
      });

      // Clear selection
      setSelectedFile(null);
      setPreviewUrl(imageUrl);

      // Reload page to show new image everywhere
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      console.error('❌ Failed to upload image:', error);
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload pod image.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    if (!currentImageUrl) return;

    const confirmed = confirm(
      'Are you sure you want to remove the pod image?',
    );
    if (!confirmed) return;

    setIsUploading(true);
    try {
      // Remove from database
      const { error: updateError } = await supabase
        .from('pods')
        .update({
          pod_image_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', podId);

      if (updateError) {
        throw updateError;
      }

      // Try to delete from storage (don't fail if this doesn't work)
      try {
        const fileName = currentImageUrl.split('/').pop();
        if (fileName) {
          await podImageUploadService.deletePodImage(podId, fileName);
        }
      } catch (storageError) {
        console.warn('⚠️ Could not delete from storage:', storageError);
      }

      toast({
        title: 'Image Removed',
        description: 'Pod image has been removed.',
      });

      setPreviewUrl('');

      // Reload page
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      console.error('❌ Failed to remove image:', error);
      toast({
        title: 'Removal Failed',
        description: error.message || 'Failed to remove pod image.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Pod Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            You need pod management permissions to edit pod settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pod Image Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Pod Image
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload or change the image for <strong>{podName}</strong>. This
            image will be displayed on the pod card and throughout the
            application.
          </p>

          {/* Current Image Display */}
          {currentImageUrl && !selectedFile && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Current Image:</p>
              <div className="relative inline-block">
                <img
                  src={currentImageUrl}
                  alt={podName}
                  className="w-48 h-48 object-cover rounded-lg border-2 border-gray-200"
                />
              </div>
            </div>
          )}

          {/* Image Upload Component */}
          <PodImageUpload
            onImageSelect={handleImageSelect}
            onImageUrlChange={handleImageUrlChange}
            disabled={isUploading}
          />

          {/* Action Buttons */}
          <div className="flex gap-2">
            {selectedFile && (
              <Button
                onClick={handleSaveImage}
                disabled={isUploading}
                style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Save Image'
                )}
              </Button>
            )}

            {currentImageUrl && !selectedFile && (
              <Button
                onClick={handleRemoveImage}
                disabled={isUploading}
                variant="destructive"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  'Remove Image'
                )}
              </Button>
            )}
          </div>

          <p className="text-xs text-gray-500">
            Recommended: Square images (400x400px or larger) work best. Maximum
            file size: 2MB.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
