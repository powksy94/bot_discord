import dotenv from 'dotenv';
import { Client, GatewayIntentBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, Events } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus } from '@discordjs/voice';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config(); // Charge le fichier .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("❌ Le token Discord (DISCORD_TOKEN) est manquant. Vérifie ton .env ou les variables Railway.");
  process.exit(1); // stoppe l'application
}


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, // Nécessaire pour accéder aux membres
    GatewayIntentBits.GuildVoiceStates, // Ajout pour le vocal
  ],
});

let citations = [];

// Fonction pour charger les citations
async function loadCitations() {
  try {
    const guild = client.guilds.cache.first(); // On suppose qu'il n'y a qu'un seul serveur

    if (!guild) {
      console.error("❌ Aucune guilde trouvée !");
      return;
    }

    const category = guild.channels.cache.find(ch => ch.type === ChannelType.GuildCategory && ch.name === 'La Tour');
    if (!category) {
      console.error("❌ La catégorie 'La Tour' n'a pas été trouvée !");
      return;
    }

    const channel = guild.channels.cache.find(ch => ch.type === ChannelType.GuildText && ch.parentId === category.id && ch.name === 'citations');
    if (!channel) {
      console.error("❌ Le canal 'citations' n'a pas été trouvé dans la catégorie 'La Tour' !");
      return;
    }

    const messages = await channel.messages.fetch({ limit: 100 });
    messages.forEach(msg => {
      const [auteur, ...citationParts] = msg.content.split(':');
      const citation = citationParts.join(':').trim();
      if (auteur && citation) {
        citations.push({ auteur: auteur.trim(), citation });
      }
    });

    console.log(`✅ ${citations.length} citation(s) chargée(s) depuis #citations.`);
  } catch (error) {
    console.error("Erreur lors du chargement des citations : ", error);
  }
}

let soundFiles = []; // Variable globale pour stocker la liste des fichiers sons



// Fonction pour recharger la liste des sons
async function handleSoundsCommand() {
  const soundsDir = path.join(__dirname, 'sounds');

  if (!fs.existsSync(soundsDir)) {
    return 'Le dossier des sons n\'existe pas.';
  }

  const files = fs.readdirSync(soundsDir).filter(file => file.endsWith('.ogg'));
  if (files.length === 0) {
    return 'Aucun son .ogg disponible.';
  }

  // Mise à jour de la variable globale
  soundFiles = files.map(file => ({
    label: file.replace('.ogg', ''),
    value: file.replace('.ogg', '')
  }));

  return `${files.length} son(s) rechargé(s).`;
}

// Commande pour recharger la liste des sons
client.on('messageCreate', async (message) => {
  if (message.content === '!reload_sounds') {
    const result = await handleSoundsCommand();
    message.reply(result);  // Retourne une réponse indiquant si les sons ont été rechargés
  }
});


// Gérer les interactions pour jouer des sons ou des citations
client.on(Events.InteractionCreate, async (interaction) => {


  if (interaction.customId === 'select-sound') {
    const soundName = interaction.values[0];
    const soundPath = path.join(__dirname, 'sounds', `${soundName}.ogg`);

    const member = interaction.guild.members.cache.get(interaction.user.id);
    const voiceChannel = member?.voice.channel;

    if (!voiceChannel) {
      await interaction.reply({ content: 'Tu dois être dans un salon vocal.', ephemeral: true });
      return;
    }

    if (!fs.existsSync(soundPath)) {
      await interaction.reply({ content: 'Son introuvable.', ephemeral: true });
      return;
    }

    try {
      const connection = joinVoiceChannel({
        channelId: interaction.member.voice.channel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      const resource = createAudioResource(soundPath);
      const player = createAudioPlayer();
      // On rejoint le salon vocal de l'utilisateur

      connection.subscribe(player);
      player.play(resource);

      player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
      });

      await interaction.reply({ content: `▶️ Lecture de **${soundName}**`, ephemeral: false });
    } catch (error) {
      console.error(error);
      interaction.reply({ content: 'Erreur lors de la lecture.', ephemeral: true });
      connection.destroy();
    }

    // Exemple d'ajout de volume via commande
    if (interaction.customId === 'select-volume') {
      const volume = interaction.values[0]; // Par exemple, 0.5, 1, 2
      if (isNaN(volume)) {
        await interaction.reply({ content: 'Volume invalide.', ephemeral: true });
        return;
      }
      // Applique le volume sélectionné à la lecture du son
      playSound(interaction, soundName, volume); // Fonction playSound modifiée pour accepter le volume
    }


  }
})

