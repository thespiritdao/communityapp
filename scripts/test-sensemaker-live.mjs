// scripts/test-sensemaker-live.mjs
// Tests routing, DAO response, and philosophy response end-to-end
// Run: node scripts/test-sensemaker-live.mjs

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

import Anthropic from '@anthropic-ai/sdk';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SEP = '─'.repeat(60);

// ── 1. ROUTING TEST ──────────────────────────────────────────
console.log('\n' + SEP);
console.log('TEST 1: Routing Classifier');
console.log(SEP);

const CLASSIFIER_SYSTEM = `You are a query classifier for SpiritDAO's Sensemaker AI.
Classify as "spiritdao" or "temporal-naturalism". Respond with ONLY ONE WORD.

spiritdao: DAO ops, pods, governance, app features, wallet, events, bounties, video chat
temporal-naturalism: philosophy, metaphysics, time, Unger, Smolin, Rivers, theology, TN foundations`;

const routeTests = [
  ['How do I join a pod?', 'spiritdao'],
  ['What does Temporal Naturalism say about time?', 'temporal-naturalism'],
  ['What are the Eight Dignities?', 'temporal-naturalism'],
  ['How do I use video conferencing?', 'spiritdao'],
  ['Explain causality in a universe where time is real', 'temporal-naturalism'],
];

let routePass = 0;
for (const [q, expected] of routeTests) {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    temperature: 0,
    system: CLASSIFIER_SYSTEM,
    messages: [{ role: 'user', content: q }],
  });
  const got = msg.content[0].text.trim().toLowerCase();
  const pass = got === expected;
  if (pass) routePass++;
  console.log((pass ? '✓' : '✗') + ' [' + got.padEnd(20) + '] ' + q);
}
console.log('\nRouting: ' + routePass + '/' + routeTests.length + ' correct');

// ── 2. PINECONE RETRIEVAL TEST ────────────────────────────────
console.log('\n' + SEP);
console.log('TEST 2: Pinecone Context Retrieval');
console.log(SEP);

async function getEmbedding(text) {
  const r = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text, dimensions: 1536 });
  return r.data[0].embedding;
}

const index = pinecone.index(process.env.PINECONE_INDEX_NAME || 'sensemaker');

const pineconeTests = [
  ['How do I join a pod?', 'spiritdao'],
  ['video chat conferencing', 'spiritdao'],
];

for (const [q, ns] of pineconeTests) {
  const vec = await getEmbedding(q);
  const results = await index.namespace(ns).query({ vector: vec, topK: 2, includeMetadata: true });
  const sources = results.matches.map(m => m.metadata?.filename + ' (' + (m.score * 100).toFixed(0) + '%)');
  console.log('Query: "' + q + '"');
  console.log('  Top matches: ' + sources.join(', '));
}

// ── 3. DAO RESPONSE TEST ─────────────────────────────────────
console.log('\n' + SEP);
console.log('TEST 3: DAO Response (Claude Haiku)');
console.log(SEP);

const daoMsg = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 300,
  temperature: 0.7,
  system: 'You are Sensemaker, the in-app assistant for SpiritDAO — a Church of Temporal Naturalism. Be helpful and concise.',
  messages: [{ role: 'user', content: 'How do I join a pod in SpiritDAO?' }],
});
console.log('Q: How do I join a pod?');
console.log('A: ' + daoMsg.content[0].text.substring(0, 300) + '...');

// ── 4. PHILOSOPHY RESPONSE TEST ───────────────────────────────
console.log('\n' + SEP);
console.log('TEST 4: Philosophy Response (Claude Sonnet 4.6)');
console.log(SEP);

const tnMsg = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 300,
  temperature: 0.7,
  system: 'You are Sensemaker, a guide grounded in Temporal Naturalism — the philosophy that time is real and the universe is genuinely becoming. Be a warm thinking partner.',
  messages: [{ role: 'user', content: 'What does it mean that the universe is "becoming" rather than just "being"?' }],
});
console.log('Q: What does it mean that the universe is "becoming" rather than just "being"?');
console.log('A: ' + tnMsg.content[0].text.substring(0, 300) + '...');

console.log('\n' + SEP);
console.log('All tests complete.');
console.log(SEP + '\n');
