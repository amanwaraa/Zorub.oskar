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

document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();
  bindBaseEvents();
  bindOnlineOfflineEvents();
  await initApp();
});

function qs(id) {
  return document.getElementById(id);
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

  qs("paymentMethod")?.addEventListener("change", () => {
    handlePaymentMethodUi("paymentMethod", "transferAccountSelect");
  });

  qs("manualPaymentMethod")?.addEventListener("change", () => {
    handlePaymentMethodUi("manualPaymentMethod", "transferAccountSelectManual");
  });

  qs("merchantPaymentMethod")?.addEventListener("change", () => {
    handlePaymentMethodUi("merchantPaymentMethod", "merchantPaymentAccount");
  });

  qs("expensePaymentMethod")?.addEventListener("change", () => {
    handlePaymentMethodUi("expensePaymentMethod", "expenseAccount");
  });

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
  qs("bulkExportInvoicesExcelBtn")?.addEventListener("click", () => exportInvoicesExcel());

  qs("bulkPrintPurchasesBtn")?.addEventListener("click", () => exportBulkPurchases("print"));
  qs("bulkExportPurchasesPdfBtn")?.addEventListener("click", () => exportBulkPurchases("pdf"));
  qs("bulkExportPurchasesImagesBtn")?.addEventListener("click", () => exportBulkPurchases("image"));
  qs("bulkExportPurchasesExcelBtn")?.addEventListener("click", () => exportPurchasesExcel());

  qs("renderSalesReportBtn")?.addEventListener("click", renderSalesReport);
  qs("printSalesReportBtn")?.addEventListener("click", () => exportTableArea("salesReportPrintableArea", "print", "تقرير_المبيعات"));
  qs("exportSalesReportPdfBtn")?.addEventListener("click", () => exportTableArea("salesReportPrintableArea", "pdf", "تقرير_المبيعات"));
  qs("exportSalesReportImageBtn")?.addEventListener("click", () => exportTableArea("salesReportPrintableArea", "image", "تقرير_المبيعات"));
  qs("exportSalesReportExcelBtn")?.addEventListener("click", () => exportSalesReportExcel());

  qs("renderStockReportBtn")?.addEventListener("click", renderStockReport);
  qs("printStockReportBtn")?.addEventListener("click", () => exportTableArea("stockReportPrintableArea", "print", "تقرير_البضاعة_الناقصة"));
  qs("exportStockReportPdfBtn")?.addEventListener("click", () => exportTableArea("stockReportPrintableArea", "pdf", "تقرير_البضاعة_الناقصة"));
  qs("exportStockReportImageBtn")?.addEventListener("click", () => exportTableArea("stockReportPrintableArea", "image", "تقرير_البضاعة_الناقصة"));
  qs("exportStockReportExcelBtn")?.addEventListener("click", () => exportStockReportExcel());

  qs("renderProfitReportBtn")?.addEventListener("click", renderProfitReport);
  qs("printProfitReportBtn")?.addEventListener("click", () => exportTableArea("profitReportPrintableArea", "print", "تقرير_المرابح_والأرصدة"));
  qs("exportProfitReportPdfBtn")?.addEventListener("click", () => exportTableArea("profitReportPrintableArea", "pdf", "تقرير_المرابح_والأرصدة"));
  qs("exportProfitReportImageBtn")?.addEventListener("click", () => exportTableArea("profitReportPrintableArea", "image", "تقرير_المرابح_والأرصدة"));
  qs("exportProfitReportExcelBtn")?.addEventListener("click", () => exportProfitReportExcel());

  qs("printSummaryReportBtn")?.addEventListener("click", () => exportTableArea("summaryReportPrintableArea", "print", "التقرير_المختصر"));
  qs("exportSummaryReportPdfBtn")?.addEventListener("click", () => exportTableArea("summaryReportPrintableArea", "pdf", "التقرير_المختصر"));
  qs("exportSummaryReportImageBtn")?.addEventListener("click", () => exportTableArea("summaryReportPrintableArea", "image", "التقرير_المختصر"));
  qs("exportSummaryReportExcelBtn")?.addEventListener("click", () => exportSummaryReportExcel());

  qs("printCustomersBtn")?.addEventListener("click", () => exportTableArea("customersPrintableArea", "print", "تقرير_العملاء"));
  qs("exportCustomersPdfBtn")?.addEventListener("click", () => exportTableArea("customersPrintableArea", "pdf", "تقرير_العملاء"));
  qs("exportCustomersImageBtn")?.addEventListener("click", () => exportTableArea("customersPrintableArea", "image", "تقرير_العملاء"));
  qs("exportCustomersExcelBtn")?.addEventListener("click", () => exportCustomersExcel());

  qs("printExpensesBtn")?.addEventListener("click", () => exportTableArea("expensesPrintableArea", "print", "تقرير_المصروفات"));
  qs("exportExpensesPdfBtn")?.addEventListener("click", () => exportTableArea("expensesPrintableArea", "pdf", "تقرير_المصروفات"));
  qs("exportExpensesImageBtn")?.addEventListener("click", () => exportTableArea("expensesPrintableArea", "image", "تقرير_المصروفات"));
  qs("exportExpensesExcelBtn")?.addEventListener("click", () => exportExpensesExcel());

  qs("printMerchantPaymentsBtn")?.addEventListener("click", () => exportTableArea("merchantPaymentsPrintableArea", "print", "تقرير_دفعات_التجار"));
  qs("exportMerchantPaymentsPdfBtn")?.addEventListener("click", () => exportTableArea("merchantPaymentsPrintableArea", "pdf", "تقرير_دفعات_التجار"));
  qs("exportMerchantPaymentsImageBtn")?.addEventListener("click", () => exportTableArea("merchantPaymentsPrintableArea", "image", "تقرير_دفعات_التجار"));
  qs("exportMerchantPaymentsExcelBtn")?.addEventListener("click", () => exportMerchantPaymentsExcel());

  qs("addAccountBtn")?.addEventListener("click", addTransferAccount);

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

  qs("loadMoreProductsBtn")?.addEventListener("click", loadMoreProducts);
  qs("loadMoreInvoicesBtn")?.addEventListener("click", loadMoreInvoices);
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
  if (!toast) return;

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
  lucide.createIcons();
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
  if (settings) {
    return {
      currencyName: settings.currencyName || "شيكل",
      currencySymbol: settings.currencySymbol || "₪",
      appMode: getLocalSession()?.appMode || settings.appMode || "online",
      paymentInfo: settings.paymentInfo || ""
    };
  }

  const fallback = getLocalSettings();
  fallback.appMode = getLocalSession()?.appMode || fallback.appMode || "online";
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
  if (!el) return;

  if (navigator.onLine) {
    el.className = "connection-pill connection-online";
    el.innerHTML = `<i data-lucide="wifi" size="16"></i> متصل`;
  } else {
    el.className = "connection-pill connection-offline";
    el.innerHTML = `<i data-lucide="wifi-off" size="16"></i> غير متصل`;
  }

  const last = localStorage.getItem(LAST_SYNC_KEY);
  if (qs("syncStatusText")) {
    qs("syncStatusText").innerText = last ? `آخر مزامنة: ${formatDateTime(last)}` : "آخر مزامنة: -";
  }

  lucide.createIcons();
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
      updateLoader(`جاري رفع البيانات... ${i + 1}/${queue.length}`, Math.min(90, Math.round(((i + 1) / Math.max(queue.length, 1)) * 90)));

      if (item.type === "set") {
        await set(ref(db, item.path), item.payload);
      }

      if (item.type === "remove") {
        await remove(ref(db, item.path));
      }
    }

    setPendingQueue([]);

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
  if (!settings) {
    await idbSet("meta", {
      id: "settings",
      currencyName: "شيكل",
      currencySymbol: "₪",
      appMode: getLocalSession()?.appMode || "online",
      paymentInfo: ""
    });
  } else if (settings.appMode !== getLocalSession()?.appMode) {
    await idbSet("meta", {
      ...settings,
      appMode: getLocalSession()?.appMode || "online"
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
  const allowOfflineFallback = lic.allowOfflineFallback === true;

  const newSession = {
    ...session,
    durationType: lic.durationType || session.durationType,
    durationValue: lic.durationValue || session.durationValue,
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
    for (const item of items) await idbSet("stores", item);
    await loadCurrentStore();
    if (!qs("tab-stores")?.classList.contains("hidden")) renderStoresList();
  });

  onValue(productsListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await idbClear("products");
    for (const item of items) await idbSet("products", item);
    if (!qs("tab-products")?.classList.contains("hidden")) renderProducts();
    const q = qs("posSearch")?.value.trim();
    if (q) searchPosProducts();
  });

  onValue(invoicesListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await idbClear("invoices");
    for (const item of items) await idbSet("invoices", item);
    if (!qs("tab-invoices")?.classList.contains("hidden")) renderInvoices();
    if (!qs("tab-reports")?.classList.contains("hidden")) renderReports();
    if (!qs("tab-customers")?.classList.contains("hidden")) renderCustomersPage();
  });

  onValue(purchasesListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await idbClear("purchases");
    for (const item of items) await idbSet("purchases", item);
    if (!qs("tab-purchases")?.classList.contains("hidden")) renderPurchases();
    if (!qs("tab-reports")?.classList.contains("hidden")) renderReports();
  });

  onValue(expensesListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await idbClear("expenses");
    for (const item of items) await idbSet("expenses", item);
    if (!qs("tab-expenses")?.classList.contains("hidden")) renderExpenses();
  });

  onValue(merchantPaymentsListenerRef, async snap => {
    const items = snap.exists() ? Object.values(snap.val() || {}) : [];
    await idbClear("merchantPayments");
    for (const item of items) await idbSet("merchantPayments", item);
    if (!qs("tab-merchant-payments")?.classList.contains("hidden")) renderMerchantPayments();
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
    if (session.appMode === "online") await syncCloudToOffline();
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
  } catch (err) {
    console.error(err);
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

  lucide.createIcons();
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
          ${active
            ? '<span class="text-sm bg-emerald-100 text-emerald-700 px-3 py-2 rounded-lg font-black">الحالي</span>'
            : `<button onclick="switchStore('${store.id}')" class="text-sm bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg font-black">دخول</button>`
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
    name: row.querySelector(".variant-name").value.trim(),
    qty: Number(row.querySelector(".variant-qty").value || 0)
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
    <input type="number" class="variant-qty w-full p-3 bg-gray-50 border rounded-xl text-center" placeholder="الكمية" value="${qty}">
    <button type="button" class="bg-red-50 text-red-600 rounded-xl h-full font-bold">✕</button>
  `;

  row.querySelector("button").onclick = () => {
    row.remove();
    syncStockWithVariants();
  };

  row.querySelector(".variant-qty").addEventListener("input", syncStockWithVariants);
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
  if (!table || !loading || !moreWrap) return;

  const search = qs("inventorySearch")?.value.toLowerCase() || "";

  table.innerHTML = "";
  loading.classList.remove("hidden");

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

  loading.classList.add("hidden");
  moreWrap.classList.toggle("hidden", visible.length >= filtered.length);
  lucide.createIcons();
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
  if (!variants.length) return `<span class="text-gray-400">-</span>`;

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
          <td class="p-4 whitespace-nowrap"><button onclick="removeFromCart('${item.lineKey}')" class="text-red-500"><i data-lucide="trash-2" size="16"></i></button></td>
        </tr>
      `;
    });
  }

  lucide.createIcons();
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
  if (line.qty <= 0) removeFromCart(lineKey);
  else renderCart();
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
  if (qs("createInvoiceBtn")) {
    qs("createInvoiceBtn").innerText = editingInvoiceId ? "حفظ تعديل الفاتورة" : "إنشاء فاتورة";
    qs("createInvoiceBtn").disabled = isCheckoutBusy;
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
          qty: Math.max(0, Number(v.qty || 0) + (direction * Number(item.qty || 0)))
        };
      }
      return v;
    });

    const updated = {
      ...p,
      stock: Math.max(0, currentStock + (direction * Number(item.qty || 0))),
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
  const subtotalValue = cart.reduce((s, i) => s + (Number(i.price) * i.qty), 0);
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
    totalCost: cart.reduce((s, i) => s + (Number(i.cost) * i.qty), 0),
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
    lucide.createIcons();
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

  if (inv.phone) {
    const url = `https://wa.me/${normalizePhoneForSend(inv.phone, "auto", "")}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  } else {
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }
}

async function renderInvoices() {
  const query = qs("invSearchQuery")?.value.toLowerCase() || "";
  const statusFilter = qs("invoiceStatusFilter")?.value || "all";
  const table = qs("invoicesTable");
  const loading = qs("invoicesLoading");
  const moreWrap = qs("invoicesLoadMoreWrap");

  if (!table || !loading || !moreWrap) return;

  table.innerHTML = "";
  loading.classList.remove("hidden");

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

  loading.classList.add("hidden");
  moreWrap.classList.toggle("hidden", visible.length >= filtered.length);
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
  const id = existingId || ("pur_" + Date.now());

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
      const product = {
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
      };

      await saveEntity("products", productId, product);
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
  const id = existingId || ("mp_" + Date.now());

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

  const range = qs("merchantPaymentsReportRange")?.value || "all";
  const specificDate = qs("merchantPaymentsSpecificDate")?.value || "";

  table.innerHTML = "";

  const items = await getAllMerchantPayments();

  items
    .filter(i => i.storeId === currentStoreId && inRangeByFilter(i.createdAt, range, specificDate))
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
  const id = existingId || ("exp_" + Date.now());

  const name = qs("expenseName")?.value.trim() || "";
  const amount = Number(qs("expenseAmount")?.value || 0);
  const payment = qs("expensePaymentMethod")?.value || "cash";
  const account = parseAccountValue(qs("expenseAccount")?.value || "");
  const notes = qs("expenseNotes")?.value.trim() || "";

  if (!name || amount <= 0) {
    alert("أدخل اسم المصروف والمبلغ");
    return;
  }

  let oldCreatedAt = null;
  if (existingId) {
    const old = await getEntity("expenses", existingId);
    oldCreatedAt = old?.createdAt || null;
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
    createdAt: oldCreatedAt || new Date().toISOString(),
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

  const range = qs("expensesReportRange")?.value || "all";
  const specificDate = qs("expensesSpecificDate")?.value || "";

  table.innerHTML = "";

  const items = await getAllExpenses();

  items
    .filter(i => i.storeId === currentStoreId && inRangeByFilter(i.createdAt, range, specificDate))
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
    alert("تعذر الحصول على صلاحية الكاميرا.");
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

    if (found) {
      addToCart(found);
    } else {
      alert("لم يتم العثور على منتج بهذا الكود");
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
async function renderReports() {
  const filter = qs("reportFilter")?.value || "today";

  const invoices = await getAllInvoices();
  const purchases = await getAllPurchases();
  const expenses = await getAllExpenses();
  const merchantPayments = await getAllMerchantPayments();

  let sales = 0;
  let costs = 0;
  let count = 0;
  let purchaseTotal = 0;
  let expenseTotal = 0;
  let merchantPaidTotal = 0;

  invoices.forEach(inv => {
    if (inv.storeId !== currentStoreId) return;
    if (!inRangeByFilter(inv.date, filter)) return;

    sales += Number(inv.total || 0);
    costs += Number(inv.totalCost || 0);
    count++;
  });

  purchases.forEach(p => {
    if (p.storeId !== currentStoreId) return;
    if (!inRangeByFilter(p.createdAt, filter)) return;

    purchaseTotal += Number(p.amount || 0);
  });

  expenses.forEach(e => {
    if (e.storeId !== currentStoreId) return;
    if (!inRangeByFilter(e.createdAt, filter)) return;

    expenseTotal += Number(e.amount || 0);
  });

  merchantPayments.forEach(m => {
    if (m.storeId !== currentStoreId) return;
    if (!inRangeByFilter(m.createdAt, filter)) return;

    merchantPaidTotal += Number(m.amount || 0);
  });

  if (qs("repWholesaleSales")) qs("repWholesaleSales").innerText = money(costs);
  if (qs("repTotalSales")) qs("repTotalSales").innerText = money(sales);
  if (qs("repTotalProfit")) qs("repTotalProfit").innerText = money(sales - costs - expenseTotal - merchantPaidTotal);
  if (qs("repPurchases")) qs("repPurchases").innerText = money(purchaseTotal);
  if (qs("repCount")) qs("repCount").innerText = count;
}

function inRangeByFilter(dateString, filter, specificDate = "") {
  if (!dateString) return false;

  const d = new Date(dateString);
  if (isNaN(d.getTime())) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startOfNextYear = new Date(now.getFullYear() + 1, 0, 1);

  if (filter === "all") return true;

  if (filter === "specific") {
    if (!specificDate) return false;
    const s = new Date(specificDate + "T00:00:00");
    const e = new Date(specificDate + "T23:59:59.999");
    return d >= s && d <= e;
  }

  if (filter === "today" || filter === "day") {
    return d >= startOfToday && d < startOfTomorrow;
  }

  if (filter === "week") {
    return d >= startOfWeek && d < startOfTomorrow;
  }

  if (filter === "month") {
    return d >= startOfMonth && d < startOfNextMonth;
  }

  if (filter === "year") {
    return d >= startOfYear && d < startOfNextYear;
  }

  return true;
}

async function getSalesReportRows() {
  const range = qs("salesReportRange")?.value || "day";
  const specificDate = qs("salesReportSpecificDate")?.value || "";
  const paymentFilter = qs("salesReportPaymentFilter")?.value || "all";
  const invoices = await getAllInvoices();

  const rows = [];

  invoices
    .filter(inv =>
      inv.storeId === currentStoreId &&
      inRangeByFilter(inv.date, range, specificDate) &&
      (paymentFilter === "all" || inv.payment === paymentFilter)
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach(inv => {
      (inv.items || []).forEach(item => {
        rows.push({
          date: inv.date,
          customer: inv.customer || "-",
          phone: inv.phone || "-",
          itemName: item.name || "-",
          qty: Number(item.qty || 0),
          price: Number(item.price || 0),
          payment: inv.payment || "cash",
          account: buildTransferLine(inv) || "اختياري",
          total: Number(item.qty || 0) * Number(item.price || 0),
          invoiceId: inv.id
        });
      });
    });

  return rows;
}

async function renderSalesReport() {
  const table = qs("salesReportTable");
  if (!table) return;

  table.innerHTML = "";

  const rows = await getSalesReportRows();
  let total = 0;
  let qty = 0;
  const invoiceIds = new Set();
  const paymentCount = {};

  rows.forEach(row => {
    total += Number(row.total || 0);
    qty += Number(row.qty || 0);
    invoiceIds.add(row.invoiceId);
    paymentCount[row.payment] = (paymentCount[row.payment] || 0) + 1;

    table.innerHTML += `
      <tr class="border-b">
        <td class="p-4 border">${new Date(row.date).toLocaleString("ar-EG")}</td>
        <td class="p-4 border">${escapeHtml(row.customer)}</td>
        <td class="p-4 border">${escapeHtml(row.phone)}</td>
        <td class="p-4 border">${escapeHtml(row.itemName)}</td>
        <td class="p-4 border">${row.qty}</td>
        <td class="p-4 border">${money(row.price)}</td>
        <td class="p-4 border">${paymentLabel(row.payment)}</td>
        <td class="p-4 border">${escapeHtml(row.account)}</td>
        <td class="p-4 border font-black text-emerald-700">${money(row.total)}</td>
      </tr>
    `;
  });

  const topPayment = Object.entries(paymentCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  if (qs("salesReportTotal")) qs("salesReportTotal").innerText = money(total);
  if (qs("salesReportQty")) qs("salesReportQty").innerText = qty;
  if (qs("salesReportInvoicesCount")) qs("salesReportInvoicesCount").innerText = invoiceIds.size;
  if (qs("salesReportTopPayment")) qs("salesReportTopPayment").innerText = topPayment === "-" ? "-" : paymentLabel(topPayment);
  if (qs("salesReportPeriodText")) qs("salesReportPeriodText").innerText = qs("salesReportRange")?.selectedOptions?.[0]?.textContent || "-";
}

async function renderStockReport() {
  const table = qs("stockReportTable");
  if (!table) return;

  const limit = Number(qs("lowStockLimit")?.value || 5);
  const products = await getAllProducts();

  table.innerHTML = "";

  products
    .filter(p => p.storeId === currentStoreId && Number(p.stock || 0) <= limit)
    .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0))
    .forEach(p => {
      table.innerHTML += `
        <tr class="border-b">
          <td class="p-4">${escapeHtml(p.code || "-")}</td>
          <td class="p-4">${escapeHtml(p.supplier || "-")}</td>
          <td class="p-4 font-black">${escapeHtml(p.name || "-")}</td>
          <td class="p-4 text-red-600 font-black">${Number(p.stock || 0)}</td>
          <td class="p-4">${money(p.cost || 0)}</td>
          <td class="p-4">${money(p.price || 0)}</td>
          <td class="p-4">ناقص</td>
        </tr>
      `;
    });
}

async function renderProfitReport() {
  const range = qs("profitReportRange")?.value || "month";
  const specificDate = qs("profitReportSpecificDate")?.value || "";

  const invoices = await getAllInvoices();
  const expenses = await getAllExpenses();
  const merchantPayments = await getAllMerchantPayments();

  let totalSales = 0;
  let totalCost = 0;
  let expenseTotal = 0;
  let merchantTotal = 0;
  const balances = new Map();

  invoices.forEach(inv => {
    if (inv.storeId !== currentStoreId) return;
    if (!inRangeByFilter(inv.date, range, specificDate)) return;

    totalSales += Number(inv.total || 0);
    totalCost += Number(inv.totalCost || 0);

    const key = inv.payment === "cash" ? "cash" : (inv.transferAccountId || "direct_unknown");
    const old = balances.get(key) || {
      payment: inv.payment || "cash",
      type: inv.transferAccountType || "",
      owner: inv.transferAccountName || "",
      number: inv.transferAccountNumber || "",
      amount: 0
    };

    old.amount += Number(inv.total || 0);
    balances.set(key, old);
  });

  expenses.forEach(e => {
    if (e.storeId !== currentStoreId) return;
    if (!inRangeByFilter(e.createdAt, range, specificDate)) return;

    expenseTotal += Number(e.amount || 0);

    const key = e.payment === "cash" ? "cash" : (e.transferAccountId || "direct_unknown");
    const old = balances.get(key) || {
      payment: e.payment || "cash",
      type: e.transferAccountType || "",
      owner: e.transferAccountName || "",
      number: e.transferAccountNumber || "",
      amount: 0
    };

    old.amount -= Number(e.amount || 0);
    balances.set(key, old);
  });

  merchantPayments.forEach(m => {
    if (m.storeId !== currentStoreId) return;
    if (!inRangeByFilter(m.createdAt, range, specificDate)) return;

    merchantTotal += Number(m.amount || 0);

    const key = m.payment === "cash" ? "cash" : (m.transferAccountId || "direct_unknown");
    const old = balances.get(key) || {
      payment: m.payment || "cash",
      type: m.transferAccountType || "",
      owner: m.transferAccountName || "",
      number: m.transferAccountNumber || "",
      amount: 0
    };

    old.amount -= Number(m.amount || 0);
    balances.set(key, old);
  });

  if (qs("profitTotalSales")) qs("profitTotalSales").innerText = money(totalSales);
  if (qs("profitTotalCost")) qs("profitTotalCost").innerText = money(totalCost);
  if (qs("profitExpenses")) qs("profitExpenses").innerText = money(expenseTotal);
  if (qs("profitMerchantPayments")) qs("profitMerchantPayments").innerText = money(merchantTotal);
  if (qs("profitNet")) qs("profitNet").innerText = money(totalSales - totalCost - expenseTotal - merchantTotal);

  const table = qs("balancesReportTable");
  if (table) {
    table.innerHTML = "";

    [...balances.values()].forEach(b => {
      table.innerHTML += `
        <tr class="border-b">
          <td class="p-4">${paymentLabel(b.payment)}</td>
          <td class="p-4">${escapeHtml(b.payment === "cash" ? "كاش" : `${b.type || "-"} - ${b.owner || "-"}`)}</td>
          <td class="p-4">${escapeHtml(b.number || "-")}</td>
          <td class="p-4 font-black ${b.amount >= 0 ? "text-emerald-700" : "text-red-600"}">${money(b.amount)}</td>
        </tr>
      `;
    });
  }
}

async function renderCustomersPage() {
  const table = qs("customersTable");
  if (!table) return;

  const search = qs("customersSearch")?.value.trim().toLowerCase() || "";
  const range = qs("customersReportRange")?.value || "all";
  const specificDate = qs("customersSpecificDate")?.value || "";
  const invoices = await getAllInvoices();

  const map = new Map();

  invoices
    .filter(inv => inv.storeId === currentStoreId && inRangeByFilter(inv.date, range, specificDate))
    .forEach(inv => {
      const name = String(inv.customer || "عميل نقدي").trim();
      const phone = String(inv.phone || "").trim();
      const key = `${name}__${phone}`;

      const old = map.get(key) || {
        name,
        phone,
        count: 0,
        paid: 0,
        unpaid: 0,
        total: 0,
        lastDate: inv.date
      };

      const amount = Number(inv.total || 0);
      old.count++;
      old.total += amount;

      if (inv.status === "paid") old.paid += amount;
      else old.unpaid += amount;

      if (new Date(inv.date) > new Date(old.lastDate)) old.lastDate = inv.date;

      map.set(key, old);
    });

  let customers = [...map.values()];

  if (search) {
    customers = customers.filter(c =>
      c.name.toLowerCase().includes(search) ||
      c.phone.toLowerCase().includes(search)
    );
  }

  customers.sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));

  table.innerHTML = "";

  let paidTotal = 0;
  let unpaidTotal = 0;
  let grandTotal = 0;

  customers.forEach(c => {
    paidTotal += c.paid;
    unpaidTotal += c.unpaid;
    grandTotal += c.total;

    table.innerHTML += `
      <tr class="border-b hover:bg-gray-50">
        <td class="p-4 font-black">${escapeHtml(c.name || "-")}</td>
        <td class="p-4">${escapeHtml(c.phone || "-")}</td>
        <td class="p-4">${c.count}</td>
        <td class="p-4 text-green-700 font-black">${money(c.paid)}</td>
        <td class="p-4 text-red-600 font-black">${money(c.unpaid)}</td>
        <td class="p-4 text-emerald-700 font-black">${money(c.total)}</td>
        <td class="p-4 text-xs text-gray-400">${new Date(c.lastDate).toLocaleString("ar-EG")}</td>
        <td class="p-4">
          <button onclick="openCustomerHistory('${escapeJs(c.name)}','${escapeJs(c.phone)}')" class="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-xs font-black">عرض السجل</button>
        </td>
      </tr>
    `;
  });

  if (qs("customersCount")) qs("customersCount").innerText = customers.length;
  if (qs("customersPaidTotal")) qs("customersPaidTotal").innerText = money(paidTotal);
  if (qs("customersUnpaidTotal")) qs("customersUnpaidTotal").innerText = money(unpaidTotal);
  if (qs("customersGrandTotal")) qs("customersGrandTotal").innerText = money(grandTotal);
}

async function getCustomerSuggestions(query) {
  const invoices = await getAllInvoices();
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];

  const map = new Map();

  invoices
    .filter(inv => inv.storeId === currentStoreId)
    .forEach(inv => {
      const name = String(inv.customer || "").trim();
      const phone = String(inv.phone || "").trim();
      const key = `${name}__${phone}`;
      if (!name && !phone) return;

      if ((name.toLowerCase().includes(q)) || (phone.toLowerCase().includes(q))) {
        if (!map.has(key)) {
          map.set(key, { name, phone, lastDate: inv.date });
        } else if (new Date(inv.date) > new Date(map.get(key).lastDate)) {
          map.set(key, { name, phone, lastDate: inv.date });
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
      <div class="text-xs text-emerald-700">اختيار</div>
    `;
    div.onclick = () => {
      if (qs("customerName")) qs("customerName").value = item.name || "";
      if (qs("customerPhone")) qs("customerPhone").value = item.phone || "";
      box.classList.add("hidden");
    };
    box.appendChild(div);
  });

  box.classList.remove("hidden");
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
      <div class="text-xs text-emerald-700">اختيار</div>
    `;
    div.onclick = () => {
      if (qs("manualCustomerName")) qs("manualCustomerName").value = item.name || "";
      if (qs("manualCustomerPhone")) qs("manualCustomerPhone").value = item.phone || "";
      box.classList.add("hidden");
    };
    box.appendChild(div);
  });

  box.classList.remove("hidden");
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

  showLoader("جاري تحديث الحالة...", 40);

  try {
    const inv = await getEntity("invoices", id);
    if (!inv) return;

    await saveEntity("invoices", id, {
      ...inv,
      status,
      updatedAt: new Date().toISOString()
    });

    toggleModal("statusModal", false);
    await renderInvoices();
    await renderCustomersPage();

    if (qs("invoicePage") && !qs("invoicePage").classList.contains("hidden") && String(currentInvoiceId) === String(id)) {
      await viewInvoice(id);
    }

    showToast("تم تحديث الحالة", "success");
  } finally {
    hideLoader();
  }
}

async function openCustomerHistory(name, phone = "") {
  currentCustomerHistoryName = name;
  currentCustomerHistoryPhone = phone;

  const range = qs("customerHistoryRange")?.value || "all";
  const invoices = await getAllInvoices();

  const filtered = invoices
    .filter(inv =>
      inv.storeId === currentStoreId &&
      String(inv.customer || "").trim() === String(name || "").trim() &&
      String(inv.phone || "").trim() === String(phone || "").trim() &&
      inRangeByFilter(inv.date, range)
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  let paid = 0;
  let unpaid = 0;
  let total = 0;

  filtered.forEach(inv => {
    const t = Number(inv.total || 0);
    total += t;
    if (inv.status === "paid") paid += t;
    else unpaid += t;
  });

  if (qs("customerHistoryTitle")) qs("customerHistoryTitle").innerText = `${name || "بدون اسم"}${phone ? " - " + phone : ""}`;
  if (qs("custPaidTotal")) qs("custPaidTotal").innerText = money(paid);
  if (qs("custUnpaidTotal")) qs("custUnpaidTotal").innerText = money(unpaid);
  if (qs("custGrandTotal")) qs("custGrandTotal").innerText = money(total);

  const tbody = qs("customerHistoryTable");
  if (tbody) {
    tbody.innerHTML = "";

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400">لا يوجد سجل لهذا العميل ضمن الفترة المحددة</td></tr>`;
    } else {
      filtered.forEach(inv => {
        tbody.innerHTML += `
          <tr class="border-t">
            <td class="p-4 font-black">#${inv.id}</td>
            <td class="p-4 text-sm">${new Date(inv.date).toLocaleString("ar-EG")}</td>
            <td class="p-4"><span class="status-pill ${statusClass(inv.status || "paid")}">${statusLabel(inv.status || "paid")}</span></td>
            <td class="p-4 font-black">${Number(inv.total || 0).toFixed(2)} ${escapeHtml(inv.currencySymbol || "₪")}</td>
            <td class="p-4 text-xs">${escapeHtml(buildTransferLine(inv) || "اختياري")}</td>
            <td class="p-4">
              ${inv.notes ? `<button onclick="openNoteModal('${escapeJs(inv.notes)}')" class="text-slate-700 bg-slate-100 px-3 py-1 rounded-lg text-xs font-black">عرض</button>` : `<span class="text-gray-300">-</span>`}
            </td>
          </tr>
        `;
      });
    }
  }

  toggleModal("customerHistoryModal", true);
}
async function createAggregateInvoiceForCustomer() {
  if (!currentCustomerHistoryName) return;

  const statusFilter = qs("customerInvoiceAggregateStatus")?.value || "all";
  const rangeFilter = qs("customerInvoiceAggregateRange")?.value || "all";

  const invoices = await getAllInvoices();

  const customerInvoices = invoices.filter(inv =>
    inv.storeId === currentStoreId &&
    String(inv.customer || "").trim() === String(currentCustomerHistoryName).trim() &&
    String(inv.phone || "").trim() === String(currentCustomerHistoryPhone || "").trim() &&
    (statusFilter === "all" || inv.status === statusFilter) &&
    inRangeByFilter(inv.date, rangeFilter)
  );

  if (!customerInvoices.length) {
    alert("لا يوجد فواتير مطابقة لهذا العميل");
    return;
  }

  const total = customerInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
  const settings = await getClientSettings();
  const nextId = await getNextInvoiceNumber();

  const invoice = {
    id: String(nextId),
    storeId: currentStoreId,
    date: new Date().toISOString(),
    customer: currentCustomerHistoryName,
    phone: currentCustomerHistoryPhone || "",
    payment: "cash",
    status: "unpaid",
    notes: `فاتورة مجمعة للعميل - عدد الفواتير: ${customerInvoices.length}`,
    discountType: "fixed",
    discountRaw: 0,
    transferAccountId: "",
    transferAccountType: "",
    transferAccountName: "",
    transferAccountNumber: "",
    currencyName: settings.currencyName,
    currencySymbol: settings.currencySymbol,
    items: customerInvoices.map(inv => ({
      lineKey: `agg_${inv.id}`,
      id: `agg_${inv.id}`,
      name: `دفعة من الفاتورة #${inv.id}`,
      code: `AGG-${inv.id}`,
      supplier: "",
      price: Number(inv.total || 0),
      cost: 0,
      stock: 0,
      variants: [],
      selectedVariant: "",
      qty: 1
    })),
    subtotal: total,
    discount: 0,
    total,
    totalCost: 0,
    source: "manual",
    updatedAt: new Date().toISOString()
  };

  await saveEntity("invoices", invoice.id, invoice);
  toggleModal("customerHistoryModal", false);
  showToast("تم إنشاء فاتورة مجمعة", "success");
  await renderInvoices();
  await viewInvoice(invoice.id);
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

async function sendDebtMessageToCustomer() {
  if (!currentCustomerHistoryName) return;

  const invoices = await getAllInvoices();
  const debts = invoices.filter(inv =>
    inv.storeId === currentStoreId &&
    String(inv.customer || "").trim() === String(currentCustomerHistoryName).trim() &&
    String(inv.phone || "").trim() === String(currentCustomerHistoryPhone || "").trim() &&
    inv.status === "unpaid"
  );

  const total = debts.reduce((s, i) => s + Number(i.total || 0), 0);
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
عليك دفعات غير مكتملة بعدد ${debts.length}
إجمالي المطلوب: ${money(total, false, settings)}
${settings.paymentInfo ? "\n\n" + settings.paymentInfo : ""}
يرجى التواصل لإتمام السداد.`;

  if (app === "sms") {
    window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
    return;
  }

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
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
  await fillTransferAccountsSelect("transferAccountSelect");
  await fillTransferAccountsSelect("transferAccountSelectManual");
  await fillTransferAccountsSelect("merchantPaymentAccount");
  await fillTransferAccountsSelect("expenseAccount");

  updateLicenseUIFromSession();

  if (qs("setCurrentSystemMode")) {
    qs("setCurrentSystemMode").innerText = settings.appMode === "offline" ? "أوفلاين" : "أونلاين";
  }

  if (qs("offlineSyncWrap")) {
    qs("offlineSyncWrap").classList.toggle("hidden", getLocalSession()?.appMode !== "online");
  }
}

async function saveSettings() {
  showLoader("جاري حفظ الإعدادات...", 35);

  try {
    const currencyName = qs("currencyNameInput")?.value.trim() || "شيكل";
    const currencySymbol = qs("currencySymbolInput")?.value.trim() || "₪";
    const paymentInfo = qs("paymentInfoInput")?.value.trim() || "";
    const session = getLocalSession();

    const store = await getEntity("stores", currentStoreId);
    if (store) {
      await saveEntity("stores", currentStoreId, {
        ...store,
        name: qs("setStoreName")?.value.trim() || "المحل الرئيسي",
        logo: qs("setStoreLogo")?.value.trim() || "",
        updatedAt: new Date().toISOString()
      });
    }

    const settingsPayload = {
      id: "settings",
      currencyName,
      currencySymbol,
      paymentInfo,
      appMode: session?.appMode || "online",
      updatedAt: new Date().toISOString()
    };

    await idbSet("meta", settingsPayload);
    setLocalSettings(settingsPayload);

    if (isOnline() && session?.appMode === "online") {
      await update(ref(db, pathClientSettings()), {
        currencyName,
        currencySymbol,
        paymentInfo,
        appMode: session?.appMode || "online",
        updatedAt: new Date().toISOString()
      });
    } else if (session?.appMode === "online") {
      addPendingSync({
        type: "set",
        path: pathClientSettings(),
        payload: {
          currencyName,
          currencySymbol,
          paymentInfo,
          appMode: session?.appMode || "online",
          updatedAt: new Date().toISOString()
        }
      });
    }

    await loadCurrentStore();
    await updateCurrencyUI();
    renderCart();
    await resetInvoicesAndRender();
    await renderPurchases();
    await renderExpenses();
    await renderMerchantPayments();
    await renderReports();
    updateLicenseUIFromSession();

    showToast("تم حفظ الإعدادات بنجاح", "success");
  } finally {
    hideLoader();
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
          lastLogoutAt: new Date().toISOString()
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

function toggleModal(id, show) {
  qs(id)?.classList.toggle("hidden", !show);

  if (show) {
    document.body.style.overflow = "hidden";
  } else {
    const anyOpen = [...document.querySelectorAll(".modal-wrap")].some(m => !m.classList.contains("hidden"));
    if (!anyOpen) document.body.style.overflow = "";
  }

  lucide.createIcons();
}

async function getTransferAccounts() {
  const row = await idbGet("meta", "transferAccounts");
  return Array.isArray(row?.items) ? row.items : [];
}

async function setTransferAccounts(items) {
  await idbSet("meta", { id: "transferAccounts", items: Array.isArray(items) ? items : [] });

  const session = getLocalSession();
  if (session?.appMode === "online") {
    const payload = { items: Array.isArray(items) ? items : [] };
    if (isOnline()) {
      await set(ref(db, `${pathClientSettings()}/transferAccounts`), payload);
    } else {
      addPendingSync({
        type: "set",
        path: `${pathClientSettings()}/transferAccounts`,
        payload
      });
    }
  }
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
  const exists = accounts.some(acc => acc.type === type && acc.owner === owner && acc.number === number);

  if (exists) {
    alert("هذه الجهة موجودة مسبقاً");
    return;
  }

  accounts.push({
    id: "acc_" + Date.now(),
    type,
    owner,
    number
  });

  await setTransferAccounts(accounts);

  if (qs("accountTypeInput")) qs("accountTypeInput").value = "";
  if (qs("accountOwnerInput")) qs("accountOwnerInput").value = "";
  if (qs("accountNumberInput")) qs("accountNumberInput").value = "";

  await renderTransferAccountsList();
  await fillAllAccountSelects();
  showToast("تمت إضافة الجهة", "success");
}

async function deleteTransferAccount(accountId) {
  const accounts = await getTransferAccounts();
  const filtered = accounts.filter(acc => acc.id !== accountId);

  await setTransferAccounts(filtered);
  await renderTransferAccountsList();
  await fillAllAccountSelects();

  showToast("تم حذف الجهة", "success");
}

async function renderTransferAccountsList() {
  const container = qs("accountsList");
  if (!container) return;

  const accounts = await getTransferAccounts();
  container.innerHTML = "";

  if (!accounts.length) {
    container.innerHTML = `<div class="text-sm text-gray-500 text-center bg-gray-50 rounded-xl p-4">لا توجد جهات دفع مضافة</div>`;
    return;
  }

  accounts.forEach(account => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-3 bg-white border rounded-2xl p-4";
    row.innerHTML = `
      <div class="min-w-0">
        <div class="inline-flex bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-black mb-2">${escapeHtml(account.type)}</div>
        <div class="font-black text-gray-800 line-clamp-1">${escapeHtml(account.owner)}</div>
        <div class="text-xs text-gray-400">${escapeHtml(account.number || "بدون رقم")}</div>
      </div>
      <button class="bg-red-50 text-red-600 px-3 py-2 rounded-xl font-black text-xs">حذف</button>
    `;
    row.querySelector("button").onclick = () => deleteTransferAccount(account.id);
    container.appendChild(row);
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

async function openManualInvoiceModal() {
  await fillTransferAccountsSelect("transferAccountSelectManual");

  if (qs("editManualInvoiceId")) qs("editManualInvoiceId").value = "";
  if (qs("manualCustomerName")) qs("manualCustomerName").value = "";
  if (qs("manualCustomerPhone")) qs("manualCustomerPhone").value = "";
  if (qs("manualInvoiceAmount")) qs("manualInvoiceAmount").value = "";
  if (qs("manualInvoiceStatus")) qs("manualInvoiceStatus").value = "unpaid";
  if (qs("manualPaymentMethod")) qs("manualPaymentMethod").value = "cash";
  if (qs("transferAccountSelectManual")) {
    qs("transferAccountSelectManual").value = "";
    qs("transferAccountSelectManual").classList.add("hidden");
  }
  if (qs("manualInvoiceNotes")) qs("manualInvoiceNotes").value = "";

  qs("manualCustomerSuggestions")?.classList.add("hidden");
  toggleModal("manualInvoiceModal", true);
}

async function saveManualInvoice() {
  const editId = qs("editManualInvoiceId")?.value || "";
  const customer = qs("manualCustomerName")?.value.trim() || "";
  const phone = qs("manualCustomerPhone")?.value.trim() || "";
  const amount = parseFloat(qs("manualInvoiceAmount")?.value) || 0;
  const status = qs("manualInvoiceStatus")?.value || "unpaid";
  const payment = qs("manualPaymentMethod")?.value || "cash";
  const notes = qs("manualInvoiceNotes")?.value.trim() || "";
  const account = parseAccountValue(qs("transferAccountSelectManual")?.value || "");

  if (!customer || amount <= 0) {
    alert("يرجى إدخال الاسم والمبلغ");
    return;
  }

  const settings = await getClientSettings();
  const invoiceId = editId || String(await getNextInvoiceNumber());

  const payload = {
    id: invoiceId,
    storeId: currentStoreId,
    date: new Date().toISOString(),
    customer,
    phone,
    payment,
    status,
    notes,
    discountType: "fixed",
    discountRaw: 0,
    transferAccountId: account.transferAccountId,
    transferAccountType: account.transferAccountType,
    transferAccountName: account.transferAccountName,
    transferAccountNumber: account.transferAccountNumber,
    currencyName: settings.currencyName,
    currencySymbol: settings.currencySymbol,
    items: [{
      lineKey: `manual_${invoiceId}`,
      id: `manual_${invoiceId}`,
      name: "فاتورة يدوية",
      code: `MAN-${invoiceId}`,
      supplier: "",
      price: amount,
      cost: 0,
      stock: 0,
      variants: [],
      selectedVariant: "",
      qty: 1
    }],
    subtotal: amount,
    discount: 0,
    total: amount,
    totalCost: 0,
    source: "manual",
    updatedAt: new Date().toISOString()
  };

  showLoader("جاري حفظ الفاتورة اليدوية...", 50);

  try {
    await saveEntity("invoices", invoiceId, payload);
    toggleModal("manualInvoiceModal", false);
    showToast(editId ? "تم تعديل الفاتورة اليدوية" : "تم إنشاء الفاتورة اليدوية", "success");
    await renderInvoices();
    await renderCustomersPage();
  } finally {
    hideLoader();
  }
}

function getSelectedRangeForBulk(prefix) {
  return {
    range: qs(prefix)?.value || "all",
    specificDate: qs(prefix.replace("Range", "SpecificDate"))?.value || ""
  };
}

async function buildInvoiceExportRows(range, specificDate = "") {
  const invoices = await getAllInvoices();
  const rows = [];

  invoices
    .filter(inv => inv.storeId === currentStoreId && inRangeByFilter(inv.date, range, specificDate))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach(inv => {
      (inv.items || []).forEach(item => {
        rows.push([
          formatDateOnly(inv.date),
          inv.customer || "-",
          inv.phone || "-",
          item.name || "-",
          Number(item.qty || 0),
          Number(item.price || 0).toFixed(2),
        paymentLabel(inv.payment || "cash"),
        buildTransferLine(inv) || "اختياري",
        (Number(item.qty || 0) * Number(item.price || 0)).toFixed(2)
      ]);
    });
  });

  return rows;
}

async function exportBulkInvoices(type) {
  const range = qs("bulkExportRange")?.value || "all";
  const specificDate = qs("bulkExportSpecificDate")?.value || "";
  const rows = await buildInvoiceExportRows(range, specificDate);

  const title = "تقرير المبيعات";
  const columns = [
    "التاريخ",
    "اسم الزبون",
    "رقم الزبون",
    "الصنف",
    "الكمية",
    "السعر",
    "الدفع",
    "الجهة",
    "الإجمالي"
  ];

  if (!rows.length) {
    alert("لا توجد بيانات للتصدير");
    return;
  }

  if (type === "print") {
    printRowsTable(title, columns, rows);
    return;
  }

  if (type === "pdf") {
    exportRowsToPdf({
      title,
      columns,
      rows,
      fileName: "تقرير_المبيعات"
    });
    return;
  }

  if (type === "image") {
    exportRowsToImage({
      title,
      columns,
      rows,
      fileName: "تقرير_المبيعات"
    });
  }
}

async function exportInvoicesExcel() {
  const range = qs("bulkExportRange")?.value || "all";
  const specificDate = qs("bulkExportSpecificDate")?.value || "";
  const rows = await buildInvoiceExportRows(range, specificDate);

  exportRowsToCsv({
    fileName: "تقرير_المبيعات",
    columns: [
      "التاريخ",
      "اسم الزبون",
      "رقم الزبون",
      "الصنف",
      "الكمية",
      "السعر",
      "الدفع",
      "الجهة",
      "الإجمالي"
    ],
    rows
  });
}

async function buildPurchasesExportRows(range, specificDate = "") {
  const purchases = await getAllPurchases();
  const rows = [];

  purchases
    .filter(p =>
      p.storeId === currentStoreId &&
      inRangeByFilter(p.createdAt, range, specificDate)
    )
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .forEach(p => {
      rows.push([
        formatDateOnly(p.createdAt),
        p.supplier || "-",
        p.itemName || "-",
        Number(p.qty || 0),
        Number(p.wholesalePrice || 0).toFixed(2),
        Number(p.salePrice || 0).toFixed(2),
        Number(p.amount || 0).toFixed(2),
        p.addToStock ? "نعم" : "لا",
        p.notes || "-"
      ]);
    });

  return rows;
}

async function exportBulkPurchases(type) {
  const range = qs("bulkPurchasesRange")?.value || "all";
  const specificDate = qs("bulkPurchasesSpecificDate")?.value || "";
  const rows = await buildPurchasesExportRows(range, specificDate);

  const title = "تقرير مشتريات الموردين";
  const columns = [
    "التاريخ",
    "المورد",
    "الصنف",
    "الكمية",
    "سعر الجملة",
    "سعر البيع",
    "الإجمالي",
    "دخل المخزون",
    "ملاحظات"
  ];

  if (!rows.length) {
    alert("لا توجد بيانات للتصدير");
    return;
  }

  if (type === "print") {
    printRowsTable(title, columns, rows);
    return;
  }

  if (type === "pdf") {
    exportRowsToPdf({
      title,
      columns,
      rows,
      fileName: "تقرير_المشتريات"
    });
    return;
  }

  if (type === "image") {
    exportRowsToImage({
      title,
      columns,
      rows,
      fileName: "تقرير_المشتريات"
    });
  }
}

async function exportPurchasesExcel() {
  const range = qs("bulkPurchasesRange")?.value || "all";
  const specificDate = qs("bulkPurchasesSpecificDate")?.value || "";
  const rows = await buildPurchasesExportRows(range, specificDate);

  exportRowsToCsv({
    fileName: "تقرير_المشتريات",
    columns: [
      "التاريخ",
      "المورد",
      "الصنف",
      "الكمية",
      "سعر الجملة",
      "سعر البيع",
      "الإجمالي",
      "دخل المخزون",
      "ملاحظات"
    ],
    rows
  });
}

function exportRowsToCsv({ fileName, columns, rows }) {
  const csvRows = [];
  csvRows.push(columns.join(","));

  rows.forEach(row => {
    csvRows.push(
      row.map(v => {
        const text = String(v ?? "").replaceAll('"', '""');
        return `"${text}"`;
      }).join(",")
    );
  });

  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function printRowsTable(title, columns, rows, summary = []) {
  const html = buildPrintableTableHtml(title, columns, rows, summary);

  const w = window.open("", "_blank");
  w.document.write(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>${escapeHtml(title)}</title>
        <style>
          body{font-family:Arial,Tahoma,sans-serif;direction:rtl;padding:20px;color:#111827}
          h1{text-align:center;color:#047857}
          table{width:100%;border-collapse:collapse;margin-top:16px;font-size:12px}
          th,td{border:1px solid #d1d5db;padding:8px;text-align:center}
          th{background:#ecfdf5;color:#047857}
          .summary{margin-top:14px;border:1px solid #d1d5db;border-radius:12px;padding:10px}
          .summary div{margin:6px 0}
        </style>
      </head>
      <body>${html}</body>
    </html>
  `);
  w.document.close();
  w.focus();
  w.print();
}

