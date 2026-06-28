import { BandState } from '../audio/types';

export class VisualEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private state: BandState;
  private pulses: { radius: number; alpha: number; color: string }[] = [];
  private particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];

  constructor(canvas: HTMLCanvasElement, state: BandState) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.state = state;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.render();
  }

  private resize() {
    const parent = this.canvas.parentElement;
    this.width = this.canvas.width = parent ? parent.clientWidth : window.innerWidth;
    this.height = this.canvas.height = parent ? parent.clientHeight : window.innerHeight;
  }

  public addPulse(color: string = '#22d3ee') {
    this.pulses.push({ radius: 0, alpha: 1, color });
  }

  public addParticles(x: number, y: number, count: number, color: string = '#22d3ee') {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1,
        color,
      });
    }
  }

  private render = () => {
    this.ctx.fillStyle = `rgba(5, 8, 16, ${0.1 + this.state.chaos * 0.2})`;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.pulses.forEach((p, i) => {
      this.ctx.beginPath();
      this.ctx.arc(this.width / 2, this.height / 2, p.radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = p.color;
      this.ctx.globalAlpha = p.alpha;
      this.ctx.lineWidth = 2 + this.state.chaos * 10;
      this.ctx.stroke();
      p.radius += 5 + this.state.chaos * 10;
      p.alpha -= 0.02;
      if (p.alpha <= 0) this.pulses.splice(i, 1);
    });

    this.particles.forEach((p, i) => {
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.life;
      this.ctx.fill();
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.02;
      if (p.life <= 0) this.particles.splice(i, 1);
    });

    this.ctx.globalAlpha = 1;

    if (this.state.chaos > 0.6 && Math.random() > 0.9) {
      this.applyGlitch();
    }

    requestAnimationFrame(this.render);
  };

  private applyGlitch() {
    const x = Math.random() * this.width;
    const y = Math.random() * this.height;
    const w = Math.random() * 200;
    const h = Math.random() * 50;
    const dx = (Math.random() - 0.5) * 50;
    const dy = (Math.random() - 0.5) * 50;

    const imgData = this.ctx.getImageData(x, y, w, h);
    this.ctx.putImageData(imgData, x + dx, y + dy);
  }

  public updateState(newState: Partial<BandState>) {
    this.state = { ...this.state, ...newState };
  }
}
