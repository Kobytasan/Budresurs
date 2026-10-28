# Будресурс — каталог будівельного інструменту

Навчальний вебпроєкт для перегляду й тестування онлайн-каталогу будівельних інструментів «Будресурс». Відвідувачі можуть знаходити інструменти за категоріями, переглядати ціни та наявність, зберігати позиції в обраному й оформлювати замовлення. Команда керує асортиментом, складськими залишками, постачальниками, замовленнями та зверненнями через робочий кабінет.

## Можливості

- Адаптивний каталог із пошуком і категоріями: електроінструмент, ручний інструмент, вимірювальні прилади, кріплення й оснащення, засоби захисту, драбини.
- Перегляд цін, описів і актуальних складських залишків.
- Окрема сторінка товару з фотографією, характеристиками, порівнянням, схожими товарами та оцінками покупців.
- Відгук на товар можна залишити після входу до кабінету; покупець може редагувати власний відгук.
- Кошик, оформлення замовлення та перевірка залишків на сервері.
- Обране, профіль користувача, історія замовлень і квитанції.
- Робочий кабінет із розподілом доступу за ролями: директор, менеджер продажу, бухгалтер і працівник складу.
- Керування товарами, постачальниками, працівниками та зверненнями.
- Складський облік показує кількість, ціну за одиницю та оціночну вартість наявного залишку за цінами каталогу.

## Технології

- React, TypeScript, Vite
- Express і Node.js
- PostgreSQL
- `lucide-react` для піктограм

## Локальний запуск у Windows

Потрібні Node.js і доступна база PostgreSQL. У корені проєкту відкрийте PowerShell, задайте параметри підключення та пароль для першого створення директора:

```powershell
$env:DATABASE_URL = "рядок підключення PostgreSQL"
$env:BUDRESURS_ADMIN_PASSWORD = "ваш-надійний-пароль-довжиною-12+"
```

Встановіть залежності та зберіть інтерфейс:

```powershell
npm install
npm run build
```

Запустіть застосунок:

```powershell
npm start
```

Сервер доступний за адресою `http://127.0.0.1:5000`. Для frontend-розробки запустіть API командою `npm start`, а в іншому вікні PowerShell — `npm run dev`. Vite зазвичай відкривається на `http://127.0.0.1:5173` і проксить `/api` на локальний API.

## Розгортання на Render

Створіть **Web Service** для репозиторію та задайте:

```text
Build Command: npm install && npm run build
Start Command: node server/server.js
```

У **Render → ваш сервіс → Environment** додайте:

| Змінна | Значення |
|---|---|
| `DATABASE_URL` | Рядок підключення до PostgreSQL, наприклад Neon. Зберігайте як секрет. |
| `BUDRESURS_ADMIN_PASSWORD` | Новий надійний пароль директора довжиною щонайменше 12 символів. Зберігайте як секрет. |
| `BUDRESURS_ADMIN_USERNAME` | Необов’язково; ім’я входу директора. Типове значення — `director`. |
| `BUDRESURS_DEMO_MODE` | Встановіть `0` для публічного сервісу. |
| `BUDRESURS_COOKIE_SECURE` | Встановіть `1`, щоб сесійні cookie передавалися лише через HTTPS. |

Після додавання змінних збережіть їх і перезапустіть або redeploy-те сервіс.

### Якщо Render завершує запуск із помилкою пароля директора

Повідомлення:

```text
Для створення директора задайте BUDRESURS_ADMIN_PASSWORD довжиною щонайменше 12 символів.
```

означає, що сервер не знайшов директора в базі й не отримав потрібного пароля для його створення. У Render відкрийте **Environment**, додайте `BUDRESURS_ADMIN_PASSWORD` зі значенням довжиною від 12 символів, збережіть зміну та перезапустіть сервіс. Задайте пароль, який ніде більше не використовуєте, і не додавайте його до Git або цього README. Стару назву змінної сервер поки теж приймає для сумісності з уже налаштованим Render, але для нових конфігурацій використовуйте `BUDRESURS_ADMIN_PASSWORD`.

Для нового розгортання також переконайтеся, що `DATABASE_URL` заданий і вказує на доступну базу PostgreSQL. Змінна середовища має бути доступна серверу під час старту; самого успішного `npm run build` недостатньо для запуску API.

Попередження `pg-connection-string` про SSL modes саме по собі не спричиняє цю помилку. Причина з наведеного журналу — відсутній або надто короткий `BUDRESURS_ADMIN_PASSWORD`.

## Каталог і база даних

Початковий асортимент зберігається у файлах `catalogs/*.json`. Під час старту Node-сервер створює потрібні таблиці й додає відсутні позиції до PostgreSQL; наявні ціни та залишки не перезаписуються. Старі категорії попереднього демокаталогу вимикаються, а не видаляються з бази.

