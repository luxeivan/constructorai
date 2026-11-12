# Деплой на Debian 13: constructorai.luxeivan.ru

Инструкция написана для ИИ-агента, который работает **на сервере** по SSH. Выполняй шаги по порядку, после каждого блока проверяй результат. Если проверка не прошла — остановись и сообщи оператору, не пытайся «обойти» ошибку.

## 0. Что должно быть известно заранее

| Параметр | Значение |
|---|---|
| Домен | `constructorai.luxeivan.ru` |
| Репозиторий | `https://github.com/luxeivan/constructorai.git` |
| Ветка | `master` |
| Каталог установки | `/opt/constructorai` |
| Порт приложения (локально) | `127.0.0.1:8081` |
| Email для Let's Encrypt | `luxeivan@gmail.com` |

**Секрет, который нельзя придумать:** `POLZA_TOKEN`. Его передаёт владелец. Если токена нет — остановись и запроси его. Никогда не выводи токен в чат, логи и `git diff`.

Пароли для Postgres, администратора и `SESSION_SECRET` агент **генерирует сам** через `openssl rand` (см. шаг 4). Сгенерированный пароль администратора нужно один раз сообщить владельцу и посоветовать сохранить в менеджере паролей.

## 1. Проверка сервера

```bash
cat /etc/debian_version          # ожидаем 13.x
docker --version
docker compose version           # нужен v2, команда "docker compose"
nginx -v
systemctl is-active nginx
df -h /                          # нужно ≥ 6 ГБ свободно
free -h                          # минимум 2 ГБ RAM
```

Проверь, что порты 80 и 443 свободны для nginx, а 8081 никем не занят:

```bash
ss -lntp | grep -E ':(80|443|8081)\b' || true
```

Если 8081 занят — поменяй `WEB_PORT` в `.env` (шаг 4) и в конфиге nginx (шаг 6).

## 2. DNS

```bash
apt-get update && apt-get install -y dnsutils
dig +short A constructorai.luxeivan.ru
curl -4 -s https://ifconfig.me; echo
```

A-запись должна указывать на публичный IP этого сервера. Если это не так — **остановись** и сообщи оператору: без DNS Let's Encrypt не выпустит сертификат.

## 3. Установка пакетов

```bash
apt-get update
apt-get install -y git curl openssl ca-certificates certbot python3-certbot-nginx ufw
```

## 4. Клонирование и `.env`

```bash
mkdir -p /opt
cd /opt
if [ -d constructorai/.git ]; then
  cd constructorai && git fetch origin && git checkout master && git pull --ff-only
else
  git clone https://github.com/luxeivan/constructorai.git
  cd constructorai
fi
git log --oneline -1
```

Сгенерируй секреты и создай `.env` (файл не коммитится):

```bash
cd /opt/constructorai
umask 077

PG_PASS="$(openssl rand -hex 24)"
ADMIN_PASS="$(openssl rand -hex 12)"
SESSION_SECRET="$(openssl rand -hex 32)"

cat > .env <<EOF
# --- Postgres ---
POSTGRES_USER=werstakoff
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=werstakoff
DATABASE_URL=postgresql://werstakoff:${PG_PASS}@postgres:5432/werstakoff

# --- Redis / storage ---
REDIS_URL=redis://redis:6379
STORAGE_DRIVER=fs
STORAGE_DIR=/app/storage
MINIO_BUCKET=werstakoff

# --- AI ---
POLZA_TOKEN=PASTE_POLZA_TOKEN_HERE
AI_SESSION_BUDGET_RUB=60

# --- Admin ---
ADMIN_LOGIN=admin
ADMIN_PASSWORD=${ADMIN_PASS}
SESSION_SECRET=${SESSION_SECRET}

# --- App ---
PUBLIC_BASE_URL=https://constructorai.luxeivan.ru
PHOTO_RETENTION_DAYS=365
WEB_PORT=8081
EOF

chmod 600 .env
```

Замени `PASTE_POLZA_TOKEN_HERE` на реальный токен, не показывая его в терминале:

```bash
read -rsp "POLZA_TOKEN: " TOKEN; echo
sed -i "s|PASTE_POLZA_TOKEN_HERE|${TOKEN}|" .env
unset TOKEN
grep -c '^POLZA_TOKEN=.\+' .env    # должно быть 1
```

Пароль администратора сохрани для отчёта:

