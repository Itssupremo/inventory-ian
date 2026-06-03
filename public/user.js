// user.js  –  Standard user SPA (user.html)
// Sections: dashboard (my items) | profile

const MAINTENANCE_REMINDER_WINDOW_DAYS = 10;

/* ── state ── */
const state = {
  assets: [],
  currentUser: null,
  categories: [],
  statuses: [],
  editingInternalId: '',
  currentSection: 'dashboard',
  userFilter: { search: '', category: '', status: '' },
  itemFilter: { search: '', category: '', status: '' },
  modules: { image: true, assetId: true, itemName: true, category: true, serialTag: true, status: true, assignedTo: true, location: true, maintenanceDate: true },
};

/* ── API helper ── */
async function request(url, options = {}) {
  const res  = await fetch(url, { credentials: 'include', ...options });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Unauthenticated.'); }
  if (!res.ok) {
    const detail = Array.isArray(data.errors) ? ' ' + data.errors.join(' ') : '';
    throw new Error((data.message || 'Request failed.') + detail);
  }
  return data;
}

/* ── navigation ── */
function showSection(name) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.nav-link[data-section]').forEach(l => l.classList.remove('active'));

  document.getElementById('section-' + name)?.classList.remove('hidden');
  document.querySelector('.nav-link[data-section="' + name + '"]')?.classList.add('active');

  const titles = { dashboard: 'My Items', 'add-item': 'Manage Items', profile: 'User Management' };
  const titleEl = document.getElementById('sectionTitle');
  if (titleEl) titleEl.textContent = titles[name] || name;

  state.currentSection = name;

  if (name === 'profile')   renderProfile();
  if (name === 'dashboard') renderDashTable();
  if (name === 'add-item')  renderItemTable();
}

