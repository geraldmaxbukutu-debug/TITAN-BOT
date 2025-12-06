module.exports = {
  name: "prefix",
  description: "View or set the command prefix for the current chat.",
  role: 0, // Everyone can view the prefix
  category: "utility",
  execute: async (api, event, args, dbHelpers, settings, getText) => {
    const threadID = event.threadID;
    const isGroup = event.isGroup;
    const systemPrefix = Array.isArray(settings.prefix) ? settings.prefix[0] : settings.prefix || '!';

    // Helper to get the current chat prefix (system default or custom group prefix)
    const getCurrentPrefix = async () => {
        if (isGroup) {
            // dbHelpers.getChatPrefix is defined in the main file's dbHelpers
            return (await dbHelpers.getChatPrefix(threadID)) || systemPrefix;
        }
        // Private chats use the system prefix
        return systemPrefix;
    };
    
    // --- 1. View Current Prefix (No arguments provided or invalid action) ---
    if (args.length === 0) {
      const currentPrefix = await getCurrentPrefix();
      
      let message = getText("CURRENT_PREFIX_INFO", {
          systemPrefix: systemPrefix,
          chatPrefix: currentPrefix
      });
      
      return api.sendMessage(message, threadID);
    }
    
    // --- 2. Set New Prefix (Argument provided) ---
    
    // Determine user's role for permission check
    let userRole = 0;
    if (settings.ownerID === event.senderID) userRole = 3;
    else if (settings.adminIDs.includes(event.senderID)) userRole = 2;
    // NOTE: This logic assumes threadInfo is available from the main handleCommand logic 
    // to check for group admin (role 1) for group-specific prefixes.
    // We will check for Bot Admin (role 2) or Bot Owner (role 3) for simplicity, 
    // or you can add group admin check here if you can reliably get thread admins.
    
    const newPrefix = args[0];
    
    if (isGroup) {
        // Only allow Bot Admins (Role 2) and Owner (Role 3) to set group prefix
        if (userRole < 2) {
             return api.sendMessage(getText("NOT_ADMIN_TO_SET_PREFIX") || "You must be a Bot Admin or Owner to change the group prefix.", threadID);
        }
        
        // Use the correct dbHelpers function: setChatPrefix
        const result = await dbHelpers.setChatPrefix(threadID, newPrefix);
        
        if (result && result.changes > 0) {
            api.sendMessage(getText("GROUP_PREFIX_SET", { newPrefix: newPrefix }), threadID);
        } else {
            api.sendMessage(getText("GROUP_PREFIX_ERROR") || "Failed to set group prefix. The group may not exist in the database.", threadID);
        }
        
    } else {
        // Private chat (1:1) - Cannot set custom prefix, only view system prefix.
        api.sendMessage(getText("PRIVATE_CHAT_PREFIX_INFO", { systemPrefix: systemPrefix }), threadID);
    }
  },
};

// --- Suggested Language Keys for languages/en.json ---
/*
{
  "CURRENT_PREFIX_INFO": "The bot's system prefix is: `{{systemPrefix}}`.\n\nYour current chat prefix is: `{{chatPrefix}}`.\nUse `{{chatPrefix}}prefix [newPrefix]` to change it.",
  "GROUP_PREFIX_SET": "✅ Success! The group prefix has been set to: `{{newPrefix}}`.",
  "GROUP_PREFIX_ERROR": "❌ Error setting group prefix.",
  "PRIVATE_CHAT_PREFIX_INFO": "This is a private chat. The prefix is fixed at the system default: `{{systemPrefix}}`.",
  "NOT_ADMIN_TO_SET_PREFIX": "You must be a Bot Admin or Owner to change the group prefix."
}
*/
