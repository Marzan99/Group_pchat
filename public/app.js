// ═══════════════════════════════════════════════════════════════════
// PARAMOUNT GROUP PCHAT — CLIENT APPLICATION
// Real-Time Group & Direct 1-on-1 Private Messaging Platform
// Designed & Developed by Marzan
// ═══════════════════════════════════════════════════════════════════

const API_BASE = ''; // Same origin
let socket = null;

// Application State
const state = {
  currentUser: JSON.parse(localStorage.getItem('group_pchat_user') || 'null'),
  
  // Active Conversation: { type: 'group' } OR { type: 'direct', partner_id, partner_name, ... }
  activeChat: {
    type: 'group',
    id: 'group',
    name: 'Paramount Corporate Group',
  },

  conversations: {
    group: {
      id: 'group',
      type: 'group',
      name: 'Paramount Corporate Group',
      last_message: null,
      last_message_time: null,
      unread_count: 0,
    },
    direct_chats: [],
  },

  messages: [],
  users: [],
  onlineUserIds: [],
  unreadCount: 0,
  unreadNotifications: [],

  groupSettings: {
    group_name: 'Paramount Corporate Group',
    group_description: 'Official Group Chat for Paramount Insurance Ltd.',
    only_admins_can_send: '0',
    announcement: ''
  },

  replyingTo: null,
  activeSidebarTab: 'chats', // 'chats' | 'members'
  showNotifDropdown: false,
  showAdminModal: false,
  adminModalTab: 'permissions', // 'permissions' | 'settings'
  showAudienceModal: false,
  targetAudience: 'all', // 'all' or comma-separated user IDs
  targetAudienceSelectedIds: [],
  
  // Multi-user private message modal
  showMultiUserModal: false,
  multiUserSelectedIds: [],
  multiUserMessageText: '',

  searchQuery: '',
  typingUsers: new Map(), // userId -> name
  soundEnabled: true,
};

// ─────────────────────────────────────────────
// Audio Synthesizer (Zero-dependency Web Audio API)
// ─────────────────────────────────────────────
function playNotificationSound() {
  if (!state.soundEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (e) {
    // Audio context allowed after user interaction
  }
}

// ─────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (state.currentUser) {
    initChat();
  } else {
    renderLogin();
  }
});

// ─────────────────────────────────────────────
// Socket.io Connection & Listeners
// ─────────────────────────────────────────────
function setupSocket() {
  if (socket) socket.disconnect();

  socket = io();

  socket.on('connect', () => {
    if (state.currentUser) {
      socket.emit('user_join', state.currentUser);
    }
  });

  socket.on('online_users_updated', (onlineIds) => {
    state.onlineUserIds = onlineIds || [];
    render();
  });

  socket.on('new_message', (msg) => {
    const isForActiveChat = 
      (state.activeChat.type === 'group' && (msg.chat_type === 'group' || !msg.chat_type)) ||
      (state.activeChat.type === 'direct' && msg.chat_type === 'direct' && 
        ((msg.sender_id === state.activeChat.partner_id && msg.recipient_id === state.currentUser.id) ||
         (msg.sender_id === state.currentUser.id && msg.recipient_id === state.activeChat.partner_id))
      ) ||
      (state.activeChat.type === 'multi' && msg.chat_type === 'multi');

    if (isForActiveChat) {
      if (!state.messages.some(m => m.id === msg.id)) {
        state.messages.push(msg);
        render();
        scrollToBottom();
      }
    }

    if (msg.sender_id !== state.currentUser.id) {
      playNotificationSound();
    }

    // Refresh conversation previews and unread indicators
    fetchConversations();
  });

  socket.on('direct_conversation_updated', () => {
    fetchConversations();
  });

  socket.on('unread_count_updated', ({ unreadCount }) => {
    state.unreadCount = unreadCount;
    renderHeaderBadges();
  });

  socket.on('user_typing', ({ userId, name, isTyping, chatType, partnerId }) => {
    if (userId === state.currentUser.id) return;

    const matchesChat = 
      (state.activeChat.type === 'group' && chatType === 'group') ||
      (state.activeChat.type === 'direct' && chatType === 'direct' && partnerId === state.currentUser.id);

    if (matchesChat) {
      if (isTyping) {
        state.typingUsers.set(userId, name);
      } else {
        state.typingUsers.delete(userId);
      }
      renderTypingBar();
    }
  });

  socket.on('permissions_updated', ({ userId, can_send, role }) => {
    if (state.currentUser && state.currentUser.id === userId) {
      if (can_send !== undefined) state.currentUser.can_send = can_send;
      if (role !== undefined) state.currentUser.role = role;
      localStorage.setItem('group_pchat_user', JSON.stringify(state.currentUser));
      render();
    }
    const u = state.users.find(x => x.id === userId);
    if (u) {
      if (can_send !== undefined) u.can_send = can_send;
      if (role !== undefined) u.role = role;
      render();
    }
  });

  socket.on('settings_updated', (newSettings) => {
    state.groupSettings = { ...state.groupSettings, ...newSettings };
    render();
  });

  socket.on('message_pinned_updated', ({ messageId, is_pinned }) => {
    const msg = state.messages.find(m => m.id === messageId);
    if (msg) msg.is_pinned = is_pinned;
    render();
  });

  socket.on('message_deleted', ({ messageId }) => {
    state.messages = state.messages.filter(m => m.id !== messageId);
    render();
  });
}

// ─────────────────────────────────────────────
// Data Fetching
// ─────────────────────────────────────────────
async function initChat() {
  setupSocket();

  try {
    // 1. Fetch Users List
    const usersRes = await fetch(`${API_BASE}/api/users`);
    state.users = await usersRes.json();

    // 2. Fetch Group Settings
    const setRes = await fetch(`${API_BASE}/api/settings`);
    state.groupSettings = await setRes.json();

    // 3. Fetch Conversations list
    await fetchConversations();

    // 4. Fetch Messages for default active chat (Group)
    await loadActiveChatMessages();

    // 5. Fetch Missed Notifications
    fetchMissedNotifications();

    render();
    scrollToBottom();
  } catch (err) {
    console.error('Error initializing chat:', err);
  }
}

async function fetchConversations() {
  if (!state.currentUser) return;
  try {
    const res = await fetch(`${API_BASE}/api/conversations?user_id=${state.currentUser.id}`);
    const data = await res.json();
    state.conversations = data;
    render();
  } catch (e) {
    console.error('Error fetching conversations:', e);
  }
}

