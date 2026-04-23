// =============================================================
// background/message-bus.js — Central Message Bus
//
// WHY: Chrome closes the message channel as soon as ANY listener
// returns undefined. With multiple feature files each registering
// their own onMessage listener, they race each other and cause:
//   "The message port closed before a response was received."
//
// FIX: One single onMessage listener. Features register handlers
// here instead of calling chrome.runtime.onMessage directly.
//
// HANDLER CONTRACT:
//   - Sync reply  → return { ...data }   (plain object)
//   - Async reply → return Promise<{...}>
//   - No reply    → return null
// =============================================================

const _handlers = new Map();  // msg.type → handler(msg) → value | Promise | null

export const MessageBus = {

  // Features call this to declare which message types they handle
  register(type, handler) {
    if (_handlers.has(type)) {
      console.warn(`[MessageBus] Duplicate handler for "${type}" — overwriting`);
    }
    _handlers.set(type, handler);
  },

  // Called once from background/index.js
  listen() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      const handler = _handlers.get(msg.type);

      if (!handler) {
        // Unknown type — return false so Chrome closes channel immediately
        // (no pending sendResponse, no leak)
        return false;
      }

      const result = handler(msg);

      if (result && typeof result.then === 'function') {
        // Async handler — must return true to keep channel open
        result.then(sendResponse).catch(err => {
          console.error(`[MessageBus] Handler error for "${msg.type}":`, err);
          sendResponse({ error: err.message });
        });
        return true;  // keep channel open
      }

      // Sync handler — reply immediately if result is not null
      if (result !== null) sendResponse(result);
      return false;   // channel can close
    });
  },
};
