import test from "node:test";
import assert from "node:assert/strict";
import { MeshSurface } from "../src/terrain/meshSurface.js";
import { surfaceWeights, SAND_COLORS } from '../src/terrain/surfaceTypes.js';
import { fitPlanarUV } from '../src/terrain/planarUV.js';

test('planar texture transfer preserves mirrored axes, metre scale and offsets',()=>{
    const positions=[-800,0,-500,800,2,-500,-800,3,1100,800,5,1100];
    const uvs=[];
    for(let i=0;i<positions.length;i+=3) uvs.push(-positions[i]/3.5,positions[i+2]/3.5+1);
    const fit=fitPlanarUV(positions,uvs);
    assert.ok(fit.maxError<1e-10);
    assert.ok(Math.abs(fit.u[0]+1/3.5)<1e-10);
    assert.ok(Math.abs(fit.v[1]-1/3.5)<1e-10);
    assert.ok(Math.abs(fit.v[2]-1)<1e-10);
    uvs[6]+=1;
    assert.throws(()=>fitPlanarUV(positions,uvs),/not planar/);
});

test('authored sand and snow are soft; roads, grass, forest and rock stay firm', () => {
    const weights = new Float32Array(2);
    for (const color of SAND_COLORS) {
        surfaceWeights(color, weights);
        assert.equal(weights[0], 0);
        assert.equal(weights[1], 1);
    }
    surfaceWeights([0.896269, 0.921584, 0.947311], weights);
    assert.deepEqual([...weights], [1, 0]);
    for (const color of [[.921584,.806958,.630762], [.838804,.730465,.558343],
        [.450782,.617212,.300542], [.201556,.401984,.219532], [.371237,.351537,.327779]]) {
        surfaceWeights(color, weights);
        assert.deepEqual([...weights], [0, 0]);
    }
});

test('surface colours interpolate across source triangles for biome boundaries', () => {
    const surface = new MeshSurface([0,0,0, 4,0,0, 0,0,4], [0,1,2], 16,
        [1,0,0,1, 0,1,0,1, 0,0,1,1]);
    const color = new Float32Array(3);
    surface.sample(1, 1, null, color);
    assert.deepEqual([...color], [0.5, 0.25, 0.25]);
});

test("triangle plane, seams, cell boundaries and clamped edge probes agree", () => {
    // y = 2x + 3z, rectangle spanning multiple spatial-index cells.
    const surface = new MeshSurface(
        [-20, -70, -10, 20, 10, -10, -20, -10, 10, 20, 70, 10],
        [0, 2, 1, 1, 2, 3], 8
    );
    for (let z = -10; z <= 10; z += 2) {
        for (let x = -20; x <= 20; x += 2) {
            assert.ok(Math.abs(surface.sample(x, z) - (2 * x + 3 * z)) < 1e-8);
        }
    }
    assert.equal(surface.sample(100, 100), 70);
    const normal = {
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
        normalize() { const n = Math.hypot(this.x, this.y, this.z); this.x /= n; this.y /= n; this.z /= n; return this; },
    };
    surface.sample(0, 0, normal);
    assert.ok(Math.abs(normal.x + 2 / Math.sqrt(14)) < 1e-8);
    assert.ok(Math.abs(normal.z + 3 / Math.sqrt(14)) < 1e-8);
});

test("overlapping triangles choose the upper surface and ignore vertical faces", () => {
    const surface = new MeshSurface(
        [0, 1, 0, 10, 1, 0, 0, 1, 10, 0, 7, 0, 10, 7, 0, 0, 7, 10, 0, 20, 0],
        [0, 1, 2, 3, 4, 5, 0, 3, 6]
    );
    assert.equal(surface.sample(2, 2), 7);
    assert.throws(() => surface.sample(9, 9), /No Exalted terrain triangle/);
});
