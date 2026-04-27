/* cashier-auth-safe-patch.js */
(function () {
  "use strict";

  const PATCH_VERSION = "2026-04-27-auth-safe-one-file-v5";
  const DEFAULT_ADMIN_USERNAME = "0000";
  const SESSION_KEY = "cashier_auth_session_v5";
  const DEVICE_KEY = "cashier_auth_device_v5";
  const OLD_SESSION_KEYS = [
    "cashier_auth_session_v1",
    "cashier_auth_session_v2",
    "cashier_auth_session_v3",
    "cashier_auth_session_v4"
  ];

  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const PAGES = [
    { id: "home", label: "الرئيسية", icon: "fa-house" },
    { id: "cashier", label: "الكاشير", icon: "fa-cart-shopping" },
    { id: "freeInvoice", label: "فاتورة بدون مخزون", icon: "fa-file-circle-plus" },
    { id: "inventory", label: "المخزون", icon: "fa-boxes-stacked" },
    { id: "invoices", label: "الفواتير", icon: "fa-file-invoice-dollar" },
    { id: "debts", label: "الديون", icon: "fa-address-book" },
    { id: "purchases", label: "المشتريات", icon: "fa-truck-ramp-box" },
    { id: "supplierPayments", label: "دفعات التجار", icon: "fa-hand-holding-dollar" },
    { id: "expenses", label: "المصروفات", icon: "fa-money-bill-wave" },
    { id: "reports", label: "التقارير", icon: "fa-chart-line" },
    { id: "settings", label: "الإعدادات", icon: "fa-gear" }
  ];

  const PERMISSIONS = [
    { key: "admin", label: "صلاحيات المدير كاملة" },
    { key: "home", label: "الرئيسية" },
    { key: "cashier", label: "الكاشير وإضافة فاتورة" },
    { key: "freeInvoice", label: "فاتورة بدون مخزون" },
    { key: "inventory", label: "المخزون" },
    { key: "invoices", label: "الفواتير" },
    { key: "debts", label: "الديون" },
    { key: "purchases", label: "المشتريات" },
    { key: "supplierPayments", label: "دفعات التجار" },
    { key: "expenses", label: "المصروفات" },
    { key: "reports", label: "التقارير" },
    { key: "settings", label: "الإعدادات وإدارة الموظفين" }
  ];

  const authState = {
    user: null,
    settings: null,
    employees: [],
    started: false,
    firebaseReady: false
  };

  function log(...args) {
    console.log("[cashier-auth-safe-patch]", PATCH_VERSION, ...args);
  }

  function toast(msg, ms = 2600) {
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
    clearTimeout(el.__authSafeToast);
    el.__authSafeToast = setTimeout(() => el.classList.remove("show"), ms);
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  function uid(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uid("device");
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function clearOldSessions() {
    OLD_SESSION_KEYS.forEach(k => localStorage.removeItem(k));
  }

  function authRoot(path = "") {
    return `${window.FIREBASE_ROOT}/auth${path ? "/" + path : ""}`;
  }

  function saveSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id: user.id,
      name: user.name || "",
      username: user.username || "",
      role: user.role || "employee",
      permissions: Array.isArray(user.permissions) ? user.permissions : [],
      deviceId: getDeviceId(),
      savedAt: Date.now()
    }));
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function normalizeEmployee(emp = {}) {
    return {
      id: emp.id || uid("emp"),
      name: String(emp.name || "موظف").trim(),
      username: String(emp.username || "").trim(),
      active: emp.active !== false,
      permissions: Array.isArray(emp.permissions) ? emp.permissions : [],
      createdAt: emp.createdAt || Date.now(),
      updatedAt: emp.updatedAt || Date.now()
    };
  }

  function isAdmin() {
    const u = authState.user;
    return !!u && (u.role === "admin" || (u.permissions || []).includes("admin"));
  }

  function hasPermission(key) {
    if (!authState.user) return false;
    if (isAdmin()) return true;
    return (authState.user.permissions || []).includes(key);
  }

  function canOpenPage(page) {
    if (!authState.user) return false;
    if (isAdmin()) return true;
    return (authState.user.permissions || []).includes(page);
  }

  async function waitForApp() {
    for (let i = 0; i < 220; i++) {
      if (
        window.db &&
        window.ref &&
        window.set &&
        window.get &&
        window.remove &&
        window.onValue &&
        window.FIREBASE_ROOT &&
        window.state
      ) {
        return true;
      }
      await wait(100);
    }
    return false;
  }

  function injectStyles() {
    if ($("cashierAuthSafeStyle")) return;

    const style = document.createElement("style");
    style.id = "cashierAuthSafeStyle";
    style.textContent = `
      .cashier-auth-screen{
        position:fixed;
        inset:0;
        z-index:999999;
        background:
          radial-gradient(circle at top right,rgba(37,99,235,.24),transparent 36%),
          radial-gradient(circle at bottom left,rgba(217,164,65,.20),transparent 35%),
          linear-gradient(180deg,#f8fbff,#eef3f9);
        display:none;
        align-items:center;
        justify-content:center;
        padding:16px;
        font-family:Cairo,Arial,sans-serif;
      }
      .cashier-auth-screen.show{display:flex}
      .cashier-auth-card{
        width:min(430px,100%);
        background:rgba(255,255,255,.96);
        border:1px solid rgba(226,232,240,.95);
        box-shadow:0 28px 80px rgba(15,23,42,.16);
        border-radius:30px;
        padding:20px;
      }
      .cashier-auth-logo{
        width:72px;
        height:72px;
        border-radius:25px;
        margin:0 auto 12px;
        background:linear-gradient(135deg,#2563eb,#38bdf8);
        color:white;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:31px;
        box-shadow:0 18px 40px rgba(37,99,235,.24);
      }
      .cashier-auth-title{
        text-align:center;
        font-size:22px;
        font-weight:900;
        color:#0f172a;
        margin-bottom:5px;
      }
      .cashier-auth-sub{
        text-align:center;
        color:#64748b;
        font-size:13px;
        font-weight:800;
        margin-bottom:16px;
      }
      .cashier-auth-label{
        display:block;
        font-size:13px;
        font-weight:900;
        color:#334155;
        margin-bottom:7px;
      }
      .cashier-auth-input{
        width:100%;
        border:1px solid transparent;
        background:#f8fafc;
        border-radius:17px;
        padding:13px 14px;
        outline:none;
        font-size:15px;
        font-family:Cairo,Arial,sans-serif;
      }
      .cashier-auth-input:focus{
        border-color:rgba(37,99,235,.45);
        background:#fff;
        box-shadow:0 0 0 4px rgba(37,99,235,.08);
      }
      .cashier-auth-btn{
        width:100%;
        border:0;
        border-radius:17px;
        padding:13px 16px;
        font-weight:900;
        background:linear-gradient(135deg,#2563eb,#1d4ed8);
        color:white;
        box-shadow:0 12px 26px rgba(37,99,235,.25);
        font-family:Cairo,Arial,sans-serif;
        cursor:pointer;
        margin-top:12px;
      }
      .cashier-auth-note{
        color:#64748b;
        font-size:12px;
        line-height:1.8;
        margin-top:10px;
        text-align:center;
      }
      .cashier-auth-panel{
        margin-top:14px;
        border:1px solid #e2e8f0;
        border-radius:26px;
        padding:16px;
        background:#fff;
        box-shadow:0 18px 48px rgba(15,23,42,.06);
      }
      .cashier-auth-panel-head{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
        margin-bottom:12px;
      }
      .cashier-auth-panel-head h2{
        margin:0;
        font-size:19px;
        font-weight:900;
      }
      .cashier-auth-employee{
        border:1px solid #e5e7eb;
        background:#f8fafc;
        border-radius:18px;
        padding:12px;
        margin-bottom:10px;
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
      }
      .cashier-auth-perms{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:8px;
        margin-top:10px;
      }
      .cashier-auth-check{
        border:1px solid #e2e8f0;
        background:#f8fafc;
        border-radius:15px;
        padding:10px;
        display:flex;
        align-items:center;
        gap:8px;
        font-weight:900;
        font-size:12px;
        color:#334155;
        cursor:pointer;
      }
      .cashier-auth-check input{
        width:18px;
        height:18px;
      }
      .cashier-auth-chip{
        display:inline-flex;
        align-items:center;
        gap:7px;
        padding:8px 11px;
        background:#eff6ff;
        color:#1d4ed8;
        border-radius:999px;
        font-size:12px;
        font-weight:900;
        margin-inline-start:6px;
      }
      .auth-hidden-page-btn{
        display:none !important;
      }
      .auth-denied-content{
        border-radius:24px;
        background:#111827;
        color:white;
        font-weight:900;
        text-align:center;
        padding:28px 16px;
        margin:12px 0;
        box-shadow:0 18px 48px rgba(15,23,42,.18);
      }
      @media(max-width:520px){
        .cashier-auth-perms{grid-template-columns:1fr}
        .cashier-auth-employee{align-items:flex-start;flex-direction:column}
      }
    `;
    document.head.appendChild(style);
  }

  function renderLoginScreen() {
    if ($("cashierAuthScreen")) return;

    const div = document.createElement("div");
    div.id = "cashierAuthScreen";
    div.className = "cashier-auth-screen";
    div.innerHTML = `
      <div class="cashier-auth-card">
        <div class="cashier-auth-logo"><i class="fa-solid fa-lock"></i></div>
        <div class="cashier-auth-title">تسجيل الدخول</div>
        <div class="cashier-auth-sub">أدخل يوزر المدير أو الموظف</div>

        <form id="cashierAuthLoginForm">
          <label class="cashier-auth-label">يوزر الدخول</label>
          <input id="cashierAuthUsername" class="cashier-auth-input" autocomplete="username" placeholder="مثال: 0000" required>
          <button class="cashier-auth-btn" type="submit">
            <i class="fa-solid fa-right-to-bracket"></i>
            دخول
          </button>
        </form>

        <div class="cashier-auth-note">
          أول دخول للمدير يكون باليوزر الافتراضي 0000، وبعدها يمكن تغييره من الإعدادات.
        </div>
      </div>
    `;

    document.body.appendChild(div);

    $("cashierAuthLoginForm").onsubmit = async (e) => {
      e.preventDefault();
      await loginByUsername($("cashierAuthUsername").value.trim());
    };
  }

  function showLogin() {
    renderLoginScreen();
    $("cashierAuthScreen").classList.add("show");
  }

  function hideLogin() {
    $("cashierAuthScreen")?.classList.remove("show");
  }

  async function ensureAuthDefaults() {
    const snap = await window.get(window.ref(window.db, authRoot("settings")));

    if (!snap.exists()) {
      const settings = {
        adminUsername: DEFAULT_ADMIN_USERNAME,
        updatedAt: Date.now()
      };

      await window.set(window.ref(window.db, authRoot("settings")), settings);
      authState.settings = settings;
      return settings;
    }

    authState.settings = {
      adminUsername: DEFAULT_ADMIN_USERNAME,
      ...(snap.val() || {})
    };

    return authState.settings;
  }

  async function loadEmployees() {
    const snap = await window.get(window.ref(window.db, authRoot("employees")));
    const obj = snap.exists() ? (snap.val() || {}) : {};
    authState.employees = Object.values(obj).filter(Boolean).map(normalizeEmployee);
    return authState.employees;
  }

  async function loginByUsername(username) {
    if (!username) {
      toast("أدخل يوزر الدخول");
      return;
    }

    if (!navigator.onLine) {
      const session = getSession();

      if (session && String(session.username) === username) {
        authState.user = {
          id: session.id,
          name: session.name || session.username,
          username: session.username,
          role: session.role,
          permissions: session.permissions || []
        };

        hideLogin();
        applyPermissions();
        toast("تم الدخول من الجلسة المحفوظة أوفلاين");
        return;
      }

      toast("أول دخول أو تحديث الصلاحيات يحتاج إنترنت");
      return;
    }

    await ensureAuthDefaults();
    await loadEmployees();

    const adminUsername = String(authState.settings?.adminUsername || DEFAULT_ADMIN_USERNAME).trim();

    if (username === adminUsername) {
      authState.user = {
        id: "admin",
        name: "المدير",
        username,
        role: "admin",
        active: true,
        permissions: ["admin"]
      };

      saveSession(authState.user);
      hideLogin();
      applyPermissions();
      toast("تم دخول المدير");
      return;
    }

    const emp = authState.employees.find(e => String(e.username).trim() === username);

    if (!emp) {
      toast("يوزر الدخول غير صحيح");
      return;
    }

    if (!emp.active) {
      clearSession();
      showLogin();
      toast("هذا المستخدم موقوف من المدير");
      return;
    }

    authState.user = {
      ...emp,
      role: "employee"
    };

    saveSession(authState.user);
    hideLogin();
    applyPermissions();
    toast(`أهلاً ${emp.name}`);
  }

  async function tryAutoLogin() {
    const session = getSession();

    if (!session) {
      showLogin();
      return;
    }

    if (!navigator.onLine) {
      authState.user = {
        id: session.id,
        name: session.name || session.username,
        username: session.username,
        role: session.role,
        permissions: session.permissions || []
      };

      hideLogin();
      applyPermissions();
      return;
    }

    await ensureAuthDefaults();
    await loadEmployees();

    if (session.role === "admin") {
      const adminUsername = String(authState.settings?.adminUsername || DEFAULT_ADMIN_USERNAME).trim();

      if (String(session.username) !== adminUsername) {
        clearSession();
        showLogin();
        toast("تم تغيير يوزر المدير، سجل دخول من جديد");
        return;
      }

      authState.user = {
        id: "admin",
        name: "المدير",
        username: adminUsername,
        role: "admin",
        active: true,
        permissions: ["admin"]
      };

      saveSession(authState.user);
      hideLogin();
      applyPermissions();
      return;
    }

    const emp = authState.employees.find(e => e.id === session.id || e.username === session.username);

    if (!emp || !emp.active) {
      clearSession();
      authState.user = null;
      showLogin();
      toast("تم حذف أو إيقاف هذا المستخدم من المدير");
      return;
    }

    authState.user = {
      ...emp,
      role: "employee"
    };

    saveSession(authState.user);
    hideLogin();
    applyPermissions();
  }

  function getFirstAllowedPage() {
    return PAGES.find(p => canOpenPage(p.id))?.id || "home";
  }

  function ensureAllowedActivePage() {
    const active = document.querySelector(".section.active");
    const activePage = active?.id?.replace("page-", "");

    if (!activePage || canOpenPage(activePage)) return;

    const targetPage = getFirstAllowedPage();
    const btn = document.querySelector(`[data-page="${targetPage}"]`);

    if (btn) {
      setTimeout(() => btn.click(), 0);
    }
  }

  function applyPermissions() {
    if (!authState.user) return;

    document.body.dataset.authUserRole = authState.user.role || "";

    PAGES.forEach(page => {
      document.querySelectorAll(`[data-page="${page.id}"]`).forEach(btn => {
        btn.classList.toggle("auth-hidden-page-btn", !canOpenPage(page.id));
      });

      const section = $(`page-${page.id}`);
      if (!section) return;

      let denied = section.querySelector(":scope > .auth-denied-content");

      if (!canOpenPage(page.id)) {
        if (!denied) {
          denied = document.createElement("div");
          denied.className = "auth-denied-content";
          denied.textContent = "**** ليس لديك صلاحية لعرض هذه البيانات ****";
          section.prepend(denied);
        }

        Array.from(section.children).forEach(child => {
          if (!child.classList.contains("auth-denied-content")) {
            child.style.display = "none";
          }
        });
      } else {
        if (denied) denied.remove();

        Array.from(section.children).forEach(child => {
          child.style.display = "";
        });
      }
    });

    ensureAllowedActivePage();
    renderUserChip();
    renderAuthSettingsPanel();
  }

  function renderUserChip() {
    const topbarRight = document.querySelector(".topbar > div:last-child");
    if (!topbarRight) return;

    let chip = $("cashierAuthUserChip");

    if (!chip) {
      chip = document.createElement("span");
      chip.id = "cashierAuthUserChip";
      chip.className = "cashier-auth-chip";
      topbarRight.prepend(chip);
    }

    chip.innerHTML = `<i class="fa-solid fa-user-shield"></i> ${escapeHtml(authState.user?.name || authState.user?.username || "مستخدم")}`;
  }

  function openModalSafe(title, html, large = false) {
    if (typeof window.openModal === "function") {
      window.openModal(title, html, large);
      return;
    }

    const backdrop = $("modalBackdrop");
    const box = $("modalBox");
    const modalTitle = $("modalTitle");
    const body = $("modalBody");

    if (!backdrop || !box || !modalTitle || !body) {
      alert(title);
      return;
    }

    modalTitle.textContent = title;
    box.classList.toggle("large", !!large);
    body.innerHTML = html;
    backdrop.classList.add("show");
  }

  function closeModalSafe() {
    if (typeof window.closeModal === "function") {
      window.closeModal();
      return;
    }

    $("modalBackdrop")?.classList.remove("show");
    $("modalBox")?.classList.remove("large");
  }

  function renderAuthSettingsPanel() {
    const settingsPage = $("page-settings");
    if (!settingsPage) return;

    let box = $("cashierAuthPanel");

    if (!box) {
      box = document.createElement("div");
      box.id = "cashierAuthPanel";
      box.className = "cashier-auth-panel";
      settingsPage.appendChild(box);
    }

    if (!hasPermission("settings")) {
      box.style.display = "none";
      return;
    }

    box.style.display = "";

    const employeesHtml = authState.employees.map(emp => {
      const perms = (emp.permissions || []).includes("admin")
        ? "مدير كامل"
        : (emp.permissions || []).join("، ");

      return `
        <div class="cashier-auth-employee">
          <div>
            <b>${escapeHtml(emp.name)}</b>
            <div class="muted">يوزر: ${escapeHtml(emp.username)} · ${emp.active ? "فعال" : "موقوف"}</div>
            <div class="muted" style="font-size:11px">صلاحيات: ${escapeHtml(perms || "-")}</div>
          </div>

          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="ghost-btn" type="button" data-auth-edit="${emp.id}">
              <i class="fa-solid fa-pen"></i> تعديل
            </button>

            <button class="danger-btn" type="button" data-auth-delete="${emp.id}">
              <i class="fa-solid fa-trash"></i> حذف
            </button>
          </div>
        </div>
      `;
    }).join("");

    box.innerHTML = `
      <div class="cashier-auth-panel-head">
        <h2><i class="fa-solid fa-user-shield"></i> تسجيل الدخول والصلاحيات</h2>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="cashierAuthAddEmpBtn" class="primary-btn" type="button">
            <i class="fa-solid fa-user-plus"></i> إضافة موظف
          </button>

          <button id="cashierAuthLogoutBtn" class="danger-btn" type="button">
            <i class="fa-solid fa-right-from-bracket"></i> خروج
          </button>
        </div>
      </div>

      <div class="card" style="box-shadow:none;margin-bottom:12px">
        <h3 style="margin:0 0 10px;font-size:16px;font-weight:900">
          <i class="fa-solid fa-key"></i> يوزر المدير
        </h3>

        <div class="form-grid-compact">
          <div>
            <label class="field-label">اليوزر الحالي</label>
            <input class="input" value="${escapeHtml(authState.settings?.adminUsername || DEFAULT_ADMIN_USERNAME)}" disabled>
          </div>

          <div>
            <label class="field-label">يوزر جديد</label>
            <input id="cashierAuthAdminUsername" class="input" placeholder="مثال: 1234">
          </div>
        </div>

        <button id="cashierAuthSaveAdminBtn" class="primary-btn" type="button" style="margin-top:12px">
          <i class="fa-solid fa-floppy-disk"></i> حفظ يوزر المدير
        </button>
      </div>

      <div>
        <h3 style="margin:0 0 10px;font-size:16px;font-weight:900">
          <i class="fa-solid fa-users-gear"></i> الموظفون
        </h3>

        ${employeesHtml || `<div class="muted" style="text-align:center;padding:14px">لا يوجد موظفون بعد</div>`}
      </div>
    `;

    $("cashierAuthAddEmpBtn").onclick = () => openEmployeeForm();
    $("cashierAuthLogoutBtn").onclick = logout;
    $("cashierAuthSaveAdminBtn").onclick = saveAdminUsername;

    box.querySelectorAll("[data-auth-edit]").forEach(btn => {
      btn.onclick = () => openEmployeeForm(btn.dataset.authEdit);
    });

    box.querySelectorAll("[data-auth-delete]").forEach(btn => {
      btn.onclick = () => deleteEmployee(btn.dataset.authDelete);
    });
  }

  function openEmployeeForm(employeeId = "") {
    if (!hasPermission("settings")) {
      toast("ليس لديك صلاحية إدارة الموظفين");
      return;
    }

    const old = employeeId ? authState.employees.find(e => e.id === employeeId) : null;
    const currentPerms = old?.permissions || [];

    const permsHtml = PERMISSIONS.map(p => `
      <label class="cashier-auth-check">
        <input type="checkbox" value="${escapeHtml(p.key)}" ${currentPerms.includes(p.key) ? "checked" : ""}>
        <span>${escapeHtml(p.label)}</span>
      </label>
    `).join("");

    openModalSafe(old ? "تعديل موظف" : "إضافة موظف", `
      <form id="cashierAuthEmpForm">
        <input type="hidden" id="cashierAuthEmpId" value="${escapeHtml(old?.id || "")}">

        <div class="form-grid-compact">
          <div>
            <label class="field-label">اسم الموظف</label>
            <input id="cashierAuthEmpName" class="input" required placeholder="مثال: أحمد" value="${escapeHtml(old?.name || "")}">
          </div>

          <div>
            <label class="field-label">يوزر الدخول</label>
            <input id="cashierAuthEmpUsername" class="input" required placeholder="مثال: 1111" value="${escapeHtml(old?.username || "")}">
          </div>

          <div class="full-row">
            <label class="cashier-auth-check" style="background:#fff">
              <input id="cashierAuthEmpActive" type="checkbox" ${old?.active !== false ? "checked" : ""}>
              <span>الموظف فعال ويسمح له بالدخول</span>
            </label>
          </div>
        </div>

        <div style="margin-top:12px">
          <label class="field-label">الصلاحيات</label>
          <div class="cashier-auth-perms">
            ${permsHtml}
          </div>
        </div>

        <button class="primary-btn" type="submit" style="width:100%;margin-top:14px">
          <i class="fa-solid fa-floppy-disk"></i> حفظ الموظف
        </button>
      </form>
    `, true);

    const adminCheck = document.querySelector('#cashierAuthEmpForm input[value="admin"]');

    if (adminCheck) {
      adminCheck.onchange = () => {
        if (adminCheck.checked) {
          document.querySelectorAll('#cashierAuthEmpForm input[type="checkbox"][value]').forEach(ch => {
            ch.checked = true;
          });
        }
      };
    }

    $("cashierAuthEmpForm").onsubmit = async (e) => {
      e.preventDefault();

      const id = $("cashierAuthEmpId").value || uid("emp");
      const name = $("cashierAuthEmpName").value.trim();
      const username = $("cashierAuthEmpUsername").value.trim();

      if (!name) {
        toast("أدخل اسم الموظف");
        return;
      }

      if (!username) {
        toast("أدخل يوزر الدخول");
        return;
      }

      const adminUsername = String(authState.settings?.adminUsername || DEFAULT_ADMIN_USERNAME).trim();

      if (username === adminUsername) {
        toast("يوزر الموظف لا يجوز أن يطابق يوزر المدير");
        return;
      }

      const duplicated = authState.employees.some(e => e.id !== id && e.username === username);

      if (duplicated) {
        toast("يوزر الدخول مستخدم لموظف آخر");
        return;
      }

      const permissions = Array.from(document.querySelectorAll('#cashierAuthEmpForm input[type="checkbox"][value]:checked'))
        .map(ch => ch.value);

      if (!permissions.length) {
        toast("اختر صلاحية واحدة على الأقل");
        return;
      }

      const employee = normalizeEmployee({
        ...old,
        id,
        name,
        username,
        active: $("cashierAuthEmpActive").checked,
        permissions,
        createdAt: old?.createdAt || Date.now(),
        updatedAt: Date.now()
      });

      await window.set(window.ref(window.db, authRoot(`employees/${employee.id}`)), employee);

      const i = authState.employees.findIndex(e => e.id === employee.id);
      if (i >= 0) authState.employees[i] = employee;
      else authState.employees.push(employee);

      closeModalSafe();
      renderAuthSettingsPanel();
      toast(old ? "تم تعديل الموظف" : "تم إضافة الموظف");
    };
  }

  async function deleteEmployee(employeeId) {
    if (!hasPermission("settings")) {
      toast("ليس لديك صلاحية حذف الموظفين");
      return;
    }

    const emp = authState.employees.find(e => e.id === employeeId);
    if (!emp) return;

    if (!confirm(`حذف الموظف ${emp.name}؟ سيتم إخراجه من الأجهزة المتصلة.`)) return;

    await window.remove(window.ref(window.db, authRoot(`employees/${employeeId}`)));

    authState.employees = authState.employees.filter(e => e.id !== employeeId);

    renderAuthSettingsPanel();
    toast("تم حذف الموظف");
  }

  async function saveAdminUsername() {
    if (!hasPermission("settings")) {
      toast("ليس لديك صلاحية تغيير يوزر المدير");
      return;
    }

    const input = $("cashierAuthAdminUsername");
    const username = String(input?.value || "").trim();

    if (!username) {
      toast("أدخل يوزر جديد للمدير");
      return;
    }

    const duplicated = authState.employees.some(e => e.username === username);

    if (duplicated) {
      toast("هذا اليوزر مستخدم لموظف، اختر يوزر آخر");
      return;
    }

    const settings = {
      ...(authState.settings || {}),
      adminUsername: username,
      updatedAt: Date.now()
    };

    await window.set(window.ref(window.db, authRoot("settings")), settings);

    authState.settings = settings;

    if (authState.user?.role === "admin") {
      authState.user.username = username;
      saveSession(authState.user);
    }

    if (input) input.value = "";

    renderAuthSettingsPanel();
    toast("تم تغيير يوزر المدير");
  }

  function logout() {
    clearSession();
    authState.user = null;
    showLogin();
    toast("تم تسجيل الخروج");
  }

  function listenAuthChanges() {
    window.onValue(window.ref(window.db, authRoot("settings")), snap => {
      if (!snap.exists()) return;

      authState.settings = {
        adminUsername: DEFAULT_ADMIN_USERNAME,
        ...(snap.val() || {})
      };

      const user = authState.user;

      if (user?.role === "admin") {
        const adminUsername = String(authState.settings.adminUsername || DEFAULT_ADMIN_USERNAME).trim();

        if (user.username !== adminUsername) {
          user.username = adminUsername;
          saveSession(user);
        }
      }

      renderAuthSettingsPanel();
    });

    window.onValue(window.ref(window.db, authRoot("employees")), snap => {
      const obj = snap.exists() ? (snap.val() || {}) : {};
      authState.employees = Object.values(obj).filter(Boolean).map(normalizeEmployee);

      const current = authState.user;

      if (current?.role === "employee") {
        const fresh = authState.employees.find(e => e.id === current.id || e.username === current.username);

        if (!fresh || !fresh.active) {
          clearSession();
          authState.user = null;
          showLogin();
          toast("تم حذف أو إيقاف حسابك من المدير");
          return;
        }

        const changed =
          fresh.username !== current.username ||
          fresh.name !== current.name ||
          JSON.stringify(fresh.permissions || []) !== JSON.stringify(current.permissions || []);

        if (changed) {
          authState.user = {
            ...fresh,
            role: "employee"
          };

          saveSession(authState.user);
          applyPermissions();
          toast("تم تحديث صلاحياتك من المدير");
        }
      }

      renderAuthSettingsPanel();
    });
  }

  function patchRenderAll() {
    if (window.__cashierAuthRenderPatched) return;

    const oldRenderAll = window.renderAll;

    if (typeof oldRenderAll !== "function") return;

    window.__cashierAuthRenderPatched = true;

    window.renderAll = function (...args) {
      const result = oldRenderAll.apply(this, args);

      setTimeout(() => {
        if (authState.user) applyPermissions();
        patchNotificationsNoPaymentClick();
      }, 0);

      return result;
    };
  }

  function patchSwitchPage() {
    if (window.__cashierAuthSwitchPatched) return;

    if (typeof window.switchPage !== "function") return;

    const oldSwitchPage = window.switchPage;

    window.__cashierAuthSwitchPatched = true;

    window.switchPage = function (page) {
      if (authState.user && !canOpenPage(page)) {
        toast("ليس لديك صلاحية فتح هذا القسم");
        const allowed = getFirstAllowedPage();
        if (allowed && allowed !== page) return oldSwitchPage.call(this, allowed);
        return;
      }

      return oldSwitchPage.apply(this, arguments);
    };
  }

  function patchNotificationsNoPaymentClick() {
    const modal = $("modalBody");
    if (!modal) return;

    modal.querySelectorAll("[data-mark-manual-debt-paid]").forEach(el => {
      el.removeAttribute("data-mark-manual-debt-paid");
      el.style.cursor = "default";
      el.onclick = null;
    });

    modal.querySelectorAll("[data-open-later-status]").forEach(el => {
      const text = (el.textContent || "").trim();

      if (text.includes("تطبيق لاحق") || text.includes("فاتورة") || text.includes("غير مكتملة")) {
        el.removeAttribute("data-open-later-status");
        el.style.cursor = "default";
        el.onclick = null;
      }
    });
  }

  function patchNotificationsOnlyOver200() {
    if (window.__cashierAuthNotifPatched) return;

    if (typeof window.openNotifications !== "function") return;

    const oldOpenNotifications = window.openNotifications;

    window.__cashierAuthNotifPatched = true;

    window.openNotifications = function () {
      oldOpenNotifications.apply(this, arguments);

      setTimeout(() => {
        const body = $("modalBody");
        if (!body) return;

        body.querySelectorAll("[data-open-later-status]").forEach(card => {
          const amountText = card.textContent || "";
          const nums = amountText.match(/[\d.,]+/g) || [];
          const amount = nums.length ? Number(nums[nums.length - 1].replace(",", ".")) : 0;

          if (amount <= 200) {
            card.style.display = "none";
          } else {
            card.removeAttribute("data-open-later-status");
            card.style.cursor = "default";
          }
        });

        body.querySelectorAll("[data-mark-manual-debt-paid]").forEach(card => {
          const amountText = card.textContent || "";
          const nums = amountText.match(/[\d.,]+/g) || [];
          const amount = nums.length ? Number(nums[nums.length - 1].replace(",", ".")) : 0;

          if (amount <= 200) {
            card.style.display = "none";
          } else {
            card.removeAttribute("data-mark-manual-debt-paid");
            card.style.cursor = "default";
          }
        });

        patchNotificationsNoPaymentClick();
      }, 80);
    };
  }

  function patchNotificationsButton() {
    const btn = $("notificationsBtn");
    if (!btn || btn.__authNotifClickPatched) return;

    btn.__authNotifClickPatched = true;

    btn.addEventListener("click", () => {
      setTimeout(patchNotificationsNoPaymentClick, 120);
    });
  }

  function patchNotificationBadgeOver200() {
    if (window.__cashierAuthNotifBadgePatched) return;

    if (typeof window.renderNotifications !== "function") return;

    const oldRenderNotifications = window.renderNotifications;

    window.__cashierAuthNotifBadgePatched = true;

    window.renderNotifications = function () {
      const result = oldRenderNotifications.apply(this, arguments);

      try {
        const laterUnpaid = (window.state?.invoices || []).filter(i =>
          i.paymentMethod === "later_app" &&
          i.status !== "paid" &&
          Number(i.total || 0) > 200
        );

        const manualUnpaid = (window.state?.customers || []).flatMap(c =>
          (c.manualDebts || []).filter(d =>
            d.status !== "paid" &&
            Number(d.amount || 0) > 200
          )
        );

        const low = (window.state?.products || []).filter(p =>
          Number(p.stock || 0) <= Number(p.lowStock || window.state?.settings?.lowStock || 5)
        );

        const count = low.length + laterUnpaid.length + manualUnpaid.length;

        const badge = $("notifBadge");
        if (badge) {
          badge.textContent = count;
          badge.style.display = count ? "flex" : "none";
        }
      } catch {}

      return result;
    };
  }

  async function init() {
    clearOldSessions();
    injectStyles();
    renderLoginScreen();

    const ok = await waitForApp();

    if (!ok) {
      toast("باتش تسجيل الدخول لم يجد دوال التطبيق. تأكد أن الاستدعاء بعد كود التطبيق الأصلي.");
      showLogin();
      return;
    }

    authState.firebaseReady = true;

    await ensureAuthDefaults();
    await loadEmployees();

    patchRenderAll();
    patchSwitchPage();
    patchNotificationsOnlyOver200();
    patchNotificationBadgeOver200();
    patchNotificationsButton();
    listenAuthChanges();

    await tryAutoLogin();

    authState.started = true;

    window.CashierAuthSafePatch = {
      version: PATCH_VERSION,
      state: authState,
      hasPermission,
      canOpenPage,
      logout,
      reload: async () => {
        await ensureAuthDefaults();
        await loadEmployees();
        await tryAutoLogin();
        applyPermissions();
      },
      openEmployeeForm
    };

    log("ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();