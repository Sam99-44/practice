/* nav.js - shared navigation + auth helpers for Practice Online */

(function () {
  // ✅ CHANGE THIS ONLY if your backend URL changes
  const API = "https://practice-backend-msgn.onrender.com";

  // Make API accessible in other scripts if you want
  window.API = API;

  // --------- Mobile Menu Toggle (optional) ----------
  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener("click", () => mobileMenu.classList.toggle("open"));
    mobileMenu.addEventListener("click", (e) => {
      if (e.target && e.target.tagName === "A") mobileMenu.classList.remove("open");
    });
  }

  // --------- Logout ----------
  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("me_cache");
    window.location.href = "login.html";
  }

  const logoutBtn = document.getElementById("logoutBtn");
  const logoutBtnMobile = document.getElementById("logoutBtnMobile");

  if (logoutBtn) logoutBtn.addEventListener("click", logout);
  if (logoutBtnMobile) logoutBtnMobile.addEventListener("click", logout);

  // --------- Helpers ----------
  function setDisplay(nodeList, show) {
    nodeList.forEach((el) => {
      el.style.display = show ? "" : "none";
    });
  }

  async function getMe(token) {
    // Small cache to avoid calling /me too often
    const cached = localStorage.getItem("me_cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // keep cache for 2 minutes
        if (Date.now() - parsed.time < 2 * 60 * 1000) return parsed.data;
      } catch {}
    }

    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    if (!data) return null;

    localStorage.setItem("me_cache", JSON.stringify({ time: Date.now(), data }));
    return data;
  }

  // --------- Main: Setup Nav ----------
  async function setupNav() {
    const token = localStorage.getItem("token");

    const authEls = document.querySelectorAll("[data-auth]");
    const guestEls = document.querySelectorAll("[data-guest]");
    const adminEls = document.querySelectorAll("[data-admin]");

    // Default: hide admin links
    setDisplay(adminEls, false);

    // Guest mode
    if (!token) {
      setDisplay(authEls, false);
      setDisplay(guestEls, true);
      return;
    }

    // Logged-in mode (for now)
    setDisplay(authEls, true);
    setDisplay(guestEls, false);

    // Check role
    try {
      const me = await getMe(token);

      // Token invalid -> force logout
      if (!me) {
        logout();
        return;
      }

      if (me.role === "admin") {
        setDisplay(adminEls, true);
      } else {
        setDisplay(adminEls, false);
      }

      // Optional: show username somewhere if you create an element:
      // <span id="navUsername"></span>
      const navUsername = document.getElementById("navUsername");
      if (navUsername) navUsername.textContent = me.username || "";
    } catch (err) {
      // If anything fails, just keep normal auth links visible
      console.warn("setupNav error:", err);
    }
  }

  setupNav();

  // --------- Optional helper functions for pages ----------
  window.auth = {
    API,
    token: () => localStorage.getItem("token"),
    logout,
    authHeader: () => {
      const t = localStorage.getItem("token");
      return t ? { Authorization: `Bearer ${t}` } : {};
    },
  };
})();
