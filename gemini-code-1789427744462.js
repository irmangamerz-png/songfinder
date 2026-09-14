require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;
const AUDD_TOKEN = process.env.AUDD_TOKEN;

// Pastikan direktori temp ada
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: tempDIR => fs.mkdirSync(TEMP_DIR, { recursive: true }) });
}

// Konfigurasi Multer untuk upload file
const upload = multer({
    dest: TEMP_DIR,
    limits: { fileSize: 50 * 1024 * 1024 } // Batas 50MB
});

// Middleware CORS khusus untuk Frontend GitHub Pages Anda
const allowedOrigins = [
    'https://irmangamerz-png.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('CORS policy violation: Origin not allowed.'));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiter untuk mencegah penyalahgunaan API
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 50, // Batas 50 request per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        reason: 'RATE_LIMIT_EXCEEDED',
        message: 'Terlalu banyak permintaan. Silakan coba lagi nanti.'
    }
});
app.use('/api/', limiter);

// Logging Middleware Aman (Tanpa Secret)
app.use((req, res, next) => {
    console.log(`[SongFinder] Request received: ${req.method} ${req.path}`);
    next();
});

// Helper: Hapus file sementara dengan aman
const safeUnlink = (filePath) => {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error(`[SongFinder] Gagal menghapus file temp: ${filePath}`, err.message);
    }
};

// Endpoint: Health Check
app.get('/api/health', (req, res) => {
    res.status(200).json({ success: true, status: 'Server is active and running.' });
});

// Helper: Ekstraksi Audio dari URL menggunakan yt-dlp / axios
async function extractAudioFromUrl(mediaUrl) {
    const outputId = Date.now() + Math.random().toString(36.substring(7));
    const outputAudioPath = path.join(TEMP_DIR, `${outputId}.mp3`);

    console.log(`[SongFinder] Media extraction started for URL: ${mediaUrl}`);

    try {
        // Cek apakah menggunakan yt-dlp (untuk TikTok / YouTube)
        // Pastikan yt-dlp terinstal di environment server Anda
        const ytdlpCmd = `yt-dlp -x --audio-format mp3 -o "${path.join(TEMP_DIR, outputId)}.%(ext)s" "${mediaUrl}"`;
        await execPromise(ytdlpCmd);

        // Cari file mp3 yang dihasilkan
        if (fs.existsSync(outputAudioPath)) {
            console.log(`[SongFinder] Media extraction success via yt-dlp`);
            return outputAudioPath;
        }

        throw new Error('MEDIA_EXTRACTION_FAILED');
    } catch (error) {
        console.warn(`[SongFinder] yt-dlp gagal, mencoba direct stream fallback...`);
        // Fallback langsung jika link adalah direct media URL (seperti dari TikWM API / CDN langsung)
        try {
            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'stream',
                timeout: 20000
            });

            const writer = fs.createWriteStream(outputAudioPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log(`[SongFinder] Direct stream audio extraction success`);
            return outputAudioPath;
        } catch (directErr) {
            console.error(`[SongFinder] Audio extraction failed completely:`, directErr.message);
            throw new Error('AUDIO_EXTRACTION_FAILED');
        }
    }
}

// Helper: Multi-Sample Audio Processing menggunakan FFmpeg
async function generateSamples(inputAudioPath) {
    const samples = [];
    try {
        // Dapatkan durasi file audio menggunakan ffprobe
        const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputAudioPath}"`);
        const duration = parseFloat(stdout.trim());

        if (isNaN(duration) || duration <= 3) {
            // Jika durasi terlalu pendek, gunakan file utuh sebagai 1 sample
            return [inputAudioPath];
        }

        // Tentukan titik potong multi-sample (awal, 25%, tengah, 75%, akhir)
        // Masing-masing sample berdurasi 10 detik
        const sampleDuration = 10;
        const positions = [
            0,
            duration * 0.25,
            duration * 0.50,
            duration * 0.75,
            Math.max(0, duration - sampleDuration - 1)
        ];

        for (let i = 0; i < positions.length; i++) {
            const start = positions[i];
            const samplePath = path.join(TEMP_DIR, `sample_${i}_${Date.now()}.mp3`);
            
            try {
                // Ekstrak potongan audio dengan ffmpeg
                await execPromise(`ffmpeg -ss ${start} -t ${sampleDuration} -i "${inputAudioPath}" -q:a 2 -ar 44100 "${samplePath}" -y`);
                if (fs.existsSync(samplePath)) {
                    samples.push(samplePath);
                }
            } catch (sampleErr) {
                console.warn(`[SongFinder] Gagal membuat sample ke-${i + 1}`);
            }
        }
    } catch (e) {
        console.warn(`[SongFinder] FFprobe/FFmpeg duration check failed, fallback to full audio.`);
    }

    if (samples.length === 0) {
        samples.push(inputAudioPath);
    }

    return samples;
}

