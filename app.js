/* =============================================================
   YouTube Video Info v2 — app.js
   Chrome Extension page script (lightweight, no mini player)
   ============================================================= */
'use strict';

// ── DOM ──────────────────────────────────────────────────────
const htmlEl       = document.documentElement;
const themeToggle  = document.getElementById('theme-toggle');
const iconMoon     = document.querySelector('.icon-moon');
const iconSun      = document.querySelector('.icon-sun');

const input        = document.getElementById('yt-url-input');
const clearBtn     = document.getElementById('clear-btn');
const copyUrlBtn   = document.getElementById('copy-url-btn');
const inputActions = document.getElementById('input-actions');
const inputWrapper = document.getElementById('input-wrapper');
const errorBanner  = document.getElementById('error-banner');

const videoIdOut    = document.getElementById('video-id-out');
const videoTitleOut = document.getElementById('video-title-out');
const videoDescOut  = document.getElementById('video-desc-out');
const thumbImg      = document.getElementById('thumb-img');
const thumbPlaceholder = document.getElementById('thumb-placeholder');
const thumbDisplay  = document.getElementById('thumb-display');
const copyThumbBtn  = document.getElementById('copy-thumb-img-btn');
const downloadBtn   = document.getElementById('download-thumb-btn');
const openLinkBtn   = document.getElementById('open-link-btn');
const toast         = document.getElementById('toast');

const cards = document.querySelectorAll('.card');

// API settings panel
const settingsBtn   = document.getElementById('settings-btn');
const apiPanel      = document.getElementById('api-panel');
const apiKeyInput   = document.getElementById('api-key-input');
const apiSaveBtn    = document.getElementById('api-save-btn');
const apiStatusDot  = document.getElementById('api-status-dot');
const apiStatusMsg  = document.getElementById('api-status-msg');

let currentVideoId  = null;
let currentThumbUrl = null;
let toastTimer      = null;

// ── Theme ────────────────────────────────────────────────────
function applyTheme(theme) {
  htmlEl.setAttribute('data-theme', theme);
  localStorage.setItem('ytInfoTheme', theme);
  var isDark = theme === 'dark';
  iconMoon.style.display = isDark ? '' : 'none';
  iconSun.style.display  = isDark ? 'none' : '';
}

applyTheme(localStorage.getItem('ytInfoTheme') || 'dark');

themeToggle.addEventListener('click', function() {
  applyTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

// ── Utilities ────────────────────────────────────────────────
function extractVideoId(url) {
  if (!url || !url.trim()) return null;
  url = url.trim();
  var patterns = [
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = url.match(patterns[i]);
    if (m) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
  return null;
}

function maxThumbUrl(videoId) {
  return 'https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg';
}

function showToast(msg, ms) {
  ms = ms || 2000;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { toast.classList.remove('show'); }, ms);
}

async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) { /* fall through */ }
  }
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e2) { return false; }
}

// Per-button copy feedback
var _copyTimers = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

