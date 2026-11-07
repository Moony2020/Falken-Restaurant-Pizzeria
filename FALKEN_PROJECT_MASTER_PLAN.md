# Restaurang & Pizzeria Falken — خطة المشروع والقائمة الأولية
**التاريخ:** 21 أكتوبر 2026  
**المصدر:** صور قوائم الطعام التي أرسلها صاحب الطلب وموقع restaurangfalken.se. الأسعار والتهجئة تحتاج اعتماد المطعم قبل الإطلاق.  

> **مرجعية الوثيقة:** الأقسام الأقدم في هذا الملف تمثل الخطة التقنية والأولية عند إنشائها. أما أقسام **«تدقيق تنفيذ لوحة Admin — 5 نوفمبر 2026»** وما بعدها فهي سجل الحالة المعتمد للتنفيذ الفعلي، وتعلو على أي وصف تاريخي متعارض. لا يُحذف التاريخ السابق؛ يُقرأ في سياقه فقط.

## تدقيق تنفيذ لوحة Admin — 5 نوفمبر 2026

**نطاق التدقيق:** فحص ثابت للكود ومسارات API ونماذج MongoDB، مع الاستناد إلى اختبار Admin المحلي الموثق لـ A5. لا يمثل ظهور عنصر في الشريط الجانبي دليلاً بذاته على اكتمال الوظيفة.

| قسم Admin (الاسم السويدي المعتمد) | الحالة | ما هو منفذ فعلاً | ما ليس منفذاً أو ما يزال جزئياً |
| --- | --- | --- | --- |
| **Beställningar** | **FUNCTIONAL PASS — LOCAL** | قراءة وبحث وتفاصيل الطلبات عبر `GET /api/admin/orders`؛ انتقالات الحالة عبر `POST /api/admin/orders/[publicId]/transition`؛ تحصيل الدفع عند الاستلام عبر `POST /api/admin/orders/[publicId]/collect-payment`؛ استخدام نماذج `Order` و`Payment` و`AuditLog` في MongoDB؛ وإشعارات Admin عبر مسارات `/api/admin/notifications`. تم اختبار دورة محلية فعلية: طلب غير مدفوع → تحصيل نقدي → `Betald` → `Uthämtad`. | لا توجد في المستودع اختبارات تكامل معزولة قابلة للتشغيل حالياً لحقن أعطال MongoDB أو اختبار التزامن. تبقى هذه **UNVERIFIED**؛ لا تُسجَّل PASS. |
| **Meny & Produkter** | **FUNCTIONAL PASS — LOCAL (READ-ONLY)** | جدول Admin محمي عبر `GET /api/admin/catalog/products` يعرض منتجات Atlas الحالية، البحث، تصفية الفئة/الحالة، الأسعار حسب الأحجام، والتصفح بالصفحات. | تعديل أو إنشاء أو حذف المنتجات والأسعار والصور ما زال **NOT STARTED**؛ لا توجد عمليات كتابة في هذا المسار. |
| **Kategorier** | **UI-ONLY / NOT STARTED** | نموذج `Category` وقارئ القائمة العامة موجودان. | لا توجد CRUD Admin أو API للتصنيفات؛ القسم يعرض شاشة انتظار غير متصلة بـ MongoDB. |
| **Tillägg & Ingredienser** | **UI-ONLY / NOT STARTED** | نموذج `Modifier` موجود ويُستخدم عند تسعير السلة، وتقرأه القائمة العامة. | لا توجد CRUD Admin أو API للإضافات/المكونات؛ القسم شاشة انتظار فقط. |
| **Fakturor & Kvitton** | **PARTIAL** | يعرض إيصالات/«فواتير» مشتقة في الواجهة من الطلبات المحملة فعلياً، ويفتح تفاصيل الطلب ويستدعي مولد إيصال محلي للطباعة. | إنشاء الفواتير المخصصة موجود في حالة React محلية فقط؛ لا يوجد نموذج MongoDB مستقل للفواتير، ولا API للحفظ أو الإرسال أو دفتر محاسبي. |
| **Betyg & Omdömen** | **UI-ONLY / NOT STARTED** | بطاقة Overview تشير صراحة إلى عدم اتصال Google Reviews. | لا توجد نماذج أو API أو تكامل مراجعات في Admin؛ القسم نفسه شاشة انتظار. |
| **Analyser** | **PARTIAL** | يستدعي Overview الحقيقي `GET /api/admin/overview` المبني على بيانات الطلبات في MongoDB، مع اختيار فترة زمنيّة. | عدة مقاييس وعروض مقارنة/تقييمات في مكوّن `AdminAnalyticsTab` ثابتة أو احتياطية، ولا يوجد مصدر مراجعات حقيقي؛ لا يُعد نظام تحليلات مكتمل. |
| **Öppettider** | **FUNCTIONAL — LOCAL** | يقرأ ويحدّث `RestaurantSettings` عبر `GET/PATCH /api/admin/restaurant/hours`، مع مصادقة Admin وCSRF وقيود كتابة. يدير الموسم وساعات الأيام و`manualOverride` وإعلان المطعم، وينعكس على حالة استقبال الطلبات. | لم يُجر تدقيق قبول مستقل لكل حالة زمنية/موسمية في هذه الجولة. |
| **Användare** | **UI-ONLY / NOT STARTED** | توجد نماذج `StaffUser` و`StaffSession` ومسارات مصادقة Admin. | لا توجد شاشة إدارة موظفين أو CRUD داخل Admin؛ القسم شاشة انتظار. |
| **Inställningar** | **PARTIAL** | تغيير كلمة مرور Admin موجود عبر `POST /api/admin/auth/change-password` داخل اللوحة، إلى جانب تسجيل الدخول/الخروج واستعادة كلمة المرور. | ليست صفحة إعدادات مطعم عامة أو إدارة صلاحيات؛ الوظيفة المتاحة تقتصر عملياً على أمان حساب Admin. |

