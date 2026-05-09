/**
 * Popup script — minimal status panel. Shows version + extension id so
 * the user can paste them into a feedback report when something breaks.
 */
const manifest = chrome.runtime.getManifest()
const versionEl = document.getElementById("version")
const idEl = document.getElementById("ext-id")
if (versionEl) versionEl.textContent = manifest.version
if (idEl) idEl.textContent = chrome.runtime.id
