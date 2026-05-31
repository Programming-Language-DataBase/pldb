'use strict'

const https = require('https')
const http = require('http')
const path = require('path')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')

// ─── Language definitions ────────────────────────────────────────────────────
// strict: key into STRICT_PATTERNS for ambiguous short names

const LANGUAGES = [
  { name: 'Python',     pldbId: 'python' },
  { name: 'C',          pldbId: 'c',          strict: 'C' },
  { name: 'C++',        pldbId: 'cpp' },
  { name: 'Java',       pldbId: 'java' },
  { name: 'C#',         pldbId: 'csharp' },
  { name: 'JavaScript', pldbId: 'javascript' },
  { name: 'TypeScript', pldbId: 'typescript' },
  { name: 'Rust',       pldbId: 'rust' },
  { name: 'Go',         pldbId: 'go',         strict: 'Go' },
  { name: 'Kotlin',     pldbId: 'kotlin' },
  { name: 'Swift',      pldbId: 'swift' },
  { name: 'Haskell',    pldbId: 'haskell' },
  { name: 'Scala',      pldbId: 'scala' },
  { name: 'R',          pldbId: 'r',          strict: 'R' },
  { name: 'SQL',        pldbId: 'sql' },
  { name: 'Erlang',     pldbId: 'erlang' },
  { name: 'OCaml',      pldbId: 'ocaml' },
  { name: 'Clojure',    pldbId: 'clojure' },
  { name: 'Prolog',     pldbId: 'prolog' },
  { name: 'Lisp',       pldbId: 'lisp' },
  { name: 'Racket',     pldbId: 'racket' },
  { name: 'Julia',      pldbId: 'julia' },
  { name: 'Lua',        pldbId: 'lua' },
  { name: 'PHP',        pldbId: 'php' },
  { name: 'Fortran',    pldbId: 'fortran' },
  { name: 'F#',         pldbId: 'fsharp' },
  { name: 'Scheme',     pldbId: 'scheme' },
  { name: 'Elixir',     pldbId: 'elixir' },
  { name: 'Elm',        pldbId: 'elm' },
  { name: 'Cobol',      pldbId: 'cobol' },
]

// Patterns that must match in title+abstract before we credit the article to
// an ambiguous short-name language.  Without these, the letter "C" or "R"
// would trigger false positives in almost every article.
const STRICT_PATTERNS = {
  C: /\b(C\s+programming\s+language|C\s+language|C\s+programs?\b|C\s+code\b|C\s+compiler|C\s+standard|ANSI\s+C|ISO\s+C|C99|C11|C17|C23|in\s+C\s*[,;.]|the\s+C\s+language)\b/,
  Go: /\b(Go\s+programming|Golang|the\s+Go\s+(programming\s+)?language)\b/i,
  R:  /\b(R\s+programming|R\s+package|R\s+language|CRAN|R\s+statistical|the\s+R\s+(programming\s+)?language)\b/i,
}

function mentionsLanguage(text, lang) {
  if (!text) return false
  if (lang.strict) {
    const pat = STRICT_PATTERNS[lang.strict]
    return pat ? pat.test(text) : false
  }
  const escaped = lang.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

function detectLanguages(title, abstract) {
  const combined = `${title || ''} ${abstract || ''}`
  return LANGUAGES.filter(lang => mentionsLanguage(combined, lang))
}

// ─── HTTP fetch with redirect following ──────────────────────────────────────

function fetchUrl(url, timeoutMs = 12000, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'))
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, { headers: { 'User-Agent': 'PLDB-LatestNews/1.0 (+https://pldb.info)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href
        return fetchUrl(next, timeoutMs, redirects + 1).then(resolve, reject)
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve(data))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Timeout')))
  })
}

// ─── Minimal RSS 1.0 / RSS 2.0 / Atom parser (no external deps) ──────────────

function unwrapCdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function extractField(xml, tag) {
  // matches <tag ...>content</tag>, handles CDATA and nested HTML
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!m) return ''
  return decodeEntities(stripTags(unwrapCdata(m[1]))).trim()
}

function extractLinkHref(xml) {
  // Atom-style: <link href="..." />
  const m = xml.match(/<link[^>]+href="([^"]+)"/)
  return m ? m[1] : ''
}

