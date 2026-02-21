// js/physics.js
// Física del tiro parabólico (modelo ideal sin resistencia del aire)

// Convierte grados a radianes (Math.sin/cos usan radianes)
export function degToRad(d) {
    return d * Math.PI / 180;
}

/**
 * Calcula resultados del modelo analítico (ecuaciones exactas) del tiro parabólico.
 *
 * Ecuaciones:
 *  v0x = v0·cos(θ)
 *  v0y = v0·sin(θ)
 *  x(t) = x0 + v0x·t   (aquí x0=0)
 *  y(t) = y0 + v0y·t − (1/2)·g·t²
 *
 * Tiempo de vuelo (cuando y(t)=0):
 *  T = (v0y + sqrt(v0y² + 2·g·y0)) / g   (raíz positiva)
 *
 * Alcance:
 *  R = v0x·T
 *
 * Altura máxima:
 *  H = y0 + v0y²/(2g)
 */
export function computeAnalytic({ v0, angDeg, y0, g }) {
    const th = degToRad(angDeg);

    // Componentes de la velocidad inicial
    const v0x = v0 * Math.cos(th);
    const v0y = v0 * Math.sin(th);

    // Tiempo de vuelo: resolver y(t)=0 (ecuación cuadrática). Usamos la raíz positiva.
    const disc = v0y * v0y + 2 * g * y0;
    const T = (v0y + Math.sqrt(Math.max(0, disc))) / g;

    // Alcance horizontal
    const R = v0x * T;

    // Altura máxima (incluye y0)
    const H = y0 + (v0y * v0y) / (2 * g);

    return { v0x, v0y, T, R, H };
}

/**
 * Avanza el estado por un paso de tiempo Δt usando Euler semi-implícito.
 *
 * Modelo ideal:
 *  ax = 0
 *  ay = -g
 *
 * Euler semi-implícito:
 *  1) v = v + a·Δt
 *  2) x = x + v·Δt   (usando la velocidad ya actualizada)
 */
export function stepEulerSemiImplicit(state, params, dt) {
    const g = params.g;

    // Aceleración constante
    // ax = 0
    // ay = -g
    state.vel.y += -g * dt;

    // Actualizamos posición con la nueva velocidad
    state.pos.x += state.vel.x * dt;
    state.pos.y += state.vel.y * dt;

    // Avanzamos el reloj
    state.t += dt;
}
