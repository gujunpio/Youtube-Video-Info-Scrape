/* =============================================================
   YouTube Video Info — app.js
   Chrome Extension page script
   ============================================================= */
'use strict';

// ── DOM ──────────────────────────────────────────────────────
const htmlEl       = document.documentElement;
const themeToggle  = document.getElementById('theme-toggle');
const iconMoon     = document.querySelector('.icon-moon');
const iconSun      = document.querySelector('.icon-sun');

const input        = document.getElementById('yt-url-input');
const clearBtn     = document.getElementById('clear-btn');
const inputWrapper = document.getElementById('input-wrapper');
const extractBtn   = document.getElementById('extract-btn');
const errorBanner  = document.getElementById('error-banner');

const videoIdOut   = document.getElementById('video-id-out');
const videoInfoOut = document.getElementById('video-info-out');
const thumbImg     = document.getElementById('thumb-img');
const thumbPlaceholder = document.getElementById('thumb-placeholder');
const thumbDisplay = document.getElementById('thumb-display');
const copyThumbBtn = document.getElementById('copy-thumb-url-btn');
const downloadBtn  = document.getElementById('download-thumb-btn');
const toast        = document.getElementById('toast');

const cards = document.querySelectorAll('.card');

let currentVideoId  = null;
let currentThumbUrl = null;
let toastTimer      = null;

// ── Theme ────────────────────────────────────────────────────
function applyTheme(theme) {
  htmlEl.setAttribute('data-theme', theme);
  localStorage.setItem('ytInfoTheme', theme);
  const isDark = theme === 'dark';
  iconMoon.style.display = isDark ? '' : 'none';
  iconSun.style.display  = isDark ? 'none' : '';
}

applyTheme(localStorage.getItem('ytInfoTheme') || 'dark');

