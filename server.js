const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const cors = require('cors');
const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
const https = require('https');

const os = require('os');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads directory
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

// Database setup
const dbPath = process.env.DATABASE_URL || 'chat.db';
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    pin TEXT,
    gender TEXT,
    email TEXT,
    phone TEXT,
    profile_picture TEXT,
    is_online INTEGER DEFAULT 0,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add profile_picture column if it doesn't exist
  db.run(`ALTER TABLE users ADD COLUMN profile_picture TEXT`, (err) => {});

  // Messages table
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    receiver TEXT,
    message TEXT,
    file_path TEXT,
    file_type TEXT,
    reply_to INTEGER DEFAULT NULL,
    is_read INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reply_to) REFERENCES messages(id)
  )`);

  // Add is_read column if it doesn't exist
  db.run(`ALTER TABLE messages ADD COLUMN is_read INTEGER DEFAULT 0`, (err) => {});

  // Insert default users
  const defaultUsers = [
    { 
      username: 'he', 
      pin: '192006', 
      gender: 'male', 
      email: process.env.EMAIL_USER || 'rakeshyemineni2005@gmail.com', 
      phone: '+918688279297' 
    },
    { 
      username: 'she', 
      pin: '122005', 
      gender: 'female', 
      email: 'she@example.com', 
      phone: '+0987654321' 
    }
  ];

  defaultUsers.forEach(user => {
    bcrypt.hash(user.pin, 10, (err, hash) => {
      if (err) {
        console.error('Error hashing PIN:', err);
        return;
      }
      db.run(`INSERT OR IGNORE INTO users (username, pin, gender, email, phone) VALUES (?, ?, ?, ?, ?)`,
        [user.username, hash, user.gender, user.email, user.phone], (err) => {
          if (err) {
            console.error('Error inserting user:', err);
          }
        });
    });
  });
});

// Email configuration
let emailTransporter = null;
let useSendGrid = false;

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  useSendGrid = true;
  console.log('SendGrid configured');
} else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
  console.log('Gmail configured');
}

// Send email function
const sendEmail = async (to, subject, text) => {
  try {
    if (useSendGrid) {
      const msg = {
        to: to,
        from: process.env.EMAIL_USER || 'rakeshyemineni2005@gmail.com',
        subject: subject,
        text: text
      };
      await sgMail.send(msg);
      console.log('Email sent via SendGrid');
    } else if (emailTransporter) {
      await emailTransporter.sendMail({
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
        text: text
      });
      console.log('Email sent via Gmail');
    }
  } catch (error) {
    console.error('Email error:', error);
  }
};

// Google Drive configuration
let driveService = null;
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });
  
  driveService = google.drive({ version: 'v3', auth: oauth2Client });
  console.log('Google Drive service initialized');
} else {
  console.log('Google Drive not configured - files will be stored locally');
}

// Debug email configuration
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  console.log('Email configured for:', process.env.EMAIL_USER);
} else {
  console.log('Email not configured - check EMAIL_USER and EMAIL_PASS');
}

// Upload to Google Drive
const uploadToDrive = async (filePath, fileName, mimeType) => {
  if (!driveService) return null;
  
  try {
    const fileMetadata = {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID || 'root']
    };
    
    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(filePath)
    };
    
    const response = await driveService.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id,webViewLink'
    });
    
    await driveService.permissions.create({
      fileId: response.data.id,
      resource: { role: 'reader', type: 'anyone' }
    });
    
    console.log('File uploaded to Drive:', fileName);
    return {
      id: response.data.id,
      directLink: `https://drive.google.com/uc?id=${response.data.id}`
    };
  } catch (error) {
    console.error('Drive upload error:', error.message);
    return null;
  }
};

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitizedName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: images, videos, documents'));
    }
  }
});

// Profile picture upload configuration
const profileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Store active users with timestamps
const activeUsers = new Map();
const userHeartbeats = new Map();

