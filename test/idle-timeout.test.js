const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// js/idle-timeout.js is an ES module that imports the Firebase auth SDK over
// https, so it cannot simply be imported here. Its imports and export keywords
// are stripped and the body is run in a vm with a fake window, which lets the
// clock, storage and DOM be driven directly — the timing rules are the whole
// point of the module, so they are tested for real rather than grepped for.
function loadIdleTimeout(overrides) {
  // `const` declarations stay lexically scoped inside a vm script rather than
  // landing on the context, so the config object is handed out explicitly.
  const source = read('js/idle-timeout.js')
    .replace(/^import[^;]+;$/gm, '')
    .replace(/^export /gm, '')
    + '\nglobalThis.IDLE_TIMEOUT_CONFIG = IDLE_TIMEOUT_CONFIG;\n';

  const signedOut = [];
  const noteSignOutReason = (reason) => { signedOut.push(reason); };

  let now = 1000000;
  const storage = new Map();
  const listeners = new Map();
  let intervalFn = null;
  const focused = [];

  function makeElement() {
    const element = {
      className: '', id: '', hidden: false, innerHTML: '', textContent: '',
      parentNode: null, children: [],
      handlers: {},
      addEventListener(name, handler) { element.handlers[name] = handler; },
      focus() { focused.push(element); },
      querySelector(selector) {
        if (!element.parts) element.parts = {};
        if (!element.parts[selector]) element.parts[selector] = makeElement();
        return element.parts[selector];
      }
    };
    return element;
  }

  const body = makeElement();
  body.appendChild = (child) => { child.parentNode = body; body.children.push(child); };
  body.removeChild = (child) => {
    child.parentNode = null;
    body.children = body.children.filter((entry) => entry !== child);
  };

  const context = {
    console: { warn() {} },
    Date: { now: () => now },
    Math,
    Number,
    String,
    isFinite,
    noteSignOutReason,
    signOut: () => Promise.resolve(),
    document: { createElement: () => makeElement(), body },
    window: {
      localStorage: {
        getItem: (key) => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => { storage.set(key, value); }
      },
      addEventListener(name, handler) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(handler);
      },
      removeEventListener(name, handler) {
        const bucket = listeners.get(name) || [];
        listeners.set(name, bucket.filter((entry) => entry !== handler));
      },
      setInterval: (fn) => { intervalFn = fn; return 1; },
      clearInterval: () => { intervalFn = null; }
    }
  };
  Object.assign(context, overrides || {});
  vm.runInNewContext(source, context);

  const auth = { currentUser: { getIdToken: () => Promise.resolve('token') } };
  const timer = context.startIdleTimeout(auth);
  const modal = body.children[0] || null;

  return {
    config: context.IDLE_TIMEOUT_CONFIG,
    timer,
    signedOut,
    storage,
    focused,
    body,
    dialogue: () => body.children[0] || modal,
    countdown: () => {
      const surface = body.children[0];
      return surface ? surface.querySelector('[data-idle-countdown]').textContent : '';
    },
    advance(ms) { now += ms; },
    tick() { if (intervalFn) intervalFn(); },
    fireActivity() { (listeners.get('pointerdown') || []).forEach((fn) => fn()); },
    fireStorage(key, value) {
      if (value !== undefined) storage.set(key, String(value));
      (listeners.get('storage') || []).forEach((fn) => fn({ key }));
    },
    click(selector) {
      const surface = body.children[0];
      surface.querySelector(selector).handlers.click();
    }
  };
}

test('the deadline is one hour, with the dialogue five minutes ahead of it', () => {
  const harness = loadIdleTimeout();
  assert.equal(harness.config.IDLE_LIMIT_MS, 60 * 60 * 1000);
  assert.equal(harness.config.WARNING_MS, 5 * 60 * 1000);
});

test('an idle hour signs the person out with the idle reason recorded', () => {
  const harness = loadIdleTimeout();
  harness.advance(60 * 60 * 1000);
  harness.tick();
  assert.deepEqual(harness.signedOut, ['idle']);
});

test('nothing happens while there is still time on the clock', () => {
  const harness = loadIdleTimeout();
  harness.advance(50 * 60 * 1000);
  harness.tick();
  assert.deepEqual(harness.signedOut, []);
  assert.equal(harness.body.children.length, 0);
});

test('the dialogue appears five minutes out and counts down', () => {
  const harness = loadIdleTimeout();
  harness.advance(55 * 60 * 1000);
  harness.tick();
  assert.equal(harness.dialogue().hidden, false);
  assert.equal(harness.countdown(), '5:00');
  assert.deepEqual(harness.signedOut, []);

  harness.advance(4 * 60 * 1000 + 30 * 1000);
  harness.tick();
  assert.equal(harness.countdown(), '0:30');
});

