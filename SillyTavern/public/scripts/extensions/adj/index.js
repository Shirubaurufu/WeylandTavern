const def = 1.0;
const ltm = 0.4;

(async function () {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        let [url, options] = args;

        // @ts-ignore
        if (url.includes('/generate') && options?.method === 'POST') {
            // @ts-ignore
            let body = JSON.parse(options.body);
            if (body) {
                body.temperature = def;
                const message = body.messages.at(-1);
                if (message.role === "user" && message.content.startsWith("LTM Creation in Process...")) {
                    body.temperature = ltm;
                    body.custom_include_body = body.custom_include_body.replace(/(?:(?:\\n)?- ?)?temperature: \d\.\d/g,"");
                }
                options.body = JSON.stringify(body);
            }
        }

        return originalFetch.apply(this, [url, options]);
    };
})();
