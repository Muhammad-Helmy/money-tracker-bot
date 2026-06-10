require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');

const token = process.env.TELEGRAM_BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const bot = new TelegramBot(token, { polling: true });

// Setup Google Sheets
const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json',
    scopes: 'https://www.googleapis.com/auth/spreadsheets',
});
const sheets = google.sheets('v4');

console.log("🤖 Money Tracker Bot aktif...");

// ===== MENU UTAMA =====
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const nama = msg.from.first_name;
    
    const saldo = await hitungSaldo();
    
    // Custom Keyboard yang selalu muncul
    const mainKeyboard = {
        keyboard: [
            [
                { text: '💵 Expense' },
                { text: '📥 Pemasukan' },
                { text: '💸 Transfer' }
            ],
            [
                { text: '💰 Tarik Tunai' },
                { text: '📤 Setor Tunai' }
            ],
            [
                { text: '📊 Cek Saldo' },
                { text: '📋 Laporan' }
            ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false // PENTING: Keyboard tetap muncul
    };
    
    bot.sendMessage(chatId, `Halo ${nama}! 👋\n\n💰 *Saldo Saat Ini:*\n${formatSaldoText(saldo)}\n\nSilakan pilih menu di bawah:`, {
        parse_mode: 'Markdown',
        reply_markup: mainKeyboard
    });
});

// ===== SATU HANDLER UNTUK SEMUA PESAN =====
bot.on('message', async (msg) => {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (!text || text.startsWith('/')) return;

    // === HANDLE PERSISTENT MENU BUTTONS ===
    if (text === '💵 Expense') {
        bot.sendMessage(chatId, '💵 *Expense dari mana?*\n\nKetik langsung:\n- `makan 25`\n- `beli kopi 15k pake dana`\n- `wifi 275`', {
            parse_mode: 'Markdown'
        });
        return;
    }
    else if (text === '📥 Pemasukan') {
        bot.sendMessage(chatId, '📥 *Pemasukan*\n\nKetik:\n- `gaji 5jt`\n- `masuk 500 bonus`\n- `dapat honor 1jt`', {
            parse_mode: 'Markdown'
        });
        return;
    }
    else if (text === '💸 Transfer') {
        bot.sendMessage(chatId, '💸 *Transfer Antar Rekening*\n\nKetik:\n- `tf dana ke jago 100k`\n- `tf seabank 50`\n- `tf dari dana ke jago semuanya`', {
            parse_mode: 'Markdown'
        });
        return;
    }
    else if (text === '💰 Tarik Tunai') {
        bot.sendMessage(chatId, '💰 *Tarik Tunai*\n\nKetik:\n- `tarik tunai 100k`\n- `ambil atm 50`\n- `cash 200`', {
            parse_mode: 'Markdown'
        });
        return;
    }
    else if (text === '📤 Setor Tunai') {
        bot.sendMessage(chatId, '📤 *Setor Tunai*\n\nKetik:\n- `setor dana 50k`\n- `topup gopay 100`\n- `deposit jago 200`', {
            parse_mode: 'Markdown'
        });
        return;
    }
    else if (text === '📊 Cek Saldo') {
        const saldo = await hitungSaldo();
        bot.sendMessage(chatId, `💰 *Saldo Real-time:*\n\n${formatSaldoText(saldo)}`, {
            parse_mode: 'Markdown'
        });
        return;
    }
    else if (text === '📋 Laporan') {
        await generateReport(chatId);
        return;
    }

    // === HANDLE USER STATE (dari inline button) ===
    if (userState[chatId]) {
        const state = userState[chatId];
        await processWithState(text, chatId, state);
        delete userState[chatId];
        return;
    }

    // === QUICK PARSER (untuk pesan natural) ===
    await quickParse(text, chatId);
});

