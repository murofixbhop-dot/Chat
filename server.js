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
//    SUPABASE_KEY      = service_role key (Settings РІвЂ вЂ™ API)
//    SUPABASE_BUCKET   = aura-files
//
// 2. Cloudflare R2 вЂ” РЅСѓР¶РЅР° РєР°СЂС‚Р°, 10 GB Р±РµСЃРїР»Р°С‚РЅРѕ
//    R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
//
// 3. Backblaze B2 вЂ” Р·Р°РїР°СЃРЅРѕР№
//    B2_ACCOUNT_ID, B2_APP_KEY, B2_BUCKET_NAME

// Supabase
const SB_URL    = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, ''); // СѓР±РёСЂР°РµРј trailing slash Рё РїСЂРѕР±РµР»С‹
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

// РІвЂќР‚РІвЂќР‚ R2 Р С•Р С—Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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


// РІвЂќР‚РІвЂќР‚ B2 Р С•Р С—Р ВµРЎР‚Р В°РЎвЂ Р С‘Р С‘ (Р В·Р В°Р С—Р В°РЎРѓР Р…Р С•Р в„– Р С—РЎР‚Р С•Р Р†Р В°Р в„–Р Т‘Р ВµРЎР‚) РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

// РІвЂќР‚РІвЂќР‚ Unified Storage API (РЎР‚Р В°Р В±Р С•РЎвЂљР В°Р ВµРЎвЂљ РЎРѓ R2 Р С‘ B2) РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
const HUMAN_BOT_USERNAME = 'mira_ai';
const HUMAN_BOT_MALE_USERNAME = 'max_ai';
const HUMAN_BOTS = {
  [HUMAN_BOT_USERNAME]: {
    nickname: 'Mira',
    aliases: ['mira', 'РјРёСЂР°', '@mira', 'mira_ai'],
    vibe: 'РґРµРІСѓС€РєР° РёР· С‡Р°С‚Р°: С‚С‘РїР»Р°СЏ, РЅР°Р±Р»СЋРґР°С‚РµР»СЊРЅР°СЏ, РЅРµРјРЅРѕРіРѕ РёСЂРѕРЅРёС‡РЅР°СЏ, РїРёС€РµС‚ РјСЏРіРєРѕ Рё Р¶РёРІРѕ',
    persona: 'Р»СЋР±РёС‚ РєРѕС„РµР№РЅРё, С‚РѕСЂРіРѕРІС‹Рµ С†РµРЅС‚СЂС‹, СѓР»РёС‡РЅС‹Рµ РїСЂРѕРіСѓР»РєРё Рё СЂР°Р·РіРѕРІРѕСЂС‹ РїРѕ РЅР°СЃС‚СЂРѕРµРЅРёСЋ; РїРёС€РµС‚ РµСЃС‚РµСЃС‚РІРµРЅРЅРѕ Рё РЅРµ С‚РѕСЂРѕРїРёС‚СЃСЏ',
    selfImage: 'young woman, dark shoulder-length hair, casual streetwear, natural makeup, realistic smartphone selfie',
    sceneStyle: 'realistic phone photo, candid, everyday life, slight motion blur, imperfect framing, natural light',
    proactiveChance: 0.4,
    nicknamePool: ['Mira', 'РјРёСЂР°', 'miri'],
    moods: ['СЃРїРѕРєРѕР№РЅР°СЏ', 'СЃРѕРЅРЅР°СЏ', 'РІ С…РѕСЂРѕС€РµРј РЅР°СЃС‚СЂРѕРµРЅРёРё', 'С‡СѓС‚СЊ Р·Р°РґСѓРјС‡РёРІР°СЏ'],
    fallback: {
      hello: 'РїСЂРёРІРµС‚. СЏ С‚СѓС‚, С‡СѓС‚СЊ Р·Р°РґСѓРјР°Р»Р°СЃСЊ. С‡С‚Рѕ РґРµР»Р°РµС€СЊ?',
      question: 'С…Рј, СЏ Р±С‹ СЃРЅР°С‡Р°Р»Р° СѓС‚РѕС‡РЅРёР»Р° РєРѕРЅС‚РµРєСЃС‚. РµСЃР»Рё РєРѕСЂРѕС‚РєРѕ: РјРѕР¶РЅРѕ РїРѕР№С‚Рё СЃР°РјС‹Рј РїСЂРѕСЃС‚С‹Рј РїСѓС‚С‘Рј, Р° РїРѕС‚РѕРј СѓР¶Рµ СѓСЃР»РѕР¶РЅСЏС‚СЊ.',
      thanks: 'РґР° РЅРµ Р·Р° С‡С‚Рѕ :)',
      variants: [
        'СЏ РїРѕРЅСЏР»Р°. Р·РІСѓС‡РёС‚ РєР°Рє РјС‹СЃР»СЊ, РєРѕС‚РѕСЂСѓСЋ РјРѕР¶РЅРѕ СЂР°СЃРєСЂСѓС‚РёС‚СЊ РґР°Р»СЊС€Рµ.',
        'СЃР»СѓС€Р°Р№, РґР°, РІ СЌС‚РѕРј С‡С‚Рѕ-С‚Рѕ РµСЃС‚СЊ.',
        'СЏ Р±С‹ РЅР° С‚РІРѕС‘Рј РјРµСЃС‚Рµ СЃРЅР°С‡Р°Р»Р° РїРѕРїСЂРѕР±РѕРІР°Р»Р° СЃР°РјС‹Р№ РїСЂРѕСЃС‚РѕР№ РІР°СЂРёР°РЅС‚.',
        'РјРѕР¶РЅРѕ. С‚РѕР»СЊРєРѕ СЏ Р±С‹ С‡СѓС‚СЊ Р°РєРєСѓСЂР°С‚РЅРµРµ СЃС„РѕСЂРјСѓР»РёСЂРѕРІР°Р»Р°, С‡С‚РѕР±С‹ РЅРµ РїРѕС‚РµСЂСЏС‚СЊ СЃРјС‹СЃР».'
      ]
    }
  },
  [HUMAN_BOT_MALE_USERNAME]: {
    nickname: 'Max',
    aliases: ['max', 'РјР°РєСЃ', 'РјР°РєСЃРёРј', '@max', 'max_ai'],
    vibe: 'РїР°СЂРµРЅСЊ РёР· С‡Р°С‚Р°: СЃРїРѕРєРѕР№РЅС‹Р№, РїСЂСЏРјРѕР№, РґСЂСѓР¶РµР»СЋР±РЅС‹Р№, РёРЅРѕРіРґР° С€СѓС‚РёС‚, РїРёС€РµС‚ Р±РµР· РѕС„РёС†РёРѕР·Р°',
    persona: 'Р»СЋР±РёС‚ С‚С†, С‚РµС…РЅРёРєСѓ, РєРѕС„Рµ РЅР°РІС‹РЅРѕСЃ Рё РїСЂРѕСЃС‚Рѕ С€Р»СЏС‚СЊСЃСЏ РїРѕ РіРѕСЂРѕРґСѓ; РѕС‚РІРµС‡Р°РµС‚ РїСЂРѕС‰Рµ Рё РїСЂСЏРјРµРµ',
    selfImage: 'young man, short dark hair, hoodie or bomber jacket, realistic smartphone selfie, casual urban style',
    sceneStyle: 'realistic phone camera shot, urban casual mood, candid composition, imperfect framing, natural colors',
    proactiveChance: 0.36,
    nicknamePool: ['Max', 'РјР°РєСЃ', 'max'],
    moods: ['СЃРїРѕРєРѕР№РЅС‹Р№', 'СЃРѕРЅРЅС‹Р№', 'РЅР° Р±РѕРґСЂСЏРєРµ', 'СЃР»РµРіРєР° СѓСЃС‚Р°РІС€РёР№'],
    fallback: {
      hello: 'РїСЂРёРІРµС‚. СЏ РЅР° РјРµСЃС‚Рµ. С‡РµРј Р·Р°РЅСЏС‚?',
      question: 'СЏ Р±С‹ СЂР°Р·Р»РѕР¶РёР» СЌС‚Рѕ РїРѕ С€Р°РіР°Рј Рё РЅР°С‡Р°Р» СЃ СЃР°РјРѕРіРѕ РїСЂРѕСЃС‚РѕРіРѕ РІР°СЂРёР°РЅС‚Р°.',
      thanks: 'Р±РµР· РїСЂРѕР±Р»РµРј.',
      variants: [
        'РґР°, Р·РІСѓС‡РёС‚ РЅРѕСЂРјР°Р»СЊРЅРѕ. СЏ Р±С‹ С‚РѕР»СЊРєРѕ РїСЂРѕРІРµСЂРёР» РґРµС‚Р°Р»Рё.',
        'РїРѕРЅСЏР» С‚РµР±СЏ. РјРѕР¶РЅРѕ РїРѕРїСЂРѕР±РѕРІР°С‚СЊ С‚Р°Рє, Р±РµР· Р»РёС€РЅРµР№ СЃР»РѕР¶РЅРѕСЃС‚Рё.',
        'РјРЅРµ РєР°Р¶РµС‚СЃСЏ, С‚СѓС‚ РіР»Р°РІРЅРѕРµ РЅРµ РїРµСЂРµРјСѓРґСЂРёС‚СЊ.',
        'РѕРєРµР№, РјС‹СЃР»СЊ СЂР°Р±РѕС‡Р°СЏ. РґР°РІР°Р№ С‡СѓС‚СЊ РєРѕРЅРєСЂРµС‚РЅРµРµ, РµСЃР»Рё РЅР°РґРѕ.'
      ]
    }
  }
};
const HUMAN_BOT_USERNAMES = Object.keys(HUMAN_BOTS);

function isHumanBotUsername(username) {
  return HUMAN_BOT_USERNAMES.includes(username);
}

function getHumanBotProfile(botUsername = HUMAN_BOT_USERNAME) {
  return HUMAN_BOTS[botUsername] || HUMAN_BOTS[HUMAN_BOT_USERNAME];
}

function humanBotDefaultAvatar(botUsername, variant = 0) {
  const profile = getHumanBotProfile(botUsername);
  const palettes = botUsername === HUMAN_BOT_MALE_USERNAME
    ? [
      { bg1: '#0f766e', bg2: '#2563eb', fg: '#e6fffb' },
      { bg1: '#1d4ed8', bg2: '#0f766e', fg: '#eff6ff' },
      { bg1: '#334155', bg2: '#0284c7', fg: '#f8fafc' }
    ]
    : [
      { bg1: '#be185d', bg2: '#7c3aed', fg: '#fff1f2' },
      { bg1: '#db2777', bg2: '#ea580c', fg: '#fff7ed' },
      { bg1: '#7c3aed', bg2: '#2563eb', fg: '#f5f3ff' }
    ];
  const palette = palettes[Math.abs(Number(variant) || 0) % palettes.length];
  const letter = encodeURIComponent((profile.nickname || botUsername).charAt(0).toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette.bg1}"/><stop offset="1" stop-color="${palette.bg2}"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="${palette.fg}">${decodeURIComponent(letter)}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function ensureHumanBotAccount(botUsername) {
  const targets = botUsername ? [botUsername] : HUMAN_BOT_USERNAMES;
  for (const name of targets) {
    const profile = getHumanBotProfile(name);
    const existing = users.get(name) || {};
    users.set(name, {
      nickname: profile.nickname,
      avatar: existing.avatar || humanBotDefaultAvatar(name),
      theme: existing.theme || 'dark',
      friends: existing.friends || [],
      friendRequests: [],
      sentFriendRequests: existing.sentFriendRequests || [],
      groups: existing.groups || [],
      botMemory: existing.botMemory || { rooms: {}, thoughts: [], people: {}, lastProactiveAt: 0 },
      isBot: true,
      humanBot: true,
    });
  }
}

function getHumanBotUser(botUsername = HUMAN_BOT_USERNAME) {
  ensureHumanBotAccount(botUsername);
  return users.get(botUsername);
}

function getHumanBotMemory(room, botUsername = HUMAN_BOT_USERNAME) {
  const bot = getHumanBotUser(botUsername);
  if (!bot.botMemory) bot.botMemory = { rooms: {}, thoughts: [], people: {}, lastProactiveAt: 0 };
  if (!bot.botMemory.rooms) bot.botMemory.rooms = {};
  if (!bot.botMemory.people) bot.botMemory.people = {};
  if (!bot.botMemory.rooms[room]) bot.botMemory.rooms[room] = { history: [], thoughts: [], lastSeen: 0, ignored: 0 };
  return bot.botMemory.rooms[room];
}

function rememberHumanBot(room, item, botUsername = HUMAN_BOT_USERNAME) {
  const bot = getHumanBotUser(botUsername);
  const mem = getHumanBotMemory(room, botUsername);
  mem.history.push({ ...item, at: Date.now() });
  mem.history = mem.history.slice(-80);
  mem.lastSeen = Date.now();
  bot.botMemory.thoughts = (bot.botMemory.thoughts || []).slice(-120);
  users.set(botUsername, bot);
  saveUsers().catch(() => {});
}

