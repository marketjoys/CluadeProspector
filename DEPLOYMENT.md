# ProspectRadar v3 — Deployment Guide

## What's in this package

| File | Purpose |
|---|---|
| `prospect-radar-v3.html` | Full widget app — host as static page |
| `proxy-server.js` | Backend proxy — keeps keys server-side |
| `prospect-radar-embed.js` | One-script embed for any website |
| `DEPLOYMENT.md` | This file |

---

## How it works (real pipeline)

```
1. User enters seed: "stripe.com"
        │
        ▼
2. Exa.ai /search  →  crawls stripe.com, gets text
        │
        ▼
3. Claude  →  extracts ICP: {industry, size, model, segment, pains}
        │
        ▼
4. Exa.ai /findSimilar(stripe.com)  →  20 similar URLs
        │
        ▼
5. Exa.ai /search × 4-5 ICP-derived queries  →  more candidates
        │
        ▼
6. Exa.ai /contents  →  crawls candidate pages for rich text
        │
        ▼
7. Claude  →  scores each 1-10 against ICP, writes why_fit + hook
        │
        ▼
8. Dedupe by domain  →  25 fresh results, batch N
```

Different seed = different crawl = different ICP = different results.

---

## STEP 1 — Get API Keys

### Exa.ai (required — the crawler)
1. Go to https://exa.ai
2. Sign up → Dashboard → API Keys → Create key
3. Copy key (starts with `exa-...`)
4. **Free tier**: 1,000 searches/month

### Anthropic (required — the intelligence)
1. Go to https://console.anthropic.com
2. API Keys → Create key
3. Copy key (starts with `sk-ant-...`)
4. **Pay-as-you-go**: ~$0.003 per search

---

## STEP 2 — Quick test (dev mode, keys in browser)

**No server needed for quick testing:**

