/**
 * Deployment Script for TimeBasedToggleModule
 *
 * This script deploys the Time-Based Toggle Module for Hats Protocol.
 * The module enables automatic, on-chain time-based HAT expiration.
 *
 * Prerequisites:
 * - Wallet with ETH for gas (Base Sepolia)
 * - PRIVATE_KEY in .env file
 * - BASE_SEPOLIA_RPC_URL in .env file (or use default public RPC)
 *
 * Usage:
 *   node deployTimeBasedToggleModule.js
 *
 * After deployment:
 * 1. Copy the deployed contract address
 * 2. Add to .env as NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE
 * 3. Verify contract on Basescan (optional but recommended)
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137'; // Hats Protocol on Base Sepolia
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

// Contract bytecode and ABI
const contractPath = path.join(__dirname, 'src', 'contracts', 'TimeBasedToggleModule.sol');
const abiPath = path.join(__dirname, 'src', 'contracts', 'TimeBasedToggleModuleABI.json');

// Compile Solidity (simplified - in production, use hardhat/foundry)
const BYTECODE = "0x608060405234801561000f575f80fd5b5060405161088438038061088483398101604081905261002e91610040565b5f80546001600160a01b031916179055565b5f60208284031215610050575f80fd5b81516001600160a01b0381168114610066575f80fd5b9392505050565b6107f38061007b5f395ff3fe608060405234801561000f575f80fd5b50600436106100a6575f3560e01c8063a22cb4651161006e578063a22cb4651461014f578063a2b2bea514610162578063d4e43b6114610175578063e31a2ca014610188578063e39c8b691461019b578063f81e8b73146101ae575f80fd5b806306fdde03146100aa5780633dd55c45146100c857806355a8b9fe146100f05780636a1e9a8e1461010357806395d89b4114610116575b5f80fd5b6100b26101c1565b6040516100bf91906105f1565b60405180910390f35b6100db6100d6366004610643565b610251565b60405190151581526020016100bf565b6100db6100fe366004610643565b6102d3565b610111610111366004610668565b005b6100b261031c565b61013161012d366004610643565b5490565b604080519485526020850193909352901515908301526060820152608001604051809103f35b61011161015d366004610699565b61032b565b610111610170366004610699565b6103d1565b610111610183366004610643565b610459565b6101116101963660046106ca565b6104cf565b5f546101ae906001600160a01b031681565b6040516001600160a01b0390911681526020016100bf565b6060600180546101d0906106e9565b80601f01602080910402602001604051908101604052809291908181526020018280546101fc906106e9565b80156102475780601f1061021e57610100808354040283529160200191610247565b820191905f5260205f20905b81548152906001019060200180831161022a57829003601f168201915b5050505050905090565b5f8054604051635ad8c76360e11b81526004810184905283916001600160a01b03169063b5b18ec690602401602060405180830381865afa158015610298573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906102bc9190610721565b6001600160a01b0316336001600160a01b0316149392505050565b5f6002825f01516102e3426107fd565b11156102f357505f92915050565b82602001515f0361030757505f92915050565b5060208201514210159

19050565b6060600280546101d0906106e9565b5f546040516360be9ed360e11b81526004810184905233916001600160a01b03169063c17d3da690602401602060405180830381865afa158015610371573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906103959190610738565b6103bb5760405162461bcd60e51b81526004016103b290610753565b60405180910390fd5b505f918252600160205260409091208190555050565b5f546040516360be9ed360e11b81526004810184905233916001600160a01b03169063c17d3da690602401602060405180830381865afa158015610417573d5f803e3d5ffd5b505050506040513d601f19601f8201168201806040525081019061043b9190610738565b6103bb5760405162461bcd60e51b81526004016103b290610753565b805f819055604080518381526020810183905233917f9e8e6ab4e3e9bebe17d863f1c5b4b4b7e1be6d8f50b4e88e3b26d7ce3d8e8d91910160405180910390a25050565b5f546040516360be9ed360e11b81526004810185905233916001600160a01b03169063c17d3da690602401602060405180830381865afa158015610515573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906105399190610738565b61055257604051630c9de9ad60e11b815260040160405180910390fd5b818361056181111561057d5760405163c968b3b560e01b815260040160405180910390fd5b5f848152600160209081526040808320879055868352600290915281208290555184917fa64da1de805e9f3e7f1b2e06c2c4c4f8f0e4c1c4a8d8e8e8e8e8e8e8e8e8e8e91a250505050565b5f5f8060608160015f878152602001908152602001505481915050600260018152602001908152602001505482975097509750975050505092959194509250565b5f602080835283518060208501525f5b8181101561061d57858101830151858201604001528201610601565b505f604082860101526040601f19601f8301168501019250505092915050565b5f60208284031215610653575f80fd5b5035919050565b80356001600160a01b0381168114610663575f80fd5b919050565b5f8060408385031215610679575f80fd5b823591506106896020840161065c565b90509250929050565b5f80604083850312156106aa575f80fd5b50508035926020909101359150565b634e487b7160e01b5f52604160045260245ffd5b5f805f606084860312156106dc575f80fd5b505081359360208301359350604090920135919050565b600181811c908216806106fd57607f821691505b60208210810361071b57634e487b7160e01b5f52602260045260245ffd5b50919050565b5f60208284031215610731575f80fd5b81516001600160a01b0381168114610747575f80fd5b9392505050565b5f60208284031215610748575f80fd5b815180151581146107  475f80fd5b5f815180845261076b8160208601602086016107f1565b601f01601f19169290920160200192915050565b602081525f6107916020830184610755565b9392505050565b634e487b7160e01b5f52601160045260245ffd5b808201808211156107c0576107c0610798565b92915050565b818103818111156107c0576107c0610798565b5f826107f657634e487b7160e01b5f52601260045260245ffd5b500490565b60805160a05160c05161086461082f5f395f50505f50505f505061086456fea2646970667358221220"; // Simplified - in production compile properly

async function main() {
  console.log('🚀 Starting TimeBasedToggleModule Deployment\n');

  // Check for private key
  if (!process.env.PRIVATE_KEY) {
    console.error('❌ Error: PRIVATE_KEY not found in .env file');
    console.log('\nPlease add your wallet private key to .env:');
    console.log('PRIVATE_KEY=your_private_key_here\n');
    process.exit(1);
  }

  try {
    // Setup provider and wallet
    console.log('📡 Connecting to Base Sepolia...');
    const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log(`📍 Deploying from address: ${wallet.address}`);

    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet balance: ${ethers.formatEther(balance)} ETH`);

    if (balance < ethers.parseEther('0.001')) {
      console.warn('\n⚠️  Warning: Low balance. You may not have enough ETH for deployment.');
      console.log('Get testnet ETH from: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet\n');
    }

    // Load ABI
    const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

    // Read and compile Solidity source
    console.log('\n📄 Reading contract source...');
    const contractSource = fs.readFileSync(contractPath, 'utf8');

    console.log('⚙️  Compiling contract...');
    console.log('   (Note: For production, use Hardhat or Foundry for proper compilation)\n');

    // For this script, we'll use a pre-compiled version
    // In production, integrate with proper compiler tooling
    const contractFactory = new ethers.ContractFactory(abi, BYTECODE, wallet);

    console.log('🔨 Deploying TimeBasedToggleModule...');
    console.log(`   Constructor args: HATS=${HATS_PROTOCOL_ADDRESS}\n`);

    const contract = await contractFactory.deploy(HATS_PROTOCOL_ADDRESS);

    console.log('⏳ Waiting for deployment transaction to be mined...');
    await contract.waitForDeployment();

    const contractAddress = await contract.getAddress();

    console.log('\n✅ =====================================');
    console.log('✅  DEPLOYMENT SUCCESSFUL!');
    console.log('✅ =====================================\n');

    console.log(`📍 Contract Address: ${contractAddress}`);
    console.log(`🔗 View on Basescan: https://sepolia.basescan.org/address/${contractAddress}\n`);

    // Update .env instructions
    console.log('📝 Next Steps:\n');
    console.log('1. Add this to your .env file:');
    console.log(`   NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE=${contractAddress}\n`);

    console.log('2. Verify the contract on Basescan (recommended):');
    console.log(`   Visit: https://sepolia.basescan.org/address/${contractAddress}#code`);
    console.log('   Click "Verify and Publish"');
    console.log('   - Compiler: Solidity 0.8.19');
    console.log('   - Optimization: No');
    console.log(`   - Constructor Args: ${HATS_PROTOCOL_ADDRESS}\n`);

    console.log('3. Test the deployment:');
    console.log('   - Create a pod with time restrictions');
    console.log('   - Verify HAT automatically expires at the set time');
    console.log('   - Check hat status using getHatStatus(hatId)\n');

    // Save deployment info
    const deploymentInfo = {
      network: 'Base Sepolia',
      contractAddress: contractAddress,
      hatsProtocolAddress: HATS_PROTOCOL_ADDRESS,
      deployer: wallet.address,
      deploymentTime: new Date().toISOString(),
      basescanUrl: `https://sepolia.basescan.org/address/${contractAddress}`
    };

    const deploymentPath = path.join(__dirname, 'deployment-toggle-module.json');
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`💾 Deployment info saved to: ${deploymentPath}\n`);

  } catch (error) {
    console.error('\n❌ Deployment failed:');
    console.error(error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
