/**
 * config.js - the only file you edit by hand.
 *
 * After deploying the Apps Script web app, paste its /exec URL into ENDPOINT.
 * Everything else has a sensible default.
 */
window.WUNDER_CONFIG = {
  // Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone)
  // then copy the URL that ends in /exec.
  ENDPOINT: "https://script.google.com/macros/s/AKfycbwj6w_hsJV1rwMxPO4keTQycKNiKMzCi0vNWiKUbmjasopV3w7oZSR422p_2DQlEWBv6g/exec",

  // Logs one row per page open to the "Page Views" tab. Applications divided by
  // page views is the real completion rate, measured on our side rather than
  // inferred from Meta.
  TRACK_PAGE_VIEWS: true,

  // Must match CONFIG.MAX_FILE_MB in Config.gs.
  MAX_FILE_MB: 8,

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
