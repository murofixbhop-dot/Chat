const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ========== 1. НАСТРОЙКА ЗАГРУЗКИ ФАЙЛОВ ==========
const uploadDir = path.join(__dirname, 'public/uploads');

// Создаём папку для загрузок, если её нет
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('✅ Папка uploads создана');
}

// Настройка multer (куда и как сохранять файлы)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Генерируем уникальное имя: дата + случайное число + расширение
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

// Раздаём статические файлы (включая загруженные фото)
app.use(express.static('public'));

// ========== 2. АВТОУДАЛЕНИЕ СТАРЫХ ФАЙЛОВ ==========
function deleteOldFiles() {
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000; // 7 дней в миллисекундах

  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error('Ошибка чтения папки uploads:', err);
      return;
    }

    files.forEach(file => {
      const filePath = path.join(uploadDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error('Ошибка получения информации о файле:', err);
          return;
        }

        const fileAge = now - stats.mtimeMs; // возраст файла в мс
        if (fileAge > oneWeek) {
          fs.unlink(filePath, err => {
            if (err) {
              console.error('Ошибка удаления файла:', err);
            } else {
              console.log(`🗑 Удалён старый файл: ${file}`);
            }
          });
        }
      });
    });
  });
}

// Запускаем очистку при старте сервера
deleteOldFiles();

// И запускаем очистку каждый день (24 часа)
setInterval(deleteOldFiles, 24 * 60 * 60 * 1000);

// ========== 3. ЭНДПОИНТ ДЛЯ ЗАГРУЗКИ ==========
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'audio';
    const fileUrl = `/uploads/${req.file.filename}`; // путь для доступа из браузера

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

// ========== 4. ЧАТ (ИСТОРИЯ, ИМЕНА, СООБЩЕНИЯ) ==========
const messageHistory = [];
const MAX_HISTORY = 100;

io.on('connection', (socket) => {
  let userName = 'Гость';

  // Отправляем историю новому пользователю
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

  socket.on('media-message', (mediaData) => {
    const msg = {
      id: Date.now() + Math.random(),
      user: socket.data.userName || 'Гость',
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
    if (socket.data.userName) {
      io.emit('system', `${socket.data.userName} покинул чат`);
    }
  });
});

// ========== 5. ЗАПУСК ==========
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
