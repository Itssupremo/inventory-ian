// app.js  –  Admin SPA (admin.html)
// Sections: dashboard | add-item | user-management | modules

/* ── module definitions ── */
const MODULE_DEFS = [
  { key: 'image',           label: 'Image',            desc: 'Asset photo thumbnail' },
  { key: 'assetId',         label: 'Asset ID',         desc: 'Unique asset identifier code' },
  { key: 'itemName',        label: 'Item Name',        desc: 'Name of the inventory item' },
  { key: 'category',        label: 'Category',         desc: 'Asset type / category' },
  { key: 'serialTag',       label: 'Serial / Tag',     desc: 'Serial number or tag number' },
  { key: 'status',          label: 'Status',           desc: 'Current availability status' },
  { key: 'assignedTo',      label: 'Assigned To',      desc: 'Person or department assigned' },
  { key: 'location',        label: 'Location',         desc: 'Physical location of asset' },
  { key: 'maintenanceDate', label: 'Maintenance Date', desc: 'Scheduled maintenance date' },
];

const MAINTENANCE_REMINDER_WINDOW_DAYS = 10;

/* ── state ── */
const state = {
  assets: [],
  categories: [],
  statuses: [],
  editingInternalId: '',
  currentSection: 'dashboard',
  users: [],
  dashFilter: { search: '', category: '', status: '' },
  itemFilter: { search: '', category: '', status: '' },
  modules: { image: true, assetId: true, itemName: true, category: true, serialTag: true, status: true, assignedTo: true, location: true, maintenanceDate: true },
};

/* ── API helper ── */
async function request(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options });
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

  const section = document.getElementById('section-' + name);
  if (section) section.classList.remove('hidden');

  const link = document.querySelector('.nav-link[data-section="' + name + '"]');
  if (link) link.classList.add('active');

  const titles = { dashboard: 'Dashboard', 'add-item': 'Manage Items', 'user-management': 'User Management', modules: 'Module Management' };
  const titleEl = document.getElementById('sectionTitle');
  if (titleEl) titleEl.textContent = titles[name] || name;

  state.currentSection = name;

  if (name === 'dashboard')        renderDashboard();
  if (name === 'add-item')          renderItemTable();
  if (name === 'user-management')   loadAndRenderUsers();
  if (name === 'modules')           renderModulesSection();
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

  // ── table columns (th + td with data-col) ──
  document.querySelectorAll('[data-col]').forEach(el => {
    el.style.display = (m[el.dataset.col] === false) ? 'none' : '';
  });

  // ── form field groups (field-group with data-form-field) ──
  document.querySelectorAll('[data-form-field]').forEach(group => {
    const key    = group.dataset.formField;
    const hidden = (m[key] === false);
    group.style.display = hidden ? 'none' : '';
    // disable/enable every input, select, textarea inside so
    // required validation doesn't block submit when the field is hidden
    group.querySelectorAll('input, select, textarea').forEach(inp => {
      if (hidden) {
        inp.dataset.wasRequired = inp.required ? '1' : '0';
        inp.required  = false;
        inp.disabled  = true;
      } else {
        if (inp.dataset.wasRequired === '1') inp.required = true;
        // Only re-enable inputs that we disabled via module hiding.
        // Don't accidentally re-enable the assetId input that the
        // useAutoId checkbox controls separately.
        if (inp.id !== 'assetId') inp.disabled = false;
      }
    });
  });
}

