function normalizeWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&#(\d+);/gi, (_, code) => {
      const numeric = Number.parseInt(code, 10);
      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const numeric = Number.parseInt(code, 16);
      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : _;
    })
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value = '') {
  return normalizeWhitespace(decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' ')));
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (_) {
        reject({ status: 400, message: 'Invalid JSON body' });
      }
    });
    req.on('error', reject);
  });
}

function canonicalizeUrl(rawUrl = '') {
  try {
    return new URL(String(rawUrl || '').trim()).toString();
  } catch (_) {
    return '';
  }
}

function getHostLabel(url = '') {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, '');
    return hostname
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('.');
  } catch (_) {
    return '';
  }
}

function formatImportDate(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function extractMetaContent(html = '', key = '', attr = 'property') {
  const pattern = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["'][^>]*>`, 'i');
  const match = html.match(pattern) || html.match(reversePattern);
  return match ? stripHtml(match[1]) : '';
}

function extractLinkHref(html = '', rel = 'canonical') {
  const pattern = new RegExp(`<link[^>]+rel=["']${rel}["'][^>]+href=["']([^"']+)["'][^>]*>`, 'i');
  const reversePattern = new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["']${rel}["'][^>]*>`, 'i');
  const match = html.match(pattern) || html.match(reversePattern);
  return match ? canonicalizeUrl(match[1]) : '';
}

function extractTitle(html = '') {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch ? stripHtml(titleMatch[1]) : '';
}

function extractJsonLdObjects(html = '') {
  const matches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  return matches.flatMap(block => {
    const jsonMatch = block.match(/>([\s\S]*?)<\/script>/i);
    if (!jsonMatch) return [];
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (_) {
      return [];
    }
  });
}

function flattenJsonLd(nodes = []) {
  return nodes.flatMap(node => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node['@graph'])) return flattenJsonLd(node['@graph']);
    return [node];
  });
}

function pickJsonLdValue(nodes = [], typeName = '', getter = () => '') {
  const match = flattenJsonLd(nodes).find(node => {
    const typeValue = node?.['@type'];
    if (Array.isArray(typeValue)) return typeValue.includes(typeName);
    return typeValue === typeName;
  });
  return match ? getter(match) : '';
}

async function fetchRemoteHtml(url = '') {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ElRoysLandingImport/1.0; +https://el-roys-drink-menu.vercel.app)',
      'accept': 'text/html,application/xhtml+xml',
    },
  });
  const html = await response.text();
  if (!response.ok) {
    throw new Error(`Remote source responded ${response.status}.`);
  }
  return html;
}

function buildImportStatus(requiredValues = []) {
  const filledCount = requiredValues.filter(Boolean).length;
  if (filledCount === requiredValues.length) return 'imported';
  if (filledCount > 0) return 'partial';
  return 'failed';
}

