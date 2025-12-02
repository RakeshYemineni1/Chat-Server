class WhatsAppChat {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.otherUser = null;
        this.replyingTo = null;
        this.replyData = null;
        this.messages = new Map();
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkSession();
        this.showWelcomeMessage();
        this.startHeartbeat();
        this.startClock();
    }

    bindEvents() {
        // Login
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Change PIN
        document.getElementById('changePinBtn').addEventListener('click', () => {
            this.showChangePinModal();
        });

        // Clear Chat
        document.getElementById('clearChatBtn').addEventListener('click', () => {
            this.clearChat();
        });

        document.getElementById('mobileChangePinBtn').addEventListener('click', () => {
            this.hideMobileMenu();
            this.showChangePinModal();
        });

        document.getElementById('mobileClearChatBtn').addEventListener('click', () => {
            this.hideMobileMenu();
            this.clearChat();
        });

        document.getElementById('cancelPinChange').addEventListener('click', () => {
            this.hideChangePinModal();
        });

        document.getElementById('changePinForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.changePin();
        });

        // Update Profile Picture
        document.getElementById('updatePfpBtn').addEventListener('click', () => {
            this.showUpdatePfpModal();
        });

        document.getElementById('mobileUpdatePfpBtn').addEventListener('click', () => {
            this.hideMobileMenu();
            this.showUpdatePfpModal();
        });

        document.getElementById('cancelPfpUpdate').addEventListener('click', () => {
            this.hideUpdatePfpModal();
        });

        document.getElementById('selectPfpBtn').addEventListener('click', () => {
            document.getElementById('pfpInput').click();
        });

        document.getElementById('pfpInput').addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.previewProfilePicture(e.target.files[0]);
            }
        });

        document.getElementById('uploadPfpBtn').addEventListener('click', () => {
            this.updateProfilePicture();
        });

        // Mobile Menu
        document.getElementById('mobileMenuBtn').addEventListener('click', () => {
            this.toggleMobileMenu();
        });

        document.getElementById('mobileLogoutBtn').addEventListener('click', () => {
            this.hideMobileMenu();
            this.logout();
        });

        // File upload
        document.getElementById('attachBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput').addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.showFilePreview(e.target.files[0]);
            }
        });

        // Emoji picker
        document.getElementById('emojiBtn').addEventListener('click', () => {
            this.toggleEmojiPicker();
        });

        // Emoji categories
        document.querySelectorAll('.emoji-category').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchEmojiCategory(e.target.dataset.category);
            });
        });

        // Message input
        const messageInput = document.getElementById('messageInput');
        let typingTimer;
        
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        messageInput.addEventListener('input', (e) => {
            this.autoResize(e.target);
            
            // Typing indicator
            if (this.socket && this.otherUser) {
                this.socket.emit('typing', { receiver: this.otherUser, typing: true });
                
                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => {
                    this.socket.emit('typing', { receiver: this.otherUser, typing: false });
                }, 1000);
            }
        });

        // Send button
        document.getElementById('sendBtn').addEventListener('click', () => {
            this.sendMessage();
        });

        // Scroll to bottom button
        document.getElementById('scrollToBottomBtn').addEventListener('click', () => {
            this.scrollToBottom();
        });

        // Show/hide scroll button on scroll
        document.getElementById('messagesContainer').addEventListener('scroll', () => {
            this.handleScroll();
        });

        // Close modals when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.mobile-menu')) {
                this.hideMobileMenu();
            }
            if (!e.target.closest('.emoji-picker') && !e.target.closest('#emojiBtn')) {
                this.hideEmojiPicker();
            }
            if (e.target.classList.contains('modal') && e.target.id === 'filePreviewModal') {
                this.hideFilePreview();
            }
        });
    }

    checkSession() {
        const session = localStorage.getItem('chatSession');
        const wasLoggedOut = localStorage.getItem('manualLogout');
        
        if (wasLoggedOut === 'true') {
            localStorage.removeItem('manualLogout');
            this.showLoginScreen();
            return;
        }
        
        if (session) {
            try {
                const sessionData = JSON.parse(session);
                const now = Date.now();
                const sessionAge = now - sessionData.loginTime;
                
                if (sessionAge < 24 * 60 * 60 * 1000) {
                    this.currentUser = { username: sessionData.username };
                    this.otherUser = sessionData.username === 'he' ? 'she' : 'he';
                    this.initializeChat();
                    return;
                } else {
                    localStorage.removeItem('chatSession');
                }
            } catch (error) {
                console.error('Session parse error:', error);
                localStorage.removeItem('chatSession');
            }
        }
        this.showLoginScreen();
    }

    showLoginScreen() {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('chatScreen').classList.add('hidden');
    }

    showWelcomeMessage() {
        const container = document.getElementById('messagesContainer');
        const welcome = container.querySelector('.welcome-message');
        if (welcome) {
            setTimeout(() => {
                welcome.style.opacity = '1';
                welcome.style.transform = 'translateY(0)';
            }, 500);
        }
    }

    async login() {
        const username = document.getElementById('username').value;
        const pin = document.getElementById('pin').value;
        const errorDiv = document.getElementById('loginError');
        const submitBtn = document.querySelector('#loginForm button');

        if (!username || !pin) {
            this.showError(errorDiv, 'Please select profile and enter PIN');
            return;
        }

        if (pin.length !== 6) {
            this.showError(errorDiv, 'PIN must be 6 digits');
            return;
        }

        submitBtn.textContent = 'Connecting...';
        submitBtn.disabled = true;

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin })
            });

            const data = await response.json();

            if (data.success) {
                this.currentUser = data.user;
                this.otherUser = username === 'he' ? 'she' : 'he';
                localStorage.setItem('chatSession', JSON.stringify({
                    username: this.currentUser.username,
                    loginTime: Date.now()
                }));
                this.initializeChat();
            } else {
                this.showError(errorDiv, data.error || 'Login failed');
            }
        } catch (error) {
            this.showError(errorDiv, 'Connection error. Please try again.');
        } finally {
            submitBtn.textContent = 'Continue';
            submitBtn.disabled = false;
        }
    }

    showError(element, message) {
        element.textContent = message;
        element.style.animation = 'shake 0.5s ease-in-out';
        setTimeout(() => {
            element.style.animation = '';
        }, 500);
    }

    initializeChat() {
        document.getElementById('loginScreen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('chatScreen').classList.remove('hidden');
            document.getElementById('chatScreen').style.opacity = '1';
        }, 300);

        const contactName = document.getElementById('contactName');
        contactName.textContent = this.otherUser.charAt(0).toUpperCase() + this.otherUser.slice(1);

        this.loadContactProfile();
        this.loadCurrentUserProfile();

        this.socket = io();
        this.setupSocketEvents();
        this.socket.emit('join', this.currentUser.username);
        this.loadChatHistory();
    }

    setupSocketEvents() {
        this.socket.on('message', (data) => {
            this.addMessage(data, false);
            this.playNotificationSound();
            this.markMessagesAsRead([data.id]);
        });

        this.socket.on('message_sent', (data) => {
            data.status = 'sending';
            this.addMessage(data, true);
            
            setTimeout(() => {
                this.updateMessageStatus(data.id, 'sent');
            }, 500);
        });

        this.socket.on('user_status', (data) => {
            if (data.username === this.otherUser) {
                this.updateContactStatus(data.online);
            }
        });

        this.socket.on('online_users', (users) => {
            const isOnline = users.includes(this.otherUser);
            this.updateContactStatus(isOnline);
        });

        this.socket.on('typing', (data) => {
            this.showTypingIndicator(data.typing);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
        });
    }

    async loadChatHistory() {
        try {
            const response = await fetch(`/messages/${this.currentUser.username}/${this.otherUser}`);
            const messages = await response.json();

            const container = document.getElementById('messagesContainer');
            const welcome = container.querySelector('.welcome-message');
            if (welcome) welcome.remove();

            messages.forEach(msg => {
                const isSent = msg.sender === this.currentUser.username;
                const messageData = {
                    id: msg.id,
                    sender: msg.sender,
                    message: msg.message,
                    timestamp: msg.timestamp,
                    replyTo: msg.reply_to,
                    replyData: msg.reply_message ? {
                        sender: msg.reply_sender,
                        message: msg.reply_message
                    } : null,
                    fileData: msg.file_path ? {
                        path: msg.file_path,
                        mimetype: msg.file_type,
                        originalname: msg.file_path.split('/').pop()
                    } : null,
                    is_read: msg.is_read || 0
                };
                this.addMessage(messageData, isSent, false);
            });

            this.scrollToBottom();
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }

    addMessage(data, isSent, scroll = true) {
        if (this.messages.has(data.id.toString())) {
            return;
        }
        
        const container = document.getElementById('messagesContainer');
        const welcome = container.querySelector('.welcome-message');
        if (welcome) welcome.remove();

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
        messageDiv.setAttribute('data-message-id', data.id);

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';

        let content = '';

        // Reply block
        if (data.replyTo) {
            let replyData = data.replyData;
            
            if (!replyData && this.messages.has(data.replyTo)) {
                const replyMsg = this.messages.get(data.replyTo);
                replyData = {
                    sender: replyMsg.sender,
                    message: replyMsg.message,
                    fileData: replyMsg.fileData
                };
            }
            
            if (replyData) {
                const senderName = replyData.sender === this.currentUser.username ? 'You' : replyData.sender;
                let replyContent = '';
                
                if (replyData.fileData) {
                    const fileIcon = this.getFileIcon(replyData.fileData.mimetype);
                    replyContent = replyData.fileData.mimetype.startsWith('image/') ? '📷 Photo' : `📎 ${fileIcon}`;
                } else {
                    replyContent = this.escapeHtml(replyData.message || 'Message');
                }
                
                content += `
                    <div class="reply-block" onclick="whatsAppChat.scrollToMessage('${data.replyTo}')">
                        <div class="reply-sender">${senderName}</div>
                        <div class="reply-text">${replyContent}</div>
                    </div>
                `;
            }
        }

        // File content
        if (data.fileData) {
            content += this.renderFileMessage(data.fileData);
        }

        // Message text
        if (data.message) {
            content += `<div class="message-text">${this.escapeHtml(data.message)}</div>`;
        }

        // Message footer
        const time = new Date(data.timestamp).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        let statusIcon = '';
        if (isSent) {
            if (data.status === 'sending') {
                statusIcon = '<span class="read-status sending">⏱</span>';
            } else if (data.is_read) {
                statusIcon = '<span class="read-status read">✓✓</span>';
            } else {
                statusIcon = '<span class="read-status sent">✓</span>';
            }
        }
        
        content += `
            <div class="message-footer">
                <span class="message-time">${time}</span>
                ${statusIcon}
            </div>
        `;

        content += `<div class="reply-arrow" onclick="whatsAppChat.handleReplyClick(this, '${data.id}', '${this.escapeHtml(data.message || '')}', '${data.sender}')" data-file='${data.fileData ? JSON.stringify(data.fileData) : ''}'>↩</div>`;
        content += `<div class="reply-icon">↩</div>`;

        bubbleDiv.innerHTML = content;
        messageDiv.appendChild(bubbleDiv);
        
        this.addTouchEvents(bubbleDiv, data);
        
        container.appendChild(messageDiv);
        this.messages.set(data.id, data);

        if (scroll) {
            this.scrollToBottom();
        }
    }

    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();

        if (!message) return;

        const messageData = {
            receiver: this.otherUser,
            message: message,
            replyTo: this.replyingTo,
            replyData: this.replyData
        };
        
        this.socket.emit('message', messageData);

        messageInput.value = '';
        this.closeReply();
        this.autoResize(messageInput);
        
        this.socket.emit('typing', { receiver: this.otherUser, typing: false });
    }

    showFilePreview(file) {
        if (file.size > 50 * 1024 * 1024) {
            alert('File size must be less than 50MB');
            return;
        }

        this.selectedFile = file;
        const previewContent = document.getElementById('filePreviewContent');
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');

        if (isImage) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            previewContent.innerHTML = '';
            previewContent.appendChild(img);
        } else if (isVideo) {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.controls = true;
            previewContent.innerHTML = '';
            previewContent.appendChild(video);
        } else {
            const fileIcon = this.getFileIcon(file.type);
            previewContent.innerHTML = `
                <div class="file-preview-info">
                    <div class="file-preview-icon">${fileIcon}</div>
                    <div class="file-preview-details">
                        <div class="file-preview-name">${file.name}</div>
                        <div class="file-preview-size">${this.formatFileSize(file.size)}</div>
                    </div>
                </div>
            `;
        }

        document.getElementById('filePreviewModal').classList.remove('hidden');
        document.getElementById('fileCaption').focus();
    }

    hideFilePreview() {
        document.getElementById('filePreviewModal').classList.add('hidden');
        document.getElementById('fileCaption').value = '';
        document.getElementById('fileInput').value = '';
        this.selectedFile = null;
    }

    async sendFileWithPreview() {
        if (!this.selectedFile) return;

        const caption = document.getElementById('fileCaption').value.trim();
        const formData = new FormData();
        formData.append('file', this.selectedFile);

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const fileData = await response.json();
            
            this.socket.emit('message', {
                receiver: this.otherUser,
                message: caption,
                fileData: fileData,
                replyTo: this.replyingTo,
                replyData: this.replyData
            });
            
            this.closeReply();
            this.hideFilePreview();
        } catch (error) {
            console.error('File upload failed:', error);
            alert('File upload failed. Please try again.');
        }
    }

    renderFileMessage(fileData) {
        const isImage = fileData.mimetype.startsWith('image/');
        const isVideo = fileData.mimetype.startsWith('video/');
        
        if (isImage) {
            return `<div class="image-message"><img src="${fileData.path}" alt="${fileData.originalname}" onclick="window.open('${fileData.path}', '_blank')"></div>`;
        } else if (isVideo) {
            return `<div class="video-message"><video controls style="max-width: 250px; border-radius: 10px;"><source src="${fileData.path}" type="${fileData.mimetype}"></video></div>`;
        } else {
            const fileIcon = this.getFileIcon(fileData.mimetype);
            const fileSize = this.formatFileSize(fileData.size);
            return `
                <div class="file-message">
                    <div class="file-icon">${fileIcon}</div>
                    <div class="file-info">
                        <div class="file-name">${fileData.originalname}</div>
                        <div class="file-size">${fileSize}</div>
                    </div>
                    <button class="file-download" onclick="window.open('${fileData.path}', '_blank')">Download</button>
                </div>
            `;
        }
    }

    getFileIcon(mimetype) {
        if (mimetype.includes('pdf')) return 'PDF';
        if (mimetype.includes('doc')) return 'DOC';
        if (mimetype.includes('video')) return 'VID';
        if (mimetype.includes('audio')) return 'AUD';
        return 'FILE';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showTypingIndicator(isTyping) {
        const indicator = document.getElementById('typingIndicator');
        indicator.textContent = isTyping ? 'typing...' : '';
    }

    updateContactStatus(isOnline) {
        const statusElement = document.getElementById('contactStatus');
        statusElement.textContent = isOnline ? 'online' : 'offline';
        statusElement.className = `contact-status ${isOnline ? 'online' : ''}`;
    }

    setReplyTo(messageId, messageText, sender, fileData = null) {
        this.replyingTo = messageId;
        this.replyData = {
            id: messageId,
            message: messageText,
            sender: sender,
            fileData: fileData
        };
        
        const replyPreview = document.getElementById('replyPreview');
        const replyTo = document.getElementById('replyTo');
        const replyMessage = document.getElementById('replyMessage');
        
        const senderName = sender === this.currentUser.username ? 'You' : sender;
        
        replyTo.textContent = senderName;
        
        if (fileData) {
            const fileIcon = this.getFileIcon(fileData.mimetype);
            replyMessage.textContent = fileData.mimetype.startsWith('image/') ? '📷 Photo' : `📎 ${fileIcon}`;
        } else {
            replyMessage.textContent = messageText || 'Message';
        }
        
        replyPreview.classList.remove('hidden');
        document.getElementById('messageInput').focus();
    }

    handleReplyClick(element, messageId, messageText, sender) {
        const fileDataStr = element.getAttribute('data-file');
        const fileData = fileDataStr ? JSON.parse(fileDataStr) : null;
        this.setReplyTo(messageId, messageText, sender, fileData);
    }

    scrollToMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageElement.style.backgroundColor = 'rgba(0, 168, 132, 0.2)';
            setTimeout(() => {
                messageElement.style.backgroundColor = '';
            }, 2000);
        }
    }

    closeReply() {
        this.replyingTo = null;
        this.replyData = null;
        document.getElementById('replyPreview').classList.add('hidden');
    }

    toggleEmojiPicker() {
        const picker = document.getElementById('emojiPicker');
        if (picker.classList.contains('hidden')) {
            this.showEmojiPicker();
        } else {
            this.hideEmojiPicker();
        }
    }

    showEmojiPicker() {
        document.getElementById('emojiPicker').classList.remove('hidden');
        this.loadEmojis('smileys');
    }

    hideEmojiPicker() {
        document.getElementById('emojiPicker').classList.add('hidden');
    }

    switchEmojiCategory(category) {
        document.querySelectorAll('.emoji-category').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`).classList.add('active');
        this.loadEmojis(category);
    }

    loadEmojis(category) {
        const emojis = {
            smileys: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓'],
            people: ['👋','🤚','🖐️','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','👊','✊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄','💋'],
            nature: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕🦺','🐈','🐓','🦃','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦦','🦥','🐁','🐀','🐿️','🦔'],
            food: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜'],
            activities: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎵','🎶','🥽','🥼','🦺','👑','📿','💄','💍','💎'],
            travel: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🛹','🛼','🚁','🛸','✈️','🛩️','🛫','🛬','🪂','💺','🚀','🛰️','🚉','🚊','🚝','🚞','🚋','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛩️','💺','🛰️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','⛽','🚧','🚨','🚥','🚦','🛑','🚏','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🏠','🏡','🏘️','🏚️','🏗️','🏭','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪','🏫','🏩','💒','🏛️','⛪','🕌','🛕','🕍','🕋','⛩️','🛤️','🛣️','🗾','🎑','🏞️','🌅','🌄','🌠','🎇','🎆','🌇','🌆','🏙️','🌃','🌌','🌉','🌁'],
            objects: ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⏳','⌛','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','💰','💳','💎','⚖️','🧰','🔧','🔨','⚒️','🛠️','⛏️','🔩','⚙️','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','💊','💉','🧬','🦠','🧫','🧪','🌡️','🧹','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪒','🧽','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🖼️','🛍️','🛒','🎁','🎈','🎏','🎀','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','📊','📈','📉','🗒️','🗓️','📆','📅','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓'],
            symbols: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','♾️','💲','💱','™️','©️','®️','〰️','➰','➿','🔚','🔙','🔛','🔝','🔜','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','👁️🗨️','💬','💭','🗯️','♠️','♣️','♥️','♦️','🃏','🎴','🀄','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛','🕜','🕝','🕞','🕟','🕠','🕡','🕢','🕣','🕤','🕥','🕦','🕧']
        };

        const grid = document.getElementById('emojiGrid');
        grid.innerHTML = '';

        emojis[category].forEach(emoji => {
            const button = document.createElement('button');
            button.className = 'emoji-item';
            button.textContent = emoji;
            button.addEventListener('click', () => {
                this.insertEmoji(emoji);
            });
            grid.appendChild(button);
        });
    }

    insertEmoji(emoji) {
        const input = document.getElementById('messageInput');
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        
        input.value = text.substring(0, start) + emoji + text.substring(end);
        input.selectionStart = input.selectionEnd = start + emoji.length;
        input.focus();
        this.autoResize(input);
    }

    showSuccessMessage(message) {
        const successDiv = document.createElement('div');
        successDiv.textContent = message;
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #00a884 0%, #128c7e 100%);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 10px 20px rgba(0,0,0,0.2);
            z-index: 3000;
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(successDiv);
        
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }

    addTouchEvents(bubbleDiv, data) {
        let startX = 0;
        let currentX = 0;
        let isDragging = false;
        let dragThreshold = 50;
        
        bubbleDiv.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = false;
        }, { passive: true });
        
        bubbleDiv.addEventListener('touchmove', (e) => {
            if (!startX) return;
            
            currentX = e.touches[0].clientX;
            const diffX = currentX - startX;
            
            if (Math.abs(diffX) > 10) {
                isDragging = true;
                
                if (diffX > 0 && diffX < 100) {
                    bubbleDiv.style.transform = `translateX(${diffX}px)`;
                    
                    if (diffX > dragThreshold) {
                        bubbleDiv.classList.add('dragging');
                    } else {
                        bubbleDiv.classList.remove('dragging');
                    }
                }
            }
        }, { passive: true });
        
        bubbleDiv.addEventListener('touchend', (e) => {
            if (!isDragging) {
                startX = 0;
                return;
            }
            
            const diffX = currentX - startX;
            
            if (diffX > dragThreshold) {
                this.setReplyTo(data.id, data.message || '', data.sender, data.fileData);
            }
            
            bubbleDiv.style.transform = '';
            bubbleDiv.classList.remove('dragging');
            
            startX = 0;
            isDragging = false;
        }, { passive: true });
    }

    playNotificationSound() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    }

    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }

    handleScroll() {
        const container = document.getElementById('messagesContainer');
        const scrollBtn = document.getElementById('scrollToBottomBtn');
        const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
        
        if (isAtBottom) {
            scrollBtn.classList.add('hidden');
        } else {
            scrollBtn.classList.remove('hidden');
        }
    }

    scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showChangePinModal() {
        document.getElementById('changePinModal').classList.remove('hidden');
        document.getElementById('currentPin').focus();
    }

    hideChangePinModal() {
        document.getElementById('changePinModal').classList.add('hidden');
        document.getElementById('changePinForm').reset();
        document.getElementById('pinChangeError').textContent = '';
    }

    async clearChat() {
        if (!confirm('This will clear all chat history and download a PDF copy. Continue?')) {
            return;
        }

        try {
            const pdfResponse = await fetch('/generate-pdf');
            const pdfData = await pdfResponse.json();
            
            if (pdfData.content) {
                this.downloadPDF(pdfData.content);
            }
            
            const response = await fetch('/clear-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: this.currentUser.username })
            });

            const data = await response.json();

            if (data.success) {
                document.getElementById('messagesContainer').innerHTML = '<div class="welcome-message">Chat cleared! PDF downloaded.</div>';
                this.messages.clear();
                this.showSuccessMessage('Chat cleared and PDF downloaded!');
            } else {
                alert(data.error || 'Failed to clear chat');
            }
        } catch (error) {
            alert('Connection error');
        }
    }

    downloadPDF(content) {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            doc.setFontSize(16);
            doc.text('Chat History Export', 20, 20);
            
            doc.setFontSize(10);
            const lines = content.split('\\n');
            let y = 40;
            
            lines.forEach(line => {
                if (y > 280) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(line, 20, y);
                y += 6;
            });
            
            doc.save(`chat-history-${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('PDF generation error:', error);
            alert('Failed to generate PDF');
        }
    }

    async changePin() {
        const currentPin = document.getElementById('currentPin').value;
        const newPin = document.getElementById('newPin').value;
        const confirmPin = document.getElementById('confirmPin').value;
        const errorDiv = document.getElementById('pinChangeError');

        if (newPin !== confirmPin) {
            this.showError(errorDiv, 'New PINs do not match');
            return;
        }

        if (newPin.length !== 6 || !/^\\d{6}$/.test(newPin)) {
            this.showError(errorDiv, 'PIN must be exactly 6 digits');
            return;
        }

        try {
            const response = await fetch('/change-pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.currentUser.username,
                    currentPin: currentPin,
                    newPin: newPin
                })
            });

            const data = await response.json();

            if (data.success) {
                this.hideChangePinModal();
                this.showSuccessMessage('PIN changed successfully!');
            } else {
                this.showError(errorDiv, data.error || 'Failed to change PIN');
            }
        } catch (error) {
            this.showError(errorDiv, 'Connection error');
        }
    }

    async loadContactProfile() {
        try {
            const response = await fetch(`/user-profile/${this.otherUser}`);
            const profile = await response.json();
            
            const contactProfilePic = document.getElementById('contactProfilePic');
            const contactInitial = document.getElementById('contactInitial');
            
            if (profile.profile_picture) {
                contactProfilePic.src = profile.profile_picture;
                contactProfilePic.classList.add('visible');
                contactInitial.classList.add('hidden');
            } else {
                contactInitial.textContent = this.otherUser.charAt(0).toUpperCase();
                contactInitial.classList.remove('hidden');
                contactProfilePic.classList.remove('visible');
            }
        } catch (error) {
            console.error('Failed to load contact profile:', error);
            const contactInitial = document.getElementById('contactInitial');
            contactInitial.textContent = this.otherUser.charAt(0).toUpperCase();
        }
    }

    async loadCurrentUserProfile() {
        try {
            const response = await fetch(`/user-profile/${this.currentUser.username}`);
            const profile = await response.json();
            
            const currentPfpPreview = document.getElementById('currentPfpPreview');
            const currentPfpInitial = document.getElementById('currentPfpInitial');
            
            if (profile.profile_picture) {
                currentPfpPreview.src = profile.profile_picture;
                currentPfpPreview.classList.add('visible');
                currentPfpInitial.classList.add('hidden');
            } else {
                currentPfpInitial.textContent = this.currentUser.username.charAt(0).toUpperCase();
                currentPfpInitial.classList.remove('hidden');
                currentPfpPreview.classList.remove('visible');
            }
        } catch (error) {
            console.error('Failed to load current user profile:', error);
        }
    }

    toggleMobileMenu() {
        const dropdown = document.getElementById('mobileMenuDropdown');
        dropdown.classList.toggle('hidden');
    }

    hideMobileMenu() {
        document.getElementById('mobileMenuDropdown').classList.add('hidden');
    }

    showUpdatePfpModal() {
        document.getElementById('updatePfpModal').classList.remove('hidden');
        this.loadCurrentUserProfile();
    }

    hideUpdatePfpModal() {
        document.getElementById('updatePfpModal').classList.add('hidden');
        document.getElementById('pfpInput').value = '';
        document.getElementById('uploadPfpBtn').disabled = true;
        document.getElementById('pfpUpdateError').textContent = '';
    }

    previewProfilePicture(file) {
        if (file.size > 5 * 1024 * 1024) {
            this.showError(document.getElementById('pfpUpdateError'), 'File size must be less than 5MB');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const currentPfpPreview = document.getElementById('currentPfpPreview');
            const currentPfpInitial = document.getElementById('currentPfpInitial');
            
            currentPfpPreview.src = e.target.result;
            currentPfpPreview.classList.add('visible');
            currentPfpInitial.classList.add('hidden');
            
            document.getElementById('uploadPfpBtn').disabled = false;
        };
        reader.readAsDataURL(file);
    }

    async updateProfilePicture() {
        const fileInput = document.getElementById('pfpInput');
        const errorDiv = document.getElementById('pfpUpdateError');
        const uploadBtn = document.getElementById('uploadPfpBtn');
        
        if (!fileInput.files[0]) {
            this.showError(errorDiv, 'Please select a file');
            return;
        }

        const formData = new FormData();
        formData.append('profilePicture', fileInput.files[0]);
        formData.append('username', this.currentUser.username);

        uploadBtn.textContent = 'Updating...';
        uploadBtn.disabled = true;

        try {
            const response = await fetch('/update-profile-picture', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                this.hideUpdatePfpModal();
                this.showSuccessMessage('Profile picture updated successfully!');
                this.loadContactProfile();
            } else {
                this.showError(errorDiv, data.error || 'Failed to update profile picture');
            }
        } catch (error) {
            this.showError(errorDiv, 'Connection error');
        } finally {
            uploadBtn.textContent = 'Update Picture';
            uploadBtn.disabled = false;
        }
    }

    startHeartbeat() {
        setInterval(() => {
            if (this.socket && this.currentUser) {
                this.socket.emit('heartbeat');
            }
        }, 30000);
    }

    startClock() {
        const updateTime = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const timeElement = document.getElementById('currentTime');
            if (timeElement) {
                timeElement.textContent = timeString;
            }
        };
        updateTime();
        setInterval(updateTime, 1000);
    }

    updateMessageStatus(messageId, status) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"] .read-status`);
        if (messageElement) {
            messageElement.className = `read-status ${status}`;
            if (status === 'sending') {
                messageElement.textContent = '⏱';
            } else if (status === 'sent') {
                messageElement.textContent = '✓';
            } else if (status === 'read') {
                messageElement.textContent = '✓✓';
            }
        }
    }

    markMessagesAsRead(messageIds) {
        if (this.socket && messageIds.length > 0) {
            this.socket.emit('mark_read', { messageIds });
            messageIds.forEach(id => {
                this.updateMessageStatus(id, 'read');
            });
        }
    }

    logout() {
        if (this.socket) {
            this.socket.disconnect();
        }
        
        localStorage.setItem('manualLogout', 'true');
        localStorage.removeItem('chatSession');
        
        document.getElementById('chatScreen').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        
        document.getElementById('loginForm').reset();
        document.getElementById('loginError').textContent = '';
        
        this.currentUser = null;
        this.otherUser = null;
        this.messages.clear();
        this.closeReply();
        this.hideChangePinModal();
        this.hideUpdatePfpModal();
        this.hideMobileMenu();
    }
}

function closeReply() {
    whatsAppChat.closeReply();
}

let whatsAppChat;
document.addEventListener('DOMContentLoaded', () => {
    whatsAppChat = new WhatsAppChat();
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
        
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        .welcome-message {
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.5s ease;
        }
        
        #chatScreen {
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        
        #loginScreen {
            transition: opacity 0.3s ease;
        }
    `;
    document.head.appendChild(style);
});