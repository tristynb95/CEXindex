// ========== WORD CLOUD MODULE ==========
window.GAILS = window.GAILS || {};

(function () {
  var ENDPOINT = 'https://get-word-cloud-data-514119021168.europe-west1.run.app';

  // Sentiment colours — mapped to app palette
  var SENTIMENT_COLORS = {
    positive: '#00C875',  // green
    negative: '#FF3B5C',  // crimson
    neutral:  '#9090B8'   // muted
  };
  var SENTIMENT_FALLBACK = '#4895FF'; // blue — for any unrecognised value

  var lastWordData = null;        // null = never fetched; [] = fetched, empty; [...] = data
  var lastTargetWordData = null;
  var lastWcParamsKey = null;     // key of last successful/empty fetch
  var lastTargetWcParamsKey = null;
  var resizeTimer = null;

  function ensureWordCloudTooltip(canvas) {
    if (!canvas) return null;
    var wrap = canvas.parentElement;
    if (!wrap) return null;

    if (!wrap.__wcTooltip) {
      var tooltip = document.createElement('div');
      tooltip.className = 'wc-tooltip';
      tooltip.hidden = true;
      wrap.appendChild(tooltip);
      wrap.__wcTooltip = tooltip;
    }

    if (!canvas.__wcTooltipBound) {
      canvas.addEventListener('mousemove', function (evt) {
        var tooltip = wrap.__wcTooltip;
        var hitRegions = canvas.__wcHitRegions || [];
        if (!tooltip || !hitRegions.length) {
          hideWordCloudTooltip(canvas);
          return;
        }

        var rect = canvas.getBoundingClientRect();
        var x = evt.clientX - rect.left;
        var y = evt.clientY - rect.top;
        var match = null;

        for (var i = 0; i < hitRegions.length; i++) {
          var region = hitRegions[i];
          if (x >= region.x && x <= region.x + region.w &&
              y >= region.y && y <= region.y + region.h) {
            match = region;
            break;
          }
        }

        if (!match) {
          canvas.style.cursor = 'default';
          hideWordCloudTooltip(canvas);
          return;
        }

        canvas.style.cursor = 'pointer';
        tooltip.textContent = match.word + ': ' + match.value;
        tooltip.hidden = false;

        var wrapRect = wrap.getBoundingClientRect();
        var left = evt.clientX - wrapRect.left + 14;
        var top = evt.clientY - wrapRect.top - 14;
        var maxLeft = Math.max(8, wrap.clientWidth - tooltip.offsetWidth - 8);
        var maxTop = Math.max(8, wrap.clientHeight - tooltip.offsetHeight - 8);

        if (left > maxLeft) left = maxLeft;
        if (top > maxTop) top = maxTop;
        if (top < 8) top = evt.clientY - wrapRect.top + 18;
        if (top > maxTop) top = maxTop;

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
      });

      canvas.addEventListener('mouseleave', function () {
        canvas.style.cursor = 'default';
        hideWordCloudTooltip(canvas);
      });

      canvas.__wcTooltipBound = true;
    }

    return wrap.__wcTooltip;
  }

  function hideWordCloudTooltip(canvas) {
    if (!canvas || !canvas.parentElement || !canvas.parentElement.__wcTooltip) return;
    canvas.parentElement.__wcTooltip.hidden = true;
  }

  function measureWord(ctx, text, size) {
    var metrics = ctx.measureText(text);
    var ascent = metrics.actualBoundingBoxAscent || size * 0.76;
    var descent = metrics.actualBoundingBoxDescent || size * 0.2;
    return {
      width: metrics.width,
      ascent: ascent,
      descent: descent,
      height: ascent + descent
    };
  }

  // Stable string key for a word cloud request body — used to detect filter changes
  function buildWcParamsKey(body) {
    var bakeries = (body.bakery_locations || []).slice().sort().join(',');
    return (body.start_date || '') + '|' + (body.end_date || '') + '|' + bakeries;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Convert a dashboard month label ("Jan 25") to an ISO date string.
  // isEnd=false → first day of month; isEnd=true → last day of month.
  function monthLabelToIso(label, isEnd) {
    var G = window.GAILS;
    var parts = label.split(' ');
    var mi = G.MONTH_SHORT.indexOf(parts[0]);
    var yr = parseInt(parts[1], 10) + 2000;
    var mm = String(mi + 1).padStart(2, '0');
    if (!isEnd) return yr + '-' + mm + '-01';
    var lastDay = new Date(yr, mi + 1, 0).getDate();
    return yr + '-' + mm + '-' + String(lastDay).padStart(2, '0');
  }

  // ── Renderer ───────────────────────────────────────────────────────────────

  function renderWordCloud(words, canvas) {
    ensureWordCloudTooltip(canvas);
    hideWordCloudTooltip(canvas);
    canvas.__wcHitRegions = [];

    var dpr    = window.devicePixelRatio || 1;
    var cssW   = (canvas.parentElement.clientWidth || 760);
    var cssH   = 480;
    var xyRatio = cssH / cssW;

    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    // Subtle ambient glow background matching app radial palette
    var g1 = ctx.createRadialGradient(cssW * 0.18, cssH * 0.22, 0, cssW * 0.18, cssH * 0.22, cssW * 0.55);
    g1.addColorStop(0, 'rgba(255,59,92,0.07)');
    g1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, cssW, cssH);

    var g2 = ctx.createRadialGradient(cssW * 0.82, cssH * 0.76, 0, cssW * 0.82, cssH * 0.76, cssW * 0.5);
    g2.addColorStop(0, 'rgba(155,93,255,0.07)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, cssW, cssH);

    // Sort descending, cap at 120 words
    var sorted = words.slice().sort(function (a, b) { return b.value - a.value; }).slice(0, 120);
    if (!sorted.length) return;

    var maxVal = sorted[0].value;
    var minVal = sorted[sorted.length - 1].value;
    var range  = maxVal - minVal || 1;
    var total  = sorted.length;

    var MIN_SIZE = 12, MAX_SIZE = 60;
    var EDGE_PAD = 3;
    var placed = [];

    // Draw legend in bottom-right corner before placing words
    (function drawLegend() {
      var items = [
        { label: 'Positive', color: SENTIMENT_COLORS.positive },
        { label: 'Neutral',  color: SENTIMENT_COLORS.neutral  },
        { label: 'Negative', color: SENTIMENT_COLORS.negative }
      ];
      ctx.font = '500 11px "Space Grotesk", Inter, system-ui, sans-serif';
      var pad = 14, dotR = 4, rowH = 18;
      var ly = cssH - pad - (items.length - 1) * rowH;
      items.forEach(function (item) {
        var tw = ctx.measureText(item.label).width;
        var lx = cssW - pad - tw - dotR * 2 - 6;
        ctx.fillStyle = item.color;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(lx + dotR, ly - dotR * 0.6, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#C4C4DC';
        ctx.fillText(item.label, lx + dotR * 2 + 5, ly);
        ctx.globalAlpha = 1;
        ly += rowH;
      });
    }());

    sorted.forEach(function (item, idx) {
      var t      = Math.sqrt((item.value - minVal) / range);
      var size   = Math.round(MIN_SIZE + t * (MAX_SIZE - MIN_SIZE));
      var weight = size > 28 ? '700' : size > 16 ? '600' : '400';
      ctx.font   = weight + ' ' + size + 'px "Space Grotesk", Inter, system-ui, sans-serif';

      var metrics = measureWord(ctx, item.word, size);
      var tw = metrics.width;
      var th = metrics.height;

      // Colour from sentiment field
      var sentiment = (item.sentiment || '').toLowerCase();
      var color = SENTIMENT_COLORS[sentiment] || SENTIMENT_FALLBACK;

      // Glow on large words
      if (size > 32) {
        ctx.shadowColor = color;
        ctx.shadowBlur  = size > 44 ? 14 : 8;
      } else {
        ctx.shadowBlur = 0;
      }

      // Archimedean spiral — golden-angle start per word keeps layout varied
      var startAngle = idx * 2.39996;
      var boxPadX = size > 34 ? 2 : 1;
      var boxPadY = size > 34 ? 3 : 2;

      for (var i = 0; i < 2200; i++) {
        var theta = i * 0.115;
        var r     = 2.65 * theta;
        var angle = startAngle + theta;
        var cx    = cssW / 2 + r * Math.cos(angle);
        var cy    = cssH / 2 + r * Math.sin(angle) * xyRatio;
        var x     = cx - tw / 2;
        var y     = cy + metrics.ascent - th / 2;

        // Reject positions outside canvas
        if (x < EDGE_PAD || x + tw > cssW - EDGE_PAD ||
            y - metrics.ascent < EDGE_PAD || y + metrics.descent > cssH - EDGE_PAD) continue;

        // AABB collision check
        var box = {
          x: x - boxPadX,
          y: y - metrics.ascent - boxPadY,
          w: tw + boxPadX * 2,
          h: th + boxPadY * 2
        };
        var overlaps = false;
        for (var p = 0; p < placed.length; p++) {
          var q = placed[p];
          if (box.x < q.x + q.w && box.x + box.w > q.x &&
              box.y < q.y + q.h && box.y + box.h > q.y) {
            overlaps = true;
            break;
          }
        }

        if (!overlaps) {
          ctx.fillStyle = color;
          ctx.fillText(item.word, x, y);
          placed.push(box);
          canvas.__wcHitRegions.push({
            x: box.x,
            y: box.y,
            w: box.w,
            h: box.h,
            word: item.word,
            value: item.value
          });
          break;
        }
      }

      // Reset glow after each word
      ctx.shadowBlur = 0;
    });
  }

  // ── Fetch & Render ─────────────────────────────────────────────────────────

  GAILS.fetchWordCloud = function (force) {
    var G        = window.GAILS;
    var state    = G && G.state;
    var statusEl = document.getElementById('wcStatus');
    var canvas   = document.getElementById('wcCanvas');
    var emptyEl  = document.getElementById('wcEmpty');

    // Build request body first so we can compare params before hitting the network
    var body = {};
    if (G && typeof G.getData === 'function' && state && state.ALL && state.ALL.length) {
      var filtered = G.getData();
      var bakeries = [];
      filtered.forEach(function (r) {
        if (r.b && bakeries.indexOf(r.b) === -1) bakeries.push(r.b);
      });
      if (bakeries.length > 0) body.bakery_locations = bakeries;
    }
    if (state && state.selectedMonths && state.selectedMonths.length) {
      body.start_date = monthLabelToIso(state.selectedMonths[0], false);
      body.end_date   = monthLabelToIso(state.selectedMonths[state.selectedMonths.length - 1], true);
    }

    var paramsKey = buildWcParamsKey(body);

    // Skip the API call if filters haven't changed and we already have a result
    if (!force && paramsKey === lastWcParamsKey && lastWordData !== null) {
      if (lastWordData.length) renderWordCloud(lastWordData, canvas);
      return;
    }

    if (statusEl) { statusEl.textContent = 'Loading\u2026'; statusEl.className = 'status'; }
    if (emptyEl)  emptyEl.style.display = 'none';
    hideWordCloudTooltip(canvas);
    canvas.__wcHitRegions = [];

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      lastWcParamsKey = paramsKey;
      var words = data.word_cloud || data.word_cloud_data || data;
      var totalSurveys = data.total_surveys_sampled != null ? data.total_surveys_sampled : null;
      if (!Array.isArray(words) || words.length === 0) {
        if (statusEl) { statusEl.textContent = 'No feedback data found for this selection.'; statusEl.className = 'status'; }
        if (emptyEl)  emptyEl.style.display = '';
        lastWordData = [];
        hideWordCloudTooltip(canvas);
        return;
      }
      lastWordData = words;
      var statusText = words.length + ' words';
      if (totalSurveys !== null) statusText += ' \u00b7 ' + totalSurveys.toLocaleString() + ' surveys';
      if (statusEl) { statusEl.textContent = statusText; statusEl.className = 'status success'; }
      renderWordCloud(words, canvas);
    })
    .catch(function (err) {
      console.error('Word cloud error:', err);
      if (statusEl) { statusEl.textContent = 'Failed to load: ' + err.message; statusEl.className = 'status error'; }
      hideWordCloudTooltip(canvas);
    });
  };

  // ── Target Bakeries Word Cloud ─────────────────────────────────────────────

  GAILS.fetchTargetWordCloud = function (force) {
    var G        = window.GAILS;
    var state    = G && G.state;
    var statusEl = document.getElementById('wcTargetStatus');
    var canvas   = document.getElementById('wcTargetCanvas');
    var emptyEl  = document.getElementById('wcTargetEmpty');

    // Build request body first — target bakeries only (Needs Attention + Developing)
    var body = {};
    if (G && typeof G.getData === 'function' && state && state.ALL && state.ALL.length) {
      var filtered = G.getData();
      var bakeries = [];
      filtered.forEach(function (r) {
        if ((r.cb === 'Needs Attention' || r.cb === 'Developing') && r.b && bakeries.indexOf(r.b) === -1) {
          bakeries.push(r.b);
        }
      });
      if (bakeries.length === 0) {
        // No target bakeries — show empty state without hitting the API
        var emptyKey = buildWcParamsKey(body);
        if (!force && emptyKey === lastTargetWcParamsKey && lastTargetWordData !== null) return;
        if (statusEl) { statusEl.textContent = 'No target bakeries for the current selection.'; statusEl.className = 'status'; }
        if (emptyEl)  emptyEl.style.display = '';
        lastTargetWordData = [];
        lastTargetWcParamsKey = emptyKey;
        hideWordCloudTooltip(canvas);
        canvas.__wcHitRegions = [];
        return;
      }
      body.bakery_locations = bakeries;
    }
    if (state && state.selectedMonths && state.selectedMonths.length) {
      body.start_date = monthLabelToIso(state.selectedMonths[0], false);
      body.end_date   = monthLabelToIso(state.selectedMonths[state.selectedMonths.length - 1], true);
    }

    var paramsKey = buildWcParamsKey(body);

    // Skip the API call if filters haven't changed and we already have a result
    if (!force && paramsKey === lastTargetWcParamsKey && lastTargetWordData !== null) {
      if (lastTargetWordData.length) renderWordCloud(lastTargetWordData, canvas);
      return;
    }

    if (statusEl) { statusEl.textContent = 'Loading\u2026'; statusEl.className = 'status'; }
    if (emptyEl)  emptyEl.style.display = 'none';
    hideWordCloudTooltip(canvas);
    canvas.__wcHitRegions = [];

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      lastTargetWcParamsKey = paramsKey;
      var words = data.word_cloud || data.word_cloud_data || data;
      var totalSurveys = data.total_surveys_sampled != null ? data.total_surveys_sampled : null;
      if (!Array.isArray(words) || words.length === 0) {
        if (statusEl) { statusEl.textContent = 'No feedback data found for these bakeries.'; statusEl.className = 'status'; }
        if (emptyEl)  emptyEl.style.display = '';
        lastTargetWordData = [];
        hideWordCloudTooltip(canvas);
        return;
      }
      lastTargetWordData = words;
      var statusText = words.length + ' words';
      if (totalSurveys !== null) statusText += ' \u00b7 ' + totalSurveys.toLocaleString() + ' surveys';
      if (statusEl) { statusEl.textContent = statusText; statusEl.className = 'status success'; }
      renderWordCloud(words, canvas);
    })
    .catch(function (err) {
      console.error('Target word cloud error:', err);
      if (statusEl) { statusEl.textContent = 'Failed to load: ' + err.message; statusEl.className = 'status error'; }
      hideWordCloudTooltip(canvas);
    });
  };

  // ── Initialise (called on first tab activation) ────────────────────────────

  GAILS.initWordCloud = function () {
    GAILS.fetchWordCloud();
  };

  // Re-render on resize if a word cloud tab is active
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var canvas = document.getElementById('wcCanvas');
      var panel  = document.getElementById('tab-feedback');
      if (lastWordData && lastWordData.length && canvas && panel && panel.classList.contains('active')) {
        renderWordCloud(lastWordData, canvas);
      }
      var targetCanvas = document.getElementById('wcTargetCanvas');
      var targetPanel  = document.querySelector('[data-target-subtab-panel="feedback"]');
      if (lastTargetWordData && lastTargetWordData.length && targetCanvas && targetPanel && targetPanel.classList.contains('active')) {
        renderWordCloud(lastTargetWordData, targetCanvas);
      }
    }, 300);
  });
})();
