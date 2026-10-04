// Kept independent of startup/extension imports so it can precede APP_READY onboarding.
export const AGE_NOTICE_VERSION = 1;

export function hasAgeConfirmation(settings) {
    const confirmation = settings.weylandAgeConfirmation;
    return confirmation?.version === AGE_NOTICE_VERSION
        && typeof confirmation.confirmedAt === 'string'
        && Number.isFinite(Date.parse(confirmation.confirmedAt));
}

export async function ensureAgeConfirmation(settings, saveSettings, { preview = false } = {}) {
    if (hasAgeConfirmation(settings) && !preview) return;

    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/css/weyland-age-notice.css';
    await new Promise(resolve => {
        stylesheet.onload = resolve;
        stylesheet.onerror = resolve;
        document.head.append(stylesheet);
    });

    const dialog = document.createElement('dialog');
    dialog.id = 'weyland-age-notice';
    dialog.setAttribute('aria-labelledby', 'weyland-age-title');
    dialog.setAttribute('aria-describedby', 'weyland-age-description');
    dialog.innerHTML = `
        <header>WEYLAND TAVERN</header>
        <section class="weyland-age-content">
            <span class="weyland-age-badge" aria-hidden="true">18+</span>
            <h2 id="weyland-age-title">For adults only</h2>
            <div id="weyland-age-description">
                <p>Weyland Tavern is intended for adults aged 18 and over.</p>
                <p>AI-generated roleplay is unpredictable and may include mature themes such as violence, strong language, substance use, nudity, and explicit sexual content.</p>
                <p>You must be 18 or older to install or use Weyland Tavern and its services.</p>
            </div>
            <label class="weyland-age-check"><input id="weyland-age-confirm" type="checkbox"> <span>I confirm that I am 18 years of age or older.</span></label>
            <div class="weyland-age-actions">
                <button id="weyland-age-continue" type="button" disabled>Continue</button>
                <button id="weyland-age-exit" type="button">Exit</button>
            </div>
            <p class="weyland-age-footnote">Your confirmation will be remembered for this user profile.</p>
        </section>`;
    // Escape and backdrop clicks must never resume startup without confirmation.
    dialog.addEventListener('cancel', event => event.preventDefault());
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    });
    document.body.append(dialog);
    dialog.showModal();

    await new Promise(resolve => {
        const checkbox = dialog.querySelector('#weyland-age-confirm');
        const continueButton = dialog.querySelector('#weyland-age-continue');
        const exitButton = dialog.querySelector('#weyland-age-exit');
        checkbox.addEventListener('change', () => { continueButton.disabled = !checkbox.checked; });
        continueButton.addEventListener('click', async () => {
            if (!checkbox.checked || continueButton.disabled) return;
            continueButton.disabled = true;
            exitButton.disabled = true;
            settings.weylandAgeConfirmation = {
                version: AGE_NOTICE_VERSION,
                confirmedAt: new Date().toISOString(),
            };
            try {
                if (await saveSettings() === false) throw new Error('Settings could not be saved');
                dialog.close();
                dialog.remove();
                resolve();
            } catch (error) {
                delete settings.weylandAgeConfirmation;
                continueButton.disabled = false;
                exitButton.disabled = false;
                const footnote = dialog.querySelector('.weyland-age-footnote');
                footnote.textContent = 'Confirmation could not be saved. Check your connection and try again.';
                footnote.setAttribute('role', 'alert');
                console.error('Could not save age confirmation', error);
            }
        });
        exitButton.addEventListener('click', () => {
            // A normal browser tab cannot reliably close itself. Keep its app inaccessible
            // and leave startup pending; no confirmation is written when the user exits.
            dialog.querySelector('.weyland-age-content').innerHTML = `
                <h2 id="weyland-age-title">Weyland Tavern closed</h2>
                <p id="weyland-age-description">You can close this tab. No age confirmation has been saved.</p>`;
        });
    });
}
