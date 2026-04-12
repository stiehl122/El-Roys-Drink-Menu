(function bootstrapMenuPublishServiceModule(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_SESSION_MODULES__ && typeof globalScope.__HF_SESSION_MODULES__ === 'object')
    ? globalScope.__HF_SESSION_MODULES__
    : {};

  function createMenuPublishServiceImpl(sessionPorts, runtime = {}) {
    const buildSnapshot = typeof runtime.buildSnapshot === 'function'
      ? runtime.buildSnapshot
      : (() => ({ source: 'unknown' }));
    const buildPreview = typeof runtime.buildPreview === 'function'
      ? runtime.buildPreview
      : (() => sessionPorts.buildPreview(buildSnapshot('preview')));

    return {
      async saveDraft(options = {}) {
        void options;
        const snapshot = buildSnapshot('draft');
        if (!snapshot.dirty) {
          return {
            ok: false,
            noop: true,
            snapshot: buildSnapshot('draft-noop'),
          };
        }
        const ts = sessionPorts.now();
        try {
          await sessionPorts.patchMenuDraftState(globalScope.buildPersistedDraftStateSnapshot(ts), ts);
          sessionPorts.commitDraft(ts);
          return {
            ok: true,
            ts,
            snapshot: buildSnapshot('draft-saved'),
          };
        } catch (error) {
          return {
            ok: false,
            userHandled: false,
            userMessage: error?.message || 'Draft save failed.',
            snapshot: buildSnapshot('draft-save-failed'),
          };
        }
      },

      async publishUpdate(options = {}) {
        const preview = options.preview?.sections ? options.preview : buildPreview();
        const selectedChangeIds = options.selectedChangeIds || preview.notificationChanges.map(change => change.id);
        const selectedChanges = preview.notificationChanges.filter(change => selectedChangeIds.includes(change.id));
        const selectedSections = globalScope.groupNotificationChangesBySection(selectedChanges);
        const patchMessage = selectedSections.length ? globalScope.buildPatchMessage(selectedSections) : '';
        const mode = options.mode || (preview.mode === 'update-only'
          ? (options.notify === false ? 'save' : 'update-only')
          : (options.notify === false ? 'save' : 'save-and-update'));
        if (!preview.hasChanges) {
          return {
            ok: false,
            noop: true,
            preview,
            snapshot: buildSnapshot('publish-noop'),
          };
        }

        const warnings = [];
        let liveSaveTs = null;
        if (preview.hasLocalDraft || preview.hasSharedDraft) {
          const persisted = await sessionPorts.persistState({ silentFailure: true });
          if (!persisted) {
            return {
              ok: false,
              preview,
              userHandled: true,
              snapshot: buildSnapshot('publish-live-save-failed'),
            };
          }
          liveSaveTs = sessionPorts.now();
          try {
            await sessionPorts.patchMenuMeta({ last_updated_ts: liveSaveTs });
            await sessionPorts.patchMenuDraftState(null, liveSaveTs);
          } catch (_) {
            warnings.push('Live menu saved, but the draft metadata could not be fully synced.');
          }
          sessionPorts.commitLiveSave?.(liveSaveTs);
          const cacheSynced = sessionPorts.syncLocalCache({ silent: true });
          if (!cacheSynced) warnings.push('This device could not refresh its local cache after the live save.');
        }

        const shouldNotify = (mode === 'save-and-update' || mode === 'update-only') && selectedSections.length > 0;
        let delivery = {
          ok: true,
          skipped: !shouldNotify,
          statusCode: null,
          summary: globalScope.summarizeNotificationResults({}),
        };
        if (shouldNotify) {
          delivery = await sessionPorts.dispatchNotification({
            menuId: sessionPorts.getMenuId(),
            patchMessage,
          });
        }

        if (shouldNotify && delivery.partial) {
          warnings.push(...sessionPorts.collectNotificationWarnings(delivery.summary));
          warnings.push('Some channels did not receive the update. The lines remain ready to send again.');
          return {
            ok: true,
            preview,
            notificationStatus: delivery,
            warnings: sessionPorts.dedupeWarnings(warnings),
            warningMessage: sessionPorts.dedupeWarnings(warnings)[0] || '',
            successMessage: `✅ ${sessionPorts.getMenuName() || 'Menu'} saved live. Update still needs attention.`,
            snapshot: buildSnapshot('send-partial'),
          };
        }

        if (shouldNotify && !delivery.ok) {
          warnings.push(delivery.userMessage || 'Update could not be sent.');
          return {
            ok: true,
            preview,
            notificationStatus: delivery,
            warnings: sessionPorts.dedupeWarnings(warnings),
            warningMessage: sessionPorts.dedupeWarnings(warnings)[0] || '',
            successMessage: `✅ ${sessionPorts.getMenuName() || 'Menu'} saved live. Update still needs to be sent.`,
            snapshot: buildSnapshot('send-failed-live-saved'),
          };
        }

        if (shouldNotify) warnings.push(...sessionPorts.collectNotificationWarnings(delivery.summary));

        if (mode === 'save-and-update' || mode === 'update-only') {
          const ts = liveSaveTs || sessionPorts.now();
          const lastSentState = sessionPorts.snapshotCurrentItemsAsLastSent();
          const currentFeaturedIds = sessionPorts.getCurrentFeaturedIds();
          const restaurantId = sessionPorts.getRestaurantId();
          const restaurantMenuIds = sessionPorts.canEditRestaurantSpecials(restaurantId)
            ? sessionPorts.getRestaurantMenuIds(restaurantId)
            : [];
          const patchResults = await Promise.all([
            sessionPorts.patchMenuMeta({
              last_updated_ts: ts,
              last_sent_ts: ts,
              last_sent_state: lastSentState,
              last_sent_categories: preview.diff.map(section => section.id),
              last_sent_featured: currentFeaturedIds,
            }),
            ...restaurantMenuIds
              .filter(menuId => menuId && menuId !== sessionPorts.getMenuId())
              .map(menuId => sessionPorts.patchMenuMetaForMenu(menuId, {
                last_sent_featured: currentFeaturedIds,
              })),
          ]);
          if (patchResults.some(result => (result?.downgradedFields || []).includes('last_sent_featured'))) {
            warnings.push('Featured sync used legacy metadata compatibility on this deployment.');
          }

          sessionPorts.commitPublished({
            diff: preview.diff,
            ts,
            featuredIds: currentFeaturedIds,
          });

          const cacheSynced = sessionPorts.syncLocalCache({ silent: true });
          if (!cacheSynced) {
            warnings.push('This device could not refresh its local cache after the send.');
          }

          const logged = patchMessage ? await sessionPorts.logUpdate(globalScope.serializeNotificationSectionsForLog(selectedSections), patchMessage) : true;
          if (!logged) {
            warnings.push('The recent-changes audit log could not be written for this send.');
          }

          const finalWarnings = sessionPorts.dedupeWarnings(warnings);
          return {
            ok: true,
            preview,
            ts,
            truncated: preview.truncated,
            notificationStatus: shouldNotify ? delivery : null,
            warnings: finalWarnings,
            warningMessage: finalWarnings[0] || '',
            successMessage: shouldNotify
              ? `✅ ${sessionPorts.getMenuName() || 'Menu'} saved and sent!`
              : `✅ ${sessionPorts.getMenuName() || 'Menu'} update list cleared without notifying channels.`,
            snapshot: buildSnapshot(finalWarnings.length ? 'publish-warning' : 'publish-complete'),
          };
        }

        const finalWarnings = sessionPorts.dedupeWarnings(warnings);
        return {
          ok: true,
          preview,
          ts: liveSaveTs || sessionPorts.now(),
          truncated: preview.truncated,
          notificationStatus: shouldNotify ? delivery : null,
          warnings: finalWarnings,
          warningMessage: finalWarnings[0] || '',
          successMessage: `✅ ${sessionPorts.getMenuName() || 'Menu'} saved to the live menu.`,
          snapshot: buildSnapshot(finalWarnings.length ? 'publish-warning' : 'publish-complete'),
        };
      },
    };
  }

  modules.createMenuPublishService = function createMenuPublishServiceBoundary(sessionPorts, runtime = {}, options = {}) {
    if (options && typeof options.impl === 'function') {
      return options.impl(sessionPorts, runtime);
    }
    return createMenuPublishServiceImpl(sessionPorts, runtime);
  };

  globalScope.__HF_SESSION_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
