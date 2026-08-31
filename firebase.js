/* ============================================================
   firebase.js — Google 登入 + Firestore 雲端同步

   本機（localStorage）仍是工作副本，速度快也能離線用；
   Firestore 是耐久的雲端副本。登入後：
   - 資料變動 → 延遲 2 秒寫入雲端（避免每個按鍵都打一次）
   - 開啟時 → 比對兩邊的 updatedAt，雲端較新就問要不要拉下來

   設定方式見 README-firebase-setup.md。
   ============================================================ */
(() => {
  'use strict';

  const CONFIG = {
    apiKey: 'AIzaSyChkaZIWEygbaR7rCpOAuIu2MjA5FfWnfU',
    authDomain: 'gsat-war-room-f88ab.firebaseapp.com',
    projectId: 'gsat-war-room-f88ab',
    storageBucket: 'gsat-war-room-f88ab.firebasestorage.app',
    messagingSenderId: '432006748162',
    appId: '1:432006748162:web:1f9cc27e11c2664a346f1b'
  };

  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
  const PUSH_DELAY = 2000;

  let app = null, auth = null, db = null, fb = null;
  let user = null;
  let pushTimer = null;
  let ready = false;
  let suppressPush = false;   // 從雲端拉下來時不要又推回去

  /* ---------- 載入 SDK ---------- */
  async function loadSdk() {
    if (fb) return fb;
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`)
    ]);
    fb = { ...appMod, ...authMod, ...fsMod };
    app = fb.initializeApp(CONFIG);
    auth = fb.getAuth(app);
    db = fb.getFirestore(app);
    return fb;
  }

  const docRef = () => fb.doc(db, 'users', user.uid);

  /* ---------- 讀寫 ---------- */
  async function pull() {
    const snap = await fb.getDoc(docRef());
    return snap.exists() ? snap.data() : null;
  }

  async function push() {
    if (!user || suppressPush) return;
    const data = window.appCloudSnapshot?.();
    if (!data) return;
    try {
      await fb.setDoc(docRef(), { ...data, syncedAt: new Date().toISOString() });
      markSynced();
    } catch (e) {
      console.error('雲端儲存失敗', e);
      setStatus('雲端儲存失敗，資料仍在這台裝置上。');
    }
  }

  function schedulePush() {
    if (!user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, PUSH_DELAY);
  }

  function markSynced() {
    try { localStorage.setItem('gsat-cloud-last', new Date().toISOString()); } catch { /* ignore */ }
    setStatus();
  }

  /* ---------- 首次登入後的合併 ---------- */
  async function syncOnSignIn() {
    const cloud = await pull();
    const local = window.appCloudSnapshot?.();

    if (!cloud) { await push(); return; }                 // 雲端還沒資料 → 直接上傳
    if (!local) { await applyCloud(cloud); return; }

    const cloudAt = cloud.updatedAt || '';
    const localAt = local.updatedAt || '';

    if (cloudAt > localAt) {
      const when = cloudAt ? new Date(cloudAt).toLocaleString('zh-TW') : '未知時間';
      if (confirm(`雲端有較新的資料（${when}）。\n要用雲端版本覆蓋這台裝置嗎？\n\n選「取消」則保留這台裝置的資料並上傳。`)) {
        await applyCloud(cloud);
      } else {
        await push();
      }
    } else {
      await push();                                       // 本機較新或一樣 → 上傳
    }
  }

  async function applyCloud(cloud) {
    suppressPush = true;
    try {
      await window.appApplyCloud?.(cloud);
      markSynced();
      window.appToast?.('已從雲端載入資料');
    } finally {
      suppressPush = false;
    }
  }

  /* ---------- UI ---------- */
  function setStatus(msg) {
    const el = document.querySelector('#fbStatus');
    if (!el) return;
    if (msg) { el.textContent = msg; return; }
    if (!user) {
      el.textContent = '用 Google 登入後，打卡、錯題、獎勵與成績會存到雲端。換手機或重灌都拿得回來。';
      return;
    }
    const last = localStorage.getItem('gsat-cloud-last');
    el.textContent = `已登入 ${user.email || user.displayName || ''}` +
      (last ? `・最後同步 ${new Date(last).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })}` : '・尚未同步');
  }

  function renderBar() {
    const bar = document.querySelector('#firebaseBar');
    if (!bar) return;
    bar.querySelector('#fbSignIn').hidden = !!user;
    bar.querySelector('#fbSignOut').hidden = !user;
    bar.querySelector('#fbSyncNow').hidden = !user;
    setStatus();
  }

  /* ---------- 登入 / 登出 ---------- */
  async function signIn() {
    await loadSdk();
    const provider = new fb.GoogleAuthProvider();
    // 順便要 Drive 權限，錯題圖片才能存到使用者自己的雲端硬碟
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await fb.signInWithPopup(auth, provider);
    const cred = fb.GoogleAuthProvider.credentialFromResult(result);
    if (cred?.accessToken) {
      // 交給 google.js 用來上傳圖片／寄信
      window.googleAuth?.adoptToken?.(cred.accessToken, 3600);
    }
    return result.user;
  }

  async function signOutNow() {
    if (pushTimer) { clearTimeout(pushTimer); await push(); }
    await fb.signOut(auth);
  }

  /* ---------- 啟動 ---------- */
  async function mount() {
    const bar = document.querySelector('#firebaseBar');
    if (!bar) return;
    if (!CONFIG.apiKey) { bar.hidden = true; return; }
    bar.hidden = false;
    renderBar();

    bar.querySelector('#fbSignIn').addEventListener('click', async () => {
      try {
        setStatus('登入中…');
        await signIn();
      } catch (e) {
        console.error(e);
        setStatus(e?.code === 'auth/popup-closed-by-user'
          ? '登入已取消。'
          : `登入失敗：${e?.code || e?.message || e}`);
      }
    });

    bar.querySelector('#fbSignOut').addEventListener('click', async () => {
      try { await signOutNow(); window.appToast?.('已登出，資料仍留在這台裝置上。'); }
      catch (e) { console.error(e); }
    });

    bar.querySelector('#fbSyncNow').addEventListener('click', async () => {
      setStatus('同步中…');
      await push();
      window.appToast?.('已同步到雲端');
    });

    try {
      await loadSdk();
    } catch (e) {
      console.error('Firebase SDK 載入失敗', e);
      setStatus('雲端功能載入失敗，app 其他功能不受影響。');
      return;
    }

    fb.onAuthStateChanged(auth, async (u) => {
      user = u;
      renderBar();
      if (!u) return;
      try {
        setStatus('同步中…');
        await syncOnSignIn();
        renderBar();
      } catch (e) {
        console.error(e);
        setStatus(`同步失敗：${e?.code || e?.message || e}`);
      }
    });

    ready = true;
  }

  window.appCloudSync = {
    schedulePush,
    isSignedIn: () => !!user,
    get ready() { return ready; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
