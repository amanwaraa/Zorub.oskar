<script>
/* cashier-auth-permissions-patch.js inline */
(function () {
  "use strict";

  const PATCH_VERSION = "2026-04-27-auth-permissions-v1";
  const DEFAULT_ADMIN_PIN = "0000";
  const SESSION_KEY = "cashier_auth_session_v1";
  const DEVICE_KEY = "cashier_auth_device_id_v1";

  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

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
    { key: "admin", label: "صلاحيات المدير كاملة", page: "all" },
    { key: "home", label: "عرض الرئيسية", page: "home" },
    { key: "cashier", label: "الكاشير وإضافة فاتورة", page: "cashier" },
    { key: "freeInvoice", label: "فاتورة بدون مخزون", page: "freeInvoice" },
    { key: "inventory", label: "عرض وإدارة المخزون", page: "inventory" },
    { key: "invoices", label: "عرض وإدارة الفواتير", page: "invoices" },
    { key: "debts", label: "عرض وإدارة الديون", page: "debts" },
    { key: "purchases", label: "المشتريات", page: "purchases" },
    { key: "supplierPayments", label: "دفعات التجار", page: "supplierPayments" },
    { key: "expenses", label: "المصروفات", page: "expenses" },
    { key: "reports", label: "التقارير", page: "reports" },
    { key: "settings", label: "الإعدادات وإدارة الموظفين", page: "settings" }
  ];

  let authState = {
    user: null,
    settings: null,
    employees: [],
    ready: false,
    listenerStarted: false
  };

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  function toast(msg, ms = 2600) {
    if (typeof window.toast === "function") return window.toast(msg, ms);
    const el = $("toast");
    if (!el) return alert(msg);
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el.__authToast);
    el.__authToast = setTimeout(() => el.classList.remove("show"), ms);
  }

  async function waitForApp() {
    for (let i = 0; i < 180; i++) {
      if (
        window.state &&
        window.db &&
        window.ref &&
        window.set &&
        window.get &&
        window.remove &&
        window.onValue &&
        window.FIREBASE_ROOT
      ) return true;
      await wait(100);
    }
    return false;
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

  function authPath(path = "") {
    return `${window.FIREBASE_ROOT}/auth${path ? "/" + path : ""}`;
  }

  function hasPermission(key) {
    const user = authState.user;
    if (!user) return false;
    if (user.role === "admin") return true;
    if ((user.permissions || []).includes("admin")) return true;
    return (user.permissions || []).includes(key);
  }

  function canOpenPage(page) {
    const user = authState.user;
    if (!user) return false;
    if (user.role === "admin") return true;
    if ((user.permissions || []).includes("admin")) return true;
    return (user.permissions || []).includes(page);
  }

  function saveSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id: user.id,
      name: user.name || "",
      username: user.username,
      role: user.role,
      permissions: user.permissions || [],
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

  function injectAuthStyles() {
    if ($("authPermissionsPatchStyle")) return;

    const style = document.createElement("style");
    style.id = "authPermissionsPatchStyle";
    style.textContent = `
      .auth-login-screen{
        position:fixed;
        inset:0;
        z-index:20000;
        background:
          radial-gradient(circle at top right,rgba(37,99,235,.26),transparent 35%),
          radial-gradient(circle at bottom left,rgba(217,164,65,.22),transparent 34%),
          linear-gradient(180deg,#f8fbff,#eef3f9);
        display:none;
        align-items:center;
        justify-content:center;
        padding:16px;
        font-family:Cairo,Arial,sans-serif;
      }
      .auth-login-screen.show{display:flex}
      .auth-card{
        width:min(430px,100%);
        background:rgba(255,255,255,.94);
        border:1px solid rgba(226,232,240,.95);
        box-shadow:0 28px 80px rgba(15,23,42,.16);
        border-radius:30px;
        padding:20px;
      }
      .auth-logo{
        width:70px;
        height:70px;
        border-radius:24px;
        margin:0 auto 12px;
        background:linear-gradient(135deg,#2563eb,#38bdf8);
        color:white;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:30px;
        box-shadow:0 18px 40px rgba(37,99,235,.24);
      }
      .auth-title{
        text-align:center;
        font-size:22px;
        font-weight:900;
        margin-bottom:4px;
        color:#0f172a;
      }
      .auth-subtitle{
        text-align:center;
        color:#64748b;
        font-size:13px;
        font-weight:800;
        margin-bottom:16px;
      }
      .auth-field{margin-bottom:10px}
      .auth-label{
        display:block;
        font-size:13px;
        font-weight:900;
        color:#334155;
        margin-bottom:7px;
      }
      .auth-input{
        width:100%;
        border:1px solid transparent;
        background:#f8fafc;
        border-radius:17px;
        padding:13px 14px;
        outline:none;
        font-size:15px;
        font-family:Cairo,Arial,sans-serif;
      }
      .auth-input:focus{
        border-color:rgba(37,99,235,.45);
        background:#fff;
        box-shadow:0 0 0 4px rgba(37,99,235,.08);
      }
      .auth-btn{
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
      }
      .auth-muted{
        color:#64748b;
        font-size:12px;
        line-height:1.8;
        margin-top:10px;
        text-align:center;
      }
      .perm-blocked{
        position:relative !important;
        min-height:160px;
      }
      .perm-blocked > *{
        filter:blur(4px);
        pointer-events:none !important;
        user-select:none !important;
      }
      .perm-blocked::after{
        content:"**** ليس لديك صلاحية لعرض هذه البيانات ****";
        position:absolute;
        inset:12px;
        background:rgba(15,23,42,.88);
        color:white;
        border-radius:22px;
        display:flex;
        align-items:center;
        justify-content:center;
        text-align:center;
        padding:20px;
        font-weight:900;
        font-size:18px;
        z-index:20;
      }
      .auth-settings-box{
        margin-top:14px;
        border:1px solid #e2e8f0;
        border-radius:26px;
        padding:16px;
        background:#fff;
        box-shadow:0 18px 48px rgba(15,23,42,.06);
      }
      .auth-employee-card{
        border:1px solid #e5e7eb;
        background:#f8fafc;
        border-radius:18px;
        padding:12px;
        margin-bottom:10px;
        display:flex;
        justify-content:space-between;
        gap:10px;
        align-items:center;
      }
      .auth-perms-grid{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:8px;
        margin-top:10px;
      }
      .auth-check{
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
      .auth-check input{width:18px;height:18px}
      .auth-user-pill{
        display:inline-flex;
        align-items:center;
        gap:7px;
        padding:9px 12px;
        border-radius:999px;
        background:#eff6ff;
        color:#1d4ed8;
        font-size:12px;
        font-weight:900;
        border:1px solid #bfdbfe;
      }
      .auth-logout-btn{
        border:0;
        border-radius:999px;
        background:#fee2e2;
        color:#b91c1c;
        font-weight:900;
        padding:9px 12px;
        font-family:Cairo,Arial,sans-serif;
        cursor:pointer;
      }
      @media(max-width:520px){
        .auth-perms-grid{grid-template-columns:1fr}
        .auth-employee-card{align-items:stretch;flex-direction:column}
      }
    `;
    document.head.appendChild(style);
  }

  function renderLoginScreen() {
    if ($("authLoginScreen")) return;

    const div = document.createElement("div");
    div.id = "authLoginScreen";
    div.className = "auth-login-screen";
    div.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo"><i class="fa-solid fa-lock"></i></div>
        <div class="auth-title">تسجيل الدخول</div>
        <div class="auth-subtitle">أدخل يوزر الدخول الخاص بالمدير أو الموظف</div>

        <form id="authLoginForm">
          <div class="auth-field">
            <label class="auth-label">يوزر الدخول</label>
            <input id="authUsernameInput" class="auth-input" autocomplete="username" placeholder="مثال: 0000" required>
          </div>

          <button class="auth-btn" type="submit">
            <i class="fa-solid fa-right-to-bracket"></i>
            دخول
          </button>
        </form>

        <div class="auth-muted">
          أول دخول للمدير يكون باليوزر الافتراضي 0000، وبعدها غيّره من الإعدادات.
        </div>
      </div>
    `;
    document.body.appendChild(div);

    $("authLoginForm").onsubmit = async (e) => {
      e.preventDefault();
      await loginByUsername($("authUsernameInput").value.trim());
    };
  }

  function showLogin() {
    renderLoginScreen();
    $("authLoginScreen").classList.add("show");
  }

  function hideLogin() {
    $("authLoginScreen")?.classList.remove("show");
  }

  async function ensureAuthDefaults() {
    const snap = await window.get(window.ref(window.db, authPath("settings")));

    if (!snap.exists()) {
      const settings = {
        adminUsername: DEFAULT_ADMIN_PIN,
        updatedAt: Date.now()
      };
      await window.set(window.ref(window.db, authPath("settings")), settings);
      authState.settings = settings;
      return;
    }

    authState.settings = snap.val() || { adminUsername: DEFAULT_ADMIN_PIN };
  }

  function normalizeEmployee(emp = {}) {
    return {
      id: emp.id || uid("emp"),
      name: emp.name || "موظف",
      username: String(emp.username || "").trim(),
      active: emp.active !== false,
      permissions: Array.isArray(emp.permissions) ? emp.permissions : [],
      createdAt: emp.createdAt || Date.now(),
      updatedAt: emp.updatedAt || Date.now()
    };
  }

  async function loadEmployees() {
    const snap = await window.get(window.ref(window.db, authPath("employees")));
    const obj = snap.exists() ? snap.val() || {} : {};
    authState.employees = Object.values(obj).filter(Boolean).map(normalizeEmployee);
  }

  async function loginByUsername(username) {
    if (!username) return toast("أدخل يوزر الدخول");

    if (!navigator.onLine) {
      const session = getSession();

      if (session?.username === username) {
        authState.user = {
          id: session.id,
          name: session.name || "",
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

    const adminUsername = String(authState.settings?.adminUsername || DEFAULT_ADMIN_PIN).trim();

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

    const emp = authState.employees.find(e => e.username === username);

    if (!emp) {
      toast("يوزر الدخول غير صحيح");
      return;
    }

    if (!emp.active) {
      clearSession();
      toast("هذا المستخدم موقوف من المدير");
      showLogin();
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
        name: session.name || "",
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
      const adminUsername = String(authState.settings?.adminUsername || DEFAULT_ADMIN_PIN).trim();

      if (session.username !== adminUsername) {
        clearSession();
        toast("تم تغيير يوزر المدير، سجل دخول من جديد");
        showLogin();
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
      toast("تم حذف أو إيقاف هذا المستخدم من المدير");
      showLogin();
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

  function applyPermissions() {
    const user = authState.user;

    document.body.dataset.authRole = user?.role || "";

    document.querySelectorAll("[data-page]").forEach(btn => {
      const page = btn.dataset.page;
      if (!page) return;

      const allowed = canOpenPage(page);
      btn.style.display = allowed ? "" : "none";
    });

    document.querySelectorAll(".section").forEach(section => {
      const page = section.id?.replace("page-", "");
      if (!page) return;

      section.classList.toggle("perm-blocked", !canOpenPage(page));
    });

    const active = document.querySelector(".section.active");
    const activePage = active?.id?.replace("page-", "");

    if (activePage && !canOpenPage(activePage)) {
      const firstAllowed = PAGES.find(p => canOpenPage(p.id));
      if (firstAllowed) {
        const btn = document.querySelector(`[data-page="${firstAllowed.id}"]`);
        if (btn) btn.click();
      }
    }

    renderAuthTopButton();
    renderAuthSettingsPanel();
  }

  function renderAuthTopButton() {
    const topbar = document.querySelector(".topbar > div:last-child");
    if (!topbar) return;

    let wrap = $("authTopUserBox");

    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "authTopUserBox";
      wrap.style.display = "flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "6px";
      topbar.appendChild(wrap);
    }

    const user = authState.user;

    if (!user) {
      wrap.innerHTML = "";
      return;
    }

    wrap.innerHTML = `
      <span class="auth-user-pill">
        <i class="fa-solid fa-user-shield"></i>
        ${escapeHtml(user.name || (user.role === "admin" ? "المدير" : "موظف"))}
      </span>
      <button id="authLogoutBtn" class="auth-logout-btn" type="button">
        خروج
      </button>
    `;

    $("authLogoutBtn").onclick = () => {
      clearSession();
      authState.user = null;
      showLogin();
      applyPermissions();
    };
  }

  function renderAuthSettingsPanel() {
    const settingsPage = $("page-settings");
    if (!settingsPage) return;

    let box = $("authSettingsBox");

    if (!box) {
      box = document.createElement("div");
      box.id = "authSettingsBox";
      box.className = "auth-settings-box";
      settingsPage.appendChild(box);
    }

    if (!hasPermission("settings")) {
      box.style.display = "none";
      return;
    }

    box.style.display = "";

    const employeesHtml = authState.employees.map(emp => `
      <div class="auth-employee-card">
        <div>
          <b>${escapeHtml(emp.name)}</b>
          <div class="muted">يوزر: ${escapeHtml(emp.username)} · ${emp.active ? "فعال" : "موقوف"}</div>
          <div class="muted" style="font-size:11px">
            صلاحيات: ${(emp.permissions || []).includes("admin") ? "مدير كامل" : escapeHtml((emp.permissions || []).join(", ") || "بدون صلاحيات")}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="ghost-btn" type="button" data-auth-edit-emp="${emp.id}">
            <i class="fa-solid fa-pen"></i> تعديل
          </button>
          <button class="danger-btn" type="button" data-auth-delete-emp="${emp.id}">
            <i class="fa-solid fa-trash"></i> حذف
          </button>
        </div>
      </div>
    `).join("");

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <h2 style="margin:0;font-size:19px;font-weight:900">
          <i class="fa-solid fa-user-shield"></i> تسجيل الدخول والموظفين
        </h2>
        <button id="authAddEmployeeBtn" class="primary-btn" type="button">
          <i class="fa-solid fa-user-plus"></i> إضافة موظف
        </button>
      </div>

      <div class="card" style="box-shadow:none;margin-bottom:12px">
        <div class="form-grid-compact">
          <div>
            <label class="field-label">يوزر المدير</label>
            <input id="authAdminUsernameInput" class="input" value="${escapeHtml(authState.settings?.adminUsername || DEFAULT_ADMIN_PIN)}">
          </div>
          <div>
            <label class="field-label">الحالة</label>
            <input class="input" disabled value="متصل مع Firebase">
          </div>
        </div>

        <button id="authSaveAdminBtn" class="primary-btn" type="button" style="margin-top:12px">
          <i class="fa-solid fa-floppy-disk"></i> حفظ يوزر المدير
        </button>

        <div class="muted" style="font-size:12px;margin-top:8px;line-height:1.8">
          اليوزر الافتراضي أول مرة هو 0000. بعد تغييره، الأجهزة التي تستخدم اليوزر القديم ستخرج عند توفر الإنترنت.
        </div>
      </div>

      <div>
        ${employeesHtml || `<div class="muted" style="text-align:center;padding:18px">لا يوجد موظفين بعد</div>`}
      </div>
    `;

    $("authSaveAdminBtn").onclick = saveAdminUsername;
    $("authAddEmployeeBtn").onclick = () => openEmployeeForm();

    box.querySelectorAll("[data-auth-edit-emp]").forEach(btn => {
      btn.onclick = () => openEmployeeForm(btn.dataset.authEditEmp);
    });

    box.querySelectorAll("[data-auth-delete-emp]").forEach(btn => {
      btn.onclick = () => deleteEmployee(btn.dataset.authDeleteEmp);
    });
  }

  async function saveAdminUsername() {
    if (!navigator.onLine) return toast("تغيير يوزر المدير يحتاج إنترنت");

    const username = $("authAdminUsernameInput")?.value.trim();

    if (!username) return toast("أدخل يوزر المدير");
    if (authState.employees.some(e => e.username === username)) {
      return toast("هذا اليوزر مستخدم لموظف");
    }

    authState.settings = {
      ...(authState.settings || {}),
      adminUsername: username,
      updatedAt: Date.now()
    };

    await window.set(window.ref(window.db, authPath("settings")), authState.settings);

    if (authState.user?.role === "admin") {
      authState.user.username = username;
      saveSession(authState.user);
    }

    renderAuthSettingsPanel();
    toast("تم حفظ يوزر المدير");
  }

  function getEmployeeFormHtml(emp = null) {
    const permissions = emp?.permissions || [];

    const checks = PERMISSIONS.map(p => `
      <label class="auth-check">
        <input type="checkbox" value="${p.key}" ${permissions.includes(p.key) ? "checked" : ""}>
        <span>${escapeHtml(p.label)}</span>
      </label>
    `).join("");

    return `
      <form id="authEmployeeForm">
        <input type="hidden" id="authEmployeeId" value="${escapeHtml(emp?.id || "")}">

        <div class="form-grid-compact">
          <div>
            <label class="field-label">اسم الموظف</label>
            <input id="authEmployeeName" class="input" required value="${escapeHtml(emp?.name || "")}" placeholder="مثال: أحمد">
          </div>

          <div>
            <label class="field-label">يوزر الدخول</label>
            <input id="authEmployeeUsername" class="input" required value="${escapeHtml(emp?.username || "")}" placeholder="مثال: 1234">
          </div>

          <div class="full-row">
            <label class="auth-check" style="background:#ecfdf5">
              <input id="authEmployeeActive" type="checkbox" ${emp?.active === false ? "" : "checked"}>
              <span>الموظف فعال ويستطيع الدخول</span>
            </label>
          </div>
        </div>

        <div style="margin-top:12px">
          <label class="field-label">الصلاحيات</label>
          <div id="authPermsGrid" class="auth-perms-grid">
            ${checks}
          </div>
        </div>

        <button class="primary-btn" type="submit" style="width:100%;margin-top:14px">
          <i class="fa-solid fa-floppy-disk"></i> حفظ الموظف
        </button>
      </form>
    `;
  }

  function openEmployeeForm(empId = "") {
    if (!hasPermission("settings")) return toast("ليس لديك صلاحية");

    const emp = empId ? authState.employees.find(e => e.id === empId) : null;

    if (typeof window.openModal === "function") {
      window.openModal(emp ? "تعديل موظف" : "إضافة موظف", getEmployeeFormHtml(emp), true);
    } else {
      const html = getEmployeeFormHtml(emp);
      document.body.insertAdjacentHTML("beforeend", `<div id="authTempModal">${html}</div>`);
    }

    setTimeout(() => {
      const adminCheck = document.querySelector('#authPermsGrid input[value="admin"]');

      if (adminCheck) {
        adminCheck.addEventListener("change", () => {
          if (adminCheck.checked) {
            document.querySelectorAll("#authPermsGrid input").forEach(input => input.checked = true);
          }
        });
      }

      const form = $("authEmployeeForm");
      if (form) form.onsubmit = saveEmployeeForm;
    }, 50);
  }

  async function saveEmployeeForm(e) {
    e.preventDefault();

    if (!navigator.onLine) return toast("إضافة أو تعديل الموظف يحتاج إنترنت");

    const id = $("authEmployeeId").value || uid("emp");
    const old = authState.employees.find(e => e.id === id);

    const name = $("authEmployeeName").value.trim();
    const username = $("authEmployeeUsername").value.trim();
    const active = $("authEmployeeActive").checked;

    if (!name) return toast("أدخل اسم الموظف");
    if (!username) return toast("أدخل يوزر الدخول");

    const adminUsername = String(authState.settings?.adminUsername || DEFAULT_ADMIN_PIN).trim();

    if (username === adminUsername) {
      return toast("لا يمكن استخدام نفس يوزر المدير");
    }

    const duplicate = authState.employees.find(e => e.id !== id && e.username === username);
    if (duplicate) return toast("يوزر الدخول مستخدم لموظف آخر");

    const permissions = [...document.querySelectorAll("#authPermsGrid input:checked")]
      .map(input => input.value);

    const emp = normalizeEmployee({
      id,
      name,
      username,
      active,
      permissions,
      createdAt: old?.createdAt || Date.now(),
      updatedAt: Date.now()
    });

    await window.set(window.ref(window.db, authPath(`employees/${emp.id}`)), emp);

    const i = authState.employees.findIndex(e => e.id === emp.id);
    if (i >= 0) authState.employees[i] = emp;
    else authState.employees.push(emp);

    if (typeof window.closeModal === "function") window.closeModal();

    renderAuthSettingsPanel();
    toast("تم حفظ الموظف والصلاحيات");
  }

  async function deleteEmployee(empId) {
    if (!navigator.onLine) return toast("حذف الموظف يحتاج إنترنت");

    const emp = authState.employees.find(e => e.id === empId);
    if (!emp) return;

    if (!confirm(`حذف الموظف ${emp.name}؟ سيتم خروجه من الأجهزة عند توفر الإنترنت.`)) return;

    await window.remove(window.ref(window.db, authPath(`employees/${empId}`)));

    authState.employees = authState.employees.filter(e => e.id !== empId);

    renderAuthSettingsPanel();
    toast("تم حذف الموظف");
  }

  function startAuthRealtime() {
    if (authState.listenerStarted) return;
    authState.listenerStarted = true;

    window.onValue(window.ref(window.db, authPath("settings")), async snap => {
      if (!snap.exists()) return;

      authState.settings = snap.val() || { adminUsername: DEFAULT_ADMIN_PIN };

      const session = getSession();

      if (authState.user?.role === "admin") {
        const newAdmin = String(authState.settings.adminUsername || DEFAULT_ADMIN_PIN).trim();

        if (session?.username && session.username !== newAdmin) {
          clearSession();
          authState.user = null;
          toast("تم تغيير يوزر المدير، سجل دخول من جديد");
          showLogin();
          applyPermissions();
          return;
        }
      }

      renderAuthSettingsPanel();
    });

    window.onValue(window.ref(window.db, authPath("employees")), async snap => {
      const obj = snap.exists() ? snap.val() || {} : {};
      authState.employees = Object.values(obj).filter(Boolean).map(normalizeEmployee);

      const session = getSession();

      if (session?.role === "employee") {
        const emp = authState.employees.find(e => e.id === session.id || e.username === session.username);

        if (!emp || !emp.active) {
          clearSession();
          authState.user = null;
          toast("تم حذف أو إيقاف هذا المستخدم من المدير");
          showLogin();
          applyPermissions();
          return;
        }

        const oldPerms = JSON.stringify(authState.user?.permissions || []);
        const newPerms = JSON.stringify(emp.permissions || []);

        authState.user = {
          ...emp,
          role: "employee"
        };

        saveSession(authState.user);

        if (oldPerms !== newPerms) {
          toast("تم تحديث صلاحياتك من المدير");
        }

        hideLogin();
        applyPermissions();
      }

      renderAuthSettingsPanel();
    });
  }

  function protectNavigationClicks() {
    document.addEventListener("click", function (e) {
      const nav = e.target.closest("[data-page]");
      if (!nav) return;

      const page = nav.dataset.page;
      if (!page) return;

      if (!canOpenPage(page)) {
        e.preventDefault();
        e.stopPropagation();
        toast("ليس لديك صلاحية لدخول هذا القسم");
      }
    }, true);
  }

  function protectCriticalButtons() {
    document.addEventListener("click", function (e) {
      if (!authState.user) return;

      const rules = [
        { selector: "#completeSaleBtn", perm: "cashier" },
        { selector: "#completeFreeInvoiceBtn", perm: "freeInvoice" },
        { selector: "#addProductBtn,[data-edit-product],[data-delete-product]", perm: "inventory" },
        { selector: "#addDebtCustomerBtn,[data-delete-customer],[data-pay-customer],[data-add-manual-debt]", perm: "debts" },
        { selector: "#addPurchaseBtn,[data-edit-purchase],[data-delete-purchase]", perm: "purchases" },
        { selector: "#addSupplierPaymentBtn,[data-edit-supplier-payment],[data-delete-supplier-payment]", perm: "supplierPayments" },
        { selector: "#addExpenseBtn,[data-edit-expense],[data-delete-expense]", perm: "expenses" },
        { selector: "#addPaymentAccountBtn,[data-edit-account],[data-delete-account]", perm: "settings" },
        { selector: "#saveSettingsBtn,#clearLocalBtn,#importBackupInput,#exportBackupBtn", perm: "settings" }
      ];

      for (const rule of rules) {
        if (e.target.closest(rule.selector) && !hasPermission(rule.perm)) {
          e.preventDefault();
          e.stopPropagation();
          toast("ليس لديك صلاحية لتنفيذ هذا الإجراء");
          return;
        }
      }
    }, true);
  }

  async function initAuthPatch() {
    injectAuthStyles();
    renderLoginScreen();

    const ok = await waitForApp();

    if (!ok) {
      toast("نظام الصلاحيات لم يجد اتصال التطبيق. تأكد من سطر Object.assign");
      showLogin();
      return;
    }

    getDeviceId();

    if (navigator.onLine) {
      await ensureAuthDefaults();
      await loadEmployees();
      startAuthRealtime();
    }

    protectNavigationClicks();
    protectCriticalButtons();

    await tryAutoLogin();

    window.addEventListener("online", async () => {
      await ensureAuthDefaults();
      await loadEmployees();
      startAuthRealtime();
      await tryAutoLogin();
    });

    window.CashierAuthPermissionsPatch = {
      version: PATCH_VERSION,
      getUser: () => authState.user,
      logout: () => {
        clearSession();
        authState.user = null;
        showLogin();
        applyPermissions();
      },
      reload: async () => {
        await ensureAuthDefaults();
        await loadEmployees();
        await tryAutoLogin();
      }
    };

    console.log("[cashier-auth-permissions-patch] ready", PATCH_VERSION);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuthPatch);
  } else {
    initAuthPatch();
  }
})();
</script>