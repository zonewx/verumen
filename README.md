# Statera

Portfolio tracker and CS skin inventory manager.

## Stack
- **Backend**: Node.js + Express
- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **Database**: SQLite (via sqlite3) for CS skins
- **Data**: Yahoo Finance (stocks), Steam API (CS inventory)

## First-time setup (new machine)

```bash
# 1. Install dependencies
npm install
cd frontend && npm install && cd ..

# 2. Create admin account
npm run setup
# Follow the prompts to set your admin password
# OR set STATERA_ADMIN_PASSWORD in a .env file to skip the prompt

# 3. Start the app
npm run dev
```

## Subsequent runs

```bash
npm run dev
```

## Environment variables

Copy `.env.example` to `.env` and fill in values as needed:

```bash
cp .env.example .env
```

## URL structure

| Route | Page |
|-------|------|
| `/` | Home screen |
| `/portfolio` | Portfolio tracker |
| `/skins` | CS Skins |
| `/social` | Social feed |
| `/profile` | Your profile |
| `/profile/@username` | User's public profile |
| `/admin` | Admin panel |
| `/moderator` | Moderator panel |

## Project structure

```
statera/
  server.js          # Express API
  setup.js           # First-time setup script
  db.js              # SQLite setup for CS features
  package.json
  .env.example       # Environment variable template
  frontend/
    src/
      App.jsx        # Main app + routing
      CSSkins.jsx    # CS skins section
      ProfilePage.jsx
      GlobalBar.jsx
      AdminPanel.jsx
      ModeratorPanel.jsx
      SocialFeed.jsx
      PortfolioSidebar.jsx
    vite.config.js
```
