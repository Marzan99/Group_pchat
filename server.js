const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  },
});

app.use(cors());
app.use(express.json());

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// Online Users Map: userId -> { socketId, name, email, role }
// ─────────────────────────────────────────────
const onlineUsers = new Map();

// Helper: Calculate unread count for a given user
function getUnreadCount(userId, callback) {
  // Visible messages for user minus reads
  const sql = `
    SELECT COUNT(*) as unread_count
    FROM messages m
    WHERE (
      m.target_audience = 'all' 
      OR m.sender_id = ?
      OR FIND_IN_SET(?, m.target_audience) > 0
      OR (SELECT role FROM users WHERE id = ?) IN ('admin', 'it')
    )
    AND m.sender_id != ?
    AND m.id NOT IN (
      SELECT message_id FROM message_reads WHERE user_id = ?
    )
  `;
  db.query(sql, [userId, String(userId), userId, userId, userId], (err, rows) => {
    if (err) {
      console.error('Error calculating unread count:', err);
      return callback(0);
    }
    callback(rows && rows[0] ? rows[0].unread_count : 0);
  });
}

// ─────────────────────────────────────────────
// 1. POST /api/login — ৩3 ইউজারের লগইন
// ─────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'ইমেইল এবং পাসওয়ার্ড আবশ্যক।' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const sql = 'SELECT * FROM users WHERE LOWER(email) = ? AND password = ?';

  db.query(sql, [cleanEmail, password], (err, results) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'ডাটাবেস কানেকশন এরর।' });
    }

    if (!results || results.length === 0) {
      return res.status(401).json({ error: 'ভুল ইমেইল অথবা পাসওয়ার্ড! আপনার সঠিক তথ্য দিন।' });
    }

    const user = results[0];

    getUnreadCount(user.id, (unreadCount) => {
      // Fetch group settings
      db.query('SELECT * FROM group_settings', (sErr, sRows) => {
        const settings = {};
        if (!sErr && sRows) {
          sRows.forEach(r => settings[r.setting_key] = r.setting_value);
        }

        res.json({
          success: true,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            department: user.department,
            role: user.role,
            can_send: user.can_send === 1,
            avatar_color: user.avatar_color,
          },
          unreadCount,
          settings,
        });
      });
    });
  });
});

// ─────────────────────────────────────────────
// 2. GET /api/users — সকল ইউজারদের তালিকা ও অনলাইন স্ট্যাটাস
// ─────────────────────────────────────────────
app.get('/api/users', (req, res) => {
  db.query('SELECT id, name, email, department, role, can_send, avatar_color FROM users ORDER BY id ASC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'ডাটাবেস এরর' });
    }

    const usersWithOnlineStatus = rows.map((u) => ({
      ...u,
      can_send: u.can_send === 1,
      is_online: onlineUsers.has(u.id),
    }));

    res.json(usersWithOnlineStatus);
  });
});

// ─────────────────────────────────────────────
// 3. GET /api/messages — ইউজারের দৃশ্যমান মেসেজসমূহ
// ─────────────────────────────────────────────
app.get('/api/messages', (req, res) => {
  const userId = parseInt(req.query.user_id, 10);

  if (!userId) {
    return res.status(400).json({ error: 'user_id প্যারামিটার প্রয়োজন।' });
  }

  // Check user role
  db.query('SELECT role FROM users WHERE id = ?', [userId], (uErr, uRows) => {
    if (uErr || !uRows || uRows.length === 0) {
      return res.status(404).json({ error: 'ইউজার পাওয়া যায়নি।' });
    }

    const role = uRows[0].role;
    const isAdminOrIt = role === 'admin' || role === 'it';

    let sql = '';
    let params = [];

    if (isAdminOrIt) {
      // Admin / IT can see all messages
      sql = `
        SELECT 
          m.*,
          CASE WHEN r.id IS NOT NULL OR m.sender_id = ? THEN 1 ELSE 0 END AS is_read
        FROM messages m
        LEFT JOIN message_reads r ON r.message_id = m.id AND r.user_id = ?
        ORDER BY m.id ASC
      `;
      params = [userId, userId];
    } else {
      // Regular user sees 'all' or messages targeted to them or sent by them
      sql = `
        SELECT 
          m.*,
          CASE WHEN r.id IS NOT NULL OR m.sender_id = ? THEN 1 ELSE 0 END AS is_read
        FROM messages m
        LEFT JOIN message_reads r ON r.message_id = m.id AND r.user_id = ?
        WHERE (
          m.target_audience = 'all'
          OR m.sender_id = ?
          OR FIND_IN_SET(?, m.target_audience) > 0
        )
        ORDER BY m.id ASC
      `;
      params = [userId, userId, userId, String(userId)];
    }

    db.query(sql, params, (mErr, messages) => {
      if (mErr) {
        console.error('Error fetching messages:', mErr);
        return res.status(500).json({ error: 'মেসেজ লোড করতে সমস্যা হয়েছে।' });
      }

      res.json(messages);
    });
  });
});

