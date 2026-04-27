/* cashier-patch.js */
(function () {
  "use strict";

  const PATCH_VERSION = "2026-04-27-fast-camera-v3-override";

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function $(id) {
    return document.getElementById(id);
  }

  function log(...args) {
    console.log("[cashier-patch]", ...args);
  }

  function hasAppReady() {
    return (
      window.state &&
      typeof window.cleanNumber === "function" &&
      typeof window.money === "function" &&
      typeof window.toast === "function"
    );
  }

  async function waitForApp() {
    for (let i = 0; i < 160; i++) {
      if (hasAppReady()) return true;
      await wait(100);
    }

    console.warn("cashier-patch: لم يتم العثور على كائنات التطبيق. تأكد أنك أضفت Object.assign(window,{...}) قبل boot().");
    return false;
  }

  function safeToast(msg, ms) {
    if (typeof window.toast === "function") window.toast(msg, ms);
    else alert(msg);
  }

  function cleanNumber(v, fallback = 0) {
    if (typeof window.cleanNumber === "function") return window.cleanNumber(v, fallback);

    const s = String(v ?? "").trim().replace(",", ".");
    if (!s || s === "." || s === "-") return fallback;

    const n = Number(s);
    return Number.isFinite(n) ? n : fallback;
  }

  function money(v) {
    if (typeof window.money === "function") return window.money(v);
    return `₪ ${cleanNumber(v).toFixed(2)}`;
  }

  function escapeHtml(v) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(v);

    return String(v ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  function normalizeProduct(p) {
    if (typeof window.normalizeProduct === "function") return window.normalizeProduct(p);
    return p || {};
  }

  function unitLabel(unit, custom = "") {
    if (typeof window.unitLabel === "function") return window.unitLabel(unit, custom);

    const map = {
      piece: "قطعة",
      carton: "كرتونة",
      kg: "كيلو",
      g: "جرام",
      liter: "لتر",
      ml: "مل",
      custom: custom || "مخصص"
    };

    return map[unit] || unit || "-";
  }

  function getProductById(id) {
    if (typeof window.getProductById === "function") return window.getProductById(id);
    return window.state?.products?.find(p => p.id === id) || null;
  }

  function getProductByBarcode(code) {
    const c = String(code || "").trim();
    if (!c) return null;

    const list = window.state?.products || [];

    return list.find(p =>
      String(p.barcode || "").trim() === c ||
      String(p.code || "").trim() === c
    ) || null;
  }

  function makeUid(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function todayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function baseUnitForType(unitType) {
    if (unitType === "carton") return "piece";
    if (unitType === "kg") return "kg";
    if (unitType === "liter") return "liter";
    if (unitType === "custom") return "custom";
    return unitType || "piece";
  }

  function getSaleUnitOptionsFixed(product) {
    const p = normalizeProduct(product);

    if (p.unitType === "carton") {
      const cartonUnits = Math.max(1, cleanNumber(p.cartonUnits || p.unitFactor || 1, 1));
      return [
        { value: "piece", label: "قطعة", factor: 1 },
        { value: "carton", label: `كرتونة (${cartonUnits} قطعة)`, factor: cartonUnits }
      ];
    }

    if (p.unitType === "kg") {
      return [
        { value: "kg", label: "كيلو", factor: 1 },
        { value: "g", label: "جرام", factor: 0.001 }
      ];
    }

    if (p.unitType === "liter") {
      return [
        { value: "liter", label: "لتر", factor: 1 },
        { value: "ml", label: "مل", factor: 0.001 }
      ];
    }

    if (p.unitType === "custom") {
      return [
        { value: "custom", label: p.customUnit || "مخصص", factor: 1 }
      ];
    }

    return [
      { value: p.unitType || "piece", label: unitLabel(p.unitType || "piece", p.customUnit), factor: 1 }
    ];
  }

  function getDefaultSaleUnitFixed(product) {
    const p = normalizeProduct(product);

    if (p.unitType === "carton") return "piece";
    if (p.unitType === "kg") return "kg";
    if (p.unitType === "liter") return "liter";
    if (p.unitType === "custom") return "custom";

    return p.unitType || "piece";
  }

  function getUnitFactorFixed(product, selectedUnit) {
    const opt = getSaleUnitOptionsFixed(product).find(x => x.value === selectedUnit);
    return cleanNumber(opt?.factor, 1);
  }

  function getUnitTextFixed(product, selectedUnit) {
    const p = normalizeProduct(product);
    const opt = getSaleUnitOptionsFixed(p).find(x => x.value === selectedUnit);
    return opt?.label || unitLabel(selectedUnit, p.customUnit);
  }

  /*
    المهم هنا:
    في الكيلو/اللتر، نستخدم displaySalePrice/displayCostPrice كسعر الكيلو أو اللتر.
    يعني لتر كولا سعره 10، إذا اختار لتر يبقى 10، وإذا اختار مل يصبح 0.01 لكل مل.
  */
  function getDisplaySalePrice(product) {
    const p = normalizeProduct(product);

    if (p.unitType === "kg" || p.unitType === "liter") {
      return cleanNumber(p.displaySalePrice || p.salePrice || 0);
    }

    if (p.unitType === "carton") {
      return cleanNumber(p.salePrice || 0);
    }

    return cleanNumber(p.displaySalePrice || p.salePrice || 0);
  }

  function getDisplayCostPrice(product) {
    const p = normalizeProduct(product);

    if (p.unitType === "kg" || p.unitType === "liter") {
      return cleanNumber(p.displayCostPrice || p.costPrice || 0);
    }

    if (p.unitType === "carton") {
      return cleanNumber(p.costPrice || 0);
    }

    return cleanNumber(p.displayCostPrice || p.costPrice || 0);
  }

  function priceForLineFixed(product, qtyValue, selectedUnit) {
    const p = normalizeProduct(product);
    const unit = selectedUnit || getDefaultSaleUnitFixed(p);
    const qty = Math.max(0, cleanNumber(qtyValue, 0));
    const factor = getUnitFactorFixed(p, unit);

    let unitPrice = 0;
    let unitCost = 0;

    if (p.unitType === "carton") {
      unitPrice = cleanNumber(p.salePrice) * factor;
      unitCost = cleanNumber(p.costPrice) * factor;
    } else {
      unitPrice = getDisplaySalePrice(p) * factor;
      unitCost = getDisplayCostPrice(p) * factor;
    }

    return {
      qty,
      qtyText: String(qty),
      selectedUnit: unit,
      baseQty: qty * factor,
      unitLabel: getUnitTextFixed(p, unit),
      price: unitPrice,
      costPrice: unitCost,
      total: unitPrice * qty,
      costTotal: unitCost * qty
    };
  }

  function calculateCartTotalsFixed() {
    const cart = window.state?.cart || [];
    const subtotal = cart.reduce((s, x) => s + cleanNumber(x.total), 0);
    const discountType = $("discountType")?.value || "fixed";
    const discountValue = cleanNumber($("discountValue")?.value || 0);

    let discount = discountType === "percent" ? subtotal * discountValue / 100 : discountValue;
    discount = Math.min(Math.max(discount, 0), subtotal);

    const total = subtotal - discount;
    const cost = cart.reduce((s, x) => s + cleanNumber(x.costTotal), 0);
    const profit = total - cost;

    return { subtotal, discount, total, cost, profit };
  }

  function renderCartFixed() {
    const box = $("cartLines");
    if (!box || !window.state) return;

    if (!window.state.cart.length) {
      box.innerHTML = `<div class="muted" style="text-align:center;padding:40px 10px">ابدأ بإضافة المنتجات للفاتورة</div>`;
    } else {
      box.innerHTML = window.state.cart.map((line) => {
        const product = getProductById(line.productId);
        const p = product ? normalizeProduct(product) : null;
        const unitOptions = p ? getSaleUnitOptionsFixed(p) : [];

        return `
          <div class="cart-line" data-cart-line="${escapeHtml(line.id)}">
            <div>
              <b>${escapeHtml(line.name)}</b>
              <div class="muted">
                ${escapeHtml(line.unitLabel || "-")} · يخصم ${cleanNumber(line.baseQty)}
                ${escapeHtml(unitLabel(baseUnitForType(p?.unitType), p?.customUnit))}
              </div>
            </div>

            <select class="select" data-change-cart-unit="${escapeHtml(line.id)}">
              ${unitOptions.map(opt => `
                <option value="${escapeHtml(opt.value)}" ${line.selectedUnit === opt.value ? "selected" : ""}>
                  ${escapeHtml(opt.label)}
                </option>
              `).join("")}
            </select>

            <div style="display:grid;grid-template-columns:34px 1fr 34px;gap:6px;align-items:center">
              <button type="button" class="qty-btn" data-dec-cart="${escapeHtml(line.id)}">-</button>
              <input
                class="input cart-qty-input"
                type="number"
                inputmode="decimal"
                min="0"
                step="0.001"
                data-change-cart-qty="${escapeHtml(line.id)}"
                value="${escapeHtml(String(line.qty ?? 1))}"
                style="text-align:center;padding:8px"
              >
              <button type="button" class="qty-btn" data-inc-cart="${escapeHtml(line.id)}">+</button>
            </div>

            <div class="money line-total">${money(line.total)}</div>

            <button class="danger-btn" data-remove-cart="${escapeHtml(line.id)}" style="padding:8px">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        `;
      }).join("");
    }

    const totals = calculateCartTotalsFixed();

    if ($("cartSubtotal")) $("cartSubtotal").textContent = money(totals.subtotal);
    if ($("cartDiscount")) $("cartDiscount").textContent = money(totals.discount);
    if ($("cartTotal")) $("cartTotal").textContent = money(totals.total);
  }

  function updateCartLineFixed(lineId, patch = {}, rerender = true) {
    const line = window.state?.cart?.find(x => x.id === lineId);
    if (!line) return;

    Object.assign(line, patch);

    const product = getProductById(line.productId);
    if (!product) {
      if (rerender) renderCartFixed();
      return;
    }

    const unit = line.selectedUnit || getDefaultSaleUnitFixed(product);
    const qty = cleanNumber(line.qty, 0);

    Object.assign(line, priceForLineFixed(product, qty, unit));

    if (rerender) {
      renderCartFixed();
    } else {
      const row = document.querySelector(`[data-cart-line="${CSS.escape(lineId)}"]`);
      if (row) {
        const totalEl = row.querySelector(".line-total");
        if (totalEl) totalEl.textContent = money(line.total);
      }

      const totals = calculateCartTotalsFixed();
      if ($("cartSubtotal")) $("cartSubtotal").textContent = money(totals.subtotal);
      if ($("cartDiscount")) $("cartDiscount").textContent = money(totals.discount);
      if ($("cartTotal")) $("cartTotal").textContent = money(totals.total);
    }
  }

  function addToCartFixed(product, selectedUnit = "") {
    if (!product || !window.state) return;

    const p = normalizeProduct(product);
    const unit = selectedUnit || getDefaultSaleUnitFixed(p);
    const existing = window.state.cart.find(x => x.productId === p.id && x.selectedUnit === unit);

    if (existing) {
      const qty = cleanNumber(existing.qty, 1) + 1;
      Object.assign(existing, priceForLineFixed(p, qty, unit));
    } else {
      window.state.cart.push({
        id: makeUid("cart"),
        productId: p.id,
        name: p.name,
        selectedUnit: unit,
        ...priceForLineFixed(p, 1, unit)
      });
    }

    renderCartFixed();
    safeToast(`تمت إضافة ${p.name}`);
  }

  function patchCartEvents() {
    document.addEventListener("click", function (e) {
      const inc = e.target.closest("[data-inc-cart]");
      if (inc) {
        e.preventDefault();
        e.stopImmediatePropagation();

        const line = window.state.cart.find(x => x.id === inc.dataset.incCart);
        if (line) updateCartLineFixed(line.id, { qty: cleanNumber(line.qty, 1) + 1 }, true);
        return;
      }

      const dec = e.target.closest("[data-dec-cart]");
      if (dec) {
        e.preventDefault();
        e.stopImmediatePropagation();

        const line = window.state.cart.find(x => x.id === dec.dataset.decCart);
        if (line) updateCartLineFixed(line.id, { qty: Math.max(0, cleanNumber(line.qty, 1) - 1) }, true);
        return;
      }

      const remove = e.target.closest("[data-remove-cart]");
      if (remove) {
        e.preventDefault();
        e.stopImmediatePropagation();

        confirmPopup({
          title: "حذف صنف من السلة",
          message: "هل تريد حذف هذا الصنف من السلة؟",
          okText: "حذف"
        }).then(ok => {
          if (!ok) return;
          window.state.cart = window.state.cart.filter(x => x.id !== remove.dataset.removeCart);
          renderCartFixed();
          safeToast("تم حذف الصنف من السلة");
        });
      }
    }, true);

    document.addEventListener("change", function (e) {
      const unit = e.target.closest("[data-change-cart-unit]");
      if (!unit) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const line = window.state.cart.find(x => x.id === unit.dataset.changeCartUnit);
      if (line) updateCartLineFixed(line.id, { selectedUnit: unit.value }, true);
    }, true);

    document.addEventListener("input", function (e) {
      const qty = e.target.closest("[data-change-cart-qty]");
      if (!qty) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const line = window.state.cart.find(x => x.id === qty.dataset.changeCartQty);
      if (line) updateCartLineFixed(line.id, { qty: qty.value }, false);
    }, true);

    if ($("discountType")) $("discountType").addEventListener("change", renderCartFixed);
    if ($("discountValue")) $("discountValue").addEventListener("input", renderCartFixed);
  }

  function injectScannerStyle() {
    if ($("fastScannerStyle")) return;

    const style = document.createElement("style");
    style.id = "fastScannerStyle";
    style.textContent = `
      .fast-scanner-backdrop{
        position:fixed;
        inset:0;
        background:#000;
        z-index:999999;
        display:none;
        overflow:hidden;
      }

      .fast-scanner-backdrop.show{
        display:block;
      }

      .fast-scanner-reader{
        width:100vw;
        height:100vh;
        background:#000;
      }

      .fast-scanner-reader video{
        width:100vw!important;
        height:100vh!important;
        object-fit:cover!important;
      }

      .fast-scanner-reader #reader__scan_region,
      .fast-scanner-reader #reader__dashboard,
      .fast-scanner-reader div[id$="__dashboard"],
      .fast-scanner-reader div[id$="__scan_region"]{
        display:none!important;
      }

      .fast-scan-frame{
        pointer-events:none;
        position:fixed;
        top:50%;
        left:50%;
        width:min(82vw,420px);
        height:230px;
        transform:translate(-50%,-50%);
        border:3px solid rgba(255,255,255,.58);
        border-radius:26px;
        z-index:1000002;
        transition:.15s ease;
        box-shadow:
          0 0 0 9999px rgba(0,0,0,.18),
          0 0 30px rgba(255,255,255,.16);
      }

      .fast-scan-frame::before,
      .fast-scan-frame::after{
        content:"";
        position:absolute;
        width:54px;
        height:54px;
        border-color:#22c55e;
        border-style:solid;
        filter:drop-shadow(0 0 12px rgba(34,197,94,.95));
      }

      .fast-scan-frame::before{
        top:-4px;
        right:-4px;
        border-width:6px 6px 0 0;
        border-radius:0 22px 0 0;
      }

      .fast-scan-frame::after{
        left:-4px;
        bottom:-4px;
        border-width:0 0 6px 6px;
        border-radius:0 0 0 22px;
      }

      .fast-laser{
        pointer-events:none;
        position:fixed;
        top:50%;
        left:50%;
        width:min(72vw,360px);
        height:3px;
        transform:translate(-50%,-50%);
        z-index:1000003;
        border-radius:999px;
        background:linear-gradient(90deg,transparent,#22c55e,transparent);
        box-shadow:0 0 22px #22c55e;
        animation:fastLaserMove 1.05s ease-in-out infinite;
      }

      @keyframes fastLaserMove{
        0%,100%{
          transform:translate(-50%,calc(-50% - 95px));
          opacity:.55;
        }
        50%{
          transform:translate(-50%,calc(-50% + 95px));
          opacity:1;
        }
      }

      .fast-scanner-backdrop.detected .fast-scan-frame{
        border-color:#22c55e;
        box-shadow:
          0 0 0 9999px rgba(0,0,0,.12),
          0 0 40px rgba(34,197,94,.9),
          inset 0 0 35px rgba(34,197,94,.25);
        animation:fastGreenPop .28s ease;
      }

      @keyframes fastGreenPop{
        0%{transform:translate(-50%,-50%) scale(.96)}
        60%{transform:translate(-50%,-50%) scale(1.03)}
        100%{transform:translate(-50%,-50%) scale(1)}
      }

      .fast-scanner-top{
        position:fixed;
        top:14px;
        right:14px;
        left:14px;
        z-index:1000005;
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        direction:rtl;
      }

      .fast-scanner-title{
        color:#fff;
        background:rgba(15,23,42,.72);
        border:1px solid rgba(255,255,255,.16);
        backdrop-filter:blur(14px);
        border-radius:18px;
        padding:10px 13px;
        font-weight:900;
        font-family:Cairo,Arial,sans-serif;
        box-shadow:0 12px 30px rgba(0,0,0,.28);
      }

      .fast-scanner-close,
      .fast-scanner-manual{
        border:0;
        border-radius:18px;
        padding:11px 14px;
        background:rgba(255,255,255,.94);
        color:#0f172a;
        font-weight:900;
        font-family:Cairo,Arial,sans-serif;
        box-shadow:0 12px 30px rgba(0,0,0,.24);
      }

      .fast-scanner-bottom{
        position:fixed;
        right:14px;
        left:14px;
        bottom:22px;
        z-index:1000005;
        display:flex;
        justify-content:center;
        gap:10px;
        direction:rtl;
      }

      .fast-scanner-toast{
        position:fixed;
        right:16px;
        left:16px;
        bottom:86px;
        z-index:1000006;
        padding:14px 16px;
        border-radius:18px;
        background:rgba(15,23,42,.96);
        color:#fff;
        font-size:15px;
        font-weight:900;
        text-align:center;
        box-shadow:0 18px 45px rgba(0,0,0,.4);
        border:1px solid rgba(255,255,255,.15);
        transform:translateY(130%);
        opacity:0;
        transition:.22s ease;
        font-family:Cairo,Arial,sans-serif;
        direction:ltr;
      }

      .fast-scanner-toast.show{
        transform:translateY(0);
        opacity:1;
      }

      .fast-scanner-loading{
        position:fixed;
        inset:0;
        z-index:1000001;
        display:flex;
        align-items:center;
        justify-content:center;
        pointer-events:none;
        color:#fff;
        font-family:Cairo,Arial,sans-serif;
        font-weight:900;
        background:linear-gradient(180deg,rgba(2,6,23,.82),rgba(0,0,0,.25));
      }

      .fast-scanner-loader-box{
        background:rgba(15,23,42,.72);
        border:1px solid rgba(255,255,255,.15);
        border-radius:22px;
        padding:16px 18px;
        display:flex;
        align-items:center;
        gap:10px;
        box-shadow:0 20px 50px rgba(0,0,0,.35);
      }

      .fast-scanner-loader{
        width:20px;
        height:20px;
        border-radius:50%;
        border:3px solid rgba(255,255,255,.25);
        border-top-color:#22c55e;
        animation:fastSpin .8s linear infinite;
      }

      @keyframes fastSpin{
        to{transform:rotate(360deg)}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureScannerDom() {
    injectScannerStyle();

    let box = $("fastScannerBackdrop");
    if (box) return box;

    box = document.createElement("div");
    box.id = "fastScannerBackdrop";
    box.className = "fast-scanner-backdrop";
    box.innerHTML = `
      <div class="fast-scanner-top">
        <button id="fastScannerCloseBtn" class="fast-scanner-close" type="button">إغلاق</button>
        <div class="fast-scanner-title">وجّه الكاميرا نحو الباركود</div>
      </div>

      <div id="fastScannerLoading" class="fast-scanner-loading">
        <div class="fast-scanner-loader-box">
          <span class="fast-scanner-loader"></span>
          <span>فتح الكاميرا...</span>
        </div>
      </div>

      <div id="fastScannerReader" class="fast-scanner-reader"></div>
      <div class="fast-scan-frame"></div>
      <div class="fast-laser"></div>

      <div id="fastScannerToast" class="fast-scanner-toast"></div>

      <div class="fast-scanner-bottom">
        <button id="fastScannerManualBtn" class="fast-scanner-manual" type="button">إدخال يدوي</button>
      </div>
    `;

    document.body.appendChild(box);
    return box;
  }

  function loadHtml5Qrcode() {
    return new Promise((resolve, reject) => {
      if (window.Html5Qrcode && window.Html5QrcodeSupportedFormats) {
        resolve(true);
        return;
      }

      const old = document.querySelector('script[data-fast-scanner-lib="1"]');
      if (old) {
        old.addEventListener("load", () => resolve(true));
        old.addEventListener("error", () => reject(new Error("فشل تحميل مكتبة الباركود")));
        return;
      }

      const script = document.createElement("script");
      script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
      script.async = true;
      script.defer = true;
      script.dataset.fastScannerLib = "1";
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("فشل تحميل مكتبة html5-qrcode"));
      document.head.appendChild(script);
    });
  }

  const fastScanner = {
    scanner: null,
    running: false,
    locked: false,
    lastCode: "",
    lastTime: 0,
    targetInputId: "",
    mode: "sale",
    sound: null,
    preloadStarted: false
  };

  function setupSound() {
    if (fastScanner.sound) return fastScanner.sound;

    fastScanner.sound = new Audio("./qr.mp3");
    fastScanner.sound.preload = "auto";
    fastScanner.sound.volume = 1;

    const unlock = () => {
      try {
        fastScanner.sound.play()
          .then(() => {
            fastScanner.sound.pause();
            fastScanner.sound.currentTime = 0;
          })
          .catch(() => {});
      } catch {}
    };

    document.addEventListener("touchstart", unlock, { once: true, passive: true });
    document.addEventListener("click", unlock, { once: true });

    return fastScanner.sound;
  }

  function playScanSound() {
    try {
      const sound = setupSound();
      sound.pause();
      sound.currentTime = 0;
      sound.play().catch(() => {});
    } catch {}
  }

  function vibratePhone() {
    try {
      if (navigator.vibrate) navigator.vibrate([45, 25, 45]);
    } catch {}
  }

  function scannerToast(text) {
    const t = $("fastScannerToast");
    if (!t) return;

    t.textContent = text;
    t.classList.add("show");

    clearTimeout(window.__fastScannerToastTimer);
    window.__fastScannerToastTimer = setTimeout(() => {
      t.classList.remove("show");
    }, 1500);
  }

  function markDetected() {
    const box = $("fastScannerBackdrop");
    if (!box) return;

    box.classList.add("detected");

    clearTimeout(window.__fastDetectedTimer);
    window.__fastDetectedTimer = setTimeout(() => {
      box.classList.remove("detected");
    }, 520);
  }

  async function stopFastScanner() {
    const box = $("fastScannerBackdrop");

    fastScanner.locked = false;

    if (fastScanner.scanner && fastScanner.running) {
      try {
        await fastScanner.scanner.stop();
      } catch {}
    }

    if (fastScanner.scanner) {
      try {
        await fastScanner.scanner.clear();
      } catch {}
    }

    fastScanner.scanner = null;
    fastScanner.running = false;

    if (box) {
      box.classList.remove("show", "detected");
    }

    const reader = $("fastScannerReader");
    if (reader) reader.innerHTML = "";
  }

  function handleFastScannedCode(code) {
    const clean = String(code || "").trim();
    if (!clean) return;

    const now = Date.now();
    if (clean === fastScanner.lastCode && now - fastScanner.lastTime < 800) return;

    fastScanner.lastCode = clean;
    fastScanner.lastTime = now;

    markDetected();
    playScanSound();
    vibratePhone();
    scannerToast(clean);

    /*
      إذا كان المسح داخل نموذج إضافة منتج، فقط ضع الكود بالخانة.
    */
    if (fastScanner.targetInputId) {
      const input = $(fastScanner.targetInputId);
      if (input) {
        input.value = clean;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }

      setTimeout(stopFastScanner, 250);
      return;
    }

    /*
      الكاشير:
      ابحث عن المنتج. إذا موجود أضفه للسلة. إذا لا، لا تضيف شيء واطلع رسالة غير موجود.
    */
    const product = getProductByBarcode(clean);

    if (product) {
      addToCartFixed(product);
      setTimeout(stopFastScanner, 260);
    } else {
      safeToast("لم يتم العثور على منتج بهذا الباركود");
      scannerToast("غير موجود: " + clean);
      fastScanner.locked = false;
    }

    window.dispatchEvent(new CustomEvent("barcode:scanned", {
      detail: { code: clean, product: product || null }
    }));
  }

  async function openFastScanner(mode = "sale", targetInputId = "") {
    const box = ensureScannerDom();
    const loading = $("fastScannerLoading");

    fastScanner.mode = mode;
    fastScanner.targetInputId = targetInputId || "";
    fastScanner.locked = false;

    box.classList.add("show");
    if (loading) loading.style.display = "flex";

    setupSound();

    $("fastScannerCloseBtn").onclick = () => stopFastScanner();

    $("fastScannerManualBtn").onclick = async () => {
      const code = prompt("أدخل الباركود يدويًا");
      if (!code) return;
      handleFastScannedCode(code);
    };

    try {
      await loadHtml5Qrcode();

      if (fastScanner.scanner && fastScanner.running) {
        await stopFastScanner();
        box.classList.add("show");
        if (loading) loading.style.display = "flex";
      }

      $("fastScannerReader").innerHTML = "";

      fastScanner.scanner = new Html5Qrcode("fastScannerReader", {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.AZTEC,
          Html5QrcodeSupportedFormats.PDF_417
        ],
        verbose: false
      });

      const config = {
        fps: 30,
        qrbox: function (viewfinderWidth, viewfinderHeight) {
          return {
            width: Math.floor(viewfinderWidth * 0.82),
            height: Math.floor(viewfinderHeight * 0.34)
          };
        },
        rememberLastUsedCamera: true,
        disableFlip: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        },
        videoConstraints: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [
            { focusMode: "continuous" },
            { exposureMode: "continuous" },
            { whiteBalanceMode: "continuous" }
          ]
        }
      };

      await fastScanner.scanner.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          if (fastScanner.locked) return;

          fastScanner.locked = true;
          handleFastScannedCode(decodedText);

          setTimeout(() => {
            fastScanner.locked = false;
          }, 900);
        },
        () => {}
      );

      fastScanner.running = true;

      if (loading) {
        setTimeout(() => {
          if (fastScanner.running) loading.style.display = "none";
        }, 120);
      }
    } catch (err) {
      console.error(err);

      if (loading) loading.style.display = "none";

      safeToast("تعذر فتح الكاميرا. تأكد من صلاحيات الكاميرا وأن الرابط HTTPS");

      setTimeout(() => {
        const code = prompt("الكاميرا لم تفتح. أدخل الباركود يدويًا:");
        if (code) handleFastScannedCode(code);
        else stopFastScanner();
      }, 250);
    }
  }

  function preloadFastCameraLibrary() {
    if (fastScanner.preloadStarted) return;

    fastScanner.preloadStarted = true;
    setupSound();

    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => loadHtml5Qrcode().catch(() => {}), { timeout: 2500 });
    } else {
      setTimeout(() => loadHtml5Qrcode().catch(() => {}), 500);
    }
  }

  function patchScannerButtons() {
    /*
      هذا capture=true + stopImmediatePropagation
      حتى يمنع الكود القديم نهائيًا من فتح ZXing القديم.
    */
    document.addEventListener("click", function (e) {
      const saleBtn = e.target.closest("#openScannerBtn");
      if (saleBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openFastScanner("sale", "");
        return;
      }

      const productScanBtn = e.target.closest("#scanProductBarcodeBtn");
      if (productScanBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openFastScanner("product", "productBarcode");
        return;
      }

      const manualBtn = e.target.closest("#manualBarcodeBtn");
      if (manualBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();

        const code = prompt("أدخل الباركود أو كود المنتج");
        if (!code) return;

        const product = getProductByBarcode(code);
        if (product) addToCartFixed(product);
        else safeToast("لم يتم العثور على منتج بهذا الكود");
      }
    }, true);

    window.openScanner = openFastScanner;
    window.openFloatingProductBarcodeScanner = (targetInputId = "productBarcode") => {
      openFastScanner("product", targetInputId);
    };
    window.handleScannedCode = handleFastScannedCode;
  }

  function getInventoryTotalsFixed() {
    const products = (window.state?.products || []).map(normalizeProduct);

    let count = products.length;
    let costValue = 0;
    let saleValue = 0;

    products.forEach(p => {
      const stock = cleanNumber(p.stock, 0);

      let cost = cleanNumber(p.costPrice, 0);
      let sale = cleanNumber(p.salePrice, 0);

      if (p.unitType === "kg" || p.unitType === "liter") {
        cost = cleanNumber(p.displayCostPrice || p.costPrice, 0);
        sale = cleanNumber(p.displaySalePrice || p.salePrice, 0);
      }

      costValue += stock * cost;
      saleValue += stock * sale;
    });

    return {
      count,
      costValue,
      saleValue,
      expectedProfit: saleValue - costValue
    };
  }

  function ensureInventorySummaryCards() {
    const page = $("page-inventory");
    if (!page) return;

    let grid = $("inventoryPatchSummaryGrid");
    if (grid) return;

    const wrap = document.createElement("div");
    wrap.id = "inventoryPatchSummaryGrid";
    wrap.className = "inventory-summary-grid";
    wrap.style.marginBottom = "14px";
    wrap.innerHTML = `
      <div class="inventory-summary-card">
        <div class="inventory-summary-title">
          <span>عدد الأصناف</span>
          <i class="fa-solid fa-box"></i>
        </div>
        <div id="patchInventoryTotalProducts" class="inventory-summary-value">0</div>
      </div>

      <div class="inventory-summary-card">
        <div class="inventory-summary-title">
          <span>إجمالي الجملة</span>
          <i class="fa-solid fa-coins"></i>
        </div>
        <div id="patchInventoryCostValue" class="inventory-summary-value gold">₪ 0.00</div>
      </div>

      <div class="inventory-summary-card">
        <div class="inventory-summary-title">
          <span>إجمالي البيع</span>
          <i class="fa-solid fa-sack-dollar"></i>
        </div>
        <div id="patchInventorySaleValue" class="inventory-summary-value green">₪ 0.00</div>
      </div>

      <div class="inventory-summary-card">
        <div class="inventory-summary-title">
          <span>الأرباح المتوقعة</span>
          <i class="fa-solid fa-chart-line"></i>
        </div>
        <div id="patchInventoryExpectedProfit" class="inventory-summary-value dark">₪ 0.00</div>
      </div>
    `;

    const titleRow = page.querySelector("div[style*='justify-content:space-between']");
    if (titleRow && titleRow.nextSibling) {
      page.insertBefore(wrap, titleRow.nextSibling);
    } else {
      page.prepend(wrap);
    }
  }

  function ensureHomeInventoryCards() {
    if ($("homeInventoryPatchGrid")) return;

    const home = $("page-home");
    if (!home) return;

    const card = document.createElement("div");
    card.className = "clean-stats-card";
    card.id = "homeInventoryPatchCard";
    card.style.marginBottom = "16px";
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
        <h2 style="margin:0;font-size:18px;font-weight:900">
          <i class="fa-solid fa-boxes-stacked"></i> ملخص المخزون
        </h2>
      </div>

      <div id="homeInventoryPatchGrid" class="clean-stats-grid">
        <div class="clean-stat">
          <div class="clean-stat-title">
            <span>عدد الأصناف</span>
            <i class="fa-solid fa-box"></i>
          </div>
          <div id="homeInventoryProductsCount" class="clean-stat-value blue">0</div>
        </div>

        <div class="clean-stat">
          <div class="clean-stat-title">
            <span>سعر الجملة للمخزون</span>
            <i class="fa-solid fa-coins"></i>
          </div>
          <div id="homeInventoryCostValue" class="clean-stat-value gold">₪ 0.00</div>
        </div>

        <div class="clean-stat">
          <div class="clean-stat-title">
            <span>سعر البيع للمخزون</span>
            <i class="fa-solid fa-sack-dollar"></i>
          </div>
          <div id="homeInventorySaleValue" class="clean-stat-value green">₪ 0.00</div>
        </div>

        <div class="clean-stat">
          <div class="clean-stat-title">
            <span>الأرباح المتوقعة</span>
            <i class="fa-solid fa-chart-line"></i>
          </div>
          <div id="homeInventoryExpectedProfit" class="clean-stat-value blue">₪ 0.00</div>
        </div>
      </div>
    `;

    const firstStats = home.querySelector(".clean-stats-card");
    if (firstStats && firstStats.nextSibling) {
      firstStats.parentNode.insertBefore(card, firstStats.nextSibling);
    } else {
      home.prepend(card);
    }
  }

  function renderInventorySummaryCards() {
    ensureInventorySummaryCards();
    ensureHomeInventoryCards();

    const t = getInventoryTotalsFixed();

    if ($("patchInventoryTotalProducts")) $("patchInventoryTotalProducts").textContent = String(t.count);
    if ($("patchInventoryCostValue")) $("patchInventoryCostValue").textContent = money(t.costValue);
    if ($("patchInventorySaleValue")) $("patchInventorySaleValue").textContent = money(t.saleValue);
    if ($("patchInventoryExpectedProfit")) $("patchInventoryExpectedProfit").textContent = money(t.expectedProfit);

    if ($("inventoryTotalProducts")) $("inventoryTotalProducts").textContent = String(t.count);
    if ($("inventoryCostValue")) $("inventoryCostValue").textContent = money(t.costValue);
    if ($("inventorySaleValue")) $("inventorySaleValue").textContent = money(t.saleValue);
    if ($("inventoryExpectedProfit")) $("inventoryExpectedProfit").textContent = money(t.expectedProfit);

    if ($("homeInventoryProductsCount")) $("homeInventoryProductsCount").textContent = String(t.count);
    if ($("homeInventoryCostValue")) $("homeInventoryCostValue").textContent = money(t.costValue);
    if ($("homeInventorySaleValue")) $("homeInventorySaleValue").textContent = money(t.saleValue);
    if ($("homeInventoryExpectedProfit")) $("homeInventoryExpectedProfit").textContent = money(t.expectedProfit);
  }

  function patchRenderInventory() {
    const original = window.renderInventory;

    window.renderInventory = function patchedRenderInventory() {
      if (typeof original === "function") {
        try {
          original();
        } catch (e) {
          console.warn("original renderInventory error", e);
        }
      }

      renderInventorySummaryCards();
    };
  }

  function patchRenderHome() {
    const original = window.renderHome;

    window.renderHome = function patchedRenderHome() {
      if (typeof original === "function") {
        try {
          original();
        } catch (e) {
          console.warn("original renderHome error", e);
        }
      }

      renderInventorySummaryCards();
    };
  }

  function patchRenderCart() {
    window.renderCart = renderCartFixed;
    window.calculateCartTotals = calculateCartTotalsFixed;
    window.updateCartLine = updateCartLineFixed;
    window.addToCart = addToCartFixed;
    window.getSaleUnitOptions = getSaleUnitOptionsFixed;
    window.getDefaultSaleUnit = getDefaultSaleUnitFixed;
    window.getUnitFactor = getUnitFactorFixed;
    window.getUnitText = getUnitTextFixed;
    window.priceForLine = priceForLineFixed;
  }

  function confirmPopup({
    title = "تأكيد",
    message = "هل أنت متأكد؟",
    details = "",
    okText = "موافق",
    cancelText = "إلغاء"
  } = {}) {
    return new Promise((resolve) => {
      let back = $("patchConfirmBackdrop");

      if (!back) {
        const style = document.createElement("style");
        style.id = "patchConfirmStyle";
        style.textContent = `
          .patch-confirm-backdrop{
            position:fixed;
            inset:0;
            z-index:1000000;
            background:rgba(15,23,42,.58);
            backdrop-filter:blur(8px);
            display:none;
            align-items:center;
            justify-content:center;
            padding:16px;
            direction:rtl;
            font-family:Cairo,Arial,sans-serif;
          }

          .patch-confirm-backdrop.show{
            display:flex;
          }

          .patch-confirm-box{
            width:min(460px,100%);
            background:#fff;
            border-radius:28px;
            padding:18px;
            box-shadow:0 30px 70px rgba(15,23,42,.3);
            text-align:center;
          }

          .patch-confirm-icon{
            width:72px;
            height:72px;
            border-radius:26px;
            margin:0 auto 13px;
            background:linear-gradient(135deg,#fee2e2,#fff7ed);
            color:#dc2626;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:32px;
          }

          .patch-confirm-title{
            margin:0 0 8px;
            font-size:20px;
            font-weight:900;
            color:#0f172a;
          }

          .patch-confirm-message{
            margin:0;
            color:#64748b;
            line-height:1.8;
            font-size:14px;
          }

          .patch-confirm-details{
            margin-top:10px;
            padding:10px;
            background:#f8fafc;
            border:1px solid #e2e8f0;
            border-radius:16px;
            color:#0f172a;
            font-weight:900;
            font-size:13px;
            line-height:1.7;
          }

          .patch-confirm-actions{
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:10px;
            margin-top:16px;
          }

          .patch-confirm-cancel,
          .patch-confirm-ok{
            border:0;
            border-radius:16px;
            padding:12px 14px;
            font-weight:900;
            font-family:Cairo,Arial,sans-serif;
          }

          .patch-confirm-cancel{
            background:#f1f5f9;
            color:#0f172a;
          }

          .patch-confirm-ok{
            background:linear-gradient(135deg,#ef4444,#b91c1c);
            color:#fff;
            box-shadow:0 14px 28px rgba(220,38,38,.22);
          }
        `;
        document.head.appendChild(style);

        back = document.createElement("div");
        back.id = "patchConfirmBackdrop";
        back.className = "patch-confirm-backdrop";
        back.innerHTML = `
          <div class="patch-confirm-box">
            <div class="patch-confirm-icon">
              <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <h3 id="patchConfirmTitle" class="patch-confirm-title"></h3>
            <p id="patchConfirmMessage" class="patch-confirm-message"></p>
            <div id="patchConfirmDetails" class="patch-confirm-details" style="display:none"></div>
            <div class="patch-confirm-actions">
              <button id="patchConfirmCancel" class="patch-confirm-cancel" type="button"></button>
              <button id="patchConfirmOk" class="patch-confirm-ok" type="button"></button>
            </div>
          </div>
        `;
        document.body.appendChild(back);
      }

      $("patchConfirmTitle").textContent = title;
      $("patchConfirmMessage").textContent = message;
      $("patchConfirmCancel").textContent = cancelText;
      $("patchConfirmOk").textContent = okText;

      if (details) {
        $("patchConfirmDetails").style.display = "block";
        $("patchConfirmDetails").textContent = details;
      } else {
        $("patchConfirmDetails").style.display = "none";
        $("patchConfirmDetails").textContent = "";
      }

      back.classList.add("show");

      const cleanup = (val) => {
        back.classList.remove("show");
        $("patchConfirmCancel").onclick = null;
        $("patchConfirmOk").onclick = null;
        back.onclick = null;
        resolve(val);
      };

      $("patchConfirmCancel").onclick = () => cleanup(false);
      $("patchConfirmOk").onclick = () => cleanup(true);
      back.onclick = (e) => {
        if (e.target === back) cleanup(false);
      };
    });
  }

  function patchConfirmAction() {
    window.confirmAction = function patchedConfirmAction(options = {}) {
      return confirmPopup({
        title: options.title || "تأكيد",
        message: options.message || "هل أنت متأكد؟",
        details: options.details || options.itemName || "",
        okText: options.okText || "موافق"
      });
    };

    window.confirmDelete = function patchedConfirmDelete(options = {}) {
      return confirmPopup({
        title: options.title || "تأكيد الحذف",
        message: options.message || "هل تريد حذف هذا العنصر؟",
        details: options.details || options.itemName || "",
        okText: options.deleteText || options.okText || "حذف",
        cancelText: options.cancelText || "إلغاء"
      });
    };

    window.askDeleteConfirm = window.confirmDelete;
  }

  function findDuplicateCustomerFixed(name, phone, exceptId = "") {
    const n = String(name || "").trim().toLowerCase();
    const p = String(phone || "").trim();

    if (!n && !p) return null;

    return (window.state?.customers || []).find(c => {
      if (exceptId && c.id === exceptId) return false;

      const cn = String(c.name || "").trim().toLowerCase();
      const cp = String(c.phone || "").trim();

      return (p && cp === p) || (n && cn === n);
    }) || null;
  }

  function patchDebtDuplicate() {
    window.findDuplicateCustomer = findDuplicateCustomerFixed;

    const originalEnsureCustomer = window.ensureCustomer;

    window.ensureCustomer = function patchedEnsureCustomer(name, phone) {
      const dup = findDuplicateCustomerFixed(name, phone);

      if (dup) {
        dup.name = name || dup.name;
        dup.phone = phone || dup.phone;
        dup.updatedAt = Date.now();
        safeToast(`الزبون موجود مسبقًا: ${dup.name}`);
        return dup;
      }

      if (typeof originalEnsureCustomer === "function") return originalEnsureCustomer(name, phone);

      const customer = {
        id: makeUid("cus"),
        name: name || "زبون",
        phone: phone || "",
        balance: 0,
        totalSales: 0,
        totalPaid: 0,
        invoicesCount: 0,
        dueDate: "",
        payments: [],
        manualDebts: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      window.state.customers.push(customer);
      return customer;
    };

    const originalOpenDebtCustomerForm = window.openDebtCustomerForm;

    window.openDebtCustomerForm = function patchedOpenDebtCustomerForm(customerId = "") {
      if (typeof originalOpenDebtCustomerForm === "function") {
        originalOpenDebtCustomerForm(customerId);
      }

      setTimeout(() => {
        const form = $("debtCustomerForm");
        if (!form) return;

        const oldHandler = form.onsubmit;

        form.onsubmit = async function (e) {
          const name = $("debtCustomerName")?.value.trim() || "";
          const phone = $("debtCustomerPhone")?.value.trim() || "";
          const existing = findDuplicateCustomerFixed(name, phone, customerId);

          if (existing) {
            e.preventDefault();
            e.stopImmediatePropagation();

            safeToast(`الزبون موجود مسبقًا: ${existing.name}`);

            if (typeof window.openCustomerAccount === "function") {
              if (typeof window.closeModal === "function") window.closeModal();
              setTimeout(() => window.openCustomerAccount(existing.id), 120);
            }

            return false;
          }

          if (typeof oldHandler === "function") return oldHandler.call(this, e);
        };
      }, 80);
    };
  }

  function patchProductAddDefaults() {
    const originalOpenProductForm = window.openProductForm;

    if (typeof originalOpenProductForm !== "function") return;

    window.openProductForm = function patchedOpenProductForm(productId = "") {
      originalOpenProductForm(productId);

      setTimeout(() => {
        if (!productId) {
          const name = $("productName");
          if (name && (name.value === "0" || name.value === "منتج جديد")) name.value = "";

          const stock = $("productStock");
          if (stock && (stock.value === "" || stock.value === "0")) {
            stock.placeholder = "مثال: 1 أو 10";
          }
        }
      }, 80);
    };
  }

  function patchRenderAll() {
    const original = window.renderAll;

    window.renderAll = function patchedRenderAll() {
      if (typeof original === "function") {
        try {
          original();
        } catch (e) {
          console.warn("original renderAll error", e);
        }
      }

      renderCartFixed();
      renderInventorySummaryCards();
    };
  }

  function patchSaveSaleTotals() {
    const originalBuildSaleItems = window.buildSaleItems;

    if (typeof originalBuildSaleItems === "function") {
      window.buildSaleItems = function patchedBuildSaleItems(source) {
        if (source === "cart") {
          return (window.state.cart || []).map(x => ({ ...x }));
        }

        return originalBuildSaleItems(source);
      };
    }

    window.calculateCartTotals = calculateCartTotalsFixed;
  }

  function patchVisibilityStopScanner() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopFastScanner();
    });

    window.addEventListener("beforeunload", () => {
      stopFastScanner();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("fastScannerBackdrop")?.classList.contains("show")) {
        stopFastScanner();
      }
    });
  }

  async function main() {
    const ok = await waitForApp();
    if (!ok) return;

    log("loaded", PATCH_VERSION);

    window.__CASHIER_PATCH_VERSION__ = PATCH_VERSION;

    patchConfirmAction();
    patchRenderCart();
    patchCartEvents();
    patchScannerButtons();
    patchVisibilityStopScanner();
    patchRenderInventory();
    patchRenderHome();
    patchRenderAll();
    patchSaveSaleTotals();
    patchDebtDuplicate();
    patchProductAddDefaults();

    preloadFastCameraLibrary();
    ensureInventorySummaryCards();
    ensureHomeInventoryCards();
    renderInventorySummaryCards();
    renderCartFixed();

    setTimeout(() => {
      renderInventorySummaryCards();
      renderCartFixed();
    }, 400);
  }

  main();
})();