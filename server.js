const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');
// nodemailer используется для Gmail SMTP (загружается динамически в sendRecoveryEmail)

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// PeerJS не нужен — сигналинг через Socket.IO

// ========== НАСТРОЙКА BACKBLAZE B2 ==========
const B2_ACCOUNT_ID = process.env.B2_ACCOUNT_ID;
const B2_APP_KEY = process.env.B2_APP_KEY;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;

let b2Auth = null;
let b2BucketId = null;

async function authorizeB2() {
  const credentials = `${B2_ACCOUNT_ID}:${B2_APP_KEY}`;
  const base64 = Buffer.from(credentials).toString('base64');
  const response = await axios.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${base64}` }
  });
  return response.data;
}

async function getBucketId(bucketName) {
  const response = await axios.post(
    `${b2Auth.apiUrl}/b2api/v2/b2_list_buckets`,
    { accountId: B2_ACCOUNT_ID },
    { headers: { Authorization: b2Auth.authorizationToken } }
  );
  const bucket = response.data.buckets.find(b => b.bucketName === bucketName);
  if (!bucket) throw new Error(`Бакет "${bucketName}" не найден`);
  return bucket.bucketId;
}

async function getUploadUrl() {
  const response = await axios.post(
    `${b2Auth.apiUrl}/b2api/v2/b2_get_upload_url`,
    { bucketId: b2BucketId },
    { headers: { Authorization: b2Auth.authorizationToken } }
  );
  return response.data;
}

async function getDownloadUrl(fileName) {
  const response = await axios.post(
    `${b2Auth.apiUrl}/b2api/v2/b2_get_download_authorization`,
    {
      bucketId: b2BucketId,
      fileNamePrefix: fileName,
      validDurationInSeconds: 604800
    },
    { headers: { Authorization: b2Auth.authorizationToken } }
  );
  const token = response.data.authorizationToken;
  return `${b2Auth.downloadUrl}/file/${B2_BUCKET_NAME}/${fileName}?Authorization=${token}`;
}

function calculateSHA1(buffer) {
  const hash = crypto.createHash('sha1');
  hash.update(buffer);
  return hash.digest('hex');
}

// ========== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ==========
const USERS_FILE = 'users.json';
let users = new Map(); // username -> { nickname, avatar, theme, friends, friendRequests, groups, recoveryEmail }
let recoveryCodes     = new Map(); // username -> { code, expiry, email }
let emailVerifyCodes  = new Map(); // username -> { code, expiry, pendingEmail }

// ── EMAIL через Resend (resend.com) ──────────────────────────────────────
// Бесплатно: 3000 писем/мес, регистрация за 1 мин на https://resend.com
// Укажи ключ в .env: RESEND_API_KEY=re_xxxxxxxxxxxx
// И подтверждённый домен: RESEND_FROM=noreply@твой-домен.com
// Если домена нет — используй: onboarding@resend.dev (только для теста)

async function sendRecoveryEmail(to, code) {
  const BREVO_KEY  = process.env.BREVO_API_KEY;
  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_PASS = process.env.GMAIL_PASS;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 0">
<tr><td align="center">
<table width="420" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)">
<tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:36px 40px 28px;text-align:center">
  <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">Aura Messenger</h1>
  <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:14px">Восстановление пароля</p>
</td></tr>
<tr><td style="padding:36px 40px">
  <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1a1a2e">Твой код подтверждения</p>
  <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6">Используй этот код для сброса пароля. Действует <strong style="color:#374151">15 минут</strong>.</p>
  <div style="background:#f8f7ff;border:2px solid #e0e0ff;border-radius:14px;padding:28px 20px;text-align:center;margin-bottom:28px">
    <div style="font-size:42px;font-weight:800;letter-spacing:14px;color:#6366f1;font-family:monospace;padding-left:14px">${code}</div>
  </div>
  <p style="margin:0;font-size:13px;color:#9ca3af">Если ты не запрашивал(а) сброс — просто проигнорируй это письмо.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f0f0f0;text-align:center">
  <p style="margin:0;font-size:12px;color:#9ca3af">© 2026 Aura Messenger</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  // ── Способ 1: Brevo (ex-Sendinblue) — бесплатно 300 писем/день, домен не нужен
  const BREVO_FROM = process.env.BREVO_FROM; // твой email из Brevo аккаунта

  if (BREVO_KEY) {
    if (!BREVO_FROM) {
      console.error('📧 BREVO_FROM не задан в .env! Укажи email с которым регался в Brevo.');
      throw new Error('BREVO_FROM не задан');
    }
    try {
      const resp = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender:  { name: 'Aura Messenger', email: BREVO_FROM },
        to:      [{ email: to }],
        subject: 'Код восстановления — Aura Messenger',
        htmlContent: html,
        textContent: `Код восстановления Aura Messenger: ${code}\nДействует 15 минут.`,
      }, {
        headers: {
          'api-key':      BREVO_KEY,
          'Content-Type': 'application/json',
          'Accept':       'application/json',
        },
        timeout: 10000,
      });
      console.log('📧 Email отправлен через Brevo, messageId:', resp.data?.messageId);
      return;
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.error('📧 Brevo ошибка:', msg);
      throw new Error(msg);
    }
  }

  // ── Способ 2: Gmail SMTP (запасной)
  if (GMAIL_USER && GMAIL_PASS) {
    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_PASS } });
      await t.sendMail({ from: `"Aura Messenger" <${GMAIL_USER}>`, to, subject: 'Код восстановления — Aura Messenger', html, text: `Код: ${code}. Действует 15 минут.` });
      console.log('📧 Email отправлен через Gmail:', to);
      return;
    } catch (err) {
      console.error('📧 Gmail ошибка:', err.message);
      throw new Error(err.message);
    }
  }

  // ── Dev режим — код в консоли
  console.log(`\n📧 ════════════════════════════════`);
  console.log(`📧 Email не настроен. Код для ${to}: [ ${code} ]`);
  console.log(`📧 Добавь в .env: BREVO_API_KEY=xkeysib-xxx`);
  console.log(`📧 ════════════════════════════════\n`);
}

async function sendVerifyEmail(to, code) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 0">
<tr><td align="center">
<table width="420" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)">
<tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:36px 40px 28px;text-align:center">
  <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">Aura Messenger</h1>
  <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:14px">Подтверждение email</p>
</td></tr>
<tr><td style="padding:36px 40px">
  <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1a1a2e">Подтверди свой email</p>
  <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6">Введи этот код в приложении. Действует <strong style="color:#374151">15 минут</strong>.</p>
  <div style="background:#f8f7ff;border:2px solid #e0e0ff;border-radius:14px;padding:28px 20px;text-align:center;margin-bottom:28px">
    <div style="font-size:42px;font-weight:800;letter-spacing:14px;color:#6366f1;font-family:monospace;padding-left:14px">${code}</div>
  </div>
  <p style="margin:0;font-size:13px;color:#9ca3af">Если ты не добавлял(а) этот email — просто проигнорируй письмо.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f0f0f0;text-align:center">
  <p style="margin:0;font-size:12px;color:#9ca3af">© 2026 Aura Messenger</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  const BREVO_KEY  = process.env.BREVO_API_KEY;
  const BREVO_FROM = process.env.BREVO_FROM;
  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_PASS = process.env.GMAIL_PASS;

  if (BREVO_KEY && BREVO_FROM) {
    const resp = await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender:      { name: 'Aura Messenger', email: BREVO_FROM },
      to:          [{ email: to }],
      subject:     'Подтверждение email — Aura Messenger',
      htmlContent: html,
      textContent: `Код подтверждения email Aura: ${code}\nДействует 15 минут.`,
    }, {
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    console.log('📧 Verify email отправлен через Brevo:', resp.data?.messageId);
    return;
  }
  if (GMAIL_USER && GMAIL_PASS) {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_PASS } });
    await t.sendMail({ from: `"Aura Messenger" <${GMAIL_USER}>`, to, subject: 'Подтверждение email — Aura Messenger', html, text: `Код: ${code}` });
    console.log('📧 Verify email отправлен через Gmail:', to);
    return;
  }
  console.log(`📧 [Dev] Код подтверждения для ${to}: [ ${code} ]`);
}

async function loadUsers() {
  try {
    const url = await getDownloadUrl(USERS_FILE);
    const response = await axios.get(url, { timeout: 5000 });
    if (response.data && typeof response.data === 'object') {
      users = new Map(Object.entries(response.data));
      console.log(`👥 Загружено ${users.size} пользователей`);
    }
  } catch (err) {
    if (err.response?.status === 404) {
      console.log('📁 users.json не найден, будет создан');
    } else {
      console.error('Ошибка загрузки пользователей:', err.message);
    }
  }
}

async function saveUsers() {
  try {
    const usersObj = Object.fromEntries(users);
    const jsonBuffer = Buffer.from(JSON.stringify(usersObj, null, 2), 'utf-8');
    const uploadData = await getUploadUrl();
    const sha1 = calculateSHA1(jsonBuffer);

    await axios.post(uploadData.uploadUrl, jsonBuffer, {
      headers: {
        'Authorization': uploadData.authorizationToken,
        'X-Bz-File-Name': USERS_FILE,
        'Content-Type': 'application/json',
        'Content-Length': jsonBuffer.length,
        'X-Bz-Content-Sha1': sha1
      }
    });
    console.log('💾 Пользователи сохранены');
  } catch (err) {
    console.error('Ошибка сохранения пользователей:', err.message);
  }
}

// ========== ЗАГРУЗКА ФАЙЛОВ ==========
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.static('public'));

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const mimeType = req.file.mimetype;
    let fileType = 'file';
    if (mimeType.startsWith('image/')) fileType = 'image';
    else if (mimeType.startsWith('audio/')) fileType = 'audio';
    else if (mimeType.startsWith('video/')) fileType = 'video';

    let prefix = '';
    if (fileType === 'image') prefix = 'photos/';
    else if (fileType === 'video') prefix = 'videos/';
    else if (fileType === 'audio') prefix = 'audio/';

    const fileName = prefix + Date.now() + '-' + req.file.originalname;
    const uploadData = await getUploadUrl();
    const sha1 = calculateSHA1(req.file.buffer);
    await axios.post(uploadData.uploadUrl, req.file.buffer, {
      headers: {
        'Authorization': uploadData.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': mimeType,
        'Content-Length': req.file.buffer.length,
        'X-Bz-Content-Sha1': sha1
      }
    });

    const fileUrl = await getDownloadUrl(fileName);
    res.json({ success: true, url: fileUrl, type: fileType, name: req.file.originalname });

  } catch (error) {
    console.error('Ошибка загрузки:', error.response?.data || error.message);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// ========== ICE SERVERS (динамические TURN credentials) ==========
// Если у вас есть API ключ от metered.ca — укажите его в .env как METERED_API_KEY
// Бесплатный план: https://dashboard.metered.ca/  (50 GB/месяц бесплатно)
app.get('/api/ice-servers', async (req, res) => {
  const METERED_API_KEY = process.env.METERED_API_KEY;
  if (METERED_API_KEY) {
    try {
      const response = await axios.get(
        `https://aura.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`,
        { timeout: 5000 }
      );
      return res.json(response.data);
    } catch (err) {
      console.log('[ICE] metered.ca недоступен, возвращаем статичные серверы');
    }
  }
  // Fallback — статичные серверы (всегда работают как запасной вариант)
  res.json([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:3478' },
    { urls: 'turn:openrelay.metered.ca:3478',  credential: 'openrelayproject', username: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',   credential: 'openrelayproject', username: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443',  credential: 'openrelayproject', username: 'openrelayproject' },
    { urls: 'turn:freeturn.net:3478',           credential: 'free',             username: 'free' },
    { urls: 'turns:freeturn.tel:5349',          credential: 'free',             username: 'free' },
  ]);
});


