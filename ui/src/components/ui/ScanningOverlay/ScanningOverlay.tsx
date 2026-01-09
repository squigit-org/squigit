/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from "react";

interface ScanningOverlayProps {
  isVisible: boolean;
}

export const ScanningOverlay: React.FC<ScanningOverlayProps> = ({
  isVisible,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isVisible) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = container.clientWidth;
    let height = container.clientHeight;
    let particles: Particle[] = [];
    let frame = 0;
    let nextSpawnFrame = 5;

    let boundWidth = 0;
    let boundHeight = 0;
    let boundX = 0;
    let boundY = 0;

    const PARTICLE_COUNT = 25;

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      moveTimer: number;
      baseSize: number;
      currentSize: number;
      pulseSpeed: number;
      pulseOffset: number;
      life: number;
      maxLife: number;
      state: "fading_in" | "idle" | "moving" | "fading_out";
      opacity: number;
      fadeSpeed: number;

      constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.moveTimer = 0;
        this.baseSize = 0;
        this.currentSize = 0;
        this.pulseSpeed = 0;
        this.pulseOffset = 0;
        this.life = 0;
        this.maxLife = 0;
        this.state = "fading_in";
        this.opacity = 0;
        this.fadeSpeed = 0;

        this.init();
      }

      init() {
        this.x = boundX + Math.random() * boundWidth;
        this.y = boundY + Math.random() * boundHeight;

        this.vx = 0;
        this.vy = 0;
        this.moveTimer = 0;

        this.baseSize = Math.random() * 2.5 + 1.5;

        this.pulseSpeed = 0.02 + Math.random() * 0.03;
        this.pulseOffset = Math.random() * Math.PI * 2;

        this.life = 0;
        this.maxLife = 200 + Math.random() * 200;
        this.state = "fading_in";
        this.opacity = 0;

        this.fadeSpeed = 0.03 + Math.random() * 0.03;
      }

      update() {
        if (this.x < boundX) this.x = boundX;
        if (this.x > boundX + boundWidth) this.x = boundX + boundWidth;
        if (this.y < boundY) this.y = boundY;
        if (this.y > boundY + boundHeight) this.y = boundY + boundHeight;

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
          const nextX = this.x + this.vx;
          const nextY = this.y + this.vy;

          const hitWall =
            nextX < boundX ||
            nextX > boundX + boundWidth ||
            nextY < boundY ||
            nextY > boundY + boundHeight;

          if (hitWall) {
            this.state = "idle";
            this.vx = 0;
            this.vy = 0;
          } else {
            this.x = nextX;
            this.y = nextY;
            this.moveTimer--;

            if (this.moveTimer <= 0) {
              this.state = "idle";
              this.vx = 0;
              this.vy = 0;
            }
          }
        }

        const pulse = Math.sin(this.life * this.pulseSpeed + this.pulseOffset);
        const scale = 0.7 + 0.3 * pulse;
        this.currentSize = this.baseSize * scale;

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
            this.init();
          }
        }
      }

      draw(context: CanvasRenderingContext2D) {
        context.beginPath();
        context.arc(this.x, this.y, this.currentSize, 0, Math.PI * 2);
        context.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        context.fill();
      }
    }

    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = width;
      canvas.height = height;

      boundWidth = width * 0.7;
      boundHeight = height * 0.7;

      boundX = (width - boundWidth) / 2;
      boundY = (height - boundHeight) / 2;
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      if (particles.length < PARTICLE_COUNT) {
        if (frame >= nextSpawnFrame) {
          const batchSize = Math.floor(Math.random() * 5) + 8;
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

      frame++;
      animationRef.current = requestAnimationFrame(render);
    };

    window.addEventListener("resize", handleResize);
    handleResize();
    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        top: 50 /* Offset for toolbar padding in .image-wrap */,
        left: 0,
        width: "100%",
        height: "calc(100% - 50px)" /* Adjust height for top offset */,
        backgroundColor: "rgba(0, 0, 0, 0.2)",
        overflow: "hidden",
        zIndex: 50,
        pointerEvents: "none",
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block" }} />
    </div>
  );
};
