/* nav.js - shared navigation + auth helpers for Practice Online (SAFE)
   ✅ Adds Subscription link to BOTH desktop + mobile nav (if present)
   ✅ Adds Support link to BOTH desktop + mobile nav (if present)
   ✅ Adds Dashboard link to BOTH desktop + mobile nav (if present)
   ✅ Auto-hides Admin link for non-admin users
   ✅ Keeps existing logic + styling safe
*/

(function () {
  const API = "https://practice-backend-msgn.onrender.com";
  window.API = API;

  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener("click", () => mobileMenu.classList.toggle("open"));
    mobileMenu.addEventListener("click", (e) => {
      if (e.target && e.target.tagName === "A") mobileMenu.classList.remove("open");
    });
  }

  // ✅ Inject "Dashboard" + "Subscription" + "Support" link into desktop + mobile nav
  function ensureLinks() {
    const addLinkIfMissing = (
      navRoot,
      { href, text, insertAfterHrefIncludes, insertBeforeHrefIncludes, dataAuth = false }
    ) => {
      if (!navRoot) return;

      const already = [...navRoot.querySelectorAll("a")].some((a) => {
        const h = (a.getAttribute("href") || "").toLowerCase();
        const t = (a.textContent || "").trim().toLowerCase();
        return h.includes(href.toLowerCase()) || t === text.toLowerCase();
      });
      if (already) return;

      const a = document.createElement("a");
      a.href = href;
      a.textContent = text;

      if (dataAuth) a.setAttribute("data-auth", "1");

      const links = [...navRoot.querySelectorAll("a")];

      const afterLink = insertAfterHrefIncludes
        ? links.find((x) =>
            ((x.getAttribute("href") || "").toLowerCase()).includes(insertAfterHrefIncludes.toLowerCase())
          )
        : null;

      const beforeLink = insertBeforeHrefIncludes
        ? links.find((x) =>
            ((x.getAttribute("href") || "").toLowerCase()).includes(insertBeforeHrefIncludes.toLowerCase())
          )
        : null;

      if (afterLink && afterLink.parentNode === navRoot) {
        afterLink.insertAdjacentElement("afterend", a);
      } else if (beforeLink && beforeLink.parentNode === navRoot) {
        beforeLink.insertAdjacentElement("beforebegin", a);
      } else {
        navRoot.appendChild(a);
      }

      try {
        const path = (window.location.pathname || "").toLowerCase();
        const isActive = path.endsWith("/" + href.toLowerCase()) || path.endsWith(href.toLowerCase());
        if (isActive) a.classList.add("active");
      } catch {}
    };

    const navDesktop1 = document.querySelector("nav.nav");
    const navDesktop2 = document.getElementById("desktopNav");
    const navMobile = document.getElementById("mobileMenu");

    const navs = [navDesktop1, navDesktop2, navMobile];

    // ✅ Dashboard
    navs.forEach((navRoot) => {
      addLinkIfMissing(navRoot, {
        href: "progress-dashboard.html",
        text: "Dashboard",
        insertAfterHrefIncludes: "results",
        insertBeforeHrefIncludes: "subscription",
        dataAuth: true,
      });
    });

    // ✅ Subscription
    navs.forEach((navRoot) => {
      addLinkIfMissing(navRoot, {
        href: "payment.html",
        text: "Subscription",
        insertAfterHrefIncludes: "dashboard",
        insertBeforeHrefIncludes: "support",
        dataAuth: true,
      });
    });

    // ✅ Support
    navs.forEach((navRoot) => {
      addLinkIfMissing(navRoot, {
        href: "support.html",
        text: "Support",
        insertAfterHrefIncludes: "payment",
        insertBeforeHrefIncludes: "about",
        dataAuth: true,
      });
    });
  }

  ensureLinks();

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("me_cache");
    window.location.href = "login.html";
  }

  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("logoutBtnMobile")?.addEventListener("click", logout);

  function setDisplay(nodeList, show) {
    nodeList.forEach((el) => (el.style.display = show ? "" : "none"));
  }

  async function getMe(token) {
    const cached = localStorage.getItem("me_cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.time < 120000) return parsed.data;
      } catch {}
    }

    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 || res.status === 403) return "UNAUTH";
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    if (!data) return null;

    localStorage.setItem("me_cache", JSON.stringify({ time: Date.now(), data }));
    return data;
  }

  async function setupNav() {
    const token = localStorage.getItem("token");

    const authEls = document.querySelectorAll("[data-auth]");
    const guestEls = document.querySelectorAll("[data-guest]");
    const adminEls = document.querySelectorAll("[data-admin]");

    setDisplay(adminEls, false);

    if (!token) {
      setDisplay(authEls, false);
      setDisplay(guestEls, true);
      return;
    }

    setDisplay(authEls, true);
    setDisplay(guestEls, false);

    const me = await getMe(token);
    if (me === "UNAUTH") return logout();
    if (!me) return;

    if (me.role === "admin") setDisplay(adminEls, true);

    const navUsername = document.getElementById("navUsername");
    if (navUsername) navUsername.textContent = me.username || "";
  }

  setupNav();

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
