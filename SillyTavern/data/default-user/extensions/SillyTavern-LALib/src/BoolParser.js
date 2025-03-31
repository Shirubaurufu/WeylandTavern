import { chat_metadata, saveSettingsDebounced } from '../../../../../script.js';
import { extension_settings, saveMetadataDebounced } from '../../../../extensions.js';
import { SlashCommandClosure } from '../../../../slash-commands/SlashCommandClosure.js';
import { SlashCommandScope } from '../../../../slash-commands/SlashCommandScope.js';
import { resolveVariable } from '../../../../variables.js';



/** @readonly */
/** @enum {string?} */
export const BOOL_PART = {
    Expression: 'Expression',
    Flip: 'Flip',
    Literal: 'Literal',
    Bool: 'Bool',
    Var: 'Var',
    String: 'String',
    List: 'List',
    Number: 'Number',
    Regex: 'Regex',
    Comparison: 'Comparison',
    MathPair: 'MathPair',
    Math: 'Math',
    OperatorPair: 'OperatorPair',
    Operator: 'Operator',
    PreMath: 'PreMath',
    PostMath: 'PostMath',
    Macro: 'Macro',
    Type: 'Type',
};


export class BoolParser {
    /**@type {SlashCommandScope}*/ scope;
    /**@type {boolean}*/ verify = true;
    /**@type {string}*/ text;
    /**@type {number}*/ index;
    /**@type {number}*/ depth = -1;
    /**@type {boolean}*/ jumpedEscapeSequence = false;
    /**@type {BOOL_PART[]}*/ partIndex = [];

    get ahead() {
        return this.text.slice(this.index + 1);
    }
    get behind() {
        return this.text.slice(0, this.index);
    }
    get char() {
        return this.text[this.index];
    }
    get charAhead() {
        return this.text.slice(this.index);
    }
    get endOfText() {
        return this.index >= this.text.length || (/\s/.test(this.char) && /^\s+$/.test(this.ahead));
    }




    /**
     *
     * @param {SlashCommandScope} scope
     * @param {import('../../../../slash-commands/SlashCommand.js').NamedArguments} args
     */
    constructor(scope, args) {
        this.scope = new SlashCommandScope(scope);
        for (const [k, v] of Object.entries(Object.assign({ pipe:scope.pipe }, args))) {
            if (k[0] == '_') continue;
            if (this.scope.existsVariableInScope(k)) this.scope.setVariable(k, v);
            else this.scope.letVariable(k, v);
        }
    }

    resolveVariable(name, scope = null) {
        const parts = name.split(/(\*?\.)/);
        let part = parts.shift();
        let value;

        if (scope?.existsVariable(part)) {
            value = scope.getVariable(part);
        } else if (chat_metadata.variables && chat_metadata.variables[part] !== undefined) {
            value = resolveVariable(part);
        } else if (extension_settings.variables.global && extension_settings.variables.global[part] !== undefined) {
            value = resolveVariable(part);
        } else {
            return '';
        }

        if (parts.length > 1) {
            let op;
            let parsed;
            try { parsed = JSON.parse(value); } catch { /* empty */ }
            op = parts.shift();
            part = parts.shift();
            while (parsed !== undefined && op && part) {
                if (Array.isArray(parsed)) {
                    if (op == '*.') {
                        parsed = parsed.map(it=>{
                            if (!Array.isArray(it) || Number.isNaN(parseInt(part))) {
                                return it[part] ?? '';
                            } else {
                                return it.at(part) ?? '';
                            }
                        });
                    } else {
                        if (Number.isNaN(parseInt(part))) {
                            parsed = parsed[part];
                        } else {
                            parsed = parsed.at(part);
                        }
                    }
                } else {
                    parsed = (parsed ?? {})[part];
                }
                op = parts.shift();
                part = parts.shift();
            }
            if (typeof parsed == 'string') return parsed;
            if (parsed === undefined || parsed === null) return '';
            return JSON.stringify(parsed);
        } else {
            return value;
        }
    }

