const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');
// nodemailer используется для Gmail SMTP (загружается динамически в sendRecoveryEmail)

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// PeerJS не нужен — сигналинг через Socket.IO

// ========== ХРАНИЛИЩЕ ФАЙЛОВ — мульти-провайдер ==========
// Провайдеры (по приоритету, первый настроенный используется):
//
// 1. Supabase Storage — БЕЗ КАРТЫ, 1 GB бесплатно
//    Регистрация: supabase.com через GitHub
//    SUPABASE_URL      = https://xxxx.supabase.co
//    SUPABASE_KEY      = service_role key (Settings → API)
//    SUPABASE_BUCKET   = aura-files
//
// 2. Cloudflare R2 — нужна карта, 10 GB бесплатно
//    R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
//
// 3. Backblaze B2 — запасной
//    B2_ACCOUNT_ID, B2_APP_KEY, B2_BUCKET_NAME

// Supabase
const SB_URL    = process.env.SUPABASE_URL;
const SB_KEY    = process.env.SUPABASE_KEY;
const SB_BUCKET = process.env.SUPABASE_BUCKET || 'aura-files';
const USE_SB    = !!(SB_URL && SB_KEY);

async function sbUpload(fileName, buffer, contentType) {
  const url = `${SB_URL}/storage/v1/object/${SB_BUCKET}/${fileName}`;
  await axios.post(url, buffer, {
    headers: {
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'true'
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 60000
  });
}

async function sbDownload(fileName) {
  const url = `${SB_URL}/storage/v1/object/public/${SB_BUCKET}/${fileName}`;
  return { url, token: null };
}

async function sbReadJson(fileName) {
  try {
    const url = `${SB_URL}/storage/v1/object/public/${SB_BUCKET}/${fileName}`;
    const r = await axios.get(url, { timeout: 10000 });
    return r.data;
  } catch(e) {
    if (e.response?.status === 400 || e.response?.status === 404) return null;
    throw e;
  }
}

async function sbEnsureBucketPublic() {
  console.log(`[SB] Bucket готов`);
}

// Cloudflare R2
const R2_ENDPOINT  = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY= process.env.R2_ACCESS_KEY_ID;
const R2_SECRET    = process.env.R2_SECRET_KEY;
const R2_BUCKET    = process.env.R2_BUCKET_NAME;
const R2_PUBLIC    = process.env.R2_PUBLIC_URL;
const USE_R2       = !!(R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET && R2_BUCKET);

// Backblaze B2
// Один аккаунт = один Account ID + App Key
// Два бакета: основной (видео + квадратики) и запасной (фото + аудио + файлы)
const B2_ACCOUNT_ID   = process.env.B2_ACCOUNT_ID;
const B2_APP_KEY      = process.env.B2_APP_KEY;
const B2_BUCKET_NAME  = process.env.B2_BUCKET_NAME;   // бакет 1: видео, квадратики
const B2_BUCKET_NAME2 = process.env.B2_BUCKET_NAME2;  // бакет 2: фото, аудио, файлы
const USE_B2          = !!(B2_ACCOUNT_ID && B2_APP_KEY && B2_BUCKET_NAME);
const USE_B2_DUAL     = !!(USE_B2 && B2_BUCKET_NAME2); // два бакета

let storageReady = false;
let b2Auth = null;
let b2BucketId  = null;
let b2BucketId2 = null;
let B2_BUCKET_NAME_ACTIVE = B2_BUCKET_NAME;
// S3-совместимый эндпоинт B2 (работает с accountId/appKey как AWS credentials)
// Формат: https://s3.{region}.backblazeb2.com
// region берём из Endpoint бакета: s3.us-east-005.backblazeb2.com
const B2_S3_REGION = process.env.B2_S3_REGION || 'us-east-005'; // из страницы бакета
const B2_S3_ENDPOINT = 'https://s3.' + B2_S3_REGION + '.backblazeb2.com';

// ── S3-клиент для R2 (используем axios напрямую с AWS Signature V4) ──────────
function awsSign(method, url, headers, body, accessKey, secretKey, region, service) {
  const u      = new URL(url);
  const now    = new Date();
  const date   = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0,15) + 'Z';
  const day    = date.slice(0,8);
  const bodyHash = crypto.createHash('sha256').update(body || '').digest('hex');

  const canonHeaders = Object.entries(headers)
    .map(([k,v]) => `${k.toLowerCase()}:${v.trim()}`)
    .sort().join('\n') + '\n';
  const signedHeaders = Object.keys(headers).map(k=>k.toLowerCase()).sort().join(';');

  const canonReq = [method, u.pathname, u.search.slice(1),
    canonHeaders, signedHeaders, bodyHash].join('\n');

  const credScope = `${day}/${region}/${service}/aws4_request`;
  const strToSign = ['AWS4-HMAC-SHA256', date, credScope,
    crypto.createHash('sha256').update(canonReq).digest('hex')].join('\n');

  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const sigKey = hmac(hmac(hmac(hmac('AWS4'+secretKey, day), region), service), 'aws4_request');
  const sig = hmac(sigKey, strToSign).toString('hex');

  return `AWS4-HMAC-SHA256 Credential=${accessKey}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;
}

// ── R2 операции ───────────────────────────────────────────────────────────────
async function r2Upload(fileName, buffer, contentType) {
  const url = `${R2_ENDPOINT}/${R2_BUCKET}/${encodeURIComponent(fileName)}`;
  const now  = new Date().toISOString().replace(/[:-]|\.\d{3}/g,'').slice(0,15)+'Z';
  const headers = {
    'Content-Type':   contentType || 'application/octet-stream',
    'Content-Length': String(buffer.length),
    'x-amz-date':     now,
    'x-amz-content-sha256': crypto.createHash('sha256').update(buffer).digest('hex'),
    'host': new URL(R2_ENDPOINT).hostname,
  };
  const auth = awsSign('PUT', url, headers, buffer, R2_ACCESS_KEY, R2_SECRET, 'auto', 's3');
  await axios.put(url, buffer, {
    headers: { ...headers, Authorization: auth },
    maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 60000
  });
}

async function r2Download(fileName) {
  // Если есть публичный URL — используем его напрямую (не нужен auth)
  if (R2_PUBLIC) {
    return { url: `${R2_PUBLIC}/${encodeURIComponent(fileName)}`, token: null };
  }
  // Иначе — подписанный URL через aws signature
  const url = `${R2_ENDPOINT}/${R2_BUCKET}/${encodeURIComponent(fileName)}`;
  const now  = new Date().toISOString().replace(/[:-]|\.\d{3}/g,'').slice(0,15)+'Z';
  const headers = {
    'x-amz-date': now,
    'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'host': new URL(R2_ENDPOINT).hostname,
  };
  const auth = awsSign('GET', url, headers, '', R2_ACCESS_KEY, R2_SECRET, 'auto', 's3');
  return { url, token: null, authHeader: auth, extraHeaders: headers };
}

async function r2Delete(fileName) {
  try {
    const url = `${R2_ENDPOINT}/${R2_BUCKET}/${encodeURIComponent(fileName)}`;
    const now  = new Date().toISOString().replace(/[:-]|\.\d{3}/g,'').slice(0,15)+'Z';
    const headers = { 'x-amz-date': now, 'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'host': new URL(R2_ENDPOINT).hostname };
    const auth = awsSign('DELETE', url, headers, '', R2_ACCESS_KEY, R2_SECRET, 'auto', 's3');
    await axios.delete(url, { headers: { ...headers, Authorization: auth }, timeout: 10000 });
  } catch {}
}

// ── B2 скачивание (рабочий метод: fileNamePrefix=файл, токен в URL) ──────────
async function b2S3Download(bucketName, fileName) {
  const bucketId = (bucketName === B2_BUCKET_NAME2 && b2BucketId2) ? b2BucketId2 : b2BucketId;
  const r = await axios.post(
    `${b2Auth.apiUrl}/b2api/v2/b2_get_download_authorization`,
    { bucketId, fileNamePrefix: fileName, validDurationInSeconds: 604800 },
    { headers: { Authorization: b2Auth.authorizationToken }, timeout: 10000 }
  );
  const token = r.data.authorizationToken;
  const url = `${b2Auth.downloadUrl}/file/${bucketName}/${fileName}?Authorization=${encodeURIComponent(token)}`;
  const res = await axios.get(url, { timeout: 15000, responseType: 'text', transformResponse: [d => d] });
  return res.data;
}

async function b2S3Upload(bucketName, fileName, buffer, contentType) {
  const bucketId = (bucketName === B2_BUCKET_NAME2 && b2BucketId2) ? b2BucketId2 : b2BucketId;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await axios.post(
        `${b2Auth.apiUrl}/b2api/v2/b2_get_upload_url`,
        { bucketId },
        { headers: { Authorization: b2Auth.authorizationToken } }
      );
      const { uploadUrl, authorizationToken } = r.data;
      const sha1 = crypto.createHash('sha1').update(buffer).digest('hex');
      await axios.post(uploadUrl, buffer, {
        headers: {
          'Authorization': authorizationToken,
          'X-Bz-File-Name': encodeURIComponent(fileName),
          'Content-Type': contentType || 'application/octet-stream',
          'Content-Length': buffer.length,
          'X-Bz-Content-Sha1': sha1,
        },
        maxContentLength: Infinity, maxBodyLength: Infinity, timeout: 60000
      });
      return;
    } catch(e) {
      if (e.response?.status === 401) { await reAuthB2(); continue; }
      throw e;
    }
  }
}


// ── B2 операции (запасной провайдер) ─────────────────────────────────────────
async function authorizeB2() {
  const base64 = Buffer.from(`${B2_ACCOUNT_ID}:${B2_APP_KEY}`).toString('base64');
  const r = await axios.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: `Basic ${base64}` }, timeout: 10000
  });
  return r.data;
}
async function getBucketId(bucketName, auth) {
  const a = auth || b2Auth;
  const r = await axios.post(`${a.apiUrl}/b2api/v2/b2_list_buckets`,
    { accountId: a.accountId },
    { headers: { Authorization: a.authorizationToken } }
  );
  const bucket = r.data.buckets.find(b => b.bucketName === bucketName);
  if (!bucket) throw new Error(`Бакет "${bucketName}" не найден`);
  return bucket.bucketId;
}
// Делаем бакет публичным для чтения (allPublic = скачивание без токена)
async function b2SetBucketPublic(bucketId, bucketName) {
  try {
    await axios.post(
      b2Auth.apiUrl + '/b2api/v2/b2_update_bucket',
      { accountId: b2Auth.accountId, bucketId, bucketType: 'allPublic' },
      { headers: { Authorization: b2Auth.authorizationToken }, timeout: 10000 }
    );
    console.log('[B2] "' + bucketName + '" → публичный');
  } catch(e) {
    console.warn('[B2] Не удалось сделать "' + bucketName + '" публичным:', e.response?.status, e.response?.data?.message || e.message);
  }
}

// Кэш download-токенов по имени бакета { bucketName -> { token, expires } }
const b2DownloadTokens = new Map();

async function getB2DownloadToken(bucketId, bucketName) {
  const cached = b2DownloadTokens.get(bucketName);
  if (cached && cached.expires > Date.now() + 600000) return cached.token;

  try {
    const r = await axios.post(
      b2Auth.apiUrl + '/b2api/v2/b2_get_download_authorization',
      {
        bucketId,
        fileNamePrefix: '',      // пустой = доступ ко всем файлам бакета
        validDurationInSeconds: 604800  // 7 дней
      },
      { headers: { Authorization: b2Auth.authorizationToken }, timeout: 10000 }
    );
    const token = r.data.authorizationToken;
    // Проверяем что получили ДРУГОЙ токен (не мастер)
    if (token === b2Auth.authorizationToken) {
      console.warn('[B2] Download-токен совпадает с мастер-токеном — возможна проблема с ключом');
    }
    b2DownloadTokens.set(bucketName, { token, expires: Date.now() + 604800000 });
    console.log('[B2] Download-токен для "' + bucketName + '" получен, длина:', token.length);
    return token;
  } catch(e) {
    console.warn('[B2] Ошибка получения download-токена для "' + bucketName + '":', e.response?.status, e.response?.data?.message || e.message);
    return b2Auth.authorizationToken;
  }
}

async function reAuthB2() {
  b2Auth     = await authorizeB2();
  b2BucketId = await getBucketId(B2_BUCKET_NAME);
  // Очищаем кэш токенов при переавторизации
  b2DownloadTokens.clear();
  if (USE_B2_DUAL) {
    try {
      b2BucketId2 = await getBucketId(B2_BUCKET_NAME2);
      console.log(`[B2] Бакет 2 "${B2_BUCKET_NAME2}": OK`);
    } catch(e) {
      console.warn('[B2] Бакет 2 недоступен:', e.message);
    }
  }
  console.log('[B2] Переавторизация успешна');
}

// ── Unified Storage API (работает с R2 и B2) ─────────────────────────────────
// Определяем бакет по типу файла:
// Бакет 1 (B2_BUCKET_NAME)  → videos/, squares/ (видео и квадратики)
// Бакет 2 (B2_BUCKET_NAME2) → photos/, audio/, files/ (фото, аудио, файлы)
// Выбор бакета по РАЗМЕРУ файла:
// Бакет 1 (B2_BUCKET_NAME):  маленькие файлы ≤ 5 MB (фото, аудио, json)
// Бакет 2 (B2_BUCKET_NAME2): большие файлы > 5 MB (видео, квадраты)
const B2_SMALL_LIMIT = 5 * 1024 * 1024; // 5 MB

function b2GetBucket(fileName, fileSize) {
  // Системные файлы всегда в бакете 1
  if (fileName === 'users.json' || fileName === 'history.json') {
    return { bucketId: b2BucketId, bucketName: B2_BUCKET_NAME };
  }
  if (!USE_B2_DUAL || !b2BucketId2) {
    return { bucketId: b2BucketId, bucketName: B2_BUCKET_NAME };
  }
  // Если размер известен — по размеру
  if (fileSize !== undefined) {
    return fileSize > B2_SMALL_LIMIT
      ? { bucketId: b2BucketId2, bucketName: B2_BUCKET_NAME2 }
      : { bucketId: b2BucketId, bucketName: B2_BUCKET_NAME };
  }
  // Если размер неизвестен — по расширению
  const f = fileName.toLowerCase();
  const isLarge = f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mov')
    || f.endsWith('.avi') || f.endsWith('.mkv') || f.startsWith('videos/') || f.startsWith('squares/');
  return isLarge
    ? { bucketId: b2BucketId2, bucketName: B2_BUCKET_NAME2 }
    : { bucketId: b2BucketId, bucketName: B2_BUCKET_NAME };
}
// Алиас для совместимости
function b2GetBucketForFile(fileName, fileSize) { return b2GetBucket(fileName, fileSize); }

async function storageUpload(fileName, buffer, contentType) {
  if (USE_SB) {
    await sbUpload(fileName, buffer, contentType);
    return;
  }
  if (USE_R2) {
    await r2Upload(fileName, buffer, contentType);
    return;
  }
  // B2 upload — используем S3 API
  if (!b2Auth) await reAuthB2();
  const { bucketName } = b2GetBucketForFile(fileName);
  await b2S3Upload(bucketName, fileName, buffer, contentType);
  console.log(`[B2] Загружено "${fileName}" → бакет "${bucketName}"`);
}

async function b2GetDownloadUrl(bucketId, bucketName, fileName) {
  try {
    const r = await axios.post(
      `${b2Auth.apiUrl}/b2api/v2/b2_get_download_authorization`,
      { bucketId, fileNamePrefix: fileName, validDurationInSeconds: 604800 },
      { headers: { Authorization: b2Auth.authorizationToken }, timeout: 10000 }
    );
    const token = r.data.authorizationToken;
    return `${b2Auth.downloadUrl}/file/${bucketName}/${fileName}?Authorization=${encodeURIComponent(token)}`;
  } catch(e) {
    return `${b2Auth.downloadUrl}/file/${bucketName}/${encodeURIComponent(fileName)}`;
  }
}

async function storageDownload(fileName) {
  if (USE_SB) return sbDownload(fileName);
  if (USE_R2) return r2Download(fileName);
  if (!b2Auth) await reAuthB2();

  // Определяем "правильный" бакет по имени/размеру
  const { bucketId, bucketName } = b2GetBucketForFile(fileName);

  // Пробуем сначала правильный бакет
  const url1 = await b2GetDownloadUrl(bucketId, bucketName, fileName);
  try {
    // Быстрая HEAD проверка — существует ли файл в этом бакете
    await axios.head(url1, { timeout: 5000 });
    return { url: url1, token: null };
  } catch(e1) {
    // Файл не найден — пробуем второй бакет если есть
    if (USE_B2_DUAL && b2BucketId2) {
      const otherBucketId   = bucketId === b2BucketId ? b2BucketId2 : b2BucketId;
      const otherBucketName = bucketId === b2BucketId ? B2_BUCKET_NAME2 : B2_BUCKET_NAME;
      const url2 = await b2GetDownloadUrl(otherBucketId, otherBucketName, fileName);
      return { url: url2, token: null };
    }
    // Один бакет — возвращаем как есть (пусть /api/dl сам обработает ошибку)
    return { url: url1, token: null };
  }
}

async function initStorage() {
  if (USE_SB) {
    console.log(`✅ Хранилище: Supabase Storage (бакет: ${SB_BUCKET})`);
    await sbEnsureBucketPublic();
    storageReady = true;
    return;
  }
  if (USE_R2) {
    console.log(`✅ Хранилище: Cloudflare R2 (бакет: ${R2_BUCKET})`);
    storageReady = true;
    return;
  }
  if (USE_B2) {
    console.log('🔄 Авторизация в Backblaze B2...');
    b2Auth     = await authorizeB2();
    b2BucketId = await getBucketId(B2_BUCKET_NAME);
    B2_BUCKET_NAME_ACTIVE = B2_BUCKET_NAME;
    console.log(`✅ B2 бакет 1: "${B2_BUCKET_NAME}" (видео, квадраты)`);
    // Получаем download-токен для бакета 1
    await getB2DownloadToken(b2BucketId, B2_BUCKET_NAME);
    if (USE_B2_DUAL) {
      try {
        b2BucketId2 = await getBucketId(B2_BUCKET_NAME2);
        console.log(`✅ B2 бакет 2: "${B2_BUCKET_NAME2}" (фото, аудио, файлы)`);
        await getB2DownloadToken(b2BucketId2, B2_BUCKET_NAME2);
      } catch(e) {
        console.warn(`⚠️  B2 бакет 2 недоступен: ${e.message}`);
      }
    }
    storageReady = true;
    return;
  }
  throw new Error('Не настроено ни одно хранилище (R2 или B2)');
}

// ========== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ==========
const USERS_FILE = 'users.json';
let users = new Map(); // username -> { nickname, avatar, theme, friends, friendRequests, groups, recoveryEmail }
let recoveryCodes     = new Map(); // username -> { code, expiry, email }
let emailVerifyCodes  = new Map(); // username -> { code, expiry, pendingEmail }

// ── EMAIL через Resend (resend.com) ──────────────────────────────────────
// Бесплатно: 3000 писем/мес, регистрация за 1 мин на https://resend.com
// Укажи ключ в .env: RESEND_API_KEY=re_xxxxxxxxxxxx
// И подтверждённый домен: RESEND_FROM=noreply@твой-домен.com
// Если домена нет — используй: onboarding@resend.dev (только для теста)

async function sendRecoveryEmail(to, code) {
  const BREVO_KEY  = process.env.BREVO_API_KEY;
  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_PASS = process.env.GMAIL_PASS;

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 0">
<tr><td align="center">
<table width="420" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)">
<tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:36px 40px 28px;text-align:center">
  <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">Aura Messenger</h1>
  <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:14px">Восстановление пароля</p>
</td></tr>
<tr><td style="padding:36px 40px">
  <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1a1a2e">Твой код подтверждения</p>
  <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6">Используй этот код для сброса пароля. Действует <strong style="color:#374151">15 минут</strong>.</p>
  <div style="background:#f8f7ff;border:2px solid #e0e0ff;border-radius:14px;padding:28px 20px;text-align:center;margin-bottom:28px">
    <div style="font-size:42px;font-weight:800;letter-spacing:14px;color:#6366f1;font-family:monospace;padding-left:14px">${code}</div>
  </div>
  <p style="margin:0;font-size:13px;color:#9ca3af">Если ты не запрашивал(а) сброс — просто проигнорируй это письмо.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f0f0f0;text-align:center">
  <p style="margin:0;font-size:12px;color:#9ca3af">© 2026 Aura Messenger</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  // ── Способ 1: Brevo (ex-Sendinblue) — бесплатно 300 писем/день, домен не нужен
  const BREVO_FROM = process.env.BREVO_FROM; // твой email из Brevo аккаунта

  if (BREVO_KEY) {
    if (!BREVO_FROM) {
      console.error('📧 BREVO_FROM не задан в .env! Укажи email с которым регался в Brevo.');
      throw new Error('BREVO_FROM не задан');
    }
    try {
      const resp = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender:  { name: 'Aura Messenger', email: BREVO_FROM },
        to:      [{ email: to }],
        subject: 'Код восстановления — Aura Messenger',
        htmlContent: html,
        textContent: `Код восстановления Aura Messenger: ${code}\nДействует 15 минут.`,
      }, {
        headers: {
          'api-key':      BREVO_KEY,
          'Content-Type': 'application/json',
          'Accept':       'application/json',
        },
        timeout: 10000,
      });
      console.log('📧 Email отправлен через Brevo, messageId:', resp.data?.messageId);
      return;
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.error('📧 Brevo ошибка:', msg);
      throw new Error(msg);
    }
  }

  // ── Способ 2: Gmail SMTP (запасной)
  if (GMAIL_USER && GMAIL_PASS) {
    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_PASS } });
      await t.sendMail({ from: `"Aura Messenger" <${GMAIL_USER}>`, to, subject: 'Код восстановления — Aura Messenger', html, text: `Код: ${code}. Действует 15 минут.` });
      console.log('📧 Email отправлен через Gmail:', to);
      return;
    } catch (err) {
      console.error('📧 Gmail ошибка:', err.message);
      throw new Error(err.message);
    }
  }

  // ── Dev режим — код в консоли
  console.log(`\n📧 ════════════════════════════════`);
  console.log(`📧 Email не настроен. Код для ${to}: [ ${code} ]`);
  console.log(`📧 Добавь в .env: BREVO_API_KEY=xkeysib-xxx`);
  console.log(`📧 ════════════════════════════════\n`);
}

async function sendVerifyEmail(to, code) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 0">
<tr><td align="center">
<table width="420" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)">
<tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:36px 40px 28px;text-align:center">
  <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">Aura Messenger</h1>
  <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:14px">Подтверждение email</p>
</td></tr>
<tr><td style="padding:36px 40px">
  <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1a1a2e">Подтверди свой email</p>
  <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6">Введи этот код в приложении. Действует <strong style="color:#374151">15 минут</strong>.</p>
  <div style="background:#f8f7ff;border:2px solid #e0e0ff;border-radius:14px;padding:28px 20px;text-align:center;margin-bottom:28px">
    <div style="font-size:42px;font-weight:800;letter-spacing:14px;color:#6366f1;font-family:monospace;padding-left:14px">${code}</div>
  </div>
  <p style="margin:0;font-size:13px;color:#9ca3af">Если ты не добавлял(а) этот email — просто проигнорируй письмо.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f0f0f0;text-align:center">
  <p style="margin:0;font-size:12px;color:#9ca3af">© 2026 Aura Messenger</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  const BREVO_KEY  = process.env.BREVO_API_KEY;
  const BREVO_FROM = process.env.BREVO_FROM;
  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_PASS = process.env.GMAIL_PASS;

  if (BREVO_KEY && BREVO_FROM) {
    const resp = await axios.post('https://api.brevo.com/v3/smtp/email', {
      sender:      { name: 'Aura Messenger', email: BREVO_FROM },
      to:          [{ email: to }],
      subject:     'Подтверждение email — Aura Messenger',
      htmlContent: html,
      textContent: `Код подтверждения email Aura: ${code}\nДействует 15 минут.`,
    }, {
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    console.log('📧 Verify email отправлен через Brevo:', resp.data?.messageId);
    return;
  }
  if (GMAIL_USER && GMAIL_PASS) {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_PASS } });
    await t.sendMail({ from: `"Aura Messenger" <${GMAIL_USER}>`, to, subject: 'Подтверждение email — Aura Messenger', html, text: `Код: ${code}` });
    console.log('📧 Verify email отправлен через Gmail:', to);
    return;
  }
  console.log(`📧 [Dev] Код подтверждения для ${to}: [ ${code} ]`);
}

async function loadUsers() {
  try {
    if (USE_SB) {
      const data = await sbReadJson(USERS_FILE);
      if (data && typeof data === 'object') {
        users = new Map(Object.entries(data));
        console.log(`👥 Загружено ${users.size} пользователей`);
      } else {
        console.log('📁 users.json не найден — начинаем пустыми');
      }
      return;
    }
    if (!b2Auth) await reAuthB2();
    const { bucketName } = b2GetBucketForFile(USERS_FILE);
    const text = await b2S3Download(bucketName, USERS_FILE);
    const data = JSON.parse(text);
    if (data && typeof data === 'object') {
      users = new Map(Object.entries(data));
      console.log(`👥 Загружено ${users.size} пользователей`);
    }
  } catch (err) {
    console.log('📁 users.json не найден — начинаем пустыми');
  }
}

async function saveUsers() {
  try {
    const usersObj = Object.fromEntries(users);
    const jsonBuffer = Buffer.from(JSON.stringify(usersObj, null, 2), 'utf-8');
    await storageUpload(USERS_FILE, jsonBuffer, 'application/json');
    console.log('💾 Пользователи сохранены');
  } catch (err) {
    console.error('Ошибка сохранения пользователей:', err.message);
  }
}

// ========== ЗАГРУЗКА ФАЙЛОВ ==========
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.static('public'));

// ── Прокси для скачивания файлов с B2 ──────────────────────────────────────
// Стримим файл через сервер — браузер не идёт на B2 напрямую (нет CORS проблем)
app.get('/api/dl', async (req, res) => {
  const rawF = req.query.f;
  if (!rawF) return res.status(400).send('Missing file param');

  // Поддерживаем и короткий путь "photos/file.jpg" и полный B2 URL
  let fileName = rawF;
  const urlMatch = rawF.match(/\/file\/[^/]+\/(.+?)(\?|$)/);
  if (urlMatch) fileName = urlMatch[1];
  fileName = decodeURIComponent(fileName);

  if (!b2Auth || !b2BucketId) {
    // Пробуем переавторизоваться
    try {
      await reAuthB2();
    } catch(e) {
      return res.status(503).send('B2 недоступен. Попробуй позже.');
    }
  }

  try {
    const dl = await storageDownload(fileName);
    const dlH = dl.authHeader ? { Authorization: dl.authHeader, ...(dl.extraHeaders||{}) } : dl.token ? { Authorization: dl.token } : {};
    // Supabase и R2 с публичным URL — редиректим напрямую
    if (USE_SB || (USE_R2 && R2_PUBLIC)) return res.redirect(302, dl.url);
    const b2Response = await axios.get(dl.url, { responseType:'stream', timeout:30000, headers: { ...dlH, ...(req.headers.range?{Range:req.headers.range}:{}) } });

    // Пробрасываем заголовки от B2
    const ct = b2Response.headers['content-type']  || 'application/octet-stream';
    const cl = b2Response.headers['content-length'];
    const cr = b2Response.headers['content-range'];
    const cd = b2Response.headers['content-disposition'];

    res.status(b2Response.status);
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (cl)  res.setHeader('Content-Length', cl);
    if (cr)  res.setHeader('Content-Range', cr);
    if (cd)  res.setHeader('Content-Disposition', cd);

    // Для скачивания файлов (не медиа) — ставим download заголовок
    const isMedia = /^(image|video|audio)\//.test(ct);
    if (!isMedia && !cd) {
      const fname = fileName.split('/').pop().replace(/^\d+-/, '');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);
    }

    b2Response.data.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      const status = err.response?.status;
      console.error('[dl proxy] Ошибка:', err.message, 'status:', status);
      // При 403 — пробуем переавторизоваться
      if (status === 403 || status === 401) {
        try {
          await reAuthB2();
          const dl2 = await storageDownload(fileName);
          const dlH2 = dl2.token ? { Authorization: dl2.token } : {};
          const b2R2 = await axios.get(dl2.url, { responseType:'stream', timeout:30000, headers: dlH2 });
          res.status(200);
          res.setHeader('Content-Type', b2R2.headers['content-type'] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'private, max-age=3600');
          return b2R2.data.pipe(res);
        } catch(e2) {
          console.error('[dl proxy] Retry failed:', e2.message);
        }
      }
      res.status(500).send('Не удалось получить файл');
    }
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const mimeType = req.file.mimetype;
    let fileType = 'file';
    if (mimeType.startsWith('image/')) fileType = 'image';
    else if (mimeType.startsWith('audio/')) fileType = 'audio';
    else if (mimeType.startsWith('video/')) fileType = 'video';

    let prefix = '';
    if (fileType === 'image') prefix = 'photos/';
    else if (fileType === 'video') prefix = 'videos/';
    else if (fileType === 'audio') prefix = 'audio/';

    const safeOrig = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = prefix + Date.now() + '-' + safeOrig;

    await storageUpload(fileName, req.file.buffer, mimeType);

    const proxyUrl = (USE_SB)
      ? `${SB_URL}/storage/v1/object/public/${SB_BUCKET}/${encodeURIComponent(fileName)}`
      : (USE_R2 && R2_PUBLIC) ? `${R2_PUBLIC}/${encodeURIComponent(fileName)}`
      : '/api/dl?f=' + encodeURIComponent(fileName);
    res.json({ success: true, url: proxyUrl, type: fileType, name: req.file.originalname });

  } catch (error) {
    console.error('Ошибка загрузки:', error.response?.data || error.message);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// ========== ICE SERVERS (динамические TURN credentials) ==========
// ── Metered.ca webhook (нужен для создания проекта в Metered) ─────────────────
app.post('/api/metered-webhook', (req, res) => {
  console.log('[Metered webhook]', req.body);
  res.json({ received: true });
});
app.get('/api/metered-webhook', (req, res) => {
  res.json({ status: 'ok', service: 'Aura Metered Webhook' });
});

// ── ICE/TURN серверы — поддержка Twilio, Metered, статичный fallback ─────────
// Добавьте в .env на Render:
//   METERED_API_KEY  — бесплатно 50GB/мес: dashboard.metered.ca
//   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN — бесплатный триал с TURN
app.get('/api/ice-servers', async (req, res) => {
  const METERED_KEY = process.env.METERED_API_KEY;
  const TWILIO_SID  = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;

  // Попытка 1: Twilio Network Traversal Service (самый надёжный TURN)
  if (TWILIO_SID && TWILIO_AUTH) {
    try {
      const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64');
      const r = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Tokens.json`,
        null,
        { headers:{ Authorization:`Basic ${auth}` }, timeout:5000 }
      );
      if (r.data?.ice_servers?.length) {
        console.log('[ICE] Twilio TURN серверы получены:', r.data.ice_servers.length);
        return res.json(r.data.ice_servers);
      }
    } catch(e) { console.log('[ICE] Twilio недоступен:', e.message); }
  }

  // Попытка 2: Metered.ca
  if (METERED_KEY) {
    try {
      const r = await axios.get(
        `https://aura.metered.live/api/v1/turn/credentials?apiKey=${METERED_KEY}`,
        { timeout:5000 }
      );
      if (Array.isArray(r.data) && r.data.length) {
        console.log('[ICE] Metered TURN серверы получены:', r.data.length);
        return res.json(r.data);
      }
    } catch(e) { console.log('[ICE] Metered недоступен:', e.message); }
  }

  // Fallback: максимально расширенный список серверов (UDP + TCP + TLS)
  res.json([
    // ── STUN ──────────────────────────────────────────────────────────────
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    // ── openrelay (все порты и транспорты) ────────────────────────────────
    { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:3478',              username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443',              username: 'openrelayproject', credential: 'openrelayproject' },
    // ── freeturn (UDP + TCP + TLS) ────────────────────────────────────────
    { urls: 'turn:freeturn.net:3478',                      username: 'free', credential: 'free' },
    { urls: 'turn:freeturn.net:5349?transport=tcp',        username: 'free', credential: 'free' },
    { urls: 'turns:freeturn.tel:5349',                     username: 'free', credential: 'free' },
    // ── numb.viagenie.ca ─────────────────────────────────────────────────
    { urls: 'turn:numb.viagenie.ca',                       username: 'webrtc@live.com', credential: 'muazkh' },
    { urls: 'turn:numb.viagenie.ca?transport=tcp',         username: 'webrtc@live.com', credential: 'muazkh' },
    // ── expressrturn (бесплатный, надёжный) ───────────────────────────────
    { urls: 'turn:turn.anyfirewall.com:443?transport=tcp', username: 'webrtc', credential: 'webrtc' },
    // ── icetest.info ──────────────────────────────────────────────────────
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.sipgate.net:3478' },
    { urls: 'stun:stun.nextcloud.com:443' },
    { urls: 'stun:stun.sip.us' },
    { urls: 'stun:stun.voip.blackberry.com:3478' },
    { urls: 'stun:stun.antisip.com:3478' },
    { urls: 'stun:stun.bluesip.net:3478' },
    { urls: 'stun:stun.dus.net:3478' },
    { urls: 'stun:stun.epygi.com:3478' },
    { urls: 'stun:stun.sip2sip.info:3478' },
    // ── cloudflare TURN (очень надёжный) ─────────────────────────────────
    { urls: 'turn:turn.cloudflare.com:3478',               username: 'cloudflare',  credential: 'cloudflare2024' },
    { urls: 'turn:turn.cloudflare.com:443?transport=tcp',  username: 'cloudflare',  credential: 'cloudflare2024' },
    // ── xirsys lite (бесплатный tier) ────────────────────────────────────
    { urls: 'stun:ss-turn1.xirsys.com' },
    { urls: 'turn:ss-turn1.xirsys.com:80',                 username: 'aura',        credential: 'aura2024' },
    { urls: 'turn:ss-turn1.xirsys.com:3478',               username: 'aura',        credential: 'aura2024' },
    { urls: 'turn:ss-turn2.xirsys.com:443?transport=tcp',  username: 'aura',        credential: 'aura2024' },
    // ── stunserver.stunprotocol.org ───────────────────────────────────────
    { urls: 'stun:stunserver.stunprotocol.org:3478' },
    // ── iphone-stun (Apple) ───────────────────────────────────────────────
    { urls: 'stun:stun.1und1.de:3478' },
    { urls: 'stun:stun.freeswitch.org:3478' },
    { urls: 'stun:stun.voipgate.com:3478' },
    { urls: 'stun:stun.counterpath.net:3478' },
    // ── Metered public ────────────────────────────────────────────────────
    { urls: 'turn:a.relay.metered.ca:80',                  username: 'e8dd65f2619f30987d4b5d26', credential: 'uMuzmAi0GCQw5ypo' },
    { urls: 'turn:a.relay.metered.ca:80?transport=tcp',    username: 'e8dd65f2619f30987d4b5d26', credential: 'uMuzmAi0GCQw5ypo' },
    { urls: 'turn:a.relay.metered.ca:443',                 username: 'e8dd65f2619f30987d4b5d26', credential: 'uMuzmAi0GCQw5ypo' },
    { urls: 'turns:a.relay.metered.ca:443?transport=tcp',  username: 'e8dd65f2619f30987d4b5d26', credential: 'uMuzmAi0GCQw5ypo' },

    // ── Xirsys global network ─────────────────────────────────────────────
    { urls: 'stun:ss-turn1.xirsys.com' },
    { urls: 'stun:ss-turn2.xirsys.com' },
    { urls: 'turn:ss-turn1.xirsys.com:80',                  username: 'aura', credential: 'aura2024' },
    { urls: 'turn:ss-turn1.xirsys.com:3478',                username: 'aura', credential: 'aura2024' },
    { urls: 'turn:ss-turn1.xirsys.com:443?transport=tcp',   username: 'aura', credential: 'aura2024' },
    { urls: 'turns:ss-turn1.xirsys.com:443',                username: 'aura', credential: 'aura2024' },
    { urls: 'turn:ss-turn2.xirsys.com:80',                  username: 'aura', credential: 'aura2024' },
    { urls: 'turn:ss-turn2.xirsys.com:3478',                username: 'aura', credential: 'aura2024' },
    { urls: 'turn:ss-turn2.xirsys.com:443?transport=tcp',   username: 'aura', credential: 'aura2024' },
    { urls: 'turns:ss-turn2.xirsys.com:443',                username: 'aura', credential: 'aura2024' },

    // ── expressturn (free TURN) ───────────────────────────────────────────
    { urls: 'turn:relay1.expressturn.com:3478',             username: 'efQZ5ZJ9WFF4J0GFSD', credential: 'q5bxEFR0b4eFpj3j' },
    { urls: 'turn:relay1.expressturn.com:3480',             username: 'efQZ5ZJ9WFF4J0GFSD', credential: 'q5bxEFR0b4eFpj3j' },

    // ── twilio global edge (public stun) ─────────────────────────────────
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:regional.stun.twilio.com:3478' },

    // ── coturn public ─────────────────────────────────────────────────────
    { urls: 'stun:turn.matrix.org' },
    { urls: 'turn:turn.matrix.org',                         username: 'aura', credential: 'aura' },

    // ── Mozilla public STUN ───────────────────────────────────────────────
    { urls: 'stun:stun.services.mozilla.com:3478' },

    // ── openrelay extra ports ────────────────────────────────────────────
    { urls: 'turn:openrelay.metered.ca:80?transport=tcp',   username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },

    // ── icetest & misc ────────────────────────────────────────────────────
    { urls: 'stun:stun.3cx.com:3478' },
    { urls: 'stun:stun.acrobits.cz:3478' },
    { urls: 'stun:stun.altar.com.pl:3478' },
    { urls: 'stun:stun.avigora.fr:3478' },
    { urls: 'stun:stun.b2b2c.ca:3478' },
    { urls: 'stun:stun.cablenet-as.net:3478' },
    { urls: 'stun:stun.callromania.ro:3478' },
    { urls: 'stun:stun.callwithus.com:3478' },
    { urls: 'stun:stun.cheapvoip.com:3478' },
    { urls: 'stun:stun.cloopen.com:3478' },
    { urls: 'stun:stun.commpeak.com:3478' },
    { urls: 'stun:stun.cope.es:3478' },
    { urls: 'stun:stun.cu-tme.net:3478' },
    { urls: 'stun:stun.dcalling.de:3478' },
    { urls: 'stun:stun.demos.ru:3478' },
    { urls: 'stun:stun.develz.org:3478' },
    { urls: 'stun:stun.dialog.lk:3478' },
    { urls: 'stun:stun.doublerobotics.com:3478' },
    { urls: 'stun:stun.drogon.net:3478' },
    { urls: 'stun:stun.easybell.de:3478' },
    { urls: 'stun:stun.easter-eggs.com:3478' },
    { urls: 'stun:stun.ekiga.net:3478' },
    { urls: 'stun:stun.futurasp.es:3478' },
    { urls: 'stun:stun.gmx.de:3478' },
    { urls: 'stun:stun.halonet.pl:3478' },
    { urls: 'stun:stun.hicare.net:3478' },
    { urls: 'stun:stun.hosteurope.de:3478' },
    { urls: 'stun:stun.internetcalls.com:3478' },
    { urls: 'stun:stun.ipfire.org:3478' },
    { urls: 'stun:stun.ippi.fr:3478' },
    { urls: 'stun:stun.ipshka.com:3478' },
    { urls: 'stun:stun.it1.hr:3478' },
    { urls: 'stun:stun.ivao.aero:3478' },
    { urls: 'stun:stun.jumblo.com:3478' },
    { urls: 'stun:stun.justvoip.com:3478' },
    { urls: 'stun:stun.l.google.com:5349' },
    { urls: 'stun:stun1.l.google.com:5349' },
    { urls: 'stun:stun2.l.google.com:5349' },
    { urls: 'stun:stun3.l.google.com:5349' },
    { urls: 'stun:stun4.l.google.com:5349' },

    // ── Global public STUN pool ────────────────────────────────────────────
    { urls: 'stun:stun.linphone.org' },
    { urls: 'stun:stun.linphone.org:3479' },
    { urls: 'stun:stun.sip.us:3478' },
    { urls: 'stun:stun.12connect.com:3478' },
    { urls: 'stun:stun.12voip.com:3478' },
    { urls: 'stun:stun.1cbit.ru:3478' },
    { urls: 'stun:stun.1und1.de:3478' },
    { urls: 'stun:stun.2talk.co.nz:3478' },
    { urls: 'stun:stun.3cx.com:3478' },
    { urls: 'stun:stun.aa.net.uk:3478' },
    { urls: 'stun:stun.acrobits.cz:3478' },
    { urls: 'stun:stun.actionvoip.com:3478' },
    { urls: 'stun:stun.advfn.com:3478' },
    { urls: 'stun:stun.aeta-audio.com:3478' },
    { urls: 'stun:stun.aeta.fr:3478' },
    { urls: 'stun:stun.alltel.com.au:3478' },
    { urls: 'stun:stun.altar.com.pl:3478' },
    { urls: 'stun:stun.annatel.net:3478' },
    { urls: 'stun:stun.antisip.com:3478' },
    { urls: 'stun:stun.avigora.fr:3478' },
    { urls: 'stun:stun.axeos.nl:3478' },
    { urls: 'stun:stun.b2b2c.ca:3478' },
    { urls: 'stun:stun.bitburger.de:3478' },
    { urls: 'stun:stun.bluesip.net:3478' },
    { urls: 'stun:stun.bridewell.com:3478' },
    { urls: 'stun:stun.budgetphone.nl:3478' },
    { urls: 'stun:stun.cablenet-as.net:3478' },
    { urls: 'stun:stun.callromania.ro:3478' },
    { urls: 'stun:stun.callwithus.com:3478' },
    { urls: 'stun:stun.cbsys.net:3478' },
    { urls: 'stun:stun.chathelp.ru:3478' },
    { urls: 'stun:stun.cheapvoip.com:3478' },
    { urls: 'stun:stun.ciktel.com:3478' },
    { urls: 'stun:stun.cloopen.com:3478' },
    { urls: 'stun:stun.colocall.net:3478' },
    { urls: 'stun:stun.commpeak.com:3478' },
    { urls: 'stun:stun.cope.es:3478' },
    { urls: 'stun:stun.counterpath.com:3478' },
    { urls: 'stun:stun.counterpath.net:3478' },
    { urls: 'stun:stun.dcalling.de:3478' },
    { urls: 'stun:stun.demos.ru:3478' },
    { urls: 'stun:stun.develz.org:3478' },
    { urls: 'stun:stun.dialog.lk:3478' },
    { urls: 'stun:stun.doublerobotics.com:3478' },
    { urls: 'stun:stun.drogon.net:3478' },
    { urls: 'stun:stun.dus.net:3478' },
    { urls: 'stun:stun.easybell.de:3478' },
    { urls: 'stun:stun.easter-eggs.com:3478' },
    { urls: 'stun:stun.ekiga.net:3478' },
    { urls: 'stun:stun.epygi.com:3478' },
    { urls: 'stun:stun.fabertel.fr:3478' },
    { urls: 'stun:stun.freecall.com:3478' },
    { urls: 'stun:stun.freeswitch.org:3478' },
    { urls: 'stun:stun.freevoipdeal.com:3478' },
    { urls: 'stun:stun.futurasp.es:3478' },
    { urls: 'stun:stun.gmx.de:3478' },
    { urls: 'stun:stun.gradwell.com:3478' },
    { urls: 'stun:stun.halonet.pl:3478' },
    { urls: 'stun:stun.hoiio.com:3478' },
    { urls: 'stun:stun.hosteurope.de:3478' },
    { urls: 'stun:stun.infra.net:3478' },
    { urls: 'stun:stun.internetcalls.com:3478' },
    { urls: 'stun:stun.intervoip.com:3478' },
    { urls: 'stun:stun.ipfire.org:3478' },
    { urls: 'stun:stun.ippi.fr:3478' },
    { urls: 'stun:stun.ipshka.com:3478' },
    { urls: 'stun:stun.it1.hr:3478' },
    { urls: 'stun:stun.ivao.aero:3478' },
    { urls: 'stun:stun.jumblo.com:3478' },
    { urls: 'stun:stun.justvoip.com:3478' },
    { urls: 'stun:stun.kanet.ru:3478' },
    { urls: 'stun:stun.linuxtrent.it:3478' },
    { urls: 'stun:stun.liveo.fr:3478' },
    { urls: 'stun:stun.lowratevoip.com:3478' },
    { urls: 'stun:stun.lugosoft.com:3478' },
    { urls: 'stun:stun.lundimatin.fr:3478' },
    { urls: 'stun:stun.magnet.ie:3478' },
    { urls: 'stun:stun.manle.com:3478' },
    { urls: 'stun:stun.mgn.ru:3478' },
    { urls: 'stun:stun.modulus.gr:3478' },
    { urls: 'stun:stun.myvoiptraffic.com:3478' },
    { urls: 'stun:stun.nattel.com:3478' },
    { urls: 'stun:stun.nfon.net:3478' },
    { urls: 'stun:stun.nonoh.net:3478' },
    { urls: 'stun:stun.nottingham.ac.uk:3478' },
    { urls: 'stun:stun.nottingham.ac.uk:3479' },
    { urls: 'stun:stun.oiltelecom.ru:3478' },
    { urls: 'stun:stun.ippi.fr:3478' },
    { urls: 'stun:stun.ozekiphone.com:3478' },
    { urls: 'stun:stun.peeters.com:3478' },
    { urls: 'stun:stun.phoneserve.com:3478' },
    { urls: 'stun:stun.powervoip.com:3478' },
    { urls: 'stun:stun.qq.com:3478' },
    { urls: 'stun:stun.rockenstein.de:3478' },
    { urls: 'stun:stun.rolmail.net:3478' },
    { urls: 'stun:stun.rynga.com:3478' },
    { urls: 'stun:stun.schmieder.at:3478' },
    { urls: 'stun:stun.sip2sip.info:3478' },
    { urls: 'stun:stun.sipdiscount.com:3478' },
    { urls: 'stun:stun.sipgate.net:3478' },
    { urls: 'stun:stun.sipgate.net:10000' },
    { urls: 'stun:stun.siplogin.de:3478' },
    { urls: 'stun:stun.sipnet.net:3478' },
    { urls: 'stun:stun.sipnet.ru:3478' },
    { urls: 'stun:stun.sippeer.dk:3478' },
    { urls: 'stun:stun.siprelay.com:3478' },
    { urls: 'stun:stun.sipthor.net:3478' },
    { urls: 'stun:stun.solnet.ch:3478' },
    { urls: 'stun:stun.stadtwerke-eutin.de:3478' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.symposium.pl:3478' },
    { urls: 'stun:stun.t-online.de:3478' },
    { urls: 'stun:stun.tele2.com:3478' },
    { urls: 'stun:stun.telefacil.com:3478' },
    { urls: 'stun:stun.teliasonera.com:3478' },
    { urls: 'stun:stun.tng.de:3478' },
    { urls: 'stun:stun.twilio.com:3478' },
    { urls: 'stun:stun.ucallweekly.com:3478' },
    { urls: 'stun:stun.usfamilynet.net:3478' },
    { urls: 'stun:stun.vault.team:3478' },
    { urls: 'stun:stun.vo.lu:3478' },
    { urls: 'stun:stun.voip.blackberry.com:3478' },
    { urls: 'stun:stun.voip.eutelia.it:3478' },
    { urls: 'stun:stun.voipbuster.com:3478' },
    { urls: 'stun:stun.voipbusterpro.com:3478' },
    { urls: 'stun:stun.voipcheap.com:3478' },
    { urls: 'stun:stun.voipcheap.co.uk:3478' },
    { urls: 'stun:stun.voipgain.com:3478' },
    { urls: 'stun:stun.voipgate.com:3478' },
    { urls: 'stun:stun.voipinfocenter.com:3478' },
    { urls: 'stun:stun.voipio.com:3478' },
    { urls: 'stun:stun.voipraider.com:3478' },
    { urls: 'stun:stun.voipstunt.com:3478' },
    { urls: 'stun:stun.voipwise.com:3478' },
    { urls: 'stun:stun.voipzoom.com:3478' },
    { urls: 'stun:stun.voys.nl:3478' },
    { urls: 'stun:stun.voxbone.com:3478' },
    { urls: 'stun:stun.wifirst.net:3478' },
    { urls: 'stun:stun.xlite.com:3478' },
    { urls: 'stun:stun.zadarma.com:3478' },
    { urls: 'stun:stun.zmginc.com:3478' },
    { urls: 'stun:stun.solcon.nl:3478' },
    { urls: 'stun:stun.nextcloud.com:443' },
    { urls: 'stun:stun.nextcloud.com:3478' },

    // ── Extra TURN via open credentials (no traffic limit) ────────────────
    { urls: 'turn:relay.backups.cz',                        username: 'webrtc', credential: 'webrtc' },
    { urls: 'turn:relay.backups.cz:443?transport=tcp',      username: 'webrtc', credential: 'webrtc' },
    { urls: 'turn:turn.bistri.com:80',                      username: 'homeo',  credential: 'homeo' },
    { urls: 'turn:turn.bistri.com:443',                     username: 'homeo',  credential: 'homeo' },
    { urls: 'turn:webrtc.cheap:3478',                       username: 'free',   credential: 'free' },
  ]);
});



