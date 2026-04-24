import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  off
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCnLAY7zQyBy7gUuL9wszt9aEhiJgvRmxI",
  authDomain: "shop-d52dc.firebaseapp.com",
  databaseURL: "https://shop-d52dc-default-rtdb.firebaseio.com",
  projectId: "shop-d52dc",
  storageBucket: "shop-d52dc.appspot.com",
  messagingSenderId: "97580537866",
  appId: "1:97580537866:web:abc46e5a2f527b6300a7f3",
  measurementId: "G-956RQMBP42"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const PREFIX = "DFDFG";
const LOCAL_SESSION_KEY = `${PREFIX}_USER_SESSION`;
const LOCAL_OFFLINE_DB_NAME = `${PREFIX}_offline_grocery_cashier_db_v7`;
const LOCAL_OFFLINE_DB_VERSION = 7;
const BACKUP_VERSION = 7;

let currentStoreId = localStorage.getItem("activeStoreId") || "default";
let cart = [];
let currentInvoiceId = null;
let editingInvoiceId = null;

let scanner = null;
let scanTarget = "pos";
let scannerTrack = null;
let scannerTorchOn = false;
let torchSupported = false;
let scannerHistoryPushed = false;
let scannerLock = false;

let licenseWatcher = null;

let storesListenerRef = null;
let productsListenerRef = null;
let invoicesListenerRef = null;
let purchasesListenerRef = null;
let customersListenerRef = null;
let expensesListenerRef = null;
let supplierPaymentsListenerRef = null;
let licenseListenerRef = null;

let productPageSize = 20;
let invoicePageSize = 20;
let productsCurrentLimit = 20;
let invoicesCurrentLimit = 20;

let currentCustomerHistoryName = "";
let currentCustomerHistoryPhone = "";
let currentCustomerHistoryId = "";

document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();
  bindBaseEvents();
  await initApp();
});

function qs(id) {
  return document.getElementById(id);
}

function qsa(selector) {
  return [...document.querySelectorAll(selector)];
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj ?? null));
}

function isOnline() {
  return navigator.onLine;
}

function nowIso() {
  return new Date().toISOString();
}

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentLicenseKey() {
  const session = getLocalSession();
  return session?.key || null;
}

