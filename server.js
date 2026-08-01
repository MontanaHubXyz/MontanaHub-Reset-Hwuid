const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');

const app = express();
app.use(express.json());

const DISCORD_TOKEN = process.env.DISCORD_TOKEN; 

// Base de datos de Keys en memoria RAM (Estructura optimizada con marca de tiempo real)
const keysDB = {};

// Función segura para generar el formato: MNTHUB-EF893-JE473-IW9826
function generarKeyFormateada() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randomBlock = (len) => {
        let res = '';
        for (let i = 0; i < len; i++) {
            res += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return res;
    };

    return `MNTHUB-${randomBlock(5)}-${randomBlock(5)}-${randomBlock(6)}`;
}

// -------------------------------------------------------------
// 1. ENDPOINTS PARA EL SCRIPT DE ROBLOX (BLOCK SPIN)
// -------------------------------------------------------------

// Verificar la key y vincular el HWUID la primera vez con tiempo real
app.post('/verify', (req, res) => {
    const { key, hwuid } = req.body;

    if (!key || !keysDB[key]) {
        return res.json({ valid: false, message: "❌ Key inválida o inexistente." });
    }

    const keyData = keysDB[key];
    const ahora = Math.floor(Date.now() / 1000); // Tiempo actual en segundos Unix

    // Validación de Tiempo Real (Si no es permanente y ya pasó la fecha de expiración)
    if (keyData.expiration !== -1 && ahora >= keyData.expiration) {
        return res.json({ valid: false, message: "⏳ El tiempo de juego de esta key se ha agotado." });
    }

    // Control de Dispositivo (HWUID)
    if (!keyData.hwuid) {
        keyData.hwuid = hwuid; // Primer uso, se ancla al dispositivo del usuario (Samsung A17)
    } else if (keyData.hwuid !== hwuid) {
        return res.json({ valid: false, message: "📱 HWUID incorrecto. Esta key está registrada en otro dispositivo. Usa /resethwid en Discord." });
    }

    // Calcular segundos exactos restantes para enviárselos al script de Roblox
    let tiempoRestante = -1;
    if (keyData.expiration !== -1) {
        tiempoRestante = keyData.expiration - ahora;
        if (tiempoRestante < 0) tiempoRestante = 0;
    }

    return res.json({ 
        valid: true, 
        message: "✅ Acceso concedido a Montana Hub.", 
        timeLeft: tiempoRestante 
    });
});

// Latido (Heartbeat): Comprueba en tiempo real si la key sigue vigente sin alterar contadores falsos
app.post('/heartbeat', (req, res) => {
    const { key, hwuid } = req.body;

    if (!keysDB[key] || keysDB[key].hwuid !== hwuid) {
        return res.status(403).json({ valid: false, message: "Sesión no autorizada o HWUID cambiado." });
    }

    const keyData = keysDB[key];
    const ahora = Math.floor(Date.now() / 1000);

    // Si es permanente, responde de inmediato sin caducar nunca
    if (keyData.expiration === -1) {
        return res.json({ valid: true, timeLeft: -1 });
    }

    // Calcular tiempo restante real restando la hora actual del servidor
    let timeLeft = keyData.expiration - ahora;

    if (timeLeft > 0) {
        return res.json({ valid: true, timeLeft: timeLeft });
    } else {
        return res.json({ valid: false, message: "Tiempo agotado." });
    }
});

