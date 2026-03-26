// index.js
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
import dotenv from "dotenv";

dotenv.config();

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
// IDs de canais e cargos
// ==============================

// Canais
const CANAL_VERIFICACAO = "1485730036752584804";
const CANAL_BOAS_VINDAS_CIVIL = "1422991553663860756";
const CANAL_BOAS_VINDAS_TRABALHADOR = "1423267894472736908";
const CANAL_BOAS_VINDAS_MEMBRO = "1485733210854916107";
const CANAL_LOGS = "1485734982747164735";

// Cargos
const ROLE_CHEFE = "1422984664812884168";
const ROLE_SUBCHEFE = "1422986843074592928";
const ROLE_BRACO_DIREITO = "1422987186113872023";
const ROLE_COMISSARIO = "1432048175325249586";
const ROLE_CAPOS = "1422987330343403642";
const ROLE_EXECUTORES = "1432047996995899432";
const ROLE_SOLDADOS = "1422987461448962088";
const ROLE_ASSOCIADOS = "1422987627367239850";
const ROLE_TRABALHADOR = "1423230217580711956";
const ROLE_CIVIL = "1422991358054105098";
const ROLE_RECECAO = "1441398310337384589";
const ROLE_IMPERIO = "1423052122936573992";

// Cargos monitorizados no histórico
const MONITORED_ROLES = {
  [ROLE_CHEFE]: "Chefe",
  [ROLE_SUBCHEFE]: "Sub Chefe",
  [ROLE_BRACO_DIREITO]: "Braco Direito",
  [ROLE_COMISSARIO]: "Comissario",
  [ROLE_CAPOS]: "Capos",
  [ROLE_EXECUTORES]: "Executores",
  [ROLE_SOLDADOS]: "Soldados",
  [ROLE_ASSOCIADOS]: "Associados",
  [ROLE_TRABALHADOR]: "Trabalhador",
  [ROLE_CIVIL]: "Civil",
  [ROLE_RECECAO]: "Rececao",
  [ROLE_IMPERIO]: "Imperio Oculto"
};

const HISTORY_FILE = path.join(process.cwd(), "history.json");

// ==============================
// Funções auxiliares
// ==============================

function nowISO() {
  return new Date().toISOString();
}

function formatDate(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return {};
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch (err) {
    console.error("Erro a ler history.json:", err);
    return {};
  }
}

function saveHistory(data) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Erro a gravar history.json:", err);
  }
}

function ensureUser(data, member) {
  if (!data[member.id]) {
    data[member.id] = {
      userId: member.id,
      nome: member.user.displayName || member.user.username,
      dataEntradaServidor: nowISO(),
      dataSaida: null,
      logMessageId: null,
      cargos: []
    };
  }
  return data[member.id];
}

function addRoleHistory(userEntry, roleId, roleName, startDate) {
  userEntry.cargos.push({
    roleId,
    roleName,
    start: startDate,
    end: null
  });
}

function closeRoleHistory(userEntry, roleId, endDate) {
  const openRole = [...userEntry.cargos].reverse().find(
    c => c.roleId === roleId && c.end === null
  );
  if (openRole) {
    openRole.end = endDate;
  }
}

function closeAllOpenRoles(userEntry, endDate) {
  for (const cargo of userEntry.cargos) {
    if (cargo.end === null) {
      cargo.end = endDate;
    }
  }
}

function buildLogMessage(userEntry) {
  const linhas = [];
  linhas.push(`Nome: ${userEntry.nome}`);
  linhas.push(`ID: ${userEntry.userId}`);
  linhas.push(`Data Entrada Servidor: ${formatDate(userEntry.dataEntradaServidor)}`);

  for (const cargo of userEntry.cargos) {
    if (cargo.end) {
      linhas.push(
        `Data Cargo ${cargo.roleName}: ${formatDate(cargo.start)} - ${formatDate(cargo.end)}`
      );
    } else {
      linhas.push(`Data Cargo ${cargo.roleName}: ${formatDate(cargo.start)}`);
    }
  }

  linhas.push(`Data Saida: ${userEntry.dataSaida ? formatDate(userEntry.dataSaida) : "-"}`);
  return linhas.join("\n");
}

