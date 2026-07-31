const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');

const app = express();
app.use(express.json());

// Configuraciones del Servidor Principal y Discord
const DISCORD_TOKEN = process.env.DISCORD_TOKEN; 
const MAIN_SERVER_URL = "https://montanahub-keys.onrender.com";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "MontanaHub2026";

// -------------------------------------------------------------
// 1. REGISTRO OBLIGATORIO DEL COMANDO SLASH (/resethwid)
// -------------------------------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName('resethwid')
        .setDescription('Fuerza el reinicio de HWUID de una key en MontanaHub Keys.')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('Ingresa la key exacta a resetear')
                .setRequired(true))
].map(command => command.toJSON());

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
    console.log(`🤖 Bot listo y sincronizado como: ${client.user.tag}`);

    try {
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✅ Comando /resethwid registrado con éxito.');
    } catch (error) {
        console.error('❌ Error registrando comando:', error);
    }
});

// -------------------------------------------------------------
// 2. EJECUCIÓN DEL RESET DIRECTO EN MONTANAHUB-KEYS
// -------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'resethwid') {
        const targetKey = interaction.options.getString('key').trim();

        // Respuesta temporal mientras el bot contacta a montanahub-keys
        await interaction.deferReply();

        try {
            // Petición POST forzada hacia montanahub-keys.onrender.com
            const response = await fetch(`${MAIN_SERVER_URL}/reset-hwuid`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'User-Agent': 'MontanaHub-Discord-Bot'
                },
                body: JSON.stringify({
                    key: targetKey,
                    secret: ADMIN_SECRET
                })
            });

            const data = await response.json();

            // Si el servidor confirma el reset
            if (response.ok && data.success) {
                const embed = new EmbedBuilder()
                    .setTitle("🔄 HWUID Reiniciado con Éxito")
                    .setColor(0x00FF00)
                    .setDescription(`La key \`${targetKey}\` fue liberada exitosamente en **montanahub-keys.onrender.com**.`)
                    .addFields(
                        { name: "Estado:", value: "✅ HWUID limpiado. Lista para un nuevo dispositivo." }
                    )
                    .setFooter({ text: "Montana Hub System" });

                return interaction.editReply({ embeds: [embed] });
            } else {
                // Respuesta si la key no existe o hay error en el servidor principal
                return interaction.editReply({ 
                    content: `❌ **No se pudo resetear:** ${data.message || "La key no existe en montanahub-keys."}` 
                });
            }
        } catch (error) {
            console.error('Error al conectar con el servidor principal:', error);
            return interaction.editReply({ 
                content: `❌ **Error de conexión:** No se pudo contactar a \`${MAIN_SERVER_URL}\`. Verifica que el servidor principal esté activo.` 
            });
        }
    }
});

// Iniciar Bot
if (DISCORD_TOKEN) {
    client.login(DISCORD_TOKEN);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servicio puente de Discord en puerto ${PORT}`);
});
