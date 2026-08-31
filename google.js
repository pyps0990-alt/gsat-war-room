/* ============================================================
   google.js — Google API 存取權杖

   登入本身由 firebase.js 處理（Firebase Auth 的 Google 登入會一併
   要到 drive.file 權限），這裡只負責：
   - 保管那組存取權杖，過期時用 GIS 靜默換發
   - 用 Gmail API 把兌換證書寄給使用者自己

   資料備份已改由 Firestore 負責，不再需要 Drive 備份檔。
   ============================================================ */
(() => {
  'use strict';

  const CLIENT_ID = '175245453159-2ttjmdu5ehf9ss34r00ddbk7q8j09b8f.apps.googleusercontent.com';

  const SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/drive.file'
  ].join(' ');

  const TOKEN_KEY = 'gsat-google-token';

  let token = null;         // { access_token, expires_at }
  let tokenClient = null;

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

  /* Firebase 登入時已取得帶 Drive 權限的權杖，直接沿用，
     使用者就不必為了圖片與寄信再登入第二次 */
  function adoptToken(accessToken, expiresInSec = 3600) {
    saveToken({ access_token: accessToken, expires_at: Date.now() + (expiresInSec - 60) * 1000 });
  }

  /* ---------- 權杖換發 ---------- */
  function initClient() {
    if (tokenClient || !window.google?.accounts?.oauth2) return;
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: () => {}
    });
  }

  /* 權杖過期時換一組。使用者已經授權過，所以通常不會再跳視窗。 */
  function refresh() {
    return new Promise((resolve, reject) => {
      initClient();
      if (!tokenClient) { reject(new Error('Google 登入元件尚未載入')); return; }
      tokenClient.callback = (res) => {
        if (res.error) { reject(new Error(res.error)); return; }
        adoptToken(res.access_token, res.expires_in);
        resolve(token);
      };
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  function signOut() {
    if (token?.access_token && window.google?.accounts?.oauth2) {
      try { window.google.accounts.oauth2.revoke(token.access_token); } catch { /* ignore */ }
    }
    token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  }

  const ensureToken = async () => {
    if (!isSignedIn()) await refresh();
    return token.access_token;
  };

  /* ---------- Gmail：寄兌換證書 ---------- */
  async function sendMail(to, subject, html) {
    const at = await ensureToken();
    const message = [
      `To: ${to}`,
      `Subject: =?UTF-8?B?${b64(subject)}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      b64(html)
    ].join('\r\n');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: b64url(message) })
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return true;
  }

  function mount() {
    if (!CLIENT_ID) return;
    // 載入 GIS，供權杖過期時靜默換發
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = initClient;
    document.head.appendChild(s);

    token = loadToken();
  }

  window.googleAuth = { isSignedIn, adoptToken, signOut, sendMail, configured: !!CLIENT_ID };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
