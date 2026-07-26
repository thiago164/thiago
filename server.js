const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { load, save } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo-em-producao';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- Upload de vídeos (multer) ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${uuid()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB por arquivo
});

// ---------- Auth helpers ----------
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function logActivity(db, userId, message) {
  db.activityLog.unshift({
    id: uuid(),
    userId,
    message,
    createdAt: new Date().toISOString()
  });
  db.activityLog = db.activityLog.slice(0, 500);
}

// ---------- Auth routes ----------
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Preencha nome, e-mail e senha' });
  }
  const db = load();
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Já existe uma conta com esse e-mail' });
  }
  const isFirstUser = db.users.length === 0;
  const user = {
    id: uuid(),
    name,
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    role: isFirstUser ? 'admin' : 'user',
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  logActivity(db, user.id, `Conta criada: ${user.name}`);
  save(db);
  const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db = load();
  const user = db.users.find(u => u.email.toLowerCase() === (email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  }
  const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ---------- Categorias ----------
app.get('/api/categories', authMiddleware, (req, res) => {
  const db = load();
  res.json(db.categories.filter(c => c.userId === req.user.id));
});

app.post('/api/categories', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  const db = load();
  const cat = { id: uuid(), userId: req.user.id, name };
  db.categories.push(cat);
  save(db);
  res.json(cat);
});

app.delete('/api/categories/:id', authMiddleware, (req, res) => {
  const db = load();
  db.categories = db.categories.filter(c => !(c.id === req.params.id && c.userId === req.user.id));
  save(db);
  res.json({ ok: true });
});

// ---------- Contas Instagram ----------
app.get('/api/accounts', authMiddleware, (req, res) => {
  const db = load();
  const accounts = db.accounts.filter(a => a.userId === req.user.id);
  const withStats = accounts.map(a => {
    const vids = db.videos.filter(v => v.accountId === a.id);
    return {
      ...a,
      stats: {
        total: vids.length,
        pendentes: vids.filter(v => v.status === 'pendente').length,
        postados: vids.filter(v => v.status === 'postado').length,
        erros: vids.filter(v => v.status === 'erro').length
      }
    };
  });
  res.json(withStats);
});

app.post('/api/accounts', authMiddleware, (req, res) => {
  const { label, accessToken, categoryId, videosPerDay, windowStart, windowEnd, mode } = req.body;
  if (!label || !accessToken) return res.status(400).json({ error: 'Label e access token são obrigatórios' });
  const db = load();
  const account = {
    id: uuid(),
    userId: req.user.id,
    label,
    accessToken,
    categoryId: categoryId || null,
    videosPerDay: Math.min(parseInt(videosPerDay || 5, 10), 50),
    windowStart: windowStart || '09:00',
    windowEnd: windowEnd || '21:00',
    mode: mode === 'manual' ? 'manual' : 'inteligente',
    active: true,
    createdAt: new Date().toISOString()
  };
  db.accounts.push(account);
  logActivity(db, req.user.id, `Conta do Instagram adicionada: ${label}`);
  save(db);
  res.json(account);
});

app.put('/api/accounts/:id', authMiddleware, (req, res) => {
  const db = load();
  const account = db.accounts.find(a => a.id === req.params.id && a.userId === req.user.id);
  if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
  const { label, categoryId, videosPerDay, windowStart, windowEnd, active } = req.body;
  if (label !== undefined) account.label = label;
  if (categoryId !== undefined) account.categoryId = categoryId;
  if (videosPerDay !== undefined) account.videosPerDay = Math.min(parseInt(videosPerDay, 10), 50);
  if (windowStart !== undefined) account.windowStart = windowStart;
  if (windowEnd !== undefined) account.windowEnd = windowEnd;
  if (active !== undefined) account.active = active;
  save(db);
  res.json(account);
});

app.delete('/api/accounts/:id', authMiddleware, (req, res) => {
  const db = load();
  db.accounts = db.accounts.filter(a => !(a.id === req.params.id && a.userId === req.user.id));
  save(db);
  res.json({ ok: true });
});

// ---------- Legendas pré-definidas ----------
app.get('/api/captions', authMiddleware, (req, res) => {
  const db = load();
  res.json(db.captions.filter(c => c.userId === req.user.id));
});

app.post('/api/captions', authMiddleware, (req, res) => {
  const { name, text, hashtags } = req.body;
  if (!name || !text) return res.status(400).json({ error: 'Nome e legenda são obrigatórios' });
  const db = load();
  const caption = { id: uuid(), userId: req.user.id, name, text, hashtags: hashtags || '' };
  db.captions.push(caption);
  save(db);
  res.json(caption);
});

app.delete('/api/captions/:id', authMiddleware, (req, res) => {
  const db = load();
  db.captions = db.captions.filter(c => !(c.id === req.params.id && c.userId === req.user.id));
  save(db);
  res.json({ ok: true });
});

// ---------- Agendamento ----------
// Distribui N vídeos entre dias, respeitando videosPerDay e a janela de horário da conta.
function buildSchedule(account, totalVideos) {
  const slots = [];
  const [startH, startM] = account.windowStart.split(':').map(Number);
  const [endH, endM] = account.windowEnd.split(':').map(Number);
  const perDay = Math.max(1, account.videosPerDay);

  let dayOffset = 1; // começa amanhã
  let remaining = totalVideos;

  while (remaining > 0) {
    const todayCount = Math.min(perDay, remaining);
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() + dayOffset);
    dayStart.setHours(startH, startM, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(endH, endM, 0, 0);

    const windowMs = Math.max(dayEnd - dayStart, 60 * 1000);
    const stepMs = windowMs / (todayCount + 1);

    for (let i = 0; i < todayCount; i++) {
      const scheduledAt = new Date(dayStart.getTime() + stepMs * (i + 1));
      slots.push(scheduledAt.toISOString());
    }
    remaining -= todayCount;
    dayOffset += 1;
  }
  return slots;
}

app.post('/api/upload', authMiddleware, upload.array('videos', 200), (req, res) => {
  const { accountId, caption, hashtags, cycles, batchName } = req.body;
  const files = req.files || [];
  if (!accountId) return res.status(400).json({ error: 'Selecione uma conta' });
  if (files.length === 0) return res.status(400).json({ error: 'Envie ao menos um vídeo' });

  const db = load();
  const account = db.accounts.find(a => a.id === accountId && a.userId === req.user.id);
  if (!account) return res.status(404).json({ error: 'Conta não encontrada' });

  const numCycles = Math.max(1, parseInt(cycles || 1, 10));
  const filesRepeated = [];
  for (let c = 0; c < numCycles; c++) {
    filesRepeated.push(...files);
  }

  const schedule = buildSchedule(account, filesRepeated.length);

  const created = filesRepeated.map((file, idx) => ({
    id: uuid(),
    userId: req.user.id,
    accountId,
    batchName: batchName || null,
    filename: file.filename,
    originalName: file.originalname,
    caption: caption || '',
    hashtags: hashtags || '',
    status: 'pendente',
    scheduledAt: schedule[idx],
    createdAt: new Date().toISOString(),
    postedAt: null,
    error: null
  }));

  db.videos.push(...created);
  logActivity(db, req.user.id, `Upload: ${created.length} vídeo(s) agendado(s) para "${account.label}"`);
  save(db);
  res.json({ created: created.length, videos: created });
});

app.get('/api/videos', authMiddleware, (req, res) => {
  const db = load();
  let videos = db.videos.filter(v => v.userId === req.user.id);
  const { status, accountId, categoryId } = req.query;
  if (status) videos = videos.filter(v => v.status === status);
  if (accountId) videos = videos.filter(v => v.accountId === accountId);
  if (categoryId) {
    const accIds = db.accounts.filter(a => a.categoryId === categoryId).map(a => a.id);
    videos = videos.filter(v => accIds.includes(v.accountId));
  }
  videos.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  res.json(videos);
});

app.post('/api/videos/:id/cancel', authMiddleware, (req, res) => {
  const db = load();
  const video = db.videos.find(v => v.id === req.params.id && v.userId === req.user.id);
  if (!video) return res.status(404).json({ error: 'Vídeo não encontrado' });
  if (video.status === 'pendente') video.status = 'cancelado';
  save(db);
  res.json(video);
});

app.post('/api/videos/cancel-pendentes', authMiddleware, (req, res) => {
  const db = load();
  let count = 0;
  db.videos.forEach(v => {
    if (v.userId === req.user.id && v.status === 'pendente') {
      v.status = 'cancelado';
      count++;
    }
  });
  logActivity(db, req.user.id, `${count} vídeo(s) pendente(s) cancelado(s)`);
  save(db);
  res.json({ cancelled: count });
});

// ---------- Dashboard ----------
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const db = load();
  const videos = db.videos.filter(v => v.userId === req.user.id);
  const accounts = db.accounts.filter(a => a.userId === req.user.id);
  const today = new Date().toDateString();

  res.json({
    totalVideos: videos.length,
    postados: videos.filter(v => v.status === 'postado').length,
    pendentes: videos.filter(v => v.status === 'pendente').length,
    erros: videos.filter(v => v.status === 'erro').length,
    contasAtivas: accounts.filter(a => a.active).length,
    postadosHoje: videos.filter(v => v.postedAt && new Date(v.postedAt).toDateString() === today).length,
    proximasPostagens: videos
      .filter(v => v.status === 'pendente')
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
      .slice(0, 10)
  });
});

// ---------- Activity log ----------
app.get('/api/activity-log', authMiddleware, (req, res) => {
  const db = load();
  res.json(db.activityLog.filter(l => l.userId === req.user.id).slice(0, 100));
});

// ---------- Admin ----------
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores' });
  next();
}

app.get('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  const db = load();
  res.json(db.users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt })));
});

// ---------- "Poster" simulado em background ----------
// A cada 30s, verifica vídeos pendentes cujo horário já passou e simula a postagem.
setInterval(() => {
  const db = load();
  const now = new Date();
  let changed = false;
  db.videos.forEach(v => {
    if (v.status === 'pendente' && new Date(v.scheduledAt) <= now) {
      // simulação: 92% de chance de sucesso, como um posting real teria falhas ocasionais
      const success = Math.random() > 0.08;
      v.status = success ? 'postado' : 'erro';
      v.postedAt = success ? now.toISOString() : null;
      v.error = success ? null : 'Falha simulada ao publicar (token expirado ou limite da API)';
      changed = true;
    }
  });
  if (changed) save(db);
}, 30 * 1000);

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