// ===== HANDLE BUTTON CLICK =====
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Jawab callback query (hilangkan loading)
    bot.answerCallbackQuery(query.id);

    if (data === 'check_balance') {
        const saldo = await hitungSaldo();
        bot.sendMessage(chatId, `💰 *Saldo Real-time:*\n\n${formatSaldoText(saldo)}`, {
            parse_mode: 'Markdown'
        });
    }
    else if (data === 'menu_expense') {
        bot.sendMessage(chatId, '💵 *Pengeluaran dari mana?*', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'GoPay (Jago)', callback_data: 'expense_gopay' }],
                    [{ text: 'Dana', callback_data: 'expense_dana' }],
                    [{ text: 'Tunai', callback_data: 'expense_tunai' }],
                    [{ text: '🔙 Kembali', callback_data: 'back_start' }]
                ]
            }
        });
    }
    else if (data === 'expense_gopay') {
        bot.sendMessage(chatId, '📝 *Expense via GoPay*\n\nKetik:\n*Kategori* *Nominal*\n\nContoh:\n`makan 25`\n`wifi 275`\n`mie ayam 30`', {
            parse_mode: 'Markdown',
            reply_markup: { force_reply: true }
        });
        // Set state untuk handle reply
        userState[chatId] = { action: 'expense', payment: 'GoPay', source: 'Jago' };
    }
    else if (data === 'expense_dana') {
        bot.sendMessage(chatId, '📝 *Expense via Dana*\n\nKetik:\n*Kategori* *Nominal*\n\nContoh:\n`belanja 50`', {
            parse_mode: 'Markdown'
        });
        userState[chatId] = { action: 'expense', payment: 'Dana', source: 'Dana' };
    }
    else if (data === 'expense_tunai') {
        bot.sendMessage(chatId, '📝 *Expense dari Tunai*\n\nKetik:\n*Kategori* *Nominal*\n\nContoh:\n`warung 15`\n`parkir 5`', {
            parse_mode: 'Markdown'
        });
        userState[chatId] = { action: 'expense', payment: 'Cash', source: 'Tunai' };
    }
    else if (data === 'menu_income') {
        bot.sendMessage(chatId, '📥 *Pemasukan*\n\nKetik:\n*masuk* *Nominal* *Keterangan*\n\nContoh:\n`masuk 500 gaji`\n`masuk 100 bonus`', {
            parse_mode: 'Markdown'
        });
        userState[chatId] = { action: 'income' };
    }
    else if (data === 'menu_transfer') {
        bot.sendMessage(chatId, '💸 *Transfer Antar Rekening*\n\nKetik:\n`tf [tujuan] [nominal]` (dari Jago)\natau\n`tf [source] [tujuan] [nominal]`\n\nContoh:\n`tf seabank 100` (Jago → SeaBank)\n`tf dana jago 100` (Dana → Jago)\n`tf mandiri seabank 50`', {
            parse_mode: 'Markdown'
        });
        userState[chatId] = { action: 'transfer' };
    }
    else if (data === 'menu_cash_withdraw') {
        bot.sendMessage(chatId, '💰 *Tarik Tunai*\n\nKetik:\n`cash *nominal*`\n\nContoh:\n`cash 50`\n`cash 100`\n\n💡 *Ini akan mengurangi saldo Jago dan menambah saldo Tunai*', {
            parse_mode: 'Markdown'
        });
        userState[chatId] = { action: 'cash_withdraw' };
    }
    else if (data === 'back_start') {
        bot.deleteMessage(chatId, query.message.message_id);
        bot.emit('message', {
            chat: { id: chatId },
            text: '/start',
            from: { first_name: 'User' }
        });
    }
    else if (data === 'menu_cash_deposit') {
        bot.sendMessage(chatId, '📤 *Setor Tunai ke Rekening*\n\nKetik:\n`setor [tujuan] [nominal]`\n\nContoh:\n`setor dana 50`\n`setor jago 100`\n`setor gopay 25`\n\n💡 *Ini akan mengurangi saldo Tunai dan menambah saldo tujuan*', {
            parse_mode: 'Markdown'
        });
        userState[chatId] = { action: 'cash_deposit' };
    }
});

// ===== HANDLE TEXT MESSAGES =====
const userState = {};