function sanitizeKey(key) {
  return String(key || "").replace(/[.#$/[\]]/g, "_");
}

function baseClientPath() {
  const key = currentLicenseKey();
  if (!key) return null;
  return `${PREFIX}_clients/${sanitizeKey(key)}`;
}

function pathLicenses() {
  return `${PREFIX}_licenses`;
}

function pathClientStores() {
  return `${baseClientPath()}/stores`;
}

function pathClientProducts() {
  return `${baseClientPath()}/products`;
}

function pathClientInvoices() {
  return `${baseClientPath()}/invoices`;
}

function pathClientPurchases() {
  return `${baseClientPath()}/purchases`;
}

function pathClientCustomers() {
  return `${baseClientPath()}/customers`;
}

function pathClientExpenses() {
  return `${baseClientPath()}/expenses`;
}

function pathClientSupplierPayments() {
  return `${baseClientPath()}/supplierPayments`;
}

function pathClientCounters() {
  return `${baseClientPath()}/counters`;
}

function pathClientSettings() {
  return `${baseClientPath()}/settings`;
}

function pathClientBackups() {
  return `${baseClientPath()}/backups`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeJs(str) {
  return String(str ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function formatDateTime(dateString) {
  if (!dateString) return "غير محدد";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleString("ar-EG");
}

function formatDateOnly(dateString) {
  if (!dateString) return "غير محدد";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return d.toLocaleDateString("ar-EG");
}

function normalizeLogo(url) {
  return String(url || "").trim();
}

function setImageOrHide(imgEl, url) {
  if (!imgEl) return;

  const clean = normalizeLogo(url);
  if (clean) {
    imgEl.crossOrigin = "anonymous";
    imgEl.referrerPolicy = "no-referrer";
    imgEl.src = clean;
    imgEl.classList.remove("hidden");
  } else {
    imgEl.removeAttribute("src");
    imgEl.classList.add("hidden");
  }
}

function previewStoreLogo(value) {
  setImageOrHide(qs("settingsLogoPreview"), value);
}

function getLocalSession() {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLocalSession(data) {
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(data));
}

function clearLocalSession() {
  localStorage.removeItem(LOCAL_SESSION_KEY);
}

function getDurationMs(type, value) {
  if (type === "unlimited") return null;

  const n = Number(value || 0);
  if (type === "minute") return n * 60 * 1000;
  if (type === "hour") return n * 60 * 60 * 1000;
  if (type === "day") return n * 24 * 60 * 60 * 1000;
  if (type === "month") return n * 30 * 24 * 60 * 60 * 1000;
  if (type === "year") return n * 365 * 24 * 60 * 60 * 1000;

  return null;
}

function formatRemaining(ms) {
  if (ms === null) return "غير محدود";
  if (ms <= 0) return "منتهي";

  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);

  if (days > 0) return `${days} يوم ${hours} ساعة`;
  if (hours > 0) return `${hours} ساعة ${minutes} دقيقة`;
  return `${minutes} دقيقة`;
}

function durationTypeLabel(type) {
  const map = {
    minute: "دقائق",
    hour: "ساعات",
    day: "أيام",
    month: "شهور",
    year: "سنوات",
    unlimited: "غير محدود"
  };
  return map[type] || type || "-";
}

function statusLabel(status) {
  const map = {
    paid: "مدفوع",
    unpaid: "دين",
    pending: "تطبيق لاحق"
  };
  return map[status] || "مدفوع";
}

function statusClass(status) {
  if (status === "paid") return "status-paid";
  if (status === "pending") return "status-pending";
  return "status-unpaid";
}

function paymentLabel(payment) {
  const map = {
    cash: "كاش",
    bank: "بنك",
    jawwal_pay: "جوال باي",
    wallet: "محفظة",
    instant_app: "تطبيق فوري",
    later_app: "تطبيق لاحق",
    debt: "دين",
    app: "تطبيق",
    custom: "مخصص"
  };
  return map[payment] || payment || "-";
}

function getLocalSettings() {
  return {
    currencyName: localStorage.getItem(`${PREFIX}_currency_name`) || "شيكل",
    currencySymbol: localStorage.getItem(`${PREFIX}_currency_symbol`) || "₪",
    appMode: localStorage.getItem(`${PREFIX}_app_mode`) || "online",
    paymentInfo: localStorage.getItem(`${PREFIX}_payment_info`) || "",
    lowStockDefault: Number(localStorage.getItem(`${PREFIX}_low_stock_default`) || 5),
    expensesDeductDefault: localStorage.getItem(`${PREFIX}_expenses_deduct_default`) !== "false"
  };
}

function setLocalSettings(settings) {
  localStorage.setItem(`${PREFIX}_currency_name`, settings.currencyName || "شيكل");
  localStorage.setItem(`${PREFIX}_currency_symbol`, settings.currencySymbol || "₪");
  localStorage.setItem(`${PREFIX}_app_mode`, settings.appMode || "online");
  localStorage.setItem(`${PREFIX}_payment_info`, settings.paymentInfo || "");
  localStorage.setItem(`${PREFIX}_low_stock_default`, String(settings.lowStockDefault ?? 5));
  localStorage.setItem(`${PREFIX}_expenses_deduct_default`, String(settings.expensesDeductDefault !== false));
}

async function getClientSettings() {
  const settings = await idbGet("meta", "settings");
  if (settings) {
    return {
      currencyName: settings.currencyName || "شيكل",
      currencySymbol: settings.currencySymbol || "₪",
      appMode: settings.appMode || "online",
      paymentInfo: settings.paymentInfo || "",
      lowStockDefault: Number(settings.lowStockDefault ?? 5),
      expensesDeductDefault: settings.expensesDeductDefault !== false
    };
  }

  return getLocalSettings();
}

function money(value, withName = false, settings = null) {
  const st = settings || getLocalSettings();
  const symbol = st?.currencySymbol || "₪";
  const name = st?.currencyName || "شيكل";
  const amount = Number(value || 0).toFixed(2);
  return withName ? `${amount} ${name} ${symbol}` : `${amount} ${symbol}`;
}

async function showLoader(text = "جاري المعالجة...") {
  const loader = qs("loader");
  const circle = qs("progressCircle");
  const textEl = qs("loaderText");

  if (!loader || !circle || !textEl) return;

  loader.classList.remove("hidden");
  textEl.innerText = text;

  circle.style.setProperty("--progress", 8);
  circle.setAttribute("data-progress", "8");
}

function setLoaderProgress(progress) {
  const circle = qs("progressCircle");
  if (!circle) return;

  const p = Math.max(0, Math.min(100, Number(progress || 0)));
  circle.style.setProperty("--progress", p);
  circle.setAttribute("data-progress", String(Math.round(p)));
}

function hideLoader() {
  const loader = qs("loader");
  if (!loader) return;

  setLoaderProgress(100);
  setTimeout(() => {
    loader.classList.add("hidden");
    setLoaderProgress(0);
  }, 120);
}

async function withLoader(text, fn) {
  try {
    await showLoader(text);
    const result = await fn();
    hideLoader();
    return result;
  } catch (err) {
    hideLoader();
    console.error(err);
    throw err;
  }
}

function showToast(message, type = "info") {
  const wrap = qs("toastWrap") || document.querySelector(".toast-wrap");
  if (!wrap) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;

  if (type === "success") toast.style.background = "rgba(22,101,52,.96)";
  if (type === "error") toast.style.background = "rgba(153,27,27,.96)";
  if (type === "warning") toast.style.background = "rgba(194,65,12,.96)";

  wrap.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 260);
  }, 2600);
}

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_OFFLINE_DB_NAME, LOCAL_OFFLINE_DB_VERSION);

    req.onupgradeneeded = () => {
      const dbx = req.result;

      const stores = [
        "stores",
        "products",
        "invoices",
        "purchases",
        "customers",
        "expenses",
        "supplierPayments",
        "meta",
        "syncQueue"
      ];

      stores.forEach(name => {
        if (!dbx.objectStoreNames.contains(name)) {
          dbx.createObjectStore(name, { keyPath: "id" });
        }
      });
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(storeName, id) {
  const dbx = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = dbx.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll(storeName) {
  const dbx = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = dbx.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(storeName, value) {
  const dbx = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = dbx.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(storeName, id) {
  const dbx = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = dbx.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbClear(storeName) {
  const dbx = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = dbx.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getEntity(kind, id) {
  return await idbGet(kind, id);
}

function pathForKind(kind) {
  const map = {
    stores: pathClientStores(),
    products: pathClientProducts(),
    invoices: pathClientInvoices(),
    purchases: pathClientPurchases(),
    customers: pathClientCustomers(),
    expenses: pathClientExpenses(),
    supplierPayments: pathClientSupplierPayments()
  };
  return map[kind] || "";
}

async function queueSyncAction(action) {
  const id = `sync_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await idbSet("syncQueue", {
    id,
    ...action,
    createdAt: nowIso()
  });
}

async function saveEntity(kind, id, payload) {
  const fullPayload = {
    ...payload,
    id,
    updatedAt: nowIso()
  };

  await idbSet(kind, fullPayload);

  const session = getLocalSession();
  if (isOnline() && session?.appMode === "online") {
    await set(ref(db, `${pathForKind(kind)}/${id}`), fullPayload);
  } else {
    await queueSyncAction({
      type: "set",
      kind,
      id,
      payload: fullPayload
    });
  }

  return fullPayload;
}

async function deleteEntity(kind, id) {
  await idbDelete(kind, id);

  const session = getLocalSession();
  if (isOnline() && session?.appMode === "online") {
    await remove(ref(db, `${pathForKind(kind)}/${id}`));
  } else {
    await queueSyncAction({
      type: "delete",
      kind,
      id
    });
  }
}

async function getAllStores() {
  return await idbGetAll("stores");
}

async function getAllProducts() {
  return await idbGetAll("products");
}

async function getAllInvoices() {
  return await idbGetAll("invoices");
}

async function getAllPurchases() {
  return await idbGetAll("purchases");
}

async function getAllCustomers() {
  return await idbGetAll("customers");
}

async function getAllExpenses() {
  return await idbGetAll("expenses");
}

async function getAllSupplierPayments() {
  return await idbGetAll("supplierPayments");
}

async function getTransferAccounts() {
  const row = await idbGet("meta", "transferAccounts");
  return Array.isArray(row?.items) ? row.items : [];
}

async function setTransferAccounts(items) {
  await idbSet("meta", {
    id: "transferAccounts",
    items: Array.isArray(items) ? items : [],
    updatedAt: nowIso()
  });
}

async function getPaymentMethods() {
  const row = await idbGet("meta", "paymentMethods");
  if (Array.isArray(row?.items) && row.items.length) return row.items;

  return [
    { id: "pm_cash", name: "كاش", type: "cash", hint: "دفع نقدي مباشر" },
    { id: "pm_bank", name: "بنك", type: "bank", hint: "تحويل بنكي" },
    { id: "pm_jawwal", name: "جوال باي", type: "jawwal_pay", hint: "دفع عبر جوال باي" },
    { id: "pm_instant", name: "تطبيق فوري", type: "instant_app", hint: "الدفع تم فورًا من التطبيق" },
    { id: "pm_later", name: "تطبيق لاحق", type: "later_app", hint: "الدفع سيصل لاحقًا" },
    { id: "pm_debt", name: "دين", type: "debt", hint: "إضافة على حساب العميل" }
  ];
}

async function setPaymentMethods(items) {
  await idbSet("meta", {
    id: "paymentMethods",
    items: Array.isArray(items) ? items : [],
    updatedAt: nowIso()
  });
}

async function ensureClientDefaults() {
  const stores = await idbGetAll("stores");
  if (!stores.length) {
    await idbSet("stores", {
      id: "default",
      name: "المحل الرئيسي",
      logo: "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  const settings = await idbGet("meta", "settings");
  if (!settings) {
    await idbSet("meta", {
      id: "settings",
      currencyName: "شيكل",
      currencySymbol: "₪",
      appMode: getLocalSession()?.appMode || "online",
      paymentInfo: "",
      lowStockDefault: 5,
      expensesDeductDefault: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  const counter = await idbGet("meta", "invoiceCounter");
  if (!counter) {
    await idbSet("meta", { id: "invoiceCounter", value: 0 });
  }

  const purchaseCounter = await idbGet("meta", "purchaseCounter");
  if (!purchaseCounter) {
    await idbSet("meta", { id: "purchaseCounter", value: 0 });
  }

  const transferAccounts = await idbGet("meta", "transferAccounts");
  if (!transferAccounts) {
    await setTransferAccounts([]);
  }

  const paymentMethods = await idbGet("meta", "paymentMethods");
  if (!paymentMethods) {
    await setPaymentMethods(await getPaymentMethods());
  }

  const active = localStorage.getItem("activeStoreId");
  const activeStore = active ? await idbGet("stores", active) : null;

  if (!active || !activeStore) {
    currentStoreId = "default";
    localStorage.setItem("activeStoreId", "default");
  } else {
    currentStoreId = active;
  }
}

async function getNextCounter(counterName, cloudKey) {
  const counter = await idbGet("meta", counterName);
  const current = Number(counter?.value || 0);
  const next = current + 1;

  await idbSet("meta", {
    id: counterName,
    value: next,
    updatedAt: nowIso()
  });

  const session = getLocalSession();
  if (isOnline() && session?.appMode === "online") {
    await set(ref(db, `${pathClientCounters()}/${cloudKey}`), next);
  }

  return next;
}

async function getNextInvoiceNumber() {
  return await getNextCounter("invoiceCounter", "invoiceAutoNumber");
}

async function getNextPurchaseNumber() {
  return await getNextCounter("purchaseCounter", "purchaseAutoNumber");
}

async function updateCurrencyUI() {
  const settings = await getClientSettings();
  setLocalSettings(settings);

  if (qs("sideCurrencyText")) qs("sideCurrencyText").innerText = `${settings.currencySymbol} ${settings.currencyName}`;
  if (qs("posCurrencyBadge")) qs("posCurrencyBadge").innerText = `${settings.currencySymbol} ${settings.currencyName}`;
  if (qs("sideModeText")) qs("sideModeText").innerText = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";
  if (qs("setCurrentSystemMode")) qs("setCurrentSystemMode").innerText = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";
}

function applyPlanBadgeFromSession() {
  const session = getLocalSession();
  if (!session) return;

  const isUnlimited = session.durationType === "unlimited";
  const label = session.appMode === "offline"
    ? (isUnlimited ? "نسخة برو أوفلاين" : "نسخة أوفلاين")
    : (isUnlimited ? "نسخة برو أونلاين" : "نسخة أونلاين");

  if (qs("licensePlanBadge")) qs("licensePlanBadge").innerText = label;
  if (qs("settingsPlanBadge")) qs("settingsPlanBadge").innerText = label;
}

function updateLicenseUIFromSession() {
  const session = getLocalSession();
  if (!session) return;

  const remaining = session.expiresAt ? (new Date(session.expiresAt).getTime() - Date.now()) : null;

  if (qs("sideLicenseKey")) qs("sideLicenseKey").innerText = session.key || "-";
  if (qs("sideLicenseRemaining")) qs("sideLicenseRemaining").innerText = formatRemaining(remaining);
  if (qs("setCurrentKey")) qs("setCurrentKey").innerText = session.key || "-";
  if (qs("setCurrentLicenseType")) qs("setCurrentLicenseType").innerText = durationTypeLabel(session.durationType);
  if (qs("setCurrentLicenseStart")) qs("setCurrentLicenseStart").innerText = formatDateTime(session.startedAt);
  if (qs("setCurrentLicenseEnd")) qs("setCurrentLicenseEnd").innerText = session.expiresAt ? formatDateTime(session.expiresAt) : "غير محدود";
  if (qs("setCurrentLicenseRemaining")) qs("setCurrentLicenseRemaining").innerText = formatRemaining(remaining);

  applyPlanBadgeFromSession();
}

async function loadCurrentStore() {
  const store = await idbGet("stores", currentStoreId);
  if (!store) return;

  if (qs("sideStoreName")) qs("sideStoreName").innerText = store.name || "اسم المحل";
  if (qs("mobileStoreName")) qs("mobileStoreName").innerText = store.name || "نظام الكاشير";
  if (qs("invPageStoreName")) qs("invPageStoreName").innerText = store.name || "المحل";

  setImageOrHide(qs("sideLogo"), store.logo);
  setImageOrHide(qs("invPageLogo"), store.logo);
}

function showLogin(message = "") {
  qs("mainApp")?.classList.add("hidden");
  qs("invoicePage")?.classList.add("hidden");
  qs("licenseExpiredPage")?.classList.add("hidden");
  qs("loginPage")?.classList.remove("hidden");

  const err = qs("loginError");
  if (err) {
    if (message) {
      err.innerText = message;
      err.classList.remove("hidden");
    } else {
      err.innerText = "";
      err.classList.add("hidden");
    }
  }
}

function showExpired(message = "انتهى وقت المفتاح أو عدد الأجهزة المتاحة.") {
  qs("mainApp")?.classList.add("hidden");
  qs("invoicePage")?.classList.add("hidden");
  qs("loginPage")?.classList.add("hidden");
  qs("licenseExpiredPage")?.classList.remove("hidden");

  if (qs("expiredMessage")) qs("expiredMessage").innerText = message;
  lucide.createIcons();
}

function showApp() {
  qs("loginPage")?.classList.add("hidden");
  qs("licenseExpiredPage")?.classList.add("hidden");
  qs("invoicePage")?.classList.add("hidden");
  qs("mainApp")?.classList.remove("hidden");
}

function openMobileMenu() {
  qs("sideNav")?.classList.add("open");
  qs("sideBackdrop")?.classList.remove("hidden");
}

function closeMobileMenu() {
  qs("sideNav")?.classList.remove("open");
  qs("sideBackdrop")?.classList.add("hidden");
}

function activateNav(tabId) {
  qsa(".tab-content").forEach(c => c.classList.add("hidden"));
  qsa(".nav-btn").forEach(b => b.classList.remove("active"));

  qs(`tab-${tabId}`)?.classList.remove("hidden");
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");

  closeMobileMenu();
}

async function switchTab(tabId) {
  activateNav(tabId);

  if (tabId === "dashboard") await renderDashboard();
  if (tabId === "pos") await renderPosProducts();
  if (tabId === "inventory") await resetProductsAndRender();
  if (tabId === "sales") await resetInvoicesAndRender();
  if (tabId === "purchases") await renderPurchases();
  if (tabId === "supplierPayments") await renderSupplierPayments();
  if (tabId === "customers") await renderCustomers();
  if (tabId === "expenses") await renderExpenses();
  if (tabId === "reports") await renderReports();
  if (tabId === "shortages") await renderShortages();
  if (tabId === "stores") await renderStoresList();
  if (tabId === "settings") await loadSettingsPage();

  lucide.createIcons();
}

async function initApp() {
  await bootSessionState();
}

function bindBaseEvents() {
  qs("loginBtn")?.addEventListener("click", handleLicenseLogin);
  qs("goToLoginBtn")?.addEventListener("click", goToLoginFromExpired);

  qs("openMobileMenuBtn")?.addEventListener("click", openMobileMenu);
  qs("closeMobileMenuBtn")?.addEventListener("click", closeMobileMenu);
  qs("sideBackdrop")?.addEventListener("click", closeMobileMenu);

  qs("licenseKeyInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") handleLicenseLogin();
  });

  qs("openNewProductBtn")?.addEventListener("click", openNewProduct);
  qs("saveProductBtn")?.addEventListener("click", saveProduct);
  qs("openPaymentModalBtn")?.addEventListener("click", openPaymentModal);
  qs("createInvoiceBtn")?.addEventListener("click", checkout);

  qs("inventorySearch")?.addEventListener("input", resetProductsAndRender);
  qs("inventoryCategoryFilter")?.addEventListener("change", resetProductsAndRender);
  qs("inventoryStockFilter")?.addEventListener("change", resetProductsAndRender);
  qs("loadMoreProductsBtn")?.addEventListener("click", loadMoreProducts);

  qs("posSearch")?.addEventListener("input", searchPosProducts);
  qs("posCategoryFilter")?.addEventListener("change", renderPosProducts);
  qs("posDiscount")?.addEventListener("input", calculateTotal);
  qs("discountType")?.addEventListener("change", calculateTotal);

  qs("prodUnitType")?.addEventListener("change", syncUnitLabels);
  qs("prodUnitFactor")?.addEventListener("input", calculateProductStockFromForm);
  qs("prodStockInputQty")?.addEventListener("input", calculateProductStockFromForm);
  qs("prodStockInputUnit")?.addEventListener("change", calculateProductStockFromForm);
  qs("prodLargeCost")?.addEventListener("input", calculateBaseCostFromLarge);
  qs("prodLargePrice")?.addEventListener("input", calculateBasePriceFromLarge);

  qs("invSearchQuery")?.addEventListener("input", resetInvoicesAndRender);
  qs("invoiceStatusFilter")?.addEventListener("change", resetInvoicesAndRender);
  qs("loadMoreInvoicesBtn")?.addEventListener("click", loadMoreInvoices);

  qs("salesReportRange")?.addEventListener("change", () => toggleCustomDate("salesReportRange", "salesReportDate"));
  qs("purchasesReportRange")?.addEventListener("change", () => toggleCustomDate("purchasesReportRange", "purchasesReportDate"));
  qs("reportFilter")?.addEventListener("change", () => toggleCustomDate("reportFilter", "reportCustomDate"));

  qs("printSalesReportBtn")?.addEventListener("click", () => exportSalesReport("print"));
  qs("exportSalesReportPdfBtn")?.addEventListener("click", () => exportSalesReport("pdf"));
  qs("exportSalesReportImageBtn")?.addEventListener("click", () => exportSalesReport("image"));

  qs("openPurchaseModalBtn")?.addEventListener("click", openPurchaseModal);
  qs("addPurchaseItemRowBtn")?.addEventListener("click", () => addPurchaseItemRow());
  qs("savePurchaseBtn")?.addEventListener("click", savePurchase);
  qs("purchasesSearch")?.addEventListener("input", renderPurchases);
  qs("printPurchasesReportBtn")?.addEventListener("click", () => exportPurchasesReport("print"));
  qs("exportPurchasesReportPdfBtn")?.addEventListener("click", () => exportPurchasesReport("pdf"));
  qs("exportPurchasesReportImageBtn")?.addEventListener("click", () => exportPurchasesReport("image"));

  qs("openSupplierPaymentModalBtn")?.addEventListener("click", openSupplierPaymentModal);
  qs("saveSupplierPaymentBtn")?.addEventListener("click", saveSupplierPayment);
  qs("supplierPaymentsSearch")?.addEventListener("input", renderSupplierPayments);
  qs("supplierPaymentsRange")?.addEventListener("change", renderSupplierPayments);

  qs("openCustomerModalBtn")?.addEventListener("click", openCustomerModal);
  qs("saveCustomerBtn")?.addEventListener("click", saveCustomer);
  qs("customersSearch")?.addEventListener("input", renderCustomers);
  qs("customersDebtFilter")?.addEventListener("change", renderCustomers);
  qs("customerHistoryRange")?.addEventListener("change", () => {
    if (currentCustomerHistoryName || currentCustomerHistoryId) {
      openCustomerHistory(currentCustomerHistoryName, currentCustomerHistoryPhone, currentCustomerHistoryId);
    }
  });
  qs("customerSendDebtMsgBtn")?.addEventListener("click", sendDebtMessageToCustomer);
  qs("saveCustomerPaymentBtn")?.addEventListener("click", saveCustomerPayment);

  qs("openExpenseModalBtn")?.addEventListener("click", openExpenseModal);
  qs("saveExpenseBtn")?.addEventListener("click", saveExpense);
  qs("expensesSearch")?.addEventListener("input", renderExpenses);
  qs("expensesRange")?.addEventListener("change", renderExpenses);
  qs("expensesProfitFilter")?.addEventListener("change", renderExpenses);

  qs("printExpensesBtn")?.addEventListener("click", () => exportExpensesReport("print"));
  qs("exportExpensesPdfBtn")?.addEventListener("click", () => exportExpensesReport("pdf"));
  qs("exportExpensesImageBtn")?.addEventListener("click", () => exportExpensesReport("image"));

  qs("printFinanceReportBtn")?.addEventListener("click", () => exportFinanceReport("print"));
  qs("exportFinanceReportPdfBtn")?.addEventListener("click", () => exportFinanceReport("pdf"));
  qs("exportFinanceReportImageBtn")?.addEventListener("click", () => exportFinanceReport("image"));

  qs("refreshShortagesBtn")?.addEventListener("click", renderShortages);
  qs("shortageSearch")?.addEventListener("input", renderShortages);
  qs("shortageLimitInput")?.addEventListener("input", renderShortages);
  qs("shortageCategoryFilter")?.addEventListener("change", renderShortages);
  qs("printShortageReportBtn")?.addEventListener("click", () => exportShortageReport("print"));
  qs("exportShortageReportPdfBtn")?.addEventListener("click", () => exportShortageReport("pdf"));
  qs("exportShortageReportImageBtn")?.addEventListener("click", () => exportShortageReport("image"));

  qs("createStoreBtn")?.addEventListener("click", createNewStore);

  qs("setStoreLogo")?.addEventListener("input", e => previewStoreLogo(e.target.value));
  qs("addAccountBtn")?.addEventListener("click", addTransferAccount);
  qs("addPaymentMethodBtn")?.addEventListener("click", addPaymentMethod);
  qs("saveSettingsBtn")?.addEventListener("click", saveSettings);
  qs("logoutBtn")?.addEventListener("click", logoutUser);

  qs("downloadBackupBtn")?.addEventListener("click", downloadBackupFile);
  qs("saveCloudBackupBtn")?.addEventListener("click", saveCloudBackup);
  qs("restoreBackupInput")?.addEventListener("change", restoreBackupFromFile);
  qs("downloadOfflinePackageBtn")?.addEventListener("click", downloadOfflinePackage);
  qs("importOfflinePackageInput")?.addEventListener("change", importOfflinePackage);
  qs("uploadOfflineDataBtn")?.addEventListener("click", uploadOfflineDataToCloud);

  qs("backFromInvoiceBtn")?.addEventListener("click", backFromInvoicePage);
  qs("printInvoiceBtn")?.addEventListener("click", printInvoicePage);
  qs("exportInvoiceImageBtn")?.addEventListener("click", () => exportInvoicePage("image"));
  qs("exportInvoicePdfBtn")?.addEventListener("click", () => exportInvoicePage("pdf"));
  qs("shareInvoiceBtn")?.addEventListener("click", shareCurrentInvoice);

  qs("saveStatusBtn")?.addEventListener("click", saveInvoiceStatus);

  qs("barcodeImageInputPos")?.addEventListener("change", e => scanBarcodeFromImage(e, "pos"));
  qs("barcodeImageInputInvoice")?.addEventListener("change", e => scanBarcodeFromImage(e, "invoice"));

  qs("customerName")?.addEventListener("input", handleCustomerInput);
  qs("customerPhone")?.addEventListener("input", handleCustomerInput);
  qs("manualCustomerName")?.addEventListener("input", handleManualCustomerInput);
  qs("manualCustomerPhone")?.addEventListener("input", handleManualCustomerInput);

  window.addEventListener("online", handleOnlineBack);
  window.addEventListener("offline", () => updateSyncState("أوفلاين - البيانات تحفظ على الجهاز"));

  window.addEventListener("popstate", async () => {
    if (qs("scannerModal") && !qs("scannerModal").classList.contains("hidden")) {
      await closeScanner(true);
      return;
    }

    const invoicePageVisible = qs("invoicePage") && !qs("invoicePage").classList.contains("hidden");
    if (invoicePageVisible) {
      backFromInvoicePage();
    }
  });

  document.addEventListener("click", e => {
    const posResults = qs("posSearchResults");
    const posInput = qs("posSearch");
    if (posResults && !posResults.contains(e.target) && e.target !== posInput) {
      posResults.classList.add("hidden");
    }

    const customerBox = qs("customerSuggestions");
    if (customerBox && !customerBox.contains(e.target) && e.target !== qs("customerName") && e.target !== qs("customerPhone")) {
      customerBox.classList.add("hidden");
    }

    const manualBox = qs("manualCustomerSuggestions");
    if (manualBox && !manualBox.contains(e.target) && e.target !== qs("manualCustomerName") && e.target !== qs("manualCustomerPhone")) {
      manualBox.classList.add("hidden");
    }
  });
}

function toggleCustomDate(selectId, dateId) {
  const show = qs(selectId)?.value === "customDay";
  qs(dateId)?.classList.toggle("hidden", !show);
}

function updateSyncState(text) {
  if (qs("mobileSyncState")) qs("mobileSyncState").innerText = text;
}

window.switchTab = switchTab;
window.openScanner = openScanner;
window.toggleScannerTorch = toggleScannerTorch;
window.closeScanner = closeScanner;
window.toggleModal = toggleModal;
window.previewStoreLogo = previewStoreLogo;
async function bootSessionState() {
  const session = getLocalSession();

  if (!session) {
    showLogin();
    return;
  }

  if (session.expiresAt && Date.now() >= new Date(session.expiresAt).getTime()) {
    clearLocalSession();
    localStorage.removeItem("activeStoreId");
    showExpired("انتهى وقت المفتاح.");
    return;
  }

  await ensureClientDefaults();
  await loadCurrentStore();
  await updateCurrencyUI();

  if (!isOnline()) {
    detachRealtimeListeners();
    showApp();
    await switchTab("dashboard");
    updateLicenseUIFromSession();
    startLicenseWatcher();
    updateSyncState("أوفلاين - البيانات تحفظ على الجهاز");
    return;
  }

  if (session.appMode === "online") {
    await refreshSessionFromLicense();
    await processSyncQueue();
    await syncCloudToOffline();
    attachRealtimeListeners();
  } else {
    detachRealtimeListeners();
  }

  showApp();
  await switchTab("dashboard");
  updateLicenseUIFromSession();
  startLicenseWatcher();
  updateSyncState(session.appMode === "online" ? "متصل - مزامنة فعالة" : "وضع أوفلاين");
}

async function handleLicenseLogin() {
  const key = qs("licenseKeyInput")?.value.trim();
  const err = qs("loginError");
  if (err) err.classList.add("hidden");

  if (!key) {
    if (err) {
      err.innerText = "يرجى إدخال المفتاح";
      err.classList.remove("hidden");
    }
    return;
  }

  if (!isOnline()) {
    showLogin("أول دخول يحتاج إنترنت");
    return;
  }

  try {
    await showLoader("جاري التحقق من المفتاح...");
    setLoaderProgress(25);

    const snap = await get(ref(db, `${pathLicenses()}/${sanitizeKey(key)}`));
    setLoaderProgress(55);

    if (!snap.exists()) {
      hideLoader();
      showLogin("المفتاح غير موجود");
      return;
    }

    const lic = snap.val();

    if ((lic.status || "active") === "inactive") {
      hideLoader();
      showLogin("هذا المفتاح غير مفعل");
      return;
    }

    const maxLogins = lic.maxLogins === "unlimited" ? null : Number(lic.maxLogins ?? 1);
    const usedLogins = Number(lic.usedLogins || 0);

    if (maxLogins !== null && usedLogins >= maxLogins) {
      hideLoader();
      showExpired("انتهت عدد الأجهزة المتاحة لمفتاحك");
      return;
    }

    const now = new Date();
    const durationType = lic.durationType || "unlimited";
    const durationValue = Number(lic.durationValue || 0);
    const durationMs = getDurationMs(durationType, durationValue);

    let startedAt = lic.startedAt || now.toISOString();
    let expiresAt = lic.expiresAt || null;

    if (!lic.startedAt) {
      startedAt = now.toISOString();
      expiresAt = durationMs === null ? null : new Date(now.getTime() + durationMs).toISOString();
    } else if (expiresAt && Date.now() >= new Date(expiresAt).getTime()) {
      hideLoader();
      showExpired("انتهى وقت هذا المفتاح");
      return;
    }

    await update(ref(db, `${pathLicenses()}/${sanitizeKey(key)}`), {
      startedAt,
      expiresAt,
      usedLogins: usedLogins + 1,
      lastLoginAt: nowIso()
    });

    setLoaderProgress(75);

    const session = {
      key,
      durationType,
      durationValue,
      startedAt,
      expiresAt,
      loginAt: nowIso(),
      appMode: lic.appMode || "online",
      allowOfflineFallback: lic.allowOfflineFallback === true,
      rememberSession: lic.rememberSession !== false,
      firstVerified: true
    };

    setLocalSession(session);
    currentStoreId = "default";
    localStorage.setItem("activeStoreId", "default");

    await ensureClientDefaults();
    await syncCloudToOffline();
    await processSyncQueue();
    await loadCurrentStore();
    await updateCurrencyUI();

    if (session.appMode === "online") {
      attachRealtimeListeners();
    }

    if (qs("licenseKeyInput")) qs("licenseKeyInput").value = "";

    setLoaderProgress(100);
    hideLoader();

    showApp();
    await switchTab("dashboard");
    updateLicenseUIFromSession();
    startLicenseWatcher();
    showToast("تم تسجيل الدخول بنجاح", "success");
  } catch (err) {
    hideLoader();
    console.error(err);
    showLogin("حدث خطأ أثناء تسجيل الدخول");
  }
}

function goToLoginFromExpired() {
  showLogin();
}

async function refreshSessionFromLicense() {
  const session = getLocalSession();
  if (!session?.key || !isOnline()) return;

  const snap = await get(ref(db, `${pathLicenses()}/${sanitizeKey(session.key)}`));
  if (!snap.exists()) {
    clearLocalSession();
    detachRealtimeListeners();
    showExpired("تم حذف المفتاح");
    return;
  }

  const lic = snap.val();
  const now = Date.now();

  if ((lic.status || "active") === "inactive") {
    clearLocalSession();
    detachRealtimeListeners();
    showExpired("تم إيقاف هذا المفتاح");
    return;
  }

  const startedAt = lic.startedAt || session.startedAt || null;
  const expiresAt = lic.expiresAt || null;

  if (expiresAt && now >= new Date(expiresAt).getTime()) {
    clearLocalSession();
    detachRealtimeListeners();
    showExpired("انتهى وقت المفتاح");
    return;
  }

  const appMode = lic.appMode || "online";
  const allowOfflineFallback = lic.allowOfflineFallback === true;

  const newSession = {
    ...session,
    durationType: lic.durationType || session.durationType,
    durationValue: lic.durationValue ?? session.durationValue,
    startedAt,
    expiresAt,
    appMode,
    allowOfflineFallback,
    rememberSession: lic.rememberSession !== false,
    firstVerified: true
  };

  setLocalSession(newSession);
  updateLicenseUIFromSession();

  const cloudSettingsSnap = await get(ref(db, pathClientSettings()));
  const cloudSettings = cloudSettingsSnap.exists() ? cloudSettingsSnap.val() : {};
  const currentLocal = await getClientSettings();

  const mergedSettings = {
    id: "settings",
    currencyName: cloudSettings?.currencyName || currentLocal.currencyName || "شيكل",
    currencySymbol: cloudSettings?.currencySymbol || currentLocal.currencySymbol || "₪",
    appMode,
    paymentInfo: cloudSettings?.paymentInfo || currentLocal.paymentInfo || "",
    lowStockDefault: Number(cloudSettings?.lowStockDefault ?? currentLocal.lowStockDefault ?? 5),
    expensesDeductDefault: cloudSettings?.expensesDeductDefault !== false,
    updatedAt: nowIso()
  };

  await idbSet("meta", mergedSettings);
  setLocalSettings(mergedSettings);
  await updateCurrencyUI();
}

function startLicenseWatcher() {
  if (licenseWatcher) clearInterval(licenseWatcher);

  licenseWatcher = setInterval(async () => {
    const session = getLocalSession();

    if (!session) {
      clearInterval(licenseWatcher);
      return;
    }

    updateLicenseUIFromSession();

    if (session.expiresAt && Date.now() >= new Date(session.expiresAt).getTime()) {
      clearLocalSession();
      localStorage.removeItem("activeStoreId");
      detachRealtimeListeners();
      showExpired("انتهى وقت المفتاح.");
      return;
    }

    if (isOnline() && session.firstVerified) {
      try {
        await refreshSessionFromLicense();
        await processSyncQueue();
      } catch (err) {
        console.warn("تعذر تحديث الترخيص أو المزامنة", err);
      }
    }
  }, 12000);
}

async function handleOnlineBack() {
  updateSyncState("عاد الإنترنت - جاري المزامنة...");

  try {
    const session = getLocalSession();
    if (!session) return;

    if (session.appMode === "online") {
      await refreshSessionFromLicense();
      await processSyncQueue();
      await syncCloudToOffline();
      attachRealtimeListeners();
      await refreshVisibleTab();
      updateSyncState("متصل - تمت المزامنة");
      showToast("تمت مزامنة البيانات", "success");
    }
  } catch (err) {
    console.error(err);
    updateSyncState("فشل جزئي في المزامنة");
    showToast("تعذرت المزامنة الكاملة", "warning");
  }
}

async function refreshVisibleTab() {
  const visible = qsa(".tab-content").find(el => !el.classList.contains("hidden"));
  if (!visible) return;

  const id = visible.id.replace("tab-", "");
  await switchTab(id);
}

function attachRealtimeListeners() {
  detachRealtimeListeners();

  const session = getLocalSession();
  if (!session || session.appMode !== "online" || !baseClientPath()) return;

  storesListenerRef = ref(db, pathClientStores());
  productsListenerRef = ref(db, pathClientProducts());
  invoicesListenerRef = ref(db, pathClientInvoices());
  purchasesListenerRef = ref(db, pathClientPurchases());
  customersListenerRef = ref(db, pathClientCustomers());
  expensesListenerRef = ref(db, pathClientExpenses());
  supplierPaymentsListenerRef = ref(db, pathClientSupplierPayments());

  if (session.key) {
    licenseListenerRef = ref(db, `${pathLicenses()}/${sanitizeKey(session.key)}`);
    onValue(licenseListenerRef, async () => {
      try {
        await refreshSessionFromLicense();
      } catch {}
    });
  }

  onValue(storesListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await replaceStoreFromCloud("stores", items);
    await loadCurrentStore();
    await refreshIfVisible(["stores", "dashboard"]);
  });

  onValue(productsListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await replaceStoreFromCloud("products", items);
    await refreshIfVisible(["inventory", "pos", "dashboard", "shortages", "reports"]);
  });

  onValue(invoicesListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await replaceStoreFromCloud("invoices", items);
    await refreshIfVisible(["sales", "customers", "dashboard", "reports"]);
  });

  onValue(purchasesListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await replaceStoreFromCloud("purchases", items);
    await refreshIfVisible(["purchases", "dashboard", "reports"]);
  });

  onValue(customersListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await replaceStoreFromCloud("customers", items);
    await refreshIfVisible(["customers", "dashboard"]);
  });

  onValue(expensesListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await replaceStoreFromCloud("expenses", items);
    await refreshIfVisible(["expenses", "dashboard", "reports"]);
  });

  onValue(supplierPaymentsListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await replaceStoreFromCloud("supplierPayments", items);
    await refreshIfVisible(["supplierPayments", "reports"]);
  });
}

async function replaceStoreFromCloud(storeName, items) {
  const queue = await idbGetAll("syncQueue");
  const hasPendingForStore = queue.some(q => q.kind === storeName);

  if (hasPendingForStore) {
    return;
  }

  await idbClear(storeName);
  for (const item of items) {
    await idbSet(storeName, item);
  }
}

async function refreshIfVisible(tabIds) {
  const visible = qsa(".tab-content").find(el => !el.classList.contains("hidden"));
  if (!visible) return;

  const id = visible.id.replace("tab-", "");
  if (tabIds.includes(id)) {
    await switchTab(id);
  }
}

function detachRealtimeListeners() {
  if (storesListenerRef) off(storesListenerRef);
  if (productsListenerRef) off(productsListenerRef);
  if (invoicesListenerRef) off(invoicesListenerRef);
  if (purchasesListenerRef) off(purchasesListenerRef);
  if (customersListenerRef) off(customersListenerRef);
  if (expensesListenerRef) off(expensesListenerRef);
  if (supplierPaymentsListenerRef) off(supplierPaymentsListenerRef);
  if (licenseListenerRef) off(licenseListenerRef);

  storesListenerRef = null;
  productsListenerRef = null;
  invoicesListenerRef = null;
  purchasesListenerRef = null;
  customersListenerRef = null;
  expensesListenerRef = null;
  supplierPaymentsListenerRef = null;
  licenseListenerRef = null;
}

async function processSyncQueue() {
  const session = getLocalSession();
  if (!isOnline() || session?.appMode !== "online") return;

  const queue = await idbGetAll("syncQueue");
  if (!queue.length) return;

  queue.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  await showLoader("جاري مزامنة بيانات الأوفلاين...");
  let done = 0;

  for (const action of queue) {
    try {
      if (action.type === "set") {
        await set(ref(db, `${pathForKind(action.kind)}/${action.id}`), action.payload);
      }

      if (action.type === "delete") {
        await remove(ref(db, `${pathForKind(action.kind)}/${action.id}`));
      }

      await idbDelete("syncQueue", action.id);
    } catch (err) {
      console.error("Sync action failed", action, err);
      break;
    }

    done++;
    setLoaderProgress((done / queue.length) * 100);
  }

  hideLoader();
}

async function syncCloudToOffline() {
  const session = getLocalSession();
  if (!isOnline() || session?.appMode !== "online" || !baseClientPath()) return;

  const pending = await idbGetAll("syncQueue");
  if (pending.length) {
    await processSyncQueue();
  }

  await showLoader("جاري تنزيل البيانات من السحابة...");
  setLoaderProgress(10);

  const [
    storesSnap,
    productsSnap,
    invoicesSnap,
    purchasesSnap,
    customersSnap,
    expensesSnap,
    supplierPaymentsSnap,
    settingsSnap,
    counterSnap,
    purchaseCounterSnap,
    accountsSnap,
    paymentMethodsSnap
  ] = await Promise.all([
    get(ref(db, pathClientStores())),
    get(ref(db, pathClientProducts())),
    get(ref(db, pathClientInvoices())),
    get(ref(db, pathClientPurchases())),
    get(ref(db, pathClientCustomers())),
    get(ref(db, pathClientExpenses())),
    get(ref(db, pathClientSupplierPayments())),
    get(ref(db, pathClientSettings())),
    get(ref(db, `${pathClientCounters()}/invoiceAutoNumber`)),
    get(ref(db, `${pathClientCounters()}/purchaseAutoNumber`)),
    get(ref(db, `${baseClientPath()}/meta/transferAccounts`)),
    get(ref(db, `${baseClientPath()}/meta/paymentMethods`))
  ]);

  setLoaderProgress(40);

  const stores = storesSnap.exists() ? Object.values(storesSnap.val() || {}) : [];
  const products = productsSnap.exists() ? Object.values(productsSnap.val() || {}) : [];
  const invoices = invoicesSnap.exists() ? Object.values(invoicesSnap.val() || {}) : [];
  const purchases = purchasesSnap.exists() ? Object.values(purchasesSnap.val() || {}) : [];
  const customers = customersSnap.exists() ? Object.values(customersSnap.val() || {}) : [];
  const expenses = expensesSnap.exists() ? Object.values(expensesSnap.val() || {}) : [];
  const supplierPayments = supplierPaymentsSnap.exists() ? Object.values(supplierPaymentsSnap.val() || {}) : [];
  const settings = settingsSnap.exists() ? settingsSnap.val() : {};
  const counter = counterSnap.exists() ? Number(counterSnap.val()) : 0;
  const purchaseCounter = purchaseCounterSnap.exists() ? Number(purchaseCounterSnap.val()) : 0;

  await idbClear("stores");
  await idbClear("products");
  await idbClear("invoices");
  await idbClear("purchases");
  await idbClear("customers");
  await idbClear("expenses");
  await idbClear("supplierPayments");

  setLoaderProgress(60);

  for (const s of stores) await idbSet("stores", s);
  for (const p of products) await idbSet("products", p);
  for (const i of invoices) await idbSet("invoices", i);
  for (const p of purchases) await idbSet("purchases", p);
  for (const c of customers) await idbSet("customers", c);
  for (const e of expenses) await idbSet("expenses", e);
  for (const sp of supplierPayments) await idbSet("supplierPayments", sp);

  setLoaderProgress(80);

  await idbSet("meta", {
    id: "settings",
    currencyName: settings?.currencyName || "شيكل",
    currencySymbol: settings?.currencySymbol || "₪",
    paymentInfo: settings?.paymentInfo || "",
    lowStockDefault: Number(settings?.lowStockDefault ?? 5),
    expensesDeductDefault: settings?.expensesDeductDefault !== false,
    appMode: session?.appMode || "online",
    updatedAt: nowIso()
  });

  await idbSet("meta", { id: "invoiceCounter", value: counter });
  await idbSet("meta", { id: "purchaseCounter", value: purchaseCounter });

  if (accountsSnap.exists()) {
    await setTransferAccounts(accountsSnap.val()?.items || []);
  }

  if (paymentMethodsSnap.exists()) {
    await setPaymentMethods(paymentMethodsSnap.val()?.items || []);
  }

  setLoaderProgress(100);
  hideLoader();
}

async function uploadOfflineDataToCloud() {
  const session = getLocalSession();

  if (!session || session.appMode !== "online") {
    alert("هذه الميزة متاحة فقط لمفاتيح الأونلاين");
    return;
  }

  if (!isOnline()) {
    alert("هذه العملية تحتاج إنترنت");
    return;
  }

  await showLoader("جاري رفع بيانات الأوفلاين إلى السحابة...");

  const stores = await idbGetAll("stores");
  const products = await idbGetAll("products");
  const invoices = await idbGetAll("invoices");
  const purchases = await idbGetAll("purchases");
  const customers = await idbGetAll("customers");
  const expenses = await idbGetAll("expenses");
  const supplierPayments = await idbGetAll("supplierPayments");
  const settings = await idbGet("meta", "settings");
  const counter = await idbGet("meta", "invoiceCounter");
  const purchaseCounter = await idbGet("meta", "purchaseCounter");
  const accounts = await getTransferAccounts();
  const paymentMethods = await getPaymentMethods();

  const allSteps =
    stores.length +
    products.length +
    invoices.length +
    purchases.length +
    customers.length +
    expenses.length +
    supplierPayments.length +
    5;

  let step = 0;
  const tick = () => {
    step++;
    setLoaderProgress((step / allSteps) * 100);
  };

  for (const s of stores) {
    await set(ref(db, `${pathClientStores()}/${s.id}`), s);
    tick();
  }

  for (const p of products) {
    await set(ref(db, `${pathClientProducts()}/${p.id}`), p);
    tick();
  }

  for (const i of invoices) {
    await set(ref(db, `${pathClientInvoices()}/${i.id}`), i);
    tick();
  }

  for (const p of purchases) {
    await set(ref(db, `${pathClientPurchases()}/${p.id}`), p);
    tick();
  }

  for (const c of customers) {
    await set(ref(db, `${pathClientCustomers()}/${c.id}`), c);
    tick();
  }

  for (const e of expenses) {
    await set(ref(db, `${pathClientExpenses()}/${e.id}`), e);
    tick();
  }

  for (const sp of supplierPayments) {
    await set(ref(db, `${pathClientSupplierPayments()}/${sp.id}`), sp);
    tick();
  }

  if (settings) {
    await update(ref(db, pathClientSettings()), {
      currencyName: settings.currencyName || "شيكل",
      currencySymbol: settings.currencySymbol || "₪",
      paymentInfo: settings.paymentInfo || "",
      lowStockDefault: Number(settings.lowStockDefault ?? 5),
      expensesDeductDefault: settings.expensesDeductDefault !== false,
      appMode: "online",
      updatedAt: nowIso()
    });
  }
  tick();

  if (counter?.value != null) {
    await set(ref(db, `${pathClientCounters()}/invoiceAutoNumber`), Number(counter.value || 0));
  }
  tick();

  if (purchaseCounter?.value != null) {
    await set(ref(db, `${pathClientCounters()}/purchaseAutoNumber`), Number(purchaseCounter.value || 0));
  }
  tick();

  await set(ref(db, `${baseClientPath()}/meta/transferAccounts`), {
    id: "transferAccounts",
    items: accounts,
    updatedAt: nowIso()
  });
  tick();

  await set(ref(db, `${baseClientPath()}/meta/paymentMethods`), {
    id: "paymentMethods",
    items: paymentMethods,
    updatedAt: nowIso()
  });
  tick();

  await idbClear("syncQueue");

  hideLoader();
  showToast("تم رفع بيانات الأوفلاين إلى السحابة", "success");
}

async function downloadOfflinePackage() {
  if (!isOnline() || getLocalSession()?.appMode !== "online") {
    alert("هذه العملية تحتاج نسخة أونلاين وإنترنت");
    return;
  }

  await syncCloudToOffline();

  const payload = {
    packageType: "offline-sync-package",
    createdAt: nowIso(),
    key: currentLicenseKey(),
    session: getLocalSession(),
    settings: await idbGet("meta", "settings"),
    stores: await idbGetAll("stores"),
    products: await idbGetAll("products"),
    invoices: await idbGetAll("invoices"),
    purchases: await idbGetAll("purchases"),
    customers: await idbGetAll("customers"),
    expenses: await idbGetAll("expenses"),
    supplierPayments: await idbGetAll("supplierPayments"),
    transferAccounts: await getTransferAccounts(),
    paymentMethods: await getPaymentMethods(),
    invoiceCounter: await idbGet("meta", "invoiceCounter"),
    purchaseCounter: await idbGet("meta", "purchaseCounter")
  };

  downloadJson(payload, `offline_package_${sanitizeKey(currentLicenseKey())}_${Date.now()}.json`);
}

async function importOfflinePackage(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    await showLoader("جاري استيراد حزمة الأوفلاين...");
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data || data.packageType !== "offline-sync-package") {
      throw new Error("ملف غير صالح");
    }

    await restoreLocalDataPayload(data, false);

    hideLoader();
    showToast("تم استيراد حزمة الأوفلاين", "success");
    await bootSessionState();
  } catch (err) {
    hideLoader();
    console.error(err);
    alert("تعذر استيراد الحزمة");
  } finally {
    event.target.value = "";
  }
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

async function restoreLocalDataPayload(data, uploadAfterRestore = true) {
  await idbClear("stores");
  await idbClear("products");
  await idbClear("invoices");
  await idbClear("purchases");
  await idbClear("customers");
  await idbClear("expenses");
  await idbClear("supplierPayments");

  for (const s of data.stores || []) await idbSet("stores", s);
  for (const p of data.products || []) await idbSet("products", p);
  for (const i of data.invoices || []) await idbSet("invoices", i);
  for (const p of data.purchases || []) await idbSet("purchases", p);
  for (const c of data.customers || []) await idbSet("customers", c);
  for (const e of data.expenses || []) await idbSet("expenses", e);
  for (const sp of data.supplierPayments || []) await idbSet("supplierPayments", sp);

  if (data.settings) {
    await idbSet("meta", { id: "settings", ...data.settings });
    setLocalSettings(data.settings);
  }

  if (data.transferAccounts) {
    await setTransferAccounts(data.transferAccounts);
  }

  if (data.paymentMethods) {
    await setPaymentMethods(data.paymentMethods);
  }

  const maxInvoiceId = Math.max(0, ...(data.invoices || []).map(i => Number(i.id) || 0));
  const maxPurchaseId = Math.max(0, ...(data.purchases || []).map(p => Number(String(p.id).replace(/\D/g, "")) || 0));

  await idbSet("meta", data.invoiceCounter || { id: "invoiceCounter", value: maxInvoiceId });
  await idbSet("meta", data.purchaseCounter || { id: "purchaseCounter", value: maxPurchaseId });

  if (uploadAfterRestore && isOnline() && getLocalSession()?.appMode === "online") {
    await uploadOfflineDataToCloud();
  }
}

async function buildBackupPayload() {
  return {
    backupVersion: BACKUP_VERSION,
    createdAt: nowIso(),
    key: currentLicenseKey(),
    settings: await getClientSettings(),
    stores: await getAllStores(),
    products: await getAllProducts(),
    invoices: await getAllInvoices(),
    purchases: await getAllPurchases(),
    customers: await getAllCustomers(),
    expenses: await getAllExpenses(),
    supplierPayments: await getAllSupplierPayments(),
    transferAccounts: await getTransferAccounts(),
    paymentMethods: await getPaymentMethods(),
    invoiceCounter: await idbGet("meta", "invoiceCounter"),
    purchaseCounter: await idbGet("meta", "purchaseCounter")
  };
}

async function downloadBackupFile() {
  if (!currentLicenseKey()) return;

  await withLoader("جاري تجهيز النسخة الاحتياطية...", async () => {
    const payload = await buildBackupPayload();
    downloadJson(payload, `backup_${sanitizeKey(currentLicenseKey())}_${Date.now()}.json`);
  });
}

async function saveCloudBackup() {
  if (!currentLicenseKey()) return;

  if (!isOnline() || getLocalSession()?.appMode !== "online") {
    alert("هذه العملية تحتاج نسخة أونلاين وإنترنت");
    return;
  }

  await withLoader("جاري حفظ النسخة الاحتياطية...", async () => {
    const payload = await buildBackupPayload();
    const backupId = "backup_" + Date.now();
    await set(ref(db, `${pathClientBackups()}/${backupId}`), payload);
  });

  showToast("تم حفظ النسخة الاحتياطية السحابية", "success");
}

async function restoreBackupFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    await showLoader("جاري استعادة النسخة الاحتياطية...");
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data || !data.backupVersion) {
      throw new Error("ملف غير صالح");
    }

    if (data.key && data.key !== currentLicenseKey()) {
      const ok = confirm("هذه النسخة مرتبطة بمفتاح مختلف. هل تريد المتابعة؟");
      if (!ok) {
        hideLoader();
        return;
      }
    }

    await restoreLocalDataPayload(data, true);
    hideLoader();
    showToast("تمت استعادة النسخة بنجاح", "success");
    await bootSessionState();
  } catch (err) {
    hideLoader();
    console.error(err);
    alert("تعذر استعادة النسخة الاحتياطية");
  } finally {
    event.target.value = "";
  }
}

async function logoutUser() {
  const session = getLocalSession();

  if (session?.key && isOnline() && session.appMode === "online") {
    try {
      const licRef = ref(db, `${pathLicenses()}/${sanitizeKey(session.key)}`);
      const snap = await get(licRef);

      if (snap.exists()) {
        const lic = snap.val();
        const used = Math.max(0, Number(lic.usedLogins || 0) - 1);

        await update(licRef, {
          usedLogins: used,
          lastLogoutAt: nowIso()
        });
      }
    } catch {}
  }

  detachRealtimeListeners();
  clearLocalSession();
  localStorage.removeItem("activeStoreId");

  if (licenseWatcher) clearInterval(licenseWatcher);

  showLogin("تم تسجيل الخروج بنجاح");
}
function unitTypeDefaultBase(type) {
  const map = {
    piece: "قطعة",
    carton: "قطعة",
    kg: "جرام",
    gram: "جرام",
    liter: "مل",
    ml: "مل",
    minute: "دقيقة",
    custom: "وحدة"
  };
  return map[type] || "قطعة";
}

function unitTypeDefaultLarge(type) {
  const map = {
    piece: "قطعة",
    carton: "كرتونة",
    kg: "كيلو",
    gram: "جرام",
    liter: "لتر",
    ml: "مل",
    minute: "رصيد",
    custom: "وحدة كبيرة"
  };
  return map[type] || "كرتونة";
}

function unitTypeDefaultFactor(type) {
  const map = {
    piece: 1,
    carton: 24,
    kg: 1000,
    gram: 1,
    liter: 1000,
    ml: 1,
    minute: 1,
    custom: 1
  };
  return map[type] || 1;
}

function unitLabel(product, saleUnit = "base") {
  if (saleUnit === "large") return product.largeUnitName || unitTypeDefaultLarge(product.unitType);
  return product.baseUnitName || unitTypeDefaultBase(product.unitType);
}

function productFactor(product) {
  return Math.max(1, Number(product.unitFactor || 1));
}

function toBaseQty(qty, unit, product) {
  const n = Number(qty || 0);
  if (unit === "large") return n * productFactor(product);
  return n;
}

function fromBaseQty(qty, unit, product) {
  const n = Number(qty || 0);
  if (unit === "large") return n / productFactor(product);
  return n;
}

function syncUnitLabels() {
  const type = qs("prodUnitType")?.value || "piece";

  if (qs("prodBaseUnitName") && !qs("prodBaseUnitName").value.trim()) {
    qs("prodBaseUnitName").value = unitTypeDefaultBase(type);
  }

  if (qs("prodLargeUnitName") && !qs("prodLargeUnitName").value.trim()) {
    qs("prodLargeUnitName").value = unitTypeDefaultLarge(type);
  }

  if (qs("prodUnitFactor")) {
    const current = Number(qs("prodUnitFactor").value || 0);
    if (!current || current === 1) {
      qs("prodUnitFactor").value = unitTypeDefaultFactor(type);
    }
  }

  calculateProductStockFromForm();
}

function calculateProductStockFromForm() {
  const qty = Number(qs("prodStockInputQty")?.value || 0);
  const unit = qs("prodStockInputUnit")?.value || "base";
  const factor = Math.max(1, Number(qs("prodUnitFactor")?.value || 1));
  const stock = unit === "large" ? qty * factor : qty;

  if (qs("prodStock")) qs("prodStock").value = stock;
}

function calculateBaseCostFromLarge() {
  const large = Number(qs("prodLargeCost")?.value || 0);
  const factor = Math.max(1, Number(qs("prodUnitFactor")?.value || 1));

  if (large > 0 && qs("prodCost")) {
    qs("prodCost").value = (large / factor).toFixed(4);
  }
}

function calculateBasePriceFromLarge() {
  const large = Number(qs("prodLargePrice")?.value || 0);
  const factor = Math.max(1, Number(qs("prodUnitFactor")?.value || 1));

  if (large > 0 && qs("prodPrice")) {
    qs("prodPrice").value = (large / factor).toFixed(4);
  }
}

function getProductFormPayload(existing = null) {
  const unitType = qs("prodUnitType")?.value || "piece";
  const factor = Math.max(1, Number(qs("prodUnitFactor")?.value || unitTypeDefaultFactor(unitType)));
  const stock = Number(qs("prodStock")?.value || 0);

  return {
    id: existing?.id || `p_${Date.now()}`,
    storeId: currentStoreId,
    name: qs("prodName")?.value.trim() || "",
    category: qs("prodCategory")?.value.trim() || "",
    code: qs("prodCode")?.value.trim() || "",
    image: qs("prodImage")?.value.trim() || "",
    supplier: qs("prodSupplier")?.value.trim() || "",
    lowStockLimit: Number(qs("prodLowStockLimit")?.value || 5),
    unitType,
    baseUnitName: qs("prodBaseUnitName")?.value.trim() || unitTypeDefaultBase(unitType),
    largeUnitName: qs("prodLargeUnitName")?.value.trim() || unitTypeDefaultLarge(unitType),
    unitFactor: factor,
    stock,
    cost: Number(qs("prodCost")?.value || 0),
    price: Number(qs("prodPrice")?.value || 0),
    largeCost: Number(qs("prodLargeCost")?.value || 0),
    largePrice: Number(qs("prodLargePrice")?.value || 0),
    pricingMode: qs("prodPricingMode")?.value || "base",
    createdAt: existing?.createdAt || nowIso()
  };
}

function resetProductForm() {
  if (qs("editProductId")) qs("editProductId").value = "";
  if (qs("modalTitle")) qs("modalTitle").innerText = "إضافة صنف جديد";

  const fields = [
    "prodName",
    "prodCategory",
    "prodCode",
    "prodImage",
    "prodSupplier",
    "prodLowStockLimit",
    "prodBaseUnitName",
    "prodLargeUnitName",
    "prodStockInputQty",
    "prodStock",
    "prodCost",
    "prodPrice",
    "prodLargeCost",
    "prodLargePrice"
  ];

  fields.forEach(id => {
    if (qs(id)) qs(id).value = "";
  });

  if (qs("prodUnitType")) qs("prodUnitType").value = "piece";
  if (qs("prodUnitFactor")) qs("prodUnitFactor").value = 1;
  if (qs("prodStockInputUnit")) qs("prodStockInputUnit").value = "base";
  if (qs("prodPricingMode")) qs("prodPricingMode").value = "base";

  const st = getLocalSettings();
  if (qs("prodLowStockLimit")) qs("prodLowStockLimit").value = Number(st.lowStockDefault || 5);

  syncUnitLabels();
}

function fillProductForm(p) {
  if (qs("editProductId")) qs("editProductId").value = p.id || "";
  if (qs("modalTitle")) qs("modalTitle").innerText = "تعديل الصنف";

  if (qs("prodName")) qs("prodName").value = p.name || "";
  if (qs("prodCategory")) qs("prodCategory").value = p.category || "";
  if (qs("prodCode")) qs("prodCode").value = p.code || "";
  if (qs("prodImage")) qs("prodImage").value = p.image || "";
  if (qs("prodSupplier")) qs("prodSupplier").value = p.supplier || "";
  if (qs("prodLowStockLimit")) qs("prodLowStockLimit").value = Number(p.lowStockLimit ?? 5);

  if (qs("prodUnitType")) qs("prodUnitType").value = p.unitType || "piece";
  if (qs("prodBaseUnitName")) qs("prodBaseUnitName").value = p.baseUnitName || unitTypeDefaultBase(p.unitType);
  if (qs("prodLargeUnitName")) qs("prodLargeUnitName").value = p.largeUnitName || unitTypeDefaultLarge(p.unitType);
  if (qs("prodUnitFactor")) qs("prodUnitFactor").value = Number(p.unitFactor || 1);

  if (qs("prodStockInputQty")) qs("prodStockInputQty").value = Number(p.stock || 0);
  if (qs("prodStockInputUnit")) qs("prodStockInputUnit").value = "base";
  if (qs("prodStock")) qs("prodStock").value = Number(p.stock || 0);

  if (qs("prodCost")) qs("prodCost").value = Number(p.cost || 0);
  if (qs("prodPrice")) qs("prodPrice").value = Number(p.price || 0);
  if (qs("prodLargeCost")) qs("prodLargeCost").value = Number(p.largeCost || 0);
  if (qs("prodLargePrice")) qs("prodLargePrice").value = Number(p.largePrice || 0);
  if (qs("prodPricingMode")) qs("prodPricingMode").value = p.pricingMode || "base";
}

function openNewProduct() {
  resetProductForm();
  toggleModal("productModal", true);
}

async function saveProduct() {
  try {
    const existingId = qs("editProductId")?.value.trim();
    const existing = existingId ? await getEntity("products", existingId) : null;
    const product = getProductFormPayload(existing);

    if (!product.name) {
      alert("يرجى إدخال اسم الصنف");
      return;
    }

    if (!product.code) {
      product.code = `P-${Date.now()}`;
    }

    await withLoader(existingId ? "جاري تعديل الصنف..." : "جاري حفظ الصنف...", async () => {
      await saveEntity("products", product.id, product);
    });

    toggleModal("productModal", false);
    showToast(existingId ? "تم تعديل الصنف" : "تم حفظ الصنف", "success");

    await refreshCategories();
    await resetProductsAndRender();
    await renderPosProducts();
    await renderDashboard();
  } catch (err) {
    console.error(err);
    alert("تعذر حفظ الصنف");
  }
}

async function editProduct(id) {
  const p = await getEntity("products", id);
  if (!p) {
    alert("الصنف غير موجود");
    return;
  }

  fillProductForm(p);
  toggleModal("productModal", true);
}

async function deleteProduct(id) {
  if (!confirm("هل تريد حذف الصنف؟")) return;

  await withLoader("جاري حذف الصنف...", async () => {
    await deleteEntity("products", id);
  });

  showToast("تم حذف الصنف", "success");
  await resetProductsAndRender();
  await renderPosProducts();
}

function productStockStatus(product) {
  const stock = Number(product.stock || 0);
  const limit = Number(product.lowStockLimit ?? getLocalSettings().lowStockDefault ?? 5);

  if (stock <= 0) return { label: "نفد", cls: "bg-red-100 text-red-700" };
  if (stock <= limit) return { label: "ناقص", cls: "bg-orange-100 text-orange-700" };
  return { label: "متوفر", cls: "bg-green-100 text-green-700" };
}

function productImageHtml(product, sizeClass = "w-12 h-12") {
  if (product.image) {
    return `<img src="${escapeHtmlAttr(product.image)}" class="${sizeClass} rounded-xl object-cover border" crossorigin="anonymous" referrerpolicy="no-referrer">`;
  }

  return `
    <div class="${sizeClass} rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 border">
      <i data-lucide="image-off" size="18"></i>
    </div>
  `;
}

async function filteredProductsForInventory() {
  const search = (qs("inventorySearch")?.value || "").toLowerCase().trim();
  const cat = qs("inventoryCategoryFilter")?.value || "all";
  const stockFilter = qs("inventoryStockFilter")?.value || "all";

  const products = await getAllProducts();

  return products
    .filter(p => p.storeId === currentStoreId)
    .filter(p => {
      const hay = `${p.name || ""} ${p.code || ""} ${p.category || ""} ${p.supplier || ""}`.toLowerCase();
      return !search || hay.includes(search);
    })
    .filter(p => cat === "all" || (p.category || "") === cat)
    .filter(p => {
      const stock = Number(p.stock || 0);
      const limit = Number(p.lowStockLimit ?? getLocalSettings().lowStockDefault ?? 5);

      if (stockFilter === "available") return stock > limit;
      if (stockFilter === "low") return stock > 0 && stock <= limit;
      if (stockFilter === "empty") return stock <= 0;
      return true;
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}

async function renderProducts() {
  const table = qs("productsTable");
  const loading = qs("productsLoading");
  const moreWrap = qs("productsLoadMoreWrap");

  if (!table) return;

  table.innerHTML = "";
  loading?.classList.remove("hidden");

  const filtered = await filteredProductsForInventory();
  const visible = filtered.slice(0, productsCurrentLimit);

  visible.forEach(p => {
    const status = productStockStatus(p);

    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50 transition">
        <td class="p-4">${productImageHtml(p)}</td>
        <td class="p-4 font-mono text-xs">${escapeHtml(p.code || "-")}</td>
        <td class="p-4 font-black text-gray-700">${escapeHtml(p.name || "-")}</td>
        <td class="p-4 text-sm">${escapeHtml(p.category || "-")}</td>
        <td class="p-4 text-sm">${escapeHtml(p.supplier || "-")}</td>
        <td class=p-4 text-sm">
          ${escapeHtml(unitLabel(p, "base"))}
          ${Number(p.unitFactor || 1) > 1 ? `<div class="text-xs text-gray-400">1 ${escapeHtml(unitLabel(p, "large"))} = ${Number(p.unitFactor || 1)} ${escapeHtml(unitLabel(p, "base"))}</div>` : ""}
        </td>
        <td class="p-4">
          <span class="px-3 py-1 rounded-lg text-xs font-black ${status.cls}">
            ${Number(p.stock || 0)} ${escapeHtml(unitLabel(p, "base"))} - ${status.label}
          </span>
        </td>
        <td class="p-4 text-gray-500">${money(p.cost)}</td>
        <td class="p-4 text-blue-700 font-black">${money(p.price)}</td>
        <td class="p-4">
          <div class="flex gap-2 flex-wrap">
            <button onclick="addProductToCartById('${p.id}')" class="text-green-700 bg-green-50 px-3 py-1 rounded-lg text-xs font-black">بيع</button>
            <button onclick="showProductBarcode('${escapeJs(p.code)}','${escapeJs(p.name)}')" class="text-purple-700 bg-purple-50 px-3 py-1 rounded-lg text-xs font-black">باركود</button>
            <button onclick="editProduct('${p.id}')" class="text-blue-700 bg-blue-50 px-3 py-1 rounded-lg text-xs font-black">تعديل</button>
            <button onclick="deleteProduct('${p.id}')" class="text-red-700 bg-red-50 px-3 py-1 rounded-lg text-xs font-black">حذف</button>
          </div>
        </td>
      </tr>
    `;
  });

  loading?.classList.add("hidden");
  moreWrap?.classList.toggle("hidden", visible.length >= filtered.length);

  lucide.createIcons();
}

async function resetProductsAndRender() {
  productsCurrentLimit = productPageSize;
  await refreshCategories();
  await renderProducts();
}

async function loadMoreProducts() {
  productsCurrentLimit += productPageSize;
  await renderProducts();
}

async function refreshCategories() {
  const products = await getAllProducts();
  const categories = [...new Set(
    products
      .filter(p => p.storeId === currentStoreId)
      .map(p => String(p.category || "").trim())
      .filter(Boolean)
  )].sort();

  const selects = [
    qs("inventoryCategoryFilter"),
    qs("posCategoryFilter"),
    qs("shortageCategoryFilter")
  ].filter(Boolean);

  selects.forEach(select => {
    const old = select.value || "all";
    select.innerHTML = `<option value="all">كل التصنيفات</option>`;

    categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    });

    select.value = categories.includes(old) ? old : "all";
  });
}

async function renderPosProducts() {
  const grid = qs("posProductsGrid");
  if (!grid) return;

  await refreshCategories();

  const search = (qs("posSearch")?.value || "").toLowerCase().trim();
  const cat = qs("posCategoryFilter")?.value || "all";

  const products = await getAllProducts();
  const filtered = products
    .filter(p => p.storeId === currentStoreId)
    .filter(p => Number(p.stock || 0) > 0)
    .filter(p => cat === "all" || (p.category || "") === cat)
    .filter(p => {
      const hay = `${p.name || ""} ${p.code || ""} ${p.category || ""} ${p.supplier || ""}`.toLowerCase();
      return !search || hay.includes(search);
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));

  grid.innerHTML = "";

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="col-span-full p-10 text-center text-gray-400">
        لا توجد أصناف متاحة للبيع
      </div>
    `;
    return;
  }

  filtered.slice(0, 80).forEach(p => {
    const status = productStockStatus(p);

    grid.innerHTML += `
      <div class="product-grid-card" onclick="addProductToCartById('${p.id}')">
        <div class="product-img">
          ${
            p.image
              ? `<img src="${escapeHtmlAttr(p.image)}" crossorigin="anonymous" referrerpolicy="no-referrer">`
              : `<i data-lucide="package" class="text-gray-300" size="42"></i>`
          }
        </div>

        <div class="p-3">
          <div class="font-black text-sm line-clamp-1">${escapeHtml(p.name || "-")}</div>
          <div class="text-xs text-gray-400 mt-1 line-clamp-1">${escapeHtml(p.category || "بدون تصنيف")}</div>

          <div class="flex justify-between items-center mt-3 gap-2">
            <div class="font-black text-blue-700 text-sm">${money(p.price)}</div>
            <span class="text-[10px] px-2 py-1 rounded-full ${status.cls}">
              ${Number(p.stock || 0)}
            </span>
          </div>

          <div class="text-[11px] text-gray-400 mt-1">
            ${escapeHtml(unitLabel(p, "base"))}
          </div>
        </div>
      </div>
    `;
  });

  lucide.createIcons();
}

async function renderDashboard() {
  await refreshCategories();

  const [
    invoices,
    products,
    expenses,
    customers
  ] = await Promise.all([
    getAllInvoices(),
    getAllProducts(),
    getAllExpenses(),
    getAllCustomers()
  ]);

  const todayInvoices = invoices.filter(inv =>
    inv.storeId === currentStoreId &&
    inRangeByFilter(inv.date || inv.createdAt, "day")
  );

  const todayExpenses = expenses.filter(e =>
    e.storeId === currentStoreId &&
    inRangeByFilter(e.date || e.createdAt, "day")
  );

  const todaySales = todayInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
  const todayCost = todayInvoices.reduce((s, inv) => s + Number(inv.totalCost || 0), 0);
  const todayExpenseValue = todayExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  const totalDebt = customers.reduce((s, c) => s + Math.max(0, Number(c.debtTotal || 0) - Number(c.paidTotal || 0)), 0);

  const lowStockDefault = Number(getLocalSettings().lowStockDefault || 5);
  const shortages = products.filter(p =>
    p.storeId === currentStoreId &&
    Number(p.stock || 0) <= Number(p.lowStockLimit ?? lowStockDefault)
  );

  if (qs("dashTodaySales")) qs("dashTodaySales").innerText = money(todaySales);
  if (qs("dashTodayProfit")) qs("dashTodayProfit").innerText = money(todaySales - todayCost - todayExpenseValue);
  if (qs("dashTodayExpenses")) qs("dashTodayExpenses").innerText = money(todayExpenseValue);
  if (qs("dashCustomerDebt")) qs("dashCustomerDebt").innerText = money(totalDebt);
  if (qs("dashShortageCount")) qs("dashShortageCount").innerText = shortages.length;

  const grid = qs("dashboardProductsGrid");
  if (grid) {
    const quick = products
      .filter(p => p.storeId === currentStoreId)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .slice(0, 8);

    grid.innerHTML = quick.length ? "" : `
      <div class="col-span-full p-6 text-center text-gray-400">لا توجد أصناف بعد</div>
    `;

    quick.forEach(p => {
      grid.innerHTML += `
        <div class="border rounded-2xl p-3 hover:bg-blue-50 cursor-pointer" onclick="addProductToCartById('${p.id}')">
          <div class="flex items-center gap-3">
            ${productImageHtml(p, "w-11 h-11")}
            <div class="min-w-0">
              <div class="font-black text-sm truncate">${escapeHtml(p.name || "-")}</div>
              <div class="text-xs text-gray-400 truncate">${money(p.price)} / ${escapeHtml(unitLabel(p, "base"))}</div>
            </div>
          </div>
        </div>
      `;
    });
  }

  const alerts = qs("dashboardAlerts");
  if (alerts) {
    alerts.innerHTML = "";

    shortages.slice(0, 5).forEach(p => {
      alerts.innerHTML += `
        <div class="p-4 rounded-2xl bg-orange-50 text-orange-800 text-sm">
          <div class="font-black">نقص مخزون</div>
          <div>${escapeHtml(p.name)} المتوفر: ${Number(p.stock || 0)} ${escapeHtml(unitLabel(p, "base"))}</div>
        </div>
      `;
    });

    const lateCustomers = customers.filter(c => isCustomerLate(c));
    lateCustomers.slice(0, 5).forEach(c => {
      alerts.innerHTML += `
        <div class="p-4 rounded-2xl bg-red-50 text-red-800 text-sm">
          <div class="font-black">دين متأخر</div>
          <div>${escapeHtml(c.name)} - ${money(Math.max(0, Number(c.debtTotal || 0) - Number(c.paidTotal || 0)))}</div>
        </div>
      `;
    });

    if (!alerts.innerHTML.trim()) {
      alerts.innerHTML = `
        <div class="p-4 rounded-2xl bg-gray-50 text-gray-500 text-sm text-center">
          لا توجد تنبيهات حالياً
        </div>
      `;
    }
  }

  lucide.createIcons();
}

async function searchPosProducts() {
  await renderPosProducts();

  const query = (qs("posSearch")?.value || "").toLowerCase().trim();
  const results = qs("posSearchResults");
  if (!results) return;

  if (query.length < 1) {
    results.classList.add("hidden");
    return;
  }

  const products = await getAllProducts();
  const filtered = products.filter(p =>
    p.storeId === currentStoreId &&
    Number(p.stock || 0) > 0 &&
    `${p.name || ""} ${p.code || ""} ${p.category || ""}`.toLowerCase().includes(query)
  );

  results.innerHTML = "";

  if (!filtered.length) {
    results.innerHTML = `<div class="p-4 text-center text-gray-400">لا توجد نتائج</div>`;
  } else {
    filtered.slice(0, 20).forEach(p => {
      const row = document.createElement("div");
      row.className = "flex justify-between items-center p-4 hover:bg-blue-50 cursor-pointer rounded-xl gap-3";
      row.innerHTML = `
        <div class="flex items-center gap-3 flex-grow min-w-0">
          ${productImageHtml(p, "w-11 h-11")}
          <div class="min-w-0">
            <p class="font-black truncate">${escapeHtml(p.name)}</p>
            <p class="text-xs text-gray-400 truncate">${escapeHtml(p.code || "-")} - ${escapeHtml(p.category || "-")}</p>
            <p class="text-xs text-green-600">المتوفر: ${Number(p.stock || 0)} ${escapeHtml(unitLabel(p, "base"))}</p>
          </div>
        </div>
        <div class="text-left whitespace-nowrap">
          <b class="text-blue-700">${money(p.price)}</b>
        </div>
      `;

      row.onclick = () => {
        addToCart(p);
        results.classList.add("hidden");
        if (qs("posSearch")) qs("posSearch").value = "";
        renderPosProducts();
      };

      results.appendChild(row);
    });
  }

  results.classList.remove("hidden");
  lucide.createIcons();
}

function makeCartLineKey(productId, saleUnit = "base") {
  return `${productId}__${saleUnit}`;
}

function priceForUnit(product, saleUnit = "base") {
  if (saleUnit === "large") {
    const largePrice = Number(product.largePrice || 0);
    if (largePrice > 0) return largePrice;
    return Number(product.price || 0) * productFactor(product);
  }

  return Number(product.price || 0);
}

function costForUnit(product, saleUnit = "base") {
  if (saleUnit === "large") {
    const largeCost = Number(product.largeCost || 0);
    if (largeCost > 0) return largeCost;
    return Number(product.cost || 0) * productFactor(product);
  }

  return Number(product.cost || 0);
}

function availableForUnit(product, saleUnit = "base") {
  return fromBaseQty(Number(product.stock || 0), saleUnit, product);
}

async function addProductToCartById(id) {
  const p = await getEntity("products", id);
  if (!p) {
    alert("الصنف غير موجود");
    return;
  }

  addToCart(p);
}

function addToCart(product, saleUnit = "base") {
  const safeProduct = clone(product);
  const key = makeCartLineKey(safeProduct.id, saleUnit);
  const existing = cart.find(i => i.lineKey === key);

  const available = availableForUnit(safeProduct, saleUnit);

  if (existing) {
    if (existing.qty + 1 > available) {
      alert("الكمية غير كافية في المخزون");
      return;
    }

    existing.qty += 1;
  } else {
    if (available < 1) {
      alert("الصنف غير متوفر");
      return;
    }

    cart.push({
      lineKey: key,
      id: safeProduct.id,
      name: safeProduct.name,
      code: safeProduct.code || "",
      category: safeProduct.category || "",
      supplier: safeProduct.supplier || "",
      saleUnit,
      unitType: safeProduct.unitType || "piece",
      baseUnitName: safeProduct.baseUnitName || unitTypeDefaultBase(safeProduct.unitType),
      largeUnitName: safeProduct.largeUnitName || unitTypeDefaultLarge(safeProduct.unitType),
      unitFactor: Number(safeProduct.unitFactor || 1),
      qty: 1,
      baseQty: toBaseQty(1, saleUnit, safeProduct),
      price: priceForUnit(safeProduct, saleUnit),
      cost: costForUnit(safeProduct, saleUnit),
      stock: Number(safeProduct.stock || 0)
    });
  }

  renderCart();
  showToast(`تمت إضافة ${safeProduct.name}`, "success");
}

function cartProductLike(line) {
  return {
    unitType: line.unitType,
    baseUnitName: line.baseUnitName,
    largeUnitName: line.largeUnitName,
    unitFactor: line.unitFactor,
    price: line.price,
    cost: line.cost,
    largePrice: line.largePrice,
    largeCost: line.largeCost,
    stock: line.stock
  };
}

function renderCartUnitSelect(item) {
  const factor = Number(item.unitFactor || 1);
  const baseName = item.baseUnitName || unitTypeDefaultBase(item.unitType);
  const largeName = item.largeUnitName || unitTypeDefaultLarge(item.unitType);

  if (factor <= 1) {
    return `<span class="text-gray-500">${escapeHtml(baseName)}</span>`;
  }

  return `
    <select onchange="changeCartUnit('${item.lineKey}', this.value)" class="bg-gray-50 border rounded-lg p-2 text-sm">
      <option value="base" ${item.saleUnit === "base" ? "selected" : ""}>${escapeHtml(baseName)}</option>
      <option value="large" ${item.saleUnit === "large" ? "selected" : ""}>${escapeHtml(largeName)}</option>
    </select>
  `;
}

function renderCart() {
  const tbody = qs("cartTable");
  const empty = qs("cartEmptyMsg");

  if (!tbody || !empty) return;

  tbody.innerHTML = "";

  if (!cart.length) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");

    cart.forEach(item => {
      tbody.innerHTML += `
        <tr class="border-b">
          <td class="p-4 font-black whitespace-nowrap">${escapeHtml(item.name)}</td>
          <td class="p-4 whitespace-nowrap">${renderCartUnitSelect(item)}</td>
          <td class="p-4 whitespace-nowrap">${money(item.price)}</td>
          <td class="p-4 whitespace-nowrap">
            <div class="flex items-center gap-2">
              <button onclick="changeQty('${item.lineKey}', -1)" class="w-8 h-8 bg-gray-100 rounded-lg font-black">-</button>
              <input type="number" value="${item.qty}" min="0.01" step="0.01"
                onchange="setCartQty('${item.lineKey}', this.value)"
                class="w-20 text-center bg-gray-50 border rounded-lg p-2 font-black">
              <button onclick="changeQty('${item.lineKey}', 1)" class="w-8 h-8 bg-gray-100 rounded-lg font-black">+</button>
            </div>
          </td>
          <td class="p-4 font-black text-blue-700 whitespace-nowrap">${money(Number(item.price) * Number(item.qty || 0))}</td>
          <td class="p-4 whitespace-nowrap">
            <button onclick="removeFromCart('${item.lineKey}')" class="text-red-500">
              <i data-lucide="trash-2" size="16"></i>
            </button>
          </td>
        </tr>
      `;
    });
  }

  lucide.createIcons();
  calculateTotal();
}

async function changeCartUnit(lineKey, newUnit) {
  const line = cart.find(i => i.lineKey === lineKey);
  if (!line) return;

  const product = await getEntity("products", line.id);
  if (!product) return;

  const available = availableForUnit(product, newUnit);
  if (Number(line.qty || 0) > available) {
    alert("الكمية الحالية أكبر من المتوفر لهذه الوحدة");
    renderCart();
    return;
  }

  const oldLineKey = line.lineKey;
  line.saleUnit = newUnit;
  line.lineKey = makeCartLineKey(line.id, newUnit);
  line.price = priceForUnit(product, newUnit);
  line.cost = costForUnit(product, newUnit);
  line.baseQty = toBaseQty(line.qty, newUnit, product);

  const duplicated = cart.find(i => i.lineKey === line.lineKey && i !== line);
  if (duplicated) {
    duplicated.qty += line.qty;
    duplicated.baseQty = toBaseQty(duplicated.qty, duplicated.saleUnit, product);
    cart = cart.filter(i => i.lineKey !== oldLineKey);
  }

  renderCart();
}

async function changeQty(lineKey, delta) {
  const line = cart.find(i => i.lineKey === lineKey);
  if (!line) return;

  const product = await getEntity("products", line.id);
  if (!product) return;

  const nextQty = Number(line.qty || 0) + Number(delta || 0);
  if (nextQty <= 0) {
    removeFromCart(lineKey);
    return;
  }

  const available = availableForUnit(product, line.saleUnit);
  if (nextQty > available) {
    alert("الكمية غير كافية");
    return;
  }

  line.qty = nextQty;
  line.baseQty = toBaseQty(nextQty, line.saleUnit, product);

  renderCart();
}

async function setCartQty(lineKey, value) {
  const line = cart.find(i => i.lineKey === lineKey);
  if (!line) return;

  const product = await getEntity("products", line.id);
  if (!product) return;

  const qty = Number(value || 0);
  if (qty <= 0) {
    removeFromCart(lineKey);
    return;
  }

  const available = availableForUnit(product, line.saleUnit);
  if (qty > available) {
    alert("الكمية غير كافية");
    renderCart();
    return;
  }

  line.qty = qty;
  line.baseQty = toBaseQty(qty, line.saleUnit, product);

  renderCart();
}

function removeFromCart(lineKey) {
  cart = cart.filter(i => i.lineKey !== lineKey);
  renderCart();
}

function clearCart() {
  if (!cart.length) return;
  if (!confirm("تفريغ السلة؟")) return;

  cart = [];
  renderCart();
}

function calculateDiscountValue(subtotal) {
  const discountType = qs("discountType")?.value || "fixed";
  const raw = Number(qs("posDiscount")?.value || 0);

  if (discountType === "percent") {
    const clamped = Math.max(0, Math.min(100, raw));
    return subtotal * (clamped / 100);
  }

  return Math.max(0, raw);
}

function calculateCartNumbers() {
  const subtotal = cart.reduce((s, i) => s + Number(i.price || 0) * Number(i.qty || 0), 0);
  const discount = calculateDiscountValue(subtotal);
  const total = Math.max(0, subtotal - discount);
  const totalCost = cart.reduce((s, i) => s + Number(i.cost || 0) * Number(i.qty || 0), 0);
  const baseQtyTotal = cart.reduce((s, i) => s + Number(i.baseQty || 0), 0);

  return {
    subtotal,
    discount,
    total,
    totalCost,
    baseQtyTotal
  };
}

function calculateTotal() {
  const nums = calculateCartNumbers();

  if (qs("subtotal")) qs("subtotal").innerText = money(nums.subtotal);
  if (qs("discountPreview")) qs("discountPreview").innerText = money(nums.discount);
  if (qs("finalTotal")) qs("finalTotal").innerText = money(nums.total);

  if (qs("paymentModalSubtotal")) qs("paymentModalSubtotal").innerText = money(nums.subtotal);
  if (qs("paymentModalDiscount")) qs("paymentModalDiscount").innerText = money(nums.discount);
  if (qs("paymentModalTotal")) qs("paymentModalTotal").innerText = money(nums.total);
}

async function openPaymentModal() {
  if (!cart.length) {
    alert("السلة فارغة");
    return;
  }

  await fillTransferAccountsSelect("transferAccountSelect");
  await fillPaymentMethodsSelect("paymentMethod");

  if (qs("customerName")) qs("customerName").value = "";
  if (qs("customerPhone")) qs("customerPhone").value = "";
  if (qs("paymentMethod")) qs("paymentMethod").value = "cash";
  if (qs("invoiceStatus")) qs("invoiceStatus").value = "paid";
  if (qs("transferAccountSelect")) qs("transferAccountSelect").value = "";
  if (qs("transferNumberInput")) qs("transferNumberInput").value = "";
  if (qs("dueModeInput")) qs("dueModeInput").value = "";
  if (qs("dueDateInput")) qs("dueDateInput").value = "";
  if (qs("invoiceNotes")) qs("invoiceNotes").value = "";

  calculateTotal();
  toggleModal("paymentModal", true);
}

async function fillPaymentMethodsSelect(selectId) {
  const select = qs(selectId);
  if (!select) return;

  const methods = await getPaymentMethods();
  select.innerHTML = "";

  methods.forEach(m => {
    const option = document.createElement("option");
    option.value = m.type || m.id;
    option.textContent = m.hint ? `${m.name} - ${m.hint}` : m.name;
    select.appendChild(option);
  });
}

async function fillTransferAccountsSelect(selectId) {
  const select = qs(selectId);
  if (!select) return;

  const accounts = await getTransferAccounts();
  select.innerHTML = `<option value="">اختر الحساب</option>`;

  accounts.forEach(account => {
    const option = document.createElement("option");
    option.value = `${account.type || ""}|||${account.owner || ""}|||${account.number || ""}`;
    option.textContent = `${account.type || "حساب"} - ${account.owner || "-"}${account.number ? " - " + account.number : ""}`;
    select.appendChild(option);
  });
}

async function validateCartAgainstStock() {
  for (const item of cart) {
    const product = await getEntity("products", item.id);
    if (!product) {
      alert(`الصنف غير موجود: ${item.name}`);
      return false;
    }

    const needed = Number(item.baseQty || toBaseQty(item.qty, item.saleUnit, product));
    const available = Number(product.stock || 0);

    if (needed > available) {
      alert(`المخزون غير كافٍ للصنف: ${item.name}`);
      return false;
    }
  }

  return true;
}

async function applyStockChange(items, direction) {
  for (const item of items || []) {
    const product = await getEntity("products", item.id);
    if (!product) continue;

    const baseQty = Number(item.baseQty || toBaseQty(item.qty, item.saleUnit || "base", product));
    const newStock = Math.max(0, Number(product.stock || 0) + direction * baseQty);

    await saveEntity("products", product.id, {
      ...product,
      stock: newStock,
      updatedAt: nowIso()
    });
  }
}

function getSelectedAccountFrom(selectId) {
  const value = qs(selectId)?.value || "";
  if (!value) {
    return {
      transferAccountType: "",
      transferAccountName: "",
      transferAccountNumber: ""
    };
  }

  const [type, owner, number] = value.split("|||");

  return {
    transferAccountType: type || "",
    transferAccountName: owner || "",
    transferAccountNumber: number || ""
  };
}

function buildTransferLine(item) {
  const parts = [
    item.transferAccountType,
    item.transferAccountName,
    item.transferAccountNumber
  ].filter(Boolean);

  return parts.join(" - ");
}

async function ensureCustomerFromInvoice(inv) {
  const name = String(inv.customer || "").trim();
  const phone = String(inv.phone || "").trim();

  if (!name && !phone) return null;

  const customers = await getAllCustomers();
  const existing = customers.find(c =>
    c.storeId === currentStoreId &&
    String(c.name || "").trim() === name &&
    String(c.phone || "").trim() === phone
  );

  const debtAmount = inv.status === "unpaid" || inv.status === "pending" ? Number(inv.total || 0) : 0;
  const paidAmount = inv.status === "paid" ? Number(inv.total || 0) : 0;

  if (existing) {
    await saveEntity("customers", existing.id, {
      ...existing,
      name: name || existing.name,
      phone: phone || existing.phone,
      debtTotal: Number(existing.debtTotal || 0) + debtAmount,
      paidTotal: Number(existing.paidTotal || 0) + paidAmount,
      dueMode: inv.dueMode || existing.dueMode || "",
      dueDate: inv.dueDate || existing.dueDate || "",
      updatedAt: nowIso()
    });

    return existing.id;
  }

  const id = `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  await saveEntity("customers", id, {
    id,
    storeId: currentStoreId,
    name: name || "عميل",
    phone,
    debtTotal: debtAmount,
    paidTotal: paidAmount,
    dueMode: inv.dueMode || "",
    dueDate: inv.dueDate || "",
    notes: "",
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  return id;
}

async function buildInvoicePayload(id) {
  const settings = await getClientSettings();
  const nums = calculateCartNumbers();
  const account = getSelectedAccountFrom("transferAccountSelect");

  const payment = qs("paymentMethod")?.value || "cash";
  let status = qs("invoiceStatus")?.value || "paid";

  if (payment === "debt") status = "unpaid";
  if (payment === "later_app") status = "pending";

  return {
    id: String(id),
    storeId: currentStoreId,
    date: nowIso(),
    customer: qs("customerName")?.value.trim() || "عميل نقدي",
    phone: qs("customerPhone")?.value.trim() || "",
    payment,
    status,
    transferNumber: qs("transferNumberInput")?.value.trim() || "",
    ...account,
    dueMode: qs("dueModeInput")?.value || "",
    dueDate: qs("dueDateInput")?.value || "",
    notes: qs("invoiceNotes")?.value.trim() || "",
    discountType: qs("discountType")?.value || "fixed",
    discountRaw: Number(qs("posDiscount")?.value || 0),
    currencyName: settings.currencyName,
    currencySymbol: settings.currencySymbol,
    items: cart.map(i => clone(i)),
    subtotal: nums.subtotal,
    discount: nums.discount,
    total: nums.total,
    totalCost: nums.totalCost,
    source: "pos",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

function clearInvoiceEditor() {
  cart = [];
  editingInvoiceId = null;

  if (qs("customerName")) qs("customerName").value = "";
  if (qs("customerPhone")) qs("customerPhone").value = "";
  if (qs("paymentMethod")) qs("paymentMethod").value = "cash";
  if (qs("invoiceStatus")) qs("invoiceStatus").value = "paid";
  if (qs("transferAccountSelect")) qs("transferAccountSelect").value = "";
  if (qs("transferNumberInput")) qs("transferNumberInput").value = "";
  if (qs("dueModeInput")) qs("dueModeInput").value = "";
  if (qs("dueDateInput")) qs("dueDateInput").value = "";
  if (qs("invoiceNotes")) qs("invoiceNotes").value = "";
  if (qs("discountType")) qs("discountType").value = "fixed";
  if (qs("posDiscount")) qs("posDiscount").value = 0;

  renderCart();
  calculateTotal();
}

async function checkout() {
  if (!cart.length) {
    alert("السلة فارغة");
    return;
  }

  if (!(await validateCartAgainstStock())) return;

  try {
    await showLoader("جاري حفظ البيع...");
    setLoaderProgress(20);

    if (editingInvoiceId) {
      const oldInvoice = await getEntity("invoices", editingInvoiceId);
      if (!oldInvoice) {
        hideLoader();
        alert("الفاتورة الأصلية غير موجودة");
        return;
      }

      await applyStockChange(oldInvoice.items || [], +1);
      setLoaderProgress(45);

      if (!(await validateCartAgainstStock())) {
        await applyStockChange(oldInvoice.items || [], -1);
        hideLoader();
        return;
      }

      await applyStockChange(cart, -1);
      setLoaderProgress(65);

      const invoice = await buildInvoicePayload(editingInvoiceId);
      await saveEntity("invoices", editingInvoiceId, invoice);
      await ensureCustomerFromInvoice(invoice);

      currentInvoiceId = editingInvoiceId;
      editingInvoiceId = null;

      setLoaderProgress(100);
      hideLoader();

      toggleModal("paymentModal", false);
      clearInvoiceEditor();
      showToast("تم تعديل الفاتورة", "success");
      await viewInvoice(invoice.id);
      return;
    }

    const invoiceNumber = await getNextInvoiceNumber();
    const invoice = await buildInvoicePayload(invoiceNumber);

    await applyStockChange(cart, -1);
    setLoaderProgress(55);

    await saveEntity("invoices", invoice.id, invoice);
    await ensureCustomerFromInvoice(invoice);

    currentInvoiceId = invoice.id;

    setLoaderProgress(100);
    hideLoader();

    toggleModal("paymentModal", false);
    clearInvoiceEditor();
    showToast("تم حفظ البيع", "success");
    await viewInvoice(invoice.id);
  } catch (err) {
    hideLoader();
    console.error(err);
    alert("تعذر حفظ البيع");
  }
}

async function editInvoice(id) {
  const inv = await getEntity("invoices", id);
  if (!inv) {
    alert("الفاتورة غير موجودة");
    return;
  }

  editingInvoiceId = id;
  cart = (inv.items || []).map(i => clone(i));

  if (qs("customerName")) qs("customerName").value = inv.customer || "";
  if (qs("customerPhone")) qs("customerPhone").value = inv.phone || "";
  if (qs("paymentMethod")) qs("paymentMethod").value = inv.payment || "cash";
  if (qs("invoiceStatus")) qs("invoiceStatus").value = inv.status || "paid";
  if (qs("transferNumberInput")) qs("transferNumberInput").value = inv.transferNumber || "";
  if (qs("dueModeInput")) qs("dueModeInput").value = inv.dueMode || "";
  if (qs("dueDateInput")) qs("dueDateInput").value = inv.dueDate || "";
  if (qs("invoiceNotes")) qs("invoiceNotes").value = inv.notes || "";
  if (qs("discountType")) qs("discountType").value = inv.discountType || "fixed";
  if (qs("posDiscount")) qs("posDiscount").value = Number(inv.discountRaw || 0);

  await switchTab("pos");
  renderCart();
  calculateTotal();
  await openPaymentModal();

  if (qs("customerName")) qs("customerName").value = inv.customer || "";
  if (qs("customerPhone")) qs("customerPhone").value = inv.phone || "";
  if (qs("paymentMethod")) qs("paymentMethod").value = inv.payment || "cash";
  if (qs("invoiceStatus")) qs("invoiceStatus").value = inv.status || "paid";
  if (qs("transferNumberInput")) qs("transferNumberInput").value = inv.transferNumber || "";
  if (qs("dueModeInput")) qs("dueModeInput").value = inv.dueMode || "";
  if (qs("dueDateInput")) qs("dueDateInput").value = inv.dueDate || "";
  if (qs("invoiceNotes")) qs("invoiceNotes").value = inv.notes || "";
}

async function deleteInvoice(id) {
  if (!confirm("حذف الفاتورة؟ سيتم إرجاع الكميات للمخزون إذا كانت فاتورة بيع.")) return;

  await withLoader("جاري حذف الفاتورة...", async () => {
    const inv = await getEntity("invoices", id);
    if (!inv) return;

    if (inv.source === "pos") {
      await applyStockChange(inv.items || [], +1);
    }

    await deleteEntity("invoices", id);
  });

  showToast("تم حذف الفاتورة", "success");
  await resetInvoicesAndRender();
  await renderDashboard();
}

function showProductBarcode(code, title) {
  if (qs("barcodeTitle")) qs("barcodeTitle").innerText = title || "باركود المنتج";
  if (qs("barcodeText")) qs("barcodeText").innerText = code || "";

  const svg = qs("productBarcodeSvg");
  if (!svg) return;

  svg.innerHTML = "";

  try {
    JsBarcode(svg, String(code || ""), {
      format: "CODE128",
      lineColor: "#1d4ed8",
      width: 2,
      height: 80,
      displayValue: true,
      margin: 10
    });
  } catch {
    alert("تعذر توليد الباركود لهذا الكود");
    return;
  }

  toggleModal("barcodeModal", true);
}

function rankRearCamera(devices) {
  if (!devices?.length) return null;

  const rearKeywords = ["back", "rear", "environment", "خلف", "خلفية"];
  const exactRear = devices.find(d =>
    rearKeywords.some(k => (d.label || "").toLowerCase().includes(k))
  );

  return exactRear || devices[devices.length - 1];
}

function indicateScannerSuccess() {
  const frame = qs("scannerFrameBox");
  const audio = qs("scanBeep");

  if (frame) {
    frame.classList.remove("hidden");
    frame.classList.add("show");
  }

  try {
    if (audio) {
      audio.currentTime = 0;
      audio.play();
    }
  } catch {}

  setTimeout(() => {
    if (frame) {
      frame.classList.remove("show");
      frame.classList.add("hidden");
    }
  }, 700);
}

async function openScanner(target) {
  scanTarget = target;
  scannerTorchOn = false;
  torchSupported = false;
  scannerTrack = null;
  scannerLock = false;

  if (!qs("scannerModal")) return;

  qs("scannerModal").classList.remove("hidden");

  if (qs("scannerTitle")) {
    qs("scannerTitle").innerText =
      target === "invoice" ? "مسح فاتورة" :
      target === "product-code" ? "مسح كود المنتج" :
      "مسح الباركود";
  }

  if (!history.state || !history.state.scannerOpen) {
    history.pushState({ scannerOpen: true }, "");
    scannerHistoryPushed = true;
  }

  try {
    if (!scanner) scanner = new Html5Qrcode("reader");

    const devices = await Html5Qrcode.getCameras();
    const cameraDevices = devices || [];

    if (!cameraDevices.length) {
      alert("لم يتم العثور على كاميرا");
      await closeScanner();
      return;
    }

    const chosen = rankRearCamera(cameraDevices);
    const rearCameraId = chosen?.id || cameraDevices[0].id;

    await startScannerWithRearCamera(rearCameraId);
  } catch (err) {
    console.error(err);
    alert("تعذر الحصول على صلاحية الكاميرا");
    await closeScanner();
  }
}

async function startScannerWithRearCamera(rearCameraId) {
  if (!scanner || !rearCameraId) return;

  try {
    await scanner.start(
      { deviceId: { exact: rearCameraId } },
      {
        fps: 10,
        qrbox: { width: 250, height: 170 },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E
        ]
      },
      async decodedText => {
        if (scannerLock) return;

        scannerLock = true;
        indicateScannerSuccess();

        await handleScanResult(decodedText);

        setTimeout(async () => {
          await closeScanner();
        }, 220);
      },
      () => {}
    );

    setTimeout(async () => {
      try {
        const track = scanner?.getRunningTrack?.();
        scannerTrack = track || null;

        const capabilities = track?.getCapabilities?.();
        const hasTorch = !!capabilities?.torch;

        torchSupported = hasTorch;

        qs("scannerTorchBtn")?.classList.toggle("hidden", !hasTorch);
        qs("scannerTorchQuickBtn")?.classList.toggle("hidden", !hasTorch);
      } catch {
        torchSupported = false;
        qs("scannerTorchBtn")?.classList.add("hidden");
        qs("scannerTorchQuickBtn")?.classList.add("hidden");
      }
    }, 500);
  } catch (err) {
    console.error(err);
    alert("تعذر بدء الكاميرا الخلفية");
    await closeScanner();
  }
}

async function toggleScannerTorch() {
  if (!scannerTrack || !torchSupported) return;

  try {
    scannerTorchOn = !scannerTorchOn;

    await scannerTrack.applyConstraints({
      advanced: [{ torch: scannerTorchOn }]
    });

    if (qs("scannerTorchBtn")) {
      qs("scannerTorchBtn").innerText = scannerTorchOn ? "إيقاف الفلاش" : "تشغيل / إيقاف الفلاش";
    }
  } catch (err) {
    console.error(err);
    alert("الفلاش غير مدعوم على هذا الجهاز أو المتصفح");
  }
}

async function handleScanResult(text) {
  const scanned = String(text || "").trim();

  if (scanTarget === "pos") {
    const products = await getAllProducts();
    const found = products.find(p =>
      p.storeId === currentStoreId &&
      String(p.code || "").trim().toLowerCase() === scanned.toLowerCase()
    );

    if (found) addToCart(found);
    else alert("لم يتم العثور على صنف بهذا الباركود");

    return;
  }

  if (scanTarget === "product-code") {
    if (qs("prodCode")) qs("prodCode").value = scanned;
    showToast("تم التقاط كود الصنف", "success");
    return;
  }

  if (scanTarget === "invoice") {
    const idMatch = scanned.match(/INV-(\d+)/i) || scanned.match(/^(\d+)$/);
    if (idMatch) await viewInvoice(idMatch[1]);
    else alert("تعذر قراءة رقم الفاتورة من الكود");
  }
}

async function closeScanner(fromPopState = false) {
  try {
    if (scannerTrack && torchSupported && scannerTorchOn) {
      await scannerTrack.applyConstraints({ advanced: [{ torch: false }] });
    }
  } catch {}

  try {
    if (scanner && scanner.isScanning) {
      await scanner.stop();
    }
  } catch {}

  scannerTrack = null;
  scannerTorchOn = false;
  torchSupported = false;
  scannerLock = false;

  qs("scannerTorchBtn")?.classList.add("hidden");
  qs("scannerTorchQuickBtn")?.classList.add("hidden");

  if (qs("scannerTorchBtn")) qs("scannerTorchBtn").innerText = "تشغيل / إيقاف الفلاش";

  qs("scannerModal")?.classList.add("hidden");
  qs("scannerFrameBox")?.classList.remove("show");
  qs("scannerFrameBox")?.classList.add("hidden");

  if (scannerHistoryPushed && !fromPopState) {
    scannerHistoryPushed = false;
    history.back();
  } else if (fromPopState) {
    scannerHistoryPushed = false;
  }
}

async function scanBarcodeFromImage(event, target) {
  const file = event.target.files?.[0];
  if (!file) return;

  scanTarget = target;

  try {
    await showLoader("جاري قراءة الصورة...");

    const tempId = "temp-reader-" + Date.now();
    const tempDiv = document.createElement("div");

    tempDiv.id = tempId;
    tempDiv.style.display = "none";
    document.body.appendChild(tempDiv);

    const imageScanner = new Html5Qrcode(tempId);
    const result = await imageScanner.scanFile(file, true);

    document.body.removeChild(tempDiv);

    indicateScannerSuccess();
    await handleScanResult(result);

    hideLoader();
  } catch (err) {
    hideLoader();
    console.error(err);
    alert("تعذر قراءة الباركود من الصورة");
  } finally {
    event.target.value = "";
  }
}

window.openNewProduct = openNewProduct;
window.saveProduct = saveProduct;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.addProductToCartById = addProductToCartById;
window.showProductBarcode = showProductBarcode;
window.resetProductsAndRender = resetProductsAndRender;
window.loadMoreProducts = loadMoreProducts;
window.searchPosProducts = searchPosProducts;
window.clearCart = clearCart;
window.changeCartUnit = changeCartUnit;
window.changeQty = changeQty;
window.setCartQty = setCartQty;
window.removeFromCart = removeFromCart;
window.calculateTotal = calculateTotal;
window.openPaymentModal = openPaymentModal;
window.checkout = checkout;
window.editInvoice = editInvoice;
window.deleteInvoice = deleteInvoice;
window.scanBarcodeFromImage = scanBarcodeFromImage;
function paymentLabel(value) {
  const map = {
    cash: "كاش",
    bank: "بنك",
    jawwal_pay: "جوال باي",
    wallet: "محفظة",
    instant_app: "تطبيق فوري",
    later_app: "تطبيق لاحق",
    debt: "دين",
    custom: "مخصص"
  };

  return map[value] || value || "-";
}

function statusLabel(status) {
  const map = {
    paid: "مدفوع",
    unpaid: "دين",
    pending: "تطبيق لاحق"
  };

  return map[status] || status || "-";
}

function statusClass(status) {
  if (status === "paid") return "status-paid";
  if (status === "pending") return "status-pending";
  return "status-unpaid";
}

async function getNextInvoiceNumber() {
  const counter = await idbGet("meta", "invoiceCounter");
  const current = Number(counter?.value || 0);
  const next = current + 1;

  await idbSet("meta", {
    id: "invoiceCounter",
    value: next
  });

  if (isOnline() && getLocalSession()?.appMode === "online") {
    await set(ref(db, `${pathClientCounters()}/invoiceAutoNumber`), next);
  }

  return next;
}

async function getNextPurchaseNumber() {
  const counter = await idbGet("meta", "purchaseCounter");
  const current = Number(counter?.value || 0);
  const next = current + 1;

  await idbSet("meta", {
    id: "purchaseCounter",
    value: next
  });

  if (isOnline() && getLocalSession()?.appMode === "online") {
    await set(ref(db, `${pathClientCounters()}/purchaseAutoNumber`), next);
  }

  return next;
}

async function resetInvoicesAndRender() {
  invoicesCurrentLimit = invoicePageSize;
  await renderInvoices();
  await renderSalesSummary();
}

async function loadMoreInvoices() {
  invoicesCurrentLimit += invoicePageSize;
  await renderInvoices();
}

async function filteredInvoicesForSales() {
  const query = (qs("invSearchQuery")?.value || "").toLowerCase().trim();
  const statusFilter = qs("invoiceStatusFilter")?.value || "all";

  const invoices = await getAllInvoices();

  return invoices
    .filter(inv => inv.storeId === currentStoreId)
    .filter(inv => {
      const hay = `${inv.id || ""} ${inv.customer || ""} ${inv.phone || ""} ${inv.transferNumber || ""}`.toLowerCase();
      return !query || hay.includes(query);
    })
    .filter(inv => statusFilter === "all" || (inv.status || "paid") === statusFilter)
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
}

async function renderInvoices() {
  const table = qs("invoicesTable");
  const loading = qs("invoicesLoading");
  const moreWrap = qs("invoicesLoadMoreWrap");

  if (!table) return;

  table.innerHTML = "";
  loading?.classList.remove("hidden");

  const filtered = await filteredInvoicesForSales();
  const visible = filtered.slice(0, invoicesCurrentLimit);

  if (!visible.length) {
    table.innerHTML = `
      <tr>
        <td colspan="10" class="p-8 text-center text-gray-400">
          لا توجد فواتير مبيعات
        </td>
      </tr>
    `;
  }

  visible.forEach(inv => {
    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4 font-black">#${escapeHtml(inv.id)}</td>
        <td class="p-4 text-xs text-gray-500">${formatDateTime(inv.date || inv.createdAt)}</td>
        <td class="p-4">
          <button onclick="openCustomerHistory('${escapeJs(inv.customer || "")}','${escapeJs(inv.phone || "")}')" class="text-blue-700 font-black hover:underline">
            ${escapeHtml(inv.customer || "-")}
          </button>
        </td>
        <td class="p-4 text-sm">${escapeHtml(inv.phone || "-")}</td>
        <td class="p-4 text-sm">${escapeHtml(paymentLabel(inv.payment))}</td>
        <td class="p-4 text-xs">
          ${escapeHtml(inv.transferNumber || inv.transferAccountNumber || buildTransferLine(inv) || "-")}
        </td>
        <td class="p-4">
          <button onclick="openStatusModal('${escapeJs(inv.id)}','${escapeJs(inv.status || "paid")}')" class="status-pill ${statusClass(inv.status || "paid")}">
            ${escapeHtml(statusLabel(inv.status || "paid"))}
          </button>
        </td>
        <td class="p-4 font-black text-blue-700">${Number(inv.total || 0).toFixed(2)} ${escapeHtml(inv.currencySymbol || getLocalSettings().currencySymbol || "₪")}</td>
        <td class="p-4">
          ${
            inv.notes
              ? `<button onclick="openNoteModal('${escapeJs(inv.notes)}')" class="text-slate-700 bg-slate-100 px-3 py-1 rounded-lg text-xs font-black">عرض</button>`
              : `<span class="text-gray-300">-</span>`
          }
        </td>
        <td class="p-4">
          <div class="flex gap-2 flex-wrap">
            <button onclick="viewInvoice('${escapeJs(inv.id)}')" class="text-blue-700 bg-blue-50 px-3 py-1 rounded-lg text-xs font-black">عرض</button>
            <button onclick="editInvoice('${escapeJs(inv.id)}')" class="text-amber-700 bg-amber-50 px-3 py-1 rounded-lg text-xs font-black">تعديل</button>
            <button onclick="deleteInvoice('${escapeJs(inv.id)}')" class="text-red-700 bg-red-50 px-3 py-1 rounded-lg text-xs font-black">حذف</button>
          </div>
        </td>
      </tr>
    `;
  });

  loading?.classList.add("hidden");
  moreWrap?.classList.toggle("hidden", visible.length >= filtered.length);

  await renderSalesSummary();
}

async function renderSalesSummary() {
  const range = qs("salesReportRange")?.value || "day";
  const customDate = qs("salesReportDate")?.value || "";

  const invoices = await getAllInvoices();
  const filtered = invoices.filter(inv =>
    inv.storeId === currentStoreId &&
    inRangeByFilter(inv.date || inv.createdAt, range, customDate)
  );

  const total = filtered.reduce((s, inv) => s + Number(inv.total || 0), 0);
  const paid = filtered
    .filter(inv => (inv.status || "paid") === "paid")
    .reduce((s, inv) => s + Number(inv.total || 0), 0);

  const pending = filtered
    .filter(inv => (inv.status || "paid") !== "paid")
    .reduce((s, inv) => s + Number(inv.total || 0), 0);

  if (qs("salesTotalAmount")) qs("salesTotalAmount").innerText = money(total);
  if (qs("salesPaidAmount")) qs("salesPaidAmount").innerText = money(paid);
  if (qs("salesPendingAmount")) qs("salesPendingAmount").innerText = money(pending);
  if (qs("salesInvoicesCount")) qs("salesInvoicesCount").innerText = filtered.length;
}

function groupByDateArabic(items, dateKey = "date") {
  const groups = new Map();

  items.forEach(item => {
    const raw = item[dateKey] || item.createdAt || nowIso();
    const d = new Date(raw);
    const key = isNaN(d.getTime())
      ? "غير محدد"
      : d.toLocaleDateString("ar-EG", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        });

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  return groups;
}

async function buildSalesReportHtml(range, customDate = "") {
  const invoices = await getAllInvoices();
  const store = await idbGet("stores", currentStoreId);
  const settings = await getClientSettings();

  const filtered = invoices
    .filter(inv => inv.storeId === currentStoreId)
    .filter(inv => inRangeByFilter(inv.date || inv.createdAt, range, customDate))
    .sort((a, b) => new Date(a.date || a.createdAt || 0) - new Date(b.date || b.createdAt || 0));

  const title = `تقرير مبيعات - ${rangeLabel(range, customDate)}`;
  const groups = groupByDateArabic(filtered, "date");

  let html = `
    <div class="report-print-page">
      <div class="flex justify-between items-center mb-4">
        <div>
          <div class="report-title">${escapeHtml(title)}</div>
          <div class="text-sm text-gray-500">${escapeHtml(store?.name || "المحل")}</div>
        </div>
        <div class="text-sm text-gray-500">${new Date().toLocaleString("ar-EG")}</div>
      </div>
  `;

  if (!filtered.length) {
    html += `<div class="p-10 text-center text-gray-400">لا توجد بيانات في هذه الفترة</div>`;
  }

  groups.forEach((rows, dateTitle) => {
    html += `
      <div class="report-date-title">${escapeHtml(dateTitle)}</div>
      <table class="report-table">
        <thead>
          <tr>
            <th>رقم الفاتورة</th>
            <th>اسم الزبون</th>
            <th>رقم الزبون</th>
            <th>الصنف</th>
            <th>الوحدة</th>
            <th>الكمية</th>
            <th>السعر</th>
            <th>طريقة الدفع</th>
            <th>رقم التحويل</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(inv => {
      const items = inv.items?.length ? inv.items : [{
        name: "فاتورة مباشرة",
        qty: 1,
        price: inv.total || 0,
        saleUnit: "base",
        baseUnitName: ""
      }];

      items.forEach(item => {
        html += `
          <tr>
            <td>#${escapeHtml(inv.id)}</td>
            <td>${escapeHtml(inv.customer || "-")}</td>
            <td>${escapeHtml(inv.phone || "-")}</td>
            <td>${escapeHtml(item.name || "-")}</td>
            <td>${escapeHtml(item.saleUnit === "large" ? (item.largeUnitName || "كبيرة") : (item.baseUnitName || "وحدة"))}</td>
            <td>${Number(item.qty || 0)}</td>
            <td>${Number(item.price || 0).toFixed(2)} ${escapeHtml(inv.currencySymbol || settings.currencySymbol)}</td>
            <td>${escapeHtml(paymentLabel(inv.payment))}</td>
            <td>${escapeHtml(inv.transferNumber || inv.transferAccountNumber || "-")}</td>
            <td>${(Number(item.price || 0) * Number(item.qty || 0)).toFixed(2)} ${escapeHtml(inv.currencySymbol || settings.currencySymbol)}</td>
          </tr>
        `;
      });
    });

    const dayTotal = rows.reduce((s, inv) => s + Number(inv.total || 0), 0);

    html += `
        </tbody>
        <tfoot>
          <tr>
            <th colspan="9">إجمالي اليوم</th>
            <th>${money(dayTotal, false, settings)}</th>
          </tr>
        </tfoot>
      </table>
    `;
  });

  const total = filtered.reduce((s, inv) => s + Number(inv.total || 0), 0);

  html += `
      <div class="mt-5 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xl font-black text-blue-700">
        الإجمالي العام: ${money(total, false, settings)}
      </div>
    </div>
  `;

  return html;
}

async function exportSalesReport(type) {
  const range = qs("salesReportRange")?.value || "day";
  const customDate = qs("salesReportDate")?.value || "";
  const area = qs("salesReportExportArea") || qs("globalReportExportArea");

  if (!area) return;

  await showLoader("جاري تجهيز تقرير المبيعات...");

  area.innerHTML = await buildSalesReportHtml(range, customDate);
  area.classList.remove("hidden");

  try {
    await exportElementArea(area, type, `تقرير_المبيعات_${range}`);
  } finally {
    area.classList.add("hidden");
    hideLoader();
  }
}

function rangeLabel(range, customDate = "") {
  const map = {
    day: "اليوم",
    today: "اليوم",
    week: "الأسبوع",
    month: "الشهر",
    year: "السنة",
    all: "كل السجل",
    customDay: customDate ? `يوم ${customDate}` : "يوم محدد"
  };

  return map[range] || range;
}

function inRangeByFilter(dateString, filter, customDate = "") {
  if (!dateString) return false;

  const d = new Date(dateString);
  if (isNaN(d.getTime())) return false;

  if (filter === "all") return true;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  if (filter === "today" || filter === "day") {
    return d >= startOfToday && d < startOfTomorrow;
  }

  if (filter === "week") {
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - 6);
    return d >= start && d < startOfTomorrow;
  }

  if (filter === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return d >= start && d < end;
  }

  if (filter === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear() + 1, 0, 1);
    return d >= start && d < end;
  }

  if (filter === "customDay") {
    if (!customDate) return false;

    const target = new Date(customDate + "T00:00:00");
    const start = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const end = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1);

    return d >= start && d < end;
  }

  return true;
}

async function exportElementArea(area, type, filename) {
  await wait(200);

  if (type === "print") {
    const w = window.open("", "_blank");
    w.document.write(`
      <html dir="rtl">
        <head>
          <title>${escapeHtml(filename)}</title>
          <style>
            body{font-family:Cairo,Arial,sans-serif;margin:0;background:#fff}
            table{border-collapse:collapse;width:100%}
            th,td{border:1px solid #e5e7eb;padding:8px;text-align:center}
            th{background:#f8fafc}
            .report-print-page{width:1120px;padding:24px}
            .report-title{font-size:26px;font-weight:900;color:#1d4ed8;margin-bottom:14px}
            .report-date-title{font-size:18px;font-weight:900;background:#eff6ff;color:#1e40af;padding:10px 14px;border-radius:14px;margin:18px 0 10px}
          </style>
        </head>
        <body>${area.innerHTML}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
    return;
  }

  const pages = [...area.children].length ? [...area.children] : [area];

  if (type === "image") {
    let idx = 1;

    for (const page of pages) {
      const canvas = await html2canvas(page, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: false
      });

      const link = document.createElement("a");
      link.download = `${filename}_${idx}.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      link.click();

      idx++;
    }

    return;
  }

  if (type === "pdf") {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "px",
      format: [1120, 794]
    });

    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: false
      });

      const imgData = canvas.toDataURL("image/png", 1.0);

      if (i > 0) pdf.addPage([1120, 794], "landscape");
      pdf.addImage(imgData, "PNG", 0, 0, 1120, 794);
    }

    pdf.save(`${filename}.pdf`);
  }
}

