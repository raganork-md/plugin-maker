const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Expert instructions for Gemini 3 Pro
const RAGANORK_GUIDE = `You are an elite developer specializing in Raganork-MD WhatsApp bot. 
Task: Generate or Fix plugins.
Structure:
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
        // Logic
    } catch (e) {
        await message.sendReply('_Error: ' + e.message + '_');
    }
});

Rules:
- Use message.sendMessage, message.sendReply, or message.edit.
- Use fs.createReadStream for media.
- Return ONLY the raw javascript code inside markdown blocks.`;

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
    if (userInput.startsWith('/start')) return ctx.reply('🚀 Send a request to generate a Raganork plugin using Gemini 3 Pro.');

    const waitMsg = await ctx.reply('🧠 _Gemini 3 Pro is thinking..._');

    try {
        // Updated to Gemini 3 Pro for maximum accuracy
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro:generateContent?key=${GEMINI_API_KEY}`;
        
        const aiResponse = await axios.post(url, {
            contents: [{ parts: [{ text: `${RAGANORK_GUIDE}\n\nUser Request: ${userInput}` }] }]
        });

        if (!aiResponse.data.candidates) {
            throw new Error("Gemini 3 Pro is currently unavailable or your API key lacks access.");
        }

        const aiText = aiResponse.data.candidates[0].content.parts[0].text;
        const codeMatch = aiText.match(/```javascript([\s\S]*?)```/) || aiText.match(/```([\s\S]*?)```/);
        const pluginCode = codeMatch ? codeMatch[1].trim() : aiText.trim();

        if (pluginCode.includes('Module')) {
            const gist = await createGist("Raganork Plugin", pluginCode);
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, 
                `✅ *Plugin Created with Gemini 3 Pro!*\n\n🔗 *Gist:* ${gist.html_url}`, 
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
        console.error("DEBUG:", error.response ? error.response.data : error.message);
        const errorDetail = error.response?.data?.error?.message || error.message;
        ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, `❌ *Error:* ${errorDetail}`);
    }
});

http.createServer((req, res) => { res.write('Gemini 3 Bot Active'); res.end(); }).listen(process.env.PORT || 8080);
bot.launch();
