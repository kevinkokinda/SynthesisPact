import { createPublicClient, createWalletClient, http, parseEther, formatEther, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

// ─── ABI ──────────────────────────────────────────────────────────────────────
const ABI = [
  { name: "proposePact", type: "function", stateMutability: "payable",
    inputs: [{ name: "scope", type: "string" }, { name: "successCriteria", type: "string" }, { name: "deadline", type: "uint256" }],
    outputs: [{ name: "pactId", type: "uint256" }] },
  { name: "agentCommit", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "pactId", type: "uint256" }, { name: "agentId", type: "string" }], outputs: [] },
  { name: "logArtifact", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "pactId", type: "uint256" }, { name: "contentHash", type: "bytes32" }, { name: "description", type: "string" }, { name: "confidence", type: "uint16" }], outputs: [] },
  { name: "submitSelfAssessment", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "pactId", type: "uint256" }, { name: "agentScore", type: "uint16" }], outputs: [] },
  { name: "completePact", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "pactId", type: "uint256" }, { name: "humanScore", type: "uint16" }, { name: "note", type: "string" }], outputs: [] },
  { name: "disputePact", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "pactId", type: "uint256" }, { name: "reason", type: "string" }], outputs: [] },
  { name: "getPact", type: "function", stateMutability: "view",
    inputs: [{ name: "pactId", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" }, { name: "human", type: "address" }, { name: "agent", type: "address" },
      { name: "agentId", type: "string" }, { name: "scope", type: "string" }, { name: "successCriteria", type: "string" },
      { name: "bounty", type: "uint256" }, { name: "deadline", type: "uint256" }, { name: "status", type: "uint8" },
      { name: "humanScore", type: "uint16" }, { name: "agentScore", type: "uint16" }, { name: "completionNote", type: "string" }
    ] },
  { name: "getArtifacts", type: "function", stateMutability: "view",
    inputs: [{ name: "pactId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple[]", components: [
      { name: "contentHash", type: "bytes32" }, { name: "description", type: "string" },
      { name: "confidence", type: "uint16" }, { name: "timestamp", type: "uint256" }
    ]}] },
  { name: "pactCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "getAlignmentDelta", type: "function", stateMutability: "view",
    inputs: [{ name: "pactId", type: "uint256" }], outputs: [{ name: "", type: "int32" }] },
];

