import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, LogOut, Printer, ReceiptText, ShoppingBag, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, jsonBody } from '../api'
import { formatDate, formatMoney } from '../components/Storefront'
import { useStore } from '../contexts/StoreContext'
import type { Customer, CustomerOrder } from '../types'

type Mode = 'login' | 'register'

export function AccountPage() {
  const { cities, city, setCity, customer, setCustomer } = useStore()
  const [mode, setMode] = useState<Mode>('login')
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [selectedReceipt, setSelectedReceipt] = useState<CustomerOrder | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadOrders = async () => {
    const result = await api<{ orders: CustomerOrder[] }>('/api/customer/orders')
    setOrders(result.orders)
  }

  useEffect(() => {
    let active = true
    api<{ customer: Customer }>('/api/customer/me')
      .then(({ customer: current }) => {
        if (!active) return
        setCustomer(current)
      })
      .catch((reason: unknown) => {
        if (!active) return
        if (!(typeof reason === 'object' && reason !== null && 'status' in reason && reason.status === 401)) {
          setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити профіль.')
        }
      })
    return () => { active = false }
  }, [setCustomer])

  useEffect(() => {
    if (!customer) return
    void loadOrders().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити історію покупок.')
    })
    if (customer.city) setCity(customer.city)
  }, [customer, setCity])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setBusy(true)
    setError('')
    try {
      const result = mode === 'login'
        ? await api<{ customer: Customer }>('/api/customer/login', {
          method: 'POST',
          body: jsonBody({ email: values.get('email'), password: values.get('password') }),
        })
        : await api<{ customer: Customer }>('/api/customer/register', {
          method: 'POST',
          body: jsonBody({
            name: values.get('name'),
            email: values.get('email'),
            phone: values.get('phone'),
            city: values.get('city'),
            password: values.get('password'),
          }),
        })
      setCustomer(result.customer)
      if (mode === 'register') setCity(result.customer.city)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося виконати запит.')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    setError('')
    try {
      await api('/api/customer/logout', { method: 'POST', body: jsonBody({}) })
      setCustomer(null)
      setOrders([])
      setSelectedReceipt(null)
      setMode('login')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося вийти з кабінету.')
    } finally {
      setBusy(false)
    }
  }

  async function cancelOrder(order: CustomerOrder) {
    if (!window.confirm(`Відмовитися від замовлення №${order.id}? Товари повернуться на склад.`)) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ status: string }>(`/api/customer/orders/${order.id}/cancel`, {
        method: 'POST',
        body: jsonBody({}),
      })
      setOrders((current) => current.map((item) => item.id === order.id
        ? { ...item, status: result.status }
        : item))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося скасувати замовлення.')
    } finally {
      setBusy(false)
    }
  }

  if (!customer) {
    const registering = mode === 'register'
    return (
      <section className="account-page page-width">
        <div className="account-card">
          <div className="account-mark">♡</div>
          <span className="eyebrow">ВАШ ОСОБИСТИЙ ПРОСТІР</span>
          <h1>{registering ? 'Створіть свій кабінет' : 'Раді бачити знову'}</h1>
          <p>{registering ? 'Зареєструйтеся, щоб зберігати історію покупок і квитанції.' : 'Увійдіть, щоб переглянути замовлення та квитанції.'}</p>
          <div className="auth-switch" role="tablist" aria-label="Вхід або реєстрація">
            <button className={!registering ? 'active' : ''} type="button" role="tab" aria-selected={!registering} onClick={() => { setMode('login'); setError('') }}>Увійти</button>
            <button className={registering ? 'active' : ''} type="button" role="tab" aria-selected={registering} onClick={() => { setMode('register'); setError('') }}>Створити кабінет</button>
          </div>
          <form className="form-stack" onSubmit={(event) => void submit(event)}>
            {registering && <label>Ваше ім’я<input name="name" autoComplete="name" minLength={2} maxLength={100} required /></label>}
            <label>Електронна пошта<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
            {registering && <><label>Номер телефону<input name="phone" type="tel" autoComplete="tel" minLength={9} maxLength={20} placeholder="+380 00 000 00 00" required /></label><label>Ваше місто<select name="city" value={cities.includes(city) ? city : (cities[0] || 'Київ')} onChange={(event) => setCity(event.target.value)} required>{(cities.length ? cities : ['Київ']).map((item) => <option key={item}>{item}</option>)}</select></label></>}
            <label>Пароль<input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 12 : undefined} maxLength={registering ? 128 : 256} required />{registering && <small>Щонайменше 12 символів.</small>}</label>
            {error && <p className="form-message" role="alert">{error}</p>}
            <button className="button button-dark button-full" type="submit" disabled={busy}>{busy ? 'Зачекайте…' : registering ? 'Зареєструватися' : 'Увійти до кабінету'}</button>
          </form>
          <Link className="back-store-link" to="/"><ArrowLeft size={15} /> Повернутися до магазину</Link>
        </div>
      </section>
    )
  }

  return (
    <section className="account-page page-width">
      <div className="account-dashboard">
        <div className="account-dashboard-heading">
          <div><span className="eyebrow">ВАШ ОСОБИСТИЙ ПРОСТІР</span><h1>Вітаємо, {customer.name}</h1><p>{customer.email} · {customer.phone} · {customer.city}</p></div>
          <button className="button button-outline" type="button" disabled={busy} onClick={() => void logout()}><LogOut size={16} /> Вийти</button>
        </div>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        <div className="section-heading"><div><span className="eyebrow">ВАШІ ПОКУПКИ</span><h2>Історія замовлень</h2></div><Link className="button button-dark" to="/products">До каталогу</Link></div>
        {orders.length === 0 ? (
          <div className="empty-state"><ShoppingBag size={34} /><h2>Ваші покупки з’являться тут</h2><p>Оформлюйте замовлення, коли увійшли до кабінету.</p><Link className="button button-dark" to="/products">Обрати продукти</Link></div>
        ) : (
          <div className="customer-order-list">{orders.map((order) => (
            <article className="customer-order-card" key={order.id}>
              <div className="order-card-header"><div><span className="eyebrow">ЗАМОВЛЕННЯ №{order.id}</span><p>{formatDate(order.created_at)} · {order.city}</p></div><span className={`badge ${order.payment_status === 'Оплачено' ? 'badge-green' : 'badge-muted'}`}>{order.payment_status}</span></div>
              <div className="order-status-line"><span>Статус замовлення</span><strong>{order.status}</strong></div>
              <div className="order-items">{order.items.map((item, index) => <div key={`${item.product_name}-${index}`}><span>{item.product_name} · {item.quantity} {item.unit}</span><strong>{formatMoney(item.line_total)}</strong></div>)}</div>
              <div className="cart-total"><span>Разом</span><strong>{formatMoney(order.total)}</strong></div>
              <button className="button button-outline" type="button" onClick={() => { setSelectedReceipt(order); window.setTimeout(() => window.print(), 50) }}><ReceiptText size={16} /> Переглянути / друкувати квитанцію <Printer size={15} /></button>
              {order.status === 'Нове' && order.payment_status !== 'Оплачено' && (
                <button className="button button-outline cancel-order-button" type="button" disabled={busy} onClick={() => void cancelOrder(order)}>
                  <XCircle size={16} /> Відмовитися від замовлення
                </button>
              )}
            </article>
          ))}</div>
        )}
        {selectedReceipt && <Receipt order={selectedReceipt} customer={customer} />}
      </div>
    </section>
  )
}

function Receipt({ order, customer }: { order: CustomerOrder; customer: Customer }) {
  return (
    <section className="receipt-print" aria-label="Квитанція замовлення">
      <div className="receipt-brand">прометей <small>магазин добрих продуктів</small></div>
      <h1>Квитанція замовлення №{order.id}</h1>
      <p>{formatDate(order.created_at)}</p>
      <p>Покупець: {customer.name}<br />{customer.email}<br />Місто доставки: {order.city}</p>
      <hr />
      {order.items.map((item, index) => <div className="receipt-line" key={`${item.product_name}-${index}`}><span>{item.product_name} · {item.quantity} {item.unit} × {formatMoney(item.unit_price)}</span><strong>{formatMoney(item.line_total)}</strong></div>)}
      <hr />
      <div className="receipt-line receipt-grand-total"><strong>Разом</strong><strong>{formatMoney(order.total)}</strong></div>
      <p>Оплата: {order.payment_status}<br />Статус: {order.status}</p>
      <p>Квитанція підтверджує онлайн-замовлення й не є фіскальним чеком.</p>
    </section>
  )
}
