import { eventSource, event_types } from "../../../script.js";

const KEY = "last-smoke-demo";

const ICON_URL = new URL("./app-icon-v2.png", import.meta.url).href;

const PAGE_URL = new URL("./demo/index.html", import.meta.url).href;

let frame = null;

let listener = null;

function mountDemo(container, controls = {}) {
    if (!(container instanceof HTMLElement)) throw new Error("WeyPhone did not provide an app screen.");
    unmountDemo();
    frame = document.createElement("iframe");
    frame.className = "wp-external-app-frame";
    frame.title = "Last Smoke (demo)";
    frame.allow = "autoplay";
    frame.src = `${PAGE_URL}?v=${Date.now()}`;
    listener = event => {
        if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
        if (event.data?.lastSmokeDemo === "close") controls.close?.();
    };
    window.addEventListener("message", listener);
    container.replaceChildren(frame);
}

function unmountDemo() {
    if (listener) window.removeEventListener("message", listener);
    listener = null;
    frame?.remove();
    frame = null;
}

function registerPhoneTile() {
    const apps = window.weyPhoneExternalApps ||= [];
    if (apps.some((app => app?.key === KEY))) return;
    apps.push({
        key: KEY,
        label: "Last Smoke",
        icon: ICON_URL,
        accent: "#d1263a",
        mount: mountDemo,
        unmount: unmountDemo
    });
    document.dispatchEvent(new CustomEvent("weyphone:apps-changed"));
}

eventSource.on(event_types.APP_READY, registerPhoneTile);

registerPhoneTile();
