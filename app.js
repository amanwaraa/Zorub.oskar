import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  off,
  child
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

/* =========================
   Firebase جديد ونظيف
   غيّر بيانات firebaseConfig لقاعدة جديدة
========================= */
const firebaseConfig = {
  apiKey: "PUT_NEW_API_KEY_HERE",
  authDomain: "PUT_NEW_PROJECT.firebaseapp.com",
  databaseURL: "https://PUT_NEW_PROJECT-default-rtdb.firebaseio.com",
  projectId: "PUT_NEW_PROJECT",
  storageBucket: "PUT_NEW_PROJECT.appspot.com",
  messagingSenderId: "PUT_SENDER_ID",
  appId: "PUT_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* =========================
   ثوابت النظام
========================= */
const APP_PREFIX = "GROCERY_POS_V1";
const LOCAL_SESSION_KEY = `${APP_PREFIX}_SESSION`;
const LOCAL_DB_NAME = `${APP_PREFIX}_IDB`;
const LOCAL_DB_VERSION = 1;
const BACKUP_VERSION = 1;

const LICENSES_PATH = `${APP_PREFIX}_licenses`;
const CLIENTS_PATH = `${APP_PREFIX}_clients`;

let currentStoreId = localStorage.getItem(`${APP_PREFIX}_ACTIVE_STORE`) || "default";

let cart = [];
let currentInvoiceId = null;
let editingInvoiceId = null;

let scanner = null;
let scanTarget = "pos";
let scannerTrack = null;
let scannerTorchOn = false;
let torchSupported = false;
let scannerLock = false;
let scannerHistoryPushed = false;

let licenseWatcher = null;

let storesListenerRef = null;
let productsListenerRef = null;
let invoicesListenerRef = null;
let purchasesListenerRef = null;
let supplierPaymentsListenerRef = null;
let customersListenerRef = null;
let customerPaymentsListenerRef = null;
let expensesListenerRef = null;
let settingsListenerRef = null;
let licenseListenerRef = null;

let productPageSize = 20;
let invoicePageSize = 20;
let productsCurrentLimit = 20;
let invoicesCurrentLimit = 20;

let currentCustomerHistoryName = "";
let currentCustomerHistoryPhone = "";
let currentCustomerHistoryId = "";

/* =========================
   تشغيل
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    lucide.createIcons();
    bindBaseEvents();
    await initApp();
  } catch (err) {
    console.error(err);
    alert("حدث خطأ أثناء تشغيل التطبيق");
  }
});

/* =========================
   Helpers
========================= */
function qs(id) {
  return document.getElementById(id);
}

function nowIso() {
  return new Date().toISOString();
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function isOnline() {
  return navigator.onLine;
}

function sanitizeKey(key) {
  return String(key || "").trim().replace(/[.#$/[\]]/g, "_");
}

function getLocalSession() {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLocalSession(session) {
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
}

function clearLocalSession() {
  localStorage.removeItem(LOCAL_SESSION_KEY);
}

function currentLicenseKey() {
  return getLocalSession()?.key || "";
}

function clientRootPath() {
  const key = currentLicenseKey();
  if (!key) return null;
  return `${CLIENTS_PATH}/${sanitizeKey(key)}`;
}

function pathLicenses() {
  return LICENSES_PATH;
}

function pathClientStores() {
  return `${clientRootPath()}/stores`;
}

function pathClientProducts() {
  return `${clientRootPath()}/products`;
}

function pathClientInvoices() {
  return `${clientRootPath()}/invoices`;
}

function pathClientPurchases() {
  return `${clientRootPath()}/purchases`;
}

function pathClientSupplierPayments() {
  return `${clientRootPath()}/supplierPayments`;
}

function pathClientCustomers() {
  return `${clientRootPath()}/customers`;
}

function pathClientCustomerPayments() {
  return `${clientRootPath()}/customerPayments`;
}

function pathClientExpenses() {
  return `${clientRootPath()}/expenses`;
}

function pathClientSettings() {
  return `${clientRootPath()}/settings`;
}

function pathClientCounters() {
  return `${clientRootPath()}/counters`;
}

function pathClientBackups() {
  return `${clientRootPath()}/backups`;
}

function money(value, settings = null) {
  const st = settings || getLocalSettings();
  const symbol = st.currencySymbol || "₪";
  return `${Number(value || 0).toFixed(2)} ${symbol}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("ar-EG");
  } catch {
    return String(value);
  }
}

function formatDateOnly(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("ar-EG");
  } catch {
    return String(value);
  }
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
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function setImageOrHide(imgEl, url) {
  if (!imgEl) return;

  const clean = String(url || "").trim();

  if (!clean) {
    imgEl.removeAttribute("src");
    imgEl.classList.add("hidden");
    return;
  }

  imgEl.crossOrigin = "anonymous";
  imgEl.referrerPolicy = "no-referrer";
  imgEl.src = clean;
  imgEl.classList.remove("hidden");
}

function previewStoreLogo(value) {
  setImageOrHide(qs("settingsLogoPreview"), value);
}

function showToast(message, type = "info") {
  const toast = qs("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = "toast show";

  if (type === "success") toast.style.background = "rgba(22,101,52,.96)";
  else if (type === "danger") toast.style.background = "rgba(153,27,27,.96)";
  else if (type === "warning") toast.style.background = "rgba(194,65,12,.96)";
  else toast.style.background = "rgba(15,23,42,.96)";

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function showLoader(text = "جاري المعالجة...") {
  const loader = qs("loader");
  const circle = qs("progressCircle");
  const textEl = qs("loaderText");

  if (!loader || !circle || !textEl) return;

  loader.classList.remove("hidden");
  textEl.textContent = text;
  circle.style.setProperty("--progress", 15);
  circle.setAttribute("data-progress", "15");

  let p = 15;
  loader.dataset.interval = setInterval(() => {
    p = Math.min(92, p + Math.floor(Math.random() * 8) + 3);
    circle.style.setProperty("--progress", p);
    circle.setAttribute("data-progress", String(p));
  }, 250);
}

function hideLoader() {
  const loader = qs("loader");
  const circle = qs("progressCircle");
  if (!loader || !circle) return;

  if (loader.dataset.interval) {
    clearInterval(Number(loader.dataset.interval));
    delete loader.dataset.interval;
  }

  circle.style.setProperty("--progress", 100);
  circle.setAttribute("data-progress", "100");

  setTimeout(() => {
    loader.classList.add("hidden");
    circle.style.setProperty("--progress", 0);
    circle.setAttribute("data-progress", "0");
  }, 180);
}

async function withLoader(text, fn) {
  showLoader(text);
  try {
    return await fn();
  } finally {
    hideLoader();
  }
}

/* =========================
   IndexedDB
========================= */
function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);

    req.onupgradeneeded = () => {
      const dbx = req.result;

      const stores = [
        "stores",
        "products",
        "invoices",
        "purchases",
        "supplierPayments",
        "customers",
        "customerPayments",
        "expenses",
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

/* =========================
   Entity helpers
========================= */
function firebasePathForKind(kind) {
  const map = {
    stores: pathClientStores(),
    products: pathClientProducts(),
    invoices: pathClientInvoices(),
    purchases: pathClientPurchases(),
    supplierPayments: pathClientSupplierPayments(),
    customers: pathClientCustomers(),
    customerPayments: pathClientCustomerPayments(),
    expenses: pathClientExpenses()
  };

  return map[kind] || null;
}

async function queueSync(action, kind, id, payload = null) {
  const row = {
    id: `sync_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    action,
    kind,
    entityId: id,
    payload,
    createdAt: nowIso()
  };

  await idbSet("syncQueue", row);
}

async function getEntity(kind, id) {
  return await idbGet(kind, id);
}

async function saveEntity(kind, id, payload) {
  const finalPayload = {
    ...payload,
    id,
    storeId: payload.storeId || currentStoreId,
    updatedAt: nowIso()
  };

  await idbSet(kind, finalPayload);

  const session = getLocalSession();
  const path = firebasePathForKind(kind);

  if (isOnline() && session?.appMode === "online" && path) {
    await set(ref(db, `${path}/${id}`), finalPayload);
  } else {
    await queueSync("set", kind, id, finalPayload);
  }

  return finalPayload;
}

async function deleteEntity(kind, id) {
  await idbDelete(kind, id);

  const session = getLocalSession();
  const path = firebasePathForKind(kind);

  if (isOnline() && session?.appMode === "online" && path) {
    await remove(ref(db, `${path}/${id}`));
  } else {
    await queueSync("delete", kind, id);
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

/* =========================================================
   Firebase القديم كما طلبت
========================================================= */
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

/* =========================================================
   ثوابت النظام الجديد
   غيرت PREFIX حتى ما يخربط مع الموقع القديم
========================================================= */
const PREFIX = "GROCERY_CASHIER_V2";
const LOCAL_SESSION_KEY = `${PREFIX}_SESSION`;
const LOCAL_ACTIVE_STORE_KEY = `${PREFIX}_ACTIVE_STORE`;
const LOCAL_DB_NAME = `${PREFIX}_OFFLINE_DB`;
const LOCAL_DB_VERSION = 1;
const BACKUP_VERSION = 1;

const LICENSES_PATH = `${PREFIX}_licenses`;
const CLIENTS_PATH = `${PREFIX}_clients`;

/* =========================================================
   حالة التطبيق
========================================================= */
let currentStoreId = localStorage.getItem(LOCAL_ACTIVE_STORE_KEY) || "default";

let cart = [];
let currentInvoiceId = null;
let editingInvoiceId = null;

let productPageSize = 20;
let invoicePageSize = 20;
let productsCurrentLimit = 20;
let invoicesCurrentLimit = 20;

let scanner = null;
let scanTarget = "pos";
let scannerTrack = null;
let scannerTorchOn = false;
let torchSupported = false;
let scannerLock = false;
let scannerHistoryPushed = false;

let licenseWatcher = null;

let storesListenerRef = null;
let productsListenerRef = null;
let invoicesListenerRef = null;
let purchasesListenerRef = null;
let supplierPaymentsListenerRef = null;
let customersListenerRef = null;
let customerPaymentsListenerRef = null;
let expensesListenerRef = null;
let settingsListenerRef = null;
let licenseListenerRef = null;

let currentCustomerHistoryName = "";
let currentCustomerHistoryPhone = "";
let currentCustomerHistoryId = "";

/* =========================================================
   تشغيل التطبيق
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    lucide.createIcons();
    bindBaseEvents();
    await initApp();
  } catch (err) {
    console.error(err);
    alert("حدث خطأ أثناء تشغيل التطبيق");
  }
});

/* =========================================================
   أدوات عامة
========================================================= */
function qs(id) {
  return document.getElementById(id);
}

function nowIso() {
  return new Date().toISOString();
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function isOnline() {
  return navigator.onLine;
}

function sanitizeKey(key) {
  return String(key || "").trim().replace(/[.#$/[\]]/g, "_");
}

function getLocalSession() {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setLocalSession(session) {
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
}

function clearLocalSession() {
  localStorage.removeItem(LOCAL_SESSION_KEY);
}

function currentLicenseKey() {
  return getLocalSession()?.key || "";
}

function clientRootPath() {
  const key = currentLicenseKey();
  if (!key) return null;
  return `${CLIENTS_PATH}/${sanitizeKey(key)}`;
}

function pathLicenses() {
  return LICENSES_PATH;
}

function pathClientStores() {
  return `${clientRootPath()}/stores`;
}

function pathClientProducts() {
  return `${clientRootPath()}/products`;
}

function pathClientInvoices() {
  return `${clientRootPath()}/invoices`;
}

function pathClientPurchases() {
  return `${clientRootPath()}/purchases`;
}

function pathClientSupplierPayments() {
  return `${clientRootPath()}/supplierPayments`;
}

function pathClientCustomers() {
  return `${clientRootPath()}/customers`;
}

function pathClientCustomerPayments() {
  return `${clientRootPath()}/customerPayments`;
}

function pathClientExpenses() {
  return `${clientRootPath()}/expenses`;
}

function pathClientSettings() {
  return `${clientRootPath()}/settings`;
}

function pathClientCounters() {
  return `${clientRootPath()}/counters`;
}

function pathClientBackups() {
  return `${clientRootPath()}/backups`;
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
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("ar-EG");
  } catch {
    return String(value);
  }
}

function formatDateOnly(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("ar-EG");
  } catch {
    return String(value);
  }
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
    pending: "تطبيق لاحق",
    unpaid: "دين"
  };

  return map[status] || status || "-";
}

function statusClass(status) {
  if (status === "paid") return "status-paid";
  if (status === "pending") return "status-pending";
  return "status-unpaid";
}

function showToast(message, type = "info") {
  const toast = qs("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = "toast show";

  if (type === "success") toast.style.background = "rgba(22,101,52,.96)";
  else if (type === "danger") toast.style.background = "rgba(153,27,27,.96)";
  else if (type === "warning") toast.style.background = "rgba(194,65,12,.96)";
  else toast.style.background = "rgba(15,23,42,.96)";

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function showLoader(text = "جاري المعالجة...") {
  const loader = qs("loader");
  const circle = qs("progressCircle");
  const textEl = qs("loaderText");

  if (!loader || !circle || !textEl) return;

  loader.classList.remove("hidden");
  textEl.textContent = text;

  circle.style.setProperty("--progress", 10);
  circle.setAttribute("data-progress", "10");

  let progress = 10;

  if (loader.dataset.interval) {
    clearInterval(Number(loader.dataset.interval));
  }

  loader.dataset.interval = setInterval(() => {
    progress = Math.min(92, progress + Math.floor(Math.random() * 7) + 3);
    circle.style.setProperty("--progress", progress);
    circle.setAttribute("data-progress", String(progress));
  }, 220);
}

function hideLoader() {
  const loader = qs("loader");
  const circle = qs("progressCircle");

  if (!loader || !circle) return;

  if (loader.dataset.interval) {
    clearInterval(Number(loader.dataset.interval));
    delete loader.dataset.interval;
  }

  circle.style.setProperty("--progress", 100);
  circle.setAttribute("data-progress", "100");

  setTimeout(() => {
    loader.classList.add("hidden");
    circle.style.setProperty("--progress", 0);
    circle.setAttribute("data-progress", "0");
  }, 180);
}

async function withLoader(text, fn) {
  showLoader(text);
  try {
    return await fn();
  } finally {
    hideLoader();
  }
}

function setImageOrHide(imgEl, url) {
  if (!imgEl) return;

  const clean = String(url || "").trim();

  if (!clean) {
    imgEl.removeAttribute("src");
    imgEl.classList.add("hidden");
    return;
  }

  imgEl.crossOrigin = "anonymous";
  imgEl.referrerPolicy = "no-referrer";
  imgEl.src = clean;
  imgEl.classList.remove("hidden");
}

function previewStoreLogo(value) {
  setImageOrHide(qs("settingsLogoPreview"), value);
}

/* =========================================================
   إعدادات محلية
========================================================= */
function defaultPaymentMethods() {
  return [
    { id: "pm_cash", name: "كاش", type: "cash", hint: "دفع نقدي مباشر" },
    { id: "pm_bank", name: "بنك", type: "bank", hint: "تحويل بنكي" },
    { id: "pm_jawwal", name: "جوال باي", type: "jawwal_pay", hint: "دفع عبر جوال باي" },
    { id: "pm_instant", name: "تطبيق فوري", type: "instant_app", hint: "دفع تطبيق فوري" },
    { id: "pm_later", name: "تطبيق لاحق", type: "later_app", hint: "دفع لاحق بتاريخ محدد" },
    { id: "pm_debt", name: "دين", type: "debt", hint: "إضافة على حساب العميل" }
  ];
}

function defaultSettings() {
  return {
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
}

function getLocalSettings() {
  try {
    const raw = localStorage.getItem(`${PREFIX}_SETTINGS`);
    const parsed = raw ? JSON.parse(raw) : null;

    return {
      ...defaultSettings(),
      ...(parsed || {})
    };
  } catch {
    return defaultSettings();
  }
}

function setLocalSettings(settings) {
  localStorage.setItem(`${PREFIX}_SETTINGS`, JSON.stringify({
    ...defaultSettings(),
    ...(settings || {})
  }));
}

async function getClientSettings() {
  const settings = await idbGet("meta", "settings");

  if (settings) {
    return {
      ...defaultSettings(),
      ...settings
    };
  }

  return getLocalSettings();
}

function money(value, settings = null) {
  const st = settings || getLocalSettings();
  const symbol = st.currencySymbol || "₪";
  return `${Number(value || 0).toFixed(2)} ${symbol}`;
}

async function updateCurrencyUI() {
  const settings = await getClientSettings();
  setLocalSettings(settings);

  if (qs("sideCurrencyText")) qs("sideCurrencyText").innerText = `${settings.currencySymbol} ${settings.currencyName}`;
  if (qs("posCurrencyBadge")) qs("posCurrencyBadge").innerText = `${settings.currencySymbol} ${settings.currencyName}`;

  if (qs("sideModeText")) {
    qs("sideModeText").innerText = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";
  }

  if (qs("setCurrentSystemMode")) {
    qs("setCurrentSystemMode").innerText = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";
  }
}

async function getPaymentMethods() {
  const settings = await getClientSettings();
  return Array.isArray(settings.paymentMethods) && settings.paymentMethods.length
    ? settings.paymentMethods
    : defaultPaymentMethods();
}

async function setPaymentMethods(items) {
  const settings = await getClientSettings();

  const next = {
    ...settings,
    paymentMethods: Array.isArray(items) ? items : defaultPaymentMethods(),
    updatedAt: nowIso()
  };

  await idbSet("meta", next);
  setLocalSettings(next);

  if (isOnline() && getLocalSession()?.appMode === "online" && clientRootPath()) {
    await update(ref(db, pathClientSettings()), {
      paymentMethods: next.paymentMethods,
      updatedAt: nowIso()
    });
  }
}

async function getTransferAccounts() {
  const settings = await getClientSettings();
  return Array.isArray(settings.transferAccounts) ? settings.transferAccounts : [];
}

async function setTransferAccounts(items) {
  const settings = await getClientSettings();

  const next = {
    ...settings,
    transferAccounts: Array.isArray(items) ? items : [],
    updatedAt: nowIso()
  };

  await idbSet("meta", next);
  setLocalSettings(next);

  if (isOnline() && getLocalSession()?.appMode === "online" && clientRootPath()) {
    await update(ref(db, pathClientSettings()), {
      transferAccounts: next.transferAccounts,
      updatedAt: nowIso()
    });
  }
}
/* =========================================================
   IndexedDB
========================================================= */
function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);

    req.onupgradeneeded = () => {
      const dbx = req.result;

      const stores = [
        "stores",
        "products",
        "invoices",
        "purchases",
        "supplierPayments",
        "customers",
        "customerPayments",
        "expenses",
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

/* =========================================================
   إدارة الحفظ المحلي والسحابي
========================================================= */
function firebasePathForKind(kind) {
  const map = {
    stores: pathClientStores(),
    products: pathClientProducts(),
    invoices: pathClientInvoices(),
    purchases: pathClientPurchases(),
    supplierPayments: pathClientSupplierPayments(),
    customers: pathClientCustomers(),
    customerPayments: pathClientCustomerPayments(),
    expenses: pathClientExpenses()
  };

  return map[kind] || null;
}

async function queueSync(action, kind, id, payload = null) {
  const row = {
    id: `sync_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    action,
    kind,
    entityId: id,
    payload,
    createdAt: nowIso()
  };

  await idbSet("syncQueue", row);
}

async function getEntity(kind, id) {
  return await idbGet(kind, id);
}

async function saveEntity(kind, id, payload) {
  const finalPayload = {
    ...payload,
    id,
    storeId: payload.storeId || currentStoreId,
    updatedAt: nowIso()
  };

  await idbSet(kind, finalPayload);

  const session = getLocalSession();
  const cloudPath = firebasePathForKind(kind);

  if (isOnline() && session?.appMode === "online" && cloudPath) {
    await set(ref(db, `${cloudPath}/${id}`), finalPayload);
  } else {
    await queueSync("set", kind, id, finalPayload);
  }

  return finalPayload;
}

async function deleteEntity(kind, id) {
  await idbDelete(kind, id);

  const session = getLocalSession();
  const cloudPath = firebasePathForKind(kind);

  if (isOnline() && session?.appMode === "online" && cloudPath) {
    await remove(ref(db, `${cloudPath}/${id}`));
  } else {
    await queueSync("delete", kind, id);
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

/* =========================================================
   تسجيل الدخول والترخيص
========================================================= */
function showLogin(message = "") {
  qs("mainApp")?.classList.add("hidden");
  qs("invoicePage")?.classList.add("hidden");
  qs("licenseExpiredPage")?.classList.add("hidden");
  qs("loginPage")?.classList.remove("hidden");

  const err = qs("loginError");

  if (err) {
    if (message) {
      err.textContent = message;
      err.classList.remove("hidden");
    } else {
      err.textContent = "";
      err.classList.add("hidden");
    }
  }

  lucide.createIcons();
}

function showExpired(message = "انتهى وقت المفتاح أو أصبح غير صالح.") {
  qs("mainApp")?.classList.add("hidden");
  qs("invoicePage")?.classList.add("hidden");
  qs("loginPage")?.classList.add("hidden");
  qs("licenseExpiredPage")?.classList.remove("hidden");

  if (qs("expiredMessage")) qs("expiredMessage").textContent = message;

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

function applyPlanBadgeFromSession() {
  const session = getLocalSession();
  if (!session) return;

  const isUnlimited = session.durationType === "unlimited";

  const label = session.appMode === "offline"
    ? (isUnlimited ? "نسخة برو أوفلاين" : "نسخة أوفلاين")
    : (isUnlimited ? "نسخة برو أونلاين" : "نسخة أونلاين");

  if (qs("licensePlanBadge")) qs("licensePlanBadge").textContent = label;
  if (qs("settingsPlanBadge")) qs("settingsPlanBadge").textContent = label;
}

function updateLicenseUIFromSession() {
  const session = getLocalSession();
  if (!session) return;

  const remaining = session.expiresAt
    ? new Date(session.expiresAt).getTime() - Date.now()
    : null;

  if (qs("sideLicenseKey")) qs("sideLicenseKey").textContent = session.key || "-";
  if (qs("sideLicenseRemaining")) qs("sideLicenseRemaining").textContent = formatRemaining(remaining);

  if (qs("setCurrentKey")) qs("setCurrentKey").textContent = session.key || "-";
  if (qs("setCurrentLicenseType")) qs("setCurrentLicenseType").textContent = durationTypeLabel(session.durationType);
  if (qs("setCurrentLicenseStart")) qs("setCurrentLicenseStart").textContent = formatDateTime(session.startedAt);
  if (qs("setCurrentLicenseEnd")) qs("setCurrentLicenseEnd").textContent = session.expiresAt ? formatDateTime(session.expiresAt) : "غير محدود";
  if (qs("setCurrentLicenseRemaining")) qs("setCurrentLicenseRemaining").textContent = formatRemaining(remaining);

  applyPlanBadgeFromSession();
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
      localStorage.removeItem(LOCAL_ACTIVE_STORE_KEY);
      showExpired("انتهى وقت المفتاح.");
      return;
    }

    if (isOnline() && session.firstVerified) {
      try {
        await refreshSessionFromLicense();
      } catch {}
    }
  }, 10000);
}

async function handleLicenseLogin() {
  const key = qs("licenseKeyInput")?.value.trim();
  const err = qs("loginError");

  if (err) err.classList.add("hidden");

  if (!key) {
    if (err) {
      err.textContent = "يرجى إدخال المفتاح";
      err.classList.remove("hidden");
    }
    return;
  }

  if (!isOnline()) {
    showLogin("أول دخول يحتاج إنترنت");
    return;
  }

  try {
    showLoader("جاري التحقق من المفتاح...");

    const snap = await get(ref(db, `${pathLicenses()}/${sanitizeKey(key)}`));

    if (!snap.exists()) {
      hideLoader();
      showLogin("المفتاح غير موجود. تأكد أن المفتاح موجود في مسار التراخيص الجديد.");
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
    localStorage.setItem(LOCAL_ACTIVE_STORE_KEY, "default");

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

/* =========================================================
   تشغيل أولي
========================================================= */
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
  await switchTab("dashboard");
  updateLicenseUIFromSession();
  startLicenseWatcher();

  if (qs("mobileSyncState")) {
    qs("mobileSyncState").textContent = navigator.onLine ? "متصل" : "أوفلاين";
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
    const settingsPayload = defaultSettings();
    await idbSet("meta", settingsPayload);
    setLocalSettings(settingsPayload);
  }

  const counter = await idbGet("meta", "invoiceCounter");

  if (!counter) {
    await idbSet("meta", {
      id: "invoiceCounter",
      value: 0
    });
  }

  const active = localStorage.getItem(LOCAL_ACTIVE_STORE_KEY);
  const activeStore = active ? await idbGet("stores", active) : null;

  if (!active || !activeStore) {
    currentStoreId = "default";
    localStorage.setItem(LOCAL_ACTIVE_STORE_KEY, "default");
  } else {
    currentStoreId = active;
  }

  await setPaymentMethods(await getPaymentMethods());
  await setTransferAccounts(await getTransferAccounts());
}

async function loadCurrentStore() {
  const store = await idbGet("stores", currentStoreId);

  if (!store) return;

  if (qs("sideStoreName")) qs("sideStoreName").textContent = store.name || "اسم المحل";
  if (qs("mobileStoreName")) qs("mobileStoreName").textContent = store.name || "نظام الكاشير";

  setImageOrHide(qs("sideLogo"), store.logo);

  if (qs("invPageStoreName")) qs("invPageStoreName").textContent = store.name || "المحل";
  setImageOrHide(qs("invPageLogo"), store.logo);
}

/* =========================================================
   Realtime + Sync
========================================================= */
async function replaceStoreFromSnap(storeName, snap) {
  const items = snap.exists() ? Object.values(snap.val() || {}) : [];

  await idbClear(storeName);

  for (const item of items) {
    await idbSet(storeName, item);
  }
}

function attachRealtimeListeners() {
  detachRealtimeListeners();

  if (!clientRootPath()) return;

  storesListenerRef = ref(db, pathClientStores());
  productsListenerRef = ref(db, pathClientProducts());
  invoicesListenerRef = ref(db, pathClientInvoices());
  purchasesListenerRef = ref(db, pathClientPurchases());
  supplierPaymentsListenerRef = ref(db, pathClientSupplierPayments());
  customersListenerRef = ref(db, pathClientCustomers());
  customerPaymentsListenerRef = ref(db, pathClientCustomerPayments());
  expensesListenerRef = ref(db, pathClientExpenses());
  settingsListenerRef = ref(db, pathClientSettings());

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

  onValue(settingsListenerRef, async snap => {
    if (snap.exists()) {
      const settings = {
        ...defaultSettings(),
        ...snap.val(),
        id: "settings"
      };

      await idbSet("meta", settings);
      setLocalSettings(settings);
      await updateCurrencyUI();
      await refreshAllVisible();
    }
  });
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
  if (settingsListenerRef) off(settingsListenerRef);
  if (licenseListenerRef) off(licenseListenerRef);

  storesListenerRef = null;
  productsListenerRef = null;
  invoicesListenerRef = null;
  purchasesListenerRef = null;
  supplierPaymentsListenerRef = null;
  customersListenerRef = null;
  customerPaymentsListenerRef = null;
  expensesListenerRef = null;
  settingsListenerRef = null;
  licenseListenerRef = null;
}

async function uploadOfflineDataToCloud() {
  const session = getLocalSession();

  if (!session || session.appMode !== "online") {
    alert("هذه الميزة متاحة فقط لمفتاح أونلاين");
    return;
  }

  if (!isOnline()) {
    alert("هذه العملية تحتاج إنترنت");
    return;
  }

  await withLoader("جاري رفع البيانات إلى السحابة...", async () => {
    const queue = await idbGetAll("syncQueue");

    for (const item of queue.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))) {
      const cloudPath = firebasePathForKind(item.kind);

      if (!cloudPath) continue;

      if (item.action === "set") {
        await set(ref(db, `${cloudPath}/${item.entityId}`), item.payload);
      }

      if (item.action === "delete") {
        await remove(ref(db, `${cloudPath}/${item.entityId}`));
      }

      await idbDelete("syncQueue", item.id);
    }

    const settings = await getClientSettings();
    await update(ref(db, pathClientSettings()), settings);
  });

  showToast("تمت مزامنة البيانات", "success");
}

async function syncCloudToOffline() {
  const session = getLocalSession();

  if (!isOnline() || session?.appMode !== "online" || !clientRootPath()) return;

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

  await replaceStoreFromSnap("stores", storesSnap);
  await replaceStoreFromSnap("products", productsSnap);
  await replaceStoreFromSnap("invoices", invoicesSnap);
  await replaceStoreFromSnap("purchases", purchasesSnap);
  await replaceStoreFromSnap("supplierPayments", supplierPaymentsSnap);
  await replaceStoreFromSnap("customers", customersSnap);
  await replaceStoreFromSnap("customerPayments", customerPaymentsSnap);
  await replaceStoreFromSnap("expenses", expensesSnap);

  const settings = settingsSnap.exists()
    ? {
        ...defaultSettings(),
        ...settingsSnap.val(),
        id: "settings"
      }
    : defaultSettings();

  await idbSet("meta", settings);
  setLocalSettings(settings);

  const counter = counterSnap.exists() ? Number(counterSnap.val()) : 0;

  await idbSet("meta", {
    id: "invoiceCounter",
    value: counter
  });
}
/* =========================================================
   القائمة الجانبية والتبويبات
========================================================= */
function openMobileMenu() {
  qs("sideNav")?.classList.add("open");
  qs("sideBackdrop")?.classList.remove("hidden");
}

function closeMobileMenu() {
  qs("sideNav")?.classList.remove("open");
  qs("sideBackdrop")?.classList.add("hidden");
}

function activateNav(tabId) {
  document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  qs(`tab-${tabId}`)?.classList.remove("hidden");
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");
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

async function refreshAllVisible() {
  await updateCurrencyUI();
  await refreshCategories();

  const visibleTab = [...document.querySelectorAll(".tab-content")]
    .find(el => !el.classList.contains("hidden"))
    ?.id
    ?.replace("tab-", "") || "dashboard";

  if (visibleTab === "dashboard") await renderDashboard();
  if (visibleTab === "pos") await renderPosProducts();

  if (visibleTab === "inventory") {
    await resetProductsAndRender();
  }

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

/* =========================================================
   الإعدادات + طرق الدفع + الحسابات
========================================================= */
async function getClientSettings() {
  const settings = await idbGet("meta", "settings");

  if (settings) {
    return {
      ...defaultSettings(),
      ...settings,
      id: "settings"
    };
  }

  return defaultSettings();
}

function getLocalSettings() {
  return {
    currencyName: localStorage.getItem(`${APP_PREFIX}_currency_name`) || "شيكل",
    currencySymbol: localStorage.getItem(`${APP_PREFIX}_currency_symbol`) || "₪",
    appMode: localStorage.getItem(`${APP_PREFIX}_app_mode`) || "online",
    paymentInfo: localStorage.getItem(`${APP_PREFIX}_payment_info`) || "",
    lowStockDefault: Number(localStorage.getItem(`${APP_PREFIX}_low_stock_default`) || 5),
    expensesDeductDefault: localStorage.getItem(`${APP_PREFIX}_expenses_deduct_default`) !== "false"
  };
}

function setLocalSettings(settings) {
  localStorage.setItem(`${APP_PREFIX}_currency_name`, settings.currencyName || "شيكل");
  localStorage.setItem(`${APP_PREFIX}_currency_symbol`, settings.currencySymbol || "₪");
  localStorage.setItem(`${APP_PREFIX}_app_mode`, settings.appMode || "online");
  localStorage.setItem(`${APP_PREFIX}_payment_info`, settings.paymentInfo || "");
  localStorage.setItem(`${APP_PREFIX}_low_stock_default`, String(settings.lowStockDefault ?? 5));
  localStorage.setItem(`${APP_PREFIX}_expenses_deduct_default`, String(settings.expensesDeductDefault !== false));
}

async function updateCurrencyUI() {
  const settings = await getClientSettings();
  setLocalSettings(settings);

  const txt = `${settings.currencySymbol} ${settings.currencyName}`;

  if (qs("sideCurrencyText")) qs("sideCurrencyText").textContent = txt;
  if (qs("posCurrencyBadge")) qs("posCurrencyBadge").textContent = txt;

  if (qs("sideModeText")) {
    qs("sideModeText").textContent = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";
  }

  if (qs("setCurrentSystemMode")) {
    qs("setCurrentSystemMode").textContent = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";
  }

  const session = getLocalSession();

  if (qs("offlineSyncWrap")) {
    qs("offlineSyncWrap").classList.toggle("hidden", session?.appMode !== "online");
  }
}

function money(value, withName = false, settings = null) {
  const st = settings || getLocalSettings();
  const symbol = st.currencySymbol || "₪";
  const name = st.currencyName || "شيكل";
  const amount = Number(value || 0).toFixed(2);

  return withName ? `${amount} ${name} ${symbol}` : `${amount} ${symbol}`;
}

async function getPaymentMethods() {
  const settings = await getClientSettings();
  return Array.isArray(settings.paymentMethods) && settings.paymentMethods.length
    ? settings.paymentMethods
    : defaultPaymentMethods();
}

async function setPaymentMethods(methods) {
  const settings = await getClientSettings();

  const payload = {
    ...settings,
    paymentMethods: Array.isArray(methods) ? methods : defaultPaymentMethods(),
    updatedAt: nowIso()
  };

  await idbSet("meta", payload);
  setLocalSettings(payload);

  if (isOnline() && getLocalSession()?.appMode === "online") {
    await update(ref(db, pathClientSettings()), payload);
  }
}

function paymentMethodLabel(value) {
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

async function fillPaymentMethodSelect(selectId = "paymentMethod") {
  const select = qs(selectId);
  if (!select) return;

  const methods = await getPaymentMethods();

  select.innerHTML = "";

  methods.forEach(m => {
    const option = document.createElement("option");
    option.value = m.type || m.id || "custom";
    option.textContent = `${m.name || paymentMethodLabel(m.type)}${m.hint ? " - " + m.hint : ""}`;
    option.dataset.methodId = m.id || "";
    select.appendChild(option);
  });
}

async function addPaymentMethod() {
  const name = qs("paymentMethodNameInput")?.value.trim();
  const type = qs("paymentMethodTypeInput")?.value || "custom";
  const hint = qs("paymentMethodHintInput")?.value.trim();

  if (!name) {
    alert("أدخل اسم طريقة الدفع");
    return;
  }

  const methods = await getPaymentMethods();

  methods.push({
    id: `pm_${Date.now()}`,
    name,
    type,
    hint
  });

  await setPaymentMethods(methods);

  if (qs("paymentMethodNameInput")) qs("paymentMethodNameInput").value = "";
  if (qs("paymentMethodHintInput")) qs("paymentMethodHintInput").value = "";

  await renderPaymentMethodsList();
  await fillPaymentMethodSelect("paymentMethod");
  await fillPaymentMethodSelect("manualPaymentMethod");

  showToast("تمت إضافة طريقة الدفع", "success");
}

async function deletePaymentMethod(id) {
  const methods = await getPaymentMethods();
  const filtered = methods.filter(m => m.id !== id);

  await setPaymentMethods(filtered);
  await renderPaymentMethodsList();
  await fillPaymentMethodSelect("paymentMethod");
  await fillPaymentMethodSelect("manualPaymentMethod");

  showToast("تم حذف طريقة الدفع", "success");
}

async function renderPaymentMethodsList() {
  const box = qs("paymentMethodsList");
  if (!box) return;

  const methods = await getPaymentMethods();

  box.innerHTML = "";

  methods.forEach(m => {
    box.innerHTML += `
      <div class="bg-white border rounded-2xl p-4 flex items-center justify-between gap-3">
        <div>
          <div class="font-black">${escapeHtml(m.name || paymentMethodLabel(m.type))}</div>
          <div class="text-xs text-gray-500 mt-1">${escapeHtml(paymentMethodLabel(m.type))}${m.hint ? " - " + escapeHtml(m.hint) : ""}</div>
        </div>

        <button onclick="deletePaymentMethod('${escapeJs(m.id)}')" class="btn-danger px-3 py-2 text-xs">
          حذف
        </button>
      </div>
    `;
  });
}

async function getTransferAccounts() {
  const settings = await getClientSettings();
  return Array.isArray(settings.transferAccounts) ? settings.transferAccounts : [];
}

async function setTransferAccounts(items) {
  const settings = await getClientSettings();

  const payload = {
    ...settings,
    transferAccounts: Array.isArray(items) ? items : [],
    updatedAt: nowIso()
  };

  await idbSet("meta", payload);
  setLocalSettings(payload);

  if (isOnline() && getLocalSession()?.appMode === "online") {
    await update(ref(db, pathClientSettings()), payload);
  }
}

async function addTransferAccount() {
  const type = qs("accountTypeInput")?.value.trim();
  const owner = qs("accountOwnerInput")?.value.trim();
  const number = qs("accountNumberInput")?.value.trim();
  const openingBalance = Number(qs("accountOpeningBalanceInput")?.value || 0);

  if (!type || !owner) {
    alert("أدخل نوع الحساب واسم الحساب");
    return;
  }

  const accounts = await getTransferAccounts();

  accounts.push({
    id: `acc_${Date.now()}`,
    type,
    owner,
    number,
    openingBalance
  });

  await setTransferAccounts(accounts);

  ["accountTypeInput", "accountOwnerInput", "accountNumberInput", "accountOpeningBalanceInput"].forEach(id => {
    if (qs(id)) qs(id).value = "";
  });

  await renderTransferAccountsList();
  await fillAllAccountSelects();

  showToast("تمت إضافة الحساب", "success");
}

async function deleteTransferAccount(id) {
  const accounts = await getTransferAccounts();
  const filtered = accounts.filter(acc => acc.id !== id);

  await setTransferAccounts(filtered);
  await renderTransferAccountsList();
  await fillAllAccountSelects();

  showToast("تم حذف الحساب", "success");
}

function accountDisplayName(acc) {
  if (!acc) return "-";
  return `${acc.type || ""} - ${acc.owner || ""}${acc.number ? " - " + acc.number : ""}`.trim();
}

async function renderTransferAccountsList() {
  const box = qs("accountsList");
  if (!box) return;

  const accounts = await getTransferAccounts();

  box.innerHTML = "";

  if (!accounts.length) {
    box.innerHTML = `
      <div class="text-sm text-gray-500 text-center bg-gray-50 rounded-xl p-4">
        لا توجد حسابات مضافة
      </div>
    `;
    return;
  }

  accounts.forEach(acc => {
    box.innerHTML += `
      <div class="bg-white border rounded-2xl p-4 flex items-center justify-between gap-3">
        <div>
          <div class="font-black">${escapeHtml(acc.owner || "-")}</div>
          <div class="text-xs text-gray-500 mt-1">
            ${escapeHtml(acc.type || "-")} ${acc.number ? " - " + escapeHtml(acc.number) : ""}
          </div>
          <div class="text-xs text-blue-700 mt-1">
            رصيد افتتاحي: ${money(acc.openingBalance || 0)}
          </div>
        </div>

        <button onclick="deleteTransferAccount('${escapeJs(acc.id)}')" class="btn-danger px-3 py-2 text-xs">
          حذف
        </button>
      </div>
    `;
  });
}

async function fillAccountSelect(selectId, includeEmpty = true) {
  const select = qs(selectId);
  if (!select) return;

  const accounts = await getTransferAccounts();

  select.innerHTML = includeEmpty ? `<option value="">اختر الحساب</option>` : "";

  accounts.forEach(acc => {
    const option = document.createElement("option");
    option.value = acc.id;
    option.textContent = accountDisplayName(acc);
    select.appendChild(option);
  });
}

async function fillAllAccountSelects() {
  await fillAccountSelect("transferAccountSelect");
  await fillAccountSelect("transferAccountSelectManual");
  await fillAccountSelect("supplierPaymentAccountSelect");
  await fillAccountSelect("customerPaymentAccountSelect");
}

async function loadSettingsPage() {
  const store = await idbGet("stores", currentStoreId);
  const settings = await getClientSettings();

  if (store) {
    if (qs("setStoreName")) qs("setStoreName").value = store.name || "";
    if (qs("setStoreLogo")) qs("setStoreLogo").value = store.logo || "";
    setImageOrHide(qs("settingsLogoPreview"), store.logo);
  }

  if (qs("currencyNameInput")) qs("currencyNameInput").value = settings.currencyName || "شيكل";
  if (qs("currencySymbolInput")) qs("currencySymbolInput").value = settings.currencySymbol || "₪";
  if (qs("expensesDeductDefaultInput")) qs("expensesDeductDefaultInput").checked = settings.expensesDeductDefault !== false;
  if (qs("lowStockDefaultInput")) qs("lowStockDefaultInput").value = Number(settings.lowStockDefault || 5);

  await renderPaymentMethodsList();
  await renderTransferAccountsList();

  updateLicenseUIFromSession();

  if (qs("setCurrentSystemMode")) {
    qs("setCurrentSystemMode").textContent = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";
  }

  if (qs("offlineSyncWrap")) {
    qs("offlineSyncWrap").classList.toggle("hidden", getLocalSession()?.appMode !== "online");
  }
}

async function saveSettings() {
  const session = getLocalSession();

  await withLoader("جاري حفظ الإعدادات...", async () => {
    const store = await getEntity("stores", currentStoreId);

    if (store) {
      await saveEntity("stores", currentStoreId, {
        ...store,
        name: qs("setStoreName")?.value.trim() || "المحل الرئيسي",
        logo: qs("setStoreLogo")?.value.trim() || ""
      });
    }

    const oldSettings = await getClientSettings();

    const settingsPayload = {
      ...oldSettings,
      id: "settings",
      currencyName: qs("currencyNameInput")?.value.trim() || "شيكل",
      currencySymbol: qs("currencySymbolInput")?.value.trim() || "₪",
      appMode: session?.appMode || "online",
      expensesDeductDefault: qs("expensesDeductDefaultInput")?.checked !== false,
      lowStockDefault: Number(qs("lowStockDefaultInput")?.value || 5),
      updatedAt: nowIso()
    };

    await idbSet("meta", settingsPayload);
    setLocalSettings(settingsPayload);

    if (isOnline() && session?.appMode === "online") {
      await update(ref(db, pathClientSettings()), settingsPayload);
    }
  });

  await loadCurrentStore();
  await updateCurrencyUI();
  await refreshAllVisible();

  showToast("تم حفظ الإعدادات", "success");
}
/* =========================================================
   المنتجات + الوحدات + المخزون
========================================================= */
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
  if (saleUnit === "large") {
    return product.largeUnitName || unitTypeDefaultLarge(product.unitType);
  }

  return product.baseUnitName || unitTypeDefaultBase(product.unitType);
}

function productFactor(product) {
  return Math.max(1, Number(product.unitFactor || 1));
}

function toBaseQty(qty, unit, product) {
  const n = Number(qty || 0);

  if (unit === "large") {
    return n * productFactor(product);
  }

  return n;
}

function fromBaseQty(qty, unit, product) {
  const n = Number(qty || 0);

  if (unit === "large") {
    return n / productFactor(product);
  }

  return n;
}

function salePriceForUnit(product, unit = "base") {
  if (unit === "large") {
    if (Number(product.largePrice || 0) > 0) return Number(product.largePrice || 0);
    return Number(product.price || 0) * productFactor(product);
  }

  return Number(product.price || 0);
}

function costPriceForUnit(product, unit = "base") {
  if (unit === "large") {
    if (Number(product.largeCost || 0) > 0) return Number(product.largeCost || 0);
    return Number(product.cost || 0) * productFactor(product);
  }

  return Number(product.cost || 0);
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

  if (qs("prodStock")) {
    qs("prodStock").value = roundSmart(stock);
  }
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

  return {
    id: existing?.id || `p_${Date.now()}`,
    storeId: currentStoreId,
    name: qs("prodName")?.value.trim() || "",
    category: qs("prodCategory")?.value.trim() || "",
    code: qs("prodCode")?.value.trim() || "",
    image: qs("prodImage")?.value.trim() || "",
    supplier: qs("prodSupplier")?.value.trim() || "",
    lowStockLimit: Number(qs("prodLowStockLimit")?.value || getLocalSettings().lowStockDefault || 5),

    unitType,
    baseUnitName: qs("prodBaseUnitName")?.value.trim() || unitTypeDefaultBase(unitType),
    largeUnitName: qs("prodLargeUnitName")?.value.trim() || unitTypeDefaultLarge(unitType),
    unitFactor: factor,

    stock: Number(qs("prodStock")?.value || 0),

    cost: Number(qs("prodCost")?.value || 0),
    price: Number(qs("prodPrice")?.value || 0),
    largeCost: Number(qs("prodLargeCost")?.value || 0),
    largePrice: Number(qs("prodLargePrice")?.value || 0),
    pricingMode: qs("prodPricingMode")?.value || "base",

    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}

function resetProductForm() {
  if (qs("editProductId")) qs("editProductId").value = "";

  if (qs("modalTitle")) {
    qs("modalTitle").textContent = "إضافة صنف جديد";
  }

  [
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
  ].forEach(id => {
    if (qs(id)) qs(id).value = "";
  });

  if (qs("prodUnitType")) qs("prodUnitType").value = "piece";
  if (qs("prodUnitFactor")) qs("prodUnitFactor").value = 1;
  if (qs("prodStockInputUnit")) qs("prodStockInputUnit").value = "base";
  if (qs("prodPricingMode")) qs("prodPricingMode").value = "base";

  const st = getLocalSettings();

  if (qs("prodLowStockLimit")) {
    qs("prodLowStockLimit").value = Number(st.lowStockDefault || 5);
  }

  syncUnitLabels();
}

function fillProductForm(p) {
  if (qs("editProductId")) qs("editProductId").value = p.id || "";

  if (qs("modalTitle")) {
    qs("modalTitle").textContent = "تعديل الصنف";
  }

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
  await renderDashboard();
}

function productStockStatus(product) {
  const stock = Number(product.stock || 0);
  const limit = Number(product.lowStockLimit ?? getLocalSettings().lowStockDefault ?? 5);

  if (stock <= 0) {
    return {
      label: "نفد",
      cls: "bg-red-100 text-red-700"
    };
  }

  if (stock <= limit) {
    return {
      label: "ناقص",
      cls: "bg-orange-100 text-orange-700"
    };
  }

  return {
    label: "متوفر",
    cls: "bg-green-100 text-green-700"
  };
}

function productImageHtml(product, sizeClass = "w-12 h-12") {
  if (product.image) {
    return `
      <img
        src="${escapeHtmlAttr(product.image)}"
        class="${sizeClass} rounded-xl object-cover border"
        crossorigin="anonymous"
        referrerpolicy="no-referrer"
      >
    `;
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

  if (!visible.length) {
    table.innerHTML = `
      <tr>
        <td colspan="10" class="p-8 text-center text-gray-400">
          لا توجد منتجات
        </td>
      </tr>
    `;
  }

  visible.forEach(p => {
    const status = productStockStatus(p);

    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50 transition">
        <td class="p-4">${productImageHtml(p)}</td>
        <td class="p-4 font-mono text-xs">${escapeHtml(p.code || "-")}</td>
        <td class="p-4 font-black text-gray-700">${escapeHtml(p.name || "-")}</td>
        <td class="p-4 text-sm">${escapeHtml(p.category || "-")}</td>
        <td class="p-4 text-sm">${escapeHtml(p.supplier || "-")}</td>
        <td class="p-4 text-sm">${escapeHtml(unitLabel(p, "base"))}</td>
        <td class="p-4">
          <div class="font-black">${roundSmart(p.stock || 0)} ${escapeHtml(unitLabel(p, "base"))}</div>
          <span class="inline-block mt-1 px-3 py-1 rounded-full text-xs font-black ${status.cls}">
            ${status.label}
          </span>
        </td>
        <td class="p-4 text-sm text-slate-600">${money(p.cost || 0)}</td>
        <td class="p-4 text-blue-700 font-black">${money(p.price || 0)}</td>
        <td class="p-4">
          <div class="flex gap-2 flex-wrap">
            <button onclick="showProductBarcode('${escapeJs(p.code || "")}','${escapeJs(p.name || "")}')" class="text-purple-600 bg-purple-50 px-3 py-1 rounded-lg text-xs font-black">
              باركود
            </button>

            <button onclick="editProduct('${escapeJs(p.id)}')" class="text-blue-600 bg-blue-50 px-3 py-1 rounded-lg text-xs font-black">
              تعديل
            </button>

            <button onclick="deleteProduct('${escapeJs(p.id)}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-black">
              حذف
            </button>
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
    qs("posCategoryFilter"),
    qs("inventoryCategoryFilter"),
    qs("shortageCategoryFilter")
  ].filter(Boolean);

  selects.forEach(select => {
    const current = select.value || "all";

    select.innerHTML = `<option value="all">كل التصنيفات</option>`;

    categories.forEach(cat => {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      select.appendChild(option);
    });

    if ([...select.options].some(o => o.value === current)) {
      select.value = current;
    }
  });
}

function showProductBarcode(code, title) {
  if (!code) {
    alert("هذا الصنف لا يحتوي على باركود");
    return;
  }

  if (qs("barcodeTitle")) qs("barcodeTitle").textContent = title || "باركود المنتج";
  if (qs("barcodeText")) qs("barcodeText").textContent = code;

  const svg = qs("productBarcodeSvg");

  if (!svg) return;

  svg.innerHTML = "";

  try {
    JsBarcode(svg, String(code), {
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
/* =========================================================
   الكاشير + شبكة البيع + السلة
========================================================= */
async function filteredProductsForPOS() {
  const query = (qs("posSearch")?.value || "").toLowerCase().trim();
  const cat = qs("posCategoryFilter")?.value || "all";

  const products = await getAllProducts();

  return products
    .filter(p => p.storeId === currentStoreId)
    .filter(p => cat === "all" || (p.category || "") === cat)
    .filter(p => {
      const hay = `${p.name || ""} ${p.code || ""} ${p.category || ""} ${p.supplier || ""}`.toLowerCase();
      return !query || hay.includes(query);
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"));
}

async function renderPosProducts() {
  const grid = qs("posProductsGrid");
  if (!grid) return;

  const products = await filteredProductsForPOS();

  grid.innerHTML = "";

  if (!products.length) {
    grid.innerHTML = `
      <div class="col-span-full p-10 text-center text-gray-400 bg-white rounded-2xl border">
        لا توجد أصناف
      </div>
    `;
    return;
  }

  products.slice(0, 80).forEach(p => {
    const status = productStockStatus(p);
    const disabled = Number(p.stock || 0) <= 0;

    grid.innerHTML += `
      <button
        type="button"
        onclick="addToCartById('${escapeJs(p.id)}')"
        class="product-grid-card text-right ${disabled ? "opacity-50" : ""}"
        ${disabled ? "disabled" : ""}
      >
        <div class="product-img">
          ${
            p.image
              ? `<img src="${escapeHtmlAttr(p.image)}" crossorigin="anonymous" referrerpolicy="no-referrer">`
              : `<i data-lucide="package" class="text-gray-300" size="42"></i>`
          }
        </div>

        <div class="p-3">
          <div class="font-black text-sm line-clamp-1">${escapeHtml(p.name || "-")}</div>

          <div class="text-xs text-gray-500 mt-1 line-clamp-1">
            ${escapeHtml(p.category || "بدون تصنيف")}
          </div>

          <div class="flex justify-between items-center gap-2 mt-3">
            <div class="text-blue-700 font-black text-sm">
              ${money(p.price || 0)}
            </div>

            <span class="px-2 py-1 rounded-full text-[10px] font-black ${status.cls}">
              ${roundSmart(p.stock || 0)}
            </span>
          </div>
        </div>
      </button>
    `;
  });

  lucide.createIcons();
}

async function searchPosProducts() {
  await renderPosProducts();

  const query = (qs("posSearch")?.value || "").toLowerCase().trim();
  const results = qs("posSearchResults");

  if (!results) return;

  if (!query) {
    results.classList.add("hidden");
    return;
  }

  const products = await filteredProductsForPOS();

  results.innerHTML = "";

  if (!products.length) {
    results.innerHTML = `<div class="p-4 text-center text-gray-400">لا توجد نتائج</div>`;
  } else {
    products.slice(0, 15).forEach(p => {
      const row = document.createElement("div");
      row.className = "flex justify-between items-center p-4 hover:bg-blue-50 cursor-pointer rounded-xl gap-3";

      row.innerHTML = `
        <div class="flex items-center gap-3">
          ${productImageHtml(p, "w-10 h-10")}

          <div>
            <p class="font-black">${escapeHtml(p.name || "-")}</p>
            <p class="text-xs text-gray-400">${escapeHtml(p.code || "-")} - ${escapeHtml(p.category || "-")}</p>
            <p class="text-xs text-green-700">المتوفر: ${roundSmart(p.stock || 0)} ${escapeHtml(unitLabel(p, "base"))}</p>
          </div>
        </div>

        <div class="text-left whitespace-nowrap">
          <b class="text-blue-700">${money(p.price || 0)}</b>
        </div>
      `;

      row.onclick = () => {
        addToCart(p);
        results.classList.add("hidden");
        if (qs("posSearch")) qs("posSearch").value = "";
      };

      results.appendChild(row);
    });
  }

  results.classList.remove("hidden");
  lucide.createIcons();
}

async function addToCartById(id) {
  const p = await getEntity("products", id);

  if (!p) {
    alert("الصنف غير موجود");
    return;
  }

  addToCart(p);
}

function makeCartLineKey(productId, saleUnit = "base") {
  return `${productId}__${saleUnit}`;
}

function addToCart(product) {
  const p = clone(product);
  const saleUnit = "base";
  const key = makeCartLineKey(p.id, saleUnit);
  const existing = cart.find(i => i.lineKey === key);

  const availableBase = Number(p.stock || 0);
  const addBaseQty = toBaseQty(1, saleUnit, p);

  if (availableBase < addBaseQty) {
    alert("الكمية غير متوفرة في المخزون");
    return;
  }

  if (existing) {
    const newBaseQty = existing.baseQty + addBaseQty;

    if (newBaseQty > availableBase) {
      alert("الكمية المطلوبة أكبر من المتوفر");
      return;
    }

    existing.qty += 1;
    existing.baseQty = newBaseQty;
  } else {
    cart.push({
      lineKey: key,
      id: p.id,
      name: p.name,
      code: p.code || "",
      category: p.category || "",
      saleUnit,
      unitName: unitLabel(p, saleUnit),
      unitFactor: productFactor(p),
      qty: 1,
      baseQty: addBaseQty,
      price: salePriceForUnit(p, saleUnit),
      cost: costPriceForUnit(p, saleUnit),
      basePrice: Number(p.price || 0),
      baseCost: Number(p.cost || 0)
    });
  }

  renderCart();
  showToast(`تمت إضافة ${p.name}`, "success");
}

async function changeCartUnit(lineKey, newUnit) {
  const line = cart.find(i => i.lineKey === lineKey);
  if (!line) return;

  const product = await getEntity("products", line.id);
  if (!product) return;

  const newBaseQty = toBaseQty(line.qty, newUnit, product);

  if (newBaseQty > Number(product.stock || 0)) {
    alert("الكمية غير متوفرة لهذه الوحدة");
    renderCart();
    return;
  }

  line.saleUnit = newUnit;
  line.unitName = unitLabel(product, newUnit);
  line.unitFactor = productFactor(product);
  line.baseQty = newBaseQty;
  line.price = salePriceForUnit(product, newUnit);
  line.cost = costPriceForUnit(product, newUnit);

  const oldKey = line.lineKey;
  line.lineKey = makeCartLineKey(line.id, newUnit);

  const duplicate = cart.find(i => i !== line && i.lineKey === line.lineKey);

  if (duplicate) {
    duplicate.qty += line.qty;
    duplicate.baseQty += line.baseQty;
    cart = cart.filter(i => i !== line);
  }

  renderCart();
}

async function changeQty(lineKey, delta) {
  const line = cart.find(i => i.lineKey === lineKey);
  if (!line) return;

  const product = await getEntity("products", line.id);
  if (!product) return;

  const newQty = Number(line.qty || 0) + Number(delta || 0);

  if (newQty <= 0) {
    removeFromCart(lineKey);
    return;
  }

  const newBaseQty = toBaseQty(newQty, line.saleUnit, product);

  if (newBaseQty > Number(product.stock || 0)) {
    alert("الكمية غير كافية");
    return;
  }

  line.qty = newQty;
  line.baseQty = newBaseQty;

  renderCart();
}

function removeFromCart(lineKey) {
  cart = cart.filter(i => i.lineKey !== lineKey);
  renderCart();
}

function clearCart() {
  cart = [];
  editingInvoiceId = null;
  renderCart();
  updateCreateInvoiceButton();
}

function renderCartUnitSelect(line) {
  return `
    <select onchange="changeCartUnit('${escapeJs(line.lineKey)}', this.value)" class="input-bordered min-w-[120px] py-2">
      <option value="base" ${line.saleUnit === "base" ? "selected" : ""}>${escapeHtml(line.unitName || "وحدة")}</option>
      <option value="large" ${line.saleUnit === "large" ? "selected" : ""}>وحدة كبيرة</option>
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
          <td class="p-4 font-black whitespace-nowrap">${escapeHtml(item.name || "-")}</td>

          <td class="p-4 whitespace-nowrap">
            <select onchange="changeCartUnit('${escapeJs(item.lineKey)}', this.value)" class="bg-gray-50 border rounded-lg p-2 text-sm">
              <option value="base" ${item.saleUnit === "base" ? "selected" : ""}>${escapeHtml(item.unitName || "وحدة")}</option>
              <option value="large" ${item.saleUnit === "large" ? "selected" : ""}>وحدة كبيرة</option>
            </select>
          </td>

          <td class="p-4 whitespace-nowrap">${money(item.price || 0)}</td>

          <td class="p-4 whitespace-nowrap">
            <div class="flex items-center gap-2">
              <button onclick="changeQty('${escapeJs(item.lineKey)}', -1)" class="w-8 h-8 bg-gray-100 rounded-lg font-black">-</button>
              <span class="w-10 text-center font-black">${roundSmart(item.qty || 0)}</span>
              <button onclick="changeQty('${escapeJs(item.lineKey)}', 1)" class="w-8 h-8 bg-gray-100 rounded-lg font-black">+</button>
            </div>
          </td>

          <td class="p-4 font-black text-blue-700 whitespace-nowrap">
            ${money(Number(item.price || 0) * Number(item.qty || 0))}
          </td>

          <td class="p-4 whitespace-nowrap">
            <button onclick="removeFromCart('${escapeJs(item.lineKey)}')" class="text-red-500">
              <i data-lucide="trash-2" size="18"></i>
            </button>
          </td>
        </tr>
      `;
    });
  }

  lucide.createIcons();
  calculateTotal();
}

function calculateDiscountValue(subtotal) {
  const discountType = qs("discountType")?.value || "fixed";
  const raw = Number(qs("posDiscount")?.value || 0);

  if (discountType === "percent") {
    return subtotal * (Math.max(0, Math.min(100, raw)) / 100);
  }

  return Math.max(0, raw);
}

function getCartTotals() {
  const subtotal = cart.reduce((sum, item) => {
    return sum + Number(item.price || 0) * Number(item.qty || 0);
  }, 0);

  const discount = calculateDiscountValue(subtotal);
  const total = Math.max(0, subtotal - discount);

  const totalCost = cart.reduce((sum, item) => {
    return sum + Number(item.cost || 0) * Number(item.qty || 0);
  }, 0);

  return {
    subtotal,
    discount,
    total,
    totalCost,
    profit: total - totalCost
  };
}

function calculateTotal() {
  const totals = getCartTotals();

  if (qs("subtotal")) qs("subtotal").textContent = money(totals.subtotal);
  if (qs("discountPreview")) qs("discountPreview").textContent = money(totals.discount);
  if (qs("finalTotal")) qs("finalTotal").textContent = money(totals.total);

  if (qs("paymentModalSubtotal")) qs("paymentModalSubtotal").textContent = money(totals.subtotal);
  if (qs("paymentModalDiscount")) qs("paymentModalDiscount").textContent = money(totals.discount);
  if (qs("paymentModalTotal")) qs("paymentModalTotal").textContent = money(totals.total);
}

async function validateCartAgainstStock() {
  for (const item of cart) {
    const product = await getEntity("products", item.id);

    if (!product) {
      alert(`الصنف غير موجود: ${item.name}`);
      return false;
    }

    if (Number(product.stock || 0) < Number(item.baseQty || 0)) {
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

    const changeQty = Number(item.baseQty ?? item.qty ?? 0);

    const updated = {
      ...product,
      stock: Math.max(0, Number(product.stock || 0) + direction * changeQty),
      updatedAt: nowIso()
    };

    await saveEntity("products", product.id, updated);
  }
}

async function openPaymentModal() {
  if (!cart.length) {
    alert("السلة فارغة");
    return;
  }

  calculateTotal();

  await fillPaymentMethodSelect("paymentMethod");
  await fillAllAccountSelects();

  if (!editingInvoiceId) {
    if (qs("customerName")) qs("customerName").value = "";
    if (qs("customerPhone")) qs("customerPhone").value = "";
    if (qs("paymentMethod")) qs("paymentMethod").value = "cash";
    if (qs("invoiceStatus")) qs("invoiceStatus").value = "paid";
    if (qs("transferAccountSelect")) qs("transferAccountSelect").value = "";
    if (qs("transferNumberInput")) qs("transferNumberInput").value = "";
    if (qs("dueModeInput")) qs("dueModeInput").value = "";
    if (qs("dueDateInput")) qs("dueDateInput").value = "";
    if (qs("invoiceNotes")) qs("invoiceNotes").value = "";
  }

  toggleModal("paymentModal", true);
}

function updateCreateInvoiceButton() {
  if (qs("createInvoiceBtn")) {
    qs("createInvoiceBtn").textContent = editingInvoiceId ? "حفظ تعديل البيع" : "حفظ البيع";
  }

  if (qs("openPaymentModalBtn")) {
    qs("openPaymentModalBtn").textContent = editingInvoiceId ? "متابعة تعديل الفاتورة" : "حفظ البيع واختيار الدفع";
  }
}

function inferStatusFromPayment(method) {
  if (method === "debt") return "unpaid";
  if (method === "later_app") return "pending";
  return "paid";
}

async function buildInvoicePayload(id, oldInvoice = null) {
  const settings = await getClientSettings();
  const totals = getCartTotals();

  const paymentMethod = qs("paymentMethod")?.value || "cash";
  const selectedAccountId = qs("transferAccountSelect")?.value || "";
  const accounts = await getTransferAccounts();
  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || null;

  const statusFromInput = qs("invoiceStatus")?.value || inferStatusFromPayment(paymentMethod);

  return {
    id: String(id),
    storeId: currentStoreId,
    date: oldInvoice?.date || nowIso(),
    updatedAt: nowIso(),

    customer: qs("customerName")?.value.trim() || "زبون نقدي",
    phone: qs("customerPhone")?.value.trim() || "",

    paymentMethod,
    paymentMethodLabel: paymentMethodLabel(paymentMethod),

    status: statusFromInput,

    transferAccountId: selectedAccountId,
    transferAccountType: selectedAccount?.type || "",
    transferAccountName: selectedAccount?.owner || "",
    transferAccountNo: selectedAccount?.number || "",
    transferNumber: qs("transferNumberInput")?.value.trim() || "",

    dueMode: qs("dueModeInput")?.value || "",
    dueDate: qs("dueDateInput")?.value || "",

    notes: qs("invoiceNotes")?.value.trim() || "",

    discountType: qs("discountType")?.value || "fixed",
    discountRaw: Number(qs("posDiscount")?.value || 0),

    currencyName: settings.currencyName,
    currencySymbol: settings.currencySymbol,

    items: cart.map(i => clone(i)),

    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
    totalCost: totals.totalCost,
    profit: totals.profit,

    source: "pos"
  };
}

function clearInvoiceEditor() {
  cart = [];
  editingInvoiceId = null;

  renderCart();

  if (qs("discountType")) qs("discountType").value = "fixed";
  if (qs("posDiscount")) qs("posDiscount").value = 0;

  if (qs("customerName")) qs("customerName").value = "";
  if (qs("customerPhone")) qs("customerPhone").value = "";
  if (qs("paymentMethod")) qs("paymentMethod").value = "cash";
  if (qs("invoiceStatus")) qs("invoiceStatus").value = "paid";
  if (qs("transferAccountSelect")) qs("transferAccountSelect").value = "";
  if (qs("transferNumberInput")) qs("transferNumberInput").value = "";
  if (qs("dueModeInput")) qs("dueModeInput").value = "";
  if (qs("dueDateInput")) qs("dueDateInput").value = "";
  if (qs("invoiceNotes")) qs("invoiceNotes").value = "";

  updateCreateInvoiceButton();
  calculateTotal();
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

async function checkout() {
  if (!cart.length) {
    alert("السلة فارغة");
    return;
  }

  if (!(await validateCartAgainstStock())) return;

  try {
    if (editingInvoiceId) {
      await withLoader("جاري حفظ تعديل الفاتورة...", async () => {
        const oldInvoice = await getEntity("invoices", editingInvoiceId);

        if (!oldInvoice) {
          throw new Error("الفاتورة الأصلية غير موجودة");
        }

        if (oldInvoice.source === "pos") {
          await applyStockChange(oldInvoice.items || [], +1);
        }

        if (!(await validateCartAgainstStock())) {
          if (oldInvoice.source === "pos") {
            await applyStockChange(oldInvoice.items || [], -1);
          }

          throw new Error("المخزون غير كافٍ بعد التعديل");
        }

        await applyStockChange(cart, -1);

        const newInvoice = await buildInvoicePayload(editingInvoiceId, oldInvoice);
        await saveEntity("invoices", editingInvoiceId, newInvoice);
        await ensureCustomerFromInvoice(newInvoice);

        currentInvoiceId = editingInvoiceId;
      });

      toggleModal("paymentModal", false);
      showToast("تم حفظ تعديل الفاتورة", "success");

      const id = editingInvoiceId;
      clearInvoiceEditor();

      await refreshAfterSale();
      await viewInvoice(id);
      return;
    }

    let newId = "";

    await withLoader("جاري حفظ البيع...", async () => {
      const invoiceNumber = await getNextInvoiceNumber();
      const invoice = await buildInvoicePayload(invoiceNumber);

      await applyStockChange(cart, -1);
      await saveEntity("invoices", invoice.id, invoice);
      await ensureCustomerFromInvoice(invoice);

      newId = invoice.id;
      currentInvoiceId = invoice.id;
    });

    toggleModal("paymentModal", false);
    showToast("تم حفظ البيع", "success");

    clearInvoiceEditor();

    await refreshAfterSale();
    await viewInvoice(newId);
  } catch (err) {
    console.error(err);
    alert(err.message || "تعذر حفظ البيع");
  }
}

async function refreshAfterSale() {
  await renderPosProducts();
  await resetProductsAndRender();
  await resetInvoicesAndRender();
  await renderSalesSummary();
  await renderDashboard();
}
/* =========================================================
   فواتير المبيعات + العرض + الطباعة والتصدير
========================================================= */
async function filteredInvoices() {
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
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

async function renderInvoices() {
  const table = qs("invoicesTable");
  const loading = qs("invoicesLoading");
  const moreWrap = qs("invoicesLoadMoreWrap");

  if (!table) return;

  table.innerHTML = "";
  loading?.classList.remove("hidden");

  const filtered = await filteredInvoices();
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
        <td class="p-4 font-black">#${escapeHtml(inv.id || "-")}</td>

        <td class="p-4 text-xs text-gray-500">
          ${formatDateTime(inv.date)}
        </td>

        <td class="p-4">
          <button onclick="openCustomerHistory('${escapeJs(inv.customer || "")}','${escapeJs(inv.phone || "")}')" class="text-blue-700 font-black hover:underline">
            ${escapeHtml(inv.customer || "-")}
          </button>
        </td>

        <td class="p-4 text-sm">
          ${escapeHtml(inv.phone || "-")}
        </td>

        <td class="p-4 text-sm">
          ${escapeHtml(inv.paymentMethodLabel || paymentMethodLabel(inv.paymentMethod))}
        </td>

        <td class="p-4 text-xs">
          ${escapeHtml(inv.transferNumber || inv.transferAccountNo || "-")}
        </td>

        <td class="p-4">
          <button onclick="openStatusModal('${escapeJs(inv.id)}','${escapeJs(inv.status || "paid")}')" class="status-pill ${statusClass(inv.status || "paid")}">
            ${statusLabel(inv.status || "paid")}
          </button>
        </td>

        <td class="p-4 font-black text-blue-700">
          ${money(inv.total || 0)}
        </td>

        <td class="p-4">
          ${
            inv.notes
              ? `<button onclick="openNoteModal('${escapeJs(inv.notes)}')" class="text-slate-700 bg-slate-100 px-3 py-1 rounded-lg text-xs font-bold">عرض</button>`
              : `<span class="text-gray-300">-</span>`
          }
        </td>

        <td class="p-4">
          <div class="flex gap-2 flex-wrap">
            <button onclick="viewInvoice('${escapeJs(inv.id)}')" class="text-blue-600 bg-blue-50 px-3 py-1 rounded-lg text-xs font-bold">عرض</button>
            <button onclick="editInvoice('${escapeJs(inv.id)}')" class="text-amber-600 bg-amber-50 px-3 py-1 rounded-lg text-xs font-bold">تعديل</button>
            <button onclick="deleteInvoice('${escapeJs(inv.id)}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-bold">حذف</button>
          </div>
        </td>
      </tr>
    `;
  });

  loading?.classList.add("hidden");
  moreWrap?.classList.toggle("hidden", visible.length >= filtered.length);

  lucide.createIcons();
}

async function resetInvoicesAndRender() {
  invoicesCurrentLimit = invoicePageSize;
  await renderInvoices();
}

async function loadMoreInvoices() {
  invoicesCurrentLimit += invoicePageSize;
  await renderInvoices();
}

async function renderSalesSummary() {
  const invoices = await getAllInvoices();
  const range = qs("salesReportRange")?.value || "day";
  const customDate = qs("salesReportDate")?.value || "";

  const filtered = invoices.filter(inv =>
    inv.storeId === currentStoreId &&
    inRangeByFilter(inv.date, range, customDate)
  );

  let total = 0;
  let paid = 0;
  let pending = 0;

  filtered.forEach(inv => {
    const amount = Number(inv.total || 0);
    total += amount;

    if ((inv.status || "paid") === "paid") paid += amount;
    else pending += amount;
  });

  if (qs("salesTotalAmount")) qs("salesTotalAmount").textContent = money(total);
  if (qs("salesPaidAmount")) qs("salesPaidAmount").textContent = money(paid);
  if (qs("salesPendingAmount")) qs("salesPendingAmount").textContent = money(pending);
  if (qs("salesInvoicesCount")) qs("salesInvoicesCount").textContent = filtered.length;
}

async function editInvoice(id) {
  const inv = await getEntity("invoices", id);

  if (!inv) {
    alert("الفاتورة غير موجودة");
    return;
  }

  if (inv.source !== "pos") {
    alert("الفاتورة المباشرة يمكن تعديلها من قسم الفواتير المباشرة لاحقًا");
  }

  editingInvoiceId = id;
  cart = (inv.items || []).map(i => clone(i));

  if (qs("customerName")) qs("customerName").value = inv.customer || "";
  if (qs("customerPhone")) qs("customerPhone").value = inv.phone || "";
  if (qs("paymentMethod")) qs("paymentMethod").value = inv.paymentMethod || "cash";
  if (qs("invoiceStatus")) qs("invoiceStatus").value = inv.status || "paid";
  if (qs("transferAccountSelect")) qs("transferAccountSelect").value = inv.transferAccountId || "";
  if (qs("transferNumberInput")) qs("transferNumberInput").value = inv.transferNumber || "";
  if (qs("dueModeInput")) qs("dueModeInput").value = inv.dueMode || "";
  if (qs("dueDateInput")) qs("dueDateInput").value = inv.dueDate || "";
  if (qs("invoiceNotes")) qs("invoiceNotes").value = inv.notes || "";
  if (qs("discountType")) qs("discountType").value = inv.discountType || "fixed";
  if (qs("posDiscount")) qs("posDiscount").value = Number(inv.discountRaw || 0);

  updateCreateInvoiceButton();
  renderCart();
  await switchTab("pos");
  await openPaymentModal();
}

async function deleteInvoice(id) {
  if (!confirm("حذف الفاتورة؟ سيتم إرجاع كميات الأصناف للمخزون إذا كانت فاتورة كاشير.")) return;

  await withLoader("جاري حذف الفاتورة...", async () => {
    const inv = await getEntity("invoices", id);

    if (!inv) return;

    if (inv.source === "pos") {
      await applyStockChange(inv.items || [], +1);
    }

    await deleteEntity("invoices", id);
  });

  if (editingInvoiceId === id) clearInvoiceEditor();

  showToast("تم حذف الفاتورة", "success");

  await resetInvoicesAndRender();
  await renderSalesSummary();
  await renderDashboard();
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
      width: 1.4,
      height: 42,
      displayValue: false,
      margin: 0
    });
  } catch {}

  if (qs("invoiceBarcodeText")) qs("invoiceBarcodeText").textContent = code;
}

async function viewInvoice(id) {
  await showLoader("جاري تحميل الفاتورة...");

  try {
    const inv = await getEntity("invoices", id);

    if (!inv) {
      hideLoader();
      alert("الفاتورة غير موجودة");
      return;
    }

    currentInvoiceId = id;

    let store = await idbGet("stores", inv.storeId);
    if (!store) store = { name: "المحل", logo: "" };

    if (qs("mainApp")) qs("mainApp").classList.add("hidden");
    if (qs("invoicePage")) qs("invoicePage").classList.remove("hidden");

    if (qs("invPageStoreName")) qs("invPageStoreName").textContent = store.name || "المحل";
    setImageOrHide(qs("invPageLogo"), store.logo);

    if (qs("invPageCustomer")) qs("invPageCustomer").textContent = inv.customer || "-";
    if (qs("invPagePhone")) qs("invPagePhone").textContent = inv.phone || "-";
    if (qs("invPagePayment")) qs("invPagePayment").textContent = inv.paymentMethodLabel || paymentMethodLabel(inv.paymentMethod);
    if (qs("invPageTransferNo")) qs("invPageTransferNo").textContent = inv.transferNumber || inv.transferAccountNo || "-";

    if (qs("invPageId")) qs("invPageId").textContent = `#${inv.id}`;
    if (qs("invPageDate")) qs("invPageDate").textContent = formatDateTime(inv.date);
    if (qs("invPageStatus")) qs("invPageStatus").textContent = statusLabel(inv.status || "paid");
    if (qs("invPageEmployee")) qs("invPageEmployee").textContent = inv.employeeName || "-";
    if (qs("invPageNotes")) qs("invPageNotes").textContent = inv.notes || "-";

    const tbody = qs("invPageItems");

    if (tbody) {
      tbody.innerHTML = "";

      (inv.items || []).forEach((item, index) => {
        tbody.innerHTML += `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.name || "-")}</td>
            <td>${escapeHtml(item.unitName || "-")}</td>
            <td>${roundSmart(item.qty || 0)}</td>
            <td>${Number(item.price || 0).toFixed(2)} ${escapeHtml(inv.currencySymbol || "₪")}</td>
            <td>${(Number(item.price || 0) * Number(item.qty || 0)).toFixed(2)} ${escapeHtml(inv.currencySymbol || "₪")}</td>
          </tr>
        `;
      });
    }

    if (qs("invPageSub")) qs("invPageSub").textContent = `${Number(inv.subtotal || 0).toFixed(2)} ${inv.currencySymbol || "₪"}`;
    if (qs("invPageDiscount")) qs("invPageDiscount").textContent = `${Number(inv.discount || 0).toFixed(2)} ${inv.currencySymbol || "₪"}`;
    if (qs("invPageTotal")) qs("invPageTotal").textContent = `${Number(inv.total || 0).toFixed(2)} ${inv.currencySymbol || "₪"}`;

    renderInvoiceBarcode(id);

    lucide.createIcons();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } finally {
    hideLoader();
  }
}

function backFromInvoicePage() {
  if (qs("invoicePage")) qs("invoicePage").classList.add("hidden");
  if (qs("mainApp")) qs("mainApp").classList.remove("hidden");
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
    } catch {}
  }

  await ensureImagesLoaded(container);
  await wait(150);

  return () => {
    restoreList.forEach(fn => {
      try { fn(); } catch {}
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
  const restoreImages = await prepareImagesForCanvas(area);
  await wait(120);

  return () => {
    try { restoreImages(); } catch {}
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
        unit: "px",
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`فاتورة_${currentInvoiceId || Date.now()}.pdf`);
    }
  } catch (err) {
    console.error(err);
    alert("تعذر تصدير الفاتورة. تأكد من رابط الشعار أو الاتصال.");
  } finally {
    restore();
    hideLoader();
  }
}

async function shareCurrentInvoice() {
  if (!currentInvoiceId) return;

  const inv = await getEntity("invoices", currentInvoiceId);
  if (!inv) return;

  const message =
`فاتورة رقم #${inv.id}
الزبون: ${inv.customer || "-"}
رقم الزبون: ${inv.phone || "-"}
الإجمالي: ${Number(inv.total || 0).toFixed(2)} ${inv.currencySymbol || "₪"}
الدفع: ${inv.paymentMethodLabel || paymentMethodLabel(inv.paymentMethod)}
الحالة: ${statusLabel(inv.status || "paid")}
التاريخ: ${formatDateTime(inv.date)}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `فاتورة #${inv.id}`,
        text: message
      });
      return;
    } catch {}
  }

  if (inv.phone) {
    const url = `https://wa.me/${normalizePhoneForSend(inv.phone, "972", "")}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  }
}

function openStatusModal(invoiceId, currentStatus) {
  if (qs("statusInvoiceId")) qs("statusInvoiceId").value = invoiceId;
  if (qs("statusSelect")) qs("statusSelect").value = currentStatus || "paid";
  toggleModal("statusModal", true);
}

async function saveInvoiceStatus() {
  const id = qs("statusInvoiceId")?.value || "";
  const status = qs("statusSelect")?.value || "paid";

  if (!id) return;

  await withLoader("جاري تحديث الحالة...", async () => {
    const inv = await getEntity("invoices", id);
    if (!inv) throw new Error("الفاتورة غير موجودة");

    const updated = {
      ...inv,
      status,
      updatedAt: nowIso()
    };

    await saveEntity("invoices", id, updated);
    await ensureCustomerFromInvoice(updated);
  });

  toggleModal("statusModal", false);
  showToast("تم تحديث الحالة", "success");

  await resetInvoicesAndRender();
  await renderCustomers();
  await renderReports();

  if (qs("invoicePage") && !qs("invoicePage").classList.contains("hidden") && String(currentInvoiceId) === String(id)) {
    await viewInvoice(id);
  }
}

function openNoteModal(note) {
  if (qs("noteModalContent")) qs("noteModalContent").textContent = note || "-";
  toggleModal("noteModal", true);
}
/* =========================================================
   تقارير المبيعات كجدول: يومي / أسبوعي / شهري / سنوي / كل السجل / يوم محدد
========================================================= */
async function getSalesReportRows() {
  const range = qs("salesReportRange")?.value || "day";
  const customDate = qs("salesReportDate")?.value || "";

  const invoices = await getAllInvoices();

  const filtered = invoices
    .filter(inv =>
      inv.storeId === currentStoreId &&
      inRangeByFilter(inv.date, range, customDate)
    )
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  const rows = [];

  filtered.forEach(inv => {
    const dateKey = formatDateOnly(inv.date);

    (inv.items || []).forEach(item => {
      rows.push({
        dateKey,
        invoiceId: inv.id,
        customer: inv.customer || "-",
        phone: inv.phone || "-",
        itemName: item.name || "-",
        qty: Number(item.qty || 0),
        unitName: item.unitName || "-",
        price: Number(item.price || 0),
        total: Number(item.price || 0) * Number(item.qty || 0),
        payment: inv.paymentMethodLabel || paymentMethodLabel(inv.paymentMethod),
        transferNumber: inv.transferNumber || inv.transferAccountNo || "-",
        status: statusLabel(inv.status || "paid")
      });
    });
  });

  return rows;
}

function buildSalesReportHtml(rows, title = "تقرير فواتير المبيعات") {
  const grouped = groupBy(rows, r => r.dateKey || "بدون تاريخ");

  let total = rows.reduce((s, r) => s + Number(r.total || 0), 0);

  let html = `
    <div class="report-print-page">
      <div class="report-title">${escapeHtml(title)}</div>
      <div class="text-sm text-gray-500 mb-4">
        تاريخ إنشاء التقرير: ${formatDateTime(nowIso())}
      </div>

      <div class="grid grid-cols-3 gap-3 mb-4" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#1d4ed8;">إجمالي المبيعات</div>
          <div style="font-size:20px;font-weight:900;">${money(total)}</div>
        </div>

        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#334155;">عدد السطور</div>
          <div style="font-size:20px;font-weight:900;">${rows.length}</div>
        </div>

        <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#166534;">عدد الأيام</div>
          <div style="font-size:20px;font-weight:900;">${Object.keys(grouped).length}</div>
        </div>
      </div>
  `;

  Object.keys(grouped).forEach(dateKey => {
    const dayRows = grouped[dateKey];
    const dayTotal = dayRows.reduce((s, r) => s + Number(r.total || 0), 0);

    html += `
      <div class="report-date-title">
        ${escapeHtml(dateKey)} — الإجمالي: ${money(dayTotal)}
      </div>

      <table class="report-table">
        <thead>
          <tr>
            <th>رقم الفاتورة</th>
            <th>اسم الزبون</th>
            <th>رقم الزبون</th>
            <th>الصنف</th>
            <th>الكمية</th>
            <th>الوحدة</th>
            <th>السعر</th>
            <th>الإجمالي</th>
            <th>الدفع</th>
            <th>رقم التحويل</th>
            <th>الحالة</th>
          </tr>
        </thead>

        <tbody>
          ${dayRows.map(r => `
            <tr>
              <td>#${escapeHtml(r.invoiceId)}</td>
              <td>${escapeHtml(r.customer)}</td>
              <td>${escapeHtml(r.phone)}</td>
              <td>${escapeHtml(r.itemName)}</td>
              <td>${roundSmart(r.qty)}</td>
              <td>${escapeHtml(r.unitName)}</td>
              <td>${money(r.price)}</td>
              <td>${money(r.total)}</td>
              <td>${escapeHtml(r.payment)}</td>
              <td>${escapeHtml(r.transferNumber)}</td>
              <td>${escapeHtml(r.status)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  });

  html += `</div>`;
  return html;
}

async function exportSalesReport(type) {
  const area = qs("salesReportExportArea") || qs("globalReportExportArea");
  if (!area) return;

  await withLoader("جاري تجهيز تقرير المبيعات...", async () => {
    const rows = await getSalesReportRows();

    if (!rows.length) {
      alert("لا توجد بيانات مبيعات ضمن الفترة المحددة");
      return;
    }

    area.innerHTML = buildSalesReportHtml(rows);
    area.classList.remove("hidden");

    await exportHtmlArea(area.firstElementChild, type, "تقرير_المبيعات");

    area.classList.add("hidden");
    area.innerHTML = "";
  });
}

/* =========================================================
   المشتريات من الموردين + إدخالها للمخزون
========================================================= */
function resetPurchaseForm() {
  if (qs("editPurchaseId")) qs("editPurchaseId").value = "";
  if (qs("purchaseModalTitle")) qs("purchaseModalTitle").textContent = "إضافة فاتورة شراء من مورد";
  if (qs("purchaseSupplier")) qs("purchaseSupplier").value = "";
  if (qs("purchaseDate")) qs("purchaseDate").value = todayInput();
  if (qs("purchaseExternalNo")) qs("purchaseExternalNo").value = "";
  if (qs("purchaseNotes")) qs("purchaseNotes").value = "";
  if (qs("purchaseItemsRows")) qs("purchaseItemsRows").innerHTML = "";
  addPurchaseItemRow();
  recalcPurchaseRows();
}

function openPurchaseModal() {
  resetPurchaseForm();
  toggleModal("purchaseModal", true);
}

function addPurchaseItemRow(item = {}) {
  const tbody = qs("purchaseItemsRows");
  if (!tbody) return;

  const rowId = `pur_row_${Date.now()}_${Math.floor(Math.random() * 9999)}`;

  const tr = document.createElement("tr");
  tr.className = "purchase-item-row border-b";
  tr.dataset.rowId = rowId;

  tr.innerHTML = `
    <td class="p-3">
      <input type="text" class="purchase-product-name input-bordered min-w-[180px]" placeholder="اسم الصنف" value="${escapeHtmlAttr(item.name || "")}">
    </td>

    <td class="p-3">
      <input type="text" class="purchase-product-code input-bordered min-w-[130px]" placeholder="باركود اختياري" value="${escapeHtmlAttr(item.code || "")}">
    </td>

    <td class="p-3">
      <input type="text" class="purchase-product-category input-bordered min-w-[130px]" placeholder="التصنيف" value="${escapeHtmlAttr(item.category || "")}">
    </td>

    <td class="p-3">
      <select class="purchase-unit input-bordered min-w-[120px]">
        <option value="piece" ${item.unitType === "piece" ? "selected" : ""}>قطعة</option>
        <option value="carton" ${item.unitType === "carton" ? "selected" : ""}>كرتونة</option>
        <option value="kg" ${item.unitType === "kg" ? "selected" : ""}>كيلو</option>
        <option value="gram" ${item.unitType === "gram" ? "selected" : ""}>جرام</option>
        <option value="liter" ${item.unitType === "liter" ? "selected" : ""}>لتر</option>
        <option value="ml" ${item.unitType === "ml" ? "selected" : ""}>مل</option>
        <option value="minute" ${item.unitType === "minute" ? "selected" : ""}>دقائق</option>
        <option value="custom" ${item.unitType === "custom" ? "selected" : ""}>مخصص</option>
      </select>
    </td>

    <td class="p-3">
      <input type="number" class="purchase-qty input-bordered min-w-[100px]" placeholder="0" value="${Number(item.qty || 1)}">
    </td>

    <td class="p-3">
      <input type="number" step="0.01" class="purchase-cost input-bordered min-w-[120px]" placeholder="0.00" value="${Number(item.cost || 0)}">
    </td>

    <td class="p-3">
      <input type="number" step="0.01" class="purchase-price input-bordered min-w-[120px]" placeholder="0.00" value="${Number(item.price || 0)}">
    </td>

    <td class="p-3 font-black text-blue-700 purchase-row-total">
      ${money(Number(item.qty || 1) * Number(item.cost || 0))}
    </td>

    <td class="p-3">
      <button type="button" class="bg-red-50 text-red-600 px-3 py-2 rounded-xl font-black purchase-remove-row">حذف</button>
    </td>
  `;

  tr.querySelectorAll("input,select").forEach(el => {
    el.addEventListener("input", recalcPurchaseRows);
    el.addEventListener("change", recalcPurchaseRows);
  });

  tr.querySelector(".purchase-remove-row").onclick = () => {
    tr.remove();
    recalcPurchaseRows();
  };

  tbody.appendChild(tr);
  recalcPurchaseRows();
}

function getPurchaseRowsFromForm() {
  const rows = [...document.querySelectorAll(".purchase-item-row")];

  return rows.map(row => {
    const unitType = row.querySelector(".purchase-unit")?.value || "piece";
    const qty = Number(row.querySelector(".purchase-qty")?.value || 0);
    const cost = Number(row.querySelector(".purchase-cost")?.value || 0);
    const price = Number(row.querySelector(".purchase-price")?.value || 0);

    return {
      name: row.querySelector(".purchase-product-name")?.value.trim() || "",
      code: row.querySelector(".purchase-product-code")?.value.trim() || "",
      category: row.querySelector(".purchase-product-category")?.value.trim() || "",
      unitType,
      qty,
      cost,
      price,
      total: qty * cost
    };
  }).filter(item => item.name && item.qty > 0);
}

function recalcPurchaseRows() {
  const rows = [...document.querySelectorAll(".purchase-item-row")];
  let total = 0;
  let count = 0;

  rows.forEach(row => {
    const qty = Number(row.querySelector(".purchase-qty")?.value || 0);
    const cost = Number(row.querySelector(".purchase-cost")?.value || 0);
    const rowTotal = qty * cost;
    total += rowTotal;
    if (qty > 0) count++;

    const totalEl = row.querySelector(".purchase-row-total");
    if (totalEl) totalEl.textContent = money(rowTotal);
  });

  if (qs("purchaseItemsCount")) qs("purchaseItemsCount").textContent = count;
  if (qs("purchaseTotalAmount")) qs("purchaseTotalAmount").textContent = money(total);
}

async function savePurchase() {
  const existingId = qs("editPurchaseId")?.value || "";
  const supplier = qs("purchaseSupplier")?.value.trim() || "";
  const purchaseDate = qs("purchaseDate")?.value || todayInput();
  const externalNo = qs("purchaseExternalNo")?.value.trim() || "";
  const notes = qs("purchaseNotes")?.value.trim() || "";
  const items = getPurchaseRowsFromForm();

  if (!supplier) {
    alert("يرجى إدخال اسم المورد");
    return;
  }

  if (!items.length) {
    alert("يرجى إضافة صنف واحد على الأقل");
    return;
  }

  await withLoader("جاري حفظ فاتورة الشراء وتحديث المخزون...", async () => {
    const id = existingId || `pur_${Date.now()}`;
    const old = existingId ? await getEntity("purchases", existingId) : null;

    if (old?.items?.length) {
      await reversePurchaseStock(old.items);
    }

    const payload = {
      id,
      storeId: currentStoreId,
      supplier,
      externalNo,
      notes,
      date: new Date(`${purchaseDate}T12:00:00`).toISOString(),
      items,
      total: items.reduce((s, i) => s + Number(i.total || 0), 0),
      createdAt: old?.createdAt || nowIso(),
      updatedAt: nowIso()
    };

    await applyPurchaseStock(payload.items, supplier);
    await saveEntity("purchases", id, payload);
  });

  toggleModal("purchaseModal", false);
  showToast("تم حفظ فاتورة الشراء وتحديث المخزون", "success");

  await renderPurchases();
  await resetProductsAndRender();
  await renderDashboard();
}

async function applyPurchaseStock(items, supplier) {
  const products = await getAllProducts();

  for (const item of items) {
    const existing = products.find(p =>
      p.storeId === currentStoreId &&
      (
        (item.code && p.code === item.code) ||
        (!item.code && String(p.name || "").trim() === String(item.name || "").trim())
      )
    );

    if (existing) {
      const updated = {
        ...existing,
        supplier: supplier || existing.supplier || "",
        category: item.category || existing.category || "",
        unitType: item.unitType || existing.unitType || "piece",
        baseUnitName: existing.baseUnitName || unitTypeDefaultBase(item.unitType),
        largeUnitName: existing.largeUnitName || unitTypeDefaultLarge(item.unitType),
        unitFactor: existing.unitFactor || unitTypeDefaultFactor(item.unitType),
        stock: Number(existing.stock || 0) + Number(item.qty || 0),
        cost: Number(item.cost || existing.cost || 0),
        price: Number(item.price || existing.price || 0),
        updatedAt: nowIso()
      };

      await saveEntity("products", existing.id, updated);
    } else {
      const productId = `p_${Date.now()}_${Math.floor(Math.random() * 9999)}`;

      await saveEntity("products", productId, {
        id: productId,
        storeId: currentStoreId,
        name: item.name,
        category: item.category || "",
        code: item.code || `P-${Date.now()}`,
        image: "",
        supplier: supplier || "",
        lowStockLimit: Number(getLocalSettings().lowStockDefault || 5),
        unitType: item.unitType || "piece",
        baseUnitName: unitTypeDefaultBase(item.unitType),
        largeUnitName: unitTypeDefaultLarge(item.unitType),
        unitFactor: unitTypeDefaultFactor(item.unitType),
        stock: Number(item.qty || 0),
        cost: Number(item.cost || 0),
        price: Number(item.price || 0),
        largeCost: 0,
        largePrice: 0,
        pricingMode: "base",
        createdAt: nowIso(),
        updatedAt: nowIso()
      });
    }
  }
}

async function reversePurchaseStock(items) {
  const products = await getAllProducts();

  for (const item of items) {
    const p = products.find(x =>
      x.storeId === currentStoreId &&
      (
        (item.code && x.code === item.code) ||
        (!item.code && String(x.name || "").trim() === String(item.name || "").trim())
      )
    );

    if (!p) continue;

    await saveEntity("products", p.id, {
      ...p,
      stock: Math.max(0, Number(p.stock || 0) - Number(item.qty || 0)),
      updatedAt: nowIso()
    });
  }
}

async function editPurchase(id) {
  const p = await getEntity("purchases", id);

  if (!p) {
    alert("فاتورة الشراء غير موجودة");
    return;
  }

  if (qs("editPurchaseId")) qs("editPurchaseId").value = p.id || "";
  if (qs("purchaseModalTitle")) qs("purchaseModalTitle").textContent = "تعديل فاتورة شراء";
  if (qs("purchaseSupplier")) qs("purchaseSupplier").value = p.supplier || "";
  if (qs("purchaseDate")) qs("purchaseDate").value = toInputDate(p.date);
  if (qs("purchaseExternalNo")) qs("purchaseExternalNo").value = p.externalNo || "";
  if (qs("purchaseNotes")) qs("purchaseNotes").value = p.notes || "";
  if (qs("purchaseItemsRows")) qs("purchaseItemsRows").innerHTML = "";

  (p.items || []).forEach(item => addPurchaseItemRow(item));

  if (!(p.items || []).length) addPurchaseItemRow();

  recalcPurchaseRows();
  toggleModal("purchaseModal", true);
}

async function deletePurchase(id) {
  if (!confirm("حذف فاتورة الشراء؟ سيتم إنقاص كمياتها من المخزون.")) return;

  await withLoader("جاري حذف فاتورة الشراء...", async () => {
    const p = await getEntity("purchases", id);
    if (!p) return;

    await reversePurchaseStock(p.items || []);
    await deleteEntity("purchases", id);
  });

  showToast("تم حذف فاتورة الشراء", "success");

  await renderPurchases();
  await resetProductsAndRender();
  await renderDashboard();
}

async function filteredPurchases() {
  const search = (qs("purchasesSearch")?.value || "").toLowerCase().trim();
  const range = qs("purchasesReportRange")?.value || "day";
  const customDate = qs("purchasesReportDate")?.value || "";

  const purchases = await getAllPurchases();

  return purchases
    .filter(p => p.storeId === currentStoreId)
    .filter(p => inRangeByFilter(p.date || p.createdAt, range, customDate))
    .filter(p => {
      const hay = `${p.supplier || ""} ${p.externalNo || ""} ${(p.items || []).map(i => i.name).join(" ")}`.toLowerCase();
      return !search || hay.includes(search);
    })
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
}

async function renderPurchases() {
  const table = qs("purchasesTable");
  if (!table) return;

  const purchases = await filteredPurchases();

  table.innerHTML = "";

  let totalAmount = 0;
  let qtyTotal = 0;
  const suppliersSet = new Set();

  purchases.forEach(p => {
    totalAmount += Number(p.total || 0);
    suppliersSet.add(p.supplier || "-");

    (p.items || []).forEach(item => {
      qtyTotal += Number(item.qty || 0);

      table.innerHTML += `
        <tr class="border-b hover:bg-gray-50">
          <td class="p-4 font-black">#${escapeHtml(p.id)}</td>
          <td class="p-4 text-xs text-gray-500">${formatDateTime(p.date)}</td>
          <td class="p-4 font-bold">${escapeHtml(p.supplier || "-")}</td>
          <td class="p-4">${escapeHtml(item.name || "-")}</td>
          <td class="p-4">${roundSmart(item.qty || 0)}</td>
          <td class="p-4">${escapeHtml(unitTypeDefaultBase(item.unitType))}</td>
          <td class="p-4">${money(item.cost || 0)}</td>
          <td class="p-4">${money(item.price || 0)}</td>
          <td class="p-4 font-black text-red-700">${money(item.total || 0)}</td>
          <td class="p-4 text-xs">${escapeHtml(p.notes || "-")}</td>
          <td class="p-4">
            <div class="flex gap-2 flex-wrap">
              <button onclick="editPurchase('${escapeJs(p.id)}')" class="text-blue-600 bg-blue-50 px-3 py-1 rounded-lg text-xs font-bold">تعديل</button>
              <button onclick="deletePurchase('${escapeJs(p.id)}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-bold">حذف</button>
            </div>
          </td>
        </tr>
      `;
    });
  });

  if (!table.innerHTML.trim()) {
    table.innerHTML = `
      <tr>
        <td colspan="11" class="p-8 text-center text-gray-400">
          لا توجد فواتير مشتريات
        </td>
      </tr>
    `;
  }

  if (qs("purchasesTotalAmount")) qs("purchasesTotalAmount").textContent = money(totalAmount);
  if (qs("purchasesCount")) qs("purchasesCount").textContent = purchases.length;
  if (qs("purchasesQtyTotal")) qs("purchasesQtyTotal").textContent = roundSmart(qtyTotal);
  if (qs("purchasesSuppliersCount")) qs("purchasesSuppliersCount").textContent = suppliersSet.size;

  lucide.createIcons();
}
async function buildPurchasesReportHtml() {
  const purchases = await filteredPurchases();

  if (!purchases.length) {
    return `<div class="report-print-page"><div class="report-title">تقرير المشتريات</div><div class="p-8 text-center">لا توجد بيانات</div></div>`;
  }

  let rows = [];
  purchases.forEach(p => {
    (p.items || []).forEach(item => {
      rows.push({
        dateKey: formatDateOnly(p.date || p.createdAt),
        invoiceId: p.id,
        supplier: p.supplier || "-",
        itemName: item.name || "-",
        qty: item.qty || 0,
        unit: unitTypeDefaultBase(item.unitType),
        cost: item.cost || 0,
        price: item.price || 0,
        total: item.total || 0,
        notes: p.notes || "-"
      });
    });
  });

  const grouped = groupBy(rows, r => r.dateKey || "بدون تاريخ");
  const grandTotal = rows.reduce((s, r) => s + Number(r.total || 0), 0);

  let html = `
    <div class="report-print-page">
      <div class="report-title">تقرير فواتير الموردين والمشتريات</div>
      <div class="text-sm text-gray-500 mb-4">تاريخ إنشاء التقرير: ${formatDateTime(nowIso())}</div>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:12px;margin-bottom:14px;">
        <div style="font-weight:900;color:#b91c1c;">إجمالي المشتريات</div>
        <div style="font-size:22px;font-weight:900;">${money(grandTotal)}</div>
      </div>
  `;

  Object.keys(grouped).forEach(dateKey => {
    const dayRows = grouped[dateKey];
    const dayTotal = dayRows.reduce((s, r) => s + Number(r.total || 0), 0);

    html += `
      <div class="report-date-title">${escapeHtml(dateKey)} — الإجمالي: ${money(dayTotal)}</div>

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
          ${dayRows.map(r => `
            <tr>
              <td>#${escapeHtml(r.invoiceId)}</td>
              <td>${escapeHtml(r.supplier)}</td>
              <td>${escapeHtml(r.itemName)}</td>
              <td>${roundSmart(r.qty)}</td>
              <td>${escapeHtml(r.unit)}</td>
              <td>${money(r.cost)}</td>
              <td>${money(r.price)}</td>
              <td>${money(r.total)}</td>
              <td>${escapeHtml(r.notes)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  });

  html += `</div>`;
  return html;
}

async function exportPurchasesReport(type) {
  const area = qs("purchasesReportExportArea") || qs("globalReportExportArea");
  if (!area) return;

  await withLoader("جاري تجهيز تقرير المشتريات...", async () => {
    area.innerHTML = await buildPurchasesReportHtml();
    area.classList.remove("hidden");

    await exportHtmlArea(area.firstElementChild, type, "تقرير_المشتريات");

    area.classList.add("hidden");
    area.innerHTML = "";
  });
}

/* =========================================================
   دفعات الموردين / التجار
========================================================= */
function resetSupplierPaymentForm() {
  if (qs("editSupplierPaymentId")) qs("editSupplierPaymentId").value = "";
  if (qs("supplierPaymentModalTitle")) qs("supplierPaymentModalTitle").textContent = "إضافة دفعة لتاجر";
  if (qs("supplierPaymentName")) qs("supplierPaymentName").value = "";
  if (qs("supplierPaymentAmount")) qs("supplierPaymentAmount").value = "";
  if (qs("supplierPaymentDate")) qs("supplierPaymentDate").value = todayInput();
  if (qs("supplierPaymentMethod")) qs("supplierPaymentMethod").value = "cash";
  if (qs("supplierPaymentAccountSelect")) qs("supplierPaymentAccountSelect").value = "";
  if (qs("supplierPaymentTransferNo")) qs("supplierPaymentTransferNo").value = "";
  if (qs("supplierPaymentNotes")) qs("supplierPaymentNotes").value = "";
}

async function openSupplierPaymentModal(id = "") {
  resetSupplierPaymentForm();
  await fillTransferAccountsSelect("supplierPaymentAccountSelect");

  if (id) {
    const p = await getEntity("supplierPayments", id);
    if (p) {
      if (qs("editSupplierPaymentId")) qs("editSupplierPaymentId").value = p.id || "";
      if (qs("supplierPaymentModalTitle")) qs("supplierPaymentModalTitle").textContent = "تعديل دفعة تاجر";
      if (qs("supplierPaymentName")) qs("supplierPaymentName").value = p.supplier || "";
      if (qs("supplierPaymentAmount")) qs("supplierPaymentAmount").value = Number(p.amount || 0);
      if (qs("supplierPaymentDate")) qs("supplierPaymentDate").value = toInputDate(p.date);
      if (qs("supplierPaymentMethod")) qs("supplierPaymentMethod").value = p.paymentMethod || "cash";
      if (qs("supplierPaymentAccountSelect")) qs("supplierPaymentAccountSelect").value = p.accountId || "";
      if (qs("supplierPaymentTransferNo")) qs("supplierPaymentTransferNo").value = p.transferNumber || "";
      if (qs("supplierPaymentNotes")) qs("supplierPaymentNotes").value = p.notes || "";
    }
  }

  toggleModal("supplierPaymentModal", true);
}

async function saveSupplierPayment() {
  const editId = qs("editSupplierPaymentId")?.value || "";
  const supplier = qs("supplierPaymentName")?.value.trim() || "";
  const amount = Number(qs("supplierPaymentAmount")?.value || 0);

  if (!supplier) {
    alert("يرجى إدخال اسم التاجر أو المورد");
    return;
  }

  if (amount <= 0) {
    alert("يرجى إدخال مبلغ صحيح");
    return;
  }

  const accountId = qs("supplierPaymentAccountSelect")?.value || "";
  const account = accountId ? await getAccountById(accountId) : null;

  const payload = {
    id: editId || `sp_${Date.now()}`,
    storeId: currentStoreId,
    supplier,
    amount,
    date: new Date(`${qs("supplierPaymentDate")?.value || todayInput()}T12:00:00`).toISOString(),
    paymentMethod: qs("supplierPaymentMethod")?.value || "cash",
    accountId,
    accountType: account?.type || "",
    accountOwner: account?.owner || "",
    accountNumber: account?.number || "",
    transferNumber: qs("supplierPaymentTransferNo")?.value.trim() || "",
    notes: qs("supplierPaymentNotes")?.value.trim() || "",
    createdAt: editId ? (await getEntity("supplierPayments", editId))?.createdAt || nowIso() : nowIso(),
    updatedAt: nowIso()
  };

  await withLoader("جاري حفظ دفعة التاجر...", async () => {
    await saveEntity("supplierPayments", payload.id, payload);
  });

  toggleModal("supplierPaymentModal", false);
  showToast("تم حفظ الدفعة", "success");

  await renderSupplierPayments();
  await renderReports();
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

  const payments = await getAllSupplierPayments();

  return payments
    .filter(p => p.storeId === currentStoreId)
    .filter(p => inRangeByFilter(p.date || p.createdAt, range))
    .filter(p => {
      const hay = `${p.supplier || ""} ${p.paymentMethod || ""} ${p.transferNumber || ""}`.toLowerCase();
      return !search || hay.includes(search);
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

async function renderSupplierPayments() {
  const table = qs("supplierPaymentsTable");
  if (!table) return;

  const rows = await filteredSupplierPayments();

  table.innerHTML = "";

  if (!rows.length) {
    table.innerHTML = `
      <tr>
        <td colspan="7" class="p-8 text-center text-gray-400">لا توجد دفعات تجار</td>
      </tr>
    `;
    return;
  }

  rows.forEach(p => {
    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4 text-xs text-gray-500">${formatDateTime(p.date)}</td>
        <td class="p-4 font-black">${escapeHtml(p.supplier || "-")}</td>
        <td class="p-4 font-black text-red-700">${money(p.amount || 0)}</td>
        <td class="p-4">${escapeHtml(paymentMethodLabel(p.paymentMethod))}</td>
        <td class="p-4 text-xs">
          ${escapeHtml(p.transferNumber || p.accountNumber || "-")}
          ${p.accountOwner ? `<div class="text-gray-400 mt-1">${escapeHtml(p.accountOwner)}</div>` : ""}
        </td>
        <td class="p-4 text-xs">${escapeHtml(p.notes || "-")}</td>
        <td class="p-4">
          <div class="flex gap-2 flex-wrap">
            <button onclick="openSupplierPaymentModal('${escapeJs(p.id)}')" class="text-blue-600 bg-blue-50 px-3 py-1 rounded-lg text-xs font-bold">تعديل</button>
            <button onclick="deleteSupplierPayment('${escapeJs(p.id)}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-bold">حذف</button>
          </div>
        </td>
      </tr>
    `;
  });

  lucide.createIcons();
}

async function buildSupplierPaymentsReportHtml() {
  const rows = await filteredSupplierPayments();
  const total = rows.reduce((s, p) => s + Number(p.amount || 0), 0);
  const grouped = groupBy(rows, p => formatDateOnly(p.date || p.createdAt));

  let html = `
    <div class="report-print-page">
      <div class="report-title">تقرير دفعات التجار والموردين</div>
      <div class="text-sm text-gray-500 mb-4">تاريخ إنشاء التقرير: ${formatDateTime(nowIso())}</div>

      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:12px;margin-bottom:14px;">
        <div style="font-weight:900;color:#c2410c;">إجمالي الدفعات</div>
        <div style="font-size:22px;font-weight:900;">${money(total)}</div>
      </div>
  `;

  Object.keys(grouped).forEach(dateKey => {
    const dayRows = grouped[dateKey];
    const dayTotal = dayRows.reduce((s, p) => s + Number(p.amount || 0), 0);

    html += `
      <div class="report-date-title">${escapeHtml(dateKey)} — الإجمالي: ${money(dayTotal)}</div>
      <table class="report-table">
        <thead>
          <tr>
            <th>اسم التاجر</th>
            <th>المبلغ</th>
            <th>طريقة الدفع</th>
            <th>الحساب</th>
            <th>رقم التحويل</th>
            <th>ملاحظات</th>
          </tr>
        </thead>

        <tbody>
          ${dayRows.map(p => `
            <tr>
              <td>${escapeHtml(p.supplier || "-")}</td>
              <td>${money(p.amount || 0)}</td>
              <td>${escapeHtml(paymentMethodLabel(p.paymentMethod))}</td>
              <td>${escapeHtml(p.accountOwner || "-")}</td>
              <td>${escapeHtml(p.transferNumber || p.accountNumber || "-")}</td>
              <td>${escapeHtml(p.notes || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  });

  html += `</div>`;
  return html;
}

async function exportSupplierPaymentsReport(type) {
  const area = qs("supplierPaymentsExportArea") || qs("globalReportExportArea");
  if (!area) return;

  await withLoader("جاري تجهيز تقرير دفعات التجار...", async () => {
    area.innerHTML = await buildSupplierPaymentsReportHtml();
    area.classList.remove("hidden");

    await exportHtmlArea(area.firstElementChild, type, "تقرير_دفعات_التجار");

    area.classList.add("hidden");
    area.innerHTML = "";
  });
}

/* =========================================================
   العملاء والديون
========================================================= */
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

  const payload = {
    id,
    storeId: currentStoreId,
    name: name || "بدون اسم",
    phone,
    dueMode: inv.dueMode || old?.dueMode || "",
    dueDate: inv.dueDate || old?.dueDate || "",
    notes: old?.notes || "",
    manualDebt: Number(old?.manualDebt || 0),
    manualPaid: Number(old?.manualPaid || 0),
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
        <td class="p-4 text-xs">
          ${c.dueDate ? escapeHtml(c.dueDate) : c.dueMode === "daily" ? "يومي" : "-"}
        </td>
        <td class="p-4">
          <span class="status-pill ${late ? "status-late" : Number(c.remaining || 0) > 0 ? "status-unpaid" : "status-paid"}">
            ${late ? "متأخر" : Number(c.remaining || 0) > 0 ? "عليه دين" : "مسدد"}
          </span>
        </td>
        <td class="p-4">
          <div class="flex gap-2 flex-wrap">
            <button onclick="openCustomerHistory('${escapeJs(c.name)}','${escapeJs(c.phone)}')" class="text-blue-600 bg-blue-50 px-3 py-1 rounded-lg text-xs font-bold">
              السجل
            </button>
            <button onclick="openCustomerModal('${escapeJs(c.id)}')" class="text-amber-600 bg-amber-50 px-3 py-1 rounded-lg text-xs font-bold">
              تعديل
            </button>
            <button onclick="deleteCustomer('${escapeJs(c.id)}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-bold">
              حذف
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  if (qs("customersTotalDebt")) qs("customersTotalDebt").innerText = money(totalDebt);
  if (qs("customersTotalPaid")) qs("customersTotalPaid").innerText = money(paid);
  if (qs("customersRemainingDebt")) qs("customersRemainingDebt").innerText = money(remaining);
  if (qs("customersCount")) qs("customersCount").innerText = rows.length;

  lucide.createIcons();
}

async function openCustomerHistory(name, phone = "") {
  currentCustomerHistoryName = name;
  currentCustomerHistoryPhone = phone;

  const range = qs("customerHistoryRange")?.value || "all";

  const customerId = customerIdFromData(name, phone);
  let customer = await getEntity("customers", customerId);

  if (!customer) {
    customer = await ensureCustomerFromInvoice({
      customer: name,
      phone,
      dueMode: "",
      dueDate: ""
    });
  }

  if (!customer) return;

  const stats = await calculateCustomerStats(customer);

  const invoices = stats.invoices
    .filter(inv => inRangeByFilter(inv.date || inv.createdAt, range))
    .map(inv => ({
      id: inv.id,
      date: inv.date || inv.createdAt,
      type: "فاتورة",
      status: inv.status || "paid",
      amount: Number(inv.total || 0),
      notes: inv.notes || ""
    }));

  const payments = stats.payments
    .filter(p => inRangeByFilter(p.date || p.createdAt, range))
    .map(p => ({
      id: p.id,
      date: p.date || p.createdAt,
      type: "دفعة",
      status: "paid",
      amount: Number(p.amount || 0),
      notes: p.notes || p.transferNumber || ""
    }));

  const rows = [...invoices, ...payments].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  if (qs("customerHistoryTitle")) {
    qs("customerHistoryTitle").innerText = `${customer.name || "بدون اسم"}${customer.phone ? " - " + customer.phone : ""}`;
  }

  if (qs("custPaidTotal")) qs("custPaidTotal").innerText = money(stats.paid || 0);
  if (qs("custUnpaidTotal")) qs("custUnpaidTotal").innerText = money(stats.remaining || 0);
  if (qs("custGrandTotal")) qs("custGrandTotal").innerText = money(stats.totalDebt || 0);

  await fillTransferAccountsSelect("customerPaymentAccountSelect");

  const tbody = qs("customerHistoryTable");
  if (tbody) {
    tbody.innerHTML = "";

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-6 text-center text-gray-400">
            لا يوجد سجل لهذا العميل ضمن الفترة المحددة
          </td>
        </tr>
      `;
    } else {
      rows.forEach(row => {
        tbody.innerHTML += `
          <tr class="border-t">
            <td class="p-4 font-bold">#${escapeHtml(row.id)}</td>
            <td class="p-4 text-sm">${formatDateTime(row.date)}</td>
            <td class="p-4">${escapeHtml(row.type)}</td>
            <td class="p-4">
              <span class="status-pill ${statusClass(row.status)}">
                ${statusLabel(row.status)}
              </span>
            </td>
            <td class="p-4 font-bold">${money(row.amount || 0)}</td>
            <td class="p-4 text-xs">${escapeHtml(row.notes || "-")}</td>
          </tr>
        `;
      });
    }
  }

  toggleModal("customerHistoryModal", true);
}

async function saveCustomerPayment() {
  const amount = Number(qs("customerPaymentAmountInput")?.value || 0);

  if (!currentCustomerHistoryName) {
    alert("لا يوجد عميل محدد");
    return;
  }

  if (amount <= 0) {
    alert("يرجى إدخال مبلغ صحيح");
    return;
  }

  const customerId = customerIdFromData(currentCustomerHistoryName, currentCustomerHistoryPhone);
  const customer = await getEntity("customers", customerId);

  if (!customer) {
    alert("العميل غير موجود");
    return;
  }

  const accountId = qs("customerPaymentAccountSelect")?.value || "";
  const account = accountId ? await getAccountById(accountId) : null;

  const payment = {
    id: `cp_${Date.now()}`,
    storeId: currentStoreId,
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    amount,
    date: nowIso(),
    paymentMethod: qs("customerPaymentMethodInput")?.value || "cash",
    accountId,
    accountType: account?.type || "",
    accountOwner: account?.owner || "",
    accountNumber: account?.number || "",
    transferNumber: qs("customerPaymentTransferNoInput")?.value.trim() || "",
    notes: "دفعة من العميل",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await withLoader("جاري حفظ دفعة العميل...", async () => {
    await saveEntity("customerPayments", payment.id, payment);
  });

  if (qs("customerPaymentAmountInput")) qs("customerPaymentAmountInput").value = "";
  if (qs("customerPaymentTransferNoInput")) qs("customerPaymentTransferNoInput").value = "";

  showToast("تم حفظ دفعة العميل", "success");

  await openCustomerHistory(currentCustomerHistoryName, currentCustomerHistoryPhone);
  await renderCustomers();
  await renderDashboard();
  await renderReports();
}

async function sendDebtMessageToCustomer() {
  if (!currentCustomerHistoryName) return;

  const customerId = customerIdFromData(currentCustomerHistoryName, currentCustomerHistoryPhone);
  const customer = await getEntity("customers", customerId);

  if (!customer) {
    alert("العميل غير موجود");
    return;
  }

  const stats = await calculateCustomerStats(customer);
  const phone = normalizePhoneForSend(
    currentCustomerHistoryPhone || "",
    qs("messageCountryPrefixMode")?.value || "970",
    qs("messageCustomPrefix")?.value || ""
  );

  if (!phone) {
    alert("رقم العميل غير صالح");
    return;
  }

  const message =
`مرحباً ${customer.name}
المتبقي عليك: ${money(stats.remaining || 0)}
المدفوع: ${money(stats.paid || 0)}
إجمالي الدين: ${money(stats.totalDebt || 0)}
يرجى التواصل لإتمام السداد.`;

  const app = qs("messageTargetApp")?.value || "whatsapp";

  if (app === "sms") {
    window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
    return;
  }

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
}

async function buildCustomersReportHtml() {
  const rows = await filteredCustomers();

  let totalDebt = 0;
  let paid = 0;
  let remaining = 0;

  rows.forEach(c => {
    totalDebt += Number(c.totalDebt || 0);
    paid += Number(c.paid || 0);
    remaining += Number(c.remaining || 0);
  });

  return `
    <div class="report-print-page">
      <div class="report-title">تقرير العملاء والديون</div>
      <div class="text-sm text-gray-500 mb-4">تاريخ إنشاء التقرير: ${formatDateTime(nowIso())}</div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#c2410c;">إجمالي الديون</div>
          <div style="font-size:20px;font-weight:900;">${money(totalDebt)}</div>
        </div>

        <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#166534;">المدفوع</div>
          <div style="font-size:20px;font-weight:900;">${money(paid)}</div>
        </div>

        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#b91c1c;">المتبقي</div>
          <div style="font-size:20px;font-weight:900;">${money(remaining)}</div>
        </div>
      </div>

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
          ${rows.map(c => {
            const late = isLateDue(c) && Number(c.remaining || 0) > 0;
            return `
              <tr>
                <td>${escapeHtml(c.name || "-")}</td>
                <td>${escapeHtml(c.phone || "-")}</td>
                <td>${money(c.totalDebt || 0)}</td>
                <td>${money(c.paid || 0)}</td>
                <td>${money(c.remaining || 0)}</td>
                <td>${c.dueDate ? escapeHtml(c.dueDate) : c.dueMode === "daily" ? "يومي" : "-"}</td>
                <td>${late ? "متأخر" : Number(c.remaining || 0) > 0 ? "عليه دين" : "مسدد"}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function exportCustomersReport(type) {
  const area = qs("customersExportArea") || qs("globalReportExportArea");
  if (!area) return;

  await withLoader("جاري تجهيز تقرير العملاء...", async () => {
    area.innerHTML = await buildCustomersReportHtml();
    area.classList.remove("hidden");

    await exportHtmlArea(area.firstElementChild, type, "تقرير_العملاء_والديون");

    area.classList.add("hidden");
    area.innerHTML = "";
  });
}
/* =========================================================
   المصروفات
========================================================= */
function resetExpenseForm() {
  if (qs("editExpenseId")) qs("editExpenseId").value = "";
  if (qs("expenseModalTitle")) qs("expenseModalTitle").innerText = "إضافة مصروف";
  if (qs("expenseTypeInput")) qs("expenseTypeInput").value = "";
  if (qs("expenseAmountInput")) qs("expenseAmountInput").value = "";
  if (qs("expenseDateInput")) qs("expenseDateInput").value = todayInput();
  if (qs("expenseNotesInput")) qs("expenseNotesInput").value = "";

  const st = getLocalSettings();
  if (qs("expenseDeductFromProfitInput")) {
    qs("expenseDeductFromProfitInput").checked = st.expensesDeductDefault !== false;
  }
}

async function openExpenseModal(id = "") {
  resetExpenseForm();

  if (id) {
    const exp = await getEntity("expenses", id);

    if (exp) {
      if (qs("editExpenseId")) qs("editExpenseId").value = exp.id || "";
      if (qs("expenseModalTitle")) qs("expenseModalTitle").innerText = "تعديل مصروف";
      if (qs("expenseTypeInput")) qs("expenseTypeInput").value = exp.type || "";
      if (qs("expenseAmountInput")) qs("expenseAmountInput").value = Number(exp.amount || 0);
      if (qs("expenseDateInput")) qs("expenseDateInput").value = toInputDate(exp.date);
      if (qs("expenseDeductFromProfitInput")) qs("expenseDeductFromProfitInput").checked = exp.deductFromProfit !== false;
      if (qs("expenseNotesInput")) qs("expenseNotesInput").value = exp.notes || "";
    }
  }

  toggleModal("expenseModal", true);
}

async function saveExpense() {
  const editId = qs("editExpenseId")?.value || "";
  const type = qs("expenseTypeInput")?.value.trim() || "";
  const amount = Number(qs("expenseAmountInput")?.value || 0);

  if (!type) {
    alert("يرجى إدخال نوع المصروف");
    return;
  }

  if (amount <= 0) {
    alert("يرجى إدخال مبلغ صحيح");
    return;
  }

  const old = editId ? await getEntity("expenses", editId) : null;

  const payload = {
    id: editId || `exp_${Date.now()}`,
    storeId: currentStoreId,
    type,
    amount,
    date: new Date(`${qs("expenseDateInput")?.value || todayInput()}T12:00:00`).toISOString(),
    deductFromProfit: qs("expenseDeductFromProfitInput")?.checked !== false,
    notes: qs("expenseNotesInput")?.value.trim() || "",
    createdAt: old?.createdAt || nowIso(),
    updatedAt: nowIso()
  };

  await withLoader("جاري حفظ المصروف...", async () => {
    await saveEntity("expenses", payload.id, payload);
  });

  toggleModal("expenseModal", false);
  showToast("تم حفظ المصروف", "success");

  await renderExpenses();
  await renderDashboard();
  await renderReports();
}

async function editExpense(id) {
  await openExpenseModal(id);
}

async function deleteExpense(id) {
  if (!confirm("حذف المصروف؟")) return;

  await withLoader("جاري حذف المصروف...", async () => {
    await deleteEntity("expenses", id);
  });

  showToast("تم حذف المصروف", "success");
  await renderExpenses();
  await renderDashboard();
  await renderReports();
}

async function filteredExpenses() {
  const range = qs("expensesRange")?.value || "day";
  const search = (qs("expensesSearch")?.value || "").toLowerCase().trim();
  const profitFilter = qs("expensesProfitFilter")?.value || "all";

  const expenses = await getAllExpenses();

  return expenses
    .filter(e => e.storeId === currentStoreId)
    .filter(e => inRangeByFilter(e.date || e.createdAt, range))
    .filter(e => {
      const hay = `${e.type || ""} ${e.notes || ""}`.toLowerCase();
      return !search || hay.includes(search);
    })
    .filter(e => {
      if (profitFilter === "deduct") return e.deductFromProfit !== false;
      if (profitFilter === "noDeduct") return e.deductFromProfit === false;
      return true;
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

async function renderExpenses() {
  const table = qs("expensesTable");
  if (!table) return;

  const rows = await filteredExpenses();

  table.innerHTML = "";

  if (!rows.length) {
    table.innerHTML = `
      <tr>
        <td colspan="6" class="p-8 text-center text-gray-400">لا توجد مصروفات</td>
      </tr>
    `;
  }

  const total = rows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const deduct = rows
    .filter(e => e.deductFromProfit !== false)
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  rows.forEach(e => {
    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4 text-xs text-gray-500">${formatDateTime(e.date)}</td>
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
            <button onclick="editExpense('${escapeJs(e.id)}')" class="text-blue-600 bg-blue-50 px-3 py-1 rounded-lg text-xs font-bold">تعديل</button>
            <button onclick="deleteExpense('${escapeJs(e.id)}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-bold">حذف</button>
          </div>
        </td>
      </tr>
    `;
  });

  if (qs("expensesTotalAmount")) qs("expensesTotalAmount").innerText = money(total);
  if (qs("expensesDeductAmount")) qs("expensesDeductAmount").innerText = money(deduct);
  if (qs("expensesCount")) qs("expensesCount").innerText = rows.length;

  lucide.createIcons();
}

async function buildExpensesReportHtml() {
  const rows = await filteredExpenses();
  const total = rows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const deduct = rows.filter(e => e.deductFromProfit !== false).reduce((s, e) => s + Number(e.amount || 0), 0);
  const grouped = groupBy(rows, e => formatDateOnly(e.date || e.createdAt));

  let html = `
    <div class="report-print-page">
      <div class="report-title">تقرير المصروفات</div>
      <div class="text-sm text-gray-500 mb-4">تاريخ إنشاء التقرير: ${formatDateTime(nowIso())}</div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#b91c1c;">إجمالي المصروفات</div>
          <div style="font-size:20px;font-weight:900;">${money(total)}</div>
        </div>

        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#c2410c;">تخصم من الأرباح</div>
          <div style="font-size:20px;font-weight:900;">${money(deduct)}</div>
        </div>

        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#1d4ed8;">عدد المصروفات</div>
          <div style="font-size:20px;font-weight:900;">${rows.length}</div>
        </div>
      </div>
  `;

  Object.keys(grouped).forEach(dateKey => {
    const dayRows = grouped[dateKey];
    const dayTotal = dayRows.reduce((s, e) => s + Number(e.amount || 0), 0);

    html += `
      <div class="report-date-title">${escapeHtml(dateKey)} — الإجمالي: ${money(dayTotal)}</div>

      <table class="report-table">
        <thead>
          <tr>
            <th>نوع المصروف</th>
            <th>المبلغ</th>
            <th>يخصم من الأرباح</th>
            <th>ملاحظات</th>
          </tr>
        </thead>

        <tbody>
          ${dayRows.map(e => `
            <tr>
              <td>${escapeHtml(e.type || "-")}</td>
              <td>${money(e.amount || 0)}</td>
              <td>${e.deductFromProfit !== false ? "نعم" : "لا"}</td>
              <td>${escapeHtml(e.notes || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  });

  html += `</div>`;
  return html;
}

async function exportExpensesReport(type) {
  const area = qs("expensesExportArea") || qs("globalReportExportArea");
  if (!area) return;

  await withLoader("جاري تجهيز تقرير المصروفات...", async () => {
    area.innerHTML = await buildExpensesReportHtml();
    area.classList.remove("hidden");

    await exportHtmlArea(area.firstElementChild, type, "تقرير_المصروفات");

    area.classList.add("hidden");
    area.innerHTML = "";
  });
}

/* =========================================================
   التقارير المالية
========================================================= */
async function getFinanceRangeData() {
  const range = qs("reportFilter")?.value || "day";
  const customDate = qs("reportCustomDate")?.value || "";

  const invoices = (await getAllInvoices()).filter(inv =>
    inv.storeId === currentStoreId &&
    inRangeByFilter(inv.date || inv.createdAt, range, customDate)
  );

  const expenses = (await getAllExpenses()).filter(e =>
    e.storeId === currentStoreId &&
    inRangeByFilter(e.date || e.createdAt, range, customDate)
  );

  const supplierPayments = (await getAllSupplierPayments()).filter(p =>
    p.storeId === currentStoreId &&
    inRangeByFilter(p.date || p.createdAt, range, customDate)
  );

  const customerPayments = (await getAllCustomerPayments()).filter(p =>
    p.storeId === currentStoreId &&
    inRangeByFilter(p.date || p.createdAt, range, customDate)
  );

  const sales = invoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
  const costs = invoices.reduce((s, inv) => s + Number(inv.totalCost || 0), 0);
  const grossProfit = sales - costs;

  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const deductibleExpenses = expenses
    .filter(e => e.deductFromProfit !== false)
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  const netProfit = grossProfit - deductibleExpenses;

  return {
    range,
    customDate,
    invoices,
    expenses,
    supplierPayments,
    customerPayments,
    sales,
    costs,
    grossProfit,
    expensesTotal,
    deductibleExpenses,
    netProfit
  };
}

async function calculateAccountBalances(data = null) {
  const d = data || await getFinanceRangeData();
  const accounts = await getTransferAccounts();

  const balances = accounts.map(acc => ({
    ...acc,
    balance: Number(acc.openingBalance || 0)
  }));

  const byId = new Map(balances.map(acc => [acc.id, acc]));

  d.invoices.forEach(inv => {
    if (!inv.accountId) return;
    const acc = byId.get(inv.accountId);
    if (acc && (inv.status || "paid") === "paid") {
      acc.balance += Number(inv.total || 0);
    }
  });

  d.customerPayments.forEach(p => {
    if (!p.accountId) return;
    const acc = byId.get(p.accountId);
    if (acc) acc.balance += Number(p.amount || 0);
  });

  d.supplierPayments.forEach(p => {
    if (!p.accountId) return;
    const acc = byId.get(p.accountId);
    if (acc) acc.balance -= Number(p.amount || 0);
  });

  return balances;
}

function paymentSummaryFromInvoices(invoices) {
  const map = new Map();

  invoices.forEach(inv => {
    const key = inv.paymentMethod || "cash";
    const old = map.get(key) || { method: key, count: 0, total: 0 };
    old.count += 1;
    old.total += Number(inv.total || 0);
    map.set(key, old);
  });

  return [...map.values()].sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
}

function profitByItemFromInvoices(invoices) {
  const map = new Map();

  invoices.forEach(inv => {
    (inv.items || []).forEach(item => {
      const key = item.name || item.productId || "صنف";
      const old = map.get(key) || {
        name: key,
        qty: 0,
        sales: 0,
        costs: 0,
        profit: 0
      };

      const qty = Number(item.qty || 0);
      const total = Number(item.total || (Number(item.price || 0) * qty));
      const costTotal = Number(item.cost || 0) * qty;

      old.qty += qty;
      old.sales += total;
      old.costs += costTotal;
      old.profit = old.sales - old.costs;

      map.set(key, old);
    });
  });

  return [...map.values()].sort((a, b) => Number(b.profit || 0) - Number(a.profit || 0));
}

async function renderReports() {
  const data = await getFinanceRangeData();

  if (qs("repTotalSales")) qs("repTotalSales").innerText = money(data.sales);
  if (qs("repWholesaleSales")) qs("repWholesaleSales").innerText = money(data.costs);
  if (qs("repGrossProfit")) qs("repGrossProfit").innerText = money(data.grossProfit);
  if (qs("repExpenses")) qs("repExpenses").innerText = money(data.deductibleExpenses);
  if (qs("repTotalProfit")) qs("repTotalProfit").innerText = money(data.netProfit);
  if (qs("repCount")) qs("repCount").innerText = data.invoices.length;

  const balanceTable = qs("accountsBalanceTable");
  if (balanceTable) {
    const balances = await calculateAccountBalances(data);
    balanceTable.innerHTML = "";

    if (!balances.length) {
      balanceTable.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-gray-400">لا توجد حسابات</td></tr>`;
    } else {
      balances.forEach(acc => {
        balanceTable.innerHTML += `
          <tr class="border-b">
            <td class="p-4 font-black">${escapeHtml(acc.owner || "-")}</td>
            <td class="p-4">${escapeHtml(acc.type || "-")}</td>
            <td class="p-4 text-xs">${escapeHtml(acc.number || "-")}</td>
            <td class="p-4 font-black ${Number(acc.balance || 0) >= 0 ? "text-green-700" : "text-red-700"}">${money(acc.balance || 0)}</td>
          </tr>
        `;
      });
    }
  }

  const paymentTable = qs("paymentMethodsSummaryTable");
  if (paymentTable) {
    const summary = paymentSummaryFromInvoices(data.invoices);
    paymentTable.innerHTML = "";

    if (!summary.length) {
      paymentTable.innerHTML = `<tr><td colspan="3" class="p-6 text-center text-gray-400">لا توجد عمليات دفع</td></tr>`;
    } else {
      summary.forEach(row => {
        paymentTable.innerHTML += `
          <tr class="border-b">
            <td class="p-4 font-black">${escapeHtml(paymentMethodLabel(row.method))}</td>
            <td class="p-4">${row.count}</td>
            <td class="p-4 font-black text-blue-700">${money(row.total)}</td>
          </tr>
        `;
      });
    }
  }

  const profitTable = qs("profitByItemTable");
  if (profitTable) {
    const rows = profitByItemFromInvoices(data.invoices);
    profitTable.innerHTML = "";

    if (!rows.length) {
      profitTable.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-400">لا توجد مبيعات</td></tr>`;
    } else {
      rows.forEach(row => {
        profitTable.innerHTML += `
          <tr class="border-b">
            <td class="p-4 font-black">${escapeHtml(row.name || "-")}</td>
            <td class="p-4">${roundSmart(row.qty)}</td>
            <td class="p-4 text-blue-700 font-bold">${money(row.sales)}</td>
            <td class="p-4 text-slate-700 font-bold">${money(row.costs)}</td>
            <td class="p-4 text-green-700 font-black">${money(row.profit)}</td>
          </tr>
        `;
      });
    }
  }
}
async function buildFinanceReportHtml() {
  const data = await getFinanceRangeData();
  const balances = await calculateAccountBalances(data);
  const paymentSummary = paymentSummaryFromInvoices(data.invoices);
  const profitRows = profitByItemFromInvoices(data.invoices);

  return `
    <div class="report-print-page">
      <div class="report-title">التقرير المالي</div>
      <div class="text-sm text-gray-500 mb-4">تاريخ إنشاء التقرير: ${formatDateTime(nowIso())}</div>

      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px;">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#1d4ed8;">المبيعات</div>
          <div style="font-size:18px;font-weight:900;">${money(data.sales)}</div>
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#334155;">التكلفة</div>
          <div style="font-size:18px;font-weight:900;">${money(data.costs)}</div>
        </div>

        <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#166534;">إجمالي الربح</div>
          <div style="font-size:18px;font-weight:900;">${money(data.grossProfit)}</div>
        </div>

        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#b91c1c;">المصروفات</div>
          <div style="font-size:18px;font-weight:900;">${money(data.deductibleExpenses)}</div>
        </div>

        <div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:14px;padding:12px;">
          <div style="font-weight:900;color:#047857;">صافي الربح</div>
          <div style="font-size:18px;font-weight:900;">${money(data.netProfit)}</div>
        </div>
      </div>

      <div class="report-date-title">الرصيد حسب البنك / المحفظة</div>
      <table class="report-table">
        <thead>
          <tr>
            <th>الحساب</th>
            <th>النوع</th>
            <th>رقم التحويل</th>
            <th>الرصيد</th>
          </tr>
        </thead>
        <tbody>
          ${balances.map(acc => `
            <tr>
              <td>${escapeHtml(acc.owner || "-")}</td>
              <td>${escapeHtml(acc.type || "-")}</td>
              <td>${escapeHtml(acc.number || "-")}</td>
              <td>${money(acc.balance || 0)}</td>
            </tr>
          `).join("") || `<tr><td colspan="4">لا توجد حسابات</td></tr>`}
        </tbody>
      </table>

      <div class="report-date-title">ملخص طرق الدفع</div>
      <table class="report-table">
        <thead>
          <tr>
            <th>طريقة الدفع</th>
            <th>عدد العمليات</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          ${paymentSummary.map(row => `
            <tr>
              <td>${escapeHtml(paymentMethodLabel(row.method))}</td>
              <td>${row.count}</td>
              <td>${money(row.total)}</td>
            </tr>
          `).join("") || `<tr><td colspan="3">لا توجد عمليات</td></tr>`}
        </tbody>
      </table>

      <div class="report-date-title">المرابح حسب الصنف</div>
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
          ${profitRows.map(row => `
            <tr>
              <td>${escapeHtml(row.name || "-")}</td>
              <td>${roundSmart(row.qty)}</td>
              <td>${money(row.sales)}</td>
              <td>${money(row.costs)}</td>
              <td>${money(row.profit)}</td>
            </tr>
          `).join("") || `<tr><td colspan="5">لا توجد مبيعات</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

async function exportFinanceReport(type) {
  const area = qs("financeReportExportArea") || qs("globalReportExportArea");
  if (!area) return;

  await withLoader("جاري تجهيز التقرير المالي...", async () => {
    area.innerHTML = await buildFinanceReportHtml();
    area.classList.remove("hidden");

    await exportHtmlArea(area.firstElementChild, type, "التقرير_المالي");

    area.classList.add("hidden");
    area.innerHTML = "";
  });
}

/* =========================================================
   البضاعة الناقصة
========================================================= */
async function filteredShortages() {
  const search = (qs("shortageSearch")?.value || "").toLowerCase().trim();
  const cat = qs("shortageCategoryFilter")?.value || "all";
  const defaultLimit = Number(qs("shortageLimitInput")?.value || getLocalSettings().lowStockDefault || 5);

  const products = await getAllProducts();

  return products
    .filter(p => p.storeId === currentStoreId)
    .filter(p => {
      const hay = `${p.name || ""} ${p.category || ""} ${p.supplier || ""} ${p.code || ""}`.toLowerCase();
      return !search || hay.includes(search);
    })
    .filter(p => cat === "all" || (p.category || "") === cat)
    .filter(p => {
      const limit = Number(p.lowStockLimit ?? defaultLimit);
      return Number(p.stock || 0) <= limit;
    })
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
}

async function renderShortages() {
  const table = qs("shortagesTable");
  if (!table) return;

  const rows = await filteredShortages();
  const defaultLimit = Number(qs("shortageLimitInput")?.value || getLocalSettings().lowStockDefault || 5);

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
    const limit = Number(p.lowStockLimit ?? defaultLimit);
    const empty = stock <= 0;

    if (empty) emptyCount++;
    else lowCount++;

    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4 font-black">${escapeHtml(p.name || "-")}</td>
        <td class="p-4">${escapeHtml(p.category || "-")}</td>
        <td class="p-4">${escapeHtml(p.supplier || "-")}</td>
        <td class="p-4">${escapeHtml(p.baseUnitName || unitLabel(p, "base"))}</td>
        <td class="p-4 font-black ${empty ? "text-red-700" : "text-orange-700"}">${roundSmart(stock)}</td>
        <td class="p-4">${roundSmart(limit)}</td>
        <td class="p-4">
          <span class="status-pill ${empty ? "status-unpaid" : "status-pending"}">
            ${empty ? "نفد" : "ناقص"}
          </span>
        </td>
        <td class="p-4">
          <button onclick="editProduct('${escapeJs(p.id)}')" class="text-blue-600 bg-blue-50 px-3 py-1 rounded-lg text-xs font-bold">
            تعديل
          </button>
        </td>
      </tr>
    `;
  });

  if (qs("shortageEmptyCount")) qs("shortageEmptyCount").innerText = emptyCount;
  if (qs("shortageLowCount")) qs("shortageLowCount").innerText = lowCount;
  if (qs("shortageTotalItems")) qs("shortageTotalItems").innerText = rows.length;

  lucide.createIcons();
}

async function buildShortageReportHtml() {
  const rows = await filteredShortages();
  const defaultLimit = Number(qs("shortageLimitInput")?.value || getLocalSettings().lowStockDefault || 5);

  return `
    <div class="report-print-page">
      <div class="report-title">تقرير البضاعة الناقصة</div>
      <div class="text-sm text-gray-500 mb-4">تاريخ إنشاء التقرير: ${formatDateTime(nowIso())}</div>

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
          ${rows.map(p => {
            const stock = Number(p.stock || 0);
            const limit = Number(p.lowStockLimit ?? defaultLimit);
            return `
              <tr>
                <td>${escapeHtml(p.name || "-")}</td>
                <td>${escapeHtml(p.category || "-")}</td>
                <td>${escapeHtml(p.supplier || "-")}</td>
                <td>${escapeHtml(p.baseUnitName || unitLabel(p, "base"))}</td>
                <td>${roundSmart(stock)}</td>
                <td>${roundSmart(limit)}</td>
                <td>${stock <= 0 ? "نفد" : "ناقص"}</td>
              </tr>
            `;
          }).join("") || `<tr><td colspan="7">لا توجد بضاعة ناقصة</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

async function exportShortageReport(type) {
  const area = qs("shortageReportExportArea") || qs("globalReportExportArea");
  if (!area) return;

  await withLoader("جاري تجهيز تقرير البضاعة الناقصة...", async () => {
    area.innerHTML = await buildShortageReportHtml();
    area.classList.remove("hidden");

    await exportHtmlArea(area.firstElementChild, type, "تقرير_البضاعة_الناقصة");

    area.classList.add("hidden");
    area.innerHTML = "";
  });
}

/* =========================================================
   إعدادات الدفع والحسابات
========================================================= */
function defaultPaymentMethods() {
  return [
    { id: "pm_cash", name: "كاش", type: "cash", hint: "دفع نقدي مباشر" },
    { id: "pm_bank", name: "بنك", type: "bank", hint: "تحويل بنكي" },
    { id: "pm_jawwal", name: "جوال باي", type: "wallet", hint: "دفع عبر جوال باي" },
    { id: "pm_instant", name: "تطبيق فوري", type: "instant_app", hint: "دفع عبر تطبيق فوراً" },
    { id: "pm_later", name: "تطبيق لاحق", type: "later_app", hint: "دفع لاحق عبر تطبيق" },
    { id: "pm_debt", name: "دين", type: "debt", hint: "إضافة الفاتورة لحساب العميل" }
  ];
}

async function getPaymentMethods() {
  const settings = await idbGet("meta", "settings");
  const items = settings?.paymentMethods;

  if (Array.isArray(items) && items.length) return items;

  return defaultPaymentMethods();
}

async function setPaymentMethods(items) {
  const settings = await idbGet("meta", "settings") || { id: "settings" };
  settings.paymentMethods = Array.isArray(items) ? items : defaultPaymentMethods();
  settings.updatedAt = nowIso();
  await idbSet("meta", settings);
  setLocalSettings(settings);
}

function paymentMethodLabel(method) {
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
  return map[method] || method || "-";
}

async function renderPaymentMethodsList() {
  const box = qs("paymentMethodsList");
  if (!box) return;

  const methods = await getPaymentMethods();
  box.innerHTML = "";

  methods.forEach(m => {
    box.innerHTML += `
      <div class="bg-white border rounded-2xl p-4 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="font-black">${escapeHtml(m.name || "-")}</div>
          <div class="text-xs text-gray-500 mt-1">${escapeHtml(paymentMethodLabel(m.type))} — ${escapeHtml(m.hint || "")}</div>
        </div>
        <button onclick="deletePaymentMethod('${escapeJs(m.id)}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-bold">
          حذف
        </button>
      </div>
    `;
  });
}

async function addPaymentMethod() {
  const name = qs("paymentMethodNameInput")?.value.trim() || "";
  const type = qs("paymentMethodTypeInput")?.value || "custom";
  const hint = qs("paymentMethodHintInput")?.value.trim() || "";

  if (!name) {
    alert("يرجى إدخال اسم طريقة الدفع");
    return;
  }

  const methods = await getPaymentMethods();

  methods.push({
    id: `pm_${Date.now()}`,
    name,
    type,
    hint
  });

  await setPaymentMethods(methods);

  if (qs("paymentMethodNameInput")) qs("paymentMethodNameInput").value = "";
  if (qs("paymentMethodHintInput")) qs("paymentMethodHintInput").value = "";

  await renderPaymentMethodsList();
  await fillPaymentMethodsSelects();

  showToast("تمت إضافة طريقة الدفع", "success");
}

async function deletePaymentMethod(id) {
  const methods = await getPaymentMethods();
  const filtered = methods.filter(m => m.id !== id);

  await setPaymentMethods(filtered.length ? filtered : defaultPaymentMethods());
  await renderPaymentMethodsList();
  await fillPaymentMethodsSelects();

  showToast("تم حذف طريقة الدفع", "success");
}
async function fillPaymentMethodsSelects() {
  const methods = await getPaymentMethods();

  const selects = [
    qs("paymentMethod"),
    qs("manualPaymentMethod"),
    qs("supplierPaymentMethod"),
    qs("customerPaymentMethodInput")
  ].filter(Boolean);

  selects.forEach(select => {
    const old = select.value;
    select.innerHTML = "";

    methods.forEach(m => {
      const option = document.createElement("option");
      option.value = m.type || "custom";
      option.textContent = `${m.name || paymentMethodLabel(m.type)}${m.hint ? " - " + m.hint : ""}`;
      select.appendChild(option);
    });

    if ([...select.options].some(o => o.value === old)) {
      select.value = old;
    }
  });
}

async function getTransferAccounts() {
  const settings = await idbGet("meta", "settings");
  const items = settings?.transferAccounts;

  return Array.isArray(items) ? items : [];
}

async function setTransferAccounts(items) {
  const settings = await idbGet("meta", "settings") || { id: "settings" };
  settings.transferAccounts = Array.isArray(items) ? items : [];
  settings.updatedAt = nowIso();
  await idbSet("meta", settings);
  setLocalSettings(settings);
}

async function addTransferAccount() {
  const type = qs("accountTypeInput")?.value.trim() || "";
  const owner = qs("accountOwnerInput")?.value.trim() || "";
  const number = qs("accountNumberInput")?.value.trim() || "";
  const openingBalance = Number(qs("accountOpeningBalanceInput")?.value || 0);

  if (!type || !owner) {
    alert("يرجى إدخال نوع الحساب واسم البنك أو صاحب الحساب");
    return;
  }

  const accounts = await getTransferAccounts();

  accounts.push({
    id: `acc_${Date.now()}`,
    type,
    owner,
    number,
    openingBalance
  });

  await setTransferAccounts(accounts);

  if (qs("accountTypeInput")) qs("accountTypeInput").value = "";
  if (qs("accountOwnerInput")) qs("accountOwnerInput").value = "";
  if (qs("accountNumberInput")) qs("accountNumberInput").value = "";
  if (qs("accountOpeningBalanceInput")) qs("accountOpeningBalanceInput").value = "";

  await renderTransferAccountsList();
  await fillTransferAccountsSelects();

  showToast("تمت إضافة الحساب", "success");
}

async function deleteTransferAccount(id) {
  const accounts = await getTransferAccounts();
  const filtered = accounts.filter(acc => acc.id !== id);

  await setTransferAccounts(filtered);
  await renderTransferAccountsList();
  await fillTransferAccountsSelects();

  showToast("تم حذف الحساب", "success");
}

async function renderTransferAccountsList() {
  const container = qs("accountsList");
  if (!container) return;

  const accounts = await getTransferAccounts();
  container.innerHTML = "";

  if (!accounts.length) {
    container.innerHTML = `
      <div class="text-sm text-gray-500 text-center bg-gray-50 rounded-xl p-4">
        لا توجد حسابات مضافة
      </div>
    `;
    return;
  }

  accounts.forEach(account => {
    container.innerHTML += `
      <div class="bg-white border rounded-2xl p-4 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs font-black">${escapeHtml(account.type || "-")}</span>
            <span class="font-black">${escapeHtml(account.owner || "-")}</span>
          </div>

          <div class="text-xs text-gray-500">
            رقم التحويل: ${escapeHtml(account.number || "-")} —
            رصيد افتتاحي: ${money(account.openingBalance || 0)}
          </div>
        </div>

        <button onclick="deleteTransferAccount('${escapeJs(account.id)}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-bold">
          حذف
        </button>
      </div>
    `;
  });
}

async function fillTransferAccountsSelects() {
  const accounts = await getTransferAccounts();

  const selects = [
    qs("transferAccountSelect"),
    qs("transferAccountSelectManual"),
    qs("supplierPaymentAccountSelect"),
    qs("customerPaymentAccountSelect")
  ].filter(Boolean);

  selects.forEach(select => {
    const old = select.value;

    select.innerHTML = `<option value="">اختر الحساب</option>`;

    accounts.forEach(acc => {
      const option = document.createElement("option");
      option.value = acc.id;
      option.textContent = `${acc.type || ""} - ${acc.owner || ""}${acc.number ? " - " + acc.number : ""}`;
      select.appendChild(option);
    });

    if ([...select.options].some(o => o.value === old)) {
      select.value = old;
    }
  });
}

async function accountById(id) {
  if (!id) return null;
  const accounts = await getTransferAccounts();
  return accounts.find(acc => acc.id === id) || null;
}

/* =========================================================
   الإعدادات
========================================================= */
async function loadSettingsPage() {
  const store = await idbGet("stores", currentStoreId);
  const settings = await getClientSettings();

  if (store) {
    if (qs("setStoreName")) qs("setStoreName").value = store.name || "";
    if (qs("setStoreLogo")) qs("setStoreLogo").value = store.logo || "";
    setImageOrHide(qs("settingsLogoPreview"), store.logo);
  }

  if (qs("currencyNameInput")) qs("currencyNameInput").value = settings.currencyName || "شيكل";
  if (qs("currencySymbolInput")) qs("currencySymbolInput").value = settings.currencySymbol || "₪";
  if (qs("expensesDeductDefaultInput")) qs("expensesDeductDefaultInput").checked = settings.expensesDeductDefault !== false;
  if (qs("lowStockDefaultInput")) qs("lowStockDefaultInput").value = Number(settings.lowStockDefault || 5);

  await renderPaymentMethodsList();
  await renderTransferAccountsList();
  await fillPaymentMethodsSelects();
  await fillTransferAccountsSelects();

  updateLicenseUIFromSession();

  if (qs("setCurrentSystemMode")) {
    qs("setCurrentSystemMode").innerText = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";
  }

  if (qs("offlineSyncWrap")) {
    qs("offlineSyncWrap").classList.toggle("hidden", getLocalSession()?.appMode !== "online");
  }
}

async function saveSettings() {
  const session = getLocalSession();
  const oldSettings = await idbGet("meta", "settings") || { id: "settings" };

  const currencyName = qs("currencyNameInput")?.value.trim() || "شيكل";
  const currencySymbol = qs("currencySymbolInput")?.value.trim() || "₪";
  const expensesDeductDefault = qs("expensesDeductDefaultInput")?.checked !== false;
  const lowStockDefault = Number(qs("lowStockDefaultInput")?.value || 5);

  await withLoader("جاري حفظ الإعدادات...", async () => {
    const store = await getEntity("stores", currentStoreId);

    if (store) {
      await saveEntity("stores", currentStoreId, {
        ...store,
        name: qs("setStoreName")?.value.trim() || "المحل الرئيسي",
        logo: qs("setStoreLogo")?.value.trim() || "",
        updatedAt: nowIso()
      });
    }

    const settingsPayload = {
      ...oldSettings,
      id: "settings",
      currencyName,
      currencySymbol,
      expensesDeductDefault,
      lowStockDefault,
      appMode: session?.appMode || oldSettings.appMode || "online",
      updatedAt: nowIso()
    };

    await idbSet("meta", settingsPayload);
    setLocalSettings(settingsPayload);

    if (isOnline() && session?.appMode === "online") {
      await update(ref(db, pathClientSettings()), {
        currencyName,
        currencySymbol,
        expensesDeductDefault,
        lowStockDefault,
        paymentMethods: settingsPayload.paymentMethods || defaultPaymentMethods(),
        transferAccounts: settingsPayload.transferAccounts || [],
        appMode: session?.appMode || "online",
        updatedAt: nowIso()
      });
    }
  });

  await loadCurrentStore();
  await updateCurrencyUI();
  await refreshAllVisible();

  showToast("تم حفظ الإعدادات بنجاح", "success");
}

function previewStoreLogo(value) {
  setImageOrHide(qs("settingsLogoPreview"), value);
}

async function updateCurrencyUI() {
  const settings = await getClientSettings();
  setLocalSettings(settings);

  const text = `${settings.currencySymbol || "₪"} ${settings.currencyName || "شيكل"}`;

  if (qs("sideCurrencyText")) qs("sideCurrencyText").innerText = text;
  if (qs("posCurrencyBadge")) qs("posCurrencyBadge").innerText = text;
  if (qs("sideModeText")) qs("sideModeText").innerText = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";
  if (qs("setCurrentSystemMode")) qs("setCurrentSystemMode").innerText = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";
}

async function getClientSettings() {
  const settings = await idbGet("meta", "settings");

  if (settings) {
    return {
      id: "settings",
      currencyName: settings.currencyName || "شيكل",
      currencySymbol: settings.currencySymbol || "₪",
      appMode: settings.appMode || "online",
      expensesDeductDefault: settings.expensesDeductDefault !== false,
      lowStockDefault: Number(settings.lowStockDefault || 5),
      paymentMethods: Array.isArray(settings.paymentMethods) ? settings.paymentMethods : defaultPaymentMethods(),
      transferAccounts: Array.isArray(settings.transferAccounts) ? settings.transferAccounts : []
    };
  }

  return getLocalSettings();
}

function getLocalSettings() {
  return {
    currencyName: localStorage.getItem(`${PREFIX}_currency_name`) || "شيكل",
    currencySymbol: localStorage.getItem(`${PREFIX}_currency_symbol`) || "₪",
    appMode: localStorage.getItem(`${PREFIX}_app_mode`) || "online",
    expensesDeductDefault: localStorage.getItem(`${PREFIX}_expenses_deduct_default`) !== "false",
    lowStockDefault: Number(localStorage.getItem(`${PREFIX}_low_stock_default`) || 5),
    paymentMethods: defaultPaymentMethods(),
    transferAccounts: []
  };
}

function setLocalSettings(settings) {
  localStorage.setItem(`${PREFIX}_currency_name`, settings.currencyName || "شيكل");
  localStorage.setItem(`${PREFIX}_currency_symbol`, settings.currencySymbol || "₪");
  localStorage.setItem(`${PREFIX}_app_mode`, settings.appMode || "online");
  localStorage.setItem(`${PREFIX}_expenses_deduct_default`, settings.expensesDeductDefault !== false ? "true" : "false");
  localStorage.setItem(`${PREFIX}_low_stock_default`, String(settings.lowStockDefault || 5));
}

/* =========================================================
   النسخ الاحتياطي والمزامنة
========================================================= */
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
    settings
  ] = await Promise.all([
    getAllStores(),
    getAllProducts(),
    getAllInvoices(),
    getAllPurchases(),
    getAllSupplierPayments(),
    getAllCustomers(),
    getAllCustomerPayments(),
    getAllExpenses(),
    getClientSettings()
  ]);

  return {
    backupVersion: BACKUP_VERSION,
    createdAt: nowIso(),
    key: currentLicenseKey(),
    activeStoreId: currentStoreId,
    settings,
    stores,
    products,
    invoices,
    purchases,
    supplierPayments,
    customers,
    customerPayments,
    expenses,
    invoiceCounter: await idbGet("meta", "invoiceCounter")
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
    a.download = `cashier_backup_${sanitizeKey(currentLicenseKey())}_${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
  });
}

async function saveCloudBackup() {
  const session = getLocalSession();

  if (!currentLicenseKey()) return;

  if (!isOnline() || session?.appMode !== "online") {
    alert("هذه العملية تحتاج إنترنت ونسخة أونلاين");
    return;
  }

  await withLoader("جاري حفظ النسخة السحابية...", async () => {
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

    showToast("تمت الاستعادة بنجاح", "success");
    await bootSessionState();
  } catch (err) {
    console.error(err);
    alert("تعذر استعادة النسخة الاحتياطية");
  } finally {
    event.target.value = "";
  }
}

async function restoreBackupPayload(data) {
  const storeNames = [
    "stores",
    "products",
    "invoices",
    "purchases",
    "supplierPayments",
    "customers",
    "customerPayments",
    "expenses"
  ];

  for (const storeName of storeNames) {
    await idbClear(storeName);
  }

  for (const item of (data.stores || [])) await idbSet("stores", item);
  for (const item of (data.products || [])) await idbSet("products", item);
  for (const item of (data.invoices || [])) await idbSet("invoices", item);
  for (const item of (data.purchases || [])) await idbSet("purchases", item);
  for (const item of (data.supplierPayments || [])) await idbSet("supplierPayments", item);
  for (const item of (data.customers || [])) await idbSet("customers", item);
  for (const item of (data.customerPayments || [])) await idbSet("customerPayments", item);
  for (const item of (data.expenses || [])) await idbSet("expenses", item);

  if (data.settings) {
    await idbSet("meta", { id: "settings", ...data.settings });
    setLocalSettings(data.settings);
  }

  const maxInvoiceId = Math.max(0, ...(data.invoices || []).map(i => Number(i.id) || 0));
  const counterValue = Math.max(maxInvoiceId, Number(data.invoiceCounter?.value || 0));

  await idbSet("meta", { id: "invoiceCounter", value: counterValue });

  if (data.activeStoreId) {
    currentStoreId = data.activeStoreId;
    localStorage.setItem("activeStoreId", currentStoreId);
  }

  if (isOnline() && getLocalSession()?.appMode === "online") {
    await uploadOfflineDataToCloud();
  }
}
async function downloadOfflinePackage() {
  const session = getLocalSession();

  if (!session) return;

  await withLoader("جاري تجهيز حزمة الأوفلاين...", async () => {
    if (isOnline() && session.appMode === "online") {
      await syncCloudToOffline();
    }

    const payload = await buildBackupPayload();

    payload.packageType = "offline-sync-package";
    payload.session = session;

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `offline_package_${sanitizeKey(currentLicenseKey())}_${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
  });
}

async function importOfflinePackage(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    await withLoader("جاري استيراد حزمة الأوفلاين...", async () => {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data || data.packageType !== "offline-sync-package") {
        throw new Error("ملف غير صالح");
      }

      await restoreBackupPayload(data);
    });

    showToast("تم استيراد حزمة الأوفلاين", "success");
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
    return;
  }

  if (!isOnline()) {
    alert("هذه العملية تحتاج إنترنت");
    return;
  }

  await withLoader("جاري رفع البيانات للسحابة...", async () => {
    const stores = await idbGetAll("stores");
    const products = await idbGetAll("products");
    const invoices = await idbGetAll("invoices");
    const purchases = await idbGetAll("purchases");
    const supplierPayments = await idbGetAll("supplierPayments");
    const customers = await idbGetAll("customers");
    const customerPayments = await idbGetAll("customerPayments");
    const expenses = await idbGetAll("expenses");
    const settings = await idbGet("meta", "settings");
    const counter = await idbGet("meta", "invoiceCounter");

    for (const item of stores) {
      await set(ref(db, `${pathClientStores()}/${item.id}`), item);
    }

    for (const item of products) {
      await set(ref(db, `${pathClientProducts()}/${item.id}`), item);
    }

    for (const item of invoices) {
      await set(ref(db, `${pathClientInvoices()}/${item.id}`), item);
    }

    for (const item of purchases) {
      await set(ref(db, `${pathClientPurchases()}/${item.id}`), item);
    }

    for (const item of supplierPayments) {
      await set(ref(db, `${pathClientSupplierPayments()}/${item.id}`), item);
    }

    for (const item of customers) {
      await set(ref(db, `${pathClientCustomers()}/${item.id}`), item);
    }

    for (const item of customerPayments) {
      await set(ref(db, `${pathClientCustomerPayments()}/${item.id}`), item);
    }

    for (const item of expenses) {
      await set(ref(db, `${pathClientExpenses()}/${item.id}`), item);
    }

    if (settings) {
      await update(ref(db, pathClientSettings()), {
        currencyName: settings.currencyName || "شيكل",
        currencySymbol: settings.currencySymbol || "₪",
        expensesDeductDefault: settings.expensesDeductDefault !== false,
        lowStockDefault: Number(settings.lowStockDefault || 5),
        paymentMethods: settings.paymentMethods || defaultPaymentMethods(),
        transferAccounts: settings.transferAccounts || [],
        appMode: "online",
        updatedAt: nowIso()
      });
    }

    if (counter?.value != null) {
      await set(ref(db, `${pathClientCounters()}/invoiceAutoNumber`), Number(counter.value || 0));
    }
  });

  showToast("تم رفع البيانات للسحابة", "success");
}

async function syncCloudToOffline() {
  const session = getLocalSession();

  if (!isOnline() || session?.appMode !== "online" || !baseClientPath()) {
    return;
  }

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
  const settings = settingsSnap.exists() ? settingsSnap.val() || {} : {};
  const counter = counterSnap.exists() ? Number(counterSnap.val() || 0) : 0;

  await idbClear("stores");
  await idbClear("products");
  await idbClear("invoices");
  await idbClear("purchases");
  await idbClear("supplierPayments");
  await idbClear("customers");
  await idbClear("customerPayments");
  await idbClear("expenses");

  for (const item of stores) await idbSet("stores", item);
  for (const item of products) await idbSet("products", item);
  for (const item of invoices) await idbSet("invoices", item);
  for (const item of purchases) await idbSet("purchases", item);
  for (const item of supplierPayments) await idbSet("supplierPayments", item);
  for (const item of customers) await idbSet("customers", item);
  for (const item of customerPayments) await idbSet("customerPayments", item);
  for (const item of expenses) await idbSet("expenses", item);

  const mergedSettings = {
    id: "settings",
    currencyName: settings.currencyName || "شيكل",
    currencySymbol: settings.currencySymbol || "₪",
    appMode: session?.appMode || "online",
    expensesDeductDefault: settings.expensesDeductDefault !== false,
    lowStockDefault: Number(settings.lowStockDefault || 5),
    paymentMethods: Array.isArray(settings.paymentMethods) ? settings.paymentMethods : defaultPaymentMethods(),
    transferAccounts: Array.isArray(settings.transferAccounts) ? settings.transferAccounts : [],
    updatedAt: settings.updatedAt || nowIso()
  };

  await idbSet("meta", mergedSettings);
  setLocalSettings(mergedSettings);

  await idbSet("meta", {
    id: "invoiceCounter",
    value: counter
  });
}

/* =========================================================
   الباركود والكاميرا
========================================================= */
function rankRearCamera(devices) {
  if (!devices?.length) return null;

  const rearKeywords = ["back", "rear", "environment", "خلف", "خلفية"];
  const exactRear = devices.find(d =>
    rearKeywords.some(k => String(d.label || "").toLowerCase().includes(k))
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
      target === "invoice"
        ? "مسح فاتورة"
        : target === "product-code"
          ? "مسح كود المنتج"
          : "مسح الباركود";
  }

  if (!history.state || !history.state.scannerOpen) {
    history.pushState({ scannerOpen: true }, "");
    scannerHistoryPushed = true;
  }

  try {
    if (!scanner) {
      scanner = new Html5Qrcode("reader");
    }

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

    setTimeout(() => {
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

  if (!scanned) return;

  if (scanTarget === "pos") {
    const products = await getAllProducts();

    const found = products.find(p =>
      p.storeId === currentStoreId &&
      String(p.code || "").trim().toLowerCase() === scanned.toLowerCase()
    );

    if (found) {
      addToCart(found, "base");
    } else {
      alert("لم يتم العثور على صنف بهذا الباركود");
    }

    return;
  }

  if (scanTarget === "product-code") {
    if (qs("prodCode")) qs("prodCode").value = scanned;
    showToast("تم التقاط كود المنتج", "success");
    return;
  }

  const idMatch = scanned.match(/INV-(\d+)/i) || scanned.match(/^(\d+)$/);

  if (idMatch) {
    await viewInvoice(idMatch[1]);
  } else {
    alert("تعذر قراءة رقم الفاتورة من الكود");
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

  if (qs("scannerTorchBtn")) {
    qs("scannerTorchBtn").innerText = "تشغيل / إيقاف الفلاش";
  }

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
    await withLoader("جاري قراءة الصورة...", async () => {
      const tempId = `temp-reader-${Date.now()}`;
      const tempDiv = document.createElement("div");
      tempDiv.id = tempId;
      tempDiv.style.display = "none";
      document.body.appendChild(tempDiv);

      const imageScanner = new Html5Qrcode(tempId);
      const result = await imageScanner.scanFile(file, true);

      document.body.removeChild(tempDiv);

      indicateScannerSuccess();
      await handleScanResult(result);
    });
  } catch (err) {
    console.error(err);
    alert("تعذر قراءة الباركود من الصورة");
  } finally {
    event.target.value = "";
  }
}
/* =========================================================
   تصدير الفاتورة صورة / PDF / طباعة / مشاركة
========================================================= */
function renderInvoiceBarcode(id) {
  const svg = qs("invoiceBarcodeSvg");
  const code = `INV-${id}`;

  if (!svg) return;

  svg.innerHTML = "";

  try {
    JsBarcode(svg, code, {
      format: "CODE128",
      lineColor: "#111827",
      width: 1.4,
      height: 44,
      displayValue: false,
      margin: 0
    });
  } catch {}

  if (qs("invoiceBarcodeText")) qs("invoiceBarcodeText").innerText = code;
}

async function viewInvoice(id) {
  await withLoader("جاري تحميل الفاتورة...", async () => {
    const inv = await getEntity("invoices", String(id));

    if (!inv) {
      alert("الفاتورة غير موجودة");
      return;
    }

    currentInvoiceId = String(id);

    let store = await idbGet("stores", inv.storeId);
    if (!store) store = { name: "المحل", logo: "" };

    qs("mainApp")?.classList.add("hidden");
    qs("invoicePage")?.classList.remove("hidden");

    if (qs("invPageStoreName")) qs("invPageStoreName").innerText = store.name || "المحل";
    setImageOrHide(qs("invPageLogo"), store.logo);

    if (qs("invPageId")) qs("invPageId").innerText = `#${inv.id}`;
    if (qs("invPageDate")) qs("invPageDate").innerText = formatDateTime(inv.date);
    if (qs("invPageCustomer")) qs("invPageCustomer").innerText = inv.customer || "-";
    if (qs("invPagePhone")) qs("invPagePhone").innerText = inv.phone || "-";
    if (qs("invPagePayment")) qs("invPagePayment").innerText = paymentMethodLabel(inv.paymentMethod || "cash");
    if (qs("invPageTransferNo")) qs("invPageTransferNo").innerText = inv.transferNumber || "-";
    if (qs("invPageStatus")) qs("invPageStatus").innerText = statusLabel(inv.status || "paid");
    if (qs("invPageEmployee")) qs("invPageEmployee").innerText = inv.employeeName || "-";
    if (qs("invPageNotes")) qs("invPageNotes").innerText = inv.notes || "-";

    const itemArea = qs("invPageItems");
    if (itemArea) {
      itemArea.innerHTML = "";

      (inv.items || []).forEach((item, index) => {
        itemArea.innerHTML += `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.name || "-")}</td>
            <td>${escapeHtml(item.unitLabel || "-")}</td>
            <td>${Number(item.qty || 0)}</td>
            <td>${money(item.price || 0)}</td>
            <td>${money(item.total || 0)}</td>
          </tr>
        `;
      });
    }

    if (qs("invPageSub")) qs("invPageSub").innerText = money(inv.subtotal || 0);
    if (qs("invPageDiscount")) qs("invPageDiscount").innerText = money(inv.discount || 0);
    if (qs("invPageTotal")) qs("invPageTotal").innerText = money(inv.total || 0);

    renderInvoiceBarcode(inv.id);
    lucide.createIcons();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function backFromInvoicePage() {
  qs("invoicePage")?.classList.add("hidden");
  qs("mainApp")?.classList.remove("hidden");
  switchTab("sales");
}

function printInvoicePage() {
  window.print();
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      console.warn("تعذر تحويل الصورة إلى base64:", src, err);
    }
  }

  await ensureImagesLoaded(container);
  await wait(150);

  return () => {
    restoreList.forEach(fn => {
      try { fn(); } catch {}
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
    try { restoreImages(); } catch {}
    area.style.width = oldWidth;
    area.style.maxWidth = oldMaxWidth;
    area.style.transform = oldTransform;
    area.style.transformOrigin = oldTransformOrigin;
  };
}

async function exportInvoicePage(type) {
  const area = qs("invoicePrintArea");
  if (!area) return;

  const restore = await prepareInvoiceForExport();

  try {
    await withLoader("جاري تجهيز التصدير...", async () => {
      await ensureImagesLoaded(area);
      await wait(180);

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
    });
  } catch (err) {
    console.error(err);
    alert("تعذر تصدير الفاتورة. إذا لم يظهر الشعار، غالبًا رابط الصورة لا يسمح بالتصدير.");
  } finally {
    restore();
  }
}

async function shareCurrentInvoice() {
  if (!currentInvoiceId) return;

  const inv = await getEntity("invoices", String(currentInvoiceId));
  if (!inv) return;

  const message =
`فاتورة رقم #${inv.id}
العميل: ${inv.customer || "-"}
رقم العميل: ${inv.phone || "-"}
طريقة الدفع: ${paymentMethodLabel(inv.paymentMethod || "cash")}
رقم التحويل: ${inv.transferNumber || "-"}
الإجمالي: ${money(inv.total || 0)}
الحالة: ${statusLabel(inv.status || "paid")}
التاريخ: ${formatDateTime(inv.date)}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `فاتورة #${inv.id}`,
        text: message
      });
      return;
    } catch {}
  }

  if (inv.phone) {
    const url = `https://wa.me/${normalizePhoneForSend(inv.phone, "970", "")}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  }
}

function normalizePhoneForSend(phone, mode = "970", customPrefix = "") {
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

/* =========================================================
   IndexedDB
========================================================= */
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
  return await idbGet(kind, String(id));
}

async function saveEntity(kind, id, payload) {
  payload.id = String(id);
  payload.updatedAt = nowIso();

  await idbSet(kind, payload);

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
      await set(ref(db, `${pathMap[kind]}/${id}`), payload);
    }
  }
}

async function deleteEntity(kind, id) {
  await idbDelete(kind, String(id));

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

/* =========================================================
   تصديرات عامة للنافذة
========================================================= */
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

document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();
  bindBaseEvents();
  await initApp();
});

lucide.createIcons();