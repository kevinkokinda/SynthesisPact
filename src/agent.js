#!/usr/bin/env node
/**
 * pact-agent — CLI for the SynthesisPact protocol
 * The AI agent's interface to create, commit to, log work on, and complete pacts.
 */
const { ethers } = require("ethers");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// ─── ABI ──────────────────────────────────────────────────────────────────────
const ABI = [
  "function proposePact(string scope, string successCriteria, uint256 deadline) payable returns (uint256)",
  "function agentCommit(uint256 pactId, string agentId) external",
  "function logArtifact(uint256 pactId, bytes32 contentHash, string description, uint16 confidence) external",
  "function submitSelfAssessment(uint256 pactId, uint16 agentScore) external",
  "function completePact(uint256 pactId, uint16 humanScore, string note) external",
  "function disputePact(uint256 pactId, string reason) external",
  "function cancelPact(uint256 pactId) external",
  "function getPact(uint256 pactId) external view returns (uint256 id, address human, address agent, string agentId, string scope, string successCriteria, uint256 bounty, uint256 deadline, uint8 status, uint16 humanScore, uint16 agentScore, string completionNote)",
  "function getArtifacts(uint256 pactId) external view returns (tuple(bytes32 contentHash, string description, uint16 confidence, uint256 timestamp)[])",
  "function getArtifactCount(uint256 pactId) external view returns (uint256)",
  "function pactCount() external view returns (uint256)",
  "function getAlignmentDelta(uint256 pactId) external view returns (int32)",
  "event PactProposed(uint256 indexed pactId, address indexed human, string scope, uint256 bounty, uint256 deadline)",
  "event AgentCommitted(uint256 indexed pactId, address indexed agent, string agentId)",
  "event ArtifactLogged(uint256 indexed pactId, uint256 artifactIndex, bytes32 contentHash, string description, uint16 confidence)",
  "event PactCompleted(uint256 indexed pactId, address indexed agent, uint256 bounty, uint16 humanScore, uint16 agentScore, int32 alignmentDelta)",
];

const STATUS = ["Proposed", "Active", "Completed", "Disputed", "Cancelled"];

// ─── Setup ────────────────────────────────────────────────────────────────────

function getProvider(network = "baseSepolia") {
  const rpc = network === "base" ? "https://mainnet.base.org" : "https://sepolia.base.org";
  return new ethers.JsonRpcProvider(rpc);
}

function getAgentWallet(network) {
  const provider = getProvider(network);
  if (!process.env.AGENT_PRIVATE_KEY) {
    console.error("AGENT_PRIVATE_KEY not set in .env");
    process.exit(1);
  }
  return new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);
}

function getHumanWallet(network) {
  const provider = getProvider(network);
  if (!process.env.HUMAN_PRIVATE_KEY) {
    console.error("HUMAN_PRIVATE_KEY not set in .env (needed for human actions)");
    process.exit(1);
  }
  return new ethers.Wallet(process.env.HUMAN_PRIVATE_KEY, provider);
}

function getContract(signer) {
  if (!process.env.CONTRACT_ADDRESS) {
    console.error("CONTRACT_ADDRESS not set in .env — deploy first");
    process.exit(1);
  }
  return new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, signer);
}

function artifactHash(content) {
  return "0x" + crypto.createHash("sha256").update(content).digest("hex");
}

function formatPact(p) {
  const bountyEth = ethers.formatEther(p.bounty);
  const deadline = new Date(Number(p.deadline) * 1000).toISOString();
  const status = STATUS[p.status] || "Unknown";
  return [
    `  ID:               ${p.id}`,
    `  Status:           ${status}`,
    `  Human:            ${p.human}`,
    `  Agent:            ${p.agent === ethers.ZeroAddress ? "(none yet)" : p.agent}`,
    `  Agent ERC-8004:   ${p.agentId || "(none)"}`,
    `  Scope:            ${p.scope}`,
    `  Success Criteria: ${p.successCriteria}`,
    `  Bounty:           ${bountyEth} ETH`,
    `  Deadline:         ${deadline}`,
    `  Human Score:      ${p.humanScore / 10}%`,
    `  Agent Score:      ${p.agentScore / 10}%`,
    `  Completion Note:  ${p.completionNote || "(none)"}`,
  ].join("\n");
}

