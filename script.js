import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, addDoc, 
    writeBatch, deleteDoc, runTransaction 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// =================================================================
// 1. CONFIGURAZIONE FIREBASE (Inserita dall'utente)
// =================================================================
const firebaseConfig = {
    apiKey: "AIzaSyAQLQYXcwyFt5luNw1iA5N2-EfnbF1Bc7U",
    authDomain: "actuscolano.firebaseapp.com",
    projectId: "actuscolano",
    storageBucket: "actuscolano.firebasestorage.app",
    messagingSenderId: "62685359731",
    appId: "1:62685359731:web:26819bedd94fcb1ce8c406",
    measurementId: "G-TSVH8PH4RC"
};

// =================================================================
// 2. INIZIALIZZAZIONE GLOBALE E AUTHENTICAZIONE
// =================================================================
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let userId = null;
let currentView = 'stats'; // Default view
let currentMatchDetails = null; // Dettagli della partita attualmente aperta nel modale
let currentFormationIndex = 0; // Indice della formazione visualizzata

// Variabili globali d'ambiente (fornite dal Canvas, se esistenti)
const appId = typeof __app_id !== 'undefined' ? __app_id : firebaseConfig.projectId;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Percorsi di Firestore (basati sulle regole di sicurezza)
const PATHS = {
    PLAYERS: `artifacts/${appId}/public/data/ac_tuscolano_players`,
    MATCHES: `artifacts/${appId}/public/data/ac_tuscolano_matches`,
};

// Elementi DOM
const elements = {
    loadingStats: document.getElementById('loading-stats'),
    playerListContainer: document.getElementById('player-list-container'),
    loadingCalendar: document.getElementById('loading-calendar'),
    upcomingList: document.getElementById('upcoming-list'),
    pastList: document.getElementById('past-list'),
    adminButton: document.getElementById('admin-button'),
    adminModal: document.getElementById('admin-modal'),
    matchDetailModal: document.getElementById('match-detail-modal'),
    pathPlayers: document.getElementById('path-players'),
    pathMatches: document.getElementById('path-matches'),
};


/**
 * Gestisce l'autenticazione utente (anonima o tramite token).
 * Essenziale per accedere a Firestore.
 */
async function handleAuthentication() {
    try {
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
        console.log("Autenticazione Firebase riuscita.");
    } catch (error) {
        console.error("Errore durante l'autenticazione Firebase:", error);
    }
}

/**
 * Listener di autenticazione per avviare il caricamento dei dati.
 */
onAuthStateChanged(auth, (user) => {
    if (user) {
        userId = user.uid;
        console.log("Utente connesso. UID:", userId);
        
        // Aggiorna i percorsi nel modale admin
        elements.pathPlayers.textContent = PATHS.PLAYERS;
        elements.pathMatches.textContent = PATHS.MATCHES;

        // Avvia l'ascolto dei dati solo dopo l'autenticazione
        setupRealtimeListeners();
    } else {
        userId = null;
        console.warn("Nessun utente autenticato. Tentativo di autenticazione in corso.");
        handleAuthentication();
    }
});

// =================================================================
// 3. LOGICA DI VISUALIZZAZIONE E MODAL
// =================================================================

/**
 * Passa dalla vista Statistiche alla vista Calendario e viceversa.
 * @param {string} viewName - 'stats' o 'calendar'.
 */
window.showView = function(viewName) {
    currentView = viewName;
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });
    document.getElementById(`${viewName}-view`).classList.remove('hidden');

    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('text-accent', 'border-primary');
        button.classList.add('text-gray-500', 'border-transparent', 'hover:border-gray-300');
    });
    document.getElementById(`nav-${viewName}`).classList.add('text-accent', 'border-primary');
    document.getElementById(`nav-${viewName}`).classList.remove('text-gray-500', 'border-transparent', 'hover:border-gray-300');

    // Assicurati che le icone Lucide siano renderizzate
    lucide.createIcons();
};

/**
 * Mostra o nasconde il modale di amministrazione.
 * @param {boolean} show - True per mostrare, false per nascondere.
 */
window.toggleAdminModal = function(show) {
    if (show) {
        elements.adminModal.classList.remove('hidden');
    } else {
        elements.adminModal.classList.add('hidden');
    }
};