const STATUS = ["Proposed", "Active", "Completed", "Disputed", "Cancelled"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cors(response) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

function json(data, status = 200) {
  return cors(new Response(JSON.stringify(data, (_, v) => typeof v === "bigint" ? v.toString() : v), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

function getClients(env) {
  const account = privateKeyToAccount(env.AGENT_PRIVATE_KEY);
  const transport = http(env.RPC_URL || "https://mainnet.base.org");
  const publicClient = createPublicClient({ chain: base, transport });
  const walletClient = createWalletClient({ account, chain: base, transport });
  return { account, publicClient, walletClient };
}

function contractAddress(env) {
  return env.CONTRACT_ADDRESS;
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

async function handleGetPact(pactId, env) {
  const { publicClient } = getClients(env);
  const addr = contractAddress(env);
  const [pact, artifacts] = await Promise.all([
    publicClient.readContract({ address: addr, abi: ABI, functionName: "getPact", args: [BigInt(pactId)] }),
    publicClient.readContract({ address: addr, abi: ABI, functionName: "getArtifacts", args: [BigInt(pactId)] }),
  ]);
  return json({
    id: pact[0].toString(),
    human: pact[1],
    agent: pact[2],
    agentId: pact[3],
    scope: pact[4],
    successCriteria: pact[5],
    bounty: formatEther(pact[6]),
    deadline: new Date(Number(pact[7]) * 1000).toISOString(),
    status: STATUS[pact[8]] || "Unknown",
    humanScore: Number(pact[9]) / 10,
    agentScore: Number(pact[10]) / 10,
    completionNote: pact[11],
    artifacts: artifacts.map(a => ({
      contentHash: a.contentHash,
      description: a.description,
      confidence: Number(a.confidence) / 10,
      timestamp: new Date(Number(a.timestamp) * 1000).toISOString(),
    })),
  });
}

async function handleListPacts(env) {
  const { publicClient } = getClients(env);
  const addr = contractAddress(env);
  const total = await publicClient.readContract({ address: addr, abi: ABI, functionName: "pactCount" });
  return json({ total: total.toString(), contract: addr, chain: "base-mainnet" });
}

async function handlePropose(body, env) {
  const { scope, successCriteria, days, bountyEth } = body;
  if (!scope || !successCriteria) return err("scope and successCriteria required");
  const { walletClient, publicClient, account } = getClients(env);
  const addr = contractAddress(env);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + (parseInt(days) || 7) * 86400);
  const value = parseEther(bountyEth?.toString() || "0");
  const hash = await walletClient.writeContract({
    address: addr, abi: ABI, functionName: "proposePact",
    args: [scope, successCriteria, deadline], value,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  const total = await publicClient.readContract({ address: addr, abi: ABI, functionName: "pactCount" });
  return json({ pactId: total.toString(), txHash: hash, status: "Proposed" });
}

async function handleCommit(body, env) {
  const { pactId } = body;
  if (!pactId) return err("pactId required");
  const { walletClient, publicClient } = getClients(env);
  const addr = contractAddress(env);
  const hash = await walletClient.writeContract({
    address: addr, abi: ABI, functionName: "agentCommit",
    args: [BigInt(pactId), env.PARTICIPANT_ID || ""],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return json({ pactId: pactId.toString(), txHash: hash, status: "Active" });
}

async function handleLog(body, env) {
  const { pactId, content, description, confidence } = body;
  if (!pactId || !content || !description) return err("pactId, content, description required");
  const { walletClient, publicClient } = getClients(env);
  const addr = contractAddress(env);
  const contentHash = keccak256(toBytes(content));
  const conf = Math.round(parseFloat(confidence || 90) * 10);
  const hash = await walletClient.writeContract({
    address: addr, abi: ABI, functionName: "logArtifact",
    args: [BigInt(pactId), contentHash, description, conf],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return json({ pactId: pactId.toString(), txHash: hash, contentHash, confidence: conf / 10 });
}

async function handleAssess(body, env) {
  const { pactId, score } = body;
  if (!pactId || score === undefined) return err("pactId and score required");
  const { walletClient, publicClient } = getClients(env);
  const addr = contractAddress(env);
  const s = Math.round(parseFloat(score) * 10);
  const hash = await walletClient.writeContract({
    address: addr, abi: ABI, functionName: "submitSelfAssessment",
    args: [BigInt(pactId), s],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return json({ pactId: pactId.toString(), txHash: hash, agentScore: score });
}

async function handleComplete(body, env) {
  const { pactId, score, note } = body;
  if (!pactId || score === undefined) return err("pactId and score required");
  const { walletClient, publicClient } = getClients(env);
  const addr = contractAddress(env);
  const s = Math.round(parseFloat(score) * 10);
  const hash = await walletClient.writeContract({
    address: addr, abi: ABI, functionName: "completePact",
    args: [BigInt(pactId), s, note || ""],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return json({ pactId: pactId.toString(), txHash: hash, humanScore: score, status: "Completed" });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    try {
      // GET /pacts
      if (method === "GET" && path === "/pacts") return handleListPacts(env);

      // GET /pacts/:id
      const pactMatch = path.match(/^\/pacts\/(\d+)$/);
      if (method === "GET" && pactMatch) return handleGetPact(pactMatch[1], env);

      // GET / — health + docs
      if (method === "GET" && path === "/") {
        return json({
          name: "SynthesisPact API",
          contract: env.CONTRACT_ADDRESS,
          chain: "base-mainnet",
          agentId: env.PARTICIPANT_ID,
          endpoints: {
            "GET  /pacts":          "List all pacts",
            "GET  /pacts/:id":      "Get pact details + artifacts",
            "POST /propose":        "{ scope, successCriteria, days?, bountyEth? }",
            "POST /commit":         "{ pactId }",
            "POST /log":            "{ pactId, content, description, confidence? }",
            "POST /assess":         "{ pactId, score }",
            "POST /complete":       "{ pactId, score, note? }",
          },
        });
      }

      if (method !== "POST") return err("Not found", 404);

      let body = {};
      try { body = await request.json(); } catch {}

      if (path === "/propose")  return handlePropose(body, env);
      if (path === "/commit")   return handleCommit(body, env);
      if (path === "/log")      return handleLog(body, env);
      if (path === "/assess")   return handleAssess(body, env);
      if (path === "/complete") return handleComplete(body, env);

      return err("Not found", 404);
    } catch (e) {
      return err(e.message || "Internal error", 500);
    }
  },
};
