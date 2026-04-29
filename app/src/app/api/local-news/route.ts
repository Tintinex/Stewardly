import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface NewsItem {
  title: string
  url: string
  source: string
  publishedAt: string
}

/**
 * GET /api/local-news?city=Chicago&state=IL
 *
 * Fetches top headlines from Google News RSS for a given city/state.
 * Runs server-side so there are no CORS issues, and no API key is required.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const city = req.nextUrl.searchParams.get('city') ?? ''
  const state = req.nextUrl.searchParams.get('state') ?? ''

  if (!city) {
    return NextResponse.json({ items: [] })
  }

  const query = encodeURIComponent(`${city} ${state} local community news`.trim())
  const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`

  try {
    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Stewardly/1.0)' },
      next: { revalidate: 900 }, // cache for 15 minutes
    })

    if (!res.ok) {
      return NextResponse.json({ items: [] })
    }

    const xml = await res.text()

    // Simple XML parser using exec loop — avoids matchAll / 's' flag compatibility issues
    const items: NewsItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let m: RegExpExecArray | null

    while ((m = itemRegex.exec(xml)) !== null) {
      if (items.length >= 6) break
      const block = m[1]

      const rawTitle = extractTag(block, 'title') ?? ''
      const title = stripCdata(rawTitle).trim()
      const link  = extractTag(block, 'link') ?? extractTag(block, 'guid') ?? ''
      const pubDate = extractTag(block, 'pubDate') ?? ''
      const rawSource = extractTag(block, 'source') ?? extractTag(block, 'author') ?? 'News'
      const source = stripCdata(rawSource).trim()

      if (!title) continue

      // Google News wraps the actual article URL in the link; extract it if possible
      const googleUrlMatch = /url=([^&]+)/.exec(link)
      const actualUrl = googleUrlMatch ? decodeURIComponent(googleUrlMatch[1]) : link

      items.push({
        title,
        url: actualUrl || link,
        source,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      })
    }

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}

function stripCdata(s: string): string {
  const cdataMatch = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(s.trim())
  return cdataMatch ? cdataMatch[1] : s
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i')
  const mm = re.exec(xml)
  return mm ? mm[1].trim() : null
}
