const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');

const app = express();
app.use(express.json());

// Variables desde Render
const DISCORD_TOKEN = process.env.DISCORD_TOKEN; 
const MAIN_SERVER_URL = process.env.MAIN_SERVER_URL || "https://montanahub-keys.onrender.com";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "MontanaHub2026";

// -------------------------------------------------------------
// 1. REGISTRO DEL COMANDO SLASH (/resethwid)
// -------------------------------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName('resethwid')
        .setDescription('Reinicia el HWUID de una key en MontanaHub.')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('La key a la que deseas borrarle el HWUID')
                .setRequired(true))
].map(command => command.toJSON());

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
    console.log(`🤖 Bot conectado como: ${client.user.tag}`);

    try {
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        console.log('🔄 Registrando comando /resethwid...');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('✅ Comando /resethwid registrado correctamente.');
    } catch (error) {
        console.error('❌ Error registrando comando:', error);
    }
});

// -------------------------------------------------------------
// 2. LOGICA DEL COMANDO /resethwid
// -------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'resethwid') {
        const targetKey = interaction.options.getString('key');

        // Avisamos a la interacción que procesaremos el pedido
        await interaction.deferReply();

        try {
            // Le pedimos a tu servidor de keys (montanahub-keys) que reseteé el HWUID
            const response = await fetch(`${MAIN_SERVER_URL}/reset-hwuid`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: targetKey,
                    secret: ADMIN_SECRET
                })
            });

            const data = await response.json();

            if (data.success || response.ok) {
                const embed = new EmbedBuilder()
                    .setTitle("🔄 HWUID Reiniciado")
                    .setColor(0x00FF00)
                    .setDescription(`El HWUID para la key \`${targetKey}\` fue eliminado exitosamente en **MontanaHub Keys**. El usuario ya puede vincular su nuevo dispositivo.`)
                    .setFooter({ text: "Montana Hub Security System" });

                return interaction.editReply({ embeds: [embed] });
            } else {
                return interaction.editReply({ content: `❌ Error del servidor: ${data.message || "No se pudo resetear la key."}` });
            }
        } catch (error) {
            console.error('Error al conectar con el servidor principal:', error);
            return interaction.editReply({ content: '❌ Error de conexión con el servidor principal de keys.' });
        }
    }
});

// Iniciar sesión en Discord
if (DISCORD_TOKEN) {
    client.login(DISCORD_TOKEN);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servicio de Discord Bot corriendo en puerto ${PORT}`);
});
