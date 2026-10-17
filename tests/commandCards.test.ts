import {test,expect} from "bun:test";
import {Database} from "bun:sqlite";
import {readFileSync} from "node:fs";
import {AttachmentBuilder} from "discord.js";
import {MmrHistoryStore} from "../services/mmrHistory.service";
import {ProfileCache} from "../services/profileCache.service";
import {RequestQueue} from "../services/requestQueue.service";
import {parseProfileHtml,parseStreak,type PlaylistStats} from "../services/profileParser.service";
import {makeRankCardModel} from "../services/rankCardModel.service";
import {leaderboardModel} from "../services/leaderboardModel.service";
import {averageModel} from "../services/averageCardModel.service";
import generateBoard from "../services/generateLeaderboardCard.service";
import generateAverage,{HistoryCardLimitError} from "../services/generateAverageCard.service";
import {statusMessage,replyStatus,imageMessage,playerLabel} from "../services/commandReply.service";
const ranks=()=>parseProfileHtml(readFileSync(new URL("./fixtures/rank-table.html",import.meta.url),"utf8")).tableData!;
const now=Date.now(),hour=3600000;
function png(image:AttachmentBuilder){const bytes=image.attachment as Buffer;expect(bytes.subarray(0,8).toString("hex")).toBe("89504e470d0a1a0a");expect(bytes.readUInt32BE(16)).toBe(1280);expect(bytes.length).toBeLessThan(8*1024*1024);return bytes;}