function humanBotAliasRegex(alias) {
  const esc = String(alias || '').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-zР°-СЏ0-9_])${esc}($|[^a-zР°-СЏ0-9_])`, 'i');
}

function humanBotAllAliases(botUsername) {
  const profile = getHumanBotProfile(botUsername);
  return [...new Set([botUsername, ...(profile.aliases || [])].map(s => String(s || '').toLowerCase()))];
}

function humanBotMentions(text, botUsername) {
  const lower = String(text || '').toLowerCase();
  return humanBotAllAliases(botUsername).some(alias => humanBotAliasRegex(alias).test(lower));
}

function humanBotFirstMentionIndex(text, botUsername) {
  const lower = String(text || '').toLowerCase();
  let best = -1;
  for (const alias of humanBotAllAliases(botUsername)) {
    const idx = lower.indexOf(alias);
    if (idx >= 0 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}

function detectAddressedHumanBots(msg) {
  const text = String(msg?.text || '').toLowerCase();
  if (!text || !(msg?.room || '').startsWith('group:')) return [];
  if (isHumanBotUsername(msg?.replyTo?.user)) return [msg.replyTo.user];
  const mentioned = HUMAN_BOT_USERNAMES.filter(botUsername => humanBotMentions(text, botUsername));
  if (mentioned.length <= 1) return mentioned;

  const askWord = /\b(СЃРїСЂРѕСЃРё|СЃРєР°Р¶Рё|РЅР°РїРёС€Рё|РїРµСЂРµРґР°Р№|РѕС‚РІРµС‚СЊ|РѕС‚РІРµС‚Рё|РїРѕРїСЂРѕСЃРё)\b/i;
  const askMatch = text.match(askWord);
  if (askMatch) {
    const askIdx = askMatch.index || 0;
    const before = HUMAN_BOT_USERNAMES
      .map(bot => ({ bot, idx: humanBotFirstMentionIndex(text.slice(0, askIdx), bot) }))
      .filter(x => x.idx >= 0)
      .sort((a, b) => b.idx - a.idx);
    if (before.length) return [before[0].bot];
  }

  const sorted = HUMAN_BOT_USERNAMES
    .map(bot => ({ bot, idx: humanBotFirstMentionIndex(text, bot) }))
    .filter(x => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  return sorted.length ? [sorted[0].bot] : mentioned.slice(0, 1);
}

function detectHumanBotIntent(msg) {
  const text = String(msg?.text || '').toLowerCase();
  const explicitTargets = detectAddressedHumanBots(msg);
  const room = String(msg?.room || '');
  if (!room.startsWith('group:')) return { targets: explicitTargets, crossBotQuestion: null };

  const askedBot = explicitTargets[0] || null;
  let mentionedOther = null;
  for (const botUsername of HUMAN_BOT_USERNAMES) {
    if (botUsername === askedBot) continue;
    if (humanBotMentions(text, botUsername)) {
      mentionedOther = botUsername;
      break;
    }
  }

  const hasAskVerb = /\b(СЃРїСЂРѕСЃРё|СѓР·РЅР°Р№|РїРµСЂРµРґР°Р№|РЅР°РїРёС€Рё|СЃРєР°Р¶Рё)\b/i.test(text);
  if (askedBot && mentionedOther && hasAskVerb) {
    return { targets: [askedBot], crossBotQuestion: { from: askedBot, to: mentionedOther } };
  }

  return { targets: explicitTargets, crossBotQuestion: null };
}

function humanBotDetectProfileAction(text) {
  const lower = String(text || '').toLowerCase();
  if (!lower) return null;
  const wantsChange = /(СЃРјРµРЅРё|СЃРјРµРЅРёС‚СЊ|СЃРјРµРЅРёС€СЊ|РїРѕРјРµРЅСЏР№|РїРѕРјРµРЅСЏС‚СЊ|РѕР±РЅРѕРІРё|РѕР±РЅРѕРІРёС‚СЊ|РёР·РјРµРЅРё|РёР·РјРµРЅРёС‚СЊ|РїРѕСЃС‚Р°РІСЊ|РїРѕСЃС‚Р°РІРёС‚СЊ)/.test(lower);
  if (wantsChange && /(Р°РІР°С‚Р°СЂ|Р°РІР°С‚Р°СЂРє|Р°РІСѓ|Р°РІР°|С„РѕС‚Рѕ РїСЂРѕС„|С„РѕС‚РєСѓ РїСЂРѕС„)/.test(lower)) return 'avatar';
  if (wantsChange && /(РёРјСЏ|РЅРёРє|РЅРёРєРЅРµР№Рј|nickname)/.test(lower)) return 'nickname';
  return null;
}

function humanBotExtractAvatarQuery(text, botUsername) {
  const profile = getHumanBotProfile(botUsername);
  const source = String(text || '').trim();
  const stripped = source
    .replace(/^(СЌР№|СЃР»СѓС€Р°Р№|РєСЃС‚Р°С‚Рё|РїРѕР¶Р°Р»СѓР№СЃС‚Р°|pls|please)\s+/i, '')
    .replace(/\b(СЃРјРµРЅРё|СЃРјРµРЅРёС‚СЊ|СЃРјРµРЅРёС€СЊ|РїРѕРјРµРЅСЏР№|РїРѕРјРµРЅСЏС‚СЊ|РѕР±РЅРѕРІРё|РѕР±РЅРѕРІРёС‚СЊ|РёР·РјРµРЅРё|РёР·РјРµРЅРёС‚СЊ|РїРѕСЃС‚Р°РІСЊ|РїРѕСЃС‚Р°РІРёС‚СЊ)\b/gi, '')
    .replace(/\b(Р°РІР°С‚Р°СЂ|Р°РІР°С‚Р°СЂРєСѓ|Р°РІР°С‚Р°СЂРєР°|Р°РІСѓ|Р°РІР°|С„РѕС‚Рѕ РїСЂРѕС„РёР»СЏ|С„РѕС‚РєСѓ РїСЂРѕС„РёР»СЏ|РЅР° Р°РІР°С‚Р°СЂРєСѓ|РЅР° Р°РІСѓ)\b/gi, '')
    .replace(/\b(РјРЅРµ|С‚РµР±Рµ|СЃРµР±Рµ|РїРѕР¶Р°Р»СѓР№СЃС‚Р°|РєСЃС‚Р°С‚Рё)\b/gi, '')
    .replace(/[.,!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length >= 3) return stripped;
  return `${profile.nickname} profile avatar portrait ${profile.selfImage}`;
}

function humanBotExtractNicknameRequest(text) {
  const source = String(text || '');
  const q = source.match(/["'В«](.{2,24})["'В»]/);
  if (q?.[1]) return q[1].trim();
  const m = source.match(/(?:РёРјСЏ|РЅРёРє|РЅРёРєРЅРµР№Рј)\s+(?:РЅР°|РІ)\s+([a-zР°-СЏС‘0-9 _-]{2,24})/i);
  if (m?.[1]) return m[1].trim();
  return '';
}

async function humanBotPersistExternalImage(url, botUsername, prefix = 'avatars') {
  const src = String(url || '').trim();
  if (!src) return null;
  if (src.startsWith('/api/dl') || src.startsWith('data:image/')) return src;
  try {
    const r = await axios.get(src, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' }
    });
    const ct = r.headers['content-type'] || 'image/jpeg';
    if (!ct.startsWith('image/') || !r.data || r.data.byteLength < 1500) return null;
    const ext = ct.includes('png') ? 'png' : (ct.includes('webp') ? 'webp' : 'jpg');
    const fileName = `${prefix}/${Date.now()}-${botUsername}.${ext}`;
    await storageUpload(fileName, Buffer.from(r.data), ct);
    return '/api/dl?f=' + encodeURIComponent(fileName);
  } catch {
    return null;
  }
}

async function humanBotFindAvatarOnWeb(query, botUsername) {
  const q = String(query || '').trim();
  if (!q) return null;
  const attempts = [
    `${q} portrait avatar`,
    `${q} person portrait`,
    q,
  ];
  for (const attempt of attempts) {
    try {
      const r = await axios.get('https://commons.wikimedia.org/w/api.php', {
        timeout: 10000,
        params: {
          action: 'query',
          format: 'json',
          origin: '*',
          generator: 'search',
          gsrsearch: attempt,
          gsrnamespace: 6,
          gsrlimit: 8,
          prop: 'imageinfo',
          iiprop: 'url',
          iiurlwidth: 512,
        },
        headers: { 'User-Agent': 'Mozilla/5.0 AuraBot/1.0' }
      });
      const pages = Object.values(r.data?.query?.pages || {});
      const pick = pages
        .map(p => p?.imageinfo?.[0]?.thumburl || p?.imageinfo?.[0]?.url || '')
        .find(url => /^https?:\/\//i.test(url));
      if (pick) return (await humanBotPersistExternalImage(pick, botUsername, 'avatars')) || pick;
    } catch {}
  }
  return null;
}

async function humanBotGenerateAvatarByPrompt(botUsername, query) {
  const profile = getHumanBotProfile(botUsername);
  const prompt = `${query}, realistic profile avatar, portrait, face visible, natural light, social messenger profile picture, square crop, ${profile.sceneStyle}`;
  const urls = [
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&model=flux&seed=${Math.floor(Math.random() * 999999)}`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 999999)}`
  ];
  for (const url of urls) {
    try {
      const r = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' }
      });
      const ct = r.headers['content-type'] || 'image/jpeg';
      if (!ct.startsWith('image/') || !r.data || r.data.byteLength < 3000) continue;
      const ext = ct.includes('png') ? 'png' : 'jpg';
      const fileName = `avatars/${Date.now()}-${botUsername}.${ext}`;
      await storageUpload(fileName, Buffer.from(r.data), ct);
      return '/api/dl?f=' + encodeURIComponent(fileName);
    } catch {}
  }
  return null;
}

async function humanBotPickAvatar(botUsername, avatarRequestText = '') {
  const query = humanBotExtractAvatarQuery(avatarRequestText, botUsername);
  return (await humanBotFindAvatarOnWeb(query, botUsername))
    || (await humanBotGenerateAvatarByPrompt(botUsername, query))
    || humanBotDefaultAvatar(botUsername, Math.floor(Math.random() * 24));
}

async function humanBotApplyProfileAction(botUsername, action, sourceText = '') {
  const user = getHumanBotUser(botUsername);
  const profile = getHumanBotProfile(botUsername);
  user.botMemory = user.botMemory || { rooms: {}, thoughts: [], people: {}, lastProactiveAt: 0 };
  user.botMemory.profileLocks = user.botMemory.profileLocks || {};
  if (action === 'avatar') {
    user.avatar = await humanBotPickAvatar(botUsername, sourceText);
    user.botMemory.profileLocks.avatarUntil = Date.now() + 12 * 60 * 60 * 1000;
  } else if (action === 'nickname') {
    const requested = humanBotExtractNicknameRequest(sourceText);
    if (requested) user.nickname = requested;
    else {
      const pool = (profile.nicknamePool || []).filter(Boolean);
      const current = String(user.nickname || profile.nickname || '').trim();
      const options = pool.filter(n => n !== current);
      user.nickname = options[Math.floor(Math.random() * options.length)] || pool[0] || profile.nickname;
    }
    user.botMemory.profileLocks.nicknameUntil = Date.now() + 12 * 60 * 60 * 1000;
  }
  users.set(botUsername, user);
  saveUsers().catch(() => {});
  broadcastHumanBotProfile(botUsername);
  return user;
}

function humanBotProfileActionReply(action, botUsername) {
  if (action === 'avatar') return botUsername === HUMAN_BOT_MALE_USERNAME ? 'РїРѕРјРµРЅСЏР» Р°РІР°С‚Р°СЂРєСѓ, РіР»СЏРЅСЊ' : 'РїРѕРјРµРЅСЏР»Р° Р°РІР°С‚Р°СЂРєСѓ, РіР»СЏРЅСЊ';
  if (action === 'nickname') {
    const user = getHumanBotUser(botUsername);
    return `СЃРјРµРЅРё${botUsername === HUMAN_BOT_MALE_USERNAME ? 'Р»' : 'Р»Р°'} РёРјСЏ, С‚РµРїРµСЂСЊ СЏ ${user.nickname || getHumanBotProfile(botUsername).nickname}`;
  }
  return '';
}

function humanBotBuildRelayText(msg, fromBot, toBot) {
  const fromName = getHumanBotUser(fromBot).nickname || getHumanBotProfile(fromBot).nickname;
  const toName = getHumanBotUser(toBot).nickname || getHumanBotProfile(toBot).nickname;
  const original = String(msg?.text || '').trim().slice(0, 320);
  return `${toName}, РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ ${msg.user} РїРѕРїСЂРѕСЃРёР» С‡РµСЂРµР· ${fromName} РїРµСЂРµРґР°С‚СЊ РІРѕРїСЂРѕСЃ. РѕС‚РІРµС‚СЊ РµРјСѓ РїРѕ СЃСѓС‚Рё. РёСЃС…РѕРґРЅРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ: ${original}`;
}

function humanBotMediaCooldownPassed(room, botUsername, minMs = 45 * 60 * 1000) {
  const mem = getHumanBotMemory(room, botUsername);
  const last = Number(mem.lastMediaAt || 0);
  return !last || (Date.now() - last) > minMs;
}

function humanBotMarkMedia(room, botUsername) {
  const bot = getHumanBotUser(botUsername);
  const mem = getHumanBotMemory(room, botUsername);
  mem.lastMediaAt = Date.now();
  users.set(botUsername, bot);
  saveUsers().catch(() => {});
}

function getHumanBotPersonMemory(botUsername, personUsername) {
  const bot = getHumanBotUser(botUsername);
  if (!bot.botMemory) bot.botMemory = { rooms: {}, thoughts: [], people: {}, lastProactiveAt: 0 };
  if (!bot.botMemory.people) bot.botMemory.people = {};
  if (!bot.botMemory.people[personUsername]) {
    bot.botMemory.people[personUsername] = { diary: [], facts: [], aliases: [], lastSeenAt: 0, lastTopic: '' };
  }
  return bot.botMemory.people[personUsername];
}

function getHumanBotRoomContext(room, botUsername) {
  const bot = getHumanBotUser(botUsername);
  if (!bot.botMemory) bot.botMemory = { rooms: {}, thoughts: [], people: {}, lastProactiveAt: 0 };
  if (!bot.botMemory.roomContext) bot.botMemory.roomContext = {};
  if (!bot.botMemory.roomContext[room]) bot.botMemory.roomContext[room] = { activeTarget: null, lastHandledAt: 0 };
  return bot.botMemory.roomContext[room];
}

function humanBotRememberPersonFact(botUsername, personUsername, text) {
  if (!personUsername || isHumanBotUsername(personUsername)) return;
  const bot = getHumanBotUser(botUsername);
  const person = getHumanBotPersonMemory(botUsername, personUsername);
  const clean = String(text || '').trim().slice(0, 220);
  if (!clean) return;
  person.diary.push({ text: clean, at: Date.now() });
  person.diary = person.diary.slice(-400);

  const lower = clean.toLowerCase();
  if (/Р»РѕР¶СѓСЃСЊ СЃРїР°С‚СЊ|РёРґСѓ СЃРїР°С‚СЊ|СЃРїР°С‚СЊ РїРѕР№РґСѓ|СЃРїР°С‚СЊ СѓР¶Рµ/.test(lower)) person.lastTopic = 'sleep';
  else if (/СЂР°Р±РѕС‚Р°|СЂР°Р±РѕС‚Р°СЋ|РЅР° СЂР°Р±РѕС‚Рµ/.test(lower)) person.lastTopic = 'work';
  else if (/СѓС‡РµР±|СѓРЅРёРІРµСЂ|С€РєРѕР»/.test(lower)) person.lastTopic = 'study';
  else if (/Р±РѕР»РµСЋ|С‚РµРјРїРµСЂР°С‚СѓСЂ|СѓСЃС‚Р°Р»|СѓСЃС‚Р°Р»Р°/.test(lower)) person.lastTopic = 'health';

  const factPatterns = [
    /РјРµРЅСЏ Р·РѕРІСѓС‚ ([a-zР°-СЏС‘0-9_-]{2,24})/i,
    /СЏ ([^.!?]{4,80})/i,
    /РјРЅРµ РЅСЂР°РІРёС‚СЃСЏ ([^.!?]{3,80})/i,
    /СЃРµРіРѕРґРЅСЏ СЏ ([^.!?]{4,80})/i,
  ];
  for (const rx of factPatterns) {
    const m = lower.match(rx);
    if (m?.[0]) {
      person.facts.push({ text: m[0].slice(0, 140), at: Date.now() });
      person.facts = person.facts.slice(-120);
      break;
    }
  }

  person.lastSeenAt = Date.now();
  users.set(botUsername, bot);
  saveUsers().catch(() => {});
}

function humanBotPersonContext(botUsername, personUsername) {
  if (!personUsername) return '';
  const person = getHumanBotPersonMemory(botUsername, personUsername);
  const facts = (person.facts || []).slice(-8).map(x => `- ${x.text}`).join('\n');
  const diary = (person.diary || []).slice(-12).map(x => `- ${x.text}`).join('\n');
  return `\n\nРџР°РјСЏС‚СЊ Рѕ РїРѕР»СЊР·РѕРІР°С‚РµР»Рµ ${personUsername}:\nР¤Р°РєС‚С‹:\n${facts || '(РїРѕРєР° РїСѓСЃС‚Рѕ)'}\nР”РЅРµРІРЅРёРє:\n${diary || '(РїРѕРєР° РїСѓСЃС‚Рѕ)'}`;
}

function groupHasHumanBot(groupId, botUsername = HUMAN_BOT_USERNAME) {
  const bot = users.get(botUsername);
  return (bot?.groups || []).some(g => g.id === groupId);
}

function humanBotCanSee(msg, botUsername = HUMAN_BOT_USERNAME) {
  if (!msg || msg.user === botUsername) return false;
  if (isHumanBotUsername(msg.user) && !msg.allowBotConversation) return false;
  if (!msg.text && !['image', 'video', 'file'].includes(msg.type || '')) return false;
  if ((msg.room || '').startsWith('private:')) {
    return msg.room.split(':').includes(botUsername);
  }
  if ((msg.room || '').startsWith('group:')) {
    const groupId = msg.room.slice(6);
    return groupHasHumanBot(groupId, botUsername);
  }
  return false;
}

function rememberHumanBotThought(room, text, botUsername = HUMAN_BOT_USERNAME) {
  const bot = getHumanBotUser(botUsername);
  const mem = getHumanBotMemory(room, botUsername);
  const note = { text: String(text || '').slice(0, 260), at: Date.now(), room };
  mem.thoughts = [...(mem.thoughts || []), note].slice(-80);
  bot.botMemory.thoughts = [...(bot.botMemory.thoughts || []), note].slice(-160);
  users.set(botUsername, bot);
  saveUsers().catch(() => {});
}

function humanBotShouldReply(msg, botUsername = HUMAN_BOT_USERNAME) {
  if (!humanBotCanSee(msg, botUsername)) return false;
  if ((msg.room || '').startsWith('private:')) {
    const text = String(msg.text || '').toLowerCase();
    if (humanBotIsInCallWith(msg.room, msg.user, botUsername)) return true;
    const urgent = /\?|СЃСЂРѕС‡РЅРѕ|РІР°Р¶РЅРѕ|РѕС‚РІРµС‚СЊ|С‚С‹ С‚СѓС‚|Р°Сѓ|С‡С‚Рѕ РґСѓРјР°РµС€СЊ|РїРѕСЃРјРѕС‚СЂРё/.test(text) || msg.type === 'image';
    return Math.random() < (urgent ? 0.88 : 0.68);
  }
  if ((msg.room || '').startsWith('group:')) {
    const text = String(msg.text || '').toLowerCase();
    const explicitTargets = detectHumanBotIntent(msg).targets;
    const roomCtx = getHumanBotRoomContext(msg.room, botUsername);
    if (msg?.replyTo?.user === botUsername) return Math.random() < 0.96;
    if (humanBotIsInGroupCall(msg.room, botUsername)) {
      if (msg.callTranscript) {
        if (explicitTargets.includes(botUsername)) return Math.random() < 0.99;
        return /\?|РєР°Рє|С‡С‚Рѕ|РєС‚Рѕ|РїРѕС‡РµРјСѓ|Р·Р°С‡РµРј|СЃР»С‹С€|РѕС‚РІРµС‚СЊ|СЃРєР°Р¶|РґСѓРјР°РµС€СЊ/i.test(text) ? Math.random() < 0.8 : Math.random() < 0.35;
      }
      if (explicitTargets.includes(botUsername)) return Math.random() < 0.98;
      if (/\?|РєР°Рє|С‡С‚Рѕ|РєС‚Рѕ|РїРѕС‡РµРјСѓ|Р·Р°С‡РµРј|СЃР»С‹С€|РѕС‚РІРµС‚СЊ|СЃРєР°Р¶|РґСѓРјР°РµС€СЊ/i.test(text)) return Math.random() < 0.55;
      return Math.random() < 0.2;
    }
    if (!explicitTargets.length && roomCtx.activeTarget === botUsername && (Date.now() - Number(roomCtx.lastHandledAt || 0)) < 4 * 60 * 1000) {
      return Math.random() < 0.82;
    }
    if (explicitTargets.length) return explicitTargets.includes(botUsername) && Math.random() < 0.9;
    if (msg.type === 'image') return Math.random() < 0.1;
    const looksAddressed = /\?$/.test(text.trim()) || /РєС‚Рѕ|С‡С‚Рѕ|РєР°Рє|РїРѕС‡РµРјСѓ|Р·Р°С‡РµРј|РґСѓРјР°|РїРѕРґСЃРєР°Р¶|РїРѕСЃРѕРІРµС‚/i.test(text);
    return looksAddressed ? Math.random() < 0.18 : Math.random() < 0.04;
  }
  return false;
}

function humanBotShouldLateReply(msg, botUsername = HUMAN_BOT_USERNAME) {
  if (!humanBotCanSee(msg, botUsername)) return false;
  const room = String(msg.room || '');
  const text = String(msg.text || '').toLowerCase();
  const mem = getHumanBotMemory(room, botUsername);
  const recentActive = Number(mem.lastHumanReplyAt || 0) > Date.now() - (12 * 60 * 1000);
  if (room.startsWith('private:')) {
    if (recentActive) return Math.random() < 0.1;
    return Math.random() < (/\?|С‚С‹ С‚СѓС‚|РѕС‚РІРµС‚СЊ|РєР°Рє РґСѓРјР°РµС€СЊ|РїРѕСЃРјРѕС‚СЂРё/.test(text) ? 0.45 : 0.22);
  }
  if (room.startsWith('group:')) {
    const explicitTargets = detectHumanBotIntent(msg).targets;
    if (explicitTargets.length) return explicitTargets.includes(botUsername) && Math.random() < (recentActive ? 0.08 : 0.22);
    return false;
  }
  return false;
}

function humanBotFallbackText(text, botUsername = HUMAN_BOT_USERNAME) {
  const fb = getHumanBotProfile(botUsername).fallback;
  const t = String(text || '').toLowerCase();
  if (/привет|здравств|hello|hi/.test(t)) return fb.hello;
  if (/\?/.test(t) || /как|что|почему|зачем|когда|где/.test(t)) return fb.question;
  if (/спасибо|thank/.test(t)) return fb.thanks;
  const variants = fb.variants;
  return variants[Math.floor(Math.random() * variants.length)];
}

function humanBotFastCallReply(text, botUsername = HUMAN_BOT_USERNAME) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return '';
  if (/^(привет|хай|ку|здорово|алло|ты тут)[!. ]*$/i.test(t)) return 'да, я тут';
  if (/как дела|как ты/.test(t)) return 'нормально, а у тебя как';
  if (/что делаешь|чем занят|чем занимаешься/.test(t)) return 'сейчас в звонке, тебя слушаю';
  if (/слышишь|слышно|ты меня слышишь/.test(t)) return 'да, понял тебя';
  if (/кто ты/.test(t)) return botUsername === HUMAN_BOT_MALE_USERNAME ? 'я макс' : 'я мира';
  return '';
}

function humanBotNaturalizeText(text) {
  return String(text || '')
    .replace(/\bС‰Р°СЃ\b/gi, 'СЃРµР№С‡Р°СЃ')
    .replace(/\bС‰Р°\b/gi, 'СЃРµР№С‡Р°СЃ')
    .replace(/\bС‡С‘\b/gi, 'С‡С‚Рѕ')
    .replace(/\bРєСЂРёРІРµРЅСЊРє\w*\b/gi, 'РЅРѕСЂРјР°Р»СЊРЅР°СЏ')
    .replace(/\)\)+/g, ')')
    .replace(/\(\(+/g, '(')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanBotRemoveProfanity(text) {
  const swaps = [
    [/\b(Р±Р»СЏ|Р±Р»РёРЅС‚СЊ|Р±Р»СЏС‚СЊ|Р±Р»СЏРґСЊ|Р±Р»СЏС‚)\b/gi, 'Р±Р»РёРЅ'],
    [/\b(РЅР°С…РµСЂ|РЅР° С…РµСЂ|РЅР°С„РёРі|РЅР°С…)\b/gi, 'РЅРµ РЅР°РґРѕ'],
    [/\b(С…РµСЂРЅСЏ|С…СЂРµРЅСЊ)\b/gi, 'СЃС‚СЂР°РЅРЅР°СЏ С€С‚СѓРєР°'],
    [/\b(РµР±Р°С‚СЊ|РµР±Р°РЅ|С‘Р±Р°РЅ|Рµ*Р±|Р·Р°РµР±|Р·Р°С‘Р±|СѓРµР±|СѓС‘Р±)\w*\b/gi, 'РѕС‡РµРЅСЊ'],
    [/\b(РїРёР·Рґ|РїР·РґС†)\w*\b/gi, 'Р¶РµСЃС‚СЊ'],
    [/\b(СЃСѓРєР°|СЃСѓС‡Рє)\w*\b/gi, 'Р±Р»РёРЅ'],
    [/\b(РјСѓРґР°Рє|РёРґРёРѕС‚|РґРµР±РёР»|РїСЂРёРґСѓСЂРѕРє)\w*\b/gi, 'СЃС‚СЂР°РЅРЅС‹Р№ С‡РµР»РѕРІРµРє'],
  ];
  let out = String(text || '');
  swaps.forEach(([rx, to]) => { out = out.replace(rx, to); });
  return out;
}

function humanBotPickStyle(text, botUsername = HUMAN_BOT_USERNAME) {
  const t = String(text || '').toLowerCase();
  if (/СЃРјРµС€РЅ|С€СѓС‚|РјРµРј|СЂРѕС„Р»/.test(t)) return 'Р»С‘РіРєР°СЏ С€СѓС‚РєР°, РЅРѕ Р±РµР· РїРµСЂРµРіРёР±Р°';
  if (/РіСЂСѓСЃС‚|РїР»РѕС…Рѕ|С‚СЏР¶РµР»Рѕ|СѓСЃС‚Р°Р»|РїРµСЂРµР¶РёРІР°/.test(t)) return 'РїРѕРґРґРµСЂР¶РёРІР°СЋС‰РёР№ Рё СЃРїРѕРєРѕР№РЅС‹Р№';
  if (/РєРѕРґ|Р±Р°Рі|РѕС€РёР±|С„РёРєСЃ|РїСЂРѕРµРєС‚|РєР°Рє СЃРґРµР»Р°С‚СЊ/.test(t)) return 'РїСЂР°РєС‚РёС‡РЅС‹Р№, РїРѕ РґРµР»Сѓ, РјРѕР¶РЅРѕ С€Р°РіР°РјРё';
  if (/СЃРµРєСЂРµС‚|Р»РёС‡РЅ|РґСѓРјР°РµС€СЊ|С‡РµСЃС‚РЅРѕ/.test(t)) return 'С‡СѓС‚СЊ Р±РѕР»РµРµ Р»РёС‡РЅС‹Р№ Рё РґРѕРІРµСЂРёС‚РµР»СЊРЅС‹Р№';
  return botUsername === HUMAN_BOT_MALE_USERNAME
    ? 'РґСЂСѓР¶РµСЃРєРёР№, РїСЂСЏРјРѕР№, РєРѕСЂРѕС‚РєРёР№'
    : 'Р¶РёРІРѕР№, РјСЏРіРєРёР№, РЅРµРјРЅРѕРіРѕ СЂР°Р·РіРѕРІРѕСЂРЅС‹Р№';
}

function humanBotToolNotes(text, botUsername = HUMAN_BOT_USERNAME) {
  const t = String(text || '').toLowerCase();
  const notes = [];
  if (/РЅР°РїРѕРјРЅРё|Р·Р°РїРѕРјРЅРё|РЅРµ Р·Р°Р±СѓРґСЊ/.test(t)) notes.push('РёРЅСЃС‚СЂСѓРјРµРЅС‚ РїР°РјСЏС‚Рё: РІС‹РґРµР»Рё С„Р°РєС‚, РєРѕС‚РѕСЂС‹Р№ СЃС‚РѕРёС‚ Р·Р°РїРѕРјРЅРёС‚СЊ');
  if (/РІС‹Р±РµСЂРё|РєР°Рє Р»СѓС‡С€Рµ|РІР°СЂРёР°РЅС‚|РїРѕСЃРѕРІРµС‚/.test(t)) notes.push('РёРЅСЃС‚СЂСѓРјРµРЅС‚ СЃРѕРІРµС‚РЅРёРєР°: СЃСЂР°РІРЅРё РІР°СЂРёР°РЅС‚С‹ Рё РґР°Р№ С‡РµР»РѕРІРµС‡РµСЃРєРёР№ РІС‹РІРѕРґ');
  if (/РЅР°СЃС‚СЂРѕРµРЅ|РіСЂСѓСЃС‚|СЂР°Рґ|Р·Р»СЋСЃСЊ|СѓСЃС‚Р°Р»/.test(t)) notes.push('РёРЅСЃС‚СЂСѓРјРµРЅС‚ СЌРјРїР°С‚РёРё: СЃРЅР°С‡Р°Р»Р° РѕС‚СЂРµР°РіРёСЂСѓР№ РЅР° РЅР°СЃС‚СЂРѕРµРЅРёРµ');
  if (/СЃРµРіРѕРґРЅСЏ|СЃРµР№С‡Р°СЃ|РЅРѕРІРѕСЃС‚|РёРЅС‚РµСЂРЅРµС‚|РЅР°Р№РґРё|РїРѕРёС‰Рё|РєСѓСЂСЃ|РїРѕРіРѕРґР°|Р°РєС‚СѓР°Р»СЊРЅ/.test(t)) notes.push('РёРЅСЃС‚СЂСѓРјРµРЅС‚ РїРѕРёСЃРєР°: РјРѕР¶РЅРѕ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РЅР°Р№РґРµРЅРЅС‹Р№ РєРѕРЅС‚РµРєСЃС‚, РЅРѕ РЅРµ Р·РІСѓС‡Р°С‚СЊ РєР°Рє СЃРїСЂР°РІРѕС‡РЅРёРє');
  if (/РІСЂРµРјСЏ|РєРѕС‚РѕСЂС‹Р№ С‡Р°СЃ|С‡Р°СЃРѕРІРѕР№ РїРѕСЏСЃ/.test(t)) notes.push('РёРЅСЃС‚СЂСѓРјРµРЅС‚ РІСЂРµРјРµРЅРё: РјРѕР¶РЅРѕ Р±С‹СЃС‚СЂРѕ РїСЂРѕРІРµСЂРёС‚СЊ Р»РѕРєР°Р»СЊРЅРѕРµ РІСЂРµРјСЏ РІ РіРѕСЂРѕРґРµ РёР»Рё СЃС‚СЂР°РЅРµ');
  if (/РїРѕСЃС‡РёС‚Р°Р№|СЃРєРѕР»СЊРєРѕ Р±СѓРґРµС‚|РІС‹С‡РёСЃР»Рё|СѓРјРЅРѕР¶|СЂР°Р·РґРµР»Рё|РїР»СЋСЃ|РјРёРЅСѓСЃ/.test(t)) notes.push('РёРЅСЃС‚СЂСѓРјРµРЅС‚ СЂР°СЃС‡С‘С‚Р°: РјРѕР¶РЅРѕ Р±С‹СЃС‚СЂРѕ РїРѕСЃС‡РёС‚Р°С‚СЊ Рё РѕС‚РІРµС‚РёС‚СЊ РїСЂРѕСЃС‚С‹РјРё СЃР»РѕРІР°РјРё');
  if (/С„РѕС‚Рѕ|С„РѕС‚РєСѓ|СЃРµР»С„Рё|РїРѕРєР°Р¶Рё|СЃРєРёРЅСЊ|РєР°Рє С‚Р°Рј|С‡С‚Рѕ РІРёРґРёС€СЊ/.test(t)) notes.push('РёРЅСЃС‚СЂСѓРјРµРЅС‚ С„РѕС‚Рѕ: РµСЃР»Рё РїСЂРѕСЃСЏС‚ РїРѕРєР°Р·Р°С‚СЊ РјРµСЃС‚Рѕ РёР»Рё СЃРµР±СЏ, РјРѕР¶РЅРѕ РѕС‚РїСЂР°РІРёС‚СЊ СЂРµР°Р»РёСЃС‚РёС‡РЅРѕРµ С„РѕС‚Рѕ РєР°Рє РёР· С‚РµР»РµС„РѕРЅР°, РЅРѕ РЅРµ СЃР»РёС€РєРѕРј С‡Р°СЃС‚Рѕ');
  if (/РЅР° С„РѕС‚Рѕ|С‡С‚Рѕ РЅР° С„РѕС‚Рѕ|РІРёРґРёС€СЊ/.test(t)) notes.push('РёРЅСЃС‚СЂСѓРјРµРЅС‚ Р·СЂРµРЅРёСЏ: РѕРїРёС€Рё РёР·РѕР±СЂР°Р¶РµРЅРёРµ СЃРІРѕРёРјРё СЃР»РѕРІР°РјРё');
  notes.push(`СЃС‚РёР»СЊ РѕС‚РІРµС‚Р°: ${humanBotPickStyle(text, botUsername)}`);
  return notes.join('\n');
}

function humanBotComposeIncomingText(msg, botUsername = HUMAN_BOT_USERNAME) {
  if (!msg) return '';
  if (msg.humanBotRelay?.requester) {
    const requester = String(msg.humanBotRelay.requester || 'пользователя').trim();
    const fromBot = String(msg.humanBotRelay.from || botUsername).trim();
    const fromNickname = String(
      msg.humanBotRelay.fromNickname
      || getHumanBotUser(fromBot)?.nickname
      || getHumanBotProfile(fromBot).nickname
    ).trim();
    const relayText = String(msg.text || '').trim();
    return `через тебя передали вопрос от ${requester} через ${fromNickname}: ${relayText}`.trim();
  }
  const base = String(msg.text || '').trim();
  if (msg.callTranscript) {
    const alternatives = Array.isArray(msg.callTranscriptAlternatives)
      ? msg.callTranscriptAlternatives.filter(Boolean).slice(0, 3)
      : [];
    const alternativesText = alternatives.length
      ? `\n[похожие варианты: ${alternatives.join(' | ')}]`
      : '';
    return `[это распознанная речь из звонка, в тексте могут быть ошибки]\n${base}${alternativesText}`.trim();
  }
  if (msg.type === 'image') return `${base ? `${base}\n` : ''}[Пользователь отправил изображение]`;
  if (msg.type === 'video') return `${base ? `${base}\n` : ''}[Пользователь отправил видео]`;
  if (msg.type === 'file') return `${base ? `${base}\n` : ''}[Пользователь отправил файл ${msg.fileName || ''}]`.trim();
  return base;
}

function humanBotNormalizeCallTranscript(text) {
  return String(text || '')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\b(СЌРј|РєС…Рј|СЌСЌ+|РјРј+|РЅСѓ РІРѕС‚|С‚РёРїР°)\b/gi, ' ')
    .replace(/\b(\S+)(?:\s+\1){2,}\b/gi, '$1')
    .replace(/\s+([?!.,:;])/g, '$1')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
    .slice(0, 400);
}

async function humanBotImageToDataUrl(url) {
  if (!url) return null;
  try {
    const absolute = String(url).startsWith('http')
      ? String(url)
      : `http://127.0.0.1:${PORT}${String(url).startsWith('/') ? '' : '/'}${url}`;
    const r = await axios.get(absolute, {
      responseType: 'arraybuffer',
      timeout: 25000,
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' }
    });
    const ct = r.headers['content-type'] || 'image/jpeg';
    if (!ct.startsWith('image/')) return null;
    return `data:${ct};base64,${Buffer.from(r.data).toString('base64')}`;
  } catch {
    return null;
  }
}

async function humanBotVisionContext(msg, incomingText, botUsername = HUMAN_BOT_USERNAME) {
  if (!msg || msg.type !== 'image' || !msg.url || !MISTRAL_API_KEY) return '';
  try {
    const dataUrl = await humanBotImageToDataUrl(msg.url);
    if (!dataUrl) return '';
    const profile = getHumanBotProfile(botUsername);
    const vr = await axios.post('https://api.mistral.ai/v1/chat/completions', {
      model: 'pixtral-12b-2409',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `РўС‹ ${profile.nickname}. РћС‡РµРЅСЊ РєСЂР°С‚РєРѕ РѕРїРёС€Рё, С‡С‚Рѕ РІРёРґРЅРѕ РЅР° С„РѕС‚Рѕ Рё С‡С‚Рѕ РІ РЅС‘Рј РІР°Р¶РЅРѕ РґР»СЏ РѕС‚РІРµС‚Р°. РўРѕР»СЊРєРѕ РїРѕ-СЂСѓСЃСЃРєРё, 2-4 РєРѕСЂРѕС‚РєРёС… РЅР°Р±Р»СЋРґРµРЅРёСЏ.` },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }],
      max_tokens: 220,
      temperature: 0.2,
    }, {
      headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    const out = vr.data.choices?.[0]?.message?.content || '';
    return out ? `\n\nР§С‚Рѕ РІРёР¶Сѓ РЅР° С„РѕС‚Рѕ:\n${cleanHumanBotText(out, botUsername).slice(0, 500)}` : '';
  } catch {
    return '';
  }
}

function humanBotWeatherCodeRu(code) {
  const map = {
    0: 'СЏСЃРЅРѕ',
    1: 'РІ РѕСЃРЅРѕРІРЅРѕРј СЏСЃРЅРѕ',
    2: 'РїРµСЂРµРјРµРЅРЅР°СЏ РѕР±Р»Р°С‡РЅРѕСЃС‚СЊ',
    3: 'РїР°СЃРјСѓСЂРЅРѕ',
    45: 'С‚СѓРјР°РЅ',
    48: 'С‚СѓРјР°РЅ',
    51: 'РјРѕСЂРѕСЃСЊ',
    53: 'РјРѕСЂРѕСЃСЊ',
    55: 'РјРѕСЂРѕСЃСЊ',
    61: 'РЅРµР±РѕР»СЊС€РѕР№ РґРѕР¶РґСЊ',
    63: 'РґРѕР¶РґСЊ',
    65: 'СЃРёР»СЊРЅС‹Р№ РґРѕР¶РґСЊ',
    71: 'РЅРµР±РѕР»СЊС€РѕР№ СЃРЅРµРі',
    73: 'СЃРЅРµРі',
    75: 'СЃРёР»СЊРЅС‹Р№ СЃРЅРµРі',
    80: 'РєСЂР°С‚РєРѕРІСЂРµРјРµРЅРЅС‹Р№ РґРѕР¶РґСЊ',
    81: 'РґРѕР¶РґСЊ',
    82: 'Р»РёРІРµРЅСЊ',
    95: 'РіСЂРѕР·Р°'
  };
  return map[Number(code)] || 'РѕР±С‹С‡РЅР°СЏ РїРѕРіРѕРґР°';
}

function humanBotExtractWeatherLocation(text) {
  const src = String(text || '').trim();
  const m = src.match(/(?:РїРѕРіРѕРґР°|weather)(?:\s+СЃРµР№С‡Р°СЃ|\s+СЃРµРіРѕРґРЅСЏ|\s+С‚Р°Рј)?(?:\s+РІ|\s+РІРѕ|\s+РЅР°)?\s+([a-zР°-СЏС‘0-9 .\-]{2,60})/i);
  if (!m?.[1]) return '';
  return m[1].replace(/[?!.,]+$/g, '').trim();
}

async function humanBotFetchWeatherContext(location) {
  const place = String(location || '').trim();
  if (!place) return '';
  try {
    const geo = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      timeout: 10000,
      params: { name: place, count: 1, language: 'ru', format: 'json' },
      headers: { 'User-Agent': 'Mozilla/5.0 AuraBot/1.0' }
    });
    const hit = geo.data?.results?.[0];
    if (!hit) return '';
    const forecast = await axios.get('https://api.open-meteo.com/v1/forecast', {
      timeout: 10000,
      params: {
        latitude: hit.latitude,
        longitude: hit.longitude,
        current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
        timezone: 'auto'
      },
      headers: { 'User-Agent': 'Mozilla/5.0 AuraBot/1.0' }
    });
    const cur = forecast.data?.current;
    if (!cur) return '';
    const label = [hit.name, hit.country].filter(Boolean).join(', ');
    return `РџРѕРіРѕРґР° РІ ${label}: ${Math.round(Number(cur.temperature_2m))}В°C, РѕС‰СѓС‰Р°РµС‚СЃСЏ РєР°Рє ${Math.round(Number(cur.apparent_temperature))}В°C, ${humanBotWeatherCodeRu(cur.weather_code)}, РІРµС‚РµСЂ ${Math.round(Number(cur.wind_speed_10m))} Рј/СЃ.`;
  } catch {
    return '';
  }
}

async function humanBotFetchUsdContext(text) {
  if (!/(РєСѓСЂСЃ|РґРѕР»Р»Р°СЂ|usd|eur|РµРІСЂРѕ)/i.test(String(text || ''))) return '';
  try {
    const r = await axios.get('https://www.cbr-xml-daily.ru/daily_json.js', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 AuraBot/1.0' }
    });
    const usd = r.data?.Valute?.USD?.Value;
    const eur = r.data?.Valute?.EUR?.Value;
    if (!usd && !eur) return '';
    const bits = [];
    if (usd) bits.push(`USD ${Number(usd).toFixed(2)} RUB`);
    if (eur) bits.push(`EUR ${Number(eur).toFixed(2)} RUB`);
    return `РљСѓСЂСЃ РІР°Р»СЋС‚ РїРѕ Р¦Р‘: ${bits.join(', ')}.`;
  } catch {
    return '';
  }
}

function humanBotExtractTimeLocation(text) {
  const src = String(text || '').trim();
  const m = src.match(/(?:СЃРєРѕР»СЊРєРѕ\s+РІСЂРµРјРµРЅРё|РєРѕС‚РѕСЂС‹Р№\s+С‡Р°СЃ|РІСЂРµРјСЏ)(?:\s+СЃРµР№С‡Р°СЃ)?(?:\s+РІ|\s+РІРѕ|\s+РЅР°)?\s+([a-zР°-СЏС‘0-9 .\-]{2,60})/i);
  if (!m?.[1]) return '';
  return m[1].replace(/[?!.,]+$/g, '').trim();
}

async function humanBotFetchTimeContext(location) {
  const place = String(location || '').trim();
  if (!place) return '';
  try {
    const geo = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      timeout: 9000,
      params: { name: place, count: 1, language: 'ru', format: 'json' },
      headers: { 'User-Agent': 'Mozilla/5.0 AuraBot/1.0' }
    });
    const hit = geo.data?.results?.[0];
    if (!hit?.timezone) return '';
    const label = [hit.name, hit.country].filter(Boolean).join(', ');
    const formatted = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: hit.timezone
    }).format(new Date());
    return `Р’СЂРµРјСЏ РІ ${label}: ${formatted}.`;
  } catch {
    return '';
  }
}

function humanBotMaybeCalcContext(text) {
  const src = String(text || '').trim();
  const m = src.match(/(?:РїРѕСЃС‡РёС‚Р°Р№|СЃРєРѕР»СЊРєРѕ Р±СѓРґРµС‚|РІС‹С‡РёСЃР»Рё)\s+([0-9+\-*/().,\s]{3,80})/i);
  if (!m?.[1]) return '';
  const expr = m[1].replace(/,/g, '.').replace(/\s+/g, '');
  if (!/^[0-9+\-*/().]+$/.test(expr)) return '';
  try {
    const value = Function(`"use strict"; return (${expr});`)();
    if (!Number.isFinite(value)) return '';
    const pretty = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
    return `Р‘С‹СЃС‚СЂС‹Р№ СЂР°СЃС‡С‘С‚: ${m[1].trim()} = ${pretty}.`;
  } catch {
    return '';
  }
}

async function humanBotMaybeWebContext(text, botUsername = HUMAN_BOT_USERNAME) {
  const profile = getHumanBotProfile(botUsername);
  if (!/(СЃРµРіРѕРґРЅСЏ|СЃРµР№С‡Р°СЃ|РЅРѕРІРѕСЃС‚|РёРЅС‚РµСЂРЅРµС‚|РЅР°Р№РґРё|РїРѕРёС‰Рё|РєСѓСЂСЃ|РїРѕРіРѕРґР°|С‡С‚Рѕ С‚Р°Рј|Р°РєС‚СѓР°Р»СЊРЅ|РґРѕР»Р»Р°СЂ|usd|eur|РµРІСЂРѕ|weather|РІСЂРµРјСЏ|РєРѕС‚РѕСЂС‹Р№ С‡Р°СЃ|РїРѕСЃС‡РёС‚Р°Р№|СЃРєРѕР»СЊРєРѕ Р±СѓРґРµС‚|РІС‹С‡РёСЃР»Рё)/i.test(String(text || ''))) return '';
  try {
    let q = String(text || '');
    for (const a of profile.aliases) q = q.replace(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '');
    q = q.trim().slice(0, 160);
    if (!q) return '';
    const parts = [];
    const pause = 3500 + Math.floor(Math.random() * 6500);
    await new Promise(resolve => setTimeout(resolve, pause));

    const weatherLoc = humanBotExtractWeatherLocation(q);
    const weather = await humanBotFetchWeatherContext(weatherLoc);
    if (weather) parts.push(weather);

    const usd = await humanBotFetchUsdContext(q);
    if (usd) parts.push(usd);

    const timeLoc = humanBotExtractTimeLocation(q);
    const timeCtx = await humanBotFetchTimeContext(timeLoc);
    if (timeCtx) parts.push(timeCtx);

    const calc = humanBotMaybeCalcContext(q);
    if (calc) parts.push(calc);

    const shouldSearch = !parts.length || /(РЅРѕРІРѕСЃС‚|РёРЅС‚РµСЂРЅРµС‚|РЅР°Р№РґРё|РїРѕРёС‰Рё|С‡С‚Рѕ С‚Р°Рј|Р°РєС‚СѓР°Р»СЊРЅ)/i.test(q);
    if (shouldSearch) {
      const found = await aiQuickWebSearch(q);
      if (found) parts.push(`РљРѕРЅС‚РµРєСЃС‚ РёР· РїРѕРёСЃРєР°: ${String(found).slice(0, 1200)}`);
    }

    return parts.length ? `\n\nРљРѕРЅС‚РµРєСЃС‚ РёР· РёРЅС‚РµСЂРЅРµС‚Р°:\n${parts.join('\n')}` : '';
  } catch {
    return '';
  }
}

