const express = require('express');
const cors    = require('cors');
const path    = require('path');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

const SESSION_TTL_MS   = 15 * 60 * 1000;  // 15 min — enough for QR scan flow
const SCAN_TTL_MS      = 5  * 60 * 1000;  // 5 min after scan
const CLEANUP_INTERVAL = 60 * 1000;

// [FIX 1] Claim types synced with app (AuthActivity + IdentityStorage)
const CLAIM_TYPES = ['is_adult', 'nationality', 'is_human'];

const STATE = {
  PENDING  : 'pending',
  SCANNING : 'scanning',
  PROVING  : 'proving',
  COMPLETED: 'completed',
  EXPIRED  : 'expired',
  REJECTED : 'rejected',  // insufficient trust level
};

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : '*',
  methods: ['GET', 'POST', 'DELETE'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();

// [FIX 6] Global nullifier registry — cross-session replay prevention
const usedNullifiers = new Set();

const stats = {
  totalSessions : 0,
  totalProofs   : 0,
  proofTimes    : [],
  get avgProofTime() {
    if (!this.proofTimes.length) return 0;
    return Math.round(this.proofTimes.reduce((a, b) => a + b, 0) / this.proofTimes.length);
  },
};

function makeChallenge() { return crypto.randomBytes(32).toString('hex'); }

// [FIX 2] Deep link format synced with app AndroidManifest + AuthActivity
// App expects: zkauth://auth?domain=X&claim=Y&challenge=Z&callback=W
function buildDeepLink(sessionId, challenge, claimType, domain, callbackUrl, tier = 1) {
  const params = new URLSearchParams({
    domain,
    claim    : claimType,
    challenge,
    callback : callbackUrl,
    session  : sessionId,
    tier     : String(tier),
  });
  return `zkauth://auth?${params.toString()}`;
}

function getCallbackUrl(req) {
  // Build /zkauth/verify URL from incoming request origin
  const host   = process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`;
  return `${host}/zkauth/verify`;
}

function log(level, msg, extra = '') {
  const icons = { info: '✅', warn: '⚠️', error: '❌' };
  console.log(`${icons[level] || '📋'} [${new Date().toISOString()}] ${msg} ${extra}`);
}

function recordProofTime(ms) {
  if (typeof ms !== 'number') return;
  stats.proofTimes.push(ms);
  if (stats.proofTimes.length > 100) stats.proofTimes.shift();
}

function createSession({ domain, claimType, callbackUrl, tier = 1 }) {
  const sessionId = crypto.randomUUID();
  const challenge = makeChallenge();
  const deepLink  = buildDeepLink(sessionId, challenge, claimType, domain, callbackUrl, tier);

  return {
    sessionId,
    domain,
    claimType,
    challenge,
    callbackUrl,
    deepLink,
    status     : STATE.PENDING,
    proof      : null,
    nullifier  : null,
    metadata   : null,
    claimResult: null,
    createdAt  : Date.now(),
    expiresAt  : Date.now() + SESSION_TTL_MS,
    scannedAt  : null,
    verifiedAt : null,
  };
}

// ─── Routes ───────────────────────────────────────────────────

app.get('/', (req, res) => res.json({
  name       : 'zkAuth Relay Server',
  version    : '3.0.0',
  status     : 'online',
  environment: process.env.NODE_ENV || 'development',
  timestamp  : new Date().toISOString(),
  stats: {
    activeSessions: sessions.size,
    totalSessions : stats.totalSessions,
    totalProofs   : stats.totalProofs,
    avgProofTimeMs: stats.avgProofTime,
  },
}));

app.get('/health', (req, res) => res.json({
  status        : 'ok',
  uptime        : Math.round(process.uptime()),
  memory_mb     : Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  activeSessions: sessions.size,
  totalProofs   : stats.totalProofs,
}));

// ── START SESSION ─────────────────────────────────────────────
app.get('/api/start-session', (req, res) => {
  const domain    = req.query.domain || req.get('host') || 'unknown';
  // [FIX 1] Validate against new claim types; default to is_adult
  const claimType = CLAIM_TYPES.includes(req.query.claim)
    ? req.query.claim : 'is_adult';
  const tier      = [1, 3].includes(parseInt(req.query.tier))
    ? parseInt(req.query.tier) : 1;

  // [FIX 4] callbackUrl built from request so it always points to this server
  const callbackUrl = getCallbackUrl(req);

  const session = createSession({ domain, claimType, callbackUrl, tier });
  sessions.set(session.sessionId, session);
  stats.totalSessions++;

  setTimeout(() => {
    const s = sessions.get(session.sessionId);
    if (s && s.status === STATE.PENDING) {
      s.status = STATE.EXPIRED;
      sessions.set(session.sessionId, s);
    }
  }, SESSION_TTL_MS);

  log('info', `Session created: ${session.sessionId}`, `| ${domain} | ${claimType}`);

  res.json({
    // Legacy fields (backward compat)
    session_id : session.sessionId,
    challenge  : session.challenge,
    expires_in : SESSION_TTL_MS / 1000,
    // QR encodes deep_link — app opens directly when scanned
    // No session lookup needed — all params in deep_link
    qr_data    : Buffer.from(JSON.stringify({
      sessionId : session.sessionId,
      domain,
      challenge : session.challenge,
      deep_link : session.deepLink,   // ← full zkauth:// link
      timestamp : Date.now(),
    })).toString('base64'),

    // New fields — [FIX 2] deep_link now correct format for app
    claim_type  : session.claimType,
    deep_link   : session.deepLink,
    callback_url: callbackUrl,
  });
});

// ── SCAN NOTIFY ───────────────────────────────────────────────
app.post('/api/scan-notify', (req, res) => {
  const { sessionId } = req.body;
  const session = sessions.get(sessionId);

  if (!session) return res.status(404).json({ error: 'Session not found', error_code: 'SESSION_NOT_FOUND' });
  if (session.status === STATE.COMPLETED) return res.status(409).json({ error: 'Already completed', error_code: 'INVALID_STATE' });
  if (Date.now() > session.expiresAt) return res.status(410).json({ error: 'Session expired', error_code: 'SESSION_EXPIRED' });

  session.status    = STATE.SCANNING;
  session.scannedAt = Date.now();
  // Extend session — give phone enough time for proof generation
  session.expiresAt = Date.now() + SCAN_TTL_MS;
  sessions.set(sessionId, session);

  log('info', `App opened (deep link): ${sessionId}`);
  res.json({ success: true, status: STATE.SCANNING, claim_type: session.claimType, challenge: session.challenge });
});

// ── PROVING NOTIFY ────────────────────────────────────────────
app.post('/api/proving-notify', (req, res) => {
  const { sessionId } = req.body;
  const session = sessions.get(sessionId);

  if (!session) return res.status(404).json({ error: 'Session not found', error_code: 'SESSION_NOT_FOUND' });
  if (session.status === STATE.COMPLETED) return res.status(409).json({ error: 'Already completed', error_code: 'INVALID_STATE' });

  session.status = STATE.PROVING;
  sessions.set(sessionId, session);

  log('info', `Proving: ${sessionId}`);
  res.json({ success: true, status: STATE.PROVING });
});

// ── ZKAUTH VERIFY ─────────────────────────────────────────────
// Do not treat client-supplied fields as proof of identity. This service does
// not yet have a pinned Plonky2 verifier key or server-side proof verifier, so
// accepting a non-empty compressed_proof here would falsely authenticate users.
app.post('/zkauth/verify', (req, res) => {
  const { compressed_proof, nullifier, challenge } = req.body || {};
  if (!compressed_proof) {
    return res.status(400).json({ error: 'Missing compressed_proof', error_code: 'MISSING_PROOF' });
  }
  if (!nullifier) {
    return res.status(400).json({ error: 'Missing nullifier', error_code: 'MISSING_NULLIFIER' });
  }
  if (!challenge) {
    return res.status(400).json({ error: 'Missing challenge', error_code: 'MISSING_CHALLENGE' });
  }

  res.status(503).json({
    success: false,
    verified: false,
    error: 'Cryptographic proof verification is not configured',
    error_code: 'VERIFIER_UNAVAILABLE',
    message: 'No identity claim is accepted until a server-side Plonky2 verifier is configured.',
  });
});

// ── UPLOAD PROOF (legacy) ─────────────────────────────────────
app.post('/api/upload-proof', (req, res) => {
  res.status(410).json({
    success: false,
    verified: false,
    error: 'Legacy proof acceptance is disabled',
    error_code: 'LEGACY_ENDPOINT_DISABLED',
    message: 'This endpoint cannot authenticate proof submissions.',
  });
});

// ── POLL STATUS ───────────────────────────────────────────────
app.get('/api/poll-status/:session_id', (req, res) => {
  // No cache — always fresh response
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');

  const session = sessions.get(req.params.session_id);
  if (!session) return res.status(404).json({ error: 'Session not found', error_code: 'SESSION_NOT_FOUND' });

  const resp = {
    session_id    : session.sessionId,
    status        : session.status,
    claim_type    : session.claimType,
    domain        : session.domain,
    created_at    : session.createdAt,
    expires_at    : session.expiresAt,
    time_remaining: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
  };

  // Rejected — insufficient trust
  if (session.status === STATE.REJECTED) {
    resp.required  = session.required || 'MAXIMUM';
    resp.provided  = session.provided || 'BASIC';
  }

  if (session.status === STATE.COMPLETED) {
    resp.proof        = session.proof;
    resp.nullifier    = session.nullifier;
    resp.metadata     = session.metadata;
    resp.claim_result = session.claimResult;
    resp.verified_at  = session.verifiedAt;
    resp.trust_level  = session.trustLevel  || 'BASIC';
    resp.input_mode   = session.inputMode   || 'UNKNOWN';
    resp.is_maximum   = session.trustLevel  === 'MAXIMUM';
  }

  res.json(resp);
});

// ── STATS ─────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => res.json({
  active_sessions      : sessions.size,
  total_sessions       : stats.totalSessions,
  total_proofs         : stats.totalProofs,
  avg_proof_time_ms    : stats.avgProofTime,
  server_uptime_seconds: Math.round(process.uptime()),
  memory_usage_mb      : Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  nullifiers_registered: usedNullifiers.size,
}));

app.delete('/api/session/:session_id', (req, res) => {
  if (sessions.delete(req.params.session_id)) {
    log('info', `Deleted: ${req.params.session_id}`);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Session not found', error_code: 'SESSION_NOT_FOUND' });
  }
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ─── Cleanup ──────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now(); let cleaned = 0;
  for (const [id, s] of sessions.entries()) {
    if (now > s.expiresAt && s.status !== STATE.COMPLETED) {
      sessions.delete(id); cleaned++;
    }
  }
  if (cleaned > 0) log('info', `Cleaned ${cleaned} expired sessions`);
}, CLEANUP_INTERVAL);

// ─── Boot ─────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  log('info', `zkAuth Relay v3.0 on port ${PORT}`);
  log('info', `Health: http://localhost:${PORT}/health`);
  log('info', `ZK verify endpoint: POST /zkauth/verify`);

  // ── Self-ping every 4 min — keeps Railway free tier awake ──
  // Railway sleeps after 5 min inactivity — ping at 4 min prevents it
  if (process.env.SERVER_URL) {
    setInterval(() => {
      const http = require('https');
      http.get(`${process.env.SERVER_URL}/health`, (res) => {
        log('info', `Keep-alive ping: ${res.statusCode}`);
      }).on('error', () => {});  // silent fail ok
    }, 4 * 60 * 1000);  // every 4 minutes
  }
});

process.on('SIGTERM', () => {
  server.close(() => { log('info', 'Server closed'); process.exit(0); });
});
process.on('uncaughtException',  err => log('error', 'Uncaught:', err.message));
process.on('unhandledRejection', err => log('error', 'Rejection:', err));
