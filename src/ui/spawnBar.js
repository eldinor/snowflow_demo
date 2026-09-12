import { DEFAULT_SPAWN, SPAWN_POINTS } from "../world/spawnPoints.js";
import "./spawnBar.css";

export class SpawnBar {
    constructor(onSelect) {
        this.root = document.getElementById("spawn-bar");
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

    show() { this.root.hidden = false; }

    select(point) {
        for (const [id, button] of this.buttons) {
            button.setAttribute("aria-pressed", String(id === point.id));
        }
        this.status.textContent = `${point.name} · ${point.biome}`;
    }
}
