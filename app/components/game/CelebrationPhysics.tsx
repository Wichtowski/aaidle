"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Bodies, Body, Composite, Engine, type Body as MatterBody } from "matter-js";

type Particle = {
  body: MatterBody | null;
  emoji: string;
  fromLeft: boolean;
  launchAt: number;
  launched: boolean;
};

const particleCount = 52;
const particleRadius = 28;
const emojiChoices = ["🎉", "🥳", "🎊", "✨", "🎈"];
const lifetime = 5_400;

export function CelebrationPhysics({
  obstacleRef,
}: {
  obstacleRef: RefObject<HTMLElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.font = '48px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";

    const engine = Engine.create({ enableSleeping: false });
    engine.gravity.y = 0.62;
    engine.gravity.scale = 0.001;
    engine.positionIterations = 4;
    engine.velocityIterations = 3;
    engine.constraintIterations = 1;

    const boundaryOptions = { isStatic: true, restitution: 0.94, friction: 0 };
    const boundaryInset = particleRadius + 28;
    Composite.add(engine.world, [
      Bodies.rectangle(width / 2, boundaryInset, width, 2, boundaryOptions),
      Bodies.rectangle(boundaryInset, height / 2, 2, height, boundaryOptions),
      Bodies.rectangle(width - boundaryInset, height / 2, 2, height, boundaryOptions),
      Bodies.rectangle(width / 2, height - boundaryInset, width, 2, boundaryOptions),
    ]);

    const modalRect = obstacleRef.current?.getBoundingClientRect();
    if (modalRect) {
      Composite.add(
        engine.world,
        Bodies.rectangle(modalRect.left + modalRect.width / 2, modalRect.top, modalRect.width, 18, {
          isStatic: true,
          restitution: 0.9,
          friction: 0,
        }),
      );
    }

    const particles: Particle[] = Array.from({ length: particleCount }, (_, index) => ({
      body: null,
      emoji: emojiChoices[(index * 3) % emojiChoices.length],
      fromLeft: index % 2 === 0,
      launchAt: index * 34,
      launched: false,
    }));

    const launchParticle = (particle: Particle, index: number) => {
      const spread = (index % 11) / 10;
      const direction = particle.fromLeft ? 1 : -1;
      const body = Bodies.circle(
        particle.fromLeft ? boundaryInset + particleRadius : width - boundaryInset - particleRadius,
        90 + ((index * 47) % Math.max(180, height * 0.45)),
        particleRadius,
        {
          restitution: 0.94,
          friction: 0,
          frictionAir: 0,
          density: 0.0012,
        },
      );

      Body.setVelocity(body, {
        x: direction * (6.4 + spread * 2.2),
        y: -(5.6 + ((index * 13) % 18) / 10),
      });
      Body.setAngularVelocity(body, direction * (0.14 + spread * 0.1));
      Composite.add(engine.world, body);
      particle.body = body;
      particle.launched = true;
    };

    const render = (elapsed: number) => {
      context.clearRect(0, 0, width, height);
      const fadeOut = Math.max(0, Math.min(1, (lifetime - elapsed) / 700));

      particles.forEach((particle) => {
        if (!particle.body) return;

        context.save();
        context.globalAlpha = fadeOut;
        context.translate(particle.body.position.x, particle.body.position.y);
        context.rotate(particle.body.angle);
        context.fillText(particle.emoji, 0, 0);
        context.restore();
      });
    };

    let frame = 0;
    let previous = performance.now();
    const startedAt = previous;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const delta = Math.min(now - previous, 28);
      previous = now;

      particles.forEach((particle, index) => {
        if (!particle.launched && elapsed >= particle.launchAt) launchParticle(particle, index);
      });

      Engine.update(engine, delta);
      render(elapsed);

      if (elapsed < lifetime) frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      Composite.clear(engine.world, false, true);
      Engine.clear(engine);
    };
  }, [obstacleRef]);

  return (
    <div className="completed-modal__confetti" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
