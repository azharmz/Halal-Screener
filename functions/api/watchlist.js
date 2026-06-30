// functions/api/watchlist.js
// GET  /api/watchlist — ambil seluruh riwayat watchlist
// POST /api/watchlist — tambah entry baru (APPEND, tidak menimpa riwayat lama), butuh x-upload-secret
// Body POST: { entries: [...] }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-upload-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

function docUrl(projectId, apiKey) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/stocks/watchlist?key=${apiKey}`;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(ctx) {
  try {
    const projectId = ctx.env.FIREBASE_PROJECT_ID;
    const apiKey    = ctx.env.FIREBASE_API_KEY;
    const res = await fetch(docUrl(projectId, apiKey));

    if (res.status === 404) {
      return Response.json({ entries: [], count: 0, updatedAt: null }, { headers: CORS });
    }
    if (!res.ok) { const err = await res.text(); throw new Error(`Firestore error ${res.status}: ${err}`); }

    const doc     = await res.json();
    const entries = JSON.parse(doc.fields?.data?.stringValue || '[]');

    return Response.json({
      entries,
      count:     entries.length,
      updatedAt: doc.fields?.updatedAt?.stringValue || null,
    }, { headers: CORS });

  } catch (err) {
    console.error('GET /api/watchlist error:', err);
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
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
    const url       = docUrl(projectId, apiKey);

    // Ambil riwayat lama dulu (kalau dokumennya belum ada, mulai dari array kosong)
    const getRes = await fetch(url);
    let existing = [];
    if (getRes.ok) {
      const doc = await getRes.json();
      existing  = JSON.parse(doc.fields?.data?.stringValue || '[]');
    } else if (getRes.status !== 404) {
      const err = await getRes.text();
      throw new Error(`Gagal baca watchlist lama: ${err}`);
    }

    // Append sebagai riwayat — TIDAK menimpa entry lama meski ticker sama
    const stamped = newEntries.map(e => ({
      ...e,
      id:      e.id || (e.ticker + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      savedAt: new Date().toISOString(),
    }));
    const merged = existing.concat(stamped);

    const saveDoc = {
      fields: {
        data:      { stringValue: JSON.stringify(merged) },
        count:     { integerValue: String(merged.length) },
        updatedAt: { stringValue: new Date().toISOString() },
      }
    };
    const saveRes = await fetch(url, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(saveDoc),
    });
    if (!saveRes.ok) { const err = await saveRes.text(); throw new Error(`Gagal simpan watchlist: ${err}`); }

    return Response.json({ ok: true, added: stamped.length, total: merged.length }, { headers: CORS });

  } catch (err) {
    console.error('POST /api/watchlist error:', err);
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
