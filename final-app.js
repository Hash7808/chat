// Complete WhatsApp Clone App
let currentUser = null;
let currentChatId = null;
let currentOtherUser = null;
let users = JSON.parse(localStorage.getItem('users') || '{}');
let chats = JSON.parse(localStorage.getItem('chats') || '{}');
let statuses = JSON.parse(localStorage.getItem('statuses') || '{}');
let callHistory = JSON.parse(localStorage.getItem('callHistory') || '[]');
let callTimeout = null;
let videoCallTimeout = null;
let replyingTo = null;
let onlineUsers = JSON.parse(localStorage.getItem('onlineUsers') || '{}');
let statusPhotoData = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

function checkAuth() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showMainScreen();
    } else {
        showLogin();
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
}

window.showLogin = () => showScreen('loginScreen');
window.showRegister = () => showScreen('registerScreen');

// Register
window.register = () => {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    
    if (!name || !email || !password) {
        alert('Please fill all fields');
        return;
    }
    
    if (users[email]) {
        alert('User already exists!');
        return;
    }
    
    users[email] = {
        name,
        email,
        password,
        id: Date.now().toString()
    };
    
    localStorage.setItem('users', JSON.stringify(users));
    alert('Registration successful! Please login.');
    showLogin();
};

// Login
window.login = () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!users[email]) {
        alert('User not found!');
        return;
    }
    
    if (users[email].password !== password) {
        alert('Wrong password!');
        return;
    }
    
    currentUser = users[email];
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    updateOnlineStatus();
    showMainScreen();
};

// Logout
window.logout = () => {
    if (currentUser && onlineUsers[currentUser.id]) {
        onlineUsers[currentUser.id].isOnline = false;
        onlineUsers[currentUser.id].lastSeen = Date.now();
        localStorage.setItem('onlineUsers', JSON.stringify(onlineUsers));
    }
    
    localStorage.removeItem('currentUser');
    currentUser = null;
    showLogin();
};

// Main Screen
function showMainScreen() {
    showScreen('mainScreen');
    switchTab('chats');
    updateOnlineStatus();
    setInterval(updateOnlineStatus, 5000);
}

window.backToMain = () => {
    if (window.statusInterval) {
        clearInterval(window.statusInterval);
        window.statusInterval = null;
    }
    showMainScreen();
};

// Tab Switching
window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    document.querySelector(`.tab-item:nth-child(${tabName === 'status' ? 1 : tabName === 'calls' ? 2 : 3})`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
    
    if (tabName === 'status') loadStatuses();
    if (tabName === 'calls') loadCallHistory();
    if (tabName === 'chats') searchUsers();
};

// Status Features
window.showAddStatus = () => {
    showScreen('addStatusScreen');
    document.getElementById('statusText').value = '';
    document.getElementById('statusPhotoPreview').innerHTML = '';
    document.getElementById('statusPhotoPreview').classList.add('hidden');
    statusPhotoData = null;
};

window.previewStatusPhoto = () => {
    const fileInput = document.getElementById('statusPhotoInput');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        statusPhotoData = e.target.result;
        const preview = document.getElementById('statusPhotoPreview');
        preview.innerHTML = `<img src="${statusPhotoData}" style="max-width: 100%; max-height: 300px; border-radius: 10px;" />`;
        preview.classList.remove('hidden');
    };
    
    reader.readAsDataURL(file);
};

window.postStatus = () => {
    const text = document.getElementById('statusText').value.trim();
    
    if (!text && !statusPhotoData) {
        alert('Please add text or photo');
        return;
    }
    
    if (!statuses[currentUser.id]) {
        statuses[currentUser.id] = [];
    }
    
    statuses[currentUser.id].push({
        id: Date.now().toString(),
        text,
        image: statusPhotoData,
        timestamp: Date.now(),
        userName: currentUser.name,
        userPhoto: currentUser.photo
    });
    
    localStorage.setItem('statuses', JSON.stringify(statuses));
    alert('Status posted!');
    backToMain();
};

