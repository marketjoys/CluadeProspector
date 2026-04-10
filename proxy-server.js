/**
 * ProspectRadar Production Proxy Server
 * Routes: POST /api/exa/search
 *         POST /api/exa/findSimilar
 *         POST /api/exa/contents
 *         POST /api/claude
 *         GET  /health
 *
 * Install: npm install express node-fetch@2 express-rate-limit cors dotenv
 * Run:     node proxy-server.js
 *
 * .env:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   EXA_API_KEY=...
 *   PORT=3001
 *   ALLOWED_ORIGINS=https://yoursite.com
 *   RATE_LIMIT_RPM=30
 */
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const EXA_KEY = process.env.EXA_API_KEY;

if (!ANTHROPIC_KEY) { console.error('ERROR: ANTHROPIC_API_KEY not set'); process.exit(1); }
if (!EXA_KEY) { console.warn('[WARN] EXA_API_KEY not set - Exa calls require client key'); }

const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (allowed[0] === '*' || !origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json({ limit: '4mb' }));

const limiter = rateLimit({
  windowMs: 60000,
  max: parseInt(process.env.RATE_LIMIT_RPM || '30'),
  standardHeaders: true, legacyHeaders: false,
  message: { error: { type: 'rate_limit', message: 'Too many requests' } },
  keyGenerator: req => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
});
app.use('/api/', limiter);

app.use((req, _res, next) => {
  if (req.method !== 'OPTIONS') {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${ip}`);
  }
  next();
});

app.get('/health', (_, res) => res.json({ status: 'ok', ts: Date.now(), anthropic: !!ANTHROPIC_KEY, exa: !!EXA_KEY }));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- EXA PROXY ---
async function proxyExa(path, reqBody, res) {
  const key = EXA_KEY || reqBody._clientExaKey;
  delete reqBody._clientExaKey;
  if (!key) return res.status(400).json({ error: 'EXA_KEY_MISSING - set EXA_API_KEY env var' });

  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://api.exa.ai${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(reqBody),
        timeout: 30000,
      });
      const data = await r.json();
      if (!r.ok) {
        if (r.status === 429 && i < 2) { await sleep((i + 1) * 3000); continue; }
        return res.status(r.status).json(data);
      }
      return res.json(data);
    } catch (e) {
      lastErr = e;
      if (i < 2) await sleep(2000 * (i + 1));
    }
  }
  res.status(502).json({ error: `Exa error: ${lastErr?.message}` });
}

app.post('/api/exa/search', (req, res) => proxyExa('/search', req.body, res));
app.post('/api/exa/findSimilar', (req, res) => proxyExa('/findSimilar', req.body, res));
app.post('/api/exa/contents', (req, res) => proxyExa('/contents', req.body, res));

// --- ANTHROPIC PROXY ---
const cache = new Map();
const CACHE_TTL = 300000;

app.post('/api/claude', async (req, res) => {
  const body = req.body;
  if (!body?.messages?.length) return res.status(400).json({ error: 'messages required' });
  delete body['x-api-key']; delete body.api_key;
  body.model = 'claude-sonnet-4-20250514';
  if (!body.max_tokens || body.max_tokens > 4000) body.max_tokens = 4000;

  const last = body.messages[body.messages.length - 1]?.content || '';
  const ckey = typeof last === 'string' && last.length < 400 ? last.slice(0, 200) : null;

  if (ckey && cache.has(ckey)) {
    const { data, ts } = cache.get(ckey);
    if (Date.now() - ts < CACHE_TTL) { console.log('[CACHE HIT]'); return res.json(data); }
    cache.delete(ckey);
  }

  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
        timeout: 90000,
      });
      const data = await r.json();
      if (!r.ok) {
        const t = data?.error?.type || '';
        if ((t === 'overloaded_error' || r.status === 529) && i < 2) { await sleep((i + 1) * 4000); continue; }
        return res.status(r.status).json(data);
      }
      if (ckey) { cache.set(ckey, { data, ts: Date.now() }); }
      if (cache.size > 100) { const now = Date.now(); for (const [k, v] of cache) if (now - v.ts > CACHE_TTL) cache.delete(k); }
      return res.json(data);
    } catch (e) {
      lastErr = e;
      if (i < 2) await sleep(2000 * (i + 1));
    }
  }
  res.status(502).json({ error: `Anthropic proxy error: ${lastErr?.message}` });
});

app.use((_, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));

app.listen(PORT, () => {
  console.log(`\n  ⬡ ProspectRadar Proxy running on :${PORT}`);
  console.log(`  Exa.ai:    ${EXA_KEY ? '✓' : '⚠ missing key'}`);
  console.log(`  Anthropic: ✓`);
  console.log(`  CORS:      ${allowed.join(', ')}\n`);
});
module.exports = app;
