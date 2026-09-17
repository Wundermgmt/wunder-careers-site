/**
 * postings-live.js - merges live job postings from the hiring admin app into the
 * roles baked into forms.js.
 *
 * WHY IT IS ADDITIVE, NOT A REPLACEMENT: this page is the destination of paid ad
 * traffic. If it waited on the admin app it would inherit that app's cold start,
 * and a slow landing page costs applications. So forms.js renders first and this
 * only improves on it. Every failure path leaves the baked roles exactly as they
 * were - a dead API, a timeout, malformed JSON, all of them are silent no-ops.
 *
 * Rules:
 *   - a live posting matching a baked role UPDATES its card copy
 *   - a live posting with status Closed REMOVES that role from the page
 *   - a live posting with no baked role is ADDED with a default question set
 */
(function () {
  'use strict';

  var CFG = window.WUNDER_CONFIG || {};
  var API = CFG.POSTINGS_API;

  // Served from a local preview? Talk to the local admin app instead, so the
  // whole loop can be exercised without touching the deployed one.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    API = CFG.POSTINGS_API_LOCAL || 'http://localhost:4700/api/postings';
  }

  if (!API || !window.WUNDER_FORMS || !window.WUNDER_RERENDER) return;

  // Generous ON PURPOSE, and it looks wrong at first glance.
  //
  // This was 4s, which felt "safe" for an ad landing page. It was not: the baked
  // roles from forms.js are already on screen before this file even runs, so the
  // visitor never waits on this request no matter how long it takes. All a short
  // timeout achieved was aborting the fetch before a sleeping admin app could
  // answer, so live postings silently never applied.
  //
  // Measured in production on 2026-08-10: a cold Render free instance took
  // 4,551ms to get nowhere and was aborted; warm it answers in ~150ms. A cold
  // start can take ~50s, so anything below that is the same bug with a nicer
  // number. Cards update in place whenever the answer lands.
  var TIMEOUT_MS = 60000;

  /**
   * Questions asked for a role created in the admin tool, which has ad copy but
   * no question set of its own. Deliberately short: name, contact, CV, why.
   */
  /**
   * Job copy is rich text - headings, lists, links - so it cannot simply be
   * escaped without destroying every ad. But it arrives over the network and
   * lands in innerHTML, so it cannot be trusted either: anything that can write
   * a posting can otherwise run script on this page, and this page collects
   * names, phone numbers and CV uploads.
   *
   * So: parse it in an inert document (DOMParser runs nothing and loads
   * nothing), keep only the tags the ad copy actually uses, and drop every
   * attribute except a safe href/target/rel on a link.
   */
  var ALLOWED = { P: 1, BR: 1, H2: 1, H3: 1, H4: 1, UL: 1, OL: 1, LI: 1,
                  STRONG: 1, B: 1, EM: 1, I: 1, A: 1, HR: 1 };

  // Removed with their contents, rather than unwrapped - nobody wants the body
  // of a <script> surfacing as visible copy.
  var DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, NOSCRIPT: 1,
               TEMPLATE: 1, SVG: 1, MATH: 1, LINK: 1, META: 1, FORM: 1,
               INPUT: 1, BUTTON: 1, TEXTAREA: 1, SELECT: 1 };

  function sanitizeAdHtml(html) {
    if (!html) return '';
    if (typeof DOMParser !== 'function') return '';
    var doc;
    try {
      doc = new DOMParser().parseFromString(String(html), 'text/html');
    } catch (e) {
      return '';
    }
    if (!doc || !doc.body) return '';

    // Depth first, so a node's children are already clean by the time an
    // unsupported wrapper around them is unwrapped.
    function clean(node) {
      Array.prototype.slice.call(node.childNodes).forEach(clean);
      if (node.nodeType === 8) { node.parentNode.removeChild(node); return; }
      if (node.nodeType !== 1) return;

      var tag = node.tagName.toUpperCase();
      if (DROP[tag]) { node.parentNode.removeChild(node); return; }

      if (!ALLOWED[tag]) {
        // Keep the words, lose the tag.
        var parent = node.parentNode;
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        parent.removeChild(node);
        return;
      }

      Array.prototype.slice.call(node.attributes).forEach(function (attr) {
        var name = attr.name.toLowerCase();
        var keep = tag === 'A' && (name === 'href' || name === 'target' || name === 'rel');
        if (!keep) { node.removeAttribute(attr.name); return; }
        // javascript:, data:, vbscript: and friends.
        if (name === 'href' && !/^(https?:|mailto:)/i.test(String(attr.value).trim())) {
          node.removeAttribute('href');
        }
      });

      if (tag === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }

    // Walk body's CHILDREN, never body itself: BODY is not in the allowlist, so
    // handing it to clean() would unwrap the element out of its own document.
    Array.prototype.slice.call(doc.body.childNodes).forEach(clean);
    return doc.body.innerHTML;
  }

  // Plain text only - a summary is one line on a card, never markup.
  function sanitizeText(v) {
    return String(v == null ? '' : v).replace(/[<>]/g, '');
  }

  function defaultSteps(key) {
    return [
      {
        title: 'Your details',
        blurb: 'Name, contact and where you are based.',
        questions: [
          { fid: 'live_' + key + '_name', type: 'short', required: true, title: 'What is your full name?' },
          { fid: 'live_' + key + '_email', type: 'short', required: true, title: 'What is your Email?' },
          { fid: 'live_' + key + '_phone', type: 'short', required: true, title: 'What is your Phone Number?' },
          { fid: 'live_' + key + '_location', type: 'short', required: true, title: 'Where are you based?' }
        ]
      },
      {
        title: 'Your experience',
        blurb: 'Tell us why you are a fit.',
        questions: [
          { fid: 'live_' + key + '_cv', type: 'file', required: true, title: 'Please submit your CV in PDF format' },
          { fid: 'live_' + key + '_why', type: 'long', required: true,
            title: 'Describe in 100 words why are you applying for this job.' }
        ]
      }
    ];
  }

  function toForm(p) {
    return {
      key: p.key,
      title: p.title,
      roleCode: (p.key || '').slice(0, 3).toUpperCase(),
      tabFallback: p.title,
      card: {
        team: p.team || 'Other',
        pay: p.pay || '',
        range: p.earnings || '',
        hours: p.hours || '',
        summary: p.summary || ''
      },
      adHtml: sanitizeAdHtml(p.description) || '<p>' + sanitizeText(p.summary) + '</p>',
      confirmation: 'Thank you for applying. We review every application and will email you if you are shortlisted.',
      hidden: [{ fid: 'live_' + p.key + '_angle', type: 'short', required: false, title: 'Source Angle', hidden: true }],
      steps: defaultSteps(p.key),
      liveposting: true
    };
  }

  /**
   * Roles whose BAKED copy in forms.js is authoritative and must not be
   * overwritten by the admin app.
   *
   * Why this exists: the admin posting is the source of truth for role copy, so a
   * stale posting silently beats a correct forms.js. On 2026-08-20 the Editor Team
   * Leader ads went live advertising a $1,000 base and up to $1,500, while the
   * admin app still served $700 / up to $1,400, the retired title "Head of
   * Short-Form Editing", and "Monday - Saturday" hours. Every click landed on a
   * lower salary than the ad promised.
   *
   * Pinning is a STOPGAP, not the fix. Correct the posting in the Funnel Hiring
   * Admin UI, then delete its key from here so live postings work again.
   */
  var PINNED = { head_shortform_editing: true };

  function merge(postings) {
    var forms = window.WUNDER_FORMS;
    var byKey = {};
    postings.forEach(function (p) { if (p && p.key) byKey[p.key] = p; });

    // Update copy on roles the site already knows about.
    forms.forEach(function (f) {
      var p = byKey[f.key];
      if (!p) return;
      if (PINNED[f.key]) { delete byKey[f.key]; return; }
      if (p.title) f.title = p.title;
      if (p.team) f.card.team = p.team;
      if (p.pay) f.card.pay = p.pay;
      if (p.earnings) f.card.range = p.earnings;
      if (p.hours) f.card.hours = p.hours;
      if (p.summary) f.card.summary = p.summary;
      if (p.description) {
        var safe = sanitizeAdHtml(p.description);
        // An empty result means the posting was nothing but markup we refuse to
        // render. Keep the baked copy rather than blanking the role's page.
        if (safe) f.adHtml = safe;
      }
      delete byKey[f.key];
    });

    // Anything left is new. Mutate in place - app.js captured this array.
    Object.keys(byKey).forEach(function (k) { forms.push(toForm(byKey[k])); });
  }

  var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);

  fetch(API, ctrl ? { signal: ctrl.signal } : undefined)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (body) {
      if (!body || !Array.isArray(body.postings) || !body.postings.length) return;
      merge(body.postings);
      window.WUNDER_RERENDER();
    })
    .catch(function () { /* baked roles already rendered; nothing to do */ })
    .finally(function () { clearTimeout(timer); });
})();
