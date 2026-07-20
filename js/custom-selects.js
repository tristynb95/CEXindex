// ========== CUSTOM FILTER SELECTS ==========
(function() {
  window.GAILS = window.GAILS || {};
  var G = window.GAILS;

  function getSelect(input) {
    if (!input) return null;
    if (typeof input === 'string') return document.getElementById(input);
    return input;
  }

  function closeAll(except) {
    document.querySelectorAll('.filter-select.is-open').forEach(function(wrapper) {
      if (!except || wrapper !== except) wrapper.classList.remove('is-open');
    });
  }

  function scrollIntoViewInsideContainer(el, container) {
    if (!el || !container) return;
    var elRect = el.getBoundingClientRect();
    var conRect = container.getBoundingClientRect();
    if (elRect.top < conRect.top) {
      container.scrollTop -= (conRect.top - elRect.top);
    } else if (elRect.bottom > conRect.bottom) {
      container.scrollTop += (elRect.bottom - conRect.bottom);
    }
  }

  function buildCustomSelect(select) {
    if (!select || select.dataset.customSelectReady === 'true') return;

    var wrapper = document.createElement('div');
    wrapper.className = 'filter-select';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'filter-select__trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');

    var label = document.createElement('span');
    label.className = 'filter-select__label';

    var icon = document.createElement('span');
    icon.className = 'filter-select__icon';
    icon.setAttribute('aria-hidden', 'true');

    trigger.appendChild(label);
    trigger.appendChild(icon);

    var menu = document.createElement('div');
    menu.className = 'filter-select__menu';
    menu.setAttribute('role', 'listbox');

    var searchable = select.dataset.searchable === 'true';
    var searchInput = null;
    var optionsList = menu;
    var emptyState = null;

    if (searchable) {
      menu.classList.add('filter-select__menu--searchable');

      searchInput = document.createElement('input');
      // type=search so typing surfaces the in-field blue clear (✕) button
      searchInput.type = 'search';
      searchInput.className = 'filter-select__search';
      searchInput.setAttribute('placeholder', 'Type to search…');
      searchInput.setAttribute('autocomplete', 'off');
      searchInput.setAttribute('aria-label', 'Search options');
      menu.appendChild(searchInput);

      optionsList = document.createElement('div');
      optionsList.className = 'filter-select__options';
      optionsList.setAttribute('role', 'presentation');
      menu.appendChild(optionsList);

      emptyState = document.createElement('div');
      emptyState.className = 'filter-select__empty';
      emptyState.textContent = 'No matches found';
      emptyState.style.display = 'none';
      menu.appendChild(emptyState);
    }

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    select.classList.add('filter-select__native');
    select.dataset.customSelectReady = 'true';

    function syncLabel() {
      var active = select.options[select.selectedIndex];
      label.textContent = select.dataset.lockedLabel || (active ? active.textContent : '');
      trigger.setAttribute('aria-label', (select.previousElementSibling && select.previousElementSibling.tagName === 'LABEL'
        ? select.previousElementSibling.textContent + ': '
        : '') + label.textContent);
    }

    function syncDisabledState() {
      var disabled = !!select.disabled;
      trigger.disabled = disabled;
      wrapper.classList.toggle('is-disabled', disabled);
      trigger.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      if (disabled) {
        wrapper.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    }

    function syncSelectedState() {
      Array.prototype.forEach.call(optionsList.querySelectorAll('.filter-select__option'), function(optionBtn) {
        var selected = optionBtn.dataset.value === select.value;
        optionBtn.classList.toggle('is-selected', selected);
        optionBtn.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
      syncLabel();
      syncDisabledState();
    }

    function visibleOptions() {
      return Array.prototype.filter.call(optionsList.querySelectorAll('.filter-select__option'), function(item) {
        return !item.disabled && item.style.display !== 'none';
      });
    }

    function filterOptions(query) {
      var q = query.trim().toLowerCase();
      var matchCount = 0;
      Array.prototype.forEach.call(optionsList.children, function(child) {
        if (!child.classList.contains('filter-select__option')) {
          // separators / group labels ride along with search, hide them since
          // grouping isn't meaningful once the list is filtered down
          child.style.display = q ? 'none' : '';
          return;
        }
        var match = !q || child.textContent.toLowerCase().indexOf(q) !== -1;
        child.style.display = match ? '' : 'none';
        if (match) matchCount++;
      });
      if (emptyState) emptyState.style.display = matchCount ? 'none' : 'block';
    }

    function focusOption(direction) {
      var items = visibleOptions();
      if (!items.length) return;

      var currentIndex = items.indexOf(document.activeElement);
      if (currentIndex === -1) {
        currentIndex = items.findIndex(function(item) { return item.classList.contains('is-selected'); });
      }
      if (currentIndex === -1) currentIndex = 0;

      var nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0) nextIndex = items.length - 1;
      if (nextIndex >= items.length) nextIndex = 0;
      var nextEl = items[nextIndex];
      nextEl.focus({ preventScroll: true });
      scrollIntoViewInsideContainer(nextEl, optionsList);
    }

    function selectValue(value) {
      if (select.value === value) {
        syncSelectedState();
        wrapper.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
        return;
      }
      select.value = value;
      syncSelectedState();
      wrapper.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      trigger.focus();
    }

    function makeOptionBtn(option, isFirst) {
      var optionBtn = document.createElement('button');
      optionBtn.type = 'button';
      optionBtn.className = 'filter-select__option';
      optionBtn.dataset.value = option.value;
      optionBtn.textContent = option.textContent;
      optionBtn.setAttribute('role', 'option');
      optionBtn.setAttribute('aria-selected', 'false');
      if (isFirst && option.value === '') optionBtn.classList.add('is-placeholder');
      optionBtn.disabled = option.disabled;
      optionBtn.addEventListener('click', function() { selectValue(option.value); });
      optionBtn.addEventListener('keydown', function(event) {
        if (event.key === 'ArrowDown') { event.preventDefault(); focusOption('down'); }
        else if (event.key === 'ArrowUp') { event.preventDefault(); focusOption('up'); }
        else if (event.key === 'Escape') { wrapper.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); }
      });
      return optionBtn;
    }

    function rebuildOptions() {
      optionsList.innerHTML = '';
      var optionIndex = 0;
      Array.prototype.forEach.call(select.children, function(child) {
        if (child.tagName === 'OPTGROUP') {
          var sep = document.createElement('div');
          sep.className = 'filter-select__separator';
          optionsList.appendChild(sep);
          var groupLabel = document.createElement('div');
          groupLabel.className = 'filter-select__group-label';
          groupLabel.textContent = child.label.replace(/^—\s*/, '');
          optionsList.appendChild(groupLabel);
          Array.prototype.forEach.call(child.children, function(option) {
            optionsList.appendChild(makeOptionBtn(option, false));
            optionIndex++;
          });
        } else if (child.tagName === 'OPTION') {
          optionsList.appendChild(makeOptionBtn(child, optionIndex === 0));
          optionIndex++;
        }
      });
      syncSelectedState();
      if (searchable) filterOptions(searchInput.value);
    }

    function openMenu() {
      closeAll(wrapper);
      wrapper.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      if (searchable) {
        searchInput.value = '';
        filterOptions('');
        searchInput.focus({ preventScroll: true });
      } else {
        var selected = optionsList.querySelector('.filter-select__option.is-selected') || optionsList.querySelector('.filter-select__option:not(:disabled)');
        if (selected) {
          selected.focus({ preventScroll: true });
          scrollIntoViewInsideContainer(selected, optionsList);
        }
      }
    }

    function closeMenu() {
      wrapper.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', function() {
      var willOpen = !wrapper.classList.contains('is-open');
      if (willOpen) openMenu(); else closeMenu();
    });

    trigger.addEventListener('keydown', function(event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!wrapper.classList.contains('is-open')) {
          openMenu();
        } else if (!searchable) {
          var selected = optionsList.querySelector('.filter-select__option.is-selected') || optionsList.querySelector('.filter-select__option:not(:disabled)');
          if (selected) {
            selected.focus({ preventScroll: true });
            scrollIntoViewInsideContainer(selected, optionsList);
          }
        }
      } else if (event.key === 'Escape') {
        closeMenu();
      }
    });

    if (searchable) {
      searchInput.addEventListener('click', function(event) { event.stopPropagation(); });
      searchInput.addEventListener('input', function() {
        filterOptions(searchInput.value);
      });
      searchInput.addEventListener('keydown', function(event) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          var items = visibleOptions();
          if (items.length) {
            items[0].focus({ preventScroll: true });
            scrollIntoViewInsideContainer(items[0], optionsList);
          }
        } else if (event.key === 'Enter') {
          event.preventDefault();
          var items2 = visibleOptions();
          if (items2.length) selectValue(items2[0].dataset.value);
        } else if (event.key === 'Escape') {
          closeMenu();
          trigger.focus();
        }
      });
    }

    select.addEventListener('change', syncSelectedState);
    select.addEventListener('blur', function() {
      wrapper.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    });

    var observer = new MutationObserver(function() {
      rebuildOptions();
    });
    observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'data-locked-label'] });

    select._customSelect = {
      rebuild: rebuildOptions,
      sync: syncSelectedState,
      close: function() {
        wrapper.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    };

    rebuildOptions();
  }

  G.initCustomSelects = function(root) {
    var scope = root || document;
    scope.querySelectorAll('.filter-bar select, .visit-log-filters select, .visit-log-filter-control select, #addSiteVisitModal select, #addFollowUpModal select').forEach(buildCustomSelect);
  };

  G.syncCustomSelect = function(input) {
    var select = getSelect(input);
    if (!select) return;
    if (!select._customSelect) buildCustomSelect(select);
    if (select._customSelect) select._customSelect.sync();
  };

  document.addEventListener('click', function(event) {
    var wrapper = event.target.closest('.filter-select');
    closeAll(wrapper || null);
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') closeAll();
  });

  G.initCustomSelects();
  buildCustomSelect(document.getElementById('sortBy'));
  buildCustomSelect(document.getElementById('sparkSortBy'));
})();
