const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// 1. ഫിക്സഡ് ഗ്രൂപ്പ് ഐഡി
const ALLOWED_GROUP_ID = "-1003849356645"; 

// 2. Raganork-MD എക്സ്പെർട്ട് പ്രോംപ്റ്റ് (എല്ലാ റൂൾസും ഉൾപ്പെടുത്തിയത്)
const RAGANORK_SYSTEM_PROMPT = `
You are an expert developer for the Raganork-MD WhatsApp bot.
Your task is to generate or fix plugins using the EXACT structure below:

BASE STRUCTURE:
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
        // Your logic here
    } catch (e) {
        await message.sendReply('_Error: ' + e.message + '_');
    }
});

STRICT RULES:
- If "create": Generate a high-quality Raganork plugin.
- If "fix": Analyze the user's error log and code, then return the fully fixed code.
- If "downloader": Use a placeholder like const apiUrl = 'https://api-placeholder.com/dl?url=' + match[1];
- Always add a note at the end of the code: "// NOTE: Replace the fake API URL with a real working one."
- Use 'message.sendReply', 'message.sendMessage', or 'message.sendBuffer'.
- Return ONLY the javascript code inside markdown blocks ( \`\`\`javascript ... \`\`\` ).
`;

async function createGist(pluginContent) {
    try {
        const response = await axios.post('https://api.github.com/gists', {
            description: "Raganork-MD AI Plugin System",
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
        console.error("Gist Error:", error.message);
        return null;
    }
}

function pluginCodeCleanup(text) {
    const match = text.match(/```javascript([\s\S]*?)```/) || text.match(/```([\s\S]*?)```/);
    return match ? match[1].trim() : text.trim();
}

bot.on('text', async (ctx) => {
    // ഗ്രൂപ്പ് ചെക്ക്
    if (ctx.chat.id.toString() !== ALLOWED_GROUP_ID) return;

    const userRequest = ctx.message.text.trim();
    const lowText = userRequest.toLowerCase();

    // കീവേഡ് ചെക്ക് (Create അല്ലെങ്കിൽ Fix ഉണ്ടെങ്കിൽ മാത്രം)
    const isCreate = lowText.startsWith('create');
    const isFix = lowText.includes('fix') || lowText.includes('error');

    if (!isCreate && !isFix) return;

    const waitMsg = await ctx.reply(isFix ? '🔍 _Analyzing and Fixing..._' : '🚀 _Generating Raganork Plugin..._');

    try {
        // Vercel API ഉപയോഗിച്ചുള്ള AI കോൾ
        const apiUrl = `https://gemin-api-weld.vercel.app/api/generateContent?q=${encodeURIComponent(RAGANORK_SYSTEM_PROMPT + "\n\nUser Request: " + userRequest)}`;
        const res = await axios.get(apiUrl);
        const aiResponse = res.data.response;

        if (aiResponse && aiResponse.includes('Module')) {
            const gistData = await createGist(aiResponse);
            if (gistData) {
                await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, 
                    `✅ *${isFix ? 'Plugin Fixed!' : 'Plugin Created!'}*\n\n🔗 *Link:* ${gistData.html_url}\n\n_Note: Base format: Raganork-MD_`, 
                    { 
                        parse_mode: 'Markdown', 
                        disable_web_page_preview: true,
                        ...Markup.inlineKeyboard([[Markup.button.url('📂 View Code', gistData.html_url)]])
                    }
                );
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, "❌ Gist Error! Check GITHUB_TOKEN.");
            }
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, aiResponse);
        }
    } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, "❌ API unreachable. Try again.");
    }
});

// Render ഹെൽത്ത് ചെക്ക്
http.createServer((req, res) => { res.write('Raganork AI Live'); res.end(); }).listen(process.env.PORT || 8080);

bot.launch();
console.log("Bot is running in Group: " + ALLOWED_GROUP_ID);
