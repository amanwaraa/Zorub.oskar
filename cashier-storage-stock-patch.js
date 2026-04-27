/* cashier-storage-stock-patch.js */
(function () {
  "use strict";

  const PATCH_VERSION = "2026-04-27-storage-stock-firebase-clean-v1";
  const LOCAL_FIREBASE_MARK_KEY = "cashier_active_firebase_identity_v1";
  const OLD_BACKUP_PREFIX = "cashier_old_local_backup_";
  const CLEAN_DONE_PREFIX = "cashier_clean_done_";

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const $ = (id) => document.getElementById(id);

  function log(...args) {
    console.log("[cashier-storage-stock-patch]", PATCH_VERSION, ...args);
  }

  function toast(msg, ms = 2800) {
    if (typeof window.toast === "function") {
      window.toast(msg, ms);
      return;
    }

    const el = $("toast");
    if (!el) {
      alert(msg);
      return;
    }

    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el.__storagePatchToast);
    el.__storagePatchToast = setTimeout(() => el.classList.remove("show"), ms);
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
    const currency = window.state?.settings?.currency || "₪";
    return `${currency} ${cleanNumber(v).toFixed(2)}`;
  }

  function getState() {
    return window.state || null;
  }

  async function waitForApp() {
    for (let i = 0; i < 180; i++) {
      if (window.state && Array.isArray(window.state.products)) return true;
      await wait(100);
    }
    return false;
  }

  function getFirebaseIdentity() {
    const cfg = window.CASHIER_FIREBASE_CONFIG || {};
    const fb = cfg.firebaseConfig || {};

    const parts = [
      fb.projectId || "",
      fb.databaseURL || "",
      cfg.firebaseRoot || "",
      Array.isArray(cfg.fallbackRoots) ? cfg.fallbackRoots.join("|") : ""
    ];

    return btoa(unescape(encodeURIComponent(parts.join("__"))))
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 80) || "default_firebase";
  }

  function getCurrentDbNameFromCode() {
    try {
      const cfg = window.CASHIER_FIREBASE_CONFIG || {};
      const fb = cfg.firebaseConfig || {};
      const projectId = fb.projectId || "default_project";
      const databaseURL = fb.databaseURL || "default_database";

      const namespace = btoa(unescape(encodeURIComponent(`${projectId}_${databaseURL}`)))
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 42) || "default";

      return `cashier_units_pro_${namespace}_db_v14`;
    } catch {
      return "";
    }
  }

  function indexedDbList() {
    if (indexedDB.databases) {
      return indexedDB.databases().then(list => list || []).catch(() => []);
    }
    return Promise.resolve([]);
  }

  function deleteIndexedDb(name) {
    return new Promise(resolve => {
      if (!name) return resolve(false);

      const req = indexedDB.deleteDatabase(name);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    });
  }

  function openDbByName(name, version = 14) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {};
    });
  }

  function getAllFromStore(db, storeName) {
    return new Promise(resolve => {
      if (!db.objectStoreNames.contains(storeName)) return resolve([]);

      try {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async function backupCurrentLocalData(currentDbName, identity) {
    try {
      const db = await openDbByName(currentDbName);
      const stores = [
        "products",
        "invoices",
        "customers",
        "expenses",
        "purchases",
        "supplierPayments",
        "paymentAccounts",
        "settings",
        "syncQueue",
        "localMeta"
      ];

      const backup = {
        identity,
        dbName: currentDbName,
        backedUpAt: Date.now()
      };

      for (const store of stores) {
        backup[store] = await getAllFromStore(db, store);
      }

      db.close();

      localStorage.setItem(
        OLD_BACKUP_PREFIX + identity + "_" + Date.now(),
        JSON.stringify(backup)
      );

      return true;
    } catch (e) {
      console.warn("backup old local data failed", e);
      return false;
    }
  }

  async function clearOldCashierDatabasesExceptCurrent(currentDbName) {
    const list = await indexedDbList();

    const targets = list
      .map(x => x.name)
      .filter(Boolean)
      .filter(name =>
        name !== currentDbName &&
        /^cashier_units_pro_.*_db_v\d+$/i.test(name)
      );

    for (const name of targets) {
      await deleteIndexedDb(name);
    }

    return targets.length;
  }

  async function clearCurrentDbDataStores() {
    if (typeof window.idbClear === "function") {
      const stores = [
        "products",
        "invoices",
        "customers",
        "expenses",
        "purchases",
        "supplierPayments",
        "paymentAccounts",
        "settings",
        "syncQueue",
        "localMeta"
      ];

      for (const store of stores) {
        try {
          await window.idbClear(store);
        } catch {}
      }

      return true;
    }

    const dbName = getCurrentDbNameFromCode();
    if (!dbName) return false;

    try {
      const db = await openDbByName(dbName, 14);
      const stores = Array.from(db.objectStoreNames || []);

      await Promise.all(stores.map(store => new Promise(resolve => {
        try {
          const tx = db.transaction(store, "readwrite");
          tx.objectStore(store).clear();
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch {
          resolve(false);
        }
      })));

      db.close();
      return true;
    } catch {
      return false;
    }
  }

  async function protectAgainstFirebaseChange() {
    const identity = getFirebaseIdentity();
    const oldIdentity = localStorage.getItem(LOCAL_FIREBASE_MARK_KEY);
    const currentDbName = getCurrentDbNameFromCode();

    if (!currentDbName) return;

    if (oldIdentity && oldIdentity !== identity) {
      await backupCurrentLocalData(currentDbName, oldIdentity);
      await clearCurrentDbDataStores();
      await clearOldCashierDatabasesExceptCurrent(currentDbName);

      localStorage.setItem(LOCAL_FIREBASE_MARK_KEY, identity);
      localStorage.removeItem(CLEAN_DONE_PREFIX + oldIdentity);

      toast("تم اكتشاف Firebase جديد، تم فصل وتنظيف التخزين المحلي القديم");

      setTimeout(() => {
        location.reload();
      }, 900);

      return;
    }

    if (!oldIdentity) {
      localStorage.setItem(LOCAL_FIREBASE_MARK_KEY, identity);
    }

    const cleanKey = CLEAN_DONE_PREFIX + identity;

    if (!localStorage.getItem(cleanKey)) {
      const deletedCount = await clearOldCashierDatabasesExceptCurrent(currentDbName);
      localStorage.setItem(cleanKey, "1");

      if (deletedCount) {
        log("old indexedDB projects deleted:", deletedCount);
      }
    }
  }

  function normalizeProductLocal(p) {
    if (typeof window.normalizeProduct === "function") return window.normalizeProduct(p);
    return p || {};
  }

  function getUnitFactorLocal(product, selectedUnit) {
    if (typeof window.getUnitFactor === "function") {
      return cleanNumber(window.getUnitFactor(product, selectedUnit), 1);
    }

    if (selectedUnit === "carton") return cleanNumber(product?.cartonUnits || 1, 1);
    if (selectedUnit === "kg") return 1000;
    if (selectedUnit === "liter") return 1000;
    return 1;
  }

  function getDefaultSaleUnitLocal(product) {
    if (typeof window.getDefaultSaleUnit === "function") return window.getDefaultSaleUnit(product);
    if (product?.unitType === "carton") return "piece";
    if (product?.unitType === "kg") return "g";
    if (product?.unitType === "liter") return "ml";
    return product?.unitType || "piece";
  }

  function getProductByBarcodeLocal(code) {
    const st = getState();
    const c = String(code || "").trim();
    if (!st || !c) return null;

    return (st.products || []).find(p =>
      String(p.barcode || "").trim() === c ||
      String(p.code || "").trim() === c
    ) || null;
  }

  function productAvailableQty(product, selectedUnit = "") {
    const p = normalizeProductLocal(product);
    const unit = selectedUnit || getDefaultSaleUnitLocal(p);
    const factor = getUnitFactorLocal(p, unit);
    const stock = cleanNumber(p.stock);

    if (factor <= 0) return 0;
    return stock / factor;
  }

  function getCartRequestedBaseQty(productId, selectedUnit = "") {
    const st = getState();
    if (!st) return 0;

    return (st.cart || [])
      .filter(line => line.productId === productId && (!selectedUnit || line.selectedUnit === selectedUnit))
      .reduce((sum, line) => sum + cleanNumber(line.baseQty), 0);
  }

  function findProductAndStockStatus(code) {
    const product = getProductByBarcodeLocal(code);
    if (!product) {
      return {
        found: false,
        product: null,
        enough: false,
        message: "لم يتم العثور على منتج بهذا الباركود"
      };
    }

    const p = normalizeProductLocal(product);
    const unit = getDefaultSaleUnitLocal(p);
    const factor = getUnitFactorLocal(p, unit);
    const currentCartBase = getCartRequestedBaseQty(p.id, unit);
    const availableBase = cleanNumber(p.stock) - currentCartBase;

    if (availableBase < factor) {
      return {
        found: true,
        product: p,
        enough: false,
        message: `الكمية غير متوفرة للصنف: ${p.name}، المتوفر ${Math.max(0, productAvailableQty(p, unit) - (currentCartBase / factor)).toFixed(3).replace(/\.?0+$/, "")}`
      };
    }

    return {
      found: true,
      product: p,
      enough: true,
      message: ""
    };
  }

  function addProductToCartSafely(product) {
    if (!product) return;

    const status = findProductAndStockStatus(product.barcode || product.code || "");
    if (status.found && !status.enough) {
      toast(status.message);
      return;
    }

    if (typeof window.addToCart === "function") {
      window.addToCart(product);
      return;
    }

    toast("تعذر إضافة المنتج للسلة");
  }

  function patchBarcodeStockMessage() {
    const oldManual = window.openManualBarcode;

    window.openManualBarcode = function () {
      const code = prompt("أدخل الباركود أو كود المنتج");
      if (!code) return;

      const status = findProductAndStockStatus(code);

      if (!status.found) {
        toast(status.message);
        return;
      }

      if (!status.enough) {
        toast(status.message);
        return;
      }

      addProductToCartSafely(status.product);
    };

    window.addEventListener("barcode:scanned", (ev) => {
      const code = ev?.detail?.code || "";
      const mode = ev?.detail?.mode || "";

      if (mode === "product") return;

      const status = findProductAndStockStatus(code);

      if (status.found && !status.enough) {
        ev.stopImmediatePropagation?.();
        toast(status.message);
      }
    }, true);

    const oldAddToCart = window.addToCart;

    window.addToCart = function (product, selectedUnit = "") {
      if (product) {
        const p = normalizeProductLocal(product);
        const unit = selectedUnit || getDefaultSaleUnitLocal(p);
        const factor = getUnitFactorLocal(p, unit);
        const currentCartBase = getCartRequestedBaseQty(p.id, unit);
        const availableBase = cleanNumber(p.stock) - currentCartBase;

        if (availableBase < factor) {
          toast(`الكمية غير متوفرة للصنف: ${p.name}`);
          return false;
        }
      }

      if (typeof oldAddToCart === "function") {
        return oldAddToCart(product, selectedUnit);
      }

      toast("تعذر إضافة المنتج للسلة");
      return false;
    };
  }

  function calculateInventorySummaryFromFirebaseOnlyLocalState() {
    const st = getState();
    const products = st?.products || [];

    return products.reduce((acc, raw) => {
      const p = normalizeProductLocal(raw);
      const stock = cleanNumber(p.stock);
      const cost = cleanNumber(p.costPrice);
      const sale = cleanNumber(p.salePrice);

      acc.count += stock;
      acc.costValue += stock * cost;
      acc.saleValue += stock * sale;
      acc.expectedProfit += stock * (sale - cost);

      return acc;
    }, {
      count: 0,
      costValue: 0,
      saleValue: 0,
      expectedProfit: 0
    });
  }

  function renderFixedInventorySummary() {
    const page = $("page-inventory");
    if (!page) return;

    let box = $("patchInventorySummary");
    const card = page.querySelector(".card");

    if (!box) {
      box = document.createElement("div");
      box.id = "patchInventorySummary";
      box.className = "patch-inventory-summary";

      if (card) card.parentNode.insertBefore(box, card);
      else page.appendChild(box);
    }

    const s = calculateInventorySummaryFromFirebaseOnlyLocalState();

    box.innerHTML = `
      <div class="patch-inventory-stat dark">
        <span><i class="fa-solid fa-boxes-stacked"></i> عدد المخزون الأساسي</span>
        <b>${s.count.toFixed(3).replace(/\.?0+$/, "")}</b>
      </div>

      <div class="patch-inventory-stat">
        <span><i class="fa-solid fa-coins"></i> رصيد المخزون بسعر الجملة</span>
        <b>${money(s.costValue)}</b>
      </div>

      <div class="patch-inventory-stat gold">
        <span><i class="fa-solid fa-tags"></i> رصيد المخزون بسعر البيع</span>
        <b>${money(s.saleValue)}</b>
      </div>

      <div class="patch-inventory-stat green">
        <span><i class="fa-solid fa-arrow-trend-up"></i> الأرباح المتوقعة</span>
        <b>${money(s.expectedProfit)}</b>
      </div>
    `;
  }

  function patchInventorySummaryRefresh() {
    const oldRenderAll = window.renderAll;
    if (typeof oldRenderAll === "function") {
      window.renderAll = function (...args) {
        const out = oldRenderAll.apply(this, args);
        setTimeout(renderFixedInventorySummary, 0);
        return out;
      };
    }

    const oldRenderInventory = window.renderInventory;
    if (typeof oldRenderInventory === "function") {
      window.renderInventory = function (...args) {
        const out = oldRenderInventory.apply(this, args);
        setTimeout(renderFixedInventorySummary, 0);
        return out;
      };
    }

    setInterval(renderFixedInventorySummary, 2000);
    renderFixedInventorySummary();
  }

  async function reloadFromCleanFirebaseAfterFirstRun() {
    const st = getState();
    if (!st) return;

    const identity = getFirebaseIdentity();
    const key = "cashier_reload_clean_firebase_done_" + identity;

    if (localStorage.getItem(key)) return;

    localStorage.setItem(key, "1");

    if (navigator.onLine) {
      try {
        if (typeof window.syncNow === "function") await window.syncNow(false);
        if (typeof window.loadFirebaseOnce === "function") await window.loadFirebaseOnce();
        if (typeof window.renderAll === "function") window.renderAll();
        renderFixedInventorySummary();
      } catch (e) {
        console.warn("reload firebase after clean failed", e);
      }
    }
  }

  function exposeMissingFunctionsWarning() {
    const missing = [];
    [
      "state",
      "addToCart",
      "renderAll",
      "renderInventory"
    ].forEach(name => {
      if (!window[name]) missing.push(name);
    });

    if (missing.length) {
      console.warn(
        "cashier-storage-stock-patch: هذه العناصر غير ظاهرة للباتش:",
        missing.join(", "),
        "إذا ما اشتغل الباتش، صدّرها من داخل module إلى window."
      );
    }
  }

  async function init() {
    log("loading");

    await protectAgainstFirebaseChange();

    const ok = await waitForApp();

    if (!ok) {
      toast("باتش التخزين لم يجد بيانات التطبيق. تأكد أنه بعد كود التطبيق والباتش الأول.");
      return;
    }

    exposeMissingFunctionsWarning();

    patchBarcodeStockMessage();
    patchInventorySummaryRefresh();

    await reloadFromCleanFirebaseAfterFirstRun();

    window.CashierStorageStockPatch = {
      version: PATCH_VERSION,
      firebaseIdentity: getFirebaseIdentity(),
      renderInventorySummary: renderFixedInventorySummary,
      cleanOldDatabases: async () => {
        const count = await clearOldCashierDatabasesExceptCurrent(getCurrentDbNameFromCode());
        toast(`تم حذف ${count} قاعدة قديمة`);
        return count;
      },
      resetThisFirebaseLocalData: async () => {
        await clearCurrentDbDataStores();
        toast("تم تصفير التخزين المحلي لهذا Firebase، سيتم إعادة التحميل");
        setTimeout(() => location.reload(), 700);
      }
    };

    log("ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();