    setVariable(name, newValue, scope = null) {
        const parts = name.split('.');
        let part = parts.shift();
        let basePart = part;
        let value;
        let isScoped = false;
        let isChat = false;
        let isGlobal = false;
        if (scope?.existsVariable(part)) {
            value = scope.getVariable(part);
            isScoped = true;
        } else if (chat_metadata.variables && chat_metadata.variables[part] !== undefined) {
            value = resolveVariable(part);
            isChat = true;
        } else if (extension_settings.variables.global && extension_settings.variables.global[part] !== undefined) {
            value = resolveVariable(part);
            isGlobal = true;
        }
        if (parts.length) {
            if (value === undefined) {
                if (Number.isNaN(parseInt(parts[0]))) {
                    value = '{}';
                } else {
                    value = '[]';
                }
            }
            let parsed;
            try { parsed = JSON.parse(value); } catch { /* empty */ }
            const parsedValue = parsed;
            part = parts.shift();
            while (parsed !== undefined && parts.length > 0 && part) {
                if (Array.isArray(parsed)) {
                    parsed = parsed.at(part);
                } else {
                    parsed = (parsed ?? {})[part];
                }
                if (parsed === undefined) parsed = {};
                part = parts.shift();
            }
            if (parsed !== undefined && part !== undefined) {
                parsed[part] = newValue;
            }
            newValue = parsedValue;
        }
        if (typeof newValue != 'string') newValue = JSON.stringify(newValue);
        if (isScoped) {
            scope.setVariable(basePart, newValue);
        } else if (isChat) {
            chat_metadata.variables[basePart] = newValue;
            saveMetadataDebounced();
        } else if (isGlobal) {
            extension_settings.variables.global[basePart] = newValue;
            saveSettingsDebounced();
        } else {
            scope.letVariable(basePart, newValue);
        }
    }




    /**
     * Moves the index <length> number of characters forward and returns the last character taken.
     * @param {number} length Number of characters to take.
     * @returns The last character taken.
     */
    take(length = 1) {
        this.jumpedEscapeSequence = false;
        let content = this.char;
        this.index++;
        if (length > 1) {
            content += this.take(length - 1);
        }
        return content;
    }
    discardWhitespace() {
        while (/\s/.test(this.char)) {
            this.take(); // discard whitespace
            this.jumpedEscapeSequence = false;
        }
    }
    /**
     * Tests if the next characters match a symbol.
     * Moves the index forward if the next characters are backslashes directly followed by the symbol.
     * Expects that the current char is taken after testing.
     * @param {string|RegExp} sequence Sequence of chars or regex character group that is the symbol.
     * @param {number} offset Offset from the current index (won't move the index if offset != 0).
     * @returns Whether the next characters are the indicated symbol.
     */
    testSymbol(sequence, offset = 0) {
        const escapeOffset = this.jumpedEscapeSequence ? -1 : 0;
        const escapes = this.text.slice(this.index + offset + escapeOffset).replace(/^(\\*).*$/s, '$1').length;
        const test = (sequence instanceof RegExp) ?
            (text) => new RegExp(`^(${sequence.source})`, sequence.flags).test(text) :
            (text) => text.startsWith(sequence)
        ;
        if (test(this.text.slice(this.index + offset + escapeOffset + escapes))) {
            // no backslashes before sequence
            //   -> sequence found
            if (escapes == 0) return true;
            // uneven number of backslashes before sequence
            //   = the final backslash escapes the sequence
            //   = every preceding pair is one literal backslash
            //    -> move index forward to skip the backslash escaping the first backslash or the symbol
            // even number of backslashes before sequence
            //   = every pair is one literal backslash
            //    -> move index forward to skip the backslash escaping the first backslash
            if (!this.jumpedEscapeSequence && offset == 0) {
                this.index++;
                this.jumpedEscapeSequence = true;
            }
            return false;
        }
    }


    /**
     *
     * @param {string} text boolean expression
     * @param {boolean} verify whether to throw exception on parser errors (false allows incomplete expressions to be parsed)
     * @returns {()=>boolean|string|number}
     */
    parse(text, verify = true) {
        this.verify = verify;
        this.text = text;
        this.index = 0;
        this.depth = -1;
        this.partIndex = [];
        return this.parseExpression();
    }


