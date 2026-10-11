@echo off
chcp 65001 >nul
title Electron + SSH Tunnel launcher

echo ============================================
echo  Запуск SSH-туннеля и Electron
echo ============================================
echo.

REM ==== 1. Убиваем старые ssh, чтобы не было конфликта на порту 1080 ====
echo [1/4] Чистим старые туннели...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :1080 ^| findstr LISTENING') do (
    echo    Убиваю PID %%a
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM ==== 2. Запускаем SSH-туннель в отдельном окне ====
echo [2/4] Поднимаю SSH-туннель на порту 1080...
start "SSH Tunnel — не закрывать!" cmd /k "ssh -4 -D 1080 -p 4922 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -C root@64.188.104.140"

REM ==== 3. Ждём и проверяем порт ====
echo [3/4] Ждём 4 секунды и проверяем порт 1080...
timeout /t 4 /nobreak >nul

netstat -ano | findstr :1080 | findstr LISTENING >nul
if errorlevel 1 (
    echo.
    echo ❌ ОШИБКА: порт 1080 не слушается. Туннель не поднялся.
    echo    Проверь окно "SSH Tunnel" — возможно, неверный пароль.
    echo.
    pause
    exit /b 1
)
echo    ✓ Порт 1080 слушается.

REM ==== 4. Запускаем Electron ====
echo [4/4] Запускаю Electron...
echo.
cd /d "%~dp0"
npx electron .

echo.
echo Electron закрыт. Туннель всё ещё работает — закрой окно "SSH Tunnel" вручную.
pause