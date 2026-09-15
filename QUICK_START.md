# ⚡ QUICK START - SongFinder Pro v2.0

**Panduan cepat untuk langsung coba SongFinder Pro dalam 5 menit!**

---

## 🚀 30-Detik Setup

### Step 1: Login Railway (1 menit)
1. Buka https://railway.app/dashboard
2. New Project → Deploy from GitHub
3. Select `irmangamerz-png/songfinder`
4. Click Deploy ✅

### Step 2: Add Environment Variables (2 menit)
1. Railway Dashboard → Variables tab
2. Paste ini:
```env
AUDD_TOKEN_1=<paste_token_dari_audd.io>
OPENAI_API_KEY=<paste_key_dari_openai_optional>
FAMILY_PIN=01092007
ADMIN_PIN=Irman
MAX_LIMIT=20
COOLDOWN_HOURS=20
```
3. Save ✅

### Step 3: Copy URL & Test (1 menit)
1. Railway Dashboard → Domains
2. Copy URL (format: `https://songfinder-xxx.up.railway.app`)
3. Update `BACKEND_API_URL` di `index.html`:
```javascript
const BACKEND_API_URL = "https://songfinder-xxx.up.railway.app";
```
4. Commit & push ✅

### Step 4: Akses Frontend (30 detik)
Buka: `https://songfinder-xxx.up.railway.app` → **SIAP PAKAI!** 🎉

---

## 📱 Test Sekarang

### Test 1: Regular User (Limited)
```
1. Buka frontend
2. Paste link TikTok: https://vm.tiktok.com/...
3. Klik "Kenali Audio"
4. Lihat quota: "19/20" ✅
```

### Test 2: Family Mode (Unlimited + Clip)
```
1. Klik tombol "Family" (pojok kanan)
2. Masukkan PIN: 01092007
3. Klik Verifikasi
4. Status: "💝 Mode Keluarga Aktif" ✅
5. Cari lagu → Clip button visible ✅
```

### Test 3: Admin Mode (Control Panel)
```
1. Klik tombol "Admin" (pojok kanan)
2. Masukkan PIN: Irman
3. Panel terbuka → "🛡️ Admin Mode Aktif" ✅
4. Unlimited searches + Clip access ✅
```

---

## 🔑 Default Credentials

| Mode | PIN | Quota | Clip | Status |
|------|-----|-------|------|--------|
| Regular | - | 20/20jam | ❌ | Default |
| **Family** | **01092007** | **Unlimited** | **✅** | **Test Now** |
| **Admin** | **Irman** | **Unlimited** | **✅** | **Test Now** |

---

## 🎯 Common Tasks

### Ganti FAMILY_PIN
```bash
# Railway Variables
FAMILY_PIN=your_custom_pin_here
```

### Ganti ADMIN_PIN
```bash
# Railway Variables
ADMIN_PIN=your_admin_pin_here
```

### Add Multiple AudD Tokens
```bash
# Railway Variables
AUDD_TOKEN_1=token_1_here
AUDD_TOKEN_2=token_2_here
AUDD_TOKEN_3=token_3_here
```

### Enable/Disable OpenAI
```bash
# Untuk enable OpenAI:
OPENAI_API_KEY=sk-proj-xxxxx

# Untuk disable (leave empty):
OPENAI_API_KEY=
```

### Change Quota Limit
```bash
# Railway Variables
MAX_LIMIT=50        # Ganti 20 jadi 50 pencarian
COOLDOWN_HOURS=48   # Ganti 20 jam jadi 48 jam
```

---

## 🛠️ Troubleshooting 1-2-3

### ❌ Backend tidak connect
**Error:** CORS error atau "Cannot connect to server"

**Fix:**
1. Cek `BACKEND_API_URL` di index.html (jangan ada typo/trailing slash)
2. Format harus: `https://songfinder-xxx.up.railway.app` (tanpa `/`)
3. Pastikan Railway deployment selesai (bukan masih "building")
4. Reload browser & clear cache

### ❌ Audio tidak dikenali
**Error:** "Lagu tidak dikenali"

**Possible Causes:**
- TikTok URL invalid atau private
- Audio terlalu pendek/tidak terdeteksi
- AudD token habis kuota

**Fix:**
1. Cek apakah TikTok video publik
2. Coba video lain
3. Cek AudD quota di https://audd.io
4. Add backup token jika ada

### ❌ Quota tidak berkurang
**Issue:** Setelah search, quota masih 20/20

**Explanation:** Ini bukan bug! Quota di-track di server memory:
- Refresh browser untuk sync UI
- Atau klik search lagi → akan berkurang

### ❌ Clip button tidak tampil
**Issue:** Authenticated (Family/Admin) tapi clip button hidden

**Fix:**
1. Cek apakah authenticated dengan benar
2. Refresh browser
3. Clear localStorage: `localStorage.clear()`
4. Login family/admin ulang

