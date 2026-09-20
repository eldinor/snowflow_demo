import { AVATAR_EXCHANGE_VERSION, AVATAR_RIG_ID, type AvatarBoneName } from './avatarRig.ts';

export type AvatarPartMode = 'rigid' | 'skinned' | 'cloth-reference' | 'generated';

export interface AvatarPartManifest {
    node: string;
    mode: AvatarPartMode;
    bone?: AvatarBoneName;
}

/** Versioned sidecar contract shared by authoring and preparation tools. */
export interface AvatarExchangeManifest {
    schema: 'exalted-avatar-exchange';
    version: typeof AVATAR_EXCHANGE_VERSION;
    units: 'meters';
    upAxis: '+Y';
    forwardAxis: '+Z';
    rig: typeof AVATAR_RIG_ID;
    parts: Record<string, AvatarPartManifest>;
    cloth: {
        editable: boolean;
        topology: string;
    };
}

export const DEFAULT_AVATAR_MANIFEST = Object.freeze({
    schema: 'exalted-avatar-exchange',
    version: AVATAR_EXCHANGE_VERSION,
    units: 'meters',
    upAxis: '+Y',
    forwardAxis: '+Z',
    rig: AVATAR_RIG_ID,
    parts: {
        body: { node: 'part:body', mode: 'skinned' },
        head: { node: 'part:head', mode: 'rigid', bone: 'head' },
        cloth: { node: 'reference:cloth', mode: 'cloth-reference' },
        fur: { node: 'reference:fur', mode: 'generated', bone: 'hood' },
    },
    cloth: { editable: false, topology: 'exalted-cloth-v1' },
} satisfies AvatarExchangeManifest);
