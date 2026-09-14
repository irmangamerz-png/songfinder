require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ytDlp = require('yt-dlp-exec');

// Atur path binary FFmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const PORT = process.env.PORT || 3000;
const AUDD_TOKEN = process.env.AUDD_TOKEN;

// Direktori sementara untuk file audio
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Konfigurasi Multer untuk upload file lokal
const upload = multer({
    dest: TEMP_DIR,
    limits: { fileSize: 25 * 1024 * 1024 } // Batas maksimal 25MB
});

// Konfigurasi CORS khusus GitHub Pages Anda
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'https://irmangamerz-png.github.io',
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ];
        // Izinkan request tanpa origin (seperti postman atau server-to-server) atau dari origin yang diizinkan
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Blocked by CORS policy (Unauthorized Origin)'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Rate Limiting untuk mencegah spam request ke API recognition
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 100, // Maksimal 100 request per IP
    message: {
        success: false,
        reason: 'API_RATE_LIMIT',
        message: 'Terlalu banyak permintaan dari IP ini, silakan coba lagi nanti.'
    }
});
app.use('/api/', limiter);

// ----------------------------------------------------
// FUNGSI BANTUAN: EKSTRAKSI & PEMROSESAN AUDIO
// ----------------------------------------------------

// Membersihkan file temporary secara aman
function safeUnlink(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.error('[SongFinder] Gagal menghapus file temp:', err.message);
        }
    }
}

// Ekstraksi audio dari URL media (TikTok / YouTube) menggunakan yt-dlp
async function extractAudioFromUrl(mediaUrl) {
    const outputId = Date.now() + Math.random().toString(36.substring(7));
    const rawOutputTemplate = path.join(TEMP_DIR, `${outputId}.%(ext)s`);
    const finalAudioPath = path.join(TEMP_DIR, `${outputId}.mp3`);

    console.log(`[SongFinder] Memulai ekstraksi media dari URL: ${mediaUrl}`);

    try {
        // Unduh media dan ekstrak audio langsung ke MP3 menggunakan yt-dlp + ffmpeg
        await ytDlp(mediaUrl, {
            extractAudio: true,
            audioFormat: 'mp3',
            output: rawOutputTemplate,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
        });

        // Cari file hasil ekstrak dengan ekstensi .mp3 di direktori temp
        if (!fs.existsSync(finalAudioPath)) {
            // Cek file alternatif jika ekstensi berbeda lalu diconvert
            const files = fs.readdirSync(TEMP_DIR);
            const matchedFile = files.find(f => f.startsWith(outputId));
            if (matchedFile) {
                const sourcePath = path.join(TEMP_DIR, matchedFile);
                await new Promise((resolve, reject) => {
                    ffmpeg(sourcePath)
                        .toFormat('mp3')
                        .audioChannels(1)
                        .audioFrequency(16000)
                        .save(finalAudioPath)
                        .on('end', () => {
                            safeUnlink(sourcePath);
                            resolve();
                        })
                        .on('error', (err) => reject(err));
                });
            } else {
                throw new Error('MEDIA_EXTRACTION_FAILED');
            }
        }

        console.log(`[SongFinder] Ekstraksi audio sukses: ${finalAudioPath}`);
        return finalAudioPath;
    } catch (error) {
        console.error('[SongFinder] Gagal ekstraksi media:', error.message);
        throw new Error('MEDIA_EXTRACTION_FAILED');
    }
}

// Kirim file audio ke AudD API untuk pengenalan musik berbasis audio fingerprint
async function recognizeAudioWithAudD(filePath) {
    if (!AUDD_TOKEN) {
        throw new Error('SERVER_ERROR: AUDD_TOKEN belum dikonfigurasi di environment variable.');
    }

    console.log(`[SongFinder] Mengirim audio ke AudD API...`);
    const form = new FormData();
    form.append('api_token', AUDD_TOKEN);
    form.append('file', fs.createReadStream(filePath));
    form.append('return', 'spotify,apple_music,song_link');

    try {
        const response = await axios.post('https://api.audd.io/', form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 20000
        });

        const data = response.data;
        console.log('[SongFinder] Respons AudD diterima:', data.status);

        if (data.status === 'success' && data.result) {
            return {
                success: true,
                result: {
                    title: data.result.title,
                    artist: data.result.artist,
                    album: data.result.album || 'N/A',
                    confidence: 0.95,
                    spotify: data.result.spotify || null,
                    apple_music: data.result.apple_music || null,
                    song_link: data.result.song_link || null
                }
            };
        } else {
            return {
                success: false,
                reason: 'NOT_FOUND',
                message: 'Lagu belum berhasil dikenali dari audio.'
            };
        }
    } catch (error) {
        console.error('[SongFinder] Kesalahan API AudD:', error.message);
        throw new Error('RECOGNITION_FAILED');
    }
}

