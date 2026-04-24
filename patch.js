/* patch.js v3.0.0
   يرجع تسجيل الدخول والمفاتيح كما هي
   يضيف:
   - هيدر علوي باسم الشركة والشعار
   - حالة الاتصال بالنت
   - زر مزامنة مع عداد عمليات غير مرفوعة
   - مزامنة تلقائية عند رجوع النت
   - بار سفلي للجوال مثل التطبيق
   - تحسين حجم النوافذ للجوال
*/

(function () {
  "use strict";

  const PATCH_VERSION = "3.0.0";
  const PREFIX = "DFDFG";
  const OUTBOX_KEY = `${PREFIX}_patch_sync_outbox_v3`;
  const LAST_SYNC_KEY = `${PREFIX}_patch_last_sync_at_v3`;

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

  function getOutbox() {
    return safeJsonParse(localStorage.getItem(OUTBOX_KEY), []);
  }

  function setOutbox(items) {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    updateSyncBadge();
  }

  function addOutboxOperation(reason) {
    const list = getOutbox();
    list.push({
      id: `op_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      reason: reason || "عملية غير مرفوعة",
      createdAt: new Date().toISOString()
    });
    setOutbox(list);
  }

  function clearOutbox() {
    setOutbox([]);
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    updateLastSyncText();
  }

  function getCurrentSession() {
    try {
      const key = `${PREFIX}_USER_SESSION`;
      return safeJsonParse(localStorage.getItem(key), null);
    } catch {
      return null;
    }
  }

  function isOnlineAppMode() {
    const session = getCurrentSession();
    return session?.appMode === "online";
  }

  function shouldAutoSync() {
    const session = getCurrentSession();
    return !!session && session.appMode === "online" && navigator.onLine;
  }

  function injectStyle() {
    if ($("patchStyleV3")) return;

    const style = document.createElement("style");
    style.id = "patchStyleV3";
    style.textContent = `
      :root {
        --patch-primary: #1d4ed8;
        --patch-dark: #0f172a;
        --patch-soft: #eff6ff;
        --patch-border: #e5e7eb;
      }

      body {
        padding-top: 0;
      }

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

      #mainApp:not(.hidden) .patch-topbar,
      .patch-topbar.patch-force-show {
        display: block;
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
        max-width: 170px;
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
        box-shadow: 0 0 0 4px rgba(22,163,74,.12);
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
        cursor: not-allowed;
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
        max-width: 320px;
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

      .patch-bottom-item svg {
        width: 20px;
        height: 20px;
      }

      .patch-hidden-important {
        display: none !important;
      }

      @media (max-width: 768px) {
        #mainApp {
          padding-top: 0 !important;
          padding-bottom: 86px;
        }

        .patch-topbar {
          display: block;
        }

        .patch-menu-btn {
          display: inline-flex;
        }

        .patch-net-label {
          display: none;
        }

        .patch-sync-label {
          display: none;
        }

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

        #navButtonsWrap .nav-btn {
          justify-content: flex-start;
        }

        main.flex-grow {
          padding: 12px !important;
        }

        .patch-bottom-nav {
          display: block;
        }

        .modal-wrap {
          align-items: flex-start !important;
          padding: 10px !important;
          overflow-y: auto;
        }

        .modal-card {
          width: 100% !important;
          max-height: calc(100vh - 20px);
          overflow-y: auto;
          border-radius: 22px !important;
          padding: 18px !important;
        }

        #productModal .modal-card,
        #manualInvoiceModal .modal-card,
        #purchaseModal .modal-card,
        #customerHistoryModal .modal-card {
          max-width: 100% !important;
        }

        .card {
          border-radius: 18px;
        }
      }

      @media (min-width: 769px) {
        .patch-topbar {
          display: block;
        }

        #mainApp {
          flex-direction: row;
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
    if (mainApp) {
      mainApp.parentNode.insertBefore(topbar, mainApp);
    } else {
      document.body.prepend(topbar);
    }

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
      if (sub) sub.textContent = isOnlineAppMode() ? "أونلاين - المزامنة مفعلة" : "متصل بالإنترنت";
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
      btn.title = count > 0
        ? `يوجد ${count} عملية غير متزامنة`
        : "كل البيانات متزامنة";
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
      el.textContent = `آخر مزامنة: ${new Date(raw).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}`;
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
    if (old && !$("manualTransferAccount")) {
      old.id = "manualTransferAccount";
    }
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

    const current = payment.value || "cash";
    payment.innerHTML = `
      <option value="cash">كاش</option>
      <option value="bank">بنك</option>
      <option value="jawwalpay">جوال باي</option>
      <option value="app">تطبيق دفع</option>
    `;

    payment.value = current;
    if (!payment.value) payment.value = "cash";
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
      accountTypeInput: "مثال: بنك فلسطين / جوال باي / محفظة",
      accountOwnerInput: "رقم التحويل أو اسم الحساب",
      paymentInfoInput: "أضف طرق الدفع مثل: بنك فلسطين - رقم الحساب، جوال باي - رقم المحفظة"
    };

    Object.entries(map).forEach(([id, val]) => {
      const el = $(id);
      if (el) el.placeholder = val;
    });
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

  async function getInvoicesForCustomers() {
    if (typeof window.getAllInvoices === "function") {
      try {
        return await window.getAllInvoices();
      } catch {
        return [];
      }
    }

    return readIndexedDbAll(`${PREFIX}_offline_cashier_db_v6`, 6, "invoices");
  }

  async function readIndexedDbAll(dbName, version, storeName) {
    return new Promise(resolve => {
      try {
        const req = indexedDB.open(dbName, version);

        req.onerror = () => resolve([]);

        req.onupgradeneeded = () => {
          try {
            req.transaction.abort();
          } catch {}
          resolve([]);
        };

        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const allReq = store.getAll();

            allReq.onsuccess = () => resolve(allReq.result || []);
            allReq.onerror = () => resolve([]);
          } catch {
            resolve([]);
          }
        };
      } catch {
        resolve([]);
      }
    });
  }

  async function renderCustomersTab() {
    const tbody = $("patchCustomersTable");
    if (!tbody) return;

    const search = ($("patchCustomersSearch")?.value || "").trim().toLowerCase();
    const invoices = await getInvoicesForCustomers();
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

      if ((inv.status || "paid") === "paid") {
        row.paid += amount;
      } else {
        row.unpaid += amount;
      }
    });

    const customers = Array.from(map.values()).sort((a, b) => b.total - a.total);

    const totalPaid = customers.reduce((s, c) => s + c.paid, 0);
    const totalUnpaid = customers.reduce((s, c) => s + c.unpaid, 0);

    if ($("patchCustomersCount")) $("patchCustomersCount").textContent = String(customers.length);
    if ($("patchCustomersPaid")) $("patchCustomersPaid").textContent = money(totalPaid);
    if ($("patchCustomersUnpaid")) $("patchCustomersUnpaid").textContent = money(totalUnpaid);

    if (!customers.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-8 text-center text-gray-400">لا يوجد عملاء بعد</td>
        </tr>
      `;
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

  function money(value) {
    return `${Number(value || 0).toFixed(2)} ₪`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeJs(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\n/g, "\\n");
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
    if (window.__patchSwitchTabV3) return;
    window.__patchSwitchTabV3 = true;

    const oldSwitchTab = window.switchTab;

    window.switchTab = async function patchedSwitchTab(tabId) {
      if (tabId === "customers") {
        return openCustomersTab();
      }

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
        hideDuplicateOrWrongElements();
      }, 100);

      return result;
    };
  }

  function patchDataMutations() {
    if (window.__patchMutationsV3) return;
    window.__patchMutationsV3 = true;

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
        const result = await old.apply(this, args);

        if (isOnlineAppMode()) {
          if (navigator.onLine) {
            addOutboxOperation(`تغيير من ${name}`);
            setTimeout(() => autoSync("تم حفظ عملية جديدة، جاري مزامنتها..."), 300);
          } else {
            addOutboxOperation(`عملية محفوظة أوفلاين من ${name}`);
            toast("تم الحفظ على الجهاز، وسيتم الرفع عند رجوع الإنترنت");
          }
        }

        return result;
      };
    });
  }

  function patchExportAndSyncButtons() {
    if (window.__patchExportSyncV3) return;
    window.__patchExportSyncV3 = true;

    const syncNames = [
      "uploadOfflineDataToCloud"
    ];

    syncNames.forEach(name => {
      const old = window[name];
      if (typeof old !== "function") return;

      window[name] = async function patchedUpload(...args) {
        await showSyncLoader("جاري مزامنة البيانات", "يتم رفع البيانات المحفوظة على الجهاز إلى الأونلاين");
        try {
          const result = await old.apply(this, args);
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
    });
  }

  async function manualSync() {
    if (syncRunning) return;

    if (!getCurrentSession()) {
      toast("سجّل الدخول أولًا حتى تعمل المزامنة");
      return;
    }

    if (!isOnlineAppMode()) {
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
    if (!shouldAutoSync()) return;

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
      toast("عاد الاتصال بالإنترنت");

      if (getOutbox().length > 0 && isOnlineAppMode()) {
        setTimeout(() => autoSync("عاد الإنترنت، جاري مزامنة البيانات..."), 700);
      }
    });

    window.addEventListener("offline", () => {
      updateNetworkUi();
      toast("أنت الآن غير متصل، سيستمر الحفظ على الجهاز");
    });
  }

  function hideDuplicateOrWrongElements() {
    /*
      لا نحذف تسجيل الدخول ولا النسخ الاحتياطي.
      فقط نترك كل شيء كما هو ونحسن الواجهة.
    */

    const login = $("loginPage");
    const main = $("mainApp");

    if (login && !login.classList.contains("hidden")) {
      $("patchTopbar")?.classList.remove("patch-force-show");
      $("patchBottomNav")?.classList.add("patch-hidden-important");
    } else if (main && !main.classList.contains("hidden")) {
      $("patchBottomNav")?.classList.remove("patch-hidden-important");
    }
  }

  function observeAppVisibility() {
    if (observerStarted) return;
    observerStarted = true;

    const targets = [$("mainApp"), $("loginPage"), $("sideLogo"), $("sideStoreName")].filter(Boolean);

    const obs = new MutationObserver(() => {
      hideDuplicateOrWrongElements();
      updateCompanyFromUi();
      updateNetworkUi();
      updateSyncBadge();
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

  function waitForAppFunctions(tries = 120) {
    const readyEnough =
      typeof window.switchTab === "function" ||
      typeof window.checkout === "function" ||
      typeof window.saveProduct === "function";

    if (readyEnough || tries <= 0) {
      patchSwitchTab();
      patchDataMutations();
      patchExportAndSyncButtons();

      setTimeout(() => {
        updateCompanyFromUi();
        updateNetworkUi();
        updateSyncBadge();

        if (getOutbox().length > 0 && shouldAutoSync()) {
          autoSync("جاري مزامنة العمليات السابقة...");
        }
      }, 600);

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

    addCustomersNavButton();
    addCustomersSection();

    bindNetworkEvents();
    observeAppVisibility();
    waitForAppFunctions();

    updateNetworkUi();
    updateSyncBadge();
    hideDuplicateOrWrongElements();

    console.log("patch.js loaded", PATCH_VERSION);
  }

  ready(init);

})();