# Бэкенд для мониторинга пролётов спутников

- Загрузка TLE
- Список спутников и его карточка
- Посчитать позицию
- Построить трек спутника
- Найти следующий пролёт над точкой
- Найти пролёты над регионом
- Зоны видимости и покрытия
- Сравнить группы спутников

## Что важно понимать

- база по умолчанию — **PostgreSQL**
- расчёты орбиты идут через **sgp4**
- `visibility` и `coverage` — это разные ручки
- уведомления пока только сохраняются в БД, без реальной отправки :)

## Как запустить локально

### 1. Создать базу

```sql
CREATE DATABASE satmon;
```

### 2. `.env`

```bash
cd backend
cp .env.example .env
```

Настройте .env в соответствии с вашим PostgreSQL.

### 3. Зависимости

```bash
python -m venv .venv
source .venv/bin/activate
# Windows: .venv\Scripts\activate.bat
pip install -r requirements.txt
```

### 4. Запуск

```bash
uvicorn app.main:app --reload
```

Таблицы создаются сами при старте.

### 5. Демо-данные

```bash
curl -X POST http://127.0.0.1:8000/api/v1/tle/seed
```

## Основные ручки

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
- `GET /api/v1/satellites/{satellite_id}`
- `GET /api/v1/satellites/{satellite_id}/position`
- `GET /api/v1/satellites/{satellite_id}/state-vector`
- `GET /api/v1/satellites/{satellite_id}/track`
- `GET /api/v1/satellites/{satellite_id}/visibility`
- `GET /api/v1/satellites/{satellite_id}/coverage`
- `GET /api/v1/satellites/{satellite_id}/next-pass`

### Аналитика
- `GET /api/v1/analysis/grouping`
- `POST /api/v1/analysis/passes-over-point`
- `POST /api/v1/analysis/passes-over-region`
- `POST /api/v1/analysis/compare-groups`

### Уведомления
- `POST /api/v1/notifications/subscriptions`
- `GET /api/v1/notifications/subscriptions`

## Пара полезных примеров

### Засидить данные

```bash
curl -X POST http://127.0.0.1:8000/api/v1/tle/seed
```

### Посмотреть спутники

```bash
curl "http://127.0.0.1:8000/api/v1/satellites?limit=20&offset=0"
```

### Позиции спутников

```bash
curl "http://127.0.0.1:8000/api/v1/satellites/positions?format=geodetic"
```

### Следующий пролёт над точкой

```bash
curl "http://127.0.0.1:8000/api/v1/satellites/1?point_lat=55.75&point_lon=37.62"
```

### Пролёты над регионом

```bash
curl -X POST http://127.0.0.1:8000/api/v1/analysis/passes-over-region \
  -H "Content-Type: application/json" \
  -d '{
    "region": {
      "type": "bbox",
      "min_lat": 50.0,
      "min_lon": 30.0,
      "max_lat": 60.0,
      "max_lon": 40.0
    },
    "from_time": "2026-03-21T10:00:00Z",
    "horizon_hours": 24,
    "step_seconds": 300
  }'
```

## Тесты

Для тестов используется SQLite, чтобы они были легче и изолированнее.

```bash
pytest -q
```