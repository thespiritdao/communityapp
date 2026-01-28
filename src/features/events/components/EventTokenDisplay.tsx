'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { EventService } from '../lib/supabase';
import { supabase } from '@/lib/supabase';

interface Pod {
  id: string;
  name: string;
  description: string;
  contract_address?: string | null;
  token_type?: string;
  parent_hat_id?: string | null;
  management_hat_id?: string | null;
  membership_hat_id?: string | null;
  is_active: boolean;
  created_at: string;
  pod_image_url?: string;
}

interface PodRole {
  id: string;
  pod_id: string;
  role_name: string;
  role_hat_id: string;
  pods?: {
    name: string;
    pod_image_url?: string;
  };
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
  const [roles, setRoles] = useState<PodRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTokenData = async () => {
      try {
        // Fetch pods
        const podsData = await EventService.getPods();
        setPods(podsData);

        // Fetch pod roles with pod information
        const { data: rolesData, error: rolesError } = await supabase
          .from('pod_role_permissions')
          .select(`
            id,
            pod_id,
            role_name,
            role_hat_id,
            pods (
              name,
              pod_image_url
            )
          `);

        if (!rolesError && rolesData) {
          setRoles(rolesData);
        }
      } catch (error) {
        console.error('Error fetching token data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTokenData();
  }, []);

  const getTokenInfo = (tokenId: string) => {
    // First, try to find a pod by id, contract_address, or any hat_id fields
    const pod = pods.find(
      (p) =>
        p.id === tokenId ||
        p.contract_address === tokenId ||
        p.parent_hat_id === tokenId ||
        p.management_hat_id === tokenId ||
        p.membership_hat_id === tokenId,
    );

    if (pod) {
      return {
        name: pod.name,
        description: pod.description,
        imageUrl: pod.pod_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(pod.name)}&size=48&background=8FAAA1&color=fff&bold=true`,
      };
    }

    // If not found in pods, check pod_role_permissions for role hat IDs
    const role = roles.find((r) => r.role_hat_id === tokenId);

    if (role) {
      const podName = role.pods?.name || 'Pod';
      const displayName = `${podName} - ${role.role_name}`;
      return {
        name: displayName,
        description: `Role: ${role.role_name}`,
        imageUrl: role.pods?.pod_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&size=48&background=8FAAA1&color=fff&bold=true`,
      };
    }

    // Fallback to displaying the token ID (shortened)
    const shortId = tokenId.length > 10 ? `${tokenId.slice(0, 6)}...${tokenId.slice(-4)}` : tokenId;
    return {
      name: shortId,
      description: '',
      imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(shortId)}&size=48&background=8FAAA1&color=fff&bold=true`,
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
    // Check pods first - check all hat_id fields
    const pods = await EventService.getPods();
    const pod = pods.find(
      (p: any) =>
        p.id === tokenId ||
        p.contract_address === tokenId ||
        p.parent_hat_id === tokenId ||
        p.management_hat_id === tokenId ||
        p.membership_hat_id === tokenId,
    );

    if (pod) {
      return pod.name;
    }

    // Check pod_role_permissions for role hat IDs
    const { data: rolesData, error: rolesError } = await supabase
      .from('pod_role_permissions')
      .select(`
        id,
        pod_id,
        role_name,
        role_hat_id,
        pods (
          name
        )
      `)
      .eq('role_hat_id', tokenId)
      .maybeSingle();

    if (!rolesError && rolesData) {
      const podName = rolesData.pods?.name || 'Pod';
      return `${podName} - ${rolesData.role_name}`;
    }

    // Fallback to shortened token ID
    return tokenId.length > 10 ? `${tokenId.slice(0, 6)}...${tokenId.slice(-4)}` : tokenId;
  } catch (error) {
    console.error('Error fetching token name:', error);
    return tokenId;
  }
};

// Utility function to get all token names from IDs
export const getTokenNames = async (tokenIds: string[]): Promise<string[]> => {
  return Promise.all(tokenIds.map(getTokenName));
};