async function loadActiveChatMessages() {
  if (!state.currentUser) return;

  try {
    let url = `${API_BASE}/api/messages?user_id=${state.currentUser.id}&chat_type=${state.activeChat.type}`;
    if (state.activeChat.type === 'direct') {
      url += `&partner_id=${state.activeChat.partner_id}`;
    }

    const res = await fetch(url);
    state.messages = await res.json();

    // Refresh conversation unread count
    fetchConversations();
    fetchMissedNotifications();
    render();
    scrollToBottom();
  } catch (err) {
    console.error('Error loading chat messages:', err);
  }
}

async function fetchMissedNotifications() {
  if (!state.currentUser) return;
  try {
    const notifRes = await fetch(`${API_BASE}/api/notifications/unread?user_id=${state.currentUser.id}`);
    const notifData = await notifRes.json();
    state.unreadCount = notifData.count;
    state.unreadNotifications = notifData.unreadMessages;
    renderHeaderBadges();
  } catch (e) {
    console.error(e);
  }
}

// ─────────────────────────────────────────────
// Actions & Handlers
// ─────────────────────────────────────────────

// Switch Chat (Group vs Direct 1-on-1)
function switchChat(chatObj) {
  state.activeChat = chatObj;
  state.replyingTo = null;
  state.typingUsers.clear();
  loadActiveChatMessages();
}

// Start 1-on-1 Direct Chat with any member
function startDirectChatWithUser(user) {
  if (user.id === state.currentUser.id) {
    alert('নিজের সাথে আলাদা চ্যাট খোলা যাবে না। অন্য কোনো সদস্য নির্বাচন করুন।');
    return;
  }

  state.activeChat = {
    type: 'direct',
    id: `direct_${user.id}`,
    partner_id: user.id,
    partner_name: user.name,
    partner_email: user.email,
    partner_department: user.department,
    partner_role: user.role,
    partner_avatar: user.avatar_color,
  };

  state.activeSidebarTab = 'chats';
  loadActiveChatMessages();
}

// Login
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btnEl = document.getElementById('login-btn');

  errorEl.style.display = 'none';
  btnEl.disabled = true;
  btnEl.innerText = 'লগইন হচ্ছে...';

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      state.currentUser = data.user;
      state.unreadCount = data.unreadCount;
      state.groupSettings = data.settings || state.groupSettings;
      localStorage.setItem('group_pchat_user', JSON.stringify(data.user));
      initChat();
    } else {
      errorEl.innerText = data.error || 'ভুল ইমেইল অথবা পাসওয়ার্ড!';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.innerText = 'সার্ভার কানেকশন সমস্যা। সার্ভার চালু আছে কিনা দেখুন।';
    errorEl.style.display = 'block';
  } finally {
    btnEl.disabled = false;
    btnEl.innerText = 'লগইন করুন';
  }
}

// Quick demo login populate
function fillQuickAccount(email, pass) {
  const eInput = document.getElementById('login-email');
  const pInput = document.getElementById('login-password');
  if (eInput && pInput) {
    eInput.value = email;
    pInput.value = pass;
  }
}

// Logout
function handleLogout() {
  if (socket) socket.disconnect();
  localStorage.removeItem('group_pchat_user');
  state.currentUser = null;
  state.messages = [];
  state.users = [];
  state.unreadCount = 0;
  state.replyingTo = null;
  renderLogin();
}

// Send Message (Group OR Direct 1-on-1)
async function handleSendMessage(e) {
  if (e) e.preventDefault();

  const inputEl = document.getElementById('chat-input');
  if (!inputEl) return;

  const text = inputEl.value.trim();
  if (!text) return;

  const payload = {
    sender_id: state.currentUser.id,
    message: text,
    chat_type: state.activeChat.type,
    recipient_id: state.activeChat.type === 'direct' ? state.activeChat.partner_id : null,
    target_audience: state.activeChat.type === 'group' ? (state.targetAudience || 'all') : null,
    reply_to_id: state.replyingTo ? state.replyingTo.id : null,
  };

  try {
    const res = await fetch(`${API_BASE}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      inputEl.value = '';
      state.replyingTo = null;
      renderFooterCompose();
      if (socket) {
        socket.emit('typing', { 
          userId: state.currentUser.id, 
          name: state.currentUser.name, 
          isTyping: false,
          chatType: state.activeChat.type,
          partnerId: state.activeChat.type === 'direct' ? state.activeChat.partner_id : null,
        });
      }
    } else {
      alert(data.error || 'মেসেজ পাঠানো সম্ভব হয়নি।');
    }
  } catch (err) {
    console.error('Send error:', err);
    alert('নেটওয়ার্ক সমস্যা।');
  }
}

// Send Multi-User Private Message
async function handleSendMultiUserMessage() {
  if (state.multiUserSelectedIds.length === 0) {
    alert('অন্তত একজন বা একাধিক প্রাপক নির্বাচন করুন।');
    return;
  }

  const text = document.getElementById('multi-message-text').value.trim();
  if (!text) {
    alert('মেসেজ টেক্সট লিখুন।');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender_id: state.currentUser.id,
        message: text,
        chat_type: 'multi',
        recipient_ids: state.multiUserSelectedIds,
      }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(`✅ সফলভাবে ${state.multiUserSelectedIds.length} জন নির্বাচিত ইউজারের কাছে মেসেজ পাঠানো হয়েছে!`);
      closeMultiUserModal();
      fetchConversations();
    } else {
      alert(data.error || 'পাঠানো সম্ভব হয়নি।');
    }
  } catch (e) {
    console.error(e);
  }
}

// Mark All Missed As Read
async function markAllNotificationsAsRead() {
  try {
    await fetch(`${API_BASE}/api/notifications/mark-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: state.currentUser.id }),
    });

    state.unreadCount = 0;
    state.unreadNotifications = [];
    state.showNotifDropdown = false;
    fetchConversations();
    render();
  } catch (err) {
    console.error(err);
  }
}

// Reply to message
function setReplyMessage(msg) {
  state.replyingTo = msg;
  renderFooterCompose();
  const inputEl = document.getElementById('chat-input');
  if (inputEl) inputEl.focus();
}

// Pin/Unpin Message (Admin/IT)
async function togglePinMessage(msgId, currentPin) {
  try {
    await fetch(`${API_BASE}/api/messages/${msgId}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: state.currentUser.id,
        is_pinned: !currentPin,
      }),
    });
  } catch (e) {
    console.error(e);
  }
}

// Delete Message (Admin/IT)
async function deleteMessage(msgId) {
  if (!confirm('আপনি কি এই মেসেজটি মুছে ফেলতে চান?')) return;
  try {
    await fetch(`${API_BASE}/api/messages/${msgId}?user_id=${state.currentUser.id}`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.error(e);
  }
}

// Toggle User Can Send (Admin/IT)
async function toggleUserCanSend(userId, currentCanSend) {
  try {
    const res = await fetch(`${API_BASE}/api/users/${userId}/permissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_user_id: state.currentUser.id,
        can_send: !currentCanSend,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      const u = state.users.find(x => x.id === userId);
      if (u) u.can_send = !currentCanSend;
      renderAdminModalBody();
    } else {
      alert(data.error);
    }
  } catch (e) {
    console.error(e);
  }
}

