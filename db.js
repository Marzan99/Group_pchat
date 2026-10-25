const mysql = require('mysql2');

// Initial connection to ensure group_pchat database exists
const rootConnection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
});

rootConnection.query(
  'CREATE DATABASE IF NOT EXISTS group_pchat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  (err) => {
    if (err) {
      console.error('❌ Failed to create database group_pchat:', err.message);
    } else {
      console.log('✅ MySQL Database "group_pchat" is verified & ready.');
      initializeTables();
    }
    rootConnection.end();
  }
);

// Connection pool targeting group_pchat database
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'group_pchat',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
});

const corporateUsers = [
  { id: 1, name: "Accounts Department", email: "accounts01@paramountinsurancebd.com", password: "4!2lucJvUgdt#j^G", department: "Accounts", role: "user" },
  { id: 2, name: "System Administrator", email: "admin01@paramountinsurancebd.com", password: "j-x_4bG);MUzYKj2", department: "Administration", role: "admin" },
  { id: 3, name: "Agrabad Branch", email: "agrabad01@paramountinsurancebd.com", password: "Z.fk*pmW7!+PMvSx", department: "Branch", role: "user" },
  { id: 4, name: "Arif (Executive)", email: "arif01@paramountinsurancebd.com", password: "l$Dia[._N7JMNkv3", department: "Executive", role: "user" },
  { id: 5, name: "Bogura Branch", email: "bogura01@paramountinsurancebd.com", password: "fhPqMdw%]&3RTn^C", department: "Branch", role: "user" },
  { id: 6, name: "Chief Executive Officer (CEO)", email: "ceo01@paramountinsurancebd.com", password: "Ds7?p[(Tou)[.Pfv", department: "Executive", role: "user" },
  { id: 7, name: "Chairman", email: "chairman01@paramountinsurancebd.com", password: "UH5i+JKsuyYm=c9v", department: "Executive", role: "user" },
  { id: 8, name: "Claims Department", email: "claims01@paramountinsurancebd.com", password: "@VM#iIM]n_T7?1mT", department: "Claims", role: "user" },
  { id: 9, name: "Company Secretary (CS)", email: "cs01@paramountinsurancebd.com", password: "96L*t+sG0j?2cH&]", department: "Executive", role: "user" },
  { id: 10, name: "Cumilla Branch", email: "cumilla01@paramountinsurancebd.com", password: "kQYLK*rc6{rZRWjl[", department: "Branch", role: "user" },
  { id: 11, name: "Dinajpur Branch", email: "dinajpur01@paramountinsurancebd.com", password: "X)~Bwi7(*qihaL?H", department: "Branch", role: "user" },
  { id: 12, name: "Esoft Test", email: "esofttest01@paramountinsurancebd.com", password: "esoft@2026!", department: "Testing", role: "user" },
  { id: 13, name: "Gulshan Branch", email: "gulshan01@paramountinsurancebd.com", password: "%O{[_AccwUTN(V4X", department: "Branch", role: "user" },
  { id: 14, name: "Imrul (Executive)", email: "imrul01@paramountinsurancebd.com", password: "Lo@OE}5.%HlgeaB,x", department: "Executive", role: "user" },
  { id: 15, name: "Info Desk", email: "info01@paramountinsurancebd.com", password: "WqKbk?QXCm%H8fGwT", department: "Support", role: "user" },
  { id: 16, name: "Internal Audit Department", email: "internalaudit01@paramountinsurancebd.com", password: "=zxxYK&#Z+]4LcTpl", department: "Audit", role: "user" },
  { id: 17, name: "IT Department", email: "it01@paramountinsurancebd.com", password: "bJ9xi9$FEWp}FKx?", department: "Information Technology", role: "it" },
  { id: 18, name: "Jashore Branch", email: "jashore01@paramountinsurancebd.com", password: "0BBtv4Put297EXf(", department: "Branch", role: "user" },
  { id: 19, name: "Kawranbazar Branch", email: "kawranbazar01@paramountinsurancebd.com", password: "PY@In[7]=)0e&G*h@", department: "Branch", role: "user" },
  { id: 20, name: "Khulna Branch", email: "khulna01@paramountinsurancebd.com", password: ")q3;]];Nxwpeym2o", department: "Branch", role: "user" },
  { id: 21, name: "Kushtia Branch", email: "kushtia01@paramountinsurancebd.com", password: "hd}Z!168L.K)xbAI", department: "Branch", role: "user" },
  { id: 22, name: "Meherpur Branch", email: "meherpur01@paramountinsurancebd.com", password: "3hI*Fo8]0?X6N)uG", department: "Branch", role: "user" },
  { id: 23, name: "Motijheel Branch", email: "motijheel01@paramountinsurancebd.com", password: "YB+1ZQoK8DlbSi^o", department: "Branch", role: "user" },
  { id: 24, name: "Naogaon Branch", email: "naogaon01@paramountinsurancebd.com", password: "E6ST91sK2r2StFAk", department: "Branch", role: "user" },
  { id: 25, name: "Noapara Branch", email: "noapara01@paramountinsurancebd.com", password: "qq9*Rn^MlPl=?W.t", department: "Branch", role: "user" },
  { id: 26, name: "Principal Branch", email: "principal01@paramountinsurancebd.com", password: "H?K32h=s10cgNBkS", department: "Branch", role: "user" },
  { id: 27, name: "Rangpur Branch", email: "rangpur01@paramountinsurancebd.com", password: "$@b,n2L*=YhUX80_", department: "Branch", role: "user" },
  { id: 28, name: "Reinsurance Department", email: "reinsurance01@paramountinsurancebd.com", password: "b}3NsgxHFW]c{I3O", department: "Reinsurance", role: "user" },
  { id: 29, name: "Shamiur (Executive)", email: "shamiur01@paramountinsurancebd.com", password: "i%d.QnP,D)54F.}4", department: "Executive", role: "user" },
  { id: 30, name: "Share Department", email: "share01@paramountinsurancebd.com", password: "crXu+d4epZ{ymf#z", department: "Share", role: "user" },
  { id: 31, name: "Test Account", email: "test01@paramountinsurancebd.com", password: "test@2026!", department: "Testing", role: "user" },
  { id: 32, name: "Underwriting Department", email: "underwriting01@paramountinsurancebd.com", password: "&J+^;X1EguC7B&C{", department: "Underwriting", role: "user" },
  { id: 33, name: "Zharna (Executive)", email: "zharna01@paramountinsurancebd.com", password: "GS3@8=PFRGWYAwqg", department: "Executive", role: "user" }
];

