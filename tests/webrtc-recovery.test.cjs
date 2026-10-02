const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require: id => mocks[id] || (id === '@/utils/webrtcCandidates' ? load('src/utils/webrtcCandidates.ts') : id === '@/utils/webrtcSession' ? load('src/utils/webrtcSession.ts', {}, globals) : {}), console, crypto, AbortController, setTimeout, clearTimeout, ...globals });
  return exports;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
class Stream {
  constructor(tracks = []) { this.tracks = [...tracks]; }
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  addTrack(t) { if (!this.tracks.includes(t)) this.tracks.push(t); }
  removeTrack(t) { this.tracks = this.tracks.filter(x => x !== t); }
}
const videoTrack = () => ({ kind: 'video', id: crypto.randomUUID(), readyState: 'live', enabled: true, getSettings: () => ({}), stop() { this.readyState = 'ended'; } });
function environment() {
  const effects = [], states = [], refs = [], pcs = [], channels = [], intervals = new Map();
  let timerId = 0;
  class PC {
    constructor(config) { this.config = config; this.trans = []; this.connectionState = 'new'; this.signalingState = 'stable'; this.remoteDescription = null; this.accepted = []; pcs.push(this); }
    addTransceiver(kind, { direction }) { const sender = { track: null, async replaceTrack(t) { this.track = t; } }; const t = { direction, sender, receiver: { track: { kind } } }; this.trans.push(t); return t; }
    addTrack(track) { const t = this.addTransceiver(track.kind, { direction: 'sendrecv' }); t.sender.track = track; return t.sender; }
    getSenders() { return this.trans.map(t => t.sender); }
    getConfiguration() { return this.config; }
    setConfiguration(config) { this.config = config; }
    getTransceivers() { return this.trans; }
    async createOffer() { return { type: 'offer', sdp: 'a=ice-ufrag:fresh\r\n' }; }
    async createAnswer() { return { type: 'answer', sdp: 'a=ice-ufrag:fresh\r\n' }; }
    async setLocalDescription(sdp) { this.localDescription = sdp; this.signalingState = sdp.type === 'offer' ? 'have-local-offer' : 'stable'; }
    async setRemoteDescription(sdp) { this.remoteDescription = sdp; this.signalingState = sdp.type === 'offer' ? 'have-remote-offer' : 'stable'; }
    async addIceCandidate(c) { if (!this.remoteDescription || c.usernameFragment === 'old' || c.candidate === 'bad') throw new Error('Invalid ICE'); this.accepted.push(c); }
    close() { this.connectionState = 'closed'; }
  }
  const react = { forwardRef: f => f, useState: initial => { const i = states.length; states.push(typeof initial === 'function' ? initial() : initial); return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; }, useRef: v => { const ref = { current: v }; refs.push(ref); return ref; }, useCallback: f => f, useEffect: f => effects.push(f), useImperativeHandle() {} };
  const supabase = { channel() { const c = { handlers: {}, sent: [], on(type, filter, f) { this.handlers[type + ':' + filter.event] = f; return this; }, subscribe(f) { this.subscription = f; f?.('SUBSCRIBED'); return this; }, send(message) { this.sent.push(message.payload); return Promise.resolve('ok'); }, track: async () => {}, presenceState: () => ({ b: [{ username: 'B' }] }) }; channels.push(c); return c; }, removeChannel: async () => {}, from() { return { update() { return this; }, eq() { return this; } }; } };
  const timers = { setInterval: f => { intervals.set(++timerId, f); return timerId; }, clearInterval: id => intervals.delete(id), setTimeout: f => { intervals.set(++timerId, f); return timerId; }, clearTimeout: id => intervals.delete(id) };
  const globals = { RTCPeerConnection: PC, RTCSessionDescription: function(v) { return v; }, RTCIceCandidate: function(v) { return v; }, MediaStream: Stream, navigator: { userAgent: 'test', mediaDevices: { getUserMedia: async () => new Stream([videoTrack()]), enumerateDevices: async () => [] } }, window: timers, ...timers };
  const ice = { ensureIceServers: async () => [], partyPcConfig: () => ({}), buildPcConfig: () => ({}), getIceServers: () => [], hasVerifiedTurn: () => false };
  const mocks = { react, '@/integrations/supabase/client': { supabase }, '@/utils/iceServers': ice, '@/contexts/PhoneStreamContext': { usePhoneStream: () => ({ phoneStream: null }) }, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) } };
  return { effects, states, refs, pcs, channels, intervals, globals, mocks };
}

