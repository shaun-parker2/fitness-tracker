# Trend

A tiny personal fitness tracker. Zero accounts, zero servers — a Progressive Web App that stores everything in your phone's browser.

## What it tracks
- **Weight** (daily, charted with a 7-day moving average so noise doesn't demotivate)
- **3 KPIs** per day (one tap each):
  - Steps ≥ 8,000
  - Low/no UPF day
  - Exercise (run or weights)
- **Beers** counter (because Thu–Sun is real life)
- **Free-text note**

## What it shows
- Weight chart (60 days) with 7-day avg overlay
- Exercise this week: X / 5
- Last-30-day completion % per KPI
- Current streak per KPI
- Beers total + weekly average

## Run locally
Just open `index.html` in a browser. For service-worker / PWA install to work, you need to serve it over HTTP(S) (not `file://`).

Quickest option (any of these):

```powershell
# Python
python -m http.server 8080
# Then visit http://localhost:8080
```

```powershell
# Node (one-off)
npx serve .
```

## Deploy to GitHub Pages (recommended)
1. Create a new GitHub repo (private is fine) and push this folder to it.
2. In the repo: **Settings → Pages → Build from branch → `main` / root**.
3. Wait ~30 seconds. You'll get a URL like `https://<you>.github.io/<repo>/`.
4. Open it on your phone in Chrome / Safari → **Add to Home Screen**. It becomes an app icon and runs offline.

### Manual deploy commands

```powershell
cd "C:\Users\shaunparker\OneDrive - Downing Property Services Ltd\Workspace\fitness-tracker"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-user>/<repo>.git
git push -u origin main
```

## Data
- Stored in `localStorage` under key `trend.v1`.
- **Export JSON** regularly from the History tab (it's your backup).
- Import JSON to merge a backup back in.
- Data is **per device / per browser** — if you want it synced across phone + laptop, we'll bolt on Supabase later (~30 lines of code).

## Roadmap (if you want it later)
- Supabase sync so phone + laptop share the same data
- Second profile for your wife
- Apple Health / Google Fit auto-pull for steps & weight
- Weekly summary email on Sunday night
- Configurable KPIs / weight unit
