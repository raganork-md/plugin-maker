const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const RAGANORK_GUIDE = `You are an elite developer for Raganork-MD WhatsApp bot. 
Task: Generate/Fix plugin.
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
Return ONLY the code.`;

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

// Function to call Gemini with Fallback
async function callGemini(prompt) {
    const models = ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-pro"];
    let lastError = "";

    for (let modelName of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
            const response = await axios.post(url, {
                contents: [{ parts: [{ text: prompt }] }]
            });
            if (response.data.candidates && response.data.candidates[0].content) {
                return response.data.candidates[0].content.parts[0].text;
            }
        } catch (e) {
            lastError = e.response?.data?.error?.message || e.message;
            console.log(`Model ${modelName} failed, trying next...`);
            continue; 
        }
    }
    throw new Error(lastError);
}

bot.on('text', async (ctx) => {
    const userInput = ctx.message.text;
    if (userInput.startsWith('/start')) return ctx.reply('🚀 Send your plugin request. Powered by Gemini AI.');

    const waitMsg = await ctx.reply('🧠 _AI is analyzing your request..._');

    try {
        const aiText = await callGemini(`${RAGANORK_GUIDE}\n\nUser Request: ${userInput}`);
        
        const codeMatch = aiText.match(/```javascript([\s\S]*?)```/) || aiText.match(/```([\s\S]*?)```/);
        const pluginCode = codeMatch ? codeMatch[1].trim() : (aiText.includes('Module') ? aiText.trim() : null);

        if (pluginCode) {
            const gist = await createGist("Raganork Plugin", pluginCode);
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, 
                `✅ *Plugin Generated!*\n\n🔗 *Gist:* ${gist.html_url}`, 
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
        ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, `❌ *Error:* ${error.message}\n\nPlease verify your GEMINI_API_KEY in Render.`);
    }
});

http.createServer((req, res) => { res.write('Bot Active'); res.end(); }).listen(process.env.PORT || 8080);
bot.launch();
