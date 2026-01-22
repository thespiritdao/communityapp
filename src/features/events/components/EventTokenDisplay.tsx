'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { EventService } from '../lib/supabase';

interface Pod {
  id: string;
  name: string;
  description: string;
  contract_address?: string | null;
  token_type: string;
  hat_id?: string | null;
  is_active: boolean;
  created_at: string;
  pod_image_url?: string;
}

interface EventTokenDisplayProps {
  tokenIds: string[];
  showImages?: boolean;
  compact?: boolean;
  className?: string;
}

export const EventTokenDisplay: React.FC<EventTokenDisplayProps> = ({
  tokenIds,
  showImages = true,
  compact = false,
  className = '',
}) => {
  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPods = async () => {
      try {
        const podsData = await EventService.getPods();
        setPods(podsData);
      } catch (error) {
        console.error('Error fetching pods:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPods();
  }, []);

  const getTokenInfo = (tokenId: string) => {
    const pod = pods.find(
      (p) =>
        p.id === tokenId ||
        p.contract_address === tokenId ||
        p.hat_id === tokenId,
    );

    return {
      name: pod?.name || tokenId,
      description: pod?.description || '',
      imageUrl: pod?.pod_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(pod?.name || 'Pod')}&size=48&background=8FAAA1&color=fff&bold=true`,
    };
  };

  if (!tokenIds || tokenIds.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex flex-wrap gap-2">
        {tokenIds.map((tokenId) => (
          <div
            key={tokenId}
            className={`flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg border animate-pulse ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            <div
              className={`flex-shrink-0 bg-gray-300 rounded-full ${compact ? 'w-4 h-4' : 'w-6 h-6'}`}
            ></div>
            <div className="bg-gray-300 rounded w-16 h-4"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {tokenIds.map((tokenId) => {
        const tokenInfo = getTokenInfo(tokenId);

        return (
          <div
            key={tokenId}
            className={`flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            {showImages && (
              <img
                src={tokenInfo.imageUrl}
                alt={tokenInfo.name}
                className={`rounded-full object-cover ${compact ? 'w-4 h-4' : 'w-6 h-6'}`}
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(tokenInfo.name)}&size=${compact ? 16 : 24}&background=8FAAA1&color=fff&bold=true`;
                }}
              />
            )}
            <span className="font-medium text-gray-700">{tokenInfo.name}</span>
          </div>
        );
      })}
    </div>
  );
};

// Utility function to get token name from ID (with fallback to static data if needed)
export const getTokenName = async (tokenId: string): Promise<string> => {
  try {
    const pods = await EventService.getPods();
    const pod = pods.find(
      (p) =>
        p.id === tokenId ||
        p.contract_address === tokenId ||
        p.hat_id === tokenId,
    );

    return pod?.name || tokenId;
  } catch (error) {
    console.error('Error fetching token name:', error);
    return tokenId;
  }
};

// Utility function to get all token names from IDs
export const getTokenNames = async (tokenIds: string[]): Promise<string[]> => {
  return Promise.all(tokenIds.map(getTokenName));
};