export async function importNewsFromUrl(rawUrl = '') {
  const attemptedAt = String(Date.now());
  const sourceUrl = canonicalizeUrl(rawUrl);
  if (!sourceUrl) throw { status: 400, message: 'Enter a valid article URL.' };

  try {
    const html = await fetchRemoteHtml(sourceUrl);
    const jsonLd = extractJsonLdObjects(html);
    const href = extractLinkHref(html, 'canonical') || sourceUrl;
    const title = extractMetaContent(html, 'og:title') ||
      extractMetaContent(html, 'twitter:title', 'name') ||
      pickJsonLdValue(jsonLd, 'NewsArticle', node => stripHtml(node.headline)) ||
      pickJsonLdValue(jsonLd, 'Article', node => stripHtml(node.headline)) ||
      extractTitle(html);
    const body = extractMetaContent(html, 'og:description') ||
      extractMetaContent(html, 'description', 'name') ||
      pickJsonLdValue(jsonLd, 'NewsArticle', node => stripHtml(node.description)) ||
      pickJsonLdValue(jsonLd, 'Article', node => stripHtml(node.description));
    const source = extractMetaContent(html, 'og:site_name') ||
      pickJsonLdValue(jsonLd, 'NewsArticle', node => stripHtml(node?.publisher?.name || '')) ||
      pickJsonLdValue(jsonLd, 'Article', node => stripHtml(node?.publisher?.name || '')) ||
      getHostLabel(href);
    const publishedDate = formatImportDate(
      extractMetaContent(html, 'article:published_time') ||
      extractMetaContent(html, 'og:updated_time') ||
      pickJsonLdValue(jsonLd, 'NewsArticle', node => String(node.datePublished || node.dateModified || '')) ||
      pickJsonLdValue(jsonLd, 'Article', node => String(node.datePublished || node.dateModified || ''))
    );
    const imageUrl = canonicalizeUrl(
      extractMetaContent(html, 'og:image') ||
      extractMetaContent(html, 'twitter:image', 'name') ||
      pickJsonLdValue(jsonLd, 'NewsArticle', node => String(Array.isArray(node.image) ? node.image[0] : (node.image?.url || node.image || ''))) ||
      pickJsonLdValue(jsonLd, 'Article', node => String(Array.isArray(node.image) ? node.image[0] : (node.image?.url || node.image || '')))
    );
    const messages = [];
    if (!title) messages.push('Headline could not be imported. Repair it manually.');
    if (!source) messages.push('Source could not be imported. Repair it manually.');
    if (!publishedDate) messages.push('Publish date could not be imported. Repair it manually.');
    if (!imageUrl) messages.push('No image was imported. Text-forward card fallback is ready.');
    return {
      attemptedAt,
      status: buildImportStatus([title, source, publishedDate]),
      sourceUrl,
      href,
      title,
      body,
      source,
      publishedDate,
      imageUrl,
      messages,
    };
  } catch (error) {
    return {
      attemptedAt,
      status: 'failed',
      sourceUrl,
      href: sourceUrl,
      title: '',
      body: '',
      source: getHostLabel(sourceUrl),
      publishedDate: '',
      imageUrl: '',
      messages: [error?.message || 'Import could not reach the source page.'],
    };
  }
}

export async function importReviewFromUrl(rawUrl = '') {
  const attemptedAt = String(Date.now());
  const sourceUrl = canonicalizeUrl(rawUrl);
  if (!sourceUrl) throw { status: 400, message: 'Enter a valid Google review URL.' };
  if (!/google\./i.test(sourceUrl)) throw { status: 400, message: 'Use a Google review URL for v1 review imports.' };

  try {
    const html = await fetchRemoteHtml(sourceUrl);
    const jsonLd = extractJsonLdObjects(html);
    const href = extractLinkHref(html, 'canonical') || sourceUrl;
    const author = pickJsonLdValue(jsonLd, 'Review', node => stripHtml(node?.author?.name || node?.author || '')) ||
      extractMetaContent(html, 'author', 'name');
    const quote = pickJsonLdValue(jsonLd, 'Review', node => stripHtml(node.reviewBody || node.description || '')) ||
      extractMetaContent(html, 'og:description') ||
      extractMetaContent(html, 'description', 'name');
    const rating = Number(
      pickJsonLdValue(jsonLd, 'Review', node => String(node?.reviewRating?.ratingValue || '')) ||
      pickJsonLdValue(jsonLd, 'AggregateRating', node => String(node?.ratingValue || ''))
    );
    const normalizedRating = Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : '';
    const messages = [];
    if (!author) messages.push('Reviewer name could not be imported. Repair it manually.');
    if (!quote) messages.push('Review quote could not be imported. Repair it manually.');
    if (!normalizedRating) messages.push('Star rating could not be imported. Repair it manually.');
    return {
      attemptedAt,
      status: buildImportStatus([author, quote, normalizedRating]),
      sourceUrl,
      href,
      author,
      quote,
      source: 'Google Review',
      rating: normalizedRating,
      messages,
    };
  } catch (error) {
    return {
      attemptedAt,
      status: 'failed',
      sourceUrl,
      href: sourceUrl,
      author: '',
      quote: '',
      source: 'Google Review',
      rating: '',
      messages: [error?.message || 'Import could not reach the review page.'],
    };
  }
}

export { readRequestJson };