app.use(express.json());

// Хэш пароля (простой SHA-256 без внешних зависимостей)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'aura_salt_2026').digest('hex');
}

// Вход/регистрация с паролем
app.post('/api/login', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Имя не может быть пустым' });
  }
  if (!password || password.trim().length < 4) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 4 символов' });
  }
  const cleanName = username.trim();
  const pwHash = hashPassword(password.trim());

  if (users.has(cleanName)) {
    const userData = users.get(cleanName);
    // Check password
    if (userData.passwordHash && userData.passwordHash !== pwHash) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }
    // If no password set yet (old account) — set it now
    if (!userData.passwordHash) {
      userData.passwordHash = pwHash;
      users.set(cleanName, userData);
      await saveUsers();
    }
    return res.json({
      success: true,
      user: {
        username: cleanName,
        nickname: userData.nickname || cleanName,
        avatar: userData.avatar || null,
        theme: userData.theme || 'dark',
        friends: userData.friends || [],
        friendRequests: userData.friendRequests || [],
        groups: userData.groups || []
      }
    });
  } else {
    // Новая регистрация
    const newUser = {
      nickname:      cleanName,
      passwordHash:  pwHash,
      avatar:        null,
      theme:         'dark',
      friends:       [],
      friendRequests:[],
      groups:        [],
      recoveryEmail: null,        // сохраняем только после подтверждения
      emailVerified: false,
    };
    users.set(cleanName, newUser);
    await saveUsers();

    // Если указан email — отправляем код подтверждения
    if (email) {
      const code   = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = Date.now() + 15 * 60 * 1000;
      emailVerifyCodes.set(cleanName, { code, expiry, pendingEmail: email });
      sendVerifyEmail(email, code).catch(e => console.warn('Ошибка отправки verify email при регистрации:', e.message));
    }

    return res.json({
      success: true,
      isNew: true,
      needsEmailVerify: !!email,
      user: {
        username:      cleanName,
        nickname:      cleanName,
        avatar:        null,
        theme:         'dark',
        friends:       [],
        friendRequests:[],
        groups:        [],
        recoveryEmail: null,
      }
    });
  }
});

