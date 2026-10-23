import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../api'
import type { Customer, Product } from '../types'

const CART_KEY = 'prometey-cart'
const FAVORITES_KEY = 'prometey-favorites'
const CITY_KEY = 'prometey-city'

interface StoreValue {
  products: Product[]
  productsLoading: boolean
  productsError: string
  cart: Record<string, number>
  favorites: string[]
  cities: string[]
  city: string
  customer: Customer | null
  toast: string
  setCustomer: (customer: Customer | null) => void
  setCity: (city: string) => void
  adjustCart: (sku: string, change: number) => void
  removeFromCart: (sku: string) => void
  toggleFavorite: (sku: string) => void
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

function readFavorites(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]')
    return Array.isArray(saved)
      ? [...new Set(saved.filter((item): item is string => typeof item === 'string'))]
      : []
  } catch {
    return []
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
  const [favorites, setFavorites] = useState(readFavorites)
  const [cities, setCities] = useState<string[]>([])
  const [city, setCityState] = useState(
    () => localStorage.getItem(CITY_KEY) || 'Київ',
  )
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [toast, setToast] = useState('')
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
    localStorage.setItem(CART_KEY, JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
  }, [favorites])

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
      if (next > product.stock) {
        showToast('На складі немає більшої кількості цього товару.')
        return current
      }
      const updated = { ...current }
      if (next <= 0) delete updated[sku]
      else updated[sku] = Math.min(next, 99)
      return updated
    })
  }, [products, showToast])

  const removeFromCart = useCallback((sku: string) => {
    setCart((current) => {
      const updated = { ...current }
      delete updated[sku]
      return updated
    })
  }, [])

  const toggleFavorite = useCallback((sku: string) => {
    setFavorites((current) => current.includes(sku)
      ? current.filter((item) => item !== sku)
      : [...current, sku])
  }, [])

  const value = useMemo<StoreValue>(() => ({
    products,
    productsLoading,
    productsError,
    cart,
    favorites,
    cities,
    city,
    customer,
    toast,
    setCustomer,
    setCity,
    adjustCart,
    removeFromCart,
    toggleFavorite,
    refreshProducts,
    showToast,
  }), [
    products, productsLoading, productsError, cart, favorites, cities, city,
    customer, toast, setCity, adjustCart, removeFromCart, toggleFavorite,
    refreshProducts, showToast,
  ])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used within StoreProvider.')
  return value
}
