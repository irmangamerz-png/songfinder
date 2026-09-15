const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Daftar Token Cadangan (Gabungkan token lama dan token baru kamu di sini)
// Jika token pertama habis, sistem otomatis lanjut ke token kedua, dst.
const AUDD_TOKENS = [
    'bc19167188cfb76c3692367bb5b36355', // Token baru kamu
    '9fd164b2d84f0af4d07f3ef9bb62359e'  // Token lama sebagai cadangan
];

let currentTokenIndex = 0;

function getActiveToken() {
    return AUDD_TOKENS[currentTokenIndex];
}

function rotateToken() {
    currentTokenIndex = (currentTokenIndex + 1) % AUDD_TOKENS.length;
    console.log(`[Token Switch] Berpindah ke token alternatif indeks ke-${currentTokenIndex}`);
}

// Fungsi pembantu untuk mengirim permintaan ke AudD dengan sistem otomatis pindah token jika gagal
async function recognizeWithAudd(filePathOrStream, isStream = false) {
    let attempts = 0;
    while (attempts < AUDD_TOKENS.length) {
        const token = getActiveToken();
        const FormDataNode = require('form-data');
        const form = new FormDataNode();
        form.append('api_token', token);
        
        if (isStream) {
            form.append('file', filePathOrStream);
        } else {
            form.append('file', fs.createReadStream(filePathOrStream));
        }
        form.append('return', 'apple_music,spotify');

        try {
            const auddResponse = await axios.post('https://api.audd.io/', form, {
                headers: form.getHeaders()
            });

            // Jika berhasil dan status sukses, kembalikan hasilnya
            if (auddResponse.data && auddResponse.data.status === 'success') {
                return auddResponse.data;
            }

            // Jika error karena token habis/invalid (kode error 900 atau sejenisnya)
            if (auddResponse.data && auddResponse.data.error) {
                console.warn(`[Token Warning] Token ${token} bermasalah:`, auddResponse.data.error.error_message);
                rotateToken();
                attempts++;
                continue;
            }

            return auddResponse.data;
        } catch (err) {
            console.error(`[Error] Gagal menggunakan token ${token}:`, err.message);
            rotateToken();
            attempts++;
        }
    }
    throw new Error('Semua token AudD gagal atau habis kuotanya.');
}

// Konfigurasi CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const uploadDir = path.join(__dirname, 'temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

app.get('/', (req, res) => {
    res.send('SongFinder Backend Server with Auto-Token Rotation is Running!');
});

// Endpoint 1: URL TikTok / Media
app.post('/api/recognize-url', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL tidak boleh kosong.' });
    }

    const outputFilePath = path.join(uploadDir, `audio_${Date.now()}.mp3`);
    const command = `yt-dlp -x --audio-format mp3 --no-playlist -o "${outputFilePath.replace('.mp3', '')}.%(ext)s" "${url}"`;

    exec(command, async (error, stdout, stderr) => {
        try {
            const files = fs.readdirSync(uploadDir);
            const generatedFile = files.find(file => file.endsWith('.mp3') && file.startsWith('audio_'));

            if (!generatedFile) {
                console.error("Gagal ekstrak yt-dlp:", stderr);
                return res.status(500).json({ success: false, message: 'Gagal mengekstrak audio dari URL tersebut.' });
            }

            const finalAudioPath = path.join(uploadDir, generatedFile);

            // Memanggil fungsi pengenalan dengan fitur rotasi otomatis
            const auddResult = await recognizeWithAudd(finalAudioPath, false);

            if (fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);

            if (auddResult && auddResult.status === 'success') {
                return res.json({
                    success: true,
                    result: auddResult.result
                });
            } else {
                return res.json({
                    success: false,
                    message: 'Lagu tidak ditemukan dalam database.'
                });
            }

        } catch (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server saat memproses audio.' });
        }
    });
});

// Endpoint 2: Upload File Langsung
app.post('/api/recognize-file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File tidak ditemukan.' });
        }

        const filePath = req.file.path;
        const auddResult = await recognizeWithAudd(filePath, false);

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        if (auddResult && auddResult.status === 'success') {
            return res.json({
                success: true,
                result: auddResult.result
            });
        } else {
            return res.json({
                success: false,
                message: 'Lagu tidak ditemukan.'
            });
        }

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Gagal memproses file yang di-upload.' });
    }
});

app.listen(PORT, () => {
    console.log(`[SongFinder] Server is running securely on port ${PORT}`);
});