/**
 * Mostra i dettagli di una partita nel modale apposito.
 * @param {object} match - Dati della partita.
 */
window.showMatchDetail = function(match) {
    currentMatchDetails = match;
    currentFormationIndex = 0; // Reset index
    
    document.getElementById('match-detail-title').textContent = `${match.homeTeam} vs ${match.awayTeam}`;
    document.getElementById('match-detail-subtitle').textContent = match.date;

    updateMatchDetailView();
    elements.matchDetailModal.classList.remove('hidden');
    lucide.createIcons();
};

/**
 * Chiude il modale dei dettagli della partita.
 */
window.closeMatchDetail = function() {
    elements.matchDetailModal.classList.add('hidden');
    currentMatchDetails = null;
    currentFormationIndex = 0;
};

/**
 * Naviga tra le formazioni di una partita (se presenti).
 * @param {number} direction - 1 per avanti, -1 per indietro.
 */
window.navigateFormation = function(direction) {
    if (!currentMatchDetails || !currentMatchDetails.formations) return;

    const totalFormations = currentMatchDetails.formations.length;
    let newIndex = currentFormationIndex + direction;

    if (newIndex >= 0 && newIndex < totalFormations) {
        currentFormationIndex = newIndex;
        updateMatchDetailView();
    }
};

/**
 * Aggiorna la vista del modale (pitch e tabella) con la formazione corrente.
 */
function updateMatchDetailView() {
    if (!currentMatchDetails || !currentMatchDetails.formations || currentMatchDetails.formations.length === 0) {
        document.getElementById('pitch-container').innerHTML = '<p class="text-center text-gray-500 p-8">Nessuna formazione disponibile.</p>';
        document.getElementById('formation-table-container').innerHTML = '';
        document.getElementById('current-formation-index').textContent = '0 di 0';
        document.getElementById('formation-description').textContent = '';
        document.getElementById('prev-formation-btn').disabled = true;
        document.getElementById('next-formation-btn').disabled = true;
        return;
    }

    const formations = currentMatchDetails.formations;
    const currentFormation = formations[currentFormationIndex];
    const totalFormations = formations.length;

    // Aggiorna l'indicatore
    document.getElementById('current-formation-index').textContent = `${currentFormationIndex + 1} di ${totalFormations}`;
    document.getElementById('formation-description').textContent = currentFormation.description || '';

    // Aggiorna i pulsanti di navigazione
    document.getElementById('prev-formation-btn').disabled = currentFormationIndex === 0;
    document.getElementById('next-formation-btn').disabled = currentFormationIndex === totalFormations - 1;

    // Disegna il campo
    renderPitch(currentFormation.players);

    // Disegna la tabella
    renderFormationTable(currentFormation.players);
}


// =================================================================
// 4. FUNZIONI DI RENDERIZZAZIONE
// =================================================================

/**
 * Renderizza la lista dei giocatori (classifica).
 * @param {Array<object>} players - Lista dei giocatori con statistiche.
 */
function renderPlayerList(players) {
    elements.loadingStats.classList.add('hidden');
    
    // Ordina i giocatori per punteggio totale
    const sortedPlayers = players.sort((a, b) => (b.goals || 0) + (b.assists || 0) - ((a.goals || 0) + (a.assists || 0)));

    let html = '<div class="space-y-3">';

    sortedPlayers.forEach((player, index) => {
        const rank = index + 1;
        const totalPoints = (player.goals || 0) + (player.assists || 0);
        const rankColor = rank === 1 ? 'bg-secondary text-accent' : 
                          rank <= 3 ? 'bg-yellow-200 text-yellow-800' : 
                          'bg-white text-gray-700';

        html += `
            <div class="p-4 rounded-xl shadow-md flex items-center transition-all duration-300 ${rankColor.includes('bg-white') ? 'hover:shadow-lg' : ''} border-l-4 border-primary">
                <div class="w-10 h-10 flex items-center justify-center rounded-full font-bold text-lg ${rankColor}">
                    ${rank}
                </div>
                <div class="ml-4 flex-grow">
                    <p class="font-bold text-lg">${player.name}</p>
                    <p class="text-sm text-gray-500">Ruolo: ${player.role || 'N/D'}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-accent">${totalPoints} Punti</p>
                    <p class="text-sm text-gray-600">⚽ ${player.goals || 0} G, 👟 ${player.assists || 0} A</p>
                </div>
            </div>
        `;
    });

    html += '</div>';
    elements.playerListContainer.innerHTML = html;
    elements.adminButton.classList.remove('hidden'); // Mostra il pulsante Admin dopo il caricamento
    lucide.createIcons();
}

