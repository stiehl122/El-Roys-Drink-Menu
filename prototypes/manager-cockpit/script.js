const rows = Array.from(document.querySelectorAll('.item-row'));
const search = document.getElementById('item-search');
const categoryFilter = document.getElementById('category-filter');
const addRowButton = document.getElementById('add-row-btn');
const navToggle = document.querySelector('.mobile-nav-toggle');
const navClose = document.querySelector('.mobile-nav-close');
const navBackdrop = document.querySelector('.mobile-nav-backdrop');
const railLinks = Array.from(document.querySelectorAll('.rail-link'));
const editModal = document.getElementById('edit-modal');
const editModalTitle = document.getElementById('edit-modal-title');
const editItemName = document.getElementById('edit-item-name');
let lastEditTrigger = null;

function applyFilters() {
  const term = (search?.value || '').trim().toLowerCase();
  const category = categoryFilter?.value || 'all';
  rows.forEach(row => {
    const name = (row.dataset.name || '').toLowerCase();
    const rowCategory = row.dataset.category || '';
    const termMatch = !term || name.includes(term);
    const categoryMatch = category === 'all' || rowCategory === category;
    row.classList.toggle('is-hidden', !(termMatch && categoryMatch));
  });
}

search?.addEventListener('input', applyFilters);
categoryFilter?.addEventListener('change', applyFilters);

document.querySelectorAll('.group-head').forEach(button => {
  button.addEventListener('click', () => {
    const group = button.closest('.menu-group');
    const collapsed = group.classList.toggle('is-collapsed');
    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const icon = button.querySelector('span');
    if (icon) icon.textContent = collapsed ? '▸' : '▾';
  });
});

document.querySelectorAll('.eighty-six-action').forEach(button => {
  button.addEventListener('click', () => {
    const row = button.closest('.item-row');
    const status = row.querySelector('.status-cell');
    const dot = status?.querySelector('i');
    const isOff = button.classList.toggle('restore');
    button.textContent = isOff ? 'Undo' : '86';
    if (status) status.lastChild.textContent = isOff ? ' 86 Watch' : 'On Menu';
    if (dot) dot.style.background = isOff ? '#b33228' : '#0b7a2a';
    row.style.background = isOff ? 'rgba(179, 50, 40, 0.08)' : '';
  });
});

function openEditModal(row, trigger) {
  if (!editModal || !editModalTitle || !editItemName) return;
  const name = row?.querySelector('input')?.value || row?.dataset.name || 'Menu item';
  lastEditTrigger = trigger;
  editModalTitle.textContent = name;
  editItemName.value = name;
  editModal.hidden = false;
  document.body.classList.add('modal-open');
  editItemName.focus();
  editItemName.select();
}

function closeEditModal() {
  if (!editModal) return;
  editModal.hidden = true;
  document.body.classList.remove('modal-open');
  lastEditTrigger?.focus();
  lastEditTrigger = null;
}

document.querySelectorAll('.edit-item-btn').forEach(button => {
  button.addEventListener('click', () => {
    openEditModal(button.closest('.item-row'), button);
  });
});

editModal?.addEventListener('click', event => {
  if (event.target === editModal || event.target.closest('[data-close-edit]')) {
    closeEditModal();
  }
});

addRowButton?.addEventListener('click', () => {
  search?.focus();
});

function setNavOpen(open) {
  document.body.classList.toggle('nav-open', open);
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (navBackdrop) navBackdrop.hidden = !open;
}

navToggle?.addEventListener('click', () => {
  setNavOpen(!document.body.classList.contains('nav-open'));
});

navClose?.addEventListener('click', () => setNavOpen(false));
navBackdrop?.addEventListener('click', () => setNavOpen(false));

railLinks.forEach(link => {
  link.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 1120px)').matches) {
      setNavOpen(false);
    }
  });
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !editModal?.hidden) {
    closeEditModal();
    return;
  }

  if (event.key === 'Escape' && document.body.classList.contains('nav-open')) {
    setNavOpen(false);
    navToggle?.focus();
  }
});
