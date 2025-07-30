// src/features/marketplace/components/ImageUpload/ImageUpload.style.ts
import styled from "styled-components";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
`;

export const UploadArea = styled.div<{
  $dragActive: boolean;
  $disabled: boolean;
  $hasImage: boolean;
}>`
  position: relative;
  border: 2px dashed ${props => 
    props.$dragActive ? '#3b82f6' : 
    props.$hasImage ? '#e5e7eb' : '#d1d5db'
  };
  border-radius: 0.5rem;
  padding: ${props => props.$hasImage ? '0' : '2rem'};
  text-align: center;
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
  transition: all 0.2s ease-in-out;
  background-color: ${props => 
    props.$dragActive ? '#eff6ff' : 
    props.$disabled ? '#f9fafb' : '#ffffff'
  };
  min-height: ${props => props.$hasImage ? '200px' : 'auto'};
  overflow: hidden;

  &:hover {
    border-color: ${props => 
      props.$disabled ? '#d1d5db' : 
      props.$hasImage ? '#9ca3af' : '#3b82f6'
    };
    background-color: ${props => 
      props.$disabled ? '#f9fafb' : '#f8fafc'
    };
  }
`;

export const HiddenInput = styled.input`
  display: none;
`;

export const UploadContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
`;

export const UploadIcon = styled.div`
  font-size: 2rem;
  opacity: 0.6;
`;

export const UploadText = styled.p`
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin: 0;
`;

export const UploadSubtext = styled.p`
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0;
`;

export const ImagePreviewContainer = styled.div`
  position: relative;
  width: 100%;
  height: 200px;
  border-radius: 0.375rem;
  overflow: hidden;
`;

export const ImagePreview = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

export const ImageOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;

  ${ImagePreviewContainer}:hover & {
    opacity: 1;
  }
`;

export const ChangeImageText = styled.p`
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
`;

export const RemoveButton = styled.button`
  background-color: rgba(239, 68, 68, 0.8);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: rgba(239, 68, 68, 1);
  }
`;

export const ProgressOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
`;

export const ProgressBar = styled.div`
  width: 80%;
  height: 8px;
  background-color: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
`;

export const ProgressFill = styled.div<{ $progress: number }>`
  height: 100%;
  background-color: #3b82f6;
  width: ${props => props.$progress}%;
  transition: width 0.2s ease-in-out;
`;

export const ProgressText = styled.p`
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin: 0;
`;

export const HelpText = styled.p`
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0;
  line-height: 1.4;
`;