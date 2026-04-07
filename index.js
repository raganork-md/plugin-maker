const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
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
Rules: Use message.sendMessage/sendReply and fs.createReadStream for media. Return ONLY the code inside a javascript markdown block.`;

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
        // Direct Axios call to Gemini API v1beta
        const aiResponse = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: `${RAGANORK_GUIDE}\n\nUser Request: ${userInput}` }] }]
            }
        );

        const aiText = aiResponse.data.candidates[0].content.parts[0].text;

        const codeMatch = aiText.match(/```javascript([\s\S]*?)```/) || aiText.match(/```([\s\S]*?)```/);
        const pluginCode = codeMatch ? codeMatch[1].trim() : aiText.trim();

        if (pluginCode.includes('Module')) {
            const gist = await createGist("Raganork Plugin", pluginCode);
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, 
                `✅ *Plugin Ready!*\n\n🔗 *Gist:* ${gist.html_url}`, 
                { 
                    parse_mode: 'Markdown', 
                    disable_web_page_preview: true,
                    ...Markup.inlineKeyboard([Markup.button.url('📂 View Code', gist.html_url)]) 
                }
            );
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, aiText);
        }
    } catch (error) {
        console.error("DEBUG ERROR:", error.response ? error.response.data : error.message);
        const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, `❌ *Error:* API issue. Please check your Gemini Key.`);
    }
});

http.createServer((req, res) => { res.write('Bot Running'); res.end(); }).listen(process.env.PORT || 8080);
bot.launch();
