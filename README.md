# 🎬 YouTube Video Info

> Extract YouTube video metadata instantly — Video ID, title, description, original language, thumbnail, and embedded player.

![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔗 **Video ID Extraction** | Auto-detect from any YouTube URL format |
| 📺 **Mini Player** | Watch video directly in the app (embedded YouTube player) |
| 🌐 **Original Language** | Detect and display video's original language with country flag |
| 📋 **One-Click Copy** | Copy video ID, full info block, or thumbnail image to clipboard |
| 🖼️ **Thumbnail** | Max HD (1280×720) preview with Copy Image & Download |
| 🌓 **Dark / Light Mode** | Toggle theme, saved in localStorage |
| 🔑 **API Key Management** | Optional YouTube Data API v3 key via UI or env var |
| 🐳 **Docker Ready** | One command to deploy |

## 🚀 Quick Start (Docker)

```bash
# Clone the repo
git clone https://github.com/gujunpio/Youtube-Video-Info-Scrape.git
cd Youtube-Video-Info-Scrape

# Run with Docker Compose
docker compose up -d

# Open in browser
# → http://localhost:3069
```

### With API Key (Optional)

```bash
YOUTUBE_API_KEY=your_key_here docker compose up -d
```

Or set it in `docker-compose.yml`:

```yaml
environment:
  - YOUTUBE_API_KEY=your_key_here
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│  Browser (public/)                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │index.html│ │  app.js  │ │     app.css      │ │
│  └──────────┘ └────┬─────┘ └──────────────────┘ │
│                    │ fetch('/api/video/:id')     │
├────────────────────┼────────────────────────────┤
│  Express Server    │  (server.js)               │
│                    ▼                             │
│  ┌─────────────────────────────────────────┐    │
│  │  3-Tier Waterfall Strategy              │    │
│  │                                         │    │
│  │  1️⃣ YouTube Data API v3 (if key set)    │    │
│  │       ↓ fallback                        │    │
│  │  2️⃣ YouTube Internal API (youtubei)     │    │
│  │       ↓ fallback                        │    │
│  │  3️⃣ noembed.com oEmbed proxy           │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

## 📊 Data Sources Comparison

| Data | API v3 | Internal API | noembed |
|------|:------:|:------------:|:-------:|
| Title | ✅ | ✅ | ✅ |
| Full Description | ✅ | ✅ | ❌ |
| Original Language | ✅ | ✅ | ❌ |
| Thumbnail | ✅ | ✅ | ✅ |
| Needs API Key | Yes | **No** | **No** |
| Rate Limit | 10K units/day | Soft limit | Unlimited |

## 🌐 Language Detection

The app detects the video's original language and displays it with a country flag:

- **With API Key**: Uses `snippet.defaultAudioLanguage`
- **Without API Key**: Extracts from `microformat.playerMicroformatRenderer` or auto-generated caption tracks (ASR)

Supported flags: 🇬🇧 🇺🇸 🇻🇳 🇯🇵 🇰🇷 🇨🇳 🇫🇷 🇩🇪 🇪🇸 🇧🇷 🇷🇺 🇮🇹 🇹🇭 🇮🇩 🇸🇦 🇮🇳 🇳🇱 🇵🇱 🇹🇷 🇸🇪 🇩🇰 🇫🇮 🇳🇴 🇺🇦 and more via `Intl.DisplayNames`.

## 🔑 YouTube Data API v3 Setup (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a project → Enable **YouTube Data API v3**
3. Create an **API Key**
4. Either:
   - Set as environment variable: `YOUTUBE_API_KEY=your_key`
   - Or enter via the ⚙️ Settings panel in the app

> **Free tier**: 10,000 units/day ≈ 3,300 video lookups

## 📁 Project Structure

```
├── Dockerfile            # Multi-stage Docker build
├── docker-compose.yml    # Docker Compose config (port 3069)
├── package.json          # Node.js dependencies
├── server.js             # Express backend + API proxy
├── public/
│   ├── index.html        # Main app page
│   ├── app.css           # Full dark/light theme system
│   └── app.js            # Frontend logic
```

## 🛠️ Development (Without Docker)

```bash
npm install
node server.js

# → http://localhost:3000
```

## 📝 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/video/:videoId` | Fetch video info (title, description, language) |
| `GET` | `/api/config` | Check if API key is configured |
| `POST` | `/api/config` | Set API key `{ "apiKey": "..." }` |
| `POST` | `/api/validate-key` | Validate an API key `{ "apiKey": "..." }` |

## 📄 License

MIT
