const tabs = Array.from(document.querySelectorAll('[data-menu-tab]'));
const views = Array.from(document.querySelectorAll('[data-menu-view]'));

function selectMenu(menu) {
  tabs.forEach(tab => {
    const active = tab.dataset.menuTab === menu;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  views.forEach(view => {
    const active = view.dataset.menuView === menu;
    view.classList.toggle('is-active', active);
    view.hidden = !active;
  });
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => selectMenu(tab.dataset.menuTab));
});
