const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Ningal thanna Group ID ivide fixed aayi kodukkunnu
const ALLOWED_GROUP_ID = "-1003849356645"; 

const RAGANORK_SYSTEM_PROMPT = `
You are an expert Raganork-MD WhatsApp bot developer.
- If user says "create", generate a new plugin using Raganork structure.
- If user says "fix", analyze the code and error provided, then return the corrected code.
- For downloaders, use fake URLs and add a note at the end.
- Return ONLY the javascript code inside markdown blocks.
`;

async function createGist(pluginContent) {
    try {
        const response = await axios.post('https://api.github.com/gists', {
            description: "Raganork-MD AI generated content",
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
    // 1. Group ID Check
    if (ctx.chat.id.toString() !== ALLOWED_GROUP_ID) {
        return; 
    }

    const userRequest = ctx.message.text.trim();
    const lowText = userRequest.toLowerCase();

    // 2. Keyword Check (Create or Fix)
    const isCreate = lowText.startsWith('create');
    const isFix = lowText.includes('fix') || lowText.includes('error');

    if (!isCreate && !isFix) {
        // "create" ennu thudangunnatilla, "fix" ennum illa enkil bot reply nalkilla
        return;
    }

    const waitMsg = await ctx.reply(isFix ? '🔍 _Fixing error..._' : '🚀 _Creating plugin..._');

    try {
        const apiUrl = `https://gemin-api-weld.vercel.app/api/generateContent?q=${encodeURIComponent(RAGANORK_SYSTEM_PROMPT + "\n\nUser Request: " + userRequest)}`;
        const res = await axios.get(apiUrl);
        const aiResponse = res.data.response;

        if (aiResponse && aiResponse.includes('Module')) {
            const gistData = await createGist(aiResponse);
            if (gistData) {
                await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, 
                    `✅ *${isFix ? 'Fixed Successfully' : 'Created Successfully'}*\n\n🔗 *Link:* ${gistData.html_url}`, 
                    { 
                        parse_mode: 'Markdown', 
                        disable_web_page_preview: true,
                        ...Markup.inlineKeyboard([[Markup.button.url('📂 View Code', gistData.html_url)]])
                    }
                );
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, "❌ Gist Error. Check GITHUB_TOKEN.");
            }
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, aiResponse);
        }
    } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, "❌ API Error.");
    }
});

http.createServer((req, res) => { res.end('Active'); }).listen(process.env.PORT || 8080);
bot.launch();
