# Встановлення українського перекладу Path of Exile 2.
# Запускається з INSTALL.bat (він читає цей файл як UTF-8). Шлях до гри можна задати змінною POE2_DIR.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $root -or -not (Test-Path (Join-Path $root 'src\apply.mjs'))) { $root = (Get-Location).Path }
Set-Location $root

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail($text) { Say "`nПОМИЛКА: $text" 'Red'; exit 1 }

function Find-Poe2 {
    if ($env:POE2_DIR -and (Test-Path (Join-Path $env:POE2_DIR 'Bundles2\_.index.bin'))) { return $env:POE2_DIR }
    $roots = @()
    $steam = (Get-ItemProperty 'HKCU:\SOFTWARE\Valve\Steam' -Name SteamPath -ErrorAction SilentlyContinue).SteamPath
    if ($steam) {
        $roots += Join-Path $steam 'steamapps\common\Path of Exile 2'
        $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
        if (Test-Path $vdf) {
            Select-String -Path $vdf -Pattern '"path"\s+"([^"]+)"' | ForEach-Object {
                $roots += Join-Path ($_.Matches[0].Groups[1].Value -replace '\\\\', '\') 'steamapps\common\Path of Exile 2'
            }
        }
    }
    foreach ($r in $roots) { if (Test-Path (Join-Path $r 'Bundles2\_.index.bin')) { return $r } }
    return $null
}

Say '== Український переклад Path of Exile 2 ==' 'Cyan'

# 1. Гра
$game = Find-Poe2
if (-not $game) { Fail "Не знайшов Path of Exile 2. Задайте шлях: у PowerShell виконайте  `$env:POE2_DIR='D:\...\Path of Exile 2'  і запустіть INSTALL.bat знову." }
Say "Гра: $game"
if (Get-Process PathOfExile* -ErrorAction SilentlyContinue) { Fail 'Гра запущена. Закрийте Path of Exile 2 і запустіть INSTALL.bat знову.' }

# 2. Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail 'Не знайдено Node.js. Встановіть його з https://nodejs.org (кнопка LTS) і запустіть INSTALL.bat знову.' }
$major = [int]((& node -v).TrimStart('v').Split('.')[0])
if ($major -lt 20) { Fail "Потрібен Node.js 20 або новіший (зараз $(& node -v))." }

# 3. Oodle (oo2core) і інжектор
$bin = Join-Path $root 'bin'
New-Item -ItemType Directory -Force $bin | Out-Null
$rad = Join-Path $root 'oo2core_9_win64.dll'
$dll = Join-Path $bin 'oo2core.dll'
if (Test-Path $rad) { Copy-Item $rad $dll -Force }
if (-not (Test-Path $dll)) { Fail "Немає файлу oo2core_9_win64.dll. Скопіюйте його з теки ...\Binaries\Win64\ будь-якої вашої гри на Unreal Engine 4/5 і покладіть сюди:`n  $root" }
$inject = Join-Path $bin 'ApplyPolish.exe'
if (-not (Test-Path $inject)) { Fail "Немає bin\ApplyPolish.exe — завантажте повний архів релізу, а не лише код." }

# 4. Залежності (лише перший раз)
if (-not (Test-Path (Join-Path $root 'node_modules\pathofexile-dat'))) {
    Say 'Встановлюю залежності (лише перший раз)...'
    & npm install --omit=dev --no-audit --no-fund | Out-Null
    if ($LASTEXITCODE) { Fail 'npm install не вдався. Перевірте інтернет і спробуйте ще раз.' }
}

# 5. Підготовка перекладених файлів
Say 'Готую перекладені файли...'
$env:POE2_DIR = $game
& node (Join-Path $root 'src\apply.mjs')
if ($LASTEXITCODE) { Fail 'Не вдалося підготувати файли перекладу (див. повідомлення вище).' }

# 6. Запис у гру
Say 'Записую переклад у гру...'
& $inject (Join-Path $game 'Bundles2\_.index.bin') (Join-Path $root 'out\staging')
if ($LASTEXITCODE) { Fail 'Запис у гру не вдався. Відкотити можна через Steam: Перевірити цілісність файлів гри.' }

Say "`nГотово! Запустіть гру і в налаштуваннях оберіть мову English." 'Green'
Say 'Після кожного оновлення гри запускайте INSTALL.bat знову.'
Say 'Видалити переклад: Steam -> Path of Exile 2 -> Властивості -> Встановлені файли -> Перевірити цілісність файлів гри.'