/* ── filtering: assets are already scoped by API to this user ── */
function getMyFiltered() {
  const { search, category, status } = state.userFilter;

  return state.assets.filter(asset => {
    if (category && asset.category !== category) return false;
    if (status   && asset.status   !== status)   return false;
    if (search) {
      const hay = [asset.assetId, asset.itemName, asset.serialTagNumber, asset.category]
        .join(' ').toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });
}

/* ── maintenance reminder widget ── */
function renderMaintenanceWidget(assets, listId, sectionId, badgeId) {
  const section = document.getElementById(sectionId);
  const list    = document.getElementById(listId);
  const badge   = document.getElementById(badgeId);
  if (!section || !list) return;

  const now = new Date(); now.setHours(0,0,0,0);

  const items = assets
    .filter(a => a.nextMaintenanceDate)
    .map(a => {
      const due  = new Date(a.nextMaintenanceDate);
      const days = Math.round((due - now) / 86400000);
      return { ...a, _dueDays: days };
    })
    .filter(a => a._dueDays <= MAINTENANCE_REMINDER_WINDOW_DAYS)
    .sort((a, b) => a._dueDays - b._dueDays);

  if (!items.length) { section.style.display = 'none'; return; }

  section.style.display = '';
  if (badge) badge.textContent = items.length;

  list.innerHTML = items.map(a => {
    let urgency, label;
    if (a._dueDays < 0) {
      urgency = 'overdue';
      label   = `Overdue by ${Math.abs(a._dueDays)} day${Math.abs(a._dueDays) !== 1 ? 's' : ''}`;
    } else if (a._dueDays === 0) {
      urgency = 'today';
      label   = 'Due today';
    } else if (a._dueDays <= 7) {
      urgency = 'soon';
      label   = `Due in ${a._dueDays} day${a._dueDays !== 1 ? 's' : ''}`;
    } else {
      urgency = 'upcoming';
      label   = `Due in ${a._dueDays} days`;
    }
    return `<div class="maint-alert-row maint-${urgency}">
      <div class="maint-alert-icon"><i class="bi bi-tools"></i></div>
      <div class="maint-alert-body">
        <div class="maint-alert-title">${esc(a.itemName)}</div>
        <div class="maint-alert-sub">${esc(a.maintenanceActivity || 'Scheduled maintenance')} &bull; ${esc(a.category)}</div>
      </div>
      <div class="maint-alert-right">
        <div class="maint-alert-urgency-label">${label}</div>
      </div>
    </div>`;
  }).join('');
}

/* ── module visibility ── */
async function loadSettings() {
  try {
    const data = await request('/api/settings');
    if (data.modules) Object.assign(state.modules, data.modules);
  } catch (_) { /* use defaults */ }
}

function applyModuleVisibility() {
  const m = state.modules;
  document.querySelectorAll('[data-col]').forEach(el => {
    el.style.display = (m[el.dataset.col] === false) ? 'none' : '';
  });
}

/* ── render dashboard table ── */
function renderDashTable() {
  const tbody   = document.getElementById('userDashTableBody');
  const countEl = document.getElementById('userAssetCount');
  if (!tbody) return;

  const filtered = getMyFiltered();
  renderUserStats();
  renderMaintenanceWidget(filtered, 'userMaintenanceAlertList', 'userMaintenanceAlertSection', 'userMaintenanceAlertBadge');
  tbody.innerHTML = '';

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No items assigned to you.</td></tr>';
    if (countEl) countEl.textContent = '0 Items';
    return;
  }

  filtered.forEach((asset, i) => {
    const imgHtml = asset.imageUrl
      ? `<img src="${asset.imageUrl}" alt="${asset.itemName}" />`
      : '<div class="img-placeholder"></div>';

    const status      = asset.status || '-';
    const statusClass = 'status-' + status.replace(/\s+/g, '');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="img-cell" data-col="image">${imgHtml}</td>
      <td data-col="itemName">${esc(asset.itemName)}</td>
      <td data-col="category">${esc(asset.category)}</td>
      <td data-col="serialTag">${esc(asset.serialTagNumber)}</td>
      <td data-col="status"><span class="status-pill ${statusClass}">${esc(status)}</span></td>
      <td data-col="assignedTo">${esc(asset.assignedTo)}</td>
      <td data-col="location">${esc(asset.location)}</td>`;
    tbody.appendChild(tr);
  });

  if (countEl) countEl.textContent = filtered.length + ' Item' + (filtered.length !== 1 ? 's' : '');
  applyModuleVisibility();
}

function renderUserStats() {
  const items = state.assets;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const dueSoon = items.filter(a => {
    if (!a.nextMaintenanceDate) return false;
    const due = new Date(a.nextMaintenanceDate);
    return due <= new Date(now.getTime() + MAINTENANCE_REMINDER_WINDOW_DAYS * 86400000);
  });

  const setNum = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
  setNum('userStatTotal', items.length);
  setNum('userStatInRepair', items.filter(a => (a.status || '').toLowerCase() === 'in repair').length);
  setNum('userStatMaintenanceDue', dueSoon.length);
}

function applyItemFilter(filter) {
  const { search, category, status } = filter;
  return state.assets.filter(a => {
    if (category && a.category !== category) return false;
    if (status   && a.status   !== status)   return false;
    if (search) {
      const hay = [a.itemName, a.serialTagNumber, a.category, a.assignedTo, a.location]
        .join(' ').toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });
}

function setFormMessage(text, type) {
  const el = document.getElementById('formMessage');
  if (el) { el.textContent = text; el.className = 'message' + (type ? ' ' + type : ''); }
}

function fillAssetForm(asset) {
  const f = document.getElementById('assetForm');
  if (!f) return;
  f.itemName.value        = asset.itemName || '';
  f.category.value        = asset.category || '';
  f.serialTagNumber.value = asset.serialTagNumber || '';
  f.status.value          = asset.status || '';
  f.assignedTo.value      = asset.assignedTo || '';
  f.location.value        = asset.location || '';
  f.image.value           = '';
  document.getElementById('internalId').value = asset.internalId;
  state.editingInternalId = asset.internalId;

  document.getElementById('formTitle').textContent = 'Edit Asset';
  document.getElementById('formModeBadge').textContent = 'Edit';
  document.getElementById('submitBtn').textContent = 'Update Asset';
  document.getElementById('cancelEditBtn').classList.remove('hidden');

  const wrap = document.getElementById('currentImageWrap');
  const img = document.getElementById('currentImage');
  if (asset.imageUrl) {
    img.src = asset.imageUrl;
    wrap.classList.remove('hidden');
  } else {
    wrap.classList.add('hidden');
  }

  document.getElementById('assetForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetAssetForm() {
  document.getElementById('assetForm')?.reset();
  document.getElementById('internalId').value = '';
  state.editingInternalId = '';

  document.getElementById('formTitle').textContent = 'Add New Asset';
  document.getElementById('formModeBadge').textContent = 'Create';
  document.getElementById('submitBtn').textContent = 'Save Asset';
  document.getElementById('cancelEditBtn').classList.add('hidden');
  document.getElementById('currentImageWrap').classList.add('hidden');
  setFormMessage('', '');
}

async function handleAssetSubmit(e) {
  e.preventDefault();
  setFormMessage('Saving…', '');

  const fd = new FormData(document.getElementById('assetForm'));
  const internalId = document.getElementById('internalId').value;

  try {
    if (internalId) {
      await request('/api/assets/' + internalId, { method: 'PUT', body: fd });
      setFormMessage('Asset updated successfully.', 'success');
    } else {
      await request('/api/assets', { method: 'POST', body: fd });
      setFormMessage('Asset created successfully.', 'success');
    }

    resetAssetForm();
    await loadAssets();
    renderItemTable();
    renderDashTable();
  } catch (err) {
    setFormMessage(err.message, 'error');
  }
}

function renderItemTable() {
  const tbody = document.getElementById('assetTableBody');
  const countEl = document.getElementById('assetCount');
  if (!tbody) return;

  const filtered = applyItemFilter(state.itemFilter);
  tbody.innerHTML = '';

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No assets found.</td></tr>';
    if (countEl) countEl.textContent = '0 Assets';
    return;
  }

  filtered.forEach((asset, i) => {
    const imgHtml = asset.imageUrl
      ? `<img src="${asset.imageUrl}" alt="${esc(asset.itemName)}" />`
      : '<div class="img-placeholder"></div>';

    const status = asset.status || '-';
    const statusClass = 'status-' + status.replace(/\s+/g, '');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="img-cell" data-col="image">${imgHtml}</td>
      <td data-col="itemName">${esc(asset.itemName)}</td>
      <td data-col="category">${esc(asset.category)}</td>
      <td data-col="serialTag">${esc(asset.serialTagNumber)}</td>
      <td data-col="status"><span class="status-pill ${statusClass}">${esc(status)}</span></td>
      <td data-col="assignedTo">${esc(asset.assignedTo)}</td>
      <td data-col="location">${esc(asset.location)}</td>
      <td class="action-cell">
        <button class="btn btn-small btn-primary user-item-edit-btn" data-id="${asset.internalId}">Edit</button>
      </td>`;
    tbody.appendChild(tr);
  });

  if (countEl) countEl.textContent = filtered.length + ' Asset' + (filtered.length !== 1 ? 's' : '');
  applyModuleVisibility();

  tbody.querySelectorAll('.user-item-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const asset = state.assets.find(a => a.internalId === btn.dataset.id);
      if (!asset) return;
      fillAssetForm(asset);
      setFormMessage('Editing selected asset.', '');
    });
  });
}

