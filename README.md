# Verumen

Personal finance and gaming asset tracker. Track your stock portfolio, CS2 skin inventory, and connect with friends — all in one place.

## Features

- **Stock Portfolio** — Import CSVs from Avanza, Nordnet, or Montrose. Tracks holdings, P&L, dividends, and performance history via Yahoo Finance.
- **CS2 Skins** — Links to your Steam account to fetch your live inventory. Prices sourced from Skinport and Steam Market, auto-refreshed every 24 hours.
- **Social Feed** — Activity feed, announcements, and a friends system with follow requests.
- **Profiles** — Public profile pages with avatars, bios, country flags, and an item showcase.
- **Admin & Moderator Panels** — User management, role assignment, announcements, and moderation tools.
- **Dark / Light mode** — Persisted per session.

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express, deployed on Railway |
| Frontend | React 19 + Vite + Tailwind CSS v4, deployed on Vercel |
| Database & Auth | Supabase (PostgreSQL) |
| Stock data | Yahoo Finance (`yahoo-finance2`) |
| CS skin prices | Skinport API + Steam Community Market |
| Steam inventory | Steam Web API |

## Environment variables

Create a `.env` file in the project root:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Steam Web API (optional — enables Steam level lookup)
STEAM_API_KEY=your-steam-api-key

# Server (optional)
PORT=3000
BASE_URL=https://verumen.com
```

The frontend needs its own `.env` file at `frontend/.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Local development

```bash
# 1. Install dependencies
npm install
cd frontend && npm install && cd ..

# 2. Create .env files (see above)

# 3. Run setup to create the admin account
npm run setup

# 4. Start backend + frontend together
npm run dev
```

The backend runs on `http://localhost:3000` and the Vite dev server on `http://localhost:5173`. The frontend proxies `/api/*` to the backend automatically.

## Deployment

**Backend → Railway**

The `railway.json` is already configured. Push to your Railway service — it builds with Nixpacks and starts with `node server.js`.

Required env vars on Railway: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, and optionally `STEAM_API_KEY`.

**Frontend → Vercel**

Set the root directory to `frontend/`. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables. The `vite.config.js` rewrites `/api/*` to your Railway backend URL.

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
| `/admin` | Admin panel |
| `/moderator` | Moderator panel |

## Project structure

```
verumen/
  server.js              # Express API — all backend routes
  supabase.js            # Supabase client (service role + anon)
  setup.js               # First-time admin account creation
  railway.json           # Railway deployment config
  package.json
  frontend/
    src/
      App.jsx            # Root component, routing, portfolio state
      Sidebar.jsx        # Navigation sidebar
      GlobalBar.jsx      # Top bar — search, avatar, notifications
      SocialFeed.jsx     # Social feed + announcements
      CSSkins.jsx        # CS2 skin inventory + trade tracker
      SettingsPage.jsx   # Global settings
      FriendsPage.jsx    # Friends list + requests
      ProfileEditPage.jsx
      ProfilePageView.jsx
      AdminPanel.jsx
      ModeratorPanel.jsx
      apiCache.js        # Shared in-memory stale-while-revalidate cache
    vite.config.js
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start backend + Vite dev server concurrently |
| `npm start` | Start backend only (production) |
| `npm run setup` | Create the initial admin account |
