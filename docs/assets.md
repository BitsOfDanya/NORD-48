# Внешние ассеты

## Текстуры Земли (`frontend/public/earth/`)

| Файл | Источник | Лицензия | Обработка |
| --- | --- | --- | --- |
| `earth-natural.jpg` | [Solar System Scope Textures](https://www.solarsystemscope.com/textures/) — `2k_earth_daymap.jpg` | CC BY 4.0 (Attribution) | без изменений, кроме сжатия |
| `earth-night.jpg` | Solar System Scope Textures — `2k_earth_nightmap.jpg` | CC BY 4.0 | без изменений, кроме сжатия |
| `earth-bump.jpg` | Solar System Scope Textures — `2k_earth_normal_map.tif` | CC BY 4.0 | конвертирован в grayscale JPEG (`Pillow`, `ImageOps.grayscale`) для использования как `bumpImageUrl` |
| `earth-network.jpg` | получен из `earth-natural.jpg` (тот же источник/лицензия) | CC BY 4.0 | сгенерирован локально: grayscale → тонирование в тёмно-синюю палитру NORD-48 (см. скрипт ниже) — режим отображения «Сеть» |
| `stars.jpg` | Solar System Scope Textures — `2k_stars_milky_way.jpg` | CC BY 4.0 | без изменений, кроме сжатия |

Атрибуция (CC BY 4.0): «Textures by [Solar System Scope](https://www.solarsystemscope.com/textures/)».

Скрипт генерации `earth-network.jpg` и `earth-bump.jpg` из скачанных
исходников (не хранится в репозитории, выполнялся один раз локально):

```python
from PIL import Image, ImageEnhance, ImageOps

normal = Image.open("earth-normal.tif").convert("RGB")
ImageOps.grayscale(normal).save("earth-bump.jpg", quality=88)

day = Image.open("earth-natural.jpg").convert("RGB")
gray = ImageOps.grayscale(day)
gray = ImageEnhance.Contrast(gray).enhance(1.15)
gray = ImageEnhance.Brightness(gray).enhance(0.62)

navy_dark, navy_light = (8, 18, 28), (67, 130, 168)
lerp = lambda a, b, t: tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
lut = [lerp(navy_dark, navy_light, v / 255) for v in range(256)]
network = Image.merge("RGB", [gray.point([c[i] for c in lut]) for i in range(3)])
network.save("earth-network.jpg", quality=90)
```

Все текстуры хранятся локально в `frontend/public/`, никаких
внешних hotlink-запросов при рендере глобуса нет.

## Шрифты (`frontend/src/app/`)

| Пакет | Использование | Лицензия |
| --- | --- | --- |
| `@fontsource-variable/manrope` | основной интерфейсный шрифт | OFL-1.1 |
| `@fontsource/ibm-plex-mono` | время, ID спутников/маршрутов, технические значения | OFL-1.1 |

Подключены как npm-пакеты (`@font-face` через локальные файлы шрифта,
без обращения к Google Fonts или другим внешним CDN во время выполнения).
