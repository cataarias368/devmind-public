// ============================================================
// src/video/scene-composer.ts - Compone escenas con Canvas vectorial
// ============================================================

import { createCanvas, type Canvas, type CanvasRenderingContext2D } from 'canvas';

export interface SceneData {
  title: string;
  background: 'city' | 'classroom' | 'space' | 'forest' | 'office' | 'castle';
  characters: Array<{ name: string; position: 'left' | 'center' | 'right'; expression: string }>;
  text: string;
  style: 'ghibli' | 'cyberpunk' | 'shonen';
}

/**
 * SceneComposer dibuja escenas estilo anime usando Canvas.
 * Cada escena contiene: fondo temático, personajes con estilo anime,
 * burbuja de diálogo y título.
 */
export class SceneComposer {
  private width: number;
  private height: number;
  private canvas: Canvas;
  private ctx: CanvasRenderingContext2D;

  constructor(width = 1280, height = 720) {
    this.width = width;
    this.height = height;
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext('2d');
  }

  async composeScene(sceneData: SceneData): Promise<Buffer> {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground(sceneData.background, sceneData.style);
    for (const char of sceneData.characters) {
      this.drawCharacter(char, sceneData.style);
    }
    this.drawDialogue(sceneData.text, sceneData.style);
    this.drawTitle(sceneData.title, sceneData.style);
    return this.canvas.toBuffer('image/png');
  }

  // --- Fondos ---

  private drawBackground(type: string, _style: string): void {
    const backgrounds: Record<string, () => void> = {
      city: () => this.drawCityBackground(),
      classroom: () => this.drawClassroomBackground(),
      space: () => this.drawSpaceBackground(),
      forest: () => this.drawForestBackground(),
      office: () => this.drawOfficeBackground(),
      castle: () => this.drawCastleBackground(),
    };
    (backgrounds[type] || backgrounds.city)();
  }

  private drawCityBackground(): void {
    const grad = this.ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(0.5, '#16213e');
    grad.addColorStop(1, '#0f3460');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.width, this.height);

    for (let i = 0; i < 25; i++) {
      const x = Math.random() * this.width;
      const w = 30 + Math.random() * 70;
      const h = 50 + Math.random() * 250;
      this.ctx.fillStyle = `rgba(30, 40, 60, ${0.4 + Math.random() * 0.3})`;
      this.ctx.fillRect(x, this.height - h, w, h);
      for (let y = this.height - h + 15; y < this.height - 15; y += 25) {
        for (let x2 = x + 8; x2 < x + w - 8; x2 += 18) {
          this.ctx.fillStyle = Math.random() > 0.4
            ? `rgba(255, 200, 100, ${0.5 + Math.random() * 0.5})`
            : 'rgba(50, 50, 70, 0.3)';
          this.ctx.fillRect(x2, y, 8, 12);
        }
      }
    }

    this.ctx.beginPath();
    this.ctx.arc(this.width - 150, 100, 50, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(255, 240, 200, 0.8)';
    this.ctx.fill();
    this.ctx.shadowColor = 'rgba(255, 240, 200, 0.3)';
    this.ctx.shadowBlur = 30;
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
  }

  private drawClassroomBackground(): void {
    this.ctx.fillStyle = '#f5e6d3';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = '#2d3a3a';
    this.ctx.fillRect(100, 60, this.width - 200, 220);
    this.ctx.strokeStyle = '#8B7355';
    this.ctx.lineWidth = 8;
    this.ctx.strokeRect(100, 60, this.width - 200, 220);
    for (let i = 0; i < 4; i++) {
      const x = 150 + i * 280;
      this.ctx.fillStyle = '#c4a882';
      this.ctx.fillRect(x, 380, 160, 25);
      this.ctx.fillRect(x + 30, 405, 20, 45);
      this.ctx.fillRect(x + 110, 405, 20, 45);
    }
    this.ctx.fillStyle = '#8fc5e9';
    this.ctx.fillRect(this.width - 180, 60, 120, 150);
    this.ctx.strokeStyle = '#8B7355';
    this.ctx.lineWidth = 6;
    this.ctx.strokeRect(this.width - 180, 60, 120, 150);
    this.ctx.beginPath();
    this.ctx.moveTo(this.width - 120, 60);
    this.ctx.lineTo(this.width - 120, 210);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(this.width - 180, 135);
    this.ctx.lineTo(this.width - 60, 135);
    this.ctx.stroke();
  }

