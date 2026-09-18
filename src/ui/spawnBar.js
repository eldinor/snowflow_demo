/**
 * Spawn navigation and texture/wind controls backed by shared world settings.
 * @module ui/spawnBar
 */

import { DEFAULT_SPAWN, SPAWN_POINTS } from "../world/spawnPoints.js";
import { S, SCHEMA, set, onChange } from '../core/settings.js';
import "./spawnBar.css";

/** Keep spawn navigation and compact texture/wind controls separate from world simulation. */
export class SpawnBar {
    /**
     * Wire existing HTML controls to caller-owned navigation and texture changes, and subscribe wind widgets to shared settings.
     */
    constructor(onSelect, onTextureChange) {
        this.root = document.getElementById("spawn-bar");
        this.panel = document.getElementById('terrain-panel');
        const windPanel = this.panel.querySelector('#wind-panel');
        const windKeys = ['windDirection', 'windStrength', 'bushWindStrength', 'bushWindSpeed'];
        const unsubscribers = [];
        for (const key of windKeys) {
            const setting = SCHEMA.flatMap(group => group.items).find(item => item.k === key);
            const row = document.createElement('div');
            row.className = 'wind-control';
            const label = document.createElement('label');
            label.htmlFor = `sidebar-${key}`;
            label.textContent = key === 'windDirection' ? 'Direction' : setting.l;
            const output = document.createElement('output');
            output.htmlFor = `sidebar-${key}`;
            const slider = document.createElement('input');
            Object.assign(slider, { type: 'range', id: `sidebar-${key}`, min: setting.min, max: setting.max, step: setting.step });
            const sync = value => {
                slider.value = value;
                output.textContent = key === 'windDirection' ? `${Math.round(value)}°` : Number(value).toFixed(2);
            };
            sync(S[key]);
            slider.addEventListener('input', () => set(key, Number(slider.value)));
            unsubscribers.push(onChange(key, sync));
            row.append(label, output, slider);
            windPanel.append(row);
        }
        if (import.meta.hot) import.meta.hot.dispose(() => unsubscribers.forEach(unsubscribe => unsubscribe()));
        const desert = this.panel.querySelector('#use-desert-textures');
        const procedural = this.panel.querySelector('#use-procedural-textures');
        const selectTextures = (useDesert) => {
            desert.checked = useDesert;
            procedural.checked = !useDesert;
            onTextureChange?.(useDesert);
        };
        desert.addEventListener('change', () => selectTextures(desert.checked));
        procedural.addEventListener('change', () => selectTextures(!procedural.checked));
        this.buttons = new Map();
        const nav = this.root.querySelector("nav");
        this.status = this.root.querySelector("[role=status]");
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
    show() { this.root.hidden = false; this.panel.hidden = false; }

    /**
     * Update selected destination styling and caption after navigation; does not move the avatar itself.
     */
    select(point) {
        for (const [id, button] of this.buttons) {
            button.setAttribute("aria-pressed", String(id === point.id));
        }
        this.status.textContent = `${point.name} · ${point.biome}`;
    }
}
