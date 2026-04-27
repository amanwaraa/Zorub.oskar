/* cashier-patch-v3.js */
(function () {
  "use strict";

  const PATCH_VERSION = "v3-html5-qrcode-only";

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const $ = (id) => document.getElementById(id);

  function appReady() {
    return window.state &&
      typeof window.cleanNumber === "function" &&
      typeof window.toast === "function";
  }

  async function waitForApp() {
    for (let i = 0; i < 120; i++) {
      if (appReady()) return true;
      await wait(100);
    }
    console.warn("cashier-patch-v3: لم أجد window.state. تأكد من Object.assign قبل boot().");
    return false;
  }

  function cleanNumber(v, fallback = 0) {
    if (typeof window.cleanNumber === "function") return window.cleanNumber(v, fallback);
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  }

  function toast(msg, ms = 2400) {
    if (typeof window.toast === "function") window.toast(msg, ms);
    else alert(msg);
  }

  function money(v) {
    if (typeof window.money === "function") return window.money(v);
    return `₪ ${cleanNumber(v).toFixed(2)}`;
  }

  function escapeHtml(v) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(v);
    return String(v ?? "").replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
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

  function normalizeProduct(p) {
    if (typeof window.normalizeProduct === "function") return window.normalizeProduct(p);
    return p || {};
  }

  function getProductById(id) {
    if (typeof window.getProductById === "function") return window.getProductById(id);
    return window.state?.products?.find(p => p.id === id) || null;
  }

  function getProductByBarcode(code) {
    const c = String(code || "").trim();
    if (!c) return null;

    const original = typeof window.getProductByBarcode === "function"
      ? window.getProductByBarcode(c)
      : null;

    if (original) return original;

    return (window.state?.products || []).find(p =>
      String(p.barcode || "").trim() === c ||
      String(p.code || "").trim() === c
    ) || null;
  }

  function uid(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
    return cleanNumber(
      getSaleUnitOptionsFixed(product).find(x => x.value === selectedUnit)?.factor,
      1
    );
  }

  function getUnitTextFixed(product, selectedUnit) {
    const p = normalizeProduct(product);
    return getSaleUnitOptionsFixed(p).find(x => x.value === selectedUnit)?.label ||
      unitLabel(selectedUnit, p.customUnit);
  }

  function productSaleBase(product) {
    const p = normalizeProduct(product);

    if (p.unitType === "kg" || p.unitType === "liter") {
      return cleanNumber(p.displaySalePrice || p.salePrice || 0);
    }

    return cleanNumber(p.salePrice || p.displaySalePrice || 0);
  }

  function productCostBase(product) {
    const p = normalizeProduct(product);

    if (p.unitType === "kg" || p.unitType === "liter") {
      return cleanNumber(p.displayCostPrice || p.costPrice || 0);
    }

    return cleanNumber(p.costPrice || p.displayCostPrice || 0);
  }

  function priceForLineFixed(product, qtyValue, selectedUnit) {
    const p = normalizeProduct(product);
    const unit = selectedUnit || getDefaultSaleUnitFixed(p);
    const qty = Math.max(0, cleanNumber(qtyValue, 0));
    const factor = getUnitFactorFixed(p, unit);

    const unitPrice = productSaleBase(p) * factor;
    const unitCost = productCostBase(p) * factor;

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
    const subtotal = (window.state.cart || []).reduce((s, x) => s + cleanNumber(x.total), 0);
    const discountType = $("discountType")?.value || "fixed";
    const discountValue = cleanNumber($("discountValue")?.value || 0);

    let discount = discountType === "percent" ? subtotal * discountValue / 100 : discountValue;
    discount = Math.min(Math.max(discount, 0), subtotal);

    const total = subtotal - discount;
    const cost = (window.state.cart || []).reduce((s, x) => s + cleanNumber(x.costTotal), 0);
    const profit = total - cost;

    return { subtotal, discount, total, cost, profit };
  }

  function renderCartFixed() {
    const box = $("cartLines");
    if (!box || !window.state) return;

    if (!window.state.cart.length) {
      box.innerHTML = `<div class="muted" style="text-align:center;padding:40px 10px">ابدأ بإضافة المنتجات للفاتورة</div>`;
    } else {
      box.innerHTML = window.state.cart.map(line => {
        const product = getProductById(line.productId);
        const p = product ? normalizeProduct(product) : null;
        const opts = p ? getSaleUnitOptionsFixed(p) : [];

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
              ${opts.map(opt => `
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
    Object.assign(line, priceForLineFixed(product, cleanNumber(line.qty, 0), unit));

    if (rerender) {
      renderCartFixed();
    } else {
      const row = document.querySelector(`[data-cart-line="${CSS.escape(lineId)}"]`);
      const totalEl = row?.querySelector(".line-total");
      if (totalEl) totalEl.textContent = money(line.total);

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
        id: uid("cart"),
        productId: p.id,
        name: p.name,
        selectedUnit: unit,
        ...priceForLineFixed(p, 1, unit)
      });
    }

    renderCartFixed();
    toast(`تمت إضافة ${p.name}`);
  }

  function patchCartOnly() {
    window.getSaleUnitOptions = getSaleUnitOptionsFixed;
    window.getDefaultSaleUnit = getDefaultSaleUnitFixed;
    window.getUnitFactor = getUnitFactorFixed;
    window.getUnitText = getUnitTextFixed;
    window.priceForLine = priceForLineFixed;
    window.calculateCartTotals = calculateCartTotalsFixed;
    window.renderCart = renderCartFixed;
    window.updateCartLine = updateCartLineFixed;
    window.addToCart = addToCartFixed;

    document.addEventListener("click", e => {
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
    }, true);

    document.addEventListener("change", e => {
      const unit = e.target.closest("[data-change-cart-unit]");
      if (!unit) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const line = window.state.cart.find(x => x.id === unit.dataset.changeCartUnit);
      if (line) updateCartLineFixed(line.id, { selectedUnit: unit.value }, true);
    }, true);

    document.addEventListener("input", e => {
      const qty = e.target.closest("[data-change-cart-qty]");
      if (!qty) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const line = window.state.cart.find(x => x.id === qty.dataset.changeCartQty);
      if (line) updateCartLineFixed(line.id, { qty: qty.value }, false);
    }, true);
  }

  function injectScannerCss() {
    if ($("newBarcodeScannerStyle")) return;

    const style = document.createElement("style");
    style.id = "newBarcodeScannerStyle";
    style.textContent = `
      .new-camera-page{
        position:fixed;
        inset:0;
        background:#000;
        z-index:999999;
        display:none;
        overflow:hidden;
      }

      .new-camera-page.show{
        display:block;
      }

      #newBarcodeReader{
        width:100vw;
        height:100vh;
        background:#000;
      }

      #newBarcodeReader video{
        width:100vw!important;
        height:100vh!important;
        object-fit:cover!important;
      }

      #newBarcodeReader__scan_region,
      #newBarcodeReader__dashboard,
      #newBarcodeReader div[id$="__scan_region"],
      #newBarcodeReader div[id$="__dashboard"]{
        display:none!important;
      }

      .new-scan-frame{
        pointer-events:none;
        position:fixed;
        top:50%;
        left:50%;
        width:min(82vw,420px);
        height:230px;
        transform:translate(-50%,-50%);
        border:3px solid rgba(255,255,255,.55);
        border-radius:26px;
        z-index:1000010;
        transition:.15s ease;
        box-shadow:
          0 0 0 9999px rgba(0,0,0,.18),
          0 0 30px rgba(255,255,255,.15);
      }

      .new-scan-frame::before,
      .new-scan-frame::after{
        content:"";
        position:absolute;
        width:54px;
        height:54px;
        border-color:#22c55e;
        border-style:solid;
        filter:drop-shadow(0 0 12px rgba(34,197,94,.95));
      }

      .new-scan-frame::before{
        top:-4px;
        right:-4px;
        border-width:6px 6px 0 0;
        border-radius:0 22px 0 0;
      }

      .new-scan-frame::after{
        left:-4px;
        bottom:-4px;
        border-width:0 0 6px 6px;
        border-radius:0 0 0 22px;
      }

      .new-laser{
        position:fixed;
        top:50%;
        left:50%;
        width:min(72vw,360px);
        height:3px;
        transform:translate(-50%,-50%);
        z-index:1000011;
        border-radius:999px;
        background:linear-gradient(90deg,transparent,#22c55e,transparent);
        box-shadow:0 0 22px #22c55e;
        animation:newLaserMove 1.2s ease-in-out infinite;
        pointer-events:none;
      }

      @keyframes newLaserMove{
        0%,100%{
          transform:translate(-50%,calc(-50% - 95px));
          opacity:.55;
        }
        50%{
          transform:translate(-50%,calc(-50% + 95px));
          opacity:1;
        }
      }

      .new-camera-page.detected .new-scan-frame{
        border-color:#22c55e;
        box-shadow:
          0 0 0 9999px rgba(0,0,0,.13),
          0 0 40px rgba(34,197,94,.9),
          inset 0 0 35px rgba(34,197,94,.25);
        animation:newGreenPop .28s ease;
      }

      @keyframes newGreenPop{
        0%{transform:translate(-50%,-50%) scale(.96)}
        60%{transform:translate(-50%,-50%) scale(1.03)}
        100%{transform:translate(-50%,-50%) scale(1)}
      }

      .new-scanner-toast{
        position:fixed;
        right:16px;
        left:16px;
        bottom:28px;
        z-index:1000020;
        padding:15px 18px;
        border-radius:18px;
        background:rgba(15,23,42,.96);
        color:#fff;
        font-size:16px;
        font-weight:800;
        text-align:center;
        box-shadow:0 18px 45px rgba(0,0,0,.4);
        border:1px solid rgba(255,255,255,.15);
        transform:translateY(130%);
        opacity:0;
        transition:.25s ease;
        direction:ltr;
      }

      .new-scanner-toast.show{
        transform:translateY(0);
        opacity:1;
      }

      .new-scanner-top{
        position:fixed;
        top:14px;
        right:14px;
        left:14px;
        z-index:1000021;
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        direction:rtl;
      }

      .new-scanner-btn{
        border:0;
        border-radius:18px;
        padding:11px 14px;
        background:rgba(255,255,255,.94);
        color:#0f172a;
        font-weight:900;
        font-family:Cairo,Arial,sans-serif;
        box-shadow:0 12px 30px rgba(0,0,0,.24);
      }

      .new-scanner-title{
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

      .new-scanner-loading{
        position:fixed;
        inset:0;
        z-index:1000005;
        display:flex;
        align-items:center;
        justify-content:center;
        pointer-events:none;
        color:#fff;
        font-family:Cairo,Arial,sans-serif;
        font-weight:900;
        background:linear-gradient(180deg,rgba(2,6,23,.82),rgba(0,0,0,.25));
      }

      .new-scanner-loading.hide{
        display:none;
      }

      .new-loader-box{
        background:rgba(15,23,42,.72);
        border:1px solid rgba(255,255,255,.15);
        border-radius:22px;
        padding:16px 18px;
        display:flex;
        align-items:center;
        gap:10px;
        box-shadow:0 20px 50px rgba(0,0,0,.35);
      }

      .new-loader{
        width:20px;
        height:20px;
        border-radius:50%;
        border:3px solid rgba(255,255,255,.25);
        border-top-color:#22c55e;
        animation:newSpin .8s linear infinite;
      }

      @keyframes newSpin{
        to{transform:rotate(360deg)}
      }

      .new-scanner-bottom{
        position:fixed;
        right:14px;
        left:14px;
        bottom:86px;
        z-index:1000021;
        display:flex;
        justify-content:center;
        gap:10px;
        direction:rtl;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureScannerDom() {
    injectScannerCss();

    let page = $("newCameraPage");
    if (page) return page;

    page = document.createElement("div");
    page.id = "newCameraPage";
    page.className = "new-camera-page";
    page.innerHTML = `
      <div class="new-scanner-top">
        <button id="newScannerCloseBtn" class="new-scanner-btn" type="button">إغلاق</button>
        <div class="new-scanner-title">كاميرا قارئ الباركود</div>
      </div>

      <div id="newScannerLoading" class="new-scanner-loading">
        <div class="new-loader-box">
          <span class="new-loader"></span>
          <span>فتح الكاميرا...</span>
        </div>
      </div>

      <div id="newBarcodeReader"></div>
      <div class="new-scan-frame"></div>
      <div class="new-laser"></div>
      <div id="newScannerToast" class="new-scanner-toast"></div>

      <div class="new-scanner-bottom">
        <button id="newScannerManualBtn" class="new-scanner-btn" type="button">إدخال يدوي</button>
      </div>
    `;

    document.body.appendChild(page);
    return page;
  }

  function loadHtml5QrCode() {
    return new Promise((resolve, reject) => {
      if (window.Html5Qrcode && window.Html5QrcodeSupportedFormats) {
        resolve();
        return;
      }

      const old = document.querySelector('script[data-html5-qrcode-patch="1"]');
      if (old) {
        old.addEventListener("load", resolve);
        old.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
      script.async = true;
      script.dataset.html5QrcodePatch = "1";
      script.onload = resolve;
      script.onerror = () => reject(new Error("فشل تحميل مكتبة html5-qrcode"));
      document.head.appendChild(script);
    });
  }

  const scannerState = {
    scanner: null,
    running: false,
    lastCode: "",
    lastTime: 0,
    locked: false,
    mode: "sale",
    targetInputId: "",
    sound: null
  };

  function setupSound() {
    if (scannerState.sound) return scannerState.sound;

    scannerState.sound = new Audio("./qr.mp3");
    scannerState.sound.preload = "auto";
    scannerState.sound.volume = 1;

    const unlock = () => {
      scannerState.sound.play()
        .then(() => {
          scannerState.sound.pause();
          scannerState.sound.currentTime = 0;
        })
        .catch(() => {});
    };

    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true, passive: true });

    return scannerState.sound;
  }

  function playBeep() {
    try {
      const s = setupSound();
      s.pause();
      s.currentTime = 0;
      s.play().catch(() => {});
    } catch {}
  }

  function vibratePhone() {
    if (navigator.vibrate) navigator.vibrate([55, 25, 55]);
  }

  function scannerToast(text) {
    const t = $("newScannerToast");
    if (!t) return;

    t.textContent = text;
    t.classList.add("show");

    clearTimeout(window.__newScannerToastTimer);
    window.__newScannerToastTimer = setTimeout(() => {
      t.classList.remove("show");
    }, 1800);
  }

  function markDetected() {
    const page = $("newCameraPage");
    if (!page) return;

    page.classList.add("detected");

    clearTimeout(window.__newDetectedTimer);
    window.__newDetectedTimer = setTimeout(() => {
      page.classList.remove("detected");
    }, 550);
  }

  async function stopNewScanner() {
    if (scannerState.scanner && scannerState.running) {
      try { await scannerState.scanner.stop(); } catch {}
    }

    if (scannerState.scanner) {
      try { await scannerState.scanner.clear(); } catch {}
    }

    scannerState.scanner = null;
    scannerState.running = false;
    scannerState.locked = false;

    const page = $("newCameraPage");
    if (page) page.classList.remove("show", "detected");

    const reader = $("newBarcodeReader");
    if (reader) reader.innerHTML = "";
  }

  function handleBarcodeResult(decodedText, decodedResult = null) {
    const code = String(decodedText || "").trim();
    if (!code) return;

    const now = Date.now();
    if (code === scannerState.lastCode && now - scannerState.lastTime < 900) return;

    scannerState.lastCode = code;
    scannerState.lastTime = now;

    markDetected();
    playBeep();
    vibratePhone();
    scannerToast(code);

    window.dispatchEvent(new CustomEvent("barcode:scanned", {
      detail: { code, result: decodedResult }
    }));

    if (scannerState.targetInputId) {
      const input = $(scannerState.targetInputId);
      if (input) {
        input.value = code;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }

      setTimeout(stopNewScanner, 260);
      return;
    }

    const product = getProductByBarcode(code);

    if (!product) {
      toast("المنتج غير موجود");
      scannerState.locked = false;
      return;
    }

    addToCartFixed(product);
    setTimeout(stopNewScanner, 260);
  }

  async function openNewScanner(mode = "sale", targetInputId = "") {
    scannerState.mode = mode;
    scannerState.targetInputId = targetInputId || "";
    scannerState.locked = false;

    setupSound();

    const page = ensureScannerDom();
    const loading = $("newScannerLoading");
    const reader = $("newBarcodeReader");

    page.classList.add("show");
    if (loading) loading.classList.remove("hide");
    if (reader) reader.innerHTML = "";

    $("newScannerCloseBtn").onclick = stopNewScanner;

    $("newScannerManualBtn").onclick = () => {
      const code = prompt("أدخل الباركود يدويًا");
      if (!code) return;
      handleBarcodeResult(code, null);
    };

    try {
      await loadHtml5QrCode();

      scannerState.scanner = new Html5Qrcode("newBarcodeReader", {
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
        qrbox: function(viewfinderWidth, viewfinderHeight) {
          return {
            width: Math.floor(viewfinderWidth * 0.82),
            height: Math.floor(viewfinderHeight * 0.34)
          };
        },
        aspectRatio: 1.7777778,
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

      await scannerState.scanner.start(
        { facingMode: "environment" },
        config,
        function onScanSuccess(decodedText, decodedResult) {
          if (scannerState.locked) return;

          scannerState.locked = true;
          handleBarcodeResult(decodedText, decodedResult);

          setTimeout(() => {
            scannerState.locked = false;
          }, 1100);
        },
        function onScanFailure() {}
      );

      scannerState.running = true;
      if (loading) loading.classList.add("hide");
    } catch (err) {
      console.error(err);
      if (loading) loading.classList.add("hide");
      scannerToast("اسمح باستخدام الكاميرا");
      toast("اسمح باستخدام الكاميرا أو افتح الموقع عبر HTTPS");
    }
  }

  function hardOverrideOldBarcode() {
    window.openScanner = function patchedOpenScanner(mode = "sale", targetInputId = "") {
      return openNewScanner(mode, targetInputId);
    };

    window.openFloatingProductBarcodeScanner = function patchedFloatingScanner(targetInputId = "productBarcode") {
      return openNewScanner("product", targetInputId);
    };

    window.handleScannedCode = function patchedHandleScannedCode(code) {
      handleBarcodeResult(code, null);
    };

    document.addEventListener("click", function (e) {
      const cameraBtn = e.target.closest("#openScannerBtn");
      if (cameraBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openNewScanner("sale", "");
        return;
      }

      const productCameraBtn = e.target.closest("#scanProductBarcodeBtn");
      if (productCameraBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openNewScanner("product", "productBarcode");
        return;
      }

      const manualBtn = e.target.closest("#manualBarcodeBtn");
      if (manualBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();

        const code = prompt("أدخل الباركود أو كود المنتج");
        if (!code) return;

        const product = getProductByBarcode(code);
        if (!product) {
          toast("المنتج غير موجود");
          return;
        }

        addToCartFixed(product);
      }
    }, true);

    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && $("newCameraPage")?.classList.contains("show")) {
        stopNewScanner();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopNewScanner();
    });

    window.addEventListener("beforeunload", () => {
      stopNewScanner();
    });
  }

  function injectHomeInventoryCards() {
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
          <div class="clean-stat-title"><span>عدد الأصناف</span><i class="fa-solid fa-box"></i></div>
          <div id="homeInventoryProductsCount" class="clean-stat-value blue">0</div>
        </div>

        <div class="clean-stat">
          <div class="clean-stat-title"><span>سعر الجملة للمخزون</span><i class="fa-solid fa-coins"></i></div>
          <div id="homeInventoryCostValue" class="clean-stat-value gold">₪ 0.00</div>
        </div>

        <div class="clean-stat">
          <div class="clean-stat-title"><span>سعر البيع للمخزون</span><i class="fa-solid fa-sack-dollar"></i></div>
          <div id="homeInventorySaleValue" class="clean-stat-value green">₪ 0.00</div>
        </div>

        <div class="clean-stat">
          <div class="clean-stat-title"><span>الأرباح المتوقعة</span><i class="fa-solid fa-chart-line"></i></div>
          <div id="homeInventoryExpectedProfit" class="clean-stat-value blue">₪ 0.00</div>
        </div>
      </div>
    `;

    const first = home.querySelector(".clean-stats-card");
    if (first?.parentNode) first.parentNode.insertBefore(card, first.nextSibling);
    else home.prepend(card);
  }

  function inventoryTotals() {
    const products = (window.state?.products || []).map(normalizeProduct);
    let costValue = 0;
    let saleValue = 0;

    products.forEach(p => {
      const stock = cleanNumber(p.stock);
      costValue += stock * productCostBase(p);
      saleValue += stock * productSaleBase(p);
    });

    return {
      count: products.length,
      costValue,
      saleValue,
      expectedProfit: saleValue - costValue
    };
  }

  function renderInventoryCards() {
    injectHomeInventoryCards();

    const t = inventoryTotals();

    if ($("homeInventoryProductsCount")) $("homeInventoryProductsCount").textContent = String(t.count);
    if ($("homeInventoryCostValue")) $("homeInventoryCostValue").textContent = money(t.costValue);
    if ($("homeInventorySaleValue")) $("homeInventorySaleValue").textContent = money(t.saleValue);
    if ($("homeInventoryExpectedProfit")) $("homeInventoryExpectedProfit").textContent = money(t.expectedProfit);

    if ($("inventoryTotalProducts")) $("inventoryTotalProducts").textContent = String(t.count);
    if ($("inventoryCostValue")) $("inventoryCostValue").textContent = money(t.costValue);
    if ($("inventorySaleValue")) $("inventorySaleValue").textContent = money(t.saleValue);
    if ($("inventoryExpectedProfit")) $("inventoryExpectedProfit").textContent = money(t.expectedProfit);
  }

  function patchRenderers() {
    const originalRenderAll = window.renderAll;
    window.renderAll = function patchedRenderAll() {
      if (typeof originalRenderAll === "function") {
        try { originalRenderAll(); } catch (e) { console.warn(e); }
      }

      renderCartFixed();
      renderInventoryCards();
    };

    const originalRenderInventory = window.renderInventory;
    window.renderInventory = function patchedRenderInventory() {
      if (typeof originalRenderInventory === "function") {
        try { originalRenderInventory(); } catch (e) { console.warn(e); }
      }

      renderInventoryCards();
    };

    const originalRenderHome = window.renderHome;
    window.renderHome = function patchedRenderHome() {
      if (typeof originalRenderHome === "function") {
        try { originalRenderHome(); } catch (e) { console.warn(e); }
      }

      renderInventoryCards();
    };
  }

  function findDuplicateCustomer(name, phone, exceptId = "") {
    const n = String(name || "").trim().toLowerCase();
    const p = String(phone || "").trim();

    if (!n && !p) return null;

    return (window.state?.customers || []).find(c => {
      if (exceptId && c.id === exceptId) return false;

      const cn = String(c.name || "").trim().toLowerCase();
      const cp = String(c.phone || "").trim();

      return (n && cn === n) || (p && cp === p);
    }) || null;
  }

  function patchDebtDuplicates() {
    window.findDuplicateCustomer = findDuplicateCustomer;

    const oldEnsure = window.ensureCustomer;
    window.ensureCustomer = function patchedEnsureCustomer(name, phone) {
      const duplicate = findDuplicateCustomer(name, phone);
      if (duplicate) {
        toast(`الزبون موجود مسبقًا: ${duplicate.name}`);
        return duplicate;
      }

      if (typeof oldEnsure === "function") return oldEnsure(name, phone);

      const customer = {
        id: uid("cus"),
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
  }

  function confirmPopup({ title = "تأكيد", message = "هل أنت متأكد؟", details = "", okText = "موافق" } = {}) {
    return new Promise(resolve => {
      let back = $("patchConfirmBackdrop");

      if (!back) {
        const style = document.createElement("style");
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
          .patch-confirm-backdrop.show{display:flex}
          .patch-confirm-box{
            width:min(460px,100%);
            background:#fff;
            border-radius:28px;
            padding:18px;
            box-shadow:0 30px 70px rgba(15,23,42,.3);
            text-align:center;
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
          }
        `;
        document.head.appendChild(style);

        back = document.createElement("div");
        back.id = "patchConfirmBackdrop";
        back.className = "patch-confirm-backdrop";
        back.innerHTML = `
          <div class="patch-confirm-box">
            <h3 id="patchConfirmTitle" class="patch-confirm-title"></h3>
            <p id="patchConfirmMessage" class="patch-confirm-message"></p>
            <div id="patchConfirmDetails" class="patch-confirm-details" style="display:none"></div>
            <div class="patch-confirm-actions">
              <button id="patchConfirmCancel" class="patch-confirm-cancel" type="button">إلغاء</button>
              <button id="patchConfirmOk" class="patch-confirm-ok" type="button"></button>
            </div>
          </div>
        `;
        document.body.appendChild(back);
      }

      $("patchConfirmTitle").textContent = title;
      $("patchConfirmMessage").textContent = message;
      $("patchConfirmOk").textContent = okText;

      if (details) {
        $("patchConfirmDetails").style.display = "block";
        $("patchConfirmDetails").textContent = details;
      } else {
        $("patchConfirmDetails").style.display = "none";
      }

      back.classList.add("show");

      const finish = (val) => {
        back.classList.remove("show");
        $("patchConfirmCancel").onclick = null;
        $("patchConfirmOk").onclick = null;
        back.onclick = null;
        resolve(val);
      };

      $("patchConfirmCancel").onclick = () => finish(false);
      $("patchConfirmOk").onclick = () => finish(true);
      back.onclick = e => {
        if (e.target === back) finish(false);
      };
    });
  }

  function patchConfirm() {
    window.confirmAction = function (options = {}) {
      return confirmPopup({
        title: options.title || "تأكيد",
        message: options.message || "هل أنت متأكد؟",
        details: options.details || options.itemName || "",
        okText: options.okText || "موافق"
      });
    };

    window.confirmDelete = function (options = {}) {
      return confirmPopup({
        title: options.title || "تأكيد الحذف",
        message: options.message || "هل تريد حذف هذا العنصر؟",
        details: options.details || options.itemName || "",
        okText: options.deleteText || options.okText || "حذف"
      });
    };

    window.askDeleteConfirm = window.confirmDelete;
  }

  async function preloadScannerLib() {
    try {
      setupSound();
      await loadHtml5QrCode();
    } catch {}
  }

  async function main() {
    const ready = await waitForApp();
    if (!ready) return;

    window.__CASHIER_PATCH_VERSION__ = PATCH_VERSION;

    patchCartOnly();
    hardOverrideOldBarcode();
    patchRenderers();
    patchDebtDuplicates();
    patchConfirm();

    renderCartFixed();
    renderInventoryCards();

    setTimeout(preloadScannerLib, 300);

    if (typeof window.renderAll === "function") {
      setTimeout(() => {
        try { window.renderAll(); } catch {}
      }, 300);
    }
  }

  main();
})();