function parseItems(xml) {
  const items = []

  // RSS 1.0 (RDF) and RSS 2.0 both use <item> elements.
  // Use \b so we don't match <items> (the RSS 1.0 container element).
  const rssRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi
  let m
  while ((m = rssRe.exec(xml)) !== null) {
    const raw = m[1]
    const title = extractField(raw, 'title')
    if (!title) continue
    items.push({
      title,
      link:     extractField(raw, 'link') || extractLinkHref(raw) || extractField(raw, 'guid'),
      author:   extractField(raw, 'dc:creator') || extractField(raw, 'author'),
      abstract: extractField(raw, 'description') || extractField(raw, 'content:encoded'),
      pubDate:  extractField(raw, 'pubDate') || extractField(raw, 'dc:date'),
    })
  }
  if (items.length) return items

  // Atom feeds use <entry> elements
  const atomRe = /<entry>([\s\S]*?)<\/entry>/gi
  while ((m = atomRe.exec(xml)) !== null) {
    const raw = m[1]
    const title = extractField(raw, 'title')
    if (!title) continue
    const authorBlock = extractField(raw, 'author')
    items.push({
      title,
      link:     extractLinkHref(raw) || extractField(raw, 'id'),
      author:   extractField(raw, 'name') || authorBlock,
      abstract: extractField(raw, 'summary') || extractField(raw, 'content'),
      pubDate:  extractField(raw, 'published') || extractField(raw, 'updated'),
    })
  }
  return items
}

// ─── Per-source fetchers ──────────────────────────────────────────────────────

async function fetchArxiv() {
  // Use the arXiv API (Atom) rather than the RSS feed, which is empty on weekends.
  // cs.PL = Programming Languages — all papers are PL-related by category.
  const url = 'https://export.arxiv.org/api/query?search_query=cat:cs.PL&start=0&max_results=40&sortBy=submittedDate&sortOrder=descending'
  const xml = await fetchUrl(url)
  return parseItems(xml).map(item => ({
    ...item,
    // The API id URL is the canonical link; link field may have it already
    link: item.link || item.author, // author field sometimes has the id
    source: 'arXiv cs.PL',
  }))
}

async function fetchLobsters() {
  const xml = await fetchUrl('https://lobste.rs/t/plt.rss')
  return parseItems(xml)
    .slice(0, 20)
    .map(item => ({ ...item, source: 'lobste.rs' }))
}

async function fetchLambdaUltimate() {
  const xml = await fetchUrl('http://lambda-the-ultimate.org/rss.xml')
  return parseItems(xml)
    .slice(0, 15)
    .map(item => ({ ...item, source: 'Lambda the Ultimate' }))
}

async function fetchAcm() {
  // PACMPL = Proceedings of the ACM on Programming Languages (POPL, ICFP, OOPSLA, …)
  // TOPLAS = ACM Transactions on Programming Languages and Systems
  const feeds = [
    'https://dl.acm.org/action/showFeed?type=etoc&feed=rss&jc=PACMPL',
    'https://dl.acm.org/action/showFeed?type=etoc&feed=rss&jc=TOPLAS',
  ]
  const items = []
  for (const url of feeds) {
    const xml = await fetchUrl(url)
    items.push(...parseItems(xml))
  }
  return items.map(item => ({ ...item, source: 'ACM DL' }))
}

async function fetchMedium() {
  // Both tags often overlap; the deduplication pass in fetchLatestNews() handles that.
  const tags = ['programming-languages', 'programming-language']
  const items = []
  for (const tag of tags) {
    const xml = await fetchUrl(`https://medium.com/feed/tag/${tag}`)
    items.push(...parseItems(xml))
  }
  return items.map(item => ({ ...item, source: 'Medium' }))
}

