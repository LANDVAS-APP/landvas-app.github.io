// Build-time switches. Vite replaces import.meta.env.MODE when it builds, so code behind `!NATIVE_APP` is removed from
// the iOS and Android apps entirely (not just hidden): the apps never contain admin, moderator or developer tools.
// Staff work in the admin portal (admin.landvas.app) or the website.

/** the iOS / Android app build (`vite build --mode native`) */
export const NATIVE_APP = import.meta.env.MODE === 'native';
