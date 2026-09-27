const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const FormDataNode = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ENVIRONMENT VARIABLES =====
const FAMILY_PIN = process.env.FAMILY_PIN || "01092007";
const ADMIN_PIN = process.env.ADMIN_PIN || "Irman";

// Token Loader dinamis dari Environment Variables Railway
function loadTokens() {
    let tokens = [];
    for (let i = 1; i <= 10; i++) {
        if (process.env[`AUDD_TOKEN_${i}`]) {
            tokens.push(process.env[`AUDD_TOKEN_${i}`].trim());
        }
    }
    if (tokens.length === 0 && process.env.AUDD_TOKEN) {
        tokens = process.env.AUDD_TOKEN.split(',').map(t => t.trim()).filter(Boolean);
    }
    return tokens;
}

const AUDD_TOKENS = loadTokens();
let currentTokenIndex = 0;

function getActiveToken() {
    if (AUDD_TOKENS.length === 0) return null;
    return AUDD_TOKENS[currentTokenIndex];
}

function rotateToken() {
    if (AUDD_TOKENS.length === 0) return;
    currentTokenIndex = (currentTokenIndex + 1) % AUDD_TOKENS.length;
    console.warn(`[Token Rotated] Beralih ke token indeks ke-${currentTokenIndex}`);
}

// ===== USER SESSION MANAGEMENT =====
let userSessions = {};
const MAX_USER_LIMIT = parseInt(process.env.MAX_LIMIT) || 20;
const COOLDOWN_HOURS = parseInt(process.env.COOLDOWN_HOURS) || 20;

function getUserSession(userId) {
    if (!userSessions[userId]) {
        userSessions[userId] = { count: 0, cooldownUntil: 0 };
    }
    return userSessions[userId];
}

function verifyUserQuota(userId) {
    const session = getUserSession(userId);
    const now = Date.now();

    if (now < session.cooldownUntil) {
        const remainingHours = Math.ceil((session.cooldownUntil - now) / (1000 * 60 * 60));
        return { allowed: false, message: `Batas kuota habis. Silakan tunggu ${remainingHours} jam lagi.` };
    }

    if (session.count >= MAX_USER_LIMIT) {
        session.cooldownUntil = now + (COOLDOWN_HOURS * 60 * 60 * 1000);
        session.count = 0;
        return { allowed: false, message: `Batas ${MAX_USER_LIMIT} pencarian tercapai. Cooldown ${COOLDOWN_HOURS} jam dimulai.` };
    }

    return { allowed: true, remaining: MAX_USER_LIMIT - session.count };
}

function recordUsage(userId) {
    const session = getUserSession(userId);
    session.count++;
}

// ===== ROLE VERIFICATION =====
function verifyRole(pin) {
    if (!pin) return { role: 'user', authorized: true };
    if (pin === FAMILY_PIN) return { role: 'family', authorized: true };
    if (pin === ADMIN_PIN) return { role: 'admin', authorized: true };
    return { role: null, authorized: false };
}

// Helper untuk eksekusi perintah shell berbasis Promise
function runCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                return reject(new Error(stderr || error.message));
            }
            resolve(stdout);
        });
    });
}

// Fungsi kirim ke AudD dengan deteksi error API vs lagu tidak ditemukan
async function callAuddApi(filePath) {
    if (AUDD_TOKENS.length === 0) {
        throw new Error('CONFIG_ERROR: Tidak ada token AudD yang dikonfigurasi di Railway Variables.');
    }

    let attempts = 0;
    while (attempts < AUDD_TOKENS.length) {
        const token = getActiveToken();
        const form = new FormDataNode();
        form.append('api_token', token);
        form.append('file', fs.createReadStream(filePath));
        form.append('return', 'apple_music,spotify');

        try {
            const response = await axios.post('https://api.audd.io/', form, {
                headers: form.getHeaders(),
                timeout: 20000
            });

            const data = response.data;

            // Berhasil mengenali lagu
            if (data && data.status === 'success') {
                return { recognized: true, result: data.result };
            }

            // Jika API merespon error terkait token / kuota / rate limit -> rotasi token
            if (data && data.error) {
                const errCode = data.error.error_code;
                const errMsg = data.error.error_message || '';
                console.warn(`[AudD Token Issue] Kode: ${errCode}, Pesan: ${errMsg}`);
                
                if ([900, 901, 902, 300, 600].includes(errCode) || errMsg.toLowerCase().includes('token') || errMsg.toLowerCase().includes('limit')) {
                    rotateToken();
                    attempts++;
                    continue;
                }
            }

            // Jika status failed tapi bukan error token (artinya lagu memang tidak dikenal oleh token ini)
            return { recognized: false };

        } catch (err) {
            console.error(`[AudD Network Error]: ${err.message}`);
            rotateToken();
            attempts++;
        }
    }

    throw new Error('TOKEN_EXHAUSTED: Semua token AudD gagal atau habis kuotanya.');
}