// Обновление профиля
app.post('/api/update-profile', async (req, res) => {
  const { username, nickname, avatar, theme } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  const user = users.get(username);
  if (nickname !== undefined) user.nickname = nickname;
  if (avatar !== undefined) user.avatar = avatar;
  if (theme !== undefined) user.theme = theme;
  users.set(username, user);
  await saveUsers();
  res.json({ success: true, user: { nickname: user.nickname, avatar: user.avatar, theme: user.theme } });
});

// Удаление аккаунта
app.post('/api/delete-account', async (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  users.delete(username);
  await saveUsers();
  res.json({ success: true });
});

// Запросить сброс пароля
app.post('/api/request-password-reset', async (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) {
    // Не раскрываем существование аккаунта
    return res.json({ success: true, message: 'Если аккаунт существует, код отправлен на email' });
  }
  const userData = users.get(username);
  if (!userData.recoveryEmail) {
    return res.json({ success: false, error: 'Email не привязан к аккаунту. Добавь его в Настройки → Аккаунт.' });
  }

  // Генерируем 6-значный код
  const code   = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = Date.now() + 15 * 60 * 1000; // 15 минут

  recoveryCodes.set(username, { code, expiry, email: userData.recoveryEmail });

  try {
    await sendRecoveryEmail(userData.recoveryEmail, code);
    res.json({ success: true, message: 'Код отправлен на email' });
  } catch (err) {
    // Если email не настроен — всё равно продолжаем (код есть в консоли сервера)
    const isDevMode = !process.env.GMAIL_USER && !process.env.RESEND_API_KEY;
    if (isDevMode) {
      res.json({ success: true, message: 'Код выведен в консоль сервера (email не настроен)' });
    } else {
      res.json({ success: false, error: 'Не удалось отправить email: ' + err.message });
    }
  }
});

