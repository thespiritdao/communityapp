<<<<<<< HEAD

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Supabase Integration Documentation</title>
</head>
<body>
    <h1>Supabase Integration Documentation</h1>

    <h2>Overview</h2>
    <p>This documentation outlines our Supabase integration for wallet-based authentication and user management. The system provides a seamless flow between Web3 wallet authentication and Supabase user sessions.</p>

    <h2>Architecture</h2>

    <h3>Key Components</h3>
    <ol>
        <li><strong>Supabase Clients</strong>
            <ul>
                <li><code>supabaseClient.js</code>: Regular client for authenticated user operations</li>
                <li><code>supabaseAdminClient.ts</code>: Admin client for user management operations</li>
            </ul>
        </li>
        <li><strong>Authentication Flow</strong>
            <ul>
                <li>Wallet connection triggers user creation/authentication</li>
                <li>JWT tokens are generated for Supabase session management</li>
                <li>User profiles are automatically synchronized</li>
            </ul>
        </li>
    </ol>

    <h3>Database Schema</h3>
    <pre>
<code>
-- user_profiles table
CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  wallet_address text UNIQUE NOT NULL
  -- other profile fields
);
</code>
    </pre>

    <h3>Authentication Flow Details</h3>
    <h4>Initial Wallet Connection</h4>
    <pre>
<code>
// Triggered when wallet connects
await createSupabaseSession(address);
</code>
    </pre>

    <h4>Token Generation (<code>/api/auth/onchainkit</code>)</h4>
    <ul>
        <li>Validates wallet address</li>
        <li>Creates/finds user in <code>auth.users</code></li>
        <li>Creates/updates <code>user_profiles</code> record</li>
        <li>Generates JWT tokens for Supabase session</li>
    </ul>

    <h4>Session Management</h4>
    <ul>
        <li>Uses Supabase's <code>auth.setSession</code></li>
        <li>Manages token refresh automatically</li>
        <li>Maintains session across page reloads</li>
    </ul>

    <h2>Setup Requirements</h2>

    <h3>Environment Variables</h3>
    <pre>
<code>
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
</code>
    </pre>

    <h3>Database Setup</h3>
    <ol>
        <li>Enable Row Level Security (RLS)</li>
        <li>Configure policies for <code>user_profiles</code> table</li>
        <li>Set up <code>auth</code> schema permissions</li>
    </ol>

    <h2>API Endpoints</h2>

    <h3>POST <code>/api/auth/onchainkit</code></h3>
    <p><strong>Purpose:</strong> Generate Supabase session tokens for wallet address</p>
    <p><strong>Input:</strong> <code>{ address: string }</code></p>
    <p><strong>Output:</strong> <code>{ supabaseToken: string, supabaseRefreshToken: string }</code></p>

    <h2>Usage Examples</h2>

    <h3>Connecting Wallet and Creating Session</h3>
    <pre>
<code>
const { address } = useAccount();

useEffect(() => {
  const initiateSupabaseSession = async () => {
    if (address) {
      try {
        // Get tokens from API
        const response = await fetch('/api/auth/onchainkit', {
          method: 'POST',
          body: JSON.stringify({ address }),
        });
        const { supabaseToken, supabaseRefreshToken } = await response.json();

        // Create Supabase session
        await createSupabaseSession(supabaseToken, supabaseRefreshToken);
      } catch (error) {
        console.error('Session creation failed:', error);
      }
    }
  };

  initiateSupabaseSession();
}, [address]);
</code>
    </pre>

    <h3>Accessing User Data</h3>
    <pre>
<code>
const getUserProfile = async () => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .single();

  if (error) throw error;
  return data;
};
</code>
    </pre>

    <h2>Security Considerations</h2>
    <ul>
        <li><strong>JWT Token Management</strong>
            <ul>
                <li>Tokens are short-lived (30 minutes)</li>
                <li>Refresh tokens handled securely</li>
                <li>No token storage in <code>localStorage</code></li>
            </ul>
        </li>
        <li><strong>Row Level Security</strong>
            <ul>
                <li>Users can only access their own data</li>
                <li>Admin operations restricted to service role</li>
            </ul>
        </li>
        <li><strong>Wallet Address Validation</strong>
            <ul>
                <li>Addresses normalized to lowercase</li>
                <li>Verification before token generation</li>
            </ul>
        </li>
    </ul>

    <h2>Troubleshooting</h2>

    <h3>Common Issues and Solutions</h3>
    <ul>
        <li><strong>Session Not Creating</strong>
            <ul>
                <li>Check environment variables</li>
                <li>Verify wallet connection</li>
                <li>Check browser console for errors</li>
            </ul>
        </li>
        <li><strong>Database Access Issues</strong>
            <ul>
                <li>Verify RLS policies</li>
                <li>Check user authentication status</li>
                <li>Confirm service role permissions</li>
            </ul>
        </li>
        <li><strong>Token Errors</strong>
            <ul>
                <li>Validate JWT secret configuration</li>
                <li>Check token expiration</li>
                <li>Verify token format</li>
            </ul>
        </li>
    </ul>

    <h2>Resources</h2>
    <ul>
        <li><a href="https://supabase.com/docs">Supabase Documentation</a></li>
        <li><a href="https://nextjs.org/docs">Next.js Documentation</a></li>
        <li><a href="https://ethereum.org/en/developers/docs/">Web3 Authentication Best Practices</a></li>
    </ul>



