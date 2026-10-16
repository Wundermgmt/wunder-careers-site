/**
 * app.js - drives both pages of the careers site.
 *
 *   index.html  a filterable list of the open roles
 *   apply.html  the role intro, then the application as a one-question-per-screen quiz
 *
 * There is no framework and no build step. Everything the form needs comes from
 * assets/forms.js, which is generated from the same source of truth as the
 * Airtable and Google Forms versions.
 *
 * WHY ONE QUESTION PER SCREEN
 * The questions arrive grouped into four steps, and one of those steps routinely
 * holds eight or nine of them. On a phone that is a wall, and it is the point
 * people quit. Showing one question at a time with a large tap target turns the
 * same 15-18 questions into a sequence of single decisions, and the "3 / 17"
 * counter keeps the remaining work honest. The grouping is a presentation choice
 * made here; forms.js is untouched, because an edit there would be overwritten
 * the next time it is regenerated.
 *
 * Four details that are easy to get wrong:
 *
 *   1. The POST is sent as text/plain. An Apps Script /exec endpoint does not
 *      answer CORS preflight requests, and application/json triggers one. The
 *      body is still JSON; only the declared type differs.
 *   2. Ad tracking parameters are read once on load and carried through the
 *      click from the role list to the form, so attribution survives navigation.
 *   3. Both renderers run twice - once from the baked roles, once when
 *      postings-live.js merges the live ones - so everything they build must be
 *      REPLACED, never appended to, and no listener may be attached twice.
 *   4. A single-choice question advances on tap, but never on the LAST screen:
 *      there, a tap would submit the application without a confirming action.
 */
