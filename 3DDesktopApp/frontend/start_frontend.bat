@echo off
cd /d %~dp0
echo 正在启动前端开发服务器...
echo 如果第一次运行，请耐心等待npm安装...
echo.
echo 前端地址：http://localhost:5173
echo 按 Ctrl+C 停止
echo.
call npm run dev
pause