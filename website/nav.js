/* nav.js - Practice Online Navigation System
   Works with layout.js

   FEATURES
   - Dashboard link
   - Profile link
   - Support link
   - Subscription link
   - Announcements link
   - Admin dropdown (admin only)
   - Mobile navigation support
   - Logout
*/

(function () {

const API = "https://practice-backend-msgn.onrender.com";
window.API = API;

/* -----------------------------
MENU TOGGLE
----------------------------- */

const menuBtn = document.getElementById("menuBtn");
const mobileMenu = document.getElementById("mobileMenu");

if (menuBtn && mobileMenu) {

menuBtn.addEventListener("click", () => {
mobileMenu.classList.toggle("open");
});

mobileMenu.addEventListener("click", (e) => {
if (e.target.tagName === "A") {
mobileMenu.classList.remove("open");
}
});

}

/* -----------------------------
ACTIVE PAGE
----------------------------- */

function getCurrentFile() {
const path = window.location.pathname.toLowerCase();
const parts = path.split("/");
return parts.pop() || "index.html";
}

function markActive(navRoot){

if(!navRoot) return;

const current = getCurrentFile();

[...navRoot.querySelectorAll("a")].forEach(a => {

const href = (a.getAttribute("href") || "").toLowerCase();
const file = href.split("/").pop();

if(file === current){

a.classList.add("active");

const dropdown = a.closest(".nav-dropdown");
if(dropdown) dropdown.classList.add("active");

}

});

}

/* -----------------------------
ADD LINK IF MISSING
----------------------------- */

function ensureLink(navRoot,{href,text}){

if(!navRoot) return;

const exists = [...navRoot.querySelectorAll("a")].some(a=>{
const h=(a.getAttribute("href")||"").toLowerCase();
const t=(a.textContent||"").trim().toLowerCase();
return h===href.toLowerCase()||t===text.toLowerCase();
});

if(exists){
markActive(navRoot);
return;
}

const link=document.createElement("a");
link.href=href;
link.textContent=text;

navRoot.appendChild(link);

markActive(navRoot);

}

/* -----------------------------
REMOVE LINK
----------------------------- */

function removeLink(navRoot,key){

if(!navRoot) return;

key=key.toLowerCase();

[...navRoot.querySelectorAll("a")].forEach(a=>{

const h=(a.getAttribute("href")||"").toLowerCase();
const t=(a.textContent||"").trim().toLowerCase();

if(h.includes(key)||t===key){
a.remove();
}

});

}

/* -----------------------------
LOGOUT
----------------------------- */

function logout(){

localStorage.removeItem("token");
localStorage.removeItem("username");
localStorage.removeItem("me_cache");

window.location.href="login.html";

}

document.getElementById("logoutBtn")?.addEventListener("click",logout);
document.getElementById("logoutBtnMobile")?.addEventListener("click",logout);

/* -----------------------------
GET CURRENT USER
----------------------------- */

async function getMe(token){

const cached=localStorage.getItem("me_cache");

if(cached){

try{

const parsed=JSON.parse(cached);

if(Date.now()-parsed.time<120000){
return parsed.data;
}

}catch{}

}

const res=await fetch(`${API}/api/auth/me`,{
headers:{Authorization:`Bearer ${token}`}
});

if(res.status===401||res.status===403) return "UNAUTH";

if(!res.ok) return null;

const data=await res.json().catch(()=>null);

if(!data) return null;

localStorage.setItem("me_cache",JSON.stringify({
time:Date.now(),
data
}));

return data;

}

/* -----------------------------
NAV ROOTS
----------------------------- */

function getNavRoots(){

const roots=[
document.getElementById("desktopNav"),
document.getElementById("mobileMenu"),
document.querySelector("nav.nav"),
document.querySelector("nav")
].filter(Boolean);

return [...new Set(roots)];

}

/* -----------------------------
ADMIN DROPDOWN
----------------------------- */

function ensureAdminDropdown(navRoot){

if(!navRoot) return;

if(navRoot.querySelector(".nav-dropdown")) return;

const dropdown=document.createElement("div");
dropdown.className="nav-dropdown";

const btn=document.createElement("button");
btn.className="nav-dropdown-toggle";
btn.textContent="Admin";

const menu=document.createElement("div");
menu.className="nav-dropdown-menu";

menu.innerHTML=`
<a href="admin.html">Admin Dashboard</a>
<a href="admin-payments.html">Admin Payments</a>
<a href="admin-announcements.html">Admin Announcements</a>
`;

btn.onclick=(e)=>{
e.stopPropagation();
dropdown.classList.toggle("open");
};

dropdown.appendChild(btn);
dropdown.appendChild(menu);

navRoot.appendChild(dropdown);

}

/* close dropdown if clicking outside */

document.addEventListener("click",()=>{
document.querySelectorAll(".nav-dropdown.open")
.forEach(d=>d.classList.remove("open"));
});

/* -----------------------------
MAIN NAV SETUP
----------------------------- */

async function setupNav(){

const token=localStorage.getItem("token");

const navs=getNavRoots();

navs.forEach(markActive);

if(!token){

navs.forEach(nav=>{

removeLink(nav,"dashboard.html");
removeLink(nav,"profile.html");
removeLink(nav,"subscription.html");
removeLink(nav,"support.html");
removeLink(nav,"announcements.html");

});

return;

}

const me=await getMe(token);

if(me==="UNAUTH"){
logout();
return;
}

if(!me) return;

/* normal user links */

navs.forEach(nav=>{

ensureLink(nav,{href:"dashboard.html",text:"Dashboard"});
ensureLink(nav,{href:"profile.html",text:"Profile"});
ensureLink(nav,{href:"support.html",text:"Support"});
ensureLink(nav,{href:"subscription.html",text:"Subscription"});
ensureLink(nav,{href:"announcements.html",text:"Announcements"});

});

/* admin dropdown */

if(me.role==="admin"){

navs.forEach(nav=>{
ensureAdminDropdown(nav);
});

}

/* username */

const navUsername=document.getElementById("navUsername");

if(navUsername){
navUsername.textContent=me.username||"";
}

}

setupNav();

/* -----------------------------
AUTH HELPERS
----------------------------- */

window.auth={
API,
token:()=>localStorage.getItem("token"),
logout,
authHeader:()=>{
const t=localStorage.getItem("token");
return t?{Authorization:`Bearer ${t}`}:{};
}
};

})();
