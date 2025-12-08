const fs = require("fs");
const path = require("path");
const gradient = require('gradient-string');
const chalk = require('chalk');
const { login } = require("ws3-fca");
const sqlite3 = require("sqlite3").verbose();
const figlet = require("figlet");
const os = require('os');

// --- UTILITY ---
const { startUpdater } = require("./updater");
const { handleCommand } = require("./utils/cmdHandler");
const { handleEvent } = require("./utils/eventsHandler");
// REMOVED: Monitor import unlinked as requested
// ----------------

// --- 1. Global State and Initialization ---
const commands = new Map();
const events = new Map();
const db = new sqlite3.Database(path.join(__dirname, "bot.db"));
const settings = require("./settings.json");
let lang = {};

const onReplyMap = new Map();
const onChatMap = new Map();
const onBootCallbacks = [];

// === 2. SQLite Database Setup ===
async function setupDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Users Table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                userID TEXT PRIMARY KEY,
                name TEXT,
                coins INTEGER DEFAULT 0,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                prefix TEXT,
                data TEXT
            )`);

            // Groups Table
            db.run(`CREATE TABLE IF NOT EXISTS groups (
                groupID TEXT PRIMARY KEY,
                name TEXT,
                joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                admins TEXT,
                prefix TEXT,
                data TEXT
            )`);

            // History Table
            db.run(`CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                senderID TEXT,
                threadID TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                content TEXT
            )`, (err) => {
                if (err) return reject(new Error("Failed to initialize database: " + err.message));
                console.log(chalk.green("✔ SQLite database initialized successfully."));
                resolve();
            });
        });
    });
}

// === 3. Database Helper Functions ===
const dbHelpers = {
    _processRow: (row) => {
        if (!row) return null;
        try {
            row.data = JSON.parse(row.data || "{}");
            if (row.admins) row.admins = JSON.parse(row.admins);
        } catch (e) {
            row.data = {};
            row.admins = [];
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
        // Double check existence to prevent unique constraint errors
        try {
            const existing = await dbHelpers.getUser(userData.userID);
            if (existing) return existing;
        } catch (e) { /* ignore error, proceed to create */ }

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

    updateUser: async (userID, updateData) => {
        // ENHANCED: Logic split for better async handling
        const user = await dbHelpers.getUser(userID);
        if (!user) throw new Error(`User ${userID} not found.`);

        const updates = [];
        const values = [];
        let dataToStore = user.data || {};

        if (updateData.data) {
            // Merge existing data with new data
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

        return new Promise((resolve, reject) => {
            db.run(`UPDATE users SET ${updates.join(", ")} WHERE userID = ?`, values, function(err) {
                if (err) return reject(err);
                resolve({ changes: this.changes });
            });
        });
    },

    getGroup: (groupID) => new Promise((resolve, reject) => {
        db.get("SELECT * FROM groups WHERE groupID = ?", [groupID], (err, row) => {
            if (err) return reject(err);
            resolve(dbHelpers._processRow(row));
        });
    }),

    createGroup: async (groupData) => {
        try {
            const existing = await dbHelpers.getGroup(groupData.groupID);
            if (existing) return existing;
        } catch (e) { /* ignore */ }

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

    updateGroup: async (groupID, updateData) => {
        const group = await dbHelpers.getGroup(groupID);
        if (!group) throw new Error(`Group ${groupID} not found.`);

        const updates = [];
        const values = [];
        let dataToStore = group.data || {};

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

        return new Promise((resolve, reject) => {
            db.run(`UPDATE groups SET ${updates.join(", ")} WHERE groupID = ?`, values, function(err) {
                if (err) return reject(err);
                resolve({ changes: this.changes });
            });
        });
    },

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

// === 4. Loaders ===
function loadSettings() {
    return new Promise((resolve, reject) => {
        const settingsPath = path.join(__dirname, "settings.json");
        if (!fs.existsSync(settingsPath)) {
            console.warn(chalk.yellow("⚠ settings.json not found, using defaults."));
            return resolve(); // Resolve with defaults
        }

        fs.readFile(settingsPath, "utf8", (err, data) => {
            if (err) return reject(new Error("Failed to load settings.json"));
            try {
                const loaded = JSON.parse(data);
                settings = { ...settings, ...loaded }; // Merge with defaults
                resolve();
            } catch (e) {
                reject(new Error("Failed to parse settings.json"));
            }
        });
    });
}

function loadLanguage() {
    const langCode = settings.language || "en";
    const langPath = path.join(__dirname, "languages", `${langCode}.json`);
    const defaultPath = path.join(__dirname, "languages", "en.json");

    if (fs.existsSync(langPath)) {
        lang = JSON.parse(fs.readFileSync(langPath, "utf8"));
    } else if (fs.existsSync(defaultPath)) {
        console.warn(chalk.yellow(`⚠ Language '${langCode}' not found. Falling back to English.`));
        lang = JSON.parse(fs.readFileSync(defaultPath, "utf8"));
    } else {
        lang = {}; // Fallback empty
    }
}

function loadCommands() {
    const cmdDir = path.join(__dirname, "src", "cmds");
    if (!fs.existsSync(cmdDir)) return console.warn(chalk.yellow("[Warning] Commands directory not found."));

    const commandFiles = fs.readdirSync(cmdDir).filter((file) => file.endsWith(".js"));
    let count = 0;
    for (const file of commandFiles) {
        try {
            // Delete cache for hot reloading potential
            const fullPath = path.join(cmdDir, file);
            delete require.cache[require.resolve(fullPath)];
            
            const command = require(fullPath);
            if (command.name) {
                commands.set(command.name, command);
                count++;
            }
        } catch (e) {
            console.error(chalk.red(`[Error] Failed to load command ${file}:`), e.message);
        }
    }
    console.log(chalk.green(`✔ Loaded ${count} command(s).`));
}

function loadEvents() {
    const eventsDir = path.join(__dirname, "src", "events");
    if (!fs.existsSync(eventsDir)) return console.warn(chalk.yellow("[Warning] Events directory not found."));

    const eventFiles = fs.readdirSync(eventsDir).filter((file) => file.endsWith(".js"));
    let count = 0;
    for (const file of eventFiles) {
        try {
            const eventModule = require(path.join(eventsDir, file));
            const eventConfig = eventModule.default || eventModule;

            if (eventConfig.eventType && typeof eventConfig.run === 'function') {
                if (!events.has(eventConfig.eventType)) {
                    events.set(eventConfig.eventType, []);
                }
                events.get(eventConfig.eventType).push(eventConfig);
                count++;
            }
        } catch (e) {
            console.error(chalk.red(`[Error] Failed to load event ${file}:`), e.message);
        }
    }
    console.log(chalk.green(`✔ Loaded ${count} event handler(s).`));
}

function getText(key, replacements = {}) {
    let str = lang[key] || key;
    for (const [k, v] of Object.entries(replacements)) {
        str = str.replace(new RegExp(`{{${k}}}`, "g"), v);
    }
    return str;
}

// === 5. Main Login Handler ===
function loginHandler(err, api) {
    if (err) return console.error(chalk.red("[Error] Facebook Login Failed:"), err);

    console.log(chalk.green("✔ Successfully logged into Facebook!"));

    // Set Options safely
    api.setOptions({
        forceLogin: true,
        listenEvents: true,
        logLevel: "silent",
        selfListen: settings.fcaOptions?.selfListen || false,
        updatePresence: true,
        online: true,
        autoMarkDelivery: false, // Recommended to prevent ban
        userAgent: settings.fcaOptions?.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    });

    // ENHANCEMENT: Auto-Save AppState every 15 minutes to prevent session loss
    setInterval(() => {
        try {
            const appState = api.getAppState();
            fs.writeFileSync(path.join(__dirname, "appstate.json"), JSON.stringify(appState, null, 2));
            // console.log(chalk.gray("Auto-saved AppState.")); // Optional log
        } catch (e) {
            console.error("Failed to auto-save appstate:", e);
        }
    }, 15 * 60 * 1000);

    // Initial Bot Info Log
    (async () => {
        const admins = settings.adminIDs.map(id => id); // simplified for speed
        
        console.log(gradient.pastel(`\nBot Name: ${settings.botName}`));
        console.log(chalk.blue(`Prefix: ${settings.prefix.join(", ")}`));
        console.log(chalk.blue(`Admins: ${admins.length}`));
        console.log(chalk.cyan("The bot has started listening for events..."));
        console.log(chalk.gray(`Bot ID: ${api.getCurrentUserID()}`));
    })();

    // Graceful Shutdown
    const cleanShutdown = async (signal) => {
        console.log(chalk.yellow(`\nReceived ${signal}. Shutting down...`));
        for (const callback of onBootCallbacks) {
            try {
                await callback("shutdown");
            } catch (e) {
                console.error("[onBoot] Error:", e);
            }
        }
        process.exit(0);
    };

    process.on("SIGINT", () => cleanShutdown("SIGINT"));
    process.on("SIGTERM", () => cleanShutdown("SIGTERM"));

    // Main Listener
    api.listenMqtt(async (err, event) => {
        if (err) return console.error(chalk.red("[Error] Listener:"), err);

        // Handle generic events
        await handleEvent(api, event, events, dbHelpers, settings, getText);

        // Handle Commands
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

// === 6. Initialization ===
async function initializeBot() {
    console.clear();
    console.log(chalk.yellow("Starting bot, please wait..."));
    
    // Ensure directories exist
    if (!fs.existsSync(path.join(__dirname, 'utils'))) fs.mkdirSync(path.join(__dirname, 'utils'));
    if (!fs.existsSync(path.join(__dirname, 'src'))) fs.mkdirSync(path.join(__dirname, 'src'));
    
    // Load Core
    await setupDatabase();
    await loadSettings();
    loadLanguage();
    loadCommands();
    loadEvents();

    figlet("Titan Bot", (err, data) => {
        if (err) return;
        console.log(gradient.rainbow(data));
        console.log(chalk.bold.italic.cyan('A powerful bot for account and group management.'));
    });

    // Login Process
    try {
        const appStatePath = path.join(__dirname, "appstate.json");
        
        if (!fs.existsSync(appStatePath)) {
            console.error(chalk.red("❌ appstate.json not found! Please place your appstate file in the root directory."));
            process.exit(1);
        }

        const credsData = await fs.promises.readFile(appStatePath, "utf8");
        const creds = { appState: JSON.parse(credsData) };

        // Start Login
        login(creds, settings.fcaOptions || {}, loginHandler);
        
        // Start Auto-Updater
        startUpdater();

    } catch (e) {
        console.error(chalk.red("❌ Fatal Error during initialization:"), e.message);
        console.log(chalk.gray("Tip: Check if appstate.json is valid JSON."));
        process.exit(1);
    }
}

initializeBot();
