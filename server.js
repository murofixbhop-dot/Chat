const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Раздаём статические файлы из папки public
app.use(express.static('public'));

// Хранилище истории сообщений (последние 50)
const messageHistory = [];
const MAX_HISTORY = 50;

io.on('connection', (socket) => {
    // При подключении имя ещё не задано
    let userName = 'Гость';

    // Отправляем новому пользователю историю сообщений (без имени)
    socket.emit('history', messageHistory);

    // Клиент сообщает нам своё имя
    socket.on('set-name', (name) => {
        userName = name || 'Гость';
        socket.data.userName = userName;
        // Оповещаем всех, кроме нового, что пользователь присоединился
        socket.broadcast.emit('system', `${userName} присоединился к чату`);
    });

    // Обработка смены имени в процессе
    socket.on('change-name', (newName) => {
        const oldName = userName;
        userName = newName || 'Гость';
        socket.data.userName = userName;
        // Оповещаем всех о смене имени
        io.emit('system', `${oldName} теперь известен как ${userName}`);
    });

    // Обработка входящего сообщения
    socket.on('message', (text) => {
        const msg = {
            id: Date.now() + Math.random(),
            user: socket.data.userName || 'Гость',
            text: text,
            time: new Date().toLocaleTimeString()
        };
        // Сохраняем в историю
        messageHistory.push(msg);
        if (messageHistory.length > MAX_HISTORY) messageHistory.shift();

        // Рассылаем всем
        io.emit('message', msg);
    });

    // При отключении
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
