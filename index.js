const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Fixed Group ID
const ALLOWED_GROUP_ID = "-1003849356645"; 

const RAGANORK_SYSTEM_PROMPT = `
You are an expert Raganork-MD plugin developer.
STRICTLY use the following base structure for all plugins:

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
        // Logic (Use message.sendReply for text)
    } catch (e) {
        await message.sendReply('_Error: ' + e.message + '_');
    }
});

RULES:
- If user says "create": Build a new plugin with the above format.
- If user says "fix": Correct the provided code using the same structure.
- If a downloader is requested: Use const apiUrl = 'https://api-placeholder.com/dl?url=' + match[1];
- Always add this note at the end of the code: "// NOTE: Replace the fake API URL with a real working one."
- Return ONLY the javascript code inside markdown blocks.
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
    // 1. ഗ്രൂപ്പ് ഐഡി ചെക്ക്
    if (ctx.chat.id.toString() !== ALLOWED_GROUP_ID) return;

    const userRequest = ctx.message.text.trim();
    const lowText = userRequest.toLowerCase();
    
    // 2. റിപ്ലൈ മോഡ് ചെക്ക് (ബോട്ടിന്റെ മെസ്സേജിനാണോ റിപ്ലൈ എന്ന് നോക്കുന്നു)
    const isReplyToBot = ctx.message.reply_to_message && ctx.message.reply_to_message.from.id === ctx.botInfo.id;
    
    // 3. കീവേഡ് ചെക്ക്
    const isCreate = lowText.startsWith('create');
    const isFix = lowText.includes('fix');

    // ലോജിക്: 'create' എന്ന് തുടങ്ങണം, അല്ലെങ്കിൽ 'fix' ഉണ്ടാവണം, അല്ലെങ്കിൽ ബോട്ടിന് റിപ്ലൈ ആയിരിക്കണം
    if (!isCreate && !isFix && !isReplyToBot) return;

    const waitMsg = await ctx.reply('⏳ _Processing request..._');

    try {
        const apiUrl = `https://gemin-api-weld.vercel.app/api/generateContent?q=${encodeURIComponent(RAGANORK_SYSTEM_PROMPT + "\n\nUser: " + userRequest)}`;
        const res = await axios.get(apiUrl);
        const aiResponse = res.data.response;

        // കോഡ് ഉണ്ടെങ്കിൽ Gist ആക്കുന്നു
        if (aiResponse && aiResponse.includes('Module')) {
            const gistData = await createGist(aiResponse);
            if (gistData) {
                await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, 
                    `✅ *Raganork Plugin Ready!*\n\n🔗 *Gist:* ${gistData.html_url}`, 
                    { 
                        parse_mode: 'Markdown', 
                        disable_web_page_preview: true,
                        ...Markup.inlineKeyboard([[Markup.button.url('📂 View Code', gistData.html_url)]])
                    }
                );
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, "❌ Gist failed. Here is the raw code:\n\n" + aiResponse);
            }
        } else {
            // വെറും ചാറ്റ് റിപ്ലൈ
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, aiResponse);
        }
    } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, "❌ API unreachable. Check connection.");
    }
});

http.createServer((req, res) => { res.end('Raganork AI Service Running'); }).listen(process.env.PORT || 8080);
bot.launch();
