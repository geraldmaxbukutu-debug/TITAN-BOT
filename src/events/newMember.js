module.exports = {
    eventType: "message_event", 
    name: "newMemberGreeting",
    description: "Greets new members when they join a group chat.",

    async run(api, event, dbHelpers, settings, getText) {
        // Check specifically for a user added event
        if (event.logMessageType !== "log:subscribe") return;

        // Check if the bot itself was added (to avoid sending a welcome to the bot)
        if (event.logMessageData.addedParticipants.some(p => p.userFbId === api.getCurrentUserID())) {
            // Bot was added. Maybe send a "Hi, I'm the bot" message if you want.
            // For now, we'll just log it and return.
            console.log(`[EVENT] Bot was added to thread: ${event.threadID}`);
            return;
        }

        const addedUserID = event.logMessageData.addedParticipants[0].userFbId;
        const threadID = event.threadID;

        try {
            // 1. Ensure the user exists in the database
            let user = await dbHelpers.getUser(addedUserID);

            if (!user) {
                // If user doesn't exist, create a new record. 
                // Note: We don't have their name here, so we'll use a placeholder.
                // It's better to get the name from API if possible, but for simplicity:
                user = await dbHelpers.createUser({ 
                    userID: addedUserID, 
                    name: `User ${addedUserID}`, // Placeholder
                    coins: settings.defaultCoins || 0 
                });
            }

            // 2. Send the greeting message
            // Using getText for translatable messages
            const welcomeMessage = getText("NEW_MEMBER_GREETING", {
                userName: user.name,
                botName: settings.botName,
                prefix: settings.prefix[0] // Use the first prefix for instructions
            });

            api.sendMessage(welcomeMessage, threadID);
            console.log(`[GREETING] Sent welcome message to ${user.name} in ${threadID}`);

        } catch (e) {
            console.error(`[Error] Failed to handle new member event for ID ${addedUserID}:`, e);
        }
    }
};


