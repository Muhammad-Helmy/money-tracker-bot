const { google } = require('googleapis');

// Parse credentials dari environment variable
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const token = process.env.TELEGRAM_BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const ADMIN_CHAT_ID = '6670031254'; // Chat ID kamu (Heru)

// Setup Google Sheets
const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: 'https://www.googleapis.com/auth/spreadsheets',
});
const sheets = google.sheets('v4');

// ===== NOTIFIKASI ERROR KE ADMIN =====
async function sendErrorNotification(error, context = {}) {
    try {
        const timestamp = new Date().toLocaleString('id-ID', { 
            timeZone: 'Asia/Jakarta',
            dateStyle: 'short',
            timeStyle: 'medium'
        });
        
        let message = `🚨 *ERROR ALERT*\n\n`;
        message += `*Error:* ${error.message || 'Unknown error'}\n`;
        
        if (context.chatId) message += `*User Chat ID:* ${context.chatId}\n`;
        if (context.userName) message += `*User:* ${context.userName}\n`;
        if (context.userMessage) message += `*Pesan User:* ${context.userMessage}\n`;
        if (context.action) message += `*Action:* ${context.action}\n`;
        
        message += `\n*Waktu:* ${timestamp}`;
        
        await sendMessage(ADMIN_CHAT_ID, message);
    } catch (notifError) {
        console.error('Gagal kirim notifikasi error:', notifError);
    }
}

// ===== VERCEL SERVERLESS HANDLER =====
module.exports = async (req, res) => {
    try {
        // Hanya terima POST request dari Telegram
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        const update = req.body;
        
        // Handle message
        if (update.message) {
            await handleMessage(update.message);
        }
        // Handle callback query (inline buttons)
        else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
        }

        // Response ke Telegram (wajib)
        res.status(200).json({ ok: true });
        } catch (error) {
        console.error('Error:', error);
        
        // Kirim notifikasi ke admin
        await sendErrorNotification(error, {
            action: 'Main handler',
            details: JSON.stringify(req.body).substring(0, 200)
        });
        
        res.status(500).json({ error: error.message });
    }
};

// ===== HELPER FUNCTIONS FOR TELEGRAM API =====
async function sendMessage(chatId, text, options = {}) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        ...options
    };

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

async function answerCallbackQuery(callbackQueryId) {
    const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
    
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId })
    });
}

async function deleteMessage(chatId, messageId) {
    const url = `https://api.telegram.org/bot${token}/deleteMessage`;
    
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId })
    });
}

// ===== HANDLE MESSAGE =====
async function handleMessage(msg) {
    const text = msg.text;
    const chatId = msg.chat.id;

    if (!text) return;

    if (text === '/start') {
        await sendStartMessage(chatId, msg.from.first_name);
        return;
    }

    // === HANDLE PERSISTENT MENU BUTTONS ===
    if (text === '💵 Expense') {
        await sendMessage(chatId, '💵 *Expense dari mana?*\n\nKetik langsung:\n- `makan 25`\n- `beli kopi 15k pake dana`\n- `wifi 275`');
        return;
    }
    else if (text === '📥 Pemasukan') {
        await sendMessage(chatId, '📥 *Pemasukan*\n\nKetik:\n- `gaji 5jt`\n- `masuk 500 bonus`\n- `dapat honor 1jt`');
        return;
    }
    else if (text === '💸 Transfer') {
        await sendMessage(chatId, '💸 *Transfer Antar Rekening*\n\nKetik:\n- `tf dana ke jago 100k`\n- `tf seabank 50`\n- `tf dari dana ke jago semuanya`');
        return;
    }
    else if (text === '💰 Tarik Tunai') {
        await sendMessage(chatId, '💰 *Tarik Tunai*\n\nKetik:\n- `tarik tunai 100k`\n- `ambil atm 50`\n- `cash 200`');
        return;
    }
    else if (text === '📤 Setor Tunai') {
        await sendMessage(chatId, '📤 *Setor Tunai*\n\nKetik:\n- `setor dana 50k`\n- `topup gopay 100`\n- `deposit jago 200`');
        return;
    }
    else if (text === '📊 Cek Saldo') {
        const saldo = await hitungSaldo();
        await sendMessage(chatId, `💰 *Saldo Real-time:*\n\n${formatSaldoText(saldo)}`);
        return;
    }
    else if (text === '📋 Laporan') {
        await generateReport(chatId);
        return;
    }
        else if (text === '📜 Riwayat' || text.toLowerCase() === 'riwayat' || text.toLowerCase() === '/riwayat') {
        await tampilkanRiwayat(chatId, 5);
        return;
    }

    // === QUICK PARSER ===
    await quickParse(text, chatId);
}

