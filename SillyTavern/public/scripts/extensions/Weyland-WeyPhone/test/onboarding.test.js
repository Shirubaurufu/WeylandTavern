import test from 'node:test';
import assert from 'node:assert/strict';

import { ONBOARDING_PAGES, clampOnboardingPage } from '../lib/ui/onboarding.js';

test('onboarding stays concise and ends on the message-budget warning', () => {
    assert.equal(ONBOARDING_PAGES.length, 3);
    assert.equal(ONBOARDING_PAGES.some(page => page.title === 'The apps'), false);
    assert.match(ONBOARDING_PAGES[0].body, /@aerosplat/);
    assert.match(ONBOARDING_PAGES[0].body, /V1 walked so we could run/);
    assert.match(ONBOARDING_PAGES[0].emphasis, /Thank you Aero/);
    const last = ONBOARDING_PAGES[ONBOARDING_PAGES.length - 1];
    assert.match(last.body, /budget/i);
    assert.match(last.body, /one message|one request/i);
});

test('every onboarding page has an icon, title, and body', () => {
    for (const page of ONBOARDING_PAGES) {
        assert.ok(page.icon.startsWith('fa-'));
        assert.ok(page.title.length > 0);
        assert.ok(page.body.length > 0);
    }
});

test('clampOnboardingPage clamps into the valid page range', () => {
    assert.equal(clampOnboardingPage(-1), 0);
    assert.equal(clampOnboardingPage(0), 0);
    assert.equal(clampOnboardingPage(ONBOARDING_PAGES.length), ONBOARDING_PAGES.length - 1);
    assert.equal(clampOnboardingPage(1, 5), 1);
    assert.equal(clampOnboardingPage(99, 5), 4);
});
