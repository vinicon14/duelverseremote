/**
 * DuelVerse - Registro global dos streams remotos (WebRTC)
 * Usado pela gravação de partida para mixar o áudio dos oponentes.
 */
const registry = new Map<string, MediaStream>();

export const registerRemoteStream = (peerId: string, stream: MediaStream) => {
  registry.set(peerId, stream);
};

export const unregisterRemoteStream = (peerId: string) => {
  registry.delete(peerId);
};

export const clearRemoteStreams = () => {
  registry.clear();
};

/** Retorna streams remotos que possuem pelo menos uma trilha de áudio viva. */
export const getRemoteAudioStreams = (): MediaStream[] => {
  const result: MediaStream[] = [];
  registry.forEach((stream) => {
    const tracks = stream.getAudioTracks().filter((t) => t.readyState === "live");
    if (tracks.length > 0) result.push(new MediaStream(tracks));
  });
  return result;
};
