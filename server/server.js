import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg
const app = express()
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
})
const PORT = Number(process.env.PORT || 5000)
const SESSION_HOURS = 12
const DELIVERY_CITIES = ['Київ', 'Львів', 'Одеса', 'Дніпро', 'Харків', 'Вінниця', 'Черкаси', 'Полтава']
const ROLE_LABELS = { director: 'Директор', accountant: 'Бухгалтер', inventory: 'Працівник складу' }
const WORK_STATUSES = ['На роботі', 'Вихідний', 'У відпустці', 'Кінець робочого дня']

app.set('trust proxy', 1)
app.use(express.json({ limit: '32kb' }))

function apiError(res, status, message) {
  return res.status(status).json({ error: message })
}

function validOrigin(req) {
  const origin = req.get('Origin')
  if (!origin) return true
  try {
    return new URL(origin).host === req.get('Host')
  } catch {
    return false
  }
}

app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !validOrigin(req)) {
    return apiError(res, 403, 'Запит відхилено.')
  }
  next()
})

function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const digest = crypto.pbkdf2Sync(password, salt, 310_000, 32, 'sha256')
  return `${salt.toString('hex')}:${digest.toString('hex')}`
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false
  const [saltHex, digestHex] = stored.split(':')
  if (!saltHex || !digestHex || !/^[a-f0-9]{32}$/.test(saltHex) || !/^[a-f0-9]{64}$/.test(digestHex)) {
    return false
  }
  const digest = crypto.pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), 310_000, 32, 'sha256')
  return crypto.timingSafeEqual(digest, Buffer.from(digestHex, 'hex'))
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function getCookie(req, name) {
  const cookie = req.get('Cookie') || ''
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return ''
}

function cookieOptions(req, maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.PROMETEY_COOKIE_SECURE === '1' || req.secure,
    path: '/',
    maxAge,
  }
}

function setSessionCookie(req, res, name, token, maxAge) {
  res.cookie(name, token, cookieOptions(req, maxAge))
}

async function issueSession(req, res, table, ownerColumn, id, cookieName) {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000)
  await pool.query(
    `INSERT INTO ${table} (token_hash, ${ownerColumn}, expires_at) VALUES ($1, $2, $3)`,
    [tokenHash(token), id, expiresAt],
  )
  setSessionCookie(req, res, cookieName, token, SESSION_HOURS * 60 * 60 * 1000)
}

