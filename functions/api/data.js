// functions/api/data.js
// GET /api/data — ambil stocks/result dari Firestore

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequestGet(ctx) {
  try {
    const projectId = ctx.env.FIREBASE_PROJECT_ID;
    const apiKey    = ctx.env.FIREBASE_API_KEY;

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/stocks/result?key=${apiKey}`;
    const res  = await fetch(url);

    if (res.status === 404)
      return Response.json({ stocks:[], updatedAt:null, statTV:0, statHalal:0, statXTB:0 }, { headers: HEADERS });
    if (!res.ok) { const err = await res.text(); throw new Error(`Firestore error ${res.status}: ${err}`); }

    const doc = await res.json();
    const f   = doc.fields;

    const stocks    = JSON.parse(f.data?.stringValue || '[]');
    const updatedAt = f.updatedAt?.stringValue || null;
    const statTV    = Number(f.statTV?.integerValue    || 0);
    const statHalal = Number(f.statHalal?.integerValue || 0);
    const statXTB   = Number(f.statXTB?.integerValue   || 0);

    return Response.json({ stocks, updatedAt, statTV, statHalal, statXTB }, { headers: HEADERS });

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
