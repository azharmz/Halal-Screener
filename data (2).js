// functions/api/data.js
// GET /api/data — ambil data saham dari Firestore
// Format: Cloudflare Pages Functions (ES Modules)

export async function onRequestGet(ctx) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const projectId = ctx.env.FIREBASE_PROJECT_ID;
    const apiKey    = ctx.env.FIREBASE_API_KEY;

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/stocks/latest?key=${apiKey}`;
    const res  = await fetch(url);

    if (res.status === 404) {
      return Response.json({ stocks: [], updatedAt: null, statTV: 0, statHalal: 0, statXTB: 0 }, { headers });
    }
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Firestore error ${res.status}: ${err}`);
    }

    const doc = await res.json();
    const raw = doc.fields;

    const stocks = (raw.stocks?.arrayValue?.values || []).map(v => {
      const f = v.mapValue.fields;
      let chg = null;
      if (f.chg?.doubleValue  !== undefined) chg = Number(f.chg.doubleValue);
      else if (f.chg?.integerValue !== undefined) chg = Number(f.chg.integerValue);

      return {
        ticker: f.ticker?.stringValue || '',
        name:   f.name?.stringValue   || '',
        rating: f.rating?.stringValue || '',
        score:  Number(f.score?.integerValue  || f.score?.doubleValue  || 0),
        price:  Number(f.price?.doubleValue   || f.price?.integerValue || 0),
        mcap:   Number(f.mcap?.doubleValue    || f.mcap?.integerValue  || 0),
        signal: f.signal?.stringValue || '',
        sector: f.sector?.stringValue || '',
        chg,
        tvUrl:  f.tvUrl?.stringValue  || '',
        muUrl:  f.muUrl?.stringValue  || '',
        inXTB:  f.inXTB?.booleanValue !== false,
      };
    });

    return Response.json({
      stocks,
      updatedAt: raw.updatedAt?.stringValue  || null,
      statTV:    Number(raw.statTV?.integerValue    || 0),
      statHalal: Number(raw.statHalal?.integerValue || 0),
      statXTB:   Number(raw.statXTB?.integerValue   || 0),
    }, { headers });

  } catch (err) {
    console.error('GET /api/data error:', err);
    return Response.json({ error: err.message }, { status: 500, headers });
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-upload-secret',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}