```bash
grep '^ADMIN_PASSWORD=' .env | cut -d= -f2-
```

Требования к значениям: только латиница, цифры и `-`/`_` (пароли из `openssl rand -hex` подходят). Символы `$`, `#`, пробелы и кавычки в `.env` ломают подстановку Docker Compose.

## 5. Сборка и запуск

```bash
cd /opt/constructorai
docker compose build          # первый раз 5–15 минут
docker compose up -d
docker compose ps
```

Дождись статуса `healthy` у `api` (до 2 минут):

```bash
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8081/api/health >/dev/null; then echo OK; break; fi
  sleep 5
done
curl -fsS http://127.0.0.1:8081/api/health
```

Ожидаемо: `{"ok":true,...}`.

Посмотри логи, если что-то не поднялось:

```bash
docker compose logs --tail=100 api worker
```

## 6. Импорт каталога с картинками

Это разовая операция, занимает 10–20 минут (≈2800 изображений).

```bash
cd /opt/constructorai
docker compose exec -T worker \
  pnpm --filter @werstakoff/catalog exec tsx src/import.ts \
  --file=../../items.json --images
```

Проверка:

```bash
docker compose exec -T postgres psql -U werstakoff -d werstakoff -c \
  "select count(*) as variants, count(image_file_id) as with_images from catalog_variants;"
```

Ориентир: `2867` вариантов, около `2809` с картинками.

## 7. Nginx на хосте

Скопируй готовый шаблон из репозитория:

```bash
cd /opt/constructorai
cp deploy/nginx/constructorai.luxeivan.ru.conf /etc/nginx/sites-available/constructorai.luxeivan.ru
ln -sf /etc/nginx/sites-available/constructorai.luxeivan.ru /etc/nginx/sites-enabled/constructorai.luxeivan.ru
nginx -t
systemctl reload nginx
```

Проверь, что сайт открывается по HTTP (без TLS):

```bash
curl -I http://constructorai.luxeivan.ru
```

Ожидаемо `200` или `301` (если certbot ещё не запускался — `200`).

## 8. SSL Let's Encrypt

```bash
certbot --nginx \
  -d constructorai.luxeivan.ru \
  --redirect \
  --non-interactive \
  --agree-tos \
  -m luxeivan@gmail.com
```

Проверки:

```bash
curl -sI http://constructorai.luxeivan.ru | head -1     # 301 на https
curl -sI https://constructorai.luxeivan.ru | head -1    # 200
openssl s_client -connect constructorai.luxeivan.ru:443 -servername constructorai.luxeivan.ru </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -dates
systemctl list-timers | grep -i certbot
```

Автопродление должно быть включено (`certbot.timer` активен). Дополнительно проверь `certbot renew --dry-run`.

## 9. Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

Порт `8081` наружу **не открывать**: он слушает только `127.0.0.1` и доступен лишь host-nginx.

## 10. Приёмка

```bash
curl -fsS https://constructorai.luxeivan.ru/api/health
curl -sI https://constructorai.luxeivan.ru | head -1
```

Проверь админку (пароль из шага 4):

```bash
ADMIN_PASS="$(grep '^ADMIN_PASSWORD=' /opt/constructorai/.env | cut -d= -f2-)"
curl -s -X POST https://constructorai.luxeivan.ru/api/admin/login \
  -H 'Content-Type: application/json' \
  -d "{\"login\":\"admin\",\"password\":\"${ADMIN_PASS}\"}" | head -c 200; echo
```

Ожидаемо JSON с `admin`, без ошибки.

Итоговый отчёт оператору:

- URL: `https://constructorai.luxeivan.ru`
- логин админа: `admin`, пароль: `<сгенерированный>`
- статус контейнеров, срок сертификата, число товаров/картинок в каталоге.

## 11. Обновления

```bash
cd /opt/constructorai
git pull --ff-only
docker compose build
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:8081/api/health
```

Миграции Prisma применяются автоматически при старте `api`. Откат — `git checkout <commit> && docker compose up -d --build`.

## 12. Бэкапы

Создай `/opt/constructorai/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/constructorai
mkdir -p /var/backups/constructorai
STAMP="$(date +%F)"
docker compose exec -T postgres pg_dump -U werstakoff werstakoff \
  | gzip > "/var/backups/constructorai/db-${STAMP}.sql.gz"
docker run --rm \
  -v constructorai_storagedata:/data:ro \
  -v /var/backups/constructorai:/backup \
  alpine tar czf "/backup/storage-${STAMP}.tgz" -C /data .
find /var/backups/constructorai -type f -mtime +14 -delete
```