async function currentUser(req) {
  const token = getCookie(req, 'prometey_session')
  if (!token) return null
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.name, u.role, u.work_status
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE`,
    [tokenHash(token)],
  )
  return rows[0] ? { ...rows[0], role_label: ROLE_LABELS[rows[0].role] } : null
}

async function currentCustomer(req) {
  const token = getCookie(req, 'prometey_customer_session')
  if (!token) return null
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.email, c.phone, c.city
     FROM customer_sessions s JOIN customers c ON c.id = s.customer_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash(token)],
  )
  return rows[0] || null
}

async function requireUser(req, res, roles = null) {
  const user = await currentUser(req)
  if (!user) {
    apiError(res, 401, 'Сеанс завершився. Увійдіть знову.')
    return null
  }
  if (roles && !roles.includes(user.role)) {
    apiError(res, 403, 'У вас немає прав для цієї дії.')
    return null
  }
  return user
}

function sendSessionCookie(req, res, name) {
  setSessionCookie(req, res, name, '', 0)
}

function text(value, maximum = 200) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function validEmail(value) {
  return value.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
}

function userPayload(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    role_label: ROLE_LABELS[row.role],
    work_status: row.work_status || 'На роботі',
  }
}

async function initDB() {
  if (!process.env.DATABASE_URL) throw new Error('Не задано обов’язкову змінну DATABASE_URL.')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id BIGSERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL UNIQUE,
      contact_name VARCHAR(100) NOT NULL DEFAULT '', phone VARCHAR(30) NOT NULL DEFAULT '',
      email VARCHAR(254) NOT NULL DEFAULT '', address VARCHAR(200) NOT NULL DEFAULT '',
      notes VARCHAR(500) NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      sku VARCHAR(50) PRIMARY KEY, name VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL, category_name VARCHAR(100) NOT NULL,
      price INTEGER NOT NULL CHECK(price >= 0), unit VARCHAR(50) NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0), description TEXT NOT NULL DEFAULT '',
      color VARCHAR(50) NOT NULL DEFAULT 'green', visual VARCHAR(50) NOT NULL DEFAULT '',
      emoji VARCHAR(10) NOT NULL DEFAULT '🛒', supplier VARCHAR(120) NOT NULL DEFAULT '',
      supplier_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE
    );
    ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier VARCHAR(120) NOT NULL DEFAULT '';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY, username VARCHAR(32) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL, role VARCHAR(20) NOT NULL
        CHECK(role IN ('director', 'accountant', 'inventory')),
      password_hash TEXT NOT NULL, work_status VARCHAR(40) NOT NULL DEFAULT 'На роботі',
      active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash CHAR(64) PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS work_status_history (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(40) NOT NULL, changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      work_seconds INTEGER
    );
    CREATE TABLE IF NOT EXISTS customers (
      id BIGSERIAL PRIMARY KEY, email VARCHAR(254) UNIQUE,
      name VARCHAR(100) NOT NULL, phone VARCHAR(20) NOT NULL UNIQUE,
      password_hash TEXT, city VARCHAR(80) NOT NULL DEFAULT 'Київ',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(254);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique ON customers (LOWER(email)) WHERE email IS NOT NULL;

    CREATE TABLE IF NOT EXISTS customer_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customer_favorites (
      customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      product_sku VARCHAR(50) NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (customer_id, product_sku)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      customer_name VARCHAR(100) NOT NULL DEFAULT '', phone VARCHAR(20) NOT NULL DEFAULT '',
      address VARCHAR(200) NOT NULL DEFAULT '', total INTEGER NOT NULL DEFAULT 0 CHECK(total >= 0),
      status VARCHAR(40) NOT NULL DEFAULT 'Нове',
      payment_status VARCHAR(40) NOT NULL DEFAULT 'Очікує оплати',
      customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
      city VARCHAR(80) NOT NULL DEFAULT 'Київ'
    );
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100) NOT NULL DEFAULT '';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS total INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'Нове';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(40) NOT NULL DEFAULT 'Очікує оплати';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS city VARCHAR(80) NOT NULL DEFAULT 'Київ';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS name VARCHAR(100);
    UPDATE orders SET customer_name = name WHERE customer_name = '' AND name IS NOT NULL;
    CREATE TABLE IF NOT EXISTS order_items (
      id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_sku VARCHAR(50) NOT NULL, product_name VARCHAR(255) NOT NULL,
      unit VARCHAR(50) NOT NULL, unit_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0)
    );
    CREATE TABLE IF NOT EXISTS support_messages (
      id BIGSERIAL PRIMARY KEY, customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
      name VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL, subject VARCHAR(120) NOT NULL,
      message VARCHAR(3000) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'Нове',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  const catalogDir = path.join(rootDir, 'catalogs')
  const files = (await fs.readdir(catalogDir)).filter((file) => file.endsWith('.json')).sort()
  const categories = []
  for (const file of files) {
    const catalog = JSON.parse(await fs.readFile(path.join(catalogDir, file), 'utf8'))
    categories.push({ slug: catalog.slug, name: catalog.name })
    for (const product of catalog.products) {
      await pool.query(
        `INSERT INTO products
         (sku, name, description, price, category, category_name, unit, emoji, color, visual, stock)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (sku) DO NOTHING`,
        [product.sku, product.name, product.description, product.price, catalog.slug,
          catalog.name, product.unit, product.emoji, product.color, product.visual || '', product.stock],
      )
    }
  }
  for (const category of categories) {
    await pool.query(
      `UPDATE products
       SET category = $1, category_name = $2
       WHERE category_name = $2 AND category <> $1`,
      [category.slug, category.name],
    )
  }
  const legacyProductReplacements = [
    {
      sku: 'MEAT-01',
      oldName: 'Куряче філе охолоджене',
      name: 'Фарш яловичий охолоджений',
      description: 'Свіжий фарш із добірної яловичини.',
      emoji: '🥩',
      color: 'rose',
    },
    {
      sku: 'YOG-02',
      oldName: 'Йогурт натуральний',
      name: 'Кефір домашній 2,5%',
      description: 'Ніжний кисломолочний напій щоденного приготування.',
      emoji: '🥛',
      color: 'blue',
    },
    {
      sku: 'DRINK-01',
      oldName: 'Сік яблучний натуральний',
      name: 'Лимонад домашній',
      description: 'Освіжаючий лимонад із натурального лимона.',
      emoji: '🍋',
      color: 'yellow',
    },
  ]
  for (const product of legacyProductReplacements) {
    await pool.query(
      `UPDATE products
       SET name = $1, description = $2, emoji = $3, color = $4, visual = ''
       WHERE sku = $5 AND name = $6`,
      [product.name, product.description, product.emoji, product.color, product.sku, product.oldName],
    )
  }

  const directorUsername = process.env.PROMETEY_ADMIN_USERNAME || 'director'
  const adminPassword = process.env.PROMETEY_ADMIN_PASSWORD || ''
  const existingDirector = await pool.query('SELECT 1 FROM users WHERE username = $1', [directorUsername])
  if (existingDirector.rowCount === 0) {
    if (adminPassword.length < 12) {
      throw new Error('Для створення директора задайте PROMETEY_ADMIN_PASSWORD довжиною щонайменше 12 символів.')
    }
    await pool.query(
      `INSERT INTO users (username, name, role, password_hash)
       VALUES ($1, 'Директор магазину', 'director', $2)`,
      [directorUsername, hashPassword(adminPassword)],
    )
  }
  await pool.query(
    `INSERT INTO work_status_history (user_id, status, changed_at)
     SELECT u.id, u.work_status, NOW() FROM users u
     WHERE NOT EXISTS (
       SELECT 1 FROM work_status_history h WHERE h.user_id = u.id
     )`,
  )
}

app.get('/api/test', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT NOW() AS now')
    res.json({ success: true, time: rows[0] })
  } catch (error) { next(error) }
})

app.get('/api/products', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT sku, name, description, price, category, category_name, unit, emoji, color, visual, stock
       FROM products WHERE active = TRUE ORDER BY category, name`,
    )
    res.json({ products: rows })
  } catch (error) { next(error) }
})

