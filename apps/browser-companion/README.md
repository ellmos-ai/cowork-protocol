# Cowork Protocol Browser Companion

This optional Manifest V3 extension is a user-selected Cowork surface and
precision bridge. It is disabled by default. When enabled, it consumes native
Cowork/WebMCP first. Only when neither is available does it activate the
bounded semantic/accessibility/visual fallback.

The current artifact separates a headless content relay from a browser-owned
Chrome/Edge Side Panel. The visual surface remains on the extension origin and
outside the website; the browser acceptance rejects any injected Cowork UI
root in the page. Two separate Chrome 152 acceptances cover both branches:
native FormBuilder exposes nine Cowork tools with no fallback, while the
no-WebMCP fixture activates the bounded fallback and trusted-click gate.

This does not prohibit a cooperating website from embedding the Cowork
reference UI itself. Voluntary page embedding is a separate
`protocol-and-ui` or `protocol-and-user-optional-ui` integration and gives users
the Cowork experience without installing this extension. The extension merely
stops imposing its own visual surface on the website DOM.

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

## Dialogue Relay cockpit

The Side Panel is a bright collaboration instrument rather than a generic chat
sidebar. The human silhouette and friendly computer are the primary state
controls. Clicking the model cycles `collaborating -> observing -> paused`;
observing keeps read/explain access but blocks action offers. The relay emblem
is animated in Cowork, directional during a valid solo lease and dormant when
no joint turn is active. Human presence can change only when the Session
Authority has granted the required solo lease.

Connector route and execution mode are separate. Native Cowork, native WebMCP
and the bounded bridge use structured actions and show no synthetic model
pointer. Only a real executor reporting `executionMode: computer-use` reveals
the distinct model-pointer instrument with the persistent `Computer use` and
`Higher token use` labels.

Color is never the only status signal. Visible labels, character pose, aura
shape, state badge and relay motion change together, and reduced-motion mode
removes all animation. The same semantic presentation module drives the
FormBuilder Embed, where the actor controls cycle through the same states.

## Build and load

```powershell
npm run build:companion
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked** and
select `dist-browser-companion`. The extension requests no persistent host
permission and declares no automatic content script. Clicking its toolbar
action, or pressing `Ctrl+Shift+Y` (`Command+Shift+Y` on macOS), grants
temporary `activeTab` access for the current page and injects the MAIN-world
Native bridge plus isolated relay on demand. Navigating to another origin or
closing the tab revokes that access. The `<all_urls>` entry under
`web_accessible_resources` only allows an invoked relay to load packaged
modules; it is not a host permission.

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
npm run smoke:companion-cockpit
npm run smoke:companion-native
```

Chrome builds that do not load extensions in headless mode can run the same
gate in a real browser surface. Visual capture needs the temporary window to
remain on-screen:

```powershell
$env:COWORK_COMPANION_HEADFUL='1'
$env:COWORK_COMPANION_VISIBLE='1'
npm run smoke:companion
```

To capture the two real proof frames used by release media, add an output
directory. The ordinary smoke remains write-free when this variable is absent:

```powershell
$env:COWORK_COMPANION_EVIDENCE_DIR='C:\path\to\evidence'
npm run smoke:companion
```

The opt-in run writes `browser-companion-offer-awaiting-click.png` and
`browser-companion-verified-after-click.png` from the same isolated Chrome
session that produces the acceptance report.

The smoke loads the built extension into a fresh Chrome for Testing profile,
explicitly disables WebMCP for the fixture page and proves: no injected Cowork
execution world before the trusted action shortcut, user-initiated `activeTab`
attachment, toggle-on/off behavior, 350/1,200-character semantic tiers, a real 160,000-pixel
PNG crop, one-shot isolated delivery, an inert value offer, a trusted browser
click and verified mutation. It keeps model-client, external-model, host-token
and full-page-delivery claims false.

The Native-first smoke enables WebMCP on FormBuilder and proves
`mode: native-cowork`, nine discovered native tools, a native focus response,
`fallbackActive: false` and `pageUiInjected: false`. The extension uses a
small main-world bridge solely to reach the browser's page-owned WebMCP API;
its visual and privileged code remain in the isolated extension worlds.

The dedicated cockpit smoke renders the production Side Panel at 390×844,
executes its focus/context controls and captures four truthful actor/relay
states. With `COWORK_COMPANION_EVIDENCE_DIR` set, it writes the PNG frames plus
`browser-companion-cockpit-report.json`. The validator also rejects any current
structured path that falsely reveals the Computer Use pointer.
