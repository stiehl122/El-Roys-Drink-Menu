(function bootstrapLandingRootRendererModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};

  modules.createLandingRootRendererService = function createLandingRootRendererService(options = {}) {
    const model = options.model && typeof options.model === 'object' ? options.model : null;
    const store = options.store && typeof options.store === 'object' ? options.store : null;
    const document = options.document || globalScope.document || null;
    const escHtml = typeof options.escHtml === 'function' ? options.escHtml : (value => String(value || ''));
    const restaurants = options.restaurants && typeof options.restaurants === 'object' ? options.restaurants : {};
    const setReviewCarouselHandlerName = typeof options.setReviewCarouselHandlerName === 'string'
      ? options.setReviewCarouselHandlerName.trim()
      : '';
    const hasRootShell = typeof options.hasRootShell === 'function' ? options.hasRootShell : (() => false);
    const syncLegacyStateFromStore = typeof options.syncLegacyStateFromStore === 'function'
      ? options.syncLegacyStateFromStore
      : (() => (store && typeof store.getReviewCarouselIndex === 'function' ? store.getReviewCarouselIndex() : 0));

    if (!model || !store || !document) {
      return {};
    }

    function getRecord(record) {
      return typeof model.normalizeRecord === 'function'
        ? model.normalizeRecord(record || (store.getRecord ? store.getRecord() : null) || (model.createDefaultRecord ? model.createDefaultRecord() : {}))
        : (record || {});
    }

    function setSectionVisible(sectionId = '', visible = true) {
      const sectionEl = document.getElementById(sectionId);
      if (sectionEl) sectionEl.hidden = !visible;
      const dotEl = document.querySelector ? document.querySelector(`[data-landing-dot="${sectionId}"]`) : null;
      if (dotEl) dotEl.hidden = !visible;
    }

    function formatEventScheduleLine(item = {}) {
      const parts = [];
      if (item.eventDate && typeof model.formatDateLabel === 'function') parts.push(model.formatDateLabel(item.eventDate));
      const startMinutes = typeof model.parseTimeToMinutes === 'function' ? model.parseTimeToMinutes(item.startTime) : null;
      if (startMinutes !== null && startMinutes !== undefined) {
        let timeLabel = typeof model.formatMinutes === 'function' ? model.formatMinutes(startMinutes) : String(item.startTime || '');
        const endMinutes = typeof model.parseTimeToMinutes === 'function' ? model.parseTimeToMinutes(item.endTime) : null;
        if (endMinutes !== null && endMinutes !== undefined) {
          timeLabel += ` - ${typeof model.formatMinutes === 'function' ? model.formatMinutes(endMinutes) : String(item.endTime || '')}`;
        } else if (item.timingNote && String(item.timingNote).trim()) {
          timeLabel += ` · ${String(item.timingNote).trim()}`;
        }
        parts.push(timeLabel);
      } else if (item.timingNote && String(item.timingNote).trim()) {
        parts.push(String(item.timingNote).trim());
      }
      return parts.filter(Boolean).join(' · ');
    }

    function renderRootEvents(section = {}) {
      const listEl = document.getElementById('landing-events-list');
      const emptyEl = document.getElementById('landing-events-empty');
      if (!listEl || !emptyEl) return;
      const items = typeof model.getRenderableEvents === 'function' ? model.getRenderableEvents(section) : [];
      setSectionVisible('events', true);
      if (!items.length) {
        listEl.innerHTML = '';
        emptyEl.hidden = false;
        return;
      }
      emptyEl.hidden = true;
      listEl.innerHTML = items.map(item => `
    <article class="landing-story-card landing-story-card--event">
      <p class="landing-card-kicker"><span class="landing-tag ${typeof model.getTargetAccentClass === 'function' ? model.getTargetAccentClass(item.target) : ''}">${escHtml(typeof model.getTargetLabel === 'function' ? model.getTargetLabel(item.target) : '')}</span></p>
      <h3>${escHtml(item.title || 'Upcoming event')}</h3>
      <p>${escHtml(item.body || '')}</p>
      <p class="landing-card-kicker">${escHtml(formatEventScheduleLine(item))}</p>
    </article>
  `).join('');
    }

    function renderRootNews(section = {}) {
      const listEl = document.getElementById('landing-news-list');
      const emptyEl = document.getElementById('landing-news-empty');
      if (!listEl || !emptyEl) return;
      const items = typeof model.getRenderableNews === 'function' ? model.getRenderableNews(section) : [];
      setSectionVisible('news', items.length > 0);
      if (!items.length) {
        listEl.innerHTML = '';
        emptyEl.hidden = true;
        return;
      }
      emptyEl.hidden = true;
      listEl.innerHTML = items.map(item => `
    <a class="landing-story-card landing-story-card--news ${item.imageUrl ? 'has-image' : 'is-text-only'}" href="${escHtml(item.href)}" target="_blank" rel="noreferrer">
      ${item.imageUrl ? `<img class="landing-story-image" src="${escHtml(item.imageUrl)}" alt="${escHtml(item.title || item.source || 'News image')}">` : ''}
      <div class="landing-story-copy">
        <p class="landing-card-kicker">
          <span class="landing-tag ${typeof model.getTargetAccentClass === 'function' ? model.getTargetAccentClass(item.target) : ''}">${escHtml(typeof model.getTargetLabel === 'function' ? model.getTargetLabel(item.target) : '')}</span>
          <span>${escHtml([
            item.source,
            (item.publishedDate && typeof model.formatDateLabel === 'function')
              ? model.formatDateLabel(item.publishedDate, { short: true, year: false })
              : '',
          ].filter(Boolean).join(' · '))}</span>
        </p>
        <h3>${escHtml(item.title || 'Imported story')}</h3>
        ${item.body ? `<p>${escHtml(item.body)}</p>` : ''}
        <span class="landing-story-link">Read Story ↗</span>
      </div>
    </a>
  `).join('');
    }

    function renderRootReviews(section = {}) {
      const listEl = document.getElementById('landing-reviews-list');
      const emptyEl = document.getElementById('landing-reviews-empty');
      const controlsEl = document.getElementById('landing-reviews-controls');
      const dotsEl = document.getElementById('landing-reviews-dots');
      if (!listEl || !emptyEl || !controlsEl || !dotsEl) return;
      const pairs = typeof model.buildReviewPairs === 'function' ? model.buildReviewPairs(section) : [];
      const visible = pairs.length > 0;
      setSectionVisible('reviews', visible);
      if (!visible) {
        listEl.innerHTML = '';
        emptyEl.hidden = true;
        controlsEl.hidden = true;
        dotsEl.innerHTML = '';
        if (typeof store.setReviewCarouselIndex === 'function') store.setReviewCarouselIndex(0);
        syncLegacyStateFromStore();
        return;
      }
      emptyEl.hidden = true;
      controlsEl.hidden = pairs.length <= 1;
      const currentIndex = Math.max(0, Math.min(
        typeof store.getReviewCarouselIndex === 'function' ? store.getReviewCarouselIndex() : 0,
        pairs.length - 1
      ));
      if (typeof store.setReviewCarouselIndex === 'function') store.setReviewCarouselIndex(currentIndex);
      syncLegacyStateFromStore();
      listEl.innerHTML = pairs.map((pair, index) => `
    <article class="landing-review-pair ${index === currentIndex ? 'is-active' : ''}" data-landing-review-pair="${index}">
      <article class="landing-review-card landing-review-card--leroys">
        <p class="landing-card-kicker">${escHtml(restaurants.LEROYS?.name || '')}</p>
        <h3>${'★'.repeat(Math.max(1, Math.min(5, Number(pair.leroys.rating) || 5)))}</h3>
        <p>${escHtml(pair.leroys.quote || '')}</p>
        <p class="landing-card-kicker">${escHtml(pair.leroys.author || '')}${pair.leroys.source ? ` · ${escHtml(pair.leroys.source)}` : ''}</p>
      </article>
      <article class="landing-review-card landing-review-card--elroys">
        <p class="landing-card-kicker">${escHtml(restaurants.ELROYS?.name || '')}</p>
        <h3>${'★'.repeat(Math.max(1, Math.min(5, Number(pair.elroys.rating) || 5)))}</h3>
        <p>${escHtml(pair.elroys.quote || '')}</p>
        <p class="landing-card-kicker">${escHtml(pair.elroys.author || '')}${pair.elroys.source ? ` · ${escHtml(pair.elroys.source)}` : ''}</p>
      </article>
    </article>
  `).join('');
      dotsEl.innerHTML = pairs.map((pair, index) => {
        const clickAttr = setReviewCarouselHandlerName
          ? ` onclick="${setReviewCarouselHandlerName}(${index})"`
          : '';
        return `<button type="button" class="landing-review-dot ${index === currentIndex ? 'is-active' : ''}" aria-label="Review pair ${index + 1}"${clickAttr}></button>`;
      }).join('');
    }

    function setReviewCarouselIndex(nextIndex = 0) {
      const pairEls = Array.from(document.querySelectorAll ? document.querySelectorAll('[data-landing-review-pair]') : []);
      if (!pairEls.length) return;
      const bounded = Math.max(0, Math.min(Number(nextIndex) || 0, pairEls.length - 1));
      if (typeof store.setReviewCarouselIndex === 'function') store.setReviewCarouselIndex(bounded);
      syncLegacyStateFromStore();
      pairEls.forEach((pairEl, index) => {
        pairEl.classList.toggle('is-active', index === bounded);
      });
      Array.from(document.querySelectorAll ? document.querySelectorAll('.landing-review-dot') : []).forEach((dotEl, index) => {
        dotEl.classList.toggle('is-active', index === bounded);
      });
    }

    function stepReviewCarousel(direction = 1) {
      const pairCount = Array.from(document.querySelectorAll ? document.querySelectorAll('[data-landing-review-pair]') : []).length;
      if (!pairCount) return;
      const currentIndex = typeof store.getReviewCarouselIndex === 'function' ? store.getReviewCarouselIndex() : 0;
      const nextIndex = (currentIndex + direction + pairCount) % pairCount;
      setReviewCarouselIndex(nextIndex);
    }

    function renderRootHours(section = {}) {
      const restaurantPairs = [
        { restaurant: restaurants.LEROYS, heroId: 'landing-hero-status-leroys', todayId: 'landing-hours-today-leroys', listId: 'landing-hours-list-leroys' },
        { restaurant: restaurants.ELROYS, heroId: 'landing-hero-status-elroys', todayId: 'landing-hours-today-elroys', listId: 'landing-hours-list-elroys' },
      ];
      restaurantPairs.forEach(({ restaurant, heroId, todayId, listId }) => {
        if (!restaurant) return;
        const status = typeof model.computeRestaurantStatus === 'function'
          ? model.computeRestaurantStatus(section, restaurant.id)
          : { isOpen: false, label: '', todayRangeLabel: '', weekRows: [] };
        const heroEl = document.getElementById(heroId);
        const todayEl = document.getElementById(todayId);
        const listEl = document.getElementById(listId);
        if (heroEl) {
          heroEl.textContent = status.label;
          heroEl.classList.toggle('is-open', !!status.isOpen);
          heroEl.classList.toggle('is-closed', !status.isOpen);
        }
        if (todayEl) {
          todayEl.innerHTML = `<span>Today</span><strong>${escHtml(status.todayRangeLabel)}</strong>`;
        }
        if (listEl) {
          listEl.innerHTML = (status.weekRows || []).map(row => (
            `<div class="landing-hours-row">
          <dt>${escHtml(row.label)}${row.isToday ? ' · Today' : ''}</dt>
          <dd>${escHtml(row.rangeLabel)}</dd>
        </div>`
          )).join('');
        }
      });
    }

    function setFallbackVisible(visible) {
      const shellEl = document.getElementById('landing-root-shell');
      const fallbackEl = document.getElementById('landing-root-fallback');
      const dotNavEl = document.querySelector ? document.querySelector('.landing-dot-nav') : null;
      if (shellEl) shellEl.hidden = !!visible;
      if (fallbackEl) fallbackEl.hidden = !visible;
      if (dotNavEl) dotNavEl.hidden = !!visible;
    }

    function renderRootPage(record = store.getRecord()) {
      if (!hasRootShell()) return;
      const normalized = getRecord(record);
      renderRootHours(normalized.liveContent.hours);
      renderRootEvents(normalized.liveContent.events);
      renderRootNews(normalized.liveContent.news);
      renderRootReviews(normalized.liveContent.reviews);
      setFallbackVisible(false);
      return normalized;
    }

    return {
      setSectionVisible: setSectionVisible,
      renderRootEvents: renderRootEvents,
      renderRootNews: renderRootNews,
      renderRootReviews: renderRootReviews,
      renderRootHours: renderRootHours,
      setReviewCarouselIndex: setReviewCarouselIndex,
      stepReviewCarousel: stepReviewCarousel,
      setFallbackVisible: setFallbackVisible,
      renderRootPage: renderRootPage,
    };
  };

  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
