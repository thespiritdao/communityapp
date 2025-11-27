import { NextRequest, NextResponse } from 'next/server';

const PINATA_API_URL = 'https://api.pinata.cloud';
const PINATA_JWT = process.env.PINATA_JWT;

/**
 * API Route for IPFS operations
 * Handles bounty metadata upload/fetch via Pinata
 */

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 IPFS Route Debug:');
    console.log('  PINATA_JWT exists:', !!PINATA_JWT);
    console.log('  PINATA_JWT preview:', PINATA_JWT ? PINATA_JWT.substring(0, 20) + '...' : 'MISSING');

    if (!PINATA_JWT) {
      console.error('❌ PINATA_JWT is not defined in environment');
      return NextResponse.json(
        { error: 'Pinata JWT not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { action, metadata, ipfsHash } = body;

    switch (action) {
      case 'upload':
        return await uploadMetadata(metadata);
      
      case 'fetch':
        return await fetchMetadata(ipfsHash);
      
      case 'pin':
        return await pinHash(ipfsHash);
      
      case 'unpin':
        return await unpinHash(ipfsHash);
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('IPFS API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error },
      { status: 500 }
    );
  }
}

async function uploadMetadata(metadata: any) {
  try {
    // Detect metadata type (bounty or bid)
    const isBidMetadata = metadata.bidder_address && metadata.bounty_id;
    const isBountyMetadata = metadata.title && metadata.description;

    // Validate metadata based on type
    if (!isBidMetadata && !isBountyMetadata) {
      return NextResponse.json(
        { error: 'Invalid metadata: must be either bounty metadata (title/description) or bid metadata (bidder_address/bounty_id)' },
        { status: 400 }
      );
    }

    // Add metadata enrichment
    const enrichedMetadata = {
      ...metadata,
      version: '1.0',
      created_at: new Date().toISOString(),
      uploaded_via: 'bounty_api'
    };

    // Prepare Pinata metadata with safe string/number values only
    const pinataKeyValues: Record<string, string | number> = isBidMetadata
      ? {
          type: 'bid_metadata',
          bounty_id: String(metadata.bounty_id || 'unknown'),
          bidder: String(metadata.bidder_address || 'unknown'),
          environment: String(process.env.NODE_ENV || 'development')
        }
      : {
          type: 'bounty_metadata',
          category: String(metadata.category || 'uncategorized'),
          creator: String(metadata.creator_address || 'unknown'),
          environment: String(process.env.NODE_ENV || 'development')
        };

    console.log('📦 Pinata keyvalues:', JSON.stringify(pinataKeyValues));

    const response = await fetch(`${PINATA_API_URL}/pinning/pinJSONToIPFS`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pinataContent: enrichedMetadata,
        pinataMetadata: {
          name: isBidMetadata
            ? `bid-${metadata.bounty_id}-${metadata.bidder_address.substring(0, 8)}-${Date.now()}`
            : `bounty-${metadata.title.replace(/\s+/g, '-')}-${Date.now()}`,
          keyvalues: pinataKeyValues
        },
        pinataOptions: {
          cidVersion: 1
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Pinata upload error:');
      console.error('  Status:', response.status);
      console.error('  Error:', errorText);
      console.error('  JWT used:', PINATA_JWT?.substring(0, 20) + '...');

      return NextResponse.json(
        {
          error: 'Failed to upload to Pinata',
          details: errorText,
          status: response.status
        },
        { status: 500 }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      ipfsHash: data.IpfsHash,
      pinSize: data.PinSize,
      timestamp: data.Timestamp,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error },
      { status: 500 }
    );
  }
}

async function fetchMetadata(ipfsHash: string) {
  try {
    if (!ipfsHash) {
      return NextResponse.json(
        { error: 'IPFS hash is required' },
        { status: 400 }
      );
    }

    // Try Pinata gateway first
    let response = await fetch(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    // Fallback to public gateway if Pinata fails
    if (!response.ok) {
      console.log('Pinata gateway failed, trying public gateway...');
      response = await fetch(`https://ipfs.io/ipfs/${ipfsHash}`);
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch from IPFS' },
        { status: 404 }
      );
    }

    const metadata = await response.json();
    
    return NextResponse.json({
      success: true,
      metadata,
      ipfsHash,
      source: response.url.includes('pinata') ? 'pinata' : 'public'
    });
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json(
      { error: 'Fetch failed', details: error },
      { status: 500 }
    );
  }
}

async function pinHash(ipfsHash: string) {
  try {
    if (!ipfsHash) {
      return NextResponse.json(
        { error: 'IPFS hash is required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${PINATA_API_URL}/pinning/pinByHash`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hashToPin: ipfsHash,
        pinataMetadata: {
          name: `bounty-pinned-${Date.now()}`,
          keyvalues: {
            type: 'bounty_metadata',
            action: 'manual_pin'
          }
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: 'Failed to pin hash', details: error },
        { status: 500 }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      pinned: true,
      ipfsHash: data.IpfsHash
    });
  } catch (error) {
    console.error('Pin error:', error);
    return NextResponse.json(
      { error: 'Pin failed', details: error },
      { status: 500 }
    );
  }
}

async function unpinHash(ipfsHash: string) {
  try {
    if (!ipfsHash) {
      return NextResponse.json(
        { error: 'IPFS hash is required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${PINATA_API_URL}/pinning/unpin/${ipfsHash}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`,
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: 'Failed to unpin hash', details: error },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      unpinned: true,
      ipfsHash
    });
  } catch (error) {
    console.error('Unpin error:', error);
    return NextResponse.json(
      { error: 'Unpin failed', details: error },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ipfsHash = searchParams.get('hash');

    if (!ipfsHash) {
      return NextResponse.json(
        { error: 'IPFS hash is required' },
        { status: 400 }
      );
    }

    return await fetchMetadata(ipfsHash);
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      { error: 'Request failed', details: error },
      { status: 500 }
    );
  }
}