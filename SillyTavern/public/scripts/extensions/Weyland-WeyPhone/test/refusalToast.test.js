import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../openai.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const start = source.indexOf('const ANTI_DISTILLATION_REFUSAL');
const end = source.indexOf('/**\n * Gets the API model', start);

function refusalHarness() {
    const calls = [];
    const context = vm.createContext({
        t: parts => parts.join(''),
        toastr: { error: (...args) => calls.push(args) },
        $: () => ({ text(value) { return { html: () => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') }; } }),
    });
    // Use the actual handler, isolated from API setup and browser startup.
    assert.ok(start >= 0 && end > start, 'the live refusal handler was found');
    vm.runInContext(source.slice(start, end), context);
    return { check: context.checkRefusal, calls };
}

test('distillation refusal gives the requested minimal notice without advice or provider text', () => {
    for (const refusal of ['Restrictions on reverse engineering model outputs', 'Duplicating model outputs', 'Suspected distillation']) {
        const { check, calls } = refusalHarness();
        check({ choices: [{ message: { refusal } }] }, null);
        assert.deepEqual(calls, [["Claude's distillation protection was triggered."]]);
    }
});

test('streamed distillation refusals display at most once', () => {
    const { check, calls } = refusalHarness();
    const state = {};
    const chunk = { choices: [{ delta: { refusal: 'distillation' } }] };
    check(chunk, state);
    check(chunk, state);
    assert.equal(calls.length, 1);
    assert.equal(state.refusalShown, true);
});

test('generic refusals still show escaped provider text; ordinary replies show no toast', () => {
    const { check, calls } = refusalHarness();
    check({ choices: [{ message: { content: 'Hello' } }] }, null);
    assert.equal(calls.length, 0);
    check({ choices: [{ message: { refusal: '<script>unsafe</script>' } }] }, null);
    assert.equal(calls[0][0], '&lt;script&gt;unsafe&lt;/script&gt;');
    assert.equal(calls[0][1], 'The provider refused this message');
});
