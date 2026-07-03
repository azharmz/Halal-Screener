// functions/api/watchlist.js
// GET  /api/watchlist — ambil seluruh riwayat watchlist (1 dokumen Firestore = 1 entry sinyal)
// POST /api/watchlist — tambah entry baru (create dokumen baru per entry), butuh x-upload-secret
// Body POST: { entries: [...] }
//
// Catatan desain: dulu semua entry ditumpuk jadi 1 dokumen blob (stocks/watchlist),
// tapi karena riwayat watchlist numpuk terus (append forever), itu berisiko kena
// limit ukuran dokumen Firestore (~1 MiB). Sekarang tiap entry jadi dokumen sendiri
// di collection 'watchlist' — gak ada limit ukuran gabungan, mau nyimpen ribuan
// entry sekalipun tetap aman.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-upload-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const COLLECTION = 'watchlist'; // top-level collection, terpisah dari collection 'stocks'

function baseUrl(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// ── Konversi objek JS biasa <-> format fields Firestore (rekursif, support nested object/array) ──
function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'number')  return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'string')  return { stringValue: v };
  if (Array.isArray(v))       return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object')  return { mapValue: { fields: toFirestoreFields(v) } };
  return { stringValue: String(v) };
}
function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v);
  return fields;
}
function fromFirestoreValue(val) {
  if (!val) return null;
  if (val.nullValue !== undefined)      return null;
  if (val.integerValue !== undefined)   return parseInt(val.integerValue, 10);
  if (val.doubleValue !== undefined)    return val.doubleValue;
  if (val.booleanValue !== undefined)   return val.booleanValue;
  if (val.stringValue !== undefined)    return val.stringValue;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.arrayValue !== undefined)     return (val.arrayValue.values || []).map(fromFirestoreValue);
  if (val.mapValue !== undefined)       return fromFirestoreFields(val.mapValue.fields || {});
  return null;
}
function fromFirestoreFields(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields || {})) obj[k] = fromFirestoreValue(v);
  return obj;
}

export async function onRequestGet(ctx) {
  try {
    const projectId = ctx.env.FIREBASE_PROJECT_ID;
    const apiKey    = ctx.env.FIREBASE_API_KEY;
    if (!projectId || !apiKey) throw new Error('ENV_MISSING');

    // Ambil semua dokumen di collection 'watchlist', urut terbaru dulu.
    // TODO: kalau suatu saat entry-nya ribuan+, tambahkan pagination (nextPageToken).
    const url = `${baseUrl(projectId)}/${COLLECTION}?key=${apiKey}&pageSize=1000&orderBy=savedAt%20desc`;
    const res = await fetch(url);
    if (!res.ok) { const err = await res.text(); throw new Error(`Firestore error ${res.status}: ${err}`); }

    const json = await res.json();
    const docs = json.documents || [];
    const entries = docs.map(d => ({
      id: d.name.split('/').pop(),
      ...fromFirestoreFields(d.fields),
    }));

    return Response.json({
      entries, count: entries.length,
      updatedAt: entries[0]?.savedAt || null,
    }, { headers: CORS });

  } catch (err) {
    console.error('GET /api/watchlist error:', err);
    return Response.json({ error: 'Gagal mengambil watchlist' }, { status: 500, headers: CORS });
  }
}

export async function onRequestPost(ctx) {
  const secret = ctx.request.headers.get('x-upload-secret') || '';
  if (!secret || secret !== ctx.env.UPLOAD_SECRET)
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

  let body;
  try { body = await ctx.request.json(); }
  catch { return Response.json({ error: 'Body bukan JSON valid' }, { status: 400, headers: CORS }); }

  const newEntries = body.entries;
  if (!Array.isArray(newEntries) || newEntries.length === 0)
    return Response.json({ error: 'entries kosong' }, { status: 400, headers: CORS });

  try {
    const projectId = ctx.env.FIREBASE_PROJECT_ID;
    const apiKey    = ctx.env.FIREBASE_API_KEY;
    if (!projectId || !apiKey) throw new Error('ENV_MISSING');

    const url = `${baseUrl(projectId)}/${COLLECTION}?key=${apiKey}`;

    // Tiap entry jadi 1 dokumen Firestore sendiri (auto-ID) — bukan digabung jadi 1 blob lagi.
    const results = await Promise.all(newEntries.map(e => {
      const stamped = { ...e, savedAt: new Date().toISOString() };
      return fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fields: toFirestoreFields(stamped) }),
      });
    }));

    const failed = results.filter(r => !r.ok);
    if (failed.length) {
      const errText = await failed[0].text();
      console.error(`POST /api/watchlist: ${failed.length} entry gagal:`, errText);
      throw new Error(`${failed.length} dari ${newEntries.length} entry gagal disimpan`);
    }

    return Response.json({ ok: true, added: newEntries.length }, { headers: CORS });

  } catch (err) {
    console.error('POST /api/watchlist error:', err);
    return Response.json({ error: 'Gagal menyimpan watchlist' }, { status: 500, headers: CORS });
  }
}