// ─────────────────────────────────────────────
// 4. GET /api/notifications/unread — মিস হওয়া নোটিফিকেশন লিস্ট
// ─────────────────────────────────────────────
app.get('/api/notifications/unread', (req, res) => {
  const userId = parseInt(req.query.user_id, 10);
  if (!userId) return res.status(400).json({ error: 'user_id আবশ্যক।' });

  const sql = `
    SELECT 
      m.id, m.sender_id, m.sender_name, m.sender_email, m.sender_role,
      m.message, m.created_at
    FROM messages m
    WHERE (
      m.target_audience = 'all' 
      OR m.sender_id = ?
      OR FIND_IN_SET(?, m.target_audience) > 0
      OR (SELECT role FROM users WHERE id = ?) IN ('admin', 'it')
    )
    AND m.sender_id != ?
    AND m.id NOT IN (
      SELECT message_id FROM message_reads WHERE user_id = ?
    )
    ORDER BY m.id DESC
    LIMIT 15
  `;

  db.query(sql, [userId, String(userId), userId, userId, userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'ডাটাবেস এরর' });
    res.json({
      count: rows.length,
      unreadMessages: rows,
    });
  });
});

// ─────────────────────────────────────────────
// 5. POST /api/notifications/mark-read — সব মেসেজ পঠিত (Read) মার্ক করা
// ─────────────────────────────────────────────
app.post('/api/notifications/mark-read', (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id আবশ্যক।' });

  // Insert read records for all unread visible messages
  const sql = `
    INSERT IGNORE INTO message_reads (user_id, message_id)
    SELECT ?, m.id
    FROM messages m
    WHERE (
      m.target_audience = 'all' 
      OR m.sender_id = ?
      OR FIND_IN_SET(?, m.target_audience) > 0
      OR (SELECT role FROM users WHERE id = ?) IN ('admin', 'it')
    )
    AND m.sender_id != ?
  `;

  db.query(sql, [user_id, String(user_id), user_id, user_id], (err) => {
    if (err) {
      console.error('Error marking as read:', err);
      return res.status(500).json({ error: 'ব্যর্থ হয়েছে' });
    }
    res.json({ success: true, unreadCount: 0 });
  });
});

