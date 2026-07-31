const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');

const app = express();
app.use(express.json());

const DISCORD_TOKEN = process.env.DISCORD_TOKEN; 

// Base de datos de Keys en memoria
const keysDB = {};

// Función para generar texto aleatorio exacto
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

app.post('/verify', (req, res) => {
    const { key, hwuid } = req.body;

    if (!key || !keysDB[key]) {
        return res.json({ valid: false, message: "❌ Key inexistente." });
    }

    const keyData = keysDB[key];

    // Verificar si le queda tiempo de juego (Si es -1, es Permanente)
    if (keyData.timeLeft !== -1 && keyData.timeLeft <= 0) {
        return res.json({ valid: false, message: "⏳ El tiempo de juego de esta key se ha agotado." });
    }

    // Lógica de Dispositivos (HWUID)
    if (!keyData.hwuid) {
        keyData.hwuid = hwuid;
    } else if (keyData.hwuid !== hwuid) {
        return res.json({ valid: false, message: "📱 HWUID incorrecto. Pide un Reset de HWID en Discord." });
    }

    return res.json({ valid: true, message: "✅ Acceso concedido.", timeLeft: keyData.timeLeft });
});

// Ruta de "Latido": El script de Roblox descontará 60 segundos por latido
app.post('/heartbeat', (req, res) => {
    const { key, hwuid } = req.body;

    if (keysDB[key] && keysDB[key].hwuid === hwuid) {
        if (keysDB[key].timeLeft === -1) {
            // Es permanente, no descontamos nada
            return res.json({ valid: true, timeLeft: "Permanente" });
        }
        
        if (keysDB[key].timeLeft > 0) {
            keysDB[key].timeLeft -= 60; // Resta 60 segundos
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
        .setDescription('Genera keys para Montana Hub.')
        .addIntegerOption(opt => opt.setName('cantidad').setDescription('¿Cuántas keys quieres crear?').setRequired(true))
        .addStringOption(opt => 
            opt.setName('unidad')
                .setDescription('Elige el tipo de duración')
                .setRequired(true)
                .addChoices(
                    { name: 'Permanente', value: 'permanente' },
                    { name: 'Años', value: 'años' },
                    { name: 'Meses', value: 'meses' },
                    { name: 'Horas', value: 'horas' },
                    { name: 'Minutos', value: 'minutos' },
                    { name: 'Segundos', value: 'segundos' }
                ))
        .addIntegerOption(opt => opt.setName('tiempo').setDescription('¿Cuánto tiempo? (Pon 0 si elegiste Permanente)').setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('resethwid')
        .setDescription('Libera la key para usarla en un nuevo dispositivo.')
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

    if (interaction.commandName === 'genkey') {
        const cantidad = interaction.options.getInteger('cantidad');
        const unidad = interaction.options.getString('unidad');
        const tiempo = interaction.options.getInteger('tiempo');
        
        let tiempoSegundos = 0;
        let displayTiempo = '';

        // Convertir la opción a segundos reales
        if (unidad === 'permanente') {
            tiempoSegundos = -1; // -1 significa infinito/permanente
            displayTiempo = 'Permanente ∞';
        } else if (unidad === 'años') {
            tiempoSegundos = tiempo * 31536000;
            displayTiempo = `${tiempo} Año(s)`;
        } else if (unidad === 'meses') {
            tiempoSegundos = tiempo * 2592000;
            displayTiempo = `${tiempo} Mes(es)`;
        } else if (unidad === 'horas') {
            tiempoSegundos = tiempo * 3600;
            displayTiempo = `${tiempo} Hora(s)`;
        } else if (unidad === 'minutos') {
            tiempoSegundos = tiempo * 60;
            displayTiempo = `${tiempo} Minuto(s)`;
        } else if (unidad === 'segundos') {
            tiempoSegundos = tiempo;
            displayTiempo = `${tiempo} Segundo(s)`;
        }
        
        let generatedKeys = [];
        
        for(let i = 0; i < cantidad; i++) {
            const p1 = generarBloque(5);
            const p2 = generarBloque(5);
            const p3 = generarBloque(6);
            
            const newKey = `MNTHUB-${p1}-${p2}-${p3}`;
            
            keysDB[newKey] = {
                hwuid: null,
                timeLeft: tiempoSegundos 
            };
            generatedKeys.push(newKey);
        }

        const embed = new EmbedBuilder()
            .setTitle("🔑 Keys Generadas Exitosamente")
            .setColor(0x00FF00)
            .setDescription(`Se crearon **${cantidad}** keys.\nDuración de juego: **${displayTiempo}**\n\n\`\`\`\n${generatedKeys.join('\n')}\n\`\`\``)
            .setFooter({ text: "Montana Hub Security" });

        return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'resethwid') {
        const targetKey = interaction.options.getString('key').trim();

        if (keysDB[targetKey]) {
            keysDB[targetKey].hwuid = null;
            
            const embed = new EmbedBuilder()
                .setTitle("🔄 HWUID Reiniciado")
                .setColor(0x00FF00)
                .setDescription(`El dispositivo de la key \`${targetKey}\` fue eliminado.`)
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
