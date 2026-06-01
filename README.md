# YouTube Video Info — Chrome Extension

A lightweight Chrome Extension that extracts YouTube video information instantly from any video URL.

## Features

- **Video ID** — Extracts the 11-character video ID from any YouTube URL format
- **Link · Title · Description** — Combines all three into a single copyable block separated by `---`
- **Max HD Thumbnail** — Displays the highest resolution thumbnail (1280×720) with a direct download button
- **One-click Copy** — Every field has a copy button with animated green feedback
- **Light / Dark Mode** — Toggle with the monochrome icon in the top-right corner
- **Paste to Extract** — Paste a URL and results load automatically
- **Drag & Drop** — Drop a YouTube link directly onto the window
- **API Key Settings** — Configure YouTube Data API v3 key via the ⚙️ gear icon for reliable fetching

## Supported URL Formats

```
https://www.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
https://www.youtube.com/shorts/VIDEO_ID
https://www.youtube.com/live/VIDEO_ID
https://www.youtube.com/embed/VIDEO_ID
VIDEO_ID  (bare 11-character ID)
```

## How It Works — 3-Tier Waterfall Strategy

The extension uses a **3-layer fallback system** to ensure maximum reliability:

```
Paste URL → Extract → Layer 1 → fail? → Layer 2 → fail? → Layer 3
                        ↓                  ↓                  ↓
                   Data API v3        Internal API         noembed.com
                  (needs API key)    (no key needed)     (no key needed)
```

### Layer 1: YouTube Data API v3 ⭐ (Recommended)
- Calls `googleapis.com/youtube/v3/videos?part=snippet&id=...&key=...`
- Returns clean JSON: title, full description, tags, thumbnails
- ✅ Most stable — official Google API, never blocked
- ❌ Requires a free API key (10,000 units/day ≈ 3,300 videos/day)

### Layer 2: YouTube Internal API (No key required)
- Calls `youtube.com/youtubei/v1/player` (POST) — the same endpoint YouTube's web player uses
- Returns `videoDetails.title` + `shortDescription`
- Also calls `/youtubei/v1/next` for the full description
- ⚠️ Unofficial internal API — YouTube may block requests that look automated

### Layer 3: noembed.com Fallback (No key required)
- Calls `noembed.com/embed?url=...` — a public oEmbed proxy
- Only returns **title + channel name** (no full description)
- ✅ Always works as a last resort

### Can I use it without an API key?

**Yes, but it's less reliable.** Here's the comparison:

| | With API Key | Without API Key |
|---|---|---|
| **Title** | ✅ Always available | ✅ Available (Layer 2 or 3) |
| **Full description** | ✅ Always available | ⚠️ May or may not work (Layer 2) |
| **Stability** | 99.9% | ~50–70% (depends on YouTube blocking) |
| **Speed** | ~200ms | ~500ms–3s |

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the project folder
5. The extension icon appears in your toolbar

## Setting Up YouTube Data API v3 (Recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Navigate to **APIs & Services** → **Library**
4. Search for **YouTube Data API v3** → click **Enable**
5. Go to **Credentials** → **Create Credentials** → **API Key**
6. Copy the key
7. In the extension, click the ⚙️ gear icon → paste your key → **Save Key**

> Free tier: 10,000 units/day. Each video lookup costs ~3 units ≈ **3,300 videos/day**.

## Usage

1. Click the extension icon in the toolbar
2. Click **Open App** — the tool opens as a standalone popup window
3. Paste any YouTube URL into the input field
4. Hit **Extract** (or just paste — it auto-extracts)
5. Copy or download what you need

## Output Format (Block 02)

```
https://www.youtube.com/watch?v=VIDEO_ID
---
Video Title
---
Full video description...
```

## Tech Stack

- **Manifest V3** Chrome Extension
- Vanilla HTML / CSS / JavaScript — no frameworks, no dependencies
- **Primary**: YouTube Data API v3 (official, requires free API key)
- **Fallbacks**: YouTube Internal API (`youtubei/v1/player`) → noembed.com oEmbed proxy
- Thumbnail served directly from `i.ytimg.com`

## Permissions

| Permission | Reason |
|---|---|
| `windows` | Opens the app as a standalone popup window |
| `downloads` | Direct thumbnail download to Downloads folder |
| `storage` | Stores API key and window ID locally |
| `host: youtube.com` | Fetches video data via Internal API |
| `host: googleapis.com` | YouTube Data API v3 calls |
| `host: i.ytimg.com` | Loads thumbnail images |
| `host: noembed.com` | oEmbed fallback for video title |

---

> Data is fetched directly from YouTube/Google APIs and never stored or sent anywhere except Google's official endpoints. Your API key is saved locally in the browser and never shared.
