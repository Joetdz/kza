import { useState, useEffect, useRef } from 'react';
import {
  Search, Filter, Bot, BotOff, UserCheck, Tag, StickyNote,
  Send, Phone, Archive, RefreshCw, ChevronDown, X, Plus,
} from 'lucide-react';
import { useWhatsApp, WaContact, WaMessage } from '../../hooks/useWhatsApp';
import { waApi } from '../../api/whatsapp';
import { useCurrency } from '../../hooks/useCurrency';

const LEAD_STATUS_CONFIG = {
  cold:      { label: '❄️ Froid',    bg: 'bg-gray-100',   text: 'text-gray-600' },
  warm:      { label: '⭐ Tiède',    bg: 'bg-blue-100',   text: 'text-blue-700' },
  hot:       { label: '🔥 Chaud',    bg: 'bg-orange-100', text: 'text-orange-700' },
  converted: { label: '✅ Converti', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  lost:      { label: '❌ Perdu',    bg: 'bg-red-100',    text: 'text-red-700' },
};

function QRScreen({ qr, onConnect }: { qr: string | null; onConnect: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-sm w-full text-center">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Phone size={24} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Connecter WhatsApp</h2>
        {qr ? (
          <>
            <img src={qr} alt="QR Code" className="mx-auto w-56 h-56 my-4 rounded-xl border border-gray-100" />
            <ol className="text-sm text-gray-500 text-left space-y-1 mt-2">
              <li>1. Ouvre WhatsApp sur ton téléphone</li>
              <li>2. Menu → <strong>Appareils liés</strong></li>
              <li>3. Clique sur <strong>+ Lier un appareil</strong></li>
              <li>4. Scanne ce QR code</li>
            </ol>
          </>
        ) : (
          <p className="text-sm text-gray-500 mb-4">
            Clique sur le bouton pour générer le QR code de connexion.
          </p>
        )}
        {!qr && (
          <button
            onClick={onConnect}
            className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Connecter WhatsApp
          </button>
        )}
      </div>
    </div>
  );
}

function LeadBadge({ status }: { status: string }) {
  const cfg = LEAD_STATUS_CONFIG[status as keyof typeof LEAD_STATUS_CONFIG] ?? LEAD_STATUS_CONFIG.cold;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

export function Inbox() {
  const {
    connected, phone, qr, contacts, messages,
    loadContacts, loadMessages, sendMessage, updateContact,
    initConnect, initDisconnect, setContacts,
  } = useWhatsApp();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [msgText, setMsgText] = useState('');
  const [notes, setNotes] = useState<any[]>([]);
  const [noteText, setNoteText] = useState('');
  const [tags, setTags] = useState<any[]>([]);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedContact = contacts.find(c => c.id === selectedId) ?? null;
  const selectedMessages = selectedId ? (messages[selectedId] ?? []) : [];

  useEffect(() => {
    loadContacts({ filter: filter || undefined, search: search || undefined });
  }, [filter, search]);

  useEffect(() => {
    if (selectedId) {
      loadMessages(selectedId);
      waApi.markRead(selectedId).catch(() => {});
      setContacts(prev => prev.map(c => c.id === selectedId ? { ...c, isRead: true } : c));
      waApi.getNotes(selectedId).then(setNotes).catch(() => {});
      waApi.getTags().then(setTags).catch(() => {});
    }
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedMessages.length]);

  const handleSend = async () => {
    if (!msgText.trim() || !selectedId || !selectedContact) return;
    setSending(true);
    try {
      await sendMessage(selectedId, msgText.trim());
      setMsgText('');
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

  const unreadCount = contacts.filter(c => !c.isRead && !c.isArchived).length;

  if (!connected && !qr) {
    return <QRScreen qr={null} onConnect={initConnect} />;
  }
  if (!connected && qr) {
    return <QRScreen qr={qr} onConnect={initConnect} />;
  }

  return (
    <div className="flex h-[calc(100vh-80px)] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* ── Col 1: Contact list ─────────────────────────────────────────────── */}
      <div className="w-72 border-r border-gray-100 flex flex-col shrink-0">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-semibold text-gray-900">Conversations</span>
              {unreadCount > 0 && (
                <span className="ml-2 bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5">{unreadCount}</span>
              )}
            </div>
            <button onClick={initDisconnect} title="Déconnecter" className="text-gray-400 hover:text-red-500 transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          {/* Filters */}
          <div className="flex gap-1 flex-wrap">
            {[
              { key: '', label: 'Tous' },
              { key: 'unread', label: 'Non lus' },
              { key: 'hot', label: '🔥 Chauds' },
              { key: 'assigned', label: 'Assignés' },
              { key: 'unassigned', label: 'Non assignés' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                  filter === f.key
                    ? 'bg-indigo-100 text-indigo-700 font-semibold'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 && (
            <div className="text-center text-gray-400 text-xs mt-8 px-4">
              Aucune conversation. Attendez un message entrant.
            </div>
          )}
          {contacts.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 text-left ${
                selectedId === c.id ? 'bg-indigo-50' : ''
              }`}
            >
              {/* Avatar */}
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                {(c.leadName ?? c.displayName ?? c.phone)[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm truncate ${!c.isRead ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                    {c.leadName ?? c.displayName ?? c.phone.replace('@s.whatsapp.net', '')}
                  </span>
                  {!c.isRead && <div className="w-2 h-2 bg-green-500 rounded-full shrink-0" />}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <LeadBadge status={c.leadStatus} />
                  {c.assignedAgent && (
                    <span className="text-xs text-indigo-600 truncate">→ {c.assignedAgent}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Col 2: Conversation ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedContact ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Sélectionne une conversation
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                {(selectedContact.leadName ?? selectedContact.displayName ?? selectedContact.phone)[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 text-sm truncate">
                  {selectedContact.leadName ?? selectedContact.displayName ?? selectedContact.phone.replace('@s.whatsapp.net', '')}
                </div>
                <div className="text-xs text-gray-400">{selectedContact.phone.replace('@s.whatsapp.net', '')}</div>
              </div>
              <LeadBadge status={selectedContact.leadStatus} />
              <button
                onClick={() => updateContact(selectedContact.id, { aiEnabled: !selectedContact.aiEnabled })}
                title={selectedContact.aiEnabled ? 'Désactiver IA' : 'Activer IA'}
                className={`p-1.5 rounded-lg transition-colors ${
                  selectedContact.aiEnabled
                    ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                    : 'text-gray-400 hover:bg-gray-100'
                }`}
              >
                {selectedContact.aiEnabled ? <Bot size={16} /> : <BotOff size={16} />}
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {selectedMessages.map(m => (
                <div
                  key={m.id}
                  className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-3 py-2 rounded-2xl text-sm ${
                      m.direction === 'out'
                        ? 'bg-indigo-600 text-white rounded-tr-sm'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}
                  >
                    {m.content}
                    {m.fromAi && (
                      <div className="flex items-center gap-1 mt-1 opacity-70">
                        <Bot size={10} />
                        <span className="text-[10px]">IA</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-2">
              <input
                value={msgText}
                onChange={e => setMsgText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Écrire un message..."
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleSend}
                disabled={sending || !msgText.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white p-2.5 rounded-xl transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Col 3: Lead info ──────────────────────────────────────────────────── */}
      {selectedContact && (
        <div className="w-72 border-l border-gray-100 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Score */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Score</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-blue-400 to-orange-500 transition-all"
                    style={{ width: `${selectedContact.leadScore}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-gray-700">{selectedContact.leadScore}/100</span>
              </div>
            </div>

            {/* Lead status */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Statut lead</div>
              <select
                value={selectedContact.leadStatus}
                onChange={e => updateContact(selectedContact.id, { leadStatus: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="cold">❄️ Froid</option>
                <option value="warm">⭐ Tiède</option>
                <option value="hot">🔥 Chaud</option>
                <option value="converted">✅ Converti</option>
                <option value="lost">❌ Perdu</option>
              </select>
            </div>

            {/* Lead info */}
            <div className="space-y-1.5">
              {selectedContact.leadName && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Nom</span>
                  <span className="text-gray-800 font-medium">{selectedContact.leadName}</span>
                </div>
              )}
              {selectedContact.leadNeed && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Besoin</span>
                  <span className="text-gray-800 font-medium">{selectedContact.leadNeed}</span>
                </div>
              )}
              {selectedContact.leadBudget && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Budget</span>
                  <span className="text-gray-800 font-medium">{selectedContact.leadBudget}</span>
                </div>
              )}
              {selectedContact.leadCity && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Ville</span>
                  <span className="text-gray-800 font-medium">{selectedContact.leadCity}</span>
                </div>
              )}
              {selectedContact.leadProduct && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Produit</span>
                  <span className="text-gray-800 font-medium">{selectedContact.leadProduct}</span>
                </div>
              )}
            </div>

            {/* Agent assignment */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Agent assigné</div>
              <input
                defaultValue={selectedContact.assignedAgent ?? ''}
                onBlur={e => updateContact(selectedContact.id, { assignedAgent: e.target.value || undefined })}
                placeholder="Email ou nom de l'agent"
                className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>

            {/* Tags */}
            <div>
              <div className="text-xs text-gray-500 mb-1">Tags</div>
              <div className="flex flex-wrap gap-1">
                {selectedContact.tags.map(({ tag }) => (
                  <span
                    key={tag.id}
                    className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-gray-500">Notes internes</div>
                <button
                  onClick={() => setShowNoteInput(v => !v)}
                  className="text-indigo-500 hover:text-indigo-700 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
              {showNoteInput && (
                <div className="mb-2">
                  <textarea
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    rows={2}
                    placeholder="Ajouter une note..."
                    className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
                  />
                  <button
                    onClick={handleAddNote}
                    className="mt-1 text-xs bg-indigo-600 text-white px-3 py-1 rounded-lg"
                  >
                    Ajouter
                  </button>
                </div>
              )}
              <div className="space-y-1">
                {notes.map(n => (
                  <div key={n.id} className="text-xs bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-gray-700">
                    {n.content}
                    <div className="text-gray-400 mt-0.5">{new Date(n.createdAt).toLocaleDateString('fr')}</div>
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
