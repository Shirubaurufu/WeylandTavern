import { artUrl, bustUrl } from "./noirArt.js";

import { SHOTS, SPEAKERS } from "./noirHearts.js";

import { splitActs } from "./noirUI.js";

const el = (tag, className = "", props = {}) => Object.assign(document.createElement(tag), className ? {
    className: className
} : {}, props);

const isLine = b => Array.isArray(b);

export const flagIs = (flags, [k, v]) => v === null ? flags[k] == null : flags[k] === v;

export function walkScene(beats, flags = {}, pick = opts => opts[0]) {
    const out = [];
    const go = list => {
        for (const b of list || []) {
            if (isLine(b) || b.shot) {
                out.push(b);
                continue;
            }
            if (b.if) {
                go(flagIs(flags, b.if) ? b.then : b.else);
                continue;
            }
            if (b.choose) {
                const o = pick(b.choose);
                out.push({
                    chose: o
                });
                if (o.set) Object.assign(flags, o.set);
                go(o.then);
            }
        }
    };
    go(beats);
    return {
        out: out,
        flags: flags
    };
}

function shotFrame(key) {
    const def = SHOTS[key] || {
        mood: "calm",
        tone: "night"
    };
    const url = artUrl(`scenes/${key}`);
    const frame = el("div", `nr-sc-shot tone-${def.tone}${url ? " art" : ""}`);
    if (url) {
        frame.append(el("img", "nr-sc-img", {
            src: url,
            alt: "",
            draggable: false
        }));
        return frame;
    }
    const other = def.who && def.who !== "astrid";
    const actor = other ? el("b", "nr-sc-who", {
        textContent: (SPEAKERS[def.who] || def.who).toUpperCase()
    }) : el("img", "nr-sc-actor", {
        src: bustUrl("astrid", def.mood),
        alt: "",
        draggable: false
    });
    frame.append(el("i", "nr-sc-glow"), actor, el("i", "nr-sc-vignette"));
    return frame;
}

export async function playScene(mount, scene, ctx) {
    const flags = {
        ...ctx.flags || {}
    }, set = {};
    const fill = t => String(t).replace(/\{(\w+)\}/g, ((m, k) => ctx.vars?.[k] != null ? ctx.vars[k] : m));
    const root = el("div", "nr-sc");
    const stage = el("div", "nr-sc-stage");
    const box = el("div", "nr-sc-box");
    const act = el("div", "nr-sc-act");
    const name = el("b", "nr-sc-name");
    const text = el("p", "nr-sc-text");
    const more = el("i", "nr-more");
    box.append(name, text, more);
    const opts = el("div", "nr-sc-opts");
    const low = el("div", "nr-sc-low");
    low.append(act, box, opts);
    root.append(stage, low);
    mount.append(root);
    requestAnimationFrame((() => root.classList.add("on")));
    let paid = false;
    const tapped = () => new Promise((res => {
        if (!ctx.alive()) return res(false);
        root.classList.add("waiting");
        const at = performance.now();
        const go = e => {
            if (e.target.closest("button")) return;
            if (performance.now() - at < 350) return;
            root.removeEventListener("pointerdown", go);
            clearInterval(poll);
            root.classList.remove("waiting");
            ctx.tap?.();
            res(true);
        };
        const poll = setInterval((() => {
            if (!ctx.alive()) {
                root.removeEventListener("pointerdown", go);
                clearInterval(poll);
                res(false);
            }
        }), 120);
        root.addEventListener("pointerdown", go);
    }));
    const show = (who, raw) => {
        const {acts: acts, said: said} = splitActs(fill(raw));
        const narrator = who === "cap";
        box.className = `nr-sc-box ${narrator ? "cap" : `say s-${who}`}`;
        name.textContent = narrator ? "" : (SPEAKERS[who] || who).toUpperCase();
        act.textContent = acts.join(".. ");
        act.classList.toggle("on", acts.length > 0 && !narrator);
        text.textContent = narrator ? fill(raw) : said;
        box.classList.toggle("only-act", !narrator && !said);
        box.classList.remove("in");
        void box.offsetWidth;
        box.classList.add("in");
        opts.replaceChildren();
        opts.classList.remove("on");
    };
    const choose = options => new Promise((res => {
        act.classList.remove("on");
        box.className = "nr-sc-box hidden";
        opts.replaceChildren(...options.map((o => {
            const b = el("button", "nr-sc-opt", {
                type: "button"
            });
            const mine = splitActs(fill(o.you));
            if (mine.acts.length) b.append(el("em", "", {
                textContent: mine.acts.join(".. ")
            }));
            if (mine.said) b.append(mine.said);
            b.onclick = e => {
                e.stopPropagation();
                ctx.tap?.();
                res(o);
            };
            return b;
        })));
        opts.classList.add("on");
        const poll = setInterval((() => {
            if (!ctx.alive()) {
                clearInterval(poll);
                res(null);
            }
        }), 120);
        opts.addEventListener("click", (() => clearInterval(poll)), {
            once: true
        });
    }));
    const run = async list => {
        for (const b of list || []) {
            if (!ctx.alive()) return false;
            if (b.shot) {
                const f = shotFrame(b.shot);
                stage.append(f);
                requestAnimationFrame((() => f.classList.add("in")));
                const old = [ ...stage.children ].slice(0, -1);
                setTimeout((() => old.forEach((o => o.remove()))), 700);
                continue;
            }
            if (isLine(b)) {
                show(b[0], b[1]);
                if (!await tapped()) return false;
                continue;
            }
            if (b.if) {
                if (!await run(flagIs(flags, b.if) ? b.then : b.else)) return false;
                continue;
            }
            if (b.choose) {
                const o = await choose(b.choose);
                if (!o || !ctx.alive()) return false;
                opts.classList.remove("on");
                if (o.set) {
                    Object.assign(flags, o.set);
                    Object.assign(set, o.set);
                }
                if (o.pay && !paid) {
                    paid = true;
                    await (ctx.onPay?.());
                }
                if (!await run(o.then)) return false;
            }
        }
        return true;
    };
    const finished = await run(scene.beats);
    root.classList.remove("on");
    await new Promise((r => setTimeout(r, 380)));
    root.remove();
    return finished ? {
        flags: set,
        paid: paid
    } : null;
}
