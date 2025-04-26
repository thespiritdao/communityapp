// src/utils/snapshotClient.ts

import snapshot from '@snapshot-labs/snapshot.js';

// Initialize Snapshot Client
const HUB_URL = 'https://hub.snapshot.org'; // default snapshot hub URL

export const snapshotClient = new snapshot.Client712(HUB_URL);