function flashCopy(btn) {
  var lbl = btn.querySelector('span:last-child');
  if (!btn._copyPrevLabel) {
    btn._copyPrevLabel = lbl ? lbl.textContent : '';
  }
  if (_copyTimers && _copyTimers.has(btn)) {
    clearTimeout(_copyTimers.get(btn));
  }
  btn.classList.remove('copied');
  void btn.offsetWidth;
  btn.classList.add('copied');
  if (lbl) lbl.textContent = 'Copied!';

  var timer = setTimeout(function() {
    btn.classList.remove('copied');
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
  inputWrapper.addEventListener('animationend', function() {
    inputWrapper.classList.remove('shake');
  }, { once: true });
}

function clearError() {
  errorBanner.textContent = '';
  errorBanner.classList.remove('visible');
}

function revealCards() {
  cards.forEach(function(c, i) {
    c.classList.remove('visible');
    void c.offsetWidth;
    c.style.animationDelay = (i * 60) + 'ms';
    c.classList.add('visible');
  });
}

// ── JSON extraction via bracket-counting ─────────────────────
function extractJsonObject(html, startIdx) {
  var depth = 0, inStr = false, escape = false, i = startIdx;
  while (i < html.length) {
    var ch = html[i];
    if (escape) { escape = false; i++; continue; }
    if (inStr) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
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

  var MARKER = 'var ytInitialData = ';
  var markerIdx = html.indexOf(MARKER);
  if (markerIdx === -1) throw new Error('Could not find page data.');

  var braceIdx = html.indexOf('{', markerIdx + MARKER.length);
  if (braceIdx === -1) throw new Error('Could not locate JSON start.');

  var jsonStr = extractJsonObject(html, braceIdx);
  if (!jsonStr) throw new Error('Could not extract JSON from page.');

  var data = JSON.parse(jsonStr);
  var contents =
    data && data.contents &&
    data.contents.twoColumnWatchNextResults &&
    data.contents.twoColumnWatchNextResults.results &&
    data.contents.twoColumnWatchNextResults.results.results &&
    data.contents.twoColumnWatchNextResults.results.results.contents
    ? data.contents.twoColumnWatchNextResults.results.results.contents : [];

  var title = null, description = null;
  for (var k = 0; k < contents.length; k++) {
    var item = contents[k];
    if (item.videoPrimaryInfoRenderer) {
      var runs = item.videoPrimaryInfoRenderer.title && item.videoPrimaryInfoRenderer.title.runs;
      if (runs && runs.length) {
        title = runs.map(function(r) { return r.text; }).join('');
      }
    }
    if (item.videoSecondaryInfoRenderer) {
      var sec = item.videoSecondaryInfoRenderer;
      if (sec.attributedDescription && sec.attributedDescription.content) {
        description = sec.attributedDescription.content;
      }
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
  if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
    chrome.downloads.download({ url: url, filename: filename, saveAs: false });
    showToast('Downloading…');
    return;
  }
  try {
    var res = await fetch(url);
    var blob = await res.blob();
    var burl = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = burl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function() { URL.revokeObjectURL(burl); }, 10000);
    showToast('Download started');
  } catch (e) {
    showError('Download failed: ' + e.message);
  }
}

// ── Open video in new tab ─────────────────────────────────────
function openVideoInTab() {
  if (!currentVideoId) return;
  var url = 'https://www.youtube.com/watch?v=' + currentVideoId;
  chrome.tabs.create({ url: url, active: true });
}

// ── Main extract ──────────────────────────────────────────────
async function doExtract() {
  var rawUrl = input.value.trim();
  clearError();

  var videoId = extractVideoId(rawUrl);
  if (!videoId) {
    showError('Not a valid YouTube URL. Please paste a full link or an 11-character video ID.');
    return;
  }

  currentVideoId = videoId;

  try {
    videoIdOut.textContent    = videoId;

    var meta = await scrapeYouTubePage(videoId);

    videoTitleOut.textContent = meta.title;
    videoDescOut.textContent  = meta.description;

    // Thumbnail
    var maxUrl = maxThumbUrl(videoId);
    var hqUrl = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
    currentThumbUrl = maxUrl;

    thumbImg.style.opacity = '0';
    thumbImg.src = maxUrl;

    thumbImg.onload = function() {
      if (thumbImg.naturalWidth <= 120) {
        currentThumbUrl = hqUrl;
        thumbImg.src = hqUrl;
      }
      thumbImg.style.opacity = '1';
    };
    thumbImg.onerror = function() {
      currentThumbUrl = hqUrl;
      thumbImg.src = hqUrl;
      thumbImg.style.opacity = '1';
    };

    thumbPlaceholder.style.display = 'none';
    thumbDisplay.style.display = 'block';

    revealCards();
  } catch (err) {
    showError(err.message);
    console.error(err);
  }
}

// ── Events ───────────────────────────────────────────────────
input.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doExtract();
});

input.addEventListener('input', function() {
  var hasValue = input.value.length > 0;
  inputActions.style.display = hasValue ? 'flex' : 'none';
  if (errorBanner.classList.contains('visible')) clearError();
});

input.addEventListener('paste', function() {
  setTimeout(function() {
    if (input.value.trim()) {
      inputActions.style.display = 'flex';
      doExtract();
    }
  }, 80);
});

clearBtn.addEventListener('click', function() {
  input.value = '';
  inputActions.style.display = 'none';
  input.focus();
  clearError();
});

copyUrlBtn.addEventListener('click', async function() {
  var url = input.value.trim();
  if (!url) return;
  var ok = await copyText(url);
  if (ok) {
    var icoCopy = copyUrlBtn.querySelector('.ico-copy');
    var icoCheck = copyUrlBtn.querySelector('.ico-check');
    icoCopy.style.display = 'none';
    icoCheck.style.display = 'block';
    showToast('URL copied');
    setTimeout(function() {
      icoCopy.style.display = 'block';
      icoCheck.style.display = 'none';
    }, 1500);
  }
});

// Copy buttons
document.getElementById('copy-id-btn').addEventListener('click', async function(e) {
  var t = videoIdOut.textContent;
  if (!t || t === '\u2014') return;
  flashCopy(e.currentTarget);
  await copyText(t);
  showToast('Video ID copied');
});

document.getElementById('copy-title-btn').addEventListener('click', async function(e) {
  var t = videoTitleOut.textContent;
  if (!t || t === '\u2014') return;
  flashCopy(e.currentTarget);
  await copyText(t);
  showToast('Title copied');
});

document.getElementById('copy-desc-btn').addEventListener('click', async function(e) {
  var t = videoDescOut.textContent;
  if (!t || t === '\u2014') return;
  flashCopy(e.currentTarget);
  await copyText(t);
  showToast('Description copied');
});

copyThumbBtn.addEventListener('click', async function(e) {
  if (!currentThumbUrl) return;
  flashCopy(e.currentTarget);
  try {
    var canvas = document.createElement('canvas');
    canvas.width = thumbImg.naturalWidth;
    canvas.height = thumbImg.naturalHeight;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(thumbImg, 0, 0);

    var blob = await new Promise(function(resolve, reject) {
      canvas.toBlob(function(b) {
        if (b) resolve(b); else reject(new Error('Canvas toBlob failed'));
      }, 'image/png');
    });

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
    showToast('Image copied to clipboard');
  } catch (err) {
    await copyText(currentThumbUrl);
    showToast('Image URL copied (image copy not supported)');
  }
});

downloadBtn.addEventListener('click', function() {
  if (!currentThumbUrl || !currentVideoId) return;
  downloadThumbnail(currentThumbUrl, currentVideoId);
});

// Open video in new tab
openLinkBtn.addEventListener('click', openVideoInTab);

// Drag & drop
document.addEventListener('dragover', function(e) { e.preventDefault(); });
document.addEventListener('drop', function(e) {
  e.preventDefault();
  var text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
  if (text) { input.value = text.trim(); inputActions.style.display = 'flex'; doExtract(); }
});

// ── API Key Settings ──────────────────────────────────────────

settingsBtn.addEventListener('click', function() {
  var isVisible = apiPanel.classList.toggle('visible');
  settingsBtn.classList.toggle('active', isVisible);
});

function loadApiKey() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('ytApiKey', function(result) {
      if (result.ytApiKey) {
        apiKeyInput.value = result.ytApiKey;
        apiStatusDot.classList.add('connected');
      }
    });
  }
}
loadApiKey();

