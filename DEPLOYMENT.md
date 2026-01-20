# Deployment Guide

This project uses a split deployment architecture:
- **Frontend**: Vercel, Netlify, or Cloudflare Pages (free tier)
- **Backend**: Railway (free tier with $5 credit/month)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        USER BROWSER                         │
└─────────────────────┬───────────────────┬───────────────────┘
                      │                   │
                 HTTPS│              WebSocket
                      │                   │
                      ▼                   ▼
┌─────────────────────────────┐  ┌────────────────────────────┐
│   VERCEL / NETLIFY / CF     │  │         RAILWAY            │
│   ────────────────────────  │  │   ──────────────────────── │
│   • Static HTML/CSS/JS      │  │   • Node.js Express server │
│   • 3D models (.glb)        │  │   • WebSocket server       │
│   • Images, fonts           │  │   • Python (FastF1)        │
└─────────────────────────────┘  └────────────────────────────┘
```

---

## Step 1: Deploy Backend to Railway

### 1.1 Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### 1.2 Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Connect your repository

### 1.3 Configure Environment
Railway will auto-detect the `railway.json` and `nixpacks.toml` configuration.

No environment variables needed for the backend - it uses defaults.

### 1.4 Get Your Backend URL
After deployment, Railway will provide a URL like:
```
https://your-app-name.up.railway.app
```

Note this URL - you'll need it for the frontend.

---

## Step 2: Deploy Frontend to Vercel

### 2.1 Create Vercel Account
1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub

### 2.2 Import Project
1. Click "Add New" → "Project"
2. Import your GitHub repository

### 2.3 Configure Build Settings
Vercel should auto-detect Vite. Verify:
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### 2.4 Set Environment Variables
In Vercel dashboard → Settings → Environment Variables, add:

| Variable | Value | Example |
|----------|-------|---------|
| `VITE_API_URL` | Your Railway URL + `/api` | `https://your-app.up.railway.app/api` |
| `VITE_WS_URL` | Your Railway URL (wss://) | `wss://your-app.up.railway.app` |

> ⚠️ **Important**: Use `wss://` (not `ws://`) for WebSocket in production!

### 2.5 Deploy
Click "Deploy" - Vercel will build and deploy your frontend.

---

## Alternative: Deploy Frontend to Netlify

### Set Environment Variables
In Netlify dashboard → Site settings → Environment variables:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://your-app.up.railway.app/api` |
| `VITE_WS_URL` | `wss://your-app.up.railway.app` |

---

## Local Development

For local development, the defaults work out of the box:

```bash
# Terminal 1: Start backend
cd backend/node
npm install
npm start

# Terminal 2: Start frontend
npm install
npm run dev
```

Or create a `.env.local` file (copy from `.env.example`):
```env
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3001
```

---

## Troubleshooting

### WebSocket Connection Failed
- Ensure you're using `wss://` (not `ws://`) in production
- Check that Railway backend is running (visit `/health` endpoint)
- Verify CORS is properly configured (it is by default)

### Backend Cold Starts (Railway Free Tier)
Railway may sleep your app after inactivity. First request may take 10-30 seconds.

### Python/FastF1 Errors
Ensure the Python dependencies are installed. Check Railway build logs for errors.

---

## Estimated Costs

| Service | Tier | Cost |
|---------|------|------|
| Vercel/Netlify | Free | $0 |
| Railway | Free ($5 credit) | ~$0-5/month |
| **Total** | | **$0-5/month** |
