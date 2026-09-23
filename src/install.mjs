// Встановлення українського перекладу Path of Exile 2.
// Працює на Windows та SteamOS/Linux (через Proton/Wine).
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import os from 'os';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);

// Журнал поруч зі скриптом: вікно консолі в користувача закривається або губиться,
// а так завжди є що надіслати, коли встановлення не вдалось.
const LOG = path.join(root, 'install.log');
try { fs.writeFileSync(LOG, `== ${new Date().toISOString()} ==\n`); } catch {}
function log(text) {
    try { fs.appendFileSync(LOG, text + '\n'); } catch {}
}

function say(text, color = '0') {
    log(text);
    const colors = {
        'Gray': '\x1b[90m',
        'Red': '\x1b[31m',
        'Cyan': '\x1b[36m',
        'Green': '\x1b[32m',
        '0': '\x1b[0m'
    };
    const c = colors[color] || colors['0'];
    console.log(`${c}${text}${colors['0']}`);
}

function fail(text) {
    say(`\nПОМИЛКА: ${text}`, 'Red');
    process.exit(1);
}

// -----------------------------------------
// Пошук гри
// -----------------------------------------
function getSteamLibraries() {
    const libs = new Set();
    try {
        const out = execSync('reg query "HKCU\\SOFTWARE\\Valve\\Steam" /v SteamPath', { stdio: 'pipe' }).toString();
        const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/);
        if (match) libs.add(match[1].trim().replace(/\\\\/g, '\\'));
    } catch {}

    const list = Array.from(libs);
    for (const steam of list) {
        const vdf = path.join(steam, 'steamapps', 'libraryfolders.vdf');
        if (fs.existsSync(vdf)) {
            try {
                const text = fs.readFileSync(vdf, 'utf8');
                const matches = text.matchAll(/"path"\s+"([^"]+)"/g);
                for (const m of matches) {
                    libs.add(m[1].replace(/\\\\/g, '\\'));
                }
            } catch {}
        }
    }
    return Array.from(libs);
}

function findPoe2() {
    if (process.env.POE2_DIR && fs.existsSync(path.join(process.env.POE2_DIR, 'Bundles2', '_.index.bin'))) {
        return process.env.POE2_DIR;
    }
    const parent = path.dirname(root);
    if (fs.existsSync(path.join(parent, 'Bundles2', '_.index.bin'))) {
        return parent; // LBK unpacked into game dir
    }
    for (const lib of getSteamLibraries()) {
        const p = path.join(lib, 'steamapps', 'common', 'Path of Exile 2');
        if (fs.existsSync(path.join(p, 'Bundles2', '_.index.bin'))) {
            return p;
        }
    }
    return null;
}

// -----------------------------------------
// Пошук Oodle (oo2core)
// -----------------------------------------
function walkDirForOodle(dir, depth) {
    if (depth === 0) return null;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.toLowerCase() === 'oo2core_9_win64.dll') {
                return path.join(dir, entry.name);
            }
            if (entry.isDirectory()) {
                const found = walkDirForOodle(path.join(dir, entry.name), depth - 1);
                if (found) return found;
            }
        }
    } catch {}
    return null;
}

function findOodle(gameDir) {
    // Найпевніше місце — тека самої гри: oo2core_9_win64.dll лежить поруч з PathOfExile.exe.
    // Раніше туди не дивились, і в кого гра стоїть не в стандартній теці Steam/Epic, пошук марно обходив диски й падав.
    const opts = [process.env.POE2_OODLE, path.join(root, 'oo2core_9_win64.dll'),
                  gameDir && path.join(gameDir, 'oo2core_9_win64.dll')];
    for (const o of opts) {
        if (o && fs.existsSync(o)) return o;
    }

    say('  Шукаю oo2core серед ваших ігор (може зайняти хвилину)...', 'Gray');
    let gameRoots = [];
    for (const lib of getSteamLibraries()) {
        gameRoots.push(path.join(lib, 'steamapps', 'common'));
    }
    // Drives
    for (let i = 65; i <= 90; i++) {
        const drive = String.fromCharCode(i) + ':\\';
        if (fs.existsSync(drive)) {
            gameRoots.push(path.join(drive, 'Program Files', 'Epic Games'));
            gameRoots.push(path.join(drive, 'Epic Games'));
            gameRoots.push(path.join(drive, 'Games'));
            gameRoots.push(path.join(drive, 'XboxGames'));
        }
    }

    gameRoots = [...new Set(gameRoots)].filter(r => fs.existsSync(r));
    for (const rootDir of gameRoots) {
        try {
            const games = fs.readdirSync(rootDir, { withFileTypes: true });
            for (const g of games) {
                if (g.isDirectory()) {
                    const hit = walkDirForOodle(path.join(rootDir, g.name), 4);
                    if (hit) return hit;
                }
            }
        } catch {}
    }
    return null;
}

