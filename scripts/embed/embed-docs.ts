// scripts/embed/embed-docs.ts

/**
 * Embedding Script for SpiritDAO Documentation
 *
 * This script:
 * 1. Reads all user guide markdown files
 * 2. Chunks them into manageable pieces
 * 3. Creates embeddings using OpenAI
 * 4. Uploads to Pinecone 'spiritdao' namespace
 *
 * Usage: npm run embed:docs
 */

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const GUIDES_DIR = path.join(__dirname, '..', '..', 'src', 'guides', 'user');
const QUICK_REF = path.join(
  __dirname,
  '..', '..',
  'src',
  'guides',
  'QUICK_REFERENCE.md',
);
const OPS_GUIDE = path.join(
  __dirname,
  '..', '..',
  'src',
  'sensemaker',
  'spiritdao-operations-guide.md',
);

interface DocumentChunk {
  id: string;
  text: string;
  metadata: {
    filename: string;
    section?: string;
    chunkIndex: number;
    totalChunks?: number;
  };
}

/**
 * Split document into chunks by sections
 * Tries to keep sections together when possible
 */
function chunkDocument(
  content: string,
  filename: string,
  maxChars: number = 4000,
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  // Split by major headings (# or ##)
  const sections = content.split(/\n(?=#{1,2}\s)/);

  sections.forEach((section, sectionIdx) => {
    // Extract section title (first line)
    const lines = section.split('\n');
    const sectionTitle =
      lines[0]?.replace(/^#{1,3}\s+/, '').trim() || 'Untitled';

    // If section is small enough, keep it as one chunk
    if (section.length <= maxChars) {
      chunks.push({
        id: `${filename}-section-${sectionIdx}`,
        text: section.trim(),
        metadata: {
          filename,
          section: sectionTitle,
          chunkIndex: 0,
          totalChunks: 1,
        },
      });
    } else {
      // Split large sections into smaller chunks by paragraphs
      let currentChunk = '';
      let chunkIndex = 0;
      const paragraphs = section.split(/\n\n+/);

      for (const para of paragraphs) {
        if (
          (currentChunk + para).length > maxChars &&
          currentChunk.length > 0
        ) {
          // Save current chunk
          chunks.push({
            id: `${filename}-section-${sectionIdx}-chunk-${chunkIndex}`,
            text: currentChunk.trim(),
            metadata: {
              filename,
              section: sectionTitle,
              chunkIndex,
            },
          });
          currentChunk = para + '\n\n';
          chunkIndex++;
        } else {
          currentChunk += para + '\n\n';
        }
      }

      // Save final chunk
      if (currentChunk.trim()) {
        chunks.push({
          id: `${filename}-section-${sectionIdx}-chunk-${chunkIndex}`,
          text: currentChunk.trim(),
          metadata: {
            filename,
            section: sectionTitle,
            chunkIndex,
          },
        });
      }
    }
  });

  return chunks;
}

/**
 * Get embeddings from OpenAI in batches
 */
async function getEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions: 1536,
    });

    return response.data.map((d) => d.embedding);
  } catch (error) {
    console.error('Error getting embeddings:', error);
    throw error;
  }
}

/**
 * Main embedding function
 */
async function embedDocuments() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  SpiritDAO Documentation Embedding Script    ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  // Validate environment variables
  if (!process.env.PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY not found in environment');
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not found in environment');
  }

  const indexName = process.env.PINECONE_INDEX_NAME;
  if (!indexName) throw new Error('Set PINECONE_INDEX_NAME');
  console.log(`📌 Pinecone Index: ${indexName}`);
  console.log(`📁 Guides Directory: ${GUIDES_DIR}\n`);

  // Read all guide files
  console.log('📖 Reading guide files...');
  const guideFiles = fs
    .readdirSync(GUIDES_DIR)
    .filter((f) => f.endsWith('.md'));
  console.log(`   Found ${guideFiles.length} guide files:\n`);
  guideFiles.forEach((f) => console.log(`   - ${f}`));

  const allChunks: DocumentChunk[] = [];

  // Process each guide file
  for (const file of guideFiles) {
    const filePath = path.join(GUIDES_DIR, file);
    console.log(`\n📄 Processing ${file}...`);

    const content = fs.readFileSync(filePath, 'utf-8');
    const chunks = chunkDocument(content, file);

    console.log(`   Created ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }

  // Process quick reference
  if (fs.existsSync(QUICK_REF)) {
    console.log('\n📄 Processing QUICK_REFERENCE.md...');
    const content = fs.readFileSync(QUICK_REF, 'utf-8');
    const chunks = chunkDocument(content, 'QUICK_REFERENCE.md');
    console.log(`   Created ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }

  // Process operations guide
  if (fs.existsSync(OPS_GUIDE)) {
    console.log('\n📄 Processing spiritdao-operations-guide.md...');
    const content = fs.readFileSync(OPS_GUIDE, 'utf-8');
    const chunks = chunkDocument(content, 'spiritdao-operations-guide.md');
    console.log(`   Created ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }

  console.log(`\n📊 Total chunks to embed: ${allChunks.length}`);

  // Get Pinecone index
  console.log('\n🔌 Connecting to Pinecone...');
  const index = pinecone.index(indexName);
  const namespace = index.namespace('spiritdao');

  // Delete existing vectors in namespace (fresh start)
  console.log('🗑️  Clearing existing vectors in spiritdao namespace...');
  try {
    await namespace.deleteAll();
    console.log('   ✅ Namespace cleared');
  } catch (error) {
    console.log('   ⚠️  Could not clear namespace (may not exist yet)');
  }

  // Embed and upload in batches
  const batchSize = 50; // Pinecone limit is 100, we use 50 for safety
  const totalBatches = Math.ceil(allChunks.length / batchSize);

  console.log(`\n🚀 Starting embedding process (${totalBatches} batches)...\n`);

  for (let i = 0; i < allChunks.length; i += batchSize) {
    const batch = allChunks.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    console.log(
      `📦 Batch ${batchNum}/${totalBatches} (${batch.length} chunks)`,
    );

    // Get embeddings for this batch
    console.log('   🧠 Generating embeddings...');
    const texts = batch.map((c) => c.text);
    const embeddings = await getEmbeddings(texts);

    // Prepare vectors for Pinecone
    const vectors = batch.map((chunk, idx) => ({
      id: chunk.id,
      values: embeddings[idx],
      metadata: {
        text: chunk.text,
        filename: chunk.metadata.filename,
        section: chunk.metadata.section || '',
        chunkIndex: chunk.metadata.chunkIndex,
      },
    }));

    // Upsert to Pinecone
    console.log('   ☁️  Uploading to Pinecone...');
    await namespace.upsert(vectors);
    console.log('   ✅ Batch uploaded successfully\n');

    // Small delay to avoid rate limits
    if (i + batchSize < allChunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Verify upload
  console.log('🔍 Verifying upload...');
  const stats = await index.describeIndexStats();
  const spiritdaoStats = stats.namespaces?.['spiritdao'];

  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║              EMBEDDING COMPLETE               ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log(
    `\n📊 Vectors in spiritdao namespace: ${spiritdaoStats?.recordCount || 0}`,
  );
  console.log(`📏 Vector dimensionality: ${stats.dimension}`);
  console.log(`✅ Successfully embedded ${allChunks.length} chunks\n`);

  console.log('🎉 All done! Your SpiritDAO documentation is now searchable.\n');
}

// Run the script
embedDocuments().catch((error) => {
  console.error('\n❌ ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
});
