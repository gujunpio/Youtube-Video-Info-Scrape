/* =============================================================
   background.js — Service Worker for YouTube Video Info

   Strategies (in order):
   1. YouTube Data API v3 (if API key is configured)
   2. YouTube Internal API (youtubei/v1/player + /next)
   3. Fallback: noembed.com oEmbed proxy
   ============================================================= */
'use strict';

function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

// ── Strategy 1: YouTube Data API v3 ──────────────────────────
async function fetchViaDataAPI(videoId, apiKey) {
  console.log('[YT-Info] Trying YouTube Data API v3 for', videoId);

  var url = 'https://www.googleapis.com/youtube/v3/videos'
          + '?part=snippet'
          + '&id=' + encodeURIComponent(videoId)
          + '&key=' + encodeURIComponent(apiKey);

  var res = await fetch(url);

  if (res.status === 403) {
    var errData = await res.json().catch(function() { return {}; });
    var reason = errData.error && errData.error.errors && errData.error.errors[0] && errData.error.errors[0].reason;
    if (reason === 'quotaExceeded') {
      throw new Error('API_QUOTA_EXCEEDED');
    }
    throw new Error('API_KEY_INVALID');
  }

  if (!res.ok) {
    throw new Error('Data API HTTP ' + res.status);
  }

  var data = await res.json();

  if (!data.items || data.items.length === 0) {
    throw new Error('VIDEO_NOT_FOUND');
  }

  var snippet = data.items[0].snippet;
  console.log('[YT-Info] Data API success — title:', (snippet.title || '').substring(0, 60));

  return {
    title:       snippet.title || '(Title not available)',
    description: snippet.description || '(No description)',
  };
}

// ── Strategy 2: YouTube Internal API ─────────────────────────
async function fetchViaInternalAPI(videoId) {
  console.log('[YT-Info] Trying YouTube internal API for', videoId);

  var playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId: videoId,
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20250530.01.00',
          hl: 'en',
          gl: 'US',
        }
      }
    })
  });

  if (!playerRes.ok) throw new Error('Internal API HTTP ' + playerRes.status);

  var playerData = await playerRes.json();
  var details = playerData.videoDetails;
  if (!details) throw new Error('No videoDetails in API response');

  var title       = details.title || '(Title not available)';
  var description = details.shortDescription || '';

  // Try /next for full description
  try {
    var nextRes = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: videoId,
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20250530.01.00',
            hl: 'en',
            gl: 'US',
          }
        }
      })
    });

    if (nextRes.ok) {
      var nextData = await nextRes.json();
      var contents = nextData
        && nextData.contents
        && nextData.contents.twoColumnWatchNextResults
        && nextData.contents.twoColumnWatchNextResults.results
        && nextData.contents.twoColumnWatchNextResults.results.results
        && nextData.contents.twoColumnWatchNextResults.results.results.contents;

      if (contents) {
        for (var i = 0; i < contents.length; i++) {
          var sec = contents[i].videoSecondaryInfoRenderer;
          if (sec) {
            if (sec.attributedDescription && sec.attributedDescription.content) {
              description = sec.attributedDescription.content;
            } else if (sec.description && sec.description.runs) {
              description = sec.description.runs.map(function(r) { return r.text; }).join('');
            }
            break;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[YT-Info] /next failed, using shortDescription');
  }

  console.log('[YT-Info] Internal API success — title:', title.substring(0, 60));
  return { title: title, description: description };
}

// ── Strategy 3: noembed oEmbed fallback ──────────────────────
async function fetchOembed(videoId) {
  console.log('[YT-Info] Trying oEmbed fallback…');
  var url = 'https://noembed.com/embed?url=https://www.youtube.com/watch?v=' + videoId;
  var res = await fetch(url);
  if (!res.ok) throw new Error('oEmbed HTTP ' + res.status);
  var data = await res.json();
  if (data.error) throw new Error('oEmbed error: ' + data.error);
  return {
    title:       data.title || '(Title not available)',
    description: '(Full description not available via fallback. Channel: ' + (data.author_name || 'Unknown') + ')',
  };
}

// ── Build fake ytInitialData HTML ────────────────────────────
function buildFakePageHtml(title, description) {
  var initData = {
    contents: {
      twoColumnWatchNextResults: {
        results: {
          results: {
            contents: [
              {
                videoPrimaryInfoRenderer: {
                  title: { runs: [{ text: title }] }
                }
              },
              {
                videoSecondaryInfoRenderer: {
                  attributedDescription: {
                    content: description || '(No description)'
                  }
                }
              }
            ]
          }
        }
      }
    }
  };

  return 'var ytInitialData = ' + JSON.stringify(initData) + ';';
}

// ── Get stored API key ───────────────────────────────────────
function getApiKey() {
  return new Promise(function(resolve) {
    chrome.storage.local.get('ytApiKey', function(result) {
      resolve(result.ytApiKey || '');
    });
  });
}

// ── Message handler ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate API key
  if (message.type === 'VALIDATE_API_KEY') {
    var testUrl = 'https://www.googleapis.com/youtube/v3/videos'
                + '?part=snippet&id=dQw4w9WgXcQ&key=' + encodeURIComponent(message.apiKey);
    fetch(testUrl)
      .then(function(res) {
        if (res.ok) {
          sendResponse({ ok: true });
        } else {
          res.json().then(function(d) {
            var reason = d.error && d.error.errors && d.error.errors[0] && d.error.errors[0].reason;
            sendResponse({ ok: false, error: reason || 'Invalid API key' });
          }).catch(function() {
            sendResponse({ ok: false, error: 'HTTP ' + res.status });
          });
        }
      })
      .catch(function(err) {
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (message.type !== 'FETCH_YOUTUBE_PAGE') return false;

  const videoId = message.videoId;

  (async () => {
    var meta = null;
    var source = '';

    // Strategy 1: YouTube Data API v3
    var apiKey = await getApiKey();
    if (apiKey) {
      try {
        meta = await fetchViaDataAPI(videoId, apiKey);
        source = 'api';
      } catch (err1) {
        console.warn('[YT-Info] Data API failed:', err1.message);
        // If quota exceeded or key invalid, still try other strategies
      }
    }

    // Strategy 2: YouTube Internal API
    if (!meta) {
      try {
        meta = await fetchViaInternalAPI(videoId);
        source = 'internal';
      } catch (err2) {
        console.warn('[YT-Info] Internal API failed:', err2.message);
      }
    }

    // Strategy 3: noembed fallback
    if (!meta) {
      try {
        meta = await fetchOembed(videoId);
        source = 'fallback';
      } catch (err3) {
        console.error('[YT-Info] All strategies failed:', err3.message);
        sendResponse({
          ok: false,
          error: 'Cannot fetch video info. Check your internet and API key.'
        });
        return;
      }
    }

    var html = buildFakePageHtml(meta.title, meta.description);
    sendResponse({ ok: true, html: html, source: source });
  })();

  return true;
});
