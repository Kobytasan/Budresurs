import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { useReactToPrint } from 'react-to-print'
import { ArrowLeft, Camera, LogOut, Pencil, Printer, ReceiptText, ShoppingBag, X, XCircle } from 'lucide-react'
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
  const [profileEditing, setProfileEditing] = useState(false)
  const [avatarDraft, setAvatarDraft] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)
  const printReceipt = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: selectedReceipt ? `Budresurs-order-${selectedReceipt.id}` : 'Budresurs-receipt',
    onPrintError: (_location, reason) => setError(`Не вдалося надрукувати квитанцію: ${reason.message}`),
    pageStyle: '@page { size: A4; margin: 18mm; } @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }',
  })

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
      setProfileEditing(false)
      setAvatarDraft(undefined)
      setMode('login')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося вийти з кабінету.')
    } finally {
      setBusy(false)
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!customer) return
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const { customer: updated } = await api<{ customer: Customer }>('/api/customer/profile', {
        method: 'PATCH',
        body: jsonBody({
          name: values.get('name'),
          email: values.get('email'),
          phone: values.get('phone'),
          city: values.get('city'),
        }),
      })
      setCustomer(updated)
      setCity(updated.city)
      if (avatarDraft !== undefined) {
        if (avatarDraft === null) {
          await api('/api/customer/avatar', { method: 'DELETE' })
          setCustomer({ ...updated, avatar_url: null })
        } else {
          const result = await api<{ avatar_url: string }>('/api/customer/avatar', {
            method: 'PUT',
            headers: { 'Content-Type': 'text/plain' },
            body: avatarDraft,
          })
          setCustomer({ ...updated, avatar_url: result.avatar_url })
        }
      }
      setAvatarDraft(undefined)
      setProfileEditing(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося зберегти профіль.')
    } finally {
      setBusy(false)
    }
  }

  function chooseAvatar(file?: File) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      setError('Оберіть фото PNG, JPG або WebP розміром до 1 МБ.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarDraft(reader.result)
        setError('')
      } else {
        setError('Не вдалося прочитати файл зображення.')
      }
    }
    reader.onerror = () => setError('Не вдалося прочитати файл зображення.')
    reader.readAsDataURL(file)
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
      <section className="account-page account-login-page page-width">
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
            <label>Електронна пошта<input name="email" type="email" autoComplete="email" maxLength={254} pattern="^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$" title="Введіть адресу у форматі name@example.com" required /></label>
            {registering && <><label>Номер телефону<input name="phone" type="tel" autoComplete="tel" minLength={9} maxLength={20} placeholder="+380 00 000 00 00" required /></label><label>Місто проживання<select name="city" value={cities.includes(city) ? city : (cities[0] || 'Київ')} onChange={(event) => setCity(event.target.value)} required>{(cities.length ? cities : ['Київ']).map((item) => <option key={item}>{item}</option>)}</select><small>Збережемо його у вашому профілі для замовлень.</small></label></>}
            <label>Пароль<input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 12 : undefined} maxLength={registering ? 128 : 256} required />{registering && <small>Щонайменше 12 символів.</small>}</label>
            {error && <p className="form-message" role="alert">{error}</p>}
            <button className="button button-dark button-full" type="submit" disabled={busy}>{busy ? 'Зачекайте…' : registering ? 'Зареєструватися' : 'Увійти до кабінету'}</button>
          </form>
          <Link className="back-store-link" to="/"><ArrowLeft size={15} /> Повернутися до каталогу</Link>
        </div>
      </section>
    )
  }

  return (
    <section className="account-page page-width">
      <div className="account-dashboard">
        <div className="account-dashboard-heading">
          <div className="account-profile-heading">
            <div className="account-avatar">{customer.avatar_url
              ? <img src={customer.avatar_url} alt={`Аватар ${customer.name}`} />
              : <span>{customer.name.slice(0, 1).toLocaleUpperCase('uk')}</span>}</div>
            <div><span className="eyebrow">ВАШ ОСОБИСТИЙ ПРОСТІР</span><h1>Вітаємо, {customer.name}</h1><p>{customer.email} · {customer.phone} · {customer.city}</p></div>
          </div>
          <div className="account-header-actions">
            <button className="button button-outline" type="button" disabled={busy} onClick={() => { setProfileEditing((value) => !value); setAvatarDraft(undefined); setError('') }}>
              {profileEditing ? <X size={16} /> : <Pencil size={16} />}{profileEditing ? 'Скасувати редагування' : 'Редагувати профіль'}
            </button>
            <button className="button button-outline" type="button" disabled={busy} onClick={() => void logout()}><LogOut size={16} /> Вийти</button>
          </div>
        </div>
        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {profileEditing && (
          <form className="account-profile-form" onSubmit={(event) => void saveProfile(event)}>
            <h2>Особисті дані</h2>
            <div className="account-avatar-editor">
              <div className="account-avatar account-avatar-large">
                {(avatarDraft === undefined ? customer.avatar_url : avatarDraft)
                  ? <img src={avatarDraft === undefined ? customer.avatar_url || '' : avatarDraft || ''} alt="Попередній перегляд аватара" />
                  : <span>{customer.name.slice(0, 1).toLocaleUpperCase('uk')}</span>}
              </div>
              <div className="account-avatar-actions">
                <label className="button button-outline avatar-upload-button"><Camera size={16} /> Змінити аватар
                  <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => chooseAvatar(event.currentTarget.files?.[0])} />
                </label>
                {(avatarDraft === undefined ? Boolean(customer.avatar_url) : avatarDraft !== null) && (
                  <button className="text-button" type="button" onClick={() => setAvatarDraft(null)}>Видалити фото</button>
                )}
                <small>PNG, JPG або WebP, до 1 МБ.</small>
              </div>
            </div>
            <div className="account-profile-fields">
              <label>Ім’я та прізвище<input name="name" defaultValue={customer.name} minLength={2} maxLength={100} required /></label>
              <label>Електронна пошта<input name="email" type="email" autoComplete="email" defaultValue={customer.email} maxLength={254} pattern="^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$" title="Введіть адресу у форматі name@example.com" required /></label>
              <label>Номер телефону<input name="phone" type="tel" autoComplete="tel" defaultValue={customer.phone} minLength={9} maxLength={20} required /></label>
              <label>Місто проживання<select name="city" defaultValue={customer.city} required>{cities.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <button className="button button-dark" type="submit" disabled={busy}>{busy ? 'Зберігаємо…' : 'Зберегти зміни'}</button>
          </form>
        )}
        <div className="section-heading"><div><span className="eyebrow">ВАШІ ЗАМОВЛЕННЯ</span><h2>Історія замовлень</h2></div><Link className="button button-dark" to="/products">До каталогу</Link></div>
        {orders.length === 0 ? (
          <div className="empty-state"><ShoppingBag size={34} /><h2>Ваші замовлення з’являться тут</h2><p>Замовте інструмент із каталогу, щоб відстежувати його тут.</p><Link className="button button-dark" to="/products">Обрати інструмент</Link></div>
        ) : (
          <div className="customer-order-list">{orders.map((order) => (
            <article className="customer-order-card" key={order.id}>
              <div className="order-card-header"><div><span className="eyebrow">ЗАМОВЛЕННЯ №{order.id}</span><p>{formatDate(order.created_at)} · {order.city}</p></div><span className={`badge ${order.status === 'Скасовано' ? 'badge-muted' : order.payment_status === 'Оплачено' ? 'badge-green' : 'badge-muted'}`}>{order.status === 'Скасовано' ? 'Не оплачено · скасовано' : order.payment_status}</span></div>
              <div className="order-status-line"><span>Статус замовлення</span><strong>{order.status}</strong></div>
              <div className="order-items">{order.items.map((item, index) => <div key={`${item.product_name}-${index}`}><span>{item.product_name} · {item.quantity} {item.unit}</span><strong>{formatMoney(item.line_total)}</strong></div>)}</div>
              <div className="cart-total"><span>Разом</span><strong>{formatMoney(order.total)}</strong></div>
              <button className="button button-outline" type="button" onClick={() => setSelectedReceipt(order)}><ReceiptText size={16} /> Переглянути квитанцію <Printer size={15} /></button>
              {order.status === 'Нове' && order.payment_status !== 'Оплачено' && (
                <button className="button button-outline cancel-order-button" type="button" disabled={busy} onClick={() => void cancelOrder(order)}>
                  <XCircle size={16} /> Відмовитися від замовлення
                </button>
              )}
            </article>
          ))}</div>
        )}
      </div>
      {selectedReceipt && <Receipt
        order={selectedReceipt}
        customer={customer}
        receiptRef={receiptRef}
        onPrint={printReceipt}
        onClose={() => setSelectedReceipt(null)}
      />}
    </section>
  )
}