function renderModulesSection() {
  const grid   = document.getElementById('moduleGrid');
  const msgEl  = document.getElementById('moduleMgmtMessage');
  if (!grid) return;
  grid.innerHTML = '';

  MODULE_DEFS.forEach(mod => {
    const isOn = state.modules[mod.key] !== false;
    const card = document.createElement('div');
    card.className = 'module-card';
    card.innerHTML = `
      <div class="module-card-body">
        <div class="module-card-info">
          <div class="module-card-label">${escHtml(mod.label)}</div>
          <div class="module-card-desc">${escHtml(mod.desc)}</div>
        </div>
        <label class="toggle-switch" title="${isOn ? 'Click to hide column' : 'Click to show column'}">
          <input type="checkbox" class="module-toggle" data-key="${mod.key}" ${isOn ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="module-status-bar ${isOn ? 'mod-on' : 'mod-off'}">${isOn ? 'Visible' : 'Hidden'}</div>`;
    grid.appendChild(card);
  });

  grid.querySelectorAll('.module-toggle').forEach(chk => {
    chk.addEventListener('change', async () => {
      const key   = chk.dataset.key;
      const value = chk.checked;
      const bar   = chk.closest('.module-card').querySelector('.module-status-bar');
      const lbl   = chk.closest('.toggle-switch');
      const msgEl = document.getElementById('moduleMgmtMessage');

      // ── apply instantly (optimistic) ──
      state.modules[key] = value;
      applyModuleVisibility();
      if (bar) {
        bar.textContent = value ? 'Visible' : 'Hidden';
        bar.className   = 'module-status-bar ' + (value ? 'mod-on' : 'mod-off');
      }
      if (lbl) lbl.title = value ? 'Click to hide column' : 'Click to show column';
      if (msgEl) { msgEl.textContent = ''; msgEl.className = 'message'; }

      // ── persist to server in background ──
      try {
        const data = await request('/api/settings/modules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        });
        Object.assign(state.modules, data.modules);
        if (msgEl) {
          const mod = MODULE_DEFS.find(d => d.key === key);
          msgEl.textContent = (mod ? mod.label : key) + ' ' + (value ? 'shown' : 'hidden') + '.';
          msgEl.className   = 'message success';
        }
      } catch (err) {
        // ── revert on failure ──
        state.modules[key] = !value;
        chk.checked = !value;
        applyModuleVisibility();
        if (bar) {
          bar.textContent = !value ? 'Visible' : 'Hidden';
          bar.className   = 'module-status-bar ' + (!value ? 'mod-on' : 'mod-off');
        }
        if (lbl) lbl.title = !value ? 'Click to hide column' : 'Click to show column';
        if (msgEl) { msgEl.textContent = err.message; msgEl.className = 'message error'; }
      }
    });
  });
}

/* ── stats ── */
function renderStats() {
  const a   = state.assets;
  const now = new Date(); now.setHours(0,0,0,0);
  const dueSoon = a.filter(x => {
    if (!x.nextMaintenanceDate) return false;
    const d = new Date(x.nextMaintenanceDate);
    return d <= new Date(now.getTime() + MAINTENANCE_REMINDER_WINDOW_DAYS * 86400000);
  });
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stat-total',            a.length);
  set('stat-available',        a.filter(x => x.status === 'Available').length);
  set('stat-assigned',         a.filter(x => x.status === 'Assigned').length);
  set('stat-in-repair',        a.filter(x => x.status === 'In Repair').length);
  set('stat-retired',          a.filter(x => x.status === 'Retired').length);
  set('stat-maintenance-due',  dueSoon.length);
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
        <div class="maint-alert-title">${a.itemName || '-'} <span class="maint-alert-id">${a.assetId || ''}</span></div>
        <div class="maint-alert-sub">${a.maintenanceActivity || 'Scheduled maintenance'} &bull; ${a.category || '-'}</div>
      </div>
      <div class="maint-alert-right">
        <div class="maint-alert-due-date">${a.nextMaintenanceDate}</div>
        <div class="maint-alert-urgency-label">${label}</div>
      </div>
    </div>`;
  }).join('');
}

/* ── filtering helper ── */
function applyFilter(filter) {
  const { search, category, status } = filter;
  return state.assets.filter(a => {
    if (category && a.category !== category) return false;
    if (status   && a.status   !== status)   return false;
    if (search) {
      const hay = [a.assetId, a.itemName, a.serialTagNumber, a.assignedTo, a.location]
        .join(' ').toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });
}

/* ── row HTML helper ── */
function makeAssetRow(asset, idx, withCrud) {
  const imgHtml = asset.imageUrl
    ? `<img src="${asset.imageUrl}" alt="${asset.itemName}" />`
    : '<div class="img-placeholder"></div>';

  const status = asset.status || '-';
  const statusClass = 'status-' + status.replace(/\s+/g, '');

  const actions = withCrud
    ? `<button class="btn btn-small btn-primary item-edit-btn"   data-id="${asset.internalId}">Edit</button>
       <button class="btn btn-small btn-danger  item-delete-btn" data-id="${asset.internalId}">Delete</button>`
    : `<button class="btn btn-small btn-primary dash-edit-btn"   data-id="${asset.internalId}">Edit</button>
       <button class="btn btn-small btn-danger  dash-delete-btn" data-id="${asset.internalId}">Delete</button>`;

  return `<td>${idx + 1}</td>
    <td class="img-cell" data-col="image">${imgHtml}</td>
    <td data-col="assetId">${asset.assetId || '-'}</td>
    <td data-col="itemName">${asset.itemName || '-'}</td>
    <td data-col="category">${asset.category || '-'}</td>
    <td data-col="serialTag">${asset.serialTagNumber || '-'}</td>
    <td data-col="status"><span class="status-pill ${statusClass}">${status}</span></td>
    <td data-col="assignedTo">${asset.assignedTo || '-'}</td>
    <td data-col="location">${asset.location || '-'}</td>
    <td data-col="maintenanceDate">${asset.maintenanceDate || '-'}</td>
    <td class="action-cell">${actions}</td>`;
}

/* ── dashboard table ── */
function renderDashboard() {
  renderStats();
  renderMaintenanceWidget(state.assets, 'maintenanceAlertList', 'maintenanceAlertSection', 'maintenanceAlertBadge');
  const filtered = applyFilter(state.dashFilter);
  const tbody    = document.getElementById('dashTableBody');
  const countEl  = document.getElementById('dashAssetCount');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-row">No assets found.</td></tr>';
    if (countEl) countEl.textContent = '0 Assets';
    return;
  }

  filtered.forEach((asset, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = makeAssetRow(asset, i, false);
    tbody.appendChild(tr);
  });
  if (countEl) countEl.textContent = filtered.length + ' Asset' + (filtered.length !== 1 ? 's' : '');

  applyModuleVisibility();

  tbody.querySelectorAll('.dash-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const asset = state.assets.find(a => a.internalId === btn.dataset.id);
      if (asset) { fillForm(asset); showSection('add-item'); }
    });
  });
  tbody.querySelectorAll('.dash-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteAsset(btn.dataset.id, 'dashboard'));
  });
}

/* ── add-item table ── */
function renderItemTable() {
  const filtered = applyFilter(state.itemFilter);
  const tbody    = document.getElementById('assetTableBody');
  const countEl  = document.getElementById('assetCount');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-row">No assets found.</td></tr>';
    if (countEl) countEl.textContent = '0 Assets';
    return;
  }

  filtered.forEach((asset, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = makeAssetRow(asset, i, true);
    tbody.appendChild(tr);
  });
  if (countEl) countEl.textContent = filtered.length + ' Asset' + (filtered.length !== 1 ? 's' : '');

  applyModuleVisibility();

  tbody.querySelectorAll('.item-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const asset = state.assets.find(a => a.internalId === btn.dataset.id);
      if (asset) { fillForm(asset); setMessage('Editing asset ' + asset.assetId + '. Make changes and click Update.', ''); }
    });
  });
  tbody.querySelectorAll('.item-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteAsset(btn.dataset.id, 'add-item'));
  });
}

/* ── delete shared ── */
async function deleteAsset(internalId, section) {
  const asset = state.assets.find(a => a.internalId === internalId);
  if (!asset) return;
  if (!confirm('Delete asset ' + (asset.assetId || internalId) + '? This cannot be undone.')) return;
  try {
    await request('/api/assets/' + internalId, { method: 'DELETE' });
    if (state.editingInternalId === internalId) resetForm();
    await loadAssets();
    if (section === 'dashboard') renderDashboard();
    else { renderItemTable(); setMessage('Asset deleted successfully.', 'success'); }
  } catch (err) {
    if (section === 'add-item') setMessage(err.message, 'error');
    else alert(err.message);
  }
}

/* ── form helpers ── */
function setMessage(text, type) {
  const el = document.getElementById('formMessage');
  if (el) { el.textContent = text; el.className = 'message' + (type ? ' ' + type : ''); }
}

function fillForm(asset) {
  const f = document.getElementById('assetForm');
  populateAssignedToSelect(asset.assignedTo || '');
  document.getElementById('useAutoId').checked = false;
  document.getElementById('assetId').disabled = false;
  f.assetId.value         = asset.assetId || '';
  f.itemName.value        = asset.itemName || '';
  f.category.value        = asset.category || '';
  f.serialTagNumber.value = asset.serialTagNumber || '';
  f.status.value          = asset.status || '';
  f.assignedTo.value      = asset.assignedTo || '';
  f.location.value        = asset.location || '';
  document.getElementById('maintenanceDate').value = asset.maintenanceDate || '';
  f.image.value           = '';
  document.getElementById('internalId').value = asset.internalId;
  state.editingInternalId = asset.internalId;

  document.getElementById('formTitle').textContent     = 'Edit Asset';
  document.getElementById('formModeBadge').textContent = 'Edit';
  document.getElementById('submitBtn').textContent     = 'Update Asset';
  document.getElementById('cancelEditBtn').classList.remove('hidden');

  const wrap = document.getElementById('currentImageWrap');
  const img  = document.getElementById('currentImage');
  if (asset.imageUrl) { img.src = asset.imageUrl; wrap.classList.remove('hidden'); }
  else wrap.classList.add('hidden');

  // scroll form into view
  document.getElementById('assetForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
  document.getElementById('assetForm').reset();
  populateAssignedToSelect('');
  document.getElementById('useAutoId').checked = true;
  document.getElementById('internalId').value  = '';
  document.getElementById('assetId').disabled  = true;
  state.editingInternalId = '';

  document.getElementById('formTitle').textContent     = 'Add New Asset';
  document.getElementById('formModeBadge').textContent = 'Create';
  document.getElementById('submitBtn').textContent     = 'Save Asset';
  document.getElementById('cancelEditBtn').classList.add('hidden');
  document.getElementById('currentImageWrap').classList.add('hidden');
  document.getElementById('maintenanceDate').value = '';
  setMessage('', '');
}

async function submitForm(e) {
  e.preventDefault();
  setMessage('Saving…', '');
  const fd = new FormData(document.getElementById('assetForm'));
  fd.set('useAutoId', String(document.getElementById('useAutoId').checked));
  const internalId = document.getElementById('internalId').value;
  try {
    if (internalId) {
      await request('/api/assets/' + internalId, { method: 'PUT', body: fd });
      setMessage('Asset updated successfully.', 'success');
    } else {
      await request('/api/assets', { method: 'POST', body: fd });
      setMessage('Asset created successfully.', 'success');
    }
    resetForm();
    await loadAssets();
    renderItemTable();
  } catch (err) {
    setMessage(err.message, 'error');
  }
}

/* ── selects ── */
function fillSelect(id, values, placeholder) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<option value="">' + placeholder + '</option>' +
    values.map(v => '<option value="' + v + '">' + v + '</option>').join('');
}

function populateAllSelects() {
  fillSelect('category',          state.categories, 'Select Category');
  fillSelect('status',            state.statuses,   'Select Status');
  fillSelect('dashCategoryFilter', state.categories, 'All Categories');
  fillSelect('dashStatusFilter',   state.statuses,   'All Statuses');
  fillSelect('itemCategoryFilter', state.categories, 'All Categories');
  fillSelect('itemStatusFilter',   state.statuses,   'All Statuses');
}

function populateAssignedToSelect(selectedValue = '') {
  const el = document.getElementById('assignedTo');
  if (!el) return;

  const users = state.users
    .filter(u => u && u.isActive)
    .map(u => ({ username: (u.username || '').trim(), displayName: (u.displayName || '').trim() }))
    .filter(u => u.username)
    .sort((a, b) => a.username.localeCompare(b.username));

  const opts = ['<option value="">Unassigned</option>'];
  users.forEach(u => {
    const label = u.displayName
      ? `${escHtml(u.displayName)} (@${escHtml(u.username)})`
      : `@${escHtml(u.username)}`;
    opts.push(`<option value="${escAttr(u.username)}">${label}</option>`);
  });

  const selected = String(selectedValue || '').trim();
  if (selected && !users.some(u => u.username === selected)) {
    opts.push(`<option value="${escAttr(selected)}">${escHtml(selected)} (current)</option>`);
  }

  el.innerHTML = opts.join('');
  el.value = selected;
}

/* ── user management ── */
async function loadAndRenderUsers() {
  const msgEl = document.getElementById('userMgmtMessage');
  try {
    state.users = await request('/api/users');
    populateAssignedToSelect(document.getElementById('assignedTo')?.value || '');
    renderUserTable();
  } catch (err) {
    if (msgEl) { msgEl.textContent = err.message; msgEl.className = 'message error'; }
  }
}

function renderUserTable() {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.users.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No users found.</td></tr>';
    return;
  }

  state.users.forEach((user, i) => {
    const tr = document.createElement('tr');
    tr.dataset.userId = user.internalId;

    const roleBg     = user.role === 'Administrator' ? '#1a3a9e' : '#2e7d32';
    const toggleHtml = `<div class="toggle-cell-inner"><label class="toggle-switch" title="${user.isActive ? 'Click to deactivate' : 'Click to activate'}">
      <input type="checkbox" class="user-active-toggle" data-id="${user.internalId}" ${user.isActive ? 'checked' : ''} />
      <span class="toggle-slider"></span>
    </label>
    <span class="toggle-label ${user.isActive ? 'status-active' : 'status-inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></div>`;

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="user-display-name" id="udn-${user.internalId}">${escHtml(user.displayName)}</td>
      <td><code>${escHtml(user.username)}</code></td>
      <td><span class="role-badge" style="background:${roleBg}">${user.role}</span></td>
      <td id="upos-${user.internalId}">${escHtml(user.position)}</td>
      <td id="uoff-${user.internalId}">${escHtml(user.office)}</td>
      <td id="ueml-${user.internalId}">${escHtml(user.email)}</td>
      <td class="toggle-cell">${toggleHtml}</td>
      <td class="action-cell">
        <button class="btn btn-small btn-primary user-rename-btn" data-id="${user.internalId}" data-name="${escAttr(user.displayName)}" data-position="${escAttr(user.position)}" data-office="${escAttr(user.office)}" data-email="${escAttr(user.email)}">Edit</button>
        <button class="btn btn-small btn-danger user-delete-btn" data-id="${user.internalId}" data-name="${escAttr(user.displayName)}">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });

  /* toggle isActive */
  tbody.querySelectorAll('.user-active-toggle').forEach(chk => {
    chk.addEventListener('change', async () => {
      const id       = chk.dataset.id;
      const isActive = chk.checked;
      const msgEl    = document.getElementById('userMgmtMessage');
      try {
        const updated = await request('/api/users/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive }),
        });
        const labelEl = chk.closest('.toggle-cell-inner').querySelector('.toggle-label');
        if (labelEl) {
          labelEl.textContent = updated.isActive ? 'Active' : 'Inactive';
          labelEl.className   = 'toggle-label ' + (updated.isActive ? 'status-active' : 'status-inactive');
        }
        const idx = state.users.findIndex(u => u.internalId === id);
        if (idx >= 0) state.users[idx].isActive = updated.isActive;
        if (msgEl) { msgEl.textContent = 'Account status updated.'; msgEl.className = 'message success'; }
      } catch (err) {
        chk.checked = !isActive;
        if (msgEl) { msgEl.textContent = err.message; msgEl.className = 'message error'; }
      }
    });
  });

  /* edit modal */
  tbody.querySelectorAll('.user-rename-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('editUserId').value       = btn.dataset.id;
      document.getElementById('editDisplayName').value  = btn.dataset.name;
      document.getElementById('editPosition').value     = btn.dataset.position;
      document.getElementById('editOffice').value       = btn.dataset.office;
      document.getElementById('editEmail').value        = btn.dataset.email || '';
      document.getElementById('editUserMessage').textContent = '';
      document.getElementById('editUserMessage').className  = 'message';
      openModal('editUserModal');
    });
  });

  /* delete modal */
  tbody.querySelectorAll('.user-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('deleteUserId').value          = btn.dataset.id;
      document.getElementById('deleteUserNameLabel').textContent = btn.dataset.name;
      document.getElementById('deleteUserMessage').textContent   = '';
      document.getElementById('deleteUserMessage').className     = 'message';
      openModal('deleteUserModal');
    });
  });
}

