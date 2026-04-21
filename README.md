# Lobby 98

A social deduction party game platform. Scribbl-style — no accounts, no signups. Make a room, share the code, play.

This is **Phase 1: the platform**. Games get added in later phases.

## What's here in Phase 1

- **Rooms with 4-letter join codes** (no confusing O/0 or I/1)
- **Chat** inside each room
- **Host controls** — first person in the room is the host, can kick players, picks the game
- **Host migration** — if the host leaves, the next player becomes host
- **Auto-cleanup** — rooms disappear when empty, zero state to manage
- **Frutiger Aero + neomorphism UI** — frosted glass panels, floating bubbles, soft pastel gradients, aquatic vibes

All six game modes are shown but marked "soon" — they come online in later phases.

## Run it locally

```bash
npm install
npm start
```

Open **http://localhost:3000**. Create a room in one browser tab, join from another tab (use the code).

## Deploy to Render

1. Push this folder to a GitHub repo (`git init`, `git add .`, `git commit -m "Initial commit"`, create repo on GitHub, push)
2. On Render: **New → Web Service**, pick the repo
3. Runtime: Node. Build: `npm install`. Start: `npm start`. Instance: Free.
4. Deploy. ~3 minutes.

**No database, no persistent disk needed.** The free tier is perfect for this — rooms are in-memory and short-lived anyway, so the "goes to sleep after 15 min" behavior doesn't matter. First request after sleep takes ~30 seconds to wake up, then it's snappy.

## File structure

```
lobby98/
├── server.js          # Express + Socket.IO, room system
├── package.json
└── public/
    ├── index.html     # Home / room / kicked views
    ├── css/style.css  # Frutiger Aero + neomorphism
    └── js/client.js   # Socket.IO wiring, view switching, host controls
```

## The mental model

- The server keeps rooms in a `Map<code, Room>` in memory.
- Each socket is tracked against a room code so leave/kick/disconnect all route cleanly.
- When a player joins, they get the full snapshot (players, host, chat history last 50 msgs).
- When anything changes (join, leave, host change, mode pick), server broadcasts a new snapshot to everyone in the room.
- No accounts means no passwords, no cookies, no sessions — the socket connection itself is the "identity".

## What comes next (Phase 2)

Frequency will become the first playable game. Mechanics: everyone gets a prompt like "rate how weird it would be to eat cereal for dinner, 1-10"; one player (the Off-Key) gets a slightly different prompt; everyone shares numbers; group votes on who had the wrong prompt. The bones are already there from the original Off-Key project — we'll port that into this room system.

## What to do right now

1. `npm install`
2. `npm start`
3. Open two browser tabs to `localhost:3000`. Create a room in one, join with the code in the other. Chat, try kicking, leave and rejoin.
4. When it feels right, deploy to Render and share the link with a friend to stress-test with two real browsers across the internet.
