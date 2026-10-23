const currency = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  maximumFractionDigits: 2,
});
const loginCard = document.querySelector("#login-card");
const dashboard = document.querySelector("#dashboard");
const loginMessage = document.querySelector("#login-message");
let currentUserId = null;
let currentRole = null;
let dashboardRefreshTimer = null;
let demoAccessAvailable = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function money(cents) {
  return currency.format(cents / 100);
}

function showError(message) {
  const panel = document.querySelector("#dashboard-error");
  panel.textContent = message;
  panel.classList.remove("hidden");
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Не вдалося виконати запит.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function setVisible(id, visible) {
  document.querySelector(id).classList.toggle("hidden", !visible);
}

async function showDashboard(user) {
  currentRole = user.role;
  loginCard.classList.add("hidden");
  setVisible("#quick-access", false);
  setVisible("#role-previews", false);
  dashboard.classList.remove("hidden");
  document.querySelector("#staff-name").textContent = user.name;
  document.querySelector("#role-badge").textContent = user.role_label;
  document.querySelector("#work-status-select").value = user.work_status || "На роботі";
  const descriptions = {
    director: "У вас повний доступ до управління магазином і командою.",
    accountant: "Тут доступні лише фінансові показники та облік оплат.",
    inventory: "Тут доступні товари, ціни й залишки на складі.",
  };
  document.querySelector("#role-description").textContent = descriptions[user.role];

  const tabs = {
    director: [
      { id: "finance-section", label: "Фінанси" },
      { id: "inventory-section", label: "Товари" },
      { id: "team-section", label: "Працівники" },
      { id: "status-history-section", label: "Історія статусів" },
      { id: "suppliers-section", label: "Постачальники" },
      { id: "support-section", label: "Підтримка" },
    ],
    accountant: [{ id: "finance-section", label: "Фінанси" }],
    inventory: [{ id: "inventory-section", label: "Товари" }],
  };
  const allowedTabs = tabs[user.role];
  document.querySelector("#dashboard-tabs").innerHTML = allowedTabs.map((tab, index) => `
    <button class="dashboard-tab" type="button" data-dashboard-tab="${tab.id}" aria-selected="${index === 0}">
      ${tab.label}
    </button>
  `).join("");
  document.querySelectorAll(".dashboard-section:not(#password-section)").forEach((section) => {
    section.classList.add("hidden");
  });
  setVisible(`#${allowedTabs[0].id}`, true);
  setVisible("#password-section", true);

  const tasks = [];
  if (user.role === "director" || user.role === "accountant") {
    tasks.push(loadFinance());
  }
  if (user.role === "director" || user.role === "inventory") {
    tasks.push(loadProducts());
  }
  if (user.role === "director") tasks.push(loadStaff());
  if (user.role === "director") tasks.push(loadStatusHistory(), loadSuppliers(), loadSupport());
  const results = await Promise.allSettled(tasks);
  const errors = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason.message);
  if (errors.length) showError(errors.join(" "));
  window.clearInterval(dashboardRefreshTimer);
  dashboardRefreshTimer = window.setInterval(refreshDashboardData, 15_000);
}

function activateDashboardTab(sectionId) {
  const target = document.querySelector(`#${sectionId}`);
  if (!target || !document.querySelector(`[data-dashboard-tab="${sectionId}"]`)) return;
  document.querySelectorAll(".dashboard-section:not(#password-section)").forEach((section) => {
    section.classList.toggle("hidden", section !== target);
  });
  document.querySelectorAll("[data-dashboard-tab]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.dashboardTab === sectionId));
  });
  refreshDashboardData();
}

