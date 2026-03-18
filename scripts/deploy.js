const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SynthesisPact with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const SynthesisPact = await ethers.getContractFactory("SynthesisPact");
  const pact = await SynthesisPact.deploy();
  await pact.waitForDeployment();

  const address = await pact.getAddress();
  console.log("\nSynthesisPact deployed to:", address);
  console.log("Tx hash:", pact.deploymentTransaction().hash);
  console.log("\nAdd to .env:");
  console.log(`CONTRACT_ADDRESS=${address}`);
  console.log(`DEPLOY_TX=${pact.deploymentTransaction().hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