themeToggle.addEventListener('click', () => {
  applyTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

// ── Utilities ────────────────────────────────────────────────
function extractVideoId(url) {
  if (!url || !url.trim()) return null;
  url = url.trim();
  const patterns = [
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  return null;
}

function maxThumbUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

function showToast(msg, ms) {
  ms = ms || 2400;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// Per-button timers — so rapid re-clicks properly restart the 2s countdown
var _copyTimers = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

function flashCopy(btn) {
  var lbl = btn.querySelector('span:last-child');

  // Capture original label text on first trigger only
  if (!btn._copyPrevLabel) {
    btn._copyPrevLabel = lbl ? lbl.textContent : '';
  }

  // Cancel any pending revert for this button
  if (_copyTimers && _copyTimers.has(btn)) {
    clearTimeout(_copyTimers.get(btn));
  }

  // Force re-trigger the pop animation even if already in copied state
  btn.classList.remove('copy-pop');
  void btn.offsetWidth; // reflow so browser treats it as a new animation
  btn.classList.add('copied', 'copy-pop');

  if (lbl) lbl.textContent = 'Copied!';

  // Remove only the pop class once the spring animation finishes
  btn.addEventListener('animationend', function removePop() {
    btn.classList.remove('copy-pop');
    btn.removeEventListener('animationend', removePop);
  });

  // Revert label + classes after 2 s
  var timer = setTimeout(function() {
    btn.classList.remove('copied', 'copy-pop');
    if (lbl) lbl.textContent = btn._copyPrevLabel;
    delete btn._copyPrevLabel;
    if (_copyTimers) _copyTimers.delete(btn);
  }, 2000);

  if (_copyTimers) _copyTimers.set(btn, timer);
}


function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.classList.add('visible');
  inputWrapper.classList.add('shake');
  inputWrapper.addEventListener('animationend', () => inputWrapper.classList.remove('shake'), { once: true });
}

function clearError() {
  errorBanner.textContent = '';
  errorBanner.classList.remove('visible');
}

function revealCards() {
  cards.forEach(function(c, i) {
    c.classList.remove('visible');
    void c.offsetWidth;
    c.style.animationDelay = (i * 75) + 'ms';
    c.classList.add('visible');
  });
}

// ── JSON extraction via bracket-counting ─────────────────────
// Extracts the JSON object starting at startIdx in html string.
// Correctly handles nested objects, string escapes, and unicode.
function extractJsonObject(html, startIdx) {
  var depth  = 0;
  var inStr  = false;
  var escape = false;
  var i      = startIdx;

  while (i < html.length) {
    var ch = html[i];

    if (escape) {
      escape = false;
      i++;
      continue;
    }

    if (inStr) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"')      inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return html.slice(startIdx, i + 1);
      }
    }
    i++;
  }
  return null;
}

// ── YouTube page scraping ─────────────────────────────────────
// Routes through the background service worker (background.js) so the
// fetch runs in a privileged context — avoids the CSP/CORS issues that
// cause "Failed to fetch" when fetching from an extension page directly.
async function scrapeYouTubePage(videoId) {
  var html = await new Promise(function(resolve, reject) {
    chrome.runtime.sendMessage(
      { type: 'FETCH_YOUTUBE_PAGE', videoId: videoId },
      function(response) {
        if (chrome.runtime.lastError) {
          reject(new Error('Background worker error: ' + chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error(response ? response.error : 'No response from background worker'));
          return;
        }
        resolve(response.html);
      }
    );
  });

  // Parse ytInitialData from the fetched HTML
  var MARKER    = 'var ytInitialData = ';
  var markerIdx = html.indexOf(MARKER);
  if (markerIdx === -1) throw new Error('Could not find page data — YouTube may have updated its format.');

  var braceIdx = html.indexOf('{', markerIdx + MARKER.length);
  if (braceIdx === -1) throw new Error('Could not locate JSON start.');

  var jsonStr = extractJsonObject(html, braceIdx);
  if (!jsonStr) throw new Error('Could not extract JSON from page.');

  var data = JSON.parse(jsonStr);

  var contents =
    data &&
    data.contents &&
    data.contents.twoColumnWatchNextResults &&
    data.contents.twoColumnWatchNextResults.results &&
    data.contents.twoColumnWatchNextResults.results.results &&
    data.contents.twoColumnWatchNextResults.results.results.contents
    ? data.contents.twoColumnWatchNextResults.results.results.contents
    : [];

  var title       = null;
  var description = null;

  for (var k = 0; k < contents.length; k++) {
    var item = contents[k];

    // Title
    if (item.videoPrimaryInfoRenderer) {
      var runs = item.videoPrimaryInfoRenderer.title &&
                 item.videoPrimaryInfoRenderer.title.runs;
      if (runs && runs.length) {
        title = runs.map(function(r) { return r.text; }).join('');
      }
    }

    // Description
    if (item.videoSecondaryInfoRenderer) {
      var sec = item.videoSecondaryInfoRenderer;

      // Modern path: attributedDescription.content (plain text)
      if (sec.attributedDescription && sec.attributedDescription.content) {
        description = sec.attributedDescription.content;
      }

      // Legacy path: description.runs[].text joined
      if (!description && sec.description && sec.description.runs && sec.description.runs.length) {
        description = sec.description.runs.map(function(r) { return r.text; }).join('');
      }
    }

    if (title && description) break;
  }

  return {
    title:       title       || '(Title not available)',
    description: description || '(No description found)',
  };
}

// ── Thumbnail download ────────────────────────────────────────
async function downloadThumbnail(url, videoId) {
  var filename = 'thumbnail_' + videoId + '.jpg';

  // Chrome Extension: chrome.downloads API gives a real, direct download
  if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
    chrome.downloads.download({ url: url, filename: filename, saveAs: false });
    showToast('Downloading to your Downloads folder…');
    return;
  }

  // Fallback for non-extension context
  try {
    var res  = await fetch(url);
    var blob = await res.blob();
    var burl = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = burl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function() { URL.revokeObjectURL(burl); }, 10000);
    showToast('Download started');
  } catch (e) {
    showError('Download failed: ' + e.message);
  }
}



