

module.exports = {
    eventType: "message", 
    name: "botMentionResponse",
    description: "Responds when the bot is mentioned by name or ID.",

    async run(api, event, dbHelpers, settings, getText) {
        const botID = api.getCurrentUserID();
        const threadID = event.threadID;
        const messageBody = event.body;
        
        const mentioned = event.mentions && event.mentions[botID];
        const isMention = mentioned || (messageBody && messageBody.includes(botID));

        if (!isMention) return;
        
        const prefixes = Array.isArray(settings.prefix) ? settings.prefix : [settings.prefix];
        const isCommand = prefixes.some(p => messageBody.startsWith(p));
        
        if (isCommand) return;
        
        const responseMessage = getText("BOT_MENTION_RESPONSE", {
            prefix: prefixes[0],
            botName: settings.botName
        });
        
        api.sendMessage(responseMessage, threadID, event.messageID);
        console.log(`[MENTION] Responded to mention in ${threadID}.`);

    }
};
