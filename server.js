/**
 * MOT777 — Live Game Server
 * Node.js + WebSocket (ws)
 *
 * INSTALL:  npm install ws express
 * RUN:      node server.js
 * PORT:     3000 (change below if needed)
 *
 * For cPanel/VPS: run with PM2:
 *   npm install -g pm2
 *   pm2 start server.js --name mot777
 *   pm2 save && pm2 startup
 */

const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const path    = require('path');
const crypto  = require('crypto');

const PORT = process.env.PORT || 3000;

// ── ADMIN ACCOUNTS ────────────────────────────────────────────
// Master admin can create sub-admins
const adminAccounts = [
  { id: 1, username: 'admin', password: 'admin123', role: 'superadmin', name: 'Super Admin', createdAt: new Date().toISOString() },
];
let adminIdCounter = 2;

function verifyAdmin(username, password) {
  return adminAccounts.find(a => a.username === username && a.password === password);
}

// Admin API routes
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = verifyAdmin(username, password);
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ success: true, admin: { id: admin.id, username: admin.username, role: admin.role, name: admin.name } });
});

app.post('/api/admin/create', (req, res) => {
  const { creatorUsername, creatorPassword, newUsername, newPassword, newName, role } = req.body;
  const creator = verifyAdmin(creatorUsername, creatorPassword);
  if (!creator) return res.status(401).json({ error: 'Unauthorized' });
  if (creator.role !== 'superadmin' && creator.role !== 'admin') return res.status(403).json({ error: 'Only admins can create accounts' });
  if (adminAccounts.find(a => a.username === newUsername)) return res.status(400).json({ error: 'Username already exists' });
  const newAdmin = {
    id: adminIdCounter++,
    username: newUsername,
    password: newPassword,
    role: role || 'admin',
    name: newName || newUsername,
    createdBy: creator.username,
    createdAt: new Date().toISOString(),
  };
  adminAccounts.push(newAdmin);
  console.log(`New admin created: ${newUsername} by ${creator.username}`);
  res.json({ success: true, admin: { id: newAdmin.id, username: newAdmin.username, role: newAdmin.role, name: newAdmin.name } });
});

app.get('/api/admin/list', (req, res) => {
  const { username, password } = req.query;
  const admin = verifyAdmin(username, password);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });
  res.json(adminAccounts.map(a => ({ id: a.id, username: a.username, role: a.role, name: a.name, createdBy: a.createdBy, createdAt: a.createdAt })));
});

