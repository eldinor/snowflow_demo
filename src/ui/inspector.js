import { resetInput } from '../core/input.js';
import './inspector.css';

/** Inspector code and its UI dependencies are fetched only on the first Ctrl+I. */
export function installInspectorShortcut(scene) {
    let token = null, modulePromise = null, busy = false, disposed = false;
    const host = document.createElement('aside');
    host.id = 'inspector-host';
    host.setAttribute('aria-label', 'Babylon Inspector');
    host.hidden = true;
    document.body.append(host);

    const toggle = async () => {
        if (busy || disposed) return;
        busy = true;
        resetInput();
        if (document.pointerLockElement) document.exitPointerLock();
        try {
            if (token && !token.isDisposed) {
                await token.dispose();
                token = null;
                host.hidden = true;
                return;
            }
            host.hidden = false;
            host.removeAttribute('role');
            host.textContent = 'Loading Inspector…';
            modulePromise ??= import('@babylonjs/inspector');
            const { ShowInspector } = await modulePromise;
            if (disposed) return;
            host.textContent = '';
            token = ShowInspector(scene, {
                containerElement: host,
                layoutMode: 'overlay',
                // The app owns WebGPU canvas resizing; Inspector overlays it.
                autoResizeEngine: false,
                sidePaneRemapper: pane => ({
                    horizontalLocation: 'right',
                    verticalLocation: pane.key === 'Scene Explorer' ? 'top' : 'bottom',
                }),
            });
            token.onDisposed.addOnce(() => { host.hidden = true; });
        } catch (error) {
            modulePromise = null;
            host.textContent = 'Inspector could not load. Press Ctrl+I to retry.';
            host.setAttribute('role', 'alert');
            console.error('Babylon Inspector failed to load:', error);
        } finally { busy = false; }
    };
    const onKeyDown = event => {
        if (event.code !== 'KeyI' || !event.ctrlKey || event.altKey || event.shiftKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) void toggle();
    };
    window.addEventListener('keydown', onKeyDown, true);
    const dispose = () => {
        disposed = true;
        window.removeEventListener('keydown', onKeyDown, true);
        void token?.dispose();
        host.remove();
    };
    scene.onDisposeObservable.addOnce(dispose);
    if (import.meta.hot) import.meta.hot.dispose(dispose);
}
