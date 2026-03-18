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

// ========== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ И ЗАЯВКАМИ ==========
const USERS_FILE = 'users.json';
let users = new Map(); // username -> { friends: [], friendRequests: [] }

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

// ========== API ДЛЯ ПОЛЬЗОВАТЕЛЕЙ ==========
app.use(express.json());

app.post('/api/login', async (req, res) => {
  const { username } = req.body;
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Имя не может быть пустым' });
  }
  const cleanName = username.trim();
  if (users.has(cleanName)) {
    const userData = users.get(cleanName);
    return res.json({
      success: true,
      user: {
        username: cleanName,
        friends: userData.friends || [],
        friendRequests: userData.friendRequests || []
      }
    });
  } else {
    const newUser = { friends: [], friendRequests: [] };
    users.set(cleanName, newUser);
    await saveUsers();
    return res.json({
      success: true,
      user: { username: cleanName, friends: [], friendRequests: [] }
    });
  }
});

// Отправить заявку в друзья
app.post('/api/send-friend-request', async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'Не указаны имена' });
  if (!users.has(from)) return res.status(404).json({ error: 'Отправитель не найден' });
  if (!users.has(to)) return res.status(404).json({ error: 'Пользователь не найден' });

  const targetUser = users.get(to);
  if (!targetUser.friendRequests) targetUser.friendRequests = [];
  if (targetUser.friendRequests.includes(from)) {
    return res.json({ success: false, message: 'Заявка уже отправлена' });
  }
  targetUser.friendRequests.push(from);
  users.set(to, targetUser);
  await saveUsers();

  // Уведомляем получателя через socket, если он онлайн
  const targetSocketId = userSockets.get(to);
  if (targetSocketId) {
    io.to(targetSocketId).emit('friend-request', { from });
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

  // Удаляем заявку
  user.friendRequests.splice(index, 1);
  // Добавляем в друзья обоим
  if (!user.friends) user.friends = [];
  if (!requesterUser.friends) requesterUser.friends = [];
  if (!user.friends.includes(requester)) user.friends.push(requester);
  if (!requesterUser.friends.includes(username)) requesterUser.friends.push(username);

  users.set(username, user);
  users.set(requester, requesterUser);
  await saveUsers();

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

// Получить список друзей и заявок
app.post('/api/get-user-data', (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  const userData = users.get(username);
  res.json({
    friends: userData.friends || [],
    friendRequests: userData.friendRequests || []
  });
});

// ========== ХРАНЕНИЕ ИСТОРИИ ==========
const HISTORY_FILE = 'history.json';
const MAX_HISTORY = 2000;
let messageHistory = []; // { id, user, text, type, url, fileName, time, room }

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
const onlineUsers = new Map(); // socketId -> { username, lastSeen }
const userSockets = new Map(); // username -> socketId

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
    socket.join('general');
    socket.emit('history', messageHistory.filter(m => m.room === 'general').slice(-100));
  });

  socket.on('join-room', (room) => {
    if (!currentUser) return;
    socket.leaveAll();
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

  socket.on('disconnect', () => {
    if (currentUser) {
      userSockets.delete(currentUser);
      onlineUsers.delete(socket.id);
      broadcastOnlineCount();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
