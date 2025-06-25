/**
 * Clears all relevant browser storage that could affect the app's state
 * This includes localStorage, sessionStorage, and cookies
 */
export function clearBrowserStorage() {
  try {
    // Clear localStorage
    localStorage.clear();
    console.log('Cleared localStorage');

    // Clear sessionStorage
    sessionStorage.clear();
    console.log('Cleared sessionStorage');

    // Clear cookies
    document.cookie.split(';').forEach(cookie => {
      const [name] = cookie.split('=');
      document.cookie = `${name.trim()}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    });
    console.log('Cleared cookies');

    // Clear any cached data in memory
    if (window.performance && window.performance.clearResourceTimings) {
      window.performance.clearResourceTimings();
    }
    console.log('Cleared performance timings');

    return true;
  } catch (error) {
    console.error('Error clearing browser storage:', error);
    return false;
  }
} 