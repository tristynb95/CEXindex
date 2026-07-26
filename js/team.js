// ========== REPORTING LINES (shared) ==========
// Who reports to whom, and therefore whose work a manager can see on My Team.
//
// The line is one field per person — users/{uid}.managerUid — and everything
// here is derived from it. There is no separate "team" record to keep in step,
// so moving someone between managers is a single write and the whole tree
// re-shapes itself.
//
// The tree is user-entered, so it is treated as untrusted: every walk is
// cycle-safe, and assignmentWouldCycle lets the admin portal refuse the write
// that would create a loop in the first place. A person who somehow ends up in
// a cycle is still listed exactly once.
//
// Pure functions over plain objects, deliberately: js/my-team.js reads the
// roster from Firebase and the admin portal reads it from its own user list,
// and both get the same answers. Nothing here reads or writes the database.
window.GAILS = window.GAILS || {};

(function () {
  'use strict';

  var G = window.GAILS;

  function cleanText(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  function normalizeEmail(value) {
    return cleanText(value).toLowerCase();
  }

  // Accepts either shape the roster arrives in: the admin portal's user list
  // ({ uid, firstName, lastName, … }) or a teamDirectory record
  // ({ name, email, managerUid, … }).
  function normalizePerson(uid, record) {
    var source = record && typeof record === 'object' ? record : {};
    var name = cleanText(source.name || [source.firstName, source.lastName].filter(Boolean).join(' '));
    return {
      uid: cleanText(uid || source.uid),
      name: name,
      email: normalizeEmail(source.email),
      managerUid: cleanText(source.managerUid),
      managerName: cleanText(source.managerName),
      roleId: cleanText(source.roleId || source.role) || 'viewer',
      roleName: cleanText(source.roleName),
      opsArea: cleanText(source.opsArea)
    };
  }

  // A directory object ({ uid: record }) or an array of records, either way out
  // as a sorted array. Entries without a uid cannot be placed in the tree.
  function normalizeRoster(people) {
    var records = [];
    if (Array.isArray(people)) {
      records = people.map(function (person) { return normalizePerson(person && person.uid, person); });
    } else if (people && typeof people === 'object') {
      records = Object.keys(people).map(function (uid) { return normalizePerson(uid, people[uid]); });
    }
    return records.filter(function (person) { return !!person.uid; }).sort(function (a, b) {
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
  }

  function byUid(roster) {
    var map = {};
    roster.forEach(function (person) { map[person.uid] = person; });
    return map;
  }

  function directReports(uid, people) {
    var target = cleanText(uid);
    if (!target) return [];
    return normalizeRoster(people).filter(function (person) {
      return person.managerUid === target && person.uid !== target;
    });
  }

  // Everyone below this person in the tree — their reports, and their reports'
  // reports, to any depth. Breadth-first so a direct report is always listed
  // before someone further down, and seen-guarded so a cycle terminates.
  function teamUnder(uid, people) {
    var roster = normalizeRoster(people);
    var root = cleanText(uid);
    if (!root) return [];

    var childrenOf = {};
    roster.forEach(function (person) {
      if (!person.managerUid || person.managerUid === person.uid) return;
      (childrenOf[person.managerUid] = childrenOf[person.managerUid] || []).push(person);
    });

    var collected = [];
    var seen = {};
    seen[root] = true;
    var queue = (childrenOf[root] || []).slice();
    while (queue.length) {
      var person = queue.shift();
      if (seen[person.uid]) continue;
      seen[person.uid] = true;
      collected.push(person);
      queue = queue.concat(childrenOf[person.uid] || []);
    }
    return collected;
  }

  // The line of managers above someone, nearest first. Cycle-safe for the same
  // reason as teamUnder.
  function managerChain(uid, people) {
    var map = byUid(normalizeRoster(people));
    var chain = [];
    var seen = {};
    var current = map[cleanText(uid)];
    seen[current ? current.uid : ''] = true;
    while (current && current.managerUid && !seen[current.managerUid]) {
      var manager = map[current.managerUid];
      if (!manager) break;
      seen[manager.uid] = true;
      chain.push(manager);
      current = manager;
    }
    return chain;
  }

  // Whether making managerUid the manager of uid would create a loop — either
  // directly (managing yourself) or because the proposed manager already sits
  // somewhere below this person.
  function assignmentWouldCycle(uid, managerUid, people) {
    var person = cleanText(uid);
    var manager = cleanText(managerUid);
    if (!person || !manager) return false;
    if (person === manager) return true;
    return teamUnder(person, people).some(function (report) { return report.uid === manager; });
  }

  // The roster a viewer is allowed to see on My Team, given their role's
  // teamScope. This mirrors what the database rules allow them to read; it is
  // the presentation half of the same decision, not the enforcement.
  //
  //   'all'    — everyone but themselves.
  //   'direct' — everyone below them in the tree.
  //   'none'   — nobody; the page is not theirs to open.
  function visibleTeam(viewerUid, scope, people) {
    var viewer = cleanText(viewerUid);
    if (scope === 'all') {
      return normalizeRoster(people).filter(function (person) { return person.uid !== viewer; });
    }
    if (scope === 'direct') return teamUnder(viewer, people);
    return [];
  }

  // The visible team flattened into display order, depth-first: each person is
  // followed by the people who report to them, then by their reports, to any
  // depth. A coffee manager sees each coffee partner followed by that partner's
  // own area head baristas, rather than one undifferentiated list.
  //
  // Each row carries:
  //   depth       — 0 for the viewer's own direct reports, 1 for theirs, …
  //   reportCount — people reporting straight to them
  //   teamSize    — everyone beneath them at any depth
  //
  // Both counts only ever include people the viewer can also see, so a total
  // never implies colleagues they have no visibility of.
  function teamRows(viewerUid, scope, people) {
    var members = visibleTeam(viewerUid, scope, people);
    var visible = {};
    members.forEach(function (person) { visible[person.uid] = true; });

    var childrenOf = {};
    members.forEach(function (person) {
      if (!person.managerUid || person.managerUid === person.uid) return;
      if (!visible[person.managerUid]) return;
      (childrenOf[person.managerUid] = childrenOf[person.managerUid] || []).push(person);
    });

    var rows = [];
    var seen = {};

    function walk(person, depth) {
      if (seen[person.uid]) return;
      seen[person.uid] = true;
      var children = childrenOf[person.uid] || [];
      var row = { person: person, depth: depth, reportCount: children.length, teamSize: 0 };
      rows.push(row);
      var before = rows.length;
      children.forEach(function (child) { walk(child, depth + 1); });
      row.teamSize = rows.length - before;
    }

    // Anyone whose own manager is outside the visible set sits at the top of
    // this view — for a 'direct' scope that is the viewer's own reports, and
    // for 'all' it is whoever has no manager on record.
    members.filter(function (person) {
      return !person.managerUid || !visible[person.managerUid] || person.managerUid === person.uid;
    }).forEach(function (person) { walk(person, 0); });

    // A cycle leaves people unreachable from any root; they are still theirs to
    // see, so they are listed rather than silently dropped.
    members.forEach(function (person) { walk(person, 0); });

    return rows;
  }

  // A person and everyone beneath them, for "show me this partner's whole
  // area" — the uid list a My Team selection filters on.
  function branchUids(uid, people) {
    var root = cleanText(uid);
    if (!root) return [];
    return [root].concat(teamUnder(root, people).map(function (person) {
      return person.uid;
    }));
  }

  // Every bakery owned by one or more people through the Region Coffee Team
  // mapping. UID attribution is authoritative; the saved display name/email
  // is only a backward-compatible fallback for assignments created before UIDs
  // were stored.
  function assignedBakeries(uids, people, assignments, bakeryMeta) {
    var wanted = {};
    (Array.isArray(uids) ? uids : [uids]).forEach(function(uid) {
      var key = cleanText(uid);
      if (key) wanted[key] = true;
    });
    if (!Object.keys(wanted).length) return [];

    var identities = normalizeRoster(people).filter(function(person) {
      return !!wanted[person.uid];
    }).map(function(person) {
      return {
        uid: person.uid,
        name: cleanText(person.name).toLowerCase(),
        email: normalizeEmail(person.email)
      };
    });

    function legacyLabelMatches(label) {
      var value = cleanText(label).toLowerCase();
      return !!value && identities.some(function(identity) {
        return value === identity.name || value === identity.email;
      });
    }

    var records = Array.isArray(assignments)
      ? assignments
      : Object.values(assignments && typeof assignments === 'object' ? assignments : {});
    var regions = {};
    records.forEach(function(record) {
      var source = record && typeof record === 'object' ? record : {};
      var region = cleanText(source.region);
      if (!region) return;
      var partnerUid = cleanText(source.coffeePartnerUid || source.partnerUid);
      var trainerUid = cleanText(source.coffeeTrainerUid || source.trainerUid);
      var partnerMatches = partnerUid
        ? !!wanted[partnerUid]
        : legacyLabelMatches(source.coffeePartner || source.partner);
      var trainerMatches = trainerUid
        ? !!wanted[trainerUid]
        : legacyLabelMatches(source.coffeeTrainer || source.trainer);
      if (partnerMatches || trainerMatches) regions[region.toLowerCase()] = true;
    });

    return Object.keys(bakeryMeta || {}).filter(function(bakery) {
      var entry = bakeryMeta[bakery] || {};
      return !!regions[cleanText(entry.r || entry.region).toLowerCase()];
    }).sort(function(a, b) {
      return a.localeCompare(b);
    });
  }

  // Splits each visit into one unit across the credited people in the current
  // comparison. A shared visit therefore contributes 0.5 + 0.5, never 2.
  // Roster participation counts can still show that both people attended.
  function contributionShares(records, uids) {
    var wanted = {};
    (Array.isArray(uids) ? uids : [uids]).forEach(function(uid) {
      var key = cleanText(uid);
      if (key) wanted[key] = true;
    });

    var totals = {};
    Object.keys(wanted).forEach(function(uid) { totals[uid] = 0; });

    (records || []).forEach(function(record) {
      var seen = {};
      var owners = (record && Array.isArray(record.owners) ? record.owners : [])
        .map(function(owner) { return cleanText(owner && owner.uid); })
        .filter(function(uid) {
          if (!uid || !wanted[uid] || seen[uid]) return false;
          seen[uid] = true;
          return true;
        });
      if (!owners.length) return;
      var share = 1 / owners.length;
      owners.forEach(function(uid) { totals[uid] += share; });
    });

    return totals;
  }

  G.Team = {
    normalizePerson: normalizePerson,
    normalizeRoster: normalizeRoster,
    directReports: directReports,
    teamUnder: teamUnder,
    managerChain: managerChain,
    assignmentWouldCycle: assignmentWouldCycle,
    visibleTeam: visibleTeam,
    teamRows: teamRows,
    branchUids: branchUids,
    assignedBakeries: assignedBakeries,
    contributionShares: contributionShares
  };
})();