app.get('/api/cities', (req, res) => res.json({ cities: DELIVERY_CITIES }))

app.get('/api/auth/me', async (req, res, next) => {
  try {
    const user = await currentUser(req)
    if (!user) return apiError(res, 401, 'Увійдіть до системи.')
    res.json({ user })
  } catch (error) { next(error) }
})

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const username = text(req.body?.username, 64)
    const password = req.body?.password
    if (typeof password !== 'string' || password.length > 256) {
      return apiError(res, 400, "Перевірте ім'я та пароль.")
    }
    const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND active = TRUE', [username])
    const user = rows[0]
    if (!user || !verifyPassword(password, user.password_hash)) {
      return apiError(res, 401, "Невірне ім'я або пароль.")
    }
    await issueSession(req, res, 'sessions', 'user_id', user.id, 'prometey_session')
    res.json({ user: userPayload(user) })
  } catch (error) { next(error) }
})

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    const token = getCookie(req, 'prometey_session')
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)])
    sendSessionCookie(req, res, 'prometey_session')
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.get('/api/demo/staff', async (req, res, next) => {
  try {
    const enabled = process.env.PROMETEY_DEMO_MODE === '1'
      && !process.env.RENDER
      && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip)
    if (!enabled) return res.json({ enabled: false, staff: [] })
    const { rows } = await pool.query(
      'SELECT id, username, name, role, work_status, active FROM users ORDER BY active DESC, id',
    )
    res.json({ enabled: true, staff: rows.map((row) => ({ ...userPayload(row), active: row.active })) })
  } catch (error) { next(error) }
})

app.post('/api/demo/login', async (req, res, next) => {
  try {
    const enabled = process.env.PROMETEY_DEMO_MODE === '1'
      && !process.env.RENDER
      && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip)
    if (!enabled) return apiError(res, 404, 'Деморежим швидкого входу вимкнений.')
    const userId = Number(req.body?.user_id)
    if (!Number.isInteger(userId)) return apiError(res, 400, 'Оберіть працівника зі списку.')
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 AND active', [userId])
    if (!rows[0]) return apiError(res, 404, 'Активного працівника не знайдено.')
    await issueSession(req, res, 'sessions', 'user_id', userId, 'prometey_session')
    res.json({ user: userPayload(rows[0]) })
  } catch (error) { next(error) }
})

app.post('/api/customer/register', async (req, res, next) => {
  const name = text(req.body?.name, 100)
  const email = text(req.body?.email, 254).toLowerCase()
  const phone = text(req.body?.phone, 20)
  const city = req.body?.city
  const password = req.body?.password
  if (name.length < 2 || !validEmail(email) || !/^[+0-9()\-\s]{9,20}$/.test(phone)
    || !DELIVERY_CITIES.includes(city) || typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return apiError(res, 400, 'Перевірте дані. Пароль має містити щонайменше 12 символів.')
  }
  try {
    const insert = await pool.query(
      `INSERT INTO customers (name, email, phone, city, password_hash)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (phone) DO UPDATE SET
         name = EXCLUDED.name, email = EXCLUDED.email, city = EXCLUDED.city,
         password_hash = EXCLUDED.password_hash
       WHERE customers.email IS NULL AND customers.password_hash IS NULL
       RETURNING id`,
      [name, email, phone, city, hashPassword(password)],
    )
    if (!insert.rowCount) return apiError(res, 409, 'Обліковий запис із цією поштою або телефоном вже існує.')
    const { rows } = await pool.query(
      'SELECT id, name, email, phone, city FROM customers WHERE id = $1',
      [insert.rows[0].id],
    )
    await issueSession(req, res, 'customer_sessions', 'customer_id', rows[0].id, 'prometey_customer_session')
    res.status(201).json({ customer: rows[0] })
  } catch (error) {
    if (error.code === '23505') return apiError(res, 409, 'Обліковий запис із цією поштою або телефоном вже існує.')
    next(error)
  }
})