### أدلة المصدر

- الشريط الجانبي موجود في `src/components/admin/admin-dashboard.tsx`، وعناصر `meny` و`kategorier` و`tillagg` و`omdomen` و`anvandare` تقع في مسار fallback يعلن: `Kommer senare. Den här delen är ännu inte ansluten till restaurangens data.`
- مسارات Admin الموجودة تقتصر على المصادقة، الطلبات، الإشعارات، Overview، ساعات المطعم، ومفتاح استقبال الطلبات. لا توجد مسارات Admin لإدارة المنتجات أو التصنيفات أو الإضافات أو المستخدمين أو المراجعات أو الفواتير المستقلة.
- نماذج MongoDB الحالية تشمل الطلبات/المدفوعات/السجل التدقيقي والموظفين وإعدادات المطعم، إضافة إلى كتالوج المنتجات/التصنيفات/الإضافات. وجود نموذج الكتالوج لا يساوي وجود واجهة إدارة له.
- يوجد اختبار A5 غير متتبع في `tests/db/pay-on-pickup-collection.integration.test.ts`، ويشير أمر `npm test` إلى `tests/**/*.test.ts`. يحتاج الاختبار إلى `MONGODB_URI_TEST` محلي وآمن ومعزول؛ لم ينجح تشغيله في هذه البيئة، ولذلك لا يُعامل كاختبار ناجح.

### حالة A5 — Pay on Pickup Payment Collection

**FUNCTIONAL PASS — LOCAL.** تم التحقق عبر Admin المحلي من تسلسل الدفع النقدي والاستلام، ومن نافذة التأكيد الحديثة: ظهورها، وإغلاق `Avbryt` دون تسجيل تحصيل، مع بقاء الطلب `Obetald` والاستلام معطلاً قبل الدفع. تم تحسين `src/components/admin/admin-order-dialog.tsx` فقط لواجهة التأكيد وسهم قائمة طريقة الدفع؛ لا يغير ذلك منطق الدفع أو قاعدة البيانات. تبقى اختبارات التزامن وحقن فشل MongoDB المعزولة **UNVERIFIED**.

### قرار المرحلة التالية

لا يبدأ A6 تلقائياً. إذا تم اعتماده لاحقاً، يبدأ بـ **Meny & Produkter** وCRUD محمي في Admin للمنتجات والأسعار والتوفر، ثم التصنيفات والإضافات، باستخدام نماذج الكتالوج الحالية دون افتراض أن واجهات الانتظار تعمل.

