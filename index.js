import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import fs from "fs";
import path from "path";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

const TOKEN = process.env.BOT_TOKEN;

// ==============================
// IDS
// ==============================

const CANAL_VERIFICACAO = "1485730036752584804";
const CANAL_BOAS_VINDAS_CIVIL = "1422991553663860756";
const CANAL_BOAS_VINDAS_TRABALHADOR = "1423267894472736908";
const CANAL_BOAS_VINDAS_MEMBRO = "1485733210854916107";
const CANAL_LOGS = "1485734982747164735";

const ROLE_CHEFE = "1422984664812884168";
const ROLE_SUBCHEFE = "1422986843074592928";
const ROLE_ASSOCIADOS = "1422987627367239850";
const ROLE_TRABALHADOR = "1423230217580711956";
const ROLE_CIVIL = "1422991358054105098";
const ROLE_RECECAO = "1441398310337384589";
const ROLE_IMPERIO = "1423052122936573992";

const MONITORED_ROLES = {
  [ROLE_CHEFE]: "Chefe",
  [ROLE_SUBCHEFE]: "Sub Chefe",
  [ROLE_ASSOCIADOS]: "Associados",
  [ROLE_TRABALHADOR]: "Trabalhador",
  [ROLE_CIVIL]: "Civil",
  [ROLE_RECECAO]: "Rececao",
  [ROLE_IMPERIO]: "Imperio Oculto"
};

const HISTORY_FILE = path.join(process.cwd(), "history.json");

// ==============================
// FUNCOES
// ==============================

function nowISO() {
  return new Date().toISOString();
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${d.getFullYear()}`;
}

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return {};
  return JSON.parse(fs.readFileSync(HISTORY_FILE));
}

function saveHistory(data) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

function ensureUser(data, member) {
  if (!data[member.id]) {
    data[member.id] = {
      userId: member.id,
      nome: member.user.username,
      dataEntradaServidor: nowISO(),
      dataSaida: null,
      logMessageId: null,
      cargos: []
    };
  }
  return data[member.id];
}

function addRole(user, roleId, roleName, date) {
  user.cargos.push({
    roleId,
    roleName,
    start: date,
    end: null
  });
}

function closeRole(user, roleId, date) {
  const role = [...user.cargos].reverse().find(r => r.roleId === roleId && !r.end);
  if (role) role.end = date;
}

function closeAll(user, date) {
  user.cargos.forEach(r => {
    if (!r.end) r.end = date;
  });
}

function buildLog(user) {
  let txt = `Nome: ${user.nome}\n`;
  txt += `ID: ${user.userId}\n`;
  txt += `Data Entrada Servidor: ${formatDate(user.dataEntradaServidor)}\n`;

  user.cargos.forEach(c => {
    if (c.end) {
      txt += `Data Cargo ${c.roleName}: ${formatDate(c.start)} - ${formatDate(c.end)}\n`;
    } else {
      txt += `Data Cargo ${c.roleName}: ${formatDate(c.start)}\n`;
    }
  });

  txt += `Data Saida: ${user.dataSaida ? formatDate(user.dataSaida) : "-"}`;
  return txt;
}

async function updateLog(guild, member) {
  const data = loadHistory();
  const user = data[member.id];
  if (!user) return;

  const canal = await guild.channels.fetch(CANAL_LOGS).catch(() => null);
  if (!canal) return;

  const content = "```" + buildLog(user) + "```";

  if (user.logMessageId) {
    const msg = await canal.messages.fetch(user.logMessageId).catch(() => null);
    if (msg) return msg.edit(content);
  }

  const newMsg = await canal.send(content);
  user.logMessageId = newMsg.id;
  saveHistory(data);
}

// ==============================
// ENTRADA
// ==============================

client.on(Events.GuildMemberAdd, async member => {
  await member.roles.add(ROLE_RECECAO);

  const canal = await member.guild.channels.fetch(CANAL_VERIFICACAO);

  await canal.send({
    content: `Bem-vindo ao Império Oculto ${member},\nAguarda pela atribuição dos cargos.`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("civil").setLabel("Civil").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("trabalhador").setLabel("Trabalhador").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("org").setLabel("ORG").setStyle(ButtonStyle.Success)
      )
    ]
  });

  const data = loadHistory();
  const user = ensureUser(data, member);

  addRole(user, ROLE_RECECAO, MONITORED_ROLES[ROLE_RECECAO], nowISO());

  saveHistory(data);
  updateLog(member.guild, member);
});

// ==============================
// BOTOES
// ==============================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const actor = interaction.member;

  if (
    !actor.roles.cache.has(ROLE_CHEFE) &&
    !actor.roles.cache.has(ROLE_SUBCHEFE)
  ) {
    return interaction.reply({ content: "Sem permissão", ephemeral: true });
  }

  const match = interaction.message.content.match(/<@!?(\d+)>/);
  if (!match) return;

  const target = await interaction.guild.members.fetch(match[1]);

  const data = loadHistory();
  const user = ensureUser(data, target);

  const now = nowISO();

  await target.roles.remove(ROLE_RECECAO).catch(() => {});
  closeRole(user, ROLE_RECECAO, now);

  if (interaction.customId === "civil") {
    await target.roles.add(ROLE_CIVIL);
    addRole(user, ROLE_CIVIL, "Civil", now);
    sendMsg(interaction.guild, CANAL_BOAS_VINDAS_CIVIL, `Bem-vindo a área civil do Império Oculto ${target}.`);
  }

  if (interaction.customId === "trabalhador") {
    await target.roles.add(ROLE_TRABALHADOR);
    addRole(user, ROLE_TRABALHADOR, "Trabalhador", now);
    sendMsg(interaction.guild, CANAL_BOAS_VINDAS_TRABALHADOR, `Bem-vindo a área dos trabalhadores do Império Oculto ${target}.`);
  }

  if (interaction.customId === "org") {
    await target.roles.add(ROLE_IMPERIO);
    await target.roles.add(ROLE_ASSOCIADOS);

    addRole(user, ROLE_IMPERIO, "Imperio Oculto", now);
    addRole(user, ROLE_ASSOCIADOS, "Associados", now);

    sendMsg(interaction.guild, CANAL_BOAS_VINDAS_MEMBRO, `Bem-vindo a área dos membros do Império Oculto ${target}.`);
  }

  saveHistory(data);
  updateLog(interaction.guild, target);

  await interaction.message.delete().catch(() => {});
  interaction.reply({ content: "Feito", ephemeral: true });
});

// ==============================
// SAIDA
// ==============================

client.on(Events.GuildMemberRemove, async member => {
  const data = loadHistory();
  const user = data[member.id];
  if (!user) return;

  const now = nowISO();

  user.dataSaida = now;
  closeAll(user, now);

  saveHistory(data);
  updateLog(member.guild, member);
});

// ==============================
// FUNCAO AUX
// ==============================

async function sendMsg(guild, channelId, msg) {
  const ch = await guild.channels.fetch(channelId).catch(() => null);
  if (ch) ch.send(msg);
}

// ==============================
// START
// ==============================

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot ligado como ${client.user.tag}`);
});

client.login(TOKEN);