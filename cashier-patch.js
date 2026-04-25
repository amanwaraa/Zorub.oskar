/* cashier-patch.js v1.0.0
   باتش مستقل للكود الجديد:
   - يضيف كاشير POS
   - مخزون + باركود + نواقص تلقائية
   - مصروفات
   - دفعات تجار
   - مشتريات تفصيلية تدخل المخزون
   - تقارير أرباح وصافي ربح
   - تصدير صورة/PDF/Excel/طباعة
   - يستخدم نفس state/saveAppState/enqueueSyncOperation/syncQueueToCloud الموجودة في الصفحة
*/

(function () {
  "use strict";

  const PATCH_VERSION = "cashier-patch-v1.0.0";
  const LOW_STOCK_LIMIT = 5;

  function $(id) {
    return document.getElementById(id);
  }

  function q(sel, root = document) {
    return root.querySelector(sel);
  }

  function qa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function safeNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function uid(prefix = "id") {
    if (typeof window.uid === "function") return window.uid(prefix);
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getState() {
    return window.state;
  }

  function hasApp() {
    const s = getState();
    return !!s && !!s.data;
  }

  function currencyText(value) {
    const s = getState();
    if (typeof window.formatCurrency === "function") return window.formatCurrency(value);
    return `${safeNumber(value).toFixed(2)} ${s?.data?.settings?.currency || "شيكل"}`;
  }

  function toast(message, type = "success") {
    if (typeof window.showToast === "function") {
      window.showToast(message, type);
    } else {
      alert(message);
    }
  }

  function saveAll() {
    if (typeof window.saveAppState === "function") window.saveAppState();
  }

  function enqueue(type, payload = {}) {
    if (typeof window.enqueueSyncOperation === "function") {
      window.enqueueSyncOperation({ type, payload });
    }
  }

  function trySync() {
    try {
      if (typeof window.isLocalOnlyMode === "function" && window.isLocalOnlyMode()) return;
      if (navigator.onLine && typeof window.syncQueueToCloud === "function") {
        window.syncQueueToCloud();
      }
    } catch {}
  }

  function renderApp() {
    if (typeof window.render === "function") window.render();
  }

  function ensurePatchData() {
    const s = getState();
    if (!s || !s.data) return;

    if (!Array.isArray(s.data.products)) s.data.products = [];
    if (!Array.isArray(s.data.expenses)) s.data.expenses = [];
    if (!Array.isArray(s.data.merchantPayments)) s.data.merchantPayments = [];
    if (!Array.isArray(s.data.purchaseItems)) s.data.purchaseItems = [];

    if (!s.data.cashierSettings) {
      s.data.cashierSettings = {
        lowStockLimit: LOW_STOCK_LIMIT,
        defaultCustomerName: "زبون كاش",
        autoShortages: true
      };
    }
  }

  function getProductById(id) {
    ensurePatchData();
    return getState().data.products.find(p => p.id === id);
  }

  function getProductByCode(code) {
    ensurePatchData();
    const clean = String(code || "").trim().toLowerCase();
    if (!clean) return null;

    return getState().data.products.find(p =>
      String(p.code || "").trim().toLowerCase() === clean ||
      String(p.barcode || "").trim().toLowerCase() === clean
    );
  }

  function getCustomerByIdSafe(id) {
    if (typeof window.getCustomerById === "function") return window.getCustomerById(id);
    return getState().data.customers.find(c => c.id === id);
  }

  function recalcShortagesFromProducts() {
    const s = getState();
    ensurePatchData();

    const limit = safeNumber(s.data.cashierSettings?.lowStockLimit || LOW_STOCK_LIMIT);
    const auto = s.data.cashierSettings?.autoShortages !== false;
    if (!auto) return;

    const manualShortages = (s.data.shortages || []).filter(x => !x.autoFromProduct);
    const productShortages = (s.data.products || [])
      .filter(p => safeNumber(p.stock) <= limit)
      .map(p => ({
        id: `auto_short_${p.id}`,
        productId: p.id,
        autoFromProduct: true,
        name: p.name || "صنف بدون اسم",
        qty: Math.max(0, limit - safeNumber(p.stock) + 1),
        note: `نقص تلقائي من المخزون - الكمية الحالية ${safeNumber(p.stock)}`,
        createdAt: p.updatedAt || p.createdAt || nowIso()
      }));

    s.data.shortages = [...manualShortages, ...productShortages];
  }

  function upsertProduct(product) {
    const s = getState();
    ensurePatchData();

    const old = product.id ? getProductById(product.id) : null;

    if (old) {
      Object.assign(old, product, { updatedAt: nowIso() });
    } else {
      s.data.products.unshift({
        id: uid("prod"),
        name: "",
        code: "",
        barcode: "",
        supplierName: "",
        cost: 0,
        price: 0,
        stock: 0,
        notes: "",
        createdAt: nowIso(),
        ...product
      });
    }

    recalcShortagesFromProducts();
    enqueue(old ? "edit_product" : "add_product", { name: product.name, code: product.code || product.barcode || "" });
    saveAll();
  }

  function deleteProduct(id) {
    const s = getState();
    ensurePatchData();

    const item = getProductById(id);
    if (!item) return;

    if (!confirm(`حذف الصنف "${item.name}"؟`)) return;

    s.data.products = s.data.products.filter(p => p.id !== id);
    recalcShortagesFromProducts();
    enqueue("delete_product", { id });
    saveAll();
    renderApp();
    toast("تم حذف الصنف", "success");
    trySync();
  }

  function injectStyle() {
    if ($("cashierPatchStyle")) return;

    const style = document.createElement("style");
    style.id = "cashierPatchStyle";
    style.textContent = `
      .cp-pill {
        display:inline-flex;
        align-items:center;
        gap:6px;
        padding:7px 10px;
        border-radius:999px;
        font-size:12px;
        font-weight:900;
        white-space:nowrap;
      }
      .cp-pill-blue { background:#eff6ff; color:#1d4ed8; }
      .cp-pill-green { background:#ecfdf5; color:#166534; }
      .cp-pill-red { background:#fef2f2; color:#b91c1c; }
      .cp-pill-amber { background:#fffbeb; color:#b45309; }
      .cp-card {
        background:rgba(255,255,255,.96);
        border:1px solid #e5e7eb;
        border-radius:28px;
        box-shadow:0 8px 22px rgba(15,23,42,.06);
      }
      .cp-btn {
        border:0;
        border-radius:18px;
        padding:12px 14px;
        font-weight:900;
        transition:.18s ease;
      }
      .cp-btn:active { transform:scale(.98); }
      .cp-table {
        width:100%;
        border-collapse:collapse;
        font-size:13px;
      }
      .cp-table th,.cp-table td {
        padding:10px;
        border-bottom:1px solid #eef2f7;
        text-align:right;
        vertical-align:middle;
      }
      .cp-table th {
        background:#f8fafc;
        color:#334155;
        font-weight:900;
      }
      .cp-product-grid {
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:10px;
      }
      @media(min-width:768px){
        .cp-product-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
      }
      .cp-product-card {
        border:1px solid #e5e7eb;
        background:#fff;
        border-radius:22px;
        padding:14px;
        text-align:right;
      }
      .cp-product-card.low { border-color:#fecaca; background:#fff7f7; }
      .cp-cart-line {
        display:grid;
        grid-template-columns:1fr 84px 86px 42px;
        gap:8px;
        align-items:center;
      }
      @media(max-width:640px){
        .cp-cart-line { grid-template-columns:1fr; }
      }
      .cp-export-area {
        position:fixed;
        right:-99999px;
        top:-99999px;
        width:1150px;
        background:#fff;
        direction:rtl;
        font-family:Cairo,Arial,sans-serif;
      }
    `;
    document.head.appendChild(style);
  }

  function patchNavigation() {
    if (window.__cashierPatchNavigation) return;
    window.__cashierPatchNavigation = true;

    const oldNavigate = window.navigate;
    window.navigate = function patchedNavigate(screen, params = {}) {
      if (screen === "cashier") {
        const s = getState();
        s.currentScreen = "cashier";
        s.screenStack.push("cashier");
        saveAll();
        renderApp();
        return;
      }

      if (screen === "products") {
        const s = getState();
        s.currentScreen = "products";
        s.screenStack.push("products");
        saveAll();
        renderApp();
        return;
      }

      if (screen === "expenses") {
        const s = getState();
        s.currentScreen = "expenses";
        s.screenStack.push("expenses");
        saveAll();
        renderApp();
        return;
      }

      if (screen === "merchants") {
        const s = getState();
        s.currentScreen = "merchants";
        s.screenStack.push("merchants");
        saveAll();
        renderApp();
        return;
      }

      return oldNavigate.apply(this, arguments);
    };
  }

  function patchRender() {
    if (window.__cashierPatchRender) return;
    window.__cashierPatchRender = true;

    const oldRender = window.render;

    window.render = function patchedRender() {
      ensurePatchData();
      const s = getState();

      if (["cashier", "products", "expenses", "merchants"].includes(s.currentScreen)) {
        if (typeof window.rebuildCustomerBalances === "function") window.rebuildCustomerBalances();
        if (typeof window.applyTheme === "function") window.applyTheme();
        if (typeof window.updateHeader === "function") window.updateHeader();

        highlightBottomNav(s.currentScreen);

        const container = $("app-container");
        if (!container) return;

        if (s.currentScreen === "cashier") return renderCashier(container);
        if (s.currentScreen === "products") return renderProducts(container);
        if (s.currentScreen === "expenses") return renderExpenses(container);
        if (s.currentScreen === "merchants") return renderMerchants(container);
      }

      const result = oldRender.apply(this, arguments);
      enhanceRenderedScreen();
      return result;
    };
  }

  function highlightBottomNav(screen) {
    qa(".nav-btn").forEach(btn => {
      btn.classList.remove("text-blue-600", "text-gray-500");
      btn.classList.add("text-gray-500");
    });

    const map = {
      cashier: "nav-home",
      products: "nav-settings",
      expenses: "nav-reports",
      merchants: "nav-settings"
    };

    const active = $(map[screen]);
    if (active) {
      active.classList.remove("text-gray-500");
      active.classList.add("text-blue-600");
    }
  }

  function enhanceRenderedScreen() {
    addQuickButtonsToHome();
    addSettingsShortcuts();
    enhanceReportsIfVisible();
  }

  function addQuickButtonsToHome() {
    const s = getState();
    if (!s || s.currentScreen !== "home") return;

    const container = $("app-container");
    if (!container || $("cashierHomeShortcuts")) return;

    const box = document.createElement("section");
    box.id = "cashierHomeShortcuts";
    box.className = "grid grid-cols-2 sm:grid-cols-4 gap-3";
    box.innerHTML = `
      <button onclick="navigate('cashier')" class="btn fancy-card rounded-3xl p-4 text-right">
        <div class="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
          <i class="fas fa-cash-register"></i>
        </div>
        <div class="font-extrabold">الكاشير</div>
        <div class="text-xs text-slate-500 mt-1">بيع بالباركود</div>
      </button>

      <button onclick="navigate('products')" class="btn fancy-card rounded-3xl p-4 text-right">
        <div class="w-12 h-12 rounded-2xl bg-cyan-100 text-cyan-700 flex items-center justify-center mb-3">
          <i class="fas fa-boxes-stacked"></i>
        </div>
        <div class="font-extrabold">المخزون</div>
        <div class="text-xs text-slate-500 mt-1">الأصناف والكميات</div>
      </button>

      <button onclick="navigate('expenses')" class="btn fancy-card rounded-3xl p-4 text-right">
        <div class="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-3">
          <i class="fas fa-wallet"></i>
        </div>
        <div class="font-extrabold">المصروفات</div>
        <div class="text-xs text-slate-500 mt-1">تخصم من الربح</div>
      </button>

      <button onclick="navigate('merchants')" class="btn fancy-card rounded-3xl p-4 text-right">
        <div class="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mb-3">
          <i class="fas fa-hand-holding-dollar"></i>
        </div>
        <div class="font-extrabold">دفعات التجار</div>
        <div class="text-xs text-slate-500 mt-1">دفعات الموردين</div>
      </button>
    `;

    const firstSpace = container.querySelector(".space-y-6");
    if (firstSpace) firstSpace.insertBefore(box, firstSpace.children[2] || null);
  }

  function addSettingsShortcuts() {
    const s = getState();
    if (!s || s.currentScreen !== "settings") return;

    const container = $("app-container");
    if (!container || $("cashierSettingsShortcuts")) return;

    const box = document.createElement("div");
    box.id = "cashierSettingsShortcuts";
    box.className = "section-card p-6 space-y-4";
    box.innerHTML = `
      <div>
        <h3 class="font-extrabold text-slate-800">إضافات الكاشير</h3>
        <p class="text-sm text-slate-500 mt-1">المخزون والكاشير والمصروفات ودفعات التجار</p>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button onclick="navigate('cashier')" class="cp-btn bg-blue-600 text-white">
          <i class="fas fa-cash-register ml-1"></i> الكاشير
        </button>
        <button onclick="navigate('products')" class="cp-btn bg-cyan-600 text-white">
          <i class="fas fa-boxes-stacked ml-1"></i> المخزون
        </button>
        <button onclick="navigate('expenses')" class="cp-btn bg-red-600 text-white">
          <i class="fas fa-wallet ml-1"></i> المصروفات
        </button>
        <button onclick="navigate('merchants')" class="cp-btn bg-purple-600 text-white">
          <i class="fas fa-hand-holding-dollar ml-1"></i> التجار
        </button>
      </div>

      <div class="grid sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-bold text-slate-700 mb-2">حد النواقص التلقائي</label>
          <input id="cp-low-stock-limit" class="input" type="number" value="${safeNumber(s.data.cashierSettings?.lowStockLimit || LOW_STOCK_LIMIT)}">
        </div>
        <label class="flex items-center justify-between bg-white border border-slate-200 rounded-[22px] p-4 mt-7">
          <span class="font-bold text-sm">تفعيل النواقص التلقائية من المخزون</span>
          <input id="cp-auto-shortages" type="checkbox" class="scale-125" ${s.data.cashierSettings?.autoShortages !== false ? "checked" : ""}>
        </label>
      </div>

      <button onclick="cashierPatchSaveSettings()" class="cp-btn bg-slate-900 text-white w-full">حفظ إعدادات الكاشير</button>
    `;

    const inner = container.querySelector(".space-y-6");
    if (inner) inner.appendChild(box);
  }

  function saveCashierSettings() {
    const s = getState();
    ensurePatchData();

    s.data.cashierSettings.lowStockLimit = Math.max(1, safeNumber($("cp-low-stock-limit")?.value || LOW_STOCK_LIMIT));
    s.data.cashierSettings.autoShortages = !!$("cp-auto-shortages")?.checked;

    recalcShortagesFromProducts();
    enqueue("save_cashier_settings", s.data.cashierSettings);
    saveAll();
    renderApp();
    toast("تم حفظ إعدادات الكاشير", "success");
    trySync();
  }

  function renderCashier(el) {
    ensurePatchData();
    const s = getState();
    const products = s.data.products || [];
    const cart = getCart();

    const subtotal = cart.reduce((sum, item) => sum + safeNumber(item.qty) * safeNumber(item.price), 0);
    const discount = safeNumber(sessionStorage.getItem("cp_discount") || 0);
    const paid = safeNumber(sessionStorage.getItem("cp_paid") || 0);
    const total = Math.max(0, subtotal - discount);
    const remaining = Math.max(0, total - paid);

    el.innerHTML = `
      <div class="space-y-5">
        <div class="flex justify-between items-center gap-3 flex-wrap">
          <div>
            <h2 class="text-2xl font-extrabold text-slate-800">الكاشير</h2>
            <p class="text-sm text-slate-500 mt-1">بيع سريع بالباركود أو اختيار الصنف من المخزون</p>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button onclick="cashierPatchOpenProductModal()" class="cp-btn bg-cyan-600 text-white">
              <i class="fas fa-box ml-1"></i> صنف جديد
            </button>
            <button onclick="navigate('products')" class="cp-btn bg-slate-900 text-white">
              <i class="fas fa-boxes-stacked ml-1"></i> المخزون
            </button>
          </div>
        </div>

        <div class="cp-card p-4">
          <div class="grid sm:grid-cols-3 gap-3">
            <div class="sm:col-span-2">
              <label class="block text-sm font-bold text-slate-700 mb-2">بحث أو باركود</label>
              <input id="cp-pos-search" class="input" placeholder="اكتب كود المنتج أو الاسم ثم Enter" onkeydown="cashierPatchSearchKey(event)" oninput="cashierPatchFilterProducts(this.value)">
            </div>
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">عميل الفاتورة</label>
              <input id="cp-pos-customer-name" class="input" value="${escapeHtml(sessionStorage.getItem("cp_customer_name") || s.data.cashierSettings?.defaultCustomerName || "زبون كاش")}">
            </div>
          </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-4">
          <div class="cp-card p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-extrabold text-slate-800">الأصناف</h3>
              <span class="cp-pill cp-pill-blue">${products.length} صنف</span>
            </div>
            <div id="cp-products-grid" class="cp-product-grid">
              ${renderProductCards(products)}
            </div>
          </div>

          <div class="cp-card p-4">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-extrabold text-slate-800">سلة البيع</h3>
              <button onclick="cashierPatchClearCart()" class="px-3 py-2 rounded-xl bg-red-50 text-red-700 font-bold text-sm">تفريغ</button>
            </div>

            <div id="cp-cart-wrap" class="space-y-2 mb-4">
              ${cart.length ? cart.map(item => renderCartLine(item)).join("") : `<div class="text-center text-slate-400 py-10 bg-slate-50 rounded-[22px]">السلة فارغة</div>`}
            </div>

            <div class="grid sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-bold text-slate-700 mb-2">خصم</label>
                <input id="cp-discount" type="number" class="input" value="${discount}" oninput="cashierPatchSetMoneyFields()">
              </div>
              <div>
                <label class="block text-sm font-bold text-slate-700 mb-2">مدفوع</label>
                <input id="cp-paid" type="number" class="input" value="${paid}" oninput="cashierPatchSetMoneyFields()">
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3 mt-4">
              <div class="bg-slate-50 border border-slate-200 rounded-[20px] p-3">
                <div class="text-xs text-slate-500">الإجمالي</div>
                <div class="font-black text-slate-800 mt-1">${currencyText(subtotal)}</div>
              </div>
              <div class="bg-blue-50 border border-blue-100 rounded-[20px] p-3">
                <div class="text-xs text-blue-600">بعد الخصم</div>
                <div class="font-black text-blue-700 mt-1">${currencyText(total)}</div>
              </div>
              <div class="bg-red-50 border border-red-100 rounded-[20px] p-3">
                <div class="text-xs text-red-600">المتبقي</div>
                <div class="font-black text-red-700 mt-1">${currencyText(remaining)}</div>
              </div>
            </div>

            <button onclick="cashierPatchCheckout()" class="cp-btn bg-blue-600 text-white w-full mt-4 text-lg">
              <i class="fas fa-check-circle ml-1"></i> حفظ الفاتورة
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderProductCards(products) {
    if (!products.length) {
      return `<div class="col-span-full text-center text-slate-400 py-10">لا يوجد أصناف. أضف صنف من زر صنف جديد.</div>`;
    }

    return products.map(p => {
      const low = safeNumber(p.stock) <= safeNumber(getState().data.cashierSettings?.lowStockLimit || LOW_STOCK_LIMIT);
      return `
        <button class="cp-product-card ${low ? "low" : ""}" onclick="cashierPatchAddProductToCart('${p.id}')">
          <div class="flex justify-between gap-2">
            <div class="font-extrabold text-slate-800">${escapeHtml(p.name || "-")}</div>
            ${low ? `<span class="cp-pill cp-pill-red">ناقص</span>` : ""}
          </div>
          <div class="text-xs text-slate-500 mt-1">الكود: ${escapeHtml(p.code || p.barcode || "-")}</div>
          <div class="flex justify-between mt-3">
            <span class="font-bold text-blue-700">${currencyText(p.price || 0)}</span>
            <span class="font-bold ${low ? "text-red-600" : "text-slate-700"}">كمية: ${safeNumber(p.stock)}</span>
          </div>
        </button>
      `;
    }).join("");
  }

  function getCart() {
    try {
      return JSON.parse(sessionStorage.getItem("cp_cart") || "[]");
    } catch {
      return [];
    }
  }

  function setCart(cart) {
    sessionStorage.setItem("cp_cart", JSON.stringify(Array.isArray(cart) ? cart : []));
  }

  function renderCartLine(item) {
    return `
      <div class="cp-cart-line bg-white border border-slate-200 rounded-[18px] p-2">
        <div>
          <div class="font-extrabold text-slate-800">${escapeHtml(item.name)}</div>
          <div class="text-xs text-slate-500">${escapeHtml(item.code || "-")}</div>
        </div>
        <input type="number" class="input" value="${safeNumber(item.qty)}" min="1" onchange="cashierPatchChangeCartQty('${item.productId}', this.value)">
        <div class="font-extrabold text-blue-700">${currencyText(safeNumber(item.qty) * safeNumber(item.price))}</div>
        <button onclick="cashierPatchRemoveCartItem('${item.productId}')" class="w-10 h-10 rounded-xl bg-red-50 text-red-700">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
  }

  function addProductToCart(productId) {
    const product = getProductById(productId);
    if (!product) return;

    if (safeNumber(product.stock) <= 0) {
      toast("هذا الصنف غير متوفر في المخزون", "error");
      return;
    }

    const cart = getCart();
    const found = cart.find(x => x.productId === productId);

    if (found) {
      if (safeNumber(found.qty) + 1 > safeNumber(product.stock)) {
        toast("الكمية المطلوبة أكبر من المخزون", "warning");
        return;
      }
      found.qty = safeNumber(found.qty) + 1;
    } else {
      cart.push({
        productId: product.id,
        name: product.name,
        code: product.code || product.barcode || "",
        qty: 1,
        cost: safeNumber(product.cost),
        price: safeNumber(product.price)
      });
    }

    setCart(cart);
    renderApp();
  }

  function changeCartQty(productId, qty) {
    const product = getProductById(productId);
    const cart = getCart();
    const found = cart.find(x => x.productId === productId);
    if (!found || !product) return;

    const nextQty = Math.max(1, safeNumber(qty));

    if (nextQty > safeNumber(product.stock)) {
      toast("الكمية المطلوبة أكبر من المخزون", "warning");
      found.qty = safeNumber(product.stock);
    } else {
      found.qty = nextQty;
    }

    setCart(cart.filter(x => safeNumber(x.qty) > 0));
    renderApp();
  }

  function removeCartItem(productId) {
    setCart(getCart().filter(x => x.productId !== productId));
    renderApp();
  }

  function clearCart() {
    sessionStorage.removeItem("cp_cart");
    sessionStorage.removeItem("cp_discount");
    sessionStorage.removeItem("cp_paid");
    renderApp();
  }

  function setMoneyFields() {
    sessionStorage.setItem("cp_discount", String(safeNumber($("cp-discount")?.value || 0)));
    sessionStorage.setItem("cp_paid", String(safeNumber($("cp-paid")?.value || 0)));
    sessionStorage.setItem("cp_customer_name", $("cp-pos-customer-name")?.value || "");
    renderApp();
  }

  function filterProducts(query) {
    ensurePatchData();
    const clean = String(query || "").trim().toLowerCase();
    const products = getState().data.products || [];
    const filtered = !clean ? products : products.filter(p =>
      String(p.name || "").toLowerCase().includes(clean) ||
      String(p.code || "").toLowerCase().includes(clean) ||
      String(p.barcode || "").toLowerCase().includes(clean)
    );

    const grid = $("cp-products-grid");
    if (grid) grid.innerHTML = renderProductCards(filtered);
  }

  function searchKey(e) {
    if (e.key !== "Enter") return;

    const val = e.target.value.trim();
    const p = getProductByCode(val);

    if (p) {
      addProductToCart(p.id);
      e.target.value = "";
      filterProducts("");
    } else {
      filterProducts(val);
      toast("لم يتم العثور على صنف بهذا الكود", "warning");
    }
  }

  function checkout() {
    const s = getState();
    ensurePatchData();

    const cart = getCart();
    if (!cart.length) {
      toast("السلة فارغة", "error");
      return;
    }

    const customerName = $("cp-pos-customer-name")?.value?.trim() || s.data.cashierSettings?.defaultCustomerName || "زبون كاش";
    const discount = safeNumber(sessionStorage.getItem("cp_discount") || 0);
    const paidAmount = safeNumber(sessionStorage.getItem("cp_paid") || 0);

    let customer = (s.data.customers || []).find(c => (c.name || "").trim() === customerName);
    if (!customer) {
      customer = {
        id: uid("cust"),
        name: customerName,
        phone: "",
        address: "",
        notes: "",
        creditLimit: s.data.settings.defaultCreditLimit || 0,
        balance: 0,
        payments: [],
        manualDebts: [],
        createdAt: nowIso()
      };
      s.data.customers.push(customer);
    }

    const items = cart.map(x => ({
      productId: x.productId,
      name: x.name,
      code: x.code || "",
      qty: safeNumber(x.qty),
      cost: safeNumber(x.cost),
      price: safeNumber(x.price),
      total: safeNumber(x.qty) * safeNumber(x.price)
    }));

    const subtotal = items.reduce((sum, item) => sum + safeNumber(item.total), 0);
    const totalCost = items.reduce((sum, item) => sum + safeNumber(item.cost) * safeNumber(item.qty), 0);

    const invoice = {
      id: uid("inv"),
      invoiceNumber: typeof window.getNextInvoiceNumber === "function" ? window.getNextInvoiceNumber() : `INV-${Date.now()}`,
      customerId: customer.id,
      date: nowIso(),
      items,
      subtotal,
      totalCost,
      discount,
      paidAmount,
      note: "فاتورة كاشير",
      status: Math.max(0, subtotal - discount - paidAmount) <= 0 ? "completed" : "pending",
      createdAt: nowIso(),
      createdBy: s.session?.userId || "owner",
      source: "cashier_patch"
    };

    for (const item of items) {
      const p = getProductById(item.productId);
      if (p) {
        p.stock = Math.max(0, safeNumber(p.stock) - safeNumber(item.qty));
        p.updatedAt = nowIso();
      }
    }

    s.data.invoices.push(invoice);
    recalcShortagesFromProducts();

    enqueue("cashier_checkout", { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber });
    saveAll();
    clearCart();

    toast("تم حفظ فاتورة الكاشير", "success");
    trySync();

    if (confirm("تم حفظ الفاتورة. هل تريد فتحها؟")) {
      window.navigate("invoiceDetail", { invoiceId: invoice.id });
    } else {
      renderApp();
    }
  }

  function renderProducts(el) {
    ensurePatchData();
    const s = getState();
    const products = s.data.products || [];
    const totalStockValue = products.reduce((sum, p) => sum + safeNumber(p.stock) * safeNumber(p.cost), 0);
    const totalSaleValue = products.reduce((sum, p) => sum + safeNumber(p.stock) * safeNumber(p.price), 0);
    const low = products.filter(p => safeNumber(p.stock) <= safeNumber(s.data.cashierSettings?.lowStockLimit || LOW_STOCK_LIMIT));

    el.innerHTML = `
      <div class="space-y-5">
        <div class="flex justify-between items-center gap-3 flex-wrap">
          <div>
            <h2 class="text-2xl font-extrabold text-slate-800">المخزون</h2>
            <p class="text-sm text-slate-500 mt-1">إدارة الأصناف والباركود والكميات وأسعار الجملة والبيع</p>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button onclick="cashierPatchOpenProductModal()" class="cp-btn bg-blue-600 text-white">
              <i class="fas fa-plus ml-1"></i> إضافة صنف
            </button>
            <button onclick="cashierPatchExportProducts('excel')" class="cp-btn bg-emerald-600 text-white">Excel</button>
            <button onclick="cashierPatchExportProducts('pdf')" class="cp-btn bg-red-600 text-white">PDF</button>
            <button onclick="cashierPatchExportProducts('image')" class="cp-btn bg-green-600 text-white">صورة</button>
            <button onclick="cashierPatchExportProducts('print')" class="cp-btn bg-slate-900 text-white">طباعة</button>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="cp-card p-4">
            <div class="text-xs text-slate-500">عدد الأصناف</div>
            <div class="text-2xl font-black text-slate-800">${products.length}</div>
          </div>
          <div class="cp-card p-4">
            <div class="text-xs text-slate-500">النواقص</div>
            <div class="text-2xl font-black text-red-600">${low.length}</div>
          </div>
          <div class="cp-card p-4">
            <div class="text-xs text-slate-500">قيمة الجملة</div>
            <div class="text-2xl font-black text-amber-600">${currencyText(totalStockValue)}</div>
          </div>
          <div class="cp-card p-4">
            <div class="text-xs text-slate-500">قيمة البيع</div>
            <div class="text-2xl font-black text-blue-700">${currencyText(totalSaleValue)}</div>
          </div>
        </div>

        <div class="cp-card p-4">
          <input id="cp-products-search" class="input mb-4" placeholder="بحث باسم الصنف أو الباركود" oninput="cashierPatchFilterProductsTable(this.value)">
          <div class="overflow-auto">
            <table class="cp-table">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الكود/باركود</th>
                  <th>المورد</th>
                  <th>الكمية</th>
                  <th>جملة</th>
                  <th>بيع</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody id="cp-products-table">
                ${renderProductsRows(products)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function renderProductsRows(products) {
    if (!products.length) {
      return `<tr><td colspan="7" class="text-center text-slate-400 py-8">لا يوجد أصناف</td></tr>`;
    }

    const limit = safeNumber(getState().data.cashierSettings?.lowStockLimit || LOW_STOCK_LIMIT);

    return products.map(p => {
      const isLow = safeNumber(p.stock) <= limit;
      return `
        <tr>
          <td>
            <div class="font-extrabold text-slate-800">${escapeHtml(p.name || "-")}</div>
            ${p.notes ? `<div class="text-xs text-slate-500">${escapeHtml(p.notes)}</div>` : ""}
          </td>
          <td>${escapeHtml(p.code || p.barcode || "-")}</td>
          <td>${escapeHtml(p.supplierName || "-")}</td>
          <td><span class="cp-pill ${isLow ? "cp-pill-red" : "cp-pill-green"}">${safeNumber(p.stock)}</span></td>
          <td>${currencyText(p.cost || 0)}</td>
          <td>${currencyText(p.price || 0)}</td>
          <td>
            <div class="flex gap-2 flex-wrap">
              <button onclick="cashierPatchOpenProductModal('${p.id}')" class="px-3 py-2 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs">تعديل</button>
              <button onclick="cashierPatchDeleteProduct('${p.id}')" class="px-3 py-2 rounded-xl bg-red-50 text-red-700 font-bold text-xs">حذف</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  function filterProductsTable(query) {
    const clean = String(query || "").trim().toLowerCase();
    const products = getState().data.products || [];
    const filtered = !clean ? products : products.filter(p =>
      String(p.name || "").toLowerCase().includes(clean) ||
      String(p.code || "").toLowerCase().includes(clean) ||
      String(p.barcode || "").toLowerCase().includes(clean) ||
      String(p.supplierName || "").toLowerCase().includes(clean)
    );

    const tbody = $("cp-products-table");
    if (tbody) tbody.innerHTML = renderProductsRows(filtered);
  }

  function openProductModal(id = "") {
    ensurePatchData();
    const p = id ? getProductById(id) : null;

    if (typeof window.openModal !== "function") {
      alert("openModal غير موجودة");
      return;
    }

    window.openModal({
      title: p ? "تعديل صنف" : "إضافة صنف للمخزون",
      maxWidth: "860px",
      body: `
        <div class="space-y-4">
          <input id="cp-product-id" type="hidden" value="${escapeHtml(p?.id || "")}">
          <div class="grid sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">اسم الصنف</label>
              <input id="cp-product-name" class="input" value="${escapeHtml(p?.name || "")}" placeholder="مثال: كولا">
            </div>
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">الكود / الباركود</label>
              <input id="cp-product-code" class="input" value="${escapeHtml(p?.code || p?.barcode || "")}" placeholder="امسح أو اكتب الباركود">
            </div>
          </div>

          <div class="grid sm:grid-cols-4 gap-4">
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">الكمية</label>
              <input id="cp-product-stock" type="number" class="input" value="${safeNumber(p?.stock || 0)}">
            </div>
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">سعر الجملة</label>
              <input id="cp-product-cost" type="number" step="0.01" class="input" value="${safeNumber(p?.cost || 0)}">
            </div>
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">سعر البيع</label>
              <input id="cp-product-price" type="number" step="0.01" class="input" value="${safeNumber(p?.price || 0)}">
            </div>
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">المورد</label>
              <input id="cp-product-supplier" class="input" value="${escapeHtml(p?.supplierName || "")}">
            </div>
          </div>

          <div>
            <label class="block text-sm font-bold text-slate-700 mb-2">ملاحظات</label>
            <textarea id="cp-product-notes" class="textarea">${escapeHtml(p?.notes || "")}</textarea>
          </div>
        </div>
      `,
      footer: `
        <div class="flex gap-3">
          <button onclick="closeModal()" class="btn flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 font-bold">إلغاء</button>
          <button onclick="cashierPatchSaveProduct()" class="btn flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold">حفظ الصنف</button>
        </div>
      `
    });
  }

  function saveProductFromModal() {
    const id = $("cp-product-id")?.value || "";
    const name = $("cp-product-name")?.value?.trim() || "";
    const code = $("cp-product-code")?.value?.trim() || "";
    const stock = safeNumber($("cp-product-stock")?.value || 0);
    const cost = safeNumber($("cp-product-cost")?.value || 0);
    const price = safeNumber($("cp-product-price")?.value || 0);
    const supplierName = $("cp-product-supplier")?.value?.trim() || "";
    const notes = $("cp-product-notes")?.value?.trim() || "";

    if (!name) {
      toast("اسم الصنف مطلوب", "error");
      return;
    }

    upsertProduct({
      id: id || undefined,
      name,
      code,
      barcode: code,
      stock,
      cost,
      price,
      supplierName,
      notes
    });

    if (typeof window.closeModal === "function") window.closeModal();
    renderApp();
    toast("تم حفظ الصنف", "success");
    trySync();
  }

  function renderExpenses(el) {
    ensurePatchData();
    const s = getState();
    const items = [...(s.data.expenses || [])].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
    const total = items.reduce((sum, x) => sum + safeNumber(x.amount), 0);

    el.innerHTML = `
      <div class="space-y-5">
        <div class="flex justify-between items-center gap-3 flex-wrap">
          <div>
            <h2 class="text-2xl font-extrabold text-slate-800">المصروفات</h2>
            <p class="text-sm text-slate-500 mt-1">تُخصم تلقائيًا من صافي الربح في التقارير</p>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button onclick="cashierPatchOpenExpenseModal()" class="cp-btn bg-red-600 text-white">
              <i class="fas fa-plus ml-1"></i> إضافة مصروف
            </button>
            <button onclick="cashierPatchExportExpenses('excel')" class="cp-btn bg-emerald-600 text-white">Excel</button>
            <button onclick="cashierPatchExportExpenses('pdf')" class="cp-btn bg-red-600 text-white">PDF</button>
            <button onclick="cashierPatchExportExpenses('image')" class="cp-btn bg-green-600 text-white">صورة</button>
            <button onclick="cashierPatchExportExpenses('print')" class="cp-btn bg-slate-900 text-white">طباعة</button>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div class="cp-card p-4">
            <div class="text-xs text-slate-500">عدد المصروفات</div>
            <div class="text-2xl font-black text-slate-800">${items.length}</div>
          </div>
          <div class="cp-card p-4">
            <div class="text-xs text-slate-500">إجمالي المصروفات</div>
            <div class="text-2xl font-black text-red-600">${currencyText(total)}</div>
          </div>
          <div class="cp-card p-4">
            <div class="text-xs text-slate-500">التأثير</div>
            <div class="text-2xl font-black text-slate-800">تخصم</div>
          </div>
        </div>

        <div class="cp-card p-4 overflow-auto">
          <table class="cp-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الاسم</th>
                <th>المبلغ</th>
                <th>ملاحظات</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(x => `
                <tr>
                  <td>${formatDateSafe(x.date || x.createdAt)}</td>
                  <td class="font-extrabold">${escapeHtml(x.name || "-")}</td>
                  <td class="font-extrabold text-red-600">${currencyText(x.amount)}</td>
                  <td>${escapeHtml(x.notes || "-")}</td>
                  <td>
                    <button onclick="cashierPatchOpenExpenseModal('${x.id}')" class="px-3 py-2 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs">تعديل</button>
                    <button onclick="cashierPatchDeleteExpense('${x.id}')" class="px-3 py-2 rounded-xl bg-red-50 text-red-700 font-bold text-xs">حذف</button>
                  </td>
                </tr>
              `).join("") || `<tr><td colspan="5" class="text-center text-slate-400 py-8">لا توجد مصروفات</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function openExpenseModal(id = "") {
    ensurePatchData();
    const item = id ? getState().data.expenses.find(x => x.id === id) : null;

    window.openModal({
      title: item ? "تعديل مصروف" : "إضافة مصروف",
      maxWidth: "620px",
      body: `
        <div class="space-y-4">
          <input id="cp-expense-id" type="hidden" value="${escapeHtml(item?.id || "")}">
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-2">اسم المصروف</label>
            <input id="cp-expense-name" class="input" value="${escapeHtml(item?.name || "")}" placeholder="مثال: كهرباء، أجار، مواصلات">
          </div>
          <div class="grid sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">المبلغ</label>
              <input id="cp-expense-amount" class="input" type="number" step="0.01" value="${safeNumber(item?.amount || 0)}">
            </div>
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">التاريخ</label>
              <input id="cp-expense-date" class="input" type="datetime-local" value="${dateTimeLocal(item?.date || item?.createdAt)}">
            </div>
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-2">ملاحظات</label>
            <textarea id="cp-expense-notes" class="textarea">${escapeHtml(item?.notes || "")}</textarea>
          </div>
        </div>
      `,
      footer: `
        <div class="flex gap-3">
          <button onclick="closeModal()" class="btn flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 font-bold">إلغاء</button>
          <button onclick="cashierPatchSaveExpense()" class="btn flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-extrabold">حفظ</button>
        </div>
      `
    });
  }

  function saveExpense() {
    const s = getState();
    ensurePatchData();

    const id = $("cp-expense-id")?.value || "";
    const name = $("cp-expense-name")?.value?.trim() || "";
    const amount = safeNumber($("cp-expense-amount")?.value || 0);
    const date = $("cp-expense-date")?.value ? new Date($("cp-expense-date").value).toISOString() : nowIso();
    const notes = $("cp-expense-notes")?.value?.trim() || "";

    if (!name || amount <= 0) {
      toast("أدخل اسم المصروف والمبلغ", "error");
      return;
    }

    const old = s.data.expenses.find(x => x.id === id);
    if (old) {
      Object.assign(old, { name, amount, date, notes, updatedAt: nowIso() });
    } else {
      s.data.expenses.unshift({ id: uid("exp"), name, amount, date, notes, createdAt: nowIso(), createdBy: s.session?.userId || "owner" });
    }

    enqueue(old ? "edit_expense" : "add_expense", { name, amount });
    saveAll();
    window.closeModal?.();
    renderApp();
    toast("تم حفظ المصروف", "success");
    trySync();
  }

  function deleteExpense(id) {
    const s = getState();
    ensurePatchData();
    if (!confirm("حذف المصروف؟")) return;
    s.data.expenses = s.data.expenses.filter(x => x.id !== id);
    enqueue("delete_expense", { id });
    saveAll();
    renderApp();
    toast("تم حذف المصروف", "success");
    trySync();
  }

  function renderMerchants(el) {
    ensurePatchData();
    const s = getState();
    const items = [...(s.data.merchantPayments || [])].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
    const total = items.reduce((sum, x) => sum + safeNumber(x.amount), 0);

    el.innerHTML = `
      <div class="space-y-5">
        <div class="flex justify-between items-center gap-3 flex-wrap">
          <div>
            <h2 class="text-2xl font-extrabold text-slate-800">دفعات التجار</h2>
            <p class="text-sm text-slate-500 mt-1">تسجيل دفعات الموردين والتجار</p>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button onclick="cashierPatchOpenMerchantModal()" class="cp-btn bg-purple-600 text-white">
              <i class="fas fa-plus ml-1"></i> إضافة دفعة
            </button>
            <button onclick="cashierPatchExportMerchants('excel')" class="cp-btn bg-emerald-600 text-white">Excel</button>
            <button onclick="cashierPatchExportMerchants('pdf')" class="cp-btn bg-red-600 text-white">PDF</button>
            <button onclick="cashierPatchExportMerchants('image')" class="cp-btn bg-green-600 text-white">صورة</button>
            <button onclick="cashierPatchExportMerchants('print')" class="cp-btn bg-slate-900 text-white">طباعة</button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="cp-card p-4">
            <div class="text-xs text-slate-500">عدد الدفعات</div>
            <div class="text-2xl font-black text-slate-800">${items.length}</div>
          </div>
          <div class="cp-card p-4">
            <div class="text-xs text-slate-500">إجمالي الدفعات</div>
            <div class="text-2xl font-black text-purple-700">${currencyText(total)}</div>
          </div>
        </div>

        <div class="cp-card p-4 overflow-auto">
          <table class="cp-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>اسم التاجر</th>
                <th>المبلغ</th>
                <th>ملاحظات</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(x => `
                <tr>
                  <td>${formatDateSafe(x.date || x.createdAt)}</td>
                  <td class="font-extrabold">${escapeHtml(x.merchant || "-")}</td>
                  <td class="font-extrabold text-purple-700">${currencyText(x.amount)}</td>
                  <td>${escapeHtml(x.notes || "-")}</td>
                  <td>
                    <button onclick="cashierPatchOpenMerchantModal('${x.id}')" class="px-3 py-2 rounded-xl bg-blue-50 text-blue-700 font-bold text-xs">تعديل</button>
                    <button onclick="cashierPatchDeleteMerchant('${x.id}')" class="px-3 py-2 rounded-xl bg-red-50 text-red-700 font-bold text-xs">حذف</button>
                  </td>
                </tr>
              `).join("") || `<tr><td colspan="5" class="text-center text-slate-400 py-8">لا توجد دفعات</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function openMerchantModal(id = "") {
    ensurePatchData();
    const item = id ? getState().data.merchantPayments.find(x => x.id === id) : null;

    window.openModal({
      title: item ? "تعديل دفعة تاجر" : "إضافة دفعة تاجر",
      maxWidth: "620px",
      body: `
        <div class="space-y-4">
          <input id="cp-merchant-id" type="hidden" value="${escapeHtml(item?.id || "")}">
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-2">اسم التاجر / المورد</label>
            <input id="cp-merchant-name" class="input" value="${escapeHtml(item?.merchant || "")}">
          </div>
          <div class="grid sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">المبلغ</label>
              <input id="cp-merchant-amount" class="input" type="number" step="0.01" value="${safeNumber(item?.amount || 0)}">
            </div>
            <div>
              <label class="block text-sm font-bold text-slate-700 mb-2">التاريخ</label>
              <input id="cp-merchant-date" class="input" type="datetime-local" value="${dateTimeLocal(item?.date || item?.createdAt)}">
            </div>
          </div>
          <div>
            <label class="block text-sm font-bold text-slate-700 mb-2">ملاحظات</label>
            <textarea id="cp-merchant-notes" class="textarea">${escapeHtml(item?.notes || "")}</textarea>
          </div>
        </div>
      `,
      footer: `
        <div class="flex gap-3">
          <button onclick="closeModal()" class="btn flex-1 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 font-bold">إلغاء</button>
          <button onclick="cashierPatchSaveMerchant()" class="btn flex-1 py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold">حفظ</button>
        </div>
      `
    });
  }

  function saveMerchant() {
    const s = getState();
    ensurePatchData();

    const id = $("cp-merchant-id")?.value || "";
    const merchant = $("cp-merchant-name")?.value?.trim() || "";
    const amount = safeNumber($("cp-merchant-amount")?.value || 0);
    const date = $("cp-merchant-date")?.value ? new Date($("cp-merchant-date").value).toISOString() : nowIso();
    const notes = $("cp-merchant-notes")?.value?.trim() || "";

    if (!merchant || amount <= 0) {
      toast("أدخل اسم التاجر والمبلغ", "error");
      return;
    }

    const old = s.data.merchantPayments.find(x => x.id === id);
    if (old) {
      Object.assign(old, { merchant, amount, date, notes, updatedAt: nowIso() });
    } else {
      s.data.merchantPayments.unshift({ id: uid("merchant"), merchant, amount, date, notes, createdAt: nowIso(), createdBy: s.session?.userId || "owner" });
    }

    enqueue(old ? "edit_merchant_payment" : "add_merchant_payment", { merchant, amount });
    saveAll();
    window.closeModal?.();
    renderApp();
    toast("تم حفظ دفعة التاجر", "success");
    trySync();
  }

  function deleteMerchant(id) {
    const s = getState();
    ensurePatchData();
    if (!confirm("حذف دفعة التاجر؟")) return;
    s.data.merchantPayments = s.data.merchantPayments.filter(x => x.id !== id);
    enqueue("delete_merchant_payment", { id });
    saveAll();
    renderApp();
    toast("تم حذف الدفعة", "success");
    trySync();
  }

  function dateTimeLocal(dateValue) {
    const d = dateValue ? new Date(dateValue) : new Date();
    if (isNaN(d.getTime())) return "";
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function formatDateSafe(dateValue) {
    if (typeof window.formatDate === "function") return window.formatDate(dateValue);
    return new Date(dateValue).toLocaleString("ar-EG");
  }

  function getReportPatchData() {
    ensurePatchData();
    const s = getState();

    const invoices = s.data.invoices || [];
    const products = s.data.products || [];
    const expenses = s.data.expenses || [];
    const merchantPayments = s.data.merchantPayments || [];
    const purchases = s.data.purchases || [];

    const sales = invoices.reduce((sum, inv) => {
      if (typeof window.calculateInvoiceTotals === "function") {
        return sum + safeNumber(window.calculateInvoiceTotals(inv).total);
      }
      return sum + safeNumber(inv.subtotal) - safeNumber(inv.discount);
    }, 0);

    const costFromInvoices = invoices.reduce((sum, inv) => {
      if (inv.totalCost != null) return sum + safeNumber(inv.totalCost);
      return sum + (inv.items || []).reduce((a, item) => a + safeNumber(item.cost) * safeNumber(item.qty), 0);
    }, 0);

    const purchasesTotal = purchases.reduce((sum, p) => sum + safeNumber(p.price), 0);
    const expensesTotal = expenses.reduce((sum, e) => sum + safeNumber(e.amount), 0);
    const merchantTotal = merchantPayments.reduce((sum, m) => sum + safeNumber(m.amount), 0);
    const grossProfit = sales - costFromInvoices;
    const netProfit = grossProfit - expensesTotal;

    return {
      products,
      expenses,
      merchantPayments,
      purchases,
      sales,
      costFromInvoices,
      purchasesTotal,
      expensesTotal,
      merchantTotal,
      grossProfit,
      netProfit
    };
  }

  function enhanceReportsIfVisible() {
    const s = getState();
    if (!s || s.currentScreen !== "reports") return;
    const wrap = $("reports-content-wrap");
    if (!wrap || $("cashierPatchReports")) return;

    const data = getReportPatchData();

    const box = document.createElement("div");
    box.id = "cashierPatchReports";
    box.className = "space-y-6 mt-6";
    box.innerHTML = `
      <div class="section-card p-4">
        <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h3 class="font-extrabold text-slate-800">تقارير الكاشير والمخزون</h3>
            <p class="text-sm text-slate-500 mt-1">الأرباح بعد خصم المصروفات، وقيمة المخزون والنواقص ودفعات التجار</p>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button onclick="cashierPatchExportFullReports('print')" class="cp-btn bg-slate-900 text-white">طباعة</button>
            <button onclick="cashierPatchExportFullReports('image')" class="cp-btn bg-green-600 text-white">صورة</button>
            <button onclick="cashierPatchExportFullReports('pdf')" class="cp-btn bg-red-600 text-white">PDF</button>
            <button onclick="cashierPatchExportFullReports('excel')" class="cp-btn bg-emerald-600 text-white">Excel</button>
          </div>
        </div>

        <div id="cashierPatchReportsExportArea">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div class="fancy-card p-4 rounded-[24px]">
              <p class="text-xs text-slate-400">تكلفة المبيعات</p>
              <p class="text-2xl font-extrabold text-amber-600">${currencyText(data.costFromInvoices)}</p>
            </div>
            <div class="fancy-card p-4 rounded-[24px]">
              <p class="text-xs text-slate-400">الربح قبل المصروفات</p>
              <p class="text-2xl font-extrabold text-green-700">${currencyText(data.grossProfit)}</p>
            </div>
            <div class="fancy-card p-4 rounded-[24px]">
              <p class="text-xs text-slate-400">المصروفات</p>
              <p class="text-2xl font-extrabold text-red-600">${currencyText(data.expensesTotal)}</p>
            </div>
            <div class="fancy-card p-4 rounded-[24px]">
              <p class="text-xs text-slate-400">صافي الربح</p>
              <p class="text-2xl font-extrabold ${data.netProfit >= 0 ? "text-blue-700" : "text-red-600"}">${currencyText(data.netProfit)}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <div class="fancy-card p-4 rounded-[24px]">
              <p class="text-xs text-slate-400">أصناف المخزون</p>
              <p class="text-2xl font-extrabold text-slate-800">${data.products.length}</p>
            </div>
            <div class="fancy-card p-4 rounded-[24px]">
              <p class="text-xs text-slate-400">نواقص المخزون</p>
              <p class="text-2xl font-extrabold text-red-600">${data.products.filter(p => safeNumber(p.stock) <= safeNumber(s.data.cashierSettings?.lowStockLimit || LOW_STOCK_LIMIT)).length}</p>
            </div>
            <div class="fancy-card p-4 rounded-[24px]">
              <p class="text-xs text-slate-400">دفعات التجار</p>
              <p class="text-2xl font-extrabold text-purple-700">${currencyText(data.merchantTotal)}</p>
            </div>
            <div class="fancy-card p-4 rounded-[24px]">
              <p class="text-xs text-slate-400">المشتريات</p>
              <p class="text-2xl font-extrabold text-amber-600">${currencyText(data.purchasesTotal)}</p>
            </div>
          </div>
        </div>
      </div>
    `;

    wrap.appendChild(box);
  }

  function createExportArea() {
    let area = $("cashierPatchExportArea");
    if (!area) {
      area = document.createElement("div");
      area.id = "cashierPatchExportArea";
      area.className = "cp-export-area";
      document.body.appendChild(area);
    }
    return area;
  }

  async function exportTable(title, headers, rows, type, filename) {
    const area = createExportArea();
    area.innerHTML = `
      <div style="background:#fff;padding:24px;width:1150px;direction:rtl;font-family:Cairo,Arial,sans-serif">
        <h2 style="margin:0 0 10px;font-size:24px;font-weight:900;color:#0f172a">${escapeHtml(title)}</h2>
        <div style="font-size:12px;color:#64748b;margin-bottom:16px">تاريخ التصدير: ${new Date().toLocaleString("ar-EG")}</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr>${headers.map(h => `<th style="background:#eff6ff;color:#1d4ed8;border:1px solid #e5e7eb;padding:10px">${escapeHtml(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map(row => `
              <tr>${row.map(cell => `<td style="border:1px solid #e5e7eb;padding:10px;text-align:center">${escapeHtml(cell)}</td>`).join("")}</tr>
            `).join("") : `<tr><td colspan="${headers.length}" style="border:1px solid #e5e7eb;padding:18px;text-align:center">لا توجد بيانات</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    if (type === "print") {
      const w = window.open("", "_blank");
      w.document.write(`
        <html dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
        <body>${area.innerHTML}</body></html>
      `);
      w.document.close();
      w.focus();
      w.print();
      return;
    }

    if (type === "excel") {
      if (!window.XLSX) {
        toast("مكتبة Excel غير محملة", "error");
        return;
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), title.slice(0, 25));
      XLSX.writeFile(wb, `${filename}.xlsx`);
      return;
    }

    if (!window.html2canvas) {
      toast("مكتبة الصور غير محملة", "error");
      return;
    }

    const canvas = await html2canvas(area.firstElementChild, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true
    });

    if (type === "image") {
      const a = document.createElement("a");
      a.download = `${filename}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      return;
    }

    if (type === "pdf") {
      if (!window.jspdf?.jsPDF) {
        toast("مكتبة PDF غير محملة", "error");
        return;
      }

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF("l", "px", [1150, 800]);
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 1150, 800);
      pdf.save(`${filename}.pdf`);
    }
  }

  function exportProducts(type) {
    ensurePatchData();
    const rows = (getState().data.products || []).map(p => [
      p.name || "",
      p.code || p.barcode || "",
      p.supplierName || "",
      String(safeNumber(p.stock)),
      String(safeNumber(p.cost)),
      String(safeNumber(p.price)),
      p.notes || ""
    ]);

    return exportTable(
      "تقرير المخزون",
      ["الصنف", "الكود/باركود", "المورد", "الكمية", "سعر الجملة", "سعر البيع", "ملاحظات"],
      rows,
      type,
      "products_report"
    );
  }

  function exportExpenses(type) {
    ensurePatchData();
    const rows = (getState().data.expenses || []).map(e => [
      formatDateSafe(e.date || e.createdAt),
      e.name || "",
      currencyText(e.amount || 0),
      e.notes || ""
    ]);

    return exportTable("تقرير المصروفات", ["التاريخ", "الاسم", "المبلغ", "ملاحظات"], rows, type, "expenses_report");
  }

  function exportMerchants(type) {
    ensurePatchData();
    const rows = (getState().data.merchantPayments || []).map(e => [
      formatDateSafe(e.date || e.createdAt),
      e.merchant || "",
      currencyText(e.amount || 0),
      e.notes || ""
    ]);

    return exportTable("تقرير دفعات التجار", ["التاريخ", "التاجر", "المبلغ", "ملاحظات"], rows, type, "merchant_payments_report");
  }

  async function exportFullReports(type) {
    const d = getReportPatchData();
    const rows = [
      ["إجمالي المبيعات", currencyText(d.sales)],
      ["تكلفة المبيعات", currencyText(d.costFromInvoices)],
      ["الربح قبل المصروفات", currencyText(d.grossProfit)],
      ["المصروفات", currencyText(d.expensesTotal)],
      ["صافي الربح", currencyText(d.netProfit)],
      ["إجمالي المشتريات", currencyText(d.purchasesTotal)],
      ["دفعات التجار", currencyText(d.merchantTotal)],
      ["عدد أصناف المخزون", String(d.products.length)]
    ];

    return exportTable("تقرير الكاشير الشامل", ["البند", "القيمة"], rows, type, "cashier_full_report");
  }

  function patchPurchasesToInventory() {
    if (window.__cashierPatchPurchases) return;
    window.__cashierPatchPurchases = true;

    const oldSavePurchase = window.savePurchase;
    if (typeof oldSavePurchase === "function") {
      window.savePurchase = function patchedSavePurchase() {
        const supplierName = $("purchase-supplier-name")?.value?.trim() || "";
        const price = safeNumber($("purchase-price")?.value || 0);
        const notes = $("purchase-notes")?.value?.trim() || "";

        const result = oldSavePurchase.apply(this, arguments);

        if (supplierName && price > 0 && notes) {
          const maybeItems = parsePurchaseNotesToProducts(notes, supplierName);
          if (maybeItems.length) {
            maybeItems.forEach(item => upsertPurchaseProduct(item, supplierName));
            toast("تمت محاولة إدخال أصناف المشتريات للمخزون من الملاحظات", "success");
          }
        }

        return result;
      };
    }
  }

  function parsePurchaseNotesToProducts(notes, supplierName) {
    const lines = String(notes || "").split(/\n|،/).map(x => x.trim()).filter(Boolean);
    const items = [];

    for (const line of lines) {
      const parts = line.split("*").map(x => x.trim());
      if (parts.length >= 3) {
        items.push({
          name: parts[0],
          qty: safeNumber(parts[1]),
          cost: safeNumber(parts[2]),
          price: safeNumber(parts[3] || parts[2])
        });
      }
    }

    return items.filter(x => x.name && x.qty > 0);
  }

  function upsertPurchaseProduct(item, supplierName) {
    ensurePatchData();
    const s = getState();
    const existing = s.data.products.find(p => (p.name || "").trim() === item.name.trim());

    if (existing) {
      existing.stock = safeNumber(existing.stock) + safeNumber(item.qty);
      existing.cost = item.cost || existing.cost || 0;
      existing.price = item.price || existing.price || 0;
      existing.supplierName = supplierName || existing.supplierName || "";
      existing.updatedAt = nowIso();
    } else {
      s.data.products.push({
        id: uid("prod"),
        name: item.name,
        code: "",
        barcode: "",
        supplierName,
        stock: safeNumber(item.qty),
        cost: safeNumber(item.cost),
        price: safeNumber(item.price),
        notes: "أضيف تلقائيًا من المشتريات",
        createdAt: nowIso()
      });
    }

    recalcShortagesFromProducts();
    enqueue("purchase_item_to_inventory", { name: item.name, qty: item.qty });
    saveAll();
  }

  function expose() {
    window.cashierPatchSaveSettings = saveCashierSettings;

    window.cashierPatchOpenProductModal = openProductModal;
    window.cashierPatchSaveProduct = saveProductFromModal;
    window.cashierPatchDeleteProduct = deleteProduct;
    window.cashierPatchFilterProductsTable = filterProductsTable;

    window.cashierPatchAddProductToCart = addProductToCart;
    window.cashierPatchChangeCartQty = changeCartQty;
    window.cashierPatchRemoveCartItem = removeCartItem;
    window.cashierPatchClearCart = clearCart;
    window.cashierPatchSetMoneyFields = setMoneyFields;
    window.cashierPatchFilterProducts = filterProducts;
    window.cashierPatchSearchKey = searchKey;
    window.cashierPatchCheckout = checkout;

    window.cashierPatchOpenExpenseModal = openExpenseModal;
    window.cashierPatchSaveExpense = saveExpense;
    window.cashierPatchDeleteExpense = deleteExpense;

    window.cashierPatchOpenMerchantModal = openMerchantModal;
    window.cashierPatchSaveMerchant = saveMerchant;
    window.cashierPatchDeleteMerchant = deleteMerchant;

    window.cashierPatchExportProducts = exportProducts;
    window.cashierPatchExportExpenses = exportExpenses;
    window.cashierPatchExportMerchants = exportMerchants;
    window.cashierPatchExportFullReports = exportFullReports;
  }

  function waitForApp(tries = 200) {
    if (hasApp() && typeof window.render === "function" && typeof window.navigate === "function") {
      init();
      return;
    }

    if (tries <= 0) {
      console.error("cashier-patch: app not ready");
      return;
    }

    setTimeout(() => waitForApp(tries - 1), 100);
  }

  function init() {
    injectStyle();
    ensurePatchData();
    expose();
    patchNavigation();
    patchRender();
    patchPurchasesToInventory();
    recalcShortagesFromProducts();
    saveAll();

    setTimeout(() => {
      enhanceRenderedScreen();
      renderApp();
    }, 250);

    console.log("cashier-patch loaded", PATCH_VERSION);
  }

  waitForApp();
})();