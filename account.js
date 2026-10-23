const customerCurrency = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  maximumFractionDigits: 2,
});
const authPanel = document.querySelector("#customer-auth");
const dashboard = document.querySelector("#customer-dashboard");
const loginForm = document.querySelector("#customer-login-form");
const registerForm = document.querySelector("#customer-register-form");
const orderList = document.querySelector("#customer-orders");
const receiptPrint = document.querySelector("#receipt-print");
let customer = null;
let orders = [];

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
  return customerCurrency.format(cents / 100);
}

function dateLabel(value) {
  return new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
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

function setAuthMode(mode) {
  const registering = mode === "register";
  loginForm.classList.toggle("hidden", registering);
  registerForm.classList.toggle("hidden", !registering);
  document.querySelector("#auth-title").textContent =
    registering ? "Створіть свій кабінет" : "Раді бачити знову";
  document.querySelector("#auth-intro").textContent = registering
    ? "Зареєструйтеся, щоб зберігати історію покупок і квитанції."
    : "Увійдіть, щоб переглянути замовлення, покупки й квитанції.";
  document.querySelectorAll("[data-auth-mode]").forEach((tab) => {
    const active = tab.dataset.authMode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

async function showCustomer(value) {
  customer = value;
  authPanel.classList.add("hidden");
  dashboard.classList.remove("hidden");
  document.querySelector("#customer-name").textContent = customer.name;
  document.querySelector("#customer-email").textContent = customer.email;
  document.querySelector("#customer-city").textContent = `Місто доставки: ${customer.city || "Київ"}`;
  document.querySelectorAll("[data-city-select]").forEach((select) => {
    select.value = customer.city || localStorage.getItem("prometey-city") || "Київ";
  });
  await loadOrders();
}

async function loadOrders() {
  const result = await api("/api/customer/orders");
  orders = result.orders;
  document.querySelector("#customer-empty").classList.toggle("hidden", orders.length > 0);
  orderList.classList.toggle("hidden", orders.length === 0);
  orderList.innerHTML = orders.map((order) => `
    <article class="customer-order-card">
      <div class="customer-order-top">
        <div><span class="eyebrow">ЗАМОВЛЕННЯ №${order.id}</span><p>${escapeHtml(dateLabel(order.created_at))}</p></div>
        <span class="payment-badge ${order.payment_status === "Оплачено" ? "paid" : "due"}">${escapeHtml(order.payment_status)}</span>
      </div>
      <div class="customer-order-status"><span>Статус замовлення</span><strong>${escapeHtml(order.status)}</strong></div>
      <div class="customer-order-items">
        ${order.items.map((item) => `
          <div><span>${escapeHtml(item.product_name)} · ${item.quantity} ${escapeHtml(item.unit)}</span><strong>${money(item.line_total)}</strong></div>
        `).join("")}
      </div>
      <div class="customer-order-total"><span>Разом</span><strong>${money(order.total)}</strong></div>
      <button class="button button-outline receipt-button" type="button" data-print-receipt="${order.id}">Переглянути / друкувати квитанцію <span aria-hidden="true">↗</span></button>
    </article>
  `).join("");
}

document.querySelector(".auth-switch").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-auth-mode]");
  if (tab) setAuthMode(tab.dataset.authMode);
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('[type="submit"]');
  const message = document.querySelector("#login-message");
  const values = new FormData(loginForm);
  message.textContent = "";
  button.disabled = true;
  try {
    const result = await api("/api/customer/login", {
      method: "POST",
      body: JSON.stringify({
        email: values.get("email"),
        password: values.get("password"),
      }),
    });
    await showCustomer(result.customer);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = registerForm.querySelector('[type="submit"]');
  const message = document.querySelector("#register-message");
  const values = new FormData(registerForm);
  message.textContent = "";
  button.disabled = true;
  try {
    const result = await api("/api/customer/register", {
      method: "POST",
      body: JSON.stringify({
        name: values.get("name"),
        email: values.get("email"),
        phone: values.get("phone"),
        city: values.get("city"),
        password: values.get("password"),
      }),
    });
    await showCustomer(result.customer);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#customer-logout").addEventListener("click", async () => {
  try {
    await api("/api/customer/logout", { method: "POST", body: "{}" });
    customer = null;
    orders = [];
    dashboard.classList.add("hidden");
    authPanel.classList.remove("hidden");
    loginForm.reset();
    setAuthMode("login");
  } catch (error) {
    document.querySelector("#login-message").textContent = error.message;
  }
});

orderList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-print-receipt]");
  if (!button) return;
  const order = orders.find((item) => item.id === Number(button.dataset.printReceipt));
  if (!order) return;
  receiptPrint.innerHTML = `
    <div class="receipt-brand">прометей <small>магазин добрих продуктів</small></div>
    <h1>Квитанція замовлення №${order.id}</h1>
    <p>${escapeHtml(dateLabel(order.created_at))}</p>
    <p>Покупець: ${escapeHtml(customer.name)}<br>${escapeHtml(customer.email)}</p>
    <hr>
    ${order.items.map((item) => `
      <div class="receipt-line"><span>${escapeHtml(item.product_name)} · ${item.quantity} ${escapeHtml(item.unit)} × ${money(item.unit_price)}</span><strong>${money(item.line_total)}</strong></div>
    `).join("")}
    <hr>
    <div class="receipt-line receipt-grand-total"><strong>Разом</strong><strong>${money(order.total)}</strong></div>
    <p>Оплата: ${escapeHtml(order.payment_status)}<br>Статус: ${escapeHtml(order.status)}</p>
    <p class="receipt-disclaimer">Квитанція підтверджує склад і суму онлайн-замовлення. Не є фіскальним чеком.</p>
  `;
  document.body.classList.add("printing-receipt");
  window.print();
  window.setTimeout(() => document.body.classList.remove("printing-receipt"), 1000);
});

api("/api/customer/me")
  .then(({ customer: current }) => showCustomer(current))
  .catch((error) => {
    if (error.status !== 401) {
      document.querySelector("#login-message").textContent = error.message;
    }
  });
