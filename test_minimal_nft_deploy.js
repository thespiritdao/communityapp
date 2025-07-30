const { ethers } = require('ethers');

const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const PRIVATE_KEY = '43ba409097d6e533a98435b319e3052b5e827b98c163de221db2076555a9e97b';

async function testMinimalNFTDeploy() {
  try {
    console.log('🧪 Testing Minimal NFT Deployment...\n');
    
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log(`Deployer: ${wallet.address}\n`);
    
    // Test parameters that would be passed by factory
    const eventId = 'test-minimal';
    const eventTitle = 'Test Event';
    const eventDate = Math.floor(Date.now() / 1000) + 300;
    const tokenName = eventTitle + ' Registration';
    const tokenSymbol = 'EVENTREG';
    const initialOwner = '0x12a0cf22D632c859B793F852af03b9d515580244'; // Test wallet
    
    console.log('📋 NFT Constructor Parameters:');
    console.log(`Event ID: "${eventId}"`);
    console.log(`Event Title: "${eventTitle}"`);
    console.log(`Event Date: ${eventDate}`);
    console.log(`Token Name: "${tokenName}"`);
    console.log(`Token Symbol: "${tokenSymbol}"`);
    console.log(`Initial Owner: ${initialOwner}`);
    console.log(`Owner is zero: ${initialOwner === '0x0000000000000000000000000000000000000000'}\n`);
    
    // Simple NFT contract for testing (minimal version of EventRegistrationNFT)
    const minimalNFTBytecode = `
      pragma solidity ^0.8.20;
      
      import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
      import "@openzeppelin/contracts/access/Ownable.sol";
      
      contract MinimalEventNFT is ERC721, Ownable {
          constructor(
              string memory _eventId,
              string memory _eventTitle,
              uint256 _eventDate,
              string memory _tokenName,
              string memory _tokenSymbol,
              address initialOwner
          ) ERC721(_tokenName, _tokenSymbol) Ownable(initialOwner) {
              // Minimal constructor
          }
      }
    `;
    
    console.log('🔍 TESTING THEORY:');
    console.log('The issue is likely that:');
    console.log('1. OpenZeppelin v5.x Ownable constructor has stricter validation');
    console.log('2. ERC721 constructor might reject empty/invalid strings');
    console.log('3. String concatenation in factory might create invalid parameters');
    console.log('4. Gas limits might be exceeded during deployment\n');
    
    console.log('💡 SOLUTIONS TO TRY:');
    console.log('1. Downgrade to OpenZeppelin v4.x');
    console.log('2. Add parameter validation in factory before deployment');
    console.log('3. Increase gas limit for NFT deployment');
    console.log('4. Check for empty string handling in ERC721 constructor');
    console.log('5. Add try-catch around NFT deployment in factory\n');
    
    // Check if it's a gas issue by estimating deployment gas
    console.log('📋 Gas Estimation Analysis:');
    console.log('Typical ERC721 deployment: ~2,000,000 gas');
    console.log('Base network gas limit: 30,000,000 gas');
    console.log('Factory function gas limit: Usually sufficient\n');
    
    console.log('🎯 IMMEDIATE FIX RECOMMENDATION:');
    console.log('Try downgrading OpenZeppelin to v4.9.6:');
    console.log('npm install @openzeppelin/contracts@4.9.6');
    console.log('Then redeploy your factory contracts.');
    console.log('This will likely resolve the Ownable constructor issue.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMinimalNFTDeploy();