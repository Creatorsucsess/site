const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATA_DIR = path.join(__dirname, 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(NEWS_FILE)) fs.writeFileSync(NEWS_FILE, '[]');
if (!fs.existsSync(STATS_FILE)) {
  fs.writeFileSync(
    STATS_FILE,
    JSON.stringify({ totalViews: 0, viewsByDate: {}, uniqueVisitors: {} }, null, 2)
  );
}

function readNews() {
  try {
    return JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeNews(news) {
  fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2));
}

function readStats() {
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch {
    return { totalViews: 0, viewsByDate: {}, uniqueVisitors: {} };
  }
}

function writeStats(stats) {
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'otechestvo-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(__dirname));

const VK_GROUP_ID = 224887019;
const VK_ACCESS_TOKEN = process.env.VK_ACCESS_TOKEN;

app.get('/api/news', (req, res) => {
  const includeAll = req.query.all === '1' || req.query.all === 'true';
  const news = readNews();

  const normalized = news.map(n => ({
    ...n,
    title: n.title || '',
    status: normalizeStatus(n.status)
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

  const uniqueVisitorsCount = Object.keys(stats.uniqueVisitors || {}).length;

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

  if (stats.uniqueVisitors[visitorId] !== todayKey) {
    stats.uniqueVisitors[visitorId] = todayKey;
    stats.totalViews = Number(stats.totalViews || 0) + 1;
    stats.viewsByDate[todayKey] = Number(stats.viewsByDate[todayKey] || 0) + 1;

  }

  writeStats(stats);
  res.json({ ok: true });
});

app.post('/api/news', requireAuth, (req, res) => {
  const { date, title, content, status } = req.body || {};
  if (!date || !content?.trim()) return res.status(400).json({ error: 'Укажите дату и текст' });

  const news = readNews();
  const id = String(Date.now());
  news.unshift({
    id,
    date: String(date).trim(),
    title: (title || '').trim(),
    content: String(content).trim(),
    status: normalizeStatus(status)
  });

  writeNews(news);
  res.json(news[0]);
});

app.put('/api/news/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { date, title, content, status } = req.body || {};

  const news = readNews();
  const idx = news.findIndex(n => n.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Новость не найдена' });

  if (date !== undefined) news[idx].date = String(date).trim();
  if (title !== undefined) news[idx].title = (title || '').trim();
  if (content !== undefined) news[idx].content = String(content).trim();
  if (status !== undefined) news[idx].status = normalizeStatus(status);

  writeNews(news);
  res.json(news[idx]);
});

app.delete('/api/news/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const news = readNews().filter(n => n.id !== id);
  writeNews(news);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Сервер: http://localhost:${PORT}`);
  console.log(`Админка: http://localhost:${PORT}/admin.html`);
});
