import { 
  Client, GatewayIntentBits, Partials,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, InteractionType
} from 'discord.js';
import fs from 'fs/promises';

// IDs de canales (reemplaza con los tuyos)
const canales = {
  armas: '1382411031313125436',
  drogas: '1382411060232847530',
  fondos: '1382411093988872253',
  resumenGeneral: '1382353681365864549'
};

// Colores y emojis por tipo
const colores = {
  armas: 0x00d0fe,  // azul
  drogas: 0xff0000, // rojo
  fondos: 0x000000  // negro
};
const iconos = {
  armas: '🔫',
  drogas: '💊',
  fondos: '💰'
};

const ubicaciones = ['Bodega', 'Tiendita', 'Oficina', 'Calle', 'Guarida'];
const recursosPorCanal = {
  armas: ['Vitage', 'Walter', 'AK47', 'Colt'],
  drogas: ['Meta', 'Maria', 'Coca', 'Heroina'],
  fondos: ['Dinero Blanco 💵', 'Dinero Negro 🧳']
};

// Leer stock JSON o crear vacío
async function leerStock(tipo) {
  try {
    const data = await fs.readFile(`./${tipo}.json`, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// Guardar stock JSON
async function guardarStock(tipo, data) {
  await fs.writeFile(`./${tipo}.json`, JSON.stringify(data, null, 2));
}

// Crear embed resumen para un canal (sin filtro)
function crearEmbedResumen(tipo, stock) {
  const color = colores[tipo];
  const icono = iconos[tipo];

  const embed = new EmbedBuilder()
    .setTitle(`${icono} Resumen de Stock: ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`)
    .setColor(color)
    .setFooter({ text: `Última actualización: ${new Date().toLocaleString()}` });

  let descripcion = '';
  if (Object.keys(stock).length === 0) {
    descripcion = 'No hay stock registrado.';
  } else {
    for (const recurso of Object.keys(stock)) {
      descripcion += `\n────────────────────────\n**${recurso}**\n`;
      for (const ubic of Object.keys(stock[recurso])) {
        descripcion += `• ${ubic}: **${stock[recurso][ubic]}**\n`;
      }
    }
  }
  embed.setDescription(descripcion.trim());
  return embed;
}

// Crear embed resumen general (sumando todo)
async function crearEmbedResumenGeneral() {
  const embed = new EmbedBuilder()
    .setTitle('📊 Resumen General de Stock')
    .setColor(0x00d0fe)
    .setFooter({ text: `Última actualización: ${new Date().toLocaleString()}` });

  let descripcion = '';
  for (const tipo of ['armas', 'drogas', 'fondos']) {
    const stock = await leerStock(tipo);
    const icono = iconos[tipo];
    descripcion += `\n${icono} **${tipo.charAt(0).toUpperCase() + tipo.slice(1)}**\n`;

    if (Object.keys(stock).length === 0) {
      descripcion += 'No hay stock.\n';
    } else {
      for (const recurso of Object.keys(stock)) {
        for (const ubic of Object.keys(stock[recurso])) {
          descripcion += `• ${recurso} - ${ubic}: **${stock[recurso][ubic]}**\n`;
        }
      }
    }
    descripcion += '\n────────────────────────\n';
  }

  embed.setDescription(descripcion.trim());
  return embed;
}

// Crear fila de botón para registro
function crearFilaBoton(tipo) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`registrar_${tipo}`)
        .setLabel('Registrar Movimiento')
        .setStyle(ButtonStyle.Primary)
        .setEmoji(iconos[tipo])
    );
}

