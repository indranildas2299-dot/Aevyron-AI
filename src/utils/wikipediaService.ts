import {
  LanguagePreference,
  WikipediaMediaItem,
  WikipediaSourceCard,
} from '../types/aevyron';

const WIKI_CACHE_KEY = 'aevyron_wiki_cache_v1';

const BENGALI_CHAR_REGEX = /[\u0980-\u09FF]/;

const NON_WIKI_CONVERSATIONAL_REGEX =
  /^(?:(?:hi+|hello+|hey+|yo|hola|namaste|nomoskar|namaskar|assalamu\s*alaikum|salam|suprobhat|thank\s*you|thanks|thx|dhonnobad|ok|okay|bye|good\s*(?:morning|afternoon|evening|night)|how\s+are\s+you(?:\s+doing)?|how's\s+it\s+going|kemon\s+acho|kemon\s+achen|ki\s+korcho|who\s+are\s+you|what\s+is\s+your\s+name|tomar\s+naam\s+ki|হ্যালো|হাই|নমস্কার|ধন্যবাদ|তুমি\s+কেমন\s+আছো|আপনি\s+কেমন\s+আছেন|কী\s+করছো|কি\s+করছো|তোমার\s+নাম\s+কী|তুমি\s+কে|তুমি\s+কি\s+বাংলায়\s+কথা\s+বলতে\s+পারো)[\s!.,?।]*)+$/i;

const NON_WIKI_TASK_REGEX =
  /(?:^(?:please\s+)?remember\s+that|^(?:মনে\s*রেখো|মনে\s*রাখবে)|^(?:my\s+name\s+is|আমার\s+নাম)|(?:write\s+a?\s*(?:poem|story|joke|code|program|function))|(?:একটি\s+(?:সুন্দর\s+)?(?:কবিতা|গল্প|কৌতুক|জোকস)\s+লেখো)|(?:আমার\s+ফোনের\s+মেমরি|my\s+phone\s+memory\s+vault))/i;

/**
 * Extracts a clean Wikipedia search topic from a natural user message in English or Bengali.
 */
export function extractWikipediaTopicQuery(
  prompt: string,
  languagePreference: LanguagePreference = 'auto'
): {
  shouldQuery: boolean;
  topic: string;
  preferBengali: boolean;
} {
  const raw = prompt.trim();
  if (!raw || raw.length < 2) {
    return { shouldQuery: false, topic: '', preferBengali: false };
  }

  // Skip pure casual greetings, poems/jokes/coding tasks, or pure arithmetic
  if (NON_WIKI_CONVERSATIONAL_REGEX.test(raw) || NON_WIKI_TASK_REGEX.test(raw)) {
    return { shouldQuery: false, topic: '', preferBengali: false };
  }
  if (/^[\d\s\+\-\*\/\^%().=০-৯]+$/.test(raw)) {
    return { shouldQuery: false, topic: '', preferBengali: false };
  }

  const hasBengaliScript = BENGALI_CHAR_REGEX.test(raw);
  const asksForBengali =
    languagePreference === 'bn' ||
    hasBengaliScript ||
    /\b(?:in\s+bengali|in\s+bangla|banglay|বাংলায়|বাংলাতে)\b/i.test(raw);

  // Clean conversational wrappers in English & Bengali
  let cleaned = raw
    // Remove leading English conversational prefixes
    .replace(
      /^(?:please\s+)?(?:can\s+you\s+|could\s+you\s+)?(?:tell\s+me\s+about|give\s+me\s+(?:information|info|details)\s+(?:about|on)|search\s+(?:wikipedia\s+)?(?:for|about|on)|look\s+up|find\s+(?:information|info)\s+(?:about|on)|explain\s+(?:what\s+is\s+|who\s+is\s+)?|what\s+is\s+(?:a\s+|an\s+|the\s+)?|what\s+are\s+(?:the\s+)?|who\s+is\s+|who\s+was\s+|where\s+is\s+|history\s+of\s+|wikipedia\s+(?:search\s+)?(?:for|on|about)?|show\s+(?:me\s+)?(?:images?\s+(?:and\s+videos?\s+)?of|videos?\s+of|info\s+on))\s*/i,
      ''
    )
    // Remove trailing English modifiers ("from wikipedia", "with image and video", "in bengali")
    .replace(
      /\s*(?:(?:and\s+)?(?:also\s+)?(?:send|show|with|include|give)\s+(?:me\s+)?(?:some\s+|the\s+)?(?:wikipedia\s+)?(?:images?|photos?|pictures?|videos?|media|information|info)(?:\s+and\s+(?:images?|photos?|videos?|media|information|info))*|\s+from\s+wikipedia|\s+on\s+wikipedia|\s+in\s+(?:bengali|bangla|english))+[\s?.!।]*$/gi,
      ''
    )
    // Remove Bengali conversational wrappers
    .replace(
      /^(?:উইকিপিডিয়া\s+থেকে\s+|আমাকে\s+|দয়া\s+করে\s+)?/i,
      ''
    )
    .replace(
      /\s*(?:সম্পর্কে\s+(?:বিস্তারিত\s+|কিছু\s+)?(?:তথ্য\s+)?(?:ও\s+)?(?:ছবি\s+এবং\s+ভিডিও\s+|ছবি\s+ও\s+ভিডিও\s+|ছবি\s+|ভিডিও\s+)?(?:বলো|বলুন|দাও|দিন|জানাও|দেখাও)|সম্পর্কে\s+কী\s+জানো|উইকিপিডিয়া\s+থেকে\s+বলো|এর\s+ছবি\s+ও\s+ভিডিও\s+দাও|\s+কী|\s+কি|\s+কে|\s+কাকে\s+বলে|\s+কোথায়\s+অবস্থিত)+[\s?.!।]*$/gi,
      ''
    )
    .replace(/[?!।."']+$/g, '')
    .trim();

  if (!cleaned || cleaned.length < 2 || cleaned.split(/\s+/).length > 10) {
    return { shouldQuery: false, topic: '', preferBengali: asksForBengali };
  }

  return {
    shouldQuery: true,
    topic: cleaned,
    preferBengali: asksForBengali,
  };
}

function readWikiCache(): Record<string, WikipediaSourceCard> {
  try {
    const raw = localStorage.getItem(WIKI_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeWikiCache(key: string, card: WikipediaSourceCard): void {
  try {
    const existing = readWikiCache();
    existing[key.toLowerCase()] = card;
    localStorage.setItem(WIKI_CACHE_KEY, JSON.stringify(existing));
  } catch {
    // ignore quota errors
  }
}

async function searchWikiArticle(
  topic: string,
  lang: 'en' | 'bn',
  signal?: AbortSignal
): Promise<{
  title: string;
  extract: string;
  articleUrl: string;
  thumbnailUrl?: string;
  englishTitle?: string;
} | null> {
  const endpoint =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*` +
    `&generator=search&gsrsearch=${encodeURIComponent(topic)}&gsrlimit=1` +
    `&prop=extracts|pageimages|info|langlinks&inprop=url&lllang=en` +
    `&exintro=1&explaintext=1&piprop=original|thumbnail&pithumbsize=800`;

  const res = await fetch(endpoint, { signal });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;

  const firstPage: any = Object.values(pages)[0];
  if (!firstPage || !firstPage.extract) return null;

  const title: string = firstPage.title;
  const extract: string = String(firstPage.extract).trim();
  const articleUrl: string =
    firstPage.fullurl ||
    `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
  const thumbnailUrl: string | undefined =
    firstPage.original?.source || firstPage.thumbnail?.source;
  const englishTitle: string | undefined =
    lang === 'en'
      ? title
      : Array.isArray(firstPage.langlinks) && firstPage.langlinks[0]?.['*']
      ? firstPage.langlinks[0]['*']
      : undefined;

  return {
    title,
    extract,
    articleUrl,
    thumbnailUrl,
    englishTitle,
  };
}

async function fetchCommonsMedia(
  searchQuery: string,
  mediaType: 'bitmap' | 'video',
  limit: number,
  signal?: AbortSignal
): Promise<WikipediaMediaItem[]> {
  const queryStr = `filetype:${mediaType} ${searchQuery}`;
  const endpoint =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*` +
    `&generator=search&gsrsearch=${encodeURIComponent(queryStr)}&gsrnamespace=6&gsrlimit=${limit}` +
    `&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=720`;

  const res = await fetch(endpoint, { signal });
  if (!res.ok) return [];
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return [];

  const items: WikipediaMediaItem[] = [];
  const sortedPages = Object.values(pages).sort(
    (a: any, b: any) => (a.index ?? 99) - (b.index ?? 99)
  );

  for (const page of sortedPages as any[]) {
    const info = page?.imageinfo?.[0];
    if (!info || !info.url) continue;

    const mime: string = info.mime || '';
    if (mediaType === 'bitmap' && (mime.includes('svg') || mime.includes('tiff') || mime.includes('pdf'))) {
      continue;
    }

    const cleanTitle = String(page.title || '')
      .replace(/^File:/i, '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/_/g, ' ');

    const rawDesc =
      info.extmetadata?.ImageDescription?.value ||
      info.extmetadata?.ObjectName?.value ||
      '';
    const caption = String(rawDesc)
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);

    items.push({
      id: `wiki-${mediaType}-${page.pageid || Math.random().toString(36).slice(2, 8)}`,
      type: mediaType === 'video' ? 'video' : 'image',
      title: cleanTitle,
      url: info.url,
      thumbUrl: info.thumburl || info.url,
      mimeType: mime || (mediaType === 'video' ? 'video/webm' : 'image/jpeg'),
      sourcePageUrl:
        info.descriptionurl ||
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || '')}`,
      caption: caption || cleanTitle,
    });
  }

  return items;
}

/**
 * Queries Wikipedia (English & Bengali) and Wikimedia Commons for verified encyclopedic
 * information along with images and playable videos, caching results locally for offline reuse.
 */
export async function fetchWikipediaKnowledge(
  userPrompt: string,
  languagePreference: LanguagePreference = 'auto',
  signal?: AbortSignal
): Promise<WikipediaSourceCard | null> {
  const { shouldQuery, topic, preferBengali } = extractWikipediaTopicQuery(
    userPrompt,
    languagePreference
  );
  if (!shouldQuery || !topic) return null;

  const cacheKey = `${preferBengali ? 'bn' : 'en'}:${topic.toLowerCase()}`;
  const cached = readWikiCache()[cacheKey];

  try {
    const primaryLang: 'en' | 'bn' = preferBengali ? 'bn' : 'en';
    const fallbackLang: 'en' | 'bn' = preferBengali ? 'en' : 'bn';

    let article = await searchWikiArticle(topic, primaryLang, signal);
    let activeLang: 'en' | 'bn' = primaryLang;

    if (!article) {
      article = await searchWikiArticle(topic, fallbackLang, signal);
      activeLang = fallbackLang;
    }

    if (!article) {
      return cached ? { ...cached, fromOfflineCache: true } : null;
    }

    // Use the English canonical title (if available) to search Wikimedia Commons for rich images & videos
    const commonsQuery = article.englishTitle || article.title || topic;

    const [commonsImages, commonsVideosPrimary] = await Promise.all([
      fetchCommonsMedia(commonsQuery, 'bitmap', 4, signal).catch(() => []),
      fetchCommonsMedia(commonsQuery, 'video', 3, signal).catch(() => []),
    ]);

    let videos = commonsVideosPrimary;
    // If specific multi-word title had no video on Commons, try broader first word/keyword
    if (videos.length === 0 && commonsQuery.includes(' ')) {
      const broadTerm = commonsQuery.split(/\s+/)[0];
      if (broadTerm.length >= 3) {
        videos = await fetchCommonsMedia(broadTerm, 'video', 2, signal).catch(() => []);
      }
    }

    const images: WikipediaMediaItem[] = [];
    if (article.thumbnailUrl) {
      images.push({
        id: `wiki-lead-${Date.now()}`,
        type: 'image',
        title: `${article.title} (Wikipedia Lead Image)`,
        url: article.thumbnailUrl,
        thumbUrl: article.thumbnailUrl,
        mimeType: 'image/jpeg',
        sourcePageUrl: article.articleUrl,
        caption: `${article.title} — Primary illustration from Wikipedia`,
      });
    }

    for (const img of commonsImages) {
      if (!images.some((existing) => existing.url === img.url) && images.length < 4) {
        images.push(img);
      }
    }

    const card: WikipediaSourceCard = {
      title: article.title,
      language: activeLang,
      extract: article.extract,
      articleUrl: article.articleUrl,
      thumbnailUrl: article.thumbnailUrl,
      images,
      videos: videos.slice(0, 2),
      fetchedAt: Date.now(),
    };

    writeWikiCache(cacheKey, card);
    return card;
  } catch {
    if (cached) {
      return { ...cached, fromOfflineCache: true };
    }
    return null;
  }
}

/**
 * Formats a WikipediaSourceCard into a rich conversational Markdown response in English or Bengali.
 */
export function formatWikipediaGroundedResponse(
  card: WikipediaSourceCard,
  replyInBengali: boolean
): string {
  const paragraphs = card.extract
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const summaryParagraphs = paragraphs.slice(0, 3).join('\n\n');
  const imgCount = card.images.length;
  const vidCount = card.videos.length;

  if (replyInBengali || card.language === 'bn') {
    const mediaLine =
      imgCount > 0 || vidCount > 0
        ? `\n\n---\n**উইকিপিডিয়া মিডিয়া গ্যালারি**: এই তথ্যের সাথে **${imgCount}টি ছবি (Images)** এবং **${vidCount}টি ভিডিও (Videos)** নিচে যুক্ত করা হয়েছে।`
        : '';
    return `### 🌐 ${card.title} — উইকিপিডিয়া বিশ্বকোষ\n\n${summaryParagraphs}${mediaLine}`;
  }

  const mediaLine =
    imgCount > 0 || vidCount > 0
      ? `\n\n---\n**Wikipedia Media Attached**: Included **${imgCount} image(s)** and **${vidCount} video(s)** from Wikipedia & Wikimedia Commons below.`
      : '';
  return `### 🌐 ${card.title} — Wikipedia Encyclopedia\n\n${summaryParagraphs}${mediaLine}`;
}
