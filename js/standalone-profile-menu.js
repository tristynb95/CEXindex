import { createProfileMenu } from './profile-menu.js';
import { mountNotificationCentre } from './notification-centre.js';
import { hasAdminPanelAccess } from './permissions.js';

// Mounts the dashboard account menu in standalone page headers. Keeping the
// markup and interaction here means Profile, Bakery Profile, My Activity, and
// My Team cannot drift into four slightly different versions of the control.
//
// The notification bell rides along for the same reason: it belongs beside the
// profile button on every page, and one mount here is four pages covered.
export function mountStandaloneProfileMenu(options) {
  const settings = options || {};
  const root = settings.root || document.querySelector('[data-standalone-account-menu]');
  if (!root) return null;

  root.innerHTML =
    '<div class="profile-menu standalone-profile-menu" data-profile-menu>' +
      '<button type="button" class="profile-menu__trigger standalone-profile-menu__trigger"' +
        ' aria-label="Open profile menu" aria-haspopup="menu" aria-expanded="false">' +
        '<span class="profile-menu__avatar" data-profile-menu-avatar aria-hidden="true">P</span>' +
        '<span class="profile-menu__dot" data-notification-dot hidden></span>' +
        '<span class="standalone-profile-menu__label">Profile</span>' +
        '<svg class="profile-menu__chevron" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
          '<path d="m6 8 4 4 4-4"></path>' +
        '</svg>' +
      '</button>' +
      '<div class="profile-menu__popover" role="menu" hidden>' +
        '<div class="profile-menu__identity">' +
          '<span data-profile-menu-name>Your profile</span>' +
          '<small data-profile-menu-email></small>' +
          '<button type="button" class="profile-menu__bell" data-notification-trigger' +
            ' aria-haspopup="dialog" aria-expanded="false" title="Notifications">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
              '<path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"></path>' +
              '<path d="M13.7 20a2 2 0 0 1-3.4 0"></path>' +
            '</svg>' +
            '<span class="profile-menu__count" data-notification-count hidden>0</span>' +
            '<span class="sr-only">Notifications</span>' +
          '</button>' +
        '</div>' +
        '<a class="profile-menu__item" href="profile.html" role="menuitem">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<circle cx="12" cy="8" r="4"></circle>' +
            '<path d="M4.5 21a7.5 7.5 0 0 1 15 0"></path>' +
          '</svg>Profile' +
        '</a>' +
        '<a class="profile-menu__item" href="my-activity.html" role="menuitem"' +
          ' data-standalone-activity-link hidden>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M4 6h4M4 12h4M4 18h4"></path>' +
            '<path d="M11 6h9M11 12h9M11 18h5"></path>' +
          '</svg>My Activity' +
        '</a>' +
        '<a class="profile-menu__item" href="my-team.html" role="menuitem"' +
          ' data-standalone-team-link hidden>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<circle cx="9" cy="9" r="3"></circle>' +
            '<path d="M3.5 18a5.5 5.5 0 0 1 11 0"></path>' +
            '<circle cx="17" cy="10" r="2.2"></circle>' +
            '<path d="M15.5 18c.4-2 1.7-3.2 3.8-3.2"></path>' +
          '</svg>My Team' +
        '</a>' +
        '<a class="profile-menu__item" href="admin.html" role="menuitem"' +
          ' data-admin-portal-link hidden>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<rect x="3" y="11" width="18" height="11" rx="2"></rect>' +
            '<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>' +
          '</svg>Admin Portal' +
        '</a>' +
        '<button type="button" class="profile-menu__item profile-menu__item--danger"' +
          ' data-standalone-sign-out role="menuitem">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>' +
            '<polyline points="16 17 21 12 16 7"></polyline>' +
            '<line x1="21" y1="12" x2="9" y2="12"></line>' +
          '</svg>Sign out' +
        '</button>' +
      '</div>' +
      '<div data-notification-centre></div>' +
    '</div>';

  const menu = root.querySelector('[data-profile-menu]');
  const btn = menu.querySelector('.profile-menu__trigger');
  const popover = menu.querySelector('.profile-menu__popover');
  const activityLink = menu.querySelector('[data-standalone-activity-link]');
  const teamLink = menu.querySelector('[data-standalone-team-link]');
  const adminLink = menu.querySelector('[data-admin-portal-link]');
  const signOutBtn = menu.querySelector('[data-standalone-sign-out]');
  const ui = createProfileMenu({
    btn: btn,
    popover: popover,
    avatar: menu.querySelector('[data-profile-menu-avatar]'),
    nameEl: menu.querySelector('[data-profile-menu-name]'),
    emailEl: menu.querySelector('[data-profile-menu-email]')
  });

  const notificationCentre = mountNotificationCentre({
    root: menu.querySelector('[data-notification-centre]'),
    trigger: menu.querySelector('[data-notification-trigger]'),
    count: menu.querySelector('[data-notification-count]'),
    dot: menu.querySelector('[data-notification-dot]'),
    user: settings.user || null,
    profile: settings.profile || null,
    permissions: settings.permissions || null,
    // The panel takes the menu's place, and Back brings the menu back.
    onOpen: function() { ui.setOpen(false); },
    onBack: function() { ui.setOpen(true); }
  }) || { update: function() {}, setOpen: function() {} };

  activityLink.hidden = settings.showActivity !== true;
  teamLink.hidden = settings.showTeam !== true;
  adminLink.hidden = !hasAdminPanelAccess(settings.permissions);
  ui.update(settings.user || null, settings.profile || null);

  btn.addEventListener('click', function() {
    // Let the click reach the document so sibling header popovers can treat it
    // as an outside click and close themselves.
    ui.setOpen(popover.hidden);
    if (!popover.hidden) notificationCentre.setOpen(false);
  });
  popover.addEventListener('click', function(event) {
    // The Notifications item opens the panel rather than navigating, so it
    // stops its own event before this sees it.
    if (event.target.closest('[role="menuitem"]')) ui.setOpen(false);
  });
  document.addEventListener('click', function(event) {
    if (!menu.contains(event.target)) ui.setOpen(false);
  });
  document.addEventListener('keydown', function(event) {
    if (event.key !== 'Escape' || popover.hidden) return;
    ui.setOpen(false);
    btn.focus();
  });
  signOutBtn.addEventListener('click', async function() {
    if (typeof settings.onSignOut !== 'function') return;
    signOutBtn.disabled = true;
    try {
      await settings.onSignOut();
    } finally {
      signOutBtn.disabled = false;
    }
  });

  return Object.assign({}, ui, { notifications: notificationCentre });
}
