const fs = require("fs");
const path = require("path");
const gradient = require('gradient-string');
const chalk = require('chalk'); 
const { login } = require("ws3-fca");
const sqlite3 = require("sqlite3").verbose();
const figlet = require("figlet");
const os = require('os');
const { startUpdater } = require("./updater"); 
const { handleCommand } = require("./utils/cmdHandler");
const { handleEvent } = require("./utils/eventsHandler");
const { startMonitor, MONITOR_PORT } = require("./utils/monitor");
const commands = new Map();
const events = new Map();
const db = new sqlite3.Database(path.join(__dirname, "bot.db")) ;
let settings = {};
let lang = {};

const onReplyMap = new Map();
const onChatMap = new Map();
const onBootCallbacks = []; 

async function setupDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                userID TEXT PRIMARY KEY,
                name TEXT,
                coins INTEGER DEFAULT 0,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                prefix TEXT,
                data TEXT
            )`, (err) => {
                if (err) return reject(new Error("Failed to create users table: " + err.message));
            });

            db.run(`CREATE TABLE IF NOT EXISTS groups (
                groupID TEXT PRIMARY KEY,
                name TEXT,
                joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                admins TEXT,
                prefix TEXT,
                data TEXT
            )`, (err) => {
                if (err) return reject(new Error("Failed to create groups table: " + err.message));
            });

            db.run(`CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                senderID TEXT,
                threadID TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                content TEXT
            )`, (err) => {
                if (err) return reject(new Error("Failed to create history table: " + err.message));
            });
            
            console.log("SQLite database initialized successfully.");
            resolve();
        });
    });
}

const dbHelpers = {
    _processRow: (row) => {
        if (!row) return null;
        try {
            row.data = JSON.parse(row.data || "{}");
            if (row.admins) row.admins = JSON.parse(row.admins);
        } catch (e) {
            row.data = {};
        }
        return row;
    },

    getUser: (userID) => new Promise((resolve, reject) => {
        db.get("SELECT * FROM users WHERE userID = ?", [userID], (err, row) => {
            if (err) return reject(err);
            resolve(dbHelpers._processRow(row));
        });
    }),
    
    createUser: async (userData) => {
        const existing = await dbHelpers.getUser(userData.userID);
        if (existing) return existing;
        return new Promise((resolve, reject) => {
            const dataStr = JSON.stringify(userData.data || {});
            db.run("INSERT INTO users (userID, name, coins, data) VALUES (?, ?, ?, ?)", 
                   [userData.userID, userData.name || "", userData.coins || 0, dataStr], 
                   function(err) {
                if (err) return reject(err);
                resolve({ ...userData, data: JSON.parse(dataStr) });
            });
        });
    },

    updateUser: (userID, updateData) => new Promise(async (resolve, reject) => {
        const user = await dbHelpers.getUser(userID);
        if (!user) return reject(new Error(`User with ID ${userID} not found for update.`));

        const updates = [];
        const values = [];
        
        // Use existing data, and merge with new data if provided
        let dataToStore = user.data;
        if (updateData.data) {
            dataToStore = { ...dataToStore, ...updateData.data };
        }

        for (const [key, value] of Object.entries(updateData)) {
            if (key !== 'data') {
                updates.push(`${key} = ?`);
                values.push(value);
            }
        }
        
        updates.push("data = ?");
        values.push(JSON.stringify(dataToStore));
        values.push(userID);
        
        db.run(`UPDATE users SET ${updates.join(", ")} WHERE userID = ?`, values, function(err) {
            if (err) return reject(err);
            resolve({ changes: this.changes });
        });
    }),

    getGroup: (groupID) => new Promise((resolve, reject) => {
        db.get("SELECT * FROM groups WHERE groupID = ?", [groupID], (err, row) => {
            if (err) return reject(err);
            resolve(dbHelpers._processRow(row));
        });
    }),

    createGroup: async (groupData) => {
        const existing = await dbHelpers.getGroup(groupData.groupID);
        if (existing) return existing;
        return new Promise((resolve, reject) => {
            const dataStr = JSON.stringify(groupData.data || {});
            const adminsStr = JSON.stringify(groupData.admins || []);
            db.run("INSERT INTO groups (groupID, name, admins, data) VALUES (?, ?, ?, ?)", 
                   [groupData.groupID, groupData.name || "", adminsStr, dataStr], 
                   function(err) {
                if (err) return reject(err);
                resolve({ ...groupData, data: JSON.parse(dataStr) });
            });
        });
    },

    updateGroup: (groupID, updateData) => new Promise(async (resolve, reject) => {
        const group = await dbHelpers.getGroup(groupID);
        if (!group) return reject(new Error(`Group with ID ${groupID} not found for update.`));

        const updates = [];
        const values = [];
        
        // Use existing data, and merge with new data if provided
        let dataToStore = group.data;
        if (updateData.data) {
            dataToStore = { ...dataToStore, ...updateData.data };
        }
        
        for (const [key, value] of Object.entries(updateData)) {
            if (key === 'admins') {
                updates.push("admins = ?");
                values.push(JSON.stringify(value));
            } else if (key !== 'data') {
                updates.push(`${key} = ?`);
                values.push(value);
            }
        }
        
        updates.push("data = ?");
        values.push(JSON.stringify(dataToStore));
        values.push(groupID);
        
        db.run(`UPDATE groups SET ${updates.join(", ")} WHERE groupID = ?`, values, function(err) {
            if (err) return reject(err);
            resolve({ changes: this.changes });
        });
    }),
    
    addToHistory: (historyData) => new Promise((resolve, reject) => {
        db.run("INSERT INTO history (type, senderID, threadID, content) VALUES (?, ?, ?, ?)",
               [historyData.type, historyData.senderID, historyData.threadID, historyData.content],
               function(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID });
        });
    }),
    
    getAllUsers: () => new Promise((resolve, reject) => {
        db.all("SELECT * FROM users", (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(row => dbHelpers._processRow(row)));
        });
    }),
    
    getAllGroups: () => new Promise((resolve, reject) => {
        db.all("SELECT * FROM groups", (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(row => dbHelpers._processRow(row)));
        });
    }),
    
    getRecentHistory: (limit) => new Promise((resolve, reject) => {
        db.all("SELECT * FROM history ORDER BY timestamp DESC LIMIT ?", [limit], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    }),
    
    getGroupCount: () => new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) as count FROM groups", (err, row) => {
            if (err) return reject(err);
            resolve(row.count);
        });
    }),
    
    getUserCount: () => new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
            if (err) return reject(err);
            resolve(row.count);
        });
    }),
    
    getChatPrefix: (groupID) => new Promise((resolve, reject) => {
        db.get("SELECT prefix FROM groups WHERE groupID = ?", [groupID], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.prefix : null); 
        });
    }),
    
    setChatPrefix: (groupID, prefix) => new Promise((resolve, reject) => {
        db.run("UPDATE groups SET prefix = ? WHERE groupID = ?", [prefix, groupID], function(err) {
            if (err) return reject(err);
            resolve({ changes: this.changes });
        });
    }),
};

function loadSettings() {
    return new Promise((resolve, reject) => {
        fs.readFile(path.join(__dirname, "settings.json"), "utf8", (err, data) => {
            if (err) {
                console.error("❌ Failed to load settings.json:", err);
                return reject(new Error("Failed to load settings.json"));
            }
            try {
                settings = JSON.parse(data);
                resolve();
            } catch (e) {
                console.error("❌ Failed to parse settings.json:", e);
                reject(new Error("Failed to parse settings.json"));
            }
        });
    });
}

function loadLanguage() {
    function loadLangFile(langCode) {
        const langPath = path.join(__dirname, "languages", `${langCode}.json`);
        if (fs.existsSync(langPath)) {
            return JSON.parse(fs.readFileSync(langPath, "utf8"));
        }
        return JSON.parse(fs.readFileSync(path.join(__dirname, "languages", `en.json`), "utf8"));
    }
    lang = loadLangFile(settings.language);
}

function loadCommands() {
    const cmdDir = path.join(__dirname, "src", "cmds");
    if (!fs.existsSync(cmdDir)) return console.warn("[Warning] Commands directory not found. Skipping.");
    
    const commandFiles = fs.readdirSync(cmdDir).filter((file) => file.endsWith(".js"));
    for (const file of commandFiles) {
        const command = require(path.join(cmdDir, file));
        commands.set(command.name, command);
    }
    console.log(`✅ Loaded ${commands.size} command(s).`);
}

function loadEvents() {
    const eventsDir = path.join(__dirname, "src", "events");
    if (!fs.existsSync(eventsDir)) return console.warn("[Warning] Events directory not found. Skipping.");
    
    const eventFiles = fs.readdirSync(eventsDir).filter((file) => file.endsWith(".js"));
    for (const file of eventFiles) {
        try {
            const eventModule = require(path.join(eventsDir, file));
            const eventConfig = eventModule.default || eventModule;
            
            if (eventConfig.eventType && typeof eventConfig.run === 'function') {
                if (!events.has(eventConfig.eventType)) {
                    events.set(eventConfig.eventType, []);
                }
                events.get(eventConfig.eventType).push(eventConfig);
            }
        } catch (e) {
            console.error(`[Error] Failed to load event file ${file}:`, e);
        }
    }
    console.log(`✅ Loaded ${Array.from(events.values()).flat().length} event handler(s).`);
}

function getText(key, replacements = {}) {
    let str = lang[key] || key;
    for (const [k, v] of Object.entries(replacements)) {
        str = str.replace(new RegExp(`{{${k}}}`, "g"), v);
    }
    return str;
}


function loginHandler(err, api) {
    if (err) return console.error("[Error] Facebook Login Failed:", err);
    
    console.log("Successfully logged into Facebook!");

    api.setOptions({
        online: settings.fcaOptions.online,
        updatePresence: settings.fcaOptions.updatePresence,
        selfListen: settings.fcaOptions.selfListen,
        randomUserAgent: false
    });
    
    startMonitor(api, settings); 

    (async () => {
        const admins = settings.adminIDs.map(id => {
            const user = dbHelpers.getUser(id);
            return user ? `${user.name} (${id})` : id;
        });
        
        console.log(`\nBot Name: ${settings.botName}`);
        console.log(`Prefix: ${settings.prefix.join(", ")}`);
        console.log(`Admins: ${admins.join(", ")}`);
        console.log("The bot has started listening for events...")
        console.log(`Bot ID: ${api.getCurrentUserID()}`);
    })();

    process.on("SIGINT", async () => {
        for (const callback of onBootCallbacks) {
            try {
                await callback("shutdown")
            } catch (e) {
                console.error("[onBoot] Error:", e)
            }
        }
        process.exit(0)
    })

    process.on("SIGTERM", async () => {
        for (const callback of onBootCallbacks) {
            try {
                await callback("shutdown")
            } catch (e) {
                console.error("[onBoot] Error:", e)
            }
        }
        process.exit(0)
    })

    api.listenMqtt(async (err, event) => {
        if (err) return console.error("[Error] Failed to listen for events:", err);

        await handleEvent(api, event, events, dbHelpers, settings, getText);
        
        if (event.type === "message" || event.type === "message_reply") {
             await handleCommand(
                api, 
                event, 
                commands, 
                dbHelpers, 
                settings, 
                getText, 
                onReplyMap, 
                onChatMap, 
                onBootCallbacks
            );
        }
    });
}

async function initializeBot() {
    console.log("Starting bot, please wait...")
    if (!fs.existsSync(path.join(__dirname, 'utils'))) {
        fs.mkdirSync(path.join(__dirname, 'utils'));
    }
    
    await setupDatabase();
    await loadSettings(); 
    loadLanguage();
    loadCommands(); 
    loadEvents();   

    figlet("Titan Bot", (err, data) => {
        if (err) {
            console.error("Error generating banner:", err);
        }
        else {
            console.log(gradient.rainbow(chalk.bold(data))); 
            console.log(chalk.bold.italic.cyan('A cool facinating bot made for managing of accounts and group with commands.'))
        }
        
    });

    try {
        const credsData = await new Promise((resolve, reject) => {
            fs.readFile("appstate.json", "utf8", (err, data) => {
                if (err) return reject(err);
                resolve(data);
            });
        });

        const creds = {
            appState: JSON.parse(credsData),
        };
        login(creds, settings.fcaOptions, loginHandler); 
        
        startUpdater();

    } catch (e) {
        console.error("❌ Failed to load appstate.json or during login. Ensure appstate.json exists and is valid. Error:", e);
        process.exit(1);
    }
}

initializeBot();
