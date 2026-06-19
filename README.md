# 🧠 DevMind Agent v3.0

<p align="center">
  <img src="./logo.png" alt="DevMind Logo" width="200"/>
</p>

<h3 align="center">Autonomous Software Engineering Suite</h3>

<p align="center">
  <a href="https://github.com/cataarias368/devmind-agent/releases">
    <img src="https://img.shields.io/github/v/release/cataarias368/devmind-agent?include_prereleases&label=version" alt="version"/>
  </a>
  <a href="https://github.com/cataarias368/devmind-agent/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/cataarias368/devmind-agent/ci.yml?branch=main" alt="CI"/>
  </a>
  <a href="https://github.com/cataarias368/devmind-agent">
    <img src="https://img.shields.io/github/languages/top/cataarias368/devmind-agent" alt="language"/>
  </a>
  <a href="https://github.com/cataarias368/devmind-agent/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/cataarias368/devmind-agent" alt="License"/>
  </a>
  <a href="https://github.com/cataarias368/devmind-agent/issues">
    <img src="https://img.shields.io/github/issues/cataarias368/devmind-agent" alt="Issues"/>
  </a>
</p>

---

## 🚀 ¿Qué es DevMind?

DevMind es un **agente de software autónomo** que puede planificar, ejecutar, probar, documentar y desplegar código sin intervención humana. Es como tener un equipo de desarrolladores junior 24/7, supervisado por un arquitecto senior.

### ✨ Características Principales

| Característica | Descripción |
|----------------|-------------|
| 🤖 **Agente Autónomo** | Planifica y ejecuta tareas de desarrollo sin supervisión |
| 🧠 **Multi-Agente** | 5 agentes especializados trabajando en paralelo |
| 🧬 **Auto-Mutation** | Motor de mutación con 5 estrategias y aprendizaje adaptativo (EMA) |
| 🤝 **A2A Protocol** | Comunicación agent-to-agent con descubrimiento por filesystem |
| 🔌 **Multi-Provider LLM** | Google, Mistral, Groq, OpenRouter, Cloudflare + GLM-4 fallback |
| 🎨 **Generación de Imágenes** | Íconos, diagramas, mockups con CogView |
| 🎬 **Generación de Video** | 100% propio: Canvas + Sharp + FFmpeg, estilo anime/procedural |
| 📚 **Documentación** | Genera MD/HTML/PDF automáticamente |
| 🧪 **Tests** | Unitarios, integración y E2E |
| 📊 **15 Módulos de Rendimiento** | Cache semántico, planificación dinámica, etc. |
| 🔌 **Plugins** | Extensible con herramientas personalizadas |
| 🌐 **Dashboard Web** | Interfaz gráfica para controlar el agente |
| 💬 **Bots** | Slack, Discord y Telegram |
| 🐙 **GitHub** | Issues, PRs y búsqueda de código |
| 🔒 **Protección Anti-Clon** | Identidad encriptada con SHA-256 y GPS integrado |
| 📢 **Monetización** | Anuncios no intrusivos y sistema de licencias |

---

## 📦 Instalación

```bash
# Clonar
git clone https://github.com/cataarias368/devmind-public.git
cd devmind-public

# Instalar dependencias
npm install

# Configurar API Key
cp .env.example .env
# Editar .env con tu GLM_API_KEY
```

## 🚀 Uso Rápido

```bash
# 1. Configurar API Key
export GLM_API_KEY="tu-id.tu-secreto"

# 2. Ejecutar tarea
devmind "Refactoriza el módulo de autenticación"

# 3. Dashboard web
devmind --dashboard

# 4. Documentación
devmind --docs ./src

# 5. Tests automáticos
devmind --test ./src --run

# 6. Health check
devmind --health

# 7. Ver identidad
devmind --whoami

# 8. Ver licencias
devmind --license-info
```

---

## 🎯 Comandos Disponibles

