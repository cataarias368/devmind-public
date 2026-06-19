# ============================================================
# DevMind Agent - Instalacion 1-Clic (Windows)
# ============================================================
# Uso: powershell -c "irm https://raw.githubusercontent.com/cataarias368/devmind-public/main/install.ps1 | iex"
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🧠 DevMind Agent - Instalacion 1-Clic                 ║" -ForegroundColor Cyan
Write-Host "║  Autonomous Software Engineering Suite                  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar Node.js
Write-Host "[1/5] Verificando Node.js..." -ForegroundColor Blue
if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Host "  ✅ Node.js $nodeVersion encontrado" -ForegroundColor Green
} else {
    Write-Host "  📦 Instalando Node.js..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    RefreshEnv.cmd 2>$null
    Write-Host "  ✅ Node.js instalado" -ForegroundColor Green
}

# 2. Verificar Git
Write-Host "[2/5] Verificando Git..." -ForegroundColor Blue
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "  📦 Instalando Git..." -ForegroundColor Yellow
    winget install Git.Git --accept-package-agreements --accept-source-agreements
}
Write-Host "  ✅ Git encontrado" -ForegroundColor Green

# 3. Clonar repositorio
Write-Host "[3/5] Clonando DevMind..." -ForegroundColor Blue
if (Test-Path "devmind") {
    Write-Host "  ⚠️ Directorio 'devmind' ya existe. Actualizando..." -ForegroundColor Yellow
    Set-Location devmind
    git reset --hard HEAD
    git clean -fd
    git pull origin main
} else {
    git clone https://github.com/cataarias368/devmind-public.git devmind
    Set-Location devmind
}
Write-Host "  ✅ Repositorio listo" -ForegroundColor Green

# 4. Instalar dependencias
Write-Host "[4/5] Instalando dependencias..." -ForegroundColor Blue
npm install
Write-Host "  ✅ Dependencias instaladas" -ForegroundColor Green

# 5. Configurar entorno
Write-Host "[5/5] Configurando entorno..." -ForegroundColor Blue
@"
# DevMind Agent - Configuracion
# Obtene tu API Key en: https://open.bigmodel.cn/

GLM_API_KEY=
WORKSPACE_ROOT=./workspace
AGENT_DRY_RUN=false
AGENT_MAX_STEPS=25
DASHBOARD_PORT=3001
API_PORT=3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
"@ | Out-File -FilePath .env -Encoding utf8

New-Item -ItemType Directory -Force -Path workspace | Out-Null
Write-Host "  ✅ Entorno configurado" -ForegroundColor Green

# Listo!
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅ DevMind instalado correctamente                     ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Para iniciar el dashboard:" -ForegroundColor Cyan
Write-Host "  cd devmind && npm start -- --dashboard" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Luego abri en el navegador:" -ForegroundColor Cyan
Write-Host "  http://localhost:3001" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Para configurar tu API Key:" -ForegroundColor Cyan
Write-Host "  1. Obtenela en https://open.bigmodel.cn/" -ForegroundColor Yellow
Write-Host "  2. Ingresala desde el dashboard o edita .env" -ForegroundColor Yellow
Write-Host ""

# Preguntar si quiere iniciar
$reply = Read-Host "Iniciar DevMind ahora? (s/n)"
if ($reply -eq "s" -or $reply -eq "S" -or $reply -eq "y" -or $reply -eq "Y") {
    # Iniciar en una nueva ventana de PowerShell para ver los logs
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npx tsx src/index.ts --dashboard"
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:3001"
}
