@echo off

REM Активируем виртуальное окружение
call C:\gerychhh_\germify\germify\VenvMain\venv\Scripts\activate.bat

REM Запускаем
uvicorn germify.asgi:application --host 127.0.0.1 --port 8001

REM Чтобы окно не закрылось сразу
pause