## A6 — Menu Management: خطة مقترحة للمراجعة فقط

**الحالة:** `IN PROGRESS — A6.1 READ-ONLY UI FUNCTIONAL LOCAL`; الأجزاء القابلة للكتابة من A6 ما زالت `NOT STARTED`.
**حدود التنفيذ المعتمدة:** اقتصر التنفيذ على واجهة قراءة A6.1. لا تغييرات في MongoDB أو المنيو الفعلي، ولا Git، ولا أي مسارات إنشاء/تعديل/حذف قبل اعتماد منفصل.

### الهدف

تحويل أقسام إدارة الكتالوج الظاهرة في Admin إلى وظائف إدارة حقيقية ومحميّة، باستخدام نماذج MongoDB الحالية (`Product` و`Category` و`Modifier`) مع بقاء واجهة العميل وتسعير الطلبات الجديدة متسقين مع البيانات المعتمدة على الخادم.

### A6.1 — Read-only Planning Gate: نتائج الفحص (5 نوفمبر 2026)

**الحالة:** `PASS — READ-ONLY PLANNING`
**العمليات المنفذة:** قراءة المصدر وقراءة Atlas محدودة فقط. لا إعادة بذر، ولا إنشاء/تحديث/حذف مستندات، ولا تعديل كود ضمن هذه البوابة.

#### جرد Atlas الفعلي

- `119` منتجاً في `products`، و`9` تصنيفات في `categories`، و`26` إضافة في `modifiers`.
- المنتجات تستخدم فعلياً `slug` و`nameSv` و`categorySlug` و`active` و`sortOrder` و`image` و`variants` و`modifierSlugs`. التصنيفات تستخدم `slug` و`nameSv` و`removable` و`active` و`sortOrder`. والإضافات تستخدم `slug` و`labelSv` و`groupSlug` و`compatibleCategories` و`maxQty` و`priceByVariantSek` و`priceStatus`.
- السعر ليس حقلاً واحداً للمنتج: كل خيار في `variants` يحمل `id` و`label` و`priceSek` و`available` و`priceStatus`. وتحمل الإضافة سعراً لكل خيار في `priceByVariantSek`.
- التصنيف `dryck` موجود بالفعل في الكتالوج. لا تُعاد استيراد قائمة قديمة ولا تُنشأ منتجات بديلة عند بناء واجهة Admin.

#### مسار البيانات والتسعير الحالي

- `/api/menu` يستدعي `getPublicMenu()` ويقرأ فقط التصنيفات والمنتجات النشطة، والإضافات النشطة ذات `priceStatus: "confirmed"`.
- `POST /api/cart/validate` و`POST /api/orders` يعتمدان على تسعير الخادم. `priceCart()` يرفض المنتج أو التصنيف أو الخيار أو الإضافة غير المتاحة، والسعر غير المؤكد، والإضافة غير المتوافقة؛ لا يعتمد السعر المرسل من المتصفح.
- عند إنشاء الطلب، تحفظ الخدمة لقطات `productNameSnapshot` و`variantNameSnapshot` و`basePriceSek` و`modifiersSnapshot` و`lineTotalSek`. لذلك تبقى الطلبات والإيصالات والمدفوعات التاريخية ثابتة عند تعديل الكتالوج لاحقاً.

#### تصميم A6.1 المقترح — لا يبدأ قبل إذن تنفيذ منفصل

1. بناء واجهة قراءة فقط أولاً في `Meny & Produkter` تعرض المنتجات الحالية كما هي، مع البحث والتصفية حسب `categorySlug` والحالة، دون أي mutation.
2. بعد قبول واجهة القراءة، إضافة مسارات Admin محمية ومتحققة لإدارة **المنتجات الموجودة**. يظل `slug` معرفاً مستقراً في النسخة الأولى؛ لا يعاد توليده ولا يعاد بذر الكتالوج.
3. نموذج التعديل يحافظ على بنية `variants` الحالية ويعرض حالة السعر/التوفر لكل خيار. لا يغير شكل المخطط.
4. الصور في A6.1 تقتصر على مسارات قائمة أو على آلية رفع معتمدة لاحقاً. لا يُضاف رفع ملفات أو خدمة صور ضمن المرحلة من دون قرار مستقل.
5. ربط/تعديل الإضافات لا ينفذ في A6.1؛ يبقى لـ A6.3 بعد قراءة الارتباطات الحالية.

