// Character-Downloader for WeylandTavern by Shirubaurufu

import fs from 'fs';
import https from 'https';
import querystring from 'querystring';
import inquirer from 'inquirer';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import * as cliProgress from 'cli-progress';

class DownloaderError extends Error {
    constructor(message, errorExtraParams) {
        super(message);
        this._errorExtraParams = errorExtraParams;
    }
    get extraParamsJSON() {
        return JSON.stringify(this._errorExtraParams, null, 2);
    }
    get extraParams(){
        return this._errorExtraParams;
    }
}

let pwd = null;
let folderId = null;

if (process.argv.includes("-id=")) {
    // folder URL
    const [_folderUrl, _pwd] = process.argv.find(x => x.startsWith("-id="))?.slice(4)?.split("@password=");
    pwd = _pwd;
    // folder ID from URL
    folderId = _folderUrl?.match(/(?:https?:\/\/gofile\.io(?:\/d)?)\/([a-z\d]{6})/i)?.[1] || _folderUrl
}

// update mode?
const isUpdateMode = process.argv.includes(`-u`);

const __dir = path.dirname(fileURLToPath(import.meta.url));
const __locDir = path.join(__dir,"locations");
const __charDir = path.join(__dir,"characters");
const __stDir = path.dirname(__dir);
const __mainDir = path.dirname(__stDir);
const __unzipDir = path.join(__stDir,"data/default-user/characters")

const expressions = ["admiration","amusement","anger","annoyance","approval","caring","confusion","curiosity","desire","disappointment","disapproval","disgust","embarrassment","excitement","fear","gratitude","grief","joy","love","nervousness","neutral","optimism","pride","realization","relief","remorse","sadness","surprise"];

class Downloader {
    constructor (accountToken, websiteToken) {
        this.downloadLocations = {};
        this.accountToken = accountToken;
        this.websiteToken = websiteToken;
        this.totalCount = 0;
        this.files = [];
    }

    static async new() {
        try {
            downloaderLog('Contacting Weyland University Student Servers...');
            const accountToken = await createGuestAccount();
            const websiteToken = await getWebsiteToken();

            if (typeof(accountToken) !== "string" || !accountToken || accountToken.length != 32 || !/^[a-z0-9]+$/i.test(accountToken)) {
                if (accountToken instanceof DownloaderError) {
                    throw new DownloaderError(`Failed to obtain valid account token.`, {error: accountToken.message, accountToken: accountToken.extraParams, websiteToken: websiteToken});
                } else {
                    throw new DownloaderError(`Failed to obtain valid account token.`, {accountToken: accountToken, websiteToken: websiteToken});
                }
            }
            if (typeof(websiteToken) !== "string" || !websiteToken || websiteToken.length != 12 || !/^[a-z0-9]+$/i.test(websiteToken)) {
                if (websiteToken instanceof DownloaderError) {
                    throw new DownloaderError(`Failed to obtain valid website token.`, {error: websiteToken.message, accountToken: accountToken, websiteToken: websiteToken.extraParams});
                } else {
                    throw new DownloaderError(`Failed to obtain valid website token.`, {accountToken: accountToken, websiteToken: websiteToken});
                }
            }

            downloaderLog('✓ Login successful. Weyland Token obtained.');
            return new Downloader(accountToken, websiteToken);
        } catch (error) {
            console.error("Token Error: ", error.message);
            try {
                fs.writeFileSync(path.join(__stDir,"WTDownloader.log"), `${error.message}\n\n${error.extraParamsJSON}`);
                console.error("\nLog file created: SillyTavern/WTDownloader.log.\n!!Please DM that file, or the contents of that file to Shiru for debugging!!")
            } catch (e) {
                console.error("Failed to create error log file: ", e);
                return null;
            }
            return null;
        }
    }

    async addLocation(name, id, pwd = null, reload = false) {
        if (this.downloadLocations[name] && !reload) return;
        const downloadLocation = await DownloadLocation.new(id, pwd);
        if (downloadLocation?.id) {
            if (reload && this.downloadLocations[name]) {
                let fileCount = this.downloadLocations[name]?.folder?.files?.length
                if (fileCount) this.totalCount = this.totalCount - fileCount
            }
            this.downloadLocations[name] = downloadLocation;
        }
    }

