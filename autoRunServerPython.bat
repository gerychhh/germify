@echo off
REM Переходим в папку проекта
cd /d C:\gerychhh_\germify\germify\backend

REM Активируем виртуальное окружение
call C:\gerychhh_\germify\germify\VenvMain\venv\Scripts\activate.bat

REM Запускаем ASGI сервер (нужен для WebSocket)
REM Если nginx проксирует на 8001 - оставь как есть
uvicorn germify.asgi:application --host 127.0.0.1 --port 8001

pause
