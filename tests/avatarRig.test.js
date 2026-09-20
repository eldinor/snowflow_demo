import test from 'node:test';
import assert from 'node:assert/strict';
import {
    AVATAR_BIND_FRAMES,
    AVATAR_BONE_NAMES,
    AVATAR_BONE_PARENTS,
    AVATAR_RIG,
    BONE_COUNT,
} from '../src/character/avatarRig.ts';
import { DEFAULT_AVATAR_MANIFEST } from '../src/character/avatarExchange.ts';

test('avatar rig has stable unique names and a parent-before-child hierarchy', () => {
    assert.equal(AVATAR_BONE_NAMES.length, BONE_COUNT);
    assert.equal(new Set(AVATAR_BONE_NAMES).size, BONE_COUNT);
    assert.equal(AVATAR_RIG.length, BONE_COUNT);
    assert.equal(AVATAR_BIND_FRAMES.length, BONE_COUNT * 9);
    for (let index = 0; index < BONE_COUNT; index++) {
        assert.equal(AVATAR_RIG[index].index, index);
        assert.equal(AVATAR_RIG[index].name, AVATAR_BONE_NAMES[index]);
        assert.equal(AVATAR_RIG[index].parent, AVATAR_BONE_PARENTS[index]);
        assert.ok(AVATAR_BONE_PARENTS[index] < index);
    }
});

test('avatar bind frames contain finite normalized directions', () => {
    for (const bone of AVATAR_RIG) {
        for (const value of [...bone.joint, ...bone.direction, ...bone.forward]) {
            assert.ok(Number.isFinite(value));
        }
        const directionLength = Math.hypot(...bone.direction);
        const forwardLength = Math.hypot(...bone.forward);
        const dot = bone.direction.reduce((sum, value, axis) => sum + value * bone.forward[axis], 0);
        assert.ok(Math.abs(directionLength - 1) < 0.01, bone.name);
        assert.ok(Math.abs(forwardLength - 1) < 0.01, bone.name);
        assert.ok(Math.abs(dot) < 0.13, bone.name);
    }
});

test('default exchange manifest identifies the shared rig and rigid head slot', () => {
    assert.equal(DEFAULT_AVATAR_MANIFEST.schema, 'exalted-avatar-exchange');
    assert.equal(DEFAULT_AVATAR_MANIFEST.rig, 'exalted-humanoid-v1');
    assert.deepEqual(DEFAULT_AVATAR_MANIFEST.parts.head, {
        node: 'part:head',
        mode: 'rigid',
        bone: 'head',
    });
    assert.equal(DEFAULT_AVATAR_MANIFEST.cloth.editable, false);
});
