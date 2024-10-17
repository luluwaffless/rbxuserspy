import config from "./config.js";
import fs from "node:fs";
import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import { Client, GatewayIntentBits, ActivityType, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
dotenv.config();
const app = express();
app.use(express.static("public"));
let sessionInfo = { checks: 0, users: {}, erd: 0, efd: 0, esm: 0, startTime: new Date().toISOString(), nextCheck: "" };
let tc;
Object.keys(config.users).forEach((user) => {
    sessionInfo.users[user] = {
        lastStatus: -1,
        lastStatusBegin: "",
        lastLocation: "",
        placeId: null,
        gameId: null,
        status: 0
    };
});
async function log(data) {
    return fs.appendFileSync("public/logs.txt", `[${new Date().toISOString()}] ${data}\n`);
};
const send = async (c) => await tc.send(c).catch((err) => {
    sessionInfo.esm += 1;
    log(`❌ Line 19: Error sending message: ${error}`);
});
function timeSince(isostr) {
    const timestamp = new Date(isostr).getTime();
    const now = new Date().getTime();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    let parts = [];
    if (hours && hours > 0) parts.push(`${hours} hora${hours != 1 ? "s" : ""}`);
    if (minutes && minutes > 0) parts.push(`${minutes} minuto${minutes != 1 ? "s" : ""}`);
    if (seconds && seconds > 0) parts.push(`${seconds} segundo${seconds != 1 ? "s" : ""}`);
    return parts.length > 0 ? parts.join(", ") : "agora";
};
app.get("/info", (_, res) => {
    res.json(sessionInfo);
});
app.get("/config", (_, res) => {
    res.json(config);
});
app.get("/check", async function (_, res) {
    await check(true);
    res.json(sessionInfo);
});
app.get("/user", (req, res) => {
    const response = config.users[req.query.id];
    response ? res.json(response) : res.sendStatus(404);
});
const statusEmoji = ['⚫', '🔵', '🟢', '🟠', '❔'];
const statusText = ['offline', 'online', 'jogando', 'no studio', 'invisível'];
async function check(individual) {
    await axios.post("https://presence.roblox.com/v1/presence/users", { "userIds": Object.keys(sessionInfo.users) }, {
        headers: {
            "accept": "application/json",
            "Content-Type": "application/json",
            "Cookie": process.env.cookie
        }, withCredentials: true
    })
        .then(function (response) {
            if (response.data["userPresences"] && response.data.userPresences.length > 0) {
                response.data.userPresences.forEach((presence) => {
                    console.log(presence);
                    const { userPresenceType, lastLocation, placeId, gameId, userId } = presence;
                    if (userPresenceType != sessionInfo.users[presence.userId].status || presence.gameId != sessionInfo.users[presence.userId].gameId) {
                        sessionInfo.users[userId].lastStatus = sessionInfo.users[userId].status;
                        sessionInfo.users[userId].status = userPresenceType;
                        sessionInfo.users[userId].placeId = placeId;
                        sessionInfo.users[userId].gameId = gameId;
                        if (presence.userPresenceType === 2 && placeId && gameId) {
                            const button = new ButtonBuilder()
                                .setLabel('entrar')
                                .setURL(`https://deepblox.onrender.com/experiences/start?placeId=${placeId}&gameInstanceId=${gameId}`)
                                .setStyle(ButtonStyle.Link);
                            const row = new ActionRowBuilder()
                                .addComponents(button);
                            send({
                                content: `\`🟢\` **[${config.users[userId].preDisplay} ${config.users[userId].displayName}](<https://www.roblox.com/users/${userId}/profile>)** está jogando [${lastLocation}](https://www.roblox.com/games/${placeId})${sessionInfo.users[userId].lastStatus > 0 ? `\n-# ficou ${statusText[sessionInfo.users[userId].lastStatus]}${sessionInfo.users[userId].lastStatus === 2 ? " " + sessionInfo.users[userId].lastLocation : ""} por ${timeSince(sessionInfo.users[userId].lastStatusBegin)}` : ""}`,
                                components: [row]
                            });
                        } else {
                            send(`\`${statusEmoji[userPresenceType]}\` **[${config.users[userId].preDisplay} ${config.users[userId].displayName}](<https://www.roblox.com/users/${userId}/profile>)** está ${statusText[userPresenceType]}${sessionInfo.users[userId].lastStatus > 0 ? `\n-# ficou ${statusText[sessionInfo.users[userId].lastStatus]}${sessionInfo.users[userId].lastStatus === 2 ? " " + sessionInfo.users[userId].lastLocation : ""} por ${timeSince(sessionInfo.users[userId].lastStatusBegin)}` : ""}`);
                        };
                        sessionInfo.users[userId].lastLocation = lastLocation;
                        sessionInfo.users[presence.userId].lastStatusBegin = new Date().toISOString();
                    };
                });
            } else {
                log(`❌ Line 214: Error reading data: ${response.data}`);
            };
        })
        .catch(function (error) {
            sessionInfo.efd += 1;
            log(`❌ Line 219: Error fetching data: ${error}`);
        });
    sessionInfo.checks += 1;
    if (!individual) sessionInfo.nextCheck = new Date(new Date().getTime() + 30000).toISOString();
};
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const changeName = (n, c) => { if (c.name != n) return c.setName(n); };
client.on('ready', async function () {
    tc = await client.channels.fetch(config.discord.updatesTcId);
    const vc = await client.channels.fetch(config.discord.vcStatusId);
    await changeName("bot: online 🟢", vc);
    client.user.setPresence({
        activities: [{
            name: config.discord.status,
            type: ActivityType.Watching
        }],
        status: 'online'
    });
    check();
    setInterval(check, 30000);
    app.listen(config.port, function () {
        console.log("✅ http://localhost:" + config.port);
    });
    log("🟢 Online");
    for (let evt of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
        process.on(evt, async function () {
            process.stdin.resume();
            await changeName("bot: offline 🔴", vc);
            await log("🔴 Offline");
            process.exit();
        });
    };
});
client.login(process.env.token);