test("streak parser accepts only explicit safe winning/losing reports",()=>{
 expect(parseStreak("Win Strk. 5")).toBe(5);expect(parseStreak(" Loss Streak 8 ")).toBe(-8);expect(parseStreak("Win Strk. 0")).toBe(0);
 for(const text of ["5","unavailable","7 matches","Win Strk. 9007199254740992","Win Strk. -2"])expect(parseStreak(text)).toBeNull();
});
test("existing four-column history upgrades idempotently without inventing streaks",()=>{
 const db=new Database(":memory:");db.exec("CREATE TABLE mmr_history(profile_key TEXT,playlist TEXT,observed_at INTEGER,mmr INTEGER,PRIMARY KEY(profile_key,observed_at,playlist))");
 db.query("INSERT INTO mmr_history VALUES (?,?,?,?)").run("epic:p","Duel",now,1000);
 const store=new MmrHistoryStore(db);new MmrHistoryStore(db);
 expect(db.query("SELECT mmr,source_streak FROM mmr_history").get()).toEqual({mmr:1000,source_streak:null});expect(store.bestWinStreaks("epic:p",now)).toEqual({});db.close();
});
test("best streak is a maximum, not a sum or inference from MMR, and respects snapshot time",()=>{
 const db=new Database(":memory:"),store=new MmrHistoryStore(db),row=ranks()[0];
 for(const [i,streak] of [5,5,-20,7].entries())store.record("epic:p",[{...row,mmr:1000+i*100,streak}],now-(3-i)*hour);
 expect(store.bestWinStreaks("epic:p",now-hour)[row.playlist]).toBe(5);expect(store.bestWinStreaks("epic:p",now)[row.playlist]).toBe(7);
 store.record("epic:p",[{...row,streak:3}],now);expect(store.bestWinStreaks("epic:p",now)[row.playlist]).toBe(5);
 expect(store.bestWinStreaks("epic:P",now)).toEqual({});db.close();
});
test("unknown streak stays unknown; valid losses produce zero wins, and removed modes disappear",()=>{
 const db=new Database(":memory:"),store=new MmrHistoryStore(db),row=ranks()[0];
 store.record("p",[{...row,streak:null}],now-hour);expect(store.bestWinStreaks("p",now)).toEqual({});
 store.record("p",[{...row,streak:-9}],now);expect(store.bestWinStreaks("p",now)[row.playlist]).toBe(0);
 store.record("p",[],now);expect(store.bestWinStreaks("p",now)).toEqual({});
 const m=makeRankCardModel({name:"p",ranks:[{...row,streak:5}],fetchedAt:now});expect(m.modes[0].bestWinStreak).toBe(5);db.close();
});
test("streak history retains existing atomic cache-failure and cached-read semantics",async()=>{
 const db=new Database(":memory:");let streak=8,fail=false;
 const cache=new ProfileCache(db,async()=>fail?{error:"blocked"}:{tableData:[{...ranks()[0],streak}]},new RequestQueue(0));
 await cache.get("p","epic");await cache.get("p","epic");fail=true;await cache.get("p","epic",{refresh:true});
 expect(cache.history.bestWinStreaks("epic:p",Date.now())[ranks()[0].playlist]).toBe(8);
 expect(db.query("SELECT COUNT(*) n FROM mmr_history").get()).toEqual({n:1});db.close();
});
test("best streak has the documented retained observation window",()=>{
 const db=new Database(":memory:"),store=new MmrHistoryStore(db),row=ranks()[0];
 store.record("p",[{...row,streak:100}],now-91*24*hour);store.record("p",[{...row,streak:2}],now);
 expect(store.bestWinStreaks("p",now)[row.playlist]).toBe(2);db.close();
});
test("leaderboard includes real zero, excludes missing/substring matches, and breaks ties stably",()=>{
 const row=ranks()[0],account=(id:string,name:string,stats:PlaylistStats[])=>({discord_id:id,playername:name,stats_data:stats});
 const m=leaderboardModel([account("2","Z",[{...row,mmr:0}]),account("1","A",[{...row,mmr:0}]),account("3","Missing",[{...row,mmr:null}]),account("4","Wrong",[{...row,playlist:"Custom Duel 1v1 match",mmr:9999}])],"competitive");
 expect(m.rows.map(r=>r.playername)).toEqual(["A","Z"]);expect(m.rows[0].score).toBe(0);
 expect(leaderboardModel([account("5","Snow",[{...row,playlist:"Snowday",mmr:9}])],"extra").total).toBe(1);
});
test("average summaries preserve missing, partial and zero and reject invalid counts",()=>{
 const m=averageModel([{season:"Zero",totalMatches:0,playlists:{Duel:{rank:"Unranked",matches:0}}},{season:"Partial",totalMatches:null,playlists:{Duel:{rank:"Gold I",matches:7},Hoops:{rank:"Unranked",matches:null}}},{season:"Unknown",playlists:{Duel:{rank:"Unranked",matches:-2}}}]);
 expect(m.known).toBe(7);expect(m.average).toBe(0);expect(m.partial).toBe(true);expect(m.rows[2].known).toBeNull();expect(m.averages.find(s=>s.playlist==="Duel")!.averageMatches).toBe(4);
});
test("all command replies suppress mentions and preserve ephemeral/deferred response lifecycle",async()=>{
 const calls:any[]=[];const i:any={replied:false,deferred:false,reply:async(p:any)=>{calls.push(["reply",p]);i.replied=true;},editReply:async(p:any)=>calls.push(["edit",p])};
 await replyStatus(i,"Profile linked",playerLabel("@everyone **bad**"),"success");expect(calls[0][1].flags).toBe(64);expect(calls[0][1].allowedMentions.parse).toEqual([]);expect(calls[0][1].embeds[0].toJSON().description).toContain("\\*\\*bad");
 await replyStatus(i,"Updated","Done");expect(calls[1][0]).toBe("edit");
 const status=statusMessage("Failed","Retry","error");expect(status.embeds[0].toJSON().color).toBe(0xff9eaf);
 const images=imageMessage([new AttachmentBuilder(Buffer.from("png"),{name:"x.png"})]);expect(images.embeds[0].toJSON().image!.url).toBe("attachment://x.png");expect(images.allowedMentions.parse).toEqual([]);
});
test("top25 leaderboard renders bounded local pages including Unicode and null stats",async()=>{
 const stats=ranks().map(r=>({...r,icon:"https://invalid.example/must-not-fetch"}));
 const accounts=Array.from({length:26},(_,i)=>({discord_id:String(i),playername:"星 🏆 "+i,stats_data:stats,fetchedAt:now,stale:i%2===0}));
 const images=await generateBoard(accounts,"extra","A long guild ".repeat(20));expect(images).toHaveLength(3);
 for(const image of images){expect(png(image).readUInt32BE(20)).toBeLessThanOrEqual(1540);}
 expect(images[2].description).toContain("25.");
});
test("season history keeps all rows/modes across bounded pages and reports oversize explicitly",async()=>{
 const modes=ranks(),seasons=Array.from({length:15},(_,i)=>({season:`Season ${15-i}`,totalMatches:0,playlists:Object.fromEntries(modes.map(r=>[r.playlist,{rank:r.rank,matches:0}]))}));
 const images=await generateAverage({name:"雪 🏆 ".repeat(30),seasonData:seasons,fetchedAt:now,stale:true});expect(images).toHaveLength(4);
 for(const image of images){png(image);expect(image.description).toContain("page");}
 expect(images.at(-1)!.description).toContain("Season 1");
 await expect(generateAverage({name:"p",seasonData:Array.from({length:200},()=>seasons[0])})).rejects.toBeInstanceOf(HistoryCardLimitError);
});