1. Open `prospect-radar-v3.html` in a browser (file:// or local server)
2. Click **⚙ Keys** in the top-right
3. Enter your Exa.ai key and Anthropic key
4. Click **Test** to verify each key works
5. Search for `stripe.com`

> ⚠️ Dev mode only — never ship API keys in browser HTML to production.

---

## STEP 3 — Deploy the Proxy Server (production)

```bash
mkdir pr-proxy && cd pr-proxy
npm init -y
npm install express node-fetch@2 express-rate-limit cors dotenv
```

Copy `proxy-server.js` here. Create `.env`:
```
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY
EXA_API_KEY=exa-YOUR_KEY
PORT=3001
ALLOWED_ORIGINS=https://yoursite.com
RATE_LIMIT_RPM=30
```

```bash
node proxy-server.js
# ⬡ ProspectRadar Proxy running on :3001
# Exa.ai:    ✓
# Anthropic: ✓
```

### Deploy proxy to cloud

**Railway (easiest, free tier):**
```bash
npm install -g @railway/cli
railway login && railway init && railway up
railway variables set ANTHROPIC_API_KEY=sk-ant-... EXA_API_KEY=exa-...
```

**Render:** New Web Service → connect repo → set env vars → deploy

**Fly.io:**
```bash
fly launch --name pr-proxy
fly secrets set ANTHROPIC_API_KEY=sk-ant-... EXA_API_KEY=exa-...
fly deploy
```

**Docker:**
```bash
docker build -t pr-proxy .
docker run -p 3001:3001 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e EXA_API_KEY=exa-... \
  -e ALLOWED_ORIGINS=https://yoursite.com \
  pr-proxy
```

---

## STEP 4 — Host the Widget HTML

Edit `prospect-radar-v3.html`. Add before `</body>` to pre-configure proxy:

```html
<script>
  window.PROXY_URL = 'https://your-proxy.com';
  // Keys are optional here if proxy has them server-side
  // window.PR_EXA_KEY = '...';
</script>
```

Host anywhere as a static file:
```bash
# Netlify
mkdir widget && cp prospect-radar-v3.html widget/index.html
npx netlify deploy --prod --dir widget

# Vercel
cp prospect-radar-v3.html index.html && npx vercel --prod

# nginx
cp prospect-radar-v3.html /var/www/html/widget/index.html
```

---

## STEP 5 — Embed on Any Website

### Option A: Floating button (one script tag)
```html
<!-- Add before </body> on any page -->
<script
  src="https://your-cdn.com/prospect-radar-embed.js"
  data-widget-url="https://your-widget-host.com/"
  data-proxy="https://your-proxy.com"
  data-position="bottom-right"
  data-label="Find Prospects"
  data-accent="#818cf8"
></script>
```
Creates a glowing ⬡ button. Click opens draggable panel.

### Option B: Inline embed
```html
<div id="prospect-widget"></div>

<script
  src="https://your-cdn.com/prospect-radar-embed.js"
  data-widget-url="https://your-widget-host.com/"
  data-proxy="https://your-proxy.com"
  data-position="inline:#prospect-widget"
  data-height="720"
></script>
```

### Option C: Keys pre-injected via embed script
```html
<script
  src="https://your-cdn.com/prospect-radar-embed.js"
  data-widget-url="https://your-widget-host.com/"
  data-exa-key="exa-..."
  data-anthropic-key="sk-ant-..."
></script>
```
> Use only if your site is behind authentication. Otherwise use proxy.

### Option D: React
```jsx
import { useEffect } from 'react';
export function ProspectRadar() {
  useEffect(() => {
    const s = document.createElement('script');
    s.src = 'https://your-cdn.com/prospect-radar-embed.js';
    Object.assign(s.dataset, {
      widgetUrl: 'https://your-widget-host.com/',
      proxy: 'https://your-proxy.com',
      position: 'bottom-right',
    });
    document.body.appendChild(s);
    return () => document.body.removeChild(s);
  }, []);
  return null;
}
```

### Option E: Webflow / WordPress / Wix / Framer
Paste the script tag in Custom Code → Before </body> section.

---

## Embed config options

| Attribute | Default | Notes |
|---|---|---|
| `data-widget-url` | — | **Required** — hosted widget URL |
| `data-proxy` | — | Backend proxy URL |
| `data-exa-key` | — | Exa.ai key (use proxy instead in prod) |
| `data-anthropic-key` | — | Anthropic key (use proxy instead in prod) |
| `data-position` | `bottom-right` | `bottom-right`, `bottom-left`, `inline:#selector` |
| `data-label` | `Find Prospects` | FAB button text |
| `data-icon` | `⬡` | FAB icon |
| `data-accent` | `#818cf8` | Brand colour hex |
| `data-width` | `1100` | Panel width px |
| `data-height` | `680` | Panel height px |
| `data-z-index` | `9999` | Overlay z-index |

---

## JavaScript API

```javascript
ProspectRadar.open();    // Open panel
ProspectRadar.close();   // Close panel
ProspectRadar.toggle();  // Toggle
ProspectRadar.version;   // "3.0.0"
```

---

## Cost estimate

| Step | Exa.ai calls | Claude calls | ~Cost |
|---|---|---|---|
| Seed crawl | 3-5 searches | 1 ICP extract | $0.002 |
| Each batch 25 | 5-8 searches + 15 contents | 1 scoring call | $0.015 |
| Full 1000 session | ~350 calls | ~42 calls | ~$0.75 |

Exa.ai free tier: 1000 searches/month. Starter: $5/month unlimited.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Exa key test fails | Check key at exa.ai dashboard, ensure correct format |
| Anthropic test fails | Check key at console.anthropic.com/api-keys |
| CORS error | Set `ALLOWED_ORIGINS` in proxy `.env` to your site domain |
| 0 results | Try a specific domain like `intercom.com` instead of a vague query |
| Same results | Each search uses real Exa crawl — if persisting, clear session |
| findSimilar error | Exa may not index the domain — falls back to search queries |
| Rate limit | Default 30 req/min — increase `RATE_LIMIT_RPM` in proxy |
| Iframe blocked | Your site's CSP may block iframes — use the embed.js script instead |
| Mobile broken | Widget auto-fullscreen on <600px — expected behavior |
| Overloaded error | Auto-retried 3x — if persists, wait 30s |

---

*ProspectRadar v3.0 · Powered by Exa.ai + Anthropic Claude*
