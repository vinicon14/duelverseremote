function matchesRemoteGeneration(pc: RTCPeerConnection, candidate: RTCIceCandidateInit) {
  const ufrag = candidate.usernameFragment;
  if (ufrag && pc.remoteDescription?.sdp) {
    const generations = [...pc.remoteDescription.sdp.matchAll(/a=ice-ufrag:([^\s]+)/g)].map(m => m[1]);
    if (generations.length && !generations.includes(ufrag)) return false;
  }
  return true;
}

/** A future ICE restart candidate can arrive before its SDP. Bound its queue. */
export async function queueRemoteCandidate(pc: RTCPeerConnection, candidate: RTCIceCandidateInit, pending: RTCIceCandidateInit[]) {
  if (!pc.remoteDescription || !matchesRemoteGeneration(pc, candidate)) {
    if (pending.length >= 256) pending.shift();
    pending.push(candidate);
    return;
  }
  await addRemoteCandidate(pc, candidate);
}

/** Reject candidates from an obsolete ICE generation without aborting SDP. */
export async function addRemoteCandidate(pc: RTCPeerConnection, candidate: RTCIceCandidateInit) {
  if (!matchesRemoteGeneration(pc, candidate)) return;
  try {
    await pc.addIceCandidate(candidate);
  } catch (error) {
    // One invalid or late candidate must not prevent a valid offer being answered.
    console.warn("[WebRTC] Ignoring rejected ICE candidate", error);
  }
}

export async function flushRemoteCandidates(pc: RTCPeerConnection, candidates: RTCIceCandidateInit[]) {
  for (const candidate of candidates.splice(0)) await addRemoteCandidate(pc, candidate);
}
