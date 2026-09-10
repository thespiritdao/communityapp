// src/features/places/components/PlaceDetailSheet.tsx
// Detail card for the selected pin: cover, badges, description, links,
// and (for managers) Edit / Remove.

'use client';

import Link from 'next/link';
import { MapPin, Pencil, Trash2, X, ExternalLink, Users, Calendar, BookOpen, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PodPlace, PlaceLink } from '../types';
import { PLACE_KIND_META, PLACE_STATUS_META } from '../types';

interface Props {
  place: PodPlace;
  canManage: boolean;
  onClose: () => void;
  onEdit: (place: PodPlace) => void;
  onDelete: (place: PodPlace) => void;
  onSelectPlace: (placeId: string) => void;
  busy?: boolean;
}

function LinkRow({ link, onSelectPlace }: { link: PlaceLink; onSelectPlace: (id: string) => void }) {
  const title = link.target_title || link.target_id;
  const label = link.label ? <span className="text-gray-500"> · {link.label}</span> : null;
  switch (link.target_type) {
    case 'thread':
      return (
        <Link href={`/forum/thread/${link.target_id}`} className="flex items-center gap-2 text-sm text-blue-700 hover:underline">
          <BookOpen className="h-4 w-4 shrink-0" />
          <span>{title}{label}</span>
          <ExternalLink className="h-3 w-3 opacity-60" />
        </Link>
      );
    case 'event':
      return (
        <Link href={`/events/${link.target_id}`} className="flex items-center gap-2 text-sm text-blue-700 hover:underline">
          <Calendar className="h-4 w-4 shrink-0" />
          <span>{title}{label}</span>
          <ExternalLink className="h-3 w-3 opacity-60" />
        </Link>
      );
    case 'member':
      return (
        <span className="flex items-center gap-2 text-sm text-gray-800">
          <Users className="h-4 w-4 shrink-0" />
          <span>{title}{label}</span>
        </span>
      );
    case 'place':
      return (
        <button
          type="button"
          onClick={() => onSelectPlace(link.target_id)}
          className="flex items-center gap-2 text-sm text-blue-700 hover:underline"
        >
          <MapPin className="h-4 w-4 shrink-0" />
          <span>{title}{label}</span>
        </button>
      );
    default:
      return (
        <span className="flex items-center gap-2 text-sm text-gray-800">
          <Link2 className="h-4 w-4 shrink-0" />
          <span>{title}{label}</span>
        </span>
      );
  }
}

export function PlaceDetailSheet({ place, canManage, onClose, onEdit, onDelete, onSelectPlace, busy }: Props) {
  const kind = PLACE_KIND_META[place.kind];
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      {place.cover_image_url && (
        <img
          src={place.cover_image_url}
          alt={place.title}
          className="w-full h-44 object-cover"
        />
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-lg font-semibold leading-tight break-words">{place.title}</h4>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge style={{ backgroundColor: kind.color, color: '#fff' }}>{kind.label}</Badge>
              <Badge variant={place.status === 'existing' ? 'outline' : 'secondary'}>
                {PLACE_STATUS_META[place.status].label}
              </Badge>
              {place.precision === 'approximate' && (
                <Badge variant="outline" className="text-gray-600">Approximate</Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {place.address && (
          <p className="text-sm text-gray-600 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {place.address}
          </p>
        )}
        {place.lat == null && (
          <p className="text-sm text-amber-700">Not placed on the map yet.</p>
        )}

        {place.description && (
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{place.description}</p>
        )}

        {place.links.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Connected</div>
            {place.links.map((l) => (
              <LinkRow key={`${l.target_type}:${l.target_id}`} link={l} onSelectPlace={onSelectPlace} />
            ))}
          </div>
        )}

        {canManage && (
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => onEdit(place)} disabled={busy}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-700 border-red-200 hover:bg-red-50"
              onClick={() => onDelete(place)}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Remove
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