    testExpression() {
        return this.testSymbol('(');
    }
    testExpressionEnd() {
        if (this.endOfText) {
            if (this.depth == 0 || !this.verify) return true;
            throw new Error('Unexpected end of expression');
        }
        return this.testSymbol(')');
    }
    parseExpression(openMath = true, openOp = true, openComp = true) {
        this.depth++;
        if (this.depth != 0) this.take(); // take openig "("
        this.discardWhitespace();
        // expression can start with:
        // - expression: (...)
        // - flip: !...
        // - literal: var/string/number/bool
        let value;
        if (this.testExpression()) {
            value = this.parseExpression();
        } else if (this.testFlip()) {
            value = this.parseFlip();
        } else if (this.testPreMath()) {
            value = this.parsePreMath();
        } else if (this.testLiteral()) {
            value = this.parseLiteral();
        } else if (this.verify) {
            throw new Error('What?');
        }
        this.discardWhitespace();
        if (this.testExpressionEnd()) {
            if (this.depth != 0) this.take(); // take closing ")"
            this.depth--;
            this.partIndex.push(BOOL_PART.Expression);
            this.discardWhitespace();
            // expression can be followed by:
            // - comparison
            // - operator
            // - math operator
            if (openComp && this.testComparison()) {
                value = this.parseComparison(value);
            } else if (openOp && this.testOperator()) {
                value = this.parseOperator(value);
            } else if (openMath && this.testMath()) {
                value = this.parseMath(value);
            }
        } else {
            throw new Error('Unexpected end of expression');
        }
        return value;
    }


    testFlip() {
        return this.testSymbol('!');
    }
    parseFlip() {
        this.partIndex.push(BOOL_PART.Flip);
        this.take(); // take "!"
        // flip must be followed by one of:
        // - expression: (...)
        // - literal: var/string/number/bool
        // - flip: !
        let value;
        if (this.testExpression()) {
            const v = this.parseExpression();
            value = ()=>!v();
        } else if (this.testLiteral()) {
            const v = this.parseLiteral(false, false, false);
            value = ()=>!v();
        } else if (this.testFlip()) {
            const v = this.parseFlip();
            value = ()=>!v();
        } else if (this.verify) {
            throw new Error('What?');
        }
        this.discardWhitespace();
        // flipped value must be directly followed by one of:
        // - end of expression
        // - comparison
        // - operator
        let op;
        if (this.testExpressionEnd()) {
            // ok
        } else if (this.testComparison()) {
            op = this.parseComparison(value);
        } else if (this.testOperator()) {
            op = this.parseOperator(value);
        } else if (this.verify) {
            throw new Error('What?');
        }
        return op ?? value;
    }

    testPreMath() {
        return this.testSymbol(/\+\+|--/);
    }
    parsePreMath() {
        this.partIndex.push(BOOL_PART.PreMath);
        const op = this.take(2);
        // pre math must be followed by var
        if (!this.testVar()) {
            throw new Error('What?');
        }
        const value = this.parseVar(false);
        const func = ()=>{
            const outcome = (value() + (op == '++' ? 1 : -1)).toString();
            const scope = this.scope.parent;
            if (this.scope.existsVariableInScope(value.varName)) {
                this.scope.setVariable(value.varName, outcome);
            } else if (scope.existsVariable(value.varName)) {
                scope.setVariable(value.varName, outcome);
            } else if (chat_metadata.variables && chat_metadata.variables[value.varName] !== undefined) {
                chat_metadata.variables[value.varName] = outcome;
                saveMetadataDebounced();
            } else if (extension_settings.variables.global && extension_settings.variables.global[value.varName] !== undefined) {
                extension_settings.variables.global[value.varName] = outcome;
                saveSettingsDebounced();
            } else {
                scope.letVariable(value.varName, outcome);
            }
            return outcome;
        };
        func.varName = value.varName;
        this.discardWhitespace();
        // preMath'ed value must be directly followed by one of:
        // - end of expression
        // - comparison
        // - operator
        let postOp;
        if (this.testExpressionEnd()) {
            // ok
        } else if (this.testComparison()) {
            postOp = this.parseComparison(func);
        } else if (this.testOperator()) {
            postOp = this.parseOperator(func);
        } else if (this.verify) {
            throw new Error('What?');
        }
        return postOp ?? func;
    }