function loadStatuses() {
    const statusList = document.getElementById('statusList');
    statusList.innerHTML = '';
    
    // Show my status photo
    if (currentUser.photo) {
        document.getElementById('myStatusPhoto').src = currentUser.photo;
        document.getElementById('myStatusPhoto').style.display = 'block';
        document.getElementById('myStatusIcon').style.display = 'none';
    }
    
    // Show other users' statuses
    Object.keys(statuses).forEach(userId => {
        if (userId !== currentUser.id && statuses[userId].length > 0) {
            const user = Object.values(users).find(u => u.id === userId);
            if (!user) return;
            
            const latestStatus = statuses[userId][statuses[userId].length - 1];
            const timeAgo = getTimeAgo(latestStatus.timestamp);
            
            const statusDiv = document.createElement('div');
            statusDiv.className = 'status-item';
            statusDiv.onclick = () => viewStatus(userId);
            
            const photoHtml = user.photo 
                ? `<div class="status-ring"><img src="${user.photo}" class="status-avatar" style="width: 54px; height: 54px; border-radius: 50%; object-fit: cover;" /></div>` 
                : `<div class="status-ring"><div class="status-avatar" style="width: 54px; height: 54px;">👤</div></div>`;
            
            statusDiv.innerHTML = `
                ${photoHtml}
                <div class="status-info">
                    <div class="status-name">${user.name}</div>
                    <div class="status-time">${timeAgo}</div>
                </div>
            `;
            statusList.appendChild(statusDiv);
        }
    });
    
    if (statusList.children.length === 0) {
        statusList.innerHTML = '<p style="padding: 20px; text-align: center; color: #666;">No status updates</p>';
    }
}

window.viewStatus = (userId) => {
    const userStatuses = statuses[userId];
    if (!userStatuses || userStatuses.length === 0) return;
    
    const latestStatus = userStatuses[userStatuses.length - 1];
    const user = Object.values(users).find(u => u.id === userId);
    
    showScreen('viewStatusScreen');
    document.getElementById('statusUserName').textContent = user.name;
    document.getElementById('statusTime').textContent = getTimeAgo(latestStatus.timestamp);
    
    if (latestStatus.image) {
        document.getElementById('statusImage').src = latestStatus.image;
        document.getElementById('statusImage').style.display = 'block';
        document.getElementById('statusTextContent').style.display = 'none';
    } else {
        document.getElementById('statusImage').style.display = 'none';
        document.getElementById('statusTextContent').textContent = latestStatus.text;
        document.getElementById('statusTextContent').style.display = 'block';
    }
};

// Call History
function loadCallHistory() {
    const callsList = document.getElementById('callsList');
    callsList.innerHTML = '';
    
    if (callHistory.length === 0) {
        callsList.innerHTML = '<p style="padding: 20px; text-align: center; color: #666;">No recent calls</p>';
        return;
    }
    
    callHistory.slice().reverse().forEach(call => {
        const callDiv = document.createElement('div');
        callDiv.className = 'call-item';
        
        const user = Object.values(users).find(u => u.id === call.userId);
        if (!user) return;
        
        const photoHtml = user.photo 
            ? `<img src="${user.photo}" class="call-avatar" />` 
            : `<div class="call-avatar">👤</div>`;
        
        const callIcon = call.type === 'video' ? '📹' : '📞';
        const callType = call.type === 'video' ? 'Video call' : 'Voice call';
        
        callDiv.innerHTML = `
            ${photoHtml}
            <div class="call-info">
                <div class="call-name">${user.name}</div>
                <div class="call-time">${callType} • ${getTimeAgo(call.timestamp)}</div>
            </div>
            <span class="call-icon">${callIcon}</span>
        `;
        callsList.appendChild(callDiv);
    });
}

// Settings
window.showSettings = () => {
    showScreen('settingsScreen');
};

// Profile
window.showProfile = () => {
    showScreen('profileScreen');
    document.getElementById('profileName').textContent = currentUser.name;
    document.getElementById('profileEmail').textContent = currentUser.email;
    
    if (currentUser.photo) {
        document.getElementById('profileImage').src = currentUser.photo;
        document.getElementById('profileImage').style.display = 'block';
        document.getElementById('profileIcon').style.display = 'none';
    } else {
        document.getElementById('profileImage').style.display = 'none';
        document.getElementById('profileIcon').style.display = 'block';
    }
};

window.uploadPhoto = () => {
    const fileInput = document.getElementById('photoInput');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const photoData = e.target.result;
        
        currentUser.photo = photoData;
        users[currentUser.email].photo = photoData;
        
        localStorage.setItem('users', JSON.stringify(users));
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        document.getElementById('profileImage').src = photoData;
        document.getElementById('profileImage').style.display = 'block';
        document.getElementById('profileIcon').style.display = 'none';
        
        alert('Photo updated successfully!');
    };
    
    reader.readAsDataURL(file);
};