// Fonction pour récupérer tous les membres ayant le rôle "Zen" (en ligne ou non)
async function getAllZenMembers(message) {
  try {
    const roleZen = message.guild.roles.cache.find(role => role.name === "Zen");

    if (!roleZen) {
      console.error("❌ Le rôle 'Zen' est introuvable.");
      return [];
    }

    // On s'assure que tous les membres sont bien récupérés
    await message.guild.members.fetch();

    // Filtrer les membres du rôle Zen (en excluant les bots)
    const zenMembers = roleZen.members.filter(member => !member.user.bot);

    console.log(`✅ ${zenMembers.size} membre(s) ont le rôle 'Zen'.`);

    return zenMembers;
  } catch (error) {
    console.error("❌ Erreur lors de la récupération des membres Zen :", error);
    return [];
  }
}
// Fonction pour gérer les commandes
async function handleCommands(message) {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  switch (content) {
    case '!': {
      const commandMenu = new StringSelectMenuBuilder()
        .setCustomId('command_menu')
        .setPlaceholder('Choisissez une commande')
        .addOptions([
          { label: '!Bonjour', value: 'bonjour', description: 'Dire bonjour' },
          { label: '!Aide', value: 'aide', description: 'Voir les commandes disponibles' },
          { label: '!citation', value: 'citation', description: 'Obtenir une citation' },
          { label: '!Météo', value: 'meteo', description: 'Le fameux Meteo' },
          { label: '!Zen', value: 'zen', description: 'Voir les membres Zen' },
          { label: '!Messi', value: 'messi', description: 'Un message légendaire' },
          { label: '!sounds', value: 'sounds', description: 'de magnifiques sons' },
        ]);

      const commandRow = new ActionRowBuilder().addComponents(commandMenu);
      await message.channel.send({ content: 'Voici les commandes disponibles :', components: [commandRow] });
      return;
    }
  }
}

// Fonction pour gérer les interactions
async function handleInteraction(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const selected = interaction.values[0];

  if (interaction.customId === 'command_menu') {
    switch (selected) {
      case 'bonjour':
        await interaction.reply('Bonjour ! Je suis ton bot.');
        break;
      case 'aide':
        await interaction.reply('Voici les commandes disponibles : `!bonjour`, `!aide`, `!citation [auteur]`, `!Meteo`, `!Zen`');
        break;
      case 'messi':
        await interaction.reply('Shreuuu est LE Messi, Notre Messi');
        break;
      case 'zen':
        await interaction.reply('Voici les membres Zen...');
        break;
      case 'sounds': {
        await interaction.deferReply();
        await handleSoundsCommand();

        if (soundFiles.length === 0) {
          return message.reply('Aucun son disponible.');
        }

        const options = soundFiles.slice(0, 25); // Limite à 25 sons

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select-sound')
          .setPlaceholder('Choisis un son à jouer')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.editReply({
          content: '🎵 Sélectionne un son à jouer :',
          components: [row]
        });
        break;
      }
      case 'meteo': {
        const zenMembers = await getAllZenMembers(interaction);

        if (zenMembers.size === 0) {
          await interaction.reply("Aucun membre avec le rôle Zen trouvé.");
          return;
        }

        const options = Array.from(zenMembers.values()).map(member => ({
          label: member.user.username,
          value: member.id,
          description: `Utilisateur : ${member.user.tag}`,
          emoji: '🧘‍♂️',
        })).slice(0, 25);

        const zenMenu = new StringSelectMenuBuilder()
          .setCustomId('select_pseudo')
          .setPlaceholder('Choisissez un membre Zen')
          .addOptions(options);

        const zenRow = new ActionRowBuilder().addComponents(zenMenu);

        await interaction.reply({
          content: 'Veuillez sélectionner un membre Zen :',
          components: [zenRow],
        });

        break;
      }
      case 'citation': {
        const options = citations.map((citation, index) => ({
          label: `Citation de ${citation.auteur}`,
          description: citation.citation.slice(0, 50) + '...',
          value: index.toString(),
        }));

        const citationMenu = new StringSelectMenuBuilder()
          .setCustomId('menu_citations')
          .setPlaceholder('Choisis une citation')
          .addOptions(options);

        const citationRow = new ActionRowBuilder().addComponents(citationMenu);

        await interaction.reply({ content: 'Sélectionne une citation :', components: [citationRow] });
        break;
      }
      default:
        await interaction.reply("Commande non reconnue.");
        break;
    }
  }

  if (interaction.customId === 'select_pseudo') {
    const selectedMemberId = interaction.values[0];
    const selectedMember = await interaction.guild.members.fetch(selectedMemberId);

    await interaction.reply({
      content: `Météo : ${selectedMember.user.tag} ?\n${selectedMember.user.tag} : Oui Météo ?\nMétéo : Non rien 😉`,
    });
  }

  if (interaction.customId === 'menu_citations') {
    const selected = parseInt(interaction.values[0], 10);
    const citation = citations[selected];
    await interaction.reply({
      content: `${citation.auteur} a dit : "${citation.citation}"`,
    });
  }
}