    testPostMath() {
        return this.testSymbol(/\+\+|--/);
    }
    parsePostMath(value) {
        this.partIndex.push(BOOL_PART.PostMath);
        const op = this.take(2);
        const func = ()=>{
            const before = value();
            const outcome = (before + (op == '++' ? 1 : -1)).toString();
            const scope = this.scope.parent;
            if (this.scope.existsVariableInScope(value.varName)) {
                this.scope.setVariable(value.varName, outcome);
            } else if (scope.existsVariable(value.varName)) {
                scope.setVariable(value.varName, outcome);
            } else if (chat_metadata.variables && chat_metadata.variables[value.varName] !== undefined) {
                chat_metadata.variables[value.varName] = outcome;
                saveMetadataDebounced();
            } else if (extension_settings.variables.global && extension_settings.variables.global[value.varName] !== undefined) {
                extension_settings.variables.global[value.varName] = outcome;
                saveSettingsDebounced();
            } else {
                scope.letVariable(value.varName, outcome);
            }
            return before;
        };
        func.varName = value.varName;
        return func;
    }

    testAssignment() {
        return this.testSymbol(/(\+|-|\*{1,2}|\/{1,2}|%)?=(?!=)/);
    }
    parseAssignment(a) {
        const op = /(\+|-|\*{1,2}|\/{1,2}|%)?=/.exec(this.charAhead)[0];
        this.take(op.length);
        this.discardWhitespace();
        // must be followed by expression, reset depth
        // (assignment acts like a prefix to the expression)
        this.depth = -1;
        const expr = this.parseExpression();
        this.depth = 0;
        return ()=>{
            const value = expr();
            let outcome = a();
            switch (op) {
                case '=': {
                    outcome = value;
                    break;
                }
                case '+=': {
                    if (Array.isArray(outcome)) {
                        outcome.push(value);
                    } else {
                        outcome += value;
                    }
                    break;
                }
                case '-=': {
                    outcome -= value;
                    break;
                }
                case '*=': {
                    outcome *= value;
                    break;
                }
                case '/=': {
                    outcome /= value;
                    break;
                }
                case '//=': {
                    outcome = ~~(outcome / value);
                    break;
                }
                case '%=': {
                    outcome %= value;
                    break;
                }
                case '**=': {
                    outcome **= value;
                    break;
                }
            }
            outcome = outcome.toString();
            const scope = this.scope.parent;
            this.setVariable(a.varName, outcome, scope);
            return outcome;
        };
    }


    testLiteral() {
        return this.testBool()
            || this.testVar()
            || this.testString()
            || this.testNumber()
            || this.testList()
            || this.testRegex()
            || this.testMacro()
        ;
    }
    parseLiteral(openMath = true, openOp = true, openComp = true) {
        let value;
        if (this.testBool()) {
            value = this.parseBool();
        } else if (this.testVar()) {
            value = this.parseVar();
        } else if (this.testString()) {
            value = this.parseString();
        } else if (this.testNumber()) {
            value = this.parseNumber();
        } else if (this.testList()) {
            value = this.parseList();
        } else if (this.testRegex()) {
            value = this.parseRegex();
        } else if (this.testMacro()) {
            value = this.parseMacro();
        } else if (this.verify) {
            throw new Error('What?');
        }
        if (openMath || openOp) {
            this.discardWhitespace();
            // value can be followed by:
            // - comparison
            // - operator
            // - math operator
            // if value is var and first part of entire expression:
            // - assignment
            if (this.partIndex.length == 1 && this.partIndex.at(0) == BOOL_PART.Var && this.testAssignment()) {
                value = this.parseAssignment(value);
            } else if (openComp && this.testComparison()) {
                value = this.parseComparison(value);
            } else if (openComp && this.testTypeComparison()) {
                value = this.parseTypeComparison(value);
            } else if (openOp && this.testOperator()) {
                value = this.parseOperator(value);
            } else if (openMath && this.testMath()) {
                value = this.parseMath(value);
            }
        }
        return value;
    }

    testBool() {
        return this.testSymbol('true') || this.testSymbol('false');
    }
    parseBool() {
        this.partIndex.push(BOOL_PART.Bool);
        if (this.charAhead.startsWith('true')) {
            this.take(4);
            return ()=>true;
        } else if (this.charAhead.startsWith('false')) {
            this.take(5);
            return ()=>false;
        }
    }

