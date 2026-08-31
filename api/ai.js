/* ============================================================
   /api/ai — Gemini 代理（Vercel Serverless Function）

   金鑰放在 Vercel 環境變數 GEMINI_API_KEY，永遠不會出現在前端。
   前端只送出圖片或文字，由這裡代為呼叫 Gemini。

   兩種模式：
   - extract：讀圖片，回傳題目簡述、科目、單元
   - reflect：看學生自己寫的「我錯在哪」，給一次回饋就停，不追加提示
   ============================================================ */

/* 模型會退役（gemini-2.0-flash 就是這樣 404 的）。
   預設用 gemini-flash-latest 這個永遠指向現行 flash 的別名，
   另外準備後備清單，單一模型下架不會讓功能整個停擺。
   要指定特定模型就設環境變數 GEMINI_MODEL。 */
const MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-flash-latest',
  'gemini-2.5-flash'
].filter(Boolean);

const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const SUBJECTS = ['國文', '英文', '數A', '物理', '化學', '生物', '地科'];
const REASONS = ['觀念混淆', '計算失誤', '審題粗心', '公式不熟', '題型新穎'];

/* 只接受來自自己網站的請求。擋不了刻意偽造，但能擋掉大部分濫用。 */
function allowedOrigin(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  return !origin ||
    origin.includes('gsat-war-room') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1');
}

async function callGemini(key, parts, schema) {
  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  };

  let lastErr = '';
  for (const model of MODELS) {
    const res = await fetch(ENDPOINT(model, key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini 沒有回傳內容');
      return JSON.parse(text);
    }

    lastErr = `${res.status} ${(await res.text()).slice(0, 200)}`;
    // 模型不存在或已下架才換下一個；其他錯誤（金鑰無效、額度用盡）直接回報
    if (res.status !== 404) break;
    console.warn(`模型 ${model} 不可用，改試下一個：${lastErr}`);
  }
  throw new Error(`Gemini ${lastErr}`);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: '只接受 POST' }); return; }
  if (!allowedOrigin(req)) { res.status(403).json({ error: '來源不允許' }); return; }

  const key = process.env.GEMINI_API_KEY;
  if (!key) { res.status(500).json({ error: '伺服器尚未設定 GEMINI_API_KEY' }); return; }

  try {
    const { mode, image, mimeType, question, myError, subject } = req.body || {};

    /* ---------- 讀題自動填表 ---------- */
    if (mode === 'extract') {
      if (!image) { res.status(400).json({ error: '沒有收到圖片' }); return; }

      const parts = [
        {
          text: `你是台灣高中生的學習助手。這是一張考題的截圖或照片。

請完成：
1. summary：用一句話描述這題在考什麼（20 字以內，繁體中文）。不要抄整段題目，也不要寫出答案。
2. subject：從這些選一個最貼近的科目：${SUBJECTS.join('、')}
3. unit：這題所屬的高中課程單元名稱（10 字以內，例如「等速圓周運動」「動態平衡」）。判斷不出來就回空字串。

重要：不要提供答案或解題步驟，學生要自己想。`
        },
        { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } }
      ];

      const schema = {
        type: 'OBJECT',
        properties: {
          summary: { type: 'STRING' },
          subject: { type: 'STRING', enum: SUBJECTS },
          unit: { type: 'STRING' }
        },
        required: ['summary', 'subject', 'unit']
      };

      res.status(200).json(await callGemini(key, parts, schema));
      return;
    }

    /* ---------- 反思回饋：評一次就停 ---------- */
    if (mode === 'reflect') {
      if (!myError) { res.status(400).json({ error: '沒有收到自我診斷' }); return; }

      const parts = [{
        text: `你是台灣高中生的學習教練。學生做錯了一題，現在他自己寫下了「我覺得我錯在哪」。

題目：${question || '（未提供）'}
科目：${subject || '（未提供）'}
學生的自我診斷：${myError}

請完成：
1. verdict：判斷他的自我診斷是否切中要害，只能是 "準確"、"部分正確" 或 "還沒抓到"
2. feedback：兩到三句話的回饋（繁體中文）。如果他抓對了就確認並補一句該注意什麼；
   如果沒抓對，指出他忽略的方向，但**不要直接給答案或完整解法**。
3. reasons：從這些選出最符合的錯誤類型，可多選也可空陣列：${REASONS.join('、')}

重要原則：這是他唯一一次回饋，之後不會再給提示。所以要精準，但要留空間讓他自己完成最後一步。
不要說「你可以再想想」這種空話，要具體指出方向。`
      }];

      const schema = {
        type: 'OBJECT',
        properties: {
          verdict: { type: 'STRING', enum: ['準確', '部分正確', '還沒抓到'] },
          feedback: { type: 'STRING' },
          reasons: { type: 'ARRAY', items: { type: 'STRING', enum: REASONS } }
        },
        required: ['verdict', 'feedback', 'reasons']
      };

      res.status(200).json(await callGemini(key, parts, schema));
      return;
    }

    res.status(400).json({ error: '未知的模式' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
};
