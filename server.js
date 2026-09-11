'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const ytdl = require('@distube/ytdl-core');
const ipaddr = require('ipaddr.js');
const net = require('net');
const dns = require('dns');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

const app = express();

const PORT = parsePort(process.env.PORT, 3000);
const MAX_BYTES = 35 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;
const PROVIDER_TIMEOUT_MS = 8_000;
const MEDIA_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

function parsePort(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : fallback;
}

function parseTrustProxy(value) {
  if (value === undefined || value === '') return 1;
  const v = String(value).trim().toLowerCase();

  if (v === 'true') return true;
  if (v === 'false') return false;

  if (/^\d+$/.test(v)) return Number(v);

  const list = v.split(',').map(x => x.trim()).filter(Boolean);
  if (list.length && list.every(x => /^[0-9a-f:.\/]+$/i.test(x))) return list;

  console.warn('[Config] TRUST_PROXY tidak valid; menggunakan 1.');
  return 1;
}

app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

const ALLOWED_USER_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'vt.tiktok.com',
  'vm.tiktok.com',
  'm.tiktok.com',
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be'
]);

const TIKTOK_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'vt.tiktok.com',
  'vm.tiktok.com',
  'm.tiktok.com'
]);

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be'
]);

function validateUserUrl(inputUrl) {
  if (typeof inputUrl !== 'string' || !inputUrl.trim()) {
    return { valid: false, reason: 'Parameter URL tidak boleh kosong.' };
  }

  try {
    const parsed = new URL(inputUrl.trim());

    if (parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Hanya URL HTTPS yang diperbolehkan.' };
    }

    const hostname = parsed.hostname.toLowerCase();

    if (!ALLOWED_USER_HOSTS.has(hostname)) {
      return { valid: false, reason: 'Domain URL tidak didukung.' };
    }

    return { valid: true, parsedUrl: parsed, hostname };
  } catch {
    return { valid: false, reason: 'Format URL tidak valid.' };
  }
}

function isIpSafe(ipStr) {
  if (!net.isIP(ipStr)) return false;

  try {
    let addr = ipaddr.parse(ipStr);

    if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }

    const range = addr.range();

    const unsafeRanges = new Set([
      'unspecified',
      'broadcast',
      'multicast',
      'linkLocal',
      'loopback',
      'private',
      'carrierNat',
      'reserved',
      'uniqueLocal'
    ]);

    return !unsafeRanges.has(range);
  } catch {
    return false;
  }
}

async function resolveAndValidateHost(hostname) {
  if (net.isIP(hostname)) {
    if (!isIpSafe(hostname)) {
      throw new Error('Alamat IP berada dalam rentang terlarang.');
    }
    return [hostname];
  }

  let records;

  try {
    records = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw new Error('Gagal melakukan resolusi DNS untuk domain media.');
  }

  if (!records.length) {
    throw new Error('Resolusi DNS tidak mengembalikan alamat IP.');
  }

  for (const record of records) {
    if (!isIpSafe(record.address)) {
      throw new Error('Domain media terurai ke alamat IP terlarang.');
    }
  }

  return records.map(record => record.address);
}

function validatedLookup(hostname, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const opt = typeof options === 'object' && options !== null ? options : {};

  dns.lookup(hostname, { ...opt, all: true }, (err, addresses) => {
    if (err) return cb(err);

    if (!Array.isArray(addresses) || addresses.length === 0) {
      return cb(new Error('DNS tidak mengembalikan alamat.'));
    }

    for (const address of addresses) {
      if (!isIpSafe(address.address)) {
        return cb(new Error('SSRF Ditolak: Host terurai ke alamat IP terlarang.'));
      }
    }

    if (opt.all) {
      return cb(null, addresses);
    }

    return cb(null, addresses[0].address, addresses[0].family);
  });
}

class SizeLimiterTransform extends Transform {
  constructor(maxSize) {
    super();
    this.maxSize = maxSize;
    this.transferred = 0;
  }

  _transform(chunk, encoding, callback) {
    const remaining = this.maxSize - this.transferred;

    if (remaining <= 0) {
      const err = new Error('PAYLOAD_TOO_LARGE');
      err.code = 'LIMIT_EXCEEDED';
      return callback(err);
    }

    if (chunk.length <= remaining) {
      this.transferred += chunk.length;
      return callback(null, chunk);
    }

    if (remaining > 0) {
      this.push(chunk.subarray(0, remaining));
      this.transferred += remaining;
    }

    const err = new Error('PAYLOAD_TOO_LARGE');
    err.code = 'LIMIT_EXCEEDED';
    return callback(err);
  }
}

function isSupportedMediaType(contentType) {
  const type = String(contentType || '').split(';', 1)[0].trim().toLowerCase();

  return (
    type.startsWith('audio/') ||
    type.startsWith('video/') ||
    type === 'application/octet-stream'
  );
}

function createProviderConfig() {
 