function Receipt({
  order, customer, receiptRef, onPrint, onClose,
}: {
  order: CustomerOrder
  customer: Customer
  receiptRef: RefObject<HTMLDivElement | null>
  onPrint: () => void
  onClose: () => void
}) {
  return (
    <div className="receipt-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
        <div className="receipt-toolbar"><strong>Квитанція замовлення</strong><button className="icon-button" type="button" aria-label="Закрити квитанцію" onClick={onClose}><X size={18} /></button></div>
        <div className="receipt-paper" ref={receiptRef}>
          <header className="receipt-heading">
            <div className="receipt-brand"><span className="brand-mark">Б</span><span><strong>БУДРЕСУРС</strong><small>інструмент і будматеріали</small></span></div>
            <span className="receipt-label">КВИТАНЦІЯ ОНЛАЙН-ЗАМОВЛЕННЯ</span>
          </header>
          <div className="receipt-title-row"><div><span className="eyebrow">КАТАЛОГ «БУДРЕСУРС»</span><h1 id="receipt-title">Замовлення №{order.id}</h1></div><span className={`badge ${order.status === 'Скасовано' ? 'badge-muted' : 'badge-green'}`}>{order.status}</span></div>
          <div className="receipt-meta"><span>Дата оформлення<strong>{formatDate(order.created_at)}</strong></span><span>Місто замовлення<strong>{order.city}</strong></span></div>
          <div className="receipt-customer"><span className="eyebrow">ПОКУПЕЦЬ</span><strong>{order.customer_name || customer.name}</strong><span>{customer.email}</span><span>{order.phone || customer.phone}</span></div>
          <table className="receipt-table"><thead><tr><th>Товар</th><th>Кількість</th><th>Ціна</th><th>Сума</th></tr></thead><tbody>
            {order.items.map((item, index) => <tr key={`${item.product_name}-${index}`}><td>{item.product_name}</td><td>{item.quantity} {item.unit}</td><td>{formatMoney(item.unit_price)}</td><td>{formatMoney(item.line_total)}</td></tr>)}
          </tbody></table>
          <div className="receipt-total"><span>Усього до сплати</span><strong>{formatMoney(order.total)}</strong></div>
          <div className="receipt-payment"><span>Оплата</span><strong>{order.status === 'Скасовано' ? 'Не оплачено · замовлення скасовано' : order.payment_status}</strong></div>
          <footer className="receipt-footnote">Квитанція підтверджує онлайн-замовлення й не є фіскальним чеком.</footer>
        </div>
        <div className="receipt-actions"><button className="button button-outline" type="button" onClick={onClose}>Закрити</button><button className="button button-dark" type="button" onClick={onPrint}><Printer size={16} /> Друкувати / зберегти PDF</button></div>
      </section>
    </div>
  )
}