#### خطة اختبار التنفيذ لاحقاً

- أخذ جرد قبل التنفيذ لعدد المنتجات/التصنيفات/الإضافات ومقارنة `slug` لمنع التكرار أو إعادة البذر.
- تعديل تجريبي محدود لمنتج موجود فقط، ثم التحقق في `/meny` و`/api/cart/validate` وطلب جديد.
- التحقق من ثبات طلب وإيصال سابقين بعد تغيير سعر الكتالوج.
- اختبار رفض السعر المرسل من العميل، والخيار المعطل، والسعر غير المؤكد، والإضافة غير المتوافقة.
- تنظيف سجل الاختبار واستعادة القيمة الأصلية قبل إغلاق القبول.

#### A6.1 — واجهة القراءة فقط المنفذة (5 نوفمبر 2026)

**الحالة:** `FUNCTIONAL — LOCAL`.

- استبدلت شاشة الانتظار في `Meny & Produkter` بجدول إداري محمي للمشاهدة فقط.
- يعرض المصدر الحالي من Atlas: العدد الإجمالي، البحث بالاسم أو `slug`، تصفية الفئة والحالة، الأسعار حسب `variants`، توفر الأحجام، والصفحات.
- لا يوجد في هذه الواجهة أو مسارها سوى `GET`؛ لا توجد أزرار أو عمليات لإنشاء أو تعديل أو حذف أي منتج أو سعر أو إضافة.
- تحقق المتصفح المحلي: ظهر `119` منتجاً؛ وأعاد البحث عن `Vesuvio` نتيجة واحدة مع خياري `Normal 110 kr` و`Familj 265 kr` وحالة نشطة.
- لم تُجر أي كتابة إلى Atlas أو MongoDB أثناء هذا التنفيذ.
- تحقق القبول: طلب `GET` بلا مصادقة إلى API من Windows host أعاد `401`. تصفية `Dryck` مع `Aktiv` أعادت `16` منتجاً، وانتقل التصفح من الصفحة `1/6` إلى `2/6`؛ لا تظهر الاستجابة إلا `slug` و`nameSv` و`categorySlug` و`active` و`variants`، وأسماء الفئات اللازمة للعرض.
- بوابات الجودة: `node node_modules/typescript/bin/tsc --noEmit --pretty false` أنهى بـ `exit 0`، وESLint المركّز على ملفات A6.1 أنهى بـ `exit 0`. لم يُشغّل build أو اختبار Mongo المعزول لأنهما خارج نطاق واجهة القراءة فقط.

#### A6.1 — Product Editing: بوابة التخطيط (5 نوفمبر 2026)

**الحالة:** `PLANNED — NOT STARTED`. هذه الخطة ليست إذناً بإضافة مسار كتابة أو تغيير Atlas.

##### النطاق المقترح والحدود

- يعدّل هذا الجزء منتجات موجودة فقط، ويستهدف حقول `nameSv` و`descriptionSv` و`active` و`sortOrder` ومرجع `image` وخيارات `variants` القائمة (`label` و`priceSek` و`available` و`priceStatus`).
- يبقى `slug` ثابتاً ولا يقبل من جسم الطلب، كما يبقى `categorySlug` ثابتاً في هذه المرحلة. نقل التصنيف أو إنشاء منتج أو حذفه أو رفع صورة أو تغيير `modifierSlugs` خارج النطاق.
- لا يتغير تسعير الطلبات التاريخية: تستمر `priceCart()` في أخذ السعر من الكتالوج للطلبات الجديدة فقط، بينما تبقى `productNameSnapshot` و`variantNameSnapshot` و`basePriceSek` و`modifiersSnapshot` و`lineTotalSek` المخزنة سابقاً دون تعديل.

##### تصميم API المقترح