apiSaveBtn.addEventListener('click', function() {
  var key = apiKeyInput.value.trim();
  if (!key) {
    showApiStatus('Please enter an API key.', true);
    return;
  }

  apiSaveBtn.textContent = 'Validating…';
  apiSaveBtn.disabled = true;

  chrome.runtime.sendMessage(
    { type: 'VALIDATE_API_KEY', apiKey: key },
    function(response) {
      apiSaveBtn.textContent = 'Save Key';
      apiSaveBtn.disabled = false;

      if (chrome.runtime.lastError) {
        showApiStatus('Error: ' + chrome.runtime.lastError.message, true);
        return;
      }

      if (response && response.ok) {
        chrome.storage.local.set({ ytApiKey: key }, function() {
          apiStatusDot.classList.add('connected');
          showApiStatus('✓ API key validated and saved!', false);
          showToast('API key saved');
        });
      } else {
        apiStatusDot.classList.remove('connected');
        var errMsg = response && response.error ? response.error : 'Unknown error';
        if (errMsg === 'keyInvalid') errMsg = 'Invalid API key.';
        if (errMsg === 'accessNotConfigured') errMsg = 'YouTube Data API v3 is not enabled for this key.';
        showApiStatus('✗ ' + errMsg, true);
      }
    }
  );
});

function showApiStatus(msg, isError) {
  apiStatusMsg.textContent = msg;
  apiStatusMsg.className = 'api-status-msg visible' + (isError ? ' error' : '');
  setTimeout(function() { apiStatusMsg.classList.remove('visible'); }, 5000);
}

apiKeyInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') apiSaveBtn.click();
});

input.focus();
