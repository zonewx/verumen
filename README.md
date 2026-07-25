# Verumen

## Features

- **Stock Portfolio** — Import CSVs from Avanza, Nordnet, or Montrose. Tracks holdings, P&L, dividends, and performance history via Yahoo Finance.
- **CS2 Skins** — Links to your Steam account to fetch your live inventory. Prices sourced from Skinport and Steam Market, auto-refreshed every 24 hours.
- **Social Feed** — Activity feed, announcements, and a friends system with follow requests.
- **Profiles** — Public profile pages with avatars, bios, country flags, and an item showcase.
- **Admin & Moderator Panels** — User management, role assignment, announcements, registration control, and email previews.
- **Security** — Helmet HTTP headers, CORS origin restriction, rate limiting on auth endpoints, input validation, atomic token invalidation. Access tokens are held in JS module memory (not sessionStorage); refresh tokens are HttpOnly cookies, inaccessible to JavaScript.

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express, deployed on Railway |
| Frontend | React 19 + Vite + Tailwind CSS v4, deployed on Vercel |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| Stock data | [Finnhub](https://finnhub.io) (free tier) + [Frankfurter](https://frankfurter.app) (FX) |
| CS skin prices | Skinport API + Steam Community Market |
| Steam inventory | Steam Web API |

## Environment variables

Create a `.env` file in the project root:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Finnhub (stock prices — free tier, sign up at finnhub.io)
FINNHUB_API_KEY=your-finnhub-api-key

# Steam Web API (optional — enables Steam level lookup)
STEAM_API_KEY=your-steam-api-key

# Server
PORT=3000
APP_URL=https://verumen.com   # used for CORS and email links
BASE_URL=https://verumen.com  # used for Steam OAuth callbacks
```

## Local development

```bash
# 1. Install dependencies
npm install
cd frontend && npm install && cd ..

# 2. Create .env (see above)

# 3. Run setup to create the admin account
npm run setup

# 4. Start backend + frontend together
npm run dev
```

The backend runs on `http://localhost:3000` and the Vite dev server on `http://localhost:5173`. The frontend proxies `/api/*` to the backend automatically.

## Deployment

**Backend → Railway**

The `railway.json` is already configured. Push to your Railway service — it builds with Nixpacks and starts with `node server.js`.

Required env vars on Railway: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `FINNHUB_API_KEY`, `APP_URL`, `BASE_URL`, and optionally `STEAM_API_KEY`. Set `NODE_ENV=production` so the refresh token cookie is issued with the `Secure` flag.

**Frontend → Vercel**

Set the root directory to `frontend/`. No extra environment variables are needed — the `vercel.json` rewrites `/api/*` to your Railway backend URL.

## Database migrations

Run these in the Supabase SQL editor when setting up or after upgrading:

```sql
-- Admin panel settings persistence
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- CS2 trade registry: unguessable public share links
ALTER TABLE cs_inventory ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT gen_random_uuid();
UPDATE cs_inventory SET share_token = gen_random_uuid() WHERE share_token IS NULL;

-- CS2 trade registry: Steam item thumbnail URL
ALTER TABLE cs_inventory ADD COLUMN IF NOT EXISTS icon_url TEXT;
```

## Routes

| Route | Page |
|---|---|
| `/social` | Social feed (default landing page) |
| `/portfolio` | Stock portfolio overview |
| `/portfolio/holdings` | Holdings list |
| `/portfolio/transactions` | Transaction history |
| `/portfolio/dividends` | Dividend tracker |
| `/portfolio/ownership` | Ownership breakdown |
| `/cs-skins` | CS2 skin inventory overview |
| `/cs-skins/inventory` | Full Steam inventory |
| `/cs-skins/tracker` | Trade registry |
| `/cs-skins/settings` | CS skin settings |
| `/settings` | Global settings (currency, price sync) |
| `/friends` | Friends list |
| `/profile/edit` | Edit your profile |
| `/profile/@username` | Public profile page |
| `/adminpanel` | Admin panel |
| `/moderatorpanel` | Moderator panel |

## Project structure

```
verumen/
  server.js              # Express API — all backend routes
  supabase.js            # Supabase client (service role only)
  setup.js               # First-time admin account creation
  railway.json           # Railway deployment config
  package.json
  frontend/
    src/
      App.jsx            # Root component, routing, auth, portfolio state
      Sidebar.jsx        # Navigation sidebar
      GlobalBar.jsx      # Top bar — search, avatar, notifications
      AdminPanel.jsx
      ModeratorPanel.jsx
      SocialFeed.jsx     # Social feed + announcements
      CSSkins.jsx        # CS2 skin inventory + trade tracker
      SettingsPage.jsx   # Global settings
      FriendsPage.jsx    # Friends list + requests
      ProfileEditPage.jsx
      ProfilePageView.jsx
      apiCache.js        # Shared in-memory stale-while-revalidate cache
    vercel.json          # Vercel rewrite rules (proxies /api/* to Railway)
    vite.config.js       # Dev proxy config
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start backend + Vite dev server concurrently |
| `npm start` | Start backend only (production) |
| `npm run setup` | Create the initial admin account |
