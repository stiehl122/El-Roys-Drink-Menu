(function bootstrapMenuStateLoaderModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_SESSION_MODULES__ && typeof globalScope.__HF_SESSION_MODULES__ === 'object')
    ? globalScope.__HF_SESSION_MODULES__
    : {};

  function createMenuStateLoaderServiceImpl(deps = {}) {
    const readState = typeof deps.readState === 'function' ? deps.readState : (() => globalScope.sbRead?.());
    const hydrateFromState = typeof deps.hydrateFromState === 'function' ? deps.hydrateFromState : (data => globalScope.hydrateState?.(data));
    const applyDraftState = typeof deps.applyPersistedDraftState === 'function'
      ? deps.applyPersistedDraftState
      : (draftState => globalScope.applyPersistedDraftState?.(draftState));
    const setDefaultState = typeof deps.setDefaultState === 'function'
      ? deps.setDefaultState
      : (() => globalScope.resetMenuStateToDefaults?.());
    const setDirty = typeof deps.setDirty === 'function' ? deps.setDirty : (value => { globalScope.setMenuDirtyFlag?.(value); });
    const clearDraftChanges = typeof deps.clearDraftChanges === 'function'
      ? deps.clearDraftChanges
      : (() => {
          globalScope.clearDraftSaveOnlyChanges?.();
          globalScope.clearSharedDraftState?.();
        });
    const writeMenuCache = typeof deps.writeMenuCache === 'function'
      ? deps.writeMenuCache
      : (() => {});
    const refreshFeatured = typeof deps.refreshFeatured === 'function'
      ? deps.refreshFeatured
      : (() => globalScope.refreshFeaturedForActiveMenu?.());
    const buildSnapshot = typeof deps.buildSnapshot === 'function'
      ? deps.buildSnapshot
      : (source => globalScope.buildMenuSessionSnapshot?.(source));
    const getLastUpdatedTs = typeof deps.getLastUpdatedTs === 'function'
      ? deps.getLastUpdatedTs
      : (() => globalScope.getLastUpdatedTs?.());
    const getCategorySnapshot = typeof deps.getCategorySnapshot === 'function'
      ? deps.getCategorySnapshot
      : (() => globalScope.getCategoryStateSnapshot?.());
    const getDesignSnapshotValue = typeof deps.getDesignSnapshot === 'function'
      ? deps.getDesignSnapshot
      : (() => globalScope.getDesignSnapshot?.());
    const getFeaturedSnapshotValue = typeof deps.getFeaturedSnapshot === 'function'
      ? deps.getFeaturedSnapshot
      : (() => globalScope.getFeaturedSnapshot?.());

    return {
      async load(options = {}) {
        const {
          fallbackToDefault = true,
          includeFeatured = true,
          persistCache = true,
          request = globalScope.buildCurrentMenuPageRequest?.(),
        } = options;
        const includePersistedDraft = options.includePersistedDraft ?? (request.pageMode === 'manager' || request.pageMode === 'admin');
        try {
          const data = await readState({ request, source: options.source || 'network', options });
          if (data) {
            hydrateFromState(data);
            const loadedDraft = includePersistedDraft ? applyDraftState(data.meta?.draft_state || null) : false;
            setDirty(false);
            if (!loadedDraft) clearDraftChanges();
            if (persistCache) writeMenuCache(data);
          } else if (fallbackToDefault) {
            setDefaultState();
            setDirty(false);
            clearDraftChanges();
          }
        } catch (error) {
          if (fallbackToDefault) {
            setDefaultState();
            setDirty(false);
            clearDraftChanges();
          } else {
            throw error;
          }
        }
        if (includeFeatured) await refreshFeatured();
        return buildSnapshot(options.source || 'network');
      },

      async poll(options = {}) {
        void options;
        const oldTs = getLastUpdatedTs();
        const oldCats = getCategorySnapshot();
        const oldDesign = getDesignSnapshotValue();
        const oldFeatured = getFeaturedSnapshotValue();
        const request = options.request || globalScope.buildCurrentMenuPageRequest?.();
        const data = await readState({ request, source: 'poll', options });
        if (!data) {
          return {
            changed: false,
            designChanged: false,
            snapshot: buildSnapshot('poll'),
          };
        }

        hydrateFromState(data);
        writeMenuCache(data);
        const newTs = getLastUpdatedTs();
        if (newTs !== oldTs) await refreshFeatured();

        const afterCats = getCategorySnapshot();
        const newDesign = getDesignSnapshotValue();
        const afterFeatured = getFeaturedSnapshotValue();

        return {
          changed: JSON.stringify(oldCats) !== JSON.stringify(afterCats) || oldTs !== newTs || JSON.stringify(oldFeatured) !== JSON.stringify(afterFeatured),
          designChanged: JSON.stringify(oldDesign) !== JSON.stringify(newDesign),
          snapshot: buildSnapshot('poll'),
        };
      },
    };
  }

  modules.createMenuStateLoaderService = function createMenuStateLoaderServiceBoundary(deps = {}, options = {}) {
    if (options && typeof options.impl === 'function') {
      return options.impl(deps);
    }
    return createMenuStateLoaderServiceImpl(deps);
  };

  globalScope.__HF_SESSION_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
