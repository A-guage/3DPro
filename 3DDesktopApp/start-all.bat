@echo off
chcp 65001 >nul
title 3D Desktop App - 一键启动
cd /d %~dp0

echo ============================================
echo   3D Desktop App - 一键启动
echo ============================================
echo.
echo  [1] PiAgent Service   - http://localhost:3001
echo  [2] FastAPI Backend   - http://localhost:8000
echo  [3] Frontend (Vite)   - http://localhost:5173
echo  [4] UE Plugin Server  - http://localhost:3030 (需在 UE Editor 中运行)
echo  [5] Electron Desktop - 桌面应用 (端口 5173+8000)
echo. [6] UnrealMCP Server  - MCP bridge to Unreal Engine
echo.
echo  按 Ctrl+C 可停止所有服务
echo ============================================
echo.

::: 清理旧进程（解决直接关闭窗口导致的端口占用）
echo [0/3] 清理可能残留的旧进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo   - 终止占用 3001 端口的进程 PID=%%a
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    echo   - 终止占用 8000 端口的进程 PID=%%a
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo   - 终止占用 5173 端口的进程 PID=%%a
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo.

::: 启动 PiAgent 服务
echo [1/5] 启动 PiAgent 服务 (port 3001)...
start "PiAgent-Service" cmd /k "cd /d %~dp0..\PiAgent_Project\agent_service && node index.mjs"
timeout /t 3 /nobreak >nul

::: 启动 FastAPI 后端
echo [2/5] 启动 FastAPI 后端 (port 8000)...
start "FastAPI-Backend" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate.bat && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
timeout /t 3 /nobreak >nul

::: 启动前端
echo [3/5] 启动前端开发服务器 (port 5173)...
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 3 /nobreak >nul

::: 启动 UnrealMCP Server
echo [4/5] 启动 UnrealMCP Server (MCP bridge to UE)...
start "UnrealMCP-Server" cmd /k "python d:/3DPro/unreal-mcp-main/Python/unreal_mcp_server.py"
timeout /t 2 /nobreak >nul

::: 启动 Electron 桌面应用
echo [5/5] 启动 Electron 桌面应用...
start "Electron-Desktop" cmd /k "cd /d %~dp0 && npm run start"

echo.
echo ============================================
echo   所有服务已启动！
echo   浏览器访问: http://localhost:5173
echo.
echo   服务状态：
echo   [1] PiAgent Service   - http://localhost:3001
echo   [2] FastAPI Backend   - http://localhost:8000
echo   [3] Frontend          - http://localhost:5173
echo   [4] UnrealMCP Server  - MCP bridge (需 UE 编辑器运行)
echo   [5] Electron Desktop  - 桌面应用
echo.============================================
echo.
echo 提示: 关闭此窗口不会停止服务，请关闭各独立窗口
echo       或使用 stop-all.bat 停止所有服务
echo.
echo ============================================
echo   UnrealMCP Server 启动说明
echo ============================================
echo.
echo   UnrealMCP Server 需要 Unreal Engine 编辑器运行才能正常工作。
echo   启动顺序：
echo   1. 启动 Unreal Engine 编辑器
echo   2. 打开包含 UnrealMCP 插件的项目
echo   3. UnrealMCP Server 会自动连接到 UE
echo.
echo   如果连接失败，请确保：
echo   - UE 编辑器已启动并加载项目
echo   - UnrealMCP 插件已启用
echo.
