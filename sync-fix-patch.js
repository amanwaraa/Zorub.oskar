/* sync-fix-patch.js
   إصلاح جذري لمشكلة المزامنة:
   - يحفظ العمليات المعلقة في localStorage حتى بعد تحديث الصفحة
   - عند قطع الإنترنت لا تضيع البيانات
   - عند رجوع الإنترنت يزامن تلقائيًا
   - زر المزامنة الأصلي يرفع البيانات يدويًا
   - لا يمسح العمليات إلا بعد نجاح Firebase
*/

(function () {
  "use strict";

  const PATCH_NAME = "sync-fix-patch";
  const PATCH_VERSION = "1.0.0";

  const PREFIX = "DFDFG";

  const OUTBOX_KEY = `${PREFIX}_sync_fix_outbox_v1`;
  const LAST_SYNC_KEY = `${PREFIX}_sync_fix_last_sync_v1`;
  const LOCK_KEY = `${PREFIX}_sync_fix_lock_v1`;

  let syncing = false;
  let bootDone = false;

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

  function uid(prefix = "op") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getOutbox() {
    return safeParse(localStorage.getItem(OUTBOX_KEY), []);
  }

  function setOutbox(list) {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    updateOriginalSyncBadge();
  }

  function addOutbox(type, payload) {
    const list = getOutbox();

    list.push({
      id: uid("sync"),
      type: type || "change",
      payload: payload || {},
      createdAt: nowIso(),
      url: location.href
    });

    setOutbox(list);
  }

  function clearOutboxOnlyAfterSuccess() {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify([]));
    localStorage.setItem(LAST_SYNC_KEY, nowIso());
    updateOriginalSyncBadge();
  }

  function getCurrentLicenseSafe() {
    try {
      if (typeof window.getCurrentLicense === "function") {
        return window.getCurrentLicense();
      }
    } catch {}

    const possibleKeys = [
      "fee_rebuild_v3_license",
      "fee_cached_license_state_v1",
      `${PREFIX}_USER_SESSION`
    ];

    for (const key of possibleKeys) {
      const value = safeParse(localStorage.getItem(key), null);
      if (value && typeof value === "object") return value;
    }

    return null;
  }

  function getAppStateKeySafe() {
    try {
      if (typeof window.getAppStateKey === "function") return window.getAppStateKey();
    } catch {}

    const license = getCurrentLicenseSafe();
    const key = license?.key || "local";
    return `fee_rebuild_v3_app_state__${key}`;
  }

  function getQueueKeySafe() {
    try {
      if (typeof window.getQueueKey === "function") return window.getQueueKey();
    } catch {}

    const license = getCurrentLicenseSafe();
    const key = license?.key || "local";
    return `fee_rebuild_v3_sync_queue__${key}`;
  }

  function getCloudRootPathSafe() {
    try {
      if (typeof window.getActiveCloudRootPath === "function") return window.getActiveCloudRootPath();
    } catch {}

    try {
      if (typeof window.getCloudRootPath === "function") return window.getCloudRootPath();
    } catch {}

    const license = getCurrentLicenseSafe();
    return `fee_cloud_data/${license?.key || "default"}`;
  }

  function getLocalStateSafe() {
    try {
      if (window.state?.data) return window.state.data;
    } catch {}

    return safeParse(localStorage.getItem(getAppStateKeySafe()), null);
  }

  function saveLocalStateSafe() {
    try {
      if (typeof window.saveAppState === "function") {
        window.saveAppState();
        return;
      }
    } catch {}

    try {
      if (window.state?.data) {
        localStorage.setItem(getAppStateKeySafe(), JSON.stringify(window.state.data));
      }
    } catch {}
  }

  function isLocalOnlyModeSafe() {
    try {
      if (typeof window.isLocalOnlyMode === "function") return window.isLocalOnlyMode();
    } catch {}
    return false;
  }

  function updateOriginalSyncBadge() {
    const count = getOutbox().length;

    const badge =
      $("pending-sync-badge") ||
      $("patchSyncCount") ||
      document.querySelector("[id*='sync'][id*='badge']");

    if (badge) {
      badge.textContent = String(count);
      badge.classList.toggle("hidden-force", count === 0);
      badge.classList.toggle("show", count > 0);
      badge.style.display = count > 0 ? "flex" : "";
    }

    try {
      if (typeof window.updatePendingSyncBadge === "function") {
        window.updatePendingSyncBadge();
      }
    } catch {}

    try {
      if (typeof window.updateSyncBadge === "function") {
        window.updateSyncBadge();
      }
    } catch {}
  }

  function showTopProgress(label, percent) {
    const bar = $("top-sync-progress");
    const fill = $("sync-progress-fill");
    const txt = $("sync-percent");
    const labelEl = $("top-sync-label");

    if (bar && fill && txt && labelEl) {
      bar.classList.add("show");
      fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
      txt.textContent = `${Math.round(Math.max(0, Math.min(100, percent)))}%`;
      labelEl.textContent = label || "جارٍ المزامنة";
      return;
    }

    let box = $("syncFixProgress");
    if (!box) {
      box = document.createElement("div");
      box.id = "syncFixProgress";
      box.style.cssText = `
        position:fixed;
        top:12px;
        right:12px;
        left:12px;
        z-index:999999;
        background:#eef5ff;
        border:1px solid #cfe0ff;
        border-radius:18px;
        padding:12px;
        direction:rtl;
        box-shadow:0 12px 30px rgba(15,23,42,.18);
        font-family:Arial,sans-serif;
      `;
      box.innerHTML = `
        <div id="syncFixLabel" style="font-weight:900;color:#1d4ed8;margin-bottom:8px">جارٍ المزامنة</div>
        <div style="height:10px;background:#dbe7ff;border-radius:999px;overflow:hidden">
          <div id="syncFixFill" style="height:100%;width:0%;background:#1d4ed8;border-radius:999px"></div>
        </div>
      `;
      document.body.appendChild(box);
    }

    $("syncFixLabel").textContent = label || "جارٍ المزامنة";
    $("syncFixFill").style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  function hideTopProgress() {
    const bar = $("top-sync-progress");
    const fill = $("sync-progress-fill");
    const txt = $("sync-percent");

    if (bar && fill && txt) {
      bar.classList.remove("show");
      fill.style.width = "0%";
      txt.textContent = "0%";
    }

    $("syncFixProgress")?.remove();
  }

  function toast(message, type) {
    try {
      if (typeof window.showToast === "function") {
        window.showToast(message, type || "default");
        return;
      }
    } catch {}

    try {
      if (typeof window.toast === "function") {
        window.toast(message);
        return;
      }
    } catch {}

    console.log(message);
  }

  function lockSync() {
    const old = Number(localStorage.getItem(LOCK_KEY) || 0);
    if (old && Date.now() - old < 15000) return false;
    localStorage.setItem(LOCK_KEY, String(Date.now()));
    return true;
  }

  function unlockSync() {
    localStorage.removeItem(LOCK_KEY);
  }

  async function ensureFirebaseReadySafe() {
    if (typeof window.ensureFirebaseReady === "function") {
      await window.ensureFirebaseReady();
      return true;
    }

    if (window.firebaseDbRef && window.feeFirebase) return true;

    return !!window.feeFirebase;
  }

  async function pushWholeStateToFirebase() {
    if (!navigator.onLine) return false;
    if (isLocalOnlyModeSafe()) return false;

    const data = getLocalStateSafe();
    if (!data) throw new Error("لا توجد بيانات محلية للرفع");

    await ensureFirebaseReadySafe();

    const fb = window.feeFirebase;
    const db =
      window.firebaseDbRef ||
      window.firebaseDb ||
      window.db ||
      null;

    if (!fb || !db) {
      if (typeof window.pushFullStateToCloud === "function") {
        return await window.pushFullStateToCloud();
      }

      throw new Error("Firebase غير جاهز");
    }

    const rootPath = getCloudRootPathSafe();

    showTopProgress("تجهيز البيانات للرفع", 25);

    const payload = {
      settings: data.settings || {},
      customers: data.customers || [],
      invoices: data.invoices || [],
      users: data.users || [],
      shortages: data.shortages || [],
      purchases: data.purchases || [],
      updatedAt: Date.now(),
      syncFixUpdatedAt: Date.now()
    };

    showTopProgress("رفع البيانات إلى Firebase", 55);

    await fb.set(fb.ref(db, `${rootPath}/appState`), payload);

    showTopProgress("تأكيد الرفع", 82);

    await fb.update(fb.ref(db, `${rootPath}/meta`), {
      updatedAt: Date.now(),
      syncFixUpdatedAt: Date.now(),
      pendingClearedAt: Date.now()
    });

    showTopProgress("اكتملت المزامنة", 100);

    return true;
  }

  async function syncNow(reason) {
    if (syncing) return false;
    if (!navigator.onLine) {
      updateOriginalSyncBadge();
      toast("لا يوجد إنترنت، البيانات محفوظة وستبقى بانتظار المزامنة", "warning");
      return false;
    }

    const outbox = getOutbox();
    const nativeQueue = safeParse(localStorage.getItem(getQueueKeySafe()), []);

    if (outbox.length === 0 && (!Array.isArray(nativeQueue) || nativeQueue.length === 0)) {
      updateOriginalSyncBadge();
      return true;
    }

    if (!lockSync()) return false;

    syncing = true;

    try {
      showTopProgress(reason || "جارٍ مزامنة البيانات", 10);

      saveLocalStateSafe();

      const ok = await pushWholeStateToFirebase();

      if (!ok) throw new Error("فشل الرفع");

      clearOutboxOnlyAfterSuccess();

      try {
        localStorage.setItem(getQueueKeySafe(), JSON.stringify([]));
        if (window.state && Array.isArray(window.state.queue)) {
          window.state.queue = [];
        }
      } catch {}

      updateOriginalSyncBadge();
      hideTopProgress();
      toast("تم رفع البيانات المعلقة إلى Firebase بنجاح", "success");

      try {
        if (typeof window.attachRealtimeSync === "function") {
          await window.attachRealtimeSync();
        }
      } catch {}

      try {
        if (typeof window.render === "function") window.render();
      } catch {}

      return true;
    } catch (err) {
      console.error(`${PATCH_NAME} sync failed`, err);

      saveLocalStateSafe();
      updateOriginalSyncBadge();
      hideTopProgress();

      toast("فشلت المزامنة، البيانات بقيت محفوظة على الجهاز", "warning");
      return false;
    } finally {
      syncing = false;
      unlockSync();
    }
  }

  function patchNativeQueue() {
    if (window.__syncFixQueuePatched) return;
    window.__syncFixQueuePatched = true;

    const oldEnqueue = window.enqueueSyncOperation;
    if (typeof oldEnqueue === "function") {
      window.enqueueSyncOperation = function patchedEnqueueSyncOperation(op) {
        addOutbox(op?.type || "change", op?.payload || op || {});

        let result;
        try {
          result = oldEnqueue.apply(this, arguments);
        } catch (err) {
          console.warn("native enqueue failed but sync-fix saved operation", err);
        }

        updateOriginalSyncBadge();

        if (navigator.onLine) {
          setTimeout(() => syncNow("مزامنة تلقائية بعد الحفظ"), 400);
        } else {
          toast("تم الحفظ بدون إنترنت، ستتم المزامنة عند عودة الاتصال", "warning");
        }

        return result;
      };
    }

    const oldManualSync = window.manualSync;
    window.manualSync = async function patchedManualSync() {
      const outbox = getOutbox();
      const nativeQueue = safeParse(localStorage.getItem(getQueueKeySafe()), []);

      if (outbox.length > 0 || nativeQueue.length > 0) {
        return await syncNow("مزامنة يدوية");
      }

      if (typeof oldManualSync === "function") {
        return await oldManualSync.apply(this, arguments);
      }

      return await syncNow("مزامنة يدوية");
    };

    const oldSyncQueue = window.syncQueueToCloud;
    if (typeof oldSyncQueue === "function") {
      window.syncQueueToCloud = async function patchedSyncQueueToCloud() {
        const outbox = getOutbox();

        if (outbox.length > 0) {
          return await syncNow("مزامنة العمليات المعلقة");
        }

        try {
          const ok = await oldSyncQueue.apply(this, arguments);
          updateOriginalSyncBadge();
          return ok;
        } catch (err) {
          console.warn("native syncQueue failed", err);
          return await syncNow("إعادة محاولة المزامنة");
        }
      };
    }
  }

  function patchMutationFunctions() {
    const names = [
      "addCustomer",
      "saveEditedCustomer",
      "deleteCustomer",
      "saveInvoiceDraft",
      "savePayment",
      "saveManualDebt",
      "savePurchase",
      "saveEditedPurchase",
      "deletePurchase",
      "saveShortage",
      "markShortageDone",
      "deleteShortage",
      "saveSettings",
      "saveNewUser",
      "saveEditedUser",
      "deleteUser",
      "saveInvoiceStatusChange",
      "checkout",
      "saveProduct",
      "deleteProduct",
      "saveManualInvoice",
      "saveInvoiceStatus"
    ];

    names.forEach(name => {
      const old = window[name];
      if (typeof old !== "function") return;
      if (old.__syncFixPatched) return;

      const wrapped = function syncFixWrappedMutation(...args) {
        let result;

        try {
          result = old.apply(this, args);
        } catch (err) {
          addOutbox(name, { args: args.map(x => String(x ?? "")) });
          saveLocalStateSafe();
          updateOriginalSyncBadge();
          throw err;
        }

        Promise.resolve(result)
          .then(() => {
            addOutbox(name, { args: args.map(x => String(x ?? "")) });
            saveLocalStateSafe();
            updateOriginalSyncBadge();

            if (navigator.onLine) {
              setTimeout(() => syncNow("مزامنة تلقائية بعد الحفظ"), 500);
            } else {
              toast("تم الحفظ أوفلاين، العملية بانتظار المزامنة", "warning");
            }
          })
          .catch(err => {
            addOutbox(name, { failedButSaved: true });
            saveLocalStateSafe();
            updateOriginalSyncBadge();
            console.warn(`${PATCH_NAME}: mutation failed but queued`, name, err);
          });

        return result;
      };

      wrapped.__syncFixPatched = true;
      window[name] = wrapped;
    });
  }

  function bindOriginalSyncButton() {
    const selectors = [
      "#pending-sync-badge",
      "button[onclick='openSyncCenter()']",
      "button[onclick=\"openSyncCenter()\"]",
      "#patchSyncBtn"
    ];

    const btn =
      $("patchSyncBtn") ||
      document.querySelector("button[onclick='openSyncCenter()']") ||
      document.querySelector("button[onclick=\"openSyncCenter()\"]") ||
      $("pending-sync-badge")?.closest("button");

    if (!btn || btn.__syncFixClickBound) return;

    btn.__syncFixClickBound = true;

    btn.addEventListener(
      "click",
      function (e) {
        const count = getOutbox().length;
        const nativeQueue = safeParse(localStorage.getItem(getQueueKeySafe()), []);

        if (count > 0 || nativeQueue.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          syncNow("مزامنة يدوية");
        }
      },
      true
    );
  }

  function openSyncCenterPatch() {
    const oldOpenSyncCenter = window.openSyncCenter;

    if (typeof oldOpenSyncCenter !== "function" || oldOpenSyncCenter.__syncFixPatched) return;

    const patched = function patchedOpenSyncCenter() {
      const count = getOutbox().length;
      const nativeQueue = safeParse(localStorage.getItem(getQueueKeySafe()), []);

      if (count > 0 || nativeQueue.length > 0) {
        const ok = confirm(`يوجد ${count || nativeQueue.length} عملية بانتظار المزامنة. هل تريد المزامنة الآن؟`);
        if (ok) {
          syncNow("مزامنة يدوية");
          return;
        }
      }

      return oldOpenSyncCenter.apply(this, arguments);
    };

    patched.__syncFixPatched = true;
    window.openSyncCenter = patched;
  }

  function installNetworkHandlers() {
    window.addEventListener("online", () => {
      updateOriginalSyncBadge();

      if (getOutbox().length > 0) {
        setTimeout(() => {
          syncNow("عاد الإنترنت، جارٍ رفع البيانات");
        }, 800);
      }
    });

    window.addEventListener("offline", () => {
      updateOriginalSyncBadge();
      toast("انقطع الإنترنت، أي بيانات جديدة ستبقى محفوظة على الجهاز", "warning");
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && navigator.onLine && getOutbox().length > 0) {
        setTimeout(() => syncNow("استكمال المزامنة"), 600);
      }
    });
  }

  function boot() {
    if (bootDone) return;
    bootDone = true;

    patchNativeQueue();
    patchMutationFunctions();
    bindOriginalSyncButton();
    openSyncCenterPatch();
    installNetworkHandlers();

    updateOriginalSyncBadge();

    setInterval(() => {
      patchNativeQueue();
      patchMutationFunctions();
      bindOriginalSyncButton();
      openSyncCenterPatch();
      updateOriginalSyncBadge();

      if (navigator.onLine && getOutbox().length > 0 && !syncing) {
        syncNow("مزامنة تلقائية");
      }
    }, 3000);

    setTimeout(() => {
      if (navigator.onLine && getOutbox().length > 0) {
        syncNow("استكمال عمليات سابقة");
      }
    }, 1200);

    console.log(`${PATCH_NAME} loaded`, PATCH_VERSION);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();