(function bootstrapPublicFooterActionsUi(globalScope) {
  if (!globalScope) return;

  const modules = (globalScope.__HF_UI_MODULES__ && typeof globalScope.__HF_UI_MODULES__ === 'object')
    ? globalScope.__HF_UI_MODULES__
    : {};

  function createPublicFooterActionsServiceImpl(deps = {}) {
    const documentRef = deps.document || globalScope.document;
    const getCurrentUser = typeof deps.getCurrentUser === 'function' ? deps.getCurrentUser : (() => null);
    const getMenuId = typeof deps.getMenuId === 'function' ? deps.getMenuId : (() => '');
    const getRestaurantId = typeof deps.getRestaurantId === 'function' ? deps.getRestaurantId : (() => '');
    const currentUserCanManageMenu = typeof deps.currentUserCanManageMenu === 'function' ? deps.currentUserCanManageMenu : (() => false);
    const getManagerHrefForMenuId = typeof deps.getManagerHrefForMenuId === 'function' ? deps.getManagerHrefForMenuId : (() => '/manager');
    const getAdminHrefForMenuId = typeof deps.getAdminHrefForMenuId === 'function' ? deps.getAdminHrefForMenuId : (() => '/admin');
    const requestSignIn = typeof deps.requestSignIn === 'function' ? deps.requestSignIn : (() => {});
    const navigateToPage = typeof deps.navigateToPage === 'function' ? deps.navigateToPage : (() => {});
    const signOut = typeof deps.signOut === 'function' ? deps.signOut : (() => {});

    function buildPublicStaffFooterState(user = getCurrentUser(), options = {}) {
      const menuId = options.menuId || getMenuId();
      const restaurantId = options.restaurantId || getRestaurantId();
      const signedIn = !!user;
      const canManageCurrentMenu = signedIn && (
        menuId
          ? currentUserCanManageMenu(menuId, user)
          : (user?.role === 'manager' || user?.role === 'admin')
      );
      const isAdmin = user?.role === 'admin';
      const links = [];

      if (canManageCurrentMenu) {
        links.push({
          key: 'manager',
          label: 'Manager',
          href: getManagerHrefForMenuId(menuId),
          action: 'navigate',
        });
      }
      if (isAdmin) {
        links.push({
          key: 'admin',
          label: 'Admin',
          href: getAdminHrefForMenuId(menuId),
          action: 'navigate',
        });
      }
      if (signedIn) {
        links.push({
          key: 'signout',
          label: 'Sign Out',
          href: '',
          action: 'signOut',
        });
      }

      return {
        signedIn,
        menuId,
        restaurantId,
        signIn: signedIn
          ? null
          : {
              key: 'signin',
              label: 'Staff Sign-In',
              href: '',
              action: 'openAuthOverlay',
            },
        links,
      };
    }

    function syncPublicStaffFooterActions(state = buildPublicStaffFooterState()) {
      const footerWraps = documentRef.querySelectorAll('[data-route-footer-actions], [data-route-staff-actions]');
      const signInEls = documentRef.querySelectorAll('[data-route-footer-signin], [data-route-staff-signin]');
      const managerEls = documentRef.querySelectorAll('[data-route-footer-manager], [data-route-staff-manager]');
      const adminEls = documentRef.querySelectorAll('[data-route-footer-admin], [data-route-staff-admin]');
      const signOutEls = documentRef.querySelectorAll('[data-route-footer-signout], [data-route-staff-signout]');
      const managerLink = state.links.find(link => link.key === 'manager') || null;
      const adminLink = state.links.find(link => link.key === 'admin') || null;
      const signOutLink = state.links.find(link => link.key === 'signout') || null;

      footerWraps.forEach(footerWrap => {
        footerWrap.style.display = state.signedIn || state.signIn ? '' : 'none';
      });
      signInEls.forEach(signInEl => {
        signInEl.style.display = state.signIn ? '' : 'none';
        signInEl.textContent = state.signIn?.label || '';
        signInEl.onclick = state.signIn ? () => requestSignIn({ screen: 'signin', origin: 'public-footer' }) : null;
      });
      managerEls.forEach(managerEl => {
        managerEl.style.display = managerLink ? '' : 'none';
        managerEl.textContent = managerLink?.label || '';
        managerEl.onclick = managerLink ? () => navigateToPage(managerLink.href) : null;
      });
      adminEls.forEach(adminEl => {
        adminEl.style.display = adminLink ? '' : 'none';
        adminEl.textContent = adminLink?.label || '';
        adminEl.onclick = adminLink ? () => navigateToPage(adminLink.href) : null;
      });
      signOutEls.forEach(signOutEl => {
        signOutEl.style.display = signOutLink ? '' : 'none';
        signOutEl.textContent = signOutLink?.label || '';
        signOutEl.onclick = signOutLink ? () => signOut() : null;
      });
    }

    return {
      buildPublicStaffFooterState,
      syncPublicStaffFooterActions,
    };
  }

  modules.createPublicFooterActionsService = function createPublicFooterActionsServiceBoundary(deps = {}) {
    return createPublicFooterActionsServiceImpl(deps);
  };

  globalScope.__HF_UI_MODULES__ = modules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
