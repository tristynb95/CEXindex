const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const context = { window: {} };
vm.runInNewContext(read('js/notifications.js'), context);
const Notifications = context.window.GAILS.Notifications;

const rules = JSON.parse(read('database.rules.json'));
const authScript = read('js/auth.js');
const bakeryProfile = read('js/bakery-profile.js');
const adminScript = read('js/admin-page.js');
const centre = read('js/notification-centre.js');
const writer = read('js/notification-write.js');
const permissions = read('js/permissions.js');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// Bobby runs an ops area; Kate runs another; Rita covers the whole region.
const BOBBYS_BAKERIES = ['Henley', 'Marlow'];

function viewer(overrides) {
  return Object.assign({
    uid: 'bobby',
    scope: 'area',
    bakeries: BOBBYS_BAKERIES,
    opsAreas: ['Bobby Holmes'],
    regions: []
  }, overrides || {});
}

function event(overrides) {
  return Notifications.buildEvent(overrides.type || 'report.created', Object.assign({
    actorUid: 'kate',
    actorName: 'Kate Downes',
    bakery: 'Henley',
    region: 'North Region',
    opsArea: 'Bobby Holmes',
    subject: 'Check-in',
    entityId: 'v1'
  }, overrides));
}

// ── The record ────────────────────────────────────────────────────────────

test('every notification type in the brief has a builder', () => {
  assert.deepEqual(plain(Notifications.TYPES).sort(), [
    'data.updated', 'note.added', 'report.created', 'task.assigned', 'task.completed'
  ]);
});

test('an unknown type builds nothing, and so does an event with no actor', () => {
  assert.equal(Notifications.buildEvent('something.else', { actorUid: 'kate' }), null);
  assert.equal(Notifications.buildEvent('note.added', { actorName: 'Kate' }), null);
});

test('targets are stored as a map, and never include the actor', () => {
  const built = plain(event({ type: 'task.assigned', targetUids: ['bobby', 'kate', 'rita', ''] }));
  assert.deepEqual(built.targets, { bobby: true, rita: true });
  assert.equal(Notifications.isTarget(built, 'kate'), false);
  assert.deepEqual(plain(Notifications.targetUids(built)).sort(), ['bobby', 'rita']);
});

test('a hand-built record carrying a target list still reads', () => {
  assert.deepEqual(plain(Notifications.targetUids({ targetUids: ['a', 'b'] })).sort(), ['a', 'b']);
});

test('a long subject is trimmed so a row cannot run away with the panel', () => {
  const built = plain(event({ type: 'note.added', subject: 'x'.repeat(300) }));
  assert.ok(built.subject.length <= 90);
  assert.match(built.subject, /…$/);
});

// ── Who gets told ─────────────────────────────────────────────────────────

test('you are never told about your own action', () => {
  const mine = event({ actorUid: 'bobby', type: 'task.assigned', targetUids: ['bobby'] });
  assert.equal(Notifications.shouldDeliver(mine, viewer()), false);
});

test('"my area" takes activity at the bakeries they look after, and nothing else', () => {
  assert.equal(Notifications.shouldDeliver(event({ bakery: 'Henley' }), viewer()), true);
  assert.equal(Notifications.shouldDeliver(event({ bakery: 'Marlow' }), viewer()), true);
  assert.equal(
    Notifications.shouldDeliver(event({ bakery: 'Highgate', opsArea: 'Kate Downes' }), viewer()),
    false
  );
});

test('"everything" takes the whole estate', () => {
  const anywhere = event({ bakery: 'Highgate', opsArea: 'Kate Downes' });
  assert.equal(Notifications.shouldDeliver(anywhere, viewer({ scope: 'all' })), true);
});

test('there is no way to switch notifications off', () => {
  // The narrowest setting still delivers your own tasks — a task somebody
  // assigns you is not something you get to stop being told about.
  const mine = event({ type: 'task.assigned', bakery: 'Henley', targetUids: ['bobby'] });
  assert.equal(Notifications.shouldDeliver(mine, viewer({ scope: 'area' })), true);
  // A 'none' left on an old record reads as 'area' rather than silencing them.
  assert.equal(Notifications.shouldDeliver(mine, viewer({ scope: 'none' })), true);
  assert.equal(Notifications.normalizeScope('none'), 'area');
  assert.doesNotMatch(read('js/notifications.js'), /scope === 'none'/);
});

test('a task assigned to you reaches you wherever the bakery is', () => {
  const elsewhere = event({
    type: 'task.assigned',
    bakery: 'Highgate',
    opsArea: 'Kate Downes',
    targetUids: ['bobby']
  });
  assert.equal(Notifications.shouldDeliver(elsewhere, viewer()), true);
});