1. إضافة مسار تفصيلي محمي، مثل `GET /api/admin/catalog/products/[slug]` لبيانات نموذج التعديل و`PATCH /api/admin/catalog/products/[slug]` للحقول المسموح بها فقط. لا يضاف `POST` أو `DELETE` في هذه المرحلة.
2. يتطلب `PATCH` جلسة Admin صالحة، ثم تفويضاً صريحاً لدور `ADMIN` قبل أي كتابة؛ لا يكفي ظهور واجهة Admin. ويستخدم `verifyAdminCsrf()` و`guardWrite()` وطلب JSON محدود الحجم.
3. يعتمد الجسم مخطط Zod صارماً بلا مفاتيح مجهولة: نص سويدي مقصوص وغير فارغ للاسم، وصف اختياري محدود، `sortOrder` صحيح محدود، رابط/مرجع صورة مطابق لسياسة المصادر المعتمدة، وحالات Boolean/enum المعلنة فقط.
4. كل `variant` يحتفظ بـ `id` الموجود نفسه ولا يقبل إعادة توليده؛ يجب أن يبقى خيار واحد على الأقل، وأن تكون المعرفات فريدة، وأن يكون `priceSek` للحجم القابل للبيع مبلغ SEK صحيحاً ضمن `1..10,000`، وأن تكون `priceStatus` إما `confirmed` أو `needs_review`.
5. يعيد `GET` و`PATCH` قيمة مراجعة صريحة (`revision` مبنية على نسخة المستند ووقت التحديث). يرسل النموذج `expectedRevision`، ويستخدم التحديث شرط النسخة نفسه؛ تعارض النسخة يعيد `409 stale_product` مع إعادة تحميل آمنة بدلاً من الكتابة فوق تعديل موظف آخر.
6. يقبل `PATCH` مفتاح عملية فريداً (`idempotencyKey`) ويستخدم معرّف المنتج في سجل التدقيق. يعاد نفس النجاح للمحاولة المتكررة، ولا يُنشأ سجل تعديل ثانٍ.
7. ينجز تحديث المنتج و`AuditLog` معاً في MongoDB transaction/session واحدة وبـ write concern مناسب. إذا فشل سجل التدقيق، تفشل المعاملة ولا يبقى تعديل منتج جزئي. يسجل التدقيق حقولاً قبل/بعد مختصرة وخالية من الأسرار، وموظف التعديل والتوقيت ومعرّف العملية فقط.

##### سلوك واجهة Admin المقترح

- يظهر زر `Redigera` لكل صف في صفحة القراءة الحالية؛ يفتح حواراً/لوحة جانبية متسقة مع تصميم Admin، ولا يغيّر شيئاً قبل زر حفظ صريح.
- يعرض النموذج اسم المنتج، وصفه، صورة مرجعية، حالة المنتج وترتيبه، وجدول الأحجام الحالية. يظهر لكل حجم الاسم والسعر والتوفر وحالة السعر، مع تحقق فوري مفهوم بالسويدية.
- يميز السعر `needs_review` بوضوح: يظل المنتج قابلاً للتحرير لكن هذا الحجم لا يصبح قابلاً للطلب حتى حالة `confirmed`، وفق محرك التسعير الحالي.
- عند وجود تعديل خارجي أو فشل حفظ، لا يغلق النموذج ولا يحذف إدخال الموظف؛ يعرض خيار تحديث البيانات ومقارنة الحقول المتعارضة. عند النجاح يعاد تحميل الصف وتظهر رسالة نجاح غير مزعجة.
- لا يظهر زر `Lägg till produkt` ولا حذف ولا نقل تصنيف ولا رفع ملف في هذا الجزء.

##### خطة الاختبار والقبول

