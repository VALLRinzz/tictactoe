import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  ref, get, set, update, remove, onValue, runTransaction
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const $ = id => document.getElementById(id);
const screens = ["authScreen","homeScreen","onlineScreen","lobbyScreen","gameScreen","finishedScreen"];
const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let currentUser = null, username = "", authMode = "login";
let roomCode = null, room = null, role = null, roomUnsub = null, profileUnsub = null, profilesUnsub = null;
let gameMode = "online", botBoard = Array(9).fill(null), botTurn = "X", botDifficulty = "medium";
let botFinished = false, busy = false, audioCtx = null, recordedMatch = null, toastTimer = null;

function show(id){screens.forEach(s=>$(s).classList.toggle("hidden",s!==id));}
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2600);}
function cleanName(v){return v.trim().toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,20);}
function emailAlias(name){return `${name}@tictactoe.local`;}
function makeCode(){let s="";for(let i=0;i<5;i++)s+=CHARS[Math.floor(Math.random()*CHARS.length)];return s;}
function roomRef(code=roomCode){return ref(db,`ticTacToeRooms/${code}`);}
function profileRef(uid=currentUser?.uid){return ref(db,`profiles/${uid}`);}
function winner(board){for(const [a,b,c] of WIN_LINES)if(board[a]&&board[a]===board[b]&&board[a]===board[c])return board[a];return board.every(Boolean)?"draw":null;}
function playTone(freq=600,duration=.11,type="sine"){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audioCtx ||= new C();if(audioCtx.state==="suspended")audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.0001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.09,audioCtx.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration+.02);}catch(e){console.warn(e);}}
function soundMove(s){playTone(s==="X"?650:470,.09);}
function setBusy(v){busy=v;["authSubmitBtn","createRoomBtn","joinRoomBtn"].forEach(id=>{if($(id))$(id).disabled=v;});}

