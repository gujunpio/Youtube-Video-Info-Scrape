'use strict';

const APP_URL = chrome.runtime.getURL('app.html');
const WINDOW_KEY = 'ytInfoWindowId';

document.getElementById('open-btn').addEventListener('click', async () => {
  // Check if an app window is already open
  const stored = await chrome.storage.local.get(WINDOW_KEY);
  const existingId = stored[WINDOW_KEY];

  if (existingId) {
    try {
      // Try to focus existing window
      await chrome.windows.update(existingId, { focused: true });
      window.close();
      return;
    } catch {
      // Window no longer exists — fall through to create new one
    }
  }

  // Create a new standalone popup window
  const win = await chrome.windows.create({
    url: APP_URL,
    type: 'popup',
    width: 800,
    height: 700,
    focused: true,
  });

  // Persist the window ID so we can focus it next time
  await chrome.storage.local.set({ [WINDOW_KEY]: win.id });

  // Clean up stored ID when window is closed
  chrome.windows.onRemoved.addListener(function onRemoved(id) {
    if (id === win.id) {
      chrome.storage.local.remove(WINDOW_KEY);
      chrome.windows.onRemoved.removeListener(onRemoved);
    }
  });

  window.close();
});