// ===== HANDLE CALLBACK QUERY =====
async function handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const data = query.data;

    await answerCallbackQuery(query.id);

    if (data === 'check_balance') {
        const saldo = await hitungSaldo();
        await sendMessage(chatId, `💰 *Saldo Real-time:*\n\n${formatSaldoText(saldo)}`);
    }
}

// ===== SEND START MESSAGE =====
async function sendStartMessage(chatId, nama) {
    const saldo = await hitungSaldo();
    
        const mainKeyboard = {
        keyboard: [
            [{ text: '💵 Expense' }, { text: ' Pemasukan' }, { text: ' Transfer' }],
            [{ text: ' Tarik Tunai' }, { text: ' Setor Tunai' }],
            [{ text: '📊 Cek Saldo' }, { text: '📜 Riwayat' }, { text: '📋 Laporan' }] // Tambah Riwayat di sini
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    };

    await sendMessage(chatId, `Halo ${nama}! 👋\n\n💰 *Saldo Saat Ini:*\n${formatSaldoText(saldo)}\n\nSilakan pilih menu di bawah:`, {
        reply_markup: mainKeyboard
    });
}

// ===== QUICK PARSER =====
async function quickParse(text, chatId) {
    let textOriginal = text;
    let textLower = text.toLowerCase().trim();

    // === Command Detection ===
    if (textLower === 'cek saldo' || textLower === 'check saldo' || textLower === 'saldo' || textLower === 'cek' || textLower === 'check') {
        const saldo = await hitungSaldo();
        await sendMessage(chatId, `💰 *Saldo Real-time:*\n\n${formatSaldoText(saldo)}`);
        return;
    }
    if (textLower === 'laporan' || textLower === 'report' || textLower === 'rekap') {
        await generateReport(chatId);
        return;
    }
    if (textLower === 'help' || textLower === 'bantuan' || textLower === 'menu') {
        await sendMessage(chatId, `📖 *Perintah Cepat:*\n\n💵 *Pengeluaran:*\n- makan 25\n- wifi 275\n- kopi 15k pake dana\n\n💰 *Pemasukan:*\n- masuk 500 gaji\n- gaji 5jt\n\n💸 *Transfer:*\n- tf seabank 100\n- tf dana ke jago 1jt\n- transfer dari dana ke seabank 500k\n\n💵 *Tarik Tunai:*\n- tarik tunai 50\n- cash 100\n\n📤 *Setor Tunai:*\n- setor dana 50\n- setor jago 100`);
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
            await sendMessage(chatId, `❌ Yah, saldo ${parsed.source} kamu lagi kosong. Nggak bisa transfer semua.`);
            return;
        }
    }

    if (!parsed.nominal || parsed.nominal === 0) {
        await sendMessage(chatId, `🤔 Maaf, saya tidak menemukan nominal uang dalam pesanmu.\n\nContoh:\n- "makan 25"\n- "tf dana ke jago 1jt"\n- "tarik tunai 100k"`);
        return;
    }

    const nominal = parsed.nominal;

    // === TRANSFER ===
    if (parsed.type === 'TRANSFER' && parsed.source && parsed.destination) {
        const normalizedSource = normalizeAccountName(parsed.source);
        const normalizedDest = normalizeAccountName(parsed.destination);
        
        const success = await simpanTransaksi(chatId, 'TRANSFER', normalizedSource, normalizedDest, 'Transfer', 'Transfer', nominal, '');
        if (success) {
            await sendMessage(chatId, `✅ Transfer: ${normalizedSource} → ${normalizedDest}\nRp ${formatRupiah(nominal)}`);
        }
    }
    // === CASH WITHDRAW ===
    else if (parsed.type === 'CASH_WITHDRAW') {
        const success = await simpanTransaksi(chatId, 'TRANSFER_INTERNAL', 'Jago', 'Tunai', 'Cash', 'Tarik Tunai', nominal, '');
        if (success) {
            await sendMessage(chatId, `✅ Tarik Tunai: Rp ${formatRupiah(nominal)}\n(Jago → Tunai)`);
        }
    }
    // === CASH DEPOSIT ===
    else if (parsed.type === 'CASH_DEPOSIT' && parsed.destination) {
        const normalizedDest = normalizeAccountName(parsed.destination);
        const success = await simpanTransaksi(chatId, 'TRANSFER_INTERNAL', 'Tunai', normalizedDest, 'Cash', 'Setor Tunai', nominal, '');
        if (success) {
            await sendMessage(chatId, `✅ Setor Tunai: Rp ${formatRupiah(nominal)}\n(Tunai → ${normalizedDest})`);
        }
    }
    // === INCOME ===
    else if (parsed.type === 'INCOME') {
        const success = await simpanTransaksi(chatId, 'INCOME', 'Jago', '', 'Transfer', 'Pemasukan', nominal, parsed.notes);
        if (success) {
            await sendMessage(chatId, `✅ Pemasukan: Rp ${formatRupiah(nominal)}${parsed.notes ? '\n📝 ' + parsed.notes : ''}`);
        }
    }
        // === EXPENSE ===
    else if (parsed.type === 'EXPENSE') {
        let payment = parsed.paymentMethod || 'GoPay';
        let source = 'Jago'; // Default source selalu Jago
        
        // Mapping payment method ke source account
        if (payment.toLowerCase() === 'gopay' || payment.toLowerCase() === 'go pay') {
            source = 'Jago'; // GoPay linked to Jago
        } else if (payment.toLowerCase() === 'dana') {
            source = 'Dana';
        } else if (payment.toLowerCase() === 'cash' || payment.toLowerCase() === 'tunai') {
            source = 'Tunai';
            payment = 'Cash';
        } else if (payment.toLowerCase() === 'seabank' || payment.toLowerCase() === 'sea bank') {
            source = 'SeaBank';
        } else if (payment.toLowerCase() === 'mandiri') {
            source = 'Mandiri';
        }
        
        const category = parsed.category || 'Lainnya';
        
        const success = await simpanTransaksi(chatId, 'EXPENSE', source, '', payment, category, nominal, parsed.notes);
        if (success) {
            const paymentText = payment === 'GoPay' ? 'GoPay (Jago)' : payment;
            await sendMessage(chatId, `✅ Expense: ${category}\nRp ${formatRupiah(nominal)}\nVia: ${paymentText}${parsed.notes ? '\n📝 ' + parsed.notes : ''}`);
        }
    }
    else {
        await sendMessage(chatId, `🤔 Maaf, saya belum paham maksudmu.\n\nCoba format lain:\n- "makan 25"\n- "tf dana ke jago 1jt"`);
    }
}

