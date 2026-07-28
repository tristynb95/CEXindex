// ========== RECORDING A NOTIFICATION ==========
// The one place an event is written to the shared feed. Every page that changes
// something people should hear about calls through here: the dashboard's write
// helpers (js/auth.js), the bakery profile's notes (js/bakery-profile.js), and
// the admin portal's dataset and site directory saves (js/admin-page.js).
//
// Two rules this file exists to hold in one place:
//
//   1. **Recording a notification must never break the change it describes.**
//      Everything is best-effort — a rejected write (the rules have not been
//      deployed yet, the network dropped) is logged and swallowed. A colleague
//      not hearing about a check-in is a smaller failure than the check-in not
//      being saved.
//   2. The event is stamped with where it happened at write time — the bakery's
//      region and ops area as they stand now — because the people reading the
//      feed may not have the site directory loaded, and the row should still
//      read correctly a year later.
//
// The record shape and the delivery rule both live in js/notifications.js.
import { auth, db } from './firebase-config.js';
import { push, ref, set } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

function notificationsApi() {
  return window.GAILS && window.GAILS.Notifications;
}

// The name the notification is signed with. The profile name is preferred over
// the auth display name for the same reason the rest of the app prefers it: it
// is the one the person actually maintains.
function actorName() {
  var person = window.GAILS && window.GAILS.currentPerson;
  if (person && person.name) return person.name;
  var user = auth.currentUser;
  if (!user) return 'Someone';
  if (user.displayName) return user.displayName;
  var mentions = window.GAILS && window.GAILS.Mentions;
  var fromEmail = mentions && user.email ? mentions.nameFromEmail(user.email) : '';
  return fromEmail || user.email || 'Someone';
}

function placeOf(bakery) {
  var meta = window.GAILS && typeof window.GAILS.getBakeryMeta === 'function'
    ? window.GAILS.getBakeryMeta(bakery)
    : null;
  return { region: (meta && meta.r) || '', opsArea: (meta && meta.o) || '' };
}

// `payload` carries whatever the event type needs: bakery, subject, detail,
// entityId, and targetUids — the people it is personally about. The actor is
// filled in here and is never a target of their own action.
export async function recordNotification(type, payload) {
  try {
    var api = notificationsApi();
    if (!api || !auth.currentUser) return;

    var input = payload || {};
    var place = placeOf(input.bakery);
    var event = api.buildEvent(type, Object.assign({
      region: place.region,
      opsArea: place.opsArea
    }, input, {
      actorUid: auth.currentUser.uid,
      actorName: actorName(),
      at: Date.now()
    }));
    if (!event) return;

    await set(push(ref(db, 'notificationEvents')), event);
  } catch (error) {
    console.warn('Could not record a notification for this change:', error);
  }
}

// Everyone a follow-up task is about: the people it is assigned to, and the
// person who raised it. Used for both "you have a new task" and "the task you
// raised has been signed off" — the actor is filtered out inside buildEvent, so
// the same list serves both without the caller having to reason about who is
// clicking.
export function followUpTargets(task) {
  var record = task && typeof task === 'object' ? task : {};
  var mentions = window.GAILS && window.GAILS.Mentions;
  var assignees = mentions ? mentions.toAssigneeList(record.assignedTo) : [];
  return assignees.map(function (person) {
    return person.uid;
  }).concat([record.createdByUid]).filter(Boolean);
}
