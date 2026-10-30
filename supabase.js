/*
 * Appels à la base de données Supabase (API REST), partagés par le questionnaire et la page des résultats.
 * Les fonctions appelées (enregistrer_reponses, resultats, export_reponses) sont définies dans supabase.sql.
 */
const Base = (function () {
  "use strict";

  const configuree = Boolean(typeof SUPABASE === "object" && SUPABASE.url && SUPABASE.cle);

  async function appeler(chemin, options) {
    const entetes = { apikey: SUPABASE.cle, "Content-Type": "application/json" };
    // Les anciennes clés « anon » (eyJ…) doivent aussi être envoyées dans Authorization ; pas les clés « publishable ».
    if (SUPABASE.cle.startsWith("eyJ")) entetes.Authorization = "Bearer " + SUPABASE.cle;
    const reponse = await fetch(SUPABASE.url.replace(/\/+$/, "") + "/rest/v1/" + chemin, { ...options, headers: entetes });
    const donnees = await reponse.json().catch(() => null);
    if (!reponse.ok) {
      // P0001 : message d'erreur écrit dans supabase.sql, prévu pour être affiché tel quel.
      const erreur = new Error(donnees && donnees.code === "P0001" ? donnees.message : "");
      erreur.statut = reponse.status;
      throw erreur;
    }
    return donnees;
  }

  const fonction = (nom, parametres) => appeler("rpc/" + nom, { method: "POST", body: JSON.stringify(parametres) });

  // resultats et export_reponses répondent { erreur } quand le mot de passe est refusé.
  async function protegee(nom, motDePasse) {
    const donnees = await fonction(nom, { mot_de_passe: motDePasse });
    if (donnees && donnees.erreur) {
      const erreur = new Error(donnees.erreur);
      erreur.statut = 403;
      throw erreur;
    }
    return donnees;
  }

  return {
    configuree,
    questions: () => appeler("questions?select=id,intitule,aide,type,choix,etiquettes,obligatoire&order=numero"),
    enregistrer: (reponses) => fonction("enregistrer_reponses", { contenu: reponses }),
    resultats: (motDePasse) => protegee("resultats", motDePasse),
    exporter: (motDePasse) => protegee("export_reponses", motDePasse)
  };
})();
