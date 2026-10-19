# Источники и технические решения

Проверка RSS: 19 октября 2026 года. Все первоначальные 10 лент отдавали разбираемый XML; в первой проверке получено по 6 заметок от каждой. Доступность RSS не означает, что оригинал статьи доступен в любой сети.

| Страна редакции | Редакция | RSS |
|---|---|---|
| Россия | РБК | https://rssexport.rbc.ru/rbcnews/news/30/full.rss |
| Россия | ТАСС | https://tass.ru/rss/v2.xml |
| Россия | Интерфакс | https://www.interfax.ru/rss.asp |
| Россия | Лента.ру | https://lenta.ru/rss/news |
| США | NPR | https://feeds.npr.org/1001/rss.xml |
| США | The New York Times | https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml |
| Китай | CGTN, английская редакция | https://www.cgtn.com/subscribe/rss/section/world.xml |
| Великобритания | BBC News | https://feeds.bbci.co.uk/news/rss.xml |
| Германия | DW, английская редакция | https://rss.dw.com/rdf/rss-en-top |
| Франция | France 24, английская редакция | https://www.france24.com/en/rss |
| Япония | The Japan Times | https://www.japantimes.co.jp/feed/ |
| Индия | The Hindu | https://www.thehindu.com/news/national/feeder/default.rss |

Выбраны прямые RSS вместо неофициального API агрегатора: меньше посредников, видна исходная редакция, нет общего API-ключа и зависимости от тарифного плана агрегатора. Все международные ленты уже выходят на английском, поэтому нужна одна модель en → ru, без потерь промежуточного перевода.

Переводчики: Google Cloud Translation и Microsoft Translator требуют облачный аккаунт, ключи и контроль тарифа; публичные неофициальные Google endpoints не имеют стабильного контракта. Для этой личной версии выбран Argos Translate — локальный движок, который работает на GitHub runner без внешнего платного API. Его качество может уступать коммерческим системам; оригинальный заголовок и ссылка сохранены.

Документация:

- Argos Translate: https://github.com/argosopentech/argos-translate
- Python API и установка модели: https://argos-translate.readthedocs.io/en/latest/source/examples.html
- Android TV, навигация пультом: https://developer.android.com/training/tv/start/navigation
- Android TV, манифест и запуск: https://developer.android.com/training/tv/start/start
- GitHub Pages ограничения: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- Расписание Actions и 60 дней: https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule

Общее правило: наличие RSS не является универсальным разрешением на коммерческую перепубликацию. Проект сохраняет атрибуцию, краткие RSS-фрагменты и прямые ссылки; извлекает только доступный текст открытых статей, явно отмечает ограничения и не обходит подписки.
