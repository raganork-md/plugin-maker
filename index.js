const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Raganork-MD Advanced Guide with Error Fixing & Downloader Rules
const RAGANORK_SYSTEM_PROMPT = `
You are an expert Raganork-MD WhatsApp bot developer.

TASKS:
1. CREATE: Generate high-quality plugins using the Raganork-MD structure.
2. FIX: If the user provides code and an error log, analyze it, find the bug, and return the fully corrected code.

STRICT RULES FOR DOWNLOADERS:
- If the user asks for a downloader (YouTube, Instagram, etc.), do NOT use a real working API URL.
- Instead, use a placeholder: const apiUrl = 'https://api-placeholder.com/download?url=' + match[1];
- At the end of the code, add a comment: "// NOTE: Replace the fake API URL with a real working one."

PLUGIN STRUCTURE:
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
        // Logic (Use message.sendReply)
    } catch (e) {
        await message.sendReply('_Error: ' + e.message + '_');
    }
});

Return ONLY the code inside a javascript markdown block.
`;

async function createGist(pluginContent) {
    try {
        const response = await axios.post('https://api.github.com/gists', {
            description: "Raganork-MD AI Plugin/Fix",
            public: true,
            files: { 'plugin.js': { content: pluginCodeCleanup(pluginContent) } }
        }, {
            headers: { Authorization: `token ${GITHUB_TOKEN}` }
        });
        return response.data;
    } catch (error) {
        return null;
    }
}

function pluginCodeCleanup(text) {
    const match = text.match(/```javascript([\s\S]*?)```/) || text.match(/```([\s\S]*?)```/);
    return match ? match[1].trim() : text.trim();
}

bot.on('text', async (ctx) => {
    const userRequest = ctx.message.text;
    if (userRequest.startsWith('/')) return;

    const isFixing = userRequest.toLowerCase().includes('fix') || userRequest.toLowerCase().includes('error');
    const waitMsg = await ctx.reply(isFixing ? '🔍 _Analyzing and fixing your code..._' : '🚀 _Generating Raganork plugin..._');

    try {
        const fullPrompt = `${RAGANORK_SYSTEM_PROMPT}\n\nUser Request: ${userRequest}`;
        const apiUrl = `https://gemin-api-weld.vercel.app/api/generateContent?q=${encodeURIComponent(fullPrompt)}`;
        
        const res = await axios.get(apiUrl);
        const aiResponse = res.data.response;

        if (aiResponse && aiResponse.includes('Module')) {
            const gistData = await createGist(aiResponse);
            
            if (gistData) {
                await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, 
                    `✅ *${isFixing ? 'Code Fixed!' : 'Plugin Ready!'}*\n\n🔗 *Link:* ${gistData.html_url}`, 
                    { 
                        parse_mode: 'Markdown', 
                        disable_web_page_preview: true,
                        ...Markup.inlineKeyboard([[Markup.button.url('📂 View Code', gistData.html_url)]])
                    }
                );
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, "❌ Gist failed. Check GITHUB_TOKEN.");
            }
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, aiResponse);
        }
    } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, "❌ API Error. Try again later.");
    }
});

http.createServer((req, res) => { res.end('Running'); }).listen(process.env.PORT || 8080);
bot.launch();
