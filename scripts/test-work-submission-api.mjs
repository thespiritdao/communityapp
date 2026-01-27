import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const APPROVED_BID = {
  bountyId: '48e83e39-ea07-4451-b174-75ee4a355367',
  bidId: '795c5f0f-fcb4-4679-bfc6-efdd9cdf8834',
  submitterAddress: '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48'
};

console.log('🧪 Testing work submission API...\n');
console.log('Bounty ID:', APPROVED_BID.bountyId);
console.log('Bid ID:', APPROVED_BID.bidId);
console.log('Submitter:', APPROVED_BID.submitterAddress);
console.log('');

const payload = {
  bountyId: APPROVED_BID.bountyId,
  bidId: APPROVED_BID.bidId,
  submitterAddress: APPROVED_BID.submitterAddress,
  submissionTitle: 'API Test Submission',
  submissionDescription: 'Testing the API endpoint directly',
  deliverableUrls: [{ label: 'Test', url: 'https://example.com' }],
  attachmentUrls: [],
  completedDeliverables: ['Test deliverable']
};

console.log('📤 Sending POST request to /api/bounty/work/submit...\n');

try {
  const response = await fetch('http://localhost:3000/api/bounty/work/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  console.log('📥 Response status:', response.status, response.statusText);
  console.log('');

  const data = await response.json();
  console.log('📄 Response body:', JSON.stringify(data, null, 2));

  if (!response.ok) {
    console.log('');
    console.log('❌ Request failed');
  } else {
    console.log('');
    console.log('✅ Request succeeded');
  }

} catch (error) {
  console.error('❌ Error:', error.message);
}
