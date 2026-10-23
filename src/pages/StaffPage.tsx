import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  BadgeDollarSign,
  Boxes,
  BriefcaseBusiness,
  ArrowRight,
  CalendarClock,
  Check,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Store,
  Users,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, jsonBody } from '../api'
import { formatDate, formatMoney, SectionHeader } from '../components/Storefront'
import type {
  AdminOrder,
  ApiProduct,
  StaffRecord,
  StaffRole,
  StaffUser,
  StatusHistoryEntry,
  Supplier,
  SupportMessage,
} from '../types'

type TabId = 'overview' | 'finance' | 'inventory' | 'team' | 'history' | 'suppliers' | 'support'
interface Tab { id: TabId; label: string; icon: typeof LayoutDashboard }
interface Overview {
  financials: { order_count: number; revenue: number; paid: number; due: number }
  products_count?: number
  low_stock_count?: number
  staff_count?: number
}

const roleNames: Record<StaffRole, string> = {
  director: 'Директор',
  accountant: 'Бухгалтер',
  inventory: 'Працівник складу',
}

const tabsByRole: Record<StaffRole, Tab[]> = {
  director: [
    { id: 'overview', label: 'Огляд', icon: LayoutDashboard },
    { id: 'finance', label: 'Фінанси та замовлення', icon: BadgeDollarSign },
    { id: 'inventory', label: 'Товари та склад', icon: Boxes },
    { id: 'team', label: 'Працівники', icon: Users },
    { id: 'history', label: 'Історія статусів', icon: CalendarClock },
    { id: 'suppliers', label: 'Постачальники', icon: Package },
    { id: 'support', label: 'Підтримка', icon: CircleHelp },
  ],
  accountant: [
    { id: 'overview', label: 'Огляд фінансів', icon: LayoutDashboard },
    { id: 'finance', label: 'Фінансовий журнал', icon: BadgeDollarSign },
  ],
  inventory: [
    { id: 'overview', label: 'Огляд складу', icon: LayoutDashboard },
    { id: 'inventory', label: 'Товари та склад', icon: Boxes },
  ],
}

function shortDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours} год ${minutes} хв`
}

export function StaffPage() {
  const [user, setUser] = useState<StaffUser | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [demoStaff, setDemoStaff] = useState<StaffUser[]>([])
  const [demoEnabled, setDemoEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [staff, setStaff] = useState<StaffRecord[]>([])
  const [history, setHistory] = useState<StatusHistoryEntry[]>([])
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [workStatus, setWorkStatus] = useState('На роботі')
  const [mobileMenu, setMobileMenu] = useState(false)
  const tabs = user ? tabsByRole[user.role] : []

  const loadDemoStaff = useCallback(async () => {
    try {
      const result = await api<{ enabled: boolean; staff: StaffUser[] }>('/api/demo/staff')
      setDemoEnabled(result.enabled)
      setDemoStaff(result.staff)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити список працівників.')
    }
  }, [])

  const loadTab = useCallback(async () => {
    if (!user) return
    setError('')
    try {
      if (activeTab === 'overview' && user.role === 'inventory') {
        const result = await api<{ products: ApiProduct[] }>('/api/admin/products')
        setProducts(result.products)
      }
      if ((activeTab === 'overview' && user.role !== 'inventory') || activeTab === 'finance') {
        const [overviewResult, orderResult] = await Promise.all([
          api<Overview>('/api/admin/overview'),
          api<{ orders: AdminOrder[] }>('/api/admin/orders'),
        ])
        setOverview(overviewResult)
        setOrders(orderResult.orders)
      }
      if (activeTab === 'inventory') {
        const result = await api<{ products: ApiProduct[]; suppliers: { id: number; name: string }[] }>('/api/admin/products')
        setProducts(result.products)
        setSuppliers((current) => current.length ? current : result.suppliers.map((supplier) => ({
          ...supplier, contact_name: '', phone: '', email: '', address: '', notes: '', active: true,
        })))
      }
      if (activeTab === 'team') {
        const result = await api<{ users: StaffRecord[] }>('/api/admin/users')
        setStaff(result.users)
      }
      if (activeTab === 'history') {
        const result = await api<{ history: StatusHistoryEntry[] }>('/api/admin/status-history')
        setHistory(result.history)
      }
      if (activeTab === 'suppliers') {
        const result = await api<{ suppliers: Supplier[] }>('/api/admin/suppliers')
        setSuppliers(result.suppliers)
      }
      if (activeTab === 'support') {
        const result = await api<{ messages: SupportMessage[] }>('/api/admin/support')
        setMessages(result.messages)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити дані кабінету.')
    }
  }, [activeTab, user])

  useEffect(() => {
    let active = true
    api<{ user: StaffUser }>('/api/auth/me')
      .then(({ user: current }) => {
        if (!active) return
        setUser(current)
        setWorkStatus(current.work_status || 'На роботі')
      })
      .catch((reason: unknown) => {
        if (!active) return
        if (typeof reason === 'object' && reason !== null && 'status' in reason && reason.status === 401) {
          void loadDemoStaff()
        } else {
          setError(reason instanceof Error ? reason.message : 'Не вдалося перевірити сеанс.')
        }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadDemoStaff])

  useEffect(() => {
    if (!user) return
    void loadTab()
    const timer = window.setInterval(() => { void loadTab() }, 15_000)
    return () => window.clearInterval(timer)
  }, [user, loadTab])

  async function signIn(username: string, password: string) {
    setBusy(true)
    setError('')
    try {
      const result = await api<{ user: StaffUser }>('/api/auth/login', {
        method: 'POST',
        body: jsonBody({ username, password }),
      })
      setUser(result.user)
      setWorkStatus(result.user.work_status || 'На роботі')
      setActiveTab('overview')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося увійти.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    try {
      await api('/api/auth/logout', { method: 'POST', body: jsonBody({}) })
      setUser(null)
      setOverview(null)
      setActiveTab('overview')
      await loadDemoStaff()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося завершити сеанс.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="loading-panel">Завантажуємо робочий простір…</div>

  if (!user) {
    return (
      <StaffLogin
        demoStaff={demoEnabled ? demoStaff : []}
        busy={busy}
        error={error}
        onLogin={signIn}
        onDemoLogin={async (id) => {
          setBusy(true)
          setError('')
          try {
            const result = await api<{ user: StaffUser }>('/api/demo/login', {
              method: 'POST', body: jsonBody({ user_id: id }),
            })
            setUser(result.user)
            setWorkStatus(result.user.work_status || 'На роботі')
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Не вдалося відкрити профіль.')
          } finally {
            setBusy(false)
          }
        }}
      />
    )
  }

  const currentTab = tabs.find((tab) => tab.id === activeTab) || tabs[0]

  async function saveWorkStatus() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api<{ work_status: string }>('/api/auth/status', {
        method: 'PATCH', body: jsonBody({ work_status: workStatus }),
      })
      setWorkStatus(result.work_status)
      setNotice('Робочий статус збережено.')
      if (user?.role === 'director' && activeTab === 'team') await loadTab()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося зберегти статус.')
    } finally {
      setBusy(false)
    }
  }

  async function changeOrder(order: AdminOrder, field: 'status' | 'payment_status', value: string) {
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/orders/${order.id}`, {
        method: 'PATCH', body: jsonBody({ [field]: value }),
      })
      await loadTab()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося оновити замовлення.')
    } finally {
      setBusy(false)
    }
  }

  async function saveProduct(form: FormData, sku: string) {
    const price = Math.round(Number(form.get('price')) * 100)
    const stock = Number(form.get('stock'))
    const supplierValue = String(form.get('supplier_id') || '')
    const supplierId = supplierValue ? Number(supplierValue) : null
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0
      || stock > 100_000 || (supplierValue && !Number.isInteger(supplierId))) {
      setError('Вкажіть коректні ціну, залишок і постачальника.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/products/${encodeURIComponent(sku)}`, {
        method: 'PATCH', body: jsonBody({ price, stock, supplier_id: supplierId }),
      })
      setNotice('Дані товару збережено.')
      await loadTab()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося зберегти товар.')
    } finally {
      setBusy(false)
    }
  }

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: jsonBody(Object.fromEntries(values)),
      })
      form.reset()
      setNotice('Працівника додано.')
      await loadTab()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося додати працівника.')
    } finally {
      setBusy(false)
    }
  }

  async function updateStaff(record: StaffRecord, role: StaffRole, active: boolean) {
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/users/${record.id}`, {
        method: 'PATCH', body: jsonBody({ role, active }),
      })
      await loadTab()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося зберегти працівника.')
    } finally {
      setBusy(false)
    }
  }

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/api/admin/suppliers', {
        method: 'POST', body: jsonBody(Object.fromEntries(new FormData(form))),
      })
      form.reset()
      setNotice('Постачальника додано.')
      await loadTab()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося додати постачальника.')
    } finally {
      setBusy(false)
    }
  }

  async function updateSupport(message: SupportMessage, status: string) {
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/support/${message.id}`, {
        method: 'PATCH', body: jsonBody({ status }),
      })
      await loadTab()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося оновити звернення.')
    } finally {
      setBusy(false)
    }
  }

  const lowStockProducts = products.filter((product) => product.stock <= 5)

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar${mobileMenu ? ' mobile-open' : ''}`}>
        <Link to="/" className="admin-brand"><span className="brand-mark">п</span><span><strong>ПРОМЕТЕЙ</strong><small>робочий простір</small></span></Link>
        <nav aria-label="Розділи кабінету">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={activeTab === id ? 'active' : ''} onClick={() => { setActiveTab(id); setMobileMenu(false); setError(''); setNotice('') }}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-user"><span className="avatar">{user.name.slice(0, 1).toLocaleUpperCase('uk')}</span><span><strong>{user.name}</strong><small>{roleNames[user.role]}</small></span></div>
        <button className="sidebar-logout" type="button" onClick={() => void signOut()} disabled={busy}><LogOut size={16} />Вийти</button>
      </aside>
      {mobileMenu && <button className="admin-mobile-backdrop" type="button" aria-label="Закрити меню" onClick={() => setMobileMenu(false)} />}
      <div className="admin-main">
        <header className="admin-topbar">
          <button className="mobile-menu-button" type="button" aria-label="Відкрити меню" onClick={() => setMobileMenu(true)}><Menu /></button>
          <div><span className="eyebrow">РОБОЧИЙ ПРОСТІР</span><strong>{currentTab?.label || 'Кабінет'}</strong></div>
          <div className="topbar-actions">
            <label className="work-status-picker">Мій статус<select value={workStatus} onChange={(event) => setWorkStatus(event.target.value)}><option>На роботі</option><option>Вихідний</option><option>У відпустці</option><option>Кінець робочого дня</option></select></label>
            <button className="button button-outline compact-button" type="button" onClick={() => void saveWorkStatus()} disabled={busy}><Check size={15} /> Зберегти</button>
            <Link to="/" className="icon-link"><Store size={17} /><span>До магазину</span></Link>
          </div>
        </header>
        <main className="admin-content">
          {error && <div className="notice notice-error" role="alert">{error}<button type="button" aria-label="Закрити повідомлення" onClick={() => setError('')}><X size={16} /></button></div>}
          {notice && <div className="notice notice-success" role="status">{notice}<button type="button" aria-label="Закрити повідомлення" onClick={() => setNotice('')}><X size={16} /></button></div>}
          {activeTab === 'overview' && <OverviewPanel role={user.role} overview={overview} products={products} lowStock={lowStockProducts.length} onNavigate={setActiveTab} />}
          {activeTab === 'finance' && <FinancePanel role={user.role} overview={overview} orders={orders} busy={busy} onChange={changeOrder} />}
          {activeTab === 'inventory' && <InventoryPanel products={products} suppliers={suppliers.filter((supplier) => supplier.active)} busy={busy} onSave={saveProduct} />}
          {activeTab === 'team' && user.role === 'director' && <TeamPanel staff={staff} currentUserId={user.id} busy={busy} onCreate={createStaff} onUpdate={updateStaff} />}
          {activeTab === 'history' && user.role === 'director' && <HistoryPanel history={history} />}
          {activeTab === 'suppliers' && user.role === 'director' && <SuppliersPanel suppliers={suppliers} busy={busy} onCreate={createSupplier} />}
          {activeTab === 'support' && user.role === 'director' && <SupportPanel messages={messages} busy={busy} onUpdate={updateSupport} />}
        </main>
      </div>
    </div>
  )
}

function StaffLogin({
  demoStaff, busy, error, onLogin, onDemoLogin,
}: {
  demoStaff: StaffUser[]
  busy: boolean
  error: string
  onLogin: (username: string, password: string) => Promise<void>
  onDemoLogin: (id: number) => Promise<void>
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void onLogin(username, password)
  }
  return (
    <section className="staff-login-page">
      <Link to="/" className="brand"><span className="brand-mark">п</span><span><strong>прометей</strong><small>робочий простір</small></span></Link>
      <div className="staff-login-card">
        <span className="eyebrow">РАДІ БАЧИТИ ВАС</span><h1>Вхід для команди</h1>
        <p>Увійдіть у робочий простір. Доступні розділи залежать від вашої ролі.</p>
        <form className="form-stack" onSubmit={submit}>
          <label>Ім’я користувача<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
          <label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <p className="form-message" role="alert">{error}</p>}
          <button className="button button-dark button-full" type="submit" disabled={busy}>{busy ? 'Входимо…' : 'Увійти до кабінету'}</button>
        </form>
        {demoStaff.length > 0 && <div className="demo-access"><span className="eyebrow">ЛОКАЛЬНИЙ ДЕМО-ДОСТУП</span><p>Оберіть профіль, щоб переглянути можливості його кабінету.</p><div>{demoStaff.filter((person) => person.active !== false).map((person) => <button key={person.id} type="button" disabled={busy} onClick={() => void onDemoLogin(person.id)}><span className="avatar">{person.name.slice(0, 1)}</span><span><strong>{person.name}</strong><small>{person.role_label}</small></span><ArrowRight size={16} /></button>)}</div></div>}
        <Link className="back-store-link" to="/">← Повернутися до магазину</Link>
      </div>
    </section>
  )
}

function OverviewPanel({
  role, overview, products, lowStock, onNavigate,
}: {
  role: StaffRole
  overview: Overview | null
  products: ApiProduct[]
  lowStock: number
  onNavigate: (tab: TabId) => void
}) {
  if (role === 'inventory') {
    return (
      <>
        <SectionHeader eyebrow="ОГЛЯД СКЛАДУ" title="Вітаємо у робочому просторі" description="Актуальні залишки та товари, що потребують уваги." />
        <div className="stat-grid"><Stat label="У каталозі" value={String(products.length)} icon={<Boxes />} /><Stat label="Мало на складі" value={String(products.filter((product) => product.stock <= 5).length)} icon={<Package />} tone="warning" /></div>
        <div className="panel-card"><div className="panel-heading"><div><h2>Низькі залишки</h2><p>Позиції з залишком до 5 одиниць</p></div><button className="text-button" type="button" onClick={() => onNavigate('inventory')}>Відкрити склад <ArrowRight size={15} /></button></div>{products.filter((product) => product.stock <= 5).length ? <div className="compact-list">{products.filter((product) => product.stock <= 5).slice(0, 6).map((product) => <div key={product.sku}><strong>{product.name}</strong><span className="badge badge-warning">{product.stock} {product.unit}</span></div>)}</div> : <p className="empty-inline">Низьких залишків немає.</p>}</div>
      </>
    )
  }
  const finance = overview?.financials
  return (
    <>
      <SectionHeader eyebrow="ОГЛЯД МАГАЗИНУ" title="Добрий день!" description="Огляд замовлень, надходжень і стану магазину." />
      <div className="stat-grid">
        <Stat label="Замовлень" value={String(finance?.order_count ?? '—')} icon={<BriefcaseBusiness />} />
        <Stat label="Оборот" value={formatMoney(finance?.revenue ?? 0)} icon={<BadgeDollarSign />} tone="green" />
        <Stat label="Отримано" value={formatMoney(finance?.paid ?? 0)} icon={<Check />} tone="green" />
        <Stat label="Очікує оплати" value={formatMoney(finance?.due ?? 0)} icon={<CalendarClock />} tone="warning" />
        {role === 'director' && <Stat label="Товарів у каталозі" value={String(overview?.products_count ?? '—')} icon={<Package />} />}
        {role === 'director' && <Stat label="Працівників" value={String(overview?.staff_count ?? '—')} icon={<Users />} />}
        {role === 'director' && <Stat label="Низькі залишки" value={String(overview?.low_stock_count ?? '—')} icon={<Boxes />} tone="warning" />}
      </div>
      <div className="overview-columns">
        <div className="panel-card"><div className="panel-heading"><div><h2>Фінансовий огляд</h2><p>Поточна сума замовлень та оплат</p></div><button className="text-button" type="button" onClick={() => onNavigate('finance')}>Журнал <ArrowRight size={15} /></button></div><div className="finance-highlight"><span>Сума замовлень</span><strong>{formatMoney(finance?.revenue ?? 0)}</strong><small>Сплачено {formatMoney(finance?.paid ?? 0)}</small></div></div>
        {role === 'director' && <div className="panel-card"><div className="panel-heading"><div><h2>Склад</h2><p>Залишки потребують контролю</p></div><button className="text-button" type="button" onClick={() => onNavigate('inventory')}>Товари <ArrowRight size={15} /></button></div><div className="finance-highlight"><span>Товарів з низьким залишком</span><strong>{overview?.low_stock_count ?? 0}</strong><small>Залишок до 5 одиниць</small></div></div>}
      </div>
      {role === 'director' && lowStock > 0 && <div className="notice notice-warning">{lowStock} позицій мають низький залишок. Перевірте розділ «Товари та склад».</div>}
    </>
  )
}

function Stat({ label, value, icon, tone = '' }: { label: string; value: string; icon: ReactNode; tone?: string }) {
  return <article className={`stat-card ${tone}`}><span className="stat-icon">{icon}</span><small>{label}</small><strong>{value}</strong></article>
}

function FinancePanel({
  role, overview, orders, busy, onChange,
}: {
  role: StaffRole
  overview: Overview | null
  orders: AdminOrder[]
  busy: boolean
  onChange: (order: AdminOrder, field: 'status' | 'payment_status', value: string) => Promise<void>
}) {
  const totals = overview?.financials
  return (
    <>
      <SectionHeader eyebrow="ФІНАНСИ" title="Фінансовий журнал" description="Підсумки замовлень і статуси оплат." />
      <div className="stat-grid stat-grid-four"><Stat label="Замовлень" value={String(totals?.order_count ?? 0)} icon={<BriefcaseBusiness />} /><Stat label="Сума" value={formatMoney(totals?.revenue ?? 0)} icon={<BadgeDollarSign />} /><Stat label="Отримано" value={formatMoney(totals?.paid ?? 0)} icon={<Check />} tone="green" /><Stat label="До отримання" value={formatMoney(totals?.due ?? 0)} icon={<CalendarClock />} tone="warning" /></div>
      <div className="panel-card table-panel"><div className="panel-heading"><div><h2>Останні замовлення</h2><p>{role === 'accountant' ? 'Бухгалтерський доступ: контакти покупців приховано' : 'Статуси, суми та інформація про доставку'}</p></div></div>
        {orders.length === 0 ? <p className="empty-inline">Замовлень поки немає.</p> : <div className="table-scroll"><table><thead><tr><th>№</th><th>Дата</th>{role === 'director' && <><th>Покупець</th><th>Місто</th></>}<th>Сума</th><th>Оплата</th>{role === 'director' && <th>Замовлення</th>}</tr></thead><tbody>
          {orders.map((order) => <tr key={order.id}><td><strong>#{order.id}</strong></td><td>{formatDate(order.created_at)}</td>{role === 'director' && <><td>{order.customer_name}<small className="cell-subtitle">{order.phone}</small></td><td>{order.city}</td></>}<td><strong>{formatMoney(order.total)}</strong></td><td><select aria-label={`Статус оплати замовлення ${order.id}`} value={order.payment_status} disabled={busy} onChange={(event) => void onChange(order, 'payment_status', event.target.value)}><option>Очікує оплати</option><option>Оплачено</option></select></td>{role === 'director' && <td><select aria-label={`Статус замовлення ${order.id}`} value={order.status || 'Нове'} disabled={busy} onChange={(event) => void onChange(order, 'status', event.target.value)}><option>Нове</option><option>Комплектується</option><option>Доставляється</option><option>Виконано</option></select></td>}</tr>)}
        </tbody></table></div>}
      </div>
    </>
  )
}

function InventoryPanel({
  products, suppliers, busy, onSave,
}: {
  products: ApiProduct[]
  suppliers: Supplier[]
  busy: boolean
  onSave: (form: FormData, sku: string) => Promise<void>
}) {
  return (
    <>
      <SectionHeader eyebrow="АСОРТИМЕНТ І ЗАЛИШКИ" title="Товари магазину" description="Оновлюйте постачальників, складські залишки й ціни." />
      <div className="panel-card table-panel"><div className="panel-heading"><div><h2>Облік товарів</h2><p>Товар із нульовим залишком автоматично зникає з можливості замовлення.</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>Товар</th><th>Категорія</th><th>Постачальник</th><th>Ціна</th><th>Залишок</th><th /></tr></thead><tbody>{products.map((product) => <tr key={product.sku}><td><strong>{product.name}</strong></td><td>{product.category_name}</td><td><select form={`product-${product.sku}`} name="supplier_id" defaultValue={product.supplier_id || ''}><option value="">Не обрано</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>{!product.supplier_id && product.supplier && <small className="cell-subtitle">Старий запис: {product.supplier}</small>}</td><td colSpan={3}><form id={`product-${product.sku}`} className="product-edit-row" onSubmit={(event) => { event.preventDefault(); void onSave(new FormData(event.currentTarget), product.sku) }}><label className="visually-hidden">Ціна<input name="price" type="number" min="0" step="0.01" defaultValue={(product.price / 100).toFixed(2)} /></label><span className="unit-label">₴</span><label className="visually-hidden">Залишок<input name="stock" type="number" min="0" max="100000" step="1" defaultValue={product.stock} /></label><span className={`stock-label${product.stock <= 5 ? ' low' : ''}`}>{product.stock} {product.unit}</span><button className="button button-outline compact-button" type="submit" disabled={busy}>Зберегти</button></form></td></tr>)}</tbody></table></div>
      </div>
    </>
  )
}

function TeamPanel({
  staff, currentUserId, busy, onCreate, onUpdate,
}: {
  staff: StaffRecord[]
  currentUserId: number
  busy: boolean
  onCreate: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onUpdate: (record: StaffRecord, role: StaffRole, active: boolean) => Promise<void>
}) {
  return (
    <>
      <SectionHeader eyebrow="КОМАНДА" title="Працівники та доступи" description="Кожен працівник має власний профіль із доступом відповідно до посади." />
      <div className="admin-two-column">
        <div className="panel-card table-panel"><div className="panel-heading"><div><h2>Працівники</h2><p>Ролі, присутність і стан доступу</p></div></div><div className="table-scroll"><table><thead><tr><th>Ім’я / логін</th><th>Посада</th><th>Статус</th><th>Доступ</th><th /></tr></thead><tbody>{staff.map((record) => <StaffRow key={record.id} record={record} currentUserId={currentUserId} busy={busy} onUpdate={onUpdate} />)}</tbody></table></div></div>
        <form className="panel-card form-stack" onSubmit={(event) => void onCreate(event)}><div className="panel-heading"><div><h2>Додати працівника</h2><p>Створіть обліковий запис і виберіть роль.</p></div><Plus size={18} /></div><label>Ім’я<input name="name" minLength={2} maxLength={100} required /></label><label>Логін<input name="username" pattern="[A-Za-z0-9_.-]{3,32}" required /></label><label>Посада<select name="role"><option value="accountant">Бухгалтер</option><option value="inventory">Працівник складу</option><option value="director">Директор</option></select></label><label>Тимчасовий пароль<input name="password" type="password" minLength={12} maxLength={128} required /><small>Щонайменше 12 символів.</small></label><button className="button button-dark button-full" type="submit" disabled={busy}>Додати працівника <Plus size={16} /></button></form>
      </div>
    </>
  )
}

function StaffRow({
  record, currentUserId, busy, onUpdate,
}: {
  record: StaffRecord
  currentUserId: number
  busy: boolean
  onUpdate: (record: StaffRecord, role: StaffRole, active: boolean) => Promise<void>
}) {
  const [role, setRole] = useState<StaffRole>(record.role)
  const [active, setActive] = useState(record.active)
  return <tr><td><strong>{record.name}</strong><small className="cell-subtitle">{record.username}</small></td><td><select value={role} onChange={(event) => setRole(event.target.value as StaffRole)}><option value="director">Директор</option><option value="accountant">Бухгалтер</option><option value="inventory">Працівник складу</option></select></td><td><span className={`badge ${record.work_status === 'На роботі' ? 'badge-green' : 'badge-muted'}`}>{record.work_status}</span></td><td><label className="switch-label"><input type="checkbox" checked={active} disabled={record.id === currentUserId} onChange={(event) => setActive(event.target.checked)} />{active ? 'Активний' : 'Вимкнений'}</label></td><td><button className="button button-outline compact-button" type="button" disabled={busy || record.id === currentUserId} onClick={() => void onUpdate(record, role, active)}>Зберегти</button></td></tr>
}

function HistoryPanel({ history }: { history: StatusHistoryEntry[] }) {
  return (
    <>
      <SectionHeader eyebrow="ПРИСУТНІСТЬ КОМАНДИ" title="Історія робочих статусів" description="Зміни статусів і час від початку зміни до її завершення." />
      <div className="panel-card table-panel"><div className="table-scroll"><table><thead><tr><th>Працівник</th><th>Статус</th><th>Дата і час</th><th>Тривалість</th></tr></thead><tbody>{history.map((entry) => <tr key={entry.id}><td><strong>{entry.name}</strong><small className="cell-subtitle">{entry.username}</small></td><td><span className={`badge ${entry.status === 'На роботі' ? 'badge-green' : 'badge-muted'}`}>{entry.status}</span></td><td>{formatDate(entry.changed_at)}</td><td>{shortDuration(entry.work_seconds)}</td></tr>)}</tbody></table>{history.length === 0 && <p className="empty-inline">Історія поки порожня.</p>}</div></div>
    </>
  )
}

function SuppliersPanel({
  suppliers, busy, onCreate,
}: {
  suppliers: Supplier[]
  busy: boolean
  onCreate: (event: FormEvent<HTMLFormElement>) => Promise<void>
}) {
  return (
    <>
      <SectionHeader eyebrow="ПАРТНЕРИ МАГАЗИНУ" title="Постачальники" description="Контактна інформація та довідник для карток товарів." />
      <div className="admin-two-column">
        <div className="panel-card table-panel"><div className="panel-heading"><div><h2>Довідник</h2><p>Активні постачальники</p></div></div>{suppliers.filter((supplier) => supplier.active).length === 0 ? <p className="empty-inline">Додайте першого постачальника.</p> : <div className="supplier-list">{suppliers.filter((supplier) => supplier.active).map((supplier) => <article key={supplier.id}><div><h3>{supplier.name}</h3>{supplier.contact_name && <p>{supplier.contact_name}</p>}{supplier.notes && <small>{supplier.notes}</small>}</div><div>{supplier.phone && <p>{supplier.phone}</p>}{supplier.email && <p>{supplier.email}</p>}{supplier.address && <small>{supplier.address}</small>}</div></article>)}</div>}</div>
        <form className="panel-card form-stack" onSubmit={(event) => void onCreate(event)}><div className="panel-heading"><div><h2>Новий постачальник</h2><p>Буде доступний у виборі товару.</p></div></div><label>Назва компанії<input name="name" minLength={2} maxLength={120} required /></label><label>Контактна особа<input name="contact_name" maxLength={100} /></label><label>Телефон<input name="phone" maxLength={30} /></label><label>Електронна пошта<input name="email" type="email" maxLength={254} /></label><label>Адреса<input name="address" maxLength={200} /></label><label>Примітки<textarea name="notes" rows={3} maxLength={500} /></label><button className="button button-dark button-full" type="submit" disabled={busy}>Додати постачальника <Plus size={16} /></button></form>
      </div>
    </>
  )
}

function SupportPanel({
  messages, busy, onUpdate,
}: {
  messages: SupportMessage[]
  busy: boolean
  onUpdate: (message: SupportMessage, status: string) => Promise<void>
}) {
  return (
    <>
      <SectionHeader eyebrow="ЗВЕРНЕННЯ ПОКУПЦІВ" title="Підтримка" description="Опрацьовуйте повідомлення, надіслані з публічної сторінки." />
      <div className="panel-card table-panel"><div className="table-scroll"><table><thead><tr><th>Дата</th><th>Покупець</th><th>Звернення</th><th>Статус</th><th /></tr></thead><tbody>{messages.map((message) => <tr key={message.id}><td>{formatDate(message.created_at)}</td><td><strong>{message.name}</strong><small className="cell-subtitle">{message.email}</small></td><td><strong>{message.subject}</strong><small className="message-preview">{message.message}</small></td><td><select value={message.status} onChange={(event) => void onUpdate(message, event.target.value)} disabled={busy}><option>Нове</option><option>У роботі</option><option>Відповіли</option></select></td><td><span className="badge badge-muted">#{message.id}</span></td></tr>)}</tbody></table>{messages.length === 0 && <p className="empty-inline">Звернень поки немає.</p>}</div></div>
    </>
  )
}
