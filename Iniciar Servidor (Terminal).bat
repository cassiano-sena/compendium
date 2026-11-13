@echo off
title Compendio RPG - Servidor Terminal
cd /d "%~dp0"
echo Iniciando Compendio RPG em modo Servidor Terminal (sem janela desktop)...
node server.js --server %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Nao foi possivel iniciar o servidor. Verifique se o Node.js esta instalado.
    pause
)
