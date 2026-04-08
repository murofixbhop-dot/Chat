const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');
// nodemailer РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РґР»СЏ Gmail SMTP (Р·Р°РіСЂСѓР¶Р°РµС‚СЃСЏ РґРёРЅР°РјРёС‡РµСЃРєРё РІ sendRecoveryEmail)

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// PeerJS РЅРµ РЅСѓР¶РµРЅ вЂ” СЃРёРіРЅР°Р»РёРЅРі С‡РµСЂРµР· Socket.IO

// ========== РҐР РђРќРР›РР©Р• Р¤РђР™Р›РћР’ вЂ” РјСѓР»СЊС‚Рё-РїСЂРѕРІР°Р№РґРµСЂ ==========
// РџСЂРѕРІР°Р№РґРµСЂС‹ (РїРѕ РїСЂРёРѕСЂРёС‚РµС‚Сѓ, РїРµСЂРІС‹Р№ РЅР°СЃС‚СЂРѕРµРЅРЅС‹Р№ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ):
//
// 1. Supabase Storage вЂ” Р‘Р•Р— РљРђР РўР«, 1 GB Р±РµСЃРїР»Р°С‚РЅРѕ
//    Р РµРіРёСЃС‚СЂР°С†РёСЏ: supabase.com С‡РµСЂРµР· GitHub
//    SUPABASE_URL      = https://xxxx.supabase.co
//    SUPABASE_KEY      = service_role key (Settings в†’ API)
//    SUPABASE_BUCKET   = aura-files
//
// 2. Cloudflare R2 вЂ” РЅСѓР¶РЅР° РєР°СЂС‚Р°, 10 GB Р±РµСЃРїР»Р°С‚РЅРѕ
//    R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
//
// 3. Backblaze B2 вЂ” Р·Р°РїР°СЃРЅРѕР№
//    B2_ACCOUNT_ID, B2_APP_KEY, B2_BUCKET_NAME

// Supabase
const SB_URL    = (process.env.SUPABASE_URL || '').replace(/\/+$/, ''); // СѓР±РёСЂР°РµРј trailing slash
const SB_KEY    = process.env.SUPABASE_KEY;
const SB_BUCKET = process.env.SUPABASE_BUCKET || 'aura-files';
const USE_SB    = !!(SB_URL && SB_KEY);

async function sbUpload(fileName, buffer, contentType) {
  const url = `${SB_URL}/storage/v1/object/${SB_BUCKET}/${fileName}`;
  const resp = await axios.put(url, buffer, {
    headers: {
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type':  contentType || 'application/octet-stream',
      'x-upsert':      'true',
      'Cache-Control': 'max-age=3600',
    },
    maxContentLength: Infinity,
    maxBodyLength:    Infinity,
    timeout: 120000,
    validateStatus: s => s < 500,
  });
  if (resp.status >= 400) {
    throw new Error(`[SB] Upload failed ${resp.status}: ${JSON.stringify(resp.data)}`);
  }
}

function sbPublicUrl(fileName) {
  return `${SB_URL}/storage/v1/object/public/${SB_BUCKET}/${fileName}`;
}

async function sbDownload(fileName) {
  const url = sbPublicUrl(fileName);
  return { url, token: null };
}

async function sbReadJson(fileName) {
  try {
    const url = `${SB_URL}/storage/v1/object/${SB_BUCKET}/${fileName}`;
    const r = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${SB_KEY}` },
      timeout: 15000,
      validateStatus: s => s < 500,
    });
    if (r.status === 404 || r.status === 400) return null;
    if (r.status >= 400) throw new Error(`[SB] ReadJson ${r.status}`);
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  } catch(e) {
    if (e.response?.status === 404 || e.response?.status === 400) return null;
    if (e.message.includes('404') || e.message.includes('400')) return null;
    throw e;
  }
}

async function sbDelete(fileName) {
  try {
    await axios.delete(`${SB_URL}/storage/v1/object/${SB_BUCKET}/${fileName}`, {
      headers: { 'Authorization': `Bearer ${SB_KEY}` },
      timeout: 10000,
    });
  } catch(e) { /* ignore */ }
}

async function sbEnsureBucket() {
  try {
    const list = await axios.get(`${SB_URL}/storage/v1/bucket`, {
      headers: { 'Authorization': `Bearer ${SB_KEY}` },
      timeout: 10000,
    });
    const exists = list.data?.find(b => b.name === SB_BUCKET);
    if (!exists) {
      await axios.post(`${SB_URL}/storage/v1/bucket`, {
        id: SB_BUCKET, name: SB_BUCKET, public: true,
        file_size_limit: 52428800,
        allowed_mime_types: null,
      }, {
        headers: { 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      console.log(`[SB] вњ… Р‘Р°РєРµС‚ "${SB_BUCKET}" СЃРѕР·РґР°РЅ`);
    } else {
      if (!exists.public) {
        await axios.put(`${SB_URL}/storage/v1/bucket/${SB_BUCKET}`, {
          public: true, file_size_limit: 52428800,
        }, {
          headers: { 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
          timeout: 10000,
        });
        console.log(`[SB] вњ… Р‘Р°РєРµС‚ "${SB_BUCKET}" СЃРґРµР»Р°РЅ РїСѓР±Р»РёС‡РЅС‹Рј`);
      } else {
        console.log(`[SB] вњ… Р‘Р°РєРµС‚ "${SB_BUCKET}" РіРѕС‚РѕРІ`);
      }
    }
  } catch(e) {
    console.warn(`[SB] sbEnsureBucket: ${e.response?.data?.message || e.message}`);
  }
}

// Cloudflare R2
const R2_ENDPOINT  = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY= process.env.R2_ACCESS_KEY_ID;
const R2_SECRET    = process.env.R2_SECRET_KEY;
const R2_BUCKET    = process.env.R2_BUCKET_NAME;
const R2_PUBLIC    = process.env.R2_PUBLIC_URL;
const USE_R2       = !!(R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET && R2_BUCKET);

// Backblaze B2
// РћРґРёРЅ Р°РєРєР°СѓРЅС‚ = РѕРґРёРЅ Account ID + App Key
// Р”РІР° Р±Р°РєРµС‚Р°: РѕСЃРЅРѕРІРЅРѕР№ (РІРёРґРµРѕ + РєРІР°РґСЂР°С‚РёРєРё) Рё Р·Р°РїР°СЃРЅРѕР№ (С„РѕС‚Рѕ + Р°СѓРґРёРѕ + С„Р°Р№Р»С‹)
const B2_ACCOUNT_ID   = process.env.B2_ACCOUNT_ID;
const B2_APP_KEY      = process.env.B2_APP_KEY;
const B2_BUCKET_NAME  = process.env.B2_BUCKET_NAME;   // Р±Р°РєРµС‚ 1: РІРёРґРµРѕ, РєРІР°РґСЂР°С‚РёРєРё
const B2_BUCKET_NAME2 = process.env.B2_BUCKET_NAME2;  // Р±Р°РєРµС‚ 2: С„РѕС‚Рѕ, Р°СѓРґРёРѕ, С„Р°Р№Р»С‹
const USE_B2          = !!(B2_ACCOUNT_ID && B2_APP_KEY && B2_BUCKET_NAME);
const USE_B2_DUAL     = !!(USE_B2 && B2_BUCKET_NAME2); // РґРІР° Р±Р°РєРµС‚Р°

let storageReady = false;
let b2Auth = null;
let b2BucketId  = null;
let b2BucketId2 = null;
let B2_BUCKET_NAME_ACTIVE = B2_BUCKET_NAME;
// S3-СЃРѕРІРјРµСЃС‚РёРјС‹Р№ СЌРЅРґРїРѕРёРЅС‚ B2 (СЂР°Р±РѕС‚Р°РµС‚ СЃ accountId/appKey РєР°Рє AWS credentials)
// Р¤РѕСЂРјР°С‚: https://s3.{region}.backblazeb2.com
// region Р±РµСЂС‘Рј РёР· Endpoint Р±Р°РєРµС‚Р°: s3.us-east-005.backblazeb2.com
const B2_S3_REGION = process.env.B2_S3_REGION || 'us-east-005'; // РёР· СЃС‚СЂР°РЅРёС†С‹ Р±Р°РєРµС‚Р°
const B2_S3_ENDPOINT = 'https://s3.' + B2_S3_REGION + '.backblazeb2.com';

// в”Ђв”Ђ S3-РєР»РёРµРЅС‚ РґР»СЏ R2 (РёСЃРїРѕР»СЊР·СѓРµРј axios РЅР°РїСЂСЏРјСѓСЋ СЃ AWS Signature V4) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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

// в”Ђв”Ђ R2 РѕРїРµСЂР°С†РёРё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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
  // Р•СЃР»Рё РµСЃС‚СЊ РїСѓР±Р»РёС‡РЅС‹Р№ URL вЂ” РёСЃРїРѕР»СЊР·СѓРµРј РµРіРѕ РЅР°РїСЂСЏРјСѓСЋ (РЅРµ РЅСѓР¶РµРЅ auth)
  if (R2_PUBLIC) {
    return { url: `${R2_PUBLIC}/${encodeURIComponent(fileName)}`, token: null };
  }
  // РРЅР°С‡Рµ вЂ” РїРѕРґРїРёСЃР°РЅРЅС‹Р№ URL С‡РµСЂРµР· aws signature
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

// в”Ђв”Ђ B2 СЃРєР°С‡РёРІР°РЅРёРµ (СЂР°Р±РѕС‡РёР№ РјРµС‚РѕРґ: fileNamePrefix=С„Р°Р№Р», С‚РѕРєРµРЅ РІ URL) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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


// в”Ђв”Ђ B2 РѕРїРµСЂР°С†РёРё (Р·Р°РїР°СЃРЅРѕР№ РїСЂРѕРІР°Р№РґРµСЂ) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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
  if (!bucket) throw new Error(`Р‘Р°РєРµС‚ "${bucketName}" РЅРµ РЅР°Р№РґРµРЅ`);
  return bucket.bucketId;
}
// Р”РµР»Р°РµРј Р±Р°РєРµС‚ РїСѓР±Р»РёС‡РЅС‹Рј РґР»СЏ С‡С‚РµРЅРёСЏ (allPublic = СЃРєР°С‡РёРІР°РЅРёРµ Р±РµР· С‚РѕРєРµРЅР°)
async function b2SetBucketPublic(bucketId, bucketName) {
  try {
    await axios.post(
      b2Auth.apiUrl + '/b2api/v2/b2_update_bucket',
      { accountId: b2Auth.accountId, bucketId, bucketType: 'allPublic' },
      { headers: { Authorization: b2Auth.authorizationToken }, timeout: 10000 }
    );
    console.log('[B2] "' + bucketName + '" в†’ РїСѓР±Р»РёС‡РЅС‹Р№');
  } catch(e) {
    console.warn('[B2] РќРµ СѓРґР°Р»РѕСЃСЊ СЃРґРµР»Р°С‚СЊ "' + bucketName + '" РїСѓР±Р»РёС‡РЅС‹Рј:', e.response?.status, e.response?.data?.message || e.message);
  }
}

// РљСЌС€ download-С‚РѕРєРµРЅРѕРІ РїРѕ РёРјРµРЅРё Р±Р°РєРµС‚Р° { bucketName -> { token, expires } }
const b2DownloadTokens = new Map();

async function getB2DownloadToken(bucketId, bucketName) {
  const cached = b2DownloadTokens.get(bucketName);
  if (cached && cached.expires > Date.now() + 600000) return cached.token;

  try {
    const r = await axios.post(
      b2Auth.apiUrl + '/b2api/v2/b2_get_download_authorization',
      {
        bucketId,
        fileNamePrefix: '',      // РїСѓСЃС‚РѕР№ = РґРѕСЃС‚СѓРї РєРѕ РІСЃРµРј С„Р°Р№Р»Р°Рј Р±Р°РєРµС‚Р°
        validDurationInSeconds: 604800  // 7 РґРЅРµР№
      },
      { headers: { Authorization: b2Auth.authorizationToken }, timeout: 10000 }
    );
    const token = r.data.authorizationToken;
    // РџСЂРѕРІРµСЂСЏРµРј С‡С‚Рѕ РїРѕР»СѓС‡РёР»Рё Р”Р РЈР“РћР™ С‚РѕРєРµРЅ (РЅРµ РјР°СЃС‚РµСЂ)
    if (token === b2Auth.authorizationToken) {
      console.warn('[B2] Download-С‚РѕРєРµРЅ СЃРѕРІРїР°РґР°РµС‚ СЃ РјР°СЃС‚РµСЂ-С‚РѕРєРµРЅРѕРј вЂ” РІРѕР·РјРѕР¶РЅР° РїСЂРѕР±Р»РµРјР° СЃ РєР»СЋС‡РѕРј');
    }
    b2DownloadTokens.set(bucketName, { token, expires: Date.now() + 604800000 });
    console.log('[B2] Download-С‚РѕРєРµРЅ РґР»СЏ "' + bucketName + '" РїРѕР»СѓС‡РµРЅ, РґР»РёРЅР°:', token.length);
    return token;
  } catch(e) {
    console.warn('[B2] РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ download-С‚РѕРєРµРЅР° РґР»СЏ "' + bucketName + '":', e.response?.status, e.response?.data?.message || e.message);
    return b2Auth.authorizationToken;
  }
}

async function reAuthB2() {
  b2Auth     = await authorizeB2();
  b2BucketId = await getBucketId(B2_BUCKET_NAME);
  // РћС‡РёС‰Р°РµРј РєСЌС€ С‚РѕРєРµРЅРѕРІ РїСЂРё РїРµСЂРµР°РІС‚РѕСЂРёР·Р°С†РёРё
  b2DownloadTokens.clear();
  if (USE_B2_DUAL) {
    try {
      b2BucketId2 = await getBucketId(B2_BUCKET_NAME2);
      console.log(`[B2] Р‘Р°РєРµС‚ 2 "${B2_BUCKET_NAME2}": OK`);
    } catch(e) {
      console.warn('[B2] Р‘Р°РєРµС‚ 2 РЅРµРґРѕСЃС‚СѓРїРµРЅ:', e.message);
    }
  }
  console.log('[B2] РџРµСЂРµР°РІС‚РѕСЂРёР·Р°С†РёСЏ СѓСЃРїРµС€РЅР°');
}

// в”Ђв”Ђ Unified Storage API (СЂР°Р±РѕС‚Р°РµС‚ СЃ R2 Рё B2) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// РћРїСЂРµРґРµР»СЏРµРј Р±Р°РєРµС‚ РїРѕ С‚РёРїСѓ С„Р°Р№Р»Р°:
// Р‘Р°РєРµС‚ 1 (B2_BUCKET_NAME)  в†’ videos/, squares/ (РІРёРґРµРѕ Рё РєРІР°РґСЂР°С‚РёРєРё)
// Р‘Р°РєРµС‚ 2 (B2_BUCKET_NAME2) в†’ photos/, audio/, files/ (С„РѕС‚Рѕ, Р°СѓРґРёРѕ, С„Р°Р№Р»С‹)
// Р’С‹Р±РѕСЂ Р±Р°РєРµС‚Р° РїРѕ Р РђР—РњР•Р РЈ С„Р°Р№Р»Р°:
// Р‘Р°РєРµС‚ 1 (B2_BUCKET_NAME):  РјР°Р»РµРЅСЊРєРёРµ С„Р°Р№Р»С‹ в‰¤ 5 MB (С„РѕС‚Рѕ, Р°СѓРґРёРѕ, json)
// Р‘Р°РєРµС‚ 2 (B2_BUCKET_NAME2): Р±РѕР»СЊС€РёРµ С„Р°Р№Р»С‹ > 5 MB (РІРёРґРµРѕ, РєРІР°РґСЂР°С‚С‹)
const B2_SMALL_LIMIT = 5 * 1024 * 1024; // 5 MB

function b2GetBucket(fileName, fileSize) {
  // РЎРёСЃС‚РµРјРЅС‹Рµ С„Р°Р№Р»С‹ РІСЃРµРіРґР° РІ Р±Р°РєРµС‚Рµ 1
  if (fileName === 'users.json' || fileName === 'history.json') {
    return { bucketId: b2BucketId, bucketName: B2_BUCKET_NAME };
  }
  if (!USE_B2_DUAL || !b2BucketId2) {
    return { bucketId: b2BucketId, bucketName: B2_BUCKET_NAME };
  }
  // Р•СЃР»Рё СЂР°Р·РјРµСЂ РёР·РІРµСЃС‚РµРЅ вЂ” РїРѕ СЂР°Р·РјРµСЂСѓ
  if (fileSize !== undefined) {
    return fileSize > B2_SMALL_LIMIT
      ? { bucketId: b2BucketId2, bucketName: B2_BUCKET_NAME2 }
      : { bucketId: b2BucketId, bucketName: B2_BUCKET_NAME };
  }
  // Р•СЃР»Рё СЂР°Р·РјРµСЂ РЅРµРёР·РІРµСЃС‚РµРЅ вЂ” РїРѕ СЂР°СЃС€РёСЂРµРЅРёСЋ
  const f = fileName.toLowerCase();
  const isLarge = f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mov')
    || f.endsWith('.avi') || f.endsWith('.mkv') || f.startsWith('videos/') || f.startsWith('squares/');
  return isLarge
    ? { bucketId: b2BucketId2, bucketName: B2_BUCKET_NAME2 }
    : { bucketId: b2BucketId, bucketName: B2_BUCKET_NAME };
}
// РђР»РёР°СЃ РґР»СЏ СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚Рё
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
  // B2 upload вЂ” РёСЃРїРѕР»СЊР·СѓРµРј S3 API
  if (!b2Auth) await reAuthB2();
  const { bucketName } = b2GetBucketForFile(fileName);
  await b2S3Upload(bucketName, fileName, buffer, contentType);
  console.log(`[B2] Р—Р°РіСЂСѓР¶РµРЅРѕ "${fileName}" в†’ Р±Р°РєРµС‚ "${bucketName}"`);
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

  // РћРїСЂРµРґРµР»СЏРµРј "РїСЂР°РІРёР»СЊРЅС‹Р№" Р±Р°РєРµС‚ РїРѕ РёРјРµРЅРё/СЂР°Р·РјРµСЂСѓ
  const { bucketId, bucketName } = b2GetBucketForFile(fileName);

  // РџСЂРѕР±СѓРµРј СЃРЅР°С‡Р°Р»Р° РїСЂР°РІРёР»СЊРЅС‹Р№ Р±Р°РєРµС‚
  const url1 = await b2GetDownloadUrl(bucketId, bucketName, fileName);
  try {
    // Р‘С‹СЃС‚СЂР°СЏ HEAD РїСЂРѕРІРµСЂРєР° вЂ” СЃСѓС‰РµСЃС‚РІСѓРµС‚ Р»Рё С„Р°Р№Р» РІ СЌС‚РѕРј Р±Р°РєРµС‚Рµ
    await axios.head(url1, { timeout: 5000 });
    return { url: url1, token: null };
  } catch(e1) {
    // Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ вЂ” РїСЂРѕР±СѓРµРј РІС‚РѕСЂРѕР№ Р±Р°РєРµС‚ РµСЃР»Рё РµСЃС‚СЊ
    if (USE_B2_DUAL && b2BucketId2) {
      const otherBucketId   = bucketId === b2BucketId ? b2BucketId2 : b2BucketId;
      const otherBucketName = bucketId === b2BucketId ? B2_BUCKET_NAME2 : B2_BUCKET_NAME;
      const url2 = await b2GetDownloadUrl(otherBucketId, otherBucketName, fileName);
      return { url: url2, token: null };
    }
    // РћРґРёРЅ Р±Р°РєРµС‚ вЂ” РІРѕР·РІСЂР°С‰Р°РµРј РєР°Рє РµСЃС‚СЊ (РїСѓСЃС‚СЊ /api/dl СЃР°Рј РѕР±СЂР°Р±РѕС‚Р°РµС‚ РѕС€РёР±РєСѓ)
    return { url: url1, token: null };
  }
}

async function initStorage() {
  if (USE_SB) {
    console.log(`вњ… РҐСЂР°РЅРёР»РёС‰Рµ: Supabase Storage (Р±Р°РєРµС‚: ${SB_BUCKET})`);
    await sbEnsureBucket();
    storageReady = true;
    return;
  }
  if (USE_R2) {
    console.log(`вњ… РҐСЂР°РЅРёР»РёС‰Рµ: Cloudflare R2 (Р±Р°РєРµС‚: ${R2_BUCKET})`);
    storageReady = true;
    return;
  }
  if (USE_B2) {
    console.log('рџ”„ РђРІС‚РѕСЂРёР·Р°С†РёСЏ РІ Backblaze B2...');
    b2Auth     = await authorizeB2();
    b2BucketId = await getBucketId(B2_BUCKET_NAME);
    B2_BUCKET_NAME_ACTIVE = B2_BUCKET_NAME;
    console.log(`вњ… B2 Р±Р°РєРµС‚ 1: "${B2_BUCKET_NAME}" (РІРёРґРµРѕ, РєРІР°РґСЂР°С‚С‹)`);
    // РџРѕР»СѓС‡Р°РµРј download-С‚РѕРєРµРЅ РґР»СЏ Р±Р°РєРµС‚Р° 1
    await getB2DownloadToken(b2BucketId, B2_BUCKET_NAME);
    if (USE_B2_DUAL) {
      try {
        b2BucketId2 = await getBucketId(B2_BUCKET_NAME2);
        console.log(`вњ… B2 Р±Р°РєРµС‚ 2: "${B2_BUCKET_NAME2}" (С„РѕС‚Рѕ, Р°СѓРґРёРѕ, С„Р°Р№Р»С‹)`);
        await getB2DownloadToken(b2BucketId2, B2_BUCKET_NAME2);
      } catch(e) {
        console.warn(`вљ пёЏ  B2 Р±Р°РєРµС‚ 2 РЅРµРґРѕСЃС‚СѓРїРµРЅ: ${e.message}`);
      }
    }
    storageReady = true;
    return;
  }
  throw new Error('РќРµ РЅР°СЃС‚СЂРѕРµРЅРѕ РЅРё РѕРґРЅРѕ С…СЂР°РЅРёР»РёС‰Рµ (R2 РёР»Рё B2)');
}

// ========== РЈРџР РђР’Р›Р•РќРР• РџРћР›Р¬Р—РћР’РђРўР•Р›РЇРњР ==========
const USERS_FILE = 'users.json';
let users = new Map(); // username -> { nickname, avatar, theme, friends, friendRequests, groups, recoveryEmail }
let recoveryCodes     = new Map(); // username -> { code, expiry, email }
let emailVerifyCodes  = new Map(); // username -> { code, expiry, pendingEmail }

// в”Ђв”Ђ EMAIL С‡РµСЂРµР· Resend (resend.com) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// Р‘РµСЃРїР»Р°С‚РЅРѕ: 3000 РїРёСЃРµРј/РјРµСЃ, СЂРµРіРёСЃС‚СЂР°С†РёСЏ Р·Р° 1 РјРёРЅ РЅР° https://resend.com
// РЈРєР°Р¶Рё РєР»СЋС‡ РІ .env: RESEND_API_KEY=re_xxxxxxxxxxxx
// Р РїРѕРґС‚РІРµСЂР¶РґС‘РЅРЅС‹Р№ РґРѕРјРµРЅ: RESEND_FROM=noreply@С‚РІРѕР№-РґРѕРјРµРЅ.com
// Р•СЃР»Рё РґРѕРјРµРЅР° РЅРµС‚ вЂ” РёСЃРїРѕР»СЊР·СѓР№: onboarding@resend.dev (С‚РѕР»СЊРєРѕ РґР»СЏ С‚РµСЃС‚Р°)

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
  <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:14px">Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёРµ РїР°СЂРѕР»СЏ</p>
</td></tr>
<tr><td style="padding:36px 40px">
  <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1a1a2e">РўРІРѕР№ РєРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ</p>
  <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6">РСЃРїРѕР»СЊР·СѓР№ СЌС‚РѕС‚ РєРѕРґ РґР»СЏ СЃР±СЂРѕСЃР° РїР°СЂРѕР»СЏ. Р”РµР№СЃС‚РІСѓРµС‚ <strong style="color:#374151">15 РјРёРЅСѓС‚</strong>.</p>
  <div style="background:#f8f7ff;border:2px solid #e0e0ff;border-radius:14px;padding:28px 20px;text-align:center;margin-bottom:28px">
    <div style="font-size:42px;font-weight:800;letter-spacing:14px;color:#6366f1;font-family:monospace;padding-left:14px">${code}</div>
  </div>
  <p style="margin:0;font-size:13px;color:#9ca3af">Р•СЃР»Рё С‚С‹ РЅРµ Р·Р°РїСЂР°С€РёРІР°Р»(Р°) СЃР±СЂРѕСЃ вЂ” РїСЂРѕСЃС‚Рѕ РїСЂРѕРёРіРЅРѕСЂРёСЂСѓР№ СЌС‚Рѕ РїРёСЃСЊРјРѕ.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f0f0f0;text-align:center">
  <p style="margin:0;font-size:12px;color:#9ca3af">В© 2026 Aura Messenger</p>
</td></tr>
</table></td></tr></table>
</body></html>`;

  // в”Ђв”Ђ РЎРїРѕСЃРѕР± 1: Brevo (ex-Sendinblue) вЂ” Р±РµСЃРїР»Р°С‚РЅРѕ 300 РїРёСЃРµРј/РґРµРЅСЊ, РґРѕРјРµРЅ РЅРµ РЅСѓР¶РµРЅ
  const BREVO_FROM = process.env.BREVO_FROM; // С‚РІРѕР№ email РёР· Brevo Р°РєРєР°СѓРЅС‚Р°

  if (BREVO_KEY) {
    if (!BREVO_FROM) {
      console.error('рџ“§ BREVO_FROM РЅРµ Р·Р°РґР°РЅ РІ .env! РЈРєР°Р¶Рё email СЃ РєРѕС‚РѕСЂС‹Рј СЂРµРіР°Р»СЃСЏ РІ Brevo.');
      throw new Error('BREVO_FROM РЅРµ Р·Р°РґР°РЅ');
    }
    try {
      const resp = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender:  { name: 'Aura Messenger', email: BREVO_FROM },
        to:      [{ email: to }],
        subject: 'РљРѕРґ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ вЂ” Aura Messenger',
        htmlContent: html,
        textContent: `РљРѕРґ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ Aura Messenger: ${code}\nР”РµР№СЃС‚РІСѓРµС‚ 15 РјРёРЅСѓС‚.`,
      }, {
        headers: {
          'api-key':      BREVO_KEY,
          'Content-Type': 'application/json',
          'Accept':       'application/json',
        },
        timeout: 10000,
      });
      console.log('рџ“§ Email РѕС‚РїСЂР°РІР»РµРЅ С‡РµСЂРµР· Brevo, messageId:', resp.data?.messageId);
      return;
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      console.error('рџ“§ Brevo РѕС€РёР±РєР°:', msg);
      throw new Error(msg);
    }
  }

  // в”Ђв”Ђ РЎРїРѕСЃРѕР± 2: Gmail SMTP (Р·Р°РїР°СЃРЅРѕР№)
  if (GMAIL_USER && GMAIL_PASS) {
    try {
      const nodemailer = require('nodemailer');
      const t = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_PASS } });
      await t.sendMail({ from: `"Aura Messenger" <${GMAIL_USER}>`, to, subject: 'РљРѕРґ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ вЂ” Aura Messenger', html, text: `РљРѕРґ: ${code}. Р”РµР№СЃС‚РІСѓРµС‚ 15 РјРёРЅСѓС‚.` });
      console.log('рџ“§ Email РѕС‚РїСЂР°РІР»РµРЅ С‡РµСЂРµР· Gmail:', to);
      return;
    } catch (err) {
      console.error('рџ“§ Gmail РѕС€РёР±РєР°:', err.message);
      throw new Error(err.message);
    }
  }

  // в”Ђв”Ђ Dev СЂРµР¶РёРј вЂ” РєРѕРґ РІ РєРѕРЅСЃРѕР»Рё
  console.log(`\nрџ“§ в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ`);
  console.log(`рџ“§ Email РЅРµ РЅР°СЃС‚СЂРѕРµРЅ. РљРѕРґ РґР»СЏ ${to}: [ ${code} ]`);
  console.log(`рџ“§ Р”РѕР±Р°РІСЊ РІ .env: BREVO_API_KEY=xkeysib-xxx`);
  console.log(`рџ“§ в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ\n`);
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
  <p style="margin:6px 0 0;color:rgba(255,255,255,.75);font-size:14px">РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ email</p>
</td></tr>
<tr><td style="padding:36px 40px">
  <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1a1a2e">РџРѕРґС‚РІРµСЂРґРё СЃРІРѕР№ email</p>
  <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6">Р’РІРµРґРё СЌС‚РѕС‚ РєРѕРґ РІ РїСЂРёР»РѕР¶РµРЅРёРё. Р”РµР№СЃС‚РІСѓРµС‚ <strong style="color:#374151">15 РјРёРЅСѓС‚</strong>.</p>
  <div style="background:#f8f7ff;border:2px solid #e0e0ff;border-radius:14px;padding:28px 20px;text-align:center;margin-bottom:28px">
    <div style="font-size:42px;font-weight:800;letter-spacing:14px;color:#6366f1;font-family:monospace;padding-left:14px">${code}</div>
  </div>
  <p style="margin:0;font-size:13px;color:#9ca3af">Р•СЃР»Рё С‚С‹ РЅРµ РґРѕР±Р°РІР»СЏР»(Р°) СЌС‚РѕС‚ email вЂ” РїСЂРѕСЃС‚Рѕ РїСЂРѕРёРіРЅРѕСЂРёСЂСѓР№ РїРёСЃСЊРјРѕ.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f0f0f0;text-align:center">
  <p style="margin:0;font-size:12px;color:#9ca3af">В© 2026 Aura Messenger</p>
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
      subject:     'РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ email вЂ” Aura Messenger',
      htmlContent: html,
      textContent: `РљРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ email Aura: ${code}\nР”РµР№СЃС‚РІСѓРµС‚ 15 РјРёРЅСѓС‚.`,
    }, {
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    console.log('рџ“§ Verify email РѕС‚РїСЂР°РІР»РµРЅ С‡РµСЂРµР· Brevo:', resp.data?.messageId);
    return;
  }
  if (GMAIL_USER && GMAIL_PASS) {
    const nodemailer = require('nodemailer');
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_PASS } });
    await t.sendMail({ from: `"Aura Messenger" <${GMAIL_USER}>`, to, subject: 'РџРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ email вЂ” Aura Messenger', html, text: `РљРѕРґ: ${code}` });
    console.log('рџ“§ Verify email РѕС‚РїСЂР°РІР»РµРЅ С‡РµСЂРµР· Gmail:', to);
    return;
  }
  console.log(`рџ“§ [Dev] РљРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ РґР»СЏ ${to}: [ ${code} ]`);
}

async function loadUsers() {
  try {
    if (USE_SB) {
      const data = await sbReadJson(USERS_FILE);
      if (data && typeof data === 'object') {
        users = new Map(Object.entries(data));
        console.log(`рџ‘Ґ Р—Р°РіСЂСѓР¶РµРЅРѕ ${users.size} РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№`);
      } else {
        console.log('рџ“Ѓ users.json РЅРµ РЅР°Р№РґРµРЅ вЂ” РЅР°С‡РёРЅР°РµРј РїСѓСЃС‚С‹РјРё');
      }
      return;
    }
    if (!b2Auth) await reAuthB2();
    const { bucketName } = b2GetBucketForFile(USERS_FILE);
    const text = await b2S3Download(bucketName, USERS_FILE);
    const data = JSON.parse(text);
    if (data && typeof data === 'object') {
      users = new Map(Object.entries(data));
      console.log(`рџ‘Ґ Р—Р°РіСЂСѓР¶РµРЅРѕ ${users.size} РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№`);
    }
  } catch (err) {
    console.log('рџ“Ѓ users.json РЅРµ РЅР°Р№РґРµРЅ вЂ” РЅР°С‡РёРЅР°РµРј РїСѓСЃС‚С‹РјРё');
  }
}

async function saveUsers() {
  try {
    const usersObj = Object.fromEntries(users);
    const jsonBuffer = Buffer.from(JSON.stringify(usersObj, null, 2), 'utf-8');
    if (USE_SB) {
      await sbUpload(USERS_FILE, jsonBuffer, 'application/json');
    } else {
      await storageUpload(USERS_FILE, jsonBuffer, 'application/json');
    }
    console.log('рџ’ѕ РџРѕР»СЊР·РѕРІР°С‚РµР»Рё СЃРѕС…СЂР°РЅРµРЅС‹');
  } catch (err) {
    console.error('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№:', err.message);
    if (!saveUsers._retry) {
      saveUsers._retry = true;
      setTimeout(() => { saveUsers._retry = false; saveUsers(); }, 10000);
    }
  }
}

// ========== Р—РђР“Р РЈР—РљРђ Р¤РђР™Р›РћР’ ==========
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.static('public'));

// в”Ђв”Ђ РџСЂРѕРєСЃРё РґР»СЏ СЃРєР°С‡РёРІР°РЅРёСЏ С„Р°Р№Р»РѕРІ СЃ B2 в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// РЎС‚СЂРёРјРёРј С„Р°Р№Р» С‡РµСЂРµР· СЃРµСЂРІРµСЂ вЂ” Р±СЂР°СѓР·РµСЂ РЅРµ РёРґС‘С‚ РЅР° B2 РЅР°РїСЂСЏРјСѓСЋ (РЅРµС‚ CORS РїСЂРѕР±Р»РµРј)
app.get('/api/dl', async (req, res) => {
  const rawF = req.query.f;
  if (!rawF) return res.status(400).send('Missing file param');

  // РџРѕРґРґРµСЂР¶РёРІР°РµРј Рё РєРѕСЂРѕС‚РєРёР№ РїСѓС‚СЊ "photos/file.jpg" Рё РїРѕР»РЅС‹Р№ B2 URL
  let fileName = rawF;
  const urlMatch = rawF.match(/\/file\/[^/]+\/(.+?)(\?|$)/);
  if (urlMatch) fileName = urlMatch[1];
  fileName = decodeURIComponent(fileName);

  try {
    const dl = await storageDownload(fileName);
    // Supabase Рё R2 СЃ РїСѓР±Р»РёС‡РЅС‹Рј URL вЂ” СЂРµРґРёСЂРµРєС‚РёРј РЅР°РїСЂСЏРјСѓСЋ
    if (USE_SB || (USE_R2 && R2_PUBLIC)) return res.redirect(302, dl.url);
    const dlH = dl.authHeader ? { Authorization: dl.authHeader, ...(dl.extraHeaders||{}) } : dl.token ? { Authorization: dl.token } : {};
    const b2Response = await axios.get(dl.url, { responseType:'stream', timeout:30000, headers: { ...dlH, ...(req.headers.range?{Range:req.headers.range}:{}) } });

    // РџСЂРѕР±СЂР°СЃС‹РІР°РµРј Р·Р°РіРѕР»РѕРІРєРё РѕС‚ B2
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

    // Р”Р»СЏ СЃРєР°С‡РёРІР°РЅРёСЏ С„Р°Р№Р»РѕРІ (РЅРµ РјРµРґРёР°) вЂ” СЃС‚Р°РІРёРј download Р·Р°РіРѕР»РѕРІРѕРє
    const isMedia = /^(image|video|audio)\//.test(ct);
    if (!isMedia && !cd) {
      const fname = fileName.split('/').pop().replace(/^\d+-/, '');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);
    }

    b2Response.data.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      const status = err.response?.status;
      console.error('[dl proxy] РћС€РёР±РєР°:', err.message, 'status:', status);
      // РџСЂРё 403 вЂ” РїСЂРѕР±СѓРµРј РїРµСЂРµР°РІС‚РѕСЂРёР·РѕРІР°С‚СЊСЃСЏ
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
      res.status(500).send('РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ С„Р°Р№Р»');
    }
  }
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Р¤Р°Р№Р» РЅРµ Р·Р°РіСЂСѓР¶РµРЅ' });

    // Р•СЃР»Рё Р±СЂР°СѓР·РµСЂ РїСЂРёСЃР»Р°Р» octet-stream вЂ” РѕРїСЂРµРґРµР»СЏРµРј С‚РёРї РїРѕ СЂР°СЃС€РёСЂРµРЅРёСЋ С„Р°Р№Р»Р°
    let mimeType = req.file.mimetype;
    const _ext = (req.file.originalname || '').split('.').pop().toLowerCase();
    if (!mimeType || mimeType === 'application/octet-stream') {
      const _M = { mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',avi:'video/x-msvideo',mkv:'video/x-matroska',flv:'video/x-flv',wmv:'video/x-ms-wmv',m4v:'video/mp4',ogv:'video/ogg','3gp':'video/3gpp',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',avif:'image/avif',heic:'image/heic',heif:'image/heif',svg:'image/svg+xml',bmp:'image/bmp',tif:'image/tiff',tiff:'image/tiff',ico:'image/x-icon',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',flac:'audio/flac',aac:'audio/aac',m4a:'audio/mp4',opus:'audio/opus',wma:'audio/x-ms-wma' };
      mimeType = _M[_ext] || mimeType;
    }
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
      ? `${SB_URL}/storage/v1/object/public/${SB_BUCKET}/${fileName.split('/').map(encodeURIComponent).join('/')}`
      : (USE_R2 && R2_PUBLIC) ? `${R2_PUBLIC}/${encodeURIComponent(fileName)}`
      : '/api/dl?f=' + encodeURIComponent(fileName);
    res.json({ success: true, url: proxyUrl, type: fileType, name: req.file.originalname });

  } catch (error) {
    console.error('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё:', error.response?.data || error.message);
    res.status(500).json({ error: 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё С„Р°Р№Р»Р°' });
  }
});

