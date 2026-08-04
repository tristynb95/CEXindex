// ========== THE NOTIFICATION CENTRE ==========
// Notifications live inside the profile menu — a bell in the top-right of the
// card, carrying its own unread count, which opens the panel in place of the
// menu. The header itself stays as it is: one control, not two.
//
// Because the count is the reason to look, it also surfaces on the profile
// trigger as a dot, so an unread notification is visible without opening
// anything.
//
// The panel and its data are self-sufficient: give it somewhere to render and
// who is signed in, and it subscribes to everything else it needs — the shared
// event feed, this person's own read state, and the site directory that decides
// which bakeries count as theirs. That is what lets the same component serve the
// dashboard, the admin portal, and the four standalone pages without each of
// them growing its own copy of the wiring.
//
// The surrounding markup differs per page (the dashboard and the admin portal
// write their own; js/standalone-profile-menu.js generates its), so elements
// are injected by the caller rather than queried here — the same contract
// js/profile-menu.js uses, and for the same reason.
//
// What it does *not* decide is who sees what: that is js/notifications.js, and
// which bakeries a person looks after is js/patch.js.
import { auth, db } from './firebase-config.js';
import { onValue, query, limitToLast, orderByChild, ref, update } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { notificationScopeOf } from './permissions.js';

// The panel is a recent-news surface, not an archive: the feed keeps growing
// but nobody needs to scroll back through a quarter of it.
const FEED_LIMIT = 250;
const MAX_AGE_DAYS = 30;
const PANEL_LIMIT = 40;

const ICONS = {
  report: '<path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  task: '<path d="M4 6h4M4 12h4M4 18h4"/><path d="M11 6h9M11 12h9M11 18h5"/>',
  done: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  note: '<path d="M5 4h14v12l-4 4H5z"/><path d="M19 16h-4v4"/><path d="M8 9h8M8 13h5"/>',
  data: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'
};

function notificationsApi() {
  return window.GAILS && window.GAILS.Notifications;
}

function patchApi() {
  return window.GAILS && window.GAILS.Patch;
}

