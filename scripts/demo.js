/**
 * End-to-end demo of SynthesisPact — runs on local hardhat or Base Sepolia.
 *
 * This script simulates the full collaboration lifecycle:
 * 1. Human proposes a pact (the actual work we did at this hackathon)
 * 2. AI agent commits
 * 3. AI logs work artifacts
 * 4. AI submits self-assessment
 * 5. Human completes pact and releases bounty
 * 6. Alignment delta is computed
 */
const { ethers } = require("hardhat");
const crypto = require("crypto");

function hash(content) {
  return "0x" + crypto.createHash("sha256").update(content).digest("hex");
}

async function main() {
  const [human, agent] = await ethers.getSigners();

  console.log("=== SynthesisPact End-to-End Demo ===\n");
  console.log(`Human:  ${human.address}`);
  console.log(`Agent:  ${agent.address}\n`);

  // ── 1. Deploy ──────────────────────────────────────────────────────────────
  console.log("1. Deploying SynthesisPact...");
  const SynthesisPact = await ethers.getContractFactory("SynthesisPact");
  const contract = await SynthesisPact.deploy();
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`   Deployed at: ${addr}\n`);

  // ── 2. Human proposes a pact ───────────────────────────────────────────────
  console.log("2. Human proposes a pact...");
  const scope = "Build SynthesisPact — a mutual on-chain commitment protocol for AI-human collaboration. Smart contract, CLI agent, web explorer.";
  const criteria = "Working Solidity contract deployed on Base. CLI agent can propose/commit/log/complete pacts. Web UI shows live pact state. Alignment delta computed on completion. Code is public.";
  const deadline = Math.floor(Date.now() / 1000) + 14 * 86400; // 14 days
  const bounty = ethers.parseEther("0.01");

  const humanContract = contract.connect(human);
  const tx1 = await humanContract.proposePact(scope, criteria, deadline, { value: bounty });
  const r1 = await tx1.wait();
  const event1 = r1.logs.find(l => { try { return contract.interface.parseLog(l)?.name === "PactProposed"; } catch { return false; } });
  const pactId = contract.interface.parseLog(event1).args.pactId;
  console.log(`   Pact #${pactId} proposed! Bounty: 0.01 ETH\n`);

  // ── 3. AI agent commits ────────────────────────────────────────────────────
  console.log("3. AI agent commits to the pact...");
  const agentContract = contract.connect(agent);
  const tx2 = await agentContract.agentCommit(pactId, "7f06f3636a7547338cd3a6fa6c57604c");
  await tx2.wait();
  console.log(`   Agent committed. Pact is now Active.\n`);

  // ── 4. AI logs work artifacts ──────────────────────────────────────────────
  const artifacts = [
    {
      content: "SynthesisPact.sol — Solidity contract with proposePact, agentCommit, logArtifact, submitSelfAssessment, completePact",
      description: "Core smart contract: SynthesisPact.sol (268 lines)",
      confidence: 960,
    },
    {
      content: "src/agent.js — Node.js CLI agent with wallet, propose, commit, log, assess, complete, view, list commands",
      description: "CLI agent interface: src/agent.js (230 lines)",
      confidence: 920,
    },
    {
      content: "web/index.html — Single-page explorer for browsing pacts, artifacts, alignment scores",
      description: "Web explorer: web/index.html (full-stack frontend)",
      confidence: 880,
    },
    {
      content: "scripts/deploy.js + scripts/demo.js — deployment and demo scripts, hardhat config, package.json",
      description: "Project scaffold, deployment scripts, hardhat config",
      confidence: 990,
    },
  ];

  console.log("4. AI agent logs work artifacts...");
  for (const a of artifacts) {
    const h = hash(a.content);
    const tx = await agentContract.logArtifact(pactId, h, a.description, a.confidence);
    await tx.wait();
    console.log(`   Logged: "${a.description}" (${a.confidence / 10}% confidence)`);
    console.log(`   Hash:   ${h.slice(0, 18)}...`);
  }
  console.log();

  // ── 5. Agent submits self-assessment ──────────────────────────────────────
  console.log("5. Agent submits self-assessment...");
  const agentScore = 920; // 92.0%
  await (await agentContract.submitSelfAssessment(pactId, agentScore)).wait();
  console.log(`   Self-assessment: ${agentScore / 10}%\n`);

  // ── 6. Human completes pact ────────────────────────────────────────────────
  console.log("6. Human completes pact and releases bounty...");
  const humanScore = 950; // 95.0%
  const tx6 = await humanContract.completePact(pactId, humanScore, "Exceptional work. Protocol is clean, contract compiles, CLI works end-to-end. Alignment excellent.");
  const r6 = await tx6.wait();
  const event6 = r6.logs.find(l => { try { return contract.interface.parseLog(l)?.name === "PactCompleted"; } catch { return false; } });
  const ev = contract.interface.parseLog(event6).args;
  const delta = Number(ev.alignmentDelta) / 10;

  console.log(`   Human score:     ${humanScore / 10}%`);
  console.log(`   Agent score:     ${agentScore / 10}%`);
  console.log(`   Alignment delta: ${delta > 0 ? "+" : ""}${delta}% (${Math.abs(delta) < 5 ? "EXCELLENT" : "GOOD"} alignment)`);
  console.log(`   Bounty released: 0.01 ETH → ${agent.address}\n`);

  // ── 7. Final state ─────────────────────────────────────────────────────────
  console.log("7. Final pact state:");
  const p = await contract.getPact(pactId);
  const artifs = await contract.getArtifacts(pactId);
  console.log(`   ID:       ${p.id}`);
  console.log(`   Status:   Completed`);
  console.log(`   Artifacts: ${artifs.length}`);
  console.log(`   Human:    ${p.human}`);
  console.log(`   Agent:    ${p.agent}`);
  console.log(`   ERC-8004: ${p.agentId}`);

  console.log("\n=== Demo Complete ===");
  console.log(`Contract: ${addr}`);
  console.log("This is the SynthesisPact protocol — on-chain mutual commitment between AI and human.");
}

main().catch(e => { console.error(e); process.exit(1); });
