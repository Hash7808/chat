// HeyApp - Complete Firebase Real-time Chat
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getDatabase, ref, set, get, onValue, push, update, remove } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const firebaseConfig = {
    apiKey: "AIzaSyB7j7S0l-QVw7Cj-WPz69XRFVbH9omdt2c",
    authDomain: "heyapp-36a08.firebaseapp.com",
    databaseURL: "https://heyapp-36a08-default-rtdb.firebaseio.com",
    projectId: "heyapp-36a08",
    storageBucket: "heyapp-36a08.firebasestorage.app",
    messagingSenderId: "477810488469",
    appId: "1:477810488469:web:7777f59533ffc0f34bd79c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// State
let currentUser = null;
let currentChatId = null;
let currentOtherUser = null;
let replyingTo = null;
let callTimeout = null;
let videoCallTimeout = null;
let statusPhotoData = null;
let messagesListener = null;
let darkMode = localStorage.getItem('darkMode') === 'true';
let soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let selectedReactionMsgId = null;
let forwardMsgText = null;
let selectedGroupMembers = [];
let blockedUsers = JSON.parse(localStorage.getItem('blockedUsers') || '[]');

// Apply dark mode on load
if (darkMode) {
    document.body.classList.add('dark');
}

// Auth State
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const snap = await get(ref(db, `users/${user.uid}`));
        currentUser = snap.val();
        currentUser.uid = user.uid;
        updateOnlineStatus(true);
        showMainScreen();
    } else {
        currentUser = null;
        showScreen('loginScreen');
    }
});

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.getElementById('chatMenu')?.classList.add('hidden');
}

window.showLogin = () => showScreen('loginScreen');
window.showRegister = () => showScreen('registerScreen');

// Register
window.register = async () => {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    if (!name || !email || !password) return alert('Please fill all fields');
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        await set(ref(db, `users/${cred.user.uid}`), {
            uid: cred.user.uid, name, email, photo: '', bio: '', createdAt: Date.now()
        });
    } catch (e) { alert(e.message); }
};

// Login
window.login = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (e) { alert('Wrong email or password!'); }
};

// Logout
window.logout = async () => {
    updateOnlineStatus(false);
    await signOut(auth);
};

// Online Status
function updateOnlineStatus(isOnline) {
    if (!currentUser) return;
    update(ref(db, `users/${currentUser.uid}`), { online: isOnline, lastSeen: Date.now() });
}

setInterval(() => { if (currentUser) updateOnlineStatus(true); }, 30000);
window.addEventListener('beforeunload', () => updateOnlineStatus(false));

// Main Screen
function showMainScreen() {
    showScreen('mainScreen');
    switchTab('chats');
    updateDarkModeUI();
}

window.backToMain = () => {
    if (messagesListener) { messagesListener(); messagesListener = null; }
    if (window.statusInterval) { clearInterval(window.statusInterval); window.statusInterval = null; }
    showMainScreen();
};

// Dark Mode
window.toggleDarkMode = () => {
    darkMode = !darkMode;
    localStorage.setItem('darkMode', darkMode);
    document.body.classList.toggle('dark', darkMode);
    updateDarkModeUI();
};

function updateDarkModeUI() {
    const btn = document.getElementById('darkModeBtn');
    const status = document.getElementById('darkModeStatus');
    if (btn) btn.textContent = darkMode ? '☀️' : '🌙';
    if (status) status.textContent = darkMode ? 'On' : 'Off';
}

// Notification Sound
window.toggleNotificationSound = () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('soundEnabled', soundEnabled);
    document.getElementById('soundStatus').textContent = soundEnabled ? 'On' : 'Off';
};

function playNotificationSound() {
    if (!soundEnabled) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = 880;
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
}

