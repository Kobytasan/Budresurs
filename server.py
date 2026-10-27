import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(
    os.environ.get(
        "BUDRESURS_DB_PATH",
        os.environ.get("PROMETEY_DB_PATH", str(BASE_DIR / "data" / "prometey.db")),
    )
).expanduser().resolve()
DB_DIR = DB_PATH.parent
CATALOG_DIR = BASE_DIR / "catalogs"
FRONTEND_DIST = BASE_DIR / "dist"
SESSION_HOURS = 12
PBKDF2_ITERATIONS = 310_000
DEMO_MODE_ENABLED = os.environ.get(
    "BUDRESURS_DEMO_MODE", os.environ.get("PROMETEY_DEMO_MODE", "1")
) == "1"
ROLES = {"director", "accountant", "inventory", "manager"}
WORK_STATUSES = {
    "На роботі", "Вихідний", "У відпустці", "Кінець робочого дня",
}
DELIVERY_CITIES = {
    "Київ", "Львів", "Одеса", "Дніпро", "Харків", "Вінниця", "Черкаси", "Полтава",
}
ROLE_LABELS = {
    "director": "Директор",
    "accountant": "Бухгалтер",
    "inventory": "Працівник складу",
    "manager": "Менеджер продажу",
}


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def get_db():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(password, stored):
    try:
        salt_hex, expected = stored.split(":", 1)
        actual = hash_password(password, bytes.fromhex(salt_hex)).split(":", 1)[1]
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def init_db():
    DB_DIR.mkdir(parents=True, exist_ok=True)
    with get_db() as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS suppliers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                contact_name TEXT NOT NULL DEFAULT '',
                phone TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                price INTEGER NOT NULL CHECK(price >= 0),
                category TEXT NOT NULL,
                category_name TEXT NOT NULL,
                unit TEXT NOT NULL,
                emoji TEXT NOT NULL,
                color TEXT NOT NULL,
                visual TEXT NOT NULL DEFAULT '',
                supplier TEXT NOT NULL DEFAULT '',
                supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
                stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
                active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                name TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('director', 'accountant', 'inventory')),
                password_hash TEXT NOT NULL,
                work_status TEXT NOT NULL DEFAULT 'На роботі',
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS work_status_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                changed_at TEXT NOT NULL,
                work_seconds INTEGER
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                city TEXT NOT NULL DEFAULT 'Київ',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS customer_sessions (
                token_hash TEXT PRIMARY KEY,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                customer_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                address TEXT NOT NULL,
                total INTEGER NOT NULL CHECK(total >= 0),
                status TEXT NOT NULL DEFAULT 'Нове',
                payment_status TEXT NOT NULL DEFAULT 'Очікує оплати',
                customer_id INTEGER REFERENCES customers(id),
                city TEXT NOT NULL DEFAULT 'Київ'
            );
            CREATE TABLE IF NOT EXISTS support_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Нове',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_sku TEXT NOT NULL,
                product_name TEXT NOT NULL,
                unit TEXT NOT NULL,
                unit_price INTEGER NOT NULL,
                quantity INTEGER NOT NULL CHECK(quantity > 0)
            );
            """
        )
        order_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(orders)").fetchall()
        }
        if "customer_id" not in order_columns:
            db.execute(
                "ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id)"
            )
        product_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(products)").fetchall()
        }
        if "visual" not in product_columns:
            db.execute("ALTER TABLE products ADD COLUMN visual TEXT NOT NULL DEFAULT ''")
        if "supplier" not in product_columns:
            db.execute("ALTER TABLE products ADD COLUMN supplier TEXT NOT NULL DEFAULT ''")
        if "supplier_id" not in product_columns:
            db.execute(
                "ALTER TABLE products ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)"
            )
        user_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(users)").fetchall()
        }
        if "work_status" not in user_columns:
            db.execute(
                "ALTER TABLE users ADD COLUMN work_status TEXT NOT NULL DEFAULT 'На роботі'"
            )
        users_schema = db.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
        ).fetchone()["sql"]
        if "'manager'" not in users_schema:
            db.execute("PRAGMA foreign_keys = OFF")
            try:
                db.execute("BEGIN IMMEDIATE")
                db.execute(
                    """CREATE TABLE users_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                        name TEXT NOT NULL,
                        role TEXT NOT NULL CHECK(role IN ('director', 'accountant', 'inventory', 'manager')),
                        password_hash TEXT NOT NULL,
                        work_status TEXT NOT NULL DEFAULT 'На роботі',
                        active INTEGER NOT NULL DEFAULT 1,
                        created_at TEXT NOT NULL
                    )"""
                )
                db.execute(
                    """INSERT INTO users_new
                       (id, username, name, role, password_hash, work_status, active, created_at)
                       SELECT id, username, name, role, password_hash, work_status, active, created_at
                       FROM users"""
                )
                db.execute("DROP TABLE users")
                db.execute("ALTER TABLE users_new RENAME TO users")
                db.commit()
            except Exception:
                db.rollback()
                raise
            finally:
                db.execute("PRAGMA foreign_keys = ON")
        customer_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(customers)").fetchall()
        }
        if "city" not in customer_columns:
            db.execute("ALTER TABLE customers ADD COLUMN city TEXT NOT NULL DEFAULT 'Київ'")
        order_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(orders)").fetchall()
        }
        if "city" not in order_columns:
            db.execute("ALTER TABLE orders ADD COLUMN city TEXT NOT NULL DEFAULT 'Київ'")
        for supplier in db.execute(
            "SELECT DISTINCT supplier FROM products WHERE trim(supplier) != ''"
        ).fetchall():
            db.execute(
                "INSERT OR IGNORE INTO suppliers (name, created_at) VALUES (?, ?)",
                (supplier["supplier"].strip(), utc_now()),
            )
        db.execute(
            """UPDATE products SET supplier_id = (
                   SELECT suppliers.id FROM suppliers
                   WHERE suppliers.name = products.supplier COLLATE NOCASE
               ) WHERE supplier_id IS NULL AND trim(supplier) != ''"""
        )
        legacy_categories = (
            "hlib-ta-vypichka",
            "miaso-ta-ptytsia",
            "molochni-produkty",
            "napoi",
            "ovochi-ta-frukty",
            "smacholiki",
        )
        db.executemany(
            "UPDATE products SET active = 0 WHERE category = ?",
            ((category,) for category in legacy_categories),
        )
        db.execute(
            "UPDATE users SET name = 'Директор Будресурс' "
            "WHERE username = 'director' AND name = 'Директор магазину'"
        )
        for catalog_path in sorted(CATALOG_DIR.glob("*.json")):
            catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
            for product in catalog["products"]:
                db.execute(
                    """INSERT OR IGNORE INTO products
                    (sku, name, description, price, category, category_name,
                     unit, emoji, color, visual, supplier, stock)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        product["sku"],
                        product["name"],
                        product["description"],
                        product["price"],
                        catalog["slug"],
                        catalog["name"],
                        product["unit"],
                        product["emoji"],
                        product["color"],
                        product.get("visual", ""),
                        product.get("supplier", ""),
                        product["stock"],
                    ),
                )
        db.execute(
            "UPDATE products SET price = 549900 "
            "WHERE sku = 'BR-PERFORATOR-800' AND price = 289900"
        )

        director_password = os.environ.get(
            "BUDRESURS_ADMIN_PASSWORD",
            os.environ.get("PROMETEY_ADMIN_PASSWORD", "BudresursDemo2026!"),
        )
        if not db.execute(
            "SELECT 1 FROM users WHERE username = 'director'"
        ).fetchone():
            db.execute(
                "INSERT INTO users (username, name, role, password_hash, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    "director",
                    "Директор Будресурс",
                    "director",
                    hash_password(director_password),
                    utc_now(),
                ),
            )
            if not os.environ.get("BUDRESURS_ADMIN_PASSWORD") and not os.environ.get("PROMETEY_ADMIN_PASSWORD"):
                print(
                    "УВАГА: використовується демонстраційний пароль директора. "
                    "Задайте змінну BUDRESURS_ADMIN_PASSWORD перед запуском.",
                    file=sys.stderr,
                )
        for user in db.execute(
            """SELECT id, work_status FROM users
               WHERE NOT EXISTS (
                   SELECT 1 FROM work_status_history
                   WHERE work_status_history.user_id = users.id
               )"""
        ).fetchall():
            db.execute(
                """INSERT INTO work_status_history (user_id, status, changed_at)
                   VALUES (?, ?, ?)""",
                (user["id"], user["work_status"], utc_now()),
            )
        db.execute(
            """UPDATE products SET supplier_id = (
                   SELECT suppliers.id FROM suppliers
                   WHERE suppliers.name = products.supplier COLLATE NOCASE
               ) WHERE supplier_id IS NULL AND trim(supplier) != ''"""
        )