1. إنشاء لقطة قراءة قبل الاختبار للمنتج المختار، وعدد منتجات/تصنيفات/إضافات، مع تحديد قيمة الاستعادة مسبقاً.
2. اختبار غير موثق (`401`)، وموثق بلا CSRF أو Origin غير مطابق (`403`)، ودور ليس `ADMIN` (`403`)، ومخطط غير صالح أو SEK كسري/سالب أو `variant id` مكرر (`400/422` بحسب عقد API).
3. تعديل اصطناعي واحد لمنتج قائم: الاسم/الوصف/الترتيب وتوفر وحالة/سعر حجم قائم. ثم التحقق من API وAdmin و`/meny` و`POST /api/cart/validate` لطلب جديد فقط.
4. إثبات أن طلباً وإيصالاً محفوظين قبل التعديل لم تتغير لقطاتهما أو مبالغهما، مع منع إنشاء طلب حقيقي أو دفع مباشر.
5. اختبار تعارض نافذتين باستخدام `expectedRevision`، وإعادة إرسال نفس `idempotencyKey`، والتحقق من سجل AuditLog واحد والتراجع الذري عند فشل التدقيق في بيئة محلية معزولة فقط.
6. استعادة كل قيم منتج الاختبار كما كانت، وإزالة سجلات الاختبار التابعة فقط، ثم مقارنة الجرد الأساسي. لا تستخدم Atlas إلا بتفويض تشغيل منفصل.
7. تشغيل typecheck وESLint والاختبارات المستهدفة وproduction build بعد التنفيذ، وتسجيل exit codes الفعلية.

##### قرارات تنفيذية معتمدة للتخطيط (5 نوفمبر 2026)

**الحالة:** `PLANNING APPROVED — IMPLEMENTATION NOT STARTED`. تثبت النقاط التالية عقد التنفيذ القادم، لكنها لا تمنح إذناً بكتابة كود أو بيانات.

1. يملك دور `ADMIN` وحده تعديل معلومات المنتج أو السعر في هذه المرحلة؛ جلسة Admin صالحة لدور آخر لا تكفي.
2. يبقى `slug` و`categorySlug` غير قابلين للتعديل؛ لا يقبلان من جسم `PATCH` ولا تظهر لهما عناصر تحرير في الواجهة.
3. تعدّل الأحجام الموجودة فقط: تحفظ `variant.id` وترتيب `variants` وجميع الحقول غير المسموح بها كما هي، وتطبق الخدمة allowlist على الحقول المعتمدة بدلاً من استبدال مستند المنتج أو المصفوفة كاملة.
4. يكون `priceSek` للحجم القابل للبيع عدداً صحيحاً منتهياً ضمن `1..10,000 SEK`. هذا الحد مبدئي وقابل للمراجعة عند ظهور نوع منتج مشروع يحتاج أكثر من ذلك.
5. يرفض الخادم حفظ قيمة `0` أو سالبة أو كسرية أو غير رقمية للحجم القابل للبيع، برسالة التحقق السويدية: `Priset måste vara större än 0 kr`. لا يستخدم السعر صفرًا بديلاً عن التعطيل؛ تعطيل المنتج يكون بـ `active: false` وتعطيل حجم معين يكون بـ `available: false`.
6. يسمح بتعديل مرجع صورة معتمد وموجود فقط؛ لا رفع ملفات ولا خدمة صور ولا نطاقات خارجية جديدة في A6.1.
7. تستخدم الكتابة `expectedRevision` للتحقق المتفائل، وتعطي `409 stale_product` عندما تكون نسخة المنتج قد تغيرت عند موظف آخر.
8. يرسل العميل `Idempotency-Key` فريداً لكل حفظ؛ يعيد الخادم النتيجة الناجحة نفسها لإعادة الإرسال المطابقة، ولا ينشئ AuditLog مكرراً.
9. يجري تحديث `Product` وكتابة `AuditLog` في MongoDB transaction/session واحدة؛ فشل التدقيق يلغي تحديث المنتج بالكامل.
10. تبقى لقطات الطلبات التاريخية والإيصالات وأدلة الدفع دون تعديل، ولا تستهدفها أي عملية A6.1.
11. تبقى تغييرات التصنيف والإضافات وإنشاء المنتج وحذفه وإنشاء/حذف حجم جديد خارج نطاق هذا الجزء.

##### متطلبات يجب التحقق منها عند التنفيذ فقط

- تأكيد شكل `revision` الدقيق ومدى `Idempotency-Key` في عقد API واختبارات التكرار.
- إعداد MongoDB محلي معزول لاختبار تعارض النسخ، وإعادة التشغيل، وفشل `AuditLog` والـ rollback، قبل اعتبار هذه الحالات PASS.

##### فحص الكتالوج الحالي قبل التنفيذ (5 نوفمبر 2026، قراءة فقط)

