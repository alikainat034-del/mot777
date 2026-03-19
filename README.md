# MOT777 — Live Card Game Exchange
## Complete Setup Guide

---

## HOW IT WORKS

```
All Users → WebSocket → Node.js Server → Shared Game State
                              ↓
                    One game running for everyone
                    Same round, same cards, same odds
```

The server runs **11 card games** simultaneously. Every player connected sees the **same round** in real time. No two players ever see a different state.

---

## STEP 1 — Install Node.js

**Download from:** https://nodejs.org (LTS version)

Verify: `node --version` (should show v16+)

---

## STEP 2 — Install Dependencies

```bash
cd mot777-server
npm install
```

This installs: `express` and `ws` (WebSocket library)

---

## STEP 3 — Run the Server

```bash
node server.js
```

You'll see:
```
🎰 MOT777 Game Server running on port 3000
   http://localhost:3000
   WebSocket: ws://localhost:3000
   11 live games running
```

Open your browser: **http://localhost:3000**

---

## STEP 4 — Deploy to VPS/cPanel

### Option A: VPS (Ubuntu/Linux)

```bash
# Upload files to your VPS
scp -r mot777-server user@yourserver.com:/var/www/

# SSH into server
ssh user@yourserver.com

# Install PM2 (keeps server running 24/7)
npm install -g pm2

# Start the server
cd /var/www/mot777-server
npm install
pm2 start server.js --name mot777
pm2 save
pm2 startup
```

Server runs at: `http://yourserver.com:3000`

### Option B: cPanel with Node.js support

1. Go to cPanel → **Setup Node.js App**
2. Create new app:
   - Node.js version: 18+
   - Application root: `mot777-server`
   - Application URL: your domain
   - Application startup file: `server.js`
3. Click **Create**
4. Upload all files via File Manager
5. Run `npm install` in terminal

### Option C: Free hosting (Railway.app)

1. Go to **https://railway.app**
2. New Project → Deploy from GitHub
3. Upload your `mot777-server` folder
4. Railway auto-detects Node.js and deploys

---

## STEP 5 — Update Frontend URL

After deploying, open `public/index.html` and change the WebSocket URL:

```javascript
const WS_URL = window.location.hostname==='localhost'
  ? 'ws://localhost:3000'
  : `wss://yourdomain.com`;  // ← Update this
```

Use `wss://` (secure WebSocket) if your site uses HTTPS.

---

## NGINX REVERSE PROXY (recommended for VPS)

If you want `yourdomain.com` to serve the app (not port 3000):

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## GAME TIMING

| Phase | Duration | What Happens |
|-------|----------|-------------|
| Wait | 8s | Countdown to new round |
| Pre-Flop | 20s | Cards face-down, equal odds, bet now |
| Flop | 20s | 3 community cards revealed, odds update |
| Turn | 20s | 4th card revealed, odds tighten |
| River | 20s | 5th card revealed, final betting |
| Result | 6s | Winner shown, bets settled |

**Turbo games:** 12s per phase instead of 20s

---

## FEATURES

- ✅ 11 live card games (all users share same round)
- ✅ 4-phase betting: Pre-Flop → Flop → Turn → River
- ✅ Odds update dynamically as cards are revealed
- ✅ BACK / LAY exchange betting
- ✅ Live horse racing (UK & Ireland, simulated)
- ✅ Greyhound racing
- ✅ Football (Premier League, La Liga, Bundesliga, Serie A)
- ✅ Tennis, Cricket, Golf
- ✅ Derby race with animated 3-lap progression
- ✅ Bet slip with matched bets + settled bets
- ✅ Reconnects automatically if connection drops
- ✅ Mobile responsive

---

## DEFAULT LOGIN

```
Email:    ali@test.com
Password: 1234
```

Or register a new account (gets ₨1,000 welcome bonus)

---

## FILE STRUCTURE

```
mot777-server/
├── server.js          ← Node.js game server (run this)
├── package.json       ← Dependencies
├── README.md          ← This file
└── public/
    └── index.html     ← Frontend (served automatically)
```