async function createOrUpdateLogMessage(guild, member) {
  const data = loadHistory();
  const userEntry = data[member.id];
  if (!userEntry) return;

  const canalLogs = await guild.channels.fetch(CANAL_LOGS).catch(() => null);
  if (!canalLogs || !canalLogs.isTextBased()) return;

  const conteudo = buildLogMessage(userEntry);

  try {
    if (userEntry.logMessageId) {
      const msg = await canalLogs.messages.fetch(userEntry.logMessageId).catch(() => null);
      if (msg) {
        await msg.edit({ content: "```" + conteudo + "```" });
      } else {
        const nova = await canalLogs.send({ content: "```" + conteudo + "```" });
        userEntry.logMessageId = nova.id;
        saveHistory(data);
      }
    } else {
      const nova = await canalLogs.send({ content: "```" + conteudo + "```" });
      userEntry.logMessageId = nova.id;
      saveHistory(data);
    }
  } catch (err) {
    console.error("Erro a criar/editar log:", err);
  }
}

function createVerificationButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("civil")
        .setLabel("Civil")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId("trabalhador")
        .setLabel("Trabalhador")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId("org")
        .setLabel("ORG")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

function extractMentionedUserId(messageContent) {
  const match = messageContent.match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

async function sendWelcomeMessage(guild, channelId, content) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel && channel.isTextBased()) {
    await channel.send(content).catch(console.error);
  }
}

// ==============================
// Evento: entrada no servidor
// ==============================

client.on(Events.GuildMemberAdd, async member => {
  try {
    // dar cargo Rececao
    await member.roles.add(ROLE_RECECAO).catch(console.error);

    // enviar mensagem no canal de verificação
    const canalVerificacao = await member.guild.channels.fetch(CANAL_VERIFICACAO).catch(() => null);
    if (canalVerificacao && canalVerificacao.isTextBased()) {
      await canalVerificacao.send({
        content: `Bem-vindo ao Império Oculto ${member},\nAguarda pela atribuição dos cargos.\nID: ${member.id}`,
        components: createVerificationButtons()
      });
    }

    // registar histórico inicial
    const data = loadHistory();
    const userEntry = ensureUser(data, member);
    userEntry.nome = member.user.displayName || member.user.username;
    addRoleHistory(userEntry, ROLE_RECECAO, MONITORED_ROLES[ROLE_RECECAO], nowISO());
    saveHistory(data);

    // criar/atualizar log
    await createOrUpdateLogMessage(member.guild, member);
  } catch (err) {
    console.error("Erro no GuildMemberAdd:", err);
  }
});

