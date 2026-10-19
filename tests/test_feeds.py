import sys
from pathlib import Path
import unittest
from datetime import datetime, timezone
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from collect_news import parse_feed, clean_text, canonical_url, excerpt, MetadataParser

SOURCE = {'id':'test','name':'Test','country':'US','language':'en','kind':'Редакция'}
NOW = datetime(2026,10,19,12,tzinfo=timezone.utc)

class FeedTests(unittest.TestCase):
    def test_rss_sanitizes_and_keeps_only_recent_safe_articles(self):
        xml = b'''<rss><channel><item><title>A &amp; B</title><link>https://example.com/1?utm_source=rss</link><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Hello&lt;/p&gt;&lt;script&gt;danger&lt;/script&gt; world</description></item><item><title>Old</title><link>https://example.com/old</link><pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>'''
        result=parse_feed(xml,SOURCE,NOW)
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]['originalText'],'Hello world')
        self.assertEqual(result[0]['url'],'https://example.com/1')
    def test_atom_and_rdf_namespaces(self):
        atom=b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom</title><link href="https://example.org/atom"/><updated>2026-10-19T08:00:00Z</updated><summary>Text</summary></entry></feed>'''
        self.assertEqual(parse_feed(atom,SOURCE,NOW)[0]['originalText'],'Text')
        rdf=b'''<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>RDF</title><link>https://example.org/rdf</link><dc:date>2026-10-19T08:00:00Z</dc:date><description>Text</description></item></rdf:RDF>'''
        self.assertIsNotNone(parse_feed(rdf,SOURCE,NOW)[0]['publishedAt'])
    def test_html_and_url_safety(self):
        self.assertEqual(clean_text('<b>Hello</b><br>world<style>bad</style>'),'Hello world')
        self.assertIsNone(canonical_url('data:text/html,test'))
        self.assertIsNone(canonical_url('https://user:pass@example.org'))
        self.assertLessEqual(len(excerpt('word '*500)),651)
    def test_public_teaser_metadata(self):
        parser=MetadataParser()
        parser.feed('<meta property="og:description" content="Publisher &amp; description"><meta name="description" content="Fallback">')
        self.assertEqual(parser.descriptions['og:description'],'Publisher & description')

if __name__=='__main__':unittest.main()
