-- DATENZA — comptes et projets enregistrés
-- À exécuter UNE fois : Supabase > SQL Editor > New query > coller tout ce fichier > Run.
-- Le script peut être relancé sans risque (il ne supprime aucune donnée).

-- 1. Table des projets -------------------------------------------------------------------------
create table if not exists public.projets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 120),
  nom_fichier text not null default '',
  nb_lignes integer not null default 0,
  nb_colonnes integer not null default 0,
  taille_octets bigint not null default 0,
  -- Emplacement des lignes du fichier dans le stockage (bucket « projets »)
  chemin_donnees text not null,
  -- Colonnes choisies, filtres, colonnes calculées, graphiques épinglés, rapport
  reglages jsonb not null default '{}'::jsonb,
  -- Identifiant secret du lien de partage ; null = projet non partagé
  partage_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Si une table « projets » existait déjà (créée par un autre essai), on lui ajoute les colonnes manquantes.
-- Ajouts uniquement : aucune colonne ni donnée existante n'est supprimée ou modifiée.
alter table public.projets add column if not exists id uuid default gen_random_uuid();
alter table public.projets add column if not exists user_id uuid default auth.uid() references auth.users (id) on delete cascade;
alter table public.projets add column if not exists nom text not null default 'Projet';
alter table public.projets add column if not exists nom_fichier text not null default '';
alter table public.projets add column if not exists nb_lignes integer not null default 0;
alter table public.projets add column if not exists nb_colonnes integer not null default 0;
alter table public.projets add column if not exists taille_octets bigint not null default 0;
alter table public.projets add column if not exists chemin_donnees text not null default '';
alter table public.projets add column if not exists reglages jsonb not null default '{}'::jsonb;
alter table public.projets add column if not exists partage_id uuid unique;
alter table public.projets add column if not exists created_at timestamptz not null default now();
alter table public.projets add column if not exists updated_at timestamptz not null default now();

create index if not exists projets_user_idx on public.projets (user_id, updated_at desc);

create or replace function public.projets_maj_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projets_maj_date on public.projets;
create trigger projets_maj_date
  before update on public.projets
  for each row execute function public.projets_maj_date();

-- 2. Sécurité : chacun ne voit et ne modifie que ses propres projets ----------------------------
alter table public.projets enable row level security;

drop policy if exists "projets : proprietaire uniquement" on public.projets;
create policy "projets : proprietaire uniquement"
  on public.projets
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 3. Stockage des données : bucket privé, un dossier par utilisateur ----------------------------
insert into storage.buckets (id, name, public)
values ('projets', 'projets', false)
on conflict (id) do nothing;

drop policy if exists "projets fichiers : lecture" on storage.objects;
create policy "projets fichiers : lecture"
  on storage.objects for select to authenticated
  using (bucket_id = 'projets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "projets fichiers : ajout" on storage.objects;
create policy "projets fichiers : ajout"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'projets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "projets fichiers : modification" on storage.objects;
create policy "projets fichiers : modification"
  on storage.objects for update to authenticated
  using (bucket_id = 'projets' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'projets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "projets fichiers : suppression" on storage.objects;
create policy "projets fichiers : suppression"
  on storage.objects for delete to authenticated
  using (bucket_id = 'projets' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Le partage par lien ne passe par aucune règle ci-dessus : les visiteurs n'ont aucun accès direct.
-- C'est la route serveur /api/partage/[id] qui vérifie le lien et délivre un accès de 5 minutes aux données.

-- 4. Prise en compte immédiate des nouvelles colonnes par l'API de Supabase -------------------
notify pgrst, 'reload schema';
