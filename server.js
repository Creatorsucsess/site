const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATA_DIR = path.join(__dirname, 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(NEWS_FILE)) fs.writeFileSync(NEWS_FILE, '[]');
if (!fs.existsSync(STATS_FILE)) {
  fs.writeFileSync(
    STATS_FILE,
    JSON.stringify({ totalViews: 0, viewsByDate: {}, uniqueVisitors: {}, uniqueVisitorsTotal: 0, uniqueByDate: {} }, null, 2)
  );
}
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function readNews() {
  try {
    return JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeNews(news) {
  try {
    fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2));
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(`Не удалось сохранить новости: ${msg}`);
  }
}

function readStats() {
  try {
    const s = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    if (!s.viewsByDate) s.viewsByDate = {};
    if (!s.uniqueVisitors) s.uniqueVisitors = {};
    if (!s.uniqueByDate) s.uniqueByDate = {};
    if (typeof s.totalViews !== 'number') s.totalViews = Number(s.totalViews || 0);
    if (typeof s.uniqueVisitorsTotal !== 'number') s.uniqueVisitorsTotal = Number(s.uniqueVisitorsTotal || 0);
    return s;
  } catch {
    return { totalViews: 0, viewsByDate: {}, uniqueVisitors: {}, uniqueVisitorsTotal: 0, uniqueByDate: {} };
  }
}

function writeStats(stats) {
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    throw new Error(`Не удалось сохранить статистику: ${msg}`);
  }
}

function requireAuth(req, res, next) {
  if (req.session?.admin) return next();
  res.status(401).json({ error: 'Требуется авторизация' });
}

function parseRuDateToMs(dateStr) {
  try {
    return new Date(dateStr.split('.').reverse().join('-')).getTime();
  } catch {
    return 0;
  }
}

function ruDateToDayKey(dateStr) {
  const parts = (dateStr || '').split('.');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(p => Number(p));
  if (!dd || !mm || !yyyy) return null;
  // Use UTC to avoid timezone shifting the day.
  return new Date(Date.UTC(yyyy, mm - 1, dd)).toISOString().slice(0, 10);
}

function normalizeStatus(status) {
  return status === 'draft' ? 'draft' : 'published';
}

function isAllowedUpload(file) {
  const name = String(file.originalname || '').toLowerCase();
  const ext = path.extname(name);
  const mime = String(file.mimetype || '').toLowerCase();

  const allowedExt = new Set([
    '.png', '.jpg', '.jpeg', '.webp', '.gif',
    '.pdf',
    '.doc', '.docx',
    '.xls', '.xlsx',
    '.ppt', '.pptx',
    '.txt',
    '.zip', '.rar'
  ]);

  if (mime.startsWith('image/')) return true;
  if (allowedExt.has(ext)) return true;
  // Some providers send generic MIME types
  if (mime === 'application/octet-stream' && allowedExt.has(ext)) return true;

  return false;
}

function attachmentUrlToFilename(url) {
  const u = String(url || '');
  if (!u.startsWith('/uploads/')) return null;
  const file = u.slice('/uploads/'.length);
  if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) return null;
  return file;
}

function safeUnlinkUploadByUrl(url) {
  const filename = attachmentUrlToFilename(url);
  if (!filename) return;
  const fullPath = path.join(UPLOADS_DIR, filename);
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch {}
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'otechestvo-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR, { fallthrough: false }));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const safeOriginal = String(file.originalname || 'file').replace(/[^\w.\-()\s]/g, '_');
      const ext = path.extname(safeOriginal);
      const base = path.basename(safeOriginal, ext).slice(0, 60);
      const name = `${Date.now()}-${Math.random().toString(16).slice(2)}-${base}${ext}`;
      cb(null, name);
    }
  }),
  limits: {
    files: 10,
    fileSize: 15 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!isAllowedUpload(file)) return cb(new Error('Недопустимый тип файла'));
    cb(null, true);
  }
});

const VK_GROUP_ID = 224887019;
const VK_ACCESS_TOKEN = process.env.VK_ACCESS_TOKEN;

app.get('/api/news', (req, res) => {
  const includeAll = req.query.all === '1' || req.query.all === 'true';
  const news = readNews();

  const normalized = news.map(n => ({
    ...n,
    title: n.title || '',
    status: normalizeStatus(n.status),
    attachments: Array.isArray(n.attachments) ? n.attachments : []
  }));

  const filtered = includeAll ? normalized : normalized.filter(n => n.status === 'published');
  filtered.sort((a, b) => parseRuDateToMs(b.date) - parseRuDateToMs(a.date));
  res.json(filtered);
});

