/*
 * Adresse de la base de données Supabase du questionnaire (voir README.md, étape 2).
 * Les deux valeurs se trouvent dans Supabase › Project Settings :
 * - url : « Project URL », rubrique Data API (ex. "https://abcdefghijkl.supabase.co")
 * - cle : la clé « publishable », rubrique API Keys (ex. "sb_publishable_…")
 * Cette clé est faite pour être publique : elle ne permet que ce que supabase.sql autorise.
 * Ne mettez jamais ici la clé « secret » ni le mot de passe de la base.
 */
const SUPABASE = {
  url: "",
  cle: ""
};