// Helper: Kirim ke Music Recognition API (AudD)
async function recognizeWithAudD(audioFilePath) {
    const form = new FormData();
    form.append('api_token', AUDD_TOKEN);
    form.append('file', fs.createReadStream(audioFilePath));
    form.append('return', 'spotify,apple_music,media');

    try {
        const response = await axios.post('https://api.audd.io/', form, {
            headers: ...form.getHeaders(),
            timeout: 25000
        });
        return response.data;
    } catch (error) {
        throw new Error('API_TIMEOUT');
    }
}

// Endpoint: Recognize via URL (TikTok / YouTube)
app.post('/api/recognize-url', async (req, res) => {
    let downloadedAudio = null;
    let sampleFiles = [];
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, reason: 'INVALID_URL', message: 'URL tidak boleh kosong.' });
        }

        console.log(`[SongFinder] Processing URL recognition: ${url}`);
        downloadedAudio = await extractAudioFromUrl(url);

        console.log(`[SongFinder] Audio extraction success. Generating multi-samples...`);
        sampleFiles = await generateSamples(downloadedAudio);

        let recognizedResult = null;

        // Multi-sample iteration
        for (let i = 0; i < sampleFiles.length; i++) {
            console.log(`[SongFinder] Sample ${i + 1} recognition started...`);
            const apiRes = await recognizeWithAudD(sampleFiles[i]);

            if (apiRes && apiRes.status === 'success' && apiRes.result) {
                recognizedResult = apiRes.result;
                console.log(`[SongFinder] Candidate found on sample ${i + 1}: ${recognizedResult.title}`);
                break; // Hentikan jika sudah ketemu yang valid
            }
        }

        // Bersihkan file temp
        safeUnlink(downloadedAudio);
        sampleFiles.forEach(f => safeUnlink(f));

        if (recognizedResult && recognizedResult.title) {
            return res.status(200).json({
                success: true,
                result: {
                    title: recognizedResult.title,
                    artist: recognizedResult.artist,
                    album: recognizedResult.album || 'Audio Teridentifikasi',
                    confidence: 0.95
                }
            });
        } else {
            return res.status(200).json({
                success: false,
                reason: 'NOT_FOUND',
                message: 'Lagu belum berhasil dikenali dari audio.'
            });
        }

    } catch (error) {
        safeUnlink(downloadedAudio);
        if (sampleFiles) sampleFiles.forEach(f => safeUnlink(f));

        console.error(`[SongFinder Error]`, error.message);
        let errCode = 'SERVER_ERROR';
        if (error.message === 'MEDIA_EXTRACTION_FAILED') errCode = 'MEDIA_EXTRACTION_FAILED';
        if (error.message === 'AUDIO_EXTRACTION_FAILED') errCode = 'AUDIO_EXTRACTION_FAILED';
        if (error.message === 'API_TIMEOUT') errCode = 'API_TIMEOUT';

        return res.status(500).json({
            success: false,
            reason: errCode,
            message: 'Terjadi kesalahan saat memproses audio di server.'
        });
    }
});

// Endpoint: Recognize via Upload File
app.post('/api/recognize-file', upload.single('file'), async (req, res) => {
    let filePath = req.file ? req.file.path : null;
    let sampleFiles = [];
    try {
        if (!filePath) {
            return res.status(400).json({ success: false, reason: 'INVALID_FILE', message: 'File tidak ditemukan.' });
        }

        console.log(`[SongFinder] Processing uploaded file recognition`);
        sampleFiles = await generateSamples(filePath);

        let recognizedResult = null;

        for (let i = 0; i < sampleFiles.length; i++) {
            const apiRes = await recognizeWithAudD(sampleFiles[i]);
            if (apiRes && apiRes.status === 'success' && apiRes.result) {
                recognizedResult = apiRes.result;
                break;
            }
        }

        safeUnlink(filePath);
        sampleFiles.forEach(f => safeUnlink(f));

        if (recognizedResult && recognizedResult.title) {
            return res.status(200).json({
                success: true,
                result: {
                    title: recognizedResult.title,
                    artist: recognizedResult.artist,
                    album: recognizedResult.album || 'Audio Teridentifikasi',
                    confidence: 0.95
                }
            });
        } else {
            return res.status(200).json({
                success: false,
                reason: 'NOT_FOUND',
                message: 'Lagu belum berhasil dikenali dari audio.'
            });
        }

    } catch (error) {
        safeUnlink(filePath);
        if (sampleFiles) sampleFiles.forEach(f => safeUnlink(f));

        return res.status(500).json({
            success: false,
            reason: 'RECOGNITION_FAILED',
            message: 'Gagal mengenali file yang diunggah.'
        });
    }
});

app.listen(PORT, () => {
    console.log(`[SongFinder] Server is running securely on port ${PORT}`);
});