import { getGlobalVariable } from '../../variables.js';
import { substituteParams } from '../../../script.js';
import { power_user } from '../../power-user.js';

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
                    if (!/https:\/\/(?:helixmind\.online|api\.electronhub\.ai|api\.zukijourney\.com|api\.zanity\.xyz(?:\/rp)?|fresedgpt\.space|ai\.megallm\.io|api\.z\.ai\/api\/coding\/paas(?:\/v4)|.*chutes\.ai|api\.meganova\.ai|api\.nebulablock\.com|api\.synthetic\.new|api\.naga\.ac|.*\.wey\.onl|.*\.ggez\.pro)(?:\/v1|)?/.test(body.custom_url)) {
                        delete request.body;
                        return originalFetch.apply(this, [url, request]);
                    }
                }
                const mes = body.messages.at(-1);
                const charBlacklist = body.char_name === "Kressa" || body.char_name === "Kinsbane Manor";
                const assistant = mes.role === "assistant";
                if (/(?=.*sonnet)(?=.*4\.5|).*|glm-4\.7|glm-5|kimi-k2-thinking|gemini-3/i.test(body.model)) {
                    const sub = substituteParams(getGlobalVariable("Thinking"));
                    if (!assistant && !charBlacklist) {
                        if (sub) {
                            body.messages.push({"role":"assistant","content":sub});
                        }
                    } else {
                        if (charBlacklist && assistant) {
                            body.messages = body.messages.slice(0, -1);
                        } else {
                            if (/\[overwrite\]/i.test(mes.content)) {
                                mes.content = mes.content.replace(/\[overwrite\]\s?/i, "").trimStart();
                            } else if (!charBlacklist) {
                                mes.content = sub;
                            }
                            if (!mes.content) {
                                body.messages = body.messages.slice(0, -1);
                            }
                        }
                    }
                } else if ((charBlacklist || mes.content.startsWith(power_user.user_prompt_bias)) && assistant) {
                    body.messages = body.messages.slice(0, -1);
                }

                if (/glm.*think/i.test(body.model)) {
                    body.include_reasoning = true;
                }
                if (/glm.*think/i.test(body.model)) {
                    body.include_reasoning = true;
                }
                body.temperature = def;
                if (body.messages.findLast(({role, content}) => role === "user" && (content.constructor === Array ? content.find(x => x.type === "text").text : content).startsWith("LTM Creation in Pro"))) {
                    body.temperature = ltm;
                    if (typeof body?.custom_include_body === 'string')
                        body.custom_include_body = body.custom_include_body.replace(/(?:(?:\\n)?- ?)?temperature: \d\.\d/g,"");
                }
                request.body = JSON.stringify(body);
            }
        }

        const response = await originalFetch.apply(this, [url, request]);
        // @ts-ignore
        if (url.includes('/generate') && request?.method === 'POST' && !(!!$('#stream_toggle').prop('checked'))) {
            const clonedResponse = response.clone();
            const data = await clonedResponse.json();
            const m = data.choices[0].message;
            if (!m.content && m.reasoning_content) {
                m.content = m.reasoning_content;
                m.reasoning_content = "";
            }
            data.choices[0].message = m;
            return new Response(JSON.stringify(data), {
                status: response.status,
                statusText: response.statusText,
                headers: new Headers(response.headers)
            });
        }
        return response;
    };
})();
