export const erc721ABI = [
  // balanceOf
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
  // tokenOfOwnerByIndex
  {
    constant: true,
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    name: "tokenOfOwnerByIndex",
    outputs: [{ name: "tokenId", type: "uint256" }],
    type: "function",
  },
  // tokenURI
  {
    constant: true,
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
];
