/* ============================================================
   學測戰情室 — app.js
   資料存在瀏覽器：結構化資料走 localStorage，圖片走 IndexedDB。
   ============================================================ */
(() => {
  'use strict';

  const KEY = 'gsat-war-room-v1';
  const POINT_VALUE = 2;            // 1 點 = 2 元
  const PT_PER_TASK = 10;           // 每項 10 點，全部達成再加 10
  const MIN_TASKS = 2, MAX_TASKS = 6;

  // 舊版沒有 taskIds 快照的日子，一律用這三項計分（保留、不重算）
  const LEGACY_TASK_IDS = ['study', 'fix', 'todo'];

  const DEFAULT_TASKS = () => [
    { id: 'study', name: '讀書時數達標', note: '今天讀滿 {goal} 小時', auto: 'hours' },
    { id: 'fix', name: '訂正錯題達標', note: '至少 1 題並收錄進錯題本', auto: 'mistake' },
    { id: 'todo', name: '完成今日待辦', note: '複習觀念 ＋ 寫題本 ＋ 訂正' }
  ];

  const taskIds = () => store.data.tasks.map((t) => t.id);
  const autoTaskId = (kind) => (store.data.tasks.find((t) => t.auto === kind) || {}).id;
  const REVIEW_STEPS = [1, 3, 7, 30]; // 天
  const SUBJECTS = ['國文', '英文', '數A', '物理', '化學', '生物', '地科'];
  const STUDY_SUBJECTS = [...SUBJECTS, '其他'];

  // 番茄鐘：專注 25 分、短休 5 分、每 4 顆長休 15 分
  const POMO = { focus: 25, short: 5, long: 15, longEvery: 4 };
  const REASONS = ['觀念混淆', '計算失誤', '審題粗心', '公式不熟', '題型新穎'];
  const MILESTONES = [7, 14, 30, 50, 100];

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ---------- 每日金句 ----------
     古語出自公共領域典籍；未標出處者為本站自撰。 */
  const QUOTES = [
    ['不積跬步，無以至千里；不積小流，無以成江海。', '荀子・勸學',
     '跬步是抬一次腳的距離。不累積這種小到不起眼的步伐，就走不到千里之外。荀子講的是「積」——成果從來不是一次到位，是小量反覆疊出來的。'],
    ['鍥而不捨，金石可鏤。', '荀子・勸學',
     '鍥是刻、鏤是雕穿。一直刻下去，連金屬和石頭都能雕透。前一句是「鍥而舍之，朽木不折」：中途放棄，連爛木頭都斷不了。差別不在材料，在有沒有停。'],
    ['學而不思則罔，思而不學則殆。', '論語・為政',
     '罔是迷惘，殆是危險。只接收不思考，學再多也是一團模糊；只空想不學習，想法沒有根據就很危險。這兩件事要一起做。'],
    ['知之者不如好之者，好之者不如樂之者。', '論語・雍也',
     '懂一件事，不如喜歡它；喜歡它，不如樂在其中。孔子講的是動力的三個層次——靠意志力撐最累，樂在其中才走得遠。'],
    ['譬如為山，未成一簣，止，吾止也。', '論語・子罕',
     '簣是裝土的竹筐。堆一座山只差最後一筐土卻停手，山就是沒堆成——而且是自己選擇停的。孔子強調責任在自己，不在條件。'],
    ['天行健，君子以自強不息。', '易經・乾卦',
     '天體運行剛健不休，君子效法它，不斷自我砥礪、不停歇。重點是「不息」——靠的是恆常的節奏，不是偶爾的爆發。'],
    ['千里之行，始於足下。', '老子・道德經',
     '再遠的路也是從腳下這一步開始。老子的原意帶點提醒：與其被整段路的長度嚇住，不如專注在能踏出的這一步。'],
    ['合抱之木，生於毫末；九層之臺，起於累土。', '老子・道德經',
     '要兩手才抱得住的大樹，是從細芽長起來的；九層高臺是一畚箕土堆起來的。跟上一句同一個道理，但更強調起點的微不足道。'],
    ['業精於勤，荒於嬉；行成於思，毀於隨。', '韓愈・進學解',
     '學業因勤奮而精進，因玩樂而荒廢；德行因思考而成就，因隨便而毀壞。隨是「隨波逐流」——不是做壞事，是沒有主見地跟著走。'],
    ['讀書之法，在循序而漸進，熟讀而精思。', '朱熹',
     '照順序來、不要跳；讀熟之後還要深入想。朱熹反對囫圇吞棗式的求快，主張慢讀但讀透。'],
    ['寶劍鋒從磨礪出，梅花香自苦寒來。', '警世賢文',
     '劍要磨才鋒利，梅花要熬過嚴冬才香。兩個比喻講同一件事：好東西都要經過難受的過程，不舒服本身就是過程的一部分。'],
    ['書山有路勤為徑，學海無涯苦作舟。', '古訓',
     '知識像山，勤奮是上山的路；學問像海，肯吃苦是渡海的船。「無涯」是老實話——學問學不完，所以重點不是學完，是持續前進。'],
    ['少壯不努力，老大徒傷悲。', '樂府詩集・長歌行',
     '年輕時不努力，老了只能白白難過。「徒」是白白地——強調那時候的懊悔完全沒有用，因為時間已經換不回來。'],
    ['盛年不重來，一日難再晨。', '陶淵明',
     '最好的年紀不會重來，一天也不會有第二個早晨。下兩句是「及時當勉勵，歲月不待人」，意思是把握當下。'],
    ['駑馬十駕，功在不舍。', '荀子・勸學',
     '駑馬是跑不快的馬。牠拉車走十天，也能到達好馬一天的距離——關鍵在不停下來。荀子刻意用最不佔優勢的馬舉例。'],
    ['博學之，審問之，慎思之，明辨之，篤行之。', '中庸',
     '廣泛地學、仔細地問、謹慎地想、清楚地分辨、確實地做。五個步驟是有順序的，缺了最後的「行」，前面四步都只停在腦袋裡。'],
    ['士不可以不弘毅，任重而道遠。', '論語・泰伯',
     '弘是氣度寬廣，毅是意志堅定。責任重、路途遠，所以這兩樣都不能少——只有毅力會撐得很苦，只有氣度會走不遠。'],
    ['行百里者半九十。', '戰國策',
     '走一百里路，走到九十里才算走了一半。愈接近終點愈難撐，所以最後那段要當成還有一半的路來準備。'],
    ['問渠那得清如許，為有源頭活水來。', '朱熹・觀書有感',
     '問那池水為什麼這麼清澈？因為源頭有活水不斷流進來。朱熹用池塘比喻讀書——腦袋要保持清明，就得持續有新的東西進來。'],
    ['紙上得來終覺淺，絕知此事要躬行。', '陸游・冬夜讀書示子聿',
     '從書上讀來的終究是淺的，要真正弄懂就得親自去做。放到考試上就是：看懂詳解不等於會，動手寫過才算。'],
    ['今天不必是完美的一天，只要是有推進的一天。', '', ''],
    ['進度落後不是失敗，停下來才是。', '', ''],
    ['你不需要每天都想讀書，只需要每天都去讀。', '', ''],
    ['錯題訂正一題，勝過新題亂寫十題。', '', ''],
    ['焦慮是正常的。把它拆成今天的一格進度條。', '', ''],
    ['最難的部分不是讀懂，是坐下來開始。', '', ''],
    ['狀態差的日子讀三十分鐘，也比零強。', '', ''],
    ['你現在覺得慢，是因為你正在走真正有用的路。', '', ''],
    ['考卷不會問你今天心情好不好，只問你會不會。', '', ''],
    ['三個月後的你，會感謝今天沒有放棄的自己。', '', '']
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
    tasks: DEFAULT_TASKS(),
    days: {},
    mistakes: [],
    rewards: [],
    theme: null,
    email: '',
    quoteOffset: 0,
    zoom: 1,
    subject: '國文',          // 目前正在讀的科目
    music: { source: 'ambient', ambient: 'rain', volume: 45, ytUrl: '', ytTitle: '', linkPomo: true, playing: false },
    pomo: null,               // { mode, endsAt, remaining, cycles, day }
    exams: [],                // 模擬考成績
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
      // 瀏覽器不允許載入後自動播放，所以播放狀態不該沿用上次的值，
      // 否則按鈕會顯示「暫停」但其實沒有聲音
      if (this.data.music) this.data.music.playing = false;
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
      window.appCloudSync?.schedulePush();   // 已登入才會真的送出
    },
    day(dateStr) {
      const days = this.data.days;
      if (!days[dateStr]) days[dateStr] = { hours: 0, taskIds: taskIds() };
      // 今天永遠跟著目前的項目設定；過去的日子保留當時的快照，不重算
      if (dateStr === today()) days[dateStr].taskIds = taskIds();
      return days[dateStr];
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

  /* ---------- 計分 ----------
     每天用自己的 taskIds 快照計分；沒有快照的舊紀錄沿用原本三項。 */
  const idsOf = (d) => (d && d.taskIds && d.taskIds.length ? d.taskIds : LEGACY_TASK_IDS);
  const doneCount = (d) => idsOf(d).filter((id) => d[id]).length;

  const dayPoints = (d) => {
    if (!d) return 0;
    const ids = idsOf(d);
    const n = doneCount(d);
    return n * PT_PER_TASK + (n === ids.length ? PT_PER_TASK : 0);
  };
  const isPerfect = (d) => !!d && idsOf(d).every((id) => d[id]);
  const maxDayPoints = () => (store.data.tasks.length + 1) * PT_PER_TASK;

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
    // 頁面在背景時 rAF 不會觸發，動畫會讓數字停在舊值，所以直接寫入
    if (reduceMotion || document.hidden || from === to) {
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

  /* 科目時數：bySubject 是明細，hours 是合計（舊資料只有 hours） */
  const subjectBreakdown = (d) => {
    const bs = d.bySubject || {};
    const parts = Object.entries(bs).filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${round1(v)}`);
    return parts.length ? `・${parts.join('、')}` : '';
  };

  const syncHours = (d) => {
    d.hours = round1(Object.values(d.bySubject || {}).reduce((s, v) => s + v, 0));
  };

  /* 加時數到指定科目（delta 可為負），回傳是否剛好達成全勤 */
  function addHours(delta, subject) {
    const d = store.day(today());
    const subj = subject || store.data.subject;
    d.bySubject = d.bySubject || {};
    // 舊紀錄只有 hours 沒有明細，先把它歸到「其他」才不會憑空消失
    if (d.hours > 0 && Object.keys(d.bySubject).length === 0) d.bySubject['其他'] = d.hours;
    d.bySubject[subj] = Math.max(0, round1((d.bySubject[subj] || 0) + delta));
    if (d.bySubject[subj] === 0) delete d.bySubject[subj];
    syncHours(d);

    const wasPerfect = isPerfect(d);
    const id = autoTaskId('hours');
    if (id) d[id] = d.hours >= store.data.goalHours;
    save();
    if (!wasPerfect && isPerfect(d)) celebrate();
  }

  let taskSig = '';

  function buildTaskList() {
    $('#taskList').innerHTML = store.data.tasks.map((task) => {
      const note = (task.note || '').replace('{goal}', store.data.goalHours);
      return `
        <li>
          <label class="task">
            <input type="checkbox" data-task="${esc(task.id)}">
            <span class="box" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="4,12.5 9.5,18 20,6.5"/></svg></span>
            <span class="task-text">
              <span class="task-name">${esc(task.name)}</span>
              ${note ? `<span class="task-note">${esc(note)}</span>` : ''}
            </span>
            <span class="task-pt">+${PT_PER_TASK}</span>
          </label>
        </li>`;
    }).join('');
  }

  function renderCheckin() {
    const t = today();
    const d = store.day(t);

    // 只有在項目清單真的變動時才重建 DOM，否則勾選動畫會被打斷
    const sig = JSON.stringify(store.data.tasks) + '|' + store.data.goalHours;
    if (sig !== taskSig) { taskSig = sig; buildTaskList(); }

    store.data.tasks.forEach((task) => {
      const el = $(`#taskList input[data-task="${task.id}"]`);
      if (el) el.checked = !!d[task.id];
    });

    const subj = store.data.subject;
    $('#hoursInput').value = round1((d.bySubject || {})[subj] || 0);
    $('#hoursTotal').textContent = (d.hours || 0) > 0
      ? `今日合計 ${round1(d.hours)} 小時` + subjectBreakdown(d)
      : '今日還沒有讀書紀錄。';
    $('#hoursRow').hidden = !autoTaskId('hours');
    $('#hoursTotal').hidden = !autoTaskId('hours');

    const pts = dayPoints(d);
    countTo($('#todayPts'), pts);
    $('#perfectTag').hidden = !isPerfect(d);
    $('#checkinHint').textContent =
      `全部達成再加碼 ${PT_PER_TASK} 點，單日最高 ${maxDayPoints()} 點。`;

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
      const n = d ? doneCount(d) : 0;
      const total = d ? idsOf(d).length : 0;
      if (n > 0) done++;
      // 項目數可變，改用完成比例對應四階色深
      const lvl = n === 0 ? 0 : Math.max(1, Math.ceil((n / total) * 3));
      cells.push(
        `<div class="heat-cell l${lvl}${i === 0 ? ' today' : ''}" title="${fmtDate(dateStr)}：完成 ${n}／${total || 0} 項"></div>`
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

  /* ---------- 科目分配 ---------- */
  function renderSubjects() {
    const totals = {};
    for (let i = 0; i < chartRange; i++) {
      const d = store.data.days[addDays(today(), -i)];
      if (!d) continue;
      const bs = d.bySubject || (d.hours > 0 ? { 其他: d.hours } : {});
      for (const [k, v] of Object.entries(bs)) totals[k] = round1((totals[k] || 0) + v);
    }
    const rows = Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const sum = rows.reduce((s, [, v]) => s + v, 0);

    $('#subjectRange').textContent = `近 ${chartRange} 天`;
    $('#subjectEmpty').hidden = rows.length > 0;
    $('#subjectBars').innerHTML = rows.map(([name, v]) => `
      <li class="subject-row">
        <span class="subject-name">${esc(name)}</span>
        <span class="subject-bar"><i style="width:${(v / rows[0][1]) * 100}%"></i></span>
        <span class="subject-val">${round1(v)} 小時<small>${Math.round((v / sum) * 100)}%</small></span>
      </li>`).join('');
  }

  /* ---------- 模擬考成績 ---------- */
  const EXAM_SUBJECTS = ['國文', '英文', '數A', '社會', '自然'];
  const examTotal = (e) => EXAM_SUBJECTS.reduce((s, k) => s + (Number(e.scores[k]) || 0), 0);

  function renderExams() {
    const list = store.data.exams.slice().sort((a, b) => a.date.localeCompare(b.date));
    $('#examEmpty').hidden = list.length > 0;

    $('#examList').innerHTML = list.slice().reverse().map((e) => `
      <li class="exam-item">
        <div class="exam-body">
          <p class="exam-name">${esc(e.name)}</p>
          <p class="exam-meta">${fmtDate(e.date)}・總級分 <b>${examTotal(e)}</b></p>
          <div class="exam-tags">${EXAM_SUBJECTS.map((k) =>
            e.scores[k] != null && e.scores[k] !== '' ? `<span class="tag">${k} ${e.scores[k]}</span>` : '').join('')}</div>
        </div>
        <button class="mi-del" type="button" data-exam-del="${e.id}" aria-label="刪除「${esc(e.name)}」">✕</button>
      </li>`).join('');

    drawExamChart(list);
  }

  function drawExamChart(list) {
    const svg = $('#examChart');
    const wrapW = Math.round(svg.parentElement?.clientWidth || 0);
    if (!wrapW || list.length === 0) { svg.innerHTML = ''; $('#examDesc').textContent = ''; return; }

    const W = Math.max(280, wrapW), H = 160;
    const padL = 30, padR = 10, padT = 12, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const max = 75;   // 五科滿級分
    const css = getComputedStyle(document.documentElement);
    const cPrimary = css.getPropertyValue('--primary').trim();
    const cBorder = css.getPropertyValue('--border').trim();
    const cMuted = css.getPropertyValue('--text-2').trim();

    let out = '';
    [0, 0.5, 1].forEach((f) => {
      const y = padT + ih - f * ih;
      out += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${cBorder}" stroke-width="1"/>`;
      out += `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="10.5" fill="${cMuted}">${Math.round(max * f)}</text>`;
    });

    const x = (i) => padL + (list.length === 1 ? iw / 2 : (i / (list.length - 1)) * iw);
    const y = (v) => padT + ih - (v / max) * ih;
    const pts = list.map((e, i) => `${round1(x(i))},${round1(y(examTotal(e)))}`).join(' ');

    if (list.length > 1) out += `<polyline points="${pts}" fill="none" stroke="${cPrimary}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    list.forEach((e, i) => {
      out += `<circle cx="${round1(x(i))}" cy="${round1(y(examTotal(e)))}" r="4.5" fill="${cPrimary}"><title>${esc(e.name)}：${examTotal(e)} 級分</title></circle>`;
      if (i === 0 || i === list.length - 1 || list.length <= 4) {
        const [, m, dd] = e.date.split('-');
        out += `<text x="${round1(x(i))}" y="${H - 7}" text-anchor="middle" font-size="10" fill="${cMuted}">${Number(m)}/${Number(dd)}</text>`;
      }
    });
    svg.innerHTML = out;

    const totals = list.map(examTotal);
    $('#examDesc').textContent = `模擬考總級分趨勢：${list.map((e, i) => `${e.name} ${totals[i]} 級分`).join('，')}。`;
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
  let reasonFilter = new Set();
  let statusFilter = '全部';          // 全部 / 待重寫 / 未掌握 / 已掌握
  let searchTerm = '';
  let dueOnly = false;
  let todoOnly = false;
  let quizMode = false;
  const revealed = new Set();         // 自測模式下已翻開答案的題目
  const thumbCache = new Map();
  const STATUSES = ['全部', '待重寫', '未掌握', '已掌握'];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const isDue = (m) => !m.mastered && m.nextReviewAt && m.nextReviewAt <= today();

  /* 搜尋 + 多重篩選 */
  function filteredMistakes() {
    const q = searchTerm.trim().toLowerCase();
    return store.data.mistakes.filter((m) => {
      if (subjectFilter !== '全部' && m.subject !== subjectFilter) return false;
      if (reasonFilter.size && !(m.reasons || []).some((r) => reasonFilter.has(r))) return false;
      if (statusFilter === '待重寫' && !isDue(m)) return false;
      if (statusFilter === '未掌握' && m.mastered) return false;
      if (statusFilter === '已掌握' && !m.mastered) return false;
      if (dueOnly && !isDue(m)) return false;
      if (todoOnly && !needsSolution(m)) return false;
      if (q) {
        const hay = [m.summary, m.unit, m.answer, m.myError, m.notes, m.subject,
          ...(m.reasons || [])].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  const activeFilterCount = () =>
    (subjectFilter !== '全部' ? 1 : 0) + reasonFilter.size + (statusFilter !== '全部' ? 1 : 0);

  const needsSolution = (m) => !m.mastered && !(m.answer || m.myError || m.notes);

  function renderMistakes() {
    const all = store.data.mistakes;
    const dueList = all.filter(isDue);
    $('#dueBanner').hidden = dueList.length === 0;
    $('#dueCount').textContent = dueList.length;

    // 只收錄題目卻沒寫訂正的，累積起來會讓錯題本變成一堆空殼
    const todo = all.filter(needsSolution).length;
    $('#todoBanner').hidden = todo === 0;
    $('#todoCount').textContent = todo;

    let list = filteredMistakes();

    // 待重寫的排最前，已掌握的排最後
    list.sort((a, b) => {
      const rank = (m) => m.mastered ? 2 : isDue(m) ? 0 : 1;
      return rank(a) - rank(b) || (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    if (quizMode) {
      const answerable = list.filter((m) => m.answer || m.myError || m.notes);
      const done = answerable.filter((m) => revealed.has(m.id)).length;
      $('#quizProgress').textContent = answerable.length
        ? `已翻開 ${done} / ${answerable.length} 題・答案與錯誤原因都先遮起來了`
        : `這 ${list.length} 題還沒填訂正內容，先用「補充訂正」補上才有得測`;
    }

    $('#mistakeEmpty').hidden = all.length > 0;
    $('#mistakeList').innerHTML = list.map((m) => {
      const due = isDue(m);
      const stage = m.stage || 0;
      let dueText;
      if (m.mastered) dueText = '已掌握 · 完成四輪重寫';
      else if (due) dueText = `該重寫了（第 ${stage + 1} 輪）`;
      else dueText = `下次重寫：${fmtDate(m.nextReviewAt)}（第 ${stage + 1} 輪）`;

      const hasSolution = !!(m.answer || m.myError || m.notes);
      const open = !quizMode || revealed.has(m.id);

      // 自測模式下先藏起「錯誤原因」，那本身就是提示
      const showReasons = !quizMode || open;

      const solution = !hasSolution ? '' : open ? `
        <div class="mi-solution">
          ${m.answer ? `<p><span class="sol-label">正確答案</span>${esc(m.answer)}</p>` : ''}
          ${m.myError ? `<p><span class="sol-label">我錯在哪</span>${esc(m.myError)}</p>` : ''}
          ${m.notes ? `<p class="sol-notes"><span class="sol-label">訂正筆記</span>${esc(m.notes)}</p>` : ''}
        </div>` : `
        <button class="btn btn-ghost btn-sm mi-reveal" data-reveal="${m.id}">想好了，看答案</button>`;

      return `
        <li class="mistake-item ${due ? 'is-due' : ''} ${m.mastered ? 'is-mastered' : ''}" data-id="${m.id}">
          ${m.imageId ? `<img class="mi-thumb" data-img="${m.imageId}" alt="題目圖片縮圖，點擊放大">` : ''}
          <div class="mi-body">
            <p class="mi-title">${esc(m.summary)}</p>
            <div class="mi-meta">
              <span class="tag tag-subject">${esc(m.subject)}</span>
              ${m.unit ? `<span class="tag">${esc(m.unit)}</span>` : ''}
              ${showReasons ? (m.reasons || []).map((r) => `<span class="tag">${esc(r)}</span>`).join('') : ''}
              ${hasSolution || m.mastered ? '' : '<span class="tag tag-todo">待訂正</span>'}
            </div>
            ${solution}
            <p class="mi-due ${due ? 'due-now' : ''}">${dueText}</p>
            ${m.mastered ? '' : `
            <div class="mi-actions">
              <button class="btn btn-primary btn-sm" data-review-ok="${m.id}">重寫答對</button>
              <button class="btn btn-ghost btn-sm" data-review-no="${m.id}">還是錯</button>
              <button class="btn btn-ghost btn-sm" data-mk-reflect="${m.id}">反思</button>
              <button class="btn ${hasSolution ? 'btn-ghost' : 'btn-primary'} btn-sm" data-mk-edit="${m.id}">${hasSolution ? '補充訂正' : '寫下訂正'}</button>
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

  /* ---------- 弱點分析 ---------- */
  function renderWeak() {
    const ms = store.data.mistakes;
    $('#weakEmpty').hidden = ms.length > 0;
    $('#weakCount').textContent = ms.length ? `共 ${ms.length} 題` : '';

    const tally = (getKeys) => {
      const t = {};
      ms.forEach((m) => getKeys(m).forEach((k) => { if (k) t[k] = (t[k] || 0) + 1; }));
      return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 6);
    };

    const bars = (rows, unit) => {
      if (!rows.length) return '';
      const top = rows[0][1];
      return rows.map(([name, n]) => `
        <li class="subject-row">
          <span class="subject-name">${esc(name)}</span>
          <span class="subject-bar"><i style="width:${(n / top) * 100}%"></i></span>
          <span class="subject-val">${n} ${unit}</span>
        </li>`).join('');
    };

    // 單元沒填的題目，退而用科目統計，才不會全部落在「未填單元」
    $('#weakUnits').innerHTML = bars(tally((m) => [m.unit || m.subject]), '題');
    $('#weakReasons').innerHTML = bars(tally((m) => m.reasons || []), '次');
    $$('.weak-block').forEach((b) => { b.hidden = ms.length === 0; });
  }

  function renderQuote() {
    const [text, source, explain] = quoteOfDay(store.data.quoteOffset || 0);
    $('#quoteText').textContent = `「${text}」`;
    $('#quoteSource').textContent = source ? `— ${source}` : '';
    // 文言文才有解釋；白話的句子不需要
    $('#quoteExplain').hidden = !explain;
    $('#quoteExplain').open = false;
    $('#quoteExplainText').textContent = explain || '';
  }

  function renderAll() {
    store.day(today());   // 先讓今天的項目快照對齊目前設定，其餘渲染才算得對
    renderQuote();
    renderCountdown();
    renderCheckin();
    renderStreak();
    renderPoints();
    renderHeat();
    renderChart();
    renderSubjects();
    renderExams();
    renderWeak();
    if ($('#pomoRing')) renderPomo();
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
  function celebrate() {
    const card = $('.card-checkin');
    card.classList.remove('celebrate');
    void card.offsetWidth;
    card.classList.add('celebrate');
    toast(`全勤達成！今天 +${maxDayPoints()} 點，連續 ${streakCount()} 天 🔥`);
  }

  function bindCheckin() {
    // 委派：項目清單是動態產生的
    $('#taskList').addEventListener('change', (e) => {
      const input = e.target.closest('input[data-task]');
      if (!input) return;
      const d = store.day(today());
      const wasPerfect = isPerfect(d);
      d[input.dataset.task] = input.checked;
      save();
      if (!wasPerfect && isPerfect(d)) celebrate();
    });

    // 科目選單
    const sel = $('#subjectSelect');
    sel.innerHTML = STUDY_SUBJECTS.map((s) => `<option>${s}</option>`).join('');
    sel.value = store.data.subject;
    sel.addEventListener('change', () => {
      store.data.subject = sel.value;
      store.save();
      renderCheckin();
    });

    // 直接輸入 = 設定「這一科」今天的時數
    const hours = $('#hoursInput');
    hours.addEventListener('change', () => {
      const v = Math.max(0, Math.min(24, parseFloat(hours.value) || 0));
      const d = store.day(today());
      const cur = (d.bySubject || {})[store.data.subject] || 0;
      addHours(round1(v - cur));
    });

    $$('.step-btn').forEach((b) => b.addEventListener('click', () => {
      addHours(parseFloat(b.dataset.step));
    }));
  }

  /* 圖表區間切換 */
  function bindChart() {
    $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
      chartRange = Number(b.dataset.range);
      $$('.seg-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderChart();
      renderSubjects();
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

  /* 模擬考 */
  function bindExams() {
    $('#examScores').innerHTML = EXAM_SUBJECTS.map((s) => `
      <label class="exam-score">
        <span>${s}</span>
        <input type="number" data-subject="${s}" min="0" max="15" step="1" inputmode="numeric" placeholder="－">
      </label>`).join('');

    $('#examForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#examName').value.trim();
      if (!name) return;
      const scores = {};
      let any = false;
      $$('#examScores input').forEach((i) => {
        const v = i.value.trim();
        if (v !== '') { scores[i.dataset.subject] = Math.max(0, Math.min(15, parseInt(v, 10) || 0)); any = true; }
      });
      if (!any) { toast('至少填一科的級分'); return; }

      store.data.exams.push({ id: uid(), name, date: today(), scores });
      $('#examForm').reset();
      save();
      toast(`已記錄「${name}」，總級分 ${Object.values(scores).reduce((s, v) => s + v, 0)}`);
    });

    $('#examList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-exam-del]');
      if (!btn) return;
      const ex = store.data.exams.find((x) => x.id === btn.dataset.examDel);
      if (ex && confirm(`刪除「${ex.name}」的成績紀錄？`)) {
        store.data.exams = store.data.exams.filter((x) => x.id !== ex.id);
        save();
      }
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

    $('#reasonFilter').innerHTML = REASONS
      .map((r) => `<button class="chip" type="button" data-rfilter="${r}" aria-pressed="false">${r}</button>`).join('');
    $('#statusFilter').innerHTML = STATUSES
      .map((s) => `<button class="chip" type="button" data-status="${s}" aria-pressed="${s === '全部'}">${s}</button>`).join('');

    const refreshFilterUI = () => {
      const n = activeFilterCount();
      $('#filterCount').hidden = n === 0;
      $('#filterCount').textContent = n;
      renderMistakes();
    };

    $('#subjectFilter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-subject]');
      if (!b) return;
      subjectFilter = b.dataset.subject;
      $$('#subjectFilter .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      refreshFilterUI();
    });

    $('#reasonFilter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rfilter]');
      if (!b) return;
      const r = b.dataset.rfilter;
      if (reasonFilter.has(r)) reasonFilter.delete(r); else reasonFilter.add(r);
      b.setAttribute('aria-pressed', String(reasonFilter.has(r)));
      refreshFilterUI();
    });

    $('#statusFilter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-status]');
      if (!b) return;
      statusFilter = b.dataset.status;
      $$('#statusFilter .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      refreshFilterUI();
    });

    $('#filterToggle').addEventListener('click', () => {
      const panel = $('#filterPanel');
      panel.hidden = !panel.hidden;
      $('#filterToggle').setAttribute('aria-expanded', String(!panel.hidden));
    });

    $('#filterClear').addEventListener('click', () => {
      subjectFilter = '全部';
      reasonFilter.clear();
      statusFilter = '全部';
      $$('#subjectFilter .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.subject === '全部')));
      $$('#reasonFilter .chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      $$('#statusFilter .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.status === '全部')));
      refreshFilterUI();
    });

    let searchTimer;
    $('#mkSearch').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { searchTerm = e.target.value; renderMistakes(); }, 180);
    });

    const setQuizMode = (on) => {
      quizMode = on;
      revealed.clear();
      $('#quizToggle').setAttribute('aria-pressed', String(on));
      $('#quizToggle').textContent = on ? '自測中' : '自測模式';
      $('.card-mistakes').classList.toggle('is-quiz', on);
      $('#quizBanner').hidden = !on;
      renderMistakes();
      toast(on ? '自測模式：先自己想過再看答案。' : '已離開自測模式。');
    };

    $('#quizToggle').addEventListener('click', () => setQuizMode(!quizMode));
    $('#quizExit').addEventListener('click', () => setQuizMode(false));

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
        answer: $('#mkAnswer').value.trim(),
        myError: $('#mkMyError').value.trim(),
        notes: $('#mkNotes').value.trim(),
        createdAt: today(),
        imageId,
        stage: 0,
        nextReviewAt: addDays(today(), REVIEW_STEPS[0]),
        mastered: false
      });

      // 自動帶勾對應的打卡項目（若使用者沒刪掉的話）
      const d = store.day(today());
      const wasPerfect = isPerfect(d);
      const fixId = autoTaskId('mistake');
      if (fixId) d[fixId] = true;

      $('#mistakeForm').reset();
      $$('#reasonChips .chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      $('.mk-more').open = false;
      clearImage();
      save();
      toast(isPerfect(d) && !wasPerfect
        ? `收錄完成，順手達成全勤 +${maxDayPoints()} 點 🔥`
        : `已收錄，${REVIEW_STEPS[0]} 天後提醒你重寫。`);
    });

    // 重寫 / 刪除 / 放大
    $('#mistakeList').addEventListener('click', async (e) => {
      const ok = e.target.closest('[data-review-ok]');
      const no = e.target.closest('[data-review-no]');
      const del = e.target.closest('[data-mk-del]');
      const thumb = e.target.closest('.mi-thumb');
      const reveal = e.target.closest('[data-reveal]');
      const edit = e.target.closest('[data-mk-edit]');

      if (reveal) { revealed.add(reveal.dataset.reveal); renderMistakes(); return; }
      if (edit) { openEditDialog(edit.dataset.mkEdit); return; }
      const reflect = e.target.closest('[data-mk-reflect]');
      if (reflect) { openReflect(reflect.dataset.mkReflect); return; }

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

    $('#printBtn').addEventListener('click', buildPrintSheet);

    $('#todoJump').addEventListener('click', () => {
      todoOnly = !todoOnly;
      if (todoOnly) dueOnly = false;
      $('#todoJump').textContent = todoOnly ? '顯示全部' : '只看待訂正';
      $('#dueJump').textContent = '只看待重寫';
      renderMistakes();
    });

    $('#dueJump').addEventListener('click', () => {
      dueOnly = !dueOnly;
      if (dueOnly) todoOnly = false;
      $('#dueJump').textContent = dueOnly ? '顯示全部' : '只看待重寫';
      $('#todoJump').textContent = '只看待訂正';
      renderMistakes();
    });
  }

  /* ---------- AI（透過 /api/ai 代理，金鑰在伺服器端） ---------- */
  async function callAI(payload) {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `伺服器回應 ${res.status}`);
    return data;
  }

  const blobToBase64 = async (blob) => (await blobToDataURL(blob)).split(',')[1];

  /* 讀題自動填表 */
  async function aiExtract() {
    if (!pendingImage) { toast('請先選一張題目圖片。'); return; }
    const btn = $('#aiExtract');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = '辨識中…';
    try {
      const out = await callAI({
        mode: 'extract',
        image: await blobToBase64(pendingImage.blob),
        mimeType: 'image/jpeg'
      });
      if (out.summary) $('#mkSummary').value = out.summary;
      if (out.subject && SUBJECTS.includes(out.subject)) $('#mkSubject').value = out.subject;
      if (out.unit) $('#mkUnit').value = out.unit;

      // AI 只讀題目，答案與訂正要自己寫 —— 展開欄位提醒，不然會收錄一題空殼
      $('.mk-more').open = true;
      $('#mkAnswer').focus();
      toast('題目讀好了。答案和訂正自己寫，那才是有效的訂正。');
    } catch (e) {
      console.error(e);
      toast('AI 辨識失敗：' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  /* 反思引導：先自己寫，AI 只評一次 */
  let reflectingId = null;

  function openReflect(id) {
    const m = store.data.mistakes.find((x) => x.id === id);
    if (!m) return;
    reflectingId = id;
    $('#reflectQ').textContent = m.summary;
    $('#reflectInput').value = m.myError || '';
    $('#reflectResult').hidden = true;
    $('#reflectSend').disabled = false;
    $('#reflectSend').textContent = '送出，看看我抓對了沒';
    $('#reflectDialog').showModal();
  }

  function bindReflect() {
    $('#aiExtract').addEventListener('click', aiExtract);

    $('#reflectSend').addEventListener('click', async () => {
      const m = store.data.mistakes.find((x) => x.id === reflectingId);
      const myError = $('#reflectInput').value.trim();
      if (!m || !myError) { toast('先寫下你覺得錯在哪。'); return; }

      const btn = $('#reflectSend');
      btn.disabled = true;
      btn.textContent = '思考中…';
      try {
        const out = await callAI({
          mode: 'reflect',
          question: m.summary,
          subject: m.subject,
          myError
        });

        $('#reflectVerdict').textContent = out.verdict || '';
        $('#reflectVerdict').className = 'reflect-verdict v-' +
          (out.verdict === '準確' ? 'ok' : out.verdict === '部分正確' ? 'mid' : 'no');
        $('#reflectFeedback').textContent = out.feedback || '';
        $('#reflectResult').hidden = false;
        btn.textContent = '已回饋';

        // 把自我診斷存進錯題，AI 判定的錯誤類型也一併補上
        m.myError = myError;
        if (Array.isArray(out.reasons) && out.reasons.length) {
          m.reasons = [...new Set([...(m.reasons || []), ...out.reasons])];
        }
        save();
      } catch (e) {
        console.error(e);
        toast('AI 回饋失敗：' + e.message);
        btn.disabled = false;
        btn.textContent = '再試一次';
      }
    });
  }

  /* 補充訂正內容 */
  let editingId = null;

  function openEditDialog(id) {
    const m = store.data.mistakes.find((x) => x.id === id);
    if (!m) return;
    editingId = id;
    $('#editTitle').textContent = m.summary;
    $('#edAnswer').value = m.answer || '';
    $('#edMyError').value = m.myError || '';
    $('#edNotes').value = m.notes || '';
    $('#editDialog').showModal();
  }

  function bindEditDialog() {
    $('#edSave').addEventListener('click', () => {
      const m = store.data.mistakes.find((x) => x.id === editingId);
      if (m) {
        m.answer = $('#edAnswer').value.trim();
        m.myError = $('#edMyError').value.trim();
        m.notes = $('#edNotes').value.trim();
        revealed.add(m.id);
        save();
        toast('訂正內容已更新');
      }
      $('#editDialog').close();
    });
  }

  /* 匯出複習卷：開一個獨立分頁排版後列印（可存成 PDF）

     為什麼不直接印目前這一頁：加到主畫面的 iOS app 是 standalone 模式，
     window.print() 在那裡通常沒有作用。開新分頁會跳回 Safari，
     在那邊列印／分享才正常。 */
  function printSheetHtml(list, imgs, scope) {
    const items = list.map((m) => `
      <li class="ps-item">
        <p class="ps-q">${esc(m.summary)}</p>
        <p class="ps-meta">${esc(m.subject)}${m.unit ? '・' + esc(m.unit) : ''}${
          (m.reasons || []).length ? '　易錯：' + m.reasons.map(esc).join('、') : ''}</p>
        ${m.imageId && imgs[m.imageId] ? `<img class="ps-img" src="${imgs[m.imageId]}" alt="">` : ''}
        <div class="ps-answer"><span>作答</span></div>
        ${m.answer || m.notes ? `<div class="ps-key"><b>參考</b>${esc([m.answer, m.notes].filter(Boolean).join('　'))}</div>` : ''}
      </li>`).join('');

    return `<!DOCTYPE html><html lang="zh-Hant"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>錯題複習卷・${esc(scope)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #fff; color: #000;
         font-family: "Noto Serif TC", Georgia, "Songti TC", serif; font-size: 15px; }
  .ps-bar { position: sticky; top: 0; background: #fff; padding-bottom: 12px;
            border-bottom: 1px solid #ddd; margin-bottom: 18px; display: flex; gap: 10px; flex-wrap: wrap; }
  .ps-bar button { font: inherit; font-size: 14px; padding: 10px 20px; border-radius: 10px;
                   border: 1px solid #3A5A40; background: #3A5A40; color: #fff; cursor: pointer; }
  .ps-bar .ghost { background: #fff; color: #3A5A40; }
  .ps-bar p { margin: 0; font-size: 13px; color: #666; flex-basis: 100%; }
  .ps-head { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 18px; }
  .ps-head h1 { font-size: 21px; margin: 0 0 6px; }
  .ps-head .sub { font-size: 13px; color: #444; margin: 0; }
  .ps-list { padding-left: 22px; margin: 0; }
  .ps-item { margin-bottom: 22px; break-inside: avoid; page-break-inside: avoid; }
  .ps-q { font-size: 15px; line-height: 1.65; margin: 0 0 4px; }
  .ps-meta { font-size: 12px; color: #555; margin: 0 0 7px; }
  .ps-img { max-width: 100%; max-height: 62mm; display: block; margin: 7px 0; }
  .ps-answer { border: 1px dashed #999; border-radius: 4px; height: 24mm; margin-top: 7px; position: relative; }
  .ps-answer span { position: absolute; top: 3px; left: 6px; font-size: 11px; color: #999; }
  .ps-key { margin-top: 6px; padding: 6px 9px; border-left: 3px solid #bbb;
            font-size: 12.5px; color: #555; line-height: 1.55; }
  .ps-key b { margin-right: 8px; color: #333; }
  .ps-foot { margin-top: 20px; font-size: 12px; color: #777; text-align: center; }
  @media print { .ps-bar { display: none; } body { padding: 0; } @page { margin: 14mm; } }
</style></head><body>
<div class="ps-bar">
  <button onclick="window.print()">列印／存成 PDF</button>
  <button class="ghost" onclick="window.close()">關閉</button>
  <p>手機若沒跳出列印視窗，用瀏覽器的「分享 → 列印」也可以存成 PDF。</p>
</div>
<div class="ps-head">
  <h1>錯題複習卷・${esc(scope)}</h1>
  <p class="sub">${fmtDate(today())}　共 ${list.length} 題　　姓名 ____________　得分 ________</p>
</div>
<ol class="ps-list">${items}</ol>
<p class="ps-foot">學測戰情室・${esc(scope)}錯題複習卷</p>
</body></html>`;
  }

  function buildPrintSheet() {
    const list = filteredMistakes().filter((m) => !m.mastered);
    if (!list.length) { toast('目前的篩選條件下沒有題目可以匯出。'); return; }

    // window.open 必須同步呼叫，否則會被當成非使用者操作而擋掉
    const win = window.open('', '_blank');
    if (!win) { toast('瀏覽器擋下了新分頁，請允許彈出視窗後再試。'); return; }
    win.document.write('<!DOCTYPE html><meta charset="UTF-8"><title>準備中…</title>' +
      '<p style="font-family:sans-serif;padding:24px">正在準備複習卷…</p>');

    (async () => {
      // 圖片轉成 data URL，因為 blob: 網址在新分頁讀不到
      const imgs = {};
      for (const m of list) {
        if (!m.imageId) continue;
        try {
          const blob = await idb.get(m.imageId);
          if (blob) imgs[m.imageId] = await blobToDataURL(blob);
        } catch { /* 讀不到就只印文字 */ }
      }

      const scope = subjectFilter === '全部' ? '全科' : subjectFilter;
      win.document.open();
      win.document.write(printSheetHtml(list, imgs, scope));
      win.document.close();

      // 等圖片解碼完再叫列印，否則可能印出空白圖
      win.addEventListener('load', () => {
        Promise.all([...win.document.images].map((img) => img.decode().catch(() => {})))
          .then(() => { try { win.print(); } catch { /* 使用者可用頁面上的按鈕 */ } });
      }, { once: true });

      toast(`複習卷已開啟，共 ${list.length} 題。`);
    })();
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
      $('#aiExtract').hidden = false;
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
    $('#aiExtract').hidden = true;
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

  /* ---------- 番茄鐘 ----------
     狀態用「結束時間戳」而非倒數計數器，重新整理或關掉分頁再回來都還準。 */
  let pomoTimer = null;

  const pomoState = () => {
    let p = store.data.pomo;
    if (!p || p.day !== today()) {
      p = store.data.pomo = { mode: 'focus', endsAt: null, remaining: POMO.focus * 60000, cycles: 0, day: today() };
    }
    return p;
  };

  const pomoLeft = (p) => (p.endsAt ? Math.max(0, p.endsAt - Date.now()) : p.remaining);
  const pomoTotal = (p) => (p.mode === 'focus' ? POMO.focus : p.mode === 'long' ? POMO.long : POMO.short) * 60000;

  function beep() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.frequency.value = 660;
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.22, ac.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
      o.start(); o.stop(ac.currentTime + 0.95);
      setTimeout(() => ac.close(), 1200);
    } catch { /* 沒有音訊權限就算了 */ }
  }

  const RING_LEN = 2 * Math.PI * 98;   // 對應 SVG 裡 r = 98

  function renderPomo() {
    const p = pomoState();
    const left = pomoLeft(p);
    const mm = String(Math.floor(left / 60000)).padStart(2, '0');
    const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
    const isBreak = p.mode !== 'focus';

    $('#pomoTime').textContent = `${mm}:${ss}`;
    $('#pomoMode').textContent = p.mode === 'focus' ? '專注' : p.mode === 'long' ? '長休息' : '短休息';
    $('#pomoMode').className = 'pomo-mode' + (isBreak ? ' is-break' : '');
    $('.card-pomo').classList.toggle('is-break', isBreak);

    // 環從滿圈慢慢消耗掉
    const progress = 1 - left / pomoTotal(p);
    $('#pomoRing').style.strokeDashoffset = String(RING_LEN * (1 - progress));

    $('#pomoSub').textContent = p.mode === 'focus' ? store.data.subject : '';
    $('#pomoStart').textContent = p.endsAt ? '暫停' : (left < pomoTotal(p) ? '繼續' : '開始');

    // 本輪四顆番茄的進度點
    const inRound = p.cycles % POMO.longEvery;
    $('#pomoDots').innerHTML = Array.from({ length: POMO.longEvery }, (_, i) =>
      `<li class="${i < (inRound === 0 && p.cycles > 0 && isBreak ? POMO.longEvery : inRound) ? 'done' : ''}"></li>`).join('');

    $('#pomoCycles').textContent = `今天 ${p.cycles} 顆`;
    $('#pomoHint').textContent = p.mode === 'focus'
      ? `結束後自動加 ${round1(POMO.focus / 60)} 小時到「${store.data.subject}」`
      : '休息一下，讓腦袋沉澱';
  }

  function pomoTick() {
    const p = pomoState();
    if (!p.endsAt) return;
    if (pomoLeft(p) > 0) { renderPomo(); return; }
    pomoFinish();
  }

  function pomoFinish() {
    const p = pomoState();
    p.endsAt = null;
    if (p.mode === 'focus') {
      p.cycles += 1;
      addHours(round1(POMO.focus / 60));       // 25 分 → 0.4 小時（四捨五入到 0.1）
      p.mode = (p.cycles % POMO.longEvery === 0) ? 'long' : 'short';
      musicOnPomo('pause');
      toast(`第 ${p.cycles} 顆番茄完成，已加 ${round1(POMO.focus / 60)} 小時到「${store.data.subject}」`);
    } else {
      p.mode = 'focus';
      toast('休息結束，回來繼續。');
    }
    p.remaining = pomoTotal(p);
    beep();
    save();
    renderPomo();
  }

  function bindPomo() {
    $('#pomoStart').addEventListener('click', () => {
      const p = pomoState();
      if (p.endsAt) {                       // 暫停
        p.remaining = pomoLeft(p);
        p.endsAt = null;
        musicOnPomo('pause');
      } else {                              // 開始／繼續
        p.endsAt = Date.now() + (p.remaining || pomoTotal(p));
        if (p.mode === 'focus') musicOnPomo('focus');
      }
      store.save();
      renderPomo();
    });

    $('#pomoReset').addEventListener('click', () => {
      const p = pomoState();
      if (p.endsAt) musicOnPomo('pause');
      p.endsAt = null;
      p.remaining = pomoTotal(p);
      store.save();
      renderPomo();
    });

    $('#pomoSkip').addEventListener('click', () => {
      const p = pomoState();
      if (p.mode === 'focus' && !confirm('跳過這顆番茄？不會計入時數。')) return;
      p.endsAt = null;
      p.mode = p.mode === 'focus' ? 'short' : 'focus';
      p.remaining = pomoTotal(p);
      store.save();
      renderPomo();
    });

    pomoTimer = setInterval(pomoTick, 500);
    renderPomo();
  }

  /* ============================================================
     專注音樂：環境音用 Web Audio 即時合成（免檔案、可離線），
     或嵌入 YouTube。兩者都能跟番茄鐘連動。
     ============================================================ */
  const AMBIENTS = {
    rain:  { name: '雨聲',   type: 'bandpass', freq: 1400, q: 0.6, lfo: 0.18, depth: 0.28, gain: 0.55 },
    waves: { name: '海浪',   type: 'lowpass',  freq: 520,  q: 0.8, lfo: 0.09, depth: 0.62, gain: 0.75, brown: true },
    fan:   { name: '風扇',   type: 'lowpass',  freq: 320,  q: 0.5, lfo: 0.5,  depth: 0.06, gain: 0.8,  brown: true },
    stream:{ name: '溪流',   type: 'highpass', freq: 900,  q: 0.7, lfo: 0.32, depth: 0.2,  gain: 0.4 },
    white: { name: '白噪音', type: 'lowpass',  freq: 8000, q: 0.4, lfo: 0,    depth: 0,    gain: 0.35 }
  };

  const music = {
    ctx: null, src: null, filter: null, lfo: null, lfoGain: null, gain: null,
    playing: false, pausedByPomo: false,

    /* 4 秒的噪音緩衝，循環播放聽不出接縫 */
    buildNoise(brown) {
      const len = this.ctx.sampleRate * 4;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      if (brown) {
        let last = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      } else {
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      // 頭尾各做一小段淡入淡出，避免循環時的爆音
      const fade = Math.floor(this.ctx.sampleRate * 0.05);
      for (let i = 0; i < fade; i++) {
        d[i] *= i / fade;
        d[len - 1 - i] *= i / fade;
      }
      return buf;
    },

    start() {
      const preset = AMBIENTS[store.data.music.ambient] || AMBIENTS.rain;
      this.stopNodes();
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();

      this.src = this.ctx.createBufferSource();
      this.src.buffer = this.buildNoise(preset.brown);
      this.src.loop = true;

      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = preset.type;
      this.filter.frequency.value = preset.freq;
      this.filter.Q.value = preset.q;

      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;

      this.src.connect(this.filter).connect(this.gain).connect(this.ctx.destination);

      // 緩慢起伏，聽起來才不像單調的嘶聲
      if (preset.lfo > 0) {
        this.lfo = this.ctx.createOscillator();
        this.lfo.frequency.value = preset.lfo;
        this.lfoGain = this.ctx.createGain();
        this.lfoGain.gain.value = preset.depth * preset.gain;
        this.lfo.connect(this.lfoGain).connect(this.gain.gain);
        this.lfo.start();
      }

      this.src.start();
      this.fadeTo(this.targetGain(preset), 0.8);
      this.playing = true;
    },

    targetGain(preset) {
      const p = preset || AMBIENTS[store.data.music.ambient] || AMBIENTS.rain;
      return (store.data.music.volume / 100) * p.gain;
    },

    fadeTo(v, sec) {
      if (!this.gain) return;
      const t = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), t);
      this.gain.gain.linearRampToValueAtTime(Math.max(0.0001, v), t + sec);
    },

    stopNodes() {
      try { this.lfo?.stop(); } catch { /* 已停止 */ }
      try { this.src?.stop(); } catch { /* 已停止 */ }
      this.lfo = this.src = this.filter = this.gain = this.lfoGain = null;
    },

    stop() {
      if (this.gain) {
        this.fadeTo(0, 0.4);
        const nodes = { src: this.src, lfo: this.lfo };
        setTimeout(() => {
          try { nodes.lfo?.stop(); } catch { /* ignore */ }
          try { nodes.src?.stop(); } catch { /* ignore */ }
        }, 500);
        this.lfo = this.src = this.filter = this.gain = this.lfoGain = null;
      } else {
        this.stopNodes();
      }
      this.playing = false;
    },

    setVolume() {
      if (this.playing && this.gain) this.fadeTo(this.targetGain(), 0.2);
    }
  };

  /* ---------- YouTube ---------- */
  function ytEmbedUrl(raw) {
    let u;
    try { u = new URL(raw.trim()); } catch { return null; }
    const host = u.hostname.replace(/^www\./, '');
    const base = 'https://www.youtube-nocookie.com/embed/';
    const common = 'enablejsapi=1&rel=0&playsinline=1';

    if (host === 'youtu.be') {
      const id = u.pathname.slice(1);
      return id ? `${base}${id}?${common}` : null;
    }
    if (!host.endsWith('youtube.com')) return null;

    const list = u.searchParams.get('list');
    const v = u.searchParams.get('v');
    if (v) return `${base}${v}?${common}${list ? '&list=' + list : ''}`;
    if (list) return `${base}videoseries?${common}&list=${list}`;
    if (u.pathname.startsWith('/embed/')) return `${base}${u.pathname.slice(7)}?${common}`;
    return null;
  }

  const ytFrame = () => $('#ytWrap iframe');

  function ytCommand(func) {
    const f = ytFrame();
    if (!f?.contentWindow) return;
    try {
      f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
    } catch { /* 跨來源受限就算了 */ }
  }

  function loadYt(url, autoplay, title) {
    const embed = ytEmbedUrl(url);
    if (!embed) { toast('這個網址看起來不是 YouTube 影片或播放清單。'); return false; }
    $('#ytPlayer').hidden = false;
    $('#ytWrap').innerHTML =
      `<iframe src="${embed}${autoplay ? '&autoplay=1' : ''}" title="專注音樂"
        allow="autoplay; encrypted-media" allowfullscreen loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    if (title !== undefined) store.data.music.ytTitle = title;
    $('#ytNow').textContent = store.data.music.ytTitle || '';
    $('#ytNow').hidden = !store.data.music.ytTitle;
    return true;
  }

  /* ---------- YouTube 搜尋 ---------- */
  const YT_PRESETS = ['lofi 讀書', '古典鋼琴 專注', '白噪音 咖啡廳', 'Ghibli 鋼琴', '無歌詞 純音樂'];

  function renderYtResults(items) {
    const list = $('#ytResults');
    list.hidden = items.length === 0;
    list.innerHTML = items.map((it) => `
      <li>
        <button class="yt-item" type="button" data-yt-id="${esc(it.id)}" data-yt-title="${esc(it.title)}">
          <img src="${esc(it.thumb)}" alt="" loading="lazy">
          <span class="yt-item-text">
            <span class="yt-item-title">${esc(it.title)}</span>
            <span class="yt-item-ch">${esc(it.channel)}</span>
          </span>
        </button>
      </li>`).join('');
  }

  function ytMessage(msg) {
    $('#ytMsg').hidden = !msg;
    $('#ytMsg').textContent = msg || '';
  }

  async function ytSearch(q) {
    const btn = $('#ytSearchBtn');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = '搜尋中…';
    ytMessage('');
    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `伺服器回應 ${res.status}`);

      renderYtResults(data.items || []);
      if (!data.items?.length) ytMessage('找不到可以嵌入播放的結果，換個關鍵字試試。');
    } catch (e) {
      console.error(e);
      $('#ytResults').hidden = true;
      ytMessage(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  /* ---------- 統一的播放控制 ---------- */
  const musicIsYt = () => store.data.music.source === 'youtube';

  function musicPlay() {
    if (musicIsYt()) {
      if (!ytFrame()) {
        if (!store.data.music.ytUrl || !loadYt(store.data.music.ytUrl, true)) return;
      } else ytCommand('playVideo');
    } else {
      music.start();
    }
    store.data.music.playing = true;
    renderMusic();
  }

  function musicPause() {
    if (musicIsYt()) ytCommand('pauseVideo');
    else music.stop();
    store.data.music.playing = false;
    renderMusic();
  }

  /* 番茄鐘連動 */
  function musicOnPomo(action) {
    if (!store.data.music.linkPomo) return;
    if (action === 'focus') {
      musicPlay();
      music.pausedByPomo = false;
    } else if (store.data.music.playing) {
      musicPause();
      music.pausedByPomo = true;
    }
  }

  function renderMusic() {
    const m = store.data.music;
    $$('.card-music .seg-btn').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.msrc === m.source)));
    $('#ambientPane').hidden = m.source !== 'ambient';
    $('#youtubePane').hidden = m.source !== 'youtube';

    $('#ambientList').innerHTML = Object.entries(AMBIENTS).map(([k, v]) =>
      `<button class="chip" type="button" data-ambient="${k}" aria-pressed="${k === m.ambient}">${v.name}</button>`).join('');

    $('#musicToggle').textContent = m.playing ? '暫停' : '播放';
    $('#musicToggle').setAttribute('aria-pressed', String(!!m.playing));
    $('#musicVol').value = m.volume;
    $('#musicLinkPomo').checked = !!m.linkPomo;
  }

  function bindMusic() {
    renderMusic();

    $$('.card-music .seg-btn').forEach((b) => b.addEventListener('click', () => {
      if (store.data.music.playing) musicPause();
      store.data.music.source = b.dataset.msrc;
      store.save();
      renderMusic();
    }));

    $('#ambientList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ambient]');
      if (!b) return;
      store.data.music.ambient = b.dataset.ambient;
      store.save();
      renderMusic();
      if (store.data.music.playing) music.start();   // 立刻換成新的音色
    });

    $('#musicToggle').addEventListener('click', () => {
      store.data.music.playing ? musicPause() : musicPlay();
    });

    $('#musicVol').addEventListener('input', (e) => {
      store.data.music.volume = Number(e.target.value);
      music.setVolume();
    });
    $('#musicVol').addEventListener('change', () => store.save());

    $('#musicLinkPomo').addEventListener('change', (e) => {
      store.data.music.linkPomo = e.target.checked;
      store.save();
    });

    $('#ytForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const url = $('#ytUrl').value.trim();
      if (!url) return;
      if (loadYt(url, false, '')) {
        store.data.music.ytUrl = url;
        store.save();
        toast('已載入。按播放鍵開始。');
      }
    });

    // 搜尋
    $('#ytPresets').innerHTML = YT_PRESETS
      .map((p) => `<button class="chip" type="button" data-preset="${esc(p)}">${esc(p)}</button>`).join('');

    $('#ytPresets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (!b) return;
      $('#ytQuery').value = b.dataset.preset;
      ytSearch(b.dataset.preset);
    });

    $('#ytSearchForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('#ytQuery').value.trim();
      if (q) ytSearch(q);
    });

    $('#ytResults').addEventListener('click', (e) => {
      const b = e.target.closest('[data-yt-id]');
      if (!b) return;
      const url = `https://www.youtube.com/watch?v=${b.dataset.ytId}`;
      if (loadYt(url, true, b.dataset.ytTitle)) {
        store.data.music.ytUrl = url;
        store.data.music.playing = true;
        store.save();
        $('#ytResults').hidden = true;
        renderMusic();
      }
    });

    if (store.data.music.ytUrl) {
      $('#ytUrl').value = store.data.music.ytUrl;
      $('#ytNow').textContent = store.data.music.ytTitle || '';
      $('#ytNow').hidden = !store.data.music.ytTitle;
    }
  }

  /* 打卡項目編輯 */
  function renderTaskEditor() {
    const tasks = store.data.tasks;
    $('#taskEditor').innerHTML = tasks.map((t, i) => `
      <li class="task-edit">
        <div class="task-edit-fields">
          <input type="text" class="te-name" data-i="${i}" value="${esc(t.name)}"
                 maxlength="20" placeholder="項目名稱" aria-label="第 ${i + 1} 項名稱">
          <input type="text" class="te-note" data-i="${i}"
                 value="${esc((t.note || '').replace('{goal}', store.data.goalHours))}"
                 maxlength="30" placeholder="說明（選填）" aria-label="第 ${i + 1} 項說明">
        </div>
        <button class="mi-del" type="button" data-task-del="${i}"
                aria-label="刪除「${esc(t.name)}」" ${tasks.length <= MIN_TASKS ? 'disabled' : ''}>✕</button>
      </li>`).join('');
    $('#taskAdd').disabled = tasks.length >= MAX_TASKS;
  }

  function bindTaskEditor() {
    renderTaskEditor();

    // 邊打字邊存，但不重繪編輯器本身，否則游標會跳掉
    $('#taskEditor').addEventListener('input', (e) => {
      const el = e.target;
      const i = Number(el.dataset.i);
      const task = store.data.tasks[i];
      if (!task) return;
      if (el.classList.contains('te-name')) task.name = el.value;
      else if (el.classList.contains('te-note')) task.note = el.value;
      store.save();
      renderCheckin();
    });

    $('#taskEditor').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-task-del]');
      if (!btn) return;
      const i = Number(btn.dataset.taskDel);
      const task = store.data.tasks[i];
      if (!task || store.data.tasks.length <= MIN_TASKS) return;
      if (!confirm(`刪除打卡項目「${task.name}」？\n過去的紀錄與點數不會改變。`)) return;
      store.data.tasks.splice(i, 1);
      save();
      renderTaskEditor();
      toast('已刪除項目');
    });

    $('#taskAdd').addEventListener('click', () => {
      if (store.data.tasks.length >= MAX_TASKS) return;
      store.data.tasks.push({ id: uid(), name: '新項目', note: '' });
      save();
      renderTaskEditor();
      $('#taskEditor .task-edit:last-child .te-name')?.focus();
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
    renderExams();
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
    bindExams();
    bindMistakes();
    bindCertificate();
    bindEditDialog();
    bindReflect();
    bindDialogs();
    bindBackup();
    bindTaskEditor();
    bindMusic();
    bindPomo();
    bindZoom();
    bindTabs();
    bindCursor();
    renderAll();

    // 供 google.js / firebase.js 使用
    window.appToast = toast;
    window.appExportPayload = exportPayload;
    window.appImportPayload = importPayload;

    // 雲端同步只帶文字資料，圖片走 Drive
    window.appCloudSnapshot = () => JSON.parse(JSON.stringify(store.data));
    window.appApplyCloud = async (cloud) => {
      const { syncedAt, ...data } = cloud;
      store.data = Object.assign(defaults(), data);
      thumbCache.clear();
      taskSig = '';
      store.save();
      applyTheme(store.data.theme ?? 'light');
      applyZoom(store.data.zoom || 1);
      renderTaskEditor();
      renderAll();
    };

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
