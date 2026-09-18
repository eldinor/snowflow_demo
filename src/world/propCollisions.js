/**
 * Static vertical cylinders, independent of render visibility and LOD selection.
 * @module world/propCollisions
 */

const SKIN = 0.002;
export const AVATAR_RADIUS = 0.32;
export const AVATAR_HEIGHT = 1.8;

/**
 * Classify only recognized solid desert materials. Unrecognized vegetation remains passable rather than receiving foliage-sized collision bounds.
 */
export function solidPropKind(material) {
    if (/quiver|SaguaroSkin/.test(material)) return 'trunk';
    if (/boulder|drone_rock|namaqualand_rocks/.test(material)) return 'rock';
    return null;
}

/** Static vertical cylinders, independent of render visibility and LOD selection. */
export class PropCollisions {
    constructor(cellSize = 16) { this.cellSize = cellSize; this.cells = new Map(); this.colliders = []; }
    /**
     * Index a positive-radius vertical cylinder into every overlapping grid cell. The collider object is retained, so height adjustments remain visible to queries.
     */
    add(c) {
        if (!(c.radius > 0) || c.maxY <= c.minY) return;
        this.colliders.push(c);
        const s = this.cellSize;
        for (let z = Math.floor((c.z-c.radius)/s); z <= Math.floor((c.z+c.radius)/s); z++) {
            for (let x = Math.floor((c.x-c.radius)/s); x <= Math.floor((c.x+c.radius)/s); x++) {
                const key = `${x},${z}`;
                if (!this.cells.has(key)) this.cells.set(key, []);
                this.cells.get(key).push(c);
            }
        }
    }
    /**
     * Collect unique candidate cylinders along the expanded X/Z sweep. This broad phase does not itself test vertical overlap or contact.
     */
    query(x0,z0,x1,z1,radius) {
        const result = new Set(), s = this.cellSize;
        for (let z=Math.floor((Math.min(z0,z1)-radius)/s); z<=Math.floor((Math.max(z0,z1)+radius)/s); z++) {
            for (let x=Math.floor((Math.min(x0,x1)-radius)/s); x<=Math.floor((Math.max(x0,x1)+radius)/s); x++) {
                for (const c of this.cells.get(`${x},${z}`) || []) result.add(c);
            }
        }
        return result;
    }
    /** Earliest intersection of a segment with a cylinder expanded by the body. */
    hit(c, start, end, radius, below, above) {
        const dx=end.x-start.x, dz=end.z-start.z, dy=end.y-start.y;
        const ox=start.x-c.x, oz=start.z-c.z, r=c.radius+radius;
        const a=dx*dx+dz*dz, b=ox*dx+oz*dz, d=ox*ox+oz*oz-r*r;
        let enter=0, leave=1;
        if (a < 1e-12) { if (d > 0) return null; }
        else {
            const disc=b*b-a*d;
            if (disc < 0) return null;
            const root=Math.sqrt(disc);
            enter=Math.max(enter,(-b-root)/a); leave=Math.min(leave,(-b+root)/a);
        }
        const low=c.minY-above, high=c.maxY+below;
        if (Math.abs(dy) < 1e-12) { if (start.y < low || start.y > high) return null; }
        else {
            const t0=(low-start.y)/dy, t1=(high-start.y)/dy;
            enter=Math.max(enter,Math.min(t0,t1)); leave=Math.min(leave,Math.max(t0,t1));
        }
        return enter <= leave && enter <= 1 && leave >= 0 ? enter : null;
    }
    /** Swept horizontal capsule footprint, with vertical body overlap and wall sliding. */
    move(position, velocity, dt, radius=AVATAR_RADIUS, height=AVATAR_HEIGHT) {
        if (dt <= 0) return;
        // Recover an initial overlap (e.g. a developer teleport) before sweeping.
        for (let pass=0;pass<6;pass++) {
            let pushed=false;
            for (const c of this.query(position.x,position.z,position.x,position.z,radius)) {
                if (position.y+height <= c.minY || position.y >= c.maxY) continue;
                let x=position.x-c.x, z=position.z-c.z, length=Math.hypot(x,z);
                if (length >= c.radius+radius) continue;
                if (length < 1e-8) { x=1; z=0; length=1; }
                const r=c.radius+radius+SKIN;
                position.x=c.x+x/length*r; position.z=c.z+z/length*r; pushed=true;
            }
            if (!pushed) break;
        }
        let dx=velocity.x*dt, dz=velocity.z*dt;
        for (let pass=0;pass<5 && Math.hypot(dx,dz)>1e-8;pass++) {
            const end={x:position.x+dx,y:position.y,z:position.z+dz};
            let nearest=1, collider=null;
            for (const c of this.query(position.x,position.z,end.x,end.z,radius)) {
                const t=this.hit(c,position,end,radius,0,height);
                if (t === 0 && (position.x-c.x)*dx+(position.z-c.z)*dz >= 0) continue;
                if (t !== null && t < nearest) { nearest=t; collider=c; }
            }
            const travel=Math.max(0,nearest-SKIN/Math.max(Math.hypot(dx,dz),SKIN));
            if (!collider) { position.x=end.x; position.z=end.z; break; }
            position.x+=dx*travel; position.z+=dz*travel;
            let nx=position.x-collider.x, nz=position.z-collider.z;
            const n=Math.hypot(nx,nz); nx/=n; nz/=n;
            dx*=1-travel; dz*=1-travel;
            const into=Math.min(0,dx*nx+dz*nz);
            dx-=into*nx; dz-=into*nz;
            const speedInto=Math.min(0,velocity.x*nx+velocity.z*nz);
            velocity.x-=speedInto*nx; velocity.z-=speedInto*nz;
        }
    }
    /**
     * Find the highest eligible cylinder top below the avatar footprint for landing/support; return -Infinity when none qualifies.
     */
    supportHeight(position, radius=AVATAR_RADIUS) {
        let top = -Infinity;
        for (const c of this.query(position.x,position.z,position.x,position.z,radius)) {
            if (Math.hypot(position.x-c.x,position.z-c.z) < c.radius+radius && c.maxY <= position.y+.01) top=Math.max(top,c.maxY);
        }
        return top;
    }
    /** Vertical body sweep after horizontal sliding: stops on tops and undersides. */
    verticalLimit(position, nextY, radius=AVATAR_RADIUS, height=AVATAR_HEIGHT) {
        let result=nextY;
        for (const c of this.query(position.x,position.z,position.x,position.z,radius)) {
            if (Math.hypot(position.x-c.x,position.z-c.z) >= c.radius+radius) continue;
            if (nextY < position.y && position.y >= c.maxY && nextY < c.maxY) result=Math.max(result,c.maxY);
            if (nextY > position.y && position.y+height <= c.minY && nextY+height > c.minY) result=Math.min(result,c.minY-height);
        }
        return result;
    }
    /**
     * Return the clear fraction of a camera-arm sweep against cylinders, including vertical entry. A value of one leaves the arm unshortened.
     */
    cameraFraction(start,end,radius=.25) {
        let fraction=1;
        for (const c of this.query(start.x,start.z,end.x,end.z,radius)) {
            const t=this.hit(c,start,end,radius,radius,radius);
            if (t !== null) fraction=Math.min(fraction,t);
        }
        const distance=Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z);
        return fraction < 1 ? Math.max(0,fraction-SKIN/Math.max(distance,SKIN)) : 1;
    }
}
