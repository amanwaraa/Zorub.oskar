/* patch-sync-rescue.js v1.1.0
   يحل مشكلة فشل المزامنة عند انقطاع الإنترنت
   أي حفظ أوفلاين يتم تثبيته محلياً + يظهر كعملية معلقة
   عند رجوع النت يرفع نسخة مؤكدة إلى Firebase
   لا يمسح العداد إلا بعد نجاح الرفع فعلياً
*/

(function () {
  "use strict";

  const RESCUE_VERSION = "1.1.0";
  const PREFIX = "DFDFG";

  const LEGACY_OUTBOX_KEYS = [
    `${PREFIX}_patch_sync_outbox_v5`,
    `${PREFIX}_patch_sync_outbox_v4`
  ];

  const RESCUE_OUTBOX_KEY = `${PREFIX}_sync_rescue_outbox_v1`;
  const RESCUE_STATE_KEY = `${PREFIX}_sync_rescue_state_v1`;
  const RESCUE_LAST_OK_KEY = `${PREFIX}_sync_rescue_last_ok_v1`;
  const RESCUE_SUPPRESS_KEY = `${PREFIX}_sync_rescue_suppress_fail_v1`;

  let rescueSyncRunning = false;
  let patchTimer = null;
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
    const v = safeParse(localStorage.getItem(key), []);
    return Array.isArray(v) ? v : [];
  }

  function writeArray(key, arr) {
    localStorage.setItem(key, JSON.stringify(Array.isArray(arr) ? arr : []));
  }

  function isOffline() {
    return !navigator.onLine;
  }

  function toast(message, type = "warning") {
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
      return;
    }

    let el = $("rescueSyncToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "rescueSyncToast";
      el.style.cssText = `
        position:fixed;left:16px;bottom:96px;z-index:9999999;
        background:#0f172a;color:#fff;padding:13px 15px;border-radius:16px;
        box-shadow:0 14px 34px rgba(0,0,0,.24);max-width:calc(100vw - 32px);
        font-size:14px;font-weight:800;direction:rtl;font-family:Arial,sans-serif;
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
    const possibleKeys = [
      "fee_rebuild_v3_license",
      "fee_cached_license_state_v1",
      `${PREFIX}_USER_SESSION`
    ];

    for (const key of possibleKeys) {
      const obj = safeParse(localStorage.getItem(key), null);
      if (obj?.key || obj?.licenseKey) return obj;
    }

    return null;
  }

  function getLicenseKey() {
    const license = getCurrentLicense();
    return license?.key || license?.licenseKey || "default";
  }

  function isCloudMode() {
    const license = getCurrentLicense();
    if (!license) return true;
    if (license.syncMode === "offline_local_only") return false;
    if (license.appMode === "offline") return false;
    return true;
  }

  function getAppStateKey() {
    return `fee_rebuild_v3_app_state__${getLicenseKey()}`;
  }

  function getQueueKey() {
    return `fee_rebuild_v3_sync_queue__${getLicenseKey()}`;
  }

  function getCloudRootPath() {
    return `fee_cloud_data/${getLicenseKey()}`;
  }

  function collectLocalState() {
    let data = null;

    try {
      if (window.state?.data) {
        data = JSON.parse(JSON.stringify(window.state.data));
      }
    } catch {}

    if (!data) {
      data = safeParse(localStorage.getItem(getAppStateKey()), null);
    }

    let queue = [];
    try {
      queue = window.state?.queue || safeParse(localStorage.getItem(getQueueKey()), []);
    } catch {}

    return {
      licenseKey: getLicenseKey(),
      savedAt: Date.now(),
      iso: new Date().toISOString(),
      data,
      queue: Array.isArray(queue) ? queue : [],
      url: location.href,
      version: RESCUE_VERSION
    };
  }

  function compact(list) {
    return (Array.isArray(list) ? list : []).slice(-300);
  }

  function addPending(reason) {
    if (!isCloudMode()) return;

    const snapshot = collectLocalState();
    if (snapshot.data) {
      snapshot.reason = reason || "عملية محفوظة أوفلاين";
      localStorage.setItem(RESCUE_STATE_KEY, JSON.stringify(snapshot));
      localStorage.setItem(getAppStateKey(), JSON.stringify(snapshot.data));
    }

    const outbox = readArray(RESCUE_OUTBOX_KEY);
    outbox.push({
      id: `rescue_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      reason: reason || "عملية تحتاج مزامنة",
      createdAt: new Date().toISOString(),
      licenseKey: getLicenseKey()
    });

    writeArray(RESCUE_OUTBOX_KEY, compact(outbox));
    mirrorLegacyOutbox();
    updateBadges();
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

    const queue = safeParse(localStorage.getItem(getQueueKey()), []);
    if (!Array.isArray(queue) || queue.length < rescue.length) {
      localStorage.setItem(getQueueKey(), JSON.stringify(rescue));
      if (window.state) window.state.queue = rescue;
    }
  }

  function pendingCount() {
    const rescue = readArray(RESCUE_OUTBOX_KEY).length;
    const legacy = LEGACY_OUTBOX_KEYS.reduce((s, k) => s + readArray(k).length, 0);
    const queue = safeParse(localStorage.getItem(getQueueKey()), []);
    return Math.max(rescue, legacy, Array.isArray(queue) ? queue.length : 0);
  }

  function updateBadges() {
    const count = pendingCount();

    ["patchSyncCount", "pending-sync-badge"].forEach(id => {
      const badge = $(id);
      if (!badge) return;
      badge.textContent = String(count);
      badge.classList.toggle("show", count > 0);
      badge.classList.toggle("hidden-force", count === 0);
    });

    const btn =
      $("patchSyncBtn") ||
      document.querySelector("[onclick='openSyncCenter()']") ||
      document.querySelector("[onclick=\"openSyncCenter()\"]");

    if (btn) {
      btn.title = count > 0 ? `يوجد ${count} عملية تحتاج مزامنة` : "كل البيانات متزامنة";
    }
  }

  function clearPendingAfterSuccess() {
    writeArray(RESCUE_OUTBOX_KEY, []);
    LEGACY_OUTBOX_KEYS.forEach(k => writeArray(k, []));
    localStorage.setItem(getQueueKey(), JSON.stringify([]));

    if (window.state && Array.isArray(window.state.queue)) {
      window.state.queue = [];
    }

    localStorage.setItem(RESCUE_LAST_OK_KEY, new Date().toISOString());
    updateBadges();
  }

  function scheduleLocalFix(reason) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      addPending(reason);

      if (isOffline()) {
        toast("تم الحفظ أوفلاين، وستتم المزامنة عند رجوع الإنترنت", "warning");
      } else if (pendingCount() > 0) {
        rescueSync("جاري رفع البيانات إلى Firebase...");
      }
    }, 200);
  }

  function patchFunction(name) {
    const oldFn = window[name];
    if (typeof oldFn !== "function") return;
    if (oldFn.__rescueV110) return;

    const wrapped = async function (...args) {
      const wasOffline = isOffline();
      localStorage.setItem(RESCUE_SUPPRESS_KEY, wasOffline ? "1" : "0");

      let result;

      try {
        result = await oldFn.apply(this, args);
      } catch (err) {
        if (wasOffline) {
          console.warn(`rescue ignored offline sync error from ${name}`, err);
          scheduleLocalFix(`حفظ أوفلاين من ${name}`);
          return null;
        }
        throw err;
      } finally {
        localStorage.removeItem(RESCUE_SUPPRESS_KEY);
        scheduleLocalFix(wasOffline ? `حفظ أوفلاين من ${name}` : `تغيير من ${name}`);
      }

      return result;
    };

    wrapped.__rescueV110 = true;
    window[name] = wrapped;
  }

  function patchAllMutationFunctions() {
    [
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
      "saveInvoiceStatus",
      "saveMerchantPayment",
      "deleteMerchantPayment",
      "saveExpense",
      "deleteExpense"
    ].forEach(patchFunction);
  }

  function patchNativeSyncFunctions() {
    ["syncQueueToCloud", "pushFullStateToCloud", "uploadOfflineDataToCloud", "manualSync"].forEach(name => {
      const oldFn = window[name];
      if (typeof oldFn !== "function") return;
      if (oldFn.__rescueSyncV110) return;

      const wrapped = async function (...args) {
        if (isOffline()) {
          addPending(`محاولة مزامنة بدون إنترنت من ${name}`);
          updateBadges();
          toast("لا يوجد إنترنت، تم إبقاء البيانات معلقة للمزامنة", "warning");
          return false;
        }

        try {
          return await oldFn.apply(this, args);
        } catch (err) {
          console.warn(`native sync failed in ${name}`, err);
          addPending(`فشل مزامنة من ${name}`);
          updateBadges();
          return false;
        }
      };

      wrapped.__rescueSyncV110 = true;
      window[name] = wrapped;
    });
  }

  function patchAlerts() {
    const oldAlert = window.alert;
    if (oldAlert.__rescueAlertV110) return;

    const wrapped = function (message) {
      const msg = String(message || "");
      const suppress = localStorage.getItem(RESCUE_SUPPRESS_KEY) === "1";

      if (
        suppress &&
        (
          msg.includes("فشل المزامنة") ||
          msg.includes("تعذرت المزامنة") ||
          msg.includes("فشل") ||
          msg.includes("المزامنة")
        )
      ) {
        addPending("تم منع رسالة فشل المزامنة أثناء الأوفلاين");
        toast("تم الحفظ أوفلاين بدل إظهار فشل المزامنة", "warning");
        return;
      }

      return oldAlert.apply(this, arguments);
    };

    wrapped.__rescueAlertV110 = true;
    window.alert = wrapped;
  }

  function patchConsoleErrorNoise() {
    const oldError = console.error;
    if (oldError.__rescueConsoleV110) return;

    const wrapped = function (...args) {
      const text = args.map(x => String(x?.message || x || "")).join(" ");
      if (isOffline() && /sync|firebase|network|offline|failed|مزامنة/i.test(text)) {
        addPending("خطأ شبكة أثناء الأوفلاين");
        updateBadges();
      }
      return oldError.apply(console, args);
    };

    wrapped.__rescueConsoleV110 = true;
    console.error = wrapped;
  }

  function restoreAfterRefresh() {
    const count = pendingCount();
    if (count <= 0) return;

    const snapshot = safeParse(localStorage.getItem(RESCUE_STATE_KEY), null);
    if (!snapshot?.data) return;

    try {
      localStorage.setItem(getAppStateKey(), JSON.stringify(snapshot.data));

      if (window.state) {
        window.state.data = snapshot.data;
        window.state.queue = snapshot.queue || readArray(RESCUE_OUTBOX_KEY);
      }

      localStorage.setItem(getQueueKey(), JSON.stringify(window.state?.queue || readArray(RESCUE_OUTBOX_KEY)));

      if (typeof window.render === "function") {
        setTimeout(() => window.render(), 400);
      }
    } catch (err) {
      console.error("restoreAfterRefresh failed", err);
    }

    updateBadges();
  }

  async function ensureFirebaseReady() {
    if (typeof window.ensureFirebaseReady === "function") {
      try {
        await window.ensureFirebaseReady();
      } catch {}
    }

    if (window.firebaseDbRef && window.feeFirebase) return window.firebaseDbRef;

    if (!window.feeFirebase) {
      throw new Error("Firebase module not found");
    }

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

    if (!window.__rescueFirebaseApp) {
      try {
        window.__rescueFirebaseApp = window.feeFirebase.initializeApp(config, "rescue-sync-v110");
      } catch {
        window.__rescueFirebaseApp = window.feeFirebase.initializeApp(config);
      }
    }

    window.__rescueFirebaseDb = window.feeFirebase.getDatabase(window.__rescueFirebaseApp);
    return window.__rescueFirebaseDb;
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
    }
  }

  function hideProgress() {
    const topBar = $("top-sync-progress");
    if (topBar) topBar.classList.remove("show");

    const overlay = $("patchSyncOverlay");
    if (overlay) overlay.classList.remove("show");
  }

  async function uploadSnapshot(snapshot) {
    if (!snapshot?.data) {
      snapshot = collectLocalState();
    }

    if (!snapshot?.data) {
      throw new Error("No local state to upload");
    }

    const db = await ensureFirebaseReady();
    const fb = window.feeFirebase;
    const root = getCloudRootPath();

    const payload = {
      ...snapshot.data,
      updatedAt: Date.now(),
      rescueUpdatedAt: Date.now(),
      rescueVersion: RESCUE_VERSION
    };

    await fb.set(fb.ref(db, `${root}/appState`), payload);

    await fb.update(fb.ref(db, `${root}/meta`), {
      updatedAt: Date.now(),
      rescueUpdatedAt: Date.now(),
      rescueVersion: RESCUE_VERSION,
      lastRescueSyncAt: new Date().toISOString()
    });

    return true;
  }

  async function rescueSync(label = "جاري مزامنة البيانات...") {
    if (rescueSyncRunning) return false;
    if (!isCloudMode()) return false;

    if (isOffline()) {
      addPending("محاولة مزامنة بدون إنترنت");
      toast("لا يوجد إنترنت، البيانات محفوظة وستبقى معلقة", "warning");
      updateBadges();
      return false;
    }

    if (pendingCount() <= 0) return true;

    rescueSyncRunning = true;

    try {
      showProgress(label, 10);

      const snapshot =
        safeParse(localStorage.getItem(RESCUE_STATE_KEY), null) ||
        collectLocalState();

      showProgress("تجهيز البيانات المحفوظة", 30);

      try {
        if (typeof window.pushFullStateToCloud === "function") {
          await window.pushFullStateToCloud();
        } else if (typeof window.syncQueueToCloud === "function") {
          await window.syncQueueToCloud();
        } else if (typeof window.uploadOfflineDataToCloud === "function") {
          await window.uploadOfflineDataToCloud();
        }
      } catch (err) {
        console.warn("native sync failed, rescue upload continues", err);
      }

      showProgress("رفع نسخة مؤكدة إلى Firebase", 60);

      await uploadSnapshot(snapshot);

      showProgress("تأكيد المزامنة", 90);

      clearPendingAfterSuccess();

      showProgress("تمت المزامنة بنجاح", 100);

      setTimeout(hideProgress, 700);
      toast("تم رفع البيانات إلى Firebase بنجاح", "success");
      return true;
    } catch (err) {
      console.error("rescueSync failed", err);
      hideProgress();
      addPending("فشل الرفع وسيعاد لاحقاً");
      toast("فشل الرفع، البيانات باقية على الجهاز ولن تضيع", "warning");
      return false;
    } finally {
      rescueSyncRunning = false;
      updateBadges();
    }
  }

  function hookSyncButtons() {
    document.addEventListener("click", function (e) {
      const btn =
        e.target.closest("#patchSyncBtn") ||
        e.target.closest("[onclick='openSyncCenter()']") ||
        e.target.closest("[onclick=\"openSyncCenter()\"]");

      if (!btn) return;

      if (pendingCount() <= 0) return;

      e.preventDefault();
      e.stopPropagation();

      rescueSync("جاري رفع العمليات المعلقة...");
    }, true);
  }

  function watchStorageChanges() {
    let lastState = localStorage.getItem(getAppStateKey()) || "";

    setInterval(() => {
      patchAllMutationFunctions();
      patchNativeSyncFunctions();
      updateBadges();

      const current = localStorage.getItem(getAppStateKey()) || "";
      if (current && current !== lastState) {
        lastState = current;

        if (isOffline()) {
          addPending("تغيير محفوظ أوفلاين");
        }
      }

      if (navigator.onLine && pendingCount() > 0) {
        rescueSync("محاولة مزامنة تلقائية...");
      }
    }, 2500);
  }

  function boot() {
    patchAlerts();
    patchConsoleErrorNoise();
    patchAllMutationFunctions();
    patchNativeSyncFunctions();
    restoreAfterRefresh();
    updateBadges();
    hookSyncButtons();
    watchStorageChanges();

    window.addEventListener("offline", () => {
      addPending("انقطع الإنترنت");
      updateBadges();
      toast("انقطع الإنترنت، أي بيانات جديدة ستُحفظ محلياً", "warning");
    });

    window.addEventListener("online", () => {
      updateBadges();
      toast("عاد الإنترنت، سيتم رفع البيانات المعلقة", "success");
      setTimeout(() => rescueSync("عاد الإنترنت، جاري المزامنة..."), 1000);
    });

    setTimeout(() => {
      restoreAfterRefresh();
      if (navigator.onLine && pendingCount() > 0) {
        rescueSync("جاري رفع بيانات محفوظة سابقاً...");
      }
    }, 1200);

    console.log("patch-sync-rescue loaded", RESCUE_VERSION);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();