test('ICE fetch retries after a transient error instead of caching the failure forever', async () => {
  let now = 0, calls = 0;
  const ice = load('src/utils/iceServers.ts', { '@/integrations/supabase/client': { supabase: { functions: { invoke: async () => { calls++; return calls === 1 ? { error: new Error('offline') } : { data: { hasTurn: true, iceServers: [{ urls: 'turn:managed.example', username: 'u', credential: 'p' }] } }; } }, auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }), getSession: async () => ({ data: { session: { user: { id: 'test-user' } } } }) } } } }, { Date: { now: () => now } });
  await ice.ensureIceServers(); now = 60000; await ice.ensureIceServers();
  assert.equal(calls, 2);
  assert.equal(ice.getIceServers()[0].urls, 'turn:managed.example');
});

test('Party switches recvonly to sendrecv when camera is enabled', async () => {
  const e = environment(); const hook = load('src/hooks/usePartyMesh.tsx', e.mocks, e.globals).usePartyMesh({ roomId: 'room', userId: 'a', username: 'A' });
  e.effects.forEach(f => f()); e.channels[0].handlers['presence:sync'](); await flush();
  e.pcs[0].signalingState = 'stable'; await hook.toggleCamera();
  assert.equal(e.pcs[0].getTransceivers().find(t => t.receiver.track.kind === 'video').direction, 'sendrecv');
});

test('Party non-offerer asks elected offerer to renegotiate after enabling media', async () => {
  const e = environment(); const hook = load('src/hooks/usePartyMesh.tsx', e.mocks, e.globals).usePartyMesh({ roomId: 'room', userId: 'z', username: 'Z' });
  e.effects.forEach(f => f());
  await e.channels[0].handlers['broadcast:party-signal']({ payload: { type: 'offer', from: 'a', to: 'z', sdp: { type: 'offer' } } });
  await hook.toggleCamera();
  assert.ok(e.channels[0].sent.some(p => p.type === 'request-offer' && p.to === 'a'));
});

test('Phone host queues ICE until SDP and still answers after one invalid candidate', async () => {
  const e = environment(); const hook = load('src/hooks/usePhonePairing.ts', e.mocks, e.globals).useHostPairing(); e.effects.forEach(f => f());
  const signal = payload => e.channels[0].handlers['broadcast:sig']({ payload: { from: 'phone', ...payload } });
  await signal({ type: 'claim', token: hook.token });
  await signal({ type: 'ice', candidate: { candidate: 'bad', usernameFragment: 'old' } });
  await signal({ type: 'ice', candidate: { candidate: 'good' } });
  await signal({ type: 'offer', sdp: { type: 'offer', sdp: 'a=ice-ufrag:fresh\r\n' } });
  assert.equal(e.pcs[0].accepted.length, 1); assert.ok(e.channels[0].sent.some(p => p.type === 'answer'));
});

test('Phone host accepts streamless video tracks', async () => {
  const e = environment(); const hook = load('src/hooks/usePhonePairing.ts', e.mocks, e.globals).useHostPairing(); e.effects.forEach(f => f());
  await e.channels[0].handlers['broadcast:sig']({ payload: { from: 'phone', type: 'claim', token: hook.token } });
  const track = videoTrack(); e.pcs[0].ontrack({ streams: [], track });
  assert.ok(e.states.some(s => s instanceof Stream && s.getVideoTracks().includes(track)));
});

