# Restaurang & Pizzeria Falken — خطة المشروع والقائمة الأولية
**التاريخ:** 21 أكتوبر 2026  
**المصدر:** صور قوائم الطعام التي أرسلها صاحب الطلب وموقع restaurangfalken.se. الأسعار والتهجئة تحتاج اعتماد المطعم قبل الإطلاق.  
**النطاق:** طلب واستلام من المطعم (Pickup / Avhämtning) فقط؛ لا توصيل.

## 1. الهدف
إعادة بناء موقع سويدي احترافي وسريع ومتجاوب لمطعم Falken في Vintrosa، يعرض الصور، المنيو والمكونات والأسعار، يسمح بتخصيص الطعام والدفع الآمن ثم استلام الطلب من المطعم. يفضّل استخدام الهوية المستوحاة من الصقر، الأسود الفحمي/العاجي/الأحمر الدافئ، وليس نسخ ملف المنيو القديم بصرياً.

## 2. الصفحات العامة (أربع صفحات فقط)
1. `/` **Hem**: هيرو بصورة طعام حقيقية؛ عرض «Beställ för avhämtning»، أنواع الأطباق، الأكثر طلباً، وجبة الغداء، أوقات العمل، الموقع وتقييمات اختيارية.
2. `/meny` **Meny & Beställ**: تبويبات Pizza / Kebabpizza / Kebab / Hamburgare / Sallader / À la carte / Barnmeny / Lunch / Dryck؛ بطاقات مأكولات مع وصف/سعر وصورة؛ إضافة وتخصيص في نافذة جانبية مع سلة ثابتة وإتمام الطلب على هيئة خطوات داخل نفس الصفحة، دون صفحات عامة كثيرة.
3. `/galleri` **Galleri**: المطعم من الداخل والخارج، الطعام، أجواء المكان؛ شبكة صور قابلة للتكبير، وإدارة سهلة من لوحة الأدمن.
4. `/kontakt` **Kontakt**: عنوان، هاتف، بريد، خرائط، أوقات شتاء/صيف، أسئلة متكررة، نموذج تواصل اختياري.

**مسارات تشغيلية تقنية لا تُحسب صفحات تسويقية:** `/order/success?session_id=...`، `/order/[publicId]` لتتبع حالة الطلب، `/admin/*` محمية.

## 3. مسار الطلب
العميل يختار صنفاً → يختار عادية `Normal` أو عائلية `Familj` حيث تتوفر → يراجع المكونات → يحذف/يضيف إضافات → يختار العدد والملاحظات → سلة تعرض إجمالي لحظي → يحدد اسمه وهاتفه ووقت الاستلام المتاح → يدفع بـ Stripe (بطاقة) → يعود إلى تأكيد برقم الطلب → لوحة المطبخ تستقبل الطلب بعد تأكيد الدفع بخادم آمن → الحالات `PAID → ACCEPTED → PREPARING → READY_FOR_PICKUP → PICKED_UP`، مع `CANCELLED / REFUNDED` المسموح بها. يمنع تسجيل طلب مدفوع اعتماداً على صفحة النجاح فقط؛ استخدم Webhooks والتحقق من توقيعها وidempotency.

## 4. المنيو: بيانات مستخرجة من الصور
**مفتاح:** السعر بالأرقام هو **SEK**. `N/F` = عادية/عائلية. حيث ورد في المنيو «Tomatsås, ost ingår i alla pizzor» تضاف صلصة الطماطم والجبن تلقائياً للبيتزا التقليدية؛ الأصناف الحديثة التي تذكر `Husets tomatsås, mozzarella` تُحفظ بهذه الصيغة. يوجد تعارض في صور القوائم لبعض الأسعار، خصوصاً المجموعة 3؛ لا ننشر قبل اعتماد نسخة واحدة.

### Pizza — Klass 1 | N 110 / F 265
1. **Vesuvio** — skinka.
2. **Calzone (inbakad)** — skinka. *(حجم العائلية للصنف المغلق يحتاج تأكيداً)*
3. **Bolognese** — köttfärs.
4. **Margherita** — tomat, ost.