test('the extend button is focused when the dialogue opens', () => {
  const harness = loadIdleTimeout();
  harness.advance(55 * 60 * 1000);
  harness.tick();
  assert.equal(harness.focused.length, 1);
  // Still the same open dialogue, so focus is not stolen back on every tick.
  harness.advance(1000);
  harness.tick();
  assert.equal(harness.focused.length, 1);
});

test('staying signed in closes the dialogue and buys another full hour', () => {
  const harness = loadIdleTimeout();
  harness.advance(56 * 60 * 1000);
  harness.tick();
  assert.equal(harness.dialogue().hidden, false);

  harness.click('[data-idle-extend]');
  assert.equal(harness.dialogue().hidden, true);

  harness.advance(59 * 60 * 1000);
  harness.tick();
  assert.deepEqual(harness.signedOut, [], 'the clock restarted from the click');

  harness.advance(60 * 1000);
  harness.tick();
  assert.deepEqual(harness.signedOut, ['idle']);
});

test('signing out from the dialogue leaves no idle notice to explain', () => {
  const harness = loadIdleTimeout();
  harness.advance(56 * 60 * 1000);
  harness.tick();
  harness.click('[data-idle-sign-out]');
  assert.deepEqual(harness.signedOut, [], 'they chose it, so there is nothing to explain');
});

test('activity does not dismiss a dialogue that is already up', () => {
  const harness = loadIdleTimeout();
  harness.advance(56 * 60 * 1000);
  harness.tick();
  assert.equal(harness.dialogue().hidden, false);

  harness.fireActivity();
  harness.tick();
  assert.equal(harness.dialogue().hidden, false, 'only the button may extend it');
});

test('ordinary activity before the warning keeps the session alive silently', () => {
  const harness = loadIdleTimeout();
  harness.advance(30 * 60 * 1000);
  harness.fireActivity();
  harness.tick();
  assert.equal(harness.body.children.length, 0);

  harness.advance(50 * 60 * 1000);
  harness.tick();
  assert.deepEqual(harness.signedOut, [], 'the activity reset the hour');
});

test('being active in another tab calls off this one', () => {
  const harness = loadIdleTimeout();
  harness.advance(56 * 60 * 1000);
  harness.tick();
  assert.equal(harness.dialogue().hidden, false);

  // A sibling tab writes the shared activity stamp.
  harness.fireStorage('gails:lastActivityAt', 1000000 + 56 * 60 * 1000);
  assert.equal(harness.dialogue().hidden, true);
  assert.deepEqual(harness.signedOut, []);
});

test('activity writes are throttled rather than hitting storage on every event', () => {
  const harness = loadIdleTimeout();
  const first = harness.storage.get('gails:lastActivityAt');
  harness.advance(5 * 1000);
  harness.fireActivity();
  assert.equal(harness.storage.get('gails:lastActivityAt'), first, 'within the throttle window');

  harness.advance(30 * 1000);
  harness.fireActivity();
  assert.notEqual(harness.storage.get('gails:lastActivityAt'), first);
});

test('stopping the timer unhooks its listeners and removes the dialogue', () => {
  const harness = loadIdleTimeout();
  harness.advance(56 * 60 * 1000);
  harness.tick();
  assert.equal(harness.body.children.length, 1);

  harness.timer.stop();
  assert.equal(harness.body.children.length, 0);
  harness.advance(60 * 60 * 1000);
  harness.tick();
  assert.deepEqual(harness.signedOut, [], 'a stopped timer cannot sign anyone out');
});

test('every signed-in page starts the idle timer', () => {
  [
    'js/auth.js', 'js/admin-page.js', 'js/bakery-profile.js',
    'js/my-activity.js', 'js/my-team.js', 'js/profile-page.js'
  ].forEach((name) => {
    const source = read(name);
    assert.match(source, /import \{ trackIdleTimeout \} from '\.\/idle-timeout\.js'/, name);
    assert.match(source, /trackIdleTimeout\((?:primaryAuth|auth), user\)/, name);
  });
});

test('the login screen explains an idle sign-out in plain words', () => {
  const notice = read('js/sign-out-notice.js');
  assert.match(notice, /idle: 'You were signed out after a period of inactivity/);
  assert.match(read('js/auth.js'), /var signOutNotice = consumeSignOutNotice\(\);/);
});

test('the dialogue follows the modal kit and warns in amber, not red', () => {
  const css = read('css/styles.css');
  const block = css.slice(css.indexOf('.idle-modal__surface {'));
  assert.match(block, /border-top: 3px solid var\(--gold\)/);
  assert.match(block, /border-radius: 20px/);
  assert.match(block, /border: 1px solid var\(--card-border-h\)/);
  assert.match(css, /\.idle-modal__countdown-value \{[^}]*font-variant-numeric: tabular-nums/s);

  const script = read('js/idle-timeout.js');
  assert.match(script, /role="alertdialog"/);
  assert.match(script, /aria-labelledby="idleTimeoutTitle"/);
});
