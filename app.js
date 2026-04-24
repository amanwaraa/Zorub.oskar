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

window.__APP_JS_LOADED__ = true;

window.addEventListener("error", e => {
  console.error("JS ERROR:", e.message, e.filename, e.lineno, e.colno);
  const err = document.getElementById("loginError");
  if (err) {
    err.innerText = "خطأ في ملف الجافا: " + e.message;
    err.classList.remove("hidden");
  }
});

window.addEventListener("unhandledrejection", e => {
  console.error("PROMISE ERROR:", e.reason);
  const err = document.getElementById("loginError");
  if (err) {
    err.innerText = "خطأ غير متوقع: " + (e.reason?.message || e.reason);
    err.classList.remove("hidden");
  }
});

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
const LOCAL_OFFLINE_DB_NAME = `${PREFIX}_offline_cashier_db_v7`;
const LOCAL_OFFLINE_DB_VERSION = 7;
const BACKUP_VERSION = 7;
const PENDING_SYNC_KEY = `${PREFIX}_PENDING_SYNC_QUEUE_V1`;
const LAST_SYNC_KEY = `${PREFIX}_LAST_SYNC_AT`;

let currentStoreId = localStorage.getItem("activeStoreId") || "default";
let cart = [];
let scanner = null;
let scanTarget = "pos";
let currentInvoiceId = null;
let editingInvoiceId = null;
let licenseWatcher = null;
let isCheckoutBusy = false;
let isSyncingNow = false;

let productPageSize = 10;
let invoicePageSize = 10;
let productsCurrentLimit = 10;
let invoicesCurrentLimit = 10;

let storesListenerRef = null;
let productsListenerRef = null;
let invoicesListenerRef = null;
let purchasesListenerRef = null;
let expensesListenerRef = null;
let merchantPaymentsListenerRef = null;
let licenseListenerRef = null;

let scannerTrack = null;
let scannerTorchOn = false;
let torchSupported = false;
let scannerHistoryPushed = false;
let scannerLock = false;

let currentCustomerHistoryName = "";
let currentCustomerHistoryPhone = "";

function qs(id) {
  return document.getElementById(id);
}

function safeLucide() {
  try {
    if (window.lucide) lucide.createIcons();
  } catch {}
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function isOnline() {
  return navigator.onLine;
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

function pathLicenses() { return `${PREFIX}_licenses`; }
function pathClientStores() { return `${baseClientPath()}/stores`; }
function pathClientProducts() { return `${baseClientPath()}/products`; }
function pathClientInvoices() { return `${baseClientPath()}/invoices`; }
function pathClientPurchases() { return `${baseClientPath()}/purchases`; }
function pathClientExpenses() { return `${baseClientPath()}/expenses`; }
function pathClientMerchantPayments() { return `${baseClientPath()}/merchantPayments`; }
function pathClientCounters() { return `${baseClientPath()}/counters`; }
function pathClientSettings() { return `${baseClientPath()}/settings`; }
function pathClientBackups() { return `${baseClientPath()}/backups`; }

document.addEventListener("DOMContentLoaded", async () => {
  safeLucide();

  const loginButton = qs("loginBtn");
  if (loginButton) {
    loginButton.onclick = handleLicenseLogin;
  }

  bindBaseEvents();
  bindOnlineOfflineEvents();

  try {
    await initApp();
  } catch (err) {
    console.error(err);
    showLogin("خطأ أثناء تشغيل التطبيق: " + (err?.message || err));
  }
});

function bindBaseEvents() {
  qs("loginBtn")?.addEventListener("click", handleLicenseLogin);
  qs("goToLoginBtn")?.addEventListener("click", goToLoginFromExpired);

  qs("openNewProductBtn")?.addEventListener("click", openNewProduct);
  qs("createInvoiceBtn")?.addEventListener("click", checkout);
  qs("saveProductBtn")?.addEventListener("click", saveProduct);

  qs("openPurchaseModalBtn")?.addEventListener("click", openPurchaseModal);
  qs("savePurchaseBtn")?.addEventListener("click", savePurchase);

  qs("openMerchantPaymentModalBtn")?.addEventListener("click", openMerchantPaymentModal);
  qs("saveMerchantPaymentBtn")?.addEventListener("click", saveMerchantPayment);

  qs("openExpenseModalBtn")?.addEventListener("click", openExpenseModal);
  qs("saveExpenseBtn")?.addEventListener("click", saveExpense);

  qs("createStoreBtn")?.addEventListener("click", createNewStore);
  qs("saveSettingsBtn")?.addEventListener("click", saveSettings);
  qs("logoutBtn")?.addEventListener("click", logoutUser);

  qs("manualSyncBtn")?.addEventListener("click", () => syncPendingAndCloud(true));
  qs("downloadBackupTopBtn")?.addEventListener("click", downloadBackupFile);

  qs("backFromInvoiceBtn")?.addEventListener("click", backFromInvoicePage);
  qs("printInvoiceBtn")?.addEventListener("click", printInvoicePage);
  qs("exportInvoiceImageBtn")?.addEventListener("click", () => exportInvoicePage("image"));
  qs("exportInvoicePdfBtn")?.addEventListener("click", () => exportInvoicePage("pdf"));
  qs("shareInvoiceBtn")?.addEventListener("click", shareCurrentInvoice);

  qs("downloadBackupBtn")?.addEventListener("click", downloadBackupFile);
  qs("saveCloudBackupBtn")?.addEventListener("click", saveCloudBackup);
  qs("restoreBackupInput")?.addEventListener("change", restoreBackupFromFile);

  qs("downloadOfflinePackageBtn")?.addEventListener("click", downloadOfflinePackage);
  qs("importOfflinePackageInput")?.addEventListener("change", importOfflinePackage);
  qs("uploadOfflineDataBtn")?.addEventListener("click", () => syncPendingAndCloud(true));

  qs("inventorySearch")?.addEventListener("input", resetProductsAndRender);
  qs("invSearchQuery")?.addEventListener("input", resetInvoicesAndRender);
  qs("invoiceStatusFilter")?.addEventListener("change", resetInvoicesAndRender);

  qs("reportFilter")?.addEventListener("change", renderReports);
  qs("posSearch")?.addEventListener("input", searchPosProducts);
  qs("posDiscount")?.addEventListener("input", calculateTotal);
  qs("discountType")?.addEventListener("change", calculateTotal);
  qs("setStoreLogo")?.addEventListener("input", e => previewStoreLogo(e.target.value));

  qs("paymentMethod")?.addEventListener("change", () => handlePaymentMethodUi("paymentMethod", "transferAccountSelect"));
  qs("manualPaymentMethod")?.addEventListener("change", () => handlePaymentMethodUi("manualPaymentMethod", "transferAccountSelectManual"));
  qs("merchantPaymentMethod")?.addEventListener("change", () => handlePaymentMethodUi("merchantPaymentMethod", "merchantPaymentAccount"));
  qs("expensePaymentMethod")?.addEventListener("change", () => handlePaymentMethodUi("expensePaymentMethod", "expenseAccount"));

  qs("barcodeImageInputPos")?.addEventListener("change", e => scanBarcodeFromImage(e, "pos"));
  qs("barcodeImageInputInvoice")?.addEventListener("change", e => scanBarcodeFromImage(e, "invoice"));

  qs("licenseKeyInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") handleLicenseLogin();
  });

  qs("customerName")?.addEventListener("input", handleCustomerInput);
  qs("customerPhone")?.addEventListener("input", handleCustomerInput);
  qs("manualCustomerName")?.addEventListener("input", handleManualCustomerInput);
  qs("manualCustomerPhone")?.addEventListener("input", handleManualCustomerInput);

  qs("customersSearch")?.addEventListener("input", renderCustomersPage);
  qs("customersReportRange")?.addEventListener("change", renderCustomersPage);
  qs("customersSpecificDate")?.addEventListener("change", renderCustomersPage);

  qs("customerHistoryRange")?.addEventListener("change", () => {
    if (currentCustomerHistoryName) {
      openCustomerHistory(currentCustomerHistoryName, currentCustomerHistoryPhone);
    }
  });

  qs("saveStatusBtn")?.addEventListener("click", saveInvoiceStatus);
  qs("customerCreateDebtInvoiceBtn")?.addEventListener("click", createAggregateInvoiceForCustomer);
  qs("customerSendDebtMsgBtn")?.addEventListener("click", sendDebtMessageToCustomer);

  qs("bulkPrintInvoicesBtn")?.addEventListener("click", () => exportBulkInvoices("print"));
  qs("bulkExportInvoicesPdfBtn")?.addEventListener("click", () => exportBulkInvoices("pdf"));
  qs("bulkExportInvoicesImagesBtn")?.addEventListener("click", () => exportBulkInvoices("image"));
  qs("bulkExportInvoicesExcelBtn")?.addEventListener("click", exportInvoicesExcel);

  qs("bulkPrintPurchasesBtn")?.addEventListener("click", () => exportBulkPurchases("print"));
  qs("bulkExportPurchasesPdfBtn")?.addEventListener("click", () => exportBulkPurchases("pdf"));
  qs("bulkExportPurchasesImagesBtn")?.addEventListener("click", () => exportBulkPurchases("image"));
  qs("bulkExportPurchasesExcelBtn")?.addEventListener("click", exportPurchasesExcel);

  qs("renderSalesReportBtn")?.addEventListener("click", renderSalesReport);
  qs("renderStockReportBtn")?.addEventListener("click", renderStockReport);
  qs("renderProfitReportBtn")?.addEventListener("click", renderProfitReport);

  qs("addAccountBtn")?.addEventListener("click", addTransferAccount);

  qs("loadMoreProductsBtn")?.addEventListener("click", loadMoreProducts);
  qs("loadMoreInvoicesBtn")?.addEventListener("click", loadMoreInvoices);

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
}

function bindOnlineOfflineEvents() {
  window.addEventListener("online", async () => {
    updateConnectionUI();
    await syncPendingAndCloud(true);
  });

  window.addEventListener("offline", () => {
    updateConnectionUI();
  });
}

async function initApp() {
  updateConnectionUI();
  updatePendingSyncBadge();
  await bootSessionState();
}
function showToast(message, type = "info") {
  const toast = qs("toast");
  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.className = "toast show";

  setTimeout(() => {
    toast.className = "toast";
  }, 2600);
}

function showLoader(text = "جاري المعالجة...", progress = 15) {
  const loader = qs("loader");
  const circle = qs("progressCircle");
  const textEl = qs("loaderText");

  if (!loader || !circle || !textEl) return;

  loader.classList.remove("hidden");
  textEl.innerText = text;
  circle.style.setProperty("--progress", progress);
  circle.setAttribute("data-progress", progress);
}

function updateLoader(text = "جاري المعالجة...", progress = 50) {
  const circle = qs("progressCircle");
  const textEl = qs("loaderText");

  if (textEl) textEl.innerText = text;
  if (circle) {
    circle.style.setProperty("--progress", progress);
    circle.setAttribute("data-progress", progress);
  }
}

