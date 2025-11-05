import dotenv from "dotenv";
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  Events,
  EmbedBuilder,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  entersState,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config(); // Charge le fichier .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error(
    "❌ Le token Discord (DISCORD_TOKEN) est manquant. Vérifie ton .env ou les variables Railway."
  );
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

let citations = [];

/* ----------------------------------------------------------
   🔄 Fonction améliorée pour charger les citations
---------------------------------------------------------- */
async function loadCitations() {
  try {
    // Vide la liste précédente pour éviter les doublons
    citations = [];

    const guild = client.guilds.cache.first();
    if (!guild) {
      console.error("❌ Aucune guilde trouvée !");
      return;
    }

    const category = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildCategory &&
        ch.name.toLowerCase() === "la tour"
    );
    if (!category) {
      console.error("❌ La catégorie 'La Tour' n'a pas été trouvée !");
      return;
    }

    const channel = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildText &&
        ch.parentId === category.id &&
        ch.name.toLowerCase() === "citations"
    );
    if (!channel) {
      console.error(
        "❌ Le canal 'citations' n'a pas été trouvé dans la catégorie 'La Tour' !"
      );
      return;
    }

    // Récupère les 100 derniers messages du salon
    const messages = await channel.messages.fetch({ limit: 100 });

    // Les messages sont récupérés du plus récent au plus ancien → on inverse pour l'ordre naturel
    for (const msg of Array.from(messages.values()).reverse()) {
      // Ignore les messages non textuels
      if (!msg.content) continue;
      if (msg.attachments.size > 0) continue;
      if (msg.content.match(/https?:\/\//)) continue;

      // Sépare les lignes (au cas où le message contient plusieurs dialogues)
      const lignes = msg.content.split("\n");
      const dialogues = [];

      for (const ligne of lignes) {
        const trimmed = ligne.trim();
        if (!trimmed) continue;

        const match = trimmed.match(/^-?\s*([^:]+)\s*:\s*(.+)$/);
        if (!match) continue;

        const auteurMention = match[1].trim();
        const texte = match[2].trim();

        dialogues.push({
          auteurMention,
          texte,
        });
      }

      // Si on a trouvé au moins une ligne de dialogue
      if (dialogues.length > 0) {
        citations.push({
          auteurDiscord: {
            id: msg.author.id,
            username: msg.author.username,
            tag: msg.author.tag,
          },
          dialogue: dialogues,
          messageId: msg.id,
          date: msg.createdAt,
        });
      }
    }

    console.log(
      `✅ ${citations.length} citation(s) chargée(s) depuis #citations.`
    );
  } catch (error) {
    console.error("❌ Erreur lors du chargement des citations :", error);
  }
}

/* ----------------------------------------------------------
   🎵 Partie sons (inchangée)
---------------------------------------------------------- */
let soundFiles = [];

async function handleSoundsCommand() {
  const soundsDir = path.join(__dirname, "sounds");

  if (!fs.existsSync(soundsDir)) {
    return "Le dossier des sons n'existe pas.";
  }

  const files = fs
    .readdirSync(soundsDir)
    .filter((file) => file.endsWith(".ogg"));
  if (files.length === 0) {
    return "Aucun son .ogg disponible.";
  }

  soundFiles = files.map((file) => ({
    label: file.replace(".ogg", ""),
    value: file.replace(".ogg", ""),
  }));

  return `${files.length} son(s) rechargé(s).`;
}

client.on("messageCreate", async (message) => {
  if (message.content === "!reload_sounds") {
    const result = await handleSoundsCommand();
    message.reply(result);
  }
});