(function () {
  'use strict';

  var CFG = window.WUNDER_CONFIG || {};
  var FORMS = window.WUNDER_FORMS || [];
  var PAGE = document.body.getAttribute('data-page');
  var DEMO = !CFG.ENDPOINT || CFG.ENDPOINT.indexOf('PASTE') === 0;

  // State that has to outlive a re-render.
  var activeTeam = 'All';   // the chosen filter chip, so a merge does not reset it
  var formBuilt = false;    // the quiz is built once; see renderApply

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

  // The one place a careers-site applicant is sent after submitting: the HR
  // portal's one-time Workstyle handoff page (wunder-hr-suite workstyle-handoff.js).
  var WORKSTYLE_NEXT_RE =
    /^https:\/\/wunderportal\.com\/hr\/hiring-admin\/app\/continue\/wh1\.[A-Za-z0-9_-]{32,128}$/;

  var TRACKED = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
                 'utm_term', 'fbclid', 'angle', 'source'];

  function params() {
    var p = new URLSearchParams(window.location.search);
    var out = {};
    TRACKED.forEach(function (k) { if (p.get(k)) out[k] = p.get(k); });
    return out;
  }

  // Meta sends the same creative under three different spellings; angle.js
  // collapses them so a group-by counts one creative once.
  function sourceAngle(p) {
    return window.WUNDER_ANGLE.normalize(p.angle || p.source || p.utm_content || '');
  }

  function context(extra) {
    var p = params();
    var ctx = {
      source_angle: sourceAngle(p),
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
    if (!grid) return;

    // Counted, not typed: the hard-coded "8" outlived the ninth role.
    var count = document.getElementById('roleCount');
    if (count) count.textContent = FORMS.length + (FORMS.length === 1 ? ' open position' : ' open positions');

    var teams = ['All'];
    FORMS.forEach(function (f) {
      if (teams.indexOf(f.card.team) === -1) teams.push(f.card.team);
    });

    // A merge can close the team that was being filtered on. Falling back to All
    // beats showing an empty page with a chip still lit.
    if (teams.indexOf(activeTeam) === -1) activeTeam = 'All';

    // Cleared, not added to: without this the second pass drew a second full row
    // of chips underneath the first.
    filters.textContent = '';

    function draw() {
      grid.textContent = '';
      FORMS.filter(function (f) {
        return activeTeam === 'All' || f.card.team === activeTeam;
      }).forEach(function (f) {
        // The whole card is the link, so the tap target is the card and not a
        // button inside it.
        var card = el('a', {
          class: 'role',
          href: carryParams('apply.html?role=' + encodeURIComponent(f.key))
        });

        var top = el('div', { class: 'role__top' });
        top.appendChild(el('span', { class: 'badge' }, f.card.team));
        top.appendChild(el('span', { class: 'badge badge--new' }, 'Open'));
        card.appendChild(top);

        card.appendChild(el('h2', null, f.title));
        card.appendChild(el('p', { class: 'role__remote' }, 'Remote · Philippines · Full-time contractor'));
        if (f.card.summary) card.appendChild(el('p', { class: 'role__summary' }, f.card.summary));

        var foot = el('div', { class: 'role__foot' });
        foot.appendChild(el('span', { class: 'role__pay' }, f.card.range || f.card.pay || ''));
        foot.appendChild(el('span', { class: 'role__hours' }, f.card.hours || ''));
        card.appendChild(foot);

        grid.appendChild(card);
      });
    }

    teams.forEach(function (team) {
      var chip = el('button', {
        class: 'chip', type: 'button', 'aria-pressed': team === activeTeam ? 'true' : 'false'
      }, team);
      chip.addEventListener('click', function () {
        activeTeam = team;
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

    var intro = document.getElementById('introScreen');
    var quiz = document.getElementById('quizScreen');
    var notOpen = document.getElementById('notOpen');

    if (!form) {
      // Hidden, never destroyed. This branch used to empty <main>, which deleted
      // the markup the next pass needs - so a role added in the admin tool could
      // never render, it only ever threw on the re-render that found it.
      if (intro) intro.hidden = true;
      if (quiz) quiz.hidden = true;
      if (!notOpen) {
        notOpen = el('div', { class: 'wrap wrap--quiz', id: 'notOpen' });
        var box = el('div', { class: 'empty' });
        box.style.margin = '50px 0';
        box.appendChild(el('h2', null, 'That role is not open'));
        box.appendChild(el('p', null,
          'The link may be out of date. Here is everything we are hiring for now.'));
        var back = el('p');
        back.style.marginTop = '20px';
        back.appendChild(el('a', { class: 'btn', href: 'index.html' }, 'See all open roles'));
        box.appendChild(back);
        notOpen.appendChild(box);
        document.getElementById('main').appendChild(notOpen);
      }
      return;
    }

    if (notOpen) notOpen.remove();
    if (intro && !formBuilt) intro.hidden = false;

    document.title = form.title + ' — Wunder Management Careers';
    document.getElementById('roleTitle').textContent = form.title;
    document.getElementById('roleSummary').textContent = form.card.summary || '';

    var meta = document.getElementById('roleMeta');
    meta.textContent = '';        // replaced, not appended to
    [['Team', form.card.team], ['Pay', form.card.pay], ['Earnings', form.card.range],
     ['Hours', form.card.hours], ['Location', 'Remote, Philippines']]
      .forEach(function (pair) {
        if (!pair[1]) return;
        var cell = el('div', { class: 'meta' });
        cell.appendChild(el('div', { class: 'meta__k' }, pair[0]));
        cell.appendChild(el('div', { class: 'meta__v' }, pair[1]));
        meta.appendChild(cell);
      });

    // Generated by us from the Airtable ad text, never from user input.
    document.getElementById('roleAd').innerHTML = form.adHtml;

    var note = document.getElementById('privacyNote');
    note.textContent = 'By applying you agree that we may review your submission for hiring purposes. ';
    note.appendChild(el('a', {
      href: (CFG.COMPANY && CFG.COMPANY.privacy) || 'https://wundermgmt.com/imprint',
      target: '_blank', rel: 'noopener'
    }, 'Privacy policy'));

    // ONCE. buildQuiz attaches listeners to the static markup in apply.html, so
    // calling it twice attached a second submit handler and one click on
    // "Submit application" POSTed the application twice.
    //
    // A merge never changes a baked role's questions - postings-live.js only
    // rewrites card copy and the ad body - so there is nothing to rebuild. The
    // flag rather than an early return is deliberate: a role that exists only as
    // a live posting is absent on the first pass, and its form must still get
    // built on the pass that finds it.
    if (!formBuilt) {
      formBuilt = true;
      buildQuiz(form);
    }
  }

  /* ============================ the quiz ============================ */

  /**
   * Flattens the grouped steps into one screen per question, and splices in a
   * couple of breather screens. The counter deliberately counts QUESTIONS only,
   * so a breather does not make the applicant think they answered something.
   */
  // Files are collected as links, not uploads. Since 16 Sep 2026 the intake could
  // not save an upload (the Workspace policy rejects its public-link step), so
  // every application with a file was lost. The question keeps its fid, so the
  // intake files the link in the same column the upload used to land in.
  var LINK_HELP = 'Paste a link to your file (Google Drive, Dropbox or OneDrive). ' +
                  'Set sharing to "Anyone with the link" so we can open it.';

  function asLink(q) {
    if (q.type !== 'file') return q;
    var copy = {};
    Object.keys(q).forEach(function (k) { copy[k] = q[k]; });
    copy.type = 'url';
    copy.fileAsLink = true;
    copy.help = q.help ? q.help + ' ' + LINK_HELP : LINK_HELP;
    // Every role requires a CV (Jio, 2026-09-28). The intake's own schema still
    // marks some CVs optional, so remember what IT requires: only those get the
    // placeholder file below, and the rest keep a clean link in their cell.
    copy.intakeRequires = !!q.required;
    if (isCv(q) || isChatterTypingTest(q)) copy.required = true;
    return copy;
  }

  // The Chatter screener counts a blank typing-test link as an incomplete
  // application and fails it (Jio, 2026-10-12), so the page asks for it too.
  function isChatterTypingTest(q) {
    return q.fid === 'fldwpnxx2kWfXljcR';
  }

  function isCv(q) {
    return /\bCV\b|r[eé]sum[eé]/i.test(q.title || '');
  }

  function buildScreens(form) {
    var qs = [];
    form.steps.forEach(function (step) {
      step.questions.forEach(function (q) { qs.push({ kind: 'q', q: asLink(q), group: step.title }); });
    });

    // Two at most. More reads as padding, and every extra screen is another
    // chance to leave.
    var pauses = {};
    if (qs.length > 8) {
      pauses[4] = {
        kind: 'pause', big: '25',
        head: 'You are joining a real team',
        body: 'Twenty-five people, fully remote, behind more than 3 billion organic views in three years.'
      };
      pauses[Math.max(9, qs.length - 4)] = {
        kind: 'pause', big: 'Almost',
        head: 'Nearly there',
        body: 'The last few questions are the ones we actually read when deciding the shortlist.'
      };
    }

    var screens = [];
    qs.forEach(function (item, i) {
      if (pauses[i]) screens.push(pauses[i]);
      screens.push(item);
    });
    return screens;
  }

  function buildQuiz(form) {
    var host = document.getElementById('screens');
    var fill = document.getElementById('progressFill');
    var stepCount = document.getElementById('stepCount');
    var banner = document.getElementById('banner');
    var backBtn = document.getElementById('quizBack');
    var nextBtn = document.getElementById('nextBtn');
    var foot = document.getElementById('quizFoot');
    var formEl = document.getElementById('applyForm');
    var done = document.getElementById('done');
    var intro = document.getElementById('introScreen');
    var quiz = document.getElementById('quizScreen');
    var startBtn = document.getElementById('startBtn');

    var screens = buildScreens(form);
    var questions = screens.filter(function (s) { return s.kind === 'q'; })
                           .map(function (s) { return s.q; });
    var total = questions.length;
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

    /* --------------------------- build the DOM --------------------------- */

    screens.forEach(function (s, i) {
      var section = el('section', {
        class: 'screen', 'data-active': i === 0 ? 'true' : 'false',
        'data-kind': s.kind
      });

      if (s.kind === 'pause') {
        var pause = el('div', { class: 'pause' });
        pause.appendChild(el('div', { class: 'pause__n' }, s.big));
        pause.appendChild(el('h2', null, s.head));
        pause.appendChild(el('p', null, s.body));
        section.appendChild(pause);
      } else {
        section.setAttribute('aria-label', s.q.title);
        if (s.group) section.appendChild(el('p', { class: 'screen__eyebrow' }, s.group));
        section.appendChild(field(s.q));
      }

      host.appendChild(section);
    });

    var sections = host.querySelectorAll('.screen');

    function field(q) {
      var wrapEl = el('div', { class: 'field', 'data-fid': q.fid, 'data-type': q.type });
      var id = 'q_' + q.fid;
      var errId = 'e_' + q.fid;

      var label = el('label', { class: 'field__label', for: id }, q.title);
      if (!q.required) label.appendChild(el('span', { class: 'opt' }, ' (optional)'));
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
          class: 'choices',
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
          opt.appendChild(el('span', { class: 'choice__tick', 'aria-hidden': 'true' }, '✓'));
          group.appendChild(opt);
        });
        wrapEl.appendChild(group);

      } else if (q.type === 'file') {
        var drop = el('label', { class: 'file-drop', 'data-has-file': 'false' });
        var fileInput = el('input', {
          type: 'file', id: id, accept: q.accept || '', 'aria-describedby': described
        });
        var icon = el('div', { class: 'file-drop__icon', 'aria-hidden': 'true' }, '↑');
        var textBox = el('div', { class: 'file-drop__text' });
        var strong = el('b', null, 'Choose a file');
        var hint = el('span', null, q.hint || ('Up to ' + (CFG.MAX_FILE_MB || 8) + ' MB.'));
        textBox.appendChild(strong);
        textBox.appendChild(hint);
        drop.appendChild(fileInput);
        drop.appendChild(icon);
        drop.appendChild(textBox);
        wrapEl.appendChild(drop);

        fileInput.addEventListener('change', function () {
          var file = fileInput.files && fileInput.files[0];
          delete files[q.fid];
          delete reading[q.fid];

          if (!file) { drop.setAttribute('data-has-file', 'false'); return; }

          var limit = (CFG.MAX_FILE_MB || 8) * 1024 * 1024;
          if (file.size > limit) {
            showError(q.fid, 'That file is ' + (file.size / 1048576).toFixed(1) +
                             ' MB. The limit is ' + (CFG.MAX_FILE_MB || 8) + ' MB.');
            fileInput.value = '';
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
              hint.textContent = (file.size / 1024).toFixed(0) + ' KB — tap to replace';
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

      } else if (q.type === 'paragraph' || q.type === 'long') {
        var ta = el('textarea', {
          id: id, name: q.fid, rows: 6, 'aria-describedby': described
        });
        wrapEl.appendChild(ta);
        if (q.minChars) {
          var counter = el('p', { class: 'char-count' }, 'Minimum ' + q.minChars + ' characters');
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
        var input = el('input', {
          type: types[q.type] || 'text', id: id, name: q.fid,
          'aria-describedby': described,
          autocomplete: autoComplete(q),
          inputmode: q.type === 'number' ? 'numeric' : null,
          placeholder: q.fileAsLink ? 'https://drive.google.com/…' : null
        });
        wrapEl.appendChild(input);
        if (q.fileAsLink) wrapEl.appendChild(linkHowTo());
      }

      wrapEl.appendChild(el('p', { class: 'error', id: errId, 'aria-live': 'polite' }));
      return wrapEl;
    }

    // Most applicants arrive from a Facebook ad on a phone, where getting a
    // shareable link is the step most likely to lose them. Closed by default so
    // it costs nothing for anyone who already knows how.
    function linkHowTo() {
      var steps = [
        ['Open the ', 'Google Drive', ' app, tap ', '+', ', then ', 'Upload', ', and pick your file.'],
        ['Tap ', '⋮', ' next to the file, then ', 'Share', '. Under General access, change ',
         'Restricted', ' to ', 'Anyone with the link', '.'],
        ['Tap ', 'Copy link', ', come back here, and paste it above.']
      ];
      var box = el('details', { class: 'howto' });
      box.appendChild(el('summary', null, 'How to get a shareable Google Drive link'));
      var list = el('ol');
      steps.forEach(function (parts) {
        var li = el('li');
        // Odd pieces are the words the applicant will see on screen.
        parts.forEach(function (text, i) {
          li.appendChild(i % 2 ? el('b', null, text) : document.createTextNode(text));
        });
        list.appendChild(li);
      });
      box.appendChild(list);
      return box;
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

    /** Validates the one question on the current screen. */
    function checkCurrent() {
      var s = screens[current];
      if (s.kind !== 'q') return true;
      var q = s.q;

      clearError(q.fid);
      var v = valueOf(q);
      var empty = Array.isArray(v) ? v.length === 0 : String(v).trim() === '';

      if (q.required && empty) {
        showError(q.fid, q.type === 'file' ? 'Please attach a file.'
                       : q.fileAsLink ? 'Please paste a link to your file.'
                       : (q.type === 'choice' || q.type === 'multi') ? 'Please choose an answer.'
                       : 'This one is required.');
        return false;
      }
      if (empty) return true;

      if (q.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        showError(q.fid, 'That email address does not look right.');
        return false;
      }
      if (q.type === 'phone' && String(v).replace(/\D/g, '').length < 7) {
        showError(q.fid, 'Please include the full number with country code.');
        return false;
      }
      if (q.fileAsLink && !/^https?:\/\/[^\s.]+\.\S+$/i.test(v)) {
        showError(q.fid, 'Please paste the full link, starting with https://');
        return false;
      }
      if (q.minChars && String(v).trim().length < q.minChars) {
        showError(q.fid, 'Please write at least ' + q.minChars + ' characters. ' +
                         'This answer decides the shortlist.');
        return false;
      }
      return true;
    }

    /* ----------------------------- painting ----------------------------- */

    function questionsBefore(i) {
      var n = 0;
      for (var k = 0; k < i; k++) if (screens[k].kind === 'q') n += 1;
      return n;
    }

    function isLast() { return current === screens.length - 1; }

    function paint() {
      Array.prototype.forEach.call(sections, function (s, i) {
        s.setAttribute('data-active', i === current ? 'true' : 'false');
      });

      var answered = questionsBefore(current);
      var s = screens[current];
      var shown = s.kind === 'q' ? answered + 1 : answered;

      stepCount.textContent = Math.min(shown, total) + ' / ' + total;
      fill.style.width = Math.round((answered / total) * 100) + '%';
      backBtn.hidden = current === 0;

      // A single-choice question advances on tap, so it needs no button - except
      // on the last screen, where a tap must not submit on its own, and when the
      // question is optional and therefore needs a way past it.
      var q = s.kind === 'q' ? s.q : null;
      var tapAdvances = q && q.type === 'choice' && !isLast();

      if (tapAdvances && q.required) {
        foot.hidden = true;
      } else {
        foot.hidden = false;
        // Skip is secondary on purpose. As a solid black button it outweighed the
        // option cards and read as the thing to press.
        var isSkip = tapAdvances && !q.required;
        nextBtn.className = 'btn btn--block' + (isSkip ? ' btn--ghost' : '');
        nextBtn.textContent = isLast() ? 'Submit application' : isSkip ? 'Skip' : 'Continue';
      }
    }

    function goTo(i) {
      current = Math.max(0, Math.min(screens.length - 1, i));
      paint();
      var focusable = sections[current].querySelector('textarea, input[type="text"], ' +
        'input[type="email"], input[type="tel"], input[type="number"], input[type="url"]');
      if (focusable) focusable.focus();
      // The bar carries the counter and the back button, so it is the right
      // anchor: the question lands just under it.
      var bar = document.querySelector('.quiz__bar');
      if (bar && bar.scrollIntoView) bar.scrollIntoView({ block: 'start' });
    }

    function advance() {
      if (!checkCurrent()) return;
      if (isLast()) { submit(); return; }
      goTo(current + 1);
      saveDraft();
    }

    backBtn.addEventListener('click', function () { if (current > 0) goTo(current - 1); });

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      advance();
    });

    // Tap-to-advance. Delegated once on the form, so no per-option listener and
    // nothing to re-attach.
    formEl.addEventListener('change', function (e) {
      var input = e.target;
      if (!input || input.type !== 'radio') return;
      var s = screens[current];
      if (s.kind !== 'q' || s.q.type !== 'choice' || isLast()) return;
      if (input.name !== s.q.fid) return;
      // A short pause so the filled card registers before the screen changes.
      setTimeout(function () { if (screens[current] === s) advance(); }, 190);
    });

    startBtn.addEventListener('click', function () {
      intro.hidden = true;
      quiz.hidden = false;
      goTo(0);
    });

    /* ----------------------------- drafts ----------------------------- */

    function saveDraft() {
      if (!CFG.SAVE_DRAFTS || submitted) return;
      var data = {};
      questions.forEach(function (q) {
        if (q.type === 'file') return;      // never store file bytes locally
        var v = valueOf(q);
        if (Array.isArray(v) ? v.length : String(v).length) data[q.fid] = v;
      });
      try { localStorage.setItem(draftKey, JSON.stringify(data)); } catch (err) {}
    }

    function loadDraft() {
      if (!CFG.SAVE_DRAFTS) return;
      var raw;
      try { raw = localStorage.getItem(draftKey); } catch (err) { return; }
      if (!raw) return;
      var data;
      try { data = JSON.parse(raw); } catch (err) { return; }

      Object.keys(data).forEach(function (fid) {
        var value = data[fid];

        // Match on TYPE as well as name. Text inputs and textareas also carry a
        // name attribute, so selecting on name alone routed them down the
        // radio/checkbox path, which sets `checked` and never touches `value` -
        // the answers stayed blank while the page claimed it had restored them.
        var boxes = formEl.querySelectorAll(
          'input[type="radio"][name="' + fid + '"], ' +
          'input[type="checkbox"][name="' + fid + '"]');

        if (boxes.length) {
          var wanted = Array.isArray(value) ? value : [value];
          Array.prototype.forEach.call(boxes, function (b) {
            if (wanted.indexOf(b.value) !== -1) b.checked = true;
          });
          return;
        }

        var node = document.getElementById('q_' + fid);
        if (!node) return;
        node.value = value;
        // Wakes up the minimum-character counter, which otherwise still reads
        // "Minimum 40 characters" under a restored answer that already clears it.
        node.dispatchEvent(new Event('input', { bubbles: true }));
      });

      document.getElementById('introNote').textContent =
        'We saved your answers on this device. Starting again picks up where you left off.';
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
      questions.forEach(function (q) {
        if (q.type === 'file') return;
        var v = valueOf(q);
        if (Array.isArray(v) ? v.length : String(v).length) answers[q.fid] = v;
      });

      // Attribution fields never render; the ad's URL supplies them.
      var p = params();
      (form.hidden || []).forEach(function (q) {
        var v = sourceAngle(p);
        if (v) answers[q.fid] = v;
      });

      busy('Sending');
      banner.removeAttribute('data-show');

      // The intake still insists a required file question arrives as a file. An
      // empty one is skipped before any Drive call, so it only satisfies that check;
      // the link itself travels in answers.
      var sentFiles = Object.keys(files).map(function (k) { return files[k]; });
      questions.forEach(function (q) {
        if (q.fileAsLink && q.intakeRequires && answers[q.fid]) {
          sentFiles.push({ fid: q.fid, name: 'link', mimeType: 'text/uri-list', data: '' });
        }
      });

      post({
        role: form.key,
        answers: answers,
        files: sentFiles,
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
        document.querySelector('.quiz__bar').style.display = 'none';
        // form.confirmation is deliberately NOT printed here. It reads "we review
        // every application and will email you if you are shortlisted", which is
        // word for word what steps 2 and 3 below already say, and saying it twice
        // made the receipt look padded. The steps are the canonical version; this
        // line carries a submission time instead, which is the one thing an
        // applicant cannot get anywhere else.
        var stamp = new Date();
        try {
          stamp = stamp.toLocaleString(undefined, {
            weekday: 'long', day: 'numeric', month: 'long',
            hour: 'numeric', minute: '2-digit'
          });
        } catch (err) { stamp = stamp.toString(); }
        document.getElementById('doneMessage').textContent =
          (res.demo ? 'Preview mode: nothing was saved, but every answer passed validation. '
                    : '') + 'Submitted ' + stamp + '.';

        // Name the role back to them. Someone who tapped three different ads
        // should not have to work out which one this receipt belongs to.
        // The trailing "Application" is stripped because one form is titled
        // "Onlyfans Chatter Application", which otherwise reads "you applied for
        // ... Application". No real job title ends in that word, so this is safe
        // for every role including any added later.
        document.getElementById('doneRole').textContent =
          'You applied for ' + form.title.replace(/\s+Application$/i, '') + '.';

        // Echo the address we will reply to, read from the payload we just sent
        // rather than the DOM. A mistyped email is the single error that makes a
        // good applicant unreachable, and this is the last moment they can spot it.
        var emailQ = questions.filter(function (q) { return q.type === 'email'; })[0];
        var applicantEmail = emailQ ? String(answers[emailQ.fid] || '') : '';
        if (applicantEmail) {
          document.getElementById('doneEmailStep').textContent =
            'If you are shortlisted, we will email you at ' + applicantEmail + '.';
        }

        // Roles with a Workstyle step get it back from the backend as the next
        // part of the application. Only the HR portal's own one-time handoff
        // URL is accepted, so a tampered response cannot send applicants away.
        var nextUrl = res.next && res.next.workstyleUrl;
        if (typeof nextUrl === 'string' && WORKSTYLE_NEXT_RE.test(nextUrl)) {
          document.getElementById('doneWorkstyleLink').setAttribute('href', nextUrl);
          document.getElementById('doneWorkstyle').hidden = false;
          // The interim "coming soon" notice would contradict a live Step 2.
          var soon = document.getElementById('doneWorkstyleSoon');
          if (soon) soon.hidden = true;
          var firstStep = document.querySelector('.done__next li');
          if (firstStep) firstStep.textContent = 'Your answers are saved. Finish the Workstyle Profile above.';
        }

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

    var startedAt = Date.now();
    loadDraft();
    paint();

    // A local preview must not write to the production "Page Views" tab. Opening
    // this page on localhost a few times while testing is enough to move the
    // completion rate that tab exists to measure. postings-live.js already treats
    // localhost as a separate world; this ping now does too.
    var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

    if (CFG.TRACK_PAGE_VIEWS && !isLocal) {
      post({ action: 'view', role: form.key, context: context() })
        .catch(function () { /* a blocked ping must never break the form */ });
    }
  }

  /* ================================ boot ================================ */

  // postings-live.js merges the admin app's live postings into WUNDER_FORMS
  // (in place, so FORMS above sees them) and then asks for a re-render.
  window.WUNDER_RERENDER = function () {
    if (PAGE === 'index') renderIndex();
    if (PAGE === 'apply') renderApply();
  };

  if (PAGE === 'index') renderIndex();
  if (PAGE === 'apply') renderApply();
})();