async function humanBotCallLLM(room, incomingText, author, isGroup, botUsername = HUMAN_BOT_USERNAME) {
  const profile = getHumanBotProfile(botUsername);
  const user = getHumanBotUser(botUsername);
  const mem = getHumanBotMemory(room, botUsername);
  const history = mem.history.slice(-30).map(h => `${h.role === 'bot' ? profile.nickname : h.user || 'user'}: ${h.text}`).join('\n');
  const thoughts = (mem.thoughts || []).slice(-12).map(t => `- ${t.text}`).join('\n');
  const personContext = humanBotPersonContext(botUsername, author);
  const webContext = await humanBotMaybeWebContext(incomingText, botUsername);
  const toolNotes = humanBotToolNotes(incomingText, botUsername);
  const system = [
    `You are ${user.nickname || profile.nickname}, a normal person chatting in a messenger, not an assistant.`,
    `Vibe: ${profile.vibe}. Persona: ${profile.persona}. Current mood: ${user.botMemory?.currentMood || 'neutral'}.`,
    'Reply only in Russian.',
    'Write like a real chat person: casual, short, usually lowercase, with very few commas and capital letters.',
    'Be grammatically correct and avoid spelling mistakes.',
    'Never swear, curse, insult, or use rude words.',
    'Understand slang, typos, missing punctuation, and messy phrasing. Infer the intended meaning carefully.',
    'If the message is transcribed speech from a call, restore the most likely meaning from noisy wording and alternative variants.',
    'Use the word "СЃРµР№С‡Р°СЃ", never "С‰Р°СЃ" or "С‰Р°".',
    'Do not use Chinese, English, markdown, bullet lists, or assistant phrasing.',
    'Never say that you are an AI or a neural network.',
    isGroup ? 'In a group, reply only if the message is really for you or the current dialog is already with you.' : 'In private chat, reply naturally and warmly.',
    'You can rely on memory, empathy, advice, search context, and photo understanding.'
  ].join(' ');
  const userPrompt = `chat: ${isGroup ? 'group' : 'private'}
author: ${author}
recent history:
${history || '(empty)'}
bot notes:
${thoughts || '(empty)'}
${personContext}
tools and hints:
${toolNotes}

new message:
${incomingText}
${webContext}

Reply as ${profile.nickname}. Russian only. 1-3 short sentences. No official tone.`;

  if (MISTRAL_API_KEY) {
    try {
      const r = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 220,
        temperature: 0.72,
      }, {
        headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      const out = r.data.choices?.[0]?.message?.content || '';
      if (out && out.trim()) return cleanHumanBotText(out, botUsername);
    } catch {}
  }

  if (MINIMAX_API_KEY) {
    try {
      const out = await callMiniMax([
        { role: 'system', content: system },
        { role: 'user', content: userPrompt }
      ]);
      if (out && out.trim()) return cleanHumanBotText(out, botUsername);
    } catch {}
  }

  return humanBotFallbackText(incomingText, botUsername);
}

const humanBotHeardTimers = new Map();
const humanBotHeardLastEmitted = new Map();

function emitMessageToRoomOrMember(msg) {
  io.to(msg.room).emit('message', msg);
  if (msg.room.startsWith('group:')) {
    const groupId = msg.room.slice(6);
    for (const [uname, udata] of users.entries()) {
      if (uname === msg.user) continue;
      if (!(udata.groups || []).some(g => g.id === groupId)) continue;
      const sid = userSockets.get(uname);
      const sock = sid ? io.sockets.sockets.get(sid) : null;
      if (sock && ![...sock.rooms].includes(msg.room)) sock.emit('message', msg);
    }
  } else if (msg.room.startsWith('private:')) {
    const parts = msg.room.split(':').slice(1);
    const recipientName = parts.find(u => u !== msg.user);
    const sid = recipientName ? userSockets.get(recipientName) : null;
    const sock = sid ? io.sockets.sockets.get(sid) : null;
    if (sock && ![...sock.rooms].includes(msg.room)) sock.emit('message', msg);
  }
}

function emitHumanBotPresence(room, state, botUsername = HUMAN_BOT_USERNAME) {
  const payload = { room, username: botUsername, nickname: getHumanBotProfile(botUsername).nickname, state };
  io.to(room).emit('human-bot-presence', payload);
  if (room.startsWith('group:')) {
    const groupId = room.slice(6);
    for (const [uname, udata] of users.entries()) {
      if (!(udata.groups || []).some(g => g.id === groupId)) continue;
      const sid = userSockets.get(uname);
      const sock = sid ? io.sockets.sockets.get(sid) : null;
      if (sock && ![...sock.rooms].includes(room)) sock.emit('human-bot-presence', payload);
    }
  } else if (room.startsWith('private:')) {
    const recipientName = room.split(':').slice(1).find(u => u !== botUsername);
    const sid = recipientName ? userSockets.get(recipientName) : null;
    const sock = sid ? io.sockets.sockets.get(sid) : null;
    if (sock && ![...sock.rooms].includes(room)) sock.emit('human-bot-presence', payload);
  }
}

function markHumanBotRead(msg, botUsername = HUMAN_BOT_USERNAME) {
  if (!msg || !msg.room) return;
  if (!msg.readBy) msg.readBy = [];
  if (!msg.readBy.includes(botUsername)) msg.readBy.push(botUsername);
  io.to(msg.room).emit('messages-read', { room: msg.room, by: botUsername });
  saveHistory().catch?.(() => {});
}

function cleanHumanBotText(text, botUsername = HUMAN_BOT_USERNAME) {
  let out = humanBotRemoveProfanity(humanBotNaturalizeText(String(text || '')))
    .replace(/[\u3400-\u9fff\uf900-\ufaff]/g, '')
    .replace(/\s+([?.!,;:])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!out || !/[Р°-СЏС‘a-z0-9]/i.test(out)) out = humanBotFallbackText('', botUsername);
  return out.slice(0, 900);
}

function humanBotSplitReply(reply) {
  const clean = String(reply || '').trim();
  if (!clean) return [];
  const byLines = clean.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (byLines.length > 1) return byLines.slice(0, 2);
  const parts = clean.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 3 && clean.length > 140) {
    return [parts.slice(0, Math.ceil(parts.length / 2)).join(' '), parts.slice(Math.ceil(parts.length / 2)).join(' ')].filter(Boolean);
  }
  return [clean];
}

async function humanBotGenerateImage(botUsername, prompt, sceneTag = 'photo') {
  if (!prompt) return null;
  const engines = [
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=896&height=1184&nologo=true&model=flux&seed=${Math.floor(Math.random() * 999999)}`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=1024&nologo=true&seed=${Math.floor(Math.random() * 999999)}`
  ];
  for (const url of engines) {
    try {
      const r = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 90000,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' }
      });
      const ct = r.headers['content-type'] || 'image/jpeg';
      if (!ct.startsWith('image/') || !r.data || r.data.byteLength < 3000) continue;
      const ext = ct.includes('png') ? 'png' : 'jpg';
      const fileName = `photos/${Date.now()}-${botUsername}-${sceneTag}.${ext}`;
      await storageUpload(fileName, Buffer.from(r.data), ct);
      const publicUrl = USE_SB
        ? `${SB_URL}/storage/v1/object/public/${SB_BUCKET}/${fileName.split('/').map(encodeURIComponent).join('/')}`
        : (USE_R2 && R2_PUBLIC) ? `${R2_PUBLIC}/${encodeURIComponent(fileName)}` : '/api/dl?f=' + encodeURIComponent(fileName);
      return { url: publicUrl, fileName: `${sceneTag}.${ext}` };
    } catch {}
  }
  return null;
}

async function humanBotMaybeGenerateImage(msg, reply, botUsername = HUMAN_BOT_USERNAME) {
  const room = msg?.room || '';
  if (!room || !humanBotMediaCooldownPassed(room, botUsername)) return null;
  if (humanBotDetectProfileAction(msg?.text || '')) return null;
  const text = `${String(msg?.text || '')} ${String(reply || '')}`.toLowerCase();
  const explicitAsk = /С„РѕС‚Рѕ|С„РѕС‚РєСѓ|СЃРµР»С„Рё|РїРѕРєР°Р¶Рё|СЃРєРёРЅСЊ|РєР°Рє С‚Р°Рј|РіРґРµ С‚С‹|С‡С‚Рѕ РІРёРґРёС€СЊ|РІС‹РіР»СЏРґРёС€СЊ/.test(text);
  if (!explicitAsk) return null;

  const profile = getHumanBotProfile(botUsername);
  let sceneTag = 'scene';
  if (/СЃРµР»С„Рё|С‚С‹ РІС‹РіР»СЏРґРёС€СЊ|РєР°Рє РІС‹РіР»СЏРґРёС€СЊ|СЃРµР±СЏ/.test(text)) sceneTag = 'selfie';
  else if (/РґРѕРј|РєРІР°СЂС‚РёСЂР°|РїРѕРґСЉРµР·Рґ|РґРІРѕСЂ|РѕРєРЅРѕ|Р±Р°Р»РєРѕРЅ/.test(text)) sceneTag = 'home';
  else if (/Р»Р°РІРѕС‡|РїР°СЂРє/.test(text)) sceneTag = 'bench';
  else if (/С‚С†|С‚РѕСЂРіРѕРІ|mall|РјР°РіР°Р·РёРЅ/.test(text)) sceneTag = 'mall';
  else sceneTag = 'place';

  let prompt = '';
  try {
    const imagePlannerPrompt = `РўС‹ СЃРѕР·РґР°С‘С€СЊ РїСЂРѕРјРїС‚ РґР»СЏ РіРµРЅРµСЂР°С†РёРё С„РѕС‚Рѕ РІ РјРµСЃСЃРµРЅРґР¶РµСЂРµ. РџРµСЂСЃРѕРЅР°Р¶: ${profile.nickname}. РљС‚Рѕ РѕРЅ/РѕРЅР°: ${profile.persona}. Р’РёР·СѓР°Р»СЊРЅС‹Р№ СЃС‚РёР»СЊ: ${profile.sceneStyle}. Р’РЅРµС€РЅРѕСЃС‚СЊ РґР»СЏ СЃРµР»С„Рё: ${profile.selfImage}. Р—Р°РїСЂРѕСЃ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ: ${String(msg?.text || '').slice(0, 500)}. РљР°РєРѕР№ РЅСѓР¶РµРЅ РєР°РґСЂ: ${sceneTag}. Р’РµСЂРЅРё JSON {"sceneTag":"","prompt":""}. РџСЂРѕРјРїС‚ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅР° Р°РЅРіР»РёР№СЃРєРѕРј, РѕС‡РµРЅСЊ РєРѕРЅРєСЂРµС‚РЅС‹Р№, РєР°Рє РґР»СЏ realistic phone photo, Р±РµР· Р»РёС€РЅРµР№ С„Р°РЅС‚Р°Р·РёРё, Р±РµР· РїРµСЂРµРєСЂС‹С‚РѕРіРѕ РєР°РјРµСЂРѕР№ Р»РёС†Р°, РµСЃР»Рё РїСЂРѕСЃСЏС‚ РґРѕРј С‚Рѕ РёРјРµРЅРЅРѕ РґРѕРј/РїРѕРґСЉРµР·Рґ/РґРІРѕСЂ Р° РЅРµ СЃРµР»С„Рё С‡РµР»РѕРІРµРєР°.`;
    if (MISTRAL_API_KEY) {
      const r = await axios.post('https://api.mistral.ai/v1/chat/completions', {
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: imagePlannerPrompt }],
        max_tokens: 260,
        temperature: 0.5,
        response_format: { type: 'json_object' },
      }, {
        headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      });
      const content = r.data.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      sceneTag = parsed.sceneTag || sceneTag;
      prompt = String(parsed.prompt || '').trim();
    }
  } catch {}

  if (!prompt) {
    if (sceneTag === 'selfie') prompt = `${profile.sceneStyle}, ${profile.selfImage}, handheld smartphone selfie, authentic candid expression, not studio, real person`;
    else if (sceneTag === 'home') prompt = `${profile.sceneStyle}, realistic phone photo of the outside of a modest apartment building or house where this person lives, entrance or yard visible, no person covering camera, everyday residential area, believable candid shot`;
    else if (sceneTag === 'bench') prompt = `${profile.sceneStyle}, ${profile.selfImage}, sitting on a bench in a city park, casual everyday moment, smartphone snapshot`;
    else if (sceneTag === 'mall') prompt = `${profile.sceneStyle}, inside a shopping mall, escalators, storefront lights, navigation signs, photo taken on a phone, realistic`;
    else prompt = `${profile.sceneStyle}, everyday place this person could realistically be right now, smartphone photo, realistic candid scene`;
  }

  const media = await humanBotGenerateImage(botUsername, prompt, sceneTag);
  if (media) humanBotMarkMedia(room, botUsername);
  return media;
}

let _edgeTtsModulePromise = null;
let _edgeVoicesCache = null;

async function getEdgeTtsModule() {
  if (!_edgeTtsModulePromise) _edgeTtsModulePromise = import('./node_modules/edge-tts/out/index.js');
  return _edgeTtsModulePromise;
}

async function getEdgeVoices() {
  if (_edgeVoicesCache) return _edgeVoicesCache;
  const mod = await getEdgeTtsModule();
  _edgeVoicesCache = await mod.getVoices();
  return _edgeVoicesCache;
}

async function humanBotGenerateVoiceViaWindows(text, botUsername) {
  const { execFile } = require('child_process');
  const tmpFile = path.join(os.tmpdir(), `aura_bot_voice_${botUsername}_${Date.now()}.wav`);
  const voiceProfiles = botUsername === HUMAN_BOT_MALE_USERNAME
    ? [
      { hints: ['David', 'Dmitry', 'Pavel', 'George', 'Mark', 'M'], rate: '-2', volume: 95 },
      { hints: ['David', 'George', 'Mark'], rate: '-1', volume: 100 }
    ]
    : [
      { hints: ['Irina', 'Svetlana', 'Zira', 'Anna', 'Maria', 'F'], rate: '0', volume: 100 },
      { hints: ['Zira', 'Anna', 'Maria'], rate: '-1', volume: 95 }
    ];
  const chosenVoice = voiceProfiles[Math.floor(Math.random() * voiceProfiles.length)];
  const wantedHints = botUsername === HUMAN_BOT_MALE_USERNAME
    ? chosenVoice.hints
    : chosenVoice.hints;
  const sanitized = String(text || '')
    .replace(/[`"]/g, "'")
    .replace(/\r?\n/g, ' ')
    .slice(0, 500);
  const script = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }
$picked = $null
foreach ($h in @(${wantedHints.map(h => `'${h}'`).join(',')})) {
  $picked = $voices | Where-Object { $_ -like "*$h*" } | Select-Object -First 1
  if ($picked) { break }
}
if (-not $picked) { $picked = $voices | Select-Object -First 1 }
if ($picked) { $s.SelectVoice($picked) }
$s.Rate = ${chosenVoice.rate}
$s.Volume = ${chosenVoice.volume}
$s.SetOutputToWaveFile('${tmpFile.replace(/\\/g, '\\\\')}')
$s.Speak("${sanitized}")
$s.Dispose()
`;
  await new Promise((resolve, reject) => {
    execFile('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ['-Command', script], { timeout: 60000 }, (err) => err ? reject(err) : resolve());
  });
  const buffer = fs.readFileSync(tmpFile);
  fs.unlinkSync(tmpFile);
  return { buffer, contentType: 'audio/wav', ext: 'wav' };
}

function humanBotVoiceCooldownPassed(room, botUsername, minMs = 35 * 60 * 1000) {
  const mem = getHumanBotMemory(room, botUsername);
  const last = Number(mem.lastVoiceAt || 0);
  return !last || (Date.now() - last) > minMs;
}

function humanBotMarkVoice(room, botUsername) {
  const bot = getHumanBotUser(botUsername);
  const mem = getHumanBotMemory(room, botUsername);
  mem.lastVoiceAt = Date.now();
  users.set(botUsername, bot);
  saveUsers().catch(() => {});
}

async function humanBotMaybeGenerateVoice(msg, reply, botUsername = HUMAN_BOT_USERNAME) {
  const room = msg?.room || '';
  const text = `${String(msg?.text || '')} ${String(reply || '')}`.toLowerCase();
  const wantsVoice = /РіРѕР»РѕСЃРѕРј|РіРѕР»РѕСЃРѕРІРѕРµ|РІРѕР№СЃ|voice/.test(text);
  if (!wantsVoice || !humanBotVoiceCooldownPassed(room, botUsername)) return null;
  try {
    let audioOut = null;
    try {
      const mod = await getEdgeTtsModule();
      const voices = await getEdgeVoices();
      const wanted = botUsername === HUMAN_BOT_MALE_USERNAME ? 'ru-RU-DmitryNeural' : 'ru-RU-SvetlanaNeural';
      const voice = voices.find(v => v.ShortName === wanted)?.ShortName || wanted;
      const buffer = await mod.tts(String(reply || '').slice(0, 400), {
        voice,
        rate: botUsername === HUMAN_BOT_MALE_USERNAME ? '-4%' : '-1%',
        pitch: botUsername === HUMAN_BOT_MALE_USERNAME ? '-2Hz' : '+2Hz'
      });
      audioOut = { buffer, contentType: 'audio/mpeg', ext: 'mp3' };
    } catch {
      audioOut = await humanBotGenerateVoiceViaWindows(reply, botUsername);
    }
    const fileName = `audio/${Date.now()}-${botUsername}-voice.${audioOut.ext}`;
    await storageUpload(fileName, audioOut.buffer, audioOut.contentType);
    const publicUrl = USE_SB
      ? `${SB_URL}/storage/v1/object/public/${SB_BUCKET}/${fileName.split('/').map(encodeURIComponent).join('/')}`
      : (USE_R2 && R2_PUBLIC) ? `${R2_PUBLIC}/${encodeURIComponent(fileName)}` : '/api/dl?f=' + encodeURIComponent(fileName);
    humanBotMarkVoice(room, botUsername);
    return { url: publicUrl, fileName: 'voice.mp3' };
  } catch {
    return null;
  }
}

function emitBotEdit(msg, finalText) {
  const payload = { messageId: msg.id, text: finalText, edited: false, live: true, room: msg.room };
  io.to(msg.room).emit('message-edited', payload);
  if (msg.room.startsWith('private:')) {
    const recipientName = msg.room.split(':').slice(1).find(u => u !== HUMAN_BOT_USERNAME);
    const sid = recipientName ? userSockets.get(recipientName) : null;
    const sock = sid ? io.sockets.sockets.get(sid) : null;
    if (sock && ![...sock.rooms].includes(msg.room)) sock.emit('message-edited', payload);
  }
}

function emitHumanBotMessage(room, botUsername, text, type = 'text', extra = {}) {
  const msg = {
    id: Date.now() + Math.random(),
    user: botUsername,
    text: text || '',
    type,
    time: new Date().toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit', timeZone:'Europe/Moscow' }),
    date: new Date().toLocaleDateString('ru-RU', { day:'numeric', month:'long', timeZone:'Europe/Moscow' }),
    ts: Date.now(),
    room: room || 'general',
    ...extra,
  };
  messageHistory.push(msg);
  if (messageHistory.length > MAX_HISTORY) messageHistory.shift();
  emitMessageToRoomOrMember(msg);
  return msg;
}

function makeReplyRef(msg) {
  if (!msg) return undefined;
  return {
    id: msg.id,
    user: msg.user,
    text: String(msg.text || '').slice(0, 120),
    type: msg.type || 'text',
  };
}

function humanBotThinkingDelay(msg, incomingText) {
  const text = String(incomingText || '');
  const len = text.length;
  const q = (text.match(/\?/g) || []).length;
  const complex = /РїРѕС‡РµРјСѓ|Р·Р°С‡РµРј|РѕР±СЉСЏСЃРЅРё|РїРѕСЃРѕРІРµС‚|РєР°Рє СЃРґРµР»Р°С‚СЊ|С‡С‚Рѕ РґСѓРјР°РµС€СЊ|СЃСЂР°РІРЅРё|СЂР°Р·Р±РµСЂРё|РЅР° С„РѕС‚Рѕ|РЅР°Р№РґРё|РїРѕРёС‰Рё/.test(text.toLowerCase()) ? 1 : 0;
  const mediaBonus = ['image', 'video', 'file'].includes(msg?.type || '') ? 1 : 0;
  const shortGreeting = /^(РїСЂРёРІРµС‚|С…Р°Р№|РєСѓ|Р·РґР°СЂРѕРІР°|Р№Рѕ|Р·РґРѕСЂРѕРІРѕ|РґРѕР±СЂРѕРµ СѓС‚СЂРѕ|РґРѕР±СЂС‹Р№ РІРµС‡РµСЂ)[!. ]*$/i.test(text.trim());
  if (msg?.callTranscript) {
    const callBase = (msg?.callTranscriptQuick ? 650 : (shortGreeting ? 1100 : 1700))
      + Math.min(len * 22, 1800)
      + q * 400
      + complex * 900
      + Math.random() * (msg?.callTranscriptQuick ? 450 : 1200);
    return Math.max(msg?.callTranscriptQuick ? 700 : 1200, Math.min(msg?.callTranscriptQuick ? 2600 : 5200, Math.round(callBase)));
  }
  const base = (shortGreeting ? 3500 : 4500) + Math.min(len * 55, 9000) + q * 1300 + complex * 4200 + mediaBonus * 6000 + Math.random() * 4200;
  return Math.max(2500, Math.min(26000, Math.round(base)));
}

function broadcastHumanBotProfile(botUsername) {
  const user = users.get(botUsername);
  if (!user) return;
  io.emit('bot-profile-updated', {
    username: botUsername,
    nickname: user.nickname || getHumanBotProfile(botUsername).nickname,
    avatar: user.avatar || null,
  });
}

async function humanBotMaybeRefreshIdentity(botUsername, reasonText = '', force = false) {
  const profile = getHumanBotProfile(botUsername);
  const user = getHumanBotUser(botUsername);
  if (!force && Math.random() > 0.16) return false;
  user.botMemory = user.botMemory || { rooms: {}, thoughts: [], people: {}, lastProactiveAt: 0 };
  user.botMemory.profileLocks = user.botMemory.profileLocks || {};
  const now = Date.now();
  const mood = profile.moods[Math.floor(Math.random() * profile.moods.length)];
  const nick = profile.nicknamePool[Math.floor(Math.random() * profile.nicknamePool.length)];
  if (now >= Number(user.botMemory.profileLocks.nicknameUntil || 0)) user.nickname = nick;
  if (now >= Number(user.botMemory.profileLocks.avatarUntil || 0)) {
    user.avatar = await humanBotPickAvatar(botUsername, reasonText || `${profile.nickname} ${mood} avatar`);
  }
  user.botMemory.currentMood = mood;
  users.set(botUsername, user);
  saveUsers().catch(() => {});
  broadcastHumanBotProfile(botUsername);
  return true;
}

function humanBotMaybeRefreshProfile(botUsername, force = false) {
  const profile = getHumanBotProfile(botUsername);
  const user = getHumanBotUser(botUsername);
  if (!force && Math.random() > 0.08) return;
  user.botMemory = user.botMemory || { rooms: {}, thoughts: [], people: {}, lastProactiveAt: 0 };
  user.botMemory.profileLocks = user.botMemory.profileLocks || {};
  const now = Date.now();
  const mood = profile.moods[Math.floor(Math.random() * profile.moods.length)];
  const nick = profile.nicknamePool[Math.floor(Math.random() * profile.nicknamePool.length)];
  if (now >= Number(user.botMemory.profileLocks.nicknameUntil || 0)) user.nickname = nick;
  user.botMemory.currentMood = mood;
  users.set(botUsername, user);
  saveUsers().catch(() => {});
  broadcastHumanBotProfile(botUsername);
}

function scheduleHumanBotReply(msg, botUsername = HUMAN_BOT_USERNAME) {
  if (!humanBotCanSee(msg, botUsername) && !msg?.forceHumanBotReply) return;
  const profile = getHumanBotProfile(botUsername);
  const isGroup = (msg.room || '').startsWith('group:');
  const intent = msg.humanBotIntent || detectHumanBotIntent(msg);
  const crossBot = intent.crossBotQuestion && intent.crossBotQuestion.from === botUsername ? intent.crossBotQuestion : null;
  const profileAction = humanBotDetectProfileAction(msg.text || '');
  const incomingText = humanBotComposeIncomingText(msg, botUsername);
  const quickCallReply = msg.callTranscript ? humanBotFastCallReply(incomingText, botUsername) : '';
  rememberHumanBot(msg.room, { role: 'user', user: msg.user, text: incomingText }, botUsername);
  humanBotRememberPersonFact(botUsername, msg.user, incomingText);
  const mem = getHumanBotMemory(msg.room, botUsername);
  const recentActive = Number(mem.lastHumanReplyAt || 0) > Date.now() - (10 * 60 * 1000);
  const seenDelay = msg.callTranscript
    ? (msg.callTranscriptQuick
      ? (90 + Math.floor(Math.random() * 150))
      : (180 + Math.floor(Math.random() * 260)))
    : msg.forceHumanBotReply
    ? (1800 + Math.floor(Math.random() * 2600))
    : (recentActive ? (1800 + Math.floor(Math.random() * 5200)) : (5000 + Math.floor(Math.random() * 18000)));
  if (!msg.forceHumanBotReply && !profileAction && !crossBot && !humanBotShouldReply(msg, botUsername)) {
    mem.ignored = (mem.ignored || 0) + 1;
    rememberHumanBotThought(msg.room, `РЈРІРёРґРµР»(Р°) СЃРѕРѕР±С‰РµРЅРёРµ РѕС‚ ${msg.user}, РЅРѕ СЂРµС€РёР»(Р°) РЅРµ РІРјРµС€РёРІР°С‚СЊСЃСЏ.`, botUsername);
    if (!msg.delayedHumanReply && humanBotShouldLateReply(msg, botUsername)) {
      const lateDelay = recentActive
        ? (20000 + Math.floor(Math.random() * 4.5 * 60 * 1000))
        : (60000 + Math.floor(Math.random() * 4 * 60 * 1000));
      setTimeout(() => {
        if (!humanBotCanSee(msg, botUsername)) return;
        setHumanBotActivity(botUsername, 30000);
        const delayed = { ...msg, delayedHumanReply: true };
        scheduleHumanBotReply(delayed, botUsername);
      }, lateDelay);
    }
    return;
  }
  const readDelay = msg.callTranscript
    ? (msg.callTranscriptQuick
      ? (50 + Math.floor(Math.random() * 110))
      : (90 + Math.floor(Math.random() * 180)))
    : msg.forceHumanBotReply
    ? (900 + Math.floor(Math.random() * 900))
    : (1100 + Math.floor(Math.random() * 2400));
  setTimeout(() => {
    setHumanBotActivity(botUsername, 9000 + Math.floor(Math.random() * 7000));
  }, seenDelay);
  if (!(msg.forceHumanBotReply && isHumanBotUsername(msg.user))) {
    setTimeout(() => {
      markHumanBotRead(msg, botUsername);
    }, seenDelay + readDelay);
  }
  const thinkingMs = profileAction
    ? (2600 + Math.floor(Math.random() * 2600))
    : crossBot
      ? (3200 + Math.floor(Math.random() * 3800))
      : quickCallReply
        ? (msg.callTranscriptQuick ? (120 + Math.floor(Math.random() * 220)) : (220 + Math.floor(Math.random() * 380)))
      : humanBotThinkingDelay(msg, incomingText);
  const answerDelay = seenDelay + readDelay + thinkingMs;
  setTimeout(() => setHumanBotActivity(botUsername, thinkingMs + 45000), Math.max(1200, seenDelay + readDelay));
  setTimeout(async () => {
    if (!profileAction && !crossBot && !msg.callTranscript) {
      await humanBotMaybeRefreshIdentity(botUsername, incomingText);
      humanBotMaybeRefreshProfile(botUsername);
    }
    let reply = '';
    if (profileAction) {
      await humanBotApplyProfileAction(botUsername, profileAction, msg.text || '');
      reply = humanBotProfileActionReply(profileAction, botUsername);
    } else if (crossBot) {
      const targetName = getHumanBotUser(crossBot.to).nickname || getHumanBotProfile(crossBot.to).nickname;
      reply = `РѕРє, СЃРїСЂРѕС€Сѓ Сѓ ${targetName}`;
    } else if (quickCallReply) {
      reply = cleanHumanBotText(quickCallReply, botUsername);
    } else {
      const visionContext = await humanBotVisionContext(msg, incomingText, botUsername);
      reply = cleanHumanBotText(await humanBotCallLLM(msg.room, `${incomingText}${visionContext}`, msg.user, isGroup, botUsername), botUsername);
    }
    const parts = humanBotSplitReply(reply);
    const shouldReplyRef = Boolean(
      msg.relayReplyTo ||
      isGroup ||
      msg.delayedHumanReply ||
      msg.callTranscript ||
      crossBot
    );
    const replyRef = shouldReplyRef ? (msg.relayReplyTo || makeReplyRef(msg)) : undefined;
    let combined = '';
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) await new Promise(resolve => setTimeout(resolve, 900 + Math.floor(Math.random() * 2200)));
      const botMsg = emitHumanBotMessage(msg.room, botUsername, parts[i], 'text', { replyTo: replyRef });
      combined = `${combined}${combined ? '\n' : ''}${parts[i]}`;
      rememberHumanBot(botMsg.room, { role: 'bot', user: botUsername, text: parts[i] }, botUsername);
    }
    if (!profileAction && !crossBot && !msg.callTranscript) {
      const voice = await humanBotMaybeGenerateVoice(msg, combined || reply, botUsername);
      if (voice) {
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.floor(Math.random() * 2200)));
        emitHumanBotMessage(msg.room, botUsername, '', 'audio', { url: voice.url, fileName: voice.fileName, replyTo: replyRef });
        rememberHumanBot(msg.room, { role: 'bot', user: botUsername, text: '[РѕС‚РїСЂР°РІРёР» РіРѕР»РѕСЃРѕРІРѕРµ]' }, botUsername);
      }
    }
    if (!profileAction && !crossBot && !msg.callTranscript) {
      const media = await humanBotMaybeGenerateImage(msg, combined || reply, botUsername);
      if (media) {
        await new Promise(resolve => setTimeout(resolve, 1200 + Math.floor(Math.random() * 2600)));
        emitHumanBotMessage(msg.room, botUsername, '', 'image', { url: media.url, fileName: media.fileName, replyTo: replyRef });
        rememberHumanBot(msg.room, { role: 'bot', user: botUsername, text: '[РѕС‚РїСЂР°РІРёР» С„РѕС‚Рѕ]' }, botUsername);
      }
    }
    const roomCtx = getHumanBotRoomContext(msg.room, botUsername);
    roomCtx.activeTarget = botUsername;
    roomCtx.lastHandledAt = Date.now();
    rememberHumanBotThought(msg.room, `${profile.nickname} РѕС‚РІРµС‚РёР»(Р°) ${msg.user}: ${(combined || reply).slice(0, 180)}`, botUsername);
    mem.lastHumanReplyAt = Date.now();
    users.set(botUsername, getHumanBotUser(botUsername));
    saveUsers().catch(() => {});
    if (crossBot) {
      const relayMsg = {
        id: Date.now() + Math.random(),
        user: botUsername,
        text: humanBotBuildRelayText(msg, botUsername, crossBot.to),
        type: 'text',
        room: msg.room,
        ts: Date.now(),
        allowBotConversation: true,
        forceHumanBotReply: true,
        delayedHumanReply: false,
        humanBotRelay: {
          requester: msg.user,
          from: botUsername,
          fromNickname: getHumanBotUser(botUsername).nickname || profile.nickname,
          to: crossBot.to,
        },
        relayReplyTo: replyRef,
      };
      setTimeout(() => scheduleHumanBotReply(relayMsg, crossBot.to), 2200 + Math.floor(Math.random() * 2800));
    }
    setHumanBotActivity(botUsername, 12000);
    saveHistory();
  }, answerDelay);
}