// Multi-sample recognition: membuat potongan audio dari posisi berbeda
async function recognizeWithMultiSamples(originalMp3Path, outputDir, baseName) {
    console.log(`[Recognition] Mencoba sample 1 (Utuh/Awal)...`);
    let res1 = await callAuddApi(originalMp3Path);
    if (res1.recognized) return res1.result;

    let duration = 30;
    try {
        const probeOut = await runCommand(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${originalMp3Path}"`);
        duration = parseFloat(probeOut) || 30;
    } catch (e) {
        // abaikan
    }

    if (duration > 15) {
        const midTime = Math.floor(duration / 2);
        const sample2Path = path.join(outputDir, `${baseName}_mid.mp3`);
        try {
            console.log(`[Recognition] Sample 1 nihil. Membuat sample 2 di detik ke-${midTime}...`);
            await runCommand(`ffmpeg -y -ss ${midTime} -i "${originalMp3Path}" -t 12 -q:a 2 "${sample2Path}"`);
            if (fs.existsSync(sample2Path) && fs.statSync(sample2Path).size > 1000) {
                let res2 = await callAuddApi(sample2Path);
                if (fs.existsSync(sample2Path)) fs.unlinkSync(sample2Path);
                if (res2.recognized) return res2.result;
            }
        } catch (err) {
            if (fs.existsSync(sample2Path)) fs.unlinkSync(sample2Path);
        }

        if (duration > 30) {
            const quarterTime = Math.floor(duration * 0.75);
            const sample3Path = path.join(outputDir, `${baseName}_end.mp3`);
            try {
                console.log(`[Recognition] Sample 2 nihil. Membuat sample 3 di detik ke-${quarterTime}...`);
                await runCommand(`ffmpeg -y -ss ${quarterTime} -i "${originalMp3Path}" -t 12 -q:a 2 "${sample3Path}"`);
                if (fs.existsSync(sample3Path) && fs.statSync(sample3Path).size > 1000) {
                    let res3 = await callAuddApi(sample3Path);
                    if (fs.existsSync(sample3Path)) fs.unlinkSync(sample3Path);
                    if (res3.recognized) return res3.result;
                }
            } catch (err) {
                if (fs.existsSync(sample3Path)) fs.unlinkSync(sample3Path);
            }
        }
    }

    return null;
}

// Resolver short URL TikTok
async function resolveShortUrl(inputUrl) {
    try {
        if (!inputUrl.includes('vm.tiktok.com') && !inputUrl.includes('vt.tiktok.com')) {
            return inputUrl;
        }
        const response = await axios.get(inputUrl, {
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 400,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        return response.request.res.responseUrl || inputUrl;
    } catch (err) {
        return inputUrl;
    }
}

app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

const uploadDir = path.join(__dirname, 'temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ===== ENDPOINT RECOGNIZE URL DENGAN ROLE-BASED QUOTA =====
app.post('/api/recognize-url', async (req, res) => {
    let { url, userId = 'default_user', pin } = req.body;
    
    if (!url) return res.status(400).json({ success: false, message: 'Input kosong.' });

    // Verify role
    const roleCheck = verifyRole(pin);
    if (!roleCheck.authorized) {
        return res.status(401).json({ success: false, message: 'PIN tidak valid', role: null });
    }

    // Check quota untuk user reguler saja
    if (roleCheck.role === 'user') {
        const quotaCheck = verifyUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json({ 
                success: false, 
                message: quotaCheck.message,
                role: 'user',
                attemptsLeft: 0
            });
        }
    }

    url = url.trim();
    let targetCommandTarget = '';
    const isUrl = url.startsWith('http://') || url.startsWith('https://');

    if (isUrl) {
        targetCommandTarget = await resolveShortUrl(url);
    } else {
        targetCommandTarget = `ytsearch1:${url}`;
    }

    const uniqueId = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const outputPattern = path.join(uploadDir, uniqueId);
    const finalMp3Path = `${outputPattern}.mp3`;

    const ytDlpCommand = `yt-dlp -x --audio-format mp3 --audio-quality 0 --no-playlist --extractor-args youtube:player_client=android,web -o "${outputPattern}.%(ext)s" "${targetCommandTarget}"`;

    let generatedAudioFile = null;

    try {
        console.log(`[yt-dlp] Mengambil media dari: ${targetCommandTarget}`);
        await runCommand(ytDlpCommand);

        const files = fs.readdirSync(uploadDir);
        generatedAudioFile = files.find(file => file.startsWith(uniqueId) && file.endsWith('.mp3'));

        if (!generatedAudioFile) {
            return res.status(500).json({ success: false, message: 'Gagal mengekstrak audio dari sumber.' });
        }

        const fullAudioPath = path.join(uploadDir, generatedAudioFile);
        const stats = fs.statSync(fullAudioPath);

        if (stats.size < 1000) {
            return res.status(500).json({ success: false, message: 'File audio terlalu kecil atau kosong.' });
        }

        // Multi-Sample Recognition
        let songResult = await recognizeWithMultiSamples(fullAudioPath, uploadDir, uniqueId);

        // Cleanup file utama
        if (fs.existsSync(fullAudioPath)) fs.unlinkSync(fullAudioPath);

        if (songResult) {
            let title = songResult.title || 'Unknown';
            let artist = songResult.artist || 'Unknown';
            let album = songResult.album || '';
            let youtubeMusic = songResult.result_spotify || '';
            let appleMusic = songResult.result_apple_music || '';

            // Prepare response
            const response = {
                success: true,
                role: roleCheck.role,
                title: title,
                artist: artist,
                album: album,
                spotify: youtubeMusic,
                apple_music: appleMusic,
                // Clip hanya untuk Family dan Admin
                clip: (roleCheck.role === 'family' || roleCheck.role === 'admin') && songResult.result_clip ? songResult.result_clip : null
            };

            // Add quota info untuk user reguler
            if (roleCheck.role === 'user') {
                recordUsage(userId);
                const remaining = MAX_USER_LIMIT - getUserSession(userId).count;
                response.attemptsLeft = remaining;
            }

            return res.json(response);
        } else {
            const response = { 
                success: false, 
                message: 'Lagu tidak dikenali',
                role: roleCheck.role
            };

            if (roleCheck.role === 'user') {
                recordUsage(userId);
                const remaining = MAX_USER_LIMIT - getUserSession(userId).count;
                response.attemptsLeft = remaining;
            }

            return res.json(response);
        }

    } catch (err) {
        console.error("[Process Error]:", err.message);
        let userMsg = 'Kesalahan internal server';
        if (err.message.includes('yt-dlp') || err.message.includes('Unable to download')) {
            userMsg = 'Gagal mengambil video dari TikTok';
        } else if (err.message.includes('ffmpeg') || err.message.includes('ffprobe')) {
            userMsg = 'Gagal mengekstrak audio';
        } else if (err.message.includes('TOKEN_EXHAUSTED')) {
            userMsg = 'Recognition API gagal (Kuota token habis)';
        }
        
        const response = { 
            success: false, 
            message: userMsg,
            role: roleCheck.role
        };

        if (roleCheck.role === 'user') {
            recordUsage(userId);
            const remaining = MAX_USER_LIMIT - getUserSession(userId).count;
            response.attemptsLeft = remaining;
        }

        return res.status(500).json(response);

    } finally {
        try {
            const leftoverFiles = fs.readdirSync(uploadDir);
            leftoverFiles.forEach(file => {
                if (file.includes(uniqueId)) {
                    const p = path.join(uploadDir, file);
                    if (fs.existsSync(p)) fs.unlinkSync(p);
                }
            });
        } catch (cleanupErr) {
            // abaikan
        }
    }
});

// ===== ENDPOINT RECOGNIZE FILE DENGAN ROLE-BASED QUOTA =====
app.post('/api/recognize-file', upload.single('file'), async (req, res) => {
    let filePath = null;
    let { userId = 'default_user', pin } = req.body;

    // Verify role
    const roleCheck = verifyRole(pin);
    if (!roleCheck.authorized) {
        return res.status(401).json({ success: false, message: 'PIN tidak valid', role: null });
    }

    // Check quota untuk user reguler saja
    if (roleCheck.role === 'user') {
        const quotaCheck = verifyUserQuota(userId);
        if (!quotaCheck.allowed) {
            return res.status(429).json({ 
                success: false, 
                message: quotaCheck.message,
                role: 'user',
                attemptsLeft: 0
            });
        }
    }

    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'File tidak ada.' });

        filePath = req.file.path;
        const uniqueId = `upload_${Date.now()}`;
        
        let songResult = await recognizeWithMultiSamples(filePath, uploadDir, uniqueId);

        if (songResult) {
            let title = songResult.title || 'Unknown';
            let artist = songResult.artist || 'Unknown';
            let album = songResult.album || '';
            let youtubeMusic = songResult.result_spotify || '';
            let appleMusic = songResult.result_apple_music || '';

            const response = {
                success: true,
                role: roleCheck.role,
                title: title,
                artist: artist,
                album: album,
                spotify: youtubeMusic,
                apple_music: appleMusic,
                clip: (roleCheck.role === 'family' || roleCheck.role === 'admin') && songResult.result_clip ? songResult.result_clip : null
            };

            if (roleCheck.role === 'user') {
                recordUsage(userId);
                const remaining = MAX_USER_LIMIT - getUserSession(userId).count;
                response.attemptsLeft = remaining;
            }

            return res.json(response);
        } else {
            const response = { 
                success: false, 
                message: 'Lagu tidak dikenali',
                role: roleCheck.role
            };

            if (roleCheck.role === 'user') {
                recordUsage(userId);
                const remaining = MAX_USER_LIMIT - getUserSession(userId).count;
                response.attemptsLeft = remaining;
            }

            return res.json(response);
        }
    } catch (err) {
        console.error("[Upload Error]:", err.message);
        const response = { 
            success: false, 
            message: 'Recognition API gagal',
            role: roleCheck.role
        };

        if (roleCheck.role === 'user') {
            recordUsage(userId);
            const remaining = MAX_USER_LIMIT - getUserSession(userId).count;
            response.attemptsLeft = remaining;
        }

        return res.status(500).json(response);
    } finally {
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
        }
    }
});

app.listen(PORT, () => console.log(`SongFinder Backend running on port ${PORT}`));
