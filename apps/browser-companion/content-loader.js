if (!globalThis.__coworkBrowserCompanionLoading) {
  globalThis.__coworkBrowserCompanionLoading = import(
    chrome.runtime.getURL(
      "modules/apps/browser-companion/src/content-runtime.js"
    )
  ).then(({ installBrowserCompanion }) =>
    installBrowserCompanion({
      document: globalThis.document,
      window: globalThis.window,
      runtime: chrome.runtime
    })
  );
}
