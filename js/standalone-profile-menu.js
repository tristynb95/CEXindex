import { createProfileMenu } from './profile-menu.js';

// Mounts the dashboard account menu in standalone page headers. Keeping the
// markup and interaction here means Profile, Bakery Profile, My Activity, and
// My Team cannot drift into four slightly different versions of the control.
export function mountStandaloneProfileMenu(options) {
  const settings = options || {};
  const root = settings.root || document.querySelector('[data-standalone-account-menu]');
  if (!root) return null;

  root.innerHTML =
    '<div class="profile-menu standalone-profile-menu" data-profile-menu>' +
      '<button type="button" class="profile-menu__trigger standalone-profile-menu__trigger"' +
        ' aria-label="Open profile menu" aria-haspopup="menu" aria-expanded="false">' +
        '<span class="profile-menu__avatar" data-profile-menu-avatar aria-hidden="true">P</span>' +
        '<span class="standalone-profile-menu__label">Profile</span>' +
        '<svg class="profile-menu__chevron" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
          '<path d="m6 8 4 4 4-4"></path>' +
        '</svg>' +
      '</button>' +
      '<div class="profile-menu__popover" role="menu" hidden>' +
        '<div class="profile-menu__identity">' +
          '<span data-profile-menu-name>Your profile</span>' +
          '<small data-profile-menu-email></small>' +
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
        '<button type="button" class="profile-menu__item profile-menu__item--danger"' +
          ' data-standalone-sign-out role="menuitem">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>' +
            '<polyline points="16 17 21 12 16 7"></polyline>' +
            '<line x1="21" y1="12" x2="9" y2="12"></line>' +
          '</svg>Sign out' +
        '</button>' +
      '</div>' +
    '</div>';

  const menu = root.querySelector('[data-profile-menu]');
  const btn = menu.querySelector('.profile-menu__trigger');
  const popover = menu.querySelector('.profile-menu__popover');
  const activityLink = menu.querySelector('[data-standalone-activity-link]');
  const teamLink = menu.querySelector('[data-standalone-team-link]');
  const signOutBtn = menu.querySelector('[data-standalone-sign-out]');
  const ui = createProfileMenu({
    btn: btn,
    popover: popover,
    avatar: menu.querySelector('[data-profile-menu-avatar]'),
    nameEl: menu.querySelector('[data-profile-menu-name]'),
    emailEl: menu.querySelector('[data-profile-menu-email]')
  });

  activityLink.hidden = settings.showActivity !== true;
  teamLink.hidden = settings.showTeam !== true;
  ui.update(settings.user || null, settings.profile || null);

  btn.addEventListener('click', function() {
    // Let the click reach the document so sibling header popovers can treat it
    // as an outside click and close themselves.
    ui.setOpen(popover.hidden);
  });
  popover.addEventListener('click', function(event) {
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

  return ui;
}
