# Verumen

A home for focused, independent tools. Each tool runs on one shared foundation: accounts, profiles, a social layer and administration.

[verumen.com](https://verumen.com)

---

## Tools

| Tool | Description | Path |
|---|---|---|
| **Skins** | Track CS2 skin trades, from purchase to sale, with profit and loss. | `/skins` |

New tools are added as their own modules on the same platform.

<details>
<summary><strong>Skins</strong></summary>

- **Trade registry.** Records each buy and sale: item, float, pattern, stickers, prices, dates, notes and an optional Steam screenshot.
- **Steam inventory.** Shows your live CS2 inventory and links each item to its registry entry.
- **Profit and loss.** Totals invested and realised gains, worked out from the prices you enter.
- **USD only.** Prices are what you paid and received, in USD. Nothing is fetched from third parties and nothing is converted.
- **Sharing.** Every trade can be shared through a public link that can't be guessed.

</details>

## Platform

- **Accounts.** Email sign-up with verification, password reset and Steam account linking.
- **Profiles.** A public page per user, with privacy controls.
- **Social.** An activity feed, friends and announcements.
- **Administration.** Role-based admin and moderator panels, user management and a moderation log.
- **Security.** Access tokens are held in memory only, and refresh tokens are HttpOnly cookies. Auth endpoints are rate-limited, HTTP headers are hardened and CORS is restricted.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4 (Vercel) |
| Backend | Node.js, Express (Railway) |
| Data & auth | Supabase: PostgreSQL, Auth and Realtime |
| Email | Resend |
| Integrations | Steam Web API |

---

## Getting started

```bash
npm install
npm --prefix frontend install
npm run setup     # creates the admin account
npm run dev       # API on :3000, web on :5173 (proxies /api)
```

### Environment

Create `.env` in the project root:

```env
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_ANON_KEY=

APP_URL=https://verumen.com
BASE_URL=https://verumen.com
PORT=3000
# NODE_ENV=production   # set in production only (secure cookies)

ROOT_ADMIN_ID=          # auth user id of the root admin
RECOVERY_ADMIN_ID=      # optional

STEAM_API_KEY=          # Skins: inventory and Steam level
RESEND_API_KEY=         # optional: transactional email
```

---

## Deployment

| Target | Notes |
|---|---|
| **Railway** (API) | Configured in `railway.json`; starts with `node server.js`. |
| **Vercel** (web) | Root directory is `frontend/`; `vercel.json` routes `/api/*` to Railway. |

Every push to `main` deploys to both.

---

## Structure

```
server.js            API
supabase.js          Database and auth clients
setup.js             First-run admin setup
frontend/src/
  App.jsx            Routing and session
  GlobalBar.jsx      Top bar
  SocialFeed.jsx     Feed
  ProfilePageView.jsx
  AdminPanel.jsx
  ModeratorPanel.jsx
  CSSkins.jsx        Skins tool
```

---

<sub>Verumen operates independently and is not affiliated with any other entity.</sub>