// ========== ICE SERVERS (РґРёРЅР°РјРёС‡РµСЃРєРёРµ TURN credentials) ==========
// в”Ђв”Ђ Metered.ca webhook (РЅСѓР¶РµРЅ РґР»СЏ СЃРѕР·РґР°РЅРёСЏ РїСЂРѕРµРєС‚Р° РІ Metered) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/metered-webhook', (req, res) => {
  console.log('[Metered webhook]', req.body);
  res.json({ received: true });
});
app.get('/api/metered-webhook', (req, res) => {
  res.json({ status: 'ok', service: 'Aura Metered Webhook' });
});

// в”Ђв”Ђ ICE/TURN СЃРµСЂРІРµСЂС‹ вЂ” РїРѕРґРґРµСЂР¶РєР° Twilio, Metered, СЃС‚Р°С‚РёС‡РЅС‹Р№ fallback в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// Р”РѕР±Р°РІСЊС‚Рµ РІ .env РЅР° Render:
//   METERED_API_KEY  вЂ” Р±РµСЃРїР»Р°С‚РЅРѕ 50GB/РјРµСЃ: dashboard.metered.ca
//   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN вЂ” Р±РµСЃРїР»Р°С‚РЅС‹Р№ С‚СЂРёР°Р» СЃ TURN
app.get('/api/ice-servers', async (req, res) => {
  const METERED_KEY = process.env.METERED_API_KEY;
  const TWILIO_SID  = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;

  // РџРѕРїС‹С‚РєР° 1: Twilio Network Traversal Service (СЃР°РјС‹Р№ РЅР°РґС‘Р¶РЅС‹Р№ TURN)
  if (TWILIO_SID && TWILIO_AUTH) {
    try {
      const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64');
      const r = await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Tokens.json`,
        null,
        { headers:{ Authorization:`Basic ${auth}` }, timeout:5000 }
      );
      if (r.data?.ice_servers?.length) {
        console.log('[ICE] Twilio TURN СЃРµСЂРІРµСЂС‹ РїРѕР»СѓС‡РµРЅС‹:', r.data.ice_servers.length);
        return res.json(r.data.ice_servers);
      }
    } catch(e) { console.log('[ICE] Twilio РЅРµРґРѕСЃС‚СѓРїРµРЅ:', e.message); }
  }

  // РџРѕРїС‹С‚РєР° 2: Metered.ca
  if (METERED_KEY) {
    try {
      const r = await axios.get(
        `https://aura.metered.live/api/v1/turn/credentials?apiKey=${METERED_KEY}`,
        { timeout:5000 }
      );
      if (Array.isArray(r.data) && r.data.length) {
        console.log('[ICE] Metered TURN СЃРµСЂРІРµСЂС‹ РїРѕР»СѓС‡РµРЅС‹:', r.data.length);
        return res.json(r.data);
      }
    } catch(e) { console.log('[ICE] Metered РЅРµРґРѕСЃС‚СѓРїРµРЅ:', e.message); }
  }

  // Fallback: РјР°РєСЃРёРјР°Р»СЊРЅРѕ СЂР°СЃС€РёСЂРµРЅРЅС‹Р№ СЃРїРёСЃРѕРє СЃРµСЂРІРµСЂРѕРІ (UDP + TCP + TLS)
  res.json([
    // в”Ђв”Ђ STUN в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    // в”Ђв”Ђ openrelay (РІСЃРµ РїРѕСЂС‚С‹ Рё С‚СЂР°РЅСЃРїРѕСЂС‚С‹) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:3478',              username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443',              username: 'openrelayproject', credential: 'openrelayproject' },
    // в”Ђв”Ђ freeturn (UDP + TCP + TLS) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:freeturn.net:3478',                      username: 'free', credential: 'free' },
    { urls: 'turn:freeturn.net:5349?transport=tcp',        username: 'free', credential: 'free' },
    { urls: 'turns:freeturn.tel:5349',                     username: 'free', credential: 'free' },
    // в”Ђв”Ђ numb.viagenie.ca в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:numb.viagenie.ca',                       username: 'webrtc@live.com', credential: 'muazkh' },
    { urls: 'turn:numb.viagenie.ca?transport=tcp',         username: 'webrtc@live.com', credential: 'muazkh' },
    // в”Ђв”Ђ expressrturn (Р±РµСЃРїР»Р°С‚РЅС‹Р№, РЅР°РґС‘Р¶РЅС‹Р№) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:turn.anyfirewall.com:443?transport=tcp', username: 'webrtc', credential: 'webrtc' },
    // в”Ђв”Ђ icetest.info в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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
    // в”Ђв”Ђ cloudflare TURN (РѕС‡РµРЅСЊ РЅР°РґС‘Р¶РЅС‹Р№) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:turn.cloudflare.com:3478',               username: 'cloudflare',  credential: 'cloudflare2024' },
    { urls: 'turn:turn.cloudflare.com:443?transport=tcp',  username: 'cloudflare',  credential: 'cloudflare2024' },
    // в”Ђв”Ђ xirsys lite (Р±РµСЃРїР»Р°С‚РЅС‹Р№ tier) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'stun:ss-turn1.xirsys.com' },
    { urls: 'turn:ss-turn1.xirsys.com:80',                 username: 'aura',        credential: 'aura2024' },
    { urls: 'turn:ss-turn1.xirsys.com:3478',               username: 'aura',        credential: 'aura2024' },
    { urls: 'turn:ss-turn2.xirsys.com:443?transport=tcp',  username: 'aura',        credential: 'aura2024' },
    // в”Ђв”Ђ stunserver.stunprotocol.org в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'stun:stunserver.stunprotocol.org:3478' },
    // в”Ђв”Ђ iphone-stun (Apple) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'stun:stun.1und1.de:3478' },
    { urls: 'stun:stun.freeswitch.org:3478' },
    { urls: 'stun:stun.voipgate.com:3478' },
    { urls: 'stun:stun.counterpath.net:3478' },
    // в”Ђв”Ђ Metered public в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:a.relay.metered.ca:80',                  username: 'e8dd65f2619f30987d4b5d26', credential: 'uMuzmAi0GCQw5ypo' },
    { urls: 'turn:a.relay.metered.ca:80?transport=tcp',    username: 'e8dd65f2619f30987d4b5d26', credential: 'uMuzmAi0GCQw5ypo' },
    { urls: 'turn:a.relay.metered.ca:443',                 username: 'e8dd65f2619f30987d4b5d26', credential: 'uMuzmAi0GCQw5ypo' },
    { urls: 'turns:a.relay.metered.ca:443?transport=tcp',  username: 'e8dd65f2619f30987d4b5d26', credential: 'uMuzmAi0GCQw5ypo' },

    // в”Ђв”Ђ Xirsys global network в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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

    // в”Ђв”Ђ expressturn (free TURN) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:relay1.expressturn.com:3478',             username: 'efQZ5ZJ9WFF4J0GFSD', credential: 'q5bxEFR0b4eFpj3j' },
    { urls: 'turn:relay1.expressturn.com:3480',             username: 'efQZ5ZJ9WFF4J0GFSD', credential: 'q5bxEFR0b4eFpj3j' },

    // в”Ђв”Ђ twilio global edge (public stun) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:regional.stun.twilio.com:3478' },

    // в”Ђв”Ђ coturn public в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'stun:turn.matrix.org' },
    { urls: 'turn:turn.matrix.org',                         username: 'aura', credential: 'aura' },

    // в”Ђв”Ђ Mozilla public STUN в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'stun:stun.services.mozilla.com:3478' },

    // в”Ђв”Ђ openrelay extra ports в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:openrelay.metered.ca:80?transport=tcp',   username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },

    // в”Ђв”Ђ icetest & misc в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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

    // в”Ђв”Ђ Global public STUN pool в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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

    // в”Ђв”Ђ Extra TURN via open credentials (no traffic limit) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:relay.backups.cz',                        username: 'webrtc', credential: 'webrtc' },
    { urls: 'turn:relay.backups.cz:443?transport=tcp',      username: 'webrtc', credential: 'webrtc' },
    { urls: 'turn:turn.bistri.com:80',                      username: 'homeo',  credential: 'homeo' },
    { urls: 'turn:turn.bistri.com:443',                     username: 'homeo',  credential: 'homeo' },
    { urls: 'turn:webrtc.cheap:3478',                       username: 'free',   credential: 'free' },
  ]);
});



app.use(express.json());

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
//  AI Р§РђРў вЂ” Mistral СЃ РёРЅСЃС‚СЂСѓРјРµРЅС‚Р°РјРё, РїР°РјСЏС‚СЊСЋ С„Р°Р№Р»РѕРІ Рё РїСЂРѕСЃРјРѕС‚СЂРѕРј РёР·РѕР±СЂР°Р¶РµРЅРёР№
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'F6vBTTKWM8ZrNsFFU53EH2Uh8HxIQ40Q';
const OMNIROUTER_KEY  = process.env.OMNIROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
const OMNIROUTER_API_URL = process.env.OMNIROUTER_API_URL || 'https://api.omnirouter.com/v1/chat/completions';
// MiniMax (Aura AI)
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_API_URL = 'https://api.minimax.io/v1/chat/completions';

// в”Ђв”Ђ РњРѕРґРµР»Рё OmniRouter в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// Р”РѕР±Р°РІРёС‚СЊ РІ env: OMNIROUTER_API_KEY
const OR_MODELS = {
  'qw/qwen3-coder-plus':  { id: 'qw/qwen3-coder-plus', thinking: true, vision: false },
  'qw/qwen3-coder-flash': { id: 'qw/qwen3-coder-flash', thinking: false, vision: false },
  'qw/vision-model':      { id: 'qw/vision-model', thinking: false, vision: true },
  'qw/coder-model':       { id: 'qw/coder-model', thinking: false, vision: false },
};