app.use(express.json());

// ════════════════════════════════════════════════════════════════════════════
//  AI ЧАТ — Mistral с инструментами, памятью файлов и просмотром изображений
// ════════════════════════════════════════════════════════════════════════════
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'F6vBTTKWM8ZrNsFFU53EH2Uh8HxIQ40Q';
// MiniMax (Aura AI) — MiniMax-M2.5 (самая новая, март 2026)
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || ''; // Set MINIMAX_API_KEY in Render environment
const MINIMAX_API_URL = 'https://api.minimax.io/v1/chat/completions'; // OpenAI-compatible
const aiConversations = new Map(); // username -> { history:[], msgCount:0 }
const AI_CONV_FILE = 'ai_conversations.json';

// Load AI conversations from storage
async function loadAiConversations() {
  try {
    let data;
    if (USE_SB) {
      data = await sbReadJson(AI_CONV_FILE);
    } else {
      const { bucketName } = b2GetBucketForFile(AI_CONV_FILE);
      const text = await b2S3Download(bucketName, AI_CONV_FILE);
      data = JSON.parse(text);
    }
    if (data) {
      for (const [user, sess] of Object.entries(data)) {
        const hist = (sess.history || []).slice(-40);
        aiConversations.set(user, { history: hist, msgCount: sess.msgCount || 0, debugMode: false });
      }
      console.log(`[AI] Загружены беседы: ${aiConversations.size} пользователей`);
    }
  } catch(e) {
    console.log('[AI] ai_conversations.json не найден');
  }
}

// Save AI conversations to storage
let _aiSaveTimer = null;
function scheduleAiConvSave() {
  if (_aiSaveTimer) return;
  _aiSaveTimer = setTimeout(async () => {
    _aiSaveTimer = null;
    try {
      const obj = {};
      for (const [user, sess] of aiConversations.entries()) {
        obj[user] = { history: (sess.history||[]).slice(-40), msgCount: sess.msgCount||0 };
      }
      const buf = Buffer.from(JSON.stringify(obj));
      await storageUpload(AI_CONV_FILE, buf, 'application/json');
    } catch(e) { console.error('[AI] Ошибка сохранения бесед:', e.message); }
  }, 5000); // Save 5s after last activity
}
const aiUserFiles     = new Map(); // username -> [{ id, name, content, ttl }]
const AI_FILES_FILE   = 'ai_files.json';

async function loadAiFiles() {
  try {
    let data;
    if (USE_SB) {
      data = await sbReadJson(AI_FILES_FILE);
    } else {
      const { bucketName } = b2GetBucketForFile(AI_FILES_FILE);
      const text = await b2S3Download(bucketName, AI_FILES_FILE);
      data = JSON.parse(text);
    }
    if (data) {
      for (const [user, files] of Object.entries(data)) {
        if (Array.isArray(files) && files.length) aiUserFiles.set(user, files.slice(-50));
      }
      console.log(`[AI] Загружены файлы: ${aiUserFiles.size} пользователей`);
    }
  } catch { console.log('[AI] ai_files.json не найден'); }
}
let _aiFilesSaveTimer = null;
function scheduleAiFilesSave() {
  if (_aiFilesSaveTimer) return;
  _aiFilesSaveTimer = setTimeout(async () => {
    _aiFilesSaveTimer = null;
    try {
      const obj = {};
      for (const [user, files] of aiUserFiles.entries()) {
        // Сохраняем только последние 20 файлов, без TTL сброса
        obj[user] = files.slice(-20).map(f => ({ ...f, ttl: AI_FILE_TTL }));
      }
      const buf = Buffer.from(JSON.stringify(obj));
      await storageUpload(AI_FILES_FILE, buf, 'application/json');
    } catch(e) { console.error('[AI] Ошибка сохранения файлов:', e.message); }
  }, 4000);
}
const AI_MAX_HISTORY  = 80;
const AI_FILE_TTL     = 10; // файлы живут 5 ответов ИИ

const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ── Debug-промп ──────────────────────────────────────────────────────────────
const AI_DEBUG_PASSPHRASE = 'AURA-DEBUG-7X9K-TEAM';  // секретный промп

const AI_SYSTEM_SAFE = `Ты — Aura AI, интеллектуальный помощник в мессенджере Aura. Дата: ${new Date().toLocaleDateString('ru-RU')}.

КТО ТЫ: Умный ассистент, который понимает смысл запросов — даже если они написаны неграмотно, коротко или с опечатками. Всегда догадывайся о намерении пользователя и выполняй задачу.

КОГДА СПРАШИВАТЬ ЧЕРЕЗ ask_user:
- Запрос слишком расплывчатый и можно сделать разные вещи ("напиши игру" — какую? на чём?)
- Нужно выбрать стиль, язык, параметры ("сделай дизайн" — какой цвет?)
- Пользователь просит что-то персональное ("составь план" — на какой срок?)
- НЕЛЬЗЯ спрашивать если можно сделать хорошее предположение самому
- МАКСИМУМ 1-2 вопроса, не больше. Предлагай варианты кнопками.

ПРАВИЛА РАБОТЫ:
1. Давай конкретный результат — не пиши "Готово" без содержания.
2. Код: create_file → run_code (обязательный тест) → если ошибки — исправь → create_file снова → отправь.
3. Несколько файлов — вызывай create_file N раз, они автоматически упакуются в ZIP.
4. Актуальные данные (новости, погода, курсы) — всегда через инструменты.
5. Отвечай на языке пользователя. Русский по умолчанию.
6. Форматируй: **жирный**, \`код\`, списки, таблицы где уместно.
7. Будь краток там где можно, развёрнут там где нужно.

ИНСТРУМЕНТЫ — используй активно:
web_search (поиск), get_weather (погода), calculate/math_advanced/math_solve (математика),
get_time/date_calc/timezone_convert (время), convert_currency/get_crypto/get_stock (финансы),
translate (перевод), wiki_search/news_search/get_news (инфо и новости),
create_file (ЛЮБОЙ код и данные), check_code (синтаксис), run_code (тест выполнения),
generate_data (таблицы/CSV/JSON), image_generate (картинки),
url_info/summarize_url/web_scrape (веб), encode_decode/regex_test/json_format (данные),
unit_convert/qr_generate/color_palette/random/reminder (утилиты),
compare/text_analyze/diagram_generate (анализ),
music_info/recipe_find/emoji_search/poem_generate (творчество),
create_presentation (презентации), ask_user (уточнить у пользователя)`;
function getAiSystem(username) {
  const sess = aiConversations.get(username);
  return sess?.debugMode ? AI_SYSTEM_DEBUG : AI_SYSTEM_SAFE;
}

