import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, GitCompareArrows, MessageSquareText, PackageCheck, Star } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api, jsonBody } from '../api'
import { ProductCard, formatMoney } from '../components/Storefront'
import { useStore } from '../contexts/StoreContext'
import { getProductMedia } from '../productMedia'
import type { ProductReview } from '../types'

interface ReviewResponse {
  average_rating: number
  review_count: number
  reviews: ProductReview[]
  mine: ProductReview | null
}

const specifications: Record<string, Array<[string, string]>> = {
  'BR-DRILL-18': [['Живлення', 'Акумулятор 18 В'], ['Швидкості', '2'], ['Діаметр патрона', '13 мм'], ['Комплектація', 'Акумулятор і зарядний пристрій']],
  'BR-GRINDER-125': [['Потужність', '900 Вт'], ['Діаметр диска', '125 мм'], ['Особливості', 'Плавний пуск, захист від повторного ввімкнення']],
  'BR-SAW-185': [['Потужність', '1400 Вт'], ['Діаметр диска', '185 мм'], ['Глибина пропилу', 'До 65 мм'], ['Комплектація', 'Паралельний упор']],
  'BR-PERFORATOR-800': [['Потужність', '800 Вт'], ['Патрон', 'SDS-plus'], ['Режими', '3'], ['Особливості', 'Обмежувач глибини']],
  'BR-HAMMER-500': [['Вага головки', '500 г'], ['Головка', 'Кована сталь'], ['Руків’я', 'Фібергласове, протиковзке']],
  'BR-TAPE-5M': [['Довжина', '5 м'], ['Ширина стрічки', '25 мм'], ['Особливості', 'Автоматична фіксація']],
  'BR-LEVEL-LASER': [['Тип', 'Лазерний 2D'], ['Точність', '±0,3 мм/м'], ['Комплектація', 'Магнітний кронштейн']],
  'BR-LEVEL-600': [['Довжина', '600 мм'], ['Профіль', 'Посилений алюмінієвий'], ['Капсули', '2']],
  'BR-DRILL-BIT-SET': [['Кількість', '13 шт.'], ['Матеріал', 'Швидкорізальна сталь HSS'], ['Діаметри', '1,5–6,5 мм']],
  'BR-SCREW-WOOD-5X70': [['Розмір', '5 × 70 мм'], ['Покриття', 'Оцинковане'], ['Фасування', '100 шт.']],
  'BR-ANCHOR-10X80': [['Розмір', '10 × 80 мм'], ['Матеріал', 'Оцинкована сталь'], ['Основа', 'Бетон і цегла']],
  'BR-HELMET': [['Оголів’я', 'Регульоване'], ['Корпус', 'Міцний, з вентиляційними отворами']],
  'BR-GLASSES': [['Лінзи', 'Ударостійкі, прозорі'], ['Захист', 'Бічний'], ['Покриття', 'Проти подряпин']],
  'BR-GLOVES': [['Покриття', 'Нітрилове'], ['Комплектація', 'Пара'], ['Особливості', 'Дихаюча основа, надійне зчеплення']],
  'BR-LADDER-3': [['Сходинки', '3'], ['Робоча висота', 'До 2,6 м'], ['Особливості', 'Протиковзкі опори']],
  'BR-STEP-2': [['Сходинки', '2'], ['Матеріал', 'Сталь'], ['Призначення', 'Оздоблювальні та монтажні роботи']],
  'BR-EXTENSION-5': [['Довжина кабелю', '5 м'], ['Захист', 'Заземлення, захисна кришка']],
  'BR-WRENCH-SET': [['Кількість', '12 шт.'], ['Розмір', '8–19 мм'], ['Матеріал', 'Хромованадієва сталь']],
  'BR-PLIERS-180': [['Довжина', '180 мм'], ['Руків’я', 'Двокомпонентне'], ['Губки', 'Індукційно загартовані']],
  'BR-SCREWDRIVER-SET': [['Кількість', '6 шт.'], ['Типи', 'Шліцьові та хрестові'], ['Особливості', 'Магнітні жала']],
}

