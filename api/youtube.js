/* ============================================================
   /api/youtube — YouTube 搜尋代理（Vercel Serverless Function）

   金鑰放在環境變數，前端只送關鍵字。
   預設沿用 GEMINI_API_KEY（同一個 Google Cloud 專案的金鑰，
   只要啟用 YouTube Data API v3 就能共用）；也可另外設 YOUTUBE_API_KEY。
   ============================================================ */

function allowedOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  return !origin ||
    origin.includes('gsat-war-room') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: '只接受 POST' }); return; }
  if (!allowedOrigin(req)) { res.status(403).json({ error: '來源不允許' }); return; }

  const key = process.env.YOUTUBE_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) { res.status(500).json({ error: '伺服器尚未設定 API 金鑰' }); return; }

  const q = (req.body?.q || '').trim();
  if (!q) { res.status(400).json({ error: '沒有收到搜尋關鍵字' }); return; }

  try {
    const url = 'https://www.googleapis.com/youtube/v3/search?' + new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: '8',
      videoEmbeddable: 'true',   // 只回傳可嵌入的，避免點了播不出來
      videoCategoryId: '10',     // 音樂類
      q,
      key
    });

    const r = await fetch(url);
    if (!r.ok) {
      const detail = await r.text();
      // API 沒啟用是最常見的狀況，給出可以直接照做的訊息
      if (detail.includes('has not been used in project') || detail.includes('is disabled')) {
        res.status(503).json({ error: '尚未啟用 YouTube Data API v3。到 Google Cloud Console 啟用後即可搜尋。' });
        return;
      }
      if (r.status === 403) {
        res.status(503).json({ error: '搜尋額度用完了，明天會重置。可以先直接貼網址。' });
        return;
      }
      throw new Error(`YouTube ${r.status}: ${detail.slice(0, 200)}`);
    }

    const data = await r.json();
    res.status(200).json({
      items: (data.items || []).map((it) => ({
        id: it.id?.videoId,
        title: it.snippet?.title || '',
        channel: it.snippet?.channelTitle || '',
        thumb: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || ''
      })).filter((x) => x.id)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
};
