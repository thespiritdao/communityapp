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
  type MediaAttachment
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
  maxFiles = 5
}: MediaUploadProps) {
  const { address } = useAccount();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length + selectedFiles.length > maxFiles) {
      setError(`You can only upload up to ${maxFiles} files`);
      return;
    }

    setSelectedFiles([...selectedFiles, ...files]);
    setError(null);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!address || selectedFiles.length === 0) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress('Uploading...');

    try {
      const result = await uploadMultipleFiles(
        selectedFiles,
        address,
        threadId,
        postId
      );

      if (result.success && result.attachments) {
        setUploadProgress(`Uploaded ${result.attachments.length} files`);
        console.log('[MediaUpload] Calling onUploadComplete with attachments:', result.attachments);
        onUploadComplete?.(result.attachments);
        setSelectedFiles([]);

        // Clear success message after 2 seconds
        setTimeout(() => setUploadProgress(''), 2000);
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
  };

  return (
    <div className="space-y-3">
      {/* File input */}
      <div className="flex gap-2">
        <input
          type="file"
          id="file-upload"
          multiple
          accept="image/*,.pdf,.txt,.json"
          onChange={handleFileSelect}
          className="hidden"
        />
        <label htmlFor="file-upload">
          <Button
            type="button"
            variant="outline"
            size="sm"
            asChild
          >
            <span className="cursor-pointer">
              📎 Attach Files
            </span>
          </Button>
        </label>

        {selectedFiles.length > 0 && (
          <Button
            type="button"
            size="sm"
            onClick={handleUpload}
            disabled={isUploading || !address}
          >
            {isUploading ? 'Uploading...' : `Upload ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`}
          </Button>
        )}
      </div>

      {/* Selected files preview */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          {selectedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 border rounded-lg"
            >
              <div className="flex items-center gap-2">
                <span>{getFileIcon(file.type)}</span>
                <div>
                  <p className="text-sm font-medium truncate max-w-xs">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeFile(index)}
                disabled={isUploading}
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Progress/Error messages */}
      {uploadProgress && (
        <p className="text-sm" style={{ color: '#3F7A5A' }}>{uploadProgress}</p>
      )}
      {error && (
        <p className="text-sm" style={{ color: '#8B3A3A' }}>{error}</p>
      )}

      <p className="text-xs text-gray-500">
        Max {maxFiles} files, 5MB each. Images, PDF, TXT, JSON allowed.
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
  canDelete = false
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
                <span className="text-3xl">{getFileIcon(attachment.file_type)}</span>
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
