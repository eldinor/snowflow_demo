/** Session screenshot capture, preview, download and ZIP export UI. @module ui/screenshotGallery */

import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { CreateScreenshotAsync } from "@babylonjs/core/Misc/screenshotTools";
import {
    createScreenshotZip, ScreenshotCollection, type ScreenshotEntry,
} from "./screenshotCollection.ts";
import "./screenshotGallery.css";

const PNG_PREFIX = "data:image/png;base64,";

function dataUrlToBlob(dataUrl: string): Blob {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) throw new Error("Screenshot data is not a data URL.");
    const bytes = Uint8Array.from(atob(dataUrl.slice(comma + 1)), (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: "image/png" });
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    queueMicrotask(() => URL.revokeObjectURL(url));
}

function icon(path: string): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(svg.namespaceURI, "path");
    shape.setAttribute("d", path);
    svg.append(shape);
    return svg;
}

/** Capture the final Babylon canvas and manage its bounded session gallery. */
export class ScreenshotGallery {
    private readonly collection = new ScreenshotCollection(12);
    private readonly root = document.createElement("section");
    private readonly strip = document.createElement("div");
    private readonly status = document.createElement("div");
    private readonly downloadAllButton = document.createElement("button");
    private readonly lightbox = document.createElement("div");
    private readonly lightboxImage = document.createElement("img");
    private readonly lightboxPosition = document.createElement("span");
    private readonly previousButton: HTMLButtonElement;
    private readonly nextButton: HTMLButtonElement;
    private readonly closeButton: HTMLButtonElement;
    private activePreviewId: number | null = null;
    private previewReturnFocus: HTMLElement | null = null;
    private capturing = false;
    private disposed = false;

    constructor(
        private readonly engine: AbstractEngine,
        private readonly camera: Camera,
    ) {
        this.root.className = "screenshot-gallery";
        this.root.hidden = true;
        this.root.setAttribute("aria-label", "Scene screenshots");
        this.strip.className = "screenshot-strip";
        this.status.className = "screenshot-status";
        this.status.setAttribute("role", "status");
        this.status.setAttribute("aria-live", "polite");
        this.downloadAllButton.type = "button";
        this.downloadAllButton.className = "screenshot-download-all";
        this.downloadAllButton.hidden = true;
        this.downloadAllButton.append(icon("M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3"), "Download all");
        this.downloadAllButton.addEventListener("click", () => void this.downloadAll());
        this.root.append(this.strip, this.downloadAllButton, this.status);
        document.body.append(this.root);

        this.lightbox.className = "screenshot-lightbox";
        this.lightbox.hidden = true;
        this.lightbox.setAttribute("role", "dialog");
        this.lightbox.setAttribute("aria-modal", "true");
        this.lightbox.setAttribute("aria-label", "Screenshot preview");
        const frame = document.createElement("div");
        frame.className = "screenshot-lightbox-frame";
        this.lightboxImage.alt = "";
        const footer = document.createElement("div");
        footer.className = "screenshot-lightbox-footer";
        this.lightboxPosition.setAttribute("aria-live", "polite");
        this.previousButton = this.lightboxButton(
            "Previous screenshot", "M15 18l-6-6 6-6", () => this.stepPreview(-1)
        );
        this.nextButton = this.lightboxButton(
            "Next screenshot", "M9 6l6 6-6 6", () => this.stepPreview(1)
        );
        this.closeButton = this.lightboxButton(
            "Close preview", "M6 6l12 12M18 6 6 18", () => this.closePreview()
        );
        this.closeButton.classList.add("screenshot-lightbox-close");
        footer.append(this.previousButton, this.lightboxPosition, this.nextButton);
        frame.append(this.lightboxImage, footer, this.closeButton);
        this.lightbox.append(frame);
        this.lightbox.addEventListener("pointerdown", (event) => {
            if (event.target === this.lightbox) this.closePreview();
        });
        document.body.append(this.lightbox);
        window.addEventListener("keydown", this.onPreviewKeyDown, true);
    }

    /** Queue one current-viewport PNG after Babylon finishes the next rendered frame. */
    async capture(): Promise<void> {
        if (this.capturing || this.disposed) return;
        this.capturing = true;
        this.root.hidden = false;
        this.setStatus("Capturing…");
        try {
            const width = this.engine.getRenderWidth(true);
            const height = this.engine.getRenderHeight(true);
            const dataUrl = await CreateScreenshotAsync(
                this.engine, this.camera, { width, height }, "image/png"
            );
            if (!dataUrl.startsWith(PNG_PREFIX)) throw new Error("Babylon returned an invalid PNG.");
            this.collection.add(dataUrlToBlob(dataUrl));
            this.render();
            this.setStatus("Screenshot saved", true);
        } catch (error) {
            console.error("[exalted] screenshot capture failed", error);
            this.setStatus("Screenshot failed", true);
        } finally {
            this.capturing = false;
        }
    }

