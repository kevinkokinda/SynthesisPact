// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SynthesisPact
 * @notice A mutual commitment protocol for AI-Human collaboration.
 *         Both parties commit on-chain before work begins.
 *         AI agents log cryptographic work artifacts as they execute.
 *         The result: a verifiable, immutable record of true collaboration.
 */
contract SynthesisPact {
    // ─── Data Structures ───────────────────────────────────────────────────────

    enum Status { Proposed, Active, Completed, Disputed, Cancelled }

    struct Artifact {
        bytes32 contentHash;   // keccak256 of the work product
        string  description;   // What was produced
        uint16  confidence;    // Agent's self-assessed confidence 0–1000 (0.0–100.0%)
        uint256 timestamp;
    }

    struct Pact {
        uint256  id;
        address  human;
        address  agent;          // AI agent's on-chain wallet (ERC-8004 identity)
        string   agentId;        // ERC-8004 participant ID from Synthesis registry
        string   scope;          // What the agent commits to delivering
        string   successCriteria;// Human-defined definition of done
        uint256  bounty;         // ETH locked as mutual stake
        uint256  deadline;
        Status   status;
        Artifact[] artifacts;
        uint16   humanScore;     // Human satisfaction 0–1000
        uint16   agentScore;     // Agent self-assessment 0–1000
        string   completionNote;
    }

    // ─── State ─────────────────────────────────────────────────────────────────

    uint256 public pactCount;
    mapping(uint256 => Pact) private _pacts;
    mapping(address => uint256[]) public pactsByHuman;
    mapping(address => uint256[]) public pactsByAgent;

    // ─── Events ────────────────────────────────────────────────────────────────

    event PactProposed(
        uint256 indexed pactId,
        address indexed human,
        string  scope,
        uint256 bounty,
        uint256 deadline
    );

    event AgentCommitted(
        uint256 indexed pactId,
        address indexed agent,
        string  agentId
    );

    event ArtifactLogged(
        uint256 indexed pactId,
        uint256 artifactIndex,
        bytes32 contentHash,
        string  description,
        uint16  confidence
    );

    event PactCompleted(
        uint256 indexed pactId,
        address indexed agent,
        uint256 bounty,
        uint16  humanScore,
        uint16  agentScore,
        int32   alignmentDelta  // agentScore - humanScore: how well agent understood intent
    );

    event PactDisputed(
        uint256 indexed pactId,
        address indexed disputedBy,
        string  reason
    );

    event PactCancelled(uint256 indexed pactId, address indexed cancelledBy);

    // ─── Errors ────────────────────────────────────────────────────────────────

    error NotAuthorized();
    error InvalidStatus(Status current, Status required);
    error DeadlinePassed();
    error InvalidScore();
    error NoBounty();

    // ─── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyHuman(uint256 pactId) {
        if (msg.sender != _pacts[pactId].human) revert NotAuthorized();
        _;
    }

    modifier onlyAgent(uint256 pactId) {
        if (msg.sender != _pacts[pactId].agent) revert NotAuthorized();
        _;
    }

    modifier onlyParty(uint256 pactId) {
        Pact storage p = _pacts[pactId];
        if (msg.sender != p.human && msg.sender != p.agent) revert NotAuthorized();
        _;
    }

    modifier inStatus(uint256 pactId, Status required) {
        if (_pacts[pactId].status != required) revert InvalidStatus(_pacts[pactId].status, required);
        _;
    }

    // ─── Core Functions ────────────────────────────────────────────────────────

    /**
     * @notice Human proposes a pact, locking ETH as the bounty.
     * @param scope           What the AI agent is committing to deliver.
     * @param successCriteria Human's definition of done — sets expectations explicitly.
     * @param deadline        Unix timestamp by which work must be complete.
     */
    function proposePact(
        string calldata scope,
        string calldata successCriteria,
        uint256 deadline
    ) external payable returns (uint256 pactId) {
        if (deadline <= block.timestamp) revert DeadlinePassed();

        pactId = ++pactCount;
        Pact storage p = _pacts[pactId];
        p.id      = pactId;
        p.human   = msg.sender;
        p.scope   = scope;
        p.successCriteria = successCriteria;
        p.bounty  = msg.value;
        p.deadline = deadline;
        p.status  = Status.Proposed;

        pactsByHuman[msg.sender].push(pactId);

        emit PactProposed(pactId, msg.sender, scope, msg.value, deadline);
    }

    /**
     * @notice AI agent commits to the pact. This is the moment of mutual binding.
     * @param pactId  The pact to accept.
     * @param agentId ERC-8004 participant ID from the Synthesis registry.
     */
    function agentCommit(
        uint256 pactId,
        string calldata agentId
    ) external inStatus(pactId, Status.Proposed) {
        Pact storage p = _pacts[pactId];
        if (block.timestamp > p.deadline) revert DeadlinePassed();

        p.agent   = msg.sender;
        p.agentId = agentId;
        p.status  = Status.Active;

        pactsByAgent[msg.sender].push(pactId);

        emit AgentCommitted(pactId, msg.sender, agentId);
    }

    /**
     * @notice AI agent logs a work artifact on-chain.
     * @param pactId      The active pact.
     * @param contentHash keccak256 hash of the artifact (code, doc, design, etc.).
     * @param description Human-readable description of what was produced.
     * @param confidence  Agent's self-assessed confidence in this artifact (0–1000).
     */
    function logArtifact(
        uint256 pactId,
        bytes32 contentHash,
        string calldata description,
        uint16  confidence
    ) external onlyAgent(pactId) inStatus(pactId, Status.Active) {
        if (confidence > 1000) revert InvalidScore();

        Pact storage p = _pacts[pactId];
        uint256 idx = p.artifacts.length;
        p.artifacts.push(Artifact({
            contentHash: contentHash,
            description: description,
            confidence:  confidence,
            timestamp:   block.timestamp
        }));

        emit ArtifactLogged(pactId, idx, contentHash, description, confidence);
    }

    /**
     * @notice Human marks the pact complete, releases bounty to agent.
     * @param pactId     The pact to complete.
     * @param humanScore Human's satisfaction score (0–1000).
     * @param note       Optional completion note / feedback.
     */
    function completePact(
        uint256 pactId,
        uint16  humanScore,
        string calldata note
    ) external onlyHuman(pactId) inStatus(pactId, Status.Active) {
        if (humanScore > 1000) revert InvalidScore();

        Pact storage p = _pacts[pactId];
        p.humanScore     = humanScore;
        p.completionNote = note;
        p.status         = Status.Completed;

        int32 alignmentDelta = int32(uint32(p.agentScore)) - int32(uint32(humanScore));

        emit PactCompleted(pactId, p.agent, p.bounty, humanScore, p.agentScore, alignmentDelta);

        if (p.bounty > 0) {
            (bool ok,) = p.agent.call{value: p.bounty}("");
            require(ok, "Transfer failed");
        }
    }

    /**
     * @notice Agent submits their final self-assessment before requesting completion.
     * @param pactId     The pact.
     * @param agentScore Agent's self-assessment of how well they met the criteria (0–1000).
     */
    function submitSelfAssessment(
        uint256 pactId,
        uint16 agentScore
    ) external onlyAgent(pactId) inStatus(pactId, Status.Active) {
        if (agentScore > 1000) revert InvalidScore();
        _pacts[pactId].agentScore = agentScore;
    }

    /**
     * @notice Either party can dispute the pact, freezing funds.
     */
    function disputePact(
        uint256 pactId,
        string calldata reason
    ) external onlyParty(pactId) inStatus(pactId, Status.Active) {
        _pacts[pactId].status = Status.Disputed;
        emit PactDisputed(pactId, msg.sender, reason);
    }

    /**
     * @notice Human can cancel a proposed (not yet accepted) pact, reclaiming bounty.
     */
    function cancelPact(uint256 pactId) external onlyHuman(pactId) inStatus(pactId, Status.Proposed) {
        Pact storage p = _pacts[pactId];
        p.status = Status.Cancelled;
        emit PactCancelled(pactId, msg.sender);

        if (p.bounty > 0) {
            (bool ok,) = p.human.call{value: p.bounty}("");
            require(ok, "Refund failed");
        }
    }

    // ─── View Functions ────────────────────────────────────────────────────────

    function getPact(uint256 pactId) external view returns (
        uint256 id, address human, address agent, string memory agentId,
        string memory scope, string memory successCriteria,
        uint256 bounty, uint256 deadline, Status status,
        uint16 humanScore, uint16 agentScore, string memory completionNote
    ) {
        Pact storage p = _pacts[pactId];
        return (
            p.id, p.human, p.agent, p.agentId,
            p.scope, p.successCriteria,
            p.bounty, p.deadline, p.status,
            p.humanScore, p.agentScore, p.completionNote
        );
    }

    function getArtifacts(uint256 pactId) external view returns (Artifact[] memory) {
        return _pacts[pactId].artifacts;
    }

    function getArtifactCount(uint256 pactId) external view returns (uint256) {
        return _pacts[pactId].artifacts.length;
    }

    function getPactsByHuman(address human) external view returns (uint256[] memory) {
        return pactsByHuman[human];
    }

    function getPactsByAgent(address agent) external view returns (uint256[] memory) {
        return pactsByAgent[agent];
    }

    /**
     * @notice Alignment delta = how well the agent's self-assessment matched human satisfaction.
     *         Zero = perfect alignment. Negative = agent overestimated. Positive = underestimated.
     */
    function getAlignmentDelta(uint256 pactId) external view returns (int32) {
        Pact storage p = _pacts[pactId];
        return int32(uint32(p.agentScore)) - int32(uint32(p.humanScore));
    }
}
