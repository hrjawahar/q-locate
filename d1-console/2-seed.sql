INSERT OR IGNORE INTO admins (email, name, role) VALUES ('hrjawahar@gmail.com', 'Owner', 'owner');
INSERT OR IGNORE INTO categories (kind, slug, name, sort) VALUES
 ('vacation','hill-station','Hill station',1),
 ('vacation','beach','Beach',2),
 ('vacation','forest','Forest',3),
 ('vacation','waterfall','Waterfall',4),
 ('vacation','adventure','Adventure',5),
 ('vacation','leisure','Leisure',6),
 ('vacation','wildlife','Wildlife',7),
 ('vacation','heritage','Heritage',8),
 ('vacation','lake','Lake',9),
 ('vacation','island','Island',10),
 ('vacation','desert','Desert',11),
 ('vacation','snow','Snow',12),
 ('spiritual','temple','Temple',1),
 ('spiritual','hill-temple','Hill temple',2),
 ('spiritual','cave-temple','Cave temple',3),
 ('spiritual','shore-temple','Shore temple',4),
 ('spiritual','ashram','Ashram / Mutt',5),
 ('spiritual','jain-temple','Jain temple',6),
 ('spiritual','gurudwara','Gurudwara',7),
 ('spiritual','monastery','Monastery',8),
 ('spiritual','church','Church',9),
 ('spiritual','dargah','Dargah / Mosque',10);
INSERT OR IGNORE INTO circuits (slug, name, total_count) VALUES
 ('jyotirlinga','12 Jyotirlingas',12),
 ('divya-desam','108 Divya Desams',108),
 ('shakti-peetha','Shakti Peethas',NULL),
 ('arupadai-veedu','Arupadai Veedu (6 abodes of Murugan)',6),
 ('pancha-bhoota','Pancha Bhoota Sthalams',5),
 ('char-dham','Char Dham',4),
 ('navagraha','Navagraha Temples (Tamil Nadu)',9),
 ('pancha-sabhai','Pancha Sabhai',5);
INSERT OR IGNORE INTO places (kind, slug, name, alt_names, state, district_city, summary, highlights, access_effort, tags, status, verified_on) VALUES
 ('vacation','kodaikanal-tn','Kodaikanal','Kodai','Tamil Nadu','Dindigul','TEST entry - replace before launch',
  '["Hill station in the Palani Hills","Star-shaped Kodaikanal Lake at the town centre","Viewpoints: Coaker''s Walk, Pillar Rocks"]','drive_up','lake, viewpoints, cool climate','published',date('now')),
 ('vacation','varkala-kl','Varkala','Varkala Beach, Papanasam','Kerala','Thiruvananthapuram','TEST entry - replace before launch',
  '["Cliff-top beach on the Arabian Sea","Cafes along North Cliff","Papanasam beach below the cliff"]','short_walk','cliff, beach, sunset','draft',NULL),
 ('vacation','munnar-kl','Munnar',NULL,'Kerala','Idukki','TEST entry - replace before launch',
  '["Tea plantations across the hills","Eravikulam National Park nearby","Mattupetty Dam and lake"]','drive_up','tea, hills, wildlife','draft',NULL),
 ('spiritual','palani-murugan-tn','Arulmigu Dhandayuthapani Swamy Temple, Palani','Palani Murugan, Palani Malai','Tamil Nadu','Dindigul','TEST entry - replace before launch',
  '["One of the six Arupadai Veedu of Lord Murugan","Hilltop temple reached by steps, winch or rope car","Panchamirtham prasadam"]','steps_climb','murugan, hill temple, arupadai veedu','published',date('now')),
 ('spiritual','kapaleeshwarar-chennai','Arulmigu Kapaleeshwarar Temple','Kapaleeswarar, Mylapore temple','Tamil Nadu','Chennai','TEST entry - replace before launch',
  '["Shiva temple in Mylapore, Chennai","Tall Dravidian-style gopuram","Temple tank beside the temple"]','drive_up','shiva, mylapore','draft',NULL);
INSERT OR IGNORE INTO vacation_details (place_id, best_months, typical_visit)
 SELECT id, '3,4,5,9,10', '2_3_days' FROM places WHERE slug = 'kodaikanal-tn';
INSERT OR IGNORE INTO vacation_details (place_id, best_months, typical_visit)
 SELECT id, '10,11,12,1,2,3', '2_3_days' FROM places WHERE slug = 'varkala-kl';
INSERT OR IGNORE INTO vacation_details (place_id, best_months, typical_visit)
 SELECT id, '9,10,11,12,1,2,3', '2_3_days' FROM places WHERE slug = 'munnar-kl';
INSERT OR IGNORE INTO temple_details (place_id, main_deity, tradition)
 SELECT id, 'Murugan', 'Shaiva' FROM places WHERE slug = 'palani-murugan-tn';
INSERT OR IGNORE INTO temple_details (place_id, main_deity, tradition)
 SELECT id, 'Shiva', 'Shaiva' FROM places WHERE slug = 'kapaleeshwarar-chennai';
INSERT OR IGNORE INTO place_categories (place_id, category_id)
 SELECT p.id, c.id FROM places p JOIN categories c ON c.kind = p.kind
 WHERE (p.slug = 'kodaikanal-tn' AND c.slug IN ('hill-station','lake'))
    OR (p.slug = 'varkala-kl' AND c.slug = 'beach')
    OR (p.slug = 'munnar-kl' AND c.slug IN ('hill-station','wildlife'))
    OR (p.slug = 'palani-murugan-tn' AND c.slug = 'hill-temple')
    OR (p.slug = 'kapaleeshwarar-chennai' AND c.slug = 'temple');
INSERT OR IGNORE INTO place_circuits (place_id, circuit_id, position)
 SELECT p.id, c.id, 3 FROM places p, circuits c WHERE p.slug = 'palani-murugan-tn' AND c.slug = 'arupadai-veedu';
