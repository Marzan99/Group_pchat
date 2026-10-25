# 📑 Paramount Group PChat — Complete Architecture & Engineering Handover Note
> **Paramount Insurance Company Ltd. • Corporate Real-Time Messaging Platform**  
> **Prepared for:** Future Developers, AI Assistants (ChatGPT, Claude, Gemini), and System Administrators  
> **Lead Developer & System Architect:** Marzan  
> **Repository:** `https://github.com/Marzan99/Group_pchat.git`  
> **Date:** October 2026  

---

## 🎯 Executive Summary

**Paramount Group PChat** is an enterprise-grade, real-time messaging and team collaboration web application designed specifically for **Paramount Insurance Company Ltd.** It mirrors the familiar user experience of modern messaging platforms (WhatsApp Web and Facebook Messenger) while enforcing strict corporate privacy, role-based access control (RBAC), and multi-channel message segregation.

### Core Capabilities:
1. **Central Group Collaboration:** All 33 corporate branches and head office departments can collaborate in an official centralized corporate group.
2. **Strictly Private 1-on-1 Direct Messaging:** Any employee can initiate a direct 1-on-1 conversation with any other colleague. Messages in direct chats are strictly private and query-isolated; only the two communicating parties can see them.
3. **Multi-User Targeted Broadcast:** Users/Admins can select multiple recipients simultaneously and send targeted messages.
4. **Rich Messaging Features:** Quoted message replies (with preview bar), live typing indicators (`... is typing...`), and browser-native audio chime notifications (Web Audio API).
5. **Missed Message / Unread Notification Counter:** Persistent unread message badge count across group and private chats, with a top-bar notification bell and popover preview.
6. **Admin & IT Privilege Suite:** Message pinning/unpinning, message deletion, individual user mute/unmute (`can_send = 0`), and global group lockdown mode (`only_admins_can_send`).
7. **Zero-Configuration Public Deployment:** Automated Cloudflare Tunnel launcher (`tunnel.js`) allowing secure HTTPS access nationwide without requiring a static public IP or router port forwarding.

---

## 🏗️ Technology Stack & Environment

| Component | Technology | Version / Specification |
|---|---|---|
| **Runtime Environment** | Node.js | v18+ (tested on Node v22.12.0) |
| **Backend Framework** | Express.js | ^4.19.2 |
| **Real-Time Engine** | Socket.io | ^4.7.5 (WebSocket + Polling fallback) |
| **Database Engine** | MySQL (MariaDB via XAMPP) | InnoDB engine, `utf8mb4_unicode_ci` |
| **Database Driver** | `mysql2` | Connection Pool (ConnectionLimit: 20) |
| **Frontend Architecture** | Vanilla Modern JavaScript (SPA) | Single-Page Architecture, zero external UI frameworks |
| **Typography & Styling** | Google Fonts + Custom CSS3 | `Plus Jakarta Sans`, `Hind Siliguri`, Flexbox/CSS Grid |
| **Audio Notification** | HTML5 Web Audio API | Synthesized dual-tone melodic chime (no external MP3 needed) |
| **Tunneling / Public Access** | Cloudflare Tunnel (`cloudflared`) | Ephemeral quick tunnels (`trycloudflare.com`) |

---

## 💾 Database Architecture & Data Dictionary (`db.js`)

The database connection pool automatically provisions the database `group_pchat` and all required tables upon initialization.

### Connection Parameters
- **Host:** `localhost:3306`
- **User:** `root`
- **Password:** `""` (default XAMPP setup)
- **Database:** `group_pchat`

