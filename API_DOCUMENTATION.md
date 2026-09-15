# 🔌 SongFinder Pro - API Documentation

Complete API reference untuk SongFinder Pro backend endpoints.

---

## Base URL

```
Production: https://your-railway-url.railway.app
Development: http://localhost:3000
```

---

## Authentication & Role System

### PIN-Based Authentication

Semua requests ke `/api/recognize-*` endpoints support PIN untuk role escalation.

**Roles:**
- `user` (default) - 20 searches/20 jam cooldown
- `family` - Unlimited searches, can access clips (PIN: `01092007`)
- `admin` - Unlimited searches, can access clips, admin controls (PIN: `Irman`)

**How it works:**
1. Frontend kirim `pin` di request body
2. Backend verify PIN dengan `verifyRole()`
3. Backend return `role` di response
4. Jika `role === 'family'` atau `role === 'admin'`: Clip URL included
5. Jika `role === 'user'`: Clip URL always `null`

---

## Endpoints

### 1. POST `/api/recognize-url`

Recognize audio dari URL (TikTok, YouTube, atau search query).

#### Request

**Content-Type:** `application/json`

**Body:**
```json
{
  "url": "https://vm.tiktok.com/ZMJwgUwqH/",
  "userId": "user_unique_id",
  "pin": "01092007"
}
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | ✅ | TikTok/YouTube URL atau search query (e.g., "ytsearch1:lagu judul") |
| `userId` | string | ❌ | Unique user identifier (default: "default_user") |
| `pin` | string | ❌ | PIN untuk role escalation (01092007=family, Irman=admin) |

#### Response

**Success (200):**
```json
{
  "success": true,
  "role": "family",
  "title": "Never Gonna Give You Up",
  "artist": "Rick Astley",
  "album": "Whenever You Need Somebody",
  "spotify": "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqLv",
  "apple_music": "https://music.apple.com/us/album/never-gonna-give-you-up/...",
  "clip": "https://audio-clip-url.mp3",
  "attemptsLeft": 19
}
```

**Not Found (200):**
```json
{
  "success": false,
  "role": "user",
  "message": "Lagu tidak dikenali",
  "attemptsLeft": 20
}
```

**Error (400/429/500):**
```json
{
  "success": false,
  "role": "user",
  "message": "Gagal mengambil video dari TikTok",
  "attemptsLeft": 20
}
```

#### Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success (termasuk "not found") |
| 400 | Bad request (url kosong, PIN invalid) |
| 429 | Too many requests (quota habis) |
| 500 | Server error |

#### Field Descriptions

| Field | Description |
|-------|-------------|
| `success` | Boolean, apakah recognition berhasil |
| `role` | Current user role: `user`, `family`, atau `admin` |
| `title` | Judul lagu (dari AudD + optional OpenAI) |
| `artist` | Nama artis (dari AudD + optional OpenAI) |
| `album` | Nama album atau metadata lainnya |
| `spotify` | URL langsung ke Spotify (jika ada) |
| `apple_music` | URL langsung ke Apple Music (jika ada) |
| `clip` | Audio clip URL (hanya untuk family/admin, else `null`) |
| `attemptsLeft` | Sisa kuota untuk regular user (hanya return jika role=user) |

#### Examples

**1. TikTok URL Recognition (Regular User)**
```bash
curl -X POST http://localhost:3000/api/recognize-url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://vm.tiktok.com/ZMJwgUwqH/",
    "userId": "user_12345"
  }'
```

Response:
```json
{
  "success": true,
  "role": "user",
  "title": "Blinding Lights",
  "artist": "The Weeknd",
  "album": "After Hours",
  "spotify": "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMwbk",
  "apple_music": "https://music.apple.com/us/album/blinding-lights/...",
  "clip": null,
  "attemptsLeft": 19
}
```

**2. Family Mode with Clip Access**
```bash
curl -X POST http://localhost:3000/api/recognize-url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://vm.tiktok.com/ZMJwgUwqH/",
    "userId": "user_12345",
    "pin": "01092007"
  }'
```

Response:
```json
{
  "success": true,
  "role": "family",
  "title": "Blinding Lights",
  "artist": "The Weeknd",
  "album": "After Hours",
  "spotify": "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMwbk",
  "apple_music": "https://music.apple.com/us/album/blinding-lights/...",
  "clip": "https://audio.audd.io/clip-xyz123.mp3",
  "attemptsLeft": null
}
```

**3. Admin Mode**
```bash
curl -X POST http://localhost:3000/api/recognize-url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=xyz",
    "userId": "admin_1",
    "pin": "Irman"
  }'
```

Response:
```json
{
  "success": true,
  "role": "admin",
  "title": "Never Gonna Give You Up",
  "artist": "Rick Astley",
  "album": "Whenever You Need Somebody",
  "spotify": "...",
  "apple_music": "...",
  "clip": "...",
  "attemptsLeft": null
}
```

**4. Quota Exceeded**
```bash
curl -X POST http://localhost:3000/api/recognize-url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://vm.tiktok.com/...",
    "userId": "user_12345"
  }'
