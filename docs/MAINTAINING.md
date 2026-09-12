# Як оновлювати переклад (для супровідника)

Робоча кухня лежить у `T:\_homelab\scripts\poe2_uk\` (не в цьому репозиторії). Повний контекст — `.claude/memory/poe2_ukrainian_translation.md`.

## Золоті правила
1. **Один процес, що пише кеш, за раз.** `translate_bulk.py` і `purge.py --apply` самі беруть замок `cache_uk.lock`; другий запуск відмовиться (код 4).
2. **Запис у гру — тільки при закритій грі.**
3. **Ручні правки — у `overrides_uk.json`** (англійський рядок → український). Вони завжди перемагають машинний переклад і не зникають при повторному перекладі.
4. **Зміна терміна** (як «очко → бал»): поправити словник у `translate_bulk.py`, додати регекс у `purge_patterns.txt`, `python purge.py` (сухий прогін) → `python purge.py --apply` → перекласти розділи заново.
5. **Хмара Ollama** — ключ у змінних `OLLAMA_URL=https://ollama.com` і `OLLAMA_API_KEY`. Безкоштовна квота ресетиться ~раз на 3 дні; стан перевіряти ОДНИМ запитом, не циклом.

## Після оновлення гри (патч GGG)
```powershell
cd T:\_homelab\scripts\poe2_uk
$env:Path = "T:\_homelab\scripts\poe2_uk\vendor\node;" + $env:Path

# 1. Витягти свіжий англійський текст гри (1–2 хв)
node extract_en.mjs

# 2. Перекласти лише нові/змінені рядки — по одному розділу
$env:OLLAMA_URL = 'https://ollama.com'; $env:OLLAMA_API_KEY = '<ключ>'
foreach ($s in 'ui','stats','skills','items','other','world','mtx') { python translate_bulk.py $s }

# 3. Подивитись якість
python peek.py world 20

# 4. Перевірити в грі (гра закрита)
node apply_uk.mjs
& .\vendor\poe2-polish-patch\ApplyPolish\bin\Release\net8.0\ApplyPolish.exe "T:\SteamLibrary\steamapps\common\Path of Exile 2\Bundles2\_.index.bin" out\staging
```

## Випустити нову версію
1. Злити `cache_uk.json` + `overrides_uk.json` (overrides перемагають) → `translations/uk.json.gz` у цьому репо; скопіювати `overrides_uk.json` у `translations/`.
2. Підняти `translations/version.json` (version + 1, дата, кількість рядків).
3. Оновити таблицю «Що перекладено» в README, якщо змінилось.
4. `git commit` → `git push` → `gh release create vN PoE2-Ukrainian-vN.zip` (архів: репо + `bin\ApplyPolish.exe`, без oo2core і node_modules).

## Правки від спільноти
Pull Request у `translations/overrides_uk.json` → перенести в `T:\_homelab\scripts\poe2_uk\overrides_uk.json` → будь-який запуск `translate_bulk.py` вливає їх у кеш → новий реліз.
