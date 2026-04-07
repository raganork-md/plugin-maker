const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const http = require('http');
require('dotenv').config();

// Configuration from Environment Variables
const bot = new Telegraf(process.env.BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// The strict guide for Gemini to follow Raganork-MD structure
const RAGANORK_GUIDE = `
You are an expert developer for the Raganork-MD WhatsApp bot.
Task: Create or Fix a plugin based on the user's request.

STRICT RULES:
1. Always use this structure:
   const { Module } = require('../main');
   const config = require('../config');
   const { getTempPath } = require('../core/helpers');
   const fs = require('fs');

   Module({
       pattern: 'command ?(.*)',
       desc: 'Description here',
       use: 'category',
       usage: 'usage example'
   }, async (message, match) => {
       try {
           // Logic here
       } catch (e) {
           await message.sendReply('_Error: ' + e.message + '_');
       }
   });

2. Use 'message.sendMessage' or 'message.sendReply' for responses.
3. Use 'fs.createReadStream' for sending media (images/videos/audio).
4. For fixing errors: Analyze the user's error log, find the bug, and provide the fully corrected code.
5. Use Raganork-style italics (_text_) for bot messages.
6. Return ONLY the code inside a javascript markdown block.
`;

// Function to Create GitHub Gist
async function createGist(description, content) {
    try {
        const response = await axios.post('https://api.github.com/gists', {
            description: description,
            public: true,
            files: { 'plugin.js': { content: content } }
        }, {
            headers: { 
                Authorization: `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error("Gist Error:", error.response ? error.response.data : error.message);
        throw new Error("Failed to create Gist");
    }
}

bot.start((ctx) => {
    ctx.replyWithMarkdown('👋 *Welcome to Raganork Plugin Maker AI!*\n\nI can create high-quality plugins or fix your existing code errors.\n\n*Commands:*\n- `Create a plugin for [task]`\n- `Fix this error: [log] [code]`');
});

bot.on('text', async (ctx) => {
    const userInput = ctx.message.text;
    const isFixing = userInput.toLowerCase().includes('fix') || userInput.toLowerCase().includes('error');
    
    const waitMsg = await ctx.reply(isFixing ? '🔍 _Analyzing and fixing code..._ ' : '🚀 _Generating Raganork plugin..._ ', { parse_mode: 'Markdown' });

    try {
        // Initialize Gemini 1.5 Flash
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `${RAGANORK_GUIDE}\n\nUser Request: ${userInput}`;
        
        const result = await model.generateContent(prompt);
        const aiText = result.response.text();

        // Extract code block from AI response
        const codeMatch = aiText.match(/```javascript([\s\S]*?)```/);
        const pluginCode = codeMatch ? codeMatch[1].trim() : null;

        if (pluginCode) {
            const gist = await createGist(isFixing ? "Fixed Raganork Plugin" : "New Raganork Plugin", pluginCode);
            
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, 
                `✅ *${isFixing ? 'Error Fixed!' : 'Plugin Created!'}*\n\n*Gist ID:* \`${gist.id}\` \n\n🔗 *Gist Link:* ${gist.html_url}\n\n_Note: This link is permanent unless deleted manually._`, 
                { 
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true,
                    ...Markup.inlineKeyboard([
                        [Markup.button.url('📂 View Code', gist.html_url)],
                        [Markup.button.url('🍴 Fork Gist', `https://gist.github.com/${gist.id}/fork`)]
                    ])
                }
            );
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, aiText);
        }

    } catch (error) {
        console.error(error);
        ctx.reply('❌ *Error:* Processing failed. Check your API Keys.');
    }
});

// Port binding for Render
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('Raganork AI Bot is Online!');
    res.end();
});

server.listen(process.env.PORT || 8080, () => {
    console.log("Server running on port " + (process.env.PORT || 8080));
});

bot.launch();
