

// js/render.js
// Renderizado en Canvas (rejilla, trayectoria analítica vs simulada, vectores, objetivo y overlay)

import { computeAnalytic, degToRad } from "./physics.js";

export function createRenderer(ui) {
  const canvas = ui.canvas;
  const overlayEl = ui.overlayEl;
  const ctx = canvas.getContext("2d");

  // Márgenes del "viewport" en pixeles (zona útil para dibujar)
  const margin = { l: 50, r: 20, t: 20, b: 50 };

  // Ajustes visuales para vectores
  const vectorScale = 0.6; // escala visual: (m/s) -> pixeles (depende de scale mundo->pantalla)
  const gravityVectorMeters = 6; // longitud del vector g en metros (solo visual)

  // Guardamos el último mapeo mundo<->pantalla para permitir convertir clicks a coordenadas del mundo
  let lastMapping = null;

  // ======= Utilidades básicas =======

  function clear() {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }

  function niceStep(maxVal) {
    // Elige pasos 1, 2, 5 * 10^n para que la rejilla sea "bonita"
    if (maxVal <= 0) return 1;
    const rough = maxVal / 8;
    const p = Math.pow(10, Math.floor(Math.log10(rough)));
    const r = rough / p;
    const m = r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10;
    return m * p;
  }

  function drawGrid(worldMaxX, worldMaxY, toScreen) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Fondo
    ctx.fillStyle = "#070a0f";
    ctx.fillRect(0, 0, w, h);

    // Rejilla
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;

    const stepX = niceStep(worldMaxX);
    const stepY = niceStep(worldMaxY);

    // Líneas verticales
    for (let x = 0; x <= worldMaxX + 1e-9; x += stepX) {
      const p = toScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(p.x, margin.t);
      ctx.lineTo(p.x, h - margin.b);
      ctx.stroke();
    }

    // Líneas horizontales
    for (let y = 0; y <= worldMaxY + 1e-9; y += stepY) {
      const p = toScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(margin.l, p.y);
      ctx.lineTo(w - margin.r, p.y);
      ctx.stroke();
    }

    // Ejes
    ctx.strokeStyle = "rgba(255,255,255,0.35)";

    // Eje X (suelo)
    const g0 = toScreen(0, 0);
    ctx.beginPath();
    ctx.moveTo(margin.l, g0.y);
    ctx.lineTo(w - margin.r, g0.y);
    ctx.stroke();

    // Eje Y en x=0
    ctx.beginPath();
    ctx.moveTo(toScreen(0, 0).x, margin.t);
    ctx.lineTo(toScreen(0, 0).x, h - margin.b);
    ctx.stroke();

    // Etiquetas
    ctx.fillStyle = "rgba(233,238,245,0.85)";
    ctx.font = "12px system-ui";
    ctx.fillText("x (m)", w - 50, h - 18);
    ctx.fillText("y (m)", 12, 18);
  }

  function drawArrow(from, to, color = "rgba(233,238,245,0.9)") {
    const headLen = 10;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const ang = Math.atan2(dy, dx);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // Punta
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLen * Math.cos(ang - Math.PI / 6),
      to.y - headLen * Math.sin(ang - Math.PI / 6)
    );
    ctx.lineTo(
      to.x - headLen * Math.cos(ang + Math.PI / 6),
      to.y - headLen * Math.sin(ang + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  function checkHit(pos, target) {
    const dx = pos.x - target.x;
    const dy = pos.y - target.y;
    return dx * dx + dy * dy <= target.r * target.r;
  }

  // ======= API del renderer =======

  function resizeCanvas(recomputeAndRedraw) {
    const rect = canvas.getBoundingClientRect();

    // Evita dibujar si todavía no hay tamaño (por ejemplo, antes de layout)
    if (!rect.width || !rect.height) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    // Dibujamos en coordenadas CSS (pixeles "normales")
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    recomputeAndRedraw();
  }

  /**
   * Convierte coordenadas del canvas (en pixeles CSS, relativas al canvas) a coordenadas del mundo (metros).
   * Útil para mover el objetivo con un click.
   */
  function screenToWorld(canvasX, canvasY) {
    if (!lastMapping) return null;

    const { scale, h } = lastMapping;

    const wx = (canvasX - margin.l) / scale;
    const wy = (h - margin.b - canvasY) / scale;

    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null;
    return { x: Math.max(0, wx), y: Math.max(0, wy) };
  }

  /**
   * Dibuja todo: rejilla, curva analítica (blanca), trayectoria simulada (azul), proyectil,
   * objetivo, vectores y overlay.
   */
  function draw(params, state, target, hit) {
    const { v0, angDeg, y0, g } = params;

    const a = computeAnalytic({ v0, angDeg, y0, g });

    // Boundings del mundo para que la trayectoria completa quepa
    const worldMaxX = Math.max(10, a.R * 1.05);
    const worldMaxY = Math.max(5, a.H * 1.15);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const usableW = w - margin.l - margin.r;
    const usableH = h - margin.t - margin.b;

    const scaleX = usableW / worldMaxX;
    const scaleY = usableH / worldMaxY;
    const scale = Math.min(scaleX, scaleY);

    const toScreen = (x, y) => ({
      x: margin.l + x * scale,
      y: h - margin.b - y * scale,
    });

    // Guardamos mapeo para screenToWorld
    lastMapping = { scale, w, h, worldMaxX, worldMaxY };

    clear();
    drawGrid(worldMaxX, worldMaxY, toScreen);

    // ===== Curva analítica (blanca) =====
    // Ecuaciones exactas:
    // x(t)=v0x·t
    // y(t)=y0+v0y·t-(1/2)·g·t²
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const samples = 200;
    for (let i = 0; i <= samples; i++) {
      const tt = (a.T * i) / samples;
      const xx = a.v0x * tt;
      const yy = y0 + a.v0y * tt - 0.5 * g * tt * tt;
      const p = toScreen(xx, Math.max(0, yy));
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // ===== Trayectoria simulada (azul) =====
    // Puntos generados por integración numérica con Δt
    ctx.strokeStyle = "rgba(31,111,235,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < state.trail.length; i++) {
      const p = toScreen(state.trail[i].x, state.trail[i].y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // ===== Proyectil =====
    const projP = toScreen(state.pos.x, Math.max(0, state.pos.y));
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(projP.x, projP.y, 5, 0, Math.PI * 2);
    ctx.fill();

    // ===== Marcador de alcance =====
    const pr = toScreen(a.R, 0);
    ctx.fillStyle = "rgba(233,238,245,0.85)";
    ctx.font = "12px system-ui";
    ctx.fillText(`R≈${a.R.toFixed(2)}m`, pr.x - 40, pr.y + 18);

    // ===== Objetivo =====
    const tp = toScreen(target.x, target.y);
    const hitNow = hit || checkHit(state.pos, target);
    ctx.strokeStyle = hitNow ? "rgba(110,231,183,0.95)" : "rgba(251,191,36,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, target.r * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(251,191,36,0.15)";
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, target.r * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(233,238,245,0.85)";
    ctx.font = "12px system-ui";
    ctx.fillText("Objetivo", tp.x - 24, tp.y - target.r * scale - 8);

    // ===== Vectores (v y g) =====
    // Vector velocidad (azul)
    const vEnd = {
      x: projP.x + state.vel.x * scale * vectorScale,
      y: projP.y - state.vel.y * scale * vectorScale, // menos por eje Y invertido en pantalla
    };
    drawArrow(projP, vEnd, "rgba(31,111,235,0.95)");

    // Vector gravedad (rojo) hacia abajo
    const gEnd = toScreen(state.pos.x, Math.max(0, state.pos.y - gravityVectorMeters));
    drawArrow(projP, gEnd, "rgba(248,113,113,0.95)");

    // Etiquetas
    ctx.fillStyle = "rgba(31,111,235,0.95)";
    ctx.fillText("v", vEnd.x + 6, vEnd.y);
    ctx.fillStyle = "rgba(248,113,113,0.95)";
    ctx.fillText("g", gEnd.x + 6, gEnd.y);

    // ===== Overlay (ecuaciones + valores actuales) =====
    if (overlayEl) {
      const th = degToRad(angDeg);
      const v0x = v0 * Math.cos(th);
      const v0y = v0 * Math.sin(th);

      // Mostramos las fórmulas del modelo en el overlay (útil para la exposición)
      const eqX = `x(t) = x0 + v0·cos(θ)·t`;
      const eqY = `y(t) = y0 + v0·sin(θ)·t − ½·g·t²`;

      const hitClass = hitNow ? "ok" : "warn";
      overlayEl.innerHTML = `
        <b>Ecuaciones</b><br/>
        ${eqX}<br/>
        ${eqY}<br/><br/>
        <b>Valores</b><br/>
        v0x=${v0x.toFixed(2)} m/s, v0y=${v0y.toFixed(2)} m/s<br/>
        t=${state.t.toFixed(2)} s, x=${state.pos.x.toFixed(2)} m, y=${state.pos.y.toFixed(2)} m<br/>
        vx=${state.vel.x.toFixed(2)} m/s, vy=${state.vel.y.toFixed(2)} m/s<br/>
        objetivo: (${target.x.toFixed(1)}, ${target.y.toFixed(1)}) r=${target.r.toFixed(1)} m<br/>
        <b class="${hitClass}">${hitNow ? "✅ Impacto detectado" : "🎯 Sin impacto (click en el canvas para mover el objetivo)"}</b>
      `;
    }
  }

  return {
    resizeCanvas,
    draw,
    screenToWorld,
    margin,
  };
}