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
    // Kiểm tra email người dùng
    const userEmail = profile.emails[0].value;

    // Kiểm tra xem email có phải là @student.tdtu.edu.vn không
    if (!userEmail.endsWith('@student.tdtu.edu.vn')) {
      return done(null, false, { message: 'Email phải là @student.tdtu.edu.vn để đăng nhập.' });
    }

    // Nếu email hợp lệ, trả về profile
    return done(null, profile);
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
    // Kiểm tra nếu có thông báo lỗi (chỉ khi không có email hợp lệ)
    const errorMessage = req.query.error || null; // Lấy thông báo lỗi từ query string (nếu có)
    res.render('login', { errorMessage });
});

app.get('/chat', (req, res) => {
    // Bỏ kiểm tra đăng nhập, cho phép truy cập vào chat
    res.render('chat');
});

app.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email']
}));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
      // Kiểm tra nếu không có lỗi và email hợp lệ
      if (req.user && !req.user.emails[0].value.endsWith('@student.tdtu.edu.vn')) {
        return res.render('login', { errorMessage: 'Email phải là @student.tdtu.edu.vn để đăng nhập.' });
      }
      res.redirect('/chat'); // Nếu thành công, chuyển hướng đến chat page
    }
);

// Xử lý lỗi khi email không hợp lệ
app.use((err, req, res, next) => {
    if (err && err.message === 'Chỉ cho phép đăng nhập bằng email @student.tdtu.edu.vn') {
        res.render('login', { errorMessage: 'Chỉ cho phép đăng nhập bằng email @student.tdtu.edu.vn' });
    } else {
        next(err);
    }
});

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
        users.push({ id: client.id, username: username, status: 'Đang rảnh', loginAt: new Date().toLocaleTimeString() });
        io.emit('new-user', { id: client.id, username: username, status: 'Đang rảnh', loginAt: new Date().toLocaleTimeString() });

        // Phát sóng thông báo "vừa mới online"
        io.emit('show-online-notification', { username: username, action: 'online' });

        // Cập nhật số người online
        io.emit('update-online-count', users.length);
    });

    // Khi người dùng vào trang chat
    client.on('enter-chat', () => {
        // Cập nhật trạng thái của người dùng thành "Đang bận"
        const user = users.find(u => u.id === client.id);
        if (user) {
            user.status = 'Đang bận';
            io.emit('update-user-status', { id: client.id, status: 'Đang bận' });
            client.emit('user-info', { username: user.username, status: 'Đang bận' });
        }
    });

    // Khi người dùng ngắt kết nối
    client.on('disconnect', () => {
        console.log(`User ${client.id} disconnected`);
        
        // Tìm người dùng trong danh sách theo client.id
        const userIndex = users.findIndex(user => user.id === client.id);
        
        // Nếu tìm thấy người dùng, lấy tên và gửi thông báo thoát
        if (userIndex !== -1) {
            const username = users[userIndex].username;

            // Cập nhật trạng thái người dùng thành "Đang bận" khi họ thoát
            users[userIndex].status = 'Đang bận';
            io.emit('update-user-status', { username, status: 'Đang bận' });

            // Phát sóng thông báo "đã thoát khỏi ứng dụng"
            io.emit('show-online-notification', { username: username, action: 'offline' });
            
            // Xóa người dùng khỏi danh sách
            users = users.filter(user => user.id !== client.id);

            // Gửi thông báo thoát với tên người dùng
            io.emit('user-leave', { username: username, id: client.id });

            // Cập nhật số người online
            io.emit('update-online-count', users.length);
        }
    });
    // Lắng nghe sự kiện khi người dùng thay đổi trạng thái
    client.on('change-status', (status) => {
        const user = users.find(u => u.id === client.id);
        if (user) {
            user.status = status;
            io.emit('update-user-status', { id: client.id, status: status });
        }
    });
});