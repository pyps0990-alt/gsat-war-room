/* ============================================================
   google.js — Google 帳號整合
   1) Gmail：兌換獎勵時把「兌換證書」寄到自己的信箱
   2) Drive：把整包資料（打卡、錯題、圖片）備份成一個檔案，換裝置可還原

   設定方式見 README-google-setup.md。
   在下面填入你的 OAuth 用戶端 ID 之後，頁尾就會出現「連結 Google 帳號」。
   留空的話整個模組會靜默停用，app 其他功能完全不受影響。
   ============================================================ */
(() => {
  'use strict';

  const CLIENT_ID = '175245453159-2ttjmdu5ehf9ss34r00ddbk7q8j09b8f.apps.googleusercontent.com';   // ← 貼上你的 OAuth 用戶端 ID（結尾是 .apps.googleusercontent.com）

  const SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/drive.file'
  ].join(' ');

  const BACKUP_NAME = 'gsat-war-room-backup.json';
  const TOKEN_KEY = 'gsat-google-token';
  const FILE_KEY = 'gsat-drive-file-id';

  let token = null;         // { access_token, expires_at }
  let tokenClient = null;
  let gisReady = false;

  /* ---------- 小工具 ---------- */
  const b64 = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  };
  const b64url = (str) => b64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const loadToken = () => {
    try {
      const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      if (t && t.expires_at > Date.now() + 60000) return t;
    } catch { /* ignore */ }
    return null;
  };
  const saveToken = (t) => {
    token = t;
    try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch { /* ignore */ }
  };

  const isSignedIn = () => !!(token && token.expires_at > Date.now() + 60000);

  /* ---------- 授權 ---------- */
  function initClient() {
    if (tokenClient || !window.google?.accounts?.oauth2) return;
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: () => {}   // 每次 requestAccessToken 前動態指定
    });
    gisReady = true;
  }

  function signIn() {
    return new Promise((resolve, reject) => {
      initClient();
      if (!tokenClient) { reject(new Error('Google 登入元件尚未載入')); return; }
      tokenClient.callback = (res) => {
        if (res.error) { reject(new Error(res.error)); return; }
        saveToken({ access_token: res.access_token, expires_at: Date.now() + (res.expires_in - 60) * 1000 });
        renderBar();
        resolve(token);
      };
      tokenClient.requestAccessToken({ prompt: isSignedIn() ? '' : 'consent' });
    });
  }

  function signOut() {
    if (token?.access_token && window.google?.accounts?.oauth2) {
      try { window.google.accounts.oauth2.revoke(token.access_token); } catch { /* ignore */ }
    }
    token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    renderBar();
  }

  const ensureToken = async () => { if (!isSignedIn()) await signIn(); return token.access_token; };

  const authFetch = async (url, opts = {}) => {
    const at = await ensureToken();
    const res = await fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${at}` }
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res;
  };

  /* ---------- Gmail：寄兌換證書 ---------- */
  async function sendMail(to, subject, html) {
    const message = [
      `To: ${to}`,
      `Subject: =?UTF-8?B?${b64(subject)}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      b64(html)
    ].join('\r\n');

    await authFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: b64url(message) })
    });
    return true;
  }

  /* ---------- Drive：整包備份／還原 ---------- */
  async function findBackupFile() {
    const cached = localStorage.getItem(FILE_KEY);
    if (cached) {
      try {
        await authFetch(`https://www.googleapis.com/drive/v3/files/${cached}?fields=id`);
        return cached;
      } catch { localStorage.removeItem(FILE_KEY); }
    }
    const q = encodeURIComponent(`name='${BACKUP_NAME}' and trashed=false`);
    const res = await authFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&pageSize=1`);
    const { files } = await res.json();
    if (files?.length) { localStorage.setItem(FILE_KEY, files[0].id); return files[0].id; }
    return null;
  }

  async function backup(payload) {
    const body = JSON.stringify(payload);
    const id = await findBackupFile();
    const boundary = 'gsat' + Math.random().toString(36).slice(2);
    const meta = id ? {} : { name: BACKUP_NAME, mimeType: 'application/json' };
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;

    const url = id
      ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart&fields=id`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';

    const res = await authFetch(url, {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart
    });
    const out = await res.json();
    if (out.id) localStorage.setItem(FILE_KEY, out.id);
    localStorage.setItem('gsat-drive-last', new Date().toISOString());
    renderBar();
    return out.id;
  }

  async function restore() {
    const id = await findBackupFile();
    if (!id) throw new Error('Drive 上找不到備份檔');
    const res = await authFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
    return res.json();
  }

  /* ---------- 頁尾 UI ---------- */
  function renderBar() {
    const bar = document.querySelector('#googleBar');
    if (!bar) return;
    const last = localStorage.getItem('gsat-drive-last');
    if (isSignedIn()) {
      bar.querySelector('#gStatus').textContent = last
        ? `已連結 Google・最後備份 ${new Date(last).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })}`
        : '已連結 Google，還沒備份過。';
      bar.querySelector('#gSignIn').hidden = true;
      bar.querySelector('#gBackup').hidden = false;
      bar.querySelector('#gRestore').hidden = false;
      bar.querySelector('#gSignOut').hidden = false;
    } else {
      bar.querySelector('#gStatus').textContent = '連結 Google 帳號後，可自動備份到你的雲端硬碟，兌換證書也會直接寄到你的 Gmail。';
      bar.querySelector('#gSignIn').hidden = false;
      bar.querySelector('#gBackup').hidden = true;
      bar.querySelector('#gRestore').hidden = true;
      bar.querySelector('#gSignOut').hidden = true;
    }
  }

  function mount() {
    const bar = document.querySelector('#googleBar');
    if (!bar) return;
    if (!CLIENT_ID) { bar.hidden = true; return; }   // 尚未設定 → 靜默停用
    bar.hidden = false;

    // 載入 Google Identity Services
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => { initClient(); renderBar(); };
    document.head.appendChild(s);

    token = loadToken();

    bar.querySelector('#gSignIn').addEventListener('click', async () => {
      try { await signIn(); window.appToast?.('已連結 Google 帳號'); }
      catch (e) { console.error(e); window.appToast?.('連結失敗，請再試一次'); }
    });
    bar.querySelector('#gSignOut').addEventListener('click', signOut);

    bar.querySelector('#gBackup').addEventListener('click', async () => {
      try {
        window.appToast?.('備份中…');
        await backup(await window.appExportPayload());
        window.appToast?.('已備份到你的雲端硬碟');
      } catch (e) { console.error(e); window.appToast?.('備份失敗：' + e.message); }
    });

    bar.querySelector('#gRestore').addEventListener('click', async () => {
      try {
        const payload = await restore();
        const when = payload?.exportedAt ? new Date(payload.exportedAt).toLocaleString('zh-TW') : '未知時間';
        if (!confirm(`Drive 上的備份時間為 ${when}。\n還原會覆蓋這台裝置目前的所有資料，確定嗎？`)) return;
        await window.appImportPayload(payload);
        window.appToast?.('已從 Drive 還原');
      } catch (e) { console.error(e); window.appToast?.('還原失敗：' + e.message); }
    });

    renderBar();
  }

  window.googleAuth = { isSignedIn, signIn, signOut, sendMail, backup, restore, configured: !!CLIENT_ID };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
