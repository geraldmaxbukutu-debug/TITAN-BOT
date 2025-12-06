const fs = require("fs");
const path = require("path");

module.exports = {
  name: "admin",
  description: "Manage bot admins (Owner-only).",
  role: 3, // Requires Role 3 (Bot Owner)
  category: "owner",
  cooldown: 5,
  execute: async (api, event, args, dbHelpers, settings, getText) => {
    const threadID = event.threadID;
    // NOTE: This path assumes the command file is in 'src/cmds' and settings.json is in the root.
    const configPath = path.join(__dirname, '../../settings.json'); 
    const mentions = event.mentions;

    // Use the first argument as the action and convert it to lowercase
    const action = args[0] ? args[0].toLowerCase() : null;
    
    // Usage help message
    if (!action || !['add', '-a', 'remove', '-r', 'list', '-l'].includes(action)) {
      const usage = getText("ADMIN_COMMAND_USAGE", { prefix: settings.prefix[0] || '!' });
      return api.sendMessage(usage, threadID);
    }
    
    // --- Helper function to save settings ---
    const saveSettings = () => {
        try {
            fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
            // Success log is optional but helpful
            console.log(`[Admin Command] settings.json updated.`); 
            return true;
        } catch (error) {
            console.error(`[Admin Command] Failed to write to settings.json:`, error);
            api.sendMessage("❌ Error: Failed to save settings file. Check bot logs.", threadID);
            return false;
        }
    };
    
    // --- Main Logic ---
    switch (action) {
      case 'add':
      case '-a': { // Use block scope for case to define variables safely
        const inputArgs = args.slice(1);
        let newAdmins = [];
        
        // Collect potential new admin IDs from mentions
        for (const mentionID in mentions) {
          inputArgs.push(mentionID); // Add mentioned IDs to the processing list
        }

        // Process all IDs (mentions and explicit arguments)
        for (const id of new Set(inputArgs)) { // Use Set to process unique IDs
          // Simple validation (Facebook IDs are typically numeric strings)
          if (settings.adminIDs.includes(id) || id === settings.ownerID) {
              // Skip if already admin or is the owner (owner is implicitly max-role)
              continue; 
          }
          
          // Add the new admin
          newAdmins.push(id);
          settings.adminIDs.push(id);
        }

        if (newAdmins.length === 0) {
            return api.sendMessage('No new admins were added. (IDs already exist, or input was invalid).', threadID);
        }
        
        if (saveSettings()) {
            // NOTE: Use dbHelpers to fetch names for a user-friendly list
            let namePromises = newAdmins.map(id => dbHelpers.getUser(id).then(user => user ? user.name : id));
            let newAdminNames = await Promise.all(namePromises);

            api.sendMessage(`✅ Successfully added ${newAdmins.length} new admin(s):\n${newAdminNames.join(', ')}`, threadID);
        }
        break;
      }
        
      case 'remove':
      case '-r': {
        const targetID = mentions[args[1]] || args[1]; // Prioritize mention if available
        if (!targetID) {
            return api.sendMessage('Please provide the User ID or mention of the admin to remove.', threadID);
        }
        
        // Ensure we are not trying to remove the owner ID
        if (targetID === settings.ownerID) {
            return api.sendMessage("❌ Cannot remove the Bot Owner.", threadID);
        }
        
        // Ensure the target is actually in the admin list
        if (!settings.adminIDs.includes(targetID)) {
            return api.sendMessage('User is not currently listed as a global admin.', threadID);
        }
        
        // Remove the ID
        settings.adminIDs = settings.adminIDs.filter(id => id !== targetID);
        
        if (saveSettings()) {
            api.sendMessage(`✅ Removed **${targetID}** from the global admin list.`, threadID);
        }
        break;
      }
        
      case 'list':
      case '-l': {
        const allAdmins = settings.adminIDs.filter(id => id !== settings.ownerID); // Filter out owner
        
        if (allAdmins.length === 0) {
            return api.sendMessage(`Bot Owner ID: ${settings.ownerID}\n\nNo other global admins set.`, threadID);
        }

        // Fetch names for all admins and the owner (for a complete list)
        const allIDs = [settings.ownerID, ...allAdmins];
        const namePromises = allIDs.map(id => 
             dbHelpers.getUser(id).then(user => user ? user.name : id)
        );
        const names = await Promise.all(namePromises);
        
        let adminListMessage = `\n👑 Bot Owner:\n└── ${names[0]} (${settings.ownerID})\n\n`;
        adminListMessage += `👤 Global Admin(s) (${allAdmins.length}):\n`;
        
        allAdmins.forEach((adminID, index) => {
            const adminName = names[index + 1]; // +1 to skip the owner's name
            adminListMessage += `└── ${index + 1}. ${adminName} (${adminID})\n`;
        });
        
        api.sendMessage(adminListMessage, threadID);
        break;
      }
        
      default:
        // This case should be caught by the initial check, but included for completeness.
        api.sendMessage('Invalid action. Use add, remove, or list.', threadID);
    }
  },
};
