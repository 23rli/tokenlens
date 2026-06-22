import { useEffect, useRef } from 'react';
import type { PetWorldState } from '@ecoprompt/shared-types';

interface WorldRendererProps {
  petState: PetWorldState;
  health: number;
  /** Logical height in CSS pixels. Width fills the container. */
  height?: number;
}

interface Palette {
  skyTop: string;
  skyBottom: string;
  ground: string;
  groundShadow: string;
  plant: string;
  body: string;
  bodyDark: string;
}

const PALETTES: Record<PetWorldState, Palette> = {
  thriving: {
    skyTop: '#7be0ff',
    skyBottom: '#d8fff0',
    ground: '#3fbf6b',
    groundShadow: '#2f9d54',
    plant: '#2e8b57',
    body: '#37d67a',
    bodyDark: '#1f9d57',
  },
  healthy: {
    skyTop: '#9fe0ff',
    skyBottom: '#e6ffe6',
    ground: '#5fb85f',
    groundShadow: '#479647',
    plant: '#3f8f3f',
    body: '#7ed957',
    bodyDark: '#5cb33a',
  },
  concerned: {
    skyTop: '#cfe0d8',
    skyBottom: '#f3eede',
    ground: '#a3a35a',
    groundShadow: '#86863f',
    plant: '#9a9a4a',
    body: '#f1c40f',
    bodyDark: '#c9a40b',
  },
  critical: {
    skyTop: '#d8b89a',
    skyBottom: '#efd9c2',
    ground: '#9c7a4f',
    groundShadow: '#7e6240',
    plant: '#8a6a3f',
    body: '#f39c12',
    bodyDark: '#c47f0e',
  },
  collapse: {
    skyTop: '#caa39a',
    skyBottom: '#e3c4bd',
    ground: '#86614f',
    groundShadow: '#6a4c3e',
    plant: '#6f5040',
    body: '#e74c3c',
    bodyDark: '#b93b2e',
  },
  dead: {
    skyTop: '#9aa0a3',
    skyBottom: '#c3c8cb',
    ground: '#7f8c8d',
    groundShadow: '#65706f',
    plant: '#5d6566',
    body: '#8b9698',
    bodyDark: '#6e797a',
  },
};

const STATE_RANK: Record<PetWorldState, number> = {
  thriving: 5,
  healthy: 4,
  concerned: 3,
  critical: 2,
  collapse: 1,
  dead: 0,
};

function roundedBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const r = Math.min(w, h) / 2;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + r, y - h / 2);
  ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
  ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
  ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
  ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
  ctx.closePath();
}

