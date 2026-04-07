const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const http = require('http');

const bot = new Telegraf(process.env.BOT_TOKEN);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// AI-യിലേക്ക് റിക്വസ്റ്റ് അയക്കാനുള്ള ഫംഗ്‌ഷൻ (No API Key needed)
async function getFreeAIResponse(prompt) {
    try {
        // ഇതാരു ഫ്രീ സർവീസ് പ്രൊവൈഡർ ആണ്, പലപ്പോഴും മാറാൻ സാധ്യതയുണ്ട്
        const response = await axios.get(`https://api.aggelos-007.xyz/ai?prompt=${encodeURIComponent(prompt)}`);
        return response.data.response;
    } catch (e) {
        // ഒന്നാമത്തെ വഴി നടന്നില്ലെങ്കിൽ രണ്ടാമത്തെ വഴി (Blackbox AI)
        const blackbox = await axios.post('https://www.blackbox.ai/api/chat', {
            messages: [{ role: 'user', content: prompt }],
            model: 'deepseek-v3'
        });
        return blackbox.data;
    }
}

async function createGist(content) {
    const response = await axios.post('https://api.github.com/gists', {
        description: "Raganork Plugin",
        public: true,
        files: { 'plugin.js': { content: content } }
    }, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });
    return response.data.html_url;
}

bot.on('text', async (ctx) => {
    const waitMsg = await ctx.reply('🔍 _Thinking without API Key..._');
    try {
        const aiText = await getFreeAIResponse(`Act as Raganork-MD plugin maker. Code only: ${ctx.message.text}`);
        
        if (aiText.includes('Module')) {
            const link = await createGist(aiText);
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, `✅ *Ready!*\n🔗 ${link}`, { parse_mode: 'Markdown' });
        } else {
            await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, aiText);
        }
    } catch (err) {
        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, "❌ AI is busy. Try again.");
    }
});

http.createServer((req, res) => { res.end('Running'); }).listen(process.env.PORT || 8080);
bot.launch();
