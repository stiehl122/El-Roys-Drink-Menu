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
    const hasRootShell = typeof options.hasRootShell === 'function' ? options.hasRootShell : (() => false);
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
      setFallbackVisible(false);
      return normalized;
    }

    return {
      setSectionVisible: setSectionVisible,
      renderRootHours: renderRootHours,
      setFallbackVisible: setFallbackVisible,
      renderRootPage: renderRootPage,
    };
  };

  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