    async getLocationContents(name, reload = false) {
        try {
            if (this.downloadLocations[name].folder && !reload) return this.downloadLocations[name].folder;
            const folder = await this.downloadLocations[name].getContents(this.accountToken, this.websiteToken);
            if (!folder || !folder?.files) {
                delete this.downloadLocations[name];
                return null;
            };
            this.totalCount = this.totalCount + folder.count;
            return folder;
        } catch(err) {
            if (typeof err?.message === "string" && (err?.message.includes("Access Denied") || err?.message.includes("notFound"))) {
                if (fs.existsSync(path.join(__locDir,`${name}.wtl`)))
                    fs.rmSync(path.join(__locDir,`${name}.wtl`));
            } else {
                console.error("Location Contents Error: ", err);
            };
            return null;
        }
    }

    async getAllLocationsContents(reload = false) {
        for (const location in this.downloadLocations) {
            await this.getLocationContents(location, reload);
        }
    }

    getLocationNames() {
        return Object.keys(this.downloadLocations);
    }

    getLocationFiles(name) {
        const files = this.downloadLocations[name]?.folder?.files;
        return files ? files : [];
    }

    getAllFiles(reload=false) {
        if (this.files.length === 0 || reload) {
            if (reload) this.files = [];
            for (const location in this.downloadLocations) {
                this.files = this.files.concat(this.getLocationFiles(location));
            }
        }
        return this.files;
    }
}

/**
 * DownloadLocation class
 */
class DownloadLocation {
    /**
     * @param {string} id 
     * @param {string | null} pwd 
     */
    constructor (id, pwd = null) {
        this.id = typeof id === "string" && id.length === 6 ? id : null;
        this.pwd = typeof pwd === "string" && pwd.length === 64 ? pwd : null;
        this.folder = null;
    }

    /**
     * @param {string} id 
     * @param {string | null} pwd 
     * @returns
     */
    static async new(id, pwd = null) {
        if (typeof pwd === "string" && (pwd.length !== 64 || /[^a-z\d]/.test(pwd)))
            pwd = await getSHA256Hash(pwd);
        if (typeof id === "string" && id.length !== 6)
            id = Buffer.from(id, 'base64').toString('binary');

        return new DownloadLocation(id, pwd);
    }
} 

/**
 * GoFile constructor
 * @param {{canAccess: boolean, link: string, size: number, type: string, mimetype: string, name: string}}
 */
function GoFile({
    canAccess = false,
    link,
    size = 0,
    type,
    mimetype,
    name
}) {
    if (!(this instanceof GoFile)) return new GoFile({canAccess: canAccess, link: link, size: size, type: type, mimetype: mimetype, name: name}); //Incase the constructor is called without "new"
    this.canAccess = canAccess;
    this.link = link;
    this.size = size || 0;
    this.type = type;
    this.mimetype = mimetype;
    this.name = name;
    this.cleanName = name.slice(0,-4);
    this.character = this.cleanName.match(/^.*(?= \d{1,2}-)/)?.[0];
    if (this.character) {
        const [month, day, year] = this.cleanName.match(/\d{1,2}-\d{1,2}-\d{1,2}/)?.[0].split("-");
        this.dateObj = {month: month.padStart(2,"0"), day: day.padStart(2,"0"), year: year};
        this.date = `${this.dateObj.month}-${this.dateObj.day}-${this.dateObj.year}`
    }
}

/**
 * Gets folder contents from GoFile API
 * Returns a folder containing all valid and accessible files
 */
