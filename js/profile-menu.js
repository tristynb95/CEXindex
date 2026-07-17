// ========== HEADER PROFILE MENU ==========
// The avatar/name/email popover in the page header, shared by the dashboard
// (js/auth.js) and the admin page (js/admin-page.js).
//
// The two pages use different element IDs for the same widget (profileMenuBtn
// vs adminProfileMenuBtn, and so on), so elements are injected by the caller
// rather than queried here.

// Initials from a first/last name, falling back to the first character of
// `fallback` (a display name or email) and finally to "P".
export function profileInitials(firstName, lastName, fallback) {
  const initials = [firstName, lastName]
    .map(function(part) { return String(part || '').trim().charAt(0); })
    .join('')
    .toUpperCase();
  return initials || String(fallback || 'P').trim().charAt(0).toUpperCase() || 'P';
}

// `elements` is { btn, popover, avatar, nameEl, emailEl }; any may be absent,
// in which case that part is skipped.
export function createProfileMenu(elements) {
  const els = elements || {};

  function setOpen(open) {
    if (!els.btn || !els.popover) return;
    els.btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    els.popover.hidden = !open;
  }

  // Passing a null user resets the menu to its signed-out state and closes it
  // — js/auth.js does this on sign-out.
  function update(user, profile) {
    if (!user) {
      if (els.avatar) els.avatar.textContent = 'P';
      if (els.nameEl) els.nameEl.textContent = 'Your profile';
      if (els.emailEl) els.emailEl.textContent = '';
      setOpen(false);
      return;
    }

    const data = profile || {};
    const firstName = String(data.firstName || '').trim();
    const lastName = String(data.lastName || '').trim();
    const storedName = [firstName, lastName].filter(Boolean).join(' ');
    const displayName = storedName || user.displayName || 'Your profile';
    const emailText = user.email || data.email || '';

    if (els.avatar) els.avatar.textContent = profileInitials(firstName, lastName, displayName || emailText);
    if (els.nameEl) els.nameEl.textContent = displayName;
    if (els.emailEl) els.emailEl.textContent = emailText;
  }

  return { setOpen: setOpen, update: update };
}
