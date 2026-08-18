// ========== VISIT REPORT MODAL ==========
// Full breakdown of a single Routine Coffee Visit, opened by clicking the
// "Last visited" line in a map popup (see js/targets.js getPopupHtml).
window.GAILS = window.GAILS || {};

(function () {
  var lockedScrollY = 0;
  var CHART_ID = 'visitReportScoreChart';
  var WAIT_TIME_TARGET_SECONDS = 120;
  var saveConfirmReturnFocus = null;
  var visitReportReturnFocus = null;
  var visitReportSectionSpy = null;
  var visitReportContextMap = null;
  var visitReportContextRun = 0;
  var visitWeatherCache = Object.create(null);
  var OPEN_METEO_ARCHIVE_ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive';
  var VISIT_MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var escapeHtml = GAILS.escapeHtml;

  // ── Bakery Reports visibility scope ──
  // When an admin turns the master switch on (appSettings/reportVisibility) and
  // a user has been given a patch — the ops areas or regions they look after
  // (users/{uid}.patch) — that user only sees Bakery Reports for their own
  // bakeries. Admins, users with no patch, and everyone when the switch is off,
  // see every site. This is a client-side visibility control applied to the
  // Bakery Reports tab only — see the auth flow in js/auth.js, which populates
  // GAILS.userPatch, GAILS.userOpsArea and GAILS.reportVisibilityEnabled.
  //
  // The patch is resolved rather than compared by name, so an ops area renamed
  // after its manager left still matches. js/patch.js explains why that matters;
  // GAILS.userOpsArea remains the fallback for a profile saved before patches
  // existed, and for a page that has not loaded js/patch.js.
  function reportPatchBakeries() {
    var G = window.GAILS;
    if (!G.userPatch || !G.Patch) return null;
    var bakeries = G.Patch.patchBakeries(G.userPatch, G.BAKERY_META);
    return bakeries.length ? bakeries : null;
  }

  function reportScopeActive() {
    var G = window.GAILS;
    if (G.isAdmin || !G.reportVisibilityEnabled) return false;
    return !!reportPatchBakeries() || !!G.userOpsArea;
  }

  function reportBakeryAllowed(bakery) {
    if (!reportScopeActive()) return true;
    var G = window.GAILS;
    var patch = reportPatchBakeries();
    if (patch) {
      var key = G.resolveBakeryMetaKey ? G.resolveBakeryMetaKey(bakery) : bakery;
      return patch.some(function (name) {
        return (G.resolveBakeryMetaKey ? G.resolveBakeryMetaKey(name) : name) === key;
      });
    }
    return (G.getBakeryOps ? G.getBakeryOps(bakery) : '') === G.userOpsArea;
  }

  // Exposed so the Bakery Reports scope is unit-testable and reusable.
  window.GAILS.reportBakeryAllowed = reportBakeryAllowed;
  window.GAILS.reportScopeActive = reportScopeActive;

  function lockBackgroundScroll() {
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.classList.add('drill-modal-open');
    document.body.classList.add('drill-modal-open');
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + lockedScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
  }

  function unlockBackgroundScroll() {
    document.documentElement.classList.remove('drill-modal-open');
    document.body.classList.remove('drill-modal-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    window.scrollTo(0, lockedScrollY);
  }

  // The print stylesheet prints the report on its own by hiding everything
  // else on the host page, so it is scoped to this class and only applies
  // while the report is genuinely open. Every page that hosts the report
  // (dashboard, My Activity, My Team, Bakery Profile) therefore prints the
  // same way, and a plain Ctrl+P with no report open still prints the page.
  function showVisitReportModal(modal) {
    var wasHidden = modal.style.display === 'none';
    if (wasHidden && document.activeElement && document.activeElement !== document.body) {
      visitReportReturnFocus = document.activeElement;
    }
    modal.style.display = 'flex';
    document.body.classList.add('visit-report-open');
    if (wasHidden && modal.querySelector) {
      var closeButton = modal.querySelector('.modal-close-btn');
      if (closeButton && closeButton.focus) closeButton.focus();
    }
  }

  function hideVisitReportModal(modal) {
    modal.style.display = 'none';
    stopVisitReportSectionSpy();
    resetVisitReportContext();
    document.body.classList.remove('visit-report-open');
    if (visitReportReturnFocus && visitReportReturnFocus.focus) visitReportReturnFocus.focus();
    visitReportReturnFocus = null;
  }

  function setVisitReportPresentation(kind, record) {
    var modal = document.getElementById('visitReportModal');
    var eyebrow = document.getElementById('visitReportEyebrow');
    var badge = document.getElementById('visitReportTypeBadge');
    var inner = modal && modal.querySelector ? modal.querySelector('.drillInner') : null;
    var presentations = {
      // Accents match the same visit-type badge/chip colours used elsewhere
      // (.admin-badge--*/.admin-table-badge--*, visitTypeTone()): gold for
      // routine, red for CQV and its follow-up, purple for NBO (both
      // the coffee visit and the opening variant), and blue for check-ins.
      routine: { eyebrow: 'Bakery report', badge: 'Routine visit', accent: '#C97F12', maxWidth: 1180 },
      cqv: { eyebrow: 'Quality assurance', badge: 'CQV', accent: '#B22A24', maxWidth: 1180 },
      followup: { eyebrow: 'Quality follow-up', badge: 'CQV follow-up', accent: '#B22A24', maxWidth: 1180 },
      nbo: { eyebrow: 'Opening support', badge: 'NBO coffee visit', accent: '#6B4FA8', maxWidth: 1060 },
      checkin: { eyebrow: 'Bakery report', badge: 'Check-in', accent: '#0D7CA0', maxWidth: 1180 },
      opening: { eyebrow: 'Opening support', badge: 'NBO opening', accent: '#6B4FA8', maxWidth: 1180 },
      empty: { eyebrow: 'Bakery report', badge: 'No visit yet', accent: '#928978', maxWidth: 640 },
      error: { eyebrow: 'Bakery report', badge: 'Unavailable', accent: '#B22A24', maxWidth: 640 }
    };
    var presentation = presentations[kind] || presentations.routine;
    if (eyebrow) eyebrow.textContent = presentation.eyebrow;
    if (badge) badge.textContent = presentation.badge;
    if (inner && inner.style) {
      inner.style.setProperty('--drill-accent', presentation.accent);
      inner.style.setProperty('--visit-report-max-width', presentation.maxWidth + 'px');
    }
    if (modal && modal.dataset) modal.dataset.reportType = kind;
  }

  function visitReportHeadingLabel(heading) {
    if (!heading) return '';
    var directText = '';
    if (heading.childNodes) {
      Array.prototype.forEach.call(heading.childNodes, function(node) {
        if (node.nodeType === 3) directText += ' ' + node.textContent;
      });
    }
    // Direct text deliberately excludes status tags nested inside the h4,
    // such as the second “Health & Safety” shown on that report section.
    return (directText || heading.textContent || '').replace(/\s+/g, ' ').trim().replace(/\s*\(.*\)$/, '');
  }

  // Holds the teardown for the rail's scroll listeners while a report is open.
  function stopVisitReportSectionSpy() {
    if (visitReportSectionSpy) visitReportSectionSpy();
    visitReportSectionSpy = null;
  }

  // The empty and error states replace the body without going through
  // enhanceVisitReportBody, so they clear the layout classes a previously
  // shown report left behind.
  function resetVisitReportBodyLayout(bodyEl) {
    stopVisitReportSectionSpy();
    resetVisitReportContext();
    if (bodyEl && bodyEl.classList) {
      bodyEl.classList.remove('visit-report-body--enhanced', 'visit-report-body--railed');
    }
  }

  // Keeps the rail entry for the section being read inside the jump list's own
  // scroll box. The list scrolls internally on reports with more sections than
  // the rail is tall, so without this the entry saying "you are here" could be
  // the one entry you cannot see. The 14px margin clears the fade at the
  // bottom edge, so the current entry never arrives half-faded.
  // Handles both orientations: the list is a vertical rail on a wide screen and
  // a horizontal pill bar below 1080px, and an entry can be out of sight in
  // either. Only the axis that actually overflows is touched.
  function keepRailLinkVisible(list, link) {
    if (!list || !link || !list.getBoundingClientRect) return;
    var listBox = list.getBoundingClientRect();
    var linkBox = link.getBoundingClientRect();
    var margin = 14;

    if (list.scrollHeight > list.clientHeight + 2) {
      if (linkBox.top < listBox.top + margin) {
        list.scrollTop -= (listBox.top + margin) - linkBox.top;
      } else if (linkBox.bottom > listBox.bottom - margin) {
        list.scrollTop += linkBox.bottom - (listBox.bottom - margin);
      }
    }

    if (list.scrollWidth > list.clientWidth + 2) {
      if (linkBox.left < listBox.left + margin) {
        list.scrollLeft -= (listBox.left + margin) - linkBox.left;
      } else if (linkBox.right > listBox.right - margin) {
        list.scrollLeft += linkBox.right - (listBox.right - margin);
      }
    }
  }

  // Highlights the rail entry for the section being read. A rail that never
  // says where you are is just a link list.
  //
  // A click on a jump link wins outright until the reader scrolls again. The
  // sections sit in a multi-column grid, so several share a top edge, and the
  // edge-crossing rule below always resolves such a row to its first member —
  // which meant clicking "Equipment" scrolled to Equipment and then lit up
  // "Service", the section next to it. What you asked for is what gets marked.
  //
  // Scroll position measures on scroll rather than using an IntersectionObserver
  // band: a band narrow enough to mean "at the top" leaves dead zones where a
  // tall section spans it and nothing is reported at all.
  function trackVisitReportSection(nav, scroller) {
    stopVisitReportSectionSpy();
    if (!nav.querySelectorAll || !scroller.addEventListener) return;

    var links = {};
    var order = [];
    Array.prototype.forEach.call(nav.querySelectorAll('a[href^="#visitReportSection"]'), function(link) {
      var id = link.getAttribute('href').slice(1);
      links[id] = link;
      order.push(id);
    });
    if (!order.length) return;

    var frame = null;
    var list = nav.querySelector('div');
    var lastCurrent = null;
    var pinnedId = null;
    var pinnedAt = 0;
    var lastScrollTop = scroller.scrollTop;
    var scrollingDown = true;

    // The card, not the heading: a section counts as being read for as long as
    // any of it is on screen, and only the card knows where it ends.
    function sectionBox(id) {
      var heading = document.getElementById(id);
      if (!heading || !heading.getBoundingClientRect) return null;
      var card = heading.closest ? heading.closest('.visit-report-section') : null;
      return (card || heading).getBoundingClientRect();
    }

    function applyCurrent(current) {
      order.forEach(function(id) {
        if (id === current) links[id].setAttribute('aria-current', 'true');
        else links[id].removeAttribute('aria-current');
      });
      // Only when the section actually changes, so this never fights a reader
      // who is scrolling the jump list by hand.
      if (current !== lastCurrent) {
        lastCurrent = current;
        keepRailLinkVisible(list, links[current]);
      }
    }

    function update() {
      frame = null;
      if (pinnedId) {
        applyCurrent(pinnedId);
        return;
      }

      var edge = scroller.getBoundingClientRect().top + 24;
      var currentTop = -Infinity;
      var current = order[0];

      order.forEach(function(id) {
        var box = sectionBox(id);
        if (!box) return;
        // The last card to have passed the top edge is the one being read.
        // Sections sharing a grid row share a top, and `>` keeps the first of
        // that row rather than the last.
        if (box.top <= edge && box.top > currentTop) {
          currentTop = box.top;
          current = id;
        }
      });

      // A short trailing section can sit fully on screen without ever reaching
      // the edge line, because the pane runs out of room to scroll before that
      // happens — the edge-crossing loop above then keeps pointing at whatever
      // section preceded it. Once there's nowhere further to scroll, the last
      // section is what's being read, full stop.
      var canScroll = scroller.scrollHeight > scroller.clientHeight + 4;
      if (canScroll && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
        current = order[order.length - 1];
      }

      // The highlight only ever travels the way the reader is travelling.
      //
      // Two or three sections share a grid row and therefore share a top edge,
      // and the rule above always resolves such a row to its first member — so
      // scrolling down out of "Maintenance" handed the highlight backwards to
      // "Drink Quality" sitting beside it. Cards in a row are different heights
      // (Drink Quality has twelve rows, Maintenance eight), so this holds even
      // once the marked card has scrolled off the top while its taller
      // neighbour is still on screen: the test cannot be "is it still visible",
      // it has to be direction alone. A candidate that would move the highlight
      // against the direction of travel is ignored outright, and the row is
      // left behind only when the next one arrives.
      if (lastCurrent) {
        var currentIndex = order.indexOf(current);
        var lastIndex = order.indexOf(lastCurrent);
        if (scrollingDown ? currentIndex < lastIndex : currentIndex > lastIndex) {
          current = lastCurrent;
        }
      }

      applyCurrent(current);
    }

    function schedule() {
      if (frame !== null) return;
      frame = window.requestAnimationFrame ? window.requestAnimationFrame(update) : setTimeout(update, 16);
    }

    // Direction is read here rather than inside update(), which runs a frame
    // later and would compare against a position that has already moved on.
    function onScroll() {
      var top = scroller.scrollTop;
      if (top !== lastScrollTop) {
        scrollingDown = top > lastScrollTop;
        lastScrollTop = top;
      }
      schedule();
    }

    // Scrolling is handled here rather than by the anchor's default jump, so
    // that reading four sections doesn't leave four hash entries stacked up
    // behind the browser's Back button.
    function onNavClick(event) {
      var link = event.target && event.target.closest
        ? event.target.closest('a[href^="#visitReportSection"]')
        : null;
      if (!link || !nav.contains(link)) return;
      var id = link.getAttribute('href').slice(1);
      var heading = document.getElementById(id);
      if (!heading) return;
      event.preventDefault();
      pinnedId = id;
      pinnedAt = Date.now();
      applyCurrent(id);
      if (heading.scrollIntoView) heading.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function pinnedIsOnScreen() {
      var box = sectionBox(pinnedId);
      // A section that has left the DOM must not hold the pin for ever.
      if (!box) return true;
      var view = scroller.getBoundingClientRect();
      return box.bottom > view.top + 10 && box.top < view.bottom - 10;
    }

    // A pin is released by the reader moving themselves, not by the smooth
    // scroll the click started — which is why this listens for the input
    // events rather than for scroll.
    //
    // It also waits until that scroll has actually delivered the section. A
    // wheel a moment after the click would otherwise release the pin while the
    // pane was still travelling, handing the highlight straight back to
    // whatever sits at the top — the very thing the click moved away from.
    // Once the section is on screen the release is safe, because the
    // direction-of-travel rule in update() then holds the highlight there.
    function releasePin() {
      if (!pinnedId) return;
      if (!pinnedIsOnScreen() && Date.now() - pinnedAt < 2000) return;
      pinnedId = null;
      schedule();
    }

    nav.addEventListener('click', onNavClick);
    scroller.addEventListener('wheel', releasePin, { passive: true });
    scroller.addEventListener('touchstart', releasePin, { passive: true });
    scroller.addEventListener('keydown', releasePin);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', schedule);

    // The first measurement cannot be taken here. enhanceVisitReportBody runs
    // while the modal is still display:none, so every rect is zero and nothing
    // reads as on screen — which used to leave the whole rail unmarked except
    // for the order[0] fallback until the reader scrolled. Measuring is
    // deferred to after the panel is shown, and a ResizeObserver re-measures
    // when the content settles (drawPointsChart sets the chart's height inline
    // a frame later, which moves everything below it).
    schedule();
    var sizeSpy = null;
    if (typeof window.ResizeObserver === 'function') {
      sizeSpy = new window.ResizeObserver(schedule);
      sizeSpy.observe(scroller);
    }

    visitReportSectionSpy = function() {
      nav.removeEventListener('click', onNavClick);
      scroller.removeEventListener('wheel', releasePin);
      scroller.removeEventListener('touchstart', releasePin);
      scroller.removeEventListener('keydown', releasePin);
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', schedule);
      if (sizeSpy) sizeSpy.disconnect();
    };
  }

  function enhanceVisitReportBody(bodyEl) {
    if (!bodyEl || !bodyEl.querySelectorAll || !document.createElement) return;
    // The body has just been re-rendered, so any rail listeners from the
    // report before this one are watching detached nodes.
    stopVisitReportSectionSpy();
    if (bodyEl.classList) bodyEl.classList.add('visit-report-body--enhanced');

    // The source-PDF link (CQV, CQV follow-up, NBO) starts out as its own
    // near-empty card. Below, once a section rail exists, that link is moved
    // into it and its now-empty carrier wrapper is dropped — so it's excluded
    // from the section/nav bookkeeping here.
    var pdfLink = bodyEl.querySelector ? bodyEl.querySelector('.visit-report-pdf-btn') : null;
    var pdfWrapper = pdfLink && pdfLink.parentNode ? pdfLink.parentNode : null;

    var wrappers = Array.prototype.slice.call(bodyEl.querySelectorAll('.visit-report-section-wrapper'))
      .filter(function(wrapper) { return wrapper !== pdfWrapper; });
    var sections = [];
    var narrowCount = 0;

    wrappers.forEach(function(wrapper, index) {
      var heading = wrapper.querySelector ? wrapper.querySelector('h4') : null;
      var label = visitReportHeadingLabel(heading);
      var isWide = !!(wrapper.querySelector && wrapper.querySelector(
        '.visit-report-chart-wrap, .visit-report-hs-banner, .visit-report-section--comments'
      ));
      if (/^(summary|action plan|coaching notes)/i.test(label)) isWide = true;
      if (isWide && wrapper.classList) wrapper.classList.add('visit-report-section-wrapper--wide');
      if (!isWide) narrowCount += 1;
      if (!heading || !label) return;
      heading.id = 'visitReportSection' + (index + 1);
      sections.push({ id: heading.id, label: label });
    });

    var nav = null;
    if (sections.length >= 2) {
      nav = document.createElement('nav');
      nav.className = 'visit-report-toc';
      nav.setAttribute('aria-label', 'Report sections');
      nav.innerHTML = '<span>Jump to</span><div>' + sections.map(function(section) {
        return '<a href="#' + escapeHtml(section.id) + '">' + escapeHtml(section.label) + '</a>';
      }).join('') + '</div>';
      if (pdfLink && pdfWrapper) {
        nav.appendChild(pdfLink);
        if (pdfWrapper.parentNode) pdfWrapper.parentNode.removeChild(pdfWrapper);
      }
    }

    // Split the panel into a persistent section rail and a scrolling content
    // pane. The quick stats sit above "Jump to" inside that rail instead of
    // consuming a full-width row, so report content can begin immediately
    // below the header. Previously the navigation was part of the one scrolling
    // column and slid away with the report it was navigating.
    var summary = bodyEl.querySelector ? bodyEl.querySelector('.drill-summary') : null;
    if (summary && summary.parentNode !== bodyEl) summary = null;

    var layout = document.createElement('div');
    layout.className = 'visit-report-layout';
    var content = document.createElement('div');
    content.className = 'visit-report-content';
    // This element is the report's scroller, and on a routine visit it holds no
    // focusable children at all — so without a tab stop of its own a keyboard
    // user could reach the header controls and the rail and still have no way
    // to scroll the report they came to read.
    content.setAttribute('tabindex', '0');
    content.setAttribute('role', 'region');
    content.setAttribute('aria-label', 'Report content');
    // The sections grid is sized to how many narrow sections there actually
    // are, not to how many would fit. A CQV has exactly two (Score by Category
    // and Score by Section); an auto-fit grid gave it three tracks and left
    // the third standing empty, because the full-width Action Plan below it
    // keeps that track from ever collapsing. The -md value is the same count
    // capped for the mid-width breakpoint, since an inline custom property
    // cannot be overridden from a media query.
    content.style.setProperty('--report-cols', Math.max(1, Math.min(3, narrowCount)));
    content.style.setProperty('--report-cols-md', Math.max(1, Math.min(2, narrowCount)));

    Array.prototype.slice.call(bodyEl.children).forEach(function(child) {
      if (child !== summary) content.appendChild(child);
    });

    if (nav) {
      var rail = document.createElement('aside');
      rail.className = 'visit-report-rail';
      if (summary) rail.appendChild(summary);
      rail.appendChild(nav);
      layout.appendChild(rail);
    }
    layout.appendChild(content);
    // Reports without enough sections for a rail keep their summary above the
    // layout; analytical reports move it into the rail above the section links.
    bodyEl.appendChild(layout);

    if (bodyEl.classList) bodyEl.classList.toggle('visit-report-body--railed', !!nav);
    if (nav) trackVisitReportSection(nav, content);
  }

  function trapVisitReportFocus(event, modal) {
    if (event.key !== 'Tab' || !modal.querySelectorAll) return false;
    var focusable = Array.prototype.slice.call(modal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )).filter(function(element) { return !element.hidden && element.offsetParent !== null; });
    if (!focusable.length) return false;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
    return true;
  }

  function formatVisitDate(isoDate) {
    if (!isoDate) return 'Unknown date';
    var d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  // Follow-up cards pack their due pill and footnotes onto single dense rows,
  // so they use the short date form My Activity and My Team already use. The
  // long weekday form above stays for visit dates, where the day of the week
  // is part of what you are reading for.
  function formatFollowUpDate(iso) {
    var d = new Date(String(iso || '').slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return String(iso || '');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // Same pill as every other status on every other report type. The failed
  // answers used to carry a ⚠ glyph and a red ring on top of the red text and
  // the tinted row behind them — the same single fact said four ways over.
  var YNNA_COLORS = { Yes: '#1D8A55', No: '#B22A24', 'N/A': '#7E776C' };

  function ynnaPill(value) {
    return pillHtml(value || '—', { color: YNNA_COLORS[value] || '#8C8272' });
  }

  // ── Shared report primitives ──
  // The four report types used to build the same conceptual things out of
  // different components: three section-heading idioms, three row idioms, five
  // pill families and six ways of drawing a block of prose. Everything below is
  // the single version of each, and every builder now goes through it, so a
  // routine visit, a CQV, a follow-up and an NBO read as one document type.

  // One heading for every section on every report: an optional uppercase
  // eyebrow, the title in ink, an optional caption under it (not right-aligned
  // across the card, where it used to sit a screen's width from the title it
  // modified), and an optional status chip pinned right.
  function sectionHeadingHtml(options) {
    var o = options || {};
    return '<div class="visit-report-section-heading">' +
      '<div class="visit-report-section-heading__text">' +
      (o.eyebrow ? '<span class="visit-report-section-eyebrow">' + escapeHtml(o.eyebrow) + '</span>' : '') +
      '<h4>' + escapeHtml(o.title) + '</h4>' +
      (o.caption ? '<p class="visit-report-section-caption">' + escapeHtml(o.caption) + '</p>' : '') +
      '</div>' +
      (o.chip || '') +
      '</div>';
  }

  // One pill. Colour arrives as data through --pill-color rather than through a
  // modifier class per status, which is what stopped the previous five families
  // (visit-pill / visit-action-tag / visit-response-pill / visit-section-attention
  // / visit-report-hs-tag) from being able to share a rule.
  function pillHtml(text, options) {
    var o = options || {};
    var cls = 'visit-pill' + (o.solid ? ' visit-pill--solid' : '') + (o.className ? ' ' + o.className : '');
    var style = o.color ? ' style="--pill-color:' + escapeHtml(o.color) + ';"' : '';
    return '<span class="' + cls + '"' + style + '>' + escapeHtml(text) + '</span>';
  }

  // One block of prose. `label` gives it the eyebrow that "Notes" and "Action
  // required" both used to draw their own way; `tone` picks the accent. The
  // straight left rule is drawn by CSS with the adjoining corners squared —
  // a side rule and a rounded corner may never meet, or the rule renders as a
  // curved sliver instead of a line.
  function noteBlockHtml(value, options) {
    var o = options || {};
    var paragraphs = String(value == null ? '' : value).split(/\r?\n+/).map(function (para) {
      var text = para.trim();
      return text ? '<p class="visit-report-comment">' + escapeHtml(text) + '</p>' : '';
    }).join('');
    if (!paragraphs) return '';
    return '<div class="visit-report-noteblock' + (o.tone ? ' visit-report-noteblock--' + o.tone : '') + '">' +
      (o.label ? '<span class="visit-report-noteblock__label">' + escapeHtml(o.label) + '</span>' : '') +
      paragraphs +
      '</div>';
  }

  // A section's write-up is the only long-form prose on a card otherwise made
  // of one-line checklist rows, so it gets its own labelled block rather than
  // trailing off the last row. Line breaks the Coffee Partner typed become
  // paragraphs — their numbered recommendations were being flattened into one
  // unbroken run of text.
  function renderSectionNotes(value) {
    return noteBlockHtml(value, { label: 'Notes' });
  }

  function renderPhotoLinks(urls) {
    if (!Array.isArray(urls) || !urls.length) return '';
    return '<div class="visit-report-photos">' + urls.map(function (url) {
      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">Photo &#8599;</a>';
    }).join('') + '</div>';
  }

  function renderSection(section, data, hsIssues) {
    var isHs = section.key === 'healthSafety';
    var rows = [];
    var comments = '';
    var photos = '';

    window.visibleSectionFields(section, data).forEach(function (field) {
      var value = window.getFieldValue(data, field);
      if (field.type === 'ynna') {
        var failed = value === 'No';
        if (isHs && failed) hsIssues.push(field.label);
        rows.push(
          '<div class="visit-report-row' + (isHs && failed ? ' visit-report-row--flag' : '') + '">' +
          '<span class="visit-report-row__label">' + escapeHtml(field.label) + '</span>' +
          ynnaPill(value) +
          '</div>'
        );
      } else if (field.type === 'scale') {
        var scaleText = (value != null && value !== '') ? value + ' / 10' : '—';
        rows.push(
          '<div class="visit-report-row">' +
          '<span class="visit-report-row__label">' + escapeHtml(field.label) + '</span>' +
          '<span class="visit-report-row__value">' + escapeHtml(scaleText) + '</span>' +
          '</div>'
        );
      } else if (field.type === 'number' && field.key === 'avgWaitTimeSeconds') {
        var overTarget = value != null && value !== '' && Number(value) > WAIT_TIME_TARGET_SECONDS;
        var waitText = (value != null && value !== '') ? value + 's (target ≤ ' + WAIT_TIME_TARGET_SECONDS + 's)' : '—';
        rows.push(
          '<div class="visit-report-row' + (overTarget ? ' visit-report-row--flag' : '') + '">' +
          '<span class="visit-report-row__label">' + escapeHtml(field.label) + '</span>' +
          '<span class="visit-report-row__value' + (overTarget ? ' visit-report-row__value--flag' : ' visit-report-row__value--ok') + '">' + escapeHtml(waitText) + '</span>' +
          '</div>'
        );
      } else if (field.type === 'number') {
        rows.push(
          '<div class="visit-report-row">' +
          '<span class="visit-report-row__label">' + escapeHtml(field.label) + '</span>' +
          '<span class="visit-report-row__value">' + escapeHtml(value != null && value !== '' ? value : '—') + '</span>' +
          '</div>'
        );
      } else if (field.type === 'textarea') {
        if (value) comments = renderSectionNotes(value);
      } else if (field.type === 'photos') {
        photos = renderPhotoLinks(value);
      }
    });

    // The old "Health & Safety" chip was appended to a heading that already
    // read "Health & Safety". The count of failures is the fact worth carrying
    // there, and it matches how NBO labels its question sections.
    var hsFailures = isHs ? hsIssues.length : 0;
    return '<div class="visit-report-section-wrapper">' +
      '<div class="visit-report-section' + (isHs ? ' visit-report-section--hs' : '') + '">' +
      sectionHeadingHtml({
        title: section.title,
        chip: hsFailures
          ? pillHtml(hsFailures + ' to fix', { color: '#B22A24', className: 'visit-section-attention' })
          : ''
      }) +
      rows.join('') + comments + photos +
      '</div>' +
      '</div>';
  }

  // One banner component for every "something you need to know" line on every
  // report type — the Health & Safety result here and the CQV critical-point
  // failure below both used to draw their own.
  function bannerHtml(tone, text) {
    return '<div class="visit-report-section-wrapper">' +
      '<div class="visit-report-hs-banner visit-report-hs-banner--' + tone + '">' +
      '<span class="visit-report-banner__text">' + text + '</span>' +
      '</div>' +
      '</div>';
  }

  // The alert used to list every failed check by name, and the Health & Safety
  // card immediately below then listed the same failures again with the same red
  // flag — the same information twice within one screen. The banner now states
  // the count and the card carries the detail, which is what it is for.
  function buildHsSummaryHtml(hsIssues) {
    if (!hsIssues.length) {
      return bannerHtml('ok', 'No Health &amp; Safety issues found on this visit.');
    }
    return bannerHtml('alert', '<strong>' + hsIssues.length + ' Health &amp; Safety issue' +
      (hsIssues.length === 1 ? '' : 's') + '</strong> found — see the Health &amp; Safety section below.');
  }

  // A Coffee Partner may name an assignee as "@Name". The stored "@" is a
  // typing affordance only — every read-only surface shows the bare name as
  // ordinary text (see js/mentions.js).
  function partnerHtml(value, fallback) {
    var text = String(value == null ? '' : value);
    if (!text) return escapeHtml(fallback || '—');
    return window.GAILS.Mentions ? window.GAILS.Mentions.formatSelectionHtml(text) : escapeHtml(text);
  }

  function partnerText(value) {
    var text = String(value == null ? '' : value);
    if (!text) return '';
    return window.GAILS.Mentions ? window.GAILS.Mentions.formatSelectionText(text) : text;
  }

  // A check-in has one user-facing ownership concept: Coffee Partner. Selected
  // mentions replace the default (the person who posted it). `assignedTo`
  // remains a storage detail for stable ids and inherited follow-ups, but it
  // must not surface as a second, duplicate card in the report.
  function siteVisitCoffeePartnerHtml(record) {
    var attributed = window.GAILS.Attribution &&
      typeof window.GAILS.Attribution.forVisit === 'function'
      ? window.GAILS.Attribution.forVisit(record)
      : [];

    if (!attributed.length && window.GAILS.Mentions) {
      attributed = window.GAILS.Mentions.toAssigneeList(record.assignedTo);
      if (!attributed.length) {
        attributed = window.GAILS.Mentions.resolveAssignees(record.coffeePartner);
      }
    }

    if (!attributed.length) {
      var meta = record.meta || {};
      var poster = meta.createdBy || record.createdBy || meta.updatedBy || '';
      if (poster) attributed = [{ name: '', email: poster }];
    }

    if (!attributed.length) return '—';
    if (window.GAILS.Mentions) return window.GAILS.Mentions.formatPeopleHtml(attributed);
    return escapeHtml(attributed.map(function (entry) {
      return entry.name || entry.email || entry.uid;
    }).join(' & '));
  }

  // Routine visits led with raw points ("37 / 45") while CQV and NBO both led
  // with a percentage, so the one number every report exists to deliver was
  // expressed three different ways. All four now lead with the percentage and
  // carry the points behind it.
  function buildHeaderStatsHtml(record) {
    var pct = (record.score != null && record.scoreMax) ? Math.round((record.score / record.scoreMax) * 100) : null;
    var cards = [
      { label: 'Score', value: pct != null ? pct + '%' : '—' },
      { label: 'Points', value: (record.score != null) ? record.score + ' / ' + (record.scoreMax != null ? record.scoreMax : '—') : '—' },
      { label: 'Coffee Partner', html: partnerHtml(record.coffeePartner) },
      { label: 'Barista', value: record.mod || '—' },
      { label: 'Head Barista', value: record.headBaristaPresent || '—' },
      { label: 'Staff on shift', value: record.numberOfStaff != null ? record.numberOfStaff : '—' },
      { label: 'Completed', value: visitDaysAgoLabel(record) }
    ];
    return buildReportOverviewHtml(cards);
  }

  function buildReportHtml(record) {
    var schema = window.GAILS_VISIT_SCHEMA;
    var hsIssues = [];
    var sectionsHtml = schema.sections.map(function (section) {
      return renderSection(section, window.getVisitSectionData(record, section), hsIssues);
    }).join('');

    var hasSectionScores = record.sectionScores && Object.keys(record.sectionScores).length > 0;
    var chartHtml = hasSectionScores
      ? scoreChartSectionHtml(CHART_ID)
      : '<p class="visit-report-note">Section-by-section score breakdown isn’t available for this visit (it was recorded before scoring breakdown was added).</p>';

    return buildHeaderStatsHtml(record) +
      buildHsSummaryHtml(hsIssues) +
      chartHtml +
      sectionsHtml;
  }

  // ── Points by section ──
  // Horizontal bars, not vertical. Section names are multi-word ("Compliance &
  // Training", "Bar Standards & Cleanliness"), and on a category x-axis Chart.js
  // rotated them to 50° — burning roughly a third of the chart's height on
  // turned text — then silently dropped labels via autoSkip once the pane got
  // narrow, leaving unnamed bars. Down the y-axis the same names are set
  // horizontally at full length in a gutter, and autoSkip is off so every bar
  // keeps its name.
  //
  // "Available" is the track behind "Earned" rather than a second bar beside it:
  // it is the maximum for that section, not a comparable series, so the pair
  // reads as one progress bar per section. That also halves the bar count, which
  // is what lets the whole chart be shorter than the vertical one it replaces.
  var CHART_ROW_HEIGHT = 30;
  var CHART_CHROME_HEIGHT = 58;
  var CHART_VALUE_FONT = '700 11px Inter, system-ui, sans-serif';
  var CHART_VALUE_PAD = 14;

  // Measures the widest "earned / available" label so the gutter reserved for
  // it is the size it actually needs. Falls back to a per-character estimate if
  // a 2D context isn't available (jsdom in the test suite).
  function measureChartValueGutter(valueLabels) {
    var widest = 0;
    var ctx = null;
    try {
      ctx = document.createElement('canvas').getContext('2d');
      if (ctx) ctx.font = CHART_VALUE_FONT;
    } catch {
      ctx = null;
    }
    valueLabels.forEach(function (label) {
      var width = ctx ? ctx.measureText(label).width : label.length * 6.6;
      if (width > widest) widest = width;
    });
    return Math.ceil(widest) + CHART_VALUE_PAD;
  }

  function drawPointsChart(canvasId, labels, earned, max) {
    var G = window.GAILS;
    if (typeof G.makeChart !== 'function' || !labels.length) return;
    var ink = G.CHART_INK || {};

    // The value gutter is measured from the widest label it has to hold, not
    // guessed. A CQV can score in the hundreds ("260 / 470"), and a fixed
    // gutter sized for a routine visit's single digits clipped those in half.
    var valueLabels = earned.map(function (value, index) {
      return value + ' / ' + max[index];
    });
    var gutter = measureChartValueGutter(valueLabels);

    // Height follows the data instead of a fixed box, so a 5-section CQV is not
    // padded out to a 7-section routine visit's height and neither one crushes.
    var canvas = document.getElementById(canvasId);
    var wrap = canvas && canvas.parentNode;
    if (wrap && wrap.style) {
      wrap.style.height = (labels.length * CHART_ROW_HEIGHT + CHART_CHROME_HEIGHT) + 'px';
    }

    G.makeChart(canvasId, {
      type: 'bar',
      // Top-level (per-chart) plugin registration, not options.plugins.
      plugins: [pointsValuePlugin],
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Points available',
            data: max,
            backgroundColor: 'rgba(146, 137, 120, 0.18)',
            borderRadius: 999,
            barPercentage: 1,
            categoryPercentage: 0.62,
            maxBarThickness: 15
          },
          {
            label: 'Points earned',
            data: earned,
            backgroundColor: '#1D9E5C',
            borderRadius: 999,
            barPercentage: 1,
            categoryPercentage: 0.62,
            maxBarThickness: 15
          }
        ]
      },
      options: {
        indexAxis: 'y',
        // The track and the value share one lane rather than sitting side by
        // side; the value is drawn second so it paints over the track.
        grouped: false,
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: gutter } },
        scales: {
          // The value axis is now x and the category axis is now y, so the
          // beginAtZero/grid roles swap with them.
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(34, 31, 26,0.06)' },
            border: { display: false },
            ticks: { precision: 0 }
          },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              autoSkip: false,
              color: ink.body || '#4D463C',
              font: { size: 11.5, weight: '600' }
            }
          }
        },
        plugins: {
          legend: { position: 'bottom', reverse: true },
          tooltip: { callbacks: { label: pointsTooltipLabel } }
        }
      }
    });
  }

  function pointsTooltipLabel(ctx) {
    return ctx.dataset.label + ': ' + ctx.parsed.x;
  }

  // Prints "earned / available" at the end of each lane. Without it the numbers
  // are hover-only, so a printed report — the format these are most often read
  // in — carries a chart with no values on it at all.
  var pointsValuePlugin = {
    id: 'visitReportPointsValue',
    afterDatasetsDraw: function (chart) {
      var earnedSet = chart.getDatasetMeta(1);
      if (!earnedSet || earnedSet.hidden) return;
      var maxData = chart.data.datasets[0].data;
      var earnedData = chart.data.datasets[1].data;
      var ctx = chart.ctx;
      ctx.save();
      ctx.font = CHART_VALUE_FONT;
      ctx.fillStyle = '#4D463C';
      // Right-aligned against the canvas edge rather than left-aligned off the
      // plot area, so the column of values lines up and cannot run past the
      // card however large the numbers get.
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      earnedSet.data.forEach(function (bar, index) {
        ctx.fillText(earnedData[index] + ' / ' + maxData[index], chart.width - 2, bar.y);
      });
      ctx.restore();
    }
  };

  function drawScoreChart(record) {
    if (!record.sectionScores) return;
    var schema = window.GAILS_VISIT_SCHEMA;
    drawPointsChart(
      CHART_ID,
      schema.sections.map(function (s) { return s.title; }),
      schema.sections.map(function (s) { return (window.getVisitSectionScores(record, s) || {}).earned || 0; }),
      schema.sections.map(function (s) { return (window.getVisitSectionScores(record, s) || {}).max || 0; })
    );
  }

  var CQV_CHART_ID = 'cqvReportScoreChart';

  // Shared with the admin CQV table — see js/cqv-shared.js.
  var cqvHasCriticalFail = GAILS.CQVShared.hasCriticalFail;
  var cqvBand = GAILS.CQVShared.band;
  var cqvBandColor = GAILS.CQVShared.bandColor;

  // The one stat-strip builder. It used to be two near-identical functions with
  // a capability each — this one could colour a value but only took plain text,
  // while the routine one could render a Coffee Partner mention but had no way
  // to express a band colour. Both now go through here.
  function buildReportOverviewHtml(cards) {
    return '<dl class="drill-summary visit-report-overview" aria-label="Report overview">' +
      cards.map(function (card, index) {
        var classes = 'drill-card visit-report-stat' + (index === 0 ? ' visit-report-stat--primary' : '');
        var colorStyle = card.color ? ' style="--report-stat-color:' + escapeHtml(card.color) + ';"' : '';
        return '<div class="' + classes + '">' +
          '<dt class="drill-card__label">' + escapeHtml(card.label) + '</dt>' +
          '<dd class="drill-card__value"' + colorStyle + '>' + (card.html || escapeHtml(card.value)) + '</dd></div>';
      }).join('') + '</dl>';
  }

  function buildCqvHeaderStatsHtml(record) {
    var scoreText = record.overallPct != null ? record.overallPct + '%' : '—';
    var band = cqvBand(record);
    var bandColor = cqvBandColor(band);
    var cards = [
      // Same label vocabulary as every other report type: "Score" leads, then
      // the points behind it, then who and when.
      { label: 'Score', value: scoreText },
      { label: 'Rating', value: band || '—', color: bandColor },
      { label: 'Points', value: (record.score != null) ? record.score + ' / ' + (record.scoreMax != null ? record.scoreMax : '—') : '—' },
      { label: 'Coffee Partner', value: record.auditorName || '—' },
      { label: 'Completed', value: visitDaysAgoLabel(record) }
    ];
    return buildReportOverviewHtml(cards);
  }

  function buildCqvScoreRowsHtml(scores) {
    return Object.keys(scores || {}).map(function (name) {
      var s = scores[name];
      var isCritical = (s.code === 'CRTCL' || s.code === 'ALRG') || /^(critical|allergen)\b/i.test(name);
      var failing = s.pct < 70 || (isCritical && s.actual < s.target);
      return '<div class="visit-report-row' + (failing ? ' visit-report-row--flag' : '') + '">' +
        '<span class="visit-report-row__label">' + escapeHtml(name) + '</span>' +
        '<span class="visit-report-row__value' + (failing ? ' visit-report-row__value--flag' : ' visit-report-row__value--ok') + '">' +
        escapeHtml(s.actual) + ' / ' + escapeHtml(s.target) + ' (' + escapeHtml(s.pct) + '%)' +
        '</span></div>';
    }).join('');
  }

  var cqvPriorityColor = GAILS.CQVShared.priorityColor;
  var cqvCriticalTag = GAILS.CQVShared.criticalTag;
  var cqvLostPointItems = GAILS.CQVShared.lostPointItems;

  // One item component for both the CQV/NBO action plan and the NBO question
  // list. They were two builders drawing the same shape: a title, an optional
  // sub-label, an observation, and a status.
  //
  // The status sits in a fixed track beside the title, and the supporting meta
  // (priority, due date) runs as a line under the copy. Previously the meta was
  // a right-aligned column of a space-between flex row, so on a full-bleed
  // panel the due date could end up the better part of a screen's width from
  // the action it belonged to, and the reader had to saccade across the whole
  // panel and back for every row.
  //
  // `visit-action-item` / `visit-question` / `visit-question-layout` are kept on
  // the elements as-is: several host surfaces and the modal test suite key off
  // them, and nothing is gained by renaming what already reads correctly.
  function buildReportItemHtml(item) {
    var status = item.status
      ? pillHtml(item.status.text, { color: item.status.color, solid: item.status.solid })
      : '';
    var tags = (item.tags || []).filter(Boolean).map(function (tag) {
      return pillHtml(tag.text, { color: tag.color, solid: tag.solid });
    }).join('');
    // An empty due date used to still print "Due —" on every row of a derived
    // follow-up plan; a fact nobody recorded is not worth a line.
    var meta = (tags || item.due)
      ? '<div class="visit-report-item__meta visit-action-meta">' + tags +
        (item.due ? '<span class="visit-report-item__due visit-action-due">Due ' + escapeHtml(item.due) + '</span>' : '') +
        '</div>'
      : '';

    return '<' + (item.tag || 'article') + ' class="visit-report-item ' + escapeHtml(item.legacyClass) +
      (item.attention ? ' visit-report-item--attention' : '') + '">' +
      '<div class="visit-report-item__head ' + escapeHtml(item.legacyLayoutClass) + '">' +
      '<div class="visit-report-item__copy visit-action-copy visit-question-copy">' +
      '<h5 class="visit-report-item__title visit-action-title visit-question-title">' + escapeHtml(item.title) + '</h5>' +
      (item.subtitle ? '<p class="visit-report-item__subtitle">' + escapeHtml(item.subtitle) + '</p>' : '') +
      '</div>' +
      status +
      '</div>' +
      // What was seen is plain prose; only what someone has to do about it gets
      // the note block. Giving both a block turned every action item into two
      // stacked boxes and flattened the difference between them.
      (item.finding ? '<p class="visit-report-item__finding visit-action-finding">' + escapeHtml(item.finding) + '</p>' : '') +
      (item.note ? noteBlockHtml(item.note, { label: item.noteLabel, tone: item.noteTone }) : '') +
      meta +
      '</' + (item.tag || 'article') + '>';
  }

  function buildCqvActionPlanHtml(actionPlan) {
    if (!actionPlan || !actionPlan.length) {
      return '<p class="visit-report-note">No action items were flagged on this visit.</p>';
    }
    return actionPlan.map(function (a) {
      var label = a.questionLabel || a.sectionPath || 'Action item';
      var dueDate = a.dueDate;

      // Clean up embedded due date in label if found
      var dueMatch = label.match(/\s*DUE\s*DATE\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/i);
      if (dueMatch) {
        if (!dueDate) dueDate = dueMatch[1];
        label = label.replace(dueMatch[0], '').trim();
      }

      // Clean up sectionPath to get sub-category only
      var cleanSection = a.sectionPath || '';
      if (cleanSection.indexOf('>>') !== -1) {
        cleanSection = cleanSection.split('>>').pop().trim();
      }

      var criticalTag = cqvCriticalTag(label);
      // The most severe thing about an item takes the status slot; whatever is
      // left over drops to the meta line.
      var status = criticalTag
        ? { text: criticalTag, color: '#B22A24', solid: true }
        : (a.priority ? { text: a.priority, color: cqvPriorityColor(a.priority) } : null);
      var tags = (criticalTag && a.priority)
        ? [{ text: a.priority, color: cqvPriorityColor(a.priority) }]
        : [];

      return buildReportItemHtml({
        legacyClass: 'visit-action-item',
        legacyLayoutClass: 'visit-action-layout',
        title: label,
        subtitle: cleanSection,
        finding: a.findings,
        findingLabel: 'Observed',
        note: a.actionRequired,
        noteLabel: 'Action required',
        noteTone: 'accent',
        status: status,
        tags: tags,
        due: dueDate,
        attention: !!criticalTag
      });
    }).join('');
  }

  // The chart card, shared by the routine and CQV reports so the one visual
  // recap of the score looks the same on both.
  function scoreChartSectionHtml(canvasId) {
    return '<div class="visit-report-section-wrapper visit-report-section-wrapper--wide">' +
      '<div class="visit-report-section visit-report-section--chart">' +
      sectionHeadingHtml({
        eyebrow: 'Score profile',
        title: 'Performance by section',
        caption: 'Points earned against the points available.'
      }) +
      '<div class="visit-report-chart-wrap"><canvas id="' + canvasId + '"></canvas></div>' +
      '</div></div>';
  }

  function summarySectionHtml(text) {
    if (!text) return '';
    return '<div class="visit-report-section-wrapper"><div class="visit-report-section visit-report-section--summary">' +
      sectionHeadingHtml({ title: 'Summary' }) +
      '<p class="visit-report-comment">' + escapeHtml(text) + '</p>' +
      '</div></div>';
  }

  function buildCqvReportHtml(record) {
    var hasSectionScores = record.sectionScores && Object.keys(record.sectionScores).length > 0;
    var chartHtml = hasSectionScores ? scoreChartSectionHtml(CQV_CHART_ID) : '';

    // The PDF link is relocated into the Jump To bar by enhanceVisitReportBody
    // (it hunts for .visit-report-pdf-btn), so this wrapper is just a carrier —
    // it never stays in the body once a nav bar exists.
    var pdfHtml = record.pdfUrl
      ? '<div class="visit-report-section-wrapper"><a class="visit-report-pdf-btn" href="' + escapeHtml(record.pdfUrl) + '" target="_blank" rel="noopener">&#128196; View Original CQV PDF &#8599;</a></div>'
      : '';

    var criticalFailHtml = cqvHasCriticalFail(record)
      ? bannerHtml('alert', '<strong>A Critical Point was lost</strong> on this visit.')
      : '';

    var summaryHtml = summarySectionHtml(record.summary);

    var categoryHtml = record.categoryScores && Object.keys(record.categoryScores).length
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-section visit-report-section--score' + (cqvHasCriticalFail(record) ? ' visit-report-section--danger' : '') + '">' +
        sectionHeadingHtml({ title: 'Score by category' }) +
        buildCqvScoreRowsHtml(record.categoryScores) + '</div></div>'
      : '';

    var sectionHtml = hasSectionScores
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-section visit-report-section--score">' +
        sectionHeadingHtml({ title: 'Score by section' }) +
        buildCqvScoreRowsHtml(record.sectionScores) + '</div></div>'
      : '';

    var actionPlanItems = record.actionPlan;
    var actionPlanIsDerived = false;
    if ((!actionPlanItems || !actionPlanItems.length) && record.isFollowUp) {
      actionPlanItems = cqvLostPointItems(record);
      actionPlanIsDerived = actionPlanItems.length > 0;
    }

    var actionCount = (actionPlanItems || []).length;
    var actionPlanHtml = '<div class="visit-report-section-wrapper visit-report-section-wrapper--wide"><div class="visit-report-section visit-report-section--action">' +
      sectionHeadingHtml({
        title: 'Action plan',
        chip: actionCount
          ? pillHtml(actionCount + (actionCount === 1 ? ' item' : ' items'), { color: '#B22A24', className: 'visit-section-attention' })
          : '',
        caption: actionPlanIsDerived
          ? 'This follow-up didn’t include a written action plan, so the questions that lost points are shown instead.'
          : ''
      }) +
      buildCqvActionPlanHtml(actionPlanItems) +
      '</div></div>';

    // A CQV reads summary-first: the write-up says what happened, then the
    // chart shows where the points went. The two sit together because the
    // write-up names the sections the profile is about.
    //
    // A follow-up leads with the chart instead. The question it exists to
    // answer is whether the score recovered, so the profile is the headline
    // and the summary explains it rather than introducing it.
    //
    // Either way the action plan comes before the score tables. It used to sit
    // last on a CQV, below the chart and both tables, which put the only
    // actionable panel on the report below the fold.
    //
    // Category and Section are both compact score tables of comparable height,
    // so they're kept adjacent (and non-wide) to pair up side by side — rather
    // than one of them landing alone next to a much taller or shorter neighbour.
    var sectionsHtml = record.isFollowUp
      ? chartHtml + summaryHtml + actionPlanHtml + categoryHtml + sectionHtml
      : summaryHtml + chartHtml + actionPlanHtml + categoryHtml + sectionHtml;
    return buildCqvHeaderStatsHtml(record) + criticalFailHtml + pdfHtml + sectionsHtml;
  }

  // ── NBO Coffee Visit ──
  // The PDF prints no score, so the percentage shown here is derived from the
  // Yes/No answers (see js/nbo-shared.js) and is deliberately left uncoloured
  // — there is no RAG band for these visits. The report's real substance is
  // the coaching note printed under each "No", which is why those lead.
  var nboPctText = GAILS.NBOShared.pctText;
  var nboScorable = GAILS.NBOShared.scorable;

  function buildNboHeaderStatsHtml(record) {
    var counts = record.counts || {};
    var scorable = nboScorable(record);
    var cards = [
      { label: 'Score', value: nboPctText(record) },
      { label: 'Met', value: scorable.yes + ' of ' + scorable.total },
      { label: 'To work on', value: String(counts.no || 0), color: (counts.no ? '#B22A24' : null) },
      { label: 'Coffee Partner', value: record.auditorName || '—' },
      { label: 'Completed', value: visitDaysAgoLabel(record) }
    ];
    return buildReportOverviewHtml(cards);
  }

  // Same component as an action-plan item: a question is an observation with a
  // status, which is what an action item is too.
  // The PDF shouts its answers ("YES"/"NO"); a routine visit renders the same
  // answers as "Yes"/"No". One report should not be louder than another for
  // saying the same thing, so the shouting stops at the parser boundary.
  var NBO_RESPONSES = {
    YES: { text: 'Yes', color: '#1D8A55' },
    NO: { text: 'No', color: '#B22A24' }
  };

  function buildNboQuestionRowHtml(q) {
    var isNo = q.response === 'NO';
    var response = NBO_RESPONSES[q.response] || { text: q.response || '—', color: '#7E776C' };
    return buildReportItemHtml({
      tag: 'div',
      legacyClass: 'visit-question' + (isNo ? ' visit-question--attention' : ''),
      legacyLayoutClass: 'visit-question-layout',
      title: (q.qNum ? q.qNum + '. ' : '') + (q.label || 'Question'),
      note: q.note,
      noteLabel: 'Coaching note',
      status: response,
      attention: isNo
    });
  }

  function buildNboReportHtml(record) {
    var questions = record.questions || [];

    var pdfHtml = record.pdfUrl
      ? '<div class="visit-report-section-wrapper"><a class="visit-report-pdf-btn" href="' + escapeHtml(record.pdfUrl) + '" target="_blank" rel="noopener">&#128196; View Original NBO PDF &#8599;</a></div>'
      : '';

    // Summary and Action Plan both come straight from the PDF (see
    // js/nbo-parser.js). Records imported before those were parsed simply
    // don't carry them, hence the empty-string fallbacks rather than an
    // "unavailable" placeholder.
    var summaryHtml = summarySectionHtml(record.summary);

    var actionPlanHtml = (record.actionPlan && record.actionPlan.length)
      ? '<div class="visit-report-section-wrapper visit-report-section-wrapper--wide"><div class="visit-report-section visit-report-section--action">' +
        sectionHeadingHtml({
          title: 'Action plan',
          chip: pillHtml(record.actionPlan.length + (record.actionPlan.length === 1 ? ' item' : ' items'),
            { color: '#6B4FA8', className: 'visit-section-attention' })
        }) +
        buildCqvActionPlanHtml(record.actionPlan) +
        '</div></div>'
      : '';

    // Coaching notes are the point of the report, so they're lifted out of the
    // full question list into their own section at the top.
    var coachingItems = questions.filter(function (q) { return q.note; });
    var coachingHtml = coachingItems.length
      ? '<div class="visit-report-section-wrapper visit-report-section-wrapper--wide"><div class="visit-report-section visit-report-section--coaching">' +
        sectionHeadingHtml({
          title: 'Coaching notes',
          chip: pillHtml(coachingItems.length + (coachingItems.length === 1 ? ' note' : ' notes'),
            { color: '#6B4FA8', className: 'visit-section-attention' })
        }) +
        coachingItems.map(buildNboQuestionRowHtml).join('') +
        '</div></div>'
      : '';

    // Group the full list by the PDF's own sections (Efficiency, Quality,
    // Safety, Service, Equipment), preserving the order they appear in.
    var sectionOrder = [];
    var bySection = {};
    questions.forEach(function (q) {
      var key = q.section || 'Questions';
      if (!bySection[key]) { bySection[key] = []; sectionOrder.push(key); }
      bySection[key].push(q);
    });

    // Full width rather than paired half-width: question counts vary a lot
    // between sections (Efficiency vs. Safety, say), and pairing two
    // uneven sections stretches the shorter one to match the taller.
    var sectionsHtml = sectionOrder.map(function (name) {
      var items = bySection[name];
      var noCount = items.filter(function (q) { return q.response === 'NO'; }).length;
      return '<div class="visit-report-section-wrapper visit-report-section-wrapper--wide"><div class="visit-report-section visit-report-section--questions">' +
        sectionHeadingHtml({
          title: name,
          chip: noCount
            ? pillHtml(noCount + ' to work on', { color: '#B22A24', className: 'visit-section-attention' })
            : ''
        }) +
        items.map(buildNboQuestionRowHtml).join('') +
        '</div></div>';
    }).join('');

    if (!questions.length) {
      sectionsHtml = '<div class="visit-report-section-wrapper"><p class="visit-report-note">No questions could be read from this PDF — open the original above.</p></div>';
    }

    return buildNboHeaderStatsHtml(record) + pdfHtml + summaryHtml + coachingHtml + actionPlanHtml + sectionsHtml;
  }

  function drawCqvScoreChart(record) {
    if (!record.sectionScores) return;
    var names = Object.keys(record.sectionScores);
    drawPointsChart(
      CQV_CHART_ID,
      names,
      names.map(function (n) { return record.sectionScores[n].actual || 0; }),
      names.map(function (n) { return record.sectionScores[n].target || 0; })
    );
  }

  function bakeryVisitHistory(record) {
    if (!record || !record.bakery) return [];

    var G = window.GAILS;
    var bakeryKey = G.resolveBakeryMetaKey ? G.resolveBakeryMetaKey(record.bakery) : record.bakery;
    var allVisits = G._allVisitsObj || {};

    return Object.keys(allVisits).map(function (id) {
      return Object.assign({}, allVisits[id], { id: id });
    }).filter(function (visit) {
      if (!visit || !visit.bakery) return false;
      var visitBakeryKey = G.resolveBakeryMetaKey ? G.resolveBakeryMetaKey(visit.bakery) : visit.bakery;
      return visitBakeryKey === bakeryKey;
    }).sort(function (a, b) {
      var aDateTime = String(a.date || '') + 'T' + String(a.time || '00:00');
      var bDateTime = String(b.date || '') + 'T' + String(b.time || '00:00');
      var dateOrder = aDateTime.localeCompare(bDateTime);
      return dateOrder || String(a.id).localeCompare(String(b.id));
    });
  }

  function visitHistoryNavigation(record, visitId) {
    var history = bakeryVisitHistory(record);
    var currentIndex = history.findIndex(function (visit) { return visit.id === visitId; });

    return {
      previous: currentIndex > 0 ? history[currentIndex - 1] : null,
      next: currentIndex !== -1 && currentIndex < history.length - 1 ? history[currentIndex + 1] : null,
      // Number reports oldest-first, so a site's first ever visit is 1 and the
      // number grows with each new one. History is already sorted ascending, so
      // this is just the index. Arrow behaviour is unchanged: left still moves
      // to an older visit and right to a newer one.
      position: currentIndex === -1 ? 0 : currentIndex + 1,
      total: history.length
    };
  }

  function resetVisitReportContext() {
    visitReportContextRun += 1;
    if (visitReportContextMap && visitReportContextMap.remove) {
      try {
        visitReportContextMap.remove();
      } catch {
        // The old map container may already have been replaced by report HTML.
      }
    }
    visitReportContextMap = null;
  }

  function visitDaysAgoLabel(record) {
    if (!record || !record.date) return '—';
    var visitDate = new Date(String(record.date || '') + 'T00:00:00Z');
    if (!isFinite(visitDate.getTime())) return '—';
    var now = new Date();
    var todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    var days = Math.round((todayUtc.getTime() - visitDate.getTime()) / 86400000);
    if (!isFinite(days)) return '—';
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 0) return 'Upcoming';
    return days + ' day' + (days === 1 ? '' : 's') + ' ago';
  }

  function visitMonthSnapshot(record) {
    var G = window.GAILS;
    var isoMonth = /^\d{4}-\d{2}/.test(String(record.date || ''))
      ? String(record.date).slice(0, 7)
      : '';
    var date = isoMonth ? new Date(isoMonth + '-01T00:00:00') : null;
    var monthKey = date && !isNaN(date.getTime())
      ? (G.monthLabelFromDate ? G.monthLabelFromDate(date) :
        VISIT_MONTH_SHORT[date.getMonth()] + ' ' + String(date.getFullYear()).slice(-2))
      : '';
    var monthName = date && !isNaN(date.getTime())
      ? date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : 'Report month';
    var bakeryKey = G.resolveBakeryMetaKey ? G.resolveBakeryMetaKey(record.bakery) : record.bakery;
    var stateRecords = G.state && Array.isArray(G.state.ALL) ? G.state.ALL : [];
    var records = stateRecords.length ? stateRecords : (Array.isArray(G._dashboardRecords) ? G._dashboardRecords : []);
    var matches = records.filter(function (candidate) {
      if (!candidate || candidate.m !== monthKey || !candidate.b) return false;
      var candidateKey = G.resolveBakeryMetaKey ? G.resolveBakeryMetaKey(candidate.b) : candidate.b;
      return candidateKey === bakeryKey;
    }).sort(function (first, second) {
      var firstScored = !first.noData && !first.incompletePeriod && isVisitMonthNumber(first.ac);
      var secondScored = !second.noData && !second.incompletePeriod && isVisitMonthNumber(second.ac);
      if (firstScored !== secondScored) return firstScored ? -1 : 1;
      return Number(second.v || 0) - Number(first.v || 0);
    });
    var visits = bakeryVisitHistory(record).filter(function (visit) {
      return isoMonth && String(visit.date || '').slice(0, 7) === isoMonth;
    });

    return {
      monthName: monthName,
      record: matches[0] || null,
      visits: visits
    };
  }

  function isVisitMonthNumber(value) {
    return value !== null && value !== undefined && value !== '' && isFinite(Number(value));
  }

  function visitMonthNumber(value, digits, suffix) {
    if (!isVisitMonthNumber(value)) return '\u2014';
    var number = Number(value);
    var fixed = number.toFixed(digits);
    if (digits && fixed.slice(-2) === '.0') fixed = fixed.slice(0, -2);
    return fixed + (suffix || '');
  }

  function visitMonthMetric(label, value) {
    return '<div class="visit-context-monthly-stat">' +
      '<dt>' + escapeHtml(label) + '</dt>' +
      '<dd>' + escapeHtml(value) + '</dd>' +
    '</div>';
  }

  function buildVisitMonthHtml(record) {
    var snapshot = visitMonthSnapshot(record);
    var monthly = snapshot.record;
    var scored = !!(monthly && !monthly.noData && !monthly.incompletePeriod && isVisitMonthNumber(monthly.ac));
    var reportCount = snapshot.visits.length;
    var metrics;

    if (scored) {
      var withinTwo = monthly.ts;
      if (!isVisitMonthNumber(withinTwo)) withinTwo = monthly.s2;
      metrics = [
        visitMonthMetric('Benchmark', visitMonthNumber(monthly.ac, 1)),
        visitMonthMetric('Drink + Meal NPS', visitMonthNumber(monthly.n, 1)),
        visitMonthMetric('Within 2 minutes', visitMonthNumber(withinTwo, 1, '%')),
        visitMonthMetric('Responses', visitMonthNumber(monthly.v, 0))
      ];
    } else {
      var checkins = snapshot.visits.filter(function (visit) {
        return !visit.visitKind || visit.visitKind === 'checkin';
      }).length;
      var assessed = Math.max(0, reportCount - checkins);
      var activeDays = Object.keys(snapshot.visits.reduce(function (days, visit) {
        if (visit.date) days[visit.date] = true;
        return days;
      }, {})).length;
      metrics = [
        visitMonthMetric('Reports logged', String(reportCount)),
        visitMonthMetric('Check-ins', String(checkins)),
        visitMonthMetric('Assessed visits', String(assessed)),
        visitMonthMetric('Visit days', String(activeDays))
      ];
    }

    return '<section class="visit-context-monthly' + (scored ? '' : ' visit-context-monthly--activity') +
      '" aria-labelledby="visitMonthTitle">' +
        '<div class="visit-context-monthly-heading">' +
          '<span>Monthly snapshot</span>' +
          '<h5 id="visitMonthTitle">' + escapeHtml(snapshot.monthName) + '</h5>' +
        '</div>' +
        '<dl class="visit-context-monthly-stats">' + metrics.join('') + '</dl>' +
      '</section>';
  }

  function buildCheckinContextHtml(record) {
    var G = window.GAILS;
    var meta = G.getBakeryMeta ? G.getBakeryMeta(record.bakery) : null;
    var area = [];
    if (meta && meta.r && meta.r !== 'Other') area.push(meta.r);
    if (meta && meta.o) area.push(meta.o);

    return '<aside class="visit-report-checkin-rail" aria-label="Visit details and bakery snapshot">' +
      '<section class="visit-report-checkin-details" aria-labelledby="visitDetailsTitle">' +
        '<h4 id="visitDetailsTitle">Visit details</h4>' +
        '<dl class="visit-report-checkin-details-list">' +
          '<div><dt>Visited by</dt><dd>' + siteVisitCoffeePartnerHtml(record) + '</dd></div>' +
          '<div><dt>Barista</dt><dd>' + escapeHtml(record.mod || '—') + '</dd></div>' +
          '<div><dt>Region · Ops</dt><dd>' + escapeHtml(area.join(' · ') || '—') + '</dd></div>' +
          '<div><dt>Completed</dt><dd>' + escapeHtml(visitDaysAgoLabel(record)) + '</dd></div>' +
        '</dl>' +
      '</section>' +
      buildVisitMonthHtml(record) +
    '</aside>';
  }

  function buildCheckinSupportHtml(record) {
    var G = window.GAILS;
    var meta = G.getBakeryMeta ? G.getBakeryMeta(record.bakery) : null;
    var ll = meta && Array.isArray(meta.ll) ? meta.ll.map(Number) : null;
    var hasLocation = !!(ll && isFinite(ll[0]) && isFinite(ll[1]));
    var bakeryLabel = G.getBakeryMapLabel ? G.getBakeryMapLabel(record.bakery) : record.bakery;
    var mapLink = hasLocation
      ? 'https://www.openstreetmap.org/?mlat=' + ll[0].toFixed(6) +
        '&mlon=' + ll[1].toFixed(6) + '#map=16/' + ll[0].toFixed(6) + '/' + ll[1].toFixed(6)
      : '';
    var mapBody = hasLocation
      ? '<div class="visit-context-map" data-visit-context-map aria-label="Map showing ' + escapeHtml(bakeryLabel) + '">' +
          '<div class="visit-context-loading visit-context-map-state"><span aria-hidden="true"></span>Loading map…</div>' +
        '</div>'
      : '<div class="visit-context-map visit-context-map--empty">' +
          '<div class="visit-context-empty"><strong>Location unavailable</strong><span>Add bakery coordinates in the site directory to show the map.</span></div>' +
        '</div>';

    return '<aside class="visit-report-checkin-context visit-report-checkin-support" aria-label="Site map and weather during visit">' +
      '<section class="visit-context-card visit-context-map-card">' +
        '<div class="visit-context-card-heading visit-context-card-heading--simple"><strong>Site location</strong>' +
          (mapLink ? '<a href="' + escapeHtml(mapLink) + '" target="_blank" rel="noopener">Open map ↗</a>' : '') +
        '</div>' +
        mapBody +
      '</section>' +
      '<section class="visit-context-card visit-context-weather-card" data-visit-weather-date="' + escapeHtml(record.date || '') +
        '" data-visit-weather-time="' + escapeHtml(record.time || '') + '">' +
        '<div class="visit-context-card-heading visit-context-card-heading--simple"><strong>Weather during visit</strong><small>' +
          escapeHtml(record.date ? formatFollowUpDate(record.date) : 'Date unavailable') + '</small></div>' +
        '<div class="visit-context-weather-body" aria-live="polite">' +
          '<div class="visit-context-loading"><span aria-hidden="true"></span>Loading conditions at visit…</div>' +
        '</div>' +
        '<a class="visit-context-source" href="https://open-meteo.com/en/docs/historical-weather-api" target="_blank" rel="noopener">Hourly historical estimate · Open-Meteo ↗</a>' +
      '</section>' +
    '</aside>';
  }

  function setVisitContextUnavailable(element, message) {
    if (!element) return;
    element.innerHTML = '<div class="visit-context-empty"><strong>Context unavailable</strong><span>' +
      escapeHtml(message) + '</span></div>';
  }

  function initVisitContextMap(context, ll, bakeryLabel, runId) {
    var mapEl = context && context.querySelector ? context.querySelector('[data-visit-context-map]') : null;
    if (!mapEl) return;
    var G = window.GAILS;

    if (!G.ensureLeaflet) {
      setVisitContextUnavailable(mapEl, 'Open the larger map to view this bakery.');
      return;
    }

    Promise.resolve(G.ensureLeaflet()).then(function () {
      if (runId !== visitReportContextRun || !window.L) return;
      mapEl.innerHTML = '';
      var map = window.L.map(mapEl, {
        zoomControl: false,
        scrollWheelZoom: false,
        doubleClickZoom: false
      }).setView(ll, 15);

      window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      window.L.circleMarker(ll, {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#0D7CA0',
        fillOpacity: 1
      }).addTo(map).bindTooltip(bakeryLabel, { direction: 'top', offset: [0, -8] });

      visitReportContextMap = map;
      setTimeout(function () {
        if (runId === visitReportContextRun && visitReportContextMap === map) map.invalidateSize();
      }, 0);
    }).catch(function () {
      if (runId === visitReportContextRun) {
        setVisitContextUnavailable(mapEl, 'Open the larger map to view this bakery.');
      }
    });
  }

  function weatherValue(value, digits, unit) {
    return value == null ? '—' : value.toFixed(digits) + unit;
  }

  function weatherCodeMeta(rawCode, isDay) {
    var code = Number(rawCode);
    var daylight = Number(isDay) !== 0;

    if (code === 0) return { label: daylight ? 'Clear sky' : 'Clear night', icon: daylight ? 'clear-day' : 'clear-night', tone: 'clear' };
    if (code === 1) return { label: 'Mainly clear', icon: daylight ? 'partly-day' : 'partly-night', tone: 'clear' };
    if (code === 2) return { label: 'Partly cloudy', icon: daylight ? 'partly-day' : 'partly-night', tone: 'cloud' };
    if (code === 3) return { label: 'Overcast', icon: 'cloudy', tone: 'cloud' };
    if (code === 45 || code === 48) return { label: code === 48 ? 'Rime fog' : 'Fog', icon: 'fog', tone: 'fog' };
    if (code === 51 || code === 53 || code === 55) return { label: 'Drizzle', icon: 'drizzle', tone: 'wet' };
    if (code === 56 || code === 57) return { label: 'Freezing drizzle', icon: 'freezing-rain', tone: 'cold' };
    if (code === 61 || code === 63 || code === 65) return { label: 'Rain', icon: 'rain', tone: 'wet' };
    if (code === 66 || code === 67) return { label: 'Freezing rain', icon: 'freezing-rain', tone: 'cold' };
    if (code === 71 || code === 73 || code === 75 || code === 77) return { label: code === 77 ? 'Snow grains' : 'Snowfall', icon: 'snow', tone: 'cold' };
    if (code === 80 || code === 81 || code === 82) return { label: 'Rain showers', icon: 'showers', tone: 'wet' };
    if (code === 85 || code === 86) return { label: 'Snow showers', icon: 'snow', tone: 'cold' };
    if (code === 95 || code === 96 || code === 99) return { label: code === 95 ? 'Thunderstorm' : 'Thunderstorm with hail', icon: 'thunder', tone: 'storm' };
    return { label: 'Conditions at visit', icon: 'cloudy', tone: 'cloud' };
  }

  function visitWeatherIcon(kind) {
    var sun = '<circle class="visit-weather-icon__sun" cx="22" cy="20" r="8"/>' +
      '<path class="visit-weather-icon__sunray" d="M22 5v5M22 30v5M7 20h5M32 20h5M11.5 9.5l3.5 3.5M29 27l3.5 3.5M11.5 30.5L15 27M29 13l3.5-3.5"/>';
    var fullSun = '<circle class="visit-weather-icon__sun" cx="32" cy="32" r="11"/>' +
      '<path class="visit-weather-icon__sunray" d="M32 8v7M32 49v7M8 32h7M49 32h7M15 15l5 5M44 44l5 5M15 49l5-5M44 20l5-5"/>';
    var moon = '<path class="visit-weather-icon__moon" d="M34 8a18 18 0 1 0 15 29A19 19 0 0 1 34 8Z"/>' +
      '<path class="visit-weather-icon__star" d="M46 13l1.2 2.6L50 17l-2.8 1.2L46 21l-1.2-2.8L42 17l2.8-1.4Z"/>';
    var cloud = '<path class="visit-weather-icon__cloud" d="M17 45h29a9 9 0 0 0 1.2-17.9A14 14 0 0 0 20.5 31 7.5 7.5 0 0 0 17 45Z"/>';
    var rain = '<path class="visit-weather-icon__rain" d="M23 49l-3 7M34 49l-3 7M45 49l-3 7"/>';
    var drizzle = '<path class="visit-weather-icon__rain" d="M23 51v2M34 51v2M45 51v2"/>';
    var snow = '<path class="visit-weather-icon__snow" d="M23 49v8M19.5 51l7 4M26.5 51l-7 4M42 49v8M38.5 51l7 4M45.5 51l-7 4"/>';
    var lightning = '<path class="visit-weather-icon__lightning" d="M35 45h9l-7 8h5L29 62l4-10h-5Z"/>';
    var fog = '<path class="visit-weather-icon__fog" d="M13 49h38M17 55h30"/>';
    var shapes = cloud;

    if (kind === 'clear-day') shapes = fullSun;
    else if (kind === 'clear-night') shapes = moon;
    else if (kind === 'partly-day') shapes = sun + cloud;
    else if (kind === 'partly-night') shapes = moon + cloud;
    else if (kind === 'fog') shapes = cloud + fog;
    else if (kind === 'drizzle') shapes = cloud + drizzle;
    else if (kind === 'rain' || kind === 'freezing-rain') shapes = cloud + rain;
    else if (kind === 'showers') shapes = sun + cloud + rain;
    else if (kind === 'snow') shapes = cloud + snow;
    else if (kind === 'thunder') shapes = cloud + lightning;

    return '<svg class="visit-weather-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' + shapes + '</svg>';
  }

  function visitTimeTarget(value) {
    var match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)/);
    if (!match) return { minutes: 720, label: '' };
    return { minutes: Number(match[1]) * 60 + Number(match[2]), label: match[1] + ':' + match[2] };
  }

  function closestVisitWeatherHour(payload, date, visitTime) {
    var hourly = payload && payload.hourly ? payload.hourly : {};
    var times = Array.isArray(hourly.time) ? hourly.time : [];
    var target = visitTimeTarget(visitTime);
    var bestIndex = -1;
    var bestDifference = Infinity;

    times.forEach(function (stamp, index) {
      var text = String(stamp || '');
      if (text.slice(0, 10) !== date) return;
      var match = text.match(/T(\d{2}):(\d{2})/);
      if (!match) return;
      var difference = Math.abs((Number(match[1]) * 60 + Number(match[2])) - target.minutes);
      if (difference < bestDifference) {
        bestDifference = difference;
        bestIndex = index;
      }
    });

    if (bestIndex < 0) return null;

    function hourlyNumber(key) {
      var values = Array.isArray(hourly[key]) ? hourly[key] : [];
      var rawValue = values[bestIndex];
      if (rawValue == null || rawValue === '') return null;
      var number = Number(rawValue);
      return isFinite(number) ? number : null;
    }

    return {
      time: String(times[bestIndex] || ''),
      visitTime: target.label,
      code: hourlyNumber('weather_code'),
      temperature: hourlyNumber('temperature_2m'),
      rainfall: hourlyNumber('precipitation'),
      isDay: hourlyNumber('is_day')
    };
  }

  function weatherMetric(label, textValue) {
    return '<div class="visit-context-weather-metric"><span>' + escapeHtml(label) + '</span><strong>' +
      escapeHtml(textValue) + '</strong></div>';
  }

  function renderVisitWeather(weatherBody, payload, date, visitTime) {
    var snapshot = closestVisitWeatherHour(payload, date, visitTime);
    if (!snapshot || (snapshot.code == null && snapshot.temperature == null && snapshot.rainfall == null)) {
      setVisitContextUnavailable(weatherBody, 'Hourly weather has not been published for this visit.');
      return;
    }

    var condition = weatherCodeMeta(snapshot.code, snapshot.isDay);
    var weatherHour = snapshot.time.slice(11, 16);
    var timing = weatherHour ? weatherHour + ' local' : 'Recorded visit hour';
    if (snapshot.visitTime && snapshot.visitTime !== weatherHour) timing += ' · visit at ' + snapshot.visitTime;

    weatherBody.innerHTML =
      '<div class="visit-context-weather-overview">' +
        '<div class="visit-context-weather-symbol" data-weather-tone="' + escapeHtml(condition.tone) +
          '" role="img" aria-label="' + escapeHtml(condition.label) + '">' + visitWeatherIcon(condition.icon) + '</div>' +
        '<div class="visit-context-weather-copy">' +
          '<p class="visit-context-weather-summary">' + escapeHtml(condition.label) + '</p>' +
          '<p class="visit-context-weather-time">' + escapeHtml(timing) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="visit-context-weather-list">' +
        weatherMetric('Temperature', weatherValue(snapshot.temperature, 1, '°C')) +
        weatherMetric('Hourly rainfall', weatherValue(snapshot.rainfall, 1, ' mm')) +
      '</div>';
  }

  function loadVisitWeather(context, ll, date, visitTime, runId) {
    var weatherBody = context && context.querySelector ? context.querySelector('.visit-context-weather-body') : null;
    if (!weatherBody) return;
    if (!window.fetch || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
      setVisitContextUnavailable(weatherBody, 'A valid visit date is needed for historical weather.');
      return;
    }

    var cacheKey = ll[0].toFixed(3) + '|' + ll[1].toFixed(3) + '|' + date;
    var request = visitWeatherCache[cacheKey];
    if (!request) {
      var url = OPEN_METEO_ARCHIVE_ENDPOINT +
        '?latitude=' + encodeURIComponent(ll[0]) +
        '&longitude=' + encodeURIComponent(ll[1]) +
        '&start_date=' + encodeURIComponent(date) +
        '&end_date=' + encodeURIComponent(date) +
        '&hourly=weather_code,temperature_2m,precipitation,is_day' +
        '&timezone=auto';
      request = window.fetch(url).then(function (response) {
        if (!response.ok) throw new Error('Weather request failed');
        return response.json();
      });
      visitWeatherCache[cacheKey] = request;
    }

    request.then(function (payload) {
      if (runId === visitReportContextRun) renderVisitWeather(weatherBody, payload, date, visitTime);
    }).catch(function () {
      delete visitWeatherCache[cacheKey];
      if (runId === visitReportContextRun) {
        setVisitContextUnavailable(weatherBody, 'Historical weather could not be loaded.');
      }
    });
  }

  function hydrateCheckinContext(bodyEl, record) {
    if (!bodyEl || !bodyEl.querySelector || !bodyEl.appendChild) return;
    var context = bodyEl.querySelector('.visit-report-checkin-context');
    if (!context) return;
    // The dedicated check-in workspace owns the comments/context columns.
    // Older report markup placed context inside the generic content wrapper,
    // where it had to be promoted to the body; keep that compatibility path
    // without pulling the new context pane out of its grid.
    var workspace = bodyEl.querySelector('.visit-report-checkin-workspace');
    if (!workspace && context.parentNode !== bodyEl) bodyEl.appendChild(context);

    var G = window.GAILS;
    var meta = G.getBakeryMeta ? G.getBakeryMeta(record.bakery) : null;
    var ll = meta && Array.isArray(meta.ll) ? meta.ll.map(Number) : null;
    if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return;

    var runId = visitReportContextRun;
    var bakeryLabel = G.getBakeryMapLabel ? G.getBakeryMapLabel(record.bakery) : record.bakery;
    initVisitContextMap(context, ll, bakeryLabel, runId);
    loadVisitWeather(context, ll, record.date, record.time, runId);
  }

  function visitNavigationButtonHtml(direction, target) {
    var isPrevious = direction === 'previous';
    var label = isPrevious ? 'Previous visit' : 'Next visit';
    var title = target
      ? label + ': ' + formatVisitDate(target.date) + (target.time ? ' at ' + target.time : '')
      : 'No ' + direction + ' visit for this bakery';

    return '<button type="button" class="visit-report-nav-btn"' +
      ' onclick="GAILS.openAdjacentVisit(\'' + direction + '\')"' +
      ' aria-label="' + escapeHtml(title) + '"' +
      ' title="' + escapeHtml(title) + '"' +
      (target ? '' : ' disabled') + '>' +
      (isPrevious ? '&#8249;' : '&#8250;') +
      '</button>';
  }

  function renderVisitReportActions(record, visitId) {
    var modal = document.getElementById('visitReportModal');
    var actionsEl = modal && modal.querySelector('.visit-report-header-actions');
    if (!actionsEl) return;

    var navigationHtml = '';
    if (record && visitId) {
      var navigation = visitHistoryNavigation(record, visitId);
      navigationHtml = '<div class="visit-report-history-nav" role="group" aria-label="Bakery visit history">' +
        visitNavigationButtonHtml('previous', navigation.previous) +
        '<span class="visit-report-history-pos" aria-label="Visit ' + navigation.position + ' of ' + navigation.total + '">' +
        navigation.position + ' of ' + navigation.total + '</span>' +
        visitNavigationButtonHtml('next', navigation.next) +
        '</div>';
    }

    actionsEl.innerHTML = navigationHtml +
      '<button type="button" class="drill-close-btn visit-report-print-btn" onclick="window.print()">&#128438; Print</button>' +
      '<button type="button" class="modal-close-btn" onclick="GAILS.closeVisitReport()"' +
      ' aria-label="Close visit report" title="Close">&#10005;</button>';
  }

  window.GAILS.openAdjacentVisit = function (direction) {
    if (direction !== 'previous' && direction !== 'next') return;

    var visitId = window.GAILS._activeVisitReportId;
    var record = visitId && window.GAILS._allVisitsObj ? window.GAILS._allVisitsObj[visitId] : null;
    if (!record) return;

    var adjacent = visitHistoryNavigation(record, visitId)[direction];
    if (adjacent) window.GAILS.openVisitReportById(adjacent.id);
  };

  window.GAILS.openVisitReport = function (bakeryName) {
    var record = window.GAILS.getLastVisitRecord ? window.GAILS.getLastVisitRecord(bakeryName) : null;
    if (record && record.id) {
      window.GAILS.openVisitReportById(record.id);
      return;
    }

    var modal = document.getElementById('visitReportModal');
    var titleEl = document.getElementById('visitReportTitle');
    var subtitleEl = document.getElementById('visitReportSubtitle');
    var bodyEl = document.getElementById('visitReportBody');
    if (!modal || !titleEl || !subtitleEl || !bodyEl) return;
    var modalWasOpen = modal.style.display !== 'none';

    titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(bakeryName) : bakeryName;
    subtitleEl.textContent = 'No routine visit has been logged for this bakery yet.';
    bodyEl.innerHTML = '<div class="visit-report-empty">' +
      '<span aria-hidden="true">&#9745;</span><h4>No report to show yet</h4>' +
      '<p>Once a routine coffee visit is logged, its score, observations and actions will appear here.</p>' +
      '</div>';
    resetVisitReportBodyLayout(bodyEl);
    setVisitReportPresentation('empty');

    window.GAILS._activeVisitReportId = null;
    renderVisitReportActions(null, null);

    showVisitReportModal(modal);
    bodyEl.scrollTop = 0;
    if (!modalWasOpen) lockBackgroundScroll();
  };

  window.GAILS.closeVisitReport = function () {
    var modal = document.getElementById('visitReportModal');
    if (!modal || modal.style.display === 'none') return;
    hideVisitReportModal(modal);
    if (window.GAILS.destroyChart) {
      window.GAILS.destroyChart(CHART_ID);
      window.GAILS.destroyChart(CQV_CHART_ID);
    }
    window.GAILS._activeVisitReportId = null;
    if (window.GAILS.closeDeleteConfirmModal) window.GAILS.closeDeleteConfirmModal();
    unlockBackgroundScroll();
  };

  function setVisitLogRowExpanded(row, expanded) {
    row.classList.toggle('expanded', expanded);
    var expandButton = row.querySelector('.visit-history-table__expand-btn');
    if (expandButton) {
      var bakeryLabel = expandButton.getAttribute('data-bakery-label') || 'this visit';
      expandButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      expandButton.setAttribute('aria-label', (expanded ? 'Hide' : 'Show') + ' notes for ' + bakeryLabel);
    }

    // Visit History uses a semantic table, so the expanded notes live in the
    // following detail row rather than as a grid child inside the summary row.
    var detailsRow = row.nextElementSibling;
    if (detailsRow && detailsRow.classList.contains('visit-history-table__details-row')) {
      detailsRow.hidden = !expanded;
    }
  }

  function toggleVisitLogRow(row) {
    var expanded = !row.classList.contains('expanded');
    var table = row.closest ? row.closest('.visit-history-table') : null;

    // Visit History is a single-open disclosure: opening a new visit closes
    // the previous one, including its detail row and accessible button state.
    if (expanded && table) {
      table.querySelectorAll('[data-visit-report-id].expanded').forEach(function (openRow) {
        if (openRow !== row) setVisitLogRowExpanded(openRow, false);
      });
    }

    setVisitLogRowExpanded(row, expanded);
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target && event.target.closest ? event.target.closest('[data-visit-report]') : null;
    if (trigger) {
      window.GAILS.openVisitReport(trigger.getAttribute('data-visit-report'));
      return;
    }

    var logRow = event.target && event.target.closest ? event.target.closest('[data-visit-report-id]') : null;
    if (logRow) {
      // Only the View Report button opens the full report; clicking anywhere
      // else on the row expands/collapses the notes inline.
      if (event.target.closest('.visit-log-row__btn')) {
        window.GAILS.openVisitReportById(logRow.getAttribute('data-visit-report-id'));
        return;
      }
      toggleVisitLogRow(logRow);
    }
  });

  document.addEventListener('keydown', function (event) {
    var openConfirm = document.getElementById('saveConfirmModal');
    if (event.key === 'Tab' && openConfirm && openConfirm.style.display !== 'none') {
      var focusable = Array.prototype.slice.call(openConfirm.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(function (element) {
        return element.getAttribute('aria-hidden') !== 'true' && element.style.display !== 'none';
      });
      if (focusable.length) {
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !openConfirm.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !openConfirm.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }

    var activeReportModal = document.getElementById('visitReportModal');
    if (event.key === 'Tab' && activeReportModal && activeReportModal.style.display !== 'none') {
      trapVisitReportFocus(event, activeReportModal);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      var focused = event.target;
      if (focused && focused.matches && focused.matches('[data-visit-report-id]')) {
        event.preventDefault();
        toggleVisitLogRow(focused);
      }
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      var reportModal = document.getElementById('visitReportModal');
      var tagName = event.target && event.target.tagName;
      var isFormField = tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA';
      // The report pane is focusable so it can be scrolled from the keyboard;
      // while the reader is inside it the arrows have to belong to the pane, or
      // reading a report with the keyboard would throw the reader onto a
      // different bakery on a different date with no way back.
      var inContent = event.target && event.target.closest && event.target.closest('.visit-report-content');
      if (reportModal && reportModal.style.display !== 'none' && window.GAILS._activeVisitReportId && !isFormField && !inContent) {
        event.preventDefault();
        window.GAILS.openAdjacentVisit(event.key === 'ArrowLeft' ? 'previous' : 'next');
      }
      return;
    }
    if (event.key !== 'Escape') return;
    // Close the topmost dialog first so Escape backs out of the confirm
    // step without also dismissing the form behind it.
    var saveConfirm = document.getElementById('saveConfirmModal');
    if (saveConfirm && saveConfirm.style.display !== 'none') {
      window.GAILS.closeSaveConfirmModal();
      return;
    }
    window.GAILS.closeVisitReport();
  });

  // NBO Coffee Visit 1 and 2 are NOT site-visit kinds — they arrive as PDF
  // imports (type: 'nbo', see js/nbo-parser.js), not as manually logged
  // check-ins, so they're deliberately absent from this list.
  var SITE_VISIT_KIND_LABELS = {
    checkin: 'Check-in',
    nboOpening: 'NBO: Opening'
  };

  function siteVisitKindLabel(v) {
    return SITE_VISIT_KIND_LABELS[v.visitKind] || 'Check-in';
  }

  function siteVisitKindTagColors(v) {
    return (v.visitKind && v.visitKind !== 'checkin')
      ? { color: 'var(--purple)', bg: 'var(--purple-d)' }
      : { color: 'var(--teal)', bg: 'var(--teal-d)' };
  }

  var nboVisitLabel = GAILS.NBOShared.visitLabel;

  function visitTypeLabel(v) {
    if (v.type === 'siteVisit') return siteVisitKindLabel(v);
    if (v.type === 'cqv') return v.isFollowUp ? 'CQV Follow-Up' : 'CQV';
    if (v.type === 'nbo') return nboVisitLabel(v);
    return 'Routine Coffee Visit';
  }

  // Native table headings for Visit History. "Partner / auditor" rather than
  // either alone: the column holds the coffee partner for routine visits and
  // the auditor for CQV and NBO ones.
  function visitLogHeadHtml() {
    return '<thead><tr>' +
      '<th scope="col">Date</th>' +
      '<th scope="col">Bakery</th>' +
      '<th scope="col">Partner / auditor</th>' +
      '<th scope="col">Score</th>' +
      '<th scope="col">Visit type &amp; notes</th>' +
      '<th scope="col"><span class="sr-only">Report action</span></th>' +
      '</tr></thead>';
  }

  function visitTypeKey(v) {
    if (v.type === 'cqv') return v.isFollowUp ? 'cqvFollowUp' : 'cqv';
    if (v.type === 'nbo') return 'nboVisit' + (v.visitNumber || 1);
    if (v.type === 'siteVisit') {
      var kind = v.visitKind || 'checkin';
      return kind === 'checkin' ? 'siteVisit' : kind;
    }
    return 'routine';
  }

  // Assembles a visit's notes once for the row preview, the expanded inline
  // view, and the export. Routine visits keep their per-section labels in the
  // expanded HTML; the flat text joins sections, labelling them only when
  // `labelSections` is set — the row preview is too short to spend space on
  // labels, but an exported cell is unreadable without them.
  function buildVisitNotes(v, schema, labelSections) {
    // An NBO visit leads with the auditor's summary paragraph where the PDF
    // had one (imports predating js/nbo-parser.js reading it don't), then the
    // per-question coaching notes that carry the rest of the report.
    if (v.type === 'nbo') {
      var coaching = (v.questions || []).filter(function (q) { return q.note; });
      var nboSummary = v.summary || '';
      return {
        text: (nboSummary ? [nboSummary] : []).concat(coaching.map(function (q) {
          return q.label + ': ' + q.note;
        })).join(' | '),
        fullHtml: (nboSummary
          ? '<p class="visit-log-row__note-item">' + escapeHtml(nboSummary) + '</p>'
          : '') +
          coaching.map(function (q) {
            return '<p class="visit-log-row__note-item">' +
              '<span class="visit-log-row__note-label">' + escapeHtml(q.label) + '</span>' +
              escapeHtml(q.note) + '</p>';
          }).join('')
      };
    }
    if (v.type === 'siteVisit' || v.type === 'cqv') {
      var t = (v.type === 'cqv' ? v.summary : v.comments) || '';
      return {
        text: t,
        fullHtml: t ? '<p class="visit-log-row__note-item">' + escapeHtml(t) + '</p>' : ''
      };
    }
    var text = '';
    var fullHtml = '';
    if (schema && schema.sections) {
      schema.sections.forEach(function (sec) {
        var secData = window.getVisitSectionData(v, sec);
        var comment = secData.comments;
        if (comment && comment.trim()) {
          if (text) text += ' | ';
          text += (labelSections ? sec.title + ': ' : '') + comment.trim();
          fullHtml += '<p class="visit-log-row__note-item">' +
            '<span class="visit-log-row__note-label">' + escapeHtml(sec.title) + '</span>' +
            escapeHtml(comment.trim()) +
            '</p>';
        }
      });
    }
    return { text: text, fullHtml: fullHtml };
  }

  function daysSince(isoDate) {
    var d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((now - d) / 86400000));
  }

  // Downloads whatever the last render put in _visitLogExport — i.e. exactly
  // the rows the active filters produced, not just the ones rendered so far.
  var EXPORT_NUMBER_FORMATS = {
    date: 'dd mmm yyyy',
    percent: '0%',
    number: '0'
  };

  function exportOptionText(sel) {
    var opt = sel && sel.options ? sel.options[sel.selectedIndex] : null;
    return opt ? opt.text : '';
  }

  function normalizeVisitLogFilterValues(value) {
    var values = Array.isArray(value) ? value : (typeof value === 'string' && value ? [value] : []);
    return values.map(function (item) { return String(item || '').trim(); }).filter(Boolean);
  }

  function getVisitLogFilterValues(input) {
    var el = typeof input === 'string' ? document.getElementById(input) : input;
    if (!el) return [];
    if (!el.multiple || !el.options) return el.value ? [el.value] : [];
    return Array.prototype.filter.call(el.options, function (option) {
      return option.selected && !!option.value;
    }).map(function (option) { return option.value; });
  }

  function setVisitLogFilterValues(input, values) {
    var el = typeof input === 'string' ? document.getElementById(input) : input;
    if (!el || !el.options) return;
    var wanted = normalizeVisitLogFilterValues(values);
    Array.prototype.forEach.call(el.options, function (option) {
      option.selected = !!option.value && wanted.indexOf(option.value) !== -1;
    });
    if (el._visitLogMultiSelect) el._visitLogMultiSelect.sync();
  }

  function visitLogFilterMatches(values, candidate) {
    return !values.length || values.indexOf(candidate) !== -1;
  }

  // Filter selects use an empty value for "no filter", so the readable
  // "All regions"-style label has to be supplied rather than read off.
  function exportFilterLabel(id, allLabel) {
    var el = document.getElementById(id);
    if (!el) return allLabel;
    if (el.multiple) {
      var labels = Array.prototype.filter.call(el.options, function (option) {
        return option.selected && !!option.value;
      }).map(function (option) { return option.text; });
      return labels.length ? labels.join(', ') : allLabel;
    }
    return el.value ? exportOptionText(el) : allLabel;
  }

  // The rows every view's Report Info tab opens with — an exported file that
  // has been emailed on still has to explain what it is and what it covers.
  function baseExportMeta() {
    var searchEl = document.getElementById('visitLogSearch');
    var search = searchEl ? searchEl.value.trim() : '';
    var meta = [
      ['Generated', new Date().toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      })],
      ['Period', exportFilterLabel('visitLogPeriod', 'All Time')],
      ['Region', exportFilterLabel('visitLogRegion', 'All regions')],
      ['Ops Area', exportFilterLabel('visitLogOps', 'All ops areas')]
    ];
    if (search) meta.push(['Search', search]);
    return meta;
  }

  function buildExportFilename(label) {
    return 'GAILs ' + label + ' ' + new Date().toISOString().slice(0, 10) + '.xlsx';
  }

  // Blank cells return null so aoa_to_sheet leaves them genuinely empty
  // rather than writing an empty string that Excel then treats as text.
  function exportCellValue(value, type) {
    if (value == null || value === '') return null;
    if (type === 'date') {
      var d = new Date(String(value).slice(0, 10) + 'T00:00:00');
      return isNaN(d.getTime()) ? String(value) : d;
    }
    if (type === 'percent' || type === 'number') {
      var n = Number(value);
      return isNaN(n) ? String(value) : n;
    }
    return String(value);
  }

  function exportCellText(value, type) {
    var v = exportCellValue(value, type);
    if (v == null) return '';
    if (v instanceof Date) {
      return v.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    if (type === 'percent' && typeof v === 'number') return Math.round(v * 100) + '%';
    return String(v);
  }

  function buildExportDataSheet(data) {
    var X = window.XLSX;
    var header = data.columns.map(function (col) { return col.label; });
    var body = data.rows.map(function (row) {
      return row.map(function (cell, i) {
        return exportCellValue(cell, data.columns[i] ? data.columns[i].type : 'text');
      });
    });
    var ws = X.utils.aoa_to_sheet([header].concat(body), { cellDates: true });
    var range = X.utils.decode_range(ws['!ref']);

    data.columns.forEach(function (col, c) {
      var fmt = EXPORT_NUMBER_FORMATS[col.type];
      if (!fmt) return;
      for (var r = 1; r <= range.e.r; r++) {
        var cell = ws[X.utils.encode_cell({ r: r, c: c })];
        if (cell && cell.t !== 's') cell.z = fmt;
      }
    });

    ws['!cols'] = data.columns.map(function (col) { return { wch: col.width || 16 }; });
    // The free SheetJS build can't write bold headers or frozen panes, so the
    // autofilter does that job: it marks row 1 as the header and lets people
    // slice the export without restructuring it.
    ws['!autofilter'] = {
      ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: range.e.r, c: range.e.c } })
    };
    return ws;
  }

  function buildExportInfoSheet(data) {
    var X = window.XLSX;
    var ws = X.utils.aoa_to_sheet([[data.title], []].concat(data.meta || []));
    ws['!cols'] = [{ wch: 22 }, { wch: 54 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    return ws;
  }

  function exportVisitLogCsvFallback(data) {
    var lines = [[data.title]]
      .concat(data.meta || [])
      .concat([[], data.columns.map(function (col) { return col.label; })])
      .concat(data.rows.map(function (row) {
        return row.map(function (cell, i) {
          return exportCellText(cell, data.columns[i] ? data.columns[i].type : 'text');
        });
      }));
    var csv = lines.map(function (row) {
      return row.map(function (cell) {
        var s = cell == null ? '' : String(cell);
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    // BOM so Excel opens it as UTF-8
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = data.filename.replace(/\.xlsx$/, '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  // Downloads whatever the last render put in _visitLogExport — i.e. exactly
  // the rows the active filters produced, not just the ones rendered so far.
  function downloadVisitLogFile(data) {
    if (!window.XLSX) {
      exportVisitLogCsvFallback(data);
      return;
    }
    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, buildExportInfoSheet(data), 'Report Info');
    window.XLSX.utils.book_append_sheet(wb, buildExportDataSheet(data), data.sheetName);
    window.XLSX.writeFile(wb, data.filename);
  }

  // An export spec whose rows are built on first read rather than on every
  // render. Flattening the filtered visits into spreadsheet rows means a pass
  // over the whole filtered set — not the ~150 rows actually on screen — and
  // buildVisitNotes() renders every answer on every visit. Most sessions never
  // export at all, so that was paid for constantly and used almost never.
  //
  // A memoised getter rather than a plain function so `data.rows` still reads
  // as an array everywhere downstream: the row count in the confirmation
  // dialog, the emptiness check, and the writer all keep working unchanged.
  function withLazyRows(spec, buildRows) {
    var cached = null;
    Object.defineProperty(spec, 'rows', {
      configurable: true,
      enumerable: true,
      get: function () {
        if (!cached) cached = buildRows();
        return cached;
      }
    });
    return spec;
  }

  // Every report export flows through this confirmation before the browser is
  // allowed to create a file. That keeps repeated or accidental clicks from
  // starting multiple downloads.
  function exportVisitLogFile() {
    var data = window.GAILS._visitLogExport;
    if (!data) return;
    // rowCount is the cheap count the render already knew, so an empty export
    // is rejected without building any rows at all. Falls back to the rows
    // themselves for any spec that predates it.
    var count = typeof data.rowCount === 'number'
      ? data.rowCount
      : (data.rows ? data.rows.length : 0);
    if (!count) return;

    // SheetJS is fetched on demand, so settle whether this is an Excel or a CSV
    // export before the confirmation names the file — the modal has to promise
    // the format the download actually produces.
    window.GAILS.ensureXLSX().then(function () { confirmVisitLogExport(data); });
  }

  function confirmVisitLogExport(data) {
    var isExcel = !!window.XLSX;
    var filename = isExcel ? data.filename : data.filename.replace(/\.xlsx$/, '.csv');
    var rowLabel = data.rows.length === 1 ? 'row' : 'rows';

    window.GAILS.openSaveConfirmModal({
      title: isExcel ? 'Download Excel File' : 'Download CSV File',
      subtitle: 'Confirm before the download starts.',
      message: 'Download "' + filename + '" with ' + data.rows.length + ' ' + rowLabel + '?',
      confirmLabel: isExcel ? 'Download Excel' : 'Download CSV',
      onConfirm: function () {
        downloadVisitLogFile(data);
      }
    });
  }

  // Comparator behind the "Sort By" filter, shared by the rendered groups and
  // the export so a downloaded file lists visits in the same order as the view.
  function visitLogSorter(sortVal) {
    function bakeryLabel(v) {
      // Same display label as the rows (no "GAIL's" prefix), so an A-Z sort
      // matches what is on screen.
      return getDirectoryBakeryLabel(v.bakery) || '';
    }
    return function (a, b) {
      if (sortVal === 'nameAsc') return bakeryLabel(a).localeCompare(bakeryLabel(b));
      if (sortVal === 'nameDesc') return bakeryLabel(b).localeCompare(bakeryLabel(a));
      if (sortVal === 'type') return visitTypeLabel(a).localeCompare(visitTypeLabel(b));
      // Default: date descending
      var dateA = a.date + 'T' + (a.time || '00:00');
      var dateB = b.date + 'T' + (b.time || '00:00');
      return dateB.localeCompare(dateA);
    };
  }

  // Drives the "Group By" filter — Region (default), Ops Area, or Visit
  // Type all group the same underlying visit list, just bucketed differently.
  function getVisitGroupKey(v, groupVal) {
    var G = window.GAILS;
    if (groupVal === 'region') {
      return (G.getBakeryRegion ? G.getBakeryRegion(v.bakery) : '') || 'Unknown';
    }
    if (groupVal === 'type') {
      return visitTypeLabel(v);
    }
    if (groupVal === 'none') {
      return 'All Visits';
    }
    return (G.getBakeryOps ? G.getBakeryOps(v.bakery) : '') || 'Unknown';
  }

  // GAIL's reporting year starts in March: Q1 Mar-May, Q2 Jun-Aug,
  // Q3 Sep-Nov, and Q4 Dec-Feb.
  function getGailsQuarterStart(referenceDate) {
    var month = referenceDate.getMonth();
    var reportingYear = month >= 2 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
    var monthsSinceMarch = (month - 2 + 12) % 12;
    var quarterIndex = Math.floor(monthsSinceMarch / 3);
    return new Date(reportingYear, 2 + (quarterIndex * 3), 1);
  }

  // True for the one period option that can reach behind the rolling window the
  // live feed subscribes to. Every other preset — including "Last Year" and
  // "Last 12 Months" — stops inside it by construction, so only All Time has to
  // pay for the rest of the history.
  function periodNeedsFullHistory(n) {
    if (n === 'currentMonth' || n === 'thisQuarter' || n === 'lastQuarter' ||
        n === 'thisYear' || n === 'lastYear') {
      return false;
    }
    var num = parseInt(n, 10);
    return isNaN(num) || num === 0;
  }

  var allTimeVisitsRequested = false;

  function ensureVisitHistoryFor(periodVal) {
    if (!periodNeedsFullHistory(periodVal)) return;
    if (allTimeVisitsRequested) return;
    if (typeof window.GAILS.loadAllTimeVisits !== 'function') return;
    allTimeVisitsRequested = true;
    // No re-render here: the feed hands the widened set to the same callback
    // the live subscription uses, which re-renders on the way through.
    window.GAILS.loadAllTimeVisits().catch(function (error) {
      allTimeVisitsRequested = false;
      console.error('Could not load the full visit history:', error);
    });
  }

  function isDateWithinMonths(dateStr, n) {
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return false;
    var now = new Date();

    if (n === 'currentMonth') {
      var currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      now.setHours(23, 59, 59, 999);
      return d >= currentMonthStart && d <= now;
    }

    if (n === 'thisQuarter') {
      var currentQuarterStart = getGailsQuarterStart(now);
      now.setHours(23, 59, 59, 999);
      return d >= currentQuarterStart && d <= now;
    }

    if (n === 'lastQuarter') {
      var currentQuarterStart = getGailsQuarterStart(now);
      var previousQuarterStart = new Date(currentQuarterStart.getFullYear(), currentQuarterStart.getMonth() - 3, 1);
      return d >= previousQuarterStart && d < currentQuarterStart;
    }

    if (n === 'thisYear') {
      return d.getFullYear() === now.getFullYear();
    }

    // The previous calendar year always uses its exact Jan 1 - Dec 31 range.
    if (n === 'lastYear') {
      return d.getFullYear() === now.getFullYear() - 1;
    }

    var num = parseInt(n, 10);
    if (isNaN(num) || num === 0) return true;

    // "Last Month" is the complete previous calendar month. Larger numeric
    // periods include the current month-to-date: when today is in July,
    // "Last 2 Months" starts June 1 and "Last 3 Months" starts May 1.
    var currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    if (num === 1) {
      var previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d >= previousMonthStart && d < currentMonthStart;
    }

    var periodStart = new Date(now.getFullYear(), now.getMonth() - (num - 1), 1);
    now.setHours(23, 59, 59, 999);
    return d >= periodStart && d <= now;
  }

  // The Rating filter (Green/Yellow/Red) only makes sense once the results
  // are scoped to CQVs, so it stays hidden — and its value is cleared, so a
  // leftover selection can't silently keep filtering after switching back to
  // another visit type — until "CQV" or "CQV Follow-Up" is selected.
  function syncCqvRatingVisibility() {
    var typeEl = document.getElementById('visitLogType');
    var ratingControl = document.getElementById('visitLogRatingControl');
    var ratingEl = document.getElementById('visitLogRating');
    if (!typeEl || !ratingControl) return;
    var isCqvType = typeEl.value === 'cqv' || typeEl.value === 'cqvFollowUp';
    ratingControl.style.display = isCqvType ? '' : 'none';
    if (!isCqvType && ratingEl && ratingEl.value) {
      ratingEl.value = '';
      if (window.GAILS.syncCustomSelect) window.GAILS.syncCustomSelect('visitLogRating');
    }
  }

  // The card's own title, which tracks the selected view. Kept in step with
  // the nav labels above it — they are the same four names.
  var VISIT_LOG_VIEW_TITLES = {
    bakeries: 'Bakery Directory',
    history: 'Visit History',
    unvisited: 'Unvisited Sites',
    followups: 'Follow-up Tasks'
  };

  function syncVisitLogSectionTitle(view) {
    var el = document.getElementById('visitLogSectionTitle');
    if (!el) return;
    var baseTitle = VISIT_LOG_VIEW_TITLES[view] || VISIT_LOG_VIEW_TITLES.history;
    // History and Unvisited Sites are the two views scoped by the Period
    // filter, so their title names the period in view alongside them.
    if (view === 'history' || view === 'unvisited') {
      var periodEl = document.getElementById('visitLogPeriod');
      var periodVal = periodEl ? periodEl.value : getVisitLogDefaultPeriod(view);
      el.textContent = baseTitle + ' - ' + getPeriodLabel(periodVal);
    } else {
      el.textContent = baseTitle;
    }
  }

  // One primary action per view, in the card's header slot.
  //
  // The pair used to sit on every view, which meant Follow-up Tasks offered
  // "+ Log Visit" while its real action ("+ Add task") was stranded in the
  // summary bar below. Each view now shows the one action it is actually for,
  // and the whole slot comes off where there is no action.
  //
  // The external Google Form link stays on every view that has a slot: it is
  // the same hand-off whichever list you are looking at.
  function syncVisitLogActions(view) {
    var actionsEl = document.querySelector('#tab-visit-log .visit-log-actions');
    if (!actionsEl) return;

    var allowed = canLogVisits();
    // Unvisited Sites keeps its header button even though every card carries
    // one: the card buttons are pre-filled for that bakery, this one is not.
    var showLogVisit = allowed && (view === 'history' || view === 'unvisited');
    var showAddTask = allowed && view === 'followups';

    var logBtn = document.getElementById('visitLogAddBtn');
    if (logBtn) logBtn.hidden = !showLogVisit;
    var taskBtn = document.getElementById('visitLogAddTaskBtn');
    if (taskBtn) taskBtn.hidden = !showAddTask;

    // The bakery directory is reference data rather than an action queue, so
    // the slot goes entirely, external visit-form link included.
    actionsEl.hidden = view === 'bakeries';
  }

  function syncVisitLogViewControls(view) {
    var isHistoryView = view === 'history';
    var isFollowUps = view === 'followups';
    var isBakeryList = view === 'bakeries';
    var filterBarEl = document.querySelector('.visit-log-filter-bar');
    if (filterBarEl) filterBarEl.setAttribute('data-visit-view', view);
    syncVisitLogSectionTitle(view);
    syncVisitLogActions(view);
    var searchEl = document.getElementById('visitLogSearch');
    var typeEl = document.getElementById('visitLogType');
    var groupEl = document.getElementById('visitLogGroup');
    var sortEl = document.getElementById('visitLogSort');
    var periodEl = document.getElementById('visitLogPeriod');
    var bakeryControl = document.getElementById('visitLogBakeryControl');
    var directorySortControl = document.getElementById('visitLogDirectorySortControl');
    var directoryGroupControl = document.getElementById('visitLogDirectoryGroupControl');
    var followUpAssigneeControl = document.getElementById('followUpAssigneeControl');
    var followUpGroupControl = document.getElementById('followUpGroupControl');
    var followUpSortControl = document.getElementById('followUpSortControl');
    var typeControl = typeEl ? typeEl.closest('.visit-log-filter-control') : null;
    var sortControl = sortEl ? sortEl.closest('.visit-log-filter-control') : null;
    var groupControl = groupEl ? groupEl.closest('.visit-log-filter-control') : null;
    var periodControl = periodEl ? periodEl.closest('.visit-log-filter-control') : null;
    var ratingControl = document.getElementById('visitLogRatingControl');
    var statusToggle = document.getElementById('followUpStatusToggle');
    var typeGroupOption = groupEl ? groupEl.querySelector('option[value="type"]') : null;

    if (searchEl) {
      // The field's own SEARCH label carries the verb, so the placeholder only
      // has to name what can be matched — which also keeps it inside the
      // control on the single-row filter layout, where Search is a fixed
      // 225px. "coffee team" would ellipsise there, and the directory's team
      // columns are the only ones "team" could mean.
      searchEl.placeholder = isBakeryList
        ? 'Bakery, ops area or team…'
        : (isHistoryView
          ? 'Bakery or partner…'
          : (isFollowUps ? 'Bakery or action…' : 'Bakery name…'));
    }
    if (typeControl) typeControl.style.display = isHistoryView ? '' : 'none';
    if (sortControl) sortControl.style.display = isHistoryView ? '' : 'none';
    if (bakeryControl) bakeryControl.style.display = isBakeryList ? '' : 'none';
    if (directorySortControl) directorySortControl.style.display = isBakeryList ? '' : 'none';
    if (directoryGroupControl) directoryGroupControl.style.display = isBakeryList ? '' : 'none';
    if (followUpAssigneeControl) followUpAssigneeControl.style.display = isFollowUps ? '' : 'none';
    if (followUpGroupControl) followUpGroupControl.style.display = isFollowUps ? '' : 'none';
    if (followUpSortControl) followUpSortControl.style.display = isFollowUps ? '' : 'none';
    // Follow-ups use their task-specific Group By and Sort By controls and
    // ignore the reporting period. The directory has its own list controls.
    if (groupControl) groupControl.style.display = (isFollowUps || isBakeryList) ? 'none' : '';
    if (periodControl) periodControl.style.display = (isFollowUps || isBakeryList) ? 'none' : '';
    if (statusToggle) statusToggle.style.display = isFollowUps ? 'flex' : 'none';

    syncCqvRatingVisibility();
    if (!isHistoryView && ratingControl) ratingControl.style.display = 'none';

    // Unvisited sites have no visit type of their own. Region, Ops Area, and
    // ungrouped views remain meaningful, but grouping them by visit type does
    // not, so fall back to Region if that history-only option was active.
    if (!isHistoryView && groupEl && groupEl.value === 'type') {
      groupEl.value = getVisitLogDefaultGroup();
      if (window.GAILS.syncCustomSelect) window.GAILS.syncCustomSelect(groupEl);
    }
    if (!isHistoryView && typeGroupOption) {
      typeGroupOption.remove();
    } else if (isHistoryView && groupEl && !typeGroupOption) {
      var restoredTypeOption = document.createElement('option');
      restoredTypeOption.value = 'type';
      restoredTypeOption.textContent = 'Visit Type';
      var noneOption = groupEl.querySelector('option[value="none"]');
      groupEl.insertBefore(restoredTypeOption, noneOption || null);
    }
  }

  // Role permission for logging visits (set by js/auth.js after sign-in).
  // Defaults to allowed when permissions haven't loaded so the built-in
  // roles keep their historical behaviour.
  function canLogVisits() {
    var perms = window.GAILS && window.GAILS.permissions;
    return !(perms && perms.actions && perms.actions.logVisits === false);
  }

  // ========== FOLLOW-UP ACTIONS (shared helpers) ==========
  // Site-scoped tasks live in Firebase at followUpActions/{id} and are synced
  // into window.GAILS._followUpActionsObj by js/auth.js.
  function getFollowUpList() {
    var obj = window.GAILS._followUpActionsObj || {};
    return Object.keys(obj).map(function (id) { return Object.assign({ id: id }, obj[id]); })
      // Scoped ops managers only see follow-ups for their own ops area. This is
      // the single source for the Follow-ups view and the Log Visit modal's
      // open-task checklist, so both inherit the scope.
      .filter(function (t) { return reportBakeryAllowed(t.bakery); });
  }

  function getOpenFollowUpsForBakery(bakery) {
    if (!bakery) return [];
    return getFollowUpList().filter(function (t) {
      return t.bakery === bakery && (t.status || 'open') !== 'done';
    }).sort(followUpSortByDue);
  }

  function todayMidnight() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Presentation metadata for a due date: state drives the pill colour, label
  // is the human text, days is negative when overdue.
  function dueMeta(iso) {
    if (!iso) return { state: 'none', label: 'No deadline', days: null };
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return { state: 'none', label: 'No deadline', days: null };
    var days = Math.round((d - todayMidnight()) / 86400000);
    if (days < 0) return { state: 'overdue', label: Math.abs(days) + ' day' + (Math.abs(days) === 1 ? '' : 's') + ' overdue', days: days };
    if (days === 0) return { state: 'today', label: 'Due today', days: 0 };
    if (days <= 7) return { state: 'soon', label: 'Due in ' + days + ' day' + (days === 1 ? '' : 's'), days: days };
    return { state: 'future', label: 'Due ' + formatFollowUpDate(iso), days: days };
  }

  // Unprioritised tasks sort last among ties. 'none' is also what tasks
  // created before priority existed fall back to, which is more honest than
  // inventing a level for them.
  var PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };
  var PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low', none: 'None' };

  var FOLLOW_UP_STATUS_LABELS = { open: 'Open', overdue: 'Overdue', done: 'Done', all: 'All' };

  function normalizePriority(value) {
    var v = String(value || '').toLowerCase();
    return PRIORITY_ORDER[v] !== undefined ? v : 'none';
  }

  // Renders nothing for unprioritised tasks — a "NONE" tag on every legacy row
  // would be noise and would bury the levels that actually mean something.
  function priorityTagHtml(task) {
    var p = normalizePriority(task.priority);
    if (p === 'none') return '';
    return '<span class="follow-up-priority follow-up-priority--' + p + '">' + PRIORITY_LABELS[p] + '</span>';
  }

  // Dated tasks first (earliest deadline first), then undated — a deadline is
  // more actionable than a priority label, so it leads; an overdue Low still
  // outranks a High due next month. Priority breaks ties, which is what orders
  // the undated tasks among themselves.
  function followUpSortByDue(a, b) {
    var da = a.dueDate || '';
    var db = b.dueDate || '';
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return PRIORITY_ORDER[normalizePriority(a.priority)] - PRIORITY_ORDER[normalizePriority(b.priority)];
  }

  function followUpIsDone(task) {
    return (task.status || 'open') === 'done';
  }

  function followUpIsOverdue(task) {
    return !followUpIsDone(task) && dueMeta(task.dueDate).state === 'overdue';
  }

  function followUpBakeryLabel(task) {
    return getDirectoryBakeryLabel(task.bakery);
  }

  // Sort options used by Follow-up Tasks. Completed work remains below open
  // work when "All" is selected; the chosen ordering then applies within each
  // status, with the task title providing a stable final tie-break.
  function followUpTaskSorter(sortVal) {
    return function (a, b) {
      var doneA = followUpIsDone(a);
      var doneB = followUpIsDone(b);
      if (doneA !== doneB) return doneA ? 1 : -1;

      var compared = 0;
      if (sortVal === 'dueDesc') {
        var dueA = a.dueDate || '';
        var dueB = b.dueDate || '';
        if (dueA && dueB && dueA !== dueB) compared = dueA > dueB ? -1 : 1;
        else if (dueA && !dueB) compared = -1;
        else if (!dueA && dueB) compared = 1;
      } else if (sortVal === 'priority') {
        compared = PRIORITY_ORDER[normalizePriority(a.priority)] - PRIORITY_ORDER[normalizePriority(b.priority)];
        if (!compared) compared = followUpSortByDue(a, b);
      } else if (sortVal === 'createdDesc' || sortVal === 'createdAsc') {
        var createdA = a.createdAt || '';
        var createdB = b.createdAt || '';
        compared = createdA.localeCompare(createdB);
        if (sortVal === 'createdDesc') compared *= -1;
      } else if (sortVal === 'bakeryAsc') {
        compared = followUpBakeryLabel(a).localeCompare(followUpBakeryLabel(b));
      } else {
        compared = followUpSortByDue(a, b);
      }

      return compared || String(a.title || '').localeCompare(String(b.title || ''));
    };
  }

  function getFollowUpGroupKey(task, groupVal) {
    var G = window.GAILS;
    if (groupVal === 'region') {
      return (G.getBakeryRegion ? G.getBakeryRegion(task.bakery) : '') || 'Unknown region';
    }
    if (groupVal === 'ops') {
      return (G.getBakeryOps ? G.getBakeryOps(task.bakery) : '') || 'Unknown ops area';
    }
    if (groupVal === 'priority') {
      var priority = normalizePriority(task.priority);
      return priority === 'none' ? 'No priority' : PRIORITY_LABELS[priority] + ' priority';
    }
    if (groupVal === 'status') {
      if (followUpIsDone(task)) return 'Done';
      return followUpIsOverdue(task) ? 'Overdue' : 'Open';
    }
    if (groupVal === 'none') return 'All follow-ups';
    return followUpBakeryLabel(task);
  }

  function followUpAttributionLabel(task) {
    var people = followUpResponsiblePeople(task);
    if (window.GAILS.Attribution) return window.GAILS.Attribution.label(people);
    return window.GAILS.Mentions ? window.GAILS.Mentions.formatPeople(people) : '';
  }

  function followUpPersonLabel(person) {
    return String(person && (person.name || person.email || person.uid) || '').trim();
  }

  function followUpPersonFilterValue(person) {
    return followUpPersonLabel(person).toLowerCase().replace(/\s+/g, ' ');
  }

  function followUpTaskMatchesAssignee(task, assigneeValue) {
    if (!assigneeValue) return true;
    return followUpResponsiblePeople(task).some(function (person) {
      return followUpPersonFilterValue(person) === assigneeValue;
    });
  }

  // The filter is data-led: only people who own at least one accessible
  // follow-up are offered. One person appears once even if they own many tasks.
  function populateFollowUpAssigneeOptions() {
    var select = document.getElementById('followUpAssignee');
    if (!select) return;

    var peopleByValue = {};
    getFollowUpList().forEach(function (task) {
      followUpResponsiblePeople(task).forEach(function (person) {
        var value = followUpPersonFilterValue(person);
        var label = followUpPersonLabel(person);
        if (value && label && !peopleByValue[value]) peopleByValue[value] = label;
      });
    });

    var options = Object.keys(peopleByValue).map(function (value) {
      return { value: value, label: peopleByValue[value] };
    }).sort(function (a, b) {
      return a.label.localeCompare(b.label);
    });
    var signature = JSON.stringify(options);
    var wantedValue = select.value || window.GAILS._pendingFollowUpAssigneeFilter || '';

    if (select.dataset.assigneeOptions !== signature) {
      select.innerHTML = '';
      var allOption = document.createElement('option');
      allOption.value = '';
      allOption.textContent = 'All';
      select.appendChild(allOption);
      options.forEach(function (option) {
        var el = document.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        select.appendChild(el);
      });
      select.dataset.assigneeOptions = signature;
    }

    if (wantedValue && options.some(function (option) { return option.value === wantedValue; })) {
      select.value = wantedValue;
      window.GAILS._pendingFollowUpAssigneeFilter = '';
    } else if (wantedValue) {
      select.value = '';
    }
    if (window.GAILS.syncCustomSelect) window.GAILS.syncCustomSelect(select);
  }

  function followUpGroupSorter(groupVal) {
    var priorityOrder = { 'High priority': 0, 'Medium priority': 1, 'Low priority': 2, 'No priority': 3 };
    var statusOrder = { Overdue: 0, Open: 1, Done: 2 };
    return function (a, b) {
      if (groupVal === 'priority') return priorityOrder[a] - priorityOrder[b];
      if (groupVal === 'status') return statusOrder[a] - statusOrder[b];
      return a.localeCompare(b);
    };
  }

  function followUpBuilderRowHtml() {
    return '<div class="follow-up-builder__row">' +
      '<input type="text" class="visit-log-input follow-up-builder__title" placeholder="Follow-up action...">' +
      '<button type="button" class="follow-up-builder__remove" title="Remove" aria-label="Remove this follow-up">&#10005;</button>' +
      '<div class="follow-up-builder__meta">' +
      '<select class="visit-log-select follow-up-builder__priority" aria-label="Priority">' +
      '<option value="none" selected>No priority</option>' +
      '<option value="low">Low</option>' +
      '<option value="medium">Medium</option>' +
      '<option value="high">High</option>' +
      '</select>' +
      '<input type="date" class="visit-log-input follow-up-builder__date" title="Deadline (optional)" aria-label="Deadline (optional)">' +
      '</div>' +
      '</div>';
  }

  // Rows are built as markup, so each new priority <select> has to be wrapped
  // into the site-wide custom dropdown by hand (js/custom-selects.js only
  // auto-enhances what exists at load).
  function enhanceBuilderRow(row) {
    if (!row) return;
    var priority = row.querySelector('.follow-up-builder__priority');
    if (priority && window.GAILS.syncCustomSelect) window.GAILS.syncCustomSelect(priority);
  }

  function appendFollowUpBuilderRow(rows) {
    if (!rows) return null;
    rows.insertAdjacentHTML('beforeend', followUpBuilderRowHtml());
    var row = rows.lastElementChild;
    enhanceBuilderRow(row);
    return row;
  }

  function resetFollowUpBuilder() {
    var rows = document.getElementById('addVisitNewTasks');
    if (!rows) return;
    rows.innerHTML = '';
    appendFollowUpBuilderRow(rows);
  }

  function collectNewFollowUps() {
    var rows = document.getElementById('addVisitNewTasks');
    if (!rows) return [];
    return Array.prototype.map.call(rows.querySelectorAll('.follow-up-builder__row'), function (row) {
      var title = row.querySelector('.follow-up-builder__title');
      var date = row.querySelector('.follow-up-builder__date');
      var priority = row.querySelector('.follow-up-builder__priority');
      return {
        title: title ? title.value.trim() : '',
        dueDate: date && date.value ? date.value : null,
        priority: normalizePriority(priority && priority.value)
      };
    }).filter(function (t) { return t.title; });
  }

  // Renders the "tick off open follow-ups" checklist in the Log Visit modal for
  // the currently selected bakery. Hidden entirely when the site has none open.
  function renderCheckInOpenTasks(bakery) {
    var wrap = document.getElementById('addVisitOpenTasks');
    var list = document.getElementById('addVisitOpenTasksList');
    var empty = document.getElementById('addVisitNoOpenTasks');
    if (!wrap || !list) return;
    var tasks = getOpenFollowUpsForBakery(bakery);
    if (!tasks.length) {
      wrap.hidden = true;
      list.innerHTML = '';
      if (empty) {
        empty.textContent = bakery
          ? 'No open follow-ups for this site.'
          : 'Select a bakery to see its open follow-ups.';
        empty.hidden = false;
      }
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = tasks.map(function (t) {
      var m = dueMeta(t.dueDate);
      return '<label class="follow-up-check">' +
        '<input type="checkbox" class="follow-up-check__box" data-task-id="' + escapeHtml(t.id) + '">' +
        '<span class="follow-up-check__body">' +
        '<span class="follow-up-check__title">' + escapeHtml(t.title || 'Untitled task') + '</span>' +
        priorityTagHtml(t) +
        (t.dueDate ? '<span class="follow-up-pill follow-up-pill--' + m.state + '">' + escapeHtml(m.label) + '</span>' : '') +
        '</span></label>';
    }).join('');
    wrap.hidden = false;
  }

  window.GAILS.openAddSiteVisitModal = function (presetBakery) {
    if (!canLogVisits()) return;
    var modal = document.getElementById('addSiteVisitModal');
    var select = document.getElementById('addVisitBakery');
    if (!modal || !select) return;

    // Populate bakery list if it only has placeholder
    if (select.options.length <= 1 && window.GAILS.state && window.GAILS.state.BAKERIES) {
      window.GAILS.state.BAKERIES.slice().sort().filter(reportBakeryAllowed).forEach(function (bName) {
        var opt = document.createElement('option');
        opt.value = bName;
        opt.textContent = bName;
        select.appendChild(opt);
      });
      // Theme it!
      if (window.GAILS.initCustomSelects) {
        window.GAILS.initCustomSelects(modal);
      }
    }

    // Reset form
    var form = document.getElementById('addSiteVisitForm');
    if (form) form.reset();

    // The Coffee Partner field doubles as the assignment control: start typing
    // to pick a colleague. Enhanced on first open (the modal markup
    // is static, so once is enough) and re-rendered after every reset, because
    // form.reset() clears the input without telling its display face.
    var partnerInput = document.getElementById('addVisitPartner');
    if (partnerInput) {
      var currentPerson = window.GAILS.currentPerson;
      partnerInput.value = currentPerson && currentPerson.name ? currentPerson.name : '';
      if (window.GAILS.MentionField) {
        window.GAILS.MentionField.enhance(partnerInput);
        window.GAILS.MentionField.refresh(partnerInput);
      }
    }

    // Pre-select the bakery when launched from an unvisited-site card
    if (presetBakery) {
      var hasOption = Array.prototype.some.call(select.options, function (o) { return o.value === presetBakery; });
      if (hasOption) select.value = presetBakery;
    }

    // Reset custom select trigger label if populated
    if (window.GAILS.syncCustomSelect) {
      window.GAILS.syncCustomSelect('addVisitBakery');
      window.GAILS.syncCustomSelect('addVisitType');
    }

    // Autofill date/time with local values
    var now = new Date();
    var yyyy = now.getFullYear();
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var dd = String(now.getDate()).padStart(2, '0');
    document.getElementById('addVisitDate').value = yyyy + '-' + mm + '-' + dd;

    var hh = String(now.getHours()).padStart(2, '0');
    var min = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('addVisitTime').value = hh + ':' + min;

    var errorEl = document.getElementById('addVisitError');
    if (errorEl) errorEl.style.display = 'none';

    // Reset the "add follow-up" builder to a single empty row, and show the
    // open-tasks checklist for the (possibly pre-selected) bakery.
    resetFollowUpBuilder();
    renderCheckInOpenTasks(select.value);

    modal.style.display = 'flex';
    lockBackgroundScroll();
  };

  window.GAILS.closeAddSiteVisitModal = function () {
    var modal = document.getElementById('addSiteVisitModal');
    if (!modal) return;
    modal.style.display = 'none';
    unlockBackgroundScroll();
  };

  // Standalone add/edit follow-up modal (opened from the Follow-ups view).
  // Pass an existing task to edit it; otherwise a new task is created.
  function followUpResponsiblePeople(task) {
    if (!task) return window.GAILS.currentPerson ? [window.GAILS.currentPerson] : [];
    var sourceVisit = task.sourceVisitId && window.GAILS._allVisitsObj
      ? window.GAILS._allVisitsObj[task.sourceVisitId]
      : null;
    if (window.GAILS.Attribution) return window.GAILS.Attribution.forTask(task, sourceVisit);
    return window.GAILS.Mentions
      ? window.GAILS.Mentions.toAssigneeList(task.assignedTo)
      : [];
  }

  window.GAILS.openFollowUpModal = function (presetBakery, editTask) {
    if (!canLogVisits()) return;
    var modal = document.getElementById('addFollowUpModal');
    var select = document.getElementById('followUpBakery');
    var form = document.getElementById('addFollowUpForm');
    if (!modal || !select || !form) return;

    // Populate bakery list once (mirrors openAddSiteVisitModal).
    if (select.options.length <= 1 && window.GAILS.state && window.GAILS.state.BAKERIES) {
      window.GAILS.state.BAKERIES.slice().sort().filter(reportBakeryAllowed).forEach(function (bName) {
        var opt = document.createElement('option');
        opt.value = bName;
        opt.textContent = bName;
        select.appendChild(opt);
      });
      if (window.GAILS.initCustomSelects) window.GAILS.initCustomSelects(modal);
    }

    form.reset();
    var titleEl = document.getElementById('addFollowUpTitle');
    var submitBtn = document.getElementById('followUpSubmitBtn');
    document.getElementById('followUpEditId').value = editTask ? editTask.id : '';
    if (titleEl) titleEl.textContent = editTask ? 'Edit follow-up' : 'Add follow-up';
    if (submitBtn) submitBtn.textContent = editTask ? 'Save changes' : 'Save follow-up';

    var bakeryVal = editTask ? editTask.bakery : (presetBakery || '');
    if (bakeryVal) {
      var hasOption = Array.prototype.some.call(select.options, function (o) { return o.value === bakeryVal; });
      if (hasOption) select.value = bakeryVal;
    }
    document.getElementById('followUpTitle').value = editTask ? (editTask.title || '') : '';
    document.getElementById('followUpDueDate').value = editTask && editTask.dueDate ? editTask.dueDate : '';
    document.getElementById('followUpDetail').value = editTask ? (editTask.detail || '') : '';
    document.getElementById('followUpPriority').value = normalizePriority(editTask && editTask.priority);
    var assigneeInput = document.getElementById('followUpAssignees');
    if (assigneeInput) {
      var responsible = followUpResponsiblePeople(editTask);
      assigneeInput.value = window.GAILS.Mentions
        ? window.GAILS.Mentions.formatPeople(responsible)
        : responsible.map(function (person) { return person.name || person.email || ''; })
          .filter(Boolean).join(' & ');
      if (window.GAILS.MentionField) {
        window.GAILS.MentionField.enhance(assigneeInput);
        window.GAILS.MentionField.refresh(assigneeInput);
      }
    }

    if (window.GAILS.syncCustomSelect) {
      window.GAILS.syncCustomSelect('followUpBakery');
      window.GAILS.syncCustomSelect('followUpPriority');
    }

    var errorEl = document.getElementById('followUpError');
    if (errorEl) errorEl.style.display = 'none';

    modal.style.display = 'flex';
    lockBackgroundScroll();
  };

  window.GAILS.closeFollowUpModal = function () {
    var modal = document.getElementById('addFollowUpModal');
    if (!modal) return;
    modal.style.display = 'none';
    unlockBackgroundScroll();
  };

  window.GAILS.openVisitReportById = function (visitId) {
    var record = window.GAILS._allVisitsObj ? window.GAILS._allVisitsObj[visitId] : null;
    var modal = document.getElementById('visitReportModal');
    var titleEl = document.getElementById('visitReportTitle');
    var subtitleEl = document.getElementById('visitReportSubtitle');
    var bodyEl = document.getElementById('visitReportBody');
    if (!modal || !titleEl || !subtitleEl || !bodyEl) return;
    var modalWasOpen = modal.style.display !== 'none';
    resetVisitReportContext();

    if (!record) {
      window.GAILS._activeVisitReportId = null;
      titleEl.textContent = 'Error';
      subtitleEl.textContent = 'Visit record not found.';
      bodyEl.innerHTML = '<div class="visit-report-empty visit-report-empty--error">' +
        '<span aria-hidden="true">!</span><h4>This report is unavailable</h4>' +
        '<p>The visit may have been removed or the link may no longer be valid.</p>' +
        '</div>';
      resetVisitReportBodyLayout(bodyEl);
      setVisitReportPresentation('error');
      renderVisitReportActions(null, null);
      showVisitReportModal(modal);
      bodyEl.scrollTop = 0;
      if (!modalWasOpen) lockBackgroundScroll();
      return;
    }

    if (window.GAILS.destroyChart) {
      window.GAILS.destroyChart(CHART_ID);
      window.GAILS.destroyChart(CQV_CHART_ID);
    }
    window.GAILS._activeVisitReportId = visitId;
    renderVisitReportActions(record, visitId);

    if (record.type === 'cqv') {
      titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery;
      subtitleEl.textContent = (record.isFollowUp ? 'CQV follow-up' : 'Coffee Quality Visit') + ' on ' + formatVisitDate(record.date) + (record.title ? ' — ' + record.title : '');
      bodyEl.innerHTML = buildCqvReportHtml(record);
      setVisitReportPresentation(record.isFollowUp ? 'followup' : 'cqv', record);
      enhanceVisitReportBody(bodyEl);

      showVisitReportModal(modal);
      bodyEl.scrollTop = 0;
      if (!modalWasOpen) lockBackgroundScroll();
      requestAnimationFrame(function () { drawCqvScoreChart(record); });
      return;
    }

    if (record.type === 'nbo') {
      titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery;
      subtitleEl.textContent = 'NBO Coffee Visit ' + (record.visitNumber || 1) + ' on ' + formatVisitDate(record.date)
        + (record.auditorName ? ' — ' + record.auditorName : '');
      bodyEl.innerHTML = buildNboReportHtml(record);
      setVisitReportPresentation('nbo', record);
      enhanceVisitReportBody(bodyEl);

      showVisitReportModal(modal);
      bodyEl.scrollTop = 0;
      if (!modalWasOpen) lockBackgroundScroll();
      return;
    }

    if (record.type === 'siteVisit') {
      titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery;
      subtitleEl.textContent = siteVisitKindLabel(record) + ' on ' + formatVisitDate(record.date) + (record.time ? ' at ' + record.time : '');

      // Check-ins and NBO openings are both ad-hoc site visits and share the
      // same context-rail + notes + support workspace; only the "Logged by"
      // detail differs (a check-in is always logged by the visitor, so it
      // would be redundant there — an NBO opening is not).
      var isCheckin = !record.visitKind || record.visitKind === 'checkin';
      bodyEl.innerHTML = '<div class="visit-report-checkin-workspace">' +
          buildCheckinContextHtml(record) +
          '<section class="visit-report-section visit-report-section--comments visit-report-checkin-comments" aria-labelledby="visitCheckinCommentsTitle">' +
            '<div class="visit-report-comments-heading">' +
              '<h4 id="visitCheckinCommentsTitle">Visit notes</h4>' +
            '</div>' +
            '<div class="visit-report-notes" role="region" aria-label="Visit notes" tabindex="0">' +
              '<p class="visit-report-comment visit-report-comment--primary">' + escapeHtml(record.comments || 'No comments recorded.') + '</p>' +
            '</div>' +
          '</section>' +
          buildCheckinSupportHtml(record) +
        '</div>';

      resetVisitReportBodyLayout(bodyEl);
      setVisitReportPresentation(isCheckin ? 'checkin' : 'opening', record);
      showVisitReportModal(modal);
      bodyEl.scrollTop = 0;
      if (!modalWasOpen) lockBackgroundScroll();
      hydrateCheckinContext(bodyEl, record);
      return;
    }

    titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery;
    subtitleEl.textContent = 'Visited ' + formatVisitDate(record.date) + (record.time ? ' at ' + record.time : '');
    bodyEl.innerHTML = buildReportHtml(record);
    setVisitReportPresentation('routine', record);
    enhanceVisitReportBody(bodyEl);

    showVisitReportModal(modal);
    bodyEl.scrollTop = 0;
    if (!modalWasOpen) lockBackgroundScroll();
    requestAnimationFrame(function () { drawScoreChart(record); });
  };

  // Deep link support for my-activity.html, which links each visit straight to
  // its report as index.html?visit=<id>#visit-log. The hash activates the tab
  // (js/app.js); this opens the report itself. The visits node arrives
  // asynchronously, so the id is held until the record it names exists and the
  // report is opened exactly once — a later re-render must not reopen it after
  // the user has closed it.
  var pendingVisitDeepLinkId = (function () {
    try {
      return new URLSearchParams(window.location.search).get('visit') || '';
    } catch (e) {
      console.warn('Could not read the visit deep link:', e);
      return '';
    }
  })();

  window.GAILS.openVisitFromDeepLink = function () {
    if (!pendingVisitDeepLinkId) return;
    var visits = window.GAILS._allVisitsObj || {};
    var visitId = pendingVisitDeepLinkId;
    if (visits[visitId]) {
      pendingVisitDeepLinkId = '';
      window.GAILS.openVisitReportById(visitId);
      return;
    }
    // Older than the rolling window the feed carries (js/visit-feed.js), so it
    // is fetched on its own and dropped into the same lookup the report reads.
    // The id stays pending until it resolves, so a later snapshot can still
    // open it if this fetch fails.
    if (typeof window.GAILS.fetchVisitById !== 'function') return;
    window.GAILS.fetchVisitById(visitId).then(function (record) {
      if (!record || pendingVisitDeepLinkId !== visitId) return;
      window.GAILS._allVisitsObj = window.GAILS._allVisitsObj || {};
      window.GAILS._allVisitsObj[visitId] = record;
      // The period fold in js/config.js caches against the snapshot object's
      // identity, so editing it in place has to say so.
      if (typeof window.GAILS.invalidateVisitPeriodIndex === 'function') {
        window.GAILS.invalidateVisitPeriodIndex();
      }
      pendingVisitDeepLinkId = '';
      window.GAILS.openVisitReportById(visitId);
    }).catch(function (error) {
      console.error('Could not load the linked visit:', error);
    });
  };

  window.GAILS.deleteVisit = function (visitId) {
    var record = window.GAILS._allVisitsObj ? window.GAILS._allVisitsObj[visitId] : null;
    var bakeryName = record ? (window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery) : 'this';
    var dateText = record ? formatVisitDate(record.date) : '';

    var modal = document.getElementById('deleteConfirmModal');
    var promptText = document.getElementById('deleteConfirmPromptText');
    var input = document.getElementById('deleteConfirmInput');
    var submitBtn = document.getElementById('deleteConfirmSubmitBtn');

    if (!modal || !promptText || !input || !submitBtn) return;

    promptText.textContent = 'Are you sure you want to permanently delete the check-in for ' + bakeryName + (dateText ? ' on ' + dateText : '') + '?';
    input.value = '';
    submitBtn.disabled = true;

    modal.style.display = 'flex';
    lockBackgroundScroll();

    input.oninput = function () {
      submitBtn.disabled = input.value.trim().toLowerCase() !== 'delete record';
    };

    submitBtn.onclick = async function () {
      if (input.value.trim().toLowerCase() !== 'delete record') return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Deleting...';

      var deleteBtn = document.querySelector('.visit-report-delete-btn');
      if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
      }

      try {
        if (!window.GAILS_Firebase || typeof window.GAILS_Firebase.deleteSiteVisit !== 'function') {
          throw new Error('Database helper not loaded yet. Please try again.');
        }
        await window.GAILS_Firebase.deleteSiteVisit(visitId);
        window.GAILS.closeDeleteConfirmModal();
        window.GAILS.closeVisitReport();
      } catch (err) {
        console.error(err);
        alert(err.message || 'Failed to delete check-in.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Delete';
        if (deleteBtn) {
          deleteBtn.disabled = false;
          deleteBtn.textContent = 'Delete';
        }
      }
    };
  };

  window.GAILS.closeDeleteConfirmModal = function () {
    var modal = document.getElementById('deleteConfirmModal');
    if (modal) {
      modal.style.display = 'none';
      var reportModal = document.getElementById('visitReportModal');
      if (!reportModal || reportModal.style.display === 'none') {
        unlockBackgroundScroll();
      }
    }
  };

  // Shared lightweight confirmation dialog for saves, actions, and downloads,
  // themed to match the delete-confirm modal. A triggering form modal may stay
  // open behind it and keep the background-scroll lock, so this helper
  // deliberately never touches lock/unlock.
  window.GAILS.openSaveConfirmModal = function (opts) {
    opts = opts || {};
    var modal = document.getElementById('saveConfirmModal');
    var titleEl = document.getElementById('saveConfirmTitle');
    var subtitleEl = document.getElementById('saveConfirmSubtitle');
    var messageEl = document.getElementById('saveConfirmMessage');
    var confirmBtn = document.getElementById('saveConfirmBtn');
    var cancelBtn = modal ? modal.querySelector('[data-save-confirm-cancel]') : null;

    // If the markup is missing for any reason, fail open so saving still works.
    if (!modal || !confirmBtn) {
      if (typeof opts.onConfirm === 'function') opts.onConfirm();
      return;
    }

    if (titleEl) titleEl.textContent = opts.title || 'Confirm';
    if (subtitleEl) {
      subtitleEl.textContent = opts.subtitle || '';
      subtitleEl.style.display = opts.subtitle ? '' : 'none';
    }
    if (messageEl) messageEl.textContent = opts.message || 'Are you sure you want to save this?';
    confirmBtn.textContent = opts.confirmLabel || 'Confirm';
    confirmBtn.disabled = false;
    modal.setAttribute('data-confirm-tone', opts.tone === 'danger' ? 'danger' : 'default');
    saveConfirmReturnFocus = document.activeElement;

    modal.style.display = 'flex';
    window.requestAnimationFrame(function () {
      var initialFocus = opts.tone === 'danger' && cancelBtn ? cancelBtn : confirmBtn;
      if (initialFocus) initialFocus.focus();
    });

    // Fresh handler on every open so callbacks never stack across invocations.
    confirmBtn.onclick = function () {
      if (confirmBtn.disabled) return;
      confirmBtn.disabled = true;
      confirmBtn.onclick = null;
      window.GAILS.closeSaveConfirmModal();
      if (typeof opts.onConfirm === 'function') opts.onConfirm();
    };
  };

  window.GAILS.closeSaveConfirmModal = function () {
    var modal = document.getElementById('saveConfirmModal');
    if (modal) {
      modal.style.display = 'none';
      modal.removeAttribute('data-confirm-tone');
    }
    if (saveConfirmReturnFocus && typeof saveConfirmReturnFocus.focus === 'function') {
      saveConfirmReturnFocus.focus();
    }
    saveConfirmReturnFocus = null;
  };

  function populateDropdown(selectId, itemsSet, placeholder) {
    var select = document.getElementById(selectId);
    if (!select) return;
    var currentValues = getVisitLogFilterValues(select);
    var currentVal = select.value;
    select.innerHTML = '<option value="">' + placeholder + '</option>';
    var sorted = Array.from(itemsSet).sort();
    sorted.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item;
      opt.textContent = item;
      if (select.multiple) opt.selected = currentValues.indexOf(item) !== -1;
      select.appendChild(opt);
    });
    if (!select.multiple && itemsSet.has(currentVal)) {
      select.value = currentVal;
    }
    if (select._visitLogMultiSelect) select._visitLogMultiSelect.sync();
  }

  // Bakery Reports shares the Overview filter bar's checkbox/chip UI, while a
  // hidden native multiple select remains the single source of filter state.
  function createVisitLogMultiSelect(config) {
    var select = document.getElementById(config.selectId);
    var container = document.getElementById(config.containerId);
    var trigger = document.getElementById(config.triggerId);
    var label = document.getElementById(config.labelId);
    var dropdown = document.getElementById(config.dropdownId);
    var list = document.getElementById(config.listId);
    var search = config.searchId ? document.getElementById(config.searchId) : null;
    var clearBtn = document.getElementById(config.clearId);
    var selectedSection = document.getElementById(config.selectedSectionId);
    var selectedChips = document.getElementById(config.chipsId);
    var selectedCount = document.getElementById(config.countId);
    if (!select || !container || !trigger || !label || !dropdown || !list || !clearBtn ||
      !selectedSection || !selectedChips || !selectedCount || select._visitLogMultiSelect) return;

    var isOpen = false;

    function options() {
      return Array.prototype.filter.call(select.options, function (option) { return !!option.value; });
    }

    function values() {
      return getVisitLogFilterValues(select);
    }

    function updateLabel() {
      var selected = values();
      label.textContent = !selected.length
        ? config.allLabel
        : (selected.length === 1 ? selected[0] : selected.length + ' ' + config.pluralLabel);
      trigger.classList.toggle('bakery-ms__trigger--active', selected.length > 0);
      clearBtn.style.display = selected.length ? '' : 'none';
    }

    function renderSelected() {
      var selected = values().slice().sort();
      selectedSection.style.display = selected.length ? '' : 'none';
      selectedCount.textContent = selected.length;
      selectedChips.innerHTML = '';
      selected.forEach(function (name) {
        var chip = document.createElement('span');
        chip.className = 'bakery-ms__sel-chip';
        var chipLabel = document.createElement('span');
        chipLabel.textContent = name;
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'bakery-ms__sel-chip-remove';
        remove.setAttribute('aria-label', 'Remove ' + name);
        remove.innerHTML = '&#x2715;';
        remove.addEventListener('click', function (event) {
          event.stopPropagation();
          setVisitLogFilterValues(select, values().filter(function (value) { return value !== name; }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        chip.appendChild(chipLabel);
        chip.appendChild(remove);
        selectedChips.appendChild(chip);
      });
    }

    function renderList() {
      var selected = values();
      var query = search ? search.value.toLowerCase().trim() : '';
      var visible = options().filter(function (option) {
        return !query || option.textContent.toLowerCase().indexOf(query) !== -1;
      });
      list.innerHTML = '';
      if (!visible.length) {
        var empty = document.createElement('div');
        empty.className = 'filter-select__empty';
        empty.textContent = 'No matches found';
        list.appendChild(empty);
        return;
      }
      visible.forEach(function (option) {
        var checked = selected.indexOf(option.value) !== -1;
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'bakery-ms__option' + (checked ? ' is-checked' : '');
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', checked ? 'true' : 'false');
        var box = document.createElement('span');
        box.className = 'bakery-ms__checkbox';
        box.setAttribute('aria-hidden', 'true');
        var text = document.createElement('span');
        text.textContent = option.textContent;
        button.appendChild(box);
        button.appendChild(text);
        button.addEventListener('click', function () {
          var next = values();
          var index = next.indexOf(option.value);
          if (index === -1) next.push(option.value); else next.splice(index, 1);
          setVisitLogFilterValues(select, next);
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        list.appendChild(button);
      });
    }

    function sync() {
      updateLabel();
      renderSelected();
      if (isOpen) renderList();
    }

    function close() {
      isOpen = false;
      dropdown.style.display = 'none';
      trigger.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    function open() {
      ['visitLogRegion', 'visitLogOps', 'visitLogBakery'].forEach(function (id) {
        var other = document.getElementById(id);
        if (other && other !== select && other._visitLogMultiSelect) other._visitLogMultiSelect.close();
      });
      isOpen = true;
      dropdown.style.display = 'block';
      trigger.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      if (search) search.value = '';
      renderList();
      renderSelected();
      if (search) search.focus({ preventScroll: true });
    }

    trigger.addEventListener('click', function () { if (isOpen) close(); else open(); });
    if (search) search.addEventListener('input', renderList);
    clearBtn.addEventListener('click', function () {
      setVisitLogFilterValues(select, []);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    document.addEventListener('click', function (event) {
      // renderList()/renderSelected() replace the clicked option or chip before
      // this document listener runs. composedPath() preserves the original
      // path through the multiselect, so an in-menu selection remains open for
      // the next choice instead of looking like a click on a detached node.
      var path = event.composedPath ? event.composedPath() : [];
      var clickedInside = path.length
        ? path.some(function (element) { return element === container; })
        : container.contains(event.target);
      if (isOpen && !clickedInside) close();
    });
    document.addEventListener('keydown', function (event) {
      if (isOpen && event.key === 'Escape') {
        close();
        trigger.focus();
      }
    });

    select._visitLogMultiSelect = { sync: sync, close: close };
    sync();
  }

  function initVisitLogMultiSelects() {
    [
      { key: 'Region', allLabel: 'All Regions', pluralLabel: 'regions' },
      { key: 'Ops', allLabel: 'All Areas', pluralLabel: 'areas', searchable: true },
      { key: 'Bakery', allLabel: 'All Bakeries', pluralLabel: 'bakeries', searchable: true }
    ].forEach(function (item) {
      var prefix = 'visitLog' + item.key;
      createVisitLogMultiSelect({
        selectId: prefix,
        containerId: prefix + 'Multiselect',
        triggerId: prefix + 'MsTrigger',
        labelId: prefix + 'MsLabel',
        dropdownId: prefix + 'Dropdown',
        listId: prefix + 'MsList',
        searchId: item.searchable ? prefix + 'Search' : '',
        clearId: prefix + 'ClearBtn',
        selectedSectionId: prefix + 'MsSelectedSection',
        chipsId: prefix + 'MsChips',
        countId: prefix + 'MsCount',
        allLabel: item.allLabel,
        pluralLabel: item.pluralLabel
      });
    });
  }

  function getPeriodLabel(val) {
    var periodLabels = {
      '0': 'All Time',
      'currentMonth': 'This Month',
      'thisQuarter': 'This Quarter',
      '1': 'Last Month',
      'lastQuarter': 'Last Quarter',
      '2': 'Last 2 Months',
      '3': 'Last 3 Months',
      '6': 'Last 6 Months',
      '12': 'Last 12 Months',
      'thisYear': 'This Year',
      'lastYear': 'Last Year'
    };
    if (val === 'lastYear') {
      return 'Last Year (' + ((new Date()).getFullYear() - 1) + ')';
    }
    return periodLabels[val] || (val + ' Months');
  }

  function getVisitLogDefaultPeriod() {
    return '0';
  }

  function getVisitLogDefaultGroup() {
    return 'region';
  }

  // Matches the sub-nav entries in index.html. The short forms are for the
  // narrow banner, where the full names crowd out the chips beside them.
  var VISIT_LOG_VIEW_LABELS = {
    bakeries: { full: 'Bakery Directory', short: 'Directory' },
    followups: { full: 'Follow-up Tasks', short: 'Follow-ups' },
    unvisited: { full: 'Unvisited Sites', short: 'Unvisited' },
    history: { full: 'Visit History', short: 'History' }
  };

  function visitLogViewTitle(view) {
    var label = VISIT_LOG_VIEW_LABELS[view] || VISIT_LOG_VIEW_LABELS.history;
    return (window.innerWidth <= 980) ? label.short : label.full;
  }

  var pill = function (kind, key, text, clearable) {
    if (window.GAILS.headerPill) return window.GAILS.headerPill(kind, key, text, clearable);
    return '<span class="' + kind + '">' + escapeHtml(text) + '</span>';
  };

  function headerFilterButton() {
    return window.GAILS.HEADER_FILTER_BTN || '';
  }

  window.GAILS.getVisitLogHeaderSummary = function () {
    var searchEl = document.getElementById('visitLogSearch');
    var regionEl = document.getElementById('visitLogRegion');
    var opsEl = document.getElementById('visitLogOps');
    var bakeryEl = document.getElementById('visitLogBakery');
    var typeEl = document.getElementById('visitLogType');
    var ratingEl = document.getElementById('visitLogRating');
    var groupEl = document.getElementById('visitLogGroup');
    var sortEl = document.getElementById('visitLogSort');
    var periodEl = document.getElementById('visitLogPeriod');
    var followUpAssigneeEl = document.getElementById('followUpAssignee');
    var followUpGroupEl = document.getElementById('followUpGroup');
    var followUpSortEl = document.getElementById('followUpSort');

    var searchVal = searchEl ? searchEl.value.trim() : '';
    var regionVals = getVisitLogFilterValues(regionEl);
    var opsVals = getVisitLogFilterValues(opsEl);
    var bakeryVals = getVisitLogFilterValues(bakeryEl);
    var typeVal = typeEl ? typeEl.value : '';
    var ratingVal = ratingEl ? ratingEl.value : '';
    var groupVal = groupEl ? groupEl.value : getVisitLogDefaultGroup();
    var sortVal = sortEl ? sortEl.value : 'date';
    var view = window.GAILS._activeVisitLogView || 'bakeries';
    var periodVal = periodEl ? periodEl.value : getVisitLogDefaultPeriod(view);

    var pills = [];

    if (view === 'bakeries') {
      // The directory's own list controls, not the reporting views'. It has no
      // Period, and its Sort By / Group By are a separate pair of dropdowns
      // (visitLogDirectorySort / visitLogDirectoryGroup) from the ones the
      // history views read.
      var directoryGroupEl = document.getElementById('visitLogDirectoryGroup');
      pills.push(pill('header-pill-core', 'directorySort',
        'Sorted by ' + exportFilterLabel('visitLogDirectorySort', 'Bakery Name (A-Z)'), false));
      pills.push(pill('header-pill-core', 'directoryGroup',
        (directoryGroupEl && directoryGroupEl.value !== 'none'
          ? 'Grouped by ' + exportFilterLabel('visitLogDirectoryGroup', 'None')
          : 'Ungrouped'), false));
      if (searchVal) pills.push(pill('header-pill-filter', 'search', 'Search: "' + searchVal + '"', true));
      if (regionVals.length) pills.push(pill('header-pill-filter', 'region', exportFilterLabel('visitLogRegion', 'All regions'), true));
      if (opsVals.length) pills.push(pill('header-pill-filter', 'ops', exportFilterLabel('visitLogOps', 'All ops areas'), true));
      if (bakeryVals.length) pills.push(pill('header-pill-filter', 'bakery', exportFilterLabel('visitLogBakery', 'All bakeries'), true));
      var directoryTitle = visitLogViewTitle('bakeries');
      return directoryTitle + '<span class="header-sub-pillwrap">' + pills.join('') + headerFilterButton() + '</span>';
    }

    if (view === 'followups') {
      var statusLabels = FOLLOW_UP_STATUS_LABELS;
      var followStatus = window.GAILS._followUpStatusFilter || 'open';
      pills.push(pill('header-pill-core', 'followStatus', statusLabels[followStatus] || 'Open', false));
      if (searchVal) pills.push(pill('header-pill-filter', 'search', 'Search: "' + searchVal + '"', true));
      if (regionVals.length) pills.push(pill('header-pill-filter', 'region', exportFilterLabel('visitLogRegion', 'All regions'), true));
      if (opsVals.length) pills.push(pill('header-pill-filter', 'ops', exportFilterLabel('visitLogOps', 'All ops areas'), true));
      if (followUpAssigneeEl && followUpAssigneeEl.value) {
        pills.push(pill('header-pill-filter', 'followUpAssignee',
          'Assigned to ' + exportFilterLabel('followUpAssignee', 'All'), true));
      }
      if (followUpGroupEl && followUpGroupEl.value !== 'bakery') {
        pills.push(pill('header-pill-filter', 'followUpGroup', exportFilterLabel('followUpGroup', 'Bakery'), true));
      }
      if (followUpSortEl && followUpSortEl.value !== 'dueAsc') {
        pills.push(pill('header-pill-filter', 'followUpSort', exportFilterLabel('followUpSort', 'Due Date (Soonest)'), true));
      }
      var fuTitle = visitLogViewTitle('followups');
      return fuTitle + '<span class="header-sub-pillwrap">' + pills.join('') + headerFilterButton() + '</span>';
    }

    if (view === 'unvisited') {
      var periodText = getPeriodLabel(periodVal);
      var unvisitedGroupLabels = {
        'ops': 'Grouped by Ops Area',
        'region': 'Grouped by Region',
        'none': 'Ungrouped'
      };
      pills.push(pill('header-pill-core', 'period', periodText, false));
      pills.push(pill('header-pill-core', 'group', unvisitedGroupLabels[groupVal] || 'Grouped by Region', false));

      if (searchVal) pills.push(pill('header-pill-filter', 'search', 'Search: "' + searchVal + '"', true));
      if (regionVals.length) pills.push(pill('header-pill-filter', 'region', exportFilterLabel('visitLogRegion', 'All regions'), true));
      if (opsVals.length) pills.push(pill('header-pill-filter', 'ops', exportFilterLabel('visitLogOps', 'All ops areas'), true));

      var title = visitLogViewTitle('unvisited');
      return title +
        '<span class="header-sub-pillwrap">' +
        pills.join('') +
        headerFilterButton() +
        '</span>';
    }

    var periodText = getPeriodLabel(periodVal);
    var groupLabels = {
      'ops': 'Grouped by Ops Area',
      'region': 'Grouped by Region',
      'type': 'Grouped by Type',
      'none': 'Ungrouped'
    };
    var sortLabels = {
      'date': 'Sorted by Date',
      'nameAsc': 'Sorted A-Z',
      'nameDesc': 'Sorted Z-A',
      'type': 'Sorted by Type'
    };

    // One bubble per setting, at every width. The combined "Period · Grouped
    // by · Sorted by" capsule read as a single sentence, so you had to parse
    // the whole of it to find the one value you were checking; separate
    // bubbles also wrap individually beside the title instead of dropping the
    // whole run below it.
    pills.push(pill('header-pill-core', 'period', periodText, false));
    pills.push(pill('header-pill-core', 'group', groupLabels[groupVal] || 'Grouped', false));
    pills.push(pill('header-pill-core', 'sort', sortLabels[sortVal] || 'Sorted', false));

    if (searchVal) {
      pills.push(pill('header-pill-filter', 'search', 'Search: "' + searchVal + '"', true));
    }
    if (regionVals.length) {
      pills.push(pill('header-pill-filter', 'region', exportFilterLabel('visitLogRegion', 'All regions'), true));
    }
    if (opsVals.length) {
      pills.push(pill('header-pill-filter', 'ops', exportFilterLabel('visitLogOps', 'All ops areas'), true));
    }
    if (typeVal) {
      var typeLabels = {
        'routine': 'Routine Coffee Visit',
        'siteVisit': 'Check-in',
        'nboOpening': 'NBO: Opening',
        'nboVisit1': 'NBO: Coffee Visit 1',
        'nboVisit2': 'NBO: Coffee Visit 2',
        'cqv': 'CQV',
        'cqvFollowUp': 'CQV Follow-Up'
      };
      var tLabel = typeLabels[typeVal] || typeVal;
      if (ratingVal && (typeVal === 'cqv' || typeVal === 'cqvFollowUp')) {
        tLabel += ' (' + ratingVal + ')';
      }
      pills.push(pill('header-pill-filter', 'type', tLabel, true));
    }

    var title = visitLogViewTitle('history');
    return title +
      '<span class="header-sub-pillwrap">' +
      pills.join('') +
      headerFilterButton() +
      '</span>';
  };

  // Regions come straight from BAKERY_META (North Region / South Region /
  // London Region) rather than being inferred from whatever visits happen
  // to be loaded, so the list is always complete and correct.
  function getVisitLogRegions() {
    var G = window.GAILS;
    var meta = (G && G.BAKERY_META) || {};
    return [...new Set(Object.values(meta).map(function (v) { return v.r; }))].filter(function (r) { return r && r !== 'Other'; }).sort();
  }

  // Scoped to the selected regions so the Ops Area dropdown only lists areas
  // that actually operate in at least one of them.
  function getVisitLogOps(regionValues) {
    var G = window.GAILS;
    var meta = (G && G.BAKERY_META) || {};
    var regions = normalizeVisitLogFilterValues(regionValues);
    return [...new Set(Object.values(meta)
      .filter(function (v) { return visitLogFilterMatches(regions, v.r); })
      .map(function (v) { return v.o; })
    )].filter(Boolean).sort();
  }

  function getDirectoryBakeryLabel(name) {
    var G = window.GAILS;
    var label = (G.getBakeryMapLabel ? G.getBakeryMapLabel(name) : name) || name;
    return String(label).replace(/^GAIL['\u2018\u2019]s(?:\s+|$)/i, '').trim();
  }

  function getDirectoryBakeryNames(regionValues, opsValues) {
    var G = window.GAILS;
    var meta = (G && G.BAKERY_META) || {};
    var regions = normalizeVisitLogFilterValues(regionValues);
    var opsAreas = normalizeVisitLogFilterValues(opsValues);
    return Object.keys(meta).filter(reportBakeryAllowed).filter(function (name) {
      if (G.getBakeryRegion && !visitLogFilterMatches(regions, G.getBakeryRegion(name))) return false;
      if (G.getBakeryOps && !visitLogFilterMatches(opsAreas, G.getBakeryOps(name))) return false;
      return true;
    }).map(function (name) {
      return getDirectoryBakeryLabel(name);
    }).sort();
  }

  function populateDirectoryBakeryOptions() {
    var regionEl = document.getElementById('visitLogRegion');
    var opsEl = document.getElementById('visitLogOps');
    populateDropdown(
      'visitLogBakery',
      new Set(getDirectoryBakeryNames(getVisitLogFilterValues(regionEl), getVisitLogFilterValues(opsEl))),
      'All Bakeries'
    );
  }

  function populateVisitLogFilterOptions() {
    var regionEl = document.getElementById('visitLogRegion');
    populateDropdown('visitLogRegion', new Set(getVisitLogRegions()), 'All Regions');
    populateDropdown('visitLogOps', new Set(getVisitLogOps(getVisitLogFilterValues(regionEl))), 'All Areas');
    populateDirectoryBakeryOptions();
    populateFollowUpAssigneeOptions();
    applyReportScopeToFilters();
  }

  // A scoped ops manager only has one ops area, so the Region and Ops Area
  // filters can only narrow their already-scoped list to nothing — hide them
  // and clear any stale values. Restores them when scoping is off.
  function applyReportScopeToFilters() {
    var scoped = reportScopeActive();
    ['visitLogRegion', 'visitLogOps'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var control = el.closest ? el.closest('.visit-log-filter-control') : null;
      if (scoped && getVisitLogFilterValues(el).length) setVisitLogFilterValues(el, []);
      if (control) control.style.display = scoped ? 'none' : '';
    });
  }

  function getVisitLogActiveFilterCount() {
    var regionEl = document.getElementById('visitLogRegion');
    var opsEl = document.getElementById('visitLogOps');
    var bakeryEl = document.getElementById('visitLogBakery');
    var typeEl = document.getElementById('visitLogType');
    var ratingEl = document.getElementById('visitLogRating');
    var groupEl = document.getElementById('visitLogGroup');
    var sortEl = document.getElementById('visitLogSort');
    var periodEl = document.getElementById('visitLogPeriod');
    var directorySortEl = document.getElementById('visitLogDirectorySort');
    var directoryGroupEl = document.getElementById('visitLogDirectoryGroup');
    var followUpAssigneeEl = document.getElementById('followUpAssignee');
    var followUpGroupEl = document.getElementById('followUpGroup');
    var followUpSortEl = document.getElementById('followUpSort');
    var activeView = window.GAILS._activeVisitLogView || 'bakeries';
    var isHistoryView = activeView === 'history';
    var isFollowUps = activeView === 'followups';
    var isBakeryList = activeView === 'bakeries';
    var supportsGrouping = activeView !== 'bakeries' && activeView !== 'followups';
    var supportsPeriod = activeView !== 'bakeries' && activeView !== 'followups';
    var defaultPeriod = getVisitLogDefaultPeriod();
    var count = 0;

    if (getVisitLogFilterValues(regionEl).length) count++;
    if (getVisitLogFilterValues(opsEl).length) count++;
    if (isBakeryList && getVisitLogFilterValues(bakeryEl).length) count++;
    if (isBakeryList && directorySortEl && directorySortEl.value !== 'nameAsc') count++;
    if (isBakeryList && directoryGroupEl && directoryGroupEl.value !== 'none') count++;
    if (isFollowUps && followUpAssigneeEl && followUpAssigneeEl.value) count++;
    if (isFollowUps && followUpGroupEl && followUpGroupEl.value !== 'bakery') count++;
    if (isFollowUps && followUpSortEl && followUpSortEl.value !== 'dueAsc') count++;
    if (isHistoryView && typeEl && typeEl.value) count++;
    if (isHistoryView && ratingEl && ratingEl.value && typeEl && (typeEl.value === 'cqv' || typeEl.value === 'cqvFollowUp')) count++;
    if (supportsGrouping && groupEl && groupEl.value && groupEl.value !== getVisitLogDefaultGroup()) count++;
    if (isHistoryView && sortEl && sortEl.value && sortEl.value !== 'date') count++;
    if (supportsPeriod && periodEl && periodEl.value && periodEl.value !== defaultPeriod) count++;
    return count;
  }

  function syncVisitLogMobileFilterButton() {
    var btn = document.getElementById('visitLogMobileFilterBtn');
    var badge = document.getElementById('visitLogFilterBadge');
    var count = getVisitLogActiveFilterCount();

    // Desktop reset icon: plain funnel at rest, funnel-with-X once a
    // filter is active (search counts too, unlike the mobile badge, since
    // Reset clears it as well).
    var resetBtn = document.getElementById('visitLogResetBtn');
    if (resetBtn) {
      var searchEl = document.getElementById('visitLogSearch');
      var hasSearch = !!(searchEl && searchEl.value.trim());
      var anyActive = hasSearch || count > 0;
      resetBtn.classList.toggle('has-active-filters', anyActive);
      // Text button in the drawer header now, so it greys out with nothing
      // to clear instead of relying on the icon swap it used to do.
      resetBtn.disabled = !anyActive;
    }

    if (!btn || !badge) return;
    btn.classList.toggle('has-active-filters', count > 0);
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = count;
    } else {
      badge.hidden = true;
      badge.textContent = '';
    }
  }

  function setVisitLogFiltersOpen(open) {
    var btn = document.getElementById('visitLogMobileFilterBtn');
    var panel = document.getElementById('visitLogFilterPanel');
    var backdrop = document.getElementById('visitLogFilterBackdrop');
    if (!panel || !backdrop) return;

    panel.classList.remove('is-dragging');
    panel.style.transform = '';

    if (open) {
      panel.classList.add('is-open');
      backdrop.classList.add('is-open');
      backdrop.hidden = false;
      backdrop.removeAttribute('aria-hidden');
      if (btn) {
        btn.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
      // The mobile sheet covers the page, so it locks scrolling. The
      // desktop drawer sits beside the content and must leave it alone.
      if (window.matchMedia('(max-width: 720px)').matches) {
        document.body.style.overflow = 'hidden';
      }
      document.body.classList.add('visit-log-filter-open');
      return;
    }

    panel.querySelectorAll('.filter-select.is-open').forEach(function (wrapper) {
      wrapper.classList.remove('is-open');
      var trigger = wrapper.querySelector('.filter-select__trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
    ['visitLogRegion', 'visitLogOps', 'visitLogBakery'].forEach(function (id) {
      var multi = document.getElementById(id);
      if (multi && multi._visitLogMultiSelect) multi._visitLogMultiSelect.close();
    });
    panel.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
    if (btn) {
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    }
    document.body.style.overflow = '';
    document.body.classList.remove('visit-log-filter-open');
    setTimeout(function () {
      if (!backdrop.classList.contains('is-open')) backdrop.hidden = true;
    }, 180);
  }

  window.GAILS.setVisitLogFiltersOpen = setVisitLogFiltersOpen;

  window.GAILS.isVisitLogFiltersOpen = function () {
    var panel = document.getElementById('visitLogFilterPanel');
    return !!panel && panel.classList.contains('is-open');
  };

  // Clearing one chip from the banner, keyed the same way the chip was
  // built. Each branch resets its control to the value getVisitLogActive-
  // FilterCount treats as unset, so the chip and the badge stay in step.
  window.GAILS.clearVisitLogHeaderFilter = function (key) {
    var byId = function (id) { return document.getElementById(id); };
    var resync = [];

    if (key === 'search') {
      var searchEl = byId('visitLogSearch');
      if (searchEl) searchEl.value = '';
    } else if (key === 'region') {
      setVisitLogFilterValues(byId('visitLogRegion'), []);
      // Ops areas and bakeries are scoped by region, so both lists widen.
      populateDropdown('visitLogOps', new Set(getVisitLogOps('')), 'All Areas');
      populateDirectoryBakeryOptions();
    } else if (key === 'ops') {
      setVisitLogFilterValues(byId('visitLogOps'), []);
      populateDirectoryBakeryOptions();
    } else if (key === 'bakery') {
      setVisitLogFilterValues(byId('visitLogBakery'), []);
    } else if (key === 'type') {
      var typeEl = byId('visitLogType');
      var ratingEl = byId('visitLogRating');
      if (typeEl) typeEl.value = '';
      if (ratingEl) ratingEl.value = '';
      syncCqvRatingVisibility();
      resync = ['visitLogType', 'visitLogRating'];
    } else if (key === 'followUpAssignee') {
      var assigneeEl = byId('followUpAssignee');
      if (assigneeEl) assigneeEl.value = '';
      window.GAILS._pendingFollowUpAssigneeFilter = '';
      resync = ['followUpAssignee'];
    } else if (key === 'followUpGroup') {
      var fuGroupEl = byId('followUpGroup');
      if (fuGroupEl) fuGroupEl.value = 'bakery';
      resync = ['followUpGroup'];
    } else if (key === 'followUpSort') {
      var fuSortEl = byId('followUpSort');
      if (fuSortEl) fuSortEl.value = 'dueAsc';
      resync = ['followUpSort'];
    } else {
      return;
    }

    if (window.GAILS.syncCustomSelect) {
      resync.forEach(function (id) { window.GAILS.syncCustomSelect(id); });
    }
    syncVisitLogMobileFilterButton();
    window.GAILS.renderVisitLog();
  };

  // Same fixed-menu behaviour the dashboard drawer gets. Only index.html
  // has this panel, and only it loads utils.js alongside — hence both
  // guards rather than a bare call.
  function mountVisitLogDrawerMenus() {
    if (!window.GAILS.mountDrawerMenus) return;
    var panel = document.getElementById('visitLogFilterPanel');
    window.GAILS.mountDrawerMenus(panel);
    window.GAILS.anchorDrawerToBanner(panel);
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mountVisitLogDrawerMenus);
    } else {
      mountVisitLogDrawerMenus();
    }
  }

  var VISIT_LOG_FILTER_STORAGE_KEY = 'gails.visitLogFilters';

  // Rows rendered per page of the history list; "Show more" adds another
  // chunk. Keeps the innerHTML rebuild cheap when "All Time" is selected.
  var VISIT_LOG_RENDER_CHUNK = 150;

  function saveVisitLogFilters(state) {
    try { localStorage.setItem(VISIT_LOG_FILTER_STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  function setSelectValueIfPresent(el, val) {
    if (!el || typeof val !== 'string' || !val) return;
    var has = Array.prototype.some.call(el.options, function (o) { return o.value === val; });
    if (has) el.value = val;
  }

  // Restores the last-used filters (saved on every render) so the page opens
  // in the state the user last worked in. Visit type is deliberately not
  // restored, so a new page session always starts with the complete visit
  // list. Rating depends on visit type, so it also starts clear. Period is
  // also excluded so every new session starts at All Time rather than
  // whatever range was last narrowed to. Search text is excluded too — every
  // new session (and every tab switch, via resetVisitLogView) starts with an
  // empty search box rather than silently re-filtering on a stale term. Runs
  // once, right after the filter dropdowns are populated and before the
  // first filtered render reads them.
  function restoreVisitLogFilters() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(VISIT_LOG_FILTER_STORAGE_KEY) || 'null'); } catch (e) { /* corrupt/unavailable */ }
    if (!saved || typeof saved !== 'object') return;

    var regionEl = document.getElementById('visitLogRegion');

    setVisitLogFilterValues(regionEl, saved.region);
    // Ops options depend on every selected region, so rebuild them first.
    populateDropdown('visitLogOps', new Set(getVisitLogOps(getVisitLogFilterValues(regionEl))), 'All Areas');
    setVisitLogFilterValues(document.getElementById('visitLogOps'), saved.ops);
    populateDirectoryBakeryOptions();
    setVisitLogFilterValues(document.getElementById('visitLogBakery'), saved.bakery);
    setSelectValueIfPresent(document.getElementById('visitLogDirectorySort'), saved.directorySort);
    setSelectValueIfPresent(document.getElementById('visitLogDirectoryGroup'), saved.directoryGroup);
    setSelectValueIfPresent(document.getElementById('visitLogGroup'), saved.group);
    setSelectValueIfPresent(document.getElementById('visitLogSort'), saved.sort);
    window.GAILS._pendingFollowUpAssigneeFilter =
      typeof saved.followUpAssignee === 'string' ? saved.followUpAssignee : '';
    setSelectValueIfPresent(document.getElementById('followUpAssignee'), saved.followUpAssignee);
    setSelectValueIfPresent(document.getElementById('followUpGroup'), saved.followUpGroup);
    setSelectValueIfPresent(document.getElementById('followUpSort'), saved.followUpSort);
    syncCqvRatingVisibility();

    if (saved.view === 'bakeries' || saved.view === 'unvisited' || saved.view === 'history' || saved.view === 'followups') {
      window.GAILS._activeVisitLogView = saved.view;
      // This can run before the tab is ever opened — Bakery Reports is warmed
      // in the background so switching to it is instant. Only paint the
      // sidebar highlight when Bakery Reports is actually the active tab;
      // otherwise a background warm-render leaves last session's view lit up
      // in the sidebar while some other tab (e.g. Overview) is on screen.
      var visitLogTabEl = document.getElementById('tab-visit-log');
      var visitLogTabActive = !!(visitLogTabEl && visitLogTabEl.classList.contains('active'));
      document.querySelectorAll('#visitLogViewToggle .target-subtab').forEach(function (b) {
        b.classList.toggle('active', visitLogTabActive && b.dataset.view === saved.view);
      });
    }

    if (typeof saved.followUpStatus === 'string' && saved.followUpStatus) {
      window.GAILS._followUpStatusFilter = saved.followUpStatus;
      document.querySelectorAll('#followUpStatusToggle .visit-log-toggle-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.status === saved.followUpStatus);
      });
    }
  }

  // At-a-glance bar utilities shared by the report list summaries.
  function visitLogGroupToggleHtml(showGroupToggle) {
    if (!showGroupToggle) return '';
    return '<button type="button" class="visit-log-summary__expand-all" title="Collapse every group">Collapse all</button>';
  }

  function buildBakeryDirectoryRows(filters) {
    var G = window.GAILS;
    var meta = (G && G.BAKERY_META) || {};
    var values = filters || {};
    var search = String(values.search || '').trim().toLowerCase();
    var regionFilters = normalizeVisitLogFilterValues(values.region);
    var opsFilters = normalizeVisitLogFilterValues(values.ops);
    var bakeryFilters = normalizeVisitLogFilterValues(values.bakery);
    var sortBy = String(values.sort || 'nameAsc');

    return Object.keys(meta).filter(reportBakeryAllowed).map(function (name) {
      var entry = meta[name] || {};
      var region = (G.getBakeryRegion ? G.getBakeryRegion(name) : entry.r) || 'Unknown';
      var ops = (G.getBakeryOps ? G.getBakeryOps(name) : entry.o) || 'Unknown';
      // A region on cover names its Coffee Partner or Coffee Trainer per ops
      // area, so the directory lists who each bakery actually has.
      var assignment = G.getRegionAssignment ? G.getRegionAssignment(region, ops) : null;
      var opsAssignment = G.getOpsAreaAssignment ? G.getOpsAreaAssignment(ops, region) : null;
      return {
        bakery: getDirectoryBakeryLabel(name),
        ops: ops,
        region: region,
        coffeePartner: assignment && assignment.coffeePartner || '',
        coffeeTrainer: assignment && assignment.coffeeTrainer || '',
        areaHeadBarista: opsAssignment && opsAssignment.areaHeadBarista || ''
      };
    }).filter(function (row) {
      if (!visitLogFilterMatches(regionFilters, row.region)) return false;
      if (!visitLogFilterMatches(opsFilters, row.ops)) return false;
      if (!visitLogFilterMatches(bakeryFilters, row.bakery)) return false;
      if (!search) return true;
      return [
        row.bakery,
        row.ops,
        row.region,
        row.coffeePartner,
        row.coffeeTrainer,
        row.areaHeadBarista
      ].join(' ').toLowerCase().indexOf(search) !== -1;
    }).sort(function (a, b) {
      var sortFields = {
        region: 'region',
        ops: 'ops',
        partner: 'coffeePartner',
        trainer: 'coffeeTrainer',
        barista: 'areaHeadBarista'
      };
      var field = sortFields[sortBy] || 'bakery';
      var aVal = a[field] || '￿';
      var bVal = b[field] || '￿';
      var compared = aVal.localeCompare(bVal);
      if (sortBy === 'nameDesc') compared *= -1;
      return compared || a.bakery.localeCompare(b.bakery);
    });
  }

  window.GAILS.buildBakeryDirectoryRows = buildBakeryDirectoryRows;

  function renderBakeryDirectorySummary(count, showGroupToggle) {
    var summaryEl = document.getElementById('visitLogSummary');
    if (!summaryEl) return;
    summaryEl.innerHTML =
      '<span class="visit-log-summary__total"><strong>' + count + '</strong> baker' + (count === 1 ? 'y' : 'ies') + '</span>' +
      '<span class="visit-log-summary__actions">' +
      visitLogGroupToggleHtml(showGroupToggle) +
      '<button type="button" class="visit-log-summary__export"' + (count ? '' : ' disabled') +
      ' title="Download the filtered bakery directory as a formatted Excel workbook">Export Excel</button>' +
      '</span>';
    summaryEl.hidden = false;
  }

  function renderBakeryDirectory(filters) {
    var container = document.getElementById('visitLogList');
    if (!container) return;
    var statusEl = document.getElementById('visitLogStatus');
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.style.display = 'none';
    }

    var rows = buildBakeryDirectoryRows(filters);
    if (!rows.length) {
      window.GAILS._visitLogExport = null;
      window.GAILS._visitLogCurrentGroupNames = [];
      renderBakeryDirectorySummary(0, false);
      var hasDirectory = buildBakeryDirectoryRows({}).length > 0;
      container.innerHTML = '<div class="visit-log-empty">' +
        '<div class="visit-log-empty__icon" aria-hidden="true">' + (hasDirectory ? '&#128269;' : '&#127838;') + '</div>' +
        '<p><strong>' + (hasDirectory ? 'No bakeries match these filters.' : 'No bakeries are available yet.') + '</strong></p>' +
        (hasDirectory ? '<p>Try a different search, region, ops area, or bakery.</p>' : '') +
        '</div>';
      return;
    }

    // groupName + hidden are only set for the grouped path, so a row carries
    // the attribute the collapse toggle looks for and starts in the right
    // state on first render (no flash of visible rows under a collapsed group).
    function directoryRowHtml(row, groupName, hidden) {
      return '<tr' + (groupName ? ' data-group="' + escapeHtml(groupName) + '"' : '') + (hidden ? ' hidden' : '') + '>' +
        '<th scope="row" data-label="Bakery Name">' + GAILS.bakeryProfileLink(row.bakery, {
          className: 'bakery-directory__profile-link',
          returnUrl: 'index.html#visit-log',
          returnLabel: 'Bakery Directory'
        }) + '</th>' +
        '<td data-label="Ops Area">' + escapeHtml(row.ops) + '</td>' +
        '<td data-label="Region">' + escapeHtml(row.region) + '</td>' +
        '<td data-label="Coffee Partner">' + escapeHtml(row.coffeePartner || '—') + '</td>' +
        '<td data-label="Coffee Trainer">' + escapeHtml(row.coffeeTrainer || '—') + '</td>' +
        '<td data-label="Area Head Barista">' + escapeHtml(row.areaHeadBarista || '-') + '</td>' +
        '</tr>';
    }

    var groupBy = filters && filters.group || 'none';
    var groupFields = {
      region: 'region',
      ops: 'ops',
      partner: 'coffeePartner',
      trainer: 'coffeeTrainer',
      barista: 'areaHeadBarista'
    };
    var groupField = groupFields[groupBy];
    var bodyHtml = '';
    var orderedRows = [];
    var collapsedGroups = window.GAILS._visitLogCollapsedGroups = window.GAILS._visitLogCollapsedGroups || {};

    if (!groupField) {
      window.GAILS._visitLogCurrentGroupNames = [];
      bodyHtml = rows.map(function (row) { return directoryRowHtml(row); }).join('');
      orderedRows = rows.slice();
    } else {
      var groupedRows = {};
      rows.forEach(function (row) {
        var groupName = row[groupField] || 'Unassigned';
        if (!groupedRows[groupName]) groupedRows[groupName] = [];
        groupedRows[groupName].push(row);
      });
      var groupNamesSorted = Object.keys(groupedRows).sort(function (a, b) {
        if (a === 'Unassigned') return 1;
        if (b === 'Unassigned') return -1;
        return a.localeCompare(b);
      });
      window.GAILS._visitLogCurrentGroupNames = groupNamesSorted.slice();
      bodyHtml = groupNamesSorted.map(function (groupName) {
        orderedRows = orderedRows.concat(groupedRows[groupName]);
        var isCollapsed = !!collapsedGroups[groupName];
        var groupCount = groupedRows[groupName].length;
        return '<tr class="bakery-directory__group-row' + (isCollapsed ? ' collapsed' : '') + '" data-group-name="' + escapeHtml(groupName) + '">' +
          '<th scope="rowgroup" colspan="6">' +
          '<button type="button" class="bakery-directory__group-toggle" aria-expanded="' + (isCollapsed ? 'false' : 'true') + '">' +
          '<svg class="bakery-directory__group-chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3 3-3"/></svg>' +
          '<span>' + escapeHtml(groupName) + '</span>' +
          '<em>' + groupCount + ' baker' + (groupCount === 1 ? 'y' : 'ies') + '</em>' +
          '</button>' +
          '</th>' +
          '</tr>' +
          groupedRows[groupName].map(function (row) { return directoryRowHtml(row, groupName, isCollapsed); }).join('');
      }).join('');
    }

    var directoryMeta = baseExportMeta().filter(function (item) { return item[0] !== 'Period'; }).concat([
      ['Bakery', exportFilterLabel('visitLogBakery', 'All bakeries')],
      ['Sorted by', exportFilterLabel('visitLogDirectorySort', 'Bakery Name (A-Z)')],
      ['Grouped by', exportFilterLabel('visitLogDirectoryGroup', 'None')],
      ['Bakeries exported', orderedRows.length]
    ]);
    window.GAILS._visitLogExport = withLazyRows({
      title: 'GAIL’s — Bakery Directory',
      sheetName: 'Bakery Directory',
      filename: buildExportFilename('Bakery Directory'),
      meta: directoryMeta,
      columns: [
        { label: 'Bakery Name', type: 'text', width: 28 },
        { label: 'Ops Area', type: 'text', width: 22 },
        { label: 'Region', type: 'text', width: 17 },
        { label: 'Coffee Partner', type: 'text', width: 22 },
        { label: 'Coffee Trainer', type: 'text', width: 22 },
        { label: 'Area Head Barista', type: 'text', width: 22 }
      ],
      rowCount: orderedRows.length
    }, function () {
      return orderedRows.map(function (row) {
        return [
          row.bakery,
          row.ops,
          row.region,
          row.coffeePartner,
          row.coffeeTrainer,
          row.areaHeadBarista || '-'
        ];
      });
    });
    renderBakeryDirectorySummary(orderedRows.length, !!groupField);

    container.innerHTML =
      '<div class="table-wrap table-wrap--league table-wrap--floating table-wrap--directory">' +
      '<table class="bakery-directory" data-table-fullscreen="off">' +
      '<caption>Bakery directory</caption>' +
      '<thead><tr>' +
      '<th scope="col">Bakery Name</th>' +
      '<th scope="col">Ops Area</th>' +
      '<th scope="col">Region</th>' +
      '<th scope="col">Coffee Partner</th>' +
      '<th scope="col">Coffee Trainer</th>' +
      '<th scope="col">Area Head Barista</th>' +
      '</tr></thead>' +
      '<tbody>' + bodyHtml + '</tbody></table></div>';
  }

  function syncVisitLogGroupToggle() {
    var button = document.querySelector('#visitLogSummary .visit-log-summary__expand-all');
    if (!button) return;

    var groupNames = window.GAILS._visitLogCurrentGroupNames || [];
    var collapsedGroups = window.GAILS._visitLogCollapsedGroups || {};
    var allCollapsed = groupNames.length > 0 && groupNames.every(function (name) {
      return !!collapsedGroups[name];
    });

    button.textContent = allCollapsed ? 'Expand all' : 'Collapse all';
    button.title = allCollapsed ? 'Expand every group' : 'Collapse every group';
  }

  function setVisitLogGroupedRowHidden(row, groupCollapsed) {
    if (row.classList && row.classList.contains('visit-history-table__details-row')) {
      var summaryRow = row.previousElementSibling;
      row.hidden = groupCollapsed || !(summaryRow && summaryRow.classList.contains('expanded'));
      return;
    }
    row.hidden = groupCollapsed;
  }

  function toggleAllVisitLogGroups() {
    var groupNames = window.GAILS._visitLogCurrentGroupNames || [];
    if (!groupNames.length) return;

    var collapsedGroups = window.GAILS._visitLogCollapsedGroups = window.GAILS._visitLogCollapsedGroups || {};
    var allCollapsed = groupNames.every(function (name) { return !!collapsedGroups[name]; });
    var shouldCollapse = !allCollapsed;

    groupNames.forEach(function (name) {
      if (shouldCollapse) collapsedGroups[name] = true;
      else delete collapsedGroups[name];
    });

    // Bakery Directory groups are table rows, not a section div, so the
    // rows themselves need hiding rather than a collapsible container.
    document.querySelectorAll('#visitLogList .bakery-directory__group-row').forEach(function (groupRow) {
      var name = groupRow.getAttribute('data-group-name') || '';
      if (groupNames.indexOf(name) === -1) return;
      groupRow.classList.toggle('collapsed', shouldCollapse);
      var toggleBtn = groupRow.querySelector('.bakery-directory__group-toggle');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');
    });
    document.querySelectorAll('#visitLogList tr[data-group]').forEach(function (row) {
      var name = row.getAttribute('data-group') || '';
      if (groupNames.indexOf(name) === -1) return;
      setVisitLogGroupedRowHidden(row, shouldCollapse);
    });

    syncVisitLogGroupToggle();
  }

  window.GAILS.resetVisitLogCollapsedGroups = function () {
    window.GAILS._visitLogCollapsedGroups = {};

    document.querySelectorAll('#visitLogList .bakery-directory__group-row').forEach(function (groupRow) {
      groupRow.classList.remove('collapsed');
      var toggleBtn = groupRow.querySelector('.bakery-directory__group-toggle');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    });
    document.querySelectorAll('#visitLogList tr[data-group]').forEach(function (row) {
      setVisitLogGroupedRowHidden(row, false);
    });

    syncVisitLogGroupToggle();
  };

  // Leaving the reports tab ends the "session" for the view toggle: coming
  // back always lands on Bakery Directory rather than resuming Visit History,
  // Unvisited Sites, or Follow-ups. Only flips the in-memory view + button
  // state; the caller re-renders, which writes the reset view back to the
  // saved filters.
  window.GAILS.resetVisitLogView = function () {
    window.GAILS._activeVisitLogView = 'bakeries';

    document.querySelectorAll('#visitLogViewToggle .target-subtab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === 'bakeries');
    });

    var searchEl = document.getElementById('visitLogSearch');
    if (searchEl && searchEl.value) {
      searchEl.value = '';
      if (window.GAILS._visitLogFiltersInited) window.GAILS.renderVisitLog();
    }
  };

  function renderVisitLogSummary(shownCount, showGroupToggle) {
    var summaryEl = document.getElementById('visitLogSummary');
    if (!summaryEl) return;

    var actionsHtml = '<span class="visit-log-summary__actions">' +
      visitLogGroupToggleHtml(showGroupToggle) +
      '<button type="button" class="visit-log-summary__export" title="Download the filtered list as a formatted Excel workbook">Export Excel</button>' +
      '</span>';

    summaryEl.innerHTML =
      '<span class="visit-log-summary__total"><strong>' + shownCount + '</strong> visit' + (shownCount === 1 ? '' : 's') + '</span>' +
      actionsHtml;
    summaryEl.hidden = false;
  }

  function renderUnvisitedSummary(unvisitedCount, matchingSites, showGroupToggle) {
    var summaryEl = document.getElementById('visitLogSummary');
    if (!summaryEl) return;
    var visited = matchingSites - unvisitedCount;
    var coverage = matchingSites > 0 ? Math.round((visited / matchingSites) * 100) : 0;
    var coverageText = matchingSites > 0 ? coverage + '% coverage this period' : 'No sites match the current filters';
    summaryEl.innerHTML =
      '<span class="visit-log-summary__total"><strong>' + unvisitedCount + '</strong> of ' + matchingSites + ' sites unvisited</span>' +
      '<span class="visit-log-summary__coverage">' + coverageText + '</span>' +
      '<span class="visit-log-summary__actions">' +
      visitLogGroupToggleHtml(showGroupToggle) +
      '<button type="button" class="visit-log-summary__export" title="Download the unvisited list as a formatted Excel workbook">Export Excel</button>' +
      '</span>';
    summaryEl.hidden = false;
  }

  function renderFollowUpSummary(shownCount, openCount, overdueCount, showGroupToggle) {
    var summaryEl = document.getElementById('visitLogSummary');
    if (!summaryEl) return;
    // "+ Add task" lives in the card header now (syncVisitLogActions), beside
    // the title — it is this view's primary action, and down here it sat below
    // the header's own buttons and read as a lesser one.
    summaryEl.innerHTML =
      '<span class="visit-log-summary__total"><strong>' + shownCount + '</strong> follow-up' + (shownCount === 1 ? '' : 's') + '</span>' +
      '<span class="visit-log-summary__coverage">' + openCount + ' open · ' + overdueCount + ' overdue</span>' +
      '<span class="visit-log-summary__actions">' +
      visitLogGroupToggleHtml(showGroupToggle) +
      '<button type="button" class="visit-log-summary__export" title="Download the follow-up list as a formatted Excel workbook">Export Excel</button>' +
      '</span>';
    summaryEl.hidden = false;
  }

  window.GAILS.renderVisitLog = function () {
    var container = document.getElementById('visitLogList');
    var statusEl = document.getElementById('visitLogStatus');
    if (!container) return;

    // Keep the Region/Ops filters hidden/shown in step with the visibility
    // scope so a live master-switch toggle takes effect without a reload.
    applyReportScopeToFilters();

    var allVisits = window.GAILS._allVisitsObj || {};
    var visitIds = Object.keys(allVisits);

    var G = window.GAILS;

    // Initialize listeners once
    if (!window.GAILS._visitLogFiltersInited) {
      window.GAILS._visitLogFiltersInited = true;
      initVisitLogMultiSelects();
      var searchEl = document.getElementById('visitLogSearch');
      var regionEl = document.getElementById('visitLogRegion');
      var opsEl = document.getElementById('visitLogOps');
      var bakeryEl = document.getElementById('visitLogBakery');
      var directorySortEl = document.getElementById('visitLogDirectorySort');
      var directoryGroupEl = document.getElementById('visitLogDirectoryGroup');
      var followUpAssigneeEl = document.getElementById('followUpAssignee');
      var periodEl = document.getElementById('visitLogPeriod');
      var resetBtn = document.getElementById('visitLogResetBtn');
      var mobileFilterBtn = document.getElementById('visitLogMobileFilterBtn');
      var mobileFilterCloseBtn = document.getElementById('visitLogFilterCloseBtn');
      var mobileFilterBackdrop = document.getElementById('visitLogFilterBackdrop');
      var visitMobileFilterMedia = window.matchMedia ? window.matchMedia('(max-width: 720px)') : null;

      var lastYearOption = periodEl ? periodEl.querySelector('option[value="lastYear"]') : null;
      if (lastYearOption) {
        lastYearOption.textContent = 'Last Year (' + ((new Date()).getFullYear() - 1) + ')';
      }

      if (mobileFilterBtn) {
        mobileFilterBtn.addEventListener('click', function () {
          setVisitLogFiltersOpen(true);
        });
      }
      if (mobileFilterCloseBtn) {
        mobileFilterCloseBtn.addEventListener('click', function () {
          setVisitLogFiltersOpen(false);
        });
      }
      if (mobileFilterBackdrop) {
        mobileFilterBackdrop.addEventListener('click', function () {
          setVisitLogFiltersOpen(false);
        });
      }
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') setVisitLogFiltersOpen(false);
      });
      if (visitMobileFilterMedia) {
        // The sheet becomes the drawer rather than being dismissed; only
        // the scroll lock it took on the way in has to be handed back.
        var closeVisitFilterOnDesktop = function (e) {
          if (!e.matches) document.body.style.overflow = '';
        };
        if (visitMobileFilterMedia.addEventListener) {
          visitMobileFilterMedia.addEventListener('change', closeVisitFilterOnDesktop);
        } else if (visitMobileFilterMedia.addListener) {
          visitMobileFilterMedia.addListener(closeVisitFilterOnDesktop);
        }
      }

      if (searchEl) {
        var searchDebounceId = null;
        searchEl.addEventListener('input', function () {
          clearTimeout(searchDebounceId);
          searchDebounceId = setTimeout(function () { window.GAILS.renderVisitLog(); }, 220);
        });
      }
      if (regionEl) regionEl.addEventListener('change', function () {
        // Selected regions changed: keep only ops areas and bakeries that
        // still sit inside at least one selected region.
        populateDropdown('visitLogOps', new Set(getVisitLogOps(getVisitLogFilterValues(regionEl))), 'All Areas');
        populateDirectoryBakeryOptions();
        syncVisitLogMobileFilterButton();
        window.GAILS.renderVisitLog();
      });
      if (opsEl) opsEl.addEventListener('change', function () {
        populateDirectoryBakeryOptions();
        syncVisitLogMobileFilterButton();
        window.GAILS.renderVisitLog();
      });
      if (bakeryEl) bakeryEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });
      if (directorySortEl) directorySortEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });
      if (directoryGroupEl) directoryGroupEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });
      if (followUpAssigneeEl) followUpAssigneeEl.addEventListener('change', function () {
        window.GAILS._pendingFollowUpAssigneeFilter = '';
        syncVisitLogMobileFilterButton();
        window.GAILS.renderVisitLog();
      });
      if (periodEl) periodEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });
      var typeEl = document.getElementById('visitLogType');
      var ratingEl = document.getElementById('visitLogRating');
      if (typeEl) typeEl.addEventListener('change', function () {
        syncCqvRatingVisibility();
        syncVisitLogMobileFilterButton();
        window.GAILS.renderVisitLog();
      });
      if (ratingEl) ratingEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });
      syncCqvRatingVisibility();
      var groupEl = document.getElementById('visitLogGroup');
      if (groupEl) groupEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });
      var sortEl = document.getElementById('visitLogSort');
      if (sortEl) sortEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });
      var followUpGroupEl = document.getElementById('followUpGroup');
      if (followUpGroupEl) followUpGroupEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });
      var followUpSortEl = document.getElementById('followUpSort');
      if (followUpSortEl) followUpSortEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });

      // Toggle views (scoped to the main view toggle so the Follow-ups status
      // sub-toggle below doesn't collide with it).
      document.querySelectorAll('#visitLogViewToggle .target-subtab').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('#visitLogViewToggle .target-subtab').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          window.GAILS._activeVisitLogView = btn.dataset.view;
          window.GAILS.renderVisitLog();
        });
      });

      // Follow-ups status sub-filter (Open / Overdue / Done / All).
      document.querySelectorAll('#followUpStatusToggle .visit-log-toggle-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('#followUpStatusToggle .visit-log-toggle-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          window.GAILS._followUpStatusFilter = btn.dataset.status;
          window.GAILS.renderVisitLog();
        });
      });

      // Summary bar utilities: collapse/expand grouped rows or export the
      // currently filtered list.
      var summaryBarEl = document.getElementById('visitLogSummary');
      if (summaryBarEl) {
        summaryBarEl.addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('.visit-log-summary__expand-all')) {
            toggleAllVisitLogGroups();
            return;
          }
          if (e.target.closest && e.target.closest('.visit-log-summary__export')) {
            exportVisitLogFile();
            return;
          }
        });
      }

      // List-level delegation: collapsible group headers, per-site "Log
      // Visit" quick action on unvisited cards, and the "Show more" pager.
      // (Row expansion/report opening is handled by the document-level
      // [data-visit-report-id] listener.)
      var listEl = document.getElementById('visitLogList');
      if (listEl) {
        listEl.addEventListener('click', function (e) {
          var closest = e.target.closest ? function (sel) { return e.target.closest(sel); } : function () { return null; };

          var dirGroupBtn = closest('.bakery-directory__group-toggle');
          if (dirGroupBtn) {
            var groupRow = dirGroupBtn.closest('.bakery-directory__group-row');
            if (!groupRow) return;
            var dirName = groupRow.getAttribute('data-group-name') || '';
            var dirCollapsedGroups = window.GAILS._visitLogCollapsedGroups = window.GAILS._visitLogCollapsedGroups || {};
            var willCollapse = !dirCollapsedGroups[dirName];
            if (willCollapse) dirCollapsedGroups[dirName] = true;
            else delete dirCollapsedGroups[dirName];
            groupRow.classList.toggle('collapsed', willCollapse);
            dirGroupBtn.setAttribute('aria-expanded', willCollapse ? 'false' : 'true');
            var dirTable = groupRow.closest('table');
            if (dirTable) {
              dirTable.querySelectorAll('tr[data-group]').forEach(function (row) {
                if (row.getAttribute('data-group') === dirName) {
                  setVisitLogGroupedRowHidden(row, willCollapse);
                }
              });
            }
            syncVisitLogGroupToggle();
            return;
          }

          var logVisitBtn = closest('.unvisited-log-btn');
          if (logVisitBtn) {
            window.GAILS.openAddSiteVisitModal(logVisitBtn.getAttribute('data-bakery'));
            return;
          }

          // Follow-up item actions: tick off, edit, delete.
          var toggleBtn = closest('[data-followup-toggle]');
          if (toggleBtn) {
            var toggleId = toggleBtn.getAttribute('data-followup-toggle');
            var isChecked = toggleBtn.classList.contains('checked');
            toggleBtn.disabled = true;
            Promise.resolve(window.GAILS_Firebase.completeFollowUpAction(toggleId, !isChecked))
              .catch(function (err) { console.error(err); alert(err.message || 'Failed to update follow-up.'); toggleBtn.disabled = false; });
            // The live followUpActions listener re-renders on success.
            return;
          }

          var editBtn = closest('[data-followup-edit]');
          if (editBtn) {
            var editId = editBtn.getAttribute('data-followup-edit');
            var task = (window.GAILS._followUpActionsObj || {})[editId];
            if (task) window.GAILS.openFollowUpModal(null, Object.assign({ id: editId }, task));
            return;
          }

          var deleteBtn = closest('[data-followup-delete]');
          if (deleteBtn) {
            var deleteId = deleteBtn.getAttribute('data-followup-delete');
            var delTask = (window.GAILS._followUpActionsObj || {})[deleteId];
            var delName = delTask && delTask.title ? '“' + delTask.title + '”' : 'this follow-up';
            var delBakery = delTask && delTask.bakery
              ? (window.GAILS.getBakeryMapLabel
                ? window.GAILS.getBakeryMapLabel(delTask.bakery)
                : delTask.bakery)
              : '';
            window.GAILS.openSaveConfirmModal({
              title: 'Delete follow-up task?',
              subtitle: 'This action is permanent and cannot be undone.',
              message: 'Permanently delete ' + delName + (delBakery ? ' from ' + delBakery : '') + '?',
              confirmLabel: 'Delete task',
              tone: 'danger',
              onConfirm: function () {
                deleteBtn.disabled = true;
                Promise.resolve(window.GAILS_Firebase.deleteFollowUpAction(deleteId))
                  .catch(function (err) {
                    console.error(err);
                    alert(err.message || 'Failed to delete follow-up.');
                    deleteBtn.disabled = false;
                  });
              }
            });
            return;
          }

          if (closest('.visit-log-show-more')) {
            window.GAILS._visitLogRenderLimit = (window.GAILS._visitLogRenderLimit || VISIT_LOG_RENDER_CHUNK) + VISIT_LOG_RENDER_CHUNK;
            window.GAILS.renderVisitLog();
          }
        });
      }

      // Add Site Visit click
      var addBtn = document.getElementById('visitLogAddBtn');
      if (addBtn) {
        addBtn.addEventListener('click', function () {
          window.GAILS.openAddSiteVisitModal();
        });
      }

      // Add follow-up task click (Follow-up Tasks view's primary action)
      var addTaskBtn = document.getElementById('visitLogAddTaskBtn');
      if (addTaskBtn) {
        addTaskBtn.addEventListener('click', function () {
          window.GAILS.openFollowUpModal();
        });
      }

      // Add Site Visit form submit
      var form = document.getElementById('addSiteVisitForm');
      if (form) {
        // The actual save, run only once the user confirms the dialog.
        var submitAddSiteVisit = async function () {
          var submitBtn = document.getElementById('addVisitSubmitBtn');
          var errorEl = document.getElementById('addVisitError');
          if (!submitBtn) return;

          submitBtn.disabled = true;
          var origText = submitBtn.textContent;
          submitBtn.textContent = 'Saving...';
          if (errorEl) errorEl.style.display = 'none';

          var partnerField = document.getElementById('addVisitPartner');
          // Resolved at submit rather than at pick time, so deleting a selected
          // name afterwards really does un-assign. Commas, "+" and "&" separate
          // multiple people.
          var assignees = window.GAILS.MentionField
            ? window.GAILS.MentionField.assigneesFor(partnerField)
            : [];
          var record = {
            bakery: document.getElementById('addVisitBakery').value,
            visitKind: document.getElementById('addVisitType').value || 'checkin',
            date: document.getElementById('addVisitDate').value,
            time: document.getElementById('addVisitTime').value,
            coffeePartner: assignees.length && window.GAILS.Mentions
              ? window.GAILS.Mentions.formatPeople(assignees)
              : (partnerField.value || '').trim(),
            mod: document.getElementById('addVisitMod').value || '',
            comments: document.getElementById('addVisitComments').value || '',
            // Absent rather than empty when nobody was mentioned, which is what
            // keeps every visit logged before assignment existed unassigned.
            assignedTo: assignees.length ? assignees : null
          };

          // Follow-ups raised/ticked on this visit, collected before the async
          // save so a re-render can't change the DOM underneath us.
          var newTasks = collectNewFollowUps();
          var tickedIds = Array.prototype.map.call(
            document.querySelectorAll('#addVisitOpenTasksList .follow-up-check__box:checked'),
            function (box) { return box.getAttribute('data-task-id'); }
          );

          try {
            if (!window.GAILS_Firebase || typeof window.GAILS_Firebase.saveSiteVisit !== 'function') {
              throw new Error('Database helper not loaded yet. Please try again.');
            }
            var newVisitId = await window.GAILS_Firebase.saveSiteVisit(record, { silent: true });

            // Close off ticked tasks and raise any new ones (best-effort — the
            // check-in itself has already saved, so surface but don't unwind).
            var followUpOps = [];
            var followUpFailed = false;
            tickedIds.forEach(function (id) {
              followUpOps.push(window.GAILS_Firebase.completeFollowUpAction(id, true, { silent: true }));
            });
            newTasks.forEach(function (t) {
              followUpOps.push(window.GAILS_Firebase.saveFollowUpAction({
                bakery: record.bakery,
                title: t.title,
                dueDate: t.dueDate,
                priority: t.priority,
                sourceVisitId: newVisitId || null,
                // Actions raised during a visit belong to whoever the visit was
                // handed to — assigning a visit assigns its follow-ups with it.
                assignedTo: assignees.length ? assignees : null
              }, { silent: true }));
            });
            if (followUpOps.length) {
              try { await Promise.all(followUpOps); }
              catch (fuErr) {
                followUpFailed = true;
                console.error('Some follow-up updates failed:', fuErr);
              }
            }

            if (window.GAILS && typeof window.GAILS.notifySuccess === 'function') {
              var successParts = [
                record.visitKind && record.visitKind !== 'checkin'
                  ? 'NBO opening visit saved'
                  : 'Check-in saved'
              ];
              if (!followUpFailed && newTasks.length) {
                successParts.push(newTasks.length + (newTasks.length === 1 ? ' task created' : ' tasks created'));
              }
              if (!followUpFailed && tickedIds.length) {
                successParts.push(tickedIds.length + (tickedIds.length === 1 ? ' task signed off' : ' tasks signed off'));
              }
              window.GAILS.notifySuccess(successParts.join(' · '));
            }

            window.GAILS.closeAddSiteVisitModal();
          } catch (err) {
            console.error(err);
            if (errorEl) {
              errorEl.textContent = err.message || 'Failed to save check-in.';
              errorEl.style.display = 'block';
            }
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
          }
        };

        form.addEventListener('submit', function (e) {
          e.preventDefault();
          // Native validation has already passed, so the required fields are set.
          var bakeryVal = document.getElementById('addVisitBakery').value;
          var dateVal = document.getElementById('addVisitDate').value;
          var bakeryLabel = (window.GAILS.getBakeryMapLabel
            ? window.GAILS.getBakeryMapLabel(bakeryVal) : bakeryVal) || 'this bakery';
          var dateLabel = dateVal ? formatVisitDate(dateVal) : '';

          window.GAILS.openSaveConfirmModal({
            title: 'Confirm Check-in',
            subtitle: 'Log this visit to the bakery report.',
            message: 'Save this check-in for ' + bakeryLabel
              + (dateLabel ? ' on ' + dateLabel : '') + '?',
            confirmLabel: 'Save check-in',
            onConfirm: submitAddSiteVisit
          });
        });
      }

      // Log Visit modal: refresh the open-tasks checklist when the bakery
      // changes, and drive the "add follow-up" row builder.
      var addVisitBakeryEl = document.getElementById('addVisitBakery');
      if (addVisitBakeryEl) {
        addVisitBakeryEl.addEventListener('change', function () {
          renderCheckInOpenTasks(addVisitBakeryEl.value);
        });
      }
      var addTaskRowBtn = document.getElementById('addVisitNewTaskBtn');
      if (addTaskRowBtn) {
        addTaskRowBtn.addEventListener('click', function () {
          var added = appendFollowUpBuilderRow(document.getElementById('addVisitNewTasks'));
          var input = added && added.querySelector('.follow-up-builder__title');
          if (input) input.focus();
        });
      }
      var newTasksWrap = document.getElementById('addVisitNewTasks');
      if (newTasksWrap) {
        newTasksWrap.addEventListener('click', function (e) {
          var removeBtn = e.target.closest ? e.target.closest('.follow-up-builder__remove') : null;
          if (!removeBtn) return;
          var rows = newTasksWrap.querySelectorAll('.follow-up-builder__row');
          if (rows.length <= 1) {
            // Keep at least one row — just clear it.
            var row = removeBtn.closest('.follow-up-builder__row');
            if (row) row.querySelectorAll('input').forEach(function (i) { i.value = ''; });
            return;
          }
          var target = removeBtn.closest('.follow-up-builder__row');
          if (target) target.remove();
        });
      }

      // Standalone add/edit follow-up form.
      var followUpForm = document.getElementById('addFollowUpForm');
      if (followUpForm) {
        // The actual save, run only once the user confirms the dialog.
        var submitFollowUp = async function () {
          var submitBtn = document.getElementById('followUpSubmitBtn');
          var errorEl = document.getElementById('followUpError');
          if (!submitBtn) return;
          var origText = submitBtn.textContent;
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving...';
          if (errorEl) errorEl.style.display = 'none';

          var editId = document.getElementById('followUpEditId').value;
          var assigneeField = document.getElementById('followUpAssignees');
          var followUpAssignees = window.GAILS.MentionField
            ? window.GAILS.MentionField.assigneesFor(assigneeField)
            : [];
          var existingTask = editId && window.GAILS._followUpActionsObj
            ? window.GAILS._followUpActionsObj[editId]
            : null;
          var existingResponsible = followUpResponsiblePeople(existingTask);
          if (!followUpAssignees.length && assigneeField && assigneeField.value.trim() &&
              window.GAILS.Mentions &&
              assigneeField.value.trim() === window.GAILS.Mentions.formatPeople(existingResponsible)) {
            followUpAssignees = existingResponsible;
          }
          var payload = {
            bakery: document.getElementById('followUpBakery').value,
            title: document.getElementById('followUpTitle').value.trim(),
            dueDate: document.getElementById('followUpDueDate').value || null,
            priority: normalizePriority(document.getElementById('followUpPriority').value),
            detail: document.getElementById('followUpDetail').value.trim(),
            assignedTo: followUpAssignees.length ? followUpAssignees : null
          };

          try {
            if (!window.GAILS_Firebase) throw new Error('Database helper not loaded yet. Please try again.');
            if (editId) {
              await window.GAILS_Firebase.updateFollowUpAction(editId, payload);
            } else {
              await window.GAILS_Firebase.saveFollowUpAction(payload);
            }
            window.GAILS.closeFollowUpModal();
          } catch (err) {
            console.error(err);
            if (errorEl) {
              errorEl.textContent = err.message || 'Failed to save follow-up.';
              errorEl.style.display = 'block';
            }
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
          }
        };

        followUpForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var editId = document.getElementById('followUpEditId').value;
          var bakeryVal = document.getElementById('followUpBakery').value;
          var titleVal = document.getElementById('followUpTitle').value.trim();
          var bakeryLabel = (window.GAILS.getBakeryMapLabel
            ? window.GAILS.getBakeryMapLabel(bakeryVal) : bakeryVal) || 'this bakery';

          window.GAILS.openSaveConfirmModal({
            title: editId ? 'Confirm Changes' : 'Confirm Action',
            subtitle: editId
              ? 'Update this follow-up action.'
              : 'Add this follow-up action.',
            message: (editId ? 'Save changes to "' : 'Add the action "')
              + titleVal + '" for ' + bakeryLabel + '?',
            confirmLabel: editId ? 'Save changes' : 'Add action',
            onConfirm: submitFollowUp
          });
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          try { localStorage.removeItem(VISIT_LOG_FILTER_STORAGE_KEY); } catch (e) { /* storage unavailable */ }
          if (searchEl) searchEl.value = '';
          setVisitLogFilterValues(regionEl, []);
          if (typeEl) typeEl.value = '';
          if (ratingEl) ratingEl.value = '';
          if (groupEl) groupEl.value = getVisitLogDefaultGroup();
          if (sortEl) sortEl.value = 'date';
          if (periodEl) periodEl.value = getVisitLogDefaultPeriod(window.GAILS._activeVisitLogView || 'bakeries');
          populateDropdown('visitLogOps', new Set(getVisitLogOps('')), 'All Areas');
          setVisitLogFilterValues(opsEl, []);
          populateDirectoryBakeryOptions();
          setVisitLogFilterValues(bakeryEl, []);
          if (directorySortEl) directorySortEl.value = 'nameAsc';
          if (directoryGroupEl) directoryGroupEl.value = 'none';
          if (followUpAssigneeEl) followUpAssigneeEl.value = '';
          window.GAILS._pendingFollowUpAssigneeFilter = '';
          if (followUpGroupEl) followUpGroupEl.value = 'bakery';
          if (followUpSortEl) followUpSortEl.value = 'dueAsc';
          window.GAILS._followUpStatusFilter = 'open';
          document.querySelectorAll('#followUpStatusToggle .visit-log-toggle-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.status === 'open');
          });
          syncCqvRatingVisibility();
          syncVisitLogMobileFilterButton();
          if (window.GAILS.syncCustomSelect) {
            window.GAILS.syncCustomSelect('visitLogDirectorySort');
            window.GAILS.syncCustomSelect('visitLogDirectoryGroup');
            window.GAILS.syncCustomSelect('followUpAssignee');
            window.GAILS.syncCustomSelect('visitLogType');
            window.GAILS.syncCustomSelect('visitLogRating');
            window.GAILS.syncCustomSelect('visitLogGroup');
            window.GAILS.syncCustomSelect('visitLogSort');
            window.GAILS.syncCustomSelect('visitLogPeriod');
            window.GAILS.syncCustomSelect('followUpGroup');
            window.GAILS.syncCustomSelect('followUpSort');
          }
          window.GAILS.renderVisitLog();
        });
      }
    }

    // Populate selects dynamically once (or if not populated yet)
    if (!window.GAILS._visitLogFiltersPopulated) {
      window.GAILS._visitLogFiltersPopulated = true;
      populateVisitLogFilterOptions();
      restoreVisitLogFilters();

      // Theme newly built dropdown options
      if (window.GAILS.initCustomSelects) {
        window.GAILS.initCustomSelects(document.querySelector('.visit-log-filters'));
      }
      syncVisitLogMobileFilterButton();
    }

    // Follow-up records arrive over their own live Firebase listener, so keep
    // this data-led dropdown in sync after the static filters are initialized.
    populateFollowUpAssigneeOptions();

    // Everything above is one-time setup and dropdown upkeep, which is cheap and
    // has to stay current whether or not anyone is looking. Everything below
    // filters, groups, sorts and rewrites the list — and that used to run on
    // every visit and follow-up snapshot even while Bakery Reports was closed,
    // which on the dashboard is almost always. It runs at least three times
    // during boot alone (see the sync callbacks in js/auth.js).
    //
    // Deferred rather than dropped: the tab handler in js/app.js already calls
    // this on activation, so the pending flag exists to make the skip visible
    // and testable rather than to trigger the redraw.
    var panelEl = document.getElementById('tab-visit-log');
    if (panelEl && !panelEl.classList.contains('active')) {
      window.GAILS._visitLogRenderPending = true;
      return;
    }
    window.GAILS._visitLogRenderPending = false;

    var view = window.GAILS._activeVisitLogView || 'bakeries';

    // Lets CSS keep view-specific supporting UI in step with the selected
    // directory/report list.
    var tabEl = document.getElementById('tab-visit-log');
    if (tabEl) tabEl.setAttribute('data-visit-view', view);

    syncVisitLogViewControls(view);

    // Get filter values
    var searchVal = document.getElementById('visitLogSearch') ? document.getElementById('visitLogSearch').value.toLowerCase().trim() : '';
    var regionVal = getVisitLogFilterValues('visitLogRegion');
    var opsVal = getVisitLogFilterValues('visitLogOps');
    var bakeryVal = getVisitLogFilterValues('visitLogBakery');
    var directorySortVal = document.getElementById('visitLogDirectorySort') ? document.getElementById('visitLogDirectorySort').value : 'nameAsc';
    var directoryGroupVal = document.getElementById('visitLogDirectoryGroup') ? document.getElementById('visitLogDirectoryGroup').value : 'none';
    var typeVal = document.getElementById('visitLogType') ? document.getElementById('visitLogType').value : '';
    var ratingVal = document.getElementById('visitLogRating') ? document.getElementById('visitLogRating').value : '';
    var groupVal = document.getElementById('visitLogGroup')
      ? document.getElementById('visitLogGroup').value
      : getVisitLogDefaultGroup();
    var sortVal = document.getElementById('visitLogSort') ? document.getElementById('visitLogSort').value : 'date';
    var followUpGroupVal = document.getElementById('followUpGroup') ? document.getElementById('followUpGroup').value : 'bakery';
    var followUpSortVal = document.getElementById('followUpSort') ? document.getElementById('followUpSort').value : 'dueAsc';
    var followUpAssigneeVal = document.getElementById('followUpAssignee') ? document.getElementById('followUpAssignee').value : '';
    var periodVal = document.getElementById('visitLogPeriod')
      ? document.getElementById('visitLogPeriod').value
      : getVisitLogDefaultPeriod(view);
    var followUpStatus = window.GAILS._followUpStatusFilter || 'open';

    // The live feed only carries a rolling window of visits (js/visit-feed.js).
    // "All Time" is the one period that reaches past it, so it pulls the rest
    // in on demand and re-renders once — every other preset is already covered.
    // Checked here rather than on the period control's change event so it also
    // covers a restored filter and a deep link, which set the value directly.
    ensureVisitHistoryFor(periodVal);

    syncVisitLogMobileFilterButton();

    saveVisitLogFilters({
      search: view === 'bakeries'
        ? ''
        : (document.getElementById('visitLogSearch') ? document.getElementById('visitLogSearch').value : ''),
      region: regionVal,
      ops: opsVal,
      bakery: bakeryVal,
      directorySort: directorySortVal,
      directoryGroup: directoryGroupVal,
      type: typeVal,
      rating: ratingVal,
      group: groupVal,
      sort: sortVal,
      period: periodVal,
      followUpGroup: followUpGroupVal,
      followUpSort: followUpSortVal,
      followUpAssignee: followUpAssigneeVal,
      followUpStatus: followUpStatus,
      view: view
    });

    // Ahead of the per-view branches below, all of which can return early. The
    // directory and the "no check-ins yet" guard both did, which left the
    // header breadcrumb showing the view you came from — the directory read
    // "Last 2 Months · Grouped by Region · Sorted by Date", none of which it
    // even offers.
    var headerSub = document.getElementById('headerSub');
    if (headerSub && window.GAILS.getVisitLogHeaderSummary) {
      headerSub.innerHTML = window.GAILS.getVisitLogHeaderSummary();
    }

    if (view === 'bakeries') {
      renderBakeryDirectory({
        search: searchVal,
        region: regionVal,
        ops: opsVal,
        bakery: bakeryVal,
        sort: directorySortVal,
        group: directoryGroupVal
      });
      syncVisitLogGroupToggle();
      return;
    }

    // The Follow-ups view reads its own node and can have tasks even before any
    // visits load, so it isn't gated by the "no check-ins" guard below. The
    // bakery directory above is likewise independent of visit data.
    if (visitIds.length === 0 && view !== 'followups') {
      if (statusEl) {
        statusEl.textContent = 'Loading check-ins...';
        statusEl.style.display = '';
      }
      var emptySummaryEl = document.getElementById('visitLogSummary');
      if (emptySummaryEl) emptySummaryEl.hidden = true;
      container.innerHTML = '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#128196;</div><p>No check-ins loaded yet.</p></div>';
      return;
    }

    if (statusEl) {
      statusEl.textContent = '';
      statusEl.style.display = 'none';
    }

    // "Show more" pagination: any filter/view change resets the row limit
    // back to the first chunk; the Show more button re-renders with the same
    // signature, so the raised limit survives.
    var renderSig = [view, searchVal, regionVal.join(','), opsVal.join(','), bakeryVal.join(','),
      typeVal, ratingVal, groupVal, sortVal, periodVal, followUpStatus].join('|');
    if (window.GAILS._visitLogRenderSig !== renderSig) {
      window.GAILS._visitLogRenderSig = renderSig;
      window.GAILS._visitLogRenderLimit = VISIT_LOG_RENDER_CHUNK;
      window.GAILS.resetVisitLogCollapsedGroups();
    }
    var renderLimit = window.GAILS._visitLogRenderLimit || VISIT_LOG_RENDER_CHUNK;

    // Sticky group headers pin just below the app header, whose height
    // varies with viewport — measure it rather than hard-coding.
    var appHeader = document.querySelector('.header');
    if (appHeader) {
      document.documentElement.style.setProperty('--visit-sticky-top', appHeader.offsetHeight + 'px');
    }

    // Convert object to array. Scoped ops managers only see visits for their
    // own ops area, so every grouping downstream respects the same scope.
    var visitsList = visitIds.map(function (id) {
      return Object.assign({ id: id }, allVisits[id]);
    }).filter(function (v) { return reportBakeryAllowed(v.bakery); });

    if (view === 'history') {
      // Apply the shared search, scope, and period filters first, followed by
      // the Visit Type and Rating controls.
      var baseFiltered = visitsList.filter(function (v) {
        if (!v.bakery || !v.date) return false;

        if (searchVal) {
          var bakeryMatch = v.bakery.toLowerCase().indexOf(searchVal) !== -1;
          var partnerMatch = partnerText(v.coffeePartner).toLowerCase().indexOf(searchVal) !== -1 && !!v.coffeePartner;
          var auditorMatch = v.auditorName && v.auditorName.toLowerCase().indexOf(searchVal) !== -1;
          if (!bakeryMatch && !partnerMatch && !auditorMatch) return false;
        }
        if (regionVal.length) {
          var reg = G.getBakeryRegion ? G.getBakeryRegion(v.bakery) : 'Unknown';
          if (regionVal.indexOf(reg) === -1) return false;
        }
        if (opsVal.length) {
          var ops = G.getBakeryOps ? G.getBakeryOps(v.bakery) : 'Unknown';
          if (opsVal.indexOf(ops) === -1) return false;
        }
        if (!isDateWithinMonths(v.date, periodVal)) {
          return false;
        }
        return true;
      });

      var filtered = baseFiltered.filter(function (v) {
        if (typeVal && visitTypeKey(v) !== typeVal) return false;
        if (ratingVal && (v.type !== 'cqv' || cqvBand(v) !== ratingVal)) return false;
        return true;
      });

      if (filtered.length === 0) {
        window.GAILS._visitLogCurrentGroupNames = [];
        renderVisitLogSummary(filtered.length, false);
        // Clear stale export data so the still-visible Export button can't
        // download the previous filter's rows.
        window.GAILS._visitLogExport = null;
        container.innerHTML = '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#128196;</div><p>No check-ins found matching the selected filters.</p></div>';
        return;
      }

      // Group by whatever's selected in "Group By" (Ops Area / Region /
      // Visit Type) — same underlying list, just bucketed differently.
      var grouped = {};
      filtered.forEach(function (v) {
        var key = getVisitGroupKey(v, groupVal);
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(v);
      });

      var groupsSorted = Object.keys(grouped).sort();
      var schema = window.GAILS_VISIT_SCHEMA;
      var collapsedGroups = window.GAILS._visitLogCollapsedGroups = window.GAILS._visitLogCollapsedGroups || {};
      window.GAILS._visitLogCurrentGroupNames = groupVal === 'none' ? [] : groupsSorted.slice();
      renderVisitLogSummary(filtered.length, groupVal !== 'none');

      // The export always mirrors the full filtered list, even when the
      // rendered rows are capped by the Show more pager, and repeats the
      // on-screen ordering so the file reads like the view it came from.
      window.GAILS._visitLogExport = withLazyRows({
        title: 'GAIL’s — Visit Log',
        sheetName: 'Visits',
        filename: buildExportFilename('Visit Log'),
        meta: baseExportMeta().concat([
          ['Visit Type', exportFilterLabel('visitLogType', 'All types')],
          ['CQV Rating', exportFilterLabel('visitLogRating', 'All ratings')],
          ['Sorted by', exportFilterLabel('visitLogSort', 'Date')],
          ['Visits exported', filtered.length]
        ]),
        columns: [
          { label: 'Date', type: 'date', width: 13 },
          { label: 'Time', type: 'text', width: 7 },
          { label: 'Bakery', type: 'text', width: 26 },
          { label: 'Region', type: 'text', width: 16 },
          { label: 'Ops Area', type: 'text', width: 18 },
          { label: 'Visit Type', type: 'text', width: 20 },
          { label: 'Coffee Partner / Auditor', type: 'text', width: 24 },
          { label: 'Assigned To', type: 'text', width: 24 },
          // Scores land as a real percentage across every visit type so the
          // column sorts; routine visits keep their raw points alongside.
          { label: 'Score %', type: 'percent', width: 9 },
          { label: 'Points', type: 'number', width: 8 },
          { label: 'Points Available', type: 'number', width: 15 },
          { label: 'Notes', type: 'text', width: 70 }
        ],
        rowCount: filtered.length
      }, function () {
        return groupsSorted.reduce(function (rows, groupName) {
          return rows.concat(grouped[groupName].slice().sort(visitLogSorter(sortVal)));
        }, []).map(function (v) {
          var pct = null;
          if (v.type === 'cqv') pct = v.overallPct;
          else if (v.type === 'nbo') pct = GAILS.NBOShared.overallPct(v);
          else if (v.type !== 'siteVisit' && v.score != null && v.scoreMax) pct = (v.score / v.scoreMax) * 100;
          var isRoutine = v.type !== 'cqv' && v.type !== 'nbo' && v.type !== 'siteVisit';
          return [
            v.date,
            v.time || '',
            G.getBakeryMapLabel ? G.getBakeryMapLabel(v.bakery) : v.bakery,
            G.getBakeryRegion ? G.getBakeryRegion(v.bakery) : '',
            G.getBakeryOps ? G.getBakeryOps(v.bakery) : '',
            visitTypeLabel(v),
            (v.type === 'cqv' || v.type === 'nbo') ? (v.auditorName || '') : partnerText(v.coffeePartner),
            window.GAILS.Attribution ? window.GAILS.Attribution.namesText(window.GAILS.Attribution.forVisit(v)) : '',
            pct != null ? pct / 100 : '',
            isRoutine ? v.score : '',
            isRoutine ? v.scoreMax : '',
            buildVisitNotes(v, schema, true).text
          ];
        });
      });

      var remaining = renderLimit;

      var html = groupsSorted.map(function (groupName) {
        var groupVisits = grouped[groupName];
        var isCollapsed = groupVal !== 'none' && !!collapsedGroups[groupName];

        // Sort based on selected option within the group
        groupVisits.sort(visitLogSorter(sortVal));

        // Pagination: spend the remaining row budget on this group; anything
        // beyond it stays reachable via the Show more button after the list.
        if (remaining <= 0) return '';
        var visibleVisits = groupVisits.length > remaining ? groupVisits.slice(0, remaining) : groupVisits;
        remaining -= visibleVisits.length;

        var visitsHtml = visibleVisits.map(function (v) {
          var scoreText = '—';
          var tagsHtml = '';
          var scoreColor = '#ffffff';

          if (v.type === 'siteVisit') {
            scoreText = '';
            var kindColors = siteVisitKindTagColors(v);
            tagsHtml = '<span class="visit-log-row__tag" style="color:' + kindColors.color + ';background:' + kindColors.bg + ';">' + escapeHtml(siteVisitKindLabel(v)) + '</span>';
          } else if (v.type === 'nbo') {
            // Derived percentage, shown in the default text colour — NBO
            // visits have no RAG band (see js/nbo-shared.js).
            scoreText = nboPctText(v);
            scoreColor = 'var(--text)';
            tagsHtml = '<span class="visit-log-row__tag" style="color:var(--purple);background:var(--purple-d);">' + escapeHtml(nboVisitLabel(v)) + '</span>';
          } else if (v.type === 'cqv') {
            scoreText = (v.overallPct != null) ? v.overallPct + '%' : '—';
            tagsHtml = '<span class="visit-log-row__tag" style="color:#B22A24;background:rgba(178, 42, 36,0.15);">' + (v.isFollowUp ? 'CQV Follow-Up' : 'CQV') + '</span>';
            var band = cqvBand(v);
            var bandColor = cqvBandColor(band);
            if (bandColor) {
              scoreColor = bandColor;
            }
          } else {
            scoreText = (v.score != null) ? v.score + ' / ' + (v.scoreMax != null ? v.scoreMax : '—') : '—';
            scoreColor = 'var(--text)';
            tagsHtml = '<span class="visit-log-row__tag" style="color:var(--gold);background:var(--gold-d);">Routine Coffee Visit</span>';
          }

          var notes = buildVisitNotes(v, schema);
          var allNotesText = notes.text || 'No notes recorded.';
          var notesFullHtml = notes.fullHtml || '<p class="visit-log-row__note-item">No notes recorded.</p>';

          var previewText = allNotesText;
          if (previewText.length > 120) {
            previewText = previewText.substring(0, 120) + '...';
          }

          var dateLabel = formatVisitDate(v.date);
          var shortDate = dateLabel.split(', ')[1] || dateLabel;
          var bakeryLabel = getDirectoryBakeryLabel(v.bakery);
          var isAuditedType = v.type === 'cqv' || v.type === 'nbo';
          var partnerColText = isAuditedType ? (v.auditorName || '—') : (partnerText(v.coffeePartner) || '—');
          var partnerColHtml = isAuditedType ? escapeHtml(partnerColText) : partnerHtml(v.coffeePartner);
          // The row always shows the actual Ops Area regardless of the
          // active grouping — grouping by Region/Visit Type would otherwise
          // lose that context entirely.
          var rowOpsLabel = groupVal === 'ops' ? groupName : (G.getBakeryOps ? G.getBakeryOps(v.bakery) : 'Unknown');
          var groupAttr = groupVal === 'none' ? '' : ' data-group="' + escapeHtml(groupName) + '"';
          var groupHiddenAttr = isCollapsed ? ' hidden' : '';

          return '<tr class="visit-history-table__row" data-visit-report-id="' + escapeHtml(v.id) + '"' + groupAttr + groupHiddenAttr + '>' +
            '<td data-label="Date"><div class="visit-log-row__date-col">' +
            '<span class="visit-log-row__date">' + escapeHtml(shortDate) + '</span>' +
            '<span class="visit-log-row__time">' + escapeHtml(v.time || '—') + '</span>' +
            '</div></td>' +
            '<td data-label="Bakery"><div class="visit-log-row__bakery-col">' +
            '<h3 class="visit-log-row__bakery">' + escapeHtml(bakeryLabel) + '</h3>' +
            '<span class="visit-log-row__manager">Ops Area: ' + escapeHtml(rowOpsLabel) + '</span>' +
            '</div></td>' +
            '<td data-label="Partner / auditor"><div class="visit-log-row__partner" title="' + escapeHtml(isAuditedType ? 'Auditor: ' + partnerColText : partnerColText) + '">' + partnerColHtml + '</div></td>' +
            '<td data-label="Score"><div class="visit-log-row__score-col" style="color:' + scoreColor + ';">' + escapeHtml(scoreText) + '</div></td>' +
            '<td data-label="Visit type and notes"><div class="visit-log-row__notes-col">' +
            '<div class="visit-log-row__tags">' + tagsHtml + '</div>' +
            '<p class="visit-log-row__notes-preview">' + escapeHtml(previewText) + '</p>' +
            '</div></td>' +
            '<td data-label="Report"><div class="visit-log-row__action-col">' +
            '<button type="button" class="visit-log-row__btn">View Report</button>' +
            '<button type="button" class="visit-history-table__expand-btn" data-bakery-label="' + escapeHtml(bakeryLabel) + '" aria-expanded="false" aria-controls="visit-history-details-' + escapeHtml(v.id) + '" aria-label="Show notes for ' + escapeHtml(bakeryLabel) + '">' +
            '<span class="visit-log-row__chevron" aria-hidden="true">' +
            '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3 3-3"/></svg>' +
            '</span></button></div></td>' +
            '</tr>' +
            '<tr class="visit-history-table__details-row" id="visit-history-details-' + escapeHtml(v.id) + '"' + groupAttr + ' data-visit-details-for="' + escapeHtml(v.id) + '" hidden>' +
            '<td colspan="6"><div class="visit-log-row__notes-full">' + notesFullHtml + '</div></td>' +
            '</tr>';
        }).join('');

        if (groupVal === 'none') {
          return visitsHtml;
        }

        return '<tr class="bakery-directory__group-row' + (isCollapsed ? ' collapsed' : '') + '" data-group-name="' + escapeHtml(groupName) + '">' +
          '<th scope="rowgroup" colspan="6">' +
          '<button type="button" class="bakery-directory__group-toggle" aria-expanded="' + (isCollapsed ? 'false' : 'true') + '">' +
          '<svg class="bakery-directory__group-chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3 3-3"/></svg>' +
          '<span>' + escapeHtml(groupName) + '</span>' +
          '<em>' + groupVisits.length + ' visit' + (groupVisits.length === 1 ? '' : 's') + '</em>' +
          '</button>' +
          '</th>' +
          '</tr>' +
          visitsHtml;
      }).join('');

      html = '<div class="table-wrap table-wrap--league table-wrap--floating table-wrap--directory table-wrap--visit-history">' +
        '<table class="bakery-directory visit-history-table" data-table-fullscreen="off">' +
        '<caption>Visit history</caption>' +
        visitLogHeadHtml() +
        '<tbody>' + html + '</tbody>' +
        '</table></div>';

      if (filtered.length > renderLimit) {
        html += '<button type="button" class="visit-log-show-more">Show more (' + (filtered.length - renderLimit) + ' remaining)</button>';
      }

      container.innerHTML = html;
      syncVisitLogGroupToggle();
    } else if (view === 'unvisited') {
      // Determine which sites are unvisited in periodVal
      var visitedBakeries = new Set();
      visitsList.forEach(function (v) {
        if (v.bakery && v.date && isDateWithinMonths(v.date, periodVal)) {
          visitedBakeries.add(v.bakery);
        }
      });

      // Scoped ops managers only see their own ops area's sites in the
      // unvisited list (and its counts).
      var allBakeries = (G.state && G.state.BAKERIES || []).filter(reportBakeryAllowed);
      var unvisitedMap = {};
      var totalUnvisited = 0;
      var matchingSites = 0;

      allBakeries.forEach(function (bName) {
        if (searchVal) {
          if (bName.toLowerCase().indexOf(searchVal) === -1) return;
        }
        if (regionVal.length) {
          var reg = G.getBakeryRegion ? G.getBakeryRegion(bName) : 'Unknown';
          if (regionVal.indexOf(reg) === -1) return;
        }
        if (opsVal.length) {
          var ops = G.getBakeryOps ? G.getBakeryOps(bName) : 'Unknown';
          if (opsVal.indexOf(ops) === -1) return;
        }
        matchingSites++;

        if (!visitedBakeries.has(bName)) {
          var groupName = 'All Sites';
          if (groupVal === 'region') {
            groupName = (G.getBakeryRegion ? G.getBakeryRegion(bName) : '') || 'Unknown';
          } else if (groupVal !== 'none') {
            groupName = (G.getBakeryOps ? G.getBakeryOps(bName) : '') || 'Unknown';
          }
          if (!unvisitedMap[groupName]) unvisitedMap[groupName] = [];
          unvisitedMap[groupName].push(bName);
          totalUnvisited++;
        }
      });

      // Most recent visit per bakery across ALL history (not just the
      // selected period) so each unvisited card can say how stale it is.
      var lastVisitMap = {};
      visitsList.forEach(function (v) {
        if (!v.bakery || !v.date) return;
        var stamp = v.date + 'T' + (v.time || '00:00');
        if (!lastVisitMap[v.bakery] || stamp > lastVisitMap[v.bakery]) {
          lastVisitMap[v.bakery] = stamp;
        }
      });

      if (totalUnvisited === 0) {
        window.GAILS._visitLogCurrentGroupNames = [];
        renderUnvisitedSummary(totalUnvisited, matchingSites, false);
        window.GAILS._visitLogExport = null;
        // Zero matches means the filters excluded every site — only celebrate
        // when matched sites exist and all of them were actually visited.
        container.innerHTML = matchingSites === 0
          ? '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#128269;</div><p>No sites match your current filters.</p></div>'
          : '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#127881;</div><p>All bakeries have been visited in this period!</p></div>';
        return;
      }

      var groupsSorted = Object.keys(unvisitedMap).sort();
      window.GAILS._visitLogCurrentGroupNames = groupVal === 'none' ? [] : groupsSorted.slice();
      renderUnvisitedSummary(totalUnvisited, matchingSites, groupVal !== 'none');

      window.GAILS._visitLogExport = withLazyRows({
        title: 'GAIL’s — Unvisited Sites',
        sheetName: 'Unvisited Sites',
        filename: buildExportFilename('Unvisited Sites'),
        meta: baseExportMeta().concat([
          ['Sites matching filters', matchingSites],
          ['Unvisited in period', totalUnvisited],
          ['Coverage', matchingSites > 0
            ? Math.round(((matchingSites - totalUnvisited) / matchingSites) * 100) + '%'
            : '—']
        ]),
        columns: [
          { label: 'Bakery', type: 'text', width: 26 },
          { label: 'Region', type: 'text', width: 16 },
          { label: 'Ops Area', type: 'text', width: 18 },
          // "Last Visit" spans all history, not just the selected period, so a
          // blank date genuinely means never — hence the explicit flag column.
          { label: 'Last Visit', type: 'date', width: 13 },
          { label: 'Days Since', type: 'number', width: 11 },
          { label: 'Ever Visited', type: 'text', width: 12 }
        ],
        rowCount: totalUnvisited
      }, function () {
        return groupsSorted.reduce(function (rows, groupName) {
          unvisitedMap[groupName].slice().sort().forEach(function (bName) {
            var lastIso = lastVisitMap[bName] ? lastVisitMap[bName].split('T')[0] : '';
            rows.push([
              bName,
              G.getBakeryRegion ? G.getBakeryRegion(bName) : '',
              G.getBakeryOps ? G.getBakeryOps(bName) : '',
              lastIso,
              lastIso ? daysSince(lastIso) : '',
              lastIso ? 'Yes' : 'No'
            ]);
          });
          return rows;
        }, []);
      });

      var collapsedUnvisited = window.GAILS._visitLogCollapsedGroups = window.GAILS._visitLogCollapsedGroups || {};
      var html = groupsSorted.map(function (groupName) {
        var bakeries = unvisitedMap[groupName].sort();
        var count = bakeries.length;
        var isCollapsed = groupVal !== 'none' && !!collapsedUnvisited[groupName];

        var bakeryRowsHtml = bakeries.map(function (bName) {
          var reg = G.getBakeryRegion ? G.getBakeryRegion(bName) : '—';
          var ops = G.getBakeryOps ? G.getBakeryOps(bName) : '—';
          var stamp = lastVisitMap[bName] || '';
          var lastIso = stamp ? stamp.split('T')[0] : '';
          var lastVisitText = lastIso ? formatVisitDate(lastIso) : 'Never visited';
          lastVisitText = lastVisitText.split(', ')[1] || lastVisitText;
          var daysValue = lastIso ? daysSince(lastIso) : null;
          var daysText = daysValue == null ? '—' : daysValue + ' day' + (daysValue === 1 ? '' : 's');
          var groupAttr = groupVal === 'none' ? '' : ' data-group="' + escapeHtml(groupName) + '"';

          return '<tr' + groupAttr + (isCollapsed ? ' hidden' : '') + '>' +
            '<th scope="row" data-label="Bakery">' + escapeHtml(getDirectoryBakeryLabel(bName)) + '</th>' +
            '<td data-label="Ops Area">' + escapeHtml(ops) + '</td>' +
            '<td data-label="Region">' + escapeHtml(reg) + '</td>' +
            '<td data-label="Last Visit">' + escapeHtml(lastVisitText) + '</td>' +
            '<td data-label="Days Since">' + escapeHtml(daysText) + '</td>' +
            '<td data-label="Action">' +
            (canLogVisits()
              ? '<button type="button" class="unvisited-log-btn" data-bakery="' + escapeHtml(bName) + '">+ Log Visit</button>'
              : '') +
            '</td>' +
            '</tr>';
        }).join('');

        if (groupVal === 'none') {
          return bakeryRowsHtml;
        }

        return '<tr class="bakery-directory__group-row' + (isCollapsed ? ' collapsed' : '') + '" data-group-name="' + escapeHtml(groupName) + '">' +
          '<th scope="rowgroup" colspan="6">' +
          '<button type="button" class="bakery-directory__group-toggle" aria-expanded="' + (isCollapsed ? 'false' : 'true') + '">' +
          '<svg class="bakery-directory__group-chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3 3-3"/></svg>' +
          '<span>' + escapeHtml(groupName) + '</span>' +
          '<em>' + count + ' unvisited</em>' +
          '</button>' +
          '</th>' +
          '</tr>' +
          bakeryRowsHtml;
      }).join('');

      container.innerHTML =
        '<div class="table-wrap table-wrap--league table-wrap--floating table-wrap--directory table-wrap--unvisited">' +
        '<table class="bakery-directory unvisited-sites-table" data-table-fullscreen="off">' +
        '<caption>Unvisited sites</caption>' +
        '<thead><tr>' +
        '<th scope="col">Bakery</th>' +
        '<th scope="col">Ops Area</th>' +
        '<th scope="col">Region</th>' +
        '<th scope="col">Last Visit</th>' +
        '<th scope="col">Days Since</th>' +
        '<th scope="col"><span class="sr-only">Action</span></th>' +
        '</tr></thead>' +
        '<tbody>' + html + '</tbody>' +
        '</table></div>';
      syncVisitLogGroupToggle();
    } else if (view === 'followups') {
      var followStatus = window.GAILS._followUpStatusFilter || 'open';
      var allTasks = getFollowUpList();

      // Scope by search / region / ops / assignee (but NOT the status
      // sub-filter), so the summary's open/overdue counts stay stable as you
      // switch Open/Done/etc.
      function taskInScope(t) {
        if (!t.bakery) return false;
        var label = (G.getBakeryMapLabel ? G.getBakeryMapLabel(t.bakery) : t.bakery) || t.bakery;
        if (searchVal) {
          var hay = (label + ' ' + (t.title || '') + ' ' + (t.detail || '') + ' ' +
            followUpAttributionLabel(t)).toLowerCase();
          if (hay.indexOf(searchVal) === -1) return false;
        }
        if (!visitLogFilterMatches(regionVal, G.getBakeryRegion ? G.getBakeryRegion(t.bakery) : 'Unknown')) return false;
        if (!visitLogFilterMatches(opsVal, G.getBakeryOps ? G.getBakeryOps(t.bakery) : 'Unknown')) return false;
        if (!followUpTaskMatchesAssignee(t, followUpAssigneeVal)) return false;
        return true;
      }
      var scopeTasks = allTasks.filter(taskInScope);
      var openCount = scopeTasks.filter(function (t) { return !followUpIsDone(t); }).length;
      var overdueCount = scopeTasks.filter(followUpIsOverdue).length;

      var filteredTasks = scopeTasks.filter(function (t) {
        var done = followUpIsDone(t);
        if (followStatus === 'open') return !done;
        if (followStatus === 'done') return done;
        if (followStatus === 'overdue') return followUpIsOverdue(t);
        return true; // 'all'
      });

      // Apply the Follow-up Tasks-specific Group By and Sort By controls.
      var taskGroups = {};
      filteredTasks.forEach(function (t) {
        var key = getFollowUpGroupKey(t, followUpGroupVal);
        if (!taskGroups[key]) taskGroups[key] = [];
        taskGroups[key].push(t);
      });
      Object.keys(taskGroups).forEach(function (k) {
        taskGroups[k].sort(followUpTaskSorter(followUpSortVal));
      });
      var taskGroupsSorted = Object.keys(taskGroups).sort(followUpGroupSorter(followUpGroupVal));

      window.GAILS._visitLogExport = withLazyRows({
        title: 'GAIL’s — Follow-Up Actions',
        sheetName: 'Follow-Ups',
        filename: buildExportFilename('Follow-Up Actions'),
        meta: baseExportMeta().concat([
          ['Status filter', FOLLOW_UP_STATUS_LABELS[followStatus] || 'All'],
          ['Assigned to', exportFilterLabel('followUpAssignee', 'All')],
          ['Grouped by', exportFilterLabel('followUpGroup', 'Bakery')],
          ['Sorted by', exportFilterLabel('followUpSort', 'Due Date (Soonest)')],
          ['Tasks exported', filteredTasks.length],
          ['Open (all statuses)', openCount],
          ['Overdue (all statuses)', overdueCount]
        ]),
        columns: [
          { label: 'Bakery', type: 'text', width: 26 },
          { label: 'Region', type: 'text', width: 16 },
          { label: 'Ops Area', type: 'text', width: 18 },
          { label: 'Action', type: 'text', width: 34 },
          { label: 'Detail', type: 'text', width: 60 },
          { label: 'Priority', type: 'text', width: 10 },
          { label: 'Due Date', type: 'date', width: 13 },
          { label: 'Days Overdue', type: 'number', width: 13 },
          { label: 'Status', type: 'text', width: 10 },
          { label: 'Added', type: 'date', width: 12 },
          { label: 'Completed', type: 'date', width: 13 },
          { label: 'Assigned To', type: 'text', width: 24 }
        ],
        rowCount: filteredTasks.length
      // Bakery groups are ordered on screen; the export follows the same
      // sequence so the two can be read side by side.
      }, function () {
        return taskGroupsSorted.reduce(function (rows, groupName) {
          return rows.concat(taskGroups[groupName]);
        }, []).map(function (t) {
          var due = dueMeta(t.dueDate);
          return [
            G.getBakeryMapLabel ? G.getBakeryMapLabel(t.bakery) : t.bakery,
            G.getBakeryRegion ? G.getBakeryRegion(t.bakery) : '',
            G.getBakeryOps ? G.getBakeryOps(t.bakery) : '',
            t.title || '',
            t.detail || '',
            PRIORITY_LABELS[normalizePriority(t.priority)],
            t.dueDate || '',
            followUpIsOverdue(t) ? Math.abs(due.days) : '',
            followUpIsDone(t) ? 'Done' : (followUpIsOverdue(t) ? 'Overdue' : 'Open'),
            t.createdAt ? t.createdAt.slice(0, 10) : '',
            t.completedAt ? t.completedAt.slice(0, 10) : '',
            followUpAttributionLabel(t)
          ];
        });
      });

      if (filteredTasks.length === 0) {
        window.GAILS._visitLogCurrentGroupNames = [];
        renderFollowUpSummary(0, openCount, overdueCount, false);
        var emptyMsg = followStatus === 'done'
          ? 'No completed follow-ups match your filters.'
          : (followStatus === 'overdue'
            ? 'No overdue follow-ups — nicely on top of it!'
            : 'No open follow-ups. Raise one from a check-in or with “+ Add task”.');
        container.innerHTML = '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#9989;</div><p>' + emptyMsg + '</p></div>';
        return;
      }

      var flatten = followUpGroupVal === 'none';
      window.GAILS._visitLogCurrentGroupNames = flatten ? [] : taskGroupsSorted.slice();
      renderFollowUpSummary(filteredTasks.length, openCount, overdueCount, !flatten);

      var collapsedTasks = window.GAILS._visitLogCollapsedGroups = window.GAILS._visitLogCollapsedGroups || {};

      // Table row for one task. Bakery + Ops Area always show the real site
      // (not the active group heading) so the row still identifies itself
      // when read out of context — same convention as the Visit History table.
      function followUpRowHtml(t, groupName, hidden) {
        var done = followUpIsDone(t);
        var m = dueMeta(t.dueDate);
        var bakeryLabel = followUpBakeryLabel(t) || 'Unknown bakery';
        var opsLabel = (G.getBakeryOps ? G.getBakeryOps(t.bakery) : '') || 'Unknown ops area';
        var detailText = t.detail || '';
        if (detailText.length > 140) detailText = detailText.slice(0, 140) + '…';
        var attributionLabel = followUpAttributionLabel(t) || 'Unassigned';
        var groupAttr = groupName ? ' data-group="' + escapeHtml(groupName) + '"' : '';

        var dueHtml = done
          ? '<span class="follow-up-pill follow-up-pill--done">Done</span>' +
            (t.completedAt ? '<span class="follow-up-table__meta">Completed ' + escapeHtml(formatFollowUpDate(t.completedAt)) + '</span>' : '')
          : (t.dueDate
            ? '<span class="follow-up-pill follow-up-pill--' + m.state + '">' + escapeHtml(m.label) + '</span>' +
              (t.createdAt ? '<span class="follow-up-table__meta">Added ' + escapeHtml(formatFollowUpDate(t.createdAt)) + '</span>' : '')
            : '<span class="follow-up-table__muted">No deadline</span>');

        return '<tr class="follow-up-table__row' + (done ? ' follow-up-table__row--done' : '') + '"' + groupAttr + (hidden ? ' hidden' : '') + '>' +
          '<th scope="row" data-label="Bakery"><div class="visit-log-row__bakery-col">' +
          '<h3 class="visit-log-row__bakery">' + escapeHtml(bakeryLabel) + '</h3>' +
          '<span class="visit-log-row__manager">Ops Area: ' + escapeHtml(opsLabel) + '</span>' +
          '</div></th>' +
          '<td data-label="Action"><div class="follow-up-table__task">' +
          '<span class="follow-up-table__title">' + escapeHtml(t.title || 'Untitled task') + '</span>' +
          (detailText ? '<span class="follow-up-table__detail">' + escapeHtml(detailText) + '</span>' : '') +
          '</div></td>' +
          '<td data-label="Priority">' + (priorityTagHtml(t) || '<span class="follow-up-table__muted">—</span>') + '</td>' +
          '<td data-label="Due"><div class="follow-up-table__due-col">' + dueHtml + '</div></td>' +
          '<td data-label="Assigned To">' + escapeHtml(attributionLabel) + '</td>' +
          '<td data-label="Actions"><div class="follow-up-table__action-col">' +
          '<button type="button" class="follow-up-item__check' + (done ? ' checked' : '') + '" role="checkbox" aria-checked="' + done + '"' +
          ' data-followup-toggle="' + escapeHtml(t.id) + '" title="' + (done ? 'Mark as open' : 'Mark as done') + '" aria-label="' + (done ? 'Mark as open' : 'Mark as done') + '">' +
          (done ? '&#10003;' : '') + '</button>' +
          '<button type="button" class="follow-up-table__btn" data-followup-edit="' + escapeHtml(t.id) + '">Edit</button>' +
          '<button type="button" class="follow-up-table__btn follow-up-table__btn--danger" data-followup-delete="' + escapeHtml(t.id) + '">Delete</button>' +
          '</div></td>' +
          '</tr>';
      }

      var bodyHtml;
      if (flatten) {
        bodyHtml = (taskGroups[taskGroupsSorted[0]] || []).map(function (t) {
          return followUpRowHtml(t, null, false);
        }).join('');
      } else {
        bodyHtml = taskGroupsSorted.map(function (groupName) {
          var tasks = taskGroups[groupName];
          var isCollapsed = !!collapsedTasks[groupName];
          var rowsHtml = tasks.map(function (t) { return followUpRowHtml(t, groupName, isCollapsed); }).join('');
          return '<tr class="bakery-directory__group-row' + (isCollapsed ? ' collapsed' : '') + '" data-group-name="' + escapeHtml(groupName) + '">' +
            '<th scope="rowgroup" colspan="6">' +
            '<button type="button" class="bakery-directory__group-toggle" aria-expanded="' + (isCollapsed ? 'false' : 'true') + '">' +
            '<svg class="bakery-directory__group-chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3 3-3"/></svg>' +
            '<span>' + escapeHtml(groupName) + '</span>' +
            '<em>' + tasks.length + ' follow-up' + (tasks.length === 1 ? '' : 's') + '</em>' +
            '</button>' +
            '</th>' +
            '</tr>' + rowsHtml;
        }).join('');
      }

      container.innerHTML =
        '<div class="table-wrap table-wrap--league table-wrap--floating table-wrap--directory table-wrap--follow-ups">' +
        '<table class="bakery-directory follow-up-table" data-table-fullscreen="off">' +
        '<caption>Follow-up tasks</caption>' +
        '<thead><tr>' +
        '<th scope="col">Bakery</th>' +
        '<th scope="col">Action</th>' +
        '<th scope="col">Priority</th>' +
        '<th scope="col">Due</th>' +
        '<th scope="col">Assigned To</th>' +
        '<th scope="col"><span class="sr-only">Actions</span></th>' +
        '</tr></thead>' +
        '<tbody>' + bodyHtml + '</tbody></table></div>';
      syncVisitLogGroupToggle();
    }

    // Banner is updated at the start of renderVisitLog
  };

  // Site directory uploads arrive independently of visit data. Refresh the
  // Region/Ops options and the visible bakery directory as soon as the shared
  // metadata (including regional coffee-team assignments) changes.
  if (window.addEventListener) {
    window.addEventListener('gails:site-meta-sync', function () {
      window.GAILS._visitLogFiltersPopulated = false;
      if (window.GAILS._activeVisitLogView === 'bakeries') {
        window.GAILS.renderVisitLog();
      }
    });
  }
})();
