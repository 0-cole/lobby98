# Lobby 98 — Railway Deployment Guide

## Why accounts disappear on redeploy

Railway rebuilds your container from scratch on every push. The SQLite database
file (`lobby98.db`) lives inside the container by default, so it gets wiped.

## The fix: Persistent Volume

1. In your Railway project, go to your service → **Settings** → **Volumes**
2. Click **Add Volume**
3. Set the mount path to: `/data`
4. Go to **Variables** and add: `DB_DIR=/data`
5. Redeploy

Now the database lives on Railway's persistent disk. Pushes rebuild the code
but the `/data` volume stays untouched. Accounts, coins, inventories — everything
survives.

## How sessions work

- When a user logs in, the server sets an `httpOnly` cookie (30-day expiry)
- On page load, the client calls `/api/me` which checks the cookie
- If the cookie matches a valid session in the database, they're auto-logged in
- No manual re-login needed — as long as the database persists

## Quick checklist

- [ ] Railway Volume mounted at `/data`
- [ ] Environment variable `DB_DIR=/data`
- [ ] Never delete the Volume in Railway's dashboard
- [ ] The `data/` folder in the repo is just a fallback for local development