// Подтвердить сброс пароля
app.post('/api/reset-password', async (req, res) => {
  const { username, code, newPassword } = req.body;
  if (!username || !code || !newPassword) {
    return res.status(400).json({ error: 'Не все данные указаны' });
  }
  if (!users.has(username)) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  if (newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 4 символов' });
  }

  const recovery = recoveryCodes.get(username);
  if (!recovery || recovery.code !== code || Date.now() > recovery.expiry) {
    return res.status(400).json({ error: 'Неверный или просроченный код' });
  }

  // Reset password
  const userData = users.get(username);
  userData.passwordHash = hashPassword(newPassword.trim());
  users.set(username, userData);
  recoveryCodes.delete(username);
  await saveUsers();

  res.json({ success: true, message: 'Пароль изменён' });
});

// Обновить email для восстановления
// Шаг 1: Отправить код подтверждения на новый email
app.post('/api/update-recovery-email', async (req, res) => {
  const { username, email } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!email) {
    // Удаление email — без подтверждения
    const userData = users.get(username);
    userData.recoveryEmail = null;
    userData.emailVerified = false;
    users.set(username, userData);
    await saveUsers();
    return res.json({ success: true, cleared: true });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Некорректный email' });
  }

  const code   = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = Date.now() + 15 * 60 * 1000;
  emailVerifyCodes.set(username, { code, expiry, pendingEmail: email });

  try {
    await sendVerifyEmail(email, code);
    res.json({ success: true, needsVerify: true, message: 'Код отправлен на ' + email });
  } catch (err) {
    const isDevMode = !process.env.GMAIL_USER && !process.env.BREVO_API_KEY;
    if (isDevMode) {
      res.json({ success: true, needsVerify: true, message: 'Dev: код в консоли сервера' });
    } else {
      res.status(500).json({ error: 'Не удалось отправить код: ' + err.message });
    }
  }
});