// Tabs
window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab-item:nth-child(${tabName === 'status' ? 1 : tabName === 'calls' ? 2 : 3})`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
    if (tabName === 'chats') loadUsers();
    if (tabName === 'status') loadStatuses();
    if (tabName === 'calls') loadCallHistory();
};

// Load Users
function loadUsers(searchTerm = '') {
    const chatListDiv = document.getElementById('chatList');
    chatListDiv.innerHTML = '<p style="padding:20px;text-align:center;color:#999;">Loading...</p>';

    onValue(ref(db, 'users'), (snapshot) => {
        chatListDiv.innerHTML = '';
        let found = 0;
        snapshot.forEach((child) => {
            const user = child.val();
            if (user.uid === currentUser.uid) return;
            if (blockedUsers.includes(user.uid)) return;
            const name = (user.name || '').toLowerCase();
            const email = (user.email || '').toLowerCase();
            if (searchTerm && !name.includes(searchTerm) && !email.includes(searchTerm)) return;
            found++;

            const div = document.createElement('div');
            div.className = 'chat-item';
            div.onclick = () => openChat(user);

            const photoHtml = user.photo
                ? `<img src="${user.photo}" class="chat-avatar" />`
                : `<div class="chat-avatar">👤</div>`;

            const statusColor = user.online ? 'color:#25D366' : 'color:#999';
            const statusText = user.online ? 'Online' : getLastSeen(user.lastSeen);

            div.innerHTML = `
                ${photoHtml}
                <div class="chat-info">
                    <div class="chat-name">${user.name}</div>
                    <div class="last-message" style="${statusColor};font-size:12px;">${statusText}</div>
                </div>
            `;
            chatListDiv.appendChild(div);
        });
        if (found === 0) chatListDiv.innerHTML = '<p style="padding:20px;text-align:center;color:#999;">No users found</p>';
    }, { onlyOnce: true });
}

window.searchUsers = () => {
    loadUsers(document.getElementById('searchInput').value.toLowerCase().trim());
};

function getChatKey(uid1, uid2) {
    return [uid1, uid2].sort().join('_');
}

// Open Chat
window.openChat = (otherUser) => {
    currentOtherUser = otherUser;
    currentChatId = getChatKey(currentUser.uid, otherUser.uid);
    showScreen('chatScreen');
    document.getElementById('chatUserName').textContent = otherUser.name;

    if (otherUser.photo) {
        document.getElementById('chatHeaderPhoto').src = otherUser.photo;
        document.getElementById('chatHeaderPhoto').style.display = 'block';
        document.getElementById('chatHeaderIcon').style.display = 'none';
    } else {
        document.getElementById('chatHeaderPhoto').style.display = 'none';
        document.getElementById('chatHeaderIcon').style.display = 'flex';
    }

    updateChatStatus();
    if (window.statusInterval) clearInterval(window.statusInterval);
    window.statusInterval = setInterval(updateChatStatus, 5000);
    listenMessages();
};

function updateChatStatus() {
    if (!currentOtherUser) return;
    get(ref(db, `users/${currentOtherUser.uid}`)).then(snap => {
        const u = snap.val();
        const el = document.getElementById('chatUserStatus');
        if (u?.online) { el.textContent = 'Online'; el.style.color = '#25D366'; }
        else { el.textContent = getLastSeen(u?.lastSeen); el.style.color = 'rgba(255,255,255,0.8)'; }
    });
}

// Chat Menu
window.showChatMenu = () => {
    document.getElementById('chatMenu').classList.toggle('hidden');
};

document.addEventListener('click', (e) => {
    const menu = document.getElementById('chatMenu');
    if (menu && !menu.contains(e.target) && !e.target.closest('.call-btn')) {
        menu.classList.add('hidden');
    }
});

// Delete Chat
window.deleteChat = async () => {
    if (!confirm('Delete this entire chat?')) return;
    await remove(ref(db, `chats/${currentChatId}`));
    document.getElementById('chatMenu').classList.add('hidden');
    backToMain();
};

// Block User
window.blockUser = () => {
    if (!currentOtherUser) return;
    if (confirm(`Block ${currentOtherUser.name}?`)) {
        blockedUsers.push(currentOtherUser.uid);
        localStorage.setItem('blockedUsers', JSON.stringify(blockedUsers));
        alert(`${currentOtherUser.name} has been blocked`);
        backToMain();
    }
};

// Message Search
window.searchMessages = () => {
    const bar = document.getElementById('messageSearchBar');
    bar.classList.toggle('hidden');
    document.getElementById('chatMenu').classList.add('hidden');
    if (!bar.classList.contains('hidden')) {
        document.getElementById('messageSearchInput').focus();
    }
};

window.filterMessages = () => {
    const term = document.getElementById('messageSearchInput').value.toLowerCase();
    document.querySelectorAll('.message').forEach(msg => {
        const text = msg.querySelector('.message-text')?.textContent.toLowerCase() || '';
        msg.style.display = text.includes(term) ? '' : 'none';
    });
};

// Listen Messages (Real-time)
function listenMessages() {
    if (messagesListener) messagesListener();
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = '';
    let isFirst = true;

    messagesListener = onValue(ref(db, `chats/${currentChatId}/messages`), (snapshot) => {
        const prevCount = messagesDiv.children.length;
        messagesDiv.innerHTML = '';
        let count = 0;
        snapshot.forEach((child) => {
            const msg = child.val();
            msg.id = child.key;
            renderMessage(msg);
            count++;
        });
        if (!isFirst && count > prevCount) playNotificationSound();
        isFirst = false;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

function renderMessage(msg) {
    const messagesDiv = document.getElementById('messages');
    const isMine = msg.senderId === currentUser.uid;
    const div = document.createElement('div');
    div.className = `message ${isMine ? 'my-message' : 'other-message'}`;
    div.dataset.msgId = msg.id;

    let replyHtml = msg.replyTo ? `<div class="reply-preview-msg">↩️ ${msg.replyTo.text}</div>` : '';
    let contentHtml = '';

    if (msg.image) contentHtml += `<img src="${msg.image}" class="message-image" onclick="openImageModal('${msg.image}')" />`;
    if (msg.audio) contentHtml += `
        <div class="voice-message">
            <button class="voice-play-btn" onclick="playAudio('${msg.audio}')">▶</button>
            <div class="voice-waveform"></div>
            <span class="voice-duration">${msg.audioDuration || '0:00'}</span>
        </div>`;
    if (msg.deleted) contentHtml += `<div class="message-text"><i>🚫 This message was deleted</i></div>`;
    else if (msg.text) contentHtml += `<div class="message-text">${msg.text}</div>`;

    // Reactions
    let reactionsHtml = '';
    if (msg.reactions) {
        const reactionCounts = {};
        Object.values(msg.reactions).forEach(r => { reactionCounts[r] = (reactionCounts[r] || 0) + 1; });
        reactionsHtml = `<div class="message-reactions">${Object.entries(reactionCounts).map(([r, c]) => `<span class="reaction-badge">${r} ${c}</span>`).join('')}</div>`;
    }

    const deleteBtn = isMine && !msg.deleted ? `<button class="msg-delete-btn" onclick="deleteMessage('${msg.id}')">🗑️</button>` : '';
    const replyBtn = !msg.deleted ? `<button class="msg-reply-btn" onclick="replyToMessage('${msg.id}', '${(msg.text || 'Photo').replace(/'/g, "\\'")}')">↩️</button>` : '';
    const forwardBtn = !msg.deleted ? `<button class="msg-reply-btn" onclick="forwardMessage('${msg.id}', '${(msg.text || '').replace(/'/g, "\\'")}')">↪️</button>` : '';
    const reactBtn = !msg.deleted ? `<button class="msg-reply-btn" onclick="showReactionPicker('${msg.id}', event)">😊</button>` : '';
    const readReceipt = isMine ? (msg.read ? ' ✓✓' : ' ✓') : '';

    div.innerHTML = `
        ${replyHtml}
        ${contentHtml}
        ${reactionsHtml}
        <div class="message-footer">
            <span class="message-time">${msg.time || ''}${readReceipt}</span>
            <div class="message-actions">${reactBtn}${replyBtn}${forwardBtn}${deleteBtn}</div>
        </div>
    `;
    messagesDiv.appendChild(div);
}

// Send Message
window.sendMessage = async () => {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text) return;

    const msgRef = push(ref(db, `chats/${currentChatId}/messages`));
    await set(msgRef, {
        text, image: null, senderId: currentUser.uid, senderName: currentUser.name,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(), replyTo: replyingTo || null, deleted: false, read: false
    });
    input.value = '';
    cancelReply();
};

// Attach Photo
window.attachPhoto = () => {
    const file = document.getElementById('photoAttach').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const msgRef = push(ref(db, `chats/${currentChatId}/messages`));
        await set(msgRef, {
            text: '', image: e.target.result, senderId: currentUser.uid, senderName: currentUser.name,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(), replyTo: replyingTo || null, deleted: false, read: false
        });
        document.getElementById('photoAttach').value = '';
        cancelReply();
    };
    reader.readAsDataURL(file);
};

// Delete Message
window.deleteMessage = async (msgId) => {
    if (!confirm('Delete this message?')) return;
    await update(ref(db, `chats/${currentChatId}/messages/${msgId}`), { deleted: true, text: 'This message was deleted' });
};

// Reply
window.replyToMessage = (id, text) => {
    replyingTo = { id, text };
    document.getElementById('replyPreview').classList.remove('hidden');
    document.getElementById('replyText').textContent = text;
    document.getElementById('messageInput').focus();
};

window.cancelReply = () => {
    replyingTo = null;
    document.getElementById('replyPreview').classList.add('hidden');
};

