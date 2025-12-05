// src/features/forum/components/MediaUpload.tsx

'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import {
  uploadFile,
  uploadMultipleFiles,
  isImageFile,
  formatFileSize,
  getFileIcon,
  type MediaAttachment,
} from '../services/MediaUploadService';
import { Button } from '@/components/ui/button';

interface MediaUploadProps {
  threadId?: string;
  postId?: string;
  onUploadComplete?: (attachments: MediaAttachment[]) => void;
  maxFiles?: number;
}

export function MediaUpload({
  threadId,
  postId,
  onUploadComplete,
  maxFiles = 5,
}: MediaUploadProps) {
  const { address } = useAccount();
  const [uploadedCount, setUploadedCount] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length + uploadedCount > maxFiles) {
      setError(`You can only upload up to ${maxFiles} files`);
      return;
    }

    setError(null);

    // Auto-upload files immediately when selected
    if (files.length > 0 && address) {
      setIsUploading(true);
      setUploadProgress('Uploading...');

      try {
        const result = await uploadMultipleFiles(
          files,
          address,
          threadId,
          postId,
        );

        if (result.success && result.attachments) {
          const attachments = result.attachments; // Extract to variable for TypeScript
          setUploadedCount((prev) => prev + attachments.length);
          setUploadProgress(`✅ Uploaded ${attachments.length} files successfully`);
          console.log(
            '[MediaUpload] Auto-upload complete, calling onUploadComplete with attachments:',
            attachments,
          );
          onUploadComplete?.(attachments);

          // Clear success message after 3 seconds
          setTimeout(() => setUploadProgress(''), 3000);
        }

        if (result.errors && result.errors.length > 0) {
          setError(`Some files failed: ${result.errors.join(', ')}`);
        }
      } catch (err) {
        console.error('Error uploading files:', err);
        setError('Failed to upload files');
      } finally {
        setIsUploading(false);
      }
    }
  };


  return (
    <div className="space-y-3">
      {/* File input - now auto-uploads when files are selected */}
      <div className="flex gap-2">
        <input
          type="file"
          id="file-upload"
          multiple
          accept="image/*,.pdf,.txt,.json"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />
        <label htmlFor="file-upload">
          <Button
            type="button"
            variant="outline"
            size="sm"
            asChild
            disabled={isUploading}
          >
            <span className={isUploading ? 'cursor-not-allowed' : 'cursor-pointer'}>
              {isUploading ? '⏳ Uploading...' : '📎 Attach Files'}
            </span>
          </Button>
        </label>
      </div>

      {/* Progress/Error messages */}
      {uploadProgress && (
        <p className="text-sm" style={{ color: '#3F7A5A' }}>
          {uploadProgress}
        </p>
      )}
      {error && (
        <p className="text-sm" style={{ color: '#8B3A3A' }}>
          {error}
        </p>
      )}

      <p className="text-xs text-gray-500">
        {uploadedCount > 0 && (
          <>
            {uploadedCount}/{maxFiles} files uploaded.{' '}
          </>
        )}
        Max {maxFiles} files, 5MB each. Images, PDF, TXT, JSON allowed.
        <br />
        Files are uploaded immediately when selected.
      </p>
    </div>
  );
}

/**
 * Attachment display component
 */
interface AttachmentDisplayProps {
  attachments: MediaAttachment[];
  onDelete?: (attachmentId: string) => void;
  canDelete?: boolean;
}

export function AttachmentDisplay({
  attachments,
  onDelete,
  canDelete = false,
}: AttachmentDisplayProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="space-y-2 mt-3">
      <p className="text-sm font-medium text-gray-700">Attachments:</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {attachments.map((attachment) => (
          <div
            key={attachment.id}
            className="border rounded-lg p-2 relative group"
          >
            {isImageFile(attachment.file_type) ? (
              <a
                href={attachment.public_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={attachment.public_url}
                  alt={attachment.file_name}
                  className="w-full h-24 object-cover rounded"
                />
              </a>
            ) : (
              <a
                href={attachment.public_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center h-24"
              >
                <span className="text-3xl">
                  {getFileIcon(attachment.file_type)}
                </span>
                <p className="text-xs text-center truncate w-full mt-1">
                  {attachment.file_name}
                </p>
              </a>
            )}

            {canDelete && onDelete && (
              <Button
                variant="destructive"
                size="sm"
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onDelete(attachment.id)}
              >
                ✕
              </Button>
            )}

            <p className="text-xs text-gray-500 text-center mt-1">
              {formatFileSize(attachment.file_size_bytes)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
