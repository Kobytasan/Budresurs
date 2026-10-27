import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Heart, Leaf, Package, Search, ShieldCheck, Truck } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { api, jsonBody } from '../api'
import { ProductCard, SectionHeader, useProductCategories } from '../components/Storefront'
import { useStore } from '../contexts/StoreContext'

export function HomePage() {
  const { products, cities, productsError, refreshProducts } = useStore()
  const categories = useProductCategories(products)
  const outOfStock = products.filter((product) => product.stock === 0).length

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">СМАЧНО · СВІЖО · ПО-СУСІДСЬКИ</span>
          <h1>Турбота про себе<br />починається <em>з простого.</em></h1>
          <p>Добірні продукти для вашого столу — зручний каталог, чесна наявність та замовлення онлайн.</p>
          <Link className="button button-dark" to="/products">Перейти до каталогу <ArrowRight size={17} /></Link>
          <div className="hero-proof"><span>✳</span> Обирайте з любов’ю · доставку можна замовити у вашому місті</div>
        </div>
        <div className="hero-visual" aria-label="Свіжі продукти">
          <div className="hero-glow" />
          <span className="hero-food food-apple">🍎</span><span className="hero-food food-tomato">🍅</span>
          <span className="hero-food food-bread">🥖</span><span className="hero-food food-carrot">🥕</span>
          <span className="hero-food food-leaves">🥬</span><span className="hero-sticker">добре<br />щодня</span>
          <div className="hero-visual-caption"><Leaf size={18} /> Свіжий вибір для родини</div>
        </div>
      </section>
      {productsError && (
        <div className="page-width notice notice-error" role="alert">
          {productsError}
          <button className="text-button" type="button" onClick={() => void refreshProducts()}>
            Спробувати ще
          </button>
        </div>
      )}
      <section className="metrics-strip" aria-label="Каталог">
        <div><strong>{products.length}</strong><span>позицій у каталозі</span></div>
        <div><strong>{categories.length}</strong><span>категорій товарів</span></div>
        <div><strong>{cities.length}</strong><span>міст у списку доставки</span></div>
        <div><strong>{outOfStock}</strong><span>тимчасово відсутні</span></div>
      </section>
      <section className="home-section">
        <div className="section-intro"><span className="eyebrow">МАГАЗИН «ПРОМЕТЕЙ»</span><h2>Зручний вибір на кожен день</h2><p>Знайдіть потрібне у каталозі та додайте в кошик — залишки оновлюються автоматично.</p></div>
        <div className="category-cards">
          {categories.slice(0, 6).map((category, index) => (
            <Link className={`category-card tone-${index % 4}`} to="/products" key={category.slug}>
              <span>{['🥬', '🥛', '🥖', '🍎', '🧀', '🫙'][index]}</span>
              <strong>{category.name}</strong>
              <small>Переглянути товари <ArrowRight size={14} /></small>
            </Link>
          ))}
        </div>
        <div className="center-action"><Link className="button button-outline" to="/products">Усі товари <ArrowRight size={16} /></Link></div>
      </section>
      <section className="benefits-panel">
        <div><ShieldCheck /><span><strong>Актуальна наявність</strong><small>Каталог показує складські залишки</small></span></div>
        <div><Truck /><span><strong>Місто на ваш вибір</strong><small>Оберіть місто для замовлення</small></span></div>
        <div><Heart /><span><strong>Ваше улюблене</strong><small>Зберігайте вподобані товари</small></span></div>
        <div><Package /><span><strong>Історія покупок</strong><small>Замовлення та квитанції в кабінеті</small></span></div>
      </section>
    </>
  )
}