### Pizza — Klass 2 | N 120 / F 275
5. **Capricosa** — skinka, champinjoner.
6. **La Busola** — skinka, räkor.
7. **Bari** — skinka, tonfisk.
8. **Marinara** — musslor, räkor.
9. **Calzone Special (inbakad)** — skinka, räkor.
10. **La Mafia** — bacon, lök.
11. **Cacciatora** — pepperoni salami.
12. **Romana** — räkor, champinjoner.
13. **Hawaii** — skinka, ananas.
14. **Disco** — skinka, köttfärs.
15. **Malo** — tonfisk, räkor.
16. **Chiquita** — skinka, banan, curry.
17. **Palermo** — ananas, banan, curry.
18. **Mrs Lindberg** — bacon, lök, champinjoner, vitlöksolja.

### Pizza — Klass 3 | N 130 / F 285 (تحتاج تأكيد؛ صورة أخرى تذكر 125 للعادية)
19. **Vegetariana** — paprika, champinjoner, lök, oliver, ananas.
20. **Jamaica** — skinka, räkor, champinjoner.
21. **Amigo** — köttfärs, champinjoner, lök, paprika.
22. **Campino** — skinka, räkor, ananas.
23. **Bambino** — skinka, champinjoner, ananas.
24. **Favoriten** — bacon, champinjoner, ägg.
25. **Frutti del Mare** — musslor, tonfisk, räkor.
26. **Prima** — skinka, tonfisk, räkor.
27. **Garpen Special** — pepperoni salami, lök, paprika.
28. **Quattro Stagioni** — skinka, räkor, musslor, champinjoner, oliver.
29. **Padrino** — musslor, räkor, oliver, paprika.

### Lyxpizzor | N 135 / F 310
30. **Chami** — fläskfilé, lök, champinjoner, ananas, bearnaisesås.
31. **Santbar** — fläskfilé, köttfärs, champinjoner, bearnaisesås.
32. **Sorella** — skinka, fläskfilé, lök, bearnaisesås.
33. **Vintrosa (halvinbakad)** — fläskfilé, räkor, sparris, bearnaisesås.
34. **Hidinge (halvinbakad)** — fläskfilé, lök, färska tomater, bearnaisesås, pepperoni.
35. **Latorp** — fläskfilé, färska tomater, sparris, bearnaisesås.
36. **Napoli** — mozzarella, skinka, oliver, tomat, sparris, paprika.
37. **Falken Special (halvinbakad)** — pepperoni salami, köttfärs, räkor, champinjoner.
38. **Ingela (halvinbakad)** — skinka, gorgonzola, crème fraîche.
39. **Kycklingpizza** — kyckling, banan, champinjoner, curry, bearnaisesås.
40. **Mexicana** — tacomix, köttfärs, lök, jalapeño, tacosås, cayennepeppar.
41. **Azteka** — tacomix, skinka, jalapeño, tacosås, cayennepeppar.

### Pizza — Klass 4 | N 140 / F 325
42. **Alcapulco** — tacomix, fläskfilé, tacosås, jalapeño, lök, champinjoner.
43. **San Fransisco** — fläskfilé, lök, färska tomater, gorgonzola, bearnaisesås.
44. **Garphyttan** — fläskfilé, sparris, paprika, champinjoner, bearnaisesås.
45. **Empratori** — kebabkött, köttfärs, lök, curry, pepperoni, bacon, dressing.
46. **Gondola (halvinbakad)** — kebabkött, champinjoner, paprika, räkor, dressing, pepperoni.
47. **Peter Pan** — skinka, fläskfilé, räkor, champinjoner, färska tomater, bearnaisesås.
48. **Viking (inbakad)** — kebabkött, isbergssallad, färska tomater, gurka, lök, pepperoni, kebabsås.