// Enviar o actualizar mensaje resumen y botón en canal específico
async function enviarOActualizarResumen(client, tipo) {
  const canalId = canales[tipo];
  const canal = await client.channels.fetch(canalId);
  if (!canal || !canal.isTextBased()) return;

  // Leer mensajes fijados para buscar mensaje resumen (puede ajustar si usas otro método)
  const mensajes = await canal.messages.fetch({ limit: 50 });
  // Buscar mensaje con embed de resumen y botón personalizado
  let mensajeResumen = mensajes.find(m =>
    m.author.id === client.user.id &&
    m.components.length > 0 &&
    m.components[0].components.some(btn => btn.customId === `registrar_${tipo}`)
  );

  const stock = await leerStock(tipo);
  const embed = crearEmbedResumen(tipo, stock);
  const filaBoton = crearFilaBoton(tipo);

  if (mensajeResumen) {
    await mensajeResumen.edit({ embeds: [embed], components: [filaBoton] });
  } else {
    // Enviar nuevo mensaje al canal y fijarlo para que quede arriba
    mensajeResumen = await canal.send({ embeds: [embed], components: [filaBoton] });
    await mensajeResumen.pin().catch(() => {});
  }
}

// Enviar o actualizar resumen general
async function enviarOActualizarResumenGeneral(client) {
  const canalId = canales.resumenGeneral;
  const canal = await client.channels.fetch(canalId);
  if (!canal || !canal.isTextBased()) return;

  const mensajes = await canal.messages.fetch({ limit: 50 });
  let mensajeResumen = mensajes.find(m =>
    m.author.id === client.user.id &&
    m.embeds.length > 0 &&
    m.embeds[0].title?.startsWith('📊 Resumen General de Stock')
  );

  const embed = await crearEmbedResumenGeneral();

  if (mensajeResumen) {
    await mensajeResumen.edit({ embeds: [embed] });
  } else {
    mensajeResumen = await canal.send({ embeds: [embed] });
    await mensajeResumen.pin().catch(() => {});
  }
}

