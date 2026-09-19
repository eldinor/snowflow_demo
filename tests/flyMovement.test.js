import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flyMovement } from '../src/mountain/flyMovement.js';

test('fly speed stays constant diagonally and Shift triples it', () => {
    assert.equal(Math.hypot(...flyMovement(new Set(['KeyW', 'KeyD']), 100, .01)), 1);
    assert.equal(Math.hypot(...flyMovement(new Set(['KeyW', 'ShiftLeft']), 100, .01)), 3);
});

test('opposing controls cancel and stalled frames cannot teleport the camera', () => {
    assert.deepEqual(flyMovement(new Set(['KeyW', 'KeyS']), 100, 1), [0, 0, 0]);
    assert.equal(flyMovement(new Set(['Space']), 100, 1)[1], 5);
});