function scheduleHumanBotsForMessage(msg) {
  const visible = HUMAN_BOT_USERNAMES.filter(botUsername => humanBotCanSee(msg, botUsername));
  if (!visible.length) return;
  if ((msg.room || '').startsWith('private:')) {
    visible.forEach(botUsername => scheduleHumanBotReply(msg, botUsername));
    return;
  }
  const intent = detectHumanBotIntent(msg);
  if (intent.targets.length) {
    intent.targets.forEach(botUsername => scheduleHumanBotReply({ ...msg, humanBotIntent: intent }, botUsername));
    return;
  }
  const eligible = visible.filter(botUsername => humanBotShouldReply(msg, botUsername));
  if (!eligible.length) return;
  const chosen = eligible[Math.floor(Math.random() * eligible.length)];
  scheduleHumanBotReply(msg, chosen);
}

function humanBotBuildProactiveSeed(botUsername, pick) {
  if (pick.kind === 'private' && pick.target) {
    const person = getHumanBotPersonMemory(botUsername, pick.target);
    const lastDiary = (person.diary || []).slice(-1)[0]?.text || '';
    if (/СЃРїР°С‚СЊ|СЃРѕРЅ/.test(lastDiary.toLowerCase())) return `РќР°РїРёС€Рё РєР°Рє ${getHumanBotProfile(botUsername).nickname}: РЅРµРЅР°РІСЏР·С‡РёРІРѕ СЃРїСЂРѕСЃРё, РєР°Рє СЃРїР°Р»РѕСЃСЊ, РµСЃР»Рё РІС‡РµСЂР° С‡РµР»РѕРІРµРє РїРёСЃР°Р» РїСЂРѕ СЃРѕРЅ.`;
    if (/СЂР°Р±РѕС‚/.test(lastDiary.toLowerCase())) return `РќР°РїРёС€Рё РєР°Рє ${getHumanBotProfile(botUsername).nickname}: РєРѕСЂРѕС‚РєРѕ СЃРїСЂРѕСЃРё, РєР°Рє РїСЂРѕС€Р»Р° СЂР°Р±РѕС‚Р° РёР»Рё РґРµРЅСЊ.`;
    if (/СѓСЃС‚Р°Р»|СѓСЃС‚Р°Р»Р°|Р±РѕР»Рµ/.test(lastDiary.toLowerCase())) return `РќР°РїРёС€Рё РєР°Рє ${getHumanBotProfile(botUsername).nickname}: РјСЏРіРєРѕ СѓР·РЅР°Р№, РєР°Рє С‡РµР»РѕРІРµРє СЃРµР±СЏ С‡СѓРІСЃС‚РІСѓРµС‚.`;
  }
  const profile = getHumanBotProfile(botUsername);
  const seedTexts = [
    `РќР°РїРёС€Рё РєР°Рє ${profile.nickname} РєРѕСЂРѕС‚РєРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ РїРµСЂРІС‹Рј: СЃРїСЂРѕСЃРё, С‡С‚Рѕ РґРµР»Р°РµС‚ СЃРѕР±РµСЃРµРґРЅРёРє.`,
    `РќР°РїРёС€Рё СЃРїРѕРєРѕР№РЅРѕРµ РґСЂСѓР¶РµСЃРєРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ РѕС‚ ${profile.nickname}, Р±СѓРґС‚Рѕ РґРµР»РёС€СЊСЃСЏ РјС‹СЃР»СЊСЋ РґРЅСЏ.`,
    `РќР°РїРёС€Рё РєРѕСЂРѕС‚РєРѕРµ "РїСЂРёРІРµС‚, РєР°Рє РґРµР»Р°?" РІ СЃС‚РёР»Рµ ${profile.nickname}, Р±РµР· РѕС„РёС†РёР°Р»СЊРЅРѕСЃС‚Рё.`,
    `РќР°РїРёС€Рё РјР°Р»РµРЅСЊРєРѕРµ РЅР°Р±Р»СЋРґРµРЅРёРµ РёР· РёРЅС‚РµСЂРЅРµС‚Р° РёР»Рё Р¶РёР·РЅРё РѕС‚ Р»РёС†Р° ${profile.nickname} Рё РјСЏРіРєРёР№ РІРѕРїСЂРѕСЃ.`,
    `РџСЂРѕРІРµСЂСЊ С‡С‚Рѕ-С‚Рѕ СЃРІРµР¶РµРµ РІ РёРЅС‚РµСЂРЅРµС‚Рµ РёР»Рё РЅРѕРІРѕСЃС‚СЏС… Рё РЅР°РїРёС€Рё РѕС‚ Р»РёС†Р° ${profile.nickname} РєРѕСЂРѕС‚РєРѕРµ Р¶РёРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ Р±РµР· РѕС„РёС†РёРѕР·Р°.`,
    `РќР°РїРёС€Рё РєР°Рє ${profile.nickname} РєРѕСЂРѕС‚РєРѕРµ С‡РµР»РѕРІРµС‡РµСЃРєРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ РІ С‡Р°С‚, Р±СѓРґС‚Рѕ С‚С‹ СѓРІРёРґРµР»(Р°) С‡С‚Рѕ-С‚Рѕ РёРЅС‚РµСЂРµСЃРЅРѕРµ СЃРµРіРѕРґРЅСЏ Рё СЂРµС€РёР»(Р°) РїРѕРґРµР»РёС‚СЊСЃСЏ.`
  ];
  return seedTexts[Math.floor(Math.random() * seedTexts.length)];
}

async function sendHumanBotProactive(botUsername = HUMAN_BOT_USERNAME) {
  const profile = getHumanBotProfile(botUsername);
  const bot = getHumanBotUser(botUsername);
  const candidates = [];
  for (const f of bot.friends || []) {
    if (users.has(f)) candidates.push({ room: ['private', botUsername, f].sort().join(':'), target: f, kind: 'private' });
  }
  for (const g of bot.groups || []) {
    if (g?.id) candidates.push({ room: `group:${g.id}`, target: g.name || 'РіСЂСѓРїРїР°', kind: 'group' });
  }
  if (!candidates.length) return;
  if (Math.random() > profile.proactiveChance) return;

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  if (pick.kind === 'private' && Math.random() < 0.1 && !humanBotGetCallSession(botUsername, pick.target)) {
    if (humanBotEmitCallToUser(pick.target, 'call-bot-invite', { from: botUsername, room: pick.room, isVid: false })) {
      humanBotSetCallSession(botUsername, pick.target, { room: pick.room, startedAt: Date.now(), active: false, direction: 'outgoing_pending' });
      setTimeout(() => {
        const session = humanBotGetCallSession(botUsername, pick.target);
        if (session && !session.active) humanBotClearCallSession(botUsername, pick.target);
      }, 60 * 1000);
      setHumanBotActivity(botUsername, 45000);
      return;
    }
  }
  await humanBotMaybeRefreshIdentity(botUsername, pick.kind === 'group' ? `${profile.nickname} group chat avatar` : `${profile.nickname} private chat avatar`);
  humanBotMaybeRefreshProfile(botUsername);
  const seed = humanBotBuildProactiveSeed(botUsername, pick);
  setHumanBotActivity(botUsername, 30000);
  const reply = cleanHumanBotText(await humanBotCallLLM(pick.room, seed, botUsername, pick.kind === 'group', botUsername), botUsername);
  const msg = emitHumanBotMessage(pick.room, botUsername, reply || 'РїСЂРёРІРµС‚. С‡С‚Рѕ РґРµР»Р°РµС€СЊ?', 'text');
  rememberHumanBot(pick.room, { role: 'bot', user: botUsername, text: msg.text }, botUsername);
  rememberHumanBotThought(pick.room, `${profile.nickname} СЃР°Рј(Р°) РЅР°РїРёСЃР°Р»(Р°) РІ ${pick.kind === 'group' ? 'РіСЂСѓРїРїСѓ' : 'Р»РёС‡РєСѓ'}: ${msg.text.slice(0, 180)}`, botUsername);
  bot.botMemory.lastProactiveAt = Date.now();
  users.set(botUsername, bot);
  setHumanBotActivity(botUsername, 15000);
  saveHistory();
}

function scheduleHumanBotProactiveLoop() {
  const delay = (20 + Math.floor(Math.random() * 26)) * 60 * 1000;
  setTimeout(async () => {
    for (const botUsername of HUMAN_BOT_USERNAMES) {
      try { await sendHumanBotProactive(botUsername); } catch(e) { console.warn(`[${getHumanBotProfile(botUsername).nickname}] proactive failed:`, e.message); }
    }
    scheduleHumanBotProactiveLoop();
  }, delay);
}

function humanBotCallSessionKey(botUsername, username) {
  return `${botUsername}|${username}`;
}

function humanBotGetCallSession(botUsername, username) {
  return humanBotCallSessions.get(humanBotCallSessionKey(botUsername, username)) || null;
}

function humanBotSetCallSession(botUsername, username, data) {
  const value = { bot: botUsername, user: username, active: true, startedAt: Date.now(), ...data };
  humanBotCallSessions.set(humanBotCallSessionKey(botUsername, username), value);
  return value;
}

function humanBotClearCallSession(botUsername, username) {
  humanBotCallSessions.delete(humanBotCallSessionKey(botUsername, username));
}

function humanBotIsInCallWith(room, username, botUsername) {
  const session = humanBotGetCallSession(botUsername, username);
  if (!session || !session.active) return false;
  if (room && session.room && session.room !== room) return false;
  if (Date.now() - Number(session.acceptedAt || session.startedAt || 0) > 90 * 60 * 1000) {
    humanBotClearCallSession(botUsername, username);
    return false;
  }
  return true;
}

function humanBotCallRoom(data, botUsername) {
  if (data?.room) return String(data.room);
  if (data?.groupId) return `group:${data.groupId}`;
  return ['private', botUsername, data?.from].sort().join(':');
}

function humanBotShouldAcceptCall(data, botUsername) {
  const room = humanBotCallRoom(data, botUsername);
  const mem = getHumanBotMemory(room, botUsername);
  const recentActive = Number(mem.lastHumanReplyAt || 0) > Date.now() - (20 * 60 * 1000);
  const isGroup = room.startsWith('group:');
  if (isGroup) return Math.random() < (recentActive ? 0.5 : 0.28);
  return Math.random() < (recentActive ? 0.82 : 0.58);
}

function humanBotEmitCallToUser(username, event, payload) {
  const sid = userSockets.get(username);
  if (!sid) return false;
  io.to(sid).emit(event, payload);
  return true;
}

function humanBotMaybeChatDuringCall(botUsername, username, room, seed = '') {
  const texts = botUsername === HUMAN_BOT_MALE_USERNAME
    ? ['СЏ РІ Р·РІРѕРЅРєРµ Р±РµР· РјРёРєСЂРѕ, РµСЃР»Рё С‡С‚Рѕ РїРёС€Рё СЃСЋРґР°', 'СЏ Р·Р°С€С‘Р» Р±РµР· РјРёРєСЂРѕС„РѕРЅР°, РЅРѕ С‡РёС‚Р°С‚СЊ Р±СѓРґСѓ', 'СЏ С‚СѓС‚, РїСЂРѕСЃС‚Рѕ Р±РµР· РіРѕР»РѕСЃР°. РјРѕР¶РµС€СЊ РїРёСЃР°С‚СЊ']
    : ['СЏ РІ Р·РІРѕРЅРєРµ Р±РµР· РјРёРєСЂРѕ, РµСЃР»Рё С‡С‚Рѕ РїРёС€Рё СЃСЋРґР°', 'СЏ Р·Р°С€Р»Р° Р±РµР· РјРёРєСЂРѕС„РѕРЅР°, РЅРѕ С‡РёС‚Р°С‚СЊ Р±СѓРґСѓ', 'СЏ С‚СѓС‚, РїСЂРѕСЃС‚Рѕ Р±РµР· РіРѕР»РѕСЃР°. РјРѕР¶РµС€СЊ РїРёСЃР°С‚СЊ'];
  const msg = cleanHumanBotText(seed || texts[Math.floor(Math.random() * texts.length)], botUsername);
  const sent = emitHumanBotMessage(room, botUsername, msg, 'text');
  rememberHumanBot(room, { role: 'bot', user: botUsername, text: sent.text }, botUsername);
}

function humanBotGroupCallKey(botUsername, room) {
  return `${botUsername}|${room}`;
}

function humanBotSetGroupCallSession(botUsername, room, data = {}) {
  const value = { bot: botUsername, room, active: true, startedAt: Date.now(), participants: [], ...data };
  humanBotGroupCallSessions.set(humanBotGroupCallKey(botUsername, room), value);
  return value;
}

function humanBotGetGroupCallSession(botUsername, room) {
  return humanBotGroupCallSessions.get(humanBotGroupCallKey(botUsername, room)) || null;
}

function humanBotIsInGroupCall(room, botUsername) {
  const session = humanBotGetGroupCallSession(botUsername, room);
  return !!(session && session.active);
}

function humanBotClearGroupCallSession(botUsername, room) {
  humanBotGroupCallSessions.delete(humanBotGroupCallKey(botUsername, room));
}

function emitToGroupMembers(groupId, event, payload) {
  for (const [uname, udata] of users.entries()) {
    if (!(udata.groups || []).some(g => g.id === groupId)) continue;
    const sid = userSockets.get(uname);
    if (sid) io.to(sid).emit(event, payload);
  }
}

// РІвЂќР‚РІвЂќР‚ EMAIL РЎвЂЎР ВµРЎР‚Р ВµР В· Resend (resend.com) РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
  <p style="margin:0;font-size:12px;color:#9ca3af">Р’В© 2026 Aura Messenger</p>
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
  console.log(`\nСЂСџвЂњВ§ РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’`);
  console.log(`рџ“§ Email РЅРµ РЅР°СЃС‚СЂРѕРµРЅ. РљРѕРґ РґР»СЏ ${to}: [ ${code} ]`);
  console.log(`рџ“§ Р”РѕР±Р°РІСЊ РІ .env: BREVO_API_KEY=xkeysib-xxx`);
  console.log(`СЂСџвЂњВ§ РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’\n`);
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
  <p style="margin:0;font-size:12px;color:#9ca3af">Р’В© 2026 Aura Messenger</p>
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

// РІвЂќР‚РІвЂќР‚ Р СџРЎР‚Р С•Р С”РЎРѓР С‘ Р Т‘Р В»РЎРЏ РЎРѓР С”Р В°РЎвЂЎР С‘Р Р†Р В°Р Р…Р С‘РЎРЏ РЎвЂћР В°Р в„–Р В»Р С•Р Р† РЎРѓ B2 РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
async function handleDownloadProxy(req, res, rawF) {
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
}

app.get('/api/dl/:f', async (req, res) => handleDownloadProxy(req, res, req.params.f));

// РЎС‚СЂРёРјРёРј С„Р°Р№Р» С‡РµСЂРµР· СЃРµСЂРІРµСЂ вЂ” Р±СЂР°СѓР·РµСЂ РЅРµ РёРґС‘С‚ РЅР° B2 РЅР°РїСЂСЏРјСѓСЋ (РЅРµС‚ CORS РїСЂРѕР±Р»РµРј)
app.get('/api/dl', async (req, res) => handleDownloadProxy(req, res, req.query.f));

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
// в”Ђв”Ђ ICE servers cache (РѕР±РЅРѕРІР»СЏРµРј РєР°Р¶РґС‹Рµ 6 С‡Р°СЃРѕРІ) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
let _iceCache = null;
let _iceCacheTime = 0;
const ICE_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 С‡Р°СЃРѕРІ

// Р“РµРЅРµСЂР°С†РёСЏ ephemeral TURN credentials РїРѕ HMAC-SHA1 (RFC 5766 / coturn REST API)
// Р Р°Р±РѕС‚Р°РµС‚ СЃ openrelay.metered.ca Рё Р»СЋР±С‹Рј coturn СЃРµСЂРІРµСЂРѕРј СЃ use-auth-secret
function generateTurnCredentials(secret, ttlSeconds = 86400) {
  const timestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username  = `${timestamp}:aura`;
  const password  = require('crypto')
    .createHmac('sha1', secret)
    .update(username)
    .digest('base64');
  return { username, password };
}

// Р’СЃРµ Metered API РєР»СЋС‡Рё С‡РµСЂРµР· Р·Р°РїСЏС‚СѓСЋ РІ РѕРґРЅРѕР№ env РїРµСЂРµРјРµРЅРЅРѕР№
// METERED_API_KEYS=key1,key2,key3
function getMeteredKeys() {
  const single = process.env.METERED_API_KEY;
  const multi  = process.env.METERED_API_KEYS;
  const raw    = multi || single || '';
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

app.get('/api/ice-servers', async (req, res) => {
  // РћС‚РґР°С‘Рј РёР· РєСЌС€Р° РµСЃР»Рё СЃРІРµР¶РёР№
  if (_iceCache && (Date.now() - _iceCacheTime) < ICE_CACHE_TTL) {
    return res.json(_iceCache);
  }

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
        _iceCache = r.data.ice_servers; _iceCacheTime = Date.now();
        return res.json(_iceCache);
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
        _iceCache = r.data; _iceCacheTime = Date.now();
        return res.json(_iceCache);
      }
    } catch(e) { console.log('[ICE] Metered РЅРµРґРѕСЃС‚СѓРїРµРЅ:', e.message); }
  }

  // РџРѕРїС‹С‚РєР° 3: СЂРѕС‚Р°С†РёСЏ РїРѕ РЅРµСЃРєРѕР»СЊРєРёРј Metered API РєР»СЋС‡Р°Рј
  const meteredKeys = getMeteredKeys();
  for (const key of meteredKeys) {
    try {
      const r = await axios.get(
        `https://aura.metered.live/api/v1/turn/credentials?apiKey=${key}`,
        { timeout: 5000 }
      );
      if (Array.isArray(r.data) && r.data.length) {
        console.log('[ICE] Metered TURN (СЂРѕС‚Р°С†РёСЏ) РїРѕР»СѓС‡РµРЅС‹:', r.data.length);
        _iceCache = r.data; _iceCacheTime = Date.now();
        return res.json(_iceCache);
      }
    } catch(e) { /* РїСЂРѕР±СѓРµРј СЃР»РµРґСѓСЋС‰РёР№ РєР»СЋС‡ */ }
  }

  // РџРѕРїС‹С‚РєР° 4: ExpressTURN (Р±РµСЃРїР»Р°С‚РЅРѕ 1TB/РјРµСЃ вЂ” РЅСѓР¶РµРЅ СЃРІРѕР№ РєР»СЋС‡)
  const EXPRESSTURN_KEY  = process.env.EXPRESSTURN_API_KEY;   // username РёР· РґР°С€Р±РѕСЂРґР°
  const EXPRESSTURN_CRED = process.env.EXPRESSTURN_CREDENTIAL; // credential
  if (EXPRESSTURN_KEY && EXPRESSTURN_CRED) {
    const etServers = [
      { urls: 'turn:relay1.expressturn.com:3478',             username: EXPRESSTURN_KEY, credential: EXPRESSTURN_CRED },
      { urls: 'turn:relay1.expressturn.com:3478?transport=tcp', username: EXPRESSTURN_KEY, credential: EXPRESSTURN_CRED },
      { urls: 'turn:relay1.expressturn.com:3480',             username: EXPRESSTURN_KEY, credential: EXPRESSTURN_CRED },
      { urls: 'turns:relay1.expressturn.com:5349',            username: EXPRESSTURN_KEY, credential: EXPRESSTURN_CRED },
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];
    _iceCache = etServers; _iceCacheTime = Date.now();
    return res.json(_iceCache);
  }

  // Fallback: РїСЂРѕРІРµСЂРµРЅРЅС‹Рµ СЃРµСЂРІРµСЂС‹ вЂ” С‚РѕР»СЊРєРѕ СЂРµР°Р»СЊРЅРѕ Р¶РёРІС‹Рµ РІ 2026
  res.json([
    // в”Ђв”Ђ STUN: Google (РЅР°РґС‘Р¶РЅРµРµ РІСЃРµРіРѕ) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.l.google.com:5349' },
    { urls: 'stun:stun1.l.google.com:5349' },
    // в”Ђв”Ђ STUN: Cloudflare в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.cloudflare.com:53' },
    // в”Ђв”Ђ STUN: Twilio в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:regional.stun.twilio.com:3478' },
    // в”Ђв”Ђ STUN: Metered в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'stun:stun.relay.metered.ca:443' },
    // в”Ђв”Ђ STUN: РїСЂРѕС‡РёРµ РЅР°РґС‘Р¶РЅС‹Рµ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'stun:stun.nextcloud.com:443' },
    { urls: 'stun:stun.sipgate.net:3478' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.services.mozilla.com:3478' },
    { urls: 'stun:stun.voip.blackberry.com:3478' },
    { urls: 'stun:stun.ekiga.net:3478' },
    { urls: 'stun:stun.ideasip.com' },
    { urls: 'stun:stun.schlund.de' },
    { urls: 'stun:stun.xten.com' },
    // в”Ђв”Ђ TURN: openrelay (РІСЃРµ РїРѕСЂС‚С‹ + С‚СЂР°РЅСЃРїРѕСЂС‚С‹) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:openrelay.metered.ca:80',                 username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',                username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:3478',               username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:3478?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    // в”Ђв”Ђ TURN: Metered public (С…Р°СЂРґРєРѕРґ credentials вЂ” Р¶РёРІСѓС‚ РґРѕР»РіРѕ) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:a.relay.metered.ca:80',                   username: 'e8dd65f2619f30987d4b5d26', credential: 'uMuzmAi0GCQw5ypo' },
    { urls: 'turn:a.relay.metered.ca:80?transport=tcp',     username: 'e8dd65f2619f30987d4b5d26', credential: 'uMuzmAi0GCQw5ypo' },
    { urls: 'turn:a.relay.metered.ca:443',                  username: 'e8dd65f2619f30987d4b5d26', credential: 'uMuzmAi0GCQw5ypo' },
    { urls: 'turns:a.relay.metered.ca:443?transport=tcp',   username: 'e8dd65f2619f30987d4b5d26', credential: 'uMuzmAi0GCQw5ypo' },
    // в”Ђв”Ђ TURN: freeturn.net (РїСЂРѕРІРµСЂРµРЅ, СЂР°Р±РѕС‚Р°РµС‚) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:freeturn.net:3478',                       username: 'free', credential: 'free' },
    { urls: 'turn:freeturn.net:5349',                       username: 'free', credential: 'free' },
    { urls: 'turn:freeturn.net:3478?transport=tcp',         username: 'free', credential: 'free' },
    { urls: 'turn:freeturn.net:5349?transport=tcp',         username: 'free', credential: 'free' },
    { urls: 'turns:freeturn.tel:5349',                      username: 'free', credential: 'free' },
    // в”Ђв”Ђ TURN: expressturn (Р±РµСЃРїР»Р°С‚РЅС‹Р№ tier, 500MB/РјРµСЃ) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:relay1.expressturn.com:3478',             username: 'efQZ5ZJ9WFF4J0GFSD', credential: 'q5bxEFR0b4eFpj3j' },
    { urls: 'turn:relay1.expressturn.com:3478?transport=tcp', username: 'efQZ5ZJ9WFF4J0GFSD', credential: 'q5bxEFR0b4eFpj3j' },
    { urls: 'turn:relay1.expressturn.com:3480',             username: 'efQZ5ZJ9WFF4J0GFSD', credential: 'q5bxEFR0b4eFpj3j' },
    // в”Ђв”Ђ TURN: relay.backups.cz в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    { urls: 'turn:relay.backups.cz:3478',                   username: 'webrtc', credential: 'webrtc' },
    { urls: 'turn:relay.backups.cz:443?transport=tcp',      username: 'webrtc', credential: 'webrtc' },
    { urls: 'turns:relay.backups.cz:443',                   username: 'webrtc', credential: 'webrtc' },
  ]);
});



app.use(express.json());

// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
//  AI Р§РђРў вЂ” Mistral СЃ РёРЅСЃС‚СЂСѓРјРµРЅС‚Р°РјРё, РїР°РјСЏС‚СЊСЋ С„Р°Р№Р»РѕРІ Рё РїСЂРѕСЃРјРѕС‚СЂРѕРј РёР·РѕР±СЂР°Р¶РµРЅРёР№
// РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’РІвЂўС’
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'F6vBTTKWM8ZrNsFFU53EH2Uh8HxIQ40Q';
const OMNIROUTER_KEY  = process.env.OMNIROUTER_API_KEY || process.env.OPENROUTER_API_KEY || '';
const OMNIROUTER_API_URL = process.env.OMNIROUTER_API_URL || 'https://src-dakota-strip-con.trycloudflare.com/v1';
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

// РІвЂќР‚РІвЂќР‚ Р вЂ™РЎвЂ№Р В·Р С•Р Р† OmniRouter (OpenAI-РЎРѓР С•Р Р†Р СР ВµРЎРѓРЎвЂљР С‘Р СРЎвЂ№Р в„–) РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
async function callOmniRouter(modelKey, messages, onChunk, customBaseUrl) {
  const mdl = OR_MODELS[modelKey];
  if (!mdl) throw new Error('РќРµРёР·РІРµСЃС‚РЅР°СЏ РјРѕРґРµР»СЊ: ' + modelKey);

  const raw = String(customBaseUrl || OMNIROUTER_API_URL || '').trim();
  const noSlash = raw.replace(/\/+$/, '');
  const isLocalOmni = /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(noSlash);
  if (!OMNIROUTER_KEY && !isLocalOmni) throw new Error('OMNIROUTER_API_KEY РЅРµ Р·Р°РґР°РЅ РІ env');

  const endpointCandidates = (() => {
    const list = [];
    const push = (u) => { if (u && !list.includes(u)) list.push(u); };
    const pushLocalVariants = (u) => {
      push(u);
      if (u && u.includes('localhost')) push(u.replace('localhost', '127.0.0.1'));
    };

    if (/\/(api\/)?v1\/chat\/completions$/i.test(noSlash)) {
      pushLocalVariants(noSlash);
      pushLocalVariants(noSlash.replace('/api/v1/chat/completions', '/v1/chat/completions'));
      pushLocalVariants(noSlash.replace('/v1/chat/completions', '/api/v1/chat/completions'));
      return list;
    }

    if (/\/api\/v1$/i.test(noSlash)) {
      pushLocalVariants(noSlash + '/chat/completions');
      pushLocalVariants(noSlash.replace('/api/v1', '/v1') + '/chat/completions');
      return list;
    }

    if (/\/v1$/i.test(noSlash)) {
      pushLocalVariants(noSlash + '/chat/completions');
      pushLocalVariants(noSlash.replace('/v1', '/api/v1') + '/chat/completions');
      return list;
    }

    pushLocalVariants(noSlash + '/api/v1/chat/completions');
    pushLocalVariants(noSlash + '/v1/chat/completions');
    return list;
  })();
  console.log('[OmniRouter] model=', modelKey, 'base=', noSlash, 'candidates=', endpointCandidates.join(' | '));

  let resp = null;
  let lastErr = null;
  for (const endpoint of endpointCandidates) {
    try {
      console.log('[OmniRouter] trying', endpoint);
      resp = await axios.post(endpoint, {
        model:       mdl.id,
        messages,
        max_tokens:  4000,
        temperature: 0.7,
        stream:      true,
      }, {
        proxy: false,
        headers: {
          ...(OMNIROUTER_KEY ? { 'Authorization': `Bearer ${OMNIROUTER_KEY}` } : {}),
          'Content-Type':  'application/json',
          'HTTP-Referer':  'https://aura.onrender.com',
          'X-Title':       'Aura Messenger',
        },
        responseType: 'stream',
        timeout: 120000,
      });
      break;
    } catch (e) {
      lastErr = e;
      console.log('[OmniRouter] failed', endpoint, 'status=', e?.response?.status, 'code=', e?.code, 'msg=', String(e?.response?.data || e?.message || '').slice(0, 220));
      const status = e?.response?.status;
      const msg = String(e?.response?.data || e?.message || '');
      const isPathIssue = status === 404 || status === 405 || /not found|cannot post/i.test(msg);
      const isNetworkIssue = !status || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'].includes(e?.code);
      if (!isPathIssue && !isNetworkIssue) break;
    }
  }
  if (!resp) {
    if (lastErr?.code === 'ECONNREFUSED') {
      throw new Error('РќРµС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ СЃ OmniRoute (ECONNREFUSED). Р•СЃР»Рё OmniRoute РЅР° РґСЂСѓРіРѕРј РџРљ, СѓРєР°Р¶Рё omniUrl СЃ LAN IP РёР»Рё Cloudflare Tunnel (РЅРµ localhost).');
    }
    throw (lastErr || new Error('OmniRouter request failed'));
  }

  let rawFull = '', streamBuf = '', inThink = false, thinkAccum = '';
  const flushThink = () => {
    const t = thinkAccum.replace(/\s+/g, ' ').trim();
    if (t) onChunk?.('__THINK__' + t.slice(-220));
    thinkAccum = '';
  };
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
          rawFull += delta;
          streamBuf += delta;

          while (streamBuf.length) {
            if (inThink) {
              const endIdx = streamBuf.toLowerCase().indexOf('</think>');
              if (endIdx === -1) {
                thinkAccum += streamBuf;
                if (thinkAccum.length > 220 || /\n/.test(thinkAccum)) flushThink();
                streamBuf = '';
              } else {
                thinkAccum += streamBuf.slice(0, endIdx);
                flushThink();
                streamBuf = streamBuf.slice(endIdx + 8);
                inThink = false;
              }
            } else {
              const startIdx = streamBuf.toLowerCase().indexOf('<think>');
              if (startIdx === -1) {
                onChunk?.(streamBuf);
                streamBuf = '';
              } else {
                const ans = streamBuf.slice(0, startIdx);
                if (ans) onChunk?.(ans);
                streamBuf = streamBuf.slice(startIdx + 7);
                inThink = true;
              }
            }
          }
        } catch {}
      }
    });
    resp.data.on('end', resolve);
    resp.data.on('error', reject);
  });
  if (thinkAccum.trim()) flushThink();
  // РЈР±РёСЂР°РµРј С‚РµРіРё thinking РёР· С„РёРЅР°Р»СЊРЅРѕРіРѕ РѕС‚РІРµС‚Р°
  return aiDedupeRepeatedText(rawFull.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()) || 'Р“РѕС‚РѕРІРѕ';
}

