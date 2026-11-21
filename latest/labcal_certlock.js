(window.LabCalBuild = window.LabCalBuild || {})['labcal_certlock.js'] = 'v1.643';  // file version — see labcal_build.js
/* ---------------------------------------------------------------------
   LabCal — a certified unit's worksheet is LOCKED (v1.638)
   ---------------------------------------------------------------------
   Radek (20 Nov 2026): once a certificate has been made it must not be
   changed by accident.
   • Generate PDF → the worksheet locks straight away. When the PDF has gone
     out (Save / Share / Download, or the save bar closed) the certificate is
     shown in LabCal with "Back to job" (and "Next unit").
   • A worksheet opened for a certified unit (side panel, Live probes, an
     old tab, a typed serial…) opens locked: green bar "Certificate … —
     locked", View certificate / Back to job.
   • Locked = every field and button of the form off, Generate PDF hidden,
     signature pads off, and nothing is written to the unit's saved
     worksheet (LabCalUnits.saveForm asks isPageLocked()).
   • The only way to change it: job list → Re-issue → PIN. That sets the
     unit's "reopen" flag (labcal_jobsheet.js reopenUnit); the worksheet is
     then open as before, and the next certificate (rev 2, …) locks it again.
   Navigation (Back / Home / unit ▾ / side menu), the save bar and the
   certificate viewer stay usable.

   Tests: localStorage 'labcal.certlock.off' = '1' switches all of this off
   (the older test groups run the pre-v1.638 flow; group 74 tests the lock).
   No calculation, certificate number or PDF content is touched here.
   --------------------------------------------------------------------- */
