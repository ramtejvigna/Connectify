import http from 'http';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const db = await open({
    filename: 'chat.db',
    driver: sqlite3.Database
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_offset TEXT UNIQUE,
      content TEXT
  );
`);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

let viewCount = 0;
// Keep track of typing users
const typingUsers = new Map();

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
    connectionStateRecovery: {}
})

io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);
    viewCount++;
    io.emit('viewCount', viewCount);

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        viewCount--;

        // Remove user from typing list when they disconnect
        if (typingUsers.has(socket.id)) {
            typingUsers.delete(socket.id);
            // Notify all clients that this user is no longer typing
            io.emit('typing', false, socket.id);
        }

        io.emit('viewCount', viewCount);
    });

    socket.on('message', (msg) => {
        if (msg === 'Sare' || msg === 'ok' || msg === 'Sare ok' || msg === 'sare' || msg === 'Alage' || msg === 'alage') {
            msg = `Goppa pagipodhi.....${msg} anta ${msg}`;
        }
        else if (msg === 'bye' || msg === 'Bye' || msg === 'BYE') {
            msg = 'Bye enti bye....Neat ga cheppu';
        }

        let result = db.run(`INSERT OR IGNORE INTO messages (client_offset, content) VALUES (?, ?)`, [socket.id, msg]);


        // When a message is sent, the user is no longer typing
        if (typingUsers.has(socket.id)) {
            typingUsers.delete(socket.id);
            socket.broadcast.emit('typing', false, socket.id);
        }

        io.emit('message', msg, socket.id, result.lastID);
    });

    if (!socket.recovered) {
        try {
            await db.each('SELECT id, content FROM messages WHERE id > ?',
                [socket.handshake.auth.serverOffset || 0],
                (_err, row) => {
                    socket.emit('message', row.content, row.id);
                }
            )
        } catch (e) {
            // something went wrong
            console.error('Error fetching messages:', e);
        }
    }

    // Add typing event handler
    socket.on('typing', (isTyping) => {
        if (isTyping) {
            typingUsers.set(socket.id, true);
        } else {
            typingUsers.delete(socket.id);
        }

        // Broadcast to all other clients that this user is typing
        socket.broadcast.emit('typing', isTyping, socket.id);
    });
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../client')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});