@echo off
cd /d C:\gerychhh_\germify\germify
docker compose down
docker compose up -d --build
docker compose ps
pause