function renderInvoiceBarcode(id) {
  const code = `INV-${id}`;
  const svg = qs("invoiceBarcodeSvg");

  if (!svg) return;

  svg.innerHTML = "";

  try {
    JsBarcode(svg, code, {
      format: "CODE128",
      lineColor: "#111827",
      width: 1.5,
      height: 42,
      displayValue: false,
      margin: 0
    });
  } catch {}

  if (qs("invoiceBarcodeText")) qs("invoiceBarcodeText").innerText = code;
}

async function viewInvoice(id) {
  await showLoader("جاري تحميل الفاتورة...");

  const inv = await getEntity("invoices", id);

  if (!inv) {
    hideLoader();
    alert("الفاتورة غير موجودة");
    return;
  }

  currentInvoiceId = id;

  let store = await idbGet("stores", inv.storeId);
  if (!store) store = { name: "المحل", logo: "" };

  qs("mainApp")?.classList.add("hidden");
  qs("invoicePage")?.classList.remove("hidden");

  if (qs("invPageStoreName")) qs("invPageStoreName").innerText = store.name || "المحل";
  setImageOrHide(qs("invPageLogo"), store.logo);

  if (qs("invPageId")) qs("invPageId").innerText = `#${inv.id}`;
  if (qs("invPageDate")) qs("invPageDate").innerText = formatDateTime(inv.date || inv.createdAt);
  if (qs("invPageCustomer")) qs("invPageCustomer").innerText = inv.customer || "-";
  if (qs("invPagePhone")) qs("invPagePhone").innerText = inv.phone || "-";
  if (qs("invPagePayment")) qs("invPagePayment").innerText = paymentLabel(inv.payment);
  if (qs("invPageTransferNo")) qs("invPageTransferNo").innerText = inv.transferNumber || inv.transferAccountNumber || buildTransferLine(inv) || "-";
  if (qs("invPageStatus")) qs("invPageStatus").innerText = statusLabel(inv.status || "paid");
  if (qs("invPageEmployee")) qs("invPageEmployee").innerText = inv.employeeName || "-";
  if (qs("invPageNotes")) qs("invPageNotes").innerText = inv.notes || "-";

  const itemArea = qs("invPageItems");

  if (itemArea) {
    itemArea.innerHTML = "";

    const items = inv.items?.length ? inv.items : [{
      name: "فاتورة مباشرة",
      qty: 1,
      price: inv.total || 0,
      saleUnit: "base",
      baseUnitName: "وحدة"
    }];

    items.forEach((i, index) => {
      const unitName = i.saleUnit === "large"
        ? (i.largeUnitName || "كبيرة")
        : (i.baseUnitName || "وحدة");

      itemArea.innerHTML += `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(i.name)}</td>
          <td>${escapeHtml(unitName)}</td>
          <td>${Number(i.qty || 0)}</td>
          <td>${Number(i.price || 0).toFixed(2)} ${escapeHtml(inv.currencySymbol || "₪")}</td>
          <td>${(Number(i.price || 0) * Number(i.qty || 0)).toFixed(2)} ${escapeHtml(inv.currencySymbol || "₪")}</td>
        </tr>
      `;
    });
  }

  if (qs("invPageSub")) qs("invPageSub").innerText = `${Number(inv.subtotal || 0).toFixed(2)} ${inv.currencySymbol || "₪"}`;
  if (qs("invPageDiscount")) qs("invPageDiscount").innerText = `${Number(inv.discount || 0).toFixed(2)} ${inv.currencySymbol || "₪"}`;
  if (qs("invPageTotal")) qs("invPageTotal").innerText = `${Number(inv.total || 0).toFixed(2)} ${inv.currencySymbol || "₪"}`;

  renderInvoiceBarcode(inv.id);

  lucide.createIcons();
  hideLoader();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function backFromInvoicePage() {
  qs("invoicePage")?.classList.add("hidden");
  qs("mainApp")?.classList.remove("hidden");
  switchTab("sales");
}

function printInvoicePage() {
  window.print();
}

async function ensureImagesLoaded(container) {
  if (!container) return;

  const images = [...container.querySelectorAll("img")];

  await Promise.all(images.map(img => {
    return new Promise(resolve => {
      if (img.complete && img.naturalWidth > 0) {
        resolve();
        return;
      }

      const done = () => {
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
        resolve();
      };

      img.addEventListener("load", done);
      img.addEventListener("error", done);
    });
  }));
}

function loadImageAsDataURL(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error("No image url"));
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error("تعذر تحميل الصورة"));
    img.src = url;
  });
}

