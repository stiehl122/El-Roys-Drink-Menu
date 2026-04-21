(function bootstrapLandingDataServiceModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_LANDING_MODULES__ && typeof globalScope.__HF_LANDING_MODULES__ === 'object')
    ? globalScope.__HF_LANDING_MODULES__
    : {};

  modules.createLandingDataService = function createLandingDataService(options = {}) {
    const model = (options.model && typeof options.model === 'object')
      ? options.model
      : (modules.createLandingModel ? modules.createLandingModel() : null);
    const store = options.store && typeof options.store === 'object'
      ? options.store
      : (modules.createLandingStore ? modules.createLandingStore({ model }) : null);
    const fetchRecord = typeof options.fetchRecord === 'function' ? options.fetchRecord : null;
    const upsertRecord = typeof options.upsertRecord === 'function' ? options.upsertRecord : null;

    if (!model || typeof model.normalizeRecord !== 'function' || typeof model.applySectionPublish !== 'function') {
      throw new Error('Landing data service requires a landing model.');
    }
    if (!store || typeof store.getRecord !== 'function' || typeof store.setRecord !== 'function') {
      throw new Error('Landing data service requires a landing store.');
    }
    if (!fetchRecord || !upsertRecord) {
      throw new Error('Landing data service requires fetchRecord and upsertRecord ports.');
    }

    return {
      ensureLoaded(options = {}) {
        const force = options.force === true;
        if (!force && store.hasLoaded()) return store.getRecord();
        if (!force && store.getLoadPromise()) return store.getLoadPromise();

        const loadPromise = (async () => {
          try {
            const record = await fetchRecord(options);
            store.setLoadError('');
            store.setRecord(record, { dirty: false, loaded: true });
            store.setDirty(false);
            return store.getRecord();
          } catch (error) {
            store.setLoadError(error && error.message ? error.message : 'Landing page state could not be loaded.');
            throw error;
          } finally {
            store.setLoadPromise(null);
          }
        })();

        store.setLoadPromise(loadPromise);
        return loadPromise;
      },

      async saveDraft(record, timestamp) {
        const normalized = model.normalizeRecord(record || store.getRecord());
        const savedAt = Number(timestamp) || Date.now();
        const persistedRecord = await upsertRecord({
          draft_content: normalized.draftContent,
          live_content: normalized.liveContent,
          draft_saved_ts: savedAt,
          live_published_ts: normalized.livePublishedTs ? Number(normalized.livePublishedTs) : null,
        }, 'save_landing_page_draft');
        store.setRecord(persistedRecord, { dirty: false, loaded: true });
        store.setDirty(false);
        store.setLoadError('');
        return store.getRecord();
      },

      async publishSections(record, selectedSectionIds, timestamp) {
        const normalized = model.normalizeRecord(record || store.getRecord());
        const publishedRecord = model.applySectionPublish(normalized, selectedSectionIds);
        const publishedAt = Number(timestamp) || Date.now();
        const persistedRecord = await upsertRecord({
          draft_content: normalized.draftContent,
          live_content: publishedRecord.liveContent,
          draft_saved_ts: normalized.draftSavedTs ? Number(normalized.draftSavedTs) : null,
          live_published_ts: publishedAt,
        }, 'publish_landing_sections');
        store.setRecord({
          ...persistedRecord,
          liveContent: publishedRecord.liveContent,
          livePublishedTs: String(publishedAt),
        }, { dirty: false, loaded: true });
        store.setDirty(false);
        store.setLoadError('');
        return store.getRecord();
      },
    };
  };

  globalScope.__HF_LANDING_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
