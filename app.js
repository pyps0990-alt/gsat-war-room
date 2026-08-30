/* ============================================================
   學測戰情室 — app.js
   資料存在瀏覽器：結構化資料走 localStorage，圖片走 IndexedDB。
   ============================================================ */
(() => {
  'use strict';

  const KEY = 'gsat-war-room-v1';
  const POINT_VALUE = 2;            // 1 點 = 2 元
  const TASKS = ['study', 'fix', 'todo'];
  const REVIEW_STEPS = [1, 3, 7, 30]; // 天
  const SUBJECTS = ['國文', '英文', '數A', '物理', '化學', '生物', '地科'];
  const REASONS = ['觀念混淆', '計算失誤', '審題粗心', '公式不熟', '題型新穎'];
  const MILESTONES = [7, 14, 30, 50, 100];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ---------- 每日金句 ----------
     古語出自公共領域典籍；未標出處者為本站自撰。 */
  const QUOTES = [
    ['不積跬步，無以至千里；不積小流，無以成江海。', '荀子・勸學'],
    ['鍥而不捨，金石可鏤。', '荀子・勸學'],
    ['學而不思則罔，思而不學則殆。', '論語・為政'],
    ['知之者不如好之者，好之者不如樂之者。', '論語・雍也'],
    ['譬如為山，未成一簣，止，吾止也。', '論語・子罕'],
    ['天行健，君子以自強不息。', '易經・乾卦'],
    ['千里之行，始於足下。', '老子・道德經'],
    ['合抱之木，生於毫末；九層之臺，起於累土。', '老子・道德經'],
    ['業精於勤，荒於嬉；行成於思，毀於隨。', '韓愈・進學解'],
    ['讀書之法，在循序而漸進，熟讀而精思。', '朱熹'],
    ['寶劍鋒從磨礪出，梅花香自苦寒來。', '警世賢文'],
    ['書山有路勤為徑，學海無涯苦作舟。', '古訓'],
    ['少壯不努力，老大徒傷悲。', '樂府詩集・長歌行'],
    ['盛年不重來，一日難再晨。', '陶淵明'],
    ['駑馬十駕，功在不舍。', '荀子・勸學'],
    ['博學之，審問之，慎思之，明辨之，篤行之。', '中庸'],
    ['士不可以不弘毅，任重而道遠。', '論語・泰伯'],
    ['行百里者半九十。', '戰國策'],
    ['問渠那得清如許，為有源頭活水來。', '朱熹・觀書有感'],
    ['紙上得來終覺淺，絕知此事要躬行。', '陸游・冬夜讀書示子聿'],
    ['今天不必是完美的一天，只要是有推進的一天。', ''],
    ['進度落後不是失敗，停下來才是。', ''],
    ['你不需要每天都想讀書，只需要每天都去讀。', ''],
    ['錯題訂正一題，勝過新題亂寫十題。', ''],
    ['焦慮是正常的。把它拆成今天的一格進度條。', ''],
    ['最難的部分不是讀懂，是坐下來開始。', ''],
    ['狀態差的日子讀三十分鐘，也比零強。', ''],
    ['你現在覺得慢，是因為你正在走真正有用的路。', ''],
    ['考卷不會問你今天心情好不好，只問你會不會。', ''],
    ['三個月後的你，會感謝今天沒有放棄的自己。', '']
  ];

  const quoteOfDay = (offset = 0) => {
    const t = today();
    const seed = Number(t.replace(/-/g, ''));
    return QUOTES[(seed + offset) % QUOTES.length];
  };

  /* ---------- 日期工具（一律用本地時區的 YYYY-MM-DD） ---------- */
  const iso = (d) => {
    const x = new Date(d);
    x.setHours(12, 0, 0, 0);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const today = () => iso(new Date());
  const addDays = (isoStr, n) => {
    const [y, m, d] = isoStr.split('-').map(Number);
    const x = new Date(y, m - 1, d, 12);
    x.setDate(x.getDate() + n);
    return iso(x);
  };
  const daysBetween = (a, b) => {
    const p = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); };
    return Math.round((p(b) - p(a)) / 86400000);
  };
  const fmtDate = (isoStr) => {
    const [y, m, d] = isoStr.split('-').map(Number);
    return `${m} 月 ${d} 日`;
  };
  const round1 = (n) => Math.round(n * 10) / 10;

  /* ---------- Store ---------- */
  const defaults = () => ({
    examDate: '2027-01-22',
    goalHours: 3,
    days: {},
    mistakes: [],
    rewards: [],
    theme: null,
    email: '',
    quoteOffset: 0,
    zoom: 1,
    updatedAt: new Date().toISOString()
  });

  const store = {
    data: defaults(),
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) this.data = Object.assign(defaults(), JSON.parse(raw));
      } catch (e) {
        console.warn('讀取本機資料失敗，改用預設值', e);
      }
      return this.data;
    },
    save() {
      this.data.updatedAt = new Date().toISOString();
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) {
        toast('儲存失敗，瀏覽器空間可能已滿。請先匯出備份。');
        console.error(e);
      }
    },
    day(dateStr) {
      if (!this.data.days[dateStr]) this.data.days[dateStr] = { study: false, fix: false, todo: false, hours: 0 };
      return this.data.days[dateStr];
    }
  };

  /* ---------- IndexedDB（圖片） ---------- */
  const idb = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('gsat-images', 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('images')) req.result.createObjectStore('images');
        };
        req.onsuccess = () => { this.db = req.result; resolve(this.db); };
        req.onerror = () => reject(req.error);
      });
    },
    async run(mode, fn) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('images', mode);
        const req = fn(tx.objectStore('images'));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    put(id, blob) { return this.run('readwrite', (s) => s.put(blob, id)); },
    get(id) { return this.run('readonly', (s) => s.get(id)); },
    del(id) { return this.run('readwrite', (s) => s.delete(id)); },
    keys() { return this.run('readonly', (s) => s.getAllKeys()); }
  };

  /* 壓縮圖片：長邊上限 1280px，JPEG q=0.8 */
  function compress(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1280;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale);
        cv.height = Math.round(img.height * scale);
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob((b) => b ? resolve(b) : reject(new Error('壓縮失敗')), 'image/jpeg', 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取圖片')); };
      img.src = url;
    });
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  /* ---------- 計分 ---------- */
  const dayPoints = (d) => {
    if (!d) return 0;
    const n = TASKS.filter((t) => d[t]).length;
    return n * 10 + (n === 3 ? 10 : 0);
  };
  const isPerfect = (d) => !!d && TASKS.every((t) => d[t]);

  const totalEarned = () => Object.values(store.data.days).reduce((s, d) => s + dayPoints(d), 0);
  const totalSpent = () => store.data.rewards.filter((r) => r.redeemedAt).reduce((s, r) => s + Math.ceil(r.price / POINT_VALUE), 0);
  const balance = () => totalEarned() - totalSpent();

  function streakCount() {
    let n = 0;
    let cur = today();
    // 今天還沒全勤時，從昨天起算，避免白天尚未打卡就顯示歸零
    if (!isPerfect(store.data.days[cur])) cur = addDays(cur, -1);
    while (isPerfect(store.data.days[cur])) { n++; cur = addDays(cur, -1); }
    return n;
  }

  /* ---------- 動畫數字 ---------- */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animFrames = new WeakMap();   // 每個元素同時只跑一個動畫，避免多個 rAF 互相覆寫

  function countTo(el, to, decimals = 0) {
    const prev = animFrames.get(el);
    if (prev) cancelAnimationFrame(prev);

    const from = parseFloat(el.textContent.replace(/,/g, '')) || 0;
    if (reduceMotion || from === to) {
      animFrames.delete(el);
      el.textContent = to.toFixed(decimals);
      return;
    }
    const start = performance.now();
    const dur = 520;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (from + (to - from) * eased).toFixed(decimals);
      if (p < 1) animFrames.set(el, requestAnimationFrame(tick));
      else { animFrames.delete(el); el.textContent = to.toFixed(decimals); }
    };
    animFrames.set(el, requestAnimationFrame(tick));
  }

  /* ============================================================
     Render
     ============================================================ */

  function renderCountdown() {
    const t = today();
    const left = daysBetween(t, store.data.examDate);
    const numEl = $('#cdDays .num');
    const detail = $('#cdDetail');

    if (left > 0) {
      numEl.textContent = left;
      const [y, m, d] = store.data.examDate.split('-');
      detail.textContent = `考試日 ${y} 年 ${Number(m)} 月 ${Number(d)} 日 · 約 ${Math.floor(left / 7)} 週`;
      const span = 365;
      const pct = Math.max(0, Math.min(100, ((span - left) / span) * 100));
      $('#cdBar').style.width = pct + '%';
    } else if (left === 0) {
      numEl.textContent = '0';
      detail.textContent = '今天就是考試日。深呼吸，你準備了很久。';
      $('#cdBar').style.width = '100%';
    } else {
      numEl.textContent = '—';
      detail.textContent = '考試日已過。到「修改考試日期」設定新的目標。';
      $('#cdBar').style.width = '100%';
    }
  }

  function renderCheckin() {
    const t = today();
    const d = store.day(t);
    TASKS.forEach((k) => { $(`input[data-task="${k}"]`).checked = !!d[k]; });
    $('#hoursInput').value = d.hours || 0;
    $('#goalHint').textContent = store.data.goalHours;

    const pts = dayPoints(d);
    countTo($('#todayPts'), pts);
    $('#perfectTag').hidden = !isPerfect(d);

    const wd = ['日', '一', '二', '三', '四', '五', '六'][new Date().getDay()];
    $('#todayChip').textContent = `${fmtDate(t)}・週${wd}`;
  }

  function renderStreak() {
    const n = streakCount();
    countTo($('#streakNum'), n);
    const perfectToday = isPerfect(store.data.days[today()]);
    $('#streakNote').textContent = n === 0
      ? '還沒開始。今天三項全打勾，連續紀錄就從 1 起算。'
      : perfectToday
        ? `已經連續 ${n} 天全勤。維持住這個節奏。`
        : `連續 ${n} 天。今天補上全勤就能接續，中斷了要從頭再來。`;

    $('#milestones').innerHTML = MILESTONES
      .map((m) => `<li class="${n >= m ? 'done' : ''}">${n >= m ? '✓ ' : ''}${m} 天</li>`)
      .join('');
  }

  function renderPoints() {
    const bal = balance();
    countTo($('#balance'), bal);
    countTo($('#balanceCash'), bal * POINT_VALUE);
    countTo($('#earned'), totalEarned());
    countTo($('#spent'), totalSpent());
  }

  function renderHeat() {
    const cells = [];
    let done = 0;
    for (let i = 13; i >= 0; i--) {
      const dateStr = addDays(today(), -i);
      const d = store.data.days[dateStr];
      const n = d ? TASKS.filter((t) => d[t]).length : 0;
      if (n > 0) done++;
      cells.push(
        `<div class="heat-cell l${n}${i === 0 ? ' today' : ''}" title="${fmtDate(dateStr)}：完成 ${n} 項"></div>`
      );
    }
    $('#heat').innerHTML = cells.join('');
    $('#weekSummary').textContent = `14 天內有 ${done} 天打卡`;
  }

  /* ---------- 統計圖表 ---------- */
  let chartRange = 7;

  function renderChart() {
    const days = [];
    for (let i = chartRange - 1; i >= 0; i--) {
      const dateStr = addDays(today(), -i);
      days.push({ date: dateStr, hours: (store.data.days[dateStr] || {}).hours || 0 });
    }

    // viewBox 跟著容器寬度走，手機上長條才不會被壓扁。
    // 分頁隱藏時量到 0，這時不畫；等 ResizeObserver 在變成可見時再叫一次。
    const wrapW = Math.round($('.chart-wrap')?.clientWidth || 0);
    if (!wrapW) return;
    const narrow = wrapW < 520;
    const W = Math.max(280, wrapW);
    const H = narrow ? 200 : 210;
    const padL = narrow ? 26 : 34, padR = 8, padT = 12, padB = 26;
    $('#chart').setAttribute('viewBox', `0 0 ${W} ${H}`);

    const iw = W - padL - padR, ih = H - padT - padB;
    const maxH = Math.max(store.data.goalHours, ...days.map((d) => d.hours), 1);
    const top = Math.ceil(maxH * 1.15);
    const gap = chartRange > 14 ? 2 : narrow ? 4 : 5;
    const bw = Math.max(2, (iw - gap * (days.length - 1)) / days.length);
    const css = getComputedStyle(document.documentElement);
    const cPrimary = css.getPropertyValue('--primary').trim();
    const cBorder = css.getPropertyValue('--border').trim();
    const cAccent = css.getPropertyValue('--accent').trim();
    const cMuted = css.getPropertyValue('--text-2').trim();

    let svg = '';
    // 水平格線
    for (let i = 0; i <= 2; i++) {
      const v = (top / 2) * i;
      const y = padT + ih - (v / top) * ih;
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${cBorder}" stroke-width="1"/>`;
      svg += `<text x="${padL - 7}" y="${y + 4}" text-anchor="end" font-size="11" fill="${cMuted}">${round1(v)}</text>`;
    }
    // 目標線
    if (store.data.goalHours <= top) {
      const gy = padT + ih - (store.data.goalHours / top) * ih;
      svg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="${cAccent}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    }
    // 長條
    days.forEach((d, i) => {
      const x = padL + i * (bw + gap);
      const h = d.hours > 0 ? Math.max(2.5, (d.hours / top) * ih) : 0;
      const y = padT + ih - h;
      if (h > 0) {
        svg += `<rect class="chart-bar" x="${round1(x)}" y="${round1(y)}" width="${round1(bw)}" height="${round1(h)}" rx="${Math.min(3.5, bw / 2)}" fill="${cPrimary}"><title>${fmtDate(d.date)}：${round1(d.hours)} 小時</title></rect>`;
      } else {
        svg += `<rect x="${round1(x)}" y="${padT + ih - 2}" width="${round1(bw)}" height="2" rx="1" fill="${cBorder}"><title>${fmtDate(d.date)}：未記錄</title></rect>`;
      }
      // 標籤：7 天全標，30 天每 5 天標一次（窄螢幕再放寬間隔避免重疊）
      const step = chartRange > 14 ? (narrow ? 7 : 5) : 1;
      if (i % step === 0 || i === days.length - 1) {
        const [, m, dd] = d.date.split('-');
        svg += `<text x="${round1(x + bw / 2)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="${cMuted}">${Number(m)}/${Number(dd)}</text>`;
      }
    });
    $('#chart').innerHTML = svg;

    // 無障礙：文字描述 + 隱藏表格
    const sum = days.reduce((s, d) => s + d.hours, 0);
    $('#chartDesc').textContent = `近 ${chartRange} 天每日讀書時數長條圖，總計 ${round1(sum)} 小時，日均 ${round1(sum / chartRange)} 小時。`;
    $('#chartTable').innerHTML = '<caption>每日讀書時數</caption><tr><th>日期</th><th>時數</th></tr>' +
      days.map((d) => `<tr><td>${fmtDate(d.date)}</td><td>${round1(d.hours)} 小時</td></tr>`).join('');

    // 本週 / 上週
    const sumRange = (from, to) => {
      let s = 0;
      for (let i = from; i < to; i++) s += (store.data.days[addDays(today(), -i)] || {}).hours || 0;
      return s;
    };
    const thisWeek = sumRange(0, 7);
    const lastWeek = sumRange(7, 14);
    $('#statWeek').textContent = round1(thisWeek) + ' 小時';
    $('#statAvg').textContent = round1(thisWeek / 7) + ' 小時';

    const trend = $('#statTrend');
    const diff = round1(thisWeek - lastWeek);
    trend.classList.remove('trend-up', 'trend-down');
    if (lastWeek === 0 && thisWeek === 0) {
      trend.textContent = '—';
    } else if (diff > 0) {
      trend.textContent = `+${diff} 小時`;
      trend.classList.add('trend-up');
    } else if (diff < 0) {
      trend.textContent = `${diff} 小時`;
      trend.classList.add('trend-down');
    } else {
      trend.textContent = '持平';
    }
  }

  /* ---------- 獎勵 ---------- */
  function renderRewards() {
    const list = $('#rewardList');
    const bal = balance();
    const rs = store.data.rewards;
    $('#rewardEmpty').hidden = rs.length > 0;

    list.innerHTML = rs.map((r) => {
      const cost = Math.ceil(r.price / POINT_VALUE);
      const ready = !r.redeemedAt && bal >= cost;
      const pct = r.redeemedAt ? 100 : Math.min(100, (bal / cost) * 100);
      return `
        <li class="reward-item ${r.redeemedAt ? 'is-redeemed' : ready ? 'is-ready' : ''}">
          <div class="rw-body">
            <p class="rw-name">${esc(r.name)}</p>
            <p class="rw-cost">${cost} 點 · NT$${r.price}${r.redeemedAt ? ` · 已於 ${fmtDate(r.redeemedAt)} 兌換` : ` · 還差 ${Math.max(0, cost - bal)} 點`}</p>
            <div class="rw-bar"><div class="rw-bar-fill" style="width:${pct}%"></div></div>
          </div>
          ${r.redeemedAt
            ? `<button class="btn btn-ghost btn-sm" data-rw-undo="${r.id}">取消兌換</button>`
            : `<button class="btn btn-primary btn-sm" data-rw-redeem="${r.id}" ${ready ? '' : 'disabled'}>兌換</button>`}
          <button class="mi-del" data-rw-del="${r.id}" aria-label="刪除獎勵 ${esc(r.name)}">✕</button>
        </li>`;
    }).join('');
  }

  /* ---------- 錯題本 ---------- */
  let subjectFilter = '全部';
  let dueOnly = false;
  const thumbCache = new Map();

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const isDue = (m) => !m.mastered && m.nextReviewAt && m.nextReviewAt <= today();

  function renderMistakes() {
    const all = store.data.mistakes;
    const dueList = all.filter(isDue);
    $('#dueBanner').hidden = dueList.length === 0;
    $('#dueCount').textContent = dueList.length;

    let list = all.slice();
    if (subjectFilter !== '全部') list = list.filter((m) => m.subject === subjectFilter);
    if (dueOnly) list = list.filter(isDue);

    // 待重寫的排最前，已掌握的排最後
    list.sort((a, b) => {
      const rank = (m) => m.mastered ? 2 : isDue(m) ? 0 : 1;
      return rank(a) - rank(b) || (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    $('#mistakeEmpty').hidden = all.length > 0;
    $('#mistakeList').innerHTML = list.map((m) => {
      const due = isDue(m);
      const stage = m.stage || 0;
      let dueText;
      if (m.mastered) dueText = '已掌握 · 完成四輪重寫';
      else if (due) dueText = `該重寫了（第 ${stage + 1} 輪）`;
      else dueText = `下次重寫：${fmtDate(m.nextReviewAt)}（第 ${stage + 1} 輪）`;

      return `
        <li class="mistake-item ${due ? 'is-due' : ''} ${m.mastered ? 'is-mastered' : ''}" data-id="${m.id}">
          ${m.imageId ? `<img class="mi-thumb" data-img="${m.imageId}" alt="題目圖片縮圖，點擊放大">` : ''}
          <div class="mi-body">
            <p class="mi-title">${esc(m.summary)}</p>
            <div class="mi-meta">
              <span class="tag tag-subject">${esc(m.subject)}</span>
              ${m.unit ? `<span class="tag">${esc(m.unit)}</span>` : ''}
              ${(m.reasons || []).map((r) => `<span class="tag">${esc(r)}</span>`).join('')}
            </div>
            <p class="mi-due ${due ? 'due-now' : ''}">${dueText}</p>
            ${m.mastered ? '' : `
            <div class="mi-actions">
              <button class="btn btn-primary btn-sm" data-review-ok="${m.id}">重寫答對</button>
              <button class="btn btn-ghost btn-sm" data-review-no="${m.id}">還是錯</button>
            </div>`}
          </div>
          <button class="mi-del" data-mk-del="${m.id}" aria-label="刪除錯題">✕</button>
        </li>`;
    }).join('');

    // 縮圖非同步載入
    $$('#mistakeList .mi-thumb').forEach(async (img) => {
      const id = img.dataset.img;
      if (thumbCache.has(id)) { img.src = thumbCache.get(id); return; }
      try {
        const blob = await idb.get(id);
        if (blob) { const url = URL.createObjectURL(blob); thumbCache.set(id, url); img.src = url; }
        else img.remove();
      } catch { img.remove(); }
    });
  }

  function renderQuote() {
    const [text, source] = quoteOfDay(store.data.quoteOffset || 0);
    $('#quoteText').textContent = `「${text}」`;
    $('#quoteSource').textContent = source ? `— ${source}` : '';
  }

  function renderAll() {
    renderQuote();
    renderCountdown();
    renderCheckin();
    renderStreak();
    renderPoints();
    renderHeat();
    renderChart();
    renderRewards();
    renderMistakes();
    renderTabDot();
  }

  /* ============================================================
     Events
     ============================================================ */

  function save(rerenderAll = true) {
    store.save();
    if (rerenderAll) renderAll();
  }

  /* 打卡 */
  function bindCheckin() {
    TASKS.forEach((k) => {
      $(`input[data-task="${k}"]`).addEventListener('change', (e) => {
        const d = store.day(today());
        const wasPerfect = isPerfect(d);
        d[k] = e.target.checked;
        save();
        if (!wasPerfect && isPerfect(d)) {
          const card = $('.card-checkin');
          card.classList.remove('celebrate');
          void card.offsetWidth;
          card.classList.add('celebrate');
          toast(`全勤達成！今天 +40 點，連續 ${streakCount()} 天 🔥`);
        }
      });
    });

    const hours = $('#hoursInput');
    const applyHours = () => {
      const v = Math.max(0, Math.min(24, parseFloat(hours.value) || 0));
      hours.value = v;
      const d = store.day(today());
      d.hours = v;
      const wasPerfect = isPerfect(d);
      d.study = v >= store.data.goalHours;   // 時數自動帶動「時數達標」
      save();
      if (!wasPerfect && isPerfect(d)) toast(`全勤達成！今天 +40 點，連續 ${streakCount()} 天 🔥`);
    };
    hours.addEventListener('change', applyHours);
    $$('.step-btn').forEach((b) => b.addEventListener('click', () => {
      hours.value = Math.max(0, (parseFloat(hours.value) || 0) + parseFloat(b.dataset.step));
      applyHours();
    }));
  }

  /* 圖表區間切換 */
  function bindChart() {
    $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      chartRange = Number(b.dataset.range);
      $$('.seg-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderChart();
    }));

    // 轉向或改變視窗大小時重畫，讓 viewBox 跟上新的容器寬度。
    // （分頁切換造成的顯示／隱藏由 setView 直接處理。）
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderChart, 180);
    });
  }

  /* ---------- 兌換儀式：證書 + 紙屑 + 寄信 ---------- */
  let lastCert = null;

  function confetti() {
    if (reduceMotion) return;
    const colors = ['#C86D51', '#3A5A40', '#E8C48A', '#A85238', '#8FB496'];
    const box = document.createElement('div');
    box.className = 'confetti';
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (2.4 + Math.random() * 1.9) + 's';
      p.style.animationDelay = (Math.random() * .7) + 's';
      p.style.opacity = .55 + Math.random() * .45;
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 5200);
  }

  function showCertificate(reward) {
    const cost = Math.ceil(reward.price / POINT_VALUE);
    const streak = streakCount();
    const [qt, qs] = quoteOfDay(store.data.quoteOffset || 0);

    lastCert = {
      name: reward.name, cost, price: reward.price, streak,
      date: today(), quote: qt, quoteSource: qs,
      earned: totalEarned(), balance: balance()
    };

    $('#certName').textContent = reward.name;
    $('#certSub').textContent = `${fmtDate(today())}・這是你用 ${cost} 點讀書換來的`;
    $('#certCost').textContent = `${cost} 點`;
    $('#certCash').textContent = `NT$${reward.price}`;
    $('#certStreak').textContent = `${streak} 天`;
    $('#certQuote').textContent = qs ? `${qt}（${qs}）` : qt;

    $('#certDialog').showModal();
    confetti();
  }

  /* 證書內容（純文字 + HTML 兩種版本） */
  function certText(c) {
    return [
      '兌換證書',
      '',
      `獎勵：${c.name}`,
      `日期：${fmtDate(c.date)}`,
      `花費點數：${c.cost} 點（等值 NT$${c.price}）`,
      `連續全勤：${c.streak} 天`,
      `累積獲得：${c.earned} 點・兌換後餘額：${c.balance} 點`,
      '',
      c.quoteSource ? `「${c.quote}」— ${c.quoteSource}` : `「${c.quote}」`,
      '',
      '這不是買來的，是讀來的。',
      '— 學測戰情室'
    ].join('\n');
  }

  function certHtml(c) {
    return `<div style="font-family:'Noto Serif TC',Georgia,serif;background:#F9F6F0;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#FFFDF9;border:1px solid #E8E2D8;border-radius:20px;padding:36px 30px;text-align:center;color:#2B2825">
    <p style="font-size:12px;letter-spacing:.28em;color:#736E67;margin:0 0 14px">兌 換 證 書</p>
    <p style="font-size:30px;font-weight:700;margin:0;line-height:1.35">${esc(c.name)}</p>
    <p style="font-size:14px;color:#736E67;margin:12px 0 0">${fmtDate(c.date)}・這是你用 ${c.cost} 點讀書換來的</p>
    <table style="width:100%;margin:24px 0;border-top:1px solid #E8E2D8;border-bottom:1px solid #E8E2D8"><tr>
      <td style="padding:16px 0;text-align:center"><div style="font-size:12px;color:#736E67">花費點數</div><div style="font-size:21px;font-weight:700">${c.cost} 點</div></td>
      <td style="padding:16px 0;text-align:center"><div style="font-size:12px;color:#736E67">等值</div><div style="font-size:21px;font-weight:700">NT$${c.price}</div></td>
      <td style="padding:16px 0;text-align:center"><div style="font-size:12px;color:#736E67">連續全勤</div><div style="font-size:21px;font-weight:700">${c.streak} 天</div></td>
    </tr></table>
    <p style="font-size:15px;line-height:1.8;color:#736E67;margin:0">${esc(c.quote)}${c.quoteSource ? `<br><span style="font-size:13px">— ${esc(c.quoteSource)}</span>` : ''}</p>
    <p style="margin:26px 0 0;font-size:15px;color:#A85238;font-weight:700">這不是買來的，是讀來的。</p>
    <p style="margin:6px 0 0;font-size:12px;color:#736E67">學測戰情室</p>
  </div>
</div>`;
  }

  /* 寄出：優先用已登入的 Gmail，否則退回 mailto 讓使用者按送出 */
  async function mailCertificate() {
    if (!lastCert) return;
    const to = (store.data.email || '').trim();
    if (!to) { $('#mailInput').value = ''; $('#mailDialog').showModal(); return; }

    const subject = `兌換證書：${lastCert.name}`;

    if (window.googleAuth?.isSignedIn?.()) {
      try {
        await window.googleAuth.sendMail(to, subject, certHtml(lastCert));
        toast(`證書已寄到 ${to}`);
        return;
      } catch (err) {
        console.error(err);
        toast('Gmail 寄送失敗，改用郵件軟體開啟。');
      }
    }
    // 沒接 Gmail 就開啟郵件軟體，內容已填好，按送出即可
    const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(certText(lastCert))}`;
    window.location.href = href;
    toast('已開啟郵件軟體，按「送出」就寄到你的信箱。');
  }

  function bindCertificate() {
    $('#certMail').addEventListener('click', mailCertificate);
    $('#mailSave').addEventListener('click', () => {
      const v = $('#mailInput').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast('信箱格式看起來不太對'); return; }
      store.data.email = v;
      store.save();
      $('#mailDialog').close();
      mailCertificate();
    });
    $('#quoteNext').addEventListener('click', () => {
      store.data.quoteOffset = ((store.data.quoteOffset || 0) + 1) % QUOTES.length;
      store.save();
      renderQuote();
    });
  }

  /* 獎勵 */
  function bindRewards() {
    $('#rewardForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#rewardName').value.trim();
      const price = parseInt($('#rewardPrice').value, 10);
      if (!name || !(price > 0)) return;
      store.data.rewards.push({ id: uid(), name, price, redeemedAt: null });
      $('#rewardForm').reset();
      save();
      toast(`已加入「${name}」，需要 ${Math.ceil(price / POINT_VALUE)} 點`);
    });

    $('#rewardList').addEventListener('click', (e) => {
      const redeem = e.target.closest('[data-rw-redeem]');
      const undo = e.target.closest('[data-rw-undo]');
      const del = e.target.closest('[data-rw-del]');
      if (redeem) {
        const r = store.data.rewards.find((x) => x.id === redeem.dataset.rwRedeem);
        if (!r) return;
        r.redeemedAt = today();
        save();
        showCertificate(r);
      } else if (undo) {
        const r = store.data.rewards.find((x) => x.id === undo.dataset.rwUndo);
        if (r) { r.redeemedAt = null; save(); }
      } else if (del) {
        const r = store.data.rewards.find((x) => x.id === del.dataset.rwDel);
        if (r && confirm(`確定要刪除「${r.name}」？`)) {
          store.data.rewards = store.data.rewards.filter((x) => x.id !== r.id);
          save();
        }
      }
    });
  }

  /* 錯題 */
  let pendingImage = null;   // { blob, url }

  function bindMistakes() {
    // 科目下拉 + 篩選
    $('#mkSubject').innerHTML = SUBJECTS.map((s) => `<option>${s}</option>`).join('');
    $('#subjectFilter').innerHTML = ['全部', ...SUBJECTS]
      .map((s) => `<button class="chip" type="button" data-subject="${s}" aria-pressed="${s === '全部'}">${s}</button>`).join('');
    $('#reasonChips').innerHTML = REASONS
      .map((r) => `<button class="chip" type="button" data-reason="${r}" aria-pressed="false">${r}</button>`).join('');

    $('#subjectFilter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-subject]');
      if (!b) return;
      subjectFilter = b.dataset.subject;
      $$('#subjectFilter .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      renderMistakes();
    });

    $('#reasonChips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-reason]');
      if (!b) return;
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    });

    // 圖片：選擇 / 拖曳 / 貼上
    const input = $('#imageInput');
    const drop = $('#imageDrop');
    $('#imagePick').addEventListener('click', () => input.click());
    input.addEventListener('change', () => input.files[0] && setImage(input.files[0]));
    $('#imageClear').addEventListener('click', clearImage);

    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.classList.remove('is-over');
    }));
    drop.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('image/')) setImage(f);
    });
    document.addEventListener('paste', (e) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
      if (item) { setImage(item.getAsFile()); toast('已貼上圖片'); }
    });

    // 收錄
    $('#mistakeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const summary = $('#mkSummary').value.trim();
      if (!summary) return;

      let imageId = null;
      if (pendingImage) {
        imageId = uid();
        try {
          await idb.put(imageId, pendingImage.blob);
        } catch (err) {
          console.error(err);
          toast('圖片儲存失敗，這題先以文字收錄。');
          imageId = null;
        }
      }

      store.data.mistakes.push({
        id: uid(),
        summary,
        subject: $('#mkSubject').value,
        unit: $('#mkUnit').value.trim(),
        reasons: $$('#reasonChips .chip[aria-pressed="true"]').map((c) => c.dataset.reason),
        createdAt: today(),
        imageId,
        stage: 0,
        nextReviewAt: addDays(today(), REVIEW_STEPS[0]),
        mastered: false
      });

      // 自動帶勾「訂正錯題達標」
      const d = store.day(today());
      const wasPerfect = isPerfect(d);
      d.fix = true;

      $('#mistakeForm').reset();
      $$('#reasonChips .chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      clearImage();
      save();
      toast(isPerfect(d) && !wasPerfect
        ? `收錄完成，順手達成全勤 +40 點 🔥`
        : `已收錄，${REVIEW_STEPS[0]} 天後提醒你重寫。`);
    });

    // 重寫 / 刪除 / 放大
    $('#mistakeList').addEventListener('click', async (e) => {
      const ok = e.target.closest('[data-review-ok]');
      const no = e.target.closest('[data-review-no]');
      const del = e.target.closest('[data-mk-del]');
      const thumb = e.target.closest('.mi-thumb');

      if (ok || no) {
        const id = (ok || no).dataset.reviewOk || (ok || no).dataset.reviewNo;
        const m = store.data.mistakes.find((x) => x.id === id);
        if (!m) return;
        if (ok) {
          m.stage = (m.stage || 0) + 1;
          if (m.stage >= REVIEW_STEPS.length) {
            m.mastered = true;
            m.nextReviewAt = null;
            toast('這題四輪都過了，標記為已掌握 ✓');
          } else {
            m.nextReviewAt = addDays(today(), REVIEW_STEPS[m.stage]);
            toast(`答對！${REVIEW_STEPS[m.stage]} 天後再確認一次。`);
          }
        } else {
          m.stage = Math.max(0, (m.stage || 0) - 1);
          m.nextReviewAt = addDays(today(), REVIEW_STEPS[m.stage]);
          toast(`沒關係，${REVIEW_STEPS[m.stage]} 天後再來一次。`);
        }
        save();
      } else if (del) {
        const m = store.data.mistakes.find((x) => x.id === del.dataset.mkDel);
        if (m && confirm('確定要刪除這題？')) {
          if (m.imageId) { idb.del(m.imageId).catch(() => {}); thumbCache.delete(m.imageId); }
          store.data.mistakes = store.data.mistakes.filter((x) => x.id !== m.id);
          save();
        }
      } else if (thumb) {
        $('#lightboxImg').src = thumb.src;
        $('#lightbox').showModal();
      }
    });

    $('#dueJump').addEventListener('click', () => {
      dueOnly = !dueOnly;
      $('#dueJump').textContent = dueOnly ? '顯示全部' : '只看待重寫';
      renderMistakes();
    });
  }

  async function setImage(file) {
    try {
      const blob = await compress(file);
      if (pendingImage) URL.revokeObjectURL(pendingImage.url);
      pendingImage = { blob, url: URL.createObjectURL(blob) };
      const prev = $('#imagePreview');
      prev.src = pendingImage.url;
      prev.hidden = false;
      $('#imageClear').hidden = false;
      $('#imageDropText').textContent = `已選擇圖片（${Math.round(blob.size / 1024)} KB），收錄時一併存入。`;
    } catch (err) {
      console.error(err);
      toast('這張圖片讀不到，換一張試試。');
    }
  }

  function clearImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.url);
    pendingImage = null;
    $('#imagePreview').hidden = true;
    $('#imagePreview').removeAttribute('src');
    $('#imageClear').hidden = true;
    $('#imageInput').value = '';
    $('#imageDropText').textContent = '附上題目截圖：拖曳、貼上（Ctrl+V），或點右方按鈕選擇／拍照。';
  }

  /* 對話框 */
  function bindDialogs() {
    $('#editExamDate').addEventListener('click', () => {
      $('#examInput').value = store.data.examDate;
      $('#examDialog').showModal();
    });
    $('#examSave').addEventListener('click', () => {
      const v = $('#examInput').value;
      if (v) { store.data.examDate = v; save(); toast('考試日期已更新'); }
      $('#examDialog').close();
    });

    $('#settingsBtn').addEventListener('click', () => {
      $('#goalInput').value = store.data.goalHours;
      $('#goalDialog').showModal();
    });
    $('#goalSave').addEventListener('click', () => {
      const v = parseFloat($('#goalInput').value);
      if (v > 0) {
        store.data.goalHours = v;
        const d = store.day(today());
        d.study = (d.hours || 0) >= v;
        save();
        toast(`每日目標設為 ${v} 小時`);
      }
      $('#goalDialog').close();
    });

    $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
    // 點背景關閉
    $$('dialog').forEach((dlg) => dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }));
  }

  /* 備份：打包成單一 JSON（圖片轉 base64），本機下載與 Drive 備份共用 */
  async function exportPayload() {
    const images = {};
    for (const m of store.data.mistakes) {
      if (!m.imageId) continue;
      try {
        const blob = await idb.get(m.imageId);
        if (blob) images[m.imageId] = await blobToDataURL(blob);
      } catch { /* 略過讀不到的圖片 */ }
    }
    return { version: 1, exportedAt: new Date().toISOString(), data: store.data, images };
  }

  async function importPayload(payload) {
    if (!payload?.data) throw new Error('格式不符');
    for (const [id, dataUrl] of Object.entries(payload.images || {})) {
      await idb.put(id, await (await fetch(dataUrl)).blob());
    }
    store.data = Object.assign(defaults(), payload.data);
    thumbCache.clear();
    save();
    applyTheme(store.data.theme ?? 'light');
  }

  function bindBackup() {
    $('#exportBtn').addEventListener('click', async () => {
      toast('正在打包備份…');
      const payload = await exportPayload();
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `學測戰情室備份-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('備份已下載。放到雲端硬碟會更保險。');
    });

    $('#importBtn').addEventListener('click', () => $('#importInput').click());
    $('#importInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('匯入會覆蓋目前這台裝置上的所有資料，確定要繼續嗎？')) { e.target.value = ''; return; }
      try {
        await importPayload(JSON.parse(await file.text()));
        toast('已還原備份資料');
      } catch (err) {
        console.error(err);
        toast('這個檔案讀不到，確認是本站匯出的備份檔。');
      }
      e.target.value = '';
    });

    $('#resetBtn').addEventListener('click', async () => {
      if (!confirm('這會刪掉所有打卡紀錄、錯題與獎勵，且無法復原。確定嗎？')) return;
      if (!confirm('真的確定？建議先按「匯出備份」留一份。')) return;
      try {
        for (const k of await idb.keys()) await idb.del(k);
      } catch { /* ignore */ }
      localStorage.removeItem(KEY);
      store.data = defaults();
      thumbCache.clear();
      save();
      toast('已清除全部資料');
    });
  }

  const blobToDataURL = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });

  /* 主題 */
  function applyTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const btn = $('#themeToggle');
    btn.setAttribute('aria-pressed', String(dark));
    btn.querySelector('.icon-sun').textContent = dark ? '☀' : '☾';
    btn.setAttribute('aria-label', dark ? '切換淺色模式' : '切換深色模式');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1C1A18' : '#F9F6F0');
  }

  function bindTheme() {
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(store.data.theme ?? (sysDark.matches ? 'dark' : 'light'));
    $('#themeToggle').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      store.data.theme = next;
      store.save();
      applyTheme(next);
      renderChart();  // 圖表用的是取值後的顏色，需重畫
    });
    sysDark.addEventListener('change', (e) => {
      if (store.data.theme == null) { applyTheme(e.matches ? 'dark' : 'light'); renderChart(); }
    });
  }

  /* 顯示大小：加到主畫面後 iOS 停用雙指縮放，改由 app 自己提供 */
  function applyZoom(z) {
    document.documentElement.style.zoom = z === 1 ? '' : String(z);
    $$('.zoom-ctrl .seg-btn').forEach((b) =>
      b.setAttribute('aria-pressed', String(Number(b.dataset.zoom) === z)));
  }

  function bindZoom() {
    applyZoom(store.data.zoom || 1);
    $$('.zoom-ctrl .seg-btn').forEach((b) => b.addEventListener('click', () => {
      const z = Number(b.dataset.zoom);
      store.data.zoom = z;
      store.save();
      applyZoom(z);
      renderChart();   // 容器寬度變了，圖表要重畫
    }));
  }

  /* 手機分頁切換 */
  function setView(name) {
    document.body.dataset.view = name;
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === name)));
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    // 讀 offsetHeight 強制同步套用新版面，圖表才量得到容器寬度；
    // 仍隱藏時 renderChart 會自行略過。
    void document.body.offsetHeight;
    renderChart();
  }

  function bindTabs() {
    document.body.dataset.view = 'today';
    $$('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));

    // 桌機顯示全部，不受分頁影響；縮回手機時回到「今日」
    const mq = window.matchMedia('(max-width: 980px)');
    mq.addEventListener('change', (e) => {
      if (e.matches) setView('today');
      else renderChart();
    });
  }

  /* 錯題分頁的待重寫提示點 */
  function renderTabDot() {
    const due = store.data.mistakes.filter(isDue).length;
    const dot = $('#tabDot');
    if (dot) dot.hidden = due === 0;
  }

  /* 游標微互動（僅桌機） */
  function bindCursor() {
    if (reduceMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const dot = $('#cursorDot');
    let x = 0, y = 0, cx = 0, cy = 0, on = false;
    window.addEventListener('mousemove', (e) => {
      x = e.clientX; y = e.clientY;
      if (!on) { on = true; cx = x; cy = y; dot.classList.add('is-on'); }
      const hot = e.target.closest('button, a, label.task, input, select, .mi-thumb, .heat-cell');
      dot.classList.toggle('is-hot', !!hot);
    });
    const loop = () => {
      cx += (x - cx) * 0.18;
      cy += (y - cy) * 0.18;
      dot.style.transform = `translate(${cx}px, ${cy}px)`;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    document.addEventListener('mouseleave', () => dot.classList.remove('is-on'));
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- 啟動 ---------- */
  async function init() {
    store.load();

    // 申請持久儲存，降低瀏覽器在空間不足時清掉資料的機率
    if (navigator.storage?.persist) {
      try {
        const already = await navigator.storage.persisted?.();
        if (!already) await navigator.storage.persist();
      } catch { /* 不支援就算了 */ }
    }

    bindTheme();
    bindCheckin();
    bindChart();
    bindRewards();
    bindMistakes();
    bindCertificate();
    bindDialogs();
    bindBackup();
    bindZoom();
    bindTabs();
    bindCursor();
    renderAll();

    // 供 google.js 使用
    window.appToast = toast;
    window.appExportPayload = exportPayload;
    window.appImportPayload = importPayload;

    $$('.card').forEach((c, i) => {
      if (reduceMotion) return;
      c.style.animationDelay = `${Math.min(i * 45, 320)}ms`;
      c.classList.add('rise-in');
    });

    // 跨過午夜時自動換到新的一天
    setInterval(() => {
      if ($('#todayChip').textContent.indexOf(fmtDate(today())) === -1) renderAll();
    }, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