DownloadLocation.prototype.getContents = async function(accountToken, websiteToken) {
    if (!this.id || !accountToken || !websiteToken) return null;
    return new Promise((resolve, reject) => {
        try {
            const params = {
                contentFilter: '',
                sortField: 'createTime',
                sortDirection: '1'
            };

            if (this.pwd)
                params.password = this.pwd;

            const options = {
                hostname: 'api.gofile.io',
                path: `/contents/${this.id}?${querystring.stringify(params)}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accountToken}`,
                    'X-Website-Token': `${websiteToken}`
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response?.status === 'ok' && response?.data) {
                            const contents = response.data;
                            if (!contents.canAccess) {
                                resolve(null)
                                return;
                            }

                            let files = {}
                            if (contents?.children) {
                                files = Object.values(contents.children)?.map(char => {
                                    if (!char) return null;
                                    return new GoFile(char);
                                })?.filter(x => x);
                            }

                            if (!files?.length) {
                                resolve(null);
                                return;
                            }
                            
                            this.folder = {
                                name: contents.name,
                                size: contents.totalSize,
                                count: files.length,
                                files: files
                            };
                            resolve(this.folder);
                        } else {
                            if (response.status === `error-notFound`) {
                                console.error(`Unable to locate GoFile folder.\nMake sure you have the latest WTL files.`)
                            } else {
                                console.error(`Failed to get folder contents: ${response.status}`);
                            }
                            resolve(null)
                        }
                    } catch (err) {
                        console.error(`Failed to parse folder contents: ${err}`);
                        resolve(null)
                    }
                });
            });

            req.on('error', (error) => {
                console.error(error)
                resolve(null)
            });
            req.end();
        } catch (error) {
            console.error(error)
            resolve(null)
        }
    });
}

/**
 * Downloads a file from GoFile with progress tracking
 * Requires account token for authentication
 */
GoFile.prototype.download = async function(accountToken, progressBar = null) {
    return new Promise((resolve, reject) => {
        try {
            const outputPath = path.join(__dir, this.name)
            if (fs.existsSync(outputPath))
                fs.unlinkSync(outputPath);
            const file = fs.createWriteStream(outputPath);
            let downloadedSize = 0;

            const options = new URL(this.link);
            options.headers = {
                'Authorization': `Bearer ${accountToken}`,
                'Cookie': `accountToken=${accountToken}`
            };
            
            const req = https.request(options, (res) => {
                // Handle redirects
                if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                    file.close();
                    fs.unlinkSync(outputPath);
                    this.download(accountToken, progressBar)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (res.statusCode !== 200) {
                    file.close();
                    fs.unlinkSync(outputPath);
                    reject(new Error(`Failed to download file: HTTP ${res.statusCode}`));
                    return;
                }

                res.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (progressBar && this.size > 0) {
                        progressBar.update(parseFloat((downloadedSize / 1024 / 1024).toFixed(2)));
                    }
                });

                res.pipe(file);

                file.on('finish', () => {
                    file.close();
                    if (progressBar && this.size > 0) {
                        progressBar.update(parseFloat((downloadedSize / 1024 / 1024).toFixed(2)));
                    }
                    resolve();
                });
            });

            req.on('error', (err) => {
                file.close();
                fs.unlinkSync(outputPath);
                reject(err);
            });

            file.on('error', (err) => {
                file.close();
                fs.unlinkSync(outputPath);
                reject(err);
            });

            req.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Creates a guest account on GoFile and returns the token
 * This token is required to access folder contents and download files
 */
async function createGuestAccount() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.gofile.io',
            path: '/accounts',
            method: 'POST',
            headers: {}
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.status === 'ok' && response.data && response.data.token) {
                        resolve(response.data.token);
                    } else {
                        resolve(new DownloaderError(`Failed to create guest account.`, {debug: response}));
                    }
                } catch (error) {
                    resolve(new DownloaderError(`Failed to parse account creation response: ${error.message}`, {debug: data}));
                }
            });
        });

        req.on('error', (error) => reject(error));
        req.end();
    });
}

/**
 * Fetches the website token from GoFile's global.js
 * This is required alongside the account token for API authentication
 */
async function getWebsiteToken() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'gofile.io',
            path: '/dist/js/config.js',
            method: 'GET',
            headers: {}
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    // Extract website token from the JavaScript
                    // Format is typically: .wt = "TOKEN_HERE"
                    const match = data.match(/\.wt\s*=\s*["']([^"']+)["']/);
                    if (match && match[1]) {
                        resolve(match[1]);
                    } else {
                        resolve(new DownloaderError(`Could not find website token.`,{debug: data}));
                    }
                } catch (err) {
                    resolve(new DownloaderError(`Failed to extract website token: ${err.message}`,{debug: data}));
                }
            });
        });

        req.on('error', (error) => reject(error));
        req.end();
    });
}

