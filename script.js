// =================================================================
// 🚨 CONFIGURAZIONE FIREBASE (SOSTITUIRE CON LE TUE CREDENZIALI) 🚨
// =================================================================

// 1. CONFIGURAZIONE DEL PROGETTO FIREBASE (Ottieni da Console Firebase)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY", 
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// 2. VARIABILI D'AMBIENTE (Sostituire o lasciare i placeholder se non si usa Canvas)
// Nota: Queste variabili sono state estrapolate da un ambiente specifico (__app_id, __initial_auth_token)
// Sostituisci i valori o usa un sistema di gestione delle variabili d'ambiente più sicuro per la produzione.
const appId = firebaseConfig.appId || 'default-app-id'; // Usa l'appId da config se non c'è l'ambiente
const initialAuthToken = null; // Token di autenticazione iniziale (tipicamente non necessario per app standard)

// =================================================================
// IMPORTS FIREBASE E LOGICA
// =================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, onSnapshot, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// Inizializzazione Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Variabili per l'ambito globale (esposte a window se necessario per il markup HTML)
let currentUserId = null;
window.matchesData = {};
window.currentMatchFormations = [];
window.currentFormationIndex = 0;
window.currentMatch = null; 

// Mappa delle posizioni 3-3-1 (coordinate in percentuale rispetto al campo)
const POSITIONS_331 = {
    P: { top: '90%', left: '50%', label: 'P' },
    D1: { top: '75%', left: '20%', label: 'DC' },
    D2: { top: '75%', left: '50%', label: 'D' },
    D3: { top: '75%', left: '80%', label: 'DC' },
    C1: { top: '45%', left: '20%', label: 'CC' },
    C2: { top: '45%', left: '50%', label: 'M' },
    C3: { top: '45%', left: '80%', label: 'CC' },
    A1: { top: '20%', left: '50%', label: 'A' }
};
window.POSITIONS_331 = POSITIONS_331;


// Espongo le variabili DB e ID per accesso/debug in console/utility
window.db = db;
window.appId = appId;

// --- Gestione Autenticazione ---
async function setupAuth() {
    if (initialAuthToken) {
        try {
            await signInWithCustomToken(auth, initialAuthToken);
        } catch (error) {
            console.error("Errore con l'autenticazione token:", error);
            await signInAnonymously(auth); // Fallback anonimo
        }
    } else {
        await signInAnonymously(auth);
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserId = user.uid;
            window.currentUserId = user.uid;

            // Mostra il pulsante Admin e i percorsi in Console
            document.getElementById('admin-button').classList.remove('hidden');

            const playersPath = `/artifacts/${appId}/public/data/ac_tuscolano_players`;
            const matchesPath = `/artifacts/${appId}/public/data/ac_tuscolano_matches`;
            document.getElementById('path-players').textContent = playersPath;
            document.getElementById('path-matches').textContent = matchesPath;

            console.log("Utente Autenticato. ID:", currentUserId);

            // Avvia il caricamento dei dati
            loadPlayerData();
            loadMatchData();

        } else {
            console.log("Utente anonimo o disconnesso.");
        }
    });
}

