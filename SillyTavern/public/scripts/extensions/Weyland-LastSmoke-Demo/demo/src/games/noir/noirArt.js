export const INK = "#111014", PAPER = "#efeadf", RED = "#d1263a", BLUE = "#2f5bd8";

export const SUIT_COLOR = {
    red: RED,
    blue: BLUE,
    black: INK,
    white: PAPER
};

export const NOIR_DIR = new URL("../../../assets/noir/", import.meta.url).href;

const MOODS = [ "calm", "grin", "cross", "smug", "shocked", "exhale", "blind", "broke" ];

export const DELIVERED = new Set([ ...[ "eve", "belle", "astrid" ].flatMap((g => MOODS.map((m => `chars/${g}-${m}`)))), "chars/astrid-sour", "chars/astrid-sorry", ...[ "eve", "belle", "astrid" ].flatMap((g => [ `chars/cutin-${g}`, `chars/cutin-${g}-hit` ])) ]);

export const artUrl = key => DELIVERED.has(key) ? `${NOIR_DIR}${key}.avif` : null;

export const envUrl = name => `${NOIR_DIR}env/${name}`;

export const uiUrl = name => `${NOIR_DIR}ui/${name}`;

export const allArt = () => [ ...DELIVERED ].map((k => `${NOIR_DIR}${k}.avif`));

const BAYER = [ [ 0, 8, 2, 10 ], [ 12, 4, 14, 6 ], [ 3, 11, 1, 9 ], [ 15, 7, 13, 5 ] ];

const W = 48, H = 48;

const LOOKS = {
    eve: {
        hair: .86,
        skin: .97,
        coat: .18,
        ears: 0,
        eye: RED,
        long: "side",
        extra: "cigarette"
    },
    belle: {
        hair: .93,
        skin: .97,
        coat: .22,
        ears: .95,
        eye: INK,
        streak: RED,
        long: "short",
        extra: "hose"
    },
    astrid: {
        hair: .06,
        skin: .97,
        coat: .12,
        ears: .06,
        eye: BLUE,
        lips: RED,
        long: "long",
        extra: "pearls"
    }
};

const bustCache = new Map;

export function bustUrl(who, mood = "calm") {
    const key = `${who}|${mood}`;
    const art = artUrl(`chars/${who}-${mood}`) || artUrl(`chars/${who}-calm`);
    if (art) return art;
    if (bustCache.has(key)) return bustCache.get(key);
    const L = LOOKS[who];
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const grey = v => `rgb(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)})`;
    g.fillStyle = grey(.32);
    g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(24, 18, 2, 24, 22, 30);
    glow.addColorStop(0, grey(.62));
    glow.addColorStop(1, grey(.16));
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
    g.fillStyle = grey(L.coat);
    g.beginPath();
    g.ellipse(24, 50, 22, 14, 0, 0, Math.PI * 2);
    g.fill();
    if (who === "eve") {
        g.fillStyle = grey(.32);
        g.beginPath();
        g.moveTo(12, 40);
        g.lineTo(20, 48);
        g.lineTo(10, 48);
        g.fill();
        g.beginPath();
        g.moveTo(36, 40);
        g.lineTo(28, 48);
        g.lineTo(38, 48);
        g.fill();
    }
    if (who === "astrid") {
        g.fillStyle = grey(L.skin);
        g.beginPath();
        g.ellipse(24, 43, 9, 4, 0, 0, Math.PI * 2);
        g.fill();
    }
    if (who === "belle") {
        g.fillStyle = grey(.9);
        g.fillRect(20, 38, 8, 10);
        g.fillStyle = grey(.1);
        g.fillRect(17, 38, 2, 10);
        g.fillRect(29, 38, 2, 10);
    }
    g.fillStyle = grey(L.hair);
    if (L.long === "long") {
        g.fillRect(12, 16, 24, 26);
    }
    if (L.long === "side") {
        g.fillRect(13, 14, 10, 24);
        g.fillRect(26, 14, 8, 16);
    }
    g.fillStyle = grey(L.ears);
    g.beginPath();
    g.moveTo(13, 14);
    g.lineTo(15, 2);
    g.lineTo(21, 10);
    g.fill();
    g.beginPath();
    g.moveTo(35, 14);
    g.lineTo(33, 2);
    g.lineTo(27, 10);
    g.fill();
    g.fillStyle = grey(.26);
    g.fillRect(24, 36, 1, 1);
    g.fillStyle = grey(L.skin);
    g.beginPath();
    g.ellipse(24, 23, 9, 11, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(21, 32, 6, 6);
    g.fillStyle = grey(L.hair);
    g.beginPath();
    g.ellipse(24, 15, 11, 7, 0, Math.PI, 0);
    g.fill();
    if (who === "eve") {
        g.beginPath();
        g.moveTo(14, 14);
        g.lineTo(28, 14);
        g.lineTo(18, 26);
        g.fill();
    }
    if (who === "astrid") {
        g.fillRect(15, 13, 18, 5);
    }
    if (who === "belle") {
        g.fillRect(14, 12, 20, 4);
        g.fillRect(14, 12, 3, 12);
        g.fillRect(31, 12, 3, 12);
    }
    const img = g.getImageData(0, 0, W, H), d = img.data;
    const ink = [ 17, 16, 20 ], paper = [ 239, 234, 223 ];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, v = d[i] / 255;
        const on = v > (BAYER[y % 4][x % 4] + .5) / 16;
        const col = on ? paper : ink;
        d[i] = col[0];
        d[i + 1] = col[1];
        d[i + 2] = col[2];
        d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const px = (x, y, w, h, col) => {
        g.fillStyle = col;
        g.fillRect(x, y, w, h);
    };
    const eyeY = mood === "cross" ? 23 : 22;
    if (who !== "eve") px(18, eyeY, 3, 2, L.eye);
    px(27, eyeY, 3, 2, L.eye);
    if (mood === "cross") {
        px(17, 20, 4, 1, INK);
        px(27, 20, 4, 1, INK);
    }
    const mouth = L.lips || INK;
    if (mood === "grin") {
        px(21, 28, 6, 1, mouth);
        px(22, 29, 4, 1, mouth);
    } else if (mood === "cross") px(22, 29, 4, 1, mouth); else px(22, 28, 4, 1, mouth);
    if (L.streak) {
        px(14, 14, 2, 10, RED);
        px(32, 14, 2, 10, RED);
        px(16, 4, 2, 5, RED);
        px(30, 4, 2, 5, RED);
    }
    if (L.extra === "cigarette") {
        px(26, 28, 7, 1, PAPER);
        px(33, 28, 1, 1, RED);
    }
    if (L.extra === "pearls") for (let x = 16; x <= 32; x += 2) px(x, 40 + Math.round(Math.sin((x - 16) / 16 * Math.PI) * 3), 1, 1, PAPER);
    if (L.extra === "hose") {
        px(26, 29, 1, 1, INK);
        g.fillStyle = INK;
        for (let i = 0; i < 14; i++) g.fillRect(27 + i, 30 + Math.round(i * .9), 1, 1);
        px(26, 28, 2, 2, PAPER);
    }
    const url = c.toDataURL();
    bustCache.set(key, url);
    return url;
}
