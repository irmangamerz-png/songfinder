const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Membaca token dari Railway. Jika dipisah koma, otomatis jadi daftar cadangan.
const rawTokens = process.env.AUDD_TOKEN || 'bc19167188cfb76c3692367bb5b36355';
const AUDD_TOKENS = rawTokens.split(',').map(t => t.trim()).filter(t => t.length > 0);

let currentTokenIndex = 0;

function getActiveToken() {
    return AUDD_TOKENS[currentTokenIndex];
}

function rotateToken() {
    currentTokenIndex = (currentTokenIndex + 1) % AUDD_TOKENS.length;
    console.log(`[Token Switch] Kuota token habis/invalid, berpindah ke token cadangan indeks ke-${currentTokenIndex}`);
}

// Fungsi otomatis mencoba token bergantian jika gagal
async function recognizeWithAudd(filePath) {
    let attempts = 0;
    while (attempts < AUDD_TOKENS.length) {
        const token = getActiveToken();
        const FormDataNode = require('form-data');
        const form = new FormDataNode();
        form.append('api_token', token);
        form.append('file', fs.createReadStream(filePath));
        form.append('return', 'apple_music,spotify');

        try {
            const auddResponse = await axios.post('https://api.audd.io/', form, {
                headers: form.getHeaders()
            });

            if (auddResponse.data && auddResponse.data.status === 'success') {
                return auddResponse.data;
            }

            if (auddResponse.data && auddResponse.data.error) {
                console.warn(`[Token Warning] Token aktif bermasalah:`, auddResponse.data.error.error_message);
                rotateToken();
                attempts++;
                continue;
            }

            return auddResponse.data;
        } catch (err) {
            console.error(`[Error] Gagal koneksi dengan token aktif:`, err.message);
            rotateToken();
            attempts++;
        }
    }
    throw new Error('Semua token AudD gagal atau habis kuotanya.');
}

// Fungsi untuk memperluas link pendek (seperti vm.tiktok.com) menjadi link panjang aslinya
async function resolveShortUrl(inputUrl) {
    try {
        if (!inputUrl.includes('vm.tiktok.com') && !inputUrl.includes('vt.tiktok.com')) {
            return inputUrl; // Jika bukan link pendek, kembalikan apa adanya
        }
        
        console.log(`[Redirect] Melacak link pendek: ${inputUrl}`);
        const response = await axios.get(inputUrl, {
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Tangkap status redirect
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const finalUrl = response.request.res.responseUrl || inputUrl;
        console.log(`[Redirect Success] Link panjang ditemukan: ${finalUrl}`);
        return finalUrl;
    } catch (err) {
        console.warn(`[Redirect Warning] Gagal melacak link pendek, mencoba menggunakan link asli:`, err.message);
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

app.get('/', (req, res) => {
    res.send(`SongFinder Backend Active. Total loaded tokens: ${AUDD_TOKENS.length}`);
});

// Endpoint URL TikTok / Media dengan Auto-Resolve Short Link
app.post('/api/recognize-url', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'URL kosong.' });

    // Lacak dulu jika itu link pendek TikTok
    const targetUrl = await resolveShortUrl(url);

    const outputFilePath = path.join(uploadDir, `audio_${Date.now()}.mp3`);
    const command = `yt-dlp -x --audio-format mp3 --no-playlist -o "${outputFilePath.replace('.mp3', '')}.%(ext)s" "${targetUrl}"`;

    console.log(`[yt-dlp] Memulai download dari URL: ${targetUrl}`);

    exec(command, async (error, stdout, stderr) => {
        if (error) {
            console.error("[yt-dlp Error]", stderr);
            return res.status(500).json({ success: false, message: 'Gagal mendownload audio dari URL (yt-dlp error).' });
        }

        try {
            const files = fs.readdirSync(uploadDir);
            const generatedFile = files.find(file => file.endsWith('.mp3') && file.startsWith('audio_'));

            if (!generatedFile) {
                console.error("[yt-dlp] File MP3 hasil ekstrak tidak ditemukan di folder temp.");
                return res.status(500).json({ success: false, message: 'Gagal mengekstrak audio dari URL.' });
            }

            const finalAudioPath = path.join(uploadDir, generatedFile);
            const stats = fs.statSync(finalAudioPath);
            console.log(`[Audio Ready] File berhasil dibuat: ${finalAudioPath}, Ukuran: ${stats.size} bytes`);

            if (stats.size < 1000) {
                if (fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);
                return res.status(500).json({ success: false, message: 'File hasil download kosong atau rusak.' });
            }

            const auddResult = await recognizeWithAudd(finalAudioPath);

            if (fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);

            if (auddResult && auddResult.status === 'success') {
                return res.json({ success: true, result: auddResult.result });
            } else {
                console.log("[AudD Respon Kosong]:", auddResult);
                return res.json({ success: false, message: 'Lagu tidak ditemukan dalam database.' });
            }
        } catch (err) {
            console.error("[Server Error saat proses file]:", err);
            return res.status(500).json({ success: false, message: 'Kesalahan server saat memproses audio.' });
        }
    });
});

// Endpoint Upload File
app.post('/api/recognize-file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'File tidak ada.' });

        const filePath = req.file.path;
        const auddResult = await recognizeWithAudd(filePath);

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        if (auddResult && auddResult.status === 'success') {
            return res.json({ success: true, result: auddResult.result });
        } else {
            return res.json({ success: false, message: 'Lagu tidak ditemukan.' });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Gagal memproses file.' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
