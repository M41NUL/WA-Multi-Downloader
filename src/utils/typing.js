// src/utils/typing.js
export function wrapSendMessageGlobally(sock) {
  const originalSendMessage = sock.sendMessage.bind(sock);

  sock.sendMessage = async (jid, content, options) => {
    try {
      if (content.edit) {
        return await originalSendMessage(jid, content, options);
      }

      sock.presenceSubscribe(jid).catch(() => {});
      sock.sendPresenceUpdate('composing', jid).catch(() => {});

      await new Promise(r => setTimeout(r, 100));

      const result = await originalSendMessage(jid, content, options);

      sock.sendPresenceUpdate('paused', jid).catch(() => {});

      return result;
    } catch (err) {
      console.error('[Global Typing Error]', err);
      return originalSendMessage(jid, content, options);
    }
  };
}