app.get('/api/vk-news', async (req, res) => {
  if (!VK_ACCESS_TOKEN) return res.json([]);
  try {
    const url = `https://api.vk.com/method/wall.get?owner_id=-${VK_GROUP_ID}&count=6&filter=owner&access_token=${VK_ACCESS_TOKEN}&v=5.131`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) return res.json([]);
    const items = data.response?.items || [];
    const posts = [items[3], items[4], items[5]].filter(Boolean).map(p => ({
      id: p.id,
      date: new Date(p.date * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      content: (p.text || '').replace(/\n/g, ' ').trim().slice(0, 500),
      link: `https://vk.com/wall-${VK_GROUP_ID}_${p.id}`
    }));
    res.json(posts);
  } catch {
    res.json([]);
  }
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Неверный пароль' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/admin/check', (req, res) => {
  res.json({ admin: !!req.session?.admin });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const stats = readStats();
  const news = readNews().map(n => ({
    ...n,
    title: n.title || '',
    status: normalizeStatus(n.status)
  }));

  const published = news.filter(n => n.status === 'published');
  const drafts = news.filter(n => n.status === 'draft');

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayViews = Number(stats.viewsByDate?.[todayKey] || 0);
  const todayUnique = Number(stats.uniqueByDate?.[todayKey] || 0);

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    last7.push({ date: key, count: Number(stats.viewsByDate?.[key] || 0) });
  }

  const recentNews = published
    .slice()
    .sort((a, b) => parseRuDateToMs(b.date) - parseRuDateToMs(a.date))
    .slice(0, 5)
    .map(n => ({
      id: n.id,
      date: n.date,
      title: n.title || '',
      content: (n.content || '').slice(0, 180)
    }));

  const uniqueVisitorsCount = Number(stats.uniqueVisitorsTotal || Object.keys(stats.uniqueVisitors || {}).length);

  // News chart (last 14 days, published only)
  const last14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    last14.push({ date: key, count: 0 });
  }
  const last14Index = new Map(last14.map((d, idx) => [d.date, idx]));
  published.forEach(n => {
    const key = ruDateToDayKey(n.date);
    if (!key) return;
    if (last14Index.has(key)) {
      last14[last14Index.get(key)].count += 1;
    }
  });

  res.json({
    views: {
      totalViews: Number(stats.totalViews || 0),
      todayViews,
      todayUnique,
      uniqueVisitors: uniqueVisitorsCount,
      last7
    },
    news: {
      total: news.length,
      published: published.length,
      drafts: drafts.length,
      last14Published: last14
    },
    recentNews
  });
});

app.post('/api/track/view', (req, res) => {
  const { visitorId } = req.body || {};
  if (!visitorId) return res.status(400).json({ error: 'visitorId required' });

  const stats = readStats();
  const todayKey = new Date().toISOString().slice(0, 10);

  stats.uniqueVisitors = stats.uniqueVisitors || {};
  stats.viewsByDate = stats.viewsByDate || {};
  stats.uniqueByDate = stats.uniqueByDate || {};
  if (typeof stats.uniqueVisitorsTotal !== 'number') stats.uniqueVisitorsTotal = Number(stats.uniqueVisitorsTotal || 0);

  // Page views
  stats.totalViews = Number(stats.totalViews || 0) + 1;
  stats.viewsByDate[todayKey] = Number(stats.viewsByDate[todayKey] || 0) + 1;

  // Unique visitors per day and total unique
  if (!stats.uniqueVisitors[visitorId]) {
    stats.uniqueVisitorsTotal = Number(stats.uniqueVisitorsTotal || 0) + 1;
  }
  if (stats.uniqueVisitors[visitorId] !== todayKey) {
    stats.uniqueVisitors[visitorId] = todayKey;
    stats.uniqueByDate[todayKey] = Number(stats.uniqueByDate[todayKey] || 0) + 1;
  }

  writeStats(stats);
  res.json({ ok: true });
});

app.post('/api/uploads', requireAuth, upload.array('files', 10), (req, res) => {
  const files = (req.files || []).map(f => ({
    url: `/uploads/${f.filename}`,
    name: f.originalname,
    type: f.mimetype,
    size: f.size
  }));
  res.json({ files });
});

// Multer / upload errors
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message || 'Ошибка загрузки' });
  }
  if (String(err.message || '').includes('Недопустимый тип файла')) {
    return res.status(400).json({ error: 'Недопустимый тип файла' });
  }
  return next(err);
});

app.post('/api/news', requireAuth, (req, res) => {
  const { date, title, content, status, attachments } = req.body || {};
  if (!date || !content?.trim()) return res.status(400).json({ error: 'Укажите дату и текст' });

  try {
    const news = readNews();
    const id = String(Date.now());
    news.unshift({
      id,
      date: String(date).trim(),
      title: (title || '').trim(),
      content: String(content).trim(),
      status: normalizeStatus(status),
      attachments: Array.isArray(attachments) ? attachments : []
    });

    writeNews(news);
    res.json(news[0]);
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Ошибка сохранения новости' });
  }
});

app.put('/api/news/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { date, title, content, status, attachments } = req.body || {};

  try {
    const news = readNews();
    const idx = news.findIndex(n => n.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Новость не найдена' });

    const prevAttachments = Array.isArray(news[idx].attachments) ? news[idx].attachments : [];

    if (date !== undefined) news[idx].date = String(date).trim();
    if (title !== undefined) news[idx].title = (title || '').trim();
    if (content !== undefined) news[idx].content = String(content).trim();
    if (status !== undefined) news[idx].status = normalizeStatus(status);
    if (attachments !== undefined) news[idx].attachments = Array.isArray(attachments) ? attachments : [];

    // Remove files that were detached from the news
    if (attachments !== undefined) {
      const next = Array.isArray(news[idx].attachments) ? news[idx].attachments : [];
      const nextUrls = new Set(next.map(a => a?.url).filter(Boolean));
      prevAttachments.forEach(a => {
        const url = a?.url;
        if (url && !nextUrls.has(url)) safeUnlinkUploadByUrl(url);
      });
    }

    writeNews(news);
    res.json(news[idx]);
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Ошибка обновления новости' });
  }
});

app.delete('/api/news/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  try {
    const news = readNews();
    const item = news.find(n => n.id === id);
    if (!item) return res.status(404).json({ error: 'Новость не найдена' });

    const next = news.filter(n => n.id !== id);
    writeNews(next);

    const attachments = Array.isArray(item.attachments) ? item.attachments : [];
    attachments.forEach(a => safeUnlinkUploadByUrl(a?.url));

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Ошибка удаления новости' });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер: http://localhost:${PORT}`);
  console.log(`Админка: http://localhost:${PORT}/admin.html`);
});

// Fallback JSON error handler (so admin UI shows real error)
app.use((err, req, res, next) => {
  if (!err) return next();
  res.status(500).json({ error: err?.message || 'Ошибка сервера' });
});
