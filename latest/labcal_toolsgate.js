(window.LabCalBuild = window.LabCalBuild || {})['labcal_toolsgate.js'] = 'v1.640';  // file version — see labcal_build.js
/* ---------------------------------------------------------------------
   LabCal — Tools behind the PIN or the office password (v1.637)
   ---------------------------------------------------------------------
   Radek: everything under Tools needs the engineers' PIN or the office
   password — the Tools page itself AND every tool it opens, also when the
   tool's address is opened directly:
     tools.html, data_logger_viewer.html, pdf_merge_reorder.html,
     calibration.html#combine (Combine job packs),
     calibration.html#strays  (Stray saved worksheets).
   The rest of calibration.html (the job list) is NOT behind it.

   Once unlocked, the Tools pages do not ask again in this tab for
   UNLOCK_MIN minutes; every Tools page opened in that time starts the
   minutes again. Kept in sessionStorage (per tab, never shared, nothing
   about the PIN or password itself is stored).

   Must be loaded in <head> AFTER labcal_pin.js and BEFORE the page's own
   scripts (calibration.html reads #combine / #strays while it loads).

   LabCal is a public web app: this is a "you need to know the code" step,
   like the PIN in front of Settings — not protection against someone who
   reads the page's code.
   --------------------------------------------------------------------- */
(function (global) {
  'use strict';
  var KEY = 'labcal.tools.ok';          // sessionStorage: unlocked-until (ms)
  var UNLOCK_MIN = 30;
  var doc = global.document;
  var PAGE = (String(global.location.pathname || '').split('/').pop() || 'index.html').toLowerCase();
  var GATED_PAGES = { 'tools.html': 1, 'data_logger_viewer.html': 1, 'pdf_merge_reorder.html': 1 };
  var HASH_TOOLS = /(?:^|[#&])(combine|strays)(?:[=&]|$)/;

  function ss() { try { return global.sessionStorage; } catch (e) { return null; } }
  function unlockedUntil() { try { var v = Number(ss().getItem(KEY)); return isFinite(v) ? v : 0; } catch (e) { return 0; } }
  function isUnlocked() { return unlockedUntil() > Date.now(); }
  function touch() { try { ss().setItem(KEY, String(Date.now() + UNLOCK_MIN * 60000)); } catch (e) {} }
  function lock() { try { ss().removeItem(KEY); } catch (e) {} }

  function ask() {
    if (!global.LabCalPin || !global.LabCalPin.ask) {
      global.alert('The PIN pad (labcal_pin.js) did not load, so Tools cannot be opened. Reload LabCal while online.');
      return Promise.resolve(false);
    }
    return global.LabCalPin.ask({
      title: 'Tools',
      message: 'Engineers: enter the 4-digit PIN. Office: tap "Office password".',
      allowPassword: true
    }).then(function (ok) { if (ok) touch(); return ok; });
  }

  function onReady(fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  // ---- whole page behind the gate ------------------------------------------
  function gatePage() {
    if (isUnlocked()) { touch(); return; }
    var html = doc.documentElement;
    html.classList.add('lc-tools-locked');
    var st = doc.createElement('style');
    st.id = 'lcToolsGateStyle';
    st.textContent = 'html.lc-tools-locked body>*:not(#lcPinOverlay){visibility:hidden!important}' +
      'html.lc-tools-locked body{background:#eef2f7}';
    (doc.head || html).appendChild(st);
    onReady(function () {
      ask().then(function (ok) {
        if (ok) { html.classList.remove('lc-tools-locked'); return; }
        global.location.replace('index.html');
      });
    });
  }

  // ---- calibration.html#combine / #strays -----------------------------------
  // The job list itself stays open; only the Tools panel needs the code. The
  // hash is taken off before the page reads it, and put back (with a reload)
  // after the right PIN / password.
  function gateHash() {
    var h = String(global.location.hash || '');
    var m = h.match(HASH_TOOLS);
    if (!m) return;
    if (isUnlocked()) { touch(); return; }
    var want = m[1];
    try { global.history.replaceState(null, '', global.location.pathname + global.location.search); } catch (e) {}
    onReady(function () {
      ask().then(function (ok) {
        if (!ok) return;                      // stay on the job list
        global.location.replace(global.location.pathname + global.location.search + '#' + want);
        if (String(global.location.hash || '') === '#' + want) global.location.reload();
      });
    });
  }

  if (GATED_PAGES[PAGE]) gatePage();
  else if (PAGE === 'calibration.html') gateHash();

  global.LabCalToolsGate = {
    isUnlocked: isUnlocked, lock: lock, ask: ask,
    UNLOCK_MIN: UNLOCK_MIN, KEY: KEY
  };
})(typeof window !== 'undefined' ? window : this);
