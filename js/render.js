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
		// Si existe hitR, usamos ese radio para la colisión.
		const hitR = typeof target.hitR === "number" ? target.hitR : target.r;
		return dx * dx + dy * dy <= hitR * hitR;
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

		// ===== Proyectil (Cohete 🚀) =====
		const projP = toScreen(state.pos.x, Math.max(0, state.pos.y));

		// Ángulo del cohete según dirección de la velocidad.
		// Ojo: en pantalla el eje Y está invertido, por eso usamos -vy.
		const angle = Math.atan2(-state.vel.y, state.vel.x);

		ctx.save();
		ctx.translate(projP.x, projP.y);
		ctx.rotate(angle);

		// Dimensiones (aprox. el doble de la bolita original)
		const bodyL = 28;  // largo del cuerpo
		const bodyH = 10;  // alto del cuerpo
		const noseL = 10;  // largo de la punta
		const tailL = 8;   // largo hacia atrás

		// --- Cuerpo (cápsula / rectángulo redondeado) ---
		ctx.fillStyle = "rgba(233,238,245,0.95)";
		const r = bodyH / 2;
		const x0 = -tailL;
		const yBody0 = -bodyH / 2;
		const w0 = bodyL;
		const h0 = bodyH;

		ctx.beginPath();
		// esquina superior izquierda (redondeo)
		ctx.moveTo(x0 + r, yBody0);
		ctx.lineTo(x0 + w0 - r, yBody0);
		ctx.arc(x0 + w0 - r, yBody0 + r, r, -Math.PI / 2, 0);
		ctx.lineTo(x0 + w0, yBody0 + h0 - r);
		ctx.arc(x0 + w0 - r, yBody0 + h0 - r, r, 0, Math.PI / 2);
		ctx.lineTo(x0 + r, yBody0 + h0);
		ctx.arc(x0 + r, yBody0 + h0 - r, r, Math.PI / 2, Math.PI);
		ctx.lineTo(x0, yBody0 + r);
		ctx.arc(x0 + r, yBody0 + r, r, Math.PI, (3 * Math.PI) / 2);
		ctx.closePath();
		ctx.fill();

		// --- Punta (cono) ---
		ctx.fillStyle = "rgba(233,238,245,0.95)";
		ctx.beginPath();
		ctx.moveTo(x0 + w0, 0);
		ctx.lineTo(x0 + w0 + noseL, 0);
		ctx.lineTo(x0 + w0, -bodyH / 2);
		ctx.closePath();
		ctx.fill();

		ctx.beginPath();
		ctx.moveTo(x0 + w0, 0);
		ctx.lineTo(x0 + w0 + noseL, 0);
		ctx.lineTo(x0 + w0, bodyH / 2);
		ctx.closePath();
		ctx.fill();

		// --- Aletas (fins) ---
		ctx.fillStyle = "rgba(31,111,235,0.95)";
		// aleta superior
		ctx.beginPath();
		ctx.moveTo(x0 + 6, -bodyH / 2);
		ctx.lineTo(x0 + 14, -bodyH / 2);
		ctx.lineTo(x0 + 10, -bodyH / 2 - 7);
		ctx.closePath();
		ctx.fill();
		// aleta inferior
		ctx.beginPath();
		ctx.moveTo(x0 + 6, bodyH / 2);
		ctx.lineTo(x0 + 14, bodyH / 2);
		ctx.lineTo(x0 + 10, bodyH / 2 + 7);
		ctx.closePath();
		ctx.fill();

		// --- Ventana ---
		ctx.fillStyle = "rgba(31,111,235,0.95)";
		ctx.beginPath();
		ctx.arc(x0 + 16, 0, 3.5, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = "rgba(255,255,255,0.85)";
		ctx.beginPath();
		ctx.arc(x0 + 16 - 1.2, -1.0, 1.2, 0, Math.PI * 2);
		ctx.fill();

		// --- Fuego (solo mientras está en movimiento) ---
		if (state.isPlaying) {
			// Llama principal
			ctx.fillStyle = "rgba(248,113,113,0.95)";
			ctx.beginPath();
			ctx.moveTo(x0 - 2, 0);
			ctx.lineTo(x0 - 12, -4);
			ctx.lineTo(x0 - 18, 0);
			ctx.lineTo(x0 - 12, 4);
			ctx.closePath();
			ctx.fill();

			// Llama interna (más clara)
			ctx.fillStyle = "rgba(251,191,36,0.95)";
			ctx.beginPath();
			ctx.moveTo(x0 - 2, 0);
			ctx.lineTo(x0 - 10, -2.5);
			ctx.lineTo(x0 - 14, 0);
			ctx.lineTo(x0 - 10, 2.5);
			ctx.closePath();
			ctx.fill();
		}

		ctx.restore();

		// ===== Objetivo: OVNI
		const tp = toScreen(target.x, target.y);
		const hitNow = hit || checkHit(state.pos, target);
		const rPx = (target.r * scale) / 3;

		ctx.save();
		ctx.translate(tp.x, tp.y);
		const rim = hitNow ? "rgba(239,68,68,0.95)" : "rgba(16,185,129,0.95)";

		ctx.fillStyle = hitNow ? "rgba(239,68,68,0.35)" : "rgba(34,197,94,0.35)";
		ctx.strokeStyle = rim;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.ellipse(0, 0, rPx * 1.6, rPx * 0.55, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();

		ctx.fillStyle = hitNow ? "rgba(248,113,113,0.85)" : "rgba(74,222,128,0.85)";
		ctx.beginPath();
		ctx.ellipse(0, -rPx * 0.45, rPx * 0.75, rPx * 0.35, 0, Math.PI * 2, 0, true);
		ctx.fill();

		ctx.fillStyle = hitNow ? "rgba(220,38,38,0.95)" : "rgba(16,185,129,0.95)";
		for (let i = -2; i <= 2; i++) {
			ctx.beginPath();
			ctx.arc(i * rPx * 0.55, rPx * 0.15, Math.max(1.2, rPx * 0.12), 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.fillStyle = hitNow ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.18)";
		ctx.beginPath();
		ctx.ellipse(0, rPx * 0.75, rPx * 1.2, rPx * 0.55, 0, 0, Math.PI * 2);
		ctx.fill();

		ctx.fillStyle = "rgba(233,238,245,0.85)";
		ctx.font = "12px system-ui";
		ctx.fillText("OVNI", -16, -rPx * 1.25);
		ctx.restore();

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
        objetivo: (${target.x.toFixed(1)}, ${target.y.toFixed(1)}) r=${target.r.toFixed(1)} m (hit=${(typeof target.hitR === "number" ? target.hitR : target.r).toFixed(1)} m)<br/>
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