// --- FUNZIONE UTILITY PER INSERIRE DATI DI MOCK REALI IN FIRESTORE ---
window.addInitialMockData = async function() {
    const playersRef = collection(db, `artifacts/${appId}/public/data/ac_tuscolano_players`);
    const matchesRef = collection(db, `artifacts/${appId}/public/data/ac_tuscolano_matches`);

    // Verifica se i dati esistono già
    const checkDoc = await getDoc(doc(playersRef, 'R01'));
    if (checkDoc.exists()) {
        if (!confirm("I dati di prova esistono già. Vuoi sovrascriverli?")) {
            console.log("Inserimento dati annullato dall'utente.");
            return;
        }
    }

    // 1. Dati Giocatori (minimo 12 giocatori)
    const players = [
        { id: 'R01', nome: 'Rossi Marco', numero: 1, ruolo: 'P', presenze: 5, gol: 0, assist: 0, votoMedio: 6.5 },
        { id: 'B02', nome: 'Bianchi Luca', numero: 2, ruolo: 'D', presenze: 8, gol: 1, assist: 0, votoMedio: 6.8 },
        { id: 'V03', nome: 'Verdi Paolo', numero: 3, ruolo: 'D', presenze: 7, gol: 0, assist: 2, votoMedio: 6.9 },
        { id: 'N04', nome: 'Neri Andrea', numero: 4, ruolo: 'D', presenze: 9, gol: 0, assist: 1, votoMedio: 7.0 },
        { id: 'G05', nome: 'Gialli Leo', numero: 5, ruolo: 'C', presenze: 6, gol: 3, assist: 3, votoMedio: 7.5 },
        { id: 'BL06', nome: 'Blu Matteo', numero: 6, ruolo: 'C', presenze: 8, gol: 2, assist: 4, votoMedio: 7.2 },
        { id: 'M07', nome: 'Marrone Alex', numero: 7, ruolo: 'C', presenze: 9, gol: 4, assist: 1, votoMedio: 7.8 },
        { id: 'V08', nome: 'Viola Chris', numero: 8, ruolo: 'A', presenze: 9, gol: 12, assist: 0, votoMedio: 8.0 },
        // Panchina
        { id: 'GR09', nome: 'Grigio Simo', numero: 9, ruolo: 'A', presenze: 4, gol: 1, assist: 0, votoMedio: 6.5 },
        { id: 'RO10', nome: 'Rosa Davide', numero: 10, ruolo: 'C', presenze: 5, gol: 0, assist: 0, votoMedio: 6.0 },
        { id: 'A11', nome: 'Arancio Fede', numero: 11, ruolo: 'D', presenze: 3, gol: 0, assist: 0, votoMedio: 6.2 },
        { id: 'C12', nome: 'Ciano Elisa', numero: 12, ruolo: 'P', presenze: 1, gol: 0, assist: 0, votoMedio: 6.0 },
    ];

    await Promise.all(players.map(p => setDoc(doc(playersRef, p.id), p)));
    console.log("Dati Giocatori di prova inseriti.");

    // 2. Dati Partite con Formazioni e Sostituzioni (Mock Match ID)
    const baseLineup = {
        P: 'Rossi Marco', D1: 'Bianchi Luca', D2: 'Verdi Paolo', D3: 'Neri Andrea',
        C1: 'Gialli Leo', C2: 'Blu Matteo', C3: 'Marrone Alex', A1: 'Viola Chris'
    };
    const basePanchina = ['Grigio Simo', 'Rosa Davide', 'Arancio Fede', 'Ciano Elisa'];

    const formations = [
        {
            descrizione: 'Formazione Titolare Iniziale',
            lineup: { ...baseLineup },
            panchina: [...basePanchina]
        },
        {
            descrizione: 'Sostituzione al 15° (Grigio per Neri - D3)',
            lineup: { ...baseLineup, D3: 'Grigio Simo' },
            panchina: ['Neri Andrea', 'Rosa Davide', 'Arancio Fede', 'Ciano Elisa']
        },
        {
            descrizione: 'Sostituzione al 30° (Rosa per Viola - A1)',
            lineup: { ...baseLineup, D3: 'Grigio Simo', A1: 'Rosa Davide' },
            panchina: ['Neri Andrea', 'Viola Chris', 'Arancio Fede', 'Ciano Elisa']
        },
        {
            descrizione: 'Sostituzione al 45° (Arancio per Bianchi - D1)',
            lineup: { ...baseLineup, D3: 'Grigio Simo', A1: 'Rosa Davide', D1: 'Arancio Fede' },
            panchina: ['Neri Andrea', 'Viola Chris', 'Bianchi Luca', 'Ciano Elisa']
        },
    ];

    const matchData = {
        avversario: 'ASD Test Squadra',
        data: new Date(Date.now() + 86400000), // Domani
        luogo: 'Campo di Casa',
        score: 'N/A',
        risultato: 'N/A',
        cronaca: 'Incontro di prova del modulo 3-3-1.',
        formazioni: formations
    };

    await setDoc(doc(matchesRef, 'MATCH_TEST_01'), matchData);
    console.log("Dato Partita di prova inserito. Ricarica l'app per visualizzare.");

    alert("Dati di prova inseriti con successo in Firestore!");
    toggleAdminModal(false);
};
// FINE FUNZIONE UTILITY

