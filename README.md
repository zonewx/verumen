# OUTDATED

# Statera

Portfolio tracker and CS skin inventory manager.

## Stack
- **Backend**: Node.js + Express
- **Frontend**: React 19 + Vite + Tailwind CSS
- **Database**: SQLite (via better-sqlite3) for CS skins
- **Data**: Yahoo Finance (stocks), csgotrader.app (CS prices)

## Dev setup

```bash
npm install
npm run dev
```

Frontend runs on http://localhost:5173  
Backend runs on http://localhost:3000

## Structure

```
statera/
  server.js          # Express API
  db.js              # SQLite setup for CS features
  package.json
  frontend/
    src/
      App.jsx        # Main app (portfolio tracker + home screen)
      CSSkins.jsx    # CS skins section
      index.css
      main.jsx
    public/
    index.html
    package.json
    vite.config.js
```