// ─────────────────────────────────────────────
// 6. POST /api/messages — মেসেজ পাঠানো (HTTP API)
// ─────────────────────────────────────────────
app.post('/api/messages', (req, res) => {
  const { sender_id, message, reply_to_id, target_audience } = req.body;

  if (!sender_id || !message || !message.trim()) {
    return res.status(400).json({ error: 'মেসেজ এবং প্রেরকের তথ্য আবশ্যক।' });
  }

  // Check sender permissions
  db.query('SELECT * FROM users WHERE id = ?', [sender_id], (uErr, uRows) => {
    if (uErr || !uRows || uRows.length === 0) {
      return res.status(404).json({ error: 'প্রেরক পাওয়া যায়নি।' });
    }

    const user = uRows[0];
    const isAdminOrIt = user.role === 'admin' || user.role === 'it';

    // Permission Check 1: User level muted
    if (user.can_send !== 1 && !isAdminOrIt) {
      return res.status(403).json({ error: 'অ্যাডমিনিস্ট্রেটর আপনার মেসেজ পাঠানোর সুবিধা সাময়িকভাবে বন্ধ রেখেছেন।' });
    }

    // Permission Check 2: Group locked (Only admins can send)
    db.query("SELECT setting_value FROM group_settings WHERE setting_key = 'only_admins_can_send'", (sErr, sRows) => {
      const onlyAdmins = sRows && sRows[0] && sRows[0].setting_value === '1';
      if (onlyAdmins && !isAdminOrIt) {
        return res.status(403).json({ error: 'বর্তমানে শুধুমাত্র অ্যাডমিন ও আইটি সদস্যরা গ্রুপে মেসেজ দিতে পারবেন।' });
      }

      // Check target audience permissions (Only Admin/IT can selectively target audience)
      const audience = (isAdminOrIt && target_audience) ? target_audience : 'all';

      // Reply handling
      let replyToText = null;
      let replyToSender = null;

      const proceedInsert = () => {
        const insertSql = `
          INSERT INTO messages (
            sender_id, sender_name, sender_email, sender_role, 
            message, reply_to_id, reply_to_text, reply_to_sender, target_audience
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(insertSql, [
          user.id, user.name, user.email, user.role,
          message.trim(), reply_to_id || null, replyToText, replyToSender, audience
        ], (iErr, result) => {
          if (iErr) {
            console.error('Error saving message:', iErr);
            return res.status(500).json({ error: 'মেসেজ সেভ করতে সমস্যা হয়েছে।' });
          }

          const messageId = result.insertId;

          // Automatically mark as read for sender
          db.query('INSERT IGNORE INTO message_reads (user_id, message_id) VALUES (?, ?)', [user.id, messageId], () => {});

          const fullMessage = {
            id: messageId,
            sender_id: user.id,
            sender_name: user.name,
            sender_email: user.email,
            sender_role: user.role,
            message: message.trim(),
            reply_to_id: reply_to_id || null,
            reply_to_text: replyToText,
            reply_to_sender: replyToSender,
            target_audience: audience,
            is_pinned: 0,
            created_at: new Date(),
            is_read: 1,
          };

          // Broadcast via Socket.io to appropriate users
          broadcastNewMessage(fullMessage);

          res.json({ success: true, message: fullMessage });
        });
      };

      if (reply_to_id) {
        db.query('SELECT message, sender_name FROM messages WHERE id = ?', [reply_to_id], (rErr, rRows) => {
          if (!rErr && rRows && rRows.length > 0) {
            replyToText = rRows[0].message;
            replyToSender = rRows[0].sender_name;
          }
          proceedInsert();
        });
      } else {
        proceedInsert();
      }
    });
  });
});

// Helper: Broadcast message via Socket.io with audience filtering
function broadcastNewMessage(message) {
  io.sockets.sockets.forEach((sock) => {
    const sockUser = sock.userData;
    if (!sockUser) return;

    let canSee = false;
    if (sockUser.role === 'admin' || sockUser.role === 'it') {
      canSee = true;
    } else if (message.target_audience === 'all') {
      canSee = true;
    } else if (message.sender_id === sockUser.id) {
      canSee = true;
    } else if (message.target_audience) {
      const targets = message.target_audience.split(',').map(s => parseInt(s.trim(), 10));
      if (targets.includes(sockUser.id)) {
        canSee = true;
      }
    }

    if (canSee) {
      sock.emit('new_message', {
        ...message,
        is_read: sockUser.id === message.sender_id ? 1 : 0,
      });

      // Update unread count for the receiver
      if (sockUser.id !== message.sender_id) {
        getUnreadCount(sockUser.id, (count) => {
          sock.emit('unread_count_updated', { unreadCount: count });
        });
      }
    }
  });
}

// ─────────────────────────────────────────────
// 7. PATCH /api/messages/:id/pin — পিন বা আনপিন করা (Admin/IT only)
// ─────────────────────────────────────────────
app.patch('/api/messages/:id/pin', (req, res) => {
  const messageId = req.params.id;
  const { user_id, is_pinned } = req.body;

  db.query('SELECT role FROM users WHERE id = ?', [user_id], (uErr, uRows) => {
    if (uErr || !uRows || (uRows[0].role !== 'admin' && uRows[0].role !== 'it')) {
      return res.status(403).json({ error: 'শুধুমাত্র অ্যাডমিন ও আইটি সদস্যরা মেসেজ পিন করতে পারবেন।' });
    }

    const pinVal = is_pinned ? 1 : 0;
    db.query('UPDATE messages SET is_pinned = ? WHERE id = ?', [pinVal, messageId], (err) => {
      if (err) return res.status(500).json({ error: 'ডাটাবেস এরর' });
      io.emit('message_pinned_updated', { messageId: parseInt(messageId, 10), is_pinned: pinVal });
      res.json({ success: true, is_pinned: pinVal });
    });
  });
});

// ─────────────────────────────────────────────
// 8. DELETE /api/messages/:id — মেসেজ মুছে ফেলা (Admin/IT only)
// ─────────────────────────────────────────────
app.delete('/api/messages/:id', (req, res) => {
  const messageId = req.params.id;
  const userId = parseInt(req.query.user_id, 10);

  db.query('SELECT role FROM users WHERE id = ?', [userId], (uErr, uRows) => {
    if (uErr || !uRows || (uRows[0].role !== 'admin' && uRows[0].role !== 'it')) {
      return res.status(403).json({ error: 'শুধুমাত্র অ্যাডমিন ও আইটি সদস্যরা মেসেজ ডিলিট করতে পারবেন।' });
    }

    db.query('DELETE FROM message_reads WHERE message_id = ?', [messageId], () => {});
    db.query('DELETE FROM messages WHERE id = ?', [messageId], (err) => {
      if (err) return res.status(500).json({ error: 'ডিলিট করতে সমস্যা হয়েছে।' });
      io.emit('message_deleted', { messageId: parseInt(messageId, 10) });
      res.json({ success: true, message: 'মেসেজ মুছে ফেলা হয়েছে।' });
    });
  });
});

// ─────────────────────────────────────────────
// 9. PATCH /api/users/:id/permissions — ইউজার পারমিশন কন্ট্রোল (Mute/Unmute)
// ─────────────────────────────────────────────
app.patch('/api/users/:id/permissions', (req, res) => {
  const targetUserId = req.params.id;
  const { admin_user_id, can_send, role } = req.body;

  db.query('SELECT role FROM users WHERE id = ?', [admin_user_id], (uErr, uRows) => {
    if (uErr || !uRows || (uRows[0].role !== 'admin' && uRows[0].role !== 'it')) {
      return res.status(403).json({ error: 'অনুমতি নেই। শুধুমাত্র অ্যাডমিন ও আইটি সদস্যরাই পারমিশন পরিবর্তন করতে পারবেন।' });
    }

    const updates = [];
    const values = [];

    if (can_send !== undefined) {
      updates.push('can_send = ?');
      values.push(can_send ? 1 : 0);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'কোনো পরিবর্তন দেওয়া হয়নি।' });
    }

    values.push(targetUserId);
    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

    db.query(sql, values, (err) => {
      if (err) return res.status(500).json({ error: 'আপডেট এরর' });

      // Notify all clients in real-time
      io.emit('permissions_updated', {
        userId: parseInt(targetUserId, 10),
        can_send: can_send !== undefined ? (can_send ? true : false) : undefined,
        role,
      });

      res.json({ success: true, message: 'ইউজারের পারমিশন সফলভাবে আপডেট করা হয়েছে।' });
    });
  });
});

// ─────────────────────────────────────────────
// 10. GET & PATCH /api/settings — গ্রুপ সেটিংস (Admin/IT only for PATCH)
// ─────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  db.query('SELECT * FROM group_settings', (err, rows) => {
    if (err) return res.status(500).json({ error: 'ডাটাবেস এরর' });
    const settings = {};
    rows.forEach(r => settings[r.setting_key] = r.setting_value);
    res.json(settings);
  });
});

app.patch('/api/settings', (req, res) => {
  const { admin_user_id, settings } = req.body;

  db.query('SELECT role FROM users WHERE id = ?', [admin_user_id], (uErr, uRows) => {
    if (uErr || !uRows || (uRows[0].role !== 'admin' && uRows[0].role !== 'it')) {
      return res.status(403).json({ error: 'শুধুমাত্র অ্যাডমিন ও আইটি সদস্যরা গ্রুপ সেটিংস পরিবর্তন করতে পারবেন।' });
    }

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'অবৈধ সেটিংস ডাটা।' });
    }

    const promises = Object.entries(settings).map(([k, v]) => {
      return new Promise((resolve) => {
        db.query(
          'INSERT INTO group_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
          [k, String(v), String(v)],
          () => resolve()
        );
      });
    });

    Promise.all(promises).then(() => {
      io.emit('settings_updated', settings);
      res.json({ success: true, settings });
    });
  });
});

// ─────────────────────────────────────────────
// Socket.io Real-Time Event Handlers
// ─────────────────────────────────────────────
io.on('connection', (socket) => {
  // When a user authenticates & joins
  socket.on('user_join', (user) => {
    if (!user || !user.id) return;

    socket.userData = user;
    onlineUsers.set(user.id, {
      socketId: socket.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    // Broadcast updated online list to everyone
    io.emit('online_users_updated', Array.from(onlineUsers.keys()));

    // Send current unread count to this user
    getUnreadCount(user.id, (count) => {
      socket.emit('unread_count_updated', { unreadCount: count });
    });
  });

  // Typing indicator
  socket.on('typing', ({ userId, name, isTyping }) => {
    socket.broadcast.emit('user_typing', { userId, name, isTyping });
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.userData && socket.userData.id) {
      onlineUsers.delete(socket.userData.id);
      io.emit('online_users_updated', Array.from(onlineUsers.keys()));
    }
  });
});

// Fallback: Serve index.html for single-page app routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Paramount Group PChat server is running on http://localhost:${PORT}`);
});