function buildPrintableTableHtml(title, columns, rows, summary = []) {
  const summaryHtml = summary.length
    ? `<div class="summary">${summary.map(s => `<div><b>${escapeHtml(s[0])}:</b> ${escapeHtml(s[1])}</div>`).join("")}</div>`
    : "";

  return `
    <h1>${escapeHtml(title)}</h1>
    ${summaryHtml}
    <table>
      <thead>
        <tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function exportRowsToPdf({ title, columns, rows, fileName, summary = [] }) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4"
  });

  pdf.setFontSize(14);
  pdf.text(title, pdf.internal.pageSize.getWidth() / 2, 28, { align: "center" });

  let startY = 48;

  if (summary.length) {
    pdf.setFontSize(9);
    summary.forEach((s, index) => {
      pdf.text(`${s[0]}: ${s[1]}`, 40, startY + index * 14);
    });
    startY += summary.length * 14 + 10;
  }

  pdf.autoTable({
    head: [columns],
    body: rows,
    startY,
    styles: {
      fontSize: 8,
      halign: "center",
      cellPadding: 5
    },
    headStyles: {
      fillColor: [4, 120, 87],
      textColor: [255, 255, 255]
    },
    margin: { top: 40, right: 25, left: 25 },
    didDrawPage: () => {
      pdf.setFontSize(8);
      pdf.text(
        `تاريخ التصدير: ${new Date().toLocaleString("ar-EG")}`,
        40,
        pdf.internal.pageSize.getHeight() - 18
      );
    }
  });

  pdf.save(`${fileName}_${Date.now()}.pdf`);
}

function exportRowsToImage({ title, columns, rows, fileName, summary = [] }) {
  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.right = "-99999px";
  wrap.style.top = "0";
  wrap.style.width = "1200px";
  wrap.style.background = "#ffffff";
  wrap.style.padding = "24px";
  wrap.style.direction = "rtl";
  wrap.style.fontFamily = "Arial,Tahoma,sans-serif";

  wrap.innerHTML = buildPrintableTableHtml(title, columns, rows, summary);
  document.body.appendChild(wrap);

  html2canvas(wrap, {
    scale: 2,
    backgroundColor: "#ffffff"
  }).then(canvas => {
    const a = document.createElement("a");
    a.download = `${fileName}_${Date.now()}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
    wrap.remove();
  }).catch(() => {
    wrap.remove();
    alert("تعذر تصدير الصورة");
  });
}

