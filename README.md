# 🎵 SongFinder Pro - Advanced Audio Recognition System

> **Audio Fingerprint Matcher untuk TikTok & Media dengan Multi-Role Access Control**

![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Version](https://img.shields.io/badge/Version-2.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📌 Overview

**SongFinder Pro** adalah sistem pengenalan lagu canggih yang menggunakan **audio fingerprinting** untuk mengidentifikasi musik dari video TikTok dan file audio. Sistem ini dilengkapi dengan:

- ✅ **Ekstraksi audio real-time** dari TikTok video
- ✅ **Multi-sample recognition** untuk akurasi tinggi
- ✅ **OpenAI normalization** untuk hasil yang lebih clean
- ✅ **Role-based access control** (User/Family/Admin)
- ✅ **Quota management** (20 pencarian/20 jam cooldown)
- ✅ **Clip protection** (Family & Admin only)
- ✅ **Zero API key leakage** (all server-side)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Railway Account (untuk deployment)
- AudD API Token (minimal 1, rekomendasi 3)
- OpenAI API Key (optional)

### Local Development

```bash
# Clone repository
git clone https://github.com/irmangamerz-png/songfinder.git
cd songfinder

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env dan masukkan AUDD_TOKEN & (optional) OPENAI_API_KEY

# Run server
npm start

# Server berjalan di http://localhost:3000
```

### Deploy ke Railway (1-Click)

1. **Push ke GitHub** (sudah done)
2. **Login ke Railway** → https://railway.app/dashboard
3. **New Project** → **Deploy from GitHub repo** → pilih `irmangamerz-png/songfinder`
4. **Add Environment Variables** (lihat DEPLOYMENT_GUIDE.md)
5. **Deploy** ✅

Setelah deploy, update `BACKEND_API_URL` di `index.html` dengan URL Railway Anda.

---

## 📂 Project Structure

```
songfinder/
├── server.js                 # Backend Express server (351 lines)
│   ├── Token management & AudD API
│   ├── User session & quota tracking
│   ├── Role verification (user/family/admin)
│   ├── OpenAI normalization
│   └── TikTok audio extraction
├── index.html                # Frontend UI (524 lines)
│   ├── Tab navigation (Link/File)
│   ├── Family PIN modal
│   ├── Admin control panel
│   ├── Role-based UI elements
│   └── Result display with links
├── package.json              # Dependencies (openai, express, cors, etc)
├── .env.example              # Environment template
├── nixpacks.toml             # Railway deployment config
├── DEPLOYMENT_GUIDE.md       # Step-by-step Railway setup
├── AUDIT_CHECKLIST.md        # Final verification checklist
└── README.md                 # This file
```

---

## ✨ Features

### 🎯 Core Recognition

| Feature | Status | Details |
|---------|--------|---------|
| TikTok Audio Extraction | ✅ | Real audio dari video, bukan caption |
| Multi-Sample Recognition | ✅ | 3 samples: awal, tengah, akhir |
| AudD Integration | ✅ | API fingerprinting audio |
| Token Rotation | ✅ | Auto-switch token jika limit |
| Spotify/Apple Music | ✅ | Direct links ke platform |
| YouTube Search | ✅ | Search query builder |
| Clip Audio | ✅ | Role-protected audio clip |

### 🔐 Access Control

| Mode | Quota | Clip | Panel | PIN |
|------|-------|------|-------|-----|
| **Regular** | 20/20 jam | ❌ | ❌ | - |
| **Family** | Unlimited | ✅ | ❌ | 01092007 |
| **Admin** | Unlimited | ✅ | ✅ | Irman |

### 📊 Quota System

- **Regular users:** 20 pencarian per 20 jam
- **After limit:** Automatic cooldown 20 jam
- **Family/Admin:** Unlimited, no cooldown
- **Server-side enforcement:** Backend verify (tidak bisa bypass via DevTools)

### 🤖 AI Normalization (Optional)

Dengan OpenAI enabled, sistem akan:
- ✅ Clean title dari suffix (remix, slowed, nightcore)
- ✅ Validate apakah terlihat seperti lagu sungguhan
- ✅ Identify edition type (remix, slowed, phonk, dll)
- ✅ **TIDAK mengarang** jika confidence rendah

---

## 🔧 API Endpoints

### POST `/api/recognize-url`

Recognize audio dari URL (TikTok/YouTube).

**Request:**
```json
{
  "url": "https://vm.tiktok.com/...",
  "userId": "user_12345",
  "pin": "01092007"  // optional
}
```

**Response (Success):**
```json
{
  "success": true,
  "role": "family",
  "title": "Lagu Judul",
  "artist": "Artis Name",
  "album": "Album Name",
  "spotify": "https://open.spotify.com/...",
  "apple_music": "https://music.apple.com/...",
  "clip": "https://...",  // null untuk regular user
  "attemptsLeft": 19
}
```

**Response (Failure):**
```json
{
  "success": false,
  "role": "user",
  "message": "Lagu tidak dikenali",
  "attemptsLeft": 20
}
```

### POST `/api/recognize-file`

Recognize audio dari file upload.

**Request:** (FormData)
```
file: <audio/video file>
userId: "user_12345"
pin: "01092007"  // optional
```

**Response:** Sama seperti `/api/recognize-url`

---

## 🛡️ Security Features

### API Key Protection
- ✅ AUDD_TOKEN **hanya di Railway env vars**
- ✅ OPENAI_API_KEY **hanya di Railway env vars**
- ✅ NO API keys di GitHub atau frontend
- ✅ .gitignore include `.env` file

### Role Verification
- ✅ Backend verify PIN sebelum return Clip URL
- ✅ Regular user **TIDAK dapat clip** meski ubah localStorage
- ✅ Quota enforce di backend (bukan frontend)
- ✅ Session management per userId di server

### Input Validation
- ✅ URL validation sebelum download
- ✅ File size check (min 1KB audio)
- ✅ CORS protection
- ✅ Error handling untuk failed downloads

---

## 🚀 Deployment Checklist

### Pre-Deployment

- [ ] Fork/Clone repository ke GitHub account
- [ ] Dapatkan AudD token dari https://audd.io
- [ ] (Optional) Dapatkan OpenAI key dari https://platform.openai.com
- [ ] Siapkan Railway account (https://railway.app)

### Railway Setup

- [ ] Connect GitHub repository ke Railway
- [ ] Add environment variables:
  - `AUDD_TOKEN_1` (required)
  - `OPENAI_API_KEY` (optional)
  - `FAMILY_PIN=01092007`
  - `ADMIN_PIN=Irman`
  - `MAX_LIMIT=20`
  - `COOLDOWN_HOURS=20`
- [ ] Deploy & wait for success
- [ ] Copy Railway URL

### Post-Deployment

- [ ] Update `BACKEND_API_URL` di `index.html`
- [ ] Test regular user flow
- [ ] Test Family mode (PIN: 01092007)
- [ ] Test Admin mode (PIN: Irman)
- [ ] Verify Spotify/YouTube links
- [ ] Check logs untuk OpenAI status

**👉 Detailed guide:** [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

---

## 📖 Usage Examples

### 1. Regular User (Limited)
```
1. Kunjungi frontend URL
2. Paste TikTok link
3. Klik "Kenali Audio Otomatis"
4. Lihat hasil + status kuota (e.g., "19/20")
5. Setelah 20 kali, cooldown 20 jam otomatis
```

### 2. Family User (Unlimited + Clip)
```
1. Klik tombol "Family" (pojok kanan atas)
2. Masukkan PIN: 01092007
3. Klik Verifikasi
4. Status berubah menjadi "💝 Mode Keluarga Aktif"
5. Sekarang punya akses:
   - Unlimited pencarian (tanpa limit)
   - Tombol "Putar Klip Audio" visible (jika ada)
6. Klik "Logout" untuk keluar
```

### 3. Admin User (Unlimited + Clip + Control)
```
1. Klik tombol "Admin" (pojok kanan atas)
2. Masukkan PIN: Irman
3. Klik OK
4. Panel admin terbuka
5. Lihat status: "🛡️ Admin Mode Aktif"
6. Akses sama seperti Family + panel kontrol
7. Klik "Logout Admin" untuk keluar
```

---

## 🎨 UI/UX Features

- **RGB Gaming Theme** - Dynamic background dengan warna berubah
- **Dark/Light Mode** - Toggle theme manual atau auto by time
- **Tab Navigation** - Link Media vs Upload File
- **Real-time Status** - Quota counter, role indicator
- **Responsive Design** - Mobile-friendly dengan Tailwind CSS
- **Audio Player** - Built-in audio preview
- **External Links** - Spotify, Apple Music, YouTube, TikTok, Clip

---

## 🔍 Troubleshooting

### Backend Issues

**Error: "Loaded Tokens: 0"**
- Solusi: Pastikan `AUDD_TOKEN_1` ada di Railway Variables

**Error: "Gagal mengambil video dari TikTok"**
- Solusi: Cek apakah URL valid, video publik, atau TikTok block request

**Error: "TOKEN_EXHAUSTED"**
- Solusi: Beli kuota baru di AudD atau tunggu reset

**OpenAI tidak working**
- Solusi: Cek OPENAI_API_KEY valid, akun punya balance, atau skip jika optional

### Frontend Issues

**CORS Error**
- Solusi: Pastikan `BACKEND_API_URL` benar di index.html, add trailing slash

**Quota tidak berkurang**
- Solusi: Bukan issue, quota di backend. Refresh browser untuk sync UI

**Clip button tidak tampil padahal authenticated**
- Solusi: Restart session atau clear localStorage

---

## 📊 Logs & Monitoring

### Check Backend Logs (Railway)

```bash
# Via CLI
railway logs

# Atau di Dashboard → Logs tab
```

### Important Log Messages

```
✅ [OpenAI] Client initialized with API key
⚠️ [OpenAI] OPENAI_API_KEY not found - normalization disabled
✅ SongFinder Backend running on port 3000
[Token Rotated] Beralih ke token indeks ke-1
[OpenAI] Normalized: Clean Title - Artist (Edition: remix)
[Recognition] Mencoba sample 1 (Utuh/Awal)...
[yt-dlp] Mengambil media dari: https://vm.tiktok.com/...
```

---

## 🔄 Updates & Maintenance

### Update Server Code
```bash
# Edit server.js
git add server.js
git commit -m "fix: xxx"
git push origin main
# Railway auto-redeploy
```

### Update Frontend
```bash
# Edit index.html
git add index.html
git commit -m "feat: xxx"
git push origin main
# Refresh browser untuk load update
```

### Update Environment Variables
```bash
# Railway Dashboard → Variables tab
# Edit & save → auto-reload container
```

---

## 📝 Environment Variables Reference

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `PORT` | ❌ | 3000 | Auto-assigned by Railway |
| `AUDD_TOKEN_1` | ✅ | - | Token dari audd.io |
| `AUDD_TOKEN_2` | ❌ | - | Backup token |
| `AUDD_TOKEN_3` | ❌ | - | Backup token |
| `OPENAI_API_KEY` | ❌ | - | Dari platform.openai.com |
| `FAMILY_PIN` | ❌ | 01092007 | Customizable |
| `ADMIN_PIN` | ❌ | Irman | Customizable |
| `MAX_LIMIT` | ❌ | 20 | Searches per user |
| `COOLDOWN_HOURS` | ❌ | 20 | Jam tunggu setelah habis |

---

## 🧪 Testing Checklist

| Test | Expected | Status |
|------|----------|--------|
| Regular user 20 searches | Quota depleted → cooldown | ✅ |
| Family mode activation | Status berubah → unlimited | ✅ |
| Admin mode activation | Panel terbuka → unlimited | ✅ |
| Clip access regular | Clip button hidden | ✅ |
| Clip access family | Clip button visible | ✅ |
| Clip access admin | Clip button visible | ✅ |
| OpenAI normalization | Title cleaned | ✅ |
| Caption bypass | Never use caption | ✅ |
| Spotify link | Valid URL atau hidden | ✅ |
| YouTube search | Auto-generated query | ✅ |

---

## 📚 Documentation

- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Railway setup step-by-step
- **[AUDIT_CHECKLIST.md](./AUDIT_CHECKLIST.md)** - Final verification checklist
- **.env.example** - Environment template

---

## 🤝 Contributing

Untuk contribute:
1. Fork repository
2. Buat branch baru: `git checkout -b feature/xxx`
3. Commit changes: `git commit -m "feat: xxx"`
4. Push branch: `git push origin feature/xxx`
5. Buat Pull Request

---

## 📄 License

MIT License - Lihat [LICENSE](./LICENSE) untuk details

---

## 🙋 Support

**Bug Report:** Buat issue di GitHub  
**Feature Request:** Diskusi di GitHub Discussions  
**Railway Support:** https://docs.railway.app  
**AudD API:** https://docs.audd.io  
**OpenAI:** https://platform.openai.com/docs

---

## 📈 Version History

### v2.0 (Current) - September 15, 2026
- ✨ Add OpenAI normalization & validation
- 🔐 Add role-based access control (User/Family/Admin)
- 🛡️ Backend quota enforcement
- 📎 Clip URL protection by role
- 📝 Comprehensive documentation

### v1.0 - Previous
- Basic TikTok audio recognition
- AudD API integration
- Multi-sample recognition

---

## 🎯 Next Roadmap

- [ ] Database persistent session storage (replace in-memory)
- [ ] Admin analytics dashboard
- [ ] Social sharing features
- [ ] Playlist creation
- [ ] History tracking
- [ ] Multi-language support
- [ ] Mobile app (React Native)
- [ ] Rate limiting by IP

---

**Made with ❤️ by Irman**

```
 🎵 SongFinder Pro v2.0 
 Production Ready ✅
 All systems go 🚀
```

---

*Last Updated: 2026-09-15 | Status: Production Ready*