async function getSHA256Hash(input) {
    if (input === undefined || input === null) return null;

    const textAsBuffer = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", textAsBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray
        .map((item) => item.toString(16).padStart(2, "0"))
        .join("");
    return hash;
};

function downloaderLog(text) {
    if (!isUpdateMode) console.log(text);
};

// main
(async () => {
    try {
        for (const file of fs.readdirSync(__mainDir)?.filter(x => x.endsWith(".wtl"))) {
            fs.renameSync(path.join(__mainDir,file),path.join(__locDir,file));
        } //Collect .wtl files from the root directory

        if (!fs.existsSync(__charDir)) fs.mkdirSync(__charDir); //Create the characters directory if missing
        if (fs.existsSync(path.join(__stDir,"characters.json"))) //Move legacy json, if it exists, to new location
            fs.renameSync(path.join(__stDir,"characters.json"),path.join(__charDir,"standard.wtch")); 

        for (const locFile of fs.readdirSync(__locDir)?.filter(x => x.endsWith(".wtl"))) {
            try {
                let match = null;
                if (locFile.toLowerCase().includes(`copy of`)) {
                    match = locFile.replace(/copy of /i, ``).match(/(\w+)(?=\b)[^\n]*\.wtl/i);
                } else {
                    match = locFile.match(/(\w+)(?=\b)[^\n]+\.wtl/i);
                }
                // @ts-ignore
                if (match?.length > 1) {
                    // @ts-ignore
                    fs.renameSync(path.join(__locDir,locFile),path.join(__locDir,`${match[1]}.wtl`)); 
                }
            } catch (e) {
                console.error(`Failed to fix name of ${locFile}. Error: ${e.message}`)
            }
        }
        
        downloaderLog(
`
╔═════════════════════════════════════════════════════════╗
║    WELCOME TO WEYLAND TAVERN'S CHARACTER DOWNLOADER!    ║
╠═════════════════════════════════════════════════════════╣
║ Hey there! This tool downloads official characters from ║
║ Weyland University! These characters will automatically ║
║ update every time you launch Weyland Tavern, so you'll  ║
║ always have the latest versions!                        ║
╚═════════════════════════════════════════════════════════╝
`
        );

        const downloader = await Downloader.new();

        if (!downloader)
            throw new Error(`Unable to obtain Weyland Token.`);

        for (const locFile of fs.readdirSync(__locDir)?.filter(x => x.endsWith(".wtl"))) {
            const contents = fs.readFileSync(path.join(__locDir, locFile));
            if (!contents) return null;

            const split = contents.toString().split("@");
            await downloader.addLocation(locFile.slice(0,-4), split[0], split[1]);
        }

        downloaderLog('Fetching weyland roster from university registry...');

        await downloader.getAllLocationsContents();
        
        if (downloader.totalCount === 0) {
            downloaderLog("No records found in the university registry.");
            process.exit(1);
        }

        downloaderLog(`✓ Found ${downloader.totalCount} student(s) and staff member(s)\n`);

        //Filter characters to only exist in a lower priority .wtch file
        const charChecks = {"standard": [`alpha`,`beta`], "beta": [`alpha`]};
        for (const lower in charChecks) {
            try {
                const lowerPath = path.join(__charDir,`${lower}.wtch`);
                if (!fs.existsSync(lowerPath)) continue;
                const lowerChars = JSON.parse(fs.readFileSync(lowerPath, 'utf-8')); //Beta | Standard
                for (const higher of charChecks[lower]) {
                    try {
                        const higherPath = path.join(__charDir,`${higher}.wtch`);
                        if (!fs.existsSync(higherPath)) continue;
                        const higherChars = JSON.parse(fs.readFileSync(higherPath, 'utf-8')); //Alpha | Beta
                        const filteredChars = Object.keys(higherChars)
                            .filter(x => !Object.keys(lowerChars).includes(x))
                            .reduce((obj, key) => {return Object.assign(obj, {[key]: higherChars[key]})}, {});
                        fs.writeFileSync(higherPath,JSON.stringify(filteredChars, null, 2), 'utf-8');
                    } catch (error) {
                        console.error(error);
                    }
                }
            } catch (error) {
                console.error(error)
            }
        };

        let downloadAll = false;
        let downloadAllOverride = false;
        let sortOrder = 'date';
        let mainPrompt = {};

        if (!isUpdateMode) {
            while (!mainPrompt?.action || mainPrompt?.action === "password") {
                mainPrompt = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'action',
                        message: '\x1b[38;5;183mWhat would you like to do?\x1b[0m',
                        choices: [
                            { name: 'Download all characters (recommended for new users)', value: 'all' },
                            { name: 'Browse and select individual characters', value: 'browse' },
                            { name: 'Enter exclusive access password (Alpha/Beta)', value: 'password' },
                            { name: 'Exit', value: 'exit' }
                        ],
                        default: 'browse',
                        prefix: '\x1b[38;5;183m❯\x1b[0m',
                        theme: {
                            style: {
                                answer: (text) => text,
                                message: (text) => text,
                                highlight: (text) => `\x1b[37m${text}\x1b[0m`
                            }
                        }
                    }
                ]);

                if (mainPrompt?.action === "exit") {
                    downloaderLog("Exiting...");
                    process.exit(0);
                }

                if (mainPrompt?.action === "password") {
                    const { password } = await inquirer.prompt([
                        { type: 'password', name: 'password', message: 'Enter your access password:', mask: '*' }
                    ]);
                    if (!password) continue; // Go back to start of while loop

                    downloaderLog('Verifying password with Weyland servers...');
                    const accessTiers = [
                        { name: 'Alpha', id: 'wQ3~sD\&yF6' },
                        { name: 'Beta', id: 'fJ4~kM+\$hU9' },
                        { name: 'Debug', id: 'aENvY3VW' }
                    ];
                    let foundTierContents = null;
                    let foundTierName = null;

                    for (const tier of accessTiers) {
                        try {
                            const tempLocation = await DownloadLocation.new(tier.id, password);
                            const contents = await tempLocation.getContents(downloader.accountToken, downloader.websiteToken);
                            if (contents && contents?.files) {
                                downloaderLog(`✓ Password accepted for ${tier.name} tier.`);
                                foundTierContents = contents;
                                foundTierName = tier.name;
                                break;
                            }
                        } catch (error) {
                            // Failed, try next tier
                        }
                    }

                    if (!foundTierContents) {
                        console.error("\n✗ Invalid password or access tier not found. Please try again.\n");
                        continue; // Go back to start of while loop
                    }

                    // .WTL Download Logic
                    const wtlFiles = foundTierContents.files?.filter(f => f.name?.endsWith('.wtl'));
                    if (!wtlFiles.length) {
                        console.error(`\n✗ Password was correct for ${foundTierName}, but no access files (.wtl) were found in the folder.\n`);
                        continue;
                    }

                    downloaderLog(`Found ${wtlFiles.length} access file(s). Downloading...`);
                    console.log(`Downloading: ${wtlFiles.map(x => x.name).join(", ")}`);

                    let downloadedCount = 0;
                    for (const fileToDownload of wtlFiles) {
                        try {
                            await fileToDownload.download(downloader.accountToken);
                            fs.renameSync(path.join(__dir,fileToDownload.name), path.join(__locDir,fileToDownload.name));
                            downloadedCount++;
                        } catch (err) {
                            console.error(`✗ Download error for ${fileToDownload.name}:`, err.message);
                        }
                    }

                    if (downloadedCount > 0) {
                        console.log(`✓ Successfully downloaded ${downloadedCount}/${wtlFiles.length} access file(s).\nRescanning extra registries...`);
                    } else {
                        console.error(`\n✗ Failed to download any access files. Please try again.\n`);
                    }

                    // Attempt to fix any naming mistakes in .wtl files
                    for (const locFile of fs.readdirSync(__locDir)?.filter(x => x.endsWith(".wtl"))) {
                        try {
                            let match = null;
                            if (locFile.toLowerCase().includes(`copy of`)) {
                                match = locFile.replace(/copy of /i, ``).match(/(\w+)(?=\b)[^\n]*\.wtl/i);
                            } else {
                                match = locFile.match(/(\w+)(?=\b)[^\n]+\.wtl/i);
                            }
                            // @ts-ignore
                            if (match?.length > 1) {
                                // @ts-ignore
                                fs.renameSync(path.join(__locDir,locFile),path.join(__locDir,`${match[1]}.wtl`)); 
                            }
                        } catch (e) {
                            console.error(`Failed to fix name of ${locFile}. Error: ${e.message}`)
                        }
                    }

                    // Reload alpha/beta .wtl files
                    for (const locFile of fs.readdirSync(__locDir)?.filter(x => x.endsWith(".wtl") && !x.startsWith("standard"))) {
                        const contents = fs.readFileSync(path.join(__locDir, locFile));
                        if (!contents) return null;

                        const split = contents.toString().split("@");
                        await downloader.addLocation(locFile.slice(0,-4), split[0], split[1], true);
                        await downloader.getLocationContents(locFile.slice(0,-4), true);
                    }

                    downloaderLog(`✓ Found ${downloader.totalCount} student(s) and staff member(s)\n`);
                }
            }
            
            downloadAll = (mainPrompt.action === 'all');
            
            // Only ask about sorting if not downloading all
            if (!downloadAll) {
                const sortPrompt = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'sortOrder',
                        message: '\x1b[38;5;183mHow would you like to sort the university registry?\x1b[0m',
                        choices: [
                            { name: 'By upload date (newest first)', value: 'date' },
                            { name: 'Alphabetically (A-Z)', value: 'alpha' }
                        ],
                        default: 'date',
                        prefix: '\x1b[38;5;183m❯\x1b[0m',
                        theme: {
                            style: {
                                answer: (text) => text,
                                message: (text) => text,
                                highlight: (text) => `\x1b[37m${text}\x1b[0m`
                            }
                        }
                    }
                ]);
                sortOrder = sortPrompt.sortOrder;
            } else {
                const override = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'override',
                        message: '\x1b[38;5;183mHow would you like to sort the university registry?\x1b[0m',
                        choices: [
                            { name: 'Ignore existing characters', value: 'false' },
                            { name: 'Download & Override existing characters', value: 'true' }
                        ],
                        default: 'false',
                        prefix: '\x1b[38;5;183m❯\x1b[0m',
                        theme: {
                            style: {
                                answer: (text) => text,
                                message: (text) => text,
                                highlight: (text) => `\x1b[37m${text}\x1b[0m`
                            }
                        }
                    }
                ]);
                downloadAllOverride = override.override === "true";
            }
        }

        if (!isUpdateMode) {
            for (const location of downloader.getLocationNames()) {
                if (sortOrder === "alpha") {
                    downloader.downloadLocations[location]?.folder?.files.sort((a, b) => a.character.localeCompare(b.character));
                } else if (sortOrder === "date") {
                    downloader.downloadLocations[location]?.folder?.files.sort((a, b) => {
                        if (a.date && b.date) {
                            if (a.date === b.date) {
                                return a.character.localeCompare(b.character);
                            }
                            return `${b.dateObj.year}${b.dateObj.month}${b.dateObj.day}`.localeCompare(`${a.dateObj.year}${a.dateObj.month}${a.dateObj.day}`)
                        }
                        return 0;
                    });
                }
            }

            if (sortOrder === "alpha") {
                downloaderLog('✓ Sorted alphabetically\n');
            } else if (!isUpdateMode) {
                downloaderLog('✓ Sorted by date (newest first)\n');
            }
        }

        let answers = { selectedFiles: [] };
        
        let k = 0

        if (downloadAll) {
            // Download all mode: select everything automatically
            let allFiles = downloader.getAllFiles();
            if (!downloadAllOverride) {
                let existingCharacters = {};
                for (const location of downloader.getLocationNames()) {
                    try {
                        let chars = JSON.parse(
                            fs.readFileSync(
                                path.join(__charDir, `${location}.wtch`), 
                                'utf8'
                            )
                        )
                        existingCharacters = {...existingCharacters, ...chars}
                    } catch {
                        console.error(`Failed to parse ${location}.wtch while ignoring existing characters.`)
                    }
                }
                allFiles = allFiles.filter(x => {
                    if (
                        Object.keys(existingCharacters).includes(x.character) && 
                        existingCharacters[x.character] === x.date
                    ) return false;
                    return true;
                })
            }
            answers.selectedFiles = allFiles.map(x => x.character);
            if (answers.selectedFiles.length) console.log(`Downloading all ${answers.selectedFiles.length} characters...\n`);
        } else if (isUpdateMode) {
            for (const location of downloader.getLocationNames()) {
                const charFile = path.join(__charDir,`${location}.wtch`);
                if (!fs.existsSync(charFile)) {
                    k++; continue;
                }

                try {
                    const contents = fs.readFileSync(charFile, 'utf8')
                    if (!contents) continue;
                    const jsonData = JSON.parse(contents);
                    if (typeof jsonData !== "object" || !Object.keys(jsonData)) continue;
                    let neededUpdates = "";
                    Object.entries(jsonData).forEach(([key, value]) => {
                        const file = downloader.getLocationFiles(location)?.find(x => {
                            return x.character === key;
                        });
                        if (!file) return;
                        
                        if (file?.date) {
                            const valueSplit = value.split("-");
                            if (file.dateObj.year <= valueSplit[2] && //Compare year
                                file.dateObj.month <= valueSplit[0] && //Compare month
                                file.dateObj.day <= valueSplit[1]) { //Compare day
                                return; } //If all match or all values are higher, local character is up to date
                            neededUpdates += key + ", ";
                            answers.selectedFiles.push(file.character);
                        }
                    });
                } catch (err) {
                    console.error(`Error reading ${location}.wtch file: `, err.message);
                    continue;
                }
            }
        } else {
            // Interactive mode: show checkbox menu
            let files = [];
            for (const location of downloader.getLocationNames()) {
                let locFiles = downloader.getLocationFiles(location);
                for (let file of locFiles) {
                    file.location = location;
                }
                files = files.concat(locFiles);
            }
            
            if (sortOrder === "alpha") {
                files.sort((a, b) => a.character.localeCompare(b.character));
            } else if (sortOrder === "date") {
                files.sort((a, b) => {
                    if (a.date && b.date) {
                        if (a.date === b.date) {
                            return a.character.localeCompare(b.character);
                        }
                        return `${b.dateObj.year}${b.dateObj.month}${b.dateObj.day}`.localeCompare(`${a.dateObj.year}${a.dateObj.month}${a.dateObj.day}`)
                    }
                    return 0;
                });
            }

            const fileChoices = files.map(file => ({
                name: `${file.character} ${file.location !== "standard" ? `(${file.location}) ` : ""}[${file.size ? (file.size / 1024 / 1024).toFixed(2) : 'unknown'} MB]`
            }));

            answers = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'selectedFiles',
                    message: 'Select characters to download:',
                    choices: fileChoices,
                    pageSize: 15,  // Show 15 items at once instead of default 7
                    loop: false    // Don't loop back to top when reaching bottom
                }
            ]);
        }

        if (!answers.selectedFiles.length) {
            if (isUpdateMode) {
                if (k > 0 && k === downloader.getLocationNames().length) {
                    console.log("No character files found. Run without -u flag first.")
                    process.exit(1);
                } else {
                    console.log("All characters are up to date!")
                }
            }
            else if (downloadAll && !downloadAllOverride) {
                console.log("All characters are already downloaded and up to date!")
            } else {
                console.log("No characters selected.");
            }
            process.exit(0);
        }

        // Step 6: Download selected files
        const progressBar = new cliProgress.SingleBar({
            format: '\x1b[37m[\x1b[96m{bar}\x1b[37m]\x1b[0m {percentage}% | {value}/{total} MB',
            barCompleteChar: '>',
            barIncompleteChar: '-',
            barsize: 30,
            hideCursor: true
        }, cliProgress.Presets.shades_classic);

        let i = 0;
        let fails = [];
        if (!isUpdateMode)
            answers.selectedFiles = answers.selectedFiles.map(x => x.match(/^[^\[\(]+/)[0]?.trim());
        
        for (const location of downloader.getLocationNames()) {
            const charFile = path.join(__charDir,`${location}.wtch`);
            let jsonData = fs.existsSync(charFile) ? JSON.parse(fs.readFileSync(charFile, `utf8`)) : {};
            const files = downloader.getLocationFiles(location)?.filter(x => answers.selectedFiles.includes(x.character));
            if (!files) continue;
            for (const file of files) {
                i++
                const cleanName = file.character;
                const date = file.date;
                const noZipName = `${cleanName} ${date}`;
                const zipPath = path.join(__dir,file.name);

                console.log(`Downloading: ${noZipName} (${i}/${answers.selectedFiles.length})`);

                if (!file.canAccess) {
                    console.error(`  ✗ Access Denied for ${noZipName}`);
                    fails.push(cleanName);
                    continue;
                }

                if (file.type !== "file" || file.mimetype !== "application/zip") {
                    console.error(`  ✗ Incorrect file type for ${noZipName}`);
                    fails.push(cleanName);
                    continue;
                }
                
                if (!file.link) {
                    console.error(`  ✗ No download link available for ${noZipName}`);
                    fails.push(cleanName);
                    continue;
                }

                const fileSize = file.size || 0;
                const fileSizeMB = parseFloat((fileSize / 1024 / 1024).toFixed(2));

                progressBar.start(fileSizeMB, 0);

                try {
                    await file.download(downloader.accountToken, progressBar);
                    progressBar.stop();
                    let directories = []
                    let cleanUp = true;

                    // Extract the zip file
                    try {
                        const zip = new AdmZip(zipPath);
                        directories = zip.getEntries().flatMap(entry => {
                            if (!entry.isDirectory) return [];
                            const path = entry.entryName.split("/");
                            if (path.length !== 7) return [];
                            return [`${path.at(-3)}/${path.at(-2)}`];
                        });
                        zip.extractAllTo(__mainDir, true);
                        
                        jsonData[cleanName] = date;
                        fs.writeFileSync(charFile, JSON.stringify(jsonData, null, 2), 'utf8');
                    } catch (extractErr) {
                        cleanUp = false;
                        console.error(`  ✗ Extraction error for ${noZipName}:`, extractErr.message);
                        fails.push(cleanName);
                    } finally {
                        if (!cleanUp) return;
                        directories.forEach((dir) => {
                            const outfitDir = path.join(__charDir,dir);
                            fs.readdir(outfitDir, (err, files) => {
                                if (err) {
                                    return;
                                }
                                expressions.forEach((expression) => {
                                    if (files.includes(`${expression}.avif`) && files.includes(`${expression}.png`)) {
                                        fs.rmSync(path.join(outfitDir,`${dir}/${expression}.png`));
                                    }
                                });
                            });
                        });
                    }
                } catch (downloadErr) {
                    progressBar.stop();
                    console.error(`  ✗ Download error for ${noZipName}:`, downloadErr.message);
                    fails.push(cleanName);
                }

                if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            }
        }

        // Summary
        downloaderLog(`\n══════════════════════════════════════════════════════`);
        downloaderLog(`                  DOWNLOAD COMPLETE!`);
        downloaderLog(`══════════════════════════════════════════════════════`);
        console.log(`Successfully downloaded: ${i - fails.length}/${i} characters`);
        
        if (fails.length > 0) {
            console.log(`Failed to download: ${fails.join(", ")}`);
        }
        
        downloaderLog(`\nYour downloaded characters will now appear in the Weyland`);
        downloaderLog(`Tavern interface the next time it launches. You're all set!\n`);

    } catch (error) {
        if (!error.message) {
            console.error(`\n✗ Fatal error: `, error);
        } else {
            console.error(`\n✗ Fatal error: `, error.message);
        }
        console.error(`Please report this error to the Weyland Tavern dev team.`);
        process.exit(1);
    }
})();