// Search Users
window.searchUsers = () => {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const chatListDiv = document.getElementById('chatList');
    chatListDiv.innerHTML = '';
    
    let foundUsers = 0;
    
    Object.values(users).forEach(user => {
        if (user.email !== currentUser.email) {
            const userName = user.name.toLowerCase();
            const userEmail = user.email.toLowerCase();
            
            if (searchTerm === '' || userName.includes(searchTerm) || userEmail.includes(searchTerm)) {
                foundUsers++;
                
                const chatDiv = document.createElement('div');
                chatDiv.className = 'chat-item';
                chatDiv.onclick = () => openChat(user);
                
                const chatKey = getChatKey(currentUser.id, user.id);
                const lastMsg = chats[chatKey] && chats[chatKey].length > 0 
                    ? chats[chatKey][chats[chatKey].length - 1].text || '📷 Photo'
                    : 'Start chatting...';
                
                const photoHtml = user.photo 
                    ? `<img src="${user.photo}" class="chat-avatar" />` 
                    : `<div class="chat-avatar">👤</div>`;
                
                const onlineStatus = getOnlineStatus(user.id);
                const statusColor = onlineStatus === 'Online' ? 'color: #25D366;' : 'color: #999;';
                
                chatDiv.innerHTML = `
                    ${photoHtml}
                    <div class="chat-info">
                        <div class="chat-name">${user.name}</div>
                        <div class="last-message">${lastMsg}</div>
                        <div class="last-message" style="${statusColor} font-size: 12px; margin-top: 2px;">${onlineStatus}</div>
                    </div>
                `;
                chatListDiv.appendChild(chatDiv);
            }
        }
    });
    
    if (foundUsers === 0) {
        chatListDiv.innerHTML = '<p style="padding: 20px; text-align: center; color: #666;">No users found</p>';
    }
};

function getChatKey(userId1, userId2) {
    return [userId1, userId2].sort().join('_');
}

// Open Chat
window.openChat = (otherUser) => {
    currentOtherUser = otherUser;
    currentChatId = getChatKey(currentUser.id, otherUser.id);
    showScreen('chatScreen');
    document.getElementById('chatUserName').textContent = otherUser.name;
    
    updateChatHeaderStatus();
    if (window.statusInterval) clearInterval(window.statusInterval);
    window.statusInterval = setInterval(updateChatHeaderStatus, 3000);
    
    if (otherUser.photo) {
        document.getElementById('chatHeaderPhoto').src = otherUser.photo;
        document.getElementById('chatHeaderPhoto').style.display = 'block';
        document.getElementById('chatHeaderIcon').style.display = 'none';
    } else {
        document.getElementById('chatHeaderPhoto').style.display = 'none';
        document.getElementById('chatHeaderIcon').style.display = 'flex';
    }
    
    if (!chats[currentChatId]) {
        chats[currentChatId] = [];
    }
    
    displayMessages();
};

function updateChatHeaderStatus() {
    if (currentOtherUser) {
        const status = getOnlineStatus(currentOtherUser.id);
        const statusElement = document.getElementById('chatUserStatus');
        statusElement.textContent = status;
        statusElement.style.color = status === 'Online' ? '#25D366' : 'rgba(255,255,255,0.8)';
    }
}