test('Phone failure clears peer so a subsequent ready creates a fresh connection', async () => {
  const e = environment(); const stream = new Stream([videoTrack()]);
  load('src/hooks/usePhonePairing.ts', e.mocks, e.globals).usePhoneClientPairing({ sessionId: 's', token: 't', cameraOn: true, micOn: false, initialStream: stream }); e.effects.forEach(f => f());
  const signal = payload => e.channels[0].handlers['broadcast:sig']({ payload: { from: 'host', ...payload } });
  await signal({ type: 'ready' }); e.pcs[0].connectionState = 'failed'; e.pcs[0].onconnectionstatechange();
  await signal({ type: 'ready' }); assert.equal(e.pcs.length, 2); assert.equal(stream.getVideoTracks()[0].readyState, 'live');
});

test('Duel camera button reacquires media when initial capture is absent', async () => {
  const e = environment(); let acquisitions = 0;
  e.globals.navigator.mediaDevices.getUserMedia = async () => { acquisitions++; return new Stream([videoTrack()]); };
  const component = load('src/components/duel/WebRTCVideoCall.tsx', e.mocks, e.globals).WebRTCVideoCall;
  const tree = component({ duelId: 'd', userId: 'a', isCreator: true }, null);
  function find(node) { if (!node || typeof node !== 'object') return; if (node.props?.onClick?.name === 'toggleVideo') return node; for (const child of [node.props?.children].flat(Infinity)) { const hit = find(child); if (hit) return hit; } }
  const button = find(tree); assert.ok(button); await button.props.onClick(); assert.equal(acquisitions, 1);
});

test('Recovery keeps direct candidates available without configured TURN', () => {
  const ice = load('src/utils/iceServers.ts', { '@/integrations/supabase/client': { supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }), getSession: async () => ({ data: { session: null } }) } } } });
  assert.equal(ice.buildPcConfig().iceTransportPolicy, 'all');
});

test('Successful TURN configuration expires and concurrent callers share one request', async () => {
  let now = 0, calls = 0;
  const ice = load('src/utils/iceServers.ts', { '@/integrations/supabase/client': { supabase: { functions: { invoke: async () => { calls++; return { data: { hasTurn: true, iceServers: [{ urls: 'turn:managed.example', username: 'u', credential: 'p' }] } }; } }, auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }), getSession: async () => ({ data: { session: { user: { id: 'test-user' } } } }) } } } }, { Date: { now: () => now } });
  await Promise.all([ice.ensureIceServers(), ice.ensureIceServers()]); assert.equal(calls, 1);
  now = 1000; await ice.ensureIceServers(); assert.equal(calls, 1);
  now = 360000; await ice.ensureIceServers(); assert.equal(calls, 2);
});

test('A timed-out ICE fetch cannot overwrite a subsequent successful fetch', async () => {
  let now = 0, calls = 0, finishOld, timeout;
  const ice = load('src/utils/iceServers.ts', { '@/integrations/supabase/client': { supabase: { functions: { invoke: async () => {
    calls++; if (calls === 1) return new Promise(resolve => { finishOld = resolve; });
    return { data: { hasTurn: true, iceServers: [{ urls: 'turn:fresh.example' }] } };
  } }, auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }), getSession: async () => ({ data: { session: { user: { id: 'test-user' } } } }) } } } }, { Date: { now: () => now }, setTimeout: f => { timeout = f; return 1; }, clearTimeout() {} });
  const first = ice.ensureIceServers(); timeout(); await first;
  now = 60000; await ice.ensureIceServers();
  finishOld({ data: { hasTurn: true, iceServers: [{ urls: 'turn:obsolete.example' }] } }); await flush();
  assert.equal(ice.getIceServers()[0].urls, 'turn:fresh.example');
});

