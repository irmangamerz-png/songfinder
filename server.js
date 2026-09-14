/**
 * SongFinder Pro V3 - Backend Server
 * Secure Audio Fingerprint Matcher & Multi-Sample Recognition Engine
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;
const AUDD_TOKEN = process.env.AUDD_TOKEN;

// Validasi Environment Key di awal
if (!AUDD_TOKEN) {
    console.warn("[SongFinder Warning] AUDD_TOKEN belum diatur di environment variable!");
}

// Konfigurasi CORS ketat untuk GitHub Pages Anda
const ALLOWED_ORIGIN = 'https://irmangamerz-png.github.io';
app.use(cors({
    origin: function (origin, callback) {
        // Izinkan request tanpa origin (seperti Postman atau server-to-server) atau dari GitHub Pages spesifik
        if (!origin || origin === ALLOWED_ORIGIN || origin.startsWith('http://localhost')) {
            callback(null, true);
        } else {
            callback(new Error('CORS Policy Blocked: Origin tidak diizinkan.'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Konfigurasi Rate Limiting dasar
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 100, // Batasi 100 request per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        reason: 'API_RATE_LIMIT',
        message: 'Terlalu banyak permintaan dari IP ini, silakan coba beberapa saat lagi.'
    }
});
app.use('/api/', limiter);

// Konfigurasi Multer untuk Upload File sementara
const uploadDir = path.join(__dirname, 'temp_uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 50 * 1024 * 1024 } // Batas Maksimal 50MB
});

// Logger Aman (Tanpa membocorkan secret/token)
function logEvent(step, details = '') {
    console.log(`[SongFinder] [${new Date().toISOString()}] ${step} ${details}`);
}

// Helper: Hapus file sementara dengan aman
function safeUnlink(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (e) {
            // Abaikan error penghapusan file kecil
        }
    }
}

// Helper: Ekstrak audio WAV menggunakan FFmpeg dengan Multi-Sample (atau sampel tunggal optimal)
async function extractAudioSegments(inputPath, outputDir) {
    return new Promise((resolve, reject) => {
        // Dapatkan durasi file terlebih dahulu menggunakan ffprobe / ffmpeg
        exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`, (err, stdout) => {
            let duration = parseFloat(stdout.trim());
            if (isNaN(duration) || duration <= 0) {
                duration = 30; // Default fallback asumsi 30 detik
            }

            const baseName = path.basename(inputPath, path.extname(inputPath));
            const segments = [];

            // Tentukan titik potong sampel (multi-sample: awal, 25%, 45%, 65%, akhir)
            let offsets = [0];
            if (duration > 15) {
                offsets = [
                    Math.min(2, duration * 0.05),
                    duration * 0.25,
                    duration * 0.45,
                    duration * 0.65,
                    Math.max(0, duration - 12)
                ];
            }

            let completed = 0;
            offsets.forEach((startSec, index) => {
                const segPath = path.join(outputDir, `${baseName}_seg_${index}.wav`);
                // Ekstrak 10 detik audio per segmen ke format mono 16kHz WAV agar optimal untuk AudD
                const cmd = `ffmpeg -y -ss ${startSec} -t 10 -i "${inputPath}" -ac 1 -ar 16000 "${segPath}"`;
                
                exec(cmd, (ffmpegErr) => {
                    completed++;
                    if (!ffmpegErr && fs.existsSync(segPath) && fs.statSync(segPath).size > 1000) {
                        segments.push(segPath);
                    }
                    if (completed === offsets.length) {
                        if (segments.length > 0) {
                            resolve(segments);
                        } else {
                            // Fallback ekstrak total jika segmen gagal
                            const fallbackPath = path.join(outputDir, `${baseName}_fallback.wav`);
                            exec(`ffmpeg -y -i "${inputPath}" -ac 1 -ar 16000 "${fallbackPath}"`, (fbErr) => {
                                if (!fbErr && fs.existsSync(fallbackPath)) {
                                    resolve([fallbackPath]);
                                } else {
                                    reject(new Error('AUDIO_EXTRACTION_FAILED'));
                                }
                            });
                        }
                    }
                });
            });
        });
    });
}

// Fungsi inti pencocokan sidik jari ke AudD API
async function recognizeAudioFile(filePath) {
    if (!AUDD_TOKEN) {
        throw new Error('API_TOKEN_MISSING');
    }

    const formData = new FormData();
    formData.append('api_token', AUDD_TOKEN);
    formData.append('file', fs.createReadStream(filePath));
    formData.append('return', 'spotify,apple_music');

    try {
        const response = await axios.post('https://api.audd.io/', formData, {
            headers: formData.getHeaders(),
            timeout: 20000
        });

        const data = response.data;
        if (data && data.status === 'success' && data.result) {
            return {
                title: data.result.title,
                artist: data.result.artist,
                album: data.result.album || 'Unknown Album',
                confidence: 0.95
            };
        }
        return null;
    } catch (error) {
        throw new Error('RECOGNITION_API_ERROR');
    }
}

// Proses Multi-Sample Recognition Voting
async function performMultiSampleRecognition(segmentPaths) {
    let candidates = [];

    for (let segPath of segmentPaths) {
        try {
            logEvent('Sample recognition check', `Processing segment: ${path.basename(segPath)}`);
            const res = await recognizeAudioFile(segPath);
            if (res && res.title) {
                candidates.push(res);
            }
        } catch (e) {
            // Lanjutkan sampel berikutnya jika ada yang gagal
        }
    }

    if (candidates.length === 0) return null;

    // Sistem Voting Mayoritas untuk hasil paling konsisten
    let scoreMap = {};
    for (let c of candidates) {
        let key = `${(c.title || '').toLowerCase().trim()}___${(c.artist || '').toLowerCase().trim()}`;
        if (!scoreMap[key]) {
            scoreMap[key] = { count: 0, data: c };
        }
        scoreMap[key].count++;
    }

    let bestCandidate = null;
    let maxCount = -1;
    for (let key in scoreMap) {
        if (scoreMap[key].count > maxCount) {
            maxCount = scoreMap[key].count;
            bestCandidate = scoreMap[key].data;
        }
    }

    return bestCandidate;
}

// ==========================================
// API ENDPOINTS
// ==========================================

// 1. Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server: 'SongFinder Pro V3 Backend', timestamp: new Date().toISOString() });
});

// 2. Recognize via File Upload
app.post('/api/recognize-file', upload.single('file'), async (req, res) => {
    let inputFilePath = req.file ? req.file.path : null;
    let generatedSegments = [];

    try {
        logEvent('Request received', 'Endpoint: /api/recognize-file');
        if (!req.file) {
            return res.status(400).json({ success: false, reason: 'INVALID_FILE', message: 'File audio/video tidak ditemukan.' });
        }

        logEvent('Audio extraction started', `File: ${req.file.originalname}`);
        generatedSegments = await extractAudioSegments(inputFilePath, uploadDir);
        logEvent('Audio extraction success', `Generated ${generatedSegments.length} segments`);

        logEvent('Music recognition started');
        const recognitionResult = await performMultiSampleRecognition(generatedSegments);

        if (recognitionResult) {
            logEvent('Final result found', `${recognitionResult.title} - ${recognitionResult.artist}`);
            return res.json({
                success: true,
                result: recognitionResult
            });
        } else {
            logEvent('Result not found');
            return res.json({
                success: false,
                reason: 'NOT_FOUND',
                message: 'Lagu belum berhasil dikenali dari audio.'
            });
        }

    } catch (error) {
        logEvent('Server error / exception', error.message);
        let reason = 'SERVER_ERROR';
        if (error.message === 'AUDIO_EXTRACTION_FAILED') reason = 'AUDIO_EXTRACTION_FAILED';
        if (error.message === 'RECOGNITION_API_ERROR') reason = 'API_TIMEOUT';
        
        return res.status(500).json({
            success: false,
            reason: reason,
            message: 'Terjadi kesalahan sistem saat memproses berkas audio.'
        });
    } finally {
        // Bersihkan seluruh file sementara
        safeUnlink(inputFilePath);
        generatedSegments.forEach(seg => safeUnlink(seg));
    }
});

// 3. Recognize via URL (TikTok / YouTube)
app.post('/api/recognize-url', async (req, res) => {
    let downloadedMedia = null;
    let generatedSegments = [];

    try {
        logEvent('Request received', 'Endpoint: /api/recognize-url');
        const mediaUrl = req.body.url;
        if (!mediaUrl || typeof mediaUrl !== 'string') {
            return res.status(400).json({ success: false, reason: 'INVALID_URL', message: 'URL tidak valid atau kosong.' });
        }

        logEvent('Source URL', mediaUrl);
        let streamAudioUrl = '';

        // Ekstraksi Link TikTok menggunakan TikWM API Publik untuk mengambil file audio asli tanpa caption
        if (mediaUrl.includes('tiktok.com') || mediaUrl.includes('vm.tiktok.com')) {
            logEvent('Media extraction started', 'Type: TikTok');
            try {
                const tikRes = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(mediaUrl)}`, { timeout: 12000 });
                if (tikRes.data && tikRes.data.code === 0 && tikRes.data.data) {
                    streamAudioUrl = tikRes.data.data.music || tikRes.data.data.play || '';
                }
            } catch (e) {
                logEvent('TikTok extraction warning', e.message);
            }
        } 
        // Penanganan YouTube URL (Mengunduh audio streaming via ytdl-core atau alternatif langsung jika didukung)
        else if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) {
            logEvent('Media extraction started', 'Type: YouTube');
            // Catatan: Pastikan dependensi seperti ytdl-core terpasang jika ingin support penuh YouTube streaming.
            // Sebagai alternatif yang stabil tanpa broken dependency, gunakan endpoint fallback streaming atau pustaka eksternal.
            streamAudioUrl = mediaUrl; // Placeholder langsung diarahkan jika didukung provider stream
        } else {
            return res.status(400).json({ success: false, reason: 'UNSUPPORTED_FORMAT', message: 'Format URL tidak didukung.' });
        }

        if (!streamAudioUrl) {
            return res.status(400).json({ success: false, reason: 'MEDIA_EXTRACTION_FAILED', message: 'Gagal mengekstrak media/audio asli dari URL.' });
        }

        logEvent('Media extraction success');

        // Unduh stream audio ke file lokal sementara untuk diproses FFmpeg
        const tempMediaName = path.join(uploadDir, `download_${Date.now()}.mp4`);
        const writer = fs.createWriteStream(tempMediaName);

        const responseStream = await axios({
            url: streamAudioUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 15000
        });

        responseStream.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        downloadedMedia = tempMediaName;

        logEvent('Audio extraction started');
        generatedSegments = await extractAudioSegments(downloadedMedia, uploadDir);
        logEvent('Audio extraction success', `Generated ${generatedSegments.length} segments`);

        logEvent('Music recognition started');
        const recognitionResult = await performMultiSampleRecognition(generatedSegments);

        if (recognitionResult) {
            logEvent('Final result found', `${recognitionResult.title} - ${recognitionResult.artist}`);
            return res.json({
                success: true,
                result: recognitionResult
            });
        } else {
            logEvent('Result not found');
            return res.json({
                success: false,
                reason: 'NOT_FOUND',
                message: 'Lagu belum berhasil dikenali dari audio.'
            });
        }

    } catch (error) {
        logEvent('Server error / exception', error.message);
        return res.status(500).json({
            success: false,
            reason: 'SERVER_ERROR',
            message: 'Terjadi kesalahan sistem saat memproses URL media.'
        });
    } finally {
        safeUnlink(downloadedMedia);
        generatedSegments.forEach(seg => safeUnlink(seg));
    }
});

// Jalankan Server
app.listen(PORT, () => {
    console.log(`[SongFinder Server] Berjalan aktif di port ${PORT}`);
});
