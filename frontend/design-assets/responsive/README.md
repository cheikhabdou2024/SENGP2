# Adaptation tous formats (téléphone, tablette, paysage)

Contexte : l'application est utilisée en PWA (Vercel) tant que les stores ne sont pas accessibles ; elle doit donc être confortable sur tous les écrans.

Tout passe par **`responsive.css`**, chargé en dernier sur chaque page (inclus au build et au cache hors-ligne `sw.js`).

| Écran | Comportement |
|---|---|
| Téléphone portrait (< 600 px) | inchangé (testé 320×568, 360, 390, 430) |
| Tablette portrait (≥ 600 / 768 / 1000 px) | contenu des écrans redessinés agrandi ×1,2 / ×1,4 / ×1,5 (`zoom`) et centré ; photo d'en-tête pleine largeur ; barre du bas regroupée au centre (640 px) ; feuilles du bas à la même échelle |
| Tablette / bureau paysage | ×1,15 (×1,3 si écran ≥ 1000×800) pour garder du contenu visible |
| Téléphone paysage (hauteur ≤ 520 px) | échelle 1, barre du bas compacte (56 px), feuilles à 94 % de la hauteur |
| Anciens écrans (`<html class="rs-legacy">`) | cadre centré de 600 px max (formulaires, missions, gains, détails…) |
| < 360 px | itinéraire de l'accueil expéditeur sur deux lignes |

Autres points :
- `viewport-fit=cover` ajouté aux écrans redessinés + accueil/connexion : la photo passe sous la barre d'état des iPhone à encoche (PWA installée) au lieu d'une bande claire.
- Les feuilles du bas corrigent leur hauteur du zoom (`calc(88dvh / var(--rs-z))`).
- Admin (`admin*.html`) non concerné (écrans bureau).
