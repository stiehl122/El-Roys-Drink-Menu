(function bootstrapLandingModelModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};

  function buildFallbackDomainConstants() {
    const restaurants = {
      LEROYS: { id: '00000000-0000-0000-0000-000000000010', name: "Leroy's Lounge", slug: 'leroys-lounge' },
      ELROYS: { id: '00000000-0000-0000-0000-000000000001', name: "El Roy's Cantina", slug: 'el-roys-cantina' },
    };
    return {
      RESTAURANT_TIME_ZONE: 'America/Detroit',
      RESTAURANTS: restaurants,
      KNOWN_RESTAURANT_ORDER: [restaurants.LEROYS.id, restaurants.ELROYS.id],
    };
  }

  function createLandingModel(options = {}) {
    const fallbackConstants = buildFallbackDomainConstants();
    const domainConstants = (options.domainConstants && typeof options.domainConstants === 'object')
      ? options.domainConstants
      : ((globalScope.__HF_DOMAIN_CONSTANTS__ && typeof globalScope.__HF_DOMAIN_CONSTANTS__ === 'object')
        ? globalScope.__HF_DOMAIN_CONSTANTS__
        : fallbackConstants);
    const restaurants = domainConstants.RESTAURANTS || fallbackConstants.RESTAURANTS;
    const knownRestaurantOrder = Array.isArray(domainConstants.KNOWN_RESTAURANT_ORDER) && domainConstants.KNOWN_RESTAURANT_ORDER.length
      ? domainConstants.KNOWN_RESTAURANT_ORDER.slice()
      : fallbackConstants.KNOWN_RESTAURANT_ORDER.slice();
    const restaurantTimeZone = domainConstants.RESTAURANT_TIME_ZONE || fallbackConstants.RESTAURANT_TIME_ZONE;
    const appVersion = domainConstants.APP_VERSION || fallbackConstants.APP_VERSION || '';
    const landingPageStateId = 'root';
    const landingSectionOrder = ['overview', 'hours', 'events', 'news', 'reviews'];
    const landingDayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const landingDayLabels = {
      mon: 'Monday',
      tue: 'Tuesday',
      wed: 'Wednesday',
      thu: 'Thursday',
      fri: 'Friday',
      sat: 'Saturday',
      sun: 'Sunday',
    };
    const landingTargetBoth = 'both';
    const landingImportStatusIdle = 'idle';
    const landingImportStatusImported = 'imported';
    const landingImportStatusPartial = 'partial';
    const landingImportStatusFailed = 'failed';

    function uid() {
      return `hf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function escHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function escAttrJs(value) {
      return escHtml(JSON.stringify(String(value)));
    }

    function cloneJsonCompatible(value, fallback) {
      try {
        return JSON.parse(JSON.stringify(value ?? fallback));
      } catch (_) {
        return JSON.parse(JSON.stringify(fallback));
      }
    }

    function knownLandingRestaurants() {
      return Object.values(restaurants).sort((a, b) => knownRestaurantOrder.indexOf(a.id) - knownRestaurantOrder.indexOf(b.id));
    }

    function createDefaultLandingDay() {
      return { closed: true, open: '', close: '' };
    }

    function createDefaultLandingHoursRestaurant() {
      const days = {};
      landingDayOrder.forEach(dayKey => {
        days[dayKey] = createDefaultLandingDay();
      });
      return { days };
    }

    function createDefaultImportMeta(sourceUrl) {
      return {
        sourceUrl: sourceUrl ? String(sourceUrl) : '',
        lastAttemptTs: '',
        lastSuccessTs: '',
        status: landingImportStatusIdle,
        messages: [],
      };
    }

    function createDefaultEventItem() {
      return {
        id: uid(),
        target: landingTargetBoth,
        title: '',
        eventDate: '',
        startTime: '',
        endTime: '',
        timingNote: '',
        body: '',
        archived: false,
        archivedAt: '',
        updatedAt: '',
      };
    }

    function createDefaultNewsItem() {
      return {
        id: uid(),
        target: landingTargetBoth,
        title: '',
        body: '',
        href: '',
        source: '',
        publishedDate: '',
        imageUrl: '',
        archived: false,
        archivedAt: '',
        updatedAt: '',
        importMeta: createDefaultImportMeta(),
      };
    }

    function createDefaultReviewItem() {
      return {
        id: uid(),
        href: '',
        author: '',
        quote: '',
        source: 'Google Review',
        rating: '',
        archived: false,
        archivedAt: '',
        updatedAt: '',
        importMeta: createDefaultImportMeta(),
      };
    }

    function createDefaultContent() {
      const hoursRestaurants = {};
      const reviewRestaurants = {};
      knownLandingRestaurants().forEach(restaurant => {
        hoursRestaurants[restaurant.id] = createDefaultLandingHoursRestaurant();
        reviewRestaurants[restaurant.id] = [];
      });
      return {
        overview: {},
        hours: { restaurants: hoursRestaurants },
        events: { items: [] },
        news: { items: [] },
        reviews: { restaurants: reviewRestaurants },
      };
    }

    function createDefaultRecord() {
      const content = createDefaultContent();
      return {
        id: landingPageStateId,
        draftContent: cloneJsonCompatible(content, content),
        liveContent: cloneJsonCompatible(content, content),
        draftSavedTs: '',
        livePublishedTs: '',
      };
    }

    function normalizeTimestamp(value) {
      if (value === null || value === undefined || value === '') return '';
      const numberValue = Number(value);
      return Number.isFinite(numberValue) && numberValue > 0 ? String(numberValue) : '';
    }

    function normalizeTimeValue(value) {
      if (typeof value !== 'string') return '';
      const trimmed = value.trim();
      const match = trimmed.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
      if (!match) return '';
      return `${match[1]}:${match[2]}`;
    }

    function parseTimeToMinutes(value) {
      const normalized = normalizeTimeValue(value);
      if (!normalized) return null;
      const parts = normalized.split(':').map(Number);
      if (parts.length !== 2 || parts.some(part => !Number.isInteger(part))) return null;
      const hours = parts[0];
      const minutes = parts[1];
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
      return (hours * 60) + minutes;
    }

    function normalizeDay(rawDay) {
      const closed = !!(rawDay && rawDay.closed);
      const open = normalizeTimeValue(rawDay && rawDay.open);
      const close = normalizeTimeValue(rawDay && rawDay.close);
      return {
        closed,
        open: closed ? '' : open,
        close: closed ? '' : close,
      };
    }

    function normalizeHoursRestaurant(rawRestaurant) {
      const days = {};
      landingDayOrder.forEach(dayKey => {
        days[dayKey] = normalizeDay(rawRestaurant && rawRestaurant.days && rawRestaurant.days[dayKey]);
      });
      return { days };
    }

    function normalizeTarget(value, options) {
      const settings = options && typeof options === 'object' ? options : {};
      const allowBoth = settings.allowBoth !== false;
      const fallback = Object.prototype.hasOwnProperty.call(settings, 'fallback')
        ? settings.fallback
        : (allowBoth ? landingTargetBoth : (knownLandingRestaurants()[0] ? knownLandingRestaurants()[0].id : ''));
      const candidate = value ? String(value) : '';
      if (allowBoth && candidate === landingTargetBoth) return landingTargetBoth;
      if (candidate && knownLandingRestaurants().some(restaurant => restaurant.id === candidate)) return candidate;
      return fallback;
    }

    function normalizeImportMeta(rawMeta) {
      const meta = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
      const status = [
        landingImportStatusIdle,
        landingImportStatusImported,
        landingImportStatusPartial,
        landingImportStatusFailed,
      ].includes(meta.status)
        ? meta.status
        : landingImportStatusIdle;
      const rawMessages = Array.isArray(meta.messages)
        ? meta.messages
        : (meta.message ? [meta.message] : []);
      return {
        sourceUrl: meta.sourceUrl ? String(meta.sourceUrl) : '',
        lastAttemptTs: normalizeTimestamp(meta.lastAttemptTs),
        lastSuccessTs: normalizeTimestamp(meta.lastSuccessTs),
        status,
        messages: rawMessages.map(message => String(message || '')).filter(Boolean),
      };
    }

    function normalizeEventItem(rawItem) {
      const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
      return {
        id: item.id ? String(item.id) : uid(),
        target: normalizeTarget(item.target, { allowBoth: true }),
        title: item.title ? String(item.title) : '',
        eventDate: item.eventDate ? String(item.eventDate) : '',
        startTime: normalizeTimeValue(item.startTime),
        endTime: normalizeTimeValue(item.endTime),
        timingNote: item.timingNote ? String(item.timingNote) : '',
        body: item.body ? String(item.body) : '',
        archived: !!item.archived,
        archivedAt: normalizeTimestamp(item.archivedAt),
        updatedAt: normalizeTimestamp(item.updatedAt),
      };
    }

    function normalizeNewsItem(rawItem) {
      const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
      return {
        id: item.id ? String(item.id) : uid(),
        target: normalizeTarget(item.target, { allowBoth: true }),
        title: item.title ? String(item.title) : '',
        body: item.body ? String(item.body) : '',
        href: item.href ? String(item.href) : '',
        source: item.source ? String(item.source) : '',
        publishedDate: item.publishedDate ? String(item.publishedDate) : (item.publishedAt ? String(item.publishedAt) : ''),
        imageUrl: item.imageUrl ? String(item.imageUrl) : '',
        archived: !!item.archived,
        archivedAt: normalizeTimestamp(item.archivedAt),
        updatedAt: normalizeTimestamp(item.updatedAt),
        importMeta: normalizeImportMeta(item.importMeta || {}),
      };
    }

    function normalizeReviewItem(rawItem) {
      const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
      const rating = Number(item.rating);
      const normalizedRating = Number.isFinite(rating) && rating >= 1 && rating <= 5
        ? Math.round(rating)
        : '';
      return {
        id: item.id ? String(item.id) : uid(),
        href: item.href ? String(item.href) : '',
        author: item.author ? String(item.author) : '',
        quote: item.quote ? String(item.quote) : '',
        source: item.source ? String(item.source) : 'Google Review',
        rating: normalizedRating,
        archived: !!item.archived,
        archivedAt: normalizeTimestamp(item.archivedAt),
        updatedAt: normalizeTimestamp(item.updatedAt),
        importMeta: normalizeImportMeta(item.importMeta || {}),
      };
    }

    function normalizeContent(rawContent) {
      const content = rawContent && typeof rawContent === 'object' ? rawContent : {};
      const defaults = createDefaultContent();
      const hoursRestaurants = {};
      const reviewRestaurants = {};
      knownLandingRestaurants().forEach(restaurant => {
        hoursRestaurants[restaurant.id] = normalizeHoursRestaurant(
          (content.hours && content.hours.restaurants && content.hours.restaurants[restaurant.id]) || defaults.hours.restaurants[restaurant.id]
        );
        reviewRestaurants[restaurant.id] = Array.isArray(content.reviews && content.reviews.restaurants && content.reviews.restaurants[restaurant.id])
          ? content.reviews.restaurants[restaurant.id].map(normalizeReviewItem)
          : defaults.reviews.restaurants[restaurant.id];
      });
      return {
        overview: content.overview && typeof content.overview === 'object'
          ? cloneJsonCompatible(content.overview, {})
          : {},
        hours: { restaurants: hoursRestaurants },
        events: {
          items: Array.isArray(content.events && content.events.items) ? content.events.items.map(normalizeEventItem) : [],
        },
        news: {
          items: Array.isArray(content.news && content.news.items) ? content.news.items.map(normalizeNewsItem) : [],
        },
        reviews: {
          restaurants: reviewRestaurants,
        },
      };
    }

    function normalizeRecord(rawRecord) {
      const record = rawRecord && typeof rawRecord === 'object' ? rawRecord : {};
      const defaults = createDefaultRecord();
      return {
        id: record.id ? String(record.id) : defaults.id,
        draftContent: normalizeContent(record.draft_content || record.draftContent || defaults.draftContent),
        liveContent: normalizeContent(record.live_content || record.liveContent || defaults.liveContent),
        draftSavedTs: normalizeTimestamp(record.draft_saved_ts || record.draftSavedTs),
        livePublishedTs: normalizeTimestamp(record.live_published_ts || record.livePublishedTs),
      };
    }

    function isIsoDate(value) {
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
    }

    function isAbsoluteUrl(value) {
      try {
        const url = new URL(String(value || '').trim());
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch (_) {
        return false;
      }
    }

    function getEventDateRank(value) {
      return isIsoDate(value) ? Date.parse(`${value}T00:00:00Z`) : Number.MAX_SAFE_INTEGER;
    }

    function sortEvents(items) {
      return items.slice().sort((a, b) => {
        const rankDelta = getEventDateRank(a.eventDate) - getEventDateRank(b.eventDate);
        if (rankDelta !== 0) return rankDelta;
        const startDelta = (parseTimeToMinutes(a.startTime) ?? Number.MAX_SAFE_INTEGER) - (parseTimeToMinutes(b.startTime) ?? Number.MAX_SAFE_INTEGER);
        if (startDelta !== 0) return startDelta;
        return String(a.title || '').localeCompare(String(b.title || ''));
      });
    }

    function sortNews(items) {
      return items.slice().sort((a, b) => {
        const aRank = isIsoDate(a.publishedDate) ? Date.parse(`${a.publishedDate}T00:00:00Z`) : 0;
        const bRank = isIsoDate(b.publishedDate) ? Date.parse(`${b.publishedDate}T00:00:00Z`) : 0;
        if (aRank !== bRank) return bRank - aRank;
        return (Number(b.updatedAt || 0) || 0) - (Number(a.updatedAt || 0) || 0);
      });
    }

    function sortReviews(items) {
      return items.slice().sort((a, b) => {
        const successDelta = (Number(b.importMeta && b.importMeta.lastSuccessTs || 0) || 0) - (Number(a.importMeta && a.importMeta.lastSuccessTs || 0) || 0);
        if (successDelta !== 0) return successDelta;
        return (Number(b.updatedAt || 0) || 0) - (Number(a.updatedAt || 0) || 0);
      });
    }

    function getActiveItems(items) {
      return Array.isArray(items) ? items.filter(item => !item || !item.archived ? true : false) : [];
    }

    function validateEventItem(item) {
      const issues = [];
      if (!item.target) issues.push('target');
      if (!item.title || !item.title.trim()) issues.push('title');
      if (!isIsoDate(item.eventDate)) issues.push('date');
      if (parseTimeToMinutes(item.startTime) === null) issues.push('start time');
      if (parseTimeToMinutes(item.endTime) === null && !(item.timingNote && item.timingNote.trim())) issues.push('end time or note');
      if (!item.body || !item.body.trim()) issues.push('description');
      return {
        valid: issues.length === 0,
        missingFields: issues,
      };
    }

    function validateNewsItem(item) {
      const issues = [];
      if (!item.target) issues.push('target');
      if (!item.title || !item.title.trim()) issues.push('headline');
      if (!isAbsoluteUrl(item.href)) issues.push('article URL');
      if (!item.source || !item.source.trim()) issues.push('source');
      if (!isIsoDate(item.publishedDate)) issues.push('publish date');
      if (!(item.importMeta && item.importMeta.lastAttemptTs)) issues.push('import record');
      return {
        valid: issues.length === 0,
        missingFields: issues,
      };
    }

    function validateReviewItem(item) {
      const issues = [];
      if (!isAbsoluteUrl(item.href)) issues.push('review URL');
      if (!item.author || !item.author.trim()) issues.push('author');
      if (!item.quote || !item.quote.trim()) issues.push('quote');
      if (!Number.isFinite(Number(item.rating)) || Number(item.rating) < 1 || Number(item.rating) > 5) issues.push('rating');
      if (!(item.importMeta && item.importMeta.lastAttemptTs)) issues.push('import record');
      return {
        valid: issues.length === 0,
        missingFields: issues,
      };
    }

    function validateHoursSection(section) {
      const issues = [];
      knownLandingRestaurants().forEach(restaurant => {
        const restaurantHours = normalizeHoursRestaurant(section && section.restaurants && section.restaurants[restaurant.id]);
        landingDayOrder.forEach(dayKey => {
          const day = restaurantHours.days[dayKey];
          if (day.closed) return;
          const openMinutes = parseTimeToMinutes(day.open);
          const closeMinutes = parseTimeToMinutes(day.close);
          if (openMinutes === null || closeMinutes === null) {
            issues.push(`${restaurant.name}: ${landingDayLabels[dayKey]} needs both an open and close time.`);
            return;
          }
          if (openMinutes === closeMinutes) {
            issues.push(`${restaurant.name}: ${landingDayLabels[dayKey]} cannot open and close at the same time.`);
          }
        });
      });
      return { valid: issues.length === 0, issues: issues };
    }

    function validateEventsSection(section) {
      const issues = [];
      const items = sortEvents(getActiveItems(Array.isArray(section && section.items) ? section.items.map(normalizeEventItem) : []));
      items.forEach(item => {
        const validation = validateEventItem(item);
        if (validation.valid) return;
        issues.push(`${item.title && item.title.trim() || 'Untitled event'}: missing ${validation.missingFields.join(', ')}.`);
      });
      return { valid: issues.length === 0, issues: issues };
    }

    function validateNewsSection(section) {
      const issues = [];
      const items = sortNews(getActiveItems(Array.isArray(section && section.items) ? section.items.map(normalizeNewsItem) : []));
      items.forEach(item => {
        const validation = validateNewsItem(item);
        if (validation.valid) return;
        issues.push(`${item.title && item.title.trim() || item.href && item.href.trim() || 'Imported story'}: missing ${validation.missingFields.join(', ')}.`);
      });
      return { valid: issues.length === 0, issues: issues };
    }

    function validateReviewsSection(section) {
      const issues = [];
      knownLandingRestaurants().forEach(restaurant => {
        const items = sortReviews(
          getActiveItems(Array.isArray(section && section.restaurants && section.restaurants[restaurant.id]) ? section.restaurants[restaurant.id].map(normalizeReviewItem) : [])
        );
        items.forEach(item => {
          const validation = validateReviewItem(item);
          if (validation.valid) return;
          issues.push(`${restaurant.name}: ${item.author && item.author.trim() || item.href && item.href.trim() || 'Imported review'} is missing ${validation.missingFields.join(', ')}.`);
        });
      });
      return { valid: issues.length === 0, issues: issues };
    }

    function getSectionValidation(sectionId, record) {
      const normalized = normalizeRecord(record || createDefaultRecord());
      if (sectionId === 'hours') return validateHoursSection(normalized.draftContent.hours);
      if (sectionId === 'events') return validateEventsSection(normalized.draftContent.events);
      if (sectionId === 'news') return validateNewsSection(normalized.draftContent.news);
      if (sectionId === 'reviews') return validateReviewsSection(normalized.draftContent.reviews);
      return { valid: true, issues: [] };
    }

    function landingSectionHasDiff(sectionId, record) {
      const normalized = normalizeRecord(record || createDefaultRecord());
      return JSON.stringify(normalized.draftContent[sectionId] || {}) !== JSON.stringify(normalized.liveContent[sectionId] || {});
    }

    function getDraftDiffSectionIds(record) {
      return landingSectionOrder.filter(sectionId => landingSectionHasDiff(sectionId, record));
    }

    function applySectionPublish(record, sectionIds) {
      const nextRecord = normalizeRecord(record || createDefaultRecord());
      const draftContent = cloneJsonCompatible(nextRecord.draftContent, createDefaultContent());
      const liveContent = cloneJsonCompatible(nextRecord.liveContent, createDefaultContent());
      const appliedSectionIds = Array.isArray(sectionIds)
        ? sectionIds.filter(sectionId => landingSectionOrder.includes(sectionId))
        : [];
      appliedSectionIds.forEach(sectionId => {
        liveContent[sectionId] = cloneJsonCompatible(draftContent[sectionId], {});
      });
      nextRecord.liveContent = normalizeContent(liveContent);
      return nextRecord;
    }

    function formatMinutes(minutes) {
      if (!Number.isFinite(minutes)) return '';
      const normalized = ((Math.floor(minutes) % 1440) + 1440) % 1440;
      const hours24 = Math.floor(normalized / 60);
      const mins = normalized % 60;
      const suffix = hours24 >= 12 ? 'PM' : 'AM';
      const hours12 = hours24 % 12 || 12;
      return mins === 0 ? `${hours12} ${suffix}` : `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
    }

    function formatHoursRange(day) {
      if (day && day.closed) return 'Closed';
      const openMinutes = parseTimeToMinutes(day && day.open);
      const closeMinutes = parseTimeToMinutes(day && day.close);
      if (openMinutes === null || closeMinutes === null) return 'Hours unavailable';
      return `${formatMinutes(openMinutes)} - ${formatMinutes(closeMinutes)}`;
    }

    function getDayOffsetKey(dayKey, offset) {
      const index = landingDayOrder.indexOf(dayKey);
      if (index < 0) return landingDayOrder[0];
      return landingDayOrder[(index + offset + landingDayOrder.length) % landingDayOrder.length];
    }

    function getRestaurantLocalParts(now, timeZone) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || restaurantTimeZone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(new Date(now || Date.now()));
      const lookup = Object.create(null);
      parts.forEach(part => {
        lookup[part.type] = part.value;
      });
      const weekday = String(lookup.weekday || '').slice(0, 3).toLowerCase();
      const dayKeyMap = { mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun' };
      const hour = Number(lookup.hour || 0);
      const minute = Number(lookup.minute || 0);
      return {
        dayKey: dayKeyMap[weekday] || 'mon',
        minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
      };
    }

    function getHoursForRestaurant(section, restaurantId) {
      return normalizeHoursRestaurant(section && section.restaurants && section.restaurants[restaurantId]);
    }

    function buildWeekRows(section, restaurantId, todayKey) {
      const restaurantHours = getHoursForRestaurant(section, restaurantId);
      return landingDayOrder.map(dayKey => ({
        dayKey: dayKey,
        label: landingDayLabels[dayKey] || dayKey,
        isToday: dayKey === todayKey,
        rangeLabel: formatHoursRange(restaurantHours.days[dayKey]),
      }));
    }

    function computeRestaurantStatus(section, restaurantId, now, timeZone) {
      const restaurantHours = getHoursForRestaurant(section, restaurantId);
      const local = getRestaurantLocalParts(now, timeZone || restaurantTimeZone);
      const previousDayKey = getDayOffsetKey(local.dayKey, -1);
      const today = restaurantHours.days[local.dayKey];
      const previous = restaurantHours.days[previousDayKey];
      const todayOpen = parseTimeToMinutes(today.open);
      const todayClose = parseTimeToMinutes(today.close);
      const previousOpen = parseTimeToMinutes(previous.open);
      const previousClose = parseTimeToMinutes(previous.close);
      const previousOvernight = !previous.closed && previousOpen !== null && previousClose !== null && previousClose <= previousOpen;
      const todayOvernight = !today.closed && todayOpen !== null && todayClose !== null && todayClose <= todayOpen;

      if (previousOvernight && local.minutes < previousClose) {
        return {
          isOpen: true,
          currentDayKey: local.dayKey,
          label: `Open until ${formatMinutes(previousClose)}`,
          todayRangeLabel: formatHoursRange(today),
          weekRows: buildWeekRows(section, restaurantId, local.dayKey),
        };
      }

      if (!today.closed && todayOpen !== null && todayClose !== null) {
        const isOpen = todayOvernight
          ? local.minutes >= todayOpen
          : (local.minutes >= todayOpen && local.minutes < todayClose);
        if (isOpen) {
          return {
            isOpen: true,
            currentDayKey: local.dayKey,
            label: `Open until ${formatMinutes(todayClose)}`,
            todayRangeLabel: formatHoursRange(today),
            weekRows: buildWeekRows(section, restaurantId, local.dayKey),
          };
        }
      }

      if (!today.closed && todayOpen !== null && local.minutes < todayOpen) {
        return {
          isOpen: false,
          currentDayKey: local.dayKey,
          label: `Closed until ${formatMinutes(todayOpen)}`,
          todayRangeLabel: formatHoursRange(today),
          weekRows: buildWeekRows(section, restaurantId, local.dayKey),
        };
      }

      for (let offset = 1; offset <= landingDayOrder.length; offset += 1) {
        const nextDayKey = getDayOffsetKey(local.dayKey, offset);
        const nextDay = restaurantHours.days[nextDayKey];
        if (nextDay.closed) continue;
        const nextOpen = parseTimeToMinutes(nextDay.open);
        if (nextOpen === null) continue;
        const prefix = offset === 1 ? 'tomorrow' : (landingDayLabels[nextDayKey] || nextDayKey);
        return {
          isOpen: false,
          currentDayKey: local.dayKey,
          label: `Closed until ${prefix} ${formatMinutes(nextOpen)}`,
          todayRangeLabel: formatHoursRange(today),
          weekRows: buildWeekRows(section, restaurantId, local.dayKey),
        };
      }

      return {
        isOpen: false,
        currentDayKey: local.dayKey,
        label: 'Closed for now',
        todayRangeLabel: formatHoursRange(today),
        weekRows: buildWeekRows(section, restaurantId, local.dayKey),
      };
    }

    function getRenderableEvents(section) {
      return sortEvents(
        getActiveItems(Array.isArray(section && section.items) ? section.items.map(normalizeEventItem) : [])
      ).filter(item => validateEventItem(item).valid);
    }

    function getRenderableNews(section) {
      return sortNews(
        getActiveItems(Array.isArray(section && section.items) ? section.items.map(normalizeNewsItem) : [])
      ).filter(item => validateNewsItem(item).valid);
    }

    function getRenderableReviews(section, restaurantId) {
      return sortReviews(
        getActiveItems(Array.isArray(section && section.restaurants && section.restaurants[restaurantId]) ? section.restaurants[restaurantId].map(normalizeReviewItem) : [])
      ).filter(item => validateReviewItem(item).valid);
    }

    function buildReviewPairs(section) {
      const leroysId = restaurants.LEROYS && restaurants.LEROYS.id;
      const elroysId = restaurants.ELROYS && restaurants.ELROYS.id;
      const leroysReviews = getRenderableReviews(section, leroysId);
      const elroysReviews = getRenderableReviews(section, elroysId);
      if (leroysReviews.length < 3 || elroysReviews.length < 3) return [];
      const pairCount = Math.min(leroysReviews.length, elroysReviews.length);
      return Array.from({ length: pairCount }, (_, index) => ({
        id: `pair-${index}`,
        leroys: leroysReviews[index],
        elroys: elroysReviews[index],
      }));
    }

    function getTimeSelectOptions() {
      const options = [];
      for (let minutes = 0; minutes < 1440; minutes += 15) {
        const hours24 = Math.floor(minutes / 60);
        const mins = minutes % 60;
        options.push({
          value: `${String(hours24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
          label: formatMinutes(minutes),
        });
      }
      return options;
    }

    const landingTimeSelectOptions = getTimeSelectOptions();

    function renderTimeSelectOptions(selectedValue, placeholder) {
      const normalized = normalizeTimeValue(selectedValue);
      const optionMarkup = [`<option value="">${escHtml(placeholder || 'Select time')}</option>`];
      const hasSelectedValue = normalized && landingTimeSelectOptions.some(option => option.value === normalized);
      if (normalized && !hasSelectedValue) {
        const fallbackMinutes = parseTimeToMinutes(normalized);
        optionMarkup.push(
          `<option value="${escHtml(normalized)}" selected>${escHtml(fallbackMinutes === null ? normalized : formatMinutes(fallbackMinutes))}</option>`
        );
      }
      landingTimeSelectOptions.forEach(option => {
        optionMarkup.push(
          `<option value="${escHtml(option.value)}" ${option.value === normalized ? 'selected' : ''}>${escHtml(option.label)}</option>`
        );
      });
      return optionMarkup.join('');
    }

    function renderHoursRowsHtml(section, restaurantId, restaurantLabel) {
      const restaurantHours = getHoursForRestaurant(section, restaurantId);
      return `
    <article class="landing-admin-hours-card">
      <div class="landing-admin-hours-card-header">
        <div>
          <p class="settings-section-kicker">${escHtml(restaurantLabel || '')}</p>
          <h5>${escHtml(restaurantLabel || '')}</h5>
        </div>
        <span class="landing-hours-summary">Published hero line follows this recurring schedule.</span>
      </div>
      <div class="landing-hours-day-grid">
        ${landingDayOrder.map(dayKey => {
          const day = restaurantHours.days[dayKey];
          const safeRestaurantId = escAttrJs(restaurantId || '');
          const safeDayKey = escAttrJs(dayKey);
          return `
            <div class="landing-hours-day-row">
              <div class="landing-hours-day-header">
                <label for="landing-hours-${escHtml(restaurantId || '')}-${escHtml(dayKey)}-open">${escHtml(landingDayLabels[dayKey])}</label>
              </div>
              <div class="landing-hours-day-controls">
                <select
                  id="landing-hours-${escHtml(restaurantId || '')}-${escHtml(dayKey)}-open"
                  data-landing-hours-field="open"
                  data-landing-hours-restaurant="${escHtml(restaurantId || '')}"
                  data-landing-hours-day="${escHtml(dayKey)}"
                  aria-label="${escHtml(`${restaurantLabel || ''} ${landingDayLabels[dayKey]} open time`)}"
                  ${day.closed ? 'disabled' : ''}
                  onchange="setLandingHoursField(${safeRestaurantId}, ${safeDayKey}, 'open', this.value)"
                >
                  ${renderTimeSelectOptions(day.open, 'Open time')}
                </select>
                <select
                  id="landing-hours-${escHtml(restaurantId || '')}-${escHtml(dayKey)}-close"
                  data-landing-hours-field="close"
                  data-landing-hours-restaurant="${escHtml(restaurantId || '')}"
                  data-landing-hours-day="${escHtml(dayKey)}"
                  aria-label="${escHtml(`${restaurantLabel || ''} ${landingDayLabels[dayKey]} close time`)}"
                  ${day.closed ? 'disabled' : ''}
                  onchange="setLandingHoursField(${safeRestaurantId}, ${safeDayKey}, 'close', this.value)"
                >
                  ${renderTimeSelectOptions(day.close, 'Close time')}
                </select>
              </div>
              <div class="landing-hours-day-footer">
                <label class="landing-hours-toggle" for="landing-hours-${escHtml(restaurantId || '')}-${escHtml(dayKey)}-closed">
                  <input
                    id="landing-hours-${escHtml(restaurantId || '')}-${escHtml(dayKey)}-closed"
                    type="checkbox"
                    data-landing-hours-field="closed"
                    data-landing-hours-restaurant="${escHtml(restaurantId || '')}"
                    data-landing-hours-day="${escHtml(dayKey)}"
                    ${day.closed ? 'checked' : ''}
                    onchange="setLandingHoursField(${safeRestaurantId}, ${safeDayKey}, 'closed', this.checked)"
                  >
                  Closed
                </label>
              </div>
            </div>`;
        }).join('')}
      </div>
    </article>`;
    }

    function renderTargetOptionsHtml(selectedTarget, options) {
      const settings = options && typeof options === 'object' ? options : {};
      const includeBoth = settings.includeBoth !== false;
      const values = [];
      if (includeBoth) values.push({ value: landingTargetBoth, label: 'Both' });
      knownLandingRestaurants().forEach(restaurant => {
        values.push({ value: restaurant.id, label: restaurant.name });
      });
      return values.map(option => (
        `<option value="${escHtml(option.value)}" ${option.value === selectedTarget ? 'selected' : ''}>${escHtml(option.label)}</option>`
      )).join('');
    }

    function renderRatingOptionsHtml(selectedValue) {
      const rating = Number(selectedValue);
      const normalized = Number.isFinite(rating) ? String(rating) : '';
      const options = ['<option value="">Rating</option>'];
      for (let value = 5; value >= 1; value -= 1) {
        options.push(`<option value="${value}" ${normalized === String(value) ? 'selected' : ''}>${value} Stars</option>`);
      }
      return options.join('');
    }

    function formatLandingTimestampLabel(value) {
      const timestamp = Number(value || 0);
      if (!timestamp) return 'Not yet';
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(timestamp));
    }

    function getConstants() {
      return {
        APP_VERSION: appVersion,
        RESTAURANTS: restaurants,
        RESTAURANT_TIME_ZONE: restaurantTimeZone,
        LANDING_PAGE_STATE_ID: landingPageStateId,
        LANDING_PAGE_SECTION_ORDER: landingSectionOrder.slice(),
        LANDING_DAY_ORDER: landingDayOrder.slice(),
        LANDING_DAY_LABELS: cloneJsonCompatible(landingDayLabels, landingDayLabels),
        LANDING_TARGET_BOTH: landingTargetBoth,
        LANDING_IMPORT_STATUS_IDLE: landingImportStatusIdle,
        LANDING_IMPORT_STATUS_IMPORTED: landingImportStatusImported,
        LANDING_IMPORT_STATUS_PARTIAL: landingImportStatusPartial,
        LANDING_IMPORT_STATUS_FAILED: landingImportStatusFailed,
      };
    }

    return {
      createDefaultDay: createDefaultLandingDay,
      createDefaultHoursRestaurant: createDefaultLandingHoursRestaurant,
      createDefaultContent: createDefaultContent,
      createDefaultRecord: createDefaultRecord,
      createDefaultEventItem: createDefaultEventItem,
      createDefaultNewsItem: createDefaultNewsItem,
      createDefaultReviewItem: createDefaultReviewItem,
      normalizeDay: normalizeDay,
      normalizeHoursRestaurant: normalizeHoursRestaurant,
      normalizeContent: normalizeContent,
      normalizeRecord: normalizeRecord,
      normalizeTarget: normalizeTarget,
      normalizeImportMeta: normalizeImportMeta,
      normalizeTimeValue: normalizeTimeValue,
      validateHoursSection: validateHoursSection,
      validateEventsSection: validateEventsSection,
      validateNewsSection: validateNewsSection,
      validateReviewsSection: validateReviewsSection,
      getSectionValidation: getSectionValidation,
      getDraftDiffSectionIds: getDraftDiffSectionIds,
      landingSectionHasDiff: landingSectionHasDiff,
      applySectionPublish: applySectionPublish,
      computeRestaurantStatus: computeRestaurantStatus,
      getRenderableEvents: getRenderableEvents,
      getRenderableNews: getRenderableNews,
      getRenderableReviews: getRenderableReviews,
      buildReviewPairs: buildReviewPairs,
      renderHoursRowsHtml: renderHoursRowsHtml,
      renderTargetOptionsHtml: renderTargetOptionsHtml,
      renderRatingOptionsHtml: renderRatingOptionsHtml,
      formatLandingTimestampLabel: formatLandingTimestampLabel,
      getConstants: getConstants,
    };
  }

  modules.createLandingModel = createLandingModel;
  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