test('a task you raised reaching done tells you, wherever it was', () => {
  // followUpTargets puts the assignees *and* the person who raised it on the
  // event, so one record covers both halves of the brief.
  const signedOff = event({
    type: 'task.completed',
    bakery: 'Highgate',
    opsArea: 'Kate Downes',
    targetUids: ['bobby', 'rita']
  });
  assert.equal(Notifications.shouldDeliver(signedOff, viewer()), true);
  assert.equal(Notifications.shouldDeliver(signedOff, viewer({ uid: 'rita', bakeries: [] })), true);
  // Somebody with no stake in it and no claim on the bakery hears nothing.
  assert.equal(
    Notifications.shouldDeliver(signedOff, viewer({ uid: 'sam', bakeries: [], opsAreas: [] })),
    false
  );
});

test('an admin data update reaches everyone, because it is nobody\'s area news', () => {
  const dataUpdate = Notifications.buildEvent('data.updated', {
    actorUid: 'admin',
    actorName: 'Ada Admin',
    subject: 'the shared dataset',
    detail: '4,000 rows from Coffee Data.xlsx'
  });
  assert.equal(Notifications.shouldDeliver(dataUpdate, viewer()), true);
  assert.equal(Notifications.shouldDeliver(dataUpdate, viewer({ scope: 'all' })), true);
  // Except the person who did it.
  assert.equal(Notifications.shouldDeliver(dataUpdate, viewer({ uid: 'admin' })), false);
});

test('a bakery outside the patch still matches on the region a regional manager holds', () => {
  const regional = viewer({ uid: 'rita', bakeries: [], opsAreas: [], regions: ['North Region'] });
  assert.equal(Notifications.shouldDeliver(event({ bakery: 'Somewhere New' }), regional), true);
});

test('a signed-out reader is delivered nothing', () => {
  assert.equal(Notifications.shouldDeliver(event({}), viewer({ uid: '' })), false);
});

// ── Scope resolution ──────────────────────────────────────────────────────

test('a person\'s own choice beats their role, and no choice follows the role', () => {
  assert.equal(Notifications.resolveScope('all', 'area'), 'area');
  assert.equal(Notifications.resolveScope('all', ''), 'all');
  assert.equal(Notifications.resolveScope('area', undefined), 'area');
  // Nonsense in either position falls back rather than throwing the bell away.
  assert.equal(Notifications.resolveScope('nonsense', 'rubbish'), 'area');
});

test('a role that predates the bell still hears about its own patch', () => {
  assert.equal(Notifications.normalizeScope(undefined), 'area');
  assert.match(permissions, /export function normalizeNotificationScope/);
  assert.match(permissions, /NOTIFICATION_SCOPE_KEYS\.indexOf\(value\) === -1 \? 'area' : value/);
  // The keys live with the delivery rule; the labels live with the other role
  // settings. Both lists have to name the same two things.
  assert.deepEqual(plain(Notifications.SCOPE_KEYS), ['all', 'area']);
  ['all', 'area'].forEach((key) => {
    assert.match(permissions, new RegExp("key: '" + key + "'"));
  });
});

