const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATA_DIR = path.join(__dirname, 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(NEWS_FILE)) fs.writeFileSync(NEWS_FILE, '[]');

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

function requireAuth(req, res, next) {
  if (req.session?.admin) return next();
  res.status(401).json({ error: 'Требуется авторизация' });
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
  const news = readNews().sort((a, b) => new Date(b.date.split('.').reverse().join('-')) - new Date(a.date.split('.').reverse().join('-')));
  res.json(news);
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

app.post('/api/news', requireAuth, (req, res) => {
  const { date, content } = req.body;
  if (!date || !content?.trim()) return res.status(400).json({ error: 'Укажите дату и текст' });
  const news = readNews();
  const id = String(Date.now());
  news.unshift({ id, date: date.trim(), content: content.trim() });
  writeNews(news);
  res.json(news[0]);
});

app.put('/api/news/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { date, content } = req.body;
  const news = readNews();
  const idx = news.findIndex(n => n.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Новость не найдена' });
  if (date) news[idx].date = date.trim();
  if (content !== undefined) news[idx].content = content.trim();
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