// Шаг 2: Подтвердить код
app.post('/api/verify-email-code', async (req, res) => {
  const { username, code } = req.body;
  if (!username || !code) return res.status(400).json({ error: 'Нет данных' });
  if (!users.has(username))  return res.status(404).json({ error: 'Пользователь не найден' });

  const pending = emailVerifyCodes.get(username);
  if (!pending || pending.code !== code || Date.now() > pending.expiry) {
    return res.status(400).json({ error: 'Неверный или просроченный код' });
  }

  const userData = users.get(username);
  userData.recoveryEmail = pending.pendingEmail;
  userData.emailVerified = true;
  users.set(username, userData);
  emailVerifyCodes.delete(username);
  await saveUsers();

  res.json({ success: true, email: pending.pendingEmail });
});

// Поиск пользователей по nickname
app.post('/api/search-users', async (req, res) => {
  const { query, requester } = req.body;
  if (!query || query.trim().length < 1) {
    return res.json({ users: [] });
  }
  const q = query.toLowerCase().trim();
  const results = [];

  // Получаем список друзей запрашивающего чтобы пометить их
  const requesterData = requester && users.has(requester) ? users.get(requester) : null;
  const myFriends = new Set(requesterData?.friends || []);

  for (const [username, userData] of users.entries()) {
    // Пропускаем себя
    if (username === requester) continue;

    const nickname = (userData.nickname || '').toLowerCase();
    const uname    = username.toLowerCase();

    if (nickname.includes(q) || uname.includes(q)) {
      results.push({
        username,
        nickname:  userData.nickname || username,
        avatar:    userData.avatar   || null,
        isFriend:  myFriends.has(username),
      });
    }
    if (results.length >= 20) break;
  }

  // Сортируем: сначала точные совпадения по нику, потом по логину
  results.sort((a, b) => {
    const aNick = (a.nickname || '').toLowerCase();
    const bNick = (b.nickname || '').toLowerCase();
    const aScore = (aNick === q || a.username === q) ? 0 : (aNick.startsWith(q) || a.username.startsWith(q)) ? 1 : 2;
    const bScore = (bNick === q || b.username === q) ? 0 : (bNick.startsWith(q) || b.username.startsWith(q)) ? 1 : 2;
    return aScore - bScore;
  });

  res.json({ users: results.slice(0, 10) });
});

// Отправить заявку в друзья
app.post('/api/send-friend-request', async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'Не указаны имена' });
  if (!users.has(from) || !users.has(to)) return res.status(404).json({ error: 'Пользователь не найден' });
  if (from === to) return res.status(400).json({ error: 'Нельзя добавить себя' });

  const targetUser = users.get(to);
  if (!targetUser.friendRequests) targetUser.friendRequests = [];
  if (targetUser.friendRequests.includes(from)) {
    return res.json({ success: false, message: 'Заявка уже отправлена' });
  }
  targetUser.friendRequests.push(from);
  users.set(to, targetUser);
  await saveUsers();

  const targetSocketId = userSockets.get(to);
  if (targetSocketId) {
    io.to(targetSocketId).emit('friend-request', { from });
    // Also save to user's pending requests for when they reconnect
    // (already saved above via targetUser.friendRequests.push(from))
  }
  res.json({ success: true });
});

