# Verumen

## Features

### Social
- **Feed** — Activity feed with announcements pinned by admins/moderators.
- **Friends** — Send and accept follow requests; pending requests show as a badge in the top bar.
- **Profiles** — Public profile pages with avatar, bio, country flag, and Steam level badge. Visibility can be toggled private.

### Stock Portfolio
- **Import** — Upload CSVs from Avanza, Nordnet, or Montrose to populate holdings and transactions.
- **Holdings** — Live prices via Finnhub with P&L per position. Manual ticker overrides supported.
- **Dividends** — Separate dividend tracker with CSV import.
- **Multi-currency** — All values stored in SEK; any display endpoint accepts `?currency=` (SEK, USD, EUR, GBP) using live FX from Frankfurter.

### CS2 Skins
- **Steam Inventory** — Fetches your live CS2 inventory via the Steam Web API. Cards show rarity gradient, wear, and StatTrak status. Sort by inventory order or rarity. Cached locally for 24 hours; manual refresh available.
- **Trade Registry** — Log every skin you buy and sell. Tracks skin name, exterior, float, pattern, buy price, sell price, date, notes, and a Steam screenshot link.
- **Register Trade** — Two modes:
  - *From Steam Inventory* — pick a skin from your live inventory; skin name, exterior, and icon are pre-filled.
  - *Enter Manually* — type any skin name with autocomplete from the price database; used for past trades no longer in your inventory.
- **P&L** — Overview shows total invested, realised gains/losses, and per-trade breakdown.
- **Inventory ↔ Registry link** — Inventory cards show an "In trade registry" badge and a "View in registry" swoop button. Unregistered items show an "Add to registry" button that opens the add form pre-filled with skin details.
- **Skin prices** — Market prices sourced from Skinport and Steam Community Market, refreshed automatically. Manual price overrides per skin supported.

### Admin & Moderation
- **Admin panel** — User management, role assignment (admin/moderator), registration on/off toggle, announcement publishing, email preview.
- **Moderator panel** — Subset of admin tools (announcements, moderation actions).

### Security
- Helmet HTTP headers, CORS origin restriction, rate limiting on auth endpoints, input validation.
- Access tokens held in JS module memory (not localStorage/sessionStorage). Refresh tokens are HttpOnly cookies, inaccessible to JavaScript. Atomic token invalidation on logout.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express, deployed on Railway |
| Frontend | React 19 + Vite + Tailwind CSS v4, deployed on Vercel |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| Stock data | [Finnhub](https://finnhub.io) (free tier) + [Frankfurter](https://frankfurter.app) (FX rates) |
| CS2 skin prices | Skinport API + Steam Community Market |
| Steam inventory | Steam Web API |
| Email | [Resend](https://resend.com) — verification & password reset (optional) |

---

## Environment variables

Create a `.env` file in the project root:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-public-key   # used for JWT signature verification

# Finnhub (stock prices — free tier, sign up at finnhub.io)
FINNHUB_API_KEY=your-finnhub-api-key

# Steam Web API (required for Steam inventory and level lookup)
STEAM_API_KEY=your-steam-api-key

# Resend (optional — enables verification and password-reset emails)
RESEND_API_KEY=your-resend-api-key

# Server
PORT=3000
APP_URL=https://verumen.com   # used for CORS and email links
BASE_URL=https://verumen.com  # used for Steam OAuth callbacks
```

---

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

---

## Deployment

**Backend → Railway**

The `railway.json` is already configured. Push to your Railway service — it builds with Nixpacks and starts with `node server.js`.

Required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `FINNHUB_API_KEY`, `APP_URL`, `BASE_URL`.
Optional: `STEAM_API_KEY`, `RESEND_API_KEY`.
Set `NODE_ENV=production` so the refresh token cookie is issued with the `Secure` flag.

**Frontend → Vercel**

Set the root directory to `frontend/`. No extra environment variables needed — `vercel.json` rewrites `/api/*` to your Railway backend URL.

---

## Database migrations

Run these in the Supabase SQL editor when setting up or upgrading:

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

-- CS2 trade registry: link to Steam inventory item
ALTER TABLE cs_inventory ADD COLUMN IF NOT EXISTS steam_asset_id TEXT;

-- Profile visibility toggle (public by default)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
```

---

## Routes

| Route | Page |
|---|---|
| `/home` | Social feed |
| `/friends` | Friends list and requests |
| `/portfolio/overview` | Stock portfolio summary |
| `/portfolio/holdings` | Holdings list |
| `/portfolio/transactions` | Transaction history |
| `/portfolio/dividends` | Dividend tracker |
| `/portfolio/import` | Upload broker CSV |
| `/portfolio/import-dividends` | Upload dividend CSV |
| `/portfolio/settings` | Ticker price overrides |
| `/skins/overview` | CS2 skin portfolio summary |
| `/skins/inventory` | Live Steam inventory |
| `/skins/traderegistry` | Trade registry |
| `/settings` | Global settings (currency, price sync) |
| `/user/:username` | Public profile page |
| `/user/:username/edit` | Edit your profile |
| `/adminpanel` | Admin panel |
| `/moderatorpanel` | Moderator panel |

---

## Project structure

```
verumen/
  server.js              # Express API — all backend routes
  supabase.js            # Three Supabase clients: db (queries), supabase (auth ops), supabaseAnon (JWT verify)
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
      CSSkins.jsx        # CS2 skin inventory + trade registry
      SettingsPage.jsx   # Global settings
      FriendsPage.jsx    # Friends list + requests
      ProfileEditPage.jsx
      ProfilePageView.jsx
      apiCache.js        # In-memory stale-while-revalidate cache
      tokenStore.js      # Access token held in module memory (never persisted)
    vercel.json          # Vercel rewrite rules (proxies /api/* to Railway)
    vite.config.js       # Dev proxy config
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start backend + Vite dev server concurrently |
| `npm start` | Start backend only (production) |
| `npm run setup` | Create the initial admin account |
