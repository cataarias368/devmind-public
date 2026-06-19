#!/bin/bash
# ============================================================
# DevMind Agent - Instalacion 1-Clic (Linux/macOS)
# ============================================================
# Uso: curl -fsSL https://raw.githubusercontent.com/cataarias368/devmind-public/main/install.sh | bash
# ============================================================

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🧠 DevMind Agent - Instalacion 1-Clic                 ║${NC}"
echo -e "${CYAN}║  Autonomous Software Engineering Suite                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. Verificar Node.js
echo -e "${BLUE}[1/5]${NC} Verificando Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "  ${GREEN}✅${NC} Node.js ${NODE_VERSION} encontrado"
else
    echo -e "  ${YELLOW}📦${NC} Instalando Node.js..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install node
        else
            echo -e "  ${YELLOW}Instalando Homebrew...${NC}"
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            brew install node
        fi
    else
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    echo -e "  ${GREEN}✅${NC} Node.js instalado: $(node --version)"
fi

# 2. Verificar Git
echo -e "${BLUE}[2/5]${NC} Verificando Git..."
if ! command -v git &> /dev/null; then
    echo -e "  ${YELLOW}📦${NC} Instalando Git..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install git
    else
        sudo apt-get install -y git
    fi
fi
echo -e "  ${GREEN}✅${NC} Git encontrado"

# 3. Clonar repositorio
echo -e "${BLUE}[3/5]${NC} Clonando DevMind..."
if [ -d "devmind" ]; then
    echo -e "  ${YELLOW}⚠️${NC} Directorio 'devmind' ya existe. Actualizando..."
    cd devmind
    git pull origin main
else
    git clone https://github.com/cataarias368/devmind-public.git devmind
    cd devmind
fi
echo -e "  ${GREEN}✅${NC} Repositorio listo"

# 4. Instalar dependencias
echo -e "${BLUE}[4/5]${NC} Instalando dependencias..."
npm install
echo -e "  ${GREEN}✅${NC} Dependencias instaladas"

# 5. Configurar entorno
echo -e "${BLUE}[5/5]${NC} Configurando entorno..."
cat > .env << 'EOF'
# DevMind Agent - Configuracion
# Obtene tu API Key en: https://open.bigmodel.cn/

GLM_API_KEY=
WORKSPACE_ROOT=./workspace
AGENT_DRY_RUN=false
AGENT_MAX_STEPS=25
DASHBOARD_PORT=3001
API_PORT=3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
EOF

mkdir -p workspace
echo -e "  ${GREEN}✅${NC} Entorno configurado"

# Listo!
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ DevMind instalado correctamente                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Para iniciar el dashboard:${NC}"
echo -e "  ${YELLOW}cd devmind && npm start -- --dashboard${NC}"
echo ""
echo -e "  ${CYAN}Luego abri en el navegador:${NC}"
echo -e "  ${YELLOW}http://localhost:3001${NC}"
echo ""
echo -e "  ${CYAN}Para configurar tu API Key:${NC}"
echo -e "  ${YELLOW}1. Obtenela en https://open.bigmodel.cn/${NC}"
echo -e "  ${YELLOW}2. Ingresala desde el dashboard o edita .env${NC}"
echo ""

# Preguntar si quiere iniciar
read -p "Iniciar DevMind ahora? (s/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[SsYy]$ ]]; then
    npx tsx src/index.ts --dashboard
fi
