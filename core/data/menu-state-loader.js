(function bootstrapMenuStateLoaderModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_SESSION_MODULES__ && typeof globalScope.__HF_SESSION_MODULES__ === 'object')
    ? globalScope.__HF_SESSION_MODULES__
    : {};
  const publicRevisionTokens = new Map();

  function normalizeRevisionToken(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function getRevisionCacheKey(request = {}) {
    return normalizeRevisionToken(
      request?.requestedMenuId ||
      request?.menuId ||
      request?.requestedMenuSlug ||
      request?.menuSlug ||
      'public-menu',
    );
  }

  function extractPublicRevisionToken(payload = {}) {
    const directToken = normalizeRevisionToken(payload);
    if (!payload || typeof payload !== 'object') return directToken;

    const candidates = [
      payload.revision,
      payload.publicRevision,
      payload.public_revision,
      payload.revisionToken,
      payload.revision_token,
      payload._revision,
      payload.meta?.publicRevision,
      payload.meta?.public_revision,
      payload.meta?.revisionToken,
      payload.meta?.revision_token,
      payload.meta?.revision,
      payload.context?.publicRevision,
      payload.context?.public_revision,
      payload.context?.revisionToken,
      payload.context?.revision_token,
      payload.context?.revision,
    ];

    for (const candidate of candidates) {
      const token = normalizeRevisionToken(candidate);
      if (token) return token;
    }
    return '';
  }

  function getCachedPublicRevisionToken(request = {}) {
    return publicRevisionTokens.get(getRevisionCacheKey(request)) || '';
  }

  function rememberPublicRevisionToken(request = {}, ...sources) {
    const key = getRevisionCacheKey(request);
    for (const source of sources) {
      const token = extractPublicRevisionToken(source);
      if (token) {
        publicRevisionTokens.set(key, token);
        return token;
      }
    }
    return getCachedPublicRevisionToken(request);
  }

  function isRevisionNotModified(revision = {}) {
    return !!(revision && (
      revision.notModified ||
      revision.status === 304 ||
      revision.statusCode === 304
    ));
  }

  function shouldSkipForUnchangedRevision(request = {}, revision = {}) {
    if (isRevisionNotModified(revision)) return true;
    const nextRevision = extractPublicRevisionToken(revision);
    if (!nextRevision) return false;
    return nextRevision === getCachedPublicRevisionToken(request);
  }

  function createMenuStateLoaderServiceImpl(deps = {}) {
    const readState = typeof deps.readState === 'function' ? deps.readState : (() => globalScope.sbRead?.());
    const readRevision = typeof deps.readRevision === 'function'
      ? deps.readRevision
      : (typeof globalScope.sbReadPublicRevision === 'function'
          ? (({ request, cachedRevision } = {}) => globalScope.sbReadPublicRevision(request, { cachedRevision }))
          : null);
    const hydrateFromState = typeof deps.hydrateFromState === 'function' ? deps.hydrateFromState : (data => globalScope.hydrateState?.(data));
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
    const isDirty = typeof deps.isDirty === 'function'
      ? deps.isDirty
      : (() => !!globalScope._dirty);
    const readStoredLocalDraftEnvelope = typeof deps.readStoredLocalDraftEnvelope === 'function'
      ? deps.readStoredLocalDraftEnvelope
      : (() => globalScope.readStoredLocalDraftEnvelope?.());
    const alignLocalDraftEnvelope = typeof deps.alignLocalDraftEnvelope === 'function'
      ? deps.alignLocalDraftEnvelope
      : ((envelope, liveSnapshot) => globalScope.alignLocalDraftEnvelopeWithLiveSnapshot?.(envelope, liveSnapshot));
    const buildCurrentLocalDraftEnvelope = typeof deps.buildCurrentLocalDraftEnvelope === 'function'
      ? deps.buildCurrentLocalDraftEnvelope
      : (() => globalScope.buildCurrentLocalDraftEnvelope?.());
    const applyLocalDraftEnvelope = typeof deps.applyLocalDraftEnvelope === 'function'
      ? deps.applyLocalDraftEnvelope
      : ((envelope, options = {}) => globalScope.applyLocalDraftEnvelope?.(envelope, options));
    const clearCurrentLocalDraft = typeof deps.clearCurrentLocalDraft === 'function'
      ? deps.clearCurrentLocalDraft
      : ((options = {}) => globalScope.clearCurrentLocalDraft?.(options));
    const applyWorkspaceRestaurantTools = typeof deps.applyWorkspaceRestaurantTools === 'function'
      ? deps.applyWorkspaceRestaurantTools
      : (data => globalScope.applyWorkspaceRestaurantTools?.(data) || false);
    const syncServerLiveSnapshot = typeof deps.syncServerLiveSnapshot === 'function'
      ? deps.syncServerLiveSnapshot
      : (() => {
          if (typeof globalScope.setServerLiveSnapshot === 'function' && typeof globalScope.buildMenuCacheSnapshot === 'function') {
            globalScope.setServerLiveSnapshot(globalScope.buildMenuCacheSnapshot());
          }
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
    const syncLocalDraftDirtyState = typeof deps.syncLocalDraftDirtyState === 'function'
      ? deps.syncLocalDraftDirtyState
      : (() => globalScope.syncLocalDraftDirtyState?.());

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
            const usedWorkspaceRestaurantTools = applyWorkspaceRestaurantTools(data);
            syncServerLiveSnapshot();
            const persistedDraftEnvelope = includePersistedDraft
              ? alignLocalDraftEnvelope(readStoredLocalDraftEnvelope(), globalScope.getServerLiveSnapshot?.())
              : null;
            let loadedDraft = false;
            let hasActiveLocalDraft = false;
            if (includePersistedDraft) {
              if (persistedDraftEnvelope) {
                loadedDraft = !!applyLocalDraftEnvelope(persistedDraftEnvelope, { markDirty: false });
              }
              if (loadedDraft) {
                const hasLocalDraft = !!syncLocalDraftDirtyState();
                if (hasLocalDraft) {
                  setDirty(true);
                  hasActiveLocalDraft = true;
                } else {
                  clearCurrentLocalDraft();
                  setDirty(false);
                  clearDraftChanges();
                  syncServerLiveSnapshot();
                }
              }
            }
            if (!loadedDraft) {
              clearCurrentLocalDraft(persistedDraftEnvelope ? {} : { clearStorage: false });
              setDirty(false);
              clearDraftChanges();
              syncServerLiveSnapshot();
            }
            if (persistCache) writeMenuCache(data);
            if (includeFeatured && !usedWorkspaceRestaurantTools) {
              await refreshFeatured();
              if (!hasActiveLocalDraft) syncServerLiveSnapshot();
            }
            rememberPublicRevisionToken(request, data);
          } else if (fallbackToDefault) {
            setDefaultState();
            setDirty(false);
            clearDraftChanges();
            syncServerLiveSnapshot();
            if (includeFeatured) {
              await refreshFeatured();
              syncServerLiveSnapshot();
            }
          }
        } catch (error) {
          if (fallbackToDefault) {
            setDefaultState();
            setDirty(false);
            clearDraftChanges();
            syncServerLiveSnapshot();
            if (includeFeatured) {
              await refreshFeatured();
              syncServerLiveSnapshot();
            }
          } else {
            throw error;
          }
        }
        return buildSnapshot(options.source || 'network');
      },

      async poll(options = {}) {
        const request = options.request || globalScope.buildCurrentMenuPageRequest?.();
        let revisionProbe = null;
        let bypassStateCache = false;
        if (options.useRevisionProbe && readRevision) {
          try {
            const cachedRevision = getCachedPublicRevisionToken(request);
            revisionProbe = await readRevision({
              request,
              source: 'poll',
              options,
              cachedRevision,
            });
            if (shouldSkipForUnchangedRevision(request, revisionProbe)) {
              return {
                changed: false,
                designChanged: false,
                skipped: 'unchanged-revision',
                snapshot: buildSnapshot('poll'),
              };
            }
            const probedRevision = extractPublicRevisionToken(revisionProbe);
            bypassStateCache = !!probedRevision && probedRevision !== cachedRevision;
          } catch (_) {
            revisionProbe = null;
          }
        }
        const oldTs = getLastUpdatedTs();
        const oldCats = getCategorySnapshot();
        const oldDesign = getDesignSnapshotValue();
        const oldFeatured = getFeaturedSnapshotValue();
        const stateReadOptions = bypassStateCache
          ? { ...options, bypassCache: true, expectedRevision: extractPublicRevisionToken(revisionProbe) }
          : options;
        const data = await readState({ request, source: 'poll', options: stateReadOptions });
        if (!data) {
          return {
            changed: false,
            designChanged: false,
            snapshot: buildSnapshot('poll'),
          };
        }

        const activeDraftEnvelope = isDirty()
          ? buildCurrentLocalDraftEnvelope()
          : readStoredLocalDraftEnvelope();
        hydrateFromState(data);
        const usedWorkspaceRestaurantTools = applyWorkspaceRestaurantTools(data);
        syncServerLiveSnapshot();
        let hasActiveLocalDraft = false;
        const alignedDraftEnvelope = activeDraftEnvelope
          ? alignLocalDraftEnvelope(activeDraftEnvelope, globalScope.getServerLiveSnapshot?.())
          : null;
        if (alignedDraftEnvelope) {
          const reappliedDraft = applyLocalDraftEnvelope(alignedDraftEnvelope, { markDirty: false });
          if (reappliedDraft && syncLocalDraftDirtyState()) {
            setDirty(true);
            hasActiveLocalDraft = true;
          } else {
            clearCurrentLocalDraft(reappliedDraft ? {} : { clearStorage: false });
            setDirty(false);
            clearDraftChanges();
            syncServerLiveSnapshot();
          }
        } else {
          clearCurrentLocalDraft({ clearStorage: false });
          setDirty(false);
          clearDraftChanges();
          syncServerLiveSnapshot();
        }
        writeMenuCache(data);
        const newTs = getLastUpdatedTs();
        if (newTs !== oldTs && !usedWorkspaceRestaurantTools) {
          await refreshFeatured();
          if (!hasActiveLocalDraft) syncServerLiveSnapshot();
        }
        rememberPublicRevisionToken(request, data);

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