<h2> Token Balance <h2>
Fetch Token Balances Utility
This utility provides a simple function to fetch ERC20 and ERC721 token balances for a given wallet address. It’s built using Web3.js and bn.js to query minimal JSON ABI contracts on an Ethereum-compatible network. It also includes fallback logic so that if any contract address is a known placeholder (or if a call fails) the balance will default to "0".

Overview
ERC20 and ERC721 Support:
The utility defines minimal ABIs for both ERC20 and ERC721 standards. This is enough to call the balanceOf function on each contract.

Environment Variables:
The function relies on several environment variables to determine which contract addresses and RPC endpoint to use:

NEXT_PUBLIC_PROOF_OF_CURIOSITY – Address of the ERC721 “Proof of Curiosity” token.
NEXT_PUBLIC_SYSTEM_TOKEN – Address of the ERC20 “System” token.
NEXT_PUBLIC_SELF_TOKEN – Address of the ERC20 “Self” token.
NEXT_PUBLIC_MARKET_ADMIN – Address of the ERC20 “Market Admin” token.
NEXT_PUBLIC_RPC_URL – The RPC endpoint (e.g., provided by Infura) for your network.
NEXT_PUBLIC_CHAIN_ID – The network chain ID (defaults to 8453 if not provided).
Fallback Logic:
If any of the contract addresses are still placeholders (such as 0x0000000000000000000000000000000000000000 or 0x0000000000000000000000000000000000000001), the function logs a warning and falls back to a balance of "0". Similarly, any errors during the call will be caught and logged, ensuring that the application remains robust even if one of the calls fails.

Balance Conversion:
The raw string balances returned from the contract calls are converted to BigNumber (using bn.js) so that we can easily check if they’re greater than zero. The final returned object provides:

hasProofOfCuriosity: boolean — True if the wallet holds at least 1 Proof of Curiosity token.
hasMarketAdmin: boolean — True if the wallet holds at least 1 Market Admin token.
systemBalance: string — The raw balance (as a string) for the System token.
selfBalance: string — The raw balance (as a string) for the Self token.
Setup
Install Dependencies:
Make sure you have both Web3.js and bn.js installed:

bash
Copy
npm install web3 bn.js
# or
yarn add web3 bn.js
Configure Environment Variables:
Create or update your environment file (e.g., .env.local) with the following values:

env
Copy
NEXT_PUBLIC_PROOF_OF_CURIOSITY=0xYourERC721ContractAddress
NEXT_PUBLIC_SYSTEM_TOKEN=0xYourERC20SystemTokenAddress
NEXT_PUBLIC_SELF_TOKEN=0xYourERC20SelfTokenAddress
NEXT_PUBLIC_MARKET_ADMIN=0xYourERC20MarketAdminAddress
NEXT_PUBLIC_RPC_URL=https://your-rpc-endpoint
NEXT_PUBLIC_CHAIN_ID=8453
Note: Until your contracts are live, you can leave the addresses as placeholders (e.g., 0x0000000000000000000000000000000000000000). The utility will detect these and default balances to zero.

Usage in Code:
Import and use the fetchTokenBalances function in your application:

ts
Copy
import { fetchTokenBalances, TokenBalances } from "src/utils/fetchTokenBalances";

async function checkUserTokens(walletAddress: string): Promise<void> {
  try {
    const balances: TokenBalances = await fetchTokenBalances(walletAddress);
    console.log("Token Balances:", balances);
    // Use balances.hasProofOfCuriosity, balances.systemBalance, etc.
  } catch (error) {
    console.error("Failed to fetch token balances:", error);
  }
}
Code Explanation
Web3 Initialization:

ts
Copy
import Web3 from 'web3';
import BN from 'bn.js';

const provider = new Web3.providers.HttpProvider(RPC_URL, { chainId: NETWORK_CHAIN_ID });
const web3 = new Web3(provider);
This sets up a Web3 provider with the provided RPC URL and chain ID.

Minimal ABIs:
The ABIs include only the necessary method balanceOf required for fetching balances.

Balance Fetching and Fallbacks:
For each token (Proof of Curiosity, System, Self, and Market Admin), the function checks if the contract address is valid (i.e., not a placeholder). If valid, it attempts to fetch the balance; if not, it logs a warning and uses "0".

BN.js Conversion:
The raw string balances are converted to BN numbers for comparison. The boolean fields (hasProofOfCuriosity and hasMarketAdmin) are determined by checking if the balance is greater than zero.

Summary
This utility is designed to help developers quickly integrate token gating functionality into their applications. By abstracting the Web3 calls and incorporating fallback logic for placeholder addresses, it simplifies the process of fetching and interpreting token balances.

Feel free to modify or extend this utility as your contracts go live or if you need to support additional token types.