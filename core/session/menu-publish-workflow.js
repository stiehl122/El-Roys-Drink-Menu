(function bootstrapMenuPublishWorkflowModule(globalScope) {
  if (!globalScope) return;

  function mergeDowngradedFields(...results) {
    const merged = [];
    results.forEach(result => {
      (Array.isArray(result?.downgradedFields) ? result.downgradedFields : []).forEach(field => {
        if (!merged.includes(field)) merged.push(field);
      });
    });
    return merged;
  }

  function buildLastSentStateFromSnapshot(snapshot = {}) {
    const categories = Array.isArray(snapshot?.cats) ? snapshot.cats : [];
    return Object.fromEntries(categories
      .map(category => {
        const key = String(category?.key || '').trim();
        if (!key) return null;
        const items = Array.isArray(category?.items) ? category.items : [];
        return [
          key,
          items.map(item => ({
            id: String(item?.id || '').trim(),
            name: String(item?.name || ''),
            eightySixed: !!(item?.is_eighty_sixed ?? item?.eightySixed),
            onMenu: item?.on_menu !== false && item?.onMenu !== false,
            visibility: String(item?.visibility || 'public'),
            featuredEnabled: item?.featured_enabled === true || item?.featuredEnabled === true,
          })),
        ];
      })
      .filter(Boolean));
  }

  function normalizeRevisionValue(value) {
    if (value == null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function buildPostCommitRevisions(revisions = {}, {
    livePersisted = false,
    baselineAdvanced = false,
    ts = null,
  } = {}) {
    const commitTs = normalizeRevisionValue(ts);
    const liveRevision = livePersisted
      ? (commitTs ?? normalizeRevisionValue(revisions.liveRevision))
      : normalizeRevisionValue(revisions.liveRevision);
    const draftRevision = livePersisted
      ? null
      : normalizeRevisionValue(revisions.draftRevision);
    const previousBaseline = normalizeRevisionValue(
      revisions.lastSentRevision ?? revisions.notificationBaselineRevision ?? revisions.notificationRevision
    );
    const lastSentRevision = baselineAdvanced
      ? (commitTs ?? previousBaseline)
      : previousBaseline;

    return {
      liveRevision,
      draftRevision,
      lastSentRevision,
      notificationRevision: lastSentRevision,
      notificationBaselineRevision: lastSentRevision,
    };
  }

  function createMenuPublishWorkflow({ ports }) {
    if (!ports) throw new Error('ports are required');
    const SUPPORTED_INTENTS = new Set(['save', 'send', 'save-and-send']);

    async function readContext(command = {}) {
      await ports.governance.assertCategoryGovernanceAllowed({
        actor: command.actor,
        menuId: command.menuId,
        snapshot: command.snapshot || {},
      });
      const context = await ports.menus.readContext(command.menuId);
      const revisions = ports.governance.assertRevisions({
        menuId: command.menuId,
        meta: context.meta,
        expectedLiveRevision: command.request?.expectedLiveRevision ?? null,
        expectedDraftRevision: command.request?.expectedDraftRevision ?? null,
        expectedNotificationRevision: command.request?.expectedNotificationRevision ?? null,
      });
      const preview = await ports.preview.buildCanonical({
        menuId: command.menuId,
        snapshot: command.snapshot || {},
        knownMenu: context.knownMenu,
        meta: context.meta,
      });
      return { context, revisions, preview };
    }

    return {
      async preview(command = {}) {
        const { preview, revisions } = await readContext(command);
        return { ok: true, preview, revisions };
      },

      async execute(command = {}) {
        if (!SUPPORTED_INTENTS.has(command.intent)) {
          throw new Error(`unsupported command intent: ${command.intent || ''}`);
        }
        const { context, revisions, preview } = await readContext(command);
        const selection = ports.preview.resolveSelection({
          preview,
          selectedChangeIds: command.request?.selectedChangeIds ?? null,
          legacySelectedSections: Array.isArray(command.request?.legacySelectedSections)
            ? command.request.legacySelectedSections
            : null,
        });
        const ts = ports.clock.now();
        const operationId = ports.ids.operationId();
        const warnings = [];
        const auditEventTypes = [];
        const auditResults = [];
        const metaResults = [];
        let livePersisted = false;
        const shouldNotify = (command.intent === 'send' || command.intent === 'save-and-send') && selection.selectedSections.length > 0;
        let baselineAdvanced = false;
        const menuName = context.knownMenu?.name || 'Menu';
        const lastSentState = preview.metadata?.lastSentState && typeof preview.metadata.lastSentState === 'object'
          ? preview.metadata.lastSentState
          : buildLastSentStateFromSnapshot(command.snapshot || {});

        let notification = {
          attempted: false,
          delivered: false,
          partial: false,
          summary: null,
          retryable: false,
        };

        if (shouldNotify) {
          notification = {
            attempted: true,
            ...(await ports.notifications.deliver({
              menuId: command.menuId,
              message: ports.format.patchMessage({
                sections: selection.selectedSections,
                menuName: context.knownMenu?.name || '',
                menuLink: String(context.meta?.notifications?.menu_url || '').trim(),
              }),
            })),
          };
        }

        if (notification.partial || (notification.attempted && !notification.delivered)) {
          warnings.push(...ports.format.warningSummary(notification.summary));
          auditResults.push(await ports.audit.append({
            menuId: command.menuId,
            actor: command.actor,
            source: command.source || '',
            operationId,
            eventType: 'send_failed',
            sections: selection.selectedSections,
            message: 'Notification delivery failed or was partial. Changes were saved live without preserving a send queue.',
          }));
          auditEventTypes.push('send_failed');
          return {
            ok: false,
            ts,
            operationId,
            preview,
            revisions,
            livePersistence: {
              attempted: command.intent !== 'send',
              persisted: false,
            },
            queue: {
              baselineAdvanced: false,
              selectedChangeIds: selection.selectedChangeIds,
              clearedChangeIds: selection.clearedChangeIds,
              featuredSiblingMenusSynced: [],
            },
            audit: {
              loggedEvents: auditEventTypes,
              warnings: [],
            },
            notification,
            userOutcome: {
              successMessage: '',
              warningMessage: warnings[0] || 'Send Update blocked because notifications failed.',
              warnings,
            },
            compatibility: {
              contract: 'menu-publish-workflow.v1',
              downgradedFields: mergeDowngradedFields(...auditResults),
            },
          };
        }

        if (command.intent !== 'send') {
          await ports.menus.saveLiveMenu({
            menuId: command.menuId,
            snapshot: command.snapshot || {},
            actor: command.actor,
            expectedLiveRevision: command.request?.expectedLiveRevision ?? null,
          });
          livePersisted = true;
        }

        if (command.intent === 'save') {
          auditResults.push(await ports.audit.append({
            menuId: command.menuId,
            actor: command.actor,
            source: command.source || '',
            operationId,
            eventType: 'quiet_save',
            sections: selection.selectedSections,
            message: preview.hasNotificationChanges ? 'Saved live without sending notifications.' : 'Saved live quietly.',
          }));
          auditEventTypes.push('quiet_save');
        }
        if (selection.selectedSections.length && notification.attempted && notification.delivered) {
          auditResults.push(await ports.audit.append({
            menuId: command.menuId,
            actor: command.actor,
            source: command.source || '',
            operationId,
            eventType: 'send_notification',
            sections: selection.selectedSections,
            message: ports.format.patchMessage({
              sections: selection.selectedSections,
              menuName: context.knownMenu?.name || '',
              menuLink: String(context.meta?.notifications?.menu_url || '').trim(),
            }) || 'Sent menu update notification.',
          }));
          auditEventTypes.push('send_notification');
        }
        if (selection.clearedSections.length) {
          auditResults.push(await ports.audit.append({
            menuId: command.menuId,
            actor: command.actor,
            source: command.source || '',
            operationId,
            eventType: 'clear_without_send',
            sections: selection.clearedSections,
            message: `Cleared ${selection.clearedSections.reduce((count, section) => count + ((section.changes || []).length), 0)} queued line(s) without sending.`,
          }));
          auditEventTypes.push('clear_without_send');
        }

        baselineAdvanced = true;
        metaResults.push(await ports.menus.patchMeta({
          menuId: command.menuId,
          patch: {
            last_updated_ts: livePersisted ? ts : (context.meta?.last_updated_ts || null),
            last_sent_ts: ts,
            last_sent_state: lastSentState,
            last_sent_categories: (preview.diff || []).map(section => section.id),
            draft_state: livePersisted ? {} : (context.meta?.draft_state || {}),
            draft_saved_ts: livePersisted ? null : (context.meta?.draft_saved_ts || null),
            draft_saved_by_user_id: livePersisted ? null : (context.meta?.draft_saved_by_user_id ?? undefined),
            draft_saved_by_name: livePersisted ? '' : (context.meta?.draft_saved_by_name ?? undefined),
            draft_saved_source: livePersisted ? '' : (context.meta?.draft_saved_source ?? undefined),
          },
          optionalFields: ['draft_saved_by_user_id', 'draft_saved_by_name', 'draft_saved_source'],
        }));

        let successMessage = `✅ ${menuName} saved live.`;
        if (notification.attempted && notification.delivered && baselineAdvanced) {
          successMessage = `✅ ${menuName} saved and sent!`;
        } else if (notification.attempted && !notification.delivered) {
          successMessage = `✅ ${menuName} saved live. Notifications need attention.`;
        } else if (command.intent === 'send' && !notification.attempted) {
          successMessage = `✅ ${menuName} saved live without sending notifications.`;
        }

        return {
          ok: true,
          ts,
          operationId,
          preview,
          revisions: buildPostCommitRevisions(revisions, {
            livePersisted,
            baselineAdvanced,
            ts,
          }),
          livePersistence: {
            attempted: command.intent !== 'send',
            persisted: livePersisted,
          },
          queue: {
            baselineAdvanced,
            selectedChangeIds: selection.selectedChangeIds,
            clearedChangeIds: selection.clearedChangeIds,
            featuredSiblingMenusSynced: [],
          },
          audit: {
            loggedEvents: auditEventTypes,
            warnings: [],
          },
          notification,
          userOutcome: {
            successMessage,
            warningMessage: warnings[0] || '',
            warnings,
          },
          compatibility: {
            contract: 'menu-publish-workflow.v1',
            downgradedFields: mergeDowngradedFields(...metaResults, ...auditResults),
          },
        };
      },
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createMenuPublishWorkflow };
  }
  globalScope.createMenuPublishWorkflow = createMenuPublishWorkflow;
})(typeof globalThis !== 'undefined' ? globalThis : this);
