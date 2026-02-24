'use client';

// src/features/conference/components/HostControls.tsx
//
// Slide-up panel for host/co-host participant management.
// Shows when the user taps the ⚙️ icon in ConferenceRoom.
// Lists active DB participants with action buttons scoped to caller's role.

import React from 'react';
import { Mic, MicOff, UserMinus, ArrowUp, ArrowDown, X, Loader2 } from 'lucide-react';
import { useRoomPermissions } from '../hooks/useRoomPermissions';
import type { ConferenceParticipant, ParticipantRole } from '../types/conference';

interface HostControlsProps {
  roomName: string;
  participants: ConferenceParticipant[];
  callerWallet: string;
  callerRole: ParticipantRole;
  onClose: () => void;
  onEndMeeting: () => void;
}

const ROLE_LABEL: Record<ParticipantRole, string> = {
  host: 'Host', co_host: 'Co-host', speaker: 'Speaker', attendee: 'Attendee',
};

export const HostControls: React.FC<HostControlsProps> = ({
  roomName,
  participants,
  callerWallet,
  callerRole,
  onClose,
  onEndMeeting,
}) => {
  const {
    isPending,
    muteParticipant,
    promoteToSpeaker,
    demoteToAttendee,
    removeParticipant,
    endMeeting,
    canManage,
  } = useRoomPermissions(roomName);

  const handleEndMeeting = async () => {
    await endMeeting();
    onEndMeeting();
  };

  // Raised-hand queue shown at the top
  const raisedHands = participants
    .filter(p => p.hand_raised && p.wallet_address !== callerWallet)
    .sort((a, b) =>
      new Date(a.hand_raised_at ?? 0).getTime() - new Date(b.hand_raised_at ?? 0).getTime()
    );

  const others = participants.filter(
    p => !p.hand_raised && p.wallet_address !== callerWallet
  );

  const renderParticipant = (p: ConferenceParticipant) => {
    const manageable = canManage(callerRole, p.role);
    const shortAddr = `${p.wallet_address.slice(0, 6)}…${p.wallet_address.slice(-4)}`;

    return (
      <div key={p.id} style={styles.participantRow}>
        <div style={styles.participantInfo}>
          <div style={styles.avatar}>{shortAddr.slice(0, 2).toUpperCase()}</div>
          <div>
            <div style={styles.participantName}>{shortAddr}</div>
            <div style={styles.participantRole}>
              {p.hand_raised && <span style={styles.handBadge}>✋ Raised hand</span>}
              {!p.hand_raised && ROLE_LABEL[p.role]}
            </div>
          </div>
        </div>

        {manageable && (
          <div style={styles.actions}>
            {/* Promote attendee → speaker */}
            {p.role === 'attendee' && (
              <ActionBtn
                icon={<ArrowUp size={14} />}
                label="Promote to speaker"
                onClick={() => promoteToSpeaker(p.wallet_address)}
                disabled={isPending}
                color="rgba(60,160,100,0.8)"
              />
            )}
            {/* Demote speaker → attendee */}
            {p.role === 'speaker' && (
              <ActionBtn
                icon={<ArrowDown size={14} />}
                label="Demote to attendee"
                onClick={() => demoteToAttendee(p.wallet_address)}
                disabled={isPending}
                color="rgba(180,130,40,0.8)"
              />
            )}
            {/* Mute mic */}
            {(p.role === 'speaker' || p.role === 'co_host') && (
              <ActionBtn
                icon={<MicOff size={14} />}
                label="Mute"
                onClick={() => muteParticipant(p.wallet_address)}
                disabled={isPending}
                color="rgba(139,90,58,0.8)"
              />
            )}
            {/* Remove — host only */}
            {callerRole === 'host' && (
              <ActionBtn
                icon={<UserMinus size={14} />}
                label="Remove"
                onClick={() => removeParticipant(p.wallet_address)}
                disabled={isPending}
                color="rgba(139,58,58,0.8)"
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Participants ({participants.length})</span>
        <button onClick={onClose} style={styles.closeBtn} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      {isPending && (
        <div style={styles.pendingBanner}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Applying…</span>
        </div>
      )}

      {/* Raised hands first */}
      {raisedHands.length > 0 && (
        <>
          <div style={styles.sectionLabel}>Raised hands</div>
          {raisedHands.map(renderParticipant)}
          <div style={styles.divider} />
        </>
      )}

      {/* All other participants */}
      <div style={styles.list}>
        {others.map(renderParticipant)}
      </div>

      {/* End meeting — host only */}
      {callerRole === 'host' && (
        <div style={styles.footer}>
          <button onClick={handleEndMeeting} disabled={isPending} style={styles.endBtn}>
            End Meeting for All
          </button>
        </div>
      )}
    </div>
  );
};

// ── Small action icon button ──────────────────────────────────────────────────

const ActionBtn: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
  color: string;
}> = ({ icon, label, onClick, disabled, color }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    style={{
      width: 30, height: 30, borderRadius: 8, border: 'none',
      background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'opacity 0.15s',
    }}
  >
    {icon}
  </button>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    maxHeight: '60%',
    background: 'rgba(13,31,26,0.97)',
    backdropFilter: 'blur(12px)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTop: '1px solid rgba(255,255,255,0.1)',
    display: 'flex', flexDirection: 'column',
    zIndex: 50,
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px 10px',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    flexShrink: 0,
  },
  title: { color: '#fff', fontWeight: 600, fontSize: '0.95rem' },
  closeBtn: {
    background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)',
    cursor: 'pointer', padding: 4, borderRadius: 6,
  },
  pendingBanner: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 16px',
    background: 'rgba(47,93,80,0.3)',
    color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem',
    flexShrink: 0,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem',
    fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '10px 16px 4px',
    flexShrink: 0,
  },
  divider: {
    height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0', flexShrink: 0,
  },
  list: { overflowY: 'auto', flex: 1, paddingBottom: 8 },
  participantRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 16px', gap: 8,
  },
  participantInfo: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  avatar: {
    width: 34, height: 34, borderRadius: '50%',
    background: 'rgba(47,93,80,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
  },
  participantName: {
    color: '#fff', fontSize: '0.82rem', fontWeight: 500,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  participantRole: { color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem' },
  handBadge: { color: 'rgba(255,210,80,0.9)' },
  actions: { display: 'flex', gap: 6, flexShrink: 0 },
  footer: {
    padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
  },
  endBtn: {
    width: '100%', padding: '10px 0',
    background: '#8B3A3A', border: 'none', borderRadius: 10,
    color: '#fff', fontWeight: 600, fontSize: '0.9rem',
    cursor: 'pointer',
  },
};