function hideLoader() {
  const loader = qs("loader");
  const circle = qs("progressCircle");

  if (circle) {
    circle.style.setProperty("--progress", 100);
    circle.setAttribute("data-progress", 100);
  }

  setTimeout(() => {
    loader?.classList.add("hidden");
    if (circle) {
      circle.style.setProperty("--progress", 0);
      circle.setAttribute("data-progress", 0);
    }
  }, 160);
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

function showExpired(message = "انتهى وقت المفتاح أو عدد الاستخدامات المتاحة.") {
  qs("mainApp")?.classList.add("hidden");
  qs("invoicePage")?.classList.add("hidden");
  qs("loginPage")?.classList.add("hidden");
  qs("licenseExpiredPage")?.classList.remove("hidden");

  if (qs("expiredMessage")) qs("expiredMessage").innerText = message;
  safeLucide();
}

function showApp() {
  qs("loginPage")?.classList.add("hidden");
  qs("licenseExpiredPage")?.classList.add("hidden");
  qs("invoicePage")?.classList.add("hidden");
  qs("mainApp")?.classList.remove("hidden");
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

function formatDateTime(dateString) {
  if (!dateString) return "غير محدد";

  try {
    return new Date(dateString).toLocaleString("ar-EG");
  } catch {
    return dateString;
  }
}

function formatDateOnly(dateString) {
  if (!dateString) return "-";

  try {
    return new Date(dateString).toLocaleDateString("ar-EG");
  } catch {
    return "-";
  }
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

function paymentLabel(value) {
  if (value === "cash") return "كاش";
  if (value === "direct") return "بنكي مباشر";
  return value || "-";
}

function normalizeLogo(url) {
  return (url || "").trim();
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

function statusLabel(status) {
  return status === "paid" ? "مكتمل" : "غير مكتمل";
}

function statusClass(status) {
  return status === "paid" ? "status-paid" : "status-unpaid";
}

function getLocalSettings() {
  return {
    currencyName: localStorage.getItem(`${PREFIX}_currency_name`) || "شيكل",
    currencySymbol: localStorage.getItem(`${PREFIX}_currency_symbol`) || "₪",
    appMode: localStorage.getItem(`${PREFIX}_app_mode`) || "online",
    paymentInfo: localStorage.getItem(`${PREFIX}_payment_info`) || ""
  };
}

function setLocalSettings(settings) {
  localStorage.setItem(`${PREFIX}_currency_name`, settings.currencyName || "شيكل");
  localStorage.setItem(`${PREFIX}_currency_symbol`, settings.currencySymbol || "₪");
  localStorage.setItem(`${PREFIX}_app_mode`, settings.appMode || "online");
  localStorage.setItem(`${PREFIX}_payment_info`, settings.paymentInfo || "");
}

function money(value, withName = false, settings = null) {
  const st = settings || getLocalSettings();
  const symbol = st?.currencySymbol || "₪";
  const name = st?.currencyName || "شيكل";
  const amount = Number(value || 0).toFixed(2);

  return withName ? `${amount} ${name} ${symbol}` : `${amount} ${symbol}`;
}

async function getClientSettings() {
  const settings = await idbGet("meta", "settings");
  const session = getLocalSession();

  if (settings) {
    return {
      currencyName: settings.currencyName || "شيكل",
      currencySymbol: settings.currencySymbol || "₪",
      appMode: session?.appMode || settings.appMode || "online",
      paymentInfo: settings.paymentInfo || ""
    };
  }

  const fallback = getLocalSettings();
  fallback.appMode = session?.appMode || fallback.appMode || "online";
  return fallback;
}

async function updateCurrencyUI() {
  const settings = await getClientSettings();
  setLocalSettings(settings);

  if (qs("sideCurrencyText")) qs("sideCurrencyText").innerText = `${settings.currencySymbol} ${settings.currencyName}`;
  if (qs("posCurrencyBadge")) qs("posCurrencyBadge").innerText = `${settings.currencySymbol} ${settings.currencyName}`;
  if (qs("sideModeText")) qs("sideModeText").innerText = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";
  if (qs("setCurrentSystemMode")) qs("setCurrentSystemMode").innerText = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";

  const session = getLocalSession();
  if (qs("offlineSyncWrap")) {
    qs("offlineSyncWrap").classList.toggle("hidden", session?.appMode !== "online");
  }
}

function updateConnectionUI() {
  const el = qs("connectionStatus");

  if (el) {
    if (navigator.onLine) {
      el.className = "connection-pill connection-online";
      el.innerHTML = `<i data-lucide="wifi" size="16"></i> متصل`;
    } else {
      el.className = "connection-pill connection-offline";
      el.innerHTML = `<i data-lucide="wifi-off" size="16"></i> غير متصل`;
    }
  }

  const last = localStorage.getItem(LAST_SYNC_KEY);
  if (qs("syncStatusText")) {
    qs("syncStatusText").innerText = last ? `آخر مزامنة: ${formatDateTime(last)}` : "آخر مزامنة: -";
  }

  safeLucide();
}

function getPendingQueue() {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setPendingQueue(queue) {
  localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue || []));
  updatePendingSyncBadge();
}

function addPendingSync(action) {
  const session = getLocalSession();
  if (session?.appMode !== "online") return;

  const queue = getPendingQueue();
  queue.push({
    ...action,
    queuedAt: new Date().toISOString()
  });

  setPendingQueue(queue);
}

function updatePendingSyncBadge() {
  const count = getPendingQueue().length;
  const badge = qs("pendingSyncBadge");

  if (badge) {
    badge.textContent = count;
    badge.classList.toggle("hidden", count <= 0);
  }
}

async function syncPendingAndCloud(manual = false) {
  const session = getLocalSession();

  if (!session || session.appMode !== "online") return;

  if (!navigator.onLine) {
    updateConnectionUI();
    if (manual) showToast("لا يوجد إنترنت، سيتم الحفظ محليًا", "info");
    return;
  }

  if (isSyncingNow) return;
  isSyncingNow = true;

  showLoader("جاري المزامنة...", 10);

  try {
    const queue = getPendingQueue();

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const progress = Math.min(88, Math.round(((i + 1) / Math.max(queue.length, 1)) * 80));

      updateLoader(`جاري رفع البيانات... ${i + 1}/${queue.length}`, progress);

      if (item.type === "set") {
        await set(ref(db, item.path), item.payload);
      }

      if (item.type === "remove") {
        await remove(ref(db, item.path));
      }
    }

    setPendingQueue([]);

    updateLoader("جاري رفع آخر نسخة...", 90);
    await uploadOfflineDataToCloud(false);

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    updateConnectionUI();

    if (manual) showToast("تمت المزامنة بنجاح", "success");
  } catch (err) {
    console.error(err);
    if (manual) alert("تعذرت المزامنة، سيتم المحاولة لاحقًا");
  } finally {
    hideLoader();
    isSyncingNow = false;
  }
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

  showLoader("جاري فتح النظام...", 20);

  try {
    if (!isOnline() && session.firstVerified) {
      await ensureClientDefaults();
      await loadCurrentStore();
      await updateCurrencyUI();
      detachRealtimeListeners();
      showApp();
      switchTab("pos");
      updateLicenseUIFromSession();
      startLicenseWatcher();
      calculateTotal();
      updateConnectionUI();
      return;
    }

    if (!session.firstVerified && !isOnline()) {
      showLogin("أول دخول يحتاج إنترنت");
      return;
    }

    await ensureClientDefaults();
    await loadCurrentStore();
    await updateCurrencyUI();

    if (isOnline() && session.appMode === "online") {
      await syncPendingAndCloud(false);
      attachRealtimeListeners();
      await refreshSessionFromLicense();
    } else {
      detachRealtimeListeners();
    }

    showApp();
    switchTab("pos");
    updateLicenseUIFromSession();
    startLicenseWatcher();
    calculateTotal();
    updateConnectionUI();
  } finally {
    hideLoader();
  }
}
async function ensureClientDefaults() {
  const stores = await idbGetAll("stores");

  if (!stores.length) {
    await idbSet("stores", {
      id: "default",
      name: "المحل الرئيسي",
      logo: "",
      createdAt: new Date().toISOString()
    });
  }

  const settings = await idbGet("meta", "settings");
  const session = getLocalSession();

  if (!settings) {
    await idbSet("meta", {
      id: "settings",
      currencyName: "شيكل",
      currencySymbol: "₪",
      appMode: session?.appMode || "online",
      paymentInfo: ""
    });
  } else {
    await idbSet("meta", {
      ...settings,
      appMode: session?.appMode || settings.appMode || "online"
    });
  }

  const counter = await idbGet("meta", "invoiceCounter");
  if (!counter) {
    await idbSet("meta", { id: "invoiceCounter", value: 0 });
  }

  const transferAccounts = await idbGet("meta", "transferAccounts");
  if (!transferAccounts) {
    await idbSet("meta", { id: "transferAccounts", items: [] });
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

  const appMode = lic.appMode || "online";

  const newSession = {
    ...session,
    durationType: lic.durationType || session.durationType,
    durationValue: lic.durationValue || session.durationValue,
    startedAt,
    expiresAt,
    appMode,
    allowOfflineFallback: lic.allowOfflineFallback === true,
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
    paymentInfo: cloudSettings?.paymentInfo || currentLocal.paymentInfo || ""
  };

  await idbSet("meta", mergedSettings);
  setLocalSettings(mergedSettings);

  if (newSession.appMode === "online") {
    await syncCloudToOffline();
  }
}

function attachRealtimeListeners() {
  detachRealtimeListeners();

  if (!baseClientPath()) return;

  storesListenerRef = ref(db, pathClientStores());
  productsListenerRef = ref(db, pathClientProducts());
  invoicesListenerRef = ref(db, pathClientInvoices());
  purchasesListenerRef = ref(db, pathClientPurchases());
  expensesListenerRef = ref(db, pathClientExpenses());
  merchantPaymentsListenerRef = ref(db, pathClientMerchantPayments());

  const session = getLocalSession();

  if (session?.key) {
    licenseListenerRef = ref(db, `${pathLicenses()}/${sanitizeKey(session.key)}`);
    onValue(licenseListenerRef, async () => {
      await refreshSessionFromLicense();
    });
  }

  onValue(storesListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await idbClear("stores");

    for (const item of items) {
      await idbSet("stores", item);
    }

    await loadCurrentStore();

    if (!qs("tab-stores")?.classList.contains("hidden")) {
      await renderStoresList();
    }
  });

  onValue(productsListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await idbClear("products");

    for (const item of items) {
      await idbSet("products", item);
    }

    if (!qs("tab-products")?.classList.contains("hidden")) {
      await renderProducts();
    }

    const q = qs("posSearch")?.value.trim();
    if (q) await searchPosProducts();
  });

  onValue(invoicesListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await idbClear("invoices");

    for (const item of items) {
      await idbSet("invoices", item);
    }

    if (!qs("tab-invoices")?.classList.contains("hidden")) {
      await renderInvoices();
    }

    if (!qs("tab-reports")?.classList.contains("hidden")) {
      await renderReports();
    }

    if (!qs("tab-customers")?.classList.contains("hidden")) {
      await renderCustomersPage();
    }
  });

  onValue(purchasesListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await idbClear("purchases");

    for (const item of items) {
      await idbSet("purchases", item);
    }

    if (!qs("tab-purchases")?.classList.contains("hidden")) {
      await renderPurchases();
    }

    if (!qs("tab-reports")?.classList.contains("hidden")) {
      await renderReports();
    }
  });

  onValue(expensesListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await idbClear("expenses");

    for (const item of items) {
      await idbSet("expenses", item);
    }

    if (!qs("tab-expenses")?.classList.contains("hidden")) {
      await renderExpenses();
    }
  });

  onValue(merchantPaymentsListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await idbClear("merchantPayments");

    for (const item of items) {
      await idbSet("merchantPayments", item);
    }

    if (!qs("tab-merchant-payments")?.classList.contains("hidden")) {
      await renderMerchantPayments();
    }
  });
}