function escapeHtml(value) {
  if (window.GAILS && typeof window.GAILS.escapeHtml === 'function') return window.GAILS.escapeHtml(value);
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function icon(name) {
  return '<svg class="notification-item__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    (ICONS[name] || ICONS.report) + '</svg>';
}

// `options`:
//   root        — where the panel is rendered, inside the profile menu so it
//                 hangs from the same corner the menu does.
//   trigger     — the bell in the top-right of the profile card.
//   count       — the unread pill on that bell.
//   dot         — the unread marker on the profile trigger itself (optional).
//   onOpen      — called when the panel opens, so the host can close its menu.
//   user/profile/permissions — may arrive later through update(), because the
//                 dashboard builds its header before the profile has loaded.
export function mountNotificationCentre(options) {
  const settings = options || {};
  const root = settings.root;
  if (!root) return null;

  let user = null;
  let profile = null;
  let permissions = null;
  let events = {};
  let reads = {};
  let bakeryMeta = null;
  let open = false;
  let feedOff = null;
  let readsOff = null;
  let metaOff = null;

  root.innerHTML =
    '<div class="notification-panel" data-notification-panel role="dialog"' +
      ' aria-label="Notifications" hidden>' +
      '<div class="notification-panel__head">' +
        '<button type="button" class="notification-panel__back" data-notification-back' +
          ' aria-label="Back to the profile menu">' +
          '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
            '<path d="m12 4-6 6 6 6"/>' +
          '</svg>' +
        '</button>' +
        '<h2>Notifications</h2>' +
        '<button type="button" class="notification-panel__clear" data-notification-read-all hidden>' +
          'Mark all read</button>' +
      '</div>' +
      '<div class="notification-panel__list" data-notification-list></div>' +
    '</div>';

  const toggle = settings.trigger || null;
  const badge = settings.count || null;
  const dot = settings.dot || null;
  const panel = root.querySelector('[data-notification-panel]');
  const list = root.querySelector('[data-notification-list]');
  const readAllBtn = root.querySelector('[data-notification-read-all]');
  const backBtn = root.querySelector('[data-notification-back]');

  // ── Who is reading ──────────────────────────────────────────────────────
  function viewer() {
    const patch = patchApi();
    const resolved = patch
      ? patch.resolvePatch(profile && (profile.patch || profile.opsArea), bakeryMeta)
      : { opsAreas: [], regions: [], bakeries: [] };
    const api = notificationsApi();
    return {
      uid: (user && user.uid) || '',
      scope: api
        ? api.resolveScope(notificationScopeOf(permissions), profile && profile.notificationScope)
        : 'area',
      bakeries: resolved.bakeries,
      opsAreas: resolved.opsAreas.map(function (area) { return area.opsArea; }),
      regions: resolved.regions.map(function (region) { return region.region; })
    };
  }

  function rows() {
    const api = notificationsApi();
    if (!api || !user) return [];
    return api.visibleEvents(events, viewer(), reads, {
      maxAgeDays: MAX_AGE_DAYS,
      limit: PANEL_LIMIT
    });
  }

  // ── Rendering ───────────────────────────────────────────────────────────
  function renderBadge(unread) {
    if (badge) {
      badge.hidden = unread === 0;
      badge.textContent = unread > 9 ? '9+' : String(unread);
    }
    // The dot on the profile trigger is the only part visible with the menu
    // closed, so it carries the count for screen readers too.
    if (dot) {
      dot.hidden = unread === 0;
      dot.setAttribute('aria-label', unread === 1
        ? '1 unread notification'
        : unread + ' unread notifications');
    }
  }

  // An empty panel should say *why* it is empty. "My area" with no bakeries
  // assigned is quiet by design, and someone whose bell never rings deserves to
  // know that rather than assume it is broken.
  function emptyMessage(reader) {
    if (reader.scope === 'area' && !reader.bakeries.length) {
      return 'Nothing here yet. You are set to hear about your own bakeries, but none are assigned to you — ' +
        'so for now you will only see your own tasks.';
    }
    return 'Nothing here yet. Reports, tasks and notes from the rest of the team will show up here.';
  }

  function renderList(visible) {
    if (!list) return;
    const api = notificationsApi();
    if (!visible.length) {
      list.innerHTML = '<p class="notification-panel__empty">' +
        escapeHtml(emptyMessage(viewer())) + '</p>';
      return;
    }
    const now = Date.now();
    list.innerHTML = visible.map(function (event) {
      const described = api.describeEvent(event, user.uid);
      if (!described) return '';
      return '<a class="notification-item' + (event.unread ? ' notification-item--unread' : '') +
        (described.personal ? ' notification-item--personal' : '') +
        '" href="' + escapeHtml(described.href) + '" data-notification-id="' + escapeHtml(event.id) + '">' +
        icon(described.icon) +
        '<span class="notification-item__body">' +
          '<span class="notification-item__title">' + escapeHtml(described.title) + '</span>' +
          (described.body
            ? '<span class="notification-item__detail">' + escapeHtml(described.body) + '</span>'
            : '') +
          '<span class="notification-item__time">' + escapeHtml(api.timeAgo(event.at, now)) + '</span>' +
        '</span>' +
      '</a>';
    }).join('');
  }

  function render() {
    const visible = rows();
    const unread = visible.filter(function (event) { return event.unread; }).length;
    renderBadge(unread);
    if (readAllBtn) readAllBtn.hidden = unread === 0;
    if (open) renderList(visible);
  }

  // ── Read state ──────────────────────────────────────────────────────────
  // One watermark rather than a flag per event: opening the panel is the act of
  // reading what is in it, and that is a single small write however many rows
  // were showing.
  function markAllRead() {
    if (!user) return;
    const seenAt = Date.now();
    reads = Object.assign({}, reads, { seenAt: seenAt });
    render();
    update(ref(db, 'notificationReads/' + user.uid), { seenAt: seenAt }).catch(function (error) {
      console.warn('Could not save which notifications you have read:', error);
    });
  }

  // ── Opening and closing ─────────────────────────────────────────────────
  // Fixed-position mobile panels need their own viewport bounds: the account
  // trigger sits at a different height in each page header, and mobile browser
  // chrome can change the usable height while the panel is open.
  function positionMobilePanel() {
    if (!panel || typeof window.matchMedia !== 'function' ||
        !window.matchMedia('(max-width: 640px)').matches) {
      if (panel) {
        panel.style.removeProperty('--notification-panel-top');
        panel.style.removeProperty('--notification-panel-max-height');
      }
      return;
    }

    const menu = root.closest('[data-profile-menu]');
    const anchor = menu && menu.querySelector('.profile-menu__trigger');
    const anchorElement = anchor || toggle;
    const viewport = window.visualViewport;
    const viewportTop = viewport ? viewport.offsetTop : 0;
    const viewportHeight = viewport ? viewport.height : window.innerHeight;
    const anchorBottom = anchorElement
      ? anchorElement.getBoundingClientRect().bottom
      : viewportTop + 52;
    const top = Math.max(viewportTop + 8, Math.ceil(anchorBottom + 8));
    const availableHeight = Math.max(0, Math.floor(
      viewportTop + viewportHeight - top - 10
    ));

    panel.style.setProperty('--notification-panel-top', top + 'px');
    panel.style.setProperty('--notification-panel-max-height', availableHeight + 'px');
  }

  function setOpen(next) {
    open = !!next && !!user;
    if (open) positionMobilePanel();
    if (panel) panel.hidden = !open;
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) return;
    // The panel takes the profile menu's place rather than sitting on top of
    // it, so the host is told to close the menu behind it.
    if (typeof settings.onOpen === 'function') settings.onOpen();
    renderList(rows());
  }

  if (toggle) {
    toggle.addEventListener('click', function (event) {
      // The bell sits inside the profile popover, whose own handlers would
      // otherwise treat this click as choosing an entry and close everything.
      event.preventDefault();
      event.stopPropagation();
      setOpen(panel.hidden);
    });
  }

  if (readAllBtn) {
    readAllBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      markAllRead();
    });
  }

  // Back to the profile menu the panel replaced.
  if (backBtn) {
    backBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      setOpen(false);
      if (typeof settings.onBack === 'function') settings.onBack();
    });
  }

  if (panel) {
    panel.addEventListener('click', function (event) {
      // A row is a link, so following it leaves the page — but everything in
      // the panel was on screen when it was clicked, so it has all been read.
      if (event.target.closest('[data-notification-id]')) markAllRead();
      else event.stopPropagation();
    });
  }

  document.addEventListener('click', function (event) {
    if (!root.contains(event.target) && !(toggle && toggle.contains(event.target))) setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !open) return;
    setOpen(false);
    if (toggle) toggle.focus();
  });

  function handleViewportChange() {
    if (open) positionMobilePanel();
  }

  window.addEventListener('resize', handleViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportChange);
  }

  // ── Subscriptions ───────────────────────────────────────────────────────
  function unsubscribe() {
    [feedOff, readsOff, metaOff].forEach(function (off) {
      if (typeof off === 'function') off();
    });
    feedOff = readsOff = metaOff = null;
  }

  function subscribe() {
    unsubscribe();
    if (!user) return;

    // Ordered and capped server-side: the feed is shared by everyone, so a
    // reader should never pull the whole history down to show 40 rows.
    feedOff = onValue(
      query(ref(db, 'notificationEvents'), orderByChild('at'), limitToLast(FEED_LIMIT)),
      function (snapshot) {
        events = snapshot.exists() ? snapshot.val() : {};
        render();
      },
      function (error) {
        // A refused read leaves the bell empty rather than breaking the header.
        console.warn('Could not load notifications:', error);
        events = {};
        render();
      }
    );

    readsOff = onValue(ref(db, 'notificationReads/' + user.uid), function (snapshot) {
      reads = snapshot.exists() ? snapshot.val() : {};
      render();
    }, function (error) {
      console.warn('Could not load your notification read state:', error);
    });

    metaOff = onValue(ref(db, 'portalData/siteMeta'), function (snapshot) {
      const payload = snapshot.exists() ? snapshot.val() : null;
      const entries = payload && payload.entries && typeof payload.entries === 'object'
        ? payload.entries
        : payload;
      bakeryMeta = entries && typeof entries === 'object' ? entries : null;
      // Every page that loads js/config.js already has a directory to fall back
      // on, which is what makes the bell work before this arrives.
      if (!bakeryMeta && window.GAILS) bakeryMeta = window.GAILS.BAKERY_META || null;
      render();
    }, function (error) {
      console.warn('Could not load the site directory for notifications:', error);
      if (window.GAILS) bakeryMeta = window.GAILS.BAKERY_META || null;
      render();
    });
  }

  // Passing a null user resets the bell to its signed-out state, the same
  // contract createProfileMenu uses.
  function updateViewer(nextUser, nextProfile, nextPermissions) {
    const changedUser = (nextUser && nextUser.uid) !== (user && user.uid);
    user = nextUser || null;
    profile = nextProfile || null;
    permissions = nextPermissions || null;
    // The bell is not hidden when signed out: it lives inside the profile menu,
    // which only exists for a signed-in user in the first place. Gating it on a
    // second signal only creates a way for it to stay invisible.
    if (!user) {
      unsubscribe();
      events = {};
      reads = {};
      setOpen(false);
    } else if (changedUser) {
      subscribe();
    }
    render();
  }

  if (!bakeryMeta && window.GAILS) bakeryMeta = window.GAILS.BAKERY_META || null;
  updateViewer(settings.user || auth.currentUser || null, settings.profile, settings.permissions);

  return {
    update: updateViewer,
    setOpen: setOpen,
    destroy: function () {
      unsubscribe();
      window.removeEventListener('resize', handleViewportChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
      }
      root.innerHTML = '';
    }
  };
}
