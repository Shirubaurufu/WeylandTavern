
import { Storage, File } from 'megajs';
import fs from 'fs';
import inquirer from 'inquirer';
import path, { parse } from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import * as cliProgress from 'cli-progress';
import pkg from 'lodash';
const { forEach } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(path.dirname(__filename));
const __charactersJSON = path.join(path.dirname(__filename),"characters.json")

const folderUrl = process.argv[2];

if (!folderUrl) {
    console.log("Usage: node character-downloader.js <mega_folder_url>");
    process.exit(1);
}

const folder = File.fromURL(folderUrl);

await folder.loadAttributes();

const files = folder.children;
if (files === undefined) {
    console.error("There was a problem getting the character files from the folder.");
    process.exit(1);
} else if (!files.length) {
    console.log("No files found in the folder.");
    process.exit(1);
}

const fileChoices = files.map(file => ({
    name: `${file.name?.replace(".zip","")} (${file.size ? (file.size / 1024 / 1024).toFixed(2) : 'unknown'} MB)`,
    value: file
}));
let answers = {selectedFiles: []};
if (process.argv[3] && process.argv[3] === "-u") {
    if (!fs.existsSync(__charactersJSON)) process.exit(1);
    try {
        const jsonData = JSON.parse(fs.readFileSync(__charactersJSON, 'utf8'));
        if (!jsonData) process.exit(1);
        Object.entries(jsonData).forEach(([key, value], index) => {
            const file = files.find(x => x.name?.includes(key));
            if (!(!file || file.name?.includes(value))) {
                console.log(key + " has an update...");
                answers['selectedFiles'].push(file);
            }
        })
    } catch {
        console.log("Error getting character updates. Exiting.")
        process.exit(1)
    }
} else {
    answers = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'selectedFiles',
            message: 'Select characters to download:',
            choices: fileChoices
        }
        ]);
}

if (!answers.selectedFiles.length) {
    console.log("No characters selected. Exiting.");
    process.exit(1);
}

const progressBar = new cliProgress.SingleBar({
    format: '[{bar}] {percentage}% | {value}/{total} MB',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

let i = 1;
let fails = [];
let jsonData = {};
for (const file of answers.selectedFiles) {
    const zipPath = path.join(__dirname, file.name);
    const noZipName = file.name.replace(".zip","");
    const split = noZipName.split(" ");
    const cleanName = split[0];
    const date = split[1];
    try {
        jsonData = JSON.parse(fs.readFileSync(__charactersJSON, 'utf8'));
    } catch {}
    console.log(`Downloading: ${noZipName} (${i}/${answers.selectedFiles.length})`);
    const fileSize = parseFloat((file.size/1024/1024).toFixed(2));
    progressBar.start(fileSize, 0);

    const dlStream = file.download()
        .on('data', chunk => {
            progressBar.update(progressBar.value + (chunk.length/1024/1024));
        })
        .on('end', () => {
            progressBar.update(fileSize);
            progressBar.stop();
        })
        .on('error', (err) => {
            console.error(`Error downloading ${noZipName}: ${err.message}`);
            progressBar.stop();
            fails.push(cleanName);
        });
        
    if (fails.includes(cleanName)) continue;

    const writeStream = fs.createWriteStream(zipPath);

    await new Promise((resolve, reject) => {
        dlStream.pipe(writeStream);
        writeStream.on('finish', () => {
            try {
                new AdmZip(zipPath).extractEntryTo('SillyTavern/', __dirname, true, true);
                resolve(0);
            } catch (err) {
                console.error(`Extraction error for ${noZipName}:`, err);
                fails.push(cleanName);
                resolve(1);
            }
        });
        writeStream.on('error', (err) => {
            console.error(`Failed to extract ${noZipName}`, err);
            fails.push(cleanName);
            reject(err);
        });
    });

    jsonData[cleanName] = date;

    fs.unlink(zipPath, (err) => {
        if (err) throw err.name;
    });
    i++;
}

fs.writeFileSync(__charactersJSON, JSON.stringify(jsonData, null, 2), 'utf8');
console.log(`\nSuccessfully downloaded ${i-fails.length-1}/${i-1} characters!`);
if (fails.length != 0) console.log(`Failed to download: ${fails.join(", ")}`);