// Clicking the toolbar icon opens the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(function (err) { console.error('setPanelBehavior failed', err); });