// ----------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------

// 1. Health Check Endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'SongFinder Pro Backend aktif dan berjalan normal.' });
});

// 2. Endpoint Auth Khusus Family Mode (Kode: Irman)
app.post('/api/auth/family', (req, res) => {
    const { code } = req.body;
    if (code === 'Irman') {
        return res.json({ success: true, role: 'family', message: 'Akses Family diberikan.' });
    }
    return.status(401).json({ success: false, message: 'Kode Family salah.' });
});

// 3. Endpoint Recognition via Upload File (Audio/Video)
app.post('/api/recognize-file', upload.single('file'), async (req, res) => {
    let filePath = req.file ? req.file.path : null;
    let processedAudioPath = null;

    try {
        if (!req.file) {
            return.status(400).json({ success: false, reason: 'INVALID_URL', message: 'File audio/video tidak ditemukan.' });
        }

        console.log(`[SongFinder] File diterima: ${req.file.originalname} (${req.file.mimetype})`);
        processedAudioPath = path.join(TEMP_DIR, `processed_${Date.now()}.mp3`);

        // Konversi file input (baik video/audio) menjadi format audio standar MP3 mono 16kHz
        await new Promise((resolve, reject) => {
            ffmpeg(filePath)
                .toFormat('mp3')
                .audioChannels(1)
                .audioFrequency(16000)
                .save(processedAudioPath)
                .on('end', resolve)
                .on('error', (err) => reject(err));
        });

        // Proses rekognisi menggunakan AudD
        const recognitionResult = await recognizeAudioWithAudD(processedAudioPath);
        return res.json(recognitionResult);

    } catch (error) {
        console.error('[SongFinder Error]:', error.message);
        let errCode = 'SERVER_ERROR';
        if (error.message.includes('RECOGNITION')) errCode = 'RECOGNITION_FAILED';
        
        return.status(500).json({
            success: false,
            reason: errCode,
            message: 'Gagal memproses file audio.'
        });
    } finally {
        safeUnlink(filePath);
        safeUnlink(processedAudioPath);
    }
});

// 4. Endpoint Recognition via URL (TikTok / YouTube / Media Link)
app.post('/api/recognize-url', async (req, res) => {
    let extractedAudioPath = null;
    try {
        const { url } = req.body;
        if (!url || typeof url !== 'string') {
            return.status(400).json({ success: false, reason: 'INVALID_URL', message: 'URL media tidak valid atau kosong.' });
        }

        console.log(`[SongFinder] Permintaan URL masuk: ${url}`);

        // Ekstraksi audio asli dari URL (Murni berdasarkan stream audio, bukan caption/deskripsi)
        extractedAudioPath = await extractAudioFromUrl(url);

        // Kirim hasil ekstraksi audio ke sistem recognition
        const recognitionResult = await recognizeAudioWithAudD(extractedAudioPath);
        return res.json(recognitionResult);

    } catch (error) {
        console.error('[SongFinder Error URL]:', error.message);
        let errCode = 'MEDIA_EXTRACTION_FAILED';
        if (error.message.includes('RECOGNITION')) errCode = 'RECOGNITION_FAILED';

        return.status(500).json({
            success: false,
            reason: errCode,
            message: 'Gagal mengekstrak atau mengenali lagu dari URL yang diberikan.'
        });
    } finally {
        safeUnlink(extractedAudioPath);
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[Unhandled Error]:', err.stack);
    res.status(500).json({
        success: false,
        reason: 'SERVER_ERROR',
        message: 'Terjadi kesalahan internal pada server.'
    });
});

app.listen(PORT, () => {
    console.log(`[SongFinder] Server backend berjalan di port ${PORT}`);
});
