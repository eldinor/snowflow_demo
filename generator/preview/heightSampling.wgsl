uniform worldOrigin: vec2f;
uniform worldExtent: vec2f;
uniform heightRes: f32;

var heightTex: texture_2d<f32>;
var heightTexSampler: sampler;

fn heightAtTexelCentre(texel: vec2f) -> f32 {
    let limit = uniforms.heightRes - 1.0;
    let p = clamp(texel, vec2f(0.0), vec2f(limit));
    let p0 = vec2i(floor(p));
    let p1 = min(p0 + vec2i(1), vec2i(i32(limit)));
    let f = fract(p);
    let h00 = textureLoad(heightTex, p0, 0).r;
    let h10 = textureLoad(heightTex, vec2i(p1.x, p0.y), 0).r;
    let h01 = textureLoad(heightTex, vec2i(p0.x, p1.y), 0).r;
    let h11 = textureLoad(heightTex, p1, 0).r;
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

fn worldHeight(worldXZ: vec2f) -> f32 {
    let texel = (worldXZ - uniforms.worldOrigin) / uniforms.worldExtent * uniforms.heightRes - vec2f(0.5);
    return heightAtTexelCentre(texel);
}
