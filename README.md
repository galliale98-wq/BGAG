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
4. Scheda **Excel → Importa da Excel** e scegli il tuo `Budget_Personale.xlsx` dall'app File (anche dalla cartella OneDrive, se l'app OneDrive è installata). Controlla l'anteprima e tocca **Applica**.

Dopo il primo caricamento l'app funziona anche offline.

## Uso

- **+**: importo dal tastierino, categoria, data già impostata a oggi (o Ieri, o Altra data), descrizione facoltativa. Le categorie che usi di più compaiono per prime, e sotto trovi le descrizioni già usate in quella categoria.
- **Mese**: residuo del budget uscite, entrate, risparmio e avanzamento per categoria, per il mese o **da inizio anno** (selettore sotto il mese). Tocca una categoria per vederne i movimenti.
- **Importi negativi**: nel nuovo movimento il tasto **−** a sinistra dell'importo rende l'importo negativo. Resta nella stessa categoria e si somma algebricamente nel mese, da inizio anno e nell'Excel (Riepilogo e Annuale). Utile per disinvestimenti, rimborsi e resi.
- **Movimenti**: elenco con ricerca. Tocca una riga per modificarla o eliminarla.
- **Excel**: esporta il file (lo salvi in File, OneDrive, mail…) o reimporta un file modificato al computer. L'import mostra prima cosa cambia: movimenti nuovi, modificati, presenti solo nell'app, impostazioni diverse.
- **Impostazioni**: anno, categorie e budget, spese fisse, budget mese per mese.

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