test('Spectator answers a valid offer despite queued invalid and obsolete ICE', async () => {
  const e = environment();
  load('src/components/duel/WebRTCVideoCall.tsx', e.mocks, e.globals).WebRTCVideoCall({ duelId: 'd', userId: 'viewer', isCreator: false, isSpectator: true }, null);
  const init = e.effects.find(f => f.toString().includes('const init =')); assert.ok(init); init(); await flush();
  const signal = payload => e.channels[0].handlers['broadcast:webrtc-signal']({ payload: { senderId: 'player', targetId: 'viewer', ...payload } });
  await signal({ type: 'ice-candidate', candidate: { candidate: 'old', usernameFragment: 'old' } });
  await signal({ type: 'ice-candidate', candidate: { candidate: 'bad' } });
  await signal({ type: 'ice-candidate', candidate: { candidate: 'good', usernameFragment: 'fresh' } });
  await signal({ type: 'offer', sdp: { type: 'offer', sdp: 'a=ice-ufrag:fresh\r\n' } });
  assert.equal(e.pcs[0].accepted.length, 1); assert.ok(e.channels[0].sent.some(p => p.type === 'answer'));
});

test('Phone client queues ICE before answer and ignores previous pairing attempts', async () => {
  const e = environment();
  load('src/hooks/usePhonePairing.ts', e.mocks, e.globals).usePhoneClientPairing({ sessionId: 's', token: 't', cameraOn: true, micOn: false, initialStream: new Stream([videoTrack()]) }); e.effects.forEach(f => f());
  const signal = payload => e.channels[0].handlers['broadcast:sig']({ payload: { from: 'host', ...payload } });
  await signal({ type: 'ready' });
  await signal({ type: 'ice', candidate: { candidate: 'good' } });
  await signal({ type: 'answer', attemptId: 'obsolete', sdp: { type: 'answer' } });
  assert.equal(e.pcs[0].remoteDescription, null);
  await signal({ type: 'answer', sdp: { type: 'answer' } }); assert.equal(e.pcs[0].accepted.length, 1);
});

test('Phone host replaces an apparently connected peer for a new pairing attempt', async () => {
  const e = environment(); const hook = load('src/hooks/usePhonePairing.ts', e.mocks, e.globals).useHostPairing(); e.effects.forEach(f => f());
  const signal = payload => e.channels[0].handlers['broadcast:sig']({ payload: { from: 'phone', token: hook.token, ...payload } });
  await signal({ type: 'claim', attemptId: 'one' }); e.pcs[0].connectionState = 'connected';
  await signal({ type: 'claim', attemptId: 'two' }); assert.equal(e.pcs.length, 2); assert.equal(e.pcs[0].connectionState, 'closed');
  await signal({ type: 'bye', attemptId: 'one' }); assert.notEqual(e.pcs[1].connectionState, 'closed');
});

test('Party queues a media change until the pending offer receives an answer', async () => {
  const e = environment(); const hook = load('src/hooks/usePartyMesh.tsx', e.mocks, e.globals).usePartyMesh({ roomId: 'room', userId: 'a', username: 'A' });
  e.effects.forEach(f => f()); e.channels[0].handlers['presence:sync'](); await flush();
  await hook.toggleCamera(); assert.equal(e.channels[0].sent.filter(p => p.type === 'offer').length, 1);
  await e.channels[0].handlers['broadcast:party-signal']({ payload: { type: 'answer', from: 'b', to: 'a', sdp: { type: 'answer' } } });
  assert.equal(e.channels[0].sent.filter(p => p.type === 'offer').length, 2);
});

test('Duel reacquires an ended video while preserving the existing microphone', async () => {
  const e = environment(); const old = videoTrack(); const audio = { ...videoTrack(), kind: 'audio' };
  let acquisitions = 0;
  e.globals.navigator.mediaDevices.getUserMedia = async () => new Stream(++acquisitions === 1 ? [old, audio] : [videoTrack()]);
  const tree = load('src/components/duel/WebRTCVideoCall.tsx', e.mocks, e.globals).WebRTCVideoCall({ duelId: 'd', userId: 'a', isCreator: true }, null);
  e.effects.find(f => f.toString().includes('const init ='))(); await flush(); old.readyState = 'ended'; old.onended();
  function find(node) { if (!node || typeof node !== 'object') return; if (node.props?.onClick?.name === 'toggleVideo') return node; for (const child of [node.props?.children].flat(Infinity)) { const hit = find(child); if (hit) return hit; } }
  await find(tree).props.onClick();
  assert.equal(acquisitions, 2); assert.equal(audio.readyState, 'live');
  assert.ok(e.refs.some(r => r.current instanceof Stream && r.current.getAudioTracks().includes(audio) && r.current.getVideoTracks()[0]?.readyState === 'live'));
});

