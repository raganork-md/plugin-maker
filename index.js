const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const RAGANORK_GUIDE = `Expert Raganork-MD Developer. Return ONLY javascript code. Use Module({pattern...}) structure.`;

async function createGist(content) {
    const response = await axios.post('https://api.github.com/gists', {
        description: "Raganork Plugin",
        public: true,
        files: { 'plugin.js': { content: content } }
    }, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    return response.data;
}

bot.on('text', async (ctx) => {
    const userInput = ctx.message.text;
    if (userInput.startsWith('/')) return;

    const waitMsg = await ctx.reply('⏳ _Almost there... Gemini is generating code..._');

    try {
        // ഇതാണ് ഏറ്റവും സ്റ്റേബിൾ ആയ ലിങ്ക് (v1beta)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const aiResponse = await axios.post(url, {
            contents: [{ parts: [{ text: `${RAGANORK_GUIDE}\nUser: ${userInput}` }] }]
        });

        const aiText = aiResponse.data.candidates[0].content.parts[0].text;
        const codeMatch = aiText.match(/```javascript([\s\S]*?)```/) || aiText.match(/```([\s\S]*?)```/);
        const pluginCode = codeMatch ? codeMatch[1].trim() : (aiText.includes('Module') ? aiText.trim() : null);

        if (pluginCode) {
            const gist = await createGist(pluginCode);
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, 
                `✅ *Success!*\n\n🔗 *Link:* ${gist.html_url}`, 
                { parse_mode: 'Markdown', ...Markup.inlineKeyboard([Markup.button.url('📂 View Code', gist.html_url)]) }
            );
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, aiText);
        }
    } catch (error) {
        // കൃത്യമായ എറർ ബോഡി ഇവിടെ കാണിക്കും
        const detailedError = error.response ? JSON.stringify(error.response.data.error.message) : error.message;
        ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, `❌ *API Error:* ${detailedError}\n\n_Check your key again._`);
    }
});

http.createServer((req, res) => { res.write('Online'); res.end(); }).listen(process.env.PORT || 8080);
bot.launch();
