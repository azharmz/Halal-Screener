// functions/api/data.js
// GET /api/data — ambil stocks/result + raw_mu + raw_xt dari Firestore

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

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

    // Fetch result + raw tv + raw musaffa + raw xtb sekaligus
    const [resultRaw, tvRaw, muRaw, xtRaw] = await Promise.all([
      fetchDoc(projectId, apiKey, 'result'),
      fetchDoc(projectId, apiKey, 'raw_tv'),
      fetchDoc(projectId, apiKey, 'raw_mu'),
      fetchDoc(projectId, apiKey, 'raw_xt'),
    ]);

    if (!resultRaw) {
      return Response.json({ stocks:[], tv:[], musaffa:[], xtb:[], updatedAt:null, statTV:0, statHalal:0, statXTB:0 }, { headers: HEADERS });
    }

    const stocks  = JSON.parse(resultRaw.data?.stringValue || '[]');
    const tv      = tvRaw ? JSON.parse(tvRaw.data?.stringValue || '[]') : [];
    const musaffa = muRaw ? JSON.parse(muRaw.data?.stringValue || '[]') : [];
    const xtb     = xtRaw ? JSON.parse(xtRaw.data?.stringValue || '[]') : [];

    return Response.json({
      stocks, tv, musaffa, xtb,
      updatedAt:  resultRaw.updatedAt?.stringValue  || null,
      statTV:     Number(resultRaw.statTV?.integerValue    || 0),
      statHalal:  Number(resultRaw.statHalal?.integerValue || 0),
      statXTB:    Number(resultRaw.statXTB?.integerValue   || 0),
    }, { headers: HEADERS });

  } catch (err) {
    console.error('GET /api/data error:', err);
    return Response.json({ error: 'Gagal mengambil data' }, { status: 500, headers: HEADERS });
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