async function prepareImagesForCanvas(container) {
  if (!container) return () => {};

  const imgs = [...container.querySelectorAll("img")];
  const restoreList = [];

  for (const img of imgs) {
    const src = img.getAttribute("src");
    if (!src) continue;

    try {
      const dataUrl = await loadImageAsDataURL(src);
      const oldSrc = src;

      img.src = dataUrl;

      restoreList.push(() => {
        img.src = oldSrc;
      });
    } catch (err) {
      console.warn("لم أستطع تحويل الصورة إلى base64:", src, err);
    }
  }

  await ensureImagesLoaded(container);
  await wait(150);

  return () => {
    restoreList.forEach(fn => {
      try {
        fn();
      } catch {}
    });
  };
}

async function prepareInvoiceForExport() {
  const area = qs("invoicePrintArea");
  if (!area) return () => {};

  const oldWidth = area.style.width;
  const oldMaxWidth = area.style.maxWidth;
  const oldTransform = area.style.transform;
  const oldTransformOrigin = area.style.transformOrigin;

  area.style.width = "11in";
  area.style.maxWidth = "11in";
  area.style.transform = "translateZ(0)";
  area.style.transformOrigin = "top center";

  await ensureImagesLoaded(area);
  await wait(120);

  const restoreImages = await prepareImagesForCanvas(area);

  await ensureImagesLoaded(area);
  await wait(120);

  return () => {
    try {
      restoreImages();
    } catch {}

    area.style.width = oldWidth;
    area.style.maxWidth = oldMaxWidth;
    area.style.transform = oldTransform;
    area.style.transformOrigin = oldTransformOrigin;
  };
}

async function exportInvoicePage(type) {
  const area = qs("invoicePrintArea");
  if (!area) return;

  await showLoader("جاري تصدير الفاتورة...");

  const restore = await prepareInvoiceForExport();

  try {
    await ensureImagesLoaded(area);
    await wait(200);

    const canvas = await html2canvas(area, {
      scale: 3,
      backgroundColor: "#ffffff",
      useCORS: true,
      allowTaint: false,
      scrollX: 0,
      scrollY: 0,
      logging: false,
      imageTimeout: 15000
    });

    if (type === "image") {
      const link = document.createElement("a");
      link.download = `فاتورة_${currentInvoiceId || Date.now()}.png`;
      link.href = canvas.toDataURL("image/png", 1.0);
      link.click();
      return;
    }

    if (type === "pdf") {
      const imgData = canvas.toDataURL("image/png", 1.0);
      const { jsPDF } = window.jspdf;

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "in",
        format: [11, 8.5]
      });

      pdf.addImage(imgData, "PNG", 0, 0, 11, 8.5);
      pdf.save(`فاتورة_${currentInvoiceId || Date.now()}.pdf`);
    }
  } catch (err) {
    console.error(err);
    alert("تعذر تصدير الفاتورة. إذا لم يظهر الشعار فغالباً رابط الصورة لا يسمح بالتصدير.");
  } finally {
    restore();
    hideLoader();
  }
}

function normalizePhoneForSend(phone, mode, customPrefix) {
  let clean = String(phone || "").replace(/[^\d]/g, "");
  if (!clean) return "";

  if (mode === "custom") {
    const prefix = String(customPrefix || "").replace(/[^\d]/g, "");
    return prefix + clean.replace(/^0+/, "");
  }

  if (mode === "970" || mode === "972") {
    return mode + clean.replace(/^0+/, "");
  }

  return clean;
}

async function shareCurrentInvoice() {
  if (!currentInvoiceId) return;

  const inv = await getEntity("invoices", currentInvoiceId);
  if (!inv) return;

  const message =
`فاتورة رقم #${inv.id}
العميل: ${inv.customer || "-"}
الإجمالي: ${Number(inv.total || 0).toFixed(2)} ${inv.currencySymbol || "₪"}
الحالة: ${statusLabel(inv.status || "paid")}
طريقة الدفع: ${paymentLabel(inv.payment)}
التاريخ: ${formatDateTime(inv.date || inv.createdAt)}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `فاتورة #${inv.id}`,
        text: message
      });
      return;
    } catch {}
  }

  const phone = inv.phone ? normalizePhoneForSend(inv.phone, "972", "") : "";
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  window.open(url, "_blank");
}

function openStatusModal(invoiceId, currentStatus) {
  if (qs("statusInvoiceId")) qs("statusInvoiceId").value = invoiceId;
  if (qs("statusSelect")) qs("statusSelect").value = currentStatus || "paid";

  toggleModal("statusModal", true);
}

