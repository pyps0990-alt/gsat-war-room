# Firebase 設定步驟

做完之後，資料會存在雲端：換手機、重灌、甚至刪掉主畫面 app，登入同一個 Google 帳號就全部回來。

預估 10 分鐘。全部在免費方案額度內（這個 app 的用量大概是免費額度的千分之一）。

---

## 1. 建立 Firebase 專案

前往 [Firebase Console](https://console.firebase.google.com/) → **新增專案**

- 專案名稱：`gsat-war-room`（隨意）
- **可以直接沿用你之前建的 Google Cloud 專案** —— 在建立流程中選現有專案即可，這樣 Drive／Gmail 的授權設定不用重做
- Google Analytics：**關閉**（用不到）

---

## 2. 開啟 Google 登入

左側 **建構 → Authentication** → 開始使用 → **Sign-in method** 分頁

- 選 **Google** → 啟用
- 專案公開名稱：學測戰情室
- 專案支援電子郵件：選你的 Gmail
- 儲存

---

## 3. 建立 Firestore 資料庫

左側 **建構 → Firestore Database** → 建立資料庫

- 模式：**以正式版模式啟動**（安全規則下一步設定）
- 位置：選 **asia-east1（台灣）** 或 asia-northeast1（東京），延遲最低

---

## 4. 設定安全規則（重要）

進 Firestore 的 **規則** 分頁，把內容整個換成：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 每個人只能讀寫自己的那份資料
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

按 **發布**。

> 這條規則的意思是：必須登入，而且只能碰自己 uid 的文件。沒有它的話任何人都能讀你的資料。

---

## 5. 註冊網頁應用並取得設定值

專案總覽 → 齒輪 **專案設定** → 捲到最下面「你的應用程式」→ 點 **網頁圖示 `</>`**

- 應用程式暱稱：`gsat-war-room`
- **不要**勾選 Firebase Hosting（我們用 Vercel）
- 註冊應用程式

接著畫面會出現一段 `firebaseConfig`，長這樣：

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "gsat-war-room.firebaseapp.com",
  projectId: "gsat-war-room",
  storageBucket: "gsat-war-room.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

**把這整段貼給我**，我填進程式碼。

---

## 6. 授權網域

**Authentication → Settings → 授權網域** → 新增網域：

```
gsat-war-room.vercel.app
```

（`localhost` 預設就在清單裡，不用加。）

沒加這一筆的話，登入時 Google 會擋下來。

---

## 安全性說明

`firebaseConfig` 裡的 `apiKey` **不是密鑰**，它本來就會出現在前端原始碼裡，公開沒有問題 —— 這是 Firebase 官方的設計。真正的保護來自：

- **第 4 步的安全規則**：決定誰能讀寫哪些資料
- **第 6 步的授權網域**：決定哪些網址能發起登入

所以規則一定要照第 4 步設定好，不能留在測試模式。
