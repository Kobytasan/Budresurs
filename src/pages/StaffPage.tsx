import { Fragment, useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  BadgeDollarSign,
  Boxes,
  BriefcaseBusiness,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Store,
  Trash2,
  Users,
  UserRound,
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

type TabId = 'overview' | 'finance' | 'inventory' | 'team' | 'history' | 'suppliers' | 'support' | 'profile'
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
  manager: 'Менеджер продажу',
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
    { id: 'profile', label: 'Мій профіль', icon: UserRound },
  ],
  accountant: [
    { id: 'overview', label: 'Огляд фінансів', icon: LayoutDashboard },
    { id: 'finance', label: 'Фінансовий журнал', icon: BadgeDollarSign },
    { id: 'profile', label: 'Мій профіль', icon: UserRound },
  ],
  inventory: [
    { id: 'overview', label: 'Огляд складу', icon: LayoutDashboard },
    { id: 'inventory', label: 'Товари та склад', icon: Boxes },
    { id: 'profile', label: 'Мій профіль', icon: UserRound },
  ],
  manager: [
    { id: 'overview', label: 'Огляд продажів', icon: LayoutDashboard },
    { id: 'finance', label: 'Замовлення', icon: BriefcaseBusiness },
    { id: 'support', label: 'Звернення покупців', icon: CircleHelp },
    { id: 'profile', label: 'Мій профіль', icon: UserRound },
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
      if (activeTab === 'support' && (user.role === 'director' || user.role === 'manager')) {
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

  async function saveOwnProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await api<{ user: StaffUser }>('/api/auth/profile', {
        method: 'PATCH',
        body: jsonBody({ name: values.get('name'), username: values.get('username') }),
      })
      setUser(result.user)
      setNotice('Особисті дані оновлено.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося оновити профіль.')
    } finally {
      setBusy(false)
    }
  }

  async function changeOwnPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const newPassword = String(values.get('new_password') || '')
    if (newPassword !== values.get('confirm_password')) {
      setError('Новий пароль і підтвердження не збігаються.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/api/auth/password', {
        method: 'PATCH',
        body: jsonBody({
          current_password: values.get('current_password'),
          new_password: newPassword,
        }),
      })
      form.reset()
      setNotice('Пароль змінено. Інші активні сеанси завершено.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося змінити пароль.')
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

  async function deleteStaff(record: StaffRecord) {
    if (!window.confirm(`Видалити працівника «${record.name}»? Його доступ буде закрито, а записи історії статусів збережуться.`)) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/users/${record.id}`, { method: 'DELETE' })
      setStaff((current) => current.filter((item) => item.id !== record.id))
      setNotice(`Працівника «${record.name}» видалено.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося видалити працівника.')
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
        <Link to="/" className="admin-brand"><span className="brand-mark">Б</span><span><strong>БУДРЕСУРС</strong><small>операційний центр</small></span></Link>
        <nav aria-label="Розділи кабінету">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={activeTab === id ? 'active' : ''} onClick={() => { setActiveTab(id); setMobileMenu(false); setError(''); setNotice('') }}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="sidebar-user" type="button" onClick={() => { setActiveTab('profile'); setMobileMenu(false); setError(''); setNotice('') }} aria-label="Відкрити мій профіль">
          <span className="avatar">{user.name.trim().slice(0, 1).toLocaleUpperCase('uk')}</span>
          <span><strong>{user.name === 'Директор магазину' ? 'Директор Будресурс' : user.name}</strong><small>{roleNames[user.role]}</small></span>
        </button>
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
            <Link to="/" className="icon-link"><Store size={17} /><span>До каталогу</span></Link>
          </div>
        </header>
        <main className="admin-content">
          {error && <div className="notice notice-error" role="alert">{error}<button type="button" aria-label="Закрити повідомлення" onClick={() => setError('')}><X size={16} /></button></div>}
          {notice && <div className="notice notice-success" role="status">{notice}<button type="button" aria-label="Закрити повідомлення" onClick={() => setNotice('')}><X size={16} /></button></div>}
          {activeTab === 'overview' && <OverviewPanel role={user.role} overview={overview} products={products} lowStock={lowStockProducts.length} onNavigate={setActiveTab} />}
          {activeTab === 'finance' && <FinancePanel role={user.role} overview={overview} orders={orders} busy={busy} onChange={changeOrder} />}
          {activeTab === 'inventory' && <InventoryPanel products={products} suppliers={suppliers.filter((supplier) => supplier.active)} busy={busy} onSave={saveProduct} />}
          {activeTab === 'team' && user.role === 'director' && <TeamPanel staff={staff} currentUserId={user.id} busy={busy} onCreate={createStaff} onUpdate={updateStaff} onDelete={deleteStaff} />}
          {activeTab === 'history' && user.role === 'director' && <HistoryPanel history={history} />}
          {activeTab === 'suppliers' && user.role === 'director' && <SuppliersPanel suppliers={suppliers} busy={busy} onCreate={createSupplier} />}
          {activeTab === 'support' && (user.role === 'director' || user.role === 'manager') && <SupportPanel messages={messages} busy={busy} onUpdate={updateSupport} />}
          {activeTab === 'profile' && <StaffProfilePanel key={`${user.id}-${user.username}-${user.name}`} user={user} busy={busy} onSaveProfile={saveOwnProfile} onChangePassword={changeOwnPassword} />}
        </main>
      </div>
    </div>
  )
}

