// scripts/setup-pinecone-index.ts

/**
 * Setup Script for Pinecone Index
 *
 * This script creates the 'sensemaker' index in Pinecone if it doesn't exist.
 * Run this before running the embedding script.
 *
 * Usage: tsx scripts/setup-pinecone-index.ts
 */

import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'sensemaker';
const DIMENSION = 1536; // OpenAI text-embedding-3-small dimension

async function setupPineconeIndex() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║     Pinecone Index Setup Script               ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  // Validate API key
  if (!process.env.PINECONE_API_KEY) {
    console.error('❌ ERROR: PINECONE_API_KEY not found in .env file');
    process.exit(1);
  }

  console.log(`📌 Index Name: ${INDEX_NAME}`);
  console.log(`📏 Dimension: ${DIMENSION}\n`);

  // Initialize Pinecone client
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  try {
    // Check if index already exists
    console.log('🔍 Checking if index exists...');
    const existingIndexes = await pinecone.listIndexes();
    const indexExists = existingIndexes.indexes?.some(
      (index) => index.name === INDEX_NAME,
    );

    if (indexExists) {
      console.log('✅ Index already exists!');
      console.log(`\nYou can now run: npm run embed:spiritdao\n`);
      return;
    }

    // Create the index
    console.log('🔨 Creating new index...');
    console.log('⏳ This may take 1-2 minutes...\n');

    await pinecone.createIndex({
      name: INDEX_NAME,
      dimension: DIMENSION,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
    });

    console.log('✅ Index created successfully!');

    // Wait for index to be ready
    console.log('⏳ Waiting for index to initialize...');

    let ready = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 attempts * 2 seconds = 1 minute max wait

    while (!ready && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

      try {
        const indexDescription = await pinecone.describeIndex(INDEX_NAME);
        if (indexDescription.status?.ready) {
          ready = true;
        } else {
          process.stdout.write('.');
        }
      } catch (error) {
        process.stdout.write('.');
      }

      attempts++;
    }

    console.log('\n');

    if (ready) {
      console.log('✅ Index is ready!');
      console.log('\n╔═══════════════════════════════════════════════╗');
      console.log('║          SETUP COMPLETE                       ║');
      console.log('╚═══════════════════════════════════════════════╝');
      console.log(`\nYou can now run: npm run embed:spiritdao\n`);
    } else {
      console.log('⚠️  Index created but still initializing.');
      console.log(
        '   Wait a minute and try running: npm run embed:spiritdao\n',
      );
    }
  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);

    if (error.message.includes('ALREADY_EXISTS')) {
      console.log(
        '\n✅ Index already exists! You can proceed with embedding.\n',
      );
    } else {
      console.error('\nDetails:', error);
      process.exit(1);
    }
  }
}

// Run the setup
setupPineconeIndex().catch((error) => {
  console.error('\n❌ FATAL ERROR:', error.message);
  process.exit(1);
});
