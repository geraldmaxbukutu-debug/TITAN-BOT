const axios = require('axios');

// Helper function to shuffle an array (moved inside the module)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Simple HTML entity decoder for OpenTDB responses.
 * Replaces common HTML entities with their character equivalent.
 */
function decodeHTMLEntities(text) {
    if (!text) return '';
    return text.replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#039;/g, "'")
               .replace(/&rsquo;/g, "'");
}

module.exports = {
  name: "trivia",
  description: "Play a trivia game",
  role: 0,
  category: "media",
  cooldown: 5,

  // NOTE: Added onReply and onChat callbacks to the execute signature
  execute: async (api, event, args, dbHelpers, settings, getText, onChat, onReply) => {
    const threadID = event.threadID;
    const senderID = event.senderID;

    try {
      // 1. Fetch Question
      // Note: OpenTDB returns URL-encoded and HTML-encoded data.
      const response = await axios.get('https://opentdb.com/api.php?amount=1&encode=url3986');
      
      const questionData = response.data.results[0];
      
      // 2. Decode Data
      const question = decodeHTMLEntities(decodeURIComponent(questionData.question));
      const correctAnswer = decodeHTMLEntities(decodeURIComponent(questionData.correct_answer));
      const incorrectAnswers = questionData.incorrect_answers.map(ans => decodeHTMLEntities(decodeURIComponent(ans)));

      const options = [...incorrectAnswers, correctAnswer];
      const shuffledOptions = shuffleArray(options);

      // 3. Format Message
      let message = `🧠 **Trivia Time!**\n`;
      message += `Category: ${questionData.category}\n`;
      message += `Difficulty: ${questionData.difficulty}\n`;
      message += `\n**Question:** ${question}\n`;
      message += `\n**Options:**\n`;
      shuffledOptions.forEach((option, index) => {
        message += `${String.fromCharCode(65 + index)}. ${option}\n`;
      });
      message += '\nReply to this message with **A, B, C, or D** to answer.';

      // 4. Send Question
      const sentMessage = await api.sendMessage(message, threadID);

      // 5. Set onReply State (Using the standard bot mechanism)
      onReply({
        // The type 'continue' is often used to ensure the reply handler is executed
        type: 'continue', 
        
        // Pass essential data to the callback function
        correctAnswer: correctAnswer, 
        options: shuffledOptions,
        
        // Use the message ID of the bot's question to ensure the user is replying to it
        messageID: sentMessage.messageID, 
        
        // Define the reply callback function
        callback: async (api, event, args) => {
          const userReply = event.body.trim().toUpperCase();
          const state = event.onReply; // Data passed via onReply is available here
          
          if (!state) return api.sendMessage("❌ Error: Reply state missing.", threadID);
          
          const answerLetter = userReply.charAt(0);
          
          if (['A', 'B', 'C', 'D'].includes(answerLetter)) {
            const selectedIndex = answerLetter.charCodeAt(0) - 65;
            const selectedAnswer = state.options[selectedIndex];

            if (selectedAnswer === state.correctAnswer) {
              api.sendMessage(`✅ **CORRECT!** You selected ${selectedAnswer}.`, threadID);
            } else {
              api.sendMessage(`❌ **WRONG!** You selected ${selectedAnswer}. The correct answer was **${state.correctAnswer}** (Option ${answerLetter}).`, threadID);
            }
          } else {
            // If the user's reply is not a valid option letter, re-add the state and remind them.
            // NOTE: The main bot handler (cmdHandler) usually clears the state automatically, 
            // so this needs careful handling or requires the main bot to allow re-setting.
            // Assuming the main handler clears state, we just send an error.
            return api.sendMessage('❌ Invalid response. Please reply with only A, B, C, or D.', threadID);
          }
          
          // State is cleared by the main handler, no need for clearUserState.
        }
      });
      
    } catch (error) {
      console.error("[Trivia CMD] Error:", error.message);
      api.sendMessage('❌ Error fetching trivia or setting up the game.', threadID);
    }
  },
};
// Removed external helper functions as they are now integrated.