    /** Download every retained PNG in one ZIP archive. */
    async downloadAll(): Promise<void> {
        if (this.collection.entries.length === 0 || this.disposed) return;
        this.downloadAllButton.disabled = true;
        this.setStatus("Creating ZIP…");
        try {
            const bytes = await createScreenshotZip(this.collection.entries);
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" }), `exalted-screenshots-${stamp}.zip`);
            this.setStatus("ZIP downloaded", true);
        } catch (error) {
            console.error("[exalted] screenshot ZIP failed", error);
            this.setStatus("ZIP creation failed", true);
        } finally {
            this.downloadAllButton.disabled = false;
        }
    }

    /** Delete all retained captures and hide the empty gallery. */
    clear(): void {
        this.collection.clear();
        this.render();
    }

    /** Release image URLs and detach the gallery. */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.collection.clear();
        this.root.remove();
        this.lightbox.remove();
        window.removeEventListener("keydown", this.onPreviewKeyDown, true);
    }

    private render(): void {
        this.strip.replaceChildren(...this.collection.entries.map((entry) => this.card(entry)));
        this.root.hidden = this.collection.entries.length === 0 && !this.capturing;
        this.downloadAllButton.hidden = this.collection.entries.length === 0;
        this.renderPreview();
    }

    private card(entry: ScreenshotEntry): HTMLElement {
        const card = document.createElement("article");
        card.className = "screenshot-card";
        const image = document.createElement("img");
        image.src = entry.url;
        image.alt = `Scene captured at ${entry.capturedAt.toLocaleTimeString()}`;
        const time = document.createElement("time");
        time.dateTime = entry.capturedAt.toISOString();
        time.textContent = entry.capturedAt.toLocaleTimeString([], {
            hour: "2-digit", minute: "2-digit", second: "2-digit",
        });
        const actions = document.createElement("div");
        actions.className = "screenshot-actions";
        const preview = document.createElement("button");
        preview.type = "button";
        preview.title = "Preview screenshot";
        preview.setAttribute("aria-label", `Preview ${entry.filename}`);
        preview.append(icon("M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"));
        preview.addEventListener("click", () => this.openPreview(entry.id, preview));
        const download = document.createElement("button");
        download.type = "button";
        download.title = "Download screenshot";
        download.setAttribute("aria-label", `Download ${entry.filename}`);
        download.append(icon("M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3"));
        download.addEventListener("click", () => downloadBlob(entry.blob, entry.filename));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.title = "Delete screenshot";
        remove.setAttribute("aria-label", `Delete ${entry.filename}`);
        remove.append(icon("M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"));
        remove.addEventListener("click", () => {
            this.collection.remove(entry.id);
            this.render();
        });
        actions.append(preview, download, remove);
        card.append(image, time, actions);
        return card;
    }

    private openPreview(id: number, trigger: HTMLElement): void {
        this.activePreviewId = id;
        this.previewReturnFocus = trigger;
        if (document.pointerLockElement) document.exitPointerLock();
        this.lightbox.hidden = false;
        this.renderPreview();
        this.closeButton.focus();
    }

    private closePreview(): void {
        if (this.lightbox.hidden) return;
        this.lightbox.hidden = true;
        this.activePreviewId = null;
        const returnFocus = this.previewReturnFocus;
        this.previewReturnFocus = null;
        if (returnFocus?.isConnected) returnFocus.focus();
    }

    private stepPreview(offset: number): void {
        const entries = this.collection.entries;
        if (entries.length < 2 || this.activePreviewId === null) return;
        const index = entries.findIndex((entry) => entry.id === this.activePreviewId);
        const nextIndex = (Math.max(0, index) + offset + entries.length) % entries.length;
        this.activePreviewId = entries[nextIndex].id;
        this.renderPreview();
    }

    private renderPreview(): void {
        if (this.lightbox.hidden || this.activePreviewId === null) return;
        const entries = this.collection.entries;
        let index = entries.findIndex((entry) => entry.id === this.activePreviewId);
        if (index < 0) {
            if (entries.length === 0) {
                this.closePreview();
                return;
            }
            index = entries.length - 1;
            this.activePreviewId = entries[index].id;
        }
        const entry = entries[index];
        this.lightboxImage.src = entry.url;
        this.lightboxImage.alt = `Scene captured at ${entry.capturedAt.toLocaleTimeString()}`;
        this.lightboxPosition.textContent = entries.length > 1
            ? `${index + 1} / ${entries.length}`
            : entry.capturedAt.toLocaleTimeString();
        const hasNavigation = entries.length > 1;
        this.previousButton.hidden = !hasNavigation;
        this.nextButton.hidden = !hasNavigation;
    }

    private lightboxButton(label: string, path: string, action: () => void): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-label", label);
        button.title = label;
        button.append(icon(path));
        button.addEventListener("click", action);
        return button;
    }

    private readonly onPreviewKeyDown = (event: KeyboardEvent): void => {
        if (this.lightbox.hidden) return;
        if (event.code === "Escape") this.closePreview();
        else if (event.code === "ArrowLeft") this.stepPreview(-1);
        else if (event.code === "ArrowRight") this.stepPreview(1);
        else return;
        event.preventDefault();
        event.stopImmediatePropagation();
    };

    private setStatus(message: string, clear = false): void {
        this.status.textContent = message;
        if (clear) window.setTimeout(() => {
            if (this.status.textContent === message) this.status.textContent = "";
        }, 1800);
    }
}
