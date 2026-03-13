import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.spiritdao.org';

  return NextResponse.json({
    name: 'Advocate',
    description: 'SpiritDAO Advocate Membership',
    image: `${baseUrl}/images/members/advocatesquare500x.jpg`,
    external_url: `${baseUrl}`,
    attributes: [
      { trait_type: 'Token Type', value: 'Soulbound' },
      { trait_type: 'Membership Tier', value: 'Advocate' },
      { trait_type: 'Token ID', value: params.id },
    ],
  });
}
