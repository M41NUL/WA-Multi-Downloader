#!/usr/bin/env node
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from 'atexovi-baileys';
import pino from 'pino';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import process from 'process';
import dotenv from 'dotenv';
import { handler } from './src/handler.js';
import { wrapSendMessageGlobally } from './src/utils/typing.js';
import config from './config.js';

dotenv.config({ debug: false });

const originalError = console.error;
const originalLog = console.log;
const originalStdoutWrite = process.stdout.write;

const FILTER_PATTERNS = [
  'Bad MAC',
  'Failed to decrypt message with any known session',
  'Session error:',
  'Failed to decrypt',
  'Closing open session',
  'Closing session:',
  'SessionEntry',
  '_chains:',
  'registrationId:',
  'currentRatchet:',
  'indexInfo:',
  '<Buffer',
  'pubKey:',
  'privKey:',
  'baseKey:',
  'remoteIdentityKey:',
  'lastRemoteEphemeralKey:',
  'ephemeralKeyPair:',
  'chainKey:',
  'chainType:',
  'messageKeys:'
];

process.stdout.write = function(chunk, encoding, callback) {
  const str = chunk?.toString() || '';
  const shouldFilter = FILTER_PATTERNS.some(p => str.includes(p));
  if (shouldFilter) {
    if (str.includes('Closing open session')) {
      const cleanMsg = chalk.blue('🔒 Signal: Encryption updated\n');
      return originalStdoutWrite.call(this, Buffer.from(cleanMsg), encoding, callback);
    }
    if (typeof callback === 'function') callback();
    return true;
  }
  return originalStdoutWrite.call(this, chunk, encoding, callback);
};

console.error = function(...args) {
  const msg = args.join(' ');
  if (FILTER_PATTERNS.some(p => msg.includes(p))) {
    if (msg.includes('Bad MAC')) originalLog.call(console, chalk.yellow('🔄 Signal Protocol: Securing connection...'));
    return;
  }
  originalError.apply(console, args);
};

console.log = function(...args) {
  const msg = args.join(' ');
  if (FILTER_PATTERNS.some(p => msg.includes(p))) return;
  originalLog.apply(console, args);
};

const authDir = path.join(process.cwd(), 'session');

const bannerLines = [
  '██████╗  ██████╗ ████████╗',
  '██╔══██╗██╔═══██╗╚══██╔══╝',
  '██████╔╝██║   ██║   ██║   ',
  '██╔══██╗██║   ██║   ██║   ',
  '██████╔╝╚██████╔╝   ██║   ',
  '╚═════╝  ╚═════╝    ╚═╝   ',
];

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function center(text, width) {
  const len = stripAnsi(text).length;
  const pad = Math.max(0, Math.floor((width - len) / 2));
  return ' '.repeat(pad) + text;
}

export function showBanner() {
  console.clear();
  const W = Math.max(process.stdout.columns || 80, 70);
  const BW = 56;
  const P = ' '.repeat(Math.max(0, Math.floor((W - BW - 2) / 2)));

  console.log();
  bannerLines.forEach(l => originalLog(center(chalk.cyanBright(l), W)));
  console.log();
  originalLog(center(chalk.magentaBright.bold('🚀  WA-Multi-Downloader  v1.0.0'), W));
  originalLog(center(chalk.greenBright('🟢  Status: Online'), W));
  console.log();

  function row(left, right = '') {
    const inner = ' ' + left + right;
    const vis = stripAnsi(inner).length;
    const spaces = Math.max(0, BW - vis);
    return `${P}${chalk.white('│')}${inner}${' '.repeat(spaces)}${chalk.white('│')}`;
  }

  originalLog(`${P}${chalk.white('╭' + '─'.repeat(BW) + '╮')}`);
  originalLog(row(chalk.yellowBright.bold(' 🛠️   TOOLS INFORMATION')));
  originalLog(row(chalk.white(' ──────────────────────────────────────────────────')));
  originalLog(row(chalk.cyanBright(' ▷ YouTube Downloader    '), chalk.gray('(Video / Audio) ')));
  originalLog(row(chalk.blueBright(' ⓕ Facebook Downloader   '), chalk.gray('(Reels / Video) ')));
  originalLog(row(chalk.magentaBright(' 🅾 Instagram Downloader  '), chalk.gray('(Reels / Post)  ')));
  originalLog(row(chalk.white('【ꚠ】TikTok Downloader    '), chalk.gray('(No Watermark)  ')));
  originalLog(`${P}${chalk.white('├' + '─'.repeat(BW) + '┤')}`);
  originalLog(row(chalk.greenBright.bold(' 👨‍💻  DEVELOPER INFORMATION')));
  originalLog(row(chalk.white(' ──────────────────────────────────────────────────')));
  originalLog(row(chalk.white('  © Owner  : '), chalk.cyanBright(String(config.OWNER))));
  originalLog(row(chalk.white('    GitHub : '), chalk.cyanBright(String(config.GITHUB))));
  originalLog(row(chalk.white('  ✉ Email  : '), chalk.cyanBright('devmainulislam@gmail.com')));
  originalLog(`${P}${chalk.white('╰' + '─'.repeat(BW) + '╯')}`);
  console.log();
}

let bannerShown = false;

async function startBot() {
  if (!bannerShown) {
    showBanner();
    bannerShown = true;
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  wrapSendMessageGlobally(sock);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log(chalk.greenBright('\n✅ Successfully Connected to WhatsApp!'));
      console.log(chalk.cyan(`👤 Bot Number: ${sock.user?.id.split(':')[0]}`));
    } else if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log(chalk.yellow('\n🔁 Connection dropped, reconnecting...'));
        startBot();
      } else {
        console.log(chalk.red('\n❌ Session invalid or logged out. Please delete the "session" folder and restart.'));
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages?.[0];
    if (!msg || msg.key.fromMe) return;
    try {
      await handler(sock, msg);
    } catch (err) {
      console.error(chalk.red('[Handler Error]'), err);
    }
  });

  if (!sock.authState.creds.registered) {
    let waNumber;
    try {
      console.log(chalk.yellowBright('\n⚠️  Session not found! Please login.'));
      const response = await inquirer.prompt([
        {
          type: 'input',
          name: 'waNumber',
          message: chalk.cyanBright('Enter Bot WhatsApp Number (without +):'),
          validate: (input) => /^\d{8,}$/.test(input) ? true : 'Invalid Number. Example: 8801308850528',
        },
      ]);
      waNumber = response.waNumber.replace(/[^0-9]/g, '');
    } catch (err) {
      if (err.name === 'ExitPromptError') process.exit(0);
      else throw err;
    }

    try {
      setTimeout(async () => {
        const code = await sock.requestPairingCode(waNumber);
        console.log(chalk.greenBright('\n✅ Pairing Code Generated Successfully!'));
        console.log(chalk.yellowBright('📌 Your Code:'), chalk.bold.bgMagenta.white(` ${code} `));
        console.log(chalk.cyan('\nSteps to Login:'));
        console.log(chalk.cyan('  1. Open WhatsApp on your phone'));
        console.log(chalk.cyan('  2. Go to Linked Devices › Link a Device'));
        console.log(chalk.cyan('  3. Click "Link with phone number instead"'));
        console.log(chalk.cyan('  4. Enter the code above'));
        console.log(chalk.greenBright('\nWaiting for connection...\n'));
      }, 2000);
    } catch (error) {
      console.error(chalk.red('❌ Error generating pairing code:'), error);
    }
  }
}

startBot();