    testVar() {
        return this.testSymbol(/[a-z_][a-z_0-9]*(\.(-?\d+|[a-z_][a-z_0-9]*))*/i);
    }
    parseVar(openPost = true) {
        this.partIndex.push(BOOL_PART.Var);
        const name = /^[a-z_][a-z_0-9]*(\*?\.(-?\d+|[a-z_][a-z_0-9]*))*/i.exec(this.charAhead)[0];
        this.take(name.length);
        const func = ()=>{
            const val = this.resolveVariable(name, this.scope);
            try {
                return JSON.parse(val);
            } catch { /* empty */ }
            const parser = new BoolParser(this.scope, {});
            parser.index = 0;
            parser.text = val;
            if (parser.testRegex()) {
                try {
                    return parser.parseRegex()();
                } catch { /* empty */ }
            }
            return val;
        };
        func.varName = name;
        if (openPost && this.testPostMath()) {
            return this.parsePostMath(func);
        }
        return func;
    }

    testString() {
        return this.testSymbol('\'');
    }
    testStringEnd() {
        if (this.endOfText) {
            if (this.verify) throw new Error('Unexpected end of string');
            return true;
        }
        return this.testSymbol('\'');
    }
    parseString() {
        this.partIndex.push(BOOL_PART.String);
        this.take(); // discard opening quote
        let value = '';
        while (!this.testStringEnd()) value += this.take();
        this.take(); // discard closing quote
        return ()=>value;
    }

    testList() {
        return this.testSymbol('[');
    }
    testListEnd() {
        if (this.endOfText) {
            if (this.verify) throw new Error('Unexpected end of list');
            return true;
        }
        return this.testSymbol(']');
    }
    parseList() {
        this.partIndex.push(BOOL_PART.List);
        let text = this.take(); // take opening "["
        let stack = 0;
        while (stack > 0 || !this.testListEnd()) {
            if (this.testList()) stack++;
            else if (this.testListEnd()) stack--;
            text += this.take();
        }
        text += this.take(); // take cloing "]"
        const value = JSON.parse(text);
        return ()=>value;
    }

    testNumber() {
        return this.testSymbol(/-?(\d+(\.\d+)?|\.\d+)/);
    }
    parseNumber() {
        this.partIndex.push(BOOL_PART.Number);
        const match = /^-?(\d+(\.\d+)?|\.\d+)/.exec(this.charAhead)[0];
        this.take(match.length);
        const value = Number(match);
        return ()=>value;
    }

    testRegex() {
        return this.testSymbol('/');
    }
    testRegexEnd() {
        if (this.endOfText) {
            if (this.verify) throw new Error('Unexpected end of regex');
            return true;
        }
        return this.testSymbol(/\/([dgimsuvy]*)/);
    }
    parseRegex() {
        this.partIndex.push(BOOL_PART.Regex);
        this.take(); // discard opening slash "/"
        let pattern = '';
        while (!this.testRegexEnd()) pattern += this.take();
        const flags = /\/([dgimsuvy]*)/.exec(this.charAhead)[1];
        this.take(flags.length + 1); // discard closing slash and flags (flags already collected)
        return ()=>new RegExp(pattern, flags);
    }

    testMacro() {
        return this.testSymbol('{');
    }
    testMacroEnd() {
        if (this.endOfText) {
            if (this.verify) throw new Error('Unexpected end of macro');
            return true;
        }
        return this.testSymbol('}');
    }
    parseMacro() {
        this.partIndex.push(BOOL_PART.Macro);
        let text = '{';
        while (!this.testMacroEnd()) text += this.take();
        text += this.take(); // take closing "}"
        text += '}';
        return ()=>{
            const value = new SlashCommandClosure().substituteParams(text, this.scope).toString();
            try {
                return JSON.parse(value);
            } catch { /* empty */ }
            const parser = new BoolParser(this.scope, {});
            parser.index = 0;
            parser.text = value;
            if (parser.testRegex()) {
                try {
                    return parser.parseRegex()();
                } catch { /* empty */ }
            }
            return value;
        };
    }