// Принять заявку
app.post('/api/accept-friend-request', async (req, res) => {
  const { username, requester } = req.body;
  if (!username || !requester) return res.status(400).json({ error: 'Не указаны имена' });
  if (!users.has(username) || !users.has(requester)) return res.status(404).json({ error: 'Пользователь не найден' });

  const user = users.get(username);
  const requesterUser = users.get(requester);

  if (!user.friendRequests) user.friendRequests = [];
  const index = user.friendRequests.indexOf(requester);
  if (index === -1) return res.status(400).json({ error: 'Заявка не найдена' });

  user.friendRequests.splice(index, 1);
  if (!user.friends) user.friends = [];
  if (!requesterUser.friends) requesterUser.friends = [];
  if (!user.friends.includes(requester)) user.friends.push(requester);
  if (!requesterUser.friends.includes(username)) requesterUser.friends.push(username);

  users.set(username, user);
  users.set(requester, requesterUser);
  await saveUsers();

  const userSocket = userSockets.get(username);
  if (userSocket) {
    io.to(userSocket).emit('friends-updated', { friends: user.friends });
  }
  const requesterSocket = userSockets.get(requester);
  if (requesterSocket) io.to(requesterSocket).emit('friends-updated', { friends: requesterUser.friends });

  res.json({ success: true, friends: user.friends });
});

// Отклонить заявку
app.post('/api/reject-friend-request', async (req, res) => {
  const { username, requester } = req.body;
  if (!username || !requester) return res.status(400).json({ error: 'Не указаны имена' });
  if (!users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });

  const user = users.get(username);
  if (!user.friendRequests) user.friendRequests = [];
  const index = user.friendRequests.indexOf(requester);
  if (index !== -1) {
    user.friendRequests.splice(index, 1);
    users.set(username, user);
    await saveUsers();
  }
  res.json({ success: true });
});

// Получить данные пользователя
app.post('/api/get-user-data', (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  const userData = users.get(username);
  res.json({
    friends:       userData.friends        || [],
    friendRequests:userData.friendRequests || [],
    groups:        userData.groups         || [],
    recoveryEmail: userData.recoveryEmail  || null,
    emailVerified: userData.emailVerified  || false,
  });
});

// Получить аватарку пользователя
app.post('/api/get-avatar', (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  const userData = users.get(username);
  res.json({
    avatar:   userData.avatar    || null,
    nickname: userData.nickname  || null,
  });
});

// Создать группу (упрощённо)
app.post('/api/create-group', async (req, res) => {
  const { creator, name, members } = req.body;
  if (!creator || !name) return res.status(400).json({ error: 'Не указаны данные' });
  if (!users.has(creator)) return res.status(404).json({ error: 'Создатель не найден' });

  const groupId = `group_${Date.now()}`;
  const group = { id: groupId, name, members: [creator, ...(members || [])] };
  for (const member of group.members) {
    if (users.has(member)) {
      const user = users.get(member);
      if (!user.groups) user.groups = [];
      user.groups.push(group);
      users.set(member, user);
    }
  }
  await saveUsers();
  // Notify all group members in real-time
  [...members, creator].forEach(m => {
    const sid = userSockets.get(m);
    if (sid) io.to(sid).emit('group-created', { groupId, name, creator });
  });
  res.json({ success: true, groupId });
});

// ========== ХРАНЕНИЕ ИСТОРИИ ==========
const HISTORY_FILE = 'history.json';
const MAX_HISTORY = 2000;
let messageHistory = [];

// Удаление сообщения
app.post('/api/delete-message', async (req, res) => {
  const { messageId, username } = req.body;
  if (!messageId || !username) return res.status(400).json({ error: 'Нет данных' });

  const idx = messageHistory.findIndex(m => String(m.id) === String(messageId));
  if (idx === -1) return res.status(404).json({ error: 'Сообщение не найдено' });

  const msg = messageHistory[idx];
  // Only author can delete
  if (msg.user !== username) return res.status(403).json({ error: 'Нет прав' });

  const room = msg.room;
  messageHistory.splice(idx, 1);
  saveHistory(); // async, don't await — respond immediately

  // Notify everyone in the room
  io.to(room).emit('message-deleted', { messageId, room });

  res.json({ success: true });
});

