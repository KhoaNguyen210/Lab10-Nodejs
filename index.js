require('dotenv').config();
const express = require('express');
const socketio = require('socket.io');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const app = express();

// Passport session setup
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
  },
  (accessToken, refreshToken, profile, done) => {
    return done(null, profile); // Save profile data to the session
  }
));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Middleware setup
app.use(session({ secret: 'keyboard cat', resave: true, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/chat', (req, res) => {
    res.render('chat');
});

app.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email']
}));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        // Successful authentication, redirect to chat page.
        res.redirect('/chat');
    }
);

app.get('/logout', (req, res) => {
    req.logout((err) => {
        res.redirect('/');
    });
});

// Server setup
const PORT = process.env.PORT || 3000;
const httpServer = app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});

const io = socketio(httpServer);

let users = [];  // Lưu trữ danh sách người dùng

io.on('connection', client => {
    console.log(`New user ${client.id} connected`);

    // Gửi lại danh sách người dùng cho client
    client.emit('list-users', users);

    // Cập nhật số người online
    io.emit('update-online-count', users.length);

    // Khi người dùng đăng ký tên
    client.on('register-name', username => {
        client.username = username;
        users.push({ id: client.id, username: username, status: 'rảnh', loginAt: new Date().toLocaleTimeString() });
        io.emit('new-user', { id: client.id, username: username, status: 'rảnh', loginAt: new Date().toLocaleTimeString() });
        
        // Cập nhật số người online
        io.emit('update-online-count', users.length);
    });

    // Khi người dùng ngắt kết nối
    client.on('disconnect', () => {
        console.log(`User ${client.id} disconnected`);
        
        // Tìm người dùng trong danh sách theo client.id
        const userIndex = users.findIndex(user => user.id === client.id);
        
        // Nếu tìm thấy người dùng, lấy tên và gửi thông báo thoát
        if (userIndex !== -1) {
            const username = users[userIndex].username;

            // Xóa người dùng khỏi danh sách
            users = users.filter(user => user.id !== client.id);

            // Gửi thông báo thoát với tên người dùng
            io.emit('user-leave', { username: username, id: client.id });
            
            // Cập nhật số người online
            io.emit('update-online-count', users.length);
        }
    });

});