function Stars({ value, label }: { value: number; label?: string }) {
  return (
    <span className="rating-stars" aria-label={label || `Оцінка ${value.toFixed(1)} з 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} size={16} fill={index < Math.round(value) ? 'currentColor' : 'none'} />
      ))}
    </span>
  )
}

export function ProductPage() {
  const { sku = '' } = useParams()
  const { products, productsLoading, customer, adjustCart, cart, showToast } = useStore()
  const [reviews, setReviews] = useState<ReviewResponse | null>(null)
  const [reviewsError, setReviewsError] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [comparisonSku, setComparisonSku] = useState('')
  const product = products.find((item) => item.sku === sku)
  const productSku = product?.sku
  const similar = useMemo(
    () => product ? products.filter((item) => item.category === product.category && item.sku !== product.sku) : [],
    [products, product],
  )
  const comparison = similar.find((item) => item.sku === comparisonSku) || similar[0]
  const media = product ? getProductMedia(product) : null
  const quantity = product ? cart[product.sku] || 0 : 0

  useEffect(() => {
    if (!productSku) return
    let active = true
    setReviews(null)
    setReviewsError('')
    void api<ReviewResponse>(`/api/products/${encodeURIComponent(productSku)}/reviews`)
      .then((result) => {
        if (!active) return
        setReviews(result)
        if (result.mine) {
          setRating(result.mine.rating)
          setComment(result.mine.comment)
        } else {
          setRating(5)
          setComment('')
        }
      })
      .catch((error: unknown) => {
        if (active) setReviewsError(error instanceof Error ? error.message : 'Не вдалося завантажити відгуки.')
      })
    return () => { active = false }
  }, [productSku])

  if (!product) {
    return (
      <section className="product-detail-page page-width">
        <Link className="back-store-link" to="/products"><ArrowLeft size={16} /> До каталогу</Link>
        <div className="empty-state"><h1>{productsLoading ? 'Завантажуємо товар…' : 'Товар не знайдено'}</h1><p>Перевірте посилання або поверніться до каталогу.</p><Link className="button button-dark" to="/products">Відкрити каталог</Link></div>
      </section>
    )
  }

  const selectedProduct = product

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setReviewBusy(true)
    setReviewsError('')
    try {
      const result = await api<ReviewResponse>(`/api/products/${encodeURIComponent(selectedProduct.sku)}/reviews`, {
        method: 'POST',
        body: jsonBody({ rating, comment }),
      })
      setReviews(result)
      showToast('Дякуємо! Ваш відгук збережено.')
    } catch (error) {
      setReviewsError(error instanceof Error ? error.message : 'Не вдалося зберегти відгук.')
    } finally {
      setReviewBusy(false)
    }
  }

  function addToCart() {
    if (selectedProduct.stock < 1) {
      showToast('Цього товару зараз немає на складі.')
      return
    }
    if (quantity >= Math.min(selectedProduct.stock, 99)) {
      showToast(`Доступно не більше ${Math.min(selectedProduct.stock, 99)} ${selectedProduct.unit}.`)
      return
    }
    adjustCart(selectedProduct.sku, 1)
    showToast(`${selectedProduct.name} додано до кошика`)
  }

  return (
    <main className="product-detail-page page-width">
      <nav className="product-breadcrumbs" aria-label="Навігаційний ланцюжок">
        <Link to="/">Головна</Link><span>/</span><Link to="/products">Каталог</Link><span>/</span><Link to={`/products?category=${encodeURIComponent(product.category)}`}>{product.category_name}</Link><span>/</span><span>{product.name}</span>
      </nav>
      <section className="product-detail-main">
        <div className="product-detail-gallery">
          <div className={`product-detail-photo ${product.color}`}>
            <img src={media?.src} alt={product.name} />
            <span className="product-detail-label"><Check size={14} /> Фото для ілюстрації типу товару</span>
          </div>
          <small className="photo-credit">Фото: <a href={media?.source} target="_blank" rel="noreferrer">{media?.title}</a> — {media?.author}, {media?.license}.</small>
        </div>
        <div className="product-detail-info">
          <span className="eyebrow">{product.category_name}</span>
          <h1>{product.name}</h1>
          <a className="review-summary-link" href="#reviews">
            <Stars value={reviews?.average_rating || 0} />
            <span>{reviews?.review_count ? `${reviews.average_rating.toFixed(1)} · ${reviews.review_count} відгуків` : 'Поки немає відгуків'}</span>
          </a>
          <p className="product-detail-description">{product.description}</p>
          <div className="product-detail-price">{formatMoney(product.price)} <small>/ {product.unit}</small></div>
          <div className={`product-availability${product.stock < 1 ? ' unavailable' : ''}`}>
            <PackageCheck size={18} /> {product.stock > 0 ? `Є в наявності · ${product.stock} ${product.unit}` : 'Наразі немає в наявності'}
          </div>
          <div className="product-detail-actions">
            <button className="button button-dark" type="button" disabled={product.stock < 1 || quantity >= Math.min(product.stock, 99)} onClick={addToCart}>
              {quantity > 0 ? `У кошику: ${quantity} · Додати ще` : 'Додати до кошика'}
            </button>
            <a className="button button-outline" href="#compare"><GitCompareArrows size={17} /> Порівняти</a>
          </div>
          <div className="product-detail-note"><Check size={16} /> Остаточна наявність перевіряється під час оформлення замовлення.</div>
        </div>
      </section>

      <section className="product-detail-section" aria-labelledby="specifications-title">
        <div className="product-section-heading"><span className="eyebrow">ДЕТАЛЬНІШЕ ПРО ТОВАР</span><h2 id="specifications-title">Опис і характеристики</h2></div>
        <p className="product-long-description">{product.description} Підійде для робіт, зазначених у характеристиках; перед використанням дотримуйтеся інструкцій виробника та правил безпеки.</p>
        <dl className="product-specification-list">
          <div><dt>Артикул</dt><dd>{product.sku}</dd></div>
          <div><dt>Категорія</dt><dd>{product.category_name}</dd></div>
          <div><dt>Одиниця продажу</dt><dd>{product.unit}</dd></div>
          {(specifications[product.sku] || []).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      </section>

      <section className="product-detail-section" id="compare" aria-labelledby="compare-title">
        <div className="product-section-heading"><span className="eyebrow">ОБЕРІТЬ ПІД СВОЄ ЗАВДАННЯ</span><h2 id="compare-title">Порівняти з подібним</h2></div>
        {similar.length ? (
          <>
            <label className="comparison-picker">Порівняти з<select value={comparison?.sku || ''} onChange={(event) => setComparisonSku(event.target.value)}>{similar.map((item) => <option key={item.sku} value={item.sku}>{item.name}</option>)}</select></label>
            {comparison && <div className="product-comparison">
              {[product, comparison].map((item) => (
                <article key={item.sku}>
                  <img src={getProductMedia(item).src} alt="" loading="lazy" />
                  <h3>{item.name}</h3>
                  <strong>{formatMoney(item.price)} <small>/ {item.unit}</small></strong>
                  <p>{item.description}</p>
                  <dl>{(specifications[item.sku] || []).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                  <Link to={`/products/${encodeURIComponent(item.sku)}`}>Сторінка товару <ArrowRight size={14} /></Link>
                </article>
              ))}
            </div>}
          </>
        ) : <p className="empty-inline">У цій категорії поки немає іншого товару для порівняння.</p>}
      </section>

      <section className="product-detail-section" id="reviews" aria-labelledby="reviews-title">
        <div className="product-section-heading"><span className="eyebrow">ДОСВІД ПОКУПЦІВ</span><h2 id="reviews-title">Відгуки й оцінки</h2></div>
        <div className="product-review-summary">
          <strong>{reviews?.review_count ? reviews.average_rating.toFixed(1) : '—'}</strong>
          <span><Stars value={reviews?.average_rating || 0} /><small>{reviews?.review_count ? `${reviews.review_count} відгуків` : 'Відгуків ще немає'}</small></span>
        </div>
        {reviewsError && <p className="form-message" role="alert">{reviewsError}</p>}
        <div className="product-review-list">
          {reviews?.reviews.length
            ? reviews.reviews.map((review) => (
              <article className="product-review" key={review.id}>
                <div><strong>{review.name}</strong><Stars value={review.rating} /><time dateTime={review.created_at}>{new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium' }).format(new Date(review.created_at))}</time></div>
                <p>{review.comment}</p>
              </article>
            ))
            : <p className="empty-inline"><MessageSquareText size={17} /> Перший відгук допоможе іншим обрати інструмент.</p>}
        </div>
        {customer ? (
          <form className="product-review-form" onSubmit={(event) => void submitReview(event)}>
            <h3>{reviews?.mine ? 'Оновити свій відгук' : 'Залишити відгук'}</h3>
            <label>Ваша оцінка<select value={rating} onChange={(event) => setRating(Number(event.target.value))}>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} з 5</option>)}</select></label>
            <label>Коментар<textarea value={comment} onChange={(event) => setComment(event.target.value)} minLength={5} maxLength={1500} rows={4} placeholder="Розкажіть про досвід використання" required /></label>
            <button className="button button-dark" type="submit" disabled={reviewBusy}>{reviewBusy ? 'Зберігаємо…' : 'Опублікувати відгук'}</button>
          </form>
        ) : <p className="review-login-prompt"><Link to="/account">Увійдіть до кабінету</Link>, щоб залишити оцінку та відгук.</p>}
      </section>

      <section className="product-detail-section related-products" aria-labelledby="related-title">
        <div className="product-section-heading"><span className="eyebrow">{product.category_name}</span><h2 id="related-title">Схожі товари</h2></div>
        <div className="product-grid">{similar.slice(0, 4).map((item) => <ProductCard key={item.sku} product={item} />)}</div>
        <Link className="related-catalog-link" to={`/products?category=${encodeURIComponent(product.category)}`}>Усі товари категорії <ArrowRight size={15} /></Link>
      </section>
    </main>
  )
}
