const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ========== 1. НАСТРОЙКА BACKBLAZE B2 ==========
const B2_ACCOUNT_ID = process.env.B2_ACCOUNT_ID;      // ваш keyID
const B2_APP_KEY = process.env.B2_APP_KEY;            // ваш applicationKey
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;    // имя созданного бакета

let b2Auth = null;          // сохраняем авторизацию
let b2BucketId = null;      // ID бакета (получим автоматически)

// Функция авторизации в B2
async function authorizeB2() {
  const credentials = `${B2_ACCOUNT_ID}:${B2_APP_KEY}`;
  const base64 = Buffer.from(credentials).toString('base64');
  const response = await axios.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${base64}` }
  });
  b2Auth = response.data; // содержит apiUrl, authorizationToken, downloadUrl
  return b2Auth;
}

// Функция получения bucketId по имени
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

// Функция получения URL для загрузки
async function getUploadUrl() {
  const response = await axios.post(
    `${b2Auth.apiUrl}/b2api/v2/b2_get_upload_url`,
    { bucketId: b2BucketId },
    { headers: { Authorization: b2Auth.authorizationToken } }
  );
  return response.data; // { uploadUrl, authorizationToken }
}

// Функция вычисления SHA‑1 (требуется B2)
function calculateSHA1(buffer) {
  const hash = crypto.createHash('sha1');
  hash.update(buffer);
  return hash.digest('hex');
}

// Инициализация B2 при старте сервера
(async () => {
  try {
    console.log('🔄 Авторизация в Backblaze B2...');
    await authorizeB2();
    console.log('✅ Авторизация успешна');
    b2BucketId = await getBucketId(B2_BUCKET_NAME);
    console.log(`✅ ID бакета "${B2_BUCKET_NAME}": ${b2BucketId}`);
  } catch (err) {
    console.error('❌ Ошибка подключения к B2:', err.message);
    process.exit(1); // если B2 недоступен, сервер не запустится
  }
})();

// ========== 2. НАСТРОЙКА ЗАГРУЗКИ ФАЙЛОВ ==========
const upload = multer({
  storage: multer.memoryStorage(), // файл в памяти, потом в B2
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

app.use(express.static('public'));

// Эндпоинт загрузки файла
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // Получаем временные данные для загрузки
    const uploadData = await getUploadUrl();
    
    const fileName = `${Date.now()}-${req.file.originalname}`;
    const fileBuffer = req.file.buffer;
    const sha1 = calculateSHA1(fileBuffer);
    const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'audio';
    
    // Загружаем в B2
    await axios.post(uploadData.uploadUrl, fileBuffer, {
      headers: {
        'Authorization': uploadData.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': req.file.mimetype,
        'Content-Length': fileBuffer.length,
        'X-Bz-Content-Sha1': sha1
      }
    });
    
    // Формируем публичную ссылку
    const fileUrl = `https://${b2Auth.downloadUrl}/file/${B2_BUCKET_NAME}/${fileName}`;
    
    res.json({
      success: true,
      url: fileUrl,
      type: fileType,
      name: req.file.originalname,
    });
    
  } catch (error) {
    console.error('Ошибка загрузки в B2:', error.response?.data || error.message);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// ========== 3. ЧАТ (ИСТОРИЯ, ПОЛЬЗОВАТЕЛИ) ==========
const messageHistory = [];
const MAX_HISTORY = 100;
const users = new Map();               // socketId -> { name, lastSeen }
const recentDisconnects = new Map();    // name -> timestamp

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
      // Смена имени
      const oldName = currentUserName;
      currentUserName = newName;
      socket.data.userName = currentUserName;
      if (users.has(socket.id)) {
        users.set(socket.id, { name: currentUserName, lastSeen: Date.now() });
      }
      io.emit('system', `${oldName} теперь известен как ${currentUserName}`);
    } else if (!hasName) {
      // Первая установка имени
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
    io.emit('message', msg);
  });

  socket.on('disconnect', () => {
    if (users.has(socket.id)) {
      const user = users.get(socket.id);
      recentDisconnects.set(user.name, Date.now());
      // очистка старых записей
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
