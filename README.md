# Les Spécimens Exclusifs

Site du jeu, connecté à Supabase (comptes, base de données).
Ton compte (eliotbretagne@gmail.com) a automatiquement le rôle admin.

## Mise en ligne (gratuit) — GitHub + Vercel

### 1. Mettre le code sur GitHub
1. Va sur github.com, crée un compte si besoin, puis clique "New repository"
2. Nom : `specimens-exclusifs` — Public ou Privé, comme tu veux — "Create repository"
3. Sur la page du repo vide, clique "uploading an existing file"
4. Glisse-dépose TOUT le contenu de ce dossier (garde la structure des sous-dossiers `src/`)
5. Clique "Commit changes"

### 2. Déployer sur Vercel
1. Va sur vercel.com → "Sign Up" → connecte-toi avec ton compte GitHub
2. Clique "Add New..." → "Project"
3. Choisis le repo `specimens-exclusifs` → "Import"
4. Laisse les réglages par défaut (Vercel détecte Vite automatiquement) → "Deploy"
5. Après ~1 minute, ton site est en ligne à une adresse du type
   `specimens-exclusifs.vercel.app`

C'est tout — pas de variables d'environnement à ajouter, les clés Supabase
utilisées ici sont conçues pour être publiques (voir `src/supabaseClient.js`).

## Développement local (optionnel)
```
npm install
npm run dev
```

## Notes
- Ton adresse email est reconnue automatiquement comme administrateur
  (voir la fonction `handle_new_user` dans Supabase) : dès que tu crées un
  compte avec eliotbretagne@gmail.com, l'onglet "Admin" apparaît dans l'app.
- Pour ajouter/modifier des personnages, objets ou boîtes, le plus simple
  reste le SQL Editor de Supabase (insert/update). L'onglet Admin du site
  permet de publier des actus et de supprimer des éléments existants.
- Le projet Supabase gratuit se met en veille après une période d'inactivité
  et se réveille automatiquement au premier appel (léger délai, normal).
