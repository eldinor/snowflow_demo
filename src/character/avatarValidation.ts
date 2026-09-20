/** Machine-readable result produced by the offline avatar inspector. */
export interface AvatarValidationIssue {
    severity: 'error' | 'warning';
    code: string;
    message: string;
}

export interface AvatarMeshReport {
    node: string;
    vertices: number;
    triangles: number;
    attributes: string[];
    bounds?: { min: number[]; max: number[] };
}

export interface AvatarValidationReport {
    schema: 'exalted-avatar-validation';
    version: 1;
    source: string;
    byteLength: number;
    valid: boolean;
    generator?: string;
    scene: {
        nodes: number;
        meshes: number;
        materials: number;
        skins: number;
    };
    rig: {
        expected: string;
        joints: string[];
        missing: string[];
        additional: string[];
        duplicated: string[];
    };
    body: {
        height: number | null;
        weightVertices: number;
        invalidWeightVertices: number;
        maximumInfluences: number;
        unknownJointVertices: number;
    };
    meshes: AvatarMeshReport[];
    issues: AvatarValidationIssue[];
}

