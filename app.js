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

  // Champs de la question « coordonnees » : clé, libellé, type, autocomplete, clavier sur mobile.
  const CHAMPS = [
    ["prenom", "Prénom", "text", "given-name"],
    ["nom", "Nom", "text", "family-name"],
    ["email", "E-mail", "email", "email", "email"],
    ["telephone", "Téléphone", "tel", "tel", "tel"]
  ];
  const ACCORD = "J'accepte qu'AW Parfumerie utilise ces coordonnées pour me recontacter.";
  const MENTION = "Vos coordonnées sont réservées à AW Parfumerie : elles ne sont jamais transmises à des tiers " +
    "et sont effacées au bout de 3 ans. Pour les consulter, les corriger ou les supprimer, écrivez à simaowilly@gmail.com.";

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
    } else if (q.type === "coordonnees") {
      const grille = element("div", { class: "coordonnees" });
      CHAMPS.forEach(([cle, libelle, type, autocomplete, clavier]) => {
        const bloc = element("div", { class: "champ-bloc" });
        const champ = element("input", { id: "c-" + cle, type, class: "champ", autocomplete, maxlength: "100", required: "" });
        if (clavier) champ.setAttribute("inputmode", clavier);
        champ.value = (deja && deja[cle]) || "";
        bloc.append(element("label", { for: "c-" + cle }, libelle), champ);
        grille.append(bloc);
      });
      const accord = option(q, "checkbox", "oui", ACCORD, Boolean(deja && deja.consentement));
      accord.classList.add("accord");
      zone.append(grille, accord, element("p", { class: "mention-rgpd" }, MENTION));
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
    if (q.type === "coordonnees") {
      const valeur = { consentement: zone.querySelector(".accord input").checked };
      CHAMPS.forEach(([cle]) => { valeur[cle] = zone.querySelector("#c-" + cle).value.trim(); });
      return valeur;
    }
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

  // Mêmes règles que dans supabase.sql : [champ à corriger, message] ou null si tout est bon.
  function verifierCoordonnees(c) {
    if (!c.prenom) return ["prenom", "Indiquez votre prénom."];
    if (!c.nom) return ["nom", "Indiquez votre nom."];
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return ["email", "Indiquez une adresse e-mail valide (ex. prenom@exemple.fr)."];
    if (!/^\+?\d{8,15}$/.test(c.telephone.replace(/[^\d+]/g, ""))) return ["telephone", "Indiquez un numéro de téléphone valide (ex. 06 12 34 56 78)."];
    if (!c.consentement) return [null, "Cochez la case pour accepter que nous vous recontactions."];
    return null;
  }

  function signaler(message) {
    erreur.textContent = message;
    erreur.hidden = false;
  }

  // Le message disparaît dès qu'on corrige (frappe ou clic), pas quand le champ perd le focus :
  // sinon le bouton « Suivant » remonterait sous le doigt et le clic serait perdu.
  zone.addEventListener("input", (e) => {
    erreur.hidden = true;
    e.target.removeAttribute("aria-invalid");
  });

  precedent.addEventListener("click", () => {
    memoriser(questions[index]);
    index--;
    afficher();
  });

  formulaire.addEventListener("submit", (evenement) => {
    evenement.preventDefault();
    const q = questions[index];
    const rempli = memoriser(q);
    if (q.type === "coordonnees") {
      const probleme = verifierCoordonnees(reponses[q.id]);
      if (probleme) {
        signaler(probleme[1]);
        const champ = probleme[0] ? zone.querySelector("#c-" + probleme[0]) : zone.querySelector(".accord input");
        if (probleme[0]) champ.setAttribute("aria-invalid", "true");
        champ.focus();
        return;
      }
    } else if (!rempli && q.obligatoire) {
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
      const coordonnees = questions.find((q) => q.type === "coordonnees");
      const prenom = coordonnees && reponses[coordonnees.id] ? reponses[coordonnees.id].prenom : "";
      $("#merci .surtitre").textContent = prenom ? "Merci pour vos réponses, " + prenom + " !" : "Merci pour vos réponses !";
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
