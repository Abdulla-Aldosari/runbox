/*-------------------------------------------------
 * RunBox — VS Code Extension
 * Copyright (c) 2026 Abdulla Aldosari
 * Licensed under the Apache License, Version 2.0.
 * See LICENSE in the project root for details.
 *-------------------------------------------------*/

// media/connection-watchdog.js
// Detects when the RunBox webview has been disconnected from the extension host
// (for example after the computer resumes from sleep/hibernate, an extension
// update, or an unexpected host restart). In that state the webview stays alive
// visually but every vscode.postMessage call is silently dropped, so the user
// would otherwise click buttons and get no feedback at all.
//
// All outgoing messages are funneled through sendMessage() instead of calling
// vscode.postMessage directly. Each send arms a short timer; if no message ever
// arrives back from the extension within that window, a large, non-dismissible
// modal is shown explaining that the connection was lost and asking the user to
// close and reopen the panel. Any incoming message (see resetConnectionWatchdog()
// in media/messages.js) clears the timer and hides the modal again.

// How long (ms) to wait after the last outgoing message before declaring the
// connection lost. Keep it long enough to absorb slow AI requests, but short
// enough that the user is not left staring at a frozen UI for too long.
const CONNECTION_WATCHDOG_TIMEOUT = 5000;

// Longer window used by slow, long-running operations (AI generate/explain) that
// can legitimately take far more than 5 seconds without meaning the connection
// has been lost.
const CONNECTION_WATCHDOG_LONG_TIMEOUT = 30000;

// True once the watchdog has decided the connection is lost.
let connectionLost = false;

// Timer handle for the currently armed watchdog. A single shared timer, so there
// is never more than one pending timeout at a time.
let connectionWatchdogTimer = null;

function clearConnectionWatchdogTimer() {
  if (connectionWatchdogTimer !== null) {
    clearTimeout(connectionWatchdogTimer);
    connectionWatchdogTimer = null;
  }
}

function markConnectionLost() {
  if (connectionLost) {
    return;
  }
  connectionLost = true;
  connectionWatchdogTimer = null;
  if (typeof render === "function") {
    render();
  }
}

function markConnectionRestored() {
  clearConnectionWatchdogTimer();
  if (connectionLost) {
    connectionLost = false;
    if (typeof render === "function") {
      render();
    }
  }
}

function armConnectionWatchdog(timeout) {
  clearConnectionWatchdogTimer();
  connectionWatchdogTimer = setTimeout(markConnectionLost, timeout);
}

/**
 * Sends a message to the extension host and arms the disconnection watchdog.
 * Replace all direct `vscode.postMessage(...)` calls with this.
 * @param {object} message
 * @param {{ timeout?: number }} [options] - Optional timeout override (ms).
 */
function sendMessage(message, options) {
  vscode.postMessage(message);
  armConnectionWatchdog(options && typeof options.timeout === "number" ? options.timeout : CONNECTION_WATCHDOG_TIMEOUT);
}

/**
 * Called from media/messages.js whenever any message arrives from the extension
 * host. Any incoming message proves the channel is still alive, so the watchdog
 * is re-armed (or the connection-lost modal is dismissed).
 */
function resetConnectionWatchdog() {
  markConnectionRestored();
}

function renderConnectionLostModal() {
  if (!connectionLost) {
    return "";
  }

  return `
    <div class="modal-overlay" id="connection-lost-overlay" data-dismiss-on-outside-click="false">
      <div class="modal-box connection-lost-box">
        <div class="connection-lost-icon">${icons.noConnectToHost}</div>
        <h3>Connection lost</h3>
        <p class="modal-description">
          RunBox stopped responding. Close this panel and open it again to restore the service.
        </p>
      </div>
    </div>
  `;
}
