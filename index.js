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
  'Bad MAC','Failed to decrypt message with any known session','Session error:',
  'Failed to decrypt','Closing open session','Closing session:','SessionEntry',
  '_chains:','registrationId:','currentRatchet:','indexInfo:','<Buffer',
  'pubKey:','privKey:','baseKey:','remoteIdentityKey:',
  'lastRemoteEphemeralKey:','ephemeralKeyPair:','chainKey:','chainType:','messageKeys:'
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
    if (msg.includes('Bad MAC')) {
      originalLog.call(console, chalk.yellow('🔄 Signal Protocol: Securing connection...'));
    }
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

function createRow(left, right, BW, P) {
  const cleanLeft = stripAnsi(left);
  const cleanRight = stripAnsi(right);
  const space = BW - cleanLeft.length - cleanRight.length - 2;
  return `${P}${chalk.white('│ ')}${left}${' '.repeat(space > 0 ? space : 0)}${right}${chalk.white(' │')}`;
}

function showBanner() {
  process.stdout.write('\x1Bc');
  console.clear();

  const W = process.stdout.columns || 80;
  const BW = Math.min(70, W - 10);
  const P = ' '.repeat(Math.max(0, Math.floor((W - BW - 2) / 2)));

  console.log();
  bannerLines.forEach(l => originalLog(center(chalk.cyanBright(l), W)));
  console.log();
  originalLog(center(chalk.magentaBright.bold('WA-Multi-Downloader v1.0.0'), W));
  originalLog(center(chalk.greenBright('Status: Online'), W));
  console.log();

  originalLog(`${P}${chalk.white('┌' + '─'.repeat(BW) + '┐')}`);
  originalLog(createRow(chalk.yellowBright.bold('TOOLS INFORMATION'), '', BW, P));
  originalLog(createRow('─'.repeat(BW - 2), '', BW, P));
  originalLog(createRow(chalk.cyanBright('▷ YouTube Downloader'), chalk.gray('(Video/Audio)'), BW, P));
  originalLog(createRow(chalk.blueBright('ⓕ Facebook Downloader'), chalk.gray('(Reels/Video)'), BW, P));
  originalLog(createRow(chalk.magentaBright('ⓘ Instagram Downloader'), chalk.gray('(Reels/Post)'), BW, P));
  originalLog(createRow(chalk.white('【ꚠ】TikTok Downloader'), chalk.gray('(No Watermark)'), BW, P));
  originalLog(`${P}${chalk.white('├' + '─'.repeat(BW) + '┤')}`);
  originalLog(createRow(chalk.greenBright.bold('DEVELOPER INFORMATION'), '', BW, P));
  originalLog(createRow('─'.repeat(BW - 2), '', BW, P));
  originalLog(createRow('Owner  :', chalk.cyanBright(String(config.OWNER)), BW, P));
  originalLog(createRow('GitHub :', chalk.cyanBright(String(config.GITHUB)), BW, P));
  originalLog(createRow('Email  :', chalk.cyanBright('devmainulislam@gmail.com'), BW, P));
  originalLog(`${P}${chalk.white('└' + '─'.repeat(BW) + '┘')}`);
  console.log();
}

global.bannerShown = global.bannerShown || false;

async function startBot() {
  if (!global.bannerShown) {
    showBanner();
    global.bannerShown = true;
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
      console.log(chalk.greenBright('\nConnected to WhatsApp!'));
      console.log(chalk.cyan(`Bot Number: ${sock.user?.id.split(':')[0]}`));
    } 

    else if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log(chalk.yellow('\nReconnecting...'));
        setTimeout(() => startBot(), 2000);
      } else {
        console.log(chalk.red('\nSession expired. Delete session folder.'));
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
      console.error(chalk.red('Handler Error'), err);
    }
  });

  if (!sock.authState.creds.registered) {
    let waNumber;

    try {
      console.log(chalk.yellow('\nLogin Required'));
      const response = await inquirer.prompt([
        {
          type: 'input',
          name: 'waNumber',
          message: 'Enter WhatsApp Number:',
          validate: (input) => /^\d{8,}$/.test(input) ? true : 'Invalid Number',
        },
      ]);
      waNumber = response.waNumber.replace(/[^0-9]/g, '');
    } catch (err) {
      process.exit(0);
    }

    try {
      setTimeout(async () => {
        const code = await sock.requestPairingCode(waNumber);
        console.log(chalk.green('\nPairing Code:'));
        console.log(chalk.bgMagenta.white(` ${code} `));
      }, 2000);
    } catch (error) {
      console.error(chalk.red('Pairing Error'), error);
    }
  }
}

startBot();
