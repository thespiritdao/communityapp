import React from 'react';
import { cn } from '../../styles/theme'; // If you still need this
import type { UserProfile } from '@/identity/types'; 
// ^ Adjust import path/types as needed

interface SocialsProps {
  user: UserProfile;             // The user object with social fields
  className?: string;
}

const SOCIAL_PLATFORMS = [
  'twitter',
  'tiktok',
  'instagram',
  'facebook',
  'discord',
  'youtube',
  'twitch',
  'github',
  'linkedin',
  'email', // If you store email as a link
];

export function Socials({ user, className }: SocialsProps) {
  // If there's no user or no social fields, return null or handle gracefully
  if (!user) {
    return null;
  }

  return (
    <div className={cn('mt-2 w-full pl-1', className)}>
      <div className="flex space-x-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const value = (user as any)[platform]; 
          // Or define user type more precisely if needed
          
          // If there's no value for that platform, skip it
          if (!value) return null;

          // Build a link; for 'email', you might do mailto: instead
          const href = platform === 'email' ? `mailto:${value}` : value;

          return (
            <a
              key={platform}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={`/images/socialicons/${platform}.png`}
                alt={platform}
                className="social-icon"
              />
            </a>
          );
        })}
      </div>
    </div>
  );
}