// ===== NATURAL LANGUAGE PARSER =====
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

    // 3. Mapping Akun & Alias
    const accountMap = {
        'jago': 'Jago',
        'seabank': 'SeaBank', 'sea bank': 'SeaBank', 'sibank': 'SeaBank',
        'mandiri': 'Mandiri',
        'dana': 'Dana', 'dan': 'Dana',
        'tunai': 'Tunai', 'cash': 'Tunai',
        'gopay': 'GoPay', 'go pay': 'GoPay'
    };

    // 4. Cari Akun Berdasarkan URUTAN KEMUNCULAN
    const foundAccounts = [];
    Object.keys(accountMap).forEach(accountKey => {
        const regex = new RegExp('\\b' + accountKey + '\\b', 'gi');
        let match;
        while ((match = regex.exec(textTanpaNominal)) !== null) {
            foundAccounts.push({ name: accountMap[accountKey], index: match.index });
        }
    });

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

    // 6. Logika Cerdas Transfer
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
            const acc1 = uniqueAccounts[0];
            const acc2 = uniqueAccounts[1];
            
            const textBetween = textTanpaNominal.substring(acc1.index + acc1.name.length, acc2.index);
            const textBefore = textTanpaNominal.substring(0, acc1.index);
            
            let source = acc1.name;
            let dest = acc2.name;
            
            if (/ke/i.test(textBefore)) {
                source = acc2.name;
                dest = acc1.name;
            }
            else if (/dari|from/i.test(textBetween)) {
                source = acc2.name;
                dest = acc1.name;
            }
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
        
        // Deteksi payment method dari teks
        if (normalizedAccounts.includes('Tunai') || textLower.includes('tunai') || textLower.includes('cash')) {
            result.paymentMethod = 'Cash';
            result.source = 'Tunai';
        } else if (normalizedAccounts.includes('Dana') || textLower.includes('dana')) {
            result.paymentMethod = 'Dana';
            result.source = 'Dana';
        } else if (normalizedAccounts.includes('SeaBank') || textLower.includes('seabank') || textLower.includes('sea bank')) {
            result.paymentMethod = 'SeaBank';
            result.source = 'SeaBank';
        } else if (normalizedAccounts.includes('Mandiri')) {
            result.paymentMethod = 'Mandiri';
            result.source = 'Mandiri';
        } else {
            // Default: GoPay (yang linked ke Jago)
            result.paymentMethod = 'GoPay';
            result.source = 'Jago';
        }
        
        const sisaKata = textTanpaNominal.split(' ').filter(word => !Object.values(accountMap).includes(word) && word.length > 2);
        result.category = sisaKata[0] || 'Lainnya';
        result.notes = sisaKata.slice(1).join(' ');
    }

    return result;
}

