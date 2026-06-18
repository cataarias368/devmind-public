# 🧠 DevMind Agent v2.0

Sistema de Ingeniería de Software Autónoma de nivel empresarial. Planifica, codifica, diseña, documenta, prueba y despliega software de forma autónoma.

## 🚀 Inicio Rápido

```bash
# 1. Clonar
git clone https://github.com/your-user/devmind-agent.git
cd devmind-agent

# 2. Instalar
npm install

# 3. Configurar
cp .env.example .env
# Editar .env con tu GLM_API_KEY

# 4. Ejecutar
npx tsx src/index.ts "Crear una API REST con Express"
```

## 📋 Modos de Operación

| Comando | Descripción |
|---------|-------------|
| `devmind <tarea>` | Ejecuta una tarea con el agente autónomo |
| `devmind --dashboard` | Panel web en puerto 3001 |
| `devmind --server` | API REST en puerto 3000 |
| `devmind --bots` | Conecta Slack/Discord/Telegram |
| `devmind --multi-agent [tarea]` | Ejecución con agentes paralelos |
| `devmind --test [dir]` | Genera tests automáticos |
| `devmind --docs [dir]` | Genera documentación |
| `devmind --github [acción]` | Interactúa con GitHub |
| `devmind --health` | Health Check del sistema |
| `devmind --metrics` | Métricas de rendimiento |
| `devmind --suggest` | Sugerencias de mejora |
| `devmind --clear-cache` | Limpiar caché semántico |
| `devmind --status` | Estado completo del sistema |
| `devmind --ad-stats` | Estadísticas de publicidad |

## 🏗️ Arquitectura

```
src/
├── index.ts                 # Punto de entrada (8 modos)
├── agent.ts                 # Bucle autónomo con 6 tools
├── llm-provider.ts          # GLM-4 con JWT, reintentos, streaming
├── image-provider.ts        # CogView (icon, diagram, mockup)
├── checkpoint.ts            # Persistencia de estado
├── memory.ts                # Memoria con scoring por relevancia
├── config.ts                # Zod + dotenv
├── types.ts                 # Interfaces compartidas + seguridad
├── advertising.ts           # Sistema de anuncios no intrusivos
├── monitor.ts               # Monitor del sistema (SystemState)
├── doc-generator.ts         # Documentación MD/HTML/PDF
├── github-integration.ts    # Issues, PRs, búsqueda
├── dashboard.ts             # Web UI vanilla (chat, logs, status)
├── chat-bots.ts             # Slack/Discord/Telegram
├── multi-agent.ts           # 5 agentes paralelos
├── test-generator.ts        # Tests automáticos (spawnSync seguro)
├── plugin-system.ts         # Sistema de plugins
├── server.ts                # API REST con auth
└── tasks/                   # 15 módulos de rendimiento
    ├── index.ts             # TaskManager (orquestador)
    ├── types.ts             # Tipos de tareas
    ├── context-compression.ts
    ├── sliding-window.ts
    ├── tool-prioritization.ts
    ├── semantic-cache.ts
    ├── short-term-memory.ts
    ├── episodic-memory.ts
    ├── step-anticipation.ts
    ├── dynamic-planning.ts
    ├── batch-processing.ts
    ├── self-evaluation.ts
    ├── improvement-suggestions.ts
    ├── independent-execution.ts
    ├── parallel-pipeline.ts
    ├── health-check.ts
    └── alerts.ts
```

## 🔧 Módulos de Rendimiento (15 tareas)

### Gestión de Contexto
- **Context Compression**: Resume mensajes antiguos manteniendo info clave
- **Sliding Window**: Ventana de 100 mensajes con prioridad
- **Tool Prioritization**: Prioriza herramientas según tipo de tarea

### Memoria y Caché
- **Semantic Cache**: Caché por similitud semántica (threshold 0.85)
- **Short-Term Memory**: Últimas 20 acciones con importancia
- **Episodic Memory**: 100 episodios con búsqueda por similaridad

### Optimización
- **Step Anticipation**: Predice próximos 3 pasos
- **Dynamic Planning**: Plan que se adapta ante fallos
- **Batch Processing**: Agrupa operaciones similares en lotes

### Mejora Continua
- **Self-Evaluation**: Métricas de rendimiento (successRate, steps, tokens)
- **Improvement Suggestions**: Sugerencias automáticas basadas en métricas

### Paralelización
- **Independent Execution**: Tareas paralelas con contexto aislado
- **Parallel Pipeline**: Pipeline con etapas paralelas

### Monitoreo
- **Health Check**: Verifica API key, memoria, disco, herramientas
- **Alerts**: Sistema de alertas info/warning/critical + Slack webhook

## 🔒 Seguridad

- `spawnSync` con `shell: false` para prevenir command injection
- `isSafePath()` valida rutas antes de ejecución
- `serializeError()` maneja errores anidados de Playwright
- Lista blanca de comandos seguros en el agente
- Autenticación Bearer en la API REST

## 📦 Dependencias

| Paquete | Uso |
|---------|-----|
| `zod` | Validación de configuración |
| `dotenv` | Variables de entorno |
| `typescript` | Compilación |
| `tsx` | Ejecución TS directa |

## 📄 Licencia

AGPLv3 - Ver [LICENSE](LICENSE)
