@echo off
cls
echo 正在启动Furry Minecraft Launcher已打包版本...

cd /d "%~dp0build\win-unpacked"
"Furry Minecraft Launcher.exe"

if %errorlevel% neq 0 (
    echo 启动失败，请检查文件是否存在
    pause
)