function StaffProfilePanel({
  user, busy, onSaveProfile, onChangePassword,
}: {
  user: StaffUser
  busy: boolean
  onSaveProfile: (event: FormEvent<HTMLFormElement>) => void
  onChangePassword: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <>
      <SectionHeader eyebrow="ОСОБИСТИЙ ПРОФІЛЬ" title="Ваші дані" description="Оновіть ім’я та логін. Для зміни пароля підтвердіть поточний." />
      <div className="staff-profile-grid">
        <form className="panel-card staff-profile-form" onSubmit={onSaveProfile}>
          <div className="panel-heading"><div><h2>Особиста інформація</h2><p>Ці дані бачите ви та директор у списку команди.</p></div><UserRound size={20} /></div>
          <label>Ім’я та прізвище<input name="name" defaultValue={user.name} minLength={2} maxLength={100} required /></label>
          <label>Логін<input name="username" defaultValue={user.username} minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]{3,32}" autoComplete="username" required /></label>
          <label>Посада<input value={user.role_label} readOnly /></label>
          <button className="button button-dark" type="submit" disabled={busy}>Зберегти дані</button>
        </form>
        <form className="panel-card staff-profile-form" onSubmit={onChangePassword}>
          <div className="panel-heading"><div><h2>Зміна пароля</h2><p>Новий пароль має містити щонайменше 12 символів.</p></div><KeyRound size={20} /></div>
          <label>Поточний пароль<input name="current_password" type="password" autoComplete="current-password" maxLength={256} required /></label>
          <label>Новий пароль<input name="new_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          <label>Підтвердьте новий пароль<input name="confirm_password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          <button className="button button-dark" type="submit" disabled={busy}>Змінити пароль</button>
        </form>
      </div>
    </>
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
      <Link to="/" className="brand"><span className="brand-mark">Б</span><span><strong>БУДРЕСУРС</strong><small>робочий простір</small></span></Link>
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
        <Link className="back-store-link" to="/">← Повернутися до каталогу</Link>
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
      <SectionHeader eyebrow="ОГЛЯД «БУДРЕСУРС»" title="Добрий день!" description="Огляд замовлень, залишків інструменту та стану каталогу." />
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
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null)
  return (
    <>
      <SectionHeader eyebrow={role === 'manager' ? 'ПРОДАЖІ ТА ОБСЛУГОВУВАННЯ' : 'ФІНАНСИ'} title={role === 'manager' ? 'Замовлення та продажі' : 'Фінансовий журнал'} description={role === 'manager' ? 'Переглядайте замовлення, контакти покупців і керуйте виконанням.' : 'Підсумки замовлень і статуси оплат.'} />
      <div className="stat-grid stat-grid-four"><Stat label="Замовлень" value={String(totals?.order_count ?? 0)} icon={<BriefcaseBusiness />} /><Stat label="Сума" value={formatMoney(totals?.revenue ?? 0)} icon={<BadgeDollarSign />} /><Stat label="Отримано" value={formatMoney(totals?.paid ?? 0)} icon={<Check />} tone="green" /><Stat label="До отримання" value={formatMoney(totals?.due ?? 0)} icon={<CalendarClock />} tone="warning" /></div>
      <div className="panel-card table-panel"><div className="panel-heading"><div><h2>Останні замовлення</h2><p>{role === 'accountant' ? 'Бухгалтерський доступ: контакти покупців приховано' : 'Статуси, суми та інформація про доставку'}</p></div></div>
        {orders.length === 0 ? <p className="empty-inline">Замовлень поки немає.</p> : <div className="table-scroll"><table><thead><tr><th>№ замовлення</th><th>Дата</th>{(role === 'director' || role === 'manager') && <><th>Покупець</th><th>Місто</th></>}<th>Сума</th><th>Оплата</th>{(role === 'director' || role === 'manager') && <th>Статус</th>}</tr></thead><tbody>
          {orders.map((order) => {
            const expanded = expandedOrderId === order.id
            return <Fragment key={order.id}>
              <tr key={order.id}>
                <td><button className="order-open-button" type="button" aria-expanded={expanded} onClick={() => setExpandedOrderId(expanded ? null : order.id)}>
                  <strong>№{order.id}</strong>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button></td>
                <td>{formatDate(order.created_at)}</td>
                {(role === 'director' || role === 'manager') && <><td>{order.customer_name}<small className="cell-subtitle">{order.phone}</small></td><td>{order.city}</td></>}
                <td><strong>{formatMoney(order.total)}</strong></td>
                <td><span className={`badge ${order.status === 'Скасовано' ? 'badge-muted' : order.payment_status === 'Оплачено' ? 'badge-green' : 'badge-muted'}`}>{order.status === 'Скасовано' && order.payment_status !== 'Оплачено' ? 'Не оплачено · скасовано' : order.payment_status}</span></td>
                {(role === 'director' || role === 'manager') && <td><span className={`badge ${order.status === 'Скасовано' ? 'badge-muted' : 'status-badge-white'}`}>{order.status || 'Нове'}</span></td>}
              </tr>
              {expanded && <tr className="order-details-row"><td colSpan={role === 'director' || role === 'manager' ? 7 : 4}>
                <div className="order-detail-panel">
                  <div className="order-detail-heading"><div><strong>Замовлення №{order.id}</strong><small>{formatDate(order.created_at)}</small></div><strong>{formatMoney(order.total)}</strong></div>
                  {(role === 'director' || role === 'manager') && <div className="order-customer-details"><span><small>Покупець</small>{order.customer_name}</span><span><small>Телефон</small>{order.phone}</span><span><small>Місто</small>{order.city}</span><span><small>Адреса</small>{order.address}</span></div>}
                  <div className="order-detail-items"><strong>Склад замовлення</strong>{order.items.map((item, index) => <div key={`${item.product_name}-${index}`}><span>{item.product_name} · {item.quantity} {item.unit} × {formatMoney(item.unit_price)}</span><strong>{formatMoney(item.line_total)}</strong></div>)}</div>
                  <div className="order-detail-controls">
                    {role === 'accountant' && <label>Оплата<select aria-label={`Статус оплати замовлення ${order.id}`} value={order.payment_status} disabled={busy || order.status === 'Скасовано'} onChange={(event) => void onChange(order, 'payment_status', event.target.value)}><option>Очікує оплати</option><option>Оплачено</option></select></label>}
                    {(role === 'director' || role === 'manager') && <label>Статус замовлення{order.status === 'Скасовано'
                      ? <span className="badge badge-muted">Скасовано</span>
                      : <select aria-label={`Статус замовлення ${order.id}`} value={order.status || 'Нове'} disabled={busy} onChange={(event) => void onChange(order, 'status', event.target.value)}><option>Нове</option><option>Комплектується</option><option>Доставляється</option><option>Виконано</option></select>}</label>}
                  </div>
                </div>
              </td></tr>}
            </Fragment>
          })}
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
      <SectionHeader eyebrow="АСОРТИМЕНТ І ЗАЛИШКИ" title="Каталог інструменту" description="Керуйте ціною за одиницю, фактичною кількістю на складі та постачальниками." />
      <div className="inventory-summary">
        <Stat label="Позицій у каталозі" value={String(products.length)} icon={<Boxes />} />
        <Stat label="Є в наявності" value={String(products.filter((product) => product.stock > 0).length)} icon={<Package />} tone="green" />
        <Stat label="Потрібно поповнити" value={String(products.filter((product) => product.stock <= 5).length)} icon={<CalendarClock />} tone="warning" />
        <Stat label="Вартість залишків за цінами каталогу" value={formatMoney(products.reduce((sum, product) => sum + product.price * product.stock, 0))} icon={<BadgeDollarSign />} />
      </div>
      <div className="panel-card table-panel"><div className="panel-heading"><div><h2>Облік товарів</h2><p>Вартість залишку = ціна за одиницю × кількість. Нульовий залишок прибирає товар з можливості замовлення.</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>Товар</th><th>Категорія</th><th>Постачальник</th><th>Ціна за одиницю</th><th>Кількість на складі</th><th>Вартість залишку</th><th /></tr></thead><tbody>{products.map((product) => <tr key={product.sku}><td><strong>{product.name}</strong></td><td>{product.category_name}</td><td><select form={`product-${product.sku}`} name="supplier_id" defaultValue={product.supplier_id || ''}><option value="">Не обрано</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>{!product.supplier_id && product.supplier && <small className="cell-subtitle">Старий запис: {product.supplier}</small>}</td><td><label className="unit-price-field"><span className="visually-hidden">Ціна за одиницю у гривнях</span><input form={`product-${product.sku}`} name="price" type="number" min="0" step="0.01" defaultValue={(product.price / 100).toFixed(2)} /><span>₴ / {product.unit}</span></label></td><td><label className="stock-edit-field"><span className="visually-hidden">Кількість на складі</span><input form={`product-${product.sku}`} name="stock" type="number" min="0" max="100000" step="1" defaultValue={product.stock} /><span>{product.unit}</span></label></td><td><strong>{formatMoney(product.price * product.stock)}</strong></td><td><form id={`product-${product.sku}`} className="product-edit-row" onSubmit={(event) => { event.preventDefault(); void onSave(new FormData(event.currentTarget), product.sku) }}><button className="button button-outline compact-button" type="submit" disabled={busy}>Зберегти</button></form></td></tr>)}</tbody></table></div>
      </div>
    </>
  )
}