// Utility functions
const validateInput = (input, type) => {
  switch (type) {
    case 'username':
      return input && typeof input === 'string' && /^(he|she)$/.test(input);
    case 'pin':
      return input && typeof input === 'string' && /^\d{6}$/.test(input);
    default:
      return false;
  }
};

const sanitizeMessage = (message) => {
  if (!message || typeof message !== 'string') return '';
  return message.trim().substring(0, 1000); // Limit message length
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'whatsapp-chat.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Login endpoint
app.post('/login', async (req, res) => {
  try {
    const { username, pin } = req.body;
    
    if (!validateInput(username, 'username') || !validateInput(pin, 'pin')) {
      return res.status(400).json({ error: 'Invalid username or PIN format' });
    }
    
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      bcrypt.compare(pin, user.pin, (err, match) => {
        if (err) {
          console.error('Bcrypt error:', err);
          return res.status(500).json({ error: 'Server error' });
        }
        
        if (!match) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Update user online status
        db.run('UPDATE users SET is_online = 1, last_seen = CURRENT_TIMESTAMP WHERE username = ?', [username]);
        
        res.json({ 
          success: true, 
          user: { 
            username: user.username, 
            gender: user.gender
          } 
        });
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get chat history
app.get('/messages/:user1/:user2', (req, res) => {
  try {
    const { user1, user2 } = req.params;
    
    if (!validateInput(user1, 'username') || !validateInput(user2, 'username')) {
      return res.status(400).json({ error: 'Invalid usernames' });
    }
    
    db.all(`SELECT m.*, rm.message as reply_message, rm.sender as reply_sender 
            FROM messages m 
            LEFT JOIN messages rm ON m.reply_to = rm.id
            WHERE (m.sender = ? AND m.receiver = ?) OR (m.sender = ? AND m.receiver = ?)
            ORDER BY m.timestamp ASC
            LIMIT 1000`,
      [user1, user2, user2, user1], (err, messages) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(messages);
    });
  } catch (error) {
    console.error('Messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change PIN endpoint
app.post('/change-pin', async (req, res) => {
  try {
    const { username, currentPin, newPin } = req.body;
    
    if (!validateInput(username, 'username') || 
        !validateInput(currentPin, 'pin') || 
        !validateInput(newPin, 'pin')) {
      return res.status(400).json({ error: 'Invalid input format' });
    }
    
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      bcrypt.compare(currentPin, user.pin, (err, match) => {
        if (err) {
          console.error('Bcrypt error:', err);
          return res.status(500).json({ error: 'Server error' });
        }
        
        if (!match) {
          return res.status(401).json({ error: 'Current PIN is incorrect' });
        }
        
        bcrypt.hash(newPin, 10, (err, hash) => {
          if (err) {
            console.error('Hash error:', err);
            return res.status(500).json({ error: 'Failed to update PIN' });
          }
          
          db.run('UPDATE users SET pin = ? WHERE username = ?', [hash, username], (err) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Failed to update PIN' });
            }
            res.json({ success: true, message: 'PIN updated successfully' });
          });
        });
      });
    });
  } catch (error) {
    console.error('Change PIN error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile picture endpoint
app.post('/update-profile-picture', profileUpload.single('profilePicture'), (req, res) => {
  try {
    const { username } = req.body;
    
    if (!validateInput(username, 'username')) {
      return res.status(400).json({ error: 'Invalid username' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const profilePicturePath = '/uploads/' + req.file.filename;
    
    db.run('UPDATE users SET profile_picture = ? WHERE username = ?', [profilePicturePath, username], (err) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to update profile picture' });
      }
      res.json({ success: true, profilePicture: profilePicturePath });
    });
  } catch (error) {
    console.error('Profile picture update error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user profile endpoint
app.get('/user-profile/:username', (req, res) => {
  try {
    const { username } = req.params;
    
    if (!validateInput(username, 'username')) {
      return res.status(400).json({ error: 'Invalid username' });
    }
    
    db.get('SELECT username, gender, profile_picture, is_online FROM users WHERE username = ?', [username], (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Server error' });
      }
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(user);
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Clear chat endpoint
app.post('/clear-chat', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!validateInput(username, 'username')) {
      return res.status(400).json({ error: 'Invalid username' });
    }
    
    // Get all messages for PDF
    db.all(`SELECT m.*, rm.message as reply_message, rm.sender as reply_sender 
            FROM messages m 
            LEFT JOIN messages rm ON m.reply_to = rm.id
            ORDER BY m.timestamp ASC`, async (err, messages) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      try {
        // Generate text export for email
        let textContent = `Chat History Export\nGenerated on: ${new Date().toLocaleString()}\nTotal messages: ${messages.length}\n\n`;
        
        messages.forEach(msg => {
          const time = new Date(msg.timestamp).toLocaleString();
          textContent += `[${time}] ${msg.sender}: `;
          
          if (msg.reply_message) {
            textContent += `(Reply to: ${msg.reply_message}) `;
          }
          
          if (msg.file_path) {
            const fileName = msg.file_path.split('/').pop();
            textContent += `[File: ${fileName}] `;
          }
          
          if (msg.message) {
            textContent += msg.message;
          }
          
          textContent += '\n';
        });
        
        // Email text export
        await sendEmail(
          process.env.EMAIL_USER || 'rakeshyemineni2005@gmail.com',
          'Chat History Export',
          textContent
        );
        
        // Clear all messages
        db.run('DELETE FROM messages', (err) => {
          if (err) {
            console.error('Clear chat error:', err);
            return res.status(500).json({ error: 'Failed to clear chat' });
          }
          res.json({ success: true, message: 'Chat cleared and exported to email' });
        });
        
      } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export chat' });
      }
    });
  } catch (error) {
    console.error('Clear chat error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// File upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const isMedia = req.file.mimetype.startsWith('image/') || req.file.mimetype.startsWith('video/');
    let fileData = {
      path: '/uploads/' + req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    };
    
    // Upload images/videos to Google Drive
    if (isMedia && driveService) {
      console.log('Uploading to Google Drive:', req.file.originalname);
      const driveResult = await uploadToDrive(
        req.file.path,
        req.file.originalname,
        req.file.mimetype
      );
      
      if (driveResult) {
        fileData.path = driveResult.directLink;
        fileData.driveId = driveResult.id;
        
        // Delete local file after successful upload
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Failed to delete local file:', err);
        });
      }
    }
    
    res.json(fileData);
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Notification functions
const sendOnlineNotifications = async (username) => {
  if (username !== 'she') return;
  
  try {
    // Push notification to phone (free)
    if (process.env.PUSHOVER_TOKEN && process.env.PUSHOVER_USER) {
      const pushData = JSON.stringify({
        token: process.env.PUSHOVER_TOKEN,
        user: process.env.PUSHOVER_USER,
        message: 'She is online in the chat!',
        title: 'Chat Notification'
      });
      
      const options = {
        hostname: 'api.pushover.net',
        port: 443,
        path: '/1/messages.json',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(pushData)
        }
      };
      
      const req = https.request(options, (res) => {
        console.log('Push notification sent:', res.statusCode);
      });
      
      req.on('error', (error) => {
        console.error('Push notification error:', error.message);
      });
      
      req.write(pushData);
      req.end();
    }
  } catch (error) {
    console.error('Notification error:', error);
  }
};

const sendMessageNotification = async (sender, message, fileData) => {
  if (sender !== 'she') return;
  
  // Check if 'he' is offline
  const isHeOnline = activeUsers.has('he');
  if (isHeOnline) return;
  
  try {
    // Email notification for messages when he is offline
    let messageContent = message || '';
    if (fileData) {
      messageContent += fileData.mimetype.startsWith('image/') ? ' [Photo]' : ` [File: ${fileData.originalname}]`;
    }
    
    await sendEmail(
      process.env.EMAIL_USER || 'rakeshyemineni2005@gmail.com',
      'New message from She',
      `She sent: ${messageContent}\n\nTime: ${new Date().toLocaleString()}`
    );
  } catch (error) {
    console.error('Message notification error:', error);
  }
};

// Socket.IO events
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (username) => {
    if (!validateInput(username, 'username')) {
      socket.disconnect();
      return;
    }
    
    socket.username = username;
    activeUsers.set(username, socket.id);
    userHeartbeats.set(username, Date.now());
    
    // Broadcast online status
    socket.broadcast.emit('user_status', { username, online: true });
    
    // Send current online users
    const onlineUsers = Array.from(activeUsers.keys());
    socket.emit('online_users', onlineUsers);
    
    // Send notification if 'she' comes online
    if (username === 'she') {
      console.log('She came online - sending notifications');
      sendOnlineNotifications(username);
    }
  });

  socket.on('heartbeat', () => {
    if (socket.username) {
      userHeartbeats.set(socket.username, Date.now());
    }
  });

  socket.on('message', async (data) => {
    try {
      const { receiver, message, fileData, replyTo, replyData } = data;
      const sender = socket.username;
      

      
      if (!validateInput(sender, 'username') || !validateInput(receiver, 'username')) {
        return;
      }
      
      const sanitizedMessage = sanitizeMessage(message);
      
      // Store message in database
      const stmt = db.prepare(`INSERT INTO messages (sender, receiver, message, file_path, file_type, reply_to, is_read) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      stmt.run([sender, receiver, sanitizedMessage, fileData?.path, fileData?.mimetype, replyTo, 0], function(err) {
        if (err) {
          console.error('Database error:', err);
          return;
        }
        
        const messageData = {
          id: this.lastID,
          sender,
          receiver,
          message: sanitizedMessage,
          timestamp: new Date().toISOString(),
          replyTo,
          replyData: replyData || null,
          fileData,
          is_read: 0
        };
        
        // Send email notification if he is offline
        sendMessageNotification(sender, sanitizedMessage, fileData);
        
        // Send to receiver if online
        const receiverSocketId = activeUsers.get(receiver);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('message', messageData);
        }
        
        // Confirm to sender
        socket.emit('message_sent', messageData);
      });
      stmt.finalize();
    } catch (error) {
      console.error('Message error:', error);
    }
  });

  socket.on('typing', (data) => {
    const { receiver, typing } = data;
    const receiverSocketId = activeUsers.get(receiver);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing', { typing });
    }
  });

  socket.on('mark_read', (data) => {
    const { messageIds } = data;
    const reader = socket.username;
    
    if (messageIds && messageIds.length > 0) {
      const placeholders = messageIds.map(() => '?').join(',');
      db.run(`UPDATE messages SET is_read = 1 WHERE id IN (${placeholders}) AND receiver = ?`, 
        [...messageIds, reader], (err) => {
          if (err) {
            console.error('Mark read error:', err);
          }
        });
    }
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      activeUsers.delete(socket.username);
      userHeartbeats.delete(socket.username);
      
      // Update database
      db.run('UPDATE users SET is_online = 0, last_seen = CURRENT_TIMESTAMP WHERE username = ?', [socket.username]);
      
      // Broadcast offline status
      socket.broadcast.emit('user_status', { username: socket.username, online: false });
    }
    console.log('User disconnected:', socket.id);
  });
});

// Auto-logout inactive users every minute
setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  for (const [username, lastHeartbeat] of userHeartbeats.entries()) {
    if (now - lastHeartbeat > timeout) {
      const socketId = activeUsers.get(username);
      if (socketId) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('session_expired');
          socket.disconnect();
        }
      }
      activeUsers.delete(username);
      userHeartbeats.delete(username);
      
      // Update database
      db.run('UPDATE users SET is_online = 0, last_seen = CURRENT_TIMESTAMP WHERE username = ?', [username]);
      
      console.log(`User ${username} auto-logged out due to inactivity`);
    }
  }
}, 60000); // Check every minute

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});