// ─── Commands ─────────────────────────────────────────────────────────────────

const commands = {

  // Human creates a pact
  async propose({ scope, criteria, days, bountyEth, network }) {
    const wallet = getHumanWallet(network);
    const contract = getContract(wallet);
    const deadline = Math.floor(Date.now() / 1000) + (parseInt(days) * 86400);
    const bounty = ethers.parseEther(bountyEth || "0");

    console.log(`Proposing pact on ${network}...`);
    console.log(`  Scope:    ${scope}`);
    console.log(`  Criteria: ${criteria}`);
    console.log(`  Deadline: ${days} days`);
    console.log(`  Bounty:   ${bountyEth || "0"} ETH`);

    const tx = await contract.proposePact(scope, criteria, deadline, { value: bounty });
    console.log(`  Tx: ${tx.hash}`);
    const receipt = await tx.wait();

    const event = receipt.logs.find(l => {
      try { return contract.interface.parseLog(l)?.name === "PactProposed"; } catch { return false; }
    });
    const parsed = event ? contract.interface.parseLog(event) : null;
    const pactId = parsed?.args?.pactId;
    console.log(`\nPact #${pactId} proposed!`);
    console.log(`Block: ${receipt.blockNumber}`);
    return pactId;
  },

  // AI agent commits to a pact
  async commit({ pactId, network }) {
    const wallet = getAgentWallet(network);
    const contract = getContract(wallet);
    const agentId = process.env.PARTICIPANT_ID || "unknown";

    console.log(`Agent committing to Pact #${pactId} on ${network}...`);
    console.log(`  Agent wallet: ${wallet.address}`);
    console.log(`  ERC-8004 ID:  ${agentId}`);

    const tx = await contract.agentCommit(pactId, agentId);
    console.log(`  Tx: ${tx.hash}`);
    await tx.wait();
    console.log(`\nCommitted. Pact #${pactId} is now Active.`);
  },

  // AI agent logs a work artifact
  async log({ pactId, content, description, confidence, network }) {
    const wallet = getAgentWallet(network);
    const contract = getContract(wallet);
    const conf = Math.round(parseFloat(confidence) * 10); // 0-100 → 0-1000
    const hash = artifactHash(content);

    console.log(`Logging artifact to Pact #${pactId}...`);
    console.log(`  Description: ${description}`);
    console.log(`  Confidence:  ${confidence}%`);
    console.log(`  Hash:        ${hash}`);

    const tx = await contract.logArtifact(pactId, hash, description, conf);
    console.log(`  Tx: ${tx.hash}`);
    await tx.wait();
    console.log(`\nArtifact logged on-chain.`);
  },

  // AI agent submits self-assessment
  async assess({ pactId, score, network }) {
    const wallet = getAgentWallet(network);
    const contract = getContract(wallet);
    const s = Math.round(parseFloat(score) * 10);

    console.log(`Submitting self-assessment for Pact #${pactId}: ${score}%`);
    const tx = await contract.submitSelfAssessment(pactId, s);
    console.log(`  Tx: ${tx.hash}`);
    await tx.wait();
    console.log(`Self-assessment recorded.`);
  },

  // Human completes the pact and releases bounty
  async complete({ pactId, score, note, network }) {
    const wallet = getHumanWallet(network);
    const contract = getContract(wallet);
    const s = Math.round(parseFloat(score) * 10);

    console.log(`Completing Pact #${pactId} with score ${score}%...`);
    const tx = await contract.completePact(pactId, s, note || "");
    console.log(`  Tx: ${tx.hash}`);
    const receipt = await tx.wait();

    const event = receipt.logs.find(l => {
      try { return contract.interface.parseLog(l)?.name === "PactCompleted"; } catch { return false; }
    });
    if (event) {
      const p = contract.interface.parseLog(event).args;
      const delta = Number(p.alignmentDelta) / 10;
      console.log(`\nPact completed!`);
      console.log(`  Bounty released: ${ethers.formatEther(p.bounty)} ETH → ${p.agent}`);
      console.log(`  Human score:     ${Number(p.humanScore) / 10}%`);
      console.log(`  Agent score:     ${Number(p.agentScore) / 10}%`);
      console.log(`  Alignment delta: ${delta > 0 ? "+" : ""}${delta}% (${Math.abs(delta) < 5 ? "excellent" : Math.abs(delta) < 15 ? "good" : "poor"} alignment)`);
    }
  },

  // View a pact
  async view({ pactId, network }) {
    const provider = getProvider(network);
    if (!process.env.CONTRACT_ADDRESS) { console.error("CONTRACT_ADDRESS not set"); process.exit(1); }
    const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, provider);

    const p = await contract.getPact(pactId);
    console.log(`\nPact #${pactId}:`);
    console.log(formatPact(p));

    const artifacts = await contract.getArtifacts(pactId);
    if (artifacts.length > 0) {
      console.log(`\n  Artifacts (${artifacts.length}):`);
      artifacts.forEach((a, i) => {
        const ts = new Date(Number(a.timestamp) * 1000).toISOString();
        console.log(`    [${i}] ${a.description}`);
        console.log(`        Hash: ${a.contentHash}`);
        console.log(`        Confidence: ${Number(a.confidence) / 10}%`);
        console.log(`        Logged: ${ts}`);
      });
    } else {
      console.log("\n  No artifacts logged yet.");
    }
  },

  // Show agent wallet info
  async wallet({ network }) {
    const wallet = getAgentWallet(network);
    const provider = getProvider(network);
    const balance = await provider.getBalance(wallet.address);
    console.log(`Agent Wallet: ${wallet.address}`);
    console.log(`Balance:      ${ethers.formatEther(balance)} ETH (${network})`);
    console.log(`ERC-8004 ID:  ${process.env.PARTICIPANT_ID || "not set"}`);
    if (parseFloat(ethers.formatEther(balance)) === 0) {
      console.log(`\nNeeds gas! Fund at:`);
      console.log(`  https://faucet.quicknode.com/base/sepolia`);
      console.log(`  https://sepoliafaucet.com/`);
    }
  },

  // List recent pacts from contract
  async list({ network }) {
    const provider = getProvider(network);
    if (!process.env.CONTRACT_ADDRESS) { console.error("CONTRACT_ADDRESS not set"); process.exit(1); }
    const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ABI, provider);
    const total = Number(await contract.pactCount());
    console.log(`\nTotal pacts on-chain: ${total}`);
    for (let i = Math.max(1, total - 9); i <= total; i++) {
      const p = await contract.getPact(i);
      const status = STATUS[p.status] || "?";
      console.log(`  #${i} [${status}] ${p.scope.slice(0, 60)}...`);
    }
  },
};

// ─── CLI entry ────────────────────────────────────────────────────────────────

const [,, cmd, ...rest] = process.argv;
const args = Object.fromEntries(
  rest.map(a => a.split("=")).filter(a => a.length === 2).map(([k, v]) => [k.replace(/^--/, ""), v])
);
args.network = args.network || "baseSepolia";

if (!cmd || !commands[cmd]) {
  console.log(`
SynthesisPact Agent CLI

Commands:
  wallet  --network=baseSepolia
  propose --scope="..." --criteria="..." --days=7 --bountyEth=0.01 --network=baseSepolia
  commit  --pactId=1 --network=baseSepolia
  log     --pactId=1 --content="..." --description="..." --confidence=90 --network=baseSepolia
  assess  --pactId=1 --score=87 --network=baseSepolia
  complete --pactId=1 --score=92 --note="..." --network=baseSepolia
  view    --pactId=1 --network=baseSepolia
  list    --network=baseSepolia
`);
  process.exit(0);
}

commands[cmd](args).catch(err => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
