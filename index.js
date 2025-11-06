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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("❌ Le token Discord est manquant !");
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
let soundFiles = [];

/* ----------------------------------------------------------
   🔄 Charger les citations depuis le salon #citations
---------------------------------------------------------- */
async function loadCitations() {
  try {
    citations = [];
    const guild = client.guilds.cache.first();
    if (!guild) return console.error("❌ Aucune guilde trouvée.");

    const category = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildCategory &&
        ch.name.toLowerCase() === "la tour"
    );
    if (!category) return console.error("❌ Catégorie 'La Tour' non trouvée.");

    const channel = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildText &&
        ch.parentId === category.id &&
        ch.name.toLowerCase() === "citations"
    );
    if (!channel) return console.error("❌ Salon 'citations' non trouvé.");

    const messages = await channel.messages.fetch({ limit: 100 });

    for (const msg of Array.from(messages.values()).reverse()) {
      if (!msg.content || msg.attachments.size > 0 || msg.content.match(/https?:\/\//)) continue;

      let contenu = msg.content
        .replace(/<a?:\w+:\d+>/g, "")
        .replace(/<@!?(\d+)>/g, (m, id) => {
          const user = msg.guild.members.cache.get(id);
          return user ? `@${user.user.username}` : "@inconnu";
        })
        .replace(/<#[0-9]+>/g, "")
        .replace(/<@&[0-9]+>/g, "")
        .trim();

      const lignes = contenu.split("\n").map(l => l.trim()).filter(Boolean);
      const dialogues = [];

      for (const ligne of lignes) {
        const match = ligne.match(/^-?\s*([^:]+)\s*:\s*(.+)$/);
        if (match) dialogues.push({ auteurMention: match[1].trim(), texte: match[2].trim() });
        else if (dialogues.length === 0) dialogues.push({ auteurMention: "📜", texte: ligne });
        else dialogues[dialogues.length - 1].texte += " " + ligne;
      }

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

    console.log(`✅ ${citations.length} citation(s) chargée(s).`);
  } catch (err) {
    console.error("❌ Erreur lors du chargement des citations :", err);
  }
}

/* ----------------------------------------------------------
   🎵 Charger les sons
---------------------------------------------------------- */
async function handleSoundsCommand() {
  const soundsDir = path.join(__dirname, "sounds");
  if (!fs.existsSync(soundsDir)) return "Le dossier des sons n'existe pas.";

  const files = fs.readdirSync(soundsDir).filter(f => f.endsWith(".ogg"));
  if (files.length === 0) return "Aucun son .ogg disponible.";

  soundFiles = files.map(f => ({ label: f.replace(".ogg", ""), value: f.replace(".ogg", "") }));
  return `${files.length} son(s) rechargé(s).`;
}

/* ----------------------------------------------------------
   🧘‍♂️ Récupérer tous les membres Zen
---------------------------------------------------------- */
async function getAllZenMembers(guild) {
  try {
    await guild.members.fetch();
    const roleZen = guild.roles.cache.find(r => r.name === "Zen");
    if (!roleZen) return [];
    return roleZen.members.filter(m => !m.user.bot);
  } catch (err) {
    console.error("❌ Erreur lors de la récupération des membres Zen :", err);
    return [];
  }
}

/* ----------------------------------------------------------
   💬 Gestion des commandes texte
---------------------------------------------------------- */
async function handleCommands(message) {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  if (content === "!") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("command_menu")
      .setPlaceholder("Choisissez une commande")
      .addOptions([
        { label: "!Bonjour", value: "bonjour" },
        { label: "!Aide", value: "aide" },
        { label: "!Citation", value: "citation" },
        { label: "!Météo", value: "meteo" },
        { label: "!Zen", value: "zen" },
        { label: "!Messi", value: "messi" },
        { label: "!Sounds", value: "sounds" },
      ]);
    await message.channel.send({ content: "Voici les commandes disponibles :", components: [new ActionRowBuilder().addComponents(menu)] });
    return;
  }

  if (content.startsWith("!citation")) {
    const args = message.content.split(" ").slice(1);
    let filtered = citations;
    if (args.length > 0) filtered = citations.filter(c => c.auteurDiscord.username.toLowerCase().includes(args.join(" ").toLowerCase()));

    if (filtered.length === 0) return message.reply("⚠️ Aucune citation trouvée.");

    const citation = filtered[Math.floor(Math.random() * filtered.length)];
    const embed = new EmbedBuilder()
      .setColor("#f5c518")
      .setTitle(`💬 Citation de ${citation.auteurDiscord.username}`)
      .setDescription(citation.dialogue.map(d => `**${d.auteurMention}**: ${d.texte}`).join("\n"));
    message.reply({ embeds: [embed] });
  }
}

/* ----------------------------------------------------------
   ⚙️ Gestion des interactions
---------------------------------------------------------- */
async function handleInteraction(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const selected = interaction.values[0];

  // Menu principal
  if (interaction.customId === "command_menu") {
    switch (selected) {
      case "bonjour": return interaction.reply("Bonjour ! Je suis ton bot.");
      case "aide": return interaction.reply("Commandes : !bonjour, !aide, !citation [auteur], !Météo, !Zen, !Messi, !Sounds");
      case "messi": return interaction.reply("Shreuuu est LE Messi, Notre Messi");
      case "sounds":
        await interaction.deferReply();
        await handleSoundsCommand();
        if (soundFiles.length === 0) return interaction.editReply("Aucun son disponible.");
        const menuSounds = new StringSelectMenuBuilder().setCustomId("select-sound").setPlaceholder("Choisis un son à jouer").addOptions(soundFiles.slice(0, 25));
        return interaction.editReply({ content: "🎵 Sélectionne un son :", components: [new ActionRowBuilder().addComponents(menuSounds)] });
      case "citation":
        if (citations.length === 0) return interaction.reply("⚠️ Aucune citation trouvée.");
        const options = citations.slice(0, 25).map((c, i) => ({ label: `Citation de ${c.auteurDiscord.username}`, description: c.dialogue.map(d => `${d.auteurMention}: ${d.texte}`).join(" | ").slice(0, 50) + "...", value: i.toString() }));
        return interaction.reply({ content: "📖 Sélectionne une citation :", components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("menu_citations").setPlaceholder("Choisis une citation").addOptions(options))] });
      case "zen": return showZenMenu(interaction, "Zen");
      case "meteo": return showZenMenu(interaction, "Météo", "Le fameux Météo !");
    }
  }

  // Menu sons
  if (interaction.customId === "select-sound") {
    const soundPath = path.join(__dirname, "sounds", `${selected}.ogg`);
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const voiceChannel = member?.voice.channel;
    if (!voiceChannel) return interaction.reply({ content: "Tu dois être dans un salon vocal.", ephemeral: true });
    if (!fs.existsSync(soundPath)) return interaction.reply({ content: "Son introuvable.", ephemeral: true });

    try {
      const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: interaction.guild.id, adapterCreator: interaction.guild.voiceAdapterCreator });
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
      const player = createAudioPlayer();
      connection.subscribe(player);
      player.play(createAudioResource(soundPath));
      player.on(AudioPlayerStatus.Idle, () => connection.destroy());
      interaction.reply({ content: `▶️ Lecture de **${selected}**`, ephemeral: false });
    } catch (err) {
      console.error(err);
      interaction.reply({ content: "Erreur lors de la lecture.", ephemeral: true });
    }
  }

  // Menu Zen/Météo
  if (interaction.customId.startsWith("select_pseudo_")) {
    const type = interaction.customId.split("_")[2]; // zen ou meteo
    const selectedMember = await interaction.guild.members.fetch(selected);
    if (type === "zen") interaction.reply({ content: `Membre Zen sélectionné : ${selectedMember.user.tag}`, ephemeral: true });
    else if (type === "meteo") interaction.reply({ content: `Météo : ${selectedMember.user.tag} ?\n${selectedMember.user.tag} : Oui Météo ?\nMétéo : Non rien 😉`, ephemeral: true });
  }

  // Menu citations
  if (interaction.customId === "menu_citations") {
    const citation = citations[parseInt(selected, 10)];
    if (!citation) return interaction.reply({ content: "❌ Citation introuvable.", ephemeral: true });
    const embed = new EmbedBuilder().setColor("#f5c518").setTitle(`💬 Citation de ${citation.auteurDiscord.username}`).setDescription(citation.dialogue.map(d => `**${d.auteurMention}**: ${d.texte}`).join("\n")).setFooter({ text: `Demandé par ${interaction.user.username}` });
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ embeds: [embed], ephemeral: true });
    else await interaction.followUp({ embeds: [embed], ephemeral: true });
  }
}

/* ----------------------------------------------------------
   🔹 Fonction pour afficher le menu Zen/Météo
---------------------------------------------------------- */
async function showZenMenu(interaction, type, message = null) {
  const zenMembers = await getAllZenMembers(interaction.guild);
  if (zenMembers.size === 0) return interaction.reply({ content: "Aucun membre Zen trouvé.", ephemeral: true });

  const options = Array.from(zenMembers.values()).map(m => ({
    label: m.user.username,
    value: m.id,
    description: `Utilisateur : ${m.user.tag}`,
    emoji: "🧘‍♂️",
  })).slice(0, 25);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`select_pseudo_${type.toLowerCase()}`)
    .setPlaceholder(`Choisissez un membre pour ${type}`)
    .addOptions(options);

  await interaction.reply({ content: message || `Veuillez sélectionner un membre pour ${type} :`, components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
}

/* ----------------------------------------------------------
   🚀 Initialisation
---------------------------------------------------------- */
client.once("ready", async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  await loadCitations();
  await handleSoundsCommand();
});

client.on("messageCreate", handleCommands);
client.on(Events.InteractionCreate, handleInteraction);
client.login(token);
