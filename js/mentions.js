// ========== @MENTIONS (shared) ==========
// A visit's Coffee Partner field can name the person the visit belongs to by
// typing "@" and their name. The "@" is a typing affordance, not something
// anyone should have to read: stored text keeps it, but every rendered surface
// shows the bare name, underlined and in blue. The "@" only reappears when the
// field is being edited (see js/mention-field.js).
//
// Loaded as a plain <script> by every page that renders a Coffee Partner:
// index.html, admin.html, bakery-profile.html, and my-activity.html.
//
// The stored text is the human-editable form ("@Sam Partner"), which is why
// parsing it back out needs a directory to be exact. The *authoritative* record
// of who a visit was assigned to is the separate `assignedTo` object on the
// visit ({ uid, name, email }) — this parser only drives presentation, so a
// directory miss softens the styling rather than losing the assignment.
window.GAILS = window.GAILS || {};

(function () {
  'use strict';

  var G = window.GAILS;

  // uid -> person, plus a normalized-name index for directory-free lookups.
  var peopleByUid = {};
  var peopleByName = {};

  function escapeHtml(value) {
    if (typeof G.escapeHtml === 'function') return G.escapeHtml(value);
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cleanName(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  // Punctuation and case are stripped so "O'Brien" typed into a form still
  // matches "OBrien" in the directory. Matches normalizeName in
  // js/my-activity.js, which decides whose activity a visit belongs to.
  function normalizeName(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeEmail(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  // People arrive from several places at different times (the shared directory,
  // the region coffee-team assignments, names already on past visits), so this
  // merges rather than replaces. A later entry only overwrites an earlier one
  // where it actually adds something — a harvested name must not blank out the
  // uid and email a directory entry supplied.
  function addPeople(list) {
    (list || []).forEach(function (entry) {
      if (!entry) return;
      var name = cleanName(entry.name);
      if (!name) return;

      var key = normalizeName(name);
      if (!key) return;

      var existing = peopleByName[key] || null;
      var person = {
        uid: entry.uid || (existing && existing.uid) || '',
        name: name,
        email: normalizeEmail(entry.email) || (existing && existing.email) || ''
      };

      peopleByName[key] = person;
      if (person.uid) peopleByUid[person.uid] = person;
    });
    return getPeople();
  }

  function setPeople(list) {
    peopleByUid = {};
    peopleByName = {};
    return addPeople(list);
  }

  function getPeople() {
    return Object.keys(peopleByName)
      .map(function (key) { return peopleByName[key]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function findPerson(name) {
    var key = normalizeName(name);
    return (key && peopleByName[key]) || null;
  }

  function findPersonByUid(uid) {
    return (uid && peopleByUid[uid]) || null;
  }

  // Directory names are tried longest-first so "@Sam Partner-Jones" doesn't stop
  // at "Sam Partner". The match must end on a word boundary, or "@Jo" would
  // swallow the start of "@Joanne".
  function matchKnownName(rest) {
    var best = '';
    Object.keys(peopleByName).forEach(function (key) {
      var candidate = peopleByName[key].name;
      if (candidate.length <= best.length) return;
      var head = rest.slice(0, candidate.length);
      if (normalizeName(head) !== normalizeName(candidate)) return;
      var next = rest.charAt(candidate.length);
      if (next && /[\p{L}\p{N}]/u.test(next)) return;
      best = head;
    });
    return best;
  }

  // Used when the directory has not loaded, or names someone who isn't in it.
  // Two words is the deliberate ceiling: "@Sam Partner and Jo" must mention Sam
  // and leave "and Jo" as ordinary text.
  var FALLBACK_NAME = /^[\p{L}\p{N}][-\p{L}\p{N}'’.]*(?:[ ][\p{L}\p{N}][-\p{L}\p{N}'’.]*)?/u;

  function matchFallbackName(rest) {
    var match = rest.match(FALLBACK_NAME);
    return match ? match[0] : '';
  }

  // Splits stored text into ordered { type: 'text' | 'mention' } segments.
  // Every segment's `text` concatenated back together (with the '@' re-added on
  // mentions) reproduces the input exactly, which is what lets the editor and
  // the rendered view stay in step.
  function parse(raw) {
    var text = String(raw == null ? '' : raw);
    var segments = [];
    var index = 0;

    function pushText(value) {
      if (!value) return;
      var last = segments[segments.length - 1];
      if (last && last.type === 'text') last.text += value;
      else segments.push({ type: 'text', text: value });
    }

    while (index < text.length) {
      var at = text.indexOf('@', index);
      if (at === -1) {
        pushText(text.slice(index));
        break;
      }
      pushText(text.slice(index, at));

      var rest = text.slice(at + 1);
      var name = matchKnownName(rest) || matchFallbackName(rest);
      if (!name) {
        // A bare "@" (or one followed by punctuation) is just a character.
        pushText('@');
        index = at + 1;
        continue;
      }

      segments.push({ type: 'mention', text: name, person: findPerson(name) });
      index = at + 1 + name.length;
    }

    return segments;
  }

  // The reading form: mentions lose their "@" and nothing else changes. This is
  // what belongs in an exported spreadsheet cell and any plain-text context.
  function toText(raw) {
    return parse(raw).map(function (segment) { return segment.text; }).join('');
  }

  // The rendered form, already escaped. Mentions carry .mention so they read as
  // blue underlined names wherever a Coffee Partner is shown.
  function toHtml(raw) {
    return parse(raw).map(function (segment) {
      if (segment.type !== 'mention') return escapeHtml(segment.text);
      var title = segment.person && segment.person.email
        ? ' title="' + escapeHtml(segment.person.email) + '"'
        : '';
      return '<span class="mention"' + title + '>' + escapeHtml(segment.text) + '</span>';
    }).join('');
  }

  function hasMention(raw) {
    return parse(raw).some(function (segment) { return segment.type === 'mention'; });
  }

  // Everyone a visit is assigned to, in the order they were mentioned. A field
  // can name a pair covering the visit together ("@Jamie + @Tristen"), so this
  // is always a list. Only a mention counts — a name typed without "@" stays a
  // plain label, which is what keeps every pre-existing visit unassigned.
  function resolveAssignees(raw) {
    var seen = {};
    var people = [];
    parse(raw).forEach(function (segment) {
      if (segment.type !== 'mention') return;
      var person = segment.person || findPerson(segment.text);
      var resolved = {
        uid: (person && person.uid) || '',
        name: (person && person.name) || segment.text,
        email: (person && person.email) || ''
      };
      // The same person named twice is one assignee.
      var key = resolved.uid || normalizeName(resolved.name);
      if (!key || seen[key]) return;
      seen[key] = true;
      people.push(resolved);
    });
    return people;
  }

  // Matches a bare reference — a printed auditor name, a form respondent's
  // email — against the directory. This is what lets records the app did not
  // author (a CQV PDF, a Google Form visit) attribute themselves to a real
  // person without anyone typing an "@".
  function resolvePerson(reference) {
    var value = String(reference == null ? '' : reference).trim();
    if (!value) return null;

    if (value.indexOf('@') !== -1 && value.indexOf(' ') === -1) {
      var email = normalizeEmail(value);
      var byEmail = getPeople().find(function (person) { return person.email === email; });
      if (byEmail) return byEmail;
      return null;
    }
    return findPerson(value);
  }

  // Normalizes however an assignment was stored — a list, a single object from
  // before multiple assignees existed, or nothing at all.
  function toAssigneeList(value) {
    if (!value) return [];
    var list = Array.isArray(value) ? value : [value];
    return list.filter(function (entry) {
      return entry && String(entry.name || '').trim();
    }).map(function (entry) {
      return {
        uid: entry.uid || '',
        name: cleanName(entry.name),
        email: normalizeEmail(entry.email)
      };
    });
  }

  // The "@…" the caret currently sits in, if any — what the suggestion menu
  // filters on. Returns null once the query grows past a plausible name, so a
  // sentence containing an email address doesn't hold the menu open.
  function activeMentionAt(raw, caret) {
    var text = String(raw == null ? '' : raw);
    var position = Math.max(0, Math.min(Number(caret) || 0, text.length));

    for (var i = position - 1; i >= 0; i--) {
      var char = text.charAt(i);
      if (char === '@') {
        var before = i > 0 ? text.charAt(i - 1) : '';
        // "sam@gails.co.uk" is an email address, not a mention.
        if (before && /[\p{L}\p{N}]/u.test(before)) return null;
        var query = text.slice(i + 1, position);
        if (/[\n\t]/.test(query)) return null;
        if (query.split(' ').length > 3) return null;
        return { start: i, end: position, query: query };
      }
      if (char === '\n' || char === '\t') return null;
      // Give up after two words — a mention query is a name, not a sentence.
      if (position - i > 40) return null;
    }
    return null;
  }

  // Replaces the active "@query" with the chosen name and reports where the
  // caret should land, so the editor can carry on typing after it.
  function applyMention(raw, range, name) {
    var text = String(raw == null ? '' : raw);
    var chosen = cleanName(name);
    var inserted = '@' + chosen;
    var value = text.slice(0, range.start) + inserted + text.slice(range.end);
    return { value: value, caret: range.start + inserted.length };
  }

  // Names already visible in data every signed-in user can read. This is what
  // makes the picker useful without the shared directory: the region coffee-team
  // assignments are the curated list of who does these visits, and past visits
  // and notes cover anyone who has actually been named on one. Harvested entries
  // carry no uid, so a directory entry for the same person always wins (see
  // addPeople) — they are a name pool, not an identity source.
  function addHarvested(sources) {
    var input = sources || {};
    var harvested = [];

    (input.regionAssignments || []).forEach(function (assignment) {
      if (!assignment) return;
      harvested.push({ name: assignment.coffeePartner });
      harvested.push({ name: assignment.coffeeTrainer });
    });

    var visits = input.visits || {};
    Object.keys(visits).forEach(function (id) {
      var visit = visits[id];
      if (!visit) return;
      // Stored Coffee Partner text may itself contain a mention, so the name is
      // taken from its reading form rather than raw.
      harvested.push({ name: toText(visit.coffeePartner) });
      harvested.push({ name: visit.auditorName });
      toAssigneeList(visit.assignedTo).forEach(function (person) { harvested.push(person); });
    });

    (input.notes || []).forEach(function (note) {
      if (note && note.createdBy && typeof note.createdBy === 'object') harvested.push(note.createdBy);
    });

    // A one-word entry is kept out: the picker offering a bare "Sam" would
    // assign visits to whichever Sam the directory happens to resolve first.
    return addPeople(harvested.filter(function (entry) {
      return entry && cleanName(entry.name).indexOf(' ') !== -1;
    }));
  }

  // Ranked so typing a surname finds the person: a match at the start of any
  // word ("@partner" -> "Sam Partner") beats one buried mid-word ("@partner" ->
  // "Ada Partnership"), which would otherwise win on alphabetical order alone.
  function search(query, limit) {
    var normalized = normalizeName(query);
    var people = getPeople();
    if (!normalized) return people.slice(0, limit || 8);

    function rank(person) {
      var key = normalizeName(person.name);
      if (key.indexOf(normalized) === 0) return 0;
      var words = key.split(' ');
      // A whole word beats a word that merely starts the same way, so
      // "@partner" offers Sam Partner before Ada Partnership.
      if (words.indexOf(normalized) !== -1) return 1;
      if (words.some(function (word) { return word.indexOf(normalized) === 0; })) return 2;
      if (key.indexOf(normalized) !== -1) return 3;
      if (person.email && person.email.indexOf(normalized) === 0) return 4;
      return -1;
    }

    return people
      .map(function (person) { return { person: person, rank: rank(person) }; })
      .filter(function (entry) { return entry.rank >= 0; })
      // getPeople() is already alphabetical, so a stable sort on rank alone
      // keeps equally-good matches in name order.
      .sort(function (a, b) { return a.rank - b.rank; })
      .map(function (entry) { return entry.person; })
      .slice(0, limit || 8);
  }

  G.Mentions = {
    setPeople: setPeople,
    addPeople: addPeople,
    addHarvested: addHarvested,
    getPeople: getPeople,
    findPerson: findPerson,
    findPersonByUid: findPersonByUid,
    normalizeName: normalizeName,
    parse: parse,
    toText: toText,
    toHtml: toHtml,
    hasMention: hasMention,
    resolveAssignees: resolveAssignees,
    resolvePerson: resolvePerson,
    toAssigneeList: toAssigneeList,
    activeMentionAt: activeMentionAt,
    applyMention: applyMention,
    search: search
  };
})();
