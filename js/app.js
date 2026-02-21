

// js/app.js
// Punto de entrada principal: conecta UI, física y render.

import { getElements, readParams, updateLabels, updateStats } from "./ui.js";
import { degToRad, stepEulerSemiImplicit } from "./physics.js";
import { createRenderer } from "./render.js";

// ===== Inicialización =====

const ui = getElements();
const renderer = createRenderer(ui);

// Estado de la simulación
const state = {
    isPlaying: false,
    t: 0,
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    trail: [],
    lastTs: null,
    accumulator: 0,
};

// Objetivo (en coordenadas del mundo, metros)
const target = {
    x: 20,
    y: 5,
    r: 2.5, // radio aumentado
};

let hit = false;

// ===== Funciones principales =====

function resetSim() {
    const params = readParams(ui);
    const th = degToRad(params.angDeg);

    state.t = 0;

    // Condiciones iniciales
    state.pos = { x: 0, y: params.y0 };
    state.vel = {
        x: params.v0 * Math.cos(th),
        y: params.v0 * Math.sin(th),
    };

    state.trail = [{ x: state.pos.x, y: state.pos.y }];
    state.trail._lastT = 0;

    state.lastTs = null;
    state.accumulator = 0;
    state.isPlaying = false;
    hit = false;

    ui.playBtn.textContent = "Simular";

    updateStats(ui, params, state);
    renderer.draw(params, state, target, hit);
}

function recomputeAndRedraw() {
    const params = readParams(ui);

    if (!state.isPlaying) {
        resetSim();
    } else {
        updateStats(ui, params, state);
        renderer.draw(params, state, target, hit);
    }
}

function checkHit() {
    const dx = state.pos.x - target.x;
    const dy = state.pos.y - target.y;
    return dx * dx + dy * dy <= target.r * target.r;
}

function step(dt) {
    const params = readParams(ui);

    // Integración numérica (Euler semi-implícito)
    stepEulerSemiImplicit(state, params, dt);

    // Guardar puntos de la trayectoria cada cierto tiempo
    if (
        state.trail.length === 0 ||
        state.t - (state.trail._lastT || 0) >= 0.02
    ) {
        state.trail.push({ x: state.pos.x, y: Math.max(0, state.pos.y) });
        state.trail._lastT = state.t;
    }

    // Impacto con suelo
    if (state.pos.y <= 0) {
        state.pos.y = 0;
        state.isPlaying = false;
        ui.playBtn.textContent = "Simular";
    }

    // Impacto con objetivo
    if (!hit && checkHit()) {
        hit = true;
        state.isPlaying = false;
        ui.playBtn.textContent = "Simular";
    }
}

function loop(ts) {
    if (!state.isPlaying) return;

    if (state.lastTs == null) {
        state.lastTs = ts;
        state.accumulator = 0;
    }

    const params = readParams(ui);
    const fixedDt = params.dt;

    const elapsed = (ts - state.lastTs) / 1000;
    state.lastTs = ts;

    const clamped = Math.min(elapsed, 0.25);
    state.accumulator += clamped;

    let steps = 0;
    const maxStepsPerFrame = 25;

    while (state.accumulator >= fixedDt && steps < maxStepsPerFrame) {
        step(fixedDt);
        state.accumulator -= fixedDt;
        steps++;
    }

    updateStats(ui, params, state);
    renderer.draw(params, state, target, hit);

    requestAnimationFrame(loop);
}

// ===== Eventos UI =====

updateLabels(ui);

[ui.v0El, ui.angEl, ui.y0El, ui.gEl, ui.dtEl].forEach((input) => {
    input.addEventListener("input", () => {
        updateLabels(ui);
        recomputeAndRedraw();
    });
});

ui.playBtn.addEventListener("click", () => {
    if (!state.isPlaying) {
        state.isPlaying = true;
        ui.playBtn.textContent = "Pausar";
        state.lastTs = null;
        requestAnimationFrame(loop);
    } else {
        state.isPlaying = false;
        ui.playBtn.textContent = "Simular";
    }
});

ui.resetBtn.addEventListener("click", resetSim);

// Click en canvas para mover el objetivo
ui.canvas.addEventListener("click", (e) => {
    const rect = ui.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const world = renderer.screenToWorld(x, y);
    if (world) {
        target.x = world.x;
        target.y = world.y;
        recomputeAndRedraw();
    }
});

window.addEventListener("resize", () =>
    renderer.resizeCanvas(recomputeAndRedraw)
);

// ===== Inicialización final =====

renderer.resizeCanvas(recomputeAndRedraw);
resetSim();