// ── Main extract ──────────────────────────────────────────────
async function doExtract() {
  var rawUrl  = input.value.trim();
  clearError();

  var videoId = extractVideoId(rawUrl);
  if (!videoId) {
    showError('Not a valid YouTube URL. Please paste a full link or an 11-character video ID.');
    return;
  }

  extractBtn.disabled = true;
  extractBtn.classList.add('loading');
  currentVideoId = videoId;

  try {
    // Show video ID immediately
    videoIdOut.textContent = videoId;

    // Scrape title + description from YouTube page
    var meta = await scrapeYouTubePage(videoId);

    var canonicalUrl = 'https://www.youtube.com/watch?v=' + videoId;

    // Build combined block: URL --- Title --- Description
    videoInfoOut.textContent =
      canonicalUrl + '\n---\n' + meta.title + '\n---\n' + meta.description;

    // Thumbnail
    var maxUrl = maxThumbUrl(videoId);
    var hqUrl  = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';

    currentThumbUrl = maxUrl;

    thumbImg.style.opacity = '0';
    thumbImg.src = maxUrl;

    thumbImg.onload = function() {
      // maxres unavailable — YouTube serves a 120×90 placeholder image
      if (thumbImg.naturalWidth <= 120) {
        currentThumbUrl = hqUrl;
        thumbImg.src    = hqUrl;
      }
      thumbImg.style.opacity = '1';
    };

    thumbImg.onerror = function() {
      currentThumbUrl = hqUrl;
      thumbImg.src    = hqUrl;
      thumbImg.style.opacity = '1';
    };

    thumbPlaceholder.style.display = 'none';
    thumbDisplay.style.display     = 'block';

    revealCards();

  } catch (err) {
    showError(err.message);
    console.error(err);
  } finally {
    extractBtn.disabled = false;
    extractBtn.classList.remove('loading');
  }
}

// ── Events ───────────────────────────────────────────────────
extractBtn.addEventListener('click', doExtract);

input.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doExtract();
});

input.addEventListener('input', function() {
  clearBtn.style.display = input.value ? 'flex' : 'none';
  if (errorBanner.classList.contains('visible')) clearError();
});

input.addEventListener('paste', function() {
  setTimeout(function() { if (input.value.trim()) doExtract(); }, 80);
});

clearBtn.addEventListener('click', function() {
  input.value = '';
  clearBtn.style.display = 'none';
  input.focus();
  clearError();
});

document.getElementById('copy-id-btn').addEventListener('click', async function(e) {
  var t = videoIdOut.textContent;
  if (!t || t === '—') return;
  if (await copyText(t)) { flashCopy(e.currentTarget); showToast('Video ID copied'); }
});

document.getElementById('copy-info-btn').addEventListener('click', async function(e) {
  var t = videoInfoOut.textContent;
  if (!t || t === '—') return;
  if (await copyText(t)) { flashCopy(e.currentTarget); showToast('Info block copied'); }
});

copyThumbBtn.addEventListener('click', async function(e) {
  if (!currentThumbUrl) return;
  if (await copyText(currentThumbUrl)) { flashCopy(e.currentTarget); showToast('Thumbnail URL copied'); }
});

downloadBtn.addEventListener('click', function() {
  if (!currentThumbUrl || !currentVideoId) return;
  downloadThumbnail(currentThumbUrl, currentVideoId);
});

// Drag & drop
document.addEventListener('dragover', function(e) { e.preventDefault(); });
document.addEventListener('drop', function(e) {
  e.preventDefault();
  var text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
  if (text) { input.value = text.trim(); clearBtn.style.display = 'flex'; doExtract(); }
});

input.focus();