app.post('/api/customer/login', async (req, res, next) => {
  const email = text(req.body?.email, 254).toLowerCase()
  const password = req.body?.password
  if (!validEmail(email) || typeof password !== 'string' || password.length > 256) {
    return apiError(res, 400, 'Перевірте електронну пошту та пароль.')
  }
  try {
    const { rows } = await pool.query('SELECT * FROM customers WHERE LOWER(email) = LOWER($1)', [email])
    const customer = rows[0]
    if (!customer || !verifyPassword(password, customer.password_hash)) {
      return apiError(res, 401, 'Невірна електронна пошта або пароль.')
    }
    await issueSession(req, res, 'customer_sessions', 'customer_id', customer.id, 'prometey_customer_session')
    res.json({ customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, city: customer.city } })
  } catch (error) { next(error) }
})

app.get('/api/customer/me', async (req, res, next) => {
  try {
    const customer = await currentCustomer(req)
    if (!customer) return apiError(res, 401, 'Увійдіть до особистого кабінету.')
    res.json({ customer })
  } catch (error) { next(error) }
})

app.get('/api/customer/favorites', async (req, res, next) => {
  try {
    const customer = await currentCustomer(req)
    if (!customer) return apiError(res, 401, 'Увійдіть до особистого кабінету.')
    const { rows } = await pool.query(
      `SELECT f.product_sku AS sku FROM customer_favorites f
       JOIN products p ON p.sku = f.product_sku
       WHERE f.customer_id = $1 AND p.active
       ORDER BY f.created_at, f.product_sku`,
      [customer.id],
    )
    res.json({ favorites: rows.map((row) => row.sku) })
  } catch (error) { next(error) }
})

app.post('/api/customer/favorites', async (req, res, next) => {
  try {
    const customer = await currentCustomer(req)
    if (!customer) return apiError(res, 401, 'Увійдіть до особистого кабінету.')
    const sku = text(req.body?.sku, 50)
    if (!sku) return apiError(res, 400, 'Оберіть товар для улюбленого.')
    const product = await pool.query('SELECT 1 FROM products WHERE sku = $1 AND active', [sku])
    if (!product.rowCount) return apiError(res, 404, 'Товар не знайдено.')
    await pool.query(
      `INSERT INTO customer_favorites (customer_id, product_sku)
       VALUES ($1, $2) ON CONFLICT (customer_id, product_sku) DO NOTHING`,
      [customer.id, sku],
    )
    res.status(201).json({ ok: true })
  } catch (error) { next(error) }
})