// ===== UTILITY FUNCTIONS =====
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
        const sourceNorm = normalizeAccountName(source);
        const destNorm = dest ? normalizeAccountName(dest) : '';

        if (!skipValidation) {
            if (type === 'EXPENSE' || type === 'TRANSFER' || type === 'TRANSFER_INTERNAL') {
                const saldoSource = await getSaldoAkun(sourceNorm);

                if (type === 'TRANSFER_INTERNAL' && sourceNorm === 'Tunai') {
                    if (saldoSource < amount) {
                        await sendMessage(chatId, `❌ *Saldo Tunai tidak cukup!*\n\nSaldo Tunai kamu: Rp ${formatRupiah(saldoSource)}\nYang mau disetor: Rp ${formatRupiah(amount)}\n\n💡 *Tarik tunai dulu jika perlu*`);
                        return false;
                    }
                } else if (type === 'EXPENSE') {
                    if (saldoSource < amount) {
                        await sendMessage(chatId, `❌ *Saldo ${sourceNorm} tidak cukup!*\n\nSaldo ${sourceNorm}: Rp ${formatRupiah(saldoSource)}\nYang mau dikeluarkan: Rp ${formatRupiah(amount)}`);
                        return false;
                    }
                } else if (type === 'TRANSFER') {
                    if (saldoSource < amount) {
                        await sendMessage(chatId, `❌ *Saldo ${sourceNorm} tidak cukup!*\n\nSaldo ${sourceNorm}: Rp ${formatRupiah(saldoSource)}\nYang mau ditransfer: Rp ${formatRupiah(amount)}`);
                        return false;
                    }
                } else if (type === 'TRANSFER_INTERNAL' && sourceNorm === 'Jago') {
                    if (saldoSource < amount) {
                        await sendMessage(chatId, `❌ *Saldo ${sourceNorm} tidak cukup!*\n\nSaldo ${sourceNorm}: Rp ${formatRupiah(saldoSource)}\nYang mau ditarik: Rp ${formatRupiah(amount)}`);
                        return false;
                    }
                }
            }
        }

        // === SIMPAN KE GOOGLE SHEETS ===
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
            sourceNorm,
            destNorm,
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

        // === FITUR: BUDGET ALERT (Hanya untuk Expense) ===
        if (type === 'EXPENSE') {
            const BUDGET_LIMIT = 1000000;
            const totalExpenseBulanIni = await getTotalExpenseBulanIni();
            
            if (totalExpenseBulanIni > BUDGET_LIMIT) {
                const sisa = totalExpenseBulanIni - BUDGET_LIMIT;
                await sendMessage(chatId, `⚠️ *ALERT BUDGET TERLALUI!*\n\nKamu sudah belanja *Rp ${formatRupiah(totalExpenseBulanIni)}* bulan ini.\nMelebihi budget *Rp ${formatRupiah(BUDGET_LIMIT)}* sebesar *Rp ${formatRupiah(sisa)}*.\n\nRem pengeluaranmu sekarang! 🛑`);
            } else {
                const sisaBudget = BUDGET_LIMIT - totalExpenseBulanIni;
                await sendMessage(chatId, `💡 *Info Budget:* Sisa budget bulan ini Rp ${formatRupiah(sisaBudget)}`);
            }
        }

        return true;
        } catch (error) {
        console.error('❌ Error:', error.message);
        
        // Kirim notifikasi ke admin
        await sendErrorNotification(error, {
            chatId: chatId,
            action: `Simpan transaksi ${type}`,
            details: `${sourceNorm} → ${destNorm}, Rp ${amount}`
        });
        
        await sendMessage(chatId, '⚠️ Gagal simpan ke Database');
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
        
        await sendErrorNotification(error, {
            action: 'Hitung saldo'
        });
        
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
                
                expensesByCategory[category] = (expensesByCategory[category] || 0) + amount;
                expensesByAccount[source] = (expensesByAccount[source] || 0) + amount;
            }
        });
        
        const netSavings = totalIncome - totalExpense;
        
        let reportText = `📊 *LAPORAN ${currentMonth.toUpperCase()}*\n`;
        reportText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        reportText += `💰 *RINGKASAN*\n`;
        reportText += `📥 Pemasukan: *Rp ${formatRupiah(totalIncome)}*\n`;
        reportText += `📤 Pengeluaran: *Rp ${formatRupiah(totalExpense)}*\n`;
        reportText += `${netSavings >= 0 ? '✅' : '⚠️'} Saldo: *Rp ${formatRupiah(netSavings)}*\n\n`;
        
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
        
        if (Object.keys(expensesByAccount).length > 0) {
            reportText += `💳 *PENGELUARAN PER AKUN*\n`;
            Object.entries(expensesByAccount).forEach(([account, amount]) => {
                reportText += `• ${account}: Rp ${formatRupiah(amount)}\n`;
            });
            reportText += `\n`;
        }
        
        reportText += `📈 *STATISTIK*\n`;
        reportText += `Total Transaksi: ${transactionCount}x\n`;
        const avgExpense = transactionCount > 0 ? totalExpense / transactionCount : 0;
        reportText += `Rata-rata: Rp ${formatRupiah(avgExpense)}/transaksi\n`;
        
        await sendMessage(chatId, reportText);
        
        } catch (error) {
        console.error('Error generate report:', error);
        
        await sendErrorNotification(error, {
            chatId: chatId,
            action: 'Generate laporan'
        });
        
        await sendMessage(chatId, '⚠️ Gagal generate laporan');
    }
}

