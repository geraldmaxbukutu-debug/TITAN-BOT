
function parseArgs(messageBody, prefix) {
  const bodyWithoutPrefix = messageBody.slice(prefix.length).trim();
  const parts = bodyWithoutPrefix.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g) || [];
  
  if (parts.length === 0) return { commandName: "", args: [] };
  
  const commandName = parts.shift().toLowerCase();
                              
  const argsArray = parts.map(part => 
    part.replace(/^"|"$/g, '') 
        .replace(/^'|'$/g, '')  
  ); 

  argsArray.get = function(index) {
    const idx = parseInt(index, 10);
    return this[idx] !== undefined ? this[idx] : null;
  };
  return { commandName, args: argsArray };
}

async function handleCommand(api, event, commands, dbHelpers, settings, getText, onReplyMap, onChatMap, onBootCallbacks) {
  if (event.type !== "message" || !event.body) return;
  const messageBody = event.body;

  if (onReplyMap.has(event.threadID)) {
    const onReply = onReplyMap.get(event.threadID);
    
    if (onReply.type === "continue") {
      const args = messageBody.trim().split(/ +/g);
      const onReplyFunc = onReply.callback;
      onReplyMap.delete(event.threadID); 
      try {
        await onReplyFunc(api, event, args, dbHelpers, settings, getText);
      } catch (e) {
        api.sendMessage(getText("replyError") || "Error processing reply.", event.threadID);
        console.error("[Reply] Error:", e);
      }
      return;
    }
  }

  const prefixes = Array.isArray(settings.prefix) ? settings.prefix : [settings.prefix];
  
  const matchedPrefix = prefixes.find(p => messageBody.startsWith(p));
  
  if (!matchedPrefix) {
    for (const [name, command] of commands) {
      if (command.executeWithoutPrefix && typeof command.execute === "function") {
        try {
          const onReply = (onReplyData) => onReplyMap.set(event.threadID, onReplyData);
          const onChat = (onChatData) => onChatMap.set(event.threadID, onChatData);
          const onBoot = (callback) => onBootCallbacks.push(callback);
          await command.execute(api, event, [], dbHelpers, settings, getText, onChat, onReply, onBoot);
        } catch (e) {
          console.error(`[Prefixless Command] Error running ${name}:`, e);
        }
      }
    }
    return;
  }
  
  const { commandName, args } = parseArgs(messageBody, matchedPrefix);
  const command = commands.get(commandName);
  
  if (!command) {
    return api.sendMessage(getText("commandNotFound", { cmd: commandName }) || `Command '${commandName}' not found.`, event.threadID);
  }

  let role = 0; 
  
  if (settings.ownerID === event.senderID) {
    role = 3;
  } 
  else if (settings.adminIDs.includes(event.senderID)) {
    role = 2;
  }
  else if (event.threadInfo && event.threadInfo.adminIDs && event.threadInfo.adminIDs.some(admin => admin.id === event.senderID)) {
      role = 1;
  }
  
  if (command.role > role) {
    return api.sendMessage(getText("notAdmin") || "You do not have the required permissions to use this command.", event.threadID);
  }

  try {
    const onReply = (onReplyData) => onReplyMap.set(event.threadID, onReplyData);
    const onChat = (onChatData) => onChatMap.set(event.threadID, onChatData);
    const onBoot = (callback) => onBootCallbacks.push(callback);
    
    await command.execute(api, event, args, dbHelpers, settings, getText, onChat, onReply, onBoot);
  } catch (e) {
    api.sendMessage(getText("commandExecutionError", { cmd: commandName }) || `Error executing command '${commandName}'.`, event.threadID);
    console.error(`[Command] Error running ${commandName} in ${event.threadID}:`, e);
  }
}

module.exports = { handleCommand };