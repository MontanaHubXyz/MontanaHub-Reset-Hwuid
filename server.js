const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');

const app = express();
app.use(express.json());

const DISCORD_TOKEN = process.env.DISCORD_TOKEN; 

// Base de datos de Keys en memoria
const keysDB = {};

// Función para generar texto aleatorio exacto (Letras mayúsculas y números)
function generarBloque(longitud) {
    const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let resultado = '';
    for (let i = 0; i < longitud; i++) {
        resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return resultado;
}

// -------------------------------------------------------------
// 1. RUTAS PARA TU SCRIPT DE ROBLOX
// -------------------------------------------------------------

// Ruta principal para iniciar sesión
app.post('/verify', (req, res) => {
    const { key, hwuid } = req.body;

    if (!key || !keysDB[key]) {
        return res.json({ valid: false, message: "❌ Key inexistente." });
    }

    const keyData = keysDB[key];

    // Verificar si le queda tiempo de juego
    if (keyData.timeLeft <= 0) {
        return res.json({ valid: false, message: "⏳ El tiempo de juego de esta key se ha agotado." });
    }

    // Lógica de Dispositivos (HWUID)
    if (!keyData.hwuid) {
        // Primer uso: Vinculamos la key a este celular
        keyData.hwuid = hwuid;
    } else if (keyData.hwuid !== hwuid) {
        // Intento de uso en otro dispositivo
        return res.json({ valid: false, message: "📱 HWUID incorrecto. Pide un Reset de HWID en Discord." });
    }

    return res.json({ valid: true, message: "✅ Acceso concedido.", timeLeft: keyData.timeLeft });
});

// Ruta de "Latido": El script de Roblox llamará aquí cada 1 minuto para descontar tiempo
app.post('/heartbeat', (req, res) => {
    const { key, hwuid } = req.body;

    if (keysDB[key] && keysDB[key].hwuid === hwuid) {
        if (keysDB[key].timeLeft > 0) {
            keysDB[key].timeLeft -= 1; // Resta 1 minuto de juego
            return res.json({ valid: true, timeLeft: keysDB[key].timeLeft });
        } else {
            return res.json({ valid: false, message: "Tiempo de juego agotado." });
        }
    }
    return res.status(403).json({ valid: false });
});

// -------------------------------------------------------------
// 2. COMANDOS DEL BOT EN DISCORD
// -------------------------------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName('genkey')
        .setDescription('Genera keys basadas en TIEMPO DE JUEGO (solo se gasta jugando).')
        .addIntegerOption(opt => opt.setName('cantidad').setDescription('¿Cuántas keys quieres crear?').setRequired(true))
        .addIntegerOption(opt => opt.setName('horas').setDescription('¿Cuántas horas de juego tendrá cada key?').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('resethwid')
        .setDescription('Libera la key para poder usarla en un nuevo dispositivo.')
        .addStringOption(opt => opt.setName('key').setDescription('Escribe la key a resetear').setRequired(true))
].map(command => command.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`🤖 Bot Activo: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Comandos Slash registrados.');
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // COMANDO /genkey
    if (interaction.commandName === 'genkey') {
        const cantidad = interaction.options.getInteger('cantidad');
        const horas = interaction.options.getInteger('horas');
        
        let generatedKeys = [];
        
        for(let i = 0; i < cantidad; i++) {
            // AQUI APLICAMOS TU NUEVO FORMATO: MNTHUB-XXXXX-XXXXX-XXXXXX
            const p1 = generarBloque(5);
            const p2 = generarBloque(5);
            const p3 = generarBloque(6);
            
            const newKey = `MNTHUB-${p1}-${p2}-${p3}`;
            
            // Guardamos el tiempo en minutos (horas * 60)
            keysDB[newKey] = {
                hwuid: null, // Listo para vincularse al primer dispositivo
                timeLeft: horas * 60 
            };
            generatedKeys.push(newKey);
        }

        const embed = new EmbedBuilder()
            .setTitle("🔑 Keys Generadas Exitosamente")
            .setColor(0x00FF00)
            .setDescription(`Se crearon **${cantidad}** keys.\nDuración activa: **${horas} horas** de juego c/u.\n\n\`\`\`\n${generatedKeys.join('\n')}\n\`\`\``)
            .setFooter({ text: "Montana Hub Security" });

        return interaction.reply({ embeds: [embed] });
    }

    // COMANDO /resethwid
    if (interaction.commandName === 'resethwid') {
        const targetKey = interaction.options.getString('key').trim();

        if (keysDB[targetKey]) {
            keysDB[targetKey].hwuid = null; // Borramos el rastro del celular anterior
            
            const embed = new EmbedBuilder()
                .setTitle("🔄 HWUID Reiniciado")
                .setColor(0x00FF00)
                .setDescription(`El dispositivo de la key \`${targetKey}\` fue eliminado. El usuario ya puede ponerla en su nuevo celular.`)
                .setFooter({ text: "Montana Hub Security" });
                
            return interaction.reply({ embeds: [embed] });
        } else {
            return interaction.reply({ content: `❌ La key \`${targetKey}\` no existe.`, ephemeral: true });
        }
    }
});

if (DISCORD_TOKEN) client.login(DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Montana Hub Server corriendo en puerto ${PORT}`));