/* ── add new user form ── */
async function handleAddUserSubmit(e) {
  e.preventDefault();
  const msgEl = document.getElementById('addUserMessage');
  const payload = {
    username:    document.getElementById('newUsername')?.value.trim(),
    password:    document.getElementById('newPassword')?.value,
    displayName: document.getElementById('newDisplayName')?.value.trim(),
    role:        document.getElementById('newRole')?.value,
    position:    document.getElementById('newPosition')?.value.trim(),
    office:      document.getElementById('newOffice')?.value.trim(),
    email:       document.getElementById('newEmail')?.value.trim(),
  };
  try {
    const created = await request('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    state.users.push(created);
    populateAssignedToSelect(document.getElementById('assignedTo')?.value || '');
    renderUserTable();
    e.target.reset();
    if (msgEl) { msgEl.textContent = `User "${created.displayName}" created successfully.`; msgEl.className = 'message success'; }
  } catch (err) {
    if (msgEl) { msgEl.textContent = err.message; msgEl.className = 'message error'; }
  }
}

/* ── utilities ── */
function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) { return escHtml(str); }

/* ── data loading ── */
async function loadAssets() {
  const data   = await request('/api/assets');
  state.assets = Array.isArray(data) ? data : [];
}

async function loadOptions() {
  const data      = await request('/api/meta/options');
  state.categories = data.categories || [];
  state.statuses   = data.statuses   || [];
  populateAllSelects();
}

