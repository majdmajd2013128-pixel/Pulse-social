import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-this-secret-before-deploying';
const db = new Database(path.join(__dirname, 'pulse.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, full_name TEXT NOT NULL, bio TEXT DEFAULT '', avatar TEXT DEFAULT '', role TEXT DEFAULT 'user', verified INTEGER DEFAULT 0, banned INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, caption TEXT DEFAULT '', image_url TEXT DEFAULT '', kind TEXT DEFAULT 'post', likes INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS follows (follower_id INTEGER NOT NULL, following_id INTEGER NOT NULL, UNIQUE(follower_id, following_id));
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL, recipient_id INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
const count = (table) => db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
const insertUser = db.prepare('INSERT OR IGNORE INTO users(username,email,password_hash,full_name,bio,avatar,role,verified) VALUES(?,?,?,?,?,?,?,?)');
const demoUsers = [
 ['maya.jpg','maya','Maya Chen','Creative director · collecting little moments'],
 ['noah.jpg','noah','Noah Williams','Outdoors, coffee, and the long way home'],
 ['sara.jpg','sara','Sara Haddad','Designing a softer kind of life'],
 ['leo.jpg','leo','Leo Martin','Film photos & weekend escapes'],
 ['amira.jpg','amira','Amira Noor','Art, architecture, and everything between'],
 ['ethan.jpg','ethan','Ethan Cole','Building things that matter'],
 ['lina.jpg','lina','Lina Benali','Morocco through my lens'],
 ['alex.jpg','alex','Alex Rivera','Music is the whole point'],
 ['yuki.jpg','yuki','Yuki Tanaka','Slow mornings, fast trains'],
 ['adam.jpg','adam','Adam Brooks','Running on sunlight']
];
const demoPhotos = [
 'photo-1470770841072-f978cf4d019e','photo-1500530855697-b586d89ba3ee','photo-1470252649378-9c29740c9fa8',
 'photo-1518837695005-2083093ee35b','photo-1472214103451-9374bd1c798e','photo-1519608487953-e999c86e7455',
 'photo-1501785888041-af3ef285b470','photo-1490730141103-6cac27aaab94','photo-1464822759023-fed622ff2c3b',
 'photo-1500534623283-312aade485b7'
];
if (!count('users')) {
  const adminName = process.env.ADMIN_USERNAME || 'P_tini8';
  // Default password is stored as a bcrypt hash, never as plaintext in source.
  // Set ADMIN_PASSWORD in your local .env to replace it before public deployment.
  const defaultAdminHash = '$2a$12$uK1KyEfh2AKzcHOcXEwDI.U.NI3c.O/gasV3CCCH71Pr17RbbsE3G';
  const adminHash = process.env.ADMIN_PASSWORD
    ? bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12)
    : defaultAdminHash;
  insertUser.run(adminName, `${adminName}@pulse.local`, adminHash, 'Pulse Admin', 'Making the pulse move.', '', 'admin', 1);
  for (const [avatar, username, fullName, bio] of demoUsers) {
    insertUser.run(username, `${username}@example.test`, bcrypt.hashSync('demo12345', 10), fullName, bio, `https://i.pravatar.cc/160?u=${username}`, 'user', 0);
  }
  const users = db.prepare('SELECT id FROM users ORDER BY id').all();
  const addPost = db.prepare('INSERT INTO posts(user_id,caption,image_url,kind,likes) VALUES(?,?,?,?,?)');
  users.slice(1).forEach((u, i) => {
    addPost.run(u.id, [
      'Somewhere between the plans and the moment ✨ #weekend',
      'A little reminder to look up more often.',
      'Golden hour always knows what it is doing. #light',
      'Collecting places, not things.',
      'The world feels different when you slow down.',
      'A frame from today. Nothing more, nothing less.',
      'The kind of view that makes you stay a little longer.',
      'Life lately, in small beautiful pieces.',
      'Out here finding my own rhythm. #travel',
      'Save a little wonder for yourself.'
    ][i], `https://images.unsplash.com/${demoPhotos[i]}?auto=format&fit=crop&w=1100&q=85`, i % 4 === 0 ? 'reel' : 'post', Math.floor(18 + Math.random()*240));
  });
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
function auth(req,res,next) {
  const token = req.cookies.pulse_token || (req.headers.authorization || '').replace(/^Bearer /,'');
  if (!token) return res.status(401).json({ error:'Please sign in.' });
  try {
    const data = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id,username,email,full_name,bio,avatar,role,verified,banned FROM users WHERE id=?').get(data.id);
    if (!user) return res.status(401).json({ error:'Account not found.' });
    if (user.banned) { res.clearCookie('pulse_token'); return res.status(403).json({ error:'Your account is banned.', banned:true }); }
    req.user = user; next();
  } catch { return res.status(401).json({ error:'Session expired. Please sign in again.' }); }
}
function admin(req,res,next) { if (req.user?.role !== 'admin') return res.status(403).json({error:'Admin access required.'}); next(); }
function clean(s, max=500) { return String(s ?? '').trim().slice(0,max); }
app.post('/api/auth/register', loginLimiter, (req,res) => {
  if (process.env.ALLOW_REGISTRATION === 'false') return res.status(403).json({error:'Registration is currently disabled.'});
  const username=clean(req.body.username,24).toLowerCase(), email=clean(req.body.email,254).toLowerCase(), password=String(req.body.password||''), fullName=clean(req.body.fullName,80);
  if (!/^[a-z0-9_.]{3,24}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<8 || !fullName) return res.status(400).json({error:'Enter a valid username, email, full name, and password (8+ characters).'});
  try {
    const result=db.prepare('INSERT INTO users(username,email,password_hash,full_name,avatar) VALUES(?,?,?,?,?)').run(username,email,bcrypt.hashSync(password,12),fullName,`https://i.pravatar.cc/160?u=${username}`);
    const user=db.prepare('SELECT id,username,email,full_name,bio,avatar,role,verified FROM users WHERE id=?').get(result.lastInsertRowid);
    res.cookie('pulse_token',jwt.sign({id:user.id},JWT_SECRET,{expiresIn:'7d'}),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:7*864e5}); res.json({user});
  } catch { res.status(409).json({error:'Username or email is already in use.'}); }
});
app.post('/api/auth/login',loginLimiter,(req,res)=>{
  const id=clean(req.body.identifier,254).toLowerCase(), password=String(req.body.password||'');
  const user=db.prepare('SELECT * FROM users WHERE lower(username)=? OR lower(email)=?').get(id,id);
  if(!user || !bcrypt.compareSync(password,user.password_hash)) return res.status(401).json({error:'Incorrect username/email or password.'});
  if(user.banned) return res.status(403).json({error:'Your account is banned.',banned:true});
  const safe={id:user.id,username:user.username,email:user.email,full_name:user.full_name,bio:user.bio,avatar:user.avatar,role:user.role,verified:user.verified};
  res.cookie('pulse_token',jwt.sign({id:user.id},JWT_SECRET,{expiresIn:'7d'}),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:7*864e5}); res.json({user:safe});
});
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('pulse_token');res.json({ok:true});});
app.get('/api/me',auth,(req,res)=>res.json({user:req.user}));
app.get('/api/feed',auth,(req,res)=>{
 const posts=db.prepare(`SELECT p.*,u.username,u.full_name,u.avatar,u.verified,
 (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) comment_count
 FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 60`).all();
 res.json({posts});
});
app.get('/api/users/suggestions',auth,(req,res)=>res.json({users:db.prepare('SELECT id,username,full_name,avatar,verified FROM users WHERE id<>? AND banned=0 ORDER BY RANDOM() LIMIT 6').all(req.user.id)}));
app.get('/api/users/:username',auth,(req,res)=>{
 const u=db.prepare('SELECT id,username,full_name,bio,avatar,role,verified,created_at FROM users WHERE username=?').get(req.params.username);
 if(!u)return res.status(404).json({error:'User not found.'});
 u.followers=db.prepare('SELECT COUNT(*) n FROM follows WHERE following_id=?').get(u.id).n;
 u.following=db.prepare('SELECT COUNT(*) n FROM follows WHERE follower_id=?').get(u.id).n;
 u.followed=!!db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?').get(req.user.id,u.id);
 u.posts=db.prepare('SELECT * FROM posts WHERE user_id=? ORDER BY created_at DESC').all(u.id);
 res.json({profile:u});
});
app.post('/api/users/:id/follow',auth,(req,res)=>{
 const target=Number(req.params.id); if(target===req.user.id)return res.status(400).json({error:'You cannot follow yourself.'});
 const exists=db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?').get(req.user.id,target);
 if(exists) db.prepare('DELETE FROM follows WHERE follower_id=? AND following_id=?').run(req.user.id,target);
 else db.prepare('INSERT OR IGNORE INTO follows VALUES(?,?)').run(req.user.id,target);
 res.json({following:!exists});
});
app.post('/api/posts',auth,(req,res)=>{
 const caption=clean(req.body.caption,2200), imageUrl=clean(req.body.imageUrl,1000);
 if(!caption && !imageUrl)return res.status(400).json({error:'Add a caption or image URL.'});
 if(imageUrl && !/^https:\/\/.+/i.test(imageUrl))return res.status(400).json({error:'Image URL must use HTTPS.'});
 const r=db.prepare('INSERT INTO posts(user_id,caption,image_url,kind) VALUES(?,?,?,?)').run(req.user.id,caption,imageUrl,req.body.kind==='reel'?'reel':'post');
 res.json({post:db.prepare('SELECT p.*,u.username,u.full_name,u.avatar,u.verified FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=?').get(r.lastInsertRowid)});
});
app.post('/api/posts/:id/like',auth,(req,res)=>{
 const p=db.prepare('SELECT id FROM posts WHERE id=?').get(Number(req.params.id)); if(!p)return res.status(404).json({error:'Post not found.'});
 db.prepare('UPDATE posts SET likes=likes+1 WHERE id=?').run(p.id);
 res.json({ok:true});
});
app.get('/api/posts/:id/comments',auth,(req,res)=>res.json({comments:db.prepare('SELECT c.*,u.username,u.avatar FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.created_at').all(Number(req.params.id))}));
app.post('/api/posts/:id/comments',auth,(req,res)=>{
 const body=clean(req.body.body,500); if(!body)return res.status(400).json({error:'Comment cannot be empty.'});
 const r=db.prepare('INSERT INTO comments(post_id,user_id,body) VALUES(?,?,?)').run(Number(req.params.id),req.user.id,body);
 const comment=db.prepare('SELECT c.*,u.username,u.avatar FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?').get(r.lastInsertRowid);
 io.emit('new-comment',{postId:Number(req.params.id),comment}); res.json({comment});
});
app.get('/api/messages/:userId',auth,(req,res)=>{
 const id=Number(req.params.userId);
 res.json({messages:db.prepare(`SELECT m.*,u.username,u.avatar FROM messages m JOIN users u ON u.id=m.sender_id WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY m.created_at`).all(req.user.id,id,id,req.user.id)});
});
app.post('/api/messages/:userId',auth,(req,res)=>{
 const body=clean(req.body.body,2000); if(!body)return res.status(400).json({error:'Message cannot be empty.'});
 const r=db.prepare('INSERT INTO messages(sender_id,recipient_id,body) VALUES(?,?,?)').run(req.user.id,Number(req.params.userId),body);
 const message={...db.prepare('SELECT * FROM messages WHERE id=?').get(r.lastInsertRowid),username:req.user.username,avatar:req.user.avatar};
 io.emit('new-message',{message}); res.json({message});
});
app.get('/api/admin/stats',auth,admin,(req,res)=>{
 res.json({users:count('users'),posts:count('posts'),reels:db.prepare("SELECT COUNT(*) n FROM posts WHERE kind='reel'").get().n,comments:count('comments')});
});
app.get('/api/admin/users',auth,admin,(req,res)=>res.json({users:db.prepare('SELECT id,username,email,full_name,role,verified,banned,created_at FROM users ORDER BY id DESC').all()}));
app.patch('/api/admin/users/:id',auth,admin,(req,res)=>{
 const fields=['banned','verified','role']; const updates=[];
 if(typeof req.body.banned==='boolean')updates.push(['banned',req.body.banned?1:0]);
 if(typeof req.body.verified==='boolean')updates.push(['verified',req.body.verified?1:0]);
 if(['user','moderator','admin'].includes(req.body.role))updates.push(['role',req.body.role]);
 for(const [field,value] of updates)db.prepare(`UPDATE users SET ${field}=? WHERE id=?`).run(value,Number(req.params.id));
 res.json({ok:true});
});
app.delete('/api/admin/posts/:id',auth,admin,(req,res)=>{db.prepare('DELETE FROM comments WHERE post_id=?').run(Number(req.params.id));db.prepare('DELETE FROM posts WHERE id=?').run(Number(req.params.id));res.json({ok:true});});
app.get('/api/admin/posts',auth,admin,(req,res)=>res.json({posts:db.prepare('SELECT p.*,u.username FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC').all()}));
app.get('/api/health',(req,res)=>res.json({ok:true,name:'Pulse API'}));
io.on('connection',socket=>{socket.on('join',userId=>socket.join(`user:${Number(userId)}`));});
app.use(express.static(path.join(__dirname,'../dist')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'../dist/index.html')));
server.listen(PORT,'0.0.0.0',()=>console.log(`Pulse server running on ${PORT}`));
