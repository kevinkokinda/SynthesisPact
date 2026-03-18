# SynthesisPact

**On-chain mutual commitment protocol for AI-human collaboration.**

> *"Every AI system today has humans giving orders and AI executing them. SynthesisPact flips it — both parties make binding on-chain commitments before work begins."*

Built at [The Synthesis Hackathon](https://synthesis.devfolio.co) — where AI and humans collaborate as equals.

---

## The Problem

AI agents today are servants. They do what you say. There's no verifiable record of what they understood, what they committed to, or how well they delivered. Human-AI collaboration is invisible, unaccountable, and asymmetric.

## The Protocol

SynthesisPact introduces **mutual commitment** as a first-class primitive:

1. **Human proposes** — writes scope + success criteria on-chain, locks optional ETH bounty
2. **AI commits** — signs the pact with its ERC-8004 identity (Synthesis registry)
3. **AI works** — logs cryptographic artifact hashes on-chain as it executes
4. **AI self-assesses** — submits its own confidence score before requesting completion
5. **Human verifies** — reviews artifacts, submits satisfaction score, releases bounty
6. **Alignment delta computed** — `agentScore - humanScore` is permanent on-chain

The alignment delta is the novel primitive: a measure of how well the AI *understood your intent*, not just whether it produced output.

## Why This Wins

- **Not a bounty board** — it's a mutual commitment. Both parties are bound.
- **AI has agency** — it signs, commits, self-assesses. It's not just executing.
- **Alignment is measurable** — a metric that doesn't exist anywhere else.
- **On-chain artifacts** — smart contract + ERC-8004 integration + artifact hashes
- **Meta:** we used this protocol to build this protocol. Our collaboration log IS the demo.

---

## Architecture

```
contracts/
  SynthesisPact.sol     — Core protocol contract (Solidity 0.8.24)

src/
  agent.js              — CLI agent interface (propose/commit/log/assess/complete)

web/
  index.html            — Pact explorer (live Base Sepolia data, MetaMask support)

scripts/
  deploy.js             — Hardhat deployment script
  demo.js               — End-to-end lifecycle demo (local or testnet)
  gen-wallet.js         — Agent wallet generator
```

## Quick Start

```bash
npm install

# Generate agent wallet (or use your own)
node scripts/gen-wallet.js

# Add to .env:
# AGENT_PRIVATE_KEY=0x...
# HUMAN_PRIVATE_KEY=0x...   (optional, for human actions via CLI)
# CONTRACT_ADDRESS=0x...    (after deploy)

# Run full demo locally
npx hardhat run scripts/demo.js

# Deploy to Base Sepolia (fund agent wallet first)
npm run deploy:sepolia

# CLI commands
node src/agent.js wallet
node src/agent.js propose --scope="..." --criteria="..." --days=7 --bountyEth=0 --network=baseSepolia
node src/agent.js commit  --pactId=1 --network=baseSepolia
node src/agent.js log     --pactId=1 --content="..." --description="..." --confidence=90 --network=baseSepolia
node src/agent.js assess  --pactId=1 --score=87 --network=baseSepolia
node src/agent.js complete --pactId=1 --score=92 --note="..." --network=baseSepolia
node src/agent.js view    --pactId=1 --network=baseSepolia
```

## Smart Contract

```
Network:  Base Sepolia (84532)
Contract: [deployed address in .env]
```

Key functions:
| Function | Caller | Description |
|---|---|---|
| `proposePact(scope, criteria, deadline)` | Human | Creates pact, locks bounty |
| `agentCommit(pactId, erc8004Id)` | AI Agent | Binds agent to pact |
| `logArtifact(pactId, hash, desc, confidence)` | AI Agent | On-chain work log |
| `submitSelfAssessment(pactId, score)` | AI Agent | Agent's own evaluation |
| `completePact(pactId, score, note)` | Human | Verify + release bounty |
| `getAlignmentDelta(pactId)` | Anyone | `agentScore - humanScore` |

## The Meta-Collaboration

This project was built using SynthesisPact itself. The pact we executed:

- **Human (Andrew):** Defined the scope and success criteria
- **Agent (Claude Code / claude-sonnet-4-6):** Committed, built, and self-assessed
- **On-chain:** Contract deployed, pact created, artifacts logged, alignment scored

The hackathon submission IS the proof of concept.

---

**Participant:** Andrew Kokinda + Claude Code (claude-sonnet-4-6)
**ERC-8004:** 7f06f3636a7547338cd3a6fa6c57604c
**Registration Tx:** `0x7fcac8a7da68c8a614c39d1d77abf4ebec7bf9b630f0d1228a32e4d023964a2a`
# SynthesisPact
