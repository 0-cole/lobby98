# Lobby 98 — Project Context Summary (`lobby98_context.md`)

## 1. Executive Summary & High-Level Objective
- **Project**: **Lobby 98** (`v3.1.0`), a multiplayer social gaming and arcade platform with a signature **Frutiger Aero / PS3 XMB aesthetic** (frosted glass cards, animated wave ribbons, aquatic gradients, floating bubbles, and ambient Donkey Kong Country music).
- **Core Purpose**: Casual, high-polish party games and arcade challenges for friends with persistent accounts, titles, cosmetics, and economy.
- **Repository**: [`0-cole/lobby98`](https://github.com/0-cole/lobby98) on GitHub.
- **Hosting Runtime**:
  - **Web Service**: Hosted on **Render** (Free Web Service) via `render.yaml` with continuous auto-deploy on push to `main`.
  - **Database Persistence**: **Neon Serverless PostgreSQL** (project `silent-darkness-28840486`, branch `production`).

---

## 2. Critical Architecture & Invariants

### A. Dual-Database Persistence Engine
- **In-Memory / Fast Disk**: Uses file-based SQLite (`better-sqlite3`, `lobby98.db`) for high-frequency in-game events, fast queries, and zero roundtrip latency.
- **Cloud Persistence via Neon**:
  - `restore.js` runs **before** `server.js` on boot. If local `lobby98.db` is missing (due to container rebuilds on Render), it downloads the latest SQLite binary snapshot from Neon PostgreSQL (`db_backup` table).
  - `server.js` triggers a WAL checkpoint and flushes a fresh binary snapshot to Neon every 30 seconds, on shutdown (`SIGTERM`/`SIGINT`), and after high-value user events (register/login).
  - **Environment Invariant**: Requires `DATABASE_URL` set in Render Dashboard (or `.env.local` locally).

### B. Admin & Permission Hierarchy
- **Owner Account**: Hardcoded in `server.js` as `OWNER_USERS = ["cole"]`.
  - Any account registered or logged in with the username **`cole`** automatically receives root owner privileges, the gold `OWNER` chat badge, and access to all staff/admin endpoints (`/api/staff/`).
- **Hierarchy**: `Owner > Staff > Mod > User`. Staff permissions are JSON flags (`staff_perms`) assigned by the owner.

### C. Aesthetic & Audio Invariants
- **Frutiger Aero Design**: 13 layered SVG XMB wave ribbons with CSS sine animations, bokeh orbs, and 10 dynamic color themes (Aqua, Midnight, Sunset, Neon, etc.) managed via CSS variables on `<body>`.
- **Ambient Soundtrack**: Plays Donkey Kong Country restored lofi tracks (*Aquatic Ambience*, *Stickerbush Symphony*, *Forest Interlude*).
  - Implemented as a stealth `200x200` YouTube player (`opacity: 0.001; z-index: -1000`) to comply with YouTube viewport rules.
  - Activates on user interaction (`click` / `touchstart`) to bypass browser autoplay protections.

### D. Continuous Deployment & Auto-Push Invariant
- **Automatic GitHub Push**: Whenever changes, fixes, or tweaks are completed and verified (along with the version bump in `package.json`), always automatically commit and push to GitHub (`git add .`, `git commit -m "..."`, `git push origin main`) so Render immediately deploys the update. Do not ask for confirmation before pushing.

---

## 3. Tech Stack & Verified Dependencies
- **Runtime**: Node.js `v20+` / `v26+` (ES Modules `"type": "module"`).
- **Web & Realtime**: `express` (`^4.21.0`), `socket.io` (`^4.8.0`).
- **Data**: `better-sqlite3` (`^11.3.0`), `pg` (`^8.13.0`), `@neon/config`, `@neon/env`.
- **Security & Auth**: `bcryptjs` (`^2.4.3`), `cookie` (`^0.7.0`) with 30-day `httpOnly` sessions.
- **Verification Scripts**:
  - `npm run build`: Runs AST syntax checks across `server.js`, `restore.js`, and `db.js`.
  - `node test-e2e-neon.js`: Live verification test connecting to Neon PostgreSQL and validating snapshot read/write integrity.

---

## 4. File Layout Overview
```text
lobby98/
├── server.js          — Monolithic server: Express routes, Socket.IO party game engines, API endpoints
├── db.js              — SQLite database schema, user tables, migrations, and CRUD helpers
├── restore.js         — Pre-boot recovery script pulling SQLite snapshots from Neon PostgreSQL
├── neon.ts            — Neon CLI service declarations & branching configuration
├── render.yaml        — Render Blueprint infrastructure definition
├── Dockerfile         — Container build configuration for Linux hosting
├── words.js           — Word lists for party games
├── prompts.js         — Frequency game prompts
├── filter.js          — 4-layer profanity filter and anti-spam
└── public/
    ├── index.html     — Single Page Application structure and hidden YouTube ambient music player
    ├── css/style.css  — Frutiger Aero design system, themes, and XMB ribbons
    └── js/
        ├── client.js  — Main client SPA controller, socket listeners, and shop
        ├── dungeon.js — Deep Dive RPG dungeon crawler (canvas-based)
        ├── arcade.js  — 5 arcade minigames with anti-cheat
        └── shooter.js — Blitz multiplayer shooter
```

---

## 5. Recent Modifications (`Nov 10, 2026`)
- **Render Deployment**: Added `render.yaml` with automatic build commands and WebSocket compatibility.
- **Neon Cloud Persistence**: Connected to Neon PostgreSQL (`silent-darkness-28840486`). Wired automatic `.env.local` parsing in `restore.js` and `server.js`.
- **Ambient Music Overhaul**: Fixed YouTube background player viewport constraints (`200x200`) and added mobile `touchstart` listeners so music plays reliably on mobile Safari and Chrome.
- **Automated Testing**: Created `test-e2e-neon.js` validating the full snapshot restore/save roundtrip.
- **Adaptive Gradient Text Contrast Engine (v3.0.1)**: Added automatic perceived luminance detection (`getGradientLuminance`) across all 380+ wallpaper gradients and curated themes. Automatically switches text between crisp embossed dark slate on light gradients and pure white/ice-cyan with drop-shadows on dark gradients, fixing illegible labels and subtitles on translucent glass cards.
- **Loading Screen Gradient Synchronization (v3.0.3)**: Synchronized `#loading-screen` background and typography with the user's chosen custom gradient or curated theme before render, preserving the default aqua screen when no custom gradient is active.
- **Full-Width Announcements & Persistent Single-Play Notice (v3.0.5)**: Forced announcement bars to full 100vw width across the chat section using `left: 0 !important; right: 0 !important; width: 100vw !important;`. Added versioned cache-busting query strings (`?v=3.0.5`) in `index.html` and `no-cache` static headers in `server.js` to ensure browsers never hold stale cached stylesheets. Tuned new account notice to play once for 15 seconds with persistent key so it can be verified cleanly.
- **Full-Width Top Navigation Bar Across Chat Sidebar (v3.0.6)**: Fixed `.top-nav` being truncated 280px short of the right viewport edge when `body.gchat-open` applied `padding-right: 280px`. Added `body.gchat-open .top-nav { width: calc(100% + 280px); margin-right: -280px; }` (with mobile reset) so the top navigation bar spans edge-to-edge above the chat sidebar while keeping `.stage` centered in the main column.
- **Extensive Mobile & Touch Support (v3.1.0)**:
  - **Viewport & iOS Safe-Area Ergonomics**: Added `viewport-fit=cover`, PWA web-app meta tags, `env(safe-area-inset-*)` padding across `.top-nav`, `.stage`, `.news-ticker`, `#gchat-sidebar`, `#gchat-mobile-toggle`, and `#music-toggle`, plus `16px` input font-size floor on mobile to prevent iOS Safari auto-zoom on focus.
  - **Mobile Navigation & Fullscreen Chat Drawer**: Upgraded `.nav-links.open` to a 2-column responsive pill grid with `68dvh` scroll and made `#gchat-sidebar` a `100dvh` safe-area aware mobile drawer. Enabled always-visible host kick/remove and staff delete buttons on touch devices (`@media (hover: none)`).
  - **Arcade Mobile Controls (`arcade.js`)**: Added on-screen Frutiger Aero D-Pad + canvas swipe gestures for Snake, Dig/Flag mode toggle + long-press flagging for Minesweeper, instant `pointerdown` + responsive target sizing for Firing Range, numeric keypad `inputmode="numeric"` for Math Rush, and fluid `vw` reel scaling for Lucky Slots.
  - **Deep Dive Mobile Companion Bar (`dungeon.js`)**: Added thumb-friendly tab bar (`Map`, `Stats`, `Forge`, `Skills`, `Config`) and touch inventory action modes (`⚡ Tap: Equip`, `🔍 Tap: Compare`, `🔨 Tap: Dismantle`) so mobile players can inspect item comparisons and dismantle gear without Shift-hover or right-click.
  - **Pirate Royale & Blitz Dual-Thumb Joysticks (`yohoho.js`, `shooter.js`)**: Added virtual analog thumbsticks + touch Swing/Dash and Aim/Auto-Fire controls alongside direct canvas touch drag/aiming.

---

## 6. Immediate Next Steps for Next AI Instance
1. **Verify Live Render State**: Check live `.onrender.com` logs to confirm `restore.js` and `server.js` are communicating cleanly with Neon.
2. **Modular Code Refactor (Optional)**: If refactoring, split `server.js` into modular game engine routers (`/games/frequency.js`, `/games/wordspy.js`, etc.) to reduce file size.
3. **Native Audio Assets (Optional)**: Drop offline `.mp3` files into `public/audio/` if Cole desires a 100% offline alternative to YouTube streaming.