function detachRealtimeListeners() {
  if (storesListenerRef) off(storesListenerRef);
  if (productsListenerRef) off(productsListenerRef);
  if (invoicesListenerRef) off(invoicesListenerRef);
  if (purchasesListenerRef) off(purchasesListenerRef);
  if (expensesListenerRef) off(expensesListenerRef);
  if (merchantPaymentsListenerRef) off(merchantPaymentsListenerRef);
  if (licenseListenerRef) off(licenseListenerRef);

  storesListenerRef = null;
  productsListenerRef = null;
  invoicesListenerRef = null;
  purchasesListenerRef = null;
  expensesListenerRef = null;
  merchantPaymentsListenerRef = null;
  licenseListenerRef = null;
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

  showLoader("جاري التحقق من المفتاح...", 10);

  try {
    const snap = await get(ref(db, `${pathLicenses()}/${sanitizeKey(key)}`));
    updateLoader("جاري فحص بيانات المفتاح...", 35);

    if (!snap.exists()) {
      showLogin("المفتاح غير موجود");
      return;
    }

    const lic = snap.val();

    if ((lic.status || "active") === "inactive") {
      showLogin("هذا المفتاح غير مفعل");
      return;
    }

    const maxLogins = lic.maxLogins === "unlimited" ? null : Number(lic.maxLogins ?? 1);
    const usedLogins = Number(lic.usedLogins || 0);

    if (maxLogins !== null && usedLogins >= maxLogins) {
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
      showExpired("انتهى وقت هذا المفتاح");
      return;
    }

    updateLoader("جاري حفظ الجلسة...", 60);

    await update(ref(db, `${pathLicenses()}/${sanitizeKey(key)}`), {
      startedAt,
      expiresAt,
      usedLogins: usedLogins + 1,
      lastLoginAt: new Date().toISOString()
    });

    const session = {
      key,
      durationType,
      durationValue,
      startedAt,
      expiresAt,
      loginAt: new Date().toISOString(),
      appMode: lic.appMode || "online",
      allowOfflineFallback: lic.allowOfflineFallback === true,
      rememberSession: lic.rememberSession !== false,
      firstVerified: true
    };

    setLocalSession(session);
    currentStoreId = "default";
    localStorage.setItem("activeStoreId", "default");

    updateLoader("جاري تجهيز البيانات...", 75);

    await ensureClientDefaults();

    if (session.appMode === "online") {
      await syncCloudToOffline();
    }

    await loadCurrentStore();
    await updateCurrencyUI();

    if (session.appMode === "online") {
      attachRealtimeListeners();
      await syncPendingAndCloud(false);
    }

    if (qs("licenseKeyInput")) qs("licenseKeyInput").value = "";

    updateLoader("تم الدخول بنجاح...", 100);

    showApp();
    switchTab("pos");
    updateLicenseUIFromSession();
    startLicenseWatcher();
    showToast("تم تسجيل الدخول بنجاح", "success");
  } catch (err2) {
    console.error(err2);
    showLogin("حدث خطأ أثناء تسجيل الدخول");
  } finally {
    hideLoader();
  }
}

function goToLoginFromExpired() {
  showLogin();
}

function activateNav(tabId) {
  document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  qs(`tab-${tabId}`)?.classList.remove("hidden");
  document.querySelector(`[data-tab="${tabId}"]`)?.classList.add("active");
}

async function switchTab(tabId) {
  activateNav(tabId);

  if (tabId === "products") await resetProductsAndRender();
  if (tabId === "invoices") await resetInvoicesAndRender();
  if (tabId === "purchases") await renderPurchases();
  if (tabId === "merchant-payments") await renderMerchantPayments();
  if (tabId === "customers") await renderCustomersPage();
  if (tabId === "expenses") await renderExpenses();
  if (tabId === "reports") await renderReports();
  if (tabId === "sales-report") await renderSalesReport();
  if (tabId === "stock-report") await renderStockReport();
  if (tabId === "profit-report") await renderProfitReport();
  if (tabId === "stores") await renderStoresList();
  if (tabId === "settings") await loadSettingsPage();

  safeLucide();
}

async function createNewStore() {
  const name = qs("newStoreName")?.value.trim();
  if (!name) return;

  showLoader("جاري إنشاء المحل...", 30);

  try {
    const id = "store_" + Date.now();

    await saveEntity("stores", id, {
      id,
      name,
      logo: "",
      createdAt: new Date().toISOString()
    });

    if (qs("newStoreName")) qs("newStoreName").value = "";

    toggleModal("storeModal", false);
    showToast("تم إنشاء المحل", "success");
    await renderStoresList();
  } finally {
    hideLoader();
  }
}

async function renderStoresList() {
  const grid = qs("storesGrid");
  if (!grid) return;

  grid.innerHTML = "";

  const stores = await getAllStores();
  stores.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  stores.forEach(store => {
    const active = store.id === currentStoreId;
    const logoHtml = normalizeLogo(store.logo)
      ? `<img src="${escapeHtmlAttr(store.logo)}" class="w-16 h-16 rounded-xl object-cover">`
      : `<div class="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400"><i data-lucide="image-off"></i></div>`;

    grid.innerHTML += `
      <div class="card p-6 border-2 ${active ? "border-emerald-500" : "border-transparent"}">
        <div class="flex items-center gap-4">
          ${logoHtml}
          <div class="flex-grow">
            <h4 class="font-black text-lg">${escapeHtml(store.name)}</h4>
            <p class="text-xs text-gray-400">تاريخ الإنشاء: ${new Date(store.createdAt).toLocaleDateString("ar-EG")}</p>
          </div>
          ${
            active
              ? '<span class="text-sm bg-emerald-100 text-emerald-700 px-3 py-2 rounded-lg font-black">الحالي</span>'
              : `<button onclick="switchStore('${store.id}')" class="text-sm bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg font-black">دخول</button>`
          }
        </div>
      </div>
    `;
  });

  safeLucide();
}

async function switchStore(id) {
  currentStoreId = id;
  localStorage.setItem("activeStoreId", id);

  showLoader("جاري تبديل المحل...", 50);

  try {
    await loadCurrentStore();
    cart = [];
    renderCart();
    editingInvoiceId = null;
    updateCreateInvoiceButton();
    switchTab("pos");
  } finally {
    hideLoader();
  }
}
function safeVariants(variants) {
  return Array.isArray(variants)
    ? variants.map(v => ({
        name: String(v.name || "").trim(),
        qty: Number(v.qty || 0)
      })).filter(v => v.name)
    : [];
}

function variantsTotal(variants) {
  return safeVariants(variants).reduce((s, v) => s + Number(v.qty || 0), 0);
}

function getVariantsFromForm() {
  const rows = [...document.querySelectorAll(".variant-row")];

  return rows.map(row => ({
    name: row.querySelector(".variant-name")?.value.trim() || "",
    qty: Number(row.querySelector(".variant-qty")?.value || 0)
  })).filter(v => v.name);
}

function renderVariantsForm(variants = []) {
  const box = qs("variantsBox");
  if (!box) return;

  box.innerHTML = "";
  safeVariants(variants).forEach(v => addVariantRow(v.name, v.qty));
}

function addVariantRow(name = "", qty = "") {
  const box = qs("variantsBox");
  if (!box) return;

  const row = document.createElement("div");
  row.className = "variant-row grid grid-cols-[1fr_120px_50px] gap-3 items-center";
  row.innerHTML = `
    <input type="text" class="variant-name w-full p-3 bg-gray-50 border rounded-xl" placeholder="اسم الصنف / المقاس" value="${escapeHtmlAttr(name)}">
    <input type="number" class="variant-qty w-full p-3 bg-gray-50 border rounded-xl text-center" placeholder="الكمية" value="${escapeHtmlAttr(qty)}">
    <button type="button" class="bg-red-50 text-red-600 rounded-xl h-full font-bold">✕</button>
  `;

  row.querySelector("button").onclick = () => {
    row.remove();
    syncStockWithVariants();
  };

  row.querySelector(".variant-qty")?.addEventListener("input", syncStockWithVariants);
  box.appendChild(row);
}

function syncStockWithVariants() {
  const variants = getVariantsFromForm();
  const total = variantsTotal(variants);
  const stockInput = qs("prodStock");

  if (!stockInput) return;

  const currentStock = Number(stockInput.value || 0);
  if (total > currentStock) stockInput.value = total;
}

function fillProductForm(p = null) {
  if (qs("editProductId")) qs("editProductId").value = p?.id || "";
  if (qs("prodSupplier")) qs("prodSupplier").value = p?.supplier || "";
  if (qs("prodName")) qs("prodName").value = p?.name || "";
  if (qs("prodCode")) qs("prodCode").value = p?.code || "";
  if (qs("prodStock")) qs("prodStock").value = p?.stock ?? "";
  if (qs("prodCost")) qs("prodCost").value = p?.cost ?? "";
  if (qs("prodPrice")) qs("prodPrice").value = p?.price ?? "";

  renderVariantsForm(p?.variants || []);
}

function resetProductForm() {
  if (qs("editProductId")) qs("editProductId").value = "";
  if (qs("modalTitle")) qs("modalTitle").innerText = "إضافة منتج جديد";
  if (qs("prodSupplier")) qs("prodSupplier").value = "";
  if (qs("prodName")) qs("prodName").value = "";
  if (qs("prodCode")) qs("prodCode").value = "";
  if (qs("prodStock")) qs("prodStock").value = "";
  if (qs("prodCost")) qs("prodCost").value = "";
  if (qs("prodPrice")) qs("prodPrice").value = "";

  renderVariantsForm([]);
}

function openNewProduct() {
  resetProductForm();
  toggleModal("productModal", true);
}

async function saveProduct() {
  const existingId = qs("editProductId")?.value.trim();
  const id = existingId || ("p_" + Date.now());
  const variants = getVariantsFromForm();
  const stockInput = Number(qs("prodStock")?.value || 0);
  const stock = Math.max(stockInput, variantsTotal(variants));

  let oldCreatedAt = null;
  if (existingId) {
    const old = await getEntity("products", existingId);
    oldCreatedAt = old?.createdAt || null;
  }

  const product = {
    id,
    storeId: currentStoreId,
    supplier: qs("prodSupplier")?.value.trim() || "",
    name: qs("prodName")?.value.trim(),
    code: qs("prodCode")?.value.trim(),
    stock,
    cost: parseFloat(qs("prodCost")?.value) || 0,
    price: parseFloat(qs("prodPrice")?.value) || 0,
    variants,
    createdAt: oldCreatedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!product.name || !product.code) {
    alert("يرجى إدخال اسم المنتج والكود");
    return;
  }

  showLoader(existingId ? "جاري تعديل المنتج..." : "جاري إضافة المنتج...", 40);

  try {
    await saveEntity("products", id, product);

    resetProductForm();
    toggleModal("productModal", false);

    showToast(existingId ? "تم تعديل المنتج" : "تم حفظ المنتج", "success");
    await renderProducts();
    await renderStockReport();
  } finally {
    hideLoader();
  }
}

