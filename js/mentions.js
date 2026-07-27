// ========== PEOPLE SELECTIONS (shared) ==========
// A visit's Coffee Partner field can name the people the visit belongs to.
// Typing any part of a name opens the picker; commas, "+" and "&" start another
// selection. Older "@Name" values remain readable and assignable.
//
// Loaded as a plain <script> by every page that renders a Coffee Partner:
// index.html, admin.html, bakery-profile.html, and my-activity.html.
//
// The stored text is the human-editable form ("Sam Partner + Jo Bloggs"). The
// *authoritative* record of who a visit was assigned to is the `assignedTo` list
// (`[{ uid, name, email }]`). Parsing text only drives the editor and legacy
// presentation, so a directory miss softens styling rather than losing an
// assignment.
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

  // The rendered form, already escaped. Mentions carry .mention so editable
  // fields can distinguish them without changing read-only presentation.
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

  // New editors store exact directory names separated by ",", "+" or "&".
  // Keep resolveAssignees() legacy-only so plain Coffee Partner text on older
  // visits does not silently change their historical attribution at read time.
  var SELECTION_JOINER = /\s*([,+&])\s*/;

  function resolveSelections(raw) {
    var seen = {};
    var selected = [];

    function add(person) {
      if (!person) return;
      var resolved = {
        uid: person.uid || '',
        name: cleanName(person.name),
        email: normalizeEmail(person.email)
      };
      var key = resolved.uid || normalizeName(resolved.name);
      if (!key || seen[key]) return;
      seen[key] = true;
      selected.push(resolved);
    }

    // Recover old @mentions first; unlike the new list format, some were
    // separated only by prose or whitespace.
    resolveAssignees(raw).forEach(add);

    String(raw == null ? '' : raw)
      .split(SELECTION_JOINER)
      .forEach(function (part) {
        var name = cleanName(part).replace(/^@/, '');
        if (!name || /^[,+&]$/.test(name)) return;
        add(findPerson(name));
      });

    return selected;
  }

  function formatPeople(list) {
    var names = (list || []).map(function (person) {
      return cleanName(person && (person.name || person.email || person.uid));
    }).filter(Boolean);
    if (names.length < 2) return names[0] || '';
    if (names.length === 2) return names[0] + ' & ' + names[1];
    return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
  }

  function formatPeopleHtml(list) {
    var people = (list || []).filter(function (person) {
      return person && (person.name || person.email || person.uid);
    });
    var rendered = people.map(function (person) {
      var label = cleanName(person.name || person.email || person.uid);
      var title = person.email ? ' title="' + escapeHtml(person.email) + '"' : '';
      return '<span class="mention"' + title + '>' + escapeHtml(label) + '</span>';
    });
    if (rendered.length < 2) return rendered[0] || '';
    if (rendered.length === 2) return rendered[0] + ' &amp; ' + rendered[1];
    return rendered.slice(0, -1).join(', ') + ' &amp; ' + rendered[rendered.length - 1];
  }

  function isCompleteSelection(raw) {
    var legacySegments = parse(raw);
    var legacyMentions = legacySegments.filter(function (segment) {
      return segment.type === 'mention';
    });
    if (legacyMentions.length && legacySegments.every(function (segment) {
      return segment.type === 'mention' ||
        /^\s*(?:(?:[,+&]|\band\b)\s*)?$/i.test(segment.text);
    })) return true;

    var parts = String(raw == null ? '' : raw).split(SELECTION_JOINER);
    var names = parts.filter(function (part) { return !/^[,+&]$/.test(cleanName(part)); });
    return names.length > 0 && names.every(function (part) {
      var name = cleanName(part).replace(/^@/, '');
      return !!findPerson(name);
    });
  }

  function formatSelectionText(raw) {
    var selected = resolveSelections(raw);
    return selected.length && isCompleteSelection(raw)
      ? formatPeople(selected)
      : toText(raw);
  }

  function formatSelectionHtml(raw) {
    var selected = resolveSelections(raw);
    return selected.length && isCompleteSelection(raw)
      ? formatPeopleHtml(selected)
      : toHtml(raw);
  }

  // Before "@" existed, a Coffee Partner naming the pair who did the visit
  // together was written out longhand — "Jamie + Tristen", "Jamie and Tristen".
  // Splitting on the joiners recovers the individual people, so those visits
  // credit both of them and the pair never enters the name pool as if it were
  // one person. Word boundaries keep "and" from cutting "Alexander" in half.
  var PEOPLE_JOINER = /\s*(?:[+&/,]|\band\b)\s*/i;

  function splitPeople(raw) {
    return String(raw == null ? '' : raw)
      .split(PEOPLE_JOINER)
      .map(cleanName)
      .filter(Boolean);
  }

  // A lone first name resolves only when exactly one person answers to it.
  // Two Jamies means neither is returned, which is the safe answer — the name
  // stays an unresolved credit rather than landing in the wrong person's hub.
  function findByFirstName(value) {
    var key = normalizeName(value);
    if (!key || key.indexOf(' ') !== -1) return null;
    var found = getPeople().filter(function (person) {
      return normalizeName(person.name).split(' ')[0] === key;
    });
    // A real account outranks a name merely harvested from an old record, so a
    // barista called Jamie named on a past check-in cannot claim Jamie's visits.
    var accounts = found.filter(function (person) { return !!person.uid; });
    var candidates = accounts.length ? accounts : found;
    return candidates.length === 1 ? candidates[0] : null;
  }

  // A colleague who has not filled in their profile has no name to be mentioned
  // by, which leaves them unpickable and their visits uncredited. A work address
  // already carries the name — jamie_vu@ is Jamie Vu — so it stands in until
  // they set their own, which then overwrites it (see addPeople).
  //
  // Only a local part that actually separates the two parts qualifies: guessing
  // where "tristendbayley" divides would invent a name rather than read one.
  function nameFromEmail(value) {
    var local = normalizeEmail(value).split('@')[0];
    if (!local) return '';
    var words = local.split(/[._\-+]+/).filter(Boolean);
    if (words.length < 2) return '';
    return words.map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
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
    return findPerson(value) || findByFirstName(value);
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

  // The current picker needs no "@". A query begins at the start of the field
  // or immediately after one of the supported person separators.
  function activeSelectionAt(raw, caret) {
    var text = String(raw == null ? '' : raw);
    var position = Math.max(0, Math.min(Number(caret) || 0, text.length));
    var before = text.slice(0, position);
    var separator = Math.max(
      before.lastIndexOf(','),
      before.lastIndexOf('+'),
      before.lastIndexOf('&')
    );
    var start = separator + 1;
    while (start < position && /\s/.test(text.charAt(start))) start++;
    if (text.charAt(start) === '@') start++;

    var query = text.slice(start, position);
    if (!query || /[\n\t]/.test(query) || query.length > 40) return null;
    if (query.split(/\s+/).length > 3) return null;
    return { start: start, end: position, query: query };
  }

  function applySelection(raw, range, name) {
    var text = String(raw == null ? '' : raw);
    var chosen = cleanName(name);
    var value = text.slice(0, range.start) + chosen + text.slice(range.end);
    return { value: value, caret: range.start + chosen.length };
  }

  // Editable fields highlight exact selected people. Read-only surfaces still
  // render .mention as ordinary black text, and legacy @mentions still work.
  function selectionsToHtml(raw) {
    var text = String(raw == null ? '' : raw);
    if (isCompleteSelection(text)) return formatSelectionHtml(text);
    return text.split(/([,+&])/).map(function (part) {
      if (/^[,+&]$/.test(part)) return escapeHtml(part);

      var leading = (part.match(/^\s*/) || [''])[0];
      var trailing = (part.match(/\s*$/) || [''])[0];
      var bodyEnd = trailing.length ? part.length - trailing.length : part.length;
      var body = part.slice(leading.length, bodyEnd);
      var person = findPerson(body.replace(/^@/, ''));
      if (!person) return toHtml(part);

      var title = person.email ? ' title="' + escapeHtml(person.email) + '"' : '';
      return escapeHtml(leading) + '<span class="mention"' + title + '>' +
        escapeHtml(person.name) + '</span>' + escapeHtml(trailing);
    }).join('');
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

    // A field naming a pair contributes the two people, never the pair itself:
    // "Jamie + Tristen" is not someone the picker should ever offer.
    function harvestNames(value) {
      splitPeople(value).forEach(function (name) { harvested.push({ name: name }); });
    }

    (input.regionAssignments || []).forEach(function (assignment) {
      if (!assignment) return;
      harvestNames(assignment.coffeePartner);
      harvestNames(assignment.coffeeTrainer);
      // A region on cover names a Coffee Partner or Coffee Trainer per ops
      // area; those colleagues do these visits too.
      var cover = assignment.cover;
      ((cover && cover.areas) || []).forEach(function (area) {
        if (!area) return;
        harvestNames(area.coffeePartner);
        harvestNames(area.coffeeTrainer);
      });
    });

    (input.opsAreaAssignments || []).forEach(function (assignment) {
      if (!assignment) return;
      // An ops area can list several area head baristas; older records carried
      // a single name on the assignment itself.
      (assignment.baristas || []).forEach(function (entry) {
        if (entry) harvestNames(entry.name);
      });
      harvestNames(assignment.areaHeadBarista);
    });

    var visits = input.visits || {};
    Object.keys(visits).forEach(function (id) {
      var visit = visits[id];
      if (!visit) return;
      // Stored Coffee Partner text may itself contain a mention, so the name is
      // taken from its reading form rather than raw.
      harvestNames(toText(visit.coffeePartner));
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
    resolveSelections: resolveSelections,
    formatPeople: formatPeople,
    formatPeopleHtml: formatPeopleHtml,
    formatSelectionText: formatSelectionText,
    formatSelectionHtml: formatSelectionHtml,
    resolvePerson: resolvePerson,
    splitPeople: splitPeople,
    nameFromEmail: nameFromEmail,
    toAssigneeList: toAssigneeList,
    activeMentionAt: activeMentionAt,
    applyMention: applyMention,
    activeSelectionAt: activeSelectionAt,
    applySelection: applySelection,
    selectionsToHtml: selectionsToHtml,
    search: search
  };
})();
