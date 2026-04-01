// src/handler.js
import fs from 'fs';
import path from 'path';
import { userState } from './userState.js';
import { handleYouTubeDownloader } from './features/youtube.js';
import { handleFacebookDownloader } from './features/facebook.js';
import { handleInstagramDownloader } from './features/instagram.js';
import { handleTikTokDownloader } from './features/tiktok.js';
import { validateUrl } from './utils/validateUrl.js';
import config from '../config.js'; 

const menuImagePath = path.join(process.cwd(), 'src/assets/menu.jpg');

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
    } else if (msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
      rowId = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
    }
  } catch (err) {
    console.error('[DEBUG] Failed to parse rowId:', err);
  }

  const btnId = msg.message?.buttonsResponseMessage?.selectedButtonId;
  if (btnId === 'back_to_menu') {
    await sock.sendPresenceUpdate('composing', from);
    await new Promise(r => setTimeout(r, 800));

    await sendDownloaderMenu(sock, from);

    await sock.sendPresenceUpdate('paused', from);
    userState.set(from, { step: 'menuMain' });
    return;
  }

  
  if (rowId) {
    switch (rowId) {
      case 'yt_downloader':
        userState.set(from, { step: 'yt_wait_url' });
        await sock.sendMessage(from, { text: '📌 Please send the *YouTube* video link:' });
        break;
      case 'fb_downloader':
        userState.set(from, { step: 'fb_wait_url' });
        await sock.sendMessage(from, { text: '📌 Please send the *Facebook* video link:' });
        break;
      case 'ig_downloader':
        userState.set(from, { step: 'ig_wait_url' });
        await sock.sendMessage(from, { text: '📌 Please send the *Instagram* video link:' });
        break;
      case 'tt_downloader':
        userState.set(from, { step: 'tt_wait_url' });
        await sock.sendMessage(from, { text: '📌 Please send the *TikTok* video link:' });
        break;
        
      
      case 'tools_info':
        const toolsText = `🛠️ *TOOLS INFORMATION*\n\n` +
                          `▷ *YouTube Downloader* (Video/Audio)\n` +
                          `ⓕ *Facebook Downloader* (Reels/Video)\n` +
                          `🅾 *Instagram Downloader* (Reels/Post)\n` +
                          `【ꚠ】 *TikTok Downloader* (No Watermark)\n\n` +
                          `_More features coming soon!_`;
        await sock.sendMessage(from, { 
          text: toolsText,
          buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: '🔙 Back to Menu' }, type: 1 }]
        });
        userState.set(from, { step: 'menuMain' });
        break;

      
      case 'dev_info':
        const devText = `👨‍💻 *DEVELOPER INFORMATION*\n\n` +
                        `*Name:* ${config.AUTHOR}\n` +
                        `*Owner:* ${config.OWNER}\n` +
                        `*WhatsApp:* ${config.WHATSAPP}\n` +
                        `*Telegram:* ${config.TELEGRAM}\n` +
                        `*GitHub:* ${config.GITHUB_URL}\n` +
                        `*Email:* ${config.EMAIL}\n\n` +
                        `🛡️ *${config.COPYRIGHT}*`;
        await sock.sendMessage(from, { 
          text: devText,
          buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: '🔙 Back to Menu' }, type: 1 }]
        });
        userState.set(from, { step: 'menuMain' });
        break;

      default:
        break;
    }
    return;
  }

  
  if (text) {
    switch (state.step) {
      case 'yt_wait_url':
        if (!validateUrl(text, 'youtube')) {
          await sock.sendMessage(from, { 
            text: '❌ Invalid URL. Please send a valid YouTube link.',
            buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: '🔙 Back to Menu' }, type: 1 }]
          });
          return;
        }
        await handleYouTubeDownloader(sock, from, text);
        break;

      case 'fb_wait_url':
        if (!validateUrl(text, 'facebook')) {
          await sock.sendMessage(from, { 
            text: '❌ Invalid URL. Please send a valid Facebook link.',
            buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: '🔙 Back to Menu' }, type: 1 }]
          });
          return;
        }
        await handleFacebookDownloader(sock, from, text);
        break;

      case 'ig_wait_url':
        if (!validateUrl(text, 'instagram')) {
          await sock.sendMessage(from, { 
            text: '❌ Invalid URL. Please send a valid Instagram link.',
            buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: '🔙 Back to Menu' }, type: 1 }]
          });
          return;
        }
        await handleInstagramDownloader(sock, from, text);
        break;

      case 'tt_wait_url':
        if (!validateUrl(text, 'tiktok')) {
          await sock.sendMessage(from, { 
            text: '❌ Invalid URL. Please send a valid TikTok link.',
            buttons: [{ buttonId: 'back_to_menu', buttonText: { displayText: '🔙 Back to Menu' }, type: 1 }]
          });
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

  
  if (state.step === 'start' || state.step === 'menuMain') {
    await sendDownloaderMenu(sock, from);
    userState.set(from, { step: 'menuMain' });
  }
}

export async function sendDownloaderMenu(sock, from) {
  const welcomeText = `👋 Hello there!\nWelcome to *WA-Multi-Downloader*.\n\nI am an automated bot developed by *${config.OWNER}*.\n\n👇 Please click the button below to open the menu!`;

  const messageContent = {
    footer: `🛡️ ${config.COPYRIGHT}`,
    interactiveButtons: [
      {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: '📋 Open Menu',
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
              ]
            }
          ],
        }),
      },
    ],
  };

  if (fs.existsSync(menuImagePath)) {
    messageContent.image = fs.readFileSync(menuImagePath);
    messageContent.caption = welcomeText;
  } else {
    messageContent.text = welcomeText;
  }

  await sock.sendMessage(from, messageContent);
}
