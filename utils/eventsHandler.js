
async function ensureDbRecords(event, dbHelpers) {
  if (event.senderID) {
    try {
      const user = await dbHelpers.getUser(event.senderID);
      
      let senderName = event.senderName || event.userName || ""; 

      if (!user) {
        const result = await dbHelpers.createUser({
          userID: event.senderID,
          name: senderName, 
          coins: 0, 
          data: {} 
        });
        if (!result) {
          console.error(`[DB Check] Failed to create user ${event.senderID}`);
        }
      } else if (user.name === "" && senderName !== "") {
          await dbHelpers.updateUser(event.senderID, { name: senderName });
      }
    } catch (e) {
      console.error(`[DB Check] Error ensuring user ${event.senderID} exists:`, e);
    }
  }

  if (event.threadID && event.threadID !== event.senderID) {
    try {
      const group = await dbHelpers.getGroup(event.threadID);
      
      const threadName = event.threadName || ""; 

      if (!group) {
        const result = await dbHelpers.createGroup({
          groupID: event.threadID,
          name: threadName,
          admins: [], 
          data: {} 
        });
        if (!result) {
          console.error(`[DB Check] Failed to create group ${event.threadID}`);
        }
      } else if (group.name === "" && threadName !== "") {
          await dbHelpers.updateGroup(event.threadID, { name: threadName });
      }
    } catch (e) {
      console.error(`[DB Check] Error ensuring group ${event.threadID} exists:`, e);
    }
  }
}

// --------------------

async function handleEvent(api, event, events, dbHelpers, settings, getText) {
  await ensureDbRecords(event, dbHelpers);

  if (events.has(event.type)) {
    const eventHandlers = events.get(event.type);
    for (const handler of eventHandlers) {
      if (handler.run && typeof handler.run === "function") {
        try {
          await handler.run(api, event, dbHelpers, settings, getText);
        } catch (e) {
          console.error(`[Event] Error executing handler '${handler.name}' for type ${event.type}:`, e);
        }
      }
    }
  }
}

module.exports = { handleEvent };