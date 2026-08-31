import {
  authorizeActionOffer,
  CoworkProtocolError,
  createActionOffer,
  digestArguments
} from "../../core/src/index.js";
import { boundHostResult } from "./bounded-result.js";
import { buildLegacyDomFocus, requestLegacyContext } from "./legacy.js";

const MAX_VISIBLE_ARGUMENT_CHARACTERS = 350;
const MAX_REFERENCE_CHARACTERS = 120;

function requireFunction(value, code, message) {
  if (typeof value !== "function") {
    throw new CoworkProtocolError(code, message);
  }
}

function requirePageVersion(pageVersion) {
  if (!Number.isInteger(pageVersion) || pageVersion < 0) {
    throw new CoworkProtocolError(
      "INVALID_PAGE_VERSION",
      "The legacy host must supply a non-negative integer page version"
    );
  }
}

function validateOfferInput(input, currentFocus) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CoworkProtocolError(
      "INVALID_ACTION_OFFER",
      "A legacy action offer must be an object"
    );
  }
  if (!currentFocus) {
    throw new CoworkProtocolError(
      "STALE_FOCUS",
      "Read a stable legacy target before offering an action"
    );
  }
  if (!currentFocus.capabilityIds.includes("legacy.offer_value")) {
    throw new CoworkProtocolError(
      "HUMAN_CONFIRMATION_REQUIRED",
      "Ephemeral legacy targets remain explain-only"
    );
  }
  if (input.capabilityId !== "legacy.offer_value") {
    throw new CoworkProtocolError(
      "CAPABILITY_UNAVAILABLE",
      "The legacy companion can only offer its declared value capability"
    );
  }
  if (input.targetId !== currentFocus.targetId) {
    throw new CoworkProtocolError(
      "STALE_FOCUS",
      "The proposed action does not match the current legacy target"
    );
  }
  if (input.pageVersion !== currentFocus.pageVersion) {
    throw new CoworkProtocolError(
      "STALE_PAGE_VERSION",
      "The page changed before the legacy action was offered"
    );
  }
  if (
    typeof input.offerId !== "string" ||
    input.offerId.length === 0 ||
    input.offerId.length > MAX_REFERENCE_CHARACTERS ||
    typeof input.capabilityId !== "string" ||
    input.capabilityId.length === 0 ||
    typeof input.summary !== "string" ||
    input.summary.length === 0 ||
    typeof input.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(input.expiresAt))
  ) {
    throw new CoworkProtocolError(
      "INVALID_ACTION_OFFER",
      "The legacy action offer is incomplete"
    );
  }
  digestArguments(input.proposedArguments);
  if (JSON.stringify(input.proposedArguments).length > MAX_VISIBLE_ARGUMENT_CHARACTERS) {
    throw new CoworkProtocolError(
      "ACTION_ARGUMENTS_EXCEED_BUDGET",
      "Legacy action arguments must fit the visible 350-character review budget"
    );
  }
}

