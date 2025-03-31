import { createRequire } from 'module';
import { Script } from 'vm';
const require  = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');
const htmlparser = require("htmlparser2");
const cheerio = require("cheerio");


console.log('gathering slash commands from source files...')


// gather required classes from autocomplete and slash-commands
const acDir = './public/scripts/autocomplete';
const slashDir = './public/scripts/slash-commands';
const classFiles = [
	...fs.readdirSync(acDir).map(it=>path.join(acDir, it)),
	...fs.readdirSync(slashDir).map(it=>path.join(slashDir, it)),
];
let classTxt = '';
let classTxtList = [];
for (const p of classFiles) {
	if (!p.endsWith('.js')) continue;
	const lines = fs.readFileSync(p, 'utf-8').split('\n');
	let txt = '';
	for (let line of lines) {
		// remove all imports, we're keeping everything in one script
		if (/^\s*import\s+/.test(line)) continue;
		// no exports either
		if (/^\s*export\s+/.test(line)) line = line.slice(6);
		txt += `${line}\n`;
	}
	classTxtList.push({
		txt,
		// keep track of classes defined in this file
		classList: [...txt.matchAll(/^\s*class\s+(\S+)/g)].map(it=>it[1]),
		// keep track of parent classes extended in this file
		extendsList: [...txt.matchAll(/^\s*class\s+(\S+)\s+extends\s+(\S+)/g)].map(it=>it[2]),
	});
}
// bring the file contents in a reasonable order to avoid reference-before-declaration exceptions
classTxtList.sort((a,b)=>{
	// if one has no "extends", they can go first
	if (a.extendsList.length == 0 && b.extendsList.length > 0) return -1;
	if (a.extendsList.length > 0 && b.extendsList.length == 0) return 1;
	// if a extends a class from b: b goes first
	for (const e of a.extendsList) {
		if (b.classList.includes(e)) return 1;
	}
	// if b extends a class from a: a goes first
	for (const e of b.extendsList) {
		if (a.classList.includes(e)) return -1;
	}
	return 0;
});
classTxt = classTxtList.map(it=>it.txt).join('\n');


