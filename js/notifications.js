// ========== NOTIFICATIONS (shared) ==========
// What the bell in the header knows: which events exist, who each one is for,
// and how it reads.
//
// One shared feed, filtered per reader. Every event is written once to
// notificationEvents/{id} and every signed-in user reads the whole node —
// exactly how routineVisits, followUpActions and bakeryNotes already work.
// Nothing is fanned out per recipient, so a role change or a re-drawn ops area
// takes effect on the next render rather than needing thousands of copies
// rewritten. Delivery is therefore a *presentation* decision made here, on the
// reader's own device — same standing as the Bakery Reports ops-area
// restriction (js/visit-report.js), and not a security boundary.
//
// Read state lives at notificationReads/{uid}, which only that user can read or
// write: a `seenAt` watermark set when they open the panel, plus any events
// they have dismissed one at a time.
//
// Pure functions over plain objects — nothing here touches the database.
// js/notification-centre.js is the module that does.
window.GAILS = window.GAILS || {};

(function () {
  'use strict';

  // How much of the estate's activity somebody wants to hear about. The default
  // comes from their role (roles/{roleId}.notificationScope); a person can
  // narrow or widen it for themselves on their profile page
  // (users/{uid}.notificationScope), which then wins.
  //
  // The keys live here because delivery is decided here. Their labels and
  // descriptions live with the other role settings, in NOTIFICATION_SCOPES in
  // js/permissions.js — an ES module this classic script cannot import, and the
  // one the admin role editor and the profile page both read.
  var SCOPE_KEYS = ['all', 'area', 'none'];

  // 'area' is the default for a role that has never been given one: a new role
  // hears about its own work and its own patch, and an admin widens it
  // deliberately rather than everyone being opted into everything.
  var DEFAULT_SCOPE = 'area';

  function normalizeScope(value, fallback) {
    var key = String(value == null ? '' : value).trim().toLowerCase();
    if (SCOPE_KEYS.indexOf(key) !== -1) return key;
    return fallback === undefined ? DEFAULT_SCOPE : fallback;
  }

  // The scope actually in force for one person. An absent user setting means
  // "whatever my role says" rather than a value of its own, so changing the
  // role default moves everyone who has never expressed a preference.
  function resolveScope(roleScope, userScope) {
    var chosen = normalizeScope(userScope, '');
    return chosen || normalizeScope(roleScope);
  }

  // ── Event types ───────────────────────────────────────────────────────────
  // Two flags decide who an event can reach, on top of the reader's own scope:
  //
  //   personal    — it is about the reader rather than about a place, so it
  //                 finds them wherever the bakery is. "Your task was completed"
  //                 is not area news.
  //   estateWide  — it is about the whole estate, so it is nobody's area news
  //                 and everybody's news. An admin republishing the dataset
  //                 changes the numbers under every bakery at once.
  var TYPES = {
    'report.created': {
      icon: 'report',
      personal: false,
      title: function (event) { return event.actorName + ' logged a report'; },
      body: function (event) {
        return [event.subject, event.bakery].filter(Boolean).join(' · ');
      }
    },
    'task.assigned': {
      icon: 'task',
      personal: true,
      title: function (event, viewerUid) {
        return isTarget(event, viewerUid)
          ? event.actorName + ' assigned you a task'
          : event.actorName + ' added a task';
      },
      body: function (event) {
        return [event.subject, event.bakery].filter(Boolean).join(' · ');
      }
    },
    'task.completed': {
      icon: 'done',
      personal: true,
      title: function (event) { return event.actorName + ' completed a task'; },
      body: function (event) {
        return [event.subject, event.bakery].filter(Boolean).join(' · ');
      }
    },
    'note.added': {
      icon: 'note',
      personal: false,
      title: function (event) { return event.actorName + ' added a note'; },
      body: function (event) {
        return [event.bakery, event.subject].filter(Boolean).join(' · ');
      }
    },
    // Something an admin changed for everybody: a new customer experience
    // workbook, or a re-drawn site directory. `subject` says which.
    'data.updated': {
      icon: 'data',
      personal: false,
      estateWide: true,
      title: function (event) { return event.actorName + ' updated ' + (event.subject || 'the shared data'); },
      body: function (event) { return event.detail || ''; }
    }
  };

  var TYPE_KEYS = Object.keys(TYPES);

  function cleanText(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  function bakeryKey(value) {
    return cleanText(value).toLowerCase();
  }

  // A one-line label for a notification, short enough to sit in the panel.
  function summarize(value, limit) {
    var text = cleanText(value);
    var max = limit || 90;
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  // Targets are stored as a { uid: true } map because that is what the database
  // rules can check and what Realtime Database merges cleanly. Older or
  // hand-built records may carry a list instead.
  function targetUids(event) {
    var source = event && (event.targets || event.targetUids);
    if (!source) return [];
    if (Array.isArray(source)) return source.map(cleanText).filter(Boolean);
    if (typeof source !== 'object') return [];
    return Object.keys(source).filter(function (uid) { return source[uid] === true; });
  }

  function isTarget(event, uid) {
    var target = cleanText(uid);
    if (!target) return false;
    return targetUids(event).indexOf(target) !== -1;
  }

  // Builds the stored record. Everything a reader needs to decide delivery and
  // draw the row is stamped here, at write time: the feed is read by people who
  // may not have the site directory loaded, and an event should read the same
  // way a year later even if the bakery has since moved area.
  function buildEvent(type, payload) {
    var input = payload && typeof payload === 'object' ? payload : {};
    if (TYPE_KEYS.indexOf(type) === -1) return null;

    var actorUid = cleanText(input.actorUid);
    if (!actorUid) return null;

    var targets = {};
    (Array.isArray(input.targetUids) ? input.targetUids : []).forEach(function (uid) {
      var key = cleanText(uid);
      // Nobody is ever a target of their own action, so the actor never has to
      // be filtered out again downstream.
      if (key && key !== actorUid) targets[key] = true;
    });

    return {
      type: type,
      at: Number(input.at) || Date.now(),
      actorUid: actorUid,
      actorName: cleanText(input.actorName) || 'Someone',
      bakery: cleanText(input.bakery),
      region: cleanText(input.region),
      opsArea: cleanText(input.opsArea),
      subject: summarize(input.subject),
      detail: summarize(input.detail),
      entityId: cleanText(input.entityId),
      targets: targets
    };
  }

  // The reader, as delivery sees them: who they are, how much they asked for,
  // and which bakeries are theirs (js/patch.js resolves that list).
  function normalizeViewer(viewer) {
    var source = viewer && typeof viewer === 'object' ? viewer : {};
    var bakeries = {};
    (Array.isArray(source.bakeries) ? source.bakeries : []).forEach(function (name) {
      var key = bakeryKey(name);
      if (key) bakeries[key] = true;
    });
    var areas = {};
    (Array.isArray(source.opsAreas) ? source.opsAreas : []).forEach(function (name) {
      var key = bakeryKey(name);
      if (key) areas[key] = true;
    });
    var regions = {};
    (Array.isArray(source.regions) ? source.regions : []).forEach(function (name) {
      var key = bakeryKey(name);
      if (key) regions[key] = true;
    });
    return {
      uid: cleanText(source.uid),
      scope: normalizeScope(source.scope),
      bakeries: bakeries,
      opsAreas: areas,
      regions: regions
    };
  }

  // Whether an event happened somewhere this person looks after. The bakery is
  // the precise answer; the ops area and region stamped on the event are the
  // fallback for a site too new to be in the directory they hold.
  function inPatch(event, viewer) {
    if (event.bakery && viewer.bakeries[bakeryKey(event.bakery)]) return true;
    if (event.opsArea && viewer.opsAreas[bakeryKey(event.opsArea)]) return true;
    if (event.region && viewer.regions[bakeryKey(event.region)]) return true;
    return false;
  }

  // The whole delivery rule, in order:
  //
  //   - you are never told about your own action;
  //   - 'none' means none, including your own tasks — someone who has switched
  //     off has switched off;
  //   - anything naming you personally always reaches you: your task, or a task
  //     you raised being closed by somebody else;
  //   - an estate-wide change reaches everyone, because it is not one area's
  //     news to miss — the numbers under every bakery just moved;
  //   - 'all' takes the rest of the estate's activity too;
  //   - 'area' takes only activity at the bakeries you look after.
  function shouldDeliver(event, viewer) {
    var type = event && TYPES[event.type];
    if (!type) return false;
    var reader = normalizeViewer(viewer);
    if (!reader.uid) return false;
    if (cleanText(event.actorUid) === reader.uid) return false;
    if (reader.scope === 'none') return false;
    if (isTarget(event, reader.uid)) return true;
    if (type.estateWide) return true;
    if (reader.scope === 'all') return true;
    return inPatch(event, reader);
  }

  // ── Reading a stored feed ─────────────────────────────────────────────────

  function normalizeReads(reads) {
    var source = reads && typeof reads === 'object' ? reads : {};
    var dismissed = source.dismissed && typeof source.dismissed === 'object' ? source.dismissed : {};
    return { seenAt: Number(source.seenAt) || 0, dismissed: dismissed };
  }

  function isUnread(event, reads) {
    var state = normalizeReads(reads);
    if (state.dismissed[event.id] === true) return false;
    return (Number(event.at) || 0) > state.seenAt;
  }

  // Everything this person should see, newest first, each row already carrying
  // whether it is still unread. `maxAgeDays` keeps the panel to recent news
  // rather than the whole history of the feed.
  function visibleEvents(events, viewer, reads, options) {
    var settings = options || {};
    var source = events && typeof events === 'object' ? events : {};
    var list = Array.isArray(source)
      ? source.slice()
      : Object.keys(source).map(function (id) {
        return Object.assign({ id: id }, source[id]);
      });

    var oldest = settings.maxAgeDays
      ? (Number(settings.now) || Date.now()) - settings.maxAgeDays * 86400000
      : 0;

    var visible = list.filter(function (event) {
      if (!event || (Number(event.at) || 0) < oldest) return false;
      if (normalizeReads(reads).dismissed[event.id] === true) return false;
      return shouldDeliver(event, viewer);
    }).sort(function (a, b) {
      return (Number(b.at) || 0) - (Number(a.at) || 0);
    });

    if (settings.limit) visible = visible.slice(0, settings.limit);

    return visible.map(function (event) {
      return Object.assign({}, event, { unread: isUnread(event, reads) });
    });
  }

  function unreadCount(events, viewer, reads, options) {
    return visibleEvents(events, viewer, reads, options).filter(function (event) {
      return event.unread;
    }).length;
  }

  // ── Presentation ──────────────────────────────────────────────────────────

  function encodeQueryValue(value) {
    return encodeURIComponent(String(value == null ? '' : value)).replace(/'/g, '%27');
  }

  // Where the row takes you. A report opens its own report on the dashboard;
  // an estate-wide change opens the dashboard itself, since that is what
  // changed; everything else opens the bakery it happened at, which is where
  // its tasks and notes live.
  function eventHref(event) {
    if (!event) return '';
    if (event.type === 'report.created' && event.entityId) {
      return 'index.html?visit=' + encodeQueryValue(event.entityId) + '#visit-log';
    }
    if (event.type === 'data.updated') return 'index.html#overview';
    if (!event.bakery) return 'index.html#visit-log';
    return 'bakery-profile.html?bakery=' + encodeQueryValue(event.bakery) +
      '&from=' + encodeQueryValue('index.html#visit-log') +
      '&fromLabel=' + encodeQueryValue('Dashboard');
  }

  function describeEvent(event, viewerUid) {
    var type = event && TYPES[event.type];
    if (!type) return null;
    var record = Object.assign({}, event, { actorName: cleanText(event.actorName) || 'Someone' });
    return {
      icon: type.icon,
      title: type.title(record, viewerUid),
      body: type.body(record, viewerUid),
      href: eventHref(record),
      personal: !!type.personal && isTarget(record, viewerUid)
    };
  }

  // "3 minutes ago" — the panel's timestamps, which are all recent by design.
  function timeAgo(value, now) {
    var at = Number(value) || 0;
    var elapsed = Math.max(0, (Number(now) || Date.now()) - at);
    var minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return minutes + (minutes === 1 ? ' minute ago' : ' minutes ago');
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    var days = Math.floor(hours / 24);
    if (days < 7) return days + (days === 1 ? ' day ago' : ' days ago');
    var weeks = Math.floor(days / 7);
    if (weeks < 5) return weeks + (weeks === 1 ? ' week ago' : ' weeks ago');
    return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  window.GAILS.Notifications = {
    SCOPE_KEYS: SCOPE_KEYS,
    DEFAULT_SCOPE: DEFAULT_SCOPE,
    TYPES: TYPE_KEYS,
    normalizeScope: normalizeScope,
    resolveScope: resolveScope,
    buildEvent: buildEvent,
    targetUids: targetUids,
    isTarget: isTarget,
    shouldDeliver: shouldDeliver,
    normalizeReads: normalizeReads,
    isUnread: isUnread,
    visibleEvents: visibleEvents,
    unreadCount: unreadCount,
    describeEvent: describeEvent,
    eventHref: eventHref,
    timeAgo: timeAgo
  };
})();
