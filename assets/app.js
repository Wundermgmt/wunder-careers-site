/**
 * app.js - drives both pages of the careers site.
 *
 *   index.html  a filterable list of the open roles
 *   apply.html  the job ad plus a multi-step application form
 *
 * There is no framework and no build step, matching the existing apply page.
 * Everything the form needs comes from assets/forms.js, which is generated from
 * the same source of truth as the Airtable and Google Forms versions.
 *
 * Two details that are easy to get wrong:
 *
 *   1. The POST is sent as text/plain. An Apps Script /exec endpoint does not
 *      answer CORS preflight requests, and application/json triggers one. The
 *      body is still JSON; only the declared type differs.
 *   2. Ad tracking parameters are read once on load and carried through the
 *      click from the role list to the form, so attribution survives navigation.
 */
(function () {
  'use strict';

  var CFG = window.WUNDER_CONFIG || {};
  var FORMS = window.WUNDER_FORMS || [];
  var PAGE = document.body.getAttribute('data-page');
  var DEMO = !CFG.ENDPOINT || CFG.ENDPOINT.indexOf('PASTE') === 0;

  /* ============================== helpers ============================== */

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  var TRACKED = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
                 'utm_term', 'fbclid', 'angle', 'source'];

  function params() {
    var p = new URLSearchParams(window.location.search);
    var out = {};
    TRACKED.forEach(function (k) { if (p.get(k)) out[k] = p.get(k); });
    return out;
  }

  function context(extra) {
    var p = params();
    var ctx = {
      source_angle: p.angle || p.source || p.utm_content || '',
      utm_source: p.utm_source || '',
      utm_medium: p.utm_medium || '',
      utm_campaign: p.utm_campaign || '',
      utm_content: p.utm_content || '',
      utm_term: p.utm_term || '',
      fbclid: p.fbclid || '',
      referrer: document.referrer || '',
      landing_url: window.location.href,
      user_agent: navigator.userAgent,
      submitted_at: new Date().toISOString()
    };
    if (extra) Object.keys(extra).forEach(function (k) { ctx[k] = extra[k]; });
    return ctx;
  }

  function post(payload) {
    if (DEMO) {
      console.info('[demo mode] ENDPOINT is not set, nothing was sent:', payload);
      return Promise.resolve({ ok: true, demo: true });
    }
    return fetch(CFG.ENDPOINT, {
      method: 'POST',
      // text/plain avoids a CORS preflight that Apps Script cannot answer.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }

  function carryParams(url) {
    var p = params();
    var keys = Object.keys(p);
    if (!keys.length) return url;
    return url + '&' + keys.map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(p[k]);
    }).join('&');
  }

  /* ============================ landing page ============================ */

  function renderIndex() {
    var grid = document.getElementById('roles');
    var filters = document.getElementById('filters');
    var count = document.getElementById('roleCount');
    if (!grid) return;

    if (count) count.textContent = String(FORMS.length);

    var teams = ['All'];
    FORMS.forEach(function (f) {
      if (teams.indexOf(f.card.team) === -1) teams.push(f.card.team);
    });

    var active = 'All';

    function draw() {
      grid.textContent = '';
      var shown = FORMS.filter(function (f) {
        return active === 'All' || f.card.team === active;
      });

      shown.forEach(function (f) {
        var card = el('article', { class: 'role' });

        var top = el('div', { class: 'role__top' });
        top.appendChild(el('span', { class: 'badge badge--accent' }, f.card.team));
        top.appendChild(el('span', { class: 'badge' }, 'Remote · Philippines'));
        card.appendChild(top);

        card.appendChild(el('h2', null, f.title));
        card.appendChild(el('p', { class: 'role__summary' }, f.card.summary));

        var facts = el('ul', { class: 'role__facts' });
        [['Pay', f.card.pay], ['Earnings', f.card.range], ['Hours', f.card.hours]]
          .forEach(function (pair) {
            var li = el('li');
            li.appendChild(el('span', { class: 'fact__k' }, pair[0]));
            li.appendChild(el('span', { class: 'fact__v' }, pair[1]));
            facts.appendChild(li);
          });
        card.appendChild(facts);

        var cta = el('div', { class: 'role__cta' });
        var link = el('a', {
          class: 'btn btn--block',
          href: carryParams('apply.html?role=' + encodeURIComponent(f.key))
        }, 'View role and apply');
        cta.appendChild(link);
        card.appendChild(cta);

        grid.appendChild(card);
      });
    }

    teams.forEach(function (team) {
      var chip = el('button', {
        class: 'chip', type: 'button', 'aria-pressed': team === active ? 'true' : 'false'
      }, team);
      chip.addEventListener('click', function () {
        active = team;
        Array.prototype.forEach.call(filters.children, function (c) {
          c.setAttribute('aria-pressed', c === chip ? 'true' : 'false');
        });
        draw();
      });
      filters.appendChild(chip);
    });

    draw();
  }

  /* ============================= apply page ============================= */

  function renderApply() {
    var key = new URLSearchParams(window.location.search).get('role');
    var form = FORMS.filter(function (f) { return f.key === key; })[0];

    if (!form) {
      var main = document.getElementById('main');
      main.textContent = '';
      var wrap = el('div', { class: 'wrap' });
      var box = el('div', { class: 'empty' });
      box.style.margin = '60px 0';
      box.appendChild(el('h2', null, 'That role is not open'));
      box.appendChild(el('p', null,
        'The link may be out of date. Here is everything we are hiring for now.'));
      var back = el('p');
      back.style.marginTop = '20px';
      back.appendChild(el('a', { class: 'btn', href: 'index.html' }, 'See all open roles'));
      box.appendChild(back);
      wrap.appendChild(box);
      main.appendChild(wrap);
      return;
    }

    document.title = form.title + ' — Wunder Management Careers';
    document.getElementById('roleTitle').textContent = form.title;

    var meta = document.getElementById('roleMeta');
    [['Team', form.card.team], ['Pay', form.card.pay], ['Earnings', form.card.range],
     ['Hours', form.card.hours], ['Location', 'Remote, Philippines']]
      .forEach(function (pair) {
        var box2 = el('div', { class: 'meta' });
        box2.appendChild(el('div', { class: 'meta__k' }, pair[0]));
        box2.appendChild(el('div', { class: 'meta__v' }, pair[1]));
        meta.appendChild(box2);
      });

    // Generated by us from the Airtable ad text, never from user input.
    document.getElementById('roleAd').innerHTML = form.adHtml;

    var note = document.getElementById('privacyNote');
    note.textContent = 'By applying you agree that we may review your submission for hiring purposes. ';
    note.appendChild(el('a', {
      href: (CFG.COMPANY && CFG.COMPANY.privacy) || 'https://wundermgmt.com/imprint',
      target: '_blank', rel: 'noopener'
    }, 'Privacy policy'));

    buildForm(form);
  }

  /* ============================ the form ============================ */

  function buildForm(form) {
    var stepsHost = document.getElementById('steps');
    var progress = document.getElementById('progress');
    var stepCount = document.getElementById('stepCount');
    var banner = document.getElementById('banner');
    var backBtn = document.getElementById('backBtn');
    var nextBtn = document.getElementById('nextBtn');
    var formEl = document.getElementById('applyForm');
    var done = document.getElementById('done');
    var startedAt = Date.now();
    var current = 0;
    var files = {};                 // fid -> {name, mimeType, data}
    var reading = {};               // fid -> Promise, resolved when the read finishes
    var submitted = false;          // stops the autosave resurrecting a sent draft
    var draftKey = 'wunder-draft-' + form.key;

    if (DEMO) {
      banner.className = 'banner banner--warn';
      banner.setAttribute('data-show', 'true');
      banner.textContent = 'Preview mode: ENDPOINT is not set in assets/config.js, ' +
                           'so submissions are validated but not saved.';
    }

    form.steps.forEach(function (step, i) {
      var section = el('section', {
        class: 'step', 'data-active': i === 0 ? 'true' : 'false',
        'aria-label': step.title
      });
      section.appendChild(el('p', { class: 'step__blurb' }, step.blurb));
      step.questions.forEach(function (q) { section.appendChild(field(q)); });
      stepsHost.appendChild(section);

      var seg = el('div', {
        class: 'progress__seg', 'data-state': i === 0 ? 'current' : 'todo'
      });
      progress.appendChild(seg);
    });

    var sections = stepsHost.querySelectorAll('.step');

    function field(q) {
      var wrapEl = el('div', { class: 'field', 'data-fid': q.fid, 'data-type': q.type });
      var id = 'q_' + q.fid;
      var errId = 'e_' + q.fid;

      var label = el('label', { class: 'field__label', for: id }, q.title);
      if (q.required) label.appendChild(el('span', { class: 'req', 'aria-hidden': 'true' }, '*'));
      else label.appendChild(el('span', { class: 'opt' }, 'optional'));
      wrapEl.appendChild(label);

      if (q.help) {
        var help = el('p', { class: 'field__help', id: 'h_' + q.fid });
        linkify(help, q.help);
        wrapEl.appendChild(help);
      }

      var described = (q.help ? 'h_' + q.fid + ' ' : '') + errId;

      if (q.type === 'choice' || q.type === 'multi') {
        // A fieldset would duplicate the label for screen readers, so the group
        // is described by the label above via aria-labelledby on the container.
        var group = el('div', {
          class: 'choices' + (q.choices.length === 2 ? ' choices--inline' : ''),
          role: q.type === 'choice' ? 'radiogroup' : 'group',
          'aria-labelledby': id + '_l', 'aria-describedby': described
        });
        label.id = id + '_l';
        q.choices.forEach(function (choice, ci) {
          var opt = el('label', { class: 'choice' });
          var input = el('input', {
            type: q.type === 'choice' ? 'radio' : 'checkbox',
            name: q.fid, value: choice,
            id: ci === 0 ? id : id + '_' + ci
          });
          opt.appendChild(input);
          opt.appendChild(el('span', null, choice));
          group.appendChild(opt);
        });
        wrapEl.appendChild(group);

      } else if (q.type === 'file') {
        var drop = el('label', { class: 'file-drop', 'data-has-file': 'false' });
        var input2 = el('input', {
          type: 'file', id: id, accept: q.accept || '', 'aria-describedby': described
        });
        var icon = el('div', { class: 'file-drop__icon', 'aria-hidden': 'true' }, '↑');
        var textBox = el('div', { class: 'file-drop__text' });
        var strong = el('b', null, 'Choose a file');
        var hint = el('span', null, q.hint || ('Up to ' + (CFG.MAX_FILE_MB || 8) + ' MB.'));
        textBox.appendChild(strong);
        textBox.appendChild(hint);
        drop.appendChild(input2);
        drop.appendChild(icon);
        drop.appendChild(textBox);
        wrapEl.appendChild(drop);

        input2.addEventListener('change', function () {
          var file = input2.files && input2.files[0];
          delete files[q.fid];
          delete reading[q.fid];

          if (!file) { drop.setAttribute('data-has-file', 'false'); return; }

          var limit = (CFG.MAX_FILE_MB || 8) * 1024 * 1024;
          if (file.size > limit) {
            showError(q.fid, 'That file is ' + (file.size / 1048576).toFixed(1) +
                             ' MB. The limit is ' + (CFG.MAX_FILE_MB || 8) + ' MB.');
            input2.value = '';
            drop.setAttribute('data-has-file', 'false');
            return;
          }

          strong.textContent = file.name;
          hint.textContent = 'Reading file…';
          drop.setAttribute('data-has-file', 'true');
          clearError(q.fid);

          // Reading is asynchronous. Submit waits on this promise, because a
          // submit that fires mid-read used to send no file at all - which looks
          // exactly like an applicant who never attached one.
          reading[q.fid] = new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function () {
              files[q.fid] = {
                fid: q.fid, name: file.name,
                mimeType: file.type || 'application/octet-stream',
                data: String(reader.result).split(',')[1]
              };
              hint.textContent = (file.size / 1024).toFixed(0) + ' KB — click to replace';
              resolve();
            };
            reader.onerror = function () {
              hint.textContent = 'Could not read that file';
              drop.setAttribute('data-has-file', 'false');
              showError(q.fid, 'This browser could not read that file. ' +
                               'Please try a different one.');
              resolve();
            };
            reader.readAsDataURL(file);
          });
        });

      } else if (q.type === 'paragraph') {
        var ta = el('textarea', {
          id: id, name: q.fid, rows: 5, 'aria-describedby': described
        });
        wrapEl.appendChild(ta);
        if (q.minChars) {
          var counter = el('p', { class: 'field__help' }, 'Minimum ' + q.minChars + ' characters.');
          counter.style.marginTop = '7px';
          wrapEl.appendChild(counter);
          ta.addEventListener('input', function () {
            var n = ta.value.trim().length;
            counter.textContent = n >= q.minChars
              ? n + ' characters'
              : (q.minChars - n) + ' more characters needed';
          });
        }

      } else {
        var types = { email: 'email', phone: 'tel', number: 'number', url: 'url' };
        var input3 = el('input', {
          type: types[q.type] || 'text', id: id, name: q.fid,
          'aria-describedby': described,
          autocomplete: autoComplete(q),
          inputmode: q.type === 'number' ? 'numeric' : null
        });
        wrapEl.appendChild(input3);
      }

      wrapEl.appendChild(el('p', { class: 'error', id: errId, 'aria-live': 'polite' }));
      return wrapEl;
    }

    function autoComplete(q) {
      var t = q.title.toLowerCase();
      if (q.type === 'email') return 'email';
      if (q.type === 'phone') return 'tel';
      if (t.indexOf('first name') !== -1) return 'given-name';
      if (t.indexOf('last name') !== -1 || t.indexOf('second name') !== -1) return 'family-name';
      if (t.indexOf('full name') !== -1) return 'name';
      return 'off';
    }

    function linkify(node, text) {
      var re = /(https?:\/\/[^\s]+|[a-z0-9.-]+\.com\/[^\s]+)/gi;
      var last = 0, m;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
        var href = m[0].indexOf('http') === 0 ? m[0] : 'https://' + m[0];
        node.appendChild(el('a', { href: href, target: '_blank', rel: 'noopener' }, m[0]));
        last = m.index + m[0].length;
      }
      if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
    }

    /* --------------------------- validation --------------------------- */

    function questionsIn(i) { return form.steps[i].questions; }

    function valueOf(q) {
      if (q.type === 'file') {
        // Read from the input, not from `files`: a file chosen a moment ago may
        // still be reading, and it counts as attached the instant it is picked.
        var node = document.getElementById('q_' + q.fid);
        return (node && node.files && node.files[0]) ? node.files[0].name : '';
      }
      if (q.type === 'multi') {
        return Array.prototype.slice.call(
          formEl.querySelectorAll('input[name="' + q.fid + '"]:checked')
        ).map(function (i) { return i.value; });
      }
      if (q.type === 'choice') {
        var hit = formEl.querySelector('input[name="' + q.fid + '"]:checked');
        return hit ? hit.value : '';
      }
      var node = document.getElementById('q_' + q.fid);
      return node ? node.value.trim() : '';
    }

    function showError(fid, message) {
      var node = document.getElementById('e_' + fid);
      if (!node) return;
      node.textContent = message;
      node.setAttribute('data-show', 'true');
      var input = document.getElementById('q_' + fid);
      if (input) input.setAttribute('aria-invalid', 'true');
    }

    function clearError(fid) {
      var node = document.getElementById('e_' + fid);
      if (node) { node.textContent = ''; node.removeAttribute('data-show'); }
      var input = document.getElementById('q_' + fid);
      if (input) input.removeAttribute('aria-invalid');
    }

    function checkStep(i) {
      var bad = null;
      questionsIn(i).forEach(function (q) {
        clearError(q.fid);
        var v = valueOf(q);
        var empty = Array.isArray(v) ? v.length === 0 : String(v).trim() === '';

        if (q.required && empty) {
          showError(q.fid, q.type === 'file' ? 'Please attach a file.' : 'This one is required.');
          bad = bad || q.fid;
          return;
        }
        if (empty) return;

        if (q.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
          showError(q.fid, 'That email address does not look right.');
          bad = bad || q.fid;
        } else if (q.type === 'phone' && String(v).replace(/\D/g, '').length < 7) {
          showError(q.fid, 'Please include the full number with country code.');
          bad = bad || q.fid;
        } else if (q.minChars && String(v).trim().length < q.minChars) {
          showError(q.fid, 'Please write at least ' + q.minChars + ' characters. ' +
                           'This answer decides the shortlist.');
          bad = bad || q.fid;
        }
      });

      if (bad) {
        var node = document.getElementById('q_' + bad) ||
                   formEl.querySelector('[data-fid="' + bad + '"]');
        if (node && node.scrollIntoView) node.scrollIntoView({ block: 'center' });
        if (node && node.focus) node.focus();
      }
      return !bad;
    }

    /* ----------------------------- steps ----------------------------- */

    function paint() {
      Array.prototype.forEach.call(sections, function (s, i) {
        s.setAttribute('data-active', i === current ? 'true' : 'false');
      });
      Array.prototype.forEach.call(progress.children, function (seg, i) {
        seg.setAttribute('data-state', i < current ? 'done' : (i === current ? 'current' : 'todo'));
      });
      stepCount.textContent = 'Step ' + (current + 1) + ' of ' + form.steps.length +
                              ' — ' + form.steps[current].title;
      backBtn.style.visibility = current === 0 ? 'hidden' : 'visible';
      nextBtn.textContent = current === form.steps.length - 1 ? 'Submit application' : 'Continue';
    }

    backBtn.addEventListener('click', function () {
      if (current > 0) { current -= 1; paint(); focusStep(); }
    });

    function focusStep() {
      var first = sections[current].querySelector('input, textarea, select');
      if (first && first.type !== 'file') first.focus();
      document.querySelector('.card__head').scrollIntoView({ block: 'nearest' });
    }

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!checkStep(current)) return;
      if (current < form.steps.length - 1) {
        current += 1; paint(); focusStep(); saveDraft(); return;
      }
      submit();
    });

    /* ----------------------------- drafts ----------------------------- */

    function saveDraft() {
      if (!CFG.SAVE_DRAFTS || submitted) return;
      var data = {};
      form.steps.forEach(function (s) {
        s.questions.forEach(function (q) {
          if (q.type === 'file') return;      // never store file bytes locally
          var v = valueOf(q);
          if (Array.isArray(v) ? v.length : String(v).length) data[q.fid] = v;
        });
      });
      try { localStorage.setItem(draftKey, JSON.stringify(data)); } catch (err) {}
    }

    function loadDraft() {
      if (!CFG.SAVE_DRAFTS) return;
      var raw;
      try { raw = localStorage.getItem(draftKey); } catch (err) { return; }
      if (!raw) return;
      var data = JSON.parse(raw);

      Object.keys(data).forEach(function (fid) {
        var value = data[fid];
        var radios = formEl.querySelectorAll('input[name="' + fid + '"]');
        if (radios.length) {
          var wanted = Array.isArray(value) ? value : [value];
          Array.prototype.forEach.call(radios, function (r) {
            if (wanted.indexOf(r.value) !== -1) r.checked = true;
          });
          return;
        }
        var node = document.getElementById('q_' + fid);
        if (node) node.value = value;
      });

      document.getElementById('formSubhead').textContent =
        'We restored your saved answers. Pick up where you left off.';
    }

    function debounce(fn, ms) {
      var t;
      var wrapped = function () { clearTimeout(t); t = setTimeout(fn, ms); };
      wrapped.cancel = function () { clearTimeout(t); };
      return wrapped;
    }

    var queueSave = debounce(saveDraft, 500);
    formEl.addEventListener('input', queueSave);
    formEl.addEventListener('change', saveDraft);

    /* ----------------------------- submit ----------------------------- */

    function submit() {
      // Any file still being read must finish first, or it is dropped silently.
      var pending = Object.keys(reading).map(function (k) { return reading[k]; });
      if (pending.length) {
        busy('Attaching files');
        Promise.all(pending).then(send);
      } else {
        send();
      }
    }

    function busy(label) {
      nextBtn.disabled = true;
      backBtn.disabled = true;
      nextBtn.textContent = '';
      nextBtn.appendChild(el('span', { class: 'spinner', 'aria-hidden': 'true' }));
      nextBtn.appendChild(document.createTextNode(' ' + label));
    }

    function send() {
      var answers = {};
      form.steps.forEach(function (s) {
        s.questions.forEach(function (q) {
          if (q.type === 'file') return;
          var v = valueOf(q);
          if (Array.isArray(v) ? v.length : String(v).length) answers[q.fid] = v;
        });
      });

      // Attribution fields never render; the ad's URL supplies them.
      var p = params();
      (form.hidden || []).forEach(function (q) {
        var v = p.angle || p.source || p.utm_content || '';
        if (v) answers[q.fid] = v;
      });

      busy('Sending');
      banner.removeAttribute('data-show');

      post({
        role: form.key,
        answers: answers,
        files: Object.keys(files).map(function (k) { return files[k]; }),
        honeypot: (document.getElementById('hp') || {}).value || '',
        context: context({
          time_to_complete_sec: Math.round((Date.now() - startedAt) / 1000)
        })
      }).then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || 'Unknown error');
        // Order matters: stop the autosave first, or the debounced write lands
        // after the delete and the applicant is told their answers were restored.
        submitted = true;
        queueSave.cancel();
        try { localStorage.removeItem(draftKey); } catch (err) {}
        formEl.style.display = 'none';
        document.querySelector('.card__head').style.display = 'none';
        document.getElementById('doneMessage').textContent =
          (res.demo ? 'Preview mode: nothing was saved, but every answer passed validation. '
                    : '') + form.confirmation;
        done.setAttribute('data-show', 'true');
        done.scrollIntoView({ block: 'center' });
        if (window.fbq) window.fbq('track', 'SubmitApplication', { content_name: form.title });
      }).catch(function (err) {
        banner.className = 'banner';
        banner.setAttribute('data-show', 'true');
        banner.textContent = String(err.message || err) +
          ' Your answers are saved in this browser, so you can try again. ' +
          'If it keeps failing, email ' +
          ((CFG.COMPANY && CFG.COMPANY.email) || 'ja@kgmodelmanagement.com') + '.';
        banner.scrollIntoView({ block: 'center' });
        nextBtn.disabled = false;
        backBtn.disabled = false;
        paint();
      });
    }

    loadDraft();
    paint();

    if (CFG.TRACK_PAGE_VIEWS) {
      post({ action: 'view', role: form.key, context: context() })
        .catch(function () { /* a blocked ping must never break the form */ });
    }
  }

  /* ================================ boot ================================ */

  if (PAGE === 'index') renderIndex();
  if (PAGE === 'apply') renderApply();
})();
