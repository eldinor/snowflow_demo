/**
 * Spawn navigation and texture/wind controls backed by shared world settings.
 * @module ui/spawnBar
 */

import { DEFAULT_SPAWN, SPAWN_POINTS, type SpawnPoint } from "../world/spawnPoints.ts";
import { S, SCHEMA, set, onChange, type SettingKey } from '../core/settings.ts';
import "./spawnBar.css";

/** Keep spawn navigation and compact texture/wind controls separate from world simulation. */
export class SpawnBar {
    readonly root: HTMLElement;
    readonly panel: HTMLElement;
    readonly buttons: Map<string, HTMLButtonElement>;
    readonly status: HTMLElement;

    /**
     * Wire existing HTML controls to caller-owned navigation and texture changes, and subscribe wind widgets to shared settings.
     */
    constructor(onSelect: (point: Readonly<SpawnPoint>) => void, onTextureChange?: (useDesert: boolean) => void) {
        this.root = requiredElement('spawn-bar');
        this.panel = requiredElement('terrain-panel');
        const windPanel = requiredQuery<HTMLElement>(this.panel, '#wind-panel');
        const windKeys = ['windDirection', 'windStrength', 'bushWindStrength', 'bushWindSpeed'] as const satisfies readonly SettingKey[];
        const unsubscribers: Array<() => void> = [];
        for (const key of windKeys) {
            const setting = SCHEMA.flatMap(group => group.items).find(item => item.k === key);
            if (!setting || setting.min === undefined || setting.max === undefined || setting.step === undefined) {
                throw new Error(`Missing numeric schema for ${key}`);
            }
            const row = document.createElement('div');
            row.className = 'wind-control';
            const label = document.createElement('label');
            label.htmlFor = `sidebar-${key}`;
            label.textContent = key === 'windDirection' ? 'Direction' : setting.l;
            const output = document.createElement('output');
            output.htmlFor = `sidebar-${key}`;
            const slider = document.createElement('input');
            Object.assign(slider, { type: 'range', id: `sidebar-${key}`, min: setting.min, max: setting.max, step: setting.step });
            const sync = (value: number): void => {
                slider.value = String(value);
                output.textContent = key === 'windDirection' ? `${Math.round(value)}°` : Number(value).toFixed(2);
            };
            sync(S[key]);
            slider.addEventListener('input', () => set(key, Number(slider.value)));
            unsubscribers.push(onChange(key, sync));
            row.append(label, output, slider);
            windPanel.append(row);
        }
        if (import.meta.hot) import.meta.hot.dispose(() => unsubscribers.forEach(unsubscribe => unsubscribe()));
        const desert = requiredQuery<HTMLInputElement>(this.panel, '#use-desert-textures');
        const procedural = requiredQuery<HTMLInputElement>(this.panel, '#use-procedural-textures');
        const selectTextures = (useDesert: boolean): void => {
            desert.checked = useDesert;
            procedural.checked = !useDesert;
            onTextureChange?.(useDesert);
        };
        desert.addEventListener('change', () => selectTextures(desert.checked));
        procedural.addEventListener('change', () => selectTextures(!procedural.checked));
        this.buttons = new Map();
        const nav = requiredQuery<HTMLElement>(this.root, "nav");
        this.status = requiredQuery<HTMLElement>(this.root, "[role=status]");
        for (const point of SPAWN_POINTS) {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.spawn = point.id;
            button.setAttribute("aria-label", `${point.name}, ${point.biome}`);
            const biome = document.createElement("span");
            biome.className = "spawn-biome";
            biome.textContent = point.biome;
            const name = document.createElement("span");
            name.className = "spawn-name";
            name.textContent = point.name;
            button.append(biome, name);
            button.addEventListener("click", () => onSelect(point));
            this.buttons.set(point.id, button);
            nav.append(button);
        }
        this.select(DEFAULT_SPAWN);
    }

    /** Reveal navigation and its panel after the world becomes usable. */
    show(): void { this.root.hidden = false; this.panel.hidden = false; }

    /**
     * Update selected destination styling and caption after navigation; does not move the avatar itself.
     */
    select(point: Readonly<SpawnPoint>): void {
        for (const [id, button] of this.buttons) {
            button.setAttribute("aria-pressed", String(id === point.id));
        }
        this.status.textContent = `${point.name} · ${point.biome}`;
    }
}

function requiredElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing #${id}`);
    return element;
}

function requiredQuery<T extends Element>(parent: ParentNode, selector: string): T {
    const element = parent.querySelector<T>(selector);
    if (!element) throw new Error(`Missing ${selector}`);
    return element;
}
