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

// 1. Тестовий роут для перевірки бази
app.get('/api/test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Помилка підключення до бази даних' });
  }
});

// 2. Отримання списку продуктів з бази даних
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не вдалося завантажити товари' });
  }
});

// 3. Створення замовлення
app.post('/api/orders', async (req, res) => {
  const { name, phone, city, address, items } = req.body;
  try {
    // Тут додається логіка створення замовлення у вашій базі даних
    // Наприклад, зберігаємо замовлення і повертаємо його ID
    const orderResult = await pool.query(
      'INSERT INTO orders (name, phone, city, address, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
      [name, phone, city, address]
    );
    const orderId = orderResult.rows[0].id;
    res.json({ success: true, order_id: orderId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не вдалося оформити замовлення' });
  }
});

// 4. Роздаємо статичні файли фронтенду з папки dist
app.use(express.static(path.join(__dirname, '../dist')));

// 5. Універсальний роутинг для React (ЗАВЖДИ МАЄ БУТИ В САМОМУ КІНЦІ!)
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Сервер успішно запущено на порту ${PORT}`);
});