async function processWithState(text, chatId, state) {
    const match = text.match(/(\d+(?:[.,]\d+)?)\s*(k?)\b/i);
    let nominal = 0;

    if (match) {
        let angkaStr = match[1].replace(/[.,](?=\d{3})/g, '');
        let angka = parseFloat(angkaStr);
        if (match[2].toLowerCase() === 'k') angka *= 1000;
        nominal = angka;
    }

    const textTanpaAngka = text.replace(match ? match[0] : '', '').trim();

    if (state.action === 'expense') {
        const category = textTanpaAngka || 'Lainnya';
        await simpanTransaksi(chatId, 'EXPENSE', state.source, '', state.payment, category, nominal, '');
        bot.sendMessage(chatId, `✅ *Tercatat!*\n\n💵 Expense: Rp ${formatRupiah(nominal)}\n📂 ${category}\n💳 ${state.payment} (${state.source})`, {
            parse_mode: 'Markdown'
        });
    }
    else if (state.action === 'income') {
        await simpanTransaksi(chatId, 'INCOME', 'Jago', '', 'Transfer', 'Pemasukan', nominal, textTanpaAngka);
        bot.sendMessage(chatId, `✅ *Pemasukan Tercatat!*\n\n💰 Rp ${formatRupiah(nominal)}\n📝 ${textTanpaAngka || '-'}`, {
            parse_mode: 'Markdown'
        });
    }
    else if (state.action === 'transfer') {
        const pecahan = textWithoutNumber.split(' ');
        let source, tujuan;

        // Cek format: "[source] [tujuan] [nominal]" atau "[tujuan] [nominal]"
        if (pecahan.length >= 3) {
            // Format: dana jago 100
            source = pecahan[0];
            tujuan = pecahan[1];
        } else if (pecahan.length >= 2) {
            // Format: seabank 100 (default dari Jago)
            source = 'jago';
            tujuan = pecahan[0];
        } else {
            bot.sendMessage(chatId, '❌ Format salah!\n\nContoh:\n- `seabank 100` (dari Jago)\n- `dana jago 100` (dari Dana ke Jago)');
            return;
        }

        const normalizedSource = normalizeAccountName(source);
        const normalizedTujuan = normalizeAccountName(tujuan);

        await simpanTransaksi(chatId, 'TRANSFER', normalizedSource, normalizedTujuan, 'Transfer', 'Transfer', nominal, '');
        bot.sendMessage(chatId, `✅ *Transfer Tercatat!*\n\nFrom: ${normalizedSource}\nTo: ${normalizedTujuan}\nAmount: Rp ${formatRupiah(nominal)}`, {
            parse_mode: 'Markdown'
        });
    }
    else if (state.action === 'cash_withdraw') {
        await simpanTransaksi(chatId, 'TRANSFER_INTERNAL', 'Jago', 'Tunai', 'Cash', 'Tarik Tunai', nominal, '');
        bot.sendMessage(chatId, `✅ *Tarik Tunai Tercatat!*\n\n💵 Rp ${formatRupiah(nominal)}\nFrom: Jago → To: Tunai\n\n💡 *Ini belum expense, tunggu sampai dibelanjakan*`, {
            parse_mode: 'Markdown'
        });
    }
    else if (state.action === 'cash_deposit') {
        const pecahan = text.split(' ');
        let tujuan = pecahan[0] || pecahan[1] || '';

        if (!tujuan) {
            bot.sendMessage(chatId, '❌ Format salah!\nContoh: `setor dana 50`');
            return;
        }

        const normalizedTujuan = normalizeAccountName(tujuan);

        const success = await simpanTransaksi(chatId, 'TRANSFER_INTERNAL', 'Tunai', normalizedTujuan, 'Cash', 'Setor Tunai', nominal, '');

        if (success) {
            bot.sendMessage(chatId, `✅ *Setor Tunai Tercatat!*\n\n💵 Rp ${formatRupiah(nominal)}\nFrom: Tunai → To: ${normalizedTujuan}\n\n💡 *Saldo tunai berkurang, saldo ${normalizedTujuan} bertambah*`, {
                parse_mode: 'Markdown'
            });
        }
    }
}

