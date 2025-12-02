# Simple Chat Server

A clean real-time chat application for two people.

## Features

- **Real-time messaging** with Socket.IO
- **File sharing** (images, videos, documents up to 50MB)
- **Typing indicators**
- **Online/offline status**
- **Email & SMS notifications** when 'she' comes online
- **PIN-based authentication** (6-digit PINs)
- **Chat history** stored in SQLite database
- **Clean WhatsApp-like UI**
- **Reply functionality** with real-time support
- **Profile pictures** and PIN management
- **Clear chat** with PDF export to email
- **Real-time clock** display

## Default Login Credentials

- **Profile: He** - PIN: `192006`
- **Profile: She** - PIN: `122005`

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure notifications (optional):**
   - Copy `.env.example` to `.env`
   - Add your email and Pushover credentials for notifications

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Access the chat:**
   - Open http://localhost:3000 in your browser
   - Login with either profile using the PINs above

## Environment Variables

```env
# Email Configuration (Gmail)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Push Notification (Pushover)
PUSHOVER_TOKEN=your-pushover-token
PUSHOVER_USER=your-pushover-user

# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
```

## Deployment

### Heroku
1. Create Heroku app: `heroku create your-app-name`
2. Set environment variables: `heroku config:set EMAIL_USER=...`
3. Deploy: `git push heroku main`

### Railway/Render
1. Connect GitHub repository
2. Set environment variables in dashboard
3. Deploy automatically

## File Structure

```
chat_server/
├── server.js          # Main server file
├── package.json       # Dependencies
├── Procfile          # Heroku deployment
├── .gitignore        # Git ignore rules
├── chat.db           # SQLite database (created automatically)
├── uploads/          # File uploads directory
├── public/           # Frontend files
│   ├── whatsapp-chat.html    # Main HTML
│   ├── whatsapp-style.css    # Styles
│   └── whatsapp-chat.js      # Frontend JavaScript
├── .env              # Environment variables
└── README.md         # This file
```

## License

MIT License - feel free to modify and use for your needs.