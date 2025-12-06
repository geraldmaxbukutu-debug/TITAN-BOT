const axios = require('axios');
const fs = require('fs-extra'); // Using fs-extra for cleaner file handling (e.g., ensureDir)
const path = require('path');
const os = require('os'); // Used for temp file path

module.exports = {
  name: 'spy',
  description: 'Retrieves some public information about a tagged or replied-to user.',
  aliases: ['userinfo', 'profileinfo'],
  role: 0,
  category: 'info',
  cooldown: 5,
  execute: async (api, event, args, dbHelpers, settings, getText) => {
    const threadID = event.threadID;
    const senderID = event.senderID;

    let targetID;
    if (event.messageReply) {
      targetID = event.messageReply.senderID;
    } else if (event.mentions && Object.keys(event.mentions).length > 0) {
      targetID = Object.keys(event.mentions)[0];
    } else {
      targetID = senderID;
    }

    if (!targetID) {
      // Using getText for consistency
      const usage = getText("SPY_USAGE") || '╭────❒ 👤 Info ❒\n├⬡ Please tag or reply to a user to get their public information.\n╰────────────❒';
      return api.sendMessage({ body: usage }, threadID);
    }

    let processingMsg = null;
    let tempFilePath = null;

    try {
      processingMsg = await api.sendMessage({
        body: '╭────❒ ⏳ Fetching ❒\n├⬡ Retrieving public information...\n╰────────────❒',
        threadID
      });

      // 1. Fetch User Info from FCA
      const userInfo = await api.getUserInfo(targetID);
      const user = userInfo[targetID];
      
      const name = user.name || 'N/A';
      const profileUrl = user.profileUrl || null;
      
      // 2. Check Global Admin Status
      let adminStatus = 'No (User)';
      if (settings.ownerID === targetID) {
          adminStatus = 'Yes (Bot Owner 👑)';
      } else if (settings.adminIDs.includes(targetID)) {
          adminStatus = 'Yes (Global Admin 👤)';
      }

      // 3. Construct Message
      let message = `╭────❒ 👤 Public User Info 👤 ❒────\n` +
                    `├⬡ Name: ${name}\n` +
                    `├⬡ ID: ${targetID}\n` +
                    `├⬡ Bot Admin Status: ${adminStatus}\n`;

      if (profileUrl) {
        // Add the profile URL link
        message += `├⬡ Profile: ${profileUrl}\n`;
      }

      message += `╰────────────❒`;

      // 4. Fetch Profile Picture and Save to Temporary File
      if (profileUrl) {
          const picResponse = await axios.get(user.thumbSrc, { responseType: 'arraybuffer' });
          const profileBuffer = Buffer.from(picResponse.data, 'binary');
          
          // Create a unique temporary file path
          const fileName = `pfp-${targetID}-${Date.now()}.png`;
          // Use os.tmpdir() or a designated 'cache' directory
          tempFilePath = path.join(os.tmpdir(), fileName); 
          
          // Save buffer to file
          await fs.writeFile(tempFilePath, profileBuffer);
      }

      // 5. Send Message with Attachment
      const messageOptions = { body: message };
      if (tempFilePath) {
          messageOptions.attachment = fs.createReadStream(tempFilePath);
      }
      
      await api.sendMessage(messageOptions, threadID);
      
      // 6. Clean Up
      api.unsendMessage(processingMsg.messageID);

    } catch (error) {
      console.error('Error fetching user info:', error);
      
      if (processingMsg && processingMsg.messageID) {
          api.unsendMessage(processingMsg.messageID);
      }

      api.sendMessage({
        body: '╭────❒ ❌ Error ❒\n├⬡ Could not retrieve public information for this user. (Check logs for details).\n╰────────────❒',
        threadID
      });
      
    } finally {
        // Ensure the temporary file is deleted even if sending the message fails
        if (tempFilePath) {
            await fs.remove(tempFilePath).catch(e => console.error("Failed to clean up temp file:", e));
        }
    }
  }
};
