# Le parfum et vous

Un petit site indépendant en trois étapes :

1. **un questionnaire de 11 questions**, affichées une par une : d'abord les **coordonnées** de la personne (prénom, nom, e-mail, téléphone, toutes obligatoires), puis 10 questions sur le parfum (habitudes, goûts, budget…) ;
2. **une présentation d'AW Parfumerie en 3 phrases** ;
3. **un lien vers le site AW Parfumerie** (https://1iam-boop.github.io/Nextface/).

Le site est hébergé gratuitement sur **GitHub Pages** : `https://1iam-boop.github.io/le-parfum-et-vous/`.
Les réponses sont enregistrées dans **une petite base de données gratuite chez [Supabase](https://supabase.com)** (PostgreSQL). Une page protégée par mot de passe affiche les résultats et permet de tout télécharger pour Excel : `https://1iam-boop.github.io/le-parfum-et-vous/admin/`.

### Données personnelles (RGPD)
- La personne coche une case pour accepter qu'AW Parfumerie utilise ses coordonnées pour la recontacter ; un texte sous les champs l'informe qu'elles ne sont jamais transmises à des tiers, qu'elles sont effacées au bout de 3 ans et qu'elle peut écrire à simaowilly@gmail.com pour les consulter, les corriger ou les supprimer.
- L'effacement au bout de 3 ans est automatique (les réponses au questionnaire restent, sans nom).
- Pour supprimer une personne qui le demande : Supabase › **Table Editor** › `participations`, cochez sa ligne › **Delete**.
- Aucune adresse IP n'est enregistrée.

## Mise en route (une seule fois)

### 1. Créer la base de données
1. Sur [supabase.com](https://supabase.com), cliquez sur **Start your project** et connectez-vous avec votre compte **GitHub**.
2. Cliquez sur **New project** : nom `aw-questionnaire`, mot de passe de la base (bouton **Generate**, inutile de le retenir), région en Europe (Paris ou Francfort), offre **Free**. Validez et patientez une à deux minutes.

### 2. Créer les tables
1. Dans le menu de gauche, ouvrez **SQL Editor**.
2. Copiez tout le contenu du fichier [`supabase.sql`](supabase.sql) et collez-le.
3. Ligne 23, remplacez `CHANGEZ-MOI` par le mot de passe de votre choix pour la page des résultats (gardez les apostrophes autour, et n'en mettez pas dans le mot de passe). Choisissez-le long (12 caractères ou plus) : il protège des données personnelles.
4. Cliquez sur **Run**. Si Supabase demande une confirmation, acceptez.

### 3. Relier le site à la base
Dans **Project Settings** :
- rubrique **Data API** : copiez la **Project URL** (`https://….supabase.co`) ;
- rubrique **API Keys** : copiez la clé **Publishable** (`sb_publishable_…`).

Collez-les dans [`config.js`](config.js), entre les guillemets de `url` et de `cle`. Ces deux valeurs sont faites pour être publiques. Ne mettez jamais la clé **secret** ni le mot de passe de la base dans ce fichier.

### 4. Mettre le site en ligne
Sur GitHub, dans ce dépôt : **Settings** › **Pages** › **Source : Deploy from a branch** › branche `main`, dossier `/ (root)` › **Save**. Le site est en ligne une à deux minutes plus tard.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | La page du questionnaire, avec **les 3 phrases de présentation** et **le lien** vers AW Parfumerie |
| `app.js` | Affiche les questions une par une et enregistre les réponses |
| `style.css` | Le style (couleurs et polices accordées au site AW Parfumerie) |
| `config.js` | L'adresse et la clé publique de la base Supabase |
| `supabase.js` | Les appels à la base de données |
| `admin/` | La page des résultats |
| `supabase.sql` | La base de données : tables, **les 11 questions**, vérification des réponses, statistiques, droits d'accès |

## La base de données

| Table | Contenu |
|---|---|
| `questions` | les 11 questions et leurs réponses proposées |
| `participations` | une ligne par questionnaire envoyé : date, prénom, nom, e-mail, téléphone, accord |
| `reponses` | une ligne par réponse (plusieurs lignes pour une question à choix multiples) |

Vous pouvez les consulter dans Supabase › **Table Editor**.

Le site ne peut que lire les questions et appeler trois fonctions définies dans `supabase.sql` :
`enregistrer_reponses` vérifie chaque réponse avant de l'enregistrer, et `resultats` et `export_reponses` ne répondent qu'avec le mot de passe des résultats (après 10 mauvais mots de passe en 15 minutes, la page des résultats se bloque 15 minutes). Personne ne peut lire, modifier ou supprimer les réponses ni les coordonnées avec la clé publique.

### Modifier les questions ou le mot de passe
Modifiez la partie « Les 11 questions » ou le mot de passe dans `supabase.sql`, puis relancez tout le script dans le SQL Editor : les réponses déjà enregistrées sont conservées. Ne remettez pas votre mot de passe dans le fichier sur GitHub, il est public.

Chaque question a un `type` : `coordonnees` (prénom, nom, e-mail, téléphone), `unique` (une réponse), `multiple` (plusieurs), `note` (de 1 à 5) ou `texte` (réponse libre, facultative si `obligatoire` vaut `false`). Ne changez pas l'`id` d'une question qui a déjà des réponses.

### Mise en pause par Supabase
Supabase met en pause les projets gratuits après une semaine sans activité. Pour l'éviter, le robot [`.github/workflows/supabase-reveil.yml`](.github/workflows/supabase-reveil.yml) consulte la base tous les 3 jours. Si la base est malgré tout en pause, il suffit de cliquer sur **Restore project** dans Supabase : rien n'est perdu.
