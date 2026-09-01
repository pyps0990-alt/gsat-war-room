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
      // 讀 Google 回傳的結構化錯誤代碼，比猜訊息字串可靠
      let reason = '', message = '';
      try {
        const e = JSON.parse(detail).error;
        reason = e?.errors?.[0]?.reason || e?.status || '';
        message = e?.message || '';
      } catch { message = detail.slice(0, 200); }

      const known = {
        accessNotConfigured: '尚未啟用 YouTube Data API v3。到 Google Cloud Console 對這個專案啟用後就能搜尋。',
        quotaExceeded: '今天的搜尋額度用完了，明天會重置。可以先直接貼網址。',
        dailyLimitExceeded: '今天的搜尋額度用完了，明天會重置。可以先直接貼網址。',
        rateLimitExceeded: '搜尋太頻繁，稍等一下再試。',
        keyInvalid: 'API 金鑰無效，請確認 Vercel 的環境變數。',
        forbidden: '金鑰沒有呼叫 YouTube Data API 的權限，請確認金鑰的 API 限制設定。'
      };

      res.status(503).json({
        error: known[reason] || `YouTube 回應 ${r.status}${reason ? `（${reason}）` : ''}：${message}`
      });
      return;
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
