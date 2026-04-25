/* patch-sync-rescue.js v1.0.0
   ملحق إنقاذ المزامنة
   يحفظ البيانات أوفلاين حتى بعد تحديث الصفحة
   يضيف عداد عمليات معلقة على أيقونة المزامنة الموجودة
   عند عودة الإنترنت يرفع البيانات إلى Firebase
   لا يتدخل بتسجيل الدخول
*/

(function () {
  "use strict";

  const RESCUE_VERSION = "1.0.0";

  const PREFIX = "DFDFG";

  const LEGACY_OUTBOX_KEYS = [
    `${PREFIX}_patch_sync_outbox_v5`,
    `${PREFIX}_patch_sync_outbox_v4`
  ];

  const RESCUE_OUTBOX_KEY = `${PREFIX}_sync_rescue_outbox_v1`;
  const RESCUE_STATE_KEY = `${PREFIX}_sync_rescue_state_v1`;
  const RESCUE_LAST_OK_KEY = `${PREFIX}_sync_rescue_last_ok_v1`;

  let rescueSyncRunning = false;
  let patched = false;
  let saveTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function safeParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function readArray(key) {
    const value = safeParse(localStorage.getItem(key), []);
    return Array.isArray(value) ? value : [];
  }

  function writeArray(key, value) {
    localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
  }

  function toast(message) {
    if (typeof window.showToast === "function") {
      window.showToast(message, "warning");
      return;
    }

    let el = $("rescueSyncToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "rescueSyncToast";
      el.style.cssText = `
        position:fixed;
        left:16px;
        bottom:96px;
        z-index:9999999;
        background:#0f172a;
        color:#fff;
        padding:13px 15px;
        border-radius:16px;
        box-shadow:0 14px 34px rgba(0,0,0,.24);
        max-width:calc(100vw - 32px);
        font-size:14px;
        font-weight:800;
        direction:rtl;
        font-family:Arial,sans-serif;
      `;
      document.body.appendChild(el);
    }

    el.textContent = message;
    el.style.display = "block";
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.style.display = "none";
    }, 3000);
  }

  function getCurrentLicense() {
    const keys = [
      "fee_rebuild_v3_license",
      "fee_cached_license_state_v1",
      `${PREFIX}_USER_SESSION`
    ];

    for (const key of keys) {
      const val = safeParse(localStorage.getItem(key), null);
      if (val?.key || val?.licenseKey) return val;
    }

    return null;
  }

  function getLicenseKey() {
    const license = getCurrentLicense();
    return license?.key || license?.licenseKey || "default";
  }

  function isOnlineCloudMode() {
    const license = getCurrentLicense();

    if (!license) return false;
    if (license.syncMode === "offline_local_only") return false;
    if (license.appMode === "offline") return false;

    return true;
  }

  function getAppStateKey() {
    const key = getLicenseKey();
    return `fee_rebuild_v3_app_state__${key}`;
  }

  function getQueueKey() {
    const key = getLicenseKey();
    return `fee_rebuild_v3_sync_queue__${key}`;
  }

  function getCloudRootPath() {
    const key = getLicenseKey();
    return `fee_cloud_data/${key}`;
  }

  function collectLocalState() {
    let data = null;

    if (window.state?.data) {
      try {
        data = JSON.parse(JSON.stringify(window.state.data));
      } catch {
        data = window.state.data;
      }
    }

    if (!data) {
      data = safeParse(localStorage.getItem(getAppStateKey()), null);
    }

    const queue = window.state?.queue || safeParse(localStorage.getItem(getQueueKey()), []);

    return {
      licenseKey: getLicenseKey(),
      savedAt: Date.now(),
      iso: new Date().toISOString(),
      data,
      queue: Array.isArray(queue) ? queue : [],
      url: location.href
    };
  }

  function saveRescueState(reason) {
    if (!isOnlineCloudMode()) return;

    const snapshot = collectLocalState();
    if (!snapshot.data) return;

    snapshot.reason = reason || "حفظ نسخة طوارئ";

    localStorage.setItem(RESCUE_STATE_KEY, JSON.stringify(snapshot));

    const outbox = readArray(RESCUE_OUTBOX_KEY);
    outbox.push({
      id: `rescue_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      reason: reason || "عملية تحتاج مزامنة",
      createdAt: new Date().toISOString(),
      licenseKey: getLicenseKey()
    });

    writeArray(RESCUE_OUTBOX_KEY, compactOutbox(outbox));
    mirrorLegacyOutbox();
    updateBadges();
  }

  function compactOutbox(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr.slice(-200);
  }

  function getAllPendingCount() {
    const rescueCount = readArray(RESCUE_OUTBOX_KEY).length;
    const legacyCount = LEGACY_OUTBOX_KEYS.reduce((sum, key) => sum + readArray(key).length, 0);
    const appQueue = safeParse(localStorage.getItem(getQueueKey()), []);
    const appQueueCount = Array.isArray(appQueue) ? appQueue.length : 0;

    return Math.max(rescueCount, legacyCount, appQueueCount);
  }

  function mirrorLegacyOutbox() {
    const rescue = readArray(RESCUE_OUTBOX_KEY);

    LEGACY_OUTBOX_KEYS.forEach(key => {
      const current = readArray(key);
      if (rescue.length > current.length) {
        writeArray(key, rescue.map(x => ({
          id: x.id,
          reason: x.reason,
          createdAt: x.createdAt
        })));
      }
    });
  }

  function clearAllOutboxes() {
    writeArray(RESCUE_OUTBOX_KEY, []);
    LEGACY_OUTBOX_KEYS.forEach(key => writeArray(key, []));
    localStorage.setItem(getQueueKey(), JSON.stringify([]));

    if (window.state && Array.isArray(window.state.queue)) {
      window.state.queue = [];
    }

    localStorage.setItem(RESCUE_LAST_OK_KEY, new Date().toISOString());
    updateBadges();
  }

  function updateBadges() {
    const count = getAllPendingCount();

    const badgeIds = [
      "patchSyncCount",
      "pending-sync-badge"
    ];

    badgeIds.forEach(id => {
      const badge = $(id);
      if (!badge) return;

      badge.textContent = String(count);
      badge.classList.toggle("show", count > 0);
      badge.classList.toggle("hidden-force", count === 0);
    });

    const btn = $("patchSyncBtn") || document.querySelector("[onclick='openSyncCenter()']");
    if (btn) {
      btn.title = count > 0 ? `يوجد ${count} عملية تحتاج مزامنة` : "كل البيانات متزامنة";
    }
  }

  function patchSaveAppState() {
    if (patched) return;
    patched = true;

    const mutationNames = [
      "saveAppState",
      "enqueueSyncOperation",
      "saveInvoiceDraft",
      "addCustomer",
      "saveEditedCustomer",
      "deleteCustomer",
      "savePayment",
      "saveManualDebt",
      "savePurchase",
      "saveEditedPurchase",
      "deletePurchase",
      "saveShortage",
      "markShortageDone",
      "deleteShortage",
      "saveSettings",
      "saveInvoiceStatusChange",
      "checkout",
      "saveProduct",
      "deleteProduct",
      "saveManualInvoice",
      "saveInvoiceStatus"
    ];

    mutationNames.forEach(name => {
      const oldFn = window[name];
      if (typeof oldFn !== "function") return;
      if (oldFn.__rescuePatched) return;

      const wrapped = async function rescueWrappedFunction(...args) {
        const beforeOffline = !navigator.onLine;
        let result;

        try {
          result = await oldFn.apply(this, args);
        } finally {
          scheduleRescueSave(beforeOffline ? `حفظ أوفلاين من ${name}` : `تغيير من ${name}`);
        }

        return result;
      };

      wrapped.__rescuePatched = true;
      window[name] = wrapped;
    });
  }

  function scheduleRescueSave(reason) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveRescueState(reason);

      if (!navigator.onLine) {
        toast("تم تثبيت البيانات أوفلاين وستتم مزامنتها عند رجوع الإنترنت");
      } else {
        rescueAutoSync("جاري مزامنة التغييرات...");
      }
    }, 250);
  }

  async function ensureFirebaseReady() {
    if (window.firebaseDbRef && window.feeFirebase) {
      return window.firebaseDbRef;
    }

    if (typeof window.ensureFirebaseReady === "function") {
      await window.ensureFirebaseReady();
      if (window.firebaseDbRef) return window.firebaseDbRef;
    }

    if (!window.feeFirebase) {
      throw new Error("Firebase module not found");
    }

    if (!window.__rescueFirebaseApp) {
      const config = window.firebaseConfig || {
        apiKey: "AIzaSyCnLAY7zQyBy7gUuL9wszt9aEhiJgvRmxI",
        authDomain: "shop-d52dc.firebaseapp.com",
        databaseURL: "https://shop-d52dc-default-rtdb.firebaseio.com",
        projectId: "shop-d52dc",
        storageBucket: "shop-d52dc.appspot.com",
        messagingSenderId: "97580537866",
        appId: "1:97580537866:web:abc46e5a2f527b6300a7f3",
        measurementId: "G-956RQMBP42"
      };

      try {
        window.__rescueFirebaseApp = window.feeFirebase.initializeApp(config, "rescue-sync-app");
      } catch {
        window.__rescueFirebaseApp = window.feeFirebase.initializeApp(config);
      }
    }

    window.__rescueFirebaseDb = window.feeFirebase.getDatabase(window.__rescueFirebaseApp);
    return window.__rescueFirebaseDb;
  }

  async function uploadSnapshotToFirebase(snapshot) {
    if (!snapshot?.data) throw new Error("No rescue data");

    const db = await ensureFirebaseReady();
    const fb = window.feeFirebase;
    const rootPath = getCloudRootPath();

    const payload = {
      ...snapshot.data,
      updatedAt: Date.now(),
      rescueUpdatedAt: Date.now(),
      rescueInstallation: localStorage.getItem("fee_rebuild_v3_installation") || "",
      rescueVersion: RESCUE_VERSION
    };

    await fb.set(fb.ref(db, `${rootPath}/appState`), payload);

    await fb.update(fb.ref(db, `${rootPath}/meta`), {
      updatedAt: Date.now(),
      rescueUpdatedAt: Date.now(),
      rescueVersion: RESCUE_VERSION,
      lastRescueSyncAt: new Date().toISOString()
    });

    return true;
  }

  async function runNativeSyncIfAvailable() {
    if (typeof window.syncQueueToCloud === "function") {
      const ok = await window.syncQueueToCloud();
      if (ok === false) throw new Error("syncQueueToCloud failed");
      return true;
    }

    if (typeof window.pushFullStateToCloud === "function") {
      const ok = await window.pushFullStateToCloud();
      if (ok === false) throw new Error("pushFullStateToCloud failed");
      return true;
    }

    if (typeof window.uploadOfflineDataToCloud === "function") {
      const ok = await window.uploadOfflineDataToCloud();
      if (ok === false) throw new Error("uploadOfflineDataToCloud failed");
      return true;
    }

    return false;
  }

  function showProgress(label, percent) {
    const topBar = $("top-sync-progress");
    const fill = $("sync-progress-fill");
    const text = $("sync-percent");
    const labelEl = $("top-sync-label");

    if (topBar && fill && text) {
      topBar.classList.add("show");
      fill.style.width = `${percent}%`;
      text.textContent = `${percent}%`;
      if (labelEl) labelEl.textContent = label;
      return;
    }

    const patchOverlay = $("patchSyncOverlay");
    const patchLine = $("patchSyncLine");
    const title = $("patchSyncTitle");
    const sub = $("patchSyncSub");

    if (patchOverlay) patchOverlay.classList.add("show");
    if (patchLine) {
      patchLine.style.setProperty("--p", percent);
      patchLine.setAttribute("data-progress", `${percent}%`);
    }
    if (title) title.textContent = label;
    if (sub) sub.textContent = "يتم رفع البيانات المحفوظة أوفلاين";
  }

  function hideProgress() {
    const topBar = $("top-sync-progress");
    if (topBar) topBar.classList.remove("show");

    const patchOverlay = $("patchSyncOverlay");
    if (patchOverlay) patchOverlay.classList.remove("show");
  }

  async function rescueAutoSync(label = "جاري مزامنة البيانات المحفوظة...") {
    if (rescueSyncRunning) return false;
    if (!navigator.onLine) return false;
    if (!isOnlineCloudMode()) return false;

    const count = getAllPendingCount();
    if (count <= 0) return true;

    rescueSyncRunning = true;

    try {
      showProgress(label, 10);

      const snapshot = safeParse(localStorage.getItem(RESCUE_STATE_KEY), null) || collectLocalState();

      showProgress("تجهيز البيانات المحفوظة", 25);

      try {
        await runNativeSyncIfAvailable();
      } catch (e) {
        console.warn("native sync failed, rescue upload will continue", e);
      }

      showProgress("رفع نسخة مؤكدة إلى Firebase", 55);

      await uploadSnapshotToFirebase(snapshot);

      showProgress("تأكيد اكتمال المزامنة", 90);

      clearAllOutboxes();

      showProgress("اكتملت المزامنة", 100);

      setTimeout(hideProgress, 700);
      toast("تمت مزامنة البيانات المحفوظة أوفلاين بنجاح");
      return true;
    } catch (error) {
      console.error("RESCUE SYNC FAILED:", error);
      hideProgress();
      updateBadges();
      toast("فشلت المزامنة، البيانات ما زالت محفوظة على الجهاز");
      return false;
    } finally {
      rescueSyncRunning = false;
      updateBadges();
    }
  }

  function hookSyncButtons() {
    document.addEventListener("click", function (event) {
      const btn = event.target.closest("#patchSyncBtn, [onclick='openSyncCenter()']");
      if (!btn) return;

      const count = getAllPendingCount();
      if (count <= 0) return;

      event.preventDefault();
      event.stopPropagation();

      rescueAutoSync("جاري رفع العمليات المعلقة...");
    }, true);
  }

  function restoreLocalStateAfterRefresh() {
    const snapshot = safeParse(localStorage.getItem(RESCUE_STATE_KEY), null);
    if (!snapshot?.data) return;

    const pending = getAllPendingCount();
    if (pending <= 0) return;

    try {
      localStorage.setItem(getAppStateKey(), JSON.stringify(snapshot.data));

      if (window.state?.data) {
        window.state.data = snapshot.data;
      }

      if (Array.isArray(snapshot.queue)) {
        localStorage.setItem(getQueueKey(), JSON.stringify(snapshot.queue));
        if (window.state) window.state.queue = snapshot.queue;
      }

      if (typeof window.render === "function") {
        setTimeout(() => window.render(), 500);
      }

      updateBadges();
    } catch (error) {
      console.error("restore rescue state failed", error);
    }
  }

  function watchLocalStorageAppState() {
    let lastRaw = localStorage.getItem(getAppStateKey()) || "";

    setInterval(() => {
      const raw = localStorage.getItem(getAppStateKey()) || "";
      if (raw && raw !== lastRaw) {
        lastRaw = raw;

        if (!navigator.onLine) {
          saveRescueState("تغيير محفوظ أوفلاين من localStorage");
        }
      }

      updateBadges();
    }, 900);
  }

  function boot() {
    patchSaveAppState();
    restoreLocalStateAfterRefresh();
    updateBadges();
    watchLocalStorageAppState();
    hookSyncButtons();

    window.addEventListener("online", () => {
      updateBadges();
      setTimeout(() => {
        rescueAutoSync("عاد الإنترنت، جاري رفع البيانات المحفوظة...");
      }, 1200);
    });

    window.addEventListener("offline", () => {
      saveRescueState("انقطع الإنترنت - تثبيت نسخة محلية");
      updateBadges();
      toast("انقطع الإنترنت، سيتم تثبيت أي بيانات جديدة على الجهاز");
    });

    setInterval(() => {
      patchSaveAppState();
      updateBadges();

      if (navigator.onLine && getAllPendingCount() > 0) {
        rescueAutoSync("جاري محاولة مزامنة تلقائية...");
      }
    }, 7000);

    console.log("patch-sync-rescue loaded", RESCUE_VERSION);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();