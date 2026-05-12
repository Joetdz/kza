import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Bot, BotOff, X, Send, Paperclip, Smile,
  Info, Phone, Video,
  Reply, CheckCheck, Check, Clock, Mic, Image, FileText,
  Plus, ChevronLeft, Copy, Check as CheckIcon, Hash,
} from 'lucide-react';
import { useWhatsApp, WaContact, WaMessage } from '../../hooks/useWhatsApp';
import { waApi } from '../../api/whatsapp';
import { STATIC_BASE } from '../../api';

// ── WA Web color palette ─────────────────────────────────────────────────────
const C = {
  panelBg:     '#111b21',
  panelHover:  '#202c33',
  activeChat:  '#2a3942',
  chatBg:      '#0b141a',
  sentBubble:  '#005c4b',
  recvBubble:  '#202c33',
  inputBg:     '#202c33',
  text:        '#e9edef',
  textSub:     '#8696a0',
  icon:        '#aebac1',
  divider:     '#222d34',
  badge:       '#00a884',
  headerBg:    '#202c33',
  searchBg:    '#111b21',
};

// Couleur d'avatar déterministe par numéro
const AVATAR_COLORS = ['#d9696d','#b36fff','#2c9c8a','#f0a052','#5aa5d8','#e87d9a','#4db06a','#e06c3b'];
const avatarColor = (phone: string) => AVATAR_COLORS[phone.charCodeAt(0) % AVATAR_COLORS.length];

function initials(c: WaContact): string {
  const name = c.displayName || c.leadName || c.phone.replace('@s.whatsapp.net', '').replace('@c.us', '');
  return name.slice(0, 2).toUpperCase();
}