function TeamPanel({
  staff, currentUserId, busy, onCreate, onUpdate, onDelete,
}: {
  staff: StaffRecord[]
  currentUserId: number
  busy: boolean
  onCreate: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onUpdate: (record: StaffRecord, role: StaffRole, active: boolean) => Promise<void>
  onDelete: (record: StaffRecord) => Promise<void>
}) {
  return (
    <>
      <SectionHeader eyebrow="КОМАНДА" title="Працівники та доступи" description="Кожен працівник має власний профіль із доступом відповідно до посади." />
      <div className="admin-two-column">
        <div className="panel-card table-panel"><div className="panel-heading"><div><h2>Працівники</h2><p>Спочатку ім’я та прізвище, далі посада, присутність і доступ.</p></div></div><div className="table-scroll"><table><thead><tr><th>Ім’я та прізвище / логін</th><th>Посада</th><th>Статус</th><th>Доступ</th><th /></tr></thead><tbody>{staff.map((record) => <StaffRow key={record.id} record={record} currentUserId={currentUserId} busy={busy} onUpdate={onUpdate} onDelete={onDelete} />)}</tbody></table></div></div>
        <form className="panel-card form-stack" onSubmit={(event) => void onCreate(event)}><div className="panel-heading"><div><h2>Додати працівника</h2><p>Створіть обліковий запис і виберіть посаду.</p></div><Plus size={18} /></div><label>Ім’я та прізвище<input name="name" minLength={3} maxLength={100} pattern=".*\s+.*" title="Вкажіть ім’я та прізвище" placeholder="Наприклад, Олена Коваль" required /></label><label>Логін<input name="username" pattern="[A-Za-z0-9_.-]{3,32}" required /></label><label>Посада<select name="role"><option value="manager">Менеджер продажу</option><option value="accountant">Бухгалтер</option><option value="inventory">Працівник складу</option><option value="director">Директор</option></select></label><label>Тимчасовий пароль<input name="password" type="password" minLength={12} maxLength={128} required /><small>Щонайменше 12 символів.</small></label><button className="button button-dark button-full" type="submit" disabled={busy}>Додати працівника <Plus size={16} /></button></form>
      </div>
    </>
  )
}