async function saveInvoiceStatus() {
  const id = qs("statusInvoiceId")?.value;
  const status = qs("statusSelect")?.value || "paid";

  if (!id) return;

  await withLoader("جاري تحديث الحالة...", async () => {
    const inv = await getEntity("invoices", id);
    if (!inv) return;

    await saveEntity("invoices", id, {
      ...inv,
      status,
      updatedAt: nowIso()
    });

    await ensureCustomerFromInvoice({
      ...inv,
      status
    });
  });

  toggleModal("statusModal", false);
  await resetInvoicesAndRender();

  if (qs("invoicePage") && !qs("invoicePage").classList.contains("hidden") && String(currentInvoiceId) === String(id)) {
    await viewInvoice(id);
  }

  showToast("تم تحديث الحالة", "success");
}

function openNoteModal(note) {
  if (qs("noteModalContent")) qs("noteModalContent").innerText = note || "-";
  toggleModal("noteModal", true);
}

async function openManualInvoiceModal() {
  await fillTransferAccountsSelect("transferAccountSelectManual");
  await fillPaymentMethodsSelect("manualPaymentMethod");

  if (qs("editManualInvoiceId")) qs("editManualInvoiceId").value = "";
  if (qs("manualCustomerName")) qs("manualCustomerName").value = "";
  if (qs("manualCustomerPhone")) qs("manualCustomerPhone").value = "";
  if (qs("manualInvoiceStatus")) qs("manualInvoiceStatus").value = "unpaid";
  if (qs("manualInvoiceAmount")) qs("manualInvoiceAmount").value = "";
  if (qs("manualPaymentMethod")) qs("manualPaymentMethod").value = "cash";
  if (qs("transferAccountSelectManual")) qs("transferAccountSelectManual").value = "";
  if (qs("manualTransferNumber")) qs("manualTransferNumber").value = "";
  if (qs("manualDueMode")) qs("manualDueMode").value = "";
  if (qs("manualDueDate")) qs("manualDueDate").value = "";
  if (qs("manualInvoiceNotes")) qs("manualInvoiceNotes").value = "";

  qs("manualCustomerSuggestions")?.classList.add("hidden");

  toggleModal("manualInvoiceModal", true);
}

async function saveManualInvoice() {
  const editId = qs("editManualInvoiceId")?.value || "";
  const customer = qs("manualCustomerName")?.value.trim() || "";
  const phone = qs("manualCustomerPhone")?.value.trim() || "";
  const amount = Number(qs("manualInvoiceAmount")?.value || 0);

  if (!customer || amount <= 0) {
    alert("يرجى إدخال اسم الزبون والمبلغ");
    return;
  }

  const settings = await getClientSettings();
  const invoiceId = editId || String(await getNextInvoiceNumber());
  const account = getSelectedAccountFrom("transferAccountSelectManual");

  const payment = qs("manualPaymentMethod")?.value || "cash";
  let status = qs("manualInvoiceStatus")?.value || "unpaid";

  if (payment === "debt") status = "unpaid";
  if (payment === "later_app") status = "pending";

  const payload = {
    id: invoiceId,
    storeId: currentStoreId,
    date: nowIso(),
    customer,
    phone,
    payment,
    status,
    transferNumber: qs("manualTransferNumber")?.value.trim() || "",
    ...account,
    dueMode: qs("manualDueMode")?.value || "",
    dueDate: qs("manualDueDate")?.value || "",
    notes: qs("manualInvoiceNotes")?.value.trim() || "",
    discountType: "fixed",
    discountRaw: 0,
    currencyName: settings.currencyName,
    currencySymbol: settings.currencySymbol,
    items: [{
      lineKey: `manual_${invoiceId}`,
      id: `manual_${invoiceId}`,
      name: "فاتورة مباشرة",
      code: `MAN-${invoiceId}`,
      saleUnit: "base",
      baseUnitName: "وحدة",
      largeUnitName: "",
      unitFactor: 1,
      qty: 1,
      baseQty: 1,
      price: amount,
      cost: 0
    }],
    subtotal: amount,
    discount: 0,
    total: amount,
    totalCost: 0,
    source: "manual",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await withLoader("جاري حفظ الفاتورة المباشرة...", async () => {
    await saveEntity("invoices", invoiceId, payload);
    await ensureCustomerFromInvoice(payload);
  });

  toggleModal("manualInvoiceModal", false);
  showToast("تم حفظ الفاتورة", "success");
  await resetInvoicesAndRender();
}

async function getCustomerSuggestions(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];

  const [invoices, customers] = await Promise.all([
    getAllInvoices(),
    getAllCustomers()
  ]);

  const map = new Map();

  customers
    .filter(c => c.storeId === currentStoreId)
    .forEach(c => {
      const name = String(c.name || "").trim();
      const phone = String(c.phone || "").trim();
      const key = `${name}__${phone}`;

      if ((name.toLowerCase().includes(q)) || (phone.toLowerCase().includes(q))) {
        map.set(key, {
          name,
          phone,
          lastDate: c.updatedAt || c.createdAt || nowIso()
        });
      }
    });

  invoices
    .filter(inv => inv.storeId === currentStoreId)
    .forEach(inv => {
      const name = String(inv.customer || "").trim();
      const phone = String(inv.phone || "").trim();
      if (!name && !phone) return;

      const key = `${name}__${phone}`;

      if ((name.toLowerCase().includes(q)) || (phone.toLowerCase().includes(q))) {
        const old = map.get(key);

        if (!old || new Date(inv.date || 0) > new Date(old.lastDate || 0)) {
          map.set(key, {
            name,
            phone,
            lastDate: inv.date || inv.createdAt || nowIso()
          });
        }
      }
    });

  return [...map.values()]
    .sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate))
    .slice(0, 10);
}

async function handleCustomerInput() {
  const box = qs("customerSuggestions");
  if (!box) return;

  const q = (qs("customerName")?.value || qs("customerPhone")?.value || "").trim();

  if (q.length < 2) {
    box.classList.add("hidden");
    return;
  }

  const suggestions = await getCustomerSuggestions(q);
  renderCustomerSuggestions(box, suggestions, "customerName", "customerPhone");
}

async function handleManualCustomerInput() {
  const box = qs("manualCustomerSuggestions");
  if (!box) return;

  const q = (qs("manualCustomerName")?.value || qs("manualCustomerPhone")?.value || "").trim();

  if (q.length < 2) {
    box.classList.add("hidden");
    return;
  }

  const suggestions = await getCustomerSuggestions(q);
  renderCustomerSuggestions(box, suggestions, "manualCustomerName", "manualCustomerPhone");
}

function renderCustomerSuggestions(box, suggestions, nameInputId, phoneInputId) {
  box.innerHTML = "";

  if (!suggestions.length) {
    box.classList.add("hidden");
    return;
  }

  suggestions.forEach(item => {
    const div = document.createElement("div");
    div.className = "suggest-item";

    div.innerHTML = `
      <div>
        <div class="font-black">${escapeHtml(item.name || "بدون اسم")}</div>
        <div class="text-xs text-gray-400">${escapeHtml(item.phone || "-")}</div>
      </div>
      <div class="text-xs text-blue-700 font-bold">اختيار</div>
    `;

    div.onclick = () => {
      if (qs(nameInputId)) qs(nameInputId).value = item.name || "";
      if (qs(phoneInputId)) qs(phoneInputId).value = item.phone || "";
      box.classList.add("hidden");
    };

    box.appendChild(div);
  });

  box.classList.remove("hidden");
}

window.resetInvoicesAndRender = resetInvoicesAndRender;
window.loadMoreInvoices = loadMoreInvoices;
window.exportSalesReport = exportSalesReport;
window.viewInvoice = viewInvoice;
window.backFromInvoicePage = backFromInvoicePage;
window.printInvoicePage = printInvoicePage;
window.exportInvoicePage = exportInvoicePage;
window.shareCurrentInvoice = shareCurrentInvoice;
window.openStatusModal = openStatusModal;
window.saveInvoiceStatus = saveInvoiceStatus;
window.openNoteModal = openNoteModal;
window.openManualInvoiceModal = openManualInvoiceModal;
window.saveManualInvoice = saveManualInvoice;
function resetPurchaseForm() {
  if (qs("editPurchaseId")) qs("editPurchaseId").value = "";
  if (qs("purchaseModalTitle")) qs("purchaseModalTitle").innerText = "إضافة فاتورة شراء من مورد";
  if (qs("purchaseSupplier")) qs("purchaseSupplier").value = "";
  if (qs("purchaseDate")) qs("purchaseDate").value = todayDateInput();
  if (qs("purchaseExternalNo")) qs("purchaseExternalNo").value = "";
  if (qs("purchaseNotes")) qs("purchaseNotes").value = "";
  if (qs("purchaseItemsRows")) qs("purchaseItemsRows").innerHTML = "";

  addPurchaseItemRow();
  calculatePurchaseTotal();
}

function openPurchaseModal() {
  resetPurchaseForm();
  toggleModal("purchaseModal", true);
}