/* ── modal helpers ── */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

/* ── render profile card ── */
function renderProfile() {
  const user = state.currentUser;
  if (!user) return;

  /* avatar initials */
  const initials = (user.displayName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatarEl = document.getElementById('profileAvatarInitials');
  if (avatarEl) avatarEl.textContent = initials;

  /* info display */
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
  set('profileNameDisplay',     user.displayName);
  set('profileRoleDisplay',     user.role + (user.accessLevel ? ' – ' + user.accessLevel : ''));
  set('profilePositionDisplay', user.position);
  set('profileOfficeDisplay',   user.office);
  set('profileEmailDisplay',    user.email);
  set('profileUsernameDisplay', '@' + user.username);

  /* stats */
  const mine = state.assets.slice();
  const inUse   = mine.filter(a => (a.status || '').toLowerCase() === 'in use').length;
  const maint   = mine.filter(a => (a.status || '').toLowerCase().includes('maintenance')).length;
  const setNum = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
  setNum('profileStatTotal',       mine.length);
  setNum('profileStatActive',      inUse);
  setNum('profileStatMaintenance', maint);

  /* pre-fill modal form */
  const val = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  val('profileDisplayName', user.displayName);
  val('profilePosition',    user.position);
  val('profileOffice',      user.office);
  val('profileEmail',       user.email);
  val('profileUsername',    user.username);
  const roleEl = document.getElementById('profileRole');
  if (roleEl) roleEl.value = user.role + (user.accessLevel ? ' – ' + user.accessLevel : '');
  const msgEl = document.getElementById('profileMessage');
  if (msgEl) { msgEl.textContent = ''; msgEl.className = 'message'; }
}

/* ── profile submit ── */
async function handleProfileSubmit(e) {
  e.preventDefault();
  const msgEl   = document.getElementById('profileMessage');
  const newName = document.getElementById('profileDisplayName')?.value.trim();
  const newPos  = document.getElementById('profilePosition')?.value.trim();
  const newOff  = document.getElementById('profileOffice')?.value.trim();
  const newEmail = document.getElementById('profileEmail')?.value.trim();
  if (!newName) {
    if (msgEl) { msgEl.textContent = 'Display name cannot be empty.'; msgEl.className = 'message error'; }
    return;
  }
  try {
    const data = await request('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: newName, position: newPos, office: newOff, email: newEmail }),
    });
    state.currentUser = data.user;

    /* update header */
    const el = document.getElementById('currentUserLabel');
    if (el) el.innerHTML = '<i class="bi bi-person-circle"></i> ' + esc(data.user.displayName);
    const pn = document.getElementById('userProfileName');
    if (pn) pn.textContent = data.user.displayName;

    closeModal('editProfileModal');
    renderProfile();
  } catch (err) {
    if (msgEl) { msgEl.textContent = err.message; msgEl.className = 'message error'; }
  }
}

