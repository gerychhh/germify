#!/usr/bin/env sh
set -e

if [ "$#" -gt 0 ]; then
    exec "$@"
fi

# Подождать MySQL
python - <<'PY'
import os, socket, time
host = os.environ.get("MYSQL_HOST", "db")
port = int(os.environ.get("MYSQL_PORT", "3306"))
for _ in range(60):
    try:
        s = socket.create_connection((host, port), timeout=2)
        s.close()
        break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit(f"MySQL not reachable at {host}:{port}")
PY

python manage.py migrate --noinput
python manage.py bootstrap_socialapps
python manage.py collectstatic --noinput

PORT="${DJANGO_PORT:-8000}"
exec daphne -b 0.0.0.0 -p "$PORT" germify.asgi:application