/* ── modal helpers ── */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

/* ── event wiring ── */
function attachEvents() {
  /* nav */
  document.querySelectorAll('.nav-link[data-section]').forEach(link => {
    link.addEventListener('click', e => { e.preventDefault(); showSection(link.dataset.section); });
  });

  /* logout */
  document.getElementById('logoutBtn')?.addEventListener('click', () => window.Auth.logout());

  /* form */
  document.getElementById('assetForm')?.addEventListener('submit', submitForm);
  document.getElementById('addUserForm')?.addEventListener('submit', handleAddUserSubmit);
  document.getElementById('cancelEditBtn')?.addEventListener('click', resetForm);
  document.getElementById('resetFormBtn')?.addEventListener('click', resetForm);
  document.getElementById('useAutoId')?.addEventListener('change', () => {
    const auto = document.getElementById('useAutoId').checked;
    const inp  = document.getElementById('assetId');
    inp.disabled = auto;
    if (auto) inp.value = '';
  });

  /* dashboard filters */
  document.getElementById('dashCategoryFilter')?.addEventListener('change', e => { state.dashFilter.category = e.target.value; renderDashboard(); });
  document.getElementById('dashStatusFilter')?.addEventListener('change',   e => { state.dashFilter.status   = e.target.value; renderDashboard(); });
  document.getElementById('dashSearch')?.addEventListener('input',          e => { state.dashFilter.search   = e.target.value; renderDashboard(); });

  /* add-item filters */
  document.getElementById('itemCategoryFilter')?.addEventListener('change', e => { state.itemFilter.category = e.target.value; renderItemTable(); });
  document.getElementById('itemStatusFilter')?.addEventListener('change',   e => { state.itemFilter.status   = e.target.value; renderItemTable(); });
  document.getElementById('itemSearch')?.addEventListener('input',          e => { state.itemFilter.search   = e.target.value; renderItemTable(); });

  /* edit user modal */
  document.getElementById('editUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id      = document.getElementById('editUserId').value;
    const newName  = document.getElementById('editDisplayName').value.trim();
    const newPos   = document.getElementById('editPosition').value.trim();
    const newOff   = document.getElementById('editOffice').value.trim();
    const newEmail = document.getElementById('editEmail').value.trim();
    const msgEl   = document.getElementById('editUserMessage');
    if (!newName) return;
    try {
      const updated = await request('/api/users/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: newName, position: newPos, office: newOff, email: newEmail }),
      });
      const idx = state.users.findIndex(u => u.internalId === id);
      if (idx >= 0) Object.assign(state.users[idx], { displayName: updated.displayName, position: updated.position, office: updated.office, email: updated.email });
      populateAssignedToSelect(document.getElementById('assignedTo')?.value || '');
      renderUserTable();
      closeModal('editUserModal');
      const tableMsg = document.getElementById('userMgmtMessage');
      if (tableMsg) { tableMsg.textContent = 'User updated successfully.'; tableMsg.className = 'message success'; }
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message; msgEl.className = 'message error'; }
    }
  });
  document.getElementById('editModalClose')?.addEventListener('click',  () => closeModal('editUserModal'));
  document.getElementById('editModalCancel')?.addEventListener('click', () => closeModal('editUserModal'));

  /* delete user modal */
  document.getElementById('deleteUserConfirmBtn')?.addEventListener('click', async () => {
    const id    = document.getElementById('deleteUserId').value;
    const name  = document.getElementById('deleteUserNameLabel').textContent;
    const msgEl = document.getElementById('deleteUserMessage');
    try {
      await request('/api/users/' + id, { method: 'DELETE' });
      state.users = state.users.filter(u => u.internalId !== id);
      populateAssignedToSelect(document.getElementById('assignedTo')?.value || '');
      renderUserTable();
      closeModal('deleteUserModal');
      const tableMsg = document.getElementById('userMgmtMessage');
      if (tableMsg) { tableMsg.textContent = `User "${name}" deleted.`; tableMsg.className = 'message success'; }
    } catch (err) {
      if (msgEl) { msgEl.textContent = err.message; msgEl.className = 'message error'; }
    }
  });
  document.getElementById('deleteModalClose')?.addEventListener('click',  () => closeModal('deleteUserModal'));
  document.getElementById('deleteModalCancel')?.addEventListener('click', () => closeModal('deleteUserModal'));

  /* close modals on backdrop click */
  document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) closeModal(el.id); });
  });

  /* close modals on Escape */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop.open').forEach(el => closeModal(el.id));
  });

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
  const user = await window.Auth.requireRole('Administrator');
  if (!user) return;

  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set('currentUserLabel', '<i class="bi bi-person-circle"></i> ' + escHtml(user.displayName));
  set('navProfileName',   escHtml(user.displayName));
  set('navProfileRole',   escHtml(user.role + ' | ' + user.accessLevel));

  attachEvents();

  await loadOptions();
  await loadAndRenderUsers();
  await loadSettings();
  await loadAssets();
  showSection('dashboard');
}

bootstrap();