### Pizza — Klass 5 | N 150 / F 345
49. **Lanna Special** — fläskfilé, räkor, paprika, färska tomater, strips, bearnaisesås.
50. **Quattro Formaggi** — husets tomatsås, mozzarella, gorgonzola, hyvlad parmesan, ruccola.
51. **Alla Diavola** — husets tomatsås, mozzarella, pepperoni salami, färsk chili, grillad paprika, vitlök, pinjenötter.
52. **Ala Vegetariano** — husets tomatsås, mozzarella, fetaost, paprika, tomat, ruccola, hyvlad parmesan.

### Premium Pizza | N 170 / F 380
53. **Italiano De Mare** — husets tomatsås, mozzarella, blåmusslor, räkor, scampi, kammusslor, ruccola, vitlök.
54. **La Oxfilé Pizza** — husets tomatsås, oxfilé, mozzarella, grillad paprika, lök, färska tomater, ruccola, bearnaisesås.
55. **Mezza Luna** — husets tomatsås, mozzarella, fetaost, parmaskinka, ruccola.
56. **Charbello** — husets tomatsås, parmaskinka, mozzarella, soltorkade tomater, pinjenötter, ruccola.

### Kebabpizza — أسعار فردية
57. **Kebabpizza** — N 125 / F 285 — kebabkött, champinjoner, lök, pepperoni, sås.
58. **Kebabpizza Hawaii** — N 130 / F 310 — kebabkött, lök, ananas, pepperoni, gurka, tomat, isbergssallad, sås.
59. **Kebabpizza Special** — N 130 / F 310 — kebabkött, lök, paprika, pepperoni, gurka, tomat, isbergssallad, sås.
60. **Kebabpizza Super** — N 150 / F 350 — kebabkött, champinjoner, isbergssallad, gurka, tomat, lök, sås, pommes, pepperoni.

### Pizza — Klass 6 | N 145 / F 340 *تحقق من إتاحة حجم العائلة للصنف المغلق*
61. **Grekisk Pizza** — mozzarella, oliver, fetaost, sallad, lök, tomat, soltorkade tomater, ruccola, tzatziki.
62. **Lucas Special (inbakad)** — fläskfilé, champinjoner, lök, vitlöksolja. *(الصورة المختصرة تعرض 140؛ تعارض يستلزم تأكيداً)*

### Pizza — Klass 7 | N 155 / F 350
63. **David Special** — skinka, fläskfilé, oxfilé, champinjoner, bearnaisesås.
64. **Båt Pizza** — skinka, oxfilé, champinjoner, bearnaisesås, pommes.
65. **Kevins Special** — oxfilé, bacon, ägg, lök, cayennepeppar.

### Pizza — Klass 8 | N 160 / F 370
66. **Chris Special** — skinka, fläskfilé, oxfilé, kebabkött, champinjoner, bearnaisesås, kebabsås.
67. **ÖSK** — oxfilé, mozzarella, gorgonzola, paprika, champinjoner.

### Kebab, gyros och kyckling
**تكوين مشترك حسب القائمة:** kebabkött, lök, isbergssallad, tomat, pepperoni, sås؛ يمكن اختيار نوع البروتين nötkött / gyros / kyckling حسب تأكيد المطعم، وليست المكونات نفسها بالضرورة لكل نوع. تحقق من محتويات falafel.
68. **Kebab med Bröd** — 115.
69. **Kebabtallrik** — 125.
70. **Kebabrulle** — 125.
71. **Megarulle med strips** — 130.
72. **Falafelrulle** — 125.
73. **Falafeltallrik** — 125.
74. **Kyckling med Bröd** — 115.
75. **Kycklingrulle** — 125.
76. **Kycklingtallrik** — 125.
77. **Salladsrulle** — 125 — ost, skinka, räkor, grönsaker (تحتاج مراجعة للحساسية الغذائية).

### Hamburgare
78. **90 g med bröd** — 90.
79. **90 g med bröd och pommes** — 105.
80. **150 g med bröd** — 100.
81. **150 g med bröd och pommes** — 115.

