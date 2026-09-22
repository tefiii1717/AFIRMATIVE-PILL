-- =============================================================================
-- Afirmative Pill · SEED (generado por backend/scripts/generate-seed.ts)
-- Fuente: supabase/dataset/medications.csv (50 medicamentos)
-- NO editar a mano: modifica el CSV y ejecuta `npm run db:generate-seed`.
-- =============================================================================

begin;

-- 1. WRITE MODEL ---------------------------------------------------------------
insert into write_model.laboratories (name, country) values
  ('Haleon (GSK)', 'Reino Unido'),
  ('Tecnoquímicas', 'Colombia'),
  ('Haleon (Pfizer)', 'Estados Unidos'),
  ('Genfar', 'Colombia'),
  ('Bayer', 'Alemania'),
  ('Sanofi', 'Francia'),
  ('Procaps', 'Colombia'),
  ('Lafrancol', 'Colombia'),
  ('Merck KGaA', 'Alemania'),
  ('MSD', 'Estados Unidos'),
  ('Pfizer', 'Estados Unidos'),
  ('AstraZeneca', 'Reino Unido'),
  ('GSK', 'Reino Unido'),
  ('Roche', 'Suiza')
on conflict (name) do nothing;

insert into write_model.therapeutic_categories (name, slug, description) values
  ('Analgésicos y antipiréticos', 'analgesicos-y-antipireticos', 'Alivio del dolor y control de la fiebre.'),
  ('Antiinflamatorios no esteroideos', 'antiinflamatorios-no-esteroideos', 'AINE para dolor e inflamación.'),
  ('Cardiovascular - antiagregantes', 'cardiovascular-antiagregantes', 'Prevención de eventos trombóticos arteriales.'),
  ('Gastrointestinales', 'gastrointestinales', 'Acidez, reflujo, espasmos y trastornos digestivos.'),
  ('Antibióticos', 'antibioticos', 'Tratamiento de infecciones bacterianas. Requieren fórmula médica.'),
  ('Antihipertensivos', 'antihipertensivos', 'Control de la presión arterial.'),
  ('Antidiabéticos', 'antidiabeticos', 'Control glucémico en diabetes mellitus.'),
  ('Hipolipemiantes', 'hipolipemiantes', 'Control del colesterol y los triglicéridos.'),
  ('Antihistamínicos', 'antihistaminicos', 'Manejo de alergias y urticaria.'),
  ('Respiratorios', 'respiratorios', 'Asma, EPOC y enfermedades de las vías respiratorias.'),
  ('Sistema nervioso central', 'sistema-nervioso-central', 'Antidepresivos, ansiolíticos y anticonvulsivantes.'),
  ('Anticoagulantes', 'anticoagulantes', 'Prevención y tratamiento de trombosis venosa.'),
  ('Hormonas y tiroides', 'hormonas-y-tiroides', 'Terapia hormonal y corticoides.'),
  ('Vitaminas y suplementos', 'vitaminas-y-suplementos', 'Suplementación vitamínica y mineral.'),
  ('Dermatológicos', 'dermatologicos', 'Tratamientos tópicos para afecciones de la piel.')
on conflict (name) do nothing;

insert into write_model.medications
  (sku, commercial_name, active_ingredient, concentration, dosage_form, presentation,
   laboratory_id, category_id, price, stock, requires_prescription, indications, contraindications)
select v.sku, v.commercial_name, v.active_ingredient, v.concentration, v.dosage_form, v.presentation,
       l.id, c.id, v.price, v.stock, v.requires_prescription, v.indications, v.contraindications