async function loadHistory() {
  try {
    const url = await getDownloadUrl(HISTORY_FILE);
    const response = await axios.get(url, { timeout: 5000 });
    if (response.data && Array.isArray(response.data)) {
      messageHistory = response.data.slice(-MAX_HISTORY);
      console.log(`📁 Загружено ${messageHistory.length} сообщений`);
    }
  } catch (err) {
    if (err.response?.status === 404) console.log('📁 history.json не найден');
    else console.error('Ошибка загрузки истории:', err.message);
  }
}

async function saveHistory() {
  try {
    const jsonBuffer = Buffer.from(JSON.stringify(messageHistory), 'utf-8');
    const uploadData = await getUploadUrl();
    const sha1 = calculateSHA1(jsonBuffer);
    await axios.post(uploadData.uploadUrl, jsonBuffer, {
      headers: {
        'Authorization': uploadData.authorizationToken,
        'X-Bz-File-Name': HISTORY_FILE,
        'Content-Type': 'application/json',
        'Content-Length': jsonBuffer.length,
        'X-Bz-Content-Sha1': sha1
      }
    });
    console.log('💾 История сохранена');
  } catch (err) {
    console.error('Ошибка сохранения истории:', err.message);
  }
}

// ========== ИНИЦИАЛИЗАЦИЯ B2 ==========
(async () => {
  try {
    console.log('🔄 Авторизация в Backblaze B2...');
    b2Auth = await authorizeB2();
    console.log('✅ Авторизация успешна');
    b2BucketId = await getBucketId(B2_BUCKET_NAME);
    console.log(`✅ ID бакета: ${b2BucketId}`);
    await loadUsers();
    await loadHistory();
  } catch (err) {
    console.error('❌ Ошибка подключения к B2:', err.message);
    process.exit(1);
  }
})();

// ========== SOCKET.IO ==========
const onlineUsers = new Map();    // socketId -> { username, lastSeen }
const userSockets = new Map();    // username -> socketId
const peerIdRegistry = new Map(); // username -> peerId
const missedCalls    = new Map(); // username -> [{ from, isVid, time }]
const activeCalls    = new Map(); // callee_username -> { from, isVid, startTime }

// Clean stale active calls every 30s
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of activeCalls.entries()) {
    if (now - v.startTime > 60000) activeCalls.delete(k);
  }
}, 30000);

function broadcastOnlineCount() {
  const now = Date.now();
  for (let [id, user] of onlineUsers.entries()) {
    if (now - user.lastSeen > 10000) onlineUsers.delete(id);
  }
  io.emit('online-count', onlineUsers.size);
}
setInterval(broadcastOnlineCount, 5000);