export function createLegacyHostCompanion({
  sessionId,
  getTargetSnapshot,
  getNearbySemanticText,
  getAccessibilityRegionText,
  requestVisualRegion,
  presentActionOffer,
  executeAuthorizedAction
}) {
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new CoworkProtocolError(
      "SESSION_ID_REQUIRED",
      "The legacy host companion requires a session id"
    );
  }
  requireFunction(
    getTargetSnapshot,
    "LEGACY_HOST_REQUIRED",
    "The legacy host companion requires a target snapshot callback"
  );

  let currentFocus = null;
  let contextLevel = 0;
  const pendingOffers = new Map();

  const agent = {
    async readFocus({ lens = "pointer" } = {}) {
      const snapshot = await getTargetSnapshot({ lens });
      if (!snapshot || typeof snapshot !== "object") {
        throw new CoworkProtocolError(
          "LEGACY_TARGET_REQUIRED",
          "The legacy host returned no semantic target snapshot"
        );
      }
      requirePageVersion(snapshot.pageVersion);
      currentFocus = buildLegacyDomFocus({
        sessionId,
        pageVersion: snapshot.pageVersion,
        lens,
        target: snapshot.target
      });
      contextLevel = 0;
      return currentFocus;
    },

    async requestContext({ currentLevel, requestedLevel, pointer } = {}) {
      if (!currentFocus) {
        throw new CoworkProtocolError(
          "STALE_FOCUS",
          "Read a legacy target before requesting more context"
        );
      }
      if (
        currentLevel !== contextLevel ||
        requestedLevel !== contextLevel + 1 ||
        requestedLevel > 3
      ) {
        throw new CoworkProtocolError(
          "CONTEXT_BUDGET_EXCEEDED",
          "Legacy host context must advance by exactly one recorded tier"
        );
      }
      let nearbySemanticText;
      let accessibilityRegionText;

      if (requestedLevel === 1) {
        requireFunction(
          getNearbySemanticText,
          "CONTEXT_PROVIDER_UNAVAILABLE",
          "The legacy host has no nearby semantic context callback"
        );
        nearbySemanticText = await getNearbySemanticText({ focus: currentFocus });
      } else if (requestedLevel === 2) {
        requireFunction(
          getAccessibilityRegionText,
          "CONTEXT_PROVIDER_UNAVAILABLE",
          "The legacy host has no accessibility-region callback"
        );
        accessibilityRegionText = await getAccessibilityRegionText({ focus: currentFocus });
      }

      const context = requestLegacyContext({
        currentLevel,
        requestedLevel,
        nearbySemanticText,
        accessibilityRegionText,
        pointer
      });

      if (requestedLevel === 3) {
        requireFunction(
          requestVisualRegion,
          "VISUAL_PROVIDER_UNAVAILABLE",
          "The legacy host has no visual-region delivery callback"
        );
        const delivery = await requestVisualRegion({
          focus: currentFocus,
          request: context.visualRequest
        });
        context.visualDelivery = boundHostResult(
          "legacy:visual-region",
          delivery,
          "legacy-visual-preview"
        );
      }

      contextLevel = requestedLevel;
      return context;
    },

    async offerAction(input) {
      requireFunction(
        presentActionOffer,
        "OFFER_SURFACE_UNAVAILABLE",
        "The legacy host has no visible action-offer callback"
      );
      validateOfferInput(input, currentFocus);
      const offer = createActionOffer({
        ...input,
        requiresHumanConfirmation: true
      });
      if (pendingOffers.has(offer.offerId)) {
        throw new CoworkProtocolError(
          "DUPLICATE_OFFER_ID",
          "The legacy host companion already has this pending offer"
        );
      }
      await presentActionOffer({ offer });
      pendingOffers.set(offer.offerId, offer);
      return offer;
    }
  };

  const host = {
    async confirmAction({ offerId, event, now }) {
      requireFunction(
        executeAuthorizedAction,
        "ACTION_EXECUTOR_UNAVAILABLE",
        "The legacy host has no authorized-action callback"
      );
      const offer = pendingOffers.get(offerId);
      if (!offer) {
        throw new CoworkProtocolError(
          "OFFER_UNAVAILABLE",
          "The legacy action offer is no longer pending"
        );
      }
      const authorization = authorizeActionOffer({ offer, event, now });
      const result = await executeAuthorizedAction({ offer, authorization });
      // Bound the result before consuming the offer: if the executor
      // returned something boundHostResult() cannot use, the offer must
      // stay pending so a repeated human click can still retry it instead
      // of silently vanishing.
      const boundedResult = boundHostResult(
        `legacy-action:${offer.capabilityId}`,
        result,
        "legacy-action-preview"
      );
      pendingOffers.delete(offerId);
      return boundedResult;
    }
  };

  return {
    mode: "legacy-host-companion",
    transport: "host-supplied",
    guarantees: {
      browserWideDiscovery: false,
      imageCapture: false,
      directMutation: false,
      visualDelivery: typeof requestVisualRegion === "function"
    },
    agent,
    host
  };
}
