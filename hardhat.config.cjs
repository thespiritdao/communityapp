// commapp/hardhat.config.cjs

// Commented out ts-node due to ESM/CommonJS incompatibility
// Use plain JS for Hardhat scripts instead
// require('ts-node/register');

// load the Hardhat Toolbox (includes ethers, waffle, chai, etc.)
// Temporarily commented to avoid chai ESM issues
// require('@nomicfoundation/hardhat-toolbox');

// Minimal hardhat config for contract compilation
require('@nomicfoundation/hardhat-ethers');

// Load .env so DEPLOYER_PRIVATE_KEY etc. are available to network configs
require('dotenv').config();

// Deployer key: DEPLOYER_PRIVATE_KEY, falling back to the repo's existing
// PRIVATE_KEY / POD_ADMIN_PRIVATE_KEY conventions (see deploy-hat-minter.ts)
const rawDeployerKey =
  process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY || process.env.POD_ADMIN_PRIVATE_KEY;
const deployerKey = rawDeployerKey
  ? rawDeployerKey.startsWith('0x')
    ? rawDeployerKey
    : `0x${rawDeployerKey}`
  : undefined;

module.exports = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      chainId: 8453,
      allowUnlimitedContractSize: true,
    },
    // if you want to mint against your local node:
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 8453,
    },
    // Base mainnet
    base: {
      url: 'https://mainnet.base.org',
      chainId: 8453,
      accounts: deployerKey ? [deployerKey] : [],
    },
    // Base Sepolia testnet
    'base-sepolia': {
      url: 'https://sepolia.base.org',
      chainId: 84532,
      accounts: deployerKey ? [deployerKey] : [],
    },
  },
  solidity: {
    version: '0.8.26',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // viaIR disabled temporarily - causes stack too deep in other contracts
      // viaIR: true,
      evmVersion: 'cancun',
    },
  },
  paths: {
    sources: './src/contracts',
    tests: './src/test',
    cache: './node_modules/.cache/hardhat',
    artifacts: './artifacts',
  },
};
