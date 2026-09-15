const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const AUDD_TOKEN = process.env.AUDD_TOKEN || '9fd164b2d84f0af4d07f3ef9bb62359e';

// Konfigurasi CORS agar diizinkan oleh GitHub Pages
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Setup folder penyimpanan sementara untuk file audio
const uploadDir = path.join(__dirname, 'temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

// Endpoint utama untuk tes status server
app.get('/', (req, res) => {
    res.send('SongFinder Backend Server is Running Smoothly!');
});

// Endpoint 1: Proses berdasarkan URL TikTok / Media
app.post('/api/recognize-url', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL tidak boleh kosong.' });
    }

    const outputFilePath = path.join(uploadDir, `audio_${Date.now()}.mp3`);
    const command = `yt-dlp -x --audio-format mp3 -o "${outputFilePath.replace('.mp3', '')}.%(ext)s" "${url}"`;

    exec(command, async (error, stdout, stderr) => {
        try {
            const files = fs.readdirSync(uploadDir);
            const generatedFile = files.find(file => file.endsWith('.mp3') && file.startsWith('audio_'));

            if (!generatedFile) {
                return res.status(500).json({ success: false, message: 'Gagal mengekstrak audio dari URL tersebut.' });
            }

            const finalAudioPath = path.join(uploadDir, generatedFile);

            const FormDataNode = require('form-data');
            const form = new FormDataNode();
            form.append('api_token', AUDD_TOKEN);
            form.append('file', fs.createReadStream(finalAudioPath));
            form.append('return', 'apple_music,spotify');

            const auddResponse = await axios.post('https://api.audd.io/', form, {
                headers: form.getHeaders()
            });

            if (fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);

            if (auddResponse.data && auddResponse.data.status === 'success') {
                return res.json({
                    success: true,
                    result: auddResponse.data.result
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

// Endpoint 2: Proses berdasarkan Upload File Langsung
app.post('/api/recognize-file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'File tidak ditemukan.' });
        }

        const filePath = req.file.path;

        const FormDataNode = require('form-data');
        const form = new FormDataNode();
        form.append('api_token', AUDD_TOKEN);
        form.append('file', fs.createReadStream(filePath));
        form.append('return', 'apple_music,spotify');

        const auddResponse = await axios.post('https://api.audd.io/', form, {
            headers: form.getHeaders()
        });

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        if (auddResponse.data && auddResponse.data.status === 'success') {
            return res.json({
                success: true,
                result: auddResponse.data.result
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
