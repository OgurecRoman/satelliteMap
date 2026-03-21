# Платформа мониторинга пролётов спутников

Это хакатонный проект про спутники и TLE-данные.

Берётся TLE, считается положение спутников, они показываются на карте, мы даём посмотреть, когда они пролетают над точкой или регионом.

## Что умеет проект

- показывать спутники на 2D-карте и 3D-глобусе
- считать текущие координаты спутников по TLE
- крутить время вперёд и назад в режиме симуляции
- строить трек спутника
- показывать карточку спутника
- фильтровать спутники по стране, оператору, типу орбиты и назначению
- искать пролёты над точкой
- искать пролёты над регионом
- сравнивать группы спутников
- показывать зоны радиовидимости и покрытия
- сохранять подписки на уведомления

## Стек

### Backend
- Python
- FastAPI
- SQLAlchemy
- PostgreSQL
- sgp4
- APScheduler

### Frontend
- React
- Leaflet для 2D
- Three.js / react-three-fiber для 3D
- Axios

## Запуск

### 1. Поднять PostgreSQL

```sql
CREATE DATABASE satmon;
```

### 2. Запустить backend

```bash
cd backend
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend поднимется на:

```text
http://127.0.0.1:8000
```

### 3. Загрузить демо-данные

```bash
curl -X POST http://127.0.0.1:8000/api/v1/tle/seed
```

### 4. Запустить frontend

```bash
cd frontend
npm install
npm start
```

Обычно фронт открывается на:

```text
http://localhost:3000
```

## Что можно делать

- выбрать спутник
- посмотреть его карточку
- покрутить время
- увидеть траекторию
- поставить точку на Земле (И посмотреть кто будет мимо неё пролетать)
- посчитать следующий пролёт над определённой траекторией
- посмотреть радиовидимость и покрытие
- сравнить группы спутников (по нашим параметрам)

## Основные API ручки

> По умолчанию автоматически сгенерированная документация FastAPI доступна на http://127.0.0.1:8000/docs

### Проверка
- `GET /health`
- `GET /api/v1/health`

### TLE
- `POST /api/v1/tle/upload`
- `POST /api/v1/tle/seed`
- `GET /api/v1/tle`
- `PUT /api/v1/tle/{satellite_id}`

### Спутники
- `GET /api/v1/satellites`
- `GET /api/v1/satellites/filters`
- `GET /api/v1/satellites/positions`
- `GET /api/v1/satellites/{satellite_id}`
- `GET /api/v1/satellites/{satellite_id}/track`
- `GET /api/v1/satellites/{satellite_id}/visibility`
- `GET /api/v1/satellites/{satellite_id}/coverage`
- `GET /api/v1/satellites/{satellite_id}/next-pass`

### Аналитика
- `POST /api/v1/analysis/passes-over-point`
- `POST /api/v1/analysis/passes-over-region`
- `POST /api/v1/analysis/compare-groups`

### Подписки
- `POST /api/v1/notifications/subscriptions`
- `GET /api/v1/notifications/subscriptions`