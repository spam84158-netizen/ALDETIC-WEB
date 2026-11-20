Tests navigateur (Playwright, Python). Serveur local requis : `python3 -m http.server 8765` à la racine du projet, puis `python3 tests-front/test_phone.py` et `python3 tests-front/test_notifs.py`.
Ils remplacent Supabase par un faux client en mémoire : ils prouvent le comportement de la page, pas la connexion à votre vraie base.

Tests unitaires des fonctions serveur : `node --test $(ls supabase/functions/_shared/*.test.ts | grep -v deno-smoke)`. Le fichier `deno-smoke` ne s'exécute que sous Deno (CI GitHub).
