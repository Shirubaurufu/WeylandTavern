const def = 1.0;
const ltm = 0.4;

(async function () {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        let [url, request] = args;
        // @ts-ignore
        if (url.includes('/generate') && request?.method === 'POST') {
            // @ts-ignore
            let body = JSON.parse(request.body);
            if (body) {
                if (body.chat_completion_source === "custom") {
                    if (!/https:\/\/(?:helixmind\.online|api\.electronhub\.ai|api\.zukijourney\.com|api\.zanity\.xyz(?:\/rp)?|fresedgpt\.space|ai\.megallm\.io|api\.z\.ai\/api\/coding\/paas(?:\/v4))(?:\/v1|)?/.test(body.custom_url)) {
                        delete request.body;
                        return originalFetch.apply(this, [url, request]);
                    }
                }
                if (!/claude-sonnet-4.5-rp|glm-4.7-thinking|kimi-k2-thinking/.test(body.model)) {
                    const mes = body.messages.at(-1);
                    if (mes.role === "assistant" && mes.content.startsWith("<think>")) {
                        body.messages = body.messages.slice(0, -1);
                    }
                }
                body.temperature = def;
                if (body.messages.findLast(({role, content}) => role === "user" && content.startsWith("LTM Creation in Process..."))) {
                    body.temperature = ltm;
                    body.custom_include_body = body.custom_include_body.replace(/(?:(?:\\n)?- ?)?temperature: \d\.\d/g,"");
                }
                request.body = JSON.stringify(body);
            }
        }

        return originalFetch.apply(this, [url, request]);
    };
})();
