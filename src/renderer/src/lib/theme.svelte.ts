/** Whether the system is in dark mode, kept up to date as it switches. */
const query = window.matchMedia('(prefers-color-scheme: dark)')

class Theme {
  dark = $state(query.matches)

  constructor() {
    query.addEventListener('change', (event) => (this.dark = event.matches))
  }
}

export const theme = new Theme()