app.delete('/api/customer/favorites/:sku', async (req, res, next) => {
  try {
    const customer = await currentCustomer(req)
    if (!customer) return apiError(res, 401, 'Увійдіть до особистого кабінету.')
    const sku = text(req.params.sku, 50)
    if (!sku) return apiError(res, 400, 'Оберіть товар для видалення.')
    await pool.query(
      'DELETE FROM customer_favorites WHERE customer_id = $1 AND product_sku = $2',
      [customer.id, sku],
    )
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/customer/logout', async (req, res, next) => {
  try {
    const token = getCookie(req, 'prometey_customer_session')
    if (token) await pool.query('DELETE FROM customer_sessions WHERE token_hash = $1', [tokenHash(token)])
    sendSessionCookie(req, res, 'prometey_customer_session')
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.get('/api/customer/orders', async (req, res, next) => {
  try {
    const customer = await currentCustomer(req)
    if (!customer) return apiError(res, 401, 'Увійдіть до особистого кабінету.')
    const { rows } = await pool.query(
      `SELECT o.id, o.created_at, o.total, o.status, o.payment_status, o.city,
       COALESCE(json_agg(json_build_object(
         'product_name', i.product_name, 'unit', i.unit, 'unit_price', i.unit_price,
         'quantity', i.quantity, 'line_total', i.unit_price * i.quantity
       ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
       FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
       WHERE o.customer_id = $1 GROUP BY o.id ORDER BY o.id DESC LIMIT 100`,
      [customer.id],
    )
    res.json({ orders: rows })
  } catch (error) { next(error) }
})

app.post('/api/customer/orders/:id/cancel', async (req, res, next) => {
  let client
  try {
    const customer = await currentCustomer(req)
    if (!customer) return apiError(res, 401, 'Увійдіть до особистого кабінету.')
    const orderId = Number(req.params.id)
    if (!Number.isSafeInteger(orderId) || orderId < 1) {
      return apiError(res, 400, 'Некоректний номер замовлення.')
    }

    client = await pool.connect()
    await client.query('BEGIN')
    const result = await client.query(
      `SELECT id, status, payment_status FROM orders
       WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
      [orderId, customer.id],
    )
    const order = result.rows[0]
    if (!order) {
      await client.query('ROLLBACK')
      return apiError(res, 404, 'Замовлення не знайдено.')
    }
    if (order.status !== 'Нове' || order.payment_status === 'Оплачено') {
      await client.query('ROLLBACK')
      return apiError(res, 409, 'Це замовлення вже не можна скасувати. Зверніться до підтримки.')
    }

    const items = await client.query(
      'SELECT product_sku, quantity FROM order_items WHERE order_id = $1',
      [orderId],
    )
    for (const item of items.rows) {
      await client.query(
        'UPDATE products SET stock = stock + $1 WHERE sku = $2',
        [item.quantity, item.product_sku],
      )
    }
    await client.query("UPDATE orders SET status = 'Скасовано' WHERE id = $1", [orderId])
    await client.query('COMMIT')
    res.json({ ok: true, status: 'Скасовано' })
  } catch (error) {
    if (client) await client.query('ROLLBACK')
    next(error)
  } finally {
    client?.release()
  }
})

app.post('/api/orders', async (req, res, next) => {
  const name = text(req.body?.name, 100)
  const phone = text(req.body?.phone, 20)
  const city = req.body?.city
  const address = text(req.body?.address, 200)
  const items = req.body?.items
  if (name.length < 2 || !/^[+0-9()\-\s]{9,20}$/.test(phone) || address.length < 5
    || !DELIVERY_CITIES.includes(city) || !Array.isArray(items) || items.length < 1 || items.length > 50) {
    return apiError(res, 400, 'Перевірте дані замовлення.')
  }
  const quantities = new Map()
  for (const item of items) {
    if (typeof item?.sku !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      return apiError(res, 400, 'Некоректний товар у кошику.')
    }
    const quantity = (quantities.get(item.sku) || 0) + item.quantity
    if (quantity > 99) return apiError(res, 400, 'Завелика кількість товару.')
    quantities.set(item.sku, quantity)
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const customer = await currentCustomer(req)
    const products = new Map()
    for (const [sku, quantity] of quantities) {
      const result = await client.query('SELECT * FROM products WHERE sku = $1 AND active = TRUE FOR UPDATE', [sku])
      const product = result.rows[0]
      if (!product) throw Object.assign(new Error('Один із товарів більше недоступний.'), { status: 409 })
      if (product.stock < quantity) throw Object.assign(new Error(`Недостатньо товару «${product.name}» на складі.`), { status: 409 })
      products.set(sku, product)
    }
    const total = [...quantities].reduce((sum, [sku, quantity]) => sum + products.get(sku).price * quantity, 0)
    const orderResult = await client.query(
      `INSERT INTO orders (customer_name, name, phone, address, total, customer_id, city)
       VALUES ($1,$1,$2,$3,$4,$5,$6) RETURNING id`,
      [name, phone, address, total, customer?.id || null, city],
    )
    const orderId = orderResult.rows[0].id
    for (const [sku, quantity] of quantities) {
      const product = products.get(sku)
      await client.query(
        `INSERT INTO order_items (order_id, product_sku, product_name, unit, unit_price, quantity)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orderId, sku, product.name, product.unit, product.price, quantity],
      )
      await client.query('UPDATE products SET stock = stock - $1 WHERE sku = $2', [quantity, sku])
    }
    await client.query('COMMIT')
    res.status(201).json({ order_id: orderId, total, message: 'Замовлення прийнято!' })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error.status) return apiError(res, error.status, error.message)
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/support', async (req, res, next) => {
  const name = text(req.body?.name, 100)
  const email = text(req.body?.email, 254).toLowerCase()
  const subject = text(req.body?.subject, 120)
  const message = text(req.body?.message, 3000)
  if (name.length < 2 || !validEmail(email) || subject.length < 3 || message.length < 10) {
    return apiError(res, 400, 'Перевірте тему та текст звернення.')
  }
  try {
    const customer = await currentCustomer(req)
    await pool.query(
      'INSERT INTO support_messages (customer_id, name, email, subject, message) VALUES ($1,$2,$3,$4,$5)',
      [customer?.id || null, name, email, subject, message],
    )
    res.status(201).json({ message: 'Звернення надіслано.' })
  } catch (error) { next(error) }
})

async function financials() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS order_count, COALESCE(SUM(total),0)::int AS revenue,
     COALESCE(SUM(total) FILTER (WHERE payment_status = 'Оплачено'),0)::int AS paid,
     COALESCE(SUM(total) FILTER (WHERE payment_status <> 'Оплачено'),0)::int AS due
     FROM orders WHERE COALESCE(status, '') <> 'Скасовано'`,
  )
  return rows[0]
}

app.get('/api/admin/overview', async (req, res, next) => {
  try {
    const user = await requireUser(req, res, ['director', 'accountant'])
    if (!user) return
    const result = { financials: await financials() }
    if (user.role === 'director') {
      const { rows } = await pool.query(
        `SELECT COUNT(*) FILTER (WHERE active)::int AS products_count,
         COUNT(*) FILTER (WHERE active AND stock <= 5)::int AS low_stock_count
         FROM products`,
      )
      const staff = await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE active')
      Object.assign(result, rows[0], { staff_count: staff.rows[0].count })
    }
    res.json(result)
  } catch (error) { next(error) }
})

app.get('/api/admin/orders', async (req, res, next) => {
  try {
    const user = await requireUser(req, res, ['director', 'accountant'])
    if (!user) return
    const fields = user.role === 'director'
      ? 'id, created_at, total, payment_status, customer_name, phone, address, status, city'
      : 'id, created_at, total, payment_status, status'
    const { rows } = await pool.query(`SELECT ${fields} FROM orders ORDER BY id DESC LIMIT 100`)
    res.json({ orders: rows })
  } catch (error) { next(error) }
})

app.patch('/api/admin/orders/:id', async (req, res, next) => {
  try {
    const user = await requireUser(req, res, ['director', 'accountant'])
    if (!user) return
    const updates = []
    const values = []
    const payload = req.body || {}
    if (!Object.keys(payload).length || Object.keys(payload).some((key) => !['status', 'payment_status'].includes(key))) {
      return apiError(res, 400, 'Некоректні дані замовлення.')
    }
    if ('payment_status' in payload) {
      if (!['Оплачено', 'Очікує оплати'].includes(payload.payment_status)) return apiError(res, 400, 'Некоректний статус оплати.')
      values.push(payload.payment_status); updates.push(`payment_status = $${values.length}`)
    }
    if ('status' in payload) {
      if (user.role !== 'director') return apiError(res, 403, 'Керувати статусом замовлення може лише директор.')
      if (!['Нове', 'Комплектується', 'Доставляється', 'Виконано'].includes(payload.status)) return apiError(res, 400, 'Некоректний статус замовлення.')
      values.push(payload.status); updates.push(`status = $${values.length}`)
    }
    const orderId = Number(req.params.id)
    if (!Number.isSafeInteger(orderId) || orderId < 1) return apiError(res, 400, 'Некоректний номер замовлення.')
    values.push(orderId)
    const result = await pool.query(
      `UPDATE orders SET ${updates.join(', ')}
       WHERE id = $${values.length} AND COALESCE(status, '') <> 'Скасовано'
       RETURNING id`,
      values,
    )
    if (!result.rowCount) {
      const existing = await pool.query('SELECT id FROM orders WHERE id = $1', [orderId])
      return apiError(res, existing.rowCount ? 409 : 404, existing.rowCount
        ? 'Скасоване замовлення не можна змінювати.'
        : 'Замовлення не знайдено.')
    }
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.get('/api/admin/products', async (req, res, next) => {
  try {
    const user = await requireUser(req, res, ['director', 'inventory'])
    if (!user) return
    const [products, suppliers] = await Promise.all([
      pool.query(
        `SELECT p.sku, p.name, p.category_name, p.price, p.unit, p.stock,
         COALESCE(s.name, p.supplier, '') AS supplier, p.supplier_id
         FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.active ORDER BY p.category, p.name`,
      ),
      pool.query('SELECT id, name FROM suppliers WHERE active ORDER BY name'),
    ])
    res.json({ products: products.rows, suppliers: suppliers.rows })
  } catch (error) { next(error) }
})

app.patch('/api/admin/products/:sku', async (req, res, next) => {
  try {
    const user = await requireUser(req, res, ['director', 'inventory'])
    if (!user) return
    const { stock, price, supplier_id: supplierId } = req.body || {}
    const payloadKeys = Object.keys(req.body || {})
    if (!Number.isInteger(stock) || stock < 0 || stock > 100_000
      || (price !== undefined && (!Number.isInteger(price) || price < 0 || price > 10_000_000))
      || (supplierId !== undefined && supplierId !== null && !Number.isInteger(supplierId))
      || payloadKeys.some((key) => !['stock', 'price', 'supplier_id'].includes(key))) {
      return apiError(res, 400, 'Перевірте ціну, залишок і постачальника товару.')
    }
    if (supplierId !== undefined && supplierId !== null) {
      const found = await pool.query('SELECT 1 FROM suppliers WHERE id = $1 AND active', [supplierId])
      if (!found.rowCount) return apiError(res, 400, 'Оберіть чинного постачальника.')
    }
    const updates = ['stock = $1']
    const values = [stock]
    if (price !== undefined) { values.push(price); updates.push(`price = $${values.length}`) }
    if (supplierId !== undefined) { values.push(supplierId); updates.push(`supplier_id = $${values.length}`) }
    values.push(req.params.sku)
    const result = await pool.query(`UPDATE products SET ${updates.join(', ')} WHERE sku = $${values.length} AND active`, values)
    if (!result.rowCount) return apiError(res, 404, 'Товар не знайдено.')
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.get('/api/admin/users', async (req, res, next) => {
  try {
    if (!await requireUser(req, res, ['director'])) return
    const { rows } = await pool.query(
      'SELECT id, username, name, role, active, work_status, created_at FROM users ORDER BY id',
    )
    res.json({ users: rows.map((row) => ({ ...userPayload(row), active: row.active, created_at: row.created_at })) })
  } catch (error) { next(error) }
})

app.post('/api/admin/users', async (req, res, next) => {
  try {
    if (!await requireUser(req, res, ['director'])) return
    const username = text(req.body?.username, 32)
    const name = text(req.body?.name, 100)
    const password = req.body?.password
    const role = req.body?.role
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username) || name.length < 2
      || typeof password !== 'string' || password.length < 12 || password.length > 128
      || !Object.hasOwn(ROLE_LABELS, role)) {
      return apiError(res, 400, 'Перевірте дані. Пароль має містити щонайменше 12 символів.')
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const created = await client.query(
        'INSERT INTO users (username, name, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id',
        [username, name, role, hashPassword(password)],
      )
      await client.query(
        `INSERT INTO work_status_history (user_id, status) VALUES ($1, 'На роботі')`,
        [created.rows[0].id],
      )
      await client.query('COMMIT')
      res.status(201).json({ id: created.rows[0].id, message: 'Працівника додано.' })
    } catch (error) {
      await client.query('ROLLBACK')
      if (error.code === '23505') return apiError(res, 409, "Таке ім'я користувача вже існує.")
      throw error
    } finally { client.release() }
  } catch (error) { next(error) }
})

app.patch('/api/admin/users/:id', async (req, res, next) => {
  try {
    const current = await requireUser(req, res, ['director'])
    if (!current) return
    const id = Number(req.params.id)
    const { role, active } = req.body || {}
    if (!Number.isInteger(id) || !Object.hasOwn(ROLE_LABELS, role) || typeof active !== 'boolean') {
      return apiError(res, 400, 'Перевірте роль і стан доступу.')
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const targetResult = await client.query('SELECT id, role, active FROM users WHERE id = $1 FOR UPDATE', [id])
      const target = targetResult.rows[0]
      if (!target) { await client.query('ROLLBACK'); return apiError(res, 404, 'Працівника не знайдено.') }
      if (target.id === current.id && !active) { await client.query('ROLLBACK'); return apiError(res, 400, 'Не можна вимкнути власний доступ.') }
      if (target.active && target.role === 'director' && (role !== 'director' || !active)) {
        const count = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'director' AND active")
        if (count.rows[0].count <= 1) { await client.query('ROLLBACK'); return apiError(res, 409, 'У системі має залишитися хоча б один директор.') }
      }
      await client.query('UPDATE users SET role = $1, active = $2 WHERE id = $3', [role, active, id])
      if (!active) await client.query('DELETE FROM sessions WHERE user_id = $1', [id])
      await client.query('COMMIT')
      res.json({ ok: true })
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  } catch (error) { next(error) }
})

app.get('/api/admin/status-history', async (req, res, next) => {
  try {
    if (!await requireUser(req, res, ['director'])) return
    const { rows } = await pool.query(
      `SELECT h.id, u.name, u.username, h.status, h.changed_at, h.work_seconds
       FROM work_status_history h JOIN users u ON u.id = h.user_id
       ORDER BY h.id DESC LIMIT 500`,
    )
    res.json({ history: rows })
  } catch (error) { next(error) }
})

app.patch('/api/auth/status', async (req, res, next) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return
    const status = req.body?.work_status
    if (Object.keys(req.body || {}).length !== 1 || !WORK_STATUSES.includes(status)) {
      return apiError(res, 400, 'Оберіть коректний статус присутності.')
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const previous = await client.query('SELECT work_status FROM users WHERE id = $1 AND active FOR UPDATE', [user.id])
      if (!previous.rowCount) { await client.query('ROLLBACK'); return apiError(res, 401, 'Обліковий запис неактивний.') }
      if (previous.rows[0].work_status === status) { await client.query('COMMIT'); return res.json({ ok: true, work_status: status }) }
      let workSeconds = null
      if (status === 'Кінець робочого дня' && previous.rows[0].work_status === 'На роботі') {
        const started = await client.query(
          `SELECT changed_at FROM work_status_history
           WHERE user_id = $1 AND status = 'На роботі' ORDER BY id DESC LIMIT 1`,
          [user.id],
        )
        if (started.rowCount) workSeconds = Math.max(0, Math.floor((Date.now() - new Date(started.rows[0].changed_at).getTime()) / 1000))
      }
      await client.query('UPDATE users SET work_status = $1 WHERE id = $2', [status, user.id])
      await client.query(
        'INSERT INTO work_status_history (user_id, status, work_seconds) VALUES ($1,$2,$3)',
        [user.id, status, workSeconds],
      )
      await client.query('COMMIT')
      res.json({ ok: true, work_status: status })
    } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  } catch (error) { next(error) }
})

app.get('/api/admin/suppliers', async (req, res, next) => {
  try {
    if (!await requireUser(req, res, ['director'])) return
    const { rows } = await pool.query(
      'SELECT id, name, contact_name, phone, email, address, notes, active, created_at FROM suppliers ORDER BY active DESC, name',
    )
    res.json({ suppliers: rows })
  } catch (error) { next(error) }
})

app.post('/api/admin/suppliers', async (req, res, next) => {
  try {
    if (!await requireUser(req, res, ['director'])) return
    const name = text(req.body?.name, 120)
    const contact = text(req.body?.contact_name, 100)
    const phone = text(req.body?.phone, 30)
    const email = text(req.body?.email, 254)
    const address = text(req.body?.address, 200)
    const notes = text(req.body?.notes, 500)
    if (name.length < 2 || (email && !validEmail(email))) return apiError(res, 400, 'Перевірте інформацію про постачальника.')
    const { rows } = await pool.query(
      `INSERT INTO suppliers (name, contact_name, phone, email, address, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [name, contact, phone, email, address, notes],
    )
    res.status(201).json({ id: rows[0].id, message: 'Постачальника додано.' })
  } catch (error) {
    if (error.code === '23505') return apiError(res, 409, 'Постачальник із такою назвою вже є.')
    next(error)
  }
})