function StaffRow({
  record, currentUserId, busy, onUpdate, onDelete,
}: {
  record: StaffRecord
  currentUserId: number
  busy: boolean
  onUpdate: (record: StaffRecord, role: StaffRole, active: boolean) => Promise<void>
  onDelete: (record: StaffRecord) => Promise<void>
}) {
  const [role, setRole] = useState<StaffRole>(record.role)
  const [active, setActive] = useState(record.active)
  return <tr><td><strong>{record.name}</strong><small className="cell-subtitle">{record.username}</small></td><td><select value={role} disabled={record.role === 'director'} onChange={(event) => setRole(event.target.value as StaffRole)}><option value="manager">Менеджер продажу</option><option value="director">Директор</option><option value="accountant">Бухгалтер</option><option value="inventory">Працівник складу</option></select></td><td><span className="badge status-badge-white">{record.work_status}</span></td><td><div className="team-access-control"><span className={`badge ${active ? 'status-badge-white' : 'badge-muted'}`}>{active ? record.role === 'director' ? 'Повний доступ' : 'Доступ надано' : 'Доступ вимкнено'}</span><button className="access-toggle" type="button" disabled={busy || record.id === currentUserId} onClick={() => setActive((value) => !value)}>{active ? 'Вимкнути' : 'Увімкнути'}</button></div></td><td><div className="team-row-actions"><button className="button button-outline compact-button" type="button" disabled={busy || record.id === currentUserId} onClick={() => void onUpdate(record, role, active)}>Зберегти</button>{record.role !== 'director' && <button className="button button-outline team-delete-button" type="button" disabled={busy || record.id === currentUserId} onClick={() => void onDelete(record)}><Trash2 size={14} /> Видалити</button>}</div></td></tr>
}