// gather contents of LALib index
// remove imports and do some cleanup to avoid exceptions
const libTxt = [];
const cmdList = [];
{
	const txt = fs.readFileSync('./public/scripts/extensions/third-party/SillyTavern-LALib/index.js', 'utf-8');
	const lines = txt.split('\n');
	let inCmd = false;
	// put cmd registration in an anonymous function to avoid reference-before-declaration exceptions
	let cmd = '()=>';
	let i = -1;
	let grp = '???';
	for (const line of lines) {
		i++;
		if (!inCmd) {
			if (/^\s*SlashCommandParser\.addCommandObject\(/.test(line)) {
				// command begins at the first / next line including a call to addCommandObject
				// this assumes that there are no commands left using the deprecated registerSlashCommand function
				inCmd = true;
				cmd += `${line}\n`;
			} else if (/^\/\/\s*GROUP:\s*(.+)$/.test(line)) {
				grp = /^\/\/\s*GROUP:\s*(.+)$/.exec(line)?.[1] ?? '???';
				cmdList.push(`()=>grp = \`${grp}\`;`)
			} else if (!/^\s*(import|export)/.test(line)) {
				libTxt.push(line);
			}
		} else if (inCmd) {
			try {
				// attempt to eval the gathered lines
				// if it works we have all related lines
				// if it throws we need more lines
				eval(cmd);
				// replace some stuff that will later throw
				cmdList.push(cmd);
				inCmd = false;
				cmd = '()=>';
				if (/^\s*SlashCommandParser\.addCommandObject\(/.test(line)) {
					// command begins at the first / next line including a call to addCommandObject
					// this assumes that there are no commands left using the deprecated registerSlashCommand function
					inCmd = true;
					cmd += `${line}\n`;
				}
			} catch {
				cmd += `${line}\n`;
			}
		}
	}
}


// mock
const allTxt = [
	classTxt,
	`
		const eventSource = {on:()=>null};
		const event_types = {};
		const document = {body:{addEventListener:()=>null}};
	`,
	`
		let helpText;
		let exList;
		const aco = SlashCommandParser.addCommandObject;
		SlashCommandParser.addCommandObject = function(cmd) {
			cmd.group = grp;
			cmd.help = helpText;
			cmd.examples = exList ? [...exList] : [];
			helpText = null;
			exList = null;
			aco.bind(this)(cmd);
		};
	`,
	libTxt.join('\n'),
	`
		help = (text, ex)=>{
			helpText = text;
			exList = ex;
			return '';
		};
		examples = (list)=>{
			exList = [...list];
			return '';
		};
	`,
	cmdList.map(it=>it.slice(4)).join('\n'),
].join('\n');
// save the complete "script" text for review
fs.writeFileSync('./gatherStsOutput.js', allTxt);
// basically eval, but running in the same context -> classes, vars, etc. defined in the script are available to us
new Script(allTxt).runInThisContext();

const grouped = Object.groupBy(Object.values(SlashCommandParser.commands), (it)=>it.group);

const trim = (txt)=>{
	if (txt.split('\n').length < 2) return txt;
	const indent = /^([ \t]*)\S/m.exec(txt)?.[1] ?? '';
	const re = new RegExp(`^${indent}`, 'mg');
	return txt.replace(re, '').replace(/\s*$/s, '');
};

const clean = (txt)=>txt.replace(/[^a-z]+/ig, '_');
let md = `# LALib

Library of STScript commands.



`;
for (const [key, cmds] of Object.entries(grouped)) {
	md += trim(`
		- [${key}](#lalib-help-group-${clean(key)}) (${cmds.map(it=>`[${it.name}](#lalib-help-cmd-${clean(it.name)})`).join(', ')})
	`);
}
md += `




## Requirements

- *(optional)* [Costumes Plugin](https://github.com/LenAnderson/SillyTavern-Costumes.git) for \`/costumes\` command.
`;
md += `




## Commands`;
for (const [key, cmds] of Object.entries(grouped)) {
	md += trim(`



		### <a id="lalib-help-group-${clean(key)}"></a>${key}
	`);
	for (const cmd of cmds) {
		md += trim(`


			#### <a id="lalib-help-cmd-${clean(cmd.name)}"></a>\`/${cmd.name}\`
		`);
		for (const arg of cmd.namedArgumentList) {
			md += [
				'\n',
				'- `',
				arg.acceptsMultiple ? '...' : '',
				'[',
				arg.name,
				arg.enumList?.length ? '=' : ':',
				arg.enumList?.length ? arg.enumList.map(it=>it.value).join('|') : arg.typeList.join('|'),
				']',
				arg.isRequired ? '' : '?',
				arg.defaultValue ? ` = ${arg.defaultValue}` : '',
				'`  \n ',
				arg.isRequired ? '' : '*(optional)* ',
				arg.description,
			].join('');
		}
		for (const arg of cmd.unnamedArgumentList) {
			md += [
				'\n',
				'- `',
				arg.acceptsMultiple ? '...' : '',
				'(',
				arg.enumList?.length ? arg.enumList.map(it=>it.value).join('|') : arg.typeList.join('|'),
				')',
				arg.isRequired ? '' : '?',
				arg.defaultValue ? ` = ${arg.defaultValue}` : '',
				'`  \n ',
				arg.isRequired ? '' : '*(optional)* ',
				arg.description,
			].join('');
		}
		let help = cmd.help ? trim(cmd.help) : '# HELP MISSING';
		let ex = '# EXAMPLES MISSING';
		if (cmd.examples && cmd.examples.length) {
			ex = cmd.examples.map(([code, txt])=>{
				let out = `\`\`\`stscript\n${trim(code)}`;
				if (!(out.endsWith('|') || out.endsWith(' |'))) out += ' |';
				if (txt) {
					out += `\n// ${cheerio.load(txt).text()} |`;
				}
				out += `\n\`\`\``;
				return out;
			}).join('\n');
		}
		md += '\n';
		md += '\n';
		md += help;
		md += '\n';
		md += '\n';
		md += '##### **Examples**\n';
		md += ex;
	}
}


fs.writeFileSync('./public/scripts/extensions/third-party/SillyTavern-LALib/README.md', md, { encoding:'utf-8' });
