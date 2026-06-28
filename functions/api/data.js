// functions/api/data.js
// GET /api/data — ambil data dari Firestore
// Mengembalikan: stocks/latest + stocks/musaffa + stocks/xtb

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function parseStocks(raw) {
  return (raw?.stocks?.arrayValue?.values || []).map(v => {
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
    };
  });
}

async function fetchDoc(projectId, apiKey, docId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/stocks/${docId}?key=${apiKey}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) { const err = await res.text(); throw new Error(`Firestore error ${res.status} (${docId}): ${err}`); }
  const doc = await res.json();
  return doc.fields;
}

export async function onRequestGet(ctx) {
  try {
    const projectId = ctx.env.FIREBASE_PROJECT_ID;
    const apiKey    = ctx.env.FIREBASE_API_KEY;

    // Fetch ketiga dokumen sekaligus (parallel)
    const [latestRaw, musaffaRaw, xtbRaw] = await Promise.all([
      fetchDoc(projectId, apiKey, 'latest'),
      fetchDoc(projectId, apiKey, 'musaffa'),
      fetchDoc(projectId, apiKey, 'xtb'),
    ]);

    if (!latestRaw) {
      return Response.json({ stocks:[], musaffa:[], xtb:[], updatedAt:null, statTV:0, statHalal:0, statXTB:0 }, { headers: HEADERS });
    }

    const stocks  = parseStocks(latestRaw);

    // musaffa: hanya butuh ticker, rating, score, sector, name, muUrl
    const musaffa = parseStocks(musaffaRaw || {});

    // xtb: hanya butuh ticker dan nama
    const xtb = ((xtbRaw?.stocks?.arrayValue?.values) || []).map(v => ({
      ticker: v.mapValue.fields.ticker?.stringValue || '',
      name:   v.mapValue.fields.name?.stringValue   || '',
    }));

    return Response.json({
      stocks,
      musaffa,
      xtb,
      updatedAt: latestRaw.updatedAt?.stringValue  || null,
      statTV:    Number(latestRaw.statTV?.integerValue    || 0),
      statHalal: Number(latestRaw.statHalal?.integerValue || 0),
      statXTB:   Number(latestRaw.statXTB?.integerValue   || 0),
    }, { headers: HEADERS });

  } catch (err) {
    console.error('GET /api/data error:', err);
    return Response.json({ error: err.message }, { status: 500, headers: HEADERS });
  }
}

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
