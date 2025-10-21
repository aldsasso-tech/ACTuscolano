import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, signInAnonymously, signInWithCustomToken, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence
} from 'firebase/auth';
import { 
    getFirestore, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, addDoc, getDoc, setLogLevel
} from 'firebase/firestore';
import { Users, Calendar, BarChart2, Zap, Save, Trash2, Edit, Minimize2, Maximize2, LogOut } from 'lucide-react';

// --- Variabili Globali del Canvas ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Costanti di Formazione
const FORMATION_POSITIONS = {
    P: { label: 'Portiere', x: 50, y: 10, roleKey: 'Portiere' },
    DS: { label: 'Difensore Sinistro', x: 20, y: 30, roleKey: 'Terzino sinistro' },
    DC: { label: 'Difensore Centrale', x: 50, y: 35, roleKey: 'Difensore centrale' },
    DD: { label: 'Difensore Destro', x: 80, y: 30, roleKey: 'Terzino destro' },
    CC_S: { label: 'Centrocampista Sinistro', x: 25, y: 55, roleKey: 'Centrocampista sinistro' },
    CC_C: { label: 'Centrocampista Centrale', x: 50, y: 65, roleKey: 'Centrocampista centrale' },
    CC_D: { label: 'Centrocampista Destro', x: 75, y: 55, roleKey: 'Centrocampista destro' },
    ATT: { label: 'Attaccante Centrale', x: 50, y: 85, roleKey: 'Attacante centrale' },
};
const ROLES = Object.values(FORMATION_POSITIONS).map(pos => pos.roleKey);
const initialPlayerState = { nome: '', cognome: '', ruolo: 'Portiere', numeroMaglia: '', stato: 'Riserva', userId: '' };

const MOCK_CALENDAR_DATA = [
    { id: 'match_1', data: '2025-10-25', avversario: 'Squadra Alpha', tipo: 'Campionato', availability: {}, formation: null },
    { id: 'match_2', data: '2025-11-01', avversario: 'Squadra Beta', tipo: 'Amichevole', availability: {}, formation: null },
    { id: 'match_3', data: '2025-11-08', avversario: 'Squadra Gamma', tipo: 'Campionato', availability: {}, formation: null },
];

const DEFAULT_FORMATION_DATA = {
    initialLineup: { 
        P: 'P_1', DS: 'D_1', DC: 'D_2', DD: 'D_3',
        CC_S: 'C_1', CC_C: 'C_2', CC_D: 'C_3', ATT: 'A_1',
    },
    substitutions: [
        { minuto: 45, playerOutKey: 'DC', playerInId: 'R_1', newPositionKey: 'DC' },
        { minuto: 60, playerOutKey: 'CC_C', playerInId: 'R_2', newPositionKey: 'CC_C' },
        { minuto: 75, playerOutKey: 'ATT', playerInId: 'R_3', newPositionKey: 'ATT' },
    ],
};

