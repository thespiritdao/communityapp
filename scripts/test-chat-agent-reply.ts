// scripts/test-chat-agent-reply.ts
// Directly exercises the chat agent mention handler against a real message —
// used to verify the full chain (mention detection → RAG → LLM → scoped-role
// insert) independent of the Vercel lambda lifecycle.
// Run: npx tsx --env-file=.env scripts/test-chat-agent-reply.ts
import { handleChatAgentMention } from '../src/services/communityAgent/chatHandler';

const TN_POD = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';
const TN_CHAT = '62ece31f-7309-4dca-97dc-a618ac4533b1';

(async () => {
  console.log('Invoking handleChatAgentMention against the live message…');
  await handleChatAgentMention({
    content:
      'Welcome @[Kairos (Agent)](0x26e2fc58752b785fb9ab3a315db32bd4f81dd48a) - how does it feel to be a complete agent within the SpiritDAO ecosystem?',
    senderWallet: '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48',
    chatGroupId: TN_CHAT,
    podId: TN_POD,
  });
  console.log('Handler completed without throwing. Check the TN chat.');
})().catch((err) => {
  console.error('Handler FAILED:', err);
  process.exit(1);
});
