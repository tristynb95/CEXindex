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

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    select.classList.add('filter-select__native');
    select.dataset.customSelectReady = 'true';

    function syncLabel() {
      var active = select.options[select.selectedIndex];
      label.textContent = active ? active.textContent : '';
      trigger.setAttribute('aria-label', (select.previousElementSibling && select.previousElementSibling.tagName === 'LABEL'
        ? select.previousElementSibling.textContent + ': '
        : '') + label.textContent);
    }

    function syncSelectedState() {
      Array.prototype.forEach.call(menu.querySelectorAll('.filter-select__option'), function(optionBtn) {
        var selected = optionBtn.dataset.value === select.value;
        optionBtn.classList.toggle('is-selected', selected);
        optionBtn.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
      syncLabel();
    }

    function focusOption(direction) {
      var items = Array.prototype.filter.call(menu.querySelectorAll('.filter-select__option'), function(item) {
        return !item.disabled;
      });
      if (!items.length) return;

      var currentIndex = items.indexOf(document.activeElement);
      if (currentIndex === -1) {
        currentIndex = items.findIndex(function(item) { return item.classList.contains('is-selected'); });
      }
      if (currentIndex === -1) currentIndex = 0;

      var nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0) nextIndex = items.length - 1;
      if (nextIndex >= items.length) nextIndex = 0;
      items[nextIndex].focus();
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
      menu.innerHTML = '';
      var optionIndex = 0;
      Array.prototype.forEach.call(select.children, function(child) {
        if (child.tagName === 'OPTGROUP') {
          var sep = document.createElement('div');
          sep.className = 'filter-select__separator';
          menu.appendChild(sep);
          var groupLabel = document.createElement('div');
          groupLabel.className = 'filter-select__group-label';
          groupLabel.textContent = child.label.replace(/^—\s*/, '');
          menu.appendChild(groupLabel);
          Array.prototype.forEach.call(child.children, function(option) {
            menu.appendChild(makeOptionBtn(option, false));
            optionIndex++;
          });
        } else if (child.tagName === 'OPTION') {
          menu.appendChild(makeOptionBtn(child, optionIndex === 0));
          optionIndex++;
        }
      });
      syncSelectedState();
    }

    trigger.addEventListener('click', function() {
      var willOpen = !wrapper.classList.contains('is-open');
      closeAll(wrapper);
      wrapper.classList.toggle('is-open', willOpen);
      trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      if (willOpen) {
        var selected = menu.querySelector('.filter-select__option.is-selected') || menu.querySelector('.filter-select__option:not(:disabled)');
        if (selected) selected.focus();
      }
    });

    trigger.addEventListener('keydown', function(event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!wrapper.classList.contains('is-open')) {
          closeAll(wrapper);
          wrapper.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
        }
        var selected = menu.querySelector('.filter-select__option.is-selected') || menu.querySelector('.filter-select__option:not(:disabled)');
        if (selected) selected.focus();
      } else if (event.key === 'Escape') {
        wrapper.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    select.addEventListener('change', syncSelectedState);
    select.addEventListener('blur', function() {
      wrapper.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    });

    var observer = new MutationObserver(function() {
      rebuildOptions();
    });
    observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

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
    scope.querySelectorAll('.filter-bar select').forEach(buildCustomSelect);
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
})();