async function refreshDashboardData() {
  if (document.hidden || dashboard.classList.contains("hidden")) return;
  const activeTab = document.querySelector('[data-dashboard-tab][aria-selected="true"]')?.dataset.dashboardTab;
  if (activeTab && document.querySelector(`#${activeTab} [data-unsaved="true"]`)) return;
  const tasks = [];
  if (activeTab === "finance-section") tasks.push(loadFinance());
  if (activeTab === "inventory-section") tasks.push(loadProducts());
  if (activeTab === "team-section" && currentRole === "director") tasks.push(loadStaff());
  if (activeTab === "status-history-section" && currentRole === "director") tasks.push(loadStatusHistory());
  if (activeTab === "suppliers-section" && currentRole === "director") tasks.push(loadSuppliers());
  if (activeTab === "support-section" && currentRole === "director") tasks.push(loadSupport());
  const results = await Promise.allSettled(tasks);
  const errors = results
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason.message);
  if (errors.length) showError(errors.join(" "));
}

async function loadFinance() {
  const [overview, result] = await Promise.all([
    api("/api/admin/overview"),
    api("/api/admin/orders"),
  ]);
  const stats = overview.financials;
  document.querySelector("#stat-orders").textContent = stats.order_count;
  document.querySelector("#stat-revenue").textContent = money(stats.revenue);
  document.querySelector("#stat-paid").textContent = money(stats.paid);
  document.querySelector("#stat-due").textContent = money(stats.due);
  const tbody = document.querySelector("#orders-body");
  const director = currentRole === "director";
  document.querySelector("#orders-description").textContent = director
    ? "Замовлення, покупці та керування виконанням"
    : "Лише суми, дати й оплати — без персональних даних";
  document.querySelector("#orders-head").innerHTML = `
    <tr>
      <th>Замовлення</th>
      ${director ? "<th>Покупець</th><th>Виконання</th>" : ""}
      <th>Дата</th><th>Сума</th><th>Оплата</th><th>Дія</th>
    </tr>
  `;
  document.querySelector("#empty-orders").classList.toggle("hidden", result.orders.length > 0);
  const orderStatuses = ["Нове", "Комплектується", "Доставляється", "Виконано"];
  tbody.innerHTML = result.orders.map((order) => {
    const buyer = director
      ? `<td><strong>${escapeHtml(order.customer_name)}</strong><br><small>${escapeHtml(order.phone)}<br>${escapeHtml(order.city || "Київ")}, ${escapeHtml(order.address)}</small></td>
         <td><div class="order-status-control">
           <select aria-label="Статус замовлення №${order.id}" data-order-status="${order.id}">
             ${orderStatuses.map((status) => `<option ${order.status === status ? "selected" : ""}>${status}</option>`).join("")}
           </select>
           <button class="table-action" type="button" data-order-status-save="${order.id}">Зберегти</button>
         </div></td>`
      : "";
    return `
      <tr>
        <td><strong>№ ${order.id}</strong></td>
        ${buyer}
        <td>${escapeHtml(formatDate(order.created_at))}</td>
        <td><strong>${money(order.total)}</strong></td>
        <td><span class="payment-badge ${order.payment_status === "Оплачено" ? "paid" : "due"}">${escapeHtml(order.payment_status)}</span></td>
        <td><button class="table-action" type="button" data-payment-id="${order.id}" data-payment-status="${escapeHtml(order.payment_status)}">${order.payment_status === "Оплачено" ? "Скасувати оплату" : "Позначити оплаченим"}</button></td>
      </tr>
    `;
  }).join("");
}

async function loadProducts() {
  const result = await api("/api/admin/products");
  document.querySelector("#products-body").innerHTML = result.products.map((product) => `
    <tr data-product="${escapeHtml(product.sku)}">
      <td><strong>${escapeHtml(product.name)}</strong></td>
      <td>${escapeHtml(product.category_name)}</td>
      <td><select class="supplier-select" aria-label="Постачальник ${escapeHtml(product.name)}">
        <option value="">Не обрано</option>
        ${result.suppliers.map((supplier) => `<option value="${supplier.id}" ${supplier.id === product.supplier_id ? "selected" : ""}>${escapeHtml(supplier.name)}</option>`).join("")}
      </select></td>
      <td><label class="inline-field"><input aria-label="Ціна ${escapeHtml(product.name)}" type="number" min="0" step="0.01" value="${(product.price / 100).toFixed(2)}"><span>₴ / ${escapeHtml(product.unit)}</span></label></td>
      <td><label class="inline-field stock-field"><input aria-label="Залишок ${escapeHtml(product.name)}" type="number" min="0" max="100000" step="1" value="${product.stock}"><span>${escapeHtml(product.unit)}</span></label></td>
      <td><button class="table-action" type="button" data-save-product="${escapeHtml(product.sku)}">Зберегти</button></td>
    </tr>
  `).join("");
}

