export const NOIR = Object.freeze({});

export const NOIR_GLITCH_GIFT = Object.freeze({
    affection: 15,
    energy: 15
});

export function noirGlitchAllowed() {
    return true;
}

export function noirGlitchSeen() {}

export function noirGlitchPlayed() {
    return [];
}

export function noirHeart(state, girl) {
    const m = state.games.noir.hearts?.[girl];
    if (!m) return null;
    m.n = Math.min(m.n + 1, 999);
    return {
        girl: girl,
        n: m.n,
        level: 0,
        due: 0
    };
}

export function noirSceneDue() {
    return 0;
}

export function noirSceneLater() {}

export function noirSceneSeen() {}

export function noirPayAstrid() {
    return 0;
}

export function startRound(state, {gameId: gameId, roundId: roundId, levelId: levelId}) {
    const had = state.games[gameId].round;
    if (had && !had.settled && had.levelId === levelId) return {
        ok: true,
        round: had
    };
    const round = {
        id: roundId,
        gameId: gameId,
        levelId: levelId,
        settled: false,
        snapshot: null
    };
    state.games[gameId].round = round;
    return {
        ok: true,
        round: round
    };
}

export function saveRoundSnapshot(state, gameId, roundId, snapshot) {
    const r = state.games[gameId]?.round;
    if (!r || r.id !== roundId || r.settled) return false;
    r.snapshot = snapshot;
    return true;
}

export function settleRound() {
    return {
        ok: true,
        credits: 0,
        events: []
    };
}