function getCategoryEmoji(category) {
    const categoryLower = category.toLowerCase();
    if (categoryLower.includes('makan') || categoryLower.includes('food')) return '🍜';
    if (categoryLower.includes('belanja') || categoryLower.includes('shop')) return '🛒';
    if (categoryLower.includes('transport') || categoryLower.includes('bensin') || categoryLower.includes('ojek')) return '🚗';
    if (categoryLower.includes('wifi') || categoryLower.includes('internet') || categoryLower.includes('pulsa')) return '📶';
    if (categoryLower.includes('tagihan') || categoryLower.includes('bill')) return '💡';
    if (categoryLower.includes('hiburan') || categoryLower.includes('nonton') || categoryLower.includes('game')) return '🎬';
    if (categoryLower.includes('kesehatan') || categoryLower.includes('obat')) return '💊';
    return '💸';
}

// Helper untuk hitung total expense bulan ini
async function getTotalExpenseBulanIni() {
    try {
        const authClient = await auth.getClient();
        const response = await sheets.spreadsheets.values.get({
            auth: authClient,
            spreadsheetId: SPREADSHEET_ID,
            range: 'transactions!C:I'
        });
        
        const rows = response.data.values || [];
        let total = 0;
        const bulanIni = new Date().getMonth(); // 0-11
        
        rows.forEach((row, index) => {
            if (index === 0) return;
            const type = row[0];
            const amountRaw = row[5] || '0';
            // Kita asumsikan semua expense masuk hitungan (untuk simplifikasi)
            if (type === 'EXPENSE') {
                let amount = 0;
                if (typeof amountRaw === 'string') {
                    const cleanAmount = amountRaw.replace(/Rp\s?/gi, '').replace(/\./g, '').replace(/,/g, '.');
                    amount = parseFloat(cleanAmount) || 0;
                } else {
                    amount = parseFloat(amountRaw) || 0;
                }
                total += amount;
            }
        });
        return total;
    } catch (error) {
        return 0;
    }
}

