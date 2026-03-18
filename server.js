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
const WORKER_URL = process.env.WORKER_URL;

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

function calculateSHA1(buffer) {
  const hash = crypto.createHash('sha1');
  hash.update(buffer);
  return hash.digest('hex');
}

async function uploadFileToB2(fileBuffer, fileName, mimeType) {
  const uploadData = await getUploadUrl();
  const sha1 = calculateSHA1(fileBuffer);

  await axios.post(uploadData.uploadUrl, fileBuffer, {
    headers: {
      'Authorization': uploadData.authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(fileName),
      'Content-Type': mimeType,
      'Content-Length': fileBuffer.length,
      'X-Bz-Content-Sha1': sha1
    }
  });

  return `${WORKER_URL}/${B2_BUCKET_NAME}/${fileName}`;
}

// Инициализация B2
(async () => {
  try {
    console.log('🔄 Авторизация в Backblaze B2...');
    b2Auth = await authorizeB2();
    console.log('✅ Авторизация успешна');
    b2BucketId = await getBucketId(B2_BUCKET_NAME);
    console.log(`✅ ID бакета: ${b2BucketId}`);
    await loadHistoryFromB2();
  } catch (err) {
    console.error('❌ Ошибка подключения к B2:', err.message);
    process.exit(1);
  }
})();

// ========== ХРАНЕНИЕ ИСТОРИИ В B2 ==========
const HISTORY_FILE_NAME = 'history.json';
const MAX_HISTORY = 1000;
let messageHistory = [];

async function loadHistoryFromB2() {
  try {
    const url = `${WORKER_URL}/${B2_BUCKET_NAME}/${HISTORY_FILE_NAME}`;
    const response = await axios.get(url, { timeout: 5000 });
    if (response.data && Array.isArray(response.data)) {
      messageHistory = response.data.slice(-MAX_HISTORY);
      console.log(`📁 Загружено ${messageHistory.length} сообщений`);
    }
  } catch (err) {
    if (err.response?.status === 404) {
      console.log('📁 Файл истории не найден, будет создан');
    } else {
      console.error('Ошибка загрузки истории:', err.message);
    }
  }
}

async function saveHistoryToB2() {
  try {
    const jsonBuffer = Buffer.from(JSON.stringify(messageHistory), 'utf-8');
    const uploadData = await getUploadUrl();
    const sha1 = calculateSHA1(jsonBuffer);

    await axios.post(uploadData.uploadUrl, jsonBuffer, {
      headers: {
        'Authorization': uploadData.authorizationToken,
        'X-Bz-File-Name': HISTORY_FILE_NAME,
        'Content-Type': 'application/json',
        'Content-Length': jsonBuffer.length,
        'X-Bz-Content-Sha1': sha1
      }
    });
    console.log('💾 История сохранена в B2');
  } catch (err) {
    console.error('Ошибка сохранения истории:', err.message);
  }
}

// ========== НАСТРОЙКА ЗАГРУЗКИ ФАЙЛОВ ==========
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.use(express.static('public'));

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

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
    const fileUrl = await uploadFileToB2(req.file.buffer, fileName, mimeType);

    res.json({
      success: true,
      url: fileUrl,
      type: fileType,
      name: req.file.originalname,
    });

  } catch (error) {
    console.error('Ошибка загрузки:', error.response?.data || error.message);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// ========== ЧАТ ==========
const users = new Map();
const recentDisconnects = new Map();

function broadcastOnlineCount() {
  const now = Date.now();
  for (let [id, user] of users.entries()) {
    if (now - user.lastSeen > 10000) users.delete(id);
  }
  io.emit('online-count', users.size);
}
setInterval(broadcastOnlineCount, 5000);

io.on('connection', (socket) => {
  let currentUserName = 'Гость';
  let hasName = false;

  socket.emit('history', messageHistory);
  socket.emit('online-count', users.size);

  socket.on('set-name', (name) => {
    const newName = name?.trim() || 'Гость';

    if (hasName && currentUserName !== newName) {
      const oldName = currentUserName;
      currentUserName = newName;
      socket.data.userName = currentUserName;
      if (users.has(socket.id)) {
        users.set(socket.id, { name: currentUserName, lastSeen: Date.now() });
      }
      io.emit('system', `${oldName} теперь известен как ${currentUserName}`);
    } else if (!hasName) {
      currentUserName = newName;
      socket.data.userName = currentUserName;
      users.set(socket.id, { name: currentUserName, lastSeen: Date.now() });
      hasName = true;

      const lastDisconnect = recentDisconnects.get(currentUserName);
      const now = Date.now();
      if (!lastDisconnect || now - lastDisconnect > 10000) {
        io.emit('system', `${currentUserName} присоединился к чату`);
      }
      recentDisconnects.delete(currentUserName);
      broadcastOnlineCount();
    }
  });

  socket.on('ping', () => {
    if (users.has(socket.id)) {
      const user = users.get(socket.id);
      user.lastSeen = Date.now();
      users.set(socket.id, user);
    }
  });

  socket.on('message', (text) => {
    const msg = {
      id: Date.now() + Math.random(),
      user: currentUserName,
      text,
      type: 'text',
      time: new Date().toLocaleTimeString()
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    saveHistoryToB2();
    io.emit('message', msg);
  });

  socket.on('media-message', (mediaData) => {
    const msg = {
      id: Date.now() + Math.random(),
      user: currentUserName,
      text: mediaData.text || '',
      type: mediaData.type,
      url: mediaData.url,
      fileName: mediaData.fileName,
      time: new Date().toLocaleTimeString()
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    saveHistoryToB2();
    io.emit('message', msg);
  });

  socket.on('disconnect', () => {
    if (users.has(socket.id)) {
      const user = users.get(socket.id);
      recentDisconnects.set(user.name, Date.now());
      for (let [name, time] of recentDisconnects) {
        if (Date.now() - time > 30000) recentDisconnects.delete(name);
      }
      users.delete(socket.id);
      broadcastOnlineCount();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
