#!/usr/bin/env node
import { makeWASocket, useMultiFileAuthState, DisconnectReason } from 'atexovi-baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import process from 'process';
import dotenv from 'dotenv';
import { handler } from './src/handler.js';
import { wrapSendMessageGlobally } from './src/utils/typing.js';
import config from './config.js'; // Developer Info Connect করা হলো

dotenv.config({ debug: false });

// Baileys এর ফালতু লগগুলো হাইড করার জন্য Console ইন্টারসেপ্টর
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
  const shouldFilter = FILTER_PATTERNS.some(pattern => str.includes(pattern));
  
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
  if (FILTER_PATTERNS.some(pattern => msg.includes(pattern))) {
    if (msg.includes('Bad MAC')) {
      console.log(chalk.yellow('🔄 Signal Protocol: Securing connection...'));
    }
    return;
  }
  originalError.apply(console, args);
};

console.log = function(...args) {
  const msg = args.join(' ');
  if (FILTER_PATTERNS.some(pattern => msg.includes(pattern))) return;
  originalLog.apply(console, args);
};

const authDir = path.join(process.cwd(), 'session');


const bannerAscii = `
  ____    ___  _____ 
 | __ )  / _ \\|_   _|
 |  _ \\ | | | | | |  
 | |_) || |_| | | |  
 |____/  \\___/  |_|  
`;

export function showBanner() {
  console.clear();
  
  // ASCII আর্ট প্রিন্ট
  console.log(chalk.cyanBright(bannerAscii));
  
  
  console.log(chalk.magentaBright.bold(' 🚀 WA-Multi-Downloader v1.0.0'));
  console.log(chalk.greenBright(' 🟢 Status: Online\n'));

  
  const top    = chalk.white(' ╭──────────────────────────────────────────╮');
  const bottom = chalk.white(' ╰──────────────────────────────────────────╯');
  const side   = chalk.white('│');

  console.log(top);
  console.log(` ${side} ${chalk.yellowBright('🛠️  TOOLS INFORMATION')}                     ${side}`);
  console.log(` ${side} ${chalk.cyan(' ▷ YouTube Downloader')}                    ${side}`);
  console.log(` ${side} ${chalk.blueBright(' ⓕ Facebook Downloader')}                   ${side}`);
  console.log(` ${side} ${chalk.magenta(' 🅾 Instagram Downloader')}                  ${side}`);
  console.log(` ${side} ${chalk.gray(' 【ꚠ】TikTok Downloader')}                    ${side}`);
  console.log(` ${side}                                          ${side}`);
  console.log(` ${side} ${chalk.greenBright('👨‍💻 DEVELOPER INFO')}                        ${side}`);
  console.log(` ${side} ${chalk.white(' © Owner  :')} ${chalk.cyanBright(config.OWNER).padEnd(25)} ${side}`);
  console.log(` ${side} ${chalk.white('  GitHub :')} ${chalk.cyanBright(config.GITHUB).padEnd(25)} ${side}`);
  console.log(` ${side} ${chalk.white(' ✉ Email  :')} ${chalk.cyanBright('devmainulislam@gmail.com').padEnd(25)} ${side}`);
  console.log(bottom);
  console.log();
}

async function startBot() {
  showBanner();

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

  // Pairing Code System
  if (!sock.authState.creds.registered) {
    let waNumber;
    try {
      console.log(chalk.yellowBright('\n⚠️ Session not found! Please login.'));
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
        console.log(chalk.cyan('1. Open WhatsApp on your phone'));
        console.log(chalk.cyan('2. Go to Linked Devices > Link a Device'));
        console.log(chalk.cyan('3. Click "Link with phone number instead"'));
        console.log(chalk.cyan('4. Enter the code above'));
        console.log(chalk.greenBright('\nWaiting for connection...'));
      }, 2000);
    } catch (error) {
      console.error(chalk.red('❌ Error generating pairing code:'), error);
    }
  }
}

startBot();