```bash
chmod 700 /opt/constructorai/backup.sh
/opt/constructorai/backup.sh
( crontab -l 2>/dev/null; echo "30 3 * * * /opt/constructorai/backup.sh >> /var/log/constructorai-backup.log 2>&1" ) | crontab -
```

Проверь, что архив создался и не пустой.

## 13. Если что-то пошло не так

| Симптом | Что проверить |
|---|---|
| `502 Bad Gateway` | `docker compose ps`, `docker compose logs web api`, порт в `deploy/nginx/...conf` совпадает с `WEB_PORT` |
| Сертификат не выпускается | DNS не указывает на сервер, порт 80 закрыт, другой vhost перехватывает домен |
| Логин не сохраняется | заходить только по `https://constructorai.luxeivan.ru`, не по IP:8081 (production-cookie `secure`) |
| `413 Request Entity Too Large` | `client_max_body_size 20m` в host-nginx и в `infra/docker/nginx.conf` |
| Долгий ответ SSE / «готовим варианты» не обновляется | `proxy_buffering off` и `proxy_read_timeout 600s` в host-nginx |
| `prisma migrate` падает | `DATABASE_URL` не совпадает с `POSTGRES_PASSWORD`; при смене пароля на существующем volume БД хранит старый |
| Worker не обрабатывает задачи | `docker compose logs worker redis`, `redis-cli ping` внутри контейнера |
| Кончилось место | `docker system df`, старые образы `docker image prune -f`, бэкапы, `max-size` логов уже задан |
| Админ-пароль не меняется | `ADMIN_PASSWORD` в `.env` применяется при старте `api` (seed обновляет пароль), затем `docker compose restart api` |

## 14. Чек-лист безопасности

- [ ] `.env` с правами `600`, не попал в git (`git status --short` чистый).
- [ ] Наружу открыты только 22/80/443; `8081` слушает `127.0.0.1`.
- [ ] Пароль администратора не `admin12345`, сохранён у владельца.
- [ ] `POLZA_TOKEN` не фигурирует в логах и отчёте.
- [ ] `certbot renew --dry-run` проходит.
- [ ] Бэкап БД и storage создаётся по cron.
- [ ] `docker compose ps` — все сервисы `running`, `api` — `healthy`.

## Приложение. Стартовый промт для агента на сервере

Скопируй текст ниже в чат агента (замени `<POLZA_TOKEN>` на реальный токен):

```text
Ты — DevOps-инженер на сервере Debian 13. Docker и host-nginx уже установлены.

Задача: развернуть приложение из https://github.com/luxeivan/constructorai.git
в /opt/constructorai и открыть его по адресу https://constructorai.luxeivan.ru
с сертификатом Let's Encrypt. Host-nginx должен проксировать домен на
127.0.0.1:8081, контейнеры наружу не публикуются.

Порядок работы:
1. Склонируй репозиторий (ветка master) и прочитай DEPLOY.md — это твоя инструкция.
2. Выполняй шаги DEPLOY.md по порядку, после каждого проверяй результат.
3. Перед выпуском сертификата проверь, что A-запись домена указывает на этот сервер.
4. Сгенерируй пароли Postgres, администратора и SESSION_SECRET через openssl rand,
   создай /opt/constructorai/.env с правами 600. Значение POLZA_TOKEN:
   <POLZA_TOKEN>
   Не выводи токен в чат, логи и git-команды.
5. Собери и запусти контейнеры, дождись healthy, проверь /api/health.
6. Импортируй каталог с картинками (команда в DEPLOY.md, занимает 10–20 минут).
7. Настрой host-nginx из deploy/nginx/constructorai.luxeivan.ru.conf,
   выпусти сертификат certbot --nginx, проверь редирект HTTP→HTTPS и автопродление.
8. Настрой ufw (22/80/443) и ежедневный бэкап по DEPLOY.md.
9. Если шаг не проходит — остановись, покажи команду и вывод, не обходи ошибку.

В финальном отчёте укажи:
- URL приложения и статус HTTPS;
- `docker compose ps`;
- срок действия сертификата;
- число вариантов и картинок в каталоге;
- логин администратора и сгенерированный пароль (один раз, для передачи владельцу).
```
