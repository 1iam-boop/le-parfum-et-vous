/*
 * Page des résultats : avec le mot de passe, lit les statistiques dans la base de données
 * et les affiche question par question. Chaque barre montre la part des répondants
 * à la question qui ont choisi cette réponse.
 */
(function () {
  "use strict";

  const $ = (selecteur) => document.querySelector(selecteur);
  const pourcent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  const dateLongue = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

  // Les dates de la base sont en UTC (« 2026-10-30T14:05:00Z »).
  const lireDate = (texte) => new Date(texte);

  // Le mot de passe est gardé le temps de l'onglet, pour « Actualiser » et « Télécharger ».
  const MEMOIRE = "aw-resultats";
  let motDePasse = "";
  try { motDePasse = sessionStorage.getItem(MEMOIRE) || ""; } catch { /* navigation privée */ }

  function element(balise, classe, texte) {
    const el = document.createElement(balise);
    if (classe) el.className = classe;
    if (texte !== undefined) el.textContent = texte;
    return el;
  }

  function ligne(nom, nombre, repondants) {
    const part = repondants ? nombre / repondants : 0;
    const li = element("li", "ligne");
    li.title = nom + " : " + nombre + " réponse" + (nombre > 1 ? "s" : "") + " (" + pourcent.format(part) + " des répondants)";
    const piste = element("span", "piste");
    const remplissage = element("span", "remplissage");
    remplissage.style.width = part * 100 + "%";
    if (!nombre) remplissage.hidden = true;
    piste.append(remplissage);
    const valeur = element("span", "ligne-valeur", nombre + " ");
    valeur.append(element("small", "", "· " + pourcent.format(part)));
    li.append(element("span", "ligne-nom", nom), piste, valeur);
    return li;
  }

  function carte(q) {
    const article = element("article", "carte resultat");
    article.append(element("h2", "", "Q" + q.numero + " · " + q.intitule));
    let meta = q.repondants + " répondant" + (q.repondants > 1 ? "s" : "");
    if (q.type === "multiple") meta += " · plusieurs réponses possibles";
    if (q.type === "note" && q.moyenne !== null) meta += " · moyenne " + decimal.format(q.moyenne) + " / 5";
    article.append(element("p", "meta", meta));

    if (q.type === "texte") {
      if (!q.textes.length) {
        article.append(element("p", "vide", "Aucune réponse pour l'instant."));
        return article;
      }
      const liste = element("ul", "textes");
      q.textes.forEach((t) => {
        const li = element("li", "", t.texte);
        const temps = element("time", "", dateLongue.format(lireDate(t.date)));
        temps.dateTime = lireDate(t.date).toISOString();
        li.prepend(temps);
        liste.append(li);
      });
      article.append(liste);
      return article;
    }

    const liste = element("ul", "lignes");
    q.valeurs.forEach((v) => {
      let nom = v.valeur;
      if (q.type === "note" && v.valeur === "1") nom = "1 · " + q.etiquettes[0];
      if (q.type === "note" && v.valeur === "5") nom = "5 · " + q.etiquettes[1];
      liste.append(ligne(nom, v.nombre, q.repondants));
    });
    article.append(liste);
    return article;
  }

  function afficher(donnees) {
    $("#total").textContent = donnees.total;
    $("#derniere").textContent = donnees.derniere ? dateLongue.format(lireDate(donnees.derniere)) : "Aucune";
    const zone = $("#resultats");
    zone.replaceChildren();
    if (!donnees.total) zone.append(element("p", "vide", "Aucune participation pour l'instant : partagez le lien du questionnaire !"));
    else donnees.questions.forEach((q) => zone.append(carte(q)));
  }

  function messageErreur(err) {
    if (err.statut) return err.message || "La base de données ne répond pas correctement. Réessayez dans un instant.";
    return "La base de données est injoignable. Vérifiez votre connexion puis réessayez.";
  }

  function montrerTableau(visible) {
    $("#connexion").hidden = visible;
    $("#tableau").hidden = !visible;
  }

  // ——— Connexion ———
  async function entrer(essai) {
    const bouton = $("#entrer");
    const erreur = $("#erreurConnexion");
    bouton.disabled = true;
    try {
      afficher(await Base.resultats(essai));
      motDePasse = essai;
      try { sessionStorage.setItem(MEMOIRE, essai); } catch { /* navigation privée */ }
      erreur.hidden = true;
      montrerTableau(true);
    } catch (err) {
      erreur.textContent = messageErreur(err);
      erreur.hidden = false;
      montrerTableau(false);
    } finally {
      bouton.disabled = false;
    }
  }

  $("#connexion").addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    entrer($("#motDePasse").value);
  });

  $("#verrouiller").addEventListener("click", () => {
    motDePasse = "";
    try { sessionStorage.removeItem(MEMOIRE); } catch { /* navigation privée */ }
    $("#motDePasse").value = "";
    montrerTableau(false);
  });

  // ——— Actualiser et télécharger ———
  async function action(bouton, travail) {
    const erreur = $("#erreur");
    bouton.disabled = true;
    try {
      await travail();
      erreur.hidden = true;
    } catch (err) {
      erreur.textContent = messageErreur(err);
      erreur.hidden = false;
    } finally {
      bouton.disabled = false;
    }
  }

  $("#actualiser").addEventListener("click", (e) => action(e.currentTarget, async () => afficher(await Base.resultats(motDePasse))));

  $("#telecharger").addEventListener("click", (e) => action(e.currentTarget, async () => {
    const fichier = new Blob([csv(await Base.exporter(motDePasse))], { type: "text/csv;charset=utf-8" });
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(fichier);
    lien.download = "reponses-questionnaire-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.append(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
  }));

  // Point-virgule et BOM : le fichier s'ouvre directement dans Excel en français, accents compris.
  function csv(donnees) {
    const entete = ["N°", "Date (UTC)", ...donnees.questions.map((q) => "Q" + q.numero + " · " + q.intitule)];
    const lignes = donnees.participations.map((p) => [
      p.id,
      p.date.replace("T", " ").replace("Z", ""),
      ...donnees.questions.map((q) => (p.reponses[q.id] || []).join(" | "))
    ]);
    return "\ufeff" + [entete, ...lignes].map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n";
  }

  function cellule(valeur) {
    let texte = String(valeur);
    if (/^[=+\-@\t\r]/.test(texte)) texte = "'" + texte; // empêche Excel d'y voir une formule
    return '"' + texte.replace(/"/g, '""') + '"';
  }

  if (!Base.configuree) {
    $("#erreurConnexion").textContent = "La page n'est pas encore reliée à la base de données (voir README.md).";
    $("#erreurConnexion").hidden = false;
    $("#entrer").disabled = true;
  } else if (motDePasse) {
    entrer(motDePasse);
  }
})();
