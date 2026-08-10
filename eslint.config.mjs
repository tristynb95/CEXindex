import js from '@eslint/js';
import globals from 'globals';

// This project has no build step. js/ is split into two worlds:
//   - Classic <script> files that share state through the window.GAILS
//     namespace and depend on the load order in index.html / admin.html.
//   - Real ES modules (type="module"), which import each other directly.
// They need different parser settings, hence the two blocks below.
const ESM_FILES = [
  'js/admin-page.js',
  'js/auth.js',
  'js/firebase-config.js',
  'js/bakery-profile.js',
  'js/my-activity.js',
  'js/my-team.js',
  'js/notification-centre.js',
  'js/notification-write.js',
  'js/permissions.js',
  'js/profile-menu.js',
  'js/profile-page.js',
  'js/standalone-profile-menu.js',
  'js/visit-feed.js',
  'js/dataset-cache.js'
];

// Third-party globals loaded from CDN <script> tags rather than npm.
const VENDOR_GLOBALS = {
  Chart: 'readonly',     // Chart.js       (index.html)
  XLSX: 'readonly',      // SheetJS        (index.html, admin.html)
  L: 'readonly',         // Leaflet        (index.html)
  pdfjsLib: 'readonly'   // pdf.js         (admin.html)
};

// This config is a ratchet, not a rewrite: it is deliberately tuned so a clean
// checkout reports ZERO errors. That way `npm run lint` is a meaningful gate —
// anything it fails on is something you just introduced.
//
// no-undef is the rule worth having here. With ~20 classic scripts sharing one
// window.GAILS namespace and a load order hand-maintained across 19 <script>
// tags in index.html, it is what catches a typo'd or not-yet-loaded global.
// It currently passes cleanly, so keep it at error.
//
// The rules below are demoted because every current violation was inspected and
// is pre-existing and deliberate, not a defect:
//   no-redeclare     — 36 hits, all ES5 function-scoped `var` reused across
//                      branches. Legal and idiomatic for this codebase's style.
//   no-unreachable   — 8 hits, all in js/app.js, from gestures switched off
//                      with an early `return` and a comment explaining why.
//   no-func-assign   — js/app.js deliberately monkey-patches `refresh` to sync
//                      the filter badge.
//   no-useless-escape— harmless over-escaping (\- in a class, \/ in a regex);
//                      behaviour is identical.
// Demoted to warn (not off) so they stay visible without blocking the gate.
const BASELINE_RULES = {
  'no-undef': 'error',
  'no-redeclare': 'warn',
  'no-unreachable': 'warn',
  'no-func-assign': 'warn',
  'no-useless-escape': 'warn',
  'no-unused-vars': ['warn', { args: 'none' }],
  // `catch (e) {}` is used intentionally around localStorage and Analytics,
  // which throw in private browsing / in-app browsers.
  'no-empty': ['warn', { allowEmptyCatch: true }]
};

export default [
  {
    ignores: [
      'node_modules/**',
      '.firebase/**',
      'tmp/**',
      'apps-script/**' // Google Apps Script, a separate runtime with its own globals
    ]
  },

  // Classic scripts: shared globals, load-order dependent.
  {
    ...js.configs.recommended,
    files: ['js/**/*.js'],
    ignores: ESM_FILES,
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...VENDOR_GLOBALS,
        GAILS: 'writable' // the shared namespace, defined in js/state.js
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...BASELINE_RULES
    }
  },

  // ES modules.
  {
    ...js.configs.recommended,
    files: ESM_FILES,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...VENDOR_GLOBALS,
        GAILS: 'readonly' // modules read the namespace but never define it
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...BASELINE_RULES
    }
  }
];