// Display Messages
function displayMessages() {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = '';
    
    const messages = chats[currentChatId] || [];
    
    messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        const isMine = msg.senderId === currentUser.id;
        messageDiv.className = `message ${isMine ? 'my-message' : 'other-message'}`;
        
        let replyHtml = '';
        if (msg.replyTo) {
            replyHtml = `<div class="reply-preview-msg">${msg.replyTo.text}</div>`;
        }
        
        let contentHtml = '';
        if (msg.image) {
            contentHtml = `<img src="${msg.image}" class="message-image" onclick="openImageModal('${msg.image}')" />`;
        }
        if (msg.text && !msg.deleted) {
            contentHtml += `<div class="message-text">${msg.text}</div>`;
        }
        if (msg.deleted) {
            contentHtml = `<div class="message-text"><i>This message was deleted</i></div>`;
        }
        
        const deleteBtn = isMine && !msg.deleted ? `<button class="msg-delete-btn" onclick="deleteMessage('${msg.id}')">🗑️</button>` : '';
        const replyBtn = !msg.deleted ? `<button class="msg-reply-btn" onclick="replyToMessage('${msg.id}', '${(msg.text || 'Photo').replace(/'/g, "\\'")}')">↩️</button>` : '';
        
        const readReceipt = isMine ? (msg.read ? '✓✓' : '✓') : '';
        
        messageDiv.innerHTML = `
            ${replyHtml}
            ${contentHtml}
            <div class="message-footer">
                <span class="message-time">${msg.time} ${readReceipt}</span>
                <div class="message-actions">
                    ${replyBtn}
                    ${deleteBtn}
                </div>
            </div>
        `;
        messagesDiv.appendChild(messageDiv);
    });
    
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Send Message
window.sendMessage = () => {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const message = {
        id: Date.now().toString(),
        text,
        image: null,
        senderId: currentUser.id,
        senderName: currentUser.name,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text } : null,
        deleted: false,
        read: false
    };
    
    if (!chats[currentChatId]) {
        chats[currentChatId] = [];
    }
    
    chats[currentChatId].push(message);
    localStorage.setItem('chats', JSON.stringify(chats));
    
    input.value = '';
    cancelReply();
    displayMessages();
};

// Attach Photo
window.attachPhoto = () => {
    const fileInput = document.getElementById('photoAttach');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const imageData = e.target.result;
        
        const message = {
            id: Date.now().toString(),
            text: '',
            image: imageData,
            senderId: currentUser.id,
            senderName: currentUser.name,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(),
            replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text } : null,
            deleted: false,
            read: false
        };
        
        if (!chats[currentChatId]) {
            chats[currentChatId] = [];
        }
        
        chats[currentChatId].push(message);
        localStorage.setItem('chats', JSON.stringify(chats));
        
        fileInput.value = '';
        cancelReply();
        displayMessages();
    };
    
    reader.readAsDataURL(file);
};

// Reply to Message
window.replyToMessage = (messageId, messageText) => {
    replyingTo = { id: messageId, text: messageText };
    document.getElementById('replyPreview').classList.remove('hidden');
    document.getElementById('replyText').textContent = messageText;
    document.getElementById('messageInput').focus();
};

window.cancelReply = () => {
    replyingTo = null;
    document.getElementById('replyPreview').classList.add('hidden');
};

// Delete Message
window.deleteMessage = (messageId) => {
    if (!confirm('Delete this message?')) return;
    
    const messages = chats[currentChatId];
    const index = messages.findIndex(m => m.id === messageId);
    
    if (index !== -1) {
        messages[index].deleted = true;
        messages[index].text = 'This message was deleted';
        chats[currentChatId] = messages;
        localStorage.setItem('chats', JSON.stringify(chats));
        displayMessages();
    }
};

// Emoji Picker
const emojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
    '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
    '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
    '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👏', '🙌',
    '💪', '🦾', '🙏', '✍️', '🔥', '💥', '💯', '✅', '❌', '⚠️'
];

window.toggleEmojiPicker = () => {
    const picker = document.getElementById('emojiPicker');
    const grid = document.getElementById('emojiGrid');
    
    if (picker.classList.contains('hidden')) {
        if (grid.children.length === 0) {
            emojis.forEach(emoji => {
                const emojiBtn = document.createElement('button');
                emojiBtn.className = 'emoji-item';
                emojiBtn.textContent = emoji;
                emojiBtn.onclick = () => insertEmoji(emoji);
                grid.appendChild(emojiBtn);
            });
        }
        picker.classList.remove('hidden');
    } else {
        picker.classList.add('hidden');
    }
};

window.insertEmoji = (emoji) => {
    const input = document.getElementById('messageInput');
    input.value += emoji;
    input.focus();
};

document.addEventListener('click', (e) => {
    const picker = document.getElementById('emojiPicker');
    const emojiBtn = document.querySelector('.emoji-btn');
    
    if (picker && !picker.contains(e.target) && e.target !== emojiBtn) {
        picker.classList.add('hidden');
    }
});

// Typing Indicator
let typingTimeout;
let isTyping = false;

window.handleTyping = () => {
    if (!isTyping) {
        isTyping = true;
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
    }, 1000);
};

