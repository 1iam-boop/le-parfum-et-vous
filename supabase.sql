-- ============================================================================
-- Base de données du questionnaire « Le parfum et vous » · AW Parfumerie
--
-- À coller dans Supabase › SQL Editor, puis cliquer sur « Run ».
-- AVANT : remplacez CHANGEZ-MOI ci-dessous par le mot de passe de la page des résultats.
-- (Ne remettez pas ce mot de passe dans le fichier sur GitHub : il est public.)
--
-- Le script peut être relancé sans perdre les réponses déjà enregistrées,
-- par exemple pour changer le mot de passe ou les questions.
-- ============================================================================

-- 1. Mot de passe de la page des résultats ------------------------------------
-- Rangé dans le schéma « prive », que le site ne peut pas lire.
create schema if not exists prive;
create table if not exists prive.reglages (cle text primary key, valeur text not null);

do $$
declare
  mot_de_passe text := 'CHANGEZ-MOI';   -- ← votre mot de passe ici, entre les apostrophes
begin
  if mot_de_passe <> ('CHANGEZ' || '-MOI') then   -- écrit en deux morceaux pour n'avoir qu'un endroit à remplacer
    insert into prive.reglages (cle, valeur)
    values ('mot_de_passe_resultats', encode(sha256(convert_to(mot_de_passe, 'UTF8')), 'hex'))
    on conflict (cle) do update set valeur = excluded.valeur;
  end if;
end $$;

-- 2. Tables -------------------------------------------------------------------
create table if not exists public.questions (
  id          text primary key,
  numero      integer not null,
  intitule    text not null,
  aide        text not null default '',
  type        text not null check (type in ('unique', 'multiple', 'note', 'texte')),
  choix       jsonb not null default '[]',   -- réponses proposées (unique, multiple)
  etiquettes  jsonb not null default '[]',   -- mots sous 1 et sous 5 (note)
  obligatoire boolean not null default true,
  active      boolean not null default true
);

create table if not exists public.participations (
  id      bigint generated always as identity primary key,
  cree_le timestamptz not null default now()
);

-- Une ligne par réponse donnée (plusieurs lignes pour une question à choix multiples).
create table if not exists public.reponses (
  id               bigint generated always as identity primary key,
  participation_id bigint not null references public.participations (id) on delete cascade,
  question_id      text not null references public.questions (id),
  valeur           text not null
);
create index if not exists reponses_par_question on public.reponses (question_id, valeur);
create index if not exists reponses_par_participation on public.reponses (participation_id);

-- 3. Les 10 questions -----------------------------------------------------------
-- type : unique (une réponse), multiple (plusieurs), note (de 1 à 5), texte (réponse libre).
-- Ne changez pas l'id d'une question qui a déjà des réponses.
insert into public.questions (id, numero, intitule, aide, type, choix, etiquettes, obligatoire) values
  ('age', 1, 'Quel âge avez-vous ?', '', 'unique', '["Moins de 18 ans","18 à 25 ans","26 à 35 ans","36 à 50 ans","Plus de 50 ans"]', '[]', true),
  ('frequence', 2, 'À quelle fréquence portez-vous du parfum ?', '', 'unique', '["Tous les jours","Plusieurs fois par semaine","Pour les grandes occasions","Rarement","Jamais"]', '[]', true),
  ('importance', 3, 'Quelle place le parfum a-t-il dans votre quotidien ?', '', 'note', '[]', '["Aucune","Essentielle"]', true),
  ('familles', 4, 'Quelles familles de parfums préférez-vous ?', 'Plusieurs réponses possibles.', 'multiple', '["Florale (rose, jasmin…)","Fruitée","Boisée","Orientale (ambre, épices…)","Fraîche (agrumes, notes marines…)","Gourmande (vanille, caramel…)"]', '[]', true),
  ('prefere', 5, 'Quel est votre parfum préféré en ce moment ?', 'Facultatif.', 'texte', '[]', '[]', false),
  ('budget', 6, 'Combien dépensez-vous en général pour un parfum ?', '', 'unique', '["Moins de 20 €","De 20 à 50 €","De 50 à 100 €","Plus de 100 €"]', '[]', true),
  ('achat', 7, 'Où achetez-vous vos parfums ?', 'Plusieurs réponses possibles.', 'multiple', '["En parfumerie (Sephora, Nocibé…)","En grande surface","Sur internet","Auprès d''un vendeur indépendant","On me les offre"]', '[]', true),
  ('critere', 8, 'Qu''est-ce qui compte le plus pour vous dans un parfum ?', '', 'unique', '["L''odeur","La tenue","Le prix","La marque","Le flacon"]', '[]', true),
  ('inspiration', 9, 'Connaissez-vous les parfums « d''inspiration », créés d''après de grandes fragrances et vendus à petit prix ?', '', 'unique', '["Oui, j''en ai déjà acheté","Oui, mais je n''en ai jamais acheté","Non, je ne connais pas"]', '[]', true),
  ('format', 10, 'Aimeriez-vous tester un parfum en petit format (15 ml) avant d''acheter un grand flacon ?', '', 'unique', '["Oui","Peut-être","Non"]', '[]', true)
