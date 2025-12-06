const fs = require("fs");
const path = require("path");
const os = require('os');
// NOTE: 'fontstyles' is not a standard Node.js module; assuming its 'bold' functionality 
// is similar to common libraries or simply using Markdown ** for consistency.
// We will use Markdown ** and replace the import/variable. 
// const { bold } = require("fontstyles"); // REMOVED/REPLACED

// === UTILITY FUNCTIONS (Defined within the module scope) ===

/**
 * Formats seconds into Dd Hh Mm Ss format.
 * @param {number} seconds - Uptime in seconds.
 * @returns {string} Formatted uptime string.
 */
function formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds -= days * 24 * 60 * 60;
    const hours = Math.floor(seconds / (60 * 60));
    seconds -= hours * 60 * 60;
    const minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;
    seconds = Math.floor(seconds);
    
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Fetches user name via API or returns a fallback ID.
 * THIS FUNCTION MUST BE ASYNC AND RECEIVE THE API OBJECT.
 * @param {Object} api - The FCA API instance.
 * @param {string} userID - The ID of the user.
 * @returns {Promise<string>} The user's name or fallback ID.
 */
async function fetchUserName(api, userID) {
  try {
    // Attempt to get user info via FCA API
    const userInfo = await api.getUserInfo(userID);
    return (userInfo && userInfo[userID] && userInfo[userID].name) || userID;
  } catch (error) {
    // If API fails, return the ID
    return userID;
  }
}

// ==========================================================

module.exports = {
  name: "help",
  description: "Displays a list of available commands and details.",
  role: 0,
  category: "general",
  cooldown: 5,

  execute: async (api, event, args, dbHelpers, settings, getText) => {
    const threadID = event.threadID;
    const prefix = Array.isArray(settings.prefix) ? settings.prefix[0] : settings.prefix || '!';

    // 1. Command Loading Fix: Assume the command directory is one level up from the current file's parent.
    // e.g., if help.js is in /src/cmds/help.js, the directory is /src/cmds
    const CMD_DIR = path.join(__dirname); 
    
    let allCommands = new Map();
    try {
        const commandFiles = fs.readdirSync(CMD_DIR)
            .filter(file => file.endsWith('.js') && file !== path.basename(__filename));

        for (const file of commandFiles) {
            // Use path.resolve to ensure correct require path and avoid cache issues
            const commandPath = path.join(CMD_DIR, file);
            // Delete cache only if you expect live reloading, otherwise keep it simple
            // delete require.cache[commandPath]; 
            const cmd = require(commandPath);
            if (cmd && cmd.name) allCommands.set(cmd.name, cmd);
        }
    } catch (e) {
        console.error("[Help CMD] Fatal error loading command directory:", e);
        api.sendMessage("❌ Error loading commands for the help list. Check bot logs.", threadID);
        return;
    }
    // Ensure 'help' itself is included
    allCommands.set(module.exports.name, module.exports);


    // --- A. Detailed Help ---
    if (args.length > 0) {
        const commandName = args[0].toLowerCase();
        const command = allCommands.get(commandName);

        if (!command) {
            return api.sendMessage(getText("commandNotFound", { cmd: commandName }) || `Command '${commandName}' not found.`, threadID);
        }

        const detailMessage = `
╭─❍ **COMMAND: ${command.name.toUpperCase()}**
├ **Description**: ${command.description || "No description provided."}
├ **Usage**: ${command.usage ? command.usage.replace(/\{\{prefix\}\}/g, prefix) : `${prefix}${command.name} [args]`}
├ **Category**: ${command.category || "Uncategorized"}
├ **Required Role**: ${command.role === 3 ? "Owner" : command.role === 2 ? "Global Admin" : command.role === 1 ? "Group Admin" : "Everyone"}
┗─━━━━━━━━━━━━━━
        `.trim();
        return api.sendMessage(detailMessage, threadID);
    }
    
    // --- B. General Help List ---
    
    const categories = {};
    let totalCommands = 0;

    // 1. Determine User Role
    let userRole = 0;
    if (settings.ownerID === event.senderID) userRole = 3;
    else if (settings.adminIDs.includes(event.senderID)) userRole = 2;
    // NOTE: Group Admin check (role 1) is too complex to do reliably here without
    // fetching threadInfo, so we keep the role check simplified to 0, 2, 3.

    // 2. Populate Categories based on Role
    for (const [name, command] of allCommands) {
      const canShow = (command.role || 0) <= userRole; // Default role to 0 if undefined

      if (canShow) {
        const cat = (command.category || "Uncategorized").toUpperCase();
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(name);
        totalCommands++;
      }
    }
      
    // 3. Fetch Dynamic Data
    const uptime = formatUptime(process.uptime());
    const ramUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      
    // Use the integrated async function
    const senderName = await fetchUserName(api, event.senderID);
    const ownerName = await fetchUserName(api, settings.ownerID);  
    
    // 4. Construct Message
    let helpMessage = `╭─❍ Gerald Bot\n`;
    helpMessage += `\n├ Total Commands: ${totalCommands}`;
    helpMessage += `\n├⬡ 👤 User: @${senderName}`; // Tag sender
    helpMessage += `\n├⬡ 👑 Owner: @${ownerName}`; // Tag owner
    helpMessage += `\n├⬡ ⚙️ Version: 1.0.0 (new)`;
    helpMessage += `\n├⬡ ⏱️ Uptime: ${uptime}`;
    helpMessage += `\n├⬡ 🌐 Prefix: ${prefix}`;
    helpMessage += `\n├⬡ ⚡ Server: Active`;
    helpMessage += `\n├⬡ 🔋 RAM: ${ramUsage}MB`;
    helpMessage += `\n┗─━━━━━━━━━━\n\n`;
    
    // List Commands by Category
    for (const category in categories) {
      helpMessage += `┏─❍ **${category}** \n`;

      const commandsList = categories[category].sort(); // Sort commands alphabetically
      // Use the original grouping logic
      for (let i = 0; i < commandsList.length; i += 3) {
        const group = commandsList.slice(i, i + 3);
        helpMessage += `❒ ${group.map(cmd => `${prefix}${cmd}`).join(", ")}\n`;
      }
      helpMessage += "┗─━━━━━━━━━━\n";
    }
    
    helpMessage += `┏─━━━━━━━━━━\n¡│ Use ${prefix}help <command> for more info about a specific command.\n┗─━━━━━━━━━━\n\nThis bot host is powered by **${os.platform()}** with **${os.type()}**`;

    // 5. Send Message with Mentions
    api.sendMessage({
        body: helpMessage,
        mentions: [
        {
            tag: `@${senderName}`,
            id: event.senderID
        },
        {
            tag: `@${ownerName}`,
            id: settings.ownerID
        }
        ]
    }, threadID);
  },
};

// The utility functions are now defined outside module.exports but within the file, 
// and the execute function correctly calls the async fetchUserName.
