import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import {
    createScreenshotZip, ScreenshotCollection, screenshotFilename,
} from "../src/ui/screenshotCollection.ts";

test("screenshot filenames are safe and timestamped", () => {
    assert.equal(
        screenshotFilename(new Date("2026-09-22T12:34:56.789Z")),
        "exalted-screenshot-2026-09-22T12-34-56-789Z.png",
    );
});

test("collection replaces and revokes the oldest screenshot at capacity", () => {
    const revoked: string[] = [];
    let url = 0;
    const collection = new ScreenshotCollection(2, () => `blob:${++url}`, (value) => revoked.push(value));
    const first = collection.add(new Blob(["first"]));
    const second = collection.add(new Blob(["second"]));
    const third = collection.add(new Blob(["third"]));

    assert.deepEqual(collection.entries.map((entry) => entry.id), [second.id, third.id]);
    assert.deepEqual(revoked, [first.url]);
});

test("delete and clear revoke retained object URLs", () => {
    const revoked: string[] = [];
    let url = 0;
    const collection = new ScreenshotCollection(12, () => `blob:${++url}`, (value) => revoked.push(value));
    const first = collection.add(new Blob(["first"]));
    const second = collection.add(new Blob(["second"]));

    assert.equal(collection.remove(first.id), true);
    assert.equal(collection.remove(999), false);
    collection.clear();
    assert.deepEqual(revoked, [first.url, second.url]);
    assert.equal(collection.entries.length, 0);
});

test("ZIP export contains every retained PNG under its download filename", async () => {
    const collection = new ScreenshotCollection(12, () => "blob:test", () => undefined);
    collection.add(new Blob([new Uint8Array([1, 2, 3])]), new Date("2026-09-22T10:00:00Z"));
    collection.add(new Blob([new Uint8Array([4, 5])]), new Date("2026-09-22T10:00:01Z"));

    const files = unzipSync(await createScreenshotZip(collection.entries));
    assert.deepEqual(Object.keys(files), collection.entries.map((entry) => entry.filename));
    assert.deepEqual([...files[collection.entries[0].filename]], [1, 2, 3]);
    assert.deepEqual([...files[collection.entries[1].filename]], [4, 5]);
});
