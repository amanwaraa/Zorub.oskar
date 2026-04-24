/* patch.js v5.0.0
   تعديلات خارجية بدون تغيير app.js:
   - دخول مرة واحدة بالنت، وبعدها يفتح أوفلاين حتى بعد تحديث الصفحة
   - تقوية عمل الرابط أوفلاين
   - تحديث ملفات الموقع من الاستضافة عند وجود نت
   - إصلاح المودالات للجوال وتحت الهيدر
   - زر مزامنة + حالة اتصال + عداد عمليات
   - حساب الدفع: كاش ثابت + الحسابات المضافة من الإعدادات فقط
   - المصروفات تخصم من الأرباح داخل كروت التقارير الأساسية نفسها
   - منع إضافة قسم تقارير أسفل الصفحة
*/

(function () {
  "use strict";

  const PATCH_VERSION = "5.0.0";
  const PREFIX = "DFDFG";
  const DB_NAME = `${PREFIX}_offline_cashier_db_v6`;
  const DB_VERSION = 6;

  const SESSION_KEY = `${PREFIX}_USER_SESSION`;
  const OUTBOX_KEY = `${PREFIX}_patch_sync_outbox_v5`;
  const LAST_SYNC_KEY = `${PREFIX}_patch_last_sync_at_v5`;
  const EXPENSES_KEY = `${PREFIX}_patch_expenses_v5`;
  const APP_CACHE_NAME = `${PREFIX}_app_runtime_cache_v5`;
  const LAST_APP_UPDATE_CHECK = `${PREFIX}_last_app_update_check_v5`;

  let syncRunning = false;
  let observerStarted = false;

  const APP_SHELL = [
    "./",
    "./index.html",
    "./app.js",
    "./patch.js",
    "./manifest.json",
    "./manifest.webmanifest",
    "./service-worker.js",
    "./sw.js"
  ];

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
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
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
    return safeJsonParse(localStorage.getItem(SESSION_KEY), null);
  }

  function setSession(session) {
    if (!session) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function hasValidStoredSession() {
    const session = getSession();
    if (!session?.key) return false;

    if (session.expiresAt && Date.now() >= new Date(session.expiresAt).getTime()) {
      return false;
    }

    return true;
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
    if ($("patchStyleV5")) return;

    const style = document.createElement("style");
    style.id = "patchStyleV5";
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

      .patch-modal-fixed .modal-card::-webkit-scrollbar {
        width: 6px;
      }

      .patch-modal-fixed .modal-card::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 999px;
      }

      .patch-expense-profit-note {
        display: block;
        margin-top: 6px;
        font-size: 11px;
        font-weight: 800;
        opacity: .9;
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

  async function showSyncLoader(title = "جاري مزامنة البيانات", sub = "يرجى عدم إغلاق الصفحة حتى اكتمال رفع البيانات") {
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

  async function finishSyncLoader(successText = "اكتملت المزامنة") {
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

        if (tab === "customers") {
          await openCustomersTab();
        } else if (typeof window.switchTab === "function") {
          await window.switchTab(tab);
        }

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

    if (btn) {
      btn.title = count > 0 ? `يوجد ${count} عملية غير متزامنة` : "كل البيانات متزامنة";
    }
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
      accountTypeInput: "اسم البنك / المحفظة",
      accountOwnerInput: "رقم الحساب / رقم التحويل",
      paymentInfoInput: "أضف طرق الدفع والحسابات من الأسفل"
    };

    Object.entries(map).forEach(([id, val]) => {
      const el = $(id);
      if (el) el.placeholder = val;
    });
  }

  function hardenOfflineSession() {
    const session = getSession();

    if (session?.key) {
      session.firstVerified = true;
      session.rememberSession = true;
      session.allowOfflineFallback = true;

      if (!session.appMode) session.appMode = "online";

      setSession(session);
    }

    if (!navigator.onLine && hasValidStoredSession()) {
      setTimeout(() => {
        const loginVisible = $("loginPage") && !$("loginPage").classList.contains("hidden");
        const mainHidden = $("mainApp") && $("mainApp").classList.contains("hidden");

        if (loginVisible || mainHidden) {
          $("loginPage")?.classList.add("hidden");
          $("licenseExpiredPage")?.classList.add("hidden");
          $("mainApp")?.classList.remove("hidden");

          if (typeof window.switchTab === "function") {
            try {
              window.switchTab("pos");
            } catch {}
          }

          toast("تم فتح النظام أوفلاين من الجلسة المحفوظة");
        }
      }, 700);
    }
  }

  function patchLoginToSaveForever() {
    if (window.__patchLoginForeverV5) return;
    window.__patchLoginForeverV5 = true;

    const oldLogin = window.handleLicenseLogin;

    if (typeof oldLogin === "function") {
      window.handleLicenseLogin = async function patchedLogin(...args) {
        const result = await oldLogin.apply(this, args);

        const session = getSession();
        if (session?.key) {
          session.firstVerified = true;
          session.rememberSession = true;
          session.allowOfflineFallback = true;
          if (!session.appMode) session.appMode = "online";
          setSession(session);

          await cacheAppShell();
          toast("تم حفظ الدخول، سيعمل النظام بدون إنترنت");
        }

        return result;
      };

      const btn = $("loginBtn");
      if (btn) {
        btn.onclick = null;
        btn.addEventListener("click", window.handleLicenseLogin);
      }
    }
  }

  async function cacheAppShell() {
    if (!("caches" in window)) return;

    try {
      const cache = await caches.open(APP_CACHE_NAME);

      await Promise.allSettled(
        APP_SHELL.map(async url => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res.ok) await cache.put(url, res.clone());
          } catch {}
        })
      );
    } catch {}
  }

  async function refreshHostedFilesWhenOnline(force = false) {
    if (!navigator.onLine) return;
    if (!("caches" in window)) return;

    const last = Number(localStorage.getItem(LAST_APP_UPDATE_CHECK) || 0);
    const now = Date.now();

    if (!force && now - last < 60 * 1000) return;

    localStorage.setItem(LAST_APP_UPDATE_CHECK, String(now));

    try {
      await cacheAppShell();

      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(regs.map(reg => reg.update()));
      }

      console.log("patch.js: checked hosted files update");
    } catch {}
  }

  function registerRuntimeOfflineServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    const swCode = `
      const CACHE_NAME = "${APP_CACHE_NAME}";
      const APP_SHELL = ${JSON.stringify(APP_SHELL)};

      self.addEventListener("install", event => {
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache =>
            Promise.allSettled(APP_SHELL.map(url =>
              fetch(url, { cache: "reload" })
                .then(res => res.ok ? cache.put(url, res.clone()) : null)
                .catch(() => null)
            ))
          )
        );
        self.skipWaiting();
      });

      self.addEventListener("activate", event => {
        event.waitUntil(self.clients.claim());
      });

      self.addEventListener("fetch", event => {
        const req = event.request;
        if (req.method !== "GET") return;

        const url = new URL(req.url);

        if (req.mode === "navigate") {
          event.respondWith(
            fetch(req)
              .then(res => {
                const copy = res.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put("./", copy.clone()).catch(() => {});
                  cache.put("./index.html", copy.clone()).catch(() => {});
                });
                return res;
              })
              .catch(() =>
                caches.match("./index.html")
                  .then(cached => cached || caches.match("./"))
              )
          );
          return;
        }

        event.respondWith(
          fetch(req)
            .then(res => {
              const copy = res.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {});
              return res;
            })
            .catch(() => caches.match(req))
        );
      });
    `;

    try {
      const blob = new Blob([swCode], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);

      navigator.serviceWorker.register(url).catch(() => {});
    } catch {}
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

  async function getTransferAccountsSafe() {
    try {
      const row = await readIndexedDbItem("meta", "transferAccounts");
      return Array.isArray(row?.items) ? row.items : [];
    } catch {
      return [];
    }
  }

  function setPaymentMethodToSimple() {
    const payment = $("paymentMethod");
    if (!payment) return;

    payment.innerHTML = `
      <option value="cash">كاش</option>
      <option value="account">حساب دفع</option>
    `;
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
    fillPaymentAccountsSelect();

    payment.addEventListener("change", () => {
      if (payment.value === "cash") {
        $("posTransferAccount").value = "cash";
      } else {
        const select = $("posTransferAccount");
        if (select && select.value === "cash") {
          const firstAccount = qa("option", select).find(o => o.value !== "cash");
          if (firstAccount) select.value = firstAccount.value;
        }
      }
    });
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

    if (current && qa("option", select).some(o => o.value === current)) {
      select.value = current;
    }
  }

  function applyPaymentAccountToFormBeforeCheckout() {
    const payment = $("paymentMethod");
    const select = $("posTransferAccount");
    if (!payment || !select) return;

    if (select.value === "cash") {
      payment.value = "cash";
      sessionStorage.removeItem(`${PREFIX}_patch_last_payment_account`);
      return;
    }

    payment.value = "account";

    const [type, owner] = select.value.split("|||");
    sessionStorage.setItem(`${PREFIX}_patch_last_payment_account`, JSON.stringify({
      type: type || "",
      owner: owner || ""
    }));
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

    await writeIndexedDbItem("invoices", latest);
    sessionStorage.removeItem(`${PREFIX}_patch_last_payment_account`);
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

  function addCustomersNavAndSection() {
    if (!q('[data-tab="customers"]')) {
      const navWrap = $("navButtonsWrap");
      const invoicesBtn = q('[data-tab="invoices"]');

      if (navWrap) {
        const btn = document.createElement("button");
        btn.className = "nav-btn flex items-center gap-3 p-3 rounded-xl transition w-full whitespace-nowrap";
        btn.dataset.tab = "customers";
        btn.type = "button";
        btn.innerHTML = `<i data-lucide="users"></i> <span>العملاء</span>`;
        btn.addEventListener("click", openCustomersTab);

        if (invoicesBtn?.nextSibling) navWrap.insertBefore(btn, invoicesBtn.nextSibling);
        else navWrap.appendChild(btn);
      }
    }

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
        map.set(key, { name, phone, count: 0, paid: 0, unpaid: 0, total: 0 });
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
    if (!q('[data-tab="expenses"]')) {
      const navWrap = $("navButtonsWrap");
      const reportsBtn = q('[data-tab="reports"]');

      if (navWrap) {
        const btn = document.createElement("button");
        btn.className = "nav-btn flex items-center gap-3 p-3 rounded-xl transition w-full whitespace-nowrap";
        btn.dataset.tab = "expenses";
        btn.type = "button";
        btn.innerHTML = `<i data-lucide="wallet-cards"></i> <span>المصروفات</span>`;
        btn.addEventListener("click", openExpensesTab);

        if (reportsBtn?.nextSibling) navWrap.insertBefore(btn, reportsBtn.nextSibling);
        else navWrap.appendChild(btn);
      }
    }

    if ($("tab-expenses")) return;

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

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="card p-5 bg-red-600 text-white">
          <p class="opacity-80">إجمالي المصروفات</p>
          <h3 id="patchExpensesTotal" class="text-3xl font-bold mt-2">0.00 ₪</h3>
        </div>
        <div class="card p-5 bg-slate-800 text-white">
          <p class="opacity-80">عدد العمليات</p>
          <h3 id="patchExpensesCount" class="text-3xl font-bold mt-2">0</h3>
        </div>
        <div class="card p-5 bg-green-600 text-white">
          <p class="opacity-80">خصم من الأرباح</p>
          <h3 class="text-3xl font-bold mt-2">تلقائي</h3>
        </div>
      </div>

      <div class="card p-4">
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
    $("patchExpenseModalTitle").textContent = "إضافة مصروف";
    $("patchEditExpenseId").value = "";
    $("patchExpenseName").value = "";
    $("patchExpenseAmount").value = "";
    $("patchExpenseNotes").value = "";

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
    patchReportsTopCards();
  }

  function editExpense(id) {
    const item = getExpenses().find(x => x.id === id);
    if (!item) return;

    $("patchExpenseModalTitle").textContent = "تعديل مصروف";
    $("patchEditExpenseId").value = item.id;
    $("patchExpenseName").value = item.name || "";
    $("patchExpenseAmount").value = Number(item.amount || 0);
    $("patchExpenseNotes").value = item.notes || "";

    window.toggleModal?.("patchExpenseModal", true);
    fixAllModals();
  }

  function deleteExpense(id) {
    if (!confirm("حذف المصروف؟")) return;

    setExpenses(getExpenses().filter(x => x.id !== id));
    addOutboxOperation("حذف مصروف");

    toast("تم حذف المصروف");
    renderExpensesTab();
    patchReportsTopCards();
  }

  async function renderExpensesTab() {
    const tbody = $("patchExpensesTable");
    if (!tbody) return;

    const filter = $("patchExpensesFilter")?.value || "day";
    const items = getExpenses()
      .filter(x => inRange(x.createdAt, filter))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = items.reduce((s, x) => s + Number(x.amount || 0), 0);

    $("patchExpensesTotal").textContent = money(total);
    $("patchExpensesCount").textContent = String(items.length);

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

  async function patchReportsTopCards() {
    const reportsVisible = $("tab-reports") && !$("tab-reports").classList.contains("hidden");
    const filter = $("reportFilter")?.value || "today";

    const expenses = getExpenses()
      .filter(exp => inRange(exp.createdAt, filter))
      .reduce((s, exp) => s + Number(exp.amount || 0), 0);

    const profitEl = $("repTotalProfit");
    if (!profitEl) return;

    let sales = 0;
    let costs = 0;

    const invoices = await getInvoicesSafe();
    invoices.forEach(inv => {
      if (!inRange(inv.date || inv.createdAt, filter)) return;
      sales += Number(inv.total || 0);
      costs += Number(inv.totalCost || 0);
    });

    const profitBefore = sales - costs;
    const netProfit = profitBefore - expenses;

    profitEl.textContent = money(netProfit);

    const card = profitEl.closest(".card");
    if (card) {
      let note = card.querySelector(".patch-expense-profit-note");
      if (!note) {
        note = document.createElement("span");
        note.className = "patch-expense-profit-note";
        card.appendChild(note);
      }

      note.textContent = `بعد خصم المصروفات: ${money(expenses)}`;
    }

    if (reportsVisible) {
      const expensesCardId = "patchExpensesInReportsCard";
      if (!$(expensesCardId)) {
        const grid = q("#tab-reports .grid");
        if (grid) {
          const div = document.createElement("div");
          div.id = expensesCardId;
          div.className = "card p-8 bg-rose-600 text-white shadow-xl";
          div.innerHTML = `
            <p class="opacity-80">المصروفات</p>
            <h4 id="patchRepExpensesTop" class="text-4xl font-bold mt-2">0.00 ₪</h4>
          `;
          grid.appendChild(div);
        }
      }

      if ($("patchRepExpensesTop")) $("patchRepExpensesTop").textContent = money(expenses);
    }
  }

  function patchReportFilterEvent() {
    $("reportFilter")?.addEventListener("change", () => {
      setTimeout(patchReportsTopCards, 300);
    });
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
    if (window.__patchSwitchTabV5) return;
    window.__patchSwitchTabV5 = true;

    const oldSwitchTab = window.switchTab;

    window.switchTab = async function patchedSwitchTab(tabId) {
      if (tabId === "customers") return openCustomersTab();
      if (tabId === "expenses") return openExpensesTab();

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
        if (tabId === "reports") patchReportsTopCards();
      }, 150);

      return result;
    };
  }

  function patchDataMutations() {
    if (window.__patchMutationsV5) return;
    window.__patchMutationsV5 = true;

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
          applyPaymentAccountToFormBeforeCheckout();
        }

        const result = await old.apply(this, args);

        if (name === "checkout") {
          await patchLastInvoicePaymentAccount();
        }

        if (name === "saveSettings") {
          await fillPaymentAccountsSelect();
        }

        if (isOnlineMode()) {
          if (navigator.onLine) {
            addOutboxOperation(`تغيير من ${name}`);
            setTimeout(() => autoSync("تم حفظ عملية جديدة، جاري مزامنتها..."), 300);
          } else {
            addOutboxOperation(`عملية محفوظة أوفلاين من ${name}`);
            toast("تم الحفظ على الجهاز، وسيتم الرفع عند رجوع الإنترنت");
          }
        }

        setTimeout(() => {
          patchReportsTopCards();
          renderExpensesTab();
        }, 300);

        return result;
      };
    });
  }

  function patchUploadSync() {
    if (window.__patchUploadSyncV5) return;
    window.__patchUploadSyncV5 = true;

    const oldUpload = window.uploadOfflineDataToCloud;

    if (typeof oldUpload === "function") {
      window.uploadOfflineDataToCloud = async function patchedUpload(...args) {
        await showSyncLoader("جاري مزامنة البيانات", "يتم رفع البيانات المحفوظة على الجهاز إلى الأونلاين");

        try {
          const result = await oldUpload.apply(this, args);
          clearOutbox();
          await finishSyncLoader("اكتملت مزامنة البيانات");
          toast("تمت المزامنة بنجاح");
          return result;
        } catch (err) {
          $("patchSyncOverlay")?.classList.remove("show");
          toast("تعذرت المزامنة، ستبقى البيانات محفوظة على الجهاز");
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

    await autoSync("جاري مزامنة البيانات يدويًا...");
  }

  async function autoSync(title = "جاري مزامنة البيانات...") {
    if (syncRunning) return;
    if (!shouldSync()) return;

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
      await finishSyncLoader("اكتملت مزامنة البيانات");
      toast("تم رفع البيانات أونلاين");
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

  function bindNetworkEvents() {
    window.addEventListener("online", () => {
      updateNetworkUi();
      refreshHostedFilesWhenOnline(true);
      toast("عاد الاتصال بالإنترنت");

      if (getOutbox().length > 0 && isOnlineMode()) {
        setTimeout(() => autoSync("عاد الإنترنت، جاري مزامنة البيانات..."), 700);
      }
    });

    window.addEventListener("offline", () => {
      updateNetworkUi();
      hardenOfflineSession();
      toast("أنت الآن غير متصل، سيستمر الحفظ على الجهاز");
    });
  }

  function hideOrShowPatchBars() {
    const loginVisible = $("loginPage") && !$("loginPage").classList.contains("hidden");
    const mainVisible = $("mainApp") && !$("mainApp").classList.contains("hidden");

    if (loginVisible || !mainVisible) {
      $("patchBottomNav")?.classList.add("patch-hidden-important");
      $("patchTopbar")?.classList.add("patch-hidden-important");
    } else {
      $("patchTopbar")?.classList.remove("patch-hidden-important");
      $("patchBottomNav")?.classList.remove("patch-hidden-important");
      $("patchTopbar").style.display = "block";
    }
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
      patchLoginToSaveForever();

      setTimeout(() => {
        updateCompanyFromUi();
        updateNetworkUi();
        updateSyncBadge();
        fillPaymentAccountsSelect();
        patchReportsTopCards();
        hardenOfflineSession();
        fixAllModals();

        if (getOutbox().length > 0 && shouldSync()) {
          autoSync("جاري مزامنة العمليات السابقة...");
        }
      }, 700);

      return;
    }

    setTimeout(() => waitForAppFunctions(tries - 1), 100);
  }

  function init() {
    injectStyle();

    registerRuntimeOfflineServiceWorker();
    cacheAppShell();
    refreshHostedFilesWhenOnline();

    createTopbar();
    createBottomNav();
    createSyncOverlay();

    fixToastWrap();
    improvePlaceholders();
    fixAllModals();
    observeModals();

    setPaymentMethodToSimple();
    addPaymentAccountSelectToPos();

    addCustomersNavAndSection();
    addExpensesPage();

    exposePatchFunctions();
    bindNetworkEvents();
    observeAppVisibility();
    patchReportFilterEvent();

    waitForAppFunctions();

    updateNetworkUi();
    updateSyncBadge();
    hideOrShowPatchBars();
    hardenOfflineSession();

    console.log("patch.js loaded", PATCH_VERSION);
  }

  ready(init);
})();