// Forward Message
window.forwardMessage = (msgId, text) => {
    forwardMsgText = text;
    const modal = document.getElementById('forwardModal');
    const list = document.getElementById('forwardUserList');
    list.innerHTML = '';
    modal.classList.remove('hidden');

    get(ref(db, 'users')).then(snapshot => {
        snapshot.forEach(child => {
            const user = child.val();
            if (user.uid === currentUser.uid) return;
            const div = document.createElement('div');
            div.className = 'forward-user-item';
            div.onclick = () => sendForwardedMessage(user);
            div.innerHTML = `
                <div class="chat-avatar" style="width:40px;height:40px;font-size:20px;">${user.photo ? `<img src="${user.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` : '👤'}</div>
                <span>${user.name}</span>
            `;
            list.appendChild(div);
        });
    });
};

async function sendForwardedMessage(toUser) {
    const chatId = getChatKey(currentUser.uid, toUser.uid);
    const msgRef = push(ref(db, `chats/${chatId}/messages`));
    await set(msgRef, {
        text: `↪️ Forwarded: ${forwardMsgText}`, image: null,
        senderId: currentUser.uid, senderName: currentUser.name,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(), deleted: false, read: false
    });
    closeForwardModal();
    alert(`Message forwarded to ${toUser.name}!`);
}

window.closeForwardModal = () => {
    document.getElementById('forwardModal').classList.add('hidden');
};

// Reactions
window.showReactionPicker = (msgId, event) => {
    selectedReactionMsgId = msgId;
    const picker = document.getElementById('reactionPicker');
    picker.classList.remove('hidden');
    picker.style.position = 'fixed';
    picker.style.top = (event.clientY - 60) + 'px';
    picker.style.left = (event.clientX - 100) + 'px';
};

window.sendReaction = async (emoji) => {
    if (!selectedReactionMsgId) return;
    await update(ref(db, `chats/${currentChatId}/messages/${selectedReactionMsgId}/reactions`), {
        [currentUser.uid]: emoji
    });
    document.getElementById('reactionPicker').classList.add('hidden');
    selectedReactionMsgId = null;
};

document.addEventListener('click', (e) => {
    const picker = document.getElementById('reactionPicker');
    if (picker && !picker.contains(e.target) && !e.target.closest('.msg-reply-btn')) {
        picker.classList.add('hidden');
    }
});

// Voice Message
window.toggleVoiceRecord = async () => {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const blob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const msgRef = push(ref(db, `chats/${currentChatId}/messages`));
                    await set(msgRef, {
                        text: '', audio: e.target.result, audioDuration: '0:' + Math.floor(audioChunks.length / 10).toString().padStart(2, '0'),
                        senderId: currentUser.uid, senderName: currentUser.name,
                        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                        timestamp: Date.now(), deleted: false, read: false
                    });
                };
                reader.readAsDataURL(blob);
                stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorder.start();
            isRecording = true;
            document.querySelector('.attach-btn[onclick*="Voice"]') && (document.querySelector('.attach-btn[onclick*="Voice"]').textContent = '⏹️');
            alert('Recording... Click 🎤 again to stop');
        } catch (e) { alert('Microphone access denied!'); }
    } else {
        mediaRecorder.stop();
        isRecording = false;
    }
};

window.playAudio = (audioData) => {
    const audio = new Audio(audioData);
    audio.play();
};

// Enter key
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && document.getElementById('messageInput') === document.activeElement) sendMessage();
});

window.handleTyping = () => {};

// ==================== CALLS ====================
window.startAudioCall = () => {
    if (!currentOtherUser) return;
    showScreen('audioCallScreen');
    document.getElementById('callingUserName').textContent = currentOtherUser.name;
    document.getElementById('callStatus').textContent = 'Calling...';
    if (currentOtherUser.photo) {
        document.getElementById('callUserPhoto').src = currentOtherUser.photo;
        document.getElementById('callUserPhoto').style.display = 'block';
        document.getElementById('callUserIcon').style.display = 'none';
    }
    // Log call in Firebase
    const callRef = push(ref(db, `calls/${currentUser.uid}`));
    set(callRef, {
        type: 'audio', with: currentOtherUser.name, withUid: currentOtherUser.uid,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(), status: 'outgoing'
    });
    callTimeout = setTimeout(() => {
        document.getElementById('callStatus').textContent = 'No answer';
        setTimeout(() => showScreen('chatScreen'), 2000);
    }, 15000);
};

window.endCall = () => {
    if (callTimeout) clearTimeout(callTimeout);
    showScreen('chatScreen');
};

window.startVideoCall = () => {
    if (!currentOtherUser) return;
    showScreen('videoCallScreen');
    document.getElementById('videoCallingUserName').textContent = currentOtherUser.name;
    document.getElementById('videoCallStatus').textContent = 'Calling...';
    if (currentOtherUser.photo) {
        document.getElementById('videoCallUserPhoto').src = currentOtherUser.photo;
        document.getElementById('videoCallUserPhoto').style.display = 'block';
        document.getElementById('videoCallUserIcon').style.display = 'none';
    }
    const callRef = push(ref(db, `calls/${currentUser.uid}`));
    set(callRef, {
        type: 'video', with: currentOtherUser.name, withUid: currentOtherUser.uid,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(), status: 'outgoing'
    });
    videoCallTimeout = setTimeout(() => {
        document.getElementById('videoCallStatus').textContent = 'No answer';
        setTimeout(() => showScreen('chatScreen'), 2000);
    }, 15000);
};

window.endVideoCall = () => {
    if (videoCallTimeout) clearTimeout(videoCallTimeout);
    showScreen('chatScreen');
};

// Load Call History
function loadCallHistory() {
    const callsDiv = document.getElementById('callsList');
    callsDiv.innerHTML = '<p style="padding:20px;text-align:center;color:#999;">Loading...</p>';
    get(ref(db, `calls/${currentUser.uid}`)).then(snap => {
        callsDiv.innerHTML = '';
        if (!snap.exists()) {
            callsDiv.innerHTML = '<p style="padding:20px;text-align:center;color:#999;">No calls yet</p>';
            return;
        }
        const calls = [];
        snap.forEach(c => calls.push(c.val()));
        calls.sort((a, b) => b.timestamp - a.timestamp);
        calls.forEach(call => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            div.innerHTML = `
                <div class="chat-avatar">${call.type === 'video' ? '📹' : '📞'}</div>
                <div class="chat-info">
                    <div class="chat-name">${call.with}</div>
                    <div class="last-message">${call.status === 'outgoing' ? '↗️ Outgoing' : '↙️ Incoming'} ${call.type} call · ${call.time}</div>
                </div>
            `;
            callsDiv.appendChild(div);
        });
    });
}

// ==================== STATUS ====================
window.showAddStatus = () => showScreen('addStatusScreen');

window.previewStatusPhoto = () => {
    const file = document.getElementById('statusPhotoInput').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        statusPhotoData = e.target.result;
        const preview = document.getElementById('statusPhotoPreview');
        preview.classList.remove('hidden');
        preview.innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:200px;border-radius:8px;" />`;
    };
    reader.readAsDataURL(file);
};

window.postStatus = async () => {
    const text = document.getElementById('statusText').value.trim();
    if (!text && !statusPhotoData) return alert('Add text or photo!');
    const statusRef = push(ref(db, `statuses/${currentUser.uid}`));
    await set(statusRef, {
        uid: currentUser.uid, name: currentUser.name, photo: currentUser.photo || '',
        text, image: statusPhotoData || null, timestamp: Date.now(),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });
    statusPhotoData = null;
    document.getElementById('statusText').value = '';
    document.getElementById('statusPhotoPreview').classList.add('hidden');
    alert('Status posted!');
    backToMain();
};

function loadStatuses() {
    const statusList = document.getElementById('statusList');
    statusList.innerHTML = '';
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours

    get(ref(db, 'statuses')).then(snap => {
        if (!snap.exists()) return;
        snap.forEach(userStatuses => {
            userStatuses.forEach(statusSnap => {
                const s = statusSnap.val();
                if (s.uid === currentUser.uid) return;
                if (s.timestamp < cutoff) return;
                if (blockedUsers.includes(s.uid)) return;

                const div = document.createElement('div');
                div.className = 'chat-item';
                div.onclick = () => viewStatus(s);
                div.innerHTML = `
                    <div class="status-avatar-ring">
                        ${s.photo ? `<img src="${s.photo}" class="chat-avatar" />` : `<div class="chat-avatar">👤</div>`}
                    </div>
                    <div class="chat-info">
                        <div class="chat-name">${s.name}</div>
                        <div class="last-message">${s.time} · ${s.text || '📷 Photo'}</div>
                    </div>
                `;
                statusList.appendChild(div);
            });
        });
    });
}

window.viewStatus = (status) => {
    showScreen('viewStatusScreen');
    document.getElementById('statusUserName').textContent = status.name;
    document.getElementById('statusTime').textContent = status.time;
    const img = document.getElementById('statusImage');
    const txt = document.getElementById('statusTextContent');
    if (status.image) { img.src = status.image; img.style.display = 'block'; } else { img.style.display = 'none'; }
    txt.textContent = status.text || '';
};

// ==================== SETTINGS ====================
window.showSettings = () => showScreen('settingsScreen');

// Profile
window.showProfile = () => {
    showScreen('profileScreen');
    document.getElementById('profileName').textContent = currentUser.name || '';
    document.getElementById('profileEmail').textContent = currentUser.email || '';
    document.getElementById('usernameInput').value = currentUser.username || '';
    document.getElementById('bioInput').value = currentUser.bio || '';
    document.getElementById('profileUsername').textContent = currentUser.username ? `@${currentUser.username}` : '';
    document.getElementById('profileBio').textContent = currentUser.bio || '';
    if (currentUser.photo) {
        document.getElementById('profileImage').src = currentUser.photo;
        document.getElementById('profileImage').style.display = 'block';
        document.getElementById('profileIcon').style.display = 'none';
    }
};

window.saveProfile = async () => {
    const username = document.getElementById('usernameInput').value.trim();
    const bio = document.getElementById('bioInput').value.trim();
    await update(ref(db, `users/${currentUser.uid}`), { username, bio });
    currentUser.username = username;
    currentUser.bio = bio;
    document.getElementById('profileUsername').textContent = username ? `@${username}` : '';
    document.getElementById('profileBio').textContent = bio;
    alert('Profile saved!');
};

window.uploadPhoto = () => {
    const file = document.getElementById('photoInput').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const photoData = e.target.result;
        await update(ref(db, `users/${currentUser.uid}`), { photo: photoData });
        currentUser.photo = photoData;
        document.getElementById('profileImage').src = photoData;
        document.getElementById('profileImage').style.display = 'block';
        document.getElementById('profileIcon').style.display = 'none';
        alert('Photo updated!');
    };
    reader.readAsDataURL(file);
};

// Other User Profile
window.showOtherUserProfile = () => {
    if (!currentOtherUser) return;
    showScreen('otherUserProfileScreen');
    document.getElementById('otherProfileName').textContent = currentOtherUser.name || '';
    document.getElementById('otherProfileEmail').textContent = currentOtherUser.email || '';
    document.getElementById('otherProfileUsername').textContent = currentOtherUser.username ? `@${currentOtherUser.username}` : '';
    document.getElementById('otherProfileBio').textContent = currentOtherUser.bio || '';
    document.getElementById('otherProfileStatus').textContent = currentOtherUser.online ? '🟢 Online' : `Last seen: ${getLastSeen(currentOtherUser.lastSeen)}`;
    if (currentOtherUser.photo) {
        document.getElementById('otherProfileImage').src = currentOtherUser.photo;
        document.getElementById('otherProfileImage').style.display = 'block';
        document.getElementById('otherProfileIcon').style.display = 'none';
    } else {
        document.getElementById('otherProfileImage').style.display = 'none';
        document.getElementById('otherProfileIcon').style.display = 'flex';
    }
};

window.backToChatFromProfile = () => showScreen('chatScreen');

// Privacy
window.showPrivacySettings = () => {
    showScreen('privacyScreen');
    const lastSeen = localStorage.getItem('lastSeenPrivacy') || 'everyone';
    const readReceipts = localStorage.getItem('readReceiptsEnabled') !== 'false';
    document.getElementById('lastSeenStatus').textContent = lastSeen === 'nobody' ? 'Nobody' : 'Everyone';
    document.getElementById('readReceiptsStatus').textContent = readReceipts ? 'On' : 'Off';
};

window.toggleLastSeen = () => {
    const current = localStorage.getItem('lastSeenPrivacy') || 'everyone';
    const next = current === 'everyone' ? 'nobody' : 'everyone';
    localStorage.setItem('lastSeenPrivacy', next);
    document.getElementById('lastSeenStatus').textContent = next === 'nobody' ? 'Nobody' : 'Everyone';
};

window.toggleReadReceipts = () => {
    const current = localStorage.getItem('readReceiptsEnabled') !== 'false';
    localStorage.setItem('readReceiptsEnabled', !current);
    document.getElementById('readReceiptsStatus').textContent = !current ? 'On' : 'Off';
};

// Blocked Users
window.showBlockedUsers = () => {
    showScreen('blockedUsersScreen');
    const list = document.getElementById('blockedUsersList');
    list.innerHTML = '';
    if (blockedUsers.length === 0) {
        list.innerHTML = '<p style="padding:20px;text-align:center;color:#999;">No blocked users</p>';
        return;
    }
    blockedUsers.forEach(uid => {
        get(ref(db, `users/${uid}`)).then(snap => {
            const user = snap.val();
            if (!user) return;
            const div = document.createElement('div');
            div.className = 'chat-item';
            div.innerHTML = `
                <div class="chat-avatar">👤</div>
                <div class="chat-info"><div class="chat-name">${user.name}</div></div>
                <button onclick="unblockUser('${uid}')" style="padding:5px 10px;font-size:12px;width:auto;background:#ff4444;">Unblock</button>
            `;
            list.appendChild(div);
        });
    });
};

window.unblockUser = (uid) => {
    blockedUsers = blockedUsers.filter(id => id !== uid);
    localStorage.setItem('blockedUsers', JSON.stringify(blockedUsers));
    showBlockedUsers();
};

// Chat Settings
window.showChatSettings = () => showScreen('chatSettingsScreen');

window.changeFontSize = (size) => {
    document.getElementById('messages').style.fontSize = size + 'px';
    localStorage.setItem('fontSize', size);
};

window.changeChatWallpaper = () => {
    document.getElementById('chatMenu')?.classList.add('hidden');
    document.getElementById('wallpaperModal').classList.remove('hidden');
};

window.closeWallpaperModal = () => document.getElementById('wallpaperModal').classList.add('hidden');

window.setWallpaper = (color) => {
    const msgs = document.getElementById('messages');
    if (msgs) msgs.style.background = color === 'none' ? '' : color;
    localStorage.setItem('chatWallpaper', color);
    closeWallpaperModal();
};

window.changeThemeColor = () => document.getElementById('themeModal').classList.remove('hidden');
window.closeThemeModal = () => document.getElementById('themeModal').classList.add('hidden');

window.setTheme = (color1, color2) => {
    document.documentElement.style.setProperty('--primary', color1);
    document.documentElement.style.setProperty('--primary-dark', color2);
    document.querySelectorAll('.header').forEach(h => h.style.background = `linear-gradient(135deg, ${color1}, ${color2})`);
    localStorage.setItem('themeColor1', color1);
    localStorage.setItem('themeColor2', color2);
    closeThemeModal();
};

// Notification Settings
window.showNotificationSettings = () => showScreen('notificationScreen');

window.toggleDND = () => {
    const dnd = localStorage.getItem('dnd') !== 'true';
    localStorage.setItem('dnd', dnd);
    document.getElementById('dndStatus').textContent = dnd ? 'On' : 'Off';
    soundEnabled = !dnd;
};

// App Lock
window.showAppLockSettings = () => {
    showScreen('appLockSettingsScreen');
    const locked = localStorage.getItem('appLockEnabled') === 'true';
    document.getElementById('appLockStatus').textContent = locked ? 'On' : 'Off';
    document.getElementById('pinSetupDiv').classList.toggle('hidden', !locked);
};

window.toggleAppLock = () => {
    const current = localStorage.getItem('appLockEnabled') === 'true';
    const next = !current;
    localStorage.setItem('appLockEnabled', next);
    document.getElementById('appLockStatus').textContent = next ? 'On' : 'Off';
    document.getElementById('pinSetupDiv').classList.toggle('hidden', !next);
};

window.savePin = () => {
    const pin = document.getElementById('newPinInput').value;
    if (pin.length !== 4) return alert('PIN must be 4 digits!');
    localStorage.setItem('appPin', pin);
    alert('PIN saved!');
};

window.unlockApp = () => {
    const pin = document.getElementById('lockPinInput').value;
    const savedPin = localStorage.getItem('appPin');
    if (pin === savedPin) {
        showScreen('loginScreen');
        onAuthStateChanged(auth, (user) => { if (user) showMainScreen(); });
    } else {
        alert('Wrong PIN!');
    }
};

// Delete Account
window.deleteAccount = async () => {
    if (!confirm('Are you sure? This will permanently delete your account!')) return;
    if (!confirm('This cannot be undone. Delete account?')) return;
    try {
        await remove(ref(db, `users/${currentUser.uid}`));
        await auth.currentUser.delete();
        alert('Account deleted.');
    } catch (e) { alert('Error: ' + e.message); }
};

// ==================== GROUP CHAT ====================
window.showNewGroup = () => {
    showScreen('createGroupScreen');
    const membersList = document.getElementById('groupMembersList');
    membersList.innerHTML = '';
    selectedGroupMembers = [];
    get(ref(db, 'users')).then(snap => {
        snap.forEach(child => {
            const user = child.val();
            if (user.uid === currentUser.uid) return;
            const div = document.createElement('div');
            div.className = 'chat-item';
            div.style.cursor = 'pointer';
            div.onclick = () => toggleGroupMember(user.uid, div);
            div.innerHTML = `
                <div class="chat-avatar">${user.photo ? `<img src="${user.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` : '👤'}</div>
                <div class="chat-info"><div class="chat-name">${user.name}</div></div>
                <span class="member-check" id="check_${user.uid}">○</span>
            `;
            membersList.appendChild(div);
        });
    });
};

window.toggleGroupMember = (uid, div) => {
    const check = document.getElementById(`check_${uid}`);
    if (selectedGroupMembers.includes(uid)) {
        selectedGroupMembers = selectedGroupMembers.filter(id => id !== uid);
        check.textContent = '○';
        div.style.background = '';
    } else {
        selectedGroupMembers.push(uid);
        check.textContent = '✓';
        div.style.background = '#e8f5e9';
    }
};

window.previewGroupPhoto = () => {
    const file = document.getElementById('groupPhotoInput').files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('groupPhotoPreview');
        preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />`;
    };
    reader.readAsDataURL(file);
};

window.createGroup = async () => {
    const name = document.getElementById('groupName').value.trim();
    if (!name) return alert('Enter group name!');
    if (selectedGroupMembers.length < 1) return alert('Select at least 1 member!');
    const groupId = 'group_' + Date.now();
    const members = { [currentUser.uid]: true };
    selectedGroupMembers.forEach(uid => members[uid] = true);
    await set(ref(db, `groups/${groupId}`), {
        name, description: document.getElementById('groupDescription').value.trim(),
        createdBy: currentUser.uid, createdAt: Date.now(), members
    });
    alert(`Group "${name}" created!`);
    backToMain();
};

// ==================== STARRED MESSAGES ====================
window.showStarredMessages = () => {
    showScreen('starredScreen');
    document.getElementById('chatMenu')?.classList.add('hidden');
    const list = document.getElementById('starredList');
    list.innerHTML = '';
    const starred = JSON.parse(localStorage.getItem(`starred_${currentChatId}`) || '[]');
    if (starred.length === 0) {
        list.innerHTML = '<p style="padding:20px;text-align:center;color:#999;">No starred messages</p>';
        return;
    }
    starred.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message other-message';
        div.style.margin = '10px';
        div.innerHTML = `<div class="message-text">⭐ ${msg.text}</div><div class="message-time">${msg.time}</div>`;
        list.appendChild(div);
    });
};

window.starMessage = (msgId, text, time) => {
    const key = `starred_${currentChatId}`;
    const starred = JSON.parse(localStorage.getItem(key) || '[]');
    starred.push({ id: msgId, text, time });
    localStorage.setItem(key, JSON.stringify(starred));
    alert('Message starred!');
};

// ==================== DISAPPEARING MESSAGES ====================
window.showDisappearingSettings = () => {
    document.getElementById('chatMenu')?.classList.add('hidden');
    const current = localStorage.getItem(`disappear_${currentChatId}`) || 'off';
    const options = ['off', '24h', '7d', '30d'];
    const labels = { off: 'Off', '24h': '24 Hours', '7d': '7 Days', '30d': '30 Days' };
    const choice = prompt(`Disappearing messages:\n0: Off\n1: 24 Hours\n2: 7 Days\n3: 30 Days\n\nCurrent: ${labels[current]}\n\nEnter 0-3:`);
    if (choice !== null && options[parseInt(choice)] !== undefined) {
        const selected = options[parseInt(choice)];
        localStorage.setItem(`disappear_${currentChatId}`, selected);
        alert(`Disappearing messages: ${labels[selected]}`);
    }
};

// ==================== MUTE CHAT ====================
window.muteChatToggle = () => {
    document.getElementById('chatMenu')?.classList.add('hidden');
    const key = `muted_${currentChatId}`;
    const muted = localStorage.getItem(key) === 'true';
    localStorage.setItem(key, !muted);
    alert(muted ? 'Chat unmuted' : 'Chat muted for 8 hours');
};

// ==================== ATTACH FILES ====================
window.showAttachMenu = () => {
    document.getElementById('attachMenu').classList.toggle('hidden');
};

window.attachFile = (type) => {
    document.getElementById('attachMenu').classList.add('hidden');
    let fileInput;
    if (type === 'photo') fileInput = document.getElementById('photoAttach');
    else if (type === 'video') fileInput = document.getElementById('videoAttach');
    else if (type === 'doc') fileInput = document.getElementById('docAttach');
    else return;

    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const isImage = type === 'photo';
        const msgRef = push(ref(db, `chats/${currentChatId}/messages`));
        await set(msgRef, {
            text: isImage ? '' : `📎 ${file.name}`,
            image: isImage ? e.target.result : null,
            senderId: currentUser.uid, senderName: currentUser.name,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(), deleted: false, read: false
        });
        fileInput.value = '';
    };
    reader.readAsDataURL(file);
};

window.shareLocation = () => {
    document.getElementById('attachMenu').classList.add('hidden');
    if (!navigator.geolocation) return alert('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        const msgRef = push(ref(db, `chats/${currentChatId}/messages`));
        await set(msgRef, {
            text: `📍 Location: https://maps.google.com/?q=${latitude},${longitude}`,
            image: null, senderId: currentUser.uid, senderName: currentUser.name,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(), deleted: false, read: false
        });
    }, () => alert('Location access denied!'));
};

window.shareContact = () => {
    document.getElementById('attachMenu').classList.add('hidden');
    const name = prompt('Contact name:');
    const phone = prompt('Contact phone:');
    if (!name || !phone) return;
    const msgRef = push(ref(db, `chats/${currentChatId}/messages`));
    set(msgRef, {
        text: `👤 Contact: ${name} - ${phone}`,
        image: null, senderId: currentUser.uid, senderName: currentUser.name,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(), deleted: false, read: false
    });
};

// ==================== EMOJI PICKER ====================
const EMOJIS = ['😀','😂','😍','🥰','😎','😭','😡','🤔','👍','👎','❤️','🔥','🎉','✅','💯','🙏','😊','🤣','😅','😢','😤','🥳','😴','🤯','👏','💪','🎶','🌟','💬','📱'];

window.toggleEmojiPicker = () => {
    const picker = document.getElementById('emojiPicker');
    picker.classList.toggle('hidden');
    if (!picker.classList.contains('hidden') && !document.getElementById('emojiGrid').children.length) {
        EMOJIS.forEach(emoji => {
            const span = document.createElement('span');
            span.textContent = emoji;
            span.onclick = () => {
                document.getElementById('messageInput').value += emoji;
                picker.classList.add('hidden');
            };
            document.getElementById('emojiGrid').appendChild(span);
        });
    }
};

// ==================== IMAGE MODAL ====================
window.openImageModal = (src) => {
    document.getElementById('modalImage').src = src;
    document.getElementById('imageModal').classList.remove('hidden');
};

window.closeImageModal = () => document.getElementById('imageModal').classList.add('hidden');

// ==================== HELPERS ====================
function getLastSeen(timestamp) {
    if (!timestamp) return 'Last seen: unknown';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `Last seen ${mins}m ago`;
    if (hours < 24) return `Last seen ${hours}h ago`;
    return `Last seen ${days}d ago`;
}

// Apply saved settings on load
const savedWallpaper = localStorage.getItem('chatWallpaper');
const savedFontSize = localStorage.getItem('fontSize');
const savedTheme1 = localStorage.getItem('themeColor1');
const savedTheme2 = localStorage.getItem('themeColor2');
if (savedFontSize) { const msgs = document.getElementById('messages'); if (msgs) msgs.style.fontSize = savedFontSize + 'px'; }
if (savedTheme1 && savedTheme2) {
    document.documentElement.style.setProperty('--primary', savedTheme1);
    document.documentElement.style.setProperty('--primary-dark', savedTheme2);
    document.querySelectorAll('.header').forEach(h => h.style.background = `linear-gradient(135deg, ${savedTheme1}, ${savedTheme2})`);
}

// ==================== MEDIA GALLERY ====================
window.showMediaGallery = () => {
    document.getElementById('chatMenu').classList.add('hidden');
    showScreen('mediaGalleryScreen');
    const grid = document.getElementById('mediaGalleryGrid');
    grid.innerHTML = '<p style="padding:20px;text-align:center;color:#999;grid-column:1/-1;">Loading...</p>';
    get(ref(db, `chats/${currentChatId}/messages`)).then(snap => {
        grid.innerHTML = '';
        let count = 0;
        snap.forEach(child => {
            const msg = child.val();
            if (msg.image && !msg.deleted) {
                count++;
                const img = document.createElement('img');
                img.src = msg.image;
                img.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;cursor:pointer;';
                img.onclick = () => openImageModal(msg.image);
                grid.appendChild(img);
            }
        });
        if (count === 0) grid.innerHTML = '<p style="padding:20px;text-align:center;color:#999;grid-column:1/-1;">No media yet</p>';
    });
};

// ==================== ARCHIVE ====================
window.archiveChat = () => {
    document.getElementById('chatMenu').classList.add('hidden');
    const key = 'archivedChats';
    const archived = JSON.parse(localStorage.getItem(key) || '[]');
    const exists = archived.find(c => c.uid === currentOtherUser.uid);
    if (!exists) {
        archived.push({ uid: currentOtherUser.uid, name: currentOtherUser.name, photo: currentOtherUser.photo || '' });
        localStorage.setItem(key, JSON.stringify(archived));
        alert(`Chat with ${currentOtherUser.name} archived!`);
    } else {
        alert('Chat already archived');
    }
    backToMain();
};

window.showArchive = () => {
    showScreen('archiveScreen');
    const list = document.getElementById('archivedChatList');
    list.innerHTML = '';
    const archived = JSON.parse(localStorage.getItem('archivedChats') || '[]');
    if (archived.length === 0) {
        list.innerHTML = '<p style="padding:20px;text-align:center;color:#999;">No archived chats</p>';
        return;
    }
    archived.forEach((chat, i) => {
        const div = document.createElement('div');
        div.className = 'chat-item';
        div.innerHTML = `
            <div class="chat-avatar">${chat.photo ? `<img src="${chat.photo}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />` : '👤'}</div>
            <div class="chat-info"><div class="chat-name">${chat.name}</div><div class="last-message">Archived</div></div>
            <button onclick="unarchiveChat(${i})" style="width:auto;padding:5px 10px;font-size:12px;background:#ff4444;">Unarchive</button>
        `;
        list.appendChild(div);
    });
};

window.unarchiveChat = (index) => {
    const archived = JSON.parse(localStorage.getItem('archivedChats') || '[]');
    archived.splice(index, 1);
    localStorage.setItem('archivedChats', JSON.stringify(archived));
    showArchive();
};

// ==================== PINNED MESSAGES ====================
window.showPinnedMessages = () => {
    document.getElementById('chatMenu').classList.add('hidden');
    showScreen('pinnedScreen');
    const list = document.getElementById('pinnedList');
    list.innerHTML = '';
    const pinned = JSON.parse(localStorage.getItem(`pinned_${currentChatId}`) || '[]');
    if (pinned.length === 0) {
        list.innerHTML = '<p style="padding:20px;text-align:center;color:#999;">No pinned messages</p>';
        return;
    }
    pinned.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message other-message';
        div.style.margin = '10px';
        div.innerHTML = `<div class="message-text">📌 ${msg.text}</div><div class="message-time">${msg.time}</div>`;
        list.appendChild(div);
    });
};

window.pinMessage = (msgId, text, time) => {
    const key = `pinned_${currentChatId}`;
    const pinned = JSON.parse(localStorage.getItem(key) || '[]');
    if (pinned.find(m => m.id === msgId)) { alert('Already pinned!'); return; }
    pinned.push({ id: msgId, text, time });
    localStorage.setItem(key, JSON.stringify(pinned));
    alert('Message pinned!');
};

// ==================== EXPORT CHAT ====================
window.showExportChat = () => {
    document.getElementById('chatMenu').classList.add('hidden');
    showScreen('exportScreen');
};

window.exportChatTxt = () => {
    get(ref(db, `chats/${currentChatId}/messages`)).then(snap => {
        let text = `HeyApp Chat Export - ${currentOtherUser.name}\n${'='.repeat(40)}\n\n`;
        snap.forEach(child => {
            const msg = child.val();
            if (!msg.deleted) {
                const sender = msg.senderId === currentUser.uid ? 'You' : currentOtherUser.name;
                text += `[${msg.time}] ${sender}: ${msg.text || (msg.image ? '[Photo]' : '[Voice]')}\n`;
            }
        });
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `chat_${currentOtherUser.name}_${Date.now()}.txt`;
        a.click();
    });
};

window.exportChatJSON = () => {
    get(ref(db, `chats/${currentChatId}/messages`)).then(snap => {
        const messages = [];
        snap.forEach(child => messages.push(child.val()));
        const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `chat_${currentOtherUser.name}_${Date.now()}.json`;
        a.click();
    });
};

// ==================== TRANSLATE ====================
let translateMsgText = '';
window.showTranslate = (text) => {
    translateMsgText = text;
    document.getElementById('translateOriginal').textContent = text;
    document.getElementById('translateResult').textContent = '';
    document.getElementById('translateModal').classList.remove('hidden');
};

window.doTranslate = () => {
    const lang = document.getElementById('translateLang').value;
    const langNames = { hi: 'Hindi', en: 'English', ur: 'Urdu', ar: 'Arabic', fr: 'French', es: 'Spanish' };
    // Use Google Translate URL (opens in new tab as fallback)
    const url = `https://translate.google.com/?sl=auto&tl=${lang}&text=${encodeURIComponent(translateMsgText)}&op=translate`;
    document.getElementById('translateResult').innerHTML = `<a href="${url}" target="_blank" style="color:#667eea;">Open in Google Translate (${langNames[lang]}) →</a>`;
};

window.closeTranslateModal = () => document.getElementById('translateModal').classList.add('hidden');

// ==================== SCHEDULE MESSAGE ====================
window.showScheduleModal = () => {
    document.getElementById('attachMenu').classList.add('hidden');
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    document.getElementById('scheduleTime').value = now.toISOString().slice(0, 16);
    document.getElementById('scheduleModal').classList.remove('hidden');
};

window.closeScheduleModal = () => document.getElementById('scheduleModal').classList.add('hidden');

window.scheduleMessage = () => {
    const text = document.getElementById('scheduleText').value.trim();
    const time = document.getElementById('scheduleTime').value;
    if (!text || !time) return alert('Fill all fields!');
    const delay = new Date(time).getTime() - Date.now();
    if (delay < 0) return alert('Choose a future time!');
    closeScheduleModal();
    alert(`Message scheduled! Will send in ${Math.round(delay / 60000)} minutes.`);
    setTimeout(async () => {
        const msgRef = push(ref(db, `chats/${currentChatId}/messages`));
        await set(msgRef, {
            text: `⏰ ${text}`, image: null, senderId: currentUser.uid, senderName: currentUser.name,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(), deleted: false, read: false
        });
    }, delay);
};

// ==================== POLLS ====================
window.showPollScreen = () => {
    document.getElementById('attachMenu').classList.add('hidden');
    showScreen('pollScreen');
};

window.sendPoll = async () => {
    const question = document.getElementById('pollQuestion').value.trim();
    const opt1 = document.getElementById('pollOpt1').value.trim();
    const opt2 = document.getElementById('pollOpt2').value.trim();
    if (!question || !opt1 || !opt2) return alert('Question and at least 2 options required!');
    const options = [opt1, opt2];
    if (document.getElementById('pollOpt3').value.trim()) options.push(document.getElementById('pollOpt3').value.trim());
    if (document.getElementById('pollOpt4').value.trim()) options.push(document.getElementById('pollOpt4').value.trim());

    const pollText = `📊 *${question}*\n${options.map((o, i) => `${['1️⃣','2️⃣','3️⃣','4️⃣'][i]} ${o}`).join('\n')}\n\nReply with option number to vote!`;
    const msgRef = push(ref(db, `chats/${currentChatId}/messages`));
    await set(msgRef, {
        text: pollText, image: null, senderId: currentUser.uid, senderName: currentUser.name,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(), deleted: false, read: false, isPoll: true
    });
    showScreen('chatScreen');
};

// ==================== AUTO REPLY ====================
window.showAutoReply = () => {
    showScreen('autoReplyScreen');
    const enabled = localStorage.getItem('autoReplyEnabled') === 'true';
    document.getElementById('autoReplyStatus').textContent = enabled ? 'On' : 'Off';
    document.getElementById('autoReplyMsg').value = localStorage.getItem('autoReplyMsg') || "I'm away right now, will reply soon!";
};

window.toggleAutoReply = () => {
    const current = localStorage.getItem('autoReplyEnabled') === 'true';
    localStorage.setItem('autoReplyEnabled', !current);
    document.getElementById('autoReplyStatus').textContent = !current ? 'On' : 'Off';
};

window.saveAutoReply = () => {
    localStorage.setItem('autoReplyMsg', document.getElementById('autoReplyMsg').value);
    alert('Auto reply saved!');
};

// ==================== QR CODE ====================
window.showQRCode = () => {
    showScreen('qrScreen');
    const qrDiv = document.getElementById('qrCodeDisplay');
    const profileLink = `https://heyapp.app/user/${currentUser.uid}`;
    // Simple QR visual using text
    qrDiv.innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:60px;margin-bottom:10px;">📱</div>
            <div style="font-size:11px;word-break:break-all;color:#667eea;">${currentUser.name}</div>
            <div style="font-size:10px;color:#999;margin-top:5px;">ID: ${currentUser.uid.slice(0,8)}...</div>
        </div>
    `;
};

window.copyProfileLink = () => {
    const link = `https://heyapp.app/user/${currentUser.uid}`;
    navigator.clipboard.writeText(link).then(() => alert('Profile link copied!')).catch(() => {
        prompt('Copy this link:', link);
    });
};

// ==================== LANGUAGE ====================
window.showLanguageSettings = () => {
    showScreen('languageScreen');
    const lang = localStorage.getItem('appLanguage') || 'en';
    ['en','hi','ur'].forEach(l => {
        document.getElementById(`lang_${l}`).textContent = l === lang ? '✓' : '';
    });
};

window.setLanguage = (lang) => {
    localStorage.setItem('appLanguage', lang);
    const names = { en: 'English', hi: 'Hindi', ur: 'Urdu' };
    document.getElementById('currentLang').textContent = names[lang];
    ['en','hi','ur'].forEach(l => {
        document.getElementById(`lang_${l}`).textContent = l === lang ? '✓' : '';
    });
    alert(`Language set to ${names[lang]}`);
};

// ==================== LOGIN HISTORY ====================
window.showLoginHistory = () => {
    showScreen('loginHistoryScreen');
    const list = document.getElementById('loginHistoryList');
    // Log current session
    const history = JSON.parse(localStorage.getItem('loginHistory') || '[]');
    if (history.length === 0) {
        list.innerHTML = '<p style="padding:20px;text-align:center;color:#999;">No login history</p>';
        return;
    }
    list.innerHTML = history.reverse().map(h => `
        <div class="settings-item" style="flex-direction:column;align-items:flex-start;">
            <span style="font-weight:600;">${h.device || 'Web Browser'}</span>
            <span style="font-size:12px;color:#999;">${h.time} · ${h.ip || 'Unknown IP'}</span>
        </div>
    `).join('');
};

// Log login on auth
function logLoginHistory() {
    const history = JSON.parse(localStorage.getItem('loginHistory') || '[]');
    history.push({
        time: new Date().toLocaleString(),
        device: navigator.userAgent.includes('Mobile') ? '📱 Mobile' : '💻 Desktop',
        ip: 'Hidden for privacy'
    });
    if (history.length > 10) history.shift();
    localStorage.setItem('loginHistory', JSON.stringify(history));
}

// ==================== 2FA ====================
window.show2FA = () => showScreen('twoFAScreen');

window.toggle2FA = () => {
    const current = localStorage.getItem('2faEnabled') === 'true';
    localStorage.setItem('2faEnabled', !current);
    document.getElementById('twoFAStatus').textContent = !current ? 'On' : 'Off';
    document.getElementById('twoFASetup').classList.toggle('hidden', current);
};

window.save2FA = () => {
    const pin = document.getElementById('twoFAPin').value;
    if (pin.length !== 6) return alert('PIN must be 6 digits!');
    localStorage.setItem('2faPin', pin);
    alert('2FA PIN saved! Keep it safe.');
};

// ==================== CHAT NOTIFICATIONS ====================
window.showChatNotifSettings = () => {
    document.getElementById('chatMenu').classList.add('hidden');
    showScreen('chatNotifScreen');
    const muted = localStorage.getItem(`muted_${currentChatId}`) === 'true';
    const preview = localStorage.getItem('msgPreview') !== 'false';
    const vibration = localStorage.getItem('vibration') !== 'false';
    document.getElementById('chatMuteStatus').textContent = muted ? 'On' : 'Off';
    document.getElementById('msgPreviewStatus').textContent = preview ? 'On' : 'Off';
    document.getElementById('vibrationStatus').textContent = vibration ? 'On' : 'Off';
};

window.toggleChatMuteNotif = () => {
    const key = `muted_${currentChatId}`;
    const muted = localStorage.getItem(key) === 'true';
    localStorage.setItem(key, !muted);
    document.getElementById('chatMuteStatus').textContent = !muted ? 'On' : 'Off';
};

window.toggleMsgPreview = () => {
    const current = localStorage.getItem('msgPreview') !== 'false';
    localStorage.setItem('msgPreview', !current);
    document.getElementById('msgPreviewStatus').textContent = !current ? 'On' : 'Off';
};

window.setChatTone = (tone) => {
    localStorage.setItem(`tone_${currentChatId}`, tone);
};

window.toggleVibration = () => {
    const current = localStorage.getItem('vibration') !== 'false';
    localStorage.setItem('vibration', !current);
    document.getElementById('vibrationStatus').textContent = !current ? 'On' : 'Off';
    if (!current && navigator.vibrate) navigator.vibrate(200);
};

// ==================== VOICE NOTE SPEED ====================
window.playAudioSpeed = (audioData, speed) => {
    const audio = new Audio(audioData);
    audio.playbackRate = speed || 1;
    audio.play();
};

// ==================== BIRTHDAY / STATUS EMOJI ====================
window.setBirthdayStatus = () => {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    update(ref(db, `users/${currentUser.uid}`), { birthday: `${month}/${day}` });
    alert('Birthday set!');
};

// ==================== PATCH renderMessage with new actions ====================
// Override renderMessage to add translate + pin buttons
const _origRenderMessage = window.renderMessage;
function renderMessage(msg) {
    const messagesDiv = document.getElementById('messages');
    const isMine = msg.senderId === currentUser.uid;
    const div = document.createElement('div');
    div.className = `message ${isMine ? 'my-message' : 'other-message'}`;
    div.dataset.msgId = msg.id;

    let replyHtml = msg.replyTo ? `<div class="reply-preview-msg">↩️ ${msg.replyTo.text}</div>` : '';
    let contentHtml = '';

    if (msg.image) contentHtml += `<img src="${msg.image}" class="message-image" onclick="openImageModal('${msg.image}')" />`;
    if (msg.audio) contentHtml += `
        <div class="voice-message">
            <button class="voice-play-btn" onclick="playAudio('${msg.audio}')">▶ 1x</button>
            <button class="voice-play-btn" onclick="playAudioSpeed('${msg.audio}', 1.5)" style="font-size:11px;">1.5x</button>
            <button class="voice-play-btn" onclick="playAudioSpeed('${msg.audio}', 2)" style="font-size:11px;">2x</button>
            <div class="voice-waveform"></div>
            <span class="voice-duration">${msg.audioDuration || '0:00'}</span>
        </div>`;
    if (msg.deleted) contentHtml += `<div class="message-text"><i>🚫 This message was deleted</i></div>`;
    else if (msg.text) contentHtml += `<div class="message-text">${msg.text}</div>`;

    let reactionsHtml = '';
    if (msg.reactions) {
        const reactionCounts = {};
        Object.values(msg.reactions).forEach(r => { reactionCounts[r] = (reactionCounts[r] || 0) + 1; });
        reactionsHtml = `<div class="message-reactions">${Object.entries(reactionCounts).map(([r, c]) => `<span class="reaction-badge">${r} ${c}</span>`).join('')}</div>`;
    }

    const safeText = (msg.text || 'Photo').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const deleteBtn = isMine && !msg.deleted ? `<button class="msg-reply-btn" onclick="deleteMessage('${msg.id}')">🗑️</button>` : '';
    const replyBtn = !msg.deleted ? `<button class="msg-reply-btn" onclick="replyToMessage('${msg.id}', '${safeText}')">↩️</button>` : '';
    const forwardBtn = !msg.deleted ? `<button class="msg-reply-btn" onclick="forwardMessage('${msg.id}', '${safeText}')">↪️</button>` : '';
    const reactBtn = !msg.deleted ? `<button class="msg-reply-btn" onclick="showReactionPicker('${msg.id}', event)">😊</button>` : '';
    const translateBtn = msg.text && !msg.deleted ? `<button class="msg-reply-btn" onclick="showTranslate('${safeText}')">🌐</button>` : '';
    const pinBtn = !msg.deleted ? `<button class="msg-reply-btn" onclick="pinMessage('${msg.id}', '${safeText}', '${msg.time}')">📌</button>` : '';
    const starBtn = !msg.deleted ? `<button class="msg-reply-btn" onclick="starMessage('${msg.id}', '${safeText}', '${msg.time}')">⭐</button>` : '';
    const readReceipt = isMine ? (msg.read ? ' ✓✓' : ' ✓') : '';

    div.innerHTML = `
        ${replyHtml}
        ${contentHtml}
        ${reactionsHtml}
        <div class="message-footer">
            <span class="message-time">${msg.time || ''}${readReceipt}</span>
            <div class="message-actions">${reactBtn}${replyBtn}${forwardBtn}${translateBtn}${pinBtn}${starBtn}${deleteBtn}</div>
        </div>
    `;
    messagesDiv.appendChild(div);
}

// Make renderMessage global
window.renderMessage = renderMessage;

// ==================== PATCH onAuthStateChanged to log history ====================
// Call logLoginHistory when user logs in (patch showMainScreen)
const _origShowMainScreen = window.showMainScreen;
function showMainScreen() {
    logLoginHistory();
    showScreen('mainScreen');
    switchTab('chats');
    updateDarkModeUI();
    // Apply saved language
    const lang = localStorage.getItem('appLanguage') || 'en';
    const names = { en: 'English', hi: 'Hindi', ur: 'Urdu' };
    const el = document.getElementById('currentLang');
    if (el) el.textContent = names[lang] || 'English';
}
window.showMainScreen = showMainScreen;