async function fetchHackerNews() {
  // Algolia HN search API — recent stories mentioning "programming language"
  const url = 'https://hn.algolia.com/api/v1/search_by_date?tags=story&query=programming+language&hitsPerPage=20'
  const json = JSON.parse(await fetchUrl(url))
  return (json.hits || []).map(hit => ({
    title:    hit.title || '',
    link:     hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
    author:   hit.author || '',
    abstract: '',
    pubDate:  hit.created_at || '',
    source:   'Hacker News',
  })).filter(item => item.title)
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function fetchLatestNews() {
  const allItems = []

  const sources = [
    { name: 'arXiv cs.PL',        fn: fetchArxiv },
    { name: 'ACM DL',             fn: fetchAcm },
    { name: 'lobste.rs/t/plt',    fn: fetchLobsters },
    { name: 'Lambda the Ultimate', fn: fetchLambdaUltimate },
    { name: 'Medium',             fn: fetchMedium },
    { name: 'Hacker News',        fn: fetchHackerNews },
  ]

  for (const src of sources) {
    try {
      const items = await src.fn()
      console.log(`  ✅ ${src.name}: ${items.length} items`)
      allItems.push(...items)
    } catch (err) {
      console.warn(`  ⚠️  ${src.name}: ${err.message}`)
    }
  }

  // Deduplicate by URL
  const seen = new Set()
  const unique = allItems.filter(item => {
    if (!item.link || seen.has(item.link)) return false
    seen.add(item.link)
    return true
  })

  // Annotate each article with the languages it mentions
  return unique.map(item => ({
    ...item,
    langs: detectLanguages(item.title, item.abstract),
  }))
}

// ─── Scroll / HTML output generators ─────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function articleToLi(a) {
  const titleHtml  = `<a href="${esc(a.link)}" target="_blank" rel="noopener">${esc(a.title.replace(/\n/g, ' '))}</a>`
  const authorHtml = a.author ? `<span class="pldbNewsAuthor"> · ${esc(a.author)}</span>` : ''
  const langLinks  = a.langs.map(l => `<a href="concepts/${l.pldbId}.html">${esc(l.name)}</a>`).join(' ')
  const langHtml   = langLinks ? `<span class="pldbNewsLangs"> [${langLinks}]</span>` : ''
  const sourceHtml = `<span class="pldbNewsSource"> — ${esc(a.source)}</span>`
  return `<li class="pldbNewsItem">${titleHtml}${authorHtml}${langHtml}${sourceHtml}</li>`
}

function writeLatestNewsScroll(articles, fetchDate) {
  // Prefer articles that mention at least one known language; within each tier
  // preserve original fetch order (most-recent first from each source).
  const tagged   = articles.filter(a => a.langs.length > 0)
  const untagged = articles.filter(a => a.langs.length === 0)
  const ordered  = [...tagged, ...untagged]

  // ── Homepage widget ──────────────────────────────────────────────────────
  const widgetContent = `importOnly

<p class="pldbHomepageLink"><a href="news.html">News on Programming Languages</a> <span style="color:#828282;font-size:0.85em;">(Updated ${fetchDate})</span></p>
`
  fs.writeFileSync(path.join(ROOT, 'latestNews.scroll'), widgetContent)

  // ── Full news page ────────────────────────────────────────────────────────
  const SOURCE_ORDER = ['arXiv cs.PL', 'ACM DL', 'lobste.rs', 'Lambda the Ultimate', 'Medium', 'Hacker News']
  const bySource = {}
  for (const src of SOURCE_ORDER) bySource[src] = []
  for (const a of ordered) {
    const bucket = bySource[a.source] || (bySource[a.source] = [])
    bucket.push(a)
  }

  let sectionsHtml = ''
  for (const src of [...SOURCE_ORDER, ...Object.keys(bySource).filter(k => !SOURCE_ORDER.includes(k))]) {
    const items = bySource[src]
    if (!items || !items.length) continue
    const LABELS = {
      'arXiv cs.PL': 'Academic Papers (arXiv cs.PL)',
      'ACM DL': 'ACM Digital Library (PACMPL & TOPLAS)',
    }
    const label = LABELS[src] || src
    sectionsHtml += `\n<h2>${esc(label)}</h2>\n<ul class="pldbNewsFull">\n`
    sectionsHtml += items.map(articleToLi).join('\n')
    sectionsHtml += '\n</ul>\n'
  }

  const newsPageContent = `title Latest on Programming Languages - PLDB

rootHeader.scroll

# Latest on Programming Languages

<p class="pldbNewsUpdated">Updated: ${fetchDate} &nbsp;·&nbsp; Sources: arXiv cs.PL &nbsp;·&nbsp; ACM Digital Library &nbsp;·&nbsp; lobste.rs/t/plt &nbsp;·&nbsp; Lambda the Ultimate &nbsp;·&nbsp; Medium &nbsp;·&nbsp; Hacker News</p>
${sectionsHtml}
footer.scroll
`
  fs.writeFileSync(path.join(ROOT, 'news.scroll'), newsPageContent)
  console.log(`  Wrote latestNews.scroll and news.scroll (${ordered.length} items)`)
}

module.exports = { fetchLatestNews, writeLatestNewsScroll }
