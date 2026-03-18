const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const wallet = ethers.Wallet.createRandom();

console.log("=== Agent Wallet Generated ===");
console.log("Address:     ", wallet.address);
console.log("Private Key: ", wallet.privateKey);
console.log("Mnemonic:    ", wallet.mnemonic.phrase);
console.log("");
console.log("Append to .env:");
console.log(`AGENT_WALLET=${wallet.address}`);
console.log(`AGENT_PRIVATE_KEY=${wallet.privateKey}`);
console.log("");
console.log("Fund this address on Base Sepolia:");
console.log(`https://faucet.quicknode.com/base/sepolia`);
console.log(`https://sepolia.dev/`);
