// scripts/embed-guides.mjs
// Run with: node scripts/embed-guides.mjs

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const GUIDES_DIR = path.join(__dirname, '../src/guides/user');
const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'sensemaker';
const NAMESPACE = 'spiritdao';

// Split markdown into chunks of ~2000 chars
function chunkText(text, chunkSize = 2000) {
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    if ((current + para).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += '\n\n' + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding;
}

async function embedGuides() {
  const index = pinecone.index(INDEX_NAME);
  const files = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.md'));

  console.log('Found ' + files.length + ' guide files to embed in ' + GUIDES_DIR);
  console.log('Target index: ' + INDEX_NAME + ', namespace: ' + NAMESPACE);

  // Clear existing vectors
  console.log('\nClearing existing vectors in ' + NAMESPACE + ' namespace...');
  try {
    await index.namespace(NAMESPACE).deleteAll();
    console.log('Cleared.');
  } catch (err) {
    console.warn('Warning: could not clear namespace (may be empty already):', err.message);
  }

  let totalVectors = 0;

  for (const file of files) {
    const filePath = path.join(GUIDES_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const chunks = chunkText(content);

    console.log('\nEmbedding ' + file + ' (' + chunks.length + ' chunks)...');

    const vectors = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk);
      vectors.push({
        id: file + '-chunk-' + i,
        values: embedding,
        metadata: {
          text: chunk,
          source: file,
          chunkIndex: i,
        },
      });

      // Small delay every 5 chunks to avoid rate limits
      if (i > 0 && i % 5 === 0) await new Promise(r => setTimeout(r, 300));
    }

    // Upsert in batches of 100
    for (let i = 0; i < vectors.length; i += 100) {
      const batch = vectors.slice(i, i + 100);
      await index.namespace(NAMESPACE).upsert(batch);
      totalVectors += batch.length;
    }

    console.log('  Done: ' + file + ' -> ' + vectors.length + ' vectors');
  }

  // Verify
  console.log('\nVerifying...');
  const stats = await index.describeIndexStats();
  const nsStats = stats.namespaces?.[NAMESPACE];
  console.log('Namespace "' + NAMESPACE + '" vector count: ' + (nsStats?.recordCount ?? nsStats?.vectorCount ?? 'unknown'));
  console.log('\nDone! Total vectors upserted: ' + totalVectors);
}

embedGuides().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
