/*
 * Le questionnaire : charge les questions depuis la base de données, les affiche une par une,
 * y enregistre les réponses puis montre la présentation d'AW Parfumerie.
 */
(function () {
  "use strict";

  const $ = (selecteur) => document.querySelector(selecteur);
  const formulaire = $("#formulaire");
  const zone = $("#question");
  const erreur = $("#erreur");
  const precedent = $("#precedent");
  const suivant = $("#suivant");
  const barre = $("#barre");

  let questions = [];
  let index = 0;
  const reponses = {};

  // ——— Chargement des questions ———
  async function charger() {
    const commencer = $("#commencer");
    const message = $("#erreurChargement");
    if (!Base.configuree) {
      message.textContent = "Le questionnaire n'est pas encore relié à sa base de données (voir README.md).";
      message.hidden = false;
      return;
    }
    try {
      questions = await Base.questions();
      if (!questions.length) throw new Error();
      barre.setAttribute("aria-valuemax", questions.length);
      commencer.disabled = false;
      message.hidden = true;
    } catch {
      message.textContent = "Le questionnaire n'a pas pu être chargé. Nouvel essai dans quelques secondes…";
      message.hidden = false;
      setTimeout(charger, 5000);
    }
  }

  // ——— Navigation entre les écrans ———
  function montrer(id) {
    document.querySelectorAll(".ecran").forEach((e) => { e.hidden = e.id !== id; });
    window.scrollTo(0, 0);
  }

  $("#commencer").addEventListener("click", () => {
    montrer("questionnaire");
    afficher();
  });

  // ——— Affichage d'une question ———
  function element(balise, attributs, texte) {
    const el = document.createElement(balise);
    Object.entries(attributs || {}).forEach(([nom, valeur]) => el.setAttribute(nom, valeur));
    if (texte !== undefined) el.textContent = texte;
    return el;
  }

  function option(q, type, valeur, texte, coche) {
    const label = element("label", { class: "option" });
    const input = element("input", { type, name: q.id, value: valeur });
    input.checked = coche;
    label.append(input, element("span", {}, texte));
    return label;
  }

  function afficher() {
    const q = questions[index];
    const total = questions.length;
    $("#compteur").textContent = "Question " + (index + 1) + " sur " + total;
    barre.setAttribute("aria-valuenow", index + 1);
    barre.firstElementChild.style.width = ((index + 1) / total) * 100 + "%";

    zone.replaceChildren();
    const legende = element("legend", { class: "intitule", tabindex: "-1" }, q.intitule);
    zone.append(legende);
    if (q.aide) zone.append(element("p", { class: "aide" }, q.aide));

    const deja = reponses[q.id];
    if (q.type === "unique" || q.type === "multiple") {
      const liste = element("div", { class: "choix" });
      q.choix.forEach((c) => liste.append(option(q, q.type === "unique" ? "radio" : "checkbox", c, c,
        q.type === "unique" ? deja === c : (deja || []).includes(c))));
      zone.append(liste);
    } else if (q.type === "note") {
      const echelle = element("div", { class: "echelle" });
      for (let n = 1; n <= 5; n++) {
        const label = option(q, "radio", String(n), String(n), deja === n);
        if (n === 1 || n === 5) label.append(element("span", { class: "invisible" }, " (" + q.etiquettes[n === 1 ? 0 : 1] + ")"));
        echelle.append(label);
      }
      const bornes = element("div", { class: "bornes", "aria-hidden": "true" });
      bornes.append(element("span", {}, q.etiquettes[0]), element("span", {}, q.etiquettes[1]));
      zone.append(echelle, bornes);
    } else {
      const champ = element("input", { type: "text", class: "champ", name: q.id, maxlength: "200", autocomplete: "off", "aria-label": q.intitule });
      champ.value = deja || "";
      zone.append(champ);
    }

    erreur.hidden = true;
    precedent.hidden = index === 0;
    suivant.textContent = index === total - 1 ? "Envoyer mes réponses" : "Suivant";
    legende.focus();
  }

  // ——— Lecture et vérification de la réponse affichée ———
  function lire(q) {
    if (q.type === "texte") return zone.querySelector("input").value.trim();
    const coches = [...zone.querySelectorAll("input:checked")].map((i) => i.value);
    if (q.type === "multiple") return coches;
    if (!coches.length) return undefined;
    return q.type === "note" ? Number(coches[0]) : coches[0];
  }

  function memoriser(q) {
    const valeur = lire(q);
    const vide = valeur === undefined || valeur === "" || (Array.isArray(valeur) && !valeur.length);
    if (vide) delete reponses[q.id];
    else reponses[q.id] = valeur;
    return !vide;
  }

  function signaler(message) {
    erreur.textContent = message;
    erreur.hidden = false;
  }

  zone.addEventListener("change", () => { erreur.hidden = true; });

  precedent.addEventListener("click", () => {
    memoriser(questions[index]);
    index--;
    afficher();
  });

  formulaire.addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    const q = questions[index];
    if (!memoriser(q) && q.obligatoire) {
      signaler(q.type === "multiple" ? "Choisissez au moins une réponse pour continuer." : "Choisissez une réponse pour continuer.");
      return;
    }
    if (index < questions.length - 1) {
      index++;
      afficher();
    } else {
      envoyer();
    }
  });

  // ——— Envoi des réponses à la base de données ———
  async function envoyer() {
    suivant.disabled = precedent.disabled = true;
    suivant.textContent = "Envoi en cours…";
    try {
      await Base.enregistrer(reponses);
      montrer("merci");
      $("#merci .titre").focus();
    } catch (err) {
      signaler(err.statut
        ? err.message || "L'envoi n'a pas abouti. Réessayez dans un instant."
        : "L'envoi n'a pas abouti. Vérifiez votre connexion puis réessayez.");
    } finally {
      suivant.disabled = precedent.disabled = false;
      suivant.textContent = "Envoyer mes réponses";
    }
  }

  charger();
})();