// -----------------------------------------
// Wine/Proton detection & Config
// -----------------------------------------
function isWine() {
    if (process.env.WINEPREFIX || process.env.WINEUSERNAME) return true;
    try {
        execSync('reg query "HKLM\\Software\\Wine"', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function getConfigPath(gamePath) {
    let p = path.join(os.homedir(), 'Documents', 'My Games', 'Path of Exile 2', 'poe2_production_Config.ini');
    if (isWine()) {
        // Proton path: <steam_library>/steamapps/compatdata/2694490/pfx/drive_c/users/steamuser/Documents/My Games/Path of Exile 2/poe2_production_Config.ini
        // gamePath is typically <steam_library>/steamapps/common/Path of Exile 2
        const steamLib = path.dirname(path.dirname(path.dirname(gamePath)));
        const protonConfig = path.join(steamLib, 'steamapps', 'compatdata', '2694490', 'pfx', 'drive_c', 'users', 'steamuser', 'Documents', 'My Games', 'Path of Exile 2', 'poe2_production_Config.ini');
        if (fs.existsSync(protonConfig)) {
            return protonConfig;
        }
    }
    return p;
}

// -----------------------------------------
// Main Installation
// -----------------------------------------
say('== Український переклад Path of Exile 2 ==', 'Cyan');

say('Крок 1/7: Пошук гри...');
const game = findPoe2();
if (!game) {
    fail("Не знайшов Path of Exile 2. Задайте шлях: set POE2_DIR=D:\\...\\Path of Exile 2 та запустіть INSTALL.bat знову.");
}
say(`  Знайдено: ${game}`);

try {
    const tasklist = execSync('tasklist /FI "IMAGENAME eq PathOfExile*" /NH', { stdio: 'pipe' }).toString();
    if (tasklist.toLowerCase().includes('pathofexile')) {
        fail('Гра запущена. Закрийте Path of Exile 2 і запустіть INSTALL.bat знову.');
    }
} catch {}

say('Крок 2/7: Перевірка середовища...');
if (isWine()) say('  Середовище: Wine / Proton (Linux/SteamOS)');
else say('  Середовище: Windows');

say('Крок 3/7: Пошук oo2core_9_win64.dll...');
const bin = path.join(root, 'bin');
const injectExe = path.join(bin, 'ApplyPolish.exe');
if (!fs.existsSync(injectExe)) {
    fail('Немає bin\\ApplyPolish.exe — завантажте повний архів релізу, а не лише код.');
}
const dllOut = path.join(bin, 'oo2core.dll');
if (!fs.existsSync(dllOut)) {
    const found = findOodle(game);
    if (!found) {
        fail(`Не знайшов oo2core_9_win64.dll. Скопіюйте його сюди:\n  ${root}\nі запустіть INSTALL.bat знову.`);
    }
    say(`  Знайдено: ${found}`);
    fs.copyFileSync(found, dllOut);
} else {
    say('  Знайдено локальний oo2core.dll');
}

say('Крок 4/7: Перевірка залежностей...');
if (!fs.existsSync(path.join(root, 'node_modules', 'pathofexile-dat'))) {
    say('  Встановлюю npm-залежності...', 'Gray');
    const npm = os.platform() === 'win32' ? 'npm.cmd' : 'npm';
    const res = spawnSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund'], { stdio: 'inherit' });
    if (res.status !== 0) {
        fail('npm install не вдався. Перевірте інтернет і спробуйте ще раз.');
    }
}

say('Крок 5/7: Підготовка файлів перекладу...');
process.env.POE2_DIR = game;
const applyMjs = path.join(root, 'src', 'apply.mjs');
const nodeExe = path.join(root, 'node', 'node.exe');
const execNode = fs.existsSync(nodeExe) ? nodeExe : process.execPath;
const resApply = spawnSync(execNode, [applyMjs], { stdio: 'inherit' });
if (resApply.status !== 0) {
    fail('Не вдалося підготувати файли перекладу (див. повідомлення вище).');
}

say('Крок 6/7: Запис у гру (ApplyPolish)...');
const staging = path.join(root, 'out', 'staging');

function hasFiles(dir) {
    if (!fs.existsSync(dir)) return false;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        if (e.isDirectory()) {
            if (hasFiles(path.join(dir, e.name))) return true;
        } else {
            return true;
        }
    }
    return false;
}

if (!hasFiles(staging)) {
    say('  Усі файли вже перекладені (немає нових змін для запису).');
} else {
    const resInject = spawnSync(injectExe, [
        path.join(game, 'Bundles2', '_.index.bin'),
        staging
    ], { stdio: 'inherit' });
    if (resInject.status !== 0) {
        fail('Запис у гру не вдався. Відкотити можна через Steam: Перевірити цілісність файлів гри.');
    }
}

say('Крок 7/7: Налаштування мови...');
const configPath = getConfigPath(game);
if (fs.existsSync(configPath)) {
    let text = fs.readFileSync(configPath, 'utf8');
    if (/^language=(?!en\s*$)\S+/m.test(text)) {
        text = text.replace(/^language=\S+/m, 'language=en');
        fs.writeFileSync(configPath, '\uFEFF' + text.replace(/^\uFEFF/, ''), 'utf8');
        say('  Мову гри перемкнено на English (переклад записано поверх англійської).');
    } else {
        say('  Мова гри вже налаштована на English.');
    }
} else {
    say(`  УВАГА: Конфігураційний файл гри не знайдено (${configPath}). Якщо переклад не з'явиться, оберіть English у налаштуваннях гри.`, 'Cyan');
}

say('\nГотово! Запустіть гру (мова в налаштуваннях — English).', 'Green');
say('Після кожного оновлення гри запускайте INSTALL.bat знову.', 'Gray');
say('Видалити переклад: Steam -> Path of Exile 2 -> Властивості -> Встановлені файли -> Перевірити цілісність файлів гри.', 'Gray');