async function renderProducts() {
  const table = qs("productsTable");
  const loading = qs("productsLoading");
  const moreWrap = qs("productsLoadMoreWrap");

  if (!table) return;

  const search = qs("inventorySearch")?.value.toLowerCase() || "";

  table.innerHTML = "";
  loading?.classList.remove("hidden");

  const products = await getAllProducts();

  const filtered = products
    .filter(p =>
      p.storeId === currentStoreId &&
      (
        (p.name || "").toLowerCase().includes(search) ||
        (p.code || "").toLowerCase().includes(search) ||
        (p.supplier || "").toLowerCase().includes(search)
      )
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const visible = filtered.slice(0, productsCurrentLimit);

  visible.forEach(p => {
    const variantsTxt = safeVariants(p.variants).length
      ? safeVariants(p.variants).map(v => `${v.name}: ${v.qty}`).join(" | ")
      : "-";

    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50 transition">
        <td class="p-4 font-mono text-sm">${escapeHtml(p.code)}</td>
        <td class="p-4 text-gray-600">${escapeHtml(p.supplier || "-")}</td>
        <td class="p-4 font-black text-gray-700">${escapeHtml(p.name)}</td>
        <td class="p-4 text-gray-500">${money(p.cost)}</td>
        <td class="p-4 text-emerald-700 font-black">${money(p.price)}</td>
        <td class="p-4">
          <span class="px-3 py-1 rounded-lg text-xs font-black ${Number(p.stock) <= 5 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}">
            ${Number(p.stock)}
          </span>
        </td>
        <td class="p-4 text-xs text-gray-500">${escapeHtml(variantsTxt)}</td>
        <td class="p-4 flex gap-2 flex-wrap">
          <button onclick="showProductBarcode('${escapeJs(p.code)}','${escapeJs(p.name)}')" class="text-purple-500 bg-purple-50 px-3 py-1 rounded-lg text-xs font-black">باركود</button>
          <button onclick="editProduct('${p.id}')" class="text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg text-xs font-black">تعديل</button>
          <button onclick="deleteProduct('${p.id}')" class="text-red-500 bg-red-50 px-3 py-1 rounded-lg text-xs font-black">حذف</button>
        </td>
      </tr>
    `;
  });

  loading?.classList.add("hidden");

  if (moreWrap) {
    moreWrap.classList.toggle("hidden", visible.length >= filtered.length);
  }

  safeLucide();
}

function showProductBarcode(code, title) {
  if (qs("barcodeTitle")) qs("barcodeTitle").innerText = title || "باركود المنتج";
  if (qs("barcodeText")) qs("barcodeText").innerText = code || "";

  const svg = qs("productBarcodeSvg");
  if (!svg) return;

  svg.innerHTML = "";

  try {
    JsBarcode(svg, String(code), {
      format: "CODE128",
      lineColor: "#047857",
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

async function resetProductsAndRender() {
  productsCurrentLimit = productPageSize;
  await renderProducts();
}

async function loadMoreProducts() {
  productsCurrentLimit += productPageSize;
  await renderProducts();
}

async function editProduct(id) {
  showLoader("جاري تحميل بيانات المنتج...", 50);

  try {
    const p = await getEntity("products", id);
    if (!p) return;

    if (qs("modalTitle")) qs("modalTitle").innerText = "تعديل المنتج";
    fillProductForm(p);
    toggleModal("productModal", true);
  } finally {
    hideLoader();
  }
}

async function deleteProduct(id) {
  if (!confirm("حذف المنتج؟")) return;

  showLoader("جاري حذف المنتج...", 50);

  try {
    await deleteEntity("products", id);
    showToast("تم حذف المنتج", "success");
    await renderProducts();
    await renderStockReport();
  } finally {
    hideLoader();
  }
}

async function searchPosProducts() {
  const query = qs("posSearch")?.value.toLowerCase().trim() || "";
  const results = qs("posSearchResults");

  if (!results) return;

  if (query.length < 1) {
    results.classList.add("hidden");
    return;
  }

  const products = await getAllProducts();

  const filtered = products.filter(p =>
    p.storeId === currentStoreId &&
    (
      (p.name || "").toLowerCase().includes(query) ||
      (p.code || "").toLowerCase().includes(query) ||
      (p.supplier || "").toLowerCase().includes(query)
    )
  );

  results.innerHTML = "";

  if (!filtered.length) {
    results.innerHTML = `<div class="p-4 text-center text-gray-400">لا توجد نتائج</div>`;
  } else {
    filtered.slice(0, 20).forEach(p => {
      const row = document.createElement("div");
      row.className = "flex justify-between items-center p-4 hover:bg-emerald-50 cursor-pointer rounded-xl gap-3";
      row.innerHTML = `
        <div class="flex-grow">
          <p class="font-black">${escapeHtml(p.name)}</p>
          <p class="text-xs text-gray-400">${escapeHtml(p.code)}</p>
          <p class="text-xs text-gray-400">المورد: ${escapeHtml(p.supplier || "-")}</p>
          <p class="text-xs ${Number(p.stock) <= 5 ? "text-red-500" : "text-green-600"}">المتوفر: ${Number(p.stock)}</p>
        </div>
        <div class="text-left whitespace-nowrap">
          <b class="text-emerald-700">${money(p.price)}</b>
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
}

function makeCartLineKey(productId, variantName = "") {
  return `${productId}__${variantName || ""}`;
}

function addToCart(product) {
  const safeProduct = clone(product);
  const defaultVariant = safeVariants(safeProduct.variants)[0]?.name || "";
  const key = makeCartLineKey(safeProduct.id, defaultVariant);
  const existing = cart.find(i => i.lineKey === key);

  if (existing) {
    const available = getAvailableQtyForLine(existing, safeProduct);

    if (existing.qty + 1 > available) {
      alert("نفذ المخزون!");
      return;
    }

    existing.qty += 1;
  } else {
    const available = getAvailableQtyForProduct(defaultVariant, safeProduct);

    if (available < 1) {
      alert("المنتج غير متوفر!");
      return;
    }

    cart.push({
      lineKey: key,
      id: safeProduct.id,
      name: safeProduct.name,
      code: safeProduct.code,
      supplier: safeProduct.supplier || "",
      price: Number(safeProduct.price || 0),
      cost: Number(safeProduct.cost || 0),
      stock: Number(safeProduct.stock || 0),
      variants: safeVariants(safeProduct.variants),
      selectedVariant: defaultVariant,
      qty: 1
    });
  }

  renderCart();
  showToast(`تمت إضافة ${safeProduct.name}`, "success");
}

function getAvailableQtyForProduct(variantName, productLike) {
  const variants = safeVariants(productLike.variants);

  if (variantName && variants.length) {
    const found = variants.find(v => v.name === variantName);
    return Number(found?.qty || 0);
  }

  return Number(productLike.stock || 0);
}

function getAvailableQtyForLine(line, productLike) {
  return getAvailableQtyForProduct(line.selectedVariant, productLike);
}

function updateCartLineKey(line) {
  line.lineKey = makeCartLineKey(line.id, line.selectedVariant);
}

function renderVariantSelect(line) {
  const variants = safeVariants(line.variants);

  if (!variants.length) {
    return `<span class="text-gray-400">-</span>`;
  }

  return `
    <select onchange="changeCartVariant('${line.lineKey}', this.value)" class="bg-gray-50 border rounded-lg p-2 text-sm">
      ${variants.map(v => `<option value="${escapeHtmlAttr(v.name)}" ${v.name === line.selectedVariant ? "selected" : ""}>${escapeHtml(v.name)} (${v.qty})</option>`).join("")}
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
          <td class="p-4 whitespace-nowrap">${renderVariantSelect(item)}</td>
          <td class="p-4 whitespace-nowrap">${money(item.price)}</td>
          <td class="p-4 whitespace-nowrap">
            <div class="flex items-center gap-2">
              <button onclick="changeQty('${item.lineKey}', -1)" class="w-8 h-8 bg-gray-100 rounded-lg">-</button>
              <span class="w-8 text-center font-black">${item.qty}</span>
              <button onclick="changeQty('${item.lineKey}', 1)" class="w-8 h-8 bg-gray-100 rounded-lg">+</button>
            </div>
          </td>
          <td class="p-4 font-black text-emerald-700 whitespace-nowrap">${money(Number(item.price) * item.qty)}</td>
          <td class="p-4 whitespace-nowrap">
            <button onclick="removeFromCart('${item.lineKey}')" class="text-red-500">
              <i data-lucide="trash-2" size="16"></i>
            </button>
          </td>
        </tr>
      `;
    });
  }

  safeLucide();
  calculateTotal();
}

async function changeCartVariant(lineKey, variantName) {
  const line = cart.find(i => i.lineKey === lineKey);
  if (!line) return;

  const products = await getAllProducts();
  const fresh = products.find(p => p.id === line.id);
  if (!fresh) return;

  const available = getAvailableQtyForProduct(variantName, fresh);

  if (available < line.qty) {
    alert("الكمية الحالية أكبر من المتوفر لهذا الصنف");
    return;
  }

  line.variants = safeVariants(fresh.variants);
  line.selectedVariant = variantName;
  line.stock = Number(fresh.stock || 0);
  updateCartLineKey(line);

  const duplicates = new Map();

  cart = cart.reduce((arr, item) => {
    const key = item.lineKey;

    if (duplicates.has(key)) {
      duplicates.get(key).qty += item.qty;
    } else {
      duplicates.set(key, item);
      arr.push(item);
    }

    return arr;
  }, []);

  renderCart();
}

async function changeQty(lineKey, delta) {
  const line = cart.find(i => i.lineKey === lineKey);
  if (!line) return;

  const products = await getAllProducts();
  const fresh = products.find(p => p.id === line.id);
  if (!fresh) return;

  line.variants = safeVariants(fresh.variants);
  line.stock = Number(fresh.stock || 0);

  const available = getAvailableQtyForLine(line, fresh);

  if (line.qty + delta > available) {
    alert("الكمية غير كافية!");
    return;
  }

  line.qty += delta;

  if (line.qty <= 0) {
    removeFromCart(lineKey);
  } else {
    renderCart();
  }
}

function removeFromCart(lineKey) {
  cart = cart.filter(i => i.lineKey !== lineKey);
  renderCart();
}

function calculateDiscountValue(subtotal) {
  const discountType = qs("discountType")?.value || "fixed";
  const raw = parseFloat(qs("posDiscount")?.value) || 0;

  if (discountType === "percent") {
    const clamped = Math.max(0, Math.min(100, raw));
    return subtotal * (clamped / 100);
  }

  return Math.max(0, raw);
}

function calculateTotal() {
  const sub = cart.reduce((s, i) => s + (Number(i.price) * i.qty), 0);
  const discountValue = calculateDiscountValue(sub);
  const total = Math.max(0, sub - discountValue);

  if (qs("subtotal")) qs("subtotal").innerText = money(sub);
  if (qs("discountPreview")) qs("discountPreview").innerText = money(discountValue);
  if (qs("finalTotal")) qs("finalTotal").innerText = money(total);
}

function updateCreateInvoiceButton() {
  const btn = qs("createInvoiceBtn");

  if (btn) {
    btn.innerText = editingInvoiceId ? "حفظ تعديل الفاتورة" : "إنشاء فاتورة";
    btn.disabled = isCheckoutBusy;
  }
}
async function getNextInvoiceNumber() {
  const counter = await idbGet("meta", "invoiceCounter");
  const current = Number(counter?.value || 0);
  const next = current + 1;

  await idbSet("meta", { id: "invoiceCounter", value: next });

  const session = getLocalSession();
  if (isOnline() && session?.appMode === "online") {
    await set(ref(db, `${pathClientCounters()}/invoiceAutoNumber`), next);
  } else if (session?.appMode === "online") {
    addPendingSync({
      type: "set",
      path: `${pathClientCounters()}/invoiceAutoNumber`,
      payload: next
    });
  }

  return next;
}

async function applyStockChange(items, direction) {
  const products = await getAllProducts();

  for (const item of items || []) {
    const p = products.find(x => x.id === item.id);
    if (!p) continue;

    const currentStock = Number(p.stock || 0);
    const variants = safeVariants(p.variants);

    const updatedVariants = variants.map(v => {
      if (item.selectedVariant && v.name === item.selectedVariant) {
        return {
          ...v,
          qty: Math.max(0, Number(v.qty || 0) + direction * Number(item.qty || 0))
        };
      }
      return v;
    });

    const updated = {
      ...p,
      stock: Math.max(0, currentStock + direction * Number(item.qty || 0)),
      variants: updatedVariants,
      updatedAt: new Date().toISOString()
    };

    await saveEntity("products", item.id, updated);
  }
}

async function validateCartAgainstStock() {
  const products = await getAllProducts();

  for (const item of cart) {
    const product = products.find(p => p.id === item.id);
    if (!product) {
      alert(`المنتج غير موجود: ${item.name}`);
      return false;
    }

    const available = getAvailableQtyForProduct(item.selectedVariant, product);
    if (available < item.qty) {
      alert(`المخزون غير كافٍ للمنتج: ${item.name}${item.selectedVariant ? " - " + item.selectedVariant : ""}`);
      return false;
    }
  }

  return true;
}

function buildAccountValue(account) {
  if (!account) return "";
  return [
    account.id || "",
    account.type || "",
    account.owner || "",
    account.number || ""
  ].join("|||");
}

function parseAccountValue(value) {
  const parts = String(value || "").split("|||");

  return {
    transferAccountId: parts[0] || "",
    transferAccountType: parts[1] || "",
    transferAccountName: parts[2] || "",
    transferAccountNumber: parts[3] || ""
  };
}

function buildTransferLine(item) {
  const type = item?.transferAccountType || "";
  const name = item?.transferAccountName || "";
  const number = item?.transferAccountNumber || "";

  const main = [type, name].filter(Boolean).join(" - ");
  if (number) return `${main}${main ? " - " : ""}${number}`;
  return main;
}

async function handlePaymentMethodUi(methodId, accountSelectId) {
  const method = qs(methodId)?.value || "cash";
  const select = qs(accountSelectId);
  if (!select) return;

  if (method === "direct") {
    select.classList.remove("hidden");
    await fillTransferAccountsSelect(accountSelectId);
  } else {
    select.value = "";
    select.classList.add("hidden");
  }
}

