import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import generateBoard from "../services/generateLeaderboardCard.service";
import generateAverage from "../services/generateAverageCard.service";
import generateRank from "../services/generateRankCard.service";
import {parseProfileHtml} from "../services/profileParser.service";
import {statusMessage} from "../services/commandReply.service";
const dir=process.argv[2]||"benchmark/results/command-card-style";mkdirSync(dir,{recursive:true});
const ranks=parseProfileHtml(readFileSync(new URL("../tests/fixtures/rank-table.html",import.meta.url),"utf8")).tableData!,at=Date.now();
const players=Array.from({length:12},(_,i)=>({discord_id:String(i),playername:["Aether","Nova","雪の星 🏆","Orbit"][i%4]+(i<4?"":" "+i),stats_data:ranks.map((r,j)=>({...r,mmr:r.mmr===null?null:Math.max(0,r.mmr-i*27+j)})),fetchedAt:at-i*900000,stale:i>3}));
for(const mode of ["competitive","extra"] as const){const images=await generateBoard(players,mode,"Aylian Studios",true);for(const [i,image]of images.entries())writeFileSync(`${dir}/leaderboard-${mode}-${i+1}.png`,image.attachment as Buffer);}
const seasons=Array.from({length:18},(_,i)=>({season:`Season ${25-i}`,totalMatches:i===3?null:ranks.reduce((n,r,j)=>n+Math.max(0,180-i*6-j*8),0),playlists:Object.fromEntries(ranks.map((r,j)=>[r.playlist,{rank:r.rank,matches:i===3&&j===0?null:Math.max(0,180-i*6-j*8)}]))}));
const averages=await generateAverage({name:"Aether",seasonData:seasons,fetchedAt:at,preview:true});for(const[i,image]of averages.entries())writeFileSync(`${dir}/season-history-${i+1}.png`,image.attachment as Buffer);
const image=await generateRank({name:"Aether",ranks,fetchedAt:at,preview:true,bestWinStreaks:Object.fromEntries(ranks.map((r,i)=>[r.playlist,9+i]))});writeFileSync(`${dir}/rank-streak.png`,image.attachment as Buffer);
writeFileSync(`${dir}/status-previews.json`,JSON.stringify([statusMessage("Profile linked","**Aether** · EPIC","success"),statusMessage("Profile unlinked","Your saved link has been removed.","success"),statusMessage("Stats unavailable","Tracker is unavailable. Try again shortly.","error")],null,2));
console.log(`Command previews saved to ${dir}`);
