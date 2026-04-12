(function bootstrapManagerSectionsUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerSectionServiceImpl(deps = {}) {
    const documentRef = deps.document || globalScope.document;
    const editSectionIds = Array.isArray(deps.editSectionIds) && deps.editSectionIds.length
      ? deps.editSectionIds.slice()
      : ['manager-items-section', 'manager-pricing-section', 'manager-description-section'];
    const renderManagerCategories = typeof deps.renderManagerCategories === 'function' ? deps.renderManagerCategories : (() => {});
    const renderPricingSection = typeof deps.renderPricingSection === 'function' ? deps.renderPricingSection : (() => {});
    const renderDescriptionSection = typeof deps.renderDescriptionSection === 'function' ? deps.renderDescriptionSection : (() => {});
    const staleSections = new Set();

    function isManagerEditSection(sectionId) {
      return editSectionIds.includes(sectionId);
    }

    function renderEditSection(sectionId) {
      if (sectionId === 'manager-items-section') {
        renderManagerCategories();
        return;
      }
      if (sectionId === 'manager-pricing-section') {
        renderPricingSection();
        return;
      }
      if (sectionId === 'manager-description-section') {
        renderDescriptionSection();
      }
    }

    function markSectionsStale(except) {
      editSectionIds
        .filter(sectionId => sectionId !== except)
        .forEach(sectionId => {
          staleSections.add(sectionId);
          const section = documentRef.getElementById(sectionId);
          if (!section || section.style.display === 'none') return;
          renderEditSection(sectionId);
          staleSections.delete(sectionId);
        });
    }

    function refreshStaleSection(sectionId) {
      if (!staleSections.has(sectionId)) return false;
      renderEditSection(sectionId);
      staleSections.delete(sectionId);
      return true;
    }

    function setManagerEditSectionVisibility() {
      editSectionIds.forEach(sectionId => {
        const section = documentRef.getElementById(sectionId);
        if (section) section.style.display = '';
      });
    }

    function renderActiveManagerSection() {
      renderManagerCategories();
      renderPricingSection();
      renderDescriptionSection();
    }

    return {
      isManagerEditSection,
      markSectionsStale,
      refreshStaleSection,
      setManagerEditSectionVisibility,
      renderActiveManagerSection,
    };
  }

  modules.createManagerSectionService = function createManagerSectionServiceBoundary(deps = {}) {
    return createManagerSectionServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
