// routes/tutors.js
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/User.js";
import TutorDocument from "../models/TutorDocument.js";

const router=express.Router();
const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const uploadsRoot=path.join(__dirname,"..","uploads");
const tutorDocsDir=path.join(uploadsRoot,"tutor-documents");
fs.mkdirSync(tutorDocsDir,{recursive:true});

const allowedRoles=["admin","tester","academic","editor","tutor"];

function authRequired(req,res,next){
  const header=req.headers.authorization||"";
  const token=header.startsWith("Bearer ")?header.slice(7):null;
  if(!token) return res.status(401).json({message:"Missing token."});
  try{req.user=jwt.verify(token,process.env.JWT_SECRET); next();}
  catch{return res.status(401).json({message:"Invalid token."})}
}
async function tutorOnly(req,res,next){
  const u=await User.findById(req.user.userId).select("fullName username email role");
  if(!u) return res.status(401).json({message:"User not found."});
  if(!allowedRoles.includes(String(u.role||"").toLowerCase())) return res.status(403).json({message:"Tutor/academic/admin access only."});
  req.tutor=u; next();
}
function clean(v=""){return String(v||"").trim().replace(/\s+/g," ")}
function docType(v=""){const t=String(v||"").toLowerCase(); return ["homework","notes","worksheet","memo","assignment","other"].includes(t)?t:"homework"}

const storage=multer.diskStorage({
  destination:(req,file,cb)=>cb(null,tutorDocsDir),
  filename:(req,file,cb)=>{
    const ext=path.extname(file.originalname||"").toLowerCase();
    const safe=[".doc",".docx",".pdf",".ppt",".pptx",".xls",".xlsx"].includes(ext)?ext:".docx";
    cb(null,`tutor-${req.user.userId}-${Date.now()}${safe}`);
  }
});
function filter(req,file,cb){
  const allowed=["application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/pdf","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
  if(!allowed.includes(file.mimetype)) return cb(new Error("Only Word, PDF, PowerPoint and Excel files allowed."));
  cb(null,true);
}
const upload=multer({storage,fileFilter:filter,limits:{fileSize:20*1024*1024}});

router.get("/me",authRequired,tutorOnly,(req,res)=>res.json(req.tutor));

router.post("/documents",authRequired,tutorOnly,upload.single("document"),async(req,res)=>{
  try{
    if(!req.file) return res.status(400).json({message:"Please upload a document."});
    const title=clean(req.body.title), subject=clean(req.body.subject), grade=Number(req.body.grade);
    if(!title||!subject) return res.status(400).json({message:"Title and subject are required."});
    if(!Number.isInteger(grade)||grade<8||grade>12) return res.status(400).json({message:"Grade must be 8 to 12."});
    const document=await TutorDocument.create({
      uploadedBy:req.user.userId,title,subject,grade,documentType:docType(req.body.documentType),
      description:clean(req.body.description),originalName:req.file.originalname,storedName:req.file.filename,
      fileUrl:`/uploads/tutor-documents/${req.file.filename}`,mimeType:req.file.mimetype,sizeBytes:req.file.size,isPublished:true
    });
    res.status(201).json({message:"Document uploaded successfully.",document});
  }catch(e){res.status(500).json({message:"Could not upload document."})}
});

router.get("/documents",authRequired,async(req,res)=>{
  const filter={isPublished:true};
  const grade=Number(req.query.grade); if(Number.isInteger(grade)&&grade>=8&&grade<=12) filter.grade=grade;
  if(req.query.subject) filter.subject=new RegExp(clean(req.query.subject),"i");
  if(req.query.documentType) filter.documentType=docType(req.query.documentType);
  const docs=await TutorDocument.find(filter).populate("uploadedBy","fullName username email role").sort({createdAt:-1}).lean();
  res.json(docs);
});

router.get("/documents/my",authRequired,tutorOnly,async(req,res)=>{
  const docs=await TutorDocument.find({uploadedBy:req.user.userId}).sort({createdAt:-1}).lean();
  res.json(docs);
});

router.delete("/documents/:id",authRequired,tutorOnly,async(req,res)=>{
  const doc=await TutorDocument.findById(req.params.id);
  if(!doc) return res.status(404).json({message:"Document not found."});
  const role=String(req.tutor.role||"").toLowerCase();
  if(String(doc.uploadedBy)!==String(req.user.userId) && !["admin","tester","academic"].includes(role)) return res.status(403).json({message:"You can only delete your own uploads."});
  const filePath=path.join(tutorDocsDir,doc.storedName);
  if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
  await TutorDocument.deleteOne({_id:doc._id});
  res.json({message:"Document deleted successfully."});
});

export default router;
