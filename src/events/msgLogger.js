module.exports = {
    eventType: "message", 
    name: "logMessage",
    description: "Logs the sender and content of every message for monitoring.",

    async run(api, event, dbHelpers, settings, getText) {
        if (event.type !== "message" && event.type !== "message_reply") return;
        
        const sender = await dbHelpers.getUser(event.senderID);
        const senderName = sender ? sender.name : event.senderID;
        
        console.log(`[MESSAGE] ${event.threadID} | ${senderName}: ${event.body}`);
        
        try {
            await dbHelpers.addToHistory({
                type: event.type,
                senderID: event.senderID,
                threadID: event.threadID,
                content: event.body || (event.attachments.length > 0 ? "Attachments" : "Empty message")
            });
        } catch (e) {
            console.error("[DB Error] Failed to add message to history:", e);
        }
    }
};