from (values
  ('AP-001', 'Dolex', 'Acetaminofén', '500 mg', 'Tableta recubierta', 'Caja x 24 tabletas', 'Haleon (GSK)', 'Analgésicos y antipiréticos', 12900.00::numeric, 180, false, 'Alivio del dolor leve a moderado y reducción de la fiebre.', 'Hipersensibilidad al acetaminofén; insuficiencia hepática grave.'),
  ('AP-002', 'Acetaminofén MK', 'Acetaminofén', '500 mg', 'Tableta', 'Caja x 100 tabletas', 'Tecnoquímicas', 'Analgésicos y antipiréticos', 9800.00::numeric, 250, false, 'Dolor leve a moderado (cefalea; dolor dental; dolor muscular) y fiebre.', 'Hipersensibilidad al principio activo; enfermedad hepática activa.'),
  ('AP-003', 'Advil Max', 'Ibuprofeno', '400 mg', 'Cápsula blanda', 'Caja x 10 cápsulas líquidas', 'Haleon (Pfizer)', 'Antiinflamatorios no esteroideos', 15500.00::numeric, 140, false, 'Dolor de cabeza; dolor menstrual; dolor muscular y fiebre.', 'Úlcera péptica activa; tercer trimestre de embarazo; alergia a AINE.'),
  ('AP-004', 'Ibuprofeno Genfar', 'Ibuprofeno', '800 mg', 'Tableta recubierta', 'Caja x 30 tabletas', 'Genfar', 'Antiinflamatorios no esteroideos', 11200.00::numeric, 95, true, 'Artritis reumatoide; osteoartritis y dolor inflamatorio moderado a severo.', 'Úlcera gastroduodenal; insuficiencia renal grave; alergia a AINE.'),
  ('AP-005', 'Naproxeno Sódico MK', 'Naproxeno sódico', '550 mg', 'Tableta recubierta', 'Caja x 10 tabletas', 'Tecnoquímicas', 'Antiinflamatorios no esteroideos', 8700.00::numeric, 120, true, 'Dolor agudo; dismenorrea; procesos inflamatorios musculoesqueléticos.', 'Sangrado gastrointestinal; insuficiencia cardiaca grave; embarazo.'),
  ('AP-006', 'Aspirina Protect', 'Ácido acetilsalicílico', '100 mg', 'Tableta con recubrimiento entérico', 'Caja x 28 tabletas', 'Bayer', 'Cardiovascular - antiagregantes', 9900.00::numeric, 210, false, 'Prevención secundaria de infarto de miocardio y accidente cerebrovascular.', 'Hemofilia; úlcera activa; menores de 16 años con cuadros virales.'),
  ('AP-007', 'Diclofenaco Genfar', 'Diclofenaco sódico', '50 mg', 'Tableta recubierta', 'Caja x 30 tabletas', 'Genfar', 'Antiinflamatorios no esteroideos', 6500.00::numeric, 160, true, 'Dolor e inflamación en enfermedades reumáticas y lesiones musculares.', 'Úlcera péptica; insuficiencia cardiaca; enfermedad renal grave.'),
  ('AP-008', 'Buscapina', 'Butilbromuro de hioscina', '10 mg', 'Gragea', 'Caja x 20 grageas', 'Sanofi', 'Gastrointestinales', 18900.00::numeric, 130, false, 'Dolor abdominal tipo cólico y espasmos gastrointestinales.', 'Glaucoma de ángulo cerrado; miastenia gravis; megacolon.'),
  ('AP-009', 'Amoxicilina Genfar', 'Amoxicilina', '500 mg', 'Cápsula', 'Caja x 50 cápsulas', 'Genfar', 'Antibióticos', 21500.00::numeric, 110, true, 'Infecciones respiratorias; otitis; infecciones urinarias por gérmenes sensibles.', 'Alergia a penicilinas o cefalosporinas.'),
  ('AP-010', 'Azitromicina MK', 'Azitromicina', '500 mg', 'Tableta recubierta', 'Caja x 3 tabletas', 'Tecnoquímicas', 'Antibióticos', 16800.00::numeric, 85, true, 'Infecciones respiratorias altas y bajas; infecciones de piel y tejidos blandos.', 'Hipersensibilidad a macrólidos; disfunción hepática con uso previo.'),
  ('AP-011', 'Cefalexina Genfar', 'Cefalexina', '500 mg', 'Cápsula', 'Caja x 20 cápsulas', 'Genfar', 'Antibióticos', 17500.00::numeric, 70, true, 'Infecciones de piel; vías urinarias y tracto respiratorio.', 'Alergia a cefalosporinas.'),
  ('AP-012', 'Ciprofloxacino Genfar', 'Ciprofloxacino', '500 mg', 'Tableta recubierta', 'Caja x 10 tabletas', 'Genfar', 'Antibióticos', 9800.00::numeric, 90, true, 'Infecciones urinarias complicadas; gastroenteritis bacteriana.', 'Uso concomitante con tizanidina; menores de 18 años; tendinopatías previas.'),
  ('AP-013', 'Clindamicina Procaps', 'Clindamicina', '300 mg', 'Cápsula', 'Caja x 16 cápsulas', 'Procaps', 'Antibióticos', 32500.00::numeric, 40, true, 'Infecciones graves por anaerobios; infecciones de piel y hueso.', 'Antecedente de colitis pseudomembranosa; hipersensibilidad a lincosamidas.'),
  ('AP-014', 'Losartán Genfar', 'Losartán potásico', '50 mg', 'Tableta recubierta', 'Caja x 30 tabletas', 'Genfar', 'Antihipertensivos', 8900.00::numeric, 300, true, 'Hipertensión arterial; nefropatía diabética en pacientes hipertensos.', 'Embarazo; uso con aliskireno en diabéticos.'),
  ('AP-015', 'Enalapril MK', 'Enalapril maleato', '20 mg', 'Tableta', 'Caja x 30 tabletas', 'Tecnoquímicas', 'Antihipertensivos', 7200.00::numeric, 220, true, 'Hipertensión arterial e insuficiencia cardiaca.', 'Angioedema previo; embarazo; estenosis bilateral de arteria renal.'),
  ('AP-016', 'Amlodipino Lafrancol', 'Amlodipino', '5 mg', 'Tableta', 'Caja x 30 tabletas', 'Lafrancol', 'Antihipertensivos', 9500.00::numeric, 180, true, 'Hipertensión arterial y angina de pecho estable.', 'Shock cardiogénico; estenosis aórtica severa.'),
  ('AP-017', 'Metoprolol Genfar', 'Metoprolol tartrato', '50 mg', 'Tableta', 'Caja x 30 tabletas', 'Genfar', 'Antihipertensivos', 8100.00::numeric, 150, true, 'Hipertensión; angina de pecho; arritmias y post infarto.', 'Bradicardia sinusal; bloqueo AV de segundo o tercer grado; asma grave.'),
  ('AP-018', 'Hidroclorotiazida Genfar', 'Hidroclorotiazida', '25 mg', 'Tableta', 'Caja x 30 tabletas', 'Genfar', 'Antihipertensivos', 5600.00::numeric, 200, true, 'Hipertensión arterial y edema.', 'Anuria; hipersensibilidad a sulfonamidas.'),
  ('AP-019', 'Metformina Genfar', 'Metformina clorhidrato', '850 mg', 'Tableta recubierta', 'Caja x 30 tabletas', 'Genfar', 'Antidiabéticos', 7400.00::numeric, 260, true, 'Diabetes mellitus tipo 2.', 'Insuficiencia renal grave; acidosis metabólica; uso de medios de contraste yodados.'),
  ('AP-020', 'Glucophage XR', 'Metformina clorhidrato', '750 mg', 'Tableta de liberación prolongada', 'Caja x 30 tabletas', 'Merck KGaA', 'Antidiabéticos', 38500.00::numeric, 75, true, 'Diabetes mellitus tipo 2 en adultos.', 'Cetoacidosis diabética; insuficiencia renal (TFG < 30 ml/min).'),
  ('AP-021', 'Januvia', 'Sitagliptina', '100 mg', 'Tableta recubierta', 'Caja x 28 tabletas', 'MSD', 'Antidiabéticos', 198000.00::numeric, 25, true, 'Control glucémico en diabetes mellitus tipo 2.', 'Diabetes tipo 1; cetoacidosis diabética; hipersensibilidad.'),
  ('AP-022', 'Atorvastatina Genfar', 'Atorvastatina cálcica', '20 mg', 'Tableta recubierta', 'Caja x 30 tabletas', 'Genfar', 'Hipolipemiantes', 14800.00::numeric, 190, true, 'Hipercolesterolemia y prevención de eventos cardiovasculares.', 'Enfermedad hepática activa; embarazo y lactancia.'),
  ('AP-023', 'Lipitor', 'Atorvastatina cálcica', '40 mg', 'Tableta recubierta', 'Caja x 30 tabletas', 'Pfizer', 'Hipolipemiantes', 165000.00::numeric, 30, true, 'Hipercolesterolemia primaria y dislipidemia mixta.', 'Enfermedad hepática activa; embarazo.'),
  ('AP-024', 'Rosuvastatina MK', 'Rosuvastatina', '10 mg', 'Tableta recubierta', 'Caja x 30 tabletas', 'Tecnoquímicas', 'Hipolipemiantes', 24500.00::numeric, 110, true, 'Hipercolesterolemia y prevención cardiovascular.', 'Miopatía; enfermedad hepática activa; uso de ciclosporina.'),
  ('AP-025', 'Omeprazol Genfar', 'Omeprazol', '20 mg', 'Cápsula', 'Caja x 30 cápsulas', 'Genfar', 'Gastrointestinales', 8500.00::numeric, 280, false, 'Acidez; reflujo gastroesofágico y úlcera péptica.', 'Hipersensibilidad a benzimidazoles; uso con nelfinavir.'),
  ('AP-026', 'Nexium', 'Esomeprazol', '40 mg', 'Tableta recubierta', 'Caja x 14 tabletas', 'AstraZeneca', 'Gastrointestinales', 89000.00::numeric, 45, true, 'Enfermedad por reflujo gastroesofágico; erradicación de H. pylori.', 'Hipersensibilidad a esomeprazol; uso con nelfinavir.'),
  ('AP-027', 'Loperamida MK', 'Loperamida clorhidrato', '2 mg', 'Tableta', 'Caja x 6 tabletas', 'Tecnoquímicas', 'Gastrointestinales', 6800.00::numeric, 170, false, 'Tratamiento sintomático de la diarrea aguda.', 'Menores de 2 años; colitis ulcerosa aguda; diarrea con sangre.'),
  ('AP-028', 'Alka-Seltzer', 'Ácido acetilsalicílico + bicarbonato de sodio', '324 mg / 1976 mg', 'Tableta efervescente', 'Caja x 12 sobres de 2 tabletas', 'Bayer', 'Gastrointestinales', 15900.00::numeric, 160, false, 'Acidez estomacal y malestar general con dolor de cabeza.', 'Úlcera péptica; hemofilia; dietas restringidas en sodio.'),
  ('AP-029', 'Loratadina Genfar', 'Loratadina', '10 mg', 'Tableta', 'Caja x 10 tabletas', 'Genfar', 'Antihistamínicos', 4500.00::numeric, 300, false, 'Rinitis alérgica y urticaria crónica.', 'Hipersensibilidad a loratadina.'),
  ('AP-030', 'Cetirizina MK', 'Cetirizina diclorhidrato', '10 mg', 'Tableta recubierta', 'Caja x 10 tabletas', 'Tecnoquímicas', 'Antihistamínicos', 5900.00::numeric, 240, false, 'Rinitis alérgica estacional y perenne; urticaria.', 'Insuficiencia renal grave; hipersensibilidad a hidroxicina.'),
  ('AP-031', 'Allegra', 'Fexofenadina clorhidrato', '180 mg', 'Tableta recubierta', 'Caja x 10 tabletas', 'Sanofi', 'Antihistamínicos', 42000.00::numeric, 60, false, 'Rinitis alérgica y urticaria idiopática crónica.', 'Hipersensibilidad a fexofenadina.'),
  ('AP-032', 'Ventolin Inhalador', 'Salbutamol', '100 mcg/dosis', 'Suspensión para inhalación', 'Inhalador x 200 dosis', 'GSK', 'Respiratorios', 18500.00::numeric, 120, true, 'Broncoespasmo en asma y EPOC.', 'Hipersensibilidad al salbutamol; amenaza de aborto.'),
  ('AP-033', 'Seretide Diskus', 'Salmeterol + Fluticasona', '50 mcg / 250 mcg', 'Polvo para inhalación', 'Dispositivo x 60 dosis', 'GSK', 'Respiratorios', 185000.00::numeric, 0, true, 'Tratamiento de mantenimiento del asma y EPOC.', 'Hipersensibilidad a los componentes; no usar en crisis aguda.'),
  ('AP-034', 'Montelukast MK', 'Montelukast sódico', '10 mg', 'Tableta recubierta', 'Caja x 30 tabletas', 'Tecnoquímicas', 'Respiratorios', 32000.00::numeric, 80, true, 'Profilaxis y tratamiento crónico del asma; rinitis alérgica.', 'Hipersensibilidad a montelukast.'),
  ('AP-035', 'Sertralina Genfar', 'Sertralina', '50 mg', 'Tableta recubierta', 'Caja x 30 tabletas', 'Genfar', 'Sistema nervioso central', 18900.00::numeric, 100, true, 'Depresión mayor; trastorno obsesivo compulsivo; trastorno de pánico.', 'Uso concomitante con IMAO o pimozida.'),
  ('AP-036', 'Fluoxetina MK', 'Fluoxetina', '20 mg', 'Cápsula', 'Caja x 28 cápsulas', 'Tecnoquímicas', 'Sistema nervioso central', 11500.00::numeric, 90, true, 'Depresión; bulimia nerviosa; trastorno obsesivo compulsivo.', 'Uso con IMAO; tamoxifeno; tioridazina.'),
  ('AP-037', 'Rivotril', 'Clonazepam', '2 mg', 'Tableta', 'Caja x 30 tabletas', 'Roche', 'Sistema nervioso central', 29500.00::numeric, 35, true, 'Trastornos convulsivos y trastorno de pánico.', 'Insuficiencia respiratoria grave; miastenia gravis; glaucoma de ángulo cerrado.'),
  ('AP-038', 'Escitalopram Lafrancol', 'Escitalopram', '10 mg', 'Tableta recubierta', 'Caja x 30 tabletas', 'Lafrancol', 'Sistema nervioso central', 26000.00::numeric, 70, true, 'Depresión mayor y trastorno de ansiedad generalizada.', 'Prolongación del intervalo QT; uso con IMAO.'),
  ('AP-039', 'Warfarina Lafrancol', 'Warfarina sódica', '5 mg', 'Tableta', 'Caja x 30 tabletas', 'Lafrancol', 'Anticoagulantes', 16500.00::numeric, 55, true, 'Prevención y tratamiento de trombosis venosa y embolia pulmonar.', 'Embarazo; hemorragia activa; cirugía reciente del SNC.'),
  ('AP-040', 'Xarelto', 'Rivaroxabán', '20 mg', 'Tableta recubierta', 'Caja x 28 tabletas', 'Bayer', 'Anticoagulantes', 265000.00::numeric, 3, true, 'Prevención de ACV en fibrilación auricular no valvular; tratamiento de TVP.', 'Sangrado activo clínicamente significativo; hepatopatía con coagulopatía.'),
  ('AP-041', 'Eutirox', 'Levotiroxina sódica', '50 mcg', 'Tableta', 'Caja x 50 tabletas', 'Merck KGaA', 'Hormonas y tiroides', 22500.00::numeric, 140, true, 'Hipotiroidismo y bocio eutiroideo.', 'Tirotoxicosis no tratada; infarto agudo de miocardio.'),
  ('AP-042', 'Prednisona Genfar', 'Prednisona', '5 mg', 'Tableta', 'Caja x 20 tabletas', 'Genfar', 'Hormonas y tiroides', 4800.00::numeric, 160, true, 'Enfermedades inflamatorias; alérgicas y autoinmunes.', 'Infecciones sistémicas no controladas; vacunas de virus vivos.'),
  ('AP-043', 'Centrum Adultos', 'Multivitamínico y minerales', 'N/A', 'Tableta recubierta', 'Frasco x 30 tabletas', 'Haleon (Pfizer)', 'Vitaminas y suplementos', 58000.00::numeric, 90, false, 'Suplemento vitamínico y mineral para adultos.', 'Hipervitaminosis; hipersensibilidad a los componentes.'),
  ('AP-044', 'Redoxon', 'Ácido ascórbico (vitamina C)', '1 g', 'Tableta efervescente', 'Tubo x 10 tabletas', 'Bayer', 'Vitaminas y suplementos', 21000.00::numeric, 200, false, 'Suplemento de vitamina C y apoyo al sistema inmune.', 'Litiasis renal por oxalato; hemocromatosis.'),
  ('AP-045', 'Ácido Fólico Genfar', 'Ácido fólico', '1 mg', 'Tableta', 'Caja x 30 tabletas', 'Genfar', 'Vitaminas y suplementos', 6200.00::numeric, 230, false, 'Prevención de defectos del tubo neural y anemia megaloblástica.', 'Anemia perniciosa no tratada.'),
  ('AP-046', 'Sulfato Ferroso MK', 'Sulfato ferroso', '300 mg', 'Tableta recubierta', 'Caja x 30 tabletas', 'Tecnoquímicas', 'Vitaminas y suplementos', 5400.00::numeric, 190, false, 'Prevención y tratamiento de anemia ferropénica.', 'Hemocromatosis; anemias no ferropénicas.'),
  ('AP-047', 'Clotrimazol Genfar', 'Clotrimazol', '1%', 'Crema tópica', 'Tubo x 20 g', 'Genfar', 'Dermatológicos', 5900.00::numeric, 150, false, 'Infecciones micóticas de la piel (pie de atleta; tiña; candidiasis cutánea).', 'Hipersensibilidad al clotrimazol.'),
  ('AP-048', 'Betametasona MK', 'Betametasona valerato', '0.1%', 'Crema tópica', 'Tubo x 40 g', 'Tecnoquímicas', 'Dermatológicos', 9800.00::numeric, 100, true, 'Dermatitis; eczema y psoriasis.', 'Infecciones cutáneas virales o micóticas no tratadas; rosácea.'),
  ('AP-049', 'Bactroban', 'Mupirocina', '2%', 'Ungüento tópico', 'Tubo x 15 g', 'GSK', 'Dermatológicos', 38000.00::numeric, 50, true, 'Infecciones bacterianas de la piel como impétigo.', 'Hipersensibilidad a mupirocina.'),
  ('AP-050', 'Lantus SoloStar', 'Insulina glargina', '100 UI/ml', 'Solución inyectable', 'Pluma prellenada x 3 ml', 'Sanofi', 'Antidiabéticos', 98000.00::numeric, 20, true, 'Diabetes mellitus que requiere insulina basal.', 'Hipoglucemia; hipersensibilidad a insulina glargina.')
) as v (sku, commercial_name, active_ingredient, concentration, dosage_form, presentation,
        laboratory, category, price, stock, requires_prescription, indications, contraindications)