| Comando | Descripción |
|---------|-------------|
| `devmind "tarea"` | Ejecutar tarea con el agente |
| `devmind --dashboard` | Abrir dashboard web |
| `devmind --docs ./src` | Generar documentación |
| `devmind --test ./src` | Generar tests automáticos |
| `devmind --multi-agent` | Ejecutar multi-agente en paralelo |
| `devmind --bots` | Iniciar bots (Slack/Discord/Telegram) |
| `devmind --server` | Servidor API REST |
| `devmind --health` | Health check del sistema |
| `devmind --metrics` | Ver métricas de rendimiento |
| `devmind --suggest` | Sugerencias de mejora |
| `devmind --status` | Estado completo del sistema |
| `devmind --clear-cache` | Limpiar caché semántico |
| `devmind --ad-stats` | Estadísticas de publicidad |
| `devmind --video "idea"` | Generar video estilo anime/procedural |
| `devmind --video-anime "idea"` | Alias para --video |
| `devmind --api-check` | Verificar proveedores API disponibles |
| `devmind --api-default <id>` | Cambiar proveedor por defecto |
| `devmind --models` | Listar modelos LLM disponibles |
| `devmind --auto-mutate [tarea]` | Ejecutar con auto-mutación de modelo |
| `devmind --a2a` | Iniciar agente con protocolo A2A |
| `devmind --a2a-list` | Listar agentes A2A disponibles |
| `devmind --a2a-task [tarea]` | Orquestar equipo para tarea compleja |
| `devmind --whoami` | Ver identidad del propietario |
| `devmind --license-info` | Ver información de licencias |
| `devmind --claim <monto> <src>` | Reclamar ganancias |

---

## 🔒 Sistema de Identidad y Protección

DevMind incluye un sistema de identidad encriptada que protege contra clones no autorizados:

- **GPS Integrado**: La identidad del propietario está encriptada en el código con SHA-256
- **Anti-Clon**: Si alguien modifica los datos del propietario, la firma digital cambia y el sistema se bloquea
- **Control de Monetización**: Si se detecta una versión modificada, la publicidad se redirige al propietario original
- **Comando `--whoami`**: Permite verificar la identidad del software en cualquier momento

---

## 📜 Licencias

| Plan | Precio | Descripción |
|------|--------|-------------|
| Community | Gratis (AGPLv3) | Uso personal, educativo y open source |
| Pro | $19/mes | Sin anuncios, modelos premium, generación ilimitada |
| Enterprise | $99/mes | Privacidad total, soporte 24/7, on-premise |

📧 Contacto comercial: cataarias368@gmail.com

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DEV MIND AGENT v3.0                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │   Cliente    │  │  Dashboard  │  │    Bots     │                │
│  │   (CLI)      │  │   (Web)     │  │ (Slack/Disc)│                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                         │
│         └────────────────┼────────────────┘                         │
│                          ▼                                          │
│                  ┌───────────────┐                                  │
│                  │   API REST    │                                  │
│                  │  (Express)    │                                  │
│                  └───────┬───────┘                                  │
│                          │                                          │
│                          ▼                                          │
│                  ┌───────────────┐                                  │
│                  │    Agente     │                                  │
│                  │   (Core)      │                                  │
│                  └───────┬───────┘                                  │
│                          │                                          │
│        ┌─────────────────┼─────────────────┐                       │
│        ▼                 ▼                 ▼                       │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐                  │
│  │   LLM     │    │  Tools    │    │  Memory   │                  │
│  │ (GLM-4 +  │    │ (File,    │    │ (Cort     │                  │
│  │  Router)  │    │  Comandos)│    │  Plazo/   │                  │
│  └───────────┘    └───────────┘    │  Episódica)│                  │
│                                    └───────────┘                  │
│                          │                                          │
│        ┌─────────────────┼─────────────────┐                       │
│        ▼                 ▼                 ▼                       │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐                  │
│  │   Core    │    │Auto-Mutate│    │   A2A     │                  │
│  │ Identidad │    │   (EMA)   │    │ Protocol  │                  │
│  │(Protecc.) │    └───────────┘    └───────────┘                  │
│  └───────────┘                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🤝 Contribución

1. Fork el repositorio
2. Crea tu rama (`git checkout -b feature/amazing`)
3. Commit (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing`)
5. Abre un Pull Request

---

## 📄 Licencia

AGPLv3 © [Jose Luis Arias Casco](https://github.com/cataarias368)

---

<p align="center">
  Made with ❤️ by Jose Luis Arias Casco
</p>
