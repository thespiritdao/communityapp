// scripts/estimateUserOpGas.mjs
import { createPublicClient, http, encodeFunctionData } from 'viem'
import { base } from 'viem/chains'
import {
  createBundlerClient,
  estimateUserOperationGas,
} from 'viem/account-abstraction'
import DAO_GovernorABI from '../src/abis/DAO_GovernorABI.json' assert { type: 'json' }

const ENTRY_POINT   = '0x0576a174D229E3cFA37253523E645A78A0C91B57'
const BUNDLER_URL   = 'https://api.developer.coinbase.com/rpc/v1/base/r0F9pnlqLGvSaRbYaSmsZmf0q8tKDoc5'
const GOVERNOR      = '0x2c6A4382C4ba0976b09A82c523e20189e1167622'
const SMART_WALLET  = '0x12a0cf22D632c859B793F852af03b9d515580244' // from Coinbase modal

async function main() {
  // 1) Basic HTTP client for on-chain calls & simulateContract
  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  })

  // 2) BundlerClient to hit your paymaster/bundler endpoint
  const bundlerClient = createBundlerClient({
    client: publicClient,
    transport: http(BUNDLER_URL),
  })

  // 3) Grab the raw propose() calldata (with paymasterAndData)
  const { request } = await publicClient.simulateContract({
    account: SMART_WALLET,
    address: GOVERNOR,
    abi: DAO_GovernorABI,
    functionName: 'propose',
    args: [
      [GOVERNOR],           // targets
      [0n],                 // values
      [
        encodeFunctionData({    // dummy calldata so propose() isn’t empty
          abi: DAO_GovernorABI,
          functionName: 'votingDelay',
          args: [],
        }),
      ],
      '# Test\n\nMy proposal body',
    ],
  })

  // 4) Build a minimal UserOp
  const userOp = {
    sender: SMART_WALLET,
    nonce:   await bundlerClient.getNonce(SMART_WALLET),
    initCode:        '0x',
    callData:        request.data,
    callGas:         '0x100000',
    verificationGas: '0x100000',
    preVerificationGas: '0x10000',
    maxFeePerGas:        '0x09184e72a000',
    maxPriorityFeePerGas:'0x09184e72a000',
    paymasterAndData:    request.paymasterAndData ?? '0x',
    signature:           '0x',
  }

  // 5) Run the gas estimator
  try {
    const estimate = await estimateUserOperationGas(bundlerClient, {
      entryPoint: ENTRY_POINT,
      userOperation: userOp,
    })
    console.log('✅ estimateUserOperationGas:', estimate)
  } catch (err) {
    console.error('❌ estimateUserOperationGas ERROR:', err)
  }
}

main()