// Crear modal para registrar movimiento
function crearModalRegistrar(tipo) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_registrar_${tipo}`)
    .setTitle(`Registrar Movimiento (${tipo.charAt(0).toUpperCase() + tipo.slice(1)})`);

  // Input tipo movimiento
  const tipoMovimientoInput = new TextInputBuilder()
    .setCustomId('tipoMovimiento')
    .setLabel('Tipo de Movimiento (Entrada/Salida)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Ejemplo: Entrada o Salida')
    .setRequired(true);

  // Input recurso - para armas y drogas con lista fija (podrías hacer select en versión avanzada)
  const recursoInput = new TextInputBuilder()
    .setCustomId('recurso')
    .setLabel('Recurso')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`Ej: ${recursosPorCanal[tipo].join(', ')}`)
    .setRequired(true);

  // Input cantidad
  const cantidadInput = new TextInputBuilder()
    .setCustomId('cantidad')
    .setLabel('Cantidad')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Número entero')
    .setRequired(true);

  // Input ubicación (podrías validar luego con lista)
  const ubicacionInput = new TextInputBuilder()
    .setCustomId('ubicacion')
    .setLabel('Ubicación')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`Ej: ${ubicaciones.join(', ')}`)
    .setRequired(false);

  // Input detalle (opcional)
  const detalleInput = new TextInputBuilder()
    .setCustomId('detalle')
    .setLabel('Detalle (opcional)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Detalles adicionales')
    .setRequired(false);

  // Agregar inputs al modal (máximo 5 inputs en total)
  modal.addComponents(
    new ActionRowBuilder().addComponents(tipoMovimientoInput),
    new ActionRowBuilder().addComponents(recursoInput),
    new ActionRowBuilder().addComponents(cantidadInput),
    new ActionRowBuilder().addComponents(ubicacionInput),
    new ActionRowBuilder().addComponents(detalleInput),
  );

  return modal;
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once('ready', async () => {
  console.log('Bot listo!');

  // Enviar/actualizar mensajes resumen y botones en canales
  await enviarOActualizarResumen(client, 'armas');
  await enviarOActualizarResumen(client, 'drogas');
  await enviarOActualizarResumen(client, 'fondos');
  await enviarOActualizarResumenGeneral(client);

  // Registrar comando /resumen-stock (solo en la primera guild)
  const data = new SlashCommandBuilder()
    .setName('resumen-stock')
    .setDescription('Mostrar resumen de stock con filtros')
    .addStringOption(option =>
      option.setName('tipo')
        .setDescription('Tipo de stock')
        .setRequired(false)
        .addChoices(
          { name: 'Armas', value: 'armas' },
          { name: 'Drogas', value: 'drogas' },
          { name: 'Fondos', value: 'fondos' },
          { name: 'General', value: 'general' },
        ))
    .addStringOption(option =>
      option.setName('ubicacion')
        .setDescription('Filtrar por ubicación')
        .setRequired(false)
        .addChoices(...ubicaciones.map(u => ({ name: u, value: u }))))
    .addStringOption(option =>
      option.setName('recurso')
        .setDescription('Filtrar por recurso (nombre exacto)')
        .setRequired(false));

  const guild = client.guilds.cache.first();
  if (guild) {
    await guild.commands.create(data);
    console.log('Comando /resumen-stock registrado');
  }
});

// Manejar interacciones de botón y modal
client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    // Botón registrar movimiento
    const customId = interaction.customId;
    if (customId.startsWith('registrar_')) {
      const tipo = customId.split('_')[1];
      const modal = crearModalRegistrar(tipo);
      await interaction.showModal(modal);
    }
  } else if (interaction.type === InteractionType.ModalSubmit) {
    // Procesar modal de registro
    const customId = interaction.customId;
    if (customId.startsWith('modal_registrar_')) {
      const tipo = customId.split('_')[2];

      const tipoMovimiento = interaction.fields.getTextInputValue('tipoMovimiento').toLowerCase();
      const recurso = interaction.fields.getTextInputValue('recurso');
      const cantidad = parseInt(interaction.fields.getTextInputValue('cantidad'), 10);
      const ubicacion = interaction.fields.getTextInputValue('ubicacion') || 'Sin especificar';
      const detalle = interaction.fields.getTextInputValue('detalle') || '';

      // Validar entrada
      if (!['entrada', 'salida'].includes(tipoMovimiento)) {
        return interaction.reply({ content: 'Tipo de movimiento debe ser "Entrada" o "Salida".', ephemeral: true });
      }
      if (isNaN(cantidad) || cantidad <= 0) {
        return interaction.reply({ content: 'Cantidad debe ser un número positivo.', ephemeral: true });
      }

      // Leer stock actual
      const stock = await leerStock(tipo);

      // Inicializar estructura si no existe
      if (!stock[recurso]) stock[recurso] = {};
      if (!stock[recurso][ubicacion]) stock[recurso][ubicacion] = 0;

      // Actualizar cantidad según tipo movimiento
      if (tipoMovimiento === 'entrada') {
        stock[recurso][ubicacion] += cantidad;
      } else {
        stock[recurso][ubicacion] = Math.max(0, stock[recurso][ubicacion] - cantidad);
      }

      // Guardar stock actualizado
      await guardarStock(tipo, stock);

      // Actualizar mensaje resumen en canal y resumen general
      await enviarOActualizarResumen(client, tipo);
      await enviarOActualizarResumenGeneral(client);

      // Confirmación al usuario
      await interaction.reply({
        content: `${iconos[tipo]} Movimiento registrado: **${tipoMovimiento.toUpperCase()}** ${cantidad} de **${recurso}** en **${ubicacion}**.${detalle ? ` Detalle: ${detalle}` : ''}`,
        ephemeral: true
      });
    }
  } else if (interaction.isCommand()) {
    // Comando /resumen-stock
    if (interaction.commandName === 'resumen-stock') {
      await interaction.deferReply();

      const tipo = interaction.options.getString('tipo') || 'general';
      const ubicacion = interaction.options.getString('ubicacion') || null;
      const recurso = interaction.options.getString('recurso') || null;

      try {
        let embed;
        if (tipo === 'general') {
          embed = await crearEmbedResumenGeneral(ubicacion, recurso);
        } else if (['armas', 'drogas', 'fondos'].includes(tipo)) {
          const stock = await leerStock(tipo);
          embed = crearEmbedResumen(tipo, stock, ubicacion, recurso);
        } else {
          embed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('Tipo no válido')
            .setColor(0xff0000);
        }

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error(error);
        await interaction.editReply({ content: 'Ocurrió un error al generar el resumen.', ephemeral: true });
      }
    }
  }
});

client.login(TOKEN);
