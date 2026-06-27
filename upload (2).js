// functions/api/upload.js
// POST /api/upload — simpan data saham ke Firestore (butuh x-upload-secret)
// Format: Cloudflare Pages Functions (ES Modules)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-upload-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(ctx) {
  // Cek secret key
  const secret = ctx.request.headers.get('x-upload-secret') || '';
  if (!secret || secret !== ctx.env.UPLOAD_SECRET) {
    return Response.json({ error: 'Unauthorized: secret key salah' }, { status: 401, headers: CORS_HEADERS });
  }

  // Parse body
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return Response.json({ error: 'Body bukan JSON valid' }, { status: 400, headers: CORS_HEADERS });
  }

  const { stocks, statTV, statHalal, statXTB } = body;
  if (!Array.isArray(stocks) || stocks.length === 0) {
    return Response.json({ error: 'Field stocks kosong' }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const projectId = ctx.env.FIREBASE_PROJECT_ID;
    const apiKey    = ctx.env.FIREBASE_API_KEY;

    const firestoreStocks = {
      arrayValue: {
        values: stocks.map(s => ({
          mapValue: {
            fields: {
              ticker: { stringValue: String(s.ticker || '') },
              name:   { stringValue: String(s.name   || '') },
              rating: { stringValue: String(s.rating || '') },
              score:  { integerValue: String(Number(s.score) || 0) },
              price:  { doubleValue:  Number(s.price)  || 0 },
              mcap:   { doubleValue:  Number(s.mcap)   || 0 },
              signal: { stringValue: String(s.signal || '') },
              sector: { stringValue: String(s.sector || '') },
              chg:    s.chg !== null && s.chg !== undefined && !isNaN(s.chg)
                        ? { doubleValue: Number(s.chg) }
                        : { nullValue: 'NULL_VALUE' },
              tvUrl:  { stringValue: String(s.tvUrl  || '') },
              muUrl:  { stringValue: String(s.muUrl  || '') },
              inXTB:  { booleanValue: s.inXTB !== false },
            }
          }
        }))
      }
    };

    const doc = {
      fields: {
        stocks:    firestoreStocks,
        updatedAt: { stringValue: new Date().toISOString() },
        count:     { integerValue: String(stocks.length) },
        statTV:    { integerValue: String(statTV    || 0) },
        statHalal: { integerValue: String(statHalal || 0) },
        statXTB:   { integerValue: String(statXTB   || 0) },
      }
    };

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/stocks/latest?key=${apiKey}`;
    const res = await fetch(url, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(doc),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Firestore error ${res.status}: ${err}`);
    }

    return Response.json({ ok: true, count: stocks.length }, { headers: CORS_HEADERS });

  } catch (err) {
    console.error('POST /api/upload error:', err);
    return Response.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
