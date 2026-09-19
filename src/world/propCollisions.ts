/** Static vertical-cylinder collisions, independent of render visibility and LOD. */

const SKIN = 0.002;
export const AVATAR_RADIUS = 0.32;
export const AVATAR_HEIGHT = 1.8;

export type SolidPropKind = 'trunk' | 'rock';

/** Cylinder generated from the solid part of an authored prop. */
export interface PropCollider {
    x: number;
    z: number;
    radius: number;
    minY: number;
    maxY: number;
    name?: string;
    kind?: SolidPropKind;
}

/** Position or endpoint in world metres. */
export interface WorldPoint {
    x: number;
    y: number;
    z: number;
}

/** Horizontal velocity mutated when collision removes its inward component. */
export interface HorizontalVelocity {
    x: number;
    z: number;
}

/** Classify only recognized solid desert materials; vegetation remains passable. */
export function solidPropKind(material: string): SolidPropKind | null {
    if (/quiver|SaguaroSkin/.test(material)) return 'trunk';
    if (/boulder|drone_rock|namaqualand_rocks/.test(material)) return 'rock';
    return null;
}

/** Static vertical cylinders, independent of render visibility and LOD selection. */
export class PropCollisions {
    readonly cellSize: number;
    readonly cells: Map<string, PropCollider[]>;
    readonly colliders: PropCollider[];

    constructor(cellSize = 16) {
        this.cellSize = cellSize;
        this.cells = new Map();
        this.colliders = [];
    }

    /** Index a valid cylinder into every overlapping grid cell, retaining it by reference. */
    add(collider: PropCollider): void {
        if (!(collider.radius > 0) || collider.maxY <= collider.minY) return;
        this.colliders.push(collider);
        const size = this.cellSize;
        for (let z = Math.floor((collider.z - collider.radius) / size); z <= Math.floor((collider.z + collider.radius) / size); z++) {
            for (let x = Math.floor((collider.x - collider.radius) / size); x <= Math.floor((collider.x + collider.radius) / size); x++) {
                const key = `${x},${z}`;
                let cell = this.cells.get(key);
                if (!cell) {
                    cell = [];
                    this.cells.set(key, cell);
                }
                cell.push(collider);
            }
        }
    }

    /** Collect unique candidate cylinders along an expanded horizontal sweep. */
    query(x0: number, z0: number, x1: number, z1: number, radius: number): Set<PropCollider> {
        const result = new Set<PropCollider>(), size = this.cellSize;
        for (let z = Math.floor((Math.min(z0, z1) - radius) / size); z <= Math.floor((Math.max(z0, z1) + radius) / size); z++) {
            for (let x = Math.floor((Math.min(x0, x1) - radius) / size); x <= Math.floor((Math.max(x0, x1) + radius) / size); x++) {
                for (const collider of this.cells.get(`${x},${z}`) ?? []) result.add(collider);
            }
        }
        return result;
    }

    /** Return the earliest segment intersection with a body-expanded cylinder. */
    hit(collider: PropCollider, start: WorldPoint, end: WorldPoint, radius: number, below: number, above: number): number | null {
        const dx = end.x - start.x, dz = end.z - start.z, dy = end.y - start.y;
        const ox = start.x - collider.x, oz = start.z - collider.z, expanded = collider.radius + radius;
        const a = dx * dx + dz * dz, b = ox * dx + oz * dz;
        const d = ox * ox + oz * oz - expanded * expanded;
        let enter = 0, leave = 1;
        if (a < 1e-12) {
            if (d > 0) return null;
        } else {
            const discriminant = b * b - a * d;
            if (discriminant < 0) return null;
            const root = Math.sqrt(discriminant);
            enter = Math.max(enter, (-b - root) / a);
            leave = Math.min(leave, (-b + root) / a);
        }
        const low = collider.minY - above, high = collider.maxY + below;
        if (Math.abs(dy) < 1e-12) {
            if (start.y < low || start.y > high) return null;
        } else {
            const t0 = (low - start.y) / dy, t1 = (high - start.y) / dy;
            enter = Math.max(enter, Math.min(t0, t1));
            leave = Math.min(leave, Math.max(t0, t1));
        }
        return enter <= leave && enter <= 1 && leave >= 0 ? enter : null;
    }