### 1. `users` Table
Stores all corporate branch and department accounts with authentication credentials and permissions.
```sql
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(150) NOT NULL,
  department VARCHAR(100) DEFAULT 'General',
  role ENUM('admin', 'it', 'user') DEFAULT 'user',
  can_send TINYINT(1) DEFAULT 1,
  avatar_color VARCHAR(20) DEFAULT '#0284c7',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
* **Pre-seeded Accounts:** 33 pre-configured corporate accounts (e.g., `admin01@paramountinsurancebd.com`, `it01@paramountinsurancebd.com`, `accounts01@paramountinsurancebd.com`, branch accounts).
* **`can_send` (BOOLEAN):** `1` = allowed to send messages, `0` = muted by Admin/IT.

### 2. `messages` Table
Universal message ledger supporting Group, 1-on-1 Direct, and Multi-user broadcasts.
```sql
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chat_type ENUM('group', 'direct', 'multi') DEFAULT 'group',
  recipient_id INT DEFAULT NULL,
  recipient_ids VARCHAR(255) DEFAULT NULL,
  sender_id INT NOT NULL,
  sender_name VARCHAR(150) NOT NULL,
  sender_email VARCHAR(150) NOT NULL,
  sender_role VARCHAR(20) DEFAULT 'user',
  message TEXT NOT NULL,
  reply_to_id INT DEFAULT NULL,
  reply_to_text TEXT DEFAULT NULL,
  reply_to_sender VARCHAR(150) DEFAULT NULL,
  target_audience VARCHAR(255) DEFAULT 'all',
  is_pinned TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(chat_type),
  INDEX(recipient_id),
  INDEX(sender_id),
  INDEX(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
* **`chat_type`:**
  - `'group'`: Central corporate group message.
  - `'direct'`: 1-on-1 private message between `sender_id` and `recipient_id`.
  - `'multi'`: Multi-user broadcast where `recipient_ids` is a comma-delimited list of user IDs.
* **`reply_to_*`:** Captures quoted message context for threaded inline replies.
* **`is_pinned`:** Indicates if a message is pinned at the top of the group chat.

### 3. `message_reads` Table
Tracks read receipts per user per message to compute real-time unread badges.
```sql
CREATE TABLE IF NOT EXISTS message_reads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  message_id INT NOT NULL,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY user_msg (user_id, message_id),
  INDEX(user_id),
  INDEX(message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4. `group_settings` Table
Key-value pair store for runtime group configurations.
```sql
CREATE TABLE IF NOT EXISTS group_settings (
  setting_key VARCHAR(50) PRIMARY KEY,
  setting_value TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
* Keys: `group_name`, `group_description`, `only_admins_can_send`, `announcement`.

---

## 🔌 Backend REST API Specification (`server.js`)

All endpoints accept and return `application/json`.

### Authentication & Users
| Endpoint | Method | Description | Request Body / Query | Success Response |
|---|---|---|---|---|
| `/api/login` | `POST` | Authenticates user credentials, computes initial unread count, returns profile & group settings | `{ "email": "...", "password": "..." }` | `{ success: true, user: {...}, unreadCount: N, settings: {...} }` |
| `/api/users` | `GET` | Returns all 33 accounts with real-time `is_online` status | None | `[ { id, name, email, department, role, can_send, is_online }, ... ]` |

### Conversation & Messaging
| Endpoint | Method | Description | Request Body / Query | Success Response |
|---|---|---|---|---|
| `/api/conversations` | `GET` | Returns conversation sidebar list (Group thread + all active 1-on-1 private chats with snippet and unread count) | `?user_id=X` | `{ group: {...}, direct_chats: [ {...}, ... ] }` |
| `/api/messages` | `GET` | Retrieves messages for selected context (group, direct, or multi) with strict privacy checks | `?user_id=X&chat_type=group\|direct&partner_id=Y` | `[ { id, chat_type, sender_id, message, is_read, ... }, ... ]` |
| `/api/messages` | `POST` | Dispatches a new message, enforces mute and lock restrictions, quotes replies, and triggers socket broadcast | `{ sender_id, message, chat_type, recipient_id, recipient_ids, reply_to_id, target_audience }` | `{ success: true, message: {...} }` |

### Notifications & Read Status
| Endpoint | Method | Description | Request Body / Query | Success Response |
|---|---|---|---|---|
| `/api/notifications/unread` | `GET` | Retrieves up to 20 missed messages for the notification bell dropdown | `?user_id=X` | `{ count: N, unreadMessages: [...] }` |
| `/api/notifications/mark-read` | `POST` | Marks missed messages as read in `message_reads` | `{ user_id, chat_type, partner_id }` | `{ success: true, unreadCount: 0 }` |

### Admin & IT Supervision
| Endpoint | Method | Description | Request Body / Query | Access |
|---|---|---|---|---|
| `/api/messages/:id/pin` | `PATCH` | Pins or unpins a message | `{ user_id, is_pinned: true\|false }` | Admin/IT only |
| `/api/messages/:id` | `DELETE` | Deletes a message for everyone | `?user_id=X` | Admin/IT only |
| `/api/users/:id/permissions` | `PATCH` | Mutes/unmutes user (`can_send`) or updates role | `{ admin_user_id, can_send: 1\|0, role }` | Admin/IT only |
| `/api/settings` | `GET` | Retrieves group configuration | None | Public |
| `/api/settings` | `PATCH` | Updates group name or activates `only_admins_can_send` | `{ admin_user_id, settings: { ... } }` | Admin/IT only |

---

## ⚡ Real-Time WebSocket Protocol (Socket.io)

### Client ➡️ Server Events
1. `user_join`: Emitted immediately upon client login with user profile object `{ id, name, email, role }`. Stores client in `onlineUsers` Map and joins session.
2. `typing`: Broadcasts typing state `{ userId, name, isTyping: true|false, chatType, partnerId }`.

### Server ➡️ Client Events
1. `online_users_updated`: Broadcasts array of active user IDs to all clients whenever someone connects or disconnects.
2. `new_message`: Delivered strictly to authorized clients.
   - For `group`: Delivered to everyone (or targeted sub-audience).
   - For `direct`: Delivered strictly to `sender_id` and `recipient_id`.
3. `unread_count_updated`: Delivered to a user when new messages arrive while they are in another tab or conversation.
4. `direct_conversation_updated`: Promotes the active conversation to the top of the sidebar with fresh preview snippet and timestamp.
5. `user_typing`: Renders live typing indicator in active chat window.
6. `permissions_updated`: Live updates `can_send` status without needing page refresh.
7. `settings_updated`: Broadcasts group lock/name changes to all clients.
8. `message_pinned_updated` & `message_deleted`: Live DOM removal or banner pin update.

---

## 🖥️ Frontend Architecture & UI Components (`public/`)

The frontend is an ultra-fast, zero-dependency SPA with reactive DOM updates:

```
public/
├── index.html        # Clean HTML shell loading Google Fonts and Socket.io client script
├── style.css         # 950+ lines of WhatsApp/Messenger CSS design system (dark/light neutral palette)
└── app.js            # 1,200+ lines SPA application logic, state store, audio chime & event listeners
```

### Key Frontend Modules in `app.js`:
- **State Store (`state`):** Holds `currentUser`, `activeChat` (`{ type: 'group' | 'direct', partner: null }`), `messages`, `users`, `conversations`, `unreadCount`, `replyingTo`, `typingUsers`.
- **Sound Generator (`playNotificationSound()`):** Implements Web Audio API dual-oscillator chime (`587.33 Hz` -> `880.00 Hz`) with exponential gain decay. Works without external audio asset downloads.
- **Message Quoting (`setReplyTarget(msg)`):** Renders floating reply preview banner above message input. Clicking the cross dismisses it.
- **Dynamic Thread Switcher (`selectConversation(id, type, partner)`):** Switches between Central Group and any 1-on-1 private DM with instant read-state synchronization.
- **Modal Dialogs:**
  - **Admin Control Panel Modal:** Manage user mute toggles and group lock settings.
  - **Multi-User Broadcast Modal:** Multi-select recipient checkboxes with live search filter.
  - **Notification Bell Dropdown:** Displays unread message teasers and "Mark all as read" button.

---

## 🚀 Deployment & Operational Runbooks

### Option A: Local Network / Wi-Fi Access
- Start MySQL in XAMPP (Port 3306).
- Double click `start_pchat.bat` (runs `node server.js` and auto-opens `http://localhost:4000`).
- Devices on the same Wi-Fi can access via `http://<HOST_PC_LOCAL_IP>:4000` (e.g., `http://192.168.1.115:4000`).

### Option B: Nationwide Public Access via Cloudflare Tunnel
- Double click `start_public_chat_tunnel.bat`.
- This triggers `node tunnel.js`, which launches `cloudflared.exe`, retrieves a public HTTPS URL (e.g. `https://xxxx.trycloudflare.com`), writes it to `PUBLIC_CHAT_URL.txt`, and automatically opens it in the default browser.
- Anyone in any branch across Bangladesh can open that link on phone or PC and login immediately.

---

## 🛡️ Security & Privacy Guarantees

1. **Query-Level Data Isolation:** Direct messages (`chat_type = 'direct'`) are strictly filtered in SQL. No general user can inspect or intercept private messages sent between other parties.
2. **Role Enforcement:** Administrative routes (`pin`, `delete`, `permissions`, `settings`) verify the requester's role in the database before executing any updates.
3. **Mute Enforcement:** When an account has `can_send = 0`, both the UI disables the send button and the backend rejects `POST /api/messages` with `403 Forbidden`.

---

## 💡 Developer Extension Guide (For Future LLMs / Engineers)

If you are asked to extend this codebase:
1. **Adding File/Attachment Uploads:**
   - Install `multer` (`npm install multer`).
   - Create `public/uploads` directory.
   - Add file upload endpoint `POST /api/upload` returning file URL, and store URL in a new `attachment_url` column in `messages`.
2. **Adding SQLite Fallback:**
   - If MySQL is unavailable on a client machine, `db.js` can be refactored with `better-sqlite3` to allow zero-install database functionality.
3. **Persistent Cloud Domain:**
   - Instead of ephemeral `trycloudflare.com`, configure a named tunnel via Cloudflare Zero Trust Dashboard pointed to `chat.paramountinsurancebd.com`.

---
*© 2026 Paramount Insurance Company Ltd. • Architectural Documentation maintained by Marzan.*