app.get('/api/admin/support', async (req, res, next) => {
  try {
    if (!await requireUser(req, res, ['director'])) return
    const { rows } = await pool.query(
      'SELECT id, name, email, subject, message, status, created_at FROM support_messages ORDER BY id DESC LIMIT 200',
    )
    res.json({ messages: rows })
  } catch (error) { next(error) }
})

app.patch('/api/admin/support/:id', async (req, res, next) => {
  try {
    if (!await requireUser(req, res, ['director'])) return
    const { status } = req.body || {}
    if (!['Нове', 'У роботі', 'Відповіли'].includes(status)) return apiError(res, 400, 'Некоректний статус звернення.')
    const result = await pool.query('UPDATE support_messages SET status = $1 WHERE id = $2', [status, Number(req.params.id)])
    if (!result.rowCount) return apiError(res, 404, 'Звернення не знайдено.')
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.use('/api', (req, res) => apiError(res, 404, 'Маршрут API не знайдено. Перевірте налаштування сервера.'))
app.use(express.static(path.join(rootDir, 'dist')))
app.get(/.*/, (req, res) => res.sendFile(path.join(rootDir, 'dist', 'index.html')))

app.use((error, req, res, next) => {
  console.error('Помилка API:', error)
  if (res.headersSent) return next(error)
  if (error instanceof SyntaxError && 'body' in error) {
    return apiError(res, 400, 'Некоректний JSON у запиті.')
  }
  apiError(res, 500, 'Внутрішня помилка сервера. Спробуйте пізніше.')
})

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Prometey Node API працює на порту ${PORT}`)
  })
}).catch((error) => {
  console.error('Не вдалося запустити сервер:', error)
  process.exitCode = 1
})
