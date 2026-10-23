import express from 'express';
import pkg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Підключення до бази даних Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const INITIAL_PRODUCTS = [
  { sku: 'MILK-01', name: 'Фермерське молоко 2.5%', category: 'molochni-produkty', category_name: 'Молочні продукти', price: 4200, unit: 'л', stock: 25, description: 'Свіже натуральне молоко з ферми.', color: 'green', visual: 'milk-churn', emoji: '🥛' },
  { sku: 'YOG-02', name: 'Йогурт натуральний', category: 'molochni-produkty', category_name: 'Молочні продукти', price: 3500, unit: 'шт', stock: 18, description: 'Густий та корисний йогурт без добавок.', color: 'pink', visual: 'yogurt-cup', emoji: '🥄' },
  { sku: 'BREAD-01', name: 'Хліб пшеничний домашній', category: 'hlib-ta-vypychka', category_name: 'Хліб та випічка', price: 2800, unit: 'шт', stock: 15, description: 'Свіжоспечений хліб з хрусткою скоринкою.', color: 'amber', visual: 'default', emoji: '🍞' },
  { sku: 'MEAT-01', name: 'Куряче філе охолоджене', category: 'miaso-ta-pytysia', category_name: 'М’ясо та птиця', price: 16500, unit: 'кг', stock: 10, description: 'Ніжне куряче філе високої якості.', color: 'red', visual: 'default', emoji: '🍗' },
  { sku: 'FRUIT-01', name: 'Яблука українські', category: 'ovochi-ta-frukty', category_name: 'Овочі та фрукти', price: 3200, unit: 'кг', stock: 40, description: 'Соковиті та солодкі садові яблука.', color: 'green', visual: 'default', emoji: '🍎' },
  { sku: 'DRINK-01', name: 'Сік яблучний натуральний', category: 'napoi', category_name: 'Напої', price: 5500, unit: 'л', stock: 20, description: '100% натуральний сік без цукру.', color: 'yellow', visual: 'default', emoji: '🧃' },
  { sku: 'SWEET-01', name: 'Мед квітковий', category: 'smacholiki', category_name: 'Смаколики', price: 12000, unit: 'упак', stock: 12, description: 'Ароматний натуральний мед з пасіки.', color: 'amber', visual: 'default', emoji: '🍯' }
];

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        sku VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        category_name VARCHAR(100) NOT NULL,
        price INTEGER NOT NULL,
        unit VARCHAR(50) NOT NULL,
        stock INTEGER NOT NULL,
        description TEXT,
        color VARCHAR(50),
        visual VARCHAR(50),
        emoji VARCHAR(10)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        phone VARCHAR(50),
        city VARCHAR(100),
        address TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        phone VARCHAR(50) UNIQUE,
        city VARCHAR(100)
      );
    `);

    const check = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(check.rows[0].count) === 0) {
      for (const p of INITIAL_PRODUCTS) {
        await pool.query(
          `INSERT INTO products (sku, name, category, category_name, price, unit, stock, description, color, visual, emoji)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (sku) DO NOTHING;`,
          [p.sku, p.name, p.category, p.category_name, p.price, p.unit, p.stock, p.description, p.color, p.visual, p.emoji]
        );
      }
    }
  } catch (err) {
    console.error('Помилка ініціалізації бази даних:', err);
  }
}

// 1. Тест
app.get('/api/test', async (req, res) => {
  res.json({ success: true });
});

// 2. Продукти (ЗАХИЩЕНИЙ РОУТ — завжди повертає масив)
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    if (!result.rows || result.rows.length === 0) {
      return res.json(INITIAL_PRODUCTS);
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Помилка завантаження товарів з БД:', err);
    res.json(INITIAL_PRODUCTS); // Резервний варіант, щоб фронтенд не падаляв
  }
});

// 3. Міста доставки
app.get('/api/cities', async (req, res) => {
  res.json(['Київ', 'Львів', 'Харків', 'Одеса', 'Дніпро']);
});

// 4. Поточний користувач / кабінет
app.get('/api/me', async (req, res) => {
  res.json(null);
});

// 5. Реєстрація покупця
app.post('/api/customer/register', async (req, res) => {
  const { name, phone, city } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO customers (name, phone, city) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, city = EXCLUDED.city 
       RETURNING *`,
      [name, phone, city]
    );
    res.json({ success: true, customer: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Не вдалося зареєструвати користувача' });
  }
});

// 6. Замовлення
app.post('/api/orders', async (req, res) => {
  const { name, phone, city, address } = req.body;
  try {
    const orderResult = await pool.query(
      'INSERT INTO orders (name, phone, city, address, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
      [name, phone, city, address]
    );
    res.json({ success: true, order_id: orderResult.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Не вдалося оформити замовлення' });
  }
});

// 7. Статика та роутинг (ЗАВЖДИ В САМОМУ КІНЦІ)
app.use(express.static(path.join(__dirname, '../dist')));

app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 5000;

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Сервер запущено на порту ${PORT}`);
  });
});