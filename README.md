# 💬 Paramount Group PChat

> **Paramount Insurance Company Ltd. • Corporate Real-Time Messaging & Collaboration Platform**  
> *Designed & Developed by Marzan*

---

## 🌟 Overview
**Paramount Group PChat** হলো একটি এন্টারপ্রাইজ রিয়েল-টাইম গ্রুপ মেসেজিং প্ল্যাটফর্ম (WhatsApp এবং Facebook Messenger স্টাইলে তৈরি)। এখানে ডাটাবেজে থাকা সকল ৩৩টি ডিপার্টমেন্ট ও শাখার ইউজাররা একসাথে গ্রুপে কথোপকথন করতে পারেন, রিপ্লাই দিতে পারেন এবং মিস হওয়া মেসেজগুলোর জন্য নোটিফিকেশন বেল দেখতে পারেন।

সিস্টেমটিতে অ্যাডমিন ও আইটি ডিপার্টমেন্টের জন্য পূর্ণাঙ্গ **Role-Based Access Control (RBAC)** এবং **Privilege Management** সুবিধা রয়েছে।

---

## 🚀 মূল সুবিধাসমূহ (Key Features)

### ১. রিয়েল-টাইম গ্রুপ ও ১-অন-১ প্রাইভেট চ্যাট (WhatsApp / Messenger Style)
* **কর্পোরেট গ্রুপ চ্যাট:** ৩৩টি ডিপার্টমেন্ট একসাথে কোম্পানির সেন্ট্রাল গ্রুপে আলোচনা করতে পারবে।
* **১-অন-১ ব্যক্তিগত চ্যাট (Direct 1-on-1 Messaging):** যেকোনো ইউজার চাইলে মেম্বার তালিকা থেকে অন্য যেকোনো ইউজারকে সিলেক্ট করে সম্পূর্ণ আলাদা ব্যক্তিগত ও গোপনীয় চ্যাট করতে পারবে (যা অন্য কোনো সাধারণ ইউজার দেখতে পাবে না)।
* **মাল্টিপল ইউজার প্রাইভেট মেসেজ:** একাধিক নির্দিষ্ট ইউজারদের টিক দিয়ে তাদের কাছে এক ক্লিকে সরাসরি গোপন বার্তা পাঠানোর সুবিধা।
* **কোটেড রিপ্লাই (Quoted Reply Preview):** যেকোনো মেসেজে রিপ্লাই বাটনে ক্লিক করলে তা মেসেঞ্জারের মতো কোট হয়ে ইনপুটে চলে আসে।
* **টাইপিং ইন্ডিকেটর:** কে টাইপ করছেন ("... is typing...") তা লাইভ দেখতে পাওয়া যায়।
* **অডিও নোটিফিকেশন:** নতুন মেসেজ আসলে মিষ্টি নোটিফিকেশন চিম (Chime) বেজে ওঠে (Web Audio API)।
* **সারা দেশ থেকে পাবলিক এক্সেস (Cloudflare Tunnel):** `start_public_chat_tunnel.bat` ফাইলে ১-ক্লিকেই সারা দেশ থেকে সিকিউর পাবলিক HTTPS লিংকের মাধ্যমে যেকোনো ডিভাইস থেকে লগইন করা যায়।