async function buildInvoicePayload(id) {
  const settings = await getClientSettings();
  const subtotalValue = cart.reduce((s, i) => s + Number(i.price) * i.qty, 0);
  const discountValue = calculateDiscountValue(subtotalValue);
  const totalValue = Math.max(0, subtotalValue - discountValue);
  const account = parseAccountValue(qs("transferAccountSelect")?.value || "");

  return {
    id: String(id),
    storeId: currentStoreId,
    date: new Date().toISOString(),
    customer: qs("customerName")?.value.trim() || "عميل نقدي",
    phone: qs("customerPhone")?.value.trim() || "",
    payment: qs("paymentMethod")?.value || "cash",
    status: qs("invoiceStatus")?.value || "paid",
    notes: qs("invoiceNotes")?.value.trim() || "",
    discountType: qs("discountType")?.value || "fixed",
    discountRaw: parseFloat(qs("posDiscount")?.value) || 0,

    transferAccountId: account.transferAccountId,
    transferAccountType: account.transferAccountType,
    transferAccountName: account.transferAccountName,
    transferAccountNumber: account.transferAccountNumber,

    currencyName: settings.currencyName,
    currencySymbol: settings.currencySymbol,
    items: cart.map(i => clone(i)),
    subtotal: subtotalValue,
    discount: discountValue,
    total: totalValue,
    totalCost: cart.reduce((s, i) => s + Number(i.cost || 0) * i.qty, 0),
    source: "pos",
    updatedAt: new Date().toISOString()
  };
}

function clearInvoiceEditor() {
  cart = [];
  editingInvoiceId = null;
  renderCart();

  if (qs("customerName")) qs("customerName").value = "";
  if (qs("customerPhone")) qs("customerPhone").value = "";
  if (qs("paymentMethod")) qs("paymentMethod").value = "cash";

  if (qs("transferAccountSelect")) {
    qs("transferAccountSelect").value = "";
    qs("transferAccountSelect").classList.add("hidden");
  }

  if (qs("invoiceStatus")) qs("invoiceStatus").value = "paid";
  if (qs("invoiceNotes")) qs("invoiceNotes").value = "";
  if (qs("discountType")) qs("discountType").value = "fixed";
  if (qs("posDiscount")) qs("posDiscount").value = 0;

  calculateTotal();
  updateCreateInvoiceButton();
  qs("customerSuggestions")?.classList.add("hidden");
}

async function checkout() {
  if (isCheckoutBusy) return;
  if (!cart.length) return;

  isCheckoutBusy = true;
  updateCreateInvoiceButton();

  try {
    if (!(await validateCartAgainstStock())) return;

    if (editingInvoiceId) {
      showLoader("جاري حفظ تعديل الفاتورة...", 20);

      const oldInvoice = await getEntity("invoices", editingInvoiceId);
      if (!oldInvoice) {
        alert("الفاتورة الأصلية غير موجودة");
        return;
      }

      await applyStockChange(oldInvoice.items || [], +1);

      if (!(await validateCartAgainstStock())) {
        await applyStockChange(oldInvoice.items || [], -1);
        return;
      }

      updateLoader("جاري تحديث المخزون...", 55);
      await applyStockChange(cart, -1);

      const newInvoice = await buildInvoicePayload(editingInvoiceId);
      await saveEntity("invoices", editingInvoiceId, newInvoice);

      currentInvoiceId = editingInvoiceId;
      editingInvoiceId = null;
      clearInvoiceEditor();

      showToast("تم حفظ تعديل الفاتورة", "success");
      await viewInvoice(newInvoice.id);
      return;
    }

    showLoader("جاري إنشاء الفاتورة...", 20);

    const invoiceNumber = await getNextInvoiceNumber();
    const invoice = await buildInvoicePayload(invoiceNumber);

    updateLoader("جاري تحديث المخزون...", 55);
    await applyStockChange(cart, -1);

    updateLoader("جاري حفظ الفاتورة...", 80);
    await saveEntity("invoices", invoice.id, invoice);

    currentInvoiceId = invoice.id;
    clearInvoiceEditor();

    showToast("تم إنشاء الفاتورة", "success");
    await viewInvoice(invoice.id);
  } finally {
    isCheckoutBusy = false;
    updateCreateInvoiceButton();
    hideLoader();
  }
}

async function editInvoice(id) {
  showLoader("جاري تحميل الفاتورة للتعديل...", 50);

  try {
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

    await handlePaymentMethodUi("paymentMethod", "transferAccountSelect");

    const accounts = await getTransferAccounts();
    const found = accounts.find(acc => acc.id === inv.transferAccountId);

    if (qs("transferAccountSelect")) {
      qs("transferAccountSelect").value = found ? buildAccountValue(found) : "";
    }

    if (qs("invoiceStatus")) qs("invoiceStatus").value = inv.status || "paid";
    if (qs("invoiceNotes")) qs("invoiceNotes").value = inv.notes || "";
    if (qs("discountType")) qs("discountType").value = inv.discountType || "fixed";
    if (qs("posDiscount")) qs("posDiscount").value = Number(inv.discountRaw || 0);

    renderCart();
    calculateTotal();
    updateCreateInvoiceButton();
    switchTab("pos");
  } finally {
    hideLoader();
  }
}

async function deleteInvoice(id) {
  if (!confirm("حذف الفاتورة؟ سيتم إرجاع الكميات للمخزون.")) return;

  showLoader("جاري حذف الفاتورة...", 40);

  try {
    const inv = await getEntity("invoices", id);
    if (!inv) return;

    if (inv.source === "pos") {
      await applyStockChange(inv.items || [], +1);
    }

    await deleteEntity("invoices", id);

    if (editingInvoiceId === id) {
      clearInvoiceEditor();
    }

    showToast("تم حذف الفاتورة", "success");
    await renderInvoices();
    await renderCustomersPage();
    await renderReports();
  } finally {
    hideLoader();
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

  if (qs("invoiceBarcodeText")) {
    qs("invoiceBarcodeText").innerText = code;
  }
}

async function viewInvoice(id) {
  showLoader("جاري تحميل الفاتورة...", 40);

  try {
    const inv = await getEntity("invoices", id);
    if (!inv) {
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

    if (qs("invPageId")) qs("invPageId").innerText = `#${id}`;
    if (qs("invPageDate")) qs("invPageDate").innerText = new Date(inv.date).toLocaleString("ar-EG");
    if (qs("invPageCustomer")) qs("invPageCustomer").innerText = inv.customer || "-";
    if (qs("invPagePhone")) qs("invPagePhone").innerText = inv.phone || "-";
    if (qs("invPagePayment")) qs("invPagePayment").innerText = paymentLabel(inv.payment || "cash");
    if (qs("invPageTransferAccount")) qs("invPageTransferAccount").innerText = buildTransferLine(inv) || "اختياري";
    if (qs("invPageStatus")) qs("invPageStatus").innerText = statusLabel(inv.status || "paid");

    const itemArea = qs("invPageItems");
    if (itemArea) {
      itemArea.innerHTML = "";

      (inv.items || []).forEach((i, index) => {
        itemArea.innerHTML += `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(i.name)}</td>
            <td>${escapeHtml(i.selectedVariant || "-")}</td>
            <td>${i.qty}</td>
            <td>${Number(i.price).toFixed(2)} ${escapeHtml(inv.currencySymbol || "₪")}</td>
            <td>${(Number(i.price) * i.qty).toFixed(2)} ${escapeHtml(inv.currencySymbol || "₪")}</td>
          </tr>
        `;
      });
    }

    if (qs("invPageSub")) qs("invPageSub").innerText = `${Number(inv.subtotal || 0).toFixed(2)} ${inv.currencySymbol || "₪"}`;
    if (qs("invPageDiscount")) qs("invPageDiscount").innerText = `${Number(inv.discount || 0).toFixed(2)} ${inv.currencySymbol || "₪"}`;
    if (qs("invPageTotal")) qs("invPageTotal").innerText = `${Number(inv.total || 0).toFixed(2)} ${inv.currencySymbol || "₪"}`;

    renderInvoiceBarcode(id);
    safeLucide();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } finally {
    hideLoader();
  }
}

function backFromInvoicePage() {
  qs("invoicePage")?.classList.add("hidden");
  qs("mainApp")?.classList.remove("hidden");
  switchTab("invoices");
}

function printInvoicePage() {
  window.print();
}

async function exportInvoicePage(type) {
  if (!currentInvoiceId) return;

  const inv = await getEntity("invoices", currentInvoiceId);
  if (!inv) return;

  const rows = [];

  (inv.items || []).forEach((item, index) => {
    rows.push([
      index + 1,
      item.name || "-",
      item.selectedVariant || "-",
      Number(item.qty || 0),
      Number(item.price || 0).toFixed(2),
      (Number(item.price || 0) * Number(item.qty || 0)).toFixed(2)
    ]);
  });

  const summary = [
    ["العميل", inv.customer || "-"],
    ["رقم الزبون", inv.phone || "-"],
    ["الدفع", paymentLabel(inv.payment || "cash")],
    ["الجهة", buildTransferLine(inv) || "اختياري"],
    ["الحالة", statusLabel(inv.status || "paid")],
    ["المجموع", money(inv.subtotal || 0)],
    ["الخصم", money(inv.discount || 0)],
    ["الإجمالي", money(inv.total || 0)]
  ];

  if (type === "pdf") {
    exportRowsToPdf({
      title: `فاتورة مبيعات رقم ${inv.id}`,
      columns: ["م", "الصنف", "النوع", "الكمية", "السعر", "الإجمالي"],
      rows,
      fileName: `فاتورة_${inv.id}`,
      summary
    });
    return;
  }

  if (type === "image") {
    exportRowsToImage({
      title: `فاتورة مبيعات رقم ${inv.id}`,
      columns: ["م", "الصنف", "النوع", "الكمية", "السعر", "الإجمالي"],
      rows,
      fileName: `فاتورة_${inv.id}`,
      summary
    });
  }
}

async function shareCurrentInvoice() {
  if (!currentInvoiceId) return;

  const inv = await getEntity("invoices", currentInvoiceId);
  if (!inv) return;

  const message =
`فاتورة رقم #${inv.id}
العميل: ${inv.customer || "-"}
رقم الزبون: ${inv.phone || "-"}
الإجمالي: ${Number(inv.total || 0).toFixed(2)} ${inv.currencySymbol || "₪"}
الدفع: ${paymentLabel(inv.payment || "cash")}
الحالة: ${statusLabel(inv.status || "paid")}
التاريخ: ${new Date(inv.date).toLocaleString("ar-EG")}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `فاتورة #${inv.id}`,
        text: message
      });
      return;
    } catch {}
  }

  const url = inv.phone
    ? `https://wa.me/${normalizePhoneForSend(inv.phone, "auto", "")}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  window.open(url, "_blank");
}

async function renderInvoices() {
  const query = qs("invSearchQuery")?.value.toLowerCase() || "";
  const statusFilter = qs("invoiceStatusFilter")?.value || "all";
  const table = qs("invoicesTable");
  const loading = qs("invoicesLoading");
  const moreWrap = qs("invoicesLoadMoreWrap");

  if (!table) return;

  table.innerHTML = "";
  loading?.classList.remove("hidden");

  const invoices = await getAllInvoices();

  const filtered = invoices
    .filter(inv =>
      inv.storeId === currentStoreId &&
      (
        String(inv.id).includes(query) ||
        (inv.customer || "").toLowerCase().includes(query) ||
        (inv.phone || "").toLowerCase().includes(query)
      ) &&
      (statusFilter === "all" || (inv.status || "paid") === statusFilter)
    )
    .sort((a, b) => Number(b.id) - Number(a.id));

  const visible = filtered.slice(0, invoicesCurrentLimit);

  visible.forEach(inv => {
    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4 font-black">#${inv.id}</td>
        <td class="p-4 text-xs text-gray-400">${new Date(inv.date).toLocaleString("ar-EG")}</td>
        <td class="p-4">
          <button onclick="openCustomerHistory('${escapeJs(inv.customer || "")}','${escapeJs(inv.phone || "")}')" class="text-emerald-700 font-black hover:underline">
            ${escapeHtml(inv.customer || "-")}
          </button>
          ${inv.phone ? `<div class="text-xs text-gray-400 mt-1">${escapeHtml(inv.phone)}</div>` : ""}
        </td>
        <td class="p-4">
          <button onclick="openStatusModal('${inv.id}','${inv.status || "paid"}')" class="status-pill ${statusClass(inv.status || "paid")}">
            ${statusLabel(inv.status || "paid")}
          </button>
        </td>
        <td class="p-4 font-black text-emerald-700">${Number(inv.total || 0).toFixed(2)} ${escapeHtml(inv.currencySymbol || "₪")}</td>
        <td class="p-4 text-xs">${paymentLabel(inv.payment || "cash")}</td>
        <td class="p-4 text-xs">${escapeHtml(buildTransferLine(inv) || "اختياري")}</td>
        <td class="p-4">
          ${inv.notes ? `<button onclick="openNoteModal('${escapeJs(inv.notes)}')" class="text-slate-700 bg-slate-100 px-3 py-1 rounded-lg text-xs font-black">عرض</button>` : `<span class="text-gray-300">-</span>`}
        </td>
        <td class="p-4">
          <div class="flex gap-2 flex-wrap">
            <button onclick="viewInvoice('${inv.id}')" class="text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg text-xs font-black">عرض</button>
            <button onclick="editInvoice('${inv.id}')" class="text-amber-600 bg-amber-50 px-3 py-1 rounded-lg text-xs font-black">تعديل</button>
            <button onclick="deleteInvoice('${inv.id}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-black">حذف</button>
          </div>
        </td>
      </tr>
    `;
  });

  loading?.classList.add("hidden");

  if (moreWrap) {
    moreWrap.classList.toggle("hidden", visible.length >= filtered.length);
  }
}

