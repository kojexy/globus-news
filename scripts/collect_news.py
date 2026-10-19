"""Collect RSS and publicly accessible article text; translate with Argos.

No paywall bypass, remote translation API, API keys, or invented summaries.
"""
from __future__ import annotations

import argparse
import concurrent.futures
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
import logging
from pathlib import Path
import re
import sys
import urllib.request
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
MAX_AGE = timedelta(hours=72)
log = logging.getLogger('globus')


class TextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        if tag in ('p', 'br', 'div', 'li'):
            self.parts.append(' ')

    def handle_endtag(self, tag):
        if tag in ('script', 'style') and self.skip:
            self.skip -= 1
        if tag in ('p', 'div', 'li'):
            self.parts.append(' ')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


class MetadataParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.descriptions = {}

    def handle_starttag(self, tag, attrs):
        if tag != 'meta':
            return
        attrs = dict(attrs)
        name = (attrs.get('property') or attrs.get('name') or '').lower()
        if name in ('og:description', 'description') and attrs.get('content'):
            self.descriptions[name] = attrs['content']


def clean_text(value):
    parser = TextParser()
    parser.feed(unescape(value or ''))
    return re.sub(r'\s+', ' ', ''.join(parser.parts)).strip()


def excerpt(text, limit=650):
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(' ', 1)[0]
    sentence = max(cut.rfind('. '), cut.rfind('! '), cut.rfind('? '))
    return (cut[:sentence + 1] if sentence > limit * .55 else cut + '…')


def canonical_url(url):
    parts = urlparse((url or '').strip())
    if parts.scheme not in ('https', 'http') or not parts.netloc or parts.username or parts.password:
        return None
    query = [(k, v) for k, v in parse_qsl(parts.query) if not k.startswith('utm_') and k not in ('cmpid', 'at_medium', 'at_campaign')]
    return urlunparse((parts.scheme, parts.netloc, parts.path, '', urlencode(query), ''))


def parse_date(value):
    if not value:
        return None
    try:
        result = parsedate_to_datetime(value)
    except (ValueError, TypeError):
        try:
            result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except (ValueError, TypeError):
            return None
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    return result.astimezone(timezone.utc)


def field(element, names):
    for name in names:
        for child in element:
            if child.tag.split('}')[-1] == name:
                if name == 'link' and child.attrib.get('href'):
                    if child.attrib.get('rel', 'alternate') != 'alternate':
                        continue
                    return child.attrib['href']
                return ''.join(child.itertext())
    return ''


def parse_feed(data, source, now=None, limit=6):
    now = now or datetime.now(timezone.utc)
    root = ET.fromstring(data)
    articles, seen = [], set()
    for item in root.iter():
        if item.tag.split('}')[-1] not in ('item', 'entry'):
            continue
        title = clean_text(field(item, ['title']))
        url = canonical_url(field(item, ['link']))
        date = parse_date(field(item, ['pubDate', 'published', 'date', 'updated']))
        if date and (now - date > MAX_AGE or date > now + timedelta(hours=2)):
            continue
        if not title or not url or url in seen:
            continue
        seen.add(url)
        description = excerpt(clean_text(field(item, ['description', 'summary', 'encoded', 'content'])))
        if description == title:
            description = ''
        # Retain exactly the RSS teaser, with a strict length bound.
        articles.append({
            'id': hashlib.sha256(url.encode()).hexdigest()[:20],
            'sourceId': source['id'], 'source': source['name'], 'country': source['country'],
            'language': source['language'], 'sourceKind': source['kind'], 'url': url,
            'publishedAt': date.isoformat() if date else None,
            'originalTitle': title, 'originalText': description,
            'excerptOrigin': 'rss',
        })
    articles.sort(key=lambda a: a['publishedAt'] or '', reverse=True)
    return articles[:limit]


def extract_article(html, url, summary=''):
    """Extract visible public news text; respect subscription metadata."""
    if re.search(r'"isAccessibleForFree"\s*:\s*(false|"false")', html, re.I):
        return '', 'restricted'
    import trafilatura
    body = trafilatura.extract(html, url=url, include_comments=False, include_tables=False,
                               favor_precision=True, deduplicate=True) or ''
    paragraphs = [re.sub(r'[ \t]+', ' ', line).strip() for line in body.splitlines()]
    paragraphs = [line for line in paragraphs if line and not re.match(
        r'^(Advertisement|Read more|Related (articles|topics)|Sign up|Subscribe|Copyright|Реклама|Читайте также|Подписывайтесь)\b', line, re.I)]
    body = '\n\n'.join(paragraphs).strip()
    if len(body) < max(220, len(summary) + 80):
        return '', 'unavailable'
    if len(body) > 40000:
        body = body[:40000].rsplit('\n\n', 1)[0]
        return body, 'excerpt'
    return body, 'available'


