/* =============================================================
   background.js — Service Worker for YouTube Video Info
   
   Why this exists:
   Extension pages (chrome-extension://) can encounter CSP and
   CORS issues when fetching external URLs directly. The background
   service worker runs in a privileged context with full access to
   host_permissions URLs, making it the reliable place to do
   cross-origin network requests.
   ============================================================= */
'use strict';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'FETCH_YOUTUBE_PAGE') return false;

  const videoId = message.videoId;
  // &bpctr=9999999999 bypasses some age/region gates
  // &has_verified=1  bypasses some consent gates
  const url = `https://www.youtube.com/watch?v=${videoId}&hl=en&gl=US&bpctr=9999999999&has_verified=1`;

  fetch(url, {
    headers: {
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control':   'no-cache',
    },
    credentials: 'omit',
    redirect:    'follow',
  })
    .then(async res => {
      if (!res.ok) {
        sendResponse({ ok: false, error: `YouTube returned HTTP ${res.status}` });
        return;
      }
      const html = await res.text();

      // Detect GDPR consent / sign-in redirect pages (no ytInitialData)
      if (!html.includes('ytInitialData')) {
        sendResponse({ ok: false, error: 'YouTube returned a consent or sign-in page — try again in a moment.' });
        return;
      }

      sendResponse({ ok: true, html });
    })
    .catch(err => {
      sendResponse({ ok: false, error: err.message });
    });

  return true; // keep channel open for async sendResponse
});
