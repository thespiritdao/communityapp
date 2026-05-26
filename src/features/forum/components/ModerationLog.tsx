// src/features/forum/components/ModerationLog.tsx

'use client';

import { useState, useEffect } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { useModerationPermissions } from '../hooks/useModerationPermissions';
import {
  getModeratorActions,
  getModerationStats,
  type ModerationAction,
} from '../services/ModerationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function ModerationLog() {
  const address = useUserWallet();
  const { canModerate } = useModerationPermissions();
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [stats, setStats] = useState({
    totalActions: 0,
    pendingReports: 0,
    activeMutes: 0,
    actionsToday: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (canModerate && address) {
      loadData();
    }
  }, [canModerate, address]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load moderator's actions
      if (address) {
        const actionsResult = await getModeratorActions(address, 20);
        if (actionsResult.success && actionsResult.actions) {
          setActions(actionsResult.actions);
        }
      }

      // Load stats
      const statsResult = await getModerationStats();
      if (statsResult.success && statsResult.stats) {
        setStats(statsResult.stats);
      }
    } catch (error) {
      console.error('Error loading moderation data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!canModerate) {
    return null;
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading moderation log...</div>;
  }

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'pin':
        return '📌';
      case 'unpin':
        return '📍';
      case 'lock':
        return '🔒';
      case 'unlock':
        return '🔓';
      case 'delete':
        return '🗑️';
      case 'mute':
        return '🔇';
      case 'ban':
        return '🚫';
      case 'feature':
        return '⭐';
      default:
        return '•';
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.totalActions}</div>
            <p className="text-xs text-gray-500">Total Actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.pendingReports}</div>
            <p className="text-xs text-gray-500">Pending Reports</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.activeMutes}</div>
            <p className="text-xs text-gray-500">Active Mutes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.actionsToday}</div>
            <p className="text-xs text-gray-500">Actions Today</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Log */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Actions</CardTitle>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-gray-500">No moderation actions yet</p>
          ) : (
            <div className="space-y-2">
              {actions.map((action) => (
                <div
                  key={action.id}
                  className="border-l-4 border-gray-300 pl-3 py-2 text-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span>{getActionIcon(action.action_type)}</span>
                        <Badge variant="outline">{action.action_type}</Badge>
                        <span className="text-gray-500">
                          {action.target_type}
                        </span>
                      </div>
                      {action.reason && (
                        <p className="text-gray-600 text-xs">
                          Reason: {action.reason}
                        </p>
                      )}
                      <p className="text-xs text-gray-400">
                        {new Date(action.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
