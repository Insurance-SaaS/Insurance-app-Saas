-- SQL Script to generate 20 devis records with related data including products
-- This script assumes PostgreSQL syntax for UUID generation

-- First, insert the 7 available products
INSERT INTO products (id, type) VALUES
('450e8400-e29b-41d4-a716-446655440001', 'Assurance automobile'),
('450e8400-e29b-41d4-a716-446655440002', 'Assurance automobile avec option de paiement fractionné'),
('450e8400-e29b-41d4-a716-446655440003', 'Assurance habitation'),
('450e8400-e29b-41d4-a716-446655440004', 'Assurance scolaire'),
('450e8400-e29b-41d4-a716-446655440005', 'Assurance bateau de plaisance'),
('450e8400-e29b-41d4-a716-446655440006', 'Assurance catastrophes naturelles (CAT-NAT)'),
('450e8400-e29b-41d4-a716-446655440007', 'Assurance multirisques professionnelle (MRP)')
ON CONFLICT (id) DO NOTHING;

-- Insert summary_terms records
INSERT INTO summary_terms (id, "contractValidity", "cancelPolicy", "claimsProcessing", "docsStorage") VALUES
('550e8400-e29b-41d4-a716-446655440001', 'Contrat valide pendant 12 mois à compter de la signature', 'Annulation possible avec préavis de 30 jours', 'Réclamations traitées sous 24h avec service prioritaire', 'Documents stockés de manière sécurisée pendant 7 ans'),
('550e8400-e29b-41d4-a716-446655440002', 'Contrat valide pendant 12 mois avec renouvellement automatique', 'Annulation possible avec préavis de 60 jours', 'Réclamations traitées sous 72h ouvrables', 'Documents stockés pendant la durée du contrat plus 5 ans'),
('550e8400-e29b-41d4-a716-446655440003', 'Contrat valide pendant 24 mois avec révision annuelle', 'Annulation possible à tout moment avec préavis de 30 jours', 'Réclamations traitées sous 24h avec service prioritaire', 'Stockage sécurisé des documents pendant 10 ans'),
('550e8400-e29b-41d4-a716-446655440004', 'Contrat temporaire de 12 mois pour jeune conducteur', 'Annulation selon conditions générales', 'Réclamations traitées sous 48h ouvrables', 'Documents conservés pendant 5 ans minimum'),
('550e8400-e29b-41d4-a716-446655440005', 'Contrat valide pendant 18 mois avec options flexibles', 'Annulation possible avec préavis de 30 jours', 'Réclamations traitées sous 48h ouvrables', 'Archivage numérique sécurisé pendant 7 ans'),
('550e8400-e29b-41d4-a716-446655440006', 'Contrat spécial véhicule ancien - 12 mois', 'Résiliation possible à échéance annuelle', 'Réclamations traitées sous 72h avec expertise', 'Documents physiques et numériques stockés 5 ans'),
('550e8400-e29b-41d4-a716-446655440007', 'Contrat habitation 24 mois avec renouvellement', 'Annulation possible avec préavis de 2 mois', 'Service dédié habitation - traitement sous 48h', 'Documents conservés 10 ans minimum'),
('550e8400-e29b-41d4-a716-446655440008', 'Contrat scolaire annuel', 'Modification possible en cours année scolaire', 'Traitement prioritaire accidents scolaires', 'Archives scolaires conservées 5 ans'),
('550e8400-e29b-41d4-a716-446655440009', 'Contrat plaisance saison nautique', 'Hivernage avec suspension possible', 'Expertise maritime spécialisée sous 24h', 'Documents nautiques archivés 7 ans'),
('550e8400-e29b-41d4-a716-446655440010', 'Contrat catastrophes naturelles permanent', 'Pas annulation en période de crise', 'Cellule urgence catastrophes - immédiat', 'Conservation longue durée - 15 ans'),
('550e8400-e29b-41d4-a716-446655440011', 'Contrat professionnel avec garanties étendues', 'Modification activité avec avenant', 'Service entreprise dédié - 24h', 'Archivage professionnel 10 ans'),
('550e8400-e29b-41d4-a716-446655440012', 'Contrat auto fractionné 12 mois', 'Paiement échelonné - annulation flexible', 'Traitement standard sous 48h', 'Stockage documents 7 ans'),
('550e8400-e29b-41d4-a716-446655440013', 'Contrat habitation multirisques 24 mois', 'Préavis 3 mois pour résiliation', 'Service sinistres habitation spécialisé', 'Conservation digitale 12 ans'),
('550e8400-e29b-41d4-a716-446655440014', 'Contrat scolaire renforcé', 'Ajustement selon calendrier scolaire', 'Médiation scolaire disponible', 'Archives éducatives 7 ans'),
('550e8400-e29b-41d4-a716-446655440015', 'Contrat bateau course et régate', 'Suspension hors saison possible', 'Expertise compétition sous 12h', 'Documentation technique 10 ans'),
('550e8400-e29b-41d4-a716-446655440016', 'Contrat auto économique 12 mois', 'Conditions résiliation standard', 'Traitement réclamations 72h', 'Stockage minimal 5 ans'),
('550e8400-e29b-41d4-a716-446655440017', 'Contrat habitation étudiant', 'Flexibilité déménagement étudiant', 'Service jeune - traitement rapide', 'Archives courtes 3 ans'),
('550e8400-e29b-41d4-a716-446655440018', 'Contrat professionnel flotte', 'Gestion centralisée parc véhicules', 'Service entreprise prioritaire', 'Gestion documentaire centralisée'),
('550e8400-e29b-41d4-a716-446655440019', 'Contrat auto premium tous risques', 'Service client privilégié', 'Traitement VIP - immédiat', 'Archivage premium à vie'),
('550e8400-e29b-41d4-a716-446655440020', 'Contrat catastrophes entreprise', 'Continuité activité garantie', 'Cellule crise entreprise - H24', 'Sauvegarde données critiques')
ON CONFLICT (id) DO NOTHING;