- فحص Atlas جمع `184` حجماً: `163` بحالة `confirmed` و`21` بحالة `needs_review`.
- لا توجد أسعار `0` أو سالبة أو كسرية في الأحجام الحالية؛ جميع الأسعار المخزنة موجبة وصحيحة بالـ SEK.
- الأحجام ذات `needs_review` ليست دليلاً على خطأ سعري بحد ذاتها؛ محرك التسعير الحالي لا يسمح بطلب سعر غير مؤكد. عند تعديل الاسم أو الوصف أو الترتيب فقط، تحفظ خدمة التعديل هذه الأحجام كما هي ولا تؤكدها أو تعطّلها أو تغير سعرها تلقائياً.
- إذا اختار `ADMIN` تعديل حقل سعر لحجم قائم، يطبق عليه حد `1..10,000` وقاعدة التوفر/التأكيد في العقد النهائي. لا ينبغي أن يفشل تعديل حقل غير سعري لمجرد وجود حالة قديمة غير مؤكدة متروكة دون تغيير.

##### A6.1 — Product Editing: تنفيذ الكود المحلي (5 نوفمبر 2026)

**الحالة:** `IMPLEMENTED — LOCAL CODE; RUNTIME ACCEPTANCE PENDING`.

- أضيفت خدمة تحرير محلية ومسار `GET/PATCH` تفصيلي للمنتج، مع جلسة Admin، دور `ADMIN`، CSRF، same-origin، rate limit، تحقق Zod، revision، idempotency، وtransaction تربط تعديل المنتج بـ AuditLog.
- أضيف زر `Redigera` وحوار تعديل للحقول والحجوم القائمة. لا يسمح المسار بإنشاء أو حذف منتجات أو أحجام أو تصنيفات أو إضافات.
- لم يُرسل أي `PATCH` إلى Atlas ضمن بوابة التنفيذ، ولم تتغير منتجات أو أسعار أو توفر في Atlas.
- **UNVERIFIED:** TypeScript وESLint بعد هذا التعديل، rollback/AuditLog/idempotency/concurrency، وحفظ واجهة Admin. يلزم تشغيلها في بوابة قبول منفصلة مع منتج Atlas اصطناعي وخطة استعادة معتمدة.

##### A6.1 — Local Quality & UI Acceptance (5 نوفمبر 2026)

**الحالة:** `FAIL — REMEDIATION REQUIRED BEFORE WRITE ACCEPTANCE`.

- لم يكتمل TypeScript بعد أكثر من 90 ثانية حتى عند تشغيله مباشرة عبر Node مع `--incremental false`؛ أوقف دون exit code صالح، ولذلك يبقى `UNVERIFIED`.
- ESLint الموجّه كشف خطأ فعلياً في `src/server/admin-product-editing.ts`: `@typescript-eslint/no-explicit-any` عند مساعد تحويل المنتج؛ لذلك بوابة ESLint `FAIL`.
- لم يُرسل PATCH ولم تجر أي كتابة إلى Atlas. فحص الحفظ الفعلي والمعاملة والتراجع يبقى `UNVERIFIED`.
- مراجعة أمنية ثابتة: PATCH يطلب جلسة Admin ودور `ADMIN` وCSRF وsame-origin وrate-limit؛ الجسم Zod strict ويمنع `slug` و`categorySlug` والـ variants الجديدة؛ التحديث يعتمد `__v` للتعارض وينفذ Product وAuditLog داخل transaction.
- **عيب مانع:** Idempotency-Key يعيد النتيجة نفسها لأي طلب يحمل المفتاح، لكنه لا يربط المفتاح ببصمة payload؛ يجب رفض إعادة استخدام المفتاح مع payload مختلف، لا إعادة تشغيله كنجاح.
- **عيب مانع:** العميل يولد `crypto.randomUUID()` داخل كل محاولة حفظ؛ إذا أعاد الموظف المحاولة بعد فشل شبكة، لا يعيد استعمال المفتاح نفسه. يجب إنشاء المفتاح عند فتح/بدء عملية الحفظ والاحتفاظ به حتى تنتهي العملية.
- **عيب نطاق:** حقل `image` يقبل أي string حالياً؛ يجب قصره على مرجع الصورة الحالي أو على مرجع مثبت أنه موجود ضمن كتالوج معتمد قبل قبول الحفظ.
- **عيب واجهة:** تظهر `priceStatus` لكنها ليست قابلة للتعديل من النموذج؛ يلزم إما إضافتها ضمن allowlist UI أو إخراجها رسمياً من نطاق هذه الزيادة.
- لم يُنفذ اختبار Chrome للحوار بعد اكتشاف عيوب الجودة؛ لا يجوز اعتبار فتح/إلغاء/رسائل السعر PASS قبل إصلاح ESLint والعيوب المانعة.