async function quickParse(text, chatId) {
    let textOriginal = text;
    let textLower = text.toLowerCase().trim();

    // === Command Detection ===
    if (textLower === 'cek saldo' || textLower === 'check saldo' || textLower === 'saldo' || textLower === 'cek' || textLower === 'check') {
        const saldo = await hitungSaldo();
        bot.sendMessage(chatId, `💰 *Saldo Real-time:*\n\n${formatSaldoText(saldo)}`, {
            parse_mode: 'Markdown'
        });
        return;
    }
    if (textLower === 'laporan' || textLower === 'report' || textLower === 'rekap') {
        await generateReport(chatId);
        return;
    }
    if (textLower === 'help' || textLower === 'bantuan' || textLower === 'menu') {
        bot.sendMessage(chatId, `📖 *Perintah Cepat:*\n\n💵 *Pengeluaran:*\n- makan 25\n- wifi 275\n- kopi 15k pake dana\n\n💰 *Pemasukan:*\n- masuk 500 gaji\n- gaji 5jt\n\n💸 *Transfer:*\n- tf seabank 100\n- tf dana ke jago 1jt\n- transfer dari dana ke seabank 500k\n\n💵 *Tarik Tunai:*\n- tarik tunai 50\n- cash 100\n\n📤 *Setor Tunai:*\n- setor dana 50\n- setor jago 100`, {
            parse_mode: 'Markdown'
        });
        return;
    }

    // === Natural Language Parsing ===
    const parsed = parseNatural(textOriginal);

     // === HANDLE "SEMUA" / "SEMUALNYA" ===
    if (parsed.isAll && parsed.source) {
        const saldoSource = await getSaldoAkun(parsed.source);
        if (saldoSource > 0) {
            parsed.nominal = saldoSource;
        } else {
            bot.sendMessage(chatId, `❌ Yah, saldo ${parsed.source} kamu lagi kosong. Nggak bisa transfer semua.`);
            return;
        }
    }

    if (!parsed.nominal || parsed.nominal === 0) {
        bot.sendMessage(chatId, `🤔 Maaf, saya tidak menemukan nominal uang dalam pesanmu.\n\nContoh:\n- "makan 25"\n- "tf dana ke jago 1jt"\n- "tarik tunai 100k"`);
        return;
    }

    const nominal = parsed.nominal;

    // === TRANSFER ===
    if (parsed.type === 'TRANSFER' && parsed.source && parsed.destination) {
        const normalizedSource = normalizeAccountName(parsed.source);
        const normalizedDest = normalizeAccountName(parsed.destination);
        
        const success = await simpanTransaksi(chatId, 'TRANSFER', normalizedSource, normalizedDest, 'Transfer', 'Transfer', nominal, '');
        if (success) {
            bot.sendMessage(chatId, `✅ Transfer: ${normalizedSource} → ${normalizedDest}\nRp ${formatRupiah(nominal)}`);
        }
    }
    // === CASH WITHDRAW ===
    else if (parsed.type === 'CASH_WITHDRAW') {
        const success = await simpanTransaksi(chatId, 'TRANSFER_INTERNAL', 'Jago', 'Tunai', 'Cash', 'Tarik Tunai', nominal, '');
        if (success) {
            bot.sendMessage(chatId, `✅ Tarik Tunai: Rp ${formatRupiah(nominal)}\n(Jago → Tunai)`);
        }
    }
    // === CASH DEPOSIT ===
    else if (parsed.type === 'CASH_DEPOSIT' && parsed.destination) {
        const normalizedDest = normalizeAccountName(parsed.destination);
        const success = await simpanTransaksi(chatId, 'TRANSFER_INTERNAL', 'Tunai', normalizedDest, 'Cash', 'Setor Tunai', nominal, '');
        if (success) {
            bot.sendMessage(chatId, `✅ Setor Tunai: Rp ${formatRupiah(nominal)}\n(Tunai → ${normalizedDest})`);
        }
    }
    // === INCOME ===
    else if (parsed.type === 'INCOME') {
        const success = await simpanTransaksi(chatId, 'INCOME', 'Jago', '', 'Transfer', 'Pemasukan', nominal, parsed.notes);
        if (success) {
            bot.sendMessage(chatId, `✅ Pemasukan: Rp ${formatRupiah(nominal)}${parsed.notes ? '\n📝 ' + parsed.notes : ''}`);
        }
    }
    // === EXPENSE ===
    else if (parsed.type === 'EXPENSE') {
        const source = parsed.paymentMethod ? normalizeAccountName(parsed.paymentMethod) : 'Jago';
        const payment = parsed.paymentMethod || 'GoPay';
        const category = parsed.category || 'Lainnya';
        
        const success = await simpanTransaksi(chatId, 'EXPENSE', source, '', payment, category, nominal, parsed.notes);
        if (success) {
            bot.sendMessage(chatId, `✅ Expense: ${category}\nRp ${formatRupiah(nominal)}\nVia: ${payment} (${source})${parsed.notes ? '\n📝 ' + parsed.notes : ''}`);
        }
    }
    else {
        bot.sendMessage(chatId, `🤔 Maaf, saya belum paham maksudmu.\n\nCoba format lain:\n- "makan 25"\n- "tf dana ke jago 1jt"`);
    }
}

