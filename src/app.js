// src/app.js
const express = require('express');
const cors = require('cors');

// Ensure Firebase Admin initializes once on server startup
// (Adjust path if your firebaseAdmin.js is elsewhere)
require('./lib/firebaseAdmin');

const { requireAuth } = require('./middleware/requireAuth');

const app = express();

// -------- middleware --------
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '2mb' }));

// -------- basic routes --------
app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    name: 'ai_nail_assistant',
    source: 'src/app.js',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    source: 'src/app.js',
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// -------- routes --------
const nailAssistantRoutes = require('./routes/nailAssistantRoutes');

console.log(
  '✅ loading nailAssistantRoutes from:',
  require.resolve('./routes/nailAssistantRoutes')
);
console.log('✅ nailAssistantRoutes typeof:', typeof nailAssistantRoutes);
console.log('✅ nailAssistantRoutes stack length:', nailAssistantRoutes?.stack?.length);

// Protect ALL /api routes with Firebase Auth
app.use('/api', requireAuth, nailAssistantRoutes);

// -------- 404 --------
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
  });
});

// -------- error handler (bad JSON, etc.) --------
app.use((err, req, res, next) => {
  // Invalid JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid JSON',
      message: err.message,
    });
  }

  console.error('🔥 Unhandled error:', err);
  return res.status(500).json({
    error: 'Server error',
    message: err?.message || String(err),
  });
});

module.exports = app;
