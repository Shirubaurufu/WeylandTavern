// Android WebView aliases Courier New to Cutive Mono. Opt the affected UI into the
// device's regular monospace face, keeping each component's browser font stack elsewhere.
if (/\bAndroid\b.*;\s*wv\)/i.test(navigator.userAgent)) {
    const root = document.documentElement;
    root.classList.add('android-webview');
    root.style.setProperty('--weyland-webview-mono', 'monospace');
}
