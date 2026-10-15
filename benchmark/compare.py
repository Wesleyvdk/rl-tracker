"""Bounded, local-only retrieval comparison. Run from the benchmark Docker image."""
import argparse
import asyncio
import json
import resource
import signal
import time
from pathlib import Path


def deadline(*_):
    raise TimeoutError('75 second benchmark deadline')


def run(engine, url, output):
    started = time.monotonic()
    status, html, error = None, '', None
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(75)
    try:
        if engine == 'http':
            import urllib.request
            with urllib.request.urlopen(url, timeout=25) as response:
                status, html = response.status, response.read().decode('utf-8', 'replace')
        elif engine == 'scrapling-http':
            from scrapling.fetchers import Fetcher
            response = Fetcher.get(url, timeout=25, retries=0)
            status, html = response.status, response.body.decode('utf-8', 'replace')
        elif engine == 'crawl4ai':
            from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
            async def crawl():
                import subprocess
                browser = subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--remote-debugging-port=9222'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                await asyncio.sleep(2)
                config = BrowserConfig(headless=True, cdp_url='http://127.0.0.1:9222', browser_mode='custom', extra_args=['--no-sandbox'])
                async with AsyncWebCrawler(config=config) as crawler:
                    return await crawler.arun(url, config=CrawlerRunConfig(cache_mode=CacheMode.BYPASS, page_timeout=30000, delay_before_return_html=3.0))
            response = asyncio.run(crawl())
            status, html = response.status_code, response.html or ''
            if not response.success: error = response.error_message
        elif engine in ('scrapling-browser', 'scrapling-stealth'):
            from scrapling.fetchers import DynamicFetcher, StealthyFetcher
            DynamicFetcher = StealthyFetcher if engine == "scrapling-stealth" else DynamicFetcher
            response = DynamicFetcher.fetch(url, executable_path='/usr/bin/chromium', headless=True, timeout=30000, wait=10000, google_search=False, useragent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', extra_flags=['--no-sandbox'])
            status, html = response.status, response.body.decode('utf-8', 'replace')
    except Exception as exc:
        error = f'{type(exc).__name__}: {exc}'
    finally:
        signal.alarm(0)
    from lxml import html as dom
    tree = dom.fromstring(html or '<html/>')
    rows = tree.cssselect('table tbody tr')
    rank_rows = [row for row in rows if row.cssselect('.playlist')]
    title = tree.xpath('string(//title)')
    result = dict(engine=engine, url=url, status=status, seconds=round(time.monotonic()-started, 2), max_rss_mib=round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024,1), bytes=len(html.encode()), playlist_rows=len(rank_rows), title=title, usable_stats=bool(rank_rows), error=error or (None if rank_rows else 'No usable playlist rows'))
    Path(output).mkdir(parents=True, exist_ok=True)
    Path(output, engine+'.html').write_text(html)
    Path(output, engine+'.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('engine', choices=['http','scrapling-http','crawl4ai','scrapling-browser','scrapling-stealth'])
    p.add_argument('--url', default='https://rocketleague.tracker.network/rocket-league/profile/epic/ehzgodd/overview')
    p.add_argument('--output', default='/results')
    a=p.parse_args()
    run(a.engine, a.url, a.output)
