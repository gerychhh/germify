@echo off
setlocal

REM Перейти в папку проекта (где docker-compose.yml)
cd /d C:\gerychhh_\germify\germify

REM Поднять/пересобрать контейнеры
docker compose up -d --build

REM Показать статус
docker compose ps

REM (опционально) применить миграции и собрать статику
docker compose exec web python manage.py migrate
docker compose exec web python manage.py collectstatic --noinput

REM Открыть логи (закрыть Ctrl+C)
docker compose logs -f --tail=200 web

pause
endlocal
