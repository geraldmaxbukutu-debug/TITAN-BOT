const axios = require('axios');

/**
 * Executes a translation request using Google Translate API (unofficial endpoint).
 * @param {string} text - The text to translate.
 * @param {string} targetLang - The target language code (e.g., 'es', 'fr').
 * @returns {Promise<string>} The translated text or an error message.
 */
const translate = async (text, targetLang = 'en') => {
  try {
    const apiUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await axios.get(apiUrl);
    
    // Check if the response data structure is valid
    if (response.data && response.data[0] && response.data[0][0]) {
      // The translated text is typically the first element of the first array in the response structure
      return response.data[0][0][0];
    } else {
      // If the API call succeeds but returns an unexpected structure
      return 'Translation failed: Invalid API response format.';
    }
  } catch (error) {
    console.error('Translation error:', error.message);
    // Return a user-friendly error
    return 'Translation service error: Could not reach the service.';
  }
};

module.exports = {
  name: 'translate',
  description: 'Translates replied text to the specified language (default: English).',
  aliases: ['trans'],
  role: 0,
  category: 'utility',
  cooldown: 5,
  execute: async (api, event, args, dbHelpers, settings, getText) => {
    const threadID = event.threadID;

    // Check for a replied message
    const quotedMessage = event.messageReply;
    if (!quotedMessage || !quotedMessage.body) {
      // Using getText for internationalization (assuming the key exists)
      const usageMessage = getText("TRANSLATE_USAGE", { prefix: settings.prefix[0] || '!' }) || 
        '╭────❒ 🌐 Translator\n' +
        '├⬡ Reply to a text message to translate it.\n' +
        '├⬡ Usage: !translate [language code (optional)]\n' +
        '├⬡ Example: !translate es (translates to Spanish)\n' +
        '├⬡ Default: Translates to English.\n' +
        '╰───────────────────';
      
      return api.sendMessage({ body: usageMessage }, threadID);
    }

    const textToTranslate = quotedMessage.body;
    // Use the first argument as target language, default to 'en'
    const targetLanguage = args[0] ? args[0].toLowerCase() : 'en';

    let processingMsg = null; // Initialize processingMsg outside the try block

    try {
      // 1. Send "Processing" Message
      processingMsg = await api.sendMessage({
        body: `╭────❒ 🌐 Translating\n` +
              `├⬡ Translating to: **${targetLanguage.toUpperCase()}**\n` +
              `├⬡ Please wait a moment...\n` +
              `╰───────────────────`,
        threadID
      });

      // 2. Perform Translation (using the function defined above)
      const translatedText = await translate(textToTranslate, targetLanguage);
      
      // 3. Delete "Processing" message
      if (processingMsg && processingMsg.messageID) {
         api.unsendMessage(processingMsg.messageID);
      }

      // 4. Send Result
      await api.sendMessage({
        body: `🌐 *Translation (${targetLanguage.toUpperCase()}):*\n\n${translatedText}`,
        threadID
      });
      
    } catch (error) {
      console.error('Translation command error:', error);
      
      // Attempt to delete processing message only if it was successfully sent
      if (processingMsg && processingMsg.messageID) {
         api.unsendMessage(processingMsg.messageID);
      }
      
      return api.sendMessage({
        body: '❌ Failed to translate the text due to an unexpected error.',
        threadID
      });
    }
  }
};
// The translate helper function is now correctly defined in the module's scope.