test('notifications are set by admins, not by the person receiving them', () => {
  // The role default and the per-person override both live in the admin
  // portal. The profile page carries no notification control at all.
  assert.match(read('admin.html'), /id="roleNotificationScope"/);
  assert.match(read('admin.html'), /id="userAccessNotifications"/);
  // profile.html still loads js/notifications.js — the bell in its own header
  // needs it — but carries no control over what that bell delivers.
  assert.doesNotMatch(read('profile.html'), /id="profileNotification/);
  assert.doesNotMatch(read('profile.html'), /id="notifications"/);
  assert.doesNotMatch(read('js/profile-page.js'), /otificationScope/);
  // And the panel no longer points people at a setting they cannot change.
  assert.doesNotMatch(centre, /profile\.html#notifications/);
});

test('the role default rides in the stored permission shape', () => {
  assert.match(permissions, /notificationScope: normalizeNotificationScope\(source\.notificationScope\)/);
  assert.match(permissions, /export function permissionsFromAccessGrid\(grid, teamScope, notificationScope\)/);
  // Admins hear everything by default; everyone else hears their own patch.
  assert.match(permissions, /admin: allAreas\('edit'\), teamScope: 'all', notificationScope: 'all'/);
  assert.match(permissions, /admin: allAreas\('none'\), teamScope: 'none', notificationScope: 'area'/);
});

// ── Reading the feed ──────────────────────────────────────────────────────

const FEED = {
  e1: plain(event({ bakery: 'Henley', at: 5000 })),
  e2: plain(event({ bakery: 'Marlow', at: 4000 })),
  e3: plain(event({ bakery: 'Highgate', opsArea: 'Kate Downes', at: 3000 })),
  e4: plain(event({ actorUid: 'bobby', bakery: 'Henley', at: 2000 }))
};

test('the panel lists only what is theirs, newest first', () => {
  const rows = plain(Notifications.visibleEvents(FEED, viewer(), {}));
  assert.deepEqual(rows.map((row) => row.id), ['e1', 'e2']);
});

test('everything newer than the watermark is unread', () => {
  const rows = plain(Notifications.visibleEvents(FEED, viewer(), { seenAt: 4500 }));
  assert.deepEqual(rows.map((row) => row.unread), [true, false]);
  assert.equal(Notifications.unreadCount(FEED, viewer(), { seenAt: 4500 }), 1);
  assert.equal(Notifications.unreadCount(FEED, viewer(), { seenAt: 9000 }), 0);
});

test('a dismissed event leaves the panel for good', () => {
  const rows = plain(Notifications.visibleEvents(FEED, viewer(), { dismissed: { e1: true } }));
  assert.deepEqual(rows.map((row) => row.id), ['e2']);
});

test('the panel is recent news, not the whole history', () => {
  const now = 40 * 86400000;
  const old = { stale: plain(event({ bakery: 'Henley', at: 1000 })) };
  assert.deepEqual(plain(Notifications.visibleEvents(old, viewer(), {}, { maxAgeDays: 30, now: now })), []);
  assert.equal(Notifications.visibleEvents(old, viewer(), {}, { now: now }).length, 1);
});

test('a limit caps how many rows are built', () => {
  assert.equal(Notifications.visibleEvents(FEED, viewer({ scope: 'all' }), {}, { limit: 2 }).length, 2);
});

test('read state survives a record that has never been written', () => {
  assert.deepEqual(plain(Notifications.normalizeReads(null)), { seenAt: 0, dismissed: {} });
});

// ── How a row reads ───────────────────────────────────────────────────────

test('each type says who did what, and links somewhere useful', () => {
  const report = Notifications.describeEvent(plain(event({})), 'bobby');
  assert.equal(report.title, 'Kate Downes logged a report');
  assert.match(report.body, /Check-in · Henley/);
  assert.equal(report.href, 'index.html?visit=v1#visit-log');

  const note = Notifications.describeEvent(plain(event({ type: 'note.added', subject: 'Grinder serviced' })), 'bobby');
  assert.equal(note.title, 'Kate Downes added a note');
  assert.match(note.href, /^bakery-profile\.html\?bakery=Henley/);

  const done = Notifications.describeEvent(
    plain(event({ type: 'task.completed', subject: 'Fix the grinder', targetUids: ['bobby'] })),
    'bobby'
  );
  assert.equal(done.title, 'Kate Downes completed a task');
  assert.equal(done.personal, true);

  const dataUpdate = Notifications.describeEvent(Notifications.buildEvent('data.updated', {
    actorUid: 'admin', actorName: 'Ada Admin', subject: 'the site directory', detail: '212 sites'
  }), 'bobby');
  assert.equal(dataUpdate.title, 'Ada Admin updated the site directory');
  assert.equal(dataUpdate.body, '212 sites');
  assert.equal(dataUpdate.href, 'index.html#overview');
});

test('a task assigned to you reads differently from one merely raised nearby', () => {
  const mine = plain(event({ type: 'task.assigned', targetUids: ['bobby'] }));
  assert.equal(Notifications.describeEvent(mine, 'bobby').title, 'Kate Downes assigned you a task');
  assert.equal(Notifications.describeEvent(mine, 'sam').title, 'Kate Downes added a task');
});

test('an event with no name on it still reads as somebody', () => {
  const anonymous = Notifications.buildEvent('note.added', { actorUid: 'ghost', bakery: 'Henley' });
  assert.equal(Notifications.describeEvent(anonymous, 'bobby').title, 'Someone added a note');
});

test('timestamps read in plain English', () => {
  const now = 1000000000;
  assert.equal(Notifications.timeAgo(now - 30000, now), 'Just now');
  assert.equal(Notifications.timeAgo(now - 60000, now), '1 minute ago');
  assert.equal(Notifications.timeAgo(now - 3600000, now), '1 hour ago');
  assert.equal(Notifications.timeAgo(now - 2 * 86400000, now), '2 days ago');
  assert.equal(Notifications.timeAgo(now - 8 * 86400000, now), '1 week ago');
});

// ── Wiring ────────────────────────────────────────────────────────────────

test('every event in the brief is recorded where it actually happens', () => {
  // A report logged on the dashboard, and a task raised or signed off there.
  assert.match(authScript, /recordNotification\('report\.created'/);
  assert.match(authScript, /recordNotification\('task\.assigned'/);
  assert.match(authScript, /recordNotification\('task\.completed'/);
  // Notes and tasks on the bakery profile, which writes to Firebase itself.
  assert.match(bakeryProfile, /recordNotification\('note\.added'/);
  assert.match(bakeryProfile, /recordNotification\('task\.assigned'/);
  assert.match(bakeryProfile, /recordNotification\('task\.completed'/);
  // And the admin side republishing the dataset or the site directory.
  assert.match(adminScript, /function announceDataUpdate\(subject, detail\)/);
  assert.match(adminScript, /announceDataUpdate\('the shared dataset'/);
  assert.match(adminScript, /announceDataUpdate\('the site directory'/);
  assert.match(authScript, /recordNotification\('data\.updated'/);
});

test('signing a task off tells the assignees and whoever raised it', () => {
  assert.match(writer, /export function followUpTargets\(task\)/);
  assert.match(writer, /\.concat\(\[record\.createdByUid\]\)/);
  // The stored record is read first, because only it knows who those people are.
  assert.match(authScript, /get\(ref\(db, 'followUpActions\/' \+ taskId\)\)/);
  assert.match(authScript, /targetUids: followUpTargets\(existing\)/);
  // Reopening is a correction, not news.
  assert.match(authScript, /if \(done && existing\)/);
});

test('recording a notification can never break the change it describes', () => {
  assert.match(writer, /try \{[\s\S]*?\} catch \(error\) \{[\s\S]*?console\.warn/);
  assert.match(writer, /Could not record a notification for this change/);
});

test('the panel is one shared feed read per person, capped server-side', () => {
  assert.match(centre, /orderByChild\('at'\), limitToLast\(FEED_LIMIT\)/);
  assert.match(centre, /ref\(db, 'notificationReads\/' \+ user\.uid\)/);
  // A refused read leaves the header working rather than breaking it.
  assert.match(centre, /console\.warn\('Could not load notifications:'/);
});

test('the bell lives in the profile card, not as a second header control', () => {
  ['index.html', 'admin.html'].forEach((page) => {
    const html = read(page);
    assert.match(html, /class="profile-menu__bell" data-notification-trigger/);
    assert.match(html, /data-notification-count/);
    assert.match(html, /data-notification-dot/);
    assert.match(html, /<div data-notification-centre><\/div>/);
    // The old standalone header button is gone.
    assert.doesNotMatch(html, /class="notification-bell"/);
  });
  // And the four standalone pages get the same control from one mount.
  const standalone = read('js/standalone-profile-menu.js');
  assert.match(standalone, /mountNotificationCentre\(\{/);
  assert.match(standalone, /data-notification-trigger/);
});

test('the bell is visible without JS having to reveal it', () => {
  // It lives inside the profile menu, which only exists for a signed-in user
  // anyway — so gating it on a second signal only creates a way for it to stay
  // invisible, which is exactly what happened once.
  const markup = ['index.html', 'admin.html'].map(read).concat(read('js/standalone-profile-menu.js'));
  markup.forEach((source) => {
    const bell = source.slice(source.indexOf('data-notification-trigger'));
    assert.doesNotMatch(bell.slice(0, bell.indexOf('>')), /\bhidden\b/);
  });
  assert.doesNotMatch(centre, /toggle\.hidden/);
  // The count and the closed-menu dot are still driven by the unread total.
  markup.forEach((source) => {
    assert.match(source, /data-notification-count hidden/);
    assert.match(source, /data-notification-dot hidden/);
  });
});

test('the bell outranks the header\'s blanket button rule', () => {
  // On the dashboard the bell and its panel render inside .header, and
  // `.header button` (0,1,1) beats a lone class. Left unscoped it imposes 16px
  // of side padding, which collapsed the 32px button's content box and shrank
  // the icon to nothing — a visible control with an invisible icon.
  const styles = read('css/styles.css');
  assert.match(styles, /^\.header button \{/m, 'the rule being defended against still exists');
  [
    'profile-menu__bell',
    'profile-menu__bell svg',
    'notification-panel__back',
    'notification-panel__clear'
  ].forEach((selector) => {
    const rule = new RegExp('^\\.(profile-menu|notification-panel) \\.' +
      selector.replace(/ /g, ' ') + ' [,{]', 'm');
    assert.match(styles, rule, selector + ' must carry a second class to win');
  });
  // And the icon must never be what gives way if the box is squeezed anyway.
  assert.match(styles, /\.profile-menu__bell svg \{[\s\S]*?flex: 0 0 18px/);
});

test('the pages ask for the stylesheet version that carries the bell', () => {
  // The stylesheet is cache-busted by an explicit version string, so shipping
  // new CSS without bumping it ships nothing — and a page left behind on an
  // older string ships stale CSS to that page alone. Pinning the literal here
  // only meant editing this test on every bump, so what is asserted is the
  // property that actually matters: one shared, present version.
  const pages = ['index.html', 'admin.html', 'bakery-profile.html', 'my-activity.html', 'my-team.html', 'profile.html'];
  const versions = pages.map((page) => {
    const match = /css\/styles\.css\?v=([^"']+)/.exec(read(page));
    assert.ok(match, page + ' must cache-bust the stylesheet');
    return match[1];
  });
  assert.equal(new Set(versions).size, 1, 'pages disagree on the stylesheet version: ' + versions.join(', '));
  assert.match(read('css/styles.css'), /\.profile-menu__bell \{/);
});

test('the mobile panel stays inside the viewport and scrolls only its feed', () => {
  const styles = read('css/styles.css');
  const marker = styles.indexOf('Keep the whole notification surface inside the usable mobile viewport');
  assert.notEqual(marker, -1);
  const mobileRules = styles.slice(marker, styles.indexOf('@media (max-width: 520px)', marker));
  assert.match(mobileRules, /\.notification-panel \{[\s\S]*?position: fixed/);
  assert.match(mobileRules, /top: var\(--notification-panel-top/);
  assert.match(mobileRules, /max-height: var\(--notification-panel-max-height/);
  assert.match(mobileRules, /overflow: hidden/);
  assert.match(mobileRules, /\.notification-panel__list \{[\s\S]*?min-height: 0;[\s\S]*?max-height: none;[\s\S]*?overflow-y: auto/);
  assert.match(centre, /function positionMobilePanel\(\)/);
  assert.match(centre, /getBoundingClientRect\(\)\.bottom/);
  assert.match(centre, /window\.visualViewport/);
  assert.match(centre, /--notification-panel-max-height/);
});

test('opening the panel replaces the profile menu, and Back brings it back', () => {
  assert.match(centre, /if \(typeof settings\.onOpen === 'function'\) settings\.onOpen\(\)/);
  assert.match(centre, /if \(typeof settings\.onBack === 'function'\) settings\.onBack\(\)/);
  [authScript, adminScript, read('js/standalone-profile-menu.js')].forEach((source) => {
    assert.match(source, /onOpen: function\(\) \{ ui\.setOpen\(false\); \}|onOpen: function\(\) \{ profileMenuUi\.setOpen\(false\); \}/);
  });
});

test('every page that shows the bell loads the two scripts behind it', () => {
  ['index.html', 'admin.html', 'bakery-profile.html', 'my-activity.html', 'my-team.html', 'profile.html']
    .forEach((page) => {
      const html = read(page);
      assert.match(html, /src="js\/patch\.js"/, page + ' patch');
      assert.match(html, /src="js\/notifications\.js"/, page + ' notifications');
    });
});

// ── Rules ─────────────────────────────────────────────────────────────────

test('the feed is readable by everyone and writable only as yourself', () => {
  const events = rules.rules.notificationEvents;
  assert.equal(events['.read'], 'auth != null');
  assert.deepEqual(events['.indexOn'], ['at']);
  const write = events.$eventId['.write'];
  // Create-only: an event cannot be edited into saying something else.
  assert.match(write, /!data\.exists\(\) && newData\.exists\(\) && newData\.child\('actorUid'\)\.val\(\) === auth\.uid/);
  // Deletes are an admin's job, for clearing the feed down.
  assert.match(write, /data\.exists\(\) && !newData\.exists\(\)/);
  assert.match(events.$eventId['.validate'], /newData\.child\('actorUid'\)\.val\(\) === auth\.uid/);
  assert.match(events.$eventId['.validate'], /newData\.hasChildren\(\['type', 'at', 'actorUid'\]\)/);
  assert.equal(events.$eventId.targets.$targetUid['.validate'], 'newData.val() === true');
});

test('read state is private to the person it belongs to', () => {
  const reads = rules.rules.notificationReads.$uid;
  assert.equal(reads['.read'], 'auth != null && auth.uid === $uid');
  assert.equal(reads['.write'], 'auth != null && auth.uid === $uid');
});