io.on('connection', (socket) => {
  let currentUser = null;

  socket.on('identify', (username) => {
    currentUser = username;
    onlineUsers.set(socket.id, { username, lastSeen: Date.now() });
    userSockets.set(username, socket.id);
    broadcastOnlineCount();
    // НЕ присоединяем к general — чат выбирается клиентом
    // Push pending friend requests to user on connect
    const userData = users.get(username);
    if (userData?.friendRequests?.length) {
      socket.emit('friend-requests-sync', { requests: userData.friendRequests });
    }
    // Resume active call — if someone is still ringing this user
    const active = activeCalls.get(username);
    if (active && Date.now() - active.startTime < 60000) { // call rings for max 60s
      socket.emit('call-invite', { from: active.from, isVid: active.isVid, resumed: true });
      console.log(`[Call] Resumed ring for ${username} from ${active.from}`);
    }

    // Deliver missed calls as one batch
    const missed = missedCalls.get(username);
    if (missed?.length) {
      const fresh = missed.filter(c => Date.now() - c.time < 10 * 60 * 1000); // 10 min
      missedCalls.delete(username);
      if (fresh.length) {
        socket.emit('missed-calls', { calls: fresh });
      }
    }
  });

  socket.on('join-room', (room) => {
    if (!currentUser) return;
    // Leave previous chat rooms but KEEP socket.id room (for direct notifications)
    const rooms = [...socket.rooms];
    rooms.forEach(r => {
      if (r !== socket.id) socket.leave(r);
    });
    socket.join(room);
    const roomHistory = messageHistory.filter(m => m.room === room).slice(-100);
    socket.emit('history', roomHistory);
  });

  socket.on('ping', () => {
    if (onlineUsers.has(socket.id)) {
      const user = onlineUsers.get(socket.id);
      user.lastSeen = Date.now();
      onlineUsers.set(socket.id, user);
    }
  });

  socket.on('message', ({ text, room }) => {
    if (!currentUser) return;
    const msg = {
      id: Date.now() + Math.random(),
      user: currentUser,
      text,
      type: 'text',
      time: new Date().toLocaleTimeString(),
      room: room || 'general'
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    saveHistory();
    io.to(msg.room).emit('message', msg);
  });

  socket.on('media-message', ({ mediaData, room }) => {
    if (!currentUser) return;
    const msg = {
      id: Date.now() + Math.random(),
      user: currentUser,
      text: mediaData.text || '',
      type: mediaData.type,
      url: mediaData.url,
      fileName: mediaData.fileName,
      time: new Date().toLocaleTimeString(),
      room: room || 'general'
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    saveHistory();
    io.to(msg.room).emit('message', msg);
  });

  // Обработчик обновления аватара
  socket.on('avatar-updated', ({ username, avatar }) => {
    if (!username || !users.has(username)) return;
    const user = users.get(username);
    user.avatar = avatar;
    users.set(username, user);
    saveUsers();
    // Рассылаем всем, чтобы обновились аватары в интерфейсе
    io.emit('avatar-updated', { username, avatar });
  });

  // PeerJS ID registration
  socket.on('peer-id', ({ username, peerId }) => {
    if (!username || !peerId) return;
    console.log(`[PeerID] ${username} → ${peerId}`);
    peerIdRegistry.set(username, peerId);
    // Broadcast to everyone so they can update their registry
    socket.broadcast.emit('peer-id', { username, peerId });
  });

  // Someone wants to call a specific user — request their latest peerId
  socket.on('get-peer-id', ({ target }) => {
    const pid = peerIdRegistry.get(target);
    if (pid) {
      socket.emit('peer-id', { username: target, peerId: pid });
    }
    // Also ask target to re-broadcast (in case registry stale)
    const targetSocketId = userSockets.get(target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('request-peer-id', {});
    }
  });

  // ── CALL RELAY ── forward call signals between users
  function relayTo(event, data) {
    const target = data.to;
    if (!target) return;
    const tid = userSockets.get(target);
    if (tid) {
      io.to(tid).emit(event, data);
    } else {
      // Target offline — store missed call so they see it when they reconnect
      if (event === 'call-invite') {
        const calls = missedCalls.get(target) || [];
        calls.push({ from: data.from, isVid: data.isVid, time: Date.now() });
        // Keep only last 10 missed calls
        missedCalls.set(target, calls.slice(-10));
        console.log(`[Call] Missed call stored for offline user "${target}"`);
      }
    }
  }
  socket.on('call-invite', data => {
    if (!data.resumed) {
      // Store as active ring so reconnecting user gets notified
      activeCalls.set(data.to, { from: data.from, isVid: data.isVid, startTime: Date.now() });
    }
    relayTo('call-invite', data);
  });
  socket.on('call-answer-ready', data => relayTo('call-answer-ready', data));
  socket.on('call-offer',        data => relayTo('call-offer',        data));
  socket.on('call-answer',       data => relayTo('call-answer',       data));
  socket.on('call-ice',          data => relayTo('call-ice',          data));
  socket.on('call-end', data => {
    // Clear active call
    activeCalls.delete(data.to);
    activeCalls.delete(data.from);
    relayTo('call-end', data);
  });
  socket.on('call-decline', data => {
    activeCalls.delete(data.to);
    activeCalls.delete(data.from);
    relayTo('call-decline', data);
  });
  socket.on('call-answer-ready', data => {
    // Callee answered — clear active call
    activeCalls.delete(data.from);
    relayTo('call-answer-ready', data);
  });
  socket.on('call-busy',           data => relayTo('call-busy',           data));
  socket.on('screen-share-started', data => relayTo('screen-share-started', data));
  socket.on('screen-share-stopped', data => relayTo('screen-share-stopped', data));

  socket.on('disconnect', () => {
    if (currentUser) {
      userSockets.delete(currentUser);
      peerIdRegistry.delete(currentUser);
      onlineUsers.delete(socket.id);
      broadcastOnlineCount();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
