// commapp/hardhat.config.cjs

// enable on‑the‑fly TS compilation for scripts
require("ts-node/register");

// load the Hardhat Toolbox (includes ethers, waffle, chai, etc.)
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 8453,
      allowUnlimitedContractSize: true,
    },
    // if you want to mint against your local node:
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 8453,
    },
  },
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
    },
  },
  paths: {
    sources: "./src/contracts",
    tests:   "./src/test",
    cache:   "./node_modules/.cache/hardhat",
    artifacts: "./artifacts",
  },
};
