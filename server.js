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
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.static('public'));

// ========== 2. ХРАНЕНИЕ ИСТОРИИ ==========
const HISTORY_FILE = path.join(__dirname, 'history.json');
const MAX_HISTORY = 100;

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (e) { console.error('Ошибка загрузки истории:', e); }
  return [];
}

function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (e) { console.error('Ошибка сохранения истории:', e); }
}

let messageHistory = loadHistory();

// ========== 3. УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ОНЛАЙН ==========
const users = new Map(); // socketId -> { name, lastSeen }

// Функция обновления списка онлайн и рассылки количества
function broadcastOnlineCount() {
  const now = Date.now();
  // Удаляем неактивных более 10 секунд (сокеты, которые не пинговались)
  for (let [id, user] of users.entries()) {
    if (now - user.lastSeen > 10000) {
      users.delete(id);
    }
  }
  io.emit('online-count', users.size);
}

// Каждые 5 секунд проверяем активность и рассылаем
setInterval(broadcastOnlineCount, 5000);

// ========== 4. ЗАГРУЗКА ФАЙЛОВ ==========
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'audio';
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, url: fileUrl, type: fileType, name: req.file.originalname });
  } catch (error) {
    console.error('Ошибка загрузки:', error);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// ========== 5. АВТОУДАЛЕНИЕ СТАРЫХ ФАЙЛОВ ==========
function deleteOldFiles() {
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  fs.readdir(uploadDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(uploadDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > oneWeek) {
          fs.unlink(filePath, err => {
            if (!err) console.log(`🗑 Удалён старый файл: ${file}`);
          });
        }
      });
    });
  });
}
deleteOldFiles();
setInterval(deleteOldFiles, 24 * 60 * 60 * 1000);

// ========== 6. SOCKET.IO ==========
io.on('connection', (socket) => {
  let currentUserName = 'Гость';
  let hasName = false;

  // При подключении сразу отправляем историю и текущее количество онлайн
  socket.emit('history', messageHistory);
  socket.emit('online-count', users.size);

  // Клиент сообщает своё имя (при первом входе или смене)
  socket.on('set-name', (name) => {
    const newName = name?.trim() || 'Гость';
    // Если имя изменилось и это не первая установка
    if (hasName && currentUserName !== newName) {
      // Меняем имя, обновляем в users
      const oldName = currentUserName;
      currentUserName = newName;
      socket.data.userName = currentUserName;
      // Обновляем запись в users
      if (users.has(socket.id)) {
        users.set(socket.id, { name: currentUserName, lastSeen: Date.now() });
      }
      // Оповещаем всех о смене имени (если нужно)
      io.emit('system', `${oldName} теперь известен как ${currentUserName}`);
    } else if (!hasName) {
      // Первая установка имени после подключения
      currentUserName = newName;
      socket.data.userName = currentUserName;
      // Добавляем в список онлайн
      users.set(socket.id, { name: currentUserName, lastSeen: Date.now() });
      hasName = true;
      // Отправляем системное сообщение о входе, только если это не повторное подключение
      // Проверим, было ли это имя в списке недавно? Для простоты будем слать всегда при первом входе.
      // Но можно усложнить: хранить имена, которые уже были сегодня, но пока оставим просто.
      io.emit('system', `${currentUserName} присоединился к чату`);
      broadcastOnlineCount(); // сразу обновим счётчик
    }
  });

  // Клиент отправляет пинг (каждые 3 секунды)
  socket.on('ping', () => {
    if (users.has(socket.id)) {
      const user = users.get(socket.id);
      user.lastSeen = Date.now();
      users.set(socket.id, user);
    }
  });

  // Текстовое сообщение
  socket.on('message', (text) => {
    const msg = {
      id: Date.now() + Math.random(),
      user: currentUserName,
      text: text,
      type: 'text',
      time: new Date().toLocaleTimeString()
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    saveHistory(messageHistory);
    io.emit('message', msg);
  });

  // Медиа-сообщение (фото/аудио)
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
    saveHistory(messageHistory);
    io.emit('message', msg);
  });

  // Отключение
  socket.on('disconnect', () => {
    if (users.has(socket.id)) {
      const userName = users.get(socket.id).name;
      users.delete(socket.id);
      // Не отправляем сообщение о выходе, только обновляем счётчик
      broadcastOnlineCount();
    }
  });
});

// ========== 7. ЗАПУСК ==========
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📁 Загружено сообщений: ${messageHistory.length}`);
});
