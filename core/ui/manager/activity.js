(function bootstrapManagerActivityUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function escHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeEventType(entry = {}) {
    return String(
      entry.event_type ||
      entry.eventType ||
      entry.action ||
      entry.type ||
      entry.kind ||
      entry.label ||
      ''
    ).trim().toLowerCase();
  }

  function normalizeEventLabel(entry = {}) {
    const eventType = normalizeEventType(entry);
    if (['save', 'save_live', 'save_quietly'].includes(eventType)) return 'Saved quietly';
    if (['publish', 'send', 'notification', 'send_notification'].includes(eventType)) return 'Sent update';
    if (eventType === 'saved quietly') return 'Saved quietly';
    if (eventType === 'sent update') return 'Sent update';
    if (eventType === 'updated menu') return 'Updated menu';
    return 'Updated menu';
  }

  function normalizeActivityEntry(entry = {}) {
    return {
      label: normalizeEventLabel(entry),
      actor: String(entry.actor || entry.user_name || entry.userName || entry.updated_by || entry.updatedBy || ''),
      time: String(entry.time || entry.created_at || entry.createdAt || entry.updated_at || entry.updatedAt || ''),
      channel: String(entry.channel || entry.source || entry.event_channel || entry.eventChannel || ''),
    };
  }

  function createManagerActivityServiceImpl() {
    return {
      normalizeActivity(entries = []) {
        return (Array.isArray(entries) ? entries : []).map(normalizeActivityEntry);
      },
      renderActivityHtml(entries = []) {
        const normalizedEntries = this.normalizeActivity(entries);
        if (!normalizedEntries.length) {
          return '<p class="db-empty">Recent activity will appear after staff updates.</p>';
        }
        const renderRow = entry => `
          <article class="manager-cockpit-activity-row">
            <strong>${escHtml(entry.label || 'Updated menu')}</strong>
            <span>${escHtml([entry.actor, entry.time].filter(Boolean).join(' • '))}</span>
            ${entry.channel ? `<small>${escHtml(entry.channel)}</small>` : ''}
          </article>`;
        const visibleRows = normalizedEntries.slice(0, 2).map(renderRow).join('');
        const hiddenRows = normalizedEntries.slice(2).map(renderRow).join('');
        if (!hiddenRows) return visibleRows;
        const hiddenCount = normalizedEntries.length - 2;
        return `${visibleRows}
          <details class="manager-cockpit-activity-more">
            <summary>
              <span>Show more activity</span>
              <small>${escHtml(hiddenCount)} older update${hiddenCount === 1 ? '' : 's'}</small>
            </summary>
            <div class="manager-cockpit-activity-more-body">${hiddenRows}</div>
          </details>`;
      },
    };
  }

  modules.createManagerActivityService = function createManagerActivityServiceBoundary() {
    return createManagerActivityServiceImpl();
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
