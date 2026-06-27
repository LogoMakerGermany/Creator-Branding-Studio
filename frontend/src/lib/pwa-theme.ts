export function applyPwaTheme(themeColor: string, appName?: string) {
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', themeColor);

  if (appName) {
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.setAttribute('content', appName.slice(0, 12));
    document.title = appName.length > 20 ? `${appName} – UCBS` : appName;
  }
}

export function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