### Sallader | 125 لكل صنف
**قاعدة السلطة حسب القائمة:** isbergssallad, tomat, gurka, bröd, majs, dressing.
82. **Amerikansksallad** — ost, skinka, ananas.
83. **Tonfisksallad** — tonfisk, ost, oliver, rödlök.
84. **Räksallad** — ost, räkor, svamp.
85. **Kycklingsallad** — svamp, rödlök, kyckling.
86. **Kebabsallad** — kebabkött, kebabsås, rödlök.
87. **Gyrossallad** — gyroskött, kebabsås, rödlök.
88. **Grekisksallad** — oliver, fetaost, grönsaker, rödlök.

### Barnmeny | 90 لكل صنف
89. **Fläskfilé på spett** — fläskfilé, pommes, grönsallad, bearnaisesås.
90. **Kycklingfilé på spett** — kycklingfilé, pommes, grönsallad, tzatziki.
91. **Pannkaka** — jordgubbssylt, grädde.

### Nachotallrik | 130
**Nachotallrik** — majschipsgratäng med tacokött, ost, sallad, crème fraîche.

### À la carte
- **Filetto à la Gorgonzola** — 259 — grillad oxfilé, ruccolasallad, pommes, gorgonzolasås.
- **Filé Mignon** — 259 — grillad oxfilé och fläskfilé, ruccolasallad, grillade/kalla grönsaker, rödvinssås, bearnaisesås.
- **Filé Oscar** — 169 — grillad fläskfilé, ruccolasallad, räkor, grillade/kalla grönsaker, bearnaisesås, pommes.
- **Pollo à la Falken** — 169 — grillad kyckling på spett, ruccolasallad, tzatziki, pommes.
- **Pepparstek** — 259 — grillad oxfilé, ruccolasallad, pepparsås.
- **Rödspätta** — 169 — kalla grönsaker, kokt potatis eller pommes, remouladsås.
- **Schnitzel** — 169 — kalla grönsaker, stekt potatis eller pommes, bearnaisesås.
- **Oxfilé på planka** — 259 — grillad oxfilé, ruccolasallad, grillade/kalla grönsaker, bearnaisesås, rödvinssås.
- **Salmone Delicata** — 169 — grillad lax på ruccolasallad, remouladsås, kokt potatis.
- **Mixspett** — 169 — grillad kyckling och fläskfilé på spett, ruccolasallad, tzatziki, bearnaisesås, pommes.
- **Fläskfilé på planka** — 199 — grillad fläskfilé, ruccolasallad, grillade/kalla grönsaker, bearnaisesås, rödvinssås.

### Dagens Lunch | 115 (حسب الصورة؛ يحتاج تأكيد السعر الحالي)
**الإثنين–الجمعة 11:00–14:00:** Pizza 1–29، Black and White (fläskfilé, pommes, bearnaise, rödvinssås)، Schnitzel (pommes, bearnaisesås)، Mixspett، Rödspätta، Kebabtallrik (gyros أو nötkött)، Kycklingtallrik، Sallader، Hamburgare؛ يوم الثلاثاء أيضاً raggmunk med fläsk وفق إعلان القائمة. في السعر: kaffe, bröd, smör, pizzasallad och dricka بحسب الإعلان. **يحتاج صاحب المطعم تأكيد أي بدائل/استثناءات يومية.**

### Glutenfri
**Glutenfri pizzadeg** — +30 على سعر البيتزا. لا تضع علامة gluten-free certified أو خلو من التلوث التبادلي من دون تأكيد إجراءات المطبخ.

### Dryck — قائمة تحتاج توثيق واعتماد
الصور المرفقة لا تتضمن أسعار المشروبات غير الكحولية أو أصناف العصائر بالتفصيل. يبدأ النظام بتصنيفات **Läsk**, **Vatten**, **Juice**, **Kaffe/Te** ويضيف صاحب المطعم الأصناف والأحجام والأسعار الحقيقية من لوحة التحكم قبل النشر. ملف PDF قديم منشور على الموقع يتضمن بعض المشروبات الكحولية، ولكن الأسعار منه **ليست موثوقة كقائمة بيع محدثة**، كما يلزم التأكد من متطلبات الترخيص/التحقق من العمر وما إذا كان بيع الكحول للاستلام مسموحاً. **استبعد الكحول من مسار الطلب الإلكتروني إلى حين مراجعة قانونية مستقلة.**