Пароль директора зберігається у вигляді хешу. `BUDRESURS_ADMIN_PASSWORD` потрібен під час першого створення директорського облікового запису; зміна змінної не змінює пароль уже створеного директора. Щоб оновити його, увійдіть у робочий кабінет і скористайтеся зміною пароля.

## Основні сторінки

| URL | Призначення |
|---|---|
| `/` | Головна сторінка «Будресурс» |
| `/products` | Пошук і перегляд каталогу |
| `/products/:sku` | Фото, опис, характеристики, порівняння та відгуки про товар |
| `/about` | Інформація про проєкт |
| `/support` | Форма звернення |
| `/account` | Вхід, реєстрація та кабінет користувача |
| `/admin` | Робочий кабінет команди |

## Структура проєкту

- `src/pages/PublicPages.tsx` — головна, каталог, інформаційна сторінка та звернення.
- `src/components/Storefront.tsx` — публічна навігація, кошик і картки каталогу.
- `src/pages/ProductPage.tsx` — детальна сторінка товару та відгуки.
- `src/productMedia.ts` і `public/images/products/` — фотографії, джерела та атрибуція.
- `src/pages/AccountPage.tsx` — кабінет користувача та квитанції.
- `src/pages/StaffPage.tsx` — робочий кабінет команди.
- `src/index.css` — стилі та адаптивна тема.
- `catalogs/` — початкові дані асортименту.
- `server/server.js` — API, PostgreSQL і обслуговування production-збірки.
- `server.py` — альтернативний локальний сервер на SQLite.

Проєкт призначений для навчання та тестування каталогу й замовлень. Перед реальним використанням перевірте правила доставки й оплати, налаштуйте резервне копіювання бази та зберігайте облікові дані тільки в захищених змінних середовища.

## Джерела фотографій

Фотографії товарів завантажені локально з Wikimedia Commons; для товарів, де точна модель на знімку може відрізнятися, сторінка позначає зображення як ілюстративне. Посилання ведуть на сторінки файлів із повними умовами використання.

| Товар | Автор | Ліцензія | Джерело |
|---|---|---|---|
| Акумуляторний дриль | Tony Webster | CC BY 2.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Black_and_Decker_20-Volt_Power_Drill_(49112921413).jpg) |
| Набір свердел | Ildar Sagdejev (Specious) | CC BY-SA 4.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:2010-01-21_Craftsman_Professional_cobalt_drill_bit_set.jpg) |
| Перфоратор | toolstop | CC BY 2.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Black_%26_Decker_P80-38_Rotary_Hammer_Drill_1.jpg) |
| Набір комбінованих ключів | Ildar Sagdejev (Specious) | CC BY-SA 3.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:2008-04-14_Chrome-Vanadium_Wrenches.jpg) |
| Пасатижі | Evan-Amos | Public domain | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Tool-pliers.jpg) |
| Набір викруток | Pittigrilli | CC BY 4.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Screwdriver_set_with_great_variety_of_bits_and_ratchet_screwdriver.jpg) |
| Лазерний рівень | Billbeee at English Wikipedia | CC BY 2.5 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Laser-Level.jpg) |
| Бульбашковий рівень | Dmitry Makeev | CC BY-SA 4.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Waterpass.jpg) |
| Саморіз | Wp-0001 | CC BY 4.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Fetter-thread_lag_screw_with_full_point.jpg) |
| Анкерний болт | Dmitry G | CC BY-SA 3.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ancor_bolt_for_concrete.JPG) |
| Кутова шліфмашина | Adygrafix250 | CC BY-SA 4.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:A_welder_using_an_angle_grinder_to_grind_steel.jpg) |
| Циркулярна пилка | Mark Hunter | CC BY 2.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:DeWalt_circular_saw.jpg) |
| Молоток | James Bowe | CC BY 2.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Hammer_(6371964415).jpg) |
| Рулетка | Nenad Stojkovic | CC BY 2.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:A_pair_of_hands_holding_a_construction_measuring_tape.jpg) |
| Каска захисна | CEphoto, Uwe Aranas | CC BY-SA 3.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Cologne_Germany_Safety-helmet-with-headset-01.jpg) |
| Захисні окуляри | DJSparky | CC BY-SA 4.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Safety_Eyewear.jpg) |
| Робочі рукавиці | Joost J. Bakker IJmuiden | CC BY 2.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ansell_Edmont_Industrial_Neoprene_Neatop_75_29-50_Gloves_Sol-Vex_U.S.D.A._Accepted_Madi_in_Malaysia_(51879455310).jpg) |
| Драбина | Judgefloro | CC0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:1619Men_of_the_Philippines_with_aluminum_step_ladders_08.jpg) |
| Драбина-стрем’янка | Amin | CC BY-SA 4.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ladder_aluminum.jpg) |
| Подовжувач | Peter Lebbing | CC BY-SA 4.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Europlug_extension_cord.jpg) |
| Будівельний майданчик | Sasha India | CC BY 2.0 | [Файл на Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Arequipa,_Peru_(36187196854).jpg) |
