



import express from "express";
import User from "../models/User.js";
import rateLimit from "express-rate-limit";

export default function createDynamicPracticeRoutes(authRequired, adminOnly) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (process.env.DYNAMIC_PRACTICE_ENABLED !== "true")
      return res.status(503).json({message:"Dynamic Practice is not enabled."});
    next();
  });
  router.use(authRequired, (req, res, next) => {
    if (!/^[a-f0-9]{24}$/i.test(String(req.user?.userId || "")))
      return res.status(401).json({message:"Invalid learner account."});
    next();
  });
  router.use(rateLimit({windowMs:60000, max:60,
    keyGenerator:req=>String(req.user.userId).toLowerCase(),
    message:{message:"Too many practice requests. Try again shortly."}}));
  // Explicit local pilot; never enable this flag in production.
  router.use(async (req, res, next) => {
    if (process.env.DYNAMIC_LEARNER_PILOT !== "true" || process.env.NODE_ENV === "production") {
      return adminOnly(req, res, next);
    }
    // Check the actual peer, not a spoofable forwarded header.
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress)) {
      return adminOnly(req, res, next);
    }
    try {
      const user = await User.findById(req.user.userId).select("role accountType").lean();
      if (!user) return res.status(401).json({message:"Account not found."});
      const role = String(user.role || "").trim().toLowerCase();
      if (["admin", "tester"].includes(role) || (role === "learner" && ["learner", "practice"].includes(String(user.accountType || "").trim().toLowerCase()))) return next();
      return res.status(403).json({message:"Dynamic Practice is not available for this account."});
    } catch { return res.status(500).json({message:"Unable to verify practice access."}); }
  });
  async function forward(req, res, endpoint, query, body) {
    const secret = process.env.DYNAMIC_API_SECRET || "";
    const origin = process.env.DYNAMIC_API_URL || "http://127.0.0.1:8000";
    if (secret.length < 32) return res.status(503).json({message:"Practice service is not configured."});
    try {
      const url = new URL("/api/mathematics/" + endpoint, origin);
      if (query) url.search = new URLSearchParams(query).toString();
      const upstream = await fetch(url, {method: body ? "POST" : "GET", redirect:"error",
        headers:{"Content-Type":"application/json", "X-Dynamic-Secret":secret,
          "X-Learner-Id":String(req.user.userId)},
        ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(10000)});
      const data = await upstream.json();
      if (upstream.status >= 500) return res.status(502).json({message:"Practice service unavailable."});
      return res.status(upstream.status).json(data);
    } catch { return res.status(502).json({message:"Practice service unavailable. Try again shortly."}); }
  }
  router.get("/catalog", (req,res)=>forward(req,res,"catalog"));
  router.get("/skills", (req,res)=>forward(req,res,"skills"));
  router.get("/generate", (req,res)=>{
    const {grade,topic,level,skill}=req.query;
    if (![grade,topic,level,skill].every(v=>typeof v==="string" && v.length<=80) ||
        !["8","10"].includes(grade) || !["foundation","advanced"].includes(level))
      return res.status(400).json({message:"Invalid practice selection."});
    return forward(req,res,"generate",{grade,topic,level,skill});
  });
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  router.post("/submit", (req,res)=>{
    const {question_id,answer,request_id}=req.body || {};
    if (typeof question_id!=="string" || !uuid.test(question_id) ||
        typeof request_id!=="string" || !uuid.test(request_id) ||
        typeof answer!=="string" || !answer.trim() || answer.length>160)
      return res.status(400).json({message:"Invalid answer submission."});
    return forward(req,res,"submit",null,{question_id,answer,request_id});
  });
  router.get("/hint/:id", (req,res)=>{
    if (!uuid.test(req.params.id)) return res.status(400).json({message:"Invalid question."});
    return forward(req,res,"hint/"+req.params.id);
  });
  return router;
}