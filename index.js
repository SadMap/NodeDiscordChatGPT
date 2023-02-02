import ChatGPTClient from '@waylaidwanderer/chatgpt-api';
import discord from "discord.js"
import { QuickDB } from 'quick.db';
import { config } from 'dotenv';
import KeyvSqlite from '@keyv/sqlite';
config()
const db = new QuickDB({
    filePath:"./db.sqlite",
    table:"sikimsonikdb",
})
function chunkSubstr(str, size) {
    const numChunks = Math.ceil(str.length / size)
    const chunks = new Array(numChunks)
  
    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
      chunks[i] = str.substr(o, size)
    }
  
    return chunks
  }
const apiInstances = new Map()
const client = new discord.Client({
    intents:["Guilds","MessageContent","GuildMessages"]
})
client.on("ready",async () => {
    await client.application.commands.set([
        new discord.SlashCommandBuilder()
        .setName("apikey")
        .setDescription("Apikey i belirler")
        .setDMPermission(false)
        .addStringOption(new discord.SlashCommandStringOption()
        .setName("apikey")
        .setRequired(true)
        .setDescription("https://platform.openai.com/account/api-keys den aldığınız apikey")
        ),
        new discord.SlashCommandBuilder()
        .setName("create")
        .setDescription("chatgpt ile konuşmak için oda oluşturur")
        .setDMPermission(false),
        new discord.SlashCommandBuilder()
        .setName("clear")
        .setDescription("ChatGPT'nin hafızasını siler")
        .setDMPermission(false)
    ])
    console.log("Ready!")
})
client.on("messageCreate",async (message) => {
    const currentDate = new Date();
    const currentDateString = currentDate.getFullYear()
    if (!message.inGuild()) return
    if (!message.channel.isThread()) return;
    if (message.author.bot) return
    if (message.channel.parentId !== process.env.CHANNEL_ID) return;
    /**
     * @type {{
     * apikey:string,
     * channelID:string?,
     * lastResponseID:string?,
     * conversationId:string?
     * }}
     */
    const data = await db.get(message.member.id)
    if (!data) return
    if (data.channelID !== message.channelId) return;
    /**
     * @type {ChatGPTClient?}
     */
    let instance = apiInstances.get(message.author.id)
    if (!instance) {
        instance = new ChatGPTClient(data.apikey,{
            promptPrefix:`Konuşarak yanıt ver
Şuanki tarih: ${currentDateString}`,
            userLabel:"Kullanıcı"
},{
            store:new KeyvSqlite({
                uri:`sqlite://databases/${message.author.id}.sqlite`
            })
        })
    }
    try {
        const response = await instance.sendMessage(message.content,{
            conversationId:data.conversationId,
            parentMessageId:data.lastResponseID
        })
        const chunks = chunkSubstr(response.response,2000)
        for (const chunk of chunks) {
            await message.reply({
                failIfNotExists:false,
                content:chunk,
                allowedMentions:{parse:[],repliedUser:true,roles:[],users:[]}
            })
        }
        db.set(message.member.id,{
            apikey:data.apikey,
            channelID:data.channelID,
            lastResponseID:response.messageId,
            conversationId:response.conversationId
        })
    }
    catch (err) {
        console.log(err)
        message.reply("Hata oluştu waiye söyle konsola baksın")
    }
})
client.on("interactionCreate",async (interaction) => {
    if (!interaction.inCachedGuild()) return;
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName == "apikey") {
       try {
        await interaction.deferReply({
            ephemeral:true
        })
        const apikey = interaction.options.getString("apikey",true)
        const instance = new ChatGPTClient(apikey,{
            promptPrefix:`Konuşarak yanıt ver \n\n`,
            userLabel:"Kullanıcı"
        },{
            store:new KeyvSqlite({
                uri:`sqlite://databases/${interaction.user.id}.sqlite`
            })
        })
        const response = await instance.sendMessage("bir serviste hesap başarıyla oluştururmuş gibi bir mesaj üretebilir misin")
        await interaction.editReply({
            content:response.response,
            ephemeral:true
        })
        db.set(interaction.user.id,{
            apikey,
            channelID:null,
            lastResponseID:null,
            conversationId:null
        })
        apiInstances.set(interaction.user.id,instance)
       }
       catch (err) {
        console.log(err)
        interaction.editReply({
            content:"Apikey kayıt edilemedi",
            ephemeral:true
        }).catch(() => {})
       }
    }
    else if (interaction.commandName == "create") {
        if (!db.has(interaction.user.id)) {
            interaction.reply("Öncelikle /apikey komutu ile apikeyini belirlemelisin")
            return;
        }
        const channel = await interaction.guild.channels.fetch("1070227012792369222")
        if (!channel) {
            interaction.reply("Waiye söyle kanal yok")
            return
        }
        if (!channel.isTextBased() || channel.isDMBased() || channel.isVoiceBased() || channel.isThread()) {
            interaction.reply("Waiye söyle kanal yanlış")
            return;
        }
        const data =await db.get(interaction.user.id)
        if (!data) return
        if (data.channelID) {
            interaction.reply("Kanal zaten açık")
            return;
        }
        const thread = await channel.threads.create({
            name:`${interaction.member.displayName} in odası`
        })
        console.log(data)
        db.set(interaction.user.id,{
            apikey:data.apikey,
            channelID:thread.id,
            lastResponseID:null,
            conversationId:null
        })
        await thread.send(interaction.member.toString())
        interaction.reply(`[Seni Bekliyorum](${thread.url})`)
    }
    else if (interaction.commandName == "clear") {
        if (!db.has(interaction.user.id)) {
            interaction.reply("Zaten veritabanında yoksun!");
            return
        }
        const data = await db.get(interaction.user.id)
        await db.set(interaction.user.id,{
            apikey:data.apikey,
            channelID:data.channelID,
            lastResponseID:null,
            conversationId:null
        })
        interaction.reply("Veriler başarıyla sıfırlandı!")
    }
})
client.login(process.env.TOKEN)
//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