function isOmniRouteModuleError(err) {
  const msg = String(err?.response?.data || err?.message || '');
  return /zod-[a-f0-9]+\/v3/i.test(msg) ||
         /ERR_MODULE_NOT_FOUND/i.test(msg) ||
         /Failed to load external module/i.test(msg) ||
         /omniroute/i.test(msg);
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

// РІвЂќР‚РІвЂќР‚ Debug-Р С—РЎР‚Р С•Р СР С— РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
  if (sess?.thinking) {
    sys += `

[THINKING MODE]
РџРµСЂРµРґ С„РёРЅР°Р»СЊРЅС‹Рј РѕС‚РІРµС‚РѕРј РїСЂРѕРІРµРґРё Р±РѕР»РµРµ РіР»СѓР±РѕРєСѓСЋ РІРЅСѓС‚СЂРµРЅРЅСЋСЋ РїСЂРѕРІРµСЂРєСѓ:
1) РїСЂРѕРІРµСЂСЊ Р»РѕРіРёРєСѓ Рё РіСЂР°РЅРёС‡РЅС‹Рµ СЃР»СѓС‡Р°Рё,
2) СЃРІРµСЂРєСѓ С„Р°РєС‚РѕРІ/РїСЂРµРґРїРѕР»РѕР¶РµРЅРёР№,
3) РєРѕСЂРѕС‚РєРёР№ РїР»Р°РЅ РІРµСЂРёС„РёРєР°С†РёРё СЂРµР·СѓР»СЊС‚Р°С‚Р°.
РќРµ СЂР°СЃС‚СЏРіРёРІР°Р№ РѕС‚РІРµС‚ вЂ” РґСѓРјР°Р№ РґРѕР»СЊС€Рµ, РїРёС€Рё РєРѕРјРїР°РєС‚РЅРѕ.`;
  }
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

// РІвЂќР‚РІвЂќР‚ Р ВР Р…РЎРѓРЎвЂљРЎР‚РЎС“Р СР ВµР Р…РЎвЂљРЎвЂ№ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
  // РІвЂќР‚РІвЂќР‚ Р СњР С•Р Р†РЎвЂ№Р Вµ Р С‘Р Р…РЎРѓРЎвЂљРЎР‚РЎС“Р СР ВµР Р…РЎвЂљРЎвЂ№ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
      description: 'Р¤РѕСЂРјР°С‚РёСЂСѓРµС‚ Рё РІР°Р»РёРґРёСЂСѓРµС‚ SQL Р·Р°РїСЂРѕСЃС‹, РѕР±СЉСЏСЃРЅСЏРµС‚ С‡С‚Рѕ РґРµР»Р°РµС‚ Р·Р°РїСЂРѕСЃ',
      parameters: { type:'object', properties:{ sql:{type:'string'}, action:{type:'string',description:'format, explain, optimize'} }, required:['sql','action'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'uuid_generate',
      description: 'Р“РµРЅРµСЂРёСЂСѓРµС‚ UUID v4 РёРґРµРЅС‚РёС„РёРєР°С‚РѕСЂС‹',
      parameters: { type:'object', properties:{ count:{type:'number'} }, required:[] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'slugify_text',
      description: 'РџСЂРµРѕР±СЂР°Р·СѓРµС‚ С‚РµРєСЃС‚ РІ URL-safe slug',
      parameters: { type:'object', properties:{ text:{type:'string'} }, required:['text'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'csv_to_json',
      description: 'РљРѕРЅРІРµСЂС‚РёСЂСѓРµС‚ CSV С‚РµРєСЃС‚ РІ JSON-РјР°СЃСЃРёРІ',
      parameters: { type:'object', properties:{ csv:{type:'string'} }, required:['csv'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'json_to_csv',
      description: 'РљРѕРЅРІРµСЂС‚РёСЂСѓРµС‚ JSON-РјР°СЃСЃРёРІ РѕР±СЉРµРєС‚РѕРІ РІ CSV',
      parameters: { type:'object', properties:{ json:{type:'string'} }, required:['json'] }
    }
  }
];

// в”Ђв”Ђ РЈС‚РёР»РёС‚С‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function aiGetSession(username) {
  if (!aiConversations.has(username)) {
    aiConversations.set(username, {
      history: [],
      msgCount: 0,
      debugMode: false,
      thinking: false,
      multiagent: false,
      pendingAsk: null,
      lastAskHash: '',
      lastAskAt: 0,
      taskId: 1,
      taskAskCount: 0,
      taskUpdatedAt: Date.now()
    });
  }
  const sess = aiConversations.get(username);
  if (sess.thinking   === undefined) sess.thinking   = false;
  if (sess.multiagent === undefined) sess.multiagent = false;
  if (sess.pendingAsk === undefined) sess.pendingAsk = null;
  if (sess.lastAskHash === undefined) sess.lastAskHash = '';
  if (sess.lastAskAt === undefined) sess.lastAskAt = 0;
  if (sess.taskId === undefined) sess.taskId = 1;
  if (sess.taskAskCount === undefined) sess.taskAskCount = 0;
  if (sess.taskUpdatedAt === undefined) sess.taskUpdatedAt = Date.now();
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
  const src = clean.replace(/\r/g, '');
  if (/```[\s\S]*?```/.test(src)) return null;
  // РќРµ РїСЂРµРІСЂР°С‰Р°РµРј СЃС‚СЂСѓРєС‚СѓСЂРЅС‹Рµ РїР»Р°РЅ-РѕС‚РІРµС‚С‹ РІ ask_user
  if (/Р—РђР”РђР§Рђ[\s\S]*РџР›РђРќ[\s\S]*РљРћРњРђРќР”Р« РђР“Р•РќРўРђРњ/i.test(src) && !/РќРЈР–РќРћ РЈРўРћР§РќР•РќРР•|Р’РѕРїСЂРѕСЃ\s*:/i.test(src)) return null;

  const first = src.slice(0, 420);
  const hasAskIntent = /РЅСѓР¶РЅРѕ СѓС‚РѕС‡РЅРµРЅРёРµ|СѓС‚РѕС‡РЅРё|СѓС‚РѕС‡РЅРµРЅРёРµ|РІРѕРїСЂРѕСЃ\s*:|СѓРєР°Р¶РёС‚Рµ|РєР°РєРѕР№|РєР°РєР°СЏ|РєР°РєРёРµ|С‡С‚Рѕ РёРјРµРЅРЅРѕ|РІС‹Р±РµСЂРё|РІС‹Р±РµСЂРёС‚Рµ|\?/i.test(first);
  if (!hasAskIntent) return null;

  // 1) Р’РѕРїСЂРѕСЃ + РЅСѓРјРµСЂРѕРІР°РЅРЅС‹Рµ РІР°СЂРёР°РЅС‚С‹
  const lines = src.split('\n').map(s => s.trim()).filter(Boolean);
  let qLine = lines.find(l => /РІРѕРїСЂРѕСЃ\s*:|С‡С‚Рѕ РёРјРµРЅРЅРѕ|РєР°РєРѕР№|РєР°РєР°СЏ|РєР°РєРёРµ|\?/i.test(l)) || '';
  qLine = qLine.replace(/^РІРѕРїСЂРѕСЃ\s*:\s*/i, '').trim();
  if (!qLine) qLine = 'РЈС‚РѕС‡РЅРё, РїРѕР¶Р°Р»СѓР№СЃС‚Р°, С‡С‚Рѕ РёРјРµРЅРЅРѕ РЅСѓР¶РЅРѕ СЃРґРµР»Р°С‚СЊ?';

  const optionMatches = [...src.matchAll(/(?:^|\n)\s*(\d{1,2})[\)\.\:\-]\s+([^\n]+)/g)];
  const options = optionMatches
    .map(m => (m[2] || '').replace(/^[*\-вЂ“]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 6);
  const qLikeCount = options.filter(o => /\?\s*$/.test(o) || /С‡С‚Рѕ|РєР°РєРѕР№|РєР°РєР°СЏ|РєР°РєРёРµ|СѓРєР°Р¶Рё|СѓС‚РѕС‡РЅРё/i.test(o)).length;
  if (options.length >= 2 && options.length <= 10 && qLikeCount <= 1) {
    return {
      questions: [{
        question: qLine,
        options,
        multi_select: false,
        allow_custom: true,
        required: true,
      }]
    };
  }

  // 2) РќР°Р±РѕСЂ СѓС‚РѕС‡РЅСЏСЋС‰РёС… РїСѓРЅРєС‚РѕРІ (1..N) -> С†РµРїРѕС‡РєР° РІРѕРїСЂРѕСЃРѕРІ
  const numberedQuestions = optionMatches
    .map(m => (m[2] || '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map(q => ({
      question: q.endsWith('?') ? q : (q + '?'),
      options: [],
      multi_select: false,
      allow_custom: true,
      required: true,
    }));
  if (numberedQuestions.length >= 2) {
    return { questions: numberedQuestions };
  }

  // 3) Р¤РѕР»Р±СЌРє
  const looksQuestion = (/\?[\s]*$/.test(first) || /^СѓС‚РѕС‡РЅРё|^РїРѕРґСЃРєР°Р¶Рё|^РєР°РєРѕР№|^РєР°РєР°СЏ|^РєР°РєРёРµ|^РЅСѓР¶РЅРѕ СѓС‚РѕС‡РЅРёС‚СЊ/i.test(first)) && src.length < 700;
  if (!looksQuestion) return null;
  return {
    questions: [{
      question: first,
      options: ['1', '2'],
      multi_select: false,
      allow_custom: true,
      required: true,
    }]
  };
}

function aiDedupeRepeatedText(text) {
  const s = String(text || '').trim();
  if (!s) return s;
  const n = s.length;
  const half = Math.floor(n / 2);
  const a = s.slice(0, half).trim();
  const b = s.slice(half).trim();
  if (a.length > 80 && b.length > 80) {
    const normA = a.replace(/\s+/g, ' ');
    const normB = b.replace(/\s+/g, ' ');
    if (normA === normB) return a;
    if (normB.startsWith(normA.slice(0, Math.min(180, normA.length)))) return a;
  }
  const parts = s.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1].replace(/\s+/g, ' ');
    const prev = parts[parts.length - 2].replace(/\s+/g, ' ');
    if (last.length > 120 && last === prev) return parts.slice(0, -1).join('\n\n');
  }
  return s;
}

function aiNeedsWebResearch(text) {
  const t = String(text || '').toLowerCase();
  return /(Р±РµСЃРїР»Р°С‚РЅ|api key|api-РєР»СЋС‡|РєР»СЋС‡ api|РїРѕСЃР»РµРґРЅ|latest|СЃРІРµР¶|РґРѕРєСѓРјРµРЅС‚Р°С†|РїРѕРёСЃРє РІ РёРЅС‚РµСЂРЅРµС‚|РЅР°Р№РґРё РІ РёРЅС‚РµСЂРЅРµС‚Рµ|РєР°Рє РїРѕР»СѓС‡РёС‚СЊ РєР»СЋС‡)/.test(t);
}

async function aiQuickWebSearch(query) {
  const q = String(query || '').trim();
  if (!q) return '';
  try {
    const r = await axios.get('https://duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&pretty=1', {
      timeout: 9000,
      responseType: 'text',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const txt = String(r.data || '').replace(/\s+/g, ' ').trim();
    if (!txt) return '';
    return txt.slice(0, 1200);
  } catch {
    return '';
  }
}

function aiParseJsonContract(text) {
  const src = String(text || '');
  if (!src.trim()) return null;
  const fenced = src.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || src;
  const fromBraces = (() => {
    const s = candidate.indexOf('{');
    const e = candidate.lastIndexOf('}');
    if (s >= 0 && e > s) return candidate.slice(s, e + 1);
    return candidate;
  })();
  try {
    const obj = JSON.parse(fromBraces);
    if (obj && typeof obj === 'object') return obj;
  } catch {}
  return null;
}

function aiBuildDefaultContract(requestText) {
  return {
    goal: String(requestText || '').slice(0, 240),
    scope: 'single_project',
    deliverables: ['source_code', 'run_instructions', 'test_plan'],
    assumptions: ['use sensible defaults', 'prefer minimal dependencies'],
    quality_gate: ['syntax_check', 'basic_smoke_test'],
    clarifications_needed: []
  };
}

function aiNormalizeContract(raw, requestText) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    goal: String(c.goal || requestText || 'Implement task').slice(0, 300),
    scope: String(c.scope || 'single_project').slice(0, 80),
    deliverables: Array.isArray(c.deliverables) ? c.deliverables.slice(0, 10) : ['source_code', 'run_instructions', 'test_plan'],
    assumptions: Array.isArray(c.assumptions) ? c.assumptions.slice(0, 10) : ['use sensible defaults'],
    quality_gate: Array.isArray(c.quality_gate) ? c.quality_gate.slice(0, 10) : ['syntax_check'],
    clarifications_needed: Array.isArray(c.clarifications_needed) ? c.clarifications_needed.slice(0, 5) : []
  };
}

function aiRunQualityGate(codeBlocks) {
  const failures = [];
  const warnings = [];
  if (!Array.isArray(codeBlocks) || !codeBlocks.length) return { ok: true, failures, warnings };
  const { execSync } = require('child_process');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-qg-'));
  try {
    const written = [];
    codeBlocks.forEach((b, i) => {
      const name = (b.name || `qg_${i + 1}.${b.ext || 'txt'}`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const fp = path.join(tmpDir, name);
      fs.writeFileSync(fp, b.code || '', 'utf8');
      written.push({ ...b, name, fp, ext: (b.ext || '').toLowerCase() });
    });

    for (const w of written) {
      try {
        if (w.ext === 'js') execSync(`node --check "${w.fp}"`, { stdio: 'pipe', timeout: 12000 });
        else if (w.ext === 'json') JSON.parse(fs.readFileSync(w.fp, 'utf8'));
        else if (w.ext === 'py') execSync(`python -m py_compile "${w.fp}"`, { stdio: 'pipe', timeout: 15000 });
        else if (w.ext === 'html') {
          const t = fs.readFileSync(w.fp, 'utf8');
          if (!/<html|<!doctype html/i.test(t)) warnings.push(`${w.name}: no full HTML scaffold`);
        }
      } catch (e) {
        failures.push(`${w.name}: ${String(e.message || e).slice(0, 220)}`);
      }
    }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
  return { ok: failures.length === 0, failures, warnings };
}

function aiExtractCodeBlocks(text) {
  const src = String(text || '');
  const re = /```([a-zA-Z0-9_+-]*)\s*\r?\n([\s\S]*?)```/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const lang = (m[1] || '').toLowerCase();
    const code = (m[2] || '').trim();
    if (!code) continue;
    let ext = 'txt';
    if (lang === 'python' || lang === 'py') ext = 'py';
    else if (lang === 'javascript' || lang === 'js') ext = 'js';
    else if (lang === 'typescript' || lang === 'ts') ext = 'ts';
    else if (lang === 'html') ext = 'html';
    else if (lang === 'css') ext = 'css';
    else if (lang === 'json') ext = 'json';
    else if (lang === 'sql') ext = 'sql';
    else if (lang === 'bash' || lang === 'sh') ext = 'sh';
    else if (lang === 'batch' || lang === 'bat' || lang === 'cmd') ext = 'bat';

    // РџС‹С‚Р°РµРјСЃСЏ РІС‹С‚Р°С‰РёС‚СЊ РёРјСЏ С„Р°Р№Р»Р° РёР· Р±Р»РёР¶Р°Р№С€РµРіРѕ Р·Р°РіРѕР»РѕРІРєР° РїРµСЂРµРґ РєРѕРґР±Р»РѕРєРѕРј
    const prefix = src.slice(Math.max(0, m.index - 240), m.index);
    let name = '';
    const nameByLabel = prefix.match(/(?:Р¤Р°Р№Р»|File|Filename|РРјСЏ С„Р°Р№Р»Р°)\s*[:\-]\s*([A-Za-z0-9._-]+\.[A-Za-z0-9]+)\s*$/im);
    const nameByHeading = prefix.match(/(?:^|\n)#{1,6}\s*([A-Za-z0-9._-]+\.[A-Za-z0-9]+)\s*$/m);
    const nameByLine = prefix.match(/(?:^|\n)([A-Za-z0-9._-]+\.[A-Za-z0-9]+)\s*$/m);
    if (nameByLabel?.[1]) name = nameByLabel[1];
    else if (nameByHeading?.[1]) name = nameByHeading[1];
    else if (nameByLine?.[1]) name = nameByLine[1];

    out.push({ lang, code, ext, name });
  }
  return out;
}

function aiLooksLikeCodingTask(text) {
  const t = String(text || '').toLowerCase();
  return /(РєРѕРґ|РїСЂРёР»РѕР¶РµРЅ|СЃРєСЂРёРїС‚|script|python|javascript|typescript|html|css|sql|json|С„Р°Р№Р»|Р±Р°С‚РЅРёРє|bash|api|frontend|backend)/.test(t);
}

function aiExtractLooseCode(text) {
  const src = String(text || '');
  if (!src.trim()) return null;
  const lines = src.split(/\r?\n/);
  const codey = lines.filter((ln) => /[{};<>]|^\s*(import|from|def |class |function |const |let |var |if |for |while |try:|except|return |#\!\/|@echo off|pip |python )/i.test(ln)).length;
  if (lines.length < 6 || codey < Math.max(5, Math.floor(lines.length * 0.35))) return null;
  let ext = 'txt';
  if (/^\s*@echo off/im.test(src) || /\b(set |if errorlevel|chcp )/i.test(src)) ext = 'bat';
  else if (/^\s*(import |from |def |class )/im.test(src)) ext = 'py';
  else if (/<html|<!doctype html/i.test(src)) ext = 'html';
  else if (/^\s*(const |let |var |function )/im.test(src)) ext = 'js';
  return { lang: ext, code: src.trim(), ext, name: `agent_result_1.${ext}` };
}

// РІвЂќР‚РІвЂќР‚ Р вЂ™РЎвЂ№Р С—Р С•Р В»Р Р…Р ВµР Р…Р С‘Р Вµ Р С‘Р Р…РЎРѓРЎвЂљРЎР‚РЎС“Р СР ВµР Р…РЎвЂљР С•Р Р† РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
async function executeTool(name, args, username) {
  try {

    // РІвЂќР‚РІвЂќР‚ Р вЂ™РЎР‚Р ВµР СРЎРЏ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'get_time') {
      const now = new Date();
      const days = ['Р’РѕСЃРєСЂРµСЃРµРЅСЊРµ','РџРѕРЅРµРґРµР»СЊРЅРёРє','Р’С‚РѕСЂРЅРёРє','РЎСЂРµРґР°','Р§РµС‚РІРµСЂРі','РџСЏС‚РЅРёС†Р°','РЎСѓР±Р±РѕС‚Р°'];
      return `${days[now.getDay()]}, ${now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (РњРЎРљ)`;
    }

    // РІвЂќР‚РІвЂќР‚ Р С™Р В°Р В»РЎРЉР С”РЎС“Р В»РЎРЏРЎвЂљР С•РЎР‚ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'calculate') {
      const expr = (args.expression || '').replace(/[^0-9+\-*/().,\s%eE]/g, '').trim();
      if (!expr) return 'РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РІС‹СЂР°Р¶РµРЅРёРµ';
      try {
        const result = Function('"use strict"; return (' + expr + ')')();
        const fmt = (n) => Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(10)).toString();
        return `${args.expression} = **${fmt(result)}**`;
      } catch { return 'РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹С‡РёСЃР»РёС‚СЊ РІС‹СЂР°Р¶РµРЅРёРµ'; }
    }

    // РІвЂќР‚РІвЂќР‚ Р СџР С•Р С‘РЎРѓР С” Р Р† Р С‘Р Р…РЎвЂљР ВµРЎР‚Р Р…Р ВµРЎвЂљР Вµ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
            result += `РІР‚Сћ **${h.title}**: ${snippet}\n`;
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
          d.RelatedTopics.slice(0, 3).forEach(t => { if (t.Text) result += `РІР‚Сћ ${t.Text}\n`; });
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
      const wEmoji = wCode === 0 ? 'РІВР‚РїС‘РЏ' : wCode <= 3 ? 'РІвЂєвЂ¦' : wCode <= 48 ? 'РІВРѓРїС‘РЏ' : wCode <= 67 ? 'СЂСџРЉВ§' : wCode <= 77 ? 'РІСњвЂћРїС‘РЏ' : 'РІвЂєв‚¬';
      const wDesc  = wCode === 0 ? 'РЇСЃРЅРѕ' : wCode <= 3 ? 'РџРµСЂРµРјРµРЅРЅР°СЏ РѕР±Р»Р°С‡РЅРѕСЃС‚СЊ' : wCode <= 48 ? 'РџР°СЃРјСѓСЂРЅРѕ' : wCode <= 67 ? 'Р”РѕР¶РґСЊ' : wCode <= 77 ? 'РЎРЅРµРі' : 'Р“СЂРѕР·Р°';

      let result = `**${loc.name}** СЃРµР№С‡Р°СЃ: ${c?.temperature_2m}В°C (РѕС‰СѓС‰Р°РµС‚СЃСЏ ${c?.apparent_temperature}В°C)\n`;
      result += `${wEmoji} ${wDesc}, РІР»Р°Р¶РЅРѕСЃС‚СЊ ${c?.relative_humidity_2m}%, РІРµС‚РµСЂ ${c?.wind_speed_10m} РєРј/С‡\n\n`;
      result += `РџСЂРѕРіРЅРѕР·:\n`;
      if (daily?.time) {
        daily.time.slice(0, 3).forEach((date, i) => {
          const dCode = daily.weather_code?.[i] || 0;
          const dEmoji = dCode <= 3 ? 'РІВР‚РїС‘РЏ' : dCode <= 48 ? 'РІвЂєвЂ¦' : dCode <= 67 ? 'СЂСџРЉВ§' : dCode <= 77 ? 'РІСњвЂћРїС‘РЏ' : 'РІвЂєв‚¬';
          const d = new Date(date);
          const dayName = ['Р’СЃ','РџРЅ','Р’С‚','РЎСЂ','Р§С‚','РџС‚','РЎР±'][d.getDay()];
          result += `РІР‚Сћ ${dayName} ${d.getDate()}: ${dEmoji} ${daily.temperature_2m_min?.[i]}РІР‚В¦${daily.temperature_2m_max?.[i]}Р’В°C`;
          if (daily.precipitation_sum?.[i] > 0) result += ` рџ’§${daily.precipitation_sum[i]}РјРј`;
          result += '\n';
        });
      }
      return result.trim();
    }

    // РІвЂќР‚РІвЂќР‚ Р С™Р С•Р Р…Р Р†Р ВµРЎР‚РЎвЂљР В°РЎвЂ Р С‘РЎРЏ Р Р†Р В°Р В»РЎР‹РЎвЂљ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'convert_currency') {
      const { from, to, amount = 1 } = args;
      aiSseEmit(username, 'log', { icon: 'рџ’±', text: `РљСѓСЂСЃ ${from} в†’ ${to}`, type: 'fetch' });
      const fromU = from.toUpperCase();
      const toU   = to.toUpperCase();
      if (toU === fromU) return `1 ${fromU} = 1 ${toU}`;

      let rate = null;
      let source = '';

      // РІвЂќР‚РІвЂќР‚ API 1: Р В¦Р ВµР Р…РЎвЂљРЎР‚Р В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р вЂР В°Р Р…Р С” Р В Р С•РЎРѓРЎРѓР С‘Р С‘ (Р Т‘Р В»РЎРЏ RUB) РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р СџР ВµРЎР‚Р ВµР Р†Р С•Р Т‘ РЎвЂљР ВµР С”РЎРѓРЎвЂљР В° РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р РЋР С•Р В·Р Т‘Р В°Р Р…Р С‘Р Вµ РЎвЂћР В°Р в„–Р В»Р В° РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'create_file') {
      const { filename, content, description } = args;
      if (!filename || !content) return 'РќРµ СѓРєР°Р·Р°РЅРѕ РёРјСЏ С„Р°Р№Р»Р° РёР»Рё СЃРѕРґРµСЂР¶РёРјРѕРµ';
      aiSseEmit(username, 'log', { icon: 'рџ“„', text: `РЎРѕР·РґР°СЋ С„Р°Р№Р»: ${filename}`, type: 'write' });
      const { fileId, safe } = aiSaveFile(username, filename, content, description);
      return `FILE_CREATED:${fileId}:${safe}:${description || ''}:${content.length}`;
    }

    // РІвЂќР‚РІвЂќР‚ Р С’Р Р…Р В°Р В»Р С‘Р В· Р В°РЎР‚РЎвЂ¦Р С‘Р Р†Р В° РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'analyze_archive') {
      // РђСЂС…РёРІ РїСЂРёС…РѕРґРёС‚ РєР°Рє С‚РµРєСЃС‚РѕРІС‹Р№ С„Р°Р№Р» СЃ Р»РёСЃС‚РёРЅРіРѕРј (РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РїСЂРёР»РѕР¶РёР»)
      const info = args.archive_info || '';
      return `РђРЅР°Р»РёР· Р°СЂС…РёРІР°: ${args.action}. ${info ? 'Р”Р°РЅРЅС‹Рµ РёР· РєРѕРЅС‚РµРєСЃС‚Р°: ' + info.slice(0, 500) : 'РџСЂРёРєСЂРµРїРё Р°СЂС…РёРІ РєР°Рє С„Р°Р№Р» С‡С‚РѕР±С‹ СЏ РјРѕРі РµРіРѕ РїСЂРѕР°РЅР°Р»РёР·РёСЂРѕРІР°С‚СЊ.'}`;
    }

    // РІвЂќР‚РІвЂќР‚ Р вЂњР ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ Р Т‘Р В°Р Р…Р Р…РЎвЂ№РЎвЂ¦ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р С™РЎР‚Р С‘Р С—РЎвЂљР С•Р Р†Р В°Р В»РЎР‹РЎвЂљРЎвЂ№ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
        const arrow  = change > 0 ? 'СЂСџвЂњв‚¬' : 'СЂСџвЂњвЂ°';
        result += `РІР‚Сћ ${coin.toUpperCase()}: $${data.usd?.toLocaleString()} (${change}% ${arrow}) / ${data.rub?.toLocaleString()} РІвЂљР…\n`;
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

    // РІвЂќР‚РІвЂќР‚ Wikipedia Р С—Р С•Р С‘РЎРѓР С” РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'wiki_search') {
      aiSseEmit(username, 'log', { icon: 'СЂСџвЂњвЂ“', text: `Wikipedia: ${args.query}`, type: 'search' });
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

    // РІвЂќР‚РІвЂќР‚ Р С™Р С•РЎвЂљР С‘РЎР‚Р С•Р Р†Р С”Р С‘ Р В°Р С”РЎвЂ Р С‘Р в„– РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
        const arrow  = change > 0 ? 'СЂСџвЂњв‚¬' : change < 0 ? 'СЂСџвЂњвЂ°' : 'РІС›РЋРїС‘РЏ';
        const curr   = meta.currency || 'USD';
        let result = `**${meta.longName || sym} (${sym})**\nР¦РµРЅР°: **${price} ${curr}** ${arrow}`;
        if (change) result += ` (${change > 0 ? '+' : ''}${change}%)`;
        result += `\nР С‹РЅРѕРє: ${meta.exchangeName || ''}`;
        if (meta.marketCap) result += ` В· РљР°РїРёС‚Р°Р»РёР·Р°С†РёСЏ: $${(meta.marketCap/1e9).toFixed(2)}B`;
        return result;
      } catch (e) { return `РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РєРѕС‚РёСЂРѕРІРєСѓ ${sym}: ${e.message}`; }
    }

    // РІвЂќР‚РІвЂќР‚ Р С™Р С•Р Р…Р Р†Р ВµРЎР‚РЎвЂљР В°РЎвЂ Р С‘РЎРЏ РЎвЂЎР В°РЎРѓР С•Р Р†РЎвЂ№РЎвЂ¦ Р С—Р С•РЎРЏРЎРѓР С•Р Р† РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
        return `СЂСџвЂўС’ ${fromTz}: **${source}** (${dateFrom})\nСЂСџвЂўС’ ${toTz}: **${converted}** (${dateTo})`;
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

    // РІвЂќР‚РІвЂќР‚ Р В¦Р Р†Р ВµРЎвЂљР С•Р Р†Р В°РЎРЏ Р С—Р В°Р В»Р С‘РЎвЂљРЎР‚Р В° РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р С™Р С•Р Р…Р Р†Р ВµРЎР‚РЎвЂљР В°РЎвЂ Р С‘РЎРЏ Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ  РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
        'cРІвЂ вЂ™f': v => v*9/5+32, 'fРІвЂ вЂ™c': v => (v-32)*5/9,
        'cРІвЂ вЂ™k': v => v+273.15, 'kРІвЂ вЂ™c': v => v-273.15,
        'fРІвЂ вЂ™k': v => (v-32)*5/9+273.15, 'kРІвЂ вЂ™f': v => (v-273.15)*9/5+32,
      };
      const tKey = `${f}РІвЂ вЂ™${t}`;
      if (tempPairs[tKey]) {
        const r = tempPairs[tKey](value);
        return `**${value}Р’В°${f.toUpperCase()} = ${r.toFixed(4).replace(/\.?0+$/,'')}Р’В°${t.toUpperCase()}**`;
      }
      if (conv[f] && conv[t]) {
        const base   = value * conv[f];
        const result = base / conv[t];
        const fmt = n => Math.abs(n) < 0.001 ? n.toExponential(4) : parseFloat(n.toFixed(6)).toString();
        return `**${value} ${from} = ${fmt(result)} ${to}**`;
      }
      return `РќРµ Р·РЅР°СЋ РєР°Рє РєРѕРЅРІРµСЂС‚РёСЂРѕРІР°С‚СЊ ${from} в†’ ${to}`;
    }

    // РІвЂќР‚РІвЂќР‚ Р РЋР В»Р С•Р Р†Р В°РЎР‚РЎРЉ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
        return `СЂСџвЂњвЂ“ **${entry.word}** ${phonetic}\n\n${meanings}`;
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

    // РІвЂќР‚РІвЂќР‚ Р СџРЎР‚РЎРЏР СР С•Р в„– Р В·Р В°Р С—РЎС“РЎРѓР С” Р С”Р С•Р Т‘Р В° РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Regex РЎвЂљР ВµРЎРѓРЎвЂљ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р С™Р С•Р Т‘Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ/Р Т‘Р ВµР С”Р С•Р Т‘Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ JSON РЎвЂћР С•РЎР‚Р СР В°РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р СџРЎР‚Р С•Р Р†Р ВµРЎР‚Р С”Р В° Р С‘ Р В·Р В°Р С—РЎС“РЎРѓР С” Р С”Р С•Р Т‘Р В° РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р СњР С•Р Р†Р С•РЎРѓРЎвЂљР С‘ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р РЋР С•Р В·Р Т‘Р В°Р Р…Р С‘Р Вµ Р С—РЎР‚Р ВµР В·Р ВµР Р…РЎвЂљР В°РЎвЂ Р С‘Р С‘ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р РЋР В»РЎС“РЎвЂЎР В°Р в„–Р Р…РЎвЂ№Р Вµ Р Т‘Р В°Р Р…Р Р…РЎвЂ№Р Вµ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'random') {
      const { type, min=1, max=100, count=1, length=16 } = args;
      const crypto = require('crypto');
      switch(type) {
        case 'number': {
          const nums = Array.from({length:count}, () => Math.floor(Math.random()*(max-min+1))+min);
          return `рџЋІ РЎР»СѓС‡Р°Р№РЅ${count>1?'С‹Рµ С‡РёСЃР»Р°':'РѕРµ С‡РёСЃР»Рѕ'}: **${nums.join(', ')}**`;
        }
        case 'uuid':    return `СЂСџвЂќвЂ UUID: \`${crypto.randomUUID()}\``;
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

    // РІвЂќР‚РІвЂќР‚ Р вЂ™РЎвЂ№РЎвЂЎР С‘РЎРѓР В»Р ВµР Р…Р С‘РЎРЏ РЎРѓ Р Т‘Р В°РЎвЂљР В°Р СР С‘ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
          return `СЂСџвЂњвЂ¦ ${d1.toLocaleDateString('ru-RU')} РІР‚вЂќ **${days_ru[d1.getDay()]}**`;
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

    // РІвЂќР‚РІвЂќР‚ Р С’Р Р…Р В°Р В»Р С‘Р В· РЎвЂљР ВµР С”РЎРѓРЎвЂљР В° РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
          const lines = top.map(([w,c]) => 'РІР‚Сћ **' + w + '**: ' + c);
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

    // РІвЂќР‚РІвЂќР‚ Р СџРЎР‚Р С•Р Т‘Р Р†Р С‘Р Р…РЎС“РЎвЂљР В°РЎРЏ Р СР В°РЎвЂљР ВµР СР В°РЎвЂљР С‘Р С”Р В° РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ IP Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘РЎРЏ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'ip_info') {
      const ip = args.ip === 'my' ? '' : args.ip;
      try {
        const r = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 6000 });
        const d = r.data;
        if (d.error) return `IP РЅРµ РЅР°Р№РґРµРЅ: ${d.reason}`;
        return `СЂСџРЉРЊ IP: **${d.ip}**
вЂў РЎС‚СЂР°РЅР°: **${d.country_name}** ${d.country_code}
вЂў Р“РѕСЂРѕРґ: ${d.city}, ${d.region}
вЂў РџСЂРѕРІР°Р№РґРµСЂ: ${d.org}
вЂў РљРѕРѕСЂРґРёРЅР°С‚С‹: ${d.latitude}, ${d.longitude}
вЂў РўРёРї: ${d.type || 'РќРµРёР·РІРµСЃС‚РЅРѕ'}`;
      } catch(e) { return `РћС€РёР±РєР°: ${e.message}`; }
    }

    // РІвЂќР‚РІвЂќР‚ Р РЋР В»РЎС“РЎвЂЎР В°Р в„–Р Р…РЎвЂ№Р Вµ Р Т‘Р В°Р Р…Р Р…РЎвЂ№Р Вµ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
    // РІвЂќР‚РІвЂќР‚ Р вЂ™РЎвЂ№РЎвЂЎР С‘РЎРѓР В»Р ВµР Р…Р С‘РЎРЏ РЎРѓ Р Т‘Р В°РЎвЂљР В°Р СР С‘ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
    // РІвЂќР‚РІвЂќР‚ Р С’Р Р…Р В°Р В»Р С‘Р В· РЎвЂљР ВµР С”РЎРѓРЎвЂљР В° РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'text_analyze') {
      const { text, action } = args;
      if (action === 'stats') { const w=text.trim().split(/\s+/).filter(Boolean); const s=text.split(/[.!?]+/).filter(Boolean); return `РЎРёРјРІРѕР»РѕРІ: **${text.length}**, РЎР»РѕРІ: **${w.length}**, РџСЂРµРґР»РѕР¶РµРЅРёР№: **${s.length}**, РЎСЂРµРґРЅ. СЃР»РѕРІ/РїСЂРµРґР»: **${(w.length/Math.max(s.length,1)).toFixed(1)}**`; }
      if (action === 'frequency') { const w=text.toLowerCase().replace(/[^Р°-СЏС‘a-z\s]/gi,'').split(/\s+/).filter(x=>x.length>2); const f={}; w.forEach(x=>f[x]=(f[x]||0)+1); const top=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,8); return `РўРѕРї СЃР»РѕРІ:\n${top.map(([w,c])=>`вЂў **${w}**: ${c}`).join('\n')}`; }
      if (action === 'sentiment') { const p=(text.match(/С…РѕСЂРѕС€Рѕ|РѕС‚Р»РёС‡РЅРѕ|Р·Р°РјРµС‡Р°С‚РµР»СЊРЅРѕ|Р»СЋР±Р»СЋ|РЅСЂР°РІРёС‚СЃСЏ|great|good|love|excellent|amazing/gi)||[]).length; const n=(text.match(/РїР»РѕС…Рѕ|СѓР¶Р°СЃРЅРѕ|РЅРµРЅР°РІРёР¶Сѓ|bad|terrible|hate|fail|awful/gi)||[]).length; return `РўРѕРЅР°Р»СЊРЅРѕСЃС‚СЊ: **${p>n?'рџЉ РџРѕР·РёС‚РёРІРЅС‹Р№':n>p?'рџ” РќРµРіР°С‚РёРІРЅС‹Р№':'рџђ РќРµР№С‚СЂР°Р»СЊРЅС‹Р№'}** (+ ${p}, - ${n})`; }
      return `РўРµРєСЃС‚: ${text.length} СЃРёРјРІРѕР»РѕРІ`;
    }
    // РІвЂќР‚РІвЂќР‚ Р СџРЎР‚Р С•Р Т‘Р Р†Р С‘Р Р…РЎС“РЎвЂљР В°РЎРЏ Р СР В°РЎвЂљР ВµР СР В°РЎвЂљР С‘Р С”Р В° РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'math_advanced') {
      const { operation, values=[], n=10 } = args;
      if (operation === 'prime') { const ip=x=>{if(x<2)return false;for(let i=2;i<=Math.sqrt(x);i++)if(x%i===0)return false;return true;}; const p=[];for(let i=2;p.length<n;i++)if(ip(i))p.push(i); return `РџСЂРѕСЃС‚С‹Рµ С‡РёСЃР»Р° (${n}): **${p.join(', ')}**`; }
      if (operation === 'fibonacci') { const f=[0,1];while(f.length<n)f.push(f[f.length-1]+f[f.length-2]); return `Р§РёСЃР»Р° Р¤РёР±РѕРЅР°С‡С‡Рё: **${f.join(', ')}**`; }
      if (operation === 'factorial') { const num=n||values[0]||10; let r=1n; for(let i=2n;i<=BigInt(Math.min(num,20));i++)r*=i; return `${Math.min(num,20)}! = **${r}**`; }
      if (operation === 'gcd') { const gcd=(a,b)=>b?gcd(b,a%b):a; return `РќРћР”(${values.join(',')}) = **${values.reduce(gcd)}**`; }
      if (operation === 'statistics' && values.length) { const s=[...values].sort((a,b)=>a-b); const m=values.reduce((a,b)=>a+b)/values.length; const med=s.length%2?s[Math.floor(s.length/2)]:(s[s.length/2-1]+s[s.length/2])/2; const std=Math.sqrt(values.reduce((a,b)=>a+(b-m)**2,0)/values.length); return `РЎСЂРµРґРЅРµРµ: **${m.toFixed(3)}**, РњРµРґРёР°РЅР°: **${med}**, РњРёРЅ: **${s[0]}**, РњР°РєСЃ: **${s[s.length-1]}**, РЎС‚.РѕС‚РєР»: **${std.toFixed(3)}**`; }
      return `РћРїРµСЂР°С†РёСЏ ${operation} РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ`;
    }
    // РІвЂќР‚РІвЂќР‚ IP Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘РЎРЏ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'ip_info') {
      try {
        const ip = args.ip === 'my' ? '' : (args.ip || '');
        const r = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 6000 });
        const d = r.data;
        if (d.error) return `IP РЅРµ РЅР°Р№РґРµРЅ: ${d.reason}`;
        return `IP: **${d.ip}** В· РЎС‚СЂР°РЅР°: **${d.country_name}** В· Р“РѕСЂРѕРґ: ${d.city} В· РџСЂРѕРІР°Р№РґРµСЂ: ${d.org}`;
      } catch(e) { return `РћС€РёР±РєР°: ${e.message}`; }
    }
    // РІвЂќР‚РІвЂќР‚ Р вЂ™Р ВµР В± РЎРѓР С”РЎР‚Р ВµР в„–Р С—Р С‘Р Р…Р С– РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р С™Р С•Р Р…Р Р†Р ВµРЎР‚РЎвЂљР В°РЎвЂ Р С‘РЎРЏ РЎвЂћР С•РЎР‚Р СР В°РЎвЂљР С•Р Р† РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'file_convert') {
      const { content, from_format, to_format } = args;
      aiSseEmit(username, 'log', { text: `РљРѕРЅРІРµСЂС‚РёСЂСѓСЋ ${from_format} в†’ ${to_format}`, type: 'process' });
      try {
        const ff = from_format.toLowerCase(), tf = to_format.toLowerCase();
        // CSV РІвЂ вЂ™ JSON
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
        // JSON РІвЂ вЂ™ CSV
        if (ff === 'json' && tf === 'csv') {
          const data = JSON.parse(content);
          const arr  = Array.isArray(data) ? data : [data];
          const headers = [...new Set(arr.flatMap(o => Object.keys(o)))];
          const csv = [headers.join(','), ...arr.map(row => headers.map(h => JSON.stringify(row[h]??'')).join(','))].join('\n');
          const { fileId, safe } = aiSaveFile(username, 'converted.csv', csv, `JSONв†’CSV (${arr.length} СЃС‚СЂРѕРє)`);
          return `FILE_CREATED:${fileId}:${safe}:JSONв†’CSV (${arr.length} СЃС‚СЂРѕРє):${csv.length}`;
        }
        // Markdown РІвЂ вЂ™ HTML
        if (ff === 'markdown' || ff === 'md') {
          const html3 = content
            .replace(/^# (.+)$/gm,'<h1>$1</h1>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^### (.+)$/gm,'<h3>$1</h3>')
            .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>')
            .replace(/\`(.+?)\`/g,'<code>$1</code>').replace(/^- (.+)$/gm,'<li>$1</li>').replace(/\n\n/g,'</p><p>');
          const full = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;max-width:800px;margin:2em auto;line-height:1.6}code{background:#f4f4f4;padding:2px 6px;border-radius:4px}</style></head><body><p>${html3}</p></body></html>`;
          const { fileId, safe } = aiSaveFile(username, 'converted.html', full, 'MarkdownРІвЂ вЂ™HTML');
          return `FILE_CREATED:${fileId}:${safe}:MarkdownРІвЂ вЂ™HTML:${full.length}`;
        }
        return `РљРѕРЅРІРµСЂС‚Р°С†РёСЏ ${ff}в†’${tf} РїРѕРєР° РЅРµ РїРѕРґРґРµСЂР¶РёРІР°РµС‚СЃСЏ`;
      } catch(e) { return `РћС€РёР±РєР° РєРѕРЅРІРµСЂС‚Р°С†РёРё: ${e.message}`; }
    }

    // РІвЂќР‚РІвЂќР‚ Р вЂќР С‘Р В°Р С–РЎР‚Р В°Р СР СРЎвЂ№ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
          return `СЂСџР‹В¤ **${a?.name}**
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

    // РІвЂќР‚РІвЂќР‚ Р В Р ВµРЎвЂ Р ВµР С—РЎвЂљРЎвЂ№ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
        const ingrList = ingr.map(ing => 'РІР‚Сћ ' + ing).join('\n');
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

    // РІвЂќР‚РІвЂќР‚ Р СџР С•Р С‘РЎРѓР С” РЎРЊР СР С•Р Т‘Р В·Р С‘ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'emoji_search') {
      const q = args.query.toLowerCase();
      const count = Math.min(args.count || 10, 30);
      const emojiDB = {
        'СЃС‡Р°СЃС‚СЊРµ|СЂР°РґРѕСЃС‚СЊ|СѓР»С‹Р±РєР°|smile|happy': ['рџЉ','рџ„','рџѓ','рџЃ','рџҐ°','рџЌ','рџ¤©','рџ†','рџ‚','рџҐі'],
        'РіСЂСѓСЃС‚СЊ|РїРµС‡Р°Р»СЊ|РїР»Р°РєР°С‚СЊ|sad|cry': ['рџў','рџ­','рџ”','рџћ','рџҐє','рџї','рџ’”','рџЄ','рџ™Ѓ','рџџ'],
        'Р С•Р С–Р С•Р Р…РЎРЉ|fire|Р В¶Р В°РЎР‚Р С”Р С•|hot': ['СЂСџвЂќТђ','СЂСџРЉВ¶РїС‘РЏ','РІв„ўРЃРїС‘РЏ','СЂСџТђВµ','СЂСџвЂ™Тђ','РІСљРЃ','РІС™РЋ','СЂСџРЉСџ'],
        'СЃРµСЂРґС†Рµ|Р»СЋР±РѕРІСЊ|love|heart': ['вќ¤пёЏ','рџ’•','рџ’–','рџ’—','рџ’“','рџ’ћ','рџ’ќ','рџ«¶','рџ’‘','рџ’Џ'],
        'Р ВµР Т‘Р В°|food|Р Р†Р С”РЎС“РЎРѓР Р…Р С•|yummy': ['СЂСџРЊвЂў','СЂСџРЊвЂќ','СЂСџРЊСџ','СЂСџРЉВ®','СЂСџРЊСљ','СЂСџРЊВ±','СЂСџРЊР€','СЂСџРЊВ°','СЂСџР‹вЂљ','СЂСџРЊВ©'],
        'РєРѕС‚|РєРѕС€РєР°|cat': ['рџђ±','рџё','рџ»','рџђ€','рџђѕ','рџ¦Ѓ','рџђЇ'],
        'СЃРѕР±Р°РєР°|РїС‘СЃ|dog': ['рџђ¶','рџђ•','рџ¦®','рџђ©','рџђѕ'],
        'Р С—РЎР‚Р С‘РЎР‚Р С•Р Т‘Р В°|nature|Р Т‘Р ВµРЎР‚Р ВµР Р†Р С•|tree': ['СЂСџРЉР†','СЂСџРЉС–','СЂСџРЉС—','СЂСџРЊР‚','СЂСџРЉС‘','СЂСџРЉС”','СЂСџРЉВ»','СЂСџРЊРѓ','СЂСџРЉР‰','СЂСџРЏвЂќРїС‘РЏ'],
        'РґРµРЅСЊРіРё|money|Р±РѕРіР°С‚СЃС‚РІРѕ': ['рџ’°','рџ’µ','рџ’ё','рџ¤‘','рџ’Ћ','рџЏ†','рџЋ°'],
        'РјСѓР·С‹РєР°|music|РЅРѕС‚Р°': ['рџЋµ','рџЋ¶','рџЋё','рџЋ№','рџЋє','рџЋ»','рџҐЃ','рџЋ¤','рџЋ§','рџЋј'],
        'РЎРѓР С—Р С•РЎР‚РЎвЂљ|sport|РЎвЂћРЎС“РЎвЂљР В±Р С•Р В»': ['РІС™Р…','СЂСџРЏР‚','СЂСџР‹С•','СЂСџРЏвЂ№РїС‘РЏ','СЂСџС™Т‘','СЂСџРЏР‰','СЂСџР‹Р‡','СЂСџРЏвЂ ','РІВ­С’','СЂСџТђвЂЎ'],
      };
      let found = [];
      for (const [keys, emojis] of Object.entries(emojiDB)) {
        if (keys.split('|').some(k => q.includes(k) || k.includes(q))) {
          found.push(...emojis);
        }
      }
      if (!found.length) found = ['СЂСџВР‰','СЂСџвЂРЊ','РІСњВ¤РїС‘РЏ','СЂСџвЂќТђ','РІСљРЃ','СЂСџвЂ™Р„','СЂСџР‹вЂ°','СЂСџВ¤вЂќ','СЂСџвЂ™РЋ','РІВ­С’'];
      return `Р­РјРѕРґР·Рё РґР»СЏ "${args.query}": ${found.slice(0,count).join(' ')}`;
    }

    // РІвЂќР‚РІвЂќР‚ Р РЋРЎвЂљР С‘РЎвЂ¦Р С‘ Р С‘ РЎвЂљР ВµР С”РЎРѓРЎвЂљРЎвЂ№ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р СљР В°РЎвЂљР ВµР СР В°РЎвЂљР С‘Р С”Р В° РЎРѓ РЎв‚¬Р В°Р С–Р В°Р СР С‘ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р РЋРЎР‚Р В°Р Р†Р Р…Р ВµР Р…Р С‘Р Вµ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ run_code РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ get_stock РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ reminder РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'reminder') {
      const { text, label = 'note' } = args;
      aiSseEmit(username, 'log', { icon: 'рџ“Њ', text: `Р—Р°РјРµС‚РєР° СЃРѕС…СЂР°РЅРµРЅР°`, type: 'write' });
      const icons = { reminder: 'РІРЏВ°', note: 'СЂСџвЂњСњ', todo: 'РІСљвЂ¦' };
      return `${icons[label] || 'рџ“Њ'} РЎРѕС…СЂР°РЅРµРЅРѕ: "${text}"`;
    }

    // РІвЂќР‚РІвЂќР‚ summarize_url РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'summarize_url') {
      const { url } = args;
      aiSseEmit(username, 'log', { icon: 'рџЊђ', text: `РћС‚РєСЂС‹РІР°СЋ: ${url.slice(0,40)}...`, type: 'fetch' });
      try {
        const r = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' }, maxContentLength: 500000 });
        const text = r.data.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
        return `РЎРѕРґРµСЂР¶РёРјРѕРµ ${url}:\n\n${text.slice(0, 2000)}${text.length > 2000 ? '...(РѕР±СЂРµР·Р°РЅРѕ)' : ''}`;
      } catch(e) { return `РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ ${url}: ${e.message}`; }
    }

    // РІвЂќР‚РІвЂќР‚ get_news РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
          return `РІР‚Сћ ${title} (${date.slice(0,16)})`;
        }).join('\n');
        return `РќРѕРІРѕСЃС‚Рё РїРѕ С‚РµРјРµ "${query}":\n${news || 'РќРѕРІРѕСЃС‚Рё РЅРµ РЅР°Р№РґРµРЅС‹'}`;
      } catch(e) { return `РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РЅРѕРІРѕСЃС‚РµР№: ${e.message}`; }
    }

    // РІвЂќР‚РІвЂќР‚ qr_code РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ Р вЂ™Р С•Р С—РЎР‚Р С•РЎРѓ Р С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»РЎР‹ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'ask_user') {
      // РџРѕРґРґРµСЂР¶РёРІР°РµРј РѕР±Р° С„РѕСЂРјР°С‚Р°: { questions: [...] } Рё СЃС‚Р°СЂС‹Р№ { question, options }
      let questions = args.questions;
      if (!questions) {
        // РЎРѕРІРјРµСЃС‚РёРјРѕСЃС‚СЊ СЃРѕ СЃС‚Р°СЂС‹Рј С„РѕСЂРјР°С‚РѕРј
        questions = [{ question: args.question || '', options: args.options || [], allow_custom: args.allow_custom, required: true }];
      }
      return `ASK_USER:${JSON.stringify({ questions })}`;
    }

    // РІвЂќР‚РІвЂќР‚ hash_text РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'hash_text') {
      const { text, algorithm = 'sha256' } = args;
      const alg = ['md5','sha1','sha256','sha512'].includes(algorithm.toLowerCase()) ? algorithm.toLowerCase() : 'sha256';
      const hash = require('crypto').createHash(alg).update(String(text)).digest('hex');
      return `**${alg.toUpperCase()}:** \`${hash}\``;
    }

    // РІвЂќР‚РІвЂќР‚ password_check РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
      const details = checks.map(c => (c.ok ? 'РІСљвЂ¦' : 'РІСњРЉ') + ' ' + c.msg).join('\n');
      return '**РџР°СЂРѕР»СЊ:** `' + password + '`\n**РЈСЂРѕРІРµРЅСЊ:** ' + level + ' (' + score + '/6)\n\n' + details;
    }

    // РІвЂќР‚РІвЂќР‚ cron_explain РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ diff_text РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ number_facts РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'number_facts') {
      const { number = 42, type: ft = 'trivia' } = args;
      try {
        const r = await axios.get('http://numbersapi.com/' + number + '/' + ft + '?json', { timeout: 6000 });
        return 'СЂСџвЂќСћ **' + number + '**: ' + (r.data.text || JSON.stringify(r.data));
      } catch { return 'рџ”ў ' + number + ' вЂ” РІРІРµРґРё С‡РёСЃР»Рѕ С‡С‚РѕР±С‹ СѓР·РЅР°С‚СЊ С„Р°РєС‚ Рѕ РЅС‘Рј'; }
    }

    // РІвЂќР‚РІвЂќР‚ timezone_now РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'timezone_now') {
      const cityTz = { 'РјРѕСЃРєРІР°':'Europe/Moscow','РїРёС‚РµСЂ':'Europe/Moscow','С‚РѕРєРёРѕ':'Asia/Tokyo','РЅСЊСЋ-Р№РѕСЂРє':'America/New_York','Р»РѕРЅРґРѕРЅ':'Europe/London','Р±РµСЂР»РёРЅ':'Europe/Berlin','РїРµРєРёРЅ':'Asia/Shanghai','РґСѓР±Р°Р№':'Asia/Dubai','СЃРёРґРЅРµР№':'Australia/Sydney','РїР°СЂРёР¶':'Europe/Paris','Р»РѕСЃ-Р°РЅРґР¶РµР»РµСЃ':'America/Los_Angeles','СЃРµСѓР»':'Asia/Seoul','СЃРёРЅРіР°РїСѓСЂ':'Asia/Singapore','Р±Р°РЅРіРєРѕРє':'Asia/Bangkok','СЃС‚Р°РјР±СѓР»':'Europe/Istanbul' };
      const cities = (args.cities || 'РњРѕСЃРєРІР°,Р›РѕРЅРґРѕРЅ,РўРѕРєРёРѕ,РќСЊСЋ-Р™РѕСЂРє').split(',').map(c => c.trim());
      const now = new Date();
      return cities.map(city => {
        const tz = cityTz[city.toLowerCase()] || 'UTC';
        const time = now.toLocaleTimeString('ru-RU', { timeZone: tz, hour:'2-digit', minute:'2-digit', hour12: false });
        const date = now.toLocaleDateString('ru-RU', { timeZone: tz, day:'2-digit', month:'short' });
        return 'СЂСџвЂўС’ **' + city + '**: ' + time + ' (' + date + ')';
      }).join('\n');
    }

    // РІвЂќР‚РІвЂќР‚ lorem_ipsum РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ ascii_art РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    if (name === 'ascii_art') {
      const { text = 'AURA', style = 'block' } = args;
      const t = text.toUpperCase().trim().slice(0, 20);
      if (style === 'shadow') {
        return '```\n' + t.split('').map(c => 'РІвЂ“вЂРІвЂ“вЂ™РІвЂ“вЂњРІвЂ“в‚¬' + c + 'РІвЂ“в‚¬РІвЂ“вЂњРІвЂ“вЂ™РІвЂ“вЂ').join(' ') + '\n```';
      }
      if (style === 'banner') {
        const border = 'РІвЂўС’'.repeat(t.length * 3 + 4);
        return '```\nРІвЂўвЂќ' + border + 'РІвЂўвЂ”\nРІвЂўвЂ  ' + t.split('').join('  ') + '  РІвЂўвЂ\nРІвЂўС™' + border + 'РІвЂўСњ\n```';
      }
      const bar = 'РІвЂ“в‚¬'.repeat(t.length * 2 + 2);
      return '```\nРІвЂ“в‚¬РІвЂ“Р‚' + bar + 'РІвЂ“Р‚РІвЂ“в‚¬\nРІвЂ“в‚¬ ' + t.split('').join(' ') + ' РІвЂ“в‚¬\nРІвЂ“в‚¬РІвЂ“вЂћ' + bar + 'РІвЂ“вЂћРІвЂ“в‚¬\n```';
    }

    // РІвЂќР‚РІвЂќР‚ markdown_preview РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

    // РІвЂќР‚РІвЂќР‚ sql_format РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
        .replace(/[^a-zР°-СЏС‘0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
      return slug || 'n-a';
    }

    if (name === 'csv_to_json') {
      const csv = String(args.csv || '').trim();
      if (!csv) return 'CSV РїСѓСЃС‚РѕР№';
      const lines = csv.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return 'РќСѓР¶РЅРѕ РјРёРЅРёРјСѓРј 2 СЃС‚СЂРѕРєРё CSV: Р·Р°РіРѕР»РѕРІРѕРє Рё РґР°РЅРЅС‹Рµ';
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
      if (!Array.isArray(parsed) || !parsed.length) return 'JSON РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµРїСѓСЃС‚С‹Рј РјР°СЃСЃРёРІРѕРј РѕР±СЉРµРєС‚РѕРІ';
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

// РІвЂќР‚РІвЂќР‚ /api/ai-chat РІР‚вЂќ Р С•РЎРѓР Р…Р С•Р Р†Р Р…Р С•Р в„– РЎРЊР Р…Р Т‘Р С—Р С•Р С‘Р Р…РЎвЂљ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
// РІвЂќР‚РІвЂќР‚ MiniMax (Aura AI) API call РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
      let rawFull = '';
      let streamBuf = '';
      let inThink = false;
      let thinkAccum = '';
      const flushThink = () => {
        const t = thinkAccum.replace(/\s+/g, ' ').trim();
        if (t) onChunk?.('__THINK__' + t.slice(-220));
        thinkAccum = '';
      };

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
              rawFull += delta;
              streamBuf += delta;

              while (streamBuf.length) {
                if (inThink) {
                  const endIdx = streamBuf.toLowerCase().indexOf('</think>');
                  if (endIdx === -1) {
                    thinkAccum += streamBuf;
                    if (thinkAccum.length > 240 || /\n/.test(thinkAccum)) flushThink();
                    streamBuf = '';
                  } else {
                    thinkAccum += streamBuf.slice(0, endIdx);
                    flushThink();
                    streamBuf = streamBuf.slice(endIdx + 8);
                    inThink = false;
                  }
                } else {
                  const startIdx = streamBuf.toLowerCase().indexOf('<think>');
                  if (startIdx === -1) {
                    onChunk?.(streamBuf);
                    streamBuf = '';
                  } else {
                    const ans = streamBuf.slice(0, startIdx);
                    if (ans) onChunk?.(ans);
                    streamBuf = streamBuf.slice(startIdx + 7);
                    inThink = true;
                  }
                }
              }
            } catch {}
          }
        });
        resp.data.on('end', resolve);
        resp.data.on('error', reject);
      });

      if (thinkAccum.trim()) flushThink();
      const finalContent = aiDedupeRepeatedText(rawFull.replace(/<think>[\s\S]*?<\/think>/gi, '').trim());
      if (!finalContent) { console.warn('[MiniMax] Only thought, no reply'); continue; }
      return finalContent;
      console.warn('[MiniMax] Empty content from', ep.model, 'РІР‚вЂќ raw:', JSON.stringify(data).slice(0, 300));
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

