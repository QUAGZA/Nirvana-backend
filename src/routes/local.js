const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { getAlbums } = require('../services/localLibraryService');

const router = Router();
const SECRET = 'nirvana-super-secret-key';
const VALID_PASSWORD = 'password'; // Very basic login for personal use

router.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === VALID_PASSWORD) {
    const token = jwt.sign({ user: 'admin' }, SECRET, { expiresIn: '7d' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Invalid password' });
});

// Middleware to protect routes
function auth(req, res, next) {
  let token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(token, SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

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
  const ALBUMS_DIR = 'e:\\NIRVANA\\Albums';
  const filePath = path.join(ALBUMS_DIR, folder, file);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Not found');
  }
});

router.get('/api/local/stream', auth, (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('Not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
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