function loadPlayerData() {
    const path = `artifacts/${appId}/public/data/ac_tuscolano_players`;
    const playersCollection = collection(db, path);

    onSnapshot(playersCollection, (snapshot) => {
        const players = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            players.push({ id: doc.id, ...data });
        });
        renderPlayerStats(players);
        document.getElementById('loading-stats').classList.add('hidden');
    }, (error) => {
        console.error("Errore nel caricamento dei giocatori:", error);
        document.getElementById('loading-stats').textContent = "Errore nel caricamento.";
    });
}

function loadMatchData() {
    const path = `artifacts/${appId}/public/data/ac_tuscolano_matches`;
    const matchesCollection = collection(db, path);

    onSnapshot(matchesCollection, (snapshot) => {
        const matches = [];
        window.matchesData = {}; // Clear previous data
        snapshot.forEach(doc => {
            const data = doc.data();
            // Gestione della conversione del timestamp di Firestore in oggetto Date
            if (data.data && data.data.seconds) {
                data.date = new Date(data.data.seconds * 1000);
            } else if (typeof data.data === 'string') {
                data.date = new Date(data.data);
            } else if (data.data instanceof Date) {
                data.date = data.data; // Se è già un oggetto Date
            } else {
                data.date = new Date(); // Fallback per data non valida
            }

            matches.push({ id: doc.id, ...data });
            window.matchesData[doc.id] = { id: doc.id, ...data }; // Store for quick access
        });
        renderCalendar(matches);
        document.getElementById('loading-calendar').classList.add('hidden');
    }, (error) => {
        console.error("Errore nel caricamento degli incontri:", error);
        document.getElementById('loading-calendar').textContent = "Errore nel caricamento.";
    });
}

// --- Funzioni di Rendering UI ---