app.delete('/api/admin/:id', (req, res) => {
  const { username, password } = req.body;
  const admin = verifyAdmin(username, password);
  if (!admin || admin.role !== 'superadmin') return res.status(403).json({ error: 'Only superadmin can delete accounts' });
  const idx = adminAccounts.findIndex(a => a.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Admin not found' });
  if (adminAccounts[idx].role === 'superadmin') return res.status(403).json({ error: 'Cannot delete superadmin' });
  adminAccounts.splice(idx, 1);
  res.json({ success: true });
});

// User accounts management (for admin panel)
const userAccounts = [
  { id: 1, name: 'Ali Khan', email: 'ali@test.com', password: '1234', balance: 15000, status: 'active', joined: new Date().toISOString().slice(0,10), bets: 0 },
  { id: 2, name: 'Sara Ahmed', email: 'sara@test.com', password: '1234', balance: 3200, status: 'active', joined: new Date().toISOString().slice(0,10), bets: 0 },
];
let userIdCounter = 3;

app.get('/api/users', (req,res) => {
  const { username, password } = req.query;
  if(!verifyAdmin(username, password)) return res.status(401).json({error:'Unauthorized'});
  res.json(userAccounts.map(u => ({...u, password: undefined})));
});

app.post('/api/users/balance', (req,res) => {
  const { username, password, userId, amount, action } = req.body;
  if(!verifyAdmin(username, password)) return res.status(401).json({error:'Unauthorized'});
  const user = userAccounts.find(u => u.id === userId);
  if(!user) return res.status(404).json({error:'User not found'});
  if(action === 'add') user.balance += amount;
  else if(action === 'deduct') { if(amount > user.balance) return res.status(400).json({error:'Insufficient balance'}); user.balance -= amount; }
  res.json({ success: true, newBalance: user.balance });
});

app.post('/api/users/status', (req,res) => {
  const { username, password, userId, status } = req.body;
  if(!verifyAdmin(username, password)) return res.status(401).json({error:'Unauthorized'});
  const user = userAccounts.find(u => u.id === userId);
  if(!user) return res.status(404).json({error:'User not found'});
  user.status = status;
  res.json({ success: true });
});

app.post('/api/users/create', (req,res) => {
  const { username, password, name, email, userPassword, balance } = req.body;
  if(!verifyAdmin(username, password)) return res.status(401).json({error:'Unauthorized'});
  if(userAccounts.find(u => u.email === email)) return res.status(400).json({error:'Email already registered'});
  const newUser = { id: userIdCounter++, name, email, password: userPassword, balance: balance||0, status: 'active', joined: new Date().toISOString().slice(0,10), bets: 0 };
  userAccounts.push(newUser);
  res.json({ success: true, user: {...newUser, password: undefined} });
});

// User login
app.post('/api/users/login', (req,res) => {
  const { email, password } = req.body;
  const user = userAccounts.find(u => u.email === email && u.password === password);
  if(!user) return res.status(401).json({error:'Invalid credentials'});
  if(user.status === 'banned') return res.status(403).json({error:'Account banned'});
  res.json({ success: true, user: {...user, password: undefined} });
});

const app  = express();
const server = http.createServer(app);
const wss  = new WebSocket.Server({ server });

// ── Serve static files (index.html etc.) ───────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── CARD ENGINE ─────────────────────────────────────────────
const SUITS  = ['♠','♥','♦','♣'];
const RANKS  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK_V = {2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13,A:14};

function mkDeck() {
  return SUITS.flatMap(s => RANKS.map(r => ({ s, r, red: s==='♥'||s==='♦' })));
}
function shuffle(d) {
  const a = [...d];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function evalHand(cards) {
  const avail = cards.filter(c => c && c.up !== false);
  if (avail.length < 5) return { rank: 0, name: '—' };
  let best = { rank: -1, name: '' };
  function combos(arr, k) {
    const res = [];
    function go(s, cur) {
      if (cur.length === k) { res.push([...cur]); return; }
      for (let i = s; i <= arr.length-k+cur.length; i++) { cur.push(arr[i]); go(i+1,cur); cur.pop(); }
    }
    go(0,[]);
    return res;
  }
  combos(avail, 5).forEach(h => {
    const vs = h.map(c => RANK_V[c.r]).sort((a,b) => b-a);
    const ss = h.map(c => c.s);
    const fl = ss.every(s => s===ss[0]);
    const uniq = [...new Set(vs)];
    const str = (uniq.length===5 && vs[0]-vs[4]===4) || (uniq.length===5 && vs[0]===14&&vs[1]===5&&vs[2]===4&&vs[3]===3&&vs[4]===2);
    const cnts = Object.values(vs.reduce((o,v)=>{o[v]=(o[v]||0)+1;return o},{})).sort((a,b)=>b-a);
    let rank=0, name='High Card';
    if(fl&&str){rank=8;name='Straight Flush';}
    else if(cnts[0]===4){rank=7;name='Four of a Kind';}
    else if(cnts[0]===3&&cnts[1]===2){rank=6;name='Full House';}
    else if(fl){rank=5;name='Flush';}
    else if(str){rank=4;name='Straight';}
    else if(cnts[0]===3){rank=3;name='Three of a Kind';}
    else if(cnts[0]===2&&cnts[1]===2){rank=2;name='Two Pair';}
    else if(cnts[0]===2){rank=1;name='One Pair';}
    if(rank > best.rank) best = { rank, name };
  });
  return best;
}
function calcOdds(hands, comm) {
  const revHands = hands.map(h => h.map(c => ({...c, up:true})));
  const ranks = revHands.map((h,i) => ({ i, ev: evalHand([...h,...comm]) }));
  const best = Math.max(...ranks.map(r => r.ev.rank));
  return ranks.map(r => {
    const diff = best - r.ev.rank;
    let base;
    if(diff===0) base = 2.0 + (Math.random()-0.5)*0.4;
    else if(diff===1) base = 3.5 + (Math.random()-0.5)*0.6;
    else if(diff===2) base = 6.5 + (Math.random()-0.5)*1.0;
    else base = 13.0 + (Math.random()-0.5)*3.0;
    return parseFloat(base.toFixed(2));
  });
}

// ── GAME ROUND ENGINE ────────────────────────────────────────
// Each "game" (holdem, baccarat, hilo, derby, omaha) runs on its own cycle
// shared across ALL connected clients

let roundId = 10000000;
function newRoundId() { return ++roundId; }

const rf = (a,b) => parseFloat((a + Math.random()*(b-a)).toFixed(2));
const ri = (a,b) => Math.floor(Math.random()*(b-a+1))+a;

// ── SHARED GAME STATE STORE ──────────────────────────────────
// Each game has: { phase, timer, gid, deck, hands, comm, odds, sizes, extraOdds, winner, results[] }
const PHASE_DUR = { wait:8, pre:20, flop:20, turn:20, river:20, result:6 };
const PHASE_ORDER = ['wait','pre','flop','turn','river','result'];

function nextPhase(p) {
  const idx = PHASE_ORDER.indexOf(p);
  return PHASE_ORDER[(idx+1) % PHASE_ORDER.length];
}

// ── HOLDEM GAME STATE ────────────────────────────────────────
function createHoldemState() {
  const deck = shuffle(mkDeck());
  return {
    gid: newRoundId(),
    phase: 'wait',
    timer: PHASE_DUR.wait,
    deck,
    hands: [
      [{...deck[0],up:false},{...deck[1],up:false}],
      [{...deck[2],up:false},{...deck[3],up:false}],
      [{...deck[4],up:false},{...deck[5],up:false}],
      [{...deck[6],up:false},{...deck[7],up:false}],
    ],
    comm: [],
    commFull: [deck[8],deck[9],deck[10],deck[11],deck[12]],
    odds: [rf(3.6,4.2),rf(3.6,4.2),rf(3.6,4.2),rf(3.6,4.2)],
    sizes: [ri(400,2000),ri(400,2000),ri(400,2000),ri(400,2000)],
    extraOdds: {fh:rf(3,5),flush:rf(4,7),str:rf(3.5,5),tok:rf(6,9),two:rf(3.5,5.5)},
    winner: null,
    results: [],
    bets: [], // { userId, runner, type, odds, stake, market, handIdx, settled }
  };
}

// ── BACCARAT STATE ───────────────────────────────────────────
function createBacState() {
  const deck = shuffle(mkDeck());
  function bacV(cards) { return cards.reduce((s,c) => (s+(['10','J','Q','K'].includes(c.r)?0:c.r==='A'?1:parseInt(c.r)))%10, 0); }
  const p = [deck[0],deck[2]];
  const b = [deck[1],deck[3]];
  const p3 = bacV(p)<=5 ? deck[4] : null;
  const b3 = bacV(b)<=5 ? (p3?deck[5]:deck[4]) : null;
  return {
    gid: newRoundId(), phase:'wait', timer:PHASE_DUR.wait,
    pH: [{...deck[0],up:false},{...deck[2],up:false},...(p3?[{...p3,up:false}]:[])],
    bH: [{...deck[1],up:false},{...deck[3],up:false},...(b3?[{...b3,up:false}]:[])],
    pHFull: [{...deck[0],up:true},{...deck[2],up:true},...(p3?[{...p3,up:true}]:[])],
    bHFull: [{...deck[1],up:true},{...deck[3],up:true},...(b3?[{...b3,up:true}]:[])],
    odds: {p:1.98,b:1.93,t:10.0,pp:11.0,bp:11.0},
    winner: null, results: [], bets: [],
  };
}

// ── HILO STATE ───────────────────────────────────────────────
function createHiLoState() {
  const deck = shuffle(mkDeck());
  return {
    gid: newRoundId(), phase:'wait', timer:PHASE_DUR.wait,
    c1: {...deck[0], up:false},
    c2: {...deck[1], up:false},
    c1Full: {...deck[0], up:true},
    c2Full: {...deck[1], up:true},
    odds: {hi:rf(1.8,2.2),lo:rf(1.8,2.2),eq:rf(10,16)},
    outcome: null, results: [], bets: [],
  };
}

// ── DERBY STATE ───────────────────────────────────────────────
const HORSE_NAMES = ['Thunder Road','Silver Arrow','Night Dancer','Golden Flame','Desert Wind','Lucky Star'];
const HORSE_JOCKEYS = ['F. Dettori','W. Buick','R. Moore','J. Spencer','P. Hanagan','T. Queally'];
const HORSE_COLORS = ['#e74c3c','#3498db','#f0f0f0','#111111','#f39c12','#000080'];

function createDerbyState() {
  return {
    gid: newRoundId(), phase:'wait', timer:PHASE_DUR.wait,
    positions: [0,0,0,0,0,0],
    speeds: [rf(0.8,1.4),rf(0.8,1.4),rf(0.8,1.4),rf(0.8,1.4),rf(0.8,1.4),rf(0.8,1.4)],
    raceOrder: [],
    targetPct: 0,
    odds: HORSE_NAMES.map(() => rf(2,10)),
    winner: null, results: [], bets: [],
  };
}

// ── OMAHA STATE (4 hands × 4 hole cards + 5 community) ───────
function createOmahaState() {
  const deck = shuffle(mkDeck());
  return {
    gid: newRoundId(), phase:'wait', timer:PHASE_DUR.wait, deck,
    hands: [
      [{...deck[0],up:false},{...deck[1],up:false},{...deck[2],up:false},{...deck[3],up:false}],
      [{...deck[4],up:false},{...deck[5],up:false},{...deck[6],up:false},{...deck[7],up:false}],
      [{...deck[8],up:false},{...deck[9],up:false},{...deck[10],up:false},{...deck[11],up:false}],
      [{...deck[12],up:false},{...deck[13],up:false},{...deck[14],up:false},{...deck[15],up:false}],
    ],
    comm: [],
    commFull: [deck[16],deck[17],deck[18],deck[19],deck[20]],
    odds: [rf(3.6,4.2),rf(3.6,4.2),rf(3.6,4.2),rf(3.6,4.2)],
    sizes: [ri(300,1500),ri(300,1500),ri(300,1500),ri(300,1500)],
    winner: null, results: [], bets: [],
  };
}

// ── SPORTS EXCHANGE DATA ─────────────────────────────────────
const FB_LEAGUES = {
  'Premier League': ['Arsenal','Chelsea','Liverpool','Man City','Man Utd','Tottenham','Aston Villa','Newcastle','Brighton','West Ham'],
  'La Liga':        ['Real Madrid','Barcelona','Atletico Madrid','Sevilla','Valencia','Real Sociedad'],
  'Bundesliga':     ['Bayern Munich','B. Dortmund','RB Leipzig','Leverkusen','Frankfurt'],
  'Serie A':        ['Juventus','AC Milan','Inter Milan','Napoli','Roma','Lazio'],
};
const CRICKET_TEAMS = ['India','England','Australia','Pakistan','South Africa','New Zealand','West Indies','Sri Lanka'];
const TENNIS_PLAYERS = ['Djokovic','Alcaraz','Sinner','Medvedev','Zverev','Swiatek','Sabalenka','Rybakina'];
const GOLF_PLAYERS = ['Scheffler','McIlroy','Rahm','Schauffele','Hovland','Morikawa','Cantlay','Fleetwood'];
const COURSES = ['Ascot','Newmarket','Cheltenham','Goodwood','York','Sandown','Kempton','Epsom','Haydock','Lingfield'];
const GREYHOUND_VENUES = ['Crayford','Romford','Wimbledon','Swindon','Oxford','Monmore'];

function rOdds(base) {
  const b3=+(base*1.08).toFixed(2), b2=+(base*1.04).toFixed(2), b1=+base.toFixed(2);
  const l1=+(base+0.02).toFixed(2), l2=+(base*1.04+0.02).toFixed(2), l3=+(base*1.08+0.02).toFixed(2);
  return {
    backs: [{p:b3,s:ri(50,1000)},{p:b2,s:ri(200,3000)},{p:b1,s:ri(500,8000)}],
    lays:  [{p:l1,s:ri(400,6000)},{p:l2,s:ri(200,3000)},{p:l3,s:ri(50,1000)}]
  };
}

function buildSportsData() {
  // Horse Racing
  const hrRaces = [];
  const now = new Date();
  COURSES.slice(0,7).forEach((venue,vi) => {
    ['13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'].forEach((time,ti) => {
      const status = ti===0&&vi<3 ? 'inplay' : 'upcoming';
      const runners = Array.from({length:ri(6,14)},(_,i) => {
        const base = i===0?rf(1.5,4):i<3?rf(3,8):rf(10,40);
        return { id:ri(100000,999999), name:['Thunder Road','Silver Arrow','Night Dancer','Golden Flame','Desert Wind','Lucky Star','Royal Flash','Iron Duke','Crystal Clear','Dark Warrior','Bright Hope','Wild Spirit','Moon Shadow','Star Light'][i%14], jockey:['F. Dettori','W. Buick','R. Moore','J. Spencer','P. Hanagan'][i%5], trainer:['J. Gosden','A. O\'Brien','J. Balding','M. Prescott'][i%4], draw:i+1, form:['W','2','3','F','U'].map(()=>['W','2','3','F','U'][ri(0,4)]).slice(0,5), sp:rf(2,40).toFixed(1), odds:rOdds(+rf(2,40).toFixed(1)), ltp:rf(2,40).toFixed(1), matched:ri(200,50000), color:['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#34495e'][i%8] };
      });
      hrRaces.push({ id:ri(1000000,9999999), venue, time, status, distance:['5f','6f','7f','1m','1m2f','1m4f','2m'][ri(0,6)], going:['Good','Good to Firm','Soft','Firm'][ri(0,3)], runners, matched:ri(50000,2000000), prize:'£'+ri(5000,200000).toLocaleString(), race_class:ri(1,7) });
    });
  });

  // Greyhounds
  const grRaces = [];
  GREYHOUND_VENUES.forEach((venue,vi) => {
    ['18:00','18:17','18:34','18:51','19:08','19:25'].forEach((time,ti) => {
      const runners = Array.from({length:6},(_,i) => {
        const base = rf(1.8,12);
        return { id:ri(100000,999999), name:['Rapid Fire','Blue Steel','Gold Jet','Night Flash','Sprint King','Ace Runner'][i], trap:i+1, form:Array.from({length:5},()=>String(ri(1,6))), sp:base.toFixed(1), odds:rOdds(+base.toFixed(1)), ltp:base.toFixed(1), matched:ri(100,10000), color:['#e74c3c','#3498db','#ffffff','#000000','#f39c12','#000080'][i] };
      });
      grRaces.push({ id:ri(1000000,9999999), venue, time, status:ti===0&&vi<3?'inplay':'upcoming', distance:'480m', grade:'A'+ri(1,6), runners, matched:ri(5000,200000) });
    });
  });

  // Football
  const fbMatches = [];
  Object.entries(FB_LEAGUES).forEach(([league,teams]) => {
    for(let i=0;i<teams.length-1;i+=2) {
      const status = i<4 ? 'inplay' : 'prematch';
      const b1=rf(1.5,3.5), bd=rf(3,4.5), b2=rf(2,6);
      fbMatches.push({
        id:ri(1000000,9999999), team1:teams[i], team2:teams[i+1], league, status,
        score: status==='inplay'?`${ri(0,3)}-${ri(0,3)}`:'0-0', minute:status==='inplay'?ri(1,85):0,
        markets:[
          {id:ri(100000,999999),name:'Match Odds',runners:[{id:ri(10000,99999),name:teams[i],odds:rOdds(b1),ltp:b1.toFixed(2),matched:ri(5000,200000)},{id:ri(10000,99999),name:'Draw',odds:rOdds(bd),ltp:bd.toFixed(2),matched:ri(2000,80000)},{id:ri(10000,99999),name:teams[i+1],odds:rOdds(b2),ltp:b2.toFixed(2),matched:ri(4000,150000)}],matched:ri(20000,500000)},
          {id:ri(100000,999999),name:'Over/Under 2.5',runners:[{id:ri(10000,99999),name:'Over 2.5',odds:rOdds(rf(1.7,2.5)),ltp:'1.90',matched:ri(3000,80000)},{id:ri(10000,99999),name:'Under 2.5',odds:rOdds(rf(1.6,2.2)),ltp:'1.95',matched:ri(2000,60000)}],matched:ri(10000,200000)},
          {id:ri(100000,999999),name:'Both Teams to Score',runners:[{id:ri(10000,99999),name:'Yes',odds:rOdds(rf(1.6,2.2)),ltp:'1.85',matched:ri(2000,50000)},{id:ri(10000,99999),name:'No',odds:rOdds(rf(1.8,2.8)),ltp:'2.10',matched:ri(1000,40000)}],matched:ri(8000,150000)},
        ],
        matched:ri(50000,2000000)
      });
    }
  });

  // Tennis
  const tnMatches = [];
  for(let i=0;i<TENNIS_PLAYERS.length-1;i+=2) {
    const b1=rf(1.3,3.5),b2=rf(1.3,3.5);
    tnMatches.push({
      id:ri(1000000,9999999), team1:TENNIS_PLAYERS[i], team2:TENNIS_PLAYERS[i+1],
      league:['Wimbledon','US Open','Roland Garros','ATP Tour'][ri(0,3)],
      status:i<4?'inplay':'prematch', score:i<4?`${ri(0,2)}-${ri(0,2)} ${ri(0,6)}-${ri(0,6)}`:'',
      markets:[{id:ri(100000,999999),name:'Match Odds',runners:[{id:ri(10000,99999),name:TENNIS_PLAYERS[i],odds:rOdds(b1),ltp:b1.toFixed(2),matched:ri(3000,100000)},{id:ri(10000,99999),name:TENNIS_PLAYERS[i+1],odds:rOdds(b2),ltp:b2.toFixed(2),matched:ri(3000,100000)}],matched:ri(10000,300000)}],
      matched:ri(50000,1000000)
    });
  }

  // Cricket
  const crMatches = [];
  for(let i=0;i<CRICKET_TEAMS.length-1;i+=2) {
    const b1=rf(1.4,3),b2=rf(1.4,3);
    crMatches.push({
      id:ri(1000000,9999999), team1:CRICKET_TEAMS[i], team2:CRICKET_TEAMS[i+1],
      league:['IPL 2025','T20 World Cup','Test Series','PSL 2025'][ri(0,3)],
      status:i<2?'inplay':'prematch', score:i<2?`${CRICKET_TEAMS[i]}: ${ri(80,280)}/${ri(2,8)} (${ri(10,45)} ov)`:'',
      markets:[{id:ri(100000,999999),name:'Match Odds',runners:[{id:ri(10000,99999),name:CRICKET_TEAMS[i],odds:rOdds(b1),ltp:b1.toFixed(2),matched:ri(5000,200000)},{id:ri(10000,99999),name:'Draw',odds:rOdds(rf(8,30)),ltp:'15.0',matched:ri(500,30000)},{id:ri(10000,99999),name:CRICKET_TEAMS[i+1],odds:rOdds(b2),ltp:b2.toFixed(2),matched:ri(5000,200000)}],matched:ri(20000,800000)}],
      matched:ri(100000,5000000)
    });
  }

  // Golf
  const golfTournaments = ['The Masters','US Open Golf','The Open Championship'].map(name => ({
    id:ri(1000000,9999999), name,
    runners: GOLF_PLAYERS.map((p,i) => ({id:ri(10000,99999),name:p,odds:rOdds(i<3?rf(5,12):rf(15,100)),ltp:(i<3?rf(6,10):rf(20,80)).toFixed(1),matched:ri(500,50000)})),
    matched:ri(100000,2000000)
  }));

  return { hrRaces, grRaces, fbMatches, tnMatches, crMatches, golfTournaments };
}

// ── LIVE GAME STATES (one per game type, shared by all clients) ──
const gameStates = {
  holdem:      createHoldemState(),
  turbo_holdem:createHoldemState(),
  blackjack:   createHoldemState(),
  turbo_bj:    createHoldemState(),
  baccarat:    createBacState(),
  turbo_bac:   createBacState(),
  hilo:        createHiLoState(),
  turbo_hilo:  createHiLoState(),
  omaha:       createOmahaState(),
  derby:       createDerbyState(),
  turbo_derby: createDerbyState(),
};

// Sports data (refreshed every 3 minutes)
let sportsData = buildSportsData();
setInterval(() => { sportsData = buildSportsData(); }, 180000);

// ── PHASE TRANSITION LOGIC ────────────────────────────────────
function tickHoldem(state, gameType) {
  const isOmaha = gameType === 'omaha';
  switch(state.phase) {
    case 'wait':
      // Deal new hand
      Object.assign(state, isOmaha ? createOmahaState() : createHoldemState());
      state.phase = 'pre';
      state.timer = PHASE_DUR.pre;
      state.gid = newRoundId();
      break;
    case 'pre':
      state.phase = 'flop';
      state.timer = PHASE_DUR.flop;
      // Reveal 3 community cards + all hands
      state.comm = [
        {...state.commFull[0],up:true},
        {...state.commFull[1],up:true},
        {...state.commFull[2],up:true}
      ];
      state.hands = state.hands.map(h => h.map(c => ({...c,up:true})));
      state.odds = calcOdds(state.hands, state.comm);
      state.sizes = [ri(300,2000),ri(300,2000),ri(300,2000),ri(300,2000)];
      break;
    case 'flop':
      state.phase = 'turn';
      state.timer = PHASE_DUR.turn;
      // Reveal 4th card
      state.comm = [...state.comm, {...state.commFull[3],up:true}];
      state.odds = calcOdds(state.hands, state.comm);
      state.sizes = [ri(200,1500),ri(200,1500),ri(200,1500),ri(200,1500)];
      break;
    case 'turn':
      state.phase = 'river';
      state.timer = PHASE_DUR.river;
      // Reveal 5th card
      state.comm = [...state.comm, {...state.commFull[4],up:true}];
      state.odds = calcOdds(state.hands, state.comm);
      state.sizes = [ri(100,800),ri(100,800),ri(100,800),ri(100,800)];
      break;
    case 'river':
      state.phase = 'result';
      state.timer = PHASE_DUR.result;
      // Find winner
      const ranked = state.hands.map((h,i) => ({i, ev:evalHand([...h,...state.comm])})).sort((a,b)=>b.ev.rank-a.ev.rank);
      state.winner = ranked[0];
      // Settle bets
      settleBets(state);
      state.results = [{gid:state.gid, winner:state.winner, time:new Date().toLocaleTimeString()}, ...state.results].slice(0,20);
      break;
    case 'result':
      state.phase = 'wait';
      state.timer = PHASE_DUR.wait;
      break;
  }
}

function tickBaccarat(state) {
  function bacV(cards) { return cards.reduce((s,c) => (s+(['10','J','Q','K'].includes(c.r)?0:c.r==='A'?1:parseInt(c.r)))%10, 0); }
  switch(state.phase) {
    case 'wait':
      Object.assign(state, createBacState());
      state.phase='pre'; state.timer=PHASE_DUR.pre; state.gid=newRoundId(); break;
    case 'pre':
      state.phase='flop'; state.timer=PHASE_DUR.flop;
      // Reveal 1st card each side
      state.pH[0] = {...state.pHFull[0],up:true};
      state.bH[0] = {...state.bHFull[0],up:true};
      break;
    case 'flop':
      state.phase='turn'; state.timer=PHASE_DUR.turn;
      state.pH = state.pHFull.map(c=>({...c,up:true}));
      state.bH = state.bHFull.map(c=>({...c,up:true}));
      const pv=bacV(state.pHFull), bv=bacV(state.bHFull);
      state.odds = {p:pv>bv?rf(1.4,1.7):rf(2.2,2.8), b:bv>pv?rf(1.4,1.7):rf(2.2,2.8), t:pv===bv?rf(4,7):rf(9,12), pp:rf(9,13), bp:rf(9,13)};
      break;
    case 'turn':
      state.phase='river'; state.timer=PHASE_DUR.river; break;
    case 'river':
      state.phase='result'; state.timer=PHASE_DUR.result;
      const pFull=state.pHFull, bFull=state.bHFull;
      const pvf=bacV(pFull), bvf=bacV(bFull);
      const ppair=pFull[0].r===pFull[1].r, bpair=bFull[0].r===bFull[1].r;
      state.winner={w:pvf>bvf?'player':bvf>pvf?'banker':'tie', pv:pvf, bv:bvf, ppair, bpair};
      settleBacBets(state);
      state.results=[{gid:state.gid,...state.winner,time:new Date().toLocaleTimeString()},...state.results].slice(0,20);
      break;
    case 'result':
      state.phase='wait'; state.timer=PHASE_DUR.wait; break;
  }
}

function tickHiLo(state) {
  switch(state.phase) {
    case 'wait':
      Object.assign(state, createHiLoState());
      state.phase='pre'; state.timer=PHASE_DUR.pre; state.gid=newRoundId(); break;
    case 'pre':
      state.phase='flop'; state.timer=PHASE_DUR.flop;
      state.c1={...state.c1Full,up:true}; break;
    case 'flop':
      state.phase='turn'; state.timer=PHASE_DUR.turn; break;
    case 'turn':
      state.phase='river'; state.timer=PHASE_DUR.river; break;
    case 'river':
      state.phase='result'; state.timer=PHASE_DUR.result;
      state.c2={...state.c2Full,up:true};
      const v1=RANK_V[state.c1Full.r], v2=RANK_V[state.c2Full.r];
      state.outcome={res:v2>v1?'hi':v2<v1?'lo':'eq',v1,v2};
      settleHiLoBets(state);
      state.results=[{gid:state.gid,...state.outcome,time:new Date().toLocaleTimeString()},...state.results].slice(0,20);
      break;
    case 'result':
      state.phase='wait'; state.timer=PHASE_DUR.wait; break;
  }
}

function tickDerby(state) {
  switch(state.phase) {
    case 'wait':
      Object.assign(state, createDerbyState());
      state.phase='pre'; state.timer=PHASE_DUR.pre; state.gid=newRoundId(); break;
    case 'pre':
      state.phase='flop'; state.timer=PHASE_DUR.flop; state.targetPct=33; break;
    case 'flop':
      state.phase='turn'; state.timer=PHASE_DUR.turn; state.targetPct=66; break;
    case 'turn':
      state.phase='river'; state.timer=PHASE_DUR.river; state.targetPct=100; break;
    case 'river':
      state.phase='result'; state.timer=PHASE_DUR.result;
      state.positions=[100,100,100,100,100,100];
      if(state.raceOrder.length===0) {
        // ensure all have finished
        const order = [...Array(6)].map((_,i)=>i).sort(()=>Math.random()-.5);
        state.raceOrder=order;
      }
      state.winner=state.raceOrder[0];
      settleDerbyBets(state);
      state.results=[{gid:state.gid,winner:state.winner,name:HORSE_NAMES[state.winner],time:new Date().toLocaleTimeString()},...state.results].slice(0,20);
      break;
    case 'result':
      state.phase='wait'; state.timer=PHASE_DUR.wait; break;
  }
}

// ── RACE POSITION ANIMATION (server-side) ────────────────────
setInterval(() => {
  ['derby','turbo_derby'].forEach(key => {
    const s = gameStates[key];
    if(!['flop','turn','river'].includes(s.phase)) return;
    const finished = new Set(s.raceOrder);
    let moved = false;
    for(let i=0;i<6;i++) {
      if(!finished.has(i) && s.positions[i] < s.targetPct) {
        s.positions[i] = Math.min(s.targetPct, s.positions[i] + s.speeds[i] * (rf(0.5,2)));
        s.speeds[i] = Math.max(0.5, s.speeds[i] + rf(-0.03,0.03));
        moved = true;
        if(s.positions[i] >= s.targetPct && !finished.has(i)) {
          s.raceOrder.push(i);
        }
      }
    }
    if(moved) broadcast(key, { type:'positions', positions:s.positions, raceOrder:s.raceOrder });
  });
}, 100);

// ── BET SETTLEMENT ───────────────────────────────────────────
function settleBets(state) {
  const w = state.winner;
  state.bets.forEach(b => {
    if(b.settled) return; b.settled = true;
    let won = false;
    if(b.market==='hand') {
      won = b.type==='back' ? w.i===b.handIdx : w.i!==b.handIdx;
    } else {
      const wr = w.ev.rank;
      if(b.runner==='Winner has FH or better') won=b.type==='back'?wr>=6:wr<6;
      else if(b.runner==='Winner has Flush') won=b.type==='back'?wr===5:wr!==5;
      else if(b.runner==='Winner has Straight') won=b.type==='back'?wr===4:wr!==4;
      else if(b.runner==='Winner has Three of a Kind') won=b.type==='back'?wr===3:wr!==3;
      else if(b.runner==='Winner has Two Pair or worse') won=b.type==='back'?wr<=2:wr>2;
    }
    b.won = won;
    if(won) { b.payout = b.type==='back' ? b.stake*b.odds : b.stake*2; }
    else { b.payout = b.type==='lay' ? -(b.stake*(b.odds-1)) : 0; }
  });
}

function settleBacBets(state) {
  const w = state.winner;
  state.bets.forEach(b => {
    if(b.settled) return; b.settled=true;
    let won=false;
    if(b.runner==='Player') won=b.type==='back'?w.w==='player':w.w!=='player';
    else if(b.runner==='Banker') won=b.type==='back'?w.w==='banker':w.w!=='banker';
    else if(b.runner==='Tie') won=b.type==='back'?w.w==='tie':w.w!=='tie';
    else if(b.runner==='Player Pair') won=b.type==='back'?w.ppair:!w.ppair;
    else if(b.runner==='Banker Pair') won=b.type==='back'?w.bpair:!w.bpair;
    b.won=won;
    b.payout=won?(b.type==='back'?b.stake*b.odds:b.stake*2):(b.type==='lay'?-(b.stake*(b.odds-1)):0);
  });
}

function settleHiLoBets(state) {
  const res=state.outcome.res;
  state.bets.forEach(b => {
    if(b.settled) return; b.settled=true;
    let won=false;
    if(b.runner==='Higher') won=b.type==='back'?res==='hi':res!=='hi';
    else if(b.runner==='Lower') won=b.type==='back'?res==='lo':res!=='lo';
    else if(b.runner==='Equal') won=b.type==='back'?res==='eq':res!=='eq';
    b.won=won;
    b.payout=won?(b.type==='back'?b.stake*b.odds:b.stake*2):(b.type==='lay'?-(b.stake*(b.odds-1)):0);
  });
}

function settleDerbyBets(state) {
  const w=state.raceOrder[0];
  state.bets.forEach(b => {
    if(b.settled) return; b.settled=true;
    const hi=parseInt(b.runner.replace('Horse ',''))-1;
    const won=b.type==='back'?w===hi:w!==hi;
    b.won=won;
    b.payout=won?(b.type==='back'?b.stake*b.odds:b.stake*2):(b.type==='lay'?-(b.stake*(b.odds-1)):0);
  });
}

// ── LIVE ODDS FLUCTUATION ────────────────────────────────────
setInterval(() => {
  // Fluctuate sports odds
  sportsData.hrRaces.forEach(r => r.runners.forEach(rn => {
    const base = parseFloat(rn.ltp);
    const nb = Math.max(1.02, +(base + (Math.random()-.5)*.1).toFixed(2));
    rn.odds = rOdds(nb); rn.ltp = nb.toFixed(2);
  }));
  sportsData.fbMatches.forEach(m => m.markets.forEach(mk => mk.runners.forEach(r => {
    const base = parseFloat(r.ltp);
    const nb = Math.max(1.02, +(base + (Math.random()-.5)*.08).toFixed(2));
    r.odds = rOdds(nb); r.ltp = nb.toFixed(2);
  })));
  // Update in-play minutes
  sportsData.fbMatches.filter(m=>m.status==='inplay').forEach(m => {
    m.minute = Math.min(90, (m.minute||0) + Math.random()<0.5?1:0);
  });
  sportsData.crMatches.filter(m=>m.status==='inplay').forEach(m => {
    // tick overs
  });
  // Broadcast sports update
  broadcastSports();
}, 3000);

// Fluctuate game odds during betting phases
setInterval(() => {
  Object.entries(gameStates).forEach(([key,state]) => {
    if(!['pre','flop','turn','river'].includes(state.phase)) return;
    if(['holdem','turbo_holdem','blackjack','turbo_bj','omaha'].includes(key)) {
      state.odds = state.odds.map(o => Math.max(1.3, +(o+(Math.random()-.5)*.1).toFixed(2)));
      broadcast(key, {type:'odds', odds:state.odds, sizes:state.sizes, extraOdds:state.extraOdds});
    }
    if(['baccarat','turbo_bac'].includes(key)) {
      state.odds={p:Math.max(1.4,+(state.odds.p+(Math.random()-.5)*.05).toFixed(2)),b:Math.max(1.4,+(state.odds.b+(Math.random()-.5)*.05).toFixed(2)),t:Math.max(7,+(state.odds.t+(Math.random()-.5)*.3).toFixed(2)),pp:Math.max(8,+(state.odds.pp+(Math.random()-.5)*.4).toFixed(2)),bp:Math.max(8,+(state.odds.bp+(Math.random()-.5)*.4).toFixed(2))};
      broadcast(key, {type:'odds', odds:state.odds});
    }
    if(['hilo','turbo_hilo'].includes(key)) {
      state.odds={hi:Math.max(1.4,+(state.odds.hi+(Math.random()-.5)*.1).toFixed(2)),lo:Math.max(1.4,+(state.odds.lo+(Math.random()-.5)*.1).toFixed(2)),eq:Math.max(7,+(state.odds.eq+(Math.random()-.5)*.4).toFixed(2))};
      broadcast(key, {type:'odds', odds:state.odds});
    }
    if(['derby','turbo_derby'].includes(key)) {
      state.odds=state.odds.map(o=>Math.max(1.3,+(o+(Math.random()-.5)*.25).toFixed(2)));
      broadcast(key, {type:'odds', odds:state.odds});
    }
  });
}, 2500);

// ── MAIN GAME TICK (1s) ──────────────────────────────────────
setInterval(() => {
  Object.entries(gameStates).forEach(([key,state]) => {
    state.timer--;
    if(state.timer <= 0) {
      // Transition
      if(['holdem','turbo_holdem','blackjack','turbo_bj','omaha'].includes(key)) tickHoldem(state, key);
      else if(['baccarat','turbo_bac'].includes(key)) tickBaccarat(state);
      else if(['hilo','turbo_hilo'].includes(key)) tickHiLo(state);
      else if(['derby','turbo_derby'].includes(key)) tickDerby(state);
    } else {
      // Just tick timer
      broadcast(key, {type:'timer', timer:state.timer, phase:state.phase});
    }
    // On phase change, broadcast full state
    if(state.timer <= 0 || state._justChanged) {
      broadcastState(key);
      state._justChanged = false;
    }
  });
}, 1000);

// ── WEBSOCKET BROADCAST ──────────────────────────────────────
const clients = new Map(); // ws -> { userId, gameSubscriptions }

function broadcast(gameKey, data) {
  const msg = JSON.stringify({game:gameKey, ...data});
  wss.clients.forEach(ws => {
    if(ws.readyState===WebSocket.OPEN) ws.send(msg);
  });
}

function broadcastState(gameKey) {
  const state = gameStates[gameKey];
  const msg = JSON.stringify({type:'state', game:gameKey, state: safeState(state)});
  wss.clients.forEach(ws => {
    if(ws.readyState===WebSocket.OPEN) ws.send(msg);
  });
}

function broadcastSports() {
  const msg = JSON.stringify({type:'sports', data:sportsData});
  wss.clients.forEach(ws => {
    if(ws.readyState===WebSocket.OPEN) ws.send(msg);
  });
}

function safeState(state) {
  // Remove deck and internal arrays that client doesn't need
  const {deck, commFull, bets, ...safe} = state;
  return safe;
}

// ── WEBSOCKET HANDLER ────────────────────────────────────────
wss.on('connection', (ws) => {
  console.log('Client connected, total:', wss.clients.size);
  clients.set(ws, {userId: null});

  // Send full current state of all games immediately
  Object.keys(gameStates).forEach(key => {
    ws.send(JSON.stringify({type:'state', game:key, state:safeState(gameStates[key])}));
  });
  // Send sports data
  ws.send(JSON.stringify({type:'sports', data:sportsData}));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }

    if(msg.type === 'bet') {
      // Place bet in game
      const state = gameStates[msg.game];
      if(!state) return;
      if(!['pre','flop','turn','river'].includes(state.phase)) {
        ws.send(JSON.stringify({type:'bet_rejected', reason:'Betting closed'}));
        return;
      }
      const bet = {
        id: crypto.randomUUID(),
        userId: msg.userId,
        runner: msg.runner,
        type: msg.betType,
        odds: msg.odds,
        stake: msg.stake,
        market: msg.market,
        handIdx: msg.handIdx,
        settled: false,
        won: null,
        payout: 0,
        placedAt: new Date().toISOString(),
      };
      state.bets.push(bet);
      ws.send(JSON.stringify({type:'bet_confirmed', betId:bet.id, bet}));
      console.log(`Bet: ${msg.betType} ${msg.runner} @ ${msg.odds} x ${msg.stake} on ${msg.game}`);
    }

    if(msg.type === 'ping') ws.send(JSON.stringify({type:'pong'}));
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected, total:', wss.clients.size);
  });

  ws.on('error', (e) => console.log('WS error:', e.message));
});

// ── REST API ─────────────────────────────────────────────────
app.get('/api/state', (req,res) => {
  const states = {};
  Object.entries(gameStates).forEach(([k,v]) => states[k]=safeState(v));
  res.json(states);
});
app.get('/api/sports', (req,res) => res.json(sportsData));
app.get('/health', (req,res) => res.json({status:'ok',clients:wss.clients.size,uptime:process.uptime()}));

server.listen(PORT, () => {
  console.log(`\n🎰 MOT777 Game Server running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   ${Object.keys(gameStates).length} live games running\n`);
});
