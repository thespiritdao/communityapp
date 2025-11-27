// src/features/forum/components/MutedUsersList.tsx

'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useModerationPermissions } from '../hooks/useModerationPermissions';
import { supabase } from '@/utils/supabaseClient';
import { muteUser, unmuteUser, type UserMute } from '../services/ModerationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function MutedUsersList() {
  const { address } = useAccount();
  const { canBanUsers } = useModerationPermissions();
  const [mutes, setMutes] = useState<UserMute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // New mute form state
  const [newMuteAddress, setNewMuteAddress] = useState('');
  const [muteType, setMuteType] = useState<'temporary' | 'permanent' | 'shadow'>('temporary');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('7'); // days

  useEffect(() => {
    if (canBanUsers) {
      loadMutes();
    }
  }, [canBanUsers]);

  const loadMutes = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('forum_user_mutes')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMutes((data || []) as UserMute[]);
    } catch (error) {
      console.error('Error loading mutes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMuteUser = async () => {
    if (!address || !newMuteAddress) return;

    try {
      const expiresAt = muteType === 'temporary'
        ? new Date(Date.now() + parseInt(duration) * 24 * 60 * 60 * 1000)
        : undefined;

      const result = await muteUser(
        newMuteAddress,
        address,
        muteType,
        reason || undefined,
        expiresAt
      );

      if (result.success) {
        setIsDialogOpen(false);
        setNewMuteAddress('');
        setReason('');
        setDuration('7');
        loadMutes();
      } else {
        alert(`Failed to mute user: ${result.error}`);
      }
    } catch (error) {
      console.error('Error muting user:', error);
      alert('Failed to mute user');
    }
  };

  const handleUnmute = async (userAddress: string) => {
    if (!address) return;

    if (!confirm(`Unmute ${userAddress}?`)) return;

    try {
      const result = await unmuteUser(userAddress, address);
      if (result.success) {
        loadMutes();
      } else {
        alert(`Failed to unmute user: ${result.error}`);
      }
    } catch (error) {
      console.error('Error unmuting user:', error);
      alert('Failed to unmute user');
    }
  };

  if (!canBanUsers) {
    return null;
  }

  if (isLoading) {
    return <div className="text-center py-8">Loading muted users...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Muted Users ({mutes.length})</CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Mute User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mute User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="address">Wallet Address</Label>
                <Input
                  id="address"
                  placeholder="0x..."
                  value={newMuteAddress}
                  onChange={(e) => setNewMuteAddress(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="muteType">Mute Type</Label>
                <Select value={muteType} onValueChange={(val: any) => setMuteType(val)}>
                  <SelectTrigger id="muteType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="temporary">Temporary</SelectItem>
                    <SelectItem value="permanent">Permanent</SelectItem>
                    <SelectItem value="shadow">Shadow Ban</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {muteType === 'temporary' && (
                <div>
                  <Label htmlFor="duration">Duration (days)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="1"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  placeholder="Reason for muting..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <Button onClick={handleMuteUser} className="w-full">
                Mute User
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {mutes.length === 0 ? (
          <p className="text-gray-500">No muted users</p>
        ) : (
          <div className="space-y-3">
            {mutes.map(mute => (
              <div
                key={mute.id}
                className="border rounded-lg p-3 flex items-start justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <code className="text-sm">
                      {mute.user_address.slice(0, 10)}...{mute.user_address.slice(-8)}
                    </code>
                    <Badge variant={
                      mute.mute_type === 'permanent' ? 'destructive' :
                      mute.mute_type === 'shadow' ? 'outline' : 'default'
                    }>
                      {mute.mute_type}
                    </Badge>
                  </div>
                  {mute.reason && (
                    <p className="text-sm text-gray-600">{mute.reason}</p>
                  )}
                  {mute.expires_at && (
                    <p className="text-xs text-gray-400">
                      Expires: {new Date(mute.expires_at).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    Muted by: {mute.muted_by.slice(0, 10)}...
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUnmute(mute.user_address)}
                >
                  Unmute
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
