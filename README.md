# Budget — app per iPhone

App web installabile sulla schermata Home dell'iPhone per registrare entrate e spese in pochi tocchi. Esporta il tuo file `Budget_Personale.xlsx` aggiornato e reimporta le modifiche fatte al computer.

Non si collega a OneDrive né ad altri servizi. I dati restano nella memoria dell'app sul telefono. Questo repository contiene solo il codice, nessun dato personale.

## Pubblicarla (una volta, 5 minuti, dal computer)

1. Crea un account gratuito su github.com, se non ce l'hai.
2. Crea un nuovo repository pubblico, per esempio `budget`.
3. Nella pagina del repository: **Add file → Upload files**, trascina **tutti i file di questa cartella** e conferma con **Commit changes**.
4. **Settings → Pages**: in *Build and deployment* scegli *Deploy from a branch*, branch `main`, cartella `/ (root)`, **Save**.
5. Dopo un minuto l'app è online su `https://TUO-UTENTE.github.io/budget/`.

## Installarla sull'iPhone

1. Apri l'indirizzo in **Safari**.
2. Tocca **Condividi → Aggiungi alla schermata Home**.
3. Apri l'app **dall'icona**, non da Safari. L'app installata e la scheda di Safari hanno memorie separate: i dati inseriti in una non compaiono nell'altra.
4. **Impostazioni → Importa Excel** e scegli il tuo `Budget_Personale.xlsx` dall'app File (anche dalla cartella OneDrive, se l'app OneDrive è installata). Controlla l'anteprima e tocca **Applica**.

Dopo il primo caricamento l'app funziona anche offline.

## Uso

- **+**: importo dal tastierino, tipo (Spesa, Entrata o Investimento), categoria, data già impostata a oggi (o Ieri, o Altra data), descrizione facoltativa. Il tasto **−** rende l'importo negativo (rimborsi, resi, disinvestimenti, plusvalenze): si somma algebricamente nella sua categoria.
- **Mese**: residuo del budget uscite, entrate, risparmio e avanzamento per categoria, per il mese o da inizio anno. Gli investimenti compaiono a parte, solo misurati.
- **Analisi**: KPI e grafici Year to date, calcolati solo sui mesi con almeno una spesa registrata. In fondo, la sezione Investimenti sullo stesso periodo.
- **Movimenti**: elenco con ricerca. Tocca una riga per modificarla o eliminarla.
- **Impostazioni**: esporta e importa l'Excel, anno, categorie con tipo e budget, spese fisse, budget mese per mese.

## Investimenti

Le categorie di tipo **Investimento** (ad esempio PAC e Investimenti) restano fuori da entrate, uscite e risparmio, sia nell'app sia nell'Excel. Il loro budget è un **piano d'investimento** facoltativo: si confronta solo con l'investito, nella sezione Investimenti del Riepilogo (mese e da inizio anno), nelle colonne dedicate dell'Annuale e nella riga "Piano investimenti" del Budget. Il tipo si sceglie per categoria in Impostazioni. Le plus/minusvalenze, che hanno competenza economica, vanno in una categoria di tipo Spesa: una plusvalenza inserita col meno riduce le uscite.

## L'Excel

L'export è il tuo file `Budget_Personale` con i dati aggiornati: stessi fogli (anche Istruzioni, nascosto), stesse formule, stessi colori e stili cella per cella, tendine, formattazioni condizionali e grafico dell'Annuale. L'app parte da `template.xlsx`, uno stampo ricavato dal tuo file senza dati e senza metadati personali, e scrive solo i valori.

Le differenze rispetto al file originale sono tre:
- la colonna **ID** nascosta in Movimenti (colonna I), che serve all'import per riconoscere le righe: non cancellarla. Le righe aggiunte al computer senza ID vengono importate come nuove;
- i riferimenti dei fogli Riepilogo e Annuale ai Movimenti arrivano alla riga 5000 invece che alla 504, così il file regge oltre 500 movimenti;
- i valori calcolati vengono ricalcolati all'apertura in Excel.

L'evidenziazione gialla di una descrizione (come "Modem casa LTE - PENDING") è un'informazione del movimento: l'app la legge all'import, la mostra nell'elenco, si attiva o toglie con il pulsante a forma di evidenziatore accanto alla descrizione, e la riscrive nell'Excel. Altre formattazioni fatte a mano su singole celle di Movimenti non vengono conservate.

Esporta, modifica al computer, reimporta. Evita di modificare nello stesso periodo sia l'app sia il file: se capita, l'anteprima dell'import ti mostra le differenze prima di applicarle.

Limiti del file: 30 categorie e 20 spese fisse, come il modello originale.

## Backup

Esporta l'Excel ogni tanto: è anche il backup. Se cancelli l'app dalla schermata Home o i dati dei siti web dalle impostazioni di Safari, i dati dell'app vanno persi. L'app ti ricorda di esportare se sono passati più di 14 giorni.

## Aggiornare l'app

Carica i file modificati nel repository e aumenta il numero di `VERSIONE` in `sw.js` (per esempio `budget-v2`), altrimenti l'iPhone continua a usare la versione in cache. I dati non vengono toccati.
