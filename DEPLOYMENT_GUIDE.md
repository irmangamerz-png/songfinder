# 🚀 SongFinder Pro - Railway Deployment Guide

## Prerequisites
- GitHub Account (dengan akses ke repository `irmangamerz-png/songfinder`)
- Railway Account (https://railway.app)
- AudD API Token (minimal 1, lebih baik 2-3 untuk redundancy)
- OpenAI API Key (optional, tapi recommended untuk normalisasi hasil)

---

## 📋 Step 1: Setup AudD Token

### Dapatkan Token AudD
1. Kunjungi https://audd.io
2. Daftar dan verifikasi email
3. Buka Dashboard → API Keys
4. Copy token Anda (format: `9fd164b2d84f0af4d07f3ef9bb62359e`)

### Multiple Tokens (Recommended)
Jika Anda punya beberapa akun AudD untuk redundancy:
- Token 1: `AUDD_TOKEN_1=xxx`
- Token 2: `AUDD_TOKEN_2=yyy`
- Token 3: `AUDD_TOKEN_3=zzz`

Atau single string dengan koma:
```
AUDD_TOKEN=xxx,yyy,zzz
```

---

## 🔑 Step 2: Setup OpenAI API Key (Optional)

### Dapatkan OpenAI Key
1. Kunjungi https://platform.openai.com/api-keys
2. Login dengan akun OpenAI (atau daftar baru)
3. Klik "Create new secret key"
4. Copy key tersebut (format: `sk-proj-...`)

**⚠️ PENTING:**
- Jangan share key ini ke siapa pun
- Jangan commit ke GitHub (akan auto-revoke)
- Simpan hanya di Railway Environment Variables

### Kegunaan OpenAI
- Membersihkan/normalisasi title dan artist dari AudD
- Validasi hasil recognition (misal: membedakan remix dari original)
- Menangani variasi penulisan (slowed, nightcore, phonk, dll)
- **TIDAK** akan mengarang lagu jika AudD tidak memberikan bukti cukup

---

## 🚂 Step 3: Deploy ke Railway

### Option A: Connect GitHub Repository (Recommended)

1. **Login ke Railway** → https://railway.app/dashboard
2. **Klik "New Project"** → **"Deploy from GitHub repo"**
3. **Authorize GitHub** dan pilih repository `irmangamerz-png/songfinder`
4. **Railway akan auto-detect** `package.json` dan `nixpacks.toml`
5. **Klik Deploy** (tunggu ~3-5 menit)

### Option B: Manual Deploy via CLI
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Masuk ke project folder
cd songfinder

# 4. Link ke Railway project
railway link

# 5. Deploy
railway up
```

---

## ⚙️ Step 4: Konfigurasi Environment Variables di Railway

### Di Railway Dashboard:

1. Buka project SongFinder → **"Variables"** tab
2. **Tambahkan variables berikut:**

```env
# PORT (Railroad auto-assign, bisa skip)
PORT=3000

# AUDD Token(s) - REQUIRED
AUDD_TOKEN_1=<paste_your_audd_token_here>
# Jika punya multiple tokens:
AUDD_TOKEN_2=<paste_second_token>
AUDD_TOKEN_3=<paste_third_token>

# OpenAI Key - OPTIONAL (tapi recommended)
OPENAI_API_KEY=<paste_your_openai_key_here>

# PIN Configuration
FAMILY_PIN=01092007
ADMIN_PIN=Irman

# Quota Configuration
MAX_LIMIT=20
COOLDOWN_HOURS=20
```

### Cara Paste di Railway:
1. Klik **"Add Variable"**
2. **Key:** `AUDD_TOKEN_1`
3. **Value:** `<paste_token_dari_audd>`
4. Klik **"Add"**
5. Ulangi untuk token lain dan variables lainnya

---

## ✅ Step 5: Verify Deployment

### Check Backend Status
```bash
# Dari terminal atau browser
curl https://your-railway-url.railway.app/

# Expected response:
# SongFinder Backend Active. Loaded Tokens: 1
```

### Check Logs
1. Railway Dashboard → Project → **"Logs"** tab
2. Cari pesan:
   - `[OpenAI] Client initialized with API key` → OpenAI ready
   - `[OpenAI] OPENAI_API_KEY not found` → OpenAI disabled (optional)
   - `SongFinder Backend running on port 3000` → Server ready

---

## 🔗 Step 6: Update Frontend URL

Di repository `irmangamerz-png/songfinder`, file **`index.html`**:

```javascript
// Line ~197
const BACKEND_API_URL = "https://your-railway-url.railway.app";
```

### Dapatkan Railway URL:
1. Railway Dashboard → Project
2. Bagian **"Domains"** → Copy URL
3. Format: `https://songfinder-production-xxxxx.up.railway.app`

Setelah update, push ke GitHub:
```bash
git add index.html
git commit -m "update: Railway backend URL"
git push origin main
```

**Railway akan auto-redeploy** saat detect push ke main branch.

---

## 🎯 Step 7: Test Features

### Test Regular User (20 searches limit)
1. Buka frontend URL
2. Masukkan link TikTok
3. Klik "Kenali Audio Otomatis"
4. Lihat quota tracking

### Test Family Mode
1. Klik tombol **"Family"** (pojok kanan atas)
2. Masukkan PIN: `01092007`
3. Klik Verifikasi
4. Harus menampilkan: "💝 Mode Keluarga Aktif"
5. Cari lagu → Clip button harus **terlihat** (jika ada)

### Test Admin Mode
1. Klik tombol **"Admin"** (pojok kanan atas)
2. Masukkan PIN: `Irman`
3. Klik OK
4. Panel admin harus terbuka
5. Harus menampilkan: "🛡️ Admin Mode Aktif"
6. Quota tidak ada limit

### Test OpenAI Normalization (optional)
Cek logs di Railway:
```
[OpenAI] Normalized: Clean Title - Clean Artist (Edition: remix)
```

---

## 🛠️ Troubleshooting

### Error: "Loaded Tokens: 0"
**Problem:** AUDD_TOKEN tidak dikonfigurasi
**Solution:**
1. Railway Dashboard → Variables
2. Pastikan `AUDD_TOKEN_1` atau `AUDD_TOKEN` sudah ada
3. Redeploy: klik **"Redeploy"** button

### Error: "Gagal mengambil video dari TikTok"
**Problem:** TikTok URL tidak bisa di-download
**Solution:**
1. Cek apakah URL valid dan video publik
2. TikTok mungkin block request → coba URL lain
3. Railway mungkin perlu IP whitelist → hubungi TikTok support

### Error: "TOKEN_EXHAUSTED: Semua token AudD gagal"
**Problem:** Semua AUDD token habis kuota atau error
**Solution:**
1. Beli kuota baru di https://audd.io/pricing
2. Tunggu reset kuota (biasanya harian/bulanan)
3. Atau tambah token baru dari akun AudD lain

### OpenAI tidak working
**Problem:** Error saat normalize result
**Solution:**
1. Cek OPENAI_API_KEY di Railway Variables (jangan ada space/typo)
2. Cek apakah API key masih valid (belum revoke)
3. Cek OpenAI account punya balance ($)
4. Jika optional, bisa disable → hapus OPENAI_API_KEY

### Frontend tidak bisa connect ke backend
**Problem:** CORS error atau URL salah
**Solution:**
1. Pastikan `BACKEND_API_URL` di index.html **sudah diupdate**
2. Pastikan URL format: `https://xxx.up.railway.app` (tanpa trailing slash)
3. Test di browser console:
   ```javascript
   fetch('https://your-url/api/recognize-url', {method: 'POST'})
   ```

---

## 📊 Monitoring & Logs

### Real-time Logs
```bash
# Via Railway CLI
railway logs

# Atau di Dashboard:
# Project → "Logs" tab
```

### Metrics to Monitor
- **Request count** → mengecek usage pattern
- **Error rate** → jika ada pattern recognition gagal
- **Response time** → optimasi jika lambat
- **Token usage** → jika AUDD tokens habis kuota

---

## 💾 Backup & Updates

### Update Server
```bash
# 1. Edit server.js locally
# 2. Commit dan push
git add server.js
git commit -m "fix: xxx"
git push origin main

# Railway auto-redeploy (check Deployments tab)
```

### Update Frontend
```bash
# 1. Edit index.html locally
# 2. Commit dan push
git add index.html
git commit -m "update: xxx"
git push origin main

# Frontend auto-update saat reload browser
```

---

## 🔐 Security Checklist

- ✅ AUDD_TOKEN **hanya di Railway**, bukan di GitHub
- ✅ OPENAI_API_KEY **hanya di Railway**, bukan di GitHub
- ✅ PIN tidak di-hardcode di frontend (hanya di environment)
- ✅ Backend memverifikasi role sebelum return Clip URL
- ✅ Quota enforcement di backend (bukan frontend localStorage)
- ✅ No API keys in browser console atau Network tab

---

## 📞 Support

### Jika ada masalah:
1. **Railway Logs** → cek error message di tab "Logs"
2. **Browser Console** → `F12 → Console` untuk error frontend
3. **Network Tab** → cek response dari API
4. **GitHub Issues** → buatkan issue di repository

### Useful Links:
- Railway Docs: https://docs.railway.app
- AudD API Docs: https://docs.audd.io
- OpenAI API: https://platform.openai.com/docs

---

**🎉 Selamat! SongFinder Pro sekarang live di Railway!**

Akses frontend dari: `https://your-railway-url.railway.app`