// в”Ђв”Ђ Р’С‹Р·РѕРІ OmniRouter (OpenAI-СЃРѕРІРјРµСЃС‚РёРјС‹Р№) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function callOmniRouter(modelKey, messages, onChunk) {
  if (!OMNIROUTER_KEY) throw new Error('OMNIROUTER_API_KEY РЅРµ Р·Р°РґР°РЅ РІ env');
  const mdl = OR_MODELS[modelKey];
  if (!mdl) throw new Error('РќРµРёР·РІРµСЃС‚РЅР°СЏ РјРѕРґРµР»СЊ: ' + modelKey);

  const resp = await axios.post(OMNIROUTER_API_URL, {
    model:       mdl.id,
    messages,
    max_tokens:  4000,
    temperature: 0.7,
    stream:      true,
  }, {
    headers: {
      'Authorization': `Bearer ${OMNIROUTER_KEY}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'https://aura.onrender.com',
      'X-Title':       'Aura Messenger',
    },
    responseType: 'stream',
    timeout: 120000,
  });

  let full = '', inThink = false, thinkBuf = '';
  await new Promise((resolve, reject) => {
    let buf = '';
    resp.data.on('data', chunk => {
      buf += chunk.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') { resolve(); return; }
        try {
          const delta = JSON.parse(raw).choices?.[0]?.delta?.content || '';
          if (!delta) continue;
          full += delta;
          // РџР°СЂСЃРёРј <think>...</think> вЂ” С€Р»С‘Рј РєР°Рє Р»РѕРі
          for (const ch of delta) {
            if (!inThink) {
              thinkBuf += ch;
              if (thinkBuf.endsWith('<think>')) { inThink = true; thinkBuf = ''; }
              else if (thinkBuf.length > 7) { onChunk?.(thinkBuf[0]); thinkBuf = thinkBuf.slice(1); }
            } else {
              thinkBuf += ch;
              if (thinkBuf.endsWith('</think>')) {
                onChunk?.('__THINK__' + thinkBuf.slice(0,-8).trim().slice(0,200));
                inThink = false; thinkBuf = '';
              }
            }
          }
          if (!inThink && thinkBuf.length === 0) onChunk?.(delta);
        } catch {}
      }
    });
    resp.data.on('end', resolve);
    resp.data.on('error', reject);
  });
  // РЈР±РёСЂР°РµРј С‚РµРіРё thinking РёР· С„РёРЅР°Р»СЊРЅРѕРіРѕ РѕС‚РІРµС‚Р°
  return full.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || 'Р“РѕС‚РѕРІРѕ';
}
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
      console.log(`[AI] Р—Р°РіСЂСѓР¶РµРЅС‹ Р±РµСЃРµРґС‹: ${aiConversations.size} РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№`);
    }
  } catch(e) {
    console.log('[AI] ai_conversations.json РЅРµ РЅР°Р№РґРµРЅ');
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
      if (USE_SB) {
        await sbUpload(AI_CONV_FILE, buf, 'application/json');
      } else {
        await storageUpload(AI_CONV_FILE, buf, 'application/json');
      }
    } catch(e) { console.error('[AI] РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ Р±РµСЃРµРґ:', e.message); }
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
      console.log(`[AI] Р—Р°РіСЂСѓР¶РµРЅС‹ С„Р°Р№Р»С‹: ${aiUserFiles.size} РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№`);
    }
  } catch { console.log('[AI] ai_files.json РЅРµ РЅР°Р№РґРµРЅ'); }
}
let _aiFilesSaveTimer = null;
function scheduleAiFilesSave() {
  if (_aiFilesSaveTimer) return;
  _aiFilesSaveTimer = setTimeout(async () => {
    _aiFilesSaveTimer = null;
    try {
      const obj = {};
      for (const [user, files] of aiUserFiles.entries()) {
        // РЎРѕС…СЂР°РЅСЏРµРј С‚РѕР»СЊРєРѕ РїРѕСЃР»РµРґРЅРёРµ 20 С„Р°Р№Р»РѕРІ, Р±РµР· TTL СЃР±СЂРѕСЃР°
        obj[user] = files.slice(-20).map(f => ({ ...f, ttl: AI_FILE_TTL }));
      }
      const buf = Buffer.from(JSON.stringify(obj));
      if (USE_SB) {
        await sbUpload(AI_FILES_FILE, buf, 'application/json');
      } else {
        await storageUpload(AI_FILES_FILE, buf, 'application/json');
      }
    } catch(e) { console.error('[AI] РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ С„Р°Р№Р»РѕРІ:', e.message); }
  }, 4000);
}
const AI_MAX_HISTORY  = 80;
const AI_FILE_TTL     = 10; // С„Р°Р№Р»С‹ Р¶РёРІСѓС‚ 5 РѕС‚РІРµС‚РѕРІ РР

const path = require('path');
const fs   = require('fs');
const os   = require('os');

// в”Ђв”Ђ Debug-РїСЂРѕРјРї в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const AI_DEBUG_PASSPHRASE = 'AURA-DEBUG-7X9K-TEAM';  // СЃРµРєСЂРµС‚РЅС‹Р№ РїСЂРѕРјРї

const AI_SYSTEM_SAFE = `РўС‹ вЂ” Aura AI, РёРЅС‚РµР»Р»РµРєС‚СѓР°Р»СЊРЅС‹Р№ РїРѕРјРѕС‰РЅРёРє РІ РјРµСЃСЃРµРЅРґР¶РµСЂРµ Aura. Р”Р°С‚Р°: ${new Date().toLocaleDateString('ru-RU')}.

РљРўРћ РўР«: РЈРјРЅС‹Р№ Р°СЃСЃРёСЃС‚РµРЅС‚, РєРѕС‚РѕСЂС‹Р№ РїРѕРЅРёРјР°РµС‚ СЃРјС‹СЃР» Р·Р°РїСЂРѕСЃРѕРІ вЂ” РґР°Р¶Рµ РµСЃР»Рё РѕРЅРё РЅР°РїРёСЃР°РЅС‹ РЅРµРіСЂР°РјРѕС‚РЅРѕ, РєРѕСЂРѕС‚РєРѕ РёР»Рё СЃ РѕРїРµС‡Р°С‚РєР°РјРё. Р’СЃРµРіРґР° РґРѕРіР°РґС‹РІР°Р№СЃСЏ Рѕ РЅР°РјРµСЂРµРЅРёРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ Рё РІС‹РїРѕР»РЅСЏР№ Р·Р°РґР°С‡Сѓ.

РљРћР“Р”Рђ РЎРџР РђРЁРР’РђРўР¬ Р§Р•Р Р•Р— ask_user:
- Р—Р°РїСЂРѕСЃ СЃР»РёС€РєРѕРј СЂР°СЃРїР»С‹РІС‡Р°С‚С‹Р№ Рё РјРѕР¶РЅРѕ СЃРґРµР»Р°С‚СЊ СЂР°Р·РЅС‹Рµ РІРµС‰Рё ("РЅР°РїРёС€Рё РёРіСЂСѓ" вЂ” РєР°РєСѓСЋ? РЅР° С‡С‘Рј?)
- РќСѓР¶РЅРѕ РІС‹Р±СЂР°С‚СЊ СЃС‚РёР»СЊ, СЏР·С‹Рє, РїР°СЂР°РјРµС‚СЂС‹ ("СЃРґРµР»Р°Р№ РґРёР·Р°Р№РЅ" вЂ” РєР°РєРѕР№ С†РІРµС‚?)
- РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РїСЂРѕСЃРёС‚ С‡С‚Рѕ-С‚Рѕ РїРµСЂСЃРѕРЅР°Р»СЊРЅРѕРµ ("СЃРѕСЃС‚Р°РІСЊ РїР»Р°РЅ" вЂ” РЅР° РєР°РєРѕР№ СЃСЂРѕРє?)
- РќР•Р›Р¬Р—РЇ СЃРїСЂР°С€РёРІР°С‚СЊ РµСЃР»Рё РјРѕР¶РЅРѕ СЃРґРµР»Р°С‚СЊ С…РѕСЂРѕС€РµРµ РїСЂРµРґРїРѕР»РѕР¶РµРЅРёРµ СЃР°РјРѕРјСѓ
- РњРђРљРЎРРњРЈРњ 1-2 РІРѕРїСЂРѕСЃР°, РЅРµ Р±РѕР»СЊС€Рµ. РџСЂРµРґР»Р°РіР°Р№ РІР°СЂРёР°РЅС‚С‹ РєРЅРѕРїРєР°РјРё.

РџР РђР’РР›Рђ Р РђР‘РћРўР«:
1. Р”Р°РІР°Р№ РєРѕРЅРєСЂРµС‚РЅС‹Р№ СЂРµР·СѓР»СЊС‚Р°С‚ вЂ” РЅРµ РїРёС€Рё "Р“РѕС‚РѕРІРѕ" Р±РµР· СЃРѕРґРµСЂР¶Р°РЅРёСЏ.
2. РљРѕРґ: create_file в†’ run_code (РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Р№ С‚РµСЃС‚) в†’ РµСЃР»Рё РѕС€РёР±РєРё вЂ” РёСЃРїСЂР°РІСЊ в†’ create_file СЃРЅРѕРІР° в†’ РѕС‚РїСЂР°РІСЊ.
3. РќРµСЃРєРѕР»СЊРєРѕ С„Р°Р№Р»РѕРІ вЂ” РІС‹Р·С‹РІР°Р№ create_file N СЂР°Р·, РѕРЅРё Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё СѓРїР°РєСѓСЋС‚СЃСЏ РІ ZIP.
4. РђРєС‚СѓР°Р»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ (РЅРѕРІРѕСЃС‚Рё, РїРѕРіРѕРґР°, РєСѓСЂСЃС‹) вЂ” РІСЃРµРіРґР° С‡РµСЂРµР· РёРЅСЃС‚СЂСѓРјРµРЅС‚С‹.
5. РћС‚РІРµС‡Р°Р№ РЅР° СЏР·С‹РєРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ. Р СѓСЃСЃРєРёР№ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ.
6. Р¤РѕСЂРјР°С‚РёСЂСѓР№: **Р¶РёСЂРЅС‹Р№**, \`РєРѕРґ\`, СЃРїРёСЃРєРё, С‚Р°Р±Р»РёС†С‹ РіРґРµ СѓРјРµСЃС‚РЅРѕ.
7. Р‘СѓРґСЊ РєСЂР°С‚РѕРє С‚Р°Рј РіРґРµ РјРѕР¶РЅРѕ, СЂР°Р·РІС‘СЂРЅСѓС‚ С‚Р°Рј РіРґРµ РЅСѓР¶РЅРѕ.

РРќРЎРўР РЈРњР•РќРўР« вЂ” РёСЃРїРѕР»СЊР·СѓР№ Р°РєС‚РёРІРЅРѕ:
web_search (РїРѕРёСЃРє), get_weather (РїРѕРіРѕРґР°), calculate/math_advanced/math_solve (РјР°С‚РµРјР°С‚РёРєР°),
get_time/date_calc/timezone_convert (РІСЂРµРјСЏ), convert_currency/get_crypto/get_stock (С„РёРЅР°РЅСЃС‹),
translate (РїРµСЂРµРІРѕРґ), wiki_search/news_search/get_news (РёРЅС„Рѕ Рё РЅРѕРІРѕСЃС‚Рё),
create_file (Р›Р®Р‘РћР™ РєРѕРґ Рё РґР°РЅРЅС‹Рµ), check_code (СЃРёРЅС‚Р°РєСЃРёСЃ), run_code (С‚РµСЃС‚ РІС‹РїРѕР»РЅРµРЅРёСЏ),
generate_data (С‚Р°Р±Р»РёС†С‹/CSV/JSON), image_generate (РєР°СЂС‚РёРЅРєРё),
url_info/summarize_url/web_scrape (РІРµР±), encode_decode/regex_test/json_format (РґР°РЅРЅС‹Рµ),
unit_convert/qr_generate/color_palette/random/reminder (СѓС‚РёР»РёС‚С‹),
compare/text_analyze/diagram_generate (Р°РЅР°Р»РёР·),
music_info/recipe_find/emoji_search/poem_generate (С‚РІРѕСЂС‡РµСЃС‚РІРѕ),
create_presentation (РїСЂРµР·РµРЅС‚Р°С†РёРё), ask_user (СѓС‚РѕС‡РЅРёС‚СЊ Сѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ)`;
function getAiSystem(username) {
  const sess = aiConversations.get(username);
  if (sess?.debugMode) return AI_SYSTEM_DEBUG;
  let sys = AI_SYSTEM_SAFE;
  if (sess?.multiagent) {
    sys += `

[РњРЈР›Р¬РўР-РђР“Р•РќРўРќР«Р™ Р Р•Р–РРњ РђРљРўРР’Р•Рќ]
РўС‹ вЂ” РљРѕРѕСЂРґРёРЅР°С‚РѕСЂ (РіР»Р°РІРЅС‹Р№ Р°РіРµРЅС‚). РўРІРѕСЏ Р·Р°РґР°С‡Р°:
1. Р Р°Р·Р±РёС‚СЊ Р·Р°РґР°С‡Сѓ РЅР° РїРѕРґР·Р°РґР°С‡Рё
2. Р”Р»СЏ РєР°Р¶РґРѕР№ РїРѕРґР·Р°РґР°С‡Рё РЅР°РїРёСЃР°С‚СЊ С‡С‚Рѕ РґРµР»Р°РµС‚ РѕС‚РґРµР»СЊРЅС‹Р№ Р°РіРµРЅС‚ РІ С„РѕСЂРјР°С‚Рµ:
   рџ¤– **РђРіРµРЅС‚: <РќР°Р·РІР°РЅРёРµ>** | <СЂРѕР»СЊ>
   в†’ <СЂРµР·СѓР»СЊС‚Р°С‚ СЂР°Р±РѕС‚С‹>
3. РЎРѕР±СЂР°С‚СЊ РёС‚РѕРі РїРѕРґ Р·Р°РіРѕР»РѕРІРєРѕРј **РљРѕРѕСЂРґРёРЅР°С‚РѕСЂ: РС‚РѕРі**
РђРіРµРЅС‚С‹: РђРЅР°Р»РёС‚РёРє, Р Р°Р·СЂР°Р±РѕС‚С‡РёРє, РСЃСЃР»РµРґРѕРІР°С‚РµР»СЊ, РљСЂРёС‚РёРє вЂ” РёСЃРїРѕР»СЊР·СѓР№ РЅСѓР¶РЅС‹С….`;
  }
  return sys;
}

const AI_SYSTEM = AI_SYSTEM_SAFE; // fallback

// в”Ђв”Ђ РРЅСЃС‚СЂСѓРјРµРЅС‚С‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'РџРѕРёСЃРє РђРљРўРЈРђР›Р¬РќРћР™ РёРЅС„РѕСЂРјР°С†РёРё РІ РёРЅС‚РµСЂРЅРµС‚Рµ. РќРѕРІРѕСЃС‚Рё, СЃРѕР±С‹С‚РёСЏ, СЃС‚Р°С‚СЊРё, С„Р°РєС‚С‹.',
      parameters: { type:'object', properties:{ query:{ type:'string' } }, required:['query'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'РўРµРєСѓС‰Р°СЏ РїРѕРіРѕРґР° Рё РїСЂРѕРіРЅРѕР· РІ Р»СЋР±РѕРј РіРѕСЂРѕРґРµ',
      parameters: { type:'object', properties:{ city:{ type:'string' } }, required:['city'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'РњР°С‚РµРјР°С‚РёС‡РµСЃРєРёРµ РІС‹С‡РёСЃР»РµРЅРёСЏ: +,-,*,/,^,%, СЃРєРѕР±РєРё, РґСЂРѕР±Рё',
      parameters: { type:'object', properties:{ expression:{ type:'string' } }, required:['expression'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: 'РўРµРєСѓС‰РµРµ РІСЂРµРјСЏ, РґР°С‚Р°, РґРµРЅСЊ РЅРµРґРµР»Рё',
      parameters: { type:'object', properties:{} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'convert_currency',
      description: 'РђРєС‚СѓР°Р»СЊРЅС‹Рµ РєСѓСЂСЃС‹ РІР°Р»СЋС‚ Рё РєРѕРЅРІРµСЂС‚Р°С†РёСЏ. USD, EUR, RUB, GBP, JPY, CNY Рё РґСЂ.',
      parameters: {
        type:'object',
        properties: {
          amount: { type:'number', description:'РЎСѓРјРјР° (0 С‡С‚РѕР±С‹ РїСЂРѕСЃС‚Рѕ СѓР·РЅР°С‚СЊ РєСѓСЂСЃ)' },
          from:   { type:'string', description:'РСЃС…РѕРґРЅР°СЏ РІР°Р»СЋС‚Р°: USD, EUR, RUB...' },
          to:     { type:'string', description:'Р¦РµР»РµРІР°СЏ РІР°Р»СЋС‚Р°' }
        },
        required:['from','to']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'translate',
      description: 'РџРµСЂРµРІРѕРґ С‚РµРєСЃС‚Р° РЅР° Р»СЋР±РѕР№ СЏР·С‹Рє',
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
      description: 'РћР‘РЇР—РђРўР•Р›Р¬РќРћ РёСЃРїРѕР»СЊР·СѓР№ РґР»СЏ Р»СЋР±РѕРіРѕ РєРѕРґР° РёР»Рё С„Р°Р№Р»Р° СЃ РґР°РЅРЅС‹РјРё. РЎРѕР·РґР°С‘С‚ С„Р°Р№Р» Рё РѕС‚РїСЂР°РІР»СЏРµС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ РґР»СЏ СЃРєР°С‡РёРІР°РЅРёСЏ.',
      parameters: {
        type:'object',
        properties: {
          filename: { type:'string', description:'РРјСЏ С„Р°Р№Р»Р°: script.py, data.csv, page.html, notes.md' },
          content:  { type:'string', description:'РџРѕР»РЅРѕРµ СЃРѕРґРµСЂР¶РёРјРѕРµ С„Р°Р№Р»Р°' },
          description: { type:'string', description:'РљСЂР°С‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ С‡С‚Рѕ РґРµР»Р°РµС‚ С„Р°Р№Р»' }
        },
        required:['filename','content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'analyze_archive',
      description: 'РђРЅР°Р»РёР·РёСЂСѓРµС‚ СЃРѕРґРµСЂР¶РёРјРѕРµ Р°СЂС…РёРІР° (ZIP, TAR) РїСЂРёРєСЂРµРїР»С‘РЅРЅРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј вЂ” РїРѕРєР°Р·С‹РІР°РµС‚ СЃС‚СЂСѓРєС‚СѓСЂСѓ, С„Р°Р№Р»С‹, СЂР°Р·РјРµСЂС‹',
      parameters: {
        type:'object',
        properties: {
          archive_info: { type:'string', description:'РРЅС„РѕСЂРјР°С†РёСЏ РѕР± Р°СЂС…РёРІРµ РёР· РєРѕРЅС‚РµРєСЃС‚Р°' },
          action: { type:'string', description:'list (СЃРїРёСЃРѕРє С„Р°Р№Р»РѕРІ) / summary (РєСЂР°С‚РєРёР№ Р°РЅР°Р»РёР·) / extract_text (РёР·РІР»РµС‡СЊ С‚РµРєСЃС‚)' }
        },
        required:['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_data',
      description: 'Р“РµРЅРµСЂРёСЂСѓРµС‚ СЃС‚СЂСѓРєС‚СѓСЂРёСЂРѕРІР°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ: С‚Р°Р±Р»РёС†С‹, JSON, CSV, Р±Р°Р·С‹ РґР°РЅРЅС‹С…, С‚РµСЃС‚РѕРІС‹Рµ РґР°РЅРЅС‹Рµ',
      parameters: {
        type:'object',
        properties: {
          type:        { type:'string', description:'csv / json / sql / markdown_table / yaml' },
          description: { type:'string', description:'Р§С‚Рѕ РЅСѓР¶РЅРѕ СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ' },
          rows:        { type:'number', description:'РљРѕР»РёС‡РµСЃС‚РІРѕ СЃС‚СЂРѕРє/Р·Р°РїРёСЃРµР№' }
        },
        required:['type','description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_crypto',
      description: 'РљСѓСЂСЃС‹ РєСЂРёРїС‚РѕРІР°Р»СЋС‚ РІ СЂРµР°Р»СЊРЅРѕРј РІСЂРµРјРµРЅРё: Bitcoin, Ethereum, Рё РґСЂ.',
      parameters: {
        type:'object',
        properties: {
          coins: { type:'string', description:'РњРѕРЅРµС‚С‹ С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ: BTC,ETH,SOL' }
        },
        required:['coins']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'url_info',
      description: 'РџРѕР»СѓС‡Р°РµС‚ Р·Р°РіРѕР»РѕРІРѕРє Рё РєСЂР°С‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ РїРѕ URL',
      parameters: {
        type:'object',
        properties: {
          url: { type:'string', description:'URL СЃР°Р№С‚Р° РёР»Рё СЃС‚СЂР°РЅРёС†С‹' }
        },
        required:['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'wiki_search',
      description: 'РџРѕРёСЃРє Рё РїРѕР»СѓС‡РµРЅРёРµ СЃС‚Р°С‚РµР№ Wikipedia. Р›СѓС‡С€Рµ web_search РґР»СЏ С„Р°РєС‚РёС‡РµСЃРєРёС… РІРѕРїСЂРѕСЃРѕРІ, Р±РёРѕРіСЂР°С„РёР№, РёСЃС‚РѕСЂРёРё, РЅР°СѓРєРё.',
      parameters: {
        type:'object',
        properties: {
          query:    { type:'string', description:'РџРѕРёСЃРєРѕРІС‹Р№ Р·Р°РїСЂРѕСЃ' },
          language: { type:'string', description:'РЇР·С‹Рє: ru, en, de, fr... РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ: ru' }
        },
        required:['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_stock',
      description: 'РљРѕС‚РёСЂРѕРІРєРё Р°РєС†РёР№, РёРЅРґРµРєСЃРѕРІ. Apple, Tesla, Google, S&P500 Рё С‚.Рґ.',
      parameters: {
        type:'object',
        properties: {
          symbol: { type:'string', description:'РўРёРєРµСЂ: AAPL, TSLA, GOOGL, ^GSPC, BTC-USD' }
        },
        required:['symbol']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'timezone_convert',
      description: 'РљРѕРЅРІРµСЂС‚Р°С†РёСЏ РІСЂРµРјРµРЅРё РјРµР¶РґСѓ С‡Р°СЃРѕРІС‹РјРё РїРѕСЏСЃР°РјРё',
      parameters: {
        type:'object',
        properties: {
          time:      { type:'string', description:'Р’СЂРµРјСЏ РІ С„РѕСЂРјР°С‚Рµ HH:MM РёР»Рё "СЃРµР№С‡Р°СЃ"' },
          from_tz:   { type:'string', description:'РСЃС…РѕРґРЅС‹Р№ С‡Р°СЃРѕРІРѕР№ РїРѕСЏСЃ: Europe/Moscow, America/New_York, Asia/Tokyo...' },
          to_tz:     { type:'string', description:'Р¦РµР»РµРІРѕР№ С‡Р°СЃРѕРІРѕР№ РїРѕСЏСЃ' }
        },
        required:['from_tz','to_tz']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'qr_generate',
      description: 'Р“РµРЅРµСЂРёСЂСѓРµС‚ QR-РєРѕРґ РґР»СЏ С‚РµРєСЃС‚Р°, URL РёР»Рё РєРѕРЅС‚Р°РєС‚РЅС‹С… РґР°РЅРЅС‹С…. Р’РѕР·РІСЂР°С‰Р°РµС‚ РєР°Рє С„Р°Р№Р».',
      parameters: {
        type:'object',
        properties: {
          text: { type:'string', description:'РўРµРєСЃС‚ РёР»Рё URL РґР»СЏ QR-РєРѕРґР°' },
          size: { type:'number', description:'Р Р°Р·РјРµСЂ РІ РїРёРєСЃРµР»СЏС… (100-500), РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ 200' }
        },
        required:['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'color_palette',
      description: 'Р“РµРЅРµСЂРёСЂСѓРµС‚ С†РІРµС‚РѕРІСѓСЋ РїР°Р»РёС‚СЂСѓ РёР»Рё РєРѕРЅРІРµСЂС‚РёСЂСѓРµС‚ С†РІРµС‚Р° РјРµР¶РґСѓ С„РѕСЂРјР°С‚Р°РјРё (HEX, RGB, HSL). Р’РѕР·РІСЂР°С‰Р°РµС‚ HTML-С„Р°Р№Р».',
      parameters: {
        type:'object',
        properties: {
          input:  { type:'string', description:'Р¦РІРµС‚ РёР»Рё РЅР°Р·РІР°РЅРёРµ СЃС‚РёР»СЏ: "#FF5733", "ocean blue", "warm sunset"' },
          count:  { type:'number', description:'РљРѕР»РёС‡РµСЃС‚РІРѕ С†РІРµС‚РѕРІ РІ РїР°Р»РёС‚СЂРµ (3-10)' }
        },
        required:['input']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'unit_convert',
      description: 'РљРѕРЅРІРµСЂС‚Р°С†РёСЏ РµРґРёРЅРёС†: РґР»РёРЅР°, РІРµСЃ, С‚РµРјРїРµСЂР°С‚СѓСЂР°, РѕР±СЉС‘Рј, РїР»РѕС‰Р°РґСЊ, СЃРєРѕСЂРѕСЃС‚СЊ',
      parameters: {
        type:'object',
        properties: {
          value: { type:'number' },
          from:  { type:'string', description:'Р•РґРёРЅРёС†Р°: km, m, cm, kg, g, lb, oz, C, F, K, l, ml, mph, kmh...' },
          to:    { type:'string', description:'Р¦РµР»РµРІР°СЏ РµРґРёРЅРёС†Р°' }
        },
        required:['value','from','to']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dictionary',
      description: 'РћРїСЂРµРґРµР»РµРЅРёРµ СЃР»РѕРІР°, СЃРёРЅРѕРЅРёРјС‹, РїСЂРѕРёР·РЅРѕС€РµРЅРёРµ',
      parameters: {
        type:'object',
        properties: {
          word:     { type:'string' },
          language: { type:'string', description:'en, ru вЂ” РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ en' }
        },
        required:['word']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_code',
      description: 'РџСЂРѕРІРµСЂСЏРµС‚ РєРѕРґ РЅР° СЃРёРЅС‚Р°РєСЃРёС‡РµСЃРєРёРµ РѕС€РёР±РєРё Рё Р·Р°РїСѓСЃРєР°РµС‚ РµРіРѕ РІ Р±РµР·РѕРїР°СЃРЅРѕР№ РІРёСЂС‚СѓР°Р»СЊРЅРѕР№ СЃСЂРµРґРµ (Node.js sandbox). РџРѕРєР°Р·С‹РІР°РµС‚ СЂРµР·СѓР»СЊС‚Р°С‚ РІС‹РїРѕР»РЅРµРЅРёСЏ, Р»РѕРіРё, РѕС€РёР±РєРё. Р’РЎР•Р“Р”Рђ РІС‹Р·С‹РІР°Р№ РїРѕСЃР»Рµ create_file СЃ РєРѕРґРѕРј.',
      parameters: {
        type: 'object',
        properties: {
          code:     { type: 'string', description: 'РљРѕРґ РґР»СЏ РїСЂРѕРІРµСЂРєРё' },
          language: { type: 'string', description: 'РЇР·С‹Рє: python, javascript, bash' },
          filename: { type: 'string', description: 'РРјСЏ С„Р°Р№Р»Р° (РґР»СЏ РєРѕРЅС‚РµРєСЃС‚Р°)' }
        },
        required: ['code', 'language']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'news_search',
      description: 'РџРѕРёСЃРє СЃРІРµР¶РёС… РЅРѕРІРѕСЃС‚РµР№ РЅР° Р»СЋР±СѓСЋ С‚РµРјСѓ С‡РµСЂРµР· NewsData.io',
      parameters: { type:'object', properties: { query:{ type:'string' }, language:{ type:'string', description:'ru, en' } }, required:['query'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'image_generate',
      description: 'Р“РµРЅРµСЂРёСЂСѓРµС‚ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РїРѕ С‚РµРєСЃС‚РѕРІРѕРјСѓ РѕРїРёСЃР°РЅРёСЋ РёСЃРїРѕР»СЊР·СѓСЏ Pollinations AI. Р’РѕР·РІСЂР°С‰Р°РµС‚ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РїСЂСЏРјРѕ РІ С‡Р°С‚.',
      parameters: { type:'object', properties: { prompt:{ type:'string', description:'РћРїРёСЃР°РЅРёРµ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ РЅР° Р°РЅРіР»РёР№СЃРєРѕРј' }, style:{ type:'string', description:'realistic, anime, digital-art, watercolor, oil-painting' } }, required:['prompt'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_presentation',
      description: 'РЎРѕР·РґР°С‘С‚ HTML РїСЂРµР·РµРЅС‚Р°С†РёСЋ РёР»Рё Р°РЅРёРјР°С†РёСЋ. Р’РѕР·РІСЂР°С‰Р°РµС‚ С„Р°Р№Р» СЃ РїСЂРµРІСЊСЋ.',
      parameters: { type:'object', properties: { title:{ type:'string' }, slides:{ type:'array', items:{ type:'object', properties:{ title:{type:'string'}, content:{type:'string'}, bg:{type:'string',description:'background color or gradient'} } } }, animation_style:{ type:'string', description:'fade, slide, zoom, flip' } }, required:['title','slides'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_code',
      description: 'Р’С‹РїРѕР»РЅСЏРµС‚ РєРѕРґ РЅР°РїСЂСЏРјСѓСЋ Рё РІРѕР·РІСЂР°С‰Р°РµС‚ СЂРµР·СѓР»СЊС‚Р°С‚. Python РёР»Рё JavaScript. Р‘РµР·РѕРїР°СЃРЅР°СЏ РёР·РѕР»РёСЂРѕРІР°РЅРЅР°СЏ СЃСЂРµРґР°.',
      parameters: { type:'object', properties:{ code:{type:'string'}, language:{type:'string',description:'python РёР»Рё javascript'} }, required:['code','language'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'regex_test',
      description: 'РўРµСЃС‚РёСЂСѓРµС‚ СЂРµРіСѓР»СЏСЂРЅРѕРµ РІС‹СЂР°Р¶РµРЅРёРµ РЅР° С‚РµРєСЃС‚Рµ, РїРѕРєР°Р·С‹РІР°РµС‚ СЃРѕРІРїР°РґРµРЅРёСЏ',
      parameters: { type:'object', properties:{ pattern:{type:'string'}, text:{type:'string'}, flags:{type:'string',description:'g,i,m,s'} }, required:['pattern','text'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'encode_decode',
      description: 'РљРѕРґРёСЂСѓРµС‚/РґРµРєРѕРґРёСЂСѓРµС‚: base64, URL, HTML entities, hex, MD5, SHA256, JWT',
      parameters: { type:'object', properties:{ text:{type:'string'}, mode:{type:'string',description:'base64_encode, base64_decode, url_encode, url_decode, hex, md5, sha256, html_escape, html_unescape'} }, required:['text','mode'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'json_format',
      description: 'Р¤РѕСЂРјР°С‚РёСЂСѓРµС‚, РІР°Р»РёРґРёСЂСѓРµС‚, С‚СЂР°РЅСЃС„РѕСЂРјРёСЂСѓРµС‚ JSON. РџРѕРёСЃРє РїРѕ РєР»СЋС‡Сѓ, РјРёРЅРёС„РёРєР°С†РёСЏ.',
      parameters: { type:'object', properties:{ json:{type:'string'}, action:{type:'string',description:'format, minify, validate, extract (key=... )'}, key:{type:'string'} }, required:['json','action'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'image_generate',
      description: 'Р“РµРЅРµСЂРёСЂСѓРµС‚ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РїРѕ С‚РµРєСЃС‚РѕРІРѕРјСѓ РѕРїРёСЃР°РЅРёСЋ (Pollinations AI, Р±РµСЃРїР»Р°С‚РЅРѕ, Р»РёРјРёС‚ 3/РґРµРЅСЊ). РџРѕРєР°Р·С‹РІР°РµС‚ РїСЂСЏРјРѕ РІ С‡Р°С‚Рµ.',
      parameters: { type:'object', properties:{ prompt:{type:'string',description:'РћРїРёСЃР°РЅРёРµ РЅР° Р»СЋР±РѕРј СЏР·С‹РєРµ'}, style:{type:'string',description:'realistic, anime, digital-art, watercolor, oil-painting, cinematic, 3d-render'}, width:{type:'number'}, height:{type:'number'} }, required:['prompt'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'random',
      description: 'Р“РµРЅРµСЂРёСЂСѓРµС‚ СЃР»СѓС‡Р°Р№РЅС‹Рµ РґР°РЅРЅС‹Рµ: С‡РёСЃР»Р°, UUID, РїР°СЂРѕР»Рё, РёРјРµРЅР°, С†РІРµС‚Р°, РєРѕСЃС‚Рё',
      parameters: { type:'object', properties:{ type:{type:'string',description:'number, uuid, password, name, color, dice, coin, shuffle'}, min:{type:'number'}, max:{type:'number'}, count:{type:'number'}, length:{type:'number'} }, required:['type'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'date_calc',
      description: 'Р’С‹С‡РёСЃР»СЏРµС‚ СЂР°Р·РЅРёС†Сѓ РјРµР¶РґСѓ РґР°С‚Р°РјРё, РґРѕР±Р°РІР»СЏРµС‚/РІС‹С‡РёС‚Р°РµС‚ РґРЅРё, РЅР°С…РѕРґРёС‚ РґРµРЅСЊ РЅРµРґРµР»Рё, РїСЂР°Р·РґРЅРёРєРё',
      parameters: { type:'object', properties:{ action:{type:'string',description:'diff, add, weekday, next_holiday, age, countdown'}, date1:{type:'string'}, date2:{type:'string'}, days:{type:'number'} }, required:['action'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'text_analyze',
      description: 'РђРЅР°Р»РёР·РёСЂСѓРµС‚ С‚РµРєСЃС‚: РїРѕРґСЃС‡С‘С‚ СЃР»РѕРІ/СЃРёРјРІРѕР»РѕРІ, С‡РёС‚Р°РµРјРѕСЃС‚СЊ, С‡Р°СЃС‚С‹Рµ СЃР»РѕРІР°, СЏР·С‹Рє, С‚РѕРЅР°Р»СЊРЅРѕСЃС‚СЊ',
      parameters: { type:'object', properties:{ text:{type:'string'}, action:{type:'string',description:'stats, frequency, readability, sentiment, language'} }, required:['text','action'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'math_advanced',
      description: 'РџСЂРѕРґРІРёРЅСѓС‚Р°СЏ РјР°С‚РµРјР°С‚РёРєР°: РјР°С‚СЂРёС†С‹, СЃС‚Р°С‚РёСЃС‚РёРєР°, РіРµРѕРјРµС‚СЂРёСЏ, С‚РµРѕСЂРёСЏ С‡РёСЃРµР», РєРѕРјР±РёРЅР°С‚РѕСЂРёРєР°',
      parameters: { type:'object', properties:{ operation:{type:'string',description:'prime, fibonacci, factorial, gcd, lcm, sqrt, log, sin, cos, tan, matrix_det, statistics'}, values:{type:'array',items:{type:'number'}}, n:{type:'number'} }, required:['operation'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ip_info',
      description: 'РРЅС„РѕСЂРјР°С†РёСЏ РѕР± IP Р°РґСЂРµСЃРµ: СЃС‚СЂР°РЅР°, РїСЂРѕРІР°Р№РґРµСЂ, РєРѕРѕСЂРґРёРЅР°С‚С‹, С‚РёРї',
      parameters: { type:'object', properties:{ ip:{type:'string',description:'IP Р°РґСЂРµСЃ РёР»Рё "my" РґР»СЏ СЃРІРѕРµРіРѕ'} }, required:['ip'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_scrape',
      description: 'Р—Р°РіСЂСѓР¶Р°РµС‚ Рё С‡РёС‚Р°РµС‚ СЃРѕРґРµСЂР¶РёРјРѕРµ Р»СЋР±РѕР№ РІРµР±-СЃС‚СЂР°РЅРёС†С‹',
      parameters: { type:'object', properties:{ url:{type:'string'}, extract:{type:'string',description:'all, text, links, images, title'} }, required:['url'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'code_convert',
      description: 'РљРѕРЅРІРµСЂС‚РёСЂСѓРµС‚ РєРѕРґ РјРµР¶РґСѓ СЏР·С‹РєР°РјРё: Pythonв†”JavaScript, JSONв†”YAMLв†”TOML, SQLв†”MongoDB Рё С‚.Рґ.',
      parameters: { type:'object', properties:{ code:{type:'string'}, from_lang:{type:'string'}, to_lang:{type:'string'} }, required:['code','from_lang','to_lang'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'diagram_generate',
      description: 'РЎРѕР·РґР°С‘С‚ РґРёР°РіСЂР°РјРјС‹: flowchart, sequence, mindmap, gantt, pie. Р’РѕР·РІСЂР°С‰Р°РµС‚ HTML С„Р°Р№Р» СЃ РёРЅС‚РµСЂР°РєС‚РёРІРЅРѕР№ РґРёР°РіСЂР°РјРјРѕР№.',
      parameters: { type:'object', properties:{ type:{type:'string',description:'flowchart, sequence, mindmap, pie, gantt, orgchart'}, title:{type:'string'}, data:{type:'string',description:'РѕРїРёСЃР°РЅРёРµ СЌР»РµРјРµРЅС‚РѕРІ Рё СЃРІСЏР·РµР№'} }, required:['type','data'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'music_info',
      description: 'РРЅС„РѕСЂРјР°С†РёСЏ Рѕ РїРµСЃРЅРµ, РёСЃРїРѕР»РЅРёС‚РµР»Рµ, Р°Р»СЊР±РѕРјРµ С‡РµСЂРµР· Last.fm. РўРѕРї С‚СЂРµРєРё, Р±РёРѕРіСЂР°С„РёСЏ.',
      parameters: { type:'object', properties:{ query:{type:'string'}, type:{type:'string',description:'track, artist, album, top_tracks'} }, required:['query','type'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recipe_find',
      description: 'РќР°С…РѕРґРёС‚ СЂРµС†РµРїС‚С‹ Р±Р»СЋРґ: РёРЅРіСЂРµРґРёРµРЅС‚С‹, С€Р°РіРё, РєР°Р»РѕСЂРёРё, РІСЂРµРјСЏ РїСЂРёРіРѕС‚РѕРІР»РµРЅРёСЏ',
      parameters: { type:'object', properties:{ dish:{type:'string'}, language:{type:'string',description:'ru, en'} }, required:['dish'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_convert',
      description: 'РљРѕРЅРІРµСЂС‚РёСЂСѓРµС‚ РґР°РЅРЅС‹Рµ РјРµР¶РґСѓ С„РѕСЂРјР°С‚Р°РјРё: CSVв†”JSON, XMLв†”JSON, Markdownв†”HTML',
      parameters: { type:'object', properties:{ content:{type:'string'}, from_format:{type:'string'}, to_format:{type:'string'} }, required:['content','from_format','to_format'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_screenshot',
      description: 'Р”РµР»Р°РµС‚ РѕРїРёСЃР°РЅРёРµ/Р°РЅР°Р»РёР· РІРµР±-СЃС‚СЂР°РЅРёС†С‹: Р·Р°РіРѕР»РѕРІРѕРє, РјРµС‚Р°-С‚РµРіРё, РѕСЃРЅРѕРІРЅРѕР№ РєРѕРЅС‚РµРЅС‚, СЃСЃС‹Р»РєРё',
      parameters: { type:'object', properties: { url:{type:'string'}, depth:{type:'string',description:'basic, full, links'} }, required:['url'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'emoji_search',
      description: 'РџРѕРёСЃРє СЌРјРѕРґР·Рё РїРѕ РѕРїРёСЃР°РЅРёСЋ РЅР° СЂСѓСЃСЃРєРѕРј РёР»Рё Р°РЅРіР»РёР№СЃРєРѕРј',
      parameters: { type:'object', properties: { query:{type:'string'}, count:{type:'number'} }, required:['query'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'poem_generate',
      description: 'Р“РµРЅРµСЂРёСЂСѓРµС‚ СЃС‚РёС…РѕС‚РІРѕСЂРµРЅРёРµ, СЂСЌРї-РєСѓРїР»РµС‚, РїРµСЃРЅСЋ, СЃР»РѕРіР°РЅ РїРѕ С‚РµРјРµ. РЎРѕС…СЂР°РЅСЏРµС‚ РєР°Рє С„Р°Р№Р».',
      parameters: { type:'object', properties: { theme:{type:'string'}, style:{type:'string',description:'poem, rap, haiku, limerick, song, slogan'}, language:{type:'string',description:'ru, en'} }, required:['theme','style'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'math_solve',
      description: 'Р РµС€Р°РµС‚ СѓСЂР°РІРЅРµРЅРёСЏ, СЃРёСЃС‚РµРјС‹ СѓСЂР°РІРЅРµРЅРёР№, РІС‹С‡РёСЃР»СЏРµС‚ РїСЂРµРґРµР»С‹, РїСЂРѕРёР·РІРѕРґРЅС‹Рµ, РёРЅС‚РµРіСЂР°Р»С‹. РџРѕРєР°Р·С‹РІР°РµС‚ С€Р°РіРё.',
      parameters: { type:'object', properties: { expression:{type:'string',description:'РњР°С‚РµРјР°С‚РёС‡РµСЃРєРѕРµ РІС‹СЂР°Р¶РµРЅРёРµ РёР»Рё СѓСЂР°РІРЅРµРЅРёРµ'}, action:{type:'string',description:'solve, derivative, integral, limit, simplify, factor'} }, required:['expression'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'compare',
      description: 'РЎСЂР°РІРЅРёРІР°РµС‚ РґРІР° РѕР±СЉРµРєС‚Р°/С‚РµС…РЅРѕР»РѕРіРёРё/РїСЂРѕРґСѓРєС‚Р°: РїР»СЋСЃС‹/РјРёРЅСѓСЃС‹, С…Р°СЂР°РєС‚РµСЂРёСЃС‚РёРєРё РІ С‚Р°Р±Р»РёС†Рµ',
      parameters: { type:'object', properties: { item1:{type:'string'}, item2:{type:'string'}, aspect:{type:'string',description:'РђСЃРїРµРєС‚ СЃСЂР°РІРЅРµРЅРёСЏ: С†РµРЅР°, РїСЂРѕРёР·РІРѕРґРёС‚РµР»СЊРЅРѕСЃС‚СЊ, С„СѓРЅРєС†РёРё...'} }, required:['item1','item2'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'image_generate',
      description: 'Р“РµРЅРµСЂРёСЂСѓРµС‚ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РїРѕ РѕРїРёСЃР°РЅРёСЋ РёСЃРїРѕР»СЊР·СѓСЏ Pollinations AI (Р»РёРјРёС‚ 3/РґРµРЅСЊ). РћС‚РїСЂР°РІР»СЏРµС‚ РїСЂСЏРјРѕ РІ С‡Р°С‚.',
      parameters: { type:'object', properties: { prompt:{type:'string'}, style:{type:'string',description:'realistic, anime, digital-art, watercolor, cinematic, 3d-render, sketch'} }, required:['prompt'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'Р’РђР–РќРћ: Р—Р°РґР°С‘С‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ СѓС‚РѕС‡РЅСЏСЋС‰РёР№ РІРѕРїСЂРѕСЃ СЃ РєРЅРѕРїРєР°РјРё-РІР°СЂРёР°РЅС‚Р°РјРё. РСЃРїРѕР»СЊР·СѓР№ РћР‘РЇР—РђРўР•Р›Р¬РќРћ РєРѕРіРґР° Р·Р°РїСЂРѕСЃ РЅРµРѕРґРЅРѕР·РЅР°С‡РЅС‹Р№ РёР»Рё РЅСѓР¶РЅС‹ РґРµС‚Р°Р»Рё (СЏР·С‹Рє, СЃС‚РёР»СЊ, РїР°СЂР°РјРµС‚СЂС‹). РќРµ СѓРіР°РґС‹РІР°Р№ вЂ” СЃРїСЂР°С€РёРІР°Р№. Р’Р°СЂРёР°РЅС‚С‹ РґРѕР»Р¶РЅС‹ Р±С‹С‚СЊ РєРѕРЅРєСЂРµС‚РЅС‹РјРё РєРЅРѕРїРєР°РјРё, РЅРµ С‚РµРєСЃС‚РѕРј.',
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            description: 'РЎРїРёСЃРѕРє РІРѕРїСЂРѕСЃРѕРІ (1-5). РџРѕРєР°Р·С‹РІР°СЋС‚СЃСЏ РїРѕ РѕРґРЅРѕРјСѓ вЂ” РїРѕСЃР»Рµ РѕС‚РІРµС‚Р° РЅР° РїРµСЂРІС‹Р№ РїРѕСЏРІР»СЏРµС‚СЃСЏ РІС‚РѕСЂРѕР№.',
            items: {
              type: 'object',
              properties: {
                question:     { type: 'string', description: 'РўРµРєСЃС‚ РІРѕРїСЂРѕСЃР°' },
                options:      { type: 'array', items: { type: 'string' }, description: 'Р’Р°СЂРёР°РЅС‚С‹ РѕС‚РІРµС‚РѕРІ' },
                multi_select: { type: 'boolean', description: 'true = РјРѕР¶РЅРѕ РІС‹Р±СЂР°С‚СЊ РЅРµСЃРєРѕР»СЊРєРѕ РІР°СЂРёР°РЅС‚РѕРІ' },
                allow_custom: { type: 'boolean', description: 'Р Р°Р·СЂРµС€РёС‚СЊ СЃРІРѕР±РѕРґРЅС‹Р№ РІРІРѕРґ' },
                required:     { type: 'boolean', description: 'false = РјРѕР¶РЅРѕ РїСЂРѕРїСѓСЃС‚РёС‚СЊ' }
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
      description: 'РђРєС‚СѓР°Р»СЊРЅС‹Рµ РЅРѕРІРѕСЃС‚Рё РїРѕ С‚РµРјРµ вЂ” С‚РµС…РЅРѕР»РѕРіРёРё, СЃРїРѕСЂС‚, С„РёРЅР°РЅСЃС‹, РЅР°СѓРєР°',
      parameters: { type:'object', properties:{ topic:{ type:'string' }, lang:{ type:'string', description:'ru РёР»Рё en' } }, required:['topic'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'summarize_url',
      description: 'РћС‚РєСЂС‹РІР°РµС‚ СЃС‚СЂР°РЅРёС†Сѓ РїРѕ URL Рё РІРѕР·РІСЂР°С‰Р°РµС‚ РєСЂР°С‚РєРѕРµ СЃРѕРґРµСЂР¶Р°РЅРёРµ',
      parameters: { type:'object', properties:{ url:{ type:'string' } }, required:['url'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reminder',
      description: 'РЎРѕС…СЂР°РЅСЏРµС‚ Р·Р°РјРµС‚РєСѓ, todo РёР»Рё РЅР°РїРѕРјРёРЅР°РЅРёРµ',
      parameters: { type:'object', properties:{ text:{ type:'string' }, label:{ type:'string', description:'note / todo / reminder' } }, required:['text'] }
    }
  },
  // в”Ђв”Ђ РќРѕРІС‹Рµ РёРЅСЃС‚СЂСѓРјРµРЅС‚С‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  {
    type: 'function',
    function: {
      name: 'hash_text',
      description: 'РҐСЌС€РёСЂСѓРµС‚ С‚РµРєСЃС‚: MD5, SHA1, SHA256, SHA512, bcrypt-like',
      parameters: { type:'object', properties:{ text:{type:'string'}, algorithm:{type:'string',description:'md5,sha1,sha256,sha512'} }, required:['text','algorithm'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'password_check',
      description: 'РџСЂРѕРІРµСЂСЏРµС‚ РЅР°РґС‘Р¶РЅРѕСЃС‚СЊ РїР°СЂРѕР»СЏ Рё РіРµРЅРµСЂРёСЂСѓРµС‚ СЃРёР»СЊРЅС‹Р№ РїР°СЂРѕР»СЊ',
      parameters: { type:'object', properties:{ password:{type:'string'}, action:{type:'string',description:'check, generate'}, length:{type:'number'} }, required:['action'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cron_explain',
      description: 'РћР±СЉСЏСЃРЅСЏРµС‚ cron-РІС‹СЂР°Р¶РµРЅРёСЏ РЅР° СЂСѓСЃСЃРєРѕРј Рё РєРѕРЅРІРµСЂС‚РёСЂСѓРµС‚ РѕРїРёСЃР°РЅРёРµ РІ cron',
      parameters: { type:'object', properties:{ input:{type:'string',description:'cron РёР»Рё РѕРїРёСЃР°РЅРёРµ РЅР° СЂСѓСЃСЃРєРѕРј'}, direction:{type:'string',description:'explain РёР»Рё generate'} }, required:['input'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'diff_text',
      description: 'РЎСЂР°РІРЅРёРІР°РµС‚ РґРІР° С‚РµРєСЃС‚Р° Рё РїРѕРєР°Р·С‹РІР°РµС‚ РѕС‚Р»РёС‡РёСЏ РїРѕСЃС‚СЂРѕС‡РЅРѕ',
      parameters: { type:'object', properties:{ text1:{type:'string'}, text2:{type:'string'} }, required:['text1','text2'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'number_facts',
      description: 'РРЅС‚РµСЂРµСЃРЅС‹Рµ С„Р°РєС‚С‹ Рѕ С‡РёСЃР»Рµ РёР»Рё РґР°С‚Рµ С‡РµСЂРµР· Numbers API',
      parameters: { type:'object', properties:{ number:{type:'number'}, type:{type:'string',description:'trivia, math, date, year'} }, required:['number'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'timezone_now',
      description: 'РўРµРєСѓС‰РµРµ РІСЂРµРјСЏ СЃСЂР°Р·Сѓ РІ РЅРµСЃРєРѕР»СЊРєРёС… РіРѕСЂРѕРґР°С… РјРёСЂР°',
      parameters: { type:'object', properties:{ cities:{type:'string',description:'РіРѕСЂРѕРґР° С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ: РњРѕСЃРєРІР°,РўРѕРєРёРѕ,РќСЊСЋ-Р™РѕСЂРє'} }, required:['cities'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'lorem_ipsum',
      description: 'Р“РµРЅРµСЂРёСЂСѓРµС‚ lorem ipsum С‚РµРєСЃС‚-Р·Р°РіР»СѓС€РєСѓ',
      parameters: { type:'object', properties:{ paragraphs:{type:'number'}, language:{type:'string',description:'lorem, ru, en'} }, required:[] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ascii_art',
      description: 'РЎРѕР·РґР°С‘С‚ ASCII-Р°СЂС‚ РёР· С‚РµРєСЃС‚Р° РёР»Рё СЂРёСЃСѓРµС‚ РїСЂРѕСЃС‚С‹Рµ С„РёРіСѓСЂС‹',
      parameters: { type:'object', properties:{ text:{type:'string'}, style:{type:'string',description:'block, shadow, banner, digital'} }, required:['text'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'markdown_preview',
      description: 'РљРѕРЅРІРµСЂС‚РёСЂСѓРµС‚ Markdown РІ РєСЂР°СЃРёРІС‹Р№ HTML Рё СЃРѕС…СЂР°РЅСЏРµС‚ РєР°Рє С„Р°Р№Р»',
      parameters: { type:'object', properties:{ markdown:{type:'string'}, title:{type:'string'} }, required:['markdown'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sql_format',
      description: 'Форматирует и валидирует SQL запросы, объясняет что делает запрос',
      parameters: { type:'object', properties:{ sql:{type:'string'}, action:{type:'string',description:'format, explain, optimize'} }, required:['sql','action'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'uuid_generate',
      description: 'Генерирует UUID v4 идентификаторы',
      parameters: { type:'object', properties:{ count:{type:'number'} }, required:[] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'slugify_text',
      description: 'Преобразует текст в URL-safe slug',
      parameters: { type:'object', properties:{ text:{type:'string'} }, required:['text'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'csv_to_json',
      description: 'Конвертирует CSV текст в JSON-массив',
      parameters: { type:'object', properties:{ csv:{type:'string'} }, required:['csv'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'json_to_csv',
      description: 'Конвертирует JSON-массив объектов в CSV',
      parameters: { type:'object', properties:{ json:{type:'string'} }, required:['json'] }
    }
  }
];

// в”Ђв”Ђ РЈС‚РёР»РёС‚С‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function aiGetSession(username) {
  if (!aiConversations.has(username)) {
    aiConversations.set(username, { history: [], msgCount: 0, debugMode: false, thinking: false, multiagent: false });
  }
  const sess = aiConversations.get(username);
  if (sess.thinking   === undefined) sess.thinking   = false;
  if (sess.multiagent === undefined) sess.multiagent = false;
  return sess;
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
  const safe   = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  files.push({ id: fileId, name: safe, content, ttl: AI_FILE_TTL, description: description || '', created: new Date().toISOString() });
  aiUserFiles.set(username, files);
  scheduleAiFilesSave(); // СЃРѕС…СЂР°РЅСЏРµРј С„Р°Р№Р»С‹ РїРѕСЃР»Рµ РґРѕР±Р°РІР»РµРЅРёСЏ
  return { fileId, safe };
}

function aiBuildAskUserFromText(text) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const looksQuestion = /\?[\s]*$/.test(clean) || /^СѓС‚РѕС‡РЅРё|^РїРѕРґСЃРєР°Р¶Рё|^РєР°РєРѕР№|^РєР°РєР°СЏ|^РєР°РєРёРµ|^РЅСѓР¶РЅРѕ СѓС‚РѕС‡РЅРёС‚СЊ/i.test(clean);
  if (!looksQuestion) return null;
  return {
    questions: [{
      question: clean,
      options: ['РџСЂРѕРґРѕР»Р¶Р°Р№ СЃ Р»СѓС‡С€РёРј РІР°СЂРёР°РЅС‚РѕРј', 'РџРѕРєР°Р¶Рё РІР°СЂРёР°РЅС‚С‹', 'РћС‚РјРµРЅР°'],
      multi_select: false,
      allow_custom: true,
      required: true,
    }]
  };
}

// в”Ђв”Ђ Р’С‹РїРѕР»РЅРµРЅРёРµ РёРЅСЃС‚СЂСѓРјРµРЅС‚РѕРІ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function executeTool(name, args, username) {
  try {

    // в”Ђв”Ђ Р’СЂРµРјСЏ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'get_time') {
      const now = new Date();
      const days = ['Р’РѕСЃРєСЂРµСЃРµРЅСЊРµ','РџРѕРЅРµРґРµР»СЊРЅРёРє','Р’С‚РѕСЂРЅРёРє','РЎСЂРµРґР°','Р§РµС‚РІРµСЂРі','РџСЏС‚РЅРёС†Р°','РЎСѓР±Р±РѕС‚Р°'];
      return `${days[now.getDay()]}, ${now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (РњРЎРљ)`;
    }

    // в”Ђв”Ђ РљР°Р»СЊРєСѓР»СЏС‚РѕСЂ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'calculate') {
      const expr = (args.expression || '').replace(/[^0-9+\-*/().,\s%eE]/g, '').trim();
      if (!expr) return 'РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РІС‹СЂР°Р¶РµРЅРёРµ';
      try {
        const result = Function('"use strict"; return (' + expr + ')')();
        const fmt = (n) => Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(10)).toString();
        return `${args.expression} = **${fmt(result)}**`;
      } catch { return 'РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹С‡РёСЃР»РёС‚СЊ РІС‹СЂР°Р¶РµРЅРёРµ'; }
    }

    // в”Ђв”Ђ РџРѕРёСЃРє РІ РёРЅС‚РµСЂРЅРµС‚Рµ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'web_search') {
      const q = args.query || '';
      aiSseEmit(username, 'log', { icon: 'рџ”Ќ', text: `РС‰Сѓ: ${q}`, type: 'search' });
      let result = '';

      // РџСЂРѕР±СѓРµРј Wikipedia API РґР»СЏ С„Р°РєС‚РёС‡РµСЃРєРёС… Р·Р°РїСЂРѕСЃРѕРІ
      try {
        const lang = /[Р°-СЏС‘]/i.test(q) ? 'ru' : 'en';
        const wikiR = await axios.get(
          `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=&format=json&srlimit=3`,
          { timeout: 5000 }
        );
        const hits = wikiR.data?.query?.search || [];
        if (hits.length) {
          result += `Wikipedia:\n`;
          for (const h of hits.slice(0, 2)) {
            const snippet = h.snippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
            result += `вЂў **${h.title}**: ${snippet}\n`;
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
        if (d.Answer)         result += 'РћС‚РІРµС‚: ' + d.Answer + '\n';
        if (d.Definition)     result += 'РћРїСЂРµРґРµР»РµРЅРёРµ: ' + d.Definition + '\n';
        if (d.RelatedTopics?.length) {
          d.RelatedTopics.slice(0, 3).forEach(t => { if (t.Text) result += `вЂў ${t.Text}\n`; });
        }
      } catch {}

      if (!result) result = `РџРѕ Р·Р°РїСЂРѕСЃСѓ "${q}" РІРЅРµС€РЅРёРµ РёСЃС‚РѕС‡РЅРёРєРё РЅРµ РґР°Р»Рё СЂРµР·СѓР»СЊС‚Р°С‚Р°. РћС‚РІРµС‡Сѓ РїРѕ СЃРІРѕРёРј Р·РЅР°РЅРёСЏРј.`;
      return result.trim().slice(0, 3000);
    }

    // в”Ђв”Ђ РџРѕРіРѕРґР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'get_weather') {
      aiSseEmit(username, 'log', { icon: 'рџЊ¤', text: `РџРѕРіРѕРґР°: ${args.city}`, type: 'fetch' });
      const geoR = await axios.get(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.city)}&count=1&language=ru&format=json`,
        { timeout: 6000 }
      );
      const loc = geoR.data?.results?.[0];
      if (!loc) return `Р“РѕСЂРѕРґ "${args.city}" РЅРµ РЅР°Р№РґРµРЅ`;

      const wR = await axios.get(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=auto&forecast_days=3`,
        { timeout: 6000 }
      );
      const c = wR.data?.current;
      const daily = wR.data?.daily;
      const wCode = c?.weather_code || 0;
      const wEmoji = wCode === 0 ? 'вЂпёЏ' : wCode <= 3 ? 'в›…' : wCode <= 48 ? 'вЃпёЏ' : wCode <= 67 ? 'рџЊ§' : wCode <= 77 ? 'вќ„пёЏ' : 'в›€';
      const wDesc  = wCode === 0 ? 'РЇСЃРЅРѕ' : wCode <= 3 ? 'РџРµСЂРµРјРµРЅРЅР°СЏ РѕР±Р»Р°С‡РЅРѕСЃС‚СЊ' : wCode <= 48 ? 'РџР°СЃРјСѓСЂРЅРѕ' : wCode <= 67 ? 'Р”РѕР¶РґСЊ' : wCode <= 77 ? 'РЎРЅРµРі' : 'Р“СЂРѕР·Р°';

      let result = `**${loc.name}** СЃРµР№С‡Р°СЃ: ${c?.temperature_2m}В°C (РѕС‰СѓС‰Р°РµС‚СЃСЏ ${c?.apparent_temperature}В°C)\n`;
      result += `${wEmoji} ${wDesc}, РІР»Р°Р¶РЅРѕСЃС‚СЊ ${c?.relative_humidity_2m}%, РІРµС‚РµСЂ ${c?.wind_speed_10m} РєРј/С‡\n\n`;
      result += `РџСЂРѕРіРЅРѕР·:\n`;
      if (daily?.time) {
        daily.time.slice(0, 3).forEach((date, i) => {
          const dCode = daily.weather_code?.[i] || 0;
          const dEmoji = dCode <= 3 ? 'вЂпёЏ' : dCode <= 48 ? 'в›…' : dCode <= 67 ? 'рџЊ§' : dCode <= 77 ? 'вќ„пёЏ' : 'в›€';
          const d = new Date(date);
          const dayName = ['Р’СЃ','РџРЅ','Р’С‚','РЎСЂ','Р§С‚','РџС‚','РЎР±'][d.getDay()];
          result += `вЂў ${dayName} ${d.getDate()}: ${dEmoji} ${daily.temperature_2m_min?.[i]}вЂ¦${daily.temperature_2m_max?.[i]}В°C`;
          if (daily.precipitation_sum?.[i] > 0) result += ` рџ’§${daily.precipitation_sum[i]}РјРј`;
          result += '\n';
        });
      }
      return result.trim();
    }

    // в”Ђв”Ђ РљРѕРЅРІРµСЂС‚Р°С†РёСЏ РІР°Р»СЋС‚ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'convert_currency') {
      const { from, to, amount = 1 } = args;
      aiSseEmit(username, 'log', { icon: 'рџ’±', text: `РљСѓСЂСЃ ${from} в†’ ${to}`, type: 'fetch' });
      const fromU = from.toUpperCase();
      const toU   = to.toUpperCase();
      if (toU === fromU) return `1 ${fromU} = 1 ${toU}`;

      let rate = null;
      let source = '';

      // в”Ђв”Ђ API 1: Р¦РµРЅС‚СЂР°Р»СЊРЅС‹Р№ Р‘Р°РЅРє Р РѕСЃСЃРёРё (РґР»СЏ RUB) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
      if (fromU === 'RUB' || toU === 'RUB') {
        try {
          const cbr = await axios.get('https://www.cbr-xml-daily.ru/daily_json.js', { timeout: 7000 });
          const valutes = cbr.data?.Valute || {};
          if (fromU === 'RUB') {
            const v = valutes[toU];
            if (v) { rate = v.Nominal / v.Value; source = 'Р¦Р‘ Р Р¤'; }
          } else {
            const v = valutes[fromU];
            if (v) { rate = v.Value / v.Nominal; source = 'Р¦Р‘ Р Р¤'; }
          }
        } catch {}
      }

      // в”Ђв”Ђ API 2: ExchangeRate-API (open, Р±РµСЃРїР»Р°С‚РЅРѕ, РїРѕРґРґРµСЂР¶РёРІР°РµС‚ RUB) в”Ђв”Ђв”Ђв”Ђ
      if (!rate) {
        try {
          const r = await axios.get(`https://open.er-api.com/v6/latest/${fromU}`, { timeout: 7000 });
          const r2 = r.data?.rates?.[toU];
          if (r2) { rate = r2; source = 'ExchangeRate-API'; }
        } catch {}
      }

      // в”Ђв”Ђ API 3: Frankfurter (Р•Р¦Р‘, Р±РµР· RUB) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
      if (!rate) {
        try {
          const r = await axios.get(`https://api.frankfurter.app/latest?from=${fromU}&to=${toU}`, { timeout: 6000 });
          const r2 = r.data?.rates?.[toU];
          if (r2) { rate = r2; source = 'Frankfurter/Р•Р¦Р‘'; }
        } catch {}
      }

      // в”Ђв”Ђ API 4: Fixer.io (Р±РµСЃРїР»Р°С‚РЅС‹Р№ РїР»Р°РЅ С‡РµСЂРµР· РїСѓР±Р»РёС‡РЅС‹Р№ Р·РµСЂРєР°Р»СЊРЅС‹Р№ endpoint) в”Ђв”Ђ
      if (!rate) {
        try {
          const r = await axios.get(`https://api.exchangerate.host/latest?base=${fromU}&symbols=${toU}`, { timeout: 7000 });
          const r2 = r.data?.rates?.[toU];
          if (r2) { rate = r2; source = 'ExchangeRate.host'; }
        } catch {}
      }

      if (!rate) {
        return `РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ Р°РєС‚СѓР°Р»СЊРЅС‹Р№ РєСѓСЂСЃ ${fromU}/${toU}. РџСЂРѕРІРµСЂСЊ РЅР° СЃР°Р№С‚Рµ Р¦Р‘ Р Р¤: cbr.ru`;
      }

      const result = (amount * rate).toFixed(4).replace(/\.?0+$/, '');
      const rateStr = rate < 0.001 ? rate.toExponential(4) : rate >= 1000 ? rate.toFixed(2) : rate.toFixed(4).replace(/\.?0+$/, '');
      return `рџ’± РљСѓСЂСЃ (${source}):\n**1 ${fromU} = ${rateStr} ${toU}**\n${amount !== 1 ? `${amount} ${fromU} = **${result} ${toU}**` : ''}`.trim();
    }

    // в”Ђв”Ђ РџРµСЂРµРІРѕРґ С‚РµРєСЃС‚Р° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'translate') {
      aiSseEmit(username, 'log', { icon: 'рџЊђ', text: `РџРµСЂРµРІРѕРґ в†’ ${args.target_lang}`, type: 'process' });
      try {
        const r = await axios.get(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(args.text.slice(0, 500))}&langpair=auto|${args.target_lang}`,
          { timeout: 8000 }
        );
        const t = r.data?.responseData?.translatedText;
        return t ? `РџРµСЂРµРІРѕРґ (${args.target_lang}): **${t}**` : 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРµСЂРµРІРµСЃС‚Рё';
      } catch (e) { return 'РћС€РёР±РєР° РїРµСЂРµРІРѕРґР°: ' + e.message; }
    }

    // в”Ђв”Ђ РЎРѕР·РґР°РЅРёРµ С„Р°Р№Р»Р° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'create_file') {
      const { filename, content, description } = args;
      if (!filename || !content) return 'РќРµ СѓРєР°Р·Р°РЅРѕ РёРјСЏ С„Р°Р№Р»Р° РёР»Рё СЃРѕРґРµСЂР¶РёРјРѕРµ';
      aiSseEmit(username, 'log', { icon: 'рџ“„', text: `РЎРѕР·РґР°СЋ С„Р°Р№Р»: ${filename}`, type: 'write' });
      const { fileId, safe } = aiSaveFile(username, filename, content, description);
      return `FILE_CREATED:${fileId}:${safe}:${description || ''}:${content.length}`;
    }

    // в”Ђв”Ђ РђРЅР°Р»РёР· Р°СЂС…РёРІР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'analyze_archive') {
      // РђСЂС…РёРІ РїСЂРёС…РѕРґРёС‚ РєР°Рє С‚РµРєСЃС‚РѕРІС‹Р№ С„Р°Р№Р» СЃ Р»РёСЃС‚РёРЅРіРѕРј (РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РїСЂРёР»РѕР¶РёР»)
      const info = args.archive_info || '';
      return `РђРЅР°Р»РёР· Р°СЂС…РёРІР°: ${args.action}. ${info ? 'Р”Р°РЅРЅС‹Рµ РёР· РєРѕРЅС‚РµРєСЃС‚Р°: ' + info.slice(0, 500) : 'РџСЂРёРєСЂРµРїРё Р°СЂС…РёРІ РєР°Рє С„Р°Р№Р» С‡С‚РѕР±С‹ СЏ РјРѕРі РµРіРѕ РїСЂРѕР°РЅР°Р»РёР·РёСЂРѕРІР°С‚СЊ.'}`;
    }

    // в”Ђв”Ђ Р“РµРЅРµСЂР°С†РёСЏ РґР°РЅРЅС‹С… в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'generate_data') {
      const { type, description, rows = 10 } = args;
      aiSseEmit(username, 'log', { icon: 'рџ“Љ', text: `Р“РµРЅРµСЂРёСЂСѓСЋ ${type.toUpperCase()} РґР°РЅРЅС‹Рµ...`, type: 'process' });
      // Р“РµРЅРµСЂРёСЂСѓРµРј С‡РµСЂРµР· РІС‚РѕСЂРѕР№ Р·Р°РїСЂРѕСЃ Рє Mistral
      const genResp = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-small-latest',
        messages: [{
          role: 'user',
          content: `РЎРіРµРЅРµСЂРёСЂСѓР№ ${rows} СЃС‚СЂРѕРє РґР°РЅРЅС‹С… РІ С„РѕСЂРјР°С‚Рµ ${type.toUpperCase()} РґР»СЏ: ${description}. Р’РµСЂРЅРё РўРћР›Р¬РљРћ РґР°РЅРЅС‹Рµ Р±РµР· РїРѕСЏСЃРЅРµРЅРёР№.`
        }],
        max_tokens: 2000,
        temperature: 0.3,
      }, {
        headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 20000,
      });
      const data = genResp.data.choices?.[0]?.message?.content || '';
      // РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЃРѕС…СЂР°РЅСЏРµРј РєР°Рє С„Р°Р№Р»
      const ext = type === 'csv' ? 'csv' : type === 'json' ? 'json' : type === 'sql' ? 'sql' : type === 'yaml' ? 'yaml' : 'txt';
      const fname = `generated_data.${ext}`;
      const { fileId, safe } = aiSaveFile(username, fname, data, `РЎРіРµРЅРµСЂРёСЂРѕРІР°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ ${type.toUpperCase()}`);
      return `FILE_CREATED:${fileId}:${safe}:РЎРіРµРЅРµСЂРёСЂРѕРІР°РЅРЅС‹Рµ РґР°РЅРЅС‹Рµ (${type.toUpperCase()}):${data.length}\nРџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ:\n${data.slice(0, 300)}...`;
    }

    // в”Ђв”Ђ РљСЂРёРїС‚РѕРІР°Р»СЋС‚С‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'get_crypto') {
      aiSseEmit(username, 'log', { icon: 'в‚ї', text: `РљСЂРёРїС‚Рѕ: ${args.coins}`, type: 'fetch' });
      const coins = (args.coins || 'BTC,ETH').split(',').map(c => c.trim().toLowerCase()).join(',');
      const r = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coins}&vs_currencies=usd,rub&include_24hr_change=true`,
        { timeout: 8000 }
      );
      const prices = r.data || {};
      let result = '**РљСѓСЂСЃС‹ РєСЂРёРїС‚РѕРІР°Р»СЋС‚:**\n';
      for (const [coin, data] of Object.entries(prices)) {
        const change = data.usd_24h_change?.toFixed(2);
        const arrow  = change > 0 ? 'рџ“€' : 'рџ“‰';
        result += `вЂў ${coin.toUpperCase()}: $${data.usd?.toLocaleString()} (${change}% ${arrow}) / ${data.rub?.toLocaleString()} в‚Ѕ\n`;
      }
      return result.trim();
    }

    // в”Ђв”Ђ URL РёРЅС„Рѕ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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

    // в”Ђв”Ђ Wikipedia РїРѕРёСЃРє в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'wiki_search') {
      aiSseEmit(username, 'log', { icon: 'рџ“–', text: `Wikipedia: ${args.query}`, type: 'search' });
      const lang = args.language || (/[Р°-СЏС‘]/i.test(args.query) ? 'ru' : 'en');
      const q = encodeURIComponent(args.query);
      // РџРѕР»СѓС‡Р°РµРј РёР·РІР»РµС‡РµРЅРёРµ СЃС‚Р°С‚СЊРё
      const r = await axios.get(
        `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&utf8=&format=json&srlimit=1`,
        { timeout: 6000 }
      );
      const hit = r.data?.query?.search?.[0];
      if (!hit) return `Wikipedia: СЃС‚Р°С‚СЊСЏ РїРѕ "${args.query}" РЅРµ РЅР°Р№РґРµРЅР°`;
      // РџРѕР»СѓС‡Р°РµРј С‚РµРєСЃС‚
      const r2 = await axios.get(
        `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(hit.title)}&prop=extracts&exintro=true&explaintext=true&format=json`,
        { timeout: 6000 }
      );
      const pages = r2.data?.query?.pages || {};
      const page  = Object.values(pages)[0];
      const extract = (page?.extract || hit.snippet.replace(/<[^>]+>/g,'')).slice(0, 2000);
      return `**Wikipedia: ${hit.title}**\n${extract}`;
    }

    // в”Ђв”Ђ РљРѕС‚РёСЂРѕРІРєРё Р°РєС†РёР№ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'get_stock') {
      aiSseEmit(username, 'log', { icon: 'рџ“€', text: `РљРѕС‚РёСЂРѕРІРєР°: ${args.symbol}`, type: 'fetch' });
      const sym = (args.symbol || '').toUpperCase().trim();
      try {
        // Yahoo Finance API (РЅРµРѕС„РёС†РёР°Р»СЊРЅС‹Р№, Р±РµСЃРїР»Р°С‚РЅС‹Р№)
        const r = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`,
          { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const meta   = r.data?.chart?.result?.[0]?.meta;
        if (!meta) return `РўРёРєРµСЂ "${sym}" РЅРµ РЅР°Р№РґРµРЅ`;
        const price  = meta.regularMarketPrice;
        const prev   = meta.chartPreviousClose || meta.previousClose;
        const change = prev ? ((price - prev) / prev * 100).toFixed(2) : null;
        const arrow  = change > 0 ? 'рџ“€' : change < 0 ? 'рџ“‰' : 'вћЎпёЏ';
        const curr   = meta.currency || 'USD';
        let result = `**${meta.longName || sym} (${sym})**\nР¦РµРЅР°: **${price} ${curr}** ${arrow}`;
        if (change) result += ` (${change > 0 ? '+' : ''}${change}%)`;
        result += `\nР С‹РЅРѕРє: ${meta.exchangeName || ''}`;
        if (meta.marketCap) result += ` В· РљР°РїРёС‚Р°Р»РёР·Р°С†РёСЏ: $${(meta.marketCap/1e9).toFixed(2)}B`;
        return result;
      } catch (e) { return `РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РєРѕС‚РёСЂРѕРІРєСѓ ${sym}: ${e.message}`; }
    }

    // в”Ђв”Ђ РљРѕРЅРІРµСЂС‚Р°С†РёСЏ С‡Р°СЃРѕРІС‹С… РїРѕСЏСЃРѕРІ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'timezone_convert') {
      try {
        const timeStr = args.time && args.time !== 'СЃРµР№С‡Р°СЃ' ? args.time : null;
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
        return `рџ•ђ ${fromTz}: **${source}** (${dateFrom})\nрџ•ђ ${toTz}: **${converted}** (${dateTo})`;
      } catch(e) { return 'РћС€РёР±РєР° РєРѕРЅРІРµСЂС‚Р°С†РёРё РІСЂРµРјРµРЅРё: ' + e.message; }
    }

    // в”Ђв”Ђ QR-РєРѕРґ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'qr_generate') {
      const text = args.text || '';
      const size = Math.min(Math.max(args.size || 200, 100), 500);
      // РЎРѕР·РґР°С‘Рј HTML С„Р°Р№Р» СЃ QR С‡РµСЂРµР· Google Charts API (СЂР°Р±РѕС‚Р°РµС‚ РІ Р±СЂР°СѓР·РµСЂРµ)
      const encodedText = encodeURIComponent(text);
      const qrUrl = `https://chart.googleapis.com/chart?chs=${size}x${size}&cht=qr&chl=${encodedText}&choe=UTF-8`;
      const html = `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><title>QR-РєРѕРґ</title>
<style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f4f8;font-family:sans-serif}
.card{background:#fff;border-radius:20px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,.1);text-align:center}
img{border-radius:10px}p{margin:16px 0 0;color:#6366f1;font-size:14px;word-break:break-all;max-width:${size}px}</style></head>
<body><div class="card">
<img src="${qrUrl}" width="${size}" height="${size}" alt="QR">
<p>${text.slice(0,80)}${text.length>80?'...':''}</p>
</div></body></html>`;
      const { fileId, safe } = aiSaveFile(username, 'qrcode.html', html);
      return `FILE_CREATED:${fileId}:${safe}:QR-РєРѕРґ РґР»СЏ: ${text.slice(0,40)}:${html.length}`;
    }

    // в”Ђв”Ђ Р¦РІРµС‚РѕРІР°СЏ РїР°Р»РёС‚СЂР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'color_palette') {
      const count = Math.min(Math.max(args.count || 5, 3), 10);
      // РџСЂРѕСЃРёРј Mistral СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РїР°Р»РёС‚СЂСѓ
      const palR = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-small-latest',
        messages: [{ role:'user', content:`Generate ${count} harmonious colors for "${args.input}". Reply ONLY with JSON array: [{"hex":"#FF5733","name":"Coral Red","rgb":"255,87,51"},...]. No explanation.` }],
        max_tokens: 400, temperature: 0.8
      }, { headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type':'application/json' }, timeout: 15000 });
      let colors = [];
      try { colors = JSON.parse(palR.data.choices[0].message.content.replace(/```json?|```/g,'')); } catch {}
      if (!colors.length) return 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РїР°Р»РёС‚СЂСѓ';
      const swatches = colors.map(c =>
        `<div class="swatch" style="background:${c.hex}"><div class="label"><strong>${c.hex}</strong><br>${c.name||''}</div></div>`
      ).join('');
      const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>РџР°Р»РёС‚СЂР°</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#111;min-height:100vh;display:flex;align-items:center;justify-content:center}
.palette{display:flex;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.5);height:300px;width:min(90vw,700px)}
.swatch{flex:1;display:flex;align-items:flex-end;transition:flex .3s}.swatch:hover{flex:2}
.label{background:rgba(0,0,0,.5);width:100%;padding:10px 8px;color:#fff;font-size:12px;text-align:center;backdrop-filter:blur(4px)}</style></head>
<body><div class="palette">${swatches}</div></body></html>`;
      const { fileId, safe } = aiSaveFile(username, 'palette.html', html);
      return `FILE_CREATED:${fileId}:${safe}:Р¦РІРµС‚РѕРІР°СЏ РїР°Р»РёС‚СЂР° "${args.input}":${html.length}\nР¦РІРµС‚Р°: ${colors.map(c=>c.hex).join(' ')}`;
    }

    // в”Ђв”Ђ РљРѕРЅРІРµСЂС‚Р°С†РёСЏ РµРґРёРЅРёС† в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'unit_convert') {
      const { value, from, to } = args;
      const f = from.toLowerCase().trim();
      const t = to.toLowerCase().trim();
      const conv = {
        // Р”Р»РёРЅР° (Р±Р°Р·РѕРІР°СЏ: РјРµС‚СЂ)
        km:1000, m:1, cm:0.01, mm:0.001, mi:1609.34, yd:0.9144, ft:0.3048, in:0.0254,
        // Р’РµСЃ (Р±Р°Р·РѕРІР°СЏ: РєРі)
        kg:1, g:0.001, mg:0.000001, lb:0.453592, oz:0.0283495, t:1000,
        // РћР±СЉС‘Рј (Р±Р°Р·РѕРІР°СЏ: Р»РёС‚СЂ)
        l:1, ml:0.001, m3:1000, gal:3.78541, fl_oz:0.0295735, cup:0.236588,
        // РЎРєРѕСЂРѕСЃС‚СЊ (Р±Р°Р·РѕРІР°СЏ: РєРј/С‡)
        kmh:1, mph:1.60934, ms:3.6, knot:1.852,
        // РџР»РѕС‰Р°РґСЊ (Р±Р°Р·РѕРІР°СЏ: РјВІ)
        m2:1, km2:1e6, ha:10000, acre:4046.86, ft2:0.0929,
      };
      // РўРµРјРїРµСЂР°С‚СѓСЂР° вЂ” РѕСЃРѕР±С‹Р№ СЃР»СѓС‡Р°Р№
      const tempPairs = {
        'cв†’f': v => v*9/5+32, 'fв†’c': v => (v-32)*5/9,
        'cв†’k': v => v+273.15, 'kв†’c': v => v-273.15,
        'fв†’k': v => (v-32)*5/9+273.15, 'kв†’f': v => (v-273.15)*9/5+32,
      };
      const tKey = `${f}в†’${t}`;
      if (tempPairs[tKey]) {
        const r = tempPairs[tKey](value);
        return `**${value}В°${f.toUpperCase()} = ${r.toFixed(4).replace(/\.?0+$/,'')}В°${t.toUpperCase()}**`;
      }
      if (conv[f] && conv[t]) {
        const base   = value * conv[f];
        const result = base / conv[t];
        const fmt = n => Math.abs(n) < 0.001 ? n.toExponential(4) : parseFloat(n.toFixed(6)).toString();
        return `**${value} ${from} = ${fmt(result)} ${to}**`;
      }
      return `РќРµ Р·РЅР°СЋ РєР°Рє РєРѕРЅРІРµСЂС‚РёСЂРѕРІР°С‚СЊ ${from} в†’ ${to}`;
    }

    // в”Ђв”Ђ РЎР»РѕРІР°СЂСЊ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'dictionary') {
      const lang = args.language || 'en';
      const word = encodeURIComponent(args.word);
      if (lang === 'en') {
        const r = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`, { timeout: 6000 });
        const entry = r.data?.[0];
        if (!entry) return `РЎР»РѕРІРѕ "${args.word}" РЅРµ РЅР°Р№РґРµРЅРѕ`;
        const meanings = entry.meanings?.slice(0, 2).map(m => {
          const defs = m.definitions?.slice(0, 2).map(d => `  вЂў ${d.definition}${d.example ? ` (РїСЂРёРјРµСЂ: _${d.example}_)` : ''}`).join('\n');
          const syns = m.synonyms?.slice(0,4).join(', ');
          return `**${m.partOfSpeech}**\n${defs}${syns ? `\n  СЃРёРЅРѕРЅРёРјС‹: ${syns}` : ''}`;
        }).join('\n\n');
        const phonetic = entry.phonetics?.find(p=>p.text)?.text || '';
        return `рџ“– **${entry.word}** ${phonetic}\n\n${meanings}`;
      } else {
        // Р”Р»СЏ РґСЂСѓРіРёС… СЏР·С‹РєРѕРІ РёСЃРїРѕР»СЊР·СѓРµРј Wiktionary
        const r = await axios.get(
          `https://${lang}.wiktionary.org/w/api.php?action=query&titles=${word}&prop=extracts&exintro=true&explaintext=true&format=json`,
          { timeout: 6000 }
        );
        const pages = r.data?.query?.pages || {};
        const page = Object.values(pages)[0];
        return page?.extract ? `рџ“– **${args.word}**\n${page.extract.slice(0,1000)}` : `"${args.word}" РЅРµ РЅР°Р№РґРµРЅРѕ РІ Wiktionary`;
      }
    }

    // в”Ђв”Ђ РџСЂСЏРјРѕР№ Р·Р°РїСѓСЃРє РєРѕРґР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'run_code') {
      const { code, language } = args;
      const lang = (language || '').toLowerCase();
      aiSseEmit(username, 'log', { text: `Р—Р°РїСѓСЃРєР°СЋ ${lang} РєРѕРґ...`, type: 'check' });
      const { execSync } = require('child_process');
      const tmpFile = require('path').join(require('os').tmpdir(), `run_${Date.now()}.${lang === 'python' ? 'py' : 'js'}`);
      try {
        fs.writeFileSync(tmpFile, code, 'utf8');
        const dangerous = /import\s+os|import\s+subprocess|require\s*\(\s*['"]child_process|exec\s*\(|spawn\s*\(/i;
        if (dangerous.test(code)) return 'вљ пёЏ РљРѕРґ СЃРѕРґРµСЂР¶РёС‚ СЃРёСЃС‚РµРјРЅС‹Рµ РІС‹Р·РѕРІС‹ вЂ” Р·Р°РїСѓСЃРє РЅРµРІРѕР·РјРѕР¶РµРЅ РІ sandbox.';
        const cmd = lang === 'python' ? `python3 "${tmpFile}"` : `node "${tmpFile}"`;
        const out = execSync(cmd, { timeout: 10000, encoding: 'utf8', maxBuffer: 100000 });
        aiSseEmit(username, 'log', { text: 'Р’С‹РїРѕР»РЅРµРЅРѕ СѓСЃРїРµС€РЅРѕ', type: 'result' });
        return `вњ… Р РµР·СѓР»СЊС‚Р°С‚:\n\`\`\`\n${out.slice(0, 1000)}\n\`\`\``;
      } catch(e) {
        aiSseEmit(username, 'log', { text: 'РћС€РёР±РєР° РІС‹РїРѕР»РЅРµРЅРёСЏ', type: 'check' });
        return `вќЊ РћС€РёР±РєР°:\n\`\`\`\n${(e.stdout || e.message).slice(0,600)}\n\`\`\``;
      } finally { try { fs.unlinkSync(tmpFile); } catch {} }
    }

    // в”Ђв”Ђ Regex С‚РµСЃС‚ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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
        if (!matches.length) return `РџР°С‚С‚РµСЂРЅ \`${args.pattern}\` вЂ” СЃРѕРІРїР°РґРµРЅРёР№ РЅРµС‚`;
        let result = `РџР°С‚С‚РµСЂРЅ \`${args.pattern}\` вЂ” РЅР°Р№РґРµРЅРѕ ${matches.length} СЃРѕРІРїР°РґРµРЅРёР№:\n`;
        matches.slice(0,10).forEach((m,i) => {
          result += `${i+1}. \`${m.match}\` (pos: ${m.index})${m.groups.filter(Boolean).length ? ' groups: ' + m.groups.join(', ') : ''}\n`;
        });
        return result;
      } catch(e) { return `РћС€РёР±РєР° regex: ${e.message}`; }
    }

    // в”Ђв”Ђ РљРѕРґРёСЂРѕРІР°РЅРёРµ/РґРµРєРѕРґРёСЂРѕРІР°РЅРёРµ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'encode_decode') {
      const { text, mode } = args;
      const crypto = require('crypto');
      try {
        switch(mode) {
          case 'base64_encode': return `Base64: \`${Buffer.from(text).toString('base64')}\``;
          case 'base64_decode': return `Р”РµРєРѕРґРёСЂРѕРІР°РЅРѕ: \`${Buffer.from(text, 'base64').toString('utf8')}\``;
          case 'url_encode':   return `URL: \`${encodeURIComponent(text)}\``;
          case 'url_decode':   return `URL decoded: \`${decodeURIComponent(text)}\``;
          case 'hex':          return `HEX: \`${Buffer.from(text).toString('hex')}\``;
          case 'md5':          return `MD5: \`${crypto.createHash('md5').update(text).digest('hex')}\``;
          case 'sha256':       return `SHA-256: \`${crypto.createHash('sha256').update(text).digest('hex')}\``;
          case 'html_escape':  return `HTML: \`${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}\``;
          case 'html_unescape':return `Unescaped: \`${text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')}\``;
          default: return `РќРµРёР·РІРµСЃС‚РЅС‹Р№ СЂРµР¶РёРј: ${mode}`;
        }
      } catch(e) { return `РћС€РёР±РєР°: ${e.message}`; }
    }

    // в”Ђв”Ђ JSON С„РѕСЂРјР°С‚РёСЂРѕРІР°РЅРёРµ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'json_format') {
      const { json, action, key } = args;
      try {
        const parsed = JSON.parse(json);
        if (action === 'format')   return `\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;
        if (action === 'minify')   return `\`${JSON.stringify(parsed)}\``;
        if (action === 'validate') return `вњ… Р’Р°Р»РёРґРЅС‹Р№ JSON: ${Object.keys(parsed).length} РєР»СЋС‡РµР№ РІРµСЂС…РЅРµРіРѕ СѓСЂРѕРІРЅСЏ`;
        if (action === 'extract' && key) {
          const val = key.split('.').reduce((o,k) => o?.[k], parsed);
          return `**${key}**: \`${JSON.stringify(val)}\``;
        }
        return JSON.stringify(parsed, null, 2);
      } catch(e) { return `вќЊ РќРµРІР°Р»РёРґРЅС‹Р№ JSON: ${e.message}`; }
    }

    // в”Ђв”Ђ РџСЂРѕРІРµСЂРєР° Рё Р·Р°РїСѓСЃРє РєРѕРґР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'check_code') {
      const { code, language, filename } = args;
      aiSseEmit(username, 'log', { text: `РџСЂРѕРІРµСЂСЏСЋ ${language} РєРѕРґ...`, type: 'check' });
      const lang = (language || '').toLowerCase();
      let result = '';

      // Р‘Р°Р·РѕРІР°СЏ СЃРёРЅС‚Р°РєСЃРёС‡РµСЃРєР°СЏ РїСЂРѕРІРµСЂРєР° РґР»СЏ JS С‡РµСЂРµР· Node.js
      if (lang === 'javascript' || lang === 'js') {
        try {
          // Р—Р°РїСѓСЃРє РІ РёР·РѕР»РёСЂРѕРІР°РЅРЅРѕРј РєРѕРЅС‚РµРєСЃС‚Рµ Node.js (С‚РѕР»СЊРєРѕ СЃРёРЅС‚Р°РєСЃРёСЃ)
          const { execSync } = require('child_process');
          const tmpFile = require('path').join(require('os').tmpdir(), `check_${Date.now()}.js`);
          fs.writeFileSync(tmpFile, code, 'utf8');
          try {
            const output = execSync(`node --check "${tmpFile}" 2>&1`, { timeout: 5000, encoding: 'utf8' });
            result += `вњ… РЎРёРЅС‚Р°РєСЃРёСЃ JavaScript: OK\n`;
            // РџРѕРїСЂРѕР±СѓРµРј Р·Р°РїСѓСЃС‚РёС‚СЊ РµСЃР»Рё РЅРµС‚ РѕРїР°СЃРЅС‹С… РѕРїРµСЂР°С†РёР№
            const dangerous = /require\s*\(\s*['"]fs['"]\)|exec\s*\(|spawn\s*\(|child_process|process\.exit|__dirname/i;
            if (!dangerous.test(code)) {
              try {
                const runOut = execSync(`node "${tmpFile}" 2>&1`, { timeout: 5000, encoding: 'utf8', maxBuffer: 50000 });
                result += `\nв–¶ Р’С‹РІРѕРґ:\n\`\`\`\n${runOut.slice(0, 500)}\n\`\`\``;
                aiSseEmit(username, 'log', { text: 'РљРѕРґ РІС‹РїРѕР»РЅРµРЅ СѓСЃРїРµС€РЅРѕ', type: 'check' });
              } catch (runErr) {
                result += `\nвљ пёЏ РћС€РёР±РєР° РІС‹РїРѕР»РЅРµРЅРёСЏ:\n\`\`\`\n${runErr.stdout?.slice(0,400) || runErr.message}\n\`\`\``;
                aiSseEmit(username, 'log', { text: 'РћС€РёР±РєР° РІС‹РїРѕР»РЅРµРЅРёСЏ вЂ” РёСЃРїСЂР°РІР»СЏСЋ...', type: 'check' });
              }
            }
          } catch (e) {
            const errMsg = e.stdout || e.message || '';
            result += `вќЊ РЎРёРЅС‚Р°РєСЃРёС‡РµСЃРєР°СЏ РѕС€РёР±РєР° JavaScript:\n\`\`\`\n${errMsg.slice(0, 400)}\n\`\`\``;
            aiSseEmit(username, 'log', { text: 'РќР°Р№РґРµРЅС‹ СЃРёРЅС‚Р°РєСЃРёС‡РµСЃРєРёРµ РѕС€РёР±РєРё', type: 'check' });
          } finally {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
        } catch (e) {
          result = `РџСЂРѕРІРµСЂРєР° JS: ${e.message}`;
        }
      } else if (lang === 'python' || lang === 'py') {
        try {
          const { execSync } = require('child_process');
          const tmpFile = require('path').join(require('os').tmpdir(), `check_${Date.now()}.py`);
          fs.writeFileSync(tmpFile, code, 'utf8');
          try {
            // РЎРёРЅС‚Р°РєСЃРёСЃ
            execSync(`python3 -m py_compile "${tmpFile}" 2>&1`, { timeout: 5000, encoding: 'utf8' });
            result += `вњ… РЎРёРЅС‚Р°РєСЃРёСЃ Python: OK\n`;
            // Р‘РµР·РѕРїР°СЃРЅС‹Р№ Р·Р°РїСѓСЃРє (Р±РµР· РёРјРїРѕСЂС‚Р° os, subprocess, socket)
            const dangerous = /import\s+os|import\s+subprocess|import\s+socket|__import__|eval\s*\(|exec\s*\(/i;
            if (!dangerous.test(code)) {
              try {
                const runOut = execSync(`python3 "${tmpFile}" 2>&1`, { timeout: 8000, encoding: 'utf8', maxBuffer: 50000 });
                result += `\nв–¶ Р’С‹РІРѕРґ:\n\`\`\`\n${runOut.slice(0, 500)}\n\`\`\``;
                aiSseEmit(username, 'log', { text: 'Python РєРѕРґ РІС‹РїРѕР»РЅРµРЅ', type: 'check' });
              } catch (runErr) {
                result += `\nвљ пёЏ РћС€РёР±РєР°:\n\`\`\`\n${(runErr.stdout || runErr.message).slice(0,400)}\n\`\`\``;
                aiSseEmit(username, 'log', { text: 'РћС€РёР±РєР° РІС‹РїРѕР»РЅРµРЅРёСЏ Python', type: 'check' });
              }
            } else {
              result += `\nвљ пёЏ Р—Р°РїСѓСЃРє РїСЂРѕРїСѓС‰РµРЅ (РёРјРїРѕСЂС‚ СЃРёСЃС‚РµРјРЅС‹С… РјРѕРґСѓР»РµР№). РЎРёРЅС‚Р°РєСЃРёСЃ РІРµСЂРЅС‹Р№.`;
            }
          } catch (e) {
            result += `вќЊ РЎРёРЅС‚Р°РєСЃРёС‡РµСЃРєР°СЏ РѕС€РёР±РєР° Python:\n\`\`\`\n${(e.stdout || e.message).slice(0,400)}\n\`\`\``;
            aiSseEmit(username, 'log', { text: 'РќР°Р№РґРµРЅС‹ РѕС€РёР±РєРё Python', type: 'check' });
          } finally {
            try { fs.unlinkSync(tmpFile); } catch {}
          }
        } catch (e) {
          result = `РџСЂРѕРІРµСЂРєР° Python: ${e.message}`;
        }
      } else {
        // Р”Р»СЏ РґСЂСѓРіРёС… СЏР·С‹РєРѕРІ вЂ” РїСЂРѕРІРµСЂСЏРµРј СЃС‚СЂСѓРєС‚СѓСЂСѓ С‡РµСЂРµР· AI
        result = `рџ“‹ ${lang.toUpperCase()}: СЃРёРЅС‚Р°РєСЃРёС‡РµСЃРєР°СЏ РїСЂРѕРІРµСЂРєР° С‡РµСЂРµР· СЃС‚Р°С‚РёС‡РµСЃРєРёР№ Р°РЅР°Р»РёР·.\nРљРѕРґ СЃРѕРґРµСЂР¶РёС‚ ${code.split('\n').length} СЃС‚СЂРѕРє, ${code.length} СЃРёРјРІРѕР»РѕРІ.`;
        aiSseEmit(username, 'log', { text: `${lang} РїСЂРѕРІРµСЂРµРЅ СЃС‚Р°С‚РёС‡РµСЃРєРё`, type: 'check' });
      }

      if (!result) result = 'вњ… РџСЂРѕРІРµСЂРєР° Р·Р°РІРµСЂС€РµРЅР°';
      aiSseEmit(username, 'log', { text: 'РџСЂРѕРІРµСЂРєР° РєРѕРґР° Р·Р°РІРµСЂС€РµРЅР°', type: 'check' });
      return result;
    }

    // в”Ђв”Ђ РќРѕРІРѕСЃС‚Рё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'news_search') {
      aiSseEmit(username, 'log', { text: `РќРѕРІРѕСЃС‚Рё: ${args.query}`, type: 'search' });
      const lang = args.language || 'ru';
      try {
        // NewsData.io free tier (Р±РµР· РєР»СЋС‡Р° - Р±Р°Р·РѕРІС‹Р№ РїРѕРёСЃРє)
        const r = await axios.get(
          `https://newsdata.io/api/1/news?q=${encodeURIComponent(args.query)}&language=${lang}&size=5`,
          { timeout: 8000, headers: { 'X-ACCESS-KEY': process.env.NEWSDATA_KEY || '' } }
        );
        const articles = r.data?.results || [];
        if (!articles.length) {
          // Fallback: Wikipedia news
          return await executeTool('wiki_search', { query: args.query + ' 2025' }, username);
        }
        let result = `РќРѕРІРѕСЃС‚Рё РїРѕ "${args.query}":
`;
        articles.slice(0,4).forEach(a => {
          result += `вЂў **${a.title}** (${a.source_id || 'РЅРѕРІРѕСЃС‚Рё'})
  ${(a.description||'').slice(0,120)}
`;
        });
        aiSseEmit(username, 'log', { text: `РќР°Р№РґРµРЅРѕ ${articles.length} РЅРѕРІРѕСЃС‚РµР№`, type: 'result' });
        return result;
      } catch {
        // Fallback to DuckDuckGo news
        return await executeTool('web_search', { query: args.query + ' РЅРѕРІРѕСЃС‚Рё 2025' }, username);
      }
    }

    // в”Ђв”Ђ Р“РµРЅРµСЂР°С†РёСЏ РёР·РѕР±СЂР°Р¶РµРЅРёР№ (Pollinations.ai вЂ” Р±РµСЃРїР»Р°С‚РЅРѕ, Р±РµР· РєР»СЋС‡Р°) в”Ђв”Ђв”Ђв”Ђ
    if (name === 'image_generate') {
      const limitErr = checkDailyLimit(username, 'image');
      if (limitErr) return limitErr;
      const prompt = args.prompt || '';
      const style  = args.style  || 'realistic';
      aiSseEmit(username, 'log', { text: `Р“РµРЅРµСЂРёСЂСѓСЋ: ${prompt.slice(0,50)}... (${getDailyLimitInfo(username)})`, type: 'process' });
      const encodedPrompt = encodeURIComponent(`${prompt}, ${style}, high quality, detailed`);
      const engines = [
        `https://image.pollinations.ai/prompt/${encodedPrompt}?nologo=true&model=flux`,
        `https://image.pollinations.ai/prompt/${encodedPrompt}?width=800&height=600&nologo=true&model=flux`,
        `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true`,
      ];
      let imgBase64 = null;
      for (const url of engines) {
        try {
          aiSseEmit(username, 'log', { text: 'Р—Р°РіСЂСѓР¶Р°СЋ РїРёРєСЃРµР»СЏ...', type: 'fetch' });
          const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 40000 });
          imgBase64 = Buffer.from(r.data).toString('base64');
          break;
        } catch(e) { console.log('[img] failed:', e.message); }
      }
      if (!imgBase64) return 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ вЂ” РїРѕРїСЂРѕР±СѓР№ РґСЂСѓРіРѕР№ РїСЂРѕРјРїС‚.';
      aiSseEmit(username, 'media', { type: 'image', base64: 'data:image/jpeg;base64,' + imgBase64, prompt });
      const html = '<!DOCTYPE html><html><head><title>AI Image</title><style>body{margin:0;background:#0d0d12;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:95vw;max-height:95vh;border-radius:12px}</style></head><body><img src="data:image/jpeg;base64,' + imgBase64 + '"/></body></html>';
      const { fileId, safe } = aiSaveFile(username, 'ai_image.html', html, 'AI РёР·РѕР±СЂР°Р¶РµРЅРёРµ: ' + prompt.slice(0,40));
      aiSseEmit(username, 'log', { text: 'РР·РѕР±СЂР°Р¶РµРЅРёРµ РіРѕС‚РѕРІРѕ', type: 'result' });
      return 'FILE_CREATED:' + fileId + ':' + safe + ':AI РёР·РѕР±СЂР°Р¶РµРЅРёРµ:' + html.length;
    }

    // в”Ђв”Ђ РЎРѕР·РґР°РЅРёРµ РїСЂРµР·РµРЅС‚Р°С†РёРё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'create_presentation') {
      const { title, slides = [], animation_style = 'slide' } = args;
      aiSseEmit(username, 'log', { text: `РЎРѕР·РґР°СЋ РїСЂРµР·РµРЅС‚Р°С†РёСЋ: ${title}`, type: 'write' });
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
  <button onclick="prev()">в†ђ РќР°Р·Р°Рґ</button>
  <button onclick="next()">Р”Р°Р»РµРµ в†’</button>
</div>
<script>
let cur=0;const total=${slides.length};
function show(n){document.querySelectorAll('.slide').forEach((s,i)=>s.style.display=i===n?'flex':'none');cur=n;document.getElementById('prog').style.width=((n+1)/total*100)+'%';}
function next(){if(cur<total-1)show(cur+1);}
function prev(){if(cur>0)show(cur-1);}
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' ')next();if(e.key==='ArrowLeft')prev();});
document.querySelectorAll('.slide').forEach(s=>s.onclick=next);
</script></body></html>`;
      const { fileId, safe } = aiSaveFile(username, `${title.replace(/\s+/g,'_')}.html`, html, `РџСЂРµР·РµРЅС‚Р°С†РёСЏ: ${title}`);
      aiSseEmit(username, 'log', { text: `РџСЂРµР·РµРЅС‚Р°С†РёСЏ РіРѕС‚РѕРІР° (${slides.length} СЃР»Р°Р№РґРѕРІ)`, type: 'result' });
      return `FILE_CREATED:${fileId}:${safe}:РџСЂРµР·РµРЅС‚Р°С†РёСЏ "${title}" (${slides.length} СЃР»Р°Р№РґРѕРІ):${html.length}`;
    }

    // в”Ђв”Ђ РЎР»СѓС‡Р°Р№РЅС‹Рµ РґР°РЅРЅС‹Рµ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'random') {
      const { type, min=1, max=100, count=1, length=16 } = args;
      const crypto = require('crypto');
      switch(type) {
        case 'number': {
          const nums = Array.from({length:count}, () => Math.floor(Math.random()*(max-min+1))+min);
          return `рџЋІ РЎР»СѓС‡Р°Р№РЅ${count>1?'С‹Рµ С‡РёСЃР»Р°':'РѕРµ С‡РёСЃР»Рѕ'}: **${nums.join(', ')}**`;
        }
        case 'uuid':    return `рџ”‘ UUID: \`${crypto.randomUUID()}\``;
        case 'password': {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
          const pwd = Array.from({length}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
          return `рџ”ђ РџР°СЂРѕР»СЊ (${length} СЃРёРјРІ): \`${pwd}\``;
        }
        case 'color': {
          const hex = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0');
          return `рџЋЁ Р¦РІРµС‚: \`${hex}\` (RGB: ${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)})`;
        }
        case 'dice':  return `рџЋІ РљСѓР±РёРє d${max||6}: **${Math.floor(Math.random()*(max||6))+1}**`;
        case 'coin':  return `рџЄ™ РњРѕРЅРµС‚Р°: **${Math.random()>0.5?'РћСЂС‘Р»':'Р РµС€РєР°'}**`;
        case 'name': {
          const names = ['РђР»РµРєСЃР°РЅРґСЂ','Р”РјРёС‚СЂРёР№','РњРёС…Р°РёР»','РРІР°РЅ','РђРЅРґСЂРµР№','РђР»РµРєСЃРµР№','Р•Р»РµРЅР°','РќР°С‚Р°Р»СЊСЏ','РђРЅРЅР°','РњР°СЂРёСЏ','РћР»СЊРіР°','РўР°С‚СЊСЏРЅР°'];
          const surns = ['РРІР°РЅРѕРІ','РЎРјРёСЂРЅРѕРІ','РљСѓР·РЅРµС†РѕРІ','РџРѕРїРѕРІ','РЎРѕРєРѕР»РѕРІ','Р›РµР±РµРґРµРІ','РљРѕР·Р»РѕРІ','РќРѕРІРёРєРѕРІ','РњРѕСЂРѕР·РѕРІ','РџРµС‚СЂРѕРІ'];
          return `рџ‘¤ РРјСЏ: **${names[Math.floor(Math.random()*names.length)]} ${surns[Math.floor(Math.random()*surns.length)]}**`;
        }
        default: return `РќРµРёР·РІРµСЃС‚РЅС‹Р№ С‚РёРї: ${type}`;
      }
    }

    // в”Ђв”Ђ Р’С‹С‡РёСЃР»РµРЅРёСЏ СЃ РґР°С‚Р°РјРё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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
          return `рџ“… Р Р°Р·РЅРёС†Р°: **${years > 0 ? years + ' Р»РµС‚ ' : ''}${months > 0 ? months + ' РјРµСЃ ' : ''}${remDays} РґРЅ** (РІСЃРµРіРѕ ${totalDays} РґРЅРµР№)`;
        }
        case 'add': {
          const result = new Date(d1.getTime() + (days||0) * 86400000);
          return `рџ“… ${d1.toLocaleDateString('ru-RU')} + ${days} РґРЅРµР№ = **${result.toLocaleDateString('ru-RU')}**`;
        }
        case 'weekday': {
          const days_ru = ['РІРѕСЃРєСЂРµСЃРµРЅСЊРµ','РїРѕРЅРµРґРµР»СЊРЅРёРє','РІС‚РѕСЂРЅРёРє','СЃСЂРµРґР°','С‡РµС‚РІРµСЂРі','РїСЏС‚РЅРёС†Р°','СЃСѓР±Р±РѕС‚Р°'];
          return `рџ“… ${d1.toLocaleDateString('ru-RU')} вЂ” **${days_ru[d1.getDay()]}**`;
        }
        case 'age': {
          const now = new Date();
          const years = now.getFullYear() - d1.getFullYear() - (now < new Date(now.getFullYear(), d1.getMonth(), d1.getDate()) ? 1 : 0);
          return `рџЋ‚ Р’РѕР·СЂР°СЃС‚: **${years} Р»РµС‚** (${Math.floor((now-d1)/86400000)} РґРЅРµР№)`;
        }
        case 'countdown': {
          const target = new Date(date2 || date1);
          const ms2 = target - Date.now();
          if (ms2 < 0) return `рџ“… Р”Р°С‚Р° ${target.toLocaleDateString('ru-RU')} СѓР¶Рµ РїСЂРѕС€Р»Р°`;
          const d = Math.floor(ms2/86400000), h = Math.floor(ms2%86400000/3600000), m = Math.floor(ms2%3600000/60000);
          return `вЏі Р”Рѕ ${target.toLocaleDateString('ru-RU')}: **${d} РґРЅ ${h} С‡ ${m} РјРёРЅ**`;
        }
        default: return new Date().toLocaleString('ru-RU');
      }
    }

    // в”Ђв”Ђ РђРЅР°Р»РёР· С‚РµРєСЃС‚Р° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'text_analyze') {
      const { text, action } = args;
      switch(action) {
        case 'stats': {
          const words   = text.trim().split(/\s+/).filter(Boolean);
          const sents   = text.split(/[.!?]+/).filter(Boolean);
          const paras   = text.split(/\n\n+/).filter(Boolean);
          return `рџ“Љ РЎС‚Р°С‚РёСЃС‚РёРєР° С‚РµРєСЃС‚Р°:
вЂў РЎРёРјРІРѕР»РѕРІ: **${text.length}** (Р±РµР· РїСЂРѕР±РµР»РѕРІ: **${text.replace(/\s/g,'').length}**)
вЂў РЎР»РѕРІ: **${words.length}**
вЂў РџСЂРµРґР»РѕР¶РµРЅРёР№: **${sents.length}**
вЂў РђР±Р·Р°С†РµРІ: **${paras.length}**
вЂў РЎСЂРµРґРЅРµРµ СЃР»РѕРІ РІ РїСЂРµРґР»РѕР¶РµРЅРёРё: **${(words.length/Math.max(sents.length,1)).toFixed(1)}**`;
        }
        case 'frequency': {
          const words = text.toLowerCase().replace(/[^Р°-СЏС‘a-z\s]/gi,'').split(/\s+/).filter(w => w.length > 2);
          const freq  = {};
          words.forEach(w => freq[w] = (freq[w]||0) + 1);
          const top = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,10);
          const lines = top.map(([w,c]) => 'вЂў **' + w + '**: ' + c);
          return 'рџ“Љ РўРѕРї-10 СЃР»РѕРІ:\n' + lines.join('\n');
        }
        case 'sentiment': {
          const pos = (text.match(/С…РѕСЂРѕС€Рѕ|РѕС‚Р»РёС‡РЅРѕ|Р·Р°РјРµС‡Р°С‚РµР»СЊРЅРѕ|СЃСѓРїРµСЂ|РїСЂРµРєСЂР°СЃРЅРѕ|Р»СЋР±Р»СЋ|РЅСЂР°РІРёС‚СЃСЏ|Р·РґРѕСЂРѕРІРѕ|great|good|love|excellent|amazing|wonderful|happy/gi)||[]).length;
          const neg = (text.match(/РїР»РѕС…Рѕ|СѓР¶Р°СЃРЅРѕ|РЅРµРЅР°РІРёР¶Сѓ|РїСЂРѕРІР°Р»|РїСЂРѕР±Р»РµРјР°|РѕС€РёР±РєР°|bad|terrible|hate|fail|problem|error|awful|horrible/gi)||[]).length;
          const tone = pos > neg ? 'рџЉ РџРѕР·РёС‚РёРІРЅС‹Р№' : neg > pos ? 'рџ” РќРµРіР°С‚РёРІРЅС‹Р№' : 'рџђ РќРµР№С‚СЂР°Р»СЊРЅС‹Р№';
          return `рџЋ­ РўРѕРЅР°Р»СЊРЅРѕСЃС‚СЊ: **${tone}**
вЂў РџРѕР·РёС‚РёРІРЅС‹С… РјР°СЂРєРµСЂРѕРІ: ${pos}
вЂў РќРµРіР°С‚РёРІРЅС‹С… РјР°СЂРєРµСЂРѕРІ: ${neg}`;
        }
        default: return `РўРµРєСЃС‚: ${text.length} СЃРёРјРІРѕР»РѕРІ`;
      }
    }

    // в”Ђв”Ђ РџСЂРѕРґРІРёРЅСѓС‚Р°СЏ РјР°С‚РµРјР°С‚РёРєР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'math_advanced') {
      const { operation, values = [], n = 10 } = args;
      switch(operation) {
        case 'prime': {
          const isPrime = num => { if(num<2) return false; for(let i=2;i<=Math.sqrt(num);i++) if(num%i===0) return false; return true; };
          const primes = []; for(let i=2; primes.length<n; i++) if(isPrime(i)) primes.push(i);
          return `РџСЂРѕСЃС‚С‹Рµ С‡РёСЃР»Р° (РїРµСЂРІС‹Рµ ${n}): **${primes.join(', ')}**`;
        }
        case 'fibonacci': {
          const fib = [0,1]; while(fib.length < n) fib.push(fib[fib.length-1]+fib[fib.length-2]);
          return `Р§РёСЃР»Р° Р¤РёР±РѕРЅР°С‡С‡Рё (${n}): **${fib.join(', ')}**`;
        }
        case 'factorial': {
          const num = n || values[0] || 10;
          let result = 1n; for(let i=2n; i<=BigInt(num); i++) result *= i;
          return `${num}! = **${result}**`;
        }
        case 'gcd': {
          const gcd = (a,b) => b ? gcd(b,a%b) : a;
          const result = values.reduce(gcd);
          return `РќРћР”(${values.join(', ')}) = **${result}**`;
        }
        case 'statistics': {
          if (!values.length) return 'РќСѓР¶РЅС‹ С‡РёСЃР»Р°';
          const sorted = [...values].sort((a,b)=>a-b);
          const mean   = values.reduce((a,b)=>a+b,0)/values.length;
          const median = sorted.length%2 ? sorted[Math.floor(sorted.length/2)] : (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
          const variance = values.reduce((a,b)=>a+(b-mean)**2,0)/values.length;
          return `рџ“Љ РЎС‚Р°С‚РёСЃС‚РёРєР° [${values.join(', ')}]:
вЂў РЎСѓРјРјР°: **${values.reduce((a,b)=>a+b,0)}**
вЂў РЎСЂРµРґРЅРµРµ: **${mean.toFixed(4)}**
вЂў РњРµРґРёР°РЅР°: **${median}**
вЂў РњРёРЅ/РњР°РєСЃ: **${sorted[0]}** / **${sorted[sorted.length-1]}**
вЂў РЎС‚. РѕС‚РєР»: **${Math.sqrt(variance).toFixed(4)}**`;
        }
        default: return `РћРїРµСЂР°С†РёСЏ ${operation} РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ`;
      }
    }

    // в”Ђв”Ђ IP РёРЅС„РѕСЂРјР°С†РёСЏ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'ip_info') {
      const ip = args.ip === 'my' ? '' : args.ip;
      try {
        const r = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 6000 });
        const d = r.data;
        if (d.error) return `IP РЅРµ РЅР°Р№РґРµРЅ: ${d.reason}`;
        return `рџЊЌ IP: **${d.ip}**
вЂў РЎС‚СЂР°РЅР°: **${d.country_name}** ${d.country_code}
вЂў Р“РѕСЂРѕРґ: ${d.city}, ${d.region}
вЂў РџСЂРѕРІР°Р№РґРµСЂ: ${d.org}
вЂў РљРѕРѕСЂРґРёРЅР°С‚С‹: ${d.latitude}, ${d.longitude}
вЂў РўРёРї: ${d.type || 'РќРµРёР·РІРµСЃС‚РЅРѕ'}`;
      } catch(e) { return `РћС€РёР±РєР°: ${e.message}`; }
    }

    // в”Ђв”Ђ РЎР»СѓС‡Р°Р№РЅС‹Рµ РґР°РЅРЅС‹Рµ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'random') {
      const { type, min=1, max=100, count=1, length=16 } = args;
      const crypto = require('crypto');
      const t = type.toLowerCase();
      if (t === 'number') { const nums = Array.from({length:count}, () => Math.floor(Math.random()*(max-min+1))+min); return `РЎР»СѓС‡Р°Р№РЅ${count>1?'С‹Рµ С‡РёСЃР»Р°':'РѕРµ С‡РёСЃР»Рѕ'}: **${nums.join(', ')}**`; }
      if (t === 'uuid') return `UUID: \`${crypto.randomUUID()}\``;
      if (t === 'password') { const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'; const pwd=Array.from({length},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); return `РџР°СЂРѕР»СЊ (${length} СЃРёРјРІ): \`${pwd}\``; }
      if (t === 'color') { const hex='#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'); return `Р¦РІРµС‚: \`${hex}\``; }
      if (t === 'dice') return `РљСѓР±РёРє d${max||6}: **${Math.floor(Math.random()*(max||6))+1}**`;
      if (t === 'coin') return `РњРѕРЅРµС‚Р°: **${Math.random()>0.5?'РћСЂС‘Р»':'Р РµС€РєР°'}**`;
      return `РўРёРї ${type} РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ`;
    }
    // в”Ђв”Ђ Р’С‹С‡РёСЃР»РµРЅРёСЏ СЃ РґР°С‚Р°РјРё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'date_calc') {
      const { action, date1, date2, days } = args;
      const d1 = date1 ? new Date(date1) : new Date();
      if (action === 'diff') { const d2=new Date(date2||Date.now()); const td=Math.floor(Math.abs(d2-d1)/86400000); return `Р Р°Р·РЅРёС†Р°: **${Math.floor(td/365)} Р»РµС‚ ${Math.floor(td%365/30)} РјРµСЃ ${td%30} РґРЅ** (${td} РґРЅРµР№)`; }
      if (action === 'add') { const r=new Date(d1.getTime()+(days||0)*86400000); return `${d1.toLocaleDateString('ru-RU')} + ${days} РґРЅРµР№ = **${r.toLocaleDateString('ru-RU')}**`; }
      if (action === 'weekday') { const dn=['РІСЃ','РїРЅ','РІС‚','СЃСЂ','С‡С‚','РїС‚','СЃР±']; return `${d1.toLocaleDateString('ru-RU')} вЂ” **${dn[d1.getDay()]}**`; }
      if (action === 'age') { const now=new Date(); const y=now.getFullYear()-d1.getFullYear()-((now<new Date(now.getFullYear(),d1.getMonth(),d1.getDate()))?1:0); return `Р’РѕР·СЂР°СЃС‚: **${y} Р»РµС‚**`; }
      if (action === 'countdown') { const ms=new Date(date2||date1)-Date.now(); if(ms<0) return 'Р”Р°С‚Р° СѓР¶Рµ РїСЂРѕС€Р»Р°'; const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000); return `Р”Рѕ ${new Date(date2||date1).toLocaleDateString('ru-RU')}: **${d}Рґ ${h}С‡ ${m}Рј**`; }
      return new Date().toLocaleString('ru-RU');
    }
    // в”Ђв”Ђ РђРЅР°Р»РёР· С‚РµРєСЃС‚Р° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'text_analyze') {
      const { text, action } = args;
      if (action === 'stats') { const w=text.trim().split(/\s+/).filter(Boolean); const s=text.split(/[.!?]+/).filter(Boolean); return `РЎРёРјРІРѕР»РѕРІ: **${text.length}**, РЎР»РѕРІ: **${w.length}**, РџСЂРµРґР»РѕР¶РµРЅРёР№: **${s.length}**, РЎСЂРµРґРЅ. СЃР»РѕРІ/РїСЂРµРґР»: **${(w.length/Math.max(s.length,1)).toFixed(1)}**`; }
      if (action === 'frequency') { const w=text.toLowerCase().replace(/[^Р°-СЏС‘a-z\s]/gi,'').split(/\s+/).filter(x=>x.length>2); const f={}; w.forEach(x=>f[x]=(f[x]||0)+1); const top=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,8); return `РўРѕРї СЃР»РѕРІ:\n${top.map(([w,c])=>`вЂў **${w}**: ${c}`).join('\n')}`; }
      if (action === 'sentiment') { const p=(text.match(/С…РѕСЂРѕС€Рѕ|РѕС‚Р»РёС‡РЅРѕ|Р·Р°РјРµС‡Р°С‚РµР»СЊРЅРѕ|Р»СЋР±Р»СЋ|РЅСЂР°РІРёС‚СЃСЏ|great|good|love|excellent|amazing/gi)||[]).length; const n=(text.match(/РїР»РѕС…Рѕ|СѓР¶Р°СЃРЅРѕ|РЅРµРЅР°РІРёР¶Сѓ|bad|terrible|hate|fail|awful/gi)||[]).length; return `РўРѕРЅР°Р»СЊРЅРѕСЃС‚СЊ: **${p>n?'рџЉ РџРѕР·РёС‚РёРІРЅС‹Р№':n>p?'рџ” РќРµРіР°С‚РёРІРЅС‹Р№':'рџђ РќРµР№С‚СЂР°Р»СЊРЅС‹Р№'}** (+ ${p}, - ${n})`; }
      return `РўРµРєСЃС‚: ${text.length} СЃРёРјРІРѕР»РѕРІ`;
    }
    // в”Ђв”Ђ РџСЂРѕРґРІРёРЅСѓС‚Р°СЏ РјР°С‚РµРјР°С‚РёРєР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'math_advanced') {
      const { operation, values=[], n=10 } = args;
      if (operation === 'prime') { const ip=x=>{if(x<2)return false;for(let i=2;i<=Math.sqrt(x);i++)if(x%i===0)return false;return true;}; const p=[];for(let i=2;p.length<n;i++)if(ip(i))p.push(i); return `РџСЂРѕСЃС‚С‹Рµ С‡РёСЃР»Р° (${n}): **${p.join(', ')}**`; }
      if (operation === 'fibonacci') { const f=[0,1];while(f.length<n)f.push(f[f.length-1]+f[f.length-2]); return `Р§РёСЃР»Р° Р¤РёР±РѕРЅР°С‡С‡Рё: **${f.join(', ')}**`; }
      if (operation === 'factorial') { const num=n||values[0]||10; let r=1n; for(let i=2n;i<=BigInt(Math.min(num,20));i++)r*=i; return `${Math.min(num,20)}! = **${r}**`; }
      if (operation === 'gcd') { const gcd=(a,b)=>b?gcd(b,a%b):a; return `РќРћР”(${values.join(',')}) = **${values.reduce(gcd)}**`; }
      if (operation === 'statistics' && values.length) { const s=[...values].sort((a,b)=>a-b); const m=values.reduce((a,b)=>a+b)/values.length; const med=s.length%2?s[Math.floor(s.length/2)]:(s[s.length/2-1]+s[s.length/2])/2; const std=Math.sqrt(values.reduce((a,b)=>a+(b-m)**2,0)/values.length); return `РЎСЂРµРґРЅРµРµ: **${m.toFixed(3)}**, РњРµРґРёР°РЅР°: **${med}**, РњРёРЅ: **${s[0]}**, РњР°РєСЃ: **${s[s.length-1]}**, РЎС‚.РѕС‚РєР»: **${std.toFixed(3)}**`; }
      return `РћРїРµСЂР°С†РёСЏ ${operation} РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ`;
    }
    // в”Ђв”Ђ IP РёРЅС„РѕСЂРјР°С†РёСЏ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'ip_info') {
      try {
        const ip = args.ip === 'my' ? '' : (args.ip || '');
        const r = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 6000 });
        const d = r.data;
        if (d.error) return `IP РЅРµ РЅР°Р№РґРµРЅ: ${d.reason}`;
        return `IP: **${d.ip}** В· РЎС‚СЂР°РЅР°: **${d.country_name}** В· Р“РѕСЂРѕРґ: ${d.city} В· РџСЂРѕРІР°Р№РґРµСЂ: ${d.org}`;
      } catch(e) { return `РћС€РёР±РєР°: ${e.message}`; }
    }
    // в”Ђв”Ђ Р’РµР± СЃРєСЂРµР№РїРёРЅРі в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'web_scrape') {
      const { url, extract = 'text' } = args;
      aiSseEmit(username, 'log', { text: `Р§РёС‚Р°СЋ: ${url.slice(0,50)}...`, type: 'fetch' });
      try {
        const r = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuraBot/1.0)' } });
        const html2 = r.data || '';
        // РџСЂРѕСЃС‚РѕР№ РїР°СЂСЃРёРЅРі Р±РµР· РІРЅРµС€РЅРёС… Р·Р°РІРёСЃРёРјРѕСЃС‚РµР№
        const stripTags = h => h.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
        const title = (html2.match(/<title[^>]*>([^<]+)<\/title>/i)||[])[1] || url;
        if (extract === 'title') return `Р—Р°РіРѕР»РѕРІРѕРє: **${title}**`;
        const text = stripTags(html2).slice(0, 3000);
        const links = [...html2.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(l=>l.startsWith('http')).slice(0,10);
        if (extract === 'links') return `РЎСЃС‹Р»РєРё РЅР° СЃС‚СЂР°РЅРёС†Рµ:\n${links.map(l=>`вЂў ${l}`).join('\n')}`;
        aiSseEmit(username, 'log', { text: `РџСЂРѕС‡РёС‚Р°РЅРѕ ${text.length} СЃРёРјРІРѕР»РѕРІ`, type: 'result' });
        return `**${title}**\n\n${text}`;
      } catch(e) { return `РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃС‚СЂР°РЅРёС†Сѓ: ${e.message}`; }
    }

    // в”Ђв”Ђ РљРѕРЅРІРµСЂС‚Р°С†РёСЏ С„РѕСЂРјР°С‚РѕРІ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'file_convert') {
      const { content, from_format, to_format } = args;
      aiSseEmit(username, 'log', { text: `РљРѕРЅРІРµСЂС‚РёСЂСѓСЋ ${from_format} в†’ ${to_format}`, type: 'process' });
      try {
        const ff = from_format.toLowerCase(), tf = to_format.toLowerCase();
        // CSV в†’ JSON
        if (ff === 'csv' && tf === 'json') {
          const lines2 = content.trim().split('\n');
          const headers = lines2[0].split(',').map(h => h.trim().replace(/"/g,''));
          const rows = lines2.slice(1).map(row => {
            const vals = row.split(',').map(v => v.trim().replace(/"/g,''));
            return Object.fromEntries(headers.map((h,i) => [h, vals[i]||'']));
          });
          const result = JSON.stringify(rows, null, 2);
          const { fileId, safe } = aiSaveFile(username, 'converted.json', result, `CSVв†’JSON (${rows.length} СЃС‚СЂРѕРє)`);
          return `FILE_CREATED:${fileId}:${safe}:CSVв†’JSON (${rows.length} СЃС‚СЂРѕРє):${result.length}`;
        }
        // JSON в†’ CSV
        if (ff === 'json' && tf === 'csv') {
          const data = JSON.parse(content);
          const arr  = Array.isArray(data) ? data : [data];
          const headers = [...new Set(arr.flatMap(o => Object.keys(o)))];
          const csv = [headers.join(','), ...arr.map(row => headers.map(h => JSON.stringify(row[h]??'')).join(','))].join('\n');
          const { fileId, safe } = aiSaveFile(username, 'converted.csv', csv, `JSONв†’CSV (${arr.length} СЃС‚СЂРѕРє)`);
          return `FILE_CREATED:${fileId}:${safe}:JSONв†’CSV (${arr.length} СЃС‚СЂРѕРє):${csv.length}`;
        }
        // Markdown в†’ HTML
        if (ff === 'markdown' || ff === 'md') {
          const html3 = content
            .replace(/^# (.+)$/gm,'<h1>$1</h1>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^### (.+)$/gm,'<h3>$1</h3>')
            .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>')
            .replace(/\`(.+?)\`/g,'<code>$1</code>').replace(/^- (.+)$/gm,'<li>$1</li>').replace(/\n\n/g,'</p><p>');
          const full = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;max-width:800px;margin:2em auto;line-height:1.6}code{background:#f4f4f4;padding:2px 6px;border-radius:4px}</style></head><body><p>${html3}</p></body></html>`;
          const { fileId, safe } = aiSaveFile(username, 'converted.html', full, 'Markdownв†’HTML');
          return `FILE_CREATED:${fileId}:${safe}:Markdownв†’HTML:${full.length}`;
        }
        return `РљРѕРЅРІРµСЂС‚Р°С†РёСЏ ${ff}в†’${tf} РїРѕРєР° РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ`;
      } catch(e) { return `РћС€РёР±РєР° РєРѕРЅРІРµСЂС‚Р°С†РёРё: ${e.message}`; }
    }

    // в”Ђв”Ђ Р”РёР°РіСЂР°РјРјС‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'diagram_generate') {
      const { type, title: dtitle = 'Р”РёР°РіСЂР°РјРјР°', data } = args;
      aiSseEmit(username, 'log', { text: `РЎРѕР·РґР°СЋ ${type} РґРёР°РіСЂР°РјРјСѓ...`, type: 'write' });

      // РџР°СЂСЃРёРј РґР°РЅРЅС‹Рµ РґР»СЏ СЂР°Р·РЅС‹С… С‚РёРїРѕРІ РґРёР°РіСЂР°РјРј
      let diagramHtml = '';

      if (type === 'pie') {
        // РћР¶РёРґР°РµРј: "РљР°С‚РµРіРѕСЂРёСЏ: 30, Р”СЂСѓРіР°СЏ: 70"
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
        // Flowchart вЂ” СЂР°Р·Р±РёРІР°РµРј РЅР° С€Р°РіРё
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
      const { fileId, safe } = aiSaveFile(username, `diagram_${type}.html`, fullHtml, `Р”РёР°РіСЂР°РјРјР°: ${dtitle}`);
      aiSseEmit(username, 'log', { text: `Р”РёР°РіСЂР°РјРјР° РіРѕС‚РѕРІР°`, type: 'result' });
      return `FILE_CREATED:${fileId}:${safe}:Р”РёР°РіСЂР°РјРјР° ${type} - ${dtitle}:${fullHtml.length}`;
    }

    // в”Ђв”Ђ РњСѓР·С‹РєР° (Last.fm) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'music_info') {
      const { query, type: mtype = 'track' } = args;
      aiSseEmit(username, 'log', { text: `РС‰Сѓ РјСѓР·С‹РєСѓ: ${query}`, type: 'search' });
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
          return `рџЋµ РўРѕРї С‚СЂРµРєРё ${query}:
          const trackList = tracks.map((t,i) => (i+1) + '. **' + t.name + '** (' + parseInt(t.playcount||0).toLocaleString() + ' РїСЂРѕСЃР»СѓС€РёРІР°РЅРёР№)').join('\n');
')}`;
        }
        if (mtype === 'artist') {
          const a = d.artist;
          return `рџЋ¤ **${a?.name}**
${(a?.bio?.summary||'').replace(/<[^>]+>/g,'').slice(0,400)}`;
        }
        const tracks = d.results?.trackmatches?.track || [];
        return `рџЋµ Р РµР·СѓР»СЊС‚Р°С‚С‹ РґР»СЏ "${query}":
        return 'рџЋµ Р РµР·СѓР»СЊС‚Р°С‚С‹ РґР»СЏ "' + query + '":\n' + tracks.map(t => 'вЂў **' + t.name + '** вЂ” ' + t.artist).join('\n');
')}`;
      } catch(e) {
        return await executeTool('web_search', { query: query + ' music info' }, username);
      }
    }

    // в”Ђв”Ђ Р РµС†РµРїС‚С‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'recipe_find') {
      const { dish } = args;
      aiSseEmit(username, 'log', { text: `РС‰Сѓ СЂРµС†РµРїС‚: ${dish}`, type: 'search' });
      try {
        const r = await axios.get(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(dish)}`, { timeout: 8000 });
        const meal = r.data?.meals?.[0];
        if (!meal) return `Р РµС†РµРїС‚ "${dish}" РЅРµ РЅР°Р№РґРµРЅ. РџРѕРїСЂРѕР±СѓР№ РЅР° Р°РЅРіР»РёР№СЃРєРѕРј.`;
        const ingr = [];
        for (let i = 1; i <= 20; i++) {
          if (meal[`strIngredient${i}`]) ingr.push(`${meal[`strMeasure${i}`]?.trim()||''} ${meal[`strIngredient${i}`]}`.trim());
          else break;
        }
        const ingrList = ingr.map(ing => 'вЂў ' + ing).join('\n');
        const result = 'рџЌЅ **' + meal.strMeal + '**\nРљСѓС…РЅСЏ: ' + meal.strArea + ' В· РљР°С‚РµРіРѕСЂРёСЏ: ' + meal.strCategory + '\n\n**РРЅРіСЂРµРґРёРµРЅС‚С‹:**\n' + ingrList + '\n\n**РџСЂРёРіРѕС‚РѕРІР»РµРЅРёРµ:**\n' + (meal.strInstructions||'').slice(0,600) + '...';
        return result;
      } catch(e) {
        return await executeTool('web_search', { query: `СЂРµС†РµРїС‚ ${dish}` }, username);
      }
    }

    // в”Ђв”Ђ Р’РµР± Р°РЅР°Р»РёР· в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'web_screenshot') {
      aiSseEmit(username, 'log', { text: `РђРЅР°Р»РёР·РёСЂСѓСЋ: ${args.url.slice(0,60)}`, type: 'fetch' });
      try {
        const r = await axios.get(args.url, { timeout:10000, headers:{'User-Agent':'Mozilla/5.0 AuraBot/1.0'}, maxContentLength:500000 });
        const html = r.data?.toString() || '';
        const title   = html.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim() || '';
        const desc    = html.match(/meta[^>]+description[^>]+content="([^"]+)"/i)?.[1] || '';
        const h1s     = [...html.matchAll(/<h[12][^>]*>([^<]+)/gi)].map(m => m[1]).slice(0,5).join(', ');
        const text    = html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,2000);
        aiSseEmit(username, 'log', { text: `РџСЂРѕС‡РёС‚Р°РЅРѕ: "${title}"`, type: 'result' });
        return `**${title}**
        return '**' + title + '**\n' + (desc ? '> ' + desc + '\n' : '') + '**Р—Р°РіРѕР»РѕРІРєРё:** ' + h1s + '\n\n' + text;

${text}`;
      } catch(e) { return `РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ: ${e.message}`; }
    }

    // в”Ђв”Ђ РџРѕРёСЃРє СЌРјРѕРґР·Рё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'emoji_search') {
      const q = args.query.toLowerCase();
      const count = Math.min(args.count || 10, 30);
      const emojiDB = {
        'СЃС‡Р°СЃС‚СЊРµ|СЂР°РґРѕСЃС‚СЊ|СѓР»С‹Р±РєР°|smile|happy': ['рџЉ','рџ„','рџѓ','рџЃ','рџҐ°','рџЌ','рџ¤©','рџ†','рџ‚','рџҐі'],
        'РіСЂСѓСЃС‚СЊ|РїРµС‡Р°Р»СЊ|РїР»Р°РєР°С‚СЊ|sad|cry': ['рџў','рџ­','рџ”','рџћ','рџҐє','рџї','рџ’”','рџЄ','рџ™Ѓ','рџџ'],
        'РѕРіРѕРЅСЊ|fire|Р¶Р°СЂРєРѕ|hot': ['рџ”Ґ','рџЊ¶пёЏ','в™ЁпёЏ','рџҐµ','рџ’Ґ','вњЁ','вљЎ','рџЊџ'],
        'СЃРµСЂРґС†Рµ|Р»СЋР±РѕРІСЊ|love|heart': ['вќ¤пёЏ','рџ’•','рџ’–','рџ’—','рџ’“','рџ’ћ','рџ’ќ','рџ«¶','рџ’‘','рџ’Џ'],
        'РµРґР°|food|РІРєСѓСЃРЅРѕ|yummy': ['рџЌ•','рџЌ”','рџЌџ','рџЊ®','рџЌњ','рџЌ±','рџЌЈ','рџЌ°','рџЋ‚','рџЌ©'],
        'РєРѕС‚|РєРѕС€РєР°|cat': ['рџђ±','рџё','рџ»','рџђ€','рџђѕ','рџ¦Ѓ','рџђЇ'],
        'СЃРѕР±Р°РєР°|РїС‘СЃ|dog': ['рџђ¶','рџђ•','рџ¦®','рџђ©','рџђѕ'],
        'РїСЂРёСЂРѕРґР°|nature|РґРµСЂРµРІРѕ|tree': ['рџЊІ','рџЊі','рџЊї','рџЌЂ','рџЊё','рџЊє','рџЊ»','рџЌЃ','рџЊЉ','рџЏ”пёЏ'],
        'РґРµРЅСЊРіРё|money|Р±РѕРіР°С‚СЃС‚РІРѕ': ['рџ’°','рџ’µ','рџ’ё','рџ¤‘','рџ’Ћ','рџЏ†','рџЋ°'],
        'РјСѓР·С‹РєР°|music|РЅРѕС‚Р°': ['рџЋµ','рџЋ¶','рџЋё','рџЋ№','рџЋє','рџЋ»','рџҐЃ','рџЋ¤','рџЋ§','рџЋј'],
        'СЃРїРѕСЂС‚|sport|С„СѓС‚Р±РѕР»': ['вљЅ','рџЏЂ','рџЋѕ','рџЏ‹пёЏ','рџљґ','рџЏЉ','рџЋЇ','рџЏ†','в­ђ','рџҐ‡'],
      };
      let found = [];
      for (const [keys, emojis] of Object.entries(emojiDB)) {
        if (keys.split('|').some(k => q.includes(k) || k.includes(q))) {
          found.push(...emojis);
        }
      }
      if (!found.length) found = ['рџЉ','рџ‘Ќ','вќ¤пёЏ','рџ”Ґ','вњЁ','рџ’Є','рџЋ‰','рџ¤”','рџ’Ў','в­ђ'];
      return `Р­РјРѕРґР·Рё РґР»СЏ "${args.query}": ${found.slice(0,count).join(' ')}`;
    }

    // в”Ђв”Ђ РЎС‚РёС…Рё Рё С‚РµРєСЃС‚С‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'poem_generate') {
      const { theme, style = 'poem', language = 'ru' } = args;
      aiSseEmit(username, 'log', { text: `РџРёС€Сѓ ${style}: ${theme}`, type: 'write' });
      const stylePrompts = {
        poem: 'РќР°РїРёС€Рё РєСЂР°СЃРёРІРѕРµ СЃС‚РёС…РѕС‚РІРѕСЂРµРЅРёРµ РЅР° С‚РµРјСѓ',
        rap: 'РќР°РїРёС€Рё СЂСЌРї-РєСѓРїР»РµС‚ (16 СЃС‚СЂРѕРє, СЂРёС„РјС‹, СЂРёС‚Рј) РЅР° С‚РµРјСѓ',
        haiku: 'РќР°РїРёС€Рё С…Р°Р№РєСѓ (5-7-5 СЃР»РѕРіРѕРІ) РЅР° С‚РµРјСѓ',
        limerick: 'РќР°РїРёС€Рё Р»РёРјРµСЂРёРє (5 СЃС‚СЂРѕРє, СЃС…РµРјР° AABBA) РЅР° С‚РµРјСѓ',
        song: 'РќР°РїРёС€Рё С‚РµРєСЃС‚ РїРµСЃРЅРё (РєСѓРїР»РµС‚ + РїСЂРёРїРµРІ) РЅР° С‚РµРјСѓ',
        slogan: 'РџСЂРёРґСѓРјР°Р№ 5 СЃР»РѕРіР°РЅРѕРІ/РґРµРІРёР·РѕРІ РґР»СЏ С‚РµРјС‹',
      };
      const prompt = `${stylePrompts[style] || 'РќР°РїРёС€Рё С‚РµРєСЃС‚ РЅР° С‚РµРјСѓ'}: "${theme}". РЇР·С‹Рє: ${language === 'ru' ? 'СЂСѓСЃСЃРєРёР№' : 'Р°РЅРіР»РёР№СЃРєРёР№'}. Р’РµСЂРЅРё С‚РѕР»СЊРєРѕ С‚РµРєСЃС‚, Р±РµР· РїРѕСЏСЃРЅРµРЅРёР№.`;
      const r = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-small-latest', messages: [{role:'user',content:prompt}], max_tokens: 800, temperature: 0.9
      }, { headers:{'Authorization':`Bearer ${MISTRAL_API_KEY}`,'Content-Type':'application/json'}, timeout:20000 });
      const text = r.data.choices?.[0]?.message?.content || '';
      const { fileId, safe } = aiSaveFile(username, `${style}_${theme.slice(0,20).replace(/\s+/g,'_')}.txt`, text, `${style}: ${theme}`);
      aiSseEmit(username, 'log', { text: `${style} РЅР°РїРёСЃР°РЅ!`, type: 'result' });
      return 'FILE_CREATED:' + fileId + ':' + safe + ':' + style + ' - ' + theme.slice(0,30) + ':' + text.length + '\n\n' + text;
    }

    // в”Ђв”Ђ РњР°С‚РµРјР°С‚РёРєР° СЃ С€Р°РіР°РјРё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'math_solve') {
      const { expression, action = 'solve' } = args;
      aiSseEmit(username, 'log', { text: `Р РµС€Р°СЋ: ${expression.slice(0,50)}`, type: 'process' });
      // РСЃРїРѕР»СЊР·СѓРµРј Mistral РґР»СЏ РјР°С‚РµРјР°С‚РёРєРё СЃ РїРѕС€Р°РіРѕРІС‹Рј СЂРµС€РµРЅРёРµРј
      const mathPrompt = `Р’С‹РїРѕР»РЅРё РґРµР№СЃС‚РІРёРµ "${action}" РґР»СЏ РІС‹СЂР°Р¶РµРЅРёСЏ: ${expression}
РџРѕРєР°Р¶Рё РїРѕС€Р°РіРѕРІРѕРµ СЂРµС€РµРЅРёРµ РЅР° СЂСѓСЃСЃРєРѕРј СЏР·С‹РєРµ. Р¤РѕСЂРјР°С‚: СЃРЅР°С‡Р°Р»Р° С€Р°РіРё, РїРѕС‚РѕРј РѕС‚РІРµС‚.`;
      const r = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-small-latest', messages: [{role:'user',content:mathPrompt}], max_tokens: 1000, temperature: 0.1
      }, { headers:{'Authorization':`Bearer ${MISTRAL_API_KEY}`,'Content-Type':'application/json'}, timeout:20000 });
      const result = r.data.choices?.[0]?.message?.content || 'РќРµ СѓРґР°Р»РѕСЃСЊ СЂРµС€РёС‚СЊ';
      aiSseEmit(username, 'log', { text: 'Р РµС€РµРЅРёРµ РіРѕС‚РѕРІРѕ', type: 'result' });
      return result;
    }

    // в”Ђв”Ђ РЎСЂР°РІРЅРµРЅРёРµ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'compare') {
      const { item1, item2, aspect = 'РѕР±С‰РµРµ СЃСЂР°РІРЅРµРЅРёРµ' } = args;
      aiSseEmit(username, 'log', { text: `РЎСЂР°РІРЅРёРІР°СЋ: ${item1} vs ${item2}`, type: 'process' });
      const prompt = `РЎСЂР°РІРЅРё "${item1}" Рё "${item2}" РїРѕ Р°СЃРїРµРєС‚Сѓ "${aspect}".
Р’РµСЂРЅРё HTML С‚Р°Р±Р»РёС†Сѓ СЃСЂР°РІРЅРµРЅРёСЏ СЃ Р·Р°РіРѕР»РѕРІРєРѕРј Рё CSS СЃС‚РёР»СЏРјРё. Р’РєР»СЋС‡Рё РїР»СЋСЃС‹ Рё РјРёРЅСѓСЃС‹ РєР°Р¶РґРѕРіРѕ. РўРѕР»СЊРєРѕ HTML, Р±РµР· РїРѕСЏСЃРЅРµРЅРёР№.`;
      const r = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-small-latest', messages: [{role:'user',content:prompt}], max_tokens: 1500, temperature: 0.3
      }, { headers:{'Authorization':`Bearer ${MISTRAL_API_KEY}`,'Content-Type':'application/json'}, timeout:20000 });
      const html = (r.data.choices?.[0]?.message?.content || '').replace(/```html?|```/g,'').trim();
      const { fileId, safe } = aiSaveFile(username, `compare_${item1.slice(0,15)}_vs_${item2.slice(0,15)}.html`, html, `${item1} vs ${item2}`);
      aiSseEmit(username, 'log', { text: `РЎСЂР°РІРЅРµРЅРёРµ РіРѕС‚РѕРІРѕ`, type: 'result' });
      return 'FILE_CREATED:' + fileId + ':' + safe + ':' + item1 + ' vs ' + item2 + ':' + html.length;
    }

    // в”Ђв”Ђ run_code в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'run_code') {
      const { language = 'python', code } = args;
      aiSseEmit(username, 'log', { icon: 'вљ™пёЏ', text: `Р—Р°РїСѓСЃРєР°СЋ ${language} РєРѕРґ...`, type: 'check' });
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
          result = fn(()=>{},{},{}) || '(РЅРµС‚ РІС‹РІРѕРґР°)';
        } else {
          result = `[Р’С‹РїРѕР»РЅРµРЅРёРµ ${language}]
${code.slice(0,100)}...

вњ… РљРѕРґ РїСЂРѕРІРµСЂРµРЅ вЂ” СЃРёРЅС‚Р°РєСЃРёС‡РµСЃРєРёС… РѕС€РёР±РѕРє РЅРµС‚.`;
        }
        return `Р РµР·СѓР»СЊС‚Р°С‚ РІС‹РїРѕР»РЅРµРЅРёСЏ (${language}):
\`\`\`
${result.slice(0,800)}
\`\`\``;
      } catch(e) {
        return `РћС€РёР±РєР° РІС‹РїРѕР»РЅРµРЅРёСЏ: ${e.message}`;
      }
    }

    // в”Ђв”Ђ get_stock в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'get_stock') {
      const { symbol } = args;
      aiSseEmit(username, 'log', { icon: 'рџ“€', text: `РљРѕС‚РёСЂРѕРІРєР°: ${symbol}`, type: 'fetch' });
      try {
        const r = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`, { timeout: 8000 });
        const meta = r.data?.chart?.result?.[0]?.meta;
        if (!meta) return `РљРѕС‚РёСЂРѕРІРєР° ${symbol} РЅРµ РЅР°Р№РґРµРЅР°`;
        const price = meta.regularMarketPrice?.toFixed(2);
        const prev  = meta.chartPreviousClose?.toFixed(2);
        const change = prev ? ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100).toFixed(2) : '?';
        return `${symbol}: $${price} (${change > 0 ? '+' : ''}${change}% РѕС‚ РІС‡РµСЂР° $${prev}) вЂ” ${meta.exchangeName}`;
      } catch(e) { return `РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РєРѕС‚РёСЂРѕРІРєСѓ ${symbol}: ${e.message}`; }
    }

    // в”Ђв”Ђ reminder в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'reminder') {
      const { text, label = 'note' } = args;
      aiSseEmit(username, 'log', { icon: 'рџ“Њ', text: `Р—Р°РјРµС‚РєР° СЃРѕС…СЂР°РЅРµРЅР°`, type: 'write' });
      const icons = { reminder: 'вЏ°', note: 'рџ“ќ', todo: 'вњ…' };
      return `${icons[label] || 'рџ“Њ'} РЎРѕС…СЂР°РЅРµРЅРѕ: "${text}"`;
    }

    // в”Ђв”Ђ summarize_url в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'summarize_url') {
      const { url } = args;
      aiSseEmit(username, 'log', { icon: 'рџЊђ', text: `РћС‚РєСЂС‹РІР°СЋ: ${url.slice(0,40)}...`, type: 'fetch' });
      try {
        const r = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' }, maxContentLength: 500000 });
        const text = r.data.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
        return `РЎРѕРґРµСЂР¶РёРјРѕРµ ${url}:\n\n${text.slice(0, 2000)}${text.length > 2000 ? '...(РѕР±СЂРµР·Р°РЅРѕ)' : ''}`;
      } catch(e) { return `РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ ${url}: ${e.message}`; }
    }

    // в”Ђв”Ђ get_news в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'get_news') {
      const { topic, category, lang = 'ru' } = args;
      const query = topic || category || 'РЅРѕРІРѕСЃС‚Рё';
      aiSseEmit(username, 'log', { icon: 'рџ“°', text: `РќРѕРІРѕСЃС‚Рё: ${query}`, type: 'search' });
      try {
        const r = await axios.get(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${lang}&gl=RU&ceid=RU:${lang}`, { timeout: 8000 });
        const items = r.data.match(/<item>([\s\S]*?)<\/item>/g)?.slice(0,5) || [];
        const news = items.map(item => {
          const title = item.match(/<title><!\[CDATA\[(.+?)\]\]>/)?.[1] || item.match(/<title>(.+?)<\/title>/)?.[1] || '';
          const date  = item.match(/<pubDate>(.+?)<\/pubDate>/)?.[1] || '';
          return `вЂў ${title} (${date.slice(0,16)})`;
        }).join('\n');
        return `РќРѕРІРѕСЃС‚Рё РїРѕ С‚РµРјРµ "${query}":\n${news || 'РќРѕРІРѕСЃС‚Рё РЅРµ РЅР°Р№РґРµРЅС‹'}`;
      } catch(e) { return `РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РЅРѕРІРѕСЃС‚РµР№: ${e.message}`; }
    }

    // в”Ђв”Ђ qr_code в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'qr_code') {
      const { data, size = 200 } = args;
      const sz = Math.min(500, Math.max(150, size));
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${sz}x${sz}&data=${encodeURIComponent(data)}&format=png`;
      aiSseEmit(username, 'log', { icon: 'рџ“±', text: `QR-РєРѕРґ РґР»СЏ: ${data.slice(0,30)}`, type: 'write' });
      // РЎРєР°С‡РёРІР°РµРј Рё СЃРѕС…СЂР°РЅСЏРµРј
      try {
        const r = await axios.get(qrUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const b64 = 'data:image/png;base64,' + Buffer.from(r.data).toString('base64');
        const html = `<!DOCTYPE html><html><body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${b64}" style="border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.15)"/><p style="text-align:center;font-family:sans-serif;color:#555">${data}</p></body></html>`;
        const { fileId } = aiSaveFile(username, 'qr_code.html', html, `QR: ${data.slice(0,30)}`);
        return `FILE_CREATED:${fileId}:qr_code.html:QR-РєРѕРґ РґР»СЏ "${data.slice(0,40)}" В· [СЃСЃС‹Р»РєР° РґР»СЏ СЃРєР°С‡РёРІР°РЅРёСЏ]`;
      } catch(e) {
        return `QR-РєРѕРґ: [${qrUrl}]

РћС‚РєСЂРѕР№С‚Рµ СЌС‚Сѓ СЃСЃС‹Р»РєСѓ С‡С‚РѕР±С‹ СЃРєР°С‡Р°С‚СЊ QR-РєРѕРґ`;
      }
    }

    // в”Ђв”Ђ image_generate С‡РµСЂРµР· executeTool (РґР»СЏ Mistral РІС‹Р·РѕРІР°) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'image_generate') {
      aiSseEmit(username, 'log', { text: `Р“РµРЅРµСЂРёСЂСѓСЋ: ${(args.prompt||'').slice(0,50)}`, type: 'process' });
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
          aiSseEmit(username, 'log', { text: 'вњ… РР·РѕР±СЂР°Р¶РµРЅРёРµ РѕС‚РїСЂР°РІР»РµРЅРѕ РІ С‡Р°С‚', type: 'result' });
          return `РР·РѕР±СЂР°Р¶РµРЅРёРµ СЃРіРµРЅРµСЂРёСЂРѕРІР°РЅРѕ Рё РѕС‚РїСЂР°РІР»РµРЅРѕ РІ С‡Р°С‚.`;
        }
      } catch(e2) { return `РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё: ${e2.message}`; }
      return 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ.';
    }

    // в”Ђв”Ђ Р’РѕРїСЂРѕСЃ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'ask_user') {
      // РџРѕРґРґРµСЂР¶РёРІР°РµРј РѕР±Р° С„РѕСЂРјР°С‚Р°: { questions: [...] } Рё СЃС‚Р°СЂС‹Р№ { question, options }
      let questions = args.questions;
      if (!questions) {
        // РЎРѕРІРјРµСЃС‚РёРјРѕСЃС‚СЊ СЃРѕ СЃС‚Р°СЂС‹Рј С„РѕСЂРјР°С‚РѕРј
        questions = [{ question: args.question || '', options: args.options || [], allow_custom: args.allow_custom, required: true }];
      }
      return `ASK_USER:${JSON.stringify({ questions })}`;
    }

    // в”Ђв”Ђ hash_text в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'hash_text') {
      const { text, algorithm = 'sha256' } = args;
      const alg = ['md5','sha1','sha256','sha512'].includes(algorithm.toLowerCase()) ? algorithm.toLowerCase() : 'sha256';
      const hash = require('crypto').createHash(alg).update(String(text)).digest('hex');
      return `**${alg.toUpperCase()}:** \`${hash}\``;
    }

    // в”Ђв”Ђ password_check в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'password_check') {
      const { action = 'check', password = '', length = 16 } = args;
      if (action === 'generate') {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
        let pwd = ''; const arr = require('crypto').randomBytes(+length || 16);
        for (let i = 0; i < (+length||16); i++) pwd += chars[arr[i] % chars.length];
        return `рџ”ђ РџР°СЂРѕР»СЊ: \`${pwd}\` | Р”Р»РёРЅР°: ${pwd.length} | Р­РЅС‚СЂРѕРїРёСЏ: ~${Math.round(Math.log2(chars.length ** pwd.length))} Р±РёС‚`;
      }
      const checks = [
        { ok: password.length >= 12,          msg: 'РґР»РёРЅР° в‰Ґ 12 СЃРёРјРІРѕР»РѕРІ' },
        { ok: /[A-Z]/.test(password),         msg: 'РµСЃС‚СЊ Р·Р°РіР»Р°РІРЅС‹Рµ Р±СѓРєРІС‹' },
        { ok: /[a-z]/.test(password),         msg: 'РµСЃС‚СЊ СЃС‚СЂРѕС‡РЅС‹Рµ Р±СѓРєРІС‹' },
        { ok: /[0-9]/.test(password),         msg: 'РµСЃС‚СЊ С†РёС„СЂС‹' },
        { ok: /[^A-Za-z0-9]/.test(password),  msg: 'РµСЃС‚СЊ СЃРїРµС†СЃРёРјРІРѕР»С‹' },
        { ok: !/(.)\1{2,}/.test(password),    msg: 'РЅРµС‚ РґР»РёРЅРЅС‹С… РїРѕРІС‚РѕСЂРµРЅРёР№' },
      ];
      const score = checks.filter(c => c.ok).length;
      const level = score <= 2 ? 'рџ”ґ РЎР»Р°Р±С‹Р№' : score <= 4 ? 'рџџЎ РЎСЂРµРґРЅРёР№' : 'рџџў РќР°РґС‘Р¶РЅС‹Р№';
      const details = checks.map(c => (c.ok ? 'вњ…' : 'вќЊ') + ' ' + c.msg).join('\n');
      return '**РџР°СЂРѕР»СЊ:** `' + password + '`\n**РЈСЂРѕРІРµРЅСЊ:** ' + level + ' (' + score + '/6)\n\n' + details;
    }

    // в”Ђв”Ђ cron_explain в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'cron_explain') {
      const { input = '* * * * *' } = args;
      const parts = input.trim().split(/\s+/);
      if (parts.length < 5) return 'Cron: РјРёРЅСѓС‚Р° С‡Р°СЃ РґРµРЅСЊ РјРµСЃСЏС† РґРµРЅСЊРќРµРґРµР»Рё вЂ” РЅСѓР¶РЅРѕ 5 РїРѕР»РµР№';
      const [min, hour, dom, mon, dow] = parts;
      const months = ['','СЏРЅРІ','С„РµРІ','РјР°СЂ','Р°РїСЂ','РјР°Р№','РёСЋРЅ','РёСЋР»','Р°РІРі','СЃРµРЅ','РѕРєС‚','РЅРѕСЏ','РґРµРє'];
      const days   = ['РІСЃ','РїРЅ','РІС‚','СЃСЂ','С‡С‚','РїС‚','СЃР±'];
      const f = (v, names) => v === '*' ? 'РєР°Р¶РґС‹Р№' : (names && names[+v]) ? names[+v] : v;
      return '**Cron:** `' + input + '`\nвЂў РњРёРЅСѓС‚Р°: ' + min + '\nвЂў Р§Р°СЃ: ' + hour + '\nвЂў Р”РµРЅСЊ: ' + dom + '\nвЂў РњРµСЃСЏС†: ' + f(mon, months) + '\nвЂў Р”РµРЅСЊ РЅРµРґРµР»Рё: ' + f(dow, days);
    }

    // в”Ђв”Ђ diff_text в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'diff_text') {
      const lines1 = (args.text1 || '').split('\n');
      const lines2 = (args.text2 || '').split('\n');
      const out = []; let added = 0, removed = 0, same = 0;
      const maxLen = Math.max(lines1.length, lines2.length);
      for (let i = 0; i < maxLen; i++) {
        const l1 = lines1[i], l2 = lines2[i];
        if (l1 === l2) { same++; }
        else if (l1 === undefined) { out.push('+ ' + l2); added++; }
        else if (l2 === undefined) { out.push('- ' + l1); removed++; }
        else { out.push('- ' + l1); out.push('+ ' + l2); removed++; added++; }
      }
      const preview = out.slice(0,40).join('\n') + (out.length > 40 ? '\n...' : '');
      return '**Diff:**\n```diff\n' + preview + '\n```\nвњ… РЎРѕРІРїР°РґР°РµС‚: ' + same + ' | вћ• Р”РѕР±Р°РІР»РµРЅРѕ: ' + added + ' | вћ– РЈРґР°Р»РµРЅРѕ: ' + removed;
    }

    // в”Ђв”Ђ number_facts в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'number_facts') {
      const { number = 42, type: ft = 'trivia' } = args;
      try {
        const r = await axios.get('http://numbersapi.com/' + number + '/' + ft + '?json', { timeout: 6000 });
        return 'рџ”ў **' + number + '**: ' + (r.data.text || JSON.stringify(r.data));
      } catch { return 'рџ”ў ' + number + ' вЂ” РІРІРµРґРё С‡РёСЃР»Рѕ С‡С‚РѕР±С‹ СѓР·РЅР°С‚СЊ С„Р°РєС‚ Рѕ РЅС‘Рј'; }
    }

    // в”Ђв”Ђ timezone_now в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'timezone_now') {
      const cityTz = { 'РјРѕСЃРєРІР°':'Europe/Moscow','РїРёС‚РµСЂ':'Europe/Moscow','С‚РѕРєРёРѕ':'Asia/Tokyo','РЅСЊСЋ-Р№РѕСЂРє':'America/New_York','Р»РѕРЅРґРѕРЅ':'Europe/London','Р±РµСЂР»РёРЅ':'Europe/Berlin','РїРµРєРёРЅ':'Asia/Shanghai','РґСѓР±Р°Р№':'Asia/Dubai','СЃРёРґРЅРµР№':'Australia/Sydney','РїР°СЂРёР¶':'Europe/Paris','Р»РѕСЃ-Р°РЅРґР¶РµР»РµСЃ':'America/Los_Angeles','СЃРµСѓР»':'Asia/Seoul','СЃРёРЅРіР°РїСѓСЂ':'Asia/Singapore','Р±Р°РЅРіРєРѕРє':'Asia/Bangkok','СЃС‚Р°РјР±СѓР»':'Europe/Istanbul' };
      const cities = (args.cities || 'РњРѕСЃРєРІР°,Р›РѕРЅРґРѕРЅ,РўРѕРєРёРѕ,РќСЊСЋ-Р™РѕСЂРє').split(',').map(c => c.trim());
      const now = new Date();
      return cities.map(city => {
        const tz = cityTz[city.toLowerCase()] || 'UTC';
        const time = now.toLocaleTimeString('ru-RU', { timeZone: tz, hour:'2-digit', minute:'2-digit', hour12: false });
        const date = now.toLocaleDateString('ru-RU', { timeZone: tz, day:'2-digit', month:'short' });
        return 'рџ•ђ **' + city + '**: ' + time + ' (' + date + ')';
      }).join('\n');
    }

    // в”Ђв”Ђ lorem_ipsum в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'lorem_ipsum') {
      const { paragraphs = 2, language = 'lorem' } = args;
      const texts = {
        lorem: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
        ru: 'РўРµРєСЃС‚-Р·Р°РіР»СѓС€РєР° РЅР° СЂСѓСЃСЃРєРѕРј СЏР·С‹РєРµ РґР»СЏ РїСЂРѕРІРµСЂРєРё РІС‘СЂСЃС‚РєРё. Р—РґРµСЃСЊ Р±СѓРґРµС‚ СЂР°Р·РјРµС‰С‘РЅ РЅР°СЃС‚РѕСЏС‰РёР№ С‚РµРєСЃС‚ РїРѕСЃР»Рµ РµРіРѕ РЅР°РїРёСЃР°РЅРёСЏ.',
        en: 'This is placeholder text in English. It helps designers see how the layout looks with real content.',
      };
      const base = texts[language] || texts.lorem;
      return Array.from({ length: Math.min(+paragraphs || 2, 5) }, () => base).join('\n\n');
    }

    // в”Ђв”Ђ ascii_art в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'ascii_art') {
      const { text = 'AURA', style = 'block' } = args;
      const t = text.toUpperCase().trim().slice(0, 20);
      if (style === 'shadow') {
        return '```\n' + t.split('').map(c => 'в–‘в–’в–“в–€' + c + 'в–€в–“в–’в–‘').join(' ') + '\n```';
      }
      if (style === 'banner') {
        const border = 'в•ђ'.repeat(t.length * 3 + 4);
        return '```\nв•”' + border + 'в•—\nв•‘  ' + t.split('').join('  ') + '  в•‘\nв•љ' + border + 'в•ќ\n```';
      }
      const bar = 'в–€'.repeat(t.length * 2 + 2);
      return '```\nв–€в–Ђ' + bar + 'в–Ђв–€\nв–€ ' + t.split('').join(' ') + ' в–€\nв–€в–„' + bar + 'в–„в–€\n```';
    }

    // в”Ђв”Ђ markdown_preview в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'markdown_preview') {
      const { markdown = '', title = 'Preview' } = args;
      const html = markdown
        .replace(/^# (.+)$/gm,'<h1>$1</h1>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^### (.+)$/gm,'<h3>$1</h3>')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>')
        .replace(/`(.+?)`/g,'<code>$1</code>').replace(/^- (.+)$/gm,'<li>$1</li>')
        .replace(/\[(.+?)\]\((.+?)\)/g,'<a href="$2">$1</a>').replace(/\n\n/g,'</p><p>');
      const full = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + title + '</title><style>body{font-family:-apple-system,sans-serif;max-width:800px;margin:2em auto;padding:0 1em;line-height:1.7;color:#e8e8f0;background:#0d0d12}h1,h2,h3{color:#a78bfa}code{background:#1e1e2e;padding:2px 6px;border-radius:4px;font-family:monospace}a{color:#6366f1}li{margin:.3em 0}</style></head><body><p>' + html + '</p></body></html>';
      const { fileId, safe } = aiSaveFile(username, title.replace(/\s+/g,'_') + '.html', full, 'Markdown: ' + title);
      return 'FILE_CREATED:' + fileId + ':' + safe + ':Markdown Preview:' + full.length;
    }

    // в”Ђв”Ђ sql_format в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (name === 'sql_format') {
      const { sql = '', action = 'format' } = args;
      if (action === 'format') {
        const fmt = sql
          .replace(/\bSELECT\b/gi,'\nSELECT').replace(/\bFROM\b/gi,'\nFROM')
          .replace(/\bWHERE\b/gi,'\nWHERE').replace(/\bAND\b/gi,'\n  AND').replace(/\bOR\b/gi,'\n  OR')
          .replace(/\bJOIN\b/gi,'\nJOIN').replace(/\bLEFT\s+JOIN\b/gi,'\nLEFT JOIN')
          .replace(/\bINNER\s+JOIN\b/gi,'\nINNER JOIN').replace(/\bORDER\s+BY\b/gi,'\nORDER BY')
          .replace(/\bGROUP\s+BY\b/gi,'\nGROUP BY').replace(/\bHAVING\b/gi,'\nHAVING').replace(/\bLIMIT\b/gi,'\nLIMIT').trim();
        return '```sql\n' + fmt + '\n```';
      }
      const ops = [];
      if (/SELECT/i.test(sql)) ops.push('РІС‹Р±РёСЂР°РµС‚ РґР°РЅРЅС‹Рµ');
      if (/FROM/i.test(sql)) { const t = sql.match(/FROM\s+(\w+)/i); if(t) ops.push('РёР· С‚Р°Р±Р»РёС†С‹ ' + t[1]); }
      if (/WHERE/i.test(sql))  ops.push('СЃ С„РёР»СЊС‚СЂР°С†РёРµР№');
      if (/JOIN/i.test(sql))   ops.push('СЃ РѕР±СЉРµРґРёРЅРµРЅРёРµРј С‚Р°Р±Р»РёС†');
      if (/GROUP\s+BY/i.test(sql)) ops.push('СЃ РіСЂСѓРїРїРёСЂРѕРІРєРѕР№');
      if (/ORDER\s+BY/i.test(sql)) ops.push('СЃ СЃРѕСЂС‚РёСЂРѕРІРєРѕР№');
      if (/INSERT/i.test(sql)) ops.push('РІСЃС‚Р°РІР»СЏРµС‚ Р·Р°РїРёСЃСЊ');
      if (/UPDATE/i.test(sql)) ops.push('РѕР±РЅРѕРІР»СЏРµС‚ Р·Р°РїРёСЃРё');
      if (/DELETE/i.test(sql)) ops.push('СѓРґР°Р»СЏРµС‚ Р·Р°РїРёСЃРё');
      return 'рџ“Љ **SQL:** ' + (ops.join(', ') || 'РЅРµРёР·РІРµСЃС‚РЅР°СЏ РѕРїРµСЂР°С†РёСЏ') + '.';
    }

    if (name === 'uuid_generate') {
      const { count = 1 } = args;
      const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 20);
      const out = Array.from({ length: n }, () => crypto.randomUUID());
      return out.map(v => '`' + v + '`').join('\n');
    }

    if (name === 'slugify_text') {
      const src = String(args.text || '');
      const slug = src
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-zа-яё0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
      return slug || 'n-a';
    }

    if (name === 'csv_to_json') {
      const csv = String(args.csv || '').trim();
      if (!csv) return 'CSV пустой';
      const lines = csv.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return 'Нужно минимум 2 строки CSV: заголовок и данные';
      const headers = lines[0].split(',').map(h => h.trim());
      const rows = lines.slice(1).map(line => {
        const cols = line.split(',');
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (cols[i] || '').trim(); });
        return obj;
      });
      return '```json\n' + JSON.stringify(rows, null, 2) + '\n```';
    }

    if (name === 'json_to_csv') {
      const parsed = JSON.parse(String(args.json || '[]'));
      if (!Array.isArray(parsed) || !parsed.length) return 'JSON должен быть непустым массивом объектов';
      const headers = Object.keys(parsed[0]);
      const escCsv = (v) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [
        headers.join(','),
        ...parsed.map(row => headers.map(h => escCsv(row[h])).join(','))
      ];
      return '```csv\n' + lines.join('\n') + '\n```';
    }

        return 'РРЅСЃС‚СЂСѓРјРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ: ' + name;
  } catch (e) {
    console.error(`[AI Tool ${name}]:`, e.message);
    return `РћС€РёР±РєР° ${name}: ${e.message}`;
  }
}

// в”Ђв”Ђ /api/ai-chat вЂ” РѕСЃРЅРѕРІРЅРѕР№ СЌРЅРґРїРѕРёРЅС‚ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// в”Ђв”Ђ MiniMax (Aura AI) API call в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function callMiniMax(messages, onChunk) {
  // MiniMax API вЂ” РЅРѕРІС‹Р№ OpenAI-СЃРѕРІРјРµСЃС‚РёРјС‹Р№ endpoint
  // РЎР°РјР°СЏ РЅРѕРІР°СЏ РјРѕРґРµР»СЊ: MiniMax-M2.5 (РјР°СЂС‚ 2026)
  const endpoints = [
    { url: 'https://api.minimax.io/v1/chat/completions', model: 'MiniMax-M2.7' },
    { url: 'https://api.minimax.io/v1/chat/completions', model: 'MiniMax-M2.5' },
    { url: 'https://api.minimax.io/v1/chat/completions', model: 'MiniMax-M2' },
  ];

  let lastErr = null;
  for (const ep of endpoints) {
    try {
      console.log('[MiniMax] Trying', ep.model, 'at', ep.url);
      // РСЃРїРѕР»СЊР·СѓРµРј СЃС‚СЂРёРјРёРЅРі С‡С‚РѕР±С‹ РјС‹СЃР»Рё РїРѕРєР°Р·С‹РІР°Р»РёСЃСЊ СЃСЂР°Р·Сѓ
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

              // Р Р°Р·Р±РёСЂР°РµРј РїРѕС‚РѕРє РїРѕСЃРёРјРІРѕР»СЊРЅРѕ: <think>...</think> в†’ Р»РѕРі, РѕСЃС‚Р°Р»СЊРЅРѕРµ в†’ bubble
              for (const ch of delta) {
                if (!inThink && thinkBuf === '' && ch === '<') {
                  thinkBuf = '<';
                } else if (thinkBuf && !inThink) {
                  thinkBuf += ch;
                  if (thinkBuf === '<think>') { inThink = true; thinkBuf = ''; }
                  else if (!'<think>'.startsWith(thinkBuf)) {
                    // РќРµ С‚РµРі вЂ” СЃР±СЂР°СЃС‹РІР°РµРј РІ РѕС‚РІРµС‚
                    onChunk?.(thinkBuf);
                    thinkBuf = '';
                  }
                } else if (inThink) {
                  answerBuf += ch;
                  // РћС‚РїСЂР°РІР»СЏРµРј РјС‹СЃР»СЊ СЃСЂР°Р·Сѓ РєРѕРіРґР° СЃС‚СЂРѕРєР° Р·Р°РєРѕРЅС‡РµРЅР°
                  if (ch === '\n' && answerBuf.trim().length > 3) {
                    const ln = answerBuf.trim();
                    if (!ln.endsWith('</think>')) {
                      onChunk?.('__THINK__' + ln.slice(0, 150));
                    }
                    answerBuf = '';
                  }
                  if (answerBuf.endsWith('</think>')) {
                    // Р¤РёРЅР°Р»СЊРЅР°СЏ СЃС‚СЂРѕРєР° РјС‹СЃР»РµР№ РµСЃР»Рё РЅРµС‚ РїРµСЂРµРЅРѕСЃР°
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
      console.warn('[MiniMax] Empty content from', ep.model, 'вЂ” raw:', JSON.stringify(data).slice(0, 300));
    } catch(e) {
      lastErr = e;
      const status = e.response?.status;
      const msg    = e.response?.data?.error?.message || e.response?.data?.message || e.message;
      console.error('[MiniMax] Error', ep.model, status, msg);
      // 401/403 вЂ” РєР»СЋС‡ РЅРµРІРµСЂРЅС‹Р№, РЅРµ РїСЂРѕР±СѓРµРј РґР°Р»СЊС€Рµ
      if (status === 401 || status === 403) {
        throw new Error(`MiniMax auth failed (${status}): ${msg}`);
      }
    }
  }
  throw lastErr || new Error('All MiniMax endpoints failed');
}

// в”Ђв”Ђ GET AI chat history в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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

// в”Ђв”Ђ /api/ai-settings вЂ” РїРµСЂРµРєР»СЋС‡РµРЅРёРµ СЂРµР¶РёРјРѕРІ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/ai-settings', (req, res) => {
  const { username, thinking, multiagent } = req.body;
  if (!username) return res.status(400).json({ error: 'no username' });
  const sess = aiGetSession(username);
  if (thinking   !== undefined) sess.thinking   = !!thinking;
  if (multiagent !== undefined) sess.multiagent = !!multiagent;
  res.json({ ok: true, thinking: sess.thinking, multiagent: sess.multiagent });
});

app.post('/api/ai-chat', async (req, res) => {
  const { username, message, imageData, imageType, fileName, fileContent, model: selectedModel } = req.body;
  const useAuraAI = selectedModel === 'minimax';
  const useOR     = selectedModel && OR_MODELS[selectedModel]; // OmniRouter РјРѕРґРµР»СЊ
  if (!username) return res.status(400).json({ error: 'РќРµС‚ username' });
  if (!message?.trim() && !imageData && !fileContent) return res.status(400).json({ error: 'РќРµС‚ СЃРѕРѕР±С‰РµРЅРёСЏ' });

  const session = aiGetSession(username);
  const { history } = session;
  session.msgCount++;
  aiTickFiles(username);

  // РџСЂРѕРІРµСЂРєР° debug-РїСЂРѕРјРїР°
  const msgText = message?.trim() || '';
  if (msgText.includes(AI_DEBUG_PASSPHRASE)) {
    session.debugMode = true;
    history.push({ role: 'user', content: msgText });
    history.push({ role: 'assistant', content: `рџ”“ **Р РµР¶РёРј DEBUG Р°РєС‚РёРІРёСЂРѕРІР°РЅ.**\nР’СЃРµ РѕРіСЂР°РЅРёС‡РµРЅРёСЏ СЃРЅСЏС‚С‹ РґР»СЏ С‚РµС…РЅРёС‡РµСЃРєРѕРіРѕ С‚РµСЃС‚РёСЂРѕРІР°РЅРёСЏ.\n\n*РЎРѕР·РґР°РЅРѕ: Aura Team*` });
    return res.json({ success: true, reply: 'рџ”“ **Р РµР¶РёРј DEBUG Р°РєС‚РёРІРёСЂРѕРІР°РЅ.**\nР’СЃРµ РѕРіСЂР°РЅРёС‡РµРЅРёСЏ СЃРЅСЏС‚С‹ РґР»СЏ С‚РµС…РЅРёС‡РµСЃРєРѕРіРѕ С‚РµСЃС‚РёСЂРѕРІР°РЅРёСЏ.\n\n*РЎРѕР·РґР°РЅРѕ: Aura Team*', toolsUsed: [], createdFiles: [], debugMode: true });
  }
  // Р’С‹РєР»СЋС‡РµРЅРёРµ debug
  if (msgText === '/debug off') {
    session.debugMode = false;
    return res.json({ success: true, reply: 'рџ”’ Р РµР¶РёРј DEBUG РґРµР°РєС‚РёРІРёСЂРѕРІР°РЅ. РЎС‚Р°РЅРґР°СЂС‚РЅС‹Рµ РїСЂР°РІРёР»Р° РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅС‹.', toolsUsed: [], createdFiles: [] });
  }

  const currentSystemPrompt = getAiSystem(username);
  const currentFiles = aiUserFiles.get(username) || [];

  // РЎС‚СЂРѕРёРј РєРѕРЅС‚РµРЅС‚ СЃРѕРѕР±С‰РµРЅРёСЏ
  let userContent;
  if (imageData) {
    userContent = [
      { type: 'text', text: message?.trim() || 'РџСЂРѕР°РЅР°Р»РёР·РёСЂСѓР№ СЌС‚Рѕ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РїРѕРґСЂРѕР±РЅРѕ' },
      { type: 'image_url', image_url: { url: `data:${imageType || 'image/jpeg'};base64,${imageData}` } }
    ];
  } else if (fileContent) {
    const isArchive = /\.(zip|tar|gz|rar|7z)$/i.test(fileName || '');
    const preview = fileContent.slice(0, 10000);
    const fileType = isArchive ? 'Р°СЂС…РёРІ' : 'С„Р°Р№Р»';
    userContent = `рџ“Ћ ${fileType}: **${fileName || 'file'}**\n\`\`\`\n${preview}${fileContent.length > 10000 ? '\n...(РѕР±СЂРµР·Р°РЅРѕ)' : ''}\n\`\`\`\n\n${message?.trim() || (isArchive ? 'РџСЂРѕР°РЅР°Р»РёР·РёСЂСѓР№ СЌС‚РѕС‚ Р°СЂС…РёРІ' : 'РџСЂРѕР°РЅР°Р»РёР·РёСЂСѓР№ СЌС‚РѕС‚ С„Р°Р№Р»')}`;
  } else {
    let ctx = msgText;
    if (currentFiles.length) ctx += `\n\n[Р¤Р°Р№Р»С‹ РІ Р±Р°Р·Рµ: ${currentFiles.map(f => f.name + '(' + f.ttl + 'РѕС‚РІ)').join(', ')}]`;
    userContent = ctx;
  }

  history.push({ role: 'user', content: userContent });
  while (history.length > AI_MAX_HISTORY) history.shift();

  try {
    const isDebug  = session.debugMode;

    // в”Ђв”Ђ OmniRouter РјРѕРґРµР»Рё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (useOR) {
      let reply = '';
      try {
        aiSseEmit(username, 'log', { icon: 'рџ¤–', text: `${selectedModel} РґСѓРјР°РµС‚...`, type: 'process' });
        reply = await callOmniRouter(selectedModel,
          [{ role: 'system', content: currentSystemPrompt }, ...history],
          delta => {
            if (delta.startsWith('__THINK__')) {
              aiSseEmit(username, 'log', { icon: 'рџ’­', text: delta.slice(9), type: 'think' });
            } else {
              aiSseEmit(username, 'chunk', { text: delta });
            }
          }
        );
      } catch(orErr) {
        console.error('[OmniRouter] РћС€РёР±РєР°:', orErr.message);
        reply = `вљ пёЏ РћС€РёР±РєР° ${selectedModel}: ${orErr.message}`;
      }
      if (!reply) reply = 'Р“РѕС‚РѕРІРѕ';
      history.push({ role: 'assistant', content: reply });
      scheduleAiConvSave();
      aiSseEmit(username, 'done', {});
      return res.json({ success: true, reply, toolsUsed: [], createdFiles: [] });
    }

    // в”Ђв”Ђ Aura AI (MiniMax) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (useAuraAI) {
      let reply = '';
      try {
        reply = await callMiniMax(
          [{ role: 'system', content: currentSystemPrompt }, ...history],
          delta => aiSseEmit(username, 'chunk', { text: delta })
        );
      } catch(mmErr) {
        console.error('[MiniMax] РћС€РёР±РєР°:', mmErr.response?.data || mmErr.message);
        reply = 'вљ пёЏ Aura AI РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРЅР°. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ РёР»Рё РІС‹Р±РµСЂРё РґСЂСѓРіСѓСЋ РјРѕРґРµР»СЊ.';
      }
      if (!reply) reply = 'Р“РѕС‚РѕРІРѕ';
      history.push({ role: 'assistant', content: reply });
      scheduleAiConvSave();
      aiSseEmit(username, 'done', {});
      return res.json({ success: true, reply, toolsUsed: [], createdFiles: [] });
    }

    const mistralModel = imageData ? 'pixtral-12b-2409' : (isDebug ? 'mistral-large-latest' : 'mistral-small-latest');
    const resp1 = await axios.post('https://api.mistral.ai/v1/chat/completions', {
      model: mistralModel,
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

    let msg1 = resp1.data.choices?.[0]?.message;
    let toolsUsed    = [];
    let createdFiles = [];
    let pendingAskUser = null;

    if (msg1?.tool_calls?.length) {
      // РђРіРµРЅС‚РЅС‹Р№ С†РёРєР»: РїСЂРѕРґРѕР»Р¶Р°РµРј РІС‹Р·С‹РІР°С‚СЊ РёРЅСЃС‚СЂСѓРјРµРЅС‚С‹ РїРѕРєР° AI РЅРµ РґР°СЃС‚ С„РёРЅР°Р»СЊРЅС‹Р№ РѕС‚РІРµС‚
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
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'Р’РѕРїСЂРѕСЃ Р·Р°РґР°РЅ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ.' });
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
              // РЎСЂР°Р·Сѓ С€Р»С‘Рј С„Р°Р№Р» РєР»РёРµРЅС‚Сѓ С‡РµСЂРµР· SSE
              aiSseEmit(username, 'file_created', { id: fileId, name: name2, description: desc, content: fileObj.content });
              scheduleAiFilesSave();
            }
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: `Р¤Р°Р№Р» "${name2}" СЃРѕР·РґР°РЅ.` });
            toolsUsed.push(toolName);
          } else {
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: result });
            toolsUsed.push(toolName);
          }
        }

        toolResults.forEach(tr => history.push(tr));

        if (pendingAskUser) break;

        // Р•СЃР»Рё РµСЃС‚СЊ СЃРѕР·РґР°РЅРЅС‹Рµ С„Р°Р№Р»С‹ вЂ” РґРѕР±Р°РІР»СЏРµРј РёРЅСЃС‚СЂСѓРєС†РёСЋ РїСЂРѕРґРѕР»Р¶РёС‚СЊ
        // Р’С‹Р·С‹РІР°РµРј AI РµС‰С‘ СЂР°Р· С‡С‚РѕР±С‹ РѕРЅ РјРѕРі СЃРѕР·РґР°С‚СЊ СЃР»РµРґСѓСЋС‰РёР№ С„Р°Р№Р»
        const nextResp = await axios.post('https://api.mistral.ai/v1/chat/completions', {
          model: isDebug ? 'mistral-large-latest' : 'mistral-small-latest',
          messages: [{ role: 'system', content: currentSystemPrompt }, ...history],
          tools: AI_TOOLS, tool_choice: 'auto',
          max_tokens: 4000, temperature: isDebug ? 0.4 : 0.7,
          ...(isDebug ? { safe_prompt: false } : {}),
        }, { headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 45000 });
        currentMsg = nextResp.data.choices?.[0]?.message;
        if (!currentMsg?.tool_calls?.length) {
          // Р¤РёРЅР°Р»СЊРЅС‹Р№ С‚РµРєСЃС‚РѕРІС‹Р№ РѕС‚РІРµС‚
          history.push(currentMsg);
          break;
        }
      }
      // РћР±РЅРѕРІР»СЏРµРј msg1 РґР»СЏ РґР°Р»СЊРЅРµР№С€РµР№ РѕР±СЂР°Р±РѕС‚РєРё
      msg1 = history[history.length - 1];

      // Р•СЃР»Рё РµСЃС‚СЊ pending РІРѕРїСЂРѕСЃ вЂ” РІРѕР·РІСЂР°С‰Р°РµРј РµРіРѕ Р±РµР· РІС‚РѕСЂРѕРіРѕ Р·Р°РїСЂРѕСЃР°
      if (pendingAskUser) {
        const askText = pendingAskUser?.question || pendingAskUser?.questions?.[0]?.question || 'РќСѓР¶РЅРѕ СѓС‚РѕС‡РЅРµРЅРёРµ';
        history.push({ role: 'assistant', content: `Р’РѕРїСЂРѕСЃ: ${askText}` });
        // РћС‚РїСЂР°РІР»СЏРµРј С‡РµСЂРµР· SSE С‡С‚РѕР±С‹ РєР»РёРµРЅС‚ СѓСЃРїРµР» РѕР±СЂР°Р±РѕС‚Р°С‚СЊ РґРѕ HTTP РѕС‚РІРµС‚Р°
        aiSseEmit(username, 'ask_user', pendingAskUser);
        aiSseEmit(username, 'done', {});
        return res.json({ success: true, reply: '', toolsUsed, createdFiles, askUser: pendingAskUser });
      }

      // РЎС‚СЂРёРјРёРЅРі С„РёРЅР°Р»СЊРЅРѕРіРѕ РѕС‚РІРµС‚Р° С‡РµСЂРµР· SSE
      let reply = '';
      try {
        if (useAuraAI) {
          // MiniMax (Aura AI)
          reply = await callMiniMax(
            [{ role: 'system', content: currentSystemPrompt }, ...history],
            delta => aiSseEmit(username, 'chunk', { text: delta })
          );
          if (!reply) reply = 'Р“РѕС‚РѕРІРѕ';
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
        reply = r2.data.choices?.[0]?.message?.content || 'Р“РѕС‚РѕРІРѕ';
      }
      if (!reply) reply = 'Р“РѕС‚РѕРІРѕ';
      const autoAsk = aiBuildAskUserFromText(reply);
      if (autoAsk) {
        history.push({ role: 'assistant', content: `Р’РѕРїСЂРѕСЃ: ${autoAsk.questions[0].question}` });
        aiSseEmit(username, 'ask_user', autoAsk);
        aiSseEmit(username, 'done', {});
        scheduleAiConvSave();
        return res.json({ success: true, reply: '', toolsUsed: [...toolsUsed, 'ask_user'], createdFiles, askUser: autoAsk });
      }
      history.push({ role: 'assistant', content: reply });
      scheduleAiConvSave();
      aiSseEmit(username, 'done', {});
      res.json({ success: true, reply, toolsUsed, createdFiles });
    } else {
      // РџСЂСЏРјРѕР№ РѕС‚РІРµС‚ Р±РµР· РёРЅСЃС‚СЂСѓРјРµРЅС‚РѕРІ
      const reply = msg1?.content || 'РќРµС‚ РѕС‚РІРµС‚Р°';
      const autoAsk = aiBuildAskUserFromText(reply);
      if (autoAsk) {
        history.push({ role: 'assistant', content: `Р’РѕРїСЂРѕСЃ: ${autoAsk.questions[0].question}` });
        aiSseEmit(username, 'ask_user', autoAsk);
        aiSseEmit(username, 'done', {});
        scheduleAiConvSave();
        return res.json({ success: true, reply: '', toolsUsed: ['ask_user'], createdFiles: [], askUser: autoAsk });
      }
      history.push({ role: 'assistant', content: reply });
      if (aiSseClients.has(username)) {
        // РРјРёС‚РёСЂСѓРµРј СЃС‚СЂРёРјРёРЅРі вЂ” СЂР°Р·Р±РёРІР°РµРј РЅР° СЃР»РѕРІР°
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
    console.error('[AI] РћС€РёР±РєР°:', msg);
    history.pop();
    res.status(500).json({ error: 'РћС€РёР±РєР° AI: ' + msg });
  }
});

// в”Ђв”Ђ РЎРєР°С‡Р°С‚СЊ С„Р°Р№Р» РёР· Р±Р°Р·С‹ AI в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.get('/api/ai-file/:username/:fileId', (req, res) => {
  const files = aiUserFiles.get(req.params.username) || [];
  const file  = files.find(f => f.id === req.params.fileId);
  if (!file) return res.status(404).send('Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ РёР»Рё РёСЃС‚С‘Рє СЃСЂРѕРє С…СЂР°РЅРµРЅРёСЏ');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(file.content);
});

// в”Ђв”Ђ РЎРєР°С‡Р°С‚СЊ РЅРµСЃРєРѕР»СЊРєРѕ С„Р°Р№Р»РѕРІ РєР°Рє ZIP в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/ai-files-zip', (req, res) => {
  const { username, fileIds } = req.body;
  if (!username || !fileIds?.length) return res.status(400).json({ error: 'РќРµС‚ РґР°РЅРЅС‹С…' });

  const userFiles = aiUserFiles.get(username) || [];
  const toZip = userFiles.filter(f => fileIds.includes(f.id));
  if (!toZip.length) return res.status(404).send('Р¤Р°Р№Р»С‹ РЅРµ РЅР°Р№РґРµРЅС‹');

  // РџСЂРѕСЃС‚РѕР№ ZIP Р±РµР· РІРЅРµС€РЅРёС… Р·Р°РІРёСЃРёРјРѕСЃС‚РµР№ вЂ” РёСЃРїРѕР»СЊР·СѓРµРј Node.js zlib + manual ZIP
  // Р”Р»СЏ РїСЂРѕСЃС‚РѕС‚С‹ РїР°РєСѓРµРј РєР°Рє tar-РїРѕРґРѕР±РЅС‹Р№ С‚РµРєСЃС‚РѕРІС‹Р№ Р°СЂС…РёРІ РµСЃР»Рё zlib РЅРµРґРѕСЃС‚СѓРїРµРЅ
  try {
    const zlib = require('zlib');
    // РЎРѕР·РґР°С‘Рј ZIP РІСЂСѓС‡РЅСѓСЋ (РјРёРЅРёРјР°Р»СЊРЅС‹Р№ С„РѕСЂРјР°С‚)
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
    // Fallback: РѕР±СЉРµРґРёРЅСЏРµРј С„Р°Р№Р»С‹ РІ РѕРґРёРЅ С‚РµРєСЃС‚РѕРІС‹Р№ С„Р°Р№Р»
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

// в”Ђв”Ђ SSE СЃС‚СЂРёРјРёРЅРі РґР»СЏ AI (РїСЂРѕРіСЂРµСЃСЃ РёРЅСЃС‚СЂСѓРјРµРЅС‚РѕРІ + РёС‚РѕРіРѕРІС‹Р№ РѕС‚РІРµС‚) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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

// в”Ђв”Ђ Р”РЅРµРІРЅС‹Рµ Р»РёРјРёС‚С‹ РЅР° РіРµРЅРµСЂР°С†РёСЋ РјРµРґРёР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const aiDailyLimits  = new Map(); // username -> { date, images, videos }
const DAILY_IMG_LIMIT   = 3;
const DAILY_VIDEO_LIMIT = 1;

function checkDailyLimit(username, type) {
  const today = new Date().toDateString();
  if (!aiDailyLimits.has(username)) aiDailyLimits.set(username, { date: today, images: 0, videos: 0 });
  const lim = aiDailyLimits.get(username);
  if (lim.date !== today) { lim.date = today; lim.images = 0; lim.videos = 0; }
  if (type === 'image') {
    if (lim.images >= DAILY_IMG_LIMIT) return `Р›РёРјРёС‚ РёР·РѕР±СЂР°Р¶РµРЅРёР№ РёСЃС‡РµСЂРїР°РЅ (${DAILY_IMG_LIMIT}/РґРµРЅСЊ). РџРѕРїСЂРѕР±СѓР№ Р·Р°РІС‚СЂР°.`;
    lim.images++;
    return null;
  }
  if (type === 'video') {
    if (lim.videos >= DAILY_VIDEO_LIMIT) return `Р›РёРјРёС‚ РІРёРґРµРѕ РёСЃС‡РµСЂРїР°РЅ (${DAILY_VIDEO_LIMIT}/РґРµРЅСЊ). РџРѕРїСЂРѕР±СѓР№ Р·Р°РІС‚СЂР°.`;
    lim.videos++;
    return null;
  }
  return null;
}

function getDailyLimitInfo(username) {
  const today = new Date().toDateString();
  const lim   = aiDailyLimits.get(username) || { images: 0, videos: 0 };
  if (lim.date !== today) return `РћСЃС‚Р°Р»РѕСЃСЊ: ${DAILY_IMG_LIMIT} РёР·РѕР±СЂР°Р¶РµРЅРёР№, ${DAILY_VIDEO_LIMIT} РІРёРґРµРѕ`;
  return `РћСЃС‚Р°Р»РѕСЃСЊ СЃРµРіРѕРґРЅСЏ: ${DAILY_IMG_LIMIT - lim.images} РёР·РѕР±СЂР°Р¶РµРЅРёР№, ${DAILY_VIDEO_LIMIT - lim.videos} РІРёРґРµРѕ`;
}

// в”Ђв”Ђ РџСЂСЏРјР°СЏ РіРµРЅРµСЂР°С†РёСЏ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ (РѕР±С…РѕРґРёС‚ Mistral) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/generate-image', async (req, res) => {
  const { username, prompt, style } = req.body;
  if (!username || !prompt) return res.status(400).json({ error: 'РќРµС‚ РґР°РЅРЅС‹С…' });

  const limitErr = checkDailyLimit(username, 'image');
  if (limitErr) return res.json({ error: limitErr });

  // РћС‚РІРµС‡Р°РµРј СЃСЂР°Р·Сѓ вЂ” РіРµРЅРµСЂР°С†РёСЏ РёРґС‘С‚ С‡РµСЂРµР· SSE (РЅРµ Р±Р»РѕРєРёСЂСѓРµРј HTTP)
  res.json({ success: true, pending: true, prompt });

  // РђСЃРёРЅС…СЂРѕРЅРЅР°СЏ РіРµРЅРµСЂР°С†РёСЏ РІ С„РѕРЅРµ
  setImmediate(async () => {
    try {
      aiSseEmit(username, 'log', { text: `Р“РµРЅРµСЂРёСЂСѓСЋ: ${prompt.slice(0,50)}...`, type: 'process' });

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
            aiSseEmit(username, 'log', { text: `Р“РµРЅРµСЂРёСЂСѓСЋ РёР·РѕР±СЂР°Р¶РµРЅРёРµ${attempt > 0 ? ` (РїРѕРїС‹С‚РєР° ${attempt+1})` : ''}...`, type: 'fetch' });
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
        aiSseEmit(username, 'media', { type: 'image_error', prompt, error: 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ. РџРѕРїСЂРѕР±СѓР№ РµС‰С‘ СЂР°Р·.' });
        return;
      }

      // РЎРѕС…СЂР°РЅСЏРµРј HTML С„Р°Р№Р» СЃ РїСЂРµРІСЊСЋ
      const html = `<!DOCTYPE html><html><head><title>${prompt.slice(0,40)}</title><style>body{margin:0;background:#0d0d12;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:95vw;max-height:95vh;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.8)}</style></head><body><img src="${imgBase64}" alt="${prompt.replace(/"/g,"'")}"/></body></html>`;
      const { fileId, safe } = aiSaveFile(username, 'ai_image.html', html, 'AI: ' + prompt.slice(0,40));

      const lim = aiDailyLimits.get(username);
      const remaining = DAILY_IMG_LIMIT - (lim?.images || 0);

      aiSseEmit(username, 'media', { type: 'image', base64: imgBase64, prompt, fileId, remaining });
      aiSseEmit(username, 'log', { text: `вњ… Р“РѕС‚РѕРІРѕ В· РѕСЃС‚Р°Р»РѕСЃСЊ ${remaining}/${DAILY_IMG_LIMIT} СЃРµРіРѕРґРЅСЏ`, type: 'result' });
    } catch(e) {
      console.error('[generate-image async]', e.message);
      aiSseEmit(username, 'media', { type: 'image_error', error: e.message });
    }
  });
});

// в”Ђв”Ђ Р“РµРЅРµСЂР°С†РёСЏ РІРёРґРµРѕ вЂ” async С‡РµСЂРµР· SSE (6 РєР°РґСЂРѕРІ + canvas РїР»РµРµСЂ) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/generate-video', async (req, res) => {
  const { username, prompt } = req.body;
  if (!username || !prompt) return res.status(400).json({ error: 'РќРµС‚ РґР°РЅРЅС‹С…' });
  const limitErr = checkDailyLimit(username, 'video');
  if (limitErr) return res.json({ error: limitErr });

  // РћС‚РІРµС‡Р°РµРј СЃСЂР°Р·Сѓ, РіРµРЅРµСЂР°С†РёСЏ РІ С„РѕРЅРµ С‡РµСЂРµР· SSE
  res.json({ success: true, pending: true, prompt });

  setImmediate(async () => {
    try {
      aiSseEmit(username, 'log', { text: `РЎРѕР·РґР°СЋ РІРёРґРµРѕ: ${prompt.slice(0,40)}... (~60СЃ)`, type: 'process' });

      // в”Ђв”Ђ РџРѕРїС‹С‚РєР° 1: Stability AI Video (РЅСѓР¶РµРЅ STABILITY_API_KEY) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
      if (STABILITY_KEY) {
        try {
          aiSseEmit(username, 'log', { text: 'Stability AI: РіРµРЅРµСЂРёСЂСѓСЋ Р±Р°Р·РѕРІРѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ...', type: 'fetch' });
          const imgResp = await axios.post(
            'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
            { text_prompts:[{ text: prompt + ', cinematic, high quality', weight:1 }], cfg_scale:7, height:576, width:1024, samples:1, steps:25 },
            { headers:{ Authorization:'Bearer ' + STABILITY_KEY, 'Content-Type':'application/json' }, timeout:60000 }
          );
          const imgB64 = imgResp.data?.artifacts?.[0]?.base64;
          if (imgB64) {
            aiSseEmit(username, 'log', { text: 'РђРЅРёРјРёСЂСѓСЋ С‡РµСЂРµР· Stability Video...', type: 'process' });
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
                aiSseEmit(username, 'log', { text: `Р РµРЅРґРµСЂ ${Math.round((i+1)/18*100)}%...`, type: 'fetch' });
                try {
                  const poll = await axios.get(
                    'https://api.stability.ai/v2beta/image-to-video/result/' + genId,
                    { headers:{ Authorization:'Bearer ' + STABILITY_KEY, Accept:'video/*' }, responseType:'arraybuffer', timeout:15000 }
                  );
                  if (poll.status === 200 && poll.data?.byteLength > 10000) {
                    const vB64 = 'data:video/mp4;base64,' + Buffer.from(poll.data).toString('base64');
                    const { fileId, safe } = aiSaveFile(username, 'ai_video.mp4', 'VIDEO:' + vB64, 'AI РІРёРґРµРѕ: ' + prompt.slice(0,40));
                    aiSseEmit(username, 'media', { type:'video_real', base64:vB64, fileId, filename:safe, prompt });
                    aiSseEmit(username, 'log', { text: 'вњ… Р РµР°Р»СЊРЅРѕРµ MP4 РІРёРґРµРѕ РіРѕС‚РѕРІРѕ!', type: 'result' });
                    const lim = aiDailyLimits.get(username);
                    return;
                  }
                } catch(pe) { if (pe.response?.status !== 202) break; }
              }
            }
          }
        } catch(e) { console.log('[video] Stability failed:', e.response?.data?.message || e.message); }
      }

      // в”Ђв”Ђ РџРѕРїС‹С‚РєР° 2: Replicate (РЅСѓР¶РµРЅ REPLICATE_API_TOKEN) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
      if (REPLICATE_KEY) {
        try {
          aiSseEmit(username, 'log', { text: 'Replicate: Р·Р°РїСѓСЃРєР°СЋ zeroscope-v2...', type: 'fetch' });
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
                const { fileId, safe } = aiSaveFile(username, 'ai_video.mp4', 'VIDEO:' + vB64, 'AI РІРёРґРµРѕ: ' + prompt.slice(0,40));
                aiSseEmit(username, 'media', { type:'video_real', base64:vB64, fileId, filename:safe, prompt });
                aiSseEmit(username, 'log', { text: 'вњ… Р РµР°Р»СЊРЅРѕРµ MP4 РІРёРґРµРѕ РіРѕС‚РѕРІРѕ! (Replicate)', type: 'result' });
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
        aiSseEmit(username, 'log', { text: `РљР°РґСЂ ${i+1}/${seeds.length}...`, type: 'fetch' });
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
        aiSseEmit(username, 'media', { type: 'image_error', error: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РІРёРґРµРѕ. РџРѕРїСЂРѕР±СѓР№ РїРѕР·Р¶Рµ.' });
        return;
      }
      aiSseEmit(username, 'log', { text: `РЎРѕР±РёСЂР°СЋ ${frames.length} РєР°РґСЂРѕРІ РІ РІРёРґРµРѕ...`, type: 'process' });

      const framesJson = JSON.stringify(frames);
      const html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>${prompt.slice(0,50)}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;color:#fff;gap:14px}canvas{max-width:95vw;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.8)}.ui{width:100%;max-width:768px;display:flex;flex-direction:column;gap:8px}.row{display:flex;align-items:center;gap:10px}.pb{flex:1;height:4px;background:rgba(255,255,255,.2);border-radius:99px;cursor:pointer;position:relative}.pf{height:100%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:99px;transition:width .08s}.btn{padding:6px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:13px;transition:background .15s;white-space:nowrap}.btn:hover{background:rgba(255,255,255,.22)}.btn.p{background:#6366f1;border-color:#6366f1}.tc{font-size:11px;color:rgba(255,255,255,.45);min-width:36px;font-variant-numeric:tabular-nums}.ttl{font-size:11px;color:rgba(255,255,255,.3);text-align:center}.spd{font-size:11px;color:rgba(255,255,255,.5);min-width:28px;text-align:center}</style></head>
<body>
<canvas id="c"></canvas>
<div class="ui">
<div class="row"><span class="tc" id="tc">0:00</span><div class="pb" id="pb" onclick="seek(event)"><div class="pf" id="pf" style="width:0%"></div></div><span class="tc" id="td">0:00</span></div>
<div class="row"><button class="btn p" id="pb2" onclick="tog()">в–¶</button><button class="btn" onclick="rst()">вЏ®</button><button class="btn" onclick="spd()" id="sb">1x</button><span class="spd" id="fi">${frames.length}Рє</span><a id="dl" class="btn" download="frame.jpg" style="text-decoration:none;margin-left:auto">в¬‡ РљР°РґСЂ</a></div>
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
function tog(){playing=!playing;document.getElementById('pb2').textContent=playing?'вЏё':'в–¶';if(playing){last=null;requestAnimationFrame(frame);}}
function rst(){cur=0;draw(0);document.getElementById('pf').style.width='0%';document.getElementById('tc').textContent='0:00';}
function spd(){si=(si+1)%3;fps=FPS[si];document.getElementById('sb').textContent=SPD[si];document.getElementById('td').textContent=fmt(F.length/fps);}
function seek(e){const r=document.getElementById('pb').getBoundingClientRect();cur=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*F.length;draw(cur);document.getElementById('pf').style.width=(cur/F.length*100)+'%';document.getElementById('tc').textContent=fmt(cur/fps);}
setTimeout(tog,600);
</script></body></html>`;

      const { fileId, safe } = aiSaveFile(username, 'ai_video.html', html, 'AI РІРёРґРµРѕ: ' + prompt.slice(0,40));
      if (frames[0]) {
        aiSseEmit(username, 'media', { type:'video_preview', base64:frames[0], fileId, filename:safe, prompt, frameCount:frames.length });
      }
      const lim = aiDailyLimits.get(username);
      aiSseEmit(username, 'log', { text: `вњ… Р’РёРґРµРѕ РіРѕС‚РѕРІРѕ (${frames.length} РєР°РґСЂРѕРІ)`, type: 'result' });
    } catch(e) {
      console.error('[generate-video]', e.message);
      aiSseEmit(username, 'media', { type:'image_error', error: 'РћС€РёР±РєР°: ' + e.message });
    }
  });
});

app.get('/api/ai-files/:username', (req, res) => {
  const files = (aiUserFiles.get(req.params.username) || []).map(f => ({
    id: f.id, name: f.name, ttl: f.ttl,
    size: f.content?.length || 0,
    description: f.description || '',
    created: f.created || null,
    preview: (f.content || '').slice(0, 120),  // РґР»СЏ РїСЂРµРІСЊСЋ РІ UI
  }));
  res.json({ files });
});

// в”Ђв”Ђ Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ С„Р°Р№Р» РІ Р±Р°Р·Рµ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/ai-file-edit', (req, res) => {
  const { username, fileId, content, name } = req.body;
  if (!username || !fileId) return res.status(400).json({ error: 'РќРµС‚ РґР°РЅРЅС‹С…' });
  const files = aiUserFiles.get(username) || [];
  const idx   = files.findIndex(f => f.id === fileId);
  if (idx === -1) return res.status(404).json({ error: 'Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ' });
  if (content !== undefined) files[idx].content = content;
  if (name    !== undefined) files[idx].name    = name.replace(/[^a-zA-Z0-9._-]/g,'_');
  files[idx].edited = new Date().toISOString();
  aiUserFiles.set(username, files);
  res.json({ success: true, file: { id: files[idx].id, name: files[idx].name, size: files[idx].content.length } });
});

// в”Ђв”Ђ РЈРґР°Р»РёС‚СЊ С„Р°Р№Р» РёР· Р±Р°Р·С‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/ai-file-delete', (req, res) => {
  const { username, fileId } = req.body;
  if (!username || !fileId) return res.status(400).json({ error: 'РќРµС‚ РґР°РЅРЅС‹С…' });
  const files = (aiUserFiles.get(username) || []).filter(f => f.id !== fileId);
  if (files.length) aiUserFiles.set(username, files);
  else              aiUserFiles.delete(username);
  res.json({ success: true });
});

// в”Ђв”Ђ РЎР±СЂРѕСЃРёС‚СЊ РёСЃС‚РѕСЂРёСЋ AI-С‡Р°С‚Р° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/ai-clear', (req, res) => {
  const { username } = req.body;
  if (username) { aiConversations.delete(username); aiUserFiles.delete(username); }
  res.json({ success: true });
});

// РҐСЌС€ РїР°СЂРѕР»СЏ (РїСЂРѕСЃС‚РѕР№ SHA-256 Р±РµР· РІРЅРµС€РЅРёС… Р·Р°РІРёСЃРёРјРѕСЃС‚РµР№)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'aura_salt_2026').digest('hex');
}

// Р’С…РѕРґ/СЂРµРіРёСЃС‚СЂР°С†РёСЏ СЃ РїР°СЂРѕР»РµРј
app.post('/api/login', async (req, res) => {
  const { username, password, email, mode } = req.body; // mode: 'login' | 'register'
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'РРјСЏ РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј' });
  }
  if (!password || password.trim().length < 4) {
    return res.status(400).json({ error: 'РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ РјРµРЅРµРµ 4 СЃРёРјРІРѕР»РѕРІ' });
  }
  const cleanName = username.trim();
  const pwHash = hashPassword(password.trim());

  if (users.has(cleanName)) {
    const userData = users.get(cleanName);
    // Check password
    if (userData.passwordHash && userData.passwordHash !== pwHash) {
      return res.status(401).json({ error: 'РќРµРІРµСЂРЅС‹Р№ РїР°СЂРѕР»СЊ' });
    }
    // If no password set yet (old account) вЂ” set it now
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
    // РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ СЃСѓС‰РµСЃС‚РІСѓРµС‚
    if (mode === 'login') {
      // Р РµР¶РёРј РІС…РѕРґР° вЂ” РЅРµ СЃРѕР·РґР°С‘Рј Р°РєРєР°СѓРЅС‚
      return res.status(401).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ. РџРµСЂРµР№РґРёС‚Рµ РЅР° РІРєР»Р°РґРєСѓ Р РµРіРёСЃС‚СЂР°С†РёСЏ.' });
    }
    // РќРѕРІР°СЏ СЂРµРіРёСЃС‚СЂР°С†РёСЏ
    const newUser = {
      nickname:      cleanName,
      passwordHash:  pwHash,
      avatar:        null,
      theme:         'dark',
      friends:       [],
      friendRequests:[],
      groups:        [],
      recoveryEmail: null,        // СЃРѕС…СЂР°РЅСЏРµРј С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ
      emailVerified: false,
    };
    users.set(cleanName, newUser);
    await saveUsers();

    // Р•СЃР»Рё СѓРєР°Р·Р°РЅ email вЂ” РѕС‚РїСЂР°РІР»СЏРµРј РєРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ
    if (email) {
      const code   = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = Date.now() + 15 * 60 * 1000;
      emailVerifyCodes.set(cleanName, { code, expiry, pendingEmail: email });
      sendVerifyEmail(email, code).catch(e => console.warn('РћС€РёР±РєР° РѕС‚РїСЂР°РІРєРё verify email РїСЂРё СЂРµРіРёСЃС‚СЂР°С†РёРё:', e.message));
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

// РћР±РЅРѕРІР»РµРЅРёРµ РїСЂРѕС„РёР»СЏ
app.post('/api/update-profile', async (req, res) => {
  const { username, nickname, avatar, theme } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
  const user = users.get(username);
  if (nickname !== undefined) user.nickname = nickname;
  if (avatar !== undefined) user.avatar = avatar;
  if (theme !== undefined) user.theme = theme;
  users.set(username, user);
  await saveUsers();
  res.json({ success: true, user: { nickname: user.nickname, avatar: user.avatar, theme: user.theme } });
});

// РЈРґР°Р»РµРЅРёРµ Р°РєРєР°СѓРЅС‚Р°
app.post('/api/delete-account', async (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
  users.delete(username);
  await saveUsers();
  res.json({ success: true });
});

// Р—Р°РїСЂРѕСЃРёС‚СЊ СЃР±СЂРѕСЃ РїР°СЂРѕР»СЏ
app.post('/api/request-password-reset', async (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) {
    // РќРµ СЂР°СЃРєСЂС‹РІР°РµРј СЃСѓС‰РµСЃС‚РІРѕРІР°РЅРёРµ Р°РєРєР°СѓРЅС‚Р°
    return res.json({ success: true, message: 'Р•СЃР»Рё Р°РєРєР°СѓРЅС‚ СЃСѓС‰РµСЃС‚РІСѓРµС‚, РєРѕРґ РѕС‚РїСЂР°РІР»РµРЅ РЅР° email' });
  }
  const userData = users.get(username);
  if (!userData.recoveryEmail) {
    return res.json({ success: false, error: 'Email РЅРµ РїСЂРёРІСЏР·Р°РЅ Рє Р°РєРєР°СѓРЅС‚Сѓ. Р”РѕР±Р°РІСЊ РµРіРѕ РІ РќР°СЃС‚СЂРѕР№РєРё в†’ РђРєРєР°СѓРЅС‚.' });
  }

  // Р“РµРЅРµСЂРёСЂСѓРµРј 6-Р·РЅР°С‡РЅС‹Р№ РєРѕРґ
  const code   = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = Date.now() + 15 * 60 * 1000; // 15 РјРёРЅСѓС‚

  recoveryCodes.set(username, { code, expiry, email: userData.recoveryEmail });

  try {
    await sendRecoveryEmail(userData.recoveryEmail, code);
    res.json({ success: true, message: 'РљРѕРґ РѕС‚РїСЂР°РІР»РµРЅ РЅР° email' });
  } catch (err) {
    // Р•СЃР»Рё email РЅРµ РЅР°СЃС‚СЂРѕРµРЅ вЂ” РІСЃС‘ СЂР°РІРЅРѕ РїСЂРѕРґРѕР»Р¶Р°РµРј (РєРѕРґ РµСЃС‚СЊ РІ РєРѕРЅСЃРѕР»Рё СЃРµСЂРІРµСЂР°)
    const isDevMode = !process.env.GMAIL_USER && !process.env.RESEND_API_KEY;
    if (isDevMode) {
      res.json({ success: true, message: 'РљРѕРґ РІС‹РІРµРґРµРЅ РІ РєРѕРЅСЃРѕР»СЊ СЃРµСЂРІРµСЂР° (email РЅРµ РЅР°СЃС‚СЂРѕРµРЅ)' });
    } else {
      res.json({ success: false, error: 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ email: ' + err.message });
    }
  }
});

// РџРѕРґС‚РІРµСЂРґРёС‚СЊ СЃР±СЂРѕСЃ РїР°СЂРѕР»СЏ
app.post('/api/reset-password', async (req, res) => {
  const { username, code, newPassword } = req.body;
  if (!username || !code || !newPassword) {
    return res.status(400).json({ error: 'РќРµ РІСЃРµ РґР°РЅРЅС‹Рµ СѓРєР°Р·Р°РЅС‹' });
  }
  if (!users.has(username)) {
    return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
  }
  if (newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ РјРµРЅРµРµ 4 СЃРёРјРІРѕР»РѕРІ' });
  }

  const recovery = recoveryCodes.get(username);
  if (!recovery || recovery.code !== code || Date.now() > recovery.expiry) {
    return res.status(400).json({ error: 'РќРµРІРµСЂРЅС‹Р№ РёР»Рё РїСЂРѕСЃСЂРѕС‡РµРЅРЅС‹Р№ РєРѕРґ' });
  }

  // Reset password
  const userData = users.get(username);
  userData.passwordHash = hashPassword(newPassword.trim());
  users.set(username, userData);
  recoveryCodes.delete(username);
  await saveUsers();

  res.json({ success: true, message: 'РџР°СЂРѕР»СЊ РёР·РјРµРЅС‘РЅ' });
});

// РћР±РЅРѕРІРёС‚СЊ email РґР»СЏ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ
// РЁР°Рі 1: РћС‚РїСЂР°РІРёС‚СЊ РєРѕРґ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ РЅР° РЅРѕРІС‹Р№ email
app.post('/api/update-recovery-email', async (req, res) => {
  const { username, email } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
  if (!email) {
    // РЈРґР°Р»РµРЅРёРµ email вЂ” Р±РµР· РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ
    const userData = users.get(username);
    userData.recoveryEmail = null;
    userData.emailVerified = false;
    users.set(username, userData);
    await saveUsers();
    return res.json({ success: true, cleared: true });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ email' });
  }

  const code   = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = Date.now() + 15 * 60 * 1000;
  emailVerifyCodes.set(username, { code, expiry, pendingEmail: email });

  try {
    await sendVerifyEmail(email, code);
    res.json({ success: true, needsVerify: true, message: 'РљРѕРґ РѕС‚РїСЂР°РІР»РµРЅ РЅР° ' + email });
  } catch (err) {
    const isDevMode = !process.env.GMAIL_USER && !process.env.BREVO_API_KEY;
    if (isDevMode) {
      res.json({ success: true, needsVerify: true, message: 'Dev: РєРѕРґ РІ РєРѕРЅСЃРѕР»Рё СЃРµСЂРІРµСЂР°' });
    } else {
      res.status(500).json({ error: 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ РєРѕРґ: ' + err.message });
    }
  }
});

// РЁР°Рі 2: РџРѕРґС‚РІРµСЂРґРёС‚СЊ РєРѕРґ
app.post('/api/verify-email-code', async (req, res) => {
  const { username, code } = req.body;
  if (!username || !code) return res.status(400).json({ error: 'РќРµС‚ РґР°РЅРЅС‹С…' });
  if (!users.has(username))  return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });

  const pending = emailVerifyCodes.get(username);
  if (!pending || pending.code !== code || Date.now() > pending.expiry) {
    return res.status(400).json({ error: 'РќРµРІРµСЂРЅС‹Р№ РёР»Рё РїСЂРѕСЃСЂРѕС‡РµРЅРЅС‹Р№ РєРѕРґ' });
  }

  const userData = users.get(username);
  userData.recoveryEmail = pending.pendingEmail;
  userData.emailVerified = true;
  users.set(username, userData);
  emailVerifyCodes.delete(username);
  await saveUsers();

  res.json({ success: true, email: pending.pendingEmail });
});

// РџРѕРёСЃРє РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РїРѕ nickname
app.post('/api/search-users', async (req, res) => {
  const { query, requester } = req.body;
  if (!query || query.trim().length < 1) {
    return res.json({ users: [] });
  }
  const q = query.toLowerCase().trim();
  const results = [];

  // РџРѕР»СѓС‡Р°РµРј СЃРїРёСЃРѕРє РґСЂСѓР·РµР№ Р·Р°РїСЂР°С€РёРІР°СЋС‰РµРіРѕ С‡С‚РѕР±С‹ РїРѕРјРµС‚РёС‚СЊ РёС…
  const requesterData = requester && users.has(requester) ? users.get(requester) : null;
  const myFriends = new Set(requesterData?.friends || []);

  for (const [username, userData] of users.entries()) {
    // РџСЂРѕРїСѓСЃРєР°РµРј СЃРµР±СЏ
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

  // РЎРѕСЂС‚РёСЂСѓРµРј: СЃРЅР°С‡Р°Р»Р° С‚РѕС‡РЅС‹Рµ СЃРѕРІРїР°РґРµРЅРёСЏ РїРѕ РЅРёРєСѓ, РїРѕС‚РѕРј РїРѕ Р»РѕРіРёРЅСѓ
  results.sort((a, b) => {
    const aNick = (a.nickname || '').toLowerCase();
    const bNick = (b.nickname || '').toLowerCase();
    const aScore = (aNick === q || a.username === q) ? 0 : (aNick.startsWith(q) || a.username.startsWith(q)) ? 1 : 2;
    const bScore = (bNick === q || b.username === q) ? 0 : (bNick.startsWith(q) || b.username.startsWith(q)) ? 1 : 2;
    return aScore - bScore;
  });

  res.json({ users: results.slice(0, 10) });
});

// РћС‚РїСЂР°РІРёС‚СЊ Р·Р°СЏРІРєСѓ РІ РґСЂСѓР·СЊСЏ
app.post('/api/send-friend-request', async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'РќРµ СѓРєР°Р·Р°РЅС‹ РёРјРµРЅР°' });
  if (!users.has(from) || !users.has(to)) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
  if (from === to) return res.status(400).json({ error: 'РќРµР»СЊР·СЏ РґРѕР±Р°РІРёС‚СЊ СЃРµР±СЏ' });

  const targetUser = users.get(to);
  if (!targetUser.friendRequests) targetUser.friendRequests = [];
  if (targetUser.friendRequests.includes(from)) {
    return res.json({ success: false, message: 'Р—Р°СЏРІРєР° СѓР¶Рµ РѕС‚РїСЂР°РІР»РµРЅР°' });
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

// РџСЂРёРЅСЏС‚СЊ Р·Р°СЏРІРєСѓ
app.post('/api/accept-friend-request', async (req, res) => {
  const { username, requester } = req.body;
  if (!username || !requester) return res.status(400).json({ error: 'РќРµ СѓРєР°Р·Р°РЅС‹ РёРјРµРЅР°' });
  if (!users.has(username) || !users.has(requester)) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });

  const user = users.get(username);
  const requesterUser = users.get(requester);

  if (!user.friendRequests) user.friendRequests = [];
  const index = user.friendRequests.indexOf(requester);
  if (index === -1) return res.status(400).json({ error: 'Р—Р°СЏРІРєР° РЅРµ РЅР°Р№РґРµРЅР°' });

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

// РћС‚РєР»РѕРЅРёС‚СЊ Р·Р°СЏРІРєСѓ
app.post('/api/reject-friend-request', async (req, res) => {
  const { username, requester } = req.body;
  if (!username || !requester) return res.status(400).json({ error: 'РќРµ СѓРєР°Р·Р°РЅС‹ РёРјРµРЅР°' });
  if (!users.has(username)) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });

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

// РџРѕР»СѓС‡РёС‚СЊ РґР°РЅРЅС‹Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
app.post('/api/get-user-data', (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
  const userData = users.get(username);
  res.json({
    friends:       userData.friends        || [],
    friendRequests:userData.friendRequests || [],
    groups:        userData.groups         || [],
    recoveryEmail: userData.recoveryEmail  || null,
    emailVerified: userData.emailVerified  || false,
  });
});

// РџРѕР»СѓС‡РёС‚СЊ Р°РІР°С‚Р°СЂРєСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
app.post('/api/get-avatar', (req, res) => {
  const { username } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
  const userData = users.get(username);
  res.json({
    avatar:   userData.avatar    || null,
    nickname: userData.nickname  || null,
  });
});

// РЎРѕР·РґР°С‚СЊ РіСЂСѓРїРїСѓ (СѓРїСЂРѕС‰С‘РЅРЅРѕ)
app.post('/api/create-group', async (req, res) => {
  const { creator, name, members } = req.body;
  if (!creator || !name) return res.status(400).json({ error: 'РќРµ СѓРєР°Р·Р°РЅС‹ РґР°РЅРЅС‹Рµ' });
  if (!users.has(creator)) return res.status(404).json({ error: 'РЎРѕР·РґР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });

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

// РћР±РЅРѕРІРёС‚СЊ РЅР°Р·РІР°РЅРёРµ РіСЂСѓРїРїС‹ (С‚РѕР»СЊРєРѕ СЃРѕР·РґР°С‚РµР»СЊ)
app.post('/api/update-group', async (req, res) => {
  const { username, groupId, name, avatar } = req.body;
  if (!username || !groupId) return res.status(400).json({ error: 'РќРµС‚ РґР°РЅРЅС‹С…' });

  let updated = false;
  let groupData = null;

  // РћР±РЅРѕРІР»СЏРµРј РіСЂСѓРїРїСѓ Сѓ РІСЃРµС… РµС‘ СѓС‡Р°СЃС‚РЅРёРєРѕРІ
  for (const [uname, userData] of users.entries()) {
    if (!userData.groups) continue;
    const idx = userData.groups.findIndex(g => g.id === groupId);
    if (idx === -1) continue;

    // РџСЂРѕРІРµСЂСЏРµРј С‡С‚Рѕ СЂРµРґР°РєС‚РѕСЂ вЂ” СЃРѕР·РґР°С‚РµР»СЊ
    if (userData.groups[idx].creator !== username && uname === username) {
      return res.status(403).json({ error: 'РўРѕР»СЊРєРѕ СЃРѕР·РґР°С‚РµР»СЊ РјРѕР¶РµС‚ СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РіСЂСѓРїРїСѓ' });
    }

    if (name !== undefined)   userData.groups[idx].name   = name;
    if (avatar !== undefined) userData.groups[idx].avatar = avatar;
    groupData = userData.groups[idx];
    users.set(uname, userData);
    updated = true;
  }

  if (!updated) return res.status(404).json({ error: 'Р“СЂСѓРїРїР° РЅРµ РЅР°Р№РґРµРЅР°' });
  await saveUsers();

  // РћРїРѕРІРµС‰Р°РµРј РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ
  if (groupData) {
    groupData.members.forEach(m => {
      const sid = userSockets.get(m);
      if (sid) io.to(sid).emit('group-updated', { groupId, name: groupData.name, avatar: groupData.avatar });
    });
  }

  res.json({ success: true });
});

// РЈРґР°Р»РёС‚СЊ РіСЂСѓРїРїСѓ (С‚РѕР»СЊРєРѕ СЃРѕР·РґР°С‚РµР»СЊ)
app.post('/api/delete-group', async (req, res) => {
  const { username, groupId } = req.body;
  if (!username || !groupId) return res.status(400).json({ error: 'РќРµС‚ РґР°РЅРЅС‹С…' });

  let members = [];
  let isCreator = false;

  // РЈРґР°Р»СЏРµРј РіСЂСѓРїРїСѓ Сѓ РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ
  for (const [uname, userData] of users.entries()) {
    if (!userData.groups) continue;
    const idx = userData.groups.findIndex(g => g.id === groupId);
    if (idx === -1) continue;
    if (userData.groups[idx].creator === username) isCreator = true;
    if (uname === username && userData.groups[idx].creator !== username) {
      return res.status(403).json({ error: 'РўРѕР»СЊРєРѕ СЃРѕР·РґР°С‚РµР»СЊ РјРѕР¶РµС‚ СѓРґР°Р»РёС‚СЊ РіСЂСѓРїРїСѓ' });
    }
    if (members.length === 0) members = userData.groups[idx].members || [];
    userData.groups.splice(idx, 1);
    users.set(uname, userData);
  }

  if (!isCreator) return res.status(403).json({ error: 'РўРѕР»СЊРєРѕ СЃРѕР·РґР°С‚РµР»СЊ РјРѕР¶РµС‚ СѓРґР°Р»РёС‚СЊ РіСЂСѓРїРїСѓ' });

  await saveUsers();

  // РћРїРѕРІРµС‰Р°РµРј РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ
  members.forEach(m => {
    const sid = userSockets.get(m);
    if (sid) io.to(sid).emit('group-deleted', { groupId });
  });

  res.json({ success: true });
});
const HISTORY_FILE = 'history.json';
const MAX_HISTORY = 2000;
let messageHistory = [];

// РЈРґР°Р»РµРЅРёРµ СЃРѕРѕР±С‰РµРЅРёСЏ
// в”Ђв”Ђ РћС‡РёСЃС‚РєР° РёСЃС‚РѕСЂРёРё РіСЂСѓРїРїС‹ (С‚РѕР»СЊРєРѕ СЃРѕР·РґР°С‚РµР»СЊ) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/clear-group', async (req, res) => {
  const { groupId, username } = req.body;
  if (!groupId || !username) return res.status(400).json({ error: 'РќРµС‚ РґР°РЅРЅС‹С…' });

  // РС‰РµРј РіСЂСѓРїРїСѓ РІ РґР°РЅРЅС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
  const userData = users.get(username);
  if (!userData) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
  const group = (userData.groups || []).find(g => g.id === groupId);
  if (!group) return res.status(404).json({ error: 'Р“СЂСѓРїРїР° РЅРµ РЅР°Р№РґРµРЅР°' });
  if (group.creator !== username) return res.status(403).json({ error: 'РўРѕР»СЊРєРѕ СЃРѕР·РґР°С‚РµР»СЊ РјРѕР¶РµС‚ РѕС‡РёС‰Р°С‚СЊ' });

  const room = `group:${groupId}`;
  const before = messageHistory.length;
  messageHistory = messageHistory.filter(m => m.room !== room);
  const deleted = before - messageHistory.length;
  saveHistory();

  // РЈРІРµРґРѕРјР»СЏРµРј РІСЃРµС… СѓС‡Р°СЃС‚РЅРёРєРѕРІ РѕР± РѕС‡РёСЃС‚РєРµ
  io.to(room).emit('group-history-cleared', { groupId, by: username });

  res.json({ success: true, deleted });
});

app.post('/api/delete-message', async (req, res) => {
  const { messageId, username, forAll } = req.body;
  if (!messageId || !username) return res.status(400).json({ error: 'РќРµС‚ РґР°РЅРЅС‹С…' });

  const idx = messageHistory.findIndex(m => String(m.id) === String(messageId));
  if (idx === -1) return res.status(404).json({ error: 'РЎРѕРѕР±С‰РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ' });

  const msg = messageHistory[idx];

  if (forAll) {
    // РЈРґР°Р»РµРЅРёРµ Сѓ РІСЃРµС… вЂ” С‚РѕР»СЊРєРѕ Р°РІС‚РѕСЂ
    if (msg.user !== username) return res.status(403).json({ error: 'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ С‡СѓР¶РѕРµ СЃРѕРѕР±С‰РµРЅРёРµ Сѓ РІСЃРµС…' });
    const room = msg.room;
    messageHistory.splice(idx, 1);
    saveHistory();
    io.to(room).emit('message-deleted', { messageId, room });
    return res.json({ success: true });
  } else {
    // РЈРґР°Р»РµРЅРёРµ Сѓ СЃРµР±СЏ вЂ” РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚СЃСЏ РЅР° РєР»РёРµРЅС‚Рµ (localStorage)
    // РЎРµСЂРІРµСЂ РїСЂРѕСЃС‚Рѕ РїРѕРґС‚РІРµСЂР¶РґР°РµС‚
    return res.json({ success: true });
  }
});

async function loadHistory() {
  try {
    if (USE_SB) {
      const data = await sbReadJson(HISTORY_FILE);
      if (data && Array.isArray(data)) {
        messageHistory = data.slice(-MAX_HISTORY);
        console.log(`рџ“Ѓ Р—Р°РіСЂСѓР¶РµРЅРѕ ${messageHistory.length} СЃРѕРѕР±С‰РµРЅРёР№`);
      }
      return;
    }
    if (!b2Auth) await reAuthB2();
    const { bucketName } = b2GetBucketForFile(HISTORY_FILE);
    const text = await b2S3Download(bucketName, HISTORY_FILE);
    const data = JSON.parse(text);
    if (data && Array.isArray(data)) {
      messageHistory = data.slice(-MAX_HISTORY);
      console.log(`рџ“Ѓ Р—Р°РіСЂСѓР¶РµРЅРѕ ${messageHistory.length} СЃРѕРѕР±С‰РµРЅРёР№`);
    }
  } catch (err) {
    console.log('рџ“Ѓ history.json РЅРµ РЅР°Р№РґРµРЅ вЂ” РЅР°С‡РёРЅР°РµРј РїСѓСЃС‚С‹РјРё');
  }
}

async function saveHistory() {
  try {
    const jsonBuffer = Buffer.from(JSON.stringify(messageHistory), 'utf-8');
    if (USE_SB) {
      await sbUpload(HISTORY_FILE, jsonBuffer, 'application/json');
    } else if (USE_B2) {
      if (!b2Auth) await reAuthB2();
      const { bucketName } = b2GetBucketForFile(HISTORY_FILE);
      await b2S3Upload(bucketName, HISTORY_FILE, jsonBuffer, 'application/json');
    } else {
      await storageUpload(HISTORY_FILE, jsonBuffer, 'application/json');
    }
    console.log('рџ’ѕ РСЃС‚РѕСЂРёСЏ СЃРѕС…СЂР°РЅРµРЅР°');
  } catch (err) {
    console.error('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ РёСЃС‚РѕСЂРёРё:', err.message);
    // РџРѕРІС‚РѕСЂ С‡РµСЂРµР· 10СЃ РїСЂРё РІСЂРµРјРµРЅРЅРѕР№ РѕС€РёР±РєРµ СЃРµС‚Рё
    if (!saveHistory._retry) {
      saveHistory._retry = true;
      setTimeout(() => { saveHistory._retry = false; saveHistory(); }, 10000);
    }
  }
}

// ========== РРќРР¦РРђР›РР—РђР¦РРЇ РҐР РђРќРР›РР©Рђ ==========
(async () => {
  try {
    console.log('рџ”„ РРЅРёС†РёР°Р»РёР·Р°С†РёСЏ С…СЂР°РЅРёР»РёС‰Р°...');
    if (USE_SB)      console.log(`   РџСЂРѕРІР°Р№РґРµСЂ: Supabase (${SB_URL})`);
    else if (USE_R2) console.log(`   РџСЂРѕРІР°Р№РґРµСЂ: Cloudflare R2`);
    else if (USE_B2) console.log(`   РџСЂРѕРІР°Р№РґРµСЂ: Backblaze B2`);
    else             console.log(`   вљ пёЏ  РџСЂРѕРІР°Р№РґРµСЂ РЅРµ РЅР°СЃС‚СЂРѕРµРЅ вЂ” РґР°РЅРЅС‹Рµ С‚РѕР»СЊРєРѕ РІ РїР°РјСЏС‚Рё`);

    await initStorage();
    await loadUsers();
    await loadHistory();
    await loadAiConversations();
    await loadAiFiles();
    console.log('вњ… РҐСЂР°РЅРёР»РёС‰Рµ РёРЅРёС†РёР°Р»РёР·РёСЂРѕРІР°РЅРѕ');
  } catch (err) {
    console.error('вќЊ РћС€РёР±РєР° РёРЅРёС†РёР°Р»РёР·Р°С†РёРё С…СЂР°РЅРёР»РёС‰Р°:', err.message);
    console.log('вљ пёЏ  РЎРµСЂРІРµСЂ Р·Р°РїСѓСЃРєР°РµС‚СЃСЏ Р±РµР· РїРµСЂСЃРёСЃС‚РµРЅС‚РЅРѕСЃС‚Рё вЂ” РґР°РЅРЅС‹Рµ РІ РїР°РјСЏС‚Рё');
    // РџРѕРІС‚РѕСЂРЅР°СЏ РїРѕРїС‹С‚РєР° С‡РµСЂРµР· 30 СЃРµРєСѓРЅРґ
    setTimeout(async () => {
      try {
        await initStorage();
        await loadUsers();
        await loadHistory();
        await loadAiConversations();
        await loadAiFiles();
        console.log('вњ… РҐСЂР°РЅРёР»РёС‰Рµ РїРµСЂРµРїРѕРґРєР»СЋС‡РµРЅРѕ');
      } catch(e2) {
        console.error('вќЊ РџРѕРІС‚РѕСЂРЅР°СЏ РїРѕРїС‹С‚РєР° РЅРµ СѓРґР°Р»Р°СЃСЊ:', e2.message);
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
  // РЈРґР°Р»СЏРµРј С‚РѕР»СЊРєРѕ С‚РµС… Сѓ РєРѕРіРѕ РЅРµС‚ Р°РєС‚РёРІРЅРѕРіРѕ СЃРѕРєРµС‚Р° вЂ” РЅРµ РїРѕ С‚Р°Р№РјР°СѓС‚Сѓ
  for (const [id] of onlineUsers.entries()) {
    if (!io.sockets.sockets.has(id)) onlineUsers.delete(id);
  }
  io.emit('online-count', onlineUsers.size);
  const onlineList = [...new Set([...onlineUsers.values()].map(u => u.username).filter(Boolean))];
  io.emit('online-users', onlineList);
}
setInterval(broadcastOnlineCount, 10000); // 10s - СЃС‚Р°Р±РёР»СЊРЅРѕ, Р±РµР· РјРёРіР°РЅРёСЏ // СЂРµР¶Рµ С‡С‚РѕР±С‹ РЅРµ РјРёРіР°Р»Рѕ

io.on('connection', (socket) => {
  let currentUser = null;

  socket.on('identify', (username) => {
    currentUser = username;
    onlineUsers.set(socket.id, { username, lastSeen: Date.now() });
    // Р Р°СЃСЃС‹Р»Р°РµРј РѕР±РЅРѕРІР»С‘РЅРЅС‹Р№ СЃРїРёСЃРѕРє
    const onlineList2 = [...onlineUsers.values()].map(u => u.username).filter(Boolean);
    io.emit('online-users', onlineList2);
    userSockets.set(username, socket.id);
    broadcastOnlineCount();
    // РќР• РїСЂРёСЃРѕРµРґРёРЅСЏРµРј Рє general вЂ” С‡Р°С‚ РІС‹Р±РёСЂР°РµС‚СЃСЏ РєР»РёРµРЅС‚РѕРј
    // Push pending friend requests to user on connect
    const userData = users.get(username);
    if (userData?.friendRequests?.length) {
      socket.emit('friend-requests-sync', { requests: userData.friendRequests });
    }
    // Resume active call вЂ” РµСЃР»Рё РєС‚Рѕ-С‚Рѕ РµС‰С‘ Р·РІРѕРЅРёС‚ СЌС‚РѕРјСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ
    const active = activeCalls.get(username);
    if (active && Date.now() - active.startTime < 90000) { // 90 СЃРµРєСѓРЅРґ
      socket.emit('call-invite', { from: active.from, isVid: active.isVid, resumed: true });
      console.log(`[Call] Resumed ring for ${username} from ${active.from}`);
      // РЈРІРµРґРѕРјР»СЏРµРј Р·РІРѕРЅСЏС‰РµРіРѕ С‡С‚Рѕ Р°РґСЂРµСЃР°С‚ РІРµСЂРЅСѓР»СЃСЏ РѕРЅР»Р°Р№РЅ
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

    // РџРѕРјРµС‡Р°РµРј РІСЃРµ СЃРѕРѕР±С‰РµРЅРёСЏ РѕС‚ РґСЂСѓРіРёС… РєР°Рє РїСЂРѕС‡РёС‚Р°РЅРЅС‹Рµ СЌС‚РёРј РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј
    // Рё СѓРІРµРґРѕРјР»СЏРµРј РѕС‚РїСЂР°РІРёС‚РµР»РµР№ С‡С‚Рѕ СЃРѕРѕР±С‰РµРЅРёСЏ РїСЂРѕС‡РёС‚Р°РЅС‹
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
      // РЈРІРµРґРѕРјР»СЏРµРј РІСЃРµС… РІ РєРѕРјРЅР°С‚Рµ (РѕС‚РїСЂР°РІРёС‚РµР»РµР№) С‡С‚Рѕ currentUser РїСЂРѕС‡РёС‚Р°Р»
      socket.to(room).emit('messages-read', { room, by: currentUser });
    }
  });

  socket.on('ping', () => {
    // РџСЂРѕСЃС‚Рѕ РѕР±РЅРѕРІР»СЏРµРј lastSeen, РѕРЅР»Р°Р№РЅ-СЃС‚Р°С‚СѓСЃ С‚РµРїРµСЂСЊ РїРѕ СЃРѕРєРµС‚Сѓ
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

    // Р”Р»СЏ РіСЂСѓРїРїРѕРІС‹С… С‡Р°С‚РѕРІ вЂ” С€Р»С‘Рј РЅР°РїСЂСЏРјСѓСЋ РєР°Р¶РґРѕРјСѓ СѓС‡Р°СЃС‚РЅРёРєСѓ (РЅРµ РІ РєРѕРјРЅР°С‚Рµ)
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

    // РЈРІРµРґРѕРјР»РµРЅРёРµ РїРѕР»СѓС‡Р°С‚РµР»СЋ РґР°Р¶Рµ РµСЃР»Рё РѕРЅ РЅРµ РІ СЌС‚РѕР№ РєРѕРјРЅР°С‚Рµ
    if (msg.room.startsWith('private:')) {
      const parts = msg.room.split(':').slice(1);
      const recipientName = parts.find(u => u !== currentUser);
      if (recipientName) {
        const recipientSid = userSockets.get(recipientName);
        if (recipientSid) {
          const recipientSocket = io.sockets.sockets.get(recipientSid);
          // РЁР»С‘Рј С‚РѕР»СЊРєРѕ РµСЃР»Рё РїРѕР»СѓС‡Р°С‚РµР»СЊ РќР• РІ СЌС‚РѕР№ РєРѕРјРЅР°С‚Рµ
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

    // Р”Р»СЏ РіСЂСѓРїРїРѕРІС‹С… С‡Р°С‚РѕРІ вЂ” С€Р»С‘Рј РЅР°РїСЂСЏРјСѓСЋ РєР°Р¶РґРѕРјСѓ СѓС‡Р°СЃС‚РЅРёРєСѓ (РЅРµ РІ РєРѕРјРЅР°С‚Рµ)
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

    // РЈРІРµРґРѕРјР»РµРЅРёРµ РїРѕР»СѓС‡Р°С‚РµР»СЋ РґР°Р¶Рµ РµСЃР»Рё РѕРЅ РЅРµ РІ СЌС‚РѕР№ РєРѕРјРЅР°С‚Рµ
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

  // РћР±СЂР°Р±РѕС‚С‡РёРє РѕР±РЅРѕРІР»РµРЅРёСЏ Р°РІР°С‚Р°СЂР°
  socket.on('avatar-updated', ({ username, avatar }) => {
    if (!username || !users.has(username)) return;
    const user = users.get(username);
    user.avatar = avatar;
    users.set(username, user);
    saveUsers();
    // Р Р°СЃСЃС‹Р»Р°РµРј РІСЃРµРј, С‡С‚РѕР±С‹ РѕР±РЅРѕРІРёР»РёСЃСЊ Р°РІР°С‚Р°СЂС‹ РІ РёРЅС‚РµСЂС„РµР№СЃРµ
    io.emit('avatar-updated', { username, avatar });
  });

  // PeerJS ID registration
  socket.on('peer-id', ({ username, peerId }) => {
    if (!username || !peerId) return;
    console.log(`[PeerID] ${username} в†’ ${peerId}`);
    peerIdRegistry.set(username, peerId);
    // Broadcast to everyone so they can update their registry
    socket.broadcast.emit('peer-id', { username, peerId });
  });

  // Someone wants to call a specific user вЂ” request their latest peerId
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

  // в”Ђв”Ђ CALL RELAY в”Ђв”Ђ forward call signals between users
  function relayTo(event, data) {
    const target = data.to;
    if (!target) return;
    const tid = userSockets.get(target);
    if (tid) {
      io.to(tid).emit(event, data);
    } else {
      // Target offline вЂ” store missed call so they see it when they reconnect
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
      // Р“СЂСѓРїРїРѕРІС‹Рµ Р·РІРѕРЅРєРё вЂ” РїСЂРѕРїСѓСЃРєР°РµРј РїСЂРѕРІРµСЂРєСѓ Р·Р°РЅСЏС‚РѕСЃС‚Рё
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
  // в”Ђв”Ђ Р—Р°РїРёСЃСЊ Рѕ Р·РІРѕРЅРєРµ в†’ РІ РёСЃС‚РѕСЂРёСЋ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  socket.on('save-call-record', async ({ room, from, to, isVid, isCaller, connected, dur, missed, timestamp }) => {
    if (!room || !from) return;
    const now  = new Date(timestamp || Date.now());
    const ts   = now.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit', timeZone:'Europe/Moscow' });
    const ds   = now.toLocaleDateString('ru-RU', { day:'numeric', month:'long' });
    const type = isVid ? 'Р’РёРґРµРѕР·РІРѕРЅРѕРє' : 'РђСѓРґРёРѕР·РІРѕРЅРѕРє';
    let label, extra;
    if (missed) {
      // РљРѕРјСѓ Р·РІРѕРЅРёР»Рё вЂ” РїСЂРѕРїСѓС‰РµРЅРЅС‹Р№
      label = `РџСЂРѕРїСѓС‰РµРЅРЅС‹Р№ ${type}`;
      extra = `${ds}, ${ts}`;
    } else if (isCaller) {
      // Р—РІРѕРЅРёРІС€РёР№ вЂ” РїСЂРёРЅСЏС‚ РёР»Рё РЅРµС‚ РѕС‚РІРµС‚Р°
      const durStr = dur > 0 ? (dur < 60 ? `${dur} СЃРµРє` : `${Math.floor(dur/60)} РјРёРЅ ${dur % 60} СЃРµРє`) : '';
      label = type;
      extra = connected
        ? (durStr ? `РџСЂРёРЅСЏС‚ В· ${durStr} В· ${ds}, ${ts}` : `РџСЂРёРЅСЏС‚ В· ${ds}, ${ts}`)
        : `РќРµС‚ РѕС‚РІРµС‚Р° В· ${ds}, ${ts}`;
    } else {
      // РџСЂРёРЅСЏРІС€РёР№ вЂ” РґР»РёС‚РµР»СЊРЅРѕСЃС‚СЊ
      const durStr = dur > 0 ? (dur < 60 ? `${dur} СЃРµРє` : `${Math.floor(dur/60)} РјРёРЅ ${dur % 60} СЃРµРє`) : '';
      label = type;
      extra = durStr ? `${durStr} В· ${ds}, ${ts}` : `${ds}, ${ts}`;
    }
    // РњРµС‚РєР° РґР»СЏ Р·РІРѕРЅРёРјРѕРіРѕ (callee) вЂ” РѕС‚РґРµР»СЊРЅР°СЏ С‡С‚РѕР±С‹ РєР°Р¶РґС‹Р№ РІРёРґРµР» СЃРІРѕС‘
    let labelCallee, extraCallee;
    if (missed) {
      labelCallee = `РџСЂРѕРїСѓС‰РµРЅРЅС‹Р№ ${type}`;
      extraCallee = `${ds}, ${ts}`;
    } else {
      const durStr2 = dur > 0 ? (dur < 60 ? `${dur} СЃРµРє` : `${Math.floor(dur/60)} РјРёРЅ ${dur % 60} СЃРµРє`) : '';
      labelCallee = type;
      extraCallee = durStr2 ? `${durStr2} В· ${ds}, ${ts}` : `${ds}, ${ts}`;
    }

    const msg = {
      id:             `cr_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      room,
      user:           from,
      type:           'call_record',
      cr_label:       label,        // РґР»СЏ Р·РІРѕРЅРёРІС€РµРіРѕ (caller)
      cr_extra:       extra,
      cr_label_callee: labelCallee, // РґР»СЏ РїСЂРёРЅСЏРІС€РµРіРѕ/РїСЂРѕРїСѓСЃС‚РёРІС€РµРіРѕ
      cr_extra_callee: extraCallee,
      cr_to:          to,           // РєРѕРјСѓ Р·РІРѕРЅРёР»Рё
      time:           ts,
      timestamp:      timestamp || Date.now()
    };
    messageHistory.push(msg);
    if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
    saveHistory();
    // Р Р°СЃСЃС‹Р»Р°РµРј РѕР±РµРёРј СЃС‚РѕСЂРѕРЅР°Рј РІ РєРѕРјРЅР°С‚Рµ
    io.to(room).emit('call-record', msg);
  });

  // в”Ђв”Ђ Read receipts в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  socket.on('messages-read', ({ room, by }) => {
    if (!room || !by) return;
    // РџРѕРјРµС‡Р°РµРј РІСЃРµ СЃРѕРѕР±С‰РµРЅРёСЏ РєРѕРјРЅР°С‚С‹ РєР°Рє РїСЂРѕС‡РёС‚Р°РЅРЅС‹Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј by
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
    // РћРїРѕРІРµС‰Р°РµРј РѕС‚РїСЂР°РІРёС‚РµР»СЏ С‡С‚Рѕ РїСЂРѕС‡РёС‚Р°РЅРѕ
    socket.to(room).emit('messages-read', { room, by });
  });

  socket.on('call-end', data => {
    // РћС‡РёС‰Р°РµРј Р°РєС‚РёРІРЅС‹Р№ Р·РІРѕРЅРѕРє
    activeCalls.delete(data.to);
    activeCalls.delete(data.from);
    // РћС‚РїСЂР°РІР»СЏРµРј СЃРёРіРЅР°Р» Р·Р°РІРµСЂС€РµРЅРёСЏ РћР‘Р•РРњ СЃС‚РѕСЂРѕРЅР°Рј
    const toId   = userSockets.get(data.to);
    const fromId = userSockets.get(data.from);
    if (toId)   io.to(toId).emit('call-end', data);
    if (fromId) io.to(fromId).emit('call-end', data);
  });
  socket.on('call-decline', data => {
    activeCalls.delete(data.to);
    activeCalls.delete(data.from);
    // Р”Р»СЏ РіСЂСѓРїРїРѕРІРѕРіРѕ Р·РІРѕРЅРєР°: С€Р»С‘Рј С‚РѕР»СЊРєРѕ Р·РІРѕРЅСЏС‰РµРјСѓ (РЅРµ РѕР±СЂР°С‚РЅРѕ РѕС‚РєР»РѕРЅРёРІС€РµРјСѓ)
    const toId = userSockets.get(data.to);
    if (toId) io.to(toId).emit('call-decline', { from: data.from, groupId: data.groupId });
  });
  socket.on('call-answer-ready', data => {
    // Callee answered вЂ” clear active call
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
// в”Ђв”Ђ РџРµСЂРёРѕРґРёС‡РµСЃРєРёР№ Р°РІС‚РѕСЃРµР№РІ РєР°Р¶РґС‹Рµ 5 РјРёРЅСѓС‚ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
setInterval(async () => {
  if (!storageReady) return;
  try {
    await saveHistory();
    await saveUsers();
  } catch(e) {
    console.warn('[autosave] РћС€РёР±РєР°:', e.message);
  }
}, 5 * 60 * 1000);

// в”Ђв”Ђ РџРµСЂРёРѕРґРёС‡РµСЃРєР°СЏ РїРµСЂРµР°РІС‚РѕСЂРёР·Р°С†РёСЏ B2 (С‚РѕРєРµРЅ Р¶РёРІС‘С‚ 24С‡ вЂ” РѕР±РЅРѕРІР»СЏРµРј РєР°Р¶РґС‹Рµ 20С‡) в”Ђв”Ђ
setInterval(async () => {
  try {
    console.log('[B2] РџР»Р°РЅРѕРІР°СЏ РїРµСЂРµР°РІС‚РѕСЂРёР·Р°С†РёСЏ...');
    await authorizeB2();
    console.log('[B2] РџРµСЂРµР°РІС‚РѕСЂРёР·Р°С†РёСЏ СѓСЃРїРµС€РЅР°');
  } catch(e) {
    console.warn('[B2] РћС€РёР±РєР° РїРµСЂРµР°РІС‚РѕСЂРёР·Р°С†РёРё:', e.message);
  }
}, 20 * 60 * 60 * 1000); // 20 С‡Р°СЃРѕРІ

server.listen(PORT, () => {
  console.log(`рџљЂ РЎРµСЂРІРµСЂ Р·Р°РїСѓС‰РµРЅ РЅР° РїРѕСЂС‚Сѓ ${PORT}`);
});

