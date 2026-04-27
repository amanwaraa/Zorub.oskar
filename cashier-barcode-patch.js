/* cashier-barcode-patch.js */
(function () {
  "use strict";

  const PATCH_VERSION = "2026-04-27-html5-qrcode-inventory-units-debts-auth-v2";
  const QR_SOUND_SRC = "./qr.mp3";
  const HTML5_QRCODE_SRC = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";

  const DEFAULT_ADMIN_PIN = "0000";
  const ADMIN_PERMISSION = "__admin__";
  const ADMIN_PROFILE_ID = "admin";

  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const $ = (id) => document.getElementById(id);

  function log(...args) {
    console.log("[cashier-barcode-patch]", PATCH_VERSION, ...args);
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
    clearTimeout(el.__patchToastTimer);
    el.__patchToastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  function cleanNumber(v, fallback = 0) {
    if (typeof window.cleanNumber === "function") return window.cleanNumber(v, fallback);

    const s = String(v ?? "").trim().replace(",", ".");
    if (!s || s === "." || s === "-") return fallback;

    const n = Number(s);
    return Number.isFinite(n) ? n : fallback;
  }

  function money(value) {
    if (typeof window.money === "function") return window.money(value);

    const n = cleanNumber(value);
    const currency = window.state?.settings?.currency || "₪";
    return `${currency} ${n.toFixed(2)}`;
  }

  function uid(prefix = "id") {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function simpleHash(str) {
    const text = String(str || "");
    let h = 2166136261;

    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }

    return String(h >>> 0);
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  function getState() {
    return window.state || null;
  }

  async function waitForApp() {
    for (let i = 0; i < 180; i++) {
      const st = getState();

      if (
        st &&
        Array.isArray(st.products) &&
        Array.isArray(st.cart)
      ) {
        return true;
      }

      await wait(100);
    }

    return false;
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(s => s.src === src || s.src.includes(src));

      if (existing) {
        if (window.Html5Qrcode) {
          resolve(true);
        } else {
          existing.addEventListener("load", () => resolve(true), { once: true });
          existing.addEventListener("error", reject, { once: true });
        }

        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  const scanSound = new Audio(QR_SOUND_SRC);
  scanSound.preload = "auto";
  scanSound.volume = 1;

  function unlockSound() {
    scanSound.play()
      .then(() => {
        scanSound.pause();
        scanSound.currentTime = 0;
      })
      .catch(() => {});
  }

  document.addEventListener("click", unlockSound, { once: true, passive: true });
  document.addEventListener("touchstart", unlockSound, { once: true, passive: true });

  function playScanSound() {
    try {
      scanSound.pause();
      scanSound.currentTime = 0;
      scanSound.play().catch(() => {});
    } catch (e) {
      console.warn(e);
    }
  }

  function vibratePhone() {
    if (navigator.vibrate) navigator.vibrate([55, 25, 55]);
  }

  function getNamespaceFromKnownKey() {
    const keys = Object.keys(localStorage);
    const found = keys.find(k => k.startsWith("cashier_auth_session_") && k.endsWith("_v1"));

    if (found) {
      return found.replace("cashier_auth_session_", "").replace("_v1", "");
    }

    return "";
  }

  function getAuthSessionKey() {
    if (window.AUTH_SESSION_KEY) return window.AUTH_SESSION_KEY;

    const ns = getNamespaceFromKnownKey();
    if (ns) return `cashier_auth_session_${ns}_v1`;

    const projectId = window.CASHIER_FIREBASE_CONFIG?.firebaseConfig?.projectId || "default_project";
    const dbUrl = window.CASHIER_FIREBASE_CONFIG?.firebaseConfig?.databaseURL || "default_database";

    try {
      const encoded = btoa(unescape(encodeURIComponent(`${projectId}_${dbUrl}`)))
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 42) || "default";

      return `cashier_auth_session_${encoded}_v1`;
    } catch {
      return "cashier_auth_session_default_v1";
    }
  }

  function clearAuthSessionPatch() {
    const key = getAuthSessionKey();

    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);

      Object.keys(localStorage).forEach(k => {
        if (k.startsWith("cashier_auth_session_")) {
          localStorage.removeItem(k);
        }
      });

      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith("cashier_auth_session_")) {
          sessionStorage.removeItem(k);
        }
      });

      localStorage.setItem(`${key}_logged_out`, String(Date.now()));
    } catch {}
  }

  function saveAuthSessionPatch(user) {
    const key = getAuthSessionKey();

    try {
      localStorage.removeItem(`${key}_logged_out`);
      localStorage.setItem(key, JSON.stringify({
        id: user.id,
        name: user.name,
        role: user.role,
        permissions: user.permissions || [],
        loginAt: Date.now()
      }));
    } catch {}
  }

  function readAuthSessionPatch() {
    const key = getAuthSessionKey();

    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  }

  function isAdminUser(user = window.state?.auth?.user) {
    return !!user && (user.role === "admin" || (user.permissions || []).includes(ADMIN_PERMISSION));
  }

  function authPages() {
    return [
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
  }

  function hasPermission(pageId) {
    const user = window.state?.auth?.user;

    if (!user) return false;
    if (isAdminUser(user)) return true;

    return Array.isArray(user.permissions) && user.permissions.includes(pageId);
  }

  function activePageId() {
    const active = document.querySelector(".section.active");
    return active?.id?.replace("page-", "") || "home";
  }

  function switchPagePatch(page) {
    if (!hasPermission(page)) {
      toast("ليس لديك صلاحية للدخول إلى هذه الصفحة");
      return;
    }

    if (typeof window.__originalSwitchPage === "function") {
      window.__originalSwitchPage(page);
      return;
    }

    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    $(`page-${page}`)?.classList.add("active");

    document.querySelectorAll(".nav-btn,.bottom-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.page === page);
    });

    $("sidebar")?.classList.remove("open");

    if (typeof window.renderAll === "function") window.renderAll();
  }

  function applyPermissionsUiPatch() {
    const user = window.state?.auth?.user || null;

    const pill = $("authUserPill");
    if (pill) {
      if (user) {
        pill.innerHTML = `
          <i class="fa-solid ${isAdminUser(user) ? "fa-user-shield" : "fa-user"}"></i>
          ${escapeHtml(user.name || "مستخدم")}
        `;
      } else {
        pill.innerHTML = `<i class="fa-solid fa-lock"></i> غير مسجل`;
      }
    }

    document.querySelectorAll(".nav-btn[data-page], .bottom-btn[data-page]").forEach(btn => {
      const page = btn.dataset.page;
      btn.classList.toggle("auth-hidden", !user || !hasPermission(page));
    });

    if ($("adminSecurityBox")) $("adminSecurityBox").style.display = isAdminUser(user) ? "block" : "none";
    if ($("employeesSettingsBox")) $("employeesSettingsBox").style.display = isAdminUser(user) ? "block" : "none";

    if (user && !hasPermission(activePageId())) {
      const first = authPages().find(p => hasPermission(p.id));
      if (first) switchPagePatch(first.id);
    }
  }

  function setAuthUserPatch(user) {
    const st = getState();
    if (!st) return;

    st.auth = st.auth || {};
    st.auth.user = user || null;
    st.auth.ready = true;

    const lock = $("authLock");

    if (user) {
      saveAuthSessionPatch(user);

      if (lock) {
        lock.classList.add("hide");
        lock.style.display = "none";
      }
    } else {
      clearAuthSessionPatch();

      if (lock) {
        lock.classList.remove("hide");
        lock.style.display = "flex";
      }
    }

    applyPermissionsUiPatch();
  }

  function logoutPatch() {
    const st = getState();

    clearAuthSessionPatch();

    if (st) {
      st.auth = st.auth || {};
      st.auth.user = null;
      st.auth.ready = true;
    }

    const lock = $("authLock");
    if (lock) {
      lock.classList.remove("hide");
      lock.style.display = "flex";
    }

    const pill = $("authUserPill");
    if (pill) {
      pill.innerHTML = `<i class="fa-solid fa-lock"></i> غير مسجل`;
    }

    document.querySelectorAll(".nav-btn[data-page], .bottom-btn[data-page]").forEach(btn => {
      btn.classList.add("auth-hidden");
    });

    $("modalBackdrop")?.classList.remove("show");
    $("modalBox")?.classList.remove("large");

    toast("تم تسجيل الخروج");
  }

  function getAdminPasswordHashPatch() {
    const st = getState();
    return st?.settings?.adminPasswordHash || simpleHash(DEFAULT_ADMIN_PIN);
  }

  function normalizeEmployeeAuth(emp = {}) {
    return {
      id: emp.id || uid("emp"),
      name: emp.name || "موظف",
      passwordHash: emp.passwordHash || simpleHash(emp.password || ""),
      permissions: Array.isArray(emp.permissions) ? emp.permissions : [],
      active: emp.active !== false,
      createdAt: emp.createdAt || Date.now(),
      updatedAt: emp.updatedAt || Date.now()
    };
  }

  async function saveEmployeeAuthPatch(employee) {
    const st = getState();
    if (!st) return null;

    employee = normalizeEmployeeAuth(employee);

    if (typeof window.saveLocal === "function") {
      await window.saveLocal("employees", employee, true);
    } else if (typeof window.idbPut === "function") {
      await window.idbPut("employees", employee);
    }

    st.employees = Array.isArray(st.employees) ? st.employees : [];

    const i = st.employees.findIndex(e => e.id === employee.id);
    if (i >= 0) st.employees[i] = employee;
    else st.employees.push(employee);

    if (typeof window.renderAll === "function") window.renderAll();
    renderEmployeesAuthPatch();

    return employee;
  }

  async function deleteEmployeeAuthPatch(employeeId) {
    const st = getState();

    if (!st || !isAdminUser()) {
      toast("إدارة الموظفين للمدير فقط");
      return;
    }

    const emp = (st.employees || []).find(e => e.id === employeeId);
    if (!emp) return;

    if (!confirm(`حذف الموظف ${emp.name}؟ سيتم إخراجه من جهازه عند التحديث أو المزامنة.`)) return;

    st.employees = (st.employees || []).filter(e => e.id !== employeeId);

    if (typeof window.removeLocal === "function") {
      await window.removeLocal("employees", employeeId, true);
    } else if (typeof window.idbDelete === "function") {
      await window.idbDelete("employees", employeeId);
    }

    if (st.auth?.user?.id === employeeId) logoutPatch();

    if (typeof window.renderAll === "function") window.renderAll();
    renderEmployeesAuthPatch();

    toast("تم حذف الموظف");
  }

  function renderEmployeesAuthPatch() {
    const st = getState();
    const box = $("employeesList");

    if (!box || !st) return;

    if (!isAdminUser()) {
      box.innerHTML = `<div class="muted">إدارة الموظفين للمدير فقط</div>`;
      return;
    }

    const pages = authPages();

    box.innerHTML = (st.employees || []).map(emp => {
      const fullAdmin = (emp.permissions || []).includes(ADMIN_PERMISSION);
      const permLabels = fullAdmin
        ? "صلاحيات مدير كاملة"
        : pages
            .filter(p => (emp.permissions || []).includes(p.id))
            .map(p => p.label)
            .join("، ") || "بدون صلاحيات";

      return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;border:1px solid #e5e7eb;border-radius:18px;margin-bottom:8px;background:#fff">
          <div>
            <b>${escapeHtml(emp.name)}</b>
            <div class="muted" style="font-size:12px;line-height:1.8">
              ${escapeHtml(permLabels)}
            </div>
            <span class="badge ${emp.active === false ? "red" : "green"}">
              ${emp.active === false ? "موقوف" : "فعال"}
            </span>
          </div>

          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="ghost-btn" data-auth-edit-employee="${escapeHtml(emp.id)}" type="button">
              <i class="fa-solid fa-pen"></i> تعديل
            </button>

            <button class="danger-btn" data-auth-delete-employee="${escapeHtml(emp.id)}" type="button">
              <i class="fa-solid fa-trash"></i> حذف
            </button>
          </div>
        </div>
      `;
    }).join("") || `<div class="muted">لا يوجد موظفون بعد</div>`;
  }

  function openEmployeeFormAuthPatch(employeeId = "") {
    const st = getState();

    if (!st || !isAdminUser()) {
      toast("إضافة وتعديل الموظفين للمدير فقط");
      return;
    }

    const old = employeeId ? (st.employees || []).find(e => e.id === employeeId) : null;
    const pages = authPages();

    const modalTitle = $("modalTitle");
    const modalBody = $("modalBody");
    const modalBox = $("modalBox");
    const modalBackdrop = $("modalBackdrop");

    if (!modalTitle || !modalBody || !modalBackdrop) {
      toast("نافذة النظام غير موجودة");
      return;
    }

    modalTitle.textContent = old ? "تعديل موظف" : "إضافة موظف";
    if (modalBox) modalBox.classList.add("large");

    modalBody.innerHTML = `
      <form id="authPatchEmployeeForm">
        <input id="authPatchEmployeeId" type="hidden" value="${escapeHtml(old?.id || "")}">

        <div class="form-grid-compact">
          <div>
            <label class="field-label">اسم الموظف</label>
            <input id="authPatchEmployeeName" class="input" required value="${escapeHtml(old?.name || "")}" placeholder="مثال: أحمد">
          </div>

          <div>
            <label class="field-label">كلمة المرور</label>
            <input id="authPatchEmployeePassword" class="input" type="password" ${old ? "" : "required"} placeholder="${old ? "اتركها فارغة إذا لا تريد تغييرها" : "كلمة المرور"}">
          </div>

          <div>
            <label class="field-label">الحالة</label>
            <select id="authPatchEmployeeActive" class="select">
              <option value="true" ${old?.active === false ? "" : "selected"}>فعال</option>
              <option value="false" ${old?.active === false ? "selected" : ""}>موقوف</option>
            </select>
          </div>

          <div>
            <label class="field-label">نوع الصلاحية</label>
            <select id="authPatchEmployeeRole" class="select">
              <option value="employee" ${(old?.permissions || []).includes(ADMIN_PERMISSION) ? "" : "selected"}>موظف بصلاحيات محددة</option>
              <option value="admin" ${(old?.permissions || []).includes(ADMIN_PERMISSION) ? "selected" : ""}>صلاحيات مدير كاملة</option>
            </select>
          </div>
        </div>

        <div id="authPatchPermissionsBox" style="margin-top:14px">
          <label class="field-label">صلاحيات التبويبات</label>
          <div class="employee-grid">
            ${pages.map(p => `
              <label class="perm-card">
                <input type="checkbox" class="auth-patch-perm-check" value="${escapeHtml(p.id)}" ${(old?.permissions || []).includes(p.id) ? "checked" : ""}>
                <span><i class="fa-solid ${escapeHtml(p.icon)}"></i> ${escapeHtml(p.label)}</span>
              </label>
            `).join("")}
          </div>
        </div>

        <button class="primary-btn" type="submit" style="width:100%;margin-top:14px">
          <i class="fa-solid fa-floppy-disk"></i> حفظ الموظف
        </button>
      </form>
    `;

    modalBackdrop.classList.add("show");

    const refreshRole = () => {
      const isAdmin = $("authPatchEmployeeRole")?.value === "admin";
      if ($("authPatchPermissionsBox")) {
        $("authPatchPermissionsBox").style.display = isAdmin ? "none" : "block";
      }
    };

    $("authPatchEmployeeRole").onchange = refreshRole;
    refreshRole();

    $("authPatchEmployeeForm").onsubmit = async (e) => {
      e.preventDefault();

      const name = $("authPatchEmployeeName").value.trim();
      const pass = $("authPatchEmployeePassword").value.trim();
      const active = $("authPatchEmployeeActive").value === "true";
      const role = $("authPatchEmployeeRole").value;

      if (!name) {
        toast("أدخل اسم الموظف");
        return;
      }

      if (!old && !pass) {
        toast("أدخل كلمة مرور للموظف الجديد");
        return;
      }

      const duplicate = (st.employees || []).find(emp =>
        emp.id !== old?.id &&
        String(emp.name || "").trim() === name
      );

      if (duplicate) {
        toast("يوجد موظف بنفس الاسم");
        return;
      }

      let permissions = [];

      if (role === "admin") {
        permissions = [ADMIN_PERMISSION];
      } else {
        permissions = Array.from(document.querySelectorAll(".auth-patch-perm-check:checked")).map(ch => ch.value);

        if (!permissions.length) {
          toast("اختر صلاحية واحدة على الأقل");
          return;
        }
      }

      const employee = normalizeEmployeeAuth({
        ...(old || {}),
        id: old?.id || uid("emp"),
        name,
        passwordHash: pass ? simpleHash(pass) : old?.passwordHash,
        permissions,
        active,
        createdAt: old?.createdAt || Date.now(),
        updatedAt: Date.now()
      });

      await saveEmployeeAuthPatch(employee);

      modalBackdrop.classList.remove("show");
      if (modalBox) modalBox.classList.remove("large");

      toast(old ? "تم تعديل الموظف والصلاحيات" : "تم إضافة الموظف");
    };
  }

  async function changeAdminPasswordAuthPatch() {
    const st = getState();

    if (!st || !isAdminUser()) {
      toast("تغيير كلمة مرور المدير للمدير فقط");
      return;
    }

    const p1Input = $("settingAdminPassword");
    const p2Input = $("settingAdminPassword2");

    const p1 = String(p1Input?.value || "").trim();
    const p2 = String(p2Input?.value || "").trim();

    if (!p1) {
      toast("أدخل كلمة مرور المدير الجديدة");
      p1Input?.focus();
      return;
    }

    if (p1.length < 4) {
      toast("كلمة مرور المدير يجب أن تكون 4 خانات على الأقل");
      p1Input?.focus();
      return;
    }

    if (p1 !== p2) {
      toast("كلمتا المرور غير متطابقتين");
      p2Input?.focus();
      return;
    }

    st.settings = {
      ...(st.settings || {}),
      id: "main",
      adminPasswordHash: simpleHash(p1),
      updatedAt: Date.now()
    };

    if (typeof window.idbPut === "function") {
      await window.idbPut("settings", st.settings);
    }

    if (typeof window.enqueueSync === "function") {
      await window.enqueueSync({
        type: "set",
        store: "settings",
        itemId: "main",
        data: {
          ...st.settings,
          localLogo: "",
          logoMode: st.settings.logo ? "url" : "default"
        }
      });
    } else if (typeof window.saveLocal === "function") {
      await window.saveLocal("settings", st.settings, true);
    }

    if (p1Input) p1Input.value = "";
    if (p2Input) p2Input.value = "";

    toast("تم تغيير كلمة مرور المدير. سجّل الدخول بالكلمة الجديدة.");
    logoutPatch();
  }

  function bindAuthLoginPatch() {
    const adminTab = $("authAdminTab");
    const empTab = $("authEmployeeTab");
    const adminForm = $("adminLoginForm");
    const empForm = $("employeeLoginForm");

    if (!adminTab || !empTab || !adminForm || !empForm) return;

    adminTab.onclick = () => {
      adminTab.classList.add("active");
      empTab.classList.remove("active");
      adminForm.style.display = "block";
      empForm.style.display = "none";
    };

    empTab.onclick = () => {
      empTab.classList.add("active");
      adminTab.classList.remove("active");
      adminForm.style.display = "none";
      empForm.style.display = "block";
    };

    adminForm.onsubmit = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      const pass = $("adminPasswordInput")?.value.trim() || "";

      if (simpleHash(pass) !== getAdminPasswordHashPatch()) {
        toast("كلمة مرور المدير غير صحيحة");
        return;
      }

      if ($("adminPasswordInput")) $("adminPasswordInput").value = "";

      setAuthUserPatch({
        id: ADMIN_PROFILE_ID,
        name: "المدير",
        role: "admin",
        permissions: [ADMIN_PERMISSION]
      });

      toast("تم دخول المدير");
    };

    empForm.onsubmit = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();

      const name = $("employeeNameInput")?.value.trim() || "";
      const pass = $("employeePasswordInput")?.value.trim() || "";

      const st = getState();
      const emp = (st?.employees || []).find(x =>
        x.active !== false &&
        String(x.name || "").trim() === name &&
        x.passwordHash === simpleHash(pass)
      );

      if (!emp) {
        toast("بيانات الموظف غير صحيحة أو الحساب موقوف");
        return;
      }

      if ($("employeePasswordInput")) $("employeePasswordInput").value = "";

      setAuthUserPatch({
        id: emp.id,
        name: emp.name,
        role: (emp.permissions || []).includes(ADMIN_PERMISSION) ? "admin" : "employee",
        permissions: emp.permissions || []
      });

      toast(`أهلاً ${emp.name}`);
    };
  }

  async function restoreAuthSessionPatch() {
    const st = getState();
    if (!st) return;

    const saved = readAuthSessionPatch();

    if (!saved || !saved.id || !saved.loginAt) {
      setAuthUserPatch(null);
      return;
    }

    if (saved.role === "admin" || saved.id === ADMIN_PROFILE_ID) {
      setAuthUserPatch({
        id: ADMIN_PROFILE_ID,
        name: "المدير",
        role: "admin",
        permissions: [ADMIN_PERMISSION]
      });
      return;
    }

    const emp = (st.employees || []).find(e => e.id === saved.id && e.active !== false);

    if (!emp) {
      setAuthUserPatch(null);
      return;
    }

    setAuthUserPatch({
      id: emp.id,
      name: emp.name,
      role: (emp.permissions || []).includes(ADMIN_PERMISSION) ? "admin" : "employee",
      permissions: emp.permissions || []
    });
  }

  async function validateEmployeeSessionPatch() {
    const st = getState();
    const user = st?.auth?.user;

    if (!st || !user || isAdminUser(user)) return true;

    const emp = (st.employees || []).find(e => e.id === user.id);

    if (!emp || emp.active === false) {
      logoutPatch();
      toast("تم إيقاف أو حذف حساب الموظف من المدير");
      return false;
    }

    const oldPerm = JSON.stringify(user.permissions || []);
    const newPerm = JSON.stringify(emp.permissions || []);

    if (oldPerm !== newPerm || user.name !== emp.name) {
      setAuthUserPatch({
        id: emp.id,
        name: emp.name,
        role: (emp.permissions || []).includes(ADMIN_PERMISSION) ? "admin" : "employee",
        permissions: emp.permissions || []
      });

      toast("تم تحديث صلاحيات الموظف");
    }

    return true;
  }

  function patchAuthSystem() {
    window.logout = logoutPatch;
    window.setAuthUser = setAuthUserPatch;
    window.applyPermissionsUI = applyPermissionsUiPatch;
    window.tryRestoreAuthSession = restoreAuthSessionPatch;
    window.validateCurrentEmployeeSession = validateEmployeeSessionPatch;
    window.changeAdminPassword = changeAdminPasswordAuthPatch;
    window.openEmployeeForm = openEmployeeFormAuthPatch;
    window.deleteEmployee = deleteEmployeeAuthPatch;
    window.renderEmployees = renderEmployeesAuthPatch;

    if (typeof window.switchPage === "function" && !window.__originalSwitchPage) {
      window.__originalSwitchPage = window.switchPage;
    }

    window.switchPage = switchPagePatch;

    bindAuthLoginPatch();

    const logoutBtn = $("logoutBtn");
    const topLogoutBtn = $("topLogoutBtn");

    if (logoutBtn) logoutBtn.onclick = logoutPatch;
    if (topLogoutBtn) topLogoutBtn.onclick = logoutPatch;

    const addEmployeeBtn = $("addEmployeeBtn");
    if (addEmployeeBtn) {
      addEmployeeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openEmployeeFormAuthPatch();
      };
    }

    const saveAdminPasswordBtn = $("saveAdminPasswordBtn");
    if (saveAdminPasswordBtn) {
      saveAdminPasswordBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await changeAdminPasswordAuthPatch();
      };
    }

    document.addEventListener("click", async (e) => {
      const logoutClick = e.target.closest("#logoutBtn,#topLogoutBtn");
      if (logoutClick) {
        e.preventDefault();
        e.stopImmediatePropagation();
        logoutPatch();
        return;
      }

      const addEmpClick = e.target.closest("#addEmployeeBtn");
      if (addEmpClick) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openEmployeeFormAuthPatch();
        return;
      }

      const savePassClick = e.target.closest("#saveAdminPasswordBtn");
      if (savePassClick) {
        e.preventDefault();
        e.stopImmediatePropagation();
        await changeAdminPasswordAuthPatch();
        return;
      }

      const editEmp = e.target.closest("[data-auth-edit-employee],[data-edit-employee]");
      if (editEmp) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openEmployeeFormAuthPatch(editEmp.dataset.authEditEmployee || editEmp.dataset.editEmployee);
        return;
      }

      const deleteEmp = e.target.closest("[data-auth-delete-employee],[data-delete-employee]");
      if (deleteEmp) {
        e.preventDefault();
        e.stopImmediatePropagation();
        await deleteEmployeeAuthPatch(deleteEmp.dataset.authDeleteEmployee || deleteEmp.dataset.deleteEmployee);
      }
    }, true);

    restoreAuthSessionPatch();
    applyPermissionsUiPatch();
    renderEmployeesAuthPatch();

    setInterval(() => {
      applyPermissionsUiPatch();
      validateEmployeeSessionPatch();
    }, 4000);
  }

  function ensureScannerStyles() {
    if ($("cashierPatchScannerStyles")) return;

    const style = document.createElement("style");
    style.id = "cashierPatchScannerStyles";
    style.textContent = `
      .patch-camera-page{
        position:fixed;
        inset:0;
        z-index:9999;
        background:#000;
        display:none;
      }

      .patch-camera-page.show{
        display:block;
      }

      #patchHtml5Reader{
        width:100vw;
        height:100vh;
        background:#000;
      }

      #patchHtml5Reader video{
        width:100vw !important;
        height:100vh !important;
        object-fit:cover !important;
      }

      #patchHtml5Reader__scan_region,
      #patchHtml5Reader__dashboard{
        display:none !important;
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
        z-index:10001;
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
        z-index:10002;
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

      .patch-camera-close{
        position:fixed;
        top:16px;
        left:16px;
        z-index:10005;
        width:46px;
        height:46px;
        border:0;
        border-radius:16px;
        background:rgba(15,23,42,.82);
        color:#fff;
        font-size:20px;
        font-weight:900;
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow:0 14px 30px rgba(0,0,0,.3);
      }

      .patch-camera-title{
        position:fixed;
        top:18px;
        right:16px;
        z-index:10005;
        max-width:calc(100vw - 90px);
        padding:10px 14px;
        border-radius:16px;
        background:rgba(15,23,42,.82);
        color:#fff;
        font-weight:900;
        font-family:Cairo,Arial,sans-serif;
        font-size:14px;
      }

      .patch-scan-hint{
        position:fixed;
        right:16px;
        left:16px;
        bottom:24px;
        z-index:10005;
        padding:13px 16px;
        border-radius:18px;
background:rgba(15,23,42,.88);
        color:#fff;
        font-weight:900;
        text-align:center;
        font-family:Cairo,Arial,sans-serif;
        border:1px solid rgba(255,255,255,.14);
      }

      .patch-inventory-summary{
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:12px;
        margin:12px 0;
      }

      .patch-inventory-stat{
        background:#f8fafc;
        border:1px solid #e2e8f0;
        border-radius:22px;
        padding:14px 12px;
        min-height:84px;
        display:flex;
        flex-direction:column;
        justify-content:center;
        gap:7px;
      }

      .patch-inventory-stat span{
        font-size:12px;
        color:#64748b;
        font-weight:900;
      }

      .patch-inventory-stat b{
        font-size:20px;
        color:#1d4ed8;
        direction:ltr;
        text-align:right;
      }

      .patch-inventory-stat.green b{color:#16a34a}
      .patch-inventory-stat.gold b{color:#d97706}
      .patch-inventory-stat.dark b{color:#0f172a}

      @media(max-width:900px){
        .patch-inventory-summary{
          grid-template-columns:repeat(2,minmax(0,1fr));
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureScannerDom() {
    ensureScannerStyles();

    let page = $("patchCameraPage");
    if (page) return page;

    page = document.createElement("div");
    page.id = "patchCameraPage";
    page.className = "patch-camera-page";
    page.innerHTML = `
      <div id="patchHtml5Reader"></div>
      <div class="patch-scan-frame"></div>
      <div class="patch-laser"></div>
      <button id="patchCameraCloseBtn" class="patch-camera-close" type="button">×</button>
      <div id="patchCameraTitle" class="patch-camera-title">قراءة باركود المنتج</div>
      <div id="patchScanHint" class="patch-scan-hint">وجّه الكاميرا نحو الباركود</div>
    `;

    document.body.appendChild(page);

    $("patchCameraCloseBtn").addEventListener("click", stopPatchScanner);

    return page;
  }

  let patchScanner = null;
  let patchRunning = false;
  let patchMode = "sale";
  let patchTargetInputId = "";
  let lastCode = "";
  let lastTime = 0;

  function markDetected() {
    const page = $("patchCameraPage");
    if (!page) return;

    page.classList.add("detected");
    clearTimeout(page.__detectedTimer);

    page.__detectedTimer = setTimeout(() => {
      page.classList.remove("detected");
    }, 550);
  }

  async function stopPatchScanner() {
    const page = $("patchCameraPage");

    if (patchScanner && patchRunning) {
      try {
        await patchScanner.stop();
      } catch {}

      try {
        await patchScanner.clear();
      } catch {}
    }

    patchScanner = null;
    patchRunning = false;

    if (page) page.classList.remove("show");

    const floating = $("floatingScanner");
    if (floating) floating.classList.remove("show");

    try {
      const st = getState();
      if (st?.scanner) {
        st.scanner.locked = false;
        st.scanner.active = false;
      }
    } catch {}
  }

  function getActivePage() {
    const active = document.querySelector(".section.active");
    if (!active) return "";
    return active.id?.replace("page-", "") || "";
  }

  function getProductByBarcodeLocal(code) {
    const st = getState();
    const c = String(code || "").trim();

    if (!st || !c) return null;

    if (typeof window.getProductByBarcode === "function") {
      const p = window.getProductByBarcode(c);
      if (p) return p;
    }

    return (st.products || []).find(p =>
      String(p.barcode || "").trim() === c ||
      String(p.code || "").trim() === c
    ) || null;
  }

  function normalizeProductLocal(p) {
    if (typeof window.normalizeProduct === "function") return window.normalizeProduct(p);
    return p || {};
  }

  function getDefaultSaleUnitLocal(product) {
    if (typeof window.getDefaultSaleUnit === "function") return window.getDefaultSaleUnit(product);

    const p = product || {};
    if (p.unitType === "carton") return "piece";
    if (p.unitType === "kg") return "g";
    if (p.unitType === "liter") return "ml";

    return p.unitType || "piece";
  }

  function getUnitFactorLocal(product, selectedUnit) {
    if (typeof window.getUnitFactor === "function") {
      return cleanNumber(window.getUnitFactor(product, selectedUnit), 1);
    }

    const p = product || {};
    if (selectedUnit === "carton") return cleanNumber(p.cartonUnits || 1, 1);
    if (selectedUnit === "kg") return 1000;
    if (selectedUnit === "liter") return 1000;

    return 1;
  }

  function getUnitTextLocal(product, selectedUnit) {
    if (typeof window.getUnitText === "function") return window.getUnitText(product, selectedUnit);

    const map = {
      piece: "قطعة",
      carton: "كرتونة",
      kg: "كيلو",
      g: "جرام",
      liter: "لتر",
      ml: "مل",
      minutes: "دقائق",
      custom: product?.customUnit || "مخصص"
    };

    return map[selectedUnit] || selectedUnit || "-";
  }

  function priceForLineFixed(product, qtyValue, selectedUnit) {
    const p = normalizeProductLocal(product);
    const qty = Math.max(0, cleanNumber(qtyValue, 0));
    const factor = getUnitFactorLocal(p, selectedUnit);
    const baseQty = qty * factor;
    const unitPrice = cleanNumber(p.salePrice) * factor;
    const unitCost = cleanNumber(p.costPrice) * factor;

    return {
      qty,
      qtyText: String(qty),
      selectedUnit,
      baseQty,
      unitLabel: getUnitTextLocal(p, selectedUnit),
      price: unitPrice,
      costPrice: unitCost,
      total: unitPrice * qty,
      costTotal: unitCost * qty
    };
  }

  function addToCartFixed(product, selectedUnit = "") {
    const st = getState();

    if (!st || !product) return false;

    const p = normalizeProductLocal(product);
    const unit = selectedUnit || getDefaultSaleUnitLocal(p);
    const pricing = priceForLineFixed(p, 1, unit);

    const existing = st.cart.find(x => x.productId === p.id && x.selectedUnit === unit);

    if (existing) {
      const nextQty = cleanNumber(existing.qty, 1) + 1;
      Object.assign(existing, priceForLineFixed(p, nextQty, unit));
    } else {
      st.cart.push({
        id: uid("cart"),
        productId: p.id,
        name: p.name,
        selectedUnit: unit,
        ...pricing
      });
    }

    if (typeof window.renderCart === "function") {
      window.renderCart();
    } else {
      const inputEvent = new Event("input", { bubbles: true });
      $("discountValue")?.dispatchEvent(inputEvent);
    }

    toast(`تمت إضافة ${p.name}`);
    return true;
  }

  function handlePatchScannedCode(code) {
    code = String(code || "").trim();

    if (!code) return;

    markDetected();
    playScanSound();
    vibratePhone();

    const activePage = getActivePage();

    if (patchMode === "product" || patchTargetInputId) {
      const input = $(patchTargetInputId || "productBarcode");

      if (input) {
        input.value = code;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }

      stopPatchScanner();
      toast("تمت قراءة الباركود ووضعه في خانة كود المنتج");
      return;
    }

    if (activePage === "inventory" && $("productBarcode")) {
      $("productBarcode").value = code;
      $("productBarcode").dispatchEvent(new Event("input", { bubbles: true }));
      stopPatchScanner();
      toast("تمت قراءة الباركود ووضعه في خانة كود المنتج");
      return;
    }

    const product = getProductByBarcodeLocal(code);

    if (product) {
      stopPatchScanner();

      if (typeof window.addToCart === "function") {
        try {
          window.addToCart(product);
        } catch {
          addToCartFixed(product);
        }
      } else {
        addToCartFixed(product);
      }

      const search = $("cashierSearch");

      if (search) {
        search.value = "";
        search.dispatchEvent(new Event("input", { bubbles: true }));
      }

      return;
    }

    stopPatchScanner();
    toast("لم يتم العثور على منتج بهذا الباركود");
  }

  async function openPatchScanner(mode = "sale", targetInputId = "") {
    await loadScriptOnce(HTML5_QRCODE_SRC);

    if (!window.Html5Qrcode) {
      toast("تعذر تحميل قارئ الباركود");
      return;
    }

    await stopPatchScanner();

    patchMode = mode || "sale";
    patchTargetInputId = targetInputId || "";

    const page = ensureScannerDom();
    const title = $("patchCameraTitle");
    const hint = $("patchScanHint");

    if (title) {
      title.textContent = patchMode === "product" ? "قراءة باركود المنتج" : "قراءة باركود للبيع";
    }

    if (hint) {
      hint.textContent = patchMode === "product"
        ? "سيتم وضع الرقم في خانة كود المنتج"
        : "سيتم البحث عن المنتج وإضافته للسلة";
    }

    page.classList.add("show");

    try {
      patchScanner = new Html5Qrcode("patchHtml5Reader", {
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

      await patchScanner.start(
        { facingMode: "environment" },
        config,
        (decodedText, decodedResult) => {
          const now = Date.now();
          const code = String(decodedText || "").trim();

          if (!code) return;
          if (code === lastCode && now - lastTime < 1400) return;

          lastCode = code;
          lastTime = now;

          window.dispatchEvent(new CustomEvent("barcode:scanned", {
            detail: {
              code,
              result: decodedResult,
              mode: patchMode,
              targetInputId: patchTargetInputId
            }
          }));

          handlePatchScannedCode(code);
        },
        () => {}
      );

      patchRunning = true;
    } catch (err) {
      console.error(err);
      await stopPatchScanner();
      toast("اسمح باستخدام الكاميرا وتأكد أن الرابط HTTPS");
    }
  }

  function patchScannerButtons() {
    document.addEventListener("click", (e) => {
      const openScannerBtn = e.target.closest("#openScannerBtn");
      if (openScannerBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openPatchScanner("sale");
        return;
      }

      const scanProductBtn = e.target.closest("#scanProductBarcodeBtn");
      if (scanProductBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openPatchScanner("product", "productBarcode");
        return;
      }

      const floatingClose = e.target.closest("#floatingScannerCloseBtn");
      if (floatingClose) {
        e.preventDefault();
        e.stopImmediatePropagation();
        stopPatchScanner();
      }
    }, true);

    window.openScanner = function (mode = "sale", targetInputId = "") {
      return openPatchScanner(mode, targetInputId);
    };

    window.openFloatingProductBarcodeScanner = function (targetInputId = "productBarcode") {
      return openPatchScanner("product", targetInputId);
    };

    window.stopScanner = stopPatchScanner;
    window.stopFloatingScanner = stopPatchScanner;
  }

  function patchManualBarcode() {
    window.openManualBarcode = function () {
      const code = prompt("أدخل الباركود أو كود المنتج");

      if (!code) return;

      const product = getProductByBarcodeLocal(code);

      if (product) {
        addToCartFixed(product);
      } else {
        toast("لم يتم العثور على منتج بهذا الكود");
      }
    };
  }

  function patchCartCalculations() {
    window.priceForLine = priceForLineFixed;

    window.addToCart = function (product, selectedUnit = "") {
      return addToCartFixed(product, selectedUnit);
    };

    window.updateCartLine = function (lineId, patch = {}, rerender = true) {
      const st = getState();

      if (!st) return;

      const line = st.cart.find(x => x.id === lineId);
      if (!line) return;

      Object.assign(line, patch);

      const product = (st.products || []).find(p => p.id === line.productId);

      if (!product) {
        if (rerender && typeof window.renderCart === "function") window.renderCart();
        return;
      }

      const selectedUnit = line.selectedUnit || getDefaultSaleUnitLocal(product);
      const qty = cleanNumber(line.qty, 0);

      Object.assign(line, priceForLineFixed(product, qty, selectedUnit));

      if (rerender && typeof window.renderCart === "function") {
        window.renderCart();
      } else if (typeof window.calculateCartTotals === "function") {
        const totals = window.calculateCartTotals();

        if ($("cartSubtotal")) $("cartSubtotal").textContent = money(totals.subtotal);
        if ($("cartDiscount")) $("cartDiscount").textContent = money(totals.discount);
        if ($("cartTotal")) $("cartTotal").textContent = money(totals.total);

        const row = document.querySelector(`[data-cart-line="${CSS.escape(lineId)}"]`);
        if (row) {
          const totalEl = row.querySelector(".line-total");
          if (totalEl) totalEl.textContent = money(line.total);
        }
      }
    };

    document.addEventListener("input", (e) => {
      const qtyInput = e.target.closest("[data-change-cart-qty]");
      if (!qtyInput) return;

      const st = getState();
      if (!st) return;

      const line = st.cart.find(x => x.id === qtyInput.dataset.changeCartQty);
      if (!line) return;

      e.stopImmediatePropagation();
      window.updateCartLine(line.id, { qty: qtyInput.value }, false);
    }, true);

    document.addEventListener("change", (e) => {
      const unitInput = e.target.closest("[data-change-cart-unit]");
      if (!unitInput) return;

      const st = getState();
      if (!st) return;

      const line = st.cart.find(x => x.id === unitInput.dataset.changeCartUnit);
      if (!line) return;

      e.stopImmediatePropagation();
      window.updateCartLine(line.id, { selectedUnit: unitInput.value }, true);
    }, true);
  }
function calculateInventorySummary() {
    const st = getState();
    const products = st?.products || [];

    return products.reduce((acc, p) => {
      const product = normalizeProductLocal(p);
      const stock = cleanNumber(product.stock);
      const cost = cleanNumber(product.costPrice);
      const sale = cleanNumber(product.salePrice);

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

  function renderInventorySummary() {
    const page = $("page-inventory");
    if (!page) return;

    let box = $("patchInventorySummary");
    const card = page.querySelector(".card");

    if (!box) {
      box = document.createElement("div");
      box.id = "patchInventorySummary";
      box.className = "patch-inventory-summary";

      if (card) {
        card.parentNode.insertBefore(box, card);
      } else {
        page.appendChild(box);
      }
    }

    const s = calculateInventorySummary();

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

  function patchRenderAllAndInventory() {
    const oldRenderAll = window.renderAll;

    if (typeof oldRenderAll === "function" && !window.__barcodePatchRenderAllWrapped) {
      window.__barcodePatchRenderAllWrapped = true;

      window.renderAll = function (...args) {
        const r = oldRenderAll.apply(this, args);
        setTimeout(renderInventorySummary, 0);
        setTimeout(applyPermissionsUiPatch, 0);
        setTimeout(renderEmployeesAuthPatch, 0);
        return r;
      };
    }

    const oldRenderInventory = window.renderInventory;

    if (typeof oldRenderInventory === "function" && !window.__barcodePatchInventoryWrapped) {
      window.__barcodePatchInventoryWrapped = true;

      window.renderInventory = function (...args) {
        const r = oldRenderInventory.apply(this, args);
        setTimeout(renderInventorySummary, 0);
        return r;
      };
    }

    setInterval(renderInventorySummary, 2500);
    renderInventorySummary();
  }

  function normalizeName(name) {
    return String(name || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function isDuplicateCustomerName(name, exceptId = "") {
    const st = getState();
    const n = normalizeName(name);

    if (!n || !st) return false;

    return (st.customers || []).some(c =>
      c.id !== exceptId &&
      normalizeName(c.name) === n
    );
  }

  function patchDebtDuplicateProtection() {
    document.addEventListener("submit", (e) => {
      const form = e.target;

      if (!form) return;

      if (form.id === "debtCustomerForm") {
        const id = $("debtCustomerId")?.value || "";
        const name = $("debtCustomerName")?.value || "";

        if (isDuplicateCustomerName(name, id)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          toast("اسم الزبون موجود مسبقًا، لا يمكن إضافته مرتين");
        }
      }

      if (form.id === "quickDebtCustomerForm") {
        const name = $("quickDebtCustomerName")?.value || "";
        const phone = $("quickDebtCustomerPhone")?.value || "";
        const st = getState();

        const existing = (st?.customers || []).find(c =>
          normalizeName(c.name) === normalizeName(name) ||
          (phone.trim() && String(c.phone || "").trim() === phone.trim())
        );

        if (existing) {
          e.preventDefault();
          e.stopImmediatePropagation();

          toast("الزبون موجود مسبقًا، اختره من القائمة بدل إضافته مرة ثانية");

          const listItem = document.querySelector(`[data-select-debt-customer="${CSS.escape(existing.id)}"]`);
          if (listItem) listItem.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }, true);

    const oldEnsureCustomer = window.ensureCustomer;

    window.ensureCustomer = function (name, phone) {
      const st = getState();
      const n = normalizeName(name);
      const p = String(phone || "").trim();

      const existing = (st?.customers || []).find(c =>
        (p && String(c.phone || "").trim() === p) ||
        (n && normalizeName(c.name) === n)
      );

      if (existing) {
        existing.name = name || existing.name;
        existing.phone = phone || existing.phone;
        existing.updatedAt = Date.now();
        return existing;
      }

      if (typeof oldEnsureCustomer === "function") return oldEnsureCustomer(name, phone);

      const customer = {
        id: uid("cus"),
        name: name || "زبون",
        phone,
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

      if (st) {
        st.customers = Array.isArray(st.customers) ? st.customers : [];
        st.customers.push(customer);
      }

      if (typeof window.saveLocal === "function") {
        window.saveLocal("customers", customer, true);
      }

      return customer;
    };
  }

  function exposeModuleFunctionsIfHidden() {
    const scriptText = [...document.scripts]
      .filter(s => s.type === "module")
      .map(s => s.textContent || "")
      .join("\n");

    if (!scriptText.includes("const state =") && !scriptText.includes("function addToCart")) return;

    const patch = document.createElement("script");
    patch.type = "module";
    patch.textContent = `
      try {
        if (typeof state !== "undefined") window.state = state;
        if (typeof cleanNumber !== "undefined") window.cleanNumber = cleanNumber;
        if (typeof money !== "undefined") window.money = money;
        if (typeof toast !== "undefined") window.toast = toast;
        if (typeof renderAll !== "undefined") window.renderAll = renderAll;
        if (typeof renderCart !== "undefined") window.renderCart = renderCart;
        if (typeof renderInventory !== "undefined") window.renderInventory = renderInventory;
        if (typeof calculateCartTotals !== "undefined") window.calculateCartTotals = calculateCartTotals;
        if (typeof getProductByBarcode !== "undefined") window.getProductByBarcode = getProductByBarcode;
        if (typeof normalizeProduct !== "undefined") window.normalizeProduct = normalizeProduct;
        if (typeof getDefaultSaleUnit !== "undefined") window.getDefaultSaleUnit = getDefaultSaleUnit;
        if (typeof getUnitFactor !== "undefined") window.getUnitFactor = getUnitFactor;
        if (typeof getUnitText !== "undefined") window.getUnitText = getUnitText;
        if (typeof saveLocal !== "undefined") window.saveLocal = saveLocal;
        if (typeof removeLocal !== "undefined") window.removeLocal = removeLocal;
        if (typeof idbPut !== "undefined") window.idbPut = idbPut;
        if (typeof idbDelete !== "undefined") window.idbDelete = idbDelete;
        if (typeof enqueueSync !== "undefined") window.enqueueSync = enqueueSync;
        if (typeof ensureCustomer !== "undefined") window.ensureCustomer = ensureCustomer;
        if (typeof addToCart !== "undefined") window.addToCart = addToCart;
        if (typeof switchPage !== "undefined") window.switchPage = switchPage;
        window.dispatchEvent(new CustomEvent("cashier:module-exported"));
      } catch (e) {
        console.warn("cashier module export failed", e);
      }
    `;

    document.body.appendChild(patch);
  }

  function removeOldBrokenAuthPatchIfFound() {
    document.querySelectorAll("script").forEach(s => {
      const txt = s.textContent || "";
      if (txt.includes("fix-auth-buttons-index-inline.js")) {
        console.warn("تم العثور على باتش مصادقة قديم داخل الصفحة. يفضّل حذفه من HTML لمنع التضارب.");
      }
    });
  }

  async function init() {
    log("loading");

    removeOldBrokenAuthPatchIfFound();
    exposeModuleFunctionsIfHidden();

    const ok = await waitForApp();

    if (!ok) {
      console.warn("cashier-barcode-patch: لم أجد state الخاصة بالتطبيق. تأكد أن الباتش بعد كود التطبيق.");
      toast("ملف الباتش لازم يكون بعد كود التطبيق الأصلي");
      return;
    }

    await loadScriptOnce(HTML5_QRCODE_SRC);

    patchAuthSystem();
    patchScannerButtons();
    patchManualBarcode();
    patchCartCalculations();
    patchRenderAllAndInventory();
    patchDebtDuplicateProtection();

    window.CashierBarcodePatch = {
      version: PATCH_VERSION,
      openScanner: openPatchScanner,
      stopScanner: stopPatchScanner,
      renderInventorySummary,
      logout: logoutPatch,
      setAuthUser: setAuthUserPatch,
      changeAdminPassword: changeAdminPasswordAuthPatch,
      openEmployeeForm: openEmployeeFormAuthPatch
    };

    log("ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && patchRunning) stopPatchScanner();
  });

  window.addEventListener("beforeunload", () => {
    if (patchRunning) stopPatchScanner();
  });
})();