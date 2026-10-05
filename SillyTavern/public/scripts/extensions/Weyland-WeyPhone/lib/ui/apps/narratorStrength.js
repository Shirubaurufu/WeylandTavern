import { resolveNarratorStrength } from '../../../../quick-reply-ext/src/narratorStrength.js';

export function narratorStrengthHtml({ strength, disabled = false, id = 'wp-narrator-strength' } = {}) {
    const high = resolveNarratorStrength(strength) === 'High';
    return `<section class="wp-narrative-strength" aria-labelledby="${id}-title">
        <h3 id="${id}-title">Narrator Strength</h3>
        <div class="wp-narrative-strength-keys" role="group" aria-labelledby="${id}-title" aria-describedby="${id}-effects">
            ${['Low', 'High'].map(value => `<button type="button" data-narrative-action="set-narrator-strength" data-value="${value}" aria-pressed="${(value === 'High') === high}" ${disabled ? 'disabled' : ''}><i aria-hidden="true"></i><span>${value}</span></button>`).join('')}
        </div>
        <div class="wp-narrative-strength-effects" id="${id}-effects" aria-live="polite">
            <span class="wp-narrative-strength-gain">↑ ${high ? 'Narrator Voice' : 'Short term memory'}</span>
            <span class="wp-narrative-strength-cost">↓ ${high ? 'Short term memory' : 'Narrator Voice'}</span>
        </div>
    </section>`;
}
