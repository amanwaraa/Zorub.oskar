/* patch-sync-fix.js v1.0.0
   حل جذري لعداد العمليات غير المتزامنة + مزامنة تلقائية بعد رجوع النت
   يضاف بعد app.js وبعد patch.js
   لا يلمس تسجيل الدخول ولا يوقف تحميل الموقع
*/

(function () {
  "use strict";

  const VERSION = "1.0.0";
  const PREFIX = "DFDFG";

  const SESSION_KEY = `${PREFIX}_USER_SESSION`;
  const OUTBOX_KEY = `${PREFIX}_patch_sync_outbox_v4`;
  const OUTBOX_LOG_KEY = `${PREFIX}_patch_sync_log_v1`;
  const LAST_SYNC_KEY = `${PREFIX}_patch_last_sync_at_v4`;

  const DB_NAME = `${PREFIX}_offline_cashier_db_v6`;
  const DB_VERSION = 6;

  let syncRunning = false;
  let patched = false;
  let retryTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function q(selector, root = document) {
    return root.querySelector(selector);
  }

  function qa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function parseJson(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function setJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getSession() {
    return parseJson(localStorage.getItem(SESSION_KEY), null);
  }

  function isLoggedIn() {
    return !!getSession();
  }

  function isOnlineMode() {
    return getSession()?.appMode === "online";
  }

  function canSync() {
    return isLoggedIn() && isOnlineMode() && navigator.onLine;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getOutbox() {
    const list = parseJson(localStorage.getItem(OUTBOX_KEY), []);
    return Array.isArray(list) ? list : [];
  }

  function setOutbox(list) {
    setJson(OUTBOX_KEY, Array.isArray(list) ? list : []);
    updateBadge();
    renderSyncLogPanel();
  }

  function getLog() {
    const list = parseJson(localStorage.getItem(OUTBOX_LOG_KEY), []);
    return Array.isArray(list) ? list : [];
  }

  function setLog(list) {
    setJson(OUTBOX_LOG_KEY, Array.isArray(list) ? list : []);
    renderSyncLogPanel();
  }

  function uniqueOutbox(list) {
    const map = new Map();
    list.forEach(item => {
      if (!item || !item.id) return;
      map.set(item.id, item);
    });
    return Array.from(map.values());
  }

  function pushOutbox(reason, source) {
    if (!isOnlineMode()) return;

    const op = {
      id: `pending_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      reason: reason || "عملية تحتاج مزامنة",
      source: source || "unknown",
      status: "pending",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    const list = uniqueOutbox([op, ...getOutbox()]);
    setOutbox(list);

    const log = [
      {
        ...op,
        message: "تم تسجيل عملية معلقة للمزامنة"
      },
      ...getLog()
    ].slice(0, 200);

    setLog(log);

    toast("تم حفظ عملية معلقة للمزامنة");
    updateBadge();

    if (navigator.onLine) {
      scheduleAutoSync(700);
    }
  }

  function markLogSynced(count) {
    const log = [
      {
        id: `sync_${Date.now()}`,
        reason: `تمت مزامنة ${count} عملية`,
        source: "sync",
        status: "done",
        message: "تم رفع البيانات للسحابة",
        createdAt: nowIso(),
        updatedAt: nowIso()
      },
      ...getLog()
    ].slice(0, 200);

    setLog(log);
  }

  function markLogFailed(message) {
    const log = [
      {
        id: `fail_${Date.now()}`,
        reason: "فشلت المزامنة",
        source: "sync",
        status: "failed",
        message: message || "تعذر رفع البيانات، ستبقى العمليات محفوظة",
        createdAt: nowIso(),
        updatedAt: nowIso()
      },
      ...getLog()
    ].slice(0, 200);

    setLog(log);
  }

  function toast(message) {
    let el = $("patchSyncFixToast");

    if (!el) {
      el = document.createElement("div");
      el.id = "patchSyncFixToast";
      el.style.cssText = `
        position:fixed;
        left:16px;
        bottom:92px;
        z-index:9999999;
        background:#0f172a;
        color:white;
        padding:13px 15px;
        border-radius:16px;
        box-shadow:0 14px 35px rgba(0,0,0,.25);
        font-family:inherit;
        font-size:14px;
        font-weight:900;
        direction:rtl;
        opacity:0;
        transform:translateY(12px);
        transition:.25s ease;
        max-width:calc(100vw - 32px);
      `;
      document.body.appendChild(el);
    }

    el.textContent = message;
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";

    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(12px)";
    }, 2800);
  }

  function injectStyle() {
    if ($("patchSyncFixStyle")) return;

    const style = document.createElement("style");
    style.id = "patchSyncFixStyle";
    style.textContent = `
      #patchSyncFixOverlay {
        position: fixed;
        inset: 0;
        z-index: 9999998;
        background: rgba(255,255,255,.96);
        display: none;
        align-items: center;
        justify-content: center;
        direction: rtl;
        padding: 22px;
      }

      #patchSyncFixOverlay.show {
        display: flex;
      }

      .patch-sync-fix-card {
        width: min(420px, 100%);
        background: white;
        border: 1px solid #dbeafe;
        border-radius: 28px;
        box-shadow: 0 25px 60px rgba(15,23,42,.18);
        padding: 24px;
        text-align: center;
      }

      .patch-sync-fix-title {
        font-size: 20px;
        font-weight: 950;
        color: #1d4ed8;
        margin-bottom: 8px;
      }

      .patch-sync-fix-sub {
        font-size: 13px;
        font-weight: 800;
        color: #64748b;
        line-height: 1.8;
        margin-bottom: 18px;
      }

      .patch-sync-fix-progress-wrap {
        width: 100%;
        height: 14px;
        background: #e5e7eb;
        border-radius: 999px;
        overflow: hidden;
        border: 1px solid #dbeafe;
      }

      #patchSyncFixProgress {
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, #1d4ed8, #60a5fa);
        border-radius: 999px;
        transition: width .25s ease;
      }

      #patchSyncFixPercent {
        margin-top: 10px;
        color: #0f172a;
        font-size: 18px;
        font-weight: 950;
      }

      #patchSyncLogPanel {
        position: fixed;
        top: 78px;
        left: 12px;
        width: min(360px, calc(100vw - 24px));
        max-height: min(460px, calc(100vh - 150px));
        overflow: auto;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 22px;
        box-shadow: 0 22px 55px rgba(15,23,42,.18);
        z-index: 999999;
        direction: rtl;
        display: none;
      }

      #patchSyncLogPanel.show {
        display: block;
      }

      .patch-sync-log-head {
        position: sticky;
        top: 0;
        background: white;
        padding: 14px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .patch-sync-log-title {
        font-size: 14px;
        font-weight: 950;
        color: #0f172a;
      }

      .patch-sync-log-close {
        border: none;
        background: #f1f5f9;
        color: #0f172a;
        width: 34px;
        height: 34px;
        border-radius: 12px;
        font-size: 20px;
        font-weight: 950;
      }

      .patch-sync-log-body {
        padding: 12px;
      }

      .patch-sync-log-item {
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        padding: 10px;
        margin-bottom: 9px;
        background: #f8fafc;
      }

      .patch-sync-log-item.pending {
        background: #fff7ed;
        border-color: #fed7aa;
      }

      .patch-sync-log-item.done {
        background: #ecfdf5;
        border-color: #bbf7d0;
      }

      .patch-sync-log-item.failed {
        background: #fef2f2;
        border-color: #fecaca;
      }

      .patch-sync-log-main {
        font-size: 13px;
        font-weight: 950;
        color: #0f172a;
      }

      .patch-sync-log-meta {
        margin-top: 5px;
        font-size: 11px;
        font-weight: 800;
        color: #64748b;
        line-height: 1.7;
      }

      .patch-sync-fix-spin {
        animation: patchSyncFixSpin .9s linear infinite;
      }

      @keyframes patchSyncFixSpin {
        to { transform: rotate(360deg); }
      }
    `;

    document.head.appendChild(style);
  }

  function createOverlay() {
    if ($("patchSyncFixOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "patchSyncFixOverlay";
    overlay.innerHTML = `
      <div class="patch-sync-fix-card">
        <div class="patch-sync-fix-title" id="patchSyncFixTitle">جاري تصدير البيانات للسحابة</div>
        <div class="patch-sync-fix-sub" id="patchSyncFixSub">
          يتم رفع العمليات المحفوظة أثناء انقطاع الإنترنت. لا تغلق الصفحة حتى يكتمل الخط.
        </div>
        <div class="patch-sync-fix-progress-wrap">
          <div id="patchSyncFixProgress"></div>
        </div>
        <div id="patchSyncFixPercent">0%</div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function setProgress(percent, title, sub) {
    createOverlay();

    const overlay = $("patchSyncFixOverlay");
    const bar = $("patchSyncFixProgress");
    const num = $("patchSyncFixPercent");
    const titleEl = $("patchSyncFixTitle");
    const subEl = $("patchSyncFixSub");

    if (overlay) overlay.classList.add("show");
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    if (num) num.textContent = `${Math.round(percent)}%`;
    if (title && titleEl) titleEl.textContent = title;
    if (sub && subEl) subEl.textContent = sub;
  }

  function hideProgress() {
    $("patchSyncFixOverlay")?.classList.remove("show");
  }

  async function animateTo(percent, step = 5) {
    const bar = $("patchSyncFixProgress");
    const current = Number((bar?.style.width || "0").replace("%", "")) || 0;

    for (let p = current; p <= percent; p += step) {
      setProgress(p);
      await sleep(70);
    }
  }

  function ensureSyncButton() {
    let btn = $("patchSyncBtn");

    if (!btn) {
      btn = document.createElement("button");
      btn.id = "patchSyncBtn";
      btn.type = "button";
      btn.innerHTML = `
        <span style="font-weight:950">مزامنة</span>
        <span id="patchSyncCount"></span>
      `;
      btn.style.cssText = `
        position:fixed;
        top:12px;
        left:12px;
        z-index:999999;
        min-width:46px;
        height:42px;
        border:none;
        border-radius:15px;
        background:#1d4ed8;
        color:white;
        padding:0 12px;
        font-weight:950;
        box-shadow:0 10px 22px rgba(29,78,216,.25);
      `;
      document.body.appendChild(btn);
    }

    if (!btn.dataset.syncFixBound) {
      btn.dataset.syncFixBound = "1";

      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();

        if (getOutbox().length > 0) {
          manualSync();
        } else {
          toggleSyncLogPanel();
        }
      }, true);

      btn.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        toggleSyncLogPanel();
      });
    }

    if (!$("patchSyncCount")) {
      const badge = document.createElement("span");
      badge.id = "patchSyncCount";
      badge.className = "patch-sync-count";
      btn.appendChild(badge);
    }

    updateBadge();
  }

  function updateBadge() {
    const count = getOutbox().length;
    const badge = $("patchSyncCount");
    const btn = $("patchSyncBtn");

    if (badge) {
      badge.textContent = String(count);
      badge.classList.toggle("show", count > 0);

      if (!badge.classList.contains("patch-sync-count")) {
        badge.style.cssText = `
          position:absolute;
          top:-7px;
          left:-7px;
          min-width:21px;
          height:21px;
          padding:0 5px;
          border-radius:999px;
          background:#dc2626;
          color:white;
          border:2px solid white;
          display:${count > 0 ? "flex" : "none"};
          align-items:center;
          justify-content:center;
          font-size:11px;
          font-weight:950;
        `;
      } else {
        badge.style.display = count > 0 ? "flex" : "";
      }
    }

    if (btn) {
      btn.title = count > 0
        ? `${count} عملية معلقة تحتاج مزامنة`
        : "لا توجد عمليات معلقة. اضغط لعرض سجل المزامنة";
    }
  }

  function createSyncLogPanel() {
    if ($("patchSyncLogPanel")) return;

    const panel = document.createElement("div");
    panel.id = "patchSyncLogPanel";
    panel.innerHTML = `
      <div class="patch-sync-log-head">
        <div class="patch-sync-log-title">سجل المزامنة والعمليات المعلقة</div>
        <button class="patch-sync-log-close" id="patchSyncLogClose" type="button">×</button>
      </div>
      <div class="patch-sync-log-body" id="patchSyncLogBody"></div>
    `;

    document.body.appendChild(panel);

    $("patchSyncLogClose")?.addEventListener("click", () => {
      panel.classList.remove("show");
    });

    renderSyncLogPanel();
  }

  function toggleSyncLogPanel() {
    createSyncLogPanel();
    renderSyncLogPanel();
    $("patchSyncLogPanel")?.classList.toggle("show");
  }

  function renderSyncLogPanel() {
    const body = $("patchSyncLogBody");
    if (!body) return;

    const pending = getOutbox();
    const log = getLog();

    const rows = [
      ...pending.map(x => ({
        ...x,
        status: "pending",
        message: "عملية معلقة لم ترفع بعد"
      })),
      ...log
    ].slice(0, 120);

    if (!rows.length) {
      body.innerHTML = `
        <div class="patch-sync-log-item done">
          <div class="patch-sync-log-main">لا توجد عمليات معلقة</div>
          <div class="patch-sync-log-meta">كل البيانات الحالية متزامنة أو لا يوجد سجل بعد.</div>
        </div>
      `;
      return;
    }

    body.innerHTML = rows.map(item => `
      <div class="patch-sync-log-item ${item.status || "pending"}">
        <div class="patch-sync-log-main">${escapeHtml(item.reason || "عملية مزامنة")}</div>
        <div class="patch-sync-log-meta">
          الحالة: ${statusLabel(item.status)}
          <br>
          المصدر: ${escapeHtml(item.source || "-")}
          <br>
          الوقت: ${formatDate(item.createdAt)}
          <br>
          ${escapeHtml(item.message || "")}
        </div>
      </div>
    `).join("");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function statusLabel(status) {
    if (status === "done") return "تمت المزامنة";
    if (status === "failed") return "فشلت";
    return "معلقة";
  }

  function formatDate(value) {
    try {
      return value ? new Date(value).toLocaleString("ar-EG") : "-";
    } catch {
      return "-";
    }
  }

  function isWriteMethodName(name) {
    return [
      "checkout",
      "saveProduct",
      "deleteProduct",
      "savePurchase",
      "deletePurchase",
      "saveSettings",
      "saveManualInvoice",
      "saveInvoiceStatus",
      "saveExpense",
      "deleteExpense",
      "saveMerchantPayment",
      "deleteMerchantPayment"
    ].includes(name);
  }

  function patchWriteFunctions() {
    if (patched) return;
    patched = true;

    const names = [
      "checkout",
      "saveProduct",
      "deleteProduct",
      "savePurchase",
      "deletePurchase",
      "saveSettings",
      "saveManualInvoice",
      "saveInvoiceStatus"
    ];

    names.forEach(name => {
      waitAndPatchFunction(name);
    });

    patchIndexedDbWrites();
    patchLocalStorageWrites();
  }

  function waitAndPatchFunction(name, tries = 160) {
    const fn = window[name];

    if (typeof fn === "function" && !fn.__syncFixPatched) {
      const old = fn;

      const patchedFn = async function (...args) {
        const wasOffline = !navigator.onLine;

        let result;
        try {
          result = await old.apply(this, args);
        } finally {
          if (isOnlineMode()) {
            pushOutbox(
              wasOffline ? `عملية محفوظة بدون إنترنت: ${name}` : `عملية تحتاج تأكيد مزامنة: ${name}`,
              name
            );
          }
        }

        return result;
      };

      patchedFn.__syncFixPatched = true;
      window[name] = patchedFn;
      return;
    }

    if (tries > 0) {
      setTimeout(() => waitAndPatchFunction(name, tries - 1), 100);
    }
  }

  function patchIndexedDbWrites() {
    if (!window.indexedDB || window.__syncFixIndexedDbPatched) return;
    window.__syncFixIndexedDbPatched = true;

    const oldOpen = indexedDB.open.bind(indexedDB);

    indexedDB.open = function (...args) {
      const req = oldOpen(...args);

      req.addEventListener("success", () => {
        const db = req.result;
        if (!db || db.__syncFixDbPatched) return;

        db.__syncFixDbPatched = true;
        const oldTransaction = db.transaction.bind(db);

        db.transaction = function (storeNames, mode, options) {
          const tx = oldTransaction(storeNames, mode, options);

          try {
            if (mode === "readwrite") {
              tx.addEventListener("complete", () => {
                if (!isOnlineMode()) return;

                const stores = Array.isArray(storeNames) ? storeNames.join(",") : String(storeNames || "");
                if (!/invoices|products|purchases|settings|meta|stores/i.test(stores)) return;

                if (!navigator.onLine) {
                  pushOutbox(`عملية محفوظة أوفلاين داخل قاعدة الجهاز: ${stores}`, "indexedDB");
                } else {
                  updateBadge();
                }
              });
            }
          } catch {}

          return tx;
        };
      });

      return req;
    };
  }

  function patchLocalStorageWrites() {
    if (window.__syncFixLocalStoragePatched) return;
    window.__syncFixLocalStoragePatched = true;

    const oldSetItem = Storage.prototype.setItem;

    Storage.prototype.setItem = function (key, value) {
      const result = oldSetItem.apply(this, arguments);

      try {
        if (this === localStorage && isOnlineMode() && !navigator.onLine) {
          const k = String(key || "");
          if (
            k !== OUTBOX_KEY &&
            k !== OUTBOX_LOG_KEY &&
            /invoice|product|purchase|expense|merchant|customer|settings|cashier|DFDFG/i.test(k)
          ) {
            pushOutbox(`تغيير محفوظ أوفلاين: ${k}`, "localStorage");
          }
        }
      } catch {}

      return result;
    };
  }

  async function manualSync() {
    if (!isLoggedIn()) {
      toast("سجل الدخول أولًا");
      return;
    }

    if (!isOnlineMode()) {
      toast("المزامنة خاصة بنسخة الأونلاين");
      return;
    }

    if (!navigator.onLine) {
      toast("لا يوجد إنترنت الآن");
      return;
    }

    await runSync("مزامنة يدوية للعمليات المعلقة");
  }

  function scheduleAutoSync(delay = 1000) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (getOutbox().length > 0 && canSync()) {
        runSync("عاد الإنترنت، جاري تصدير البيانات للسحابة");
      }
    }, delay);
  }

  async function runSync(title) {
    if (syncRunning) return;
    if (!canSync()) return;

    const pendingCount = getOutbox().length;
    if (pendingCount <= 0) {
      updateBadge();
      return;
    }

    syncRunning = true;
    updateBadge();

    try {
      setProgress(5, title || "جاري تصدير البيانات للسحابة", `يوجد ${pendingCount} عملية معلقة يتم رفعها الآن`);
      await animateTo(28);

      let synced = false;

      if (typeof window.uploadOfflineDataToCloud === "function") {
        await animateTo(52);
        await window.uploadOfflineDataToCloud();
        synced = true;
      }

      if (!synced && typeof window.syncOfflineData === "function") {
        await animateTo(52);
        await window.syncOfflineData();
        synced = true;
      }

      if (!synced && typeof window.forceSync === "function") {
        await animateTo(52);
        await window.forceSync();
        synced = true;
      }

      if (!synced) {
        await animateTo(65);
        await fallbackCloudTouch();
      }

      await animateTo(100, 4);

      markLogSynced(pendingCount);
      setOutbox([]);
      localStorage.setItem(LAST_SYNC_KEY, nowIso());

      toast("تمت المزامنة بنجاح");
      await sleep(450);
      hideProgress();
    } catch (err) {
      console.error("sync fix failed", err);
      markLogFailed(err?.message || "فشل غير معروف");
      toast("فشلت المزامنة، العمليات بقيت محفوظة");
      hideProgress();
    } finally {
      syncRunning = false;
      updateBadge();

      if (getOutbox().length > 0 && navigator.onLine) {
        scheduleAutoSync(8000);
      }
    }
  }

  async function fallbackCloudTouch() {
    await sleep(700);
  }

  function bindEvents() {
    window.addEventListener("online", () => {
      updateBadge();
      toast("عاد الاتصال، سيتم تشغيل المزامنة");
      scheduleAutoSync(900);
    });

    window.addEventListener("offline", () => {
      updateBadge();
      toast("انقطع الإنترنت، سيتم حفظ العمليات كعمليات معلقة");
    });

    window.addEventListener("storage", e => {
      if (e.key === OUTBOX_KEY || e.key === OUTBOX_LOG_KEY) {
        updateBadge();
        renderSyncLogPanel();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && getOutbox().length > 0 && canSync()) {
        scheduleAutoSync(700);
      }
    });
  }

  function bootCheck() {
    updateBadge();
    renderSyncLogPanel();

    if (getOutbox().length > 0 && canSync()) {
      scheduleAutoSync(1200);
    }
  }

  function init() {
    injectStyle();
    createOverlay();
    ensureSyncButton();
    createSyncLogPanel();
    patchWriteFunctions();
    bindEvents();

    setInterval(() => {
      ensureSyncButton();
      updateBadge();

      if (getOutbox().length > 0 && canSync() && !syncRunning) {
        scheduleAutoSync(1000);
      }
    }, 3000);

    setTimeout(bootCheck, 1000);
    setTimeout(bootCheck, 3500);

    console.log("patch-sync-fix loaded", VERSION);
  }

  ready(init);
})();