async function loadStaff() {
  const result = await api("/api/admin/users");
  document.querySelector("#staff-body").innerHTML = result.users.map((user) => `
    <tr data-staff-id="${user.id}" data-staff-active="${user.active}">
      <td><strong>${escapeHtml(user.name)}</strong></td>
      <td>${escapeHtml(user.username)}</td>
      <td><select class="staff-role-select" aria-label="Роль ${escapeHtml(user.name)}">
        <option value="director" ${user.role === "director" ? "selected" : ""}>Директор</option>
        <option value="accountant" ${user.role === "accountant" ? "selected" : ""}>Бухгалтер</option>
        <option value="inventory" ${user.role === "inventory" ? "selected" : ""}>Працівник складу</option>
      </select></td>
      <td><span class="payment-badge ${user.work_status === "На роботі" ? "paid" : "due"}">${escapeHtml(user.work_status || "На роботі")}</span></td>
      <td><span class="payment-badge ${user.active ? "paid" : "due"}">${user.active ? "Активний" : "Вимкнений"}</span></td>
      <td><button class="table-action" type="button" data-save-staff="${user.id}" ${user.id === currentUserId ? "disabled" : ""}>${user.active ? "Зберегти / вимкнути" : "Зберегти / відновити"}</button></td>
    </tr>
  `).join("");
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours} год ${minutes} хв`;
}

async function loadStatusHistory() {
  const result = await api("/api/admin/status-history");
  const body = document.querySelector("#status-history-body");
  document.querySelector("#empty-status-history").classList.toggle("hidden", result.history.length > 0);
  body.innerHTML = result.history.map((entry) => `
    <tr><td><strong>${escapeHtml(entry.name)}</strong><br><small>${escapeHtml(entry.username)}</small></td>
      <td><span class="payment-badge ${entry.status === "На роботі" ? "paid" : "due"}">${escapeHtml(entry.status)}</span></td>
      <td>${escapeHtml(formatDate(entry.changed_at))}</td><td>${formatDuration(entry.work_seconds)}</td></tr>
  `).join("");
}

async function loadSuppliers() {
  const result = await api("/api/admin/suppliers");
  const body = document.querySelector("#suppliers-body");
  const activeSuppliers = result.suppliers.filter((supplier) => supplier.active);
  document.querySelector("#empty-suppliers").classList.toggle("hidden", activeSuppliers.length > 0);
  body.innerHTML = activeSuppliers.map((supplier) => `
    <tr><td><strong>${escapeHtml(supplier.name)}</strong>${supplier.notes ? `<br><small>${escapeHtml(supplier.notes)}</small>` : ""}</td>
      <td>${escapeHtml(supplier.contact_name || "—")}</td><td>${escapeHtml(supplier.phone || "—")}</td>
      <td>${escapeHtml(supplier.email || "—")}</td><td>${escapeHtml(supplier.address || "—")}</td></tr>
  `).join("");
}

async function loadSupport() {
  const result = await api("/api/admin/support");
  const body = document.querySelector("#support-body");
  document.querySelector("#empty-support").classList.toggle("hidden", result.messages.length > 0);
  body.innerHTML = result.messages.map((message) => `
    <tr><td>${escapeHtml(formatDate(message.created_at))}</td>
      <td><strong>${escapeHtml(message.name)}</strong><br><small>${escapeHtml(message.email)}</small></td>
      <td><strong>${escapeHtml(message.subject)}</strong><br><small class="support-message-text">${escapeHtml(message.message)}</small></td>
      <td><select aria-label="Статус звернення ${message.id}" data-support-status="${message.id}">
        ${["Нове", "У роботі", "Відповіли"].map((status) => `<option ${message.status === status ? "selected" : ""}>${status}</option>`).join("")}
      </select></td>
      <td><button class="table-action" type="button" data-save-support="${message.id}">Зберегти</button></td></tr>
  `).join("");
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  loginMessage.textContent = "";
  try {
    const values = new FormData(form);
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: values.get("username"),
        password: values.get("password"),
      }),
    });
    currentUserId = result.user.id;
    await showDashboard(result.user);
  } catch (error) {
    loginMessage.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    window.clearInterval(dashboardRefreshTimer);
    dashboard.classList.add("hidden");
    loginCard.classList.remove("hidden");
    setVisible("#quick-access", demoAccessAvailable);
    setVisible("#role-previews", true);
    document.querySelector("#login-form").reset();
  } catch (error) {
    showError(error.message);
  }
});

document.querySelector("#orders-body").addEventListener("click", async (event) => {
  const statusButton = event.target.closest("[data-order-status-save]");
  if (statusButton) {
    const status = document.querySelector(
      `[data-order-status="${statusButton.dataset.orderStatusSave}"]`,
    ).value;
    statusButton.disabled = true;
    try {
      await api(`/api/admin/orders/${statusButton.dataset.orderStatusSave}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      statusButton.closest("tr").removeAttribute("data-unsaved");
      statusButton.textContent = "Збережено ✓";
      setTimeout(() => { statusButton.textContent = "Зберегти"; }, 1600);
    } catch (error) {
      showError(error.message);
    } finally {
      statusButton.disabled = false;
    }
    return;
  }
  const button = event.target.closest("[data-payment-id]");
  if (!button) return;
  button.disabled = true;
  const status = button.dataset.paymentStatus === "Оплачено" ? "Очікує оплати" : "Оплачено";
  try {
    await api(`/api/admin/orders/${button.dataset.paymentId}`, {
      method: "PATCH",
      body: JSON.stringify({ payment_status: status }),
    });
    await loadFinance();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#products-body").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-product]");
  if (!button) return;
  const row = button.closest("tr");
  const [priceInput, stockInput] = row.querySelectorAll('input[type="number"]');
  const price = Math.round(Number(priceInput.value) * 100);
  const stock = Number(stockInput.value);
  const supplierValue = row.querySelector(".supplier-select").value;
  const supplierId = supplierValue ? Number(supplierValue) : null;
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0
    || (supplierValue && !Number.isInteger(supplierId))) {
    showError("Вкажіть коректні постачальника, ціну та залишок.");
    return;
  }
  button.disabled = true;
  try {
    await api(`/api/admin/products/${button.dataset.saveProduct}`, {
      method: "PATCH",
      body: JSON.stringify({ price, stock, supplier_id: supplierId }),
    });
    row.removeAttribute("data-unsaved");
    button.textContent = "Збережено ✓";
    setTimeout(() => { button.textContent = "Зберегти"; }, 1600);
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#staff-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector("#staff-message");
  const button = form.querySelector('[type="submit"]');
  message.textContent = "";
  button.disabled = true;
  const values = new FormData(form);
  try {
    await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        name: values.get("name"),
        username: values.get("username"),
        role: values.get("role"),
        password: values.get("password"),
      }),
    });
    form.reset();
    message.textContent = "Працівника успішно додано.";
    const refreshTasks = [loadStaff()];
    if (demoAccessAvailable) refreshTasks.push(loadQuickAccess());
    await Promise.all(refreshTasks);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#supplier-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const message = document.querySelector("#supplier-message");
  const values = new FormData(form);
  message.textContent = "";
  button.disabled = true;
  try {
    await api("/api/admin/suppliers", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(values)),
    });
    form.reset();
    message.textContent = "Постачальника додано.";
    await Promise.all([loadSuppliers(), loadProducts()]);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector("#password-message");
  const button = form.querySelector('[type="submit"]');
  message.textContent = "";
  button.disabled = true;
  const values = new FormData(form);
  try {
    await api("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({
        current_password: values.get("current_password"),
        new_password: values.get("new_password"),
      }),
    });
    form.reset();
    dashboard.classList.add("hidden");
    loginCard.classList.remove("hidden");
    setVisible("#quick-access", demoAccessAvailable);
    document.querySelector("#login-form").reset();
    loginMessage.textContent = "Пароль змінено. Увійдіть з новим паролем.";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

