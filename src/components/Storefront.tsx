import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  Heart,
  MapPin,
  PackageCheck,
  ShoppingBag,
  ShoppingCart,
  X,
} from 'lucide-react'
import { api, jsonBody } from '../api'
import { useStore } from '../contexts/StoreContext'
import type { Product } from '../types'

export const money = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'UAH',
  maximumFractionDigits: 2,
})

export function formatMoney(cents: number): string {
  return money.format(cents / 100)
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function CityPicker() {
  const { cities, city, setCity } = useStore()
  return (
    <label className="city-picker">
      <MapPin size={18} aria-hidden="true" />
      <span>
        <small>Місто доставки</small>
        <select value={city} onChange={(event) => setCity(event.target.value)} aria-label="Місто доставки">
          {(cities.length ? cities : ['Київ']).map((item) => <option key={item}>{item}</option>)}
        </select>
      </span>
    </label>
  )
}

export function PublicLayout() {
  const { cart, favorites, toast } = useStore()
  const [cartOpen, setCartOpen] = useState(false)
  const location = useLocation()
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0)

  useEffect(() => {
    setCartOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.classList.toggle('no-scroll', cartOpen)
    return () => document.body.classList.remove('no-scroll')
  }, [cartOpen])

  return (
    <div className="storefront">
      <div className="announcement">Добрі продукти для вашого столу · свіже щодня</div>
      <header className="store-header">
        <Link className="brand" to="/" aria-label="Прометей — на головну">
          <span className="brand-mark">п</span>
          <span><strong>прометей</strong><small>магазин добрих продуктів</small></span>
        </Link>
        <nav className="store-nav" aria-label="Головна навігація">
          <NavLink to="/" end>Головна</NavLink>
          <NavLink to="/products">Каталог</NavLink>
          <NavLink to="/about">Про компанію</NavLink>
          <NavLink to="/support">Підтримка</NavLink>
        </nav>
        <div className="store-actions">
          <CityPicker />
          <Link className="icon-link favorite-link" to="/products#favorites" aria-label={`Улюблене, ${favorites.length}`}>
            <Heart size={19} />
            <span>Обране</span>
            {favorites.length > 0 && <b>{favorites.length}</b>}
          </Link>
          <Link className="icon-link" to="/account"><span>Мій кабінет</span></Link>
          <button className="button button-dark cart-trigger" type="button" onClick={() => setCartOpen(true)}>
            <ShoppingCart size={17} /> Кошик <b>{cartCount}</b>
          </button>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="store-footer">
        <Link className="brand footer-brand" to="/">
          <span className="brand-mark">п</span>
          <span><strong>прометей</strong><small>магазин добрих продуктів</small></span>
        </Link>
        <p>Хороші продукти. Хороші люди. Хороший день.</p>
        <div><Link to="/products">Каталог</Link><Link to="/about">Про нас</Link><Link to="/support">Підтримка</Link><Link to="/admin">Кабінет команди</Link></div>
      </footer>
      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} />}
      <div className={`toast${toast ? ' visible' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  )
}

function CartDrawer({ onClose }: { onClose: () => void }) {
  const {
    products, cart, cities, city, customer, adjustCart, removeFromCart, showToast,
    refreshProducts,
  } = useStore()
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const entries = Object.entries(cart)
    .map(([sku, quantity]) => ({
      product: products.find((product) => product.sku === sku),
      quantity,
    }))
    .filter((entry): entry is { product: Product; quantity: number } => Boolean(entry.product))
  const total = entries.reduce((sum, entry) => sum + entry.product.price * entry.quantity, 0)

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    const form = new FormData(event.currentTarget)
    try {
      const result = await api<{ order_id: number }>('/api/orders', {
        method: 'POST',
        body: jsonBody({
          name: form.get('name'),
          phone: form.get('phone'),
          city: form.get('city'),
          address: form.get('address'),
          items: entries.map(({ product, quantity }) => ({ sku: product.sku, quantity })),
        }),
      })
      entries.forEach(({ product }) => removeFromCart(product.sku))
      setCheckoutOpen(false)
      setSuccess(`Замовлення №${result.order_id} оформлено. Дякуємо!`)
      showToast(customer
        ? `Замовлення №${result.order_id} оформлено — квитанція буде у вашому кабінеті.`
        : `Замовлення №${result.order_id} оформлено. Дякуємо!`)
      await refreshProducts()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося оформити замовлення.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button className="drawer-backdrop" type="button" aria-label="Закрити кошик" onClick={onClose} />
      <aside className="cart-drawer" aria-label="Ваш кошик">
        <div className="drawer-heading">
          <div><span className="eyebrow">ВАША ПОКУПКА</span><h2>Кошик <small>({entries.reduce((n, item) => n + item.quantity, 0)})</small></h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><X /></button>
        </div>
        {success && <div className="notice notice-success"><PackageCheck size={18} />{success}</div>}
        {entries.length === 0 ? (
          <div className="empty-state"><ShoppingBag size={34} /><h3>Кошик поки порожній</h3><p>Додайте щось смачненьке — і ми все підготуємо.</p></div>
        ) : (
          <>
            <div className="cart-list">
              {entries.map(({ product, quantity }) => (
                <article className="cart-line" key={product.sku}>
                  <ProductArt product={product} compact />
                  <div className="cart-line-copy">
                    <strong>{product.name}</strong><small>{formatMoney(product.price)} / {product.unit}</small>
                    <div className="quantity-control">
                      <button type="button" onClick={() => adjustCart(product.sku, -1)} aria-label="Зменшити">−</button>
                      <span>{quantity}</span>
                      <button type="button" onClick={() => adjustCart(product.sku, 1)} aria-label="Збільшити" disabled={quantity >= product.stock}>+</button>
                      <button className="text-button" type="button" onClick={() => removeFromCart(product.sku)}>Видалити</button>
                    </div>
                  </div>
                  <strong>{formatMoney(product.price * quantity)}</strong>
                </article>
              ))}
            </div>
            <div className="cart-total"><span>Разом</span><strong>{formatMoney(total)}</strong></div>
            <p className="delivery-hint">{total >= 50000 ? 'Безкоштовна доставка для замовлення!' : `Ще ${formatMoney(50000 - total)} до безкоштовної доставки.`}</p>
            {!checkoutOpen ? (
              <button className="button button-dark button-full" type="button" onClick={() => { setCheckoutOpen(true); setSuccess('') }}>
                Оформити замовлення <ArrowRight size={16} />
              </button>
            ) : (
              <form className="checkout-form" onSubmit={submitOrder}>
                <h3>Дані доставки</h3>
                <label>Ваше ім’я<input name="name" defaultValue={customer?.name || ''} minLength={2} maxLength={100} required /></label>
                <label>Телефон<input name="phone" type="tel" defaultValue={customer?.phone || ''} minLength={9} maxLength={20} required /></label>
                <label>Місто<select name="city" defaultValue={customer?.city || city} required>{(cities.length ? cities : ['Київ']).map((item) => <option key={item}>{item}</option>)}</select></label>
                <label>Адреса доставки<textarea name="address" minLength={5} maxLength={200} required /></label>
                {error && <p className="form-message" role="alert">{error}</p>}
                <button className="button button-dark button-full" type="submit" disabled={submitting}>
                  {submitting ? 'Надсилаємо…' : `Підтвердити · ${formatMoney(total)}`}
                </button>
              </form>
            )}
          </>
        )}
      </aside>
    </>
  )
}

export function ProductArt({ product, compact = false }: { product: Product; compact?: boolean }) {
  return (
    <div className={`product-art-box ${product.color}${compact ? ' compact' : ''}`}>
      {product.visual === 'milk-churn' ? (
        <svg className="product-art-svg" viewBox="0 0 120 120" aria-hidden="true">
          <path d="M43 31v-8c0-5 4-8 17-8s17 3 17 8v8" fill="none" stroke="#84949a" strokeWidth="4" strokeLinecap="round" />
          <path d="M50 25h20l5 11c9 6 13 15 13 24v31c0 8-5 13-13 13H45c-8 0-13-5-13-13V60c0-9 4-18 13-24z" fill="#d8e2e4" stroke="#87979c" strokeWidth="2.5" />
          <path d="M40 49h40M35 87h50" stroke="#f9fbf9" strokeWidth="3" opacity=".85" />
          <path d="M43 55h34v23H43z" rx="4" fill="#fffdf7" stroke="#c1caca" />
          <path d="M46 61h28v5H46z" rx="2" fill="#54815f" />
          <text x="60" y="65" fill="white" fontSize="4.2" fontFamily="Arial,sans-serif" fontWeight="700" textAnchor="middle">ФЕРМЕРСЬКЕ</text>
          <text x="60" y="73" fill="#496149" fontSize="7" fontFamily="Arial,sans-serif" fontWeight="700" textAnchor="middle">МОЛОКО</text>
        </svg>
      ) : product.visual === 'yogurt-cup' ? (
        <svg className="product-art-svg" viewBox="0 0 120 120" aria-hidden="true">
          <ellipse cx="60" cy="29" rx="30" ry="8" fill="#f7f5f0" stroke="#d9d4d2" strokeWidth="2" />
          <path d="M32 31h56l-7 60c-.7 6-5 10-11 10H50c-6 0-10.3-4-11-10z" fill="#fffdfb" stroke="#d9d4d2" strokeWidth="2" />
          <path d="M36 57h48l-4 34c-.7 5-4 8-9 8H51c-5 0-8-3-9-8z" fill="#f5dfe7" />
          <path d="M43 63h34v17H43z" rx="4" fill="#54815f" />
          <text x="60" y="70" fill="white" fontSize="5" fontFamily="Arial,sans-serif" fontWeight="700" textAnchor="middle">ЙОГУРТ</text>
          <text x="60" y="76" fill="white" fontSize="3.5" fontFamily="Arial,sans-serif" textAnchor="middle">НАТУРАЛЬНИЙ</text>
        </svg>
      ) : <span className="product-emoji" aria-hidden="true">{product.emoji}</span>}
    </div>
  )
}

export function ProductCard({ product }: { product: Product }) {
  const { cart, favorites, adjustCart, toggleFavorite, showToast } = useStore()
  const quantity = cart[product.sku] || 0
  const isFavorite = favorites.includes(product.sku)
  const unavailable = product.stock < 1

  function add() {
    if (unavailable || quantity >= product.stock) {
      showToast('Більше цього товару зараз немає на складі.')
      return
    }
    adjustCart(product.sku, 1)
    showToast(`${product.name} додано до кошика`)
  }

  return (
    <article className="product-card">
      <div className={`product-visual ${product.color}`}>
        <span className="product-category">{product.category_name}</span>
        <ProductArt product={product} />
        <button
          className={`favorite-button${isFavorite ? ' active' : ''}`}
          type="button"
          aria-label={isFavorite ? 'Видалити з улюбленого' : 'Додати до улюбленого'}
          aria-pressed={isFavorite}
          onClick={() => {
            toggleFavorite(product.sku)
            showToast(isFavorite ? 'Видалено з улюбленого' : 'Додано до улюбленого')
          }}
        ><Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} /></button>
      </div>
      <div className="product-info">
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        {unavailable && <span className="stock-unavailable">Немає в наявності</span>}
        <div className="product-meta">
          <strong>{formatMoney(product.price)}<small> / {product.unit}</small></strong>
          {quantity ? (
            <div className="quantity-control" aria-label={`У кошику ${quantity}`}>
              <button type="button" onClick={() => adjustCart(product.sku, -1)} aria-label="Прибрати один товар">−</button>
              <span>{quantity}</span>
              <button type="button" onClick={() => adjustCart(product.sku, 1)} disabled={unavailable || quantity >= product.stock} aria-label="Додати один товар">+</button>
            </div>
          ) : (
            <button className="add-button" type="button" disabled={unavailable} onClick={add} aria-label={unavailable ? 'Немає в наявності' : 'Додати до кошика'}>
              {unavailable ? 'Немає' : '+'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export function SectionHeader({
  eyebrow, title, description, action,
}: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
      {action}
    </div>
  )
}

export function useProductCategories(products: Product[]) {
  return useMemo(() => [...new Map(products.map((product) => [
    product.category,
    { slug: product.category, name: product.category_name },
  ])).values()], [products])
}
