# Shaun & Jemma's Tracker

A lightweight two-profile fitness tracker PWA for Shaun and Jemma.

**Live app:** https://shaun-parker2.github.io/fitness-tracker/

## What it tracks
- **Weight** (daily, charted with a 7-day moving average so noise doesn't demotivate)
- **4 KPIs** per day (one tap each):
  - Steps ≥ 8,000
  - Low/no UPF day
  - Exercise (run or weights)
  - No booze
- **Free-text note**
- **Backfill for missed days** with the date picker on the Log tab

## What it shows
- Weight chart with both profiles and 7-day averages
- Exercise this week side-by-side
- Last-30-day KPI completion side-by-side
- Current streaks side-by-side
- 21-day traffic-light matrix for all four KPIs

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
- Local cache is stored in `localStorage` under key `trend.v1`.
- Shared sync is handled by Supabase when `CLOUD_CONFIG` is populated in `app.js`.
- Changes auto-push to cloud, and the app auto-pulls while open.
- **Export JSON** from the History tab as a manual backup.
- Import JSON merges a backup back in.

## Roadmap (if you want it later)
- Apple Health / Google Fit auto-pull for steps & weight
- Weekly summary email on Sunday night
- Configurable KPIs / weight unit