### ❌ PIN tidak accepted
**Issue:** Masukkan PIN tapi error "PIN tidak valid"

**Fix:**
1. Cek typo di PIN (case-sensitive)
2. Family PIN: `01092007` (bukan 1092007)
3. Admin PIN: `Irman` (bukan irman atau IRMAN)
4. Pastikan Pin di Railway Variables sudah benar

---

## 📊 Features Checklist

### Core Features
- ✅ TikTok audio extraction
- ✅ Multi-sample recognition (3 samples)
- ✅ AudD API integration
- ✅ Token auto-rotation
- ✅ Spotify/Apple Music links
- ✅ YouTube search

### Role-Based Access
- ✅ Regular user (20 limit)
- ✅ Family mode (unlimited)
- ✅ Admin mode (unlimited + control)
- ✅ Clip protection by role

### AI Features
- ✅ OpenAI normalization (optional)
- ✅ Title/artist cleaning
- ✅ Remix detection
- ✅ Confidence validation

### Security
- ✅ API keys in env vars only
- ✅ Backend quota enforcement
- ✅ Role verification
- ✅ PIN-based auth

---

## 📚 Full Documentation

| File | Purpose |
|------|---------|
| [README.md](./README.md) | Overview & features |
| [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) | Step-by-step Railway setup |
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | Technical API reference |
| [AUDIT_CHECKLIST.md](./AUDIT_CHECKLIST.md) | Final verification |
| **QUICK_START.md** | This file ⚡ |

---

## 🎮 API Examples

### cURL - Recognize TikTok
```bash
curl -X POST https://songfinder-xxx.up.railway.app/api/recognize-url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://vm.tiktok.com/ZMJwgUwqH/",
    "userId": "user_123",
    "pin": "01092007"
  }'
```

### JavaScript - Recognize File
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('userId', 'user_123');
formData.append('pin', '01092007');

const res = await fetch('https://songfinder-xxx.up.railway.app/api/recognize-file', {
  method: 'POST',
  body: formData
});
const data = await res.json();
console.log(data.title, data.artist);
```

---

## 🚨 Emergency Fixes

### "Loaded Tokens: 0" Error
```bash
# Solution: Add AUDD_TOKEN ke Railway Variables
AUDD_TOKEN_1=<your_token_from_audd>
```

### "TOKEN_EXHAUSTED" Error
```bash
# Solution 1: Beli kuota baru di https://audd.io
# Solution 2: Add backup token
AUDD_TOKEN_2=<backup_token>
AUDD_TOKEN_3=<backup_token>
```

### "Gagal mengambil video dari TikTok"
```bash
# Solutions:
1. Cek apakah URL TikTok masih publik
2. TikTok mungkin block request
3. Coba URL dengan format berbeda
4. Gunakan yt-dlp command manual untuk debug
```

### "OpenAI API Error"
```bash
# Solutions:
1. Cek OPENAI_API_KEY valid (bukan expired)
2. Cek akun OpenAI punya balance ($)
3. Atau disable: hapus OPENAI_API_KEY dari Railways
```

---

## 💡 Pro Tips

### Tip 1: Backup Tokens
Lebih baik 3 tokens daripada 1:
```bash
AUDD_TOKEN_1=token_utama
AUDD_TOKEN_2=token_backup1
AUDD_TOKEN_3=token_backup2
```
Sistem otomatis rotate jika satu habis ✅

### Tip 2: Custom Quotes
Personalisasi PIN untuk family:
```bash
FAMILY_PIN=1234567  # Ganti 01092007
```

### Tip 3: Monitor Logs
```bash
railway logs -f
# Cari: "[OpenAI]", "[Token Rotated]", "[Recognition]"
```

### Tip 4: Test API Directly
```bash
# Health check
curl https://songfinder-xxx.up.railway.app/

# Expected: "SongFinder Backend Active. Loaded Tokens: 3"
```

---

## 🆘 Need Help?

### Quick Links
- 🚀 [Railway Docs](https://docs.railway.app)
- 🎵 [AudD API](https://docs.audd.io)
- 🤖 [OpenAI API](https://platform.openai.com/docs)
- 🐛 [GitHub Issues](https://github.com/irmangamerz-png/songfinder/issues)

### Debug Steps
1. Check Railway Logs
2. Test endpoint with cURL
3. Verify environment variables
4. Check console errors (F12)
5. Review [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

---

## ✅ You're All Set!

```
🎉 SongFinder Pro is ready to rock!

✅ Backend deployed
✅ Environment configured
✅ Features tested
✅ Documentation ready

👉 Next: Open https://songfinder-xxx.up.railway.app
   and start recognizing songs! 🎵
```

---

**Last Updated:** September 15, 2026  
**Status:** ✅ Production Ready  
**Version:** 2.0

Enjoy! 🚀
