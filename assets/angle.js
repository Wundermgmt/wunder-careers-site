/**
 * angle.js - turns whatever Meta puts in the ad URL into one stable creative id.
 *
 * Meta sends the angle three different ways for the same creative, because the
 * ads carry `angle={{ad.name}}` and the macro is expanded, encoded and copied by
 * hand at different points:
 *
 *   Hiring | Creator Growth Manager | track_record
 *   Hiring+%7C+Creator+Growth+Manager+%7C+track_record
 *   track_record
 *
 * All three must land in the Sheet as `track_record`, or a group-by splits one
 * creative into three rows and quietly undercounts it. The macro also ships
 * unexpanded sometimes, and a literal "{{ad.name}}" is noise, not an angle.
 *
 * The raw value is never lost: the full landing URL is stored alongside it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WUNDER_ANGLE = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // "+" is a space in a query string, and decodeURIComponent does not know that.
  function decode(value) {
    var s = String(value).replace(/\+/g, ' ');
    try {
      return decodeURIComponent(s);
    } catch (err) {
      return s; // a stray % is not worth losing the whole value over
    }
  }

  function normalize(value) {
    if (value === undefined || value === null) return '';

    var s = decode(value).trim();
    if (!s) return '';

    // Meta shipped the macro without expanding it.
    if (/\{\{[\s\S]*\}\}/.test(s)) return '';

    // Ad names are "<date>. - <role> - <angle>" or "Hiring | <role> | <angle>".
    // The angle is always the last segment.
    var parts = s.split(/\s*\|\s*|\s+-\s+/);
    s = parts[parts.length - 1];

    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  return { normalize: normalize };
});
