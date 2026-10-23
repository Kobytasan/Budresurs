const money = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "UAH",
  maximumFractionDigits: 2,
});
const cartKey = "prometey-cart";
const favoritesKey = "prometey-favorites";
const cityKey = "prometey-city";
const elements = {
  grid: document.querySelector("#product-grid"),
  tabs: document.querySelector("#catalog-tabs"),
  nav: document.querySelector("#category-nav"),
  search: document.querySelector("#search-input"),
  count: document.querySelector("#product-count"),
  heading: document.querySelector("#catalog-heading"),
  empty: document.querySelector("#empty-state"),
  cartCount: document.querySelector("#cart-count"),
  cartItems: document.querySelector("#cart-items"),
  drawerCount: document.querySelector("#drawer-count"),
  cartTotal: document.querySelector("#cart-total"),
  checkoutTotal: document.querySelector("#checkout-total"),
  cartFooter: document.querySelector("#cart-footer"),
  cartEmpty: document.querySelector("#cart-empty"),
  progress: document.querySelector("#delivery-progress"),
  drawer: document.querySelector("#cart-drawer"),
  overlay: document.querySelector("#cart-overlay"),
  checkout: document.querySelector("#checkout-modal"),
  toast: document.querySelector("#toast"),
};

let products = [];
let selectedCategory = "all";
let cart = loadCart();
let favorites = loadFavorites();
let currentCustomer = null;
let showingFavorites = location.hash === "#favorites";
let toastTimer;

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(cartKey) || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(
      Object.entries(saved).filter(
        ([sku, quantity]) =>
          typeof sku === "string" &&
          Number.isInteger(quantity) &&
          quantity > 0 &&
          quantity <= 99,
      ),
    );
  } catch {
    return {};
  }
}

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(favoritesKey) || "[]");
    return Array.isArray(saved)
      ? [...new Set(saved.filter((sku) => typeof sku === "string"))]
      : [];
  } catch {
    return [];
  }
}

function saveFavorites() {
  localStorage.setItem(favoritesKey, JSON.stringify(favorites));
}

function saveCart() {
  localStorage.setItem(cartKey, JSON.stringify(cart));
}

function formatMoney(cents) {
  return money.format(cents / 100);
}