function renderPlayerStats(players) {
    const sortedPlayers = players
        .map(p => ({
            ...p,
            presenze: p.presenze || 0,
            votoMedio: p.votoMedio || 6,
            gol: p.gol || 0,
            assist: p.assist || 0,
        }))
        .sort((a, b) => b.presenze - a.presenze);

    const container = document.getElementById('player-list-container');
    container.innerHTML = '';

    if (sortedPlayers.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic">Nessun giocatore trovato. Clicca sull\'icona Impostazioni in alto a destra per istruzioni su come aggiungere i dati.</p>';
        return;
    }

    let html = '<div class="space-y-3">';
    sortedPlayers.forEach((p, index) => {
        const badgeClass = index < 3 ? 'bg-secondary text-accent font-bold' : 'bg-gray-200 text-gray-700';

        html += `
            <div class="bg-white p-4 rounded-xl shadow-md flex items-center justify-between transition-all hover:shadow-lg">
                <div class="flex items-center">
                    <span class="w-8 h-8 flex items-center justify-center rounded-full ${badgeClass} mr-3">${index + 1}</span>
                    <div>
                        <p class="font-bold text-lg text-accent">${p.numero ? p.numero + '. ' : ''}${p.nome}</p>
                        <p class="text-sm text-gray-500">Ruolo: ${p.ruolo || 'Non Definito'}</p>
                    </div>
                </div>

                <div class="text-right">
                    <p class="text-sm font-bold text-primary">Presenze: ${p.presenze}</p>
                    <p class="text-xs text-gray-600">G: ${p.gol} | A: ${p.assist} | Voto M: ${p.votoMedio.toFixed(1)}</p>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
    // @ts-ignore
    lucide.createIcons();
}

function renderCalendar(matches) {
    const now = new Date();
    const upcoming = matches
        .filter(m => m.date > now)
        .sort((a, b) => a.date - b.date);

    const past = matches
        .filter(m => m.date <= now)
        .sort((a, b) => b.date - a.date);

    const upcomingContainer = document.getElementById('upcoming-list');
    const pastContainer = document.getElementById('past-list');

    // Render Prossimi Incontri
    upcomingContainer.innerHTML = upcoming.length > 0
        ? upcoming.map(renderMatchCard).join('')
        : '<p class="text-gray-500 italic">Nessun incontro in programma.</p>';

    // Render Risultati Precedenti
    pastContainer.innerHTML = past.length > 0
        ? past.map(renderMatchCard).join('')
        : '<p class="text-gray-500 italic">Nessun risultato trovato.</p>';

    // @ts-ignore
    lucide.createIcons();
}

function renderMatchCard(match) {
    const isPast = match.date <= new Date();
    const score = match.score || 'N/A';
    const resultClass = isPast
        ? (match.risultato === 'V' ? 'bg-green-100 border-green-500' :
        match.risultato === 'P' ? 'bg-red-100 border-red-500' : 'bg-gray-100 border-gray-400')
        : 'bg-white border-primary';

    const resultText = isPast
        ? (match.risultato === 'V' ? 'Vittoria' :
        match.risultato === 'P' ? 'Sconfitta' : 'Pareggio')
        : 'Prossima Partita';

    const day = match.date ? match.date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : 'Data N/A';
    const time = match.date ? match.date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'Ora N/A';

    return `
        <div class="p-4 rounded-xl shadow-md border-l-4 ${resultClass} transition-shadow duration-300 hover:shadow-lg cursor-pointer" onclick="openMatchDetail('${match.id}')">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold text-lg text-accent">${match.avversario || 'Avversario Sconosciuto'}</p>
                    <p class="text-sm text-gray-500">Campo: ${match.luogo || 'Non specificato'}</p>
                    <p class="text-xs ${isPast ? 'text-gray-500' : 'text-primary font-semibold'}">${match.campionato || 'Campionato'}</p>
                </div>
                <div class="text-right">
                    <p class="text-sm font-semibold ${isPast ? 'text-gray-700' : 'text-accent'}">${day} - ${time}</p>
                    ${isPast
                        ? `<p class="text-2xl font-extrabold text-accent mt-1">${score}</p>`
                        : `<div class="mt-1 flex items-center text-primary font-bold">
                            <i data-lucide="whistle" class="lucide w-4 h-4 mr-1"></i> ${resultText}
                        </div>`
                    }
                </div>
            </div>
            ${isPast && match.cronaca
                ? `<p class="mt-3 text-xs italic text-gray-600 border-t pt-2">${match.cronaca}</p>`
                : ''
            }
        </div>
    `;
}


// --- LOGICA DETTAGLIO PARTITA E FORMAZIONE ---

window.openMatchDetail = function(matchId) {
    const match = window.matchesData[matchId];
    if (!match || !match.formazioni || match.formazioni.length === 0) {
        alert('Dettagli partita o formazioni non disponibili.');
        return;
    }

    window.currentMatch = match;
    window.currentMatchFormations = match.formazioni;
    window.currentFormationIndex = 0; // Inizia sempre dalla formazione iniziale

    document.getElementById('match-detail-title').textContent = `AC Tuscolano vs ${match.avversario}`;
    const matchDate = match.date instanceof Date && !isNaN(match.date.getTime()) ? match.date : new Date();
    document.getElementById('match-detail-subtitle').textContent = matchDate.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    renderFormationDetails(window.currentMatch, window.currentFormationIndex);

    document.getElementById('match-detail-modal').classList.remove('hidden');
}

window.renderFormationDetails = function(match, index) {
    const formation = match.formazioni[index];
    const total = match.formazioni.length;

    document.getElementById('current-formation-index').textContent = `${index + 1} di ${total}`;
    document.getElementById('formation-description').textContent = formation.descrizione;

    // Abilita/Disabilita pulsanti
    document.getElementById('prev-formation-btn').disabled = index === 0;
    document.getElementById('next-formation-btn').disabled = index === total - 1;

    renderFormationOnPitch(formation.lineup);
    renderFormationTable(formation.lineup, formation.panchina);
}

function renderFormationOnPitch(lineup) {
    const container = document.getElementById('pitch-container');
    container.innerHTML = '';

    // Disegno del campo semplificato (linee bianche)
    container.innerHTML = `
        <div class="absolute top-0 left-0 w-full h-full border-4 border-white rounded-lg">
            <div class="absolute top-1/2 left-0 w-full border-b-2 border-white"></div>
            <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-white"></div>
            <div class="absolute bottom-0 left-1/4 w-1/2 h-1/6 border-t-2 border-l-2 border-r-2 border-white rounded-t-lg"></div>
        </div>
    `;

    // Renderizza i giocatori in posizione
    Object.keys(POSITIONS_331).forEach(key => {
        const pos = POSITIONS_331[key];
        const playerName = lineup[key] || '';
        if (playerName) {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-circle absolute flex flex-col items-center justify-center w-12 h-12 rounded-full shadow-lg border-2 border-white cursor-pointer transition-all duration-300 transform hover:scale-110';
            playerDiv.style.top = pos.top;
            playerDiv.style.left = pos.left;
            playerDiv.style.transform = 'translate(-50%, -50%)'; // Centra il cerchio sulla posizione

            // Colori per Ruolo
            let bgColor = 'bg-accent'; // Blu scuro (Centrocampo/Attacco)
            let textColor = 'text-white';
            if (key === 'P') {
                bgColor = 'bg-secondary'; // Giallo (Portiere)
                textColor = 'text-accent';
            }
            else if (key.startsWith('D')) {
                bgColor = 'bg-primary'; // Rosso (Difesa)
                textColor = 'text-white';
            }

            playerDiv.innerHTML = `
                <div class="text-xs font-bold ${textColor} p-1 rounded-full ${bgColor} flex items-center justify-center w-full h-full">
                    ${playerName.split(' ').map(n => n[0]).join('')}
                </div>
                <span class="absolute text-xs font-medium text-white -bottom-4 whitespace-nowrap" style="text-shadow: 0 1px 1px #000;">${playerName}</span>
            `;
            container.appendChild(playerDiv);
        }
    });
}

function renderFormationTable(lineup, panchina) {
    const container = document.getElementById('formation-table-container');

    let html = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">';

    // TABELLA TITOLARI
    html += `
        <div class="bg-primary bg-opacity-5 p-4 rounded-xl shadow-inner border border-primary">
            <h4 class="font-bold text-primary mb-2 border-b-2 border-primary pb-1">Titolari in Campo (3-3-1)</h4>
            <ul class="space-y-1 text-sm text-accent">
                <li class="flex justify-between font-extrabold">Portiere (P): <span>${lineup.P || '-'}</span></li>
                <li class="flex justify-between">Difensore 1 (DC): <span>${lineup.D1 || '-'}</span></li>
                <li class="flex justify-between">Difensore 2 (D): <span>${lineup.D2 || '-'}</span></li>
                <li class="flex justify-between">Difensore 3 (DC): <span>${lineup.D3 || '-'}</span></li>
                <li class="flex justify-between">Centrocampista 1: <span>${lineup.C1 || '-'}</span></li>
                <li class="flex justify-between">Centrocampista 2 (M): <span>${lineup.C2 || '-'}</span></li>
                <li class="flex justify-between">Centrocampista 3: <span>${lineup.C3 || '-'}</span></li>
                <li class="flex justify-between font-bold">Attaccante (A1): <span>${lineup.A1 || '-'}</span></li>
            </ul>
        </div>
    `;

    // TABELLA PANCHINA
    html += `
        <div class="bg-gray-100 p-4 rounded-xl shadow-inner border border-gray-300">
            <h4 class="font-bold text-accent mb-2 border-b-2 border-accent pb-1">Panchina (${panchina.length} giocatori)</h4>
            <ul class="space-y-1 text-sm text-gray-700 max-h-40 overflow-y-auto">
                ${panchina.length > 0 ? panchina.map(p => `<li><i data-lucide="user" class="lucide w-4 h-4 mr-1 inline-block text-accent"></i> ${p}</li>`).join('') : '<li class="italic">Nessun giocatore in panchina.</li>'}
            </ul>
        </div>
    `;

    html += '</div>';
    container.innerHTML = html;
    // @ts-ignore
    lucide.createIcons();
}

window.navigateFormation = function(direction) {
    if (!window.currentMatch) return;

    let newIndex = window.currentFormationIndex + direction;

    if (newIndex >= 0 && newIndex < window.currentMatchFormations.length) {
        window.currentFormationIndex = newIndex;
        renderFormationDetails(window.currentMatch, newIndex);
    }
}


window.closeMatchDetail = function() {
    document.getElementById('match-detail-modal').classList.add('hidden');
}


// --- Logica UI Generale ---

window.showView = function(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });
    document.getElementById(`${viewId}-view`).classList.remove('hidden');

    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('text-accent', 'border-primary');
        button.classList.add('text-gray-500', 'border-transparent');
    });
    document.getElementById(`nav-${viewId}`).classList.add('text-accent', 'border-primary');
    document.getElementById(`nav-${viewId}`).classList.remove('text-gray-500', 'border-transparent');
}

window.toggleAdminModal = function(show) {
    const modal = document.getElementById('admin-modal');
    if (show) {
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}


// Avvia l'autenticazione e il setup all'avvio della pagina
window.onload = () => {
    setupAuth();
    // @ts-ignore
    lucide.createIcons();
};