/**
 * Renderizza la lista delle partite (Calendario).
 * @param {Array<object>} matches - Lista di tutte le partite.
 */
function renderMatchList(matches) {
    elements.loadingCalendar.classList.add('hidden');
    
    // Ordina le partite per data
    const sortedMatches = matches.sort((a, b) => new Date(a.date) - new Date(b.date));

    const now = new Date();
    elements.upcomingList.innerHTML = '';
    elements.pastList.innerHTML = '';

    sortedMatches.forEach(match => {
        const matchDate = new Date(match.date);
        const isUpcoming = matchDate > now;
        const container = isUpcoming ? elements.upcomingList : elements.pastList;
        
        let statusHtml = '';
        if (isUpcoming) {
            statusHtml = `<span class="text-xs font-semibold text-primary">Prossima Partita</span>`;
        } else {
            const resultColor = match.isWin ? 'text-green-600' : match.isDraw ? 'text-yellow-600' : 'text-red-600';
            const resultText = match.isWin ? 'VITTORIA' : match.isDraw ? 'PAREGGIO' : 'SCONFITTA';
            statusHtml = `<span class="text-xs font-bold ${resultColor}">${resultText}</span>`;
        }

        const matchHtml = `
            <div class="p-4 rounded-xl shadow-md bg-white hover:bg-gray-50 transition-colors duration-300 border-l-4 border-accent cursor-pointer" onclick="showMatchDetail(${JSON.stringify(match).replace(/"/g, '&quot;')})">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-sm font-semibold text-gray-500">${match.date}</p>
                        <p class="text-lg font-bold text-accent">${match.homeTeam} <span class="text-gray-400 font-normal">vs</span> ${match.awayTeam}</p>
                    </div>
                    <div class="text-right">
                        ${statusHtml}
                        <p class="text-xl font-extrabold text-primary">${match.score || 'N/D'}</p>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += matchHtml;
    });
    
    if (elements.upcomingList.innerHTML === '') {
        elements.upcomingList.innerHTML = '<p class="text-gray-500 italic">Nessun incontro in programma.</p>';
    }
    if (elements.pastList.innerHTML === '') {
        elements.pastList.innerHTML = '<p class="text-gray-500 italic">Nessun risultato precedente.</p>';
    }
    lucide.createIcons();
}

/**
 * Disegna il campo da calcio con la formazione corrente.
 * @param {Array<object>} players - Lista dei giocatori con posizione (x, y).
 */
function renderPitch(players) {
    const pitch = elements.matchDetailModal.querySelector('#pitch-container');
    pitch.innerHTML = ''; // Pulisce il campo
    
    // Aggiunge la linea centrale e le aree
    pitch.innerHTML = `
        <!-- Linea centrale -->
        <div class="absolute inset-x-0 top-1/2 h-0.5 bg-white transform -translate-y-1/2"></div>
        <div class="absolute left-1/2 top-1/2 w-4 h-4 bg-white rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
        
        <!-- Cerchio centrale -->
        <div class="absolute left-1/2 top-1/2 w-32 h-32 border-2 border-white rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
        
        <!-- Area grande superiore -->
        <div class="absolute top-0 left-1/2 w-2/3 h-[20%] border-2 border-white transform -translate-x-1/2"></div>
        <!-- Area piccola superiore -->
        <div class="absolute top-0 left-1/2 w-1/3 h-[10%] border-2 border-white transform -translate-x-1/2"></div>
        <!-- Porta superiore -->
        <div class="absolute top-0 left-1/2 w-1/5 h-2 bg-white transform -translate-x-1/2 -translate-y-full"></div>

        <!-- Area grande inferiore -->
        <div class="absolute bottom-0 left-1/2 w-2/3 h-[20%] border-2 border-white transform -translate-x-1/2"></div>
        <!-- Area piccola inferiore -->
        <div class="absolute bottom-0 left-1/2 w-1/3 h-[10%] border-2 border-white transform -translate-x-1/2"></div>
        <!-- Porta inferiore -->
        <div class="absolute bottom-0 left-1/2 w-1/5 h-2 bg-white transform -translate-x-1/2 translate-y-full"></div>
    `;

    // Posiziona i giocatori
    players.forEach(player => {
        // x e y sono coordinate percentuali (0-100)
        const x = player.position.x;
        const y = player.position.y;
        
        const playerElement = document.createElement('div');
        playerElement.className = 'player-circle absolute w-12 h-12 rounded-full flex items-center justify-center font-bold text-xs text-white bg-primary border-2 border-secondary shadow-lg transition-all duration-500';
        playerElement.style.left = `${x}%`;
        playerElement.style.top = `${y}%`;
        
        // Aggiusta il posizionamento per centrare il cerchio sul punto (x,y)
        playerElement.style.transform = 'translate(-50%, -50%)';

        const number = player.number !== undefined ? player.number : player.role.charAt(0);
        playerElement.textContent = number;
        playerElement.setAttribute('title', player.name);

        pitch.appendChild(playerElement);
    });
}

/**
 * Renderizza la tabella riassuntiva della formazione.
 * @param {Array<object>} players - Lista dei giocatori.
 */
function renderFormationTable(players) {
    const tableContainer = elements.matchDetailModal.querySelector('#formation-table-container');
    const starters = players.filter(p => p.role !== 'Riserva');
    const subs = players.filter(p => p.role === 'Riserva');

    const renderTable = (list, title) => {
        if (list.length === 0) return '';
        let tableHtml = `
            <h4 class="text-lg font-semibold text-accent mt-4 mb-2">${title} (${list.length})</h4>
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 bg-white rounded-lg shadow-inner">
                    <thead class="bg-gray-100">
                        <tr>
                            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ruolo</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
        `;
        list.forEach(player => {
            tableHtml += `
                <tr class="hover:bg-gray-50">
                    <td class="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">${player.number || '-'}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-700">${player.name}</td>
                    <td class="px-3 py-2 whitespace-nowrap text-sm text-primary">${player.role}</td>
                </tr>
            `;
        });
        tableHtml += '</tbody></table></div>';
        return tableHtml;
    };

    tableContainer.innerHTML = renderTable(starters, 'Titolari') + renderTable(subs, 'Riserve');
}


// =================================================================
// 5. ASCOLTATORI IN TEMPO REALE (FIRESTORE)
// =================================================================

/**
 * Configura gli ascoltatori in tempo reale per giocatori e partite.
 */
function setupRealtimeListeners() {
    // ---------------------- LISTENER GIOCATORI ----------------------
    onSnapshot(collection(db, PATHS.PLAYERS), (snapshot) => {
        const players = [];
        snapshot.forEach(doc => {
            players.push({ id: doc.id, ...doc.data() });
        });
        console.log("Dati Giocatori aggiornati:", players.length, "documenti.");
        renderPlayerList(players);
    }, (error) => {
        console.error("Errore nel listener Giocatori:", error);
        elements.loadingStats.textContent = "Errore di caricamento. Verifica i permessi di Firestore.";
    });

    // ---------------------- LISTENER PARTITE ----------------------
    onSnapshot(collection(db, PATHS.MATCHES), (snapshot) => {
        const matches = [];
        snapshot.forEach(doc => {
            matches.push({ id: doc.id, ...doc.data() });
        });
        console.log("Dati Partite aggiornati:", matches.length, "documenti.");
        renderMatchList(matches);
    }, (error) => {
        console.error("Errore nel listener Partite:", error);
        elements.loadingCalendar.textContent = "Errore di caricamento. Verifica i permessi di Firestore.";
    });
}


// =================================================================
// 6. FUNZIONE ADMIN PER DATI MOCK
// =================================================================

/**
 * Inserisce dati di prova in Firestore.
 */
window.addInitialMockData = async function() {
    if (!userId) {
        alert("Autenticazione non completata. Riprova.");
        return;
    }
    
    // Dati di prova per Giocatori
    const mockPlayers = [
        { name: "Marco Rossi", role: "Attaccante", number: 9, goals: 15, assists: 5, photoUrl: "" },
        { name: "Luca Bianchi", role: "Centrocampista", number: 10, goals: 8, assists: 12, photoUrl: "" },
        { name: "Andrea Verdi", role: "Difensore", number: 5, goals: 1, assists: 2, photoUrl: "" },
        { name: "Federico Gialli", role: "Portiere", number: 1, goals: 0, assists: 0, photoUrl: "" },
    ];

    // Dati di prova per Partite
    const mockMatches = [
        { 
            homeTeam: "AC TUSCOLANO", awayTeam: "Virtus Roma", date: "2024-10-27 15:00", score: "3-1", 
            isWin: true, isDraw: false,
            formations: [
                {
                    description: "Formazione iniziale 4-4-2",
                    players: [
                        // Portiere
                        { name: "Federico Gialli", role: "Portiere", number: 1, position: { x: 50, y: 5 } },
                        // Difensori
                        { name: "Difensore A", role: "Difensore", number: 2, position: { x: 15, y: 25 } },
                        { name: "Difensore B", role: "Difensore", number: 5, position: { x: 40, y: 20 } },
                        { name: "Difensore C", role: "Difensore", number: 6, position: { x: 60, y: 20 } },
                        { name: "Difensore D", role: "Difensore", number: 3, position: { x: 85, y: 25 } },
                        // Centrocampo
                        { name: "Centrocampo E", role: "Centrocampista", number: 7, position: { x: 15, y: 50 } },
                        { name: "Luca Bianchi", role: "Centrocampista", number: 10, position: { x: 40, y: 50 } },
                        { name: "Centrocampo G", role: "Centrocampista", number: 8, position: { x: 60, y: 50 } },
                        { name: "Centrocampo H", role: "Centrocampista", number: 4, position: { x: 85, y: 50 } },
                        // Attacco
                        { name: "Marco Rossi", role: "Attaccante", number: 9, position: { x: 40, y: 75 } },
                        { name: "Attaccante J", role: "Attaccante", number: 11, position: { x: 60, y: 75 } },
                        // Riserve
                        { name: "Riserva 1", role: "Riserva", number: 12, position: { x: 0, y: 0 } },
                    ]
                }
            ]
        },
        { 
            homeTeam: "AC TUSCOLANO", awayTeam: "Team Audace", date: "2024-11-03 15:00", score: "2-2", 
            isWin: false, isDraw: true,
            formations: [] // Nessuna formazione per questa partita
        },
        { 
            homeTeam: "AC TUSCOLANO", awayTeam: "Sporting Italia", date: "2024-12-01 15:00", score: "N/D", 
            isWin: false, isDraw: false, 
            formations: [],
            isUpcoming: true 
        }
    ];

    try {
        console.log("Inizio scrittura dati di prova...");
        const batch = writeBatch(db);

        // 1. Aggiungi Giocatori
        mockPlayers.forEach(player => {
            const newDocRef = doc(collection(db, PATHS.PLAYERS));
            batch.set(newDocRef, player);
        });

        // 2. Aggiungi Partite
        mockMatches.forEach(match => {
            const newDocRef = doc(collection(db, PATHS.MATCHES));
            batch.set(newDocRef, match);
        });

        await batch.commit();
        console.log("Dati di prova inseriti con successo in Firestore!");
        alert("Dati di prova inseriti con successo! La pagina si aggiornerà in automatico.");
        toggleAdminModal(false);

    } catch (e) {
        console.error("Errore durante l'inserimento dei dati di prova:", e);
        alert(`Errore: Impossibile scrivere su Firestore. Verifica le Regole di Sicurezza.\nErrore Dettagliato: ${e.message}`);
    }
};

// =================================================================
// 7. INIZIALIZZAZIONE (Assicurarsi che le icone siano caricate)
// =================================================================
window.onload = function() {
    showView('stats'); // Inizializza la vista Statistiche
    // L'autenticazione e il caricamento dati sono gestiti da onAuthStateChanged
};