function HistoryPanel({ history }: { history: StatusHistoryEntry[] }) {
  const today = history.filter((entry) => new Date(entry.changed_at).toDateString() === new Date().toDateString())
  const completedShifts = today.filter((entry) => entry.status === 'Кінець робочого дня' && entry.work_seconds !== null)
  const workedSeconds = completedShifts.reduce((sum, entry) => sum + (entry.work_seconds || 0), 0)
  return (
    <>
      <SectionHeader eyebrow="ПРИСУТНІСТЬ КОМАНДИ" title="Історія робочих статусів" description="Зміни статусів і час від початку зміни до її завершення." />
      <div className="stat-grid history-summary">
        <Stat label="Змінено статусів сьогодні" value={String(today.length)} icon={<CalendarClock />} />
        <Stat label="Завершено змін сьогодні" value={String(completedShifts.length)} icon={<Check />} />
        <Stat label="Час завершених змін" value={shortDuration(workedSeconds)} icon={<BriefcaseBusiness />} />
      </div>
      <div className="panel-card table-panel"><div className="panel-heading"><div><h2>Останні зміни</h2><p>Записи від найновішого до найстарішого. Збережена історія лишається після видалення працівника.</p></div></div><div className="table-scroll"><table><thead><tr><th>Працівник</th><th>Статус</th><th>Дата і час</th><th>Тривалість</th></tr></thead><tbody>{history.map((entry) => <tr key={entry.id}><td><strong>{entry.name}</strong><small className="cell-subtitle">{entry.username}</small></td><td><span className="badge status-badge-white">{entry.status}</span></td><td>{formatDate(entry.changed_at)}</td><td>{shortDuration(entry.work_seconds)}</td></tr>)}</tbody></table>{history.length === 0 && <p className="empty-inline">Історія поки порожня.</p>}</div></div>
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
