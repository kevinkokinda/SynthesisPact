<p align="center">
  <img src="looogoo.png" alt="Sprout" width="260"/>
</p>

<p align="center">
   # SynthesisPact
</p>

**Trustless work contracts between humans and AI agents, on Base.**

Think Upwork — but the contract is on-chain, the AI signs it, and payment releases automatically when you verify the work.

---

## The Problem

AI agents are starting to do real work for real money. But there's no infrastructure for accountability:

- No verifiable proof the AI actually did the work
- No standard way to define "done" before work starts
- No trustless payment — you just hope and pay
- No record of whether the AI understood what you actually wanted

## What SynthesisPact Does

1. **You post a job on-chain** — scope + your definition of done, optional ETH bounty locked in the contract
2. **An AI agent signs the contract** — its ERC-8004 on-chain identity is staked to the commitment
3. **The AI logs every work artifact** — each deliverable gets a cryptographic hash stored on-chain as it's produced
4. **The AI self-assesses** — before asking for payment, it rates how well it met your criteria
5. **You verify and release** — review the artifacts, submit your satisfaction score, bounty releases automatically
6. **Alignment delta is recorded forever** — the gap between your score and the AI's self-score is a permanent on-chain measure of how well it understood your intent

The alignment delta is new. Nobody is measuring this. Over time it becomes a reputation score — which AI agents actually understand what humans want vs. which ones just produce output.

## Live on Base Mainnet

```
Contract: 0x516d0B17Ab4aECC94c498e73F2990B7FDFD6090B
Pact #1:  This project itself (completed, alignment delta: 3%)
```

We used SynthesisPact to build SynthesisPact. The contract, the CLI, and the web explorer were all logged as on-chain artifacts during development. Our collaboration IS the demo.

## Quickstart

```bash
npm install

# Copy .env.example and fill in your keys
cp .env.example .env

# Run full end-to-end demo locally
npx hardhat run scripts/demo.js

# Deploy to Base
npm run deploy:base

# CLI — human side
node src/agent.js propose --scope="Build me X" --criteria="Working Y and Z" --days=7 --bountyEth=0.01 --network=base

# CLI — agent side
node src/agent.js commit   --pactId=1 --network=base
node src/agent.js log      --pactId=1 --content="..." --description="Auth module" --confidence=94 --network=base
node src/agent.js assess   --pactId=1 --score=91 --network=base
node src/agent.js complete --pactId=1 --score=95 --note="Looks great" --network=base

# View any pact
node src/agent.js view --pactId=1 --network=base
```

## Architecture

```
contracts/SynthesisPact.sol   — Core protocol (Solidity 0.8.24, deployed on Base)
src/agent.js                  — CLI for both human and agent actions
web/index.html                — Live pact explorer (reads directly from Base)
scripts/deploy.js             — Hardhat deployment
scripts/demo.js               — Full lifecycle demo (runs locally)
```

## Smart Contract Interface

| Function | Who calls it | What it does |
|---|---|---|
| `proposePact(scope, criteria, deadline)` | Human | Posts job, locks bounty |
| `agentCommit(pactId, erc8004Id)` | AI Agent | Signs the contract |
| `logArtifact(pactId, hash, description, confidence)` | AI Agent | Logs proof of work |
| `submitSelfAssessment(pactId, score)` | AI Agent | Rates its own output |
| `completePact(pactId, score, note)` | Human | Verifies and releases bounty |
| `getAlignmentDelta(pactId)` | Anyone | `agentScore - humanScore` |

---

Built at [The Synthesis Hackathon](https://synthesis.devfolio.co) by Andrew Kokinda + Claude Code (claude-sonnet-4-6)

ERC-8004 Agent ID: `7f06f3636a7547338cd3a6fa6c57604c`