    testComparison() {
        return this.testSymbol(/==|!=|<(?:=>?)?|>=?|in |not in |starts with |ends with /);
    }
    parseComparison(a) {
        this.partIndex.push(BOOL_PART.Comparison);
        const op = /^(==|!=|<(?:=>?)?|>=?|in |not in |starts with |ends with )/.exec(this.charAhead)[0];
        this.take(op.length);
        this.discardWhitespace();
        // comparison operation must be followed by:
        // - expression
        // - literal
        // - flip
        let b;
        if (this.testExpression()) {
            b = this.parseExpression();
        } else if (this.testLiteral()) {
            b = this.parseLiteral(true, false, false);
        } else if (this.testFlip()) {
            b = this.parseFlip();
        } else if (this.testPreMath()) {
            b = this.parsePreMath();
        } else if (this.verify) {
            throw new Error('What?');
        }
        let value = ()=>{
            const aa = a();
            const bb = b();
            let v;
            if (aa instanceof RegExp) {
                switch (op.trim()) {
                    case '==': {
                        v = ()=>aa.test(bb);
                        break;
                    }
                    case '!=': {
                        v = ()=>!aa.test(bb);
                        break;
                    }
                    case 'in': {
                        v = ()=>bb.find(it=>aa.test(it)) != null;
                        break;
                    }
                    case 'not in': {
                        v = ()=>!bb.find(it=>aa.test(it));
                        break;
                    }
                    default: {
                        throw new Error('What?');
                    }
                }
            } else if (bb instanceof RegExp) {
                switch (op.trim()) {
                    case '==': {
                        v = ()=>bb.test(aa);
                        break;
                    }
                    case '!=': {
                        v = ()=>!bb.test(aa);
                        break;
                    }
                    default: {
                        throw new Error('What?');
                    }
                }
            } else {
                switch (op.trim()) {
                    case '==': {
                        v = ()=>aa == bb;
                        break;
                    }
                    case '!=': {
                        v = ()=>aa != bb;
                        break;
                    }
                    case '<': {
                        v = ()=>aa < bb;
                        break;
                    }
                    case '<=': {
                        v = ()=>aa <= bb;
                        break;
                    }
                    case '<=>': {
                        v = ()=>{
                            let aParsed = aa;
                            let bParsed = bb;
                            if (typeof aa == 'string') {
                                if (aa.length > 0) {
                                    const num = Number(aa);
                                    if (!Number.isNaN(num)) {
                                        aParsed = num;
                                    }
                                }
                            }
                            if (typeof bb == 'string') {
                                if (bb.length > 0) {
                                    const num = Number(bb);
                                    if (!Number.isNaN(num)) {
                                        bParsed = num;
                                    }
                                }
                            }
                            if (typeof aParsed == 'string' && typeof bParsed == 'string') {
                                return aParsed.toLowerCase().localeCompare(bParsed.toLowerCase());
                            }
                            if (aParsed > bParsed) return 1;
                            if (aParsed < bParsed) return -1;
                            return 0;
                        };
                        break;
                    }
                    case '>': {
                        v = ()=>aa > bb;
                        break;
                    }
                    case '>=': {
                        v = ()=>aa >= bb;
                        break;
                    }
                    case 'in': {
                        v = ()=>bb.includes(aa);
                        break;
                    }
                    case 'not in': {
                        v = ()=>!bb.includes(aa);
                        break;
                    }
                    case 'starts with': {
                        v = ()=>aa.startsWith(bb);
                        break;
                    }
                    case 'ends with': {
                        v = ()=>aa.endsWith(bb);
                        break;
                    }
                    default: {
                        throw new Error('What?');
                    }
                }
            }
            return v();
        };

        if (this.testExpressionEnd()) {
            // ok
        } else if (this.testOperator()) {
            return this.parseOperator(value);
        }
        return value;
    }

