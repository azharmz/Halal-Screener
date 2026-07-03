// functions/api/process.js
// POST /api/process — fetch raw data dari Firestore, merge, simpan ke stocks/result

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-upload-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const RSCORE = {'A+':9,'A':8,'A-':7,'B+':6,'B':5,'B-':4,'C+':3,'C':2,'C-':1};

// Error yang sengaja dibuat informatif buat user (mis. "upload dulu") aman ditampilkan apa adanya.
// Error lain (detail internal Firestore, parse error, dsb) HARUS diganti pesan generik ke client.
function userError(msg) { const e = new Error(msg); e.userSafe = true; return e; }

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(ctx) {
  const secret = ctx.request.headers.get('x-upload-secret') || '';
  if (!secret || secret !== ctx.env.UPLOAD_SECRET)
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });

  try {
    const projectId = ctx.env.FIREBASE_PROJECT_ID;
    const apiKey    = ctx.env.FIREBASE_API_KEY;
    const baseUrl   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/stocks`;

    // Fetch ketiga raw dokumen sekaligus
    const [tvRes, muRes, xtRes] = await Promise.all([
      fetch(`${baseUrl}/raw_tv?key=${apiKey}`),
      fetch(`${baseUrl}/raw_mu?key=${apiKey}`),
      fetch(`${baseUrl}/raw_xt?key=${apiKey}`),
    ]);

    if (!tvRes.ok) throw userError('raw_tv tidak ditemukan. Upload TradingView dulu.');
    if (!muRes.ok) throw userError('raw_mu tidak ditemukan. Upload Musaffa dulu.');
    if (!xtRes.ok) throw userError('raw_xt tidak ditemukan. Upload XTB dulu.');

    const [tvDoc, muDoc, xtDoc] = await Promise.all([tvRes.json(), muRes.json(), xtRes.json()]);

    const tvRows = JSON.parse(tvDoc.fields.data.stringValue);
    const muRows = JSON.parse(muDoc.fields.data.stringValue);
    const xtRows = JSON.parse(xtDoc.fields.data.stringValue);

    // Stats independen — dihitung dari sumber masing-masing
    const statTV    = tvRows.length;
    const statHalal = muRows.length;
    const statXTB   = xtRows.length;

    // Build Musaffa map: ticker → {rating, score, sector, name, muUrl}
    const muMap = {};
    muRows.forEach(r => {
      const ticker = normTicker(r.ticker, false);
      const rt     = normRating(r.rating);
      if (ticker && RSCORE[rt] !== undefined)
        muMap[ticker] = { rating: rt, score: RSCORE[rt], sector: r.sector||'', name: r.name||'', muUrl: r.muUrl||'' };
    });

    // Build XTB set: ticker → name
    const xtSet = new Set(), xtNameMap = {};
    xtRows.forEach(r => {
      const ticker = normTicker(r.ticker, false);
      if (ticker) { xtSet.add(ticker); xtNameMap[ticker] = r.name||''; }
    });

    // Merge: TV × Musaffa × XTB
    const stocks = [];
    tvRows.forEach(r => {
      const ticker = normTicker(r.ticker, false); if (!ticker) return;
      const mu     = muMap[ticker];              if (!mu) return;
      if (!xtSet.has(ticker)) return;

      stocks.push({
        ticker,
        name:   xtNameMap[ticker] || mu.name || r.name || '',
        rating: mu.rating,
        score:  mu.score,
        sector: mu.sector,
        muUrl:  mu.muUrl,
        price:  r.price  || 0,
        mcap:   r.mcap   || 0,
        signal: r.signal || '',
        chg:    r.chg    !== undefined ? r.chg : null,
        tvUrl:  r.tvUrl  || '',
      });
    });

    // Simpan hasil ke stocks/result
    const resultDoc = {
      fields: {
        data:      { stringValue: JSON.stringify(stocks) },
        count:     { integerValue: String(stocks.length) },
        statTV:    { integerValue: String(statTV) },
        statHalal: { integerValue: String(statHalal) },
        statXTB:   { integerValue: String(statXTB) },
        updatedAt: { stringValue: new Date().toISOString() },
      }
    };

    const saveRes = await fetch(`${baseUrl}/result?key=${apiKey}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(resultDoc),
    });
    if (!saveRes.ok) {
      const errDetail = await saveRes.text();
      console.error('Gagal simpan result ke Firestore:', errDetail);
      throw userError('Gagal menyimpan hasil ke database');
    }

    return Response.json({ ok: true, count: stocks.length, statTV, statHalal, statXTB }, { headers: CORS });

  } catch (err) {
    console.error('POST /api/process error:', err);
    const msg = err.userSafe ? err.message : 'Gagal memproses data';
    return Response.json({ error: msg }, { status: 500, headers: CORS });
  }
}

function normTicker(v, isXTB) {
  const s = String(v||'').trim();
  if (isXTB) {
    const m = s.match(/\/([^\/]+?)(?:_[a-z]{2})?\.svg$/i);
    if (m) return m[1].toUpperCase();
    return s.toUpperCase().replace(/\s+/g,'');
  }
  return s.toUpperCase().replace(/\.US$/i,'').replace(/\s+/g,'');
}
function normRating(v) { return String(v||'').trim().toUpperCase().replace(/\s+/g,''); }
