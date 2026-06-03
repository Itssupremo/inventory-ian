async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.message || 'Request failed.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function getCurrentUser() {
  try {
    const data = await apiRequest('/api/auth/me');
    return data.user || null;
  } catch (err) {
    if (err.status === 401) {
      return null;
    }
    throw err;
  }
}

async function requireRole(allowedRoles) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/login.html';
    return null;
  }

  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (roles.length > 0 && !roles.includes(user.role)) {
    window.location.href = user.role === 'Administrator' ? '/admin.html' : '/user.html';
    return null;
  }

  return user;
}

async function logout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } finally {
    window.location.href = '/login.html';
  }
}

window.Auth = {
  apiRequest,
  getCurrentUser,
  requireRole,
  logout,
};