// === NATURAL LANGUAGE PARSER ===
function parseNatural(text) {
    const result = {
        type: null, nominal: 0, source: null, destination: null,
        paymentMethod: null, category: null, notes: '', isAll: false
    };

    let textLower = text.toLowerCase();

    // 1. Deteksi kata kunci "semua / semuanya / full"
    if (/\b(semua|semuanya|all|full)\b/i.test(textLower)) {
        result.isAll = true;
        textLower = textLower.replace(/\b(semua|semuanya|all|full)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    }

    // 2. Ekstrak Nominal
    let nominal = 0;
    let textTanpaNominal = textLower;
    
    const jtMatch = textLower.match(/(\d+(?:[.,]\d+)?)\s*(jt|juta|jutaan)\b/i);
    const kMatch = textLower.match(/(\d+(?:[.,]\d+)?)\s*(k|rb|ribu)\b/i);
    const plainMatch = textLower.match(/\b(\d{1,3}(?:[.,]\d{3})+)\b/);
    const numMatch = textLower.match(/\b(\d+)\b/);

    let matchToUse = null;
    if (jtMatch) { nominal = parseFloat(jtMatch[1].replace(/,/g, '.')) * 1000000; matchToUse = jtMatch[0]; } 
    else if (kMatch) { nominal = parseFloat(kMatch[1].replace(/,/g, '.')) * 1000; matchToUse = kMatch[0]; } 
    else if (plainMatch) { nominal = parseFloat(plainMatch[1].replace(/[.,](?=\d{3})/g, '')); matchToUse = plainMatch[0]; } 
    else if (numMatch) { nominal = parseFloat(numMatch[1]); matchToUse = numMatch[0]; }

    if (matchToUse) {
        textTanpaNominal = textLower.replace(matchToUse, ' ').replace(/\s+/g, ' ').trim();
    }
    result.nominal = nominal;

    // 3. Mapping Akun & Alias (Termasuk Typo)
    const accountMap = {
        'jago': 'Jago',
        'seabank': 'SeaBank', 'sea bank': 'SeaBank', 'sibank': 'SeaBank',
        'mandiri': 'Mandiri',
        'dana': 'Dana', 'dan': 'Dana', // Alias typo!
        'tunai': 'Tunai', 'cash': 'Tunai',
        'gopay': 'GoPay', 'go pay': 'GoPay'
    };

    // 4. Cari Akun Berdasarkan URUTAN KEMUNCULAN di Teks
    const foundAccounts = [];
    Object.keys(accountMap).forEach(accountKey => {
        const regex = new RegExp('\\b' + accountKey + '\\b', 'gi');
        let match;
        while ((match = regex.exec(textTanpaNominal)) !== null) {
            foundAccounts.push({ name: accountMap[accountKey], index: match.index });
        }
    });

    // Urutkan dari kiri ke kanan (kiri = source, kanan = destination)
    foundAccounts.sort((a, b) => a.index - b.index);
    
    const uniqueAccounts = [];
    foundAccounts.forEach(acc => {
        if (!uniqueAccounts.find(u => u.name === acc.name)) uniqueAccounts.push(acc);
    });
    
    const normalizedAccounts = uniqueAccounts.map(acc => acc.name);

    // 5. Deteksi Keyword Transaksi
    const hasTransferKeyword = /\b(transfer|tf|kirim)\b/i.test(textLower);
    const hasIncomeKeyword = /\b(masuk|gaji|bonus|penghasilan|honor|dapat)\b/i.test(textLower);
    const hasWithdrawKeyword = /\b(tarik|ambil|atm|wd)\b/i.test(textLower);
    const hasDepositKeyword = /\b(setor|deposit|topup|top up|isi)\b/i.test(textLower);

    // 6. Logika Cerdas Transfer (Paham "ke", "dari", "to")
    if (hasWithdrawKeyword && (!hasTransferKeyword || normalizedAccounts.length === 0)) {
        result.type = 'CASH_WITHDRAW';
    }
    else if (hasDepositKeyword && normalizedAccounts.length >= 1) {
        result.type = 'CASH_DEPOSIT';
        result.destination = normalizedAccounts.find(acc => acc !== 'Tunai') || normalizedAccounts[0];
    }
    else if (hasIncomeKeyword) {
        result.type = 'INCOME';
    }
    else if (hasTransferKeyword || normalizedAccounts.length >= 2) {
        result.type = 'TRANSFER';
        if (normalizedAccounts.length >= 2) {
            const acc1 = uniqueAccounts[0]; // Akun pertama di teks
            const acc2 = uniqueAccounts[1]; // Akun kedua di teks
            
            const textBetween = textTanpaNominal.substring(acc1.index + acc1.name.length, acc2.index);
            const textBefore = textTanpaNominal.substring(0, acc1.index);
            
            // Default: Kiri = Source, Kanan = Destination
            let source = acc1.name;
            let dest = acc2.name;
            
            // Kalau ada kata "ke" SEBELUM akun pertama (misal: "tf ke jago dari dana")
            if (/ke/i.test(textBefore)) {
                source = acc2.name;
                dest = acc1.name;
            }
            // Kalau ada kata "dari" DI ANTARA kedua akun (misal: "tf jago dari dana")
            else if (/dari|from/i.test(textBetween)) {
                source = acc2.name;
                dest = acc1.name;
            }
            // Kalau ada kata "ke" DI ANTARA kedua akun (misal: "tf dana ke jago")
            else if (/ke|to/i.test(textBetween)) {
                source = acc1.name;
                dest = acc2.name;
            }
            
            result.source = source;
            result.destination = dest;
        } else if (normalizedAccounts.length === 1) {
            result.source = 'Jago';
            result.destination = normalizedAccounts[0];
        }
    }
    else {
        // Default: EXPENSE
        result.type = 'EXPENSE';
        if (normalizedAccounts.includes('Tunai')) {
            result.paymentMethod = 'Cash';
            result.source = 'Tunai';
        } else if (normalizedAccounts.length >= 1) {
            result.paymentMethod = normalizedAccounts[0];
            result.source = normalizedAccounts[0];
        } else {
            result.paymentMethod = 'GoPay';
            result.source = 'Jago';
        }
        
        const sisaKata = textTanpaNominal.split(' ').filter(word => !Object.values(accountMap).includes(word) && word.length > 2);
        result.category = sisaKata[0] || 'Lainnya';
        result.notes = sisaKata.slice(1).join(' ');
    }

    return result;
}

// Normalisasi nama akun agar case-insensitive
function normalizeAccountName(name) {
    const lower = name.toLowerCase();
    const accountMap = {
        'jago': 'Jago',
        'seabank': 'SeaBank',
        'mandiri': 'Mandiri',
        'dana': 'Dana',
        'tunai': 'Tunai',
        'gopay': 'GoPay'
    };
    return accountMap[lower] || name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

async function getSaldoAkun(akunName) {
    const saldo = await hitungSaldo();
    const normalized = normalizeAccountName(akunName);
    return saldo[normalized] || 0;
}

async function simpanTransaksi(chatId, type, source, dest, payment, category, amount, notes, skipValidation = false) {
    try {
        // Normalisasi nama akun
        const sourceNorm = normalizeAccountName(source);
        const destNorm = dest ? normalizeAccountName(dest) : '';

        // Validasi saldo cukup (untuk expense, transfer, cash withdraw)
        if (!skipValidation) {
            if (type === 'EXPENSE' || type === 'TRANSFER' || type === 'TRANSFER_INTERNAL') {
                const saldoSource = await getSaldoAkun(sourceNorm);

                if (type === 'TRANSFER_INTERNAL' && sourceNorm === 'Tunai') {
                    // Setor tunai: cek saldo tunai
                    if (saldoSource < amount) {
                        bot.sendMessage(chatId, `❌ *Saldo Tunai tidak cukup!*\n\nSaldo Tunai kamu: Rp ${formatRupiah(saldoSource)}\nYang mau disetor: Rp ${formatRupiah(amount)}\n\n💡 *Tarik tunai dulu jika perlu*`, {
                            parse_mode: 'Markdown'
                        });
                        return false;
                    }
                } else if (type === 'EXPENSE') {
                    // Expense: cek saldo source
                    if (saldoSource < amount) {
                        bot.sendMessage(chatId, `❌ *Saldo ${sourceNorm} tidak cukup!*\n\nSaldo ${sourceNorm}: Rp ${formatRupiah(saldoSource)}\nYang mau dikeluarkan: Rp ${formatRupiah(amount)}`, {
                            parse_mode: 'Markdown'
                        });
                        return false;
                    }
                } else if (type === 'TRANSFER') {
                    // Transfer antar rekening: cek saldo source
                    if (saldoSource < amount) {
                        bot.sendMessage(chatId, `❌ *Saldo ${sourceNorm} tidak cukup!*\n\nSaldo ${sourceNorm}: Rp ${formatRupiah(saldoSource)}\nYang mau ditransfer: Rp ${formatRupiah(amount)}`, {
                            parse_mode: 'Markdown'
                        });
                        return false;
                    }
                } else if (type === 'TRANSFER_INTERNAL' && sourceNorm === 'Jago') {
                    // Tarik tunai dari Jago
                    if (saldoSource < amount) {
                        bot.sendMessage(chatId, `❌ *Saldo ${sourceNorm} tidak cukup!*\n\nSaldo ${sourceNorm}: Rp ${formatRupiah(saldoSource)}\nYang mau ditarik: Rp ${formatRupiah(amount)}`, {
                            parse_mode: 'Markdown'
                        });
                        return false;
                    }
                }
            }
        }

        const authClient = await auth.getClient();
        const now = new Date();

        const dateStr = now.toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        const rowValues = [
            Date.now(),
            dateStr,
            type,
            sourceNorm,           // Gunakan nama yang sudah dinormalisasi
            destNorm,             // Gunakan nama yang sudah dinormalisasi
            payment,
            category,
            amount,
            notes,
            now.toISOString()
        ];

        await sheets.spreadsheets.values.append({
            auth: authClient,
            spreadsheetId: SPREADSHEET_ID,
            range: 'transactions!A:J',
            valueInputOption: 'RAW',
            resource: { values: [rowValues] }
        });

        console.log('✅ Saved:', type, sourceNorm, '→', destNorm, amount);
        return true;
    } catch (error) {
        console.error('❌ Error:', error.message);
        bot.sendMessage(chatId, '⚠️ Gagal simpan ke spreadsheet');
        return false;
    }
}

async function hitungSaldo() {
    try {
        const authClient = await auth.getClient();

        const response = await sheets.spreadsheets.values.get({
            auth: authClient,
            spreadsheetId: SPREADSHEET_ID,
            range: 'transactions!C:I'
        });

        const rows = response.data.values || [];
        let saldo = {
            'Jago': 0,
            'SeaBank': 0,
            'Mandiri': 0,
            'Dana': 0,
            'Tunai': 0
        };

        rows.forEach((row, index) => {
            if (index === 0) return;

            const type = row[0] || '';
            const source = normalizeAccountName(row[1] || '');
            const dest = row[2] ? normalizeAccountName(row[2]) : '';
            const amountRaw = row[5] || '0';

            let amount = 0;
            if (typeof amountRaw === 'string') {
                const cleanAmount = amountRaw.replace(/Rp\s?/gi, '').replace(/\./g, '').replace(/,/g, '.');
                amount = parseFloat(cleanAmount) || 0;
            } else {
                amount = parseFloat(amountRaw) || 0;
            }

            if (type === 'INCOME') {
                if (saldo[source] !== undefined) {
                    saldo[source] += amount;
                }
            } else if (type === 'EXPENSE') {
                if (saldo[source] !== undefined) {
                    saldo[source] -= amount;
                }
            } else if (type === 'TRANSFER') {
                if (saldo[source] !== undefined) {
                    saldo[source] -= amount;
                }
                if (dest && saldo[dest] !== undefined) {
                    saldo[dest] += amount;
                }
            } else if (type === 'TRANSFER_INTERNAL') {
                if (saldo[source] !== undefined) {
                    saldo[source] -= amount;
                }
                if (dest && saldo[dest] !== undefined) {
                    saldo[dest] += amount;
                }
            }
        });

        return saldo;
    } catch (error) {
        console.error('❌ Error hitung saldo:', error.message);
        return { 'Jago': 0, 'SeaBank': 0, 'Mandiri': 0, 'Dana': 0, 'Tunai': 0 };
    }
}

function formatSaldoText(saldo) {
    return Object.entries(saldo)
        .map(([akun, jumlah]) => `${akun}: Rp ${formatRupiah(jumlah)}`)
        .join('\n');
}

function formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID').format(angka);
}

async function generateReport(chatId) {
    try {
        const authClient = await auth.getClient();
        const now = new Date();
        const currentMonth = now.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        
        const response = await sheets.spreadsheets.values.get({
            auth: authClient,
            spreadsheetId: SPREADSHEET_ID,
            range: 'transactions!C:I'
        });
        
        const rows = response.data.values || [];
        let totalIncome = 0;
        let totalExpense = 0;
        let expensesByCategory = {};
        let expensesByAccount = {};
        let transactionCount = 0;
        
        rows.forEach((row, index) => {
            if (index === 0) return;
            
            const type = row[0];
            const source = row[1];
            const category = row[4] || 'Lainnya';
            const amountRaw = row[5] || '0';
            
            let amount = 0;
            if (typeof amountRaw === 'string') {
                const cleanAmount = amountRaw.replace(/Rp\s?/gi, '').replace(/\./g, '').replace(/,/g, '.');
                amount = parseFloat(cleanAmount) || 0;
            } else {
                amount = parseFloat(amountRaw) || 0;
            }
            
            if (type === 'INCOME') {
                totalIncome += amount;
            } else if (type === 'EXPENSE') {
                totalExpense += amount;
                transactionCount++;
                
                // Group by category
                expensesByCategory[category] = (expensesByCategory[category] || 0) + amount;
                
                // Group by account
                expensesByAccount[source] = (expensesByAccount[source] || 0) + amount;
            }
        });
        
        const netSavings = totalIncome - totalExpense;
        
        // === FORMAT LAPORAN ===
        let reportText = `📊 *LAPORAN ${currentMonth.toUpperCase()}*\n`;
        reportText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        // Summary Cards
        reportText += `💰 *RINGKASAN*\n`;
        reportText += `📥 Pemasukan: *Rp ${formatRupiah(totalIncome)}*\n`;
        reportText += `📤 Pengeluaran: *Rp ${formatRupiah(totalExpense)}*\n`;
        reportText += `${netSavings >= 0 ? '✅' : '⚠️'} Saldo: *Rp ${formatRupiah(netSavings)}*\n\n`;
        
        // Top Expenses
        if (Object.keys(expensesByCategory).length > 0) {
            reportText += `🔥 *TOP PENGELUARAN*\n`;
            
            const sortedCategories = Object.entries(expensesByCategory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            
            sortedCategories.forEach(([category, amount], index) => {
                const percentage = totalExpense > 0 ? ((amount / totalExpense) * 100).toFixed(1) : 0;
                const emoji = getCategoryEmoji(category);
                reportText += `${index + 1}. ${emoji} ${category}: *Rp ${formatRupiah(amount)}* (${percentage}%)\n`;
            });
            reportText += `\n`;
        }
        
        // Expenses by Account
        if (Object.keys(expensesByAccount).length > 0) {
            reportText += `💳 *PENGELUARAN PER AKUN*\n`;
            Object.entries(expensesByAccount).forEach(([account, amount]) => {
                reportText += `• ${account}: Rp ${formatRupiah(amount)}\n`;
            });
            reportText += `\n`;
        }
        
        // Stats
        reportText += `📈 *STATISTIK*\n`;
        reportText += `Total Transaksi: ${transactionCount}x\n`;
        const avgExpense = transactionCount > 0 ? totalExpense / transactionCount : 0;
        reportText += `Rata-rata: Rp ${formatRupiah(avgExpense)}/transaksi\n`;
        
        // Send report
        bot.sendMessage(chatId, reportText, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error('Error generate report:', error);
        bot.sendMessage(chatId, '⚠️ Gagal generate laporan');
    }
}

// Helper function for category emojis
function getCategoryEmoji(category) {
    const categoryLower = category.toLowerCase();
    if (categoryLower.includes('makan') || categoryLower.includes('makan') || categoryLower.includes('food')) return '🍜';
    if (categoryLower.includes('belanja') || categoryLower.includes('shop')) return '🛒';
    if (categoryLower.includes('transport') || categoryLower.includes('bensin') || categoryLower.includes('ojek')) return '🚗';
    if (categoryLower.includes('wifi') || categoryLower.includes('internet') || categoryLower.includes('pulsa')) return '📶';
    if (categoryLower.includes('tagihan') || categoryLower.includes('bill')) return '💡';
    if (categoryLower.includes('hiburan') || categoryLower.includes('nonton') || categoryLower.includes('game')) return '🎬';
    if (categoryLower.includes('kesehatan') || categoryLower.includes('obat')) return '💊';
    return '💸';
}