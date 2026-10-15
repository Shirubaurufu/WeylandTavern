// Exercise the actual Formatter, including its paragraph pass and Showdown registration.
// Only browser imports and startup UI are stubbed; rendering functions come from the source.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { headerMuseStripExt } from '../../../Weyland-Formatter/muse-header.js';
import { isOocModeEnabled } from '../../../quick-reply-ext/src/oocMode.js';
import { extractPrivatePreparation, recoverReplyFromReasoning, repairReplyHeader, findPreparationReplyHeader, REPLY_HEADER, BAD_REPLY_HEADER, MUSE_REPLY_HEADER } from '../../../Weyland-Formatter/private-preparation.js';

const require = createRequire(import.meta.url);
const showdown = require('showdown');
const source = readFileSync(new URL('../../../Weyland-Formatter/index.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/\(async function \(\) \{[\s\S]*?\}\)\(\);/, '');
const renderingSource = readFileSync(new URL('../../../../../script.js', import.meta.url), 'utf8')
    .match(/export function messageFormatting\([\s\S]*?\n\}/)[0].replace(/^export /, '');

export function formatterHarness() {
    const chat = [{ name: 'Muse', is_user: false, extra: {} }, { name: 'Muse', is_user: false, extra: {} }];
    const extensionSettings = {};
    const interruptionNotices = [];
    const context = vm.createContext({
        SillyTavern: { getContext: () => ({ extensionSettings, chat }) },
        power_user: { quote_text_color: '#aa3f3f', italics_text_color: '#919191', reasoning: { prefix: '', suffix: '' }, allow_name2_display: true },
        headerMuseStripExt, isOocModeEnabled, extractPrivatePreparation, recoverReplyFromReasoning, repairReplyHeader, findPreparationReplyHeader, REPLY_HEADER, BAD_REPLY_HEADER, MUSE_REPLY_HEADER,
        updateMessageBlock: () => {},
        document: { querySelector: () => ({}) },
        console, performance, structuredClone, window: {},
        COMMENT_NAME_DEFAULT: 'Comment', systemUserName: 'System', mesForShowdownParse: '',
        regex_placement: { REASONING: 4, USER_INPUT: 1, SLASH_COMMAND: 3, AI_OUTPUT: 2 },
        getRegexedString: text => text, substituteParams: text => text,
        DOMPurify: { sanitize: text => text },
        encodeStyleTags: text => text, decodeStyleTags: text => text,
        getGlobalVariable: () => '',
        showMessageInterrupted: () => interruptionNotices.push('interrupted'),
        reloadMarkdownProcessor: () => {
            context.converter = new showdown.Converter({ literalMidWordUnderscores: true, underline: true, simpleLineBreaks: true, tables: true });
            // Showdown checks instanceof RegExp; VM regexes live in another realm.
            const add = context.converter.addExtension.bind(context.converter);
            context.converter.addExtension = (extensions, name) => add(extensions.map(ext =>
                ext.regex?.source ? { ...ext, regex: new RegExp(ext.regex.source, ext.regex.flags) } : ext), name);
        },
    });
    vm.runInContext(source + '\n' + renderingSource + '\ngetSettings(); updateReloadMarkdownProcessor();', context);
    return {
        context, chat, interruptionNotices,
        html: markdown => context.converter.makeHtml(markdown),
        render: (markdown, { isUser = false, isSystem = false, isReasoning = false, messageId = 1, name = chat[1].name } = {}) =>
            context.messageFormatting(markdown, name, isSystem, isUser, messageId, {}, isReasoning),
        paragraphs: markdown => context.formatParagraphs(markdown),
        async format(markdown) {
            chat[1].mes = markdown;
            await context.formatMessage(1);
            return chat[1].mes;
        },
    };
}
