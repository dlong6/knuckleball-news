# Knuckleball News Admin Setup

This site now supports a login-protected publishing interface using Supabase.

## 1) Create Supabase project

1. Go to https://supabase.com and create a new project.
2. In Project Settings -> API, copy:
   - Project URL
   - anon public key

## 2) Fill config file

Edit kb-config.js:

window.KB_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
};

Important: Use the project root URL, not the REST URL. Do not include /rest/v1.

## 3) Create the articles table

In Supabase SQL Editor, run:

create extension if not exists pgcrypto;

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  author text not null default 'Knuckleball News',
  category text,
  is_series boolean not null default false,
  teams text[] not null default '{}',
  summary text,
  body_html text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_articles_updated_at on public.articles;
create trigger trg_articles_updated_at
before update on public.articles
for each row
execute procedure public.set_updated_at();

## 4) Turn on Row Level Security and policies

alter table public.articles enable row level security;

-- Public can read published posts only
create policy "Public can read published articles"
on public.articles
for select
using (status = 'published');

-- Authenticated users can read all posts in admin (published + draft)
create policy "Authenticated users can read all articles"
on public.articles
for select
to authenticated
using (true);

-- Authenticated users can create/update/delete
create policy "Authenticated users can insert articles"
on public.articles
for insert
to authenticated
with check (true);

create policy "Authenticated users can update articles"
on public.articles
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete articles"
on public.articles
for delete
to authenticated
using (true);

## 5) Create admin users

In Supabase Auth -> Users:
1. Add user manually (email + password).
2. Share credentials only with verified publishers.

## 6) Use the publishing interface

1. Open admin.html.
2. Sign in.
3. Create/edit/delete articles.
4. Draft using the built-in toolbar (bold, italic, underline, strikethrough, links, photos, and Add Table).
5. Published articles appear on index.html automatically.
6. Each published story is reachable at article.html?slug=your-article-slug.

## Notes

- Admin users do not need to write HTML.
- Use Add Table in the toolbar to insert an editable table scaffold.
- Tables inserted with Add Table automatically get column sorting and row filtering on published pages.
- Draft posts are hidden from public pages.
- No git push is needed for each article update after setup.
- Home page right rail shows up to 12 most recent posts.
- Older posts remain searchable from the home page search box.

## Troubleshooting: "new row violates row-level security policy"

If saving from admin.html fails with that message, your insert/update policies are missing or mismatched.

Run this in Supabase SQL Editor:

```sql
alter table public.articles enable row level security;

drop policy if exists "Authenticated users can insert articles" on public.articles;
drop policy if exists "Authenticated users can read all articles" on public.articles;
drop policy if exists "Authenticated users can update articles" on public.articles;
drop policy if exists "Authenticated users can delete articles" on public.articles;

create policy "Authenticated users can read all articles"
on public.articles
for select
to authenticated
using (true);

create policy "Authenticated users can insert articles"
on public.articles
for insert
to authenticated
with check (true);

create policy "Authenticated users can update articles"
on public.articles
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete articles"
on public.articles
for delete
to authenticated
using (true);
```

Then sign out and sign back in on admin.html, and try saving again.

## Troubleshooting: missing Series column

If saving fails with a message that mentions is_series or "column does not exist", run:

```sql
alter table public.articles
add column if not exists is_series boolean not null default false;
```
