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

// Тестовий роут для перевірки бази
app.get('/api/test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Помилка підключення до бази даних' });
  }
});

// Роздаємо статичні файли фронтенду з папки dist (яка знаходиться в корені проєкту)
app.use(express.static(path.join(__dirname, '../dist')));

// Для будь-яких інших запитів повертаємо index.html (для коректної роботи роутингу React)
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Сервер успішно запущено на порту ${PORT}`);
});