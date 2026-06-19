// ============================================================
// src/video/script-generator.ts - Genera guiones con GLM-4
// ============================================================

import type { GLM47Provider } from '../llm-provider.js';
import type { SceneData } from './scene-composer.js';

interface VideoScript {
  title: string;
  scenes: SceneData[];
}

/**
 * ScriptGenerator usa GLM-4 para convertir una idea textual
 * en un guion estructurado de 3-5 escenas con fondos, personajes
 * y diálogos listos para ser dibujados por SceneComposer.
 */
export class ScriptGenerator {
  private llm: GLM47Provider;

  constructor(llm: GLM47Provider) {
    this.llm = llm;
  }

  async generate(idea: string): Promise<VideoScript> {
    const prompt = `Eres un director de anime. Convierte esta idea en un guion de 3-5 escenas.

Idea: "${idea}"

Para cada escena, especifica:
- Título corto
- Fondo (city, classroom, space, forest, office, castle)
- Personajes (máximo 2) con posición (left, center, right) y expresión
- Diálogo o texto a mostrar (máximo 200 caracteres)
- Estilo visual (ghibli, cyberpunk, shonen) según la temática

Responde EN FORMATO JSON válido, sin markdown ni texto adicional:

{
  "title": "Título de la historia",
  "scenes": [
    {
      "title": "Título de la escena",
      "background": "city",
      "characters": [
        { "name": "Sensei", "position": "center", "expression": "happy" }
      ],
      "text": "Dialogo de la escena",
      "style": "ghibli"
    }
  ]
}`;

    const response = await this.llm.call([{ role: 'user', content: prompt }]);
    const content = response.choices[0]?.message?.content || '';

    // Extraer JSON de la respuesta
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No se pudo parsear el guion del LLM. La respuesta no contiene JSON válido.');
    }

    try {
      const script = JSON.parse(jsonMatch[0]) as VideoScript;

      // Validar que tenga al menos 1 escena
      if (!script.scenes || script.scenes.length === 0) {
        throw new Error('El guion no contiene escenas');
      }

      // Normalizar campos enum
      for (const scene of script.scenes) {
        const validBackgrounds = ['city', 'classroom', 'space', 'forest', 'office', 'castle'];
        if (!validBackgrounds.includes(scene.background)) {
          scene.background = 'city';
        }
        const validStyles = ['ghibli', 'cyberpunk', 'shonen'];
        if (!validStyles.includes(scene.style)) {
          scene.style = 'ghibli';
        }
        const validPositions = ['left', 'center', 'right'];
        for (const char of scene.characters) {
          if (!validPositions.includes(char.position)) {
            char.position = 'center';
          }
        }
      }

      return script;
    } catch (parseErr) {
      throw new Error(`Error parseando guion JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
    }
  }
}