// Fonction d'initialisation
client.once('ready', async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  await loadCitations();
  await handleSoundsCommand();
})

const axios = require('axios');
const cheerio = require('cheerio');

const axios = require('axios');
const cheerio = require('cheerio');

setTimeout(async () => {
  try {
    const channel = await client.channels.fetch('1331717378181959743');
    if (!channel || !channel.isTextBased()) {
      console.error('Le salon spécifié est introuvable ou invalide.');
      return;
    }

    const now = new Date();
    const url = 'https://www.todayindestiny.com/';
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const element = $('.eventCardHeaderSet');

    // Fonction d'envoi selon le donjon détecté
    const sendDungeonMessage = async (type) => {
      if (type === 'prophecy') {
        await channel.send('♾️ Le donjon prophétie est maintenant disponible en mode contest \nVenez tenter votre lumière aux confins du royaume des Neufs');
        await channel.send({
          content: "Voici l'image de la prophétie :",
          files: ['./images/Prophecy_destiny.jpg']
        });
      } else if (type === 'ghost_of_the_deep') {
        await channel.send('🥽 Le donjon fantômes des profondeurs est maintenant disponible en mode contest. \nVenez vous aventurer dans les profondeurs de titan afin de déceler ses mystères');
        await channel.send({
          content: "Voici une autre image :",
          files: ['./images/Ghost_of_the_deep.jpg']
        });
      } else {
        await channel.send('⚠️ Aucun donjon reconnu actuellement en contest.');
      }
    };

    // Dates spécifiques
    if (
      now.getFullYear() === 2025 &&
      now.getMonth() === 4 &&
      now.getDate() === 13 &&
      now.getHours() === 19
    ) {
      if (element.hasClass('prophecy')) {
        await sendDungeonMessage('prophecy');
      } else {
        await sendDungeonMessage('ghost_of_the_deep');
      }

    } else if (
      now.getFullYear() === 2025 &&
      now.getMonth() === 4 &&
      now.getDate() === 20 &&
      now.getHours() === 19
    ) {
      if (element.hasClass('ghost_of_the_deep')) {
        await sendDungeonMessage('ghost_of_the_deep');
      } else {
        await sendDungeonMessage('prophecy');
      }

    } else {
      // Pour toutes les autres dates
      if (element.hasClass('prophecy')) {
        await sendDungeonMessage('prophecy');
      } else if (element.hasClass('ghost_of_the_deep')) {
        await sendDungeonMessage('ghost_of_the_deep');
      } else {
        await sendDungeonMessage('none');
      }
    }

  } catch (error) {
    console.error("Erreur lors de l'exécution du message dans le salon :", error);
  }
}, 5000); // Exécution différée de 5 secondes


// Event listeners
client.on('messageCreate', handleCommands);
client.on(Events.InteractionCreate, handleInteraction);
client.login(token);
