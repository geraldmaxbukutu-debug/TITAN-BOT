module.exports = {
    eventType: "message_event", 
    name: "leaveMemberNotice",
    description: "Sends a farewell message when a member leaves or is removed.",

    async run(api, event, dbHelpers, settings, getText) {
        if (event.logMessageType !== "log:unsubscribe") return;

        const leftUserID = event.logMessageData.leftParticipantFbId;
        const threadID = event.threadID;
        const removerID = event.author;
        
        if (leftUserID === api.getCurrentUserID()) {
            console.log(`[EVENT] Bot was removed from thread: ${threadID}`);
            return;
        }

        try {
            const leftUser = await dbHelpers.getUser(leftUserID);
            const leftUserName = leftUser ? leftUser.name : leftUserID;
            
            let farewellMessage;
            
            if (leftUserID === removerID) {
                farewellMessage = getText("MEMBER_LEFT_VOLUNTARY", {
                    userName: leftUserName
                });
            } else {
                const removerUser = await dbHelpers.getUser(removerID);
                const removerName = removerUser ? removerUser.name : removerID;
                
                farewellMessage = getText("MEMBER_WAS_REMOVED", {
                    removedUserName: leftUserName,
                    removerName: removerName
                });
            }
            
            api.sendMessage(farewellMessage, threadID);
            console.log(`[FAREWELL] Sent farewell message for ${leftUserName} in ${threadID}`);

        } catch (e) {
            console.error(`[Error] Failed to handle leave member event for ID ${leftUserID}:`, e);
        }
    }
};


