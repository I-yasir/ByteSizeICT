-- PRODUCTION bootstrap (docs/RUNBOOK.md §4). Run ONCE on a fresh production database after migrations.

-- Contains only reference data: the ICT subject/chapters/topics, placeholder plans and default settings.

-- No students, admins, questions, exams, payment numbers or testimonials: those are entered in the admin panel.

-- Derived from supabase/seed.sql (local/dev); never run seed.sql against production.

begin;

insert into public.subjects (id, slug, name_bn, name_en) values ('a0000000-0000-4000-8000-000000000100', 'ict', 'তথ্য ও যোগাযোগ প্রযুক্তি', 'ICT');

insert into public.chapters (id, subject_id, number, name_bn, name_en, sort_order) values
  ('a0000000-0000-4000-8000-000000000201', 'a0000000-0000-4000-8000-000000000100', 1, 'তথ্য ও যোগাযোগ প্রযুক্তি: বিশ্ব ও বাংলাদেশ প্রেক্ষিত', 'ICT: World and Bangladesh Perspective', 1),
  ('a0000000-0000-4000-8000-000000000202', 'a0000000-0000-4000-8000-000000000100', 2, 'কমিউনিকেশন সিস্টেমস ও নেটওয়ার্কিং', 'Communication Systems and Networking', 2),
  ('a0000000-0000-4000-8000-000000000203', 'a0000000-0000-4000-8000-000000000100', 3, 'সংখ্যা পদ্ধতি ও ডিজিটাল ডিভাইস', 'Number Systems and Digital Devices', 3),
  ('a0000000-0000-4000-8000-000000000204', 'a0000000-0000-4000-8000-000000000100', 4, 'ওয়েব ডিজাইন পরিচিতি এবং HTML', 'Introduction to Web Design and HTML', 4),
  ('a0000000-0000-4000-8000-000000000205', 'a0000000-0000-4000-8000-000000000100', 5, 'প্রোগ্রামিং ভাষা', 'Programming Language', 5),
  ('a0000000-0000-4000-8000-000000000206', 'a0000000-0000-4000-8000-000000000100', 6, 'ডেটাবেজ ম্যানেজমেন্ট সিস্টেম', 'Database Management System', 6);

insert into public.topics (id, chapter_id, name_bn, name_en) values
  ('a0000000-0000-4000-8000-000000000301', 'a0000000-0000-4000-8000-000000000201', 'বিশ্বগ্রাম', 'Global Village'),
  ('a0000000-0000-4000-8000-000000000302', 'a0000000-0000-4000-8000-000000000201', 'উদীয়মান প্রযুক্তি', 'Emerging Technologies'),
  ('a0000000-0000-4000-8000-000000000303', 'a0000000-0000-4000-8000-000000000202', 'ডেটা ট্রান্সমিশন', 'Data Transmission'),
  ('a0000000-0000-4000-8000-000000000304', 'a0000000-0000-4000-8000-000000000202', 'নেটওয়ার্ক টপোলজি', 'Network Topology'),
  ('a0000000-0000-4000-8000-000000000305', 'a0000000-0000-4000-8000-000000000203', 'বাইনারি রূপান্তর', 'Binary Conversion'),
  ('a0000000-0000-4000-8000-000000000306', 'a0000000-0000-4000-8000-000000000203', 'লজিক গেট', 'Logic Gates'),
  ('a0000000-0000-4000-8000-000000000307', 'a0000000-0000-4000-8000-000000000203', 'বুলিয়ান অ্যালজেব্রা', 'Boolean Algebra'),
  ('a0000000-0000-4000-8000-000000000308', 'a0000000-0000-4000-8000-000000000204', 'HTML ট্যাগ', 'HTML Tags'),
  ('a0000000-0000-4000-8000-000000000309', 'a0000000-0000-4000-8000-000000000205', 'C প্রোগ্রামিং', 'C Programming'),
  ('a0000000-0000-4000-8000-00000000030a', 'a0000000-0000-4000-8000-000000000205', 'অ্যালগরিদম ও ফ্লোচার্ট', 'Algorithm and Flowchart'),
  ('a0000000-0000-4000-8000-00000000030b', 'a0000000-0000-4000-8000-000000000206', 'SQL', 'SQL'),
  ('a0000000-0000-4000-8000-00000000030c', 'a0000000-0000-4000-8000-000000000206', 'রিলেশনাল ডেটাবেজ', 'Relational Database');

