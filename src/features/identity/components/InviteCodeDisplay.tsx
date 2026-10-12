/**
 * Invite Code Display Component
 *
 * Displays the user's unique 6-character invite code
 * Only visible on their own identity page
 * Includes copy-to-clipboard functionality
 */

'use client';

import React, { useState, useEffect } from 'react';
import { ensureAuthHeaders } from '@/lib/authHeaders';

interface InviteCodeDisplayProps {
  walletAddress: string;
}

export function InviteCodeDisplay({ walletAddress }: InviteCodeDisplayProps) {
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchInviteCode = async () => {
      if (!walletAddress) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/invite/validate?wallet=${walletAddress}`,
          { headers: await ensureAuthHeaders() },
        );

        if (!response.ok) {
          console.error('Failed to fetch invite code');
          setLoading(false);
          return;
        }

        const data = await response.json();

        if (data.inviteCode) {
          setInviteCode(data.inviteCode);
        }
      } catch (error) {
        console.error('Error fetching invite code:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInviteCode();
  }, [walletAddress]);

  const handleCopy = async () => {
    if (!inviteCode) return;

    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy invite code:', error);
    }
  };

  if (loading) {
    return (
      <div
        className="invite-code-container"
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          border: '1px solid #D8D2C8',
          borderRadius: '16px',
          padding: '20px',
          marginTop: '30px',
          marginBottom: '20px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            background: '#C6933F',
            color: '#FFFFFF',
            padding: '8px 16px',
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '13px',
            letterSpacing: '0.02em',
            display: 'inline-block',
          }}
        >
          Loading invitation key...
        </div>
      </div>
    );
  }

  if (!inviteCode) {
    return null; // Don't show anything if no code exists
  }

  return (
    <div
      className="invite-code-container"
      style={{
        background: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid #D8D2C8',
        borderRadius: '16px',
        padding: '24px',
        marginTop: '30px',
        marginBottom: '20px',
        boxShadow: '0 4px 12px rgba(47, 93, 80, 0.08)',
      }}
    >
      {/* Header with Image */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        {/* Image on left */}
        <img
          src="/images/sensemakeraikey.png"
          alt="Invitation Key"
          style={{
            width: '80px',
            height: '80px',
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />

        {/* Text on right */}
        <div
          style={{
            flex: 1,
            textAlign: 'left',
          }}
        >
          <h3
            style={{
              color: '#3A3A3A',
              fontSize: '18px',
              fontWeight: '600',
              margin: '0 0 8px 0',
              letterSpacing: '0.02em',
            }}
          >
            Invitation Key
          </h3>
          <p
            style={{
              color: '#5F5A54',
              fontSize: '13px',
              margin: 0,
              lineHeight: '1.5',
            }}
          >
            Share this key to invite others to join
          </p>
        </div>
      </div>

      {/* Invite Code Display */}
      <div
        style={{
          background: '#F0ECE6',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '12px',
          border: '1px solid #D8D2C8',
        }}
      >
        <div
          style={{
            fontSize: '32px',
            fontWeight: '700',
            letterSpacing: '8px',
            color: '#3A3A3A',
            textAlign: 'center',
            fontFamily: 'monospace',
          }}
        >
          {inviteCode}
        </div>
      </div>

      {/* Copy Button - Primary Action Style */}
      <button
        onClick={handleCopy}
        style={{
          width: '100%',
          background: copied ? '#3F7A5A' : '#2F5D50',
          border: 'none',
          borderRadius: '12px',
          padding: '12px 20px',
          color: '#FFFFFF',
          fontSize: '14px',
          fontWeight: '500',
          letterSpacing: '0.02em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
        onMouseEnter={(e) => {
          if (!copied) {
            e.currentTarget.style.background = '#254A40';
          }
        }}
        onMouseLeave={(e) => {
          if (!copied) {
            e.currentTarget.style.background = '#2F5D50';
          }
        }}
      >
        {copied ? (
          <>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy Code
          </>
        )}
      </button>
    </div>
  );
}
