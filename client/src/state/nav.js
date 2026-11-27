/**
 * Navigation. The address bar holds the screen (#/today, #/profile …), so
 * reload and the Back button work. `go(name)` changes it; App.jsx listens to
 * the change and shows that screen, if the person may see it.
 */
export const go = (name) => { location.hash = `#/${name}`; };