api("/api/auth/me")
  .then(({ user }) => {
    currentUserId = user.id;
    return showDashboard(user);
  })
  .catch(() => {});

document.querySelector("#dashboard-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-dashboard-tab]");
  if (button) activateDashboardTab(button.dataset.dashboardTab);
});

for (const tableSelector of ["#orders-body", "#products-body", "#staff-body"]) {
  document.querySelector(tableSelector).addEventListener("change", (event) => {
    event.target.closest("tr")?.setAttribute("data-unsaved", "true");
  });
}

document.querySelector("#save-work-status").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const workStatus = document.querySelector("#work-status-select").value;
    const result = await api("/api/auth/status", {
      method: "PATCH",
      body: JSON.stringify({ work_status: workStatus }),
    });
    button.textContent = "Збережено ✓";
    if (currentRole === "director") await loadStaff();
    window.setTimeout(() => { button.textContent = "Зберегти статус"; }, 1600);
    document.querySelector("#work-status-select").value = result.work_status;
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#staff-body").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-staff]");
  if (!button) return;
  const row = button.closest("tr");
  const nextActive = row.dataset.staffActive !== "true";
  button.disabled = true;
  try {
    await api(`/api/admin/users/${button.dataset.saveStaff}`, {
      method: "PATCH",
      body: JSON.stringify({
        role: row.querySelector(".staff-role-select").value,
        active: nextActive,
      }),
    });

    document.querySelector("#support-body").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-save-support]");
      if (!button) return;
      const row = button.closest("tr");
      button.disabled = true;
      try {
        await api(`/api/admin/support/${button.dataset.saveSupport}`, {
          method: "PATCH",
          body: JSON.stringify({ status: row.querySelector("[data-support-status]").value }),
        });
        row.removeAttribute("data-unsaved");
        button.textContent = "Збережено ✓";
        window.setTimeout(() => { button.textContent = "Зберегти"; }, 1600);
      } catch (error) {
        showError(error.message);
      } finally {
        button.disabled = false;
      }
    });
    await loadStaff();
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
  }
});

