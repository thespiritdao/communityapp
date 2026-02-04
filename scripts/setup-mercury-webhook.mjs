#!/usr/bin/env node

/**
 * Setup Mercury Webhook
 *
 * This script creates a webhook endpoint in Mercury to receive
 * notifications about transactions (donations) hitting your account.
 *
 * Run once during initial setup:
 * node scripts/setup-mercury-webhook.mjs
 */

import 'dotenv/config';
import fetch from 'node-fetch';

const MERCURY_API_KEY = process.env.MERCURY_API_KEY;
const WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercury`
  : 'https://yourapp.vercel.app/api/webhooks/mercury';

async function createMercuryWebhook() {
  console.log('🔧 Setting up Mercury webhook...\n');

  if (!MERCURY_API_KEY) {
    console.error('❌ Error: MERCURY_API_KEY not found in .env');
    console.error('   Please add your Mercury API key to .env file');
    process.exit(1);
  }

  console.log('📡 Webhook URL:', WEBHOOK_URL);
  console.log('🎯 Event Types: transaction.created, transaction.updated\n');

  try {
    // Create webhook
    const response = await fetch('https://api.mercury.com/api/v1/webhooks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MERCURY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        eventTypes: [
          'transaction.created',
          'transaction.updated'
        ],
        // Optional: Filter only incoming transactions (deposits/donations)
        // filterPaths: ['transaction.amount'] // Uncomment to filter by amount
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Failed to create webhook:', error);
      console.error('\nPossible reasons:');
      console.error('  1. Invalid API key');
      console.error('  2. Webhook URL not accessible');
      console.error('  3. Mercury API permissions insufficient');
      process.exit(1);
    }

    const webhook = await response.json();

    console.log('✅ Webhook created successfully!\n');
    console.log('📋 Webhook Details:');
    console.log('   ID:', webhook.id);
    console.log('   URL:', webhook.url);
    console.log('   Status:', webhook.status);
    console.log('   Event Types:', webhook.eventTypes.join(', '));
    console.log('   Created At:', webhook.createdAt);

    if (webhook.secret) {
      console.log('\n🔐 IMPORTANT: Save this webhook secret to your .env file:');
      console.log(`   MERCURY_WEBHOOK_SECRET=${webhook.secret}`);
      console.log('\n⚠️  This secret is only shown once! Copy it now.');
    }

    console.log('\n✅ Next steps:');
    console.log('   1. Add MERCURY_WEBHOOK_SECRET to .env file');
    console.log('   2. Deploy your app to Vercel (webhook must be publicly accessible)');
    console.log('   3. Test with a real donation to your Mercury account');

  } catch (error) {
    console.error('❌ Error setting up webhook:', error.message);
    process.exit(1);
  }
}

// Run the script
createMercuryWebhook();
