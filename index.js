const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const http = require('http');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const RAGANORK_GUIDE = `You are an expert developer for Raganork-MD WhatsApp bot. 
Create or Fix a plugin using this exact structure:
const { Module } = require('../main');
const config = require('../config');
const { getTempPath } = require('../core/helpers');
const fs = require('fs');

Module({
    pattern: 'command ?(.*)',
    desc: 'Description',
    use: 'category',
    usage: 'usage'
}, async (message, match) => {
    try {
        // logic
    } catch (e) {
        await message.sendReply('_Error: ' + e.message + '_');
    }
});
Rules: Use message.sendMessage/sendReply and fs.createReadStream for media. Return ONLY the code.`;

async function createGist(description, content) {
    const response = await axios.post('https://api.github.com/gists', {
        description: description,
        public: true,
        files: { 'plugin.js': { content: content } }
    }, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    return response.data;
}

bot.on('text', async (ctx) => {
    const userInput = ctx.message.text;
    if (userInput.startsWith('/start')) return ctx.reply('Send a request to create a plugin.');

    const waitMsg = await ctx.reply('_AI is processing..._');

    try {
        // കൃത്യമായ മോഡൽ പേര് ഇവിടെ ഉറപ്പാക്കുന്നു
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const result = await model.generateContent(`${RAGANORK_GUIDE}\n\nUser Request: ${userInput}`);
        const aiText = result.response.text();

        const codeMatch = aiText.match(/```javascript([\s\S]*?)```/) || aiText.match(/```([\s\S]*?)```/);
        const pluginCode = codeMatch ? codeMatch[1].trim() : aiText.trim();

        if (pluginCode.includes('Module')) {
            const gist = await createGist("Raganork Plugin", pluginCode);
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, 
                `✅ *Plugin Ready!*\n\n🔗 *Gist:* ${gist.html_url}`, 
                { parse_mode: 'Markdown', ...Markup.inlineKeyboard([Markup.button.url('📂 View Code', gist.html_url)]) }
            );
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, aiText);
        }
    } catch (error) {
        console.error("DEBUG ERROR:", error); // ഇത് Render Logs-ൽ കാണാൻ സഹായിക്കും
        ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, `❌ *Error:* ${error.message}\nCheck Render Logs for details.`);
    }
});

http.createServer((req, res) => { res.write('Bot Running'); res.end(); }).listen(process.env.PORT || 8080);
bot.launch();
