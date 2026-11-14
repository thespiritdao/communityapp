import { appUrl } from '@/config/deployment';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const baseUrl = appUrl();

  return NextResponse.json({
    name: 'Proof of Curiosity',
    description: 'SpiritDAO Proof of Curiosity Membership',
    image: `${baseUrl}/images/members/curioussquare500x.jpg`,
    external_url: `${baseUrl}`,
    attributes: [
      { trait_type: 'Token Type', value: 'Soulbound' },
      { trait_type: 'Membership Tier', value: 'Proof of Curiosity' },
      { trait_type: 'Token ID', value: params.id },
    ],
  });
}
