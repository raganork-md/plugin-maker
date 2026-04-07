const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// നിങ്ങൾ നൽകിയ ഗ്രൂപ്പ് ഐഡി
const ALLOWED_GROUP_ID = "-1003849356645"; 

const RAGANORK_SYSTEM_PROMPT = `
You are an expert Raganork-MD developer. 
Generate plugins ONLY using this strict base structure:

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
        // Your logic here
    } catch (e) {
        await message.sendReply('_Error: ' + e.message + '_');
    }
});

RULES:
1. ONLY return the code inside javascript markdown blocks.
2. For downloaders, use a placeholder API URL (e.g., https://api-placeholder.com/dl?url=).
3. DO NOT add any notes or warnings inside the code.
4. If it is a reply to the bot (not starting with create), act as a helpful AI assistant.
`;

async function createGist(pluginContent) {
    try {
        const response = await axios.post('https://api.github.com/gists', {
            description: "Raganork-MD AI Plugin",
            public: true,
            files: { 'plugin.js': { content: pluginCodeCleanup(pluginContent) } }
        }, {
            headers: { 
                Authorization: `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json'
            }
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
    if (ctx.chat.id.toString() !== ALLOWED_GROUP_ID) return;

    const userRequest = ctx.message.text.trim();
    const lowText = userRequest.toLowerCase();
    
    const isReplyToBot = ctx.message.reply_to_message && ctx.message.reply_to_message.from.id === ctx.botInfo.id;
    const isCreate = lowText.startsWith('create');

    if (!isCreate && !isReplyToBot) return;

    const waitMsg = await ctx.reply('⏳ _Processing..._');

    try {
        const apiUrl = `https://gemin-api-weld.vercel.app/api/generateContent?q=${encodeURIComponent(RAGANORK_SYSTEM_PROMPT + "\n\nUser: " + userRequest)}`;
        const res = await axios.get(apiUrl);
        const aiResponse = res.data.response;

        if (isCreate && aiResponse.includes('Module')) {
            const gistData = await createGist(aiResponse);
            if (gistData) {
                // ഡൗൺലോഡർ ആണോ എന്ന് ഇവിടെ കൃത്യമായി പരിശോധിക്കുന്നു
                const isDownloader = lowText.includes('download') || lowText.includes('dl');
                
                let caption = `✅ *Raganork Plugin Created!*\n\n🔗 *Gist:* ${gistData.html_url}`;
                
                // ഡൗൺലോഡർ ആണെങ്കിൽ മാത്രം ഈ ഇംഗ്ലീഷ് വാണിംഗ് ചേർക്കും
                if (isDownloader) {
                    caption += `\n\n⚠️ *External Warning:* This downloader plugin uses a placeholder API URL. You must replace it with a real, working API URL in the code for it to function correctly.`;
                }

                await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, caption, 
                    { 
                        parse_mode: 'Markdown', 
                        disable_web_page_preview: true,
                        ...Markup.inlineKeyboard([[Markup.button.url('📂 View Code', gistData.html_url)]])
                    }
                );
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, "❌ Gist Error! Check your settings.");
            }
        } else {
            // സാധാരണ AI റിപ്ലൈ
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, aiResponse);
        }
    } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, "❌ Connection lost. Try again.");
    }
});

http.createServer((req, res) => { res.end('Raganork AI Online'); }).listen(process.env.PORT || 8080);
bot.launch();
