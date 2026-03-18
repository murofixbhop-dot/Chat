const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Настройка Cloudflare R2 (бесплатное хранилище 10 ГБ)
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || 'https://<account-id>.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'my-chat-app';

// Настройка multer для временного хранения файлов
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB макс
});

// Раздаём статические файлы
app.use(express.static('public'));

// Эндпоинт для загрузки файлов
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // Генерируем уникальное имя файла
    const fileExt = path.extname(req.file.originalname);
    const fileName = `${crypto.randomUUID()}${fileExt}`;
    const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'audio';

    // Загружаем в R2
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `uploads/${fileName}`,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    });

    await s3Client.send(command);

    // Формируем публичный URL (если настроен публичный доступ)
    const fileUrl = `${process.env.R2_PUBLIC_URL || 'https://pub-<hash>.r2.dev'}/uploads/${fileName}`;

    res.json({
      success: true,
      url: fileUrl,
      type: fileType,
      name: req.file.originalname,
    });
  } catch (error) {
    console.error('Ошибка загрузки:', error);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// Хранилище истории сообщений
const messageHistory = [];
const MAX_HISTORY = 100; // Увеличим до 100 сообщений

io.on('connection', (socket) => {
  let userName = 'Гость';

  // Отправляем историю
  socket.emit('history', messageHistory);

  socket.on('set-name', (name) => {
    userName = name || 'Гость';
    socket.data.userName = userName;
    socket.broadcast.emit('system', `${userName} присоединился к чату`);
  });

  socket.on('change-name', (newName) => {
    const oldName = userName;
    userName = newName || 'Гость';
    socket.data.userName = userName;
    io.emit('system', `${oldName} теперь известен как ${userName}`);
  });

  // Обработка текстовых сообщений
  socket.on('message', (text) => {
    const msg = {
      id: Date.now() + Math.random(),
      user: socket.data.userName || 'Гость',
      text: text,
      type: 'text',
      time: new Date().toLocaleTimeString()
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    io.emit('message', msg);
  });

  // Обработка медиа-сообщений
  socket.on('media-message', (mediaData) => {
    const msg = {
      id: Date.now() + Math.random(),
      user: socket.data.userName || 'Гость',
      text: mediaData.text || '',
      type: mediaData.type, // 'image' или 'audio'
      url: mediaData.url,
      fileName: mediaData.fileName,
      time: new Date().toLocaleTimeString()
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    io.emit('message', msg);
  });

  socket.on('disconnect', () => {
    if (socket.data.userName) {
      io.emit('system', `${socket.data.userName} покинул чат`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
