#!/bin/bash
# ============================================================
# scripts/update-from-master.sh
# Actualiza el submodulo Master en el repositorio publico
# ============================================================

echo "🔄 Actualizando desde el repositorio Master..."

# 1. Actualizar submodulo
git submodule update --remote src/core

# 2. Verificar cambios
if git diff --quiet; then
  echo "✅ No hay cambios en el Master"
else
  echo "📦 Cambios detectados en el Master"
  git add .
  git commit -m "chore: actualizar submodulo Master"
  git push origin main
  echo "✅ Repositorio publico actualizado"
fi
