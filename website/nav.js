/* nav.js - shared navigation + auth helpers for Practice Online
   ✅ Uses backend API
   ✅ Adds Dashboard link to desktop + mobile nav
   ✅ Adds Support link to desktop + mobile nav
   ✅ Adds Profile link to desktop + mobile nav
   ✅ Adds Subscription link for authenticated users
   ✅ Auto-hides Admin link for non-admin users
   ✅ Supports logout buttons
   ✅ Caches /api/auth/me briefly
   ✅ Uses dashboard.html
   ✅ Uses subscription.html
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

    mobileMenu.addEventListener("click", (e) => {
      if (e.target && e.target.tagName === "A") {
        mobileMenu.classList.remove("open");
      }
    });
  }

  function getCurrentFile() {
    const path = (window.location.pathname || "").toLowerCase();
    const parts = path.split("/");
    return parts[parts.length - 1] || "";
  }

  function markActiveLink(navRoot) {
    if (!navRoot) return;

    const currentFile = getCurrentFile();

    [...navRoot.querySelectorAll("a")].forEach((a) => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      if (!href) return;

      const hrefFile = href.split("/").pop();
      if (hrefFile && hrefFile === currentFile) {
        a.classList.add("active");
      }
    });
  }

  function ensureLink(
    navRoot,
    { href, text, insertAfterHrefIncludes, insertBeforeHrefIncludes, dataAuth = false }
  ) {
    if (!navRoot) return;

    const already = [...navRoot.querySelectorAll("a")].some((a) => {
      const h = (a.getAttribute("href") || "").toLowerCase();
      const t = (a.textContent || "").trim().toLowerCase();
      return h.includes(href.toLowerCase()) || t === text.toLowerCase();
    });

    if (already) {
      markActiveLink(navRoot);
      return;
    }

    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;

    if (dataAuth) a.setAttribute("data-auth", "1");

    const links = [...navRoot.querySelectorAll("a")];

    const afterLink = insertAfterHrefIncludes
      ? links.find((x) =>
          ((x.getAttribute("href") || "").toLowerCase()).includes(
            insertAfterHrefIncludes.toLowerCase()
          )
        )
      : null;

    const beforeLink = insertBeforeHrefIncludes
      ? links.find((x) =>
          ((x.getAttribute("href") || "").toLowerCase()).includes(
            insertBeforeHrefIncludes.toLowerCase()
          )
        )
      : null;

    if (afterLink && afterLink.parentNode === navRoot) {
      afterLink.insertAdjacentElement("afterend", a);
    } else if (beforeLink && beforeLink.parentNode === navRoot) {
      beforeLink.insertAdjacentElement("beforebegin", a);
    } else {
      navRoot.appendChild(a);
    }

    markActiveLink(navRoot);
  }

  function removeLinkIfExists(navRoot, hrefOrText) {
    if (!navRoot) return;

    [...navRoot.querySelectorAll("a")].forEach((a) => {
      const h = (a.getAttribute("href") || "").toLowerCase();
      const t = (a.textContent || "").trim().toLowerCase();
      const key = hrefOrText.toLowerCase();

      if (h.includes(key) || t === key) {
        a.remove();
      }
    });
  }

  function setDisplay(nodeList, show) {
    nodeList.forEach((el) => {
      el.style.display = show ? "" : "none";
    });
  }

  const navDesktop1 = document.querySelector("nav.nav");
  const navDesktop2 = document.getElementById("desktopNav");
  const navMobile = document.getElementById("mobileMenu");
  const navs = [navDesktop1, navDesktop2, navMobile];

  // Dashboard
  navs.forEach((navRoot) => {
    ensureLink(navRoot, {
      href: "dashboard.html",
      text: "Dashboard",
      insertAfterHrefIncludes: "results",
      insertBeforeHrefIncludes: "support",
      dataAuth: true,
    });
  });

  // Support
  navs.forEach((navRoot) => {
    ensureLink(navRoot, {
      href: "support.html",
      text: "Support",
      insertAfterHrefIncludes: "dashboard",
      insertBeforeHrefIncludes: "about",
      dataAuth: true,
    });
  });

  // Profile
  navs.forEach((navRoot) => {
    ensureLink(navRoot, {
      href: "profile.html",
      text: "Profile",
      insertAfterHrefIncludes: "announcements",
      insertBeforeHrefIncludes: "subscription",
      dataAuth: true,
    });
  });

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
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 || res.status === 403) return "UNAUTH";
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    if (!data) return null;

    localStorage.setItem(
      "me_cache",
      JSON.stringify({
        time: Date.now(),
        data,
      })
    );

    return data;
  }

  async function setupNav() {
    const token = localStorage.getItem("token");

    const authEls = document.querySelectorAll("[data-auth]");
    const guestEls = document.querySelectorAll("[data-guest]");
    const adminEls = document.querySelectorAll("[data-admin]");

    setDisplay(adminEls, false);

    navs.forEach((navRoot) => {
      markActiveLink(navRoot);
    });

    if (!token) {
      setDisplay(authEls, false);
      setDisplay(guestEls, true);

      navs.forEach((navRoot) => removeLinkIfExists(navRoot, "subscription.html"));
      navs.forEach((navRoot) => removeLinkIfExists(navRoot, "subscription"));
      return;
    }

    setDisplay(authEls, true);
    setDisplay(guestEls, false);

    const me = await getMe(token);

    if (me === "UNAUTH") {
      logout();
      return;
    }

    if (!me) return;

    // Subscription for authenticated users
    navs.forEach((navRoot) => {
      ensureLink(navRoot, {
        href: "subscription.html",
        text: "Subscription",
        insertAfterHrefIncludes: "profile",
        insertBeforeHrefIncludes: "support",
        dataAuth: true,
      });
    });

    if (me.role === "admin") {
      setDisplay(adminEls, true);
    } else {
      setDisplay(adminEls, false);
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
    },
  };
})();
