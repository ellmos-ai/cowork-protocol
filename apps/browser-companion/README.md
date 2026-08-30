# Cowork Protocol Browser Companion

This optional Manifest V3 extension is the temporary bridge for pages that
offer neither Cowork Protocol nor WebMCP. It is disabled by default. The user
toggles it from the browser toolbar, points at a control, and can turn it off
again without reloading the page.

The context ladder is deliberately small:

1. one semantic target and at most 350 characters of nearby text;
2. an accessibility-shaped region summary capped at 1,200 characters;
3. only after another explicit request, a pointer-centered PNG crop capped at
   400×400 pixels.

The extension service worker captures the visible tab, crops it immediately,
stores only the crop under a random reference and returns metadata to the
page-facing adapter. The cropped bytes are consumable exactly once from the
isolated extension host; arbitrary page JavaScript receives no image bytes and
never receives the full screenshot.

A stable text-like form control may receive an exact visible value offer.
Password, file, hidden, ambiguous and unstable targets remain explain-only.
The field does not change when a page client or model proposes an offer. Only
an actual trusted click on the extension surface reaches the existing Cowork
authorization contract, and the result is reported only after the observed
value matches.

## Build and load

```powershell
npm run build:companion
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked** and
select `dist-browser-companion`. The broad page match is required for this
prototype to be available on arbitrary pages; the content script stays inert
until the toolbar toggle is used. A store-ready follow-up should migrate this
prototype to an `activeTab` plus on-demand injection flow.

## Page-client transport

An embedding client can send versioned requests with `window.postMessage`:

```js
window.postMessage({
  source: "cowork-page-client",
  protocolVersion: "0.1",
  requestId: crypto.randomUUID(),
  method: "readFocus",
  arguments: { lens: "pointer" }
}, "*");
```

Allowed page methods are `readFocus`, `requestContext` and `offerAction`.
Confirmation is intentionally absent. Visual bytes are also absent from this
channel; a future extension side panel or model-host connector consumes the
one-shot crop from the isolated extension context.

## Reproduce the acceptance

```powershell
$env:COWORK_COMPANION_BROWSER_PATH='C:\path\to\chrome-for-testing\chrome.exe'
npm run smoke:companion
```

The smoke loads the built extension into a fresh Chrome for Testing profile,
explicitly disables WebMCP for the fixture page and proves: default-off and
toggle-on/off behavior, 350/1,200-character semantic tiers, a real 160,000-pixel
PNG crop, one-shot isolated delivery, an inert value offer, a trusted browser
click and verified mutation. It keeps model-client, external-model, host-token
and full-page-delivery claims false.
