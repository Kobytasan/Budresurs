export type StaffRole = 'director' | 'accountant' | 'inventory'

export interface Product {
  sku: string
  name: string
  description: string
  price: number
  category: string
  category_name: string
  unit: string
  emoji: string
  color: string
  visual: string
  stock: number
}

export interface Customer {
  id: number
  name: string
  email: string
  phone: string
  city: string
  avatar_url?: string | null
}

export interface StaffUser {
  id: number
  username: string
  name: string
  role: StaffRole
  role_label: string
  work_status: string
  active?: boolean
}

export interface OrderItem {
  product_name: string
  unit: string
  unit_price: number
  quantity: number
  line_total: number
}

export interface CustomerOrder {
  id: number
  created_at: string
  total: number
  status: string
  payment_status: string
  city: string
  customer_name?: string
  phone?: string
  address?: string
  items: OrderItem[]
}

export interface AdminOrder {
  id: number
  created_at: string
  total: number
  payment_status: string
  customer_name?: string
  phone?: string
  address?: string
  status?: string
  city?: string
  items: OrderItem[]
}

export interface Supplier {
  id: number
  name: string
  contact_name: string
  phone: string
  email: string
  address: string
  notes: string
  active: boolean
}

export interface SupportMessage {
  id: number
  name: string
  email: string
  subject: string
  message: string
  status: string
  created_at: string
}

export interface StatusHistoryEntry {
  id: number
  name: string
  username: string
  status: string
  changed_at: string
  work_seconds: number | null
}

export interface ApiProduct {
  sku: string
  name: string
  category_name: string
  price: number
  unit: string
  stock: number
  supplier: string
  supplier_id: number | null
}

export interface StaffRecord extends StaffUser {
  active: boolean
  created_at: string
}

export interface ApiError extends Error {
  status: number
}
