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

  function buildAuthApiError(response, payload, fallbackMessage = 'Authentication failed.') {
    const details = payload && typeof payload === 'object' ? { ...payload } : {};
    const status = Number(response?.status || details?.status || 0);
    if (status > 0) details.status = status;
    details.message = (
      typeof payload === 'string' && payload.trim()
        ? payload.trim()
        : details.message || details.msg || details.error_description || details.error || fallbackMessage
    );
    return details;
  }

  function buildMalformedAuthApiSuccessError(response, fallbackMessage = 'Authentication failed.') {
    return {
      status: 502,
      message: 'Authentication response was not valid JSON.',
      fallbackMessage,
    };
  }

  async function readAuthApiPayload(response, fallbackMessage = 'Authentication failed.') {
    let payload = {};
    const raw = typeof response?.text === 'function'
      ? await response.text().catch(() => '')
      : '';
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch (_) {
        if (response?.ok) throw buildMalformedAuthApiSuccessError(response, fallbackMessage);
        payload = { message: raw };
      }
    }
    if (!response.ok) throw buildAuthApiError(response, payload, fallbackMessage);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw buildMalformedAuthApiSuccessError(response, fallbackMessage);
    }
    return payload && typeof payload === 'object' ? payload : {};
  }

  async function readAuthApiSessionPayload(response, fallbackMessage = 'Authentication failed.') {
    const payload = await readAuthApiPayload(response, fallbackMessage);
    return payload?.session && typeof payload.session === 'object' ? payload.session : payload;
  }

  globalScope.__HF_AUTH_API__ = {
    async signUp({ email = '', password = '', name = '' } = {}) {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign_up', email, password, name }),
      });
      return readAuthApiPayload(response, 'Sign-up failed.');
    },

    async signIn({ email = '', password = '' } = {}) {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'web_sign_in', email, password }),
      });
      return readAuthApiSessionPayload(response, 'Authentication failed.');
    },

    async adoptWebSession(session = {}) {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'web_adopt_session',
          access_token: session?.access_token || session?.accessToken || '',
          refresh_token: session?.refresh_token || session?.refreshToken || '',
          expires_in: session?.expires_in || session?.expiresIn || 3600,
        }),
      });
      return readAuthApiSessionPayload(response, 'Failed to establish web session.');
    },

    async refreshToken() {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'web_refresh' }),
      });
      return readAuthApiSessionPayload(response, 'Session refresh failed.');
    },

    async signOutWebSession() {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'web_sign_out' }),
      });
      return readAuthApiPayload(response, 'Sign-out failed.');
    },

    async getProfile({ accessToken = '' } = {}) {
      if (!accessToken) {
        return { ok: false, profile: null, reason: 'missing-token' };
      }

      const response = await fetch('/api/auth?mode=profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await readAuthApiPayload(response, 'Failed to load profile.');
      return normalizeProfilePayload(payload || {});
    },

    async resetPasswordForEmail({ email = '', redirectTo = '' } = {}) {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_password', email, redirect_to: redirectTo }),
      });
      await readAuthApiPayload(response, 'Failed to send reset email.');
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
      return readAuthApiPayload(response, 'Failed to update password.');
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
