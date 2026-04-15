(function bootstrapAuthApi(globalScope) {
  if (!globalScope || globalScope.__HF_AUTH_API__) return;

  function normalizeProfilePayload(payload = {}) {
    const actor = payload?.actor && typeof payload.actor === 'object' ? payload.actor : payload;
    const access = payload?.access && typeof payload.access === 'object' ? payload.access : payload;
    return {
      role: actor?.role || payload?.role || 'none',
      name: actor?.name || payload?.name || '',
      accessibleMenuIds: Array.isArray(access?.accessibleMenuIds || payload?.accessibleMenuIds)
        ? (access?.accessibleMenuIds || payload?.accessibleMenuIds)
        : [],
    };
  }

  globalScope.__HF_AUTH_API__ = {
    async signUp({ email = '', password = '', name = '' } = {}) {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign_up', email, password, name }),
      });
      if (!response.ok) throw await response.json();
      return response.json();
    },

    async signIn({ email = '', password = '' } = {}) {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign_in', email, password }),
      });
      if (!response.ok) throw await response.json();
      return response.json();
    },

    async refreshToken({ refreshToken = '' } = {}) {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh', refresh_token: refreshToken }),
      });
      if (!response.ok) throw await response.json();
      return response.json();
    },

    async getProfile({ accessToken = '' } = {}) {
      const response = await fetch('/api/auth?mode=profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return { role: 'none', name: '', accessibleMenuIds: [] };
      const payload = await response.json();
      return normalizeProfilePayload(payload || {});
    },

    async resetPasswordForEmail({ email = '', redirectTo = '' } = {}) {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_password', email, redirect_to: redirectTo }),
      });
      if (!response.ok) throw await response.json();
      return null;
    },

    async updatePassword({ accessToken = '', newPassword = '' } = {}) {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: 'update_password', new_password: newPassword }),
      });
      if (!response.ok) throw await response.json();
      return response.json();
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
