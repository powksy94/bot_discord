import dotenv from 'dotenv';
import { Client, GatewayIntentBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, Events } from 'discord.js';
dotenv.config(); // Charge le fichier .env

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("❌ Le token Discord est manquant. Vérifie ton fichier .env !");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, // Nécessaire pour accéder aux membres
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

  switch (message.content.toLowerCase()) {
    case '!bonjour':
      await message.channel.send('Bonjour ! Je suis ton bot.');
      break;
    case '!aide':
      await message.channel.send('Voici les commandes disponibles : `!bonjour`, `!aide`, `!citation [auteur]`, `!Meteo`, `!Zen`');
      break;
    case '!messi':
      await message.channel.send('Shreuuu est LE Messi, Notre Messi');
      break;
    case '!zen':
      await message.channel.send('Voici les membres Zen...');
      break;
      case '!meteo': {
        const zenMembers = await getAllZenMembers(message);
      
        // Vérifie qu'il y a des membres à proposer
        if (zenMembers.size === 0) {
          message.channel.send("Aucun membre avec le rôle Zen trouvé.");
          return;
        }
      
        const options = Array.from(zenMembers.values()).map(member => ({
          label: member.user.username,
          value: member.id,
          description: `Utilisateur : ${member.user.tag}`,
          emoji: '🧘‍♂️',
        })).slice(0, 25); // Discord limite à 25 options
      
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select_pseudo')
          .setPlaceholder('Choisissez un membre Zen')
          .addOptions(options);
      
        const row = new ActionRowBuilder().addComponents(selectMenu);
      
        message.channel.send({
          content: 'Veuillez sélectionner un membre Zen :',
          components: [row],
        });
      
        break;
      }
      
    case '!citation':
      const options = citations.map((citation, index) => ({
        label: `Citation de ${citation.auteur}`,
        description: citation.citation.slice(0, 50) + '...',
        value: index.toString(),
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('menu_citations')
        .setPlaceholder('Choisis une citation')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await message.channel.send({ content: 'Sélectionne une citation :', components: [row] });
      break;
    default:
      break;
  }
}

// Fonction pour gérer les interactions
async function handleInteraction(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId === 'select_pseudo') {
    const selectedMemberId = interaction.values[0];
    const selectedMember = await interaction.guild.members.fetch(selectedMemberId);

    await interaction.reply({
      content: `Météo :${selectedMember.user.tag} ? \n ${selectedMember.user.tag}: Oui Météo ?\n Météo: Non rien 😉`,
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
});

// Commandes
client.on('messageCreate', handleCommands);

// Gérer les interactions
client.on(Events.InteractionCreate, handleInteraction);

// Connexion du bot à Discord
client.login(token)
