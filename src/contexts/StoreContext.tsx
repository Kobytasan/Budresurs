import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../api'
import type { Customer, Product } from '../types'

const CART_KEY = 'budresurs-cart'
const CITY_KEY = 'budresurs-city'

interface StoreValue {
  products: Product[]
  productsLoading: boolean
  productsError: string
  cart: Record<string, number>
  favorites: string[]
  favoritesLoading: boolean
  cities: string[]
  city: string
  customer: Customer | null
  toast: string
  setCustomer: (customer: Customer | null) => void
  setCity: (city: string) => void
  adjustCart: (sku: string, change: number) => void
  setCartQuantity: (sku: string, quantity: number) => void
  removeFromCart: (sku: string) => void
  toggleFavorite: (sku: string) => Promise<void>
  refreshProducts: () => Promise<void>
  showToast: (message: string) => void
}

const StoreContext = createContext<StoreValue | null>(null)

function readCart(): Record<string, number> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CART_KEY) || '{}')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {}
    return Object.fromEntries(
      Object.entries(saved).filter(
        ([sku, count]) =>
          typeof sku === 'string' &&
          Number.isInteger(count) &&
          Number(count) > 0 &&
          Number(count) <= 99,
      ),
    )
  } catch {
    return {}
  }
}

function responseArray<T>(payload: unknown, key: string): T[] {
  const value = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)[key]
    : undefined
  if (!Array.isArray(value)) {
    throw new Error(`Відповідь API не містить коректного списку «${key}».`)
  }
  return value as T[]
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState('')
  const [cart, setCart] = useState(readCart)
  const [favorites, setFavorites] = useState<string[]>([])
  const [favoritesLoading, setFavoritesLoading] = useState(false)
  const [cities, setCities] = useState<string[]>([])
  const [city, setCityState] = useState(
    () => localStorage.getItem(CITY_KEY) || 'Київ',
  )
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [toast, setToast] = useState('')
  const favoritesRef = useRef(favorites)
  const customerIdRef = useRef<number | null>(null)
  const visibleFavorites = customerIdRef.current === (customer?.id ?? null) ? favorites : []
  const visibleFavoritesLoading =
    favoritesLoading || customerIdRef.current !== (customer?.id ?? null)
  const showToast = useCallback((message: string) => {
    setToast(message)
  }, [])

  const refreshProducts = useCallback(async () => {
    try {
      const result = await api<unknown>('/api/products')
      setProducts(responseArray<Product>(result, 'products'))
      setProductsError('')
    } catch (error) {
      setProductsError(error instanceof Error ? error.message : 'Не вдалося оновити товари.')
    } finally {
      setProductsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void Promise.all([
      api<unknown>('/api/products'),
      api<unknown>('/api/cities'),
    ]).then(([productResult, cityResult]) => {
      if (!active) return
      setProducts(responseArray<Product>(productResult, 'products'))
      setCities(responseArray<string>(cityResult, 'cities'))
      setProductsLoading(false)
    }).catch((error: unknown) => {
      if (!active) return
      setProductsError(error instanceof Error ? error.message : 'Не вдалося завантажити каталог.')
      setProductsLoading(false)
    })
    const interval = window.setInterval(() => {
      void refreshProducts()
    }, 15_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [refreshProducts])

  useEffect(() => {
    let active = true
    void api<{ customer: Customer }>('/api/customer/me')
      .then(({ customer: value }) => {
        if (active) setCustomer(value)
      })
      .catch((error: unknown) => {
        if (!active) return
        if (!(typeof error === 'object' && error !== null && 'status' in error && error.status === 401)) {
          showToast(error instanceof Error ? error.message : 'Не вдалося завантажити профіль покупця.')
        }
      })
    return () => { active = false }
  }, [showToast])

  useEffect(() => {
    let active = true
    const customerId = customer?.id ?? null
    customerIdRef.current = customerId
    setFavoritesLoading(customerId !== null)

    if (customerId === null) {
      favoritesRef.current = []
      setFavorites([])
      localStorage.removeItem('budresurs-favorites')
      return () => { active = false }
    }

    favoritesRef.current = []
    setFavorites([])
    void api<unknown>('/api/customer/favorites')
      .then((result) => {
        const saved = responseArray<string>(result, 'favorites')
        if (!saved.every((sku) => typeof sku === 'string')) {
          throw new Error('Сервер повернув некоректний список улюблених товарів.')
        }
        if (active && customerIdRef.current === customerId) {
          favoritesRef.current = [...new Set(saved)]
          setFavorites(favoritesRef.current)
        }
      })
      .catch((error: unknown) => {
        if (!active || customerIdRef.current !== customerId) return
        showToast(error instanceof Error ? error.message : 'Не вдалося завантажити улюблене.')
      })
      .finally(() => {
        if (active && customerIdRef.current === customerId) setFavoritesLoading(false)
      })
    return () => { active = false }
  }, [customer?.id, showToast])

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    localStorage.setItem(CITY_KEY, city)
  }, [city])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const setCity = useCallback((value: string) => {
    setCityState(value)
  }, [])

  const adjustCart = useCallback((sku: string, change: number) => {
    const product = products.find((item) => item.sku === sku)
    if (!product) return
    setCart((current) => {
      const next = (current[sku] || 0) + change
      if (next > Math.min(product.stock, 99)) {
        showToast(`Доступна кількість цього товару: ${Math.min(product.stock, 99)}.`)
        return current
      }
      const updated = { ...current }
      if (next <= 0) delete updated[sku]
      else updated[sku] = Math.min(next, 99)
      return updated
    })
  }, [products, showToast])

  const setCartQuantity = useCallback((sku: string, quantity: number) => {
    const product = products.find((item) => item.sku === sku)
    if (!product) return
    if (!Number.isInteger(quantity) || quantity < 1) {
      showToast('Вкажіть цілу кількість від 1.')
      return
    }
    if (quantity > Math.min(product.stock, 99)) {
      showToast(product.stock > 0
        ? `Можна замовити до ${Math.min(product.stock, 99)} ${product.unit} товару «${product.name}» за раз.`
        : `Товар «${product.name}» зараз відсутній на складі.`)
      return
    }
    setCart((current) => ({ ...current, [sku]: quantity }))
  }, [products, showToast])

  const removeFromCart = useCallback((sku: string) => {
    setCart((current) => {
      const updated = { ...current }
      delete updated[sku]
      return updated
    })
  }, [])

  const toggleFavorite = useCallback(async (sku: string) => {
    const customerId = customer?.id ?? null
    if (customerId === null) {
      showToast('Щоб зберігати улюблені товари, увійдіть або створіть кабінет.')
      return
    }
    if (favoritesLoading || customerIdRef.current !== customerId) {
      showToast('Зачекайте, поки завантажиться ваше обране.')
      return
    }
    const wasFavorite = favoritesRef.current.includes(sku)
    const updated = wasFavorite
      ? favoritesRef.current.filter((item) => item !== sku)
      : [...favoritesRef.current, sku]
    favoritesRef.current = updated
    setFavorites(updated)

    try {
      await api(`/api/customer/favorites${wasFavorite ? `/${encodeURIComponent(sku)}` : ''}`, {
        method: wasFavorite ? 'DELETE' : 'POST',
        ...(wasFavorite ? {} : { body: JSON.stringify({ sku }) }),
      })
      showToast(wasFavorite ? 'Видалено з улюбленого' : 'Додано до улюбленого')
    } catch (error) {
      if (customerIdRef.current === customerId) {
        const current = favoritesRef.current
        const rolledBack = wasFavorite
          ? [...new Set([...current, sku])]
          : current.filter((item) => item !== sku)
        favoritesRef.current = rolledBack
        setFavorites(rolledBack)
      }
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти улюблене.')
    }
  }, [customer?.id, favoritesLoading, showToast])

  const value = useMemo<StoreValue>(() => ({
    products,
    productsLoading,
    productsError,
    cart,
    favorites: visibleFavorites,
    favoritesLoading: visibleFavoritesLoading,
    cities,
    city,
    customer,
    toast,
    setCustomer,
    setCity,
    adjustCart,
    setCartQuantity,
    removeFromCart,
    toggleFavorite,
    refreshProducts,
    showToast,
  }), [
    products, productsLoading, productsError, cart, favorites, favoritesLoading,
    visibleFavorites, visibleFavoritesLoading, cities, city,
    customer, toast, setCity, adjustCart, setCartQuantity, removeFromCart, toggleFavorite,
    refreshProducts, showToast,
  ])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used within StoreProvider.')
  return value
}
