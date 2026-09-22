import { zipSync } from "fflate";

/** Data retained for one screenshot in the session gallery. */
export interface ScreenshotEntry {
    readonly id: number;
    readonly capturedAt: Date;
    readonly filename: string;
    readonly blob: Blob;
    readonly url: string;
}

/** Produce filesystem-safe names that remain sortable by capture time. */
export function screenshotFilename(date: Date): string {
    return `exalted-screenshot-${date.toISOString().replace(/[:.]/g, "-")}.png`;
}

/** Encode the retained PNGs under their public download names. */
export async function createScreenshotZip(entries: readonly ScreenshotEntry[]): Promise<Uint8Array> {
    const files: Record<string, Uint8Array> = {};
    for (const entry of entries) {
        files[entry.filename] = new Uint8Array(await entry.blob.arrayBuffer());
    }
    return zipSync(files, { level: 6 });
}

/** Own screenshot object URLs and evict the oldest item when capacity is reached. */
export class ScreenshotCollection {
    readonly entries: ScreenshotEntry[] = [];
    private nextId = 1;

    constructor(
        readonly capacity = 12,
        private readonly createUrl: (blob: Blob) => string = URL.createObjectURL,
        private readonly revokeUrl: (url: string) => void = URL.revokeObjectURL,
    ) {
        if (capacity < 1) throw new Error("Screenshot capacity must be positive.");
    }

    add(blob: Blob, capturedAt = new Date()): ScreenshotEntry {
        if (this.entries.length === this.capacity) this.remove(this.entries[0].id);
        const entry: ScreenshotEntry = {
            id: this.nextId++,
            capturedAt,
            filename: screenshotFilename(capturedAt),
            blob,
            url: this.createUrl(blob),
        };
        this.entries.push(entry);
        return entry;
    }

    remove(id: number): boolean {
        const index = this.entries.findIndex((entry) => entry.id === id);
        if (index < 0) return false;
        const [entry] = this.entries.splice(index, 1);
        this.revokeUrl(entry.url);
        return true;
    }

    clear(): void {
        for (const entry of this.entries) this.revokeUrl(entry.url);
        this.entries.length = 0;
    }
}
