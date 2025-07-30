console.log(`
🔍 OpenZeppelin v5 Breaking Changes Analysis:

📋 Key Changes Affecting Your Contracts:

1. **Ownable Constructor:**
   v4: constructor() Ownable() { _transferOwnership(_msgSender()); }
   v5: constructor(address initialOwner) Ownable(initialOwner) {
       require(initialOwner != address(0), "Ownable: new owner is the zero address");
   }

2. **ERC721 Constructor:**
   v4: More permissive with empty strings
   v5: Stricter validation on name/symbol

3. **Access Control:**
   v5: Enhanced validation and error messages

📋 Your Contract Issues:

EventRegistrationNFT.sol:
- ✅ Already has initialOwner parameter
- ❌ May need additional validation

EventCompletionNFT.sol:  
- ✅ Already has initialOwner parameter
- ❌ May need additional validation

EventRegistrationNFTFactory.sol:
- ❌ Needs better error handling for failed deployments
- ❌ Should validate parameters before deployment

EventCompletionNFTFactory.sol:
- ❌ Needs better error handling for failed deployments  
- ❌ Should validate parameters before deployment

💡 REQUIRED FIXES:

1. Add parameter validation in NFT constructors
2. Add try-catch in factory deployment functions
3. Add specific error messages for debugging
4. Ensure all string parameters are non-empty
5. Add gas estimation and limits

🎯 SOLUTION: Update contracts with v5-compatible patterns
`);