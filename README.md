# Lobby 98

A social deduction party game platform. Scribbl-style — no accounts, no signups. Make a room, share the code, play.

## Playable games

### 🎵 Frequency
Everyone gets a prompt and rates it 1-10. One player (the "Off-Key") secretly sees a *different* prompt. After everyone submits, the group discusses and votes on who had the wrong prompt. 3+ players.

### 🕵️ Word Spy
Everyone gets the same secret word — except the Spy, who only sees the category. Players take turns giving a one-word clue to prove they know the word (without making it too obvious for the Spy). After all clues, the group votes on who they think is the Spy. If caught, the Spy gets one last chance to guess the word — nail it and they still win. 3+ players.

### ⛓️ Chain
Players collaboratively build a sentence one word at a time, taking turns. One player (the Saboteur) has a secret target word they must sneak into the sentence. If they succeed without being caught, they win big. But anyone can call an accusation at any time — if they're right, the group wins. If they're wrong, the Saboteur wins and the accuser loses a point. 3+ players.

## Platform features

- **Rooms with 4-letter join codes** (no confusing O/0 or I/1)
- **Chat** inside each room
- **Host controls** — first person is the host, can kick players, picks the game, controls round count
- **Host migration** — if the host leaves, the next player becomes host
- **Ghost mode** — join mid-game as a spectator, rejoin as a player when the game ends
- **Profile system** — saved locally. Pick a display name, choose a name color, equip a title. Stats track your games, wins, and total points.
- **Cosmetic shop** — earn coins by scoring points in games (1 coin per point). Spend on name colors (Cyan, Emerald, Sunset, Gold, Aurora...) and titles (Spy Hunter, Mastermind, Lobby Legend...). No gambling, no loot boxes.
- **Frutiger Aero UI** — glossy glass panels, floating bubbles, soft bokeh, aquatic gradients, animated orbs, neomorphic controls
- **Auto-cleanup** — rooms disappear when empty

## Run it locally

```bash
npm install
npm start
```

Open **http://localhost:3000**. Create a room in one tab, join from another with the code.

## Deploy to Render

1. Push to GitHub (`git init`, `git add .`, `git commit`, create repo, push)
2. Render: **New → Web Service**, pick the repo
3. Runtime: Node. Build: `npm install`. Start: `npm start`. Free tier.
4. ~3 minutes to deploy.

No database, no persistent disk needed.

## File structure

```
lobby98/
├── server.js          # Express + Socket.IO, rooms, Frequency + Word Spy + Chain engines
├── prompts.js         # Frequency prompt pairs (50 pairs)
├── words.js           # Word Spy word bank (8 categories × 25 words)
├── chains.js          # Chain starter phrases (25) + target words (50)
├── package.json
└── public/
    ├── index.html     # Home / room / game / kicked views
    ├── css/style.css  # Frutiger Aero: glass, bokeh, bubbles, overlays, game styles
    └── js/client.js   # Socket.IO, game rendering, profile system, cosmetic shop
```

## What comes next

More games from the design doc: Echo, Two Truths One Ghost, Draw. Each follows the same hidden-info social deduction pattern.
