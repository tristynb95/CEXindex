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
  var lastPrevWordData = null;    // previous period words (null = not fetched yet)
  var lastPrevWcParamsKey = null; // current paramsKey at time prev was fetched
  var lastPrevPeriodLabel = '';   // display label for prev period ("Mar 25")
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
        var TOOLTIP_GAP = 10;
        var TOOLTIP_PAD = 8;
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

        var left = canvas.offsetLeft + match.x + match.w + TOOLTIP_GAP;
        var top = canvas.offsetTop + match.y + (match.h / 2) - (tooltip.offsetHeight / 2);
        var maxLeft = Math.max(TOOLTIP_PAD, wrap.clientWidth - tooltip.offsetWidth - TOOLTIP_PAD);
        var maxTop = Math.max(TOOLTIP_PAD, wrap.clientHeight - tooltip.offsetHeight - TOOLTIP_PAD);

        if (left > maxLeft) {
          left = canvas.offsetLeft + match.x - tooltip.offsetWidth - TOOLTIP_GAP;
        }
        if (left < TOOLTIP_PAD) left = TOOLTIP_PAD;
        if (top < TOOLTIP_PAD) top = TOOLTIP_PAD;
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

  // Maps dashboard bakery names → source data bakery names for the word cloud API
  var BAKERY_NAME_MAP = {
    'Blackfriars':        'Black Friars',
    'Union Street, Bath': 'Union Street - Bath',
    'Southwark':          'The Fire Station, Southwark'
  };

  function mapBakeryName(name) {
    return BAKERY_NAME_MAP[name] || name;
  }

  // Stable string key for a word cloud request body — used to detect filter changes
  function buildWcParamsKey(body) {
    var bakeries = (body.bakery_locations || []).slice().sort().join(',');
    return (body.start_date || '') + '|' + (body.end_date || '') + '|' + bakeries;
  }

  // Returns info about the equivalent period immediately before selectedMonths,
  // or null if there aren't enough months in allMonths to look back.
  function buildPrevPeriodInfo(selectedMonths, allMonths) {
    if (!selectedMonths || !selectedMonths.length || !allMonths || !allMonths.length) return null;
    var count = selectedMonths.length;
    var firstIdx = allMonths.indexOf(selectedMonths[0]);
    if (firstIdx < count) return null;
    var prevMonths = allMonths.slice(firstIdx - count, firstIdx);
    var label = count === 1
      ? prevMonths[0]
      : prevMonths[0] + '–' + prevMonths[prevMonths.length - 1];
    return {
      months: prevMonths,
      startDate: monthLabelToIso(prevMonths[0], false),
      endDate: monthLabelToIso(prevMonths[prevMonths.length - 1], true),
      label: label
    };
  }

  // Compare two word arrays and return top-5 rising and top-5 falling words.
  function computeWordDrift(currentWords, prevWords) {
    var currentMap = {};
    var prevMap = {};
    var MIN_VAL = 3;

    currentWords.forEach(function (w) { currentMap[w.word] = w; });
    prevWords.forEach(function (w) { prevMap[w.word] = w; });

    var changes = [];

    currentWords.forEach(function (w) {
      var prev = prevMap[w.word];
      var prevVal = prev ? prev.value : 0;
      var delta = w.value - prevVal;
      if (Math.max(w.value, prevVal) < MIN_VAL) return;
      changes.push({ word: w.word, sentiment: w.sentiment, currentVal: w.value, prevVal: prevVal, delta: delta, isNew: !prev });
    });

    prevWords.forEach(function (w) {
      if (!currentMap[w.word] && w.value >= MIN_VAL) {
        changes.push({ word: w.word, sentiment: w.sentiment, currentVal: 0, prevVal: w.value, delta: -w.value, isGone: true });
      }
    });

    changes.sort(function (a, b) { return b.delta - a.delta; });

    var rising  = changes.filter(function (c) { return c.delta > 0; }).slice(0, 5);
    var falling = changes.filter(function (c) { return c.delta < 0; });
    falling.sort(function (a, b) { return a.delta - b.delta; });
    falling = falling.slice(0, 5);

    return { rising: rising, falling: falling };
  }

  function renderNegativesPanel(words, panelId, listId) {
    var panelEl = document.getElementById(panelId);
    var listEl  = document.getElementById(listId);
    if (!panelEl || !listEl) return;

    var negatives = (words || [])
      .filter(function (w) { return (w.sentiment || '').toLowerCase() === 'negative'; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 8);

    if (!negatives.length) { panelEl.hidden = true; return; }

    var maxVal = negatives[0].value;
    panelEl.hidden = false;
    listEl.innerHTML = '';

    negatives.forEach(function (item, idx) {
      var barPct = Math.round((item.value / maxVal) * 100);

      var row = document.createElement('div');
      row.className = 'wc-neg__item';

      var rank = document.createElement('span');
      rank.className = 'wc-neg__rank';
      rank.textContent = idx + 1;

      var word = document.createElement('span');
      word.className = 'wc-neg__word';
      word.textContent = item.word;

      var barWrap = document.createElement('div');
      barWrap.className = 'wc-neg__bar-wrap';
      var bar = document.createElement('div');
      bar.className = 'wc-neg__bar';
      bar.style.width = barPct + '%';
      barWrap.appendChild(bar);

      var count = document.createElement('span');
      count.className = 'wc-neg__count';
      count.textContent = item.value;

      row.appendChild(rank);
      row.appendChild(word);
      row.appendChild(barWrap);
      row.appendChild(count);
      listEl.appendChild(row);
    });
  }

  function hideDriftPanel(panelId) {
    var el = document.getElementById(panelId);
    if (el) el.hidden = true;
  }

  function renderDriftPanel(drift, prevLabel, panelId, prevLabelId, risingId, fallingId) {
    var panelEl    = document.getElementById(panelId);
    var prevLblEl  = document.getElementById(prevLabelId);
    var risingEl   = document.getElementById(risingId);
    var fallingEl  = document.getElementById(fallingId);

    if (!panelEl) return;
    if (!drift || (!drift.rising.length && !drift.falling.length)) {
      panelEl.hidden = true;
      return;
    }

    panelEl.hidden = false;
    if (prevLblEl) prevLblEl.textContent = prevLabel || '';

    function renderItems(container, items, dir) {
      if (!container) return;
      container.innerHTML = '';
      if (!items.length) {
        var em = document.createElement('span');
        em.className = 'wc-drift__empty';
        em.textContent = 'No significant changes';
        container.appendChild(em);
        return;
      }
      items.forEach(function (item) {
        var div = document.createElement('div');
        div.className = 'wc-drift__item';

        var color = SENTIMENT_COLORS[(item.sentiment || '').toLowerCase()] || SENTIMENT_FALLBACK;
        var wordSpan = document.createElement('span');
        wordSpan.className = 'wc-drift__word';
        wordSpan.style.color = color;
        wordSpan.textContent = item.word;

        var badgeSpan = document.createElement('span');
        if (item.isNew) {
          badgeSpan.className = 'wc-drift__badge wc-drift__badge--new';
          badgeSpan.textContent = 'new';
        } else if (item.isGone) {
          badgeSpan.className = 'wc-drift__badge wc-drift__badge--gone';
          badgeSpan.textContent = 'gone';
        } else {
          badgeSpan.className = 'wc-drift__badge ' + (dir === 'up' ? 'wc-drift__badge--up' : 'wc-drift__badge--down');
          badgeSpan.textContent = (dir === 'up' ? '+' : '−') + Math.abs(item.delta);
        }

        div.appendChild(wordSpan);
        div.appendChild(badgeSpan);
        container.appendChild(div);
      });
    }

    renderItems(risingEl, drift.rising, 'up');
    renderItems(fallingEl, drift.falling, 'down');
  }

  function getWrapContentBox(wrap) {
    if (!wrap) {
      return { width: 760, height: 480 };
    }

    var styles = window.getComputedStyle ? window.getComputedStyle(wrap) : null;
    var padX = styles ? (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0) : 0;
    var padY = styles ? (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0) : 0;

    return {
      width: Math.max(220, Math.round(((wrap.clientWidth || 760) - padX) || 760)),
      height: wrap.clientHeight ? Math.max(220, Math.round(wrap.clientHeight - padY)) : 0
    };
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

  function getWordCloudLayout(canvas) {
    var wrap = canvas && canvas.parentElement;
    var box = getWrapContentBox(wrap);
    var cssW = box.width;
    var wrapH = box.height || 0;
    var mobileViewport = window.matchMedia ? window.matchMedia('(max-width: 640px)').matches : cssW <= 640;
    var compact = mobileViewport || cssW <= 520;
    var narrow = cssW <= 380;
    var targetH = compact
      ? Math.max(340, Math.min(430, Math.round(cssW * (narrow ? 1.24 : 1.08))))
      : 480;
    var cssH = Math.max(targetH, wrapH);

    return {
      compact: compact,
      narrow: narrow,
      cssW: cssW,
      cssH: cssH,
      xyRatio: Math.max(0.72, Math.min(1.14, cssH / cssW)),
      wordLimit: narrow ? 60 : compact ? 80 : 120,
      minSize: narrow ? 9 : compact ? 10 : 12,
      maxSize: narrow ? 34 : compact ? 40 : 60,
      edgePadX: narrow ? 8 : compact ? 10 : 6,
      edgePadY: narrow ? 10 : compact ? 12 : 6,
      sizeExponent: compact ? 0.78 : 0.5,
      spiralStep: compact ? 0.09 : 0.115,
      spiralRadius: compact ? 2.35 : 2.65,
      attempts: compact ? 4200 : 2200,
      shrinkStep: compact ? 2 : 0,
      shrinkPasses: compact ? 5 : 1,
      anchorPasses: compact ? 5 : 1
    };
  }

  function getWordCloudAnchors(layout) {
    if (!layout.compact) {
      return [{ x: 0.5, y: 0.5 }];
    }

    return [
      { x: 0.5,  y: 0.5  },
      { x: 0.34, y: 0.3  },
      { x: 0.66, y: 0.3  },
      { x: 0.34, y: 0.7  },
      { x: 0.66, y: 0.7  },
      { x: 0.5,  y: 0.2  },
      { x: 0.5,  y: 0.8  },
      { x: 0.22, y: 0.5  },
      { x: 0.78, y: 0.5  }
    ];
  }

  // ── Sentiment Score ─────────────────────────────────────────────────────────

  // Returns 0–100: 0 = all negative, 100 = all positive.
  // Weighted by word frequency (value). Neutral words don't move the needle.
  function computeSentimentScore(words) {
    var posW = 0, negW = 0;
    words.forEach(function (w) {
      var s = (w.sentiment || '').toLowerCase();
      if (s === 'positive') posW += w.value;
      else if (s === 'negative') negW += w.value;
    });
    var total = posW + negW;
    if (total === 0) return 50;
    return Math.round((posW / total) * 100);
  }

  // Interpolate a hex colour on the red→amber→green gradient at t ∈ [0,1]
  function sentimentColor(score) {
    if (score >= 61) return '#00C875';  // Positive bands — green
    if (score >= 41) return '#F5C842';  // Mixed — amber
    return '#FF3B5C';                   // Negative bands — red
  }

  function sentimentLabel(score) {
    if (score >= 90) return 'Overwhelmingly Positive';
    if (score >= 75) return 'Very Positive';
    if (score >= 61) return 'Mostly Positive';
    if (score >= 41) return 'Mixed';
    if (score >= 25) return 'Mostly Negative';
    if (score >= 11) return 'Very Negative';
    return 'Overwhelmingly Negative';
  }

  function updateSentimentUI(words, barId, scoreId, markerId, tagId, tagDotId, tagValueId) {
    var barEl   = document.getElementById(barId);
    var scoreEl = document.getElementById(scoreId);
    var markerEl = document.getElementById(markerId);
    var tagEl   = document.getElementById(tagId);
    var tagDotEl = document.getElementById(tagDotId);
    var tagValEl = document.getElementById(tagValueId);

    if (!barEl || !words || !words.length) {
      if (barEl) barEl.hidden = true;
      if (tagEl) tagEl.hidden = true;
      return;
    }

    var score = computeSentimentScore(words);
    var color = sentimentColor(score);

    // Update bar
    barEl.hidden = false;
    if (markerEl) { markerEl.style.left = score + '%'; markerEl.style.borderColor = color; markerEl.style.color = color; markerEl.dataset.score = score; }

    // Update tag
    if (tagEl) {
      tagEl.hidden = false;
      if (tagDotEl) tagDotEl.style.background = color;
      if (tagValEl) { tagValEl.textContent = sentimentLabel(score); tagValEl.style.color = color; }
    }
  }

  // ── Renderer ───────────────────────────────────────────────────────────────

  function renderWordCloud(words, canvas) {
    ensureWordCloudTooltip(canvas);
    hideWordCloudTooltip(canvas);
    canvas.__wcHitRegions = [];

    var layout = getWordCloudLayout(canvas);
    var dpr    = window.devicePixelRatio || 1;
    var cssW   = layout.cssW;
    var cssH   = layout.cssH;
    var xyRatio = layout.xyRatio;

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

    // Sort descending and trim the cloud harder on smaller screens.
    var sorted = words.slice().sort(function (a, b) { return b.value - a.value; }).slice(0, layout.wordLimit);
    if (!sorted.length) return;

    var maxVal = sorted[0].value;
    var minVal = sorted[sorted.length - 1].value;
    var range  = maxVal - minVal || 1;
    var placed = [];
    var anchors = getWordCloudAnchors(layout);

    sorted.forEach(function (item, idx) {
      var normalized = (item.value - minVal) / range;
      var t      = Math.pow(normalized, layout.sizeExponent);
      var size   = Math.round(layout.minSize + t * (layout.maxSize - layout.minSize));
      var sentiment = (item.sentiment || '').toLowerCase();
      var color = SENTIMENT_COLORS[sentiment] || SENTIMENT_FALLBACK;
      var startAngle = idx * 2.39996;
      var anchorStart = idx < 4 ? 0 : idx % anchors.length;
      var placedWord = false;

      for (var shrink = 0; shrink < layout.shrinkPasses; shrink++) {
        var attemptSize = Math.max(layout.minSize, size - shrink * layout.shrinkStep);
        var weight = attemptSize > layout.maxSize * 0.62 ? '700' : attemptSize > layout.minSize + 7 ? '600' : '400';
        ctx.font = weight + ' ' + attemptSize + 'px "Space Grotesk", Inter, system-ui, sans-serif';

        var metrics = measureWord(ctx, item.word, attemptSize);
        var maxWordWidth = Math.max(48, cssW - layout.edgePadX * 2 - 4);
        if (metrics.width > maxWordWidth) {
          var fittedSize = Math.max(layout.minSize, Math.floor(attemptSize * (maxWordWidth / metrics.width)));
          if (fittedSize < attemptSize) {
            attemptSize = fittedSize;
            weight = attemptSize > layout.maxSize * 0.62 ? '700' : attemptSize > layout.minSize + 7 ? '600' : '400';
            ctx.font = weight + ' ' + attemptSize + 'px "Space Grotesk", Inter, system-ui, sans-serif';
            metrics = measureWord(ctx, item.word, attemptSize);
          }
        }

        var tw = metrics.width;
        var th = metrics.height;

        // Keep large-word glow on roomy layouts, but tone it down on mobile.
        if (!layout.compact && attemptSize > 32) {
          ctx.shadowColor = color;
          ctx.shadowBlur  = attemptSize > 44 ? 14 : 8;
        } else {
          ctx.shadowBlur = 0;
        }

        var boxPadX = layout.compact ? (attemptSize > 24 ? 2 : 1) : (attemptSize > 34 ? 2 : 1);
        var boxPadY = layout.compact ? (attemptSize > 24 ? 3 : 1) : (attemptSize > 34 ? 3 : 2);

        for (var anchorPass = 0; anchorPass < Math.min(layout.anchorPasses, anchors.length); anchorPass++) {
          var anchor = anchors[(anchorStart + anchorPass) % anchors.length];
          var anchorCx = cssW * anchor.x;
          var anchorCy = cssH * anchor.y;

          for (var i = 0; i < layout.attempts; i++) {
            var theta = i * layout.spiralStep;
            var r     = layout.spiralRadius * theta;
            var angle = startAngle + theta;
            var cx    = anchorCx + r * Math.cos(angle);
            var cy    = anchorCy + r * Math.sin(angle) * xyRatio;
            var x     = cx - tw / 2;
            var y     = cy + metrics.ascent - th / 2;

            // Reject positions outside canvas
            if (x < layout.edgePadX || x + tw > cssW - layout.edgePadX ||
                y - metrics.ascent < layout.edgePadY || y + metrics.descent > cssH - layout.edgePadY) continue;

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
              placedWord = true;
              break;
            }
          }

          if (placedWord) {
            break;
          }
        }

        if (placedWord || attemptSize === layout.minSize) {
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
        if (r.b && bakeries.indexOf(r.b) === -1) bakeries.push(mapBakeryName(r.b));
      });
      if (bakeries.length > 0) body.bakery_locations = bakeries;
    }
    if (state && state.selectedMonths && state.selectedMonths.length) {
      body.start_date = monthLabelToIso(state.selectedMonths[0], false);
      body.end_date   = monthLabelToIso(state.selectedMonths[state.selectedMonths.length - 1], true);
    }

    var paramsKey = buildWcParamsKey(body);
    var prevInfo  = buildPrevPeriodInfo(state && state.selectedMonths, state && state.MONTHS);

    // Skip the API call if filters haven't changed and we already have a result
    if (!force && paramsKey === lastWcParamsKey && lastWordData !== null) {
      if (lastWordData.length) {
        renderWordCloud(lastWordData, canvas);
        updateSentimentUI(lastWordData, 'wcSentimentBar', 'wcSentimentScore', 'wcSentimentMarker', 'wcSentimentTag', 'wcSentimentTagDot', 'wcSentimentTagValue');
        renderNegativesPanel(lastWordData, 'wcNegPanel', 'wcNegList');
      }
      if (lastPrevWcParamsKey === paramsKey && lastPrevWordData && lastPrevWordData.length && lastWordData.length) {
        var cachedDrift = computeWordDrift(lastWordData, lastPrevWordData);
        renderDriftPanel(cachedDrift, lastPrevPeriodLabel, 'wcDriftPanel', 'wcDriftPrevLabel', 'wcDriftRising', 'wcDriftFalling');
      } else {
        hideDriftPanel('wcDriftPanel');
      }
      return;
    }

    if (statusEl) { statusEl.textContent = 'Loading\u2026'; statusEl.className = 'status'; }
    if (emptyEl)  emptyEl.style.display = 'none';
    hideDriftPanel('wcDriftPanel');
    hideWordCloudTooltip(canvas);
    canvas.__wcHitRegions = [];

    var currentFetch = fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });

    var prevBody = prevInfo
      ? Object.assign({}, body, { start_date: prevInfo.startDate, end_date: prevInfo.endDate })
      : null;

    var prevFetch = prevBody
      ? fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prevBody)
        }).then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; })
      : Promise.resolve(null);

    Promise.all([currentFetch, prevFetch])
    .then(function (results) {
      var data     = results[0];
      var prevData = results[1];

      lastWcParamsKey = paramsKey;
      var words = data.word_cloud || data.word_cloud_data || data;
      var totalSurveys = data.total_surveys_sampled != null ? data.total_surveys_sampled : null;
      if (!Array.isArray(words) || words.length === 0) {
        if (statusEl) { statusEl.textContent = 'No feedback data found for this selection.'; statusEl.className = 'status'; }
        if (emptyEl)  emptyEl.style.display = '';
        lastWordData = [];
        hideWordCloudTooltip(canvas);
        updateSentimentUI([], 'wcSentimentBar', 'wcSentimentScore', 'wcSentimentMarker', 'wcSentimentTag', 'wcSentimentTagDot', 'wcSentimentTagValue');
        renderNegativesPanel([], 'wcNegPanel', 'wcNegList');
        hideDriftPanel('wcDriftPanel');
        return;
      }
      lastWordData = words;
      var statusText = words.length + ' words';
      if (totalSurveys !== null) statusText += ' \u00b7 ' + totalSurveys.toLocaleString() + ' surveys';
      if (statusEl) { statusEl.textContent = statusText; statusEl.className = 'status success'; }
      renderWordCloud(words, canvas);
      updateSentimentUI(words, 'wcSentimentBar', 'wcSentimentScore', 'wcSentimentMarker', 'wcSentimentTag', 'wcSentimentTagDot', 'wcSentimentTagValue');
      renderNegativesPanel(words, 'wcNegPanel', 'wcNegList');

      // Drift panel
      if (prevData && prevInfo) {
        var prevWords = prevData.word_cloud || prevData.word_cloud_data || prevData;
        if (Array.isArray(prevWords) && prevWords.length) {
          lastPrevWordData     = prevWords;
          lastPrevWcParamsKey  = paramsKey;
          lastPrevPeriodLabel  = prevInfo.label;
          var drift = computeWordDrift(words, prevWords);
          renderDriftPanel(drift, prevInfo.label, 'wcDriftPanel', 'wcDriftPrevLabel', 'wcDriftRising', 'wcDriftFalling');
        } else {
          lastPrevWordData = [];
          lastPrevWcParamsKey = paramsKey;
          hideDriftPanel('wcDriftPanel');
        }
      } else {
        hideDriftPanel('wcDriftPanel');
      }
    })
    .catch(function (err) {
      console.error('Word cloud error:', err);
      if (statusEl) { statusEl.textContent = 'Failed to load: ' + err.message; statusEl.className = 'status error'; }
      hideWordCloudTooltip(canvas);
      updateSentimentUI([], 'wcSentimentBar', 'wcSentimentScore', 'wcSentimentMarker', 'wcSentimentTag', 'wcSentimentTagDot', 'wcSentimentTagValue');
      renderNegativesPanel([], 'wcNegPanel', 'wcNegList');
      hideDriftPanel('wcDriftPanel');
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
      var isAbsoluteTarget = state && state.targetMetric !== 'relative';
      var targetBf = isAbsoluteTarget ? 'acb' : 'cb';
      var targetHigh = isAbsoluteTarget ? 'Below Standard' : 'Needs Attention';
      var targetLow = isAbsoluteTarget ? 'Approaching' : 'Developing';
      filtered.forEach(function (r) {
        if ((r[targetBf] === targetHigh || r[targetBf] === targetLow) && r.b && bakeries.indexOf(r.b) === -1) {
          bakeries.push(mapBakeryName(r.b));
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
        updateSentimentUI([], 'wcTargetSentimentBar', 'wcTargetSentimentScore', 'wcTargetSentimentMarker', 'wcTargetSentimentTag', 'wcTargetSentimentTagDot', 'wcTargetSentimentTagValue');
        return;
      }
      lastTargetWordData = words;
      var statusText = words.length + ' words';
      if (totalSurveys !== null) statusText += ' \u00b7 ' + totalSurveys.toLocaleString() + ' surveys';
      if (statusEl) { statusEl.textContent = statusText; statusEl.className = 'status success'; }
      renderWordCloud(words, canvas);
      updateSentimentUI(words, 'wcTargetSentimentBar', 'wcTargetSentimentScore', 'wcTargetSentimentMarker', 'wcTargetSentimentTag', 'wcTargetSentimentTagDot', 'wcTargetSentimentTagValue');
    })
    .catch(function (err) {
      console.error('Target word cloud error:', err);
      if (statusEl) { statusEl.textContent = 'Failed to load: ' + err.message; statusEl.className = 'status error'; }
      hideWordCloudTooltip(canvas);
      updateSentimentUI([], 'wcTargetSentimentBar', 'wcTargetSentimentScore', 'wcTargetSentimentMarker', 'wcTargetSentimentTag', 'wcTargetSentimentTagDot', 'wcTargetSentimentTagValue');
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