test('An ICE restart candidate received before the next SDP is retained', async () => {
  const e = environment(); const pc = new e.globals.RTCPeerConnection({});
  const { queueRemoteCandidate, flushRemoteCandidates } = load('src/utils/webrtcCandidates.ts');
  await pc.setRemoteDescription({ type: 'offer', sdp: 'a=ice-ufrag:previous\r\n' });
  const pending = [];
  await queueRemoteCandidate(pc, { candidate: 'good', usernameFragment: 'fresh' }, pending);
  assert.equal(pc.accepted.length, 0); assert.equal(pending.length, 1);
  await pc.setRemoteDescription({ type: 'offer', sdp: 'a=ice-ufrag:fresh\r\n' });
  await flushRemoteCandidates(pc, pending); assert.equal(pc.accepted.length, 1);
});

test('Camera acquired after leaving the room is stopped instead of leaked', async () => {
  const e = environment(); const old = videoTrack(); let finishCapture, calls = 0;
  e.mocks['@/utils/remoteAudioRegistry'] = { clearRemoteStreams() {}, unregisterRemoteStream() {} };
  e.globals.navigator.mediaDevices.getUserMedia = async () => ++calls === 1 ? new Stream([old]) : new Promise(resolve => { finishCapture = resolve; });
  const tree = load('src/components/duel/WebRTCVideoCall.tsx', e.mocks, e.globals).WebRTCVideoCall({ duelId: 'd', userId: 'a', isCreator: true }, null);
  const cleanup = e.effects.find(f => f.toString().includes('const init ='))(); await flush(); old.readyState = 'ended'; old.onended();
  function find(node) { if (!node || typeof node !== 'object') return; if (node.props?.onClick?.name === 'toggleVideo') return node; for (const child of [node.props?.children].flat(Infinity)) { const hit = find(child); if (hit) return hit; } }
  const acquiring = find(tree).props.onClick(); cleanup();
  const fresh = videoTrack(); finishCapture(new Stream([fresh])); await acquiring;
  assert.equal(fresh.readyState, 'ended');
});

// ---- Duel signalling v2: session ids, queued renegotiation, ICE restart ----
async function duel(userId, extra = {}) {
  const e = environment();
  e.mocks['@/utils/remoteAudioRegistry'] = { registerRemoteStream() {}, unregisterRemoteStream() {}, clearRemoteStreams() {} };
  load('src/components/duel/WebRTCVideoCall.tsx', e.mocks, e.globals).WebRTCVideoCall({ duelId: 'd', userId, isCreator: true, ...extra }, null);
  e.effects.find(f => f.toString().includes('const init ='))(); await flush(); await flush();
  const ch = e.channels[0];
  const signal = async (senderId, payload) => { await ch.handlers['broadcast:webrtc-signal']({ payload: { senderId, targetId: payload.broadcast ? undefined : userId, ...payload } }); await flush(); await flush(); };
  const sent = type => ch.sent.filter(p => p.type === type);
  return { e, ch, signal, sent };
}

