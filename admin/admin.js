/*
 * Page des résultats : avec le mot de passe, lit les réponses dans la base de données.
 * - « Par personne » : une fiche par participation, avec le prénom, le nom, les coordonnées
 *   et toutes les réponses de la personne.
 * - « Statistiques » : le total question par question ; chaque barre montre la part des
 *   répondants à la question qui ont choisi cette réponse.
 */
(function () {
  "use strict";

  const $ = (selecteur) => document.querySelector(selecteur);
  const pourcent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  const dateLongue = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

  // Les dates de la base sont en UTC (« 2026-10-30T14:05:00Z »).
  const lireDate = (texte) => new Date(texte);
  // Pour la recherche : minuscules, sans accents.
  const simplifier = (texte) => texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Le mot de passe est gardé le temps de l'onglet, pour « Actualiser » et « Télécharger ».
  const MEMOIRE = "aw-resultats";
  let motDePasse = "";
  try { motDePasse = sessionStorage.getItem(MEMOIRE) || ""; } catch { /* navigation privée */ }

  let vue = "personnes";
  let statistiquesAJour = false;

  function element(balise, classe, texte) {
    const el = document.createElement(balise);
    if (classe) el.className = classe;
    if (texte !== undefined) el.textContent = texte;
    return el;
  }

  function horodatage(texte) {
    const temps = element("time", "", dateLongue.format(lireDate(texte)));
    temps.dateTime = lireDate(texte).toISOString();
    return temps;
  }

  // ——— Par personne ———
  function reponseLisible(q, valeurs) {
    if (!valeurs || !valeurs.length) return "";
    if (q.type === "note") return valeurs[0] + " / 5";
    return valeurs.join(", ");
  }

  function fiche(p, questions) {
    const article = element("article", "carte personne");
    const nom = [p.prenom, p.nom].filter(Boolean).join(" ") || "Sans nom";
    const tete = element("div", "personne-tete");
    tete.append(element("h2", "", nom), horodatage(p.date));
    article.append(tete);

    if (p.email || p.telephone) {
      const contact = element("p", "personne-contact");
      if (p.email) {
        const email = element("a", "", p.email);
        email.href = "mailto:" + p.email;
        contact.append(email);
      }
      if (p.telephone) {
        const telephone = element("a", "", p.telephone);
        telephone.href = "tel:" + p.telephone.replace(/\s/g, "");
        contact.append(telephone);
      }
      article.append(contact);
    }

    const liste = element("dl", "personne-reponses");
    questions.forEach((q) => {
      const reponse = reponseLisible(q, p.reponses[q.id]);
      liste.append(element("dt", "", q.intitule), element("dd", reponse ? "" : "vide", reponse || "Pas de réponse"));
    });
    article.append(liste);

    article.dataset.recherche = simplifier([nom, p.email, p.telephone, (p.telephone || "").replace(/\s/g, "")].join(" "));
    return article;
  }

  function afficherPersonnes(donnees) {
    const participations = donnees.participations;
    $("#total").textContent = participations.length;
    $("#derniere").textContent = participations.length
      ? dateLongue.format(lireDate(participations[participations.length - 1].date))
      : "Aucune";

    const zone = $("#personnes");
    zone.replaceChildren();
    if (!participations.length) {
      zone.append(element("p", "vide", "Aucune participation pour l'instant : partagez le lien du questionnaire !"));
    } else {
      const questions = donnees.questions.filter((q) => q.type !== "coordonnees");
      // Les plus récentes en premier.
      participations.slice().reverse().forEach((p) => zone.append(fiche(p, questions)));
    }
    filtrer();
  }

  function filtrer() {
    const fiches = [...document.querySelectorAll("#personnes .personne")];
    const cherche = simplifier($("#recherche").value.trim());
    let visibles = 0;
    fiches.forEach((f) => {
      f.hidden = Boolean(cherche) && !f.dataset.recherche.includes(cherche);
      if (!f.hidden) visibles++;
    });
    $("#compte").textContent = !fiches.length ? ""
      : cherche ? (visibles ? visibles + " personne" + (visibles > 1 ? "s" : "") + " sur " + fiches.length : "Aucune personne ne correspond à votre recherche.")
      : fiches.length + " personne" + (fiches.length > 1 ? "s" : "");
  }

  $("#recherche").addEventListener("input", filtrer);

  // ——— Statistiques ———
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
    article.append(element("h2", "", q.intitule));
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
        li.prepend(horodatage(t.date));
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

  function afficherStatistiques(donnees) {
    const zone = $("#resultats");
    zone.replaceChildren();
    if (!donnees.total) zone.append(element("p", "vide", "Aucune participation pour l'instant : partagez le lien du questionnaire !"));
    // Les coordonnées sont dans « Par personne ».
    else donnees.questions.filter((q) => q.type !== "coordonnees").forEach((q) => zone.append(carte(q)));
    statistiquesAJour = true;
  }

  // ——— Onglets ———
  async function changerVue(nouvelle) {
    vue = nouvelle;
    $("#ongletPersonnes").setAttribute("aria-pressed", String(vue === "personnes"));
    $("#ongletQuestions").setAttribute("aria-pressed", String(vue === "questions"));
    $("#vuePersonnes").hidden = vue !== "personnes";
    $("#vueQuestions").hidden = vue !== "questions";
    if (vue === "questions" && !statistiquesAJour) {
      await action($("#ongletQuestions"), async () => afficherStatistiques(await Base.resultats(motDePasse)));
    }
  }

  $("#ongletPersonnes").addEventListener("click", () => changerVue("personnes"));
  $("#ongletQuestions").addEventListener("click", () => changerVue("questions"));

  // ——— Connexion ———
  function messageErreur(err) {
    if (err.statut) return err.message || "La base de données ne répond pas correctement. Réessayez dans un instant.";
    return "La base de données est injoignable. Vérifiez votre connexion puis réessayez.";
  }

  function montrerTableau(visible) {
    $("#connexion").hidden = visible;
    $("#tableau").hidden = !visible;
  }

  async function entrer(essai) {
    const bouton = $("#entrer");
    const erreur = $("#erreurConnexion");
    bouton.disabled = true;
    try {
      afficherPersonnes(await Base.exporter(essai));
      motDePasse = essai;
      statistiquesAJour = false;
      try { sessionStorage.setItem(MEMOIRE, essai); } catch { /* navigation privée */ }
      erreur.hidden = true;
      montrerTableau(true);
      changerVue("personnes");
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
    $("#personnes").replaceChildren();
    $("#resultats").replaceChildren();
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

  $("#actualiser").addEventListener("click", (e) => action(e.currentTarget, async () => {
    afficherPersonnes(await Base.exporter(motDePasse));
    statistiquesAJour = false;
    if (vue === "questions") afficherStatistiques(await Base.resultats(motDePasse));
  }));

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

  // Une ligne par personne. Point-virgule et BOM : le fichier s'ouvre directement dans Excel en français, accents compris.
  function csv(donnees) {
    const questions = donnees.questions.filter((q) => q.type !== "coordonnees");
    const entete = ["N°", "Date (UTC)", "Prénom", "Nom", "E-mail", "Téléphone", ...questions.map((q) => "Q" + q.numero + " · " + q.intitule)];
    const lignes = donnees.participations.map((p) => [
      p.id,
      p.date.replace("T", " ").replace("Z", ""),
      p.prenom || "", p.nom || "", p.email || "", p.telephone || "",
      ...questions.map((q) => (p.reponses[q.id] || []).join(" | "))
    ]);
    return "﻿" + [entete, ...lignes].map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n";
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
