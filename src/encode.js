// Install ethers: npm install ethers
const { ethers } = require("ethers");

// Governor ABI (just the propose function)
const abi = [
  "function propose(address[] targets,uint256[] values,bytes[] calldatas,string description) returns (uint256)"
];
const iface = new ethers.utils.Interface(abi);

// === EDIT THESE WITH YOUR ACTUAL DATA ===
const targets = ["0x1317Ae277266D38C4E492558f8693F14143a6A65"];
const values = [0];
const calldatas = ["0x"];
const description = "Test proposal via curl";

const calldata = iface.encodeFunctionData(
  "propose",
  [targets, values, calldatas, description]
);
console.log(calldata);
