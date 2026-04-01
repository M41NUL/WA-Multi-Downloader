export function wrapSendMessageGlobally(sock) {
  const originalSendMessage = sock.sendMessage.bind(sock);

  sock.sendMessage = async (jid, content, options) => {
    try {
      // subscribe presence
      await sock.presenceSubscribe(jid);

      // show typing
      await sock.sendPresenceUpdate('composing', jid);

      // small delay
      await new Promise(resolve => setTimeout(resolve, 800));

      // send message
      const result = await originalSendMessage(jid, content, options);

      // stop typing
      await sock.sendPresenceUpdate('paused', jid);

      return result;

    } catch (error) {
      console.error('Typing Error:', error);

      // fallback send
      return originalSendMessage(jid, content, options);
    }
  };
}
