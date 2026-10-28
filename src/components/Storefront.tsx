import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Boxes,
  Cog,
  Drill,
  Hammer,
  HardHat,
  Heart,
  Package,
  PackageCheck,
  Ruler,
  ShoppingBag,
  ShoppingCart,
  Wrench,
  X,
} from 'lucide-react'
import { api, jsonBody } from '../api'
import { useStore } from '../contexts/StoreContext'
import { getProductMedia } from '../productMedia'
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

function CartQuantityInput({
  product, quantity, onChange, descriptionId,
}: {
  product: Product
  quantity: number
  onChange: (quantity: number) => void
  descriptionId?: string
}) {
  const { showToast } = useStore()
  const [draft, setDraft] = useState(String(quantity))

  useEffect(() => setDraft(String(quantity)), [quantity])

  function commitQuantity() {
    if (!/^\d+$/.test(draft)) {
      showToast('Вкажіть цілу кількість від 1.')
      setDraft(String(quantity))
      return
    }
    const requested = Number(draft)
    if (requested > Math.min(product.stock, 99)) {
      showToast(product.stock > 0
        ? `Можна замовити до ${Math.min(product.stock, 99)} ${product.unit} товару «${product.name}» за раз.`
        : `Товар «${product.name}» зараз відсутній на складі.`)
      setDraft(String(quantity))
      return
    }
    if (requested < 1) {
      showToast('Вкажіть цілу кількість від 1.')
      setDraft(String(quantity))
      return
    }
    onChange(requested)
  }

  return (
    <input
      className="quantity-input"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={`Кількість товару «${product.name}»`}
      aria-describedby={descriptionId}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commitQuantity}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function PublicLayout() {
  const { cart, favorites, customer, toast, showToast } = useStore()
  const [cartOpen, setCartOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
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
      <header className="store-header">
        <Link className="brand" to="/" aria-label="Будресурс — на головну">
          <span className="brand-mark">Б</span>
          <span><strong>БУДРЕСУРС</strong><small>інструмент і будматеріали</small></span>
        </Link>
        <nav className="store-nav" aria-label="Головна навігація">
          <NavLink to="/" end>Головна</NavLink>
          <NavLink to="/products">Каталог</NavLink>
          <NavLink to="/about">Про нас</NavLink>
          <NavLink to="/support">Контакти</NavLink>
        </nav>
        <div className="store-actions">
          <Link
            className="icon-link favorite-link"
            to={customer ? '/products#favorites' : '/account'}
            aria-label={customer ? `Улюблене у вашому кабінеті, ${favorites.length}` : 'Увійти, щоб переглянути улюблене'}
            onClick={(event) => {
              if (!customer) {
                event.preventDefault()
                showToast('Щоб переглядати улюблене, увійдіть або зареєструйтеся.')
                navigate('/account')
              }
            }}
          >
            <Heart size={19} />
            <span>Обране</span>
            {favorites.length > 0 && <b>{favorites.length}</b>}
          </Link>
          <Link className="icon-link customer-account-link" to="/account" aria-label={customer ? `Кабінет покупця: ${customer.name}` : 'Увійти або зареєструватися'}>
            {customer && <span className="customer-avatar" aria-hidden="true">
              {customer.avatar_url
                ? <img src={customer.avatar_url} alt="" />
                : customer.name.trim().slice(0, 1).toLocaleUpperCase('uk')}
            </span>}
            <span>{customer?.name || 'Мій кабінет'}</span>
          </Link>
          <button className="button button-dark cart-trigger" type="button" onClick={() => setCartOpen(true)}>
            <ShoppingCart size={17} /> Кошик <b>{cartCount}</b>
          </button>
        </div>
      </header>
      <main><Outlet /></main>
      <footer className="store-footer">
        <Link className="brand footer-brand" to="/">
          <span className="brand-mark">Б</span>
          <span><strong>БУДРЕСУРС</strong><small>інструмент і будматеріали</small></span>
        </Link>
        <p>Усе потрібне для робіт на об’єкті.</p>
        <div><Link to="/products">Каталог</Link><Link to="/about">Про нас</Link><Link to="/support">Контакти</Link><Link to="/admin">Кабінет команди</Link></div>
      </footer>
      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} />}
      <div className={`toast${toast ? ' visible' : ''}`} role="status" aria-live="polite">{toast}</div>
    </div>
  )
}

