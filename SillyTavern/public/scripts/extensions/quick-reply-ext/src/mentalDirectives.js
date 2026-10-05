export const MENTAL_DIRECTIVE_SETTINGS = Object.freeze([
    ['MentalToggle', 'MHR'],
    ['SecretsToggle', 'SBC'],
    ['DialogueToggle', 'DTH'],
    ['HappyToggle', 'GAH'],
    ['JoyToggle', 'WJS'],
]);
export const MENTAL_DIRECTIVES_RESET_VERSION = 'MentalDirectivesReset20261005';

// Once per account: clear both switches and cached prompt payloads. Subsequent
// manual choices survive reloads and rebuilds because the marker is persistent.
export function resetMentalDirectivesOnce(getGlobal, setGlobal) {
    if (String(getGlobal(MENTAL_DIRECTIVES_RESET_VERSION)) === '1') return false;
    for (const [toggle, payload] of MENTAL_DIRECTIVE_SETTINGS) {
        setGlobal(toggle, 'Disabled');
        setGlobal(payload, '');
    }
    setGlobal(MENTAL_DIRECTIVES_RESET_VERSION, '1');
    return true;
}
