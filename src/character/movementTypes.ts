/** Shared structural contracts for character movement modes and lightweight tests. */
import type { PropCollisions, WorldPoint } from '../world/propCollisions.ts';
import type { WaterSample } from '../world/waterSurface.ts';

export interface MovementVector2 { x: number; z: number }
export interface MovementVector3 extends WorldPoint {}

export interface MovementVelocity extends MovementVector3 {}

export interface MovementWater {
    sample(x: number, z: number): WaterSample | null;
}

export interface MovementHeightfield {
    clampToPlayArea(position: MovementVector3): void;
}

export interface MovementTerrain {
    heightAt(x: number, z: number): number;
    water?: MovementWater;
    obstacles?: PropCollisions;
    heightfield?: MovementHeightfield;
}

export interface MovementCharacter {
    terrain: MovementTerrain;
    position: MovementVector3;
    velocity: MovementVelocity;
    groundY?: number;
}

export interface MovementAxes {
    moveX: number;
    moveZ: number;
}

export interface SwimmingInput extends MovementAxes { sprint: boolean }

export interface FlightInput extends MovementAxes {
    flyPressed: boolean;
    flyUp: boolean;
    flyDown: boolean;
}