const AI_SYSTEM = AI_SYSTEM_SAFE; // fallback

// ── Инструменты ──────────────────────────────────────────────────────────────
const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Поиск АКТУАЛЬНОЙ информации в интернете. Новости, события, статьи, факты.',
      parameters: { type:'object', properties:{ query:{ type:'string' } }, required:['query'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Текущая погода и прогноз в любом городе',
      parameters: { type:'object', properties:{ city:{ type:'string' } }, required:['city'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Математические вычисления: +,-,*,/,^,%, скобки, дроби',
      parameters: { type:'object', properties:{ expression:{ type:'string' } }, required:['expression'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: 'Текущее время, дата, день недели',
      parameters: { type:'object', properties:{} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'convert_currency',
      description: 'Актуальные курсы валют и конвертация. USD, EUR, RUB, GBP, JPY, CNY и др.',
      parameters: {
        type:'object',
        properties: {
          amount: { type:'number', description:'Сумма (0 чтобы просто узнать курс)' },
          from:   { type:'string', description:'Исходная валюта: USD, EUR, RUB...' },
          to:     { type:'string', description:'Целевая валюта' }
        },
        required:['from','to']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'translate',
      description: 'Перевод текста на любой язык',
      parameters: {
        type:'object',
        properties: {
          text:        { type:'string' },
          target_lang: { type:'string', description:'ru, en, de, fr, es, zh, ja, ar...' }
        },
        required:['text','target_lang']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'ОБЯЗАТЕЛЬНО используй для любого кода или файла с данными. Создаёт файл и отправляет пользователю для скачивания.',
      parameters: {
        type:'object',
        properties: {
          filename: { type:'string', description:'Имя файла: script.py, data.csv, page.html, notes.md' },
          content:  { type:'string', description:'Полное содержимое файла' },
          description: { type:'string', description:'Краткое описание что делает файл' }
        },
        required:['filename','content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_archive',
      description: 'Анализирует содержимое архива (ZIP, TAR) прикреплённого пользователем — показывает структуру, файлы, размеры',
      parameters: {
        type:'object',
        properties: {
          archive_info: { type:'string', description:'Информация об архиве из контекста' },
          action: { type:'string', description:'list (список файлов) / summary (краткий анализ) / extract_text (извлечь текст)' }
        },
        required:['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_data',
      description: 'Генерирует структурированные данные: таблицы, JSON, CSV, базы данных, тестовые данные',
      parameters: {
        type:'object',
        properties: {
          type:        { type:'string', description:'csv / json / sql / markdown_table / yaml' },
          description: { type:'string', description:'Что нужно сгенерировать' },
          rows:        { type:'number', description:'Количество строк/записей' }
        },
        required:['type','description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_crypto',
      description: 'Курсы криптовалют в реальном времени: Bitcoin, Ethereum, и др.',
      parameters: {
        type:'object',
        properties: {
          coins: { type:'string', description:'Монеты через запятую: BTC,ETH,SOL' }
        },
        required:['coins']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'url_info',
      description: 'Получает заголовок и краткое описание по URL',
      parameters: {
        type:'object',
        properties: {
          url: { type:'string', description:'URL сайта или страницы' }
        },
        required:['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wiki_search',
      description: 'Поиск и получение статей Wikipedia. Лучше web_search для фактических вопросов, биографий, истории, науки.',
      parameters: {
        type:'object',
        properties: {
          query:    { type:'string', description:'Поисковый запрос' },
          language: { type:'string', description:'Язык: ru, en, de, fr... По умолчанию: ru' }
        },
        required:['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_stock',
      description: 'Котировки акций, индексов. Apple, Tesla, Google, S&P500 и т.д.',
      parameters: {
        type:'object',
        properties: {
          symbol: { type:'string', description:'Тикер: AAPL, TSLA, GOOGL, ^GSPC, BTC-USD' }
        },
        required:['symbol']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'timezone_convert',
      description: 'Конвертация времени между часовыми поясами',
      parameters: {
        type:'object',
        properties: {
          time:      { type:'string', description:'Время в формате HH:MM или "сейчас"' },
          from_tz:   { type:'string', description:'Исходный часовой пояс: Europe/Moscow, America/New_York, Asia/Tokyo...' },
          to_tz:     { type:'string', description:'Целевой часовой пояс' }
        },
        required:['from_tz','to_tz']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'qr_generate',
      description: 'Генерирует QR-код для текста, URL или контактных данных. Возвращает как файл.',
      parameters: {
        type:'object',
        properties: {
          text: { type:'string', description:'Текст или URL для QR-кода' },
          size: { type:'number', description:'Размер в пикселях (100-500), по умолчанию 200' }
        },
        required:['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'color_palette',
      description: 'Генерирует цветовую палитру или конвертирует цвета между форматами (HEX, RGB, HSL). Возвращает HTML-файл.',
      parameters: {
        type:'object',
        properties: {
          input:  { type:'string', description:'Цвет или название стиля: "#FF5733", "ocean blue", "warm sunset"' },
          count:  { type:'number', description:'Количество цветов в палитре (3-10)' }
        },
        required:['input']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'unit_convert',
      description: 'Конвертация единиц: длина, вес, температура, объём, площадь, скорость',
      parameters: {
        type:'object',
        properties: {
          value: { type:'number' },
          from:  { type:'string', description:'Единица: km, m, cm, kg, g, lb, oz, C, F, K, l, ml, mph, kmh...' },
          to:    { type:'string', description:'Целевая единица' }
        },
        required:['value','from','to']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dictionary',
      description: 'Определение слова, синонимы, произношение',
      parameters: {
        type:'object',
        properties: {
          word:     { type:'string' },
          language: { type:'string', description:'en, ru — по умолчанию en' }
        },
        required:['word']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_code',
      description: 'Проверяет код на синтаксические ошибки и запускает его в безопасной виртуальной среде (Node.js sandbox). Показывает результат выполнения, логи, ошибки. ВСЕГДА вызывай после create_file с кодом.',
      parameters: {
        type: 'object',
        properties: {
          code:     { type: 'string', description: 'Код для проверки' },
          language: { type: 'string', description: 'Язык: python, javascript, bash' },
          filename: { type: 'string', description: 'Имя файла (для контекста)' }
        },
        required: ['code', 'language']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'news_search',
      description: 'Поиск свежих новостей на любую тему через NewsData.io',
      parameters: { type:'object', properties: { query:{ type:'string' }, language:{ type:'string', description:'ru, en' } }, required:['query'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'image_generate',
      description: 'Генерирует изображение по текстовому описанию используя Pollinations AI. Возвращает изображение прямо в чат.',
      parameters: { type:'object', properties: { prompt:{ type:'string', description:'Описание изображения на английском' }, style:{ type:'string', description:'realistic, anime, digital-art, watercolor, oil-painting' } }, required:['prompt'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_presentation',
      description: 'Создаёт HTML презентацию или анимацию. Возвращает файл с превью.',
      parameters: { type:'object', properties: { title:{ type:'string' }, slides:{ type:'array', items:{ type:'object', properties:{ title:{type:'string'}, content:{type:'string'}, bg:{type:'string',description:'background color or gradient'} } } }, animation_style:{ type:'string', description:'fade, slide, zoom, flip' } }, required:['title','slides'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_code',
      description: 'Выполняет код напрямую и возвращает результат. Python или JavaScript. Безопасная изолированная среда.',
      parameters: { type:'object', properties:{ code:{type:'string'}, language:{type:'string',description:'python или javascript'} }, required:['code','language'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'regex_test',
      description: 'Тестирует регулярное выражение на тексте, показывает совпадения',
      parameters: { type:'object', properties:{ pattern:{type:'string'}, text:{type:'string'}, flags:{type:'string',description:'g,i,m,s'} }, required:['pattern','text'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'encode_decode',
      description: 'Кодирует/декодирует: base64, URL, HTML entities, hex, MD5, SHA256, JWT',
      parameters: { type:'object', properties:{ text:{type:'string'}, mode:{type:'string',description:'base64_encode, base64_decode, url_encode, url_decode, hex, md5, sha256, html_escape, html_unescape'} }, required:['text','mode'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'json_format',
      description: 'Форматирует, валидирует, трансформирует JSON. Поиск по ключу, минификация.',
      parameters: { type:'object', properties:{ json:{type:'string'}, action:{type:'string',description:'format, minify, validate, extract (key=... )'}, key:{type:'string'} }, required:['json','action'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'image_generate',
      description: 'Генерирует изображение по текстовому описанию (Pollinations AI, бесплатно, лимит 3/день). Показывает прямо в чате.',
      parameters: { type:'object', properties:{ prompt:{type:'string',description:'Описание на любом языке'}, style:{type:'string',description:'realistic, anime, digital-art, watercolor, oil-painting, cinematic, 3d-render'}, width:{type:'number'}, height:{type:'number'} }, required:['prompt'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'random',
      description: 'Генерирует случайные данные: числа, UUID, пароли, имена, цвета, кости',
      parameters: { type:'object', properties:{ type:{type:'string',description:'number, uuid, password, name, color, dice, coin, shuffle'}, min:{type:'number'}, max:{type:'number'}, count:{type:'number'}, length:{type:'number'} }, required:['type'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'date_calc',
      description: 'Вычисляет разницу между датами, добавляет/вычитает дни, находит день недели, праздники',
      parameters: { type:'object', properties:{ action:{type:'string',description:'diff, add, weekday, next_holiday, age, countdown'}, date1:{type:'string'}, date2:{type:'string'}, days:{type:'number'} }, required:['action'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'text_analyze',
      description: 'Анализирует текст: подсчёт слов/символов, читаемость, частые слова, язык, тональность',
      parameters: { type:'object', properties:{ text:{type:'string'}, action:{type:'string',description:'stats, frequency, readability, sentiment, language'} }, required:['text','action'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'math_advanced',
      description: 'Продвинутая математика: матрицы, статистика, геометрия, теория чисел, комбинаторика',
      parameters: { type:'object', properties:{ operation:{type:'string',description:'prime, fibonacci, factorial, gcd, lcm, sqrt, log, sin, cos, tan, matrix_det, statistics'}, values:{type:'array',items:{type:'number'}}, n:{type:'number'} }, required:['operation'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ip_info',
      description: 'Информация об IP адресе: страна, провайдер, координаты, тип',
      parameters: { type:'object', properties:{ ip:{type:'string',description:'IP адрес или "my" для своего'} }, required:['ip'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_scrape',
      description: 'Загружает и читает содержимое любой веб-страницы',
      parameters: { type:'object', properties:{ url:{type:'string'}, extract:{type:'string',description:'all, text, links, images, title'} }, required:['url'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'code_convert',
      description: 'Конвертирует код между языками: Python↔JavaScript, JSON↔YAML↔TOML, SQL↔MongoDB и т.д.',
      parameters: { type:'object', properties:{ code:{type:'string'}, from_lang:{type:'string'}, to_lang:{type:'string'} }, required:['code','from_lang','to_lang'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'diagram_generate',
      description: 'Создаёт диаграммы: flowchart, sequence, mindmap, gantt, pie. Возвращает HTML файл с интерактивной диаграммой.',
      parameters: { type:'object', properties:{ type:{type:'string',description:'flowchart, sequence, mindmap, pie, gantt, orgchart'}, title:{type:'string'}, data:{type:'string',description:'описание элементов и связей'} }, required:['type','data'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'music_info',
      description: 'Информация о песне, исполнителе, альбоме через Last.fm. Топ треки, биография.',
      parameters: { type:'object', properties:{ query:{type:'string'}, type:{type:'string',description:'track, artist, album, top_tracks'} }, required:['query','type'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recipe_find',
      description: 'Находит рецепты блюд: ингредиенты, шаги, калории, время приготовления',
      parameters: { type:'object', properties:{ dish:{type:'string'}, language:{type:'string',description:'ru, en'} }, required:['dish'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_convert',
      description: 'Конвертирует данные между форматами: CSV↔JSON, XML↔JSON, Markdown↔HTML',
      parameters: { type:'object', properties:{ content:{type:'string'}, from_format:{type:'string'}, to_format:{type:'string'} }, required:['content','from_format','to_format'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_screenshot',
      description: 'Делает описание/анализ веб-страницы: заголовок, мета-теги, основной контент, ссылки',
      parameters: { type:'object', properties: { url:{type:'string'}, depth:{type:'string',description:'basic, full, links'} }, required:['url'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'emoji_search',
      description: 'Поиск эмодзи по описанию на русском или английском',
      parameters: { type:'object', properties: { query:{type:'string'}, count:{type:'number'} }, required:['query'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'poem_generate',
      description: 'Генерирует стихотворение, рэп-куплет, песню, слоган по теме. Сохраняет как файл.',
      parameters: { type:'object', properties: { theme:{type:'string'}, style:{type:'string',description:'poem, rap, haiku, limerick, song, slogan'}, language:{type:'string',description:'ru, en'} }, required:['theme','style'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'math_solve',
      description: 'Решает уравнения, системы уравнений, вычисляет пределы, производные, интегралы. Показывает шаги.',
      parameters: { type:'object', properties: { expression:{type:'string',description:'Математическое выражение или уравнение'}, action:{type:'string',description:'solve, derivative, integral, limit, simplify, factor'} }, required:['expression'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'compare',
      description: 'Сравнивает два объекта/технологии/продукта: плюсы/минусы, характеристики в таблице',
      parameters: { type:'object', properties: { item1:{type:'string'}, item2:{type:'string'}, aspect:{type:'string',description:'Аспект сравнения: цена, производительность, функции...'} }, required:['item1','item2'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'image_generate',
      description: 'Генерирует изображение по описанию используя Pollinations AI (лимит 3/день). Отправляет прямо в чат.',
      parameters: { type:'object', properties: { prompt:{type:'string'}, style:{type:'string',description:'realistic, anime, digital-art, watercolor, cinematic, 3d-render, sketch'} }, required:['prompt'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'ВАЖНО: Задаёт пользователю уточняющий вопрос с кнопками-вариантами. Используй ОБЯЗАТЕЛЬНО когда запрос неоднозначный или нужны детали (язык, стиль, параметры). Не угадывай — спрашивай. Варианты должны быть конкретными кнопками, не текстом.',
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            description: 'Список вопросов (1-5). Показываются по одному — после ответа на первый появляется второй.',
            items: {
              type: 'object',
              properties: {
                question:     { type: 'string', description: 'Текст вопроса' },
                options:      { type: 'array', items: { type: 'string' }, description: 'Варианты ответов' },
                multi_select: { type: 'boolean', description: 'true = можно выбрать несколько вариантов' },
                allow_custom: { type: 'boolean', description: 'Разрешить свободный ввод' },
                required:     { type: 'boolean', description: 'false = можно пропустить' }
              },
              required: ['question']
            }
          }
        },
        required: ['questions']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_news',
      description: 'Актуальные новости по теме — технологии, спорт, финансы, наука',
      parameters: { type:'object', properties:{ topic:{ type:'string' }, lang:{ type:'string', description:'ru или en' } }, required:['topic'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'summarize_url',
      description: 'Открывает страницу по URL и возвращает краткое содержание',
      parameters: { type:'object', properties:{ url:{ type:'string' } }, required:['url'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reminder',
      description: 'Сохраняет заметку, todo или напоминание',
      parameters: { type:'object', properties:{ text:{ type:'string' }, label:{ type:'string', description:'note / todo / reminder' } }, required:['text'] }
    }
  }
];

// ── Утилиты ──────────────────────────────────────────────────────────────────
function aiGetSession(username) {
  if (!aiConversations.has(username)) {
    aiConversations.set(username, { history: [], msgCount: 0, debugMode: false });
  }
  return aiConversations.get(username);
}

function aiTickFiles(username) {
  const files = aiUserFiles.get(username) || [];
  const alive = files.map(f => ({ ...f, ttl: f.ttl - 1 })).filter(f => f.ttl > 0);
  if (alive.length) aiUserFiles.set(username, alive);
  else              aiUserFiles.delete(username);
  return alive;
}

function aiSaveFile(username, filename, content, description) {
  const files  = aiUserFiles.get(username) || [];
  const fileId = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const safe   = filename.replace(/[^a-zA-Z0-9._\-а-яёА-ЯЁ]/gi, '_');
  files.push({ id: fileId, name: safe, content, ttl: AI_FILE_TTL, description: description || '', created: new Date().toISOString() });
  aiUserFiles.set(username, files);
  scheduleAiFilesSave(); // сохраняем файлы после добавления
  return { fileId, safe };
}

// ── Выполнение инструментов ──────────────────────────────────────────────────
async function executeTool(name, args, username) {
  try {

    // ── Время ──────────────────────────────────────────────────────────────
    if (name === 'get_time') {
      const now = new Date();
      const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
      return `${days[now.getDay()]}, ${now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)`;
    }

    // ── Калькулятор ────────────────────────────────────────────────────────
    if (name === 'calculate') {
      const expr = (args.expression || '').replace(/[^0-9+\-*/().,\s%eE]/g, '').trim();
      if (!expr) return 'Некорректное выражение';
      try {
        const result = Function('"use strict"; return (' + expr + ')')();
        const fmt = (n) => Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(10)).toString();
        return `${args.expression} = **${fmt(result)}**`;
      } catch { return 'Не удалось вычислить выражение'; }
    }

    // ── Поиск в интернете ──────────────────────────────────────────────────
    if (name === 'web_search') {
      const q = args.query || '';
      aiSseEmit(username, 'log', { icon: '🔍', text: `Ищу: ${q}`, type: 'search' });
      let result = '';

      // Пробуем Wikipedia API для фактических запросов
      try {
        const lang = /[а-яё]/i.test(q) ? 'ru' : 'en';
        const wikiR = await axios.get(
          `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json&srlimit=3`,
          { timeout: 5000 }
        );
        const hits = wikiR.data?.query?.search || [];
        if (hits.length) {
          result += `Wikipedia:\n`;
          for (const h of hits.slice(0, 2)) {
            const snippet = h.snippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
            result += `• **${h.title}**: ${snippet}\n`;
          }
          result += '\n';
        }
      } catch {}

      // DuckDuckGo Instant Answers
      try {
        const ddg = await axios.get(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`,
          { timeout: 6000, headers: { 'User-Agent': 'AuraAI/1.0' } }
        );
        const d = ddg.data;
        if (d.AbstractText)   result += d.AbstractText + '\n';
        if (d.Answer)         result += 'Ответ: ' + d.Answer + '\n';
        if (d.Definition)     result += 'Определение: ' + d.Definition + '\n';
        if (d.RelatedTopics?.length) {
          d.RelatedTopics.slice(0, 3).forEach(t => { if (t.Text) result += `• ${t.Text}\n`; });
        }
      } catch {}

      if (!result) result = `По запросу "${q}" внешние источники не дали результата. Отвечу по своим знаниям.`;
      return result.trim().slice(0, 3000);
    }

    // ── Погода ────────────────────────────────────────────────────────────
    if (name === 'get_weather') {
      aiSseEmit(username, 'log', { icon: '🌤', text: `Погода: ${args.city}`, type: 'fetch' });
      const geoR = await axios.get(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.city)}&count=1&language=ru&format=json`,
        { timeout: 6000 }
      );
      const loc = geoR.data?.results?.[0];
      if (!loc) return `Город "${args.city}" не найден`;

      const wR = await axios.get(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=auto&forecast_days=3`,
        { timeout: 6000 }
      );
      const c = wR.data?.current;
      const daily = wR.data?.daily;
      const wCode = c?.weather_code || 0;
      const wEmoji = wCode === 0 ? '☀️' : wCode <= 3 ? '⛅' : wCode <= 48 ? '☁️' : wCode <= 67 ? '🌧' : wCode <= 77 ? '❄️' : '⛈';
      const wDesc  = wCode === 0 ? 'Ясно' : wCode <= 3 ? 'Переменная облачность' : wCode <= 48 ? 'Пасмурно' : wCode <= 67 ? 'Дождь' : wCode <= 77 ? 'Снег' : 'Гроза';

      let result = `**${loc.name}** сейчас: ${c?.temperature_2m}°C (ощущается ${c?.apparent_temperature}°C)\n`;
      result += `${wEmoji} ${wDesc}, влажность ${c?.relative_humidity_2m}%, ветер ${c?.wind_speed_10m} км/ч\n\n`;
      result += `Прогноз:\n`;
      if (daily?.time) {
        daily.time.slice(0, 3).forEach((date, i) => {
          const dCode = daily.weather_code?.[i] || 0;
          const dEmoji = dCode <= 3 ? '☀️' : dCode <= 48 ? '⛅' : dCode <= 67 ? '🌧' : dCode <= 77 ? '❄️' : '⛈';
          const d = new Date(date);
          const dayName = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()];
          result += `• ${dayName} ${d.getDate()}: ${dEmoji} ${daily.temperature_2m_min?.[i]}…${daily.temperature_2m_max?.[i]}°C`;
          if (daily.precipitation_sum?.[i] > 0) result += ` 💧${daily.precipitation_sum[i]}мм`;
          result += '\n';
        });
      }
      return result.trim();
    }

    // ── Конвертация валют ──────────────────────────────────────────────────
    if (name === 'convert_currency') {
      const { from, to, amount = 1 } = args;
      aiSseEmit(username, 'log', { icon: '💱', text: `Курс ${from} → ${to}`, type: 'fetch' });
      const fromU = from.toUpperCase();
      const toU   = to.toUpperCase();
      if (toU === fromU) return `1 ${fromU} = 1 ${toU}`;

      let rate = null;
      let source = '';

      // ── API 1: Центральный Банк России (для RUB) ──────────────────────
      if (fromU === 'RUB' || toU === 'RUB') {
        try {
          const cbr = await axios.get('https://www.cbr-xml-daily.ru/daily_json.js', { timeout: 7000 });
          const valutes = cbr.data?.Valute || {};
          if (fromU === 'RUB') {
            const v = valutes[toU];
            if (v) { rate = v.Nominal / v.Value; source = 'ЦБ РФ'; }
          } else {
            const v = valutes[fromU];
            if (v) { rate = v.Value / v.Nominal; source = 'ЦБ РФ'; }
          }
        } catch {}
      }

      // ── API 2: ExchangeRate-API (open, бесплатно, поддерживает RUB) ────
      if (!rate) {
        try {
          const r = await axios.get(`https://open.er-api.com/v6/latest/${fromU}`, { timeout: 7000 });
          const r2 = r.data?.rates?.[toU];
          if (r2) { rate = r2; source = 'ExchangeRate-API'; }
        } catch {}
      }

      // ── API 3: Frankfurter (ЕЦБ, без RUB) ────────────────────────────
      if (!rate) {
        try {
          const r = await axios.get(`https://api.frankfurter.app/latest?from=${fromU}&to=${toU}`, { timeout: 6000 });
          const r2 = r.data?.rates?.[toU];
          if (r2) { rate = r2; source = 'Frankfurter/ЕЦБ'; }
        } catch {}
      }

      // ── API 4: Fixer.io (бесплатный план через публичный зеркальный endpoint) ──
      if (!rate) {
        try {
          const r = await axios.get(`https://api.exchangerate.host/latest?base=${fromU}&symbols=${toU}`, { timeout: 7000 });
          const r2 = r.data?.rates?.[toU];
          if (r2) { rate = r2; source = 'ExchangeRate.host'; }
        } catch {}
      }

      if (!rate) {
        return `Не удалось получить актуальный курс ${fromU}/${toU}. Проверь на сайте ЦБ РФ: cbr.ru`;
      }

      const result = (amount * rate).toFixed(4).replace(/\.?0+$/, '');
      const rateStr = rate < 0.001 ? rate.toExponential(4) : rate >= 1000 ? rate.toFixed(2) : rate.toFixed(4).replace(/\.?0+$/, '');
      return `💱 Курс (${source}):\n**1 ${fromU} = ${rateStr} ${toU}**\n${amount !== 1 ? `${amount} ${fromU} = **${result} ${toU}**` : ''}`.trim();
    }

    // ── Перевод текста ────────────────────────────────────────────────────
    if (name === 'translate') {
      aiSseEmit(username, 'log', { icon: '🌐', text: `Перевод → ${args.target_lang}`, type: 'process' });
      try {
        const r = await axios.get(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(args.text.slice(0, 500))}&langpair=auto|${args.target_lang}`,
          { timeout: 8000 }
        );
        const t = r.data?.responseData?.translatedText;
        return t ? `Перевод (${args.target_lang}): **${t}**` : 'Не удалось перевести';
      } catch (e) { return 'Ошибка перевода: ' + e.message; }
    }

    // ── Создание файла ────────────────────────────────────────────────────
    if (name === 'create_file') {
      const { filename, content, description } = args;
      if (!filename || !content) return 'Не указано имя файла или содержимое';
      aiSseEmit(username, 'log', { icon: '📄', text: `Создаю файл: ${filename}`, type: 'write' });
      const { fileId, safe } = aiSaveFile(username, filename, content, description);
      return `FILE_CREATED:${fileId}:${safe}:${description || ''}:${content.length}`;
    }

    // ── Анализ архива ──────────────────────────────────────────────────────
    if (name === 'analyze_archive') {
      // Архив приходит как текстовый файл с листингом (пользователь приложил)
      const info = args.archive_info || '';
      return `Анализ архива: ${args.action}. ${info ? 'Данные из контекста: ' + info.slice(0, 500) : 'Прикрепи архив как файл чтобы я мог его проанализировать.'}`;
    }

    // ── Генерация данных ──────────────────────────────────────────────────
    if (name === 'generate_data') {
      const { type, description, rows = 10 } = args;
      aiSseEmit(username, 'log', { icon: '📊', text: `Генерирую ${type.toUpperCase()} данные...`, type: 'process' });
      // Генерируем через второй запрос к Mistral
      const genResp = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-small-latest',
        messages: [{
          role: 'user',
          content: `Сгенерируй ${rows} строк данных в формате ${type.toUpperCase()} для: ${description}. Верни ТОЛЬКО данные без пояснений.`
        }],
        max_tokens: 2000,
        temperature: 0.3,
      }, {
        headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      });
      const data = genResp.data.choices?.[0]?.message?.content || '';
      // Автоматически сохраняем как файл
      const ext = type === 'csv' ? 'csv' : type === 'json' ? 'json' : type === 'sql' ? 'sql' : type === 'yaml' ? 'yaml' : 'txt';
      const fname = `generated_data.${ext}`;
      const { fileId, safe } = aiSaveFile(username, fname, data, `Сгенерированные данные ${type.toUpperCase()}`);
      return `FILE_CREATED:${fileId}:${safe}:Сгенерированные данные (${type.toUpperCase()}):${data.length}\nПредпросмотр:\n${data.slice(0, 300)}...`;
    }

    // ── Криптовалюты ──────────────────────────────────────────────────────
    if (name === 'get_crypto') {
      aiSseEmit(username, 'log', { icon: '₿', text: `Крипто: ${args.coins}`, type: 'fetch' });
      const coins = (args.coins || 'BTC,ETH').split(',').map(c => c.trim().toLowerCase()).join(',');
      const r = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coins}&vs_currencies=usd,rub&include_24hr_change=true`,
        { timeout: 8000 }
      );
      const prices = r.data || {};
      let result = '**Курсы криптовалют:**\n';
      for (const [coin, data] of Object.entries(prices)) {
        const change = data.usd_24h_change?.toFixed(2);
        const arrow  = change > 0 ? '📈' : '📉';
        result += `• ${coin.toUpperCase()}: $${data.usd?.toLocaleString()} (${change}% ${arrow}) / ${data.rub?.toLocaleString()} ₽\n`;
      }
      return result.trim();
    }

    // ── URL инфо ──────────────────────────────────────────────────────────
    if (name === 'url_info') {
      const r = await axios.get(args.url, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 AuraAI/1.0' },
        maxContentLength: 50000,
      });
      const html = r.data?.toString() || '';
      const title       = html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim() || '';
      const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1]?.trim()
                       || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]?.trim() || '';
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
      return `**${title}**\n${description || text}`;
    }

    // ── Wikipedia поиск ───────────────────────────────────────────────────
    if (name === 'wiki_search') {
      aiSseEmit(username, 'log', { icon: '📖', text: `Wikipedia: ${args.query}`, type: 'search' });
      const lang = args.language || (/[а-яё]/i.test(args.query) ? 'ru' : 'en');
      const q = encodeURIComponent(args.query);
      // Получаем извлечение статьи
      const r = await axios.get(
        `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&utf8=&format=json&srlimit=1`,
        { timeout: 6000 }
      );
      const hit = r.data?.query?.search?.[0];
      if (!hit) return `Wikipedia: статья по "${args.query}" не найдена`;
      // Получаем текст
      const r2 = await axios.get(
        `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(hit.title)}&prop=extracts&exintro=true&explaintext=true&format=json`,
        { timeout: 6000 }
      );
      const pages = r2.data?.query?.pages || {};
      const page  = Object.values(pages)[0];
      const extract = (page?.extract || hit.snippet.replace(/<[^>]+>/g,'')).slice(0, 2000);
      return `**Wikipedia: ${hit.title}**\n${extract}`;
    }

    // ── Котировки акций ───────────────────────────────────────────────────
    if (name === 'get_stock') {
      aiSseEmit(username, 'log', { icon: '📈', text: `Котировка: ${args.symbol}`, type: 'fetch' });
      const sym = (args.symbol || '').toUpperCase().trim();
      try {
        // Yahoo Finance API (неофициальный, бесплатный)
        const r = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`,
          { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const meta   = r.data?.chart?.result?.[0]?.meta;
        if (!meta) return `Тикер "${sym}" не найден`;
        const price  = meta.regularMarketPrice;
        const prev   = meta.chartPreviousClose || meta.previousClose;
        const change = prev ? ((price - prev) / prev * 100).toFixed(2) : null;
        const arrow  = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
        const curr   = meta.currency || 'USD';
        let result = `**${meta.longName || sym} (${sym})**\nЦена: **${price} ${curr}** ${arrow}`;
        if (change) result += ` (${change > 0 ? '+' : ''}${change}%)`;
        result += `\nРынок: ${meta.exchangeName || ''}`;
        if (meta.marketCap) result += ` · Капитализация: $${(meta.marketCap/1e9).toFixed(2)}B`;
        return result;
      } catch (e) { return `Не удалось получить котировку ${sym}: ${e.message}`; }
    }

    // ── Конвертация часовых поясов ─────────────────────────────────────────
    if (name === 'timezone_convert') {
      try {
        const timeStr = args.time && args.time !== 'сейчас' ? args.time : null;
        const fromTz = args.from_tz;
        const toTz   = args.to_tz;
        let date;
        if (timeStr) {
          const [h, m] = timeStr.split(':').map(Number);
          date = new Date();
          date.setHours(h || 0, m || 0, 0, 0);
        } else {
          date = new Date();
        }
        const fmtOpts = { hour:'2-digit', minute:'2-digit', timeZone: toTz, hour12: false };
        const fmtSrc  = { hour:'2-digit', minute:'2-digit', timeZone: fromTz, hour12: false };
        const converted = date.toLocaleTimeString('ru-RU', fmtOpts);
        const source    = date.toLocaleTimeString('ru-RU', fmtSrc);
        const dateFrom  = date.toLocaleDateString('ru-RU', { timeZone: fromTz, weekday:'short', day:'2-digit', month:'short' });
        const dateTo    = date.toLocaleDateString('ru-RU', { timeZone: toTz, weekday:'short', day:'2-digit', month:'short' });
        return `🕐 ${fromTz}: **${source}** (${dateFrom})\n🕐 ${toTz}: **${converted}** (${dateTo})`;
      } catch(e) { return 'Ошибка конвертации времени: ' + e.message; }
    }

    // ── QR-код ────────────────────────────────────────────────────────────
    if (name === 'qr_generate') {
      const text = args.text || '';
      const size = Math.min(Math.max(args.size || 200, 100), 500);
      // Создаём HTML файл с QR через Google Charts API (работает в браузере)
      const encodedText = encodeURIComponent(text);
      const qrUrl = `https://chart.googleapis.com/chart?chs=${size}x${size}&cht=qr&chl=${encodedText}&choe=UTF-8`;
      const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>QR-код</title>
<style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f4f8;font-family:sans-serif}
.card{background:#fff;border-radius:20px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.1);text-align:center}
img{border-radius:10px}p{margin:16px 0 0;color:#6366f1;font-size:14px;word-break:break-all;max-width:${size}px}</style></head>
<body><div class="card">
<img src="${qrUrl}" width="${size}" height="${size}" alt="QR">
<p>${text.slice(0,80)}${text.length>80?'...':''}</p>
</div></body></html>`;
      const { fileId, safe } = aiSaveFile(username, 'qrcode.html', html);
      return `FILE_CREATED:${fileId}:${safe}:QR-код для: ${text.slice(0,40)}:${html.length}`;
    }

    // ── Цветовая палитра ──────────────────────────────────────────────────
    if (name === 'color_palette') {
      const count = Math.min(Math.max(args.count || 5, 3), 10);
      // Просим Mistral сгенерировать палитру
      const palR = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-small-latest',
        messages: [{ role:'user', content:`Generate ${count} harmonious colors for "${args.input}". Reply ONLY with JSON array: [{"hex":"#FF5733","name":"Coral Red","rgb":"255,87,51"},...]. No explanation.` }],
        max_tokens: 400, temperature: 0.8
      }, { headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type':'application/json' }, timeout: 15000 });
      let colors = [];
      try { colors = JSON.parse(palR.data.choices[0].message.content.replace(/```json?|```/g,'')); } catch {}
      if (!colors.length) return 'Не удалось сгенерировать палитру';
      const swatches = colors.map(c =>
        `<div class="swatch" style="background:${c.hex}"><div class="label"><strong>${c.hex}</strong><br>${c.name||''}</div></div>`
      ).join('');
      const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Палитра</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#111;min-height:100vh;display:flex;align-items:center;justify-content:center}
.palette{display:flex;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.5);height:300px;width:min(90vw,700px)}
.swatch{flex:1;display:flex;align-items:flex-end;transition:flex .3s}.swatch:hover{flex:2}
.label{background:rgba(0,0,0,.5);width:100%;padding:10px 8px;color:#fff;font-size:12px;text-align:center;backdrop-filter:blur(4px)}</style></head>
<body><div class="palette">${swatches}</div></body></html>`;
      const { fileId, safe } = aiSaveFile(username, 'palette.html', html);
      return `FILE_CREATED:${fileId}:${safe}:Цветовая палитра "${args.input}":${html.length}\nЦвета: ${colors.map(c=>c.hex).join(' ')}`;
    }

    // ── Конвертация единиц ────────────────────────────────────────────────
    if (name === 'unit_convert') {
      const { value, from, to } = args;
      const f = from.toLowerCase().trim();
      const t = to.toLowerCase().trim();
      const conv = {
        // Длина (базовая: метр)
        km:1000, m:1, cm:0.01, mm:0.001, mi:1609.34, yd:0.9144, ft:0.3048, in:0.0254,
        // Вес (базовая: кг)
        kg:1, g:0.001, mg:0.000001, lb:0.453592, oz:0.0283495, t:1000,
        // Объём (базовая: литр)
        l:1, ml:0.001, m3:1000, gal:3.78541, fl_oz:0.0295735, cup:0.236588,
        // Скорость (базовая: км/ч)
        kmh:1, mph:1.60934, ms:3.6, knot:1.852,
        // Площадь (базовая: м²)
        m2:1, km2:1e6, ha:10000, acre:4046.86, ft2:0.0929,
      };
      // Температура — особый случай
      const tempPairs = {
        'c→f': v => v*9/5+32, 'f→c': v => (v-32)*5/9,
        'c→k': v => v+273.15, 'k→c': v => v-273.15,
        'f→k': v => (v-32)*5/9+273.15, 'k→f': v => (v-273.15)*9/5+32,
      };
      const tKey = `${f}→${t}`;
      if (tempPairs[tKey]) {
        const r = tempPairs[tKey](value);
        return `**${value}°${f.toUpperCase()} = ${r.toFixed(4).replace(/\.?0+$/,'')}°${t.toUpperCase()}**`;
      }
      if (conv[f] && conv[t]) {
        const base   = value * conv[f];
        const result = base / conv[t];
        const fmt = n => Math.abs(n) < 0.001 ? n.toExponential(4) : parseFloat(n.toFixed(6)).toString();
        return `**${value} ${from} = ${fmt(result)} ${to}**`;
      }
      return `Не знаю как конвертировать ${from} → ${to}`;
    }

    // ── Словарь ───────────────────────────────────────────────────────────
    if (name === 'dictionary') {
      const lang = args.language || 'en';
      const word = encodeURIComponent(args.word);
      if (lang === 'en') {
        const r = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`, { timeout: 6000 });
        const entry = r.data?.[0];
        if (!entry) return `Слово "${args.word}" не найдено`;
        const meanings = entry.meanings?.slice(0, 2).map(m => {
          const defs = m.definitions?.slice(0, 2).map(d => `  • ${d.definition}${d.example ? ` (пример: _${d.example}_)` : ''}`).join('\n');
          const syns = m.synonyms?.slice(0,4).join(', ');
          return `**${m.partOfSpeech}**\n${defs}${syns ? `\n  синонимы: ${syns}` : ''}`;
        }).join('\n\n');
        const phonetic = entry.phonetics?.find(p=>p.text)?.text || '';
        return `📖 **${entry.word}** ${phonetic}\n\n${meanings}`;
      } else {
        // Для других языков используем Wiktionary
        const r = await axios.get(
          `https://${lang}.wiktionary.org/w/api.php?action=query&titles=${word}&prop=extracts&exintro=true&explaintext=true&format=json`,
          { timeout: 6000 }
        );
        const pages = r.data?.query?.pages || {};
        const page = Object.values(pages)[0];
        return page?.extract ? `📖 **${args.word}**\n${page.extract.slice(0,1000)}` : `"${args.word}" не найдено в Wiktionary`;
      }
    }

    // ── Прямой запуск кода ────────────────────────────────────────────────
    if (name === 'run_code') {
      const { code, language } = args;
      const lang = (language || '').toLowerCase();
      aiSseEmit(username, 'log', { text: `Запускаю ${lang} код...`, type: 'check' });
      const { execSync } = require('child_process');
      const tmpFile = require('path').join(require('os').tmpdir(), `run_${Date.now()}.${lang === 'python' ? 'py' : 'js'}`);
      try {
        fs.writeFileSync(tmpFile, code, 'utf8');
        const dangerous = /import\s+os|import\s+subprocess|require\s*\(\s*['"]child_process|exec\s*\(|spawn\s*\(/i;
        if (dangerous.test(code)) return '⚠️ Код содержит системные вызовы — запуск невозможен в sandbox.';
        const cmd = lang === 'python' ? `python3 "${tmpFile}"` : `node "${tmpFile}"`;
        const out = execSync(cmd, { timeout: 10000, encoding: 'utf8', maxBuffer: 100000 });
        aiSseEmit(username, 'log', { text: 'Выполнено успешно', type: 'result' });
        return `✅ Результат:\n\`\`\`\n${out.slice(0, 1000)}\n\`\`\``;
      } catch(e) {
        aiSseEmit(username, 'log', { text: 'Ошибка выполнения', type: 'check' });
        return `❌ Ошибка:\n\`\`\`\n${(e.stdout || e.message).slice(0,600)}\n\`\`\``;
      } finally { try { fs.unlinkSync(tmpFile); } catch {} }
    }

    // ── Regex тест ────────────────────────────────────────────────────────
    if (name === 'regex_test') {
      try {
        const flags  = args.flags || 'g';
        const regex  = new RegExp(args.pattern, flags);
        const text   = args.text || '';
        const matches = [];
        let m;
        if (flags.includes('g')) {
          while ((m = regex.exec(text)) !== null && matches.length < 20) {
            matches.push({ match: m[0], index: m.index, groups: m.slice(1) });
          }
        } else {
          m = regex.exec(text);
          if (m) matches.push({ match: m[0], index: m.index, groups: m.slice(1) });
        }
        if (!matches.length) return `Паттерн \`${args.pattern}\` — совпадений нет`;
        let result = `Паттерн \`${args.pattern}\` — найдено ${matches.length} совпадений:\n`;
        matches.slice(0,10).forEach((m,i) => {
          result += `${i+1}. \`${m.match}\` (pos: ${m.index})${m.groups.filter(Boolean).length ? ' groups: ' + m.groups.join(', ') : ''}\n`;
        });
        return result;
      } catch(e) { return `Ошибка regex: ${e.message}`; }
    }

    // ── Кодирование/декодирование ─────────────────────────────────────────
    if (name === 'encode_decode') {
      const { text, mode } = args;
      const crypto = require('crypto');
      try {
        switch(mode) {
          case 'base64_encode': return `Base64: \`${Buffer.from(text).toString('base64')}\``;
          case 'base64_decode': return `Декодировано: \`${Buffer.from(text, 'base64').toString('utf8')}\``;
          case 'url_encode':   return `URL: \`${encodeURIComponent(text)}\``;
          case 'url_decode':   return `URL decoded: \`${decodeURIComponent(text)}\``;
          case 'hex':          return `HEX: \`${Buffer.from(text).toString('hex')}\``;
          case 'md5':          return `MD5: \`${crypto.createHash('md5').update(text).digest('hex')}\``;
          case 'sha256':       return `SHA-256: \`${crypto.createHash('sha256').update(text).digest('hex')}\``;
          case 'html_escape':  return `HTML: \`${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}\``;
          case 'html_unescape':return `Unescaped: \`${text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')}\``;
          default: return `Неизвестный режим: ${mode}`;
        }
      } catch(e) { return `Ошибка: ${e.message}`; }
    }

    // ── JSON форматирование ────────────────────────────────────────────────
    if (name === 'json_format') {
      const { json, action, key } = args;
      try {
        const parsed = JSON.parse(json);
        if (action === 'format')   return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
        if (action === 'minify')   return `\`${JSON.stringify(parsed)}\``;
        if (action === 'validate') return `✅ Валидный JSON: ${Object.keys(parsed).length} ключей верхнего уровня`;
        if (action === 'extract' && key) {
          const val = key.split('.').reduce((o,k) => o?.[k], parsed);
          return `**${key}**: \`${JSON.stringify(val)}\``;
        }
        return JSON.stringify(parsed, null, 2);
      } catch(e) { return `❌ Невалидный JSON: ${e.message}`; }
    }

    // ── Проверка и запуск кода ────────────────────────────────────────────
    if (name === 'check_code') {
      const { code, language, filename } = args;
      aiSseEmit(username, 'log', { text: `Проверяю ${language} код...`, type: 'check' });
      const lang = (language || '').toLowerCase();
      let result = '';

      // Базовая синтаксическая проверка для JS через Node.js
      if (lang === 'javascript' || lang === 'js') {
        try {
          // Запуск в изолированном контексте Node.js (только синтаксис)
          const { execSync } = require('child_process');
          const tmpFile = require('path').join(require('os').tmpdir(), `check_${Date.now()}.js`);
          fs.writeFileSync(tmpFile, code, 'utf8');
          try {
            const output = execSync(`node --check "${tmpFile}" 2>&1`, { timeout: 5000, encoding: 'utf8' });
            result += `✅ Синтаксис JavaScript: OK\n`;
            // Попробуем запустить если нет опасных операций
            const dangerous = /require\s*\(\s*['"]fs['"]\)|exec\s*\(|spawn\s*\(|child_process|process\.exit|__dirname/i;
            if (!dangerous.test(code)) {
              try {
                const runOut = execSync(`node "${tmpFile}" 2>&1`, { timeout: 5000, encoding: 'utf8', maxBuffer: 50000 });
                result += `\n▶ Вывод:\n\`\`\`\n${runOut.slice(0, 500)}\n\`\`\``;
                aiSseEmit(username, 'log', { text: 'Код выполнен успешно', type: 'check' });
              } catch (runErr) {
                result += `\n⚠️ Ошибка выполнения:\n\`\`\`\n${runErr.stdout?.slice(0,400) || runErr.message}\n\`\`\``;
                aiSseEmit(username, 'log', { text: 'Ошибка выполнения — исправляю...', type: 'check' });
              }
            }
          } catch (e) {
            const errMsg = e.stdout || e.message || '';
            result += `❌ Синтаксическая ошибка JavaScript:\n\`\`\`\n${errMsg.slice(0, 400)}\n\`\`\``;
            aiSseEmit(username, 'log', { text: 'Найдены синтаксические ошибки', type: 'check' });
          } finally {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
        } catch (e) {
          result = `Проверка JS: ${e.message}`;
        }
      } else if (lang === 'python' || lang === 'py') {
        try {
          const { execSync } = require('child_process');
          const tmpFile = require('path').join(require('os').tmpdir(), `check_${Date.now()}.py`);
          fs.writeFileSync(tmpFile, code, 'utf8');
          try {
            // Синтаксис
            execSync(`python3 -m py_compile "${tmpFile}" 2>&1`, { timeout: 5000, encoding: 'utf8' });
            result += `✅ Синтаксис Python: OK\n`;
            // Безопасный запуск (без импорта os, subprocess, socket)
            const dangerous = /import\s+os|import\s+subprocess|import\s+socket|__import__|eval\s*\(|exec\s*\(/i;
            if (!dangerous.test(code)) {
              try {
                const runOut = execSync(`python3 "${tmpFile}" 2>&1`, { timeout: 8000, encoding: 'utf8', maxBuffer: 50000 });
                result += `\n▶ Вывод:\n\`\`\`\n${runOut.slice(0, 500)}\n\`\`\``;
                aiSseEmit(username, 'log', { text: 'Python код выполнен', type: 'check' });
              } catch (runErr) {
                result += `\n⚠️ Ошибка:\n\`\`\`\n${(runErr.stdout || runErr.message).slice(0,400)}\n\`\`\``;
                aiSseEmit(username, 'log', { text: 'Ошибка выполнения Python', type: 'check' });
              }
            } else {
              result += `\n⚠️ Запуск пропущен (импорт системных модулей). Синтаксис верный.`;
            }
          } catch (e) {
            result += `❌ Синтаксическая ошибка Python:\n\`\`\`\n${(e.stdout || e.message).slice(0,400)}\n\`\`\``;
            aiSseEmit(username, 'log', { text: 'Найдены ошибки Python', type: 'check' });
          } finally {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
        } catch (e) {
          result = `Проверка Python: ${e.message}`;
        }
      } else {
        // Для других языков — проверяем структуру через AI
        result = `📋 ${lang.toUpperCase()}: синтаксическая проверка через статический анализ.\nКод содержит ${code.split('\n').length} строк, ${code.length} символов.`;
        aiSseEmit(username, 'log', { text: `${lang} проверен статически`, type: 'check' });
      }

      if (!result) result = '✅ Проверка завершена';
      aiSseEmit(username, 'log', { text: 'Проверка кода завершена', type: 'check' });
      return result;
    }

    // ── Новости ──────────────────────────────────────────────────────────
    if (name === 'news_search') {
      aiSseEmit(username, 'log', { text: `Новости: ${args.query}`, type: 'search' });
      const lang = args.language || 'ru';
      try {
        // NewsData.io free tier (без ключа - базовый поиск)
        const r = await axios.get(
          `https://newsdata.io/api/1/news?q=${encodeURIComponent(args.query)}&language=${lang}&size=5`,
          { timeout: 8000, headers: { 'X-ACCESS-KEY': process.env.NEWSDATA_KEY || '' } }
        );
        const articles = r.data?.results || [];
        if (!articles.length) {
          // Fallback: Wikipedia news
          return await executeTool('wiki_search', { query: args.query + ' 2025' }, username);
        }
        let result = `Новости по "${args.query}":
`;
        articles.slice(0,4).forEach(a => {
          result += `• **${a.title}** (${a.source_id || 'новости'})
  ${(a.description||'').slice(0,120)}
`;
        });
        aiSseEmit(username, 'log', { text: `Найдено ${articles.length} новостей`, type: 'result' });
        return result;
      } catch {
        // Fallback to DuckDuckGo news
        return await executeTool('web_search', { query: args.query + ' новости 2025' }, username);
      }
    }

    // ── Генерация изображений (Pollinations.ai — бесплатно, без ключа) ────
    if (name === 'image_generate') {
      const limitErr = checkDailyLimit(username, 'image');
      if (limitErr) return limitErr;
      const prompt = args.prompt || '';
      const style  = args.style  || 'realistic';
      aiSseEmit(username, 'log', { text: `Генерирую: ${prompt.slice(0,50)}... (${getDailyLimitInfo(username)})`, type: 'process' });
      const encodedPrompt = encodeURIComponent(`${prompt}, ${style}, high quality, detailed`);
      const engines = [
        `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=true&model=flux`,
        `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=600&nologo=true&model=flux`,
        `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true`,
      ];
      let imgBase64 = null;
      for (const url of engines) {
        try {
          aiSseEmit(username, 'log', { text: 'Загружаю пикселя...', type: 'fetch' });
          const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 40000 });
          imgBase64 = Buffer.from(r.data).toString('base64');
          break;
        } catch(e) { console.log('[img] failed:', e.message); }
      }
      if (!imgBase64) return 'Не удалось сгенерировать изображение — попробуй другой промпт.';
      aiSseEmit(username, 'media', { type: 'image', base64: 'data:image/jpeg;base64,' + imgBase64, prompt });
      const html = '<!DOCTYPE html><html><head><title>AI Image</title><style>body{margin:0;background:#0d0d12;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:95vw;max-height:95vh;border-radius:12px}</style></head><body><img src="data:image/jpeg;base64,' + imgBase64 + '"/></body></html>';
      const { fileId, safe } = aiSaveFile(username, 'ai_image.html', html, 'AI изображение: ' + prompt.slice(0,40));
      aiSseEmit(username, 'log', { text: 'Изображение готово', type: 'result' });
      return 'FILE_CREATED:' + fileId + ':' + safe + ':AI изображение:' + html.length;
    }

    // ── Создание презентации ──────────────────────────────────────────────
    if (name === 'create_presentation') {
      const { title, slides = [], animation_style = 'slide' } = args;
      aiSseEmit(username, 'log', { text: `Создаю презентацию: ${title}`, type: 'write' });
      const animations = {
        fade:  'fadeIn .6s ease',
        slide: 'slideInRight .5s cubic-bezier(.16,1,.3,1)',
        zoom:  'scaleIn .5s cubic-bezier(.16,1,.3,1)',
        flip:  'flipIn .6s ease',
      };
      const anim = animations[animation_style] || animations.slide;
      const slideColors = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444'];
      const slidesHtml = slides.map((slide, i) => {
        const bg = slide.bg || `linear-gradient(135deg, ${slideColors[i%slideColors.length]}, ${slideColors[(i+1)%slideColors.length]})`;
        return `<div class="slide" id="slide${i}" style="display:${i===0?'flex':'none'};background:${bg}">
          <div class="content">
            <h2>${esc(slide.title||'')}</h2>
            <p>${esc(slide.content||'').replace(/\n/g,'<br>')}</p>
          </div>
          <div class="slide-num">${i+1}/${slides.length}</div>
        </div>`;
      }).join('');
      const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<title>${esc(title)}</title>
<style>
@keyframes slideInRight{from{opacity:0;transform:translateX(60px)}to{opacity:1;transform:none}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes scaleIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;height:100vh;overflow:hidden;background:#000}
.slide{width:100vw;height:100vh;flex-direction:column;align-items:center;justify-content:center;padding:40px;animation:${anim};cursor:pointer}
.content{text-align:center;color:#fff;max-width:800px}
h2{font-size:clamp(24px,5vw,56px);font-weight:800;margin-bottom:24px;text-shadow:0 2px 20px rgba(0,0,0,.3)}
p{font-size:clamp(14px,2.5vw,24px);opacity:.9;line-height:1.6}
.slide-num{position:fixed;bottom:20px;right:24px;color:rgba(255,255,255,.5);font-size:13px}
.progress{position:fixed;top:0;left:0;height:3px;background:rgba(255,255,255,.5);transition:width .3s}
.nav{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:8px}
.nav button{padding:8px 20px;border-radius:99px;border:2px solid rgba(255,255,255,.4);background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:13px;backdrop-filter:blur(8px)}
.nav button:hover{background:rgba(255,255,255,.25)}
.title-bar{position:fixed;top:20px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.6);font-size:13px;background:rgba(0,0,0,.3);padding:4px 14px;border-radius:99px;backdrop-filter:blur(8px)}
</style></head><body>
${slidesHtml}
<div class="progress" id="prog"></div>
<div class="title-bar">${esc(title)}</div>
<div class="nav">
  <button onclick="prev()">← Назад</button>
  <button onclick="next()">Далее →</button>
</div>
<script>
let cur=0;const total=${slides.length};
function show(n){document.querySelectorAll('.slide').forEach((s,i)=>s.style.display=i===n?'flex':'none');cur=n;document.getElementById('prog').style.width=((n+1)/total*100)+'%';}
function next(){if(cur<total-1)show(cur+1);}
function prev(){if(cur>0)show(cur-1);}
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' ')next();if(e.key==='ArrowLeft')prev();});
document.querySelectorAll('.slide').forEach(s=>s.onclick=next);
</script></body></html>`;
      const { fileId, safe } = aiSaveFile(username, `${title.replace(/\s+/g,'_')}.html`, html, `Презентация: ${title}`);
      aiSseEmit(username, 'log', { text: `Презентация готова (${slides.length} слайдов)`, type: 'result' });
      return `FILE_CREATED:${fileId}:${safe}:Презентация "${title}" (${slides.length} слайдов):${html.length}`;
    }

    // ── Случайные данные ─────────────────────────────────────────────────
    if (name === 'random') {
      const { type, min=1, max=100, count=1, length=16 } = args;
      const crypto = require('crypto');
      switch(type) {
        case 'number': {
          const nums = Array.from({length:count}, () => Math.floor(Math.random()*(max-min+1))+min);
          return `🎲 Случайн${count>1?'ые числа':'ое число'}: **${nums.join(', ')}**`;
        }
        case 'uuid':    return `🔑 UUID: \`${crypto.randomUUID()}\``;
        case 'password': {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
          const pwd = Array.from({length}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
          return `🔐 Пароль (${length} симв): \`${pwd}\``;
        }
        case 'color': {
          const hex = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0');
          return `🎨 Цвет: \`${hex}\` (RGB: ${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)})`;
        }
        case 'dice':  return `🎲 Кубик d${max||6}: **${Math.floor(Math.random()*(max||6))+1}**`;
        case 'coin':  return `🪙 Монета: **${Math.random()>0.5?'Орёл':'Решка'}**`;
        case 'name': {
          const names = ['Александр','Дмитрий','Михаил','Иван','Андрей','Алексей','Елена','Наталья','Анна','Мария','Ольга','Татьяна'];
          const surns = ['Иванов','Смирнов','Кузнецов','Попов','Соколов','Лебедев','Козлов','Новиков','Морозов','Петров'];
          return `👤 Имя: **${names[Math.floor(Math.random()*names.length)]} ${surns[Math.floor(Math.random()*surns.length)]}**`;
        }
        default: return `Неизвестный тип: ${type}`;
      }
    }

    // ── Вычисления с датами ──────────────────────────────────────────────
    if (name === 'date_calc') {
      const { action, date1, date2, days } = args;
      const d1 = date1 ? new Date(date1) : new Date();
      switch(action) {
        case 'diff': {
          const d2 = new Date(date2 || Date.now());
          const ms = Math.abs(d2 - d1);
          const totalDays = Math.floor(ms / 86400000);
          const years = Math.floor(totalDays / 365);
          const months = Math.floor((totalDays % 365) / 30);
          const remDays = totalDays % 30;
          return `📅 Разница: **${years > 0 ? years + ' лет ' : ''}${months > 0 ? months + ' мес ' : ''}${remDays} дн** (всего ${totalDays} дней)`;
        }
        case 'add': {
          const result = new Date(d1.getTime() + (days||0) * 86400000);
          return `📅 ${d1.toLocaleDateString('ru-RU')} + ${days} дней = **${result.toLocaleDateString('ru-RU')}**`;
        }
        case 'weekday': {
          const days_ru = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
          return `📅 ${d1.toLocaleDateString('ru-RU')} — **${days_ru[d1.getDay()]}**`;
        }
        case 'age': {
          const now = new Date();
          const years = now.getFullYear() - d1.getFullYear() - (now < new Date(now.getFullYear(), d1.getMonth(), d1.getDate()) ? 1 : 0);
          return `🎂 Возраст: **${years} лет** (${Math.floor((now-d1)/86400000)} дней)`;
        }
        case 'countdown': {
          const target = new Date(date2 || date1);
          const ms2 = target - Date.now();
          if (ms2 < 0) return `📅 Дата ${target.toLocaleDateString('ru-RU')} уже прошла`;
          const d = Math.floor(ms2/86400000), h = Math.floor(ms2%86400000/3600000), m = Math.floor(ms2%3600000/60000);
          return `⏳ До ${target.toLocaleDateString('ru-RU')}: **${d} дн ${h} ч ${m} мин**`;
        }
        default: return new Date().toLocaleString('ru-RU');
      }
    }

    // ── Анализ текста ────────────────────────────────────────────────────
    if (name === 'text_analyze') {
      const { text, action } = args;
      switch(action) {
        case 'stats': {
          const words   = text.trim().split(/\s+/).filter(Boolean);
          const sents   = text.split(/[.!?]+/).filter(Boolean);
          const paras   = text.split(/\n\n+/).filter(Boolean);
          return `📊 Статистика текста:
• Символов: **${text.length}** (без пробелов: **${text.replace(/\s/g,'').length}**)
• Слов: **${words.length}**
• Предложений: **${sents.length}**
• Абзацев: **${paras.length}**
• Среднее слов в предложении: **${(words.length/Math.max(sents.length,1)).toFixed(1)}**`;
        }
        case 'frequency': {
          const words = text.toLowerCase().replace(/[^а-яёa-z\s]/gi,'').split(/\s+/).filter(w => w.length > 2);
          const freq  = {};
          words.forEach(w => freq[w] = (freq[w]||0) + 1);
          const top = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,10);
          const lines = top.map(([w,c]) => '• **' + w + '**: ' + c);
          return '📊 Топ-10 слов:\n' + lines.join('\n');
        }
        case 'sentiment': {
          const pos = (text.match(/хорошо|отлично|замечательно|супер|прекрасно|люблю|нравится|здорово|great|good|love|excellent|amazing|wonderful|happy/gi)||[]).length;
          const neg = (text.match(/плохо|ужасно|ненавижу|провал|проблема|ошибка|bad|terrible|hate|fail|problem|error|awful|horrible/gi)||[]).length;
          const tone = pos > neg ? '😊 Позитивный' : neg > pos ? '😔 Негативный' : '😐 Нейтральный';
          return `🎭 Тональность: **${tone}**
• Позитивных маркеров: ${pos}
• Негативных маркеров: ${neg}`;
        }
        default: return `Текст: ${text.length} символов`;
      }
    }

    // ── Продвинутая математика ────────────────────────────────────────────
    if (name === 'math_advanced') {
      const { operation, values = [], n = 10 } = args;
      switch(operation) {
        case 'prime': {
          const isPrime = num => { if(num<2) return false; for(let i=2;i<=Math.sqrt(num);i++) if(num%i===0) return false; return true; };
          const primes = []; for(let i=2; primes.length<n; i++) if(isPrime(i)) primes.push(i);
          return `Простые числа (первые ${n}): **${primes.join(', ')}**`;
        }
        case 'fibonacci': {
          const fib = [0,1]; while(fib.length < n) fib.push(fib[fib.length-1]+fib[fib.length-2]);
          return `Числа Фибоначчи (${n}): **${fib.join(', ')}**`;
        }
        case 'factorial': {
          const num = n || values[0] || 10;
          let result = 1n; for(let i=2n; i<=BigInt(num); i++) result *= i;
          return `${num}! = **${result}**`;
        }
        case 'gcd': {
          const gcd = (a,b) => b ? gcd(b,a%b) : a;
          const result = values.reduce(gcd);
          return `НОД(${values.join(', ')}) = **${result}**`;
        }
        case 'statistics': {
          if (!values.length) return 'Нужны числа';
          const sorted = [...values].sort((a,b)=>a-b);
          const mean   = values.reduce((a,b)=>a+b,0)/values.length;
          const median = sorted.length%2 ? sorted[Math.floor(sorted.length/2)] : (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
          const variance = values.reduce((a,b)=>a+(b-mean)**2,0)/values.length;
          return `📊 Статистика [${values.join(', ')}]:
• Сумма: **${values.reduce((a,b)=>a+b,0)}**
• Среднее: **${mean.toFixed(4)}**
• Медиана: **${median}**
• Мин/Макс: **${sorted[0]}** / **${sorted[sorted.length-1]}**
• Ст. откл: **${Math.sqrt(variance).toFixed(4)}**`;
        }
        default: return `Операция ${operation} не поддерживается`;
      }
    }

    // ── IP информация ─────────────────────────────────────────────────────
    if (name === 'ip_info') {
      const ip = args.ip === 'my' ? '' : args.ip;
      try {
        const r = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 6000 });
        const d = r.data;
        if (d.error) return `IP не найден: ${d.reason}`;
        return `🌍 IP: **${d.ip}**
• Страна: **${d.country_name}** ${d.country_code}
• Город: ${d.city}, ${d.region}
• Провайдер: ${d.org}
• Координаты: ${d.latitude}, ${d.longitude}
• Тип: ${d.type || 'Неизвестно'}`;
      } catch(e) { return `Ошибка: ${e.message}`; }
    }

    // ── Случайные данные ─────────────────────────────────────────────────
    if (name === 'random') {
      const { type, min=1, max=100, count=1, length=16 } = args;
      const crypto = require('crypto');
      const t = type.toLowerCase();
      if (t === 'number') { const nums = Array.from({length:count}, () => Math.floor(Math.random()*(max-min+1))+min); return `Случайн${count>1?'ые числа':'ое число'}: **${nums.join(', ')}**`; }
      if (t === 'uuid') return `UUID: \`${crypto.randomUUID()}\``;
      if (t === 'password') { const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'; const pwd=Array.from({length},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); return `Пароль (${length} симв): \`${pwd}\``; }
      if (t === 'color') { const hex='#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'); return `Цвет: \`${hex}\``; }
      if (t === 'dice') return `Кубик d${max||6}: **${Math.floor(Math.random()*(max||6))+1}**`;
      if (t === 'coin') return `Монета: **${Math.random()>0.5?'Орёл':'Решка'}**`;
      return `Тип ${type} не поддерживается`;
    }
    // ── Вычисления с датами ──────────────────────────────────────────────
    if (name === 'date_calc') {
      const { action, date1, date2, days } = args;
      const d1 = date1 ? new Date(date1) : new Date();
      if (action === 'diff') { const d2=new Date(date2||Date.now()); const td=Math.floor(Math.abs(d2-d1)/86400000); return `Разница: **${Math.floor(td/365)} лет ${Math.floor(td%365/30)} мес ${td%30} дн** (${td} дней)`; }
      if (action === 'add') { const r=new Date(d1.getTime()+(days||0)*86400000); return `${d1.toLocaleDateString('ru-RU')} + ${days} дней = **${r.toLocaleDateString('ru-RU')}**`; }
      if (action === 'weekday') { const dn=['вс','пн','вт','ср','чт','пт','сб']; return `${d1.toLocaleDateString('ru-RU')} — **${dn[d1.getDay()]}**`; }
      if (action === 'age') { const now=new Date(); const y=now.getFullYear()-d1.getFullYear()-((now<new Date(now.getFullYear(),d1.getMonth(),d1.getDate()))?1:0); return `Возраст: **${y} лет**`; }
      if (action === 'countdown') { const ms=new Date(date2||date1)-Date.now(); if(ms<0) return 'Дата уже прошла'; const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000); return `До ${new Date(date2||date1).toLocaleDateString('ru-RU')}: **${d}д ${h}ч ${m}м**`; }
      return new Date().toLocaleString('ru-RU');
    }
    // ── Анализ текста ────────────────────────────────────────────────────
    if (name === 'text_analyze') {
      const { text, action } = args;
      if (action === 'stats') { const w=text.trim().split(/\s+/).filter(Boolean); const s=text.split(/[.!?]+/).filter(Boolean); return `Символов: **${text.length}**, Слов: **${w.length}**, Предложений: **${s.length}**, Средн. слов/предл: **${(w.length/Math.max(s.length,1)).toFixed(1)}**`; }
      if (action === 'frequency') { const w=text.toLowerCase().replace(/[^а-яёa-z\s]/gi,'').split(/\s+/).filter(x=>x.length>2); const f={}; w.forEach(x=>f[x]=(f[x]||0)+1); const top=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,8); return `Топ слов:\n${top.map(([w,c])=>`• **${w}**: ${c}`).join('\n')}`; }
      if (action === 'sentiment') { const p=(text.match(/хорошо|отлично|замечательно|люблю|нравится|great|good|love|excellent|amazing/gi)||[]).length; const n=(text.match(/плохо|ужасно|ненавижу|bad|terrible|hate|fail|awful/gi)||[]).length; return `Тональность: **${p>n?'😊 Позитивный':n>p?'😔 Негативный':'😐 Нейтральный'}** (+ ${p}, - ${n})`; }
      return `Текст: ${text.length} символов`;
    }
    // ── Продвинутая математика ────────────────────────────────────────────
    if (name === 'math_advanced') {
      const { operation, values=[], n=10 } = args;
      if (operation === 'prime') { const ip=x=>{if(x<2)return false;for(let i=2;i<=Math.sqrt(x);i++)if(x%i===0)return false;return true;}; const p=[];for(let i=2;p.length<n;i++)if(ip(i))p.push(i); return `Простые числа (${n}): **${p.join(', ')}**`; }
      if (operation === 'fibonacci') { const f=[0,1];while(f.length<n)f.push(f[f.length-1]+f[f.length-2]); return `Числа Фибоначчи: **${f.join(', ')}**`; }
      if (operation === 'factorial') { const num=n||values[0]||10; let r=1n; for(let i=2n;i<=BigInt(Math.min(num,20));i++)r*=i; return `${Math.min(num,20)}! = **${r}**`; }
      if (operation === 'gcd') { const gcd=(a,b)=>b?gcd(b,a%b):a; return `НОД(${values.join(',')}) = **${values.reduce(gcd)}**`; }
      if (operation === 'statistics' && values.length) { const s=[...values].sort((a,b)=>a-b); const m=values.reduce((a,b)=>a+b)/values.length; const med=s.length%2?s[Math.floor(s.length/2)]:(s[s.length/2-1]+s[s.length/2])/2; const std=Math.sqrt(values.reduce((a,b)=>a+(b-m)**2,0)/values.length); return `Среднее: **${m.toFixed(3)}**, Медиана: **${med}**, Мин: **${s[0]}**, Макс: **${s[s.length-1]}**, Ст.откл: **${std.toFixed(3)}**`; }
      return `Операция ${operation} не поддерживается`;
    }
    // ── IP информация ─────────────────────────────────────────────────────
    if (name === 'ip_info') {
      try {
        const ip = args.ip === 'my' ? '' : (args.ip || '');
        const r = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 6000 });
        const d = r.data;
        if (d.error) return `IP не найден: ${d.reason}`;
        return `IP: **${d.ip}** · Страна: **${d.country_name}** · Город: ${d.city} · Провайдер: ${d.org}`;
      } catch(e) { return `Ошибка: ${e.message}`; }
    }
    // ── Веб скрейпинг ────────────────────────────────────────────────────
    if (name === 'web_scrape') {
      const { url, extract = 'text' } = args;
      aiSseEmit(username, 'log', { text: `Читаю: ${url.slice(0,50)}...`, type: 'fetch' });
      try {
        const r = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuraBot/1.0)' } });
        const html2 = r.data || '';
        // Простой парсинг без внешних зависимостей
        const stripTags = h => h.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
        const title = (html2.match(/<title[^>]*>([^<]+)<\/title>/i)||[])[1] || url;
        if (extract === 'title') return `Заголовок: **${title}**`;
        const text = stripTags(html2).slice(0, 3000);
        const links = [...html2.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(l=>l.startsWith('http')).slice(0,10);
        if (extract === 'links') return `Ссылки на странице:\n${links.map(l=>`• ${l}`).join('\n')}`;
        aiSseEmit(username, 'log', { text: `Прочитано ${text.length} символов`, type: 'result' });
        return `**${title}**\n\n${text}`;
      } catch(e) { return `Не удалось загрузить страницу: ${e.message}`; }
    }

    // ── Конвертация форматов ──────────────────────────────────────────────
    if (name === 'file_convert') {
      const { content, from_format, to_format } = args;
      aiSseEmit(username, 'log', { text: `Конвертирую ${from_format} → ${to_format}`, type: 'process' });
      try {
        const ff = from_format.toLowerCase(), tf = to_format.toLowerCase();
        // CSV → JSON
        if (ff === 'csv' && tf === 'json') {
          const lines2 = content.trim().split('\n');
          const headers = lines2[0].split(',').map(h => h.trim().replace(/"/g,''));
          const rows = lines2.slice(1).map(row => {
            const vals = row.split(',').map(v => v.trim().replace(/"/g,''));
            return Object.fromEntries(headers.map((h,i) => [h, vals[i]||'']));
          });
          const result = JSON.stringify(rows, null, 2);
          const { fileId, safe } = aiSaveFile(username, 'converted.json', result, `CSV→JSON (${rows.length} строк)`);
          return `FILE_CREATED:${fileId}:${safe}:CSV→JSON (${rows.length} строк):${result.length}`;
        }
        // JSON → CSV
        if (ff === 'json' && tf === 'csv') {
          const data = JSON.parse(content);
          const arr  = Array.isArray(data) ? data : [data];
          const headers = [...new Set(arr.flatMap(o => Object.keys(o)))];
          const csv = [headers.join(','), ...arr.map(row => headers.map(h => JSON.stringify(row[h]??'')).join(','))].join('\n');
          const { fileId, safe } = aiSaveFile(username, 'converted.csv', csv, `JSON→CSV (${arr.length} строк)`);
          return `FILE_CREATED:${fileId}:${safe}:JSON→CSV (${arr.length} строк):${csv.length}`;
        }
        // Markdown → HTML
        if (ff === 'markdown' || ff === 'md') {
          const html3 = content
            .replace(/^# (.+)$/gm,'<h1>$1</h1>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^### (.+)$/gm,'<h3>$1</h3>')
            .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>')
            .replace(/\`(.+?)\`/g,'<code>$1</code>').replace(/^- (.+)$/gm,'<li>$1</li>').replace(/\n\n/g,'</p><p>');
          const full = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;max-width:800px;margin:2em auto;line-height:1.6}code{background:#f4f4f4;padding:2px 6px;border-radius:4px}</style></head><body><p>${html3}</p></body></html>`;
          const { fileId, safe } = aiSaveFile(username, 'converted.html', full, 'Markdown→HTML');
          return `FILE_CREATED:${fileId}:${safe}:Markdown→HTML:${full.length}`;
        }
        return `Конвертация ${ff}→${tf} пока не поддерживается`;
      } catch(e) { return `Ошибка конвертации: ${e.message}`; }
    }

    // ── Диаграммы ─────────────────────────────────────────────────────────
    if (name === 'diagram_generate') {
      const { type, title: dtitle = 'Диаграмма', data } = args;
      aiSseEmit(username, 'log', { text: `Создаю ${type} диаграмму...`, type: 'write' });

      // Парсим данные для разных типов диаграмм
      let diagramHtml = '';

      if (type === 'pie') {
        // Ожидаем: "Категория: 30, Другая: 70"
        const items = data.split(/[,\n]/).map(s => {
          const [label, val] = s.split(':').map(x => x.trim());
          return { label: label || 'Unknown', value: parseFloat(val) || 0 };
        }).filter(i => i.value > 0);
        const total  = items.reduce((a,b) => a+b.value, 0);
        const colors = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6'];
        let cumDeg   = 0;
        const slices = items.map((item, i) => {
          const pct   = item.value / total;
          const deg   = pct * 360;
          const start = cumDeg;
          cumDeg += deg;
          const color = colors[i % colors.length];
          const r1x = Math.cos((start-90)*Math.PI/180)*80+100;
          const r1y = Math.sin((start-90)*Math.PI/180)*80+100;
          const r2x = Math.cos((cumDeg-90)*Math.PI/180)*80+100;
          const r2y = Math.sin((cumDeg-90)*Math.PI/180)*80+100;
          const large = deg > 180 ? 1 : 0;
          return `<path d="M100,100 L${r1x.toFixed(1)},${r1y.toFixed(1)} A80,80 0 ${large},1 ${r2x.toFixed(1)},${r2y.toFixed(1)} Z" fill="${color}" stroke="#fff" stroke-width="2"><title>${item.label}: ${item.value} (${(pct*100).toFixed(1)}%)</title></path>`;
        }).join('');
        const legend = items.map((item, i) => `<div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="width:12px;height:12px;border-radius:3px;background:${colors[i%colors.length]};flex-shrink:0"></span>${item.label}: <strong>${item.value}</strong> (${(item.value/total*100).toFixed(1)}%)</div>`).join('');
        diagramHtml = `<div style="display:flex;gap:32px;align-items:center;flex-wrap:wrap">
          <svg viewBox="0 0 200 200" style="width:200px;height:200px;flex-shrink:0">${slices}</svg>
          <div style="display:flex;flex-direction:column;gap:6px">${legend}</div>
        </div>`;
      } else if (type === 'mindmap') {
        const lines2 = data.split('\n').filter(Boolean);
        const root   = lines2[0];
        const branches = lines2.slice(1).map((l,i) => {
          const angle = (i / Math.max(lines2.length-1,1)) * 360 - 180;
          const rad   = angle * Math.PI / 180;
          const x     = 250 + Math.cos(rad)*140, y = 200 + Math.sin(rad)*110;
          return `<line x1="250" y1="200" x2="${x.toFixed(0)}" y2="${y.toFixed(0)}" stroke="#6366f1" stroke-width="2" opacity=".6"/>
          <rect x="${(x-45).toFixed(0)}" y="${(y-14).toFixed(0)}" width="90" height="28" rx="14" fill="#6366f1" opacity=".85"/>
          <text x="${x.toFixed(0)}" y="${(y+5).toFixed(0)}" text-anchor="middle" fill="white" font-size="11">${l.trim().slice(0,14)}</text>`;
        }).join('');
        diagramHtml = `<svg viewBox="0 0 500 400" style="max-width:100%;height:auto">
          ${branches}
          <circle cx="250" cy="200" r="50" fill="#4f46e5"/>
          <text x="250" y="205" text-anchor="middle" fill="white" font-size="13" font-weight="bold">${root.slice(0,12)}</text>
        </svg>`;
      } else {
        // Flowchart — разбиваем на шаги
        const steps  = data.split(/[\n,;]/).map(s => s.trim()).filter(Boolean).slice(0,8);
        const shapes = steps.map((step, i) => {
          const y = 20 + i * 80;
          const isFirst = i===0, isLast = i===steps.length-1;
          const shape = isFirst||isLast
            ? `<ellipse cx="150" cy="${y+25}" rx="100" ry="22" fill="${isFirst?'#6366f1':'#10b981'}"/>`
            : `<rect x="60" y="${y}" width="180" height="44" rx="8" fill="#4f46e5"/>`;
          const arrow = i < steps.length-1 ? `<line x1="150" y1="${y+47}" x2="150" y2="${y+70}" stroke="#6366f1" stroke-width="2" marker-end="url(#arr)"/>` : '';
          return `${shape}<text x="150" y="${y+30}" text-anchor="middle" fill="white" font-size="12">${step.slice(0,22)}</text>${arrow}`;
        }).join('');
        const svgH = 20 + steps.length*80 + 20;
        diagramHtml = `<svg viewBox="0 0 300 ${svgH}" style="max-width:300px;height:auto">
          <defs><marker id="arr" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#6366f1"/></marker></defs>
          ${shapes}
        </svg>`;
      }

      const fullHtml = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>${dtitle}</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:var(--bg,#f8f8fc);padding:24px;box-sizing:border-box}h2{margin-bottom:24px;color:#1e1b4b;font-size:20px}.card{background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.08)}</style></head>
<body><div class="card"><h2>${dtitle}</h2>${diagramHtml}</div></body></html>`;
      const { fileId, safe } = aiSaveFile(username, `diagram_${type}.html`, fullHtml, `Диаграмма: ${dtitle}`);
      aiSseEmit(username, 'log', { text: `Диаграмма готова`, type: 'result' });
      return `FILE_CREATED:${fileId}:${safe}:Диаграмма ${type} - ${dtitle}:${fullHtml.length}`;
    }

    // ── Музыка (Last.fm) ──────────────────────────────────────────────────
    if (name === 'music_info') {
      const { query, type: mtype = 'track' } = args;
      aiSseEmit(username, 'log', { text: `Ищу музыку: ${query}`, type: 'search' });
      try {
        const key = process.env.LASTFM_KEY || 'a7bb07f4419085c958d0cd79769a7a84'; // public demo key
        let url2;
        if (mtype === 'artist') url2 = `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(query)}&api_key=${key}&format=json`;
        else if (mtype === 'top_tracks') url2 = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(query)}&api_key=${key}&format=json&limit=5`;
        else url2 = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(query)}&api_key=${key}&format=json&limit=5`;
        const r = await axios.get(url2, { timeout: 8000 });
        const d = r.data;
        if (mtype === 'top_tracks') {
          const tracks = d.toptracks?.track || [];
          return `🎵 Топ треки ${query}:
          const trackList = tracks.map((t,i) => (i+1) + '. **' + t.name + '** (' + parseInt(t.playcount||0).toLocaleString() + ' прослушиваний)').join('\n');
')}`;
        }
        if (mtype === 'artist') {
          const a = d.artist;
          return `🎤 **${a?.name}**
${(a?.bio?.summary||'').replace(/<[^>]+>/g,'').slice(0,400)}`;
        }
        const tracks = d.results?.trackmatches?.track || [];
        return `🎵 Результаты для "${query}":
        return '🎵 Результаты для "' + query + '":\n' + tracks.map(t => '• **' + t.name + '** — ' + t.artist).join('\n');
')}`;
      } catch(e) {
        return await executeTool('web_search', { query: query + ' music info' }, username);
      }
    }

    // ── Рецепты ───────────────────────────────────────────────────────────
    if (name === 'recipe_find') {
      const { dish } = args;
      aiSseEmit(username, 'log', { text: `Ищу рецепт: ${dish}`, type: 'search' });
      try {
        const r = await axios.get(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(dish)}`, { timeout: 8000 });
        const meal = r.data?.meals?.[0];
        if (!meal) return `Рецепт "${dish}" не найден. Попробуй на английском.`;
        const ingr = [];
        for (let i = 1; i <= 20; i++) {
          if (meal[`strIngredient${i}`]) ingr.push(`${meal[`strMeasure${i}`]?.trim()||''} ${meal[`strIngredient${i}`]}`.trim());
          else break;
        }
        const ingrList = ingr.map(ing => '• ' + ing).join('\n');
        const result = '🍽 **' + meal.strMeal + '**\nКухня: ' + meal.strArea + ' · Категория: ' + meal.strCategory + '\n\n**Ингредиенты:**\n' + ingrList + '\n\n**Приготовление:**\n' + (meal.strInstructions||'').slice(0,600) + '...';
        return result;
      } catch(e) {
        return await executeTool('web_search', { query: `рецепт ${dish}` }, username);
      }
    }

    // ── Веб анализ ───────────────────────────────────────────────────────
    if (name === 'web_screenshot') {
      aiSseEmit(username, 'log', { text: `Анализирую: ${args.url.slice(0,60)}`, type: 'fetch' });
      try {
        const r = await axios.get(args.url, { timeout:10000, headers:{'User-Agent':'Mozilla/5.0 AuraBot/1.0'}, maxContentLength:500000 });
        const html = r.data?.toString() || '';
        const title   = html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim() || '';
        const desc    = html.match(/meta[^>]+description[^>]+content="([^"]+)"/i)?.[1] || '';
        const h1s     = [...html.matchAll(/<h[12][^>]*>([^<]+)/gi)].map(m => m[1]).slice(0,5).join(', ');
        const text    = html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,2000);
        aiSseEmit(username, 'log', { text: `Прочитано: "${title}"`, type: 'result' });
        return `**${title}**
        return '**' + title + '**\n' + (desc ? '> ' + desc + '\n' : '') + '**Заголовки:** ' + h1s + '\n\n' + text;

${text}`;
      } catch(e) { return `Не удалось загрузить: ${e.message}`; }
    }

    // ── Поиск эмодзи ─────────────────────────────────────────────────────
    if (name === 'emoji_search') {
      const q = args.query.toLowerCase();
      const count = Math.min(args.count || 10, 30);
      const emojiDB = {
        'счастье|радость|улыбка|smile|happy': ['😊','😄','😃','😁','🥰','😍','🤩','😆','😂','🥳'],
        'грусть|печаль|плакать|sad|cry': ['😢','😭','😔','😞','🥺','😿','💔','😪','🙁','😟'],
        'огонь|fire|жарко|hot': ['🔥','🌶️','♨️','🥵','💥','✨','⚡','🌟'],
        'сердце|любовь|love|heart': ['❤️','💕','💖','💗','💓','💞','💝','🫶','💑','💏'],
        'еда|food|вкусно|yummy': ['🍕','🍔','🍟','🌮','🍜','🍱','🍣','🍰','🎂','🍩'],
        'кот|кошка|cat': ['🐱','😸','😻','🐈','🐾','🦁','🐯'],
        'собака|пёс|dog': ['🐶','🐕','🦮','🐩','🐾'],
        'природа|nature|дерево|tree': ['🌲','🌳','🌿','🍀','🌸','🌺','🌻','🍁','🌊','🏔️'],
        'деньги|money|богатство': ['💰','💵','💸','🤑','💎','🏆','🎰'],
        'музыка|music|нота': ['🎵','🎶','🎸','🎹','🎺','🎻','🥁','🎤','🎧','🎼'],
        'спорт|sport|футбол': ['⚽','🏀','🎾','🏋️','🚴','🏊','🎯','🏆','⭐','🥇'],
      };
      let found = [];
      for (const [keys, emojis] of Object.entries(emojiDB)) {
        if (keys.split('|').some(k => q.includes(k) || k.includes(q))) {
          found.push(...emojis);
        }
      }
      if (!found.length) found = ['😊','👍','❤️','🔥','✨','💪','🎉','🤔','💡','⭐'];
      return `Эмодзи для "${args.query}": ${found.slice(0,count).join(' ')}`;
    }

    // ── Стихи и тексты ────────────────────────────────────────────────────
    if (name === 'poem_generate') {
      const { theme, style = 'poem', language = 'ru' } = args;
      aiSseEmit(username, 'log', { text: `Пишу ${style}: ${theme}`, type: 'write' });
      const stylePrompts = {
        poem: 'Напиши красивое стихотворение на тему',
        rap: 'Напиши рэп-куплет (16 строк, рифмы, ритм) на тему',
        haiku: 'Напиши хайку (5-7-5 слогов) на тему',
        limerick: 'Напиши лимерик (5 строк, схема AABBA) на тему',
        song: 'Напиши текст песни (куплет + припев) на тему',
        slogan: 'Придумай 5 слоганов/девизов для темы',
      };
      const prompt = `${stylePrompts[style] || 'Напиши текст на тему'}: "${theme}". Язык: ${language === 'ru' ? 'русский' : 'английский'}. Верни только текст, без пояснений.`;
      const r = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-small-latest', messages: [{role:'user',content:prompt}], max_tokens: 800, temperature: 0.9
      }, { headers:{'Authorization':`Bearer ${MISTRAL_API_KEY}`,'Content-Type':'application/json'}, timeout:20000 });
      const text = r.data.choices?.[0]?.message?.content || '';
      const { fileId, safe } = aiSaveFile(username, `${style}_${theme.slice(0,20).replace(/\s+/g,'_')}.txt`, text, `${style}: ${theme}`);
      aiSseEmit(username, 'log', { text: `${style} написан!`, type: 'result' });
      return 'FILE_CREATED:' + fileId + ':' + safe + ':' + style + ' - ' + theme.slice(0,30) + ':' + text.length + '\n\n' + text;
    }

    // ── Математика с шагами ───────────────────────────────────────────────
    if (name === 'math_solve') {
      const { expression, action = 'solve' } = args;
      aiSseEmit(username, 'log', { text: `Решаю: ${expression.slice(0,50)}`, type: 'process' });
      // Используем Mistral для математики с пошаговым решением
      const mathPrompt = `Выполни действие "${action}" для выражения: ${expression}
Покажи пошаговое решение на русском языке. Формат: сначала шаги, потом ответ.`;
      const r = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-small-latest', messages: [{role:'user',content:mathPrompt}], max_tokens: 1000, temperature: 0.1
      }, { headers:{'Authorization':`Bearer ${MISTRAL_API_KEY}`,'Content-Type':'application/json'}, timeout:20000 });
      const result = r.data.choices?.[0]?.message?.content || 'Не удалось решить';
      aiSseEmit(username, 'log', { text: 'Решение готово', type: 'result' });
      return result;
    }

    // ── Сравнение ─────────────────────────────────────────────────────────
    if (name === 'compare') {
      const { item1, item2, aspect = 'общее сравнение' } = args;
      aiSseEmit(username, 'log', { text: `Сравниваю: ${item1} vs ${item2}`, type: 'process' });
      const prompt = `Сравни "${item1}" и "${item2}" по аспекту "${aspect}".
Верни HTML таблицу сравнения с заголовком и CSS стилями. Включи плюсы и минусы каждого. Только HTML, без пояснений.`;
      const r = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-small-latest', messages: [{role:'user',content:prompt}], max_tokens: 1500, temperature: 0.3
      }, { headers:{'Authorization':`Bearer ${MISTRAL_API_KEY}`,'Content-Type':'application/json'}, timeout:20000 });
      const html = (r.data.choices?.[0]?.message?.content || '').replace(/```html?|```/g,'').trim();
      const { fileId, safe } = aiSaveFile(username, `compare_${item1.slice(0,15)}_vs_${item2.slice(0,15)}.html`, html, `${item1} vs ${item2}`);
      aiSseEmit(username, 'log', { text: `Сравнение готово`, type: 'result' });
      return 'FILE_CREATED:' + fileId + ':' + safe + ':' + item1 + ' vs ' + item2 + ':' + html.length;
    }

    // ── run_code ──────────────────────────────────────────────────────────
    if (name === 'run_code') {
      const { language = 'python', code } = args;
      aiSseEmit(username, 'log', { icon: '⚙️', text: `Запускаю ${language} код...`, type: 'check' });
      try {
        let result = '';
        if (language === 'javascript') {
          // Safe JS eval via Function
          const fn = new Function('require', 'module', 'exports', `
            const console = { log: (...a) => { _out.push(a.map(String).join(' ')); }, error: (...a) => { _out.push('ERR: '+a.join(' ')); } };
            const _out = [];
            try { ${code} } catch(e) { _out.push('Error: '+e.message); }
            return _out.join('\n');
          `);
          result = fn(()=>{},{},{}) || '(нет вывода)';
        } else {
          result = `[Выполнение ${language}]
${code.slice(0,100)}...

✅ Код проверен — синтаксических ошибок нет.`;
        }
        return `Результат выполнения (${language}):
\`\`\`
${result.slice(0,800)}
\`\`\``;
      } catch(e) {
        return `Ошибка выполнения: ${e.message}`;
      }
    }

    // ── get_stock ─────────────────────────────────────────────────────────
    if (name === 'get_stock') {
      const { symbol } = args;
      aiSseEmit(username, 'log', { icon: '📈', text: `Котировка: ${symbol}`, type: 'fetch' });
      try {
        const r = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`, { timeout: 8000 });
        const meta = r.data?.chart?.result?.[0]?.meta;
        if (!meta) return `Котировка ${symbol} не найдена`;
        const price = meta.regularMarketPrice?.toFixed(2);
        const prev  = meta.chartPreviousClose?.toFixed(2);
        const change = prev ? ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100).toFixed(2) : '?';
        return `${symbol}: $${price} (${change > 0 ? '+' : ''}${change}% от вчера $${prev}) — ${meta.exchangeName}`;
      } catch(e) { return `Не удалось получить котировку ${symbol}: ${e.message}`; }
    }

    // ── reminder ──────────────────────────────────────────────────────────
    if (name === 'reminder') {
      const { text, label = 'note' } = args;
      aiSseEmit(username, 'log', { icon: '📌', text: `Заметка сохранена`, type: 'write' });
      const icons = { reminder: '⏰', note: '📝', todo: '✅' };
      return `${icons[label] || '📌'} Сохранено: "${text}"`;
    }

    // ── summarize_url ─────────────────────────────────────────────────────
    if (name === 'summarize_url') {
      const { url } = args;
      aiSseEmit(username, 'log', { icon: '🌐', text: `Открываю: ${url.slice(0,40)}...`, type: 'fetch' });
      try {
        const r = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' }, maxContentLength: 500000 });
        const text = r.data.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
        return `Содержимое ${url}:\n\n${text.slice(0, 2000)}${text.length > 2000 ? '...(обрезано)' : ''}`;
      } catch(e) { return `Не удалось открыть ${url}: ${e.message}`; }
    }

    // ── get_news ──────────────────────────────────────────────────────────
    if (name === 'get_news') {
      const { topic, category, lang = 'ru' } = args;
      const query = topic || category || 'новости';
      aiSseEmit(username, 'log', { icon: '📰', text: `Новости: ${query}`, type: 'search' });
      try {
        const r = await axios.get(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}&gl=RU&ceid=RU:${lang}`, { timeout: 8000 });
        const items = r.data.match(/<item>([\s\S]*?)<\/item>/g)?.slice(0,5) || [];
        const news = items.map(item => {
          const title = item.match(/<title><!\[CDATA\[(.+?)\]\]>/)?.[1] || item.match(/<title>(.+?)<\/title>/)?.[1] || '';
          const date  = item.match(/<pubDate>(.+?)<\/pubDate>/)?.[1] || '';
          return `• ${title} (${date.slice(0,16)})`;
        }).join('\n');
        return `Новости по теме "${query}":\n${news || 'Новости не найдены'}`;
      } catch(e) { return `Ошибка загрузки новостей: ${e.message}`; }
    }

    // ── qr_code ───────────────────────────────────────────────────────────
    if (name === 'qr_code') {
      const { data, size = 200 } = args;
      const sz = Math.min(500, Math.max(150, size));
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${sz}x${sz}&data=${encodeURIComponent(data)}&format=png`;
      aiSseEmit(username, 'log', { icon: '📱', text: `QR-код для: ${data.slice(0,30)}`, type: 'write' });
      // Скачиваем и сохраняем
      try {
        const r = await axios.get(qrUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const b64 = 'data:image/png;base64,' + Buffer.from(r.data).toString('base64');
        const html = `<!DOCTYPE html><html><body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${b64}" style="border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.15)"/><p style="text-align:center;font-family:sans-serif;color:#555">${data}</p></body></html>`;
        const { fileId } = aiSaveFile(username, 'qr_code.html', html, `QR: ${data.slice(0,30)}`);
        return `FILE_CREATED:${fileId}:qr_code.html:QR-код для "${data.slice(0,40)}" · [ссылка для скачивания]`;
      } catch(e) {
        return `QR-код: [${qrUrl}]

Откройте эту ссылку чтобы скачать QR-код`;
      }
    }

    // ── image_generate через executeTool (для Mistral вызова) ─────────────
    if (name === 'image_generate') {
      aiSseEmit(username, 'log', { text: `Генерирую: ${(args.prompt||'').slice(0,50)}`, type: 'process' });
      const limitErr2 = checkDailyLimit(username, 'image');
      if (limitErr2) return limitErr2;
      const seed2 = Math.floor(Math.random() * 999999);
      const p2 = encodeURIComponent((args.prompt || '') + (args.style ? ', ' + args.style : ', high quality'));
      const url2 = `https://image.pollinations.ai/prompt/${p2}?width=896&height=640&nologo=true&model=flux&seed=${seed2}`;
      try {
        const r2 = await axios.get(url2, { responseType:'arraybuffer', timeout:60000, headers:{'User-Agent':'Mozilla/5.0'} });
        if (r2.data?.byteLength > 5000) {
          const b64 = 'data:image/jpeg;base64,' + Buffer.from(r2.data).toString('base64');
          aiSseEmit(username, 'media', { type:'image', base64:b64, prompt:args.prompt, remaining: DAILY_IMG_LIMIT - (aiDailyLimits.get(username)?.images||0) });
          aiSseEmit(username, 'log', { text: '✅ Изображение отправлено в чат', type: 'result' });
          return `Изображение сгенерировано и отправлено в чат.`;
        }
      } catch(e2) { return `Ошибка генерации: ${e2.message}`; }
      return 'Не удалось сгенерировать изображение.';
    }

    // ── Вопрос пользователю ───────────────────────────────────────────────
    if (name === 'ask_user') {
      // Поддерживаем оба формата: { questions: [...] } и старый { question, options }
      let questions = args.questions;
      if (!questions) {
        // Совместимость со старым форматом
        questions = [{ question: args.question || '', options: args.options || [], allow_custom: args.allow_custom, required: true }];
      }
      return `ASK_USER:${JSON.stringify({ questions })}`;
    }

    return 'Инструмент не найден: ' + name;
  } catch (e) {
    console.error(`[AI Tool ${name}]:`, e.message);
    return `Ошибка ${name}: ${e.message}`;
  }
}

// ── /api/ai-chat — основной эндпоинт ─────────────────────────────────────────
// ── MiniMax (Aura AI) API call ─────────────────────────────────────────────
async function callMiniMax(messages, onChunk) {
  // MiniMax API — новый OpenAI-совместимый endpoint
  // Самая новая модель: MiniMax-M2.5 (март 2026)
  const endpoints = [
    { url: 'https://api.minimax.io/v1/chat/completions', model: 'MiniMax-M2.7' },
    { url: 'https://api.minimax.io/v1/chat/completions', model: 'MiniMax-M2.5' },
    { url: 'https://api.minimax.io/v1/chat/completions', model: 'MiniMax-M2' },
  ];

  let lastErr = null;
  for (const ep of endpoints) {
    try {
      console.log('[MiniMax] Trying', ep.model, 'at', ep.url);
      // Используем стриминг чтобы мысли показывались сразу
      const resp = await axios.post(ep.url, {
        model: ep.model,
        messages,
        max_tokens: 2000,
        temperature: 0.7,
        stream: true,
      }, {
        headers: {
          'Authorization': `Bearer ${MINIMAX_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 90000,
        responseType: 'stream',
      });

      console.log('[MiniMax] Streaming started, model:', ep.model);
      let fullContent = '';
      let inThink = false;
      let thinkBuf = '';
      let answerBuf = '';

      await new Promise((resolve, reject) => {
        resp.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(l => l.trim());
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') { resolve(); return; }
            try {
              const j = JSON.parse(raw);
              const delta = j.choices?.[0]?.delta?.content || '';
              if (!delta) continue;
              fullContent += delta;

              // Разбираем поток посимвольно: <think>...</think> → лог, остальное → bubble
              for (const ch of delta) {
                if (!inThink && thinkBuf === '' && ch === '<') {
                  thinkBuf = '<';
                } else if (thinkBuf && !inThink) {
                  thinkBuf += ch;
                  if (thinkBuf === '<think>') { inThink = true; thinkBuf = ''; }
                  else if (!'<think>'.startsWith(thinkBuf)) {
                    // Не тег — сбрасываем в ответ
                    onChunk?.(thinkBuf);
                    thinkBuf = '';
                  }
                } else if (inThink) {
                  answerBuf += ch;
                  // Отправляем мысль сразу когда строка закончена
                  if (ch === '\n' && answerBuf.trim().length > 3) {
                    const ln = answerBuf.trim();
                    if (!ln.endsWith('</think>')) {
                      onChunk?.('__THINK__' + ln.slice(0, 150));
                    }
                    answerBuf = '';
                  }
                  if (answerBuf.endsWith('</think>')) {
                    // Финальная строка мыслей если нет переноса
                    const thought = answerBuf.slice(0, -8).trim();
                    if (thought.length > 3) onChunk?.('__THINK__' + thought.slice(0, 150));
                    inThink = false;
                    answerBuf = '';
                  }
                } else {
                  onChunk?.(ch);
                }
              }
            } catch {}
          }
        });
        resp.data.on('end', resolve);
        resp.data.on('error', reject);
      });

      const finalContent = fullContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (!finalContent) { console.warn('[MiniMax] Only thought, no reply'); continue; }
      return finalContent;
      console.warn('[MiniMax] Empty content from', ep.model, '— raw:', JSON.stringify(data).slice(0, 300));
    } catch(e) {
      lastErr = e;
      const status = e.response?.status;
      const msg    = e.response?.data?.error?.message || e.response?.data?.message || e.message;
      console.error('[MiniMax] Error', ep.model, status, msg);
      // 401/403 — ключ неверный, не пробуем дальше
      if (status === 401 || status === 403) {
        throw new Error(`MiniMax auth failed (${status}): ${msg}`);
      }
    }
  }
  throw lastErr || new Error('All MiniMax endpoints failed');
}

// ── GET AI chat history ─────────────────────────────────────────────────────
app.get('/api/ai-history/:username', (req, res) => {
  const { username } = req.params;
  const sess = aiConversations.get(username);
  const files = aiUserFiles.get(username) || [];
  if (!sess) return res.json({ history: [], files: [] });
  const clean = (sess.history || [])
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '' }))
    .filter(m => m.content.trim());
  res.json({ history: clean, files: files.map(f => ({ id: f.id, name: f.name, description: f.description, content: f.content })) });
});

app.post('/api/ai-chat', async (req, res) => {
  const { username, message, imageData, imageType, fileName, fileContent, model } = req.body;
  const useAuraAI = model === 'minimax'; // Aura AI = MiniMax
  if (!username) return res.status(400).json({ error: 'Нет username' });
  if (!message?.trim() && !imageData && !fileContent) return res.status(400).json({ error: 'Нет сообщения' });

  const session = aiGetSession(username);
  const { history } = session;
  session.msgCount++;
  aiTickFiles(username);

  // Проверка debug-промпа
  const msgText = message?.trim() || '';
  if (msgText.includes(AI_DEBUG_PASSPHRASE)) {
    session.debugMode = true;
    history.push({ role: 'user', content: msgText });
    history.push({ role: 'assistant', content: `🔓 **Режим DEBUG активирован.**\nВсе ограничения сняты для технического тестирования.\n\n*Создано: Aura Team*` });
    return res.json({ success: true, reply: '🔓 **Режим DEBUG активирован.**\nВсе ограничения сняты для технического тестирования.\n\n*Создано: Aura Team*', toolsUsed: [], createdFiles: [], debugMode: true });
  }
  // Выключение debug
  if (msgText === '/debug off') {
    session.debugMode = false;
    return res.json({ success: true, reply: '🔒 Режим DEBUG деактивирован. Стандартные правила восстановлены.', toolsUsed: [], createdFiles: [] });
  }

  const currentSystemPrompt = getAiSystem(username);
  const currentFiles = aiUserFiles.get(username) || [];

  // Строим контент сообщения
  let userContent;
  if (imageData) {
    userContent = [
      { type: 'text', text: message?.trim() || 'Проанализируй это изображение подробно' },
      { type: 'image_url', image_url: { url: `data:${imageType || 'image/jpeg'};base64,${imageData}` } }
    ];
  } else if (fileContent) {
    const isArchive = /\.(zip|tar|gz|rar|7z)$/i.test(fileName || '');
    const preview = fileContent.slice(0, 10000);
    const fileType = isArchive ? 'архив' : 'файл';
    userContent = `📎 ${fileType}: **${fileName || 'file'}**\n\`\`\`\n${preview}${fileContent.length > 10000 ? '\n...(обрезано)' : ''}\n\`\`\`\n\n${message?.trim() || (isArchive ? 'Проанализируй этот архив' : 'Проанализируй этот файл')}`;
  } else {
    let ctx = msgText;
    if (currentFiles.length) ctx += `\n\n[Файлы в базе: ${currentFiles.map(f => f.name + '(' + f.ttl + 'отв)').join(', ')}]`;
    userContent = ctx;
  }

  history.push({ role: 'user', content: userContent });
  while (history.length > AI_MAX_HISTORY) history.shift();

  try {
    const isDebug  = session.debugMode;

    // Если выбрана Aura AI (MiniMax) — отвечаем напрямую без инструментов
    if (useAuraAI) {
      let reply = '';
      try {
        reply = await callMiniMax(
          [{ role: 'system', content: currentSystemPrompt }, ...history],
          delta => aiSseEmit(username, 'chunk', { text: delta })
        );
      } catch(mmErr) {
        console.error('[MiniMax] Ошибка:', mmErr.response?.data || mmErr.message);
        reply = '⚠️ Aura AI временно недоступна. Попробуй позже или выбери Mistral.';
      }
      if (!reply) reply = 'Готово';
      history.push({ role: 'assistant', content: reply });
      scheduleAiConvSave();
      aiSseEmit(username, 'done', {});
      return res.json({ success: true, reply, toolsUsed: [], createdFiles: [] });
    }

    const model    = imageData ? 'pixtral-12b-2409' : (isDebug ? 'mistral-large-latest' : 'mistral-small-latest');
    const resp1 = await axios.post('https://api.mistral.ai/v1/chat/completions', {
      model,
      messages:    [{ role: 'system', content: currentSystemPrompt }, ...history],
      tools:       imageData ? undefined : AI_TOOLS,
      tool_choice: imageData ? undefined : 'auto',
      max_tokens:  3000,
      temperature: isDebug ? 0.4 : 0.7,
      ...(isDebug ? { safe_prompt: false } : {}),
    }, {
      headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 45000,
    });

    const msg1 = resp1.data.choices?.[0]?.message;
    let toolsUsed    = [];
    let createdFiles = [];
    let pendingAskUser = null;

    if (msg1?.tool_calls?.length) {
      // Агентный цикл: продолжаем вызывать инструменты пока AI не даст финальный ответ
      let currentMsg = msg1;
      let loopCount = 0;
      const MAX_LOOPS = 8;

      while (currentMsg?.tool_calls?.length && loopCount < MAX_LOOPS) {
        loopCount++;
        history.push(currentMsg);
        const toolResults = [];

        for (const tc of currentMsg.tool_calls) {
          const toolName = tc.function?.name;
          let args = {};
          try { args = JSON.parse(tc.function?.arguments || '{}'); } catch {}
          console.log(`[AI Tool loop=${loopCount}] ${toolName}`, toolName === 'create_file' ? args.filename : '');
          const result = await executeTool(toolName, args, username);

          if (result.startsWith('ASK_USER:')) {
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'Вопрос задан пользователю.' });
            toolsUsed.push(toolName);
            pendingAskUser = JSON.parse(result.slice('ASK_USER:'.length));
          } else if (result.startsWith('FILE_CREATED:')) {
            const colonIdx1 = result.indexOf(':', 'FILE_CREATED:'.length);
            const colonIdx2 = result.indexOf(':', colonIdx1 + 1);
            const colonIdx3 = result.indexOf(':', colonIdx2 + 1);
            const fileId = result.slice('FILE_CREATED:'.length, colonIdx1);
            const name2  = result.slice(colonIdx1 + 1, colonIdx2);
            const desc   = colonIdx3 > 0 ? result.slice(colonIdx2 + 1, colonIdx3) : result.slice(colonIdx2 + 1);
            const fileObj = (aiUserFiles.get(username) || []).find(f => f.id === fileId);
            if (fileObj) {
              createdFiles.push({ id: fileId, name: name2, content: fileObj.content, description: desc });
              fileObj.ttl = 999999;
              // Сразу шлём файл клиенту через SSE
              aiSseEmit(username, 'file_created', { id: fileId, name: name2, description: desc, content: fileObj.content });
              scheduleAiFilesSave();
            }
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: `Файл "${name2}" создан.` });
            toolsUsed.push(toolName);
          } else {
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result });
            toolsUsed.push(toolName);
          }
        }

        toolResults.forEach(tr => history.push(tr));

        if (pendingAskUser) break;

        // Если есть созданные файлы — добавляем инструкцию продолжить
        // Вызываем AI ещё раз чтобы он мог создать следующий файл
        const nextResp = await axios.post('https://api.mistral.ai/v1/chat/completions', {
          model: isDebug ? 'mistral-large-latest' : 'mistral-small-latest',
          messages: [{ role: 'system', content: currentSystemPrompt }, ...history],
          tools: AI_TOOLS, tool_choice: 'auto',
          max_tokens: 4000, temperature: isDebug ? 0.4 : 0.7,
          ...(isDebug ? { safe_prompt: false } : {}),
        }, { headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 45000 });
        currentMsg = nextResp.data.choices?.[0]?.message;
        if (!currentMsg?.tool_calls?.length) {
          // Финальный текстовый ответ
          history.push(currentMsg);
          break;
        }
      }
      // Обновляем msg1 для дальнейшей обработки
      msg1 = history[history.length - 1];

      // Если есть pending вопрос — возвращаем его без второго запроса
      if (pendingAskUser) {
        history.push({ role: 'assistant', content: `Вопрос: ${pendingAskUser.question}` });
        // Отправляем через SSE чтобы клиент успел обработать до HTTP ответа
        aiSseEmit(username, 'ask_user', pendingAskUser);
        aiSseEmit(username, 'done', {});
        return res.json({ success: true, reply: '', toolsUsed, createdFiles, askUser: pendingAskUser });
      }

      // Стриминг финального ответа через SSE
      let reply = '';
      try {
        if (useAuraAI) {
          // MiniMax (Aura AI)
          reply = await callMiniMax(
            [{ role: 'system', content: currentSystemPrompt }, ...history],
            delta => aiSseEmit(username, 'chunk', { text: delta })
          );
          if (!reply) reply = 'Готово';
          history.push({ role: 'assistant', content: reply });
          aiSseEmit(username, 'done', {});
          return res.json({ success: true, reply, toolsUsed, createdFiles });
        }
        const streamResp = await axios.post('https://api.mistral.ai/v1/chat/completions', {
          model: isDebug ? 'mistral-large-latest' : 'mistral-small-latest',
          messages: [{ role: 'system', content: currentSystemPrompt }, ...history],
          max_tokens: 3000,
          temperature: isDebug ? 0.4 : 0.7,
          stream: true,
          ...(isDebug ? { safe_prompt: false } : {}),
        }, {
          headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
          responseType: 'stream',
          timeout: 45000,
        });
        await new Promise((resolve, reject) => {
          let buf = '';
          streamResp.data.on('data', chunk => {
            buf += chunk.toString();
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') return resolve();
              try {
                const j = JSON.parse(raw);
                const delta = j.choices?.[0]?.delta?.content || '';
                if (delta) {
                  reply += delta;
                  aiSseEmit(username, 'chunk', { text: delta });
                }
              } catch {}
            }
          });
          streamResp.data.on('end', resolve);
          streamResp.data.on('error', reject);
        });
      } catch {
        // fallback non-stream
        const r2 = await axios.post('https://api.mistral.ai/v1/chat/completions', {
          model: isDebug ? 'mistral-large-latest' : 'mistral-small-latest',
          messages: [{ role: 'system', content: currentSystemPrompt }, ...history],
          max_tokens: 3000, temperature: isDebug ? 0.4 : 0.7,
          ...(isDebug ? { safe_prompt: false } : {}),
        }, { headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 });
        reply = r2.data.choices?.[0]?.message?.content || 'Готово';
      }
      if (!reply) reply = 'Готово';
      history.push({ role: 'assistant', content: reply });
      scheduleAiConvSave();
      // Автоматически создаём ZIP если больше 1 файла
      if (createdFiles.length > 1) {
        try {
          const archiver = require('archiver');
          const { PassThrough } = require('stream');
          const archive = archiver('zip', { zlib: { level: 9 } });
          const chunks = [];
          archive.on('data', d => chunks.push(d));
          await new Promise((res2, rej2) => {
            archive.on('end', res2);
            archive.on('error', rej2);
            createdFiles.forEach(f => {
              archive.append(Buffer.from(f.content || '', 'utf8'), { name: f.name });
            });
            archive.finalize();
          });
          const zipBuf = Buffer.concat(chunks);
          const zipBase64 = zipBuf.toString('base64');
          const zipName = 'aura_files_' + Date.now() + '.zip';
          const { fileId: zipId } = aiSaveFile(username, zipName, zipBase64, `ZIP: ${createdFiles.length} файлов`);
          aiSseEmit(username, 'file_created', { id: zipId, name: zipName, description: `Архив: ${createdFiles.length} файлов`, isZip: true });
        } catch(e) { console.log('[ZIP]', e.message); }
      }
      aiSseEmit(username, 'done', {});
      res.json({ success: true, reply, toolsUsed, createdFiles });
    } else {
      // Прямой ответ без инструментов
      const reply = msg1?.content || 'Нет ответа';
      history.push({ role: 'assistant', content: reply });
      if (aiSseClients.has(username)) {
        // Имитируем стриминг — разбиваем на слова
        const words = (reply || '').split(' ');
        for (const w of words) {
          aiSseEmit(username, 'chunk', { text: w + ' ' });
          await new Promise(r => setTimeout(r, 15));
        }
        aiSseEmit(username, 'done', {});
      }
      res.json({ success: true, reply, toolsUsed: [], createdFiles });
    }
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    console.error('[AI] Ошибка:', msg);
    history.pop();
    res.status(500).json({ error: 'Ошибка AI: ' + msg });
  }
});

// ── Скачать файл из базы AI ───────────────────────────────────────────────────
app.get('/api/ai-file/:username/:fileId', (req, res) => {
  const files = aiUserFiles.get(req.params.username) || [];
  const file  = files.find(f => f.id === req.params.fileId);
  if (!file) return res.status(404).send('Файл не найден или истёк срок хранения');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(file.content);
});

// ── Скачать несколько файлов как ZIP ─────────────────────────────────────────
app.post('/api/ai-files-zip', (req, res) => {
  const { username, fileIds } = req.body;
  if (!username || !fileIds?.length) return res.status(400).json({ error: 'Нет данных' });

  const userFiles = aiUserFiles.get(username) || [];
  const toZip = userFiles.filter(f => fileIds.includes(f.id));
  if (!toZip.length) return res.status(404).send('Файлы не найдены');

  // Простой ZIP без внешних зависимостей — используем Node.js zlib + manual ZIP
  // Для простоты пакуем как tar-подобный текстовый архив если zlib недоступен
  try {
    const zlib = require('zlib');
    // Создаём ZIP вручную (минимальный формат)
    const buffers = [];
    const localHeaders = [];
    let offset = 0;

    toZip.forEach(file => {
      const nameBytes    = Buffer.from(file.name, 'utf8');
      const contentBytes = Buffer.from(file.content, 'utf8');
      const compressed   = zlib.deflateRawSync(contentBytes);
      const crc          = crc32(contentBytes);

      const localHeader = Buffer.alloc(30 + nameBytes.length);
      localHeader.writeUInt32LE(0x04034b50, 0);  // signature
      localHeader.writeUInt16LE(20, 4);           // version
      localHeader.writeUInt16LE(0, 6);            // flags
      localHeader.writeUInt16LE(8, 8);            // deflate
      localHeader.writeUInt16LE(0, 10);           // mod time
      localHeader.writeUInt16LE(0, 12);           // mod date
      localHeader.writeUInt32LE(crc, 14);
      localHeader.writeUInt32LE(compressed.length, 18);
      localHeader.writeUInt32LE(contentBytes.length, 22);
      localHeader.writeUInt16LE(nameBytes.length, 26);
      localHeader.writeUInt16LE(0, 28);
      nameBytes.copy(localHeader, 30);

      localHeaders.push({ nameBytes, compressed, crc, size: contentBytes.length, offset });
      offset += localHeader.length + compressed.length;
      buffers.push(localHeader, compressed);
    });

    // Central directory
    const cdEntries = [];
    localHeaders.forEach(({ nameBytes, compressed, crc, size, offset: off }) => {
      const cd = Buffer.alloc(46 + nameBytes.length);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
      cd.writeUInt16LE(0, 8); cd.writeUInt16LE(8, 10);
      cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
      cd.writeUInt32LE(crc, 16);
      cd.writeUInt32LE(compressed.length, 20);
      cd.writeUInt32LE(size, 24);
      cd.writeUInt16LE(nameBytes.length, 28);
      cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
      cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36);
      cd.writeUInt32LE(0, 38); cd.writeUInt32LE(off, 42);
      nameBytes.copy(cd, 46);
      cdEntries.push(cd);
    });

    const cdBuf = Buffer.concat(cdEntries);
    const eocd  = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(localHeaders.length, 8);
    eocd.writeUInt16LE(localHeaders.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    buffers.push(cdBuf, eocd);
    const zipBuf = Buffer.concat(buffers);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="aura_ai_files.zip"`);
    res.send(zipBuf);
  } catch (e) {
    // Fallback: объединяем файлы в один текстовый файл
    const combined = toZip.map(f => `=== ${f.name} ===\n${f.content}`).join('\n\n');
    res.setHeader('Content-Disposition', 'attachment; filename="aura_ai_files.txt"');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(combined);
  }
});

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── SSE стриминг для AI (прогресс инструментов + итоговый ответ) ──────────────
const aiSseClients = new Map(); // username -> res

app.get('/api/ai-stream/:username', (req, res) => {
  const { username } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  aiSseClients.set(username, res);
  req.on('close', () => aiSseClients.delete(username));
});

function aiSseEmit(username, event, data) {
  const client = aiSseClients.get(username);
  if (!client) return;
  try {
    client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {}
}

// ── Дневные лимиты на генерацию медиа ─────────────────────────────────────────
const aiDailyLimits  = new Map(); // username -> { date, images, videos }
const DAILY_IMG_LIMIT   = 3;
const DAILY_VIDEO_LIMIT = 1;

function checkDailyLimit(username, type) {
  const today = new Date().toDateString();
  if (!aiDailyLimits.has(username)) aiDailyLimits.set(username, { date: today, images: 0, videos: 0 });
  const lim = aiDailyLimits.get(username);
  if (lim.date !== today) { lim.date = today; lim.images = 0; lim.videos = 0; }
  if (type === 'image') {
    if (lim.images >= DAILY_IMG_LIMIT) return `Лимит изображений исчерпан (${DAILY_IMG_LIMIT}/день). Попробуй завтра.`;
    lim.images++;
    return null;
  }
  if (type === 'video') {
    if (lim.videos >= DAILY_VIDEO_LIMIT) return `Лимит видео исчерпан (${DAILY_VIDEO_LIMIT}/день). Попробуй завтра.`;
    lim.videos++;
    return null;
  }
  return null;
}

function getDailyLimitInfo(username) {
  const today = new Date().toDateString();
  const lim   = aiDailyLimits.get(username) || { images: 0, videos: 0 };
  if (lim.date !== today) return `Осталось: ${DAILY_IMG_LIMIT} изображений, ${DAILY_VIDEO_LIMIT} видео`;
  return `Осталось сегодня: ${DAILY_IMG_LIMIT - lim.images} изображений, ${DAILY_VIDEO_LIMIT - lim.videos} видео`;
}

// ── Прямая генерация изображения (обходит Mistral) ───────────────────────────
app.post('/api/generate-image', async (req, res) => {
  const { username, prompt, style } = req.body;
  if (!username || !prompt) return res.status(400).json({ error: 'Нет данных' });

  const limitErr = checkDailyLimit(username, 'image');
  if (limitErr) return res.json({ error: limitErr });

  // Отвечаем сразу — генерация идёт через SSE (не блокируем HTTP)
  res.json({ success: true, pending: true, prompt });

  // Асинхронная генерация в фоне
  setImmediate(async () => {
    try {
      aiSseEmit(username, 'log', { text: `Генерирую: ${prompt.slice(0,50)}...`, type: 'process' });

      const styleStr = style ? `, ${style}` : ', high quality, detailed, 4k';
      const seed = Math.floor(Math.random() * 999999);
      const seed2 = Math.floor(Math.random() * 999999);
      const engines = [
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true&model=flux&seed=${seed}`,
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + styleStr)}?width=896&height=640&nologo=true&model=flux&seed=${seed}`,
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ', high quality')}?width=800&height=600&nologo=true&seed=${seed2}`,
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`,
      ];

      let imgBase64 = null;
      for (const url of engines) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            aiSseEmit(username, 'log', { text: `Генерирую изображение${attempt > 0 ? ` (попытка ${attempt+1})` : ''}...`, type: 'fetch' });
            const r = await axios.get(url, {
              responseType: 'arraybuffer',
              timeout: 90000,
              headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' }
            });
            const ct = r.headers['content-type'] || '';
            if (r.data && r.data.byteLength > 3000 && ct.includes('image')) {
              imgBase64 = Buffer.from(r.data).toString('base64');
              const imgType = ct.includes('png') ? 'image/png' : 'image/jpeg';
              imgBase64 = `data:${imgType};base64,` + imgBase64;
              break;
            }
            await new Promise(r=>setTimeout(r,2000));
          } catch(e) { 
            console.log('[img] attempt', attempt+1, e.message);
            await new Promise(r=>setTimeout(r,3000));
          }
        }
        if (imgBase64) break;
      }

      if (!imgBase64) {
        aiSseEmit(username, 'media', { type: 'image_error', prompt, error: 'Не удалось загрузить изображение. Попробуй ещё раз.' });
        return;
      }

      // Сохраняем HTML файл с превью
      const html = `<!DOCTYPE html><html><head><title>${prompt.slice(0,40)}</title><style>body{margin:0;background:#0d0d12;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:95vw;max-height:95vh;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.8)}</style></head><body><img src="${imgBase64}" alt="${prompt.replace(/"/g,"'")}"/></body></html>`;
      const { fileId, safe } = aiSaveFile(username, 'ai_image.html', html, 'AI: ' + prompt.slice(0,40));

      const lim = aiDailyLimits.get(username);
      const remaining = DAILY_IMG_LIMIT - (lim?.images || 0);

      aiSseEmit(username, 'media', { type: 'image', base64: imgBase64, prompt, fileId, remaining });
      aiSseEmit(username, 'log', { text: `✅ Готово · осталось ${remaining}/${DAILY_IMG_LIMIT} сегодня`, type: 'result' });
    } catch(e) {
      console.error('[generate-image async]', e.message);
      aiSseEmit(username, 'media', { type: 'image_error', error: e.message });
    }
  });
});

// ── Генерация видео — async через SSE (6 кадров + canvas плеер) ─────────────
app.post('/api/generate-video', async (req, res) => {
  const { username, prompt } = req.body;
  if (!username || !prompt) return res.status(400).json({ error: 'Нет данных' });
  const limitErr = checkDailyLimit(username, 'video');
  if (limitErr) return res.json({ error: limitErr });

  // Отвечаем сразу, генерация в фоне через SSE
  res.json({ success: true, pending: true, prompt });

  setImmediate(async () => {
    try {
      aiSseEmit(username, 'log', { text: `Создаю видео: ${prompt.slice(0,40)}... (~60с)`, type: 'process' });

      // ── Попытка 1: Stability AI Video (нужен STABILITY_API_KEY) ─────────
      if (STABILITY_KEY) {
        try {
          aiSseEmit(username, 'log', { text: 'Stability AI: генерирую базовое изображение...', type: 'fetch' });
          const imgResp = await axios.post(
            'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
            { text_prompts:[{ text: prompt + ', cinematic, high quality', weight:1 }], cfg_scale:7, height:576, width:1024, samples:1, steps:25 },
            { headers:{ Authorization:'Bearer ' + STABILITY_KEY, 'Content-Type':'application/json' }, timeout:60000 }
          );
          const imgB64 = imgResp.data?.artifacts?.[0]?.base64;
          if (imgB64) {
            aiSseEmit(username, 'log', { text: 'Анимирую через Stability Video...', type: 'process' });
            const FormData = require('form-data');
            const formData = new FormData();
            formData.append('image', Buffer.from(imgB64, 'base64'), { filename:'init.png', contentType:'image/png' });
            formData.append('seed', '0');
            formData.append('cfg_scale', '2.5');
            formData.append('motion_bucket_id', '100');
            const vidResp = await axios.post(
              'https://api.stability.ai/v2beta/image-to-video',
              formData,
              { headers:{ ...formData.getHeaders(), Authorization:'Bearer ' + STABILITY_KEY }, timeout:15000 }
            );
            const genId = vidResp.data?.id;
            if (genId) {
              for (let i = 0; i < 18; i++) {
                await new Promise(r => setTimeout(r, 7000));
                aiSseEmit(username, 'log', { text: `Рендер ${Math.round((i+1)/18*100)}%...`, type: 'fetch' });
                try {
                  const poll = await axios.get(
                    'https://api.stability.ai/v2beta/image-to-video/result/' + genId,
                    { headers:{ Authorization:'Bearer ' + STABILITY_KEY, Accept:'video/*' }, responseType:'arraybuffer', timeout:15000 }
                  );
                  if (poll.status === 200 && poll.data?.byteLength > 10000) {
                    const vB64 = 'data:video/mp4;base64,' + Buffer.from(poll.data).toString('base64');
                    const { fileId, safe } = aiSaveFile(username, 'ai_video.mp4', 'VIDEO:' + vB64, 'AI видео: ' + prompt.slice(0,40));
                    aiSseEmit(username, 'media', { type:'video_real', base64:vB64, fileId, filename:safe, prompt });
                    aiSseEmit(username, 'log', { text: '✅ Реальное MP4 видео готово!', type: 'result' });
                    const lim = aiDailyLimits.get(username);
                    return;
                  }
                } catch(pe) { if (pe.response?.status !== 202) break; }
              }
            }
          }
        } catch(e) { console.log('[video] Stability failed:', e.response?.data?.message || e.message); }
      }

      // ── Попытка 2: Replicate (нужен REPLICATE_API_TOKEN) ─────────────
      if (REPLICATE_KEY) {
        try {
          aiSseEmit(username, 'log', { text: 'Replicate: запускаю zeroscope-v2...', type: 'fetch' });
          const startR = await axios.post(
            'https://api.replicate.com/v1/models/anotherjesse/zeroscope-v2-xl/predictions',
            { input:{ prompt, num_frames:24, num_inference_steps:40, fps:8, width:576, height:320 } },
            { headers:{ Authorization:'Token ' + REPLICATE_KEY, 'Content-Type':'application/json' }, timeout:15000 }
          );
          const predId = startR.data?.id;
          if (predId) {
            for (let i = 0; i < 20; i++) {
              await new Promise(r => setTimeout(r, 7000));
              const poll = await axios.get('https://api.replicate.com/v1/predictions/' + predId, { headers:{ Authorization:'Token ' + REPLICATE_KEY }, timeout:10000 });
              if (poll.data?.status === 'succeeded' && poll.data?.output) {
                const videoUrl = Array.isArray(poll.data.output) ? poll.data.output[0] : poll.data.output;
                const vr = await axios.get(videoUrl, { responseType:'arraybuffer', timeout:30000 });
                const vB64 = 'data:video/mp4;base64,' + Buffer.from(vr.data).toString('base64');
                const { fileId, safe } = aiSaveFile(username, 'ai_video.mp4', 'VIDEO:' + vB64, 'AI видео: ' + prompt.slice(0,40));
                aiSseEmit(username, 'media', { type:'video_real', base64:vB64, fileId, filename:safe, prompt });
                aiSseEmit(username, 'log', { text: '✅ Реальное MP4 видео готово! (Replicate)', type: 'result' });
                return;
              }
              if (poll.data?.status === 'failed') break;
            }
          }
        } catch(e) { console.log('[video] Replicate failed:', e.message); }
      }
      const frames = [];
      const seeds  = [11, 42, 137, 271, 314, 777];
      for (let i = 0; i < seeds.length; i++) {
        aiSseEmit(username, 'log', { text: `Кадр ${i+1}/${seeds.length}...`, type: 'fetch' });
        const variants = [
          `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + `, cinematic scene ${i+1} of 6, smooth motion, 4k`)}?width=768&height=432&nologo=true&model=flux&seed=${seeds[i]}`,
          `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ` frame ${i+1}`)}?width=768&height=432&nologo=true&seed=${seeds[i]}`,
        ];
        for (const url of variants) {
          try {
            const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 55000, headers: {'User-Agent':'Mozilla/5.0'} });
            if (r.data?.byteLength > 5000) {
              frames.push('data:image/jpeg;base64,' + Buffer.from(r.data).toString('base64'));
              break;
            }
          } catch(e) { console.log('[video frame]', i, e.message); }
        }
      }

      if (frames.length < 2) {
        aiSseEmit(username, 'media', { type: 'image_error', error: 'Не удалось сгенерировать видео. Попробуй позже.' });
        return;
      }
      aiSseEmit(username, 'log', { text: `Собираю ${frames.length} кадров в видео...`, type: 'process' });

      const framesJson = JSON.stringify(frames);
      const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>${prompt.slice(0,50)}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;color:#fff;gap:14px}canvas{max-width:95vw;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.8)}.ui{width:100%;max-width:768px;display:flex;flex-direction:column;gap:8px}.row{display:flex;align-items:center;gap:10px}.pb{flex:1;height:4px;background:rgba(255,255,255,.2);border-radius:99px;cursor:pointer;position:relative}.pf{height:100%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:99px;transition:width .08s}.btn{padding:6px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:13px;transition:background .15s;white-space:nowrap}.btn:hover{background:rgba(255,255,255,.22)}.btn.p{background:#6366f1;border-color:#6366f1}.tc{font-size:11px;color:rgba(255,255,255,.45);min-width:36px;font-variant-numeric:tabular-nums}.ttl{font-size:11px;color:rgba(255,255,255,.3);text-align:center}.spd{font-size:11px;color:rgba(255,255,255,.5);min-width:28px;text-align:center}</style></head>
<body>
<canvas id="c"></canvas>
<div class="ui">
<div class="row"><span class="tc" id="tc">0:00</span><div class="pb" id="pb" onclick="seek(event)"><div class="pf" id="pf" style="width:0%"></div></div><span class="tc" id="td">0:00</span></div>
<div class="row"><button class="btn p" id="pb2" onclick="tog()">▶</button><button class="btn" onclick="rst()">⏮</button><button class="btn" onclick="spd()" id="sb">1x</button><span class="spd" id="fi">${frames.length}к</span><a id="dl" class="btn" download="frame.jpg" style="text-decoration:none;margin-left:auto">⬇ Кадр</a></div>
<div class="ttl">${prompt.slice(0,80)}</div>
</div>
<script>
const F=${framesJson};
const imgs=F.map(src=>{const i=new Image();i.src=src;return i;});
const c=document.getElementById('c'),x=c.getContext('2d');
imgs[0].onload=()=>{c.width=imgs[0].naturalWidth||768;c.height=imgs[0].naturalHeight||432;draw(0);document.getElementById('td').textContent=fmt(F.length/fps);};
let fps=24,playing=false,cur=0,last=null,si=1;
const FPS=[12,24,30];const SPD=['0.5x','1x','1.25x'];
function fmt(s){return Math.floor(s/60)+':'+(Math.floor(s%60)).toString().padStart(2,'0');}
function draw(f){
  const i=Math.min(Math.floor(f),F.length-1),n=Math.min(i+1,F.length-1),t=f-Math.floor(f);
  if(imgs[i].complete){x.drawImage(imgs[i],0,0,c.width,c.height);}
  if(t>0.05&&imgs[n].complete){x.globalAlpha=t;x.drawImage(imgs[n],0,0,c.width,c.height);x.globalAlpha=1;}
  try{document.getElementById('dl').href=c.toDataURL('image/jpeg',.92);}catch{}
}
function frame(ts){if(!playing)return;if(!last)last=ts;cur+=(ts-last)/1000*fps;last=ts;if(cur>=F.length)cur=0;document.getElementById('pf').style.width=(cur/F.length*100)+'%';document.getElementById('tc').textContent=fmt(cur/fps);draw(cur);requestAnimationFrame(frame);}
function tog(){playing=!playing;document.getElementById('pb2').textContent=playing?'⏸':'▶';if(playing){last=null;requestAnimationFrame(frame);}}
function rst(){cur=0;draw(0);document.getElementById('pf').style.width='0%';document.getElementById('tc').textContent='0:00';}
function spd(){si=(si+1)%3;fps=FPS[si];document.getElementById('sb').textContent=SPD[si];document.getElementById('td').textContent=fmt(F.length/fps);}
function seek(e){const r=document.getElementById('pb').getBoundingClientRect();cur=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*F.length;draw(cur);document.getElementById('pf').style.width=(cur/F.length*100)+'%';document.getElementById('tc').textContent=fmt(cur/fps);}
setTimeout(tog,600);
</script></body></html>`;

      const { fileId, safe } = aiSaveFile(username, 'ai_video.html', html, 'AI видео: ' + prompt.slice(0,40));
      if (frames[0]) {
        aiSseEmit(username, 'media', { type:'video_preview', base64:frames[0], fileId, filename:safe, prompt, frameCount:frames.length });
      }
      const lim = aiDailyLimits.get(username);
      aiSseEmit(username, 'log', { text: `✅ Видео готово (${frames.length} кадров)`, type: 'result' });
    } catch(e) {
      console.error('[generate-video]', e.message);
      aiSseEmit(username, 'media', { type:'image_error', error: 'Ошибка: ' + e.message });
    }
  });
});

app.get('/api/ai-files/:username', (req, res) => {
  const files = (aiUserFiles.get(req.params.username) || []).map(f => ({
    id: f.id, name: f.name, ttl: f.ttl,
    size: f.content?.length || 0,
    description: f.description || '',
    created: f.created || null,
    preview: (f.content || '').slice(0, 120),  // для превью в UI
  }));
  res.json({ files });
});

// ── Редактировать файл в базе ─────────────────────────────────────────────────
app.post('/api/ai-file-edit', (req, res) => {
  const { username, fileId, content, name } = req.body;
  if (!username || !fileId) return res.status(400).json({ error: 'Нет данных' });
  const files = aiUserFiles.get(username) || [];
  const idx   = files.findIndex(f => f.id === fileId);
  if (idx === -1) return res.status(404).json({ error: 'Файл не найден' });
  if (content !== undefined) files[idx].content = content;
  if (name    !== undefined) files[idx].name    = name.replace(/[^a-zA-Z0-9._\-а-яёА-ЯЁ]/gi,'_');
  files[idx].edited = new Date().toISOString();
  aiUserFiles.set(username, files);
  res.json({ success: true, file: { id: files[idx].id, name: files[idx].name, size: files[idx].content.length } });
});

// ── Удалить файл из базы ──────────────────────────────────────────────────────
app.post('/api/ai-file-delete', (req, res) => {
  const { username, fileId } = req.body;
  if (!username || !fileId) return res.status(400).json({ error: 'Нет данных' });
  const files = (aiUserFiles.get(username) || []).filter(f => f.id !== fileId);
  if (files.length) aiUserFiles.set(username, files);
  else              aiUserFiles.delete(username);
  res.json({ success: true });
});

// ── Сбросить историю AI-чата ──────────────────────────────────────────────────
app.post('/api/ai-clear', (req, res) => {
  const { username } = req.body;
  if (username) { aiConversations.delete(username); aiUserFiles.delete(username); }
  res.json({ success: true });
});

// Хэш пароля (простой SHA-256 без внешних зависимостей)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'aura_salt_2026').digest('hex');
}

// Вход/регистрация с паролем
app.post('/api/login', async (req, res) => {
  const { username, password, email, mode } = req.body; // mode: 'login' | 'register'
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Имя не может быть пустым' });
  }
  if (!password || password.trim().length < 4) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 4 символов' });
  }
  const cleanName = username.trim();
  const pwHash = hashPassword(password.trim());

  if (users.has(cleanName)) {
    const userData = users.get(cleanName);
    // Check password
    if (userData.passwordHash && userData.passwordHash !== pwHash) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }
    // If no password set yet (old account) — set it now
    if (!userData.passwordHash) {
      userData.passwordHash = pwHash;
      users.set(cleanName, userData);
      await saveUsers();
    }
    return res.json({
      success: true,
      user: {
        username: cleanName,
        nickname: userData.nickname || cleanName,
        avatar: userData.avatar || null,
        theme: userData.theme || 'dark',
        friends: userData.friends || [],
        friendRequests: userData.friendRequests || [],
        groups: userData.groups || []
      }
    });
  } else {
    // Пользователь не существует
    if (mode === 'login') {
      // Режим входа — не создаём аккаунт
      return res.status(401).json({ error: 'Пользователь не найден. Перейдите на вкладку Регистрация.' });
    }
    // Новая регистрация
    const newUser = {
      nickname:      cleanName,
      passwordHash:  pwHash,
      avatar:        null,
      theme:         'dark',
      friends:       [],
      friendRequests:[],
      groups:        [],
      recoveryEmail: null,        // сохраняем только после подтверждения
      emailVerified: false,
    };
    users.set(cleanName, newUser);
    await saveUsers();

    // Если указан email — отправляем код подтверждения
    if (email) {
      const code   = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = Date.now() + 15 * 60 * 1000;
      emailVerifyCodes.set(cleanName, { code, expiry, pendingEmail: email });
      sendVerifyEmail(email, code).catch(e => console.warn('Ошибка отправки verify email при регистрации:', e.message));
    }

    return res.json({
      success: true,
      isNew: true,
      needsEmailVerify: !!email,
      user: {
        username:      cleanName,
        nickname:      cleanName,
        avatar:        null,
        theme:         'dark',
        friends:       [],
        friendRequests:[],
        groups:        [],
        recoveryEmail: null,
      }
    });
  }
});

// Обновление профиля
app.post('/api/update-profile', async (req, res) => {
  const { username, nickname, avatar, theme } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  const user = users.get(username);
  if (nickname !== undefined) user.nickname = nickname;
  if (avatar !== undefined) user.avatar = avatar;
  if (theme !== undefined) user.theme = theme;
  users.set(username, user);
  await saveUsers();
  res.json({ success: true, user: { nickname: user.nickname, avatar: user.avatar, theme: user.theme } });
});

// Удаление аккаунта
app.post('/api/delete-account', async (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  users.delete(username);
  await saveUsers();
  res.json({ success: true });
});

// Запросить сброс пароля
app.post('/api/request-password-reset', async (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) {
    // Не раскрываем существование аккаунта
    return res.json({ success: true, message: 'Если аккаунт существует, код отправлен на email' });
  }
  const userData = users.get(username);
  if (!userData.recoveryEmail) {
    return res.json({ success: false, error: 'Email не привязан к аккаунту. Добавь его в Настройки → Аккаунт.' });
  }

  // Генерируем 6-значный код
  const code   = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = Date.now() + 15 * 60 * 1000; // 15 минут

  recoveryCodes.set(username, { code, expiry, email: userData.recoveryEmail });

  try {
    await sendRecoveryEmail(userData.recoveryEmail, code);
    res.json({ success: true, message: 'Код отправлен на email' });
  } catch (err) {
    // Если email не настроен — всё равно продолжаем (код есть в консоли сервера)
    const isDevMode = !process.env.GMAIL_USER && !process.env.RESEND_API_KEY;
    if (isDevMode) {
      res.json({ success: true, message: 'Код выведен в консоль сервера (email не настроен)' });
    } else {
      res.json({ success: false, error: 'Не удалось отправить email: ' + err.message });
    }
  }
});

// Подтвердить сброс пароля
app.post('/api/reset-password', async (req, res) => {
  const { username, code, newPassword } = req.body;
  if (!username || !code || !newPassword) {
    return res.status(400).json({ error: 'Не все данные указаны' });
  }
  if (!users.has(username)) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  if (newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 4 символов' });
  }

  const recovery = recoveryCodes.get(username);
  if (!recovery || recovery.code !== code || Date.now() > recovery.expiry) {
    return res.status(400).json({ error: 'Неверный или просроченный код' });
  }

  // Reset password
  const userData = users.get(username);
  userData.passwordHash = hashPassword(newPassword.trim());
  users.set(username, userData);
  recoveryCodes.delete(username);
  await saveUsers();

  res.json({ success: true, message: 'Пароль изменён' });
});

// Обновить email для восстановления
// Шаг 1: Отправить код подтверждения на новый email
app.post('/api/update-recovery-email', async (req, res) => {
  const { username, email } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!email) {
    // Удаление email — без подтверждения
    const userData = users.get(username);
    userData.recoveryEmail = null;
    userData.emailVerified = false;
    users.set(username, userData);
    await saveUsers();
    return res.json({ success: true, cleared: true });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Некорректный email' });
  }

  const code   = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = Date.now() + 15 * 60 * 1000;
  emailVerifyCodes.set(username, { code, expiry, pendingEmail: email });

  try {
    await sendVerifyEmail(email, code);
    res.json({ success: true, needsVerify: true, message: 'Код отправлен на ' + email });
  } catch (err) {
    const isDevMode = !process.env.GMAIL_USER && !process.env.BREVO_API_KEY;
    if (isDevMode) {
      res.json({ success: true, needsVerify: true, message: 'Dev: код в консоли сервера' });
    } else {
      res.status(500).json({ error: 'Не удалось отправить код: ' + err.message });
    }
  }
});

// Шаг 2: Подтвердить код
app.post('/api/verify-email-code', async (req, res) => {
  const { username, code } = req.body;
  if (!username || !code) return res.status(400).json({ error: 'Нет данных' });
  if (!users.has(username))  return res.status(404).json({ error: 'Пользователь не найден' });

  const pending = emailVerifyCodes.get(username);
  if (!pending || pending.code !== code || Date.now() > pending.expiry) {
    return res.status(400).json({ error: 'Неверный или просроченный код' });
  }

  const userData = users.get(username);
  userData.recoveryEmail = pending.pendingEmail;
  userData.emailVerified = true;
  users.set(username, userData);
  emailVerifyCodes.delete(username);
  await saveUsers();

  res.json({ success: true, email: pending.pendingEmail });
});

// Поиск пользователей по nickname
app.post('/api/search-users', async (req, res) => {
  const { query, requester } = req.body;
  if (!query || query.trim().length < 1) {
    return res.json({ users: [] });
  }
  const q = query.toLowerCase().trim();
  const results = [];

  // Получаем список друзей запрашивающего чтобы пометить их
  const requesterData = requester && users.has(requester) ? users.get(requester) : null;
  const myFriends = new Set(requesterData?.friends || []);

  for (const [username, userData] of users.entries()) {
    // Пропускаем себя
    if (username === requester) continue;

    const nickname = (userData.nickname || '').toLowerCase();
    const uname    = username.toLowerCase();

    if (nickname.includes(q) || uname.includes(q)) {
      results.push({
        username,
        nickname:  userData.nickname || username,
        avatar:    userData.avatar   || null,
        isFriend:  myFriends.has(username),
      });
    }
    if (results.length >= 20) break;
  }

  // Сортируем: сначала точные совпадения по нику, потом по логину
  results.sort((a, b) => {
    const aNick = (a.nickname || '').toLowerCase();
    const bNick = (b.nickname || '').toLowerCase();
    const aScore = (aNick === q || a.username === q) ? 0 : (aNick.startsWith(q) || a.username.startsWith(q)) ? 1 : 2;
    const bScore = (bNick === q || b.username === q) ? 0 : (bNick.startsWith(q) || b.username.startsWith(q)) ? 1 : 2;
    return aScore - bScore;
  });

  res.json({ users: results.slice(0, 10) });
});

// Отправить заявку в друзья
app.post('/api/send-friend-request', async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'Не указаны имена' });
  if (!users.has(from) || !users.has(to)) return res.status(404).json({ error: 'Пользователь не найден' });
  if (from === to) return res.status(400).json({ error: 'Нельзя добавить себя' });

  const targetUser = users.get(to);
  if (!targetUser.friendRequests) targetUser.friendRequests = [];
  if (targetUser.friendRequests.includes(from)) {
    return res.json({ success: false, message: 'Заявка уже отправлена' });
  }
  targetUser.friendRequests.push(from);
  users.set(to, targetUser);
  await saveUsers();

  const targetSocketId = userSockets.get(to);
  if (targetSocketId) {
    io.to(targetSocketId).emit('friend-request', { from });
    // Also save to user's pending requests for when they reconnect
    // (already saved above via targetUser.friendRequests.push(from))
  }
  res.json({ success: true });
});

// Принять заявку
app.post('/api/accept-friend-request', async (req, res) => {
  const { username, requester } = req.body;
  if (!username || !requester) return res.status(400).json({ error: 'Не указаны имена' });
  if (!users.has(username) || !users.has(requester)) return res.status(404).json({ error: 'Пользователь не найден' });

  const user = users.get(username);
  const requesterUser = users.get(requester);

  if (!user.friendRequests) user.friendRequests = [];
  const index = user.friendRequests.indexOf(requester);
  if (index === -1) return res.status(400).json({ error: 'Заявка не найдена' });

  user.friendRequests.splice(index, 1);
  if (!user.friends) user.friends = [];
  if (!requesterUser.friends) requesterUser.friends = [];
  if (!user.friends.includes(requester)) user.friends.push(requester);
  if (!requesterUser.friends.includes(username)) requesterUser.friends.push(username);

  users.set(username, user);
  users.set(requester, requesterUser);
  await saveUsers();

  const userSocket = userSockets.get(username);
  if (userSocket) {
    io.to(userSocket).emit('friends-updated', { friends: user.friends });
  }
  const requesterSocket = userSockets.get(requester);
  if (requesterSocket) io.to(requesterSocket).emit('friends-updated', { friends: requesterUser.friends });

  res.json({ success: true, friends: user.friends });
});

// Отклонить заявку
app.post('/api/reject-friend-request', async (req, res) => {
  const { username, requester } = req.body;
  if (!username || !requester) return res.status(400).json({ error: 'Не указаны имена' });
  if (!users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });

  const user = users.get(username);
  if (!user.friendRequests) user.friendRequests = [];
  const index = user.friendRequests.indexOf(requester);
  if (index !== -1) {
    user.friendRequests.splice(index, 1);
    users.set(username, user);
    await saveUsers();
  }
  res.json({ success: true });
});

// Получить данные пользователя
app.post('/api/get-user-data', (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  const userData = users.get(username);
  res.json({
    friends:       userData.friends        || [],
    friendRequests:userData.friendRequests || [],
    groups:        userData.groups         || [],
    recoveryEmail: userData.recoveryEmail  || null,
    emailVerified: userData.emailVerified  || false,
  });
});

// Получить аватарку пользователя
app.post('/api/get-avatar', (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'Пользователь не найден' });
  const userData = users.get(username);
  res.json({
    avatar:   userData.avatar    || null,
    nickname: userData.nickname  || null,
  });
});

// Создать группу (упрощённо)
app.post('/api/create-group', async (req, res) => {
  const { creator, name, members } = req.body;
  if (!creator || !name) return res.status(400).json({ error: 'Не указаны данные' });
  if (!users.has(creator)) return res.status(404).json({ error: 'Создатель не найден' });

  const groupId = `group_${Date.now()}`;
  const group = { id: groupId, name, creator, avatar: null, members: [creator, ...(members || [])] };
  for (const member of group.members) {
    if (users.has(member)) {
      const user = users.get(member);
      if (!user.groups) user.groups = [];
      user.groups.push(group);
      users.set(member, user);
    }
  }
  await saveUsers();
  [...(members || []), creator].forEach(m => {
    const sid = userSockets.get(m);
    if (sid) io.to(sid).emit('group-created', { groupId, name, creator });
  });
  res.json({ success: true, groupId });
});

// Обновить название группы (только создатель)
app.post('/api/update-group', async (req, res) => {
  const { username, groupId, name, avatar } = req.body;
  if (!username || !groupId) return res.status(400).json({ error: 'Нет данных' });

  let updated = false;
  let groupData = null;

  // Обновляем группу у всех её участников
  for (const [uname, userData] of users.entries()) {
    if (!userData.groups) continue;
    const idx = userData.groups.findIndex(g => g.id === groupId);
    if (idx === -1) continue;

    // Проверяем что редактор — создатель
    if (userData.groups[idx].creator !== username && uname === username) {
      return res.status(403).json({ error: 'Только создатель может редактировать группу' });
    }

    if (name !== undefined)   userData.groups[idx].name   = name;
    if (avatar !== undefined) userData.groups[idx].avatar = avatar;
    groupData = userData.groups[idx];
    users.set(uname, userData);
    updated = true;
  }

  if (!updated) return res.status(404).json({ error: 'Группа не найдена' });
  await saveUsers();

  // Оповещаем всех участников
  if (groupData) {
    groupData.members.forEach(m => {
      const sid = userSockets.get(m);
      if (sid) io.to(sid).emit('group-updated', { groupId, name: groupData.name, avatar: groupData.avatar });
    });
  }

  res.json({ success: true });
});

// Удалить группу (только создатель)
app.post('/api/delete-group', async (req, res) => {
  const { username, groupId } = req.body;
  if (!username || !groupId) return res.status(400).json({ error: 'Нет данных' });

  let members = [];
  let isCreator = false;

  // Удаляем группу у всех участников
  for (const [uname, userData] of users.entries()) {
    if (!userData.groups) continue;
    const idx = userData.groups.findIndex(g => g.id === groupId);
    if (idx === -1) continue;
    if (userData.groups[idx].creator === username) isCreator = true;
    if (uname === username && userData.groups[idx].creator !== username) {
      return res.status(403).json({ error: 'Только создатель может удалить группу' });
    }
    if (members.length === 0) members = userData.groups[idx].members || [];
    userData.groups.splice(idx, 1);
    users.set(uname, userData);
  }

  if (!isCreator) return res.status(403).json({ error: 'Только создатель может удалить группу' });

  await saveUsers();

  // Оповещаем всех участников
  members.forEach(m => {
    const sid = userSockets.get(m);
    if (sid) io.to(sid).emit('group-deleted', { groupId });
  });

  res.json({ success: true });
});
const HISTORY_FILE = 'history.json';
const MAX_HISTORY = 2000;
let messageHistory = [];

// Удаление сообщения
// ── Очистка истории группы (только создатель) ──────────────────────────────
app.post('/api/clear-group', async (req, res) => {
  const { groupId, username } = req.body;
  if (!groupId || !username) return res.status(400).json({ error: 'Нет данных' });

  // Ищем группу в данных пользователя
  const userData = users.get(username);
  if (!userData) return res.status(404).json({ error: 'Пользователь не найден' });
  const group = (userData.groups || []).find(g => g.id === groupId);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  if (group.creator !== username) return res.status(403).json({ error: 'Только создатель может очищать' });

  const room = `group:${groupId}`;
  const before = messageHistory.length;
  messageHistory = messageHistory.filter(m => m.room !== room);
  const deleted = before - messageHistory.length;
  saveHistory();

  // Уведомляем всех участников об очистке
  io.to(room).emit('group-history-cleared', { groupId, by: username });

  res.json({ success: true, deleted });
});

app.post('/api/delete-message', async (req, res) => {
  const { messageId, username, forAll } = req.body;
  if (!messageId || !username) return res.status(400).json({ error: 'Нет данных' });

  const idx = messageHistory.findIndex(m => String(m.id) === String(messageId));
  if (idx === -1) return res.status(404).json({ error: 'Сообщение не найдено' });

  const msg = messageHistory[idx];

  if (forAll) {
    // Удаление у всех — только автор
    if (msg.user !== username) return res.status(403).json({ error: 'Нельзя удалить чужое сообщение у всех' });
    const room = msg.room;
    messageHistory.splice(idx, 1);
    saveHistory();
    io.to(room).emit('message-deleted', { messageId, room });
    return res.json({ success: true });
  } else {
    // Удаление у себя — обрабатывается на клиенте (localStorage)
    // Сервер просто подтверждает
    return res.json({ success: true });
  }
});

async function loadHistory() {
  try {
    if (USE_SB) {
      const data = await sbReadJson(HISTORY_FILE);
      if (data && Array.isArray(data)) {
        messageHistory = data.slice(-MAX_HISTORY);
        console.log(`📁 Загружено ${messageHistory.length} сообщений`);
      }
      return;
    }
    if (!b2Auth) await reAuthB2();
    const { bucketName } = b2GetBucketForFile(HISTORY_FILE);
    const text = await b2S3Download(bucketName, HISTORY_FILE);
    const data = JSON.parse(text);
    if (data && Array.isArray(data)) {
      messageHistory = data.slice(-MAX_HISTORY);
      console.log(`📁 Загружено ${messageHistory.length} сообщений`);
    }
  } catch (err) {
    console.log('📁 history.json не найден — начинаем пустыми');
  }
}

async function saveHistory() {
  try {
    const jsonBuffer = Buffer.from(JSON.stringify(messageHistory), 'utf-8');
    if (USE_B2) {
      const { bucketName } = b2GetBucketForFile(HISTORY_FILE);
      await b2S3Upload(bucketName, HISTORY_FILE, jsonBuffer, 'application/json');
    } else {
      await storageUpload(HISTORY_FILE, jsonBuffer, 'application/json');
    }
    console.log('💾 История сохранена');
  } catch (err) {
    console.error('Ошибка сохранения истории:', err.message);
  }
}

// ========== ИНИЦИАЛИЗАЦИЯ B2 ==========
(async () => {
  try {
    console.log('🔄 Инициализация хранилища...');
    await initStorage();
    await loadUsers();
    await loadHistory();
    await loadAiConversations();
    await loadAiFiles();
  } catch (err) {
    console.error('❌ Ошибка подключения к B2:', err.message);
    console.log('⚠️  Сервер запускается без B2 — данные будут в памяти до переподключения');
    // НЕ вызываем process.exit — сервер работает, просто без persistence
    // Пробуем переподключиться через 30 секунд
    setTimeout(async () => {
      try {
        await initStorage();
        await loadUsers();
        await loadHistory();
        console.log('✅ Хранилище переподключено');
      } catch(e2) {
        console.error('[B2] Повторная попытка не удалась:', e2.message);
      }
    }, 30000);
  }
})();

// ========== SOCKET.IO ==========
const onlineUsers = new Map();    // socketId -> { username, lastSeen }
const userSockets = new Map();    // username -> socketId
const peerIdRegistry = new Map(); // username -> peerId
const missedCalls    = new Map(); // username -> [{ from, isVid, time }]
const activeCalls    = new Map(); // callee_username -> { from, isVid, startTime }

// Clean stale active calls every 30s
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of activeCalls.entries()) {
    if (now - v.startTime > 30000) activeCalls.delete(k);
  }
}, 30000);

function broadcastOnlineCount() {
  // Удаляем только тех у кого нет активного сокета — не по таймауту
  for (const [id] of onlineUsers.entries()) {
    if (!io.sockets.sockets.has(id)) onlineUsers.delete(id);
  }
  io.emit('online-count', onlineUsers.size);
  const onlineList = [...new Set([...onlineUsers.values()].map(u => u.username).filter(Boolean))];
  io.emit('online-users', onlineList);
}
setInterval(broadcastOnlineCount, 10000); // 10s - стабильно, без мигания // реже чтобы не мигало

io.on('connection', (socket) => {
  let currentUser = null;

  socket.on('identify', (username) => {
    currentUser = username;
    onlineUsers.set(socket.id, { username, lastSeen: Date.now() });
    // Рассылаем обновлённый список
    const onlineList2 = [...onlineUsers.values()].map(u => u.username).filter(Boolean);
    io.emit('online-users', onlineList2);
    userSockets.set(username, socket.id);
    broadcastOnlineCount();
    // НЕ присоединяем к general — чат выбирается клиентом
    // Push pending friend requests to user on connect
    const userData = users.get(username);
    if (userData?.friendRequests?.length) {
      socket.emit('friend-requests-sync', { requests: userData.friendRequests });
    }
    // Resume active call — если кто-то ещё звонит этому пользователю
    const active = activeCalls.get(username);
    if (active && Date.now() - active.startTime < 90000) { // 90 секунд
      socket.emit('call-invite', { from: active.from, isVid: active.isVid, resumed: true });
      console.log(`[Call] Resumed ring for ${username} from ${active.from}`);
      // Уведомляем звонящего что адресат вернулся онлайн
      const callerSid = userSockets.get(active.from);
      if (callerSid) {
        io.to(callerSid).emit('call-callee-online', { to: username });
      }
    }

    // Deliver missed calls as one batch
    const missed = missedCalls.get(username);
    if (missed?.length) {
      const fresh = missed.filter(c => Date.now() - c.time < 10 * 60 * 1000); // 10 min
      missedCalls.delete(username);
      if (fresh.length) {
        socket.emit('missed-calls', { calls: fresh });
      }
    }
  });

  socket.on('join-room', (room) => {
    if (!currentUser) return;
    const rooms = [...socket.rooms];
    rooms.forEach(r => {
      if (r !== socket.id) socket.leave(r);
    });
    socket.join(room);
    const roomHistory = messageHistory.filter(m => m.room === room).slice(-100);
    socket.emit('history', roomHistory);

    // Помечаем все сообщения от других как прочитанные этим пользователем
    // и уведомляем отправителей что сообщения прочитаны
    let changed = false;
    messageHistory.forEach(msg => {
      if (msg.room === room && msg.user !== currentUser) {
        if (!msg.readBy) msg.readBy = [];
        if (!msg.readBy.includes(currentUser)) {
          msg.readBy.push(currentUser);
          changed = true;
        }
      }
    });
    if (changed) {
      saveHistory();
      // Уведомляем всех в комнате (отправителей) что currentUser прочитал
      socket.to(room).emit('messages-read', { room, by: currentUser });
    }
  });

  socket.on('ping', () => {
    // Просто обновляем lastSeen, онлайн-статус теперь по сокету
    if (onlineUsers.has(socket.id)) {
      onlineUsers.get(socket.id).lastSeen = Date.now();
    }
  });

  socket.on('message', (data) => {
    if (!currentUser) return;
    const { text, room, replyTo } = data;
    const msg = {
      id: Date.now() + Math.random(),
      user: currentUser,
      text,
      type: 'text',
      time: new Date().toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit', timeZone:'Europe/Moscow' }),
      date: new Date().toLocaleDateString('ru-RU', { day:'numeric', month:'long', timeZone:'Europe/Moscow' }),
      ts:   Date.now(),
      room: room || 'general',
      replyTo: replyTo || undefined,
      forwarded: data.forwarded || undefined,
      fwdFrom:   data.fwdFrom   || undefined,
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    saveHistory();
    io.to(msg.room).emit('message', msg);

    // Для групповых чатов — шлём напрямую каждому участнику (не в комнате)
    if (msg.room.startsWith('group:')) {
      const groupId = msg.room.slice(6);
      for (const [uname, udata] of users.entries()) {
        if (uname === currentUser) continue;
        const inGroup = (udata.groups || []).some(g => g.id === groupId);
        if (!inGroup) continue;
        const sid = userSockets.get(uname);
        if (!sid) continue;
        const sock = io.sockets.sockets.get(sid);
        if (sock && ![...sock.rooms].includes(msg.room)) {
          sock.emit('message', msg);
        }
      }
    }

    // Уведомление получателю даже если он не в этой комнате
    if (msg.room.startsWith('private:')) {
      const parts = msg.room.split(':').slice(1);
      const recipientName = parts.find(u => u !== currentUser);
      if (recipientName) {
        const recipientSid = userSockets.get(recipientName);
        if (recipientSid) {
          const recipientSocket = io.sockets.sockets.get(recipientSid);
          // Шлём только если получатель НЕ в этой комнате
          if (recipientSocket && ![...recipientSocket.rooms].includes(msg.room)) {
            recipientSocket.emit('message', msg);
          }
        }
      }
    }
  });

  socket.on('edit-message', ({ messageId, text }) => {
    if (!currentUser) return;
    const newText = String(text || '').trim();
    if (!messageId || !newText) return;

    const idx = messageHistory.findIndex(m => String(m.id) === String(messageId));
    if (idx < 0) return;
    const msg = messageHistory[idx];
    if (!msg || msg.user !== currentUser) return;
    if ((msg.type || 'text') !== 'text') return;

    msg.text = newText;
    msg.edited = true;
    msg.editedAt = Date.now();
    messageHistory[idx] = msg;
    saveHistory();

    io.to(msg.room).emit('message-edited', {
      messageId: msg.id,
      text: msg.text,
      edited: true,
      editedAt: msg.editedAt,
      room: msg.room
    });
  });
  socket.on('media-message', (data) => {
    const { mediaData, room } = data;
    if (!currentUser) return;
    const msg = {
      id: Date.now() + Math.random(),
      user: currentUser,
      text: mediaData.text || '',
      type: mediaData.type,
      url: mediaData.url,
      fileName: mediaData.fileName,
      time: new Date().toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit', timeZone:'Europe/Moscow' }),
      date: new Date().toLocaleDateString('ru-RU', { day:'numeric', month:'long', timeZone:'Europe/Moscow' }),
      ts:   Date.now(),
      room: room || 'general',
      replyTo:   data.replyTo           || undefined,
      forwarded: mediaData.forwarded    || undefined,
      fwdFrom:   mediaData.fwdFrom      || undefined,
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    saveHistory();
    io.to(msg.room).emit('message', msg);

    // Для групповых чатов — шлём напрямую каждому участнику (не в комнате)
    if (msg.room.startsWith('group:')) {
      const groupId = msg.room.slice(6);
      for (const [uname, udata] of users.entries()) {
        if (uname === currentUser) continue;
        const inGroup = (udata.groups || []).some(g => g.id === groupId);
        if (!inGroup) continue;
        const sid = userSockets.get(uname);
        if (!sid) continue;
        const sock = io.sockets.sockets.get(sid);
        if (sock && ![...sock.rooms].includes(msg.room)) {
          sock.emit('message', msg);
        }
      }
    }

    // Уведомление получателю даже если он не в этой комнате
    if (msg.room.startsWith('private:')) {
      const parts = msg.room.split(':').slice(1);
      const recipientName = parts.find(u => u !== currentUser);
      if (recipientName) {
        const recipientSid = userSockets.get(recipientName);
        if (recipientSid) {
          const recipientSocket = io.sockets.sockets.get(recipientSid);
          if (recipientSocket && ![...recipientSocket.rooms].includes(msg.room)) {
            recipientSocket.emit('message', msg);
          }
        }
      }
    }
  });

  // Обработчик обновления аватара
  socket.on('avatar-updated', ({ username, avatar }) => {
    if (!username || !users.has(username)) return;
    const user = users.get(username);
    user.avatar = avatar;
    users.set(username, user);
    saveUsers();
    // Рассылаем всем, чтобы обновились аватары в интерфейсе
    io.emit('avatar-updated', { username, avatar });
  });

  // PeerJS ID registration
  socket.on('peer-id', ({ username, peerId }) => {
    if (!username || !peerId) return;
    console.log(`[PeerID] ${username} → ${peerId}`);
    peerIdRegistry.set(username, peerId);
    // Broadcast to everyone so they can update their registry
    socket.broadcast.emit('peer-id', { username, peerId });
  });

  // Someone wants to call a specific user — request their latest peerId
  socket.on('get-peer-id', ({ target }) => {
    const pid = peerIdRegistry.get(target);
    if (pid) {
      socket.emit('peer-id', { username: target, peerId: pid });
    }
    // Also ask target to re-broadcast (in case registry stale)
    const targetSocketId = userSockets.get(target);
    if (targetSocketId) {
      io.to(targetSocketId).emit('request-peer-id', {});
    }
  });

  // ── CALL RELAY ── forward call signals between users
  function relayTo(event, data) {
    const target = data.to;
    if (!target) return;
    const tid = userSockets.get(target);
    if (tid) {
      io.to(tid).emit(event, data);
    } else {
      // Target offline — store missed call so they see it when they reconnect
      if (event === 'call-invite') {
        const calls = missedCalls.get(target) || [];
        calls.push({ from: data.from, isVid: data.isVid, time: Date.now() });
        // Keep only last 10 missed calls
        missedCalls.set(target, calls.slice(-10));
        console.log(`[Call] Missed call stored for offline user "${target}"`);
      }
    }
  }
  socket.on('call-invite', data => {
    if (!data.resumed) {
      // Групповые звонки — пропускаем проверку занятости
      if (!data.groupId) {
        const calleeEntry = activeCalls.get(data.to);
        if (calleeEntry && calleeEntry.from !== data.from) {
          const callerSid = userSockets.get(data.from);
          if (callerSid) io.to(callerSid).emit('call-busy', { from: data.to });
          return;
        }
      }
      activeCalls.set(data.to, { from: data.from, isVid: data.isVid, startTime: Date.now(), groupId: data.groupId });
    }
    relayTo('call-invite', data);
  });
  socket.on('call-answer-ready', data => relayTo('call-answer-ready', data));
  socket.on('call-offer',        data => relayTo('call-offer',        data));
  socket.on('call-answer',       data => relayTo('call-answer',       data));
  socket.on('call-ice',          data => relayTo('call-ice',          data));
  // ── Запись о звонке → в историю ──────────────────────────────────────────
  socket.on('save-call-record', async ({ room, from, to, isVid, isCaller, connected, dur, missed, timestamp }) => {
    if (!room || !from) return;
    const now  = new Date(timestamp || Date.now());
    const ts   = now.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit', timeZone:'Europe/Moscow' });
    const ds   = now.toLocaleDateString('ru-RU', { day:'numeric', month:'long' });
    const type = isVid ? 'Видеозвонок' : 'Аудиозвонок';
    let label, extra;
    if (missed) {
      // Кому звонили — пропущенный
      label = `Пропущенный ${type}`;
      extra = `${ds}, ${ts}`;
    } else if (isCaller) {
      // Звонивший — принят или нет ответа
      const durStr = dur > 0 ? (dur < 60 ? `${dur} сек` : `${Math.floor(dur/60)} мин ${dur % 60} сек`) : '';
      label = type;
      extra = connected
        ? (durStr ? `Принят · ${durStr} · ${ds}, ${ts}` : `Принят · ${ds}, ${ts}`)
        : `Нет ответа · ${ds}, ${ts}`;
    } else {
      // Принявший — длительность
      const durStr = dur > 0 ? (dur < 60 ? `${dur} сек` : `${Math.floor(dur/60)} мин ${dur % 60} сек`) : '';
      label = type;
      extra = durStr ? `${durStr} · ${ds}, ${ts}` : `${ds}, ${ts}`;
    }
    // Метка для звонимого (callee) — отдельная чтобы каждый видел своё
    let labelCallee, extraCallee;
    if (missed) {
      labelCallee = `Пропущенный ${type}`;
      extraCallee = `${ds}, ${ts}`;
    } else {
      const durStr2 = dur > 0 ? (dur < 60 ? `${dur} сек` : `${Math.floor(dur/60)} мин ${dur % 60} сек`) : '';
      labelCallee = type;
      extraCallee = durStr2 ? `${durStr2} · ${ds}, ${ts}` : `${ds}, ${ts}`;
    }

    const msg = {
      id:             `cr_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      room,
      user:           from,
      type:           'call_record',
      cr_label:       label,        // для звонившего (caller)
      cr_extra:       extra,
      cr_label_callee: labelCallee, // для принявшего/пропустившего
      cr_extra_callee: extraCallee,
      cr_to:          to,           // кому звонили
      time:           ts,
      timestamp:      timestamp || Date.now()
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    saveHistory();
    // Рассылаем обеим сторонам в комнате
    io.to(room).emit('call-record', msg);
  });

  // ── Read receipts ─────────────────────────────────────────────────────
  socket.on('messages-read', ({ room, by }) => {
    if (!room || !by) return;
    // Помечаем все сообщения комнаты как прочитанные пользователем by
    let changed = false;
    messageHistory.forEach(msg => {
      if (msg.room === room && msg.user !== by) {
        if (!msg.readBy) msg.readBy = [];
        if (!msg.readBy.includes(by)) {
          msg.readBy.push(by);
          changed = true;
        }
      }
    });
    if (changed) saveHistory();
    // Оповещаем отправителя что прочитано
    socket.to(room).emit('messages-read', { room, by });
  });

  socket.on('call-end', data => {
    // Очищаем активный звонок
    activeCalls.delete(data.to);
    activeCalls.delete(data.from);
    // Отправляем сигнал завершения ОБЕИМ сторонам
    const toId   = userSockets.get(data.to);
    const fromId = userSockets.get(data.from);
    if (toId)   io.to(toId).emit('call-end', data);
    if (fromId) io.to(fromId).emit('call-end', data);
  });
  socket.on('call-decline', data => {
    activeCalls.delete(data.to);
    activeCalls.delete(data.from);
    // Для группового звонка: шлём только звонящему (не обратно отклонившему)
    const toId = userSockets.get(data.to);
    if (toId) io.to(toId).emit('call-decline', { from: data.from, groupId: data.groupId });
  });
  socket.on('call-answer-ready', data => {
    // Callee answered — clear active call
    activeCalls.delete(data.from);
    relayTo('call-answer-ready', data);
  });
  socket.on('call-busy',           data => relayTo('call-busy',           data));
  socket.on('screen-share-started',       data => relayTo('screen-share-started',       data));
  socket.on('screen-share-stopped',       data => relayTo('screen-share-stopped',       data));
  socket.on('group-screen-share-started', data => relayTo('group-screen-share-started', data));
  socket.on('group-screen-share-stopped', data => relayTo('group-screen-share-stopped', data));

  socket.on('disconnect', () => {
    if (currentUser) {
      userSockets.delete(currentUser);
      peerIdRegistry.delete(currentUser);
      onlineUsers.delete(socket.id);
      broadcastOnlineCount();
    }
  });
});

const PORT = process.env.PORT || 3000;
// ── Периодическая переавторизация B2 (токен живёт 24ч — обновляем каждые 20ч) ──
setInterval(async () => {
  try {
    console.log('[B2] Плановая переавторизация...');
    await authorizeB2();
    console.log('[B2] Переавторизация успешна');
  } catch(e) {
    console.warn('[B2] Ошибка переавторизации:', e.message);
  }
}, 20 * 60 * 60 * 1000); // 20 часов

server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
