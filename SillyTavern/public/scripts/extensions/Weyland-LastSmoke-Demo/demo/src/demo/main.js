import { DemoHost } from "./host.js";

const host = new DemoHost(document.getElementById("game-layer"));

addEventListener("pointerdown", (() => host.audio.unlock()), {
    once: true,
    capture: true
});

addEventListener("keydown", (() => host.audio.unlock()), {
    once: true,
    capture: true
});

document.addEventListener("visibilitychange", (() => {
    if (!document.hidden) host.music.duck(false);
}));

window.lastSmokeDemo = host;

host.open();
