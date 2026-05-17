const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { getAlbums } = require('../services/localLibraryService');

const router = Router();

// ─── Rate Limiter for Login ───────────────────────────────────
const loginAttempts = new Map(); // ip -> { count, firstAttempt }
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAttempt > LOCKOUT_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry || Date.now() - entry.firstAttempt > LOCKOUT_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
  } else {
    entry.count++;
  }
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

// ─── Auth ─────────────────────────────────────────────────────
router.post('/api/login', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  const { password } = req.body;
  if (password === config.appPassword) {
    clearAttempts(ip);
    const token = jwt.sign({ user: 'admin' }, config.jwtSecret, { expiresIn: '7d' });
    return res.json({ token });
  }

  recordFailedAttempt(ip);
  return res.status(401).json({ error: 'Invalid password' });
});

// Middleware to protect routes
function auth(req, res, next) {
  let token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(token, config.jwtSecret);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// ─── Path Traversal Guard ─────────────────────────────────────
function isInsideAlbumsDir(filePath) {
  const resolved = path.resolve(filePath);
  const albumsDir = path.resolve(config.albumsDir);
  return resolved.startsWith(albumsDir + path.sep) || resolved === albumsDir;
}

// ─── Routes ───────────────────────────────────────────────────
router.get('/api/local/albums', auth, (req, res) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  // append token to urls so audio tag and img tag can work
  const albums = getAlbums().map(album => ({
    ...album,
    coverUrl: album.coverUrl ? `${album.coverUrl}?token=${token}` : null,
    tracks: album.tracks.map(track => ({
      ...track,
      url: `${track.url}&token=${token}`
    }))
  }));
  res.json(albums);
});

router.get('/api/local/covers/:folder/:file', auth, (req, res) => {
  const { folder, file } = req.params;
  const filePath = path.join(config.albumsDir, folder, file);

  // Path traversal check
  if (!isInsideAlbumsDir(filePath)) {
    return res.status(403).send('Forbidden');
  }

  if (fs.existsSync(filePath)) {
    res.sendFile(path.resolve(filePath));
  } else {
    res.status(404).send('Not found');
  }
});

router.get('/api/local/stream', auth, (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).send('Missing path');
  }

  // Path traversal check — only serve files inside ALBUMS_DIR
  if (!isInsideAlbumsDir(filePath)) {
    return res.status(403).send('Forbidden: path outside albums directory');
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    // Range validation
    if (start >= fileSize || end >= fileSize || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      return res.end();
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'audio/mpeg',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mpeg',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

module.exports = router;
