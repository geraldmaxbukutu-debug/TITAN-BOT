const axios = require('axios');
const fs = require("fs-extra"); // Use fs-extra for robust file/directory handling
const path = require("path");
const yts = require('yt-search');
// const { bold } = require("fontstyles"); // Removed: Not a standard Node module

// Define the cache folder outside of execute and use fs-extra to ensure existence
const cacheFolder = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheFolder)) {
  fs.ensureDirSync(cacheFolder); // Use fs-extra's ensureDirSync for reliability
}

module.exports = {
  name: "song",
  description: "Search and download audio from YouTube",
  aliases: ['ytplay', 'ytsearch', 'music'],
  role: 0,
  category: "media",
  cooldown: 5,
  execute: async (api, event, args, dbHelpers, settings, getText) => {
    const threadID = event.threadID;
    let processingMsg = null;
    let audioFilePath = null; // Initialize file path for cleanup

    try {
      if (!args[0]) {
        const usage = getText("SONG_USAGE", { prefix: settings.prefix[0] || '!' }) || 
          '╭────❒ ❌ Error ❒\n' +
          '├⬡ Please provide a song name or YouTube URL\n' +
          '├⬡ Usage: ' + (settings.prefix[0] || '!') + 'song [song name/YouTube URL]\n' +
          '╰────────────❒';
        return api.sendMessage(usage, threadID);
      }
      
      // Send initial processing message
      processingMsg = await api.sendMessage(
        '╭────❒ ⏳ Processing ❒\n' +
        '├⬡ Searching and downloading your song...\n' +
        '├⬡ Please wait a moment\n' +
        '╰────────────❒', threadID);

      const query = args.join(' ');
      let videoUrl;
      let videoInfo;
      
      // --- 1. Search Logic ---
      if (query.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)/)) {
        // Input is a URL
        videoUrl = query;
        // Use a more robust check for video ID extraction
        const urlParams = new URLSearchParams(new URL(query).search);
        const videoId = query.includes('youtu.be') ? query.split('/').pop().split('?')[0] : urlParams.get('v');
        
        if (!videoId) throw new Error("Invalid YouTube URL.");

        // yts doesn't have a direct videoId search; perform a general search and filter/use helper if necessary.
        // For simplicity and to use the provided yts method, we search by ID (if yts supports it internally)
        const videoSearch = await yts({ videoId: videoId });
        videoInfo = videoSearch.videos ? videoSearch.videos[0] : videoSearch; // yts returns different structures
        if (!videoInfo) throw new Error("Could not retrieve video information from URL.");
      } else {
        // Input is a search query
        const searchResults = await yts(query);
        if (!searchResults.videos || searchResults.videos.length === 0) {
          api.unsendMessage(processingMsg.messageID); // Delete processing message
          return api.sendMessage(
            '╭────❒ ❌ Not Found ❒\n' +
            '├⬡ No songs found for your query\n' +
            '├⬡ Try a different search term\n' +
            '╰────────────❒', threadID);
        }
        videoInfo = searchResults.videos[0];
        videoUrl = videoInfo.url;
      }

      // --- 2. External API Download Link ---
      const apiResponse = await axios.get(`https://kaiz-apis.gleeze.com/api/ytdown-mp3?url=${encodeURIComponent(videoUrl)}`);
      if (!apiResponse.data || !apiResponse.data.download_url) {
        throw new Error('API failed to provide a valid download URL.');
      }

      const downloadUrl = apiResponse.data.download_url;
      const title = apiResponse.data.title || videoInfo.title;
      // Use the yts timestamp if the API doesn't provide duration
      const duration = apiResponse.data.duration || videoInfo.timestamp || "Unknown"; 
      
      // Create safe, unique file path
      const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 50); // Limit length
      audioFilePath = path.join(cacheFolder, `${safeTitle}_${Date.now()}.mp3`);

      // --- 3. Stream and Save Audio ---
      const audioResponse = await axios.get(downloadUrl, { responseType: 'stream' });
      const writer = fs.createWriteStream(audioFilePath);
      audioResponse.data.pipe(writer);

      // Wrap stream events in a Promise to wait for the file to finish writing
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
        audioResponse.data.on('error', reject); // Catch download errors
      });
      
      // --- 4. Send Message and Clean Up ---
      await api.sendMessage({
        attachment: fs.createReadStream(audioFilePath),
        body: `✅ **Playing:** ${title} (${duration})`
      }, threadID);
      
      // Delete processing message
      api.unsendMessage(processingMsg.messageID);

    } catch (err) {
      console.error('[Song CMD] Error:', err);
      
      // Delete processing message if it exists
      if (processingMsg && processingMsg.messageID) {
          api.unsendMessage(processingMsg.messageID);
      }
      
      // Send a generic error message
      api.sendMessage(
        '╭────❒ ❌ Error ❒\n' +
        `├⬡ Failed to process the request. Details: ${err.message || 'Unknown error'}\n` +
        '├⬡ Please try again later.\n' +
        '╰────────────❒', threadID);

    } finally {
        // Ensure the temporary audio file is deleted after the command finishes
        if (audioFilePath) {
            await fs.remove(audioFilePath).catch(e => console.error("Failed to clean up audio file:", e));
        }
    }
  },
};
