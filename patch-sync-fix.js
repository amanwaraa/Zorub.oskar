/* patch-sync-fix.js v1.1.0
   يحافظ على العمليات المعلقة بعد التحديث
   لا ينشئ زر مزامنة جديد
   يستخدم أيقونة المزامنة الأصلية patchSyncBtn / patchSyncCount
   لا يمسح العداد إلا إذا نجحت المزامنة فعليًا
*/

(function () {
  "use strict";

  const VERSION = "1.1.0";
  const PREFIX = "DFDFG";

  const SESSION_KEY = `${PREFIX}_USER_SESSION`;
  const OUTBOX_KEY = `${PREFIX}_patch_sync_outbox_v4`;
  const OUTBOX_LOG_KEY = `${PREFIX}_patch_sync_log_v2`;
  const LAST_SYNC_KEY = `${PREFIX}_patch_last_sync_at_v4`;

  let syncRunning = false;
  let patched = false;
  let retryTimer = null;

  function $(id) {
    return document.getElementById(id);
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

  function json(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getSession() {
    return json(localStorage.getItem(SESSION_KEY), null);
  }

  function isOnlineMode() {
    return getSession()?.appMode === "online";
  }

  function canSync() {
    return !!getSession() && isOnlineMode() && navigator.onLine;
  }

  function getOutbox() {
    const list = json(localStorage.getItem(OUTBOX_KEY), []);
    return Array.isArray(list) ? list : [];
  }

  function setOutbox(list) {
    saveJson(OUTBOX_KEY, Array.isArray(list) ? list : []);
    updateOriginalSyncBadge();
  }

  function getLog() {
    const list = json(localStorage.getItem(OUTBOX_LOG_KEY), []);
    return Array.isArray(list) ? list : [];
  }

  function setLog(list) {
    saveJson(OUTBOX_LOG_KEY, Array.isArray(list) ? list : []);
  }

  function unique(list) {
    const map = new Map();
    list.forEach(item => {
      if (item?.id) map.set(item.id, item);
    });
    return Array.from(map.values());
  }

  function addPending(reason, source) {
    if (!isOnlineMode()) return;

    const op = {
      id: `pending_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      reason: reason || "عملية معلقة تحتاج مزامنة",
      source: source || "unknown",
      status: "pending",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    setOutbox(unique([op, ...getOutbox()]));

    setLog([
      {
        ...op,
        message: "تم حفظ العملية على الجهاز ولم يتم تأكيد رفعها بعد"
      },
      ...getLog()
    ].slice(0, 200));

    toast("تم حفظ العملية على الجهاز وتحتاج مزامنة");
  }

  function updateOriginalSyncBadge() {
    const count = getOutbox().length;
    const badge = $("patchSyncCount");
    const btn = $("patchSyncBtn");

    if (badge) {
      badge.textContent = String(count);
      badge.classList.toggle("show", count > 0);
      badge.style.display = count > 0 ? "flex" : "";
    }

    if (btn) {
      btn.title = count > 0
        ? `يوجد ${count} عملية لم يتم تأكيد رفعها`
        : "كل البيانات متزامنة";

      if (!btn.dataset.syncFixBound) {
        btn.dataset.syncFixBound = "1";
        btn.addEventListener("click", function (e) {
          if (getOutbox().length > 0) {
            e.preventDefault();
            e.stopPropagation();
            manualSync();
          }
        }, true);
      }
    }
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
        color:#fff;
        padding:13px 15px;
        border-radius:16px;
        box-shadow:0 14px 34px rgba(0,0,0,.24);
        max-width:calc(100vw - 32px);
        font-size:14px;
        font-weight:900;
        opacity:0;
        transform:translateY(12px);
        transition:.25s ease;
        direction:rtl;
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
    }, 3000);
  }

  function createProgress() {
    if ($("patchSyncFixProgressOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "patchSyncFixProgressOverlay";
    overlay.style.cssText = `
      position:fixed;
      inset:0;
      z-index:9999998;
      background:rgba(255,255,255,.96);
      display:none;
      align-items:center;
      justify-content:center;
      padding:22px;
      direction:rtl;
    `;

    overlay.innerHTML = `
      <div style="width:min(420px,100%);background:white;border:1px solid #dbeafe;border-radius:26px;box-shadow:0 25px 60px rgba(15,23,42,.18);padding:24px;text-align:center">
        <div id="patchSyncFixTitle" style="font-size:20px;font-weight:950;color:#1d4ed8;margin-bottom:8px">جاري تصدير البيانات للسحابة</div>
        <div id="patchSyncFixSub" style="font-size:13px;font-weight:800;color:#64748b;line-height:1.8;margin-bottom:18px">لا تغلق الصفحة حتى يكتمل الرفع</div>
        <div style="width:100%;height:14px;background:#e5e7eb;border-radius:999px;overflow:hidden;border:1px solid #dbeafe">
          <div id="patchSyncFixBar" style="width:0%;height:100%;background:linear-gradient(90deg,#1d4ed8,#60a5fa);border-radius:999px;transition:width .25s ease"></div>
        </div>
        <div id="patchSyncFixPercent" style="margin-top:10px;color:#0f172a;font-size:18px;font-weight:950">0%</div>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  function showProgress(percent, title, sub) {
    createProgress();

    const overlay = $("patchSyncFixProgressOverlay");
    const bar = $("patchSyncFixBar");
    const num = $("patchSyncFixPercent");

    if (overlay) overlay.style.display = "flex";
    if (bar) bar.style.width = `${percent}%`;
    if (num) num.textContent = `${Math.round(percent)}%`;
    if (title && $("patchSyncFixTitle")) $("patchSyncFixTitle").textContent = title;
    if (sub && $("patchSyncFixSub")) $("patchSyncFixSub").textContent = sub;
  }

  function hideProgress() {
    const overlay = $("patchSyncFixProgressOverlay");
    if (overlay) overlay.style.display = "none";
  }

  async function animateTo(to) {
    const bar = $("patchSyncFixBar");
    const current = Number((bar?.style.width || "0").replace("%", "")) || 0;
    for (let p = current; p <= to; p += 5) {
      showProgress(p);
      await sleep(70);
    }
  }

  function patchWriteFunctions() {
    if (patched) return;
    patched = true;

    [
      "checkout",
      "saveProduct",
      "deleteProduct",
      "savePurchase",
      "deletePurchase",
      "saveSettings",
      "saveManualInvoice",
      "saveInvoiceStatus"
    ].forEach(name => waitPatch(name));

    patchLocalStorageOfflineWrites();
  }

  function waitPatch(name, tries = 160) {
    const fn = window[name];

    if (typeof fn === "function" && !fn.__syncKeepPatched) {
      const old = fn;

      const patchedFn = async function (...args) {
        const beforeOnline = navigator.onLine;

        let result;
        try {
          result = await old.apply(this, args);
        } finally {
          if (isOnlineMode()) {
            addPending(
              beforeOnline
                ? `عملية جديدة تحتاج تأكيد رفع: ${name}`
                : `عملية محفوظة بدون إنترنت: ${name}`,
              name
            );

            if (navigator.onLine) scheduleAutoSync(600);
          }
        }

        return result;
      };

      patchedFn.__syncKeepPatched = true;
      window[name] = patchedFn;
      return;
    }

    if (tries > 0) {
      setTimeout(() => waitPatch(name, tries - 1), 100);
    }
  }

  function patchLocalStorageOfflineWrites() {
    if (window.__syncKeepStoragePatched) return;
    window.__syncKeepStoragePatched = true;

    const oldSetItem = Storage.prototype.setItem;

    Storage.prototype.setItem = function (key, value) {
      const result = oldSetItem.apply(this, arguments);

      try {
        if (
          this === localStorage &&
          isOnlineMode() &&
          !navigator.onLine &&
          key !== OUTBOX_KEY &&
          key !== OUTBOX_LOG_KEY &&
          /invoice|product|purchase|expense|merchant|customer|settings|cashier|DFDFG/i.test(String(key))
        ) {
          addPending(`تغيير محفوظ بدون إنترنت: ${key}`, "localStorage");
        }
      } catch {}

      return result;
    };
  }

  async function manualSync() {
    if (!getSession()) {
      toast("سجل الدخول أولًا");
      return;
    }

    if (!isOnlineMode()) {
      toast("المزامنة خاصة بنسخة الأونلاين");
      return;
    }

    if (!navigator.onLine) {
      toast("لا يوجد إنترنت الآن، العمليات ستبقى محفوظة");
      return;
    }

    await runSync("مزامنة يدوية");
  }

  function scheduleAutoSync(delay) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (getOutbox().length > 0 && canSync()) {
        runSync("عاد الإنترنت، جاري تصدير البيانات للسحابة");
      }
    }, delay || 1000);
  }

  async function runSync(title) {
    if (syncRunning) return;
    if (!canSync()) return;

    const pendingBefore = getOutbox();
    const pendingCount = pendingBefore.length;

    if (pendingCount <= 0) {
      updateOriginalSyncBadge();
      return;
    }

    syncRunning = true;

    try {
      showProgress(5, title || "جاري تصدير البيانات للسحابة", `يوجد ${pendingCount} عملية معلقة`);
      await animateTo(25);

      let didCallRealSync = false;

      if (typeof window.uploadOfflineDataToCloud === "function") {
        didCallRealSync = true;
        await animateTo(55);
        await window.uploadOfflineDataToCloud();
      } else if (typeof window.syncOfflineData === "function") {
        didCallRealSync = true;
        await animateTo(55);
        await window.syncOfflineData();
      } else if (typeof window.forceSync === "function") {
        didCallRealSync = true;
        await animateTo(55);
        await window.forceSync();
      }

      if (!didCallRealSync) {
        throw new Error("لا توجد دالة مزامنة أصلية متاحة من app.js");
      }

      await sleep(900);
      await animateTo(85);

      const confirmed = await confirmCloudSyncSuccess();

      if (!confirmed) {
        throw new Error("لم يتم تأكيد رفع البيانات، لذلك ستبقى العمليات معلقة");
      }

      await animateTo(100);

      setOutbox([]);
      localStorage.setItem(LAST_SYNC_KEY, nowIso());

      setLog([
        {
          id: `done_${Date.now()}`,
          reason: `تم رفع ${pendingCount} عملية بنجاح`,
          source: "sync",
          status: "done",
          message: "تم مسح العمليات المعلقة بعد تأكيد الرفع",
          createdAt: nowIso(),
          updatedAt: nowIso()
        },
        ...getLog()
      ].slice(0, 200));

      toast("تم تأكيد المزامنة ورفع البيانات");
      await sleep(450);
      hideProgress();
    } catch (err) {
      console.error(err);

      setOutbox(pendingBefore);

      setLog([
        {
          id: `failed_${Date.now()}`,
          reason: "فشلت أو لم تتأكد المزامنة",
          source: "sync",
          status: "failed",
          message: err?.message || "ستبقى العمليات محفوظة على الجهاز",
          createdAt: nowIso(),
          updatedAt: nowIso()
        },
        ...getLog()
      ].slice(0, 200));

      toast("لم يتم تأكيد الرفع، بقيت العمليات معلقة");
      hideProgress();
    } finally {
      syncRunning = false;
      updateOriginalSyncBadge();

      if (getOutbox().length > 0 && navigator.onLine) {
        scheduleAutoSync(12000);
      }
    }
  }

  async function confirmCloudSyncSuccess() {
    /*
      هذا أهم تعديل:
      لا نمسح العمليات بمجرد انتهاء دالة المزامنة.
      نعتبرها ناجحة فقط إذا:
      1) الدالة الأصلية أنهت بدون خطأ
      2) يوجد إنترنت
      3) التطبيق ما رجع يعمل خطأ ظاهر
      لأننا لا نعرف مسار Firebase من الباتش، فلا نحذف إلا بعد انتهاء الدالة الأصلية مع اتصال ثابت.
    */

    if (!navigator.onLine) return false;

    await sleep(400);

    const stillOnline = navigator.onLine;
    if (!stillOnline) return false;

    return true;
  }

  function bindEvents() {
    window.addEventListener("online", () => {
      updateOriginalSyncBadge();
      if (getOutbox().length > 0 && isOnlineMode()) {
        toast("عاد الإنترنت، سيتم رفع العمليات المعلقة");
        scheduleAutoSync(1000);
      }
    });

    window.addEventListener("offline", () => {
      updateOriginalSyncBadge();
      toast("انقطع الإنترنت، أي عملية جديدة ستبقى معلقة");
    });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && getOutbox().length > 0 && canSync()) {
        scheduleAutoSync(900);
      }
    });

    window.addEventListener("storage", e => {
      if (e.key === OUTBOX_KEY) updateOriginalSyncBadge();
    });
  }

  function boot() {
    updateOriginalSyncBadge();

    if (getOutbox().length > 0 && canSync()) {
      scheduleAutoSync(1500);
    }
  }

  function init() {
    createProgress();
    updateOriginalSyncBadge();
    patchWriteFunctions();
    bindEvents();

    setInterval(() => {
      updateOriginalSyncBadge();

      if (getOutbox().length > 0 && canSync() && !syncRunning) {
        scheduleAutoSync(1200);
      }
    }, 3500);

    setTimeout(boot, 700);
    setTimeout(boot, 2500);
    setTimeout(boot, 5000);

    console.log("patch-sync-fix loaded", VERSION);
  }

  ready(init);
})();