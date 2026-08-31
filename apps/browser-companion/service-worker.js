import { computeVisualCrop } from "./modules/apps/browser-companion/src/protocol.js";

const MAX_STORED_REGIONS = 4;
const storedRegions = new Map();
let lastPageTabId = null;

function removeOldestRegion() {
  const oldest = storedRegions.keys().next().value;
  if (oldest) storedRegions.delete(oldest);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function cropVisibleTab(message, sender) {
  const request = message?.request;
  const viewport = message?.viewport;
  if (
    !sender.tab ||
    request?.kind !== "pointer-region" ||
    !Number.isFinite(request.center?.x) ||
    !Number.isFinite(request.center?.y) ||
    request.maximumWidth > 400 ||
    request.maximumHeight > 400 ||
    request.maximumPixelArea > 160000 ||
    !Number.isFinite(viewport?.width) ||
    !Number.isFinite(viewport?.height)
  ) {
    throw new Error("INVALID_VISUAL_REQUEST");
  }

  const fullDataUrl = await Promise.race([
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("VISUAL_CAPTURE_TIMEOUT")), 25000)
    )
  ]);
  const fullBlob = await (await fetch(fullDataUrl)).blob();
  const bitmap = await createImageBitmap(fullBlob);
  const crop = computeVisualCrop({
    center: request.center,
    maximumWidth: request.maximumWidth,
    maximumHeight: request.maximumHeight,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    bitmapWidth: bitmap.width,
    bitmapHeight: bitmap.height
  });
  const canvas = new OffscreenCanvas(crop.output.width, crop.output.height);
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(
    bitmap,
    crop.source.x,
    crop.source.y,
    crop.source.width,
    crop.source.height,
    0,
    0,
    crop.output.width,
    crop.output.height
  );
  bitmap.close();
  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await croppedBlob.arrayBuffer());
  const referenceId = `pointer-region:${crypto.randomUUID()}`;
  if (storedRegions.size >= MAX_STORED_REGIONS) removeOldestRegion();
  storedRegions.set(referenceId, {
    dataUrl: `data:image/png;base64,${bytesToBase64(bytes)}`,
    referenceId,
    width: crop.output.width,
    height: crop.output.height,
    mimeType: "image/png",
    createdAt: Date.now()
  });
  return {
    referenceId,
    width: crop.output.width,
    height: crop.output.height,
    pixelArea: crop.output.width * crop.output.height,
    mimeType: "image/png",
    delivery: "extension-memory",
    source: "pointer-region"
  };
}

function consumeVisualRegion(message) {
  const referenceId = message?.referenceId;
  if (
    typeof referenceId !== "string" ||
    !/^pointer-region:[0-9a-f-]{36}$/i.test(referenceId)
  ) {
    throw new Error("INVALID_VISUAL_REFERENCE");
  }
  const stored = storedRegions.get(referenceId);
  if (!stored) throw new Error("VISUAL_REFERENCE_UNAVAILABLE");
  storedRegions.delete(referenceId);
  return {
    referenceId: stored.referenceId,
    width: stored.width,
    height: stored.height,
    mimeType: stored.mimeType,
    dataUrl: stored.dataUrl
  };
}

async function setBadge(tabId, enabled) {
  await chrome.action.setBadgeText({
    tabId,
    text: enabled ? "ON" : ""
  });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: "#0f766e" });
}

async function resolvePageTabId(sender) {
  const senderUrl = sender?.url ?? sender?.tab?.url ?? "";
  if (Number.isInteger(sender?.tab?.id) && !senderUrl.includes("-extension://")) {
    lastPageTabId = sender.tab.id;
    return lastPageTabId;
  }
  if (Number.isInteger(lastPageTabId)) return lastPageTabId;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!Number.isInteger(tab?.id)) throw new Error("PAGE_TAB_UNAVAILABLE");
  lastPageTabId = tab.id;
  return lastPageTabId;
}

async function sidePanelOperation(message, sender) {
  const tabId = await resolvePageTabId(sender);
  if (message.type === "cowork:sidepanel:get-state") {
    return { ok: true, state: await chrome.tabs.sendMessage(tabId, { type: "cowork:get-state" }) };
  }
  if (message.type === "cowork:sidepanel:toggle") {
    const current = await chrome.tabs.sendMessage(tabId, { type: "cowork:get-state" });
    const state = await chrome.tabs.sendMessage(tabId, {
      type: "cowork:set-enabled",
      enabled: !current?.enabled
    });
    await setBadge(tabId, state?.enabled === true);
    return { ok: true, state };
  }
  if (message.type === "cowork:sidepanel:confirm-offer") {
    const result = await chrome.tabs.sendMessage(tabId, {
      type: "cowork:confirm-offer",
      offerId: message.offerId,
      humanGesture: message.humanGesture === true
    });
    return result;
  }
  throw new Error("UNSUPPORTED_SIDE_PANEL_OPERATION");
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  lastPageTabId = tab.id;
  try {
    const state = await chrome.tabs.sendMessage(tab.id, {
      type: "cowork:set-enabled",
      enabled: true
    });
    await setBadge(tab.id, state?.enabled === true);
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch {
    await setBadge(tab.id, false);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "cowork:surface-state") {
    if (Number.isInteger(sender.tab?.id)) lastPageTabId = sender.tab.id;
    return false;
  }
  const sidePanelTypes = new Set([
    "cowork:sidepanel:get-state",
    "cowork:sidepanel:toggle",
    "cowork:sidepanel:confirm-offer"
  ]);
  let operation;
  if (message?.type === "cowork:capture-visible-tab") {
    operation = cropVisibleTab(message, sender);
  } else if (message?.type === "cowork:consume-visual-region") {
    operation = Promise.resolve().then(() => consumeVisualRegion(message));
  } else if (sidePanelTypes.has(message?.type)) {
    operation = sidePanelOperation(message, sender);
  } else {
    return false;
  }
  operation
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, code: error.message }));
  return true;
});