-- Insert 20 devis records with productId references
-- Make devis seeding idempotent for base 20 set
INSERT INTO devis (id, title, "priceMonthly", deductible, "termMonths", "planType", "startCondition", "createdAt", "updatedAt", "summaryTermsId", "productId") VALUES
('650e8400-e29b-41d4-a716-446655440001', 'Auto Premium Tous Risques', 285.00, 400.00, 12, 'Premium', 'Véhicule récent moins de 5 ans', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440001', '450e8400-e29b-41d4-a716-446655440001'),
('650e8400-e29b-41d4-a716-446655440002', 'Auto Responsabilité Civile', 125.50, 750.00, 12, 'Basic', 'Conducteur expérimenté 3+ ans', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440002', '450e8400-e29b-41d4-a716-446655440001'),
('650e8400-e29b-41d4-a716-446655440003', 'Auto Paiement Fractionné Confort', 165.75, 600.00, 12, 'Standard', 'Paiement mensuel facilité', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440012', '450e8400-e29b-41d4-a716-446655440002'),
('650e8400-e29b-41d4-a716-446655440004', 'Auto Jeune Conducteur', 195.25, 1000.00, 12, 'Young', 'Conducteur 18-25 ans', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440004', '450e8400-e29b-41d4-a716-446655440001'),
('650e8400-e29b-41d4-a716-446655440005', 'Habitation Propriétaire', 145.80, 350.00, 24, 'Owner', 'Propriétaire résidence principale', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440007', '450e8400-e29b-41d4-a716-446655440003'),
('650e8400-e29b-41d4-a716-446655440006', 'Habitation Locataire', 89.30, 500.00, 12, 'Tenant', 'Locataire appartement/maison', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440013', '450e8400-e29b-41d4-a716-446655440003'),
('650e8400-e29b-41d4-a716-446655440007', 'Scolaire Primaire', 45.60, 150.00, 12, 'School', 'Élève école primaire', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440008', '450e8400-e29b-41d4-a716-446655440004'),
('650e8400-e29b-41d4-a716-446655440008', 'Scolaire Collège Lycée', 52.45, 200.00, 12, 'School', 'Élève secondaire', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440014', '450e8400-e29b-41d4-a716-446655440004'),
('650e8400-e29b-41d4-a716-446655440009', 'Bateau Plaisance Côtier', 198.90, 800.00, 12, 'Coastal', 'Navigation côtière moins de 6 milles', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440009', '450e8400-e29b-41d4-a716-446655440005'),
('650e8400-e29b-41d4-a716-446655440010', 'Bateau Hauturier', 315.75, 1200.00, 12, 'Offshore', 'Navigation hauturière sans limite', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440015', '450e8400-e29b-41d4-a716-446655440005'),
('650e8400-e29b-41d4-a716-446655440011', 'Catastrophes Naturelles Habitation', 78.40, 1500.00, 12, 'CatNat', 'Couverture événements climatiques', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440010', '450e8400-e29b-41d4-a716-446655440006'),
('650e8400-e29b-41d4-a716-446655440012', 'Catastrophes Naturelles Entreprise', 425.00, 2500.00, 12, 'CatNat', 'Protection activité professionnelle', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440020', '450e8400-e29b-41d4-a716-446655440006'),
('650e8400-e29b-41d4-a716-446655440013', 'Multirisques Pro Commerce', 310.90, 750.00, 12, 'Commercial', 'Commerce de détail', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440011', '450e8400-e29b-41d4-a716-446655440007'),
('650e8400-e29b-41d4-a716-446655440014', 'Multirisques Pro Artisan', 265.30, 600.00, 12, 'Artisan', 'Activité artisanale', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440018', '450e8400-e29b-41d4-a716-446655440007'),
('650e8400-e29b-41d4-a716-446655440015', 'Auto Économique', 98.99, 1200.00, 12, 'Economy', 'Couverture minimale légale', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440016', '450e8400-e29b-41d4-a716-446655440001'),
('650e8400-e29b-41d4-a716-446655440016', 'Auto Fractionné Premium', 245.50, 450.00, 12, 'Premium', 'Paiement étalé véhicule haut gamme', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440019', '450e8400-e29b-41d4-a716-446655440002'),
('650e8400-e29b-41d4-a716-446655440017', 'Habitation Étudiant', 65.75, 300.00, 12, 'Student', 'Logement étudiant', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440017', '450e8400-e29b-41d4-a716-446655440003'),
('650e8400-e29b-41d4-a716-446655440018', 'Multirisques Pro Libéral', 385.60, 500.00, 12, 'Liberal', 'Profession libérale', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440011', '450e8400-e29b-41d4-a716-446655440007'),
('650e8400-e29b-41d4-a716-446655440019', 'Bateau Course Régate', 425.80, 1000.00, 12, 'Racing', 'Voilier de compétition', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440015', '450e8400-e29b-41d4-a716-446655440005'),
('650e8400-e29b-41d4-a716-446655440020', 'Scolaire Université', 67.25, 250.00, 12, 'University', 'Étudiant universitaire', NOW(), NOW(), '550e8400-e29b-41d4-a716-446655440008', '450e8400-e29b-41d4-a716-446655440004')
ON CONFLICT (id) DO NOTHING;

-- Insert coverage details for each devis based on product type
INSERT INTO coverage_details (id, label, included, "devisId") VALUES
-- Auto Premium (Devis 1)
(gen_random_uuid(), 'Responsabilité civile', true, '650e8400-e29b-41d4-a716-446655440001'),
(gen_random_uuid(), 'Protection du conducteur', true, '650e8400-e29b-41d4-a716-446655440001'),
(gen_random_uuid(), 'Tous risques collision', true, '650e8400-e29b-41d4-a716-446655440001'),
(gen_random_uuid(), 'Vol et incendie', true, '650e8400-e29b-41d4-a716-446655440001'),
(gen_random_uuid(), 'Assistance 0km', true, '650e8400-e29b-41d4-a716-446655440001'),

-- Auto Basic (Devis 2)
(gen_random_uuid(), 'Responsabilité civile', true, '650e8400-e29b-41d4-a716-446655440002'),
(gen_random_uuid(), 'Protection du conducteur', false, '650e8400-e29b-41d4-a716-446655440002'),
(gen_random_uuid(), 'Assistance de base', true, '650e8400-e29b-41d4-a716-446655440002'),

-- Auto Fractionné (Devis 3)
(gen_random_uuid(), 'Responsabilité civile', true, '650e8400-e29b-41d4-a716-446655440003'),
(gen_random_uuid(), 'Dommages collision', true, '650e8400-e29b-41d4-a716-446655440003'),
(gen_random_uuid(), 'Paiement échelonné', true, '650e8400-e29b-41d4-a716-446655440003'),

-- Auto Jeune (Devis 4)
(gen_random_uuid(), 'Responsabilité civile', true, '650e8400-e29b-41d4-a716-446655440004'),
(gen_random_uuid(), 'Formation conduite défensive', true, '650e8400-e29b-41d4-a716-446655440004'),
(gen_random_uuid(), 'Accompagnement jeune conducteur', true, '650e8400-e29b-41d4-a716-446655440004'),

-- Habitation Propriétaire (Devis 5)
(gen_random_uuid(), 'Responsabilité civile vie privée', true, '650e8400-e29b-41d4-a716-446655440005'),
(gen_random_uuid(), 'Incendie explosion', true, '650e8400-e29b-41d4-a716-446655440005'),
(gen_random_uuid(), 'Dégâts des eaux', true, '650e8400-e29b-41d4-a716-446655440005'),
(gen_random_uuid(), 'Vol cambriolage', true, '650e8400-e29b-41d4-a716-446655440005'),
(gen_random_uuid(), 'Bris de glace', true, '650e8400-e29b-41d4-a716-446655440005'),

-- Habitation Locataire (Devis 6)
(gen_random_uuid(), 'Responsabilité locative', true, '650e8400-e29b-41d4-a716-446655440006'),
(gen_random_uuid(), 'Incendie explosion', true, '650e8400-e29b-41d4-a716-446655440006'),
(gen_random_uuid(), 'Dégâts des eaux', true, '650e8400-e29b-41d4-a716-446655440006'),
(gen_random_uuid(), 'Vol mobilier', true, '650e8400-e29b-41d4-a716-446655440006'),

-- Scolaire Primaire (Devis 7)
(gen_random_uuid(), 'Accidents scolaires', true, '650e8400-e29b-41d4-a716-446655440007'),
(gen_random_uuid(), 'Responsabilité civile enfant', true, '650e8400-e29b-41d4-a716-446655440007'),
(gen_random_uuid(), 'Activités périscolaires', true, '650e8400-e29b-41d4-a716-446655440007'),

-- Scolaire Secondaire (Devis 8)
(gen_random_uuid(), 'Accidents scolaires', true, '650e8400-e29b-41d4-a716-446655440008'),
(gen_random_uuid(), 'Responsabilité civile', true, '650e8400-e29b-41d4-a716-446655440008'),
(gen_random_uuid(), 'Activités sportives', true, '650e8400-e29b-41d4-a716-446655440008'),
(gen_random_uuid(), 'Stages et voyages', true, '650e8400-e29b-41d4-a716-446655440008'),

-- Bateau Côtier (Devis 9)
(gen_random_uuid(), 'Responsabilité civile navigation', true, '650e8400-e29b-41d4-a716-446655440009'),
(gen_random_uuid(), 'Corps de navire', true, '650e8400-e29b-41d4-a716-446655440009'),
(gen_random_uuid(), 'Assistance remorquage', true, '650e8400-e29b-41d4-a716-446655440009'),
(gen_random_uuid(), 'Équipements électroniques', true, '650e8400-e29b-41d4-a716-446655440009'),

-- Bateau Hauturier (Devis 10)
(gen_random_uuid(), 'Responsabilité civile illimitée', true, '650e8400-e29b-41d4-a716-446655440010'),
(gen_random_uuid(), 'Corps de navire valeur agréée', true, '650e8400-e29b-41d4-a716-446655440010'),
(gen_random_uuid(), 'Assistance internationale', true, '650e8400-e29b-41d4-a716-446655440010'),
(gen_random_uuid(), 'Rapatriement équipage', true, '650e8400-e29b-41d4-a716-446655440010'),

-- Continue with remaining devis (simplified for brevity)
(gen_random_uuid(), 'Tempête grêle', true, '650e8400-e29b-41d4-a716-446655440011'),
(gen_random_uuid(), 'Inondation', true, '650e8400-e29b-41d4-a716-446655440011'),

(gen_random_uuid(), 'Catastrophes entreprise', true, '650e8400-e29b-41d4-a716-446655440012'),
(gen_random_uuid(), 'Perte exploitation', true, '650e8400-e29b-41d4-a716-446655440012'),

(gen_random_uuid(), 'Responsabilité civile professionnelle', true, '650e8400-e29b-41d4-a716-446655440013'),
(gen_random_uuid(), 'Locaux professionnels', true, '650e8400-e29b-41d4-a716-446655440013'),
(gen_random_uuid(), 'Matériel professionnel', true, '650e8400-e29b-41d4-a716-446655440013'),

(gen_random_uuid(), 'RC exploitation artisan', true, '650e8400-e29b-41d4-a716-446655440014'),
(gen_random_uuid(), 'Outillage artisan', true, '650e8400-e29b-41d4-a716-446655440014'),

(gen_random_uuid(), 'Responsabilité civile minimale', true, '650e8400-e29b-41d4-a716-446655440015'),

(gen_random_uuid(), 'Tous risques premium', true, '650e8400-e29b-41d4-a716-446655440016'),
(gen_random_uuid(), 'Facilités de paiement', true, '650e8400-e29b-41d4-a716-446655440016'),

(gen_random_uuid(), 'Responsabilité locative étudiant', true, '650e8400-e29b-41d4-a716-446655440017'),
(gen_random_uuid(), 'Mobilier étudiant', true, '650e8400-e29b-41d4-a716-446655440017'),

(gen_random_uuid(), 'RC professionnelle libérale', true, '650e8400-e29b-41d4-a716-446655440018'),
(gen_random_uuid(), 'Protection juridique', true, '650e8400-e29b-41d4-a716-446655440018'),

(gen_random_uuid(), 'Responsabilité régate', true, '650e8400-e29b-41d4-a716-446655440019'),
(gen_random_uuid(), 'Matériel de course', true, '650e8400-e29b-41d4-a716-446655440019'),

(gen_random_uuid(), 'Accidents universitaires', true, '650e8400-e29b-41d4-a716-446655440020'),
(gen_random_uuid(), 'RC vie universitaire', true, '650e8400-e29b-41d4-a716-446655440020');

-- Insert payment options for each devis
INSERT INTO payments (id, type, amount, mode, "devisId") VALUES
-- Monthly payments for all devis
(gen_random_uuid(), 'monthly', 285.00, 'Carte de crédit', '650e8400-e29b-41d4-a716-446655440001'),
(gen_random_uuid(), 'monthly', 125.50, 'Prélèvement automatique', '650e8400-e29b-41d4-a716-446655440002'),
(gen_random_uuid(), 'monthly', 165.75, 'Paiement fractionné', '650e8400-e29b-41d4-a716-446655440003'),
(gen_random_uuid(), 'monthly', 195.25, 'Carte de débit', '650e8400-e29b-41d4-a716-446655440004'),
(gen_random_uuid(), 'monthly', 145.80, 'Virement bancaire', '650e8400-e29b-41d4-a716-446655440005'),
(gen_random_uuid(), 'monthly', 89.30, 'Prélèvement automatique', '650e8400-e29b-41d4-a716-446655440006'),
(gen_random_uuid(), 'monthly', 45.60, 'Virement', '650e8400-e29b-41d4-a716-446655440007'),
(gen_random_uuid(), 'monthly', 52.45, 'Carte', '650e8400-e29b-41d4-a716-446655440008'),
(gen_random_uuid(), 'monthly', 198.90, 'Virement bancaire', '650e8400-e29b-41d4-a716-446655440009'),
(gen_random_uuid(), 'monthly', 315.75, 'Virement bancaire', '650e8400-e29b-41d4-a716-446655440010'),
(gen_random_uuid(), 'monthly', 78.40, 'Prélèvement automatique', '650e8400-e29b-41d4-a716-446655440011'),
(gen_random_uuid(), 'monthly', 425.00, 'Virement entreprise', '650e8400-e29b-41d4-a716-446655440012'),
(gen_random_uuid(), 'monthly', 310.90, 'Prélèvement pro', '650e8400-e29b-41d4-a716-446655440013'),
(gen_random_uuid(), 'monthly', 265.30, 'Virement artisan', '650e8400-e29b-41d4-a716-446655440014'),
(gen_random_uuid(), 'monthly', 98.99, 'Carte de débit', '650e8400-e29b-41d4-a716-446655440015'),
(gen_random_uuid(), 'monthly', 245.50, 'Paiement échelonné', '650e8400-e29b-41d4-a716-446655440016'),
(gen_random_uuid(), 'monthly', 65.75, 'Virement étudiant', '650e8400-e29b-41d4-a716-446655440017'),
(gen_random_uuid(), 'monthly', 385.60, 'Virement professionnel', '650e8400-e29b-41d4-a716-446655440018'),
(gen_random_uuid(), 'monthly', 425.80, 'Virement bancaire', '650e8400-e29b-41d4-a716-446655440019'),
(gen_random_uuid(), 'monthly', 67.25, 'Carte étudiant', '650e8400-e29b-41d4-a716-446655440020'),

-- Annual payments (10% discount)
(gen_random_uuid(), 'annual', 3078.00, 'Virement bancaire', '650e8400-e29b-41d4-a716-446655440001'),
(gen_random_uuid(), 'annual', 1355.40, 'Chèque', '650e8400-e29b-41d4-a716-446655440002'),
(gen_random_uuid(), 'annual', 1790.10, 'Virement', '650e8400-e29b-41d4-a716-446655440003'),
(gen_random_uuid(), 'annual', 2108.70, 'Virement jeune', '650e8400-e29b-41d4-a716-446655440004'),
(gen_random_uuid(), 'annual', 3155.52, 'Virement', '650e8400-e29b-41d4-a716-446655440005'),
(gen_random_uuid(), 'annual', 964.44, 'Prélèvement', '650e8400-e29b-41d4-a716-446655440006'),
(gen_random_uuid(), 'annual', 492.48, 'Virement famille', '650e8400-e29b-41d4-a716-446655440007'),
(gen_random_uuid(), 'annual', 566.46, 'Virement famille', '650e8400-e29b-41d4-a716-446655440008'),
(gen_random_uuid(), 'annual', 2148.12, 'Virement', '650e8400-e29b-41d4-a716-446655440009'),
(gen_random_uuid(), 'annual', 3409.10, 'Virement', '650e8400-e29b-41d4-a716-446655440010'),
(gen_random_uuid(), 'annual', 846.72, 'Prélèvement', '650e8400-e29b-41d4-a716-446655440011'),
(gen_random_uuid(), 'annual', 4590.00, 'Virement entreprise', '650e8400-e29b-41d4-a716-446655440012'),
(gen_random_uuid(), 'annual', 3357.72, 'Virement pro', '650e8400-e29b-41d4-a716-446655440013'),
(gen_random_uuid(), 'annual', 2865.24, 'Virement artisan', '650e8400-e29b-41d4-a716-446655440014'),
(gen_random_uuid(), 'annual', 1068.89, 'Chèque', '650e8400-e29b-41d4-a716-446655440015'),
(gen_random_uuid(), 'annual', 2651.40, 'Paiement unique', '650e8400-e29b-41d4-a716-446655440016'),
(gen_random_uuid(), 'annual', 710.10, 'Virement étudiant', '650e8400-e29b-41d4-a716-446655440017'),
(gen_random_uuid(), 'annual', 4164.48, 'Virement professionnel', '650e8400-e29b-41d4-a716-446655440018'),
(gen_random_uuid(), 'annual', 4598.64, 'Virement', '650e8400-e29b-41d4-a716-446655440019'),
(gen_random_uuid(), 'annual', 726.30, 'Virement étudiant', '650e8400-e29b-41d4-a716-446655440020');

-- Quarterly payments for habitation (24 months contracts) and professional contracts
INSERT INTO payments (id, type, amount, mode, "devisId") VALUES
(gen_random_uuid(), 'quarterly', 424.26, 'Prélèvement automatique', '650e8400-e29b-41d4-a716-446655440005'),
(gen_random_uuid(), 'quarterly', 260.33, 'Prélèvement automatique', '650e8400-e29b-41d4-a716-446655440006'),
(gen_random_uuid(), 'quarterly', 906.62, 'Virement pro', '650e8400-e29b-41d4-a716-446655440013'),
(gen_random_uuid(), 'quarterly', 773.42, 'Virement artisan', '650e8400-e29b-41d4-a716-446655440014'),
(gen_random_uuid(), 'quarterly', 1124.59, 'Virement professionnel', '650e8400-e29b-41d4-a716-446655440018');

-- Semi-annual payments for premium contracts and boats
INSERT INTO payments (id, type, amount, mode, "devisId") VALUES
(gen_random_uuid(), 'semi-annual', 1624.50, 'Virement bancaire', '650e8400-e29b-41d4-a716-446655440001'),
(gen_random_uuid(), 'semi-annual', 1131.51, 'Virement', '650e8400-e29b-41d4-a716-446655440009'),
(gen_random_uuid(), 'semi-annual', 1798.05, 'Virement', '650e8400-e29b-41d4-a716-446655440010'),
(gen_random_uuid(), 'semi-annual', 1398.30, 'Paiement échelonné', '650e8400-e29b-41d4-a716-446655440016'),
(gen_random_uuid(), 'semi-annual', 2425.44, 'Virement', '650e8400-e29b-41d4-a716-446655440019');

-- Verification queries (optional - uncomment to use)
/*
SELECT 'Données créées avec succès:' as message;
SELECT 'Produits:' as table_name, COUNT(*) as count FROM products
UNION ALL
SELECT 'Termes contractuels:', COUNT(*) FROM summary_terms  
UNION ALL
SELECT 'Devis:', COUNT(*) FROM devis
UNION ALL
SELECT 'Détails couverture:', COUNT(*) FROM coverage_details
UNION ALL
SELECT 'Options de paiement:', COUNT(*) FROM payments;

-- Vérification des relations
SELECT 
    p.type as produit,
    COUNT(d.id) as nombre_devis
FROM products p
LEFT JOIN devis d ON p.id = d."productId"
GROUP BY p.type, p.id
ORDER BY nombre_devis DESC;

-- Exemple de devis complet avec toutes les relations
SELECT 
    d.title,
    d."priceMonthly",
    d."planType",
    p.type as produit,
    st."contractValidity",
    COUNT(cd.id) as nb_couvertures,
    COUNT(pay.id) as nb_paiements
FROM devis d
LEFT JOIN products p ON d."productId" = p.id
LEFT JOIN summary_terms st ON d."summaryTermsId" = st.id
LEFT JOIN coverage_details cd ON d.id = cd."devisId"
LEFT JOIN payments pay ON d.id = pay."devisId"
GROUP BY d.id, d.title, d."priceMonthly", d."planType", p.type, st."contractValidity"
ORDER BY d.title
LIMIT 10;
*/   

-- ------------------------------------------------------------
-- DZ DATA: Append 40 new Algerian devis tied to the 7 products
-- Titles prefixed by 'DZ - ' so we can reference them below
-- Product types are FIXED and referenced by name → productId via JOIN
-- ------------------------------------------------------------
INSERT INTO devis (id, title, "priceMonthly", deductible, "termMonths", "planType", "startCondition", "createdAt", "updatedAt", "summaryTermsId", "productId")
SELECT r.id, r.title, r."priceMonthly", r.deductible, r."termMonths", r."planType", r."startCondition", NOW(), NOW(), (r.summary_terms_ref)::uuid, p.id
FROM (
  VALUES
  (gen_random_uuid(), 'DZ - Auto Tous Risques - Alger',               14500.00, 60000.00, 12, 'Premium',  'Véhicule récent, immatriculé à Alger (16)',             '550e8400-e29b-41d4-a716-446655440019', 'Assurance automobile'),
  (gen_random_uuid(), 'DZ - Auto RC - Oran',                          6200.00,  120000.00, 12, 'Basic',    'Conducteur expérimenté, Oran (31)',                      '550e8400-e29b-41d4-a716-446655440016', 'Assurance automobile'),
  (gen_random_uuid(), 'DZ - Auto Jeune - Constantine',                8900.00,  160000.00, 12, 'Young',    'Jeune conducteur, Constantine (25)',                     '550e8400-e29b-41d4-a716-446655440004', 'Assurance automobile'),
  (gen_random_uuid(), 'DZ - Auto Économique - Blida',                 5200.00,  140000.00, 12, 'Economy',  'Couverture minimale, Blida (09)',                        '550e8400-e29b-41d4-a716-446655440016', 'Assurance automobile'),
  (gen_random_uuid(), 'DZ - Auto Paiement Fractionné - Alger',        9800.00,  90000.00,  12, 'Standard', 'Paiement mensuel échelonné, Alger (16)',                 '550e8400-e29b-41d4-a716-446655440012', 'Assurance automobile avec option de paiement fractionné'),
  (gen_random_uuid(), 'DZ - Auto Premium Fractionné - Oran',          13200.00, 70000.00,  12, 'Premium',  'Fractionné, véhicule haut de gamme, Oran (31)',          '550e8400-e29b-41d4-a716-446655440019', 'Assurance automobile avec option de paiement fractionné'),
  (gen_random_uuid(), 'DZ - Habitation Propriétaire - Alger Centre',  6800.00,  50000.00,  24, 'Owner',    'Appartement F3, Alger-Centre',                           '550e8400-e29b-41d4-a716-446655440007', 'Assurance habitation'),
  (gen_random_uuid(), 'DZ - Habitation Locataire - Oran Es-Senia',    4300.00,  70000.00,  12, 'Tenant',   'Locataire F2, Es-Senia',                                 '550e8400-e29b-41d4-a716-446655440013', 'Assurance habitation'),
  (gen_random_uuid(), 'DZ - Habitation Étudiant - Constantine',       3200.00,  45000.00,  12, 'Student',  'Studio près de l''université Mentouri',                  '550e8400-e29b-41d4-a716-446655440017', 'Assurance habitation'),
  (gen_random_uuid(), 'DZ - Scolaire Primaire - Alger',               1100.00,  20000.00,  12, 'School',   'Élève primaire, Alger',                                  '550e8400-e29b-41d4-a716-446655440008', 'Assurance scolaire'),
  (gen_random_uuid(), 'DZ - Scolaire Collège - Blida',                1250.00,  25000.00,  12, 'School',   'Collégien, Blida',                                       '550e8400-e29b-41d4-a716-446655440014', 'Assurance scolaire'),
  (gen_random_uuid(), 'DZ - Scolaire Lycée - Oran',                   1380.00,  25000.00,  12, 'School',   'Lycéen, Oran',                                           '550e8400-e29b-41d4-a716-446655440014', 'Assurance scolaire'),
  (gen_random_uuid(), 'DZ - Scolaire Université - Tlemcen',           1650.00,  30000.00,  12, 'University','Étudiant LMD, Tlemcen',                                 '550e8400-e29b-41d4-a716-446655440008', 'Assurance scolaire'),
  (gen_random_uuid(), 'DZ - Bateau Côtier - Annaba',                  9800.00,  150000.00, 12, 'Coastal',  'Navigation côtière Annaba',                              '550e8400-e29b-41d4-a716-446655440009', 'Assurance bateau de plaisance'),
  (gen_random_uuid(), 'DZ - Bateau Hauturier - Bejaïa',               14800.00, 220000.00, 12, 'Offshore', 'Navigation hauturière Bejaïa',                           '550e8400-e29b-41d4-a716-446655440015', 'Assurance bateau de plaisance'),
  (gen_random_uuid(), 'DZ - CAT-NAT Habitation - Jijel',              3600.00,  180000.00, 12, 'CatNat',   'Zone inondable, Jijel',                                   '550e8400-e29b-41d4-a716-446655440010', 'Assurance catastrophes naturelles (CAT-NAT)'),
  (gen_random_uuid(), 'DZ - CAT-NAT Entreprise - Skikda',             16800.00, 300000.00, 12, 'CatNat',   'Site industriel, Skikda',                                '550e8400-e29b-41d4-a716-446655440020', 'Assurance catastrophes naturelles (CAT-NAT)'),
  (gen_random_uuid(), 'DZ - MRP Commerce - Alger Bab Ezzouar',        15200.00, 120000.00, 12, 'Commercial','Boutique prêt-à-porter, Bab Ezzouar',                   '550e8400-e29b-41d4-a716-446655440011', 'Assurance multirisques professionnelle (MRP)'),
  (gen_random_uuid(), 'DZ - MRP Artisan - Tizi Ouzou',                11900.00, 100000.00, 12, 'Artisan',  'Atelier menuiserie, Tizi Ouzou',                         '550e8400-e29b-41d4-a716-446655440018', 'Assurance multirisques professionnelle (MRP)'),
  (gen_random_uuid(), 'DZ - MRP Profession Libérale - Oran',          13400.00, 90000.00,  12, 'Liberal',  'Cabinet médical, Oran',                                  '550e8400-e29b-41d4-a716-446655440011', 'Assurance multirisques professionnelle (MRP)'),
  (gen_random_uuid(), 'DZ - Auto Tous Risques - Tipaza',              13200.00, 70000.00,  12, 'Premium',  'Véhicule familial, Tipaza (42)',                         '550e8400-e29b-41d4-a716-446655440001', 'Assurance automobile'),
  (gen_random_uuid(), 'DZ - Auto RC - Tiaret',                        5700.00,  130000.00, 12, 'Basic',    'Trajet-travail, Tiaret (14)',                            '550e8400-e29b-41d4-a716-446655440016', 'Assurance automobile'),
  (gen_random_uuid(), 'DZ - Auto Jeune - Sétif',                      8600.00,  150000.00, 12, 'Young',    'Permis < 2 ans, Sétif (19)',                             '550e8400-e29b-41d4-a716-446655440004', 'Assurance automobile'),
  (gen_random_uuid(), 'DZ - Auto Économie - Adrar',                   4800.00,  150000.00, 12, 'Economy',  'Usage limité, Adrar (01)',                               '550e8400-e29b-41d4-a716-446655440016', 'Assurance automobile'),
  (gen_random_uuid(), 'DZ - Habitation Propriétaire - Oran Canastel', 6100.00,  50000.00,  24, 'Owner',    'Maison R+1, Canastel',                                   '550e8400-e29b-41d4-a716-446655440007', 'Assurance habitation'),
  (gen_random_uuid(), 'DZ - Habitation Locataire - Béchar',           3700.00,  65000.00,  12, 'Tenant',   'Locataire F3, Béchar (08)',                              '550e8400-e29b-41d4-a716-446655440013', 'Assurance habitation'),
  (gen_random_uuid(), 'DZ - Scolaire Primaire - Batna',               1050.00,  20000.00,  12, 'School',   'Élève primaire, Batna (05)',                             '550e8400-e29b-41d4-a716-446655440008', 'Assurance scolaire'),
  (gen_random_uuid(), 'DZ - Scolaire Collège - Tlemcen',              1220.00,  25000.00,  12, 'School',   'Collégien, Tlemcen (13)',                                '550e8400-e29b-41d4-a716-446655440014', 'Assurance scolaire'),
  (gen_random_uuid(), 'DZ - Bateau Côtier - Mostaganem',              9100.00,  150000.00, 12, 'Coastal',  'Plaisance, Mostaganem (27)',                             '550e8400-e29b-41d4-a716-446655440009', 'Assurance bateau de plaisance'),
  (gen_random_uuid(), 'DZ - Bateau Hauturier - Oran Mers El-Kebir',   15300.00, 230000.00, 12, 'Offshore', 'Hauturier, Mers El-Kebir',                                '550e8400-e29b-41d4-a716-446655440015', 'Assurance bateau de plaisance'),
  (gen_random_uuid(), 'DZ - CAT-NAT Habitation - Chlef',              3400.00,  170000.00, 12, 'CatNat',   'Zone sismique modérée, Chlef',                           '550e8400-e29b-41d4-a716-446655440010', 'Assurance catastrophes naturelles (CAT-NAT)'),
  (gen_random_uuid(), 'DZ - CAT-NAT Entreprise - Blida',              16200.00, 280000.00, 12, 'CatNat',   'Parc industriel Blida',                                  '550e8400-e29b-41d4-a716-446655440020', 'Assurance catastrophes naturelles (CAT-NAT)'),
  (gen_random_uuid(), 'DZ - MRP Commerce - Sétif',                    14500.00, 110000.00, 12, 'Commercial','Superette de quartier, Sétif',                          '550e8400-e29b-41d4-a716-446655440011', 'Assurance multirisques professionnelle (MRP)'),
  (gen_random_uuid(), 'DZ - MRP Artisan - Béjaïa',                    11800.00, 100000.00, 12, 'Artisan',  'Atelier mécanique, Béjaïa',                              '550e8400-e29b-41d4-a716-446655440018', 'Assurance multirisques professionnelle (MRP)'),
  (gen_random_uuid(), 'DZ - MRP Prof Libérale - Alger Hydra',         13900.00, 95000.00,  12, 'Liberal',  'Cabinet d''avocats, Hydra',                               '550e8400-e29b-41d4-a716-446655440011', 'Assurance multirisques professionnelle (MRP)'),
  (gen_random_uuid(), 'DZ - Auto Tous Risques - Sidi Bel Abbès',      12800.00, 80000.00,  12, 'Premium',  'Usage mixte, Sidi Bel Abbès',                            '550e8400-e29b-41d4-a716-446655440001', 'Assurance automobile'),
  (gen_random_uuid(), 'DZ - Auto RC - Guelma',                        5400.00,  130000.00, 12, 'Basic',    'Usage urbain, Guelma',                                   '550e8400-e29b-41d4-a716-446655440016', 'Assurance automobile'),
  (gen_random_uuid(), 'DZ - Habitation Propriétaire - Tizi Ouzou',    5900.00,  50000.00,  24, 'Owner',    'Maison individuelle, Tizi Ouzou',                        '550e8400-e29b-41d4-a716-446655440007', 'Assurance habitation'),
  (gen_random_uuid(), 'DZ - Habitation Locataire - Annaba',           4100.00,  65000.00,  12, 'Tenant',   'Locataire F2, Annaba',                                   '550e8400-e29b-41d4-a716-446655440013', 'Assurance habitation'),
  (gen_random_uuid(), 'DZ - Scolaire Université - Oran USTO',         1700.00,  30000.00,  12, 'University','Étudiant USTO, Oran',                                   '550e8400-e29b-41d4-a716-446655440008', 'Assurance scolaire'),
  (gen_random_uuid(), 'DZ - Bateau Côtier - Tipaza',                  9400.00,  150000.00, 12, 'Coastal',  'Plaisance, Tipaza',                                     '550e8400-e29b-41d4-a716-446655440009', 'Assurance bateau de plaisance'),
  (gen_random_uuid(), 'DZ - CAT-NAT Habitation - Béchar',             3200.00,  160000.00, 12, 'CatNat',   'Climat aride, Béchar',                                   '550e8400-e29b-41d4-a716-446655440010', 'Assurance catastrophes naturelles (CAT-NAT)'),
  (gen_random_uuid(), 'DZ - MRP Commerce - Oran Akid Lotfi',          15000.00, 120000.00, 12, 'Commercial','Électronique, Akid Lotfi',                              '550e8400-e29b-41d4-a716-446655440011', 'Assurance multirisques professionnelle (MRP)')
) AS r(id, title, "priceMonthly", deductible, "termMonths", "planType", "startCondition", summary_terms_ref, product_type)
JOIN products p ON p.type = r.product_type;

-- ------------------------------------------------------------
-- DZ COVERAGE: Basic coverage per product type for the 40 DZ devis
-- ------------------------------------------------------------
-- Auto coverage (all DZ Auto)
INSERT INTO coverage_details (id, label, included, "devisId")
SELECT gen_random_uuid(), 'Responsabilité civile', true, d.id
FROM devis d
JOIN products p ON p.id = d."productId" AND p.type = 'Assurance automobile'
WHERE d.title LIKE 'DZ - %';

INSERT INTO coverage_details (id, label, included, "devisId")
SELECT gen_random_uuid(), 'Assistance 0km', (LOWER(d."planType") = 'premium'), d.id
FROM devis d
JOIN products p ON p.id = d."productId" AND p.type = 'Assurance automobile'
WHERE d.title LIKE 'DZ - %';

-- Auto fractionné: mention du paiement échelonné
INSERT INTO coverage_details (id, label, included, "devisId")
SELECT gen_random_uuid(), 'Paiement échelonné', true, d.id
FROM devis d
JOIN products p ON p.id = d."productId" AND p.type = 'Assurance automobile avec option de paiement fractionné'
WHERE d.title LIKE 'DZ - %';

-- Habitation
INSERT INTO coverage_details (id, label, included, "devisId")
SELECT gen_random_uuid(), 'Incendie et dégâts des eaux', true, d.id
FROM devis d
JOIN products p ON p.id = d."productId" AND p.type = 'Assurance habitation'
WHERE d.title LIKE 'DZ - %';

-- Scolaire
INSERT INTO coverage_details (id, label, included, "devisId")
SELECT gen_random_uuid(), 'Accidents scolaires', true, d.id
FROM devis d
JOIN products p ON p.id = d."productId" AND p.type = 'Assurance scolaire'
WHERE d.title LIKE 'DZ - %';

-- Bateau
INSERT INTO coverage_details (id, label, included, "devisId")
SELECT gen_random_uuid(), 'Assistance remorquage', true, d.id
FROM devis d
JOIN products p ON p.id = d."productId" AND p.type = 'Assurance bateau de plaisance'
WHERE d.title LIKE 'DZ - %';

-- CAT-NAT
INSERT INTO coverage_details (id, label, included, "devisId")
SELECT gen_random_uuid(), 'Inondation et séismes', true, d.id
FROM devis d
JOIN products p ON p.id = d."productId" AND p.type = 'Assurance catastrophes naturelles (CAT-NAT)'
WHERE d.title LIKE 'DZ - %';

-- MRP
INSERT INTO coverage_details (id, label, included, "devisId")
SELECT gen_random_uuid(), 'Responsabilité civile professionnelle', true, d.id
FROM devis d
JOIN products p ON p.id = d."productId" AND p.type = 'Assurance multirisques professionnelle (MRP)'
WHERE d.title LIKE 'DZ - %';

-- ------------------------------------------------------------
-- DZ PAYMENTS: Monthly and Annual for all DZ devis
-- Annual = 12 * monthly * 0.90
-- Quarterly for habitation (24 months) and MRP
-- ------------------------------------------------------------
INSERT INTO payments (id, type, amount, mode, "devisId")
SELECT gen_random_uuid(), 'monthly', d."priceMonthly", 'Virement bancaire DZ', d.id
FROM devis d
WHERE d.title LIKE 'DZ - %';

INSERT INTO payments (id, type, amount, mode, "devisId")
SELECT gen_random_uuid(), 'annual', ROUND(d."priceMonthly" * 12 * 0.9, 2), 'Virement unique DZ', d.id
FROM devis d
WHERE d.title LIKE 'DZ - %';

INSERT INTO payments (id, type, amount, mode, "devisId")
SELECT gen_random_uuid(), 'quarterly', ROUND(d."priceMonthly" * 3 * 0.95, 2), 'Prélèvement trimestriel DZ', d.id
FROM devis d
JOIN products p ON p.id = d."productId"
WHERE d.title LIKE 'DZ - %'
  AND (
    (p.type = 'Assurance habitation' AND d."termMonths" = 24)
    OR p.type = 'Assurance multirisques professionnelle (MRP)'
  );

-- ------------------------------------------------------------
-- EXPERTS: Seed Algerian claim experts
-- Table: experts (id uuid, fullName, email, phoneNumber)
-- ------------------------------------------------------------
INSERT INTO experts (id, "fullName", email, "phoneNumber") VALUES
  (gen_random_uuid(), 'Karim Bensaïd',       'karim.bensaid@experts-dz.com',      '+213 550 12 34 56'),
  (gen_random_uuid(), 'Nadia Toumi',         'nadia.toumi@experts-dz.com',        '+213 551 23 45 67'),
  (gen_random_uuid(), 'Yacine Boukhalfa',    'yacine.boukhalfa@experts-dz.com',   '+213 552 34 56 78'),
  (gen_random_uuid(), 'Samir Mezhoud',       'samir.mezhoud@experts-dz.com',      '+213 553 45 67 89'),
  (gen_random_uuid(), 'Amina Khellaf',       'amina.khellaf@experts-dz.com',      '+213 554 56 78 90'),
  (gen_random_uuid(), 'Rachid Djemai',       'rachid.djemai@experts-dz.com',      '+213 555 67 89 01'),
  (gen_random_uuid(), 'Lina Boudiaf',        'lina.boudiaf@experts-dz.com',       '+213 556 78 90 12'),
  (gen_random_uuid(), 'Mourad Kaci',         'mourad.kaci@experts-dz.com',        '+213 557 89 01 23'),
  (gen_random_uuid(), 'Hind Merabet',        'hind.merabet@experts-dz.com',       '+213 558 90 12 34'),
  (gen_random_uuid(), 'Farid Belkacem',      'farid.belkacem@experts-dz.com',     '+213 559 01 23 45'),
  (gen_random_uuid(), 'Sofiane Amrani',      'sofiane.amrani@experts-dz.com',     '+213 560 12 34 56'),
  (gen_random_uuid(), 'Imène Cheriet',       'imene.cheriet@experts-dz.com',      '+213 561 23 45 67');