function setAuthMode(mode){authMode=mode;$("loginTab").classList.toggle("active",mode==="login");$("registerTab").classList.toggle("active",mode==="register");$("authTitle").textContent=mode==="login"?"Masuk arena":"Buat akun";$("authSubmitBtn").innerHTML=mode==="login"?"MASUK <span>↗</span>":"DAFTAR <span>↗</span>";$("authHint").textContent=mode==="login"?"Gunakan username dan password akunmu.":"Username akan menjadi identitas akunmu. Password minimal 6 karakter.";}
async function submitAuth(){
  if(busy)return;
  const name=cleanName($("usernameInput").value), pass=$("passwordInput").value;
  if(!/^[a-z0-9_]{3,20}$/.test(name))return toast("Username 3–20 karakter: huruf, angka, atau underscore.");
  if(pass.length<6)return toast("Password minimal 6 karakter.");
  setBusy(true);
  try{
    const credential=authMode==="register"
      ? await createUserWithEmailAndPassword(auth,emailAlias(name),pass)
      : await signInWithEmailAndPassword(auth,emailAlias(name),pass);
    currentUser=credential.user;username=name;
    await runTransaction(profileRef(),p=>({...p,name,username:name,createdAt:p?.createdAt||Date.now()}));
    toast(authMode==="register"?"Akun berhasil dibuat!":"Berhasil login!");
  }catch(e){
    console.error(e);
    const messages={"auth/email-already-in-use":"Username sudah dipakai.","auth/invalid-credential":"Username atau password salah.","auth/weak-password":"Password terlalu lemah.","auth/invalid-email":"Format username tidak valid.","auth/operation-not-allowed":"Aktifkan Email/Password di Firebase Authentication."};
    toast(messages[e.code]||e.message||"Autentikasi gagal.");
  }finally{setBusy(false);}
}
async function logout(){try{stopAllListeners();await signOut(auth);currentUser=null;username="";show("authScreen");$("logoutBtn").classList.add("hidden");$("signedUser").classList.add("hidden");toast("Kamu sudah keluar.");}catch(e){toast("Gagal logout.");}}
function stopAllListeners(){if(roomUnsub){roomUnsub();roomUnsub=null;}if(profileUnsub){profileUnsub();profileUnsub=null;}if(profilesUnsub){profilesUnsub();profilesUnsub=null;}}
function startHome(){
  show("homeScreen");$("signedUser").textContent=`@${username}`;$("signedUser").classList.remove("hidden");$("logoutBtn").classList.remove("hidden");
  profileUnsub=onValue(profileRef(),s=>renderProfile(s.val()||{}));
  profilesUnsub=onValue(ref(db,"profiles"),s=>renderLeaderboard(s.val()||{}),e=>console.warn(e));
}
function renderProfile(p){
  const st=p.games?.tictactoe||{},m=+st.matches||0,w=+st.wins||0,l=+st.losses||0,d=+st.draws||0,rate=m?Math.round(w/m*100):0;
  $("profileName").textContent=p.name||username.toUpperCase();$("profileStats").textContent=`${m} pertandingan · ${w} menang`;
  $("statMatches").textContent=m;$("statWins").textContent=w;$("statLosses").textContent=l;$("statDraws").textContent=d;$("statRate").textContent=`${rate}%`;$("rateFill").style.width=`${rate}%`;
}
function renderLeaderboard(all){
  const rows=Object.entries(all).map(([uid,p])=>({uid,name:p.name||p.username||"Pemain",...(p.games?.tictactoe||{})})).filter(p=>+p.matches>0).sort((a,b)=>(+b.wins||0)-(+a.wins||0)||(+b.winRate||0)-(+a.winRate||0)||(+b.matches||0)-(+a.matches||0));
  const list=$("leaderboardList");list.innerHTML="";
  if(!rows.length){list.innerHTML="<li>Belum ada data Tic Tac Toe.</li>";return;}
  rows.slice(0,10).forEach((p,i)=>{const li=document.createElement("li"),n=document.createElement("span"),s=document.createElement("strong");n.textContent=`${i+1}. ${p.name}${p.uid===currentUser?.uid?" (Kamu)":""}`;s.textContent=`${p.wins||0}W · ${p.winRate||0}%`;li.append(n,s);list.append(li);});
}
function beginOnline(){ $("roomNameInput").value=username;show("onlineScreen");}
async function createRoom(){
  if(busy)return;const name=$("roomNameInput").value.trim().slice(0,16)||username;setBusy(true);
  try{
    let code=null;
    for(let i=0;i<10;i++){const c=makeCode(),initial={hostUid:currentUser.uid,guestUid:null,status:"waiting",board:Array(9).fill(null),turnUid:currentUser.uid,createdAt:Date.now(),matchId:`tt-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,players:{[currentUser.uid]:{name,symbol:"X"}}};
      const r=await runTransaction(roomRef(c),v=>v===null?initial:undefined);if(r.committed){code=c;break;}}
    if(!code)throw Error("Tidak berhasil membuat room. Coba lagi.");
    roomCode=code;role="host";listenRoom();toast("Room berhasil dibuat!");
  }catch(e){console.error(e);toast(e.message||"Gagal membuat room.");}finally{setBusy(false);}
}
async function joinRoom(){
  if(busy)return;const code=$("roomCodeInput").value.trim().toUpperCase(),name=$("roomNameInput").value.trim().slice(0,16)||username;
  if(!/^[A-HJ-NP-Z2-9]{5}$/.test(code))return toast("Kode room harus 5 karakter.");
  setBusy(true);
  try{
    const r=await runTransaction(roomRef(code),v=>{if(!v||v.status!=="waiting"||v.hostUid===currentUser.uid||(v.guestUid&&v.guestUid!==currentUser.uid))return;return {...v,guestUid:currentUser.uid,players:{...v.players,[currentUser.uid]:{name,symbol:"O"}}};});
    if(!r.committed)throw Error("Room tidak ditemukan, sudah dimulai, atau sudah penuh.");
    roomCode=code;role="guest";listenRoom();toast("Berhasil bergabung!");
  }catch(e){console.error(e);toast(e.message||"Gagal bergabung.");}finally{setBusy(false);}
}
function listenRoom(){
  if(roomUnsub)roomUnsub();$("roomCodeDisplay").textContent=roomCode;show("lobbyScreen");
  roomUnsub=onValue(roomRef(),s=>{
    if(!s.exists()){toast("Room sudah ditutup.");resetRoom();show("onlineScreen");return;}
    room=s.val();renderLobby();
    if(room.status==="waiting")show("lobbyScreen");
    else if(room.status==="playing"){gameMode="online";show("gameScreen");renderOnlineGame();}
    else if(room.status==="finished"){show("finishedScreen");renderOnlineFinished();checkRematch().catch(e=>console.warn(e));}
  },e=>{console.error(e);toast("Tidak dapat membaca room. Periksa Firebase Rules.");});
}
function renderLobby(){
  const x=room.players?.[room.hostUid],o=room.guestUid?room.players?.[room.guestUid]:null;
  $("lobbyNameX").textContent=x?.name||"Menunggu...";$("lobbyNameO").textContent=o?.name||"Menunggu lawan...";
  $("guestState").textContent=o?"PLAYER O":"WAITING";$("startMatchBtn").classList.toggle("hidden",role!=="host");$("startMatchBtn").disabled=!(o&&room.status==="waiting");
  $("lobbyMessage").textContent=o?(role==="host"?"Lawan sudah bergabung. Mulai pertandingan!":"Menunggu host memulai..."):"Menunggu pemain kedua bergabung...";
}
async function startMatch(){
  if(role!=="host"||!room?.guestUid)return;
  await runTransaction(roomRef(),v=>{if(!v||v.status!=="waiting"||!v.guestUid||v.hostUid!==currentUser.uid)return;return {...v,status:"playing",board:Array(9).fill(null),turnUid:v.hostUid,winnerUid:null,finishReason:null,rematchVotes:null,matchId:`tt-${Date.now()}-${Math.random().toString(36).slice(2,8)}`};});
}
function renderBoard(board,enabled,winningLine=[]){
  document.querySelectorAll(".cell").forEach((b,i)=>{const v=board[i]||"";b.textContent=v;b.className="cell";if(v)b.classList.add(v.toLowerCase());if(winningLine.includes(i))b.classList.add("win");b.disabled=!enabled||!!v;});
}
function renderOnlineGame(){
  const x=room.players?.[room.hostUid],o=room.players?.[room.guestUid],mine=room.players?.[currentUser.uid]?.symbol,myTurn=room.turnUid===currentUser.uid;
  $("gameModeLabel").textContent="ONLINE LIVE MATCH";$("gameRoomLabel").textContent=`ROOM ${roomCode}`;
  $("gameNameX").textContent=x?.name||"PLAYER X";$("gameNameO").textContent=o?.name||"PLAYER O";$("gameScoreX").textContent="HOST · X";$("gameScoreO").textContent="GUEST · O";
  $("turnBanner").textContent=myTurn?`GILIRAN KAMU · ${mine}`:`GILIRAN ${room.players?.[room.turnUid]?.name||"LAWAN"}`;
  $("gameMessage").textContent=myTurn?"Giliran kamu. Pilih kotak kosong.":`Menunggu ${room.players?.[room.turnUid]?.name||"lawan"}...`;
  renderBoard(room.board||Array(9).fill(null),myTurn&&room.status==="playing");
}
async function onlineMove(index){
  if(!roomCode||!room||room.status!=="playing")return;
  try{
    const r=await runTransaction(roomRef(),v=>{
      if(!v||v.status!=="playing"||v.turnUid!==currentUser.uid||v.board?.[index])return;
      const board=[...(v.board||Array(9).fill(null))],symbol=v.players?.[currentUser.uid]?.symbol;if(!symbol)return;
      board[index]=symbol;const out=winner(board);
      return {...v,board,turnUid:out?null:(symbol==="X"?v.guestUid:v.hostUid),status:out?"finished":"playing",winnerUid:out==="draw"?null:out?currentUser.uid:null,finishReason:out||null,finishedAt:out?Date.now():null};
    });
    if(r.committed)soundMove(room.players?.[currentUser.uid]?.symbol||"X");
  }catch(e){console.error(e);toast("Langkah gagal disimpan.");}
}
function winningCells(board){for(const line of WIN_LINES){const [a,b,c]=line;if(board[a]&&board[a]===board[b]&&board[a]===board[c])return line;}return[];}
function renderOnlineFinished(){
  const x=room.players?.[room.hostUid],o=room.players?.[room.guestUid],draw=room.finishReason==="draw"||!room.winnerUid,won=room.winnerUid===currentUser.uid;
  $("winnerTitle").textContent=draw?"HASIL SERI!":`${room.players?.[room.winnerUid]?.name||"PEMAIN"} MENANG!`;
  $("finalSummary").textContent=draw?"Papan penuh. Pertandingan berakhir seri.":won?"Selamat! Kamu memenangkan pertandingan.":"Pertandingan selesai. Coba lagi di rematch!";
  $("finalNameX").textContent=x?.name||"PLAYER X";$("finalNameO").textContent=o?.name||"PLAYER O";$("finalScoreX").textContent="X";$("finalScoreO").textContent="O";
  $("rematchBtn").classList.remove("hidden");const voted=!!room.rematchVotes?.[currentUser.uid];$("rematchBtn").disabled=voted;$("rematchBtn").textContent=voted?"MENUNGGU LAWAN...":"REMATCH ↻";
  const mid=room.matchId;if(recordedMatch!==mid){recordedMatch=mid;recordStats(room.winnerUid===currentUser.uid,draw,mid).catch(console.warn);if(draw)playTone(500,.18);else if(won){playTone(760,.15);setTimeout(()=>playTone(990,.18),130);}else playTone(220,.24,"triangle");}
}
async function voteRematch(){if(!roomCode||room?.status!=="finished")return;try{await set(ref(db,`ticTacToeRooms/${roomCode}/rematchVotes/${currentUser.uid}`),true);toast("Permintaan rematch dikirim.");}catch(e){toast("Gagal meminta rematch.");}}
async function checkRematch(){
  if(role!=="host"||room?.status!=="finished"||!room.guestUid||!room.rematchVotes?.[room.hostUid]||!room.rematchVotes?.[room.guestUid])return;
  await runTransaction(roomRef(),v=>{if(!v||v.status!=="finished"||!v.rematchVotes?.[v.hostUid]||!v.rematchVotes?.[v.guestUid])return;return {...v,status:"playing",board:Array(9).fill(null),turnUid:v.hostUid,winnerUid:null,finishReason:null,finishedAt:null,rematchVotes:null,matchId:`tt-${Date.now()}-${Math.random().toString(36).slice(2,8)}`};});
}
async function recordStats(won,draw,matchId){
  await runTransaction(profileRef(),p=>{
    p=p||{name:username};const games=p.games||{},old=games.tictactoe||{matches:0,wins:0,losses:0,draws:0};
    if(old.lastMatchId===matchId)return p;
    const st={...old,matches:(+old.matches||0)+1,wins:(+old.wins||0)+(won?1:0),losses:(+old.losses||0)+(!won&&!draw?1:0),draws:(+old.draws||0)+(draw?1:0),lastMatchId:matchId};
    st.winRate=Math.round(st.wins/st.matches*100);return {...p,name:username,games:{...games,tictactoe:st},updatedAt:Date.now()};
  });
}
async function leaveRoom(){
  const code=roomCode,r=role;if(roomUnsub){roomUnsub();roomUnsub=null;}
  try{if(code){if(r==="host")await remove(ref(db,`ticTacToeRooms/${code}`));else await update(ref(db,`ticTacToeRooms/${code}`),{guestUid:null,[`players/${currentUser.uid}`]:null});}}catch(e){console.warn(e);}
  resetRoom();show("homeScreen");
}
function resetRoom(){if(roomUnsub){roomUnsub();roomUnsub=null;}roomCode=null;room=null;role=null;recordedMatch=null;}
async function copyCode(){if(!roomCode)return;try{await navigator.clipboard.writeText(roomCode);$("copyFeedback").textContent="KODE BERHASIL DISALIN!";}catch{$("copyFeedback").textContent=`KODE ROOM: ${roomCode}`;}}
function showBotGame(){
  gameMode="bot";botBoard=Array(9).fill(null);botTurn="X";botFinished=false;botDifficulty=$("botDifficulty").value;
  $("gameModeLabel").textContent="SOLO PRACTICE · VS BOT";$("gameRoomLabel").textContent=botDifficulty.toUpperCase();
  $("gameNameX").textContent=username;$("gameNameO").textContent="COMPUTER";$("gameScoreX").textContent="YOU · X";$("gameScoreO").textContent="BOT · O";
  $("turnBanner").textContent="GILIRAN KAMU · X";$("gameMessage").textContent="Kamu bermain sebagai X. Mulai duluan!";
  renderBoard(botBoard,true);show("gameScreen");
}
function minimax(board,isMax){
  const out=winner(board);if(out==="O")return {score:10};if(out==="X")return {score:-10};if(out==="draw")return {score:0};
  let best={score:isMax?-Infinity:Infinity,index:-1};
  for(let i=0;i<9;i++)if(!board[i]){board[i]="O";const v=minimax(board,!isMax).score;board[i]=null;if(isMax?v>best.score:v<best.score)best={score:v,index:i};}
  return best;
}
function botPick(){
  const empty=botBoard.map((v,i)=>v?null:i).filter(v=>v!==null);
  if(!empty.length)return;
  if(botDifficulty==="easy")return empty[Math.floor(Math.random()*empty.length)];
  if(botDifficulty==="medium"){
    for(const i of empty){botBoard[i]="O";if(winner(botBoard)==="O"){botBoard[i]=null;return i;}botBoard[i]=null;}
    for(const i of empty){botBoard[i]="X";if(winner(botBoard)==="X"){botBoard[i]=null;return i;}botBoard[i]=null;}
    return empty[Math.floor(Math.random()*empty.length)];
  }
  return minimax(botBoard,true).index;
}
function botMove(i){
  if(botFinished||botBoard[i]||winner(botBoard)||botTurn!=="X")return;
  botBoard[i]="X";soundMove("X");const out=winner(botBoard);
  if(out){finishBot(out);return;}
  botTurn="O";$("turnBanner").textContent="GILIRAN COMPUTER";$("gameMessage").textContent="Computer sedang berpikir...";renderBoard(botBoard,false);
  setTimeout(()=>{const pick=botPick();if(pick===undefined)return;botBoard[pick]="O";soundMove("O");const result=winner(botBoard);if(result){finishBot(result);return;}botTurn="X";$("turnBanner").textContent="GILIRAN KAMU · X";$("gameMessage").textContent="Giliranmu. Pilih kotak kosong.";renderBoard(botBoard,true);},450);
}
async function finishBot(out){
  botFinished=true;renderBoard(botBoard,false,winningCells(botBoard));const draw=out==="draw",won=out==="X";
  $("winnerTitle").textContent=draw?"HASIL SERI!":won?"KAMU MENANG!":"BOT MENANG!";
  $("finalSummary").textContent=draw?"Permainan berakhir seri.":won?"Strategimu berhasil mengalahkan bot!":"Coba strategi lain di pertandingan berikutnya.";
  $("finalNameX").textContent=username;$("finalNameO").textContent="COMPUTER";$("finalScoreX").textContent="X";$("finalScoreO").textContent="O";
  $("rematchBtn").classList.add("hidden");show("finishedScreen");
  const matchId=`bot-${currentUser.uid}-${Date.now()}`;await recordStats(won,draw,matchId);
  if(draw)playTone(500,.18);else if(won){playTone(760,.15);setTimeout(()=>playTone(990,.18),130);}else playTone(220,.24,"triangle");
}
function cellClick(i){if(gameMode==="bot")botMove(i);else onlineMove(i);}

document.querySelectorAll(".cell").forEach(b=>b.addEventListener("click",()=>cellClick(+b.dataset.index)));
$("loginTab").addEventListener("click",()=>setAuthMode("login"));$("registerTab").addEventListener("click",()=>setAuthMode("register"));$("authSubmitBtn").addEventListener("click",submitAuth);
$("passwordInput").addEventListener("keydown",e=>{if(e.key==="Enter")submitAuth();});$("usernameInput").addEventListener("input",()=>{$("usernameInput").value=$("usernameInput").value.toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,20);});
$("logoutBtn").addEventListener("click",logout);$("brandHome").addEventListener("click",e=>{e.preventDefault();if(currentUser)show("homeScreen");});
$("showOnlineBtn").addEventListener("click",beginOnline);$("playBotBtn").addEventListener("click",showBotGame);$("createRoomBtn").addEventListener("click",createRoom);$("joinRoomBtn").addEventListener("click",joinRoom);
$("startMatchBtn").addEventListener("click",startMatch);$("copyCodeBtn").addEventListener("click",copyCode);$("leaveRoomBtn").addEventListener("click",leaveRoom);$("exitGameBtn").addEventListener("click",leaveRoom);
$("rematchBtn").addEventListener("click",voteRematch);$("resultHomeBtn").addEventListener("click",()=>{if(gameMode==="online")leaveRoom();else show("homeScreen");});
$("refreshLeaderboardBtn").addEventListener("click",()=>{get(ref(db,"profiles")).then(s=>renderLeaderboard(s.val()||{})).catch(()=>toast("Leaderboard gagal dimuat."));});
document.querySelectorAll("[data-back]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.back)));
$("roomCodeInput").addEventListener("input",()=>{$("roomCodeInput").value=$("roomCodeInput").value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,"").slice(0,5);});
onAuthStateChanged(auth,async user=>{
  if(user){
    currentUser=user;
    const snap=await get(profileRef());username=snap.val()?.username||snap.val()?.name||user.email?.split("@")[0]||"player";
    username=cleanName(username)||"player";
    if(!snap.exists())await set(profileRef(),{name:username,username,createdAt:Date.now()});
    startHome();
  }else{stopAllListeners();currentUser=null;username="";show("authScreen");$("logoutBtn").classList.add("hidden");$("signedUser").classList.add("hidden");}
});
