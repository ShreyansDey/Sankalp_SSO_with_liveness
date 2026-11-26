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

  function resolveEndpoints(clientId, defaultPort) {
    var loc = window.location;
    var host = loc.hostname;
    var proto = loc.protocol;
    var isDirectPort = loc.port === String(defaultPort);
    var isSaDomain = host.endsWith(".sa");
    var isVercel = host.includes("vercel.app");

    var authServer;
    var centralPortal;
    var redirectUri;

    if (isSaDomain) {
      authServer = proto + "//sankalp.sa";
      centralPortal = proto + "//sankalp.sa";
      redirectUri = loc.origin + "/callback";
    } else if (isVercel) {
      authServer = "https://sankalp-unified-sso-system.onrender.com";
      centralPortal = "https://sankalpunifiedssosystem.vercel.app";
      redirectUri = loc.origin + "/" + clientId + "/index.html";
    } else if (isDirectPort) {
      authServer = proto + "//" + host + ":8001";
      centralPortal = "http://localhost:5180";
      redirectUri = proto + "//" + host + ":" + defaultPort + "/callback";
    } else {
      authServer = loc.origin;
      centralPortal = loc.origin;
      redirectUri = loc.origin + "/" + clientId + "/callback";
    }

    return {
      authServer: authServer,
      centralPortal: centralPortal,
      redirectUri: redirectUri,
      isDirectPort: isDirectPort
    };
  }

  global.SankalpDemoAuth = {
    escapeHtml: escapeHtml,
    verifyOAuthState: verifyOAuthState,
    resolveEndpoints: resolveEndpoints,
  };
})(window);