## 5. التخصيص — تصميم السعر
- `basePrice` بحسب الصنف والحجم؛ خيارات single-select للحجم (Normal / Familj)، الصلصة، البروتين عندما يسمح المطعم.
- `removedIngredients[]` = إزالة مجانية عموماً؛ لا تُرجع فرق سعر تلقائياً إلا إن قرر المطعم.
- `extras[]` = إعدادات قابلة للضبط حسب **العنصر + الحجم**. أمثلة: extra ost, champinjoner, lök, tomat, paprika, räkor, kebabkött, pommes, jalapeño, bearnaisesås.
- **لا نخترع أسعار إضافات**: يحددها الأدمن، مثال حسابي توضيحي فقط `Pizza normal 120 + extra ost (20 افتراضياً للتوضيح) + champinjoner (15 افتراضياً) = 155`، لا ينشر مثال 20/15 كأسعار فعلية.
- اختيار `quantity`، تعليمات للمطبخ، إعلام حساسيات؛ تحسب الأسعار على الخادم من Product + Variant + Modifier IDs ونسخ Snapshot في الطلب؛ ممنوع الاعتماد على السعر المرسل من المتصفح.
- سياسة allergener وingredienser تفصيلية تعتمد وتراجع من المطعم؛ مكونات مثل الطماطم/الجبن الافتراضية لا تغني عن ملفات الحساسية.

## 6. لوحة الأدمن
Dashboard (sales / orders / average ticket)؛ Live Orders مع رنين وطباعة إيصال إن توفر دعم الطابعة؛ تعديل/إيقاف أصناف أو أحجام؛ إدارة pricing & extras؛ إدارة ساعات العمل والوقت الأدنى للتحضير والاستلام والضغط التشغيلي؛ إدارة صور Gallery/hero؛ عروض lunch؛ إدارة العملاء بلا كشف معلومات الدفع؛ استردادات Refunds بصلاحيات محددة؛ تقارير CSV؛ صلاحيات Owner/Admin/Staff؛ سجلات تدقيق؛ تعطيل قبول الطلبات فورياً عند إغلاق المطعم.

## 7. البنية التقنية
- **Frontend & backend:** Next.js (App Router) + TypeScript + Tailwind CSS؛ API Route Handlers / Server Actions لمعظم وظائف التطبيق، لا حاجة لExpress منفصل في MVP إلا لسبب تشغيلي واضح.
- **DB:** MongoDB Atlas عبر Mongoose؛ Collections: `categories`, `products`, `modifierGroups`, `orders`, `payments`, `openingHours`, `specialClosures`, `pickupSlots`, `admins`, `galleryImages`, `auditLogs`, `siteSettings`, `promotions`.
- **Auth:** حسابات موظفين محمية؛ العميل يطلب كضيف (guest checkout) أولاً.
- **Payments:** Stripe Checkout/Card؛ حفظ transaction IDs، تحقق Webhooks، Refund workflow؛ لا تُخزن بيانات البطاقة محلياً.
- **Assets:** Cloudinary أو تخزين صور محسن؛ Next/Image وresponsive WebP/AVIF.
- **Infrastructure:** Vercel أو Render للويب، Atlas للبيانات، مراقبة أخطاء وسجلات ونسخ احتياطية وSecrets منفصلة لكل بيئة.
- **Quality/Security:** Zod، rate limiting، input sanitization، CSRF where applicable، webhook signature verification، audit logging، GDPR privacy policy/cookies حسب الاستخدام، اختبارات basket/tax/checkout/time windows/idempotency.

