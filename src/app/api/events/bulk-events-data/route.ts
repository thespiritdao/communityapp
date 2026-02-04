/**
 * API Route: Get Bulk Events Data
 *
 * GET /api/events/bulk-events-data
 *
 * Returns the events from errors2.txt.txt for bulk creation
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const eventsFilePath = path.join(process.cwd(), 'src', 'features', 'pods', 'errors2.txt.txt');
    const eventsRaw = fs.readFileSync(eventsFilePath, 'utf-8');
    const eventsData = JSON.parse(eventsRaw);
    const events = eventsData[0]?.jsonb_pretty ? JSON.parse(eventsData[0].jsonb_pretty) : eventsData;

    // Return ALL events - let the blockchain handle duplicates
    // The EventManager contract will reject events that already exist with "Event exists" error
    return NextResponse.json({
      success: true,
      events: events,
      total: events.length,
    });
  } catch (error: any) {
    console.error('Error reading events:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