test('Duel offerer rebuilds immediately when the opponent reloads, and ignores healthy heartbeats', async () => {
  const { e, signal, sent } = await duel('a');
  await signal('b', { type: 'ready', broadcast: true, v: 2, inst: 'tab1' });
  assert.equal(e.pcs.length, 1); assert.equal(sent('offer').length, 1);
  const offer = sent('offer')[0]; assert.ok(offer.pcId); assert.equal(offer.v, 2); assert.ok(offer.inst);
  await signal('b', { type: 'answer', sdp: { type: 'answer', sdp: 'a=ice-ufrag:fresh\r\n' }, v: 2, inst: 'tab1', pcId: 'pb1', toPc: offer.pcId });
  e.pcs[0].connectionState = 'connected';
  const readyReplies = sent('ready').length;
  await signal('b', { type: 'ready', broadcast: true, v: 2, inst: 'tab1' });
  assert.equal(sent('offer').length, 1, 'healthy heartbeat must not renegotiate');
  assert.equal(sent('ready').length, readyReplies, 'healthy heartbeat must not be answered');
  await signal('b', { type: 'ready', broadcast: true, v: 2, inst: 'tab2' });
  assert.equal(e.pcs.length, 2); assert.equal(e.pcs[0].connectionState, 'closed');
  assert.equal(sent('offer').length, 2); assert.notEqual(sent('offer')[1].pcId, offer.pcId);
});

test('Legacy heartbeat (no inst) keeps the previous re-offer behaviour', async () => {
  const { e, signal, sent } = await duel('a');
  await signal('b', { type: 'ready', broadcast: true });
  await signal('b', { type: 'answer', sdp: { type: 'answer', sdp: 'x' } });
  e.pcs[0].connectionState = 'connected';
  await signal('b', { type: 'ready', broadcast: true });
  assert.equal(sent('offer').length, 2);
});

test('Non-offerer rebuilds its connection for an offer from a new remote PeerConnection', async () => {
  const { e, signal, sent } = await duel('z');
  await signal('a', { type: 'offer', sdp: { type: 'offer', sdp: 'a=ice-ufrag:fresh\r\n' }, v: 2, inst: 't1', pcId: 'pa1' });
  assert.equal(sent('answer').length, 1); assert.equal(sent('answer')[0].toPc, 'pa1');
  await signal('a', { type: 'offer', sdp: { type: 'offer', sdp: 'a=ice-ufrag:fresh\r\n' }, v: 2, inst: 't1', pcId: 'pa1' });
  assert.equal(e.pcs.length, 1, 'renegotiation of the same PC reuses it');
  await signal('a', { type: 'offer', sdp: { type: 'offer', sdp: 'a=ice-ufrag:fresh\r\n' }, v: 2, inst: 't1', pcId: 'pa2' });
  assert.equal(e.pcs.length, 2); assert.equal(e.pcs[0].connectionState, 'closed');
  assert.equal(sent('answer')[2].toPc, 'pa2');
});

test('Legacy offer rejected by a stale connection is retried on a fresh one', async () => {
  const { e, signal, sent } = await duel('z');
  await signal('a', { type: 'offer', sdp: { type: 'offer', sdp: 'a=ice-ufrag:fresh\r\n' } });
  e.pcs[0].setRemoteDescription = async () => { throw new Error('Failed to set SSL role'); };
  await signal('a', { type: 'offer', sdp: { type: 'offer', sdp: 'a=ice-ufrag:fresh\r\n' } });
  assert.equal(e.pcs.length, 2); assert.equal(sent('answer').length, 2);
});

test('Answer addressed to a discarded PeerConnection is ignored', async () => {
  const { e, signal } = await duel('a');
  await signal('b', { type: 'ready', broadcast: true, v: 2, inst: 'tab1' });
  await signal('b', { type: 'answer', sdp: { type: 'answer', sdp: 'x' }, v: 2, inst: 'tab1', toPc: 'old-pc' });
  assert.equal(e.pcs[0].remoteDescription, null);
});

test('Renegotiation requested while an offer is in flight is replayed after the answer', async () => {
  const { signal, sent } = await duel('a');
  await signal('b', { type: 'ready', broadcast: true, v: 2, inst: 'tab1' });
  await signal('b', { type: 'request-offer', v: 2, inst: 'tab1' });
  assert.equal(sent('offer').length, 1, 'no second offer while waiting for the answer');
  await signal('b', { type: 'answer', sdp: { type: 'answer', sdp: 'x' }, v: 2, inst: 'tab1', toPc: sent('offer')[0].pcId });
  await flush();
  assert.equal(sent('offer').length, 2);
});

