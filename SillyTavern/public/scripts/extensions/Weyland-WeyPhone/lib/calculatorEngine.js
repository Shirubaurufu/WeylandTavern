// lib/calculatorEngine.js

// Pure four-function calculator state machine — all logic here, zero DOM, so the whole thing is
// unit-testable. The UI (lib/ui/apps/calculator.js) just renders state.display and forwards keys.

/** @typedef {{display: string, acc: number|null, op: string|null, fresh: boolean}} CalcState */

/** @returns {CalcState} */
export function initialState() {
    return { display: '0', acc: null, op: null, fresh: true };
}

function applyOp(a, op, b) {
    switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '×': return a * b;
        case '÷': return b === 0 ? NaN : a / b;
        default: return b;
    }
}

function formatResult(value) {
    if (Number.isNaN(value)) return 'Error';
    if (!Number.isFinite(value)) return 'Error';
    // Trim float noise while keeping up to 10 significant digits on screen.
    const rounded = Number(value.toPrecision(10));
    return String(rounded);
}

/**
 * Advances the calculator by one keypress. Keys: '0'-'9', '.', '+', '-', '×', '÷', '=', 'C',
 * '±', '%', '⌫'. Unknown keys are no-ops.
 * @param {CalcState} state
 * @param {string} key
 * @returns {CalcState}
 */
export function reduceKeypress(state, key) {
    if (key === 'C') return initialState();

    // After an error, only C resets; everything else is ignored.
    if (state.display === 'Error') return state;

    if (/^[0-9]$/.test(key)) {
        if (state.fresh || state.display === '0') {
            return { ...state, display: key, fresh: false };
        }
        if (state.display.replace(/[-.]/g, '').length >= 10) return state; // display cap
        return { ...state, display: state.display + key };
    }

    if (key === '.') {
        if (state.fresh) return { ...state, display: '0.', fresh: false };
        if (state.display.includes('.')) return state; // one decimal point only
        return { ...state, display: state.display + '.' };
    }

    if (key === '±') {
        if (state.display === '0') return state;
        return { ...state, display: state.display.startsWith('-') ? state.display.slice(1) : `-${state.display}` };
    }

    if (key === '%') {
        return { ...state, display: formatResult(parseFloat(state.display) / 100), fresh: true };
    }

    if (key === '⌫') {
        if (state.fresh) return state;
        const trimmed = state.display.length > 1 ? state.display.slice(0, -1) : '0';
        return { ...state, display: trimmed === '-' ? '0' : trimmed };
    }

    if (['+', '-', '×', '÷'].includes(key)) {
        const current = parseFloat(state.display);
        if (state.op !== null && !state.fresh) {
            // Chained operation: resolve the pending one first (2 + 3 × → shows 5, pending ×).
            const result = applyOp(state.acc, state.op, current);
            const display = formatResult(result);
            if (display === 'Error') return { ...initialState(), display: 'Error' };
            return { display, acc: parseFloat(display), op: key, fresh: true };
        }
        // Operator pressed twice (or right after =): just swap the pending operator.
        return { ...state, acc: current, op: key, fresh: true };
    }

    if (key === '=') {
        if (state.op === null) return { ...state, fresh: true };
        const result = applyOp(state.acc, state.op, parseFloat(state.display));
        const display = formatResult(result);
        if (display === 'Error') return { ...initialState(), display: 'Error' };
        return { display, acc: null, op: null, fresh: true };
    }

    return state;
}
