/* cashier-patch.js
   باتش إصلاحات للكود الأصلي:
   1) إصلاح جدول المخزون والأرصدة: عدد المنتجات، قيمة البيع، قيمة الجملة، الربح المتوقع.
   2) إصلاح renderInventory لتطابق 15 عمود.
   3) إضافة دوال تأكيد حذف ناقصة: confirmDelete + askDeleteConfirm.
   4) استبدال قارئ الباركود بواجهة html5-qrcode الاحترافية مع صوت qr.mp3.
   5) جعل الأزرار التي كانت تعتمد على openScanner تستخدم القارئ الجديد.
*/

(function () {
  "use strict";

  const PATCH_VERSION = "cashier-patch-v1.0.0";

  function waitForApp(callback, tries = 0) {
    if (
      typeof window.document !== "undefined" &&
      document.body &&
      typeof window.Html5Qrcode !== "undefined"
    ) {
      callback();
      return;
    }

    if (tries > 120) {
      console.warn("[PATCH] لم يتم تحميل الصفحة أو مكتبة html5-qrcode");
      callback();
      return;
    }

    setTimeout(() => waitForApp(callback, tries + 1), 100);
  }

  function $(id) {
    return document.getElementById(id);
  }

  function getState() {
    return window.state || null;
  }

  function safeCall(name, ...args) {
    try {
      if (typeof window[name] === "function") {
        return window[name](...args);
      }
    } catch (e) {
      console.warn("[PATCH] safeCall error:", name, e);
    }
    return null;
  }

  function cleanNumber(v, fallback = 0) {
    if (typeof window.cleanNumber === "function") return window.cleanNumber(v, fallback);

    const s = String(v ?? "").trim().replace(",", ".");
    if (s === "." || s === "" || s === "-") return fallback;
    const n = Number(s);
    return Number.isFinite(n) ? n : fallback;
  }

  function escapeHtml(str) {
    if (typeof window.escapeHtml === "function") return window.escapeHtml(str);

    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  function money(value) {
    if (typeof window.money === "function") return window.money(value);

    const n = cleanNumber(value);
    const currency =
      window.state?.settings?.currency ||
      window.defaultSettings?.currency ||
      "₪";

    return `${currency} ${n.toFixed(2)}`;
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
      minutes: "دقائق",
      custom: custom || "مخصص"
    };

    return map[unit] || unit || "-";
  }

  function normalizeProduct(p = {}) {
    if (typeof window.normalizeProduct === "function") return window.normalizeProduct(p);

    return {
      ...p,
      stock: cleanNumber(p.stock),
      costPrice: cleanNumber(p.costPrice),
      salePrice: cleanNumber(p.salePrice),
      displaySalePrice: cleanNumber(p.displaySalePrice || p.salePrice),
      displayCostPrice: cleanNumber(p.displayCostPrice || p.costPrice),
      lowStock: cleanNumber(p.lowStock || 5),
      baseUnit: p.baseUnit || "piece",
      unitType: p.unitType || "piece",
      customUnit: p.customUnit || "",
      cartonUnits: cleanNumber(p.cartonUnits || 1, 1)
    };
  }

  function getProductById(id) {
    if (typeof window.getProductById === "function") return window.getProductById(id);
    return window.state?.products?.find((p) => p.id === id) || null;
  }

  function getProductByBarcode(code) {
    if (typeof window.getProductByBarcode === "function") return window.getProductByBarcode(code);

    const c = String(code || "").trim();
    if (!c) return null;

    return window.state?.products?.find((p) =>
      String(p.barcode || "").trim() === c ||
      String(p.code || "").trim() === c
    ) || null;
  }

  function toast(msg, ms = 2600) {
    if (typeof window.toast === "function") {
      window.toast(msg, ms);
      return;
    }

    const old = $("toast");
    if (old) {
      old.textContent = msg;
      old.classList.add("show");
      clearTimeout(old._patchTimer);
      old._patchTimer = setTimeout(() => old.classList.remove("show"), ms);
      return;
    }

    alert(msg);
  }

  function todayKey(date = new Date()) {
    if (typeof window.todayKey === "function") return window.todayKey(date);

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function getInventoryValueTotalsPatch() {
    const state = getState();
    const products = (state?.products || []).map(normalizeProduct);

    const costValue = products.reduce((s, p) => {
      return s + cleanNumber(p.stock) * cleanNumber(p.costPrice);
    }, 0);

    const saleValue = products.reduce((s, p) => {
      return s + cleanNumber(p.stock) * cleanNumber(p.salePrice);
    }, 0);

    return {
      count: products.length,
      costValue,
      saleValue,
      expectedProfit: saleValue - costValue
    };
  }

  function renderInventoryPatch() {
    const state = getState();
    if (!state || !$("inventoryTable")) return;

    const q = ($("inventorySearch")?.value || "").trim().toLowerCase();
    const totals = getInventoryValueTotalsPatch();

    if ($("inventoryTotalProducts")) $("inventoryTotalProducts").textContent = totals.count;
    if ($("inventorySaleValue")) $("inventorySaleValue").textContent = money(totals.saleValue);
    if ($("inventoryCostValue")) $("inventoryCostValue").textContent = money(totals.costValue);
    if ($("inventoryExpectedProfit")) $("inventoryExpectedProfit").textContent = money(totals.expectedProfit);

    const rows = (state.products || [])
      .filter((p) =>
        !q ||
        String(p.name || "").toLowerCase().includes(q) ||
        String(p.barcode || "").includes(q) ||
        String(p.code || "").includes(q) ||
        String(p.category || "").toLowerCase().includes(q)
      )
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"))
      .map((product) => {
        const p = normalizeProduct(product);

        const lowLimit = cleanNumber(p.lowStock || state.settings?.lowStock || 5, 5);
        const low = cleanNumber(p.stock) <= lowLimit;

        const conversionText =
          p.unitType === "carton"
            ? `1 كرتونة = ${cleanNumber(p.cartonUnits, 1)} قطعة`
            : p.unitType === "kg"
              ? "1 كيلو = 1000 جرام"
              : p.unitType === "liter"
                ? "1 لتر = 1000 مل"
                : "-";

        const stock = cleanNumber(p.stock);
        const costPrice = cleanNumber(p.costPrice);
        const salePrice = cleanNumber(p.salePrice);

        const costValue = stock * costPrice;
        const saleValue = stock * salePrice;
        const profitValue = saleValue - costValue;

        const selectedUnitPrice =
          p.unitType === "carton"
            ? cleanNumber(p.displaySalePrice || p.cartonPrice || p.salePrice * p.cartonUnits)
            : cleanNumber(p.displaySalePrice || p.salePrice);

        return `
          <tr>
            <td>${escapeHtml(p.barcode || p.code || "-")}</td>

            <td>
              <b>${escapeHtml(p.name || "-")}</b>
              <br>
              <span class="muted">${escapeHtml(p.category || "-")}</span>
            </td>

            <td>${escapeHtml(p.category || "-")}</td>

            <td>${escapeHtml(unitLabel(p.unitType, p.customUnit))}</td>

            <td>${escapeHtml(unitLabel(p.baseUnit, p.customUnit))}</td>

            <td>${escapeHtml(conversionText)}</td>

            <td>
              <span class="badge ${low ? "red" : "green"}">
                ${cleanNumber(p.stock)} ${escapeHtml(unitLabel(p.baseUnit, p.customUnit))}
              </span>
            </td>

            <td>${money(costPrice)}</td>

            <td class="money">${money(salePrice)}</td>

            <td>${money(costValue)}</td>

            <td class="money">${money(saleValue)}</td>

            <td>
              <span class="badge ${profitValue >= 0 ? "green" : "red"}">
                ${money(profitValue)}
              </span>
            </td>

            <td>
              ${money(selectedUnitPrice)}
              <div class="muted" style="font-size:11px">
                لكل ${escapeHtml(unitLabel(p.unitType, p.customUnit))}
              </div>
            </td>

            <td>
              <button class="ghost-btn" data-show-barcode="${p.id}">
                <i class="fa-solid fa-barcode"></i> باركود
              </button>
            </td>

            <td>
              <button class="ghost-btn" data-edit-product="${p.id}">
                <i class="fa-solid fa-pen"></i> تعديل
              </button>

              <button class="danger-btn" data-delete-product="${p.id}">
                <i class="fa-solid fa-trash"></i> حذف
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    $("inventoryTable").innerHTML =
      rows ||
      `<tr><td colspan="15" class="muted" style="text-align:center">لا توجد منتجات</td></tr>`;
  }

  function renderReportsPatch() {
    const state = getState();
    if (!state) return;

    if (typeof window.__originalRenderReports === "function") {
      try {
        window.__originalRenderReports();
      } catch (e) {
        console.warn("[PATCH] original renderReports failed", e);
      }
    }

    const totals = getInventoryValueTotalsPatch();

    if ($("reportInventoryProductsCount")) $("reportInventoryProductsCount").textContent = totals.count;
    if ($("reportInventoryCostValue")) $("reportInventoryCostValue").textContent = money(totals.costValue);
    if ($("reportInventorySaleValue")) $("reportInventorySaleValue").textContent = money(totals.saleValue);
    if ($("reportInventoryExpectedProfit")) $("reportInventoryExpectedProfit").textContent = money(totals.expectedProfit);
  }

  function injectScannerAssets() {
    if (!document.querySelector('script[data-patch-html5-qrcode="1"]')) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
      script.dataset.patchHtml5Qrcode = "1";
      document.head.appendChild(script);
    }

    if ($("patchScannerStyle")) return;

    const style = document.createElement("style");
    style.id = "patchScannerStyle";
    style.textContent = `
      .patch-camera-page{
        position:fixed;
        inset:0;
        background:#000;
        z-index:999999;
        display:none;
        overflow:hidden;
        direction:rtl;
      }

      .patch-camera-page.show{
        display:block;
      }

      #patchReader{
        width:100vw;
        height:100vh;
        background:#000;
      }

      #patchReader video{
        width:100vw!important;
        height:100vh!important;
        object-fit:cover!important;
      }

      #patchReader__scan_region,
      #patchReader__dashboard{
        display:none!important;
      }

      .patch-scan-frame{
        pointer-events:none;
        position:fixed;
        top:50%;
        left:50%;
        width:min(82vw,420px);
        height:230px;
        transform:translate(-50%,-50%);
        border:3px solid rgba(255,255,255,.55);
        border-radius:26px;
        z-index:1000001;
        transition:.15s ease;
        box-shadow:
          0 0 0 9999px rgba(0,0,0,.18),
          0 0 30px rgba(255,255,255,.15);
      }

      .patch-scan-frame::before,
      .patch-scan-frame::after{
        content:"";
        position:absolute;
        width:54px;
        height:54px;
        border-color:#22c55e;
        border-style:solid;
        filter:drop-shadow(0 0 12px rgba(34,197,94,.95));
      }

      .patch-scan-frame::before{
        top:-4px;
        right:-4px;
        border-width:6px 6px 0 0;
        border-radius:0 22px 0 0;
      }

      .patch-scan-frame::after{
        left:-4px;
        bottom:-4px;
        border-width:0 0 6px 6px;
        border-radius:0 0 0 22px;
      }

      .patch-laser{
        position:fixed;
        top:50%;
        left:50%;
        width:min(72vw,360px);
        height:3px;
        transform:translate(-50%,-50%);
        z-index:1000002;
        border-radius:999px;
        background:linear-gradient(90deg,transparent,#22c55e,transparent);
        box-shadow:0 0 22px #22c55e;
        animation:patchLaserMove 1.2s ease-in-out infinite;
        pointer-events:none;
      }

      @keyframes patchLaserMove{
        0%,100%{
          transform:translate(-50%,calc(-50% - 95px));
          opacity:.55;
        }
        50%{
          transform:translate(-50%,calc(-50% + 95px));
          opacity:1;
        }
      }

      .patch-camera-page.detected .patch-scan-frame{
        border-color:#22c55e;
        box-shadow:
          0 0 0 9999px rgba(0,0,0,.13),
          0 0 40px rgba(34,197,94,.9),
          inset 0 0 35px rgba(34,197,94,.25);
        animation:patchGreenPop .28s ease;
      }

      @keyframes patchGreenPop{
        0%{transform:translate(-50%,-50%) scale(.96)}
        60%{transform:translate(-50%,-50%) scale(1.03)}
        100%{transform:translate(-50%,-50%) scale(1)}
      }

      .patch-scan-toast{
        position:fixed;
        right:16px;
        left:16px;
        bottom:28px;
        z-index:1000005;
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

      .patch-scan-toast.show{
        transform:translateY(0);
        opacity:1;
      }

      .patch-scanner-close{
        position:fixed;
        top:16px;
        right:16px;
        z-index:1000006;
        width:48px;
        height:48px;
        border:0;
        border-radius:17px;
        background:rgba(15,23,42,.82);
        color:white;
        font-size:22px;
        font-weight:900;
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow:0 12px 28px rgba(0,0,0,.35);
      }

      .patch-scanner-manual{
        position:fixed;
        top:16px;
        left:16px;
        z-index:1000006;
        min-height:48px;
        border:0;
        border-radius:17px;
        background:rgba(15,23,42,.82);
        color:white;
        font-size:14px;
        font-weight:900;
        padding:0 14px;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:7px;
        box-shadow:0 12px 28px rgba(0,0,0,.35);
      }
    `;
    document.head.appendChild(style);
  }

  const scannerPatch = {
    scanner: null,
    isRunning: false,
    lastCode: "",
    lastTime: 0,
    mode: "sale",
    targetInputId: "",
    sound: null
  };

  function ensureScannerDom() {
    injectScannerAssets();

    if ($("patchCameraPage")) return;

    const page = document.createElement("div");
    page.id = "patchCameraPage";
    page.className = "patch-camera-page";
    page.innerHTML = `
      <div id="patchReader"></div>
      <div class="patch-scan-frame"></div>
      <div class="patch-laser"></div>

      <button id="patchScannerCloseBtn" class="patch-scanner-close" type="button">×</button>
      <button id="patchScannerManualBtn" class="patch-scanner-manual" type="button">إدخال يدوي</button>

      <div id="patchScanToast" class="patch-scan-toast"></div>
    `;

    document.body.appendChild(page);

    $("patchScannerCloseBtn").onclick = stopCameraScannerPatch;

    $("patchScannerManualBtn").onclick = () => {
      const code = prompt("أدخل الباركود أو الكود يدويًا");
      if (!code) return;
      handlePatchedBarcode(code.trim(), { manual: true });
    };

    scannerPatch.sound = new Audio("./qr.mp3");
    scannerPatch.sound.preload = "auto";
    scannerPatch.sound.volume = 1;

    const unlockSound = () => {
      try {
        scannerPatch.sound.play()
          .then(() => {
            scannerPatch.sound.pause();
            scannerPatch.sound.currentTime = 0;
          })
          .catch(() => {});
      } catch {}
    };

    document.addEventListener("click", unlockSound, { once: true });
    document.addEventListener("touchstart", unlockSound, { once: true });
  }

  function showScannerToast(code) {
    const toastBox = $("patchScanToast");
    if (!toastBox) return;

    toastBox.textContent = code;
    toastBox.classList.add("show");

    clearTimeout(window.__patchScannerToastTimer);
    window.__patchScannerToastTimer = setTimeout(() => {
      toastBox.classList.remove("show");
    }, 1800);
  }

  function playBeepPatch() {
    try {
      if (!scannerPatch.sound) scannerPatch.sound = new Audio("./qr.mp3");
      scannerPatch.sound.pause();
      scannerPatch.sound.currentTime = 0;
      scannerPatch.sound.play().catch(() => {});
    } catch (e) {
      console.warn("[PATCH] qr.mp3 sound error", e);
    }
  }

  function vibratePatch() {
    if (navigator.vibrate) navigator.vibrate([55, 25, 55]);
  }

  function markDetectedPatch() {
    const page = $("patchCameraPage");
    if (!page) return;

    page.classList.add("detected");

    clearTimeout(window.__patchDetectedTimer);
    window.__patchDetectedTimer = setTimeout(() => {
      page.classList.remove("detected");
    }, 550);
  }

  function onScanSuccessPatch(decodedText, decodedResult) {
    const now = Date.now();
    const code = String(decodedText || "").trim();

    if (!code) return;
    if (code === scannerPatch.lastCode && now - scannerPatch.lastTime < 1400) return;

    scannerPatch.lastCode = code;
    scannerPatch.lastTime = now;

    markDetectedPatch();
    playBeepPatch();
    vibratePatch();
    showScannerToast(code);

    window.dispatchEvent(new CustomEvent("barcode:scanned", {
      detail: {
        code,
        result: decodedResult,
        mode: scannerPatch.mode,
        targetInputId: scannerPatch.targetInputId
      }
    }));

    setTimeout(() => {
      handlePatchedBarcode(code, decodedResult);
    }, 120);
  }

  function onScanFailurePatch() {}

  async function startCameraScannerPatch(mode = "sale", targetInputId = "") {
    ensureScannerDom();

    scannerPatch.mode = mode || "sale";
    scannerPatch.targetInputId = targetInputId || "";
    scannerPatch.lastCode = "";
    scannerPatch.lastTime = 0;

    const page = $("patchCameraPage");
    if (page) page.classList.add("show");

    if (scannerPatch.isRunning) return;

    const startWhenReady = async () => {
      if (typeof window.Html5Qrcode === "undefined") {
        setTimeout(startWhenReady, 120);
        return;
      }

      try {
        scannerPatch.scanner = new Html5Qrcode("patchReader", {
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

        await scannerPatch.scanner.start(
          { facingMode: "environment" },
          config,
          onScanSuccessPatch,
          onScanFailurePatch
        );

        scannerPatch.isRunning = true;
      } catch (err) {
        console.error("[PATCH] scanner start error", err);
        showScannerToast("اسمح باستخدام الكاميرا");
        toast("تعذر فتح الكاميرا، تأكد من الصلاحيات و HTTPS");
      }
    };

    startWhenReady();
  }

  async function stopCameraScannerPatch() {
    const page = $("patchCameraPage");

    try {
      if (scannerPatch.scanner && scannerPatch.isRunning) {
        await scannerPatch.scanner.stop();
        await scannerPatch.scanner.clear();
      }
    } catch (e) {
      console.warn("[PATCH] scanner stop error", e);
    }

    scannerPatch.scanner = null;
    scannerPatch.isRunning = false;

    if (page) {
      page.classList.remove("show");
      page.classList.remove("detected");
    }
  }

  function handlePatchedBarcode(code, result = null) {
    code = String(code || "").trim();
    if (!code) return;

    const targetInputId = scannerPatch.targetInputId;

    if (targetInputId && $(targetInputId)) {
      const input = $(targetInputId);
      input.value = code;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      stopCameraScannerPatch();
      toast("تم إدخال الباركود");
      return;
    }

    const product = getProductByBarcode(code);

    if (scannerPatch.mode === "sale" || !scannerPatch.mode) {
      if (product) {
        stopCameraScannerPatch();

        if (typeof window.addToCart === "function") {
          window.addToCart(product);
        } else {
          toast(`تمت قراءة الكود: ${code}`);
        }
      } else {
        toast("لم يتم العثور على منتج بهذا الباركود");
      }

      return;
    }

    if (product && typeof window.addToCart === "function") {
      stopCameraScannerPatch();
      window.addToCart(product);
      return;
    }

    toast(`تمت قراءة الكود: ${code}`);
  }

  function patchScannerFunctions() {
    window.openCameraScannerPatch = startCameraScannerPatch;
    window.stopCameraScannerPatch = stopCameraScannerPatch;

    window.openScanner = function (mode = "sale", targetInputId = "") {
      return startCameraScannerPatch(mode, targetInputId);
    };

    window.stopScanner = function () {
      return stopCameraScannerPatch();
    };

    window.openFloatingProductBarcodeScanner = function (targetInputId = "productBarcode") {
      return startCameraScannerPatch("input", targetInputId);
    };

    window.handleScannedCode = function (code) {
      return handlePatchedBarcode(code);
    };

    window.addEventListener("barcode:scanned", function (e) {
      console.log("[PATCH] barcode scanned:", e.detail?.code || "");
    });

    document.addEventListener("visibilitychange", async () => {
      if (document.hidden && scannerPatch.scanner && scannerPatch.isRunning) {
        await stopCameraScannerPatch();
      }
    });

    window.addEventListener("beforeunload", () => {
      if (scannerPatch.scanner && scannerPatch.isRunning) {
        scannerPatch.scanner.stop().catch(() => {});
      }
    });
  }

  function patchConfirmFunctions() {
    window.confirmDelete = async function ({
      title = "تأكيد الحذف",
      message = "هل أنت متأكد؟",
      details = "",
      confirmText = "موافق",
      deleteText = "حذف",
      dangerText = ""
    } = {}) {
      if (typeof window.confirmAction === "function") {
        return await window.confirmAction({
          title,
          message: details ? `${message}\n${details}` : message,
          okText: deleteText || dangerText || confirmText || "موافق",
          danger: true
        });
      }

      return window.confirm(`${title}\n\n${message}${details ? "\n\n" + details : ""}`);
    };

    window.askDeleteConfirm = async function ({
      title = "تأكيد الحذف",
      message = "هل أنت متأكد؟",
      itemName = "",
      okText = "موافق، حذف"
    } = {}) {
      if (typeof window.confirmAction === "function") {
        return await window.confirmAction({
          title,
          message: itemName ? `${message}\n${itemName}` : message,
          okText,
          danger: true
        });
      }

      return window.confirm(`${title}\n\n${message}${itemName ? "\n\n" + itemName : ""}`);
    };
  }

  function patchRenderFunctions() {
    if (typeof window.renderReports === "function" && !window.__originalRenderReports) {
      window.__originalRenderReports = window.renderReports;
    }

    window.getInventoryValueTotals = getInventoryValueTotalsPatch;
    window.renderInventory = renderInventoryPatch;
    window.renderReports = renderReportsPatch;

    const originalRenderAll = window.renderAll;

    if (typeof originalRenderAll === "function" && !window.__originalRenderAllPatch) {
      window.__originalRenderAllPatch = originalRenderAll;

      window.renderAll = function () {
        try {
          window.__originalRenderAllPatch();
        } catch (e) {
          console.warn("[PATCH] original renderAll failed", e);
        }

        try {
          renderInventoryPatch();
          renderReportsPatch();
        } catch (e) {
          console.warn("[PATCH] patched renderAll failed", e);
        }
      };
    }

    setTimeout(() => {
      try {
        renderInventoryPatch();
        renderReportsPatch();
      } catch (e) {
        console.warn("[PATCH] first render patch failed", e);
      }
    }, 900);
  }

  function patchInventorySearchEvent() {
    document.addEventListener("input", function (e) {
      if (e.target && e.target.id === "inventorySearch") {
        renderInventoryPatch();
      }
    });

    document.addEventListener("change", function (e) {
      if (e.target && e.target.id === "reportsPeriod") {
        setTimeout(renderReportsPatch, 50);
      }

      if (e.target && e.target.id === "reportsCustomDate") {
        setTimeout(renderReportsPatch, 50);
      }
    });
  }

  function bootPatch() {
    console.log(`[PATCH] ${PATCH_VERSION} loaded`);

    patchConfirmFunctions();
    patchScannerFunctions();
    patchRenderFunctions();
    patchInventorySearchEvent();

    document.addEventListener("click", function (e) {
      const scanProductBtn = e.target.closest("#scanProductBarcodeBtn");
      if (scanProductBtn) {
        e.preventDefault();
        e.stopPropagation();
        startCameraScannerPatch("input", "productBarcode");
        return;
      }

      const openScannerBtn = e.target.closest("#openScannerBtn");
      if (openScannerBtn) {
        e.preventDefault();
        e.stopPropagation();
        startCameraScannerPatch("sale", "");
        return;
      }
    }, true);

    toast("تم تحميل باتش الإصلاحات");
  }

  waitForApp(bootPatch);
})();