join write_model.laboratories l on l.name = v.laboratory
join write_model.therapeutic_categories c on c.name = v.category
on conflict (sku) do nothing;

-- 2. READ MODEL (reconstrucción completa de las proyecciones de catálogo) -------
insert into read_model.laboratory_view (id, name, country)
select id, name, country from write_model.laboratories
on conflict (id) do update set name = excluded.name, country = excluded.country;

insert into read_model.category_view (id, name, slug, description, medication_count)
select c.id, c.name, c.slug, c.description, count(m.id)
from write_model.therapeutic_categories c
left join write_model.medications m on m.category_id = c.id
group by c.id
on conflict (id) do update set
  name = excluded.name, slug = excluded.slug,
  description = excluded.description, medication_count = excluded.medication_count;

insert into read_model.medication_catalog
  (id, sku, commercial_name, active_ingredient, concentration, dosage_form, presentation, price,
   stock_available, availability, requires_prescription, laboratory_id, category_id,
   indications, contraindications, search_text, updated_at)
select m.id, m.sku, m.commercial_name, m.active_ingredient, m.concentration, m.dosage_form,
       m.presentation, m.price, m.stock,
       case when m.stock = 0 then 'OUT_OF_STOCK' when m.stock <= 10 then 'LOW_STOCK' else 'IN_STOCK' end,
       m.requires_prescription, m.laboratory_id, m.category_id, m.indications, m.contraindications,
       -- Misma normalización que normalizeSearchText() en el backend.
       translate(lower(concat_ws(' ', m.commercial_name, m.active_ingredient, l.name, c.name, m.sku)),
                 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
       now()
from write_model.medications m
join write_model.laboratories l on l.id = m.laboratory_id
join write_model.therapeutic_categories c on c.id = m.category_id
on conflict (id) do update set
  price = excluded.price, stock_available = excluded.stock_available,
  availability = excluded.availability, search_text = excluded.search_text,
  updated_at = excluded.updated_at;

commit;
