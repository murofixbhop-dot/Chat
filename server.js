const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

// ========== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ (users.json в B2) ==========
const USERS_FILE = 'users.json';
let users = new Map(); // username -> { friends: [], registered: true, ... }

async function loadUsers() {
  try {
    const url = await getDownloadUrl(USERS_FILE);
    const response = await axios.get(url, { timeout: 5000 });
    if (response.data && typeof response.data === 'object') {
      // Преобразуем объект в Map
      users = new Map(Object.entries(response.data));
      console.log(`👥 Загружено ${users.size} пользователей`);
    }
  } catch (err) {
    if (err.response?.status === 404) {
      console.log('📁 Файл users.json не найден, будет создан');
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
    console.log('💾 Пользователи сохранены в B2');
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

// ========== API ДЛЯ ПОЛЬЗОВАТЕЛЕЙ ==========
app.use(express.json());

// Регистрация / вход (если имя свободно, регистрируем; иначе вход)
app.post('/api/login', async (req, res) => {
  const { username } = req.body;
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Имя не может быть пустым' });
  }
  const cleanName = username.trim();
  if (users.has(cleanName)) {
    // Пользователь существует - просто возвращаем его данные
    return res.json({ success: true, user: { username: cleanName, friends: users.get(cleanName).friends || [] } });
  } else {
    // Новый пользователь - создаём запись
    const newUser = { friends: [] };
    users.set(cleanName, newUser);
    await saveUsers();
    return res.json({ success: true, user: { username: cleanName, friends: [] } });
  }
});

// Добавить друга
app.post('/api/add-friend', async (req, res) => {
  const { username, friendName } = req.body;
  if (!username || !friendName) return res.status(400).json({ error: 'Не указаны имена' });
  if (!users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!users.has(friendName)) return res.status(404).json({ error: 'Друг не найден' });
  const user = users.get(username);
  if (!user.friends.includes(friendName)) {
    user.friends.push(friendName);
    users.set(username, user);
    await saveUsers();
  }
  res.json({ success: true, friends: user.friends });
});

// Получить список друзей
app.post('/api/get-friends', (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json({ friends: users.get(username).friends || [] });
});

// ========== ХРАНЕНИЕ ИСТОРИИ ==========
const HISTORY_FILE = 'history.json';
const MAX_HISTORY = 1000;
let messageHistory = [];

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

// ========== SOCKET.IO (ЧАТ) ==========
const onlineUsers = new Map(); // socketId -> { username, lastSeen }
const recentDisconnects = new Map();

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
    broadcastOnlineCount();
    // Можно отправить список друзей и т.д.
  });

  socket.on('ping', () => {
    if (onlineUsers.has(socket.id)) {
      const user = onlineUsers.get(socket.id);
      user.lastSeen = Date.now();
      onlineUsers.set(socket.id, user);
    }
  });

  socket.on('message', (text) => {
    if (!currentUser) return; // Неавторизованные не могут писать
    const msg = {
      id: Date.now() + Math.random(),
      user: currentUser,
      text,
      type: 'text',
      time: new Date().toLocaleTimeString()
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    saveHistory();
    io.emit('message', msg);
  });

  socket.on('media-message', (mediaData) => {
    if (!currentUser) return;
    const msg = {
      id: Date.now() + Math.random(),
      user: currentUser,
      text: mediaData.text || '',
      type: mediaData.type,
      url: mediaData.url,
      fileName: mediaData.fileName,
      time: new Date().toLocaleTimeString()
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    saveHistory();
    io.emit('message', msg);
  });

  socket.on('disconnect', () => {
    if (onlineUsers.has(socket.id)) {
      const user = onlineUsers.get(socket.id);
      recentDisconnects.set(user.username, Date.now());
      // Очистка старых записей
      for (let [name, time] of recentDisconnects) {
        if (Date.now() - time > 30000) recentDisconnects.delete(name);
      }
      onlineUsers.delete(socket.id);
      broadcastOnlineCount();
    }
  });

  // Отправляем историю при подключении (если пользователь авторизован)
  socket.emit('history', messageHistory);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
