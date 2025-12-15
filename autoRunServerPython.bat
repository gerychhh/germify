@echo off
REM Переходим в папку проекта
cd /d C:\gerychhh_\germify\germify\backend

REM Активируем виртуальное окружение
call C:\gerychhh_\germify\germify\lab4_4\venv\Scripts\activate.bat

REM Запускаем сервер Django
python manage.py runserver

REM Чтобы окно не закрылось сразу
pause
