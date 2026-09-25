// ========== NAME TOKEN FIELD ==========
// A multi-name field: type a name, pick it from the list (or keep what you
// typed), and it becomes a chip. Used for the check-in's Head Barista(s),
// a record of who the bakery's Head Barista was at the time of the visit.
// Suggestions come from the Head Barista directory on the Admin page, but any
// name can be entered, since the directory can lag behind a change.
//
// Unlike js/mention-field.js this never resolves names to colleagues or
// assigns anything; the chips are plain strings. An optional "None" choice is
// exclusive: picking it clears the names, and adding a name clears it.
//
// The field's value is read and written through the returned api (or
// G.NameTokenField.valuesFor / setValues), never from the typing input, which
// only ever holds the half-typed name.
window.GAILS = window.GAILS || {};

(function () {
  'use strict';

  var G = window.GAILS;
  var MENU_LIMIT = 8;
  var optionSeq = 0;

  function escapeText(value) {
    return typeof G.escapeHtml === 'function'
      ? G.escapeHtml(value)
      : String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
      });
  }

  function cleanName(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function sameName(a, b) {
    return cleanName(a).toLowerCase() === cleanName(b).toLowerCase();
  }

  // options:
  //   suggestions()  -> [{ name, detail?, preferred? }]  (read on every keystroke)
  //   noneLabel      -> the exclusive "nobody" choice, offered as the user types it
  //   noneDetail     -> sub-line under that choice
  //   customDetail   -> sub-line under an "Add “typed name”" choice
  //   onChange(values)
  function enhance(input, options) {
    if (!input || input._nameTokenField) return input ? input._nameTokenField : null;
    var config = options || {};
    var noneLabel = config.noneLabel || '';
    var values = [];
    var state = { open: false, activeIndex: -1, matches: [] };
    var menuId = 'name-token-menu-' + (++optionSeq);

    var wrapper = document.createElement('div');
    wrapper.className = 'name-token-field';
    var chips = document.createElement('span');
    chips.className = 'name-token-field__chips';
    var menu = document.createElement('div');
    menu.className = 'mention-field__menu name-token-field__menu';
    menu.id = menuId;
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(chips);
    wrapper.appendChild(input);
    wrapper.appendChild(menu);
    input.classList.add('name-token-field__input');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', menuId);
    input.setAttribute('aria-expanded', 'false');
    var basePlaceholder = input.getAttribute('placeholder') || '';

    function isNone(value) {
      return !!noneLabel && sameName(value, noneLabel);
    }

    function has(value) {
      return values.some(function (existing) { return sameName(existing, value); });
    }

    function renderChips() {
      chips.innerHTML = values.map(function (value, index) {
        return '<span class="name-token' + (isNone(value) ? ' name-token--none' : '') + '">' +
          '<span class="name-token__label">' + escapeText(value) + '</span>' +
          '<button type="button" class="name-token__remove" data-remove-index="' + index + '"' +
          ' aria-label="Remove ' + escapeText(value) + '">&times;</button>' +
          '</span>';
      }).join('');
      // With chips in place the prompt would sit oddly after them.
      input.placeholder = values.length ? '' : basePlaceholder;
    }

    function emitChange() {
      renderChips();
      if (typeof config.onChange === 'function') config.onChange(values.slice());
      // A dirty flag or live preview listening for edits sees a chip change
      // exactly as it sees typing.
      input.dispatchEvent(new CustomEvent('name-token-change', { bubbles: true }));
    }

    function add(value) {
      var name = cleanName(value);
      if (!name) return false;
      if (isNone(name)) {
        values = [noneLabel];
      } else {
        if (has(name)) return false;
        values = values.filter(function (existing) { return !isNone(existing); });
        values.push(name);
      }
      emitChange();
      return true;
    }

    function removeAt(index) {
      if (index < 0 || index >= values.length) return;
      values.splice(index, 1);
      emitChange();
    }

    function closeMenu() {
      state.open = false;
      state.activeIndex = -1;
      state.matches = [];
      menu.hidden = true;
      menu.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }

    function renderMenu() {
      if (!state.matches.length) {
        closeMenu();
        return;
      }
      menu.innerHTML = state.matches.map(function (match, index) {
        var active = index === state.activeIndex;
        var name = match.kind === 'custom'
          ? 'Add “' + escapeText(match.name) + '”'
          : escapeText(match.name);
        return '<button type="button" class="mention-field__option name-token-field__option' +
          (match.kind === 'none' ? ' name-token-field__option--none' : '') +
          (active ? ' is-active' : '') + '" role="option" id="' + menuId + '-' + index + '"' +
          ' aria-selected="' + active + '" data-index="' + index + '" tabindex="-1">' +
          '<span class="mention-field__option-name">' + name + '</span>' +
          (match.detail
            ? '<span class="mention-field__option-email">' + escapeText(match.detail) + '</span>'
            : '') +
          '</button>';
      }).join('');
      menu.hidden = false;
      state.open = true;
      input.setAttribute('aria-expanded', 'true');
      if (state.activeIndex >= 0) {
        input.setAttribute('aria-activedescendant', menuId + '-' + state.activeIndex);
      }
    }

    function directoryMatches(query) {
      var list = typeof config.suggestions === 'function' ? (config.suggestions() || []) : [];
      var seen = Object.create(null);
      var q = query.toLowerCase();
      var scored = [];
      list.forEach(function (entry) {
        var name = cleanName(entry && entry.name);
        var key = name.toLowerCase();
        if (!name || seen[key] || has(name)) return;
        seen[key] = true;
        var rank;
        if (!q) {
          // Nothing typed yet: only offer the people this bakery already has.
          if (!entry.preferred) return;
          rank = 0;
        } else {
          var at = key.indexOf(q);
          if (at < 0) return;
          // Whole-name prefix, then a later word starting with it, then anywhere.
          rank = at === 0 ? 0 : (key.charAt(at - 1) === ' ' ? 1 : 2);
        }
        scored.push({ name: name, detail: entry.detail || '', preferred: !!entry.preferred, rank: rank });
      });
      scored.sort(function (a, b) {
        if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.name.localeCompare(b.name);
      });
      return scored.slice(0, MENU_LIMIT).map(function (match) {
        return { kind: 'person', name: match.name, detail: match.detail };
      });
    }

    function syncMenu() {
      var query = cleanName(input.value);
      var matches = directoryMatches(query);
      var q = query.toLowerCase();
      if (noneLabel && q && noneLabel.toLowerCase().indexOf(q) === 0 && !has(noneLabel)) {
        // "None" is only ever offered once the user starts typing it.
        matches.unshift({ kind: 'none', name: noneLabel, detail: config.noneDetail || '' });
      }
      var exact = matches.some(function (match) { return sameName(match.name, query); });
      if (query && !exact && !has(query)) {
        matches.push({ kind: 'custom', name: query, detail: config.customDetail || '' });
      }
      state.matches = matches;
      state.activeIndex = matches.length ? 0 : -1;
      renderMenu();
    }

    function choose(index) {
      var match = state.matches[index];
      if (!match) return;
      add(match.name);
      input.value = '';
      closeMenu();
      input.focus();
    }

    // Commits whatever is typed when there is no menu to pick from.
    function commitTyped() {
      var typed = cleanName(input.value);
      if (!typed) return false;
      add(typed);
      input.value = '';
      closeMenu();
      return true;
    }

    input.addEventListener('input', syncMenu);
    input.addEventListener('focus', syncMenu);

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Backspace' && !input.value && values.length) {
        event.preventDefault();
        removeAt(values.length - 1);
        return;
      }
      if (event.key === ',' || event.key === ';') {
        event.preventDefault();
        if (state.open && state.activeIndex >= 0) choose(state.activeIndex);
        else commitTyped();
        return;
      }
      if (!state.open) {
        if (event.key === 'Enter' && commitTyped()) event.preventDefault();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.activeIndex = (state.activeIndex + 1) % state.matches.length;
        renderMenu();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.activeIndex = (state.activeIndex - 1 + state.matches.length) % state.matches.length;
        renderMenu();
      } else if (event.key === 'Enter' || (event.key === 'Tab' && cleanName(input.value))) {
        // Enter never submits the form from here; Tab only commits a typed name
        // so tabbing through an empty field still moves on.
        event.preventDefault();
        choose(state.activeIndex);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
      }
    });

    // mousedown, not click: the input would blur first and take the menu with it.
    menu.addEventListener('mousedown', function (event) {
      var option = event.target.closest('[data-index]');
      if (!option) return;
      event.preventDefault();
      choose(Number(option.getAttribute('data-index')));
    });

    chips.addEventListener('click', function (event) {
      var remove = event.target.closest('[data-remove-index]');
      if (!remove) return;
      removeAt(Number(remove.getAttribute('data-remove-index')));
      input.focus();
    });

    // Clicking the padding around the chips lands in the typing input.
    wrapper.addEventListener('mousedown', function (event) {
      if (event.target === wrapper || event.target === chips) {
        event.preventDefault();
        input.focus();
      }
    });

    input.addEventListener('blur', function () {
      setTimeout(function () {
        if (wrapper.contains(document.activeElement)) return;
        // A name typed and left behind is still a name the user meant to add.
        commitTyped();
        closeMenu();
      }, 0);
    });

    renderChips();

    var api = {
      input: input,
      wrapper: wrapper,
      values: function () { return values.slice(); },
      setValues: function (next) {
        values = [];
        (Array.isArray(next) ? next : []).forEach(function (value) {
          var name = cleanName(value);
          if (name && !has(name)) values.push(isNone(name) ? noneLabel : name);
        });
        if (values.some(isNone)) values = [noneLabel];
        input.value = '';
        closeMenu();
        renderChips();
      },
      isNone: function () { return values.length === 1 && isNone(values[0]); }
    };
    input._nameTokenField = api;
    return api;
  }

  function valuesFor(input) {
    return input && input._nameTokenField ? input._nameTokenField.values() : [];
  }

  function setValues(input, values) {
    if (input && input._nameTokenField) input._nameTokenField.setValues(values);
  }

  G.NameTokenField = {
    enhance: enhance,
    valuesFor: valuesFor,
    setValues: setValues
  };
})();