function CartDrawer({ onClose }: { onClose: () => void }) {
  const {
    products, cart, cities, city, customer, adjustCart, setCartQuantity, removeFromCart, showToast,
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
  const hasUnavailableQuantity = entries.some(({ product, quantity }) => quantity > product.stock)

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (hasUnavailableQuantity) {
      setError('Зменште кількість товарів до наявного складського залишку.')
      return
    }
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
          <div><span className="eyebrow">ВАШЕ ЗАМОВЛЕННЯ</span><h2>Кошик <small>({entries.reduce((n, item) => n + item.quantity, 0)})</small></h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><X /></button>
        </div>
        {success && <div className="notice notice-success"><PackageCheck size={18} />{success}</div>}
        {entries.length === 0 ? (
          <div className="empty-state"><ShoppingBag size={34} /><h3>Кошик поки порожній</h3><p>Оберіть потрібний інструмент у каталозі.</p></div>
        ) : (
          <>
            <div className="cart-list">
              {entries.map(({ product, quantity }) => (
                <article className="cart-line" key={product.sku}>
                  <ProductArt product={product} compact />
                  <div className="cart-line-copy">
                    <strong>{product.name}</strong><small>{formatMoney(product.price)} / {product.unit}</small>
                    <small id={`cart-stock-${product.sku}`} className={quantity > product.stock ? 'stock-shortage' : 'stock-available'}>
                      {quantity > product.stock ? `Доступно лише ${product.stock} ${product.unit}` : `На складі: ${product.stock} ${product.unit}`}
                    </small>
                    <div className="quantity-control">
                      <button type="button" onClick={() => adjustCart(product.sku, -1)} aria-label="Зменшити">−</button>
                      <CartQuantityInput product={product} quantity={quantity} descriptionId={`cart-stock-${product.sku}`} onChange={(next) => setCartQuantity(product.sku, next)} />
                      <button type="button" onClick={() => adjustCart(product.sku, 1)} aria-label={quantity >= Math.min(product.stock, 99) ? `Досягнуто ліміту: ${Math.min(product.stock, 99)} ${product.unit}` : 'Збільшити'} disabled={quantity >= Math.min(product.stock, 99)}>+</button>
                      <button className="text-button remove-cart-button" type="button" onClick={() => removeFromCart(product.sku)}>Видалити</button>
                    </div>
                  </div>
                  <strong>{formatMoney(product.price * quantity)}</strong>
                </article>
              ))}
            </div>
            <div className="cart-total"><span>Разом</span><strong>{formatMoney(total)}</strong></div>
            <p className="delivery-hint">Умови та вартість отримання замовлення узгоджуються окремо.</p>
            {hasUnavailableQuantity && <p className="stock-shortage" role="alert">Змініть кількість товарів відповідно до актуальної наявності, щоб оформити замовлення.</p>}
            {!checkoutOpen ? (
              <button className="button button-dark button-full" type="button" disabled={hasUnavailableQuantity} onClick={() => { setCheckoutOpen(true); setSuccess('') }}>
                Оформити замовлення <ArrowRight size={16} />
              </button>
            ) : (
              <form className="checkout-form" onSubmit={submitOrder}>
                <h3>Дані доставки</h3>
                <label>Ваше ім’я<input name="name" defaultValue={customer?.name || ''} minLength={2} maxLength={100} required /></label>
                <label>Телефон<input name="phone" type="tel" defaultValue={customer?.phone || ''} minLength={9} maxLength={20} required /></label>
                <label>Місто отримання<select name="city" defaultValue={customer?.city || city} required>{(cities.length ? cities : ['Київ']).map((item) => <option key={item}>{item}</option>)}</select></label>
                <label>Адреса отримання<textarea name="address" minLength={5} maxLength={200} required /></label>
                {error && <p className="form-message" role="alert">{error}</p>}
                <button className="button button-dark button-full" type="submit" disabled={submitting || hasUnavailableQuantity}>
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
  const name = product.name.toLocaleLowerCase('uk')
  const Icon = name.includes('шліфмашина')
    ? Cog
    : name.includes('дриль') || name.includes('перфоратор')
      ? Drill
      : name.includes('молоток') || name.includes('пилка')
        ? Hammer
        : name.includes('рулетка') || name.includes('рівень')
          ? Ruler
          : name.includes('каска') || name.includes('окуляри') || name.includes('рукавиці')
            ? HardHat
            : name.includes('саморіз') || name.includes('анкер') || name.includes('свердл')
              ? Boxes
              : name.includes('драбина') || name.includes('подовжувач')
                ? Package
                : product.category === 'ruchnyi-instrument'
                  ? Wrench
                  : Package

  return (
    <div className={`product-art-box ${product.color}${compact ? ' compact' : ''}`}>
      {compact
        ? <img className="product-thumb-image" src={getProductMedia(product).src} alt="" loading="lazy" />
        : <Icon className="product-tool-icon" strokeWidth={1.45} aria-hidden="true" />}
    </div>
  )
}

export function ProductCard({ product }: { product: Product }) {
  const { cart, favorites, favoritesLoading, customer, adjustCart, setCartQuantity, toggleFavorite, showToast } = useStore()
  const navigate = useNavigate()
  const quantity = cart[product.sku] || 0
  const isFavorite = favorites.includes(product.sku)
  const unavailable = product.stock < 1

  function add() {
    if (unavailable || quantity >= Math.min(product.stock, 99)) {
      showToast(unavailable
        ? 'Цього товару зараз немає на складі.'
        : `До кошика можна додати не більше ${Math.min(product.stock, 99)} ${product.unit}.`)
      return
    }
    adjustCart(product.sku, 1)
    showToast(`${product.name} додано до кошика`)
  }

  return (
    <article className="product-card">
      <div className={`product-visual ${product.color}`}>
        <span className="product-category">{product.category_name}</span>
        <Link className="product-photo-link" to={`/products/${encodeURIComponent(product.sku)}`} aria-label={`Детальніше про товар: ${product.name}`}>
          <img className="product-photo" src={getProductMedia(product).src} alt={product.name} loading="lazy" />
        </Link>
        <button
          className={`favorite-button${isFavorite ? ' active' : ''}`}
          type="button"
          aria-label={isFavorite ? 'Видалити з улюбленого' : 'Додати до улюбленого'}
          aria-pressed={isFavorite}
          disabled={favoritesLoading}
          onClick={() => {
            if (!customer) {
              showToast('Увійдіть або створіть кабінет, щоб зберігати улюблене.')
              navigate('/account')
              return
            }
            void toggleFavorite(product.sku)
          }}
        ><Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} /></button>
      </div>
      <div className="product-info">
        <h3><Link to={`/products/${encodeURIComponent(product.sku)}`}>{product.name}</Link></h3>
        <p>{product.description}</p>
        {unavailable && <span className="stock-unavailable">Немає в наявності</span>}
        <div className="product-meta">
          <strong>{formatMoney(product.price)}<small> / {product.unit}</small></strong>
          {quantity ? (
            <div className="quantity-control" aria-label={`У кошику ${quantity}`}>
              <button type="button" onClick={() => adjustCart(product.sku, -1)} aria-label="Прибрати один товар">−</button>
              <CartQuantityInput product={product} quantity={quantity} onChange={(next) => setCartQuantity(product.sku, next)} />
              <button type="button" onClick={() => adjustCart(product.sku, 1)} disabled={unavailable || quantity >= Math.min(product.stock, 99)} aria-label={unavailable ? 'Немає в наявності' : quantity >= Math.min(product.stock, 99) ? `Досягнуто ліміту: ${Math.min(product.stock, 99)} ${product.unit}` : 'Додати один товар'}>+</button>
            </div>
          ) : (
            <button className="add-button" type="button" disabled={unavailable} onClick={add} aria-label={unavailable ? 'Немає в наявності' : 'Додати до кошика'}>
              {unavailable ? 'Немає' : '+'}
            </button>
          )}
          <Link className="product-details-link" to={`/products/${encodeURIComponent(product.sku)}`}>Фото, відгуки та порівняння <ArrowRight size={14} /></Link>
        </div>
        {quantity > 0 && (
          <small className={quantity > product.stock ? 'quantity-limit-note stock-shortage' : 'quantity-limit-note'}>
            {quantity > product.stock
              ? `На складі лише ${product.stock} ${product.unit}, у кошику ${quantity}`
              : quantity >= Math.min(product.stock, 99)
                ? `У кошику весь доступний залишок: ${product.stock} ${product.unit}`
                : `На складі залишилось ${product.stock - quantity} ${product.unit}`}
          </small>
        )}
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
