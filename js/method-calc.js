// ========== BENCHMARK SCORE CALCULATOR (methodology tab) ==========
// The calculator on the methodology page deliberately calls the same scoring
// functions the dashboard uses (js/cei.js) and reads its targets, floors and
// weights from js/config.js. Nothing here re-implements the maths, so a worked
// example on the page can never drift from the published score.
(function () {
  'use strict';

  var G = window.GAILS = window.GAILS || {};

  // Source inputs the user can type. `def` doubles as the reset value and as
  // the worked example the page ships with (it scores 62.0).
  var INPUTS = {
    nps: { def: 50, min: -100, max: 100 },
    dr: { def: 88, min: 0, max: 100 },
    ef: { def: 85, min: 0, max: 100 },
    fr: { def: 92, min: 0, max: 100 },
    s2: { def: 65, min: 0, max: 100 },
    s3: { def: 88, min: 0, max: 100 },
    o5: { def: 1.2, min: 0, max: 100 },
    at: { def: 122, min: 0, max: 600 },
    v: { def: 40, min: 0, max: 9999 },
    cohort: { def: 70, min: 0, max: 100 }
  };

  // Pass/fail checks inside the coffee efficiency component. These three
  // targets are the only ones config.js does not expose, so they are restated
  // here for the verdict labels — test/methodology.test.js pins them to the
  // behaviour of computeCoffeeEfficiencyComponent.
  var TESTS = [
    { key: 's2', passes: function (v) { return v.s2 >= 70; }, need: 'needs 70%+' },
    { key: 's3', passes: function (v) { return v.s3 >= 90; }, need: 'needs 90%+' },
    { key: 'o5', passes: function (v) { return v.o5 <= 1; }, need: 'needs 1% or less' }
  ];

  // Short labels: the breakdown rows sit in a narrow panel, and these match the
  // segment names on the weight map so the two read as the same six things.
  var COMPONENTS = [
    {
      key: 'nps',
      label: 'NPS',
      points: function (v) { return G.computeAbsoluteComponent(v.nps, G.BENCHMARKS.nps, G.BENCHMARK_FLOORS.nps); }
    },
    {
      key: 'dr',
      label: 'Quality',
      points: function (v) { return G.computeAbsoluteComponent(v.dr, G.BENCHMARKS.dr, G.BENCHMARK_FLOORS.dr); }
    },
    {
      key: 'ef',
      label: 'Efficiency',
      points: function (v) { return G.computeAbsoluteComponent(v.ef, G.BENCHMARKS.ef, G.BENCHMARK_FLOORS.ef); }
    },
    {
      key: 'fr',
      label: 'Friendliness',
      points: function (v) { return G.computeAbsoluteComponent(v.fr, G.BENCHMARKS.fr, G.BENCHMARK_FLOORS.fr); }
    },
    {
      key: 'time',
      label: 'Coffee efficiency',
      points: function (v) { return G.computeCoffeeEfficiencyComponent(v.s2, v.s3, null, v.o5); }
    },
    {
      key: 'at',
      label: 'Avg wait',
      points: function (v) { return G.computeAbsoluteWaitComponent(v.at); }
    }
  ];

  function round1(n) { return Math.round(n * 10) / 10; }

  function clamp(key, value) {
    var spec = INPUTS[key];
    if (!spec) return value;
    return Math.min(spec.max, Math.max(spec.min, value));
  }

  // Reads every input once so a single render works from one consistent set of
  // values. A half-typed field ("-" or "") falls back to its slider, which still
  // holds the last value the user settled on — scoring a cleared field at zero
  // would swing the whole result while someone is mid-keystroke.
  function readValues(root) {
    var values = {};
    Object.keys(INPUTS).forEach(function (key) {
      var field = root.querySelector('[data-calc-input="' + key + '"]');
      var slider = root.querySelector('[data-calc-slider="' + key + '"]');
      var raw = field ? parseFloat(field.value) : NaN;
      if (isNaN(raw) && slider) raw = parseFloat(slider.value);
      values[key] = clamp(key, isNaN(raw) ? INPUTS[key].def : raw);
    });
    return values;
  }

  function score(values) {
    var parts = COMPONENTS.map(function (component) {
      var points = round1(component.points(values));
      var weight = G.CEI_WEIGHTS[component.key];
      return {
        key: component.key,
        label: component.label,
        points: points,
        weight: weight,
        contribution: round1(points * weight)
      };
    });
    var raw = round1(parts.reduce(function (total, part) { return total + part.points * part.weight; }, 0));
    // Passing no record and no context applies the historic / multi-month
    // shares (75/25 and 35/65) — the column the calculator advertises.
    var published = G.confidenceAdjust(raw, values.cohort, values.v, null, null);
    return {
      parts: parts,
      raw: raw,
      published: published === null ? null : round1(published),
      adjusted: published !== null && round1(published) !== raw
    };
  }

  function bandOf(value) {
    if (value === null) return 'No Data';
    return G.ensureBands({ ac: value }).acb;
  }

  function renderRows(rowsEl, parts) {
    rowsEl.innerHTML = parts.map(function (part) {
      return '<li class="calc__row" data-calc-row="' + part.key + '">'
        + '<span class="calc__row-dot" aria-hidden="true"></span>'
        + '<span class="calc__row-name">' + part.label + '</span>'
        + '<span class="calc__row-points">' + part.points + ' pts</span>'
        + '<span class="calc__row-weight">&times;' + Math.round(part.weight * 100) + '%</span>'
        + '<strong class="calc__row-contrib">' + part.contribution.toFixed(1) + '</strong>'
        + '</li>';
    }).join('');
  }

  function renderStack(stackEl, parts, raw) {
    var earned = parts.map(function (part) {
      return '<span class="calc__stack-seg" data-calc-seg="' + part.key + '" style="flex-grow:'
        + Math.max(part.contribution, 0) + '" title="' + part.label + ': ' + part.contribution.toFixed(1)
        + ' points"></span>';
    }).join('');
    var missed = Math.max(0, round1(100 - raw));
    stackEl.innerHTML = earned
      + '<span class="calc__stack-seg calc__stack-seg--missed" style="flex-grow:' + missed
      + '" title="Points not earned: ' + missed.toFixed(1) + '"></span>';
  }

  function renderTests(root, values) {
    TESTS.forEach(function (test) {
      var row = root.querySelector('[data-calc-test="' + test.key + '"]');
      var verdict = root.querySelector('[data-calc-verdict="' + test.key + '"]');
      var pass = test.passes(values);
      if (row) row.setAttribute('data-pass', pass ? 'yes' : 'no');
      if (verdict) verdict.textContent = pass ? 'pass' : test.need;
    });
  }

  // Ranges are painted with a gradient rather than a native fill so the filled
  // portion matches the rest of the dashboard's controls in every browser.
  function paintSliders(root) {
    root.querySelectorAll('[data-calc-slider]').forEach(function (slider) {
      var min = parseFloat(slider.min);
      var max = parseFloat(slider.max);
      var position = max > min ? ((parseFloat(slider.value) - min) / (max - min)) * 100 : 0;
      slider.style.setProperty('--fill', Math.max(0, Math.min(100, position)) + '%');
    });
  }

  function render(root) {
    var values = readValues(root);
    var result = score(values);

    paintSliders(root);
    renderTests(root, values);

    result.parts.forEach(function (part) {
      var readout = root.querySelector('[data-calc-points="' + part.key + '"]');
      if (readout) {
        readout.textContent = part.points + ' pts';
        readout.setAttribute('data-tone', part.points >= 100 ? 'full' : part.points > 0 ? 'part' : 'none');
      }
    });

    var band = bandOf(result.published);
    var scoreEl = root.querySelector('[data-calc-score]');
    var bandEl = root.querySelector('[data-calc-band]');
    if (scoreEl) scoreEl.textContent = result.published === null ? '—' : result.published.toFixed(1);
    if (bandEl) {
      bandEl.textContent = result.published === null ? 'Not scored' : band;
      bandEl.style.setProperty('--calc-band-color', G.ABSCOL[band] || G.ABSCOL['No Data']);
    }
    root.querySelectorAll('[data-calc-band-cell]').forEach(function (cell) {
      cell.classList.toggle('is-current', result.published !== null
        && cell.getAttribute('data-calc-band-cell') === band);
    });

    renderRows(root.querySelector('[data-calc-rows]'), result.parts);
    renderStack(root.querySelector('[data-calc-stack]'), result.parts, result.raw);

    var cohortField = root.querySelector('[data-calc-cohort]');
    var volumeHint = root.querySelector('[data-calc-volume-hint]');
    var adjustment = root.querySelector('[data-calc-adjustment]');
    var lowVolume = values.v > 0 && values.v < 15;
    if (cohortField) cohortField.hidden = !lowVolume;
    if (volumeHint) {
      volumeHint.textContent = values.v < 1
        ? 'No responses, so the bakery is not scored for this period.'
        : lowVolume
          ? 'Under 15 responses, so the raw score is blended with the company mean.'
          : '15 or more responses, so the raw score is published as it stands.';
    }
    if (adjustment) {
      adjustment.hidden = !result.adjusted || result.published === null;
      adjustment.textContent = 'Raw score ' + result.raw.toFixed(1) + ', blended with the company mean of '
        + values.cohort.toFixed(1) + ' on ' + values.v + ' response' + (values.v === 1 ? '' : 's') + '.';
    }

    var live = root.querySelector('[data-calc-live]');
    if (live) {
      live.textContent = result.published === null
        ? 'Not scored: this bakery has no responses in the period.'
        : 'Benchmark Score ' + result.published.toFixed(1) + ' — ' + band + '.';
    }
  }

  function syncPartner(root, key, value) {
    root.querySelectorAll('[data-calc-input="' + key + '"], [data-calc-slider="' + key + '"]').forEach(function (el) {
      if (el.value !== value) el.value = value;
    });
  }

  // The app header is sticky at the top of the page, so the results panel has
  // to park below it rather than at the viewport edge — otherwise the score
  // slides underneath the red band while the inputs are still being filled in.
  // Header height moves with the viewport (its sub-line and period pill wrap),
  // so it is measured rather than assumed.
  function trackHeaderHeight(root) {
    var header = document.querySelector('.header');
    if (!header) return;
    var apply = function () {
      // The header is hidden until sign-in completes, so a zero measurement
      // means "not shown yet" — leave the CSS fallback in place until it is.
      var height = header.offsetHeight;
      if (height > 0) root.style.setProperty('--calc-header-h', height + 'px');
    };
    apply();
    if (window.ResizeObserver) {
      new window.ResizeObserver(apply).observe(header);
    } else {
      window.addEventListener('resize', apply);
    }
  }

  function init() {
    var root = document.querySelector('[data-benchmark-calculator]');
    if (!root || typeof G.computeAbsoluteComponent !== 'function') return;

    trackHeaderHeight(root);

    root.addEventListener('input', function (e) {
      var el = e.target;
      var key = el.getAttribute && (el.getAttribute('data-calc-input') || el.getAttribute('data-calc-slider'));
      if (!key) return;
      // Slider moves mirror straight across; typed values are only mirrored
      // once they parse, so backspacing a field doesn't yank the slider to 0.
      if (el.hasAttribute('data-calc-slider') || el.value !== '') syncPartner(root, key, el.value);
      render(root);
    });

    // Snap a typed value into range when the field is left, so the number
    // shown always matches the number that was scored.
    root.addEventListener('change', function (e) {
      var el = e.target;
      var key = el.getAttribute && el.getAttribute('data-calc-input');
      if (!key) return;
      var raw = parseFloat(el.value);
      var next = clamp(key, isNaN(raw) ? INPUTS[key].def : raw);
      el.value = String(next);
      syncPartner(root, key, el.value);
      render(root);
    });

    var reset = root.querySelector('[data-calc-reset]');
    if (reset) {
      reset.addEventListener('click', function () {
        Object.keys(INPUTS).forEach(function (key) { syncPartner(root, key, String(INPUTS[key].def)); });
        render(root);
      });
    }

    render(root);
  }

  G.initBenchmarkCalculator = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
