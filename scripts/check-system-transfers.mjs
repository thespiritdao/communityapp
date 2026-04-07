import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem';
import { base } from 'viem/chains';

const RPC = 'https://api.developer.coinbase.com/rpc/v1/base/[REDACTED]';
const SYSTEM = '0xd67e460ce56be18b573aB434b3DC962c657D8Bb5';

const client = createPublicClient({ chain: base, transport: http(RPC) });

const current = await client.getBlockNumber();
// Scan last 5000 blocks (~42 mins on Base at ~2s/block) in 100-block chunks
const CHUNK = 100n;
const LOOKBACK = 5000n;
const from = current - LOOKBACK;

console.log(`Scanning blocks ${from} to ${current} for SYSTEM transfers...`);

const TRANSFER_ABI = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

let allLogs = [];
for (let start = from; start < current; start += CHUNK) {
  const end = start + CHUNK - 1n < current ? start + CHUNK - 1n : current;
  try {
    const logs = await client.getLogs({
      address: SYSTEM,
      event: TRANSFER_ABI,
      fromBlock: start,
      toBlock: end,
    });
    allLogs.push(...logs);
  } catch (e) {
    console.warn(`Chunk ${start}-${end} failed: ${e.message}`);
  }
}

if (allLogs.length === 0) {
  console.log('No SYSTEM transfers found in the last 5000 blocks.');
} else {
  console.log(`\nFound ${allLogs.length} transfer(s):\n`);
  for (const log of allLogs) {
    const block = await client.getBlock({ blockNumber: log.blockNumber });
    const time = new Date(Number(block.timestamp) * 1000).toISOString();
    console.log(`tx:     ${log.transactionHash}`);
    console.log(`block:  ${log.blockNumber} (${time})`);
    console.log(`from:   ${log.args.from}`);
    console.log(`to:     ${log.args.to}`);
    console.log(`amount: ${formatUnits(log.args.value, 18)} SYSTEM`);
    console.log('---');
  }
}
