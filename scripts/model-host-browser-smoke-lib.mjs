function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateModelHostBrowserObservation(observed) {
  requireCondition(
    observed && typeof observed === "object",
    "A browser model-host observation is required"
  );
  const turn = observed.receivedTurn;
  const turnKeys = turn && typeof turn === "object" ? Object.keys(turn).sort() : [];
  requireCondition(
    JSON.stringify(turnKeys) ===
      JSON.stringify(["focus", "metrics", "presence", "protocolVersion", "transcript", "type"]) &&
      turn.type === "conversation-turn" &&
      turn.protocolVersion === "0.1" &&
      turn.focus?.targetId === "form-field:full-name" &&
      !Object.hasOwn(turn, "pageHtml") &&
      Number.isInteger(observed.packetCharacters) &&
      observed.packetCharacters > 0 &&
      observed.packetCharacters <= 1200,
    "The model host must receive only the exact bounded turn"
  );
  requireCondition(
    observed.transportLabel === "Connected model bridge" &&
      typeof observed.browserVersion === "string" &&
      observed.browserVersion.length > 0,
    "The live browser must discover the same-origin model bridge"
  );
  requireCondition(
    observed.visibleOfferValue === "Grace Hopper" &&
      observed.valueBeforeHumanClick === "" &&
      observed.valueAfterHumanClick === "Grace Hopper" &&
      typeof observed.receiptText === "string" &&
      /applied|verified/i.test(observed.receiptText),
    "The suggested value must remain unapplied until a human click"
  );
  requireCondition(
    JSON.stringify(observed.browserRequestKeys) ===
      JSON.stringify(["protocolVersion", "turn"]) &&
      observed.authorizationHeaderPresent === false,
    "The browser request must not contain credentials or provider configuration"
  );

  return {
    modelHostClaim: true,
    externalModelClaim: false,
    connectedModelClaim: false,
    browserVersion: observed.browserVersion,
    packetCharacters: observed.packetCharacters,
    clickGatedOffer: true,
    browserCredentials: false
  };
}