const NavItem = ({ icon: Icon, label, current, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center px-4 py-2 rounded-lg font-medium text-sm transition duration-150 ${
            current
                ? 'bg-red-600 text-white shadow-md'
                : 'text-gray-700 hover:bg-yellow-50 hover:text-red-600'
        }`}
    >
        <Icon size={18} className="mr-2" />
        {label}
    </button>
);

const App = () => {
    const [isInitialized, setIsInitialized] = useState(false);
    const [user, setUser] = useState(null); 
    const [userId, setUserId] = useState(null); 
    const [view, setView] = useState('squadra');
    const [roster, setRoster] = useState([]);
    const [calendar, setCalendar] = useState([]);
    const [currentRosterPlayer, setCurrentRosterPlayer] = useState(initialPlayerState);
    const [isAdmin, setIsAdmin] = useState(false);
    const [message, setMessage] = useState('');
    const [selectedMatchId, setSelectedMatchId] = useState(null);
    const [dbInstance, setDbInstance] = useState(null);
    const [authInstance, setAuthInstance] = useState(null);


    // 1. Inizializzazione Firebase e Autenticazione
    useEffect(() => {
        let unsubscribeAuth = () => {};
        
        const setupFirebase = async () => {
            try {
                const app = initializeApp(firebaseConfig);
                const db = getFirestore(app);
                const auth = getAuth(app);
                
                // Impostiamo la persistenza locale
                await setPersistence(auth, browserLocalPersistence);
                
                setDbInstance(db);
                setAuthInstance(auth);
                setLogLevel('Debug');
                
                // 2. Autenticazione (Admin o Anonima)
                const signIn = async () => {
                    try {
                        if (initialAuthToken) {
                            await signInWithCustomToken(auth, initialAuthToken);
                            setIsAdmin(true);
                        } else {
                            await signInAnonymously(auth);
                        }
                    } catch (e) {
                        console.error("Errore di autenticazione, fallback anonimo:", e);
                        await signInAnonymously(auth);
                    }
                };
                
                // 3. Listener Stato Autenticazione
                unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
                    if (currentUser) {
                        setUser(currentUser);
                        setUserId(currentUser.uid);
                        // Riconferma lo stato di Admin se l'UID corrisponde a un utente loggato con token
                        if (initialAuthToken && !currentUser.isAnonymous) {
                             setIsAdmin(true);
                        }
                    } else {
                        // Genera un ID temporaneo se anonimo o disconnesso
                        setUser(null);
                        setUserId(crypto.randomUUID()); 
                        setIsAdmin(false);
                    }
                    setIsInitialized(true);
                });

                await signIn();

            } catch (e) {
                console.error("Inizializzazione Firebase Fallita:", e);
                setIsInitialized(true); 
                setUserId(crypto.randomUUID());
            }
        };
        
        setupFirebase();

        return () => {
            unsubscribeAuth();
        };
    }, []);
    
    // Helper per il percorso del DB (pubblico)
    const getPublicCollectionPath = (collectionName) => {
        return `artifacts/${appId}/public/data/${collectionName}`;
    };

    // 2. Data Listeners (Roster e Calendar)
    useEffect(() => {
        if (!dbInstance || !userId || !isInitialized) return;

        let unsubscribeRoster = () => {};
        let unsubscribeCalendar = () => {};

        // Roster Listener
        const rosterPath = getPublicCollectionPath('roster');
        const rosterQuery = query(collection(dbInstance, rosterPath));
        unsubscribeRoster = onSnapshot(rosterQuery, (snapshot) => {
            const players = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
            setRoster(players);
        }, (error) => {
            console.error("Errore nel recupero della rosa:", error);
        });

        // Calendar Listener
        const calendarPath = getPublicCollectionPath('calendar');
        const calendarQuery = query(collection(dbInstance, calendarPath));
        unsubscribeCalendar = onSnapshot(calendarQuery, async (snapshot) => {
            let events = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));

            if (events.length === 0 && isAdmin) {
                // Aggiunge dati mock se non ci sono eventi (solo la prima volta come Admin)
                console.log("Aggiungo dati mock al calendario...");
                for (const event of MOCK_CALENDAR_DATA) {
                    try {
                        const eventRef = doc(dbInstance, calendarPath, event.id);
                        const docSnapshot = await getDoc(eventRef);
                        if (!docSnapshot.exists()) {
                            await setDoc(eventRef, event);
                        }
                    } catch(e) {
                        console.error("Errore nell'impostazione dei dati mock:", e);
                    }
                }
            }

            events.sort((a, b) => new Date(a.data) - new Date(b.data));
            setCalendar(events);
        }, (error) => {
            console.error("Errore nel recupero del calendario:", error);
        });

        return () => {
            unsubscribeRoster();
            unsubscribeCalendar();
        };
    }, [dbInstance, userId, isInitialized, isAdmin]);
    
    // --- Roster Management (Admin Only) ---
    const handleRosterChange = (e) => {
        const { name, value } = e.target;
        setCurrentRosterPlayer(prev => ({ ...prev, [name]: value }));
    };

    const savePlayer = async (e) => {
        e.preventDefault();
        if (!dbInstance || !isAdmin) {
            setMessage('Solo gli amministratori possono salvare i giocatori.');
            return;
        }

        const player = {
            ...currentRosterPlayer,
            numeroMaglia: parseInt(currentRosterPlayer.numeroMaglia) || 0,
            userId: currentRosterPlayer.userId || '',
        };

        if (!player.nome || !player.cognome || !player.ruolo) {
            setMessage('Nome, Cognome e Ruolo sono obbligatori.');
            return;
        }

        const rosterPath = getPublicCollectionPath('roster');

        try {
            if (player.id) {
                const playerId = player.id;
                delete player.id; 
                await updateDoc(doc(dbInstance, rosterPath, playerId), player);
                setMessage(`Giocatore ${player.nome} aggiornato con successo!`);
            } else {
                await addDoc(collection(dbInstance, rosterPath), player);
                setMessage(`Giocatore ${player.nome} aggiunto alla rosa!`);
            }
            setCurrentRosterPlayer(initialPlayerState); 
        } catch (error) {
            console.error("Errore nel salvataggio del giocatore:", error);
            setMessage(`Errore durante il salvataggio del giocatore: ${error.message}`);
        }
        setTimeout(() => setMessage(''), 3000);
    };

    const editPlayer = useCallback((player) => {
        setCurrentRosterPlayer({
            ...player,
            // Assicurati che numeroMaglia sia una stringa per l'input type="number"
            numeroMaglia: player.numeroMaglia ? String(player.numeroMaglia) : '',
        });
    }, []);

    const deletePlayer = useCallback(async (id) => {
        if (!dbInstance || !isAdmin) return;
        
        try {
            const rosterPath = getPublicCollectionPath('roster');
            await deleteDoc(doc(dbInstance, rosterPath, id));
            setMessage('Giocatore eliminato con successo!');
        } catch (error) {
            console.error("Errore nell'eliminazione del giocatore:", error);
            setMessage(`Errore durante l'eliminazione: ${error.message}`);
        }
        setTimeout(() => setMessage(''), 3000);
    }, [dbInstance, isAdmin]);

    // --- Calendar Availability Management (Candidatura) ---
    const isFutureEvent = (dateString) => {
        const eventDate = new Date(dateString);
        eventDate.setHours(23, 59, 59, 999); 
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return eventDate >= today;
    };

    const toggleAvailability = async (eventId, currentAvailability) => {
        if (!dbInstance || !user || !userId) {
            setMessage('Devi essere autenticato per candidarti.');
            return;
        }
        
        const myPlayer = roster.find(p => p.userId === userId);
        if (!myPlayer) {
             setMessage('Devi essere registrato nella rosa con il tuo User ID per candidarti. Il tuo ID è visibile in alto a destra.');
             return;
        }

        const calendarPath = getPublicCollectionPath('calendar');
        const eventRef = doc(dbInstance, calendarPath, eventId);
        const playerAvailability = currentAvailability[userId];

        const newStatus = playerAvailability === 'Disponibile' ? 'Non Disponibile' : 'Disponibile';

        try {
            await updateDoc(eventRef, {
                [`availability.${userId}`]: newStatus
            });
            setMessage(`Disponibilità per l'evento aggiornata a: ${newStatus}.`);
        } catch (error) {
            console.error("Errore nell'aggiornare la disponibilità:", error);
            setMessage(`Errore nell'aggiornare la candidatura: ${error.message}`);
        }
        setTimeout(() => setMessage(''), 3000);
    };

    const handleLogout = () => {
        if (authInstance) {
            signOut(authInstance).then(() => {
                console.log("Utente disconnesso.");
                setIsAdmin(false); 
                // onAuthStateChanged gestirà l'aggiornamento dello stato
            }).catch((error) => {
                console.error("Errore durante il logout:", error);
            });
        }
    };
    
    // Componente RosterList
    const RosterList = useMemo(() => {
        if (roster.length === 0) {
            return <p className="text-center py-4 text-gray-500">Nessun giocatore in rosa. Aggiungine uno come Admin.</p>;
        }

        const sortedRoster = [...roster].sort((a, b) => a.ruolo.localeCompare(b.ruolo) || a.cognome.localeCompare(b.cognome));

        return (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-red-50">
                        <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">#</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Cognome</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Nome</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Ruolo</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Stato</th>
                            {isAdmin && <th className="px-3 py-3"></th>}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {sortedRoster.map((player) => (
                            <tr key={player.id} className="hover:bg-yellow-50/50 transition duration-150">
                                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-red-600">{player.numeroMaglia || '-'}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{player.cognome}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{player.nome}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{player.ruolo}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-xs">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${player.stato === 'Titolare' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                        {player.stato}
                                    </span>
                                </td>
                                {isAdmin && (
                                    <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        <button type="button" onClick={() => editPlayer(player)} className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-yellow-100"><Edit size={16} /></button>
                                        <button type="button" onClick={() => deletePlayer(player.id)} className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-100"><Trash2 size={16} /></button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }, [roster, isAdmin, deletePlayer, editPlayer]);

    // Componente CalendarView
    const CalendarView = useMemo(() => {
        const myPlayer = roster.find(p => p.userId === userId);
        
        return (
            <div className="space-y-4">
                {calendar.length === 0 ? (
                    <p className="text-center py-8 text-gray-500">Nessun evento in calendario. Aggiungi i dati come Admin.</p>
                ) : (
                    calendar.map(event => {
                        const isFuture = isFutureEvent(event.data);
                        const playerStatus = event.availability?.[userId];
                        const availableCount = Object.values(event.availability || {}).filter(s => s === 'Disponibile').length;

                        return (
                            <div key={event.id} className="p-4 bg-white rounded-xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center space-y-3 md:space-y-0 border-l-4 border-red-500">
                                <div className="flex flex-col">
                                    <p className="text-xs font-semibold uppercase text-red-600">{event.tipo}</p>
                                    <h3 className="text-lg font-bold text-gray-900">{event.avversario}</h3>
                                    <p className="text-sm text-gray-500">Data: {new Date(event.data).toLocaleDateString('it-IT', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                    <p className="text-sm font-medium text-gray-600 mt-1">Disponibili: {availableCount}</p>
                                </div>
                                
                                <div className="flex space-x-3">
                                    {/* Pulsante Visualizza Formazione */}
                                    {(isFuture || event.formation) && (
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedMatchId(event.id); setView('formazione'); }}
                                            className="px-3 py-2 text-xs font-semibold rounded-full transition duration-300 shadow-sm bg-yellow-100 text-red-700 hover:bg-yellow-200"
                                        >
                                            <Zap size={16} className="inline mr-1" /> Formazione
                                        </button>
                                    )}

                                    {/* Pulsante Candidatura */}
                                    {isFuture && user && (
                                        <button
                                            type="button"
                                            onClick={() => toggleAvailability(event.id, event.availability || {})}
                                            className={`px-4 py-2 text-sm font-semibold rounded-full transition duration-300 shadow-md ${
                                                playerStatus === 'Disponibile'
                                                    ? 'bg-green-500 text-white hover:bg-green-600'
                                                    : playerStatus === 'Non Disponibile'
                                                    ? 'bg-red-500 text-white hover:bg-red-600'
                                                    : 'bg-red-600 text-white hover:bg-red-700'
                                            }`}
                                            disabled={!myPlayer}
                                        >
                                            {playerStatus === 'Disponibile' ? 'Disponibile' : playerStatus === 'Non Disponibile' ? 'Non Disponibile' : 'Candidatura'}
                                        </button>
                                    )}
                                    {!isFuture && <span className="text-sm text-gray-400">Evento Passato</span>}
                                    {isFuture && !myPlayer && <span className="text-sm text-red-500">Registrati per candidarti</span>}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        );
    }, [calendar, userId, toggleAvailability, user, roster]);

    // Componente FormationSetupAndViewer
    const FormationSetupAndViewer = () => {
        const [minuto, setMinuto] = useState(0);
        const match = calendar.find(e => e.id === selectedMatchId);

        if (!match) {
            return (
                <div className="text-center py-10">
                    <p className="text-lg font-semibold text-gray-700">Seleziona una partita dal calendario per visualizzare la formazione.</p>
                    <button type="button" onClick={() => setView('calendario')} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Vai al Calendario</button>
                </div>
            );
        }
        
        // Helpers per la Formazione dinamica (per demo)
        const getPlayerDetails = (playerId) => roster.find(p => p.id === playerId) || { id: playerId, nome: 'Sconosciuto', cognome: 'Riserva', numeroMaglia: '?' };

        // Funzione per generare una formazione iniziale basata sui titolari disponibili
        const generateInitialLineup = () => {
            const lineup = {};
            // Filtra solo i giocatori con ID utente associato (ipotetici "titolari" reali)
            const availablePlayers = roster.filter(p => p.stato === 'Titolare' || p.userId); 
            
            Object.entries(FORMATION_POSITIONS).forEach(([posKey, posData]) => {
                // Cerca un giocatore disponibile con il ruolo richiesto
                const player = availablePlayers.find(p => p.ruolo === posData.roleKey);
                lineup[posKey] = player ? player.id : DEFAULT_FORMATION_DATA.initialLineup[posKey];
            });
            return lineup;
        };

        const dynamicInitialLineup = useMemo(() => generateInitialLineup(), [roster]);
        const matchFormation = match.formation || {
            initialLineup: dynamicInitialLineup,
            substitutions: DEFAULT_FORMATION_DATA.substitutions,
        };
        
        // 1. Calcola la formazione ATTUALE (basata sul minuto selezionato)
        const currentLineup = { ...matchFormation.initialLineup };
        const matchSubs = matchFormation.substitutions || [];
        const substitutionsExecuted = [];

        matchSubs.filter(sub => sub.minuto <= minuto)
                .forEach(sub => {
                    // Controlla se la posizione è attualmente occupata prima di sostituire
                    if (currentLineup[sub.playerOutKey]) {
                        currentLineup[sub.playerOutKey] = sub.playerInId;
                        substitutionsExecuted.push(sub);
                    }
                });

        // 2. Mappa la formazione Attuale ai dettagli del giocatore
        const currentPlayersOnPitch = Object.entries(currentLineup).map(([posKey, playerId]) => ({
            ...FORMATION_POSITIONS[posKey],
            playerId,
            ...getPlayerDetails(playerId),
            posKey,
        }));

        const RosterAdminForm = useMemo(() => (
            <form onSubmit={(e) => { e.preventDefault(); setMessage('Funzionalità di salvataggio formazione non implementata in questa demo.'); setTimeout(() => setMessage(''), 3000); }} className="mt-6 p-4 bg-yellow-50 rounded-xl shadow-inner border border-yellow-200">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Setup Iniziale Formazione (Admin)</h3>
                <p className="text-sm text-red-500 mb-3">Seleziona i giocatori per la formazione iniziale 3-3-1 (solo se sei admin).</p>
                <div className="grid grid-cols-2 gap-4">
                    {Object.entries(FORMATION_POSITIONS).map(([posKey, posData]) => {
                        const initialPlayerId = matchFormation.initialLineup[posKey];
                        const availablePlayers = roster.filter(p => p.ruolo === posData.roleKey);
                        return (
                            <div key={posKey}>
                                <label className="block text-xs font-medium text-gray-700">{posData.label}</label>
                                <select 
                                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-sm"
                                    defaultValue={initialPlayerId}
                                    disabled={!isAdmin}
                                    // Implementare la logica di aggiornamento stato qui
                                    onChange={(e) => { console.log(`Admin selezionato giocatore ${e.target.value} per posizione ${posKey}`); }}
                                >
                                    <option value="">-- Seleziona Giocatore --</option>
                                    {availablePlayers.map(p => (
                                        <option key={p.id} value={p.id}>{p.cognome} ({p.numeroMaglia}) - {p.stato}</option>
                                    ))}
                                </select>
                            </div>
                        );
                    })}
                </div>
                <button type="submit" disabled={!isAdmin} className={`mt-4 w-full flex justify-center items-center gap-2 font-bold py-2 px-4 rounded-lg transition duration-200 shadow-md ${isAdmin ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                    Salva Formazione Iniziale
                </button>
            </form>
        ), [roster, matchFormation.initialLineup, isAdmin]);

        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center border-b pb-4">
                    <h3 className="text-xl font-bold text-gray-800">Formazione per: {match.avversario}</h3>
                    <button type="button" onClick={() => setView('calendario')} className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1">
                        <Minimize2 size={16} /> Torna al Calendario
                    </button>
                </div>

                {/* Controlli Tempo e Sostituzioni */}
                <div className="p-4 bg-white rounded-xl shadow-lg">
                    <h4 className="text-lg font-semibold mb-2">Simulazione Sostituzioni (Minuto: <span className="text-red-600">{minuto}'</span>)</h4>
                    <input
                        type="range"
                        min="0"
                        max="90"
                        step="5"
                        value={minuto}
                        onChange={(e) => setMinuto(parseInt(e.target.value))}
                        className="w-full h-2 bg-yellow-400 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-600 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer"
                        style={{'--tw-ring-offset-width': '0px', '--tw-ring-color': 'none'}} // Disabilita l'anello di focus di default su alcuni browser
                    />
                    
                    <div className="mt-3 text-sm">
                        <p className="font-medium text-gray-700">Sostituzioni Eseguite:</p>
                        {substitutionsExecuted.length === 0 ? (
                            <p className="text-gray-500 text-sm">Nessuna sostituzione ancora.</p>
                        ) : (
                            <ul className="list-disc list-inside text-gray-600 space-y-1 mt-1 max-h-40 overflow-y-auto">
                                {substitutionsExecuted.map((sub, index) => {
                                    const playerOut = getPlayerDetails(matchFormation.initialLineup[sub.playerOutKey]);
                                    const playerIn = getPlayerDetails(sub.playerInId);
                                    return (
                                        <li key={index} className="text-sm">
                                            <span className="font-bold text-red-600">{sub.minuto}'</span>: Esce <span className="font-medium">{playerOut.cognome}</span>, Entra <span className="font-medium">{playerIn.cognome}</span> (in {FORMATION_POSITIONS[sub.newPositionKey].label})
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Campo da Calcio (Visualizzazione 3-3-1) */}
                <div className="bg-green-700 rounded-xl shadow-xl p-4 overflow-hidden relative">
                    <svg viewBox="0 0 100 100" className="w-full h-[60vh] max-h-[800px] border-4 border-white rounded-lg">
                        {/* Linee del Campo */}
                        <rect x="0" y="0" width="100" height="100" fill="#22C55E" />
                        <line x1="0" y1="50" x2="100" y2="50" stroke="white" strokeWidth="0.5" />
                        <circle cx="50" cy="50" r="8" stroke="white" strokeWidth="0.5" fill="none" />
                        <circle cx="50" cy="50" r="0.5" fill="white" />
                        
                        {/* Aree di Rigore */}
                        <rect x="30" y="0" width="40" height="16" stroke="white" strokeWidth="0.5" fill="none" />
                        <rect x="30" y="84" width="40" height="16" stroke="white" strokeWidth="0.5" fill="none" />
                        
                        {/* Giocatori */}
                        {currentPlayersOnPitch.map(player => (
                            <g key={player.posKey} transform={`translate(${player.x}, ${player.y})`}>
                                <circle r="3.5" fill="rgb(255, 255, 255, 0.9)" stroke="#DC2626" strokeWidth="0.8" />
                                <text x="0" y="1" textAnchor="middle" fontSize="4" fontWeight="bold" fill="#DC2626">{player.numeroMaglia}</text>
                                <text x="0" y="-5" textAnchor="middle" fontSize="3" fill="yellow" fontWeight="bold">{player.cognome}</text>
                            </g>
                        ))}
                    </svg>
                </div>

                {isAdmin && RosterAdminForm}
            </div>
        );
    };


    let content;
    switch (view) {
        case 'statistiche':
            content = (
                <div className="text-center py-20 bg-white rounded-xl shadow-lg">
                    <BarChart2 size={64} className="mx-auto text-red-500 mb-4" />
                    <h2 className="text-3xl font-bold text-gray-800">Sezione Statistiche</h2>
                    <p className="text-gray-500">Qui potrai visualizzare le statistiche della squadra (Non implementato in questa demo).</p>
                </div>
            );
            break;
        case 'calendario':
            content = (
                <>
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Calendario Partite</h2>
                    {CalendarView}
                </>
            );
            break;
        case 'formazione':
            content = (
                <FormationSetupAndViewer />
            );
            break;
        case 'admin':
            const AdminUserForm = (
                <div className="p-6 bg-white rounded-xl shadow-lg space-y-4 max-w-lg mx-auto">
                    <h3 className="text-xl font-bold text-gray-800 border-b pb-2">Gestione Utenze e Dati</h3>
                    <p className="text-sm text-gray-600">
                        Questa sezione è attiva solo in modalità Admin (tramite token).
                    </p>
                    <p className="text-sm font-semibold text-red-600 break-all">ID Utente Corrente: {userId}</p>
                    <p className="text-sm font-medium text-gray-700">Utilizza questo ID per associare un giocatore nella sezione Rosa (solo Admin).</p>
                    <button onClick={() => setMessage('Admin data is managed through Firestore collections.')} className="w-full flex justify-center items-center gap-2 bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition duration-200 shadow-md">
                        <Users size={20} /> Gestisci Database
                    </button>
                </div>
            );
            content = (
                <>
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Pannello di Controllo Admin</h2>
                    {isAdmin ? AdminUserForm : <p className="text-center py-10 text-red-500">Accesso Admin Negato. Autenticati come Admin per accedere a questa sezione.</p>}
                </>
            );
            break;
        case 'squadra':
        default:
            const RosterAdminForm = (
                <form onSubmit={savePlayer} className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-yellow-50 p-4 rounded-xl shadow-inner border border-yellow-200">
                    <h3 className="col-span-1 md:col-span-3 text-lg font-semibold text-gray-700">
                        {currentRosterPlayer.id ? 'Modifica Giocatore' : 'Aggiungi Nuovo Giocatore'}
                    </h3>
                    
                    <input type="text" name="nome" value={currentRosterPlayer.nome} onChange={handleRosterChange} placeholder="Nome" className="p-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500" required disabled={!isAdmin}/>
                    <input type="text" name="cognome" value={currentRosterPlayer.cognome} onChange={handleRosterChange} placeholder="Cognome" className="p-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500" required disabled={!isAdmin}/>
                    
                    <select name="ruolo" value={currentRosterPlayer.ruolo} onChange={handleRosterChange} className="p-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500" required disabled={!isAdmin}>
                        {ROLES.map(role => (<option key={role} value={role}>{role}</option>))}
                    </select>
                    
                    <input type="number" name="numeroMaglia" value={currentRosterPlayer.numeroMaglia} onChange={handleRosterChange} placeholder="N. Maglia" min="0" max="99" className="p-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500" disabled={!isAdmin}/>
                    
                    <select name="stato" value={currentRosterPlayer.stato} onChange={handleRosterChange} className="p-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500" disabled={!isAdmin}>
                        <option value="Titolare">Titolare</option>
                        <option value="Riserva">Riserva</option>
                    </select>

                    <input type="text" name="userId" value={currentRosterPlayer.userId} onChange={handleRosterChange} placeholder="User ID (per Candidatura, opzionale)" className="p-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500" disabled={!isAdmin}/>


                    <button type="submit" className={`col-span-1 md:col-span-3 flex justify-center items-center gap-2 font-bold py-2 px-4 rounded-lg transition duration-200 shadow-md ${isAdmin ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`} disabled={!isAdmin}>
                        <Save size={20} />
                        {currentRosterPlayer.id ? 'Salva Modifiche' : 'Aggiungi alla Rosa'}
                    </button>
                    {currentRosterPlayer.id && (
                        <button type="button" onClick={() => setCurrentRosterPlayer(initialPlayerState)} className="col-span-1 md:col-span-3 flex justify-center items-center gap-2 bg-gray-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-600 transition duration-200 shadow-md">
                            Annulla Modifica
                        </button>
                    )}
                </form>
            );

            content = (
                <>
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Rosa Attuale ({roster.length} Giocatori)</h2>
                    <div className="mb-8">
                        {RosterList}
                    </div>
                    {isAdmin && RosterAdminForm}
                    {!isAdmin && <p className="text-sm text-gray-500 mt-4 text-center">Solo gli amministratori possono modificare la rosa.</p>}
                </>
            );
    }

    // Visualizzazione del caricamento
    if (!isInitialized) {
        return (
            <div className="flex justify-center items-center h-screen bg-gray-100">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-600"></div>
                <p className="ml-4 text-red-700 font-medium">Inizializzazione Applicazione e Autenticazione Firebase...</p>
            </div>
        );
    }

    // Determine the current user's role/status for display
    const loggedInPlayer = roster.find(p => p.userId === userId);
    const userDisplay = isAdmin ? 'Admin' : loggedInPlayer ? `${loggedInPlayer.nome} ${loggedInPlayer.cognome}` : 'Utente (Anonimo)';

    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            <header className="bg-white shadow-md sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
                    <h1 className="text-2xl font-extrabold text-red-700">AC Tuscolano</h1>
                    <div className="flex flex-col sm:flex-row items-end sm:items-center space-y-1 sm:space-y-0 sm:space-x-4">
                        <div className="text-right">
                            <span className="text-xs text-gray-500 block">Autenticato come:</span>
                            <span className={`text-sm font-bold ${isAdmin ? 'text-red-600' : 'text-gray-700'}`}>
                                {userDisplay}
                                {isAdmin && <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded-full">ADMIN</span>}
                            </span>
                            <span className="text-xs text-gray-400 block break-all">ID: {userId || 'Caricamento...'}</span>
                        </div>
                        {user && ( 
                            <button type="button" onClick={handleLogout} className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1 mt-1 sm:mt-0 p-1 rounded-lg hover:bg-gray-100">
                                <LogOut size={16} /> Logout
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
                {/* Navigation Bar */}
                <nav className="mb-8 p-1 bg-white rounded-xl shadow-lg flex flex-wrap justify-center space-x-2 sm:space-x-4">
                    <NavItem icon={Users} label="Rosa" current={view === 'squadra'} onClick={() => setView('squadra')} />
                    <NavItem icon={Zap} label="Formazione" current={view === 'formazione'} onClick={() => { setSelectedMatchId(calendar.length > 0 ? calendar[0].id : null); setView('formazione'); }} />
                    <NavItem icon={Calendar} label="Calendario" current={view === 'calendario'} onClick={() => setView('calendario')} />
                    <NavItem icon={BarChart2} label="Statistiche" current={view === 'statistiche'} onClick={() => setView('statistiche')} />
                    {isAdmin && <NavItem icon={Maximize2} label="Admin" current={view === 'admin'} onClick={() => setView('admin')} />}
                </nav>

                {/* Status Message */}
                {message && (
                    <div className="p-3 mb-4 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded-lg text-sm transition-opacity duration-500">
                        {message}
                    </div>
                )}

                {/* Main Content Area */}
                <div className="bg-white p-6 rounded-xl shadow-lg min-h-[50vh]">
                    {content}
                </div>
            </div>
        </div>
    );
};

export default App;
