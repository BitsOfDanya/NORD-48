# Эксперименты оптимизации

Дата прогона: 11 сентября 2026. Exact simulator, 720 шагов, `minimum_hops`,
seed 42, P1 фиксирована, четыре переменные P2/P3 в `[0, 360)`, budget 100,
16 initial random candidates, top-5 revalidation.

## Normal

Baseline `(P2 RAAN 60°, P3 RAAN 120°, P2 phase 7,5°, P3 phase 15°)`:
C65 96,67%, C70 98,75%, C72 98,89%, worst 96,67%, worst outage 480 с.

Лучший вариант: P2 RAAN 231,7914°, P3 RAAN 296,1942°, P2 phase 159,6291°,
P3 phase 81,8059°. C65 99,17%, C70 100%, C72 100%; worst 99,17%, worst
outage 120 с. Target выполнен.

## ISL 2000

Baseline: C65 77,50%, C70 62,22%, C72 65,14%, worst 62,22%, worst outage
10680 с. Лучший: P2 RAAN 48,7348°, P3 RAAN 322,6397°, P2 phase 55,7971°,
P3 phase 214,1196°. C65 73,33%, C70 69,86%, C72 69,86%; worst +7,64 п.п.
до 69,86%, но worst outage вырос до 13920 с. Target не достигнут: одних
RAAN/phase при ISL 2000 км недостаточно.

## 10 отказов

Baseline: 79,31% / 80,83% / 82,50%, worst 79,31%, worst outage 1440 с.
Лучший совпал с normal-вариантом: 80,28% / 81,39% / 81,11%, worst 80,28%,
worst outage 1080 с. Улучшение worst +0,97 п.п.; target не достигнут.

## Robust

Одна конфигурация применена к normal + 10 outages + ISL 2000. Лучший вариант:
P2 RAAN 279,6631°, P3 RAAN 187,1550°, P2 phase 332,8716°, P3 phase 330,8817°.
Robust worst вырос с 62,22% до 65,69%, но target не достигнут.

| Конфигурация | Normal worst | 10 outages worst | ISL 2000 worst | Overall worst |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 96,67% | 79,31% | 62,22% | 62,22% |
| Normal-optimized | 99,17% | 80,28% | 52,50% | 52,50% |
| Robust-optimized | 81,25% | 71,94% | 65,69% | 65,69% |

Normal-only оптимизация переобучается на штатное условие и ухудшает ISL 2000.
Robust objective честно повышает минимум, но платит за это качеством normal и
outage сценариев. При фиксированной архитектуре 48 аппаратов и ISL 2000
изменения углов не обеспечивают 90%.

## Алгоритмы, сходимость и производительность

Random и DE при budget 100 нашли один и тот же normal optimum уже на evaluation
5 initial exploration. DE не улучшил его за оставшийся budget; утверждать его
превосходство по этому эксперименту нельзя. Время random 58,99 с, DE 61,22 с.
Single normal evaluation — 0,475 с. ISL100 — 37,23 с, outages100 — 46,55 с,
robust100 — 140,59 с. В каждом прогоне: 100 candidates, 5 exact revalidations,
105 cache misses и 1 hit (повтор baseline). Поэтому UI использует async jobs,
а demo default остаётся 100. Дополнительный normal DE budget 250 занял
140,46 с (255 exact с revalidation) и не улучшил вариант evaluation 5.
Parallel execution не включён до отдельного memory/determinism benchmark.

Ступенчатая availability даёт большие плато; граф best-so-far и распределение
в UI показывают это прямо. Budget 250/500 доступен для более полного поиска,
но не объявляется гарантией глобального optimum.

## Ограничения и ML

100 candidates в отдельном прогоне и несколько сотен суммарно — мало для
надёжной surrogate-модели на всём пространстве. JSONL/CSV pipeline готов, но
ML не обучался. Разумный следующий этап — накопить не менее порядка 1000
разнообразных exact labels, выделить holdout по конфигурациям и только затем
проверять пользу surrogate против exact-only baseline.
