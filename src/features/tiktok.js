// src/features/tiktok.js
import fs from "fs";
import axios from "axios";
import { dirname } from "path";
import { fileURLToPath } from "url";
import ytdlpExec from "yt-dlp-exec";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function formatBytes(bytes) {
  if (!bytes) return "Unknown Size";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDuration(seconds) {
  if (!seconds) return "Unknown Duration";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function getProgressBar(percent) {
  const totalBlocks = 10;
  const filledBlocks = Math.floor((percent / 100) * totalBlocks);
  const emptyBlocks = totalBlocks - filledBlocks;
  return "█".repeat(filledBlocks) + "▒".repeat(emptyBlocks);
}

async function resolveTikTokUrl(url) {
  try {
    const response = await axios.get(url, {
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });
    return response.request.res.responseUrl || url;
  } catch (err) {
    return url;
  }
}

export async function handleTikTokDownloader(sock, from, url) {
  if (!url.startsWith("http")) {
    await sock.sendMessage(from, { text: "❌ Invalid URL" });
    return;
  }

  const statusMsg = await sock.sendMessage(from, { text: "⏳ Fetching video information..." });

  const tempFile = `${__dirname}/tmp_tt_${Date.now()}.mp4`;

  try {
    const resolvedUrl = await resolveTikTokUrl(url);
    const meta = await ytdlpExec(resolvedUrl, { dumpJson: true, noWarnings: true });

    const title = meta.title || meta.description || "TikTok Video";
    const duration = formatDuration(meta.duration);
    const size = formatBytes(meta.filesize || meta.filesize_approx);
    const resolution = meta.resolution || "MP4";

    await sock.sendMessage(from, { 
        text: `📥 Starting download...\n[▒▒▒▒▒▒▒▒▒▒] 0%`, 
        edit: statusMsg.key 
    });

    const subprocess = ytdlpExec.exec(resolvedUrl, {
      output: tempFile,
      format: "bv*[height<=1080]+ba/bv*+ba/best",
      mergeOutputFormat: "mp4",
      noWarnings: true,
      preferFreeFormats: true,
    });

    let lastUpdate = 0;

    subprocess.stdout.on("data", async (data) => {
        const output = data.toString();
        const match = output.match(/\[download\]\s+([\d\.]+)%/);
        
        if (match) {
            const percent = parseFloat(match[1]);
            if (percent - lastUpdate >= 20 || percent === 100) {
                lastUpdate = percent;
                const bar = getProgressBar(percent);
                try {
                    await sock.sendMessage(from, {
                        text: `📥 Downloading...\n[${bar}] ${Math.round(percent)}%`,
                        edit: statusMsg.key
                    });
                } catch (e) {}
            }
        }
    });

    await new Promise((resolve, reject) => {
        subprocess.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error("Download process failed"));
        });
        subprocess.on("error", reject);
    });

    await sock.sendMessage(from, { text: "✅ Download complete! Uploading video...", edit: statusMsg.key });

    const finalCaption = `
✨ *TikTok Downloader* ✨

📌 *Title:* \`${title}\`
🌐 *Platform:* TikTok
🎥 *Format:* ${resolution}
⚖️ *Size:* ${size}
⏱️ *Duration:* ${duration}

🤖 *Bot:* WA-Multi-Downloader
👨‍💻 *Dev:* MAINUL - X`.trim();

    await sock.sendMessage(from, {
      video: { url: tempFile },
      mimetype: "video/mp4",
      caption: finalCaption,
    });

    await sock.sendMessage(from, { delete: statusMsg.key });
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

  } catch (err) {
    console.error(err);
    await sock.sendMessage(from, { 
        text: "❌ Failed to download TikTok video. It might be private or unavailable.", 
        edit: statusMsg.key 
    });
    
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
}
