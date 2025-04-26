// src/utils/erc20ABI.ts

// Minimal ABI for ERC20 that supports allowance, approve, and balanceOf.
export const erc20ABI = [
  // Read-only functions
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  // State-changing function
  "function approve(address spender, uint256 amount) returns (bool)",
];
