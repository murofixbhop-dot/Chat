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

// ========== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ==========
const USERS_FILE = 'users.json';
let users = new Map(); // username -> { nickname, avatar, theme, friends, friendRequests, groups }

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

// Хэш пароля (простой SHA-256 без внешних зависимостей)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'aura_salt_2026').digest('hex');
}

// Вход/регистрация с паролем
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
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
    // New registration
    const newUser = {
      nickname: cleanName,
      passwordHash: pwHash,
      avatar: null,
      theme: 'dark',
      friends: [],
      friendRequests: [],
      groups: []
    };
    users.set(cleanName, newUser);
    await saveUsers();
    return res.json({
      success: true,
      isNew: true,
      user: {
        username: cleanName,
        nickname: cleanName,
        avatar: null,
        theme: 'dark',
        friends: [],
        friendRequests: [],
        groups: []
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
  if (userSocket) io.to(userSocket).emit('friends-updated', { friends: user.friends });
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
    friends: userData.friends || [],
    friendRequests: userData.friendRequests || [],
    groups: userData.groups || []
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
