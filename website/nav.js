/* nav.js - shared navigation + auth helpers for Practice Online
   ✅ Uses backend API
   ✅ Adds Dashboard link
   ✅ Adds Support link
   ✅ Adds Profile link
   ✅ Adds Subscription link
   ✅ Adds Admin Payments link (admin only)
   ✅ Supports logout
*/

(function () {

  const API = "https://practice-backend-msgn.onrender.com";
  window.API = API;

  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener("click", () => {
      mobileMenu.classList.toggle("open");
    });
  }

  function ensureLink(navRoot, options) {
    if (!navRoot) return;

    const { href, text } = options;

    const exists = [...navRoot.querySelectorAll("a")].some(a =>
      (a.getAttribute("href") || "").includes(href)
    );

    if (exists) return;

    const link = document.createElement("a");
    link.href = href;
    link.textContent = text;

    navRoot.appendChild(link);
  }

  function removeLink(navRoot, href) {
    if (!navRoot) return;

    [...navRoot.querySelectorAll("a")].forEach(a => {
      if ((a.getAttribute("href") || "").includes(href)) {
        a.remove();
      }
    });
  }

  const navDesktop = document.getElementById("desktopNav");
  const navMobile = document.getElementById("mobileMenu");

  const navs = [navDesktop, navMobile];

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("me_cache");
    window.location.href = "login.html";
  }

  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("logoutBtnMobile")?.addEventListener("click", logout);

  async function getMe(token) {

    const cached = localStorage.getItem("me_cache");

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.time < 120000) {
          return parsed.data;
        }
      } catch {}
    }

    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return null;

    const data = await res.json();

    localStorage.setItem("me_cache", JSON.stringify({
      time: Date.now(),
      data
    }));

    return data;
  }

  async function setupNav() {

    const token = localStorage.getItem("token");

    if (!token) {
      navs.forEach(nav => {
        removeLink(nav, "subscription.html");
        removeLink(nav, "admin-payments.html");
      });
      return;
    }

    const me = await getMe(token);
    if (!me) return;

    /* -----------------------
       NORMAL USER LINKS
    ----------------------- */

    navs.forEach(nav => {

      ensureLink(nav, {
        href: "dashboard.html",
        text: "Dashboard"
      });

      ensureLink(nav, {
        href: "profile.html",
        text: "Profile"
      });

      ensureLink(nav, {
        href: "support.html",
        text: "Support"
      });

      ensureLink(nav, {
        href: "subscription.html",
        text: "Subscription"
      });

    });

    /* -----------------------
       ADMIN LINK
    ----------------------- */

    if (me.role === "admin") {

      navs.forEach(nav => {

        ensureLink(nav, {
          href: "admin-payments.html",
          text: "Admin Payments"
        });

      });

    } else {

      navs.forEach(nav => {
        removeLink(nav, "admin-payments.html");
      });

    }

    const navUsername = document.getElementById("navUsername");

    if (navUsername) {
      navUsername.textContent = me.username || "";
    }

  }

  setupNav();

  window.auth = {
    API,
    token: () => localStorage.getItem("token"),
    logout,
    authHeader: () => {
      const t = localStorage.getItem("token");
      return t ? { Authorization: `Bearer ${t}` } : {};
    }
  };

})();