## 8. نموذج بيانات مختصر
```ts
Product { id, menuNumber, slug, nameSv, descriptionSv, ingredients: IngredientRef[], allergens: string[], categoryId, variants: [{id,label,priceSek,available}], modifierGroupIds: string[], image, active }
Modifier { id, labelSv, priceByVariantSek: Record<string,number>, maxQty, compatibleCategories }
Order { publicId, items:[{productId, productNameSnapshot, variantId, variantNameSnapshot, basePriceSek, modifiersSnapshot, quantity, lineTotalSek}], subtotalSek, discountSek, totalSek, pickupAt, contact, paymentProvider, paymentStatus, fulfillmentStatus, createdAt }
```
العملة `SEK` والقيم بوحدات أصغر أو أعداد صحيحة بدقة مناسبة، ومفاتيح الطلب `idempotencyKey` لتجنب التكرار.

## 9. المراحل والاعتماد
1. **التحقق من المصدر:** صاحب المطعم يعتمد كل اسم ومكون وسعر، خصوصاً Klass 3 / Lucas / الأسعار القديمة، ساعات الصيف والشتاء وتاريخ بدء كل فترة؛ تصوير المشروبات والأطباق.
2. **UX/UI:** تصميم سطح المكتب والموبايل: Homepage / Menu+Customizer / Cart+Checkout / Gallery / Kontakt / Admin؛ اعتماد هوية وألوان وصور.
3. **Foundation:** Repo, Next.js+TS, Atlas, schemas, env, roles, deploy staging, import menu data.
4. **Catalog & Order:** menu filtering, variants, modifiers, cart, pickup slots, guest checkout, server-side price calculation.
5. **Payments:** Stripe test + signed webhooks + refunds + acceptance tests. يظهر Swish كخيار واجهة معطّل فقط إلى أن يُعتمد تكامله لاحقاً.
6. **Admin & Kitchen:** order queue, product availability, schedules, pricing, media, manual reconciliation.
7. **Security & QA:** e2e desktop/mobile, accessibility, Swedish text, SEO LocalBusiness, performance, GDPR, staging payment and timeout tests.
8. **Launch:** owner sign-off, DNS, production secrets, backups, live payment test, 2-week stabilization and monitoring.

### معايير القبول قبل الإطلاق
- جميع الأصناف الـ91 + Nachos + À la carte + Lunch + Drinks المعتمدة موجودة ويمكن تصفحها وتصفيتها.
- نفس السعر يظهر في البطاقة، النافذة، السلة، Stripe، والإيصال بعد حساب الإضافات.
- لا ينجح دفع مزيف، ولا يكرر webhook الطلب، ولا تتاح أوقات استلام خارج الخدمة أو بعد انتهاء فترة إعداد الطعام.
- يعمل زر «Beställ nu» خلال ≤3 نقرات لفتح خيار الأكل، مع تجربة موبايل واضحة، وعدم الحاجة لإنشاء حساب.
- يمكن لموظف إيقاف الطلبات، تعديل الأسعار، وتحديث حالة الطلب دون مطوّر.

## 10. معلومات التواصل الرسمية المدخلة
- **Restaurang & Pizzeria Falken**, Skolgatan 4, 719 30 Vintrosa, Sweden.
- **Telefon:** 019 29 48 98
- **E-post:** djan_ibrahim@hotmail.com
- **Öppettider vinter:** Mån–Tor 11–21, Fre 11–22, Lör 12–22, Sön 12–21.
- **Öppettider sommar:** Mån–Fre 11–22, Lör–Sön 12–22.
- أوقات صيف/شتاء ومواعيد آخر قبول للطلبات وفترات الإغلاق الاستثنائي بحاجة ضبط إداري.

## 11. نقاط قرار مهمة للمالك
المنيو الحالي ليست نسخة أسعار نهائية موحدة؛ أسعار المشروبات، أسعار الإضافات والحجم العائلي لبعض الأصناف المغلقة، الضرائب/الإيصالات، سياسة الإلغاء والاسترداد، مدة تجهيز الطلب، والصور الفوتوغرافية تحتاج توثيق قبل تفعيل الطلبات الحقيقية.