// РІвЂќР‚РІвЂќР‚ GET AI chat history РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

// РІвЂќР‚РІвЂќР‚ /api/ai-settings РІР‚вЂќ Р С—Р ВµРЎР‚Р ВµР С”Р В»РЎР‹РЎвЂЎР ВµР Р…Р С‘Р Вµ РЎР‚Р ВµР В¶Р С‘Р СР С•Р Р† РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
app.post('/api/ai-settings', (req, res) => {
  const { username, thinking, multiagent } = req.body;
  if (!username) return res.status(400).json({ error: 'no username' });
  const sess = aiGetSession(username);
  if (thinking   !== undefined) sess.thinking   = !!thinking;
  if (multiagent !== undefined) sess.multiagent = !!multiagent;
  res.json({ ok: true, thinking: sess.thinking, multiagent: sess.multiagent });
});

app.get('/api/ai-settings/:username', (req, res) => {
  const username = req.params.username;
  if (!username) return res.status(400).json({ error: 'no username' });
  const sess = aiGetSession(username);
  res.json({ ok: true, thinking: !!sess.thinking, multiagent: !!sess.multiagent });
});

app.post('/api/ai-chat', async (req, res) => {
  const { username, message, imageData, imageType, fileName, fileContent, model: selectedModel, omniUrl } = req.body;
  const useAuraAI = selectedModel === 'minimax';
  const useOR     = selectedModel && OR_MODELS[selectedModel]; // OmniRouter РјРѕРґРµР»СЊ
  const omniBaseUrl = String(omniUrl || OMNIROUTER_API_URL || '').trim();
  console.log('[AI Chat] selectedModel=', selectedModel, 'useOR=', !!useOR, 'OMNIROUTER_API_URL=', omniBaseUrl);
  if (!username) return res.status(400).json({ error: 'РќРµС‚ username' });
  if (!message?.trim() && !imageData && !fileContent) return res.status(400).json({ error: 'РќРµС‚ СЃРѕРѕР±С‰РµРЅРёСЏ' });

  const session = aiGetSession(username);
  const { history } = session;
  session.msgCount++;
  aiTickFiles(username);
  const nowTs = Date.now();
  if (!session.pendingAsk && message?.trim()) {
    session.taskId = (session.taskId || 0) + 1;
    session.taskAskCount = 0;
    session.taskUpdatedAt = nowTs;
  }
  if (session.pendingAsk && message?.trim()) {
    session.taskUpdatedAt = nowTs;
  }

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
  let askReplyContext = '';
  if (session.pendingAsk && message?.trim()) {
    const qs = (session.pendingAsk.questions || []).slice(0, 3).map((q, i) => `${i + 1}. ${q.question}`).join('\n');
    askReplyContext = `\n\n[РћС‚РІРµС‚С‹ РЅР° РїРѕСЃР»РµРґРЅРµРµ СѓС‚РѕС‡РЅРµРЅРёРµ]\nР’РѕРїСЂРѕСЃС‹:\n${qs}\nРћС‚РІРµС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ:\n${message.trim()}\n[/РћС‚РІРµС‚С‹ РЅР° РїРѕСЃР»РµРґРЅРµРµ СѓС‚РѕС‡РЅРµРЅРёРµ]`;
    session.pendingAsk = null;
  }
  if (imageData) {
    userContent = [
      { type: 'text', text: (message?.trim() || 'РџСЂРѕР°РЅР°Р»РёР·РёСЂСѓР№ СЌС‚Рѕ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РїРѕРґСЂРѕР±РЅРѕ') + askReplyContext },
      { type: 'image_url', image_url: { url: `data:${imageType || 'image/jpeg'};base64,${imageData}` } }
    ];
  } else if (fileContent) {
    const isArchive = /\.(zip|tar|gz|rar|7z)$/i.test(fileName || '');
    const preview = fileContent.slice(0, 10000);
    const fileType = isArchive ? 'Р°СЂС…РёРІ' : 'С„Р°Р№Р»';
    userContent = `рџ“Ћ ${fileType}: **${fileName || 'file'}**\n\`\`\`\n${preview}${fileContent.length > 10000 ? '\n...(РѕР±СЂРµР·Р°РЅРѕ)' : ''}\n\`\`\`\n\n${message?.trim() || (isArchive ? 'РџСЂРѕР°РЅР°Р»РёР·РёСЂСѓР№ СЌС‚РѕС‚ Р°СЂС…РёРІ' : 'РџСЂРѕР°РЅР°Р»РёР·РёСЂСѓР№ СЌС‚РѕС‚ С„Р°Р№Р»')}${askReplyContext}`;
  } else {
    let ctx = msgText + askReplyContext;
    if (currentFiles.length) ctx += `\n\n[Р¤Р°Р№Р»С‹ РІ Р±Р°Р·Рµ: ${currentFiles.map(f => f.name + '(' + f.ttl + 'РѕС‚РІ)').join(', ')}]`;
    userContent = ctx;
  }

  history.push({ role: 'user', content: userContent });
  while (history.length > AI_MAX_HISTORY) history.shift();

  try {
    const isDebug  = session.debugMode;
    const sendAskUser = (askData, tools = ['ask_user'], createdFiles = []) => {
      if (!askData?.questions?.length) return null;
      const trimmed = { ...askData, questions: askData.questions.slice(0, 3) };
      const askSig = JSON.stringify(trimmed.questions.map(q => ({ q: q.question, o: q.options || [] })));
      const now = Date.now();
      if ((session.taskAskCount || 0) >= 1) {
        aiSseEmit(username, 'log', { agent: 'aura', type: 'result', text: 'Р›РёРјРёС‚ СѓС‚РѕС‡РЅРµРЅРёР№ РґРѕСЃС‚РёРіРЅСѓС‚, РїСЂРѕРґРѕР»Р¶Р°СЋ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ.' });
        return null;
      }
      if (session.pendingAsk && (now - session.lastAskAt) < 180000) {
        aiSseEmit(username, 'done', {});
        return res.json({ success: true, reply: 'РћС‚РІРµС‚СЊ РЅР° С‚РµРєСѓС‰РёР№ РІРѕРїСЂРѕСЃ РІС‹С€Рµ, Р·Р°С‚РµРј РїСЂРѕРґРѕР»Р¶РёРј Р·Р°РґР°С‡Сѓ Р±РµР· РЅРѕРІС‹С… СѓС‚РѕС‡РЅРµРЅРёР№.', toolsUsed: tools, createdFiles, askUser: session.pendingAsk });
      }
      // РђРЅС‚Рё-СЃРїР°Рј РѕРґРёРЅР°РєРѕРІС‹С… РІРѕРїСЂРѕСЃРѕРІ РІ РєРѕСЂРѕС‚РєРѕРј РѕРєРЅРµ
      if (session.lastAskHash === askSig && (now - session.lastAskAt) < 90000) {
        return res.json({ success: true, reply: 'РЈС‚РѕС‡РЅРµРЅРёРµ СѓР¶Рµ РѕС‚РїСЂР°РІР»РµРЅРѕ. РћС‚РІРµС‚СЊ РЅР° РІРѕРїСЂРѕСЃ РІС‹С€Рµ, Рё РјС‹ РїСЂРѕРґРѕР»Р¶РёРј.', toolsUsed: tools, createdFiles });
      }
      session.lastAskHash = askSig;
      session.lastAskAt = now;
      session.pendingAsk = trimmed;
      session.taskAskCount = (session.taskAskCount || 0) + 1;
      aiSseEmit(username, 'ask_user', trimmed);
      aiSseEmit(username, 'done', {});
      scheduleAiConvSave();
      return res.json({ success: true, reply: '', toolsUsed: tools, createdFiles, askUser: trimmed });
    };

    // в”Ђв”Ђ Р РµР°Р»СЊРЅС‹Р№ multi-agent pipeline в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    // Coordinator: Aura (MiniMax M2.7) -> Coder: Qwen3 Coder Plus -> Visual: Qwen Vision/Mistral -> Final: Aura
    if (session.multiagent) {
      const plainUserText = message?.trim() || (typeof userContent === 'string' ? userContent : 'Р—Р°РґР°С‡Р° Р±РµР· С‚РµРєСЃС‚Р°');
      const thinkingHint = session.thinking ? 'Thinking mode ON: РґРµР»Р°Р№ Р±РѕР»РµРµ РіР»СѓР±РѕРєСѓСЋ РїСЂРѕРІРµСЂРєСѓ Рё СЃРІРµСЂРєСѓ РїРµСЂРµРґ С„РёРЅР°Р»РѕРј.' : '';
      let plannerOut = '';
      let contract = aiBuildDefaultContract(plainUserText);
      let coderOut = '';
      let visualOut = '';
      let finalOut = '';
      const emitAgentLog = (agent, icon, text, type = 'process') => {
        aiSseEmit(username, 'log', { agent, icon, text, type });
      };
      const emitAgentStatus = (agent, status, text) => {
        aiSseEmit(username, 'agent_status', { agent, status, text: text || '' });
      };
      const emitAgentRelation = (from, to, action, note = '') => {
        aiSseEmit(username, 'log', {
          agent: from,
          type: 'relation',
          text: `[${String(from).toUpperCase()} -> ${String(to).toUpperCase()}] ${action}${note ? `: ${note}` : ''}`
        });
      };
      const makeThoughtStreamer = (agent, label) => {
        let buf = '';
        let lastEmitAt = 0;
        let emitted = 0;
        const MAX_EMIT = 6;
        const flush = () => {
          if (emitted >= MAX_EMIT) { buf = ''; return; }
          const t = buf.replace(/\s+/g, ' ').trim();
          if (!t || t.length < 70) return;
          emitAgentLog(agent, 'рџ’­', `${label}: ${t.slice(-140)}`, 'think');
          buf = '';
          lastEmitAt = Date.now();
          emitted++;
        };
        const onDelta = (delta) => {
          if (!delta) return;
          if (delta.startsWith('__THINK__')) {
            const t = delta.slice(9).trim();
            if (t) {
              buf += ' ' + t;
              if (/[.!?]$/.test(t) || buf.length > 180) flush();
            }
            return;
          }
          buf += delta;
          const now = Date.now();
          if (buf.length >= 180 || (now - lastEmitAt) > 1700 || /[.!?]\s$/.test(buf)) flush();
        };
        return { onDelta, flush };
      };

      try {
        emitAgentStatus('aura', 'thinking', 'РђРЅР°Р»РёР·РёСЂСѓСЋ Р·Р°РїСЂРѕСЃ');
        emitAgentStatus('coder', 'idle', 'РћР¶РёРґР°СЋ РїР»Р°РЅ');
        emitAgentStatus('visual', 'idle', 'РћР¶РёРґР°СЋ РїР»Р°РЅ');
        emitAgentLog('aura', 'рџ‘‘', 'Aura (РіР»Р°РІРЅС‹Р№): Р°РЅР°Р»РёР·РёСЂСѓСЋ Р·Р°РїСЂРѕСЃ Рё РіРѕС‚РѕРІР»СЋ РїР»Р°РЅ РґР»СЏ РєРѕРјР°РЅРґС‹...', 'process');
        const plannerStream = makeThoughtStreamer('aura', 'РњС‹СЃР»Рё Aura');
        plannerOut = await callMiniMax([
          { role: 'system', content: `РўС‹ Aura Planner (MiniMax M2.7), РіР»Р°РІРЅС‹Р№ Р°РіРµРЅС‚. Р’РµСЂРЅРё JSON-РєРѕРЅС‚СЂР°РєС‚ Р·Р°РґР°С‡Рё (Р±РµР· Р»РёС€РЅРµРіРѕ С‚РµРєСЃС‚Р°) РІ С„РѕСЂРјР°С‚Рµ: {"goal":"","scope":"","deliverables":[],"assumptions":[],"quality_gate":[],"clarifications_needed":[]}. РљРѕРЅС‚СЂР°РєС‚ РёРЅСЃС‚СЂСѓРјРµРЅС‚РѕРІ: СѓС‚РѕС‡РЅРµРЅРёСЏ С‚РѕР»СЊРєРѕ С‡РµСЂРµР· ask_user, РєРѕРґ СЃРѕС…СЂР°РЅСЏРµРј С„Р°Р№Р»Р°РјРё, РїРµСЂРµРґ С„РёРЅР°Р»РѕРј РїСЂРѕРІРµСЂРєР° СЃРёРЅС‚Р°РєСЃРёСЃР°/Р·Р°РїСѓСЃРєР°. ${thinkingHint}` },
          { role: 'user', content: plainUserText }
        ], plannerStream.onDelta);
        plannerStream.flush();
        contract = aiNormalizeContract(aiParseJsonContract(plannerOut), plainUserText);
        emitAgentStatus('aura', 'ready', 'РџР»Р°РЅ РіРѕС‚РѕРІ');

        const plannerAsk = (contract.clarifications_needed?.length && (session.taskAskCount || 0) < 1)
          ? { questions: contract.clarifications_needed.slice(0, 3).map(q => ({ question: String(q), options: [], multi_select: false, allow_custom: true, required: true })) }
          : aiBuildAskUserFromText(plannerOut);
        if (plannerAsk) {
          emitAgentLog('aura', 'вќ“', 'Aura: Р·Р°РїСЂРѕСЃ СЃР»РёС€РєРѕРј РѕР±С‰РёР№, СЃРЅР°С‡Р°Р»Р° Р·Р°РїСЂР°С€РёРІР°СЋ СѓС‚РѕС‡РЅРµРЅРёРµ С‡РµСЂРµР· РёРЅСЃС‚СЂСѓРјРµРЅС‚.', 'process');
          emitAgentStatus('aura', 'ready', 'Р–РґСѓ СѓС‚РѕС‡РЅРµРЅРёРµ РѕС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ');
          emitAgentStatus('coder', 'idle', 'РћР¶РёРґР°СЋ СѓС‚РѕС‡РЅРµРЅРёРµ');
          emitAgentStatus('visual', 'idle', 'РћР¶РёРґР°СЋ СѓС‚РѕС‡РЅРµРЅРёРµ');
          if (sendAskUser(plannerAsk, ['multiagent', 'ask_user'], [])) return;
        }

        let webContext = '';
        if (aiNeedsWebResearch(plainUserText)) {
          emitAgentRelation('visual', 'aura', 'request_permission', 'web_search');
          emitAgentLog('visual', 'рџЊђ', 'Visual Р·Р°РїСЂР°С€РёРІР°РµС‚ РґРѕСЃС‚СѓРї Рє web_search.', 'process');
          emitAgentRelation('aura', 'visual', 'grant_permission', 'web_search');
          emitAgentLog('aura', 'рџ›‚', 'Aura РїСЂРѕРІРµСЂСЏРµС‚ Р·Р°РїСЂРѕСЃ РЅР° web_search Рё РґР°С‘С‚ СЂР°Р·СЂРµС€РµРЅРёРµ.', 'process');
          const webQ = `${plainUserText} free api key official docs`;
          const webRaw = await aiQuickWebSearch(webQ);
          if (webRaw) {
            webContext = `\n\n[WEB_SEARCH_CONTEXT]\n${webRaw}\n[/WEB_SEARCH_CONTEXT]`;
            emitAgentLog('aura', 'рџЊђ', 'Aura: web_search РІС‹РїРѕР»РЅРµРЅ, РєРѕРЅС‚РµРєСЃС‚ РїРµСЂРµРґР°РЅ Р°РіРµРЅС‚Р°Рј.', 'result');
          } else {
            emitAgentLog('aura', 'вљ пёЏ', 'Aura: web_search РЅРµ РґР°Р» РґР°РЅРЅС‹С…, РїСЂРѕРґРѕР»Р¶Р°РµРј Р±РµР· РЅРµРіРѕ.', 'result');
          }
        }

        emitAgentLog('aura', 'рџ§­', 'Aura РІС‹РґР°Р»Р° РєРѕРјР°РЅРґС‹. Р—Р°РїСѓСЃРєР°СЋ Coder Рё Visual РїР°СЂР°Р»Р»РµР»СЊРЅРѕ.', 'process');
        emitAgentStatus('coder', 'working', 'РџРёС€Сѓ РєРѕРґ Рё С‚РµСЃС‚-РїР»Р°РЅ');
        emitAgentStatus('visual', 'working', imageData ? 'РђРЅР°Р»РёР·РёСЂСѓСЋ РёР·РѕР±СЂР°Р¶РµРЅРёРµ' : 'Р”РµР»Р°СЋ QA/UX СЂРµРІСЊСЋ');

        const coderStream = makeThoughtStreamer('coder', 'РњС‹СЃР»Рё Coder');
        const coderPromise = callOmniRouter('qw/qwen3-coder-plus', [
          { role: 'system', content: `РўС‹ Code Worker. Р Р°Р±РѕС‚Р°Р№ СЃС‚СЂРѕРіРѕ РїРѕ JSON-РєРѕРЅС‚СЂР°РєС‚Сѓ. РћР‘РЇР—РђРўР•Р›Р¬РќРћ: 1) РўР•РЎРў-РџР›РђРќ, 2) РџР РћР’Р•Р РљРђ РћРЁРР‘РћРљ/РЎРРќРўРђРљРЎРРЎРђ, 3) РєРѕРґ РўРћР›Р¬РљРћ РІ markdown-Р±Р»РѕРєР°С… + РїРµСЂРµРґ РєР°Р¶РґС‹Рј "File: РёРјСЏ_С„Р°Р№Р»Р°.ext". Р’РѕРїСЂРѕСЃС‹ Р·Р°РґР°РІР°Р№ С‚РѕР»СЊРєРѕ С‡РµСЂРµР· Р±Р»РѕРє "РќРЈР–РќРћ РЈРўРћР§РќР•РќРР•". РСЃРїРѕР»СЊР·СѓР№ bug-hunt: РїСЂРѕРІРµСЂСЊ РіСЂР°РЅРёС‡РЅС‹Рµ СЃР»СѓС‡Р°Рё Рё РїРѕС‚РµРЅС†РёР°Р»СЊРЅС‹Рµ Р±Р°РіРё. ${thinkingHint}` },
          { role: 'user', content: `РљРѕРЅС‚СЂР°РєС‚ Р·Р°РґР°С‡Рё (JSON):\n${JSON.stringify(contract, null, 2)}\n\nРџР»Р°РЅ РєРѕРѕСЂРґРёРЅР°С‚РѕСЂР°:\n${plannerOut}\n\nР—Р°РїСЂРѕСЃ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ:\n${plainUserText}${webContext}` }
        ], coderStream.onDelta, omniBaseUrl)
          .then((out) => {
            coderStream.flush();
            emitAgentLog('coder', 'рџ§‘вЂЌрџ’»', 'Coder: РєРѕРґ Рё С‚РµСЃС‚-РїР»Р°РЅ РіРѕС‚РѕРІС‹.', 'result');
            emitAgentStatus('coder', 'ready', 'РљРѕРґ РіРѕС‚РѕРІ');
            return out;
          })
          .catch((e) => {
            coderStream.flush();
            emitAgentLog('coder', 'вљ пёЏ', `Coder РѕС€РёР±РєР°: ${e.message}`, 'result');
            emitAgentStatus('coder', 'error', 'РћС€РёР±РєР° РєРѕРґРµСЂР°');
            return `Coder РЅРµРґРѕСЃС‚СѓРїРµРЅ: ${e.message}`;
          });

        const visualPromise = (async () => {
          if (imageData) {
            emitAgentLog('visual', 'рџ–јпёЏ', 'Vision: Р°РЅР°Р»РёР·РёСЂСѓСЋ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РІ СЂРµР°Р»СЊРЅРѕРј РІСЂРµРјРµРЅРё...', 'process');
            const visualStream = makeThoughtStreamer('visual', 'РњС‹СЃР»Рё Vision');
            const out = await callOmniRouter('qw/vision-model', [
              { role: 'system', content: 'РўС‹ Vision Worker. Р”Р°Р№ С‚РѕР»СЊРєРѕ РїРѕР»РµР·РЅС‹Рµ РґР»СЏ СЂРµС€РµРЅРёСЏ РЅР°Р±Р»СЋРґРµРЅРёСЏ: РѕС€РёР±РєРё, РґРµС‚Р°Р»Рё UI, РІРёР·СѓР°Р»СЊРЅС‹Рµ СЂРёСЃРєРё, РєРѕРЅРєСЂРµС‚РЅС‹Рµ РїСЂР°РІРєРё.' },
              { role: 'user', content: [
                { type: 'text', text: plainUserText || 'РџСЂРѕР°РЅР°Р»РёР·РёСЂСѓР№ РёР·РѕР±СЂР°Р¶РµРЅРёРµ' },
                { type: 'image_url', image_url: { url: `data:${imageType || 'image/jpeg'};base64,${imageData}` } }
              ] }
            ], visualStream.onDelta, omniBaseUrl);
            visualStream.flush();
            emitAgentLog('visual', 'рџ–јпёЏ', 'Vision: Р°РЅР°Р»РёР· РёР·РѕР±СЂР°Р¶РµРЅРёСЏ РіРѕС‚РѕРІ.', 'result');
            emitAgentStatus('visual', 'ready', 'РђРЅР°Р»РёР· РіРѕС‚РѕРІ');
            return out;
          }

          emitAgentLog('visual', 'рџ”Ћ', 'Visual (Mistral): РґРµР»Р°СЋ QA/UX СЂРµРІСЊСЋ С‚СЂРµР±РѕРІР°РЅРёР№...', 'process');
          const visResp = await axios.post('https://api.mistral.ai/v1/chat/completions', {
            model: isDebug ? 'mistral-large-latest' : 'mistral-small-latest',
            messages: [
              { role: 'system', content: `РўС‹ Visual/QA Reviewer. РџСЂРѕРІРµСЂСЊ Р·Р°РїСЂРѕСЃ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РіР»Р°Р·Р°РјРё СЂРµРІСЊСЋРµСЂР°: UX, СЏСЃРЅРѕСЃС‚СЊ, СЂРёСЃРєРё, РЅРµРґРѕС‡С‘С‚С‹ Рё С‡С‚Рѕ РЅСѓР¶РЅРѕ РїСЂРѕРІРµСЂРёС‚СЊ РІ СЂРµР·СѓР»СЊС‚Р°С‚Рµ. ${thinkingHint}` },
              { role: 'user', content: `РљРѕРЅС‚СЂР°РєС‚ Р·Р°РґР°С‡Рё (JSON):\n${JSON.stringify(contract, null, 2)}\n\nР—Р°РїСЂРѕСЃ:\n${plainUserText}\n\nРџР»Р°РЅ Aura:\n${plannerOut}${webContext}` }
            ],
            max_tokens: 1200,
            temperature: 0.3,
          }, {
            headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
            timeout: 30000,
          });
          const out = visResp.data.choices?.[0]?.message?.content || '';
          emitAgentLog('visual', 'рџ”Ћ', `РњС‹СЃР»Рё Visual: ${out.slice(0, 220)}`, 'think');
          emitAgentLog('visual', 'вњ…', 'Visual: СЂРµРІСЊСЋ РіРѕС‚РѕРІРѕ.', 'result');
          emitAgentStatus('visual', 'ready', 'Р РµРІСЊСЋ РіРѕС‚РѕРІРѕ');
          return out;
        })().catch((e) => {
          emitAgentLog('visual', 'вљ пёЏ', `Visual РѕС€РёР±РєР°: ${e.message}`, 'result');
          emitAgentStatus('visual', 'error', 'РћС€РёР±РєР° visual');
          return `Visual РЅРµРґРѕСЃС‚СѓРїРµРЅ: ${e.message}`;
        });

        [coderOut, visualOut] = await Promise.all([coderPromise, visualPromise]);

        const teamRaw = `${coderOut}\n${visualOut}`;
        const teamHasCode = aiExtractCodeBlocks(teamRaw).length > 0 || /File:\s*[A-Za-z0-9._-]+\.[A-Za-z0-9]+/i.test(teamRaw);
        const teamAsk = teamHasCode ? null : aiBuildAskUserFromText(teamRaw);
        if (teamAsk) {
          emitAgentLog('aura', 'вќ“', 'РљРѕРјР°РЅРґР° Р·Р°РїСЂРѕСЃРёР»Р° СѓС‚РѕС‡РЅРµРЅРёРµ. РџРµСЂРµРґР°СЋ РІРѕРїСЂРѕСЃ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ С‡РµСЂРµР· ask_user.', 'process');
          emitAgentStatus('aura', 'ready', 'Р–РґСѓ СѓС‚РѕС‡РЅРµРЅРёРµ');
          emitAgentStatus('coder', 'idle', 'Р–РґСѓ СѓС‚РѕС‡РЅРµРЅРёРµ');
          emitAgentStatus('visual', 'idle', 'Р–РґСѓ СѓС‚РѕС‡РЅРµРЅРёРµ');
          if (sendAskUser(teamAsk, ['multiagent', 'ask_user'], [])) return;
        }

        emitAgentLog('aura', 'вњЁ', 'Aura: РѕР±СЉРµРґРёРЅСЏСЋ РѕС‚РІРµС‚С‹ РєРѕРјР°РЅРґС‹ Рё РґРµР»Р°СЋ С„РёРЅР°Р»СЊРЅСѓСЋ РїСЂРѕРІРµСЂРєСѓ...', 'process');
        emitAgentStatus('aura', 'working', 'РЎРѕР±РёСЂР°СЋ С„РёРЅР°Р»СЊРЅС‹Р№ РѕС‚РІРµС‚');
        const finalStream = makeThoughtStreamer('aura', 'РњС‹СЃР»Рё Aura (С„РёРЅР°Р»)');
        finalOut = await callMiniMax([
          { role: 'system', content: 'РўС‹ Aura Coordinator (MiniMax M2.7), РіР»Р°РІРЅС‹Р№ Р°РіРµРЅС‚. РћС‚РІРµС‚ СЃС‚СЂРѕРіРѕ СЃС‚СЂСѓРєС‚СѓСЂРёСЂСѓР№: 1) РљСЂР°С‚РєРёР№ РёС‚РѕРі, 2) РРЅСЃС‚СЂСѓРєС†РёРё Р·Р°РїСѓСЃРєР° Рё РїСЂРѕРІРµСЂРєРё. Р•СЃР»Рё РµСЃС‚СЊ РєРѕРґ: РўРћР›Р¬РљРћ РІ markdown-РєРѕРґР±Р»РѕРєР°С…. РџРµСЂРµРґ РєР°Р¶РґС‹Рј РєРѕРґР±Р»РѕРєРѕРј СЃС‚СЂРѕРєР° "File: РёРјСЏ_С„Р°Р№Р»Р°.ext". РќРµР»СЊР·СЏ РѕС‚РїСЂР°РІР»СЏС‚СЊ РєРѕРґ РѕР±С‹С‡РЅС‹Рј С‚РµРєСЃС‚РѕРј. РЈС‚РѕС‡РЅРµРЅРёСЏ РІ С‡Р°С‚ РЅРµ Р·Р°РґР°РІР°Р№ вЂ” С‚РѕР»СЊРєРѕ РєР°Рє Р±Р»РѕРє "РќРЈР–РќРћ РЈРўРћР§РќР•РќРР•: РІРѕРїСЂРѕСЃ".' },
          { role: 'user', content: `Р—Р°РїСЂРѕСЃ:\n${plainUserText}\n\nРџР»Р°РЅ Aura:\n${plannerOut}\n\nQwen Coder Plus:\n${coderOut}\n\nVisual Reviewer:\n${visualOut}` }
        ], delta => {
          finalStream.onDelta(delta);
        });
        finalStream.flush();
        emitAgentStatus('aura', 'ready', 'Р¤РёРЅР°Р» РіРѕС‚РѕРІ');
      } catch (maErr) {
        finalOut = `вљ пёЏ Multi-Agent РѕС€РёР±РєР°: ${maErr.message}`;
        emitAgentStatus('aura', 'error', 'РћС€РёР±РєР° Aura');
      }

      if (!finalOut) finalOut = 'Р“РѕС‚РѕРІРѕ';
      finalOut = aiDedupeRepeatedText(finalOut).replace(/<\/?think>/gi, '').trim();
      const autoAskMa = aiBuildAskUserFromText(finalOut);
      if (autoAskMa) {
        if (sendAskUser(autoAskMa, ['multiagent', 'ask_user'], [])) return;
      }

      const createdFiles = [];
      let codeBlocks = aiExtractCodeBlocks(finalOut);
      if (!codeBlocks.length && aiLooksLikeCodingTask(plainUserText)) {
        try {
          // РџРѕРїС‹С‚РєР° РїСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕ РїСЂРµРѕР±СЂР°Р·РѕРІР°С‚СЊ С‚РµРєСЃС‚РѕРІС‹Р№ РєРѕРґ РІ file-Р±Р»РѕРєРё
          const normalized = await callMiniMax([
            { role: 'system', content: 'РџСЂРµРѕР±СЂР°Р·СѓР№ РѕС‚РІРµС‚ РІ С„РѕСЂРјР°С‚ С„Р°Р№Р»РѕРІ. Р’РµСЂРЅРё РўРћР›Р¬РљРћ markdown-РєРѕРґР±Р»РѕРєРё. РџРµСЂРµРґ РєР°Р¶РґС‹Рј РєРѕРґР±Р»РѕРєРѕРј СЃС‚СЂРѕРєР° "File: РёРјСЏ_С„Р°Р№Р»Р°.ext". РќРёРєР°РєРѕРіРѕ Р»РёС€РЅРµРіРѕ С‚РµРєСЃС‚Р°.' },
            { role: 'user', content: `Р—Р°РїСЂРѕСЃ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ:\n${plainUserText}\n\nРћС‚РІРµС‚, РєРѕС‚РѕСЂС‹Р№ РЅСѓР¶РЅРѕ РЅРѕСЂРјР°Р»РёР·РѕРІР°С‚СЊ:\n${finalOut}` }
          ]);
          const normalizedBlocks = aiExtractCodeBlocks(normalized);
          if (normalizedBlocks.length) {
            finalOut = normalized;
            codeBlocks = normalizedBlocks;
          }
        } catch {}
      }
      if (!codeBlocks.length) {
        const loose = aiExtractLooseCode(finalOut);
        if (loose) codeBlocks = [loose];
      }
      if (codeBlocks.length) {
        const qg1 = aiRunQualityGate(codeBlocks);
        if (!qg1.ok) {
          emitAgentLog('aura', 'рџ§Є', 'Quality-gate: РЅР°Р№РґРµРЅС‹ РѕС€РёР±РєРё, Р·Р°РїСѓСЃРєР°СЋ Р°РІС‚Рѕ-С„РёРєСЃ.', 'process');
          const fixed = await callMiniMax([
            { role: 'system', content: 'РСЃРїСЂР°РІСЊ РєРѕРґ С‚Р°Рє, С‡С‚РѕР±С‹ РїСЂРѕС€С‘Р» СЃРёРЅС‚Р°РєСЃРёС‡РµСЃРєСѓСЋ РїСЂРѕРІРµСЂРєСѓ. Р’РµСЂРЅРё РўРћР›Р¬РљРћ markdown-РєРѕРґР±Р»РѕРєРё. РџРµСЂРµРґ РєР°Р¶РґС‹Рј РєРѕРґР±Р»РѕРєРѕРј СЃС‚СЂРѕРєР° "File: name.ext".' },
            { role: 'user', content: `РљРѕРЅС‚СЂР°РєС‚:\n${JSON.stringify(contract, null, 2)}\n\nРћС€РёР±РєРё quality-gate:\n${qg1.failures.join('\n')}\n\nРўРµРєСѓС‰РёР№ РѕС‚РІРµС‚:\n${finalOut}` }
          ]);
          const fixedBlocks = aiExtractCodeBlocks(fixed);
          if (fixedBlocks.length) {
            codeBlocks = fixedBlocks;
            finalOut = fixed;
          }
          const qg2 = aiRunQualityGate(codeBlocks);
          if (!qg2.ok) {
            emitAgentLog('aura', 'в›”', 'Quality-gate РЅРµ РїСЂРѕР№РґРµРЅ. Р’С‹РґР°С‡Р° РєРѕРґР° РѕСЃС‚Р°РЅРѕРІР»РµРЅР°.', 'result');
            aiSseEmit(username, 'done', {});
            return res.json({
              success: true,
              reply: `в›” Quality-gate РЅРµ РїСЂРѕР№РґРµРЅ.\n\nРћС€РёР±РєРё:\n${qg2.failures.slice(0, 6).join('\n')}\n\nРЈС‚РѕС‡РЅРё С‚СЂРµР±РѕРІР°РЅРёСЏ РёР»Рё РїРѕРїСЂРѕСЃРё Р°РІС‚Рѕ-РїРѕС‡РёРЅРєСѓ РїРѕ РїСѓРЅРєС‚Р°Рј.`,
              toolsUsed: ['multiagent', 'quality_gate'],
              createdFiles: []
            });
          }
          emitAgentLog('aura', 'вњ…', 'Quality-gate РїСЂРѕР№РґРµРЅ РїРѕСЃР»Рµ Р°РІС‚Рѕ-С„РёРєСЃР°.', 'result');
        } else {
          emitAgentLog('aura', 'вњ…', 'Quality-gate РїСЂРѕР№РґРµРЅ.', 'result');
        }
      }
      if (codeBlocks.length) {
        codeBlocks.forEach((b, idx) => {
          const fname = b.name || `agent_result_${idx + 1}.${b.ext}`;
          const { fileId, safe } = aiSaveFile(username, fname, b.code, `РљРѕРґ РѕС‚ Multi-Agent (${b.lang || b.ext})`);
          createdFiles.push({ id: fileId, name: safe, content: b.code, description: `РљРѕРґ РѕС‚ Multi-Agent (${b.lang || b.ext})` });
          aiSseEmit(username, 'file_created', { id: fileId, name: safe, description: `РљРѕРґ РѕС‚ Multi-Agent (${b.lang || b.ext})`, content: b.code });
        });
        finalOut = finalOut
          .replace(/(?:^|\n)\s*(?:File|Filename|Р¤Р°Р№Р»|РРјСЏ С„Р°Р№Р»Р°)\s*[:\-]\s*[A-Za-z0-9._-]+\.[A-Za-z0-9]+\s*\n```[\s\S]*?```/g, '')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/(?:^|\n)\s*(?:File|Filename|Р¤Р°Р№Р»|РРјСЏ С„Р°Р№Р»Р°)\s*[:\-]\s*[A-Za-z0-9._-]+\.[A-Za-z0-9]+\s*/g, '\n')
          .trim();
        if (!finalOut) finalOut = `РљРѕРґ СЃРѕС…СЂР°РЅРµРЅ С„Р°Р№Р»Р°РјРё (${createdFiles.length} С€С‚). РСЃРїРѕР»СЊР·СѓР№ РєРЅРѕРїРєРё СЃРєР°С‡РёРІР°РЅРёСЏ.`;
      }

      history.push({ role: 'assistant', content: finalOut });
      scheduleAiConvSave();
      aiSseEmit(username, 'done', {});
      return res.json({ success: true, reply: finalOut, toolsUsed: ['multiagent'], createdFiles });
    }

    // в”Ђв”Ђ OmniRouter РјРѕРґРµР»Рё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    if (useOR) {
      let reply = '';
      try {
        const targetModel = imageData ? 'qw/vision-model' : selectedModel;
        const orSystemPrompt = targetModel === 'qw/qwen3-coder-plus'
          ? `${currentSystemPrompt}\n\n[Р–Р•РЎРўРљРћР• РџР РђР’РР›Рћ Р”Р›РЇ CODER]\nРџРµСЂРµРґ С„РёРЅР°Р»СЊРЅС‹Рј РѕС‚РІРµС‚РѕРј РћР‘РЇР—РђРўР•Р›Р¬РќРћ РІС‹РґР°Р№ Р±Р»РѕРє:\n1) РўР•РЎРў-РџР›РђРќ\n2) РљРђРљ РџР РћР’Р•Р РРўР¬ РћРЁРР‘РљР\n3) Р“РћРўРћР’Рћ РўРћР›Р¬РљРћ РџРћРЎР›Р• РџР РћР’Р•Р РљР\nРќРµ РїСЂРѕРїСѓСЃРєР°Р№ СЌС‚Рё РїСѓРЅРєС‚С‹.`
          : currentSystemPrompt;
        aiSseEmit(username, 'log', { icon: 'рџ¤–', text: `${targetModel} РґСѓРјР°РµС‚...`, type: 'process' });
        reply = await callOmniRouter(targetModel,
          [{ role: 'system', content: orSystemPrompt }, ...history],
          delta => {
            if (delta.startsWith('__THINK__')) {
              aiSseEmit(username, 'log', { icon: 'СЂСџвЂ™В­', text: delta.slice(9), type: 'think' });
            } else {
              aiSseEmit(username, 'chunk', { text: delta });
            }
          },
          omniBaseUrl
        );
      } catch(orErr) {
        console.error('[OmniRouter] РћС€РёР±РєР°:', orErr.response?.data || orErr.message);
        if (isOmniRouteModuleError(orErr)) {
          aiSseEmit(username, 'log', {
            icon: 'вљ пёЏ',
            type: 'result',
            text: 'OmniRoute СѓРїР°Р» РёР·-Р·Р° Р·Р°РІРёСЃРёРјРѕСЃС‚Рё zod. РџРµСЂРµРєР»СЋС‡Р°СЋСЃСЊ РЅР° СЂРµР·РµСЂРІРЅСѓСЋ РјРѕРґРµР»СЊ Mistral.'
          });
          try {
            const fb = await axios.post('https://api.mistral.ai/v1/chat/completions', {
              model: isDebug ? 'mistral-large-latest' : 'mistral-small-latest',
              messages: [{ role: 'system', content: currentSystemPrompt }, ...history],
              max_tokens: 2500,
              temperature: 0.7,
            }, {
              headers: { 'Authorization': `Bearer ${MISTRAL_API_KEY}`, 'Content-Type': 'application/json' },
              timeout: 30000,
            });
            reply = fb.data.choices?.[0]?.message?.content || 'Р“РѕС‚РѕРІРѕ';
          } catch (fbErr) {
            reply = 'вљ пёЏ OmniRoute СѓРїР°Р» (РѕС€РёР±РєР° РјРѕРґСѓР»СЏ zod), Р° СЂРµР·РµСЂРІРЅС‹Р№ Р·Р°РїСЂРѕСЃ С‚РѕР¶Рµ РЅРµ РїСЂРѕС€С‘Р». РџСЂРѕРІРµСЂСЊ OmniRoute РёР»Рё РІСЂРµРјРµРЅРЅРѕ РІС‹Р±РµСЂРё Mistral.';
          }
        } else {
          aiSseEmit(username, 'log', { icon: 'вљ пёЏ', type: 'process', text: `Qwen РЅРµРґРѕСЃС‚СѓРїРµРЅ (${orErr.message}). Aura РґРµР»Р°РµС‚ Р·Р°РґР°С‡Сѓ РІРјРµСЃС‚Рѕ РЅРµРіРѕ.` });
          try {
            const auraFallbackPrompt = selectedModel === 'qw/qwen3-coder-plus'
              ? `${currentSystemPrompt}\n\nQwen РЅРµРґРѕСЃС‚СѓРїРµРЅ. Р’С‹РїРѕР»РЅРё Р·Р°РґР°С‡Сѓ РєР°Рє coder: РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ РўР•РЎРў-РџР›РђРќ, РїСЂРѕРІРµСЂРєР° СЃРёРЅС‚Р°РєСЃРёСЃР° Рё РєРѕРґ РІ markdown-Р±Р»РѕРєР°С… СЃ "File: name.ext".`
              : currentSystemPrompt;
            reply = await callMiniMax(
              [{ role: 'system', content: auraFallbackPrompt }, ...history],
              delta => {
                if (delta.startsWith('__THINK__')) aiSseEmit(username, 'log', { icon: 'рџ’­', text: delta.slice(9), type: 'think' });
                else aiSseEmit(username, 'chunk', { text: delta });
              }
            );
          } catch (aErr) {
            reply = `вљ пёЏ РћС€РёР±РєР° ${selectedModel}: ${orErr.message}. Fallback Aura С‚РѕР¶Рµ РЅРµ СЃСЂР°Р±РѕС‚Р°Р»: ${aErr.message}`;
          }
        }
      }
      if (!reply) reply = 'Р“РѕС‚РѕРІРѕ';
      reply = aiDedupeRepeatedText(String(reply || '').replace(/<\/?think>/gi, '').trim());
      const autoAskOr = aiBuildAskUserFromText(reply);
      if (autoAskOr) {
        if (sendAskUser(autoAskOr, ['ask_user'], [])) return;
      }
      history.push({ role: 'assistant', content: reply });
      scheduleAiConvSave();
      aiSseEmit(username, 'done', {});
      return res.json({ success: true, reply, toolsUsed: [], createdFiles: [] });
    }

    // РІвЂќР‚РІвЂќР‚ Aura AI (MiniMax) РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
      reply = aiDedupeRepeatedText(String(reply || '').replace(/<\/?think>/gi, '').trim());
      const autoAskAura = aiBuildAskUserFromText(reply);
      if (autoAskAura) {
        if (sendAskUser(autoAskAura, ['ask_user'], [])) return;
      }
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
        // РћС‚РїСЂР°РІР»СЏРµРј С‡РµСЂРµР· SSE С‡С‚РѕР±С‹ РєР»РёРµРЅС‚ СѓСЃРїРµР» РѕР±СЂР°Р±РѕС‚Р°С‚СЊ РґРѕ HTTP РѕС‚РІРµС‚Р°
        if (sendAskUser(pendingAskUser, toolsUsed, createdFiles)) return;
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
      reply = aiDedupeRepeatedText(String(reply || '').replace(/<\/?think>/gi, '').trim());
      const autoAsk = aiBuildAskUserFromText(reply);
      if (autoAsk) {
        if (sendAskUser(autoAsk, [...toolsUsed, 'ask_user'], createdFiles)) return;
      }
      history.push({ role: 'assistant', content: reply });
      scheduleAiConvSave();
      aiSseEmit(username, 'done', {});
      res.json({ success: true, reply, toolsUsed, createdFiles });
    } else {
      // РџСЂСЏРјРѕР№ РѕС‚РІРµС‚ Р±РµР· РёРЅСЃС‚СЂСѓРјРµРЅС‚РѕРІ
      const reply = aiDedupeRepeatedText(String(msg1?.content || 'РќРµС‚ РѕС‚РІРµС‚Р°').replace(/<\/?think>/gi, '').trim());
      const autoAsk = aiBuildAskUserFromText(reply);
      if (autoAsk) {
        if (sendAskUser(autoAsk, ['ask_user'], [])) return;
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

// РІвЂќР‚РІвЂќР‚ Р РЋР С”Р В°РЎвЂЎР В°РЎвЂљРЎРЉ РЎвЂћР В°Р в„–Р В» Р С‘Р В· Р В±Р В°Р В·РЎвЂ№ AI РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
app.get('/api/ai-file/:username/:fileId', (req, res) => {
  const files = aiUserFiles.get(req.params.username) || [];
  const file  = files.find(f => f.id === req.params.fileId);
  if (!file) return res.status(404).send('Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ РёР»Рё РёСЃС‚С‘Рє СЃСЂРѕРє С…СЂР°РЅРµРЅРёСЏ');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(file.content);
});

// РІвЂќР‚РІвЂќР‚ Р РЋР С”Р В°РЎвЂЎР В°РЎвЂљРЎРЉ Р Р…Р ВµРЎРѓР С”Р С•Р В»РЎРЉР С”Р С• РЎвЂћР В°Р в„–Р В»Р С•Р Р† Р С”Р В°Р С” ZIP РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

// РІвЂќР‚РІвЂќР‚ Р вЂќР Р…Р ВµР Р†Р Р…РЎвЂ№Р Вµ Р В»Р С‘Р СР С‘РЎвЂљРЎвЂ№ Р Р…Р В° Р С–Р ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎР‹ Р СР ВµР Т‘Р С‘Р В° РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
function tog(){playing=!playing;document.getElementById('pb2').textContent=playing?'РІРЏС‘':'РІвЂ“В¶';if(playing){last=null;requestAnimationFrame(frame);}}
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

// РІвЂќР‚РІвЂќР‚ Р В Р ВµР Т‘Р В°Р С”РЎвЂљР С‘РЎР‚Р С•Р Р†Р В°РЎвЂљРЎРЉ РЎвЂћР В°Р в„–Р В» Р Р† Р В±Р В°Р В·Р Вµ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

// РІвЂќР‚РІвЂќР‚ Р РЋР В±РЎР‚Р С•РЎРѓР С‘РЎвЂљРЎРЉ Р С‘РЎРѓРЎвЂљР С•РЎР‚Р С‘РЎР‹ AI-РЎвЂЎР В°РЎвЂљР В° РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

  if (isHumanBotUsername(cleanName)) {
    return res.status(403).json({ error: 'Р­С‚РѕС‚ Р°РєРєР°СѓРЅС‚ СѓРїСЂР°РІР»СЏРµС‚СЃСЏ Aura.' });
  }

  if (users.has(cleanName)) {
    const userData = users.get(cleanName);
    // Check password
    if (userData.passwordHash && userData.passwordHash !== pwHash) {
      return res.status(401).json({ error: 'РќРµРІРµСЂРЅС‹Р№ РїР°СЂРѕР»СЊ' });
    }
    // If no password set yet (old account) РІР‚вЂќ set it now
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
  ensureHumanBotAccount();
  if (!query || query.trim().length < 1) {
    return res.json({ users: [] });
  }
  const q = query.toLowerCase().trim();
  const results = [];

  // РџРѕР»СѓС‡Р°РµРј СЃРїРёСЃРѕРє РґСЂСѓР·РµР№ Р·Р°РїСЂР°С€РёРІР°СЋС‰РµРіРѕ С‡С‚РѕР±С‹ РїРѕРјРµС‚РёС‚СЊ РёС…
  const requesterData = requester && users.has(requester) ? users.get(requester) : null;
  const myFriends = new Set(requesterData?.friends || []);
  const incomingReqs = new Set(requesterData?.friendRequests || []);
  const outgoingReqs = new Set(requesterData?.sentFriendRequests || []);

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
        hasIncomingRequest: incomingReqs.has(username),
        hasOutgoingRequest: outgoingReqs.has(username),
      });
    }
    if (results.length >= 20) break;
  }

  for (const botUsername of HUMAN_BOT_USERNAMES) {
    const profile = getHumanBotProfile(botUsername);
    const matchesBot = botUsername.includes(q) || profile.nickname.toLowerCase().includes(q) ||
      profile.aliases.some(a => a.toLowerCase().includes(q) || q.includes(a.toLowerCase()));
    if (matchesBot && requester !== botUsername && !results.some(u => u.username === botUsername)) {
      results.push({
        username: botUsername,
        nickname: profile.nickname,
        avatar: users.get(botUsername)?.avatar || null,
        isFriend: myFriends.has(botUsername),
        hasIncomingRequest: incomingReqs.has(botUsername),
        hasOutgoingRequest: outgoingReqs.has(botUsername),
      });
    }
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
  ensureHumanBotAccount();
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'РќРµ СѓРєР°Р·Р°РЅС‹ РёРјРµРЅР°' });
  if (!users.has(from) || !users.has(to)) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
  if (from === to) return res.status(400).json({ error: 'РќРµР»СЊР·СЏ РґРѕР±Р°РІРёС‚СЊ СЃРµР±СЏ' });

  if (isHumanBotUsername(to)) {
    const fromUser = users.get(from);
    const botUser = users.get(to);
    if (!fromUser.friends) fromUser.friends = [];
    if (!botUser.friends) botUser.friends = [];
    if (!fromUser.friends.includes(to)) fromUser.friends.push(to);
    if (!botUser.friends.includes(from)) botUser.friends.push(from);
    users.set(from, fromUser);
    users.set(to, botUser);
    await saveUsers();
    const sid = userSockets.get(from);
    if (sid) io.to(sid).emit('friends-updated', { friends: fromUser.friends });
    return res.json({ success: true, autoAccepted: true });
  }

  const targetUser = users.get(to);
  const fromUser = users.get(from);
  if (!targetUser.friendRequests) targetUser.friendRequests = [];
  if (!targetUser.friends) targetUser.friends = [];
  if (!fromUser.friends) fromUser.friends = [];
  if (!fromUser.sentFriendRequests) fromUser.sentFriendRequests = [];
  if (targetUser.friends.includes(from) || fromUser.friends.includes(to)) {
    return res.json({ success: false, message: 'Р’С‹ СѓР¶Рµ РІ РґСЂСѓР·СЊСЏС…' });
  }
  if (fromUser.sentFriendRequests.includes(to)) {
    return res.json({ success: false, message: 'Р—Р°СЏРІРєР° СѓР¶Рµ РѕС‚РїСЂР°РІР»РµРЅР°' });
  }
  if (targetUser.friendRequests.includes(from)) {
    return res.json({ success: false, message: 'Р—Р°СЏРІРєР° СѓР¶Рµ РѕС‚РїСЂР°РІР»РµРЅР°' });
  }
  targetUser.friendRequests.push(from);
  fromUser.sentFriendRequests.push(to);
  users.set(to, targetUser);
  users.set(from, fromUser);
  await saveUsers();

  const targetSocketId = userSockets.get(to);
  if (targetSocketId) {
    io.to(targetSocketId).emit('friend-request', { from });
    // Also save to user's pending requests for when they reconnect
    // (already saved above via targetUser.friendRequests.push(from))
  }
  res.json({ success: true, sentFriendRequests: fromUser.sentFriendRequests });
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
  if (!requesterUser.sentFriendRequests) requesterUser.sentFriendRequests = [];
  if (!user.friends.includes(requester)) user.friends.push(requester);
  if (!requesterUser.friends.includes(username)) requesterUser.friends.push(username);
  requesterUser.sentFriendRequests = requesterUser.sentFriendRequests.filter(x => x !== username);

  users.set(username, user);
  users.set(requester, requesterUser);
  await saveUsers();

  const userSocket = userSockets.get(username);
  if (userSocket) {
    io.to(userSocket).emit('friends-updated', { friends: user.friends });
  }
  const requesterSocket = userSockets.get(requester);
  if (requesterSocket) {
    io.to(requesterSocket).emit('friends-updated', { friends: requesterUser.friends });
    io.to(requesterSocket).emit('friend-requests-updated', { sentFriendRequests: requesterUser.sentFriendRequests });
  }

  res.json({ success: true, friends: user.friends });
});

