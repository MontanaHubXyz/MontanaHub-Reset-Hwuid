const express = require('express');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');

const app = express();
app.use(express.json());

// ==========================================
// 1. CONFIGURACIÓN Y VARIABLES DE ENTORNO
// ==========================================
// Necesitarás agregar MONGODB_URI en las variables de entorno de Render
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI; 

if (!MONGODB_URI) {
    console.error("⚠️ FATAL ERROR: Falta la variable MONGODB_URI. El servidor no puede guardar keys permanentemente.");
}

// ==========================================
// 2. CONEXIÓN A LA BASE DE DATOS (INMORTAL)
// ==========================================
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("🟢 Conectado a MongoDB Exitosamente. Las keys ahora son inmortales.");
}).catch((err) => {
    console.error("🔴 Error conectando a MongoDB:", err);
});

// Modelo de la Base de Datos para las Keys
const keySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    hwuid: { type: String, default: null },
    expiration: { type: Number, required: true } // -1 = Permanente, de lo contrario Timestamp Unix
});

const KeyModel = mongoose.model('Key', keySchema);

// Función para generar la estructura de la key
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

// ==========================================
// 3. ENDPOINTS PARA EL SCRIPT DE BLOCK SPIN
// ==========================================

app.post('/verify', async (req, res) => {
    try {
        const { key, hwuid } = req.body;

        if (!key || !hwuid) {
            return res.json({ valid: false, message: "❌ Faltan datos (Key o HWUID)." });
        }

        const keyData = await KeyModel.findOne({ key: key });

        if (!keyData) {
            return res.json({ valid: false, message: "❌ Key inválida o inexistente." });
        }

        const ahora = Math.floor(Date.now() / 1000);

        // Validación de Tiempo Real para Keys Temporales
        if (keyData.expiration !== -1 && ahora >= keyData.expiration) {
            return res.json({ valid: false, message: "⏳ El tiempo de juego de esta key se ha agotado." });
        }

        // Sistema HWUID estricto
        if (!keyData.hwuid || keyData.hwuid === "") {
            keyData.hwuid = hwuid; 
            await keyData.save(); // Se ancla al dispositivo permanentemente en la nube
        } else if (keyData.hwuid !== hwuid) {
            return res.json({ valid: false, message: "📱 HWUID incorrecto. Esta key está en otro dispositivo. Usa /resethwid." });
        }

        // Calcular tiempo restante
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

    } catch (error) {
        console.error("Error en /verify:", error);
        return res.json({ valid: false, message: "❌ Error interno del servidor." });
    }
});

app.post('/heartbeat', async (req, res) => {
    try {
        const { key, hwuid } = req.body;
        const keyData = await KeyModel.findOne({ key: key });

        if (!keyData || keyData.hwuid !== hwuid) {
            return res.json({ valid: false, message: "Sesión no autorizada o HWUID cambiado." });
        }

        const ahora = Math.floor(Date.now() / 1000);

        // Si es permanente (-1), sigue funcionando eternamente
        if (keyData.expiration === -1) {
            return res.json({ valid: true, timeLeft: -1 });
        }

        let timeLeft = keyData.expiration - ahora;

        if (timeLeft > 0) {
            return res.json({ valid: true, timeLeft: timeLeft });
        } else {
            return res.json({ valid: false, message: "Tiempo agotado." });
        }
    } catch (error) {
        return res.json({ valid: false });
    }
});

// ==========================================
// 4. BOT DE DISCORD Y COMANDOS SLASH
// ==========================================

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

    if (interaction.commandName === 'genkey') {
        const cantidad = interaction.options.getInteger('cantidad');
        const unidad = interaction.options.getString('unidad');
        const tiempo = interaction.options.getInteger('tiempo');
        
        let segundosASumar = 0;
        let textoDuracion = '';
        const ahora = Math.floor(Date.now() / 1000);

        if (unidad === 'permanente') {
            segundosASumar = -1;
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
        
        await interaction.deferReply(); // Evitar que Discord tire "La interacción falló" si demora

        try {
            for (let i = 0; i < cantidad; i++) {
                const nuevaKey = generarKeyFormateada();
                const expirationTimestamp = (segundosASumar === -1) ? -1 : (ahora + segundosASumar);

                // Guardar directamente en MongoDB
                await KeyModel.create({
                    key: nuevaKey,
                    hwuid: null,
                    expiration: expirationTimestamp
                });
                
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

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Error generando keys:", error);
            return interaction.editReply({ content: "❌ Ocurrió un error al generar las keys en la base de datos." });
        }
    }

    if (interaction.commandName === 'resethwid') {
        const targetKey = interaction.options.getString('key').trim();
        await interaction.deferReply();

        try {
            const keyData = await KeyModel.findOne({ key: targetKey });

            if (keyData) {
                keyData.hwuid = null;
                await keyData.save(); // Se limpia el dispositivo en MongoDB
                
                const embed = new EmbedBuilder()
                    .setTitle("🔄 HWUID Reiniciado con Éxito")
                    .setColor(0x0099FF)
                    .setDescription(`La key \`${targetKey}\` ya está libre de dispositivo y lista para usarse.`)
                    .setFooter({ text: "Montana Hub Security" });
                    
                return interaction.editReply({ embeds: [embed] });
            } else {
                return interaction.editReply({ content: `❌ La key \`${targetKey}\` no existe en la base de datos.` });
            }
        } catch (error) {
            return interaction.editReply({ content: "❌ Error de conexión con la base de datos al resetear el HWUID." });
        }
    }
});

if (DISCORD_TOKEN) {
    client.login(DISCORD_TOKEN).catch(err => console.error("Error conectando a Discord:", err));
}

// ==========================================
// 5. INICIAR EL SERVIDOR WEB
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor y Bot activos en el puerto ${PORT}`));

