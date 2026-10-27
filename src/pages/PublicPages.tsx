import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Drill, HardHat, Hammer, Heart, Package, Ruler, Search, ShieldCheck, Truck, Wrench } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { api, jsonBody } from '../api'
import { ProductCard, SectionHeader, useProductCategories } from '../components/Storefront'
import { useStore } from '../contexts/StoreContext'

const categoryIcons: Record<string, typeof Drill> = {
  elektroinstrument: Drill,
  'ruchnyi-instrument': Hammer,
  'vymiriuvalnyi-instrument': Ruler,
  'kripylne-osnashchennia': Wrench,
  'zasoby-zakhystu': HardHat,
  'lestnytsi-ta-dostup': Package,
}

export function HomePage() {
  const { products, cities, productsError, refreshProducts } = useStore()
  const categories = useProductCategories(products)
  const outOfStock = products.filter((product) => product.stock === 0).length

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">БУДІВЕЛЬНИЙ ІНСТРУМЕНТ · ПЕРЕВІРЕНИЙ ВИБІР</span>
          <h1>Точний інструмент.<br /><em>Надійний результат.</em></h1>
          <p>Каталог «Будресурс» — електроінструмент, оснащення та засоби захисту для майстрів і будівельних команд.</p>
          <Link className="button button-dark" to="/products">Переглянути каталог <ArrowRight size={17} /></Link>
          <div className="hero-proof"><span>✓</span> Зрозумілі характеристики · актуальна наявність</div>
        </div>
        <div className="hero-visual" aria-label="Підбірка будівельного інструменту">
          <div className="hero-tool-grid">
            <div className="hero-tool-card hero-tool-card-main"><Drill size={76} strokeWidth={1.3} /><span>Електроінструмент</span></div>
            <div className="hero-tool-card"><Hammer size={44} strokeWidth={1.4} /><span>Ручний інструмент</span></div>
            <div className="hero-tool-card"><Ruler size={42} strokeWidth={1.4} /><span>Вимірювання</span></div>
            <div className="hero-tool-badge"><HardHat size={20} /> ВИБІР МАЙСТРІВ</div>
          </div>
          <div className="hero-visual-caption"><Wrench size={18} /> Інструмент, що працює</div>
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
        <div><strong>{products.length}</strong><span>позицій каталогу</span></div>
        <div><strong>{categories.length}</strong><span>категорій інструменту</span></div>
        <div><strong>{cities.length}</strong><span>міст обслуговування</span></div>
        <div><strong>{outOfStock}</strong><span>позицій очікують поставки</span></div>
      </section>
      <section className="home-section">
        <div className="section-intro"><span className="eyebrow">КАТАЛОГ «БУДРЕСУРС»</span><h2>Усе для роботи на об’єкті</h2><p>Оберіть категорію, порівняйте характеристики та перевірте наявність перед замовленням.</p></div>
        <div className="category-cards">
          {categories.slice(0, 6).map((category, index) => (
            <Link className={`category-card tone-${index % 4}`} to={`/products?category=${encodeURIComponent(category.slug)}`} key={category.slug}>
              <span>{(() => {
                const Icon = categoryIcons[category.slug] || Package
                return <Icon size={25} />
              })()}</span>
              <strong>{category.name}</strong>
              <small>Переглянути інструмент <ArrowRight size={14} /></small>
            </Link>
          ))}
        </div>
        <div className="center-action"><Link className="button button-outline" to="/products">Увесь каталог <ArrowRight size={16} /></Link></div>
      </section>
      <section className="benefits-panel">
        <div><ShieldCheck /><span><strong>Перевірена наявність</strong><small>Залишки оновлюються з робочого кабінету</small></span></div>
        <div><Truck /><span><strong>Зручне отримання</strong><small>Виберіть місто для вашого замовлення</small></span></div>
        <div><Heart /><span><strong>Список обраного</strong><small>Збережіть потрібні позиції у кабінеті</small></span></div>
        <div><Package /><span><strong>Замовлення під контролем</strong><small>Статус і квитанції у вашому кабінеті</small></span></div>
      </section>
    </>
  )
}

export function CatalogPage() {
  const { products, productsLoading, productsError, refreshProducts, favorites, customer } = useStore()
  const categories = useProductCategories(products)
  const location = useLocation()
  const [selectedCategory, setSelectedCategory] = useState(
    () => new URLSearchParams(location.search).get('category') || 'all',
  )
  const [query, setQuery] = useState('')
  const [showingFavorites, setShowingFavorites] = useState(location.hash === '#favorites')

  useEffect(() => {
    setShowingFavorites(location.hash === '#favorites')
    if (location.hash === '#favorites') {
      setSelectedCategory('all')
    } else {
      const requestedCategory = new URLSearchParams(location.search).get('category')
      setSelectedCategory(categories.some((category) => category.slug === requestedCategory)
        ? requestedCategory || 'all'
        : 'all')
    }
  }, [location.hash, location.search, categories])

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
        eyebrow="ІНСТРУМЕНТ ТА ОСНАЩЕННЯ"
        title={showingFavorites ? 'Обране' : 'Каталог інструменту'}
        description={`${visibleProducts.length} ${visibleProducts.length === 1 ? 'позиція' : 'позицій'} · перегляньте наявність і виберіть потрібне для роботи`}
      />
      <div className="catalog-tools">
        <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Знайти інструмент…" aria-label="Пошук інструменту" /></label>
        <div className="catalog-tabs" role="tablist" aria-label="Категорії інструменту">
          <button className={!showingFavorites && selectedCategory === 'all' ? 'active' : ''} type="button" onClick={() => chooseCategory('all')}>Усі категорії</button>
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
          <h2>{showingFavorites ? customer ? 'Список обраного поки порожній' : 'Увійдіть, щоб переглянути обране' : 'Інструмент не знайдено'}</h2>
          <p>{showingFavorites ? customer ? 'Натисніть сердечко на картці інструменту, щоб зберегти позицію.' : 'Збережені позиції доступні у вашому кабінеті.' : 'Змініть пошуковий запит або виберіть іншу категорію.'}</p>
          {showingFavorites && <Link to={customer ? '/products' : '/account'} className="button button-outline">{customer ? 'До каталогу' : 'Увійти до кабінету'}</Link>}
        </div>
      )}
    </section>
  )
}

export function AboutPage() {
  return (
    <section className="info-page page-width">
      <SectionHeader eyebrow="ПРО «БУДРЕСУРС»" title="Надійний інструмент для вашої справи." description="Каталог будівельних інструментів, де зручно підібрати оснащення, перевірити наявність і оформити замовлення." />
      <div className="info-card-grid">
        <article className="info-card"><span><Drill size={21} /></span><h2>Для майстрів і команд</h2><p>Електроінструмент, ручний інструмент, оснащення та засоби захисту зібрані в одному каталозі.</p></article>
        <article className="info-card"><span><ShieldCheck size={21} /></span><h2>Зрозумілий вибір</h2><p>Переглядайте описи, ціни та складські залишки, щоб підготуватися до роботи без зайвих пошуків.</p></article>
        <article className="info-card"><span><Wrench size={21} /></span><h2>Допоможемо підібрати</h2><p>Не знайшли потрібну позицію або маєте запитання? Напишіть команді «Будресурс».</p><Link to="/support">Зв’язатися з нами <ArrowRight size={15} /></Link></article>
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
        <h1>Потрібна порада щодо інструменту?</h1>
        <p>Залиште запит щодо асортименту, характеристик або замовлення — команда «Будресурс» відповість вам.</p>
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