// ==============================
// Evento: clique nos botões
// ==============================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const actor = interaction.member;
  if (!actor) return;

  // só Chefe ou Subchefe podem usar
  const podeUsar =
    actor.roles.cache.has(ROLE_CHEFE) ||
    actor.roles.cache.has(ROLE_SUBCHEFE);

  if (!podeUsar) {
    return interaction.reply({
      content: "❌ Não tens permissão para usar estes botões.",
      ephemeral: true
    });
  }

  // identificar o membro alvo pela menção na mensagem
  const targetId = extractMentionedUserId(interaction.message.content);
  if (!targetId) {
    return interaction.reply({
      content: "❌ Não consegui identificar o utilizador desta verificação.",
      ephemeral: true
    });
  }

  const guild = interaction.guild;
  const targetMember = await guild.members.fetch(targetId).catch(() => null);
  if (!targetMember) {
    return interaction.reply({
      content: "❌ O utilizador já não está no servidor.",
      ephemeral: true
    });
  }

  const data = loadHistory();
  const userEntry = ensureUser(data, targetMember);
  userEntry.nome = targetMember.user.displayName || targetMember.user.username;

  const agora = nowISO();

  try {
    // Fechar Rececao se estiver ativo
    if (targetMember.roles.cache.has(ROLE_RECECAO)) {
      await targetMember.roles.remove(ROLE_RECECAO).catch(console.error);
      closeRoleHistory(userEntry, ROLE_RECECAO, agora);
    }

    // Processar cada botão
    if (interaction.customId === "civil") {
      // Civil
      await targetMember.roles.add(ROLE_CIVIL).catch(console.error);
      addRoleHistory(userEntry, ROLE_CIVIL, MONITORED_ROLES[ROLE_CIVIL], agora);

      await sendWelcomeMessage(
        guild,
        CANAL_BOAS_VINDAS_CIVIL,
        `Bem-vindo a área civil do Império Oculto ${targetMember}.`
      );
    }

    if (interaction.customId === "trabalhador") {
      // Trabalhador
      await targetMember.roles.add(ROLE_TRABALHADOR).catch(console.error);
      addRoleHistory(userEntry, ROLE_TRABALHADOR, MONITORED_ROLES[ROLE_TRABALHADOR], agora);

      await sendWelcomeMessage(
        guild,
        CANAL_BOAS_VINDAS_TRABALHADOR,
        `Bem-vindo a área dos trabalhadores do Império Oculto ${targetMember}.`
      );
    }

    if (interaction.customId === "org") {
      // ORG: Imperio Oculto + Associados
      await targetMember.roles.add(ROLE_IMPERIO).catch(console.error);
      await targetMember.roles.add(ROLE_ASSOCIADOS).catch(console.error);

      addRoleHistory(userEntry, ROLE_IMPERIO, MONITORED_ROLES[ROLE_IMPERIO], agora);
      addRoleHistory(userEntry, ROLE_ASSOCIADOS, MONITORED_ROLES[ROLE_ASSOCIADOS], agora);

      await sendWelcomeMessage(
        guild,
        CANAL_BOAS_VINDAS_MEMBRO,
        `Bem-vindo a área dos membros do Império Oculto ${targetMember}.`
      );
    }

    // gravar histórico e log
    saveHistory(data);
    await createOrUpdateLogMessage(guild, targetMember);

    // apagar a mensagem de verificação
    await interaction.message.delete().catch(console.error);

    // confirmar ao quem clicou
    await interaction.reply({
      content: `✅ Cargos atribuídos a ${targetMember}.`,
      ephemeral: true
    });
  } catch (err) {
    console.error("Erro ao processar botão:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Ocorreu um erro ao atribuir os cargos.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ==============================
// Evento: alterações manuais de cargos
// ==============================

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    const data = loadHistory();
    const userEntry = ensureUser(data, newMember);
    userEntry.nome = newMember.user.displayName || newMember.user.username;

    const agora = nowISO();
    let houveAlteracao = false;

    for (const [roleId, roleName] of Object.entries(MONITORED_ROLES)) {
      const tinhaAntes = oldMember.roles.cache.has(roleId);
      const temAgora = newMember.roles.cache.has(roleId);

      if (!tinhaAntes && temAgora) {
        // novo cargo
        const jaAberto = userEntry.cargos.find(c => c.roleId === roleId && c.end === null);
        if (!jaAberto) {
          addRoleHistory(userEntry, roleId, roleName, agora);
          houveAlteracao = true;
        }
      }

      if (tinhaAntes && !temAgora) {
        // cargo removido
        closeRoleHistory(userEntry, roleId, agora);
        houveAlteracao = true;
      }
    }

    if (houveAlteracao) {
      saveHistory(data);
      await createOrUpdateLogMessage(newMember.guild, newMember);
    }
  } catch (err) {
    console.error("Erro no GuildMemberUpdate:", err);
  }
});

// ==============================
// Evento: saída do servidor
// ==============================

client.on(Events.GuildMemberRemove, async member => {
  try {
    const data = loadHistory();
    const userEntry = data[member.id];
    if (!userEntry) return;

    const agora = nowISO();
    userEntry.dataSaida = agora;
    closeAllOpenRoles(userEntry, agora);

    saveHistory(data);
    await createOrUpdateLogMessage(member.guild, member);
  } catch (err) {
    console.error("Erro no GuildMemberRemove:", err);
  }
});

// ==============================
// Ready
// ==============================

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot ligado como ${client.user.tag}`);
});

client.login(TOKEN);