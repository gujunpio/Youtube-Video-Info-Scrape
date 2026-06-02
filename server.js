/* =============================================================
   server.js — YouTube Video Info Web App
   Express server with YouTube API proxy
   ============================================================= */
'use strict';

const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// API key from environment or in-memory (set via UI)
let apiKey = process.env.YOUTUBE_API_KEY || '';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Get current API key status ───────────────────────────────
app.get('/api/config', (req, res) => {
  res.json({ hasApiKey: !!apiKey });
});

// ── Set API key via UI ───────────────────────────────────────
app.post('/api/config', (req, res) => {
  const key = (req.body.apiKey || '').trim();
  if (!key) return res.status(400).json({ error: 'API key is required' });
  apiKey = key;
  res.json({ ok: true });
});

// ── Validate API key ─────────────────────────────────────────
app.post('/api/validate-key', async (req, res) => {
  const key = (req.body.apiKey || '').trim();
  if (!key) return res.status(400).json({ ok: false, error: 'No key provided' });

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=dQw4w9WgXcQ&key=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    if (r.ok) {
      res.json({ ok: true });
    } else {
      const data = await r.json().catch(() => ({}));
      const reason = data.error?.errors?.[0]?.reason || 'Invalid key';
      res.json({ ok: false, error: reason });
    }
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// ── Fetch video info ─────────────────────────────────────────
app.get('/api/video/:videoId', async (req, res) => {
  const videoId = req.params.videoId;
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  let result = null;

  // Strategy 1: YouTube Data API v3
  if (apiKey) {
    try {
      result = await fetchViaDataAPI(videoId, apiKey);
      return res.json({ ok: true, data: result, source: 'api' });
    } catch (err) {
      console.warn('[Strategy 1] Data API failed:', err.message);
    }
  }

  // Strategy 2: YouTube Internal API
  try {
    result = await fetchViaInternalAPI(videoId);
    return res.json({ ok: true, data: result, source: 'internal' });
  } catch (err) {
    console.warn('[Strategy 2] Internal API failed:', err.message);
  }

  // Strategy 3: noembed fallback
  try {
    result = await fetchOembed(videoId);
    return res.json({ ok: true, data: result, source: 'fallback' });
  } catch (err) {
    console.error('[Strategy 3] All strategies failed:', err.message);
  }

  res.status(500).json({ error: 'Could not fetch video info. Check your API key and internet connection.' });
});

// ── Strategy 1: YouTube Data API v3 ──────────────────────────
async function fetchViaDataAPI(videoId, key) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`;
  const r = await fetch(url);

  if (r.status === 403) {
    const d = await r.json().catch(() => ({}));
    const reason = d.error?.errors?.[0]?.reason;
    if (reason === 'quotaExceeded') throw new Error('API_QUOTA_EXCEEDED');
    throw new Error('API_KEY_INVALID');
  }
  if (!r.ok) throw new Error('Data API HTTP ' + r.status);

  const data = await r.json();
  if (!data.items || data.items.length === 0) throw new Error('VIDEO_NOT_FOUND');

  const snippet = data.items[0].snippet;
  return {
    title:       snippet.title || '(Title not available)',
    description: snippet.description || '(No description)',
    language:    snippet.defaultAudioLanguage || snippet.defaultLanguage || null,
  };
}

// ── Strategy 2: YouTube Internal API ─────────────────────────
async function fetchViaInternalAPI(videoId) {
  const body = JSON.stringify({
    videoId,
    context: { client: { clientName: 'WEB', clientVersion: '2.20250530.01.00', hl: 'en', gl: 'US' } }
  });

  const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body
  });
  if (!playerRes.ok) throw new Error('Internal API HTTP ' + playerRes.status);

  const playerData = await playerRes.json();
  const details = playerData.videoDetails;
  if (!details) throw new Error('No videoDetails');

  let description = details.shortDescription || '';

  // Try /next for full description
  try {
    const nextRes = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body
    });
    if (nextRes.ok) {
      const nextData = await nextRes.json();
      const contents = nextData?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
      if (contents) {
        for (const item of contents) {
          const sec = item.videoSecondaryInfoRenderer;
          if (sec) {
            if (sec.attributedDescription?.content) description = sec.attributedDescription.content;
            else if (sec.description?.runs) description = sec.description.runs.map(r => r.text).join('');
            break;
          }
        }
      }
    }
  } catch (_) { /* keep shortDescription */ }
  // Extract language from microformat or captions
  let language = null;
  try {
    const micro = playerData.microformat?.playerMicroformatRenderer;
    if (micro) {
      language = micro.defaultAudioLanguage || micro.availableLanguages?.[0] || null;
    }
    // Fallback: first caption track language
    if (!language) {
      const captions = playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (captions && captions.length > 0) {
        // Find the auto-generated track (usually original language)
        const auto = captions.find(c => c.kind === 'asr');
        language = (auto || captions[0]).languageCode || null;
      }
    }
  } catch (_) { /* no language info */ }

  return { title: details.title || '(Title not available)', description, language };
}

// ── Strategy 3: noembed oEmbed ───────────────────────────────
async function fetchOembed(videoId) {
  const r = await fetch('https://noembed.com/embed?url=https://www.youtube.com/watch?v=' + videoId);
  if (!r.ok) throw new Error('oEmbed HTTP ' + r.status);
  const data = await r.json();
  if (data.error) throw new Error('oEmbed: ' + data.error);
  return {
    title:       data.title || '(Title not available)',
    description: '(Full description not available. Channel: ' + (data.author_name || 'Unknown') + ')',
    language:    null,
  };
}

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  🎬 YouTube Video Info running at http://localhost:${PORT}\n`);
  if (apiKey) console.log('  ✅ YouTube API key configured via environment');
  else console.log('  ⚠️  No API key set. Configure via Settings or YOUTUBE_API_KEY env var.\n');
});
