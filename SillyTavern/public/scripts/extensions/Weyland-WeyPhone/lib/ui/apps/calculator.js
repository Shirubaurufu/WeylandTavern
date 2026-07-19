// lib/ui/apps/calculator.js

// Thin renderer over lib/calculatorEngine.js — Android-calc grid, state lives in index.js.

const KEY_ROWS = [
    ['C', '±', '%', '÷'],
    ['7', '8', '9', '×'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['⌫', '0', '.', '='],
];

const OP_KEYS = new Set(['÷', '×', '-', '+', '=']);
const FN_KEYS = new Set(['C', '±', '%', '⌫']);

export const CALCULATOR_PALETTES = [
    { id: 'graphite', label: 'Graphite', colors: ['#5d646d', '#24282e', '#dce1e7'] },
    { id: 'plum', label: 'Plum', colors: ['#76547f', '#2d2132', '#f0dff1'] },
    { id: 'mint', label: 'Mint', colors: ['#4b8b75', '#172b27', '#dff6ed'] },
    { id: 'sunset', label: 'Sunset', colors: ['#c86658', '#3a2528', '#ffe9df'] },
    { id: 'ocean', label: 'Ocean', colors: ['#3c79a8', '#182735', '#e0f1ff'] },
    { id: 'paper', label: 'Paper', colors: ['#737373', '#dedbd2', '#252525'] },
];

function calculatorHeader({ settings = false } = {}) {
    return `
<div class="wp-calculator-header">
    ${settings ? '<button type="button" id="wp-calc-settings-back" class="wp-calculator-header-btn" title="Back" aria-label="Back"><i class="fa-solid fa-arrow-left"></i></button>' : '<i class="fa-solid fa-calculator"></i>'}
    <span>${settings ? 'Calculator colors' : 'Calculator'}</span>
    <span class="wp-calculator-header-actions">
        <button type="button" class="wp-inline-help" data-app-key="calculator" title="What is this?" aria-label="What is this?"><i class="fa-solid fa-circle-question"></i></button>
        ${settings ? '' : '<button type="button" id="wp-calc-settings-button" class="wp-calculator-header-btn" title="Calculator settings" aria-label="Calculator settings"><i class="fa-solid fa-gear"></i></button>'}
    </span>
</div>`;
}

function keyClass(key) {
    if (key === '=') return ' wp-calc-key-equals';
    if (OP_KEYS.has(key)) return ' wp-calc-key-op';
    if (FN_KEYS.has(key)) return ' wp-calc-key-fn';
    return '';
}

/**
 * @param {HTMLElement} container #wp-screen-body
 * @param {{display: string}} state calculator engine state
 */
export function renderCalculatorScreen(container, state) {
    container.innerHTML = `
${calculatorHeader()}
<div class="wp-calc">
    <div id="wp-calc-display">${state.display}</div>
    <div class="wp-calc-grid">
        ${KEY_ROWS.flat().map(key => `
        <button type="button" class="wp-calc-key${keyClass(key)}" data-calc-key="${key}">${key}</button>`).join('')}
    </div>
</div>`;
}

export function renderCalculatorSettingsScreen(container, { selectedPalette = 'graphite' } = {}) {
    container.innerHTML = `
${calculatorHeader({ settings: true })}
<div class="wp-calc-settings">
    <div class="wp-settings-hint">Choose a color theme. Your keys and display update immediately.</div>
    <div class="wp-calc-palette-grid">
        ${CALCULATOR_PALETTES.map(palette => `
        <button type="button" class="wp-calc-palette-button${palette.id === selectedPalette ? ' wp-selected' : ''}" data-calc-palette="${palette.id}">
            <span class="wp-calc-palette-preview">${palette.colors.map(color => `<i style="background:${color}"></i>`).join('')}</span>
            <span>${palette.label}</span>
        </button>`).join('')}
    </div>
</div>`;
}

/** Cheap display-only update between keypresses (no full grid re-render → no focus loss). */
export function updateCalculatorDisplay(state) {
    const display = document.getElementById('wp-calc-display');
    if (display) display.textContent = state.display;
}