(function (global) {
  'use strict';
  var doc = global.document;
  var OFF_KEY = 'labcal.certlock.off';
  var BAR_ID = 'lcCertLockBar';
  var KEEP = '#' + BAR_ID + ',#labcal-save-bar,#lcPinOverlay,#lcCertView,#lcUnitsPanel,#lcUnitsShade,#lcNextPanel,#lcHistPanel,' +
    '#lcCrumbs,#lcHistLine,#navBackBtn,#navHomeBtn,#lcCheckBtn,#lcsMenu,#lcsMenuBtn,#lcsShade,#labcal-test-bar,#lcTabLockNotice,#lcMissing';
  var CONTROLS = 'input,select,textarea,button';
  var HIDE = { generateBtn: 1, changeSheetBtn: 1, syncJobBtn: 1 };
  var locked = null;          // { jobRef, serial, certRef } while this page is locked
  var observer = null;

  function enabled() { try { return global.localStorage.getItem(OFF_KEY) !== '1'; } catch (e) { return true; } }
  function isPageLocked() { return !!locked; }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function val(id) { var el = doc.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function kept(el) { try { return !!(el.closest && el.closest(KEEP)); } catch (e) { return false; } }

  function jobUrl(ref, serial) {
    if (!ref) return 'calibration.html';
    return 'calibration.html#job=' + encodeURIComponent(ref) + (serial ? '&unit=' + encodeURIComponent(serial) : '');
  }

  // ---- lock the form ---------------------------------------------------------
  function lockControls(root) {
    var list = (root && root.querySelectorAll) ? root.querySelectorAll(CONTROLS) : [];
    Array.prototype.forEach.call(list, function (el) {
      if (kept(el)) return;
      // Generate PDF, Change worksheet… and Save to job list make no sense on a certified unit
      if (HIDE[el.id]) { el.style.display = 'none'; el.setAttribute('data-lc-locked', 'hidden'); return; }
      if (!el.disabled) { el.disabled = true; el.setAttribute('data-lc-locked', '1'); }
    });
  }
  function injectStyle() {
    if (doc.getElementById('lcCertLockStyle')) return;
    var st = doc.createElement('style');
    st.id = 'lcCertLockStyle';
    st.textContent =
      '#' + BAR_ID + '{position:sticky;top:0;z-index:9998;margin:8px;padding:12px 14px;border-radius:12px;background:#e8f6ee;color:#14532d;' +
      'border:2px solid #1e8e4e;font:600 15px/1.35 -apple-system,system-ui,sans-serif;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;box-shadow:0 2px 8px rgba(0,0,0,.12)}' +
      '#' + BAR_ID + ' .cl-t{flex:1 1 260px;min-width:0}' +
      '#' + BAR_ID + ' .cl-t small{display:block;font-weight:500;font-size:13px;color:#3d6b4f;margin-top:2px}' +
      '#' + BAR_ID + ' button{min-height:44px;padding:0 16px;border-radius:9px;border:1px solid #1e8e4e;background:#fff;color:#14532d;font:600 15px/1 -apple-system,system-ui,sans-serif;cursor:pointer}' +
      '#' + BAR_ID + ' button.cl-job{background:#1e8e4e;color:#fff}' +
      'html.lc-cert-locked canvas{pointer-events:none}' +
      'html.lc-cert-locked #lcCertView canvas{pointer-events:auto}' +
      'html.lc-cert-locked [data-lc-locked="1"]{opacity:.75}';
    (doc.head || doc.documentElement).appendChild(st);
  }
  function showBar() {
    if (!doc.body) return;
    var bar = doc.getElementById(BAR_ID);
    if (!bar) {
      bar = doc.createElement('div');
      bar.id = BAR_ID;
      bar.setAttribute('role', 'status');
      doc.body.insertBefore(bar, doc.body.firstChild);
    }
    var old = doc.getElementById('lcReissueBar'); if (old) old.parentNode.removeChild(old);
    bar.innerHTML = '<div class="cl-t">✓ Certificate ' + esc(locked.certRef || '') + ' made — this worksheet is locked.' +
      '<small>To change anything: job list → Re-issue (PIN). That makes a revised certificate.</small></div>' +
      '<button type="button" class="cl-view">View certificate</button>' +
      '<button type="button" class="cl-job">Back to job</button>';
    bar.querySelector('.cl-view').addEventListener('click', function () { showCertificate(); });
    bar.querySelector('.cl-job').addEventListener('click', function () { global.location.href = jobUrl(locked.jobRef, locked.serial); });
  }
  // clicks on anything of the form that is not a plain control (custom pickers, ticks…)
  function guard(e) {
    if (!locked) return;
    var t = e.target;
    if (!t || !t.closest || kept(t)) return;
    if (t.closest('a[href]')) return;
    if (t.closest('label,[role="button"],[onclick],canvas,[data-tp],.tp,.chip,.tick')) { e.preventDefault(); e.stopPropagation(); }
  }

  function lockPage(info) {
    if (!enabled() || !doc.body) return false;
    locked = { jobRef: info.jobRef || '', serial: info.serial || '', certRef: info.certRef || '' };
    doc.documentElement.classList.add('lc-cert-locked');
    injectStyle();
    try { if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur(); } catch (e) {}
    lockControls(doc);
    showBar();
    if (!observer && global.MutationObserver) {
      // fields the page adds or switches back on later stay locked
      observer = new MutationObserver(function (muts) {
        if (!locked) return;
        muts.forEach(function (m) {
          if (m.type === 'attributes') { var el = m.target; if (el && el.matches && el.matches(CONTROLS) && !el.disabled && !kept(el)) lockControls(el.parentNode || doc); }
          else Array.prototype.forEach.call(m.addedNodes || [], function (n) { if (n.nodeType === 1) { if (n.matches && n.matches(CONTROLS)) lockControls(n.parentNode || doc); else lockControls(n); } });
        });
      });
      observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'style'] });
    }
    doc.addEventListener('click', guard, true);
    return true;
  }

  // ---- the certificate, shown in LabCal ---------------------------------------
  function showCertificate() {
    var N = global.LabCalNav;
    var opts = { jobUrl: locked && locked.jobRef ? jobUrl(locked.jobRef, locked.serial) : '' };
    if (!N || !N.viewThisCertificate) { if (opts.jobUrl) global.location.href = opts.jobUrl; return Promise.resolve(null); }
    return N.viewThisCertificate(opts).then(function (rec) {
      if (!rec && locked) {
        var bar = doc.getElementById(BAR_ID);
        var t = bar && bar.querySelector('.cl-t small');
        if (t) t.textContent = 'The PDF of this certificate is not stored on this iPad — open the copy saved in Files, or check the job list.';
      }
      return rec;
    });
  }

  // ---- which unit is this page for? -----------------------------------------
  function stateFor(jobRef, serial) {
    var J = global.LabCalJobsheet;
    if (!J || !J.certLockFor) return null;
    try { return J.certLockFor(jobRef, serial); } catch (e) { return null; }
  }
  // A worksheet opened for a certified unit opens locked.
  function check(jobRef, serial) {
    if (!enabled() || locked) return !!locked;
    var st = stateFor(jobRef || val('jobRef'), serial || val('serial'));
    if (!st || !st.locked) return false;
    // the unit this page is filling in must really be that unit
    var typed = val('serial');
    if (typed && st.serial && typed.toUpperCase().replace(/[^A-Z0-9]/g, '') !== String(st.serial).toUpperCase().replace(/[^A-Z0-9]/g, '')) return false;
    return lockPage({ jobRef: st.jobRef, serial: st.serial, certRef: st.certRef });
  }

  // Called by the worksheet right after Generate PDF has filed the
  // certificate and handed the file to LabCalSave.deliver.
  function afterCertificate() {
    if (!enabled()) return;
    var J = global.LabCalJobsheet;
    var l = null; try { l = J && J.link ? J.link() : null; } catch (e) {}
    var ref = val('jobRef') || (l && l.jobRef) || '';
    var ser = val('serial') || (l && l.serial) || '';
    var st = stateFor(ref, ser);
    lockPage({ jobRef: (st && st.jobRef) || ref, serial: (st && st.serial) || ser, certRef: (st && st.certRef) || val('certNo') || '' });
    // show the certificate once the PDF has gone out (or the save bar was closed)
    var bar = doc.getElementById('labcal-save-bar');
    if (!bar) { global.setTimeout(showCertificate, 300); return; }
    var mo = new MutationObserver(function () {
      if (doc.getElementById('labcal-save-bar')) return;
      mo.disconnect();
      global.setTimeout(showCertificate, 300);
    });
    mo.observe(doc.body, { childList: true });
  }

  function onReady(fn) { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn); else fn(); }
  // opened from the job list / side panel: the tab knows its unit
  onReady(function () {
    global.setTimeout(function () { try { check(); } catch (e) {} }, 0);
    global.setTimeout(function () { try { check(); } catch (e) {} }, 700);   // after the worksheet has restored its fields
  });
  // a serial / job typed in (or loaded from a saved worksheet) that is a certified unit
  var typedTimer = null;
  function onTyped(e) {
    var id = e && e.target && e.target.id;
    if (id !== 'serial' && id !== 'jobRef') return;
    if (typedTimer) global.clearTimeout(typedTimer);
    typedTimer = global.setTimeout(function () { try { check(); } catch (e2) {} }, 800);
  }
  doc.addEventListener('change', onTyped, true);
  doc.addEventListener('input', onTyped, true);
    // a certificate made in another tab for this unit
  global.addEventListener('storage', function (e) {
    if (!e || !e.key || locked) return;
    if (/labcal/i.test(e.key)) { try { check(); } catch (e2) {} }
  });

  global.LabCalCertLock = {
    enabled: enabled, isPageLocked: isPageLocked, check: check,
    afterCertificate: afterCertificate, showCertificate: showCertificate,
    OFF_KEY: OFF_KEY
  };
})(typeof window !== 'undefined' ? window : this);
