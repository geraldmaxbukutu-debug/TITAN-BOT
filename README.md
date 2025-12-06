🤖 Team Titan Botz - Facebook Messenger Bot
Team Titan Botz is a feature-rich, modular, and self-updating bot designed to enhance your Facebook Group and private chat experience. It supports custom prefixes, extensive administrative controls, dynamic commands, and automated code updates.
✨ Features
 * Modular Command System: Easily add new features by dropping .js files into the command directory.
 * Event Handling: Responds to non-command events like member joins, group renames, and bot mentions.
 * Custom Prefix: Supports system-wide and group-specific prefixes for command invocation (!prefix command).
 * User/Admin Roles: Three-tiered permission system (User, Global Admin, Bot Owner) managed via settings.json and the !admin command.
 * Self-Updating: Automatically checks for and pulls updates from a Git repository, followed by an automatic restart.
 * Utilities: Includes media retrieval (!song, !trivia), information commands (!spy, !help), and translation (!translate).
🚀 Getting Started
Prerequisites
You'll need the following installed on your machine:
 * Node.js (version 18 or higher recommended)
 * Git (for version control and the auto-updater to function)
Installation
 * Clone the Repository:
   git clone [YOUR_REPO_URL] team-titan-botz
cd team-titan-botz

 * Install Dependencies:
   npm install

 * Configuration (settings.json)
   You must create a settings.json file in the root directory. Copy the structure below and fill in your details:
   {
  "appstatePath": "./appstate.json",
  "Prefix": ["!"],
  "OwnerID": "YOUR_FACEBOOK_USER_ID",
  "AdminIDs": [],
  "BotName": "Titan-Bot",
  "defaultCoins": 100
}

   * appstatePath: Path to the file storing your bot's login cookies (usually generated on first run).
   * Prefix: An array of prefixes the bot will respond to (e.g., ["!", "/"]).
   * OwnerID: Your Facebook User ID. This grants the highest privilege (Role 3).
   * AdminIDs: An array of Facebook User IDs for global admins (Role 2).
 * Run the Bot:
   node index.js

   The bot will prompt you for login credentials or attempt to load appstate.json.
📂 File Structure
The bot is structured into modular components for easy extension:
.
├── src/
│   ├── cmds/              # All command modules (e.g., help.js, trivia.js)
│   ├── events/            # All event handler modules (e.g., newMember.js, leaveMember.js)
│   ├── utils/
│   │   ├── cmdHandler.js  # Command parsing and execution logic
│   │   ├── eventsHandler.js # Event processing and database checks
│   │   ├── console.js     # Logger utility
│   │   └── updater.js     # Git update checker
│   └── database/          # Database helper functions and setup
├── languages/             # Translation files (e.g., en.json)
├── settings.json          # Bot configuration
└── index.js               # Bot initialization and main listener

⚙️ Key Commands
The following commands are available to users (Role 0) unless specified otherwise. Use the system prefix (e.g., !) followed by the command name.
| Role | Description|
|---|---|
| 0 | all users |
| 1 | group admins |
| 2 | Bot admins |
| 3 | Bot owner |
🔧 Extending the Bot
Adding a New Command
 * Create a new file in the src/cmds/ directory (e.g., src/cmds/myCommand.js).
 * Export a module object with the required properties: name, description, role, and the execute function.
<!-- end list -->
// src/cmds/myCommand.js
module.exports = {
  name: "newcmd",
  description: "A cool new command.",
  role: 0,
  category: "utility",
  cooldown: 5,
  execute: async (api, event, args, dbHelpers, settings, getText) => {
    // Your command logic here
    api.sendMessage("Hello, world!", event.threadID);
  },
};

Adding a New Event Handler
 * Create a new file in the src/events/ directory (e.g., src/events/myEvent.js).
 * Export a module object with the eventType matching the FCA event you want to capture, and a run function.
<!-- end list -->
// src/events/myEvent.js
module.exports = {
    eventType: "typ", // Example: "message", "message_event", etc.
    name: "typingIndicator",
    description: "Responds when someone starts typing.",
    async run(api, event, dbHelpers, settings, getText) {
        if (event.type === "typ") {
            console.log(`User ${event.senderID} started typing in ${event.threadID}`);
        }
    }
};

Don't change my credit
