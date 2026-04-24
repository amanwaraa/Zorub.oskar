/* patch.js v4.2.2
   تعديلات خارجية فوق index.html + app.js
   مبني على v4.1.0
   يرجع المزامنة التلقائية عند رجوع النت
   بدون تحديث ملفات الموقع من الاستضافة عند Refresh
*/

(function () {
  "use strict";

  const PATCH_VERSION = "4.2.2";
  const PREFIX = "DFDFG";
  const DB_NAME = `${PREFIX}_offline_cashier_db_v6`;
  const DB_VERSION = 6;

  const OUTBOX_KEY = `${PREFIX}_patch_sync_outbox_v4`;
  const LAST_SYNC_KEY = `${PREFIX}_patch_last_sync_at_v4`;
  const PURCHASE_ITEMS_KEY = `${PREFIX}_patch_purchase_items_v4`;
  const MERCHANT_PAYMENTS_KEY = `${PREFIX}_patch_merchant_payments_v4`;
  const EXPENSES_KEY = `${PREFIX}_patch_expenses_v4`;

  let syncRunning = false;
  let observerStarted = false;

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

  function safeJsonParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeHtmlAttr(value) {
    return escapeHtml(value);
  }

  function escapeJs(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "");
  }

  function money(value, symbol = "₪") {
    return `${Number(value || 0).toFixed(2)} ${symbol}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getSession() {
    return safeJsonParse(localStorage.getItem(`${PREFIX}_USER_SESSION`), null);
  }

  function isOnlineMode() {
    return getSession()?.appMode === "online";
  }

  function shouldSync() {
    return !!getSession() && isOnlineMode() && navigator.onLine;
  }

  function getLocalArray(key) {
    return safeJsonParse(localStorage.getItem(key), []);
  }

  function setLocalArray(key, value) {
    localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
  }

  function getOutbox() {
    return getLocalArray(OUTBOX_KEY);
  }

  function setOutbox(items) {
    setLocalArray(OUTBOX_KEY, items);
    updateSyncBadge();
  }

  function addOutboxOperation(reason) {
    if (!isOnlineMode()) return;

    const list = getOutbox();

    list.push({
      id: `op_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      reason: reason || "عملية غير مرفوعة",
      createdAt: nowIso()
    });

    setOutbox(list);
  }

  function clearOutbox() {
    setOutbox([]);
    localStorage.setItem(LAST_SYNC_KEY, nowIso());
    updateLastSyncText();
  }

  function getPurchaseItems() {
    return getLocalArray(PURCHASE_ITEMS_KEY);
  }

  function setPurchaseItems(items) {
    setLocalArray(PURCHASE_ITEMS_KEY, items);
  }

  function getMerchantPayments() {
    return getLocalArray(MERCHANT_PAYMENTS_KEY);
  }

  function setMerchantPayments(items) {
    setLocalArray(MERCHANT_PAYMENTS_KEY, items);
  }

  function getExpenses() {
    return getLocalArray(EXPENSES_KEY);
  }

  function setExpenses(items) {
    setLocalArray(EXPENSES_KEY, items);
  }

  function inRange(dateString, filter) {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return false;

    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const startWeek = new Date(startToday);
    startWeek.setDate(startWeek.getDate() - 6);

    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const startYear = new Date(now.getFullYear(), 0, 1);
    const endYear = new Date(now.getFullYear() + 1, 0, 1);

    if (filter === "all") return true;
    if (filter === "today" || filter === "day") return d >= startToday && d < endToday;
    if (filter === "week") return d >= startWeek && d < endToday;
    if (filter === "month") return d >= startMonth && d < endMonth;
    if (filter === "year") return d >= startYear && d < endYear;

    return true;
  }

  function injectStyle() {
    if ($("patchStyleV4")) return;

    const style = document.createElement("style");
    style.id = "patchStyleV4";
    style.textContent = `
      .patch-topbar {
        position: sticky;
        top: 0;
        z-index: 220;
        background: rgba(255,255,255,.94);
        backdrop-filter: blur(14px);
        border-bottom: 1px solid #e5e7eb;
        box-shadow: 0 8px 24px rgba(15,23,42,.06);
        display: none;
      }

      .patch-topbar-inner {
        min-height: 64px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 16px;
      }

      .patch-company {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .patch-menu-btn {
        width: 42px;
        height: 42px;
        border-radius: 15px;
        background: #eff6ff;
        color: #1d4ed8;
        border: 1px solid #dbeafe;
        display: none;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .patch-company-logo {
        width: 42px;
        height: 42px;
        border-radius: 15px;
        object-fit: cover;
        background: #eff6ff;
        border: 1px solid #dbeafe;
        display: none;
        flex-shrink: 0;
      }

      .patch-company-logo.show {
        display: block;
      }

      .patch-company-fallback {
        width: 42px;
        height: 42px;
        border-radius: 15px;
        background: linear-gradient(135deg, #1d4ed8, #60a5fa);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 900;
        flex-shrink: 0;
      }

      .patch-company-name {
        font-size: 15px;
        font-weight: 900;
        color: #0f172a;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 180px;
      }

      .patch-company-sub {
        font-size: 11px;
        color: #64748b;
        font-weight: 700;
      }

      .patch-top-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .patch-net-chip {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 9px 11px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 900;
        background: #ecfdf5;
        color: #166534;
        border: 1px solid #bbf7d0;
        white-space: nowrap;
      }

      .patch-net-chip.off {
        background: #fef2f2;
        color: #b91c1c;
        border-color: #fecaca;
      }

      .patch-net-dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: currentColor;
      }

      .patch-sync-btn {
        position: relative;
        height: 42px;
        min-width: 42px;
        padding: 0 12px;
        border-radius: 15px;
        background: #1d4ed8;
        color: #fff;
        border: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        font-weight: 900;
        box-shadow: 0 10px 22px rgba(29,78,216,.22);
      }

      .patch-sync-btn:disabled {
        opacity: .65;
      }

      .patch-sync-count {
        position: absolute;
        top: -7px;
        left: -7px;
        min-width: 20px;
        height: 20px;
        padding: 0 5px;
        border-radius: 999px;
        background: #dc2626;
        color: #fff;
        border: 2px solid #fff;
        font-size: 11px;
        line-height: 16px;
        display: none;
        align-items: center;
        justify-content: center;
        font-weight: 900;
      }

      .patch-sync-count.show {
        display: flex;
      }

      .patch-last-sync {
        font-size: 10px;
        color: #64748b;
        font-weight: 700;
        text-align: left;
        display: none;
      }

      .patch-backdrop {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(15,23,42,.45);
        z-index: 240;
      }

      .patch-backdrop.show {
        display: block;
      }

      .patch-sync-overlay {
        position: fixed;
        inset: 0;
        z-index: 999999;
        background: rgba(255,255,255,.96);
        display: none;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 16px;
        direction: rtl;
      }

      .patch-sync-overlay.show {
        display: flex;
      }

      .patch-sync-circle {
        width: 108px;
        height: 108px;
        border-radius: 999px;
        background:
          radial-gradient(closest-side, white 76%, transparent 77% 100%),
          conic-gradient(#1d4ed8 calc(var(--p) * 1%), #e5e7eb 0);
        color: #1d4ed8;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 21px;
        font-weight: 900;
      }

      .patch-sync-title {
        color: #1d4ed8;
        font-size: 18px;
        font-weight: 900;
        text-align: center;
      }

      .patch-sync-sub {
        color: #64748b;
        font-size: 13px;
        text-align: center;
        max-width: 340px;
        line-height: 1.8;
      }

      .patch-toast {
        position: fixed;
        left: 16px;
        bottom: 82px;
        z-index: 999999;
        background: #0f172a;
        color: #fff;
        padding: 13px 15px;
        border-radius: 16px;
        box-shadow: 0 14px 34px rgba(0,0,0,.24);
        max-width: calc(100vw - 32px);
        font-size: 14px;
        font-weight: 800;
        opacity: 0;
        transform: translateY(14px);
        transition: .25s ease;
        direction: rtl;
      }

      .patch-toast.show {
        opacity: 1;
        transform: translateY(0);
      }

      .patch-bottom-nav {
        position: fixed;
        right: 10px;
        left: 10px;
        bottom: 10px;
        z-index: 230;
        display: none;
        background: rgba(255,255,255,.96);
        backdrop-filter: blur(14px);
        border: 1px solid #e5e7eb;
        border-radius: 24px;
        box-shadow: 0 14px 34px rgba(15,23,42,.16);
        padding: 8px;
        direction: rtl;
      }

      .patch-bottom-nav-inner {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
      }

      .patch-bottom-item {
        border: none;
        background: transparent;
        color: #64748b;
        border-radius: 18px;
        padding: 8px 5px;
        font-size: 11px;
        font-weight: 900;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }

      .patch-bottom-item.active {
        background: #eff6ff;
        color: #1d4ed8;
      }

      .patch-table-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }

      .patch-mini-btn {
        border: none;
        border-radius: 12px;
        padding: 9px 12px;
        font-size: 12px;
        font-weight: 900;
        background: #eff6ff;
        color: #1d4ed8;
      }

      .patch-mini-btn.red {
        background: #fef2f2;
        color: #b91c1c;
      }

      .patch-mini-btn.green {
        background: #ecfdf5;
        color: #166534;
      }

      .patch-mini-btn.dark {
        background: #0f172a;
        color: #fff;
      }

      .patch-grid-stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
      }

      .patch-stat {
        border-radius: 20px;
        padding: 18px;
        color: #fff;
        box-shadow: 0 10px 24px rgba(15,23,42,.10);
      }

      .patch-stat p {
        margin: 0;
        opacity: .85;
        font-size: 13px;
        font-weight: 700;
      }

      .patch-stat h3 {
        margin: 8px 0 0;
        font-size: 26px;
        font-weight: 900;
      }

      .patch-export-area {
        position: fixed;
        top: -99999px;
        right: -99999px;
        width: 1200px;
        background: white;
        direction: rtl;
        font-family: Cairo, sans-serif;
      }

      .patch-print-table {
        width: 100%;
        border-collapse: collapse;
        background: #fff;
        direction: rtl;
        font-family: Cairo, Arial, sans-serif;
      }

      .patch-print-table th,
      .patch-print-table td {
        border: 1px solid #e5e7eb;
        padding: 10px;
        text-align: center;
        font-size: 13px;
      }

      .patch-print-table th {
        background: #eff6ff;
        color: #1d4ed8;
        font-weight: 900;
      }

      .patch-report-title {
        font-size: 24px;
        font-weight: 900;
        color: #0f172a;
        margin-bottom: 14px;
      }

      .patch-muted {
        color: #64748b;
        font-size: 12px;
        font-weight: 700;
      }

      .patch-purchase-row {
        display: grid;
        grid-template-columns: 1.3fr 1fr 90px 120px 120px 46px;
        gap: 10px;
        align-items: center;
      }

      .patch-hidden-important {
        display: none !important;
      }

      .patch-modal-fixed {
        align-items: flex-start !important;
        justify-content: center !important;
        padding: 84px 12px 18px !important;
        overflow-y: auto !important;
        overscroll-behavior: contain;
      }

      .patch-modal-fixed > .modal-card,
      .patch-modal-fixed .modal-card {
        max-height: calc(100dvh - 104px) !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch;
        margin: 0 auto !important;
      }

      .patch-expense-profit-note {
        display: block;
        margin-top: 6px;
        font-size: 11px;
        font-weight: 800;
        opacity: .9;
      }

      @media (max-width: 900px) {
        .patch-grid-stats {
          grid-template-columns: 1fr 1fr;
        }

        .patch-purchase-row {
          grid-template-columns: 1fr;
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 12px;
          background: #f8fafc;
        }
      }

      @media (max-width: 768px) {
        #mainApp {
          padding-bottom: 86px;
        }

        .patch-topbar {
          display: block;
        }

        .patch-menu-btn {
          display: inline-flex;
        }

        .patch-net-label,
        .patch-sync-label,
        .patch-last-sync {
          display: none !important;
        }

        #sideNav {
          position: fixed !important;
          top: 0;
          right: 0;
          bottom: 0;
          width: 82vw !important;
          max-width: 330px;
          z-index: 260;
          transform: translateX(105%);
          transition: .25s ease;
          display: flex !important;
          flex-direction: column !important;
          overflow-y: auto;
          border-left: 1px solid #e5e7eb;
          border-bottom: none !important;
        }

        #sideNav.patch-open {
          transform: translateX(0);
        }

        #navButtonsWrap {
          flex-direction: column !important;
          overflow-x: visible !important;
          width: 100%;
        }

        main.flex-grow {
          padding: 12px !important;
        }

        .patch-bottom-nav {
          display: block;
        }

        .modal-wrap {
          align-items: flex-start !important;
          justify-content: center !important;
          padding: 84px 10px 18px !important;
          overflow-y: auto !important;
        }

        .modal-card {
          width: 100% !important;
          max-width: 100% !important;
          max-height: calc(100dvh - 104px) !important;
          overflow-y: auto !important;
          border-radius: 22px !important;
          padding: 18px !important;
          margin: 0 auto !important;
          -webkit-overflow-scrolling: touch;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function toast(message) {
    let el = $("patchToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "patchToast";
      el.className = "patch-toast";
      document.body.appendChild(el);
    }

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.classList.remove("show");
    }, 3000);
  }

  function createSyncOverlay() {
    if ($("patchSyncOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "patchSyncOverlay";
    overlay.className = "patch-sync-overlay";
    overlay.innerHTML = `
      <div id="patchSyncCircle" class="patch-sync-circle" style="--p:0">0%</div>
      <div>
        <div id="patchSyncTitle" class="patch-sync-title">جاري مزامنة البيانات</div>
        <div id="patchSyncSub" class="patch-sync-sub">يرجى عدم إغلاق الصفحة حتى اكتمال رفع البيانات</div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  async function showSyncLoader(title = "جاري تصدير البيانات للسحابة", sub = "يتم رفع العمليات المحفوظة أوفلاين إلى Firebase") {
    createSyncOverlay();

    const overlay = $("patchSyncOverlay");
    const circle = $("patchSyncCircle");
    const titleEl = $("patchSyncTitle");
    const subEl = $("patchSyncSub");

    if (!overlay || !circle) return;

    titleEl.textContent = title;
    subEl.textContent = sub;

    overlay.classList.add("show");

    for (let p = 0; p <= 90; p += 10) {
      circle.style.setProperty("--p", p);
      circle.textContent = p + "%";
      await sleep(65);
    }
  }

  async function finishSyncLoader(successText = "اكتمل تصدير البيانات للسحابة") {
    const overlay = $("patchSyncOverlay");
    const circle = $("patchSyncCircle");
    const titleEl = $("patchSyncTitle");
    const subEl = $("patchSyncSub");

    if (!overlay || !circle) return;

    circle.style.setProperty("--p", 100);
    circle.textContent = "100%";
    titleEl.textContent = successText;
    subEl.textContent = "تم رفع العمليات غير المتزامنة بنجاح";

    await sleep(450);
    overlay.classList.remove("show");
  }

  function createTopbar() {
    if ($("patchTopbar")) return;

    const topbar = document.createElement("div");
    topbar.id = "patchTopbar";
    topbar.className = "patch-topbar";
    topbar.innerHTML = `
      <div class="patch-topbar-inner">
        <div class="patch-company">
          <button id="patchMenuBtn" class="patch-menu-btn" type="button" title="القائمة">
            <i data-lucide="menu"></i>
          </button>

          <img id="patchCompanyLogo" class="patch-company-logo" alt="logo">

          <div id="patchCompanyFallback" class="patch-company-fallback">
            <i data-lucide="store"></i>
          </div>

          <div class="min-w-0">
            <div id="patchCompanyName" class="patch-company-name">نظام الكاشير</div>
            <div id="patchCompanySub" class="patch-company-sub">جاهز للعمل</div>
          </div>
        </div>

        <div class="patch-top-actions">
          <div id="patchNetChip" class="patch-net-chip">
            <span class="patch-net-dot"></span>
            <span id="patchNetText" class="patch-net-label">متصل</span>
          </div>

          <button id="patchSyncBtn" class="patch-sync-btn" type="button" title="مزامنة البيانات">
            <i data-lucide="refresh-cw"></i>
            <span class="patch-sync-label">مزامنة</span>
            <span id="patchSyncCount" class="patch-sync-count">0</span>
          </button>

          <div id="patchLastSync" class="patch-last-sync"></div>
        </div>
      </div>
    `;

    const mainApp = $("mainApp");
    if (mainApp) mainApp.parentNode.insertBefore(topbar, mainApp);
    else document.body.prepend(topbar);

    const backdrop = document.createElement("div");
    backdrop.id = "patchBackdrop";
    backdrop.className = "patch-backdrop";
    document.body.appendChild(backdrop);

    $("patchMenuBtn")?.addEventListener("click", openSideNav);
    $("patchBackdrop")?.addEventListener("click", closeSideNav);
    $("patchSyncBtn")?.addEventListener("click", () => manualSync());

    updateNetworkUi();
    updateSyncBadge();
    updateLastSyncText();

    window.lucide?.createIcons?.();
  }

  function createBottomNav() {
    if ($("patchBottomNav")) return;

    const nav = document.createElement("div");
    nav.id = "patchBottomNav";
    nav.className = "patch-bottom-nav";
    nav.innerHTML = `
      <div class="patch-bottom-nav-inner">
        <button class="patch-bottom-item active" data-patch-tab="pos" type="button">
          <i data-lucide="shopping-cart"></i>
          <span>الكاشير</span>
        </button>
        <button class="patch-bottom-item" data-patch-tab="products" type="button">
          <i data-lucide="package"></i>
          <span>المخزون</span>
        </button>
        <button class="patch-bottom-item" data-patch-tab="invoices" type="button">
          <i data-lucide="receipt-text"></i>
          <span>الفواتير</span>
        </button>
        <button class="patch-bottom-item" data-patch-tab="customers" type="button">
          <i data-lucide="users"></i>
          <span>العملاء</span>
        </button>
      </div>
    `;

    document.body.appendChild(nav);

    qa(".patch-bottom-item", nav).forEach(btn => {
      btn.addEventListener("click", async () => {
        const tab = btn.dataset.patchTab;

        if (tab === "customers") await openCustomersTab();
        else if (typeof window.switchTab === "function") await window.switchTab(tab);

        closeSideNav();
        updateBottomActive(tab);
      });
    });

    window.lucide?.createIcons?.();
  }

  function updateBottomActive(tab) {
    qa(".patch-bottom-item").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.patchTab === tab);
    });
  }

  function openSideNav() {
    $("sideNav")?.classList.add("patch-open");
    $("patchBackdrop")?.classList.add("show");
  }

  function closeSideNav() {
    $("sideNav")?.classList.remove("patch-open");
    $("patchBackdrop")?.classList.remove("show");
  }

  function updateNetworkUi() {
    const chip = $("patchNetChip");
    const text = $("patchNetText");
    const sub = $("patchCompanySub");

    if (!chip || !text) return;

    if (navigator.onLine) {
      chip.classList.remove("off");
      text.textContent = "متصل";
      if (sub) sub.textContent = isOnlineMode() ? "أونلاين - المزامنة مفعلة" : "متصل بالإنترنت";
    } else {
      chip.classList.add("off");
      text.textContent = "غير متصل";
      if (sub) sub.textContent = "أوفلاين - البيانات محفوظة على الجهاز";
    }
  }

  function updateSyncBadge() {
    const count = getOutbox().length;
    const badge = $("patchSyncCount");
    const btn = $("patchSyncBtn");

    if (badge) {
      badge.textContent = String(count);
      badge.classList.toggle("show", count > 0);
    }

    if (btn) btn.title = count > 0 ? `يوجد ${count} عملية غير متزامنة` : "كل البيانات متزامنة";
  }

  function updateLastSyncText() {
    const el = $("patchLastSync");
    const raw = localStorage.getItem(LAST_SYNC_KEY);

    if (!el) return;

    if (!raw) {
      el.textContent = "";
      return;
    }

    try {
      el.textContent = `آخر مزامنة: ${new Date(raw).toLocaleTimeString("ar-EG", {
        hour: "2-digit",
        minute: "2-digit"
      })}`;
    } catch {
      el.textContent = "";
    }
  }

  function fixToastWrap() {
    const wrap = q(".toast-wrap");
    if (wrap && !wrap.id) wrap.id = "toastWrap";
  }

  function fixManualTransferSelect() {
    const old = $("transferAccountSelectManual");
    if (old && !$("manualTransferAccount")) old.id = "manualTransferAccount";
  }

  function fixTableHeaders() {
    const invTr = q("#tab-invoices table thead tr");
    if (invTr) {
      const headers = qa("th", invTr).map(th => th.textContent.trim());
      if (!headers.includes("الحساب")) {
        const th = document.createElement("th");
        th.className = "p-4";
        th.textContent = "الحساب";
        const notes = qa("th", invTr).find(x => x.textContent.trim() === "ملاحظات");
        if (notes) invTr.insertBefore(th, notes);
      }
    }

    const custTr = q("#customerHistoryModal table thead tr");
    if (custTr) {
      const headers = qa("th", custTr).map(th => th.textContent.trim());
      if (!headers.includes("الحساب")) {
        const th = document.createElement("th");
        th.className = "p-4";
        th.textContent = "الحساب";
        const notes = qa("th", custTr).find(x => x.textContent.trim() === "ملاحظات");
        if (notes) custTr.insertBefore(th, notes);
      }
    }
  }

  function improvePaymentOptions() {
    const payment = $("paymentMethod");
    if (!payment) return;

    payment.innerHTML = `
      <option value="cash">كاش</option>
      <option value="account">حساب دفع</option>
    `;
  }

  function improvePlaceholders() {
    const map = {
      posSearch: "اكتب كود المنتج أو امسح الباركود بالكاميرا...",
      customerName: "اسم الزبون",
      customerPhone: "رقم الزبون",
      invoiceNotes: "ملاحظات اختيارية",
      prodName: "الصنف",
      prodCode: "كود المنتج / الباركود",
      prodStock: "الكمية",
      prodCost: "السعر بالجملة",
      prodPrice: "السعر للبيع",
      purchaseSupplier: "اسم المورد / التاجر",
      purchaseAmount: "إجمالي فاتورة المشتريات",
      purchaseNotes: "الصنف، الكمية، السعر بالجملة، أو ملاحظات",
      accountTypeInput: "اسم الحساب",
      accountOwnerInput: "رقم الحساب / رقم التحويل",
      paymentInfoInput: "أضف الحسابات من الأسفل، وستظهر في فاتورة المبيعات"
    };

    Object.entries(map).forEach(([id, val]) => {
      const el = $(id);
      if (el) el.placeholder = val;
    });
  }

  function addPaymentAccountSelectToPos() {
    if ($("posTransferAccount")) return;

    const payment = $("paymentMethod");
    if (!payment) return;

    const wrap = document.createElement("div");
    wrap.id = "posTransferAccountWrap";
    wrap.innerHTML = `
      <select id="posTransferAccount" class="input">
        <option value="cash">كاش</option>
      </select>
    `;

    payment.insertAdjacentElement("afterend", wrap);

    payment.addEventListener("change", () => {
      const select = $("posTransferAccount");
      if (!select) return;

      if (payment.value === "cash") {
        select.value = "cash";
      } else if (select.value === "cash") {
        const firstAccount = qa("option", select).find(o => o.value !== "cash");
        if (firstAccount) select.value = firstAccount.value;
      }
    });

    fillPaymentAccountsSelect();
  }

  async function getTransferAccountsSafe() {
    try {
      const row = await readIndexedDbItem("meta", "transferAccounts");
      return Array.isArray(row?.items) ? row.items : [];
    } catch {
      return [];
    }
  }

  async function fillPaymentAccountsSelect() {
    const select = $("posTransferAccount");
    if (!select) return;

    const current = select.value;
    const accounts = await getTransferAccountsSafe();

    select.innerHTML = `<option value="cash">كاش</option>`;

    accounts.forEach(acc => {
      const type = acc.type || "";
      const owner = acc.owner || "";
      const option = document.createElement("option");
      option.value = `${type}|||${owner}`;
      option.textContent = `${type} - ${owner}`;
      select.appendChild(option);
    });

    if (current && qa("option", select).some(o => o.value === current)) select.value = current;
  }

  async function readIndexedDbAll(storeName) {
    return new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onerror = () => resolve([]);

        req.onsuccess = () => {
          try {
            const db = req.result;
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const allReq = store.getAll();

            allReq.onsuccess = () => resolve(allReq.result || []);
            allReq.onerror = () => resolve([]);
          } catch {
            resolve([]);
          }
        };

        req.onupgradeneeded = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async function readIndexedDbItem(storeName, id) {
    return new Promise(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onerror = () => resolve(null);

        req.onsuccess = () => {
          try {
            const db = req.result;
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const getReq = store.get(id);

            getReq.onsuccess = () => resolve(getReq.result || null);
            getReq.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        };

        req.onupgradeneeded = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function writeIndexedDbItem(storeName, value) {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onerror = () => reject(req.error);

        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, "readwrite");
          const store = tx.objectStore(storeName);
          const putReq = store.put(value);

          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };

        req.onupgradeneeded = () => resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  async function getInvoicesSafe() {
    if (typeof window.getAllInvoices === "function") {
      try {
        return await window.getAllInvoices();
      } catch {}
    }
    return readIndexedDbAll("invoices");
  }

  async function getProductsSafe() {
    if (typeof window.getAllProducts === "function") {
      try {
        return await window.getAllProducts();
      } catch {}
    }
    return readIndexedDbAll("products");
  }

  async function getPurchasesSafe() {
    if (typeof window.getAllPurchases === "function") {
      try {
        return await window.getAllPurchases();
      } catch {}
    }
    return readIndexedDbAll("purchases");
  }

  function addCustomersNavButton() {
    if (q('[data-tab="customers"]')) return;

    const navWrap = $("navButtonsWrap");
    const invoicesBtn = q('[data-tab="invoices"]');

    if (!navWrap) return;

    const btn = document.createElement("button");
    btn.className = "nav-btn flex items-center gap-3 p-3 rounded-xl transition w-full whitespace-nowrap";
    btn.dataset.tab = "customers";
    btn.type = "button";
    btn.innerHTML = `<i data-lucide="users"></i> <span>العملاء</span>`;
    btn.addEventListener("click", openCustomersTab);

    if (invoicesBtn?.nextSibling) navWrap.insertBefore(btn, invoicesBtn.nextSibling);
    else navWrap.appendChild(btn);

    window.lucide?.createIcons?.();
  }

  function addCustomersSection() {
    if ($("tab-customers")) return;

    const main = q("#mainApp main") || q("main");
    if (!main) return;

    const section = document.createElement("section");
    section.id = "tab-customers";
    section.className = "tab-content hidden space-y-6";
    section.innerHTML = `
      <div class="flex flex-wrap justify-between items-center gap-4">
        <h2 class="text-2xl font-bold">العملاء</h2>
        <input id="patchCustomersSearch" class="input-bordered max-w-md" placeholder="بحث باسم الزبون أو رقم الزبون">
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="card p-5 bg-blue-700 text-white">
          <p class="opacity-80">عدد العملاء</p>
          <h3 id="patchCustomersCount" class="text-3xl font-bold mt-2">0</h3>
        </div>
        <div class="card p-5 bg-green-600 text-white">
          <p class="opacity-80">إجمالي المدفوع</p>
          <h3 id="patchCustomersPaid" class="text-3xl font-bold mt-2">0.00 ₪</h3>
        </div>
        <div class="card p-5 bg-red-600 text-white">
          <p class="opacity-80">إجمالي غير مكتمل</p>
          <h3 id="patchCustomersUnpaid" class="text-3xl font-bold mt-2">0.00 ₪</h3>
        </div>
      </div>

      <div class="card p-4 overflow-x-auto">
        <table class="w-full text-right">
          <thead class="bg-gray-50 text-gray-500">
            <tr>
              <th class="p-4">اسم الزبون</th>
              <th class="p-4">رقم الزبون</th>
              <th class="p-4">عدد الفواتير</th>
              <th class="p-4">المدفوع</th>
              <th class="p-4">غير مكتمل</th>
              <th class="p-4">الإجمالي</th>
              <th class="p-4">الإجراءات</th>
            </tr>
          </thead>
          <tbody id="patchCustomersTable"></tbody>
        </table>
      </div>
    `;

    main.appendChild(section);

    $("patchCustomersSearch")?.addEventListener("input", renderCustomersTab);
  }

  async function openCustomersTab() {
    qa(".tab-content").forEach(el => el.classList.add("hidden"));
    qa(".nav-btn").forEach(btn => btn.classList.remove("active"));

    $("tab-customers")?.classList.remove("hidden");
    q('[data-tab="customers"]')?.classList.add("active");

    updateBottomActive("customers");
    closeSideNav();
    await renderCustomersTab();

    window.lucide?.createIcons?.();
  }

  async function renderCustomersTab() {
    const tbody = $("patchCustomersTable");
    if (!tbody) return;

    const search = ($("patchCustomersSearch")?.value || "").trim().toLowerCase();
    const invoices = await getInvoicesSafe();
    const map = new Map();

    invoices.forEach(inv => {
      const name = String(inv.customer || "بدون اسم").trim();
      const phone = String(inv.phone || "").trim();
      const key = `${name}__${phone}`;

      if (search && !name.toLowerCase().includes(search) && !phone.toLowerCase().includes(search)) return;

      if (!map.has(key)) {
        map.set(key, {
          name,
          phone,
          count: 0,
          paid: 0,
          unpaid: 0,
          total: 0
        });
      }

      const row = map.get(key);
      const amount = Number(inv.total || 0);

      row.count += 1;
      row.total += amount;

      if ((inv.status || "paid") === "paid") row.paid += amount;
      else row.unpaid += amount;
    });

    const customers = Array.from(map.values()).sort((a, b) => b.total - a.total);
    const totalPaid = customers.reduce((s, c) => s + c.paid, 0);
    const totalUnpaid = customers.reduce((s, c) => s + c.unpaid, 0);

    if ($("patchCustomersCount")) $("patchCustomersCount").textContent = String(customers.length);
    if ($("patchCustomersPaid")) $("patchCustomersPaid").textContent = money(totalPaid);
    if ($("patchCustomersUnpaid")) $("patchCustomersUnpaid").textContent = money(totalUnpaid);

    if (!customers.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-gray-400">لا يوجد عملاء بعد</td></tr>`;
      return;
    }

    tbody.innerHTML = customers.map(c => `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4 font-bold">${escapeHtml(c.name)}</td>
        <td class="p-4 text-sm">${escapeHtml(c.phone || "-")}</td>
        <td class="p-4">${c.count}</td>
        <td class="p-4 font-bold text-green-700">${money(c.paid)}</td>
        <td class="p-4 font-bold text-red-600">${money(c.unpaid)}</td>
        <td class="p-4 font-bold text-blue-700">${money(c.total)}</td>
        <td class="p-4">
          <button onclick="openCustomerHistory('${escapeJs(c.name)}','${escapeJs(c.phone)}')" class="text-blue-600 bg-blue-50 px-3 py-1 rounded-lg text-xs font-bold">السجل</button>
        </td>
      </tr>
    `).join("");
  }

  function addExpensesPage() {
    if ($("tab-expenses")) return;

    const navWrap = $("navButtonsWrap");
    const reportsBtn = q('[data-tab="reports"]');

    if (navWrap && !q('[data-tab="expenses"]')) {
      const btn = document.createElement("button");
      btn.className = "nav-btn flex items-center gap-3 p-3 rounded-xl transition w-full whitespace-nowrap";
      btn.dataset.tab = "expenses";
      btn.type = "button";
      btn.innerHTML = `<i data-lucide="wallet-cards"></i> <span>المصروفات</span>`;
      btn.addEventListener("click", openExpensesTab);

      if (reportsBtn?.nextSibling) navWrap.insertBefore(btn, reportsBtn.nextSibling);
      else navWrap.appendChild(btn);
    }

    const main = q("#mainApp main") || q("main");
    if (!main) return;

    const section = document.createElement("section");
    section.id = "tab-expenses";
    section.className = "tab-content hidden space-y-6";
    section.innerHTML = `
      <div class="flex flex-wrap justify-between items-center gap-4">
        <h2 class="text-2xl font-bold">المصروفات</h2>
        <div class="patch-table-actions">
          <select id="patchExpensesFilter" class="input-bordered">
            <option value="day">اليوم</option>
            <option value="week">الأسبوع</option>
            <option value="month">الشهر</option>
            <option value="year">السنة</option>
            <option value="all">كل السجل</option>
          </select>
          <button id="openExpenseModalBtn" class="btn-primary px-5 py-3 rounded-2xl flex items-center gap-2 shadow-md">
            <i data-lucide="plus"></i> إضافة مصروف
          </button>
        </div>
      </div>

      <div class="patch-grid-stats">
        <div class="patch-stat" style="background:#dc2626">
          <p>إجمالي المصروفات</p>
          <h3 id="patchExpensesTotal">0.00 ₪</h3>
        </div>
        <div class="patch-stat" style="background:#0f172a">
          <p>عدد العمليات</p>
          <h3 id="patchExpensesCount">0</h3>
        </div>
        <div class="patch-stat" style="background:#1d4ed8">
          <p>الفترة</p>
          <h3 id="patchExpensesRangeLabel">اليوم</h3>
        </div>
        <div class="patch-stat" style="background:#16a34a">
          <p>تخصم من الأرباح</p>
          <h3>نعم</h3>
        </div>
      </div>

      <div class="card p-4">
        <div class="patch-table-actions mb-4">
          <button class="patch-mini-btn dark" onclick="window.patchExportExpenses('print')">طباعة</button>
          <button class="patch-mini-btn red" onclick="window.patchExportExpenses('pdf')">PDF</button>
          <button class="patch-mini-btn green" onclick="window.patchExportExpenses('image')">صورة</button>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-right">
            <thead class="bg-gray-50 text-gray-500">
              <tr>
                <th class="p-4">التاريخ</th>
                <th class="p-4">الاسم</th>
                <th class="p-4">المبلغ</th>
                <th class="p-4">ملاحظات</th>
                <th class="p-4">الإجراءات</th>
              </tr>
            </thead>
            <tbody id="patchExpensesTable"></tbody>
          </table>
        </div>
      </div>
    `;

    main.appendChild(section);

    const modal = document.createElement("div");
    modal.id = "patchExpenseModal";
    modal.className = "modal-wrap hidden patch-modal-fixed";
    modal.innerHTML = `
      <div class="modal-card max-w-lg p-8">
        <h3 id="patchExpenseModalTitle" class="text-xl font-bold mb-6">إضافة مصروف</h3>
        <input type="hidden" id="patchEditExpenseId">

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-bold mb-2">الاسم</label>
            <input id="patchExpenseName" class="input-bordered" placeholder="مثال: أجار، كهرباء، مواصلات">
          </div>

          <div>
            <label class="block text-sm font-bold mb-2">المبلغ</label>
            <input id="patchExpenseAmount" type="number" step="0.01" class="input-bordered" placeholder="0.00">
          </div>

          <div>
            <label class="block text-sm font-bold mb-2">ملاحظات</label>
            <textarea id="patchExpenseNotes" rows="4" class="input-bordered" placeholder="ملاحظات اختيارية"></textarea>
          </div>

          <div class="grid grid-cols-2 gap-3 pt-2">
            <button id="patchSaveExpenseBtn" class="btn-primary py-3">حفظ</button>
            <button type="button" onclick="toggleModal('patchExpenseModal', false)" class="bg-gray-100 py-3 rounded-xl font-bold">إلغاء</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    $("openExpenseModalBtn")?.addEventListener("click", openExpenseModal);
    $("patchSaveExpenseBtn")?.addEventListener("click", saveExpense);
    $("patchExpensesFilter")?.addEventListener("change", renderExpensesTab);

    window.lucide?.createIcons?.();
  }

  async function openExpensesTab() {
    qa(".tab-content").forEach(el => el.classList.add("hidden"));
    qa(".nav-btn").forEach(btn => btn.classList.remove("active"));

    $("tab-expenses")?.classList.remove("hidden");
    q('[data-tab="expenses"]')?.classList.add("active");

    closeSideNav();
    await renderExpensesTab();

    window.lucide?.createIcons?.();
  }

  function openExpenseModal() {
    if ($("patchExpenseModalTitle")) $("patchExpenseModalTitle").textContent = "إضافة مصروف";
    if ($("patchEditExpenseId")) $("patchEditExpenseId").value = "";
    if ($("patchExpenseName")) $("patchExpenseName").value = "";
    if ($("patchExpenseAmount")) $("patchExpenseAmount").value = "";
    if ($("patchExpenseNotes")) $("patchExpenseNotes").value = "";

    window.toggleModal?.("patchExpenseModal", true);
    fixAllModals();
  }

  function saveExpense() {
    const editId = $("patchEditExpenseId")?.value || "";
    const name = $("patchExpenseName")?.value.trim() || "";
    const amount = Number($("patchExpenseAmount")?.value || 0);
    const notes = $("patchExpenseNotes")?.value.trim() || "";

    if (!name || amount <= 0) {
      alert("أدخل اسم المصروف والمبلغ");
      return;
    }

    const expenses = getExpenses();
    const old = expenses.find(x => x.id === editId);

    const payload = {
      id: editId || `exp_${Date.now()}`,
      name,
      amount,
      notes,
      createdAt: old?.createdAt || nowIso(),
      updatedAt: nowIso()
    };

    const next = old
      ? expenses.map(x => x.id === editId ? payload : x)
      : [payload, ...expenses];

    setExpenses(next);
    addOutboxOperation("حفظ مصروف");

    window.toggleModal?.("patchExpenseModal", false);
    toast("تم حفظ المصروف وخصمه من الأرباح");
    renderExpensesTab();
    patchReportsCards();
    patchMainReportProfit();
    maybeAutoSyncAfterMutation();
  }

  function editExpense(id) {
    const item = getExpenses().find(x => x.id === id);
    if (!item) return;

    if ($("patchExpenseModalTitle")) $("patchExpenseModalTitle").textContent = "تعديل مصروف";
    if ($("patchEditExpenseId")) $("patchEditExpenseId").value = item.id;
    if ($("patchExpenseName")) $("patchExpenseName").value = item.name || "";
    if ($("patchExpenseAmount")) $("patchExpenseAmount").value = Number(item.amount || 0);
    if ($("patchExpenseNotes")) $("patchExpenseNotes").value = item.notes || "";

    window.toggleModal?.("patchExpenseModal", true);
    fixAllModals();
  }

  function deleteExpense(id) {
    if (!confirm("حذف المصروف؟")) return;

    setExpenses(getExpenses().filter(x => x.id !== id));
    addOutboxOperation("حذف مصروف");

    toast("تم حذف المصروف");
    renderExpensesTab();
    patchReportsCards();
    patchMainReportProfit();
    maybeAutoSyncAfterMutation();
  }

  async function renderExpensesTab() {
    const tbody = $("patchExpensesTable");
    if (!tbody) return;

    const filter = $("patchExpensesFilter")?.value || "day";
    const items = getExpenses()
      .filter(x => inRange(x.createdAt, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = items.reduce((s, x) => s + Number(x.amount || 0), 0);

    const labels = {
      day: "اليوم",
      week: "الأسبوع",
      month: "الشهر",
      year: "السنة",
      all: "كل السجل"
    };

    if ($("patchExpensesTotal")) $("patchExpensesTotal").textContent = money(total);
    if ($("patchExpensesCount")) $("patchExpensesCount").textContent = String(items.length);
    if ($("patchExpensesRangeLabel")) $("patchExpensesRangeLabel").textContent = labels[filter] || "اليوم";

    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-400">لا توجد مصروفات</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(item => `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4 text-xs text-gray-500">${new Date(item.createdAt).toLocaleString("ar-EG")}</td>
        <td class="p-4 font-bold">${escapeHtml(item.name)}</td>
        <td class="p-4 font-bold text-red-600">${money(item.amount)}</td>
        <td class="p-4 text-sm">${escapeHtml(item.notes || "-")}</td>
        <td class="p-4">
          <div class="patch-table-actions">
            <button class="patch-mini-btn" onclick="window.patchEditExpense('${item.id}')">تعديل</button>
            <button class="patch-mini-btn red" onclick="window.patchDeleteExpense('${item.id}')">حذف</button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function addAdvancedReportsPage() {
    if ($("patchAdvancedReports")) return;

    const reports = $("tab-reports");
    if (!reports) return;

    const box = document.createElement("div");
    box.id = "patchAdvancedReports";
    box.className = "space-y-6";
    box.innerHTML = `
      <div class="card p-4">
        <div class="flex flex-wrap justify-between items-center gap-3 mb-4">
          <h3 class="text-xl font-bold">تقارير تفصيلية</h3>
          <div class="patch-table-actions">
            <select id="patchReportsFilter" class="input-bordered">
              <option value="day">اليوم</option>
              <option value="week">الأسبوع</option>
              <option value="month">الشهر</option>
              <option value="year">السنة</option>
              <option value="all">كل السجل</option>
            </select>
            <button class="patch-mini-btn dark" onclick="window.patchExportAdvancedReports('print')">طباعة</button>
            <button class="patch-mini-btn red" onclick="window.patchExportAdvancedReports('pdf')">PDF</button>
            <button class="patch-mini-btn green" onclick="window.patchExportAdvancedReports('image')">صورة</button>
          </div>
        </div>

        <div class="patch-grid-stats">
          <div class="patch-stat" style="background:#1d4ed8">
            <p>المبيعات</p>
            <h3 id="patchRepSales">0.00 ₪</h3>
          </div>
          <div class="patch-stat" style="background:#16a34a">
            <p>الربح قبل المصروفات</p>
            <h3 id="patchRepProfitBefore">0.00 ₪</h3>
          </div>
          <div class="patch-stat" style="background:#dc2626">
            <p>المصروفات</p>
            <h3 id="patchRepExpenses">0.00 ₪</h3>
          </div>
          <div class="patch-stat" style="background:#0f172a">
            <p>صافي الربح بعد المصروفات</p>
            <h3 id="patchRepNetProfit">0.00 ₪</h3>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div class="card p-4">
          <div class="flex justify-between items-center gap-2 mb-4">
            <h3 class="text-lg font-bold">البضاعة الناقصة</h3>
            <button class="patch-mini-btn" onclick="window.patchExportLowStock('print')">طباعة</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-right">
              <thead class="bg-gray-50 text-gray-500">
                <tr>
                  <th class="p-3">الصنف</th>
                  <th class="p-3">الكود</th>
                  <th class="p-3">الكمية</th>
                  <th class="p-3">سعر البيع</th>
                </tr>
              </thead>
              <tbody id="patchLowStockTable"></tbody>
            </table>
          </div>
        </div>

        <div class="card p-4">
          <div class="flex justify-between items-center gap-2 mb-4">
            <h3 class="text-lg font-bold">أرصدة حسابات الدفع</h3>
            <button class="patch-mini-btn" onclick="window.patchExportPaymentBalances('print')">طباعة</button>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-right">
              <thead class="bg-gray-50 text-gray-500">
                <tr>
                  <th class="p-3">الحساب</th>
                  <th class="p-3">الرصيد من المبيعات</th>
                  <th class="p-3">عدد العمليات</th>
                </tr>
              </thead>
              <tbody id="patchPaymentBalancesTable"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    reports.appendChild(box);

    $("patchReportsFilter")?.addEventListener("change", () => {
      patchReportsCards();
      patchMainReportProfit();
    });
  }

  async function patchReportsCards() {
    const filter = $("patchReportsFilter")?.value || $("reportFilter")?.value || "day";

    const invoices = await getInvoicesSafe();
    const products = await getProductsSafe();

    const filteredInvoices = invoices.filter(inv => inRange(inv.date || inv.createdAt, filter));
    const sales = filteredInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
    const cost = filteredInvoices.reduce((s, inv) => s + Number(inv.totalCost || 0), 0);
    const profitBefore = sales - cost;

    const expenses = getExpenses()
      .filter(exp => inRange(exp.createdAt, filter))
      .reduce((s, exp) => s + Number(exp.amount || 0), 0);

    const netProfit = profitBefore - expenses;

    if ($("patchRepSales")) $("patchRepSales").textContent = money(sales);
    if ($("patchRepProfitBefore")) $("patchRepProfitBefore").textContent = money(profitBefore);
    if ($("patchRepExpenses")) $("patchRepExpenses").textContent = money(expenses);
    if ($("patchRepNetProfit")) $("patchRepNetProfit").textContent = money(netProfit);

    renderLowStockTable(products);
    renderPaymentBalances(filteredInvoices);
  }

  async function patchMainReportProfit() {
    const filter = $("reportFilter")?.value || "today";
    const invoices = await getInvoicesSafe();

    let sales = 0;
    let cost = 0;

    invoices.forEach(inv => {
      if (!inRange(inv.date || inv.createdAt, filter)) return;
      sales += Number(inv.total || 0);
      cost += Number(inv.totalCost || 0);
    });

    const expenses = getExpenses()
      .filter(exp => inRange(exp.createdAt, filter))
      .reduce((s, exp) => s + Number(exp.amount || 0), 0);

    const netProfit = sales - cost - expenses;

    if ($("repTotalProfit")) {
      $("repTotalProfit").textContent = money(netProfit);

      const card = $("repTotalProfit").closest(".card");
      if (card) {
        let note = card.querySelector(".patch-expense-profit-note");
        if (!note) {
          note = document.createElement("span");
          note.className = "patch-expense-profit-note";
          card.appendChild(note);
        }
        note.textContent = `بعد خصم المصروفات: ${money(expenses)}`;
      }
    }
  }

  function renderLowStockTable(products) {
    const tbody = $("patchLowStockTable");
    if (!tbody) return;

    const low = products
      .filter(p => Number(p.stock || 0) <= 5)
      .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));

    if (!low.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-gray-400">لا توجد بضاعة ناقصة</td></tr>`;
      return;
    }

    tbody.innerHTML = low.map(p => `
      <tr class="border-b">
        <td class="p-3 font-bold">${escapeHtml(p.name || "-")}</td>
        <td class="p-3 text-xs">${escapeHtml(p.code || "-")}</td>
        <td class="p-3 font-bold text-red-600">${Number(p.stock || 0)}</td>
        <td class="p-3">${money(p.price)}</td>
      </tr>
    `).join("");
  }

  function renderPaymentBalances(invoices) {
    const tbody = $("patchPaymentBalancesTable");
    if (!tbody) return;

    const map = new Map();

    invoices.forEach(inv => {
      let account = buildPaymentAccountLabel(inv);

      if (!account || account === "-") {
        account = paymentLabel(inv.payment || "cash");
      }

      if (!map.has(account)) {
        map.set(account, { account, total: 0, count: 0 });
      }

      const row = map.get(account);
      row.total += Number(inv.total || 0);
      row.count += 1;
    });

    const rows = Array.from(map.values()).sort((a, b) => b.total - a.total);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="p-6 text-center text-gray-400">لا توجد أرصدة</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(row => `
      <tr class="border-b">
        <td class="p-3 font-bold">${escapeHtml(row.account)}</td>
        <td class="p-3 font-bold text-blue-700">${money(row.total)}</td>
        <td class="p-3">${row.count}</td>
      </tr>
    `).join("");
  }

  function paymentLabel(value) {
    const map = {
      cash: "كاش",
      account: "حساب دفع",
      bank: "بنك",
      jawwalpay: "جوال باي",
      app: "تطبيق دفع"
    };
    return map[value] || value || "-";
  }

  function buildPaymentAccountLabel(inv) {
    if (inv.transferAccountType && inv.transferAccountName) {
      return `${inv.transferAccountType} - ${inv.transferAccountName}`;
    }

    if (inv.transferAccountType) return inv.transferAccountType;
    if (inv.transferAccountName) return inv.transferAccountName;

    return "-";
  }

  function addDetailedPurchasesUi() {
    const modal = $("purchaseModal");
    if (!modal || $("patchPurchaseItemsBox")) return;

    const amountInput = $("purchaseAmount");
    const notesInput = $("purchaseNotes");

    if (amountInput) amountInput.placeholder = "يتم حسابه تلقائياً من الأصناف";

    const box = document.createElement("div");
    box.id = "patchPurchaseItemsBox";
    box.className = "border rounded-2xl p-4 space-y-3";
    box.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="font-bold">أصناف فاتورة المشتريات</div>
        <button type="button" id="patchAddPurchaseItemBtn" class="patch-mini-btn">إضافة صنف</button>
      </div>

      <div id="patchPurchaseRows" class="space-y-3"></div>

      <div class="bg-blue-50 text-blue-700 p-3 rounded-xl font-bold text-sm">
        الإجمالي: <span id="patchPurchaseTotal">0.00 ₪</span>
      </div>

      <p class="text-xs text-gray-500">
        عند الحفظ يتم إدخال الأصناف إلى المخزون وربط سعر الجملة وسعر البيع.
      </p>
    `;

    if (notesInput) notesInput.parentElement.insertAdjacentElement("beforebegin", box);
    else amountInput?.parentElement.insertAdjacentElement("afterend", box);

    $("patchAddPurchaseItemBtn")?.addEventListener("click", () => addPurchaseRow());
    addPurchaseRow();
  }

  function addPurchaseRow(data = {}) {
    const rows = $("patchPurchaseRows");
    if (!rows) return;

    const row = document.createElement("div");
    row.className = "patch-purchase-row";
    row.innerHTML = `
      <input class="input-bordered patch-pur-name" placeholder="الصنف" value="${escapeHtmlAttr(data.name || "")}">
      <input class="input-bordered patch-pur-code" placeholder="كود / باركود" value="${escapeHtmlAttr(data.code || "")}">
      <input type="number" class="input-bordered patch-pur-qty" placeholder="الكمية" value="${escapeHtmlAttr(data.qty || "")}">
      <input type="number" step="0.01" class="input-bordered patch-pur-cost" placeholder="سعر الجملة" value="${escapeHtmlAttr(data.cost || "")}">
      <input type="number" step="0.01" class="input-bordered patch-pur-price" placeholder="سعر البيع" value="${escapeHtmlAttr(data.price || "")}">
      <button type="button" class="patch-mini-btn red patch-pur-remove">×</button>
    `;

    rows.appendChild(row);

    row.querySelector(".patch-pur-remove").addEventListener("click", () => {
      row.remove();
      updatePurchaseTotal();
    });

    qa("input", row).forEach(input => {
      input.addEventListener("input", updatePurchaseTotal);
    });

    updatePurchaseTotal();
  }

  function getPurchaseRows() {
    return qa("#patchPurchaseRows .patch-purchase-row")
      .map(row => ({
        name: row.querySelector(".patch-pur-name")?.value.trim() || "",
        code: row.querySelector(".patch-pur-code")?.value.trim() || "",
        qty: Number(row.querySelector(".patch-pur-qty")?.value || 0),
        cost: Number(row.querySelector(".patch-pur-cost")?.value || 0),
        price: Number(row.querySelector(".patch-pur-price")?.value || 0)
      }))
      .filter(item => item.name && item.qty > 0);
  }

  function updatePurchaseTotal() {
    const rows = getPurchaseRows();
    const total = rows.reduce((s, i) => s + i.qty * i.cost, 0);

    if ($("patchPurchaseTotal")) $("patchPurchaseTotal").textContent = money(total);
    if ($("purchaseAmount")) $("purchaseAmount").value = total ? total.toFixed(2) : "";
  }

  async function savePurchaseItemsToInventory(purchaseId, supplier) {
    const rows = getPurchaseRows();
    if (!rows.length) return;

    const existingProducts = await getProductsSafe();
    const purchaseItems = getPurchaseItems();

    for (const item of rows) {
      const code = item.code || `PUR-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
      const found = existingProducts.find(p => String(p.code || "").trim() === String(code).trim());

      if (found) {
        const updated = {
          ...found,
          supplier,
          stock: Number(found.stock || 0) + Number(item.qty || 0),
          cost: Number(item.cost || found.cost || 0),
          price: Number(item.price || found.price || 0),
          updatedAt: nowIso()
        };

        await writeIndexedDbItem("products", updated);
      } else {
        const product = {
          id: `p_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          storeId: localStorage.getItem("activeStoreId") || "default",
          supplier,
          name: item.name,
          code,
          stock: Number(item.qty || 0),
          cost: Number(item.cost || 0),
          price: Number(item.price || 0),
          variants: [],
          createdAt: nowIso()
        };

        await writeIndexedDbItem("products", product);
      }

      purchaseItems.push({
        id: `pur_item_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        purchaseId,
        supplier,
        name: item.name,
        code,
        qty: item.qty,
        cost: item.cost,
        price: item.price,
        total: item.qty * item.cost,
        createdAt: nowIso()
      });
    }

    setPurchaseItems(purchaseItems);
    addOutboxOperation("إضافة مشتريات للمخزون");
  }

  function resetPurchaseRows() {
    const rows = $("patchPurchaseRows");
    if (!rows) return;

    rows.innerHTML = "";
    addPurchaseRow();
    updatePurchaseTotal();
  }

  function addMerchantPaymentsPage() {
    if ($("tab-merchants")) return;

    const navWrap = $("navButtonsWrap");
    const purchasesBtn = q('[data-tab="purchases"]');

    if (navWrap && !q('[data-tab="merchants"]')) {
      const btn = document.createElement("button");
      btn.className = "nav-btn flex items-center gap-3 p-3 rounded-xl transition w-full whitespace-nowrap";
      btn.dataset.tab = "merchants";
      btn.type = "button";
      btn.innerHTML = `<i data-lucide="hand-coins"></i> <span>دفعات التجار</span>`;
      btn.addEventListener("click", openMerchantsTab);

      if (purchasesBtn?.nextSibling) navWrap.insertBefore(btn, purchasesBtn.nextSibling);
      else navWrap.appendChild(btn);
    }

    const main = q("#mainApp main") || q("main");
    if (!main) return;

    const section = document.createElement("section");
    section.id = "tab-merchants";
    section.className = "tab-content hidden space-y-6";
    section.innerHTML = `
      <div class="flex flex-wrap justify-between items-center gap-4">
        <h2 class="text-2xl font-bold">دفعات التجار</h2>
        <button id="openMerchantPaymentModalBtn" class="btn-primary px-5 py-3 rounded-2xl flex items-center gap-2">
          <i data-lucide="plus"></i> إضافة دفعة
        </button>
      </div>

      <div class="card p-4 overflow-x-auto">
        <table class="w-full text-right">
          <thead class="bg-gray-50 text-gray-500">
            <tr>
              <th class="p-4">التاريخ</th>
              <th class="p-4">اسم التاجر</th>
              <th class="p-4">المبلغ</th>
              <th class="p-4">ملاحظات</th>
              <th class="p-4">الإجراءات</th>
            </tr>
          </thead>
          <tbody id="patchMerchantPaymentsTable"></tbody>
        </table>
      </div>
    `;

    main.appendChild(section);

    const modal = document.createElement("div");
    modal.id = "patchMerchantPaymentModal";
    modal.className = "modal-wrap hidden patch-modal-fixed";
    modal.innerHTML = `
      <div class="modal-card max-w-lg p-8">
        <h3 class="text-xl font-bold mb-6">إضافة دفعة لتاجر</h3>
        <input type="hidden" id="patchMerchantPaymentId">
        <div class="space-y-4">
          <input id="patchMerchantName" class="input-bordered" placeholder="اسم التاجر / المورد">
          <input id="patchMerchantAmount" type="number" step="0.01" class="input-bordered" placeholder="المبلغ">
          <textarea id="patchMerchantNotes" rows="4" class="input-bordered" placeholder="ملاحظات"></textarea>
          <div class="grid grid-cols-2 gap-3">
            <button id="patchSaveMerchantPaymentBtn" class="btn-primary py-3">حفظ</button>
            <button type="button" onclick="toggleModal('patchMerchantPaymentModal', false)" class="bg-gray-100 py-3 rounded-xl font-bold">إلغاء</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    $("openMerchantPaymentModalBtn")?.addEventListener("click", openMerchantPaymentModal);
    $("patchSaveMerchantPaymentBtn")?.addEventListener("click", saveMerchantPayment);

    window.lucide?.createIcons?.();
  }

  async function openMerchantsTab() {
    qa(".tab-content").forEach(el => el.classList.add("hidden"));
    qa(".nav-btn").forEach(btn => btn.classList.remove("active"));

    $("tab-merchants")?.classList.remove("hidden");
    q('[data-tab="merchants"]')?.classList.add("active");

    closeSideNav();
    renderMerchantPayments();
  }

  function openMerchantPaymentModal() {
    $("patchMerchantPaymentId").value = "";
    $("patchMerchantName").value = "";
    $("patchMerchantAmount").value = "";
    $("patchMerchantNotes").value = "";
    window.toggleModal?.("patchMerchantPaymentModal", true);
    fixAllModals();
  }

  function saveMerchantPayment() {
    const id = $("patchMerchantPaymentId")?.value || `mp_${Date.now()}`;
    const merchant = $("patchMerchantName")?.value.trim() || "";
    const amount = Number($("patchMerchantAmount")?.value || 0);
    const notes = $("patchMerchantNotes")?.value.trim() || "";

    if (!merchant || amount <= 0) {
      alert("أدخل اسم التاجر والمبلغ");
      return;
    }

    const items = getMerchantPayments();
    const old = items.find(x => x.id === id);

    const payload = {
      id,
      merchant,
      amount,
      notes,
      createdAt: old?.createdAt || nowIso(),
      updatedAt: nowIso()
    };

    const next = old ? items.map(x => x.id === id ? payload : x) : [payload, ...items];
    setMerchantPayments(next);

    addOutboxOperation("دفعة تاجر");
    window.toggleModal?.("patchMerchantPaymentModal", false);
    toast("تم حفظ دفعة التاجر");
    renderMerchantPayments();
    maybeAutoSyncAfterMutation();
  }

  function renderMerchantPayments() {
    const tbody = $("patchMerchantPaymentsTable");
    if (!tbody) return;

    const items = getMerchantPayments().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-400">لا توجد دفعات</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(item => `
      <tr class="border-b">
        <td class="p-4 text-xs text-gray-500">${new Date(item.createdAt).toLocaleString("ar-EG")}</td>
        <td class="p-4 font-bold">${escapeHtml(item.merchant)}</td>
        <td class="p-4 font-bold text-blue-700">${money(item.amount)}</td>
        <td class="p-4">${escapeHtml(item.notes || "-")}</td>
        <td class="p-4">
          <button class="patch-mini-btn red" onclick="window.patchDeleteMerchantPayment('${item.id}')">حذف</button>
        </td>
      </tr>
    `).join("");
  }

  function deleteMerchantPayment(id) {
    if (!confirm("حذف الدفعة؟")) return;
    setMerchantPayments(getMerchantPayments().filter(x => x.id !== id));
    addOutboxOperation("حذف دفعة تاجر");
    renderMerchantPayments();
    maybeAutoSyncAfterMutation();
  }

  function createExportArea() {
    let area = $("patchExportArea");
    if (!area) {
      area = document.createElement("div");
      area.id = "patchExportArea";
      area.className = "patch-export-area";
      document.body.appendChild(area);
    }
    return area;
  }

  async function exportHtmlTable(title, headers, rows, type, filename = "report") {
    const area = createExportArea();

    area.innerHTML = `
      <div style="background:#fff;padding:24px;width:1200px;">
        <div class="patch-report-title">${escapeHtml(title)}</div>
        <div class="patch-muted">تاريخ التصدير: ${new Date().toLocaleString("ar-EG")}</div>
        <br>
        <table class="patch-print-table">
          <thead>
            <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(row => `
              <tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
            `).join("") : `<tr><td colspan="${headers.length}">لا توجد بيانات</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    if (type === "print") {
      const w = window.open("", "_blank");
      w.document.write(`
        <html dir="rtl">
          <head>
            <title>${escapeHtml(title)}</title>
            <style>
              body{font-family:Arial;padding:20px;direction:rtl}
              table{width:100%;border-collapse:collapse}
              th,td{border:1px solid #ddd;padding:10px;text-align:center}
              th{background:#eff6ff;color:#1d4ed8}
            </style>
          </head>
          <body>${area.innerHTML}</body>
        </html>
      `);
      w.document.close();
      w.focus();
      w.print();
      return;
    }

    const canvas = await html2canvas(area.firstElementChild, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true
    });

    if (type === "image") {
      const a = document.createElement("a");
      a.download = `${filename}_${Date.now()}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      return;
    }

    if (type === "pdf") {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [1200, 800]
      });

      const img = canvas.toDataURL("image/png");
      pdf.addImage(img, "PNG", 0, 0, 1200, 800);
      pdf.save(`${filename}_${Date.now()}.pdf`);
    }
  }

  async function exportExpenses(type) {
    const filter = $("patchExpensesFilter")?.value || "day";
    const rows = getExpenses()
      .filter(x => inRange(x.createdAt, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(x => [
        new Date(x.createdAt).toLocaleString("ar-EG"),
        x.name,
        money(x.amount),
        x.notes || "-"
      ]);

    await exportHtmlTable(
      "تقرير المصروفات",
      ["التاريخ", "الاسم", "المبلغ", "ملاحظات"],
      rows,
      type,
      "expenses"
    );
  }

  async function exportAdvancedReports(type) {
    const filter = $("patchReportsFilter")?.value || "day";
    const invoices = await getInvoicesSafe();

    const filtered = invoices.filter(inv => inRange(inv.date || inv.createdAt, filter));
    const sales = filtered.reduce((s, inv) => s + Number(inv.total || 0), 0);
    const cost = filtered.reduce((s, inv) => s + Number(inv.totalCost || 0), 0);
    const profitBefore = sales - cost;
    const expenses = getExpenses().filter(exp => inRange(exp.createdAt, filter)).reduce((s, exp) => s + Number(exp.amount || 0), 0);
    const netProfit = profitBefore - expenses;

    await exportHtmlTable(
      "تقرير الأرباح والمصروفات",
      ["البند", "القيمة"],
      [
        ["المبيعات", money(sales)],
        ["التكلفة", money(cost)],
        ["الربح قبل المصروفات", money(profitBefore)],
        ["المصروفات", money(expenses)],
        ["صافي الربح بعد المصروفات", money(netProfit)]
      ],
      type,
      "profits"
    );
  }

  async function exportLowStock(type) {
    const products = await getProductsSafe();
    const rows = products
      .filter(p => Number(p.stock || 0) <= 5)
      .map(p => [p.name || "-", p.code || "-", String(Number(p.stock || 0)), money(p.price)]);

    await exportHtmlTable(
      "تقرير البضاعة الناقصة",
      ["الصنف", "الكود", "الكمية", "سعر البيع"],
      rows,
      type,
      "low_stock"
    );
  }

  async function exportPaymentBalances(type) {
    const invoices = await getInvoicesSafe();
    const map = new Map();

    invoices.forEach(inv => {
      const account = buildPaymentAccountLabel(inv) || paymentLabel(inv.payment || "cash");

      if (!map.has(account)) {
        map.set(account, { account, total: 0, count: 0 });
      }

      const row = map.get(account);
      row.total += Number(inv.total || 0);
      row.count += 1;
    });

    const rows = Array.from(map.values()).map(x => [
      x.account,
      money(x.total),
      String(x.count)
    ]);

    await exportHtmlTable(
      "تقرير أرصدة حسابات الدفع",
      ["الحساب", "الرصيد", "عدد العمليات"],
      rows,
      type,
      "payment_balances"
    );
  }

  async function updateCompanyFromUi() {
    const sideName = $("sideStoreName")?.textContent?.trim();
    const logoSrc = $("sideLogo")?.getAttribute("src");

    const nameEl = $("patchCompanyName");
    const logo = $("patchCompanyLogo");
    const fallback = $("patchCompanyFallback");

    if (nameEl && sideName && sideName !== "اسم المحل") {
      nameEl.textContent = sideName;
    }

    if (logo && logoSrc) {
      logo.src = logoSrc;
      logo.classList.add("show");
      fallback?.classList.add("hidden");
    } else {
      logo?.classList.remove("show");
      fallback?.classList.remove("hidden");
    }
  }

  function patchSwitchTab() {
    if (window.__patchSwitchTabV4) return;
    window.__patchSwitchTabV4 = true;

    const oldSwitchTab = window.switchTab;

    window.switchTab = async function patchedSwitchTab(tabId) {
      if (tabId === "customers") return openCustomersTab();
      if (tabId === "expenses") return openExpensesTab();
      if (tabId === "merchants") return openMerchantsTab();

      let result;

      if (typeof oldSwitchTab === "function") {
        result = await oldSwitchTab.apply(this, arguments);
      }

      updateBottomActive(tabId);
      closeSideNav();

      setTimeout(() => {
        updateCompanyFromUi();
        updateNetworkUi();
        updateSyncBadge();
        fillPaymentAccountsSelect();
        hideOrShowPatchBars();
        fixAllModals();

        if (tabId === "reports") {
          patchReportsCards();
          patchMainReportProfit();
        }
      }, 120);

      return result;
    };
  }

  function patchDataMutations() {
    if (window.__patchMutationsV4) return;
    window.__patchMutationsV4 = true;

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
      const old = window[name];
      if (typeof old !== "function") return;

      window[name] = async function patchedMutation(...args) {
        if (name === "checkout") {
          applyPaymentAccountToCurrentInvoiceForm();
        }

        const result = await old.apply(this, args);

        if (name === "checkout") {
          await patchLastInvoicePaymentAccount();
        }

        if (name === "savePurchase") {
          const purId = $("editPurchaseId")?.value || `pur_${Date.now()}`;
          const supplier = $("purchaseSupplier")?.value.trim() || "";
          await savePurchaseItemsToInventory(purId, supplier);
          resetPurchaseRows();
        }

        if (name === "saveSettings") {
          await fillPaymentAccountsSelect();
        }

        if (isOnlineMode()) {
          addOutboxOperation(`تغيير من ${name}`);
          maybeAutoSyncAfterMutation();
        }

        setTimeout(() => {
          patchReportsCards();
          patchMainReportProfit();
          renderExpensesTab();
          updateSyncBadge();
        }, 300);

        return result;
      };
    });
  }

  function applyPaymentAccountToCurrentInvoiceForm() {
    const select = $("posTransferAccount");
    const payment = $("paymentMethod");

    if (!select || !payment) return;

    if (!select.value || select.value === "cash") {
      payment.value = "cash";
      sessionStorage.removeItem(`${PREFIX}_patch_last_payment_account`);
      return;
    }

    payment.value = "account";

    const [type, owner] = select.value.split("|||");

    try {
      sessionStorage.setItem(`${PREFIX}_patch_last_payment_account`, JSON.stringify({
        type: type || "",
        owner: owner || ""
      }));
    } catch {}
  }

  async function patchLastInvoicePaymentAccount() {
    const raw = sessionStorage.getItem(`${PREFIX}_patch_last_payment_account`);
    if (!raw) return;

    const acc = safeJsonParse(raw, null);
    if (!acc?.type && !acc?.owner) return;

    const invoices = await getInvoicesSafe();
    const latest = invoices
      .slice()
      .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))[0];

    if (!latest?.id) return;

    latest.payment = "account";
    latest.transferAccountType = acc.type || "";
    latest.transferAccountName = acc.owner || "";
    latest.updatedAt = nowIso();

    try {
      await writeIndexedDbItem("invoices", latest);
    } catch {}

    sessionStorage.removeItem(`${PREFIX}_patch_last_payment_account`);
  }

  function patchSaveEntityForInvoiceAccount() {
    if (window.__patchInvoiceAccountV4) return;
    window.__patchInvoiceAccountV4 = true;

    const oldViewInvoice = window.viewInvoice;

    if (typeof oldViewInvoice === "function") {
      window.viewInvoice = async function patchedViewInvoice(id) {
        const result = await oldViewInvoice.apply(this, arguments);
        setTimeout(() => {
          fillPaymentAccountsSelect();
        }, 100);
        return result;
      };
    }
  }

  function patchUploadSync() {
    if (window.__patchUploadSyncV4) return;
    window.__patchUploadSyncV4 = true;

    const oldUpload = window.uploadOfflineDataToCloud;

    if (typeof oldUpload === "function") {
      window.uploadOfflineDataToCloud = async function patchedUpload(...args) {
        await showSyncLoader("جاري تصدير البيانات للسحابة", "يتم رفع البيانات المحفوظة على الجهاز إلى Firebase");

        try {
          const result = await oldUpload.apply(this, args);
          clearOutbox();
          await finishSyncLoader("اكتمل تصدير البيانات للسحابة");
          toast("تمت المزامنة بنجاح");
          return result;
        } catch (err) {
          $("patchSyncOverlay")?.classList.remove("show");
          toast("تعذرت المزامنة، ستبقى العمليات في زر المزامنة");
          throw err;
        }
      };
    }
  }

  async function manualSync() {
    if (syncRunning) return;

    if (!getSession()) {
      toast("سجّل الدخول أولًا حتى تعمل المزامنة");
      return;
    }

    if (!isOnlineMode()) {
      toast("زر المزامنة خاص بنسخة الأونلاين");
      return;
    }

    if (!navigator.onLine) {
      toast("لا يوجد إنترنت الآن، البيانات محفوظة على الجهاز");
      return;
    }

    await autoSync("جاري تصدير البيانات للسحابة...", true);
  }

  async function autoSync(title = "جاري تصدير البيانات للسحابة...", showEvenIfEmpty = false) {
    if (syncRunning) return;
    if (!shouldSync()) return;

    const pendingCount = getOutbox().length;
    if (!showEvenIfEmpty && pendingCount <= 0) return;

    syncRunning = true;

    const btn = $("patchSyncBtn");
    if (btn) btn.disabled = true;

    try {
      await showSyncLoader(title, "يتم رفع العمليات غير المتزامنة إلى Firebase");

      if (typeof window.uploadOfflineDataToCloud === "function") {
        await window.uploadOfflineDataToCloud();
      } else {
        await sleep(700);
      }

      clearOutbox();
      await finishSyncLoader("اكتمل تصدير البيانات للسحابة");
      toast("تم رفع البيانات للسحابة");
    } catch (err) {
      console.error(err);
      $("patchSyncOverlay")?.classList.remove("show");
      toast("تعذرت المزامنة، ستتم المحاولة لاحقًا");
    } finally {
      syncRunning = false;
      if (btn) btn.disabled = false;
      updateSyncBadge();
    }
  }

  function maybeAutoSyncAfterMutation() {
    updateSyncBadge();

    if (!isOnlineMode()) return;

    if (navigator.onLine) {
      setTimeout(() => {
        autoSync("جاري تصدير البيانات للسحابة...", true);
      }, 450);
    } else {
      toast("تم الحفظ أوفلاين، وتمت إضافة العملية لزر المزامنة");
    }
  }

  function bindNetworkEvents() {
    window.addEventListener("online", () => {
      updateNetworkUi();
      updateSyncBadge();
      toast("عاد الاتصال بالإنترنت");

      if (getOutbox().length > 0 && isOnlineMode()) {
        setTimeout(() => {
          autoSync("عاد الإنترنت، جاري تصدير البيانات للسحابة...", true);
        }, 700);
      }
    });

    window.addEventListener("offline", () => {
      updateNetworkUi();
      updateSyncBadge();
      toast("أنت الآن غير متصل، سيستمر الحفظ على الجهاز");
    });
  }

  function hideOrShowPatchBars() {
    const loginVisible = $("loginPage") && !$("loginPage").classList.contains("hidden");
    const mainVisible = $("mainApp") && !$("mainApp").classList.contains("hidden");

    if (loginVisible || !mainVisible) {
      $("patchTopbar")?.classList.remove("patch-force-show");
      $("patchBottomNav")?.classList.add("patch-hidden-important");
      $("patchTopbar")?.classList.add("patch-hidden-important");
    } else {
      $("patchTopbar")?.classList.remove("patch-hidden-important");
      $("patchBottomNav")?.classList.remove("patch-hidden-important");
      $("patchTopbar").style.display = "block";
    }
  }

  function fixAllModals() {
    qa(".modal-wrap").forEach(modal => {
      modal.classList.add("patch-modal-fixed");
    });
  }

  function observeModals() {
    const obs = new MutationObserver(() => {
      fixAllModals();
    });

    obs.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function observeAppVisibility() {
    if (observerStarted) return;
    observerStarted = true;

    const targets = [$("mainApp"), $("loginPage"), $("sideLogo"), $("sideStoreName")].filter(Boolean);

    const obs = new MutationObserver(() => {
      hideOrShowPatchBars();
      updateCompanyFromUi();
      updateNetworkUi();
      updateSyncBadge();
      fixAllModals();
    });

    targets.forEach(el => {
      obs.observe(el, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "src"]
      });
    });
  }

  function exposePatchFunctions() {
    window.patchEditExpense = editExpense;
    window.patchDeleteExpense = deleteExpense;
    window.patchExportExpenses = exportExpenses;
    window.patchExportAdvancedReports = exportAdvancedReports;
    window.patchExportLowStock = exportLowStock;
    window.patchExportPaymentBalances = exportPaymentBalances;
    window.patchDeleteMerchantPayment = deleteMerchantPayment;
  }

  function waitForAppFunctions(tries = 120) {
    const readyEnough =
      typeof window.switchTab === "function" ||
      typeof window.checkout === "function" ||
      typeof window.saveProduct === "function";

    if (readyEnough || tries <= 0) {
      patchSwitchTab();
      patchDataMutations();
      patchUploadSync();
      patchSaveEntityForInvoiceAccount();

      setTimeout(() => {
        updateCompanyFromUi();
        updateNetworkUi();
        updateSyncBadge();
        fillPaymentAccountsSelect();
        addDetailedPurchasesUi();
        patchReportsCards();
        patchMainReportProfit();
        fixAllModals();

        if (getOutbox().length > 0 && shouldSync()) {
          autoSync("جاري تصدير العمليات السابقة للسحابة...", true);
        }
      }, 700);

      return;
    }

    setTimeout(() => waitForAppFunctions(tries - 1), 100);
  }

  function init() {
    injectStyle();
    createTopbar();
    createBottomNav();
    createSyncOverlay();

    fixToastWrap();
    fixManualTransferSelect();
    fixTableHeaders();
    improvePaymentOptions();
    improvePlaceholders();

    addPaymentAccountSelectToPos();
    addCustomersNavButton();
    addCustomersSection();
    addExpensesPage();
    addMerchantPaymentsPage();
    addAdvancedReportsPage();

    exposePatchFunctions();
    bindNetworkEvents();
    observeAppVisibility();
    observeModals();
    waitForAppFunctions();

    updateNetworkUi();
    updateSyncBadge();
    hideOrShowPatchBars();
    fixAllModals();

    $("reportFilter")?.addEventListener("change", () => {
      setTimeout(() => {
        patchReportsCards();
        patchMainReportProfit();
      }, 250);
    });

    console.log("patch.js loaded", PATCH_VERSION);
  }

  ready(init);
})();