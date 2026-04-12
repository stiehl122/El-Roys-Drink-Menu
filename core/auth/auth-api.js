(function bootstrapAuthApi(globalScope) {
  if (!globalScope || globalScope.__HF_AUTH_API__) return;

  globalScope.__HF_AUTH_API__ = {
    async signUp({ supabaseUrl = '', anonKey = '', email = '', password = '', name = '' } = {}) {
      const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify({ email, password, data: { name } }),
      });
      if (!response.ok) throw await response.json();
      return response.json();
    },

    async signIn({ supabaseUrl = '', anonKey = '', email = '', password = '' } = {}) {
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw await response.json();
      return response.json();
    },

    async refreshToken({ supabaseUrl = '', anonKey = '', refreshToken = '' } = {}) {
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) throw await response.json();
      return response.json();
    },

    async getProfile({ accessToken = '' } = {}) {
      const response = await fetch('/api/role', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return { role: 'none', name: '', accessibleMenuIds: [] };
      return response.json();
    },

    async resetPasswordForEmail({ supabaseUrl = '', anonKey = '', email = '', redirectTo = '' } = {}) {
      const response = await fetch(`${supabaseUrl}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify({ email, redirect_to: redirectTo }),
      });
      if (!response.ok) throw await response.json();
      return null;
    },

    async updatePassword({ supabaseUrl = '', anonKey = '', accessToken = '', newPassword = '' } = {}) {
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!response.ok) throw await response.json();
      return response.json();
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
