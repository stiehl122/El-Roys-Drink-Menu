(function bootstrapManagerItemsTableUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createManagerItemsTableServiceImpl() {
    return {
      buildTableState({ categories = [], menuState = {} } = {}) {
        return categories.map(category => {
          const categoryItems = menuState[category.id]?.items;
          return {
            id: String(category.id ?? ''),
            title: String(category.title ?? ''),
            icon: String(category.icon ?? ''),
            items: Array.isArray(categoryItems) ? categoryItems : [],
          };
        });
      },
    };
  }

  modules.createManagerItemsTableService = function createManagerItemsTableServiceBoundary() {
    return createManagerItemsTableServiceImpl();
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
