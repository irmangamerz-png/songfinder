FROM node:18-alpine

# Install system dependencies required at runtime: ffmpeg for audio
# extraction/processing and yt-dlp (via pip) for media extraction.
RUN apk add --no-cache ffmpeg python3 py3-pip \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