/* ----------------------------------------------------------
   🔊 Gestion des interactions pour jouer les sons
---------------------------------------------------------- */
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.customId === "select-sound") {
    const soundName = interaction.values[0];
    const soundPath = path.join(__dirname, "sounds", `${soundName}.ogg`);

    const member = interaction.guild.members.cache.get(interaction.user.id);
    const voiceChannel = member?.voice.channel;

    if (!voiceChannel) {
      await interaction.reply({
        content: "Tu dois être dans un salon vocal.",
        ephemeral: true,
      });
      return;
    }

    if (!fs.existsSync(soundPath)) {
      await interaction.reply({ content: "Son introuvable.", ephemeral: true });
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

      connection.subscribe(player);
      player.play(resource);

      player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
      });

      await interaction.reply({
        content: `▶️ Lecture de **${soundName}**`,
        ephemeral: false,
      });
    } catch (error) {
      console.error(error);
      interaction.reply({
        content: "Erreur lors de la lecture.",
        ephemeral: true,
      });
    }
  }
});

/* ----------------------------------------------------------
   🧘‍♂️ Récupération des membres Zen (inchangée)
---------------------------------------------------------- */
async function getAllZenMembers(message) {
  try {
    const roleZen = message.guild.roles.cache.find(
      (role) => role.name === "Zen"
    );

    if (!roleZen) {
      console.error("❌ Le rôle 'Zen' est introuvable.");
      return [];
    }

    await message.guild.members.fetch();
    const zenMembers = roleZen.members.filter((member) => !member.user.bot);
    console.log(`✅ ${zenMembers.size} membre(s) ont le rôle 'Zen'.`);

    return zenMembers;
  } catch (error) {
    console.error("❌ Erreur lors de la récupération des membres Zen :", error);
    return [];
  }
}

/* ----------------------------------------------------------
   💬 Gestion des commandes utilisateur
---------------------------------------------------------- */
async function handleCommands(message) {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // ------------------------------
  // Commande menu principale "!"
  // ------------------------------
  if (content === "!") {
    const commandMenu = new StringSelectMenuBuilder()
      .setCustomId("command_menu")
      .setPlaceholder("Choisissez une commande")
      .addOptions([
        { label: "!Bonjour", value: "bonjour", description: "Dire bonjour" },
        { label: "!Aide", value: "aide", description: "Voir les commandes disponibles" },
        { label: "!Citation", value: "citation", description: "Obtenir une citation" },
        { label: "!Météo", value: "meteo", description: "Le fameux Meteo" },
        { label: "!Zen", value: "zen", description: "Voir les membres Zen" },
        { label: "!Messi", value: "messi", description: "Un message légendaire" },
        { label: "!Sounds", value: "sounds", description: "Jouer des sons disponibles" },
      ]);

    const commandRow = new ActionRowBuilder().addComponents(commandMenu);

    await message.channel.send({
      content: "Voici les commandes disponibles :",
      components: [commandRow],
    });

    return; // fin de la commande !
  }

  // ------------------------------
  // Commande !citation [auteur]
  // ------------------------------
  if (content.startsWith("!citation")) {
    const args = message.content.split(" ").slice(1); // récupère l'auteur si spécifié
    let filtered = citations;

    if (args.length > 0) {
      const auteurRecherche = args.join(" ").toLowerCase();
      filtered = citations.filter(c =>
        c.auteurDiscord.username.toLowerCase().includes(auteurRecherche)
      );
    }

    if (filtered.length === 0) {
      message.reply("⚠️ Aucune citation trouvée pour cet auteur.");
      return;
    }

    const citation = filtered[Math.floor(Math.random() * filtered.length)];
    const embed = new EmbedBuilder()
      .setColor("#f5c518")
      .setTitle(`💬 Citation de ${citation.auteurDiscord.username}`)
      .setDescription(
        citation.dialogue.map(d => `**${d.auteurMention}**: ${d.texte}`).join("\n")
      );

    message.reply({ embeds: [embed] });
  }

  // ------------------------------
  // Tu peux ajouter d'autres commandes texte ici si nécessaire
  // ------------------------------
}


