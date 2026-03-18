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

// Генератор случайных имён
const animals = ['Кот', 'Пёс', 'Лис', 'Волк', 'Медведь', 'Заяц', 'Ёж', 'Бобр', 'Сова', 'Орёл'];
function randomName() {
    const animal = animals[Math.floor(Math.random() * animals.length)];
    const number = Math.floor(Math.random() * 1000);
    return `${animal}${number}`;
}

io.on('connection', (socket) => {
    // Присваиваем случайное имя
    const userName = randomName();
    socket.data.userName = userName;

    // Отправляем новому пользователю историю сообщений
    socket.emit('history', messageHistory);

    // Оповещаем всех, кроме нового, что пользователь присоединился
    socket.broadcast.emit('system', `${userName} присоединился к чату`);

    // Обработка входящего сообщения
    socket.on('message', (text) => {
        const msg = {
            id: Date.now() + Math.random(),
            user: userName,
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
        io.emit('system', `${userName} покинул чат`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});