    /** Sweep a horizontal capsule footprint, resolving overlap and wall sliding. */
    move(position: WorldPoint, velocity: HorizontalVelocity, dt: number, radius = AVATAR_RADIUS, height = AVATAR_HEIGHT): void {
        if (dt <= 0) return;
        for (let pass = 0; pass < 6; pass++) {
            let pushed = false;
            for (const collider of this.query(position.x, position.z, position.x, position.z, radius)) {
                if (position.y + height <= collider.minY || position.y >= collider.maxY) continue;
                let x = position.x - collider.x, z = position.z - collider.z, length = Math.hypot(x, z);
                if (length >= collider.radius + radius) continue;
                if (length < 1e-8) { x = 1; z = 0; length = 1; }
                const separation = collider.radius + radius + SKIN;
                position.x = collider.x + x / length * separation;
                position.z = collider.z + z / length * separation;
                pushed = true;
            }
            if (!pushed) break;
        }
        let dx = velocity.x * dt, dz = velocity.z * dt;
        for (let pass = 0; pass < 5 && Math.hypot(dx, dz) > 1e-8; pass++) {
            const end = { x: position.x + dx, y: position.y, z: position.z + dz };
            let nearest = 1;
            let collider: PropCollider | null = null;
            for (const candidate of this.query(position.x, position.z, end.x, end.z, radius)) {
                const time = this.hit(candidate, position, end, radius, 0, height);
                if (time === 0 && (position.x - candidate.x) * dx + (position.z - candidate.z) * dz >= 0) continue;
                if (time !== null && time < nearest) { nearest = time; collider = candidate; }
            }
            const travel = Math.max(0, nearest - SKIN / Math.max(Math.hypot(dx, dz), SKIN));
            if (!collider) { position.x = end.x; position.z = end.z; break; }
            position.x += dx * travel; position.z += dz * travel;
            let nx = position.x - collider.x, nz = position.z - collider.z;
            const length = Math.hypot(nx, nz);
            nx /= length; nz /= length;
            dx *= 1 - travel; dz *= 1 - travel;
            const into = Math.min(0, dx * nx + dz * nz);
            dx -= into * nx; dz -= into * nz;
            const speedInto = Math.min(0, velocity.x * nx + velocity.z * nz);
            velocity.x -= speedInto * nx; velocity.z -= speedInto * nz;
        }
    }

    /** Highest eligible cylinder top below the avatar footprint, or -Infinity. */
    supportHeight(position: WorldPoint, radius = AVATAR_RADIUS): number {
        let top = -Infinity;
        for (const collider of this.query(position.x, position.z, position.x, position.z, radius)) {
            if (Math.hypot(position.x - collider.x, position.z - collider.z) < collider.radius + radius
                && collider.maxY <= position.y + .01) top = Math.max(top, collider.maxY);
        }
        return top;
    }

    /** Limit a vertical body sweep at cylinder tops and undersides. */
    verticalLimit(position: WorldPoint, nextY: number, radius = AVATAR_RADIUS, height = AVATAR_HEIGHT): number {
        let result = nextY;
        for (const collider of this.query(position.x, position.z, position.x, position.z, radius)) {
            if (Math.hypot(position.x - collider.x, position.z - collider.z) >= collider.radius + radius) continue;
            if (nextY < position.y && position.y >= collider.maxY && nextY < collider.maxY) result = Math.max(result, collider.maxY);
            if (nextY > position.y && position.y + height <= collider.minY && nextY + height > collider.minY) result = Math.min(result, collider.minY - height);
        }
        return result;
    }

    /** Clear fraction of a camera-arm sweep, including vertical entry. */
    cameraFraction(start: WorldPoint, end: WorldPoint, radius = .25): number {
        let fraction = 1;
        for (const collider of this.query(start.x, start.z, end.x, end.z, radius)) {
            const time = this.hit(collider, start, end, radius, radius, radius);
            if (time !== null) fraction = Math.min(fraction, time);
        }
        const distance = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
        return fraction < 1 ? Math.max(0, fraction - SKIN / Math.max(distance, SKIN)) : 1;
    }
}