test('ICE candidates are batched for v2 peers and sent one by one to legacy peers', async () => {
  const { e, signal, sent } = await duel('a');
  await signal('b', { type: 'ready', broadcast: true, v: 2, inst: 'tab1' });
  await signal('c', { type: 'ready', broadcast: true });
  const cand = c => ({ candidate: { toJSON: () => ({ candidate: c }) } });
  ['1', '2', '3'].forEach(c => e.pcs[0].onicecandidate(cand(c)));
  ['1', '2', '3'].forEach(c => e.pcs[1].onicecandidate(cand(c)));
  e.pcs[0].onicecandidate({ candidate: null });
  const toB = sent('ice-candidate').filter(p => p.targetId === 'b');
  const toC = sent('ice-candidate').filter(p => p.targetId === 'c');
  assert.equal(toB.length, 1); assert.equal(toB[0].candidates.length, 3);
  assert.equal(toC.length, 3); assert.ok(toC.every(p => p.candidate && !p.candidates));
});

test('Receiver accepts a batch of candidates and drops candidates for another local PC', async () => {
  const { e, signal } = await duel('z');
  await signal('a', { type: 'offer', sdp: { type: 'offer', sdp: 'a=ice-ufrag:fresh\r\n' }, v: 2, inst: 't1', pcId: 'pa1' });
  const local = e.channels[0].sent.find(p => p.type === 'answer').pcId;
  await signal('a', { type: 'ice-candidate', v: 2, inst: 't1', pcId: 'pa1', toPc: local, candidates: [{ candidate: 'c1', usernameFragment: 'fresh' }, { candidate: 'c2', usernameFragment: 'fresh' }] });
  await signal('a', { type: 'ice-candidate', v: 2, inst: 't1', pcId: 'pa1', toPc: 'old', candidate: { candidate: 'c3', usernameFragment: 'fresh' } });
  assert.deepEqual(e.pcs[0].accepted.map(c => c.candidate), ['c1', 'c2']);
});

test('Non-offerer asks the offerer for an ICE restart when ICE fails', async () => {
  const { e, signal, sent } = await duel('z');
  await signal('a', { type: 'offer', sdp: { type: 'offer', sdp: 'a=ice-ufrag:fresh\r\n' }, v: 2, inst: 't1', pcId: 'pa1' });
  e.pcs[0].iceConnectionState = 'failed'; e.pcs[0].oniceconnectionstatechange();
  const req = sent('request-offer').find(p => p.targetId === 'a');
  assert.ok(req); assert.equal(req.iceRestart, true);
  assert.notEqual(e.pcs[0].connectionState, 'closed', 'connection is kept while restarting');
});

test('Offerer answers an ICE restart request with an iceRestart offer on the same connection', async () => {
  const { e, signal, sent } = await duel('a');
  await signal('b', { type: 'ready', broadcast: true, v: 2, inst: 'tab1' });
  await signal('b', { type: 'answer', sdp: { type: 'answer', sdp: 'x' }, v: 2, inst: 'tab1', toPc: sent('offer')[0].pcId });
  const args = []; const orig = e.pcs[0].createOffer.bind(e.pcs[0]);
  e.pcs[0].createOffer = async o => { args.push(o); return orig(o); };
  await signal('b', { type: 'request-offer', v: 2, inst: 'tab1', iceRestart: true });
  assert.equal(e.pcs.length, 1); assert.equal(args.length, 1); assert.equal(args[0].iceRestart, true);
  assert.equal(sent('offer').length, 2);
});

test('A late leave from the previous tab does not drop the new connection', async () => {
  const { e, signal } = await duel('a');
  await signal('b', { type: 'ready', broadcast: true, v: 2, inst: 'tab2' });
  await signal('b', { type: 'leave', broadcast: true, v: 2, inst: 'tab1' });
  assert.notEqual(e.pcs[0].connectionState, 'closed');
  await signal('b', { type: 'leave', broadcast: true, v: 2, inst: 'tab2' });
  assert.equal(e.pcs[0].connectionState, 'closed');
});
