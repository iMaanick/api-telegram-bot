const TelegramApi = require('node-telegram-bot-api')
const { pool } = require("./dbConfig")

require("dotenv").config();
const token = process.env.token;
const cron = require("node-cron");

const bot = new TelegramApi(token, { polling: true })


bot.setMyCommands([
    { command: '/start', description: 'Start bot' },
    { command: '/info', description: 'How to use the bot?' },
    { command: '/test', description: '12321' },

])

const options = {
    reply_markup: JSON.stringify({
        inline_keyboard: [
            [{ text: 'Delete this notification \u274c', callback_data: '1' }],

        ]
    })
}


bot.on('message', async msg => {
    const text = msg.text;
    const chatId = msg.chat.id;
    if (text === '/start') {
        await bot.sendMessage(chatId, 'Hi! This bot will send notifications');
        const data = await pool.query(
            `SELECT * FROM users
            WHERE telegram_username = $1`, [msg.from.username]
        )
        if (data != undefined) {
            data.rows.forEach(async (element) => {
                //console.log(element.id)
                await pool.query(
                    `UPDATE users set "chatId" = ($1)
                    WHERE id = ($2)`, [chatId, element.id], (err, results) => {
                    if (err) {
                        throw err;
                    }
                })
            })
        }
    }
    if (text === '/info') {
        await bot.sendMessage(chatId, 'To receive notifications, you must register on the site and enter the telegram login');
    }
    if (text === '/test') {
        await bot.deleteMessage(chatId, msg.message_id);
        messageId = await bot.sendMessage(chatId, 'To receive notifications, you must register on the site and enter the telegram login', options);
    }
})

async function deleteRow(chatId, messageId) {

    const dataId = await pool.query(
        `SELECT id FROM users
        WHERE "chatId" = $1`, [chatId]
    )
    console.log(dataId.rows[0].id)
    pool.query(
        `
        DELETE FROM notifications 
        WHERE user_id = $1 AND "messageId" = $2`, [dataId.rows[0].id, messageId], function (err) {
        if (err) {
            console.log(err);
        }
    })
}
bot.on('callback_query', async msg => {
    const data = msg.data;
    const chatId = msg.message.chat.id;
    console.log(msg.message.message_id);
    if (msg.message.message_id != undefined) {
        //console.log(messageId.message_id);
        try{
            await bot.deleteMessage(chatId, msg.message.message_id);
            deleteRow(chatId, msg.message.message_id);
            console.log(chatId)
            console.log(msg.message.message_id)
        }
        catch(err){
            console.log(err)
        }
    }
})


cron.schedule('* * * * * *', async () => {

    const data = await pool.query(
        `SELECT to_char(date,'YYYY-MM-DD'), text, time, id, user_id, "messageId" FROM notifications`
    )
    const date = new Date();
    data.rows.forEach(async (element) => {
        if (Date.parse(element.to_char + "T" + element.time + ".000Z") <= date) {
            const chatId = await pool.query(
                `SELECT "chatId" FROM users
        WHERE id = $1`, [element.user_id]
            )
            if (chatId.rows[0].chatId != undefined) {
                // deleting previous msg if it exists
                if (element.messageId != undefined) {
                    // we can already delete the msg
                    try {
                        await bot.deleteMessage(chatId.rows[0].chatId, element.messageId);
                    }
                    catch (err){
                        console.log('msg was already deleted');
                    }
                }
                // sending new msg and saving its msgId
                let messageId = await (await bot.sendMessage(chatId.rows[0].chatId, element.text, options)).message_id;
                
                await pool.query(
                    `UPDATE notifications set "messageId" = ($1)
                    WHERE id = ($2)`, [messageId, element.id], (err, results) => {
                    if (err) {
                        throw err;
                    }
                })
            }
        }
    });
})
