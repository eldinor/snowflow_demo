export interface GlbInspection {
    readonly valid: boolean;
    readonly meshes: number;
    readonly nodes: number;
    readonly materials: number;
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
}

/** Performs dependency-free structural GLB validation before Babylon imports an asset. */
export function inspectGlb(bytes: Uint8Array): GlbInspection {
    const errors: string[] = [], warnings: string[] = [];
    if (bytes.byteLength < 20) return { valid: false, meshes: 0, nodes: 0, materials: 0, errors: ['GLB is shorter than its header and JSON chunk.'], warnings };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67) errors.push('Invalid GLB magic.');
    if (view.getUint32(4, true) !== 2) errors.push('Only glTF 2.0 GLB files are supported.');
    if (view.getUint32(8, true) !== bytes.byteLength) errors.push('Declared GLB length does not match the file.');
    const jsonLength = view.getUint32(12, true);
    if (view.getUint32(16, true) !== 0x4e4f534a) errors.push('First GLB chunk is not JSON.');
    if (20 + jsonLength > bytes.byteLength) errors.push('GLB JSON chunk exceeds the file length.');
    if (errors.length) return { valid: false, meshes: 0, nodes: 0, materials: 0, errors, warnings };
    try {
        const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim()) as Record<string, unknown>;
        const asset = json.asset as { version?: string } | undefined;
        if (asset?.version !== '2.0') errors.push('JSON asset.version must be 2.0.');
        const meshes = Array.isArray(json.meshes) ? json.meshes.length : 0;
        const nodes = Array.isArray(json.nodes) ? json.nodes.length : 0;
        const materials = Array.isArray(json.materials) ? json.materials.length : 0;
        if (meshes === 0) errors.push('GLB contains no meshes.');
        if (nodes === 0) warnings.push('GLB contains no nodes.');
        if (materials === 0) warnings.push('GLB contains no materials.');
        return { valid: errors.length === 0, meshes, nodes, materials, errors, warnings };
    } catch {
        errors.push('GLB JSON chunk is not valid JSON.');
        return { valid: false, meshes: 0, nodes: 0, materials: 0, errors, warnings };
    }
}
