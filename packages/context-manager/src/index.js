const PROTOCOL_VERSION = "0.1";
const MAX_HANDOFF_CHARACTERS = 1_200;

function boundedText(value, limit) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!Number.isInteger(limit) || limit <= 0) return "";
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1))}…`;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function validText(value, maximum) {
  return typeof value === "string" && value.trim() !== "" && value.length <= maximum;
}

function normalizeTurn({ turnId, role, text, at, causeRefs = [] }, maxTurnCharacters) {
  if (
    !validText(turnId, 160) ||
    !["human", "assistant"].includes(role) ||
    typeof text !== "string" ||
    !validText(at, 80) ||
    !Number.isFinite(Date.parse(at)) ||
    !Array.isArray(causeRefs) ||
    causeRefs.length > 6 ||
    causeRefs.some((reference) => !validText(reference, 160))
  ) {
    throw new TypeError("A bounded context turn requires valid id, role, text, time, and cause refs");
  }
  return {
    turnId,
    role,
    text: boundedText(text, maxTurnCharacters),
    at,
    causeRefs: [...causeRefs]
  };
}

export function createCoworkContextManager({
  sessionId,
  maxRecentTurns = 6,
  maxTurnCharacters = 400,
  maxSummaryCharacters = 600,
  initialContext = null
}) {
  if (
    !validText(sessionId, 80) ||
    !Number.isInteger(maxRecentTurns) ||
    maxRecentTurns < 1 ||
    maxRecentTurns > 20 ||
    !Number.isInteger(maxTurnCharacters) ||
    maxTurnCharacters < 40 ||
    maxTurnCharacters > 800 ||
    !Number.isInteger(maxSummaryCharacters) ||
    maxSummaryCharacters < 80 ||
    maxSummaryCharacters > 1200
  ) {
    throw new TypeError("Context Manager limits or session id are invalid");
  }
  let revision = initialContext?.revision ?? 0;
  let summary = initialContext?.summary ?? "";
  let summaryThroughTurnId = initialContext?.summaryThroughTurnId ?? null;
  let recentTurns = cloneJson(initialContext?.recentTurns ?? []);

  function appendTurn(input) {
    recentTurns.push(normalizeTurn(input, maxTurnCharacters));
    revision += 1;

    while (recentTurns.length > maxRecentTurns) {
      const compacted = recentTurns.shift();
      const label = compacted.role === "assistant" ? "Assistant" : "Human";
      summary = boundedText(
        [summary, `${label}: ${compacted.text}`].filter(Boolean).join(" "),
        maxSummaryCharacters
      );
      summaryThroughTurnId = compacted.turnId;
    }
    return readContext();
  }

  function readContext() {
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: "context-snapshot",
      sessionId,
      revision,
      summary,
      summaryThroughTurnId,
      recentTurns: cloneJson(recentTurns)
    };
  }

  function readModelContext({ maxCharacters = 1_200 } = {}) {
    if (!Number.isInteger(maxCharacters) || maxCharacters < 240 || maxCharacters > 1_200) {
      throw new RangeError("Model context budget must be between 240 and 1,200 characters");
    }
    const projectedTurns = recentTurns.map(({ turnId, role, text, causeRefs }) => ({
      turnId,
      role,
      text,
      causeRefs: [...causeRefs]
    }));
    const result = {
      protocolVersion: PROTOCOL_VERSION,
      type: "model-context",
      sessionId,
      revision,
      summary: "",
      omittedRecentTurnCount: projectedTurns.length,
      recentTurns: []
    };
    if (summaryThroughTurnId !== null) {
      const candidate = { ...result, summaryThroughTurnId };
      if (JSON.stringify(candidate).length <= maxCharacters) {
        result.summaryThroughTurnId = summaryThroughTurnId;
      }
    }
    let lower = 0;
    let upper = summary.length;
    while (lower < upper) {
      const midpoint = Math.ceil((lower + upper) / 2);
      const candidate = { ...result, summary: boundedText(summary, midpoint) };
      if (JSON.stringify(candidate).length <= maxCharacters) lower = midpoint;
      else upper = midpoint - 1;
    }
    result.summary = boundedText(summary, lower);
    if (JSON.stringify(result).length > maxCharacters) {
      throw new RangeError("Model context metadata exceeds its requested character budget");
    }
    for (let index = projectedTurns.length - 1; index >= 0; index -= 1) {
      const candidate = {
        ...result,
        omittedRecentTurnCount: index,
        recentTurns: [projectedTurns[index], ...result.recentTurns]
      };
      if (JSON.stringify(candidate).length > maxCharacters) break;
      result.omittedRecentTurnCount = index;
      result.recentTurns = candidate.recentTurns;
    }
    return cloneJson(result);
  }

  return { appendTurn, readContext, readModelContext };
}

export function restoreCoworkContextManager({
  snapshot,
  maxRecentTurns = 6,
  maxTurnCharacters = 400,
  maxSummaryCharacters = 600
}) {
  if (
    snapshot?.protocolVersion !== PROTOCOL_VERSION ||
    snapshot?.type !== "context-snapshot" ||
    !validText(snapshot.sessionId, 80) ||
    !Number.isInteger(snapshot.revision) ||
    snapshot.revision < 0 ||
    typeof snapshot.summary !== "string" ||
    snapshot.summary.length > maxSummaryCharacters ||
    !(
      snapshot.summaryThroughTurnId === null ||
      validText(snapshot.summaryThroughTurnId, 160)
    ) ||
    !Array.isArray(snapshot.recentTurns) ||
    snapshot.recentTurns.length > maxRecentTurns ||
    snapshot.recentTurns.some(
      (turn) =>
        (() => {
          try {
            normalizeTurn(turn, maxTurnCharacters);
            return false;
          } catch {
            return true;
          }
        })()
    )
  ) {
    throw new TypeError("Restoring Cowork context requires one valid bounded snapshot");
  }
  return createCoworkContextManager({
    sessionId: snapshot.sessionId,
    maxRecentTurns,
    maxTurnCharacters,
    maxSummaryCharacters,
    initialContext: cloneJson(snapshot)
  });
}

function boundedList(values, itemLimit, countLimit) {
  if (!Array.isArray(values)) return [];
  return values.slice(-countLimit).map((value) => boundedText(value, itemLimit));
}

export function createHandoffCapsule({
  snapshot,
  context,
  focus = null,
  completed = [],
  openItems = [],
  decisionsNeeded = []
}) {
  const lease = snapshot.state?.lease ?? null;
  const capsule = {
    protocolVersion: PROTOCOL_VERSION,
    type: "handoff-capsule",
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    goal: boundedText(lease?.goal, 120),
    contextSummary: boundedText(context?.summary, 240),
    completed: boundedList(completed, 120, 3),
    focus:
      focus === null
        ? null
        : {
            targetId: boundedText(focus.targetId, 120),
            label: boundedText(focus.label, 160),
            pageVersion: focus.pageVersion
          },
    openItems: boundedList(openItems, 120, 3),
    soloRights:
      lease === null
        ? null
        : {
            leaseId: boundedText(lease.leaseId, 120),
            expiresAt: boundedText(lease.expiresAt, 80),
            capabilities: boundedList(lease.capabilities, 80, 4)
          },
    decisionsNeeded: boundedList(decisionsNeeded, 120, 3)
  };
  if (JSON.stringify(capsule).length > MAX_HANDOFF_CHARACTERS) {
    throw new RangeError("Cowork handoff capsules are limited to 1,200 JSON characters");
  }
  return capsule;
}
