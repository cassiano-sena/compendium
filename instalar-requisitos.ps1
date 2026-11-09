# ====================================================================
#  INSTALADOR RAPIDO DE REQUISITOS / QUICK REQUIREMENTS INSTALLER
# ====================================================================
$ErrorActionPreference = 'Continue'

Write-Host "====================================================" -ForegroundColor Yellow
Write-Host "  Verificando requisitos / Checking requirements... " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Yellow

# 1. Verificar / Instalar Node.js LTS
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node -v
    Write-Host "[OK] Node.js encontrado / found: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "[!] Node.js nao encontrado. Instalando via winget..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
        Write-Host "[OK] Node.js LTS instalado! Reinicie o terminal se necessario." -ForegroundColor Green
    } else {
        Write-Host "[ERRO] winget nao disponivel. Baixe o Node.js em: https://nodejs.org/" -ForegroundColor Red
    }
}

# 2. Verificar Microsoft Edge (usado para o modo janela de app no Windows)
$edgeInstalled = (Get-Command msedge -ErrorAction SilentlyContinue) -or
                 (Test-Path "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") -or
                 (Test-Path "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")

if ($edgeInstalled) {
    Write-Host "[OK] Microsoft Edge encontrado (Modo App disponivel)." -ForegroundColor Green
} else {
    Write-Host "[!] Microsoft Edge nao encontrado. Tentando instalar via winget..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id Microsoft.Edge -e --accept-package-agreements --accept-source-agreements
    } else {
        Write-Host "[AVISO] Voce ainda pode usar o Compendio em qualquer navegador via 'node server.js'." -ForegroundColor Yellow
    }
}

# 3. Instalar pacotes npm (caso existam no package.json)
if ((Test-Path (Join-Path $PSScriptRoot "package.json")) -and (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Sincronizando package.json (npm install)..." -ForegroundColor Cyan
    Push-Location $PSScriptRoot
    npm install
    Pop-Location
}

Write-Host "====================================================" -ForegroundColor Yellow
Write-Host "  Tudo pronto! / All set!                           " -ForegroundColor Green
Write-Host "  Execute 'Iniciar Compendio.vbs' ou 'npm start'.   " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Yellow