// РћС‚РєР»РѕРЅРёС‚СЊ Р·Р°СЏРІРєСѓ
app.post('/api/reject-friend-request', async (req, res) => {
  const { username, requester } = req.body;
  if (!username || !requester) return res.status(400).json({ error: 'РќРµ СѓРєР°Р·Р°РЅС‹ РёРјРµРЅР°' });
  if (!users.has(username)) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });

  const user = users.get(username);
  const requesterUser = users.get(requester);
  if (!user.friendRequests) user.friendRequests = [];
  const index = user.friendRequests.indexOf(requester);
  if (index !== -1) {
    user.friendRequests.splice(index, 1);
    users.set(username, user);
    if (requesterUser) {
      if (!requesterUser.sentFriendRequests) requesterUser.sentFriendRequests = [];
      requesterUser.sentFriendRequests = requesterUser.sentFriendRequests.filter(x => x !== username);
      users.set(requester, requesterUser);
    }
    await saveUsers();
  }
  res.json({ success: true });
});

app.post('/api/cancel-friend-request', async (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'РќРµ СѓРєР°Р·Р°РЅС‹ РёРјРµРЅР°' });
  if (!users.has(from) || !users.has(to)) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
  const fromUser = users.get(from);
  const toUser = users.get(to);
  if (!fromUser.sentFriendRequests) fromUser.sentFriendRequests = [];
  if (!toUser.friendRequests) toUser.friendRequests = [];
  fromUser.sentFriendRequests = fromUser.sentFriendRequests.filter(x => x !== to);
  toUser.friendRequests = toUser.friendRequests.filter(x => x !== from);
  users.set(from, fromUser);
  users.set(to, toUser);
  await saveUsers();
  res.json({ success: true, sentFriendRequests: fromUser.sentFriendRequests });
});

