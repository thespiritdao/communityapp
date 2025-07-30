"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Vote, Bell } from "lucide-react"; // Lucide for icons
import { useNotifications } from "../context/NotificationContext";
import { useGovernanceParticipation } from '../features/governance/hooks/useGovernanceParticipation';
import { useGovernanceNotifications } from '../context/GovernanceNotificationContext';

export default function BottomNav() {
  const pathname = usePathname();
  const { unreadCount: generalUnreadCount } = useNotifications();
  const { hasUnvotedProposals } = useGovernanceParticipation();
  const { unreadCount: governanceUnreadCount } = useGovernanceNotifications();

  // Show badge on vote icon if there are unvoted proposals OR unread governance notifications
  const showVoteBadge = hasUnvotedProposals || governanceUnreadCount > 0;
  
  // Show badge on bell icon for general notifications (mentions, chat, forum activity)
  const showBellBadge = generalUnreadCount > 0;

  // Hide BottomNav on the landing/login gate page (assuming it is at '/')
  if (pathname === "/") return null;

  return (
    <nav className="bottom-nav">
      <Link href="/home" className="bottom-nav-link">
        <Home />
      </Link>
      <Link href="/vote" className="bottom-nav-link relative">
        <Vote />
        {showVoteBadge && (
          <div className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
            {governanceUnreadCount > 0 ? (governanceUnreadCount > 99 ? '99+' : governanceUnreadCount) : '!'}
          </div>
        )}
      </Link>
      <Link href="/notifications" className="bottom-nav-link relative">
        <Bell />
        {showBellBadge && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
            {generalUnreadCount > 99 ? '99+' : generalUnreadCount}
          </div>
        )}
      </Link>
    </nav>
  );
}
