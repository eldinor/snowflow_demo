export const FLIGHT_DURATION = 15;
export const FLIGHT_COOLDOWN = 5;
export const FLIGHT_HEIGHT = 8;

/** Flight owns its timer and airborne movement; it uses the existing prop grid. */
export class Flight {
    constructor() {
        this.active = false;
        this.remaining = 0;
        this.cooldown = 0;
        this.elapsed = 0;
        this.justStarted = false;
    }
    update(dt, ch, input, forward, right) {
        this.justStarted = false;
        if (dt <= 0) return this.active;
        this.cooldown = Math.max(0, this.cooldown - dt);
        if (input.flyPressed && !this.active && this.cooldown === 0) {
            this.active = this.justStarted = true;
            this.remaining = FLIGHT_DURATION;
            this.elapsed = 0;
            ch.velocity.y = 2.8;
        }
        if (!this.active) return false;
        this.remaining = Math.max(0, this.remaining - dt);
        this.elapsed += dt;
        // Small substeps keep terrain and prop checks reliable during slow frames.
        let rest = dt;
        while (rest > 1e-8 && this.active) {
            const h = Math.min(rest, 1 / 60); rest -= h;
            const blend = 1 - Math.exp(-5 * h);
            const speed = this.remaining > 0 ? 18 : 3;
            const vx = (forward.x * input.moveZ + right.x * input.moveX) * speed;
            const vz = (forward.z * input.moveZ + right.z * input.moveX) * speed;
            ch.velocity.x += (vx - ch.velocity.x) * blend;
            ch.velocity.z += (vz - ch.velocity.z) * blend;
            const oldX = ch.position.x, oldZ = ch.position.z;
            if (ch.terrain.obstacles) ch.terrain.obstacles.move(ch.position, ch.velocity, h);
            else { ch.position.x += ch.velocity.x * h; ch.position.z += ch.velocity.z * h; }
            ch.terrain.heightfield?.clampToPlayArea(ch.position);
            let ground = ch.terrain.heightAt(ch.position.x, ch.position.z);
            if (ground > ch.position.y + .15) {
                // A steep rising face is a wall, not a teleport to its top.
                ch.position.x = oldX; ch.position.z = oldZ;
                ch.velocity.x = ch.velocity.z = 0;
                ground = ch.terrain.heightAt(oldX, oldZ);
            }
            // Flight lands on water, then the swim controller takes over.
            const water=ch.terrain.water?.sample(ch.position.x,ch.position.z);
            if(water)ground=Math.max(ground,water.level);
            const altitude = ch.position.y - ground;
            let vy = this.remaining === 0 ? -2 : input.flyDown ? -2.5 : input.flyUp ? 3 : 0;
            if (this.elapsed < .6 && !input.flyDown) vy = 2.8;
            if (altitude > FLIGHT_HEIGHT) vy = Math.min(vy, -2);
            else if (vy > 0) vy *= Math.max(0, Math.min(1, (FLIGHT_HEIGHT - altitude) * 2));
            ch.velocity.y += (vy - ch.velocity.y) * (1 - Math.exp(-8 * h));
            let nextY = ch.position.y + ch.velocity.y * h;
            const obstacles = ch.terrain.obstacles;
            if (obstacles) {
                nextY = obstacles.verticalLimit(ch.position, nextY);
                if (nextY !== ch.position.y + ch.velocity.y * h) ch.velocity.y = 0;
                ground = Math.max(ground, obstacles.supportHeight(ch.position));
            }
            ch.groundY = ground;
            ch.position.y = Math.max(ground, nextY);
            if (ch.position.y <= ground + .005 && this.elapsed > .3 && vy <= 0) {
                this.active = false;
                this.remaining = 0;
                this.cooldown = FLIGHT_COOLDOWN;
                ch.position.y = ground;
                ch.velocity.y = 0;
            }
        }
        return true; // Finish the airborne frame even if it just landed.
    }
}