insert into public.plans (id, code, name_bn, name_en, duration_days, fixed_expires_at, price_bdt, features, is_highlighted, sort_order) values
  ('a0000000-0000-4000-8000-000000000501', '1-month', '১ মাস', '1 Month', 30, null, 500, '[{"bn": "প্রতিদিন পরীক্ষা", "en": "Daily exams"}, {"bn": "সাথে সাথে ফলাফল", "en": "Instant results"}, {"bn": "ব্যাখ্যাসহ সমাধান", "en": "Solutions with explanations"}]', false, 1),
  ('a0000000-0000-4000-8000-000000000502', '3-months', '৩ মাস', '3 Months', 90, null, 1200, '[{"bn": "প্রতিদিন পরীক্ষা", "en": "Daily exams"}, {"bn": "সাথে সাথে ফলাফল", "en": "Instant results"}, {"bn": "ব্যাখ্যাসহ সমাধান", "en": "Solutions with explanations"}, {"bn": "র‍্যাংক ও অগ্রগতি", "en": "Rank and progress"}]', true, 2),
  ('a0000000-0000-4000-8000-000000000503', 'full-course', 'পূর্ণ কোর্স', 'Full Course', null, '2027-06-30 23:59:59+06', 2500, '[{"bn": "প্রতিদিন পরীক্ষা", "en": "Daily exams"}, {"bn": "সাথে সাথে ফলাফল", "en": "Instant results"}, {"bn": "ব্যাখ্যাসহ সমাধান", "en": "Solutions with explanations"}, {"bn": "পুরো সিলেবাস", "en": "Full syllabus"}]', false, 3);

insert into public.app_settings (key, value, is_public) values
  ('brand', '{"name": "ByteSizeICT", "logoPath": null}'::jsonb, true),
  ('contact', '{"whatsapp": "https://wa.me/8801XXXXXXXXX", "messenger": null, "phone": null, "email": null}'::jsonb, true),
  ('homepage', '{"heroTitle": null, "heroSubtitle": null, "testimonials": [], "topPerformers": []}'::jsonb, true),
  ('faq', '[{"q": {"bn": "কীভাবে পেমেন্ট করব?", "en": "How do I pay?"}, "a": {"bn": "bKash/Nagad/Rocket-এ টাকা পাঠিয়ে ভর্তি ফর্মে TrxID দিন।", "en": "Send money via bKash/Nagad/Rocket and enter the TrxID in the enrollment form."}}, {"q": {"bn": "লগইন তথ্য কখন পাব?", "en": "When do I get my login details?"}, "a": {"bn": "পেমেন্ট যাচাইয়ের পর ইমেইলে পাঠানো হবে, সাধারণত 12 ঘণ্টার মধ্যে।", "en": "By email after we verify your payment, usually within 12 hours."}}, {"q": {"bn": "পরীক্ষা মিস করলে কী হবে?", "en": "What if I miss an exam?"}, "a": {"bn": "অনেক পরীক্ষা নির্দিষ্ট সময় পর্যন্ত পরে দেওয়া যায়।", "en": "Many exams stay open for late attempts for a while."}}, {"q": {"bn": "কোন ডিভাইসে পরীক্ষা দেওয়া যাবে?", "en": "Which devices can I use?"}, "a": {"bn": "যেকোনো মোবাইল বা কম্পিউটারের ব্রাউজারে।", "en": "Any phone or computer browser."}}]'::jsonb, true),
  ('auth', '{"maxDevices": 1}'::jsonb, false),
  ('results', '{"visibleWhenInactive": true}'::jsonb, false);

commit;