async function resetInvoicesAndRender() {
  invoicesCurrentLimit = invoicePageSize;
  await renderInvoices();
}

async function loadMoreInvoices() {
  invoicesCurrentLimit += invoicePageSize;
  await renderInvoices();
}
async function openPurchaseModal() {
  if (qs("purchaseModalTitle")) qs("purchaseModalTitle").innerText = "إضافة فاتورة شراء";
  if (qs("editPurchaseId")) qs("editPurchaseId").value = "";
  if (qs("purchaseSupplier")) qs("purchaseSupplier").value = "";
  if (qs("purchaseItemName")) qs("purchaseItemName").value = "";
  if (qs("purchaseQty")) qs("purchaseQty").value = "";
  if (qs("purchaseWholesalePrice")) qs("purchaseWholesalePrice").value = "";
  if (qs("purchaseSalePrice")) qs("purchaseSalePrice").value = "";
  if (qs("purchaseAddToStock")) qs("purchaseAddToStock").checked = true;
  if (qs("purchaseNotes")) qs("purchaseNotes").value = "";
  toggleModal("purchaseModal", true);
}

async function savePurchase() {
  const existingId = qs("editPurchaseId")?.value || "";
  const id = existingId || "pur_" + Date.now();
  const supplier = qs("purchaseSupplier")?.value.trim() || "";
  const itemName = qs("purchaseItemName")?.value.trim() || "";
  const qty = Number(qs("purchaseQty")?.value || 0);
  const wholesalePrice = Number(qs("purchaseWholesalePrice")?.value || 0);
  const salePrice = Number(qs("purchaseSalePrice")?.value || 0);
  const addToStock = qs("purchaseAddToStock")?.checked === true;
  const notes = qs("purchaseNotes")?.value.trim() || "";
  const amount = qty * wholesalePrice;

  if (!supplier || !itemName || qty <= 0 || wholesalePrice <= 0) {
    alert("أدخل اسم المورد والصنف والكمية وسعر الجملة");
    return;
  }

  let oldCreatedAt = null;
  if (existingId) {
    const old = await getEntity("purchases", existingId);
    oldCreatedAt = old?.createdAt || null;
  }

  const purchase = {
    id,
    storeId: currentStoreId,
    supplier,
    itemName,
    qty,
    wholesalePrice,
    salePrice,
    amount,
    addToStock,
    notes,
    createdAt: oldCreatedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  showLoader("جاري حفظ فاتورة الشراء...", 35);

  try {
    await saveEntity("purchases", id, purchase);

    if (addToStock && !existingId) {
      const productId = "p_" + Date.now();
      await saveEntity("products", productId, {
        id: productId,
        storeId: currentStoreId,
        supplier,
        name: itemName,
        code: `PUR-${Date.now()}`,
        stock: qty,
        cost: wholesalePrice,
        price: salePrice || wholesalePrice,
        variants: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    toggleModal("purchaseModal", false);
    showToast("تم حفظ فاتورة الشراء", "success");
    await renderPurchases();
    await resetProductsAndRender();
    await renderReports();
  } finally {
    hideLoader();
  }
}

async function editPurchase(id) {
  const p = await getEntity("purchases", id);
  if (!p) return;

  if (qs("purchaseModalTitle")) qs("purchaseModalTitle").innerText = "تعديل فاتورة شراء";
  if (qs("editPurchaseId")) qs("editPurchaseId").value = p.id || "";
  if (qs("purchaseSupplier")) qs("purchaseSupplier").value = p.supplier || "";
  if (qs("purchaseItemName")) qs("purchaseItemName").value = p.itemName || "";
  if (qs("purchaseQty")) qs("purchaseQty").value = p.qty || "";
  if (qs("purchaseWholesalePrice")) qs("purchaseWholesalePrice").value = p.wholesalePrice || "";
  if (qs("purchaseSalePrice")) qs("purchaseSalePrice").value = p.salePrice || "";
  if (qs("purchaseAddToStock")) qs("purchaseAddToStock").checked = p.addToStock === true;
  if (qs("purchaseNotes")) qs("purchaseNotes").value = p.notes || "";

  toggleModal("purchaseModal", true);
}

async function deletePurchase(id) {
  if (!confirm("حذف فاتورة الشراء؟")) return;
  showLoader("جاري حذف فاتورة الشراء...", 40);

  try {
    await deleteEntity("purchases", id);
    showToast("تم حذف فاتورة الشراء", "success");
    await renderPurchases();
    await renderReports();
  } finally {
    hideLoader();
  }
}

async function renderPurchases() {
  const table = qs("purchasesTable");
  const loading = qs("purchasesLoading");
  if (!table) return;

  table.innerHTML = "";
  loading?.classList.remove("hidden");

  const purchases = await getAllPurchases();

  purchases
    .filter(p => p.storeId === currentStoreId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach(p => {
      table.innerHTML += `
        <tr class="border-b hover:bg-gray-50">
          <td class="p-4 font-black">${escapeHtml(p.supplier || "-")}</td>
          <td class="p-4">${escapeHtml(p.itemName || "-")}</td>
          <td class="p-4">${Number(p.qty || 0)}</td>
          <td class="p-4">${money(p.wholesalePrice || 0)}</td>
          <td class="p-4">${money(p.salePrice || 0)}</td>
          <td class="p-4 text-red-600 font-black">${money(p.amount || 0)}</td>
          <td class="p-4">${p.addToStock ? "نعم" : "لا"}</td>
          <td class="p-4 text-sm text-gray-500">${escapeHtml(p.notes || "-")}</td>
          <td class="p-4 text-xs text-gray-400">${new Date(p.createdAt).toLocaleString("ar-EG")}</td>
          <td class="p-4">
            <div class="flex gap-2 flex-wrap">
              <button onclick="editPurchase('${p.id}')" class="text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg text-xs font-black">تعديل</button>
              <button onclick="deletePurchase('${p.id}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-black">حذف</button>
            </div>
          </td>
        </tr>
      `;
    });

  loading?.classList.add("hidden");
}

async function openMerchantPaymentModal() {
  if (qs("merchantPaymentModalTitle")) qs("merchantPaymentModalTitle").innerText = "إضافة دفعة لتاجر";
  if (qs("editMerchantPaymentId")) qs("editMerchantPaymentId").value = "";
  if (qs("merchantPaymentName")) qs("merchantPaymentName").value = "";
  if (qs("merchantPaymentAmount")) qs("merchantPaymentAmount").value = "";
  if (qs("merchantPaymentMethod")) qs("merchantPaymentMethod").value = "cash";
  if (qs("merchantPaymentAccount")) {
    qs("merchantPaymentAccount").value = "";
    qs("merchantPaymentAccount").classList.add("hidden");
  }
  if (qs("merchantPaymentNotes")) qs("merchantPaymentNotes").value = "";

  await fillTransferAccountsSelect("merchantPaymentAccount");
  handlePaymentMethodUi("merchantPaymentMethod", "merchantPaymentAccount");
  toggleModal("merchantPaymentModal", true);
}

async function saveMerchantPayment() {
  const existingId = qs("editMerchantPaymentId")?.value || "";
  const id = existingId || "mp_" + Date.now();
  const merchantName = qs("merchantPaymentName")?.value.trim() || "";
  const amount = Number(qs("merchantPaymentAmount")?.value || 0);
  const payment = qs("merchantPaymentMethod")?.value || "cash";
  const account = parseAccountValue(qs("merchantPaymentAccount")?.value || "");
  const notes = qs("merchantPaymentNotes")?.value.trim() || "";

  if (!merchantName || amount <= 0) {
    alert("أدخل اسم التاجر والمبلغ");
    return;
  }

  let oldCreatedAt = null;
  if (existingId) {
    const old = await getEntity("merchantPayments", existingId);
    oldCreatedAt = old?.createdAt || null;
  }

  const payload = {
    id,
    storeId: currentStoreId,
    merchantName,
    amount,
    payment,
    transferAccountId: account.transferAccountId,
    transferAccountType: account.transferAccountType,
    transferAccountName: account.transferAccountName,
    transferAccountNumber: account.transferAccountNumber,
    notes,
    createdAt: oldCreatedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  showLoader("جاري حفظ دفعة التاجر...", 40);

  try {
    await saveEntity("merchantPayments", id, payload);
    toggleModal("merchantPaymentModal", false);
    showToast("تم حفظ دفعة التاجر", "success");
    await renderMerchantPayments();
    await renderProfitReport();
  } finally {
    hideLoader();
  }
}

async function editMerchantPayment(id) {
  const item = await getEntity("merchantPayments", id);
  if (!item) return;

  if (qs("merchantPaymentModalTitle")) qs("merchantPaymentModalTitle").innerText = "تعديل دفعة تاجر";
  if (qs("editMerchantPaymentId")) qs("editMerchantPaymentId").value = item.id || "";
  if (qs("merchantPaymentName")) qs("merchantPaymentName").value = item.merchantName || "";
  if (qs("merchantPaymentAmount")) qs("merchantPaymentAmount").value = item.amount || "";
  if (qs("merchantPaymentMethod")) qs("merchantPaymentMethod").value = item.payment || "cash";

  await handlePaymentMethodUi("merchantPaymentMethod", "merchantPaymentAccount");

  const accounts = await getTransferAccounts();
  const found = accounts.find(acc => acc.id === item.transferAccountId);
  if (qs("merchantPaymentAccount")) qs("merchantPaymentAccount").value = found ? buildAccountValue(found) : "";

  if (qs("merchantPaymentNotes")) qs("merchantPaymentNotes").value = item.notes || "";
  toggleModal("merchantPaymentModal", true);
}

async function deleteMerchantPayment(id) {
  if (!confirm("حذف دفعة التاجر؟")) return;
  showLoader("جاري حذف دفعة التاجر...", 40);

  try {
    await deleteEntity("merchantPayments", id);
    showToast("تم حذف الدفعة", "success");
    await renderMerchantPayments();
    await renderProfitReport();
  } finally {
    hideLoader();
  }
}

async function renderMerchantPayments() {
  const table = qs("merchantPaymentsTable");
  if (!table) return;

  table.innerHTML = "";

  const items = await getAllMerchantPayments();

  items
    .filter(i => i.storeId === currentStoreId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach(i => {
      table.innerHTML += `
        <tr class="border-b hover:bg-gray-50">
          <td class="p-4 font-black">${escapeHtml(i.merchantName || "-")}</td>
          <td class="p-4 text-red-600 font-black">${money(i.amount || 0)}</td>
          <td class="p-4">${paymentLabel(i.payment || "cash")}</td>
          <td class="p-4 text-xs">${escapeHtml(buildTransferLine(i) || "اختياري")}</td>
          <td class="p-4 text-sm text-gray-500">${escapeHtml(i.notes || "-")}</td>
          <td class="p-4 text-xs text-gray-400">${new Date(i.createdAt).toLocaleString("ar-EG")}</td>
          <td class="p-4">
            <div class="flex gap-2 flex-wrap">
              <button onclick="editMerchantPayment('${i.id}')" class="text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg text-xs font-black">تعديل</button>
              <button onclick="deleteMerchantPayment('${i.id}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-black">حذف</button>
            </div>
          </td>
        </tr>
      `;
    });
}

async function openExpenseModal() {
  if (qs("expenseModalTitle")) qs("expenseModalTitle").innerText = "إضافة مصروف";
  if (qs("editExpenseId")) qs("editExpenseId").value = "";
  if (qs("expenseName")) qs("expenseName").value = "";
  if (qs("expenseAmount")) qs("expenseAmount").value = "";
  if (qs("expensePaymentMethod")) qs("expensePaymentMethod").value = "cash";
  if (qs("expenseAccount")) {
    qs("expenseAccount").value = "";
    qs("expenseAccount").classList.add("hidden");
  }
  if (qs("expenseNotes")) qs("expenseNotes").value = "";

  await fillTransferAccountsSelect("expenseAccount");
  handlePaymentMethodUi("expensePaymentMethod", "expenseAccount");
  toggleModal("expenseModal", true);
}

async function saveExpense() {
  const existingId = qs("editExpenseId")?.value || "";
  const id = existingId || "exp_" + Date.now();
  const name = qs("expenseName")?.value.trim() || "";
  const amount = Number(qs("expenseAmount")?.value || 0);
  const payment = qs("expensePaymentMethod")?.value || "cash";
  const account = parseAccountValue(qs("expenseAccount")?.value || "");
  const notes = qs("expenseNotes")?.value.trim() || "";

  if (!name || amount <= 0) {
    alert("أدخل اسم المصروف والمبلغ");
    return;
  }

  const payload = {
    id,
    storeId: currentStoreId,
    name,
    amount,
    payment,
    transferAccountId: account.transferAccountId,
    transferAccountType: account.transferAccountType,
    transferAccountName: account.transferAccountName,
    transferAccountNumber: account.transferAccountNumber,
    notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  showLoader("جاري حفظ المصروف...", 40);

  try {
    await saveEntity("expenses", id, payload);
    toggleModal("expenseModal", false);
    showToast("تم حفظ المصروف", "success");
    await renderExpenses();
    await renderProfitReport();
  } finally {
    hideLoader();
  }
}

async function editExpense(id) {
  const item = await getEntity("expenses", id);
  if (!item) return;

  if (qs("expenseModalTitle")) qs("expenseModalTitle").innerText = "تعديل مصروف";
  if (qs("editExpenseId")) qs("editExpenseId").value = item.id || "";
  if (qs("expenseName")) qs("expenseName").value = item.name || "";
  if (qs("expenseAmount")) qs("expenseAmount").value = item.amount || "";
  if (qs("expensePaymentMethod")) qs("expensePaymentMethod").value = item.payment || "cash";

  await handlePaymentMethodUi("expensePaymentMethod", "expenseAccount");

  const accounts = await getTransferAccounts();
  const found = accounts.find(acc => acc.id === item.transferAccountId);
  if (qs("expenseAccount")) qs("expenseAccount").value = found ? buildAccountValue(found) : "";

  if (qs("expenseNotes")) qs("expenseNotes").value = item.notes || "";
  toggleModal("expenseModal", true);
}

async function deleteExpense(id) {
  if (!confirm("حذف المصروف؟")) return;
  showLoader("جاري حذف المصروف...", 40);

  try {
    await deleteEntity("expenses", id);
    showToast("تم حذف المصروف", "success");
    await renderExpenses();
    await renderProfitReport();
  } finally {
    hideLoader();
  }
}

async function renderExpenses() {
  const table = qs("expensesTable");
  if (!table) return;

  table.innerHTML = "";

  const items = await getAllExpenses();

  items
    .filter(i => i.storeId === currentStoreId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach(i => {
      table.innerHTML += `
        <tr class="border-b hover:bg-gray-50">
          <td class="p-4 font-black">${escapeHtml(i.name || "-")}</td>
          <td class="p-4 text-red-600 font-black">${money(i.amount || 0)}</td>
          <td class="p-4">${paymentLabel(i.payment || "cash")}</td>
          <td class="p-4 text-xs">${escapeHtml(buildTransferLine(i) || "اختياري")}</td>
          <td class="p-4 text-sm text-gray-500">${escapeHtml(i.notes || "-")}</td>
          <td class="p-4 text-xs text-gray-400">${new Date(i.createdAt).toLocaleString("ar-EG")}</td>
          <td class="p-4">
            <div class="flex gap-2 flex-wrap">
              <button onclick="editExpense('${i.id}')" class="text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg text-xs font-black">تعديل</button>
              <button onclick="deleteExpense('${i.id}')" class="text-red-600 bg-red-50 px-3 py-1 rounded-lg text-xs font-black">حذف</button>
            </div>
          </td>
        </tr>
      `;
    });
}

function rankRearCamera(devices) {
  if (!devices?.length) return null;
  const rearKeywords = ["back", "rear", "environment", "خلف", "خلفية"];
  const exactRear = devices.find(d => rearKeywords.some(k => (d.label || "").toLowerCase().includes(k)));
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

  try {
    if (!scanner) scanner = new Html5Qrcode("reader");
    const devices = await Html5Qrcode.getCameras();
    const chosen = rankRearCamera(devices || []);

    if (!chosen?.id) {
      alert("لم يتم العثور على كاميرا");
      await closeScanner();
      return;
    }

    await scanner.start(
      { deviceId: { exact: chosen.id } },
      { fps: 10, qrbox: { width: 250, height: 170 } },
      async decodedText => {
        if (scannerLock) return;
        scannerLock = true;
        indicateScannerSuccess();
        await handleScanResult(decodedText);
        setTimeout(closeScanner, 220);
      },
      () => {}
    );
  } catch (err) {
    console.error(err);
    alert("تعذر تشغيل الكاميرا");
    await closeScanner();
  }
}

async function toggleScannerTorch() {
  if (!scannerTrack || !torchSupported) return;
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
    else alert("لم يتم العثور على منتج بهذا الكود");
    return;
  }

  if (scanTarget === "product-code") {
    if (qs("prodCode")) qs("prodCode").value = scanned;
    showToast("تم التقاط كود المنتج", "success");
    return;
  }

  const idMatch = scanned.match(/INV-(\d+)/i) || scanned.match(/^(\d+)$/);
  if (idMatch) await viewInvoice(idMatch[1]);
  else alert("تعذر قراءة رقم الفاتورة من الكود");
}

async function closeScanner() {
  try {
    if (scanner && scanner.isScanning) await scanner.stop();
  } catch {}

  scannerTrack = null;
  scannerTorchOn = false;
  torchSupported = false;
  scannerLock = false;

  qs("scannerModal")?.classList.add("hidden");
}

async function scanBarcodeFromImage(event, target) {
  const file = event.target.files?.[0];
  if (!file) return;

  scanTarget = target;

  try {
    showLoader("جاري قراءة الصورة...", 40);
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
  } catch (err) {
    console.error(err);
    alert("تعذر قراءة الباركود من الصورة.");
  } finally {
    event.target.value = "";
    hideLoader();
  }
}

function inRangeByFilter(dateString, filter, specificDate = "") {
  if (!dateString) return false;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const week = new Date(today);
  week.setDate(week.getDate() - 6);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const year = new Date(now.getFullYear(), 0, 1);
  const nextYear = new Date(now.getFullYear() + 1, 0, 1);

  if (filter === "all") return true;
  if (filter === "specific") {
    if (!specificDate) return false;
    const s = new Date(specificDate + "T00:00:00");
    const e = new Date(specificDate + "T23:59:59.999");
    return d >= s && d <= e;
  }
  if (filter === "today" || filter === "day") return d >= today && d < tomorrow;
  if (filter === "week") return d >= week && d < tomorrow;
  if (filter === "month") return d >= month && d < nextMonth;
  if (filter === "year") return d >= year && d < nextYear;

  return true;
}

async function renderReports() {
  const filter = qs("reportFilter")?.value || "today";
  const invoices = await getAllInvoices();
  const purchases = await getAllPurchases();
  const expenses = await getAllExpenses();
  const merchantPayments = await getAllMerchantPayments();

  let sales = 0, costs = 0, count = 0, purchaseTotal = 0, expenseTotal = 0, merchantPaidTotal = 0;

  invoices.forEach(inv => {
    if (inv.storeId !== currentStoreId || !inRangeByFilter(inv.date, filter)) return;
    sales += Number(inv.total || 0);
    costs += Number(inv.totalCost || 0);
    count++;
  });

  purchases.forEach(p => {
    if (p.storeId !== currentStoreId || !inRangeByFilter(p.createdAt, filter)) return;
    purchaseTotal += Number(p.amount || 0);
  });

  expenses.forEach(e => {
    if (e.storeId !== currentStoreId || !inRangeByFilter(e.createdAt, filter)) return;
    expenseTotal += Number(e.amount || 0);
  });

  merchantPayments.forEach(m => {
    if (m.storeId !== currentStoreId || !inRangeByFilter(m.createdAt, filter)) return;
    merchantPaidTotal += Number(m.amount || 0);
  });

  if (qs("repWholesaleSales")) qs("repWholesaleSales").innerText = money(costs);
  if (qs("repTotalSales")) qs("repTotalSales").innerText = money(sales);
  if (qs("repTotalProfit")) qs("repTotalProfit").innerText = money(sales - costs - expenseTotal - merchantPaidTotal);
  if (qs("repPurchases")) qs("repPurchases").innerText = money(purchaseTotal);
  if (qs("repCount")) qs("repCount").innerText = count;
}

async function renderSalesReport() { await renderReports(); }
async function renderStockReport() {}
async function renderProfitReport() { await renderReports(); }
async function renderCustomersPage() {}

async function getTransferAccounts() {
  const row = await idbGet("meta", "transferAccounts");
  return Array.isArray(row?.items) ? row.items : [];
}

async function setTransferAccounts(items) {
  await idbSet("meta", { id: "transferAccounts", items: Array.isArray(items) ? items : [] });
}

async function addTransferAccount() {
  const type = qs("accountTypeInput")?.value.trim();
  const owner = qs("accountOwnerInput")?.value.trim();
  const number = qs("accountNumberInput")?.value.trim() || "";

  if (!type || !owner) {
    alert("يرجى إدخال اسم الجهة واسم صاحب الحساب");
    return;
  }

  const accounts = await getTransferAccounts();
  accounts.push({ id: "acc_" + Date.now(), type, owner, number });
  await setTransferAccounts(accounts);

  if (qs("accountTypeInput")) qs("accountTypeInput").value = "";
  if (qs("accountOwnerInput")) qs("accountOwnerInput").value = "";
  if (qs("accountNumberInput")) qs("accountNumberInput").value = "";

  await renderTransferAccountsList();
  await fillAllAccountSelects();
}

async function deleteTransferAccount(accountId) {
  const accounts = await getTransferAccounts();
  await setTransferAccounts(accounts.filter(acc => acc.id !== accountId));
  await renderTransferAccountsList();
  await fillAllAccountSelects();
}

async function renderTransferAccountsList() {
  const container = qs("accountsList");
  if (!container) return;

  const accounts = await getTransferAccounts();
  container.innerHTML = accounts.length ? "" : `<div class="text-sm text-gray-500 text-center bg-gray-50 rounded-xl p-4">لا توجد جهات دفع مضافة</div>`;

  accounts.forEach(account => {
    container.innerHTML += `
      <div class="flex items-center justify-between gap-3 bg-white border rounded-2xl p-4">
        <div>
          <div class="font-black">${escapeHtml(account.type)} - ${escapeHtml(account.owner)}</div>
          <div class="text-xs text-gray-400">${escapeHtml(account.number || "بدون رقم")}</div>
        </div>
        <button onclick="deleteTransferAccount('${account.id}')" class="bg-red-50 text-red-600 px-3 py-2 rounded-xl font-black text-xs">حذف</button>
      </div>
    `;
  });
}

async function fillTransferAccountsSelect(selectId = "transferAccountSelect") {
  const select = qs(selectId);
  if (!select) return;

  const accounts = await getTransferAccounts();
  select.innerHTML = `<option value="">اختياري</option>`;

  accounts.forEach(account => {
    const option = document.createElement("option");
    option.value = buildAccountValue(account);
    option.textContent = `${account.type} - ${account.owner}${account.number ? " - " + account.number : ""}`;
    select.appendChild(option);
  });
}

async function fillAllAccountSelects() {
  await fillTransferAccountsSelect("transferAccountSelect");
  await fillTransferAccountsSelect("transferAccountSelectManual");
  await fillTransferAccountsSelect("merchantPaymentAccount");
  await fillTransferAccountsSelect("expenseAccount");
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
  if (qs("paymentInfoInput")) qs("paymentInfoInput").value = settings.paymentInfo || "";

  await renderTransferAccountsList();
  await fillAllAccountSelects();
  updateLicenseUIFromSession();
}

async function saveSettings() {
  showLoader("جاري حفظ الإعدادات...", 35);

  try {
    const settingsPayload = {
      id: "settings",
      currencyName: qs("currencyNameInput")?.value.trim() || "شيكل",
      currencySymbol: qs("currencySymbolInput")?.value.trim() || "₪",
      paymentInfo: qs("paymentInfoInput")?.value.trim() || "",
      appMode: getLocalSession()?.appMode || "online",
      updatedAt: new Date().toISOString()
    };

    const store = await getEntity("stores", currentStoreId);
    if (store) {
      await saveEntity("stores", currentStoreId, {
        ...store,
        name: qs("setStoreName")?.value.trim() || "المحل الرئيسي",
        logo: qs("setStoreLogo")?.value.trim() || "",
        updatedAt: new Date().toISOString()
      });
    }

    await idbSet("meta", settingsPayload);
    setLocalSettings(settingsPayload);
    await loadCurrentStore();
    await updateCurrencyUI();
    showToast("تم حفظ الإعدادات بنجاح", "success");
  } finally {
    hideLoader();
  }
}

async function logoutUser() {
  detachRealtimeListeners();
  clearLocalSession();
  localStorage.removeItem("activeStoreId");
  if (licenseWatcher) clearInterval(licenseWatcher);
  showLogin("تم تسجيل الخروج بنجاح");
}

function toggleModal(id, show) {
  qs(id)?.classList.toggle("hidden", !show);
  document.body.style.overflow = show ? "hidden" : "";
  safeLucide();
}

async function openManualInvoiceModal() {
  await fillTransferAccountsSelect("transferAccountSelectManual");
  toggleModal("manualInvoiceModal", true);
}

async function saveManualInvoice() {
  alert("دالة الفاتورة اليدوية جاهزة للربط لاحقاً");
}

function openNoteModal(note) {
  if (qs("noteModalContent")) qs("noteModalContent").innerText = note || "-";
  toggleModal("noteModal", true);
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

  const inv = await getEntity("invoices", id);
  if (!inv) return;

  await saveEntity("invoices", id, { ...inv, status, updatedAt: new Date().toISOString() });
  toggleModal("statusModal", false);
  await renderInvoices();
}

async function openCustomerHistory(name, phone = "") {
  alert(`سجل العميل: ${name} ${phone}`);
}

async function createAggregateInvoiceForCustomer() {}
async function sendDebtMessageToCustomer() {}
function normalizePhoneForSend(phone) { return String(phone || "").replace(/[^\d]/g, ""); }

async function exportBulkInvoices(type) { alert("تصدير الفواتير سيضاف في النسخة التالية"); }
async function exportBulkPurchases(type) { alert("تصدير المشتريات سيضاف في النسخة التالية"); }
async function exportInvoicesExcel() {}
async function exportPurchasesExcel() {}
async function exportSalesReportExcel() {}
async function exportStockReportExcel() {}
async function exportProfitReportExcel() {}
async function exportSummaryReportExcel() {}
async function exportCustomersExcel() {}
async function exportExpensesExcel() {}
async function exportMerchantPaymentsExcel() {}

function exportRowsToPdf() {}
function exportRowsToImage() {}

async function downloadBackupFile() {
  const data = {
    backupVersion: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    stores: await getAllStores(),
    products: await getAllProducts(),
    invoices: await getAllInvoices(),
    purchases: await getAllPurchases(),
    expenses: await getAllExpenses(),
    merchantPayments: await getAllMerchantPayments(),
    settings: await getClientSettings(),
    transferAccounts: await getTransferAccounts()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveCloudBackup() {
  if (!navigator.onLine || getLocalSession()?.appMode !== "online") {
    alert("هذه العملية تحتاج إنترنت ونسخة أونلاين");
    return;
  }

  await set(ref(db, `${pathClientBackups()}/backup_${Date.now()}`), {
    createdAt: new Date().toISOString(),
    stores: await getAllStores(),
    products: await getAllProducts(),
    invoices: await getAllInvoices()
  });

  showToast("تم حفظ النسخة الاحتياطية", "success");
}

async function restoreBackupFromFile(event) {
  alert("الاستعادة ستضاف في النسخة التالية");
  event.target.value = "";
}

async function downloadOfflinePackage() { await downloadBackupFile(); }
async function importOfflinePackage(event) { await restoreBackupFromFile(event); }

async function uploadOfflineDataToCloud(showToastAfter = true) {
  const session = getLocalSession();
  if (!session || session.appMode !== "online" || !navigator.onLine) return;

  for (const x of await getAllStores()) await set(ref(db, `${pathClientStores()}/${x.id}`), x);
  for (const x of await getAllProducts()) await set(ref(db, `${pathClientProducts()}/${x.id}`), x);
  for (const x of await getAllInvoices()) await set(ref(db, `${pathClientInvoices()}/${x.id}`), x);
  for (const x of await getAllPurchases()) await set(ref(db, `${pathClientPurchases()}/${x.id}`), x);
  for (const x of await getAllExpenses()) await set(ref(db, `${pathClientExpenses()}/${x.id}`), x);
  for (const x of await getAllMerchantPayments()) await set(ref(db, `${pathClientMerchantPayments()}/${x.id}`), x);

  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
  updateConnectionUI();
  if (showToastAfter) showToast("تمت المزامنة", "success");
}
function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_OFFLINE_DB_NAME, LOCAL_OFFLINE_DB_VERSION);

    req.onupgradeneeded = () => {
      const dbx = req.result;
      ["stores", "products", "invoices", "purchases", "expenses", "merchantPayments", "meta"].forEach(name => {
        if (!dbx.objectStoreNames.contains(name)) dbx.createObjectStore(name, { keyPath: "id" });
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

async function loadCurrentStore() {
  const store = await idbGet("stores", currentStoreId);
  if (!store) return;

  if (qs("sideStoreName")) qs("sideStoreName").innerText = store.name || "اسم المحل";
  setImageOrHide(qs("sideLogo"), store.logo);
  if (qs("invPageStoreName")) qs("invPageStoreName").innerText = store.name || "المحل";
  setImageOrHide(qs("invPageLogo"), store.logo);
}

async function syncCloudToOffline() {
  const session = getLocalSession();
  if (!navigator.onLine || session?.appMode !== "online" || !baseClientPath()) return;

  const [storesSnap, productsSnap, invoicesSnap, purchasesSnap, expensesSnap, merchantsSnap] = await Promise.all([
    get(ref(db, pathClientStores())),
    get(ref(db, pathClientProducts())),
    get(ref(db, pathClientInvoices())),
    get(ref(db, pathClientPurchases())),
    get(ref(db, pathClientExpenses())),
    get(ref(db, pathClientMerchantPayments()))
  ]);

  await idbClear("stores");
  await idbClear("products");
  await idbClear("invoices");
  await idbClear("purchases");
  await idbClear("expenses");
  await idbClear("merchantPayments");

  for (const x of storesSnap.exists() ? Object.values(storesSnap.val() || {}) : []) await idbSet("stores", x);
  for (const x of productsSnap.exists() ? Object.values(productsSnap.val() || {}) : []) await idbSet("products", x);
  for (const x of invoicesSnap.exists() ? Object.values(invoicesSnap.val() || {}) : []) await idbSet("invoices", x);
  for (const x of purchasesSnap.exists() ? Object.values(purchasesSnap.val() || {}) : []) await idbSet("purchases", x);
  for (const x of expensesSnap.exists() ? Object.values(expensesSnap.val() || {}) : []) await idbSet("expenses", x);
  for (const x of merchantsSnap.exists() ? Object.values(merchantsSnap.val() || {}) : []) await idbSet("merchantPayments", x);
}

async function getEntity(kind, id) { return await idbGet(kind, id); }

async function saveEntity(kind, id, payload) {
  await idbSet(kind, payload);

  const session = getLocalSession();
  const pathMap = {
    stores: pathClientStores(),
    products: pathClientProducts(),
    invoices: pathClientInvoices(),
    purchases: pathClientPurchases(),
    expenses: pathClientExpenses(),
    merchantPayments: pathClientMerchantPayments()
  };

  if (!pathMap[kind]) return;

  if (isOnline() && session?.appMode === "online") {
    await set(ref(db, `${pathMap[kind]}/${id}`), payload);
  } else if (session?.appMode === "online") {
    addPendingSync({ type: "set", path: `${pathMap[kind]}/${id}`, payload });
  }
}

async function deleteEntity(kind, id) {
  await idbDelete(kind, id);
}

async function getAllStores() { return await idbGetAll("stores"); }
async function getAllProducts() { return await idbGetAll("products"); }
async function getAllInvoices() { return await idbGetAll("invoices"); }
async function getAllPurchases() { return await idbGetAll("purchases"); }
async function getAllExpenses() { return await idbGetAll("expenses"); }
async function getAllMerchantPayments() { return await idbGetAll("merchantPayments"); }

function escapeHtmlAttr(str) {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#039;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function escapeHtml(str) {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function escapeJs(str) {
  return String(str ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "");
}

Object.assign(window, {
  handleLicenseLogin, goToLoginFromExpired, switchTab, createNewStore, switchStore,
  openNewProduct, saveProduct, showProductBarcode, resetProductsAndRender, loadMoreProducts, editProduct, deleteProduct,
  searchPosProducts, changeCartVariant, changeQty, removeFromCart, calculateTotal, checkout,
  editInvoice, deleteInvoice, viewInvoice, backFromInvoicePage, printInvoicePage, exportInvoicePage, resetInvoicesAndRender, loadMoreInvoices,
  openPurchaseModal, savePurchase, editPurchase, deletePurchase,
  openMerchantPaymentModal, saveMerchantPayment, editMerchantPayment, deleteMerchantPayment,
  openExpenseModal, saveExpense, editExpense, deleteExpense,
  openScanner, toggleScannerTorch, closeScanner, scanBarcodeFromImage,
  saveSettings, logoutUser, toggleModal, addVariantRow, syncStockWithVariants, previewStoreLogo,
  downloadBackupFile, saveCloudBackup, restoreBackupFromFile,
  openStatusModal, openCustomerHistory, openNoteModal, openManualInvoiceModal, saveManualInvoice,
  createAggregateInvoiceForCustomer, sendDebtMessageToCustomer,
  renderReports, renderSalesReport, renderStockReport, renderProfitReport, renderCustomersPage,
  exportBulkInvoices, exportBulkPurchases, exportInvoicesExcel, exportPurchasesExcel,
  exportSalesReportExcel, exportStockReportExcel, exportProfitReportExcel, exportSummaryReportExcel,
  exportCustomersExcel, exportExpensesExcel, exportMerchantPaymentsExcel,
  addTransferAccount, deleteTransferAccount, syncPendingAndCloud, uploadOfflineDataToCloud
});

updateConnectionUI();
updatePendingSyncBadge();
safeLucide();