async function loadQuickAccess() {
  const result = await api("/api/demo/staff");
  if (!result.enabled) {
    demoAccessAvailable = false;
    setVisible("#quick-access", false);
    return;
  }
  demoAccessAvailable = true;
  setVisible("#quick-access", true);
  const list = document.querySelector("#quick-access-list");
  list.innerHTML = result.staff.length
    ? result.staff.map((user) => `
      <article class="quick-access-card">
        <div class="quick-access-avatar" aria-hidden="true">${escapeHtml(user.name.trim().charAt(0).toLocaleUpperCase("uk"))}</div>
        <div class="quick-access-copy">
          <strong>${escapeHtml(user.name)}</strong>
          <span>${escapeHtml(user.username)} · ${escapeHtml(user.role_label)}</span>
        </div>
        <button class="button button-outline button-small" type="button" data-demo-user="${user.id}" ${user.active ? "" : "disabled"}>${user.active ? "Відкрити профіль ↗" : "Доступ вимкнено"}</button>
      </article>
    `).join("")
    : '<div class="quick-access-empty">Працівників ще не додано. Спочатку увійдіть як директор і створіть профілі.</div>';
}

document.querySelector("#quick-access-list").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-demo-user]");
  if (!button) return;
  const message = document.querySelector("#quick-access-message");
  button.disabled = true;
  message.textContent = "";
  try {
    const result = await api("/api/demo/login", {
      method: "POST",
      body: JSON.stringify({ user_id: Number(button.dataset.demoUser) }),
    });
    currentUserId = result.user.id;
    await showDashboard(result.user);
  } catch (error) {
    message.textContent = error.message;
    button.disabled = false;
  }
});

loadQuickAccess().catch((error) => {
  const section = document.querySelector("#quick-access");
  const message = document.querySelector("#quick-access-message");
  message.textContent = error.message;
});
