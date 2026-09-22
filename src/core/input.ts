/**
 * Raw input state. Everything lands in one mutable struct that systems poll —
 * no events fired into game code, no per-frame allocation.
 *
 * Mouse look uses pointer lock, which frees the right button for snow-surf.
 * @module core/input
 */

export type SpellNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface InputState {
    moveX: number;
    moveZ: number;
    moving: boolean;
    lookX: number;
    lookY: number;
    zoomDelta: number;
    surf: boolean;
    sprint: boolean;
    flyPressed: boolean;
    flyUp: boolean;
    flyDown: boolean;
    spellPressed: 0 | SpellNumber;
    spellHeld2: boolean;
    spellHeld7: boolean;
    locked: boolean;
}

export interface InputHooks {
    onToggleOverlay?: () => void;
    onScreenshot?: () => void;
}

export const input: InputState = {
    // Movement axes, camera-relative, already normalised to a unit disc.
    moveX: 0,
    moveZ: 0,
    moving: false,

    // Accumulated mouse delta since last `endFrame()`, in radians.
    lookX: 0,
    lookY: 0,

    // Zoom, consumed by the camera rig.
    zoomDelta: 0,

    surf: false, // RMB held
    sprint: false, // shift
    flyPressed: false,
    flyUp: false,
    flyDown: false,

    /** @type {number} 0 = none, else 1..9 — set on keydown, cleared each frame */
    spellPressed: 0,
    /** @type {boolean} spell 2 (Ribbon) is a held cast */
    spellHeld2: false,
    /** @type {boolean} spell 7 (Aegis) grows while held */
    spellHeld7: false,

    locked: false,
};

const keys: Record<string, boolean | undefined> = Object.create(null) as Record<string, boolean | undefined>;

/**
 * Clear held keys and transient actions when focus, pointer lock or UI ownership changes, preventing stuck movement.
 */
export function resetInput(): void {
    for (const key in keys) keys[key] = false;
    input.moveX = input.moveZ = input.lookX = input.lookY = input.zoomDelta = input.spellPressed = 0;
    input.moving = input.surf = input.sprint = input.spellHeld2 = input.spellHeld7 = false;
    input.flyPressed = input.flyUp = input.flyDown = false;
}

function isUI(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest("button, input, select, textarea, a, [contenteditable=true]");
}

const LOOK_SCALE = 0.0022;

/** @type {(() => void)|null} */
let onToggleOverlay: (() => void) | null = null;
let onScreenshot: (() => void) | null = null;

/**
 * @param {HTMLCanvasElement} canvas
 * @param hooks - Optional global UI actions handled alongside gameplay input.
 */
export function initInput(canvas: HTMLCanvasElement, hooks?: InputHooks): void {
    onToggleOverlay = hooks?.onToggleOverlay ?? null;
    onScreenshot = hooks?.onScreenshot ?? null;

    canvas.addEventListener("click", () => {
        if (!input.locked) canvas.requestPointerLock();
    });

    document.addEventListener("pointerlockchange", () => {
        input.locked = document.pointerLockElement === canvas;
        if (!input.locked) {
            input.flyPressed = input.flyUp = input.flyDown = false;
            // Drop held state so the character doesn't run off while unfocused.
            for (const k in keys) keys[k] = false;
            input.surf = false;
            input.spellHeld2 = false;
            input.spellHeld7 = false;
        }
    });

    document.addEventListener("mousemove", (e) => {
        if (!input.locked) return;
        input.lookX += e.movementX * LOOK_SCALE;
        input.lookY += e.movementY * LOOK_SCALE;
    });

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("mousedown", (e) => {
        if (!input.locked) return;
        if (e.button === 2) input.surf = true;
    });

    document.addEventListener("mouseup", (e) => {
        if (e.button === 2) input.surf = false;
    });

    document.addEventListener(
        "wheel",
        (e) => {
            if (!input.locked) return;
            e.preventDefault();
            input.zoomDelta += e.deltaY * 0.0016;
        },
        { passive: false }
    );

    window.addEventListener("keydown", (e) => {
        // Overlay toggle works whether or not the pointer is locked.
        if (e.code === "F1" || e.code === "Backquote") {
            e.preventDefault();
            onToggleOverlay?.();
            return;
        }
        if (isUI(e.target)) return;
        if (e.code === "KeyP") {
            if (!e.repeat) onScreenshot?.();
            return;
        }
        if (e.code === 'Space') e.preventDefault();
        if (e.repeat) return;
        if (e.code === 'Space') input.flyPressed = true;
        keys[e.code] = true;

        const n = SPELL_KEYS[e.code];
        if (n) {
            input.spellPressed = n;
            if (n === 2) input.spellHeld2 = true;
            if (n === 7) input.spellHeld7 = true;
        }
    });

    window.addEventListener("keyup", (e) => {
        keys[e.code] = false;
        if (SPELL_KEYS[e.code] === 2) input.spellHeld2 = false;
        if (SPELL_KEYS[e.code] === 7) input.spellHeld7 = false;
    });

    window.addEventListener("blur", () => {
        input.flyPressed = input.flyUp = input.flyDown = false;
        for (const k in keys) keys[k] = false;
        input.surf = false;
        input.spellHeld2 = false;
        input.spellHeld7 = false;
    });
}

const SPELL_KEYS: Readonly<Record<string, SpellNumber | undefined>> = {
    Digit1: 1,
    Digit2: 2,
    Digit3: 3,
    Digit4: 4,
    Digit5: 5,
    Digit6: 6,
    Digit7: 7,
    Digit8: 8,
    Digit9: 9,
};

/** Resolve held keys into movement axes. Called once per frame before update. */
export function pollInput(): void {
    if (isUI(document.activeElement) && !input.locked) {
        resetInput();
        return;
    }
    let x = 0;
    let z = 0;
    if (keys.KeyW || keys.ArrowUp) z += 1;
    if (keys.KeyS || keys.ArrowDown) z -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;

    // Clamp to a unit disc so diagonals aren't faster.
    const len = Math.sqrt(x * x + z * z);
    if (len > 1) {
        x /= len;
        z /= len;
    }
    input.moveX = x;
    input.moveZ = z;
    input.moving = len > 0.001;
    input.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
    input.flyUp = !!keys.Space;
    input.flyDown = !!(keys.ControlLeft || keys.ControlRight);
}

/** Clear per-frame accumulators. Called at the very end of the frame. */
export function endFrame(): void {
    input.lookX = 0;
    input.lookY = 0;
    input.zoomDelta = 0;
    input.spellPressed = 0;
    input.flyPressed = false;
}

/**
 * Query a physical keyboard code from the shared held-key set without consuming it.
 */
export function isDown(code: string): boolean {
    return !!keys[code];
}
