/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let width = 0;
let height = 0;
let animationFrameId: number;

// Configuration
const PARTICLE_COUNT = 45;
let particles: Particle[] = [];

// Scan Box Configuration
let boxWidth = 300;
let boxHeight = 300;
let boxX = 0;
let boxY = 0;

let frame = 0;
let nextSpawnFrame = 0;

class Particle {
  x: number = 0;
  y: number = 0;
  vx: number = 0;
  vy: number = 0;
  moveTimer: number = 0;
  baseSize: number = 0;
  pulseSpeed: number = 0;
  pulseOffset: number = 0;
  life: number = 0;
  maxLife: number = 0;
  state: "fading_in" | "idle" | "moving" | "fading_out" = "fading_in";
  opacity: number = 0;
  fadeSpeed: number = 0;
  currentSize: number = 0;

  constructor() {
    this.init();
  }

  init() {
    // Position: SPAWN ONLY INSIDE THE BOX
    this.x = boxX + Math.random() * boxWidth;
    this.y = boxY + Math.random() * boxHeight;

    // Movement vector (starts stationary)
    this.vx = 0;
    this.vy = 0;
    this.moveTimer = 0;

    // Size properties
    // 1.5px to 4.0px radius
    this.baseSize = Math.random() * 2.5 + 1.5;
    this.pulseSpeed = 0.02 + Math.random() * 0.03;
    this.pulseOffset = Math.random() * Math.PI * 2;

    // Lifecycle
    this.life = 0;
    this.maxLife = 200 + Math.random() * 200;
    this.state = "fading_in";
    this.opacity = 0;

    this.fadeSpeed = 0.03 + Math.random() * 0.03;
  }

  update() {
    // 1. Logic for "Fixed in place then suddenly moves"
    if (this.state === "idle") {
      if (Math.random() < 0.01) {
        this.state = "moving";
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 1.0;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.moveTimer = 30 + Math.random() * 40;
      }
    } else if (this.state === "moving") {
      this.x += this.vx;
      this.y += this.vy;
      this.moveTimer--;

      if (this.moveTimer <= 0) {
        this.state = "idle";
        this.vx = 0;
        this.vy = 0;
      }
    }

    // 2. Pulse Size
    const pulse = Math.sin(this.life * this.pulseSpeed + this.pulseOffset);
    const scale = 0.7 + 0.3 * pulse;
    this.currentSize = this.baseSize * scale;

    // 3. Lifecycle
    this.life++;

    if (this.state === "fading_in") {
      this.opacity += this.fadeSpeed;
      if (this.opacity >= 1) {
        this.opacity = 1;
        this.state = "idle";
      }
    } else if (this.state === "idle" || this.state === "moving") {
      if (this.life > this.maxLife) {
        this.state = "fading_out";
      }
    } else if (this.state === "fading_out") {
      this.opacity -= this.fadeSpeed;
      if (this.opacity <= 0) {
        this.opacity = 0;
        this.init(); // Respawn elsewhere
      }
    }
  }

  draw(ctx: OffscreenCanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentSize, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
    ctx.fill();
  }
}

function initParticles() {
  particles = [];
  frame = 0;
  nextSpawnFrame = 5;
}

function resize(w: number, h: number) {
  width = w;
  height = h;
  if (canvas) {
    canvas.width = width;
    canvas.height = height;
  }

  boxWidth = Math.min(width * 0.8, 600);
  boxHeight = Math.min(height * 0.5, 400);

  boxX = (width - boxWidth) / 2;
  boxY = (height - boxHeight) / 2;
}

function animate() {
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, width, height);

  // --- START CLIPPING MASK ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(boxX, boxY, boxWidth, boxHeight);
  ctx.clip();
  // ---------------------------

  if (particles.length < PARTICLE_COUNT) {
    if (frame >= nextSpawnFrame) {
      const batchSize = Math.floor(Math.random() * 7) + 12;
      const toAdd = Math.min(batchSize, PARTICLE_COUNT - particles.length);

      for (let k = 0; k < toAdd; k++) {
        particles.push(new Particle());
      }
      nextSpawnFrame = frame + (12 + Math.random() * 12);
    }
  }

  for (let i = 0; i < particles.length; i++) {
    particles[i].update();
    particles[i].draw(ctx);
  }

  ctx.restore();

  frame++;
  animationFrameId = requestAnimationFrame(animate);
}

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === "INIT") {
    canvas = payload.canvas;
    ctx = canvas!.getContext("2d") as OffscreenCanvasRenderingContext2D;
    resize(payload.width, payload.height);
    initParticles();
    animate();
  } else if (type === "RESIZE") {
    resize(payload.width, payload.height);
  } else if (type === "STOP") {
    cancelAnimationFrame(animationFrameId);
  }
};
