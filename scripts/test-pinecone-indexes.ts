// scripts/test-pinecone-indexes.ts

/**
 * Test script to verify both Pinecone indexes are accessible
 *
 * Usage: tsx scripts/test-pinecone-indexes.ts
 */

import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testIndexes() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║     Pinecone Index Connection Test            ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  if (!process.env.PINECONE_API_KEY) {
    console.error('❌ ERROR: PINECONE_API_KEY not found in .env file');
    process.exit(1);
  }

  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
  });

  console.log('📋 Listing all available indexes...\n');

  try {
    const indexList = await pinecone.listIndexes();

    if (!indexList.indexes || indexList.indexes.length === 0) {
      console.log('⚠️  No indexes found in this Pinecone account\n');
      return;
    }

    console.log(`Found ${indexList.indexes.length} index(es):\n`);

    for (const index of indexList.indexes) {
      console.log(`📌 Index: ${index.name}`);
      console.log(`   Host: ${index.host}`);
      console.log(`   Dimension: ${index.dimension}`);
      console.log(`   Metric: ${index.metric}`);
      console.log(
        `   Status: ${index.status?.ready ? '✅ Ready' : '⏳ Initializing'}`,
      );
      console.log('');
    }
  } catch (error: any) {
    console.error('❌ ERROR listing indexes:', error.message);
    process.exit(1);
  }

  // Test sensemaker index
  console.log('─────────────────────────────────────────────\n');
  console.log('🔍 Testing sensemaker index (DAO)...\n');

  try {
    const sensemakerIndex = pinecone.index('sensemaker');
    const stats = await sensemakerIndex.describeIndexStats();

    console.log('✅ sensemaker index accessible!');
    console.log(`   Total vectors: ${stats.totalRecordCount}`);
    console.log(`   Dimension: ${stats.dimension}`);

    if (stats.namespaces) {
      console.log(`   Namespaces:`);
      for (const [name, nsStats] of Object.entries(stats.namespaces)) {
        console.log(`      - ${name}: ${nsStats.recordCount} vectors`);
      }
    }
    console.log('');
  } catch (error: any) {
    console.error('❌ ERROR accessing sensemaker index:', error.message);
    console.log('');
  }

  // Test spiritdao-books index
  console.log('─────────────────────────────────────────────\n');
  console.log('🔍 Testing spiritdao-books index (Philosophy)...\n');

  try {
    const booksIndex = pinecone.index('spiritdao-books');
    const stats = await booksIndex.describeIndexStats();

    console.log('✅ spiritdao-books index accessible!');
    console.log(`   Total vectors: ${stats.totalRecordCount}`);
    console.log(`   Dimension: ${stats.dimension}`);

    if (stats.namespaces && Object.keys(stats.namespaces).length > 0) {
      console.log(`   Namespaces:`);
      for (const [name, nsStats] of Object.entries(stats.namespaces)) {
        console.log(`      - ${name}: ${nsStats.recordCount} vectors`);
      }
    } else {
      console.log('   No namespaces (using entire index)');
    }
    console.log('');
  } catch (error: any) {
    console.error('❌ ERROR accessing spiritdao-books index:', error.message);
    console.error('   This index may not exist in your Pinecone account');
    console.error('   Or it may be in a different project/organization');
    console.log('');
  }

  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║              TEST COMPLETE                    ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  console.log('💡 Tips:');
  console.log('   - Both indexes should show "✅ accessible"');
  console.log('   - sensemaker should have a "spiritdao" namespace');
  console.log('   - spiritdao-books should have vectors > 0');
  console.log('   - Both should have dimension: 1536\n');
}

// Run the test
testIndexes().catch((error) => {
  console.error('\n❌ FATAL ERROR:', error.message);
  process.exit(1);
});