  private drawSpaceBackground(): void {
    this.ctx.fillStyle = '#0a0a1a';
    this.ctx.fillRect(0, 0, this.width, this.height);
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * this.width;
      const y = Math.random() * this.height;
      const r = Math.random() * 2.5 + 0.5;
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
      this.ctx.fill();
    }
    const grad = this.ctx.createRadialGradient(200, 200, 50, 200, 200, 300);
    grad.addColorStop(0, 'rgba(100, 50, 200, 0.15)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawForestBackground(): void {
    const grad = this.ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#87CEEB');
    grad.addColorStop(0.6, '#98D8C8');
    grad.addColorStop(1, '#2d5a27');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.width, this.height);
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * this.width;
      const h = 100 + Math.random() * 200;
      this.ctx.fillStyle = '#5d4037';
      this.ctx.fillRect(x - 5, this.height - h, 10, h);
      this.ctx.beginPath();
      this.ctx.arc(x, this.height - h - 40, 40 + Math.random() * 30, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(34, 120, 50, ${0.6 + Math.random() * 0.4})`;
      this.ctx.fill();
    }
  }

  private drawOfficeBackground(): void {
    this.ctx.fillStyle = '#e8e0d8';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = '#8B7355';
    this.ctx.fillRect(100, 400, this.width - 200, 40);
    this.ctx.fillStyle = '#2d2d2d';
    this.ctx.fillRect(this.width / 2 - 80, 280, 160, 120);
    this.ctx.fillStyle = '#4a90d9';
    this.ctx.fillRect(this.width / 2 - 70, 290, 140, 100);
    this.ctx.fillStyle = '#3d3d3d';
    this.ctx.fillRect(this.width / 2 - 60, 410, 120, 20);
    this.ctx.fillStyle = '#4a4a4a';
    this.ctx.fillRect(this.width / 2 - 30, 450, 60, 80);
    this.ctx.fillRect(this.width / 2 - 50, 530, 100, 20);
  }

  private drawCastleBackground(): void {
    this.ctx.fillStyle = '#87CEEB';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = '#b8a088';
    this.ctx.fillRect(300, 200, 680, 520);
    for (let i = 0; i < 4; i++) {
      const x = 300 + i * 220;
      this.ctx.fillRect(x, 100, 60, 100);
      for (let j = 0; j < 5; j++) {
        this.ctx.fillRect(x + j * 12, 100, 8, 20);
      }
    }
    this.ctx.fillStyle = '#5d4037';
    this.ctx.beginPath();
    this.ctx.arc(640, 500, 60, 0, Math.PI);
    this.ctx.fill();
    this.ctx.fillStyle = '#ffd700';
    for (let i = 0; i < 6; i++) {
      this.ctx.fillRect(360 + i * 100, 280, 30, 40);
    }
  }

  // --- Personajes ---

  private drawCharacter(char: SceneData['characters'][0], style: string): void {
    const positions: Record<string, { x: number; y: number }> = {
      left: { x: this.width * 0.25, y: this.height * 0.6 },
      center: { x: this.width * 0.5, y: this.height * 0.6 },
      right: { x: this.width * 0.75, y: this.height * 0.6 },
    };
    const pos = positions[char.position] || positions.center;
    const { x, y } = pos;

    // Sombra
    this.ctx.beginPath();
    this.ctx.ellipse(x, y + 40, 50, 15, 0, 0, Math.PI * 2);
    this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
    this.ctx.fill();

    // Cuerpo
    this.ctx.beginPath();
    this.roundRect(x - 35, y - 40, 70, 90, 15);
    this.ctx.fillStyle = style === 'cyberpunk' ? '#1a1a3e' : '#4a6fa5';
    this.ctx.fill();
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Brazos
    this.ctx.fillStyle = style === 'cyberpunk' ? '#1a1a3e' : '#4a6fa5';
    this.ctx.fillRect(x - 55, y - 30, 20, 50);
    this.ctx.fillRect(x + 35, y - 30, 20, 50);

    // Cabeza
    this.ctx.beginPath();
    this.ctx.arc(x, y - 100, 55, 0, Math.PI * 2);
    this.ctx.fillStyle = style === 'cyberpunk' ? '#f0d4c0' : '#f5e6d3';
    this.ctx.fill();
    this.ctx.strokeStyle = '#333';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Ojos
    this.drawAnimeEyes(x, y - 110, style);

    // Boca
    this.ctx.beginPath();
    this.ctx.arc(x, y - 85, 12, 0.1, Math.PI - 0.1);
    this.ctx.strokeStyle = '#c0392b';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Cabello
    this.drawAnimeHair(x, y - 155, style);

    // Accesorios cyberpunk
    if (style === 'cyberpunk') {
      this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
      this.ctx.fillRect(x - 45, y - 120, 35, 20);
      this.ctx.fillRect(x + 10, y - 120, 35, 20);
      this.ctx.fillRect(x - 10, y - 118, 20, 16);
    }
  }

  private drawAnimeEyes(x: number, y: number, style: string): void {
    const eyeSize = 28;
    const irisColor = style === 'cyberpunk' ? '#4a90d9' : '#8B4513';

    for (const dx of [-25, 25]) {
      this.ctx.beginPath();
      this.ctx.ellipse(x + dx, y, eyeSize, eyeSize * 1.2, 0, 0, Math.PI * 2);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fill();
      this.ctx.strokeStyle = '#333';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.arc(x + dx, y + 5, 13, 0, Math.PI * 2);
      this.ctx.fillStyle = irisColor;
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.arc(x + dx, y + 3, 5, 0, Math.PI * 2);
      this.ctx.fillStyle = '#000000';
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.arc(x + dx + 5, y - 3, 3, 0, Math.PI * 2);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fill();
    }
  }

  private drawAnimeHair(x: number, y: number, style: string): void {
    const hairColor = style === 'cyberpunk' ? '#ff00ff' : '#4a2c1a';
    const secondaryHair = style === 'cyberpunk' ? '#ff66ff' : '#6a3c2a';

    this.ctx.beginPath();
    this.ctx.arc(x, y, 65, Math.PI, 2 * Math.PI);
    this.ctx.fillStyle = hairColor;
    this.ctx.fill();

    for (let i = -4; i <= 4; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x + i * 18, y + 10);
      this.ctx.quadraticCurveTo(x + i * 22, y - 25, x + i * 14, y - 55);
      this.ctx.strokeStyle = secondaryHair;
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
    }

    this.ctx.beginPath();
    this.ctx.moveTo(x - 60, y - 30);
    this.ctx.quadraticCurveTo(x - 80, y - 10, x - 65, y + 20);
    this.ctx.strokeStyle = secondaryHair;
    this.ctx.lineWidth = 4;
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(x + 60, y - 30);
    this.ctx.quadraticCurveTo(x + 80, y - 10, x + 65, y + 20);
    this.ctx.strokeStyle = secondaryHair;
    this.ctx.lineWidth = 4;
    this.ctx.stroke();
  }

  // --- Diálogo ---

  private drawDialogue(text: string, style: string): void {
    const boxWidth = this.width * 0.8;
    const boxHeight = 100;
    const x = (this.width - boxWidth) / 2;
    const y = this.height - boxHeight - 30;

    this.ctx.beginPath();
    this.roundRect(x, y, boxWidth, boxHeight, 20);
    this.ctx.fillStyle = style === 'cyberpunk' ? 'rgba(20, 20, 50, 0.9)' : 'rgba(255, 255, 255, 0.9)';
    this.ctx.fill();
    this.ctx.strokeStyle = style === 'cyberpunk' ? '#4a90d9' : '#333';
    this.ctx.lineWidth = 3;
    this.ctx.stroke();

    // Triángulo
    this.ctx.beginPath();
    this.ctx.moveTo(x + 50, y + boxHeight);
    this.ctx.lineTo(x + 70, y + boxHeight + 25);
    this.ctx.lineTo(x + 90, y + boxHeight);
    this.ctx.closePath();
    this.ctx.fillStyle = style === 'cyberpunk' ? 'rgba(20, 20, 50, 0.9)' : 'rgba(255, 255, 255, 0.9)';
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = style === 'cyberpunk' ? '#00ffcc' : '#333';
    this.ctx.font = 'bold 28px "Segoe UI", sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.wrapText(text, x + boxWidth / 2, y + boxHeight / 2, boxWidth - 80, 35);
  }

  private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number): void {
    const words = text.split(' ');
    let line = '';
    const lines: string[] = [];
    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = this.ctx.measureText(testLine);
      if (metrics.width > maxWidth && line.length > 0) {
        lines.push(line);
        line = word + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    const totalHeight = lines.length * lineHeight;
    const startY = y - totalHeight / 2 + lineHeight / 2;
    for (let i = 0; i < lines.length; i++) {
      this.ctx.fillText(lines[i], x, startY + i * lineHeight);
    }
  }

  // --- Título ---

  private drawTitle(title: string, style: string): void {
    this.ctx.fillStyle = style === 'cyberpunk' ? '#00ffcc' : '#fff';
    this.ctx.font = 'bold 52px "Segoe UI", sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';
    this.ctx.shadowColor = 'rgba(0,0,0,0.8)';
    this.ctx.shadowBlur = 10;
    this.ctx.fillText(title, this.width / 2, 15);
    this.ctx.shadowBlur = 0;

    this.ctx.fillStyle = style === 'cyberpunk' ? 'rgba(0, 255, 204, 0.5)' : 'rgba(255,255,255,0.3)';
    this.ctx.font = '20px "Segoe UI", sans-serif';
    this.ctx.fillText('DevMind Studio', this.width / 2, 75);
  }

  // --- Utilidades ---

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }
}