/* ── select helper ── */
function fillSelect(id, values, placeholder) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">' + placeholder + '</option>' +
    values.map(v => '<option value="' + v + '">' + v + '</option>').join('');
}

function populateAllSelects() {
  fillSelect('category',           state.categories, 'Select Category');
  fillSelect('status',             state.statuses,   'Select Status');
  fillSelect('userCategoryFilter', state.categories, 'All Categories');
  fillSelect('userStatusFilter',   state.statuses,   'All Statuses');
  fillSelect('itemCategoryFilter', state.categories, 'All Categories');
  fillSelect('itemStatusFilter',   state.statuses,   'All Statuses');
}

async function loadAssets() {
  const data = await request('/api/assets');
  state.assets = Array.isArray(data) ? data : [];
}

async function loadOptions() {
  const data = await request('/api/meta/options');
  state.categories = data.categories || [];
  state.statuses = data.statuses || [];
  populateAllSelects();
}

/* ── sanitize ── */
function esc(str) {
  return String(str || '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── event wiring ── */
function attachEvents() {
  document.querySelectorAll('.nav-link[data-section]').forEach(link => {
    link.addEventListener('click', e => { e.preventDefault(); showSection(link.dataset.section); });
  });

  document.getElementById('logoutBtn')?.addEventListener('click', () => window.Auth.logout());

  document.getElementById('userCategoryFilter')?.addEventListener('change', e => { state.userFilter.category = e.target.value; renderDashTable(); });
  document.getElementById('userStatusFilter')?.addEventListener('change',   e => { state.userFilter.status   = e.target.value; renderDashTable(); });
  document.getElementById('userSearchInput')?.addEventListener('input',     e => { state.userFilter.search   = e.target.value; renderDashTable(); });

  document.getElementById('assetForm')?.addEventListener('submit', handleAssetSubmit);
  document.getElementById('cancelEditBtn')?.addEventListener('click', resetAssetForm);
  document.getElementById('resetFormBtn')?.addEventListener('click', resetAssetForm);
  document.getElementById('itemCategoryFilter')?.addEventListener('change', e => { state.itemFilter.category = e.target.value; renderItemTable(); });
  document.getElementById('itemStatusFilter')?.addEventListener('change',   e => { state.itemFilter.status   = e.target.value; renderItemTable(); });
  document.getElementById('itemSearch')?.addEventListener('input',          e => { state.itemFilter.search   = e.target.value; renderItemTable(); });

  /* edit profile modal */
  document.getElementById('openEditProfileBtn')?.addEventListener('click', () => openModal('editProfileModal'));
  document.getElementById('editProfileModalClose')?.addEventListener('click',  () => closeModal('editProfileModal'));
  document.getElementById('editProfileModalCancel')?.addEventListener('click', () => closeModal('editProfileModal'));
  document.getElementById('editProfileModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('editProfileModal'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal('editProfileModal'); });

  document.getElementById('profileForm')?.addEventListener('submit', handleProfileSubmit);

  /* mobile sidebar */
  const _sidebar = document.getElementById('sidebarNav');
  const _overlay = document.getElementById('sidebarOverlay');
  function _toggleSidebar(open) {
    _sidebar?.classList.toggle('open', open);
    _overlay?.classList.toggle('open', open);
  }
  document.getElementById('hamburgerBtn')?.addEventListener('click', () => _toggleSidebar(!_sidebar?.classList.contains('open')));
  _overlay?.addEventListener('click', () => _toggleSidebar(false));
  document.querySelectorAll('.nav-link[data-section]').forEach(link => {
    link.addEventListener('click', () => { if (window.innerWidth < 768) _toggleSidebar(false); });
  });
}

/* ── bootstrap ── */
async function bootstrap() {
  const user = await window.Auth.requireRole('User');
  if (!user) return;

  state.currentUser = user;

  const el = document.getElementById('currentUserLabel');
  if (el) el.innerHTML = '<i class="bi bi-person-circle"></i> ' + esc(user.displayName);
  const pn = document.getElementById('userProfileName');
  if (pn) pn.textContent = user.displayName;
  const pr = document.getElementById('userProfileRole');
  if (pr) pr.textContent = user.role + (user.accessLevel ? ' | ' + user.accessLevel : '');

  attachEvents();

  try {
    await Promise.all([
      loadOptions(),
      loadAssets(),
      loadSettings(),
    ]);
    resetAssetForm();
    renderItemTable();
    renderDashTable();
    showSection('dashboard');
  } catch (err) {
    console.error('Bootstrap error:', err);
  }
}

bootstrap();
