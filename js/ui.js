// js/ui.js
// Maneja acceso al DOM, lectura de parámetros y actualización de estadísticas.

import { computeAnalytic } from "./physics.js";

export function getElements() {
    const el = (id) => document.getElementById(id);

    return {
        el,
        v0El: el("v0"),
        angEl: el("ang"),
        y0El: el("y0"),
        gEl: el("g"),
        dtEl: el("dt"),

        v0Label: el("v0Label"),
        angLabel: el("angLabel"),
        y0Label: el("y0Label"),
        gLabel: el("gLabel"),
        dtLabel: el("dtLabel"),

        statsEl: el("stats"),
        playBtn: el("playBtn"),
        resetBtn: el("resetBtn"),
        overlayEl: el("overlay"),
        canvas: el("c"),
    };
}

// Lee valores actuales de los sliders
export function readParams(ui) {
    return {
        v0: Number(ui.v0El.value),
        angDeg: Number(ui.angEl.value),
        y0: Number(ui.y0El.value),
        g: Number(ui.gEl.value),
        dt: Number(ui.dtEl.value),
    };
}

// Actualiza etiquetas visibles junto a los sliders
export function updateLabels(ui) {
    ui.v0Label.textContent = Number(ui.v0El.value).toFixed(1);
    ui.angLabel.textContent = `${Number(ui.angEl.value).toFixed(0)}°`;
    ui.y0Label.textContent = Number(ui.y0El.value).toFixed(1);
    ui.gLabel.textContent = Number(ui.gEl.value).toFixed(1);
    ui.dtLabel.textContent = Number(ui.dtEl.value).toFixed(3);
}

// Actualiza panel de estadísticas
export function updateStats(ui, params, state) {
    const analytic = computeAnalytic(params);

    ui.statsEl.innerHTML = `
    <b>Resultados (modelo analítico)</b><br/>
    Tiempo de vuelo T ≈ <b>${analytic.T.toFixed(2)} s</b><br/>
    Alcance R ≈ <b>${analytic.R.toFixed(2)} m</b><br/>
    Altura máxima H ≈ <b>${analytic.H.toFixed(2)} m</b><br/><br/>

    <b>Estado actual (simulación)</b><br/>
    t = ${state.t.toFixed(2)} s<br/>
    x = ${state.pos.x.toFixed(2)} m<br/>
    y = ${state.pos.y.toFixed(2)} m<br/>
    vx = ${state.vel.x.toFixed(2)} m/s<br/>
    vy = ${state.vel.y.toFixed(2)} m/s
  `;
}
