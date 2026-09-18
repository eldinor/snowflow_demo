/**
 * Reuses the bounded particle pool; no per-waterfall draw calls.
 * @module vfx/waterEffects
 */

/** Reuses the bounded particle pool; no per-waterfall draw calls. */
export class WaterEffects {
    constructor(water,terrain,character,spray) {
        Object.assign(this,{water,terrain,character,spray});
        this.near=[];this.selectTime=0;this.emission=0;this.stroke=0;this.wasFlying=false;this.splashDelay=0;
    }
    /**
     * Emit a bounded radial burst into the shared spray pool and request a lake ripple at world coordinates.
     */
    splash(x,y,z,strength=1) {
        for(let i=0;i<Math.round(24*strength);i++) {
            const angle=i*2.39996,dx=Math.cos(angle),dz=Math.sin(angle),speed=1.3+(i%5)*.35;
            this.spray.emit(x+dx*.2,y+.08,z+dz*.2,dx*speed,1.4+strength*.6+(i%3)*.3,dz*speed,.025+(i%3)*.008,.8,4,1);
        }
        this.water.ripple(x,z,strength);
    }
    /**
     * Throttle selection of at most twelve nearby waterfall emitters, then add swimming strokes and landing splashes from controller transitions.
     * @param {number} dt - Simulation seconds; nonpositive values freeze emission.
     * @param camera - World camera position used to limit nearby spray work.
     */
    update(dt,camera) {
        if(dt<=0)return;
        this.selectTime-=dt;this.splashDelay=Math.max(0,this.splashDelay-dt);
        if(this.selectTime<=0) {
            this.selectTime=.3;
            this.near=this.water.emitters.map(e=>({e,d:Math.hypot(e.x-camera.x,e.y-camera.y,e.z-camera.z)}))
                .filter(v=>v.d<75).sort((a,b)=>a.d-b.d).slice(0,12);
        }
        this.emission+=dt;
        if(this.emission>=.1) {
            this.emission%=.1;
            for(const {e,d} of this.near) {
                const fade=Math.max(0,1-d/75);
                if(Math.random()>fade)continue;
                const jitter=(Math.random()-.5)*1.5;
                const x=e.x+e.dx*.5-e.dz*jitter,z=e.z+e.dz*.5+e.dx*jitter;
                this.spray.emit(x,e.y+.35,z,e.dx*2,1,e.dz*2,.045,.9,4,.8);
                this.spray.emit(x,e.y+.5,z,e.dx*.7,.4,e.dz*.7,.25+Math.random()*.2,1.6,5,1.2);
                // A gentler bed just downstream catches the cascade's spray.
                const bx=e.x+e.dx*4,bz=e.z+e.dz*4,bed=this.terrain.heightAt(bx,bz);
                if(e.y-bed>1 && e.y-bed<6) {
                    this.spray.emit(bx,bed+.4,bz,e.dx,.8,e.dz,.45,1.8,5,1.4);
                }
            }
        }
        const ch=this.character,p=ch.position,w=this.water.sample(p.x,p.z);
        if(w&&this.splashDelay===0&&(ch.swimming.justEntered||(this.wasFlying&&!ch.flight.active))) {
            this.splash(p.x,w.level,p.z,this.wasFlying?1.8:1);this.splashDelay=.7;
        }
        this.wasFlying=ch.flight.active;
        this.stroke+=dt;
        if(ch.swimming.active&&ch.speed>.2&&w&&this.stroke>.45) {
            this.stroke=0;this.water.ripple(p.x,p.z,.35);
            for(const side of [-1,1]) {
                const x=p.x+Math.cos(ch.facing)*side*.45,z=p.z-Math.sin(ch.facing)*side*.45;
                this.spray.emit(x,w.level+.06,z,-ch.velocity.x*.15,.6,-ch.velocity.z*.15,.022,.5,4,1.5);
            }
        }
    }
}
