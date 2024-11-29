require('dotenv').config();
const express = require('express');
const socketio = require('socket.io');
const app = express();

app.set('view engine', 'ejs');


app.get('/', (req, res) => {
    res.render('index');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/chat', (req, res) => {
    res.render('chat');
});

const PORT = process.env.PORT || 3000;
const httpServer = app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});
const io = socketio(httpServer);

io.on('connection', client => {
    console.log(`New user ${client.id} connected`);

    let users = Array.from(io.sockets.sockets.values()).map(socket => ({id: socket.id, name: socket.username}));
    console.log(users);

    client.on('disconnect', () => {
        console.log(`User ${client.id} disconnected`);
        client.broadcast.emit('user-leave', client.id);
    });

    client.on('register-name', username => {
        client.username = username;
        client.broadcast.emit('register-name', {id: client.id, username: username});
    })

    client.emit('list-users',  users)

    client.broadcast.emit('new-user', {id: client.id, name: client.name});  

});