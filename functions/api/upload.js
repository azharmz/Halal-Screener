// functions/api/upload.js
// POST /api/upload — simpan raw data per sumber ke Firestore
// Body: { source: 'tv'|'mu'|'xt', rows: [...], secret }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-upload-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(ctx) {
  const secret = ctx.request.headers.get('x-upload-secret') || '';
  if (!secret || secret !== ctx.env.UPLOAD_SECRET)
    return Response.json({ error: 'Unauthorized: secret key salah' }, { status: 401, headers: CORS });

  let body;
  try { body = await ctx.request.json(); }
  catch { return Response.json({ error: 'Body bukan JSON valid' }, { status: 400, headers: CORS }); }

  const { source, rows } = body;
  if (!['tv','mu','xt'].includes(source))
    return Response.json({ error: 'source harus tv, mu, atau xt' }, { status: 400, headers: CORS });
  if (!Array.isArray(rows) || rows.length === 0)
    return Response.json({ error: 'rows kosong' }, { status: 400, headers: CORS });

  try {
    const projectId = ctx.env.FIREBASE_PROJECT_ID;
    const apiKey    = ctx.env.FIREBASE_API_KEY;

    // Konversi rows ke Firestore format — simpan sebagai JSON string
    // (lebih efisien dan tidak kena limit nested object Firestore)
    const doc = {
      fields: {
        data:      { stringValue: JSON.stringify(rows) },
        count:     { integerValue: String(rows.length) },
        updatedAt: { stringValue: new Date().toISOString() },
      }
    };

    const docId = source === 'tv' ? 'raw_tv' : source === 'mu' ? 'raw_mu' : 'raw_xt';
    const url   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/stocks/${docId}?key=${apiKey}`;
    const res   = await fetch(url, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(doc),
    });

    if (!res.ok) { const err = await res.text(); throw new Error(`Firestore error ${res.status}: ${err}`); }

    return Response.json({ ok: true, source, count: rows.length }, { headers: CORS });

  } catch (err) {
    console.error('POST /api/upload error:', err);
    return Response.json({ error: err.message }, { status: 500, headers: CORS });
  }
}
