'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ensureAuthHeaders } from '@/lib/authHeaders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Check, X, Edit3, ChevronDown, ChevronUp } from 'lucide-react';

interface DraftEvent {
  id: string;
  title: string;
  description: string;
  event_date: string;
  event_end_date: string;
  location: string;
  max_attendees: number;
  status: string;
  event_metadata: any;
  created_at: string;
}

interface AgentEventDraftsProps {
  podId: string;
  walletAddress: string;
}

export default function AgentEventDrafts({ podId, walletAddress }: AgentEventDraftsProps) {
  const [drafts, setDrafts] = useState<DraftEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, Partial<DraftEvent>>>({});

  const fetchDrafts = useCallback(async () => {
    try {
      const res = await fetch(`/api/community-agent/events?podId=${podId}&status=draft`);
      const data = await res.json();
      setDrafts(data.events || []);
    } catch (err) {
      console.error('Failed to fetch event drafts:', err);
    } finally {
      setLoading(false);
    }
  }, [podId]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleAction = async (eventId: string, action: 'publish' | 'reject', updates?: Partial<DraftEvent>) => {
    setActionLoading(eventId);
    try {
      const res = await fetch('/api/community-agent/events', {
        method: 'PUT',
        headers: await ensureAuthHeaders(),
        body: JSON.stringify({
          eventId,
          action,
          walletAddress,
          updates: updates || editState[eventId],
        }),
      });

      if (res.ok) {
        setDrafts((prev) => prev.filter((d) => d.id !== eventId));
        setEditState((prev) => {
          const next = { ...prev };
          delete next[eventId];
          return next;
        });
      }
    } catch (err) {
      console.error(`Failed to ${action} event:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEdit = (eventId: string, field: string, value: string | number) => {
    setEditState((prev) => ({
      ...prev,
      [eventId]: { ...prev[eventId], [field]: value },
    }));
  };

  const handleSaveEdits = async (eventId: string) => {
    setActionLoading(eventId);
    try {
      const res = await fetch('/api/community-agent/events', {
        method: 'PUT',
        headers: await ensureAuthHeaders(),
        body: JSON.stringify({
          eventId,
          action: 'edit',
          walletAddress,
          updates: editState[eventId],
        }),
      });

      if (res.ok) {
        await fetchDrafts();
        setEditState((prev) => {
          const next = { ...prev };
          delete next[eventId];
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to save edits:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-[#7C6F5B] py-4 text-center">Loading event drafts...</div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="text-sm text-[#7C6F5B] py-4 text-center">
        No pending event drafts. Drafts appear here after the weekly generation runs.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#7C6F5B]">
        Review AI-generated event drafts. Approve to publish, edit details, or reject.
      </p>

      {drafts.map((event) => {
        const isExpanded = expandedId === event.id;
        const edits = editState[event.id] || {};
        const hasEdits = Object.keys(edits).length > 0;
        const isLoading = actionLoading === event.id;
        const eventDate = new Date(event.event_date);

        return (
          <Card key={event.id} className="border border-[#D1C4A9]/30 bg-[#FAF4EC]/50">
            <CardHeader className="py-3 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-sm font-medium text-[#3C3C3C] truncate">
                    {edits.title ?? event.title}
                  </CardTitle>
                  <div className="flex items-center gap-2 mt-1 text-xs text-[#7C6F5B]">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {eventDate.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      at{' '}
                      {eventDate.toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      Draft
                    </Badge>
                  </div>
                </div>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                  className="p-1 text-[#7C6F5B] hover:text-[#3C3C3C]"
                >
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="px-4 pb-4 pt-0 space-y-3">
                {/* Editable title */}
                <div>
                  <label className="text-xs font-medium text-[#7C6F5B]">Title</label>
                  <input
                    type="text"
                    value={edits.title ?? event.title}
                    onChange={(e) => handleEdit(event.id, 'title', e.target.value)}
                    className="w-full mt-1 px-2 py-1.5 text-sm border border-[#D1C4A9]/50 rounded bg-white text-[#3C3C3C]"
                  />
                </div>

                {/* Editable description */}
                <div>
                  <label className="text-xs font-medium text-[#7C6F5B]">Description</label>
                  <textarea
                    value={edits.description ?? event.description}
                    onChange={(e) => handleEdit(event.id, 'description', e.target.value)}
                    rows={5}
                    className="w-full mt-1 px-2 py-1.5 text-sm border border-[#D1C4A9]/50 rounded bg-white text-[#3C3C3C] resize-y"
                  />
                </div>

                {/* Editable location */}
                <div>
                  <label className="text-xs font-medium text-[#7C6F5B]">Location</label>
                  <input
                    type="text"
                    value={edits.location ?? event.location}
                    onChange={(e) => handleEdit(event.id, 'location', e.target.value)}
                    className="w-full mt-1 px-2 py-1.5 text-sm border border-[#D1C4A9]/50 rounded bg-white text-[#3C3C3C]"
                  />
                </div>

                {/* Date/time row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-[#7C6F5B]">Start</label>
                    <input
                      type="datetime-local"
                      value={toLocalDatetimeInput(edits.event_date ?? event.event_date)}
                      onChange={(e) => handleEdit(event.id, 'event_date', new Date(e.target.value).toISOString())}
                      className="w-full mt-1 px-2 py-1.5 text-xs border border-[#D1C4A9]/50 rounded bg-white text-[#3C3C3C]"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#7C6F5B]">End</label>
                    <input
                      type="datetime-local"
                      value={toLocalDatetimeInput(edits.event_end_date ?? event.event_end_date)}
                      onChange={(e) => handleEdit(event.id, 'event_end_date', new Date(e.target.value).toISOString())}
                      className="w-full mt-1 px-2 py-1.5 text-xs border border-[#D1C4A9]/50 rounded bg-white text-[#3C3C3C]"
                    />
                  </div>
                </div>

                {/* Agent metadata */}
                {event.event_metadata?.agent_name && (
                  <p className="text-[10px] text-[#A39171]">
                    Generated by {event.event_metadata.agent_name}
                  </p>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-[#D1C4A9]/20">
                  {hasEdits && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSaveEdits(event.id)}
                      disabled={isLoading}
                      className="text-xs"
                    >
                      <Edit3 className="w-3 h-3 mr-1" />
                      Save Edits
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleAction(event.id, 'publish', edits)}
                    disabled={isLoading}
                    className="text-xs bg-[#2D5A3D] hover:bg-[#244A32] text-white"
                  >
                    <Check className="w-3 h-3 mr-1" />
                    {hasEdits ? 'Approve & Publish' : 'Publish'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAction(event.id, 'reject')}
                    disabled={isLoading}
                    className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Reject
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function toLocalDatetimeInput(isoString: string): string {
  const d = new Date(isoString);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}
