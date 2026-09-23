/** Allow the local Ollama OpenAI endpoint without opening the provider gate to remote hosts. */
export function isLocalOllamaEndpoint(value) {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol)
            && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
            && url.port === '11434'
            && /^\/v1\/?$/.test(url.pathname)
            && !url.username && !url.password && !url.search && !url.hash;
    } catch {
        return false;
    }
}