// Online Status
function updateOnlineStatus() {
    if (currentUser) {
        onlineUsers[currentUser.id] = {
            lastSeen: Date.now(),
            isOnline: true
        };
        localStorage.setItem('onlineUsers', JSON.stringify(onlineUsers));
    }
}

function getOnlineStatus(userId) {
    const userStatus = onlineUsers[userId];
    if (!userStatus) return 'Offline';
    
    const timeDiff = Date.now() - userStatus.lastSeen;
    if (timeDiff < 10000) return 'Online';
    
    const minutes = Math.floor(timeDiff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `Last seen ${days}d ago`;
    if (hours > 0) return `Last seen ${hours}h ago`;
    if (minutes > 0) return `Last seen ${minutes}m ago`;
    return 'Last seen recently';
}

// Other User Profile
window.showOtherUserProfile = () => {
    if (!currentOtherUser) return;
    
    showScreen('otherUserProfileScreen');
    document.getElementById('otherProfileName').textContent = currentOtherUser.name;
    document.getElementById('otherProfileEmail').textContent = currentOtherUser.email;
    
    const status = getOnlineStatus(currentOtherUser.id);
    document.getElementById('otherProfileStatus').textContent = status;
    document.getElementById('otherProfileStatus').style.color = status === 'Online' ? '#25D366' : '#999';
    
    if (currentOtherUser.photo) {
        document.getElementById('otherProfileImage').src = currentOtherUser.photo;
        document.getElementById('otherProfileImage').style.display = 'block';
        document.getElementById('otherProfileIcon').style.display = 'none';
    } else {
        document.getElementById('otherProfileImage').style.display = 'none';
        document.getElementById('otherProfileIcon').style.display = 'block';
    }
};

window.backToChatFromProfile = () => {
    showScreen('chatScreen');
};

// Audio Call
window.startAudioCall = () => {
    if (!currentOtherUser) return;
    
    callHistory.push({
        userId: currentOtherUser.id,
        type: 'audio',
        timestamp: Date.now()
    });
    localStorage.setItem('callHistory', JSON.stringify(callHistory));
    
    showScreen('audioCallScreen');
    document.getElementById('callingUserName').textContent = currentOtherUser.name;
    document.getElementById('callStatus').textContent = 'Calling...';
    
    if (currentOtherUser.photo) {
        document.getElementById('callUserPhoto').src = currentOtherUser.photo;
        document.getElementById('callUserPhoto').style.display = 'block';
        document.getElementById('callUserIcon').style.display = 'none';
    } else {
        document.getElementById('callUserPhoto').style.display = 'none';
        document.getElementById('callUserIcon').style.display = 'block';
    }
    
    callTimeout = setTimeout(() => {
        document.getElementById('callStatus').textContent = 'Connected';
    }, 2000);
};

window.endCall = () => {
    if (callTimeout) {
        clearTimeout(callTimeout);
        callTimeout = null;
    }
    showScreen('chatScreen');
};

// Video Call
window.startVideoCall = () => {
    if (!currentOtherUser) return;
    
    callHistory.push({
        userId: currentOtherUser.id,
        type: 'video',
        timestamp: Date.now()
    });
    localStorage.setItem('callHistory', JSON.stringify(callHistory));
    
    showScreen('videoCallScreen');
    document.getElementById('videoCallingUserName').textContent = currentOtherUser.name;
    document.getElementById('videoCallStatus').textContent = 'Calling...';
    
    if (currentOtherUser.photo) {
        document.getElementById('videoCallUserPhoto').src = currentOtherUser.photo;
        document.getElementById('videoCallUserPhoto').style.display = 'block';
        document.getElementById('videoCallUserIcon').style.display = 'none';
    } else {
        document.getElementById('videoCallUserPhoto').style.display = 'none';
        document.getElementById('videoCallUserIcon').style.display = 'block';
    }
    
    videoCallTimeout = setTimeout(() => {
        document.getElementById('videoCallStatus').textContent = 'Connected';
    }, 2000);
};

window.endVideoCall = () => {
    if (videoCallTimeout) {
        clearTimeout(videoCallTimeout);
        videoCallTimeout = null;
    }
    showScreen('chatScreen');
};

// Image Modal
window.openImageModal = (imageSrc) => {
    document.getElementById('modalImage').src = imageSrc;
    document.getElementById('imageModal').classList.remove('hidden');
};

window.closeImageModal = () => {
    document.getElementById('imageModal').classList.add('hidden');
};

// Helper Functions
function getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
}