export function CatalogPage() {
  const { products, productsLoading, productsError, refreshProducts, favorites, customer } = useStore()
  const categories = useProductCategories(products)
  const location = useLocation()
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [showingFavorites, setShowingFavorites] = useState(location.hash === '#favorites')

  useEffect(() => {
    setShowingFavorites(location.hash === '#favorites')
    if (location.hash === '#favorites') setSelectedCategory('all')
  }, [location.hash])

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('uk')
    return products.filter((product) => {
      if (showingFavorites && !favorites.includes(product.sku)) return false
      if (selectedCategory !== 'all' && product.category !== selectedCategory) return false
      return !normalizedQuery || `${product.name} ${product.description} ${product.category_name}`
        .toLocaleLowerCase('uk').includes(normalizedQuery)
    })
  }, [products, query, selectedCategory, showingFavorites, favorites])

  function chooseCategory(category: string) {
    setShowingFavorites(false)
    setSelectedCategory(category)
    if (location.hash) window.history.replaceState(null, '', '/products')
  }

  return (
    <section className="catalog-section page-width">
      <SectionHeader
        eyebrow="АСОРТИМЕНТ"
        title={showingFavorites ? 'Улюблене' : 'Каталог товарів'}
        description={`${visibleProducts.length} ${visibleProducts.length === 1 ? 'товар' : 'товарів'} · обирайте продукти для свого столу`}
      />
      <div className="catalog-tools">
        <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук товарів…" aria-label="Пошук товарів" /></label>
        <div className="catalog-tabs" role="tablist" aria-label="Категорії">
          <button className={!showingFavorites && selectedCategory === 'all' ? 'active' : ''} type="button" onClick={() => chooseCategory('all')}>Усі товари</button>
          {categories.map((category) => (
            <button className={!showingFavorites && selectedCategory === category.slug ? 'active' : ''} type="button" key={category.slug} onClick={() => chooseCategory(category.slug)}>{category.name}</button>
          ))}
          {(favorites.length > 0 || showingFavorites) && (
            <button className={showingFavorites ? 'active' : ''} type="button" onClick={() => { setShowingFavorites(true); setQuery(''); setSelectedCategory('all'); window.history.replaceState(null, '', '/products#favorites') }}>
              <Heart size={15} /> Улюблене <span>{favorites.length}</span>
            </button>
          )}
        </div>
      </div>
      {productsLoading && <div className="loading-panel">Завантажуємо каталог…</div>}
      {!productsLoading && productsError && (
        <div className="notice notice-error" role="alert">{productsError}<button className="text-button" type="button" onClick={() => void refreshProducts()}>Спробувати ще</button></div>
      )}
      {!productsLoading && !productsError && visibleProducts.length > 0 && (
        <div className="product-grid">{visibleProducts.map((product) => <ProductCard product={product} key={product.sku} />)}</div>
      )}
      {!productsLoading && !productsError && visibleProducts.length === 0 && (
        <div className="empty-state">
          <span>{showingFavorites ? '♡' : '⌕'}</span>
          <h2>{showingFavorites ? customer ? 'Улюблене поки порожнє' : 'Увійдіть, щоб переглянути улюблене' : 'Товарів не знайдено'}</h2>
          <p>{showingFavorites ? customer ? 'Натисніть сердечко на картці товару, щоб зберегти його тут.' : 'Улюблені товари зберігаються окремо для кожного кабінету.' : 'Спробуйте змінити пошук або вибрати іншу категорію.'}</p>
          {showingFavorites && <Link to={customer ? '/products' : '/account'} className="button button-outline">{customer ? 'До каталогу' : 'Увійти або зареєструватися'}</Link>}
        </div>
      )}
    </section>
  )
}

export function AboutPage() {
  return (
    <section className="info-page page-width">
      <SectionHeader eyebrow="ПРО «ПРОМЕТЕЙ»" title="Хороші продукти. Хороші люди." description="Ми створили зручний продуктовий магазин, де легко обрати щоденні товари й перевірити їхню наявність." />
      <div className="info-card-grid">
        <article className="info-card"><span>✳</span><h2>Добираємо з турботою</h2><p>Працюємо з постачальниками та підтримуємо актуальну інформацію про асортимент і наявність товарів.</p></article>
        <article className="info-card"><span>⌖</span><h2>Доставка у вашому місті</h2><p>Місто можна вибрати на сайті. Доступність і умови доставки уточнюються для кожного міста.</p></article>
        <article className="info-card"><span>♡</span><h2>Завжди на зв’язку</h2><p>Залиште звернення в підтримку — команда побачить його у робочому кабінеті.</p><Link to="/support">Написати в підтримку <ArrowRight size={15} /></Link></article>
      </div>
    </section>
  )
}

export function SupportPage() {
  const { customer } = useStore()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setError('')
    setSubmitting(true)
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      await api('/api/support', {
        method: 'POST',
        body: jsonBody(Object.fromEntries(form)),
      })
      formElement.reset()
      setMessage('Дякуємо! Ваше звернення надіслано команді.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося надіслати звернення.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="support-page page-width">
      <div className="support-card">
        <span className="eyebrow">СЛУЖБА ПІДТРИМКИ</span>
        <h1>Чим можемо допомогти?</h1>
        <p>Напишіть нам — звернення збережеться, а команда побачить його у робочому кабінеті.</p>
        <form className="form-stack" onSubmit={submit}>
          <label>Ваше ім’я<input name="name" defaultValue={customer?.name || ''} minLength={2} maxLength={100} required /></label>
          <label>Електронна пошта<input name="email" type="email" defaultValue={customer?.email || ''} maxLength={254} required /></label>
          <label>Тема звернення<input name="subject" minLength={3} maxLength={120} required /></label>
          <label>Повідомлення<textarea name="message" minLength={10} maxLength={3000} rows={6} required /></label>
          {message && <p className="notice notice-success" role="status">{message}</p>}
          {error && <p className="form-message" role="alert">{error}</p>}
          <button className="button button-dark button-full" type="submit" disabled={submitting}>{submitting ? 'Надсилаємо…' : 'Надіслати звернення'} <ArrowRight size={16} /></button>
        </form>
      </div>
    </section>
  )
}
