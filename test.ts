import getRanksByTable from "./services/getRanksByTable.service";
import axios from "axios";
import fs from "fs";
import { performance } from "perf_hooks";
import puppeteer from "puppeteer";

const players = [
  "ehzgodd",
  "diazrll",
  "tawkᴋ",
  "visaac.",
  "saddrl",
  "frostysnowboy15",
  "	yujinµ",
  "Dayys-2",
  "justphocas.",
  "代文字",
  "sedou.",
  "M6R_rl",
  "dabberll_",
  "ReshiramRL",
  "gabi165cm",
  "JoreuzFN",
  "Jup_Jup_",
  "Rebmob LFT",
  "mawkzy",
  "Beierconthec",
  "Rrlasenettha",
  "Korilenarona",
  "Choniajioile",
  "Ssevalerinal",
  "Ganurchuantt",
  "Joyneninaypa",
  "Lokensezalik",
  "Yshonabaquac",
  "Isongeborsha",
  "Fuziedierona",
  "Driarshasith",
  "Haimalynarma",
  "Kspeyaipanal",
  "Miobrorallya",
  "tauruss.",
  "µaluuµ",
  "decola .",
  "Xel.Da",
  "razoxx.",
  "trooper rl",
  "oVaMPiiERz",
  "dc wockser",
  "Kyro ヅ",
  "avasttz.",
  "Ringa ぅ",
  "pewvw",
  "wockster07",
  "hopoptt",
  "C7oaKy.III",
  "twitch slothyrl",
];

export default async function testRateLimit() {
  console.log(`Starting test with ${players.length * 30} players`);
  const startTime = performance.now();
  for (let k = 0; k < 30; k++) {
    for (let i = 0; i < players.length; i++) {
      const browser = await puppeteer.launch({ headless: false });
      const player = players[i];
      const result = await getRanksByTable(browser, player).catch((e) => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        const seconds = (duration / 1000).toFixed(2);
        const minutes = Math.floor(duration / 60000);
        const remainingSeconds = ((duration % 60000) / 1000).toFixed(2);
        console.log(
          `Error after ${
            i * k
          } players and ${minutes} minutes and ${remainingSeconds} seconds`
        );
        console.log(e);
      });
      if (result.tableData == null) console.log(`No data for ${player}`);
      let json = JSON.stringify(result.tableData, null, 2);

      fs.readFile("output.json", "utf8", function readFileCallback(err, data) {
        if (err) {
          console.log(err);
        } else {
          fs.writeFile("output.json", json, "utf8", function (err) {
            if (err) {
              console.log(err);
            }
          }); // write it back
        }
      });
      browser.close();
    }
  }

  const endTime = performance.now();
  const duration = endTime - startTime;
  const seconds = (duration / 1000).toFixed(2);
  const minutes = Math.floor(duration / 60000);
  const remainingSeconds = ((duration % 60000) / 1000).toFixed(2);

  console.log(`Duration: ${minutes} minutes and ${remainingSeconds} seconds`);
}

// const browser = puppeteer.launch({ headless: false }).then((browser) => {
//   testRateLimit(browser);
// });
testRateLimit();