function displayName(c: WaContact): string {
  return c.displayName || c.leadName || c.phone.replace('@s.whatsapp.net', '').replace('@c.us', '');
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return d.toLocaleDateString('fr', { weekday: 'short' });
  return d.toLocaleDateString('fr', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' });
}

// WA checkmarks
function Ack({ ack, direction }: { ack: number; direction: string }) {
  if (direction === 'in') return null;
  if (ack === 0) return <Clock size={12} className="opacity-60" />;
  if (ack === 1) return <Check size={12} style={{ color: C.textSub }} />;
  if (ack === 2) return <CheckCheck size={12} style={{ color: C.textSub }} />;
  return <CheckCheck size={12} style={{ color: '#53bdeb' }} />;
}

// Media display in bubble
function MediaContent({ msg }: { msg: WaMessage }) {
  const url = msg.mediaUrl ? `${STATIC_BASE}${msg.mediaUrl}` : null;
  const type = msg.mediaType ?? '';

  if (!url && !type) return null;

  if (type === 'image' || type === 'sticker') {
    return url
      ? <img src={url} alt="img" className="max-w-[220px] rounded-lg mb-1 block" />
      : <div className="flex items-center gap-2 text-xs opacity-70"><Image size={16} /> Image</div>;
  }
  if (type === 'audio' || type === 'voice' || type === 'ptt') {
    return url
      ? <audio controls src={url} className="max-w-[220px] mb-1" />
      : <div className="flex items-center gap-2 text-xs opacity-70"><Mic size={16} /> Vocal</div>;
  }
  if (type === 'video') {
    return url
      ? <video controls src={url} className="max-w-[220px] rounded-lg mb-1" />
      : <div className="flex items-center gap-2 text-xs opacity-70"><Video size={16} /> Vidéo</div>;
  }
  return (
    <div className="flex items-center gap-2 text-xs opacity-70">
      <FileText size={16} /> {type || 'Fichier'}
    </div>
  );
}

// QR / connect screen
function ConnectScreen({
  pairingCode, pairingError, loading, onConnectPairing,
}: {
  pairingCode: string | null;
  pairingError: string | null;
  loading: any;
  onConnectPairing: (phone: string) => Promise<void>;
}) {
  const [phoneInput, setPhoneInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleConnect = async () => {
    if (!phoneInput.trim()) return;
    setConnecting(true);
    try { await onConnectPairing(phoneInput.trim()); } catch { setConnecting(false); }
  };

  useEffect(() => {
    if (pairingError) setConnecting(false);
  }, [pairingError]);

  const handleCopy = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode.replace(/-/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Code reçu ──
  if (pairingCode) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4" style={{ background: C.chatBg }}>
        <div className="bg-[#202c33] rounded-2xl p-8 max-w-sm w-full text-center shadow-xl space-y-5">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: '#00a884' }}>
            <Hash size={24} color="white" />
          </div>
          <div>
            <p className="text-base font-semibold mb-1" style={{ color: C.text }}>Votre code de liaison</p>
            <p className="text-xs" style={{ color: C.textSub }}>Ouvre WhatsApp sur ton téléphone</p>
          </div>
          <div className="rounded-2xl py-4 px-6 flex items-center justify-center gap-4"
            style={{ background: '#111b21', border: '1px solid #374151' }}>
            <span className="text-4xl font-black tracking-[0.25em] font-mono" style={{ color: '#00a884' }}>
              {pairingCode}
            </span>
            <button onClick={handleCopy} title="Copier"
              className="p-2 rounded-xl transition-colors"
              style={{ background: copied ? '#00a884' : '#2a3942', color: 'white' }}>
              {copied ? <CheckIcon size={16} /> : <Copy size={16} />}
            </button>
          </div>
          <ol className="text-sm text-left space-y-2" style={{ color: C.textSub }}>
            <li>1. Paramètres → <strong style={{ color: C.text }}>Appareils liés</strong></li>
            <li>2. <strong style={{ color: C.text }}>+ Lier un appareil</strong></li>
            <li>3. <strong style={{ color: C.text }}>Lier avec un numéro de téléphone</strong></li>
            <li>4. Entrez le code ci-dessus</li>
          </ol>
          <p className="text-xs" style={{ color: '#6b7280' }}>Le code se renouvelle toutes les 3 minutes</p>
        </div>
      </div>
    );
  }

  // ── Chargement Chrome ──
  if (loading || connecting) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4" style={{ background: C.chatBg }}>
        <div className="bg-[#202c33] rounded-2xl p-8 max-w-sm w-full text-center shadow-xl space-y-4">
          <div className="flex items-center justify-center gap-3">
            <span className="w-5 h-5 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm" style={{ color: C.textSub }}>
              {loading ? (loading.message || 'Chargement...') : 'Démarrage du navigateur...'}
            </span>
          </div>
          {loading && (
            <>
              <div className="w-full bg-[#111b21] rounded-full h-1.5">
                <div className="h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${loading.percent}%`, background: '#00a884' }} />
              </div>
              <p className="text-xs" style={{ color: C.textSub }}>{loading.percent}%</p>
            </>
          )}
          <p className="text-xs" style={{ color: C.textSub }}>Génération du code en cours...</p>
        </div>
      </div>
    );
  }

  // ── Saisie du numéro ──
  return (
    <div className="flex flex-col items-center justify-center h-full px-4" style={{ background: C.chatBg }}>
      <div className="bg-[#202c33] rounded-2xl p-6 sm:p-8 max-w-sm w-full shadow-xl space-y-5">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: '#00a884' }}>
            <Phone size={28} color="white" />
          </div>
          <h2 className="text-xl font-semibold" style={{ color: C.text }}>Connecter WhatsApp</h2>
          <p className="text-xs mt-1" style={{ color: C.textSub }}>
            Entrez votre numéro pour recevoir un code de liaison
          </p>
        </div>
        {pairingError && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#3b1515', color: '#f87171', border: '1px solid #7f1d1d' }}>
            {pairingError}
          </div>
        )}
        <input
          type="tel"
          value={phoneInput}
          onChange={e => setPhoneInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleConnect()}
          placeholder="+243 812 345 678"
          className="w-full rounded-xl px-4 py-3 text-sm outline-none"
          style={{ background: '#111b21', color: C.text, border: '1px solid #374151' }}
        />
        <button
          onClick={handleConnect}
          disabled={!phoneInput.trim()}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-50"
          style={{ background: '#00a884', color: 'white' }}>
          Obtenir le code de liaison
        </button>
      </div>
    </div>
  );
}

