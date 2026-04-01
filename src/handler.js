import fs from 'fs';
import path from 'path';
import { generateWAMessageFromContent, prepareWAMessageMedia, proto } from 'atexovi-baileys';
import { userState } from './userState.js';
import { handleYouTubeDownloader } from './features/youtube.js';
import { handleFacebookDownloader } from './features/facebook.js';
import { handleInstagramDownloader } from './features/instagram.js';
import { handleTikTokDownloader } from './features/tiktok.js';
import { validateUrl } from './utils/validateUrl.js';
import config from '../config.js';

const menuImagePath = path.join(process.cwd(), 'src/assets/menu.jpg');

async function sendInteractive(sock, from, text, buttons = []) {
  const msg = generateWAMessageFromContent(from, {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2
        },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({ text }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: ` ${config.COPYRIGHT}` }),
          header: proto.Message.InteractiveMessage.Header.create({
            title: "",
            hasMediaAttachment: false
          }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons })
        })
      }
    }
  }, { userJid: sock.user.jid });

  await sock.relayMessage(from, msg.message, { messageId: msg.key.id });
}

async function sendBackButton(sock, from, text) {
  await sendInteractive(sock, from, text, [
    {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: ' Back to Menu',
        id: 'back_to_menu'
      })
    }
  ]);
}

export async function handler(sock, msg) {
  if (!msg?.message) return;

  const from = msg.key.remoteJid;
  const state = userState.get(from) || { step: 'start' };

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption;

  let rowId;
  try {
    if (msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage) {
      rowId = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id;
    }
  } catch (err) {
    console.error('[DEBUG] Gagal parsing rowId:', err);
  }

  if (rowId === 'back_to_menu') {
    await sendDownloaderMenu(sock, from);
    userState.set(from, { step: 'menuMain' });
    return;
  }

  if (rowId) {
    switch (rowId) {
      case 'yt_downloader':
        userState.set(from, { step: 'yt_wait_url' });
        await sendBackButton(sock, from, '📌 Please send the *YouTube* video link:');
        break;
      case 'fb_downloader':
        userState.set(from, { step: 'fb_wait_url' });
        await sendBackButton(sock, from, '📌 Please send the *Facebook* video link:');
        break;
      case 'ig_downloader':
        userState.set(from, { step: 'ig_wait_url' });
        await sendBackButton(sock, from, '📌 Please send the *Instagram* video link:');
        break;
      case 'tt_downloader':
        userState.set(from, { step: 'tt_wait_url' });
        await sendBackButton(sock, from, '📌 Please send the *TikTok* video link:');
        break;
      case 'tools_info': {
        const toolsText =
          `🛠️ *TOOLS INFORMATION*\n\n` +
          `▷ *YouTube Downloader* (Video/Audio)\n` +
          `ⓕ *Facebook Downloader* (Reels/Video)\n` +
          `ⓘ*Instagram Downloader* (Reels/Post)\n` +
          `【ꚠ】  *TikTok Downloader* (No Watermark)\n\n` +
          `_More features coming soon!_`;
        await sendBackButton(sock, from, toolsText);
        userState.set(from, { step: 'menuMain' });
        break;
      }
      case 'dev_info': {
        const devText =
          `👨‍💻 *DEVELOPER INFORMATION*\n\n` +
          `*• Name:* ${config.AUTHOR}\n` +
          `*• Owner:* ${config.OWNER}\n` +
          `*• WhatsApp:* ${config.WHATSAPP}\n` +
          `*• Telegram:* ${config.TELEGRAM}\n` +
          `*• GitHub:* ${config.GITHUB_URL}\n` +
          `*• Email :* ${config.EMAIL}`;
          
        await sendBackButton(sock, from, devText);
        userState.set(from, { step: 'menuMain' });
        break;
      }
      default:
        break;
    }
    return;
  }

  if (text && state.step !== 'menuMain' && state.step !== 'start') {
    switch (state.step) {
      case 'yt_wait_url':
        if (!validateUrl(text, 'youtube')) {
          await sendBackButton(sock, from, '❌ Invalid URL. Please send a valid YouTube link.');
          return;
        }
        await handleYouTubeDownloader(sock, from, text);
        break;
      case 'fb_wait_url':
        if (!validateUrl(text, 'facebook')) {
          await sendBackButton(sock, from, '❌ Invalid URL. Please send a valid Facebook link.');
          return;
        }
        await handleFacebookDownloader(sock, from, text);
        break;
      case 'ig_wait_url':
        if (!validateUrl(text, 'instagram')) {
          await sendBackButton(sock, from, '❌ Invalid URL. Please send a valid Instagram link.');
          return;
        }
        await handleInstagramDownloader(sock, from, text);
        break;
      case 'tt_wait_url':
        if (!validateUrl(text, 'tiktok')) {
          await sendBackButton(sock, from, '❌ Invalid URL. Please send a valid TikTok link.');
          return;
        }
        await handleTikTokDownloader(sock, from, text);
        break;
      default:
        await sendDownloaderMenu(sock, from);
        break;
    }
    userState.set(from, { step: 'menuMain' });
    return;
  }

  await sendDownloaderMenu(sock, from);
  userState.set(from, { step: 'menuMain' });
}

export async function sendDownloaderMenu(sock, from) {
  const welcomeText =
    `👋 Hello there! Welcome to *WA-Multi-Downloader*.\n\n` +
    `I am an automated bot developed by *${config.OWNER}*.\n\n` +
    `👇 Please click the button below to open the menu!`;

  const buttons = [
    {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: 'Open Menu',
        sections: [
          {
            title: '📥 Select Platform',
            rows: [
              { title: 'YouTube Downloader', description: 'Download videos from YouTube', id: 'yt_downloader' },
              { title: 'Facebook Downloader', description: 'Download videos from Facebook', id: 'fb_downloader' },
              { title: 'Instagram Downloader', description: 'Download videos from Instagram', id: 'ig_downloader' },
              { title: 'TikTok Downloader', description: 'Download videos from TikTok', id: 'tt_downloader' },
            ],
          },
          {
            title: 'ℹ️ Information',
            rows: [
              { title: '🛠️ Tools Information', description: 'See all available tools and features', id: 'tools_info' },
              { title: '👨‍💻 Developer Information', description: 'View developer details & contact', id: 'dev_info' },
            ],
          },
        ],
      }),
    },
  ];

  let mediaMsg = null;
  
  if (fs.existsSync(menuImagePath)) {
    mediaMsg = await prepareWAMessageMedia(
      { image: fs.readFileSync(menuImagePath) },
      { upload: sock.waUploadToServer }
    );
  }

  const msg = generateWAMessageFromContent(from, {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2
        },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({ text: welcomeText }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: ` ${config.COPYRIGHT}` }),
          header: proto.Message.InteractiveMessage.Header.create({
            title: '',
            hasMediaAttachment: !!mediaMsg,
            ...(mediaMsg || {})
          }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons })
        })
      }
    }
  }, { userJid: sock.user.jid });

  await sock.relayMessage(from, msg.message, { messageId: msg.key.id });
}
