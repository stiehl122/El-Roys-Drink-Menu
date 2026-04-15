const GOOGLE_CSS_BASE = 'https://fonts.googleapis.com/css2';
const FONTS_HOST = 'fonts.gstatic.com';

const FONT_SET_QUERIES = {
  root: 'family=Barlow+Condensed:wght@400;500;600;700&family=Bebas+Neue&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap',
  'manager-shell': 'family=Inter:wght@400;500;600;700;800&family=Noto+Serif:ital,wght@0,400;0,600;0,700;1,600&display=swap',
  'admin-shell': 'family=Inter:wght@300;400;500;600;700;800&family=Public+Sans:wght@500;700;800;900&display=swap',
  'leroys-route': 'family=Epilogue:wght@700;800;900&family=Space+Grotesk:wght@400;500;700&family=Work+Sans:wght@300;400;500;600&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
  'elroys-route': 'family=Newsreader:ital,wght@0,400..800;1,400..800&family=Plus+Jakarta+Sans:wght@200..800&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
};

const DYNAMIC_FONT_QUERIES = {
  'DM Sans': 'family=DM+Sans:wght@400;700&display=swap',
  'Bebas Neue': 'family=Bebas+Neue&display=swap',
  Oswald: 'family=Oswald:wght@400;700&display=swap',
  Pacifico: 'family=Pacifico&display=swap',
  Bangers: 'family=Bangers&display=swap',
  'Fredoka One': 'family=Fredoka:wght@400;700&display=swap',
  'Lilita One': 'family=Lilita+One&display=swap',
  'Black Han Sans': 'family=Black+Han+Sans&display=swap',
  Righteous: 'family=Righteous&display=swap',
  Boogaloo: 'family=Boogaloo&display=swap',
  'Titan One': 'family=Titan+One&display=swap',
  Inter: 'family=Inter:wght@400;700&display=swap',
  Outfit: 'family=Outfit:wght@400;700&display=swap',
  Nunito: 'family=Nunito:wght@400;700&display=swap',
  Raleway: 'family=Raleway:wght@400;700&display=swap',
  Poppins: 'family=Poppins:wght@400;700&display=swap',
  Lato: 'family=Lato:wght@400;700&display=swap',
  'Open Sans': 'family=Open+Sans:wght@400;700&display=swap',
  Roboto: 'family=Roboto:wght@400;700&display=swap',
  'Source Sans 3': 'family=Source+Sans+3:wght@400;700&display=swap',
  'Permanent Marker': 'family=Permanent+Marker&display=swap',
  Satisfy: 'family=Satisfy&display=swap',
  'Dancing Script': 'family=Dancing+Script:wght@400;700&display=swap',
  Caveat: 'family=Caveat:wght@400;700&display=swap',
  'Indie Flower': 'family=Indie+Flower&display=swap',
  Kalam: 'family=Kalam:wght@400;700&display=swap',
  'Patrick Hand': 'family=Patrick+Hand&display=swap',
  Courgette: 'family=Courgette&display=swap',
  Handlee: 'family=Handlee&display=swap',
};

function getFontCssUrl({ set = '', font = '' } = {}) {
  if (set && FONT_SET_QUERIES[set]) return `${GOOGLE_CSS_BASE}?${FONT_SET_QUERIES[set]}`;
  if (font && DYNAMIC_FONT_QUERIES[font]) return `${GOOGLE_CSS_BASE}?${DYNAMIC_FONT_QUERIES[font]}`;
  throw { status: 400, message: 'Unsupported font request' };
}

function rewriteFontCss(css = '') {
  return String(css || '').replace(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g, match => {
    return `/api/public?action=font_file&url=${encodeURIComponent(match)}`;
  });
}

function assertAllowedFontUrl(rawUrl = '') {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ''));
  } catch (_) {
    throw { status: 400, message: 'Invalid font request' };
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== FONTS_HOST) {
    throw { status: 400, message: 'Unsupported font request' };
  }
  return parsed.toString();
}

export async function proxyFontStylesheet({ set = '', font = '' } = {}) {
  const targetUrl = getFontCssUrl({ set, font });
  const response = await fetch(targetUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ElRoysFontProxy/1.0)',
      accept: 'text/css,*/*;q=0.1',
    },
  });
  if (!response.ok) {
    throw { status: response.status || 502, message: 'Failed to load font stylesheet' };
  }
  const css = await response.text();
  return {
    body: rewriteFontCss(css),
    contentType: response.headers.get('content-type') || 'text/css; charset=utf-8',
    cacheControl: 'public, max-age=86400, s-maxage=86400',
  };
}

export async function proxyFontFile(url = '') {
  const targetUrl = assertAllowedFontUrl(url);
  const response = await fetch(targetUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ElRoysFontProxy/1.0)',
    },
  });
  if (!response.ok) {
    throw { status: response.status || 502, message: 'Failed to load font file' };
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    body: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || 'font/woff2',
    cacheControl: 'public, max-age=31536000, immutable',
  };
}