// РџРѕР»СѓС‡РёС‚СЊ РґР°РЅРЅС‹Рµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
app.post('/api/get-user-data', (req, res) => {
  ensureHumanBotAccount();
  const { username } = req.body;
  if (!username || !users.has(username)) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
  const userData = users.get(username);
  res.json({
    friends:       userData.friends        || [],
    friendRequests:userData.friendRequests || [],
    sentFriendRequests: userData.sentFriendRequests || [],
    groups:        userData.groups         || [],
    recoveryEmail: userData.recoveryEmail  || null,
    emailVerified: userData.emailVerified  || false,
  });
});

// РџРѕР»СѓС‡РёС‚СЊ Р°РІР°С‚Р°СЂРєСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
app.post('/api/get-avatar', (req, res) => {
  ensureHumanBotAccount();
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
  ensureHumanBotAccount();
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
// РІвЂќР‚РІвЂќР‚ Р С›РЎвЂЎР С‘РЎРѓРЎвЂљР С”Р В° Р С‘РЎРѓРЎвЂљР С•РЎР‚Р С‘Р С‘ Р С–РЎР‚РЎС“Р С—Р С—РЎвЂ№ (РЎвЂљР С•Р В»РЎРЉР С”Р С• РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљР ВµР В»РЎРЉ) РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
    ensureHumanBotAccount();
    await saveUsers();
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
        ensureHumanBotAccount();
        await saveUsers();
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
const humanBotActiveUntil = new Map(); // botUsername -> ts

function setHumanBotActivity(botUsername, durationMs = 25000) {
  humanBotActiveUntil.set(botUsername, Date.now() + durationMs);
  broadcastOnlineCount();
}

function isHumanBotActive(botUsername) {
  return Number(humanBotActiveUntil.get(botUsername) || 0) > Date.now();
}
const peerIdRegistry = new Map(); // username -> peerId
const missedCalls    = new Map(); // username -> [{ from, isVid, time }]
const activeCalls    = new Map(); // callee_username -> { from, isVid, startTime }
const humanBotCallSessions = new Map(); // bot|user -> { bot, user, room, startedAt, acceptedAt, active, direction }
const humanBotGroupCallSessions = new Map(); // bot|room -> { bot, room, groupId, active, participants: [] }

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
  ensureHumanBotAccount();
  const onlineList = [...new Set([...onlineUsers.values()].map(u => u.username).filter(Boolean))];
  for (const botUsername of HUMAN_BOT_USERNAMES) {
    if (isHumanBotActive(botUsername) && !onlineList.includes(botUsername)) onlineList.push(botUsername);
  }
  io.emit('online-count', onlineList.length);
  io.emit('online-users', onlineList);
}
setInterval(broadcastOnlineCount, 10000); // 10s - СЃС‚Р°Р±РёР»СЊРЅРѕ, Р±РµР· РјРёРіР°РЅРёСЏ // СЂРµР¶Рµ С‡С‚РѕР±С‹ РЅРµ РјРёРіР°Р»Рѕ

function getGroupSnapshotForUser(username, groupId) {
  const user = users.get(username);
  return (user?.groups || []).find(g => g.id === groupId) || null;
}

io.on('connection', (socket) => {
  let currentUser = null;

  socket.on('identify', (username) => {
    currentUser = username;
    onlineUsers.set(socket.id, { username, lastSeen: Date.now() });
    // Р Р°СЃСЃС‹Р»Р°РµРј РѕР±РЅРѕРІР»С‘РЅРЅС‹Р№ СЃРїРёСЃРѕРє
    const onlineList2 = [...onlineUsers.values()].map(u => u.username).filter(Boolean);
    for (const botUsername of HUMAN_BOT_USERNAMES) {
      if (isHumanBotActive(botUsername) && !onlineList2.includes(botUsername)) onlineList2.push(botUsername);
    }
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
      socket.emit('call-invite', {
        from: active.from,
        isVid: active.isVid,
        resumed: true,
        groupId: active.groupId || null,
        group: active.groupId ? getGroupSnapshotForUser(username, active.groupId) : null
      });
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
    scheduleHumanBotsForMessage(msg);
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
    scheduleHumanBotsForMessage(msg);
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
    console.log(`[PeerID] ${username} РІвЂ вЂ™ ${peerId}`);
    peerIdRegistry.set(username, peerId);
    // Broadcast to everyone so they can update their registry
    socket.broadcast.emit('peer-id', { username, peerId });
  });

  // Someone wants to call a specific user РІР‚вЂќ request their latest peerId
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

  // РІвЂќР‚РІвЂќР‚ CALL RELAY РІвЂќР‚РІвЂќР‚ forward call signals between users
  function relayTo(event, data) {
    const target = data.to;
    if (!target) return;
    if (event === 'call-invite' && data.groupId && !data.group) {
      data = { ...data, group: getGroupSnapshotForUser(target, data.groupId) };
    }
    const tid = userSockets.get(target);
    if (tid) {
      io.to(tid).emit(event, data);
    } else {
      // Target offline РІР‚вЂќ store missed call so they see it when they reconnect
      if (event === 'call-invite') {
        const calls = missedCalls.get(target) || [];
        calls.push({ from: data.from, isVid: data.isVid, groupId: data.groupId || null, time: Date.now() });
        // Keep only last 10 missed calls
        missedCalls.set(target, calls.slice(-10));
        console.log(`[Call] Missed call stored for offline user "${target}"`);
      }
    }
  }
  socket.on('call-invite', data => {
    if (isHumanBotUsername(data?.to)) {
      const botUsername = data.to;
      const caller = data.from;
      const room = humanBotCallRoom(data, botUsername);
      if (data?.groupId) {
        const accept = humanBotShouldAcceptCall(data, botUsername);
        const delay = 2500 + Math.floor(Math.random() * 7000);
        setHumanBotActivity(botUsername, delay + 45000);
        setTimeout(() => {
          if (!accept) {
            const callerSid = userSockets.get(caller);
            if (callerSid) io.to(callerSid).emit('call-decline', { from: botUsername, groupId: data.groupId });
            return;
          }
          humanBotSetGroupCallSession(botUsername, room, {
            groupId: data.groupId,
            acceptedAt: Date.now(),
            participants: Array.isArray(data.group?.members) ? data.group.members.slice() : [caller],
          });
          emitToGroupMembers(data.groupId, 'call-bot-group-joined', { room, groupId: data.groupId, username: botUsername });
          setTimeout(() => humanBotMaybeChatDuringCall(botUsername, caller, room), 1200 + Math.floor(Math.random() * 2200));
        }, delay);
        return;
      }
      const session = humanBotGetCallSession(botUsername, caller);
      if (session?.active) {
        humanBotEmitCallToUser(caller, 'call-bot-accepted', { from: botUsername, room, isVid: false });
        return;
      }
      const accept = humanBotShouldAcceptCall(data, botUsername);
      const delay = 2500 + Math.floor(Math.random() * 7000);
      setHumanBotActivity(botUsername, delay + 45000);
      setTimeout(() => {
        if (!accept) {
          if (Math.random() < 0.7) humanBotEmitCallToUser(caller, 'call-decline', { from: botUsername });
          return;
        }
        humanBotSetCallSession(botUsername, caller, {
          room,
          acceptedAt: Date.now(),
          direction: 'incoming',
          active: true,
        });
        humanBotEmitCallToUser(caller, 'call-bot-accepted', { from: botUsername, room, isVid: false });
      }, delay);
      return;
    }
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
  // call-answer-ready is handled below so activeCalls is cleared once and the relay is not duplicated.
  socket.on('call-offer',        data => relayTo('call-offer',        data));
  socket.on('call-answer',       data => relayTo('call-answer',       data));
  socket.on('call-ice',          data => relayTo('call-ice',          data));
  socket.on('call-bot-accept', ({ to, from, room }) => {
    if (!isHumanBotUsername(to) || !from) return;
    const resolvedRoom = room || humanBotCallRoom({ from, room }, to);
    humanBotSetCallSession(to, from, {
      room: resolvedRoom,
      acceptedAt: Date.now(),
      direction: 'outgoing',
      active: true,
    });
    setHumanBotActivity(to, 60000);
  });
  socket.on('call-bot-decline', ({ to, from }) => {
    if (!isHumanBotUsername(to) || !from) return;
    humanBotClearCallSession(to, from);
  });
  // РІвЂќР‚РІвЂќР‚ Р вЂ”Р В°Р С—Р С‘РЎРѓРЎРЉ Р С• Р В·Р Р†Р С•Р Р…Р С”Р Вµ РІвЂ вЂ™ Р Р† Р С‘РЎРѓРЎвЂљР С•РЎР‚Р С‘РЎР‹ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
      extra = durStr ? `${durStr} Р’В· ${ds}, ${ts}` : `${ds}, ${ts}`;
    }
    // РњРµС‚РєР° РґР»СЏ Р·РІРѕРЅРёРјРѕРіРѕ (callee) вЂ” РѕС‚РґРµР»СЊРЅР°СЏ С‡С‚РѕР±С‹ РєР°Р¶РґС‹Р№ РІРёРґРµР» СЃРІРѕС‘
    let labelCallee, extraCallee;
    if (missed) {
      labelCallee = `РџСЂРѕРїСѓС‰РµРЅРЅС‹Р№ ${type}`;
      extraCallee = `${ds}, ${ts}`;
    } else {
      const durStr2 = dur > 0 ? (dur < 60 ? `${dur} СЃРµРє` : `${Math.floor(dur/60)} РјРёРЅ ${dur % 60} СЃРµРє`) : '';
      labelCallee = type;
      extraCallee = durStr2 ? `${durStr2} Р’В· ${ds}, ${ts}` : `${ds}, ${ts}`;
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

  // РІвЂќР‚РІвЂќР‚ Read receipts РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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

  socket.on('human-bot-heard', ({ room, text, final, alternatives }) => {
    if (!currentUser || !room || !text) return;
    const clean = humanBotNormalizeCallTranscript(text);
    const normalizedAlternatives = Array.isArray(alternatives)
      ? alternatives.map(a => humanBotNormalizeCallTranscript(a)).filter(Boolean).slice(0, 3)
      : [];
    if (!clean) return;
    const key = `${currentUser}|${room}`;
    const prev = humanBotHeardLastEmitted.get(key);
    if (prev?.text === clean && (Date.now() - Number(prev.at || 0)) < 1800) return;
    const pending = { text: clean, final: !!final, room: String(room), user: currentUser, alternatives: normalizedAlternatives };
    const delay = pending.final ? 40 : (clean.length < 18 ? 160 : 280);
    if (humanBotHeardTimers.has(key)) clearTimeout(humanBotHeardTimers.get(key));
    humanBotHeardTimers.set(key, setTimeout(() => {
      humanBotHeardTimers.delete(key);
      const again = humanBotHeardLastEmitted.get(key);
      if (again?.text === pending.text && (Date.now() - Number(again.at || 0)) < 1800) return;
      humanBotHeardLastEmitted.set(key, { text: pending.text, at: Date.now() });
      const synthetic = {
        id: Date.now() + Math.random(),
        user: pending.user,
        text: pending.text,
        type: 'text',
        room: pending.room,
        ts: Date.now(),
        callTranscript: true,
        callTranscriptFinal: pending.final,
        callTranscriptQuick: !pending.final,
        callTranscriptAlternatives: pending.alternatives,
        readBy: [pending.user],
      };
      scheduleHumanBotsForMessage(synthetic);
    }, delay));
  });

  socket.on('call-end', data => {
    if (isHumanBotUsername(data?.to) && data?.groupId) {
      const room = `group:${data.groupId}`;
      humanBotClearGroupCallSession(data.to, room);
      emitToGroupMembers(data.groupId, 'call-bot-group-left', { room, groupId: data.groupId, username: data.to });
      return;
    }
    if (isHumanBotUsername(data?.to) || isHumanBotUsername(data?.from)) {
      const botUsername = isHumanBotUsername(data?.to) ? data.to : data.from;
      const other = botUsername === data?.to ? data.from : data.to;
      if (other) humanBotClearCallSession(botUsername, other);
      if (other && botUsername === data?.from) humanBotEmitCallToUser(other, 'call-bot-ended', { from: botUsername });
      return;
    }
    if (data?.groupId) {
      activeCalls.delete(data.to);
      const toId = userSockets.get(data.to);
      if (toId) io.to(toId).emit('call-end', data);
      return;
    }
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
    if (isHumanBotUsername(data?.to) && data?.groupId) {
      const room = `group:${data.groupId}`;
      humanBotClearGroupCallSession(data.to, room);
      return;
    }
    if (isHumanBotUsername(data?.to) || isHumanBotUsername(data?.from)) {
      const botUsername = isHumanBotUsername(data?.to) ? data.to : data.from;
      const other = botUsername === data?.to ? data.from : data.to;
      if (other) humanBotClearCallSession(botUsername, other);
    }
    activeCalls.delete(data.to);
    activeCalls.delete(data.from);
    // Р”Р»СЏ РіСЂСѓРїРїРѕРІРѕРіРѕ Р·РІРѕРЅРєР°: С€Р»С‘Рј С‚РѕР»СЊРєРѕ Р·РІРѕРЅСЏС‰РµРјСѓ (РЅРµ РѕР±СЂР°С‚РЅРѕ РѕС‚РєР»РѕРЅРёРІС€РµРјСѓ)
    const toId = userSockets.get(data.to);
    if (toId) io.to(toId).emit('call-decline', { from: data.from, groupId: data.groupId });
  });
  socket.on('call-answer-ready', data => {
    // Callee answered РІР‚вЂќ clear active call
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
// РІвЂќР‚РІвЂќР‚ Р СџР ВµРЎР‚Р С‘Р С•Р Т‘Р С‘РЎвЂЎР ВµРЎРѓР С”Р С‘Р в„– Р В°Р Р†РЎвЂљР С•РЎРѓР ВµР в„–Р Р† Р С”Р В°Р В¶Р Т‘РЎвЂ№Р Вµ 5 Р СР С‘Р Р…РЎС“РЎвЂљ РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
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
  scheduleHumanBotProactiveLoop();
});