/* ----------------------------------------------------------
   ⚙️ Gestion des interactions (modifiée pour citations)
---------------------------------------------------------- */
async function handleInteraction(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const selected = interaction.values[0];

  // ------------------------------
  // Menu principal des commandes
  // ------------------------------
  if (interaction.customId === "command_menu") {
    switch (selected) {
      case "bonjour":
        await interaction.reply("Bonjour ! Je suis ton bot.");
        break;

      case "aide":
        await interaction.reply(
          "Voici les commandes disponibles : `!bonjour`, `!aide`, `!citation [auteur]`, `!Météo`, `!Zen`, `!Messi`, `!Sounds`"
        );
        break;

      case "messi":
        await interaction.reply("Shreuuu est LE Messi, Notre Messi");
        break;

      case "zen": {
        const zenMembers = await getAllZenMembers(interaction);

        if (zenMembers.size === 0) {
          await interaction.reply("Aucun membre avec le rôle Zen trouvé.");
          return;
        }

        const options = Array.from(zenMembers.values())
          .map(member => ({
            label: member.user.username,
            value: member.id,
            description: `Utilisateur : ${member.user.tag}`,
            emoji: "🧘‍♂️",
          }))
          .slice(0, 25);

        const zenMenu = new StringSelectMenuBuilder()
          .setCustomId("select_pseudo")
          .setPlaceholder("Choisissez un membre Zen")
          .addOptions(options);

        const zenRow = new ActionRowBuilder().addComponents(zenMenu);

        await interaction.reply({
          content: "Veuillez sélectionner un membre Zen :",
          components: [zenRow],
        });
        break;
      }

      case "sounds": {
        await interaction.deferReply();
        await handleSoundsCommand();

        if (soundFiles.length === 0) {
          return interaction.editReply("Aucun son disponible.");
        }

        const options = soundFiles.slice(0, 25);
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("select-sound")
          .setPlaceholder("Choisis un son à jouer")
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.editReply({
          content: "🎵 Sélectionne un son à jouer :",
          components: [row],
        });
        break;
      }

      case "citation": {
        if (citations.length === 0) {
          await interaction.reply(
            "⚠️ Aucune citation trouvée. Vérifie le salon #citations."
          );
          return;
        }

        const options = citations.slice(0, 25).map((c, index) => {
          const texte = c.dialogue.map(d => `${d.auteurMention}: ${d.texte}`).join(" | ");
          return {
            label: `Citation de ${c.auteurDiscord.username}`,
            description: texte.slice(0, 50) + "...",
            value: index.toString(),
          };
        });

        const citationMenu = new StringSelectMenuBuilder()
          .setCustomId("menu_citations")
          .setPlaceholder("Choisis une citation")
          .addOptions(options);

        const citationRow = new ActionRowBuilder().addComponents(citationMenu);

        await interaction.reply({
          content: "📖 Sélectionne une citation :",
          components: [citationRow],
        });
        break;
      }

      case "meteo":
        // Peut rester vide si tu gères avec le menu "select_pseudo"
        break;

      default:
        await interaction.reply("Commande non reconnue.");
        break;
    }
  }

  // ------------------------------
  // Menu sélection membre Zen
  // ------------------------------
  if (interaction.customId === "select_pseudo") {
    const selectedMemberId = interaction.values[0];
    const selectedMember = await interaction.guild.members.fetch(selectedMemberId);

    await interaction.reply({
      content: `Météo : ${selectedMember.user.tag} ?\n${selectedMember.user.tag} : Oui Météo ?\nMétéo : Non rien 😉`,
    });
  }

  // ------------------------------
  // Menu sélection citation
  // ------------------------------
  if (interaction.customId === "menu_citations") {
    const selectedIndex = parseInt(interaction.values[0], 10);
    const citation = citations[selectedIndex];

    if (!citation) {
      await interaction.reply({
        content: "❌ Citation introuvable ou supprimée.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor("#f5c518")
      .setTitle(`💬 Citation de ${citation.auteurDiscord.username}`)
      .setDescription(
        citation.dialogue.map(d => `**${d.auteurMention}**: ${d.texte}`).join("\n")
      )
      .setFooter({ text: `Demandé par ${interaction.user.username}` });

    await interaction.reply({ embeds: [embed] });
  }
}


/* ----------------------------------------------------------
   🚀 Initialisation du bot
---------------------------------------------------------- */
client.once("ready", async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  await loadCitations();
  await handleSoundsCommand();
});

client.on("messageCreate", handleCommands);
client.on(Events.InteractionCreate, handleInteraction);
client.login(token);