async function exportTableArea(areaId, type, fileName) {
  const area = qs(areaId);
  if (!area) return;

  if (type === "print") {
    const w = window.open("", "_blank");
    w.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>${fileName}</title>
          <style>
            body{font-family:Arial,Tahoma,sans-serif;direction:rtl;padding:20px}
            table{width:100%;border-collapse:collapse;font-size:12px}
            th,td{border:1px solid #d1d5db;padding:8px;text-align:center}
            th{background:#ecfdf5;color:#047857}
          </style>
        </head>
        <body>${area.innerHTML}</body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
    return;
  }

  if (type === "image") {
    html2canvas(area, {
      scale: 2,
      backgroundColor: "#ffffff"
    }).then(canvas => {
      const a = document.createElement("a");
      a.download = `${fileName}_${Date.now()}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    });
    return;
  }

  if (type === "pdf") {
    const rows = [];
    const table = area.querySelector("table");
    if (!table) {
      alert("لا يوجد جدول للتصدير");
      return;
    }

    const columns = [...table.querySelectorAll("thead th")].map(th => th.innerText.trim());
    [...table.querySelectorAll("tbody tr")].forEach(tr => {
      rows.push([...tr.querySelectorAll("td")].map(td => td.innerText.trim()));
    });

    exportRowsToPdf({
      title: fileName,
      columns,
      rows,
      fileName
    });
  }
}

async function exportSalesReportExcel() {
  const rowsData = await getSalesReportRows();
  const rows = rowsData.map(r => [
    formatDateOnly(r.date),
    r.customer,
    r.phone,
    r.itemName,
    r.qty,
    r.price.toFixed(2),
    paymentLabel(r.payment),
    r.account,
    r.total.toFixed(2)
  ]);

  exportRowsToCsv({
    fileName: "تقرير_المبيعات",
    columns: ["التاريخ", "اسم الزبون", "رقم الزبون", "الصنف", "الكمية", "السعر", "الدفع", "الجهة", "الإجمالي"],
    rows
  });
}

async function exportStockReportExcel() {
  const limit = Number(qs("lowStockLimit")?.value || 5);
  const products = await getAllProducts();

  const rows = products
    .filter(p => p.storeId === currentStoreId && Number(p.stock || 0) <= limit)
    .map(p => [
      p.code || "-",
      p.supplier || "-",
      p.name || "-",
      Number(p.stock || 0),
      Number(p.cost || 0).toFixed(2),
      Number(p.price || 0).toFixed(2),
      "ناقص"
    ]);

  exportRowsToCsv({
    fileName: "تقرير_البضاعة_الناقصة",
    columns: ["الكود", "المورد", "المنتج", "الكمية الحالية", "سعر الجملة", "سعر البيع", "الحالة"],
    rows
  });
}

async function exportProfitReportExcel() {
  const table = qs("balancesReportTable");
  const rows = [];

  if (table) {
    [...table.querySelectorAll("tr")].forEach(tr => {
      rows.push([...tr.querySelectorAll("td")].map(td => td.innerText.trim()));
    });
  }

  exportRowsToCsv({
    fileName: "تقرير_المرابح_والأرصدة",
    columns: ["طريقة الدفع", "اسم الجهة", "الرقم / الحساب", "الرصيد"],
    rows
  });
}

async function exportSummaryReportExcel() {
  const rows = [
    ["إجمالي البيع بسعر الجملة", qs("repWholesaleSales")?.innerText || "0"],
    ["إجمالي المبيعات", qs("repTotalSales")?.innerText || "0"],
    ["صافي الربح", qs("repTotalProfit")?.innerText || "0"],
    ["المشتريات", qs("repPurchases")?.innerText || "0"],
    ["عدد العمليات", qs("repCount")?.innerText || "0"]
  ];

  exportRowsToCsv({
    fileName: "التقرير_المختصر",
    columns: ["البند", "القيمة"],
    rows
  });
}
async function getEntity(kind, id) {
  return await idbGet(kind, id);
}

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
    addPendingSync({
      type: "set",
      path: `${pathMap[kind]}/${id}`,
      payload
    });
  }
}

async function deleteEntity(kind, id) {
  await idbDelete(kind, id);

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
    await remove(ref(db, `${pathMap[kind]}/${id}`));
  } else if (session?.appMode === "online") {
    addPendingSync({
      type: "remove",
      path: `${pathMap[kind]}/${id}`
    });
  }
}

async function getAllStores() { return await idbGetAll("stores"); }
async function getAllProducts() { return await idbGetAll("products"); }
async function getAllInvoices() { return await idbGetAll("invoices"); }
async function getAllPurchases() { return await idbGetAll("purchases"); }
async function getAllExpenses() { return await idbGetAll("expenses"); }
async function getAllMerchantPayments() { return await idbGetAll("merchantPayments"); }

function escapeHtmlAttr(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(str) {
  return String(str ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

window.handleLicenseLogin = handleLicenseLogin;
window.goToLoginFromExpired = goToLoginFromExpired;
window.switchTab = switchTab;
window.createNewStore = createNewStore;
window.switchStore = switchStore;

window.openNewProduct = openNewProduct;
window.saveProduct = saveProduct;
window.showProductBarcode = showProductBarcode;
window.resetProductsAndRender = resetProductsAndRender;
window.loadMoreProducts = loadMoreProducts;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;

window.searchPosProducts = searchPosProducts;
window.changeCartVariant = changeCartVariant;
window.changeQty = changeQty;
window.removeFromCart = removeFromCart;
window.calculateTotal = calculateTotal;
window.checkout = checkout;

window.editInvoice = editInvoice;
window.deleteInvoice = deleteInvoice;
window.viewInvoice = viewInvoice;
window.backFromInvoicePage = backFromInvoicePage;
window.printInvoicePage = printInvoicePage;
window.exportInvoicePage = exportInvoicePage;
window.resetInvoicesAndRender = resetInvoicesAndRender;
window.loadMoreInvoices = loadMoreInvoices;

window.openPurchaseModal = openPurchaseModal;
window.savePurchase = savePurchase;
window.editPurchase = editPurchase;
window.deletePurchase = deletePurchase;

window.openMerchantPaymentModal = openMerchantPaymentModal;
window.saveMerchantPayment = saveMerchantPayment;
window.editMerchantPayment = editMerchantPayment;
window.deleteMerchantPayment = deleteMerchantPayment;

window.openExpenseModal = openExpenseModal;
window.saveExpense = saveExpense;
window.editExpense = editExpense;
window.deleteExpense = deleteExpense;

window.openScanner = openScanner;
window.toggleScannerTorch = toggleScannerTorch;
window.closeScanner = closeScanner;
window.scanBarcodeFromImage = scanBarcodeFromImage;

window.saveSettings = saveSettings;
window.logoutUser = logoutUser;
window.toggleModal = toggleModal;
window.addVariantRow = addVariantRow;
window.syncStockWithVariants = syncStockWithVariants;
window.previewStoreLogo = previewStoreLogo;

window.downloadBackupFile = downloadBackupFile;
window.saveCloudBackup = saveCloudBackup;
window.restoreBackupFromFile = restoreBackupFromFile;

window.openStatusModal = openStatusModal;
window.openCustomerHistory = openCustomerHistory;
window.openNoteModal = openNoteModal;
window.openManualInvoiceModal = openManualInvoiceModal;
window.saveManualInvoice = saveManualInvoice;

window.createAggregateInvoiceForCustomer = createAggregateInvoiceForCustomer;
window.sendDebtMessageToCustomer = sendDebtMessageToCustomer;

window.renderReports = renderReports;
window.renderSalesReport = renderSalesReport;
window.renderStockReport = renderStockReport;
window.renderProfitReport = renderProfitReport;
window.renderCustomersPage = renderCustomersPage;

window.exportBulkInvoices = exportBulkInvoices;
window.exportBulkPurchases = exportBulkPurchases;
window.exportInvoicesExcel = exportInvoicesExcel;
window.exportPurchasesExcel = exportPurchasesExcel;
window.exportSalesReportExcel = exportSalesReportExcel;
window.exportStockReportExcel = exportStockReportExcel;
window.exportProfitReportExcel = exportProfitReportExcel;
window.exportSummaryReportExcel = exportSummaryReportExcel;
window.exportCustomersExcel = exportCustomersExcel;
window.exportExpensesExcel = exportExpensesExcel;
window.exportMerchantPaymentsExcel = exportMerchantPaymentsExcel;

window.addTransferAccount = addTransferAccount;
window.deleteTransferAccount = deleteTransferAccount;

window.syncPendingAndCloud = syncPendingAndCloud;
window.uploadOfflineDataToCloud = uploadOfflineDataToCloud;

try { updateConnectionUI(); } catch {}
try { updatePendingSyncBadge(); } catch {}
try { lucide?.createIcons?.(); } catch {}