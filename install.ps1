# Встановлення українського перекладу Path of Exile 2.
# Запускається з INSTALL.bat. Шлях до гри можна задати змінною POE2_DIR, шлях до oo2core — POE2_OODLE.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $root -or -not (Test-Path (Join-Path $root 'src\apply.mjs'))) { $root = (Get-Location).Path }
Set-Location $root

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail($text) { Say "`nПОМИЛКА: $text" 'Red'; exit 1 }

function Get-SteamLibraries {
    $libs = @()
    $steam = (Get-ItemProperty 'HKCU:\SOFTWARE\Valve\Steam' -Name SteamPath -ErrorAction SilentlyContinue).SteamPath
    if ($steam) {
        $libs += $steam
        $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
        if (Test-Path $vdf) {
            Select-String -Path $vdf -Pattern '"path"\s+"([^"]+)"' | ForEach-Object {
                $libs += ($_.Matches[0].Groups[1].Value -replace '\\\\', '\')
            }
        }
    }
    $libs | Select-Object -Unique
}

function Find-Poe2 {
    if ($env:POE2_DIR -and (Test-Path (Join-Path $env:POE2_DIR 'Bundles2\_.index.bin'))) { return $env:POE2_DIR }
    foreach ($lib in Get-SteamLibraries) {
        $p = Join-Path $lib 'steamapps\common\Path of Exile 2'
        if (Test-Path (Join-Path $p 'Bundles2\_.index.bin')) { return $p }
    }
    return $null
}

function Find-Oodle {
    # The player's own copy: Unreal Engine 4/5 games ship oo2core_9_win64.dll next to their executable.
    foreach ($p in @($env:POE2_OODLE, (Join-Path $root 'oo2core_9_win64.dll'))) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    $gameRoots = @()
    foreach ($lib in Get-SteamLibraries) { $gameRoots += Join-Path $lib 'steamapps\common' }
    foreach ($drive in (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -gt 0 }).Root) {
        $gameRoots += (Join-Path $drive 'Program Files\Epic Games'), (Join-Path $drive 'Epic Games'),
                      (Join-Path $drive 'Games'), (Join-Path $drive 'XboxGames')
    }
    foreach ($gameRoot in ($gameRoots | Select-Object -Unique)) {
        if (-not (Test-Path $gameRoot)) { continue }
        foreach ($game in Get-ChildItem $gameRoot -Directory -ErrorAction SilentlyContinue) {
            $hit = Get-ChildItem $game.FullName -Filter 'oo2core_9_win64.dll' -File -Recurse -Depth 4 -ErrorAction SilentlyContinue |
                Select-Object -First 1
            if ($hit) { return $hit.FullName }
        }
    }
    return $null
}

Say '== Український переклад Path of Exile 2 ==' 'Cyan'

# 1. Гра
$game = Find-Poe2
if (-not $game) { Fail "Не знайшов Path of Exile 2. Задайте шлях: у PowerShell виконайте  `$env:POE2_DIR='D:\...\Path of Exile 2'  і запустіть INSTALL.bat знову з того ж вікна." }
Say "Гра: $game"
if (Get-Process PathOfExile* -ErrorAction SilentlyContinue) { Fail 'Гра запущена. Закрийте Path of Exile 2 і запустіть INSTALL.bat знову.' }

# 2. Node.js — вбудований у реліз, інакше системний
$nodeExe = Join-Path $root 'node\node.exe'
if (-not (Test-Path $nodeExe)) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $cmd) { Fail 'Не знайдено Node.js. Завантажте повний архів релізу з GitHub (у ньому Node уже є) або встановіть Node.js з https://nodejs.org.' }
    $nodeExe = $cmd.Source
}
$major = [int]((& $nodeExe -v).TrimStart('v').Split('.')[0])
if ($major -lt 20) { Fail "Потрібен Node.js 20 або новіший (зараз $(& $nodeExe -v))." }

# 3. Інжектор і Oodle (oo2core)
$bin = Join-Path $root 'bin'
$inject = Join-Path $bin 'ApplyPolish.exe'
if (-not (Test-Path $inject)) { Fail 'Немає bin\ApplyPolish.exe — завантажте повний архів релізу, а не лише код.' }
$dll = Join-Path $bin 'oo2core.dll'
if (-not (Test-Path $dll)) {
    Say 'Шукаю oo2core_9_win64.dll серед ваших ігор (може зайняти хвилину)...'
    $found = Find-Oodle
    if (-not $found) {
        Fail "Не знайшов oo2core_9_win64.dll. Він лежить у теці ...\Binaries\Win64\ ігор на Unreal Engine 4/5. Скопіюйте його сюди:`n  $root`nі запустіть INSTALL.bat знову.`nДе ще взяти файл — README, розділ «Якщо інсталятор не знайшов oo2core_9_win64.dll»."
    }
    Say "Знайдено: $found"
    Copy-Item $found $dll -Force
}

# 4. Залежності — вбудовані в реліз; для копії з GitHub-коду ставляться через npm
if (-not (Test-Path (Join-Path $root 'node_modules\pathofexile-dat'))) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Fail 'Немає папки node_modules — завантажте повний архів релізу.' }
    Say 'Встановлюю залежності...'
    & npm install --omit=dev --no-audit --no-fund | Out-Null
    if ($LASTEXITCODE) { Fail 'npm install не вдався. Перевірте інтернет і спробуйте ще раз.' }
}

# 5. Підготовка перекладених файлів
Say 'Готую перекладені файли...'
$env:POE2_DIR = $game
& $nodeExe (Join-Path $root 'src\apply.mjs')
if ($LASTEXITCODE) { Fail 'Не вдалося підготувати файли перекладу (див. повідомлення вище).' }

# 6. Запис у гру
Say 'Записую переклад у гру...'
& $inject (Join-Path $game 'Bundles2\_.index.bin') (Join-Path $root 'out\staging')
if ($LASTEXITCODE) { Fail 'Запис у гру не вдався. Відкотити можна через Steam: Перевірити цілісність файлів гри.' }

Say "`nГотово! Запустіть гру і в налаштуваннях оберіть мову English." 'Green'
Say 'Після кожного оновлення гри запускайте INSTALL.bat знову.'
Say 'Видалити переклад: Steam -> Path of Exile 2 -> Властивості -> Встановлені файли -> Перевірити цілісність файлів гри.'