on conflict (id) do update set
  numero = excluded.numero, intitule = excluded.intitule, aide = excluded.aide, type = excluded.type,
  choix = excluded.choix, etiquettes = excluded.etiquettes, obligatoire = excluded.obligatoire, active = true;

-- Une question retirée de la liste ci-dessus est masquée, mais ses réponses sont gardées.
update public.questions set active = false
where id not in ('age', 'frequence', 'importance', 'familles', 'prefere', 'budget', 'achat', 'critere', 'inspiration', 'format');

-- 4. Enregistrer un questionnaire rempli ---------------------------------------
-- Appelée par le site. Vérifie chaque réponse ; en cas d'erreur, rien n'est enregistré.
create or replace function public.enregistrer_reponses(contenu jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  q public.questions;
  v jsonb;
  id_participation bigint;
begin
  if contenu is null or jsonb_typeof(contenu) <> 'object' then
    raise exception 'Format de réponse invalide.';
  end if;
  if octet_length(contenu::text) > 16000 then
    raise exception 'Réponse trop volumineuse.';
  end if;

  insert into participations default values returning id into id_participation;

  for q in select * from questions where active order by numero loop
    v := contenu -> q.id;

    if v is null or jsonb_typeof(v) = 'null'
       or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')
       or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0) then
      if q.obligatoire then
        raise exception 'Merci de répondre à la question %.', q.numero;
      end if;
      continue;
    end if;

    if q.type = 'unique' then
      if jsonb_typeof(v) <> 'string' or not (q.choix ? (v #>> '{}')) then
        raise exception 'La réponse à la question % n''est pas valide.', q.numero;
      end if;
      insert into reponses (participation_id, question_id, valeur) values (id_participation, q.id, v #>> '{}');

    elsif q.type = 'multiple' then
      if jsonb_typeof(v) <> 'array' or exists (
        select 1 from jsonb_array_elements(v) e where jsonb_typeof(e) <> 'string' or not (q.choix ? (e #>> '{}'))
      ) then
        raise exception 'La réponse à la question % n''est pas valide.', q.numero;
      end if;
      insert into reponses (participation_id, question_id, valeur)
      select id_participation, q.id, c.valeur
      from jsonb_array_elements_text(v) with ordinality c (valeur, rang)
      group by c.valeur order by min(c.rang);

    elsif q.type = 'note' then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not in (1, 2, 3, 4, 5) then
        raise exception 'La réponse à la question % n''est pas valide.', q.numero;
      end if;
      insert into reponses (participation_id, question_id, valeur) values (id_participation, q.id, ((v #>> '{}')::numeric)::integer::text);

    else -- texte
      if jsonb_typeof(v) <> 'string' then
        raise exception 'La réponse à la question % n''est pas valide.', q.numero;
      end if;
      insert into reponses (participation_id, question_id, valeur) values (id_participation, q.id, left(btrim(v #>> '{}'), 200));
    end if;
  end loop;

  return id_participation;
end;
$$;

-- 5. Page des résultats (protégée par le mot de passe) ---------------------------
create or replace function prive.verifier_mot_de_passe(mot_de_passe text)
returns void
language plpgsql
security definer
set search_path = prive, pg_temp
as $$
declare
  attendu text;
begin
  select valeur into attendu from reglages where cle = 'mot_de_passe_resultats';
  if attendu is null then
    raise exception 'Aucun mot de passe n''est défini : relancez supabase.sql après avoir remplacé CHANGEZ-MOI.';
  end if;
  if mot_de_passe is null or encode(sha256(convert_to(mot_de_passe, 'UTF8')), 'hex') <> attendu then
    perform pg_sleep(1); -- ralentit les essais au hasard
    raise exception 'Mot de passe incorrect.';
  end if;
end;
$$;

-- Dates au format ISO en UTC (« 2026-10-30T14:05:00Z »), lisibles par tous les navigateurs.
create or replace function prive.date_iso(t timestamptz)
returns text
language sql
stable
as $$ select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') $$;

-- Statistiques question par question.
create or replace function public.resultats(mot_de_passe text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform prive.verifier_mot_de_passe(mot_de_passe);

  return jsonb_build_object(
    'total', (select count(*) from participations),
    'derniere', (select prive.date_iso(max(cree_le)) from participations),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'numero', q.numero,
          'intitule', q.intitule,
          'type', q.type,
          'etiquettes', q.etiquettes,
          'repondants', (select count(distinct r.participation_id) from reponses r where r.question_id = q.id),
          'moyenne', case when q.type = 'note' then (select avg(r.valeur::integer) from reponses r where r.question_id = q.id) end,
          -- Pour unique, multiple et note : chaque réponse possible avec son nombre, dans l'ordre des choix.
          -- Les réponses dont l'intitulé a changé depuis sont gardées à la fin.
          'valeurs', case when q.type <> 'texte' then (
            select coalesce(jsonb_agg(jsonb_build_object('valeur', a.valeur, 'nombre', a.nombre) order by a.rang, a.valeur), '[]')
            from (
              select attendue.valeur, attendue.rang,
                     (select count(*) from reponses r where r.question_id = q.id and r.valeur = attendue.valeur) as nombre
              from (
                select c.valeur, c.rang
                from jsonb_array_elements_text(case when q.type = 'note' then '["1","2","3","4","5"]'::jsonb else q.choix end)
                     with ordinality c (valeur, rang)
                union
                select distinct r.valeur, 1000 from reponses r
                where r.question_id = q.id
                  and not (case when q.type = 'note' then '["1","2","3","4","5"]'::jsonb else q.choix end ? r.valeur)
              ) attendue
            ) a
          ) end,
          -- Pour texte : les 200 dernières réponses libres.
          'textes', case when q.type = 'texte' then (
            select coalesce(jsonb_agg(jsonb_build_object('texte', t.valeur, 'date', prive.date_iso(t.cree_le)) order by t.id desc), '[]')
            from (
              select r.valeur, p.cree_le, p.id
              from reponses r join participations p on p.id = r.participation_id
              where r.question_id = q.id
              order by p.id desc
              limit 200
            ) t
          ) end
        )
        order by q.numero
      )
      from questions q
      where q.active
    ), '[]')
  );
end;
$$;

-- Toutes les réponses, une ligne par participation (pour le fichier Excel).
create or replace function public.export_reponses(mot_de_passe text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform prive.verifier_mot_de_passe(mot_de_passe);

  return jsonb_build_object(
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'numero', numero, 'intitule', intitule) order by numero)
      from questions where active
    ), '[]'),
    'participations', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'date', prive.date_iso(p.cree_le), 'reponses', coalesce(rep.parQuestion, '{}')) order by p.id)
      from participations p
      left join lateral (
        select jsonb_object_agg(question_id, valeurs) as parQuestion
        from (
          select question_id, jsonb_agg(valeur order by id) as valeurs
          from reponses where participation_id = p.id
          group by question_id
        ) groupe
      ) rep on true
    ), '[]')
  );
end;
$$;

-- 6. Droits -------------------------------------------------------------------
-- Le site (rôles anon et authenticated) peut seulement : lire les questions actives
-- et appeler les trois fonctions ci-dessus. Les réponses ne sont lisibles qu'avec le mot de passe.
alter table public.questions enable row level security;
alter table public.participations enable row level security;
alter table public.reponses enable row level security;
alter table prive.reglages enable row level security;

revoke all on public.questions, public.participations, public.reponses from anon, authenticated;
revoke all on schema prive from public, anon, authenticated;
revoke all on all tables in schema prive from public, anon, authenticated;
revoke all on all functions in schema prive from public, anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.questions to anon, authenticated;
drop policy if exists "Questions actives visibles" on public.questions;
create policy "Questions actives visibles" on public.questions for select to anon, authenticated using (active);

revoke all on function public.enregistrer_reponses(jsonb), public.resultats(text), public.export_reponses(text) from public;
grant execute on function public.enregistrer_reponses(jsonb), public.resultats(text), public.export_reponses(text) to anon, authenticated;

-- Prévient l'API de Supabase que les tables et fonctions ont changé.
notify pgrst, 'reload schema';
