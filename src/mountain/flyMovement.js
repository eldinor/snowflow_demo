/**
 * Local camera displacement in metres, normalized so diagonal flight is not faster.
 * This demo helper intentionally remains JavaScript and is outside migration scope.
 */
export function flyMovement(keys, speed, dt) {
    const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const y = Number(keys.has('Space')) - Number(keys.has('ControlLeft') || keys.has('ControlRight'));
    const z = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const length = Math.hypot(x, y, z) || 1;
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3 : 1;
    const step = speed * boost * Math.min(Math.max(dt, 0), 0.05) / length;
    return [x * step, y * step, z * step];
}
