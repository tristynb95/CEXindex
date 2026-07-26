// ========== MENTION FIELD ==========
// Turns a plain text <input> into a field that assigns a visit to someone:
// type "@", pick a name, done.
//
// The field has two faces. At rest it shows the *display* face — the name with
// no "@", underlined and blue. Clicking or tabbing into it swaps in the real
// <input>, which holds the stored text and so does show the "@". Blurring swaps
// back. Two elements rather than one styled input because an <input> cannot
// render part of its own value differently from the rest.
//
// The input remains the single source of truth throughout: the display face is
// only ever rendered *from* input.value, and the form still reads input.value.
window.GAILS = window.GAILS || {};

(function () {
  'use strict';

  var G = window.GAILS;
  var MENU_LIMIT = 6;

  function mentions() {
    return G.Mentions;
  }

  function enhance(input, options) {
    if (!input || input.dataset.mentionFieldReady === 'true') return null;
    if (!mentions()) return null;

    var config = options || {};
    input.dataset.mentionFieldReady = 'true';

    // <span>, not <div>: the admin visit form nests this whole component inside
    // a <label>, which only accepts phrasing content. CSS gives it block layout.
    var wrapper = document.createElement('span');
    wrapper.className = 'mention-field';

    var display = document.createElement('button');
    display.type = 'button';
    display.className = 'mention-field__display';
    // The display face stands in for the input, so it borrows its labelling
    // rather than announcing itself as an unrelated button.
    var labelledBy = input.getAttribute('aria-labelledby');
    var label = input.id ? document.querySelector('label[for="' + input.id + '"]') : null;
    if (labelledBy) display.setAttribute('aria-labelledby', labelledBy);
    else if (label && label.id) display.setAttribute('aria-labelledby', label.id);
    else if (label) display.setAttribute('aria-label', label.textContent.trim());

    var menu = document.createElement('span');
    menu.className = 'mention-field__menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(display);
    wrapper.appendChild(input);
    wrapper.appendChild(menu);
    input.classList.add('mention-field__input');

    var state = { open: false, activeIndex: -1, matches: [], range: null };

    // Wrapped in a single child so the button's flex centring treats the whole
    // value as one item — laid out as flex items, the text either side of a
    // mention would be spaced apart and wrap onto its own line.
    function renderDisplay() {
      var value = input.value;
      var inner = value
        ? mentions().toHtml(value)
        : '<span class="mention-field__placeholder">' +
          (input.placeholder ? escapeText(input.placeholder) : 'Enter name…') + '</span>';
      display.innerHTML = '<span class="mention-field__value">' + inner + '</span>';
    }

    function escapeText(value) {
      return typeof G.escapeHtml === 'function'
        ? G.escapeHtml(value)
        : String(value).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
        });
    }

    function setEditing(editing) {
      wrapper.classList.toggle('is-editing', editing);
      display.tabIndex = editing ? -1 : 0;
      if (!editing) {
        closeMenu();
        renderDisplay();
      }
    }

    function startEditing(caretAtEnd) {
      setEditing(true);
      input.focus();
      if (caretAtEnd !== false) {
        var end = input.value.length;
        try { input.setSelectionRange(end, end); } catch { /* type doesn't support selection */ }
      }
    }

    function closeMenu() {
      state.open = false;
      state.activeIndex = -1;
      state.matches = [];
      state.range = null;
      menu.hidden = true;
      menu.innerHTML = '';
      input.removeAttribute('aria-activedescendant');
    }

    function renderMenu() {
      if (!state.matches.length) {
        closeMenu();
        return;
      }
      menu.innerHTML = state.matches.map(function (person, index) {
        var id = 'mention-option-' + index;
        return '<button type="button" class="mention-field__option' +
          (index === state.activeIndex ? ' is-active' : '') + '" role="option" id="' + id + '"' +
          ' aria-selected="' + (index === state.activeIndex) + '" data-index="' + index + '">' +
          '<span class="mention-field__option-name">' + escapeText(person.name) + '</span>' +
          (person.email
            ? '<span class="mention-field__option-email">' + escapeText(person.email) + '</span>'
            : '') +
          '</button>';
      }).join('');
      menu.hidden = false;
      state.open = true;
      if (state.activeIndex >= 0) {
        input.setAttribute('aria-activedescendant', 'mention-option-' + state.activeIndex);
      }
    }

    function syncMenu() {
      var caret = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
      var range = mentions().activeMentionAt(input.value, caret);
      if (!range) {
        closeMenu();
        return;
      }
      var matches = mentions().search(range.query, MENU_LIMIT);
      if (!matches.length) {
        closeMenu();
        return;
      }
      state.range = range;
      state.matches = matches;
      state.activeIndex = 0;
      renderMenu();
    }

    function choose(index) {
      var person = state.matches[index];
      if (!person || !state.range) return;
      var applied = mentions().applyMention(input.value, state.range, person.name);
      input.value = applied.value;
      closeMenu();
      input.focus();
      try { input.setSelectionRange(applied.caret, applied.caret); } catch { /* ignore */ }
      // Anything listening for edits (a dirty flag, a live preview) should see
      // a programmatic pick exactly as it sees typing.
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof config.onSelect === 'function') config.onSelect(person, input);
    }

    display.addEventListener('click', function () { startEditing(); });
    display.addEventListener('focus', function () {
      // Reached by keyboard: open the editor so tabbing lands somewhere useful.
      if (!wrapper.classList.contains('is-editing')) startEditing();
    });

    input.addEventListener('focus', function () { setEditing(true); });

    input.addEventListener('input', function () {
      syncMenu();
    });

    input.addEventListener('click', syncMenu);
    input.addEventListener('keyup', function (event) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' ||
        event.key === 'Home' || event.key === 'End') syncMenu();
    });

    input.addEventListener('keydown', function (event) {
      if (!state.open) {
        if (event.key === 'Escape') input.blur();
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
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        // Enter must not submit the surrounding form while a name is being
        // picked; Tab commits the highlighted name and then moves on normally.
        if (event.key === 'Enter') event.preventDefault();
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

    input.addEventListener('blur', function () {
      // A click heading for the menu is not really a blur.
      setTimeout(function () {
        if (wrapper.contains(document.activeElement)) return;
        setEditing(false);
      }, 0);
    });

    renderDisplay();
    setEditing(false);

    var api = {
      input: input,
      wrapper: wrapper,
      refresh: function () {
        if (!wrapper.classList.contains('is-editing')) renderDisplay();
      },
      assignee: function () { return mentions().resolveAssignee(input.value); }
    };
    input._mentionField = api;
    return api;
  }

  // Re-renders after a caller sets input.value directly (opening a modal on an
  // existing visit, resetting a form) — the display face can't observe that.
  function refresh(input) {
    if (input && input._mentionField) input._mentionField.refresh();
  }

  function enhanceAll(root, options) {
    var scope = root || document;
    return Array.from(scope.querySelectorAll('[data-mention-field]')).map(function (input) {
      return enhance(input, options);
    }).filter(Boolean);
  }

  function assigneeFor(input) {
    if (!input || !G.Mentions) return null;
    return G.Mentions.resolveAssignee(input.value);
  }

  G.MentionField = {
    enhance: enhance,
    enhanceAll: enhanceAll,
    refresh: refresh,
    assigneeFor: assigneeFor
  };
})();
