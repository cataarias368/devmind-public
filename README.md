# 🧠 DevMind Agent — Open Source Edition

<p align="center">
  <img src="https://devmind.ai/logo.png" alt="DevMind Logo" width="200"/>
</p>

<h3 align="center">Autonomous Software Engineering Suite</h3>

<p align="center">
  <a href="https://github.com/cataarias368/devmind-agent/releases">
    <img src="https://img.shields.io/github/v/release/cataarias368/devmind-agent?include_prereleases&label=version" alt="version"/>
  </a>
  <a href="https://github.com/cataarias368/devmind-agent/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/cataarias368/devmind-agent/ci.yml?branch=main" alt="CI"/>
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

DevMind es un **agente de software autónomo** que puede planificar, ejecutar, probar, documentar y desplegar código sin intervención humana. Funciona como un equipo de desarrolladores 24/7, supervisado por un arquitecto senior.

### ✨ Características Principales

| Característica | Descripción |
|----------------|-------------|
| 🤖 **Agente Autónomo** | Planifica y ejecuta tareas de desarrollo sin supervisión |
| 🧠 **Multi-Agente** | 5 agentes especializados trabajando en paralelo |
| 🧬 **Auto-Mutation** | Motor de mutación con 5 estrategias y aprendizaje adaptativo |
| 🤝 **A2A Protocol** | Comunicación agent-to-agent con descubrimiento |
| 🔌 **Multi-Provider LLM** | Google, Mistral, Groq, OpenRouter, Cloudflare + GLM-4 fallback |
| 🎨 **Generación de Imágenes** | Íconos, diagramas, mockups con CogView |
| 🎬 **Generación de Video** | 100% propio: Canvas + Sharp + FFmpeg |
| 📚 **Documentación** | Genera MD/HTML/PDF automáticamente |
| 🧪 **Tests** | Unitarios, integración y E2E |
| 📊 **15 Módulos de Rendimiento** | Cache semántico, planificación dinámica, etc. |
| 🔒 **Protección Anti-Clon** | Identidad encriptada con GPS integrado |

---

## 📦 Instalación

```bash
# 1. Clonar el repositorio público
git clone https://github.com/cataarias368/devmind-public.git
cd devmind-public

# 2. Inicializar el submódulo Master
git submodule update --init --recursive

# 3. Instalar dependencias
npm install

# 4. Configurar
cp .env.example .env
# Editar .env con tu GLM_API_KEY
```

## 🚀 Uso

```bash
# Ejecutar una tarea
devmind "Refactoriza el módulo de autenticación"

# Ver identidad del proyecto
devmind --whoami

# Información de licencias
devmind --license

# Reclamar ganancias
devmind --claim 100 "publicidad"
```

## 🔗 Dependencias

Este repositorio público depende del **repositorio Master** para su funcionalidad completa:

🔗 **https://github.com/cataarias368/devmind-agent**

El Master contiene:
- ✅ Sistema de identidad encriptada
- ✅ GPS y checkpoints de integridad
- ✅ Sistema de monetización y publicidad
- ✅ Módulos de rendimiento completos
- ✅ Agente autónomo completo

## 🏗️ Arquitectura de Repositorios

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CAPA 1: REPOSITORIO MASTER (PRIVADO)                   │
│                    github.com/cataarias368/devmind-agent                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ✅ Código completo con identidad encriptada                              │
│  ✅ Sistema de GPS y checkpoints                                          │
│  ✅ Control de monetización (publicidad, licencias)                       │
│  ✅ Solo el propietario tiene acceso de escritura                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ (submódulo)
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CAPA 2: REPOSITORIO PÚBLICO (ESTE REPO)                │
│                    github.com/cataarias368/devmind-public                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ✅ Código open source que carga el Master                                │
│  ✅ Sin datos sensibles visibles                                          │
│  ✅ Depende del Master para funcionar                                     │
│  ✅ La comunidad puede contribuir                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 📜 Licencia

DevMind es AGPLv3. El código completo y el sistema de identidad residen en el repositorio Master.

| Plan | Precio | Descripción |
|------|--------|-------------|
| Community | Gratis | Uso personal, educativo y open source |
| Pro | $19/mes | Sin anuncios, modelos premium, generación ilimitada |
| Enterprise | $99/mes | Privacidad total, soporte 24/7, on-premise |

## 📧 Contacto

**Creador:** José Luis Arias Casco
**Correo:** cataarias368@gmail.com
**GitHub:** https://github.com/cataarias368

---

<p align="center">
  Made with ❤️ by José Luis Arias Casco
</p>
