# 🧠 DevMind Agent

<p align="center">
  <img src="https://devmind.ai/logo.png" alt="DevMind Logo" width="200"/>
</p>

<h3 align="center">Autonomous Software Engineering Suite</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/devmind-agent">
    <img src="https://img.shields.io/npm/v/devmind-agent.svg" alt="npm version"/>
  </a>
  <a href="https://github.com/cataarias368/devmind-agent/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/cataarias368/devmind-agent/ci.yml" alt="CI"/>
  </a>
  <a href="https://codecov.io/gh/cataarias368/devmind-agent">
    <img src="https://img.shields.io/codecov/c/github/cataarias368/devmind-agent" alt="Coverage"/>
  </a>
  <a href="https://github.com/cataarias368/devmind-agent/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-AGPLv3-blue.svg" alt="License"/>
  </a>
  <a href="https://discord.gg/devmind">
    <img src="https://img.shields.io/discord/1234567890" alt="Discord"/>
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
| 🎨 **Generación de Imágenes** | Íconos, diagramas, mockups con CogView |
| 📚 **Documentación** | Genera MD/HTML/PDF automáticamente |
| 🧪 **Tests** | Unitarios, integración y E2E con Playwright |
| 📊 **15 Módulos de Rendimiento** | Cache semántico, planificación dinámica, etc. |
| 🔌 **Plugins** | Extensible con herramientas personalizadas |
| 🌐 **Dashboard Web** | Interfaz gráfica para controlar el agente |
| 💬 **Bots** | Slack, Discord y Telegram |
| 🐙 **GitHub** | Issues, PRs y búsqueda de código |
| 📢 **Monetización** | Anuncios no intrusivos y suscripciones |

---

## 📦 Instalación

```bash
# Clonar
git clone https://github.com/cataarias368/devmind-agent.git
cd devmind-agent

# Instalar dependencias
npm install

# Configurar API Key
cp .env.example .env
# Editar .env con tu GLM_API_KEY

# O instalar globalmente
npm install -g devmind-agent
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

---

## 🧠 15 Módulos de Rendimiento

| Módulo | Qué hace |
|--------|----------|
| Compresión de Contexto | Resume mensajes viejos para ahorrar tokens |
| Ventana Deslizante | Mantiene solo los 100 mensajes más relevantes |
| Priorización de Tools | Ordena herramientas según la tarea |
| Caché Semántico | Reutiliza respuestas de queries similares |
| Memoria Corto Plazo | Recuerda las últimas 20 acciones |
| Memoria Episódica | Busca tareas similares ya resueltas |
| Anticipación de Pasos | Predice los próximos 3 pasos |
| Planificación Dinámica | Se adapta si un paso falla |
| Batch Processing | Agrupa operaciones similares |
| Autoevaluación | Mide su propia performance |
| Sugerencias | Recomienda mejoras automáticas |
| Ejecución Paralela | Tareas independientes en paralelo |
| Pipeline Paralelo | Etapas con procesamiento paralelo |
| Health Check | Verifica que todo funcione |
| Alertas | Notifica problemas por consola y Slack |

---

## 🔌 Plugins

DevMind es extensible mediante plugins con sistema de permisos granular.

### Ejemplo de Plugin

```typescript
// plugins/my-plugin.ts
export default {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'Mi plugin personalizado',
  
  permissions: ['read:files', 'write:temp'],
  
  tools: [
    {
      name: 'deploy_to_aws',
      description: 'Despliega el proyecto a AWS',
      parameters: {
        type: 'object',
        properties: {
          region: { type: 'string' },
          env: { type: 'string' }
        },
        required: ['region']
      },
      handler: async (args, core, permissions) => {
        return `Desplegando a ${args.region}...`;
      }
    }
  ],
  
  onLoad: (core) => {
    console.log('Plugin cargado correctamente');
  }
};
```

### Sistema de Permisos

| Permiso | Descripción |
|---------|-------------|
| `read:files` | Leer archivos del workspace |
| `write:files` | Escribir archivos del workspace |
| `write:temp` | Escribir en archivos temporales |
| `execute:command` | Ejecutar comandos del sistema |
| `execute:npm` | Ejecutar comandos npm |
| `execute:git` | Ejecutar comandos git |
| `network:http` | Hacer peticiones HTTP |
| `network:https` | Hacer peticiones HTTPS |
| `storage:memory` | Leer/escribir memoria persistente |
| `storage:persistent` | Leer/escribir almacenamiento persistente |

---

## 📊 Benchmarks vs Competencia

| Herramienta | Autonomía | Multi-Agente | Memoria | Imágenes | Docs | Plugins | Precio |
|-------------|-----------|--------------|---------|----------|------|---------|--------|
| **DevMind** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **$0-$99/mes** |
| Claude Code | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | $20/mes |
| Cursor | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | $20/mes |
| Devin | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | $500/mes |
| Copilot | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | $10/mes |

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DEV MIND AGENT                             │
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
│  │ (GLM-4)   │    │ (File,    │    │ (Cort     │                  │
│  └───────────┘    │  Comandos)│    │  Plazo/   │                  │
│                   └───────────┘    │  Episódica)│                  │
│                                    └───────────┘                  │
│                          │                                          │
│                          ▼                                          │
│                  ┌───────────────┐                                  │
│                  │  Rendimiento  │                                  │
│                  │  (15 Módulos) │                                  │
│                  └───────────────┘                                  │
│                                                                     │
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

AGPLv3 © [Cata Arias](https://github.com/cataarias368)

---

<p align="center">
  Made with ❤️ by Cata Arias
</p>
