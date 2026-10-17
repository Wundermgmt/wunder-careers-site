/**
 * config.js - the only file you edit by hand.
 *
 * ENDPOINT is where applications and page views are posted.
 * Everything else has a sensible default.
 */
window.WUNDER_CONFIG = {
  // The careers intake behind the Wunder Portal (wunder-hr-suite,
  // wunder-hr-app/lib/hiring/careers-intake.js). It writes the same rows to the
  // Master Sheet that the Apps Script web app did.
  //
  // The Apps Script web app (.../macros/s/AKfycbwj6w_hsJV1rwMxPO4keTQycKNiKMzCi0vNWiKUbmjasopV3w7oZSR422p_2DQlEWBv6g/exec)
  // stopped taking applications on 2026-10-16: Workspace sharing limits it to
  // "Anyone in KG Management", so applicants got a Google sign-in and
  // "Failed to fetch". Switch back only if it is deployed to "Anyone" again.
  ENDPOINT: "https://wunderportal.com/hr/hiring-admin/app/careers/apply",

  // Logs one row per page open to the "Page Views" tab. Applications divided by
  // page views is the real completion rate, measured on our side rather than
  // inferred from Meta.
  TRACK_PAGE_VIEWS: true,

  // Must match CONFIG.MAX_FILE_MB in Config.gs.
  MAX_FILE_MB: 8,

  // Live job postings, served by the hiring admin app. When this is unreachable
  // the site falls back to the roles baked into forms.js, so the page never
  // depends on the admin app being awake.
  POSTINGS_API: "https://wunder-hiring-admin.onrender.com/api/postings",

  // Lets an applicant close the tab and come back without losing their answers.
  // Files are never saved to the browser, only text.
  SAVE_DRAFTS: true,

  COMPANY: {
    name: "Wunder Management",
    site: "https://wundermgmt.com",
    privacy: "https://wundermgmt.com/imprint",
    founder: "https://www.instagram.com/lauris_kalnins",
    email: "ja@kgmodelmanagement.com"
  }
};
