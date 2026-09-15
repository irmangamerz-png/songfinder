const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Token Cadangan Otomatis
const rawTokens = process.env.AUDD_TOKEN || 'bc19167188cfb76c3692367bb5b36355,9fd164b2d84f0af4d07f3ef9bb62359e,c939f583446b27c6aa1a2a51cd403e50';
const AUDD_TOKENS = rawTokens.split(',').map(t => t.trim()).filter(t => t.length > 0);

let currentTokenIndex = 0;

function getActiveToken() {
    return AUDD_TOKENS[currentTokenIndex];
}

function rotateToken() {
    currentTokenIndex = (currentTokenIndex + 1) % AUDD_TOKENS.length;
    console.log(`[Token Switch] Berpindah ke token cadangan indeks ke-${currentTokenIndex}`);
}

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
                console.warn(`[Token Warning]:`, auddResponse.data.error.error_message);
                rotateToken();
                attempts++;
                continue;
            }

            return auddResponse.data;
        } catch (err) {
            console.error(`[Error Koneksi]:`, err.message);
            rotateToken();
            attempts++;
        }
    }
    throw new Error('Semua token AudD gagal atau habis kuotanya.');
}

async function resolveShortUrl(inputUrl) {
    try {
        if (!inputUrl.includes('vm.tiktok.com') && !inputUrl.includes('vt.tiktok.com')) {
            return inputUrl;
        }
        const response = await axios.get(inputUrl, {
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 400,
            headers: { 'User-Agent': 'Mozilla/5.0' }
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

app.get('/', (req, res) => {
    res.send(`SongFinder Backend Active. Tokens loaded: ${AUDD_TOKENS.length}`);
});

app.post('/api/recognize-url', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'Input kosong.' });

    url = url.trim();
    let targetCommandTarget = '';
    const isUrl = url.startsWith('http://') || url.startsWith('https://');

    if (isUrl) {
        targetCommandTarget = await resolveShortUrl(url);
    } else {
        targetCommandTarget = `ytsearch1:${url}`;
    }

    const outputFileName = `audio_${Date.now()}`;
    const outputFilePath = path.join(uploadDir, `${outputFileName}.mp3`);

    // Perintah sakti: Update yt-dlp otomatis + download audio terbaik dengan ekstensi pasti .mp3
    const command = `pip install --upgrade yt-dlp && yt-dlp -x --audio-format mp3 --audio-quality 0 --no-playlist --extractor-args youtube:player_client=android,web -o "${path.join(uploadDir, outputFileName)}.%(ext)s" "${targetCommandTarget}"`;

    console.log(`[Eksekusi yt-dlp]: ${targetCommandTarget}`);

    exec(command, async (error, stdout, stderr) => {
        if (error) {
            console.error("[yt-dlp Error]", stderr);
            return res.status(500).json({ success: false, message: 'Gagal mendownload audio dari sumber.' });
        }

        try {
            // Cari file apa pun yang berawalan nama unik tersebut di folder temp
            const files = fs.readdirSync(uploadDir);
            const generatedFile = files.find(file => file.startsWith(outputFileName));

            if (!generatedFile) {
                return res.status(500).json({ success: false, message: 'File hasil ekstrak audio tidak ditemukan.' });
            }

            const finalAudioPath = path.join(uploadDir, generatedFile);
            const stats = fs.statSync(finalAudioPath);

            if (stats.size < 1000) {
                if (fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);
                return res.status(500).json({ success: false, message: 'File audio kosong atau gagal diproses.' });
            }

            const auddResult = await recognizeWithAudd(finalAudioPath);

            if (fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);

            if (auddResult && auddResult.status === 'success') {
                return res.json({ success: true, result: auddResult.result });
            } else {
                return res.json({ success: false, message: 'Lagu tidak dikenal / tidak ditemukan dalam database.' });
            }
        } catch (err) {
            console.error("[Server Error]:", err);
            return res.status(500).json({ success: false, message: 'Kesalahan sistem saat memproses lagu.' });
        }
    });
});

app.post('/api/recognize-file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'File tidak ada.' });

        const filePath = req.file.path;
        const auddResult = await recognizeWithAudd(filePath);

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        if (auddResult && auddResult.status === 'success') {
            return res.json({ success: true, result: auddResult.result });
        } else {
            return res.json({ success: false, message: 'Lagu tidak dikenal.' });
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Gagal memproses file.' });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