export function Inbox() {
  const {
    connected, phone, pairingCode, pairingError, loading, contacts, messages, sync,
    loadContacts, loadMessages, sendMessage, updateContact,
    initConnectPairing, initDisconnect, setContacts,
  } = useWhatsApp();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [repliedTo, setRepliedTo] = useState<WaMessage | null>(null);
  const [showCrmPanel, setShowCrmPanel] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'contacts' | 'chat' | 'crm'>('contacts');
  // CRM panel state
  const [notes, setNotes] = useState<any[]>([]);
  const [noteText, setNoteText] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedContact = contacts.find(c => c.id === selectedId) ?? null;
  const selectedMessages = selectedId ? (messages[selectedId] ?? []) : [];

  // If sync completed and selectedId is now stale (contact was re-created with new ID), reset it
  useEffect(() => {
    if (sync.status === 'done' && selectedId && !contacts.find(c => c.id === selectedId)) {
      setSelectedId(null);
    }
  }, [sync.status, contacts]);

  useEffect(() => {
    loadContacts({ filter: filter || undefined, search: search || undefined });
  }, [filter, search]);

  useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId, true);
    waApi.markRead(selectedId).catch(() => {});
    setContacts(prev => prev.map(c => c.id === selectedId ? { ...c, isRead: true } : c));
    waApi.getNotes(selectedId).then(setNotes).catch(() => {});
    setRepliedTo(null);
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedMessages.length]);

  const handleSend = async () => {
    if (!msgText.trim() || !selectedId || !selectedContact) return;
    setSending(true);
    try {
      await sendMessage(selectedId, msgText.trim(), repliedTo?.waId);
      setMsgText('');
      setRepliedTo(null);
    } finally {
      setSending(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !selectedId) return;
    const note = await waApi.createNote(selectedId, noteText.trim());
    setNotes(prev => [note, ...prev]);
    setNoteText('');
    setShowNoteInput(false);
  };

  const selectContact = useCallback((id: string) => {
    setSelectedId(id);
    setShowCrmPanel(false);
    setMobilePanel('chat');
  }, []);

  const syncPct = sync.total > 0 ? Math.round((sync.imported / sync.total) * 100) : 0;

  if (!connected) {
    return <ConnectScreen pairingCode={pairingCode} pairingError={pairingError} loading={loading} onConnectPairing={initConnectPairing} />;
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden rounded-xl shadow-2xl" style={{ background: C.chatBg }}>

      {/* ── LEFT PANEL — Contact list ──────────────────────────────────────────── */}
      <div className={`flex-col w-full lg:w-[360px] lg:shrink-0 border-r ${mobilePanel === 'contacts' ? 'flex' : 'hidden lg:flex'}`} style={{ background: C.panelBg, borderColor: C.divider }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ background: C.headerBg }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm"
              style={{ background: avatarColor(phone ?? '') }}>
              {(phone ?? 'M')[0].toUpperCase()}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {sync.status === 'syncing' && (
              <div className="flex items-center gap-1.5 text-xs" style={{ color: C.textSub }}>
                <span className="w-3 h-3 rounded-full border border-t-transparent animate-spin" style={{ borderColor: '#00a884', borderTopColor: 'transparent' }} />
                {syncPct}%
              </div>
            )}
            <button onClick={initDisconnect} title="Déconnecter"
              className="p-1.5 rounded-full hover:bg-[#2a3942] transition-colors">
              <X size={20} style={{ color: C.icon }} />
            </button>
          </div>
        </div>

        {/* Sync done banner */}
        {sync.status === 'done' && (
          <div className="px-3 py-1.5 text-xs text-center" style={{ background: '#00a884', color: 'white' }}>
            ✅ {sync.imported} conversations synchronisées
          </div>
        )}

        {/* Search */}
        <div className="px-3 py-2" style={{ background: C.panelBg }}>
          <div className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: C.inputBg }}>
            <Search size={16} style={{ color: C.textSub }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher ou démarrer une discussion"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: C.text }}
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto">
          {[
            { k: '', l: 'Tous' },
            { k: 'unread', l: 'Non lus' },
            { k: 'hot', l: '🔥 Chauds' },
            { k: 'assigned', l: 'Assignés' },
          ].map(f => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors"
              style={{
                background: filter === f.k ? '#00a884' : C.inputBg,
                color: filter === f.k ? 'white' : C.textSub,
              }}>
              {f.l}
            </button>
          ))}
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 && (
            <p className="text-xs text-center mt-10 px-6" style={{ color: C.textSub }}>
              Aucune conversation. En attente de messages.
            </p>
          )}
          {contacts.map(c => (
            <button key={c.id} onClick={() => selectContact(c.id)}
              className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left border-b"
              style={{
                background: selectedId === c.id ? C.activeChat : 'transparent',
                borderColor: C.divider,
              }}
              onMouseEnter={e => { if (selectedId !== c.id) (e.currentTarget as HTMLElement).style.background = C.panelHover; }}
              onMouseLeave={e => { if (selectedId !== c.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
              {/* Avatar */}
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ background: avatarColor(c.phone) }}>
                {initials(c)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium truncate" style={{ color: C.text }}>
                    {displayName(c)}
                  </span>
                  <span className="text-xs shrink-0 ml-2" style={{ color: c.isRead ? C.textSub : '#00a884' }}>
                    {formatTime(c.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs truncate flex-1" style={{ color: C.textSub }}>
                    {c.lastMessageText ?? ''}
                  </p>
                  {!c.isRead && (
                    <span className="ml-2 shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: C.badge }}>
                      {' '}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── MIDDLE PANEL — Conversation ────────────────────────────────────────── */}
      <div className={`flex-1 flex-col min-w-0 ${mobilePanel === 'chat' ? 'flex' : 'hidden lg:flex'}`}>
        {!selectedContact ? (
          /* Default screen */
          <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ background: C.chatBg }}>
            <div className="w-24 h-24 rounded-full flex items-center justify-center opacity-10"
              style={{ border: '2px solid #aebac1' }}>
              <Phone size={40} style={{ color: '#aebac1' }} />
            </div>
            <p className="text-lg font-light" style={{ color: C.textSub }}>WhatsApp Web</p>
            <p className="text-sm" style={{ color: C.textSub }}>
              Clique sur une conversation pour l'ouvrir
            </p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-2.5 shrink-0" style={{ background: C.headerBg }}>
              {/* Back to contacts — mobile only */}
              <button onClick={() => setMobilePanel('contacts')}
                className="lg:hidden p-1.5 rounded-full hover:bg-[#2a3942] transition-colors shrink-0"
                style={{ color: C.icon }}>
                <ChevronLeft size={20} />
              </button>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ background: avatarColor(selectedContact.phone) }}>
                {initials(selectedContact)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" style={{ color: C.text }}>
                  {displayName(selectedContact)}
                </p>
                <p className="text-xs" style={{ color: C.textSub }}>
                  {selectedContact.phone.replace('@s.whatsapp.net', '').replace('@c.us', '')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button title={selectedContact.aiEnabled ? 'Désactiver IA' : 'Activer IA'}
                  onClick={() => updateContact(selectedContact.id, { aiEnabled: !selectedContact.aiEnabled })}
                  className="p-2 rounded-full hover:bg-[#2a3942] transition-colors">
                  {selectedContact.aiEnabled
                    ? <Bot size={20} style={{ color: '#00a884' }} />
                    : <BotOff size={20} style={{ color: C.icon }} />}
                </button>
                <button onClick={() => {
                    if (window.innerWidth < 1024) { setMobilePanel('crm'); }
                    else { setShowCrmPanel(v => !v); }
                  }}
                  className="p-2 rounded-full hover:bg-[#2a3942] transition-colors">
                  <Info size={20} style={{ color: (showCrmPanel || mobilePanel === 'crm') ? '#00a884' : C.icon }} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 sm:px-8 lg:px-16 py-4 space-y-1"
              style={{ background: C.chatBg, backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3C/svg%3E")' }}>
              {selectedMessages.map((m, i) => {
                const isOut = m.direction === 'out';
                const showDate = i === 0 || new Date(selectedMessages[i - 1].sentAt).toDateString() !== new Date(m.sentAt).toDateString();
                const quotedMsg = m.quotedMsgId ? selectedMessages.find(x => x.waId === m.quotedMsgId) : null;

                return (
                  <div key={m.id}>
                    {showDate && (
                      <div className="flex justify-center my-3">
                        <span className="text-xs px-3 py-1 rounded-full" style={{ background: '#182229', color: C.textSub }}>
                          {new Date(m.sentAt).toLocaleDateString('fr', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} group`}>
                      <div className="relative max-w-[65%]">
                        {/* Reply button on hover */}
                        <button
                          onClick={() => { setRepliedTo(m); inputRef.current?.focus(); }}
                          className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full"
                          style={{ background: C.panelHover }}>
                          <Reply size={14} style={{ color: C.icon }} />
                        </button>

                        <div className="rounded-lg px-3 py-1.5 shadow"
                          style={{
                            background: isOut ? C.sentBubble : C.recvBubble,
                            borderRadius: isOut ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
                          }}>
                          {/* Quoted message */}
                          {quotedMsg && (
                            <div className="mb-2 px-2 py-1 rounded border-l-4 text-xs opacity-80 cursor-pointer"
                              style={{ borderColor: '#53bdeb', background: 'rgba(255,255,255,0.05)', color: C.text }}>
                              <p className="font-semibold" style={{ color: '#53bdeb' }}>
                                {quotedMsg.direction === 'out' ? 'Vous' : displayName(selectedContact)}
                              </p>
                              <p className="truncate">{quotedMsg.content}</p>
                            </div>
                          )}

                          {/* Media */}
                          <MediaContent msg={m} />

                          {/* Text */}
                          <div className="flex items-end gap-2">
                            <p className="text-sm leading-relaxed break-words flex-1" style={{ color: C.text }}>
                              {m.content}
                            </p>
                            <div className="flex items-center gap-1 shrink-0 ml-1 mt-1 self-end">
                              <span className="text-[10px]" style={{ color: C.textSub }}>
                                {formatMsgTime(m.sentAt)}
                              </span>
                              <Ack ack={m.ack} direction={m.direction} />
                              {m.fromAi && <Bot size={10} style={{ color: '#8696a0' }} />}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply preview */}
            {repliedTo && (
              <div className="flex items-center gap-3 px-4 py-2 border-t" style={{ background: C.inputBg, borderColor: C.divider }}>
                <div className="flex-1 pl-3 border-l-4 rounded text-sm" style={{ borderColor: '#00a884' }}>
                  <p className="font-semibold text-xs" style={{ color: '#00a884' }}>
                    {repliedTo.direction === 'out' ? 'Vous' : displayName(selectedContact)}
                  </p>
                  <p className="truncate text-xs" style={{ color: C.textSub }}>{repliedTo.content}</p>
                </div>
                <button onClick={() => setRepliedTo(null)}>
                  <X size={18} style={{ color: C.icon }} />
                </button>
              </div>
            )}

            {/* Input bar */}
            <div className="flex items-center gap-3 px-4 py-2.5 shrink-0" style={{ background: C.headerBg }}>
              <button className="p-2 rounded-full hover:bg-[#2a3942] transition-colors">
                <Smile size={24} style={{ color: C.icon }} />
              </button>
              <button className="p-2 rounded-full hover:bg-[#2a3942] transition-colors">
                <Paperclip size={24} style={{ color: C.icon }} />
              </button>
              <div className="flex-1 flex items-center rounded-lg px-4 py-2" style={{ background: C.inputBg }}>
                <input
                  ref={inputRef}
                  value={msgText}
                  onChange={e => setMsgText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Écrire un message"
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: C.text }}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={sending || !msgText.trim()}
                className="p-2.5 rounded-full transition-colors disabled:opacity-40"
                style={{ background: '#00a884' }}>
                <Send size={20} color="white" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT PANEL — CRM Info ────────────────────────────────────────────── */}
      {selectedContact && (showCrmPanel || mobilePanel === 'crm') && (
        <div className={`w-full lg:w-[340px] lg:shrink-0 border-l flex-col overflow-y-auto ${mobilePanel === 'crm' ? 'flex' : 'hidden lg:flex'}`}
          style={{ background: C.panelBg, borderColor: C.divider }}>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-4" style={{ background: C.headerBg }}>
            {/* Mobile: back to chat */}
            <button onClick={() => setMobilePanel('chat')} className="lg:hidden">
              <ChevronLeft size={20} style={{ color: C.icon }} />
            </button>
            {/* Desktop: close panel */}
            <button onClick={() => setShowCrmPanel(false)} className="hidden lg:block">
              <X size={20} style={{ color: C.icon }} />
            </button>
            <span className="font-medium" style={{ color: C.text }}>Infos du contact</span>
          </div>

          {/* Avatar + name */}
          <div className="flex flex-col items-center py-6" style={{ background: C.panelBg }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl mb-3"
              style={{ background: avatarColor(selectedContact.phone) }}>
              {initials(selectedContact)}
            </div>
            <p className="font-semibold text-base" style={{ color: C.text }}>{displayName(selectedContact)}</p>
            <p className="text-sm" style={{ color: C.textSub }}>
              {selectedContact.phone.replace('@s.whatsapp.net', '').replace('@c.us', '')}
            </p>
          </div>

          <div className="px-4 space-y-4 pb-6">
            {/* Lead score */}
            <div className="rounded-lg p-3" style={{ background: C.inputBg }}>
              <p className="text-xs mb-2" style={{ color: C.textSub }}>Score lead</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-full h-1.5" style={{ background: '#111b21' }}>
                  <div className="h-1.5 rounded-full transition-all"
                    style={{ width: `${selectedContact.leadScore}%`, background: selectedContact.leadScore > 60 ? '#ff6b35' : selectedContact.leadScore > 30 ? '#00a884' : C.textSub }} />
                </div>
                <span className="text-sm font-bold" style={{ color: C.text }}>
                  {selectedContact.leadScore}/100
                </span>
              </div>
            </div>

            {/* Lead status */}
            <div>
              <p className="text-xs mb-1" style={{ color: C.textSub }}>Statut</p>
              <select value={selectedContact.leadStatus}
                onChange={e => updateContact(selectedContact.id, { leadStatus: e.target.value as any })}
                className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                style={{ background: C.inputBg, color: C.text, border: 'none' }}>
                <option value="cold">❄️ Froid</option>
                <option value="warm">⭐ Tiède</option>
                <option value="hot">🔥 Chaud</option>
                <option value="converted">✅ Converti</option>
                <option value="lost">❌ Perdu</option>
              </select>
            </div>

            {/* Lead data */}
            {[
              { key: 'leadName', label: 'Nom' },
              { key: 'leadNeed', label: 'Besoin' },
              { key: 'leadBudget', label: 'Budget' },
              { key: 'leadCity', label: 'Ville' },
              { key: 'leadProduct', label: 'Produit' },
              { key: 'leadUrgency', label: 'Urgence' },
            ].filter(f => (selectedContact as any)[f.key]).map(f => (
              <div key={f.key} className="flex justify-between text-xs py-1 border-b"
                style={{ borderColor: C.divider }}>
                <span style={{ color: C.textSub }}>{f.label}</span>
                <span className="font-medium" style={{ color: C.text }}>{(selectedContact as any)[f.key]}</span>
              </div>
            ))}

            {/* AI toggle */}
            <div className="flex items-center justify-between rounded-lg p-3" style={{ background: C.inputBg }}>
              <span className="text-sm flex items-center gap-2" style={{ color: C.text }}>
                <Bot size={16} style={{ color: selectedContact.aiEnabled ? '#00a884' : C.textSub }} />
                Agent IA
              </span>
              <div onClick={() => updateContact(selectedContact.id, { aiEnabled: !selectedContact.aiEnabled })}
                className="w-10 h-5 rounded-full cursor-pointer transition-colors"
                style={{ background: selectedContact.aiEnabled ? '#00a884' : '#374045' }}>
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${selectedContact.aiEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </div>

            {/* Agent */}
            <div>
              <p className="text-xs mb-1" style={{ color: C.textSub }}>Agent assigné</p>
              <input
                defaultValue={selectedContact.assignedAgent ?? ''}
                onBlur={e => updateContact(selectedContact.id, { assignedAgent: e.target.value || undefined })}
                placeholder="Email ou nom..."
                className="w-full text-xs rounded-lg px-3 py-2 outline-none"
                style={{ background: C.inputBg, color: C.text, border: 'none' }}
              />
            </div>

            {/* Notes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs" style={{ color: C.textSub }}>Notes internes</p>
                <button onClick={() => setShowNoteInput(v => !v)}>
                  <Plus size={16} style={{ color: C.icon }} />
                </button>
              </div>
              {showNoteInput && (
                <div className="mb-2 space-y-2">
                  <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                    rows={2} placeholder="Ajouter une note..."
                    className="w-full text-xs rounded-lg px-3 py-2 outline-none resize-none"
                    style={{ background: C.inputBg, color: C.text, border: 'none' }} />
                  <button onClick={handleAddNote}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{ background: '#00a884', color: 'white' }}>
                    Enregistrer
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {notes.map(n => (
                  <div key={n.id} className="rounded-lg px-3 py-2 text-xs"
                    style={{ background: '#1f2c34', color: C.text }}>
                    <p>{n.content}</p>
                    <p className="mt-1 text-[10px]" style={{ color: C.textSub }}>
                      {new Date(n.createdAt).toLocaleDateString('fr')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
