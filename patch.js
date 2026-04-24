/* patch.js
   تعديلات خارجية فوق index.html + app.js
   بدون تعديل الملفين الأصليين
*/

(function () {
  "use strict";

  const PATCH_VERSION = "2.0.0";
  const FIXED_PROJECT_KEY = "885766842";
  const PREFIX = "DFDFG";
  const LOCAL_SESSION_KEY = `${PREFIX}_USER_SESSION`;

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

  function injectStyle() {
    if ($("patchStyle")) return;

    const style = document.createElement("style");
    style.id = "patchStyle";
    style.textContent = `
      .patch-hidden {
        display: none !important;
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
        width: 104px;
        height: 104px;
        border-radius: 999px;
        background:
          radial-gradient(closest-side, white 76%, transparent 77% 100%),
          conic-gradient(#1d4ed8 calc(var(--p) * 1%), #e5e7eb 0);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #1d4ed8;
        font-weight: 900;
        font-size: 20px;
      }

      .patch-sync-text {
        font-weight: 900;
        color: #1d4ed8;
        text-align: center;
      }

      .patch-sync-sub {
        color: #64748b;
        font-size: 13px;
        text-align: center;
      }

      .patch-toast {
        position: fixed;
        left: 16px;
        bottom: 18px;
        z-index: 999999;
        background: #0f172a;
        color: #fff;
        padding: 13px 16px;
        border-radius: 16px;
        box-shadow: 0 14px 36px rgba(0,0,0,.22);
        font-size: 14px;
        font-weight: 800;
        max-width: calc(100vw - 32px);
        opacity: 0;
        transform: translateY(12px);
        transition: .25s ease;
        direction: rtl;
      }

      .patch-toast.show {
        opacity: 1;
        transform: translateY(0);
      }

      .patch-mobile-menu-btn {
        display: none;
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 300;
        width: 46px;
        height: 46px;
        border-radius: 16px;
        background: #1d4ed8;
        color: #fff;
        box-shadow: 0 12px 28px rgba(29,78,216,.25);
        align-items: center;
        justify-content: center;
      }

      .patch-side-backdrop {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(15,23,42,.45);
        z-index: 240;
      }

      .patch-side-backdrop.show {
        display: block;
      }

      .patch-online-chip {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        border-radius: 999px;
        padding: 6px 10px;
        background: #ecfdf5;
        color: #166534;
        font-size: 11px;
        font-weight: 900;
      }

      .patch-online-chip.off {
        background: #fef2f2;
        color: #b91c1c;
      }

      .patch-dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: currentColor;
      }

      .patch-section-title {
        font-size: 22px;
        font-weight: 900;
        color: #111827;
      }

      .patch-modal-card {
        max-height: calc(100vh - 28px);
        overflow-y: auto;
      }

      @media (max-width: 768px) {
        .patch-mobile-menu-btn {
          display: flex;
        }

        #mainApp {
          padding-top: 64px;
        }

        #sideNav {
          position: fixed !important;
          top: 0;
          right: 0;
          bottom: 0;
          width: 82vw !important;
          max-width: 320px;
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
        }

        .modal-card {
          width: 100% !important;
          max-height: calc(100vh - 24px);
          overflow-y: auto;
          padding: 20px !important;
          border-radius: 22px !important;
        }

        .modal-wrap {
          align-items: flex-start !important;
          padding-top: 12px !important;
          padding-bottom: 12px !important;
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

    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function createSyncOverlay() {
    if ($("patchSyncOverlay")) return;

    const el = document.createElement("div");
    el.id = "patchSyncOverlay";
    el.className = "patch-sync-overlay";
    el.innerHTML = `
      <div id="patchSyncCircle" class="patch-sync-circle" style="--p:0">0%</div>
      <div>
        <div id="patchSyncText" class="patch-sync-text">جاري المزامنة...</div>
        <div id="patchSyncSub" class="patch-sync-sub">يرجى عدم إغلاق الصفحة حتى انتهاء التصدير</div>
      </div>
    `;
    document.body.appendChild(el);
  }

  async function syncLoader(text = "جاري مزامنة البيانات...", sub = "يتم تجهيز البيانات ورفعها عند توفر الإنترنت") {
    createSyncOverlay();

    const overlay = $("patchSyncOverlay");
    const circle = $("patchSyncCircle");
    const title = $("patchSyncText");
    const subtitle = $("patchSyncSub");

    if (!overlay || !circle) return;

    title.textContent = text;
    subtitle.textContent = sub;

    overlay.classList.add("show");

    for (let p = 0; p <= 100; p += 10) {
      circle.style.setProperty("--p", p);
      circle.textContent = p + "%";
      await sleep(70);
    }

    await sleep(180);
    overlay.classList.remove("show");
  }

  function ensureNoLoginSession() {
    const session = {
      key: FIXED_PROJECT_KEY,
      durationType: "unlimited",
      durationValue: 0,
      startedAt: new Date().toISOString(),
      expiresAt: null,
      loginAt: new Date().toISOString(),
      appMode: "online",
      allowOfflineFallback: true,
      rememberSession: true,
      firstVerified: true,
      patchedNoLogin: true
    };

    try {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
      localStorage.setItem("activeStoreId", localStorage.getItem("activeStoreId") || "default");
    } catch {}
  }

  function hideLoginAndExpiredPages() {
    $("loginPage")?.classList.add("patch-hidden");
    $("licenseExpiredPage")?.classList.add("patch-hidden");
  }

  function forceOpenAppUi() {
    hideLoginAndExpiredPages();

    const main = $("mainApp");
    const invoice = $("invoicePage");

    if (invoice && !invoice.classList.contains("hidden")) return;

    if (main) {
      main.classList.remove("hidden");
      main.classList.remove("patch-hidden");
    }

    if (typeof window.switchTab === "function") {
      try {
        window.switchTab("pos");
      } catch {}
    }
  }

  function patchLoginFunctions() {
    window.handleLicenseLogin = async function patchedHandleLicenseLogin() {
      ensureNoLoginSession();
      forceOpenAppUi();
      toast("تم فتح النظام بدون مفاتيح");
    };

    window.goToLoginFromExpired = function patchedGoToLoginFromExpired() {
      ensureNoLoginSession();
      forceOpenAppUi();
    };

    const loginBtn = $("loginBtn");
    if (loginBtn) {
      loginBtn.onclick = window.handleLicenseLogin;
    }
  }

  function hideBackupAndLicenseUi() {
    hideLoginAndExpiredPages();

    const settings = $("tab-settings");
    if (settings) {
      const cards = qa(".soft-card", settings);

      cards.forEach(card => {
        const text = card.textContent || "";

        if (
          text.includes("النسخ الاحتياطي") ||
          text.includes("استعادة نسخة") ||
          text.includes("تنزيل نسخة") ||
          text.includes("حفظ نسخة احتياطية") ||
          text.includes("بيانات المفتاح الحالي") ||
          text.includes("المفتاح:")
        ) {
          card.classList.add("patch-hidden");
        }
      });
    }

    $("downloadBackupBtn")?.classList.add("patch-hidden");
    $("saveCloudBackupBtn")?.classList.add("patch-hidden");
    $("restoreBackupInput")?.closest("label")?.classList.add("patch-hidden");

    $("offlineSyncWrap")?.classList.remove("hidden");

    qa("span, div, p").forEach(el => {
      const text = (el.textContent || "").trim();
      if (
        text.includes("المفتاح الحالي") ||
        text.includes("الوقت المتبقي") ||
        text.includes("نوع النسخة")
      ) {
        const parent = el.closest(".mt-4, .bg-blue-50, .space-y-2");
        if (parent && parent.id !== "offlineSyncWrap") {
          parent.classList.add("patch-hidden");
        }
      }
    });

    if ($("licensePlanBadge")) $("licensePlanBadge").textContent = "نسخة موحدة";
    if ($("settingsPlanBadge")) $("settingsPlanBadge").textContent = "نسخة موحدة بدون مفاتيح";
  }

  function addMobileSideMenu() {
    if ($("patchMenuBtn")) return;

    const btn = document.createElement("button");
    btn.id = "patchMenuBtn";
    btn.className = "patch-mobile-menu-btn";
    btn.innerHTML = `<i data-lucide="menu"></i>`;
    document.body.appendChild(btn);

    const backdrop = document.createElement("div");
    backdrop.id = "patchSideBackdrop";
    backdrop.className = "patch-side-backdrop";
    document.body.appendChild(backdrop);

    function open() {
      $("sideNav")?.classList.add("patch-open");
      backdrop.classList.add("show");
    }

    function close() {
      $("sideNav")?.classList.remove("patch-open");
      backdrop.classList.remove("show");
    }

    btn.addEventListener("click", open);
    backdrop.addEventListener("click", close);

    qa("#navButtonsWrap .nav-btn").forEach(nav => {
      nav.addEventListener("click", () => {
        if (window.innerWidth <= 768) close();
      });
    });

    window.addEventListener("keydown", e => {
      if (e.key === "Escape") close();
    });

    window.lucide?.createIcons?.();
  }

  function addConnectionChip() {
    if ($("patchConnectionChip")) return;

    const side = $("sideStoreName")?.parentElement;
    if (!side) return;

    const chip = document.createElement("div");
    chip.id = "patchConnectionChip";
    chip.className = "patch-online-chip";
    chip.innerHTML = `<span class="patch-dot"></span><span id="patchConnectionText">متصل</span>`;

    side.appendChild(chip);

    updateConnectionChip();
    window.addEventListener("online", updateConnectionChip);
    window.addEventListener("offline", updateConnectionChip);
  }

  function updateConnectionChip() {
    const chip = $("patchConnectionChip");
    const text = $("patchConnectionText");
    if (!chip || !text) return;

    if (navigator.onLine) {
      chip.classList.remove("off");
      text.textContent = "متصل - المزامنة جاهزة";
    } else {
      chip.classList.add("off");
      text.textContent = "أوفلاين - سيتم التصدير عند رجوع النت";
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
    if (payment) {
      payment.innerHTML = `
        <option value="cash">كاش</option>
        <option value="bank">بنك</option>
        <option value="jawwalpay">جوال باي</option>
        <option value="app">تطبيق دفع</option>
      `;
    }
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

  function addExpensesTab() {
    if ($("tab-expenses")) return;

    const navWrap = $("navButtonsWrap");
    const settingsBtn = q('[data-tab="settings"]');

    const btn = document.createElement("button");
    btn.className = "nav-btn flex items-center gap-3 p-3 rounded-xl transition w-full whitespace-nowrap";
    btn.dataset.tab = "expenses";
    btn.innerHTML = `<i data-lucide="wallet-cards"></i> <span>المصروفات</span>`;
    btn.onclick = () => window.switchTab ? window.switchTab("expenses") : showPatchTab("expenses");

    if (navWrap && settingsBtn) navWrap.insertBefore(btn, settingsBtn);
    else navWrap?.appendChild(btn);

    const main = q("main");
    const section = document.createElement("section");
    section.id = "tab-expenses";
    section.className = "tab-content hidden space-y-6";
    section.innerHTML = `
      <div class="flex flex-wrap justify-between items-center gap-4">
        <h2 class="patch-section-title">المصروفات</h2>
        <button id="openExpenseModalBtn" class="btn-primary px-6 py-3 rounded-2xl flex items-center gap-2 shadow-md">
          <i data-lucide="plus"></i> إضافة مصروف
        </button>
      </div>

      <div class="card p-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select id="expenseFilter" class="input-bordered">
            <option value="day">اليوم</option>
            <option value="week">الأسبوع</option>
            <option value="month">الشهر</option>
            <option value="year">السنة</option>
            <option value="all">كل السجل</option>
          </select>
          <div class="soft-card p-4">
            <div class="text-sm text-gray-500">إجمالي المصروفات</div>
            <div id="expensesTotal" class="text-2xl font-bold text-red-600 mt-1">0.00 ₪</div>
          </div>
          <div class="soft-card p-4 md:col-span-2">
            <div class="text-sm text-gray-500">ملاحظة</div>
            <div class="font-bold text-slate-700 mt-1">يمكن تحديد خصم المصروفات من الأرباح من الإعدادات</div>
          </div>
        </div>
      </div>

      <div class="card p-4 overflow-x-auto">
        <table class="w-full text-right">
          <thead class="bg-gray-50 text-gray-500">
            <tr>
              <th class="p-4">التاريخ</th>
              <th class="p-4">البند</th>
              <th class="p-4">المبلغ</th>
              <th class="p-4">ملاحظات</th>
              <th class="p-4">الإجراءات</th>
            </tr>
          </thead>
          <tbody id="expensesTable"></tbody>
        </table>
      </div>
    `;

    main?.appendChild(section);

    const modal = document.createElement("div");
    modal.id = "expenseModal";
    modal.className = "modal-wrap hidden";
    modal.innerHTML = `
      <div class="modal-card max-w-lg p-8 patch-modal-card">
        <h3 class="text-xl font-bold mb-6">إضافة مصروف</h3>
        <input type="hidden" id="editExpenseId">
        <div class="space-y-4">
          <input id="expenseTitle" class="input-bordered" placeholder="اسم المصروف">
          <input id="expenseAmount" type="number" step="0.01" class="input-bordered" placeholder="المبلغ">
          <textarea id="expenseNotes" rows="4" class="input-bordered" placeholder="ملاحظات"></textarea>
          <div class="grid grid-cols-2 gap-3">
            <button id="saveExpenseBtn" class="btn-primary py-3">حفظ</button>
            <button type="button" onclick="toggleModal('expenseModal', false)" class="bg-gray-100 py-3 rounded-xl font-bold">إلغاء</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    $("openExpenseModalBtn")?.addEventListener("click", openExpenseModal);
    $("saveExpenseBtn")?.addEventListener("click", saveExpense);
    $("expenseFilter")?.addEventListener("change", renderExpenses);

    window.lucide?.createIcons?.();
  }

  function addCustomersTab() {
    if ($("tab-customers")) return;

    const navWrap = $("navButtonsWrap");
    const invoicesBtn = q('[data-tab="invoices"]');

    const btn = document.createElement("button");
    btn.className = "nav-btn flex items-center gap-3 p-3 rounded-xl transition w-full whitespace-nowrap";
    btn.dataset.tab = "customers";
    btn.innerHTML = `<i data-lucide="users"></i> <span>العملاء</span>`;
    btn.onclick = () => window.switchTab ? window.switchTab("customers") : showPatchTab("customers");

    if (navWrap && invoicesBtn) navWrap.insertBefore(btn, invoicesBtn.nextSibling);
    else navWrap?.appendChild(btn);

    const main = q("main");
    const section = document.createElement("section");
    section.id = "tab-customers";
    section.className = "tab-content hidden space-y-6";
    section.innerHTML = `
      <div class="flex flex-wrap justify-between items-center gap-4">
        <h2 class="patch-section-title">العملاء</h2>
        <input id="customersSearch" class="input-bordered max-w-md" placeholder="بحث عن عميل أو رقم جوال">
      </div>

      <div class="card p-4 overflow-x-auto">
        <table class="w-full text-right">
          <thead class="bg-gray-50 text-gray-500">
            <tr>
              <th class="p-4">اسم الزبون</th>
              <th class="p-4">رقم الزبون</th>
              <th class="p-4">عدد الفواتير</th>
              <th class="p-4">الإجمالي</th>
              <th class="p-4">غير مكتمل</th>
              <th class="p-4">الإجراءات</th>
            </tr>
          </thead>
          <tbody id="customersTable"></tbody>
        </table>
      </div>
    `;

    main?.appendChild(section);

    $("customersSearch")?.addEventListener("input", renderCustomers);

    window.lucide?.createIcons?.();
  }

  function patchSwitchTab() {
    const old = window.switchTab;

    window.switchTab = async function patchedSwitchTab(tabId) {
      if (["expenses", "customers"].includes(tabId)) {
        showPatchTab(tabId);
        if (tabId === "expenses") await renderExpenses();
        if (tabId === "customers") await renderCustomers();
        return;
      }

      if (typeof old === "function") {
        const res = await old.apply(this, arguments);
        addConnectionChip();
        hideBackupAndLicenseUi();
        return res;
      }

      showPatchTab(tabId);
    };
  }

  function showPatchTab(tabId) {
    qa(".tab-content").forEach(c => c.classList.add("hidden"));
    qa(".nav-btn").forEach(b => b.classList.remove("active"));

    $(`tab-${tabId}`)?.classList.remove("hidden");
    q(`[data-tab="${tabId}"]`)?.classList.add("active");

    window.lucide?.createIcons?.();
  }

  function getLocalArray(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function setLocalArray(key, value) {
    localStorage.setItem(key, JSON.stringify(value || []));
  }

  function getExpenses() {
    return getLocalArray(`${FIXED_PROJECT_KEY}_expenses`);
  }

  function setExpenses(items) {
    setLocalArray(`${FIXED_PROJECT_KEY}_expenses`, items);
  }

  function openExpenseModal() {
    $("editExpenseId").value = "";
    $("expenseTitle").value = "";
    $("expenseAmount").value = "";
    $("expenseNotes").value = "";
    window.toggleModal?.("expenseModal", true);
  }

  function saveExpense() {
    const id = $("editExpenseId")?.value || `exp_${Date.now()}`;
    const title = $("expenseTitle")?.value.trim();
    const amount = Number($("expenseAmount")?.value || 0);
    const notes = $("expenseNotes")?.value.trim() || "";

    if (!title || amount <= 0) {
      alert("أدخل اسم المصروف والمبلغ");
      return;
    }

    const expenses = getExpenses();
    const old = expenses.find(x => x.id === id);

    const row = {
      id,
      title,
      amount,
      notes,
      date: old?.date || new Date().toISOString()
    };

    const next = old ? expenses.map(x => x.id === id ? row : x) : [row, ...expenses];
    setExpenses(next);

    window.toggleModal?.("expenseModal", false);
    toast("تم حفظ المصروف");
    renderExpenses();
  }

  function deleteExpense(id) {
    if (!confirm("حذف المصروف؟")) return;
    setExpenses(getExpenses().filter(x => x.id !== id));
    renderExpenses();
  }

  function editExpense(id) {
    const item = getExpenses().find(x => x.id === id);
    if (!item) return;

    $("editExpenseId").value = item.id;
    $("expenseTitle").value = item.title || "";
    $("expenseAmount").value = item.amount || "";
    $("expenseNotes").value = item.notes || "";

    window.toggleModal?.("expenseModal", true);
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
    if (filter === "day" || filter === "today") return d >= startToday && d < endToday;
    if (filter === "week") return d >= startWeek && d < endToday;
    if (filter === "month") return d >= startMonth && d < endMonth;
    if (filter === "year") return d >= startYear && d < endYear;

    return true;
  }

  async function renderExpenses() {
    const tbody = $("expensesTable");
    if (!tbody) return;

    const filter = $("expenseFilter")?.value || "day";
    const items = getExpenses()
      .filter(x => inRange(x.date, filter))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = items.reduce((s, x) => s + Number(x.amount || 0), 0);

    if ($("expensesTotal")) $("expensesTotal").textContent = total.toFixed(2) + " ₪";

    tbody.innerHTML = items.length ? items.map(item => `
      <tr class="border-b">
        <td class="p-4 text-sm text-gray-500">${new Date(item.date).toLocaleString("ar-EG")}</td>
        <td class="p-4 font-bold">${escapeHtml(item.title)}</td>
        <td class="p-4 font-bold text-red-600">${Number(item.amount || 0).toFixed(2)} ₪</td>
        <td class="p-4 text-sm">${escapeHtml(item.notes || "-")}</td>
        <td class="p-4">
          <div class="flex gap-2 flex-wrap">
            <button onclick="window.patchEditExpense('${item.id}')" class="text-blue-600 bg-blue-50 px-3 py-1 rounded-lg text-xs font-bold">تعديل</button>
            <button onclick="window.patchDeleteExpense('${item.id}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-bold">حذف</button>
          </div>
        </td>
      </tr>
    `).join("") : `
      <tr>
        <td colspan="5" class="p-8 text-center text-gray-400">لا توجد مصروفات</td>
      </tr>
    `;
  }

  async function renderCustomers() {
    const tbody = $("customersTable");
    if (!tbody) return;

    let invoices = [];
    try {
      if (typeof window.getAllInvoices === "function") {
        invoices = await window.getAllInvoices();
      } else {
        invoices = [];
      }
    } catch {
      invoices = [];
    }

    const search = ($("customersSearch")?.value || "").trim().toLowerCase();
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
          total: 0,
          unpaid: 0
        });
      }

      const row = map.get(key);
      row.count += 1;
      row.total += Number(inv.total || 0);
      if ((inv.status || "paid") !== "paid") {
        row.unpaid += Number(inv.total || 0);
      }
    });

    const rows = Array.from(map.values()).sort((a, b) => b.total - a.total);

    tbody.innerHTML = rows.length ? rows.map(c => `
      <tr class="border-b">
        <td class="p-4 font-bold">${escapeHtml(c.name)}</td>
        <td class="p-4 text-sm">${escapeHtml(c.phone || "-")}</td>
        <td class="p-4">${c.count}</td>
        <td class="p-4 font-bold text-blue-700">${c.total.toFixed(2)} ₪</td>
        <td class="p-4 font-bold text-red-600">${c.unpaid.toFixed(2)} ₪</td>
        <td class="p-4">
          <button onclick="openCustomerHistory('${escapeJs(c.name)}','${escapeJs(c.phone)}')" class="text-blue-600 bg-blue-50 px-3 py-1 rounded-lg text-xs font-bold">السجل</button>
        </td>
      </tr>
    `).join("") : `
      <tr>
        <td colspan="6" class="p-8 text-center text-gray-400">لا يوجد عملاء بعد</td>
      </tr>
    `;
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

  function patchExportsButtons() {
    /*
      التصدير الموجود أصلاً يعتمد على html2canvas و jsPDF.
      هنا فقط نحافظ على الشكل ونضيف إشعار تجهيز احترافي.
    */

    ["exportInvoicePage", "exportBulkInvoices", "exportBulkPurchases"].forEach(name => {
      const old = window[name];
      if (typeof old !== "function") return;

      window[name] = async function patchedExport(...args) {
        await syncLoader("جاري تجهيز الملف...", "سيتم تجهيز الجدول كصورة أو PDF أو طباعة");
        return old.apply(this, args);
      };
    });
  }

  function patchSyncButtons() {
    const oldUpload = window.uploadOfflineDataToCloud;
    if (typeof oldUpload === "function") {
      window.uploadOfflineDataToCloud = async function patchedUpload(...args) {
        await syncLoader("جاري تصدير البيانات أونلاين...", "سيتم رفع بياناتك إلى Firebase");
        const result = await oldUpload.apply(this, args);
        toast("تم تصدير البيانات أونلاين");
        return result;
      };
    }

    window.addEventListener("online", async () => {
      updateConnectionChip();
      await syncLoader("عاد الاتصال بالإنترنت", "يمكنك الآن رفع البيانات أونلاين");
      toast("عاد الإنترنت، النظام جاهز للمزامنة");
    });

    window.addEventListener("offline", () => {
      updateConnectionChip();
      toast("أنت الآن بدون إنترنت، سيستمر النظام محليًا");
    });
  }

  function exposePatchFunctions() {
    window.patchEditExpense = editExpense;
    window.patchDeleteExpense = deleteExpense;
    window.patchRenderExpenses = renderExpenses;
    window.patchRenderCustomers = renderCustomers;
  }

  function waitForAppThenPatch(tries = 100) {
    const hasApp = typeof window.switchTab === "function" || typeof window.toggleModal === "function";

    if (hasApp || tries <= 0) {
      ensureNoLoginSession();
      patchLoginFunctions();
      patchSwitchTab();
      patchExportsButtons();
      patchSyncButtons();

      setTimeout(() => {
        ensureNoLoginSession();
        forceOpenAppUi();
        hideBackupAndLicenseUi();
        addConnectionChip();
      }, 500);

      return;
    }

    setTimeout(() => waitForAppThenPatch(tries - 1), 100);
  }

  function init() {
    injectStyle();
    createSyncOverlay();
    fixToastWrap();
    fixManualTransferSelect();
    fixTableHeaders();
    improvePaymentOptions();
    improvePlaceholders();
    addMobileSideMenu();
    addExpensesTab();
    addCustomersTab();
    exposePatchFunctions();
    ensureNoLoginSession();
    hideLoginAndExpiredPages();
    waitForAppThenPatch();

    console.log("patch.js loaded", PATCH_VERSION);
  }

  ready(init);

})();