### ২. অ্যাডমিন ও আইটি প্রিভিলেজ কন্ট্রোল (Admin & IT Super-Powers)
* **ইউজার মিউট/আনমিউট (Mute / Unmute):** অ্যাডমিন বা আইটি চাইলে যেকোনো ইউজারের মেসেজ পাঠানোর পারমিশন (`can_send`) বন্ধ বা চালু করতে পারেন।
* **টার্গেটেড অডিয়েন্স (Selective Message Visibility):** অ্যাডমিন মেসেজ পাঠানোর সময় সিলেক্ট করতে পারেন মেসেজটি সবার জন্য (All) যাবে নাকি শুধুমাত্র নির্দিষ্ট কিছু ইউজারদের জন্য (Selected Users Only)।
* **গ্রুপ লক মোড (Only Admins Can Send):** জরুরি প্রয়োজনে সম্পূর্ণ গ্রুপে সাধারণ ইউজারদের মেসেজ দেওয়া বন্ধ করে শুধুমাত্র অ্যাডমিনদের নোটিশ দেওয়ার ব্যবস্থা।
* **পিন করা নোটিশ (Pin Notice):** যেকোনো গুরুত্বপূর্ণ মেসেজকে চ্যাটের শীর্ষে পিন করে রাখা যায়।
* **মেসেজ ডিলিট:** অনুপযুক্ত মেসেজ ডিলিট করার ক্ষমতা।

### ৩. মিসড মেসেজ ও নোটিফিকেশন বেল (Unread Badge)
* ইউজার যখনই লগইন করবেন, সে দূরে থাকা অবস্থায় কতটি নতুন মেসেজ মিস করেছে তা টপ বারের **🔔 নোটিফিকেশন বেলের** উপর লাল ব্যাজে (`🔴 5`) ফুটে উঠবে।
* বেল আইকনে ক্লিক করলে পপওভারে মিস হওয়া মেসেজগুলোর প্রিভিউ এবং "Mark all as read" অপশন পাওয়া যাবে।

### ৪. ৩৩টি কর্পোরেট অ্যাকাউন্ট প্রি-কনফিগারেশন
কোম্পানির ৩৩টি ডিপার্টমেন্ট ও ব্রাঞ্চের (Head Office, Branches, Executives) সবকটি অ্যাকাউন্ট ডিফল্ট ডাটাবেসে সেট করা আছে।

---

## 🛠️ প্রযুক্তি স্ট্যাক (Tech Stack)
* **ব্যাকএন্ড:** Node.js, Express, Socket.io
* **ডাটাবেস:** MySQL (Database: `group_pchat`, Engine: InnoDB, Charset: `utf8mb4`)
* **ফ্রন্টএন্ড:** HTML5, CSS3, Modern JavaScript (SPA), Web Audio API
* **রিয়েল-টাইম:** WebSocket via Socket.io

---

## 💻 কীভাবে রান করবেন (How to Run)

### ধাপ ১: রিপোজিটরি ক্লোন করুন
```bash
git clone https://github.com/Marzan99/Group_pchat.git
cd Group_pchat
```

### ধাপ ২: ডিপেন্ডেন্সি ইনস্টল করুন
```bash
npm install
```

### ধাপ ৩: MySQL চালু করুন
XAMPP Control Panel থেকে MySQL (Port 3306) চালু রাখুন।

### ধাপ ৪: সার্ভার চালু করুন
```bash
node server.js
```
*অথবা উইন্ডোজে সরাসরি `start_pchat.bat` ফাইলে ডাবল-ক্লিক করুন।*

### ধাপ ৫: ব্রাউজারে প্রবেশ করুন
যেকোনো ব্রাউজারে যান:
👉 **http://localhost:4000**

---

## 🔑 টেস্ট লগইন অ্যাকাউন্টস

| Role | Email | Password |
|---|---|---|
| **System Admin** | `admin01@paramountinsurancebd.com` | `j-x_4bG);MUzYKj2` |
| **IT Specialist** | `it01@paramountinsurancebd.com` | `bJ9xi9$FEWp}FKx?` |
| **Accounts Dept** | `accounts01@paramountinsurancebd.com` | `4!2lucJvUgdt#j^G` |
| **Noapara Branch** | `noapara01@paramountinsurancebd.com` | `qq9*Rn^MlPl=?W.t` |
| **Gulshan Branch** | `gulshan01@paramountinsurancebd.com` | `%O{[_AccwUTN(V4X` |

---

## 📄 লাইসেন্স ও কপিরাইট
© 2026 Paramount Insurance Company Ltd. | Designed & Developed by **Marzan**