async function tampilkanRiwayat(chatId, limit = 10) {
    try {
        const authClient = await auth.getClient();
        const response = await sheets.spreadsheets.values.get({
            auth: authClient,
            spreadsheetId: SPREADSHEET_ID,
            range: 'transactions!A:J'
        });
        
        const rows = response.data.values || [];
        
        // Skip header (row pertama)
        const dataRows = rows.slice(1);
        
        // Ambil N transaksi terbaru, tapi TIDAK di-reverse
        // Jadi urutan tetap: lama -> baru
        const recentData = dataRows.slice(-limit);
        
        if (recentData.length === 0) {
            await sendMessage(chatId, '📜 Belum ada riwayat transaksi.');
            return;
        }

        let reportText = `📜 *${recentData.length} Transaksi Terakhir:*\n\n`;
        
        recentData.forEach((row, idx) => {
            const date = row[1] || '-';
            const type = row[2] || 'EXPENSE';
            const category = row[6] || '-';
            const amountRaw = row[7] || '0';
            
            let amount = 0;
            if (typeof amountRaw === 'string') {
                const cleanAmount = amountRaw.replace(/Rp\s?/gi, '').replace(/\./g, '').replace(/,/g, '.');
                amount = parseFloat(cleanAmount) || 0;
            } else {
                amount = parseFloat(amountRaw) || 0;
            }
            
            let icon = '📤';
            if (type === 'INCOME') icon = '📥';
            else if (type.includes('TRANSFER')) icon = '💸';
            
            // Nomor urut dimulai dari 1
            const nomor = idx + 1;
            
            reportText += `${nomor}. ${icon} *${category}* - Rp ${formatRupiah(amount)}\n`;
            reportText += `    ${date}\n\n`;
        });

        await sendMessage(chatId, reportText);
    } catch (error) {
        console.error('Error riwayat:', error);
        
        await sendErrorNotification(error, {
            chatId: chatId,
            action: 'Tampilkan riwayat'
        });
        
        await sendMessage(chatId, 'Gagal mengambil riwayat.');
    }
}