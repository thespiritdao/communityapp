// src/components/PodProfileDisplay.tsx
'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface PodProfile {
  id: string;
  name: string;
  pod_image_url?: string;
}

interface PodProfileDisplayProps {
  podId: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const PodProfileDisplay: React.FC<PodProfileDisplayProps> = ({
  podId,
  size = 'sm',
  className = '',
}) => {
  const [pod, setPod] = useState<PodProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!podId) {
      setIsLoading(false);
      return;
    }

    const fetchPod = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('pods')
          .select('id, name, pod_image_url')
          .eq('id', podId)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching pod profile:', error);
          setPod(null);
        } else {
          setPod(data);
        }
      } catch (error) {
        console.error('Error fetching pod profile:', error);
        setPod(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPod();
  }, [podId]);

  const getImageUrl = () => {
    if (!pod?.pod_image_url) return '/observableinfinities.png';
    if (pod.pod_image_url.startsWith('http')) return pod.pod_image_url;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/pod_images/${pod.pod_image_url}`;
  };

  const sizeClasses = {
    sm: { image: 'w-6 h-6', text: 'text-sm' },
    md: { image: 'w-8 h-8', text: 'text-base' },
    lg: { image: 'w-10 h-10', text: 'text-lg' },
  }[size];

  if (isLoading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className={`${sizeClasses.image} bg-gray-200 rounded-full animate-pulse`} />
        <div className="h-4 bg-gray-200 rounded animate-pulse w-20" />
      </div>
    );
  }

  if (!pod) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div
          className={`${sizeClasses.image} rounded-full bg-gray-100 flex items-center justify-center`}
          style={{ border: '1px solid #e5e7eb' }}
        >
          <span className="text-gray-400" style={{ fontSize: 10 }}>P</span>
        </div>
        <span className={`${sizeClasses.text} font-medium text-gray-500 truncate`}>
          Unknown Pod
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <img
        src={getImageUrl()}
        alt={pod.name}
        className={`${sizeClasses.image} rounded-full object-cover border border-gray-200`}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = '/observableinfinities.png';
        }}
      />
      <span className={`${sizeClasses.text} font-medium text-gray-900 truncate`}>
        {pod.name}
      </span>
    </div>
  );
};

export default PodProfileDisplay;
