/* Shared kitchen timer engine.
   Include on any recipe page with:  <script src="../assets/timer.js"></script>
   Works with markup:  <span class="step-timer" data-seconds="1200"></span>

   - Timers are stored as an absolute end timestamp in localStorage, so they
     stay accurate across reloads, background tabs, and navigating to other
     pages on the site (no drift, no reset).
   - A small floating pill appears in the bottom-right corner of EVERY page
     on the site while a timer is running, so you can navigate away from the
     recipe and still see it counting down. Tapping the pill jumps back to
     the recipe it belongs to.
*/
(function () {
  var STORAGE_PREFIX = 'kitchen-timer:';
  var PAGE_KEY = location.pathname.replace(/[^a-z0-9]/gi, '-');
  var PAGE_TITLE = document.title.split(' — ')[0].split(' - ')[0];

  function allTimerKeys() {
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(STORAGE_PREFIX) === 0) keys.push(k);
    }
    return keys;
  }

  function format(s) {
    s = Math.max(0, s);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  /* ---------- per-step timer buttons on this page ---------- */

  function initStepTimers() {
    var timers = document.querySelectorAll('.step-timer');
    timers.forEach(function (el, index) {
      var totalSeconds = parseInt(el.dataset.seconds, 10);
      var storageKey = STORAGE_PREFIX + PAGE_KEY + ':' + index;
      var intervalId = null;
      var state = 'idle'; // idle | running | paused | done
      var remaining = totalSeconds;

      function save() {
        if (state === 'running') {
          var endTime = Date.now() + remaining * 1000;
          localStorage.setItem(storageKey, JSON.stringify({
            state: 'running',
            endTime: endTime,
            totalSeconds: totalSeconds,
            pageTitle: PAGE_TITLE,
            pageUrl: location.pathname + location.search
          }));
        } else if (state === 'paused') {
          localStorage.setItem(storageKey, JSON.stringify({
            state: 'paused',
            remaining: remaining,
            totalSeconds: totalSeconds,
            pageTitle: PAGE_TITLE,
            pageUrl: location.pathname + location.search
          }));
        } else {
          localStorage.removeItem(storageKey);
        }
      }

      function render() {
        el.classList.remove('running', 'done');
        if (state === 'running') {
          el.classList.add('running');
          el.innerHTML = '<span class="timer-icon">\u275A\u275A</span> ' + format(remaining);
        } else if (state === 'done') {
          el.classList.add('done');
          el.innerHTML = '<span class="timer-icon">\u2713</span> Done';
        } else {
          el.innerHTML = '<span class="timer-icon">\u25B6</span> ' + format(remaining);
        }
      }

      function finish() {
        remaining = 0;
        clearInterval(intervalId);
        state = 'done';
        save();
        render();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        setTimeout(function () {
          state = 'idle';
          remaining = totalSeconds;
          save();
          render();
        }, 6000);
      }

      function tick(endTime) {
        remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
        if (remaining <= 0) { finish(); return; }
        render();
      }

      function start(fromRemaining) {
        remaining = fromRemaining;
        state = 'running';
        var endTime = Date.now() + remaining * 1000;
        save();
        render();
        intervalId = setInterval(function () { tick(endTime); }, 1000);
      }

      el.addEventListener('click', function () {
        if (state === 'idle' || state === 'paused') {
          start(remaining);
        } else if (state === 'running') {
          clearInterval(intervalId);
          state = 'paused';
          save();
          render();
        } else if (state === 'done') {
          clearInterval(intervalId);
          state = 'idle';
          remaining = totalSeconds;
          save();
          render();
        }
      });

      // Exposed so other scripts (e.g. a portion/size switcher) can retarget
      // this timer's duration. Only takes effect while idle, so it never
      // disrupts a countdown already in progress.
      el._timerAPI = {
        setSeconds: function (newTotal) {
          totalSeconds = newTotal;
          if (state === 'idle') {
            remaining = newTotal;
            render();
          }
        }
      };

      // Restore on load.
      var saved = null;
      try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch (e) {}

      if (saved && saved.state === 'running') {
        var msLeft = saved.endTime - Date.now();
        if (msLeft > 0) {
          remaining = Math.round(msLeft / 1000);
          state = 'running';
          render();
          intervalId = setInterval(function () { tick(saved.endTime); }, 1000);
        } else {
          finish();
        }
      } else if (saved && saved.state === 'paused') {
        remaining = saved.remaining;
        state = 'paused';
        render();
      } else {
        render();
      }
    });
  }

  /* ---------- site-wide floating widget ---------- */

  var widgetStyle = document.createElement('style');
  widgetStyle.textContent =
    '.kitchen-timer-widget{position:fixed;right:16px;bottom:16px;z-index:9999;' +
    'display:flex;flex-direction:column;gap:8px;align-items:flex-end;}' +
    '.kitchen-timer-pill{font-family:"Jost",sans-serif;font-size:12px;font-weight:500;' +
    'letter-spacing:0.02em;background:#1c2b24;color:#fffef9;border-radius:22px;' +
    'padding:10px 18px;box-shadow:0 4px 16px rgba(0,0,0,0.22);cursor:pointer;' +
    'display:flex;align-items:center;gap:8px;text-decoration:none;' +
    'transition:transform 0.15s;max-width:260px;}' +
    '.kitchen-timer-pill:hover{transform:translateY(-1px);}' +
    '.kitchen-timer-pill .kt-dot{width:6px;height:6px;border-radius:50%;background:#7a9e8e;flex-shrink:0;}' +
    '.kitchen-timer-pill.kt-done .kt-dot{background:#c85c3f;}' +
    '.kitchen-timer-pill .kt-time{font-family:"Playfair Display",serif;font-size:14px;flex-shrink:0;}' +
    '.kitchen-timer-pill .kt-label{opacity:0.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}';
  document.head.appendChild(widgetStyle);

  var widgetEl = null;

  function ensureWidget() {
    if (!widgetEl) {
      widgetEl = document.createElement('div');
      widgetEl.className = 'kitchen-timer-widget';
      document.body.appendChild(widgetEl);
    }
    return widgetEl;
  }

  function refreshWidget() {
    var keys = allTimerKeys();
    var entries = [];

    keys.forEach(function (key) {
      var data = null;
      try { data = JSON.parse(localStorage.getItem(key)); } catch (e) {}
      if (!data) return;

      // Don't show a pill for the page you're already on — its own inline
      // step-timer button is visible right there.
      var onThisPage = data.pageUrl === (location.pathname + location.search);
      if (onThisPage) return;

      if (data.state === 'running') {
        var remaining = Math.round((data.endTime - Date.now()) / 1000);
        if (remaining <= 0) {
          entries.push({ key: key, done: true, data: data });
        } else {
          entries.push({ key: key, done: false, remaining: remaining, data: data });
        }
      }
    });

    if (entries.length === 0) {
      if (widgetEl) widgetEl.innerHTML = '';
      return;
    }

    var el = ensureWidget();
    el.innerHTML = '';
    entries.forEach(function (entry) {
      var pill = document.createElement('a');
      pill.className = 'kitchen-timer-pill' + (entry.done ? ' kt-done' : '');
      pill.href = entry.data.pageUrl || '#';
      var timeLabel = entry.done ? 'Done' : format(entry.remaining);
      pill.innerHTML =
        '<span class="kt-dot"></span>' +
        '<span class="kt-time">' + timeLabel + '</span>' +
        '<span class="kt-label">' + (entry.data.pageTitle || 'Timer') + '</span>';
      el.appendChild(pill);
    });
  }

  setInterval(refreshWidget, 1000);

  /* ---------- keep screen awake on recipe pages ---------- */

  /* Safari/WebKit (which every iOS browser, including Chrome, is required
     to use) only grants a wake lock if request() is called directly inside
     a tap/click handler — it silently rejects one fired on page load.
     Chromium browsers on desktop/Android don't have that restriction, but
     a tap-triggered toggle works everywhere, so we use one for all. */

  function initWakeLock() {
    if (!('wakeLock' in navigator)) return;

    var style = document.createElement('style');
    style.textContent =
      '.kt-wakelock-btn{position:fixed;right:16px;top:16px;z-index:9999;' +
      'font-family:"Jost",sans-serif;font-size:12px;font-weight:500;' +
      'letter-spacing:0.02em;background:#fffef9;color:#1c2b24;' +
      'border:1px solid #d8d2c4;border-radius:22px;padding:9px 16px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.12);cursor:pointer;' +
      'display:flex;align-items:center;gap:7px;transition:transform 0.15s,background 0.15s;}' +
      '.kt-wakelock-btn:hover{transform:translateY(-1px);}' +
      '.kt-wakelock-btn .kt-wl-dot{width:6px;height:6px;border-radius:50%;background:#c9c2b2;flex-shrink:0;}' +
      '.kt-wakelock-btn.kt-wl-on{background:#7a9e8e;color:#fffef9;border-color:#7a9e8e;}' +
      '.kt-wakelock-btn.kt-wl-on .kt-wl-dot{background:#fffef9;}';
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kt-wakelock-btn';
    btn.innerHTML = '<span class="kt-wl-dot"></span><span class="kt-wl-label">Keep screen on</span>';
    document.body.appendChild(btn);

    var wakeLock = null;
    var wantsOn = false;

    function setLabel(text) {
      btn.querySelector('.kt-wl-label').textContent = text;
    }

    function requestWakeLock() {
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLock = lock;
        btn.classList.add('kt-wl-on');
        setLabel('Screen staying on');
        wakeLock.addEventListener('release', function () {
          wakeLock = null;
          btn.classList.remove('kt-wl-on');
          setLabel(wantsOn ? 'Keep screen on' : 'Keep screen on');
        });
      }).catch(function () {
        wantsOn = false;
        btn.classList.remove('kt-wl-on');
        setLabel('Keep screen on');
      });
    }

    btn.addEventListener('click', function () {
      if (wakeLock) {
        wantsOn = false;
        wakeLock.release();
      } else {
        wantsOn = true;
        requestWakeLock();
      }
    });

    // Re-acquire when returning to the tab, since the system releases the
    // lock whenever the page is backgrounded — but only if the person had
    // turned it on, and only the tap that turned it on needs the gesture.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && wantsOn && !wakeLock) {
        requestWakeLock();
      }
    });
  }

  /* ---------- init ---------- */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initStepTimers();
      refreshWidget();
      initWakeLock();
    });
  } else {
    initStepTimers();
    refreshWidget();
    initWakeLock();
  }
})();
