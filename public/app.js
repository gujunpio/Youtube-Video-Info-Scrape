/* =============================================================
   YouTube Video Info — app.js (Web App version)
   No Chrome Extension APIs — pure web
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
const inputWrapper = document.getElementById('input-wrapper');
const extractBtn   = document.getElementById('extract-btn');
const errorBanner  = document.getElementById('error-banner');

const videoIdOut   = document.getElementById('video-id-out');
const videoInfoOut = document.getElementById('video-info-out');
const thumbImg     = document.getElementById('thumb-img');
const thumbPlaceholder = document.getElementById('thumb-placeholder');
const thumbDisplay = document.getElementById('thumb-display');
const copyThumbBtn = document.getElementById('copy-thumb-img-btn');
const downloadBtn  = document.getElementById('download-thumb-btn');
const toast        = document.getElementById('toast');

const cards = document.querySelectorAll('.card');

// API settings panel
const settingsBtn   = document.getElementById('settings-btn');
const apiPanel      = document.getElementById('api-panel');
const apiKeyInput   = document.getElementById('api-key-input');
const apiSaveBtn    = document.getElementById('api-save-btn');
const apiStatusDot  = document.getElementById('api-status-dot');
const apiStatusMsg  = document.getElementById('api-status-msg');

// Mini player
const miniplayer       = document.getElementById('miniplayer');
const miniplayerIframe = document.getElementById('miniplayer-iframe');

// Language badge
const langBadge = document.getElementById('lang-badge');
const langValue = document.getElementById('lang-value');

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
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
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
  } catch (e) { return false; }
}

var _copyTimers = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

function flashCopy(btn) {
  var lbl = btn.querySelector('span:last-child');
  if (!btn._copyPrevLabel) btn._copyPrevLabel = lbl ? lbl.textContent : '';
  if (_copyTimers && _copyTimers.has(btn)) clearTimeout(_copyTimers.get(btn));
  btn.classList.remove('copy-pop', 'copied');
  void btn.offsetWidth;
  btn.classList.add('copied', 'copy-pop');
  if (lbl) lbl.textContent = 'Copied!';
  btn.addEventListener('animationend', function removePop(ev) {
    if (ev.target !== btn) return;
    btn.classList.remove('copy-pop');
    btn.removeEventListener('animationend', removePop);
  });
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

// ── Fetch video info from server ─────────────────────────────
async function fetchVideoInfo(videoId) {
  var res = await fetch('/api/video/' + videoId);
  var data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Failed to fetch video info');
  }
  return data.data; // { title, description, language }
}

// ── Language display ─────────────────────────────────────────
var langFlags = {
  'en': '🇬🇧', 'en-US': '🇺🇸', 'en-GB': '🇬🇧',
  'vi': '🇻🇳', 'ja': '🇯🇵', 'ko': '🇰🇷', 'zh': '🇨🇳',
  'zh-TW': '🇹🇼', 'zh-Hans': '🇨🇳', 'zh-Hant': '🇹🇼',
  'fr': '🇫🇷', 'de': '🇩🇪', 'es': '🇪🇸', 'pt': '🇧🇷', 'pt-BR': '🇧🇷',
  'ru': '🇷🇺', 'it': '🇮🇹', 'th': '🇹🇭', 'id': '🇮🇩',
  'ar': '🇸🇦', 'hi': '🇮🇳', 'nl': '🇳🇱', 'pl': '🇵🇱', 'tr': '🇹🇷',
  'sv': '🇸🇪', 'da': '🇩🇰', 'fi': '🇫🇮', 'no': '🇳🇴', 'uk': '🇺🇦',
};

function formatLanguage(code) {
  if (!code) return null;
  try {
    var dn = new Intl.DisplayNames(['en'], { type: 'language' });
    var name = dn.of(code);
    var flag = langFlags[code] || langFlags[code.split('-')[0]] || '🌐';
    return flag + '  ' + name + '  (' + code + ')';
  } catch (e) {
    return '🌐  ' + code;
  }
}

// ── Thumbnail download (web) ─────────────────────────────────
async function downloadThumbnail(url, videoId) {
  try {
    var res  = await fetch(url);
    var blob = await res.blob();
    var burl = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = burl;
    a.download = 'thumbnail_' + videoId + '.jpg';
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

    // Show mini player
    miniplayerIframe.src = 'https://www.youtube.com/embed/' + videoId + '?rel=0';
    miniplayer.classList.add('visible');

    // Fetch title + description from server
    var meta = await fetchVideoInfo(videoId);

    var canonicalUrl = 'https://www.youtube.com/watch?v=' + videoId;

    videoInfoOut.textContent =
      canonicalUrl + '\n---\n' + meta.title + '\n---\n' + meta.description;

    // Thumbnail
    var maxUrl = maxThumbUrl(videoId);
    var hqUrl  = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';

    currentThumbUrl = maxUrl;

    thumbImg.style.opacity = '0';
    thumbImg.src = maxUrl;

    thumbImg.onload = function() {
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

    // Show language
    if (meta.language) {
      langValue.textContent = formatLanguage(meta.language);
      langBadge.style.display = 'flex';
    } else {
      langBadge.style.display = 'none';
    }

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
  var hasValue = input.value.length > 0;
  clearBtn.style.display = hasValue ? 'flex' : 'none';
  copyUrlBtn.style.display = hasValue ? 'flex' : 'none';
  if (errorBanner.classList.contains('visible')) clearError();
});

input.addEventListener('paste', function() {
  setTimeout(function() { if (input.value.trim()) doExtract(); }, 80);
});

clearBtn.addEventListener('click', function() {
  input.value = '';
  clearBtn.style.display = 'none';
  copyUrlBtn.style.display = 'none';
  input.focus();
  clearError();
});

copyUrlBtn.addEventListener('click', async function() {
  var url = input.value.trim();
  if (!url) return;
  var ok = await copyText(url);
  if (ok) {
    var icoCopy  = copyUrlBtn.querySelector('.ico-copy');
    var icoCheck = copyUrlBtn.querySelector('.ico-check');
    icoCopy.style.display = 'none';
    icoCheck.style.display = 'block';
    copyUrlBtn.style.color = '#4ade80';
    showToast('URL copied');
    setTimeout(function() {
      icoCopy.style.display = 'block';
      icoCheck.style.display = 'none';
      copyUrlBtn.style.color = '';
    }, 1500);
  }
});

// ── Copy buttons ──────────────────────────────────────────────
document.getElementById('copy-id-btn').addEventListener('click', async function(e) {
  var t = videoIdOut.textContent;
  if (!t || t === '\u2014') return;
  flashCopy(e.currentTarget);
  await copyText(t);
  showToast('Video ID copied');
});

document.getElementById('copy-info-btn').addEventListener('click', async function(e) {
  var t = videoInfoOut.textContent;
  if (!t || t === '\u2014') return;
  flashCopy(e.currentTarget);
  await copyText(t);
  showToast('Info copied');
});

copyThumbBtn.addEventListener('click', async function(e) {
  if (!currentThumbUrl) return;
  flashCopy(e.currentTarget);
  try {
    // Fetch image as blob to avoid CORS tainted canvas
    var res = await fetch(currentThumbUrl);
    var imgBlob = await res.blob();
    var blobUrl = URL.createObjectURL(imgBlob);

    // Load into a new image (same-origin blob URL = no taint)
    var img = new Image();
    img.src = blobUrl;
    await new Promise(function(resolve, reject) {
      img.onload = resolve;
      img.onerror = reject;
    });

    // Draw to canvas → PNG blob
    var canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    URL.revokeObjectURL(blobUrl);

    var pngBlob = await new Promise(function(resolve, reject) {
      canvas.toBlob(function(b) {
        if (b) resolve(b); else reject(new Error('toBlob failed'));
      }, 'image/png');
    });

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob })
    ]);
    showToast('Image copied to clipboard');
  } catch (err) {
    console.warn('[Copy Image]', err);
    await copyText(currentThumbUrl);
    showToast('Image URL copied (fallback)');
  }
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

// ── API Key Settings ──────────────────────────────────────────
settingsBtn.addEventListener('click', function() {
  var isVisible = apiPanel.classList.toggle('visible');
  settingsBtn.classList.toggle('active', isVisible);
});

// Load saved key + server status
function loadApiKey() {
  var savedKey = localStorage.getItem('ytApiKey');
  if (savedKey) apiKeyInput.value = savedKey;

  fetch('/api/config').then(r => r.json()).then(data => {
    if (data.hasApiKey) apiStatusDot.classList.add('connected');
  }).catch(() => {});
}
loadApiKey();

apiSaveBtn.addEventListener('click', function() {
  var key = apiKeyInput.value.trim();
  if (!key) { showApiStatus('Please enter an API key.', true); return; }

  apiSaveBtn.textContent = 'Validating…';
  apiSaveBtn.disabled = true;

  fetch('/api/validate-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: key })
  })
  .then(r => r.json())
  .then(data => {
    apiSaveBtn.textContent = 'Save Key';
    apiSaveBtn.disabled = false;

    if (data.ok) {
      // Save to server and localStorage
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key })
      });
      localStorage.setItem('ytApiKey', key);
      apiStatusDot.classList.add('connected');
      showApiStatus('✓ API key validated and saved!', false);
      showToast('API key saved');
    } else {
      apiStatusDot.classList.remove('connected');
      var errMsg = data.error || 'Unknown error';
      if (errMsg === 'keyInvalid') errMsg = 'Invalid API key.';
      if (errMsg === 'accessNotConfigured') errMsg = 'YouTube Data API v3 not enabled for this key.';
      showApiStatus('✗ ' + errMsg, true);
    }
  })
  .catch(err => {
    apiSaveBtn.textContent = 'Save Key';
    apiSaveBtn.disabled = false;
    showApiStatus('Error: ' + err.message, true);
  });
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