const avatarColors = [
  '#0284c7', '#0d9488', '#16a34a', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#2563eb', '#4f46e5', '#0891b2'
];

function initializeTables() {
  // 1. Users Table
  pool.query(`
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `, (err) => {
    if (err) console.error("Error creating users table:", err);
    else seedUsers();
  });

  // 2. Messages Table
  pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
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
      INDEX(sender_id),
      INDEX(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `, (err) => {
    if (err) console.error("Error creating messages table:", err);
    else seedWelcomeMessage();
  });

  // 3. Message Reads Table (for missed/unread notification counter)
  pool.query(`
    CREATE TABLE IF NOT EXISTS message_reads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      message_id INT NOT NULL,
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY user_msg (user_id, message_id),
      INDEX(user_id),
      INDEX(message_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `, (err) => {
    if (err) console.error("Error creating message_reads table:", err);
  });

  // 4. Group Settings Table
  pool.query(`
    CREATE TABLE IF NOT EXISTS group_settings (
      setting_key VARCHAR(50) PRIMARY KEY,
      setting_value TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `, (err) => {
    if (err) console.error("Error creating group_settings table:", err);
    else seedGroupSettings();
  });
}

function seedUsers() {
  pool.query('SELECT COUNT(*) as cnt FROM users', (err, rows) => {
    if (!err && rows && rows[0].cnt === 0) {
      console.log('🌱 Seeding 33 Paramount Corporate Users into group_pchat...');
      const sql = 'INSERT INTO users (id, name, email, password, department, role, can_send, avatar_color) VALUES ?';
      const values = corporateUsers.map((u, idx) => [
        u.id,
        u.name,
        u.email,
        u.password,
        u.department,
        u.role,
        1, // can_send = 1 (default can send)
        avatarColors[idx % avatarColors.length]
      ]);

      pool.query(sql, [values], (insertErr) => {
        if (insertErr) console.error('Error seeding users:', insertErr);
        else console.log('✅ Successfully seeded 33 users into group_pchat database!');
      });
    }
  });
}

function seedGroupSettings() {
  const defaultSettings = [
    ['group_name', 'Paramount Corporate Group'],
    ['group_description', 'Official real-time group chat for Paramount Insurance Company Ltd. All 33 departments and branches.'],
    ['only_admins_can_send', '0'],
    ['announcement', '📢 স্বাগতম Paramount Group Chat-এ! এখানে সকল ডিপার্টমেন্ট ও ব্রাঞ্চের ইউজাররা রিয়েল-টাইম আলোচনা করতে পারবেন।']
  ];

  defaultSettings.forEach(([key, val]) => {
    pool.query(
      'INSERT IGNORE INTO group_settings (setting_key, setting_value) VALUES (?, ?)',
      [key, val],
      () => {}
    );
  });
}

function seedWelcomeMessage() {
  pool.query('SELECT COUNT(*) as cnt FROM messages', (err, rows) => {
    if (!err && rows && rows[0].cnt === 0) {
      pool.query(`
        INSERT INTO messages (sender_id, sender_name, sender_email, sender_role, message, target_audience, is_pinned)
        VALUES (
          2,
          'System Administrator',
          'admin01@paramountinsurancebd.com',
          'admin',
          'স্বাগতম Paramount Group Chat সিস্টেমে! 🎉\\n\\nএটি কোম্পানির একটি সেন্ট্রাল গ্রুপ চ্যাট প্ল্যাটফর্ম যেখানে ৩৩টি ডিপার্টমেন্ট এবং শাখা একসাথে মেসেজ পাঠাতে পারবে, একে অপরের মেসেজের রিপ্লাই দিতে পারবে। মিস হওয়া মেসেজগুলোর জন্য নোটিফিকেশন বেল চালু রয়েছে।\\n\\nঅ্যাডমিন ও আইটি ডিপার্টমেন্টের সদস্যরা এখান থেকে রোল এবং পারমিশন নিয়ন্ত্রণ করতে পারবেন।',
          'all',
          1
        )
      `, () => {
        console.log('✅ Welcome message seeded.');
      });
    }
  });
}

module.exports = pool;