function drawPlant(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  scale: number,
  rank: number,
  color: string,
  sway: number,
): void {
  const dead = rank <= 1;
  const height = 22 * scale * (dead ? 0.5 : 1);
  const tipX = x + sway * (dead ? 2 : 6);
  const tipY = baseY - height;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + sway * 3, baseY - height / 2, tipX, tipY);
  ctx.stroke();

  if (dead) return;

  // Leaves
  ctx.fillStyle = color;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(
      x + dir * 5 * scale,
      baseY - height * 0.55,
      5 * scale,
      2.6 * scale,
      dir * 0.6,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  // Flower / bud for the healthiest states
  if (rank >= 4) {
    ctx.fillStyle = rank >= 5 ? '#ffd166' : '#fff3b0';
    ctx.beginPath();
    ctx.arc(tipX, tipY, 3.4 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGuardian(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  state: PetWorldState,
  pal: Palette,
  t: number,
): void {
  const rank = STATE_RANK[state];
  const bob = Math.sin(t / 600) * (rank >= 4 ? 4 : rank >= 2 ? 2 : 0.6);
  const y = cy + bob;
  const w = size;
  const h = size * 1.05;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + h / 2 + 8, w * 0.42, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  const grad = ctx.createLinearGradient(cx, y - h / 2, cx, y + h / 2);
  grad.addColorStop(0, pal.body);
  grad.addColorStop(1, pal.bodyDark);
  ctx.fillStyle = grad;
  roundedBlob(ctx, cx, y, w, h);
  ctx.fill();

  // Cheeks (happy states)
  if (rank >= 4) {
    ctx.fillStyle = 'rgba(255,120,120,0.45)';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + dir * w * 0.26, y + h * 0.08, w * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Eyes
  const eyeY = y - h * 0.08;
  const eyeDX = w * 0.2;
  const eyeR = w * 0.07;
  ctx.strokeStyle = '#1c2b2b';
  ctx.fillStyle = '#1c2b2b';
  ctx.lineWidth = Math.max(2, w * 0.03);
  if (state === 'dead') {
    // X eyes
    for (const dir of [-1, 1]) {
      const ex = cx + dir * eyeDX;
      ctx.beginPath();
      ctx.moveTo(ex - eyeR, eyeY - eyeR);
      ctx.lineTo(ex + eyeR, eyeY + eyeR);
      ctx.moveTo(ex + eyeR, eyeY - eyeR);
      ctx.lineTo(ex - eyeR, eyeY + eyeR);
      ctx.stroke();
    }
  } else {
    const blink = Math.sin(t / 1400) > 0.96 && rank >= 2;
    for (const dir of [-1, 1]) {
      const ex = cx + dir * eyeDX;
      if (blink) {
        ctx.beginPath();
        ctx.moveTo(ex - eyeR, eyeY);
        ctx.lineTo(ex + eyeR, eyeY);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex - eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1c2b2b';
      }
    }
  }

  // Mouth — curvature by mood
  const mouthY = y + h * 0.16;
  const mouthW = w * 0.26;
  ctx.lineWidth = Math.max(2, w * 0.035);
  ctx.strokeStyle = '#1c2b2b';
  ctx.beginPath();
  if (rank >= 4) {
    ctx.arc(cx, mouthY - mouthW * 0.3, mouthW, 0.15 * Math.PI, 0.85 * Math.PI);
  } else if (rank === 3) {
    ctx.moveTo(cx - mouthW, mouthY);
    ctx.lineTo(cx + mouthW, mouthY);
  } else if (state !== 'dead') {
    ctx.arc(cx, mouthY + mouthW * 0.6, mouthW, 1.15 * Math.PI, 1.85 * Math.PI);
  } else {
    ctx.moveTo(cx - mouthW * 0.7, mouthY + 2);
    ctx.lineTo(cx + mouthW * 0.7, mouthY + 2);
  }
  ctx.stroke();

  // Sweat drop for distressed states
  if (rank === 1 || rank === 2) {
    ctx.fillStyle = 'rgba(120,180,255,0.85)';
    const sx = cx + w * 0.32;
    const sy = y - h * 0.18 + Math.sin(t / 300) * 2;
    ctx.beginPath();
    ctx.arc(sx, sy, w * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function WorldRenderer({ petState, health, height = 200 }: WorldRendererProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Mutable refs so the animation loop always reads the latest props.
  const stateRef = useRef(petState);
  const healthRef = useRef(health);
  stateRef.current = petState;
  healthRef.current = health;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const particles = Array.from({ length: 26 }, () => ({
      x: Math.random(),
      y: Math.random(),
      speed: 0.2 + Math.random() * 0.6,
      r: 1 + Math.random() * 2,
    }));

    const render = (t: number): void => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 360;
      const cssH = height;
      if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const state = stateRef.current;
      const pal = PALETTES[state];
      const rank = STATE_RANK[state];
      const W = cssW;
      const H = cssH;

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, pal.skyTop);
      sky.addColorStop(1, pal.skyBottom);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Sun / dim orb
      const sunX = W * 0.82;
      const sunY = H * 0.24;
      ctx.fillStyle =
        rank >= 4
          ? 'rgba(255,224,120,0.95)'
          : rank >= 2
            ? 'rgba(240,180,120,0.7)'
            : 'rgba(180,150,150,0.5)';
      ctx.beginPath();
      ctx.arc(sunX, sunY, 18, 0, Math.PI * 2);
      ctx.fill();

      // Ground hill
      const groundY = H * 0.66;
      ctx.fillStyle = pal.ground;
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, groundY + 10);
      ctx.quadraticCurveTo(W * 0.5, groundY - 18, W, groundY + 10);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = pal.groundShadow;
      ctx.fillRect(0, H - 10, W, 10);

      // Plants — count scales with health
      const maxPlants = 7;
      const plantCount = Math.max(0, Math.round((healthRef.current / 100) * maxPlants));
      for (let i = 0; i < plantCount; i++) {
        const px = W * (0.1 + (0.8 * (i + 0.5)) / maxPlants);
        const baseY = groundY + 14 + Math.sin(px) * 4;
        const sway = Math.sin(t / 900 + i) * 0.6;
        drawPlant(ctx, px, baseY, 1, rank, pal.plant, sway);
      }

      // Guardian
      drawGuardian(ctx, W * 0.5, groundY - 8, Math.min(W * 0.22, 64), state, pal, t);

      // Particles: sparkles (good) rise; ash (bad) falls; dead = none
      if (state !== 'dead') {
        const rising = rank >= 4;
        const color = rising ? 'rgba(255,255,255,0.8)' : 'rgba(90,80,70,0.5)';
        ctx.fillStyle = color;
        for (const p of particles) {
          p.y += (rising ? -p.speed : p.speed) / 100;
          if (p.y < 0) p.y = 1;
          if (p.y > 1) p.y = 0;
          const drift = Math.sin((t / 1000) * p.speed + p.x * 10) * 0.01;
          ctx.beginPath();
          ctx.arc((p.x + drift) * W, p.y * groundY, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Vignette
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [height]);

  return <canvas ref={canvasRef} className="world-canvas" style={{ height }} aria-hidden />;
}