def fetch_source(source, now, previous_by_id=None):
    request = urllib.request.Request(source['url'], headers={
        'User-Agent': 'GlobusNews/1.0 (+https://github.com/kojexy/globus-news; personal RSS reader)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = response.read(3_000_001)
    if len(payload) > 3_000_000:
        raise ValueError('RSS exceeds 3 MB')
    articles = parse_feed(payload, source, now)
    if not articles:
        raise ValueError('No articles from the last 72 hours')
    previous_by_id = previous_by_id or {}
    base = urlparse(source['home']).hostname.removeprefix('www.')
    for article in articles:
        host = urlparse(article['url']).hostname or ''
        article['fullStatus'] = 'unavailable'
        old = previous_by_id.get(article['id'], {})
        if old.get('originalFullText') and old.get('fullStatus') in ('available', 'excerpt'):
            for key in ('originalFullText', 'fullText', 'fullStatus', 'fullTranslation'):
                if key in old:
                    article[key] = old[key]
            continue
        if not (host == base or host.endswith('.' + base)):
            continue
        try:
            request = urllib.request.Request(article['url'], headers={'User-Agent': 'GlobusNews/1.0 (personal news reader)'})
            with urllib.request.urlopen(request, timeout=12) as response:
                payload = response.read(2_000_000).decode(response.headers.get_content_charset() or 'utf-8', errors='replace')
            parser = MetadataParser()
            parser.feed(payload)
            description = excerpt(clean_text(parser.descriptions.get('og:description') or parser.descriptions.get('description', '')))
            if len(description) > len(article['originalText']) and description != article['originalTitle']:
                article['originalText'] = description
                article['excerptOrigin'] = 'metadata'
            body, status = extract_article(payload, article['url'], article['originalText'])
            article['fullStatus'] = status
            if body:
                article['originalFullText'] = body
        except Exception as error:
            log.info('Full text unavailable for %s: %s', article['id'], error)
    return articles


class Translator:
    def __init__(self, cache):
        import argostranslate.package as package
        import argostranslate.translate as translate
        self.translate_api, self.cache = translate, cache
        installed = package.get_installed_packages()
        if not any(p.from_code == 'en' and p.to_code == 'ru' for p in installed):
            package.update_package_index()
            model = next(p for p in package.get_available_packages() if p.from_code == 'en' and p.to_code == 'ru')
            package.install_from_path(model.download())

    def text(self, text, language):
        if language == 'ru' or not text:
            return text
        key = hashlib.sha256(('argos-en-ru-v1:' + language + ':' + text).encode()).hexdigest()
        if key not in self.cache:
            result = self.translate_api.translate(text, language, 'ru').strip()
            if not result or result == text or not re.search('[А-Яа-яЁё]', result):
                raise ValueError('Translation produced no Russian text')
            self.cache[key] = result
        return self.cache[key]

    def article(self, text, language):
        return '\n\n'.join(self.text(paragraph, language) for paragraph in text.split('\n\n') if paragraph.strip())


def collect(output, cache_path, raw=False, limit=6):
    now = datetime.now(timezone.utc)
    sources = json.loads((ROOT / 'scripts/sources.json').read_text())
    previous = json.loads(output.read_text()) if output.exists() else {'articles': []}
    previous_by_id = {a['id']: a for a in previous.get('articles', [])}
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    # Initialize once. A model/dependency failure must not overwrite the last good edition.
    translator = None if raw else Translator(cache)
    records, statuses, successes = [], [], 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        jobs = {pool.submit(fetch_source, source, now, previous_by_id): source for source in sources}
        for job in concurrent.futures.as_completed(jobs):
            source = jobs[job]
            try:
                found = job.result()[:limit]
                records.extend(found)
                successes += 1
                statuses.append({**source, 'status': 'ok', 'count': len(found)})
            except Exception as error:
                log.warning('%s: %s', source['id'], error)
                fallback = [a for a in previous.get('articles', []) if a['sourceId'] == source['id']
                            and parse_date(a.get('publishedAt')) and now - parse_date(a['publishedAt']) <= MAX_AGE]
                for article in fallback:
                    article['fromCache'] = True
                records.extend(fallback)
                statuses.append({**source, 'status': 'cached' if fallback else 'unavailable', 'count': len(fallback)})
    if not successes:
        raise RuntimeError('All sources failed; preserving the previous edition')
    seen, articles = set(), []
    for article in records:
        identity = re.sub(r'\W+', '', article['originalTitle'].lower())
        if article['id'] in seen or identity in seen:
            continue
        seen.update((article['id'], identity))
        if article.get('fromCache') and article.get('title'):
            articles.append(article)
            continue
        try:
            article['title'] = translator.text(article['originalTitle'], article['language']) if translator else article['originalTitle']
            article['text'] = translator.text(article['originalText'], article['language']) if translator else article['originalText']
            article['translation'] = 'original' if article['language'] == 'ru' else ('argos' if translator else 'unavailable')
        except Exception as error:
            log.warning('Translation failed for %s: %s', article['id'], error)
            article.update(title=article['originalTitle'], text=article['originalText'], translation='unavailable')
        if article.get('originalFullText'):
            try:
                article['fullText'] = translator.article(article['originalFullText'], article['language']) if translator else article['originalFullText']
                article['fullTranslation'] = 'original' if article['language'] == 'ru' else ('argos' if translator else 'unavailable')
            except Exception as error:
                log.warning('Full article translation failed for %s: %s', article['id'], error)
                article['fullText'] = article['originalFullText']
                article['fullTranslation'] = 'unavailable'
        articles.append(article)
    articles.sort(key=lambda a: a.get('publishedAt') or '', reverse=True)
    data = {'schemaVersion': 1, 'generatedAt': now.isoformat(), 'translationEngine': 'Argos Translate en → ru',
            'sources': sorted(statuses, key=lambda s: [x['id'] for x in sources].index(s['id'])), 'articles': articles}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(output)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(dict(list(cache.items())[-12000:]), ensure_ascii=False) + '\n')
    print(json.dumps({'articles': len(articles), 'fullArticles': sum(bool(a.get('fullText')) for a in articles), 'healthySources': successes, 'totalSources': len(sources), 'raw': raw}))


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'web/data/news.json')
    parser.add_argument('--cache', type=Path, default=ROOT / 'scripts/translation-cache.json')
    parser.add_argument('--raw', action='store_true', help='Diagnostic only: leave foreign items explicitly untranslated')
    parser.add_argument('--limit', type=int, default=6)
    args = parser.parse_args()
    collect(args.output, args.cache, args.raw, args.limit)
