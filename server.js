const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');

const app = express();
app.use(express.json());

// Variables de entorno desde Render
const DISCORD_TOKEN = process.env.DISCORD_TOKEN; 
const ADMIN_SECRET = process.env.ADMIN_SECRET || "MontanaHub2026";

// Base de datos de Keys en memoria
const keysDB = {};

// -------------------------------------------------------------
// 1. RUTAS DEL SERVIDOR WEB (PARA ROBLOX)
// -------------------------------------------------------------
app.post('/verify', (req, res) => {
    const { key, hwuid } = req.body;

    if (!key || !keysDB[key]) {
        return res.json({ valid: false, message: "Key inexistente" });
    }

    const keyData = keysDB[key];

    if (keyData.expires && Date.now() > keyData.expires) {
        return res.json({ valid: false, message: "Key expirada" });
    }

    if (!keyData.hwuid) {
        keyData.hwuid = hwuid;
    } else if (hwuid && keyData.hwuid !== hwuid) {
        return res.json({ valid: false, message: "HWUID no coincide" });
    }

    return res.json({ valid: true, message: "Key valida" });
});

app.post('/reset-hwuid', (req, res) => {
    const { key, secret } = req.body;

    if (secret !== ADMIN_SECRET) {
        return res.status(403).json({ success: false, message: "No autorizado" });
    }

    if (keysDB[key]) {
        keysDB[key].hwuid = null;
        return res.json({ success: true, message: `HWUID reseteado para ${key}` });
    }

    return res.status(404).json({ success: false, message: "Key no encontrada" });
});

// -------------------------------------------------------------
// 2. REGISTRO DE SLASH COMMANDS (/resethwid y /genkey)
// -------------------------------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName('resethwid')
        .setDescription('Reinicia el HWUID de una key para asignarle un nuevo dispositivo.')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('La key a la que deseas borrarle el HWUID')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('genkey')
        .setDescription('Genera una nueva key para MontanaHub.')
        .addIntegerOption(option =>
            option.setName('dias')
                .setDescription('Días de duración de la key (por defecto 1)')
                .setRequired(false))
].map(command => command.toJSON());

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// Cuando el bot esté listo, registra los Slash Commands automáticamente en Discord
client.once('ready', async () => {
    console.log(`🤖 Bot activo como: ${client.user.tag}`);

    try {
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        console.log('🔄 Registrando comandos de barra diagonal (/)...');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('✅ ¡Comandos Slash registrados exitosamente!');
    } catch (error) {
        console.error('❌ Error registrando comandos:', error);
    }
});

// -------------------------------------------------------------
// 3. RESPUESTA A LOS SLASH COMMANDS
// -------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // COMANDO /resethwid
    if (commandName === 'resethwid') {
        const targetKey = interaction.options.getString('key');

        if (keysDB[targetKey]) {
            keysDB[targetKey].hwuid = null; // Se limpia el HWUID

            const embed = new EmbedBuilder()
                .setTitle("🔄 HWUID Reiniciado")
                .setColor(0x00FF00)
                .setDescription(`El HWUID de la key \`${targetKey}\` fue borrado con éxito. El usuario ya puede ingresarla desde su nuevo dispositivo.`)
                .setFooter({ text: "Montana Hub Security System" });

            return interaction.reply({ embeds: [embed] });
        } else {
            return interaction.reply({ content: `❌ La key \`${targetKey}\` no existe o no se encuentra registrada.`, ephemeral: true });
        }
    }

    // COMANDO /genkey
    if (commandName === 'genkey') {
        const days = interaction.options.getInteger('dias') || 1;
        const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
        const newKey = `MHUB-${randomHex}-${Math.floor(1000 + Math.random() * 9000)}`;
        
        const expireTime = Date.now() + (days * 24 * 60 * 60 * 1000);

        keysDB[newKey] = {
            hwuid: null,
            expires: expireTime
        };

        const embed = new EmbedBuilder()
            .setTitle("🔑 Key Generada Exitosamente")
            .setColor(0xFF0000)
            .addFields(
                { name: "Key:", value: `\`${newKey}\`` },
                { name: "Duración:", value: `${days} día(s)` },
                { name: "Estado HWUID:", value: "Sin vincular (se vinculará automáticamente al usarse)" }
            )
            .setFooter({ text: "Montana Hub System" });

        return interaction.reply({ embeds: [embed] });
    }
});

// Iniciar sesión
if (DISCORD_TOKEN) {
    client.login(DISCORD_TOKEN);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor HTTP corriendo en el puerto ${PORT}`);
});