function addPurchaseItemRow(item = {}) {
  const tbody = qs("purchaseItemsRows");
  if (!tbody) return;

  const rowId = `pur_row_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const tr = document.createElement("tr");
  tr.className = "purchase-item-row border-b";
  tr.dataset.rowId = rowId;

  tr.innerHTML = `
    <td class="p-3 min-w-[180px]">
      <input type="text" class="purchase-item-name input-bordered" placeholder="اسم الصنف" value="${escapeHtmlAttr(item.name || "")}">
    </td>

    <td class="p-3 min-w-[150px]">
      <input type="text" class="purchase-item-code input-bordered" placeholder="باركود" value="${escapeHtmlAttr(item.code || "")}">
    </td>

    <td class="p-3 min-w-[150px]">
      <input type="text" class="purchase-item-category input-bordered" placeholder="تصنيف" value="${escapeHtmlAttr(item.category || "")}">
    </td>

    <td class="p-3 min-w-[120px]">
      <select class="purchase-item-unit input-bordered">
        <option value="piece" ${item.unitType === "piece" ? "selected" : ""}>قطعة</option>
        <option value="carton" ${item.unitType === "carton" ? "selected" : ""}>كرتونة</option>
        <option value="kg" ${item.unitType === "kg" ? "selected" : ""}>كيلو</option>
        <option value="gram" ${item.unitType === "gram" ? "selected" : ""}>جرام</option>
        <option value="liter" ${item.unitType === "liter" ? "selected" : ""}>لتر</option>
        <option value="ml" ${item.unitType === "ml" ? "selected" : ""}>مل</option>
        <option value="minute" ${item.unitType === "minute" ? "selected" : ""}>دقائق / رصيد</option>
        <option value="custom" ${item.unitType === "custom" ? "selected" : ""}>مخصص</option>
      </select>
    </td>

    <td class="p-3 min-w-[120px]">
      <input type="number" step="0.01" class="purchase-item-qty input-bordered" placeholder="الكمية" value="${Number(item.qty || 1)}">
    </td>

    <td class="p-3 min-w-[130px]">
      <input type="number" step="0.01" class="purchase-item-cost input-bordered" placeholder="جملة" value="${Number(item.cost || 0)}">
    </td>

    <td class="p-3 min-w-[130px]">
      <input type="number" step="0.01" class="purchase-item-price input-bordered" placeholder="بيع" value="${Number(item.price || 0)}">
    </td>

    <td class="p-3 min-w-[130px] font-black text-blue-700 purchase-item-total">
      0.00
    </td>

    <td class="p-3">
      <button type="button" class="text-red-700 bg-red-50 px-3 py-2 rounded-xl font-black remove-purchase-row">حذف</button>
    </td>
  `;

  tbody.appendChild(tr);

  tr.querySelectorAll("input,select").forEach(el => {
    el.addEventListener("input", calculatePurchaseTotal);
    el.addEventListener("change", calculatePurchaseTotal);
  });

  tr.querySelector(".remove-purchase-row").onclick = () => {
    tr.remove();
    calculatePurchaseTotal();
  };

  calculatePurchaseTotal();
}

function getPurchaseRowsData() {
  const rows = [...document.querySelectorAll(".purchase-item-row")];

  return rows.map(row => {
    const unitType = row.querySelector(".purchase-item-unit")?.value || "piece";
    const qty = Number(row.querySelector(".purchase-item-qty")?.value || 0);
    const cost = Number(row.querySelector(".purchase-item-cost")?.value || 0);
    const price = Number(row.querySelector(".purchase-item-price")?.value || 0);

    return {
      name: row.querySelector(".purchase-item-name")?.value.trim() || "",
      code: row.querySelector(".purchase-item-code")?.value.trim() || "",
      category: row.querySelector(".purchase-item-category")?.value.trim() || "",
      unitType,
      qty,
      cost,
      price,
      total: qty * cost
    };
  }).filter(item => item.name && item.qty > 0);
}

function calculatePurchaseTotal() {
  const rows = [...document.querySelectorAll(".purchase-item-row")];

  let count = 0;
  let total = 0;

  rows.forEach(row => {
    const qty = Number(row.querySelector(".purchase-item-qty")?.value || 0);
    const cost = Number(row.querySelector(".purchase-item-cost")?.value || 0);
    const rowTotal = qty * cost;

    const totalCell = row.querySelector(".purchase-item-total");
    if (totalCell) totalCell.innerText = money(rowTotal);

    if (qty > 0) count++;
    total += rowTotal;
  });

  if (qs("purchaseItemsCount")) qs("purchaseItemsCount").innerText = count;
  if (qs("purchaseTotalAmount")) qs("purchaseTotalAmount").innerText = money(total);
}

async function upsertProductFromPurchaseItem(item, supplier) {
  const products = await getAllProducts();

  const existing = products.find(p =>
    p.storeId === currentStoreId &&
    (
      (item.code && String(p.code || "").trim() === item.code) ||
      String(p.name || "").trim() === item.name
    )
  );

  const unitType = item.unitType || "piece";
  const factor = unitTypeDefaultFactor(unitType);
  const baseUnitName = unitTypeDefaultBase(unitType);
  const largeUnitName = unitTypeDefaultLarge(unitType);

  if (existing) {
    const updated = {
      ...existing,
      supplier: supplier || existing.supplier || "",
      category: item.category || existing.category || "",
      code: item.code || existing.code || "",
      unitType: existing.unitType || unitType,
      baseUnitName: existing.baseUnitName || baseUnitName,
      largeUnitName: existing.largeUnitName || largeUnitName,
      unitFactor: Number(existing.unitFactor || factor),
      stock: Number(existing.stock || 0) + Number(item.qty || 0),
      cost: Number(item.cost || existing.cost || 0),
      price: Number(item.price || existing.price || 0),
      updatedAt: nowIso()
    };

    await saveEntity("products", existing.id, updated);
    return updated;
  }

  const id = `p_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const product = {
    id,
    storeId: currentStoreId,
    name: item.name,
    category: item.category || "",
    code: item.code || `P-${Date.now()}`,
    image: "",
    supplier: supplier || "",
    lowStockLimit: Number(getLocalSettings().lowStockDefault || 5),
    unitType,
    baseUnitName,
    largeUnitName,
    unitFactor: factor,
    stock: Number(item.qty || 0),
    cost: Number(item.cost || 0),
    price: Number(item.price || 0),
    largeCost: 0,
    largePrice: 0,
    pricingMode: "base",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await saveEntity("products", id, product);
  return product;
}

async function savePurchase() {
  const editId = qs("editPurchaseId")?.value || "";
  const supplier = qs("purchaseSupplier")?.value.trim() || "";
  const purchaseDate = qs("purchaseDate")?.value || todayDateInput();
  const externalNo = qs("purchaseExternalNo")?.value.trim() || "";
  const notes = qs("purchaseNotes")?.value.trim() || "";
  const items = getPurchaseRowsData();

  if (!supplier) {
    alert("يرجى إدخال اسم المورد");
    return;
  }

  if (!items.length) {
    alert("يرجى إضافة صنف واحد على الأقل");
    return;
  }

  const total = items.reduce((s, item) => s + Number(item.total || 0), 0);
  const qtyTotal = items.reduce((s, item) => s + Number(item.qty || 0), 0);
  const purchaseId = editId || String(await getNextPurchaseNumber());

  const oldPurchase = editId ? await getEntity("purchases", editId) : null;

  const payload = {
    id: purchaseId,
    storeId: currentStoreId,
    supplier,
    date: new Date(`${purchaseDate}T12:00:00`).toISOString(),
    externalNo,
    notes,
    items,
    total,
    qtyTotal,
    createdAt: oldPurchase?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  await withLoader(editId ? "جاري تعديل فاتورة الشراء..." : "جاري حفظ فاتورة الشراء...", async () => {
    if (oldPurchase?.items?.length) {
      for (const oldItem of oldPurchase.items) {
        const products = await getAllProducts();
        const p = products.find(x =>
          x.storeId === currentStoreId &&
          (
            (oldItem.code && x.code === oldItem.code) ||
            x.name === oldItem.name
          )
        );

        if (p) {
          await saveEntity("products", p.id, {
            ...p,
            stock: Math.max(0, Number(p.stock || 0) - Number(oldItem.qty || 0)),
            updatedAt: nowIso()
          });
        }
      }
    }

    for (const item of items) {
      await upsertProductFromPurchaseItem(item, supplier);
    }

    await saveEntity("purchases", purchaseId, payload);
  });

  toggleModal("purchaseModal", false);
  showToast("تم حفظ فاتورة الشراء وتحديث المخزون", "success");

  await renderPurchases();
  await resetProductsAndRender();
  await renderDashboard();
}

async function editPurchase(id) {
  const p = await getEntity("purchases", id);

  if (!p) {
    alert("فاتورة الشراء غير موجودة");
    return;
  }

  if (qs("editPurchaseId")) qs("editPurchaseId").value = p.id || "";
  if (qs("purchaseModalTitle")) qs("purchaseModalTitle").innerText = "تعديل فاتورة شراء";
  if (qs("purchaseSupplier")) qs("purchaseSupplier").value = p.supplier || "";
  if (qs("purchaseDate")) qs("purchaseDate").value = toDateInput(p.date || p.createdAt);
  if (qs("purchaseExternalNo")) qs("purchaseExternalNo").value = p.externalNo || "";
  if (qs("purchaseNotes")) qs("purchaseNotes").value = p.notes || "";

  if (qs("purchaseItemsRows")) qs("purchaseItemsRows").innerHTML = "";

  (p.items || []).forEach(item => addPurchaseItemRow(item));

  calculatePurchaseTotal();
  toggleModal("purchaseModal", true);
}

async function deletePurchase(id) {
  if (!confirm("حذف فاتورة الشراء؟ سيتم إنقاص كمياتها من المخزون.")) return;

  await withLoader("جاري حذف فاتورة الشراء...", async () => {
    const purchase = await getEntity("purchases", id);

    if (purchase?.items?.length) {
      for (const item of purchase.items) {
        const products = await getAllProducts();
        const p = products.find(x =>
          x.storeId === currentStoreId &&
          (
            (item.code && x.code === item.code) ||
            x.name === item.name
          )
        );

        if (p) {
          await saveEntity("products", p.id, {
            ...p,
            stock: Math.max(0, Number(p.stock || 0) - Number(item.qty || 0)),
            updatedAt: nowIso()
          });
        }
      }
    }

    await deleteEntity("purchases", id);
  });

  showToast("تم حذف فاتورة الشراء", "success");
  await renderPurchases();
  await resetProductsAndRender();
  await renderDashboard();
}

async function filteredPurchases() {
  const range = qs("purchasesReportRange")?.value || "day";
  const customDate = qs("purchasesReportDate")?.value || "";
  const search = (qs("purchasesSearch")?.value || "").toLowerCase().trim();

  const purchases = await getAllPurchases();

  return purchases
    .filter(p => p.storeId === currentStoreId)
    .filter(p => inRangeByFilter(p.date || p.createdAt, range, customDate))
    .filter(p => {
      const itemText = (p.items || []).map(i => `${i.name || ""} ${i.category || ""}`).join(" ");
      const hay = `${p.supplier || ""} ${p.externalNo || ""} ${itemText}`.toLowerCase();
      return !search || hay.includes(search);
    })
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
}

async function renderPurchases() {
  const table = qs("purchasesTable");
  const loading = qs("purchasesLoading");

  if (!table) return;

  table.innerHTML = "";
  loading?.classList.remove("hidden");

  const purchases = await filteredPurchases();

  if (!purchases.length) {
    table.innerHTML = `
      <tr>
        <td colspan="11" class="p-8 text-center text-gray-400">
          لا توجد فواتير مشتريات
        </td>
      </tr>
    `;
  }

  purchases.forEach(p => {
    const items = p.items?.length ? p.items : [{
      name: "-",
      qty: 0,
      unitType: "piece",
      cost: 0,
      price: 0,
      total: 0
    }];

    items.forEach((item, index) => {
      table.innerHTML += `
        <tr class="border-b hover:bg-gray-50">
          <td class="p-4 font-black">${index === 0 ? `#${escapeHtml(p.id)}` : ""}</td>
          <td class="p-4 text-xs text-gray-500">${index === 0 ? formatDateTime(p.date || p.createdAt) : ""}</td>
          <td class="p-4 font-bold">${index === 0 ? escapeHtml(p.supplier || "-") : ""}</td>
          <td class="p-4">${escapeHtml(item.name || "-")}</td>
          <td class="p-4">${Number(item.qty || 0)}</td>
          <td class="p-4">${escapeHtml(unitTypeDefaultBase(item.unitType || "piece"))}</td>
          <td class="p-4 text-red-700 font-bold">${money(item.cost || 0)}</td>
          <td class="p-4 text-blue-700 font-bold">${money(item.price || 0)}</td>
          <td class="p-4 font-black">${money(item.total || 0)}</td>
          <td class="p-4 text-xs">${index === 0 ? escapeHtml(p.notes || "-") : ""}</td>
          <td class="p-4">
            ${
              index === 0
                ? `
                  <div class="flex gap-2 flex-wrap">
                    <button onclick="editPurchase('${escapeJs(p.id)}')" class="text-blue-700 bg-blue-50 px-3 py-1 rounded-lg text-xs font-black">تعديل</button>
                    <button onclick="deletePurchase('${escapeJs(p.id)}')" class="text-red-700 bg-red-50 px-3 py-1 rounded-lg text-xs font-black">حذف</button>
                  </div>
                `
                : ""
            }
          </td>
        </tr>
      `;
    });
  });

  loading?.classList.add("hidden");

  const totalAmount = purchases.reduce((s, p) => s + Number(p.total || 0), 0);
  const qtyTotal = purchases.reduce((s, p) => s + Number(p.qtyTotal || 0), 0);
  const suppliersCount = new Set(purchases.map(p => p.supplier || "").filter(Boolean)).size;

  if (qs("purchasesTotalAmount")) qs("purchasesTotalAmount").innerText = money(totalAmount);
  if (qs("purchasesCount")) qs("purchasesCount").innerText = purchases.length;
  if (qs("purchasesQtyTotal")) qs("purchasesQtyTotal").innerText = qtyTotal;
  if (qs("purchasesSuppliersCount")) qs("purchasesSuppliersCount").innerText = suppliersCount;
}

async function buildPurchasesReportHtml(range, customDate = "") {
  const purchases = await getAllPurchases();
  const store = await idbGet("stores", currentStoreId);

  const filtered = purchases
    .filter(p => p.storeId === currentStoreId)
    .filter(p => inRangeByFilter(p.date || p.createdAt, range, customDate))
    .sort((a, b) => new Date(a.date || a.createdAt || 0) - new Date(b.date || b.createdAt || 0));

  const groups = groupByDateArabic(filtered, "date");

  let html = `
    <div class="report-print-page">
      <div class="flex justify-between items-center mb-4">
        <div>
          <div class="report-title">تقرير مشتريات الموردين - ${escapeHtml(rangeLabel(range, customDate))}</div>
          <div class="text-sm text-gray-500">${escapeHtml(store?.name || "المحل")}</div>
        </div>
        <div class="text-sm text-gray-500">${new Date().toLocaleString("ar-EG")}</div>
      </div>
  `;

  if (!filtered.length) {
    html += `<div class="p-10 text-center text-gray-400">لا توجد بيانات في هذه الفترة</div>`;
  }

  groups.forEach((rows, dateTitle) => {
    html += `
      <div class="report-date-title">${escapeHtml(dateTitle)}</div>
      <table class="report-table">
        <thead>
          <tr>
            <th>رقم الفاتورة</th>
            <th>اسم المورد</th>
            <th>الصنف</th>
            <th>الكمية</th>
            <th>الوحدة</th>
            <th>سعر الجملة</th>
            <th>سعر البيع</th>
            <th>الإجمالي</th>
            <th>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(p => {
      (p.items || []).forEach(item => {
        html += `
          <tr>
            <td>#${escapeHtml(p.id)}</td>
            <td>${escapeHtml(p.supplier || "-")}</td>
            <td>${escapeHtml(item.name || "-")}</td>
            <td>${Number(item.qty || 0)}</td>
            <td>${escapeHtml(unitTypeDefaultBase(item.unitType || "piece"))}</td>
            <td>${money(item.cost || 0)}</td>
            <td>${money(item.price || 0)}</td>
            <td>${money(item.total || 0)}</td>
            <td>${escapeHtml(p.notes || "-")}</td>
          </tr>
        `;
      });
    });

    const dayTotal = rows.reduce((s, p) => s + Number(p.total || 0), 0);

    html += `
        </tbody>
        <tfoot>
          <tr>
            <th colspan="7">إجمالي اليوم</th>
            <th colspan="2">${money(dayTotal)}</th>
          </tr>
        </tfoot>
      </table>
    `;
  });

  const total = filtered.reduce((s, p) => s + Number(p.total || 0), 0);

  html += `
      <div class="mt-5 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xl font-black text-blue-700">
        الإجمالي العام: ${money(total)}
      </div>
    </div>
  `;

  return html;
}

async function exportPurchasesReport(type) {
  const range = qs("purchasesReportRange")?.value || "day";
  const customDate = qs("purchasesReportDate")?.value || "";
  const area = qs("purchasesReportExportArea") || qs("globalReportExportArea");

  if (!area) return;

  await showLoader("جاري تجهيز تقرير المشتريات...");

  area.innerHTML = await buildPurchasesReportHtml(range, customDate);
  area.classList.remove("hidden");

  try {
    await exportElementArea(area, type, `تقرير_المشتريات_${range}`);
  } finally {
    area.classList.add("hidden");
    hideLoader();
  }
}

function resetSupplierPaymentForm() {
  if (qs("editSupplierPaymentId")) qs("editSupplierPaymentId").value = "";
  if (qs("supplierPaymentModalTitle")) qs("supplierPaymentModalTitle").innerText = "إضافة دفعة لتاجر";
  if (qs("supplierPaymentName")) qs("supplierPaymentName").value = "";
  if (qs("supplierPaymentAmount")) qs("supplierPaymentAmount").value = "";
  if (qs("supplierPaymentDate")) qs("supplierPaymentDate").value = todayDateInput();
  if (qs("supplierPaymentMethod")) qs("supplierPaymentMethod").value = "cash";
  if (qs("supplierPaymentAccountSelect")) qs("supplierPaymentAccountSelect").value = "";
  if (qs("supplierPaymentTransferNo")) qs("supplierPaymentTransferNo").value = "";
  if (qs("supplierPaymentNotes")) qs("supplierPaymentNotes").value = "";
}

async function openSupplierPaymentModal() {
  await fillTransferAccountsSelect("supplierPaymentAccountSelect");
  resetSupplierPaymentForm();
  toggleModal("supplierPaymentModal", true);
}

async function saveSupplierPayment() {
  const editId = qs("editSupplierPaymentId")?.value || "";
  const supplier = qs("supplierPaymentName")?.value.trim() || "";
  const amount = Number(qs("supplierPaymentAmount")?.value || 0);

  if (!supplier || amount <= 0) {
    alert("يرجى إدخال اسم التاجر والمبلغ");
    return;
  }

  const account = getSelectedAccountFrom("supplierPaymentAccountSelect");
  const id = editId || `sp_${Date.now()}`;

  const old = editId ? await getEntity("supplierPayments", editId) : null;

  const payload = {
    id,
    storeId: currentStoreId,
    supplier,
    amount,
    date: new Date(`${qs("supplierPaymentDate")?.value || todayDateInput()}T12:00:00`).toISOString(),
    payment: qs("supplierPaymentMethod")?.value || "cash",
    ...account,
    transferNumber: qs("supplierPaymentTransferNo")?.value.trim() || "",
    notes: qs("supplierPaymentNotes")?.value.trim() || "",
    createdAt: old?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  await withLoader("جاري حفظ دفعة التاجر...", async () => {
    await saveEntity("supplierPayments", id, payload);
  });

  toggleModal("supplierPaymentModal", false);
  showToast("تم حفظ الدفعة", "success");
  await renderSupplierPayments();
  await renderReports();
}

async function editSupplierPayment(id) {
  const p = await getEntity("supplierPayments", id);

  if (!p) {
    alert("الدفعة غير موجودة");
    return;
  }

  await fillTransferAccountsSelect("supplierPaymentAccountSelect");

  if (qs("editSupplierPaymentId")) qs("editSupplierPaymentId").value = p.id || "";
  if (qs("supplierPaymentModalTitle")) qs("supplierPaymentModalTitle").innerText = "تعديل دفعة تاجر";
  if (qs("supplierPaymentName")) qs("supplierPaymentName").value = p.supplier || "";
  if (qs("supplierPaymentAmount")) qs("supplierPaymentAmount").value = Number(p.amount || 0);
  if (qs("supplierPaymentDate")) qs("supplierPaymentDate").value = toDateInput(p.date || p.createdAt);
  if (qs("supplierPaymentMethod")) qs("supplierPaymentMethod").value = p.payment || "cash";
  if (qs("supplierPaymentTransferNo")) qs("supplierPaymentTransferNo").value = p.transferNumber || "";
  if (qs("supplierPaymentNotes")) qs("supplierPaymentNotes").value = p.notes || "";

  const select = qs("supplierPaymentAccountSelect");
  if (select) {
    const wanted = `${p.transferAccountType || ""}|||${p.transferAccountName || ""}|||${p.transferAccountNumber || ""}`;
    select.value = wanted;
  }

  toggleModal("supplierPaymentModal", true);
}

async function deleteSupplierPayment(id) {
  if (!confirm("حذف دفعة التاجر؟")) return;

  await withLoader("جاري حذف الدفعة...", async () => {
    await deleteEntity("supplierPayments", id);
  });

  showToast("تم حذف الدفعة", "success");
  await renderSupplierPayments();
  await renderReports();
}

async function filteredSupplierPayments() {
  const range = qs("supplierPaymentsRange")?.value || "day";
  const search = (qs("supplierPaymentsSearch")?.value || "").toLowerCase().trim();

  const items = await getAllSupplierPayments();

  return items
    .filter(p => p.storeId === currentStoreId)
    .filter(p => inRangeByFilter(p.date || p.createdAt, range))
    .filter(p => {
      const hay = `${p.supplier || ""} ${p.transferNumber || ""} ${buildTransferLine(p)}`.toLowerCase();
      return !search || hay.includes(search);
    })
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
}

async function renderSupplierPayments() {
  const table = qs("supplierPaymentsTable");
  if (!table) return;

  const items = await filteredSupplierPayments();

  table.innerHTML = "";

  if (!items.length) {
    table.innerHTML = `
      <tr>
        <td colspan="7" class="p-8 text-center text-gray-400">
          لا توجد دفعات تجار
        </td>
      </tr>
    `;
    return;
  }

  items.forEach(p => {
    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4 text-xs text-gray-500">${formatDateTime(p.date || p.createdAt)}</td>
        <td class="p-4 font-black">${escapeHtml(p.supplier || "-")}</td>
        <td class="p-4 text-red-700 font-black">${money(p.amount || 0)}</td>
        <td class="p-4">${escapeHtml(paymentLabel(p.payment))}</td>
        <td class="p-4 text-xs">${escapeHtml(p.transferNumber || p.transferAccountNumber || buildTransferLine(p) || "-")}</td>
        <td class="p-4 text-xs">${escapeHtml(p.notes || "-")}</td>
        <td class="p-4">
          <div class="flex gap-2 flex-wrap">
            <button onclick="editSupplierPayment('${escapeJs(p.id)}')" class="text-blue-700 bg-blue-50 px-3 py-1 rounded-lg text-xs font-black">تعديل</button>
            <button onclick="deleteSupplierPayment('${escapeJs(p.id)}')" class="text-red-700 bg-red-50 px-3 py-1 rounded-lg text-xs font-black">حذف</button>
          </div>
        </td>
      </tr>
    `;
  });
}

async function buildSupplierPaymentsReportHtml(range) {
  const rows = (await getAllSupplierPayments())
    .filter(p => p.storeId === currentStoreId)
    .filter(p => inRangeByFilter(p.date || p.createdAt, range))
    .sort((a, b) => new Date(a.date || a.createdAt || 0) - new Date(b.date || b.createdAt || 0));

  let html = `
    <div class="report-print-page">
      <div class="report-title">تقرير دفعات التجار - ${escapeHtml(rangeLabel(range))}</div>
      <table class="report-table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>اسم التاجر / المورد</th>
            <th>المبلغ</th>
            <th>طريقة الدفع</th>
            <th>رقم التحويل</th>
            <th>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
  `;

  rows.forEach(p => {
    html += `
      <tr>
        <td>${formatDateTime(p.date || p.createdAt)}</td>
        <td>${escapeHtml(p.supplier || "-")}</td>
        <td>${money(p.amount || 0)}</td>
        <td>${escapeHtml(paymentLabel(p.payment))}</td>
        <td>${escapeHtml(p.transferNumber || p.transferAccountNumber || "-")}</td>
        <td>${escapeHtml(p.notes || "-")}</td>
      </tr>
    `;
  });

  const total = rows.reduce((s, p) => s + Number(p.amount || 0), 0);

  html += `
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">الإجمالي</th>
            <th colspan="4">${money(total)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  return html;
}

async function exportSupplierPaymentsReport(type) {
  const range = qs("supplierPaymentsRange")?.value || "day";
  const area = qs("supplierPaymentsExportArea") || qs("globalReportExportArea");
  if (!area) return;

  await showLoader("جاري تجهيز تقرير دفعات التجار...");

  area.innerHTML = await buildSupplierPaymentsReportHtml(range);
  area.classList.remove("hidden");

  try {
    await exportElementArea(area, type, `تقرير_دفعات_التجار_${range}`);
  } finally {
    area.classList.add("hidden");
    hideLoader();
  }
}

window.openPurchaseModal = openPurchaseModal;
window.addPurchaseItemRow = addPurchaseItemRow;
window.savePurchase = savePurchase;
window.editPurchase = editPurchase;
window.deletePurchase = deletePurchase;
window.renderPurchases = renderPurchases;
window.exportPurchasesReport = exportPurchasesReport;

window.openSupplierPaymentModal = openSupplierPaymentModal;
window.saveSupplierPayment = saveSupplierPayment;
window.editSupplierPayment = editSupplierPayment;
window.deleteSupplierPayment = deleteSupplierPayment;
window.renderSupplierPayments = renderSupplierPayments;
window.exportSupplierPaymentsReport = exportSupplierPaymentsReport;
function customerKey(name, phone) {
  return `${String(name || "").trim()}__${String(phone || "").trim()}`;
}

function customerIdFromData(name, phone) {
  return `cust_${sanitizeKey(String(name || "").trim() || "customer")}_${sanitizeKey(String(phone || "").trim() || "no_phone")}`;
}

async function ensureCustomerFromInvoice(inv) {
  const name = String(inv.customer || "").trim();
  const phone = String(inv.phone || "").trim();

  if (!name && !phone) return null;

  const id = customerIdFromData(name, phone);
  const old = await getEntity("customers", id);

  const oldTotalDebt = Number(old?.manualDebt || 0);
  const oldPaidManual = Number(old?.manualPaid || 0);

  const payload = {
    id,
    storeId: currentStoreId,
    name: name || "بدون اسم",
    phone,
    dueMode: inv.dueMode || old?.dueMode || "",
    dueDate: inv.dueDate || old?.dueDate || "",
    notes: old?.notes || "",
    manualDebt: oldTotalDebt,
    manualPaid: oldPaidManual,
    createdAt: old?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  await saveEntity("customers", id, payload);
  return payload;
}

async function calculateCustomerStats(customer) {
  const invoices = await getAllInvoices();
  const payments = await getAllCustomerPayments();

  const relatedInvoices = invoices.filter(inv =>
    inv.storeId === currentStoreId &&
    customerKey(inv.customer, inv.phone) === customerKey(customer.name, customer.phone)
  );

  const relatedPayments = payments.filter(p =>
    p.storeId === currentStoreId &&
    String(p.customerId || "") === String(customer.id || "")
  );

  let totalDebt = Number(customer.manualDebt || 0);
  let paid = Number(customer.manualPaid || 0);

  relatedInvoices.forEach(inv => {
    const amount = Number(inv.total || 0);

    if ((inv.status || "paid") === "paid") {
      paid += amount;
    } else {
      totalDebt += amount;
    }
  });

  relatedPayments.forEach(p => {
    paid += Number(p.amount || 0);
  });

  const remaining = Math.max(0, totalDebt - paid);

  return {
    totalDebt,
    paid,
    remaining,
    invoices: relatedInvoices,
    payments: relatedPayments
  };
}

function isLateDue(customer) {
  if (!customer?.dueDate) return false;

  const due = new Date(customer.dueDate + "T23:59:59");
  if (isNaN(due.getTime())) return false;

  return due.getTime() < Date.now();
}

async function openCustomerModal(customerId = "") {
  if (qs("editCustomerId")) qs("editCustomerId").value = "";
  if (qs("customerModalTitle")) qs("customerModalTitle").innerText = "إضافة عميل";
  if (qs("customerFormName")) qs("customerFormName").value = "";
  if (qs("customerFormPhone")) qs("customerFormPhone").value = "";
  if (qs("customerDueMode")) qs("customerDueMode").value = "";
  if (qs("customerDueDate")) qs("customerDueDate").value = "";
  if (qs("customerNotes")) qs("customerNotes").value = "";

  if (customerId) {
    const customer = await getEntity("customers", customerId);

    if (customer) {
      if (qs("editCustomerId")) qs("editCustomerId").value = customer.id || "";
      if (qs("customerModalTitle")) qs("customerModalTitle").innerText = "تعديل عميل";
      if (qs("customerFormName")) qs("customerFormName").value = customer.name || "";
      if (qs("customerFormPhone")) qs("customerFormPhone").value = customer.phone || "";
      if (qs("customerDueMode")) qs("customerDueMode").value = customer.dueMode || "";
      if (qs("customerDueDate")) qs("customerDueDate").value = customer.dueDate || "";
      if (qs("customerNotes")) qs("customerNotes").value = customer.notes || "";
    }
  }

  toggleModal("customerModal", true);
}

async function saveCustomer() {
  const editId = qs("editCustomerId")?.value || "";
  const name = qs("customerFormName")?.value.trim() || "";
  const phone = qs("customerFormPhone")?.value.trim() || "";

  if (!name) {
    alert("يرجى إدخال اسم العميل");
    return;
  }

  const id = editId || customerIdFromData(name, phone);
  const old = editId ? await getEntity("customers", editId) : await getEntity("customers", id);

  const payload = {
    id,
    storeId: currentStoreId,
    name,
    phone,
    dueMode: qs("customerDueMode")?.value || "",
    dueDate: qs("customerDueDate")?.value || "",
    notes: qs("customerNotes")?.value.trim() || "",
    manualDebt: Number(old?.manualDebt || 0),
    manualPaid: Number(old?.manualPaid || 0),
    createdAt: old?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  await withLoader("جاري حفظ العميل...", async () => {
    if (editId && editId !== id) {
      await deleteEntity("customers", editId);
    }

    await saveEntity("customers", id, payload);
  });

  toggleModal("customerModal", false);
  showToast("تم حفظ العميل", "success");

  await renderCustomers();
  await renderDashboard();
}

async function deleteCustomer(id) {
  if (!confirm("حذف العميل؟ لن يتم حذف الفواتير المرتبطة به.")) return;

  await withLoader("جاري حذف العميل...", async () => {
    await deleteEntity("customers", id);
  });

  showToast("تم حذف العميل", "success");
  await renderCustomers();
}

async function filteredCustomers() {
  const search = (qs("customersSearch")?.value || "").toLowerCase().trim();
  const filter = qs("customersDebtFilter")?.value || "all";

  const customers = await getAllCustomers();

  const rows = [];

  for (const c of customers.filter(x => x.storeId === currentStoreId)) {
    const stats = await calculateCustomerStats(c);
    const hay = `${c.name || ""} ${c.phone || ""}`.toLowerCase();

    if (search && !hay.includes(search)) continue;

    if (filter === "debt" && stats.remaining <= 0) continue;
    if (filter === "clear" && stats.remaining > 0) continue;
    if (filter === "late" && (!isLateDue(c) || stats.remaining <= 0)) continue;

    rows.push({
      ...c,
      ...stats
    });
  }

  return rows.sort((a, b) => Number(b.remaining || 0) - Number(a.remaining || 0));
}

async function renderCustomers() {
  const table = qs("customersTable");
  if (!table) return;

  const rows = await filteredCustomers();

  table.innerHTML = "";

  if (!rows.length) {
    table.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-gray-400">
          لا يوجد عملاء
        </td>
      </tr>
    `;
  }

  let totalDebt = 0;
  let paid = 0;
  let remaining = 0;

  rows.forEach(c => {
    totalDebt += Number(c.totalDebt || 0);
    paid += Number(c.paid || 0);
    remaining += Number(c.remaining || 0);

    const late = isLateDue(c) && Number(c.remaining || 0) > 0;

    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4 font-black">${escapeHtml(c.name || "-")}</td>
        <td class="p-4">${escapeHtml(c.phone || "-")}</td>
        <td class="p-4 text-orange-700 font-black">${money(c.totalDebt || 0)}</td>
        <td class="p-4 text-green-700 font-black">${money(c.paid || 0)}</td>
        <td class="p-4 text-red-700 font-black">${money(c.remaining || 0)}</td>
        <td class="p-4 text-xs">${c.dueDate ? escapeHtml(c.dueDate) : c.dueMode === "daily" ? "يومي" : "-"}</td>
        <td class="p-4">
          <span class="status-pill ${late ? "status-late" : Number(c.remaining || 0) > 0 ? "status-unpaid" : "status-paid"}">
            ${late ? "متأخر" : Number(c.remaining || 0) > 0 ? "عليه دين" : "صافي"}
          </span>
        </td>
        <td class="p-4">
          <div class="flex gap-2 flex-wrap">
            <button onclick="openCustomerHistory('${escapeJs(c.name || "")}','${escapeJs(c.phone || "")}')" class="text-blue-700 bg-blue-50 px-3 py-1 rounded-lg text-xs font-black">السجل</button>
            <button onclick="openCustomerModal('${escapeJs(c.id)}')" class="text-amber-700 bg-amber-50 px-3 py-1 rounded-lg text-xs font-black">تعديل</button>
            <button onclick="deleteCustomer('${escapeJs(c.id)}')" class="text-red-700 bg-red-50 px-3 py-1 rounded-lg text-xs font-black">حذف</button>
          </div>
        </td>
      </tr>
    `;
  });

  if (qs("customersTotalDebt")) qs("customersTotalDebt").innerText = money(totalDebt);
  if (qs("customersTotalPaid")) qs("customersTotalPaid").innerText = money(paid);
  if (qs("customersRemainingDebt")) qs("customersRemainingDebt").innerText = money(remaining);
  if (qs("customersCount")) qs("customersCount").innerText = rows.length;
}

async function openCustomerHistory(name, phone = "") {
  currentCustomerHistoryName = name;
  currentCustomerHistoryPhone = phone;

  await fillTransferAccountsSelect("customerPaymentAccountSelect");

  const customerId = customerIdFromData(name, phone);
  const customer = await getEntity("customers", customerId) || {
    id: customerId,
    storeId: currentStoreId,
    name,
    phone
  };

  const stats = await calculateCustomerStats(customer);
  const range = qs("customerHistoryRange")?.value || "all";

  const invoices = stats.invoices
    .filter(inv => inRangeByFilter(inv.date || inv.createdAt, range))
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));

  const payments = stats.payments
    .filter(p => inRangeByFilter(p.date || p.createdAt, range))
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));

  if (qs("customerHistoryTitle")) {
    qs("customerHistoryTitle").innerText = `${name || "بدون اسم"}${phone ? " - " + phone : ""}`;
  }

  if (qs("custPaidTotal")) qs("custPaidTotal").innerText = money(stats.paid);
  if (qs("custUnpaidTotal")) qs("custUnpaidTotal").innerText = money(stats.remaining);
  if (qs("custGrandTotal")) qs("custGrandTotal").innerText = money(stats.totalDebt);

  const tbody = qs("customerHistoryTable");
  if (tbody) {
    tbody.innerHTML = "";

    const rows = [];

    invoices.forEach(inv => {
      rows.push({
        type: "invoice",
        id: inv.id,
        date: inv.date || inv.createdAt,
        label: "فاتورة",
        status: inv.status || "paid",
        amount: Number(inv.total || 0),
        notes: inv.notes || ""
      });
    });

    payments.forEach(p => {
      rows.push({
        type: "payment",
        id: p.id,
        date: p.date || p.createdAt,
        label: "دفعة",
        status: "paid",
        amount: Number(p.amount || 0),
        notes: p.notes || p.transferNumber || ""
      });
    });

    rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-8 text-center text-gray-400">
            لا يوجد سجل لهذا العميل
          </td>
        </tr>
      `;
    }

    rows.forEach(row => {
      tbody.innerHTML += `
        <tr class="border-b">
          <td class="p-4 font-black">${escapeHtml(row.type === "invoice" ? "#" + row.id : row.id)}</td>
          <td class="p-4 text-xs text-gray-500">${formatDateTime(row.date)}</td>
          <td class="p-4">${escapeHtml(row.label)}</td>
          <td class="p-4">
            <span class="status-pill ${statusClass(row.status)}">${escapeHtml(statusLabel(row.status))}</span>
          </td>
          <td class="p-4 font-black ${row.type === "payment" ? "text-green-700" : "text-blue-700"}">${money(row.amount)}</td>
          <td class="p-4 text-xs">${escapeHtml(row.notes || "-")}</td>
        </tr>
      `;
    });
  }

  if (qs("customerPaymentAmountInput")) qs("customerPaymentAmountInput").value = "";
  if (qs("customerPaymentTransferNoInput")) qs("customerPaymentTransferNoInput").value = "";
  if (qs("customerPaymentMethodInput")) qs("customerPaymentMethodInput").value = "cash";
  if (qs("customerPaymentAccountSelect")) qs("customerPaymentAccountSelect").value = "";

  toggleModal("customerHistoryModal", true);
}

async function saveCustomerPayment() {
  if (!currentCustomerHistoryName) return;

  const amount = Number(qs("customerPaymentAmountInput")?.value || 0);

  if (amount <= 0) {
    alert("يرجى إدخال مبلغ الدفعة");
    return;
  }

  const customerId = customerIdFromData(currentCustomerHistoryName, currentCustomerHistoryPhone);
  let customer = await getEntity("customers", customerId);

  if (!customer) {
    customer = {
      id: customerId,
      storeId: currentStoreId,
      name: currentCustomerHistoryName || "بدون اسم",
      phone: currentCustomerHistoryPhone || "",
      dueMode: "",
      dueDate: "",
      notes: "",
      manualDebt: 0,
      manualPaid: 0,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    await saveEntity("customers", customerId, customer);
  }

  const account = getSelectedAccountFrom("customerPaymentAccountSelect");
  const id = `cp_${Date.now()}`;

  const payload = {
    id,
    storeId: currentStoreId,
    customerId,
    customerName: customer.name || currentCustomerHistoryName,
    customerPhone: customer.phone || currentCustomerHistoryPhone,
    amount,
    payment: qs("customerPaymentMethodInput")?.value || "cash",
    ...account,
    transferNumber: qs("customerPaymentTransferNoInput")?.value.trim() || "",
    date: nowIso(),
    notes: "دفعة من العميل",
    createdAt: nowIso()
  };

  await withLoader("جاري حفظ دفعة العميل...", async () => {
    await saveEntity("customerPayments", id, payload);
  });

  showToast("تم حفظ دفعة العميل", "success");
  await openCustomerHistory(currentCustomerHistoryName, currentCustomerHistoryPhone);
  await renderCustomers();
  await renderDashboard();
}

async function sendDebtMessageToCustomer() {
  if (!currentCustomerHistoryName) return;

  const customerId = customerIdFromData(currentCustomerHistoryName, currentCustomerHistoryPhone);
  const customer = await getEntity("customers", customerId) || {
    id: customerId,
    name: currentCustomerHistoryName,
    phone: currentCustomerHistoryPhone
  };

  const stats = await calculateCustomerStats(customer);

  const app = qs("messageTargetApp")?.value || "whatsapp";
  const prefixMode = qs("messageCountryPrefixMode")?.value || "970";
  const customPrefix = qs("messageCustomPrefix")?.value || "";
  const settings = await getClientSettings();

  const phone = normalizePhoneForSend(currentCustomerHistoryPhone || "", prefixMode, customPrefix);

  if (!phone) {
    alert("رقم العميل غير صالح");
    return;
  }

  const message =
`مرحباً ${currentCustomerHistoryName}
المتبقي عليك: ${money(stats.remaining, false, settings)}
إجمالي الدين: ${money(stats.totalDebt, false, settings)}
المدفوع: ${money(stats.paid, false, settings)}

يرجى التواصل لإتمام السداد.`;

  if (app === "sms") {
    window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
    return;
  }

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
}

async function buildCustomersReportHtml() {
  const rows = await filteredCustomers();

  let html = `
    <div class="report-print-page">
      <div class="report-title">تقرير العملاء والديون</div>
      <table class="report-table">
        <thead>
          <tr>
            <th>اسم العميل</th>
            <th>رقم الهاتف</th>
            <th>إجمالي الدين</th>
            <th>المدفوع</th>
            <th>المتبقي</th>
            <th>موعد السداد</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
  `;

  rows.forEach(c => {
    const late = isLateDue(c) && Number(c.remaining || 0) > 0;

    html += `
      <tr>
        <td>${escapeHtml(c.name || "-")}</td>
        <td>${escapeHtml(c.phone || "-")}</td>
        <td>${money(c.totalDebt || 0)}</td>
        <td>${money(c.paid || 0)}</td>
        <td>${money(c.remaining || 0)}</td>
        <td>${c.dueDate ? escapeHtml(c.dueDate) : c.dueMode === "daily" ? "يومي" : "-"}</td>
        <td>${late ? "متأخر" : Number(c.remaining || 0) > 0 ? "عليه دين" : "صافي"}</td>
      </tr>
    `;
  });

  const totalDebt = rows.reduce((s, c) => s + Number(c.totalDebt || 0), 0);
  const paid = rows.reduce((s, c) => s + Number(c.paid || 0), 0);
  const remaining = rows.reduce((s, c) => s + Number(c.remaining || 0), 0);

  html += `
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">الإجمالي</th>
            <th>${money(totalDebt)}</th>
            <th>${money(paid)}</th>
            <th colspan="3">${money(remaining)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  return html;
}

async function exportCustomersReport(type) {
  const area = qs("customersExportArea") || qs("globalReportExportArea");
  if (!area) return;

  await showLoader("جاري تجهيز تقرير العملاء...");

  area.innerHTML = await buildCustomersReportHtml();
  area.classList.remove("hidden");

  try {
    await exportElementArea(area, type, "تقرير_العملاء_والديون");
  } finally {
    area.classList.add("hidden");
    hideLoader();
  }
}

function resetExpenseForm() {
  if (qs("editExpenseId")) qs("editExpenseId").value = "";
  if (qs("expenseModalTitle")) qs("expenseModalTitle").innerText = "إضافة مصروف";
  if (qs("expenseTypeInput")) qs("expenseTypeInput").value = "";
  if (qs("expenseAmountInput")) qs("expenseAmountInput").value = "";
  if (qs("expenseDateInput")) qs("expenseDateInput").value = todayDateInput();
  if (qs("expenseDeductFromProfitInput")) {
    qs("expenseDeductFromProfitInput").checked = getLocalSettings().expensesDeductDefault !== false;
  }
  if (qs("expenseNotesInput")) qs("expenseNotesInput").value = "";
}

function openExpenseModal() {
  resetExpenseForm();
  toggleModal("expenseModal", true);
}

async function saveExpense() {
  const editId = qs("editExpenseId")?.value || "";
  const type = qs("expenseTypeInput")?.value.trim() || "";
  const amount = Number(qs("expenseAmountInput")?.value || 0);

  if (!type || amount <= 0) {
    alert("يرجى إدخال نوع المصروف والمبلغ");
    return;
  }

  const old = editId ? await getEntity("expenses", editId) : null;
  const id = editId || `exp_${Date.now()}`;

  const payload = {
    id,
    storeId: currentStoreId,
    type,
    amount,
    date: new Date(`${qs("expenseDateInput")?.value || todayDateInput()}T12:00:00`).toISOString(),
    deductFromProfit: qs("expenseDeductFromProfitInput")?.checked !== false,
    notes: qs("expenseNotesInput")?.value.trim() || "",
    createdAt: old?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  await withLoader("جاري حفظ المصروف...", async () => {
    await saveEntity("expenses", id, payload);
  });

  toggleModal("expenseModal", false);
  showToast("تم حفظ المصروف", "success");

  await renderExpenses();
  await renderReports();
  await renderDashboard();
}

async function editExpense(id) {
  const exp = await getEntity("expenses", id);

  if (!exp) {
    alert("المصروف غير موجود");
    return;
  }

  if (qs("editExpenseId")) qs("editExpenseId").value = exp.id || "";
  if (qs("expenseModalTitle")) qs("expenseModalTitle").innerText = "تعديل مصروف";
  if (qs("expenseTypeInput")) qs("expenseTypeInput").value = exp.type || "";
  if (qs("expenseAmountInput")) qs("expenseAmountInput").value = Number(exp.amount || 0);
  if (qs("expenseDateInput")) qs("expenseDateInput").value = toDateInput(exp.date || exp.createdAt);
  if (qs("expenseDeductFromProfitInput")) qs("expenseDeductFromProfitInput").checked = exp.deductFromProfit !== false;
  if (qs("expenseNotesInput")) qs("expenseNotesInput").value = exp.notes || "";

  toggleModal("expenseModal", true);
}

async function deleteExpense(id) {
  if (!confirm("حذف المصروف؟")) return;

  await withLoader("جاري حذف المصروف...", async () => {
    await deleteEntity("expenses", id);
  });

  showToast("تم حذف المصروف", "success");
  await renderExpenses();
  await renderReports();
  await renderDashboard();
}

async function filteredExpenses() {
  const range = qs("expensesRange")?.value || "day";
  const search = (qs("expensesSearch")?.value || "").toLowerCase().trim();
  const filter = qs("expensesProfitFilter")?.value || "all";

  const expenses = await getAllExpenses();

  return expenses
    .filter(e => e.storeId === currentStoreId)
    .filter(e => inRangeByFilter(e.date || e.createdAt, range))
    .filter(e => {
      const hay = `${e.type || ""} ${e.notes || ""}`.toLowerCase();
      return !search || hay.includes(search);
    })
    .filter(e => {
      if (filter === "deduct") return e.deductFromProfit !== false;
      if (filter === "noDeduct") return e.deductFromProfit === false;
      return true;
    })
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
}

async function renderExpenses() {
  const table = qs("expensesTable");
  if (!table) return;

  const rows = await filteredExpenses();

  table.innerHTML = "";

  if (!rows.length) {
    table.innerHTML = `
      <tr>
        <td colspan="6" class="p-8 text-center text-gray-400">
          لا توجد مصروفات
        </td>
      </tr>
    `;
  }

  let total = 0;
  let deduct = 0;

  rows.forEach(e => {
    total += Number(e.amount || 0);
    if (e.deductFromProfit !== false) deduct += Number(e.amount || 0);

    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4 text-xs text-gray-500">${formatDateTime(e.date || e.createdAt)}</td>
        <td class="p-4 font-black">${escapeHtml(e.type || "-")}</td>
        <td class="p-4 text-red-700 font-black">${money(e.amount || 0)}</td>
        <td class="p-4">
          <span class="status-pill ${e.deductFromProfit !== false ? "status-unpaid" : "status-paid"}">
            ${e.deductFromProfit !== false ? "نعم" : "لا"}
          </span>
        </td>
        <td class="p-4 text-xs">${escapeHtml(e.notes || "-")}</td>
        <td class="p-4">
          <div class="flex gap-2 flex-wrap">
            <button onclick="editExpense('${escapeJs(e.id)}')" class="text-blue-700 bg-blue-50 px-3 py-1 rounded-lg text-xs font-black">تعديل</button>
            <button onclick="deleteExpense('${escapeJs(e.id)}')" class="text-red-700 bg-red-50 px-3 py-1 rounded-lg text-xs font-black">حذف</button>
          </div>
        </td>
      </tr>
    `;
  });

  if (qs("expensesTotalAmount")) qs("expensesTotalAmount").innerText = money(total);
  if (qs("expensesDeductAmount")) qs("expensesDeductAmount").innerText = money(deduct);
  if (qs("expensesCount")) qs("expensesCount").innerText = rows.length;
}

async function buildExpensesReportHtml(range) {
  const rows = (await getAllExpenses())
    .filter(e => e.storeId === currentStoreId)
    .filter(e => inRangeByFilter(e.date || e.createdAt, range))
    .sort((a, b) => new Date(a.date || a.createdAt || 0) - new Date(b.date || b.createdAt || 0));

  let html = `
    <div class="report-print-page">
      <div class="report-title">تقرير المصروفات - ${escapeHtml(rangeLabel(range))}</div>
      <table class="report-table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>نوع المصروف</th>
            <th>المبلغ</th>
            <th>يخصم من الأرباح</th>
            <th>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
  `;

  rows.forEach(e => {
    html += `
      <tr>
        <td>${formatDateTime(e.date || e.createdAt)}</td>
        <td>${escapeHtml(e.type || "-")}</td>
        <td>${money(e.amount || 0)}</td>
        <td>${e.deductFromProfit !== false ? "نعم" : "لا"}</td>
        <td>${escapeHtml(e.notes || "-")}</td>
      </tr>
    `;
  });

  const total = rows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const deduct = rows
    .filter(e => e.deductFromProfit !== false)
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  html += `
        </tbody>
        <tfoot>
          <tr>
            <th colspan="2">الإجمالي</th>
            <th>${money(total)}</th>
            <th colspan="2">المخصوم من الأرباح: ${money(deduct)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  return html;
}

async function exportExpensesReport(type) {
  const range = qs("expensesRange")?.value || "day";
  const area = qs("expensesExportArea") || qs("globalReportExportArea");
  if (!area) return;

  await showLoader("جاري تجهيز تقرير المصروفات...");

  area.innerHTML = await buildExpensesReportHtml(range);
  area.classList.remove("hidden");

  try {
    await exportElementArea(area, type, `تقرير_المصروفات_${range}`);
  } finally {
    area.classList.add("hidden");
    hideLoader();
  }
}

window.openCustomerModal = openCustomerModal;
window.saveCustomer = saveCustomer;
window.deleteCustomer = deleteCustomer;
window.renderCustomers = renderCustomers;
window.openCustomerHistory = openCustomerHistory;
window.saveCustomerPayment = saveCustomerPayment;
window.sendDebtMessageToCustomer = sendDebtMessageToCustomer;
window.exportCustomersReport = exportCustomersReport;

window.openExpenseModal = openExpenseModal;
window.saveExpense = saveExpense;
window.editExpense = editExpense;
window.deleteExpense = deleteExpense;
window.renderExpenses = renderExpenses;
window.exportExpensesReport = exportExpensesReport;
async function getFinanceRows(range, customDate = "") {
  const [invoices, expenses, supplierPayments, accounts] = await Promise.all([
    getAllInvoices(),
    getAllExpenses(),
    getAllSupplierPayments(),
    getTransferAccounts()
  ]);

  const invRows = invoices
    .filter(inv => inv.storeId === currentStoreId)
    .filter(inv => inRangeByFilter(inv.date || inv.createdAt, range, customDate));

  const expRows = expenses
    .filter(e => e.storeId === currentStoreId)
    .filter(e => inRangeByFilter(e.date || e.createdAt, range, customDate));

  const spRows = supplierPayments
    .filter(p => p.storeId === currentStoreId)
    .filter(p => inRangeByFilter(p.date || p.createdAt, range, customDate));

  return {
    invoices: invRows,
    expenses: expRows,
    supplierPayments: spRows,
    accounts
  };
}

function invoiceCostTotal(inv) {
  if (Number(inv.totalCost || 0) > 0) return Number(inv.totalCost || 0);

  return (inv.items || []).reduce((sum, item) => {
    return sum + (Number(item.cost || 0) * Number(item.qty || 0));
  }, 0);
}

function invoiceItemsProfitMap(invoices) {
  const map = new Map();

  invoices.forEach(inv => {
    (inv.items || []).forEach(item => {
      const key = item.name || "غير محدد";

      if (!map.has(key)) {
        map.set(key, {
          name: key,
          qty: 0,
          sales: 0,
          cost: 0,
          profit: 0
        });
      }

      const row = map.get(key);
      const qty = Number(item.qty || 0);
      const sales = Number(item.price || 0) * qty;
      const cost = Number(item.cost || 0) * qty;

      row.qty += qty;
      row.sales += sales;
      row.cost += cost;
      row.profit += sales - cost;
    });
  });

  return [...map.values()].sort((a, b) => b.profit - a.profit);
}

function accountKeyFromParts(type, name, number) {
  return `${String(type || "").trim()}|||${String(name || "").trim()}|||${String(number || "").trim()}`;
}

function buildAccountBalances(invoices, supplierPayments, accounts) {
  const map = new Map();

  accounts.forEach(acc => {
    const key = accountKeyFromParts(acc.type, acc.owner, acc.number);
    map.set(key, {
      type: acc.type || "-",
      name: acc.owner || "-",
      number: acc.number || "",
      balance: Number(acc.openingBalance || 0)
    });
  });

  invoices.forEach(inv => {
    const type = inv.transferAccountType || "";
    const name = inv.transferAccountName || "";
    const number = inv.transferAccountNumber || "";

    if (!type && !name && !number) return;

    const key = accountKeyFromParts(type, name, number);

    if (!map.has(key)) {
      map.set(key, {
        type: type || "-",
        name: name || "-",
        number: number || "",
        balance: 0
      });
    }

    const paidLike = (inv.status || "paid") === "paid" || (inv.status || "") === "pending";
    if (paidLike) {
      map.get(key).balance += Number(inv.total || 0);
    }
  });

  supplierPayments.forEach(p => {
    const type = p.transferAccountType || "";
    const name = p.transferAccountName || "";
    const number = p.transferAccountNumber || "";

    if (!type && !name && !number) return;

    const key = accountKeyFromParts(type, name, number);

    if (!map.has(key)) {
      map.set(key, {
        type: type || "-",
        name: name || "-",
        number: number || "",
        balance: 0
      });
    }

    map.get(key).balance -= Number(p.amount || 0);
  });

  return [...map.values()].sort((a, b) => b.balance - a.balance);
}

function buildPaymentMethodsSummary(invoices) {
  const map = new Map();

  invoices.forEach(inv => {
    const key = inv.payment || "cash";

    if (!map.has(key)) {
      map.set(key, {
        payment: key,
        count: 0,
        total: 0
      });
    }

    const row = map.get(key);
    row.count++;
    row.total += Number(inv.total || 0);
  });

  return [...map.values()].sort((a, b) => b.total - a.total);
}

async function renderReports() {
  const range = qs("reportFilter")?.value || "day";
  const customDate = qs("reportCustomDate")?.value || "";

  await withLoader("جاري تحميل التقارير...", async () => {
    const { invoices, expenses, supplierPayments, accounts } = await getFinanceRows(range, customDate);

    const totalSales = invoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
    const totalCost = invoices.reduce((s, inv) => s + invoiceCostTotal(inv), 0);
    const grossProfit = totalSales - totalCost;

    const deductExpenses = expenses
      .filter(e => e.deductFromProfit !== false)
      .reduce((s, e) => s + Number(e.amount || 0), 0);

    const allExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const netProfit = grossProfit - deductExpenses;

    if (qs("repTotalSales")) qs("repTotalSales").innerText = money(totalSales);
    if (qs("repWholesaleSales")) qs("repWholesaleSales").innerText = money(totalCost);
    if (qs("repGrossProfit")) qs("repGrossProfit").innerText = money(grossProfit);
    if (qs("repExpenses")) qs("repExpenses").innerText = money(allExpenses);
    if (qs("repTotalProfit")) qs("repTotalProfit").innerText = money(netProfit);
    if (qs("repCount")) qs("repCount").innerText = invoices.length;

    const balanceRows = buildAccountBalances(invoices, supplierPayments, accounts);
    const balanceTable = qs("accountsBalanceTable");

    if (balanceTable) {
      balanceTable.innerHTML = "";

      if (!balanceRows.length) {
        balanceTable.innerHTML = `
          <tr>
            <td colspan="4" class="p-8 text-center text-gray-400">
              لا توجد حسابات أو أرصدة
            </td>
          </tr>
        `;
      }

      balanceRows.forEach(row => {
        balanceTable.innerHTML += `
          <tr class="border-b">
            <td class="p-4 font-black">${escapeHtml(row.name || "-")}</td>
            <td class="p-4">${escapeHtml(row.type || "-")}</td>
            <td class="p-4 text-xs">${escapeHtml(row.number || "-")}</td>
            <td class="p-4 font-black ${Number(row.balance || 0) >= 0 ? "text-green-700" : "text-red-700"}">
              ${money(row.balance || 0)}
            </td>
          </tr>
        `;
      });
    }

    const paymentRows = buildPaymentMethodsSummary(invoices);
    const paymentTable = qs("paymentMethodsSummaryTable");

    if (paymentTable) {
      paymentTable.innerHTML = "";

      if (!paymentRows.length) {
        paymentTable.innerHTML = `
          <tr>
            <td colspan="3" class="p-8 text-center text-gray-400">
              لا توجد عمليات دفع
            </td>
          </tr>
        `;
      }

      paymentRows.forEach(row => {
        paymentTable.innerHTML += `
          <tr class="border-b">
            <td class="p-4 font-black">${escapeHtml(paymentLabel(row.payment))}</td>
            <td class="p-4">${Number(row.count || 0)}</td>
            <td class="p-4 font-black text-blue-700">${money(row.total || 0)}</td>
          </tr>
        `;
      });
    }

    const profitRows = invoiceItemsProfitMap(invoices);
    const profitTable = qs("profitByItemTable");

    if (profitTable) {
      profitTable.innerHTML = "";

      if (!profitRows.length) {
        profitTable.innerHTML = `
          <tr>
            <td colspan="5" class="p-8 text-center text-gray-400">
              لا توجد مبيعات أصناف
            </td>
          </tr>
        `;
      }

      profitRows.forEach(row => {
        profitTable.innerHTML += `
          <tr class="border-b">
            <td class="p-4 font-black">${escapeHtml(row.name || "-")}</td>
            <td class="p-4">${Number(row.qty || 0)}</td>
            <td class="p-4 text-blue-700 font-black">${money(row.sales || 0)}</td>
            <td class="p-4 text-slate-700 font-black">${money(row.cost || 0)}</td>
            <td class="p-4 font-black ${Number(row.profit || 0) >= 0 ? "text-green-700" : "text-red-700"}">
              ${money(row.profit || 0)}
            </td>
          </tr>
        `;
      });
    }
  });
}

async function buildFinanceReportHtml(range, customDate = "") {
  const store = await idbGet("stores", currentStoreId);
  const { invoices, expenses, supplierPayments, accounts } = await getFinanceRows(range, customDate);

  const totalSales = invoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
  const totalCost = invoices.reduce((s, inv) => s + invoiceCostTotal(inv), 0);
  const grossProfit = totalSales - totalCost;

  const allExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const deductExpenses = expenses
    .filter(e => e.deductFromProfit !== false)
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  const netProfit = grossProfit - deductExpenses;

  const balanceRows = buildAccountBalances(invoices, supplierPayments, accounts);
  const paymentRows = buildPaymentMethodsSummary(invoices);
  const profitRows = invoiceItemsProfitMap(invoices);

  let html = `
    <div class="report-print-page">
      <div class="flex justify-between items-center mb-4">
        <div>
          <div class="report-title">التقرير المالي - ${escapeHtml(rangeLabel(range, customDate))}</div>
          <div class="text-sm text-gray-500">${escapeHtml(store?.name || "المحل")}</div>
        </div>
        <div class="text-sm text-gray-500">${new Date().toLocaleString("ar-EG")}</div>
      </div>

      <table class="report-table mb-5">
        <thead>
          <tr>
            <th>إجمالي المبيعات</th>
            <th>تكلفة البضاعة</th>
            <th>إجمالي الربح</th>
            <th>المصروفات</th>
            <th>المخصوم من الربح</th>
            <th>صافي الربح</th>
            <th>عدد العمليات</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${money(totalSales)}</td>
            <td>${money(totalCost)}</td>
            <td>${money(grossProfit)}</td>
            <td>${money(allExpenses)}</td>
            <td>${money(deductExpenses)}</td>
            <td>${money(netProfit)}</td>
            <td>${invoices.length}</td>
          </tr>
        </tbody>
      </table>

      <div class="report-date-title">الرصيد المتوفر حسب البنك / المحفظة</div>
      <table class="report-table mb-5">
        <thead>
          <tr>
            <th>الحساب</th>
            <th>نوع الحساب</th>
            <th>رقم التحويل</th>
            <th>الرصيد</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (!balanceRows.length) {
    html += `<tr><td colspan="4">لا توجد أرصدة</td></tr>`;
  }

  balanceRows.forEach(row => {
    html += `
      <tr>
        <td>${escapeHtml(row.name || "-")}</td>
        <td>${escapeHtml(row.type || "-")}</td>
        <td>${escapeHtml(row.number || "-")}</td>
        <td>${money(row.balance || 0)}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>

      <div class="report-date-title">ملخص طرق الدفع</div>
      <table class="report-table mb-5">
        <thead>
          <tr>
            <th>طريقة الدفع</th>
            <th>عدد العمليات</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (!paymentRows.length) {
    html += `<tr><td colspan="3">لا توجد طرق دفع</td></tr>`;
  }

  paymentRows.forEach(row => {
    html += `
      <tr>
        <td>${escapeHtml(paymentLabel(row.payment))}</td>
        <td>${row.count}</td>
        <td>${money(row.total)}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>

      <div class="report-date-title">تقرير المرابح حسب الصنف</div>
      <table class="report-table">
        <thead>
          <tr>
            <th>الصنف</th>
            <th>الكمية المباعة</th>
            <th>إجمالي البيع</th>
            <th>إجمالي التكلفة</th>
            <th>الربح</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (!profitRows.length) {
    html += `<tr><td colspan="5">لا توجد مرابح أصناف</td></tr>`;
  }

  profitRows.forEach(row => {
    html += `
      <tr>
        <td>${escapeHtml(row.name || "-")}</td>
        <td>${row.qty}</td>
        <td>${money(row.sales)}</td>
        <td>${money(row.cost)}</td>
        <td>${money(row.profit)}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  return html;
}

async function exportFinanceReport(type) {
  const range = qs("reportFilter")?.value || "day";
  const customDate = qs("reportCustomDate")?.value || "";
  const area = qs("financeReportExportArea") || qs("globalReportExportArea");

  if (!area) return;

  await showLoader("جاري تجهيز التقرير المالي...");

  area.innerHTML = await buildFinanceReportHtml(range, customDate);
  area.classList.remove("hidden");

  try {
    await exportElementArea(area, type, `التقرير_المالي_${range}`);
  } finally {
    area.classList.add("hidden");
    hideLoader();
  }
}

async function getShortageRows() {
  const search = (qs("shortageSearch")?.value || "").toLowerCase().trim();
  const cat = qs("shortageCategoryFilter")?.value || "all";
  const fallbackLimit = Number(qs("shortageLimitInput")?.value || getLocalSettings().lowStockDefault || 5);

  const products = await getAllProducts();

  return products
    .filter(p => p.storeId === currentStoreId)
    .filter(p => {
      const hay = `${p.name || ""} ${p.category || ""} ${p.supplier || ""} ${p.code || ""}`.toLowerCase();
      return !search || hay.includes(search);
    })
    .filter(p => cat === "all" || (p.category || "") === cat)
    .filter(p => {
      const limit = Number(p.lowStockLimit ?? fallbackLimit);
      return Number(p.stock || 0) <= limit;
    })
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
}

async function renderShortages() {
  const table = qs("shortagesTable");
  if (!table) return;

  const rows = await getShortageRows();
  const fallbackLimit = Number(qs("shortageLimitInput")?.value || getLocalSettings().lowStockDefault || 5);

  table.innerHTML = "";

  if (!rows.length) {
    table.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-gray-400">
          لا توجد بضاعة ناقصة
        </td>
      </tr>
    `;
  }

  let emptyCount = 0;
  let lowCount = 0;

  rows.forEach(p => {
    const stock = Number(p.stock || 0);
    const limit = Number(p.lowStockLimit ?? fallbackLimit);
    const empty = stock <= 0;

    if (empty) emptyCount++;
    else lowCount++;

    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4 font-black">${escapeHtml(p.name || "-")}</td>
        <td class="p-4">${escapeHtml(p.category || "-")}</td>
        <td class="p-4">${escapeHtml(p.supplier || "-")}</td>
        <td class="p-4">${escapeHtml(p.baseUnitName || unitTypeDefaultBase(p.unitType || "piece"))}</td>
        <td class="p-4 font-black ${empty ? "text-red-700" : "text-orange-700"}">${stock}</td>
        <td class="p-4">${limit}</td>
        <td class="p-4">
          <span class="status-pill ${empty ? "status-unpaid" : "status-pending"}">
            ${empty ? "نفد" : "ناقص"}
          </span>
        </td>
        <td class="p-4">
          <button onclick="editProduct('${escapeJs(p.id)}')" class="text-blue-700 bg-blue-50 px-3 py-1 rounded-lg text-xs font-black">
            تعديل
          </button>
        </td>
      </tr>
    `;
  });

  if (qs("shortageEmptyCount")) qs("shortageEmptyCount").innerText = emptyCount;
  if (qs("shortageLowCount")) qs("shortageLowCount").innerText = lowCount;
  if (qs("shortageTotalItems")) qs("shortageTotalItems").innerText = rows.length;
}

async function buildShortageReportHtml(range) {
  const store = await idbGet("stores", currentStoreId);
  const rows = await getShortageRows();

  let html = `
    <div class="report-print-page">
      <div class="flex justify-between items-center mb-4">
        <div>
          <div class="report-title">تقرير البضاعة الناقصة - ${escapeHtml(rangeLabel(range))}</div>
          <div class="text-sm text-gray-500">${escapeHtml(store?.name || "المحل")}</div>
        </div>
        <div class="text-sm text-gray-500">${new Date().toLocaleString("ar-EG")}</div>
      </div>

      <table class="report-table">
        <thead>
          <tr>
            <th>الصنف</th>
            <th>التصنيف</th>
            <th>المورد</th>
            <th>الوحدة</th>
            <th>المتوفر</th>
            <th>حد النقص</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (!rows.length) {
    html += `<tr><td colspan="7">لا توجد بضاعة ناقصة</td></tr>`;
  }

  rows.forEach(p => {
    const limit = Number(p.lowStockLimit ?? getLocalSettings().lowStockDefault ?? 5);
    const stock = Number(p.stock || 0);

    html += `
      <tr>
        <td>${escapeHtml(p.name || "-")}</td>
        <td>${escapeHtml(p.category || "-")}</td>
        <td>${escapeHtml(p.supplier || "-")}</td>
        <td>${escapeHtml(p.baseUnitName || unitTypeDefaultBase(p.unitType || "piece"))}</td>
        <td>${stock}</td>
        <td>${limit}</td>
        <td>${stock <= 0 ? "نفد" : "ناقص"}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  return html;
}

async function exportShortageReport(type) {
  const range = qs("shortageRange")?.value || "day";
  const area = qs("shortageReportExportArea") || qs("globalReportExportArea");

  if (!area) return;

  await showLoader("جاري تجهيز تقرير النواقص...");

  area.innerHTML = await buildShortageReportHtml(range);
  area.classList.remove("hidden");

  try {
    await exportElementArea(area, type, `تقرير_البضاعة_الناقصة_${range}`);
  } finally {
    area.classList.add("hidden");
    hideLoader();
  }
}

async function buildDashboardAlerts() {
  const alerts = [];

  const products = await getAllProducts();
  const customers = await getAllCustomers();
  const expenses = await getAllExpenses();

  const shortageProducts = products.filter(p => {
    if (p.storeId !== currentStoreId) return false;
    const limit = Number(p.lowStockLimit ?? getLocalSettings().lowStockDefault ?? 5);
    return Number(p.stock || 0) <= limit;
  });

  if (shortageProducts.length) {
    alerts.push({
      icon: "triangle-alert",
      title: "نقص مخزون",
      text: `يوجد ${shortageProducts.length} صنف ناقص أو نفد من المخزون`,
      cls: "bg-orange-50 text-orange-700"
    });
  }

  let lateDebtCount = 0;

  for (const c of customers.filter(x => x.storeId === currentStoreId)) {
    const stats = await calculateCustomerStats(c);
    if (isLateDue(c) && stats.remaining > 0) lateDebtCount++;
  }

  if (lateDebtCount) {
    alerts.push({
      icon: "clock-alert",
      title: "ديون متأخرة",
      text: `يوجد ${lateDebtCount} عميل عليه دين متأخر`,
      cls: "bg-red-50 text-red-700"
    });
  }

  const todayExpenses = expenses
    .filter(e => e.storeId === currentStoreId)
    .filter(e => inRangeByFilter(e.date || e.createdAt, "day"))
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  if (todayExpenses > 0) {
    alerts.push({
      icon: "wallet-cards",
      title: "مصروفات اليوم",
      text: `مصروفات اليوم وصلت إلى ${money(todayExpenses)}`,
      cls: "bg-blue-50 text-blue-700"
    });
  }

  return alerts;
}

async function renderDashboard() {
  const [invoices, expenses, products, customers] = await Promise.all([
    getAllInvoices(),
    getAllExpenses(),
    getAllProducts(),
    getAllCustomers()
  ]);

  const todayInvoices = invoices
    .filter(inv => inv.storeId === currentStoreId)
    .filter(inv => inRangeByFilter(inv.date || inv.createdAt, "day"));

  const todayExpenses = expenses
    .filter(e => e.storeId === currentStoreId)
    .filter(e => inRangeByFilter(e.date || e.createdAt, "day"));

  const todaySales = todayInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
  const todayCost = todayInvoices.reduce((s, inv) => s + invoiceCostTotal(inv), 0);
  const todayExp = todayExpenses
    .filter(e => e.deductFromProfit !== false)
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  let debtTotal = 0;

  for (const c of customers.filter(x => x.storeId === currentStoreId)) {
    const stats = await calculateCustomerStats(c);
    debtTotal += Number(stats.remaining || 0);
  }

  const shortageCount = products.filter(p => {
    if (p.storeId !== currentStoreId) return false;
    const limit = Number(p.lowStockLimit ?? getLocalSettings().lowStockDefault ?? 5);
    return Number(p.stock || 0) <= limit;
  }).length;

  if (qs("dashTodaySales")) qs("dashTodaySales").innerText = money(todaySales);
  if (qs("dashTodayProfit")) qs("dashTodayProfit").innerText = money(todaySales - todayCost - todayExp);
  if (qs("dashTodayExpenses")) qs("dashTodayExpenses").innerText = money(todayExp);
  if (qs("dashCustomerDebt")) qs("dashCustomerDebt").innerText = money(debtTotal);
  if (qs("dashShortageCount")) qs("dashShortageCount").innerText = shortageCount;

  const grid = qs("dashboardProductsGrid");

  if (grid) {
    grid.innerHTML = "";

    const quickProducts = products
      .filter(p => p.storeId === currentStoreId)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
      .slice(0, 8);

    if (!quickProducts.length) {
      grid.innerHTML = `
        <div class="col-span-full p-8 text-center text-gray-400 bg-gray-50 rounded-2xl">
          لا توجد أصناف بعد
        </div>
      `;
    }

    quickProducts.forEach(p => {
      grid.innerHTML += productGridCardHtml(p, "dashboard");
    });
  }

  const alertsBox = qs("dashboardAlerts");

  if (alertsBox) {
    const alerts = await buildDashboardAlerts();

    alertsBox.innerHTML = "";

    if (!alerts.length) {
      alertsBox.innerHTML = `
        <div class="p-4 rounded-2xl bg-gray-50 text-gray-500 text-sm text-center">
          لا توجد تنبيهات حالياً
        </div>
      `;
    }

    alerts.forEach(alertItem => {
      alertsBox.innerHTML += `
        <div class="p-4 rounded-2xl ${alertItem.cls}">
          <div class="flex items-start gap-3">
            <i data-lucide="${alertItem.icon}" class="mt-1"></i>
            <div>
              <div class="font-black">${escapeHtml(alertItem.title)}</div>
              <div class="text-sm mt-1">${escapeHtml(alertItem.text)}</div>
            </div>
          </div>
        </div>
      `;
    });
  }

  lucide.createIcons();
}

window.renderReports = renderReports;
window.exportFinanceReport = exportFinanceReport;
window.renderShortages = renderShortages;
window.exportShortageReport = exportShortageReport;
window.renderDashboard = renderDashboard;
async function buildBackupPayload() {
  const [
    stores,
    products,
    invoices,
    purchases,
    supplierPayments,
    customers,
    customerPayments,
    expenses,
    settings,
    transferAccounts,
    paymentMethods,
    counter
  ] = await Promise.all([
    getAllStores(),
    getAllProducts(),
    getAllInvoices(),
    getAllPurchases(),
    getAllSupplierPayments(),
    getAllCustomers(),
    getAllCustomerPayments(),
    getAllExpenses(),
    getClientSettings(),
    getTransferAccounts(),
    getPaymentMethods(),
    idbGet("meta", "invoiceCounter")
  ]);

  return {
    backupVersion: BACKUP_VERSION,
    createdAt: nowIso(),
    key: currentLicenseKey(),
    currentStoreId,
    settings,
    transferAccounts,
    paymentMethods,
    invoiceCounter: counter || { id: "invoiceCounter", value: 0 },
    stores,
    products,
    invoices,
    purchases,
    supplierPayments,
    customers,
    customerPayments,
    expenses
  };
}

async function downloadBackupFile() {
  if (!currentLicenseKey()) return;

  await withLoader("جاري تجهيز النسخة الاحتياطية...", async () => {
    const payload = await buildBackupPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `backup_${sanitizeKey(currentLicenseKey())}_${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
  });

  showToast("تم تنزيل النسخة الاحتياطية", "success");
}

async function saveCloudBackup() {
  const session = getLocalSession();

  if (!currentLicenseKey()) return;

  if (!isOnline() || session?.appMode !== "online") {
    alert("هذه العملية تحتاج نسخة أونلاين وإنترنت");
    return;
  }

  await withLoader("جاري حفظ النسخة الاحتياطية السحابية...", async () => {
    const payload = await buildBackupPayload();
    const backupId = `backup_${Date.now()}`;
    await set(ref(db, `${pathClientBackups()}/${backupId}`), payload);
  });

  showToast("تم حفظ النسخة السحابية", "success");
}

async function restoreBackupFromFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    await withLoader("جاري استعادة النسخة الاحتياطية...", async () => {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data || !data.backupVersion) {
        throw new Error("ملف غير صالح");
      }

      if (data.key && data.key !== currentLicenseKey()) {
        const ok = confirm("هذه النسخة مرتبطة بمفتاح مختلف. هل تريد المتابعة؟");
        if (!ok) return;
      }

      await restoreBackupPayload(data);
    });

    showToast("تمت استعادة النسخة بنجاح", "success");
    await bootSessionState();
  } catch (err) {
    console.error(err);
    alert("تعذر استعادة النسخة الاحتياطية");
  } finally {
    event.target.value = "";
  }
}

async function restoreBackupPayload(data) {
  await idbClear("stores");
  await idbClear("products");
  await idbClear("invoices");
  await idbClear("purchases");
  await idbClear("supplierPayments");
  await idbClear("customers");
  await idbClear("customerPayments");
  await idbClear("expenses");

  for (const s of (data.stores || [])) await idbSet("stores", s);
  for (const p of (data.products || [])) await idbSet("products", p);
  for (const inv of (data.invoices || [])) await idbSet("invoices", inv);
  for (const pur of (data.purchases || [])) await idbSet("purchases", pur);
  for (const sp of (data.supplierPayments || [])) await idbSet("supplierPayments", sp);
  for (const c of (data.customers || [])) await idbSet("customers", c);
  for (const cp of (data.customerPayments || [])) await idbSet("customerPayments", cp);
  for (const e of (data.expenses || [])) await idbSet("expenses", e);

  if (data.settings) {
    await idbSet("meta", { id: "settings", ...data.settings });
    setLocalSettings(data.settings);
  }

  if (data.transferAccounts) {
    await setTransferAccounts(data.transferAccounts);
  }

  if (data.paymentMethods) {
    await setPaymentMethods(data.paymentMethods);
  }

  const maxInvoiceId = Math.max(0, ...(data.invoices || []).map(i => Number(i.id) || 0));
  const counterValue = Number(data.invoiceCounter?.value || maxInvoiceId || 0);
  await idbSet("meta", { id: "invoiceCounter", value: Math.max(counterValue, maxInvoiceId) });

  if (data.currentStoreId) {
    currentStoreId = data.currentStoreId;
    localStorage.setItem("activeStoreId", currentStoreId);
  }

  if (isOnline() && getLocalSession()?.appMode === "online") {
    await uploadOfflineDataToCloud();
  }
}

async function downloadOfflinePackage() {
  const session = getLocalSession();

  if (!isOnline() || session?.appMode !== "online") {
    alert("هذه العملية تحتاج نسخة أونلاين وإنترنت");
    return;
  }

  await withLoader("جاري تجهيز حزمة الأوفلاين...", async () => {
    await syncCloudToOffline();

    const payload = {
      packageType: "offline-sync-package",
      createdAt: nowIso(),
      key: currentLicenseKey(),
      session,
      data: await buildBackupPayload()
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `offline_package_${sanitizeKey(currentLicenseKey())}_${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
  });

  showToast("تم تنزيل حزمة الأوفلاين", "success");
}

async function importOfflinePackage(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    await withLoader("جاري استيراد حزمة الأوفلاين...", async () => {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data || data.packageType !== "offline-sync-package" || !data.data) {
        throw new Error("ملف غير صالح");
      }

      await restoreBackupPayload(data.data);
    });

    showToast("تم استيراد الحزمة", "success");
    await bootSessionState();
  } catch (err) {
    console.error(err);
    alert("تعذر استيراد الحزمة");
  } finally {
    event.target.value = "";
  }
}

async function uploadOfflineDataToCloud() {
  const session = getLocalSession();

  if (!session || session.appMode !== "online") {
    alert("هذه الميزة متاحة فقط لمفاتيح الأونلاين");
    return;
  }

  if (!isOnline()) {
    alert("هذه العملية تحتاج إنترنت");
    return;
  }

  await withLoader("جاري رفع البيانات إلى السحابة...", async () => {
    const [
      stores,
      products,
      invoices,
      purchases,
      supplierPayments,
      customers,
      customerPayments,
      expenses,
      settings,
      counter
    ] = await Promise.all([
      getAllStores(),
      getAllProducts(),
      getAllInvoices(),
      getAllPurchases(),
      getAllSupplierPayments(),
      getAllCustomers(),
      getAllCustomerPayments(),
      getAllExpenses(),
      idbGet("meta", "settings"),
      idbGet("meta", "invoiceCounter")
    ]);

    for (const s of stores) await set(ref(db, `${pathClientStores()}/${s.id}`), s);
    for (const p of products) await set(ref(db, `${pathClientProducts()}/${p.id}`), p);
    for (const i of invoices) await set(ref(db, `${pathClientInvoices()}/${i.id}`), i);
    for (const p of purchases) await set(ref(db, `${pathClientPurchases()}/${p.id}`), p);
    for (const sp of supplierPayments) await set(ref(db, `${pathClientSupplierPayments()}/${sp.id}`), sp);
    for (const c of customers) await set(ref(db, `${pathClientCustomers()}/${c.id}`), c);
    for (const cp of customerPayments) await set(ref(db, `${pathClientCustomerPayments()}/${cp.id}`), cp);
    for (const e of expenses) await set(ref(db, `${pathClientExpenses()}/${e.id}`), e);

    if (settings) {
      await update(ref(db, pathClientSettings()), {
        currencyName: settings.currencyName || "شيكل",
        currencySymbol: settings.currencySymbol || "₪",
        paymentInfo: settings.paymentInfo || "",
        appMode: "online",
        expensesDeductDefault: settings.expensesDeductDefault !== false,
        lowStockDefault: Number(settings.lowStockDefault || 5),
        paymentMethods: settings.paymentMethods || [],
        transferAccounts: settings.transferAccounts || [],
        updatedAt: nowIso()
      });
    }

    if (counter?.value != null) {
      await set(ref(db, `${pathClientCounters()}/invoiceAutoNumber`), Number(counter.value || 0));
    }
  });

  showToast("تم رفع بيانات الأوفلاين إلى السحابة", "success");
}

async function syncCloudToOffline() {
  const session = getLocalSession();
  if (!isOnline() || session?.appMode !== "online" || !baseClientPath()) return;

  const [
    storesSnap,
    productsSnap,
    invoicesSnap,
    purchasesSnap,
    supplierPaymentsSnap,
    customersSnap,
    customerPaymentsSnap,
    expensesSnap,
    settingsSnap,
    counterSnap
  ] = await Promise.all([
    get(ref(db, pathClientStores())),
    get(ref(db, pathClientProducts())),
    get(ref(db, pathClientInvoices())),
    get(ref(db, pathClientPurchases())),
    get(ref(db, pathClientSupplierPayments())),
    get(ref(db, pathClientCustomers())),
    get(ref(db, pathClientCustomerPayments())),
    get(ref(db, pathClientExpenses())),
    get(ref(db, pathClientSettings())),
    get(ref(db, `${pathClientCounters()}/invoiceAutoNumber`))
  ]);

  const stores = storesSnap.exists() ? Object.values(storesSnap.val() || {}) : [];
  const products = productsSnap.exists() ? Object.values(productsSnap.val() || {}) : [];
  const invoices = invoicesSnap.exists() ? Object.values(invoicesSnap.val() || {}) : [];
  const purchases = purchasesSnap.exists() ? Object.values(purchasesSnap.val() || {}) : [];
  const supplierPayments = supplierPaymentsSnap.exists() ? Object.values(supplierPaymentsSnap.val() || {}) : [];
  const customers = customersSnap.exists() ? Object.values(customersSnap.val() || {}) : [];
  const customerPayments = customerPaymentsSnap.exists() ? Object.values(customerPaymentsSnap.val() || {}) : [];
  const expenses = expensesSnap.exists() ? Object.values(expensesSnap.val() || {}) : [];
  const settings = settingsSnap.exists() ? settingsSnap.val() : {};
  const counter = counterSnap.exists() ? Number(counterSnap.val()) : 0;

  await idbClear("stores");
  await idbClear("products");
  await idbClear("invoices");
  await idbClear("purchases");
  await idbClear("supplierPayments");
  await idbClear("customers");
  await idbClear("customerPayments");
  await idbClear("expenses");

  for (const s of stores) await idbSet("stores", s);
  for (const p of products) await idbSet("products", p);
  for (const i of invoices) await idbSet("invoices", i);
  for (const p of purchases) await idbSet("purchases", p);
  for (const sp of supplierPayments) await idbSet("supplierPayments", sp);
  for (const c of customers) await idbSet("customers", c);
  for (const cp of customerPayments) await idbSet("customerPayments", cp);
  for (const e of expenses) await idbSet("expenses", e);

  await idbSet("meta", {
    id: "settings",
    currencyName: settings?.currencyName || "شيكل",
    currencySymbol: settings?.currencySymbol || "₪",
    paymentInfo: settings?.paymentInfo || "",
    appMode: session?.appMode || "online",
    expensesDeductDefault: settings?.expensesDeductDefault !== false,
    lowStockDefault: Number(settings?.lowStockDefault || 5),
    paymentMethods: Array.isArray(settings?.paymentMethods) ? settings.paymentMethods : defaultPaymentMethods(),
    transferAccounts: Array.isArray(settings?.transferAccounts) ? settings.transferAccounts : []
  });

  await idbSet("meta", { id: "invoiceCounter", value: counter });

  await ensureClientDefaults();
}

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_OFFLINE_DB_NAME, LOCAL_OFFLINE_DB_VERSION);

    req.onupgradeneeded = () => {
      const dbx = req.result;

      if (!dbx.objectStoreNames.contains("stores")) dbx.createObjectStore("stores", { keyPath: "id" });
      if (!dbx.objectStoreNames.contains("products")) dbx.createObjectStore("products", { keyPath: "id" });
      if (!dbx.objectStoreNames.contains("invoices")) dbx.createObjectStore("invoices", { keyPath: "id" });
      if (!dbx.objectStoreNames.contains("purchases")) dbx.createObjectStore("purchases", { keyPath: "id" });
      if (!dbx.objectStoreNames.contains("supplierPayments")) dbx.createObjectStore("supplierPayments", { keyPath: "id" });
      if (!dbx.objectStoreNames.contains("customers")) dbx.createObjectStore("customers", { keyPath: "id" });
      if (!dbx.objectStoreNames.contains("customerPayments")) dbx.createObjectStore("customerPayments", { keyPath: "id" });
      if (!dbx.objectStoreNames.contains("expenses")) dbx.createObjectStore("expenses", { keyPath: "id" });
      if (!dbx.objectStoreNames.contains("meta")) dbx.createObjectStore("meta", { keyPath: "id" });
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(storeName, id) {
  const dbx = await openOfflineDb();

  return new Promise((resolve, reject) => {
    const tx = dbx.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(id);

    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll(storeName) {
  const dbx = await openOfflineDb();

  return new Promise((resolve, reject) => {
    const tx = dbx.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(storeName, value) {
  const dbx = await openOfflineDb();

  return new Promise((resolve, reject) => {
    const tx = dbx.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(value);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(storeName, id) {
  const dbx = await openOfflineDb();

  return new Promise((resolve, reject) => {
    const tx = dbx.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbClear(storeName) {
  const dbx = await openOfflineDb();

  return new Promise((resolve, reject) => {
    const tx = dbx.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).clear();

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getEntity(kind, id) {
  return await idbGet(kind, id);
}

async function saveEntity(kind, id, payload) {
  const finalPayload = {
    ...payload,
    id,
    updatedAt: nowIso()
  };

  await idbSet(kind, finalPayload);

  const session = getLocalSession();

  if (isOnline() && session?.appMode === "online") {
    const pathMap = {
      stores: pathClientStores(),
      products: pathClientProducts(),
      invoices: pathClientInvoices(),
      purchases: pathClientPurchases(),
      supplierPayments: pathClientSupplierPayments(),
      customers: pathClientCustomers(),
      customerPayments: pathClientCustomerPayments(),
      expenses: pathClientExpenses()
    };

    if (pathMap[kind]) {
      await set(ref(db, `${pathMap[kind]}/${id}`), finalPayload);
    }
  }
}

async function deleteEntity(kind, id) {
  await idbDelete(kind, id);

  const session = getLocalSession();

  if (isOnline() && session?.appMode === "online") {
    const pathMap = {
      stores: pathClientStores(),
      products: pathClientProducts(),
      invoices: pathClientInvoices(),
      purchases: pathClientPurchases(),
      supplierPayments: pathClientSupplierPayments(),
      customers: pathClientCustomers(),
      customerPayments: pathClientCustomerPayments(),
      expenses: pathClientExpenses()
    };

    if (pathMap[kind]) {
      await remove(ref(db, `${pathMap[kind]}/${id}`));
    }
  }
}

async function getAllStores() {
  return await idbGetAll("stores");
}

async function getAllProducts() {
  return await idbGetAll("products");
}

async function getAllInvoices() {
  return await idbGetAll("invoices");
}

async function getAllPurchases() {
  return await idbGetAll("purchases");
}

async function getAllSupplierPayments() {
  return await idbGetAll("supplierPayments");
}

async function getAllCustomers() {
  return await idbGetAll("customers");
}

async function getAllCustomerPayments() {
  return await idbGetAll("customerPayments");
}

async function getAllExpenses() {
  return await idbGetAll("expenses");
}

window.buildBackupPayload = buildBackupPayload;
window.downloadBackupFile = downloadBackupFile;
window.saveCloudBackup = saveCloudBackup;
window.restoreBackupFromFile = restoreBackupFromFile;
window.downloadOfflinePackage = downloadOfflinePackage;
window.importOfflinePackage = importOfflinePackage;
window.uploadOfflineDataToCloud = uploadOfflineDataToCloud;
function bindBaseEvents() {
  qs("loginBtn")?.addEventListener("click", handleLicenseLogin);
  qs("goToLoginBtn")?.addEventListener("click", goToLoginFromExpired);

  qs("licenseKeyInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") handleLicenseLogin();
  });

  qs("openMobileMenuBtn")?.addEventListener("click", openMobileMenu);
  qs("closeMobileMenuBtn")?.addEventListener("click", closeMobileMenu);
  qs("sideBackdrop")?.addEventListener("click", closeMobileMenu);

  qs("openNewProductBtn")?.addEventListener("click", openNewProduct);
  qs("saveProductBtn")?.addEventListener("click", saveProduct);

  qs("prodUnitType")?.addEventListener("change", () => {
    if (qs("prodBaseUnitName")) qs("prodBaseUnitName").value = "";
    if (qs("prodLargeUnitName")) qs("prodLargeUnitName").value = "";
    syncUnitLabels();
  });

  qs("prodUnitFactor")?.addEventListener("input", () => {
    calculateProductStockFromForm();
    calculateBaseCostFromLarge();
    calculateBasePriceFromLarge();
  });

  qs("prodStockInputQty")?.addEventListener("input", calculateProductStockFromForm);
  qs("prodStockInputUnit")?.addEventListener("change", calculateProductStockFromForm);
  qs("prodLargeCost")?.addEventListener("input", calculateBaseCostFromLarge);
  qs("prodLargePrice")?.addEventListener("input", calculateBasePriceFromLarge);

  qs("inventorySearch")?.addEventListener("input", resetProductsAndRender);
  qs("inventoryCategoryFilter")?.addEventListener("change", resetProductsAndRender);
  qs("inventoryStockFilter")?.addEventListener("change", resetProductsAndRender);
  qs("exportInventoryBtn")?.addEventListener("click", () => exportInventoryTable("pdf"));

  qs("posSearch")?.addEventListener("input", searchPosProducts);
  qs("posCategoryFilter")?.addEventListener("change", renderPosProducts);
  qs("posDiscount")?.addEventListener("input", calculateTotal);
  qs("discountType")?.addEventListener("change", calculateTotal);
  qs("openPaymentModalBtn")?.addEventListener("click", openPaymentModal);
  qs("createInvoiceBtn")?.addEventListener("click", checkout);

  qs("customerName")?.addEventListener("input", handleCustomerInput);
  qs("customerPhone")?.addEventListener("input", handleCustomerInput);

  qs("barcodeImageInputPos")?.addEventListener("change", e => scanBarcodeFromImage(e, "pos"));
  qs("barcodeImageInputInvoice")?.addEventListener("change", e => scanBarcodeFromImage(e, "invoice"));

  qs("invSearchQuery")?.addEventListener("input", resetInvoicesAndRender);
  qs("invoiceStatusFilter")?.addEventListener("change", resetInvoicesAndRender);

  qs("salesReportRange")?.addEventListener("change", () => {
    qs("salesReportDate")?.classList.toggle("hidden", qs("salesReportRange")?.value !== "customDay");
    renderSalesSummary();
  });
  qs("salesReportDate")?.addEventListener("change", renderSalesSummary);
  qs("printSalesReportBtn")?.addEventListener("click", () => exportSalesReport("print"));
  qs("exportSalesReportPdfBtn")?.addEventListener("click", () => exportSalesReport("pdf"));
  qs("exportSalesReportImageBtn")?.addEventListener("click", () => exportSalesReport("image"));

  qs("openPurchaseModalBtn")?.addEventListener("click", openPurchaseModal);
  qs("savePurchaseBtn")?.addEventListener("click", savePurchase);
  qs("addPurchaseItemRowBtn")?.addEventListener("click", () => addPurchaseItemRow());

  qs("purchasesReportRange")?.addEventListener("change", () => {
    qs("purchasesReportDate")?.classList.toggle("hidden", qs("purchasesReportRange")?.value !== "customDay");
    renderPurchases();
  });
  qs("purchasesReportDate")?.addEventListener("change", renderPurchases);
  qs("purchasesSearch")?.addEventListener("input", renderPurchases);
  qs("printPurchasesReportBtn")?.addEventListener("click", () => exportPurchasesReport("print"));
  qs("exportPurchasesReportPdfBtn")?.addEventListener("click", () => exportPurchasesReport("pdf"));
  qs("exportPurchasesReportImageBtn")?.addEventListener("click", () => exportPurchasesReport("image"));

  qs("openSupplierPaymentModalBtn")?.addEventListener("click", openSupplierPaymentModal);
  qs("saveSupplierPaymentBtn")?.addEventListener("click", saveSupplierPayment);
  qs("supplierPaymentsRange")?.addEventListener("change", renderSupplierPayments);
  qs("supplierPaymentsSearch")?.addEventListener("input", renderSupplierPayments);
  qs("printSupplierPaymentsBtn")?.addEventListener("click", () => exportSupplierPaymentsReport("print"));
  qs("exportSupplierPaymentsPdfBtn")?.addEventListener("click", () => exportSupplierPaymentsReport("pdf"));
  qs("exportSupplierPaymentsImageBtn")?.addEventListener("click", () => exportSupplierPaymentsReport("image"));

  qs("openCustomerModalBtn")?.addEventListener("click", () => openCustomerModal());
  qs("saveCustomerBtn")?.addEventListener("click", saveCustomer);
  qs("customersSearch")?.addEventListener("input", renderCustomers);
  qs("customersDebtFilter")?.addEventListener("change", renderCustomers);
  qs("printCustomersBtn")?.addEventListener("click", () => exportCustomersReport("print"));
  qs("exportCustomersPdfBtn")?.addEventListener("click", () => exportCustomersReport("pdf"));

  qs("customerHistoryRange")?.addEventListener("change", () => {
    if (currentCustomerHistoryName) {
      openCustomerHistory(currentCustomerHistoryName, currentCustomerHistoryPhone);
    }
  });
  qs("customerSendDebtMsgBtn")?.addEventListener("click", sendDebtMessageToCustomer);
  qs("saveCustomerPaymentBtn")?.addEventListener("click", saveCustomerPayment);

  qs("openExpenseModalBtn")?.addEventListener("click", openExpenseModal);
  qs("saveExpenseBtn")?.addEventListener("click", saveExpense);
  qs("expensesRange")?.addEventListener("change", renderExpenses);
  qs("expensesSearch")?.addEventListener("input", renderExpenses);
  qs("expensesProfitFilter")?.addEventListener("change", renderExpenses);
  qs("printExpensesBtn")?.addEventListener("click", () => exportExpensesReport("print"));
  qs("exportExpensesPdfBtn")?.addEventListener("click", () => exportExpensesReport("pdf"));
  qs("exportExpensesImageBtn")?.addEventListener("click", () => exportExpensesReport("image"));

  qs("reportFilter")?.addEventListener("change", () => {
    qs("reportCustomDate")?.classList.toggle("hidden", qs("reportFilter")?.value !== "customDay");
    renderReports();
  });
  qs("reportCustomDate")?.addEventListener("change", renderReports);
  qs("printFinanceReportBtn")?.addEventListener("click", () => exportFinanceReport("print"));
  qs("exportFinanceReportPdfBtn")?.addEventListener("click", () => exportFinanceReport("pdf"));
  qs("exportFinanceReportImageBtn")?.addEventListener("click", () => exportFinanceReport("image"));

  qs("shortageRange")?.addEventListener("change", renderShortages);
  qs("shortageSearch")?.addEventListener("input", renderShortages);
  qs("shortageLimitInput")?.addEventListener("input", renderShortages);
  qs("shortageCategoryFilter")?.addEventListener("change", renderShortages);
  qs("refreshShortagesBtn")?.addEventListener("click", renderShortages);
  qs("printShortageReportBtn")?.addEventListener("click", () => exportShortageReport("print"));
  qs("exportShortageReportPdfBtn")?.addEventListener("click", () => exportShortageReport("pdf"));
  qs("exportShortageReportImageBtn")?.addEventListener("click", () => exportShortageReport("image"));

  qs("createStoreBtn")?.addEventListener("click", createNewStore);

  qs("setStoreLogo")?.addEventListener("input", e => previewStoreLogo(e.target.value));
  qs("addPaymentMethodBtn")?.addEventListener("click", addPaymentMethod);
  qs("addAccountBtn")?.addEventListener("click", addTransferAccount);
  qs("saveSettingsBtn")?.addEventListener("click", saveSettings);
  qs("logoutBtn")?.addEventListener("click", logoutUser);

  qs("downloadBackupBtn")?.addEventListener("click", downloadBackupFile);
  qs("saveCloudBackupBtn")?.addEventListener("click", saveCloudBackup);
  qs("restoreBackupInput")?.addEventListener("change", restoreBackupFromFile);
  qs("downloadOfflinePackageBtn")?.addEventListener("click", downloadOfflinePackage);
  qs("importOfflinePackageInput")?.addEventListener("change", importOfflinePackage);
  qs("uploadOfflineDataBtn")?.addEventListener("click", uploadOfflineDataToCloud);

  qs("backFromInvoiceBtn")?.addEventListener("click", backFromInvoicePage);
  qs("printInvoiceBtn")?.addEventListener("click", printInvoicePage);
  qs("exportInvoiceImageBtn")?.addEventListener("click", () => exportInvoicePage("image"));
  qs("exportInvoicePdfBtn")?.addEventListener("click", () => exportInvoicePage("pdf"));
  qs("shareInvoiceBtn")?.addEventListener("click", shareCurrentInvoice);

  qs("saveStatusBtn")?.addEventListener("click", saveInvoiceStatus);

  qs("manualCustomerName")?.addEventListener("input", handleManualCustomerInput);
  qs("manualCustomerPhone")?.addEventListener("input", handleManualCustomerInput);

  document.addEventListener("click", e => {
    const posResults = qs("posSearchResults");
    const posInput = qs("posSearch");

    if (posResults && !posResults.contains(e.target) && e.target !== posInput) {
      posResults.classList.add("hidden");
    }

    const customerBox = qs("customerSuggestions");

    if (
      customerBox &&
      !customerBox.contains(e.target) &&
      e.target !== qs("customerName") &&
      e.target !== qs("customerPhone")
    ) {
      customerBox.classList.add("hidden");
    }

    const manualBox = qs("manualCustomerSuggestions");

    if (
      manualBox &&
      !manualBox.contains(e.target) &&
      e.target !== qs("manualCustomerName") &&
      e.target !== qs("manualCustomerPhone")
    ) {
      manualBox.classList.add("hidden");
    }
  });

  window.addEventListener("popstate", async () => {
    if (qs("scannerModal") && !qs("scannerModal").classList.contains("hidden")) {
      await closeScanner(true);
      return;
    }

    const invoicePageVisible = qs("invoicePage") && !qs("invoicePage").classList.contains("hidden");

    if (invoicePageVisible) {
      backFromInvoicePage();
    }
  });

  window.addEventListener("online", async () => {
    if (getLocalSession()?.appMode === "online") {
      try {
        await uploadOfflineDataToCloud();
        attachRealtimeListeners();
        if (qs("mobileSyncState")) qs("mobileSyncState").innerText = "تمت المزامنة";
      } catch {
        if (qs("mobileSyncState")) qs("mobileSyncState").innerText = "تعذر المزامنة";
      }
    }
  });

  window.addEventListener("offline", () => {
    if (qs("mobileSyncState")) qs("mobileSyncState").innerText = "أوفلاين";
    detachRealtimeListeners();
  });

  qs("loadMoreProductsBtn")?.addEventListener("click", loadMoreProducts);
  qs("loadMoreInvoicesBtn")?.addEventListener("click", loadMoreInvoices);
}

function openMobileMenu() {
  qs("sideNav")?.classList.add("open");
  qs("sideBackdrop")?.classList.remove("hidden");
}

function closeMobileMenu() {
  qs("sideNav")?.classList.remove("open");
  qs("sideBackdrop")?.classList.add("hidden");
}

async function refreshAllVisible() {
  await updateCurrencyUI();
  await refreshCategories();

  const visibleTab = [...document.querySelectorAll(".tab-content")]
    .find(el => !el.classList.contains("hidden"))?.id?.replace("tab-", "") || "dashboard";

  if (visibleTab === "dashboard") await renderDashboard();
  if (visibleTab === "pos") await renderPosProducts();
  if (visibleTab === "inventory") await resetProductsAndRender();
  if (visibleTab === "sales") {
    await resetInvoicesAndRender();
    await renderSalesSummary();
  }
  if (visibleTab === "purchases") await renderPurchases();
  if (visibleTab === "supplierPayments") await renderSupplierPayments();
  if (visibleTab === "customers") await renderCustomers();
  if (visibleTab === "expenses") await renderExpenses();
  if (visibleTab === "reports") await renderReports();
  if (visibleTab === "shortages") await renderShortages();
  if (visibleTab === "stores") await renderStoresList();
  if (visibleTab === "settings") await loadSettingsPage();
}

async function initApp() {
  await bootSessionState();
}

async function bootSessionState() {
  const session = getLocalSession();

  if (!session) {
    showLogin();
    return;
  }

  if (session.expiresAt && Date.now() >= new Date(session.expiresAt).getTime()) {
    clearLocalSession();
    showExpired("انتهى وقت المفتاح.");
    return;
  }

  await ensureClientDefaults();

  if (!isOnline() && !session.firstVerified) {
    showLogin("أول دخول يحتاج إنترنت");
    return;
  }

  if (isOnline() && session.appMode === "online") {
    try {
      await refreshSessionFromLicense();
      await syncCloudToOffline();
      attachRealtimeListeners();
    } catch (err) {
      console.warn("تعذر تحديث الجلسة من السحابة:", err);
    }
  } else {
    detachRealtimeListeners();
  }

  await loadCurrentStore();
  await updateCurrencyUI();

  showApp();
  switchTab("dashboard");
  updateLicenseUIFromSession();
  startLicenseWatcher();

  if (qs("mobileSyncState")) {
    qs("mobileSyncState").innerText = navigator.onLine ? "متصل" : "أوفلاين";
  }
}

async function ensureClientDefaults() {
  const stores = await idbGetAll("stores");

  if (!stores.length) {
    await idbSet("stores", {
      id: "default",
      name: "المحل الرئيسي",
      logo: "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  const settings = await idbGet("meta", "settings");

  if (!settings) {
    const defaultSettings = {
      id: "settings",
      currencyName: "شيكل",
      currencySymbol: "₪",
      appMode: getLocalSession()?.appMode || "online",
      paymentInfo: "",
      expensesDeductDefault: true,
      lowStockDefault: 5,
      paymentMethods: defaultPaymentMethods(),
      transferAccounts: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    await idbSet("meta", defaultSettings);
    setLocalSettings(defaultSettings);
  }

  const counter = await idbGet("meta", "invoiceCounter");

  if (!counter) {
    await idbSet("meta", { id: "invoiceCounter", value: 0 });
  }

  const active = localStorage.getItem("activeStoreId");
  const activeStore = active ? await idbGet("stores", active) : null;

  if (!active || !activeStore) {
    currentStoreId = "default";
    localStorage.setItem("activeStoreId", "default");
  } else {
    currentStoreId = active;
  }

  await setPaymentMethods(await getPaymentMethods());
  await setTransferAccounts(await getTransferAccounts());
}

async function loadCurrentStore() {
  const store = await idbGet("stores", currentStoreId);

  if (store) {
    if (qs("sideStoreName")) qs("sideStoreName").innerText = store.name || "اسم المحل";
    if (qs("mobileStoreName")) qs("mobileStoreName").innerText = store.name || "نظام الكاشير";
    setImageOrHide(qs("sideLogo"), store.logo);
    if (qs("invPageStoreName")) qs("invPageStoreName").innerText = store.name || "المحل";
    setImageOrHide(qs("invPageLogo"), store.logo);
  }
}

async function switchTab(tabId) {
  activateNav(tabId);
  closeMobileMenu();

  if (tabId === "dashboard") await renderDashboard();
  if (tabId === "pos") {
    await refreshCategories();
    await renderPosProducts();
    renderCart();
  }
  if (tabId === "inventory") {
    await refreshCategories();
    await resetProductsAndRender();
  }
  if (tabId === "sales") {
    await resetInvoicesAndRender();
    await renderSalesSummary();
  }
  if (tabId === "purchases") await renderPurchases();
  if (tabId === "supplierPayments") await renderSupplierPayments();
  if (tabId === "customers") await renderCustomers();
  if (tabId === "expenses") await renderExpenses();
  if (tabId === "reports") await renderReports();
  if (tabId === "shortages") {
    await refreshCategories();
    await renderShortages();
  }
  if (tabId === "stores") await renderStoresList();
  if (tabId === "settings") await loadSettingsPage();

  lucide.createIcons();
}

function activateNav(tabId) {
  document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  qs(`tab-${tabId}`)?.classList.remove("hidden");
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");
}

function showLogin(message = "") {
  qs("mainApp")?.classList.add("hidden");
  qs("invoicePage")?.classList.add("hidden");
  qs("licenseExpiredPage")?.classList.add("hidden");
  qs("loginPage")?.classList.remove("hidden");

  const err = qs("loginError");

  if (err) {
    if (message) {
      err.innerText = message;
      err.classList.remove("hidden");
    } else {
      err.innerText = "";
      err.classList.add("hidden");
    }
  }

  lucide.createIcons();
}

function showExpired(message = "انتهى وقت المفتاح أو عدد الاستخدامات المتاحة.") {
  qs("mainApp")?.classList.add("hidden");
  qs("invoicePage")?.classList.add("hidden");
  qs("loginPage")?.classList.add("hidden");
  qs("licenseExpiredPage")?.classList.remove("hidden");

  if (qs("expiredMessage")) qs("expiredMessage").innerText = message;

  lucide.createIcons();
}

function showApp() {
  qs("loginPage")?.classList.add("hidden");
  qs("licenseExpiredPage")?.classList.add("hidden");
  qs("invoicePage")?.classList.add("hidden");
  qs("mainApp")?.classList.remove("hidden");
}

function goToLoginFromExpired() {
  showLogin();
}

async function handleLicenseLogin() {
  const key = qs("licenseKeyInput")?.value.trim();
  const err = qs("loginError");

  if (err) err.classList.add("hidden");

  if (!key) {
    if (err) {
      err.innerText = "يرجى إدخال المفتاح";
      err.classList.remove("hidden");
    }
    return;
  }

  if (!isOnline()) {
    showLogin("أول دخول يحتاج إنترنت");
    return;
  }

  try {
    await showLoader("جاري التحقق من المفتاح...");

    const snap = await get(ref(db, `${pathLicenses()}/${sanitizeKey(key)}`));

    if (!snap.exists()) {
      hideLoader();
      showLogin("المفتاح غير موجود");
      return;
    }

    const lic = snap.val();

    if ((lic.status || "active") === "inactive") {
      hideLoader();
      showLogin("هذا المفتاح غير مفعل");
      return;
    }

    const maxLogins = lic.maxLogins === "unlimited" ? null : Number(lic.maxLogins ?? 1);
    const usedLogins = Number(lic.usedLogins || 0);

    if (maxLogins !== null && usedLogins >= maxLogins) {
      hideLoader();
      showExpired("انتهت عدد الأجهزة المتاحة لمفتاحك");
      return;
    }

    const now = new Date();
    const durationType = lic.durationType || "unlimited";
    const durationValue = Number(lic.durationValue || 0);
    const durationMs = getDurationMs(durationType, durationValue);

    let startedAt = lic.startedAt || now.toISOString();
    let expiresAt = lic.expiresAt || null;

    if (!lic.startedAt) {
      startedAt = now.toISOString();
      expiresAt = durationMs === null ? null : new Date(now.getTime() + durationMs).toISOString();
    } else if (expiresAt && Date.now() >= new Date(expiresAt).getTime()) {
      hideLoader();
      showExpired("انتهى وقت هذا المفتاح");
      return;
    }

    await update(ref(db, `${pathLicenses()}/${sanitizeKey(key)}`), {
      startedAt,
      expiresAt,
      usedLogins: usedLogins + 1,
      lastLoginAt: nowIso()
    });

    const session = {
      key,
      durationType,
      durationValue,
      startedAt,
      expiresAt,
      loginAt: nowIso(),
      appMode: lic.appMode || "online",
      allowOfflineFallback: lic.allowOfflineFallback === true,
      rememberSession: lic.rememberSession !== false,
      firstVerified: true
    };

    setLocalSession(session);
    currentStoreId = "default";
    localStorage.setItem("activeStoreId", "default");

    await ensureClientDefaults();
    await syncCloudToOffline();
    await loadCurrentStore();
    await updateCurrencyUI();

    if (session.appMode === "online") {
      attachRealtimeListeners();
    }

    if (qs("licenseKeyInput")) qs("licenseKeyInput").value = "";

    hideLoader();
    showApp();
    await switchTab("dashboard");
    updateLicenseUIFromSession();
    startLicenseWatcher();
    showToast("تم تسجيل الدخول بنجاح", "success");
  } catch (err2) {
    console.error(err2);
    hideLoader();
    showLogin("حدث خطأ أثناء تسجيل الدخول");
  }
}

async function refreshSessionFromLicense() {
  const session = getLocalSession();
  if (!session?.key || !isOnline()) return;

  const snap = await get(ref(db, `${pathLicenses()}/${sanitizeKey(session.key)}`));

  if (!snap.exists()) {
    clearLocalSession();
    showExpired("تم حذف المفتاح");
    return;
  }

  const lic = snap.val();
  const now = Date.now();

  if ((lic.status || "active") === "inactive") {
    clearLocalSession();
    showExpired("تم إيقاف هذا المفتاح");
    return;
  }

  const startedAt = lic.startedAt || session.startedAt || null;
  const expiresAt = lic.expiresAt || null;

  if (expiresAt && now >= new Date(expiresAt).getTime()) {
    clearLocalSession();
    showExpired("انتهى وقت المفتاح");
    return;
  }

  const newSession = {
    ...session,
    durationType: lic.durationType || session.durationType,
    durationValue: lic.durationValue || session.durationValue,
    startedAt,
    expiresAt,
    appMode: lic.appMode || "online",
    allowOfflineFallback: lic.allowOfflineFallback === true,
    rememberSession: lic.rememberSession !== false,
    firstVerified: true
  };

  setLocalSession(newSession);
  updateLicenseUIFromSession();
}

function attachRealtimeListeners() {
  detachRealtimeListeners();

  if (!baseClientPath()) return;

  storesListenerRef = ref(db, pathClientStores());
  productsListenerRef = ref(db, pathClientProducts());
  invoicesListenerRef = ref(db, pathClientInvoices());
  purchasesListenerRef = ref(db, pathClientPurchases());
  supplierPaymentsListenerRef = ref(db, pathClientSupplierPayments());
  customersListenerRef = ref(db, pathClientCustomers());
  customerPaymentsListenerRef = ref(db, pathClientCustomerPayments());
  expensesListenerRef = ref(db, pathClientExpenses());

  const session = getLocalSession();

  if (session?.key) {
    licenseListenerRef = ref(db, `${pathLicenses()}/${sanitizeKey(session.key)}`);
    onValue(licenseListenerRef, async () => {
      try {
        await refreshSessionFromLicense();
      } catch {}
    });
  }

  onValue(storesListenerRef, async snap => {
    await replaceStoreFromSnap("stores", snap);
    await loadCurrentStore();
    await refreshAllVisible();
  });

  onValue(productsListenerRef, async snap => {
    await replaceStoreFromSnap("products", snap);
    await refreshAllVisible();
  });

  onValue(invoicesListenerRef, async snap => {
    await replaceStoreFromSnap("invoices", snap);
    await refreshAllVisible();
  });

  onValue(purchasesListenerRef, async snap => {
    await replaceStoreFromSnap("purchases", snap);
    await refreshAllVisible();
  });

  onValue(supplierPaymentsListenerRef, async snap => {
    await replaceStoreFromSnap("supplierPayments", snap);
    await refreshAllVisible();
  });

  onValue(customersListenerRef, async snap => {
    await replaceStoreFromSnap("customers", snap);
    await refreshAllVisible();
  });

  onValue(customerPaymentsListenerRef, async snap => {
    await replaceStoreFromSnap("customerPayments", snap);
    await refreshAllVisible();
  });

  onValue(expensesListenerRef, async snap => {
    await replaceStoreFromSnap("expenses", snap);
    await refreshAllVisible();
  });
}

async function replaceStoreFromSnap(storeName, snap) {
  const items = snap.exists() ? Object.values(snap.val() || {}) : [];

  await idbClear(storeName);

  for (const item of items) {
    await idbSet(storeName, item);
  }
}

function detachRealtimeListeners() {
  if (storesListenerRef) off(storesListenerRef);
  if (productsListenerRef) off(productsListenerRef);
  if (invoicesListenerRef) off(invoicesListenerRef);
  if (purchasesListenerRef) off(purchasesListenerRef);
  if (supplierPaymentsListenerRef) off(supplierPaymentsListenerRef);
  if (customersListenerRef) off(customersListenerRef);
  if (customerPaymentsListenerRef) off(customerPaymentsListenerRef);
  if (expensesListenerRef) off(expensesListenerRef);
  if (licenseListenerRef) off(licenseListenerRef);

  storesListenerRef = null;
  productsListenerRef = null;
  invoicesListenerRef = null;
  purchasesListenerRef = null;
  supplierPaymentsListenerRef = null;
  customersListenerRef = null;
  customerPaymentsListenerRef = null;
  expensesListenerRef = null;
  licenseListenerRef = null;
}

async function logoutUser() {
  const session = getLocalSession();

  if (session?.key && isOnline() && session.appMode === "online") {
    try {
      const licRef = ref(db, `${pathLicenses()}/${sanitizeKey(session.key)}`);
      const snap = await get(licRef);

      if (snap.exists()) {
        const lic = snap.val();
        const used = Math.max(0, Number(lic.usedLogins || 0) - 1);

        await update(licRef, {
          usedLogins: used,
          lastLogoutAt: nowIso()
        });
      }
    } catch {}
  }

  detachRealtimeListeners();
  clearLocalSession();
  localStorage.removeItem("activeStoreId");

  if (licenseWatcher) clearInterval(licenseWatcher);

  showLogin("تم تسجيل الخروج بنجاح");
}

async function createNewStore() {
  const name = qs("newStoreName")?.value.trim();

  if (!name) {
    alert("يرجى إدخال اسم المحل");
    return;
  }

  const id = `store_${Date.now()}`;

  await withLoader("جاري إنشاء المحل...", async () => {
    await saveEntity("stores", id, {
      id,
      name,
      logo: "",
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
  });

  if (qs("newStoreName")) qs("newStoreName").value = "";

  toggleModal("storeModal", false);
  showToast("تم إنشاء المحل", "success");
  await renderStoresList();
}

async function renderStoresList() {
  const grid = qs("storesGrid");
  if (!grid) return;

  const stores = await getAllStores();
  stores.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  grid.innerHTML = "";

  stores.forEach(store => {
    const active = store.id === currentStoreId;

    const logoHtml = store.logo
      ? `<img src="${escapeHtmlAttr(store.logo)}" class="w-16 h-16 rounded-xl object-cover" crossorigin="anonymous" referrerpolicy="no-referrer">`
      : `<div class="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400"><i data-lucide="image-off"></i></div>`;

    grid.innerHTML += `
      <div class="card p-6 border-2 ${active ? "border-blue-500" : "border-transparent"}">
        <div class="flex items-center gap-4">
          ${logoHtml}

          <div class="flex-grow">
            <h4 class="font-black text-lg">${escapeHtml(store.name || "-")}</h4>
            <p class="text-xs text-gray-400">تاريخ الإنشاء: ${formatDateTime(store.createdAt)}</p>
          </div>

          ${
            active
              ? `<span class="text-sm bg-blue-100 text-blue-700 px-3 py-2 rounded-lg font-bold">الحالي</span>`
              : `<button onclick="switchStore('${escapeJs(store.id)}')" class="text-sm bg-blue-50 text-blue-700 px-4 py-2 rounded-lg font-bold">دخول</button>`
          }
        </div>
      </div>
    `;
  });

  lucide.createIcons();
}

async function switchStore(id) {
  currentStoreId = id;
  localStorage.setItem("activeStoreId", id);

  await withLoader("جاري تبديل المحل...", async () => {
    await loadCurrentStore();
    cart = [];
    editingInvoiceId = null;
  });

  renderCart();
  updateCreateInvoiceButton();
  await switchTab("dashboard");
}

function toggleModal(id, show) {
  qs(id)?.classList.toggle("hidden", !show);

  if (!show) {
    if (id === "productModal") resetProductForm();
    if (id === "purchaseModal") resetPurchaseForm?.();
    if (id === "supplierPaymentModal") resetSupplierPaymentForm?.();
    if (id === "expenseModal") resetExpenseForm?.();
  }

  lucide.createIcons();
}

document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();
  bindBaseEvents();
  await initApp();
});

window.handleLicenseLogin = handleLicenseLogin;
window.goToLoginFromExpired = goToLoginFromExpired;
window.switchTab = switchTab;
window.openMobileMenu = openMobileMenu;
window.closeMobileMenu = closeMobileMenu;

window.createNewStore = createNewStore;
window.renderStoresList = renderStoresList;
window.switchStore = switchStore;

window.openNewProduct = openNewProduct;
window.saveProduct = saveProduct;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.showProductBarcode = showProductBarcode;
window.resetProductsAndRender = resetProductsAndRender;
window.loadMoreProducts = loadMoreProducts;
window.renderPosProducts = renderPosProducts;
window.searchPosProducts = searchPosProducts;

window.openPaymentModal = openPaymentModal;
window.checkout = checkout;
window.clearCart = clearCart;
window.changeCartUnit = changeCartUnit;
window.changeQty = changeQty;
window.removeFromCart = removeFromCart;
window.calculateTotal = calculateTotal;

window.resetInvoicesAndRender = resetInvoicesAndRender;
window.loadMoreInvoices = loadMoreInvoices;
window.viewInvoice = viewInvoice;
window.editInvoice = editInvoice;
window.deleteInvoice = deleteInvoice;
window.openStatusModal = openStatusModal;
window.saveInvoiceStatus = saveInvoiceStatus;
window.openNoteModal = openNoteModal;
window.openManualInvoiceModal = openManualInvoiceModal;
window.saveManualInvoice = saveManualInvoice;

window.openPurchaseModal = openPurchaseModal;
window.savePurchase = savePurchase;
window.editPurchase = editPurchase;
window.deletePurchase = deletePurchase;
window.addPurchaseItemRow = addPurchaseItemRow;
window.recalcPurchaseRows = recalcPurchaseRows;

window.openSupplierPaymentModal = openSupplierPaymentModal;
window.saveSupplierPayment = saveSupplierPayment;
window.editSupplierPayment = editSupplierPayment;
window.deleteSupplierPayment = deleteSupplierPayment;

window.openCustomerModal = openCustomerModal;
window.saveCustomer = saveCustomer;
window.deleteCustomer = deleteCustomer;
window.openCustomerHistory = openCustomerHistory;
window.saveCustomerPayment = saveCustomerPayment;
window.sendDebtMessageToCustomer = sendDebtMessageToCustomer;

window.openExpenseModal = openExpenseModal;
window.saveExpense = saveExpense;
window.editExpense = editExpense;
window.deleteExpense = deleteExpense;

window.openScanner = openScanner;
window.closeScanner = closeScanner;
window.toggleScannerTorch = toggleScannerTorch;
window.scanBarcodeFromImage = scanBarcodeFromImage;

window.saveSettings = saveSettings;
window.logoutUser = logoutUser;
window.toggleModal = toggleModal;
window.previewStoreLogo = previewStoreLogo;
window.addPaymentMethod = addPaymentMethod;
window.deletePaymentMethod = deletePaymentMethod;
window.addTransferAccount = addTransferAccount;
window.deleteTransferAccount = deleteTransferAccount;

window.printInvoicePage = printInvoicePage;
window.exportInvoicePage = exportInvoicePage;
window.shareCurrentInvoice = shareCurrentInvoice;

window.exportSalesReport = exportSalesReport;
window.exportPurchasesReport = exportPurchasesReport;
window.exportSupplierPaymentsReport = exportSupplierPaymentsReport;
window.exportCustomersReport = exportCustomersReport;
window.exportExpensesReport = exportExpensesReport;
window.exportFinanceReport = exportFinanceReport;
window.exportShortageReport = exportShortageReport;

window.downloadBackupFile = downloadBackupFile;
window.saveCloudBackup = saveCloudBackup;
window.restoreBackupFromFile = restoreBackupFromFile;
window.downloadOfflinePackage = downloadOfflinePackage;
window.importOfflinePackage = importOfflinePackage;
window.uploadOfflineDataToCloud = uploadOfflineDataToCloud;

lucide.createIcons();