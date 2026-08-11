@echo off
chcp 65001 >nul
title 源兹生物官网 - 本地服务器 (端口 8080)
cd /d "%~dp0"
echo ============================================
echo   源兹生物官网本地服务器
echo   访问地址: http://localhost:8080
echo   关闭: 直接关掉本窗口 或 按 Ctrl+C
echo ============================================
echo.
start "" http://localhost:8080
python -m http.server 8080
pause