### A6.1 — Meny & Produkter

**النطاق المقترح:**

- عرض المنتجات من MongoDB داخل Admin مع البحث والتصفية حسب التصنيف والحالة.
- إنشاء وتعديل وتعطيل المنتجات، بما في ذلك الاسم السويدي، الوصف، الصورة، المكونات، مسببات الحساسية، الأحجام/الخيارات، السعر، الترتيب والتوفر.
- عدم حذف منتج له طلبات تاريخية؛ التعطيل (`active: false`) هو السلوك الافتراضي الآمن.
- حماية جميع مسارات الكتابة بمصادقة Admin وCSRF والتحقق من المخطط وقيود الأسعار الصحيحة بالـ SEK.

**معيار القبول:** المنتج أو السعر أو التوفر المعدّل يظهر في `/meny`، ولا يمكن إضافته للسلة أو تسعيره على الخادم إلا وفق حالة الكتالوج الجديدة.

### A6.2 — Kategorier

**النطاق المقترح:**

- إدارة اسم التصنيف ووصفه وحالته وترتيب عرضه.
- إنشاء تصنيف جديد وتعديل التصنيفات القابلة للإدارة.
- منع حذف أو إعادة تعيين تصنيف ما زالت منتجات نشطة مرتبطة به، إلا عبر مسار نقل واضح ومراجع.

**معيار القبول:** ترتيب التصنيفات وحالتها في Admin يطابقان `/meny`، وتبقى المنتجات مرتبطة بتصنيف صالح.

### A6.3 — Tillägg & Ingredienser

**النطاق المقترح:**

- إدارة الإضافات المدفوعة، المجموعة، سعر كل خيار/حجم، الحد الأقصى للكمية، التوافق مع التصنيفات والحالة.
- إدارة المكونات المعروضة للعميل كبيانات منتج، من دون تحويلها تلقائياً إلى إضافات مدفوعة.
- ربط الإضافات بالمنتجات مع منع مراجع `modifierSlugs` المعطلة أو غير الموجودة.

**معيار القبول:** الإضافة المسموح بها فقط تظهر مع المنتج المتوافق، ويحسبها الخادم في الطلبات الجديدة بالسعر الحالي المعتمد.

### A6.4 — Integration & Acceptance

**النطاق المقترح:**

- اختبار Admin و`/meny` والسلة وإنشاء طلب جديد لكل نوع من تغييرات الكتالوج.
- التحقق من أن التحقق والتسعير في الخادم يرفضان المنتج/الخيار غير المتاح أو السعر المرسل من العميل إن خالف الكتالوج.
- التحقق من أن لقطات عناصر الطلب (`items` و`lineTotalSek`) تحفظ قيمة الطلب وقت إنشائه ولا تتغير عند تعديل المنيو لاحقاً.
- تشغيل typecheck وESLint والاختبارات ذات الصلة وproduction build، مع تقرير PASS / FAIL / UNVERIFIED.

### قواعد أمان A6

- لا يغيّر تعديل أسعار أو إضافات الكتالوج أسعار الطلبات التاريخية أو إيصالاتها أو سجلات الدفع.
- لا حذف جماعي للكتالوج أو التصنيفات أو الإضافات؛ أي حذف مادي يتطلب موافقة منفصلة وتحققاً من الارتباطات.
- لا تخمين لأسماء المنتجات أو أسعارها أو صورها؛ تستخدم بيانات المطعم المعتمدة فقط.
- لا Stripe أو Swish أو تطوير POS ضمن A6.
- كل تنفيذ لاحق يبدأ بتحديد سجلات الاختبار وخطة استعادة قابلة للتحقق قبل أي كتابة في Atlas.
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