// Change User Role (Admin/IT)
async function changeUserRole(userId, newRole) {
  try {
    const res = await fetch(`${API_BASE}/api/users/${userId}/permissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_user_id: state.currentUser.id,
        role: newRole,
      }),
    });
    if (res.ok) {
      const u = state.users.find(x => x.id === userId);
      if (u) u.role = newRole;
      renderAdminModalBody();
    }
  } catch (e) {
    console.error(e);
  }
}

// Save Group Settings (Admin/IT)
async function saveGroupSettings() {
  const onlyAdmins = document.getElementById('set-only-admins').checked ? '1' : '0';
  const groupName = document.getElementById('set-group-name').value.trim();
  const announcement = document.getElementById('set-announcement').value.trim();

  try {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_user_id: state.currentUser.id,
        settings: {
          only_admins_can_send: onlyAdmins,
          group_name: groupName || state.groupSettings.group_name,
          announcement,
        },
      }),
    });
    if (res.ok) {
      alert('সেটিংস সফলভাবে সংরক্ষিত হয়েছে!');
      state.showAdminModal = false;
      render();
    }
  } catch (e) {
    console.error(e);
  }
}

function scrollToBottom() {
  setTimeout(() => {
    const container = document.getElementById('messages-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, 50);
}

// ─────────────────────────────────────────────
// HTML Rendering Functions
// ─────────────────────────────────────────────

// 1. Render Login Screen
function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-wrapper">
      <div class="login-card">
        <div class="login-logo">💬</div>
        <h2 class="login-title">Paramount Group PChat</h2>
        <p class="login-subtitle">Paramount Insurance Company Ltd. • Group & 1-on-1 Real-Time Chat</p>

        <div id="login-error" class="login-error" style="display: none;"></div>

        <form onsubmit="handleLogin(event)">
          <div class="form-group">
            <label class="form-label">Corporate Email / Username</label>
            <input 
              type="email" 
              id="login-email" 
              class="form-input" 
              placeholder="it01@paramountinsurancebd.com" 
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label">Password</label>
            <input 
              type="password" 
              id="login-password" 
              class="form-input" 
              placeholder="••••••••••••" 
              required
            />
          </div>

          <button type="submit" id="login-btn" class="login-btn">
            লগইন করুন (LOGIN TO GROUP PCHAT)
          </button>
        </form>

        <div class="quick-accounts-box">
          <div class="quick-accounts-title">⚡ ১-ক্লিক টেস্ট একাউন্ট সিলেক্ট করুন:</div>
          <div class="quick-badges">
            <span class="quick-badge" onclick="fillQuickAccount('admin01@paramountinsurancebd.com', 'j-x_4bG);MUzYKj2')">👑 System Admin</span>
            <span class="quick-badge" onclick="fillQuickAccount('it01@paramountinsurancebd.com', 'bJ9xi9$FEWp}FKx?')">💻 IT Dept</span>
            <span class="quick-badge" onclick="fillQuickAccount('accounts01@paramountinsurancebd.com', '4!2lucJvUgdt#j^G')">💰 Accounts</span>
            <span class="quick-badge" onclick="fillQuickAccount('noapara01@paramountinsurancebd.com', 'qq9*Rn^MlPl=?W.t')">🏢 Noapara Branch</span>
            <span class="quick-badge" onclick="fillQuickAccount('gulshan01@paramountinsurancebd.com', '%O{[_AccwUTN(V4X')">🏢 Gulshan Branch</span>
          </div>
        </div>

        <div class="login-footer">
          © 2026 Paramount Insurance Company Ltd. | Designed & Developed by Marzan
        </div>
      </div>
    </div>
  `;
}

// 2. Render Main Chat Interface
function render() {
  if (!state.currentUser) return;
  const app = document.getElementById('app');

  const isAdminOrIt = state.currentUser.role === 'admin' || state.currentUser.role === 'it';
  const onlineCount = state.onlineUserIds.length;
  const isDirect = state.activeChat.type === 'direct';
  const pinnedMessage = (!isDirect) ? state.messages.find(m => m.is_pinned === 1) : null;

  // Group restricted check
  const isGroupLocked = state.groupSettings.only_admins_can_send === '1';
  const isMuted = !state.currentUser.can_send && !isAdminOrIt;
  const cannotSendInGroup = !isDirect && (isMuted || (isGroupLocked && !isAdminOrIt));
  const cannotSendInDirect = isDirect && isMuted;

  // Partner info if in direct chat
  const partnerUser = isDirect ? state.users.find(u => u.id === state.activeChat.partner_id) : null;
  const isPartnerOnline = isDirect && state.onlineUserIds.includes(state.activeChat.partner_id);

  app.innerHTML = `
    <div class="app-container">
      <!-- ────────────────── LEFT SIDEBAR ────────────────── -->
      <div class="sidebar">
        <!-- Sidebar Header -->
        <div class="sidebar-header">
          <div class="user-profile-badge" title="${state.currentUser.email}">
            <div class="avatar online" style="background: ${state.currentUser.avatar_color || '#0284c7'}">
              ${state.currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div class="user-info-text">
              <span class="user-display-name">${escapeHTML(state.currentUser.name)}</span>
              <span class="user-role-pill ${state.currentUser.role}">
                ${state.currentUser.role === 'admin' ? '👑 Admin' : state.currentUser.role === 'it' ? '💻 IT Specialist' : '👤 Member'}
              </span>
            </div>
          </div>

          <div class="sidebar-actions">
            <!-- Notification Bell with Unread Badge -->
            <button class="icon-btn" onclick="toggleNotificationDropdown()" title="Missed & Unread Messages">
              🔔
              ${state.unreadCount > 0 ? `<span class="bell-badge">${state.unreadCount}</span>` : ''}
            </button>

            <!-- Admin / IT Control Panel Button -->
            ${isAdminOrIt ? `
              <button class="icon-btn" onclick="openAdminModal()" title="Admin & IT Control Panel">
                ⚙️
              </button>
            ` : ''}

            <!-- Logout Button -->
            <button class="icon-btn" onclick="handleLogout()" title="লগআউট" style="color: #ef4444;">
              🚪
            </button>

            <!-- Notification Popover Dropdown -->
            ${state.showNotifDropdown ? renderNotificationPopover() : ''}
          </div>
        </div>

        <!-- Quick Action Buttons: Multi-user Message -->
        <div class="quick-action-bar">
          <button class="quick-action-btn" onclick="openMultiUserModal()" title="একাধিক ইউজারকে প্রাইভেট মেসেজ পাঠান">
            👥 মাল্টিপল মেসেজ
          </button>
          <button class="quick-action-btn" onclick="switchSidebarTab('members')" title="নতুন কারও সাথে ১-অন-১ চ্যাট শুরু করুন">
            ➕ নতুন প্রাইভেট চ্যাট
          </button>
        </div>

        <!-- Search Bar -->
        <div class="sidebar-search-box">
          <div class="search-input-wrapper">
            <span>🔍</span>
            <input 
              type="text" 
              class="search-input" 
              placeholder="Search conversation or member..." 
              value="${escapeHTML(state.searchQuery)}"
              oninput="handleSearch(this.value)"
            />
          </div>
        </div>

        <!-- Sidebar Navigation Tabs -->
        <div class="sidebar-tabs">
          <button 
            class="sidebar-tab-btn ${state.activeSidebarTab === 'chats' ? 'active' : ''}" 
            onclick="switchSidebarTab('chats')"
          >
            💬 চ্যাট থ্রেডসমূহ
          </button>
          <button 
            class="sidebar-tab-btn ${state.activeSidebarTab === 'members' ? 'active' : ''}" 
            onclick="switchSidebarTab('members')"
          >
            👥 ৩৩ মেম্বারস ডিরেক্টরি
          </button>
        </div>

        <!-- Sidebar Content List -->
        <div class="sidebar-list">
          ${state.activeSidebarTab === 'chats' ? renderChatsList() : renderMembersList()}
        </div>

        <!-- Sidebar Footer -->
        <div class="sidebar-footer">
          Paramount Group PChat • Developed by <strong>Marzan</strong>
        </div>
      </div>

      <!-- ────────────────── RIGHT CHAT WINDOW ────────────────── -->
      <div class="chat-window">
        <!-- Chat Header -->
        <div class="chat-header">
          <div class="chat-header-left">
            ${isDirect ? `
              <div class="avatar ${isPartnerOnline ? 'online' : ''}" style="background: ${state.activeChat.partner_avatar || '#0284c7'}; width: 44px; height: 44px; font-size: 18px;">
                ${state.activeChat.partner_name.charAt(0).toUpperCase()}
              </div>
              <div class="chat-header-info">
                <span class="chat-header-title">
                  ${escapeHTML(state.activeChat.partner_name)}
                  <span class="user-role-pill ${state.activeChat.partner_role}" style="font-size: 10px; margin-left: 6px;">
                    ${state.activeChat.partner_role === 'admin' ? '👑 Admin' : state.activeChat.partner_role === 'it' ? '💻 IT' : '👤'}
                  </span>
                </span>
                <span class="chat-header-members">
                  <span class="online-dot" style="background: ${isPartnerOnline ? '#22c55e' : '#94a3b8'};"></span>
                  ${isPartnerOnline ? 'Online এখন সক্রিয়' : 'Offline'} • ${escapeHTML(state.activeChat.partner_department || 'Branch')} (${escapeHTML(state.activeChat.partner_email || '')})
                </span>
              </div>
            ` : `
              <div class="group-avatar">PG</div>
              <div class="chat-header-info">
                <span class="chat-header-title">${escapeHTML(state.groupSettings.group_name)}</span>
                <span class="chat-header-members">
                  <span class="online-dot"></span>
                  ৩৩টি ডিপার্টমেন্ট ও ব্রাঞ্চ • ${onlineCount} জন লাইভ একটিভ
                </span>
              </div>
            `}
          </div>

          <div class="chat-header-actions">
            ${isDirect ? `
              <button 
                class="quick-action-btn" 
                onclick="switchChat({ type: 'group', id: 'group', name: state.groupSettings.group_name })"
                title="মূল গ্রুপ চ্যাটে ফিরে যান"
                style="padding: 6px 12px;"
              >
                ← গ্রুপ চ্যাটে যান
              </button>
            ` : ''}

            <button 
              class="icon-btn" 
              onclick="toggleSound()" 
              title="${state.soundEnabled ? 'সাউন্ড অন (Mute Sound)' : 'সাউন্ড অফ (Unmute Sound)'}"
            >
              ${state.soundEnabled ? '🔊' : '🔇'}
            </button>
          </div>
        </div>

        <!-- Pinned Notice Banner (If in Group and Pin exists) -->
        ${pinnedMessage ? `
          <div class="pinned-banner">
            <div>
              <strong>📌 পিন করা নোটিশ:</strong> 
              ${escapeHTML(pinnedMessage.message.substring(0, 110))}...
            </div>
            ${isAdminOrIt ? `
              <button 
                onclick="togglePinMessage(${pinnedMessage.id}, true)" 
                style="background: none; border: none; cursor: pointer; color: #b45309; font-weight: 700;"
              >
                আনপিন করুন ✕
              </button>
            ` : ''}
          </div>
        ` : ''}

        <!-- Messages Feed -->
        <div class="messages-container" id="messages-container">
          ${renderMessages()}
        </div>

        <!-- Typing Indicator Floating Bar -->
        <div class="typing-bar" id="typing-bar"></div>

        <!-- Chat Footer Compose Box -->
        <div class="chat-footer" id="chat-footer">
          ${(cannotSendInGroup || cannotSendInDirect) ? `
            <div class="locked-group-banner">
              🚫 ${isMuted 
                ? 'অ্যাডমিনিস্ট্রেটর আপনার মেসেজ পাঠানোর পারমিশন বন্ধ রেখেছেন।' 
                : 'বর্তমানে শুধুমাত্র অ্যাডমিন ও আইটি সদস্যরা গ্রুপে মেসেজ দিতে পারবেন।'
              }
            </div>
          ` : renderComposeArea(isAdminOrIt, isDirect)}
        </div>
      </div>
    </div>

    <!-- Modals Container -->
    ${state.showAdminModal ? renderAdminModal() : ''}
    ${state.showAudienceModal ? renderAudienceModal() : ''}
    ${state.showMultiUserModal ? renderMultiUserModal() : ''}
  `;

  renderTypingBar();
  bindInputEvents();
}

// 3. Render Chats List (Group + 1-on-1 Direct Chats)
function renderChatsList() {
  const isGroupActive = state.activeChat.type === 'group';
  const groupData = state.conversations.group;
  const directChats = state.conversations.direct_chats || [];

  return `
    <!-- 1. Pinned Main Corporate Group -->
    <div class="chat-section-title">
      <span>📢 কর্পোরেট গ্রুপ চ্যাট</span>
    </div>
    <div 
      class="group-item-card ${isGroupActive ? 'active' : ''}" 
      onclick="switchChat({ type: 'group', id: 'group', name: state.groupSettings.group_name })"
    >
      <div class="group-avatar">PG</div>
      <div class="group-item-details">
        <div class="group-item-header">
          <span class="group-item-title">${escapeHTML(state.groupSettings.group_name)}</span>
          <span class="group-item-time">${groupData && groupData.last_message_time ? formatMessageTime(groupData.last_message_time) : ''}</span>
        </div>
        <div class="group-item-preview">
          <span>${groupData && groupData.last_message ? `${escapeHTML(groupData.last_sender_name || 'Member')}: ${escapeHTML(groupData.last_message.substring(0, 30))}...` : 'কোনো বার্তা নেই'}</span>
          ${groupData && groupData.unread_count > 0 ? `<span class="bell-badge" style="position: static;">${groupData.unread_count}</span>` : ''}
        </div>
      </div>
    </div>

    <!-- 2. Direct 1-on-1 Chats Section -->
    <div class="chat-section-title" style="margin-top: 10px;">
      <span>👤 ব্যক্তিগত চ্যাটসমূহ (${directChats.length})</span>
      <span style="font-size: 10px; cursor: pointer; color: var(--wa-primary-dark);" onclick="switchSidebarTab('members')">
        ➕ নতুন চ্যাট
      </span>
    </div>

    ${directChats.length === 0 ? `
      <div style="padding: 20px 16px; text-align: center; color: #94a3b8; font-size: 12.5px;">
        এখনো কোনো ব্যক্তিগত চ্যাট শুরু করেননি。<br/>
        <button class="quick-action-btn" style="margin: 10px auto 0;" onclick="switchSidebarTab('members')">
          ➕ মেম্বারদের তালিকা থেকে শুরু করুন
        </button>
      </div>
    ` : directChats.map(c => {
      const isChatActive = state.activeChat.type === 'direct' && state.activeChat.partner_id === c.partner_id;
      const isOnline = state.onlineUserIds.includes(c.partner_id);

      return `
        <div 
          class="chat-item-card ${isChatActive ? 'active' : ''}" 
          onclick='switchChat({
            type: "direct",
            id: "direct_${c.partner_id}",
            partner_id: ${c.partner_id},
            partner_name: "${escapeHTML(c.name)}",
            partner_email: "${escapeHTML(c.email)}",
            partner_department: "${escapeHTML(c.department)}",
            partner_role: "${c.role}",
            partner_avatar: "${c.avatar_color}"
          })'
        >
          <div class="avatar ${isOnline ? 'online' : ''}" style="background: ${c.avatar_color || '#0284c7'}; width: 44px; height: 44px; font-size: 16px;">
            ${c.name.charAt(0).toUpperCase()}
          </div>
          <div class="group-item-details">
            <div class="group-item-header">
              <span class="group-item-title">${escapeHTML(c.name)}</span>
              <span class="group-item-time">${c.last_message_time ? formatMessageTime(c.last_message_time) : ''}</span>
            </div>
            <div class="group-item-preview">
              <span>${c.last_message ? escapeHTML(c.last_message.substring(0, 32)) + '...' : '(খালি চ্যাট)'}</span>
              ${c.unread_count > 0 ? `<span class="bell-badge" style="position: static;">${c.unread_count}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

// 4. Render Members List in Sidebar
function renderMembersList() {
  const filtered = state.users.filter(u => 
    u.id !== state.currentUser.id &&
    (u.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
     u.email.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
     u.department.toLowerCase().includes(state.searchQuery.toLowerCase()))
  );

  return `
    <div class="chat-section-title">
      <span>কোম্পানির ৩৩ জন সদস্য (১ ক্লিকে ব্যক্তিগত চ্যাট শুরু করুন)</span>
    </div>
    ${filtered.map(u => {
      const isOnline = state.onlineUserIds.includes(u.id);
      return `
        <div class="member-row" onclick='startDirectChatWithUser(${JSON.stringify(u)})' style="cursor: pointer;">
          <div class="member-left">
            <div class="avatar ${isOnline ? 'online' : ''}" style="background: ${u.avatar_color || '#0284c7'}; width: 38px; height: 38px; font-size: 15px;">
              ${u.name.charAt(0).toUpperCase()}
            </div>
            <div class="member-details">
              <div class="member-name">${escapeHTML(u.name)}</div>
              <div class="member-sub">${escapeHTML(u.department)} • ${u.email}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="user-role-pill ${u.role}">
              ${u.role === 'admin' ? '👑 Admin' : u.role === 'it' ? '💻 IT' : '👤'}
            </span>
            <button class="quick-action-btn" style="padding: 4px 8px; font-size: 11px;">
              💬 চ্যাট
            </button>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

// 5. Render Messages Feed
function renderMessages() {
  const isDirect = state.activeChat.type === 'direct';

  if (state.messages.length === 0) {
    return `
      <div style="text-align: center; padding: 60px 0; color: #8696a0;">
        <div style="font-size: 48px; margin-bottom: 12px;">💬</div>
        <h4 style="margin-bottom: 6px; color: #475569;">
          ${isDirect ? `🔒 ${escapeHTML(state.activeChat.partner_name)}-এর সাথে ব্যক্তিগত চ্যাট` : 'গ্রুপে কোনো বার্তা নেই'}
        </h4>
        <p style="font-size: 13px;">
          ${isDirect ? 'এই কথোপকথনটি সম্পূর্ণ ব্যক্তিগত এবং এনক্রিপ্টেড ডাটাবেসে সংরক্ষিত।' : 'প্রথম মেসেজটি পাঠিয়ে সবার সাথে কথোপকথন শুরু করুন!'}
        </p>
      </div>
    `;
  }

  const filtered = state.searchQuery ? state.messages.filter(m => 
    m.message.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
    m.sender_name.toLowerCase().includes(state.searchQuery.toLowerCase())
  ) : state.messages;

  const isAdminOrIt = state.currentUser.role === 'admin' || state.currentUser.role === 'it';
  let lastDateStr = '';

  return filtered.map(msg => {
    const isOutgoing = msg.sender_id === state.currentUser.id;
    const msgDate = new Date(msg.created_at);
    const dateStr = formatDateDivider(msgDate);
    let dateDividerHtml = '';

    if (dateStr !== lastDateStr) {
      dateDividerHtml = `<div class="date-divider">${dateStr}</div>`;
      lastDateStr = dateStr;
    }

    const hasReply = msg.reply_to_text;
    const isTargeted = msg.target_audience && msg.target_audience !== 'all';
    const isDirectMsg = msg.chat_type === 'direct';

    return `
      ${dateDividerHtml}
      <div class="message-row ${isOutgoing ? 'outgoing' : 'incoming'}" id="msg-${msg.id}">
        <div class="message-bubble">
          <!-- Bubble Hover Action Menu (Reply, Pin, Delete) -->
          <div class="bubble-actions-trigger">
            <button class="bubble-action-btn" onclick='setReplyMessage(${JSON.stringify(msg)})' title="রিপ্লাই দিন (Reply)">
              ↩
            </button>
            ${isAdminOrIt && !isDirectMsg ? `
              <button class="bubble-action-btn" onclick="togglePinMessage(${msg.id}, ${msg.is_pinned === 1})" title="${msg.is_pinned === 1 ? 'আনপিন করুন' : 'পিন করুন'}">
                📌
              </button>
            ` : ''}
            ${isAdminOrIt ? `
              <button class="bubble-action-btn delete" onclick="deleteMessage(${msg.id})" title="ডিলিট করুন">
                🗑️
              </button>
            ` : ''}
          </div>

          <!-- Incoming Sender Name & Badge -->
          ${!isOutgoing ? `
            <div class="message-sender" style="color: ${getColorByDepartment(msg.sender_role)}">
              <span>${escapeHTML(msg.sender_name)}</span>
              ${msg.sender_role === 'admin' ? '<span class="badge-tag admin">👑 Admin</span>' : ''}
              ${msg.sender_role === 'it' ? '<span class="badge-tag it">💻 IT</span>' : ''}
              ${isDirectMsg ? '<span class="badge-tag" style="background: #e0f2fe; color: #0369a1;">🔒 Private</span>' : ''}
            </div>
          ` : ''}

          <!-- Quoted Reply Box -->
          ${hasReply ? `
            <div class="bubble-reply-preview" onclick="scrollToMessage(${msg.reply_to_id})">
              <div class="bubble-reply-sender">${escapeHTML(msg.reply_to_sender || 'Member')}</div>
              <div class="bubble-reply-text">${escapeHTML(msg.reply_to_text)}</div>
            </div>
          ` : ''}

          <!-- Targeted Audience Badge (if Admin sent to specific members in group) -->
          ${isTargeted && !isDirectMsg ? `
            <div class="targeted-badge">
              🔒 নির্দিষ্ট সদস্যদের জন্য
            </div>
          ` : ''}

          <!-- Message Text -->
          <div class="message-text">${formatMessageLinks(escapeHTML(msg.message))}</div>

          <!-- Meta (Time & Checkmarks) -->
          <div class="message-meta">
            <span>${formatMessageTime(msg.created_at)}</span>
            ${isOutgoing ? '<span class="checkmarks">✓✓</span>' : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 6. Render Compose Area
function renderComposeArea(isAdminOrIt, isDirect) {
  const targetLabel = state.targetAudience === 'all' 
    ? '📢 সকল সদস্য (All 33 Users)' 
    : `🔒 নির্দিষ্ট ইউজার (${state.targetAudienceSelectedIds.length} জন নির্বাচিত)`;

  return `
    <!-- Quoted Reply Bar (if active) -->
    ${state.replyingTo ? `
      <div class="reply-preview-bar">
        <div class="reply-preview-text">
          <div class="reply-preview-sender">Replying to ${escapeHTML(state.replyingTo.sender_name)}:</div>
          <div class="reply-preview-snippet">${escapeHTML(state.replyingTo.message)}</div>
        </div>
        <button class="reply-close-btn" onclick="cancelReply()">✕</button>
      </div>
    ` : ''}

    <!-- Admin/IT Audience Control Pill (Only in Group Chat) -->
    ${isAdminOrIt && !isDirect ? `
      <div class="audience-selector-bar">
        <span style="color: #64748b; font-weight: 600;">মেসেজ প্রাপক:</span>
        <button class="audience-pill-btn ${state.targetAudience !== 'all' ? 'active' : ''}" onclick="openAudienceModal()">
          ${targetLabel} ⚙️
        </button>
      </div>
    ` : ''}

    <!-- Chat Input Row -->
    <div class="chat-input-row">
      <textarea 
        id="chat-input" 
        class="chat-textarea" 
        placeholder="${isDirect ? `🔒 ${escapeHTML(state.activeChat.partner_name)}-কে ব্যক্তিগত মেসেজ লিখুন...` : 'একটি গ্রুপ বার্তা লিখুন... (Enter চাপলে সেন্ড হবে)'}"
        rows="1"
      ></textarea>
      <button class="send-btn" onclick="handleSendMessage()" title="Send Message">
        ➤
      </button>
    </div>
  `;
}

// 7. Render Notification Popover Dropdown
function renderNotificationPopover() {
  return `
    <div class="notification-popover">
      <div class="notif-header">
        <h4>🔔 মিস হওয়া নোটিফিকেশন (${state.unreadCount})</h4>
        ${state.unreadCount > 0 ? `
          <button class="mark-all-read-btn" onclick="markAllNotificationsAsRead()">
            সবগুলো পঠিত মার্ক করুন
          </button>
        ` : ''}
      </div>

      <div class="notif-list">
        ${state.unreadNotifications.length === 0 ? `
          <div class="notif-empty">কোনো অপঠিত মেসেজ নেই ✅</div>
        ` : state.unreadNotifications.map(n => `
          <div class="notif-item" onclick="openNotifChat(${JSON.stringify(n).replace(/"/g, '&quot;')})">
            <div class="notif-item-sender">
              <span>${escapeHTML(n.sender_name)} ${n.chat_type === 'direct' ? '<span style="color: #0284c7; font-size: 10px;">[🔒 Direct]</span>' : ''}</span>
              <span class="notif-item-time">${formatMessageTime(n.created_at)}</span>
            </div>
            <div class="notif-item-text">${escapeHTML(n.message)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Open notification message in correct chat
function openNotifChat(notif) {
  state.showNotifDropdown = false;
  if (notif.chat_type === 'direct') {
    const partner = state.users.find(u => u.id === notif.sender_id);
    if (partner) {
      startDirectChatWithUser(partner);
      return;
    }
  }
  switchChat({ type: 'group', id: 'group', name: state.groupSettings.group_name });
}

// 8. Render Admin / IT Control Panel Modal
function renderAdminModal() {
  return `
    <div class="modal-overlay" onclick="if(event.target === this) closeAdminModal()">
      <div class="modal-card">
        <div class="modal-header">
          <h3>⚙️ Admin & IT Management Control Panel</h3>
          <button class="modal-close-btn" onclick="closeAdminModal()">✕</button>
        </div>

        <div class="modal-tabs">
          <button 
            class="modal-tab-btn ${state.adminModalTab === 'permissions' ? 'active' : ''}" 
            onclick="switchAdminTab('permissions')"
          >
            👥 ইউজার পারমিশন (Mute/Unmute)
          </button>
          <button 
            class="modal-tab-btn ${state.adminModalTab === 'settings' ? 'active' : ''}" 
            onclick="switchAdminTab('settings')"
          >
            🔒 গ্রুপ সেটিংস (Group Lock)
          </button>
        </div>

        <div class="modal-body" id="admin-modal-body">
          ${state.adminModalTab === 'permissions' ? renderAdminPermissionsTab() : renderAdminSettingsTab()}
        </div>
      </div>
    </div>
  `;
}

function renderAdminPermissionsTab() {
  return `
    <div style="margin-bottom: 14px;">
      <p style="font-size: 13px; color: #64748b; margin-bottom: 10px;">
        এখানে আপনি ৩৩ জন ইউজারের মেসেজ পাঠানোর ক্ষমতা (Can Send) চালু বা বন্ধ রাখতে পারবেন:
      </p>
      <input 
        type="text" 
        class="form-input" 
        placeholder="Search member..." 
        oninput="filterAdminUsers(this.value)"
      />
    </div>

    <div id="admin-user-list">
      ${state.users.map(u => `
        <div class="perm-user-item">
          <div class="perm-user-left">
            <div class="avatar" style="background: ${u.avatar_color}; width: 34px; height: 34px; font-size: 13px;">
              ${u.name.charAt(0).toUpperCase()}
            </div>
            <div class="perm-user-info">
              <span class="perm-user-name">${escapeHTML(u.name)}</span>
              <span class="perm-user-email">${u.email}</span>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <select 
              onchange="changeUserRole(${u.id}, this.value)" 
              style="padding: 4px 8px; border-radius: 4px; font-size: 12px; border: 1px solid #cbd5e1;"
            >
              <option value="user" ${u.role === 'user' ? 'selected' : ''}>Member</option>
              <option value="it" ${u.role === 'it' ? 'selected' : ''}>IT Dept</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
            </select>

            <label class="switch" title="${u.can_send ? 'মেসেজ দেওয়া চালু আছে (Click to Mute)' : 'মিউট করা আছে (Click to Unmute)'}">
              <input 
                type="checkbox" 
                ${u.can_send ? 'checked' : ''} 
                onchange="toggleUserCanSend(${u.id}, ${u.can_send})"
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderAdminSettingsTab() {
  const isLocked = state.groupSettings.only_admins_can_send === '1';
  return `
    <div>
      <div class="form-group" style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
        <label style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div>
            <div style="font-weight: 700; color: #1e293b; font-size: 14px;">🔒 Only Admins & IT Can Send Messages</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
              এটি অন থাকলে সাধারণ মেম্বাররা কোনো মেসেজ দিতে পারবে না, শুধুমাত্র অ্যাডমিন ও আইটি মেসেজ দিতে পারবে।
            </div>
          </div>
          <input type="checkbox" id="set-only-admins" ${isLocked ? 'checked' : ''} style="width: 20px; height: 20px;" />
        </label>
      </div>

      <div class="form-group">
        <label class="form-label">গ্রুপের নাম (Group Name)</label>
        <input type="text" id="set-group-name" class="form-input" value="${escapeHTML(state.groupSettings.group_name)}" />
      </div>

      <div class="form-group">
        <label class="form-label">গ্রুপ নোটিশ / অ্যানাউন্সমেন্ট (Group Announcement)</label>
        <textarea id="set-announcement" class="form-input" rows="3">${escapeHTML(state.groupSettings.announcement || '')}</textarea>
      </div>

      <button class="login-btn" onclick="saveGroupSettings()">
        💾 সেটিংস সংরক্ষণ করুন (Save Settings)
      </button>
    </div>
  `;
}

// 9. Render Target Audience Modal (Admin/IT Selective Visibility)
function renderAudienceModal() {
  return `
    <div class="modal-overlay" onclick="if(event.target === this) closeAudienceModal()">
      <div class="modal-card" style="max-width: 520px;">
        <div class="modal-header">
          <h3>🔒 মেসেজ দেখার জন্য ইউজার সিলেক্ট করুন</h3>
          <button class="modal-close-btn" onclick="closeAudienceModal()">✕</button>
        </div>

        <div class="modal-body">
          <p style="font-size: 13px; color: #64748b; margin-bottom: 12px;">
            আপনি চাইলে এই মেসেজটি শুধুমাত্র নির্দিষ্ট কিছু ইউজারের কাছে পাঠাতে পারেন। বাকি ইউজাররা এটি দেখতে পাবে না:
          </p>

          <div style="display: flex; gap: 10px; margin-bottom: 12px;">
            <button class="audience-pill-btn" onclick="selectAllAudience(true)">সবার জন্য (All)</button>
            <button class="audience-pill-btn" onclick="selectAllAudience(false)">ক্লিয়ার করুন</button>
          </div>

          <div class="audience-checklist">
            ${state.users.map(u => {
              const isChecked = state.targetAudienceSelectedIds.includes(u.id);
              return `
                <label class="audience-check-item ${isChecked ? 'selected' : ''}">
                  <input 
                    type="checkbox" 
                    value="${u.id}" 
                    ${isChecked ? 'checked' : ''}
                    onchange="toggleAudienceUser(${u.id}, this.checked)"
                  />
                  <span>${escapeHTML(u.name)}</span>
                </label>
              `;
            }).join('')}
          </div>

          <button class="login-btn" style="margin-top: 16px;" onclick="applyAudienceSelection()">
            ✅ নিশ্চিত করুন (Apply Audience)
          </button>
        </div>
      </div>
    </div>
  `;
}

// 10. Render Multi-User Private Message Modal
function renderMultiUserModal() {
  return `
    <div class="modal-overlay" onclick="if(event.target === this) closeMultiUserModal()">
      <div class="modal-card" style="max-width: 560px;">
        <div class="modal-header">
          <h3>👥 মাল্টিপল ইউজার প্রাইভেট মেসেজ ব্রডকাস্ট</h3>
          <button class="modal-close-btn" onclick="closeMultiUserModal()">✕</button>
        </div>

        <div class="modal-body">
          <p style="font-size: 13px; color: #64748b; margin-bottom: 12px;">
            যাদের যাদের কাছে এই বার্তা পাঠাতে চান, তাদের টিক দিন (বাকি ইউজাররা দেখতে পাবে না):
          </p>

          <div class="audience-checklist" style="max-height: 220px;">
            ${state.users.filter(u => u.id !== state.currentUser.id).map(u => {
              const isChecked = state.multiUserSelectedIds.includes(u.id);
              return `
                <label class="audience-check-item ${isChecked ? 'selected' : ''}">
                  <input 
                    type="checkbox" 
                    value="${u.id}" 
                    ${isChecked ? 'checked' : ''}
                    onchange="toggleMultiUser(${u.id}, this.checked)"
                  />
                  <span>${escapeHTML(u.name)}</span>
                </label>
              `;
            }).join('')}
          </div>

          <div class="form-group" style="margin-top: 14px;">
            <label class="form-label">আপনার বার্তা লিখুন:</label>
            <textarea 
              id="multi-message-text" 
              class="form-input" 
              rows="3" 
              placeholder="নির্বাচিত ইউজারদের কাছে এই বার্তাটি সরাসরি চলে যাবে..."
            ></textarea>
          </div>

          <button class="login-btn" onclick="handleSendMultiUserMessage()">
            🚀 নির্বাচিত (${state.multiUserSelectedIds.length} জন) ইউজারের কাছে পাঠান
          </button>
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
// UI Helpers & Event Bindings
// ─────────────────────────────────────────────

function bindInputEvents() {
  const inputEl = document.getElementById('chat-input');
  if (!inputEl) return;

  let typingTimeout = null;

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';

    if (socket) {
      socket.emit('typing', { 
        userId: state.currentUser.id, 
        name: state.currentUser.name, 
        isTyping: true,
        chatType: state.activeChat.type,
        partnerId: state.activeChat.type === 'direct' ? state.activeChat.partner_id : null,
      });

      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emit('typing', { 
          userId: state.currentUser.id, 
          name: state.currentUser.name, 
          isTyping: false,
          chatType: state.activeChat.type,
          partnerId: state.activeChat.type === 'direct' ? state.activeChat.partner_id : null,
        });
      }, 2000);
    }
  });
}

function renderTypingBar() {
  const bar = document.getElementById('typing-bar');
  if (!bar) return;
  if (state.typingUsers.size > 0) {
    const names = Array.from(state.typingUsers.values()).join(', ');
    bar.innerText = `💬 ${names} লিখছেন...`;
  } else {
    bar.innerText = '';
  }
}

function renderHeaderBadges() {
  const badgeEl = document.querySelector('.bell-badge');
  if (badgeEl) {
    if (state.unreadCount > 0) {
      badgeEl.innerText = state.unreadCount;
      badgeEl.style.display = 'block';
    } else {
      badgeEl.style.display = 'none';
    }
  }
}

function renderFooterCompose() {
  const footer = document.getElementById('chat-footer');
  if (!footer) return;
  const isAdminOrIt = state.currentUser.role === 'admin' || state.currentUser.role === 'it';
  const isDirect = state.activeChat.type === 'direct';
  const isGroupLocked = state.groupSettings.only_admins_can_send === '1';
  const isMuted = !state.currentUser.can_send && !isAdminOrIt;
  const cannotSendInGroup = !isDirect && (isMuted || (isGroupLocked && !isAdminOrIt));
  const cannotSendInDirect = isDirect && isMuted;

  if (cannotSendInGroup || cannotSendInDirect) {
    footer.innerHTML = `
      <div class="locked-group-banner">
        🚫 ${isMuted 
          ? 'অ্যাডমিনিস্ট্রেটর আপনার মেসেজ পাঠানোর পারমিশন বন্ধ রেখেছেন।' 
          : 'বর্তমানে শুধুমাত্র অ্যাডমিন ও আইটি সদস্যরা গ্রুপে মেসেজ দিতে পারবেন।'
        }
      </div>
    `;
  } else {
    footer.innerHTML = renderComposeArea(isAdminOrIt, isDirect);
    bindInputEvents();
  }
}

function renderAdminModalBody() {
  const body = document.getElementById('admin-modal-body');
  if (!body) return;
  body.innerHTML = state.adminModalTab === 'permissions' ? renderAdminPermissionsTab() : renderAdminSettingsTab();
}

function toggleNotificationDropdown() {
  state.showNotifDropdown = !state.showNotifDropdown;
  render();
}

function switchSidebarTab(tab) {
  state.activeSidebarTab = tab;
  render();
}

function openAdminModal() {
  state.showAdminModal = true;
  render();
}

function closeAdminModal() {
  state.showAdminModal = false;
  render();
}

function switchAdminTab(tab) {
  state.adminModalTab = tab;
  renderAdminModalBody();
}

function openAudienceModal() {
  state.showAudienceModal = true;
  render();
}

function closeAudienceModal() {
  state.showAudienceModal = false;
  render();
}

function toggleAudienceUser(userId, checked) {
  if (checked) {
    if (!state.targetAudienceSelectedIds.includes(userId)) {
      state.targetAudienceSelectedIds.push(userId);
    }
  } else {
    state.targetAudienceSelectedIds = state.targetAudienceSelectedIds.filter(id => id !== userId);
  }
}

function selectAllAudience(selectAll) {
  if (selectAll) {
    state.targetAudienceSelectedIds = state.users.map(u => u.id);
  } else {
    state.targetAudienceSelectedIds = [];
  }
  const modalBody = document.querySelector('.modal-body');
  if (modalBody) modalBody.parentElement.innerHTML = renderAudienceModal();
}

function applyAudienceSelection() {
  if (state.targetAudienceSelectedIds.length === 0 || state.targetAudienceSelectedIds.length === state.users.length) {
    state.targetAudience = 'all';
  } else {
    state.targetAudience = state.targetAudienceSelectedIds.join(',');
  }
  state.showAudienceModal = false;
  render();
}

// Multi-user modal handlers
function openMultiUserModal() {
  state.showMultiUserModal = true;
  render();
}

function closeMultiUserModal() {
  state.showMultiUserModal = false;
  state.multiUserSelectedIds = [];
  render();
}

function toggleMultiUser(userId, checked) {
  if (checked) {
    if (!state.multiUserSelectedIds.includes(userId)) {
      state.multiUserSelectedIds.push(userId);
    }
  } else {
    state.multiUserSelectedIds = state.multiUserSelectedIds.filter(id => id !== userId);
  }
  const btn = document.querySelector('#app .modal-card button.login-btn');
  if (btn) {
    btn.innerText = `🚀 নির্বাচিত (${state.multiUserSelectedIds.length} জন) ইউজারের কাছে পাঠান`;
  }
}

function cancelReply() {
  state.replyingTo = null;
  renderFooterCompose();
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  render();
}

function handleSearch(val) {
  state.searchQuery = val;
  const container = document.getElementById('messages-container');
  if (container) container.innerHTML = renderMessages();
}

function scrollToMessage(msgId) {
  const el = document.getElementById(`msg-${msgId}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'background 0.3s';
    el.style.background = '#fef08a';
    setTimeout(() => { el.style.background = 'transparent'; }, 1500);
  }
}

// ─────────────────────────────────────────────
// Formatters & Utility Functions
// ─────────────────────────────────────────────
function formatMessageTime(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateDivider(d) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - msgDate) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getColorByDepartment(role) {
  if (role === 'admin') return '#b45309';
  if (role === 'it') return '#0284c7';
  return '#15803d';
}

function formatMessageLinks(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" style="color: #0284c7; text-decoration: underline;">${url}</a>`);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