// -------------------------------------------------------------
// 2. COMANDOS SLASH DE DISCORD
// -------------------------------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName('genkey')
        .setDescription('Genera keys personalizadas para Montana Hub.')
        .addIntegerOption(opt => 
            opt.setName('cantidad')
               .setDescription('Cantidad de keys a crear')
               .setRequired(true))
        .addStringOption(opt => 
            opt.setName('unidad')
               .setDescription('Selecciona la unidad de tiempo')
               .setRequired(true)
               .addChoices(
                   { name: 'Permanente (Infinito)', value: 'permanente' },
                   { name: 'Años', value: 'anos' },
                   { name: 'Meses', value: 'meses' },
                   { name: 'Horas', value: 'horas' },
                   { name: 'Minutos', value: 'minutos' },
                   { name: 'Segundos', value: 'segundos' }
               ))
        .addIntegerOption(opt => 
            opt.setName('tiempo')
               .setDescription('Cantidad de tiempo (Pon 0 si elegiste Permanente)')
               .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('resethwid')
        .setDescription('Limpia el HWUID de una key para usarla en otro dispositivo.')
        .addStringOption(opt => 
            opt.setName('key')
               .setDescription('Escribe la key completa a resetear')
               .setRequired(true))
].map(command => command.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`🤖 Bot encendido correctamente como: ${client.user.tag}`);
    try {
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Comandos Slash actualizados y registrados con éxito.');
    } catch (error) {
        console.error('❌ Error al registrar comandos:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // COMANDO /genkey
    if (interaction.commandName === 'genkey') {
        const cantidad = interaction.options.getInteger('cantidad');
        const unidad = interaction.options.getString('unidad');
        const tiempo = interaction.options.getInteger('tiempo');
        
        let segundosASumar = 0;
        let textoDuracion = '';
        const ahora = Math.floor(Date.now() / 1000);

        if (unidad === 'permanente') {
            segundosASumar = -1; // -1 indica infinito real
            textoDuracion = '♾️ Permanente';
        } else if (unidad === 'anos') {
            segundosASumar = tiempo * 31536000;
            textoDuracion = `${tiempo} Año(s)`;
        } else if (unidad === 'meses') {
            segundosASumar = tiempo * 2592000;
            textoDuracion = `${tiempo} Mes(es)`;
        } else if (unidad === 'horas') {
            segundosASumar = tiempo * 3600;
            textoDuracion = `${tiempo} Hora(s)`;
        } else if (unidad === 'minutos') {
            segundosASumar = tiempo * 60;
            textoDuracion = `${tiempo} Minuto(s)`;
        } else if (unidad === 'segundos') {
            segundosASumar = tiempo;
            textoDuracion = `${tiempo} Segundo(s)`;
        }
        
        let listaKeys = [];
        
        for (let i = 0; i < cantidad; i++) {
            const nuevaKey = generarKeyFormateada();
            
            // Calculamos la fecha exacta de expiración sumándole los segundos a la hora actual de Unix
            const expirationTimestamp = (segundosASumar === -1) ? -1 : (ahora + segundosASumar);

            keysDB[nuevaKey] = {
                hwuid: null,
                expiration: expirationTimestamp // ¡Guardamos el sello de tiempo real absoluto!
            };
            listaKeys.push(nuevaKey);
        }

        const keysFormateadasParaCopiar = listaKeys.map(k => `\`${k}\``).join('\n');

        const embed = new EmbedBuilder()
            .setTitle("🔑 Generador de Keys - Montana Hub")
            .setColor(0x00FF00)
            .addFields(
                { name: "📊 Cantidad:", value: `${cantidad}`, inline: true },
                { name: "⏳ Duración de Juego:", value: textoDuracion, inline: true },
                { name: "📋 Keys Generadas (Toca para copiar):", value: keysFormateadasParaCopiar }
            )
            .setFooter({ text: "Montana Hub Security System" });

        return interaction.reply({ embeds: [embed] });
    }

    // COMANDO /resethwid
    if (interaction.commandName === 'resethwid') {
        const targetKey = interaction.options.getString('key').trim();

        if (keysDB[targetKey]) {
            keysDB[targetKey].hwuid = null; // Reiniciamos el HWUID para liberar la key
            
            const embed = new EmbedBuilder()
                .setTitle("🔄 HWUID Reiniciado con Éxito")
                .setColor(0x0099FF)
                .setDescription(`La key \`${targetKey}\` ya está libre de dispositivo y lista para usarse en uno nuevo.`)
                .setFooter({ text: "Montana Hub Security" });
                
            return interaction.reply({ embeds: [embed] });
        } else {
            return interaction.reply({ 
                content: `❌ La key \`${targetKey}\` no existe en la base de datos. Revisa que esté bien escrita.`, 
                ephemeral: true 
            });
        }
    }
});

if (DISCORD_TOKEN) client.login(DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor y Bot activos en el puerto ${PORT}`));

