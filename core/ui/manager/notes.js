(function bootstrapManagerNotesUi(globalScope) {
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

  function normalizeNotePayload(notePayload = {}) {
    const payload = notePayload?.note && typeof notePayload.note === 'object'
      ? notePayload.note
      : notePayload;
    return {
      text: String(payload?.note ?? payload?.text ?? ''),
      updatedAt: String(payload?.updated_at ?? payload?.updatedAt ?? ''),
      updatedBy: String(payload?.updated_by ?? payload?.updatedBy ?? ''),
    };
  }

  function formatSavedLabel(updatedAt = '', updatedBy = '') {
    if (!updatedAt) return 'No note saved yet';
    const date = new Date(updatedAt);
    const dateLabel = Number.isNaN(date.getTime())
      ? String(updatedAt)
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return updatedBy ? `Saved ${dateLabel} by ${updatedBy}` : `Saved ${dateLabel}`;
  }

  function createManagerNotesServiceImpl(deps = {}) {
    const saveNote = typeof deps.saveNote === 'function'
      ? deps.saveNote
      : async note => ({ note });
    const state = {
      text: '',
      savedText: '',
      isSaving: false,
      error: '',
      updatedAt: '',
      updatedBy: '',
    };

    function getStatusLabel() {
      if (state.isSaving) return 'Saving note...';
      if (state.error) return '';
      if (state.text !== state.savedText) return 'Unsaved note changes';
      return formatSavedLabel(state.updatedAt, state.updatedBy);
    }

    return {
      normalizeNote(value = '') {
        return String(value ?? '');
      },
      setInitialNote(notePayload = {}) {
        const payload = normalizeNotePayload(notePayload);
        state.text = payload.text;
        state.savedText = payload.text;
        state.isSaving = false;
        state.error = '';
        state.updatedAt = payload.updatedAt;
        state.updatedBy = payload.updatedBy;
      },
      setText(value = '') {
        state.text = String(value ?? '');
        state.error = '';
      },
      getState() {
        return { ...state };
      },
      renderHtml() {
        const status = getStatusLabel();
        const disabledAttr = state.isSaving ? ' disabled' : '';
        return `
          <textarea id="manager-quick-note" rows="5" placeholder="Prep notes, counts, handoff details...">${escHtml(state.text)}</textarea>
          <div class="manager-quick-note-actions">
            <button class="manager-quick-note-save" id="manager-quick-note-save" type="button"${disabledAttr}>${state.isSaving ? 'Saving...' : 'Save Note'}</button>
            <span class="manager-quick-note-status" id="manager-quick-note-status" aria-live="polite">${escHtml(status)}</span>
          </div>
          ${state.error ? `<p class="manager-quick-note-error" id="manager-quick-note-error" role="alert">${escHtml(state.error)}</p>` : ''}`;
      },
      async save() {
        state.isSaving = true;
        state.error = '';
        try {
          const result = await saveNote(state.text);
          const payload = normalizeNotePayload(result);
          state.savedText = payload.text;
          state.text = payload.text;
          state.updatedAt = payload.updatedAt;
          state.updatedBy = payload.updatedBy;
          state.isSaving = false;
          state.error = '';
          return this.getState();
        } catch (error) {
          state.isSaving = false;
          state.error = String(error?.message || error || 'Note could not be saved.');
          throw error;
        }
      },
    };
  }

  modules.createManagerNotesService = function createManagerNotesServiceBoundary(deps = {}) {
    return createManagerNotesServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
