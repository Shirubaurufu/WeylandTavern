// Exercise the actual Formatter, including its paragraph pass and Showdown registration.
// Only browser imports and startup UI are stubbed; rendering functions come from the source.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { headerMuseStripExt } from '../../../Weyland-Formatter/muse-header.js';

const require = createRequire(import.meta.url);
const showdown = require('showdown');
const source = readFileSync(new URL('../../../Weyland-Formatter/index.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/\(async function \(\) \{[\s\S]*?\}\)\(\);/, '');

export function formatterHarness() {
    const chat = [{ name: 'Muse', is_user: false, extra: {} }, { name: 'Muse', is_user: false, extra: {} }];
    const extensionSettings = {};
    const context = vm.createContext({
        SillyTavern: { getContext: () => ({ extensionSettings, chat }) },
        power_user: { quote_text_color: '#aa3f3f', italics_text_color: '#919191' },
        headerMuseStripExt, console, performance, structuredClone, window: {},
        getGlobalVariable: () => '',
        reloadMarkdownProcessor: () => {
            context.converter = new showdown.Converter({ literalMidWordUnderscores: true, underline: true, simpleLineBreaks: true, tables: true });
            // Showdown checks instanceof RegExp; VM regexes live in another realm.
            const add = context.converter.addExtension.bind(context.converter);
            context.converter.addExtension = (extensions, name) => add(extensions.map(ext =>
                ext.regex?.source ? { ...ext, regex: new RegExp(ext.regex.source, ext.regex.flags) } : ext), name);
        },
    });
    vm.runInContext(source + '\ngetSettings(); updateReloadMarkdownProcessor();', context);
    return {
        context, chat,
        html: markdown => context.converter.makeHtml(markdown),
        paragraphs: markdown => context.formatParagraphs(markdown),
        async format(markdown) {
            chat[1].mes = markdown;
            await context.formatMessage(1);
            return chat[1].mes;
        },
    };
}