```

Response (429):
```json
{
  "success": false,
  "role": "user",
  "message": "Batas 20 pencarian tercapai. Cooldown 20 jam dimulai.",
  "attemptsLeft": 0
}
```

---

### 2. POST `/api/recognize-file`

Recognize audio dari file upload (MP3, WAV, M4A, MP4, etc).

#### Request

**Content-Type:** `multipart/form-data`

**Body:**
```
file: <binary audio/video file>
userId: user_unique_id
pin: 01092007
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | file | ✅ | Audio atau video file (accept: audio/*, video/*) |
| `userId` | string | ❌ | Unique user identifier (default: "default_user") |
| `pin` | string | ❌ | PIN untuk role escalation |

#### Response

**Success (200):**
```json
{
  "success": true,
  "role": "user",
  "title": "Lagu Terdeteksi",
  "artist": "Nama Artis",
  "album": "Album Name",
  "spotify": "https://open.spotify.com/track/...",
  "apple_music": "https://music.apple.com/...",
  "clip": null,
  "attemptsLeft": 19
}
```

**Error (400/429/500):**
```json
{
  "success": false,
  "role": "user",
  "message": "File tidak ada.",
  "attemptsLeft": 20
}
```

#### Examples

**1. File Upload (cURL)**
```bash
curl -X POST http://localhost:3000/api/recognize-file \
  -F "file=@/path/to/audio.mp3" \
  -F "userId=user_12345" \
  -F "pin=01092007"
```

**2. File Upload (JavaScript/Fetch)**
```javascript
const formData = new FormData();
formData.append('file', fileInputElement.files[0]);
formData.append('userId', 'user_12345');
formData.append('pin', '01092007');

const response = await fetch('http://localhost:3000/api/recognize-file', {
  method: 'POST',
  body: formData
});

const data = await response.json();
console.log(data);
```

---

### 3. GET `/`

Health check endpoint.

#### Response

```
SongFinder Backend Active. Loaded Tokens: 3
```

#### Example

```bash
curl http://localhost:3000/

# Output:
# SongFinder Backend Active. Loaded Tokens: 3
```

---

## Error Handling

### Common Error Codes

| Code | Message | Cause | Solution |
|------|---------|-------|----------|
| 400 | Input kosong | URL/file tidak ada | Pastikan ada input |
| 400 | URL tidak valid | Format URL salah | Gunakan URL yang benar |
| 401 | PIN tidak valid | PIN salah/tidak dikenali | Cek PIN: Family=01092007, Admin=Irman |
| 429 | Batas kuota habis | User sudah 20x | Tunggu 20 jam atau upgrade ke Family |
| 429 | Coba lagi dalam X jam | Cooldown aktif | Tunggu cooldown selesai |
| 500 | Gagal mengambil video | TikTok block/URL invalid | Coba URL lain atau cek TikTok |
| 500 | Gagal mengekstrak audio | FFmpeg error | Server config issue |
| 500 | Recognition API gagal | AudD error/token habis | Beli kuota baru atau add token |
| 500 | Kesalahan internal | Unexpected error | Check server logs |

### Example Error Response

```json
{
  "success": false,
  "role": null,
  "message": "Gagal mengambil video dari TikTok"
}
```

---

## Rate Limiting & Quotas

### User Quota System

**Regular User (no PIN):**
- Max 20 searches per period
- Cooldown: 20 jam
- Clip access: ❌ NO

**Family User (PIN: 01092007):**
- Max searches: Unlimited
- Cooldown: None
- Clip access: ✅ YES

**Admin User (PIN: Irman):**
- Max searches: Unlimited
- Cooldown: None
- Clip access: ✅ YES

### Session Persistence

- Sessions di-track per `userId` di backend memory
- Berdasarkan `process.env.MAX_LIMIT` dan `process.env.COOLDOWN_HOURS`
- Server restart akan reset sessions (rekomendasi: setup database untuk persistence)

---

## Audio Recognition Capabilities

### Supported Formats

**Input:**
- MP3, WAV, M4A, FLAC, AAC
- Video: MP4, MOV, WebM
- TikTok URLs
- YouTube URLs
- Search queries

**Recognition:**
- Original songs ✅
- DJ/Remix ✅
- Breakbeat ✅
- Phonk ✅
- Slowed ✅
- Slowed+Reverb ✅
- Sped-up/Nightcore ✅
- Bass Boosted ✅
- Pitch/Tempo Changes ✅
- Audio Clips/Segments ✅
- Audio with Voice-over ✅

### Multi-Sample Recognition

Server otomatis mencoba hingga 3 samples dari file audio:
1. **Sample 1:** Full file atau awal (0-12 detik)
2. **Sample 2:** Tengah file (jika durasi > 15 detik)
3. **Sample 3:** Akhir file (jika durasi > 30 detik)

Ini meningkatkan akurasi untuk:
- Audio yang dipotong/di-edit
- Long form content
- Audio dengan intro/outro

---

## OpenAI Integration

Jika `OPENAI_API_KEY` configured di environment:

### Normalization Process

```
AudD Result (raw)
    ↓
OpenAI Validation
    ↓
Return (cleaned)
```

### What OpenAI Does

1. **Clean Title:** Hapus suffix (Remix, Slowed, Nightcore)
2. **Clean Artist:** Hapus feat/collab
3. **Identify Edition:** Detect remix/slowed/phonk type
4. **Validate Result:** Pastikan terlihat seperti lagu sungguhan
5. **Confidence Check:** Reject jika confidence < 50%

### What OpenAI DOES NOT Do

❌ Mengarang title/artist baru  
❌ Guess dari caption atau metadata  
❌ Ubah hasil jika confidence rendah  

---

## Security Considerations

### API Keys

- ✅ All API keys stored in Railway Environment Variables
- ✅ NO API keys in code/GitHub
- ✅ NO API keys sent to frontend
- ✅ Backend only handles sensitive operations

### PIN Security

⚠️ Note: PINs di-send via HTTPS POST body (encrypted in transit)
- Frontend localStorage stores PIN locally (optional UI persistence)
- Backend verifies setiap request
- PIN **BUKAN** password yang aman - treat sebagai access token saja

### User Sessions

- Session tracking per `userId` di server memory
- UserID bisa unique identifier atau simple string
- Quota enforcement di backend (not localStorage)

### Recommended Security Practices

1. Use HTTPS/TLS untuk semua API calls
2. Rotate PINs secara berkala
3. Monitor AudD token usage
4. Implement database session store (bukan in-memory)
5. Add IP rate limiting jika needed
6. Use strong/random AudD tokens

---

## Integration Examples

### JavaScript/Frontend

```javascript
const BACKEND_URL = 'https://your-railway-url.railway.app';

// Recognize URL
async function recognizeTikTok(url, pin = null) {
  const response = await fetch(`${BACKEND_URL}/api/recognize-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: url,
      userId: getUserId(),
      pin: pin
    })
  });
  return await response.json();
}

// Recognize File
async function recognizeFile(file, pin = null) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('userId', getUserId());
  formData.append('pin', pin);

  const response = await fetch(`${BACKEND_URL}/api/recognize-file`, {
    method: 'POST',
    body: formData
  });
  return await response.json();
}
```

### Python/Backend

```python
import requests

BACKEND_URL = 'https://your-railway-url.railway.app'

# Recognize URL
def recognize_tiktok(url, user_id='user_123', pin=None):
    response = requests.post(
        f'{BACKEND_URL}/api/recognize-url',
        json={
            'url': url,
            'userId': user_id,
            'pin': pin
        }
    )
    return response.json()

# Recognize File
def recognize_file(file_path, user_id='user_123', pin=None):
    with open(file_path, 'rb') as f:
        files = {'file': f}
        data = {
            'userId': user_id,
            'pin': pin
        }
        response = requests.post(
            f'{BACKEND_URL}/api/recognize-file',
            files=files,
            data=data
        )
        return response.json()

# Usage
result = recognize_tiktok('https://vm.tiktok.com/...', pin='01092007')
print(result['title'], result['artist'])
```

### cURL

```bash
# Recognize URL
curl -X POST https://your-railway-url.railway.app/api/recognize-url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://vm.tiktok.com/...",
    "userId": "user_123",
    "pin": "01092007"
  }'

# Recognize File
curl -X POST https://your-railway-url.railway.app/api/recognize-file \
  -F "file=@audio.mp3" \
  -F "userId=user_123" \
  -F "pin=01092007"
```

---

## Monitoring & Debugging

### Check Logs

```bash
# Railway CLI
railway logs -f

# Atau di Railway Dashboard → Logs tab
```

### Key Log Messages

```
[OpenAI] Client initialized with API key
[Recognition] Mencoba sample 1 (Utuh/Awal)...
[OpenAI] Normalized: Title - Artist (Edition: remix)
[Token Rotated] Beralih ke token indeks ke-1
[yt-dlp] Mengambil media dari: https://...
[AudD Token Issue] Kode: 900, Pesan: ...
```

### Debugging Tips

1. **Enable verbose logging:**
   ```javascript
   console.log('[Debug]', JSON.stringify(request, null, 2));
   ```

2. **Check token status:**
   - Visit `https://your-url/` → see "Loaded Tokens: X"

3. **Test endpoint directly:**
   ```bash
   curl https://your-url/api/recognize-url -d '{"url":"..."}'
   ```

4. **Monitor AudD quota:**
   - Login ke https://audd.io → Dashboard
   - Cek remaining requests

---

## Version History

### v2.0 (Current)
- ✨ OpenAI integration for normalization
- 🔐 Role-based access control
- 📎 Clip URL protection
- 🛡️ Backend quota enforcement

### v1.0
- Basic TikTok recognition
- AudD API integration
- Multi-sample recognition

---

**API Documentation v2.0**  
Last Updated: September 15, 2026  
Status: Production Ready ✅