def user_payload(row):
    return {
        "id": row["id"],
        "username": row["username"],
        "name": row["name"],
        "role": row["role"],
        "role_label": ROLE_LABELS[row["role"]],
        "work_status": row["work_status"] if "work_status" in row.keys() else "На роботі",
    }


class StoreHandler(BaseHTTPRequestHandler):
    server_version = "BudresursCatalog/1.0"

    def log_message(self, format_string, *args):
        print(f"{self.log_date_time_string()} {format_string % args}")

    def send_json(self, status, data, headers=None):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        if headers:
            for name, value in headers.items():
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 32_768:
                raise ValueError
            value = json.loads(self.rfile.read(length))
            if not isinstance(value, dict):
                raise ValueError
            return value
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            raise ValueError("Некоректні дані запиту.") from None

    def request_path(self):
        return unquote(urlparse(self.path).path)

    def do_GET(self):
        path = self.request_path()
        if path == "/api/products":
            with get_db() as db:
                products = db.execute(
                    """SELECT sku, name, description, price, category, category_name,
                              unit, emoji, color, visual, stock
                       FROM products WHERE active = 1 ORDER BY category, name"""
                ).fetchall()
            return self.send_json(200, {"products": [dict(row) for row in products]})
        if path == "/api/cities":
            return self.send_json(200, {"cities": sorted(DELIVERY_CITIES)})
        if path == "/api/auth/me":
            user = self.current_user()
            if not user:
                return self.send_json(401, {"error": "Увійдіть до системи."})
            return self.send_json(200, {"user": user})
        if path == "/api/demo/staff":
            return self.demo_staff()
        if path == "/api/customer/me":
            customer = self.current_customer()
            if not customer:
                return self.send_json(401, {"error": "Увійдіть до особистого кабінету."})
            return self.send_json(200, {"customer": customer})
        if path == "/api/customer/orders":
            return self.customer_orders()
        if path == "/api/admin/overview":
            return self.admin_overview()
        if path == "/api/admin/orders":
            return self.admin_orders()
        if path == "/api/admin/products":
            return self.admin_products()
        if path == "/api/admin/users":
            return self.admin_users()
        if path == "/api/admin/status-history":
            return self.admin_status_history()
        if path == "/api/admin/suppliers":
            return self.admin_suppliers()
        if path == "/api/admin/support":
            return self.admin_support()
        return self.serve_static(path)

    def do_POST(self):
        path = self.request_path()
        if path.startswith("/api/") and not self.valid_origin():
            return self.send_json(403, {"error": "Запит відхилено."})
        if path == "/api/auth/login":
            return self.login()
        if path == "/api/demo/login":
            return self.demo_login()
        if path == "/api/auth/logout":
            return self.logout()
        if path == "/api/auth/password":
            return self.change_password()
        if path == "/api/customer/register":
            return self.customer_register()
        if path == "/api/customer/login":
            return self.customer_login()
        if path == "/api/customer/logout":
            return self.customer_logout()
        if path == "/api/orders":
            return self.create_order()
        if path == "/api/support":
            return self.create_support_message()
        if path == "/api/admin/suppliers":
            return self.create_supplier()
        if path == "/api/admin/users":
            return self.create_user()
        return self.send_json(404, {"error": "Маршрут не знайдено."})

    def do_PATCH(self):
        path = self.request_path()
        if not path.startswith("/api/") or not self.valid_origin():
            return self.send_json(403, {"error": "Запит відхилено."})
        if path == "/api/auth/status":
            return self.update_work_status()
        if path.startswith("/api/admin/products/"):
            return self.update_product(path.rsplit("/", 1)[1])
        if path.startswith("/api/admin/orders/"):
            return self.update_order(path.rsplit("/", 1)[1])
        if path.startswith("/api/admin/users/"):
            return self.update_user(path.rsplit("/", 1)[1])
        if path.startswith("/api/admin/support/"):
            return self.update_support_message(path.rsplit("/", 1)[1])
        return self.send_json(404, {"error": "Маршрут не знайдено."})

    def valid_origin(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True
        return urlparse(origin).netloc == self.headers.get("Host")

    def cookie_secure_attribute(self):
        secure = os.environ.get(
            "BUDRESURS_COOKIE_SECURE", os.environ.get("PROMETEY_COOKIE_SECURE")
        ) == "1"
        secure = secure or self.headers.get("X-Forwarded-Proto", "").lower() == "https"
        return "; Secure" if secure else ""

    def demo_enabled(self):
        return DEMO_MODE_ENABLED and self.server.demo_mode_available

    def demo_staff(self):
        if not self.demo_enabled():
            return self.send_json(200, {"enabled": False, "staff": []})
        with get_db() as db:
            staff = db.execute(
                """SELECT id, username, name, role, active FROM users
                   ORDER BY active DESC, id"""
            ).fetchall()
        return self.send_json(
            200,
            {"enabled": True, "staff": [{
                **user_payload(row),
                "active": bool(row["active"]),
            } for row in staff]},
        )

    def demo_login(self):
        if not self.demo_enabled():
            return self.send_json(404, {"error": "Деморежим швидкого входу вимкнений."})
        try:
            payload = self.read_json()
            user_id = payload.get("user_id")
            if not isinstance(user_id, int) or isinstance(user_id, bool):
                raise ValueError
        except ValueError:
            return self.send_json(400, {"error": "Оберіть працівника зі списку."})
        with get_db() as db:
            row = db.execute(
                "SELECT * FROM users WHERE id = ? AND active = 1", (user_id,)
            ).fetchone()
            if not row:
                return self.send_json(404, {"error": "Активного працівника не знайдено."})
            token = secrets.token_urlsafe(32)
            db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (
                    hashlib.sha256(token.encode("utf-8")).hexdigest(),
                    row["id"],
                    (datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)).isoformat(
                        timespec="seconds"
                    ),
                ),
            )
        cookie = (
            f"prometey_session={token}; HttpOnly; SameSite=Lax; Path=/; "
            f"Max-Age={SESSION_HOURS * 3600}{self.cookie_secure_attribute()}"
        )
        return self.send_json(200, {"user": user_payload(row)}, {"Set-Cookie": cookie})

    def current_user(self):
        cookies = self.headers.get("Cookie", "")
        token = next(
            (
                part.strip().split("=", 1)[1]
                for part in cookies.split(";")
                if part.strip().startswith("prometey_session=")
            ),
            None,
        )
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with get_db() as db:
            row = db.execute(
                """SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                   WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1""",
                (token_hash, utc_now()),
            ).fetchone()
        return user_payload(row) if row else None

    def current_customer(self):
        token = self.customer_session_token()
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with get_db() as db:
            row = db.execute(
                """SELECT c.* FROM customer_sessions s
                   JOIN customers c ON c.id = s.customer_id
                   WHERE s.token_hash = ? AND s.expires_at > ?""",
                (token_hash, utc_now()),
            ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "phone": row["phone"],
            "city": row["city"],
        }

    def require_role(self, allowed):
        user = self.current_user()
        if not user:
            self.send_json(401, {"error": "Сеанс завершився. Увійдіть знову."})
            return None
        if user["role"] not in allowed:
            self.send_json(403, {"error": "У вас немає прав для цієї дії."})
            return None
        return user

    def login(self):
        try:
            payload = self.read_json()
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        username = str(payload.get("username", "")).strip()
        password = payload.get("password", "")
        if not isinstance(password, str) or len(username) > 64 or len(password) > 256:
            return self.send_json(400, {"error": "Перевірте ім'я та пароль."})
        with get_db() as db:
            row = db.execute(
                "SELECT * FROM users WHERE username = ? AND active = 1", (username,)
            ).fetchone()
            if not row or not verify_password(password, row["password_hash"]):
                return self.send_json(401, {"error": "Невірне ім'я або пароль."})
            token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            expires = (datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS))
            db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (token_hash, row["id"], expires.isoformat(timespec="seconds")),
            )
        cookie = (
            f"prometey_session={token}; HttpOnly; SameSite=Lax; Path=/; "
            f"Max-Age={SESSION_HOURS * 3600}{self.cookie_secure_attribute()}"
        )
        return self.send_json(
            200, {"user": user_payload(row)}, {"Set-Cookie": cookie}
        )

    def logout(self):
        token = self.session_token()
        if token:
            digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
            with get_db() as db:
                db.execute("DELETE FROM sessions WHERE token_hash = ?", (digest,))
        return self.send_json(
            200,
            {"ok": True},
            {"Set-Cookie": f"prometey_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0{self.cookie_secure_attribute()}"},
        )

    def change_password(self):
        user = self.current_user()
        if not user:
            return self.send_json(401, {"error": "Увійдіть до системи."})
        try:
            payload = self.read_json()
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        current_password = payload.get("current_password")
        new_password = payload.get("new_password")
        if (
            not isinstance(current_password, str)
            or not isinstance(new_password, str)
            or len(new_password) < 12
            or len(new_password) > 128
        ):
            return self.send_json(
                400, {"error": "Новий пароль має містити від 12 до 128 символів."}
            )
        with get_db() as db:
            row = db.execute(
                "SELECT password_hash FROM users WHERE id = ?", (user["id"],)
            ).fetchone()
            if not row or not verify_password(current_password, row["password_hash"]):
                return self.send_json(403, {"error": "Поточний пароль введено неправильно."})
            db.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (hash_password(new_password), user["id"]),
            )
            db.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
        return self.send_json(
            200,
            {"ok": True},
            {"Set-Cookie": f"prometey_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0{self.cookie_secure_attribute()}"},
        )

    def update_work_status(self):
        user = self.current_user()
        if not user:
            return self.send_json(401, {"error": "Увійдіть до системи."})
        try:
            payload = self.read_json()
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        status = payload.get("work_status")
        if (
            set(payload) != {"work_status"}
            or not isinstance(status, str)
            or status not in WORK_STATUSES
        ):
            return self.send_json(400, {"error": "Оберіть коректний статус присутності."})
        with get_db() as db:
            previous = db.execute(
                "SELECT work_status FROM users WHERE id = ? AND active = 1",
                (user["id"],),
            ).fetchone()
            if not previous:
                return self.send_json(401, {"error": "Обліковий запис неактивний."})
            if previous["work_status"] == status:
                return self.send_json(200, {"ok": True, "work_status": status})
            changed_at = utc_now()
            work_seconds = None
            if status == "Кінець робочого дня" and previous["work_status"] == "На роботі":
                started = db.execute(
                    """SELECT changed_at FROM work_status_history
                       WHERE user_id = ? AND status = 'На роботі'
                       ORDER BY id DESC LIMIT 1""",
                    (user["id"],),
                ).fetchone()
                if started:
                    start_time = datetime.fromisoformat(started["changed_at"])
                    end_time = datetime.fromisoformat(changed_at)
                    work_seconds = max(0, int((end_time - start_time).total_seconds()))
            db.execute(
                "UPDATE users SET work_status = ? WHERE id = ? AND active = 1",
                (status, user["id"]),
            )
            db.execute(
                """INSERT INTO work_status_history
                   (user_id, status, changed_at, work_seconds) VALUES (?, ?, ?, ?)""",
                (user["id"], status, changed_at, work_seconds),
            )
        return self.send_json(200, {"ok": True, "work_status": status})

    def session_token(self):
        for part in self.headers.get("Cookie", "").split(";"):
            name, separator, value = part.strip().partition("=")
            if separator and name == "prometey_session":
                return value
        return None

    def customer_session_token(self):
        for part in self.headers.get("Cookie", "").split(";"):
            name, separator, value = part.strip().partition("=")
            if separator and name == "prometey_customer_session":
                return value
        return None

    def customer_cookie(self, token, max_age):
        return (
            f"prometey_customer_session={token}; HttpOnly; SameSite=Lax; Path=/; "
            f"Max-Age={max_age}{self.cookie_secure_attribute()}"
        )

    def customer_register(self):
        try:
            payload = self.read_json()
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        phone = str(payload.get("phone", "")).strip()
        city = payload.get("city")
        password = payload.get("password", "")
        if (
            not 2 <= len(name) <= 100
            or len(email) > 254
            or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)
            or not re.fullmatch(r"[+0-9()\-\s]{9,20}", phone)
            or not isinstance(city, str)
            or city not in DELIVERY_CITIES
            or not isinstance(password, str)
            or not 12 <= len(password) <= 128
        ):
            return self.send_json(
                400, {"error": "Перевірте дані. Пароль має містити щонайменше 12 символів."}
            )
        try:
            with get_db() as db:
                cursor = db.execute(
                    """INSERT INTO customers
                       (email, name, phone, password_hash, city, created_at)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (email, name, phone, hash_password(password), city, utc_now()),
                )
                customer_id = cursor.lastrowid
                token = secrets.token_urlsafe(32)
                db.execute(
                    """INSERT INTO customer_sessions (token_hash, customer_id, expires_at)
                       VALUES (?, ?, ?)""",
                    (
                        hashlib.sha256(token.encode("utf-8")).hexdigest(),
                        customer_id,
                        (datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)).isoformat(
                            timespec="seconds"
                        ),
                    ),
                )
        except sqlite3.IntegrityError:
            return self.send_json(409, {"error": "Обліковий запис із цією поштою вже існує."})
        customer = {
            "id": customer_id, "name": name, "email": email, "phone": phone, "city": city,
        }
        return self.send_json(
            201, {"customer": customer}, {"Set-Cookie": self.customer_cookie(
                token, SESSION_HOURS * 3600
            )}
        )

    def customer_login(self):
        try:
            payload = self.read_json()
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        email = str(payload.get("email", "")).strip().lower()
        password = payload.get("password", "")
        if len(email) > 254 or not isinstance(password, str) or len(password) > 256:
            return self.send_json(400, {"error": "Перевірте електронну пошту та пароль."})
        with get_db() as db:
            row = db.execute(
                "SELECT * FROM customers WHERE email = ?", (email,)
            ).fetchone()
            if not row or not verify_password(password, row["password_hash"]):
                return self.send_json(401, {"error": "Невірна електронна пошта або пароль."})
            token = secrets.token_urlsafe(32)
            db.execute(
                """INSERT INTO customer_sessions (token_hash, customer_id, expires_at)
                   VALUES (?, ?, ?)""",
                (
                    hashlib.sha256(token.encode("utf-8")).hexdigest(),
                    row["id"],
                    (datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS)).isoformat(
                        timespec="seconds"
                    ),
                ),
            )
        customer = {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "phone": row["phone"],
            "city": row["city"],
        }
        return self.send_json(
            200, {"customer": customer}, {"Set-Cookie": self.customer_cookie(
                token, SESSION_HOURS * 3600
            )}
        )

    def customer_logout(self):
        token = self.customer_session_token()
        if token:
            token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            with get_db() as db:
                db.execute(
                    "DELETE FROM customer_sessions WHERE token_hash = ?", (token_hash,)
                )
        return self.send_json(
            200,
            {"ok": True},
            {"Set-Cookie": self.customer_cookie("", 0)},
        )

    def customer_orders(self):
        customer = self.current_customer()
        if not customer:
            return self.send_json(401, {"error": "Увійдіть до особистого кабінету."})
        with get_db() as db:
            orders = db.execute(
                """SELECT id, created_at, total, status, payment_status, city
                   FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 100""",
                (customer["id"],),
            ).fetchall()
            result = []
            for order in orders:
                items = db.execute(
                    """SELECT product_name, unit, unit_price, quantity
                       FROM order_items WHERE order_id = ? ORDER BY id""",
                    (order["id"],),
                ).fetchall()
                result.append({
                    **dict(order),
                    "items": [
                        {**dict(item), "line_total": item["unit_price"] * item["quantity"]}
                        for item in items
                    ],
                })
        return self.send_json(200, {"orders": result})

    def create_order(self):
        try:
            payload = self.read_json()
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        name = str(payload.get("name", "")).strip()
        phone = str(payload.get("phone", "")).strip()
        address = str(payload.get("address", "")).strip()
        city = payload.get("city")
        items = payload.get("items")
        if (
            not 2 <= len(name) <= 100
            or not re.fullmatch(r"[+0-9()\-\s]{9,20}", phone)
            or not 5 <= len(address) <= 200
            or not isinstance(city, str)
            or city not in DELIVERY_CITIES
            or not isinstance(items, list)
            or not 1 <= len(items) <= 50
        ):
            return self.send_json(400, {"error": "Перевірте дані замовлення."})
        quantities = {}
        for item in items:
            if not isinstance(item, dict):
                return self.send_json(400, {"error": "Некоректний товар у кошику."})
            sku = item.get("sku")
            quantity = item.get("quantity")
            if (
                not isinstance(sku, str)
                or not isinstance(quantity, int)
                or isinstance(quantity, bool)
                or not 1 <= quantity <= 99
            ):
                return self.send_json(400, {"error": "Некоректна кількість товару."})
            quantities[sku] = quantities.get(sku, 0) + quantity
            if quantities[sku] > 99:
                return self.send_json(400, {"error": "Завелика кількість товару."})

        try:
            customer = self.current_customer()
            customer_id = customer["id"] if customer else None
            with get_db() as db:
                db.execute("BEGIN IMMEDIATE")
                products = {}
                for sku, quantity in quantities.items():
                    product = db.execute(
                        "SELECT * FROM products WHERE sku = ? AND active = 1", (sku,)
                    ).fetchone()
                    if not product:
                        raise ValueError("Один із товарів більше недоступний.")
                    if product["stock"] < quantity:
                        raise ValueError(
                            f"Недостатньо товару «{product['name']}» на складі."
                        )
                    products[sku] = product
                total = sum(
                    products[sku]["price"] * quantity
                    for sku, quantity in quantities.items()
                )
                cursor = db.execute(
                    """INSERT INTO orders
                       (created_at, customer_name, phone, address, total, customer_id, city)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (utc_now(), name, phone, address, total, customer_id, city),
                )
                order_id = cursor.lastrowid
                for sku, quantity in quantities.items():
                    product = products[sku]
                    db.execute(
                        """INSERT INTO order_items
                           (order_id, product_sku, product_name, unit,
                            unit_price, quantity)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (
                            order_id,
                            sku,
                            product["name"],
                            product["unit"],
                            product["price"],
                            quantity,
                        ),
                    )
                    db.execute(
                        "UPDATE products SET stock = stock - ? WHERE sku = ?",
                        (quantity, sku),
                    )
        except ValueError as error:
            return self.send_json(409, {"error": str(error)})
        return self.send_json(
            201, {"order_id": order_id, "total": total, "message": "Замовлення прийнято!"}
        )

    def create_support_message(self):
        try:
            payload = self.read_json()
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        subject = str(payload.get("subject", "")).strip()
        message = str(payload.get("message", "")).strip()
        if (
            not 2 <= len(name) <= 100
            or len(email) > 254
            or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)
            or not 3 <= len(subject) <= 120
            or not 10 <= len(message) <= 3000
        ):
            return self.send_json(400, {"error": "Перевірте тему та текст звернення."})
        customer = self.current_customer()
        with get_db() as db:
            cursor = db.execute(
                """INSERT INTO support_messages
                   (customer_id, name, email, subject, message, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    customer["id"] if customer else None,
                    name,
                    email,
                    subject,
                    message,
                    utc_now(),
                ),
            )
        return self.send_json(
            201, {"id": cursor.lastrowid, "message": "Звернення надіслано."}
        )

    def financials(self, db):
        totals = db.execute(
            """SELECT COUNT(*) AS order_count, COALESCE(SUM(total), 0) AS revenue,
                      COALESCE(SUM(CASE WHEN payment_status = 'Оплачено'
                                        THEN total ELSE 0 END), 0) AS paid,
                      COALESCE(SUM(CASE WHEN payment_status != 'Оплачено'
                                        THEN total ELSE 0 END), 0) AS due
               FROM orders"""
        ).fetchone()
        return dict(totals)

    def admin_overview(self):
        user = self.require_role({"director", "accountant", "manager"})
        if not user:
            return
        with get_db() as db:
            result = {"financials": self.financials(db)}
            if user["role"] == "director":
                result["products_count"] = db.execute(
                    "SELECT COUNT(*) FROM products WHERE active = 1"
                ).fetchone()[0]
                result["low_stock_count"] = db.execute(
                    "SELECT COUNT(*) FROM products WHERE active = 1 AND stock <= 5"
                ).fetchone()[0]
                result["staff_count"] = db.execute(
                    "SELECT COUNT(*) FROM users WHERE active = 1"
                ).fetchone()[0]
        return self.send_json(200, result)

    def admin_orders(self):
        user = self.require_role({"director", "accountant", "manager"})
        if not user:
            return
        with get_db() as db:
            fields = "id, created_at, total, payment_status"
            if user["role"] in {"director", "manager"}:
                fields += ", customer_name, phone, address, status, city"
            orders = db.execute(
                f"SELECT {fields} FROM orders ORDER BY id DESC LIMIT 100"
            ).fetchall()
        return self.send_json(200, {"orders": [dict(row) for row in orders]})

    def update_order(self, order_id):
        user = self.require_role({"director", "accountant", "manager"})
        if not user:
            return
        try:
            order_id = int(order_id)
            payload = self.read_json()
        except (ValueError, TypeError):
            return self.send_json(400, {"error": "Некоректні дані запиту."})
        if not payload or not set(payload).issubset({"payment_status", "status"}):
            return self.send_json(400, {"error": "Некоректні дані замовлення."})
        updates = []
        values = []
        if "payment_status" in payload:
            if user["role"] == "manager":
                return self.send_json(403, {"error": "Змінювати оплату може бухгалтер або директор."})
            if payload["payment_status"] not in {"Оплачено", "Очікує оплати"}:
                return self.send_json(400, {"error": "Некоректний статус оплати."})
            updates.append("payment_status = ?")
            values.append(payload["payment_status"])
        if "status" in payload:
            if user["role"] not in {"director", "manager"}:
                return self.send_json(403, {"error": "Керувати статусом замовлення може менеджер або директор."})
            if payload["status"] not in {"Нове", "Комплектується", "Доставляється", "Виконано"}:
                return self.send_json(400, {"error": "Некоректний статус замовлення."})
            updates.append("status = ?")
            values.append(payload["status"])
        with get_db() as db:
            cursor = db.execute(
                f"UPDATE orders SET {', '.join(updates)} WHERE id = ?",
                (*values, order_id),
            )
            if cursor.rowcount == 0:
                return self.send_json(404, {"error": "Замовлення не знайдено."})
        return self.send_json(200, {"ok": True})

    def admin_products(self):
        if not self.require_role({"director", "inventory"}):
            return
        with get_db() as db:
            products = db.execute(
                """SELECT products.sku, products.name, products.category_name,
                          products.price, products.unit, products.stock,
                          COALESCE(suppliers.name, products.supplier, '') AS supplier,
                          products.supplier_id
                   FROM products LEFT JOIN suppliers ON suppliers.id = products.supplier_id
                   WHERE products.active = 1 ORDER BY products.category, products.name"""
            ).fetchall()
            suppliers = db.execute(
                "SELECT id, name FROM suppliers WHERE active = 1 ORDER BY name"
            ).fetchall()
        return self.send_json(200, {
            "products": [dict(row) for row in products],
            "suppliers": [dict(row) for row in suppliers],
        })

    def update_product(self, sku):
        if not self.require_role({"director", "inventory"}):
            return
        try:
            payload = self.read_json()
            stock = payload.get("stock")
            price = payload.get("price")
            supplier_id = payload.get("supplier_id")
            if (
                not isinstance(stock, int)
                or isinstance(stock, bool)
                or not 0 <= stock <= 100_000
                or (price is not None and (
                    not isinstance(price, int)
                    or isinstance(price, bool)
                    or not 0 <= price <= 10_000_000
                ))
                or (supplier_id is not None and (
                    not isinstance(supplier_id, int) or isinstance(supplier_id, bool)
                ))
                or not set(payload).issubset({"stock", "price", "supplier_id"})
            ):
                raise ValueError
        except ValueError:
            return self.send_json(
                400, {"error": "Перевірте ціну, залишок і постачальника товару."}
            )
        with get_db() as db:
            if price is None and "supplier_id" not in payload:
                cursor = db.execute(
                    "UPDATE products SET stock = ? WHERE sku = ? AND active = 1",
                    (stock, sku),
                )
            elif "supplier_id" not in payload:
                cursor = db.execute(
                    "UPDATE products SET stock = ?, price = ? WHERE sku = ? AND active = 1",
                    (stock, price, sku),
                )
            elif supplier_id is not None and not db.execute(
                "SELECT 1 FROM suppliers WHERE id = ? AND active = 1", (supplier_id,)
            ).fetchone():
                return self.send_json(400, {"error": "Оберіть чинного постачальника."})
            elif price is None:
                cursor = db.execute(
                    "UPDATE products SET stock = ?, supplier_id = ? WHERE sku = ? AND active = 1",
                    (stock, supplier_id, sku),
                )
            else:
                cursor = db.execute(
                    """UPDATE products SET stock = ?, price = ?, supplier_id = ?
                       WHERE sku = ? AND active = 1""",
                    (stock, price, supplier_id, sku),
                )
            if cursor.rowcount == 0:
                return self.send_json(404, {"error": "Товар не знайдено."})
        return self.send_json(200, {"ok": True})

    def admin_users(self):
        if not self.require_role({"director"}):
            return
        with get_db() as db:
            users = db.execute(
                """SELECT id, username, name, role, active, work_status, created_at
                   FROM users ORDER BY id"""
            ).fetchall()
        return self.send_json(200, {"users": [user_payload(row) | {
            "active": bool(row["active"]),
            "created_at": row["created_at"],
        } for row in users]})

    def admin_status_history(self):
        if not self.require_role({"director"}):
            return
        with get_db() as db:
            history = db.execute(
                """SELECT work_status_history.id, users.name, users.username,
                          work_status_history.status, work_status_history.changed_at,
                          work_status_history.work_seconds
                   FROM work_status_history
                   JOIN users ON users.id = work_status_history.user_id
                   ORDER BY work_status_history.id DESC LIMIT 500"""
            ).fetchall()
        return self.send_json(200, {"history": [dict(row) for row in history]})

    def admin_suppliers(self):
        if not self.require_role({"director"}):
            return
        with get_db() as db:
            suppliers = db.execute(
                """SELECT id, name, contact_name, phone, email, address, notes, active,
                          created_at
                   FROM suppliers ORDER BY active DESC, name"""
            ).fetchall()
        return self.send_json(200, {"suppliers": [dict(row) for row in suppliers]})

    def create_supplier(self):
        if not self.require_role({"director"}):
            return
        try:
            payload = self.read_json()
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        name = str(payload.get("name", "")).strip()
        contact_name = str(payload.get("contact_name", "")).strip()
        phone = str(payload.get("phone", "")).strip()
        email = str(payload.get("email", "")).strip()
        address = str(payload.get("address", "")).strip()
        notes = str(payload.get("notes", "")).strip()
        if (
            not 2 <= len(name) <= 120
            or len(contact_name) > 100
            or len(phone) > 30
            or len(email) > 254
            or (email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email))
            or len(address) > 200
            or len(notes) > 500
        ):
            return self.send_json(400, {"error": "Перевірте інформацію про постачальника."})
        try:
            with get_db() as db:
                cursor = db.execute(
                    """INSERT INTO suppliers
                       (name, contact_name, phone, email, address, notes, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (name, contact_name, phone, email, address, notes, utc_now()),
                )
        except sqlite3.IntegrityError:
            return self.send_json(409, {"error": "Постачальник із такою назвою вже є."})
        return self.send_json(201, {"id": cursor.lastrowid, "message": "Постачальника додано."})

    def admin_support(self):
        if not self.require_role({"director", "manager"}):
            return
        with get_db() as db:
            messages = db.execute(
                """SELECT id, name, email, subject, message, status, created_at
                   FROM support_messages ORDER BY id DESC LIMIT 200"""
            ).fetchall()
        return self.send_json(200, {"messages": [dict(row) for row in messages]})

    def update_support_message(self, message_id):
        if not self.require_role({"director", "manager"}):
            return
        try:
            message_id = int(message_id)
            payload = self.read_json()
        except (ValueError, TypeError):
            return self.send_json(400, {"error": "Некоректні дані запиту."})
        status = payload.get("status")
        if status not in {"Нове", "У роботі", "Відповіли"}:
            return self.send_json(400, {"error": "Некоректний статус звернення."})
        with get_db() as db:
            cursor = db.execute(
                "UPDATE support_messages SET status = ? WHERE id = ?",
                (status, message_id),
            )
            if cursor.rowcount == 0:
                return self.send_json(404, {"error": "Звернення не знайдено."})
        return self.send_json(200, {"ok": True})

    def update_user(self, user_id):
        current_user = self.require_role({"director"})
        if not current_user:
            return
        try:
            user_id = int(user_id)
            payload = self.read_json()
        except (ValueError, TypeError):
            return self.send_json(400, {"error": "Некоректні дані запиту."})
        role = payload.get("role")
        active = payload.get("active")
        if role not in ROLES or not isinstance(active, bool):
            return self.send_json(400, {"error": "Перевірте роль і стан доступу."})
        with get_db() as db:
            target = db.execute(
                "SELECT id, role, active FROM users WHERE id = ?", (user_id,)
            ).fetchone()
            if not target:
                return self.send_json(404, {"error": "Працівника не знайдено."})
            if target["id"] == current_user["id"] and not active:
                return self.send_json(400, {"error": "Не можна вимкнути власний доступ."})
            removes_director = (
                target["role"] == "director" and (role != "director" or not active)
            )
            if removes_director and target["active"]:
                active_directors = db.execute(
                    "SELECT COUNT(*) FROM users WHERE role = 'director' AND active = 1"
                ).fetchone()[0]
                if active_directors <= 1:
                    return self.send_json(
                        409, {"error": "У системі має залишитися хоча б один директор."}
                    )
            db.execute(
                "UPDATE users SET role = ?, active = ? WHERE id = ?",
                (role, int(active), user_id),
            )
            if not active:
                db.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        return self.send_json(200, {"ok": True})

    def create_user(self):
        if not self.require_role({"director"}):
            return
        try:
            payload = self.read_json()
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        username = str(payload.get("username", "")).strip()
        name = str(payload.get("name", "")).strip()
        password = payload.get("password", "")
        role = payload.get("role")
        if (
            not re.fullmatch(r"[A-Za-z0-9_.-]{3,32}", username)
            or not 2 <= len(name) <= 100
            or not isinstance(password, str)
            or not 12 <= len(password) <= 128
            or role not in ROLES
        ):
            return self.send_json(
                400,
                {"error": "Перевірте дані. Пароль має містити щонайменше 12 символів."},
            )
        try:
            with get_db() as db:
                created_at = utc_now()
                cursor = db.execute(
                    """INSERT INTO users
                       (username, name, role, password_hash, created_at)
                       VALUES (?, ?, ?, ?, ?)""",
                    (username, name, role, hash_password(password), created_at),
                )
                user_id = cursor.lastrowid
                db.execute(
                    """INSERT INTO work_status_history (user_id, status, changed_at)
                       VALUES (?, 'На роботі', ?)""",
                    (user_id, created_at),
                )
        except sqlite3.IntegrityError:
            return self.send_json(409, {"error": "Таке ім'я користувача вже існує."})
        return self.send_json(201, {"id": user_id, "message": "Працівника додано."})

    def serve_static(self, path):
        if path.startswith("/api/"):
            return self.send_json(404, {"error": "Маршрут не знайдено."})
        if path.startswith("/catalogs/") and path.endswith(".json"):
            base_dir = BASE_DIR
            relative = Path(path.lstrip("/"))
        else:
            base_dir = FRONTEND_DIST
            relative = Path("index.html") if path in {
                "/", "/index.html", "/home.html", "/products", "/products.html",
                "/about", "/support", "/admin", "/admin.html", "/account",
                "/account.html",
            } else Path(path.lstrip("/"))
        root = base_dir.resolve()
        file_path = (base_dir / relative).resolve()
        if not file_path.is_relative_to(root):
            return self.send_json(404, {"error": "Сторінку не знайдено."})
        if not file_path.is_file() and base_dir == FRONTEND_DIST:
            accepts_html = "text/html" in self.headers.get("Accept", "")
            has_extension = bool(Path(path).suffix)
            if accepts_html and not has_extension:
                file_path = (FRONTEND_DIST / "index.html").resolve()
            else:
                return self.send_json(404, {"error": "Файл не знайдено."})
        try:
            content = file_path.read_bytes()
        except FileNotFoundError:
            if base_dir == FRONTEND_DIST:
                return self.send_json(
                    503,
                    {"error": "Frontend ще не зібраний. Запустіть npm run build."},
                )
            return self.send_json(404, {"error": "Файл не знайдено."})
        content_type, _ = mimetypes.guess_type(file_path.name)
        content_type = content_type or "application/octet-stream"
        if content_type.startswith(("text/", "application/javascript", "application/json")):
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header(
            "Cache-Control",
            "no-cache" if file_path.name == "index.html" else "public, max-age=31536000, immutable",
        )
        self.end_headers()
        self.wfile.write(content)


if __name__ == "__main__":
    host = os.environ.get("BUDRESURS_HOST", os.environ.get("PROMETEY_HOST", "127.0.0.1"))
    port = int(os.environ.get("PORT", os.environ.get("BUDRESURS_PORT", os.environ.get("PROMETEY_PORT", "8000"))))
    public_host = host.lower() not in {"127.0.0.1", "localhost", "::1"}
    admin_password = os.environ.get(
        "BUDRESURS_ADMIN_PASSWORD", os.environ.get("PROMETEY_ADMIN_PASSWORD", "")
    )
    if public_host and len(admin_password) < 12:
        raise SystemExit(
            "Для запуску в мережі задайте BUDRESURS_ADMIN_PASSWORD довжиною "
            "щонайменше 12 символів перед створенням бази."
        )
    init_db()
    StoreHandler.server_version = "BudresursCatalog/1.0"
    demo_available = host.lower() in {"127.0.0.1", "localhost", "::1"}
    if DEMO_MODE_ENABLED and not demo_available:
        print(
            "Швидкий вхід через список працівників вимкнений: "
            "деморежим доступний лише на локальному комп’ютері.",
            file=sys.stderr,
        )
    httpd = ThreadingHTTPServer((host, port), StoreHandler)
    httpd.demo_mode_available = demo_available
    print(f"Будресурс працює: http://{host}:{port}")
    httpd.serve_forever()