function productIllustration(product) {
  if (product.visual === "yogurt-cup") {
    return `<svg class="product-art yogurt-art" viewBox="0 0 120 120" aria-hidden="true">
      <ellipse cx="60" cy="29" rx="30" ry="8" fill="#fff" stroke="#d9d4d2" stroke-width="2"/>
      <path d="M32 31h56l-7 60c-.7 6-5 10-11 10H50c-6 0-10.3-4-11-10z" fill="#fffdfb" stroke="#d9d4d2" stroke-width="2"/>
      <path d="M36 57h48l-4 34c-.7 5-4 8-9 8H51c-5 0-8-3-9-8z" fill="#f5dfe7"/>
      <path d="M43 63h34v17H43z" rx="4" fill="#54815f"/>
      <text x="60" y="70" fill="white" font-size="5" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle">ЙОГУРТ</text>
      <text x="60" y="76" fill="white" font-size="3.5" font-family="Arial,sans-serif" text-anchor="middle">НАТУРАЛЬНИЙ</text>
      <path d="M57 84c-7-8-16 2 0 11 16-9 7-19 0-11" fill="#c8646c"/>
      <path d="M56 84c2-4 5-5 8-5-1 4-4 6-8 5" fill="#64885e"/>
      <ellipse cx="60" cy="29" rx="30" ry="8" fill="#f7f5f0" stroke="#d9d4d2" stroke-width="2"/>
      <path d="M39 29c10-5 32-5 42 0" fill="none" stroke="#d5d2cb" stroke-width="1"/>
    </svg>`;
  }
  if (product.visual === "milk-churn") {
    return `<svg class="product-art milk-art" viewBox="0 0 120 120" aria-hidden="true">
      <path d="M43 31v-8c0-5 4-8 17-8s17 3 17 8v8" fill="none" stroke="#84949a" stroke-width="4" stroke-linecap="round"/>
      <path d="M50 25h20l5 11c9 6 13 15 13 24v31c0 8-5 13-13 13H45c-8 0-13-5-13-13V60c0-9 4-18 13-24z" fill="#d8e2e4" stroke="#87979c" stroke-width="2.5"/>
      <path d="M40 49h40M35 87h50" stroke="#f9fbf9" stroke-width="3" opacity=".85"/>
      <path d="M43 55h34v23H43z" rx="4" fill="#fffdf7" stroke="#c1caca"/>
      <path d="M46 61h28v5H46z" rx="2" fill="#54815f"/>
      <text x="60" y="65" fill="#fff" font-size="4.2" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle">ФЕРМЕРСЬКЕ</text>
      <text x="60" y="73" fill="#496149" font-size="7" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle">МОЛОКО</text>
      <path d="M54 41c0-4 6-8 6-12 0 4 6 8 6 12a6 6 0 0 1-12 0" fill="#fff" opacity=".9"/>
    </svg>`;
  }
  return `<span class="product-emoji" aria-hidden="true">${escapeHtml(product.emoji)}</span>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2600);
}

async function request(url, options = {}) {
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

function renderCategories() {
  const categories = [...new Map(
    products.map((product) => [
      product.category,
      { slug: product.category, name: product.category_name },
    ]),
  ).values()];
  const links = [
    { slug: "all", name: "Усі товари" },
    ...categories,
  ];
  elements.nav.innerHTML = links.map((category) => `
    <a class="category-link${category.slug === selectedCategory ? " active" : ""}"
       href="#catalog" data-category="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</a>
  `).join("");
  elements.tabs.innerHTML = links.map((category) => `
    <button class="catalog-tab${category.slug === selectedCategory ? " active" : ""}"
       type="button" data-category="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</button>
  `).join("") + (
    favorites.length > 0 || showingFavorites
      ? `<button class="catalog-tab${showingFavorites ? " active" : ""}" type="button" data-favorites id="favorites-tab">
          ♡ Улюблене <span>${favorites.length}</span>
        </button>`
      : ""
  );
}

function visibleProducts() {
  const query = elements.search.value.trim().toLocaleLowerCase("uk");
  return products.filter((product) => {
    if (showingFavorites && !favorites.includes(product.sku)) return false;
    const matchesCategory =
      selectedCategory === "all" || product.category === selectedCategory;
    const matchesQuery =
      !query ||
      `${product.name} ${product.description} ${product.category_name}`
        .toLocaleLowerCase("uk")
        .includes(query);
    return matchesCategory && matchesQuery;
  });
}

function renderProducts() {
  const visible = visibleProducts();
  elements.count.textContent = showingFavorites
    ? `${visible.length} в обраному`
    : `${visible.length} ${visible.length === 1 ? "товар" : "товарів"}`;
  elements.empty.classList.toggle("hidden", visible.length > 0);
  elements.grid.classList.toggle("hidden", visible.length === 0);
  if (visible.length === 0) {
    const isFavoriteView = showingFavorites;
    elements.empty.querySelector("h3").textContent = isFavoriteView ? "Улюблене поки порожнє" : "Нічого не знайшли";
    elements.empty.querySelector("p").textContent = isFavoriteView
      ? "Оберіть сердечко біля товару, щоб додати його до улюбленого."
      : "Спробуйте змінити запит або оберіть іншу категорію.";
  }
  elements.heading.textContent =
    showingFavorites ? "Улюблене" :
      elements.search.value.trim() ? "Ось що знайшлося" :
      selectedCategory === "all" ? "Обирайте з любов’ю" :
        products.find((product) => product.category === selectedCategory)?.category_name || "Каталог";
  elements.grid.innerHTML = visible.map((product, index) => {
    const quantity = cart[product.sku] || 0;
    const unavailable = product.stock < 1;
    const isFavorite = favorites.includes(product.sku);
    return `
      <article class="product-card" data-sku="${escapeHtml(product.sku)}" style="--card-color:var(--${escapeHtml(product.color)})">
        <div class="product-image ${escapeHtml(product.color)}">
          <span class="product-category">${escapeHtml(product.category_name)}</span>
          ${productIllustration(product)}
          ${index === 0 && selectedCategory === "all" ? '<span class="product-tag">Вибір команди</span>' : ""}
          <button class="favorite-button${isFavorite ? " favorite" : ""}" type="button" aria-label="${isFavorite ? "Видалити з улюбленого" : "Додати до улюбленого"}" aria-pressed="${isFavorite}">${isFavorite ? "♥" : "♡"}</button>
        </div>
        <div class="product-info">
          <h3>${escapeHtml(product.name)}</h3>
          <p>${escapeHtml(product.description)}</p>
          <div class="product-meta">
            <strong>${formatMoney(product.price)}<small> / ${escapeHtml(product.unit)}</small>${unavailable ? '<span class="stock-unavailable">Немає в наявності</span>' : ""}</strong>
            ${quantity > 0 ? `
              <div class="product-quantity-control" aria-label="Кількість у кошику: ${quantity}">
                <button class="product-quantity-button" type="button" data-product-quantity="-1" data-sku="${escapeHtml(product.sku)}" aria-label="Прибрати один товар ${escapeHtml(product.name)}">−</button>
                <span aria-live="polite">${quantity}</span>
                <button class="product-quantity-button" type="button" data-product-quantity="1" data-sku="${escapeHtml(product.sku)}" ${unavailable || quantity >= product.stock ? "disabled" : ""} aria-label="Додати ще один товар ${escapeHtml(product.name)}">+</button>
              </div>
            ` : `
              <button class="add-button" type="button" data-add="${escapeHtml(product.sku)}" aria-label="${unavailable ? "Немає в наявності" : "Додати до кошика"}" ${unavailable ? "disabled" : ""}>${unavailable ? "Немає в наявності" : "+"}</button>
            `}
          </div>
        </div>
      </article>`;
  }).join("");
}

function cartEntries() {
  return Object.entries(cart)
    .map(([sku, quantity]) => ({
      product: products.find((product) => product.sku === sku),
      quantity,
    }))
    .filter((entry) => entry.product);
}

function cartTotal() {
  return cartEntries().reduce(
    (sum, entry) => sum + entry.product.price * entry.quantity,
    0,
  );
}

function renderCart() {
  const entries = cartEntries();
  const quantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const total = cartTotal();
  elements.cartCount.textContent = quantity;
  elements.drawerCount.textContent = `(${quantity})`;
  elements.cartTotal.textContent = formatMoney(total);
  elements.checkoutTotal.textContent = formatMoney(total);
  elements.cartEmpty.classList.toggle("hidden", entries.length > 0);
  elements.cartFooter.classList.toggle("hidden", entries.length === 0);
  elements.cartItems.innerHTML = entries.map(({ product, quantity: count }) => `
    <article class="cart-item">
      <div class="cart-item-emoji ${escapeHtml(product.color)}">${productIllustration(product)}</div>
      <div class="cart-item-copy"><h3>${escapeHtml(product.name)}</h3><span>${formatMoney(product.price)} / ${escapeHtml(product.unit)}</span>
        <div class="quantity-control">
          <button type="button" data-quantity="-1" data-sku="${escapeHtml(product.sku)}" aria-label="Зменшити кількість">−</button>
          <span>${count}</span>
          <button type="button" data-quantity="1" data-sku="${escapeHtml(product.sku)}" aria-label="Збільшити кількість">+</button>
        </div>
      </div>
      <strong class="cart-item-total">${formatMoney(product.price * count)}</strong>
      <button class="remove-item" type="button" data-remove="${escapeHtml(product.sku)}" aria-label="Видалити товар">×</button>
    </article>
  `).join("");
  const remaining = Math.max(0, 50000 - total);
  elements.progress.innerHTML = total >= 50000
    ? '<span>✳ Безкоштовна доставка для вашого замовлення!</span>'
    : `<span>Додайте ще <strong>${formatMoney(remaining)}</strong> — і доставка буде безкоштовною</span><div class="progress-track"><span style="width:${Math.min(100, (total / 50000) * 100)}%"></span></div>`;
  renderProducts();
}

function openCart() {
  elements.drawer.classList.add("open");
  elements.drawer.setAttribute("aria-hidden", "false");
  elements.overlay.classList.remove("hidden");
  document.body.classList.add("no-scroll");
  document.querySelector("#close-cart").focus();
}

function closeCart() {
  elements.drawer.classList.remove("open");
  elements.drawer.setAttribute("aria-hidden", "true");
  elements.overlay.classList.add("hidden");
  document.body.classList.remove("no-scroll");
}

function setCategory(category) {
  showingFavorites = false;
  selectedCategory = category;
  renderCategories();
  renderProducts();
}

elements.nav.addEventListener("click", (event) => {
  const link = event.target.closest("[data-category]");
  if (!link) return;
  event.preventDefault();
  setCategory(link.dataset.category);
  document.querySelector("#catalog").scrollIntoView({ behavior: "smooth" });
});

elements.tabs.addEventListener("click", (event) => {
  if (event.target.closest("[data-favorites]")) {
    showingFavorites = true;
    elements.search.value = "";
    renderCategories();
    renderProducts();
    history.replaceState(null, "", "#favorites");
    return;
  }
  const button = event.target.closest("[data-category]");
  if (button) {
    history.replaceState(null, "", "/products");
    setCategory(button.dataset.category);
  }
});

elements.search.addEventListener("input", renderProducts);
elements.grid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  if (addButton) {
    const product = products.find((item) => item.sku === addButton.dataset.add);
    if (!product || product.stock <= (cart[product.sku] || 0)) {
      showToast("Більше цього товару зараз немає на складі.");
      return;
    }
    cart[product.sku] = (cart[product.sku] || 0) + 1;
    saveCart();
    renderCart();
    showToast(`${product.name} додано до кошика`);
    return;
  }
  const quantityButton = event.target.closest("[data-product-quantity]");
  if (quantityButton) {
    const sku = quantityButton.dataset.sku;
    const product = products.find((item) => item.sku === sku);
    const next = (cart[sku] || 0) + Number(quantityButton.dataset.productQuantity);
    if (!product) return;
    if (next > product.stock) {
      showToast("На складі немає більшої кількості цього товару.");
      return;
    }
    if (next <= 0) delete cart[sku];
    else cart[sku] = next;
    saveCart();
    renderCart();
    return;
  }
  const favoriteButton = event.target.closest(".favorite-button");
  if (favoriteButton) {
    const sku = favoriteButton.closest(".product-card").dataset.sku;
    if (!sku) return;
    const isFavorite = favorites.includes(sku);
    favorites = isFavorite ? favorites.filter((item) => item !== sku) : [...favorites, sku];
    saveFavorites();
    renderCategories();
    renderProducts();
    showToast(isFavorite ? "Видалено з улюбленого" : "Додано до улюбленого");
  }
});

elements.cartItems.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove]");
  if (removeButton) {
    delete cart[removeButton.dataset.remove];
    saveCart();
    renderCart();
    return;
  }
  const quantityButton = event.target.closest("[data-quantity]");
  if (quantityButton) {
    const sku = quantityButton.dataset.sku;
    const next = (cart[sku] || 0) + Number(quantityButton.dataset.quantity);
    const product = products.find((item) => item.sku === sku);
    if (next > (product?.stock || 0)) {
      showToast("На складі немає більшої кількості цього товару.");
      return;
    }
    if (next <= 0) delete cart[sku];
    else cart[sku] = next;
    saveCart();
    renderCart();
  }
});

document.querySelector("#open-cart").addEventListener("click", openCart);
document.querySelector("#close-cart").addEventListener("click", closeCart);
elements.overlay.addEventListener("click", closeCart);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCart();
    elements.checkout.classList.add("hidden");
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    elements.search.focus();
  }
});

document.querySelector("#checkout-button").addEventListener("click", () => {
  if (!cartEntries().length) return;
  const citySelect = document.querySelector('#checkout-form select[name="city"]');
  citySelect.value = currentCustomer?.city || localStorage.getItem(cityKey) || "Київ";
  if (currentCustomer) {
    document.querySelector('#checkout-form input[name="name"]').value = currentCustomer.name;
    document.querySelector('#checkout-form input[name="phone"]').value = currentCustomer.phone;
  }
  elements.checkout.classList.remove("hidden");
  document.querySelector('#checkout-form input[name="name"]').focus();
});
document.querySelector("#close-checkout").addEventListener("click", () => {
  elements.checkout.classList.add("hidden");
});
elements.checkout.addEventListener("click", (event) => {
  if (event.target === elements.checkout) elements.checkout.classList.add("hidden");
});

document.querySelector("#checkout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector("#checkout-message");
  const submit = form.querySelector('[type="submit"]');
  message.textContent = "";
  submit.disabled = true;
  try {
    const formData = new FormData(form);
    const result = await request("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        phone: formData.get("phone"),
        city: formData.get("city"),
        address: formData.get("address"),
        items: cartEntries().map(({ product, quantity }) => ({
          sku: product.sku,
          quantity,
        })),
      }),
    });
    cart = {};
    saveCart();
    renderCart();
    elements.checkout.classList.add("hidden");
    closeCart();
    form.reset();
    showToast(currentCustomer
      ? `Замовлення №${result.order_id} оформлено. Квитанція буде у вашому кабінеті.`
      : `Замовлення №${result.order_id} оформлено. Дякуємо!`);
    await refreshProducts();
  } catch (error) {
    message.textContent = error.message;
    showToast(error.message);
  } finally {
    submit.disabled = false;
  }
});

async function refreshProducts() {
  const result = await request("/api/products");
  products = result.products;
  renderCategories();
  renderCart();
  if (showingFavorites) renderProducts();
}

async function loadCustomer() {
  try {
    const result = await request("/api/customer/me");
    currentCustomer = result.customer;
    if (currentCustomer.city) {
      localStorage.setItem(cityKey, currentCustomer.city);
      document.querySelectorAll("[data-city-select]").forEach((select) => {
        select.value = currentCustomer.city;
      });
    }
  } catch (error) {
    if (error.status === 401) {
      currentCustomer = null;
      return;
    }
    throw error;
  }
}

refreshProducts().catch((error) => {
  elements.grid.innerHTML = `<div class="load-error">Не вдалося завантажити каталог: ${escapeHtml(error.message)}<br>Перезапустіть сервер і оновіть сторінку.</div>`;
});
loadCustomer().catch((error) => showToast(`Не вдалося перевірити обліковий запис: ${error.message}`));

window.setInterval(() => {
  if (!document.hidden) {
    refreshProducts().catch((error) => showToast(`Не вдалося оновити наявність товарів: ${error.message}`));
  }
}, 15_000);
