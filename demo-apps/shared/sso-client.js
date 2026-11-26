(function (global) {
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function verifyOAuthState(urlParams) {
    var returnedState = urlParams.get("state");
    var expectedState = sessionStorage.getItem("oauth_state");
    if (expectedState && returnedState !== expectedState) {
      return false;
    }
    sessionStorage.removeItem("oauth_state");
    return true;
  }

  global.SankalpDemoAuth = {
    escapeHtml: escapeHtml,
    verifyOAuthState: verifyOAuthState,
  };
})(window);
