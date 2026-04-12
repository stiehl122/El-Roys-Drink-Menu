(function bootstrapAuthSessionService(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_AUTH_MODULES__ && typeof globalScope.__HF_AUTH_MODULES__ === 'object')
    ? globalScope.__HF_AUTH_MODULES__
    : {};

  function applySessionImpl(data, role, name, accessibleMenuIds = [], deps = {}) {
    const now = typeof deps.now === 'function' ? deps.now : (() => Date.now());
    const setCurrentUser = typeof deps.setCurrentUser === 'function' ? deps.setCurrentUser : (() => {});
    const writeStorage = typeof deps.writeStorage === 'function' ? deps.writeStorage : (() => {});
    const scheduleTokenRefresh = typeof deps.scheduleTokenRefresh === 'function' ? deps.scheduleTokenRefresh : (() => {});

    const expiresIn = (data.expires_in || 3600) * 1000;
    const userId = data.user?.id || data.user_id || '';
    const email = data.user?.email || data.email || '';
    const nextUser = {
      uid: userId,
      email,
      name: name || '',
      role,
      accessibleMenuIds,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: now() + expiresIn,
    };

    setCurrentUser(nextUser);
    writeStorage(nextUser);
    scheduleTokenRefresh(nextUser.expiresAt);
    return nextUser;
  }

  function scheduleTokenRefreshImpl(expiresAt, deps = {}) {
    const clearExistingTimer = typeof deps.clearExistingTimer === 'function' ? deps.clearExistingTimer : (() => {});
    const setTimer = typeof deps.setTimer === 'function' ? deps.setTimer : (() => null);
    const setTimerRef = typeof deps.setTimerRef === 'function' ? deps.setTimerRef : (() => {});
    const getCurrentUser = typeof deps.getCurrentUser === 'function' ? deps.getCurrentUser : (() => null);
    const refreshToken = typeof deps.refreshToken === 'function' ? deps.refreshToken : (() => Promise.reject(new Error('refresh not configured')));
    const writeRefreshedTokens = typeof deps.writeRefreshedTokens === 'function' ? deps.writeRefreshedTokens : (() => {});
    const onRefreshFailure = typeof deps.onRefreshFailure === 'function' ? deps.onRefreshFailure : (() => {});
    const now = typeof deps.now === 'function' ? deps.now : (() => Date.now());

    clearExistingTimer();
    const msUntilRefresh = Math.max(0, expiresAt - now() - 5 * 60 * 1000);
    const timer = setTimer(async () => {
      const user = getCurrentUser();
      if (!user) return;
      try {
        const data = await refreshToken(user.refreshToken);
        const nextExpiresAt = now() + ((data.expires_in || 3600) * 1000);
        writeRefreshedTokens({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: nextExpiresAt,
        });
        scheduleTokenRefreshImpl(nextExpiresAt, deps);
      } catch (_) {
        onRefreshFailure();
      }
    }, msUntilRefresh);
    setTimerRef(timer);
    return timer;
  }

  function clearStoredSessionImpl(deps = {}) {
    const clearExistingTimer = typeof deps.clearExistingTimer === 'function' ? deps.clearExistingTimer : (() => {});
    const setTimerRef = typeof deps.setTimerRef === 'function' ? deps.setTimerRef : (() => {});
    const setCurrentUser = typeof deps.setCurrentUser === 'function' ? deps.setCurrentUser : (() => {});
    const clearStorage = typeof deps.clearStorage === 'function' ? deps.clearStorage : (() => {});

    clearExistingTimer();
    setTimerRef(null);
    setCurrentUser(null);
    clearStorage();
  }

  function createAccessSessionServiceImpl(deps = {}) {
    const getSupabaseConfig = typeof deps.getSupabaseConfig === 'function'
      ? deps.getSupabaseConfig
      : (() => ({ supabaseUrl: '', anonKey: '' }));
    const getStorageValue = typeof deps.getStorageValue === 'function' ? deps.getStorageValue : (() => '');
    const clearStorageValue = typeof deps.clearStorageValue === 'function' ? deps.clearStorageValue : (() => {});
    const now = typeof deps.now === 'function' ? deps.now : (() => Date.now());
    const fetchProfile = typeof deps.fetchProfile === 'function'
      ? deps.fetchProfile
      : (async () => ({ role: 'none', name: '', accessibleMenuIds: [] }));
    const refreshToken = typeof deps.refreshToken === 'function'
      ? deps.refreshToken
      : (async () => {
          throw new Error('refresh token is unavailable');
        });
    const applySession = typeof deps.applySession === 'function'
      ? deps.applySession
      : (() => ({}));
    const applyRole = typeof deps.applyRole === 'function' ? deps.applyRole : (() => {});
    const closeAuthOverlay = typeof deps.closeAuthOverlay === 'function' ? deps.closeAuthOverlay : (() => {});
    const getLocationHash = typeof deps.getLocationHash === 'function' ? deps.getLocationHash : (() => '');
    const clearLocationHash = typeof deps.clearLocationHash === 'function' ? deps.clearLocationHash : (() => {});
    const setRecoverySessionData = typeof deps.setRecoverySessionData === 'function' ? deps.setRecoverySessionData : (() => {});
    const syncRequestedPageModeImpl = typeof deps.syncRequestedPageModeImpl === 'function'
      ? deps.syncRequestedPageModeImpl
      : (async () => ({ handled: false }));
    const retryDelayMs = Number(deps.retryDelayMs || 2000);
    const scheduleRetry = typeof deps.scheduleRetry === 'function'
      ? deps.scheduleRetry
      : (callback => setTimeout(callback, retryDelayMs));

    async function restoreWithRefresh() {
      const refresh = getStorageValue('refreshToken');
      if (!refresh) throw new Error('no refresh token');
      const data = await refreshToken(refresh);
      const session = await service.applyAuthenticatedSession(data);
      return { data, session };
    }

    const service = {
      async applyAuthenticatedSession(data, options = {}) {
        const { closeOverlay = false } = options;
        let role = 'none';
        let name = '';
        let accessibleMenuIds = [];
        if (data?.access_token) {
          const profile = await fetchProfile(data.access_token);
          role = profile.role;
          name = profile.name;
          accessibleMenuIds = profile.accessibleMenuIds;
        }
        applySession(data, role, name, accessibleMenuIds);
        applyRole(role);
        if (closeOverlay) closeAuthOverlay();
        return { role, name, accessibleMenuIds };
      },

      async handleRecoveryCallback() {
        const hash = String(getLocationHash() || '').replace(/^#/, '');
        if (!hash) return { handled: false };
        const params = new URLSearchParams(hash);
        if (params.get('type') !== 'recovery') return { handled: false };
        const accessToken = params.get('access_token');
        if (!accessToken) return { handled: false };
        clearLocationHash();
        setRecoverySessionData({
          access_token: accessToken,
          refresh_token: params.get('refresh_token') || '',
          expires_in: Number(params.get('expires_in') || 3600),
        });
        return {
          handled: true,
          screen: 'reset',
        };
      },

      async restoreStoredSession() {
        const { supabaseUrl = '', anonKey = '' } = getSupabaseConfig();
        if (!supabaseUrl || !anonKey) return { restored: false, reason: 'not-configured' };

        const storedAccess = getStorageValue('accessToken');
        const storedRefresh = getStorageValue('refreshToken');
        const storedExpiresAt = Number(getStorageValue('expiresAt') || 0);
        const storedUid = getStorageValue('uid') || '';
        const storedEmail = getStorageValue('email') || '';
        if (!storedRefresh) return { restored: false, reason: 'no-refresh-token' };

        if (storedAccess && storedExpiresAt > now() + 120_000) {
          try {
            const profile = await fetchProfile(storedAccess);
            deps.setCurrentUser?.({
              uid: storedUid,
              email: storedEmail,
              name: profile.name,
              role: profile.role,
              accessibleMenuIds: profile.accessibleMenuIds,
              accessToken: storedAccess,
              refreshToken: storedRefresh,
              expiresAt: storedExpiresAt,
            });
            deps.scheduleTokenRefresh?.(storedExpiresAt);
            applyRole(profile.role);
            return { restored: true, source: 'stored-access', profile };
          } catch (_) {
            // continue into refresh flow
          }
        }

        try {
          const refreshed = await restoreWithRefresh();
          return { restored: true, source: 'refresh-token', ...refreshed };
        } catch (_) {
          scheduleRetry(async () => {
            try {
              await restoreWithRefresh();
              await service.syncRequestedPageMode();
            } catch (_) {
              clearStorageValue('accessToken');
              clearStorageValue('refreshToken');
              clearStorageValue('expiresAt');
              clearStorageValue('uid');
              clearStorageValue('email');
            }
          }, retryDelayMs);
          return { restored: false, reason: 'retry-scheduled' };
        }
      },

      async syncRequestedPageMode() {
        return syncRequestedPageModeImpl();
      },
    };

    return service;
  }

  modules.applySession = function applySessionBoundary(data, role, name, accessibleMenuIds = [], deps = {}, options = {}) {
    if (options && typeof options.fallback === 'function') {
      return options.fallback();
    }
    return applySessionImpl(data, role, name, accessibleMenuIds, deps);
  };

  modules.scheduleTokenRefresh = function scheduleTokenRefreshBoundary(expiresAt, deps = {}, options = {}) {
    if (options && typeof options.fallback === 'function') {
      return options.fallback();
    }
    return scheduleTokenRefreshImpl(expiresAt, deps);
  };

  modules.clearStoredSession = function clearStoredSessionBoundary(deps = {}, options = {}) {
    if (options && typeof options.fallback === 'function') {
      return options.fallback();
    }
    return clearStoredSessionImpl(deps);
  };

  modules.createAccessSessionService = function createAccessSessionServiceBoundary(deps = {}, options = {}) {
    if (options && typeof options.fallback === 'function') {
      return options.fallback();
    }
    return createAccessSessionServiceImpl(deps);
  };

  globalScope.__HF_AUTH_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