    testTypeComparison() {
        return this.testSymbol(/is\s+(string|number|boolean|list|dictionary|closure)/);
    }
    parseTypeComparison(a) {
        this.partIndex.push(BOOL_PART.Type);
        const match = /^is\s+(string|number|boolean|list|dictionary|closure)/.exec(this.charAhead);
        this.take(match[0].length);
        const type = match[1];
        switch (type) {
            case 'string':
            case 'number':
            case 'boolean': {
                return ()=>typeof a() == type;
            }
            case 'list': {
                return ()=>{
                    let is = false;
                    let val = a();
                    is = val != null && Array.isArray(val);
                    return is;
                };
            }
            case 'dictionary': {
                return ()=>{
                    let is = false;
                    let val = a();
                    is = val != null && !Array.isArray(val) && typeof val == 'object';
                    return is;
                };
            }
            case 'closure': {
                return ()=>a() instanceof SlashCommandClosure;
            }
            default: {
                throw new Error('What?');
            }
        }
    }

    testMath() {
        return this.testSymbol(/^(\+|-|\*{1,2}|\/{1,2}|%)/);
    }
    parseMathPair() {
        const op = /^(\+|-|\*{1,2}|\/{1,2}|%)/.exec(this.charAhead)[0];
        this.take(op.length);
        this.discardWhitespace();
        // math operator must be followed by:
        // - expression
        // - literal
        let value;
        if (this.testExpression()) {
            value = this.parseExpression(false, false, false);
        } else if (this.testLiteral()) {
            value = this.parseLiteral(false, false, false);
        } else if (this.verify) {
            throw new Error('What?');
        }
        this.discardWhitespace();
        return { op, value };
    }
    parseMath(a) {
        this.partIndex.push(BOOL_PART.Math);
        let values = [a];
        let ops = [];
        while (this.testMath()) {
            const { op, value } = this.parseMathPair();
            values.push(value);
            ops.push(op);
        }
        const opsDict = {
            '+': (a, b)=>a() + b(),
            '-': (a, b)=>a() - b(),
            '*': (a, b)=>a() * b(),
            '/': (a, b)=>a() / b(),
            '//': (a, b)=>~~(a() / b()),
            '%': (a, b)=>a() % b(),
            '**': (a, b)=>a() ** b(),
        };
        // make sub-expressions
        const ooo = ['**', '*', '/', '//', '-', '+', '%'];
        for (const o of ooo) {
            for (let i = 0; i < ops.length; i++) {
                if (ops[i] == o) {
                    const a = values[i];
                    const b = values[i + 1];
                    values[i] = ()=>opsDict[o](a, b);
                    values.splice(i + 1, 1);
                    ops.splice(i, 1);
                    i--;
                }
            }
        }
        if (this.testExpressionEnd()) {
            return values[0];
        } else if (this.testComparison()) {
            return this.parseComparison(values[0]);
        }
    }

    testOperator() {
        return this.testSymbol(/(and|xor|or) /i);
    }
    parseOperatorPair() {
        let op = /^(and|xor|or) /i.exec(this.charAhead)[0];
        this.take(op.length);
        op = op.trim();
        this.discardWhitespace();
        // math operator must be followed by:
        // - expression
        // - literal
        let value;
        if (this.testFlip()) {
            value = this.parseFlip();
        } else if (this.testPreMath()) {
            value = this.parsePreMath();
        } else if (this.testExpression()) {
            value = this.parseExpression(true, false, true);
        } else if (this.testLiteral()) {
            value = this.parseLiteral(true, false, true);
        } else if (this.verify) {
            throw new Error('What?');
        }
        this.discardWhitespace();
        return { op, value };
    }
    parseOperator(a) {
        this.partIndex.push(BOOL_PART.Operator);
        let values = [a];
        let ops = [];
        while (this.testOperator()) {
            const { op, value } = this.parseOperatorPair();
            values.push(value);
            ops.push(op);
        }
        const opsDict = {
            'and': (a,b)=>a() && b(),
            'xor': (a,b)=>(!a() && b()) || (a() && !b()),
            'or': (a,b)=>a() || b(),
        };
        // make sub-expressions
        const ooo = ['and', 'xor', 'or'];
        for (const o of ooo) {
            for (let i = 0; i < ops.length; i++) {
                if (ops[i] == o) {
                    const a = values[i];
                    const b = values[i + 1];
                    values[i] = ()=>opsDict[o](a, b);
                    values.splice(i + 1, 1);
                    ops.splice(i, 1);
                    i--;
                }
            }
